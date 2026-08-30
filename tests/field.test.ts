import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import { hashPassword } from "@/services/auth";

function setupApp() {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org1", name: "Test Org", dataMode: "SIMULATED" });
  repo.createUser({ id: "sup1", orgId: "org1", email: "sup@x", name: "Sup", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "worker1", orgId: "org1", email: "worker@x", name: "Worker 1", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "worker2", orgId: "org1", email: "worker2@x", name: "Worker 2", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });

  repo.createIntervention({ id: "int1", org_id: "org1", code: "INT", label: "INT", criticality: "CRITICAL", sla_limit_hours: 12, req_worker_hours: 2, req_water_units: 0, req_vehicle: 0, req_workers: 1 });
  repo.insertCapacitySnapshot({ id: "cap1", org_id: "org1", time: Date.now(), worker_hours: 40, water_units: 0, vehicles: 0, available_workers: 5, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });

  repo.createDecision({ id: "dec1", org_id: "org1", entity_level: "MICRO_CLUSTER", entity_id: "c1", decision: "ACT", rule_id: "R1", reason_json: "[]", evidence_used_json: "[]", quality_json: "{}", capacity_available_json: JSON.stringify({ feasible: true }), sla_hours: 12, next_action: "test", overridden: 0, at: Date.now() });

  const app = new AppService(repo);
  return { repo, app };
}

test("FIELD-1: Field Worker can transition assigned task and submit proof", () => {
  const { repo, app } = setupApp();
  const sup = { id: "sup1", orgId: "org1", email: "sup@x", name: "Sup", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };
  const worker1 = { id: "worker1", orgId: "org1", email: "worker@x", name: "Worker 1", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };

  // Supervisor commits and dispatches
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "c1" }, interventionId: "int1", decisionId: "dec1", workerIds: ["worker1"] });
  app.tasks.dispatch(task.id as string, ["worker1"], sup);

  let current = repo.getTask(task.id as string)!;
  assert.equal(current.state, "DISPATCHED");

  // Worker 1 accepts
  app.tasks.transition(current.id as string, "ACCEPTED", worker1);
  assert.equal(repo.getTask(current.id as string)!.state, "ACCEPTED");

  // Worker 1 starts
  app.tasks.transition(current.id as string, "IN_PROGRESS", worker1);
  assert.equal(repo.getTask(current.id as string)!.state, "IN_PROGRESS");

  // Worker 1 completes
  app.tasks.transition(current.id as string, "COMPLETED", worker1);
  assert.equal(repo.getTask(current.id as string)!.state, "COMPLETED");

  // Worker 1 submits proof
  const { proof } = app.submitProof(worker1, {
    taskId: current.id as string,
    submissionId: "sub1",
    claimedAt: Date.now(),
    location: { lat: 10, lng: 10 },

    photoRefs: ["ipfs://photo1"],
    note: "All done."
  });

  assert.equal(proof.worker_id, "worker1");
  assert.equal(proof.photo_refs_json, '["ipfs://photo1"]');
  
  // Worker 1 sets state to PROOF_SUBMITTED
  app.tasks.transition(current.id as string, "PROOF_SUBMITTED", worker1);
  assert.equal(repo.getTask(current.id as string)!.state, "PROOF_SUBMITTED");
});

test("FIELD-2: Field Worker cannot transition a task assigned to someone else", () => {
  const { repo, app } = setupApp();
  const sup = { id: "sup1", orgId: "org1", email: "sup@x", name: "Sup", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };
  const worker2 = { id: "worker2", orgId: "org1", email: "worker2@x", name: "Worker 2", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };

  // Task is assigned to worker 1
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "c1" }, interventionId: "int1", decisionId: "dec1", workerIds: ["worker1"] });
  app.tasks.dispatch(task.id as string, ["worker1"], sup);

  // Worker 2 attempts to accept
  assert.throws(() => app.tasks.transition(task.id as string, "ACCEPTED", worker2), /You are not an assigned worker/);
});
