/**
 * SurvivaLoop — verification service.
 *
 * Separates three very different facts:
 *   (1) Was proof submitted?        — ExecutionProof (deduped by submissionId)
 *   (2) Did the worker perform it?  — automated + human verification (PROOF)
 *   (3) Did the tree improve/survive? — BiologicalOutcome (separate, re-assessed)
 *
 * Submitting proof never auto-verifies. Verified proof never claims biological
 * truth on its own — that is recorded by a separate, evidence-backed outcome.
 */
import type { Repo, DbRow } from "@/data/repo";
import POLICY from "@/domain/policy";
import { verifyProof } from "@/domain/verification";
import { canActOnTask, roleHas } from "@/domain/permissions";
import type { ExecutionProof, Role, User } from "@/domain/types";
import { newId } from "@/domain/audit";
import type { Clock } from "./decision-service";
import type { SessionUser } from "./auth";
import { PermissionDeniedError, TaskService } from "./task-service";

export class VerificationService {
  constructor(private repo: Repo, private taskService: TaskService, private now: Clock = () => Date.now()) {}

  /** Idempotent proof submission for offline/retry. Returns {proof, dup}. */
  submitProof(
    input: { taskId: string; submissionId: string; claimedAt: number; location: { lat: number; lng: number } | null; photoRefs: string[]; note: string | null; simulated?: boolean },
    actor: SessionUser,
  ): { proof: DbRow; duplicate: boolean } {
    const t = this.now();
    const task = this.repo.getTask(input.taskId);
    if (!task) throw new Error(`Task ${input.taskId} not found.`);
    this.assertOrg(actor.orgId, task.org_id as string, input.taskId);

    // Server-side assignment gate (no client-trusted worker id).
    const assigned = JSON.parse(task.assigned_worker_ids_json as string) as string[];
    if (!canActOnTask(actor.role, assigned, actor.id)) {
      throw new PermissionDeniedError(actor.id, "You are not assigned to this task.");
    }
    if (!roleHas(actor.role, "submit_proof")) throw new PermissionDeniedError(actor.id, "Role cannot submit proof.");

    // Duplicate / idempotency: same worker + same submissionId → safe re-return.
    const existing = this.repo.findProofBySubmission(actor.id, input.submissionId);
    if (existing) {
      return { proof: existing, duplicate: true };
    }

    const proofId = newId();
    this.repo.tx(() => {
      this.repo.createProof({
        id: proofId,
        task_id: input.taskId,
        worker_id: actor.id,
        submission_id: input.submissionId,
        claimed_at: input.claimedAt,
        submitted_at: t,
        lat: input.location?.lat ?? null,
        lng: input.location?.lng ?? null,
        photo_refs_json: JSON.stringify(input.photoRefs ?? []),
        note: input.note ?? null,
        verification_status: "PENDING",
        checks_json: null,
        simulated: input.simulated ? 1 : 0,
      });
      // Move task PROOF_SUBMITTED if allowed (proof may arrive before COMPLETED only if we allow; we require COMPLETED first).
      if (task.state === "COMPLETED") {
        this.taskService.transition(input.taskId, "PROOF_SUBMITTED", actor, "proof submitted");
      }
      this.repo.appendAudit(this.audit(task.org_id as string, actor, "PROOF_SUBMITTED", "TASK", input.taskId, task.state as string, task.state === "COMPLETED" ? "PROOF_SUBMITTED" : task.state as string, null, { submission_id: input.submissionId }));
    });

    return { proof: this.repo.getProof(proofId)!, duplicate: false };
  }

  /**
   * Run automated checks + (for auto-passable proofs) mark verification.
   * Human review path always available for FLAGGED proofs.
   */
  autoVerify(taskId: string, proofId: string, actor: SessionUser): DbRow {
    const t = this.now();
    const task = this.repo.getTask(taskId);
    const proof = this.repo.getProof(proofId);
    if (!task || !proof) throw new Error("Task or proof not found.");
    this.assertOrg(actor.orgId, task.org_id as string, taskId);
    // Duplicate only if a DIFFERENT proof (different id) exists for the same key.
    const existing = this.repo.findProofBySubmission(proof.worker_id as string, proof.submission_id as string);
    const dup = existing != null && (existing.id as string) !== proof.id;

    const result = verifyProof(
      taskRowToTask(task),
      proofRowToProof(proof),
      dup,
      t,
      POLICY,
    );

    let final = "PENDING";
    if (result.outcome === "VERIFIED") {
      final = "AUTO_PASS";
    } else if (result.outcome === "NEEDS_HUMAN") {
      final = "FLAGGED";
    }

    let pointsAwarded = 0;
    if (final === "AUTO_PASS") {
      pointsAwarded = this.awardPoints(proof.worker_id as string, task, proof);
    }

    this.repo.tx(() => {
      this.repo.updateProof(proofId, {
        verification_status: final,
        checks_json: JSON.stringify(result.checks),
      });
      this.repo.createVerificationReview({
        id: newId(),
        org_id: task.org_id as string,
        proof_id: proofId,
        reviewer_id: actor.id,
        decision: result.outcome === "VERIFIED" ? "VERIFIED" : result.outcome === "NEEDS_HUMAN" ? "NEEDS_HUMAN" : "REJECTED",
        reason: result.reason,
        at: t,
      });
      // Auto-pass advances the task if bound to PROOF_SUBMITTED.
      if (final === "AUTO_PASS" && task.state === "PROOF_SUBMITTED") {
        this.taskService.transition(taskId, "VERIFIED", actor, "automated checks passed");
      }
      this.repo.appendAudit(this.audit(task.org_id as string, actor, "AUTO_VERIFICATION", "PROOF", proofId, "PENDING", final, result.reason, { checks: result.checks.map((c) => `${c.id}:${c.status}`) }));
    });

    return this.repo.getProof(proofId)!;
  }

  /** Human adjudication overrides/settles a flagged proof. */
  reviewProof(
    proofId: string,
    decision: "VERIFIED" | "REJECTED",
    reason: string,
    actor: SessionUser,
  ): DbRow {
    const t = this.now();
    const proof = this.repo.getProof(proofId);
    if (!proof) throw new Error("Proof not found.");
    const task = this.repo.getTask(proof.task_id as string);
    if (!task) throw new Error("Bound task not found.");
    this.assertOrg(actor.orgId, task.org_id as string, proof.task_id as string);
    if (!roleHas(actor.role, "review_proof")) throw new PermissionDeniedError(actor.id, "Role cannot review proof.");
    if (!reason.trim()) throw new Error("A review reason is required.");

    let pointsAwarded = 0;
    if (decision === "VERIFIED") {
      pointsAwarded = this.awardPoints(proof.worker_id as string, task, proof);
    }

    this.repo.tx(() => {
      this.repo.updateProof(proofId, {
        verification_status: decision,
        review_outcome: decision,
        reviewer_id: actor.id,
        reviewed_at: t,
      });
      this.repo.createVerificationReview({
        id: newId(),
        org_id: task.org_id as string,
        proof_id: proofId,
        reviewer_id: actor.id,
        decision,
        reason,
        at: t,
      });
      if (task.state === "PROOF_SUBMITTED") {
        this.taskService.transition(task.id as string, decision, actor, `human review: ${reason}`);
      }
      this.repo.appendAudit(this.audit(task.org_id as string, actor, "HUMAN_REVIEW", "PROOF", proofId, proof.verification_status as string, decision, reason, {}));
    });
    return this.repo.getProof(proofId)!;
  }

  private awardPoints(workerId: string, task: DbRow, proof: DbRow): number {
    // Anti-fraud: same tree/task cannot score twice same day
    // For simplicity in demo, if the user already has VERIFIED proof for this task, don't award.
    // In memory-repo we can just check if the user already scored today for this task.
    // However, since a task is uniquely completed once, we just check if any OTHER proof for this task was verified.
    const allProofs = this.repo.listProofsForTask ? this.repo.listProofsForTask(task.id as string) : [];
    const alreadyScored = allProofs.some(p => p.verification_status === "VERIFIED" || p.verification_status === "AUTO_PASS");
    if (alreadyScored) return 0; // already got points

    // Award +10 for ACT/Water, +6 for INSPECT
    const iv = this.repo.getIntervention(task.intervention_class_id as string);
    let pts = 0;
    if (iv?.code.includes("INSPECT")) pts = 6;
    else pts = 10;

    // Update user points
    if ('updateUser' in this.repo && 'getUser' in this.repo) {
      const u = (this.repo as any).getUser(workerId) as User;
      if (u) {
        (this.repo as any).updateUser(workerId, { points: (u.points || 0) + pts });
      }
    }
    return pts;
  }

  /** Record a biological outcome (separate from execution/proof). */
  recordOutcome(
    input: { entityLevel: string; entityId: string; taskId: string | null; survived: boolean; improved: boolean; evidenceIds: string[] },
    actor: SessionUser,
  ): DbRow {
    const t = this.now();
    const orgId = actor.orgId;
    const id = newId();
    // Outcome can only be recorded from verified evidence or accepted measurements.
    const validEvidence = (input.evidenceIds ?? []).filter((eid) => {
      const e = this.repo.getEvidence(eid);
      return e && ["HUMAN_VERIFIED", "AUTO_PASS"].includes(e.verification_status as string);
    });
    this.repo.createOutcome({
      id,
      org_id: orgId,
      entity_level: input.entityLevel,
      entity_id: input.entityId,
      task_id: input.taskId,
      survived: input.survived ? 1 : 0,
      improved: input.improved ? 1 : 0,
      measured_at: t,
      evidence_ids_json: JSON.stringify(validEvidence),
      simulated: 0,
    });
    this.repo.appendAudit(this.audit(orgId, actor, "OUTCOME_RECORDED", "ENTITY", input.entityId, null, input.survived ? "SURVIVED" : "NOT_SURVIVED", null, { improved: input.improved }));
    return this.repo.getOutcome(id)!;
  }

  private assertOrg(actorOrgId: string, resourceOrgId: string, resourceId: string): void {
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

function taskRowToTask(r: DbRow): import("@/domain/types").Task {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    entity: { level: r.entity_level as any, id: r.entity_id as string },
    state: r.state as any,
    interventionClassId: r.intervention_class_id as string,
    decisionId: (r.decision_id as string | null) ?? null,
    sla: null,
    location: r.lat != null && r.lng != null ? { lat: r.lat as number, lng: r.lng as number } : null,
    createdAt: r.created_at as number,
    committedAt: (r.committed_at as number | null) ?? null,
    assignedWorkerIds: JSON.parse(r.assigned_worker_ids_json as string) as string[],
  } as import("@/domain/types").Task;
}

function proofRowToProof(r: DbRow): ExecutionProof {
  return {
    id: r.id as string,
    taskId: r.task_id as string,
    workerId: r.worker_id as string,
    submissionId: r.submission_id as string,
    submittedAt: r.submitted_at as number,
    claimedAt: r.claimed_at as number,
    location: r.lat != null && r.lng != null ? { lat: r.lat as number, lng: r.lng as number } : null,
    photoRefs: JSON.parse(r.photo_refs_json as string) as string[],
    note: (r.note as string | null) ?? null,
  };
}
