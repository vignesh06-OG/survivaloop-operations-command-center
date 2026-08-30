import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceInputSchema } from "@/domain/validation-schema";
import { decide } from "@/domain/decision-engine";
import { qualityOfEvidence, conflictsDetected } from "@/domain/evidence-quality";
import { ev, NOW, policy, cap, WATER_EMERGENCY, STANDARD_MULCH, CRITICAL_PEST } from "./helpers";

// Scenario 1: fresh severe evidence + capacity available → ACT
test("scenario 1: fresh severe evidence + capacity available -> ACT", () => {
  const evidence = [
    ev({ evidenceType: "DEATH", observedAt: NOW - 3600_000, verificationStatus: "HUMAN_VERIFIED" }),
    ev({ evidenceType: "DROUGHT_STRESS", observedAt: NOW - 2 * 3600_000, verificationStatus: "HUMAN_VERIFIED" }),
  ];
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "ACT", JSON.stringify(r.reason));
  assert.equal(r.ruleId, "SEVERE_CAPACITY_AVAILABLE");
  assert.ok(r.evidenceQuality.quality >= policy.minQualityForDecision);
  assert.equal(r.capacity?.feasible, true);
});

// Scenario 2: conflicting evidence → INSPECT
test("scenario 2: conflicting high-quality evidence -> INSPECT", () => {
  const evidence = [
    ev({ evidenceType: "DEATH", observedAt: NOW - 10_000, verificationStatus: "HUMAN_VERIFIED" }),
    ev({ evidenceType: "HEALTHY_GREEN", observedAt: NOW - 10_000, verificationStatus: "HUMAN_VERIFIED" }),
  ];
  const conflicts = conflictsDetected(evidence, NOW, policy);
  assert.ok(conflicts.length >= 1, "expected a conflict");
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "INSPECT");
  assert.equal(r.ruleId, "CONFLICTING_EVIDENCE");
});

// Scenario 3: healthy reliable evidence → MONITOR
test("scenario 3: healthy reliable evidence -> MONITOR", () => {
  const evidence = [
    ev({ evidenceType: "HEALTHY_GREEN", observedAt: NOW - 3600_000, verificationStatus: "HUMAN_VERIFIED", location: { lat: 18.5, lng: 73.6 } }),
  ];
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: STANDARD_MULCH, capacity: cap(), activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "MONITOR");
});

// Scenario 4: urgent + insufficient capacity → DEFER/ESCALATE according to policy
test("scenario 4a: urgent + insufficient capacity (standard) -> DEFER", () => {
  const evidence = [ev({ evidenceType: "DEATH", observedAt: NOW - 1_000, verificationStatus: "HUMAN_VERIFIED" })];
  const poorCapacity = cap({ workerHoursAvailable: 0, waterUnitsAvailable: 0, vehiclesAvailable: 0, availableWorkers: 0 });
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: STANDARD_MULCH, capacity: poorCapacity, activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "DEFER");
  assert.equal(r.ruleId, "URGENT_CAPACITY_UNAVAILABLE");
  assert.equal(r.capacity?.feasible, false);
});

test("scenario 4b: urgent + insufficient capacity (critical) -> ESCALATE", () => {
  const evidence = [ev({ evidenceType: "DEATH", observedAt: NOW - 1_000, verificationStatus: "HUMAN_VERIFIED" })];
  const poorCapacity = cap({ workerHoursAvailable: 0, waterUnitsAvailable: 0, vehiclesAvailable: 0, availableWorkers: 0 });
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: CRITICAL_PEST, capacity: poorCapacity, activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "ESCALATE");
});

// Scenario 5: expired intervention → ESCALATE + REASSESS
test("scenario 5: expired committed intervention -> ESCALATE", () => {
  const evidence = [ev({ evidenceType: "DROUGHT_STRESS", observedAt: NOW - 3600_000 })];
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: { state: "EXPIRED" }, now: NOW }, policy);
  assert.equal(r.decision, "ESCALATE");
  assert.equal(r.ruleId, "EXPIRED_INTERVENTION");
  assert.match(r.nextAction, /[Ee]scalat/);
});

// Scenario 6: supervisor override — needs reason; keeps both decisions
import { requireOverrideReason } from "@/domain/audit";
test("scenario 6: override without reason is rejected (server-side)", () => {
  assert.throws(() => requireOverrideReason(""), /reason/);
  assert.throws(() => requireOverrideReason("   "), /reason/);
  assert.throws(() => requireOverrideReason("abc"), /at least/);
  const reason = requireOverrideReason("Owner authorised emergency watering despite drought mix.");
  assert.equal(reason.length > 10, true);
});

// Scenario 11: invalid evidence location → handled by verification policy (no silent trust)
test("scenario 11: invalid/out-of-range evidence coordinates are rejected at the boundary", () => {
  assert.ok(!evidenceInputSchema.safeParse({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, source: "FIELD_PHOTO", evidenceType: "DEATH", observedAt: NOW, location: { lat: 91, lng: 0 } }).success);
  assert.ok(!evidenceInputSchema.safeParse({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, source: "FIELD_PHOTO", evidenceType: "DEATH", observedAt: NOW, location: { lat: 0, lng: 190 } }).success);
  assert.ok(!evidenceInputSchema.safeParse({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, source: "FIELD_PHOTO", evidenceType: "DEATH", observedAt: Date.now() + 10 * 24 * 3600_000 }).success, "future timestamp rejected");
  assert.ok(evidenceInputSchema.safeParse({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, source: "FIELD_PHOTO", evidenceType: "DEATH", observedAt: NOW, location: { lat: 18.52, lng: 73.6 } }).success);
});

// Quality is separate from decision: quality stays low while decision may still be rational
test("evidence quality is NOT a confidence score; it can be low yet a decision is produced", () => {
  const evidence = [ev({ evidenceType: "DEATH", observedAt: NOW - 1000, verificationStatus: "PENDING", source: "WORKER_CLAIM" })];
  const q = qualityOfEvidence(evidence, NOW, policy);
  assert.ok(q.quality < 0.6, `low quality expected, got ${q.quality}`);
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: null, now: NOW }, policy);
  // Because grade check bounces weak evidence into INSPECT rather than ACT.
  assert.ok(["INSPECT", "MONITOR"].includes(r.decision));
});
