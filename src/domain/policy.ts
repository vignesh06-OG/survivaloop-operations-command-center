/**
 * SurvivaLoop — policy configuration.
 *
 * All decision/quality thresholds live here, in one auditable place.
 * Nothing in the engine hardcodes magic numbers; every magic number is this file.
 * Each knob is also exposed to the UI as human-readable policy so the system is
 * explainable and tunable, never mysterious.
 */
import type { Criticality, EvidenceSource, EvidenceType, Signal } from "./types";

export interface Policy {
  /* Evidence quality */
  /** Half-life (hours) for freshness decay of an observation. */
  freshnessHalfLifeHours: number;
  /** Reliability multipliers per evidence source (fidelity). */
  sourceReliability: Record<EvidenceSource, number>;
  /** Multiplier applied by verification status (trust, not truth). */
  verificationMultiplier: Record<
    "PENDING" | "AUTO_PASS" | "FLAGGED" | "HUMAN_VERIFIED" | "REJECTED",
    number
  >;

  /* Severity scoring */
  /** Base severity of a signal, per evidence type. */
  evidenceSeverity: Record<EvidenceType, number>; // 0..1
  /** The direction a signal implies (which may override an uploader's claim). */
  signalForType: Record<EvidenceType, Signal>;

  /* Conflict detection */
  /** Any pair of qualifying evidence differing by >= this severity is a conflict. */
  conflictSeverityGap: number;
  /** Qualifying evidence must pass this quality to enter conflict detection. */
  conflictMinQuality: number;

  /* Decision thresholds */
  minQualityForDecision: number;
  /**
   * Minimum aggregate RELIABILITY to justify an ACTION decision. Prevents
   * unverified or low-fidelity evidence (PENDING/FLAGGED photos, WORKER_CLAIM)
   * from driving a capital commitment. Evidence below this is inspected first.
   */
  minReliabilityForAction: number;
  severeSeverity: number; // >= -> severe
  criticalSeverity: number; // >= -> critical
  highUrgencySeverity: number;

  /* Capacity interpretation */
  /** Minimum worker-hours required before we even check capacity (0 latency). */
  minFeasibleWorkerHours: number;

  /* SLA */
  /** Fraction of SLA elapsed before state becomes APPROACHING. */
  slaApproachingFraction: number;
  /** Fraction of SLA elapsed before state becomes CRITICAL. */
  slaCriticalFraction: number;

  /* Verification */
  /** Max metres between claimed proof GPS and task site to PASS proximity. */
  maxProofGpsMeters: number;
  /** Max minutes between claimed proof time and server-submit time. */
  maxProofClockSkewMinutes: number;
  /** Max ordering drift (ms) for sequence checks. */
  maxSequenceDriftMs: number;

  /** Deterministic pseudo-random generator seed for simulations. */
  simSeed: number;
}

const POLICY: Policy = {
  freshnessHalfLifeHours: 24,
  sourceReliability: {
    FIELD_PHOTO: 0.9,
    FIELD_OBSERVATION: 0.8,
    DRONE: 0.85,
    SENSOR: 0.95,
    WORKER_CLAIM: 0.5,
    REPORT: 0.6,
    ORGANISATION_RECORD: 0.7,
  },
  verificationMultiplier: {
    PENDING: 0.5,
    AUTO_PASS: 0.85,
    FLAGGED: 0.4,
    HUMAN_VERIFIED: 1.0,
    REJECTED: 0.0,
  },
  evidenceSeverity: {
    DROUGHT_STRESS: 0.6,
    WILTED_LEAVES: 0.5,
    DEATH: 0.95,
    PESTS_DISEASE: 0.55,
    WATERING_OBSERVED: 0.0,
    HEALTHY_GREEN: 0.0,
    NEW_GROWTH: 0.0,
    PLANTING_DONE: 0.0,
    STAKING_BROKEN: 0.3,
    WATER_POINT: 0.0,
    SOIL_DRYNESS: 0.45,
    OTHER: 0.3,
  },
  signalForType: {
    DROUGHT_STRESS: "DISTRESS",
    WILTED_LEAVES: "DISTRESS",
    DEATH: "DISTRESS",
    PESTS_DISEASE: "DISTRESS",
    WATERING_OBSERVED: "IMPROVEMENT",
    HEALTHY_GREEN: "IMPROVEMENT",
    NEW_GROWTH: "IMPROVEMENT",
    PLANTING_DONE: "IMPROVEMENT",
    STAKING_BROKEN: "DISTRESS",
    WATER_POINT: "NEUTRAL",
    SOIL_DRYNESS: "DISTRESS",
    OTHER: "NEUTRAL",
  },
  conflictSeverityGap: 0.5,
  conflictMinQuality: 0.5,
  minQualityForDecision: 0.5,
  minReliabilityForAction: 0.6,
  severeSeverity: 0.7,
  criticalSeverity: 0.85,
  highUrgencySeverity: 0.55,
  minFeasibleWorkerHours: 0.01,
  slaApproachingFraction: 0.7,
  slaCriticalFraction: 0.9,
  maxProofGpsMeters: 200,
  maxProofClockSkewMinutes: 30,
  maxSequenceDriftMs: 5 * 60 * 1000,
  simSeed: 1337,
};

/** Criticality escalations: what an EMERGENCY/CRITICAL job does when capacity fails. */
export function capacityFailureAction(criticality: Criticality): "DEFER" | "ESCALATE" {
  switch (criticality) {
    case "EMERGENCY":
    case "CRITICAL":
      return "ESCALATE";
    case "STANDARD":
    case "ROUTINE":
    default:
      return "DEFER";
  }
}

export default POLICY;
