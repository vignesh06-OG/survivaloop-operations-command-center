/**
 * SurvivaLoop — deterministic simulation / demo dataset.
 *
 * Builds a full, reproducible demo organisation covering realistic stress
 * scenarios (drought, conflicting evidence, worker shortage, water shortage,
 * task expiry, sudden distress, false reports, stale evidence, duplicate
 * evidence, worker absence). All data is marked SIMULATED and never presented
 * as real. Same seed → identical output.
 */
import type { Repo } from "@/data/repo";
import { newId } from "@/domain/audit";
import { hashPassword } from "./auth";

export interface SimOptions {
  seed?: number;
  zoneCount?: number;
  clusterPerZone?: number;
  treePerCluster?: number;
  scenarios: ScenarioKind[];
}

export type ScenarioKind =
  | "fresh_severe_act"
  | "conflicting_evidence"
  | "healthy_monitor"
  | "capacity_shortage_defer"
  | "water_shortage"
  | "task_expiry"
  | "sudden_distress"
  | "false_report"
  | "stale_evidence"
  | "worker_absence"
  | "duplicate_evidence";

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimResult {
  orgId: string;
  zoneIds: string[];
  clusterIds: string[];
  entityTimestamps: { level: string; id: string }[];
  users: { id: string; email: string; role: string }[];
  stats: { users: number; evidence: number; decisions: number; tasks: number; audit: number };
}

const ORG = "org_demo";
const NOW_BASE = Date.now();

export function buildSimulation(repo: Repo, opts: SimOptions): SimResult {
  const seed = opts.seed ?? 1337;
  const rng = prng(seed);
  const scenarios = opts.scenarios;

  repo.createOrg({ id: ORG, name: "Riverside Greenbelt Pilot", dataMode: "SIMULATED" });

  // ---- users ----
  const makeUser = (id: string, name: string, email: string, role: string) => {
    const uid = `u_${id}`;
    repo.createUser({ id: uid, orgId: ORG, email, name, role, passwordHash: hashPassword("demo") });
    return { id: uid, email, role };
  };
  const users = [
    makeUser("admin", "Demo Admin", "admin@survivaloop.demo", "ADMIN"),
    makeUser("sup", "Demo Supervisor", "supervisor@survivaloop.demo", "SUPERVISOR"),
    makeUser("w1", "Demo Field Worker", "worker@survivaloop.demo", "FIELD_WORKER"),
    makeUser("w2", "Sunita Jadhav", "worker2@survivaloop.demo", "FIELD_WORKER"),
    makeUser("w3", "Imran Shaikh", "worker3@survivaloop.demo", "FIELD_WORKER"),
    makeUser("aud", "Demo Auditor", "auditor@survivaloop.demo", "AUDITOR"),
  ];

  // ---- interventions catalog ----
  const interventions = [
    { id: "int_water", code: "EMERGENCY_WATERING", label: "Emergency watering", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: 4, req_water_units: 6, req_vehicle: 1, req_workers: 2 },
    { id: "int_mulch", code: "MULCHING", label: "Mulch & soil moisture retention", criticality: "STANDARD", sla_limit_hours: 120, req_worker_hours: 2, req_water_units: 0, req_vehicle: 0, req_workers: 1 },
    { id: "int_pest", code: "PEST_CONTROL", label: "Pest/disease treatment", criticality: "CRITICAL", sla_limit_hours: 48, req_worker_hours: 3, req_water_units: 2, req_vehicle: 1, req_workers: 1 },
    { id: "int_stake", code: "STAKING_REPAIR", label: "Staking repair", criticality: "STANDARD", sla_limit_hours: 168, req_worker_hours: 1, req_water_units: 0, req_vehicle: 0, req_workers: 1 },
    { id: "int_inspect", code: "SITE_INSPECTION", label: "On-site inspection", criticality: "STANDARD", sla_limit_hours: 48, req_worker_hours: 1, req_water_units: 0, req_vehicle: 0, req_workers: 1 },
  ] as const;
  for (const i of interventions) repo.createIntervention({ ...i, org_id: ORG });

  // ---- workers ----
  repo.createWorker({ id: "wk_w1", org_id: ORG, user_id: "u_w1", name: "Demo Field Worker", hours_per_day: 8, active: 1 });
  repo.createWorker({ id: "wk_w2", org_id: ORG, user_id: "u_w2", name: "Sunita Jadhav", hours_per_day: 8, active: 1 });
  repo.createWorker({ id: "wk_w3", org_id: ORG, user_id: "u_w3", name: "Imran Shaikh", hours_per_day: 8, active: 1 });

  // ---- capacity baseline: deliberately TIGHT so capacity-aware escalation is
  // observable. Exactly one EMERGENCY watering can be committed; a second
  // urgent ACT must DEFER/ESCALATE. This is the core demo innovation.
  repo.insertCapacitySnapshot({
    id: newId(), org_id: ORG, time: NOW_BASE,
    worker_hours: 8, water_units: 10, vehicles: 1, available_workers: 2,
    committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0,
  });

  // ---- geography ----
  const zoneIds: string[] = [];
  const clusterIds: string[] = [];
  const baseLat = 18.52, baseLng = 73.60; // Nashik-ish
  const zoneCount = opts.zoneCount ?? 3;
  for (let z = 0; z < zoneCount; z++) {
    const zid = `zn_${z}`;
    zoneIds.push(zid);
    repo.createZone({ id: zid, org_id: ORG, code: `Z${z + 1}`, name: `Zone ${z + 1}`, area_m2: 50000, boundary_wkt: null });
    const clusterPer = opts.clusterPerZone ?? 3;
    for (let c = 0; c < clusterPer; c++) {
      const cid = `cl_${z}_${c}`;
      clusterIds.push(cid);
      const lat = baseLat + (rng() - 0.5) * 0.02;
      const lng = baseLng + (rng() - 0.5) * 0.02;
      repo.createCluster({ id: cid, org_id: ORG, zone_id: zid, code: `Z${z + 1}c${c + 1}`, name: `Cluster ${c + 1}`, lat, lng });
      const treePer = opts.treePerCluster ?? 4;
      for (let tr = 0; tr < treePer; tr++) {
        const tid = `tr_${z}_${c}_${tr}`;
        repo.createTree({
          id: tid, org_id: ORG, cluster_id: cid, zone_id: zid,
          code: `T${z + 1}-${c + 1}-${tr + 1}`, species: "Neem", lat: lat + (rng() - 0.5) * 0.002, lng: lng + (rng() - 0.5) * 0.002,
          planted_at: NOW_BASE - 90 * 24 * 3600 * 1000,
        });
      }
    }
  }

  const central = clusterIds[0]!;
  const centralRow = repo.listClusters(ORG).find((r) => r.id === central)!;

  // ---- evidence + references ----
  const ev = (entity: { level: string; id: string }, type: string, source: string, observedAt: number, isSimulated = true, loc?: { lat: number; lng: number }, verification = "PENDING") => {
    const id = newId();
    repo.createEvidence({
      id, org_id: ORG, entity_level: entity.level, entity_id: entity.id,
      source, evidence_type: type, signal: signalForType(type as any), implied_severity: severityForType(type as any),
      observed_at: observedAt, captured_at: NOW_BASE, lat: loc?.lat ?? null, lng: loc?.lng ?? null,
      collector_id: null, verification_status: verification, metadata_json: JSON.stringify({}), provenance_note: "simulated", simulated: isSimulated ? 1 : 0,
    });
    return id;
  };

  const ids: string[] = [];
  const doScenario = (kind: ScenarioKind, entity: { level: string; id: string }, atOffsetMs: number, loc?: { lat: number; lng: number }) => {
    const at = NOW_BASE - atOffsetMs;
    switch (kind) {
      case "fresh_severe_act":
        ids.push(ev(entity, "DEATH", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED"));
        ids.push(ev(entity, "DROUGHT_STRESS", "FIELD_OBSERVATION", at - 1 * 3600_000, true, loc, "AUTO_PASS"));
        break;
      case "conflicting_evidence":
        ids.push(ev(entity, "DROUGHT_STRESS", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED"));
        ids.push(ev(entity, "HEALTHY_GREEN", "REPORT", at, true, loc, "HUMAN_VERIFIED"));
        break;
      case "healthy_monitor":
        ids.push(ev(entity, "HEALTHY_GREEN", "FIELD_OBSERVATION", at, true, loc, "HUMAN_VERIFIED"));
        ids.push(ev(entity, "NEW_GROWTH", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED"));
        break;
      case "capacity_shortage_defer":
        ids.push(ev(entity, "DEATH", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED")); // severe, needs capacity
        break;
      case "water_shortage":
        ids.push(ev(entity, "SOIL_DRYNESS", "SENSOR", at, true, loc, "AUTO_PASS"));
        ids.push(ev(entity, "DROUGHT_STRESS", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED"));
        break;
      case "task_expiry":
        ids.push(ev(entity, "DROUGHT_STRESS", "FIELD_PHOTO", at - 30 * 24 * 3600_000, true, loc, "HUMAN_VERIFIED"));
        break;
      case "sudden_distress":
        ids.push(ev(entity, "PESTS_DISEASE", "FIELD_OBSERVATION", at, true, loc, "AUTO_PASS"));
        break;
      case "false_report":
        ids.push(ev(entity, "DEATH", "WORKER_CLAIM", at, true, loc, "FLAGGED")); // low reliability
        break;
      case "stale_evidence":
        ids.push(ev(entity, "DROUGHT_STRESS", "REPORT", at - 20 * 24 * 3600_000, true, loc, "PENDING"));
        break;
      case "worker_absence":
        ids.push(ev(entity, "WILTED_LEAVES", "FIELD_OBSERVATION", at, true, loc, "AUTO_PASS"));
        break;
      case "duplicate_evidence":
        ids.push(ev(entity, "DROUGHT_STRESS", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED"));
        ids.push(ev(entity, "DROUGHT_STRESS", "FIELD_PHOTO", at, true, loc, "HUMAN_VERIFIED"));
        break;
    }
  };

  const cid = (i: number) => clusterIds[i % clusterIds.length]!;
  const locOf = (cid_: string) => { const r = repo.listClusters(ORG).find((x) => x.id === cid_); return r ? { lat: r.lat as number, lng: r.lng as number } : undefined; };

  if (scenarios.includes("fresh_severe_act")) doScenario("fresh_severe_act", { level: "MICRO_CLUSTER", id: cid(0) }, 2 * 3600_000, locOf(cid(0)));
  if (scenarios.includes("conflicting_evidence")) doScenario("conflicting_evidence", { level: "MICRO_CLUSTER", id: cid(1) }, 2 * 3600_000, locOf(cid(1)));
  if (scenarios.includes("healthy_monitor")) doScenario("healthy_monitor", { level: "MICRO_CLUSTER", id: cid(2) }, 5 * 3600_000, locOf(cid(2)));
  if (scenarios.includes("capacity_shortage_defer")) doScenario("capacity_shortage_defer", { level: "MICRO_CLUSTER", id: cid(3) }, 1 * 3600_000, locOf(cid(3)));
  if (scenarios.includes("water_shortage")) doScenario("water_shortage", { level: "MICRO_CLUSTER", id: cid(4) }, 2 * 3600_000, locOf(cid(4)));
  if (scenarios.includes("task_expiry")) doScenario("task_expiry", { level: "MICRO_CLUSTER", id: cid(5) }, 30 * 24 * 3600_000, locOf(cid(5)));
  if (scenarios.includes("sudden_distress")) doScenario("sudden_distress", { level: "MICRO_CLUSTER", id: cid(6) }, 3 * 3600_000, locOf(cid(6)));
  if (scenarios.includes("false_report")) doScenario("false_report", { level: "MICRO_CLUSTER", id: cid(7) }, 2 * 3600_000, locOf(cid(7)));
  if (scenarios.includes("stale_evidence")) doScenario("stale_evidence", { level: "MICRO_CLUSTER", id: cid(8) }, 20 * 24 * 3600_000, locOf(cid(8)));
  if (scenarios.includes("worker_absence")) doScenario("worker_absence", { level: "MICRO_CLUSTER", id: cid(9) }, 2 * 3600_000, locOf(cid(9)));
  if (scenarios.includes("duplicate_evidence")) doScenario("duplicate_evidence", { level: "MICRO_CLUSTER", id: cid(10) }, 2 * 3600_000, locOf(cid(10)));

  void centralRow;

  return {
    orgId: ORG,
    zoneIds, clusterIds,
    entityTimestamps: clusterIds.map((id) => ({ level: "MICRO_CLUSTER", id })),
    users,
    stats: repo.info(),
  };
}

function severityForType(t: string): number {
  const m: Record<string, number> = { DROUGHT_STRESS: 0.6, WILTED_LEAVES: 0.5, DEATH: 0.95, PESTS_DISEASE: 0.55, WATERING_OBSERVED: 0, HEALTHY_GREEN: 0, NEW_GROWTH: 0, PLANTING_DONE: 0, STAKING_BROKEN: 0.3, WATER_POINT: 0, SOIL_DRYNESS: 0.45, OTHER: 0.3 };
  return m[t] ?? 0.3;
}
function signalForType(t: string): string {
  const distress = ["DROUGHT_STRESS", "WILTED_LEAVES", "DEATH", "PESTS_DISEASE", "STAKING_BROKEN", "SOIL_DRYNESS"];
  if (distress.includes(t)) return "DISTRESS";
  const improve = ["WATERING_OBSERVED", "HEALTHY_GREEN", "NEW_GROWTH", "PLANTING_DONE"];
  if (improve.includes(t)) return "IMPROVEMENT";
  return "NEUTRAL";
}
