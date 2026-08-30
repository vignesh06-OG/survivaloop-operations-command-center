import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyProof, runAutomatedChecks } from "@/domain/verification";
import { policy, NOW } from "./helpers";
import type { Task, ExecutionProof } from "@/domain/types";

function task(loc: { lat: number; lng: number } | null, workers: string[] = ["w1"]): Task {
  return {
    id: "t1", orgId: "org", entity: { level: "MICRO_CLUSTER", id: "cl_0" }, state: "PROOF_SUBMITTED",
    interventionClassId: "int", decisionId: null, sla: null, location: loc, createdAt: NOW,
    assignedWorkerIds: workers,
  } as Task;
}
function proof(over: Partial<ExecutionProof>): ExecutionProof {
  return {
    id: "p1", taskId: "t1", workerId: "w1", submissionId: "sub1", submittedAt: NOW,
    claimedAt: NOW, location: { lat: 18.52, lng: 73.6 }, photoRefs: [], note: null,
    ...over,
  };
}

test("scenario 8: duplicate execution proof is flagged & handled safely", () => {
  const t = task({ lat: 18.52, lng: 73.6 });
  const p = proof({ location: { lat: 18.52, lng: 73.6 } });
  const r = verifyProof(t, p, true, NOW, policy); // duplicateExists = true
  const dup = r.checks.find((c) => c.id === "DUPLICATE_DETECTION");
  assert.equal(dup?.status, "FLAG");
  assert.notEqual(r.outcome, "VERIFIED");
});

test("GPS proximity: far location is flagged", () => {
  const t = task({ lat: 18.52, lng: 73.6 });
  const p = proof({ location: { lat: 30.0, lng: 76.0 } }); // ~1400km away
  const r = verifyProof(t, p, false, NOW, policy);
  const gps = r.checks.find((c) => c.id === "GPS_PROXIMITY");
  assert.equal(gps?.status, "FLAG");
});

test("GPS proximity: close location passes; missing GPS is flagged", () => {
  const t = task({ lat: 18.52, lng: 73.6 });
  assert.equal(runAutomatedChecks(t, proof({ location: { lat: 18.521, lng: 73.6 } }), false, NOW, policy).find((c) => c.id === "GPS_PROXIMITY")?.status, "PASS");
  assert.equal(runAutomatedChecks(t, proof({ location: null }), false, NOW, policy).find((c) => c.id === "GPS_PROXIMITY")?.status, "FLAG");
});

test("timestamp consistency: large skew is flagged", () => {
  const t = task({ lat: 18.52, lng: 73.6 });
  const far = runAutomatedChecks(t, proof({ claimedAt: NOW - 10 * 3600_000 }), false, NOW, policy);
  assert.equal(far.find((c) => c.id === "TIMESTAMP_CONSISTENCY")?.status, "FLAG");
});

test("scenario 11: task-association & worker-assignment guards", () => {
  const t = task({ lat: 18.52, lng: 73.6 }, ["w1"]);
  const bad = runAutomatedChecks(t, proof({ workerId: "w9", taskId: "t_other" }), false, NOW, policy);
  assert.equal(bad.find((c) => c.id === "WORKER_ASSIGNMENT")?.status, "FLAG");
  assert.equal(bad.find((c) => c.id === "TASK_ASSOCIATION")?.status, "FLAG");
});

test("a fully consistent proof auto-passes (and is NOT auto-verified only when checks flag)", () => {
  const t = task({ lat: 18.52, lng: 73.6 }, ["w1"]);
  const ok = proof({ location: { lat: 18.52, lng: 73.6 }, claimedAt: NOW, workerId: "w1", taskId: "t1" });
  const r = verifyProof(t, ok, false, NOW, policy);
  assert.equal(r.outcome, "VERIFIED");
  assert.ok(r.checks.every((c) => c.status === "PASS"));
});
