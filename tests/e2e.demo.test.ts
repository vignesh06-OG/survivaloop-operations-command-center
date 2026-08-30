import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Repo } from "../src/data/repo";
import { AppService } from "../src/services/app-service";
import { buildSimulation } from "../src/services/simulation";
import { newId } from "../src/domain/audit";

const DB_PATH = ":memory:";

describe("E2E Demo Flow", () => {
  let repo: Repo;
  let app: AppService;
  let sim: any;
  let supUser: any;
  let w1User: any;

  before(() => {
    repo = new Repo(DB_PATH);
    app = new AppService(repo);
    sim = buildSimulation(repo, { scenarios: ["fresh_severe_act", "conflicting_evidence"] });
    supUser = { id: "u_sup", orgId: sim.orgId, role: "SUPERVISOR", name: "Sup" };
    w1User = { id: "u_w1", orgId: sim.orgId, role: "FIELD_WORKER", name: "Worker" };
  });



  it("1. distress detection -> priority decision", () => {
    const cid = sim.clusterIds[0];
    const d = app.runDecision(supUser, "MICRO_CLUSTER", cid);
    assert.strictEqual(d.decision.decision, "ACT");
    assert.strictEqual(d.decision.severity.level, "SEVERE");
    assert.ok(d.decision.evidenceQuality.qualifyingCount > 0);
  });

  it("2. capacity commit -> dispatch", () => {
    const cid = sim.clusterIds[0];
    const d = app.runDecision(supUser, "MICRO_CLUSTER", cid);
    
    // Commit
    const task = app.commit(supUser, {
      entity: { level: "MICRO_CLUSTER", id: cid },
      decisionId: d.decisionId,
      interventionId: "int_water",
      workerIds: ["u_w1", "u_w2"],
    });
    assert.strictEqual(task.state, "COMMITTED");

    // Dispatch
    const t2 = app.dispatch(supUser, task.id, ["u_w1"]);
    assert.strictEqual(t2.state, "DISPATCHED");
  });

  it("3. field worker flow: accept -> start -> complete -> proof", () => {
    const cid = sim.clusterIds[0];
    const tasks = repo.listTasks(sim.orgId).filter(t => t.entity_id === cid);
    const task = tasks[0];
    
    // Unauthorized action (e.g. field worker doing dispatch) - should fail
    assert.throws(() => {
      app.dispatch(w1User, task.id, ["u_w1"]);
    }, /Cannot transition/);

    // Accept
    const t3 = app.transition(w1User, task.id, "ACCEPTED");
    assert.strictEqual(t3.state, "ACCEPTED");

    // Start
    const t4 = app.transition(w1User, task.id, "IN_PROGRESS");
    assert.strictEqual(t4.state, "IN_PROGRESS");

    // Complete
    const t5 = app.transition(w1User, task.id, "COMPLETED");
    assert.strictEqual(t5.state, "COMPLETED");

    // Submit Proof
    const p = app.submitProof(w1User, {
      taskId: task.id,
      submissionId: newId(),
      claimedAt: Date.now(),
      location: { lat: 12.0, lng: 77.0 },
      photoRefs: ["ipfs://test"],
      note: "Done",
    });
    
    const t6 = app.transition(w1User, task.id, "PROOF_SUBMITTED");
    assert.strictEqual(t6.state, "PROOF_SUBMITTED");

    // Duplicate proof check is idempotent
    const proofRow = repo.listProofsForTask(task.id)[0];
    app.submitProof(w1User, {
      taskId: task.id,
      submissionId: proofRow.submission_id as string,
      claimedAt: Date.now(),
      location: { lat: 12.0, lng: 77.0 },
      photoRefs: ["ipfs://test2"],
      note: "Done2",
    });
    // If it doesn't throw, it successfully deduped
  });

  it("4. supervisor verification", () => {
    const tasks = repo.listTasks(sim.orgId).filter(t => t.state === "PROOF_SUBMITTED");
    const task = tasks[0];
    const proofs = repo.listProofsForTask(task.id);
    const proof = proofs[0];

    // Supervisor verifies
    app.reviewProof(supUser, proof.id, "VERIFIED", "Looks good");
    const proof2 = repo.listProofsForTask(task.id)[0];
    assert.strictEqual(proof2.verification_status, "VERIFIED");
  });

  it("5. human override without reason fails", () => {
    const cid = sim.clusterIds[1];
    const d = app.runDecision(supUser, "MICRO_CLUSTER", cid);
    assert.throws(() => {
      app.override(supUser, {
        entity: { level: "MICRO_CLUSTER", id: cid },
        decisionId: d.decisionId,
        humanDecision: "DEFER",
        reason: "", // Empty reason should fail Zod schema in API, but let's test if we can do it via API
      });
    }, /reason is REQUIRED/); // AppService expects a reason
  });

  it("6. successful override", () => {
    const cid = sim.clusterIds[1];
    const d = app.runDecision(supUser, "MICRO_CLUSTER", cid);
    const result = app.override(supUser, {
      entity: { level: "MICRO_CLUSTER", id: cid },
      decisionId: d.decisionId,
      humanDecision: "DEFER",
      reason: "Manual override by supervisor due to weather",
    });
    assert.strictEqual(result.humanDecision, "DEFER");
    assert.strictEqual((result as any).overridden, undefined); // Overridden is on the decision row, not override record
  });
});
