import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import { buildSimulation } from "@/services/simulation";

test("full SurvivaLoop demo loop runs reproducibly (SENSE→…→OUTCOME)", () => {
  const repo = new Repo(":memory:");
  const sim = buildSimulation(repo, { scenarios: ["fresh_severe_act", "conflicting_evidence", "healthy_monitor", "capacity_shortage_defer", "task_expiry", "false_report"] });
  const app = new AppService(repo);
  const sup = { id: "u_sup", orgId: "org_demo", email: "s@x", name: "Sup", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };

  // Run decision over the simulated clusters
  const clusters = repo.listClusters(sim.orgId);
  const results = clusters.map((c) => app.runDecision(sup, "MICRO_CLUSTER", c.id as string));
  const act = results.find((r) => r.decision.decision === "ACT");
  assert.ok(act, "at least one ACT decision from fresh severe evidence");
  const inspect = results.find((r) => r.decision.decision === "INSPECT");
  assert.ok(inspect, "conflicting scenario yields INSPECT");
  const monitor = results.find((r) => r.decision.decision === "MONITOR");
  assert.ok(monitor, "healthy scenario yields MONITOR");

  // Commit an ACT decision (capacity feasible), dispatch, complete, proof, auto-verify
  const water = repo.getIntervention("int_water")!;
  const actCluster = act.decision.entity;
  const task = app.commit(sup, { entity: actCluster, interventionId: water.id as string, decisionId: act.decisionId, workerIds: ["u_w1", "u_w2"] });
  const sitepoint = repo.getEntityLocation(actCluster.level, actCluster.id)!;
  assert.ok(sitepoint, "task site resolved for GPS verification");
  assert.equal(task.state, "COMMITTED");
  app.tasks.dispatch(task.id as string, ["u_w1", "u_w2"], sup);
  const worker = { id: "u_w1", orgId: "org_demo", email: "w@x", name: "W", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };
  app.tasks.transition(task.id as string, "ACCEPTED", worker);
  app.tasks.transition(task.id as string, "IN_PROGRESS", worker);
  app.tasks.transition(task.id as string, "COMPLETED", worker);
  const { proof } = app.submitProof(worker, { taskId: task.id as string, submissionId: "loop-1", claimedAt: Date.now(), location: sitepoint, photoRefs: ["img1"], note: null });
  assert.equal(proof.verification_status, "PENDING", "submission never auto-verifies");
  const verified = app.autoVerify(sup, task.id as string, proof.id as string);
  assert.equal(verified.verification_status, "AUTO_PASS");
  const finalTask = repo.getTask(task.id as string)!;
  assert.equal(finalTask.state, "VERIFIED");

  // Biological outcome recorded separately.
  const outcome = app.recordOutcome(worker, { entityLevel: "MICRO_CLUSTER", entityId: actCluster.id, taskId: task.id as string, survived: true, improved: true, evidenceIds: [] });
  assert.equal(outcome.survived, 1);
  assert.equal(outcome.improved, 1);

  // Audit trail contains the whole journey, append-only.
  const audit = repo.listAudit(sim.orgId);
  const actions = audit.map((a) => a.action);
  assert.ok(actions.includes("DECISION_GENERATED"));
  assert.ok(actions.includes("TASK_COMMITTED"));
  assert.ok(actions.includes("PROOF_SUBMITTED"));
  assert.ok(actions.includes("AUTO_VERIFICATION"));
  assert.ok(actions.includes("OUTCOME_RECORDED"));
});

test("SLA expiry deterministically escalates a committed task", () => {
  const repo = new Repo(":memory:");
  const build = buildSimulation(repo, { scenarios: ["task_expiry"] });
  const app = new AppService(repo);
  const sup = { id: "u_sup", orgId: "org_demo", email: "s@x", name: "Sup", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };
  const clusters = repo.listClusters(build.orgId);
  // craft a task with a deadline already in the past by committing then back-dating SLA deadline
  const c = clusters[0]!;
  const run = app.runDecision(sup, "MICRO_CLUSTER", c.id as string);
  const water = repo.getIntervention("int_water")!;
  const task = app.commit(sup, { entity: run.decision.entity, interventionId: water.id as string, decisionId: run.decisionId, workerIds: ["u_w1"] });
  // back-date SLA so it is expired relative to now
  app.repo.updateTaskFields(task.id as string, { sla_deadline: Date.now() - 3600_000 });
  const moved = app.sweep(sup);
  assert.ok(moved.length >= 1, "SLA sweep detects expiry");
  const after = repo.getTask(task.id as string)!;
  assert.equal(after.state, "EXPIRED", "expired task left the live lifecycle");
  // capacity released (derived from live task rows; expired task no longer reserves)
  const committed = repo.activeCommitments(build.orgId);
  assert.equal(committed.committedWorkers, 0, "capacity released on expiry");
});
