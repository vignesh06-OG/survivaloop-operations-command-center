import { test } from "node:test";
import assert from "node:assert/strict";
import type { AiProvider, ChatMessage, TaskContext, AiResponse } from "@/lib/ai/provider";
import { SafeAiProvider } from "@/lib/ai/safeProvider";
import { MockAiProvider } from "@/lib/ai/mockProvider";

const mockContext: TaskContext = {
  taskId: "t1",
  entityId: "e1",
  interventionClassId: "i1",
  state: "IN_PROGRESS",
  slaState: "NORMAL",
  slaDeadline: null,
  assignedWorkerIds: ["w1"],
  createdAt: Date.now(),
  existingPhotoRefs: [],
  existingNotes: null,
};

// A dummy provider that we can control for testing
class TestProvider implements AiProvider {
  public responseType: "success" | "timeout" | "malformed" | "throw" | "retry-success" = "success";
  public attempts = 0;

  async chat(history: ChatMessage[], context: TaskContext, locale: string): Promise<AiResponse> {
    this.attempts++;

    if (this.responseType === "timeout") {
      await new Promise(resolve => setTimeout(resolve, 100)); // Will simulate timeout by configuring safe provider with shorter timeout
      return { kind: "text", text: "Too late" };
    }

    if (this.responseType === "malformed") {
      // @ts-expect-error intentionally returning bad data
      return { kind: "text", foo: "bar" };
    }

    if (this.responseType === "throw") {
      throw new Error("Provider internal error");
    }

    if (this.responseType === "retry-success") {
      if (this.attempts === 1) {
        throw new Error("Transient error");
      }
      return { kind: "text", text: "Success on retry" };
    }

    return { kind: "text", text: "Success" };
  }
}

test("SafeAiProvider - passes through successful response", async () => {
  const inner = new TestProvider();
  const fallback = new MockAiProvider();
  const safeProvider = new SafeAiProvider(inner, fallback, { timeoutMs: 1000, maxRetries: 1 });

  const res = await safeProvider.chat([], mockContext, "en");
  assert.equal(res.kind, "text");
  if (res.kind === "text") {
    assert.equal(res.text, "Success");
  }
});

test("SafeAiProvider - times out and falls back", async () => {
  const inner = new TestProvider();
  inner.responseType = "timeout";
  const fallback = new MockAiProvider();
  
  // Set timeout to 10ms, inner sleeps for 100ms
  const safeProvider = new SafeAiProvider(inner, fallback, { timeoutMs: 10, maxRetries: 0 });

  const res = await safeProvider.chat([], mockContext, "en");
  // Should fall back to MockAiProvider
  assert.equal(res.kind, "text");
  if (res.kind === "text") {
    assert.ok(res.text.includes("field assistant"), "Should be the mock fallback message");
  }
});

test("SafeAiProvider - catches malformed response (schema validation) and falls back", async () => {
  const inner = new TestProvider();
  inner.responseType = "malformed";
  const fallback = new MockAiProvider();
  
  const safeProvider = new SafeAiProvider(inner, fallback, { timeoutMs: 1000, maxRetries: 0 });

  const res = await safeProvider.chat([], mockContext, "en");
  // Should fall back to MockAiProvider
  assert.equal(res.kind, "text");
  if (res.kind === "text") {
    assert.ok(res.text.includes("field assistant"), "Should be the mock fallback message");
  }
});

test("SafeAiProvider - retries on transient error and succeeds", async () => {
  const inner = new TestProvider();
  inner.responseType = "retry-success";
  const fallback = new MockAiProvider();
  
  const safeProvider = new SafeAiProvider(inner, fallback, { timeoutMs: 1000, maxRetries: 1 });

  const res = await safeProvider.chat([], mockContext, "en");
  assert.equal(res.kind, "text");
  if (res.kind === "text") {
    assert.equal(res.text, "Success on retry", "Should succeed on second attempt");
  }
  assert.equal(inner.attempts, 2, "Should have made 2 attempts");
});

test("SafeAiProvider - ultimate fallback when both inner and fallback throw", async () => {
  const inner = new TestProvider();
  inner.responseType = "throw";
  
  const badFallback = new TestProvider();
  badFallback.responseType = "throw";
  
  const safeProvider = new SafeAiProvider(inner, badFallback, { timeoutMs: 1000, maxRetries: 0 });

  const res = await safeProvider.chat([], mockContext, "en");
  assert.equal(res.kind, "text");
  if (res.kind === "text") {
    assert.ok(res.text.includes("unavailable"), "Should return ultimate safe fallback message");
  }
});
