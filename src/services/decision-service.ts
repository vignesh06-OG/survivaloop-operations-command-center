/**
 * SurvivaLoop — decision service (orchestrator).
 *
 * Wires evidence → quality → severity → capacity → decision and persists
 * the explainable result plus audit rows. This is the single place business
 * decisions are made; the UI only renders the result.
 */
import type { Repo, DbRow } from "@/data/repo";
import POLICY from "@/domain/policy";
import { decide, type DecisionInputs } from "@/domain/decision-engine";
import { qualityOfEvidence, conflictsDetected, severityOfEvidence } from "@/domain/evidence-quality";
import { checkCapacity } from "@/domain/capacity";
import type { CapacityRequirement, DecisionResult, EntityRef, HierarchyLevel } from "@/domain/types";
import { newId } from "@/domain/audit";

export type Clock = () => number;

/** Combined entity reference from a row. */
export function entityOf(row: DbRow): EntityRef {
  return { level: row.entity_level as HierarchyLevel, id: row.entity_id as string };
}

/**
 * Effective capacity snapshot.
 *  - available = BASE capacity from the snapshot (regenerable gross).
 *  - committed = DERIVED by summing live task rows (never a hand-mutated counter).
 * This makes feasible-resource accounting concurrency-safe: the numbers always
 * reflect the current committed workload, so a second concurrent commit sees
 * the first's reservation.
 */
export function makeCapacitySnapshot(orgId: string, repo: Repo, now: number) {
  const base = repo.baseCapacity(orgId);
  const committed = repo.activeCommitments(orgId);
  return {
    workerHoursAvailable: base.workerHours,
    waterUnitsAvailable: base.waterUnits,
    vehiclesAvailable: base.vehicles,
    availableWorkers: base.availableWorkers,
    committedWorkerHours: committed.committedWorkerHours,
    committedWaterUnits: committed.committedWaterUnits,
    committedVehicles: committed.committedVehicles,
    committedWorkers: committed.committedWorkers,
    time: now,
  };
}

export interface InterventionMod {
  id: string;
  label: string;
  criticality: "ROUTINE" | "STANDARD" | "CRITICAL" | "EMERGENCY";
  slaLimitHours: number;
  requirement: CapacityRequirement;
}

export function interventionModFromRow(r: DbRow): InterventionMod {
  return {
    id: r.id as string,
    label: r.label as string,
    criticality: r.criticality as InterventionMod["criticality"],
    slaLimitHours: r.sla_limit_hours as number,
    requirement: {
      workerHours: r.req_worker_hours as number,
      waterUnits: r.req_water_units as number,
      vehicle: r.req_vehicle === 1,
      workers: r.req_workers as number,
    },
  };
}

export interface RunDecisionResult {
  decision: DecisionResult;
  conflicts: { id: string }[];
  assessmentId: string;
  decisionId: string;
}

export class DecisionService {
  private now: Clock;
  constructor(private repo: Repo, now?: Clock) {
    this.now = now ?? (() => Date.now());
  }

  /** Run the full assess→decide→persist loop for an entity. */
  run(
    orgId: string,
    entity: EntityRef,
    intervention: InterventionMod,
    opts?: { capacityOverride?: boolean },
  ): RunDecisionResult {
    const t = this.now();
    const evidenceRows = this.repo.listEvidenceForEntityInOrg(orgId, entity.level, entity.id);
    const evidence = evidenceRows.map(rowToEvidence);
    const quality = qualityOfEvidence(evidence, t, POLICY);
    const conflicts = conflictsDetected(evidence, t, POLICY);

    const cap = this.repo.latestCapacity(orgId);
    const capacitySnap: DecisionInputs["capacity"] = cap
      ? makeCapacitySnapshot(orgId, this.repo, t)
      : null;

    const activeTask = this.repo.listTasks(orgId)
      .filter((r) => r.entity_level === entity.level && r.entity_id === entity.id)
      .sort((a, b) => (b.created_at as number) - (a.created_at as number))[0];

    const activeSla = activeTask && activeTask.sla_state !== "NORMAL"
      ? { state: activeTask.sla_state as any }
      : null;

    const result = decide(
      {
        entity,
        evidence,
        intervention,
        capacity: capacitySnap,
        activeSla,
        now: t,
      },
      POLICY,
    );

    // Persist assessment + decision + conflicts in one transaction.
    let assessmentId = "";
    let decisionId = "";
    this.repo.tx(() => {
      assessmentId = newId();
      this.repo.createAssessment({
        id: assessmentId,
        org_id: orgId,
        entity_level: entity.level,
        entity_id: entity.id,
        at: t,
        severity_level: result.severity.level,
        severity_score: result.severity.score,
        urgency_level: result.urgency.level,
        urgency_score: result.urgency.score,
        quality: result.evidenceQuality.quality,
        conflicted: result.evidenceQuality.conflicted ? 1 : 0,
        report_json: JSON.stringify({
          severity: result.severity,
          urgency: result.urgency,
          quality: result.evidenceQuality,
          reason: `Evidence items=${evidence.length}; conflicts=${conflicts.length}`,
        }),
      });

      for (const c of conflicts) {
        this.repo.createConflict({
          id: newId(),
          entity_level: entity.level,
          entity_id: entity.id,
          evidence_ids_json: JSON.stringify([c.a.id, c.b.id]),
          reason: `Conflicting high-quality evidence: ${c.a.evidenceType} (sev ${severityOfEvidence(c.a, POLICY).toFixed(2)}) vs ${c.b.evidenceType} (sev ${severityOfEvidence(c.b, POLICY).toFixed(2)}).`,
          detected_at: t,
          resolved: 0,
        });
      }

      decisionId = newId();
      this.repo.createDecision({
        id: decisionId,
        org_id: orgId,
        entity_level: entity.level,
        entity_id: entity.id,
        decision: result.decision,
        rule_id: result.ruleId,
        reason_json: JSON.stringify(result.reason),
        evidence_used_json: JSON.stringify(result.evidenceUsed),
        quality_json: JSON.stringify(result.evidenceQuality),
        capacity_available_json: capacitySnap ? JSON.stringify(result.capacity) : null,
        sla_hours: result.slaHours,
        next_action: result.nextAction,
        overridden: 0,
        at: t,
      });

      this.repo.appendAudit({
        id: newId(),
        org_id: orgId,
        actor_id: null,
        actor_role: "SYSTEM",
        action: "DECISION_GENERATED",
        entity_type: entity.level,
        entity_id: entity.id,
        previous_state: null,
        new_state: result.decision,
        reason: `rule=${result.ruleId}`,
        metadata_json: JSON.stringify({ quality: result.evidenceQuality.quality, conflicts: conflicts.length }),
        at: t,
      });
    });

    return { decision: result, conflicts: conflicts.map((c) => ({ id: c.a.id + ":" + c.b.id })), assessmentId, decisionId };
  }

  /** Latest decision for entity (read path). */
  latest(entity: EntityRef): DbRow | null {
    return this.repo.latestDecision(entity.level, entity.id);
  }

  /** Provide a suggested intervention given severity (for UI/demo). */
  suggestIntervention(orgId: string): DbRow | null {
    const list = this.repo.listInterventions(orgId);
    return list.find((i) => i.criticality === "CRITICAL") ?? list[0] ?? null;
  }
}

export function rowToEvidence(r: DbRow): import("@/domain/types").Evidence {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    entity: { level: r.entity_level as HierarchyLevel, id: r.entity_id as string },
    source: r.source as any,
    evidenceType: r.evidence_type as any,
    signal: r.signal as any,
    severity: r.implied_severity as number,
    observedAt: r.observed_at as number,
    capturedAt: r.captured_at as number,
    location: r.lat != null && r.lng != null ? { lat: r.lat as number, lng: r.lng as number } : null,
    collectorId: (r.collector_id as string | null) ?? null,
    verificationStatus: r.verification_status as any,
    metadata: JSON.parse((r.metadata_json as string) ?? "{}"),
    provenanceNote: (r.provenance_note as string | null) ?? undefined,
    simulated: r.simulated === 1,
  };
}
