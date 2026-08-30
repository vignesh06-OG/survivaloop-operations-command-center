/**
 * SurvivaLoop — task lifecycle service.
 *
 * Encapsulates the task state machine, capacity reservation/release, SLA
 * workflow and assignment. Every transition is validated server-side against
 * TASK_TRANSITIONS, authorization is checked, and an audit row is appended.
 */
import type { Repo, DbRow } from "@/data/repo";
import POLICY from "@/domain/policy";
import { makeCapacitySnapshot } from "./decision-service";
import { checkCapacity } from "@/domain/capacity";
import {
  TASK_TRANSITIONS,
  canTransition,
  InvalidTransitionError,
} from "@/domain/task-state";
import { computeSlaState, createSla } from "@/domain/sla";
import { canActOnTask, canAccessTask, roleHas, type Capability } from "@/domain/permissions";
import type { DecisionResult, EntityRef, HierarchyLevel, Role, TaskState } from "@/domain/types";
import { newId } from "@/domain/audit";
import type { Clock } from "./decision-service";
import type { SessionUser } from "./auth";

export class PermissionDeniedError extends Error {
  readonly userId: string;
  constructor(userId: string, message: string) {
    super(message ?? "Permission denied.");
    this.name = "PermissionDeniedError";
    this.userId = userId;
  }
}

/** Thrown when a concurrent actor already transitioned the task state. */
export class ConcurrentTransitionError extends Error {
  readonly taskId: string;
  constructor(taskId: string, from: string, to: string) {
    super(`Task ${taskId} was already transitioned out of '${from}' by a concurrent actor (wanted ${from} → ${to}).`);
    this.name = "ConcurrentTransitionError";
    this.taskId = taskId;
  }
}

/** Thrown when capacity is insufficient AT COMMIT time (may differ from decision time). */
export class CapacityUnavailableError extends Error {
  constructor(reason: string, decision: string) {
    super(`Capacity is insufficient to commit an "${decision}" intervention: ${reason}`);
    this.name = "CapacityUnavailableError";
  }
}

export interface CommitInput {
  decision: DecisionResult;
  /** The real decisions row id (not a synthetic label) — enables traceability + dedup. */
  decisionId: string;
  orgId: string;
  assignedWorkerIds: string[];
  intervention: DbRow;
  actor: SessionUser;
}

export class TaskService {
  constructor(private repo: Repo, private now: Clock = () => Date.now()) {}

  /* ---------------------------------- create / commit ---------------------------------- */
  /**
   * Commits an intervention: creates the task in COMMITTED, reserves capacity,
   * starts the SLA, and audits.
   */
  commit(input: CommitInput): DbRow {
    const t = this.now();
    const { decision, decisionId, orgId, intervention, assignedWorkerIds, actor } = input;
    if (!decision.capacity?.feasible && decision.decision === "ACT") {
      throw new Error("Refusing to commit: capacity check was not feasible.");
    }

    this.assertTrue(actor.role, "create_task");
    this.assertTrue(actor.role, "dispatch_task");

    // Idempotency: committing the SAME decision must not create two tasks.
    const existing = this.repo.findTaskByDecision(orgId, decisionId);
    if (existing) return existing;

    const sla = decision.slaHours ? createSla(t, t, decision.slaHours) : null;
    const entity = decision.entity;
    const site = this.repo.getEntityLocation(entity.level, entity.id);

    const requirement = requirementOf(intervention);

    let taskId: string;
    // BEGIN IMMEDIATE: serialises concurrent commit writes so the feasibility
    // re-check below and the task insert are atomic, and the capacity derived
    // from live task rows reflects any task the competing writer just inserted.
    this.repo.txImmediate(() => {
      // Re-check idempotency inside the transaction.
      const dup = this.repo.findTaskByDecision(orgId, decisionId);
      if (dup) { taskId = dup.id as string; return; }

      // Re-check CAPACITY at commit time (it may have changed since the decision).
      const snapshot = makeCapacitySnapshot(orgId, this.repo, t);
      const check = checkCapacity(requirement, snapshot);
      if (!check.feasible) {
        throw new CapacityUnavailableError(check.reason.join(" "), actOrState(decision));
      }

      taskId = newId();
      this.repo.createTask({
        id: taskId,
        org_id: orgId,
        entity_level: entity.level,
        entity_id: entity.id,
        state: "COMMITTED",
        intervention_class_id: intervention.id,
        decision_id: decisionId,
        lat: site?.lat ?? null,
        lng: site?.lng ?? null,
        created_at: t,
        committed_at: t,
        sla_created_at: sla?.createdAt ?? null,
        sla_committed_at: sla?.committedAt ?? null,
        sla_deadline: sla?.deadline ?? null,
        sla_state: sla ? "NORMAL" : "NORMAL",
        assigned_worker_ids_json: JSON.stringify(assignedWorkerIds),
        simulated: orgIsSimulated(orgId, this.repo) ? 1 : 0,
      });
      this.repo.createSlaEvent({
        id: newId(),
        task_id: taskId,
        from_state: null,
        to_state: "COMMITTED",
        at: t,
        action: "COMMIT",
      });
      this.repo.appendAudit(this.audit(orgId, actor, "TASK_COMMITTED", "TASK", taskId,
        null, "COMMITTED", `decision=${decision.ruleId}`, { workers: assignedWorkerIds.length }));
    });

    return this.repo.getTask(taskId!)!;
  }

  /** Create a task in PROPOSED (not yet committed) from a decision; no capacity reserved. */
  propose(input: CommitInput): DbRow {
    const t = this.now();
    this.assertTrue(input.actor.role, "create_task");
    const existing = this.repo.findTaskByDecision(input.orgId, input.decisionId);
    if (existing) return existing;
    const id = newId();
    const entity = input.decision.entity;
    this.repo.createTask({
      id,
      org_id: input.orgId,
      entity_level: entity.level,
      entity_id: entity.id,
      state: "PROPOSED",
      intervention_class_id: input.intervention.id,
      decision_id: input.decisionId,
      lat: null,
      lng: null,
      created_at: t,
      sla_state: "NORMAL",
      assigned_worker_ids_json: JSON.stringify(input.assignedWorkerIds),
      simulated: orgIsSimulated(input.orgId, this.repo) ? 1 : 0,
    });
    this.repo.appendAudit(this.audit(input.orgId, input.actor, "TASK_PROPOSED", "TASK", id, null, "PROPOSED", null, {}));
    return this.repo.getTask(id)!;
  }

  /* ---------------------------------- transitions ---------------------------------- */
  /**
   * Generic, server-validated transition. Returns updated task row.
   * authorization: caller must pass an actor; FIELD_WORKER must be assigned.
   */
  transition(taskId: string, to: TaskState, actor: SessionUser, reason?: string): DbRow {
    const t = this.now();
    const task = this.repo.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);
    this.assertOrgMembership(actor.orgId, task.org_id as string, taskId);

    // Server-side authorization gate.
    const assigned = JSON.parse(task.assigned_worker_ids_json as string) as string[];
    if (!canActOnTask(actor.role, assigned, actor.id)) {
      throw new PermissionDeniedError(actor.id, "You are not an assigned worker on this task.");
    }

    // Determined role capability required for this transition.
    this.assertTrue(actor.role, transitionCapability(to));

    const from = task.state as TaskState;
    if (from === to) return task;
    if (!canTransition(from, to)) {
      throw new InvalidTransitionError(from, to, `Invalid transition ${from} → ${to}.`);
    }

    const fields = transitionTimestamps(from, to, t);
    const nowState = computeSlaState(slaSpecOf(task), t, POLICY);

    // Optimistic compare-and-set inside the transaction: if two actors both
    // read the same `from` and race to transition, only ONE wins the state
    // predicate, so we never double-apply (e.g. two accepts, or a completed
    // task being re-completed). The audit row is written only by the winner.
    this.repo.tx(() => {
      const applied = this.repo.compareAndSetTaskState(taskId, from, to, fields);
      if (!applied) {
        throw new ConcurrentTransitionError(taskId, from, to);
      }
      if (nowState !== task.sla_state) {
        this.repo.updateTaskFields(taskId, { sla_state: nowState });
        this.repo.createSlaEvent({ id: newId(), task_id: taskId, from_state: task.sla_state as string, to_state: nowState, at: t, action: "AUTO_SLA" });
      }
      this.repo.createSlaEvent({ id: newId(), task_id: taskId, from_state: from, to_state: to, at: t, action: "TRANSITION" + (reason ? `:${reason}` : "") });
      this.repo.appendAudit(this.audit(task.org_id as string, actor, "TASK_TRANSITION", "TASK", taskId, from, to, reason ?? null, {}));

      // Release reserved capacity once work is DONE (COMPLETED) or the task is
      // abandoned (CANCELLED / EXPIRED / REJECTED). A still-executing or
      // dispatched task keeps its reservation so the engine never over-plans.
      if (["COMPLETED", "CANCELLED", "EXPIRED", "REJECTED"].includes(to)) {
      }
    });

    return this.repo.getTask(taskId)!;
  }

  /** Convenience: assign/dispatch to a set of workers. */
  dispatch(taskId: string, workerIds: string[], actor: SessionUser): DbRow {
    const t = this.now();
    const task = this.repo.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);
    this.assertOrgMembership(actor.orgId, task.org_id as string, taskId);
    const from = task.state as TaskState;
    if (!canTransition(from, "DISPATCHED")) {
      throw new InvalidTransitionError(from, "DISPATCHED");
    }
    this.assertTrue(actor.role, "dispatch_task");
    this.repo.tx(() => {
      const applied = this.repo.compareAndSetTaskState(taskId, from, "DISPATCHED", {
        dispatched_at: t,
        assigned_worker_ids_json: JSON.stringify(workerIds),
      });
      if (!applied) throw new ConcurrentTransitionError(taskId, from, "DISPATCHED");
      this.repo.createSlaEvent({ id: newId(), task_id: taskId, from_state: from, to_state: "DISPATCHED", at: t, action: "DISPATCH" });
      this.repo.appendAudit(this.audit(task.org_id as string, actor, "TASK_DISPATCHED", "TASK", taskId, from, "DISPATCHED", null, { workers: workerIds }));
    });
    return this.repo.getTask(taskId)!;
  }

  /* ---------------------------------- SLA workflow ---------------------------------- */
  /**
   * Deterministic SLA sweep over the org. Recomputes derived SLA states and
   * performs the workflow trigger (audit + snapshot event).
   *
   * Idempotent: re-running is safe — it only operates on tasks still in a live
   * lifecycle state and whose SLA has actually crossed a boundary since last run.
   *
   * Race-safe: the derived SLA state is written with a guarded compare-and-set
   * (won't overwrite a concurrent writer), and an EXPIRED escalation only
   * transitions the task state with a compare-and-set, so it never clobbers a
   * user who has already accept/complete/verify the task on another device.
   *
   * Auditable: every change produces an SLA event and an audit row (actor=SYSTEM).
   *
   * This is the contract a production scheduler/cron invokes; `/api/sla/sweep`
   * is the same code exposed as a manual fallback.
   */
  sweepSla(orgId: string): { task: DbRow; from: string; to: string }[] {
    const t = this.now();
    const liveStates = ["COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "PROOF_SUBMITTED"];
    const tasks = this.repo.listTasks(orgId).filter((r) => liveStates.includes(r.state as string) && r.sla_deadline != null);
    const moved: { task: DbRow; from: string; to: string }[] = [];

    for (const task of tasks) {
      const prevSla = task.sla_state as string;
      const nowState = computeSlaState(slaSpecOf(task), t, POLICY);
      if (nowState === prevSla) continue;

      // Guarded write of the derived SLA state.
      const appliedSla = this.repo.compareAndSetSlaState(task.id as string, prevSla, nowState);
      if (!appliedSla) continue; // a concurrent actor moved it; drop this iteration
      this.repo.createSlaEvent({ id: newId(), task_id: task.id as string, from_state: prevSla, to_state: nowState, at: t, action: "SWEEP" });
      this.repo.appendAudit(this.audit(orgId, null as any, "SLA_SWEEP", "TASK", task.id as string, prevSla, nowState, "scheduler", {}));

      // Expired → deterministic escalation. Guarded so we don't clobber a task a
      // user just advanced (e.g. they accepted/completed on another device).
      if (nowState === "EXPIRED") {
        const escalated = this.repo.compareAndSetTaskState(task.id as string, task.state as string, "EXPIRED", {});
        if (escalated) {
          this.repo.createSlaEvent({ id: newId(), task_id: task.id as string, from_state: task.state as string, to_state: "EXPIRED", at: t, action: "ESCALATE" });
          this.repo.appendAudit(this.audit(orgId, null as any, "TASK_EXPIRED_ESCALATED", "TASK", task.id as string, task.state as string, "EXPIRED", "SLA expiry triggered deterministic escalation.", {}));
        } else {
          this.repo.createSlaEvent({ id: newId(), task_id: task.id as string, from_state: nowState, to_state: nowState, at: t, action: "SWEEP_SKIPPED_CONCURRENT" });
        }
      }
      moved.push({ task: this.repo.getTask(task.id as string)!, from: prevSla, to: nowState });
    }
    return moved;
  }

  /* ---------------------------------- capacity ---------------------------------- */
  // NOTE: capacity is now DERIVED from live task rows (repo.activeCommitments) via
  // decision-service.makeCapacitySnapshot. Nothing here mutates a counter any more;
  // reserving = inserting a task in a reserving state; releasing = the task leaving
  // that state. Feasibility is re-checked transactionally in commit().
  /* ---------------------------------- authorization helpers ---------------------------------- */
  private assertTrue(role: Role, cap: Capability): void {
    if (!roleHas(role, cap)) throw new PermissionDeniedError("", `Role '${role}' lacks '${cap}'.`);
  }
  /** Cross-department isolation: a user may only act on resources in their own org. */
  private assertOrgMembership(actorOrgId: string, resourceOrgId: string, resourceId: string): void {
    if (actorOrgId !== resourceOrgId) {
      throw new PermissionDeniedError("", `Resource '${resourceId}' does not belong to your organisation.`);
    }
  }
  private audit(orgId: string, actor: SessionUser | null, action: string, entityType: string, entityId: string, previous: string | null, next: string | null, reason: string | null, meta: Record<string, unknown>): DbRow {
    return {
      id: newId(),
      org_id: orgId,
      actor_id: actor?.id ?? null,
      actor_role: actor?.role ?? "SYSTEM",
      action,
      entity_type: entityType,
      entity_id: entityId,
      previous_state: previous,
      new_state: next,
      reason,
      metadata_json: JSON.stringify(meta),
      at: this.now(),
    };
  }
}

/** rollup helper for repo needs */
export function decisionRuleId(d: DecisionResult): string {
  return d.ruleId + "_" + d.decision;
}

function transitionTimestamps(from: TaskState, to: TaskState, t: number): { [k: string]: number } {
  const m: { [k: string]: number } = {};
  if (to === "COMMITTED") m.committed_at = t;
  if (to === "DISPATCHED") m.dispatched_at = t;
  if (to === "ACCEPTED") m.accepted_at = t;
  if (to === "IN_PROGRESS") m.started_at = t;
  if (to === "COMPLETED") m.completed_at = t;
  if (to === "PROOF_SUBMITTED") m.proof_submitted_at = t;
  if (to === "VERIFIED") m.verified_at = t;
  void from;
  return m;
}

function transitionCapability(to: TaskState): Capability {
  switch (to) {
    case "COMMITTED": case "DISPATCHED": return "dispatch_task";
    case "ACCEPTED": case "IN_PROGRESS": case "COMPLETED": return "complete_task";
    case "PROOF_SUBMITTED": return "submit_proof";
    case "VERIFIED": case "REJECTED": return "review_proof";
    default: return "dispatch_task";
  }
}

function requirementOf(iv: DbRow): import("@/domain/types").CapacityRequirement {
  return {
    workerHours: iv.req_worker_hours as number,
    waterUnits: iv.req_water_units as number,
    vehicle: iv.req_vehicle === 1,
    workers: iv.req_workers as number,
  };
}
function actOrState(d: DecisionResult): string {
  return d.decision;
}

function slaSpecOf(task: DbRow) {
  return {
    createdAt: (task.sla_created_at as number) ?? (task.created_at as number),
    committedAt: (task.sla_committed_at as number) ?? (task.committed_at as number) ?? (task.created_at as number),
    deadline: task.sla_deadline as number,
    executionAt: (task.started_at as number | null) ?? null,
    completionAt: (task.completed_at as number | null) ?? null,
    verificationAt: (task.verified_at as number | null) ?? null,
  };
}

function orgIsSimulated(orgId: string, repo: Repo): boolean {
  const org = repo.getOrg(orgId);
  return org?.data_mode === "SIMULATED";
}

export { slaSpecOf };
export type { DbRow };
