import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, assertTransition, InvalidTransitionError, TASK_TRANSITIONS } from "@/domain/task-state";

test("scenario 10: invalid state transition is rejected", () => {
  assert.equal(canTransition("PROPOSED", "IN_PROGRESS"), false);
  assert.equal(canTransition("COMMITTED", "VERIFIED"), false);
  assert.equal(canTransition("VERIFIED", "COMMITTED"), false);
  assert.throws(() => assertTransition("PROPOSED", "IN_PROGRESS"), InvalidTransitionError);
  assert.throws(() => assertTransition("COMPLETED", "COMMITTED"), InvalidTransitionError);
});

test("the full happy path transitions are all allowed", () => {
  const path = ["PROPOSED", "COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "PROOF_SUBMITTED", "VERIFIED"];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(canTransition(path[i] as any, path[i + 1] as any), `${path[i]} -> ${path[i + 1]}`);
  }
});

test("failure branches are reachable from their legitimate sources", () => {
  assert.ok(canTransition("COMMITTED", "EXPIRED") || canTransition("COMMITTED", "ESCALATED"));
  assert.ok(canTransition("PROOF_SUBMITTED", "REJECTED"));
  assert.ok(canTransition("PROOF_SUBMITTED", "VERIFIED"));
  assert.ok(canTransition("COMPLETED", "REASSESS_REQUIRED"));
});

test("no transition table entry points back into a terminal state", () => {
  for (const [from, tos] of Object.entries(TASK_TRANSITIONS)) {
    for (const to of tos) {
      assert.notEqual(to, from, `self-loop ${from}`);
      if (["VERIFIED", "CANCELLED", "EXPIRED"].includes(to)) {
        // terminal states must have no outgoing edges
        const out = (TASK_TRANSITIONS as Record<string, readonly any[]>)[to];
        assert.ok(out === undefined || out.length === 0);
      }
    }
  }
});
