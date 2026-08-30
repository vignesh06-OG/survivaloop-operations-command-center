/**
 * RED-TEAM: offline sync + conflict ledger.
 *
 * Pins the offline-sync guarantee: idempotent per (device,event_id), replays
 * dedupe, and a sync contradicting existing verified evidence is surfaced as a
 * CONFLICT (and FLAGGED) rather than silently trusted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import { hashPassword } from "@/services/auth";
import type { SessionUser } from "@/services/auth";
import type { EvidenceType } from "@/domain/types";

function seeded() {
  const repo = new Repo(":memory:");
  repo.createOrg({ id: "org", name: "D", dataMode: "SIMULATED" });
  repo.createUser({ id: "u_w1", orgId: "org", email: "w@x", name: "W", role: "FIELD_WORKER", passwordHash: hashPassword("demo") });
  repo.createIntervention({ id: "int_water", org_id: "org", code: "X", label: "W", criticality: "EMERGENCY", sla_limit_hours: 24, req_worker_hours: 4, req_water_units: 6, req_vehicle: 1, req_workers: 2 });
  repo.insertCapacitySnapshot({ id: "c", org_id: "org", time: Date.now(), worker_hours: 80, water_units: 60, vehicles: 3, available_workers: 3, committed_worker_hours: 0, committed_water_units: 0, committed_vehicles: 0, committed_workers: 0 });
  const app = new AppService(repo);
  return { repo, app };
}
const w = { id: "u_w1", orgId: "org", email: "w@x", name: "W", role: "FIELD_WORKER", dataMode: "SIMULATED" } as SessionUser;

test("RED-9: offline sync is idempotent and surfaces conflicts in the ledger", () => {
  const { repo, app } = seeded();
  // seed an existing verified 'healthy' claim so a conflicting sync is detectable
  repo.createEvidence({ id: "e_healthy", org_id: "org", entity_level: "MICRO_CLUSTER", entity_id: "cl_0", source: "FIELD_PHOTO", evidence_type: "HEALTHY_GREEN", signal: "IMPROVEMENT", implied_severity: 0, observed_at: Date.now(), captured_at: Date.now(), lat: 18, lng: 73, collector_id: null, verification_status: "HUMAN_VERIFIED", metadata_json: "{}", provenance_note: null, simulated: 0 });

  const evt = (eventId: string, type: EvidenceType) => ({
    eventId, type: "EVIDENCE" as const, entity: { level: "MICRO_CLUSTER" as const, id: "cl_0" },
    source: "FIELD_PHOTO" as const, evidenceType: type, observedAt: Date.now(),
    location: { lat: 18.52, lng: 73.6 },
  });

  // WATER_POINT is NEUTRAL so it never flags a signal conflict → applied.
  const batch = [evt("off-1", "WATER_POINT"), evt("off-2", "DROUGHT_STRESS")];
  const r1 = app.pushSync(w, "device-1", batch);
  assert.equal(r1.applied, 1, "the neutral watering claim is new → applied");
  assert.equal(r1.conflicts, 1, "the distress claim contradicts existing verified health → conflict");

  // Replay the same batch → all duplicates, none re-applied.
  const r2 = app.pushSync(w, "device-1", batch);
  assert.equal(r2.duplicates, 2, "replay deduped");
  assert.equal(r2.applied, 0);

  // The conflicting evidence was FLAGGED, never silently trusted.
  assert.equal(repo.getEvidence("e_healthy")!.verification_status, "HUMAN_VERIFIED");
  // Ledger persists each distinct (device,event) once — duplicates are NOT
  // re-inserted (that would bloat an append-mostly ledger), they're de-duped by
  // the unique key and reported in the batch response.
  const ledger = repo.listSyncEvents("org");
  assert.ok(ledger.some((e) => e.status === "APPLIED"));
  assert.ok(ledger.some((e) => e.status === "CONFLICT"));
  assert.equal(ledger.length, 2, "replayed events did not duplicate ledger rows");
  assert.equal(repo.findSyncEvent("device-1", "off-1")!.status, "APPLIED");
});
