/**
 * SurvivaLoop — core domain types.
 *
 * Pure TypeScript. No React, no Next.js, no database imports.
 * Every interface defined here is the single source of truth shared by:
 *   - the domain services
 *   - the API boundary (Zod schemas are derived / validated against these)
 *   - tests
 */

/* ------------------------------------------------------------------ Roles */

/** System roles. Authorization is enforced server-side, never client-trusted. */
export type Role = "ADMIN" | "SUPERVISOR" | "FIELD_WORKER" | "AUDITOR";

/**
 * Nominal privilege ordering. Higher number = more privilege.
 * Note that AUDITOR and FIELD_WORKER occupy different axes (AUDITOR is
 * read-only, wide scope; FIELD_WORKER is narrow, write-scoped) — so this is a
 * *hierarchy* used only for rank comparisons, not a complete capability model.
 * Capabilities are expressed by explicit permission checks (`permissions.ts`).
 */
export const ROLE_RANK: Record<Role, number> = {
  FIELD_WORKER: 1,
  AUDITOR: 2,
  SUPERVISOR: 3,
  ADMIN: 4,
} as const;

/* ------------------------------------------------------------------ Level */

/** Spatial / decisioning hierarchy. Never assume every deployment has tree IDs. */
export type HierarchyLevel = "ZONE" | "MICRO_CLUSTER" | "TREE";

export type EntityRef = { level: HierarchyLevel; id: string };

/* ------------------------------------------------------------------ Evidence */

/**
 * Evidence is NOT truth. It is a *claim* carrying provenance, freshness,
 * reliability and a verification status. Nothing may silently convert a claim
 * into truth.
 */
export type EvidenceSource =
  | "FIELD_PHOTO" // geotagged photo, highest field fidelity
  | "FIELD_OBSERVATION"
  | "DRONE"
  | "SENSOR"
  | "WORKER_CLAIM"
  | "REPORT" // third-party / administrative report, lowest fidelity
  | "ORGANISATION_RECORD";

/** Direction of the signal a piece of evidence supports. */
export type Signal = "DISTRESS" | "IMPROVEMENT" | "NEUTRAL";

/**
 * The nature/category of the signal. Interpreted by deterministic rules
 * (severity table), NOT by an LLM silently deciding truth.
 */
export type EvidenceType =
  | "DROUGHT_STRESS"
  | "WILTED_LEAVES"
  | "DEATH"
  | "PESTS_DISEASE"
  | "WATERING_OBSERVED"
  | "HEALTHY_GREEN"
  | "NEW_GROWTH"
  | "PLANTING_DONE"
  | "STAKING_BROKEN"
  | "WATER_POINT"
  | "SOIL_DRYNESS"
  | "OTHER";

/** Where a piece of evidence currently sits in the verification pipeline. */
export type EvidenceVerificationStatus =
  | "PENDING"
  | "AUTO_PASS"
  | "FLAGGED" // failed/uncertain automated check(s)
  | "HUMAN_VERIFIED"
  | "REJECTED";

export interface Evidence {
  id: string;
  orgId: string;
  /** The entity this evidence is about. May be at cluster level (no tree ID). */
  entity: EntityRef;
  source: EvidenceSource;
  evidenceType: EvidenceType;
  signal: Signal;
  /** Claimed severity 0..1 (validated to range by the API boundary + policy). */
  severity: number;
  /** When the event is claimed to have happened (client-provided, *suspect*). */
  observedAt: number; // epoch ms
  /** When the server received it (server-authoritative timestamp). */
  capturedAt: number; // epoch ms
  /** Geotag, if present. Never trusted as authoritative; proximity is checked. */
  location: { lat: number; lng: number } | null;
  /** Who collected it. Never token-derived; resolved server-side. */
  collectorId: string | null;
  verificationStatus: EvidenceVerificationStatus;
  /** Free-form, validated, string-sized metadata bag. */
  metadata: Record<string, string | number | boolean>;
  /** Provenance / chain-of-custody note (who/what produced it). */
  provenanceNote?: string;
  /** Deterministic corruption/degradation audit chain. */
  audit?: string[];
  /** Data-honesty marker for synthetic evidence. */
  simulated?: boolean;
}

export interface EvidenceConflict {
  id: string;
  entity: EntityRef;
  evidenceIds: string[];
  /** Human+deterministic explanation of the conflict. */
  reason: string;
  detectedAt: number;
  resolved: boolean;
}

/* -------------------------------------------------------------- Assessment */

/** Quality is a *property of the evidence*, deliberately separate from decision. */
export interface EvidenceQuality {
  /** 0..1 · decays with age since observedAt. */
  freshness: number;
  /** 0..1 · source fidelity × verification status. */
  reliability: number;
  /** 0..1 · combination (geometric mean). Not a confidence score. */
  quality: number;
  /** Which evidence contributed to this aggregate. */
  contributors: string[];
  /** True when contradictory high-quality evidence is present. */
  conflicted: boolean;
  /** Count of evidence that passed quality gate (>= minQualityForDecision). */
  qualifyingCount: number;
}

/** Severity categories used to drive (with urgency + capacity) the decision. */
export type SeverityLevel = "NONE" | "LOW" | "MODERATE" | "HIGH" | "SEVERE" | "CRITICAL";
export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/* ---------------------------------------------------------------- Decision */

export type Decision = "ACT" | "INSPECT" | "MONITOR" | "DEFER" | "ESCALATE";

/** Which deterministic rule produced the decision. Keys are stable/auditable. */
export type DecisionRuleId =
  | "EXPIRED_INTERVENTION"
  | "CRITICAL_SLA"
  | "CONFLICTING_EVIDENCE"
  | "SEVERE_CAPACITY_AVAILABLE"
  | "URGENT_CAPACITY_UNAVAILABLE"
  | "URGENT_WITHOUT_REQUIREMENT"
  | "LOW_URGENCY"
  | "FALLBACK_MONITOR";

export interface DecisionResult {
  entity: EntityRef;
  decision: Decision;
  /** Ordered, human-readable, deterministic rationale. */
  reason: string[];
  ruleId: DecisionRuleId;
  evidenceUsed: string[];
  /** Deliberately separate from decision — see EvidenceQuality. */
  evidenceQuality: EvidenceQuality;
  severity: { level: SeverityLevel; score: number };
  urgency: { level: UrgencyLevel; score: number };
  criticality: Criticality;
  capacityRequirement: CapacityRequirement;
  capacity: CapacityCheckResult | null;
  /** Proposed SLA when actionable. */
  slaHours: number | null;
  nextAction: string;
  overridden: boolean; // set true by the override path, never by the engine
}

/* --------------------------------------------------------------- Capacity */

export type Criticality = "ROUTINE" | "STANDARD" | "CRITICAL" | "EMERGENCY";

export interface CapacityRequirement {
  workerHours: number;
  waterUnits: number;
  vehicle: boolean;
  workers: number;
}

export type ResourceKey = "workerHours" | "waterUnits" | "vehicle" | "workers";

export interface CapacityCheckResult {
  feasible: boolean;
  /** Per-resource shortfall (0 if satisfied). Explainable. */
  detail: Record<ResourceKey, { required: number; available: number; short: number }>;
  reason: string[];
  /** True if this capacity was reserved at the time of the check. */
  committed: boolean;
}

export interface CapacitySnapshot {
  workerHoursAvailable: number;
  waterUnitsAvailable: number;
  vehiclesAvailable: number;
  availableWorkers: number;
  /** Reserved, not-yet-consumed commitments that reduce effective capacity. */
  committedWorkerHours: number;
  committedWaterUnits: number;
  committedVehicles: number;
  committedWorkers: number;
  time: number;
}

/* ------------------------------------------------------------- Interventions */

/** Candidate interventions, actions, and the intervention catalog. */
export interface InterventionClass {
  id: string;
  label: string;
  criticality: Criticality;
  slaLimitHours: number;
  requirement: CapacityRequirement;
}

/* ------------------------------------------------------------------ Tasks */

export type TaskState =
  | "PROPOSED" // candidate, not yet committed
  | "COMMITTED" // intervention accepted, capacity reserved
  | "DISPATCHED" // assigned to a field team
  | "ACCEPTED" // worker acknowledged the dispatch
  | "IN_PROGRESS" // execution started
  | "COMPLETED" // execution finished, proof not yet submitted
  | "PROOF_SUBMITTED" // execution proof received, pending verification
  | "VERIFIED" // proof passed automated + human review
  // ---- failure / terminal branches ----
  | "EXPIRED" // SLA passed without completion
  | "ESCALATED" // handed to supervisor
  | "REJECTED" // proof failed verification
  | "CANCELLED" // withdrawn before execution
  | "REASSESS_REQUIRED"; // sent back to the decision engine

export interface Task {
  id: string;
  orgId: string;
  entity: EntityRef;
  state: TaskState;
  interventionClassId: string;
  decisionId: string | null;
  sla: Sla | null;
  /** Site where the intervention must be executed. */
  location: { lat: number; lng: number } | null;
  createdAt: number;
  committedAt: number | null;
  dispatchedAt: number | null;
  acceptedAt: number | null;
  startedAt: number | null;
  completedAt: number | null;
  proofSubmittedAt: number | null;
  verifiedAt: number | null;
  /** Server-authoritative assignment (never client-trusted). */
  assignedWorkerIds: string[];
  /** Simulated-data provenance marker. */
  simulated?: boolean;
  /** Amount of evidence-mask for synthetic data (see data-honesty module). */
}

export interface ExecutionProof {
  id: string;
  taskId: string;
  workerId: string;
  /** Client-generated idempotency key — dedupes offline retries safely. */
  submissionId: string;
  submittedAt: number; // resolved server-side
  claimedAt: number; // client-claimed timestamp (suspect)
  location: { lat: number; lng: number } | null; // client-claimed GPS (suspect)
  photoRefs: string[];
  note: string | null;
  simulated?: boolean;
}

/* ------------------------------------------------------------------ SLA */

export type SlaState = "NORMAL" | "APPROACHING" | "CRITICAL" | "EXPIRED" | "ESCALATED";

export interface Sla {
  createdAt: number;
  committedAt: number | null;
  deadline: number;
  executionAt: number | null;
  completionAt: number | null;
  verificationAt: number | null;
  state: SlaState;
}

/* --------------------------------------------------------------- Verification */

export type AutomatedCheckId =
  | "GPS_PROXIMITY"
  | "TIMESTAMP_CONSISTENCY"
  | "DUPLICATE_DETECTION"
  | "TASK_ASSOCIATION"
  | "WORKER_ASSIGNMENT";

export type AutomatedCheckStatus = "PASS" | "FLAG" | "ERROR";

export interface AutomatedCheckResult {
  id: AutomatedCheckId;
  status: AutomatedCheckStatus;
  /** Human-readable deterministic reason. */
  detail: string;
}

export type VerificationOutcome = "VERIFIED" | "REJECTED" | "NEEDS_HUMAN";

export interface VerificationResult {
  outcome: VerificationOutcome;
  checks: AutomatedCheckResult[];
  reason: string;
  humanReviewed: boolean;
}

/* -------------------------------------------------------------- Audit/override */

/** Important actions. Audit rows are append-only; there is no update/delete path. */
export interface AuditEvent {
  id: string;
  orgId: string;
  actorId: string | null; // null = system
  actorRole: Role | "SYSTEM";
  action: string;
  entityType: string;
  entityId: string;
  previousState: string | null;
  newState: string | null;
  reason: string | null;
  metadata: Record<string, string | number | boolean>;
  at: number; // server-authoritative (never client-trusted)
}

/** Overrides never silently replace a decision — both sides are retained. */
export interface Override {
  id: string;
  entity: EntityRef;
  decisionId: string;
  systemDecision: Decision;
  humanDecision: Decision;
  reason: string; // REQUIRED (enforced server-side)
  actorId: string;
  at: number;
}

/* --------------------------------------------------------------- Outcome */

/**
 * Two distinct events, stored separately:
 *   (a) did the worker perform the intervention?   -> ExecutionOutcome
 *   (b) did the tree subsequently improve/survive? -> BiologicalOutcome
 */
export interface BiologicalOutcome {
  id: string;
  entity: EntityRef;
  taskId: string | null;
  survived: boolean;
  improved: boolean;
  measuredAt: number;
  /** Which evidence supports this biological claim (re-assessed, verified). */
  evidenceIds: string[];
  simulated?: boolean;
}

/* ------------------------------------------------------------- Users/orgs */

export interface User {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string; // server-only; never exposed
}

export interface Organisation {
  id: string;
  name: string;
  /** Data-honesty marker for the whole organisation dataset. */
  dataMode: "LIVE" | "SIMULATED";
}
