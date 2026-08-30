/**
 * SurvivaLoop — evidence quality.
 *
 * This module answers: "how much can I trust this claim?" — as distinct from
 * "what should we do about it?" (that's the decision engine).
 *
 * It is fully deterministic, stateless (clock injected), and produces
 * components (freshness, reliability) plus an aggregate quality that is
 * *not* a single opaque "AI confidence" number.
 */
import type {
  Evidence,
  EvidenceQuality,
  EvidenceVerificationStatus,
  HierarchyLevel,
} from "./types";
import type { Policy } from "./policy";

/** 0..1 reliability = source fidelity × verification status. */
export function reliabilityOf(
  e: Pick<Evidence, "source" | "verificationStatus">,
  policy: Policy,
): number {
  const source = policy.sourceReliability[e.source] ?? 0.5;
  const verification = policy.verificationMultiplier[e.verificationStatus] ?? 0;
  return clamp01(source * verification);
}

/** 0..1 freshness via exponential decay of time since observedAt. */
export function freshnessOf(
  observedAt: number,
  now: number,
  policy: Policy,
): number {
  const hours = Math.max(0, now - observedAt) / 3_600_000;
  const halfLife = Math.max(0.0001, policy.freshnessHalfLifeHours);
  return clamp01(Math.pow(0.5, hours / halfLife));
}

/**
 * Aggregate quality for a set of evidence about an entity.
 * geometric mean of freshness & reliability (bounded in [0,1], balanced).
 */
export function qualityOfEvidence(
  evidence: Evidence[],
  now: number,
  policy: Policy,
): EvidenceQuality {
  const contributors: string[] = [];
  const parts: { freshness: number; reliability: number; quality: number }[] = [];

  for (const e of evidence) {
    const freshness = freshnessOf(e.observedAt, now, policy);
    const reliability = reliabilityOf(e, policy);
    const quality = Math.sqrt(freshness * reliability);
    contributors.push(e.id);
    parts.push({ freshness, reliability, quality });
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const conflicted = conflictsDetected(evidence, now, policy).length > 0;
  const qualifying = parts.filter((p) => p.quality >= policy.minQualityForDecision).length;

  return {
    freshness: avg(parts.map((p) => p.freshness)),
    reliability: avg(parts.map((p) => p.reliability)),
    quality: avg(parts.map((p) => p.quality)),
    contributors,
    conflicted,
    qualifyingCount: qualifying,
  };
}

/** Quality of a single evidence item. */
export function qualityOfOne(
  e: Evidence,
  now: number,
  policy: Policy,
): number {
  const f = freshnessOf(e.observedAt, now, policy);
  const r = reliabilityOf(e, policy);
  return Math.sqrt(f * r);
}

/* ------------------------------------------------------------------ Conflicts */

export interface ConflictDatum {
  a: Evidence;
  b: Evidence;
  /** Severity gap between the two claims. */
  gap: number;
}

/**
 * Deterministic conflict detection: two high-quality pieces of evidence about the
 * same entity whose implied severity differ by >= conflictSeverityGap, or which
 * have contradictory signals, are flagged as a conflict.
 */
export function conflictsDetected(
  evidence: Evidence[],
  now: number,
  policy: Policy,
): ConflictDatum[] {
  const qualifying = evidence.filter(
    (e) => qualityOfOne(e, now, policy) >= policy.conflictMinQuality,
  );
  const out: ConflictDatum[] = [];
  for (let i = 0; i < qualifying.length; i++) {
    for (let j = i + 1; j < qualifying.length; j++) {
      const a = qualifying[i];
      const b = qualifying[j];
      const severityA = severityOfEvidence(a, policy);
      const severityB = severityOfEvidence(b, policy);
      const gap = Math.abs(severityA - severityB);
      const oppositeSignals =
        impliesSignal(a, policy) !== impliesSignal(b, policy) &&
        severityA > policy.conflictMinQuality * 0 && // both pass quality already
        Math.max(severityA, severityB) >= 0.3; // at least one is meaningfully directional
      if (gap >= policy.conflictSeverityGap || oppositeSignals) {
        out.push({ a, b, gap });
      }
    }
  }
  return out;
}

/** Implied severity from the evidence *type* (not the uploader's claim). */
export function severityOfEvidence(
  e: Pick<Evidence, "evidenceType">,
  policy: Policy,
): number {
  return policy.evidenceSeverity[e.evidenceType] ?? policy.evidenceSeverity.OTHER;
}

/** Implied signal direction from the evidence *type*. */
export function impliesSignal(
  e: Pick<Evidence, "evidenceType">,
  policy: Policy,
): "DISTRESS" | "IMPROVEMENT" | "NEUTRAL" {
  return policy.signalForType[e.evidenceType] ?? "NEUTRAL";
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
