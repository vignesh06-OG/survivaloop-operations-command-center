/**
 * SurvivaLoop — centralized Zod validation at every API boundary.
 * Server-side strict validation. Nothing client-trusted is accepted without
 * bounds; spatial coordinates are clamped to valid ranges; timestamps are
 * bounded and treated as *claims*, never authoritative.
 */
import { z } from "zod";
import type {
  Decision,
  EvidenceType,
  HierarchyLevel,
  Signal,
  EvidenceSource,
} from "./types";

export const DECISION_VALUES: readonly Decision[] = ["ACT", "INSPECT", "MONITOR", "DEFER", "ESCALATE"];
const decisionEnum = () => z.enum(DECISION_VALUES as unknown as [Decision, ...Decision[]]);

export const latSchema = z.number().min(-90).max(90);
export const lngSchema = z.number().min(-180).max(180);
export const pointSchema = z.object({ lat: latSchema, lng: lngSchema });

export const entitySchema = z.object({
  level: z.enum(["ZONE", "MICRO_CLUSTER", "TREE"] as const),
  id: z.string().min(1).max(128),
});
export type EntityInput = z.infer<typeof entitySchema>;

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  "DROUGHT_STRESS", "WILTED_LEAVES", "DEATH", "PESTS_DISEASE", "WATERING_OBSERVED",
  "HEALTHY_GREEN", "NEW_GROWTH", "PLANTING_DONE", "STAKING_BROKEN", "WATER_POINT",
  "SOIL_DRYNESS", "OTHER",
];
export const SIGNALS: readonly Signal[] = ["DISTRESS", "IMPROVEMENT", "NEUTRAL"];
export const SOURCES: readonly EvidenceSource[] = [
  "FIELD_PHOTO", "FIELD_OBSERVATION", "DRONE", "SENSOR", "WORKER_CLAIM", "REPORT", "ORGANISATION_RECORD",
];

/** Evidence ingest payload. Severity is derived from type, not trusted from client. */
export const evidenceInputSchema = z.object({
  entity: entitySchema,
  source: z.enum(SOURCES as unknown as [EvidenceSource, ...EvidenceSource[]]),
  evidenceType: z.enum(EVIDENCE_TYPES as unknown as [EvidenceType, ...EvidenceType[]]),
  /** Uploader's claimed signal — validated but the engine uses implied signal. */
  claimedSignal: z.enum(SIGNALS as unknown as [Signal, ...Signal[]]).optional(),
  observedAt: z.number().safe().int().max(Date.now() + 5 * 60 * 1000), // no future stamping
  location: pointSchema.nullable().optional(),
  collectorId: z.string().min(1).max(128).nullable().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  provenanceNote: z.string().max(1000).optional(),
});
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

export const proofInputSchema = z.object({
  taskId: z.string().min(1).max(128),
  /** idempotency key for offline retries. */
  submissionId: z.string().min(1).max(160),
  claimedAt: z.number().safe().int(),
  location: pointSchema.nullable().optional(),
  photoRefs: z.array(z.string().min(1).max(512)).max(10).optional(),
  note: z.string().max(4000).nullable().optional(),
});
export type ProofInput = z.infer<typeof proofInputSchema>;

export const overrideInputCoreSchema = z.object({
  entity: entitySchema,
  decisionId: z.string().min(1).max(128),
  humanDecision: z.enum(DECISION_VALUES as unknown as [Decision, ...Decision[]]),
  reason: z.string().min(1).max(1000),
});

export const taskTransitionSchema = z.object({
  to: z.enum([
    "PROPOSED", "COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS", "COMPLETED",
    "PROOF_SUBMITTED", "VERIFIED", "EXPIRED", "ESCALATED", "REJECTED", "CANCELLED",
    "REASSESS_REQUIRED",
  ]),
  reason: z.string().max(1000).optional(),
});
export type TaskTransitionInput = z.infer<typeof taskTransitionSchema>;

export const reassignSchema = z.object({
  workerIds: z.array(z.string().min(1).max(128)).min(1).max(20),
});

export const assessmentTriggerSchema = z.object({
  entity: entitySchema,
});

/** Offline sync batch. Each event carries a client idempotency key. */
export const syncEventSchema = z.object({
  eventId: z.string().min(1).max(160),
  type: z.literal("EVIDENCE"),
  entity: entitySchema,
  source: z.enum(SOURCES as unknown as [EvidenceSource, ...EvidenceSource[]]),
  evidenceType: z.enum(EVIDENCE_TYPES as unknown as [EvidenceType, ...EvidenceType[]]),
  observedAt: z.number().safe().int().max(Date.now() + 5 * 60 * 1000),
  location: pointSchema.nullable().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});
export const syncBatchSchema = z.object({
  deviceId: z.string().min(1).max(160),
  events: z.array(syncEventSchema).min(1).max(200),
});
