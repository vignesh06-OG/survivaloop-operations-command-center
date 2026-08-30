import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "@/data/repo";
import { AppService, PermissionDeniedError } from "@/services/app-service";
import type { SessionUser } from "@/services/auth";
import { hashPassword, verifyPassword } from "@/services/auth";
import type { DecisionResult, Role } from "@/domain/types";
import { roleHas } from "@/domain/permissions";

function seedRepo(): Repo {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org", name: "Demo", dataMode: "SIMULATED" });
  repo.createUser({ id: "u_admin", orgId: "org", email: "a@x", name: "Admin", role: "ADMIN", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "u_sup", orgId: "org", email: "s@x", name: "Sup", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "u_w1", orgId: "org", email: "w1@x", name: "W1", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "u_w2", orgId: "org", email: "w2@x", name: "W2", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "u_aud", orgId: "org", email: "au@x", name: "Aud", role: "AUDITOR", passwordHash: hashPassword("demo") });
  repo.createIntervention({ id: "int_water", org_id: "org", code: "EMERGENCY_WATERING", label: "Water", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: 4, req_water_units: 6, req_vehicle: 1, req_workers: 2 });
  repo.insertCapacitySnapshot({ id: "cap1", org_id: "org", time: Date.now(), worker_hours: 80, water_units: 60, vehicles: 3, available_workers: 3, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  repo.createDecision({ id: "d1", org_id: "org", entity_level: "MICRO_CLUSTER", entity_id: "cl_0", decision: "ACT", rule_id: "SEVERE_CAPACITY_AVAILABLE", reason_json: JSON.stringify(["x"]), evidence_used_json: JSON.stringify([]), quality_json: JSON.stringify({ quality: 0.9, conflcted: false }), capacity_available_json: JSON.stringify({ feasible: true, detail: {}, reason: [], committed: false }), sla_hours: 24, next_action: "commit", overridden: 0, at: Date.now() });
  return repo;
}
function sess(id: string, role: Role, org: string = "org"): SessionUser {
  return { id, orgId: org, email: id + "@x", name: id, role, dataMode: "SIMULATED" };
}
function decision(workers: number = 2): DecisionResult {
  return {
    entity: { level: "MICRO_CLUSTER", id: "cl_0" },
    decision: "ACT", ruleId: "SEVERE_CAPACITY_AVAILABLE", nextAction: "commit",
    reason: ["x"], evidenceUsed: [], evidenceQuality: { freshness: 1, reliability: 1, quality: 0.9, conflicted: false, contributors: [], qualifyingCount: 1 },
    severity: { level: "HIGH", score: 0.8 }, urgency: { level: "HIGH", score: 0.8 }, criticality: "EMERGENCY",
    capacityRequirement: { workerHours: 4, waterUnits: 6, vehicle: true, workers },
    capacity: { feasible: true, detail: {} as any, reason: [], committed: false },
    slaHours: 24, overridden: false,
  };
}

test("scenario 7: unauthorized worker cannot create/propose tasks", () => {
  const repo = seedRepo();
  const app = new AppService(repo);
  const worker = sess("u_w1", "FIELD_WORKER");
  assert.throws(() => app.commit(worker, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1"] }), PermissionDeniedError);
});

test("scenario 7b: supervisor and admin can commit", () => {
  const repo = seedRepo();
  const app = new AppService(repo);
  const task = app.commit(sess("u_sup", "SUPERVISOR"), { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1", "u_w2"] });
  assert.equal(task.state, "COMMITTED");
});

test("scenario 12: worker cannot act on another worker's task", () => {
  const repo = seedRepo();
  const app = new AppService(repo);
  const sup = sess("u_sup", "SUPERVISOR");
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1"] });
  app.tasks.dispatch(task.id, ["u_w1"], sup); // assign only w1
  // w2 is NOT assigned → DENIED (assignment gate fires before state check)
  assert.throws(() => app.tasks.transition(task.id, "ACCEPTED", sess("u_w2", "FIELD_WORKER")), PermissionDeniedError);
  // w1 IS assigned → allowed
  const accepted = app.tasks.transition(task.id, "ACCEPTED", sess("u_w1", "FIELD_WORKER"));
  assert.equal(accepted.state, "ACCEPTED");
});

test("scenario 6: override requires a reason and records both decisions", () => {
  const repo = seedRepo();
  const app = new AppService(repo);
  const sup = sess("u_sup", "SUPERVISOR");
  // create a decision row via runDecision? add evidence first
  const now = Date.now();
  repo.createEvidence({ id: "e1", org_id: "org", entity_level: "MICRO_CLUSTER", entity_id: "cl_0", source: "FIELD_PHOTO", evidence_type: "DEATH", signal: "DISTRESS", implied_severity: 0.95, observed_at: now, captured_at: now, lat: 18, lng: 73, collector_id: null, verification_status: "HUMAN_VERIFIED", metadata_json: "{}", provenance_note: null, simulated: 0 });
  const run = app.runDecision(sup, "MICRO_CLUSTER", "cl_0");
  assert.equal(run.decision.decision, "ACT");
  assert.throws(() => app.override(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, decisionId: run.decisionId, humanDecision: "DEFER", reason: "" }), /reason/);
  const o = app.override(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, decisionId: run.decisionId, humanDecision: "DEFER", reason: "Owner instructed to prioritise a different site this cycle." });
  assert.equal(o.systemDecision, "ACT");
  assert.equal(o.humanDecision, "DEFER");
  assert.ok(o.reason.length > 10);
  const d = repo.getDecision(run.decisionId)!;
  assert.equal(d.overridden, 1);
});

test("password hashing is salted and verifies", () => {
  const h1 = hashPassword("demo");
  const h2 = hashPassword("demo");
  assert.notEqual(h1, h2, "salts differ");
  assert.ok(verifyPassword("demo", h1));
  assert.ok(!verifyPassword("wrong", h1));
});

test("auditor has read caps but no write caps (roleHas)", () => {
  assert.ok(roleHas("AUDITOR", "view_audit_trail"));
  assert.ok(!roleHas("AUDITOR", "create_task"));
  assert.ok(!roleHas("AUDITOR", "review_proof"));
  assert.ok(!roleHas("FIELD_WORKER", "override_decision"));
});
