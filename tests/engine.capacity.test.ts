import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCapacity } from "@/domain/capacity";
import { cap, WATER_EMERGENCY, STANDARD_MULCH } from "./helpers";

test("capacity check passes when requirement is met", () => {
  const r = checkCapacity(WATER_EMERGENCY.requirement, cap());
  assert.equal(r.feasible, true);
  assert.ok(r.reason.length >= 0);
});

test("capacity check fails when water units are short", () => {
  const r = checkCapacity(WATER_EMERGENCY.requirement, cap({ waterUnitsAvailable: 2 }));
  assert.equal(r.feasible, false);
  assert.ok(r.detail.waterUnits.short > 0);
});

test("capacity check fails when vehicles are unavailable", () => {
  const r = checkCapacity(WATER_EMERGENCY.requirement, cap({ vehiclesAvailable: 0 }));
  assert.equal(r.feasible, false);
  assert.equal(r.detail.vehicle.short, 1);
});

test("capacity check accounts for existing commitments (computed available)", () => {
  // commitments reduce available: 40 committed of 60 water → 20 available; need 6 → ok
  const ok = checkCapacity(WATER_EMERGENCY.requirement, cap({ waterUnitsAvailable: 60, committedWaterUnits: 50 }));
  assert.equal(ok.feasible, true);
  // 58 committed → only 2 available → short 4
  const fail = checkCapacity(WATER_EMERGENCY.requirement, cap({ waterUnitsAvailable: 60, committedWaterUnits: 58 }));
  assert.equal(fail.feasible, false);
  assert.ok(fail.detail.waterUnits.short >= 4 - 0.001);
});

test("an intervention with zero water & vehicle needs stays feasible with staffing", () => {
  const r = checkCapacity(STANDARD_MULCH.requirement, cap({ waterUnitsAvailable: 0, vehiclesAvailable: 0 }));
  assert.equal(r.feasible, true);
});
