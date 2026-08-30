import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import type { SessionUser } from "@/services/auth";
import { hashPassword } from "@/services/auth";
import { InvalidTransitionError } from "@/domain/task-state";

function seed(): { repo: Repo; app: AppService } {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org", name: "Demo", dataMode: "SIMULATED" });
  repo.createUser({ id: "u_sup", orgId: "org", email: "s@x", name: "Sup", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "u_w1", orgId: "org", email: "w1@x", name: "W1", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createIntervention({ id: "int_water", org_id: "org", code: "EMERGENCY_WATERING", label: "Water", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: 4, req_water_units: 6, req_vehicle: 1, req_workers: 2 });
  repo.insertCapacitySnapshot({ id: "cap1", org_id: "org", time: Date.now(), worker_hours: 80, water_units: 60, vehicles: 3, available_workers: 3, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  repo.createDecision({ id: "d1", org_id: "org", entity_level: "MICRO_CLUSTER", entity_id: "cl_0", decision: "ACT", rule_id: "SEVERE_CAPACITY_AVAILABLE", reason_json: JSON.stringify(["x"]), evidence_used_json: JSON.stringify([]), quality_json: JSON.stringify({ quality: 0.9 }), capacity_available_json: JSON.stringify({ feasible: true, detail: {}, reason: [], committed: false }), sla_hours: 24, next_action: "commit", overridden: 0, at: Date.now() });
  const app = new AppService(repo);
  return { repo, app };
}
const sess = (id: string, role: any = "FIELD_WORKER"): SessionUser => ({ id, orgId: "org", email: id + "@x", name: id, role, dataMode: "SIMULATED" });

function driveToCompleted(app: AppService): { taskId: string; worker: SessionUser; sup: SessionUser } {
  const sup = sess("u_sup", "SUPERVISOR");
  const worker = sess("u_w1", "FIELD_WORKER");
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1"] });
  app.tasks.dispatch(task.id, ["u_w1"], sup);
  app.tasks.transition(task.id, "ACCEPTED", worker);
  app.tasks.transition(task.id, "IN_PROGRESS", worker);
  app.tasks.transition(task.id, "COMPLETED", worker);
  return { taskId: task.id, worker, sup };
}

test("scenario 9: offline proof retry is idempotent (same submissionId deduped)", () => {
  const { app } = seed();
  const { taskId, worker } = driveToCompleted(app);
  const submit = () => app.submitProof(worker, { taskId, submissionId: "offline-uuid-1", claimedAt: Date.now(), location: { lat: 18.52, lng: 73.6 }, photoRefs: ["img"], note: null });
  const first = submit();
  assert.equal(first.duplicate, false);
  const second = submit();
  assert.equal(second.duplicate, true, "retry must be recognised as a duplicate");
  assert.equal(second.proof.id, first.proof.id, "same proof row returned (idempotent)");
});

test("offline resubmission after going COMPLETED moves the task to PROOF_SUBMITTED", () => {
  const { app } = seed();
  const { taskId, worker } = driveToCompleted(app);
  const { proof } = app.submitProof(worker, { taskId, submissionId: "offline-uuid-2", claimedAt: Date.now(), location: { lat: 18.52, lng: 73.6 }, photoRefs: [], note: null });
  assert.equal(proof.task_id, taskId);
  const task = app.repo.getTask(taskId)!;
  assert.equal(task.state, "PROOF_SUBMITTED");
});

test("scenario 10: invalid transition server-side is rejected (IN_PROGRESS from ACCEPTED ordering etc.)", () => {
  const { app } = seed();
  const sup = sess("u_sup", "SUPERVISOR");
  const worker = sess("u_w1", "FIELD_WORKER");
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1"] });
  // Cannot skip DISPATCH -> jump straight to VERIFIED from COMMITTED
  assert.throws(() => app.tasks.transition(task.id, "VERIFIED", sup), InvalidTransitionError);
  // Cannot go COMPLETED backwards
  app.tasks.dispatch(task.id, ["u_w1"], sup);
  app.tasks.transition(task.id, "ACCEPTED", worker);
  assert.throws(() => app.tasks.transition(task.id, "COMMITTED", sup), InvalidTransitionError);
});
