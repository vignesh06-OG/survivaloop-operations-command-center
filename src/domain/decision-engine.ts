/**
 * SurvivaLoop — decision engine.
 *
 * Deterministic + fully explainable. No fake ML, no single opaque confidence
 * score. The engine reads evidence, computes quality (separately), grades
 * urgency, checks capacity, and returns an ordered, auditable rationale plus a
 * rule id (`ruleId`) that names the exact rule that fired.
 *
 * IMPORTANT: This module must not import React, Next, or any repository. It is
 * a pure function of (evidence, capacity snapshot, intervention state, clock).
 *
 * Decision rules (first match wins, evaluated in this exact order):
 *   1. EXPIRED_INTERVENTION   — an active intervention missed its SLA → ESCALATE (+reassess)
 *   2. CRITICAL_SLA           — active intervention SLA critical → ESCALATE
 *   3. CONFLICTING_EVIDENCE   — high-quality contradictory evidence → INSPECT
 *   4. SEVERE_CAPACITY_AVAILABLE — severe+urgent+quality ok+capacity ok → ACT
 *   5. URGENT_CAPACITY_UNAVAILABLE — severe/urgent but capacity fails → DEFER / ESCALATE by policy
 *   6. URGENT_WITHOUT_REQUIREMENT  — severe but evidence quality below gate → INSPECT (can't act on weak evidence)
 *   7. LOW_URGENCY            — nothing severe → MONITOR
 *   8. FALLBACK_MONITOR       — catch-all
 */
import type {
  CapacityCheckResult,
  CapacityRequirement,
  CapacitySnapshot,
  DecisionResult,
  DecisionRuleId,
  Evidence,
  HierarchyLevel,
} from "./types";
import type { Policy } from "./policy";
import {
  assessSeverity,
  assessUrgency,
  criticalityFactor,
  type SeverityOutcome,
  type UrgencyOutcome,
} from "./assessment";
import { qualityOfEvidence as assessQuality } from "./evidence-quality";
import { checkCapacity } from "./capacity";
import { capacityFailureAction } from "./policy";

export interface DecisionInputs {
  entity: { level: HierarchyLevel; id: string };
  evidence: Evidence[];
  /** Intervention class (severity/urgency/capacity mapping). */
  intervention: { id: string; label: string; criticality: "ROUTINE" | "STANDARD" | "CRITICAL" | "EMERGENCY"; slaLimitHours: number; requirement: CapacityRequirement };
  /** Capacity at decision time, or null if not yet measured. */
  capacity: CapacitySnapshot | null;
  /** SLA state of an *existing active* intervention, if any. */
  activeSla: { state: "NORMAL" | "APPROACHING" | "CRITICAL" | "EXPIRED" | "ESCALATED" } | null;
  now: number;
}

export function decide(inputs: DecisionInputs, policy: Policy): DecisionResult {
  const { entity, evidence, intervention, capacity, activeSla, now } = inputs;

  const evidenceQuality = assessQuality(evidence, now, policy);
  const severity: SeverityOutcome = assessSeverity(evidence, now, policy);
  const cf = criticalityFactor(intervention.criticality);
  const urgency: UrgencyOutcome = assessUrgency(severity, cf, policy);

  // Evidence must pass BOTH the quality gate AND the reliability floor before we
  // will ACT on it. Unverified/FLAGGED/low-fidelity claims get inspected first.
  const evidenceGradeOk =
    evidenceQuality.quality >= policy.minQualityForDecision &&
    evidenceQuality.reliability >= policy.minReliabilityForAction;
  // Gate on the qualitative LEVEL, which is more stable + explainable than a raw score.
  const severeEnough = ["HIGH", "SEVERE", "CRITICAL"].includes(severity.level);
  const urgentEnough = ["HIGH", "CRITICAL"].includes(urgency.level);
  void criticalEnoughHere(severity.score, policy);

  const capacityCheck: CapacityCheckResult | null = capacity
    ? checkCapacity(intervention.requirement, capacity)
    : null;

  const slaHours = shouldHaveSla(urgency, intervention) ? intervention.slaLimitHours : null;

  const base = {
    entity,
    evidenceUsed: evidenceQuality.contributors,
    evidenceQuality,
    severity: { level: severity.level, score: severity.score },
    urgency: { level: urgency.level, score: urgency.score },
    criticality: intervention.criticality,
    capacityRequirement: intervention.requirement,
    capacity: capacityCheck,
    slaHours,
    overridden: false,
  };

  /* Rule 1 — expired intervention. */
  if (activeSla?.state === "EXPIRED") {
    return withReason(base, "EXPIRED_INTERVENTION", "ESCALATE", [
      "An already-committed intervention passed its SLA without a recorded execution or proof.",
      "Action is no longer a fresh decision — it must be escalated and reassessed.",
    ], "Escalate to supervisor and reassess the entity with current evidence.");
  }

  /* Rule 2 — critical SLA on the committed intervention. */
  if (activeSla?.state === "CRITICAL") {
    return withReason(base, "CRITICAL_SLA", "ESCALATE", [
      "The committed intervention's SLA is critical and cannot reliably be met.",
      "Escalating rather than silently extending, so a human owns the risk.",
    ], "Escalate to supervisor.");
  }

  /* Rule 3 — conflicting evidence. */
  if (evidenceQuality.conflicted) {
    return withReason(base, "CONFLICTING_EVIDENCE", "INSPECT", [
      "High-quality evidence in this group contradicts itself (differing expected severity / opposite signals).",
      "Per policy we do not act on contradictory claims — we inspect on-site to establish ground truth.",
    ], "Dispatch an inspection visit to resolve the conflict.");
  }

  /* Rule 6 (before rule 4) — severe but evidence below quality OR reliability gate. */
  if (severeEnough && !evidenceGradeOk) {
    const reasons: string[] = [];
    if (evidenceQuality.quality < policy.minQualityForDecision) {
      reasons.push(`Aggregate evidence quality (${evidenceQuality.quality.toFixed(2)}) is below the ${policy.minQualityForDecision} decision gate.`);
    }
    if (evidenceQuality.reliability < policy.minReliabilityForAction) {
      reasons.push(`Aggregate evidence reliability (${evidenceQuality.reliability.toFixed(2)}) is below the ${policy.minReliabilityForAction} floor for action — the supporting evidence is unverified, low-fidelity or flagged.`);
    }
    return withReason(base, "URGENT_WITHOUT_REQUIREMENT", "INSPECT", [
      `Claimed severity is ${severity.level} and time-sensitive, but:`,
      ...reasons,
      "We will not ACT on evidence too weak or unverified to justify a commitment.",
    ], "Collect fresh, higher-fidelity, verified evidence or inspect on-site.");
  }

  /* Rule 4 — severe + urgent + capacity available → ACT. */
  if (severeEnough && urgentEnough && capacityCheck?.feasible) {
    return withReason(base, "SEVERE_CAPACITY_AVAILABLE", "ACT", [
      `Severity ${severity.level} (${severity.score.toFixed(2)}) and urgency ${urgency.level}.`,
      `Evidence quality ${evidenceQuality.quality.toFixed(2)} meets the ${policy.minQualityForDecision} gate.`,
      `Capacity check PASSED: ${capacityCheck.reason.join(" ")}`,
    ], "Commit the intervention and reserve capacity immediately.");
  }

  /* Rule 5 — severe/urgent but capacity unavailable → DEFER or ESCALATE by policy. */
  if (severeEnough && urgentEnough && capacityCheck && !capacityCheck.feasible) {
    const action = capacityFailureAction(intervention.criticality);
    return withReason(base, "URGENT_CAPACITY_UNAVAILABLE", action === "ESCALATE" ? "ESCALATE" : "DEFER", [
      `Severity ${severity.level} (${severity.score.toFixed(2)}) requires action now, but capacity is insufficient:`,
      ...capacityCheck.reason,
      `Policy for criticality '${intervention.criticality}' requires ${action}.`,
    ], action === "ESCALATE"
      ? "Escalate to secure capacity or approve risk."
      : "Defer; re-check capacity and re-decide when resources free up.");
  }

  /* Rule 7 — low urgency → MONITOR. */
  if (!severeEnough) {
    return withReason(base, "LOW_URGENCY", "MONITOR", [
      `Severity ${severity.level} (${severity.score.toFixed(2)}) is below the ${policy.severeSeverity} severe threshold.`,
      "No near-term action required; keep under observation.",
    ], "Reassess on the next scheduled cycle or on fresh evidence.");
  }

  /* Rule 8 — fallback. */
  return withReason(base, "FALLBACK_MONITOR", "MONITOR", [
    "No rule matched a stronger action; monitor by default.",
  ], "Monitor; re-run decision on new evidence.");
}

function criticalEnoughHere(_score: number, _p: Policy): void { /* reserved; level used instead */ }

function shouldHaveSla(
  urgency: UrgencyOutcome,
  intervention: DecisionInputs["intervention"],
): boolean {
  const heavy = intervention.criticality === "CRITICAL" || intervention.criticality === "EMERGENCY";
  return urgency.score > 0 && (urgency.level === "HIGH" || urgency.level === "CRITICAL" || heavy);
}

function withReason(
  base: Omit<DecisionResult, "decision" | "reason" | "ruleId" | "nextAction">,
  ruleId: DecisionRuleId,
  decision: DecisionResult["decision"],
  reason: string[],
  nextAction: string,
): DecisionResult {
  return { ...base, decision, ruleId, reason, nextAction };
}
