import { test } from "node:test";
import assert from "node:assert/strict";
import { createSla, computeSlaState, slaMilestones } from "@/domain/sla";
import { policy, NOW } from "./helpers";

test("SLA starts NORMAL and advances deterministically with time", () => {
  const committedAt = NOW;
  const sla = createSla(committedAt, committedAt, 24);
  assert.equal(sla.state, "NORMAL");
  const total = 24 * 3600_000;

  assert.equal(computeSlaState(sla, committedAt, policy), "NORMAL");
  assert.equal(computeSlaState(sla, committedAt + total * 0.5, policy), "NORMAL");
  assert.equal(computeSlaState(sla, committedAt + total * 0.8, policy), "APPROACHING");
  assert.equal(computeSlaState(sla, committedAt + total * 0.95, policy), "CRITICAL");
  assert.equal(computeSlaState(sla, committedAt + total * 1.1, policy), "EXPIRED");
});

test("SLA milestones compute the three trigger moments", () => {
  const s = createSla(NOW, NOW, 48);
  const ms = slaMilestones(s, policy);
  assert.deepEqual(ms.map((m) => m.type), ["APPROACHING", "CRITICAL", "EXPIRED"]);
  assert.ok(ms[0].at < ms[1].at && ms[1].at < ms[2].at);
});

test("A satisfied SLA returns NORMAL (not a stale risk)", () => {
  const s = createSla(NOW, NOW, 24);
  const done = { ...s, verificationAt: NOW };
  assert.equal(computeSlaState(done, NOW + 48 * 3600_000, policy), "NORMAL");
});
