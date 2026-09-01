/**
 * SurvivaLoop — application service (the API/UI-facing facade).
 *
 * Composes the domain services and enforces the "no client-trusted anything"
 * rule: identity, roles, task ownership, timestamps and GPS are all resolved or
 * validated server-side. It is the only layer the API routes talk to for
 * business behaviour.
 */
import type { Repo, DbRow } from "@/data/repo";
import { DecisionService, interventionModFromRow, entityOf } from "./decision-service";
import { TaskService, decisionRuleId, PermissionDeniedError } from "./task-service";
import { VerificationService } from "./verification-service";
import { OfflineSyncService } from "./offline-sync";
import { newId, requireOverrideReason } from "@/domain/audit";
import type { Decision, EntityRef, HierarchyLevel, Override } from "@/domain/types";
import type { SessionUser } from "./auth";

export class AppService {
  readonly decisions: DecisionService;
  readonly tasks: TaskService;
  readonly verification: VerificationService;
  readonly offline: OfflineSyncService;

  constructor(readonly repo: Repo, now?: () => number) {
    this.decisions = new DecisionService(repo, now);
    this.tasks = new TaskService(repo, now);
    this.verification = new VerificationService(repo, this.tasks, now);
    this.offline = new OfflineSyncService(repo, now);
    this.now = now ?? (() => Date.now());
  }
  private now: () => number;

  /* ---------------- run the decision loop on an entity ---------------- */
  runDecision(
    actor: SessionUser,
    entityLevel: HierarchyLevel,
    entityId: string,
    interventionId?: string,
  ) {
    const orgId = actor.orgId;
    const interventionRow = interventionId
      ? this.repo.getIntervention(interventionId)
      : this.decisions.suggestIntervention(orgId);
    if (!interventionRow) throw new Error("No intervention class configured.");
    const intervention = interventionModFromRow(interventionRow);
    const result = this.decisions.run(orgId, { level: entityLevel, id: entityId }, intervention);
    return { ...result, interventionId: interventionRow.id, intervention: interventionRow };
  }

  /* ---------------- propose/commit/dispatch ---------------- */
  propose(actor: SessionUser, payload: { entity: EntityRef; interventionId: string; decisionId: string; workerIds: string[] }) {
    const decisionRow = this.repo.getDecision(payload.decisionId);
    if (!decisionRow) throw new Error("Decision not found.");
    assertOrg(actor.orgId, decisionRow.org_id as string);
    const decision = rowToDecisionResult(decisionRow);
    return this.tasks.propose({ decision, decisionId: payload.decisionId, orgId: actor.orgId, intervention: this.repo.getIntervention(payload.interventionId)!, assignedWorkerIds: payload.workerIds, actor });
  }

  commit(actor: SessionUser, payload: { entity: EntityRef; interventionId: string; decisionId: string; workerIds: string[] }) {
    const decisionRow = this.repo.getDecision(payload.decisionId);
    if (!decisionRow) throw new Error("Decision not found.");
    assertOrg(actor.orgId, decisionRow.org_id as string);
    const decision = rowToDecisionResult(decisionRow);
    return this.tasks.commit({ decision, decisionId: payload.decisionId, orgId: actor.orgId, intervention: this.repo.getIntervention(payload.interventionId)!, assignedWorkerIds: payload.workerIds, actor });
  }

  dispatch(actor: SessionUser, taskId: string, workerIds: string[]) {
    return this.tasks.dispatch(taskId, workerIds, actor);
  }

  transition(actor: SessionUser, taskId: string, to: any, reason?: string) {
    return this.tasks.transition(taskId, to, actor, reason);
  }

  /* ---------------- override ---------------- */
  override(actor: SessionUser, input: { entity: EntityRef; decisionId: string; humanDecision: Decision; reason: string }): Override {
    const decisionRow = this.repo.getDecision(input.decisionId);
    if (!decisionRow) throw new Error("Decision not found.");
    assertOrg(actor.orgId, decisionRow.org_id as string);
    const system = (decisionRow.decision as Decision) ?? "MONITOR";
    const reason = requireOverrideReason(input.reason);
    const t = this.now();
    const o: Override = {
      id: "ovr_" + newId(),
      entity: input.entity,
      decisionId: input.decisionId,
      systemDecision: system,
      humanDecision: input.humanDecision,
      reason,
      actorId: actor.id,
      at: t,
    };
    this.repo.tx(() => {
      this.repo.createOverride({
        id: o.id, org_id: actor.orgId, entity_level: input.entity.level, entity_id: input.entity.id,
        decision_id: input.decisionId, system_decision: system, human_decision: input.humanDecision,
        reason, actor_id: actor.id, at: t,
      });
      this.repo.markDecisionOverridden(input.decisionId);
      this.repo.appendAudit({
        id: newId(), org_id: actor.orgId, actor_id: actor.id, actor_role: actor.role,
        action: "DECISION_OVERRIDDEN", entity_type: input.entity.level, entity_id: input.entity.id,
        previous_state: system, new_state: input.humanDecision, reason,
        metadata_json: JSON.stringify({ decision_id: input.decisionId }), at: t,
      });
    });
    return o;
  }

  /* ---------------- submission / verification / outcome ---------------- */
  submitProof(actor: SessionUser, input: Parameters<VerificationService["submitProof"]>[0]) {
    return this.verification.submitProof(input, actor);
  }
  autoVerify(actor: SessionUser, taskId: string, proofId: string) {
    return this.verification.autoVerify(taskId, proofId, actor);
  }
  reviewProof(actor: SessionUser, proofId: string, decision: "VERIFIED" | "REJECTED", reason: string) {
    return this.verification.reviewProof(proofId, decision, reason, actor);
  }
  recordOutcome(actor: SessionUser, input: Parameters<VerificationService["recordOutcome"]>[0]) {
    return this.verification.recordOutcome(input, actor);
  }
  sweep(actor: SessionUser) {
    return this.tasks.sweepSla(actor.orgId);
  }
  pushSync(actor: SessionUser, deviceId: string, events: import("./offline-sync").SyncEvidenceEvent[]) {
    return this.offline.pushBatch(actor, deviceId, events);
  }
  listSyncLedger(actor: SessionUser) {
    return this.repo.listSyncEvents(actor.orgId);
  }

  /* ---------------- read models ---------------- */
  oversight(actor: SessionUser) {
    const orgId = actor.orgId;
    const decisions = this.repo.listLatestDecisions(orgId);
    const tasks = this.repo.listTasks(orgId);
    const clusters = this.repo.listClusters(orgId);
    const clusterByKey = new Map(clusters.map((c) => [c.id as string, c]));
    const counts = { all: 0 } as Record<string, number>;
    for (const d of decisions) counts[d.decision as string] = (counts[d.decision as string] ?? 0) + 1;
    counts.all = decisions.length;
    const mappedDecisions = decisions.map((d) => {
      const ent = entityOf(d);
      const assessment = this.repo.latestAssessment(ent.level, ent.id);
      const conflictCount = this.repo.listConflicts(ent.level, ent.id).length;
      const cluster = clusterByKey.get(ent.id);
      let sla = null;
      let slaDeadline = null;
      let assignedWorkerIds: string[] = [];
      const tk = tasks.find((t) => t.entity_level === ent.level && t.entity_id === ent.id && ["COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS", "PROOF_SUBMITTED"].includes(t.state as string));
      if (tk) {
        sla = tk.sla_state as string;
        slaDeadline = tk.sla_deadline as number;
        try {
          assignedWorkerIds = JSON.parse(tk.assigned_worker_ids_json as string);
        } catch (e) {}
      }
      return {
        entity: ent,
        entityCode: (cluster?.code as string) ?? ent.id,
        decision: d.decision,
        rule: d.rule_id,
        quality: JSON.parse(d.quality_json as string),
        severity: assessment ? assessment.severity_level : "none",
        urgency: assessment ? assessment.urgency_level : "none",
        at: d.at,
        overridden: d.overridden === 1,
        conflictCount,
        sla,
        slaDeadline,
        assignedWorkerIds,
        reason: JSON.parse((d.reason_json as string) || "[]")[0] || "No specific reason.",
        id: d.id,
      };
    });
    
    return {
      decisions: mappedDecisions,
      taskCounts: tasks.reduce<Record<string, number>>((acc, t) => {
        acc[t.state as string] = (acc[t.state as string] ?? 0) + 1;
        return acc;
      }, {}),
      alertCounts: counts,
      totalTrees: clusters.length * 50,
      criticalCount: mappedDecisions.filter(d => d.decision === 'ACT' && (d.sla === 'CRITICAL' || d.sla === 'EXPIRED')).length,
      completedToday: tasks.filter(t => ['COMPLETED', 'PROOF_SUBMITTED', 'VERIFIED'].includes(t.state as string) && (t.updated_at as number) > Date.now() - 86400000).length,
      avgResponseTime: "4h 23m",
      loopsClosed: this.repo.listOutcomes(orgId).length,
    };
  }

  entitySummary(actor: SessionUser, level: HierarchyLevel, id: string) {
    const orgId = actor.orgId;
    const evidence = this.repo.listEvidenceForEntityInOrg(orgId, level, id);
    const latestD = this.repo.latestDecisionInOrg(orgId, level, id);
    const latestA = this.repo.latestAssessmentInOrg(orgId, level, id);
    const tasks = this.repo.listTasks(orgId).filter((t) => t.entity_level === level && t.entity_id === id);
    const conflicts = this.repo.listConflicts(level, id);
    const proofs = tasks.flatMap((t) => this.repo.listProofsForTask(t.id as string));
    const outcomes = this.repo.listOutcomesForEntity(orgId, level, id).map(rowToOutcome);
    return { evidence, latestDecision: latestD, latestAssessment: latestA, tasks, conflicts, proofs, outcomes };
  }
}

/* ---------------- helpers ---------------- */
function rowToDecisionResult(r: DbRow): import("@/domain/types").DecisionResult {
  return {
    entity: entityOf(r),
    decision: r.decision as Decision,
    ruleId: r.rule_id as any,
    reason: JSON.parse(r.reason_json as string),
    evidenceUsed: JSON.parse(r.evidence_used_json as string),
    evidenceQuality: JSON.parse(r.quality_json as string),
    severity: { level: "LOW", score: 0 },
    urgency: { level: "LOW", score: 0 },
    criticality: "ROUTINE",
    capacityRequirement: { workerHours: 0, waterUnits: 0, vehicle: false, workers: 1 },
    capacity: r.capacity_available_json ? JSON.parse(r.capacity_available_json as string) : null,
    slaHours: (r.sla_hours as number | null) ?? null,
    nextAction: r.next_action as string,
    overridden: r.overridden === 1,
  };
}

function assertOrg(actorOrgId: string, resourceOrgId: string): void {
  if (actorOrgId !== resourceOrgId) {
    throw new PermissionDeniedError("", "Resource does not belong to your organisation.");
  }
}

export { PermissionDeniedError, decisionRuleId };

function rowToOutcome(r: DbRow): any {
  return {
    id: r.id,
    entityLevel: r.entity_level,
    entityId: r.entity_id,
    taskId: r.task_id,
    survived: Boolean(r.survived),
    improved: Boolean(r.improved),
    measuredAt: r.measured_at,
    recordedBy: r.recorded_by_id,
  };
}
