import type { Evidence, CapacitySnapshot, EvidenceSource, EvidenceType } from "@/domain/types";
import type { Policy } from "@/domain/policy";
import POLICY from "@/domain/policy";

export const NOW = 1_700_000_000_000;

export function ev(over: Partial<Evidence> & { evidenceType: EvidenceType }): Evidence {
  return {
    id: over.id ?? "e_" + Math.random().toString(36).slice(2, 10),
    orgId: "org",
    entity: over.entity ?? { level: "MICRO_CLUSTER", id: "cl_0" },
    source: over.source ?? "FIELD_PHOTO",
    evidenceType: over.evidenceType,
    signal: over.signal ?? "DISTRESS",
    severity: over.severity ?? POLICY.evidenceSeverity[over.evidenceType] ?? 0,
    observedAt: over.observedAt ?? NOW - 3600_000,
    capturedAt: over.capturedAt ?? NOW,
    location: over.location ?? { lat: 18.52, lng: 73.6 },
    collectorId: over.collectorId ?? null,
    verificationStatus: over.verificationStatus ?? "HUMAN_VERIFIED",
    metadata: over.metadata ?? {},
    simulated: false,
  };
}

export function cap(over: Partial<CapacitySnapshot> = {}): CapacitySnapshot {
  return {
    workerHoursAvailable: 80, waterUnitsAvailable: 60, vehiclesAvailable: 3, availableWorkers: 3,
    committedWorkerHours: 0, committedWaterUnits: 0, committedVehicles: 0, committedWorkers: 0,
    time: NOW, ...over,
  };
}

export const WATER_EMERGENCY = {
  id: "int_water",
  label: "Emergency watering",
  criticality: "EMERGENCY" as const,
  slaLimitHours: 24,
  requirement: { workerHours: 4, waterUnits: 6, vehicle: true, workers: 2 },
};
export const STANDARD_MULCH = {
  id: "int_mulch",
  label: "Mulch & moisture retention",
  criticality: "STANDARD" as const,
  slaLimitHours: 120,
  requirement: { workerHours: 2, waterUnits: 0, vehicle: false, workers: 1 },
};
export const CRITICAL_PEST = {
  id: "int_pest",
  label: "Pest/disease treatment",
  criticality: "CRITICAL" as const,
  slaLimitHours: 48,
  requirement: { workerHours: 3, waterUnits: 2, vehicle: true, workers: 1 },
};

export const policy: Policy = POLICY;
