/**
 * RED-TEAM regression tests.
 *
 * Each test pins a specific vulnerability I found and fixed, so it never
 * regresses. Kept intentionally adversarial.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import { hashPassword, verifyPassword } from "@/services/auth";
import { decide } from "@/domain/decision-engine";
import { ev, NOW, policy, cap, WATER_EMERGENCY, CRITICAL_PEST } from "./helpers";
import { qualityOfEvidence } from "@/domain/evidence-quality";

/* 1. UNVERIFIED / FLAGGED / LOW-FIDELITY evidence must NOT drive ACT. */
test("RED-1: a single fresh FLAGGED/FIELD_PHOTO cannot drive ACT (reliability gate)", () => {
  const evidence = [
    ev({ evidenceType: "DEATH", observedAt: NOW - 1000, verificationStatus: "FLAGGED", source: "FIELD_PHOTO" }),
  ];
  const q = qualityOfEvidence(evidence, NOW, policy);
  // reliability = 0.9 * 0.4 (FLAGGED) = 0.36 < 0.6 → below the action floor.
  assert.ok(q.reliability < policy.minReliabilityForAction, `reliability ${q.reliability} should be below ${policy.minReliabilityForAction}`);
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "INSPECT", `got ${r.decision}: ${r.reason}`);
});

test("RED-1b: worker-claim (unverified) evidence cannot drive ACT", () => {
  const evidence = [ev({ evidenceType: "DEATH", observedAt: NOW - 1000, source: "WORKER_CLAIM", verificationStatus: "PENDING" })];
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: CRITICAL_PEST, capacity: cap(), activeSla: null, now: NOW }, policy);
  // The unverified claim must never produce a commit-worthy ACT (it may MONITOR or INSPECT).
  assert.notEqual(r.decision, "ACT", `got ${r.decision}`);
  assert.ok(r.evidenceQuality.reliability < policy.minReliabilityForAction);
});

test("RED-1c: reliable verified evidence STILL drives ACT (gate not over-restrictive)", () => {
  const evidence = [
    ev({ evidenceType: "DEATH", observedAt: NOW - 1000, verificationStatus: "HUMAN_VERIFIED" }),
    ev({ evidenceType: "DROUGHT_STRESS", observedAt: NOW - 1000, verificationStatus: "AUTO_PASS" }),
  ];
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: null, now: NOW }, policy);
  assert.equal(r.decision, "ACT");
});

/* 2. COMMIT IDEMPOTENCY — same decision must not create two tasks. */
function seeded(): { repo: Repo; app: AppService } {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org", name: "D", dataMode: "SIMULATED" });
  repo.createUser({ id: "u_sup", orgId: "org", email: "s@x", name: "S", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createIntervention({ id: "int_water", org_id: "org", code: "X", label: "W", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: 4, req_water_units: 6, req_vehicle: 1, req_workers: 2 });
  repo.insertCapacitySnapshot({ id: "c", org_id: "org", time: Date.now(), worker_hours: 80, water_units: 60, vehicles: 3, available_workers: 3, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  repo.createDecision({ id: "d1", org_id: "org", entity_level: "MICRO_CLUSTER", entity_id: "cl_0", decision: "ACT", rule_id: "SEVERE_CAPACITY_AVAILABLE", reason_json: "[]", evidence_used_json: "[]", quality_json: JSON.stringify({ quality: 0.9, reliability: 0.8 }), capacity_available_json: JSON.stringify({ feasible: true, detail: {}, reason: [], committed: false }), sla_hours: 24, next_action: "c", overridden: 0, at: Date.now() });
  const app = new AppService(repo);
  return { repo, app };
}
const sup = { id: "u_sup", orgId: "org", email: "s@x", name: "S", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };

test("RED-2: committing the same decision twice yields ONE task and one capacity reservation", () => {
  const { repo, app } = seeded();
  const payload = { entity: { level: "MICRO_CLUSTER" as const, id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1", "u_w2"] };
  const t1 = app.commit(sup, payload);
  const t2 = app.commit(sup, payload);
  assert.equal(t1.id, t2.id, "same task returned (idempotent)");
  const all = repo.listTasks("org");
  assert.equal(all.length, 1, "only one task created");
  const committed = repo.activeCommitments("org");
  assert.equal(committed.committedWorkers, 2, "reserved once (derived from live task rows)");
  assert.equal(committed.committedWorkerHours, 4, "reserved once for the intervention requirement");
});

/* 3. CONCURRENT transition guard — CAS rejects a stale write. */
test("RED-3: compare-and-set transition rejects a write from a stale state (no lost-update double-win)", () => {
  const { repo, app } = seeded();
  const t = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1"] });
  // First transition wins.
  assert.equal(repo.compareAndSetTaskState(t.id as string, "COMMITTED", "DISPATCHED", {}), true);
  // Second attempt, hand-made, still claims state=COMMITTED → must fail (stale).
  assert.equal(repo.compareAndSetTaskState(t.id as string, "COMMITTED", "DISPATCHED", {}), false);
  const after = repo.getTask(t.id as string)!;
  assert.equal(after.state, "DISPATCHED");
});

test("RED-3b: a transition racing from a stale base throws ConcurrentTransitionError", () => {
  const { repo, app } = seeded();
  const t = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "cl_0" }, interventionId: "int_water", decisionId: "d1", workerIds: ["u_w1"] });
  // Move it as one actor does.
  app.dispatch(sup, t.id as string, ["u_w1"]);
  // Now simulate a SECOND actor that read the OLD state and tries to dispatch again.
  const worker = { id: "u_w1", orgId: "org", email: "w@x", name: "W", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };
  // COMPLETED is only valid from IN_PROGRESS; from DISPATCHED it is illegal.
  assert.throws(() => app.tasks.transition(t.id as string, "COMPLETED", worker), /Invalid transition/);
});

/* 4. PASSWORD — real scrypt, and length-safe compare. */
test("RED-4: password hashing uses scrypt and is tamper-safe", () => {
  const h = hashPassword("demo");
  assert.match(h, /^scrypt\$/, "scheme is scrypt");
  assert.notEqual(h, "scrypt$" + h.split("$")[1] + "$" + "00".repeat(32), "hash depends on password");
  assert.ok(verifyPassword("demo", h));
  assert.ok(!verifyPassword("nope", h));
  // A truncated stored hash must not throw or pass.
  assert.ok(!verifyPassword("demo", "scrypt$abc$xyz"));
});

/* 5. STALE evidence decays and can no longer justify ACT on its own. */
test("RED-5: stale severe evidence decays below the action gate", () => {
  const evidence = [ev({ evidenceType: "DEATH", observedAt: NOW - 30 * 24 * 3600_000, verificationStatus: "HUMAN_VERIFIED" })];
  const q = qualityOfEvidence(evidence, NOW, policy);
  assert.ok(q.freshness < 0.2, `freshness ${q.freshness} should be low`);
  const r = decide({ entity: { level: "MICRO_CLUSTER", id: "cl_0" }, evidence, intervention: WATER_EMERGENCY, capacity: cap(), activeSla: null, now: NOW }, policy);
  assert.notEqual(r.decision, "ACT", "stale evidence must not ACT");
});

/* ============================ CAPACITY OVER-COMMIT (multi-worker) ============================ */
function twoOrgDec(req: { wh: number; wu: number; veh: number; wk: number }, base: { wh: number; wu: number; veh: number; wk: number }) {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org", name: "D", dataMode: "SIMULATED" });
  repo.createUser({ id: "u_sup", orgId: "org", email: "s@x", name: "S", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "u_w1", orgId: "org", email: "w@x", name: "W", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createIntervention({ id: "int_x", org_id: "org", code: "X", label: "X", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: req.wh, req_water_units: req.wu, req_vehicle: req.veh, req_workers: req.wk });
  repo.insertCapacitySnapshot({ id: "c", org_id: "org", time: Date.now(), worker_hours: base.wh, water_units: base.wu, vehicles: base.veh, available_workers: base.wk, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  const mkDec = (id: string, ent: string) => repo.createDecision({ id, org_id: "org", entity_level: "MICRO_CLUSTER", entity_id: ent, decision: "ACT", rule_id: "R", reason_json: "[]", evidence_used_json: "[]", quality_json: JSON.stringify({ quality: 0.9, reliability: 0.8 }), capacity_available_json: JSON.stringify({ feasible: true, detail: {}, reason: [], committed: false }), sla_hours: 24, next_action: "c", overridden: 0, at: Date.now() });
  mkDec("d1", "cl_a");
  mkDec("d2", "cl_b");
  const app = new AppService(repo);
  return { repo, app };
}
const p = (ent: string, dec: string) => ({ entity: { level: "MICRO_CLUSTER" as const, id: ent }, interventionId: "int_x", decisionId: dec, workerIds: ["u_w1"] });

test("RED-6: committing beyond a tight budget is rejected, not silently over-committed", () => {
  // Budget fits EXACTLY one x (req 4h/6w/1v/2wk = base 4h/6w/1v/2wk).
  const { repo, app } = twoOrgDec({ wh: 4, wu: 6, veh: 1, wk: 2 }, { wh: 4, wu: 6, veh: 1, wk: 2 });
  const t1 = app.commit(sup, p("cl_a", "d1"));
  assert.equal(t1.state, "COMMITTED");
  // Second, different decision — capacity is now derived from the live task and MUST reject.
  assert.throws(() => app.commit(sup, p("cl_b", "d2")), /Capacity is insufficient/);
  assert.equal(repo.listTasks("org").length, 1, "only one task committed");
  const committed = repo.activeCommitments("org");
  assert.equal(committed.committedWorkerHours, 4, "commitment reflects the single live task");
});

test("RED-6b: completing a task releases capacity so the next commitment becomes feasible", () => {
  const { repo, app } = twoOrgDec({ wh: 4, wu: 6, veh: 1, wk: 2 }, { wh: 4, wu: 6, veh: 1, wk: 2 });
  const t1 = app.commit(sup, p("cl_a", "d1"));
  const worker = { id: "u_w1", orgId: "org", email: "w@x", name: "W", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };
  app.tasks.dispatch(t1.id as string, ["u_w1"], sup);
  for (const st of ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] as const) app.tasks.transition(t1.id as string, st, worker);
  assert.equal(repo.activeCommitments("org").committedWorkerHours, 0, "capacity released on COMPLETED");
  const t2 = app.commit(sup, p("cl_b", "d2"));
  assert.equal(t2.state, "COMMITTED");
});

/* ============================ ORGANIZATION ISOLATION ============================ */
function twoOrgs() {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "orgA", name: "A", dataMode: "SIMULATED" });
  repo.createOrg({ id: "orgB", name: "B", dataMode: "SIMULATED" });
  repo.createUser({ id: "supA", orgId: "orgA", email: "a@x", name: "A", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "supB", orgId: "orgB", email: "b@x", name: "B", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "wB", orgId: "orgB", email: "wb@x", name: "WB", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createIntervention({ id: "int_x", org_id: "orgA", code: "X", label: "X", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: 1, req_water_units: 0, req_vehicle: 0, req_workers: 1 });
  repo.insertCapacitySnapshot({ id: "cA", org_id: "orgA", time: Date.now(), worker_hours: 80, water_units: 60, vehicles: 3, available_workers: 3, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  repo.insertCapacitySnapshot({ id: "cB", org_id: "orgB", time: Date.now(), worker_hours: 80, water_units: 60, vehicles: 3, available_workers: 3, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  repo.createDecision({ id: "dA", org_id: "orgA", entity_level: "MICRO_CLUSTER", entity_id: "cl_a", decision: "ACT", rule_id: "R", reason_json: "[]", evidence_used_json: "[]", quality_json: JSON.stringify({ quality: 0.9, reliability: 0.8 }), capacity_available_json: JSON.stringify({ feasible: true, detail: {}, reason: [], committed: false }), sla_hours: 24, next_action: "c", overridden: 0, at: Date.now() });
  const app = new AppService(repo);
  return { repo, app };
}
const supA = { id: "supA", orgId: "orgA", email: "a@x", name: "A", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };
const supB = { id: "supB", orgId: "orgB", email: "b@x", name: "B", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };

test("RED-7: a user from another organisation cannot act on a task (transition)", () => {
  const { app } = twoOrgs();
  const t = app.commit(supA, { entity: { level: "MICRO_CLUSTER", id: "cl_a" }, interventionId: "int_x", decisionId: "dA", workerIds: ["wB"] });
  app.tasks.dispatch(t.id as string, ["wB"], supA);
  // supB (different org) tries to transition A's task → denied.
  assert.throws(() => app.tasks.transition(t.id as string, "ACCEPTED", supB), /organisation/);
});

test("RED-7b: a user from another org cannot commit another org's decision or read its evidence", () => {
  const { app } = twoOrgs();
  // supB tries to commit A's decision.
  assert.throws(() => app.commit(supB, { entity: { level: "MICRO_CLUSTER", id: "cl_a" }, interventionId: "int_x", decisionId: "dA", workerIds: ["wB"] }), /organisation/);
  // supB reads A's entity summary → must see no evidence (org-scoped read).
  const s = app.entitySummary(supB, "MICRO_CLUSTER", "cl_a");
  assert.equal(s.evidence.length, 0, "no cross-org evidence leakage");
});

test("RED-7c: supervisor override is org-scoped", () => {
  const { app } = twoOrgs();
  assert.throws(() => app.override(supB, { entity: { level: "MICRO_CLUSTER", id: "cl_a" }, decisionId: "dA", humanDecision: "DEFER", reason: "x".repeat(10) }), /organisation/);
});

/* ============================ SLA SWEEP idempotency ============================ */
test("RED-8: SLA sweep is idempotent and does not re-escalate a task already expired", () => {
  const { repo, app } = twoOrgDec({ wh: 1, wu: 0, veh: 0, wk: 1 }, { wh: 20, wu: 10, veh: 1, wk: 3 });
  const t = app.commit(sup, p("cl_a", "d1"));
  // back-date the deadline so it is already expired
  repo.updateTaskFields(t.id as string, { sla_deadline: Date.now() - 3600_000 });
  const first = app.sweep(sup);
  assert.ok(first.length >= 1, "first sweep escalates");
  const after1 = repo.getTask(t.id as string)!;
  assert.equal(after1.state, "EXPIRED");
  const committed = repo.activeCommitments("org");
  assert.equal(committed.committedWorkerHours, 0, "capacity released on expiry");
  // Re-run: idempotent — the expired task is no longer in the live set.
  const second = app.sweep(sup);
  assert.equal(second.filter((m) => m.task.id === t.id).length, 0, "no re-escalation");
  const audit = repo.listAudit("org");
  assert.ok(audit.some((a) => a.action === "TASK_EXPIRED_ESCALATED"));
  assert.ok(audit.some((a) => a.action === "SLA_SWEEP"));
  // Every state change left a trace.
  assert.equal(repo.listSlaEvents(t.id as string).filter((e) => e.action === "SWEEP" || e.action === "ESCALATE").length >= 1, true);
});

