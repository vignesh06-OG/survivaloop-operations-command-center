/**
 * SurvivaLoop — capacity checking.
 *
 * Before any intervention is committed, the system must prove the work is
 * *feasible* with the current (or reserved) capacity. We never generate a task
 * that cannot realistically be executed — unless it is explicitly constrained
 * and escalated, which the decision engine marks clearly.
 *
 * Capacity is given as a snapshot whose "available" numbers have already had
 * existing commitments subtracted (see repo/capacity service). This module is
 * pure — it just interprets the snapshot against a requirement.
 */
import type { CapacityCheckResult, CapacityRequirement, CapacitySnapshot, ResourceKey } from "./types";

const KEYS: ResourceKey[] = ["workerHours", "waterUnits", "vehicle", "workers"];

function availableFor(
  key: ResourceKey,
  snap: CapacitySnapshot,
): number {
  switch (key) {
    case "workerHours": return snap.workerHoursAvailable - snap.committedWorkerHours;
    case "waterUnits": return snap.waterUnitsAvailable - snap.committedWaterUnits;
    case "vehicle": return snap.vehiclesAvailable - snap.committedVehicles;
    case "workers": return snap.availableWorkers - snap.committedWorkers;
  }
}

function requiredFor(key: ResourceKey, req: CapacityRequirement): number {
  switch (key) {
    case "workerHours": return req.workerHours;
    case "waterUnits": return req.waterUnits;
    case "vehicle": return req.vehicle ? 1 : 0;
    case "workers": return req.workers;
  }
}

export function checkCapacity(
  req: CapacityRequirement,
  snap: CapacitySnapshot,
): CapacityCheckResult {
  const detail = {} as CapacityCheckResult["detail"];
  const reason: string[] = [];

  for (const key of KEYS) {
    const required = requiredFor(key, req);
    const available = availableFor(key, snap);
    const short = Math.max(0, required - available);
    detail[key] = { required, available, short };
    if (short > 0) {
      reason.push(
        `${key}: need ${required}, have ${available.toFixed(2)} (short ${short.toFixed(2)}).`,
      );
    }
  }

  const feasible = reason.length === 0;
  return {
    feasible,
    detail,
    reason: feasible
      ? ["All required resources are available within current commitments."]
      : reason,
    committed: false,
  };
}
