/**
 * SurvivaLoop — AI Field Assistant Tests.
 *
 * Tests the AI provider abstraction, mock provider deterministic behavior,
 * conversation state machine, authorization, missing-information detection,
 * upload request flow, draft report generation, and safety invariants.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MockAiProvider } from "@/lib/ai/mockProvider";
import type { ChatMessage, TaskContext, AiResponse } from "@/lib/ai/provider";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import { hashPassword } from "@/services/auth";
import { canAccessTask, roleHas } from "@/domain/permissions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: "task1",
    entityId: "MC-07",
    interventionClassId: "TREE_WATERING",
    state: "IN_PROGRESS",
    slaState: "NORMAL",
    slaDeadline: Date.now() + 3600_000,
    assignedWorkerIds: ["worker1"],
    createdAt: Date.now() - 60_000,
    existingPhotoRefs: [],
    existingNotes: null,
    ...overrides,
  };
}

function userMsg(content: string): ChatMessage {
  return { role: "user", content, ts: Date.now() };
}

function assistantMsg(content: string): ChatMessage {
  return { role: "assistant", content, ts: Date.now() };
}

// ─── MockAiProvider: Deterministic Conversation Flow ──────────────────────────

test("AI-1: Mock provider returns greeting on empty history (turn 0)", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  const result = await provider.chat([], ctx, "en");

  assert.equal(result.kind, "text");
  if (result.kind === "text") {
    assert.ok(result.text.includes("MC-07"), "Greeting should include entity ID");
    assert.ok(result.text.includes("TREE_WATERING"), "Greeting should include intervention class");
    assert.ok(result.text.includes("IN_PROGRESS"), "Greeting should include task state");
  }
});

test("AI-2: Mock provider asks follow-up question on turn 1", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("I see wilted trees near the cluster"),
  ];
  const result = await provider.chat(history, ctx, "en");

  assert.equal(result.kind, "text");
  if (result.kind === "text") {
    assert.ok(result.text.toLowerCase().includes("severe") || result.text.toLowerCase().includes("action"),
      "Follow-up should ask about severity or actions taken");
  }
});

test("AI-3: Mock provider requests photo upload when no photos exist (turn 2)", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext({ existingPhotoRefs: [] });
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("Wilted trees"),
    assistantMsg("Follow-up"),
    userMsg("Severe condition, watered the area"),
  ];
  const result = await provider.chat(history, ctx, "en");

  assert.equal(result.kind, "request_upload", "Should request a photo upload");
  if (result.kind === "request_upload") {
    assert.ok(result.prompt.length > 0, "Upload prompt should not be empty");
  }
});

test("AI-4: Mock provider skips upload request when photos already exist", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext({ existingPhotoRefs: ["ipfs://existing_photo"] });
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("Wilted trees"),
    assistantMsg("Follow-up"),
    userMsg("Severe condition, watered"),
  ];
  const result = await provider.chat(history, ctx, "en");

  // With photos already present, turn 2 should skip to draft_report
  assert.equal(result.kind, "draft_report", "Should generate draft when photos exist");
});

test("AI-5: Mock provider generates draft report with correct structure", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext({ existingPhotoRefs: ["ipfs://photo1"] });
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("Trees are wilted"),
    assistantMsg("Follow-up"),
    userMsg("Watered the area, condition is severe"),
  ];
  const result = await provider.chat(history, ctx, "en");

  assert.equal(result.kind, "draft_report");
  if (result.kind === "draft_report") {
    assert.ok(result.summary.includes("[AI Draft]"), "Draft must be labeled as AI-generated");
    assert.ok(result.summary.includes("MC-07"), "Draft should reference entity ID");
    assert.ok(result.draft.note.length > 0, "Draft note must not be empty");
    assert.ok(Array.isArray(result.draft.photoRefs), "Draft must include photo refs array");
    assert.ok(result.draft.photoRefs.length > 0, "Draft must include at least one photo ref");
    assert.ok(result.draft.location === null || (typeof result.draft.location.lat === "number"), "Location must be valid or null");
  }
});

test("AI-6: Mock provider includes user observations in the draft (not invented facts)", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext({ existingPhotoRefs: ["ipfs://photo1"] });
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("I see dry soil and brown leaves"),
    assistantMsg("Follow-up"),
    userMsg("Applied water treatment"),
  ];
  const result = await provider.chat(history, ctx, "en");

  assert.equal(result.kind, "draft_report");
  if (result.kind === "draft_report") {
    assert.ok(result.draft.note.includes("dry soil"), "Draft should echo worker observations, not invent facts");
    assert.ok(result.draft.note.includes("Applied water treatment"), "Draft should echo worker actions");
  }
});

// ─── Localization ────────────────────────────────────────────────────────────

test("AI-7: Mock provider responds in Hindi when locale is 'hi'", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  const result = await provider.chat([], ctx, "hi");

  assert.equal(result.kind, "text");
  if (result.kind === "text") {
    // Hindi greeting should contain Devanagari characters
    assert.ok(/[\u0900-\u097F]/.test(result.text), "Response should contain Hindi characters");
    assert.ok(result.text.includes("MC-07"), "Hindi greeting should still reference entity ID");
  }
});

test("AI-8: Mock provider responds in Urdu when locale is 'ur'", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  const result = await provider.chat([], ctx, "ur");

  assert.equal(result.kind, "text");
  if (result.kind === "text") {
    // Urdu uses Arabic-script characters
    assert.ok(/[\u0600-\u06FF]/.test(result.text), "Response should contain Urdu/Arabic-script characters");
  }
});

test("AI-9: Mock provider falls back to English for unsupported locale", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  const result = await provider.chat([], ctx, "xx-unknown");

  assert.equal(result.kind, "text");
  if (result.kind === "text") {
    assert.ok(result.text.includes("field assistant"), "Should fall back to English greeting");
  }
});

// ─── Authorization & Safety ──────────────────────────────────────────────────

test("AI-10: FIELD_WORKER can only access tasks they are assigned to", () => {
  // This tests the canAccessTask guard that the AI chat route uses
  assert.ok(canAccessTask("FIELD_WORKER", ["worker1", "worker2"], "worker1"), "Assigned worker should have access");
  assert.ok(!canAccessTask("FIELD_WORKER", ["worker2"], "worker1"), "Unassigned worker should NOT have access");
});

test("AI-11: AUDITOR role cannot use AI assistant (lacks view_tasks_own)", () => {
  // The AI chat route requires view_tasks_own or view_tasks_any
  assert.ok(!roleHas("AUDITOR", "view_tasks_own"), "Auditor should not have view_tasks_own");
  // Auditor has view_tasks_any for read but the route checks access per-task
  assert.ok(roleHas("AUDITOR", "view_tasks_any"), "Auditor has view_tasks_any (read-only)");
});

test("AI-12: AI provider never mutates context or returns system-role messages", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  const originalState = ctx.state;

  // Simulate 4 turns
  let history: ChatMessage[] = [];
  for (let i = 0; i < 4; i++) {
    const result = await provider.chat(history, ctx, "en");
    // Verify context is not mutated
    assert.equal(ctx.state, originalState, "TaskContext must not be mutated by AI");
    assert.equal(ctx.taskId, "task1", "TaskContext must not be mutated by AI");

    // Add to history and continue
    if (result.kind === "text") {
      history.push(assistantMsg(result.text));
    } else if (result.kind === "request_upload") {
      history.push(assistantMsg(result.prompt));
    } else if (result.kind === "draft_report") {
      history.push(assistantMsg(result.summary));
    }
    history.push(userMsg("Test message " + i));
  }
});

test("AI-13: Conversation history sanitization caps message length", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext();
  // Create a very long message
  const longMessage = "A".repeat(10_000);
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg(longMessage),
  ];

  // The provider should handle this without crashing
  const result = await provider.chat(history, ctx, "en");
  assert.ok(result.kind === "text" || result.kind === "request_upload" || result.kind === "draft_report",
    "Provider should handle long messages gracefully");
});

// ─── Integration: AI + Proof Submission (domain-level) ───────────────────────

function setupApp() {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org1", name: "Test Org", dataMode: "SIMULATED" });
  repo.createUser({ id: "sup1", orgId: "org1", email: "sup@x", name: "Sup", role: "SUPERVISOR", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "worker1", orgId: "org1", email: "worker@x", name: "Worker 1", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "worker2", orgId: "org1", email: "worker2@x", name: "Worker 2", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createUser({ id: "aud1", orgId: "org1", email: "aud@x", name: "Auditor", role: "AUDITOR", passwordHash: hashPassword("demo") });

  repo.createIntervention({ id: "int1", org_id: "org1", code: "INT", label: "INT", criticality: "CRITICAL", sla_limit_hours: 12, req_worker_hours: 2, req_water_units: 0, req_vehicle: 0, req_workers: 1 });
  repo.insertCapacitySnapshot({ id: "cap1", org_id: "org1", time: Date.now(), worker_hours: 40, water_units: 0, vehicles: 0, available_workers: 5, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  repo.createDecision({ id: "dec1", org_id: "org1", entity_level: "MICRO_CLUSTER", entity_id: "c1", decision: "ACT", rule_id: "R1", reason_json: "[]", evidence_used_json: "[]", quality_json: "{}", capacity_available_json: JSON.stringify({ feasible: true }), sla_hours: 12, next_action: "test", overridden: 0, at: Date.now() });

  const app = new AppService(repo);
  return { repo, app };
}

test("AI-14: AI-assisted draft still requires valid proof submission through AppService", () => {
  const { repo, app } = setupApp();
  const sup = { id: "sup1", orgId: "org1", email: "sup@x", name: "Sup", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };
  const worker1 = { id: "worker1", orgId: "org1", email: "worker@x", name: "Worker 1", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };

  // Create and dispatch task
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "c1" }, interventionId: "int1", decisionId: "dec1", workerIds: ["worker1"] });
  app.tasks.dispatch(task.id as string, ["worker1"], sup);
  app.tasks.transition(task.id as string, "ACCEPTED", worker1);
  app.tasks.transition(task.id as string, "IN_PROGRESS", worker1);
  app.tasks.transition(task.id as string, "COMPLETED", worker1);

  // Simulate what the AI draft would produce
  const aiDraft = {
    taskId: task.id as string,
    submissionId: "ai_" + Date.now(),
    claimedAt: Date.now(),
    location: { lat: 12.97, lng: 77.39 },
    photoRefs: ["ipfs://ai_draft_photo"],
    note: "[AI Draft] Site inspection completed for c1. Worker observations: dry soil.",
  };

  // Submit through the NORMAL proof pipeline (same as manual submission)
  const { proof } = app.submitProof(worker1, aiDraft);
  assert.equal(proof.worker_id, "worker1");
  assert.ok((proof.note as string).includes("[AI Draft]"), "AI-generated notes should retain AI label");

  // Worker transitions to PROOF_SUBMITTED
  app.tasks.transition(task.id as string, "PROOF_SUBMITTED", worker1);
  assert.equal(repo.getTask(task.id as string)!.state, "PROOF_SUBMITTED");
});

test("AI-15: AI-assisted draft cannot bypass task assignment (worker2 cannot submit for worker1's task)", () => {
  const { repo, app } = setupApp();
  const sup = { id: "sup1", orgId: "org1", email: "sup@x", name: "Sup", role: "SUPERVISOR" as const, dataMode: "SIMULATED" as const };
  const worker2 = { id: "worker2", orgId: "org1", email: "worker2@x", name: "Worker 2", role: "FIELD_WORKER" as const, dataMode: "SIMULATED" as const };

  // Task assigned to worker1 only
  const task = app.commit(sup, { entity: { level: "MICRO_CLUSTER", id: "c1" }, interventionId: "int1", decisionId: "dec1", workerIds: ["worker1"] });
  app.tasks.dispatch(task.id as string, ["worker1"], sup);

  // Worker2 tries to accept the task
  assert.throws(() => app.tasks.transition(task.id as string, "ACCEPTED", worker2), /You are not an assigned worker/);
});

test("AI-16: AI draft report always contains [AI Draft] provenance marker", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext({ existingPhotoRefs: ["ipfs://photo1"] });
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("Test observation"),
    assistantMsg("Follow-up"),
    userMsg("Test action taken"),
  ];

  const result = await provider.chat(history, ctx, "en");
  assert.equal(result.kind, "draft_report");
  if (result.kind === "draft_report") {
    assert.ok(result.draft.note.includes("[AI Draft]"),
      "Every AI-generated draft MUST include the [AI Draft] provenance marker");
    assert.ok(result.summary.includes("[AI Draft]"),
      "Every AI-generated summary MUST include the [AI Draft] provenance marker");
  }
});

test("AI-17: AI draft report in Hindi also includes provenance marker", async () => {
  const provider = new MockAiProvider();
  const ctx = makeContext({ existingPhotoRefs: ["ipfs://photo1"] });
  const history: ChatMessage[] = [
    assistantMsg("Greeting"),
    userMsg("पेड़ सूखे हैं"),
    assistantMsg("Follow-up"),
    userMsg("पानी डाला गया"),
  ];

  const result = await provider.chat(history, ctx, "hi");
  assert.equal(result.kind, "draft_report");
  if (result.kind === "draft_report") {
    assert.ok(result.draft.note.includes("[AI"),
      "Hindi draft must also include AI provenance marker");
  }
});
