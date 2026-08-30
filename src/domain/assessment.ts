/**
 * SurvivaLoop — assessment.
 *
 * Deterministic aggregation of evidence into severity + urgency.
 * Severity answers "how bad is it claimed to be?" Urgency answers "how
 * time-critical is acting?". Both are explainable and do not use ML.
 */
import type { Evidence, SeverityLevel, UrgencyLevel } from "./types";
import type { Policy } from "./policy";
import { conflictsDetected, qualityOfOne, severityOfEvidence } from "./evidence-quality";

export interface SeverityOutcome {
  level: SeverityLevel;
  /** 0..1 blended score. */
  score: number;
  /** Drivers (evidence ids that pushed severity up). */
  drivers: string[];
  reason: string;
}

export interface UrgencyOutcome {
  level: UrgencyLevel;
  score: number;
  reason: string;
}

function severityBand(score: number): SeverityLevel {
  if (score < 0.1) return "NONE";
  if (score < 0.3) return "LOW";
  if (score < 0.5) return "MODERATE";
  if (score < 0.7) return "HIGH";
  if (score < 0.85) return "SEVERE";
  return "CRITICAL";
}

function urgencyBand(score: number, criticalityFactor: number): UrgencyLevel {
  const scaled = Math.min(1, score * criticalityFactor);
  if (scaled < 0.2) return "LOW";
  if (scaled < 0.5) return "MEDIUM";
  if (scaled < 0.75) return "HIGH";
  return "CRITICAL";
}

/**
 * Blend of the single strongest quantified distress signal and the quality-
 * weighted mean, so a lone-but-stronng verified photo can drive severity while a
 * pile of weak claims cannot.
 */
export function assessSeverity(
  evidence: Evidence[],
  now: number,
  policy: Policy,
): SeverityOutcome {
  const drivers: string[] = [];
  const weighted: { q: number; severity: number; id: string }[] = [];

  for (const e of evidence) {
    const q = qualityOfOne(e, now, policy);
    const severity = severityOfEvidence(e, policy);
    if (severity > 0 && q > 0) {
      weighted.push({ q, severity, id: e.id });
    }
  }

  if (weighted.length === 0) {
    return {
      level: "NONE",
      score: 0,
      drivers: [],
      reason: "No distress-signal evidence above zero quality.",
    };
  }

  // Quality-scaled: weak evidence contributes little.
  const scored = weighted
    .map((w) => ({ ...w, w: w.severity * w.q }))
    .sort((a, b) => b.w - a.w);

  const strongest = scored[0].w;
  const topDrivers = scored
    .filter((s) => s.w >= strongest * 0.5)
    .slice(0, 3)
    .map((s) => s.id);
  drivers.push(...topDrivers);

  const mean = scored.reduce((a, b) => a + b.w, 0) / scored.length;
  // 60% strongest, 40% mean — bounded in [0,1] since each weight is <= severity.
  const score = clamp01(0.6 * strongest + 0.4 * mean);

  return {
    level: severityBand(score),
    score,
    drivers,
    reason: `Blend of strongest quality-weight distress signal (${strongest.toFixed(2)}) and quality-weighted mean (${mean.toFixed(2)}).`,
  };
}

export function assessUrgency(
  severity: SeverityOutcome,
  criticalityFactor: number,
  policy: Policy,
): UrgencyOutcome {
  const score = clamp01(severity.score * criticalityFactor);
  return {
    level: urgencyBand(severity.score, criticalityFactor),
    score,
    reason: `Urgency = severity (${severity.score.toFixed(2)}) × criticality factor (${criticalityFactor.toFixed(2)}).`,
  };
}

/** Criticality multiplier — EMERGENCY acts faster, but is heavy. */
export function criticalityFactor(c: "ROUTINE" | "STANDARD" | "CRITICAL" | "EMERGENCY"): number {
  switch (c) {
    case "EMERGENCY": return 1.0;
    case "CRITICAL": return 0.92;
    case "STANDARD": return 0.75;
    case "ROUTINE": return 0.5;
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
