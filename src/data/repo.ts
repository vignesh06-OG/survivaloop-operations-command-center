/**
 * SurvivaLoop — repository (SQLite runtime adapter).
 *
 * Implements the domain's persistence needs behind a plain class. Kept free of
 * business rule logic (that belongs in services/domain). Identity + timestamps
 * are generated here or by the caller; the repo never makes decisions.
 *
 * In production this file is replaced by a Postgres/PostGIS adapter that
 * satisfies the same method surface (see `/docs/postgres-schema.sql`).
 */
import type Database from "better-sqlite3";
import { createRequire } from "node:module";
const _require = typeof require !== "undefined" ? require : createRequire(import.meta.url);
import { SQLITE_DDL } from "./sqlite-schema";
import { newId } from "@/domain/audit";

export interface DbRow { [k: string]: any }

const ALWAYS_NULL = null;

export interface CapacityRow {
  workerHoursAvailable: number;
  waterUnitsAvailable: number;
  vehiclesAvailable: number;
  availableWorkers: number;
  committedWorkerHours: number;
  committedWaterUnits: number;
  committedVehicles: number;
  committedWorkers: number;
}

export class Repo {
  private db: Database.Database;
  /** Task states that still hold a capacity reservation. */
  private static readonly RESERVING_STATES = ["COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS"];

  constructor(filePath = ":memory:") {
    if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
      throw new Error("Hard bypass: SQLite is disabled on Vercel/Production.");
    }
    try {
      const dbModule = _require("better-sqlite3");
      this.db = new dbModule(filePath);
    } catch (err) {
      throw new Error(`Failed to load better-sqlite3 or open DB: ${(err as Error).message}`);
    }
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SQLITE_DDL);
  }

  /* ---------------- org ---------------- */
  createOrg(o: { id: string; name: string; dataMode: "LIVE" | "SIMULATED" }): void {
    this.db.prepare("INSERT INTO organisations(id,name,data_mode) VALUES(?,?,?)")
      .run(o.id, o.name, o.dataMode);
  }
  getOrg(id: string): DbRow | null { return this.db.prepare("SELECT * FROM organisations WHERE id=?").get(id) as DbRow | null; }

  /* ---------------- users ---------------- */
  createUser(u: { id: string; orgId: string; email: string; name: string; role: string; passwordHash: string; age?: number; city?: string; locality?: string; points?: number }): void {
    this.db.prepare("INSERT INTO users(id,org_id,email,name,role,password_hash,age,city,locality,points) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(u.id, u.orgId, u.email, u.name, u.role, u.passwordHash, u.age ?? null, u.city ?? null, u.locality ?? null, u.points ?? 0);
  }
  getUserByEmail(email: string): DbRow | null { return this.db.prepare("SELECT * FROM users WHERE email=?").get(email) as DbRow | null; }
  getUser(id: string): DbRow | null { return this.db.prepare("SELECT * FROM users WHERE id=?").get(id) as DbRow | null; }
  listUsers(orgId: string): DbRow[] { return this.db.prepare("SELECT * FROM users WHERE org_id=? ORDER BY name").all(orgId) as DbRow[]; }

  /* ---------------- spatial entities ---------------- */
  createZone(z: DbRow): void { this.insert("zones", z); }
  createCluster(c: DbRow): void { this.insert("clusters", c); }
  createTree(t: DbRow): void { this.insert("trees", t); }
  listZones(orgId: string): DbRow[] { return this.db.prepare("SELECT * FROM zones WHERE org_id=? ORDER BY code").all(orgId) as DbRow[]; }
  listClusters(orgId: string, zoneId?: string): DbRow[] {
    return zoneId
      ? this.db.prepare("SELECT * FROM clusters WHERE org_id=? AND zone_id=? ORDER BY code").all(orgId, zoneId) as DbRow[]
      : this.db.prepare("SELECT * FROM clusters WHERE org_id=? ORDER BY code").all(orgId) as DbRow[];
  }
  listTrees(orgId: string, clusterId?: string): DbRow[] {
    return clusterId
      ? this.db.prepare("SELECT * FROM trees WHERE org_id=? AND cluster_id=? ORDER BY code").all(orgId, clusterId) as DbRow[]
      : this.db.prepare("SELECT * FROM trees WHERE org_id=? ORDER BY code").all(orgId) as DbRow[];
  }
  /** Resolve an entity's reference coordinate (site centroid). */
  getEntityLocation(level: string, id: string): { lat: number; lng: number } | null {
    if (level === "TREE") {
      const t = this.db.prepare("SELECT lat,lng FROM trees WHERE id=?").get(id) as DbRow | null;
      if (t && t.lat != null && t.lng != null) return { lat: t.lat as number, lng: t.lng as number };
    } else if (level === "MICRO_CLUSTER") {
      const c = this.db.prepare("SELECT lat,lng FROM clusters WHERE id=?").get(id) as DbRow | null;
      if (c && c.lat != null && c.lng != null) return { lat: c.lat as number, lng: c.lng as number };
    } else if (level === "ZONE") {
      const z = this.db.prepare("SELECT boundary_wkt FROM zones WHERE id=?").get(id) as DbRow | null;
      void z;
    }
    return null;
  }

  /** Proximity query (SQLite; production uses PostGIS ST_DWithin). */
  nearestEntities(orgId: string, lat: number, lng: number, table: "clusters" | "trees", limit: number, radiusM: number): DbRow[] {
    if (table !== "clusters" && table !== "trees") return [];
    const sql = `
      SELECT *,
        (6371000 * 2 * ASIN( SQRT(
           POWER(SIN(RADIANS(lat - ?)/2),2) +
           COS(RADIANS(?))*COS(RADIANS(lat))*POWER(SIN(RADIANS(lng - ?)/2),2)
        ) )) AS distance_m
      FROM ${table}
      WHERE org_id=? AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY distance_m ASC LIMIT ?`;
    const rows = this.db.prepare(sql).all(lat, lat, lng, orgId, limit) as DbRow[];
    const filtered = rows.filter((r) => (r.distance_m as number) <= radiusM);
    // drop the computed column before returning to keep shape predictable
    return filtered.map(({ distance_m: _d, ...rest }) => rest as DbRow);
  }

  /* ---------------- interventions ---------------- */
  createIntervention(i: DbRow): void { this.insert("interventions", i); }
  getIntervention(id: string): DbRow | null { return this.db.prepare("SELECT * FROM interventions WHERE id=?").get(id) as DbRow | null; }
  listInterventions(orgId: string): DbRow[] { return this.db.prepare("SELECT * FROM interventions WHERE org_id=? ORDER BY code").all(orgId) as DbRow[]; }

  /* ---------------- workers ---------------- */
  createWorker(w: DbRow): void { this.insert("workers", w); }
  listWorkers(orgId: string): DbRow[] { return this.db.prepare("SELECT * FROM workers WHERE org_id=? AND active=1 ORDER BY name").all(orgId) as DbRow[]; }

  /* ---------------- capacity ---------------- */
  insertCapacitySnapshot(c: DbRow): void { this.insert("capacity", c); }
  latestCapacity(orgId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM capacity WHERE org_id=? ORDER BY time DESC LIMIT 1").get(orgId) as DbRow | null;
  }
  /** Adjust committed counters on the latest snapshot (capacity reservation). */
  updateCapacityCommitments(orgId: string, delta: DbRow): void {
    const snap = this.latestCapacity(orgId);
    if (!snap) return;
    const allowed = ["committed_worker_hours", "committed_water_units", "committed_vehicles", "committed_workers"];
    const sets: string[] = [];
    const vals: (number | string)[] = [];
    for (const k of allowed) {
      if (typeof delta[k] === "number") {
        sets.push(`${k}=?`);
        vals.push(delta[k] as number);
      }
    }
    if (!sets.length) return;
    this.db.prepare(`UPDATE capacity SET ${sets.join(",")} WHERE id=?`).run(...vals, snap.id);
  }
  /** Set committed counters absolutely on the latest snapshot. */
  setCapacityCommitments(orgId: string, vals: DbRow): void {
    const snap = this.latestCapacity(orgId);
    if (!snap) return;
    const allowed = ["committed_worker_hours", "committed_water_units", "committed_vehicles", "committed_workers"];
    const sets: string[] = [];
    const bind: (number | string)[] = [];
    for (const k of allowed) {
      if (typeof vals[k] === "number") {
        sets.push(`${k}=?`);
        bind.push(vals[k] as number);
      }
    }
    if (!sets.length) return;
    this.db.prepare(`UPDATE capacity SET ${sets.join(",")} WHERE id=?`).run(...bind, snap.id);
  }

  /* ---------------- capacity (DERIVED from live task rows) ---------------- */
  /**
   * Sum the intervention requirement across all live (capacity-reserving) tasks.
   * This is the single source of truth for committed capacity, computed from
   * live rows rather than a hand-mutated counter — so it can't drift or
   * double-count under concurrent commits.
   */
  activeCommitments(orgId: string): {
    committedWorkerHours: number; committedWaterUnits: number;
    committedVehicles: number; committedWorkers: number;
  } {
    const marks = Repo.RESERVING_STATES.map(() => "?").join(",");
    const tasks = this.db.prepare(
      `SELECT * FROM tasks WHERE org_id=? AND state IN (${marks})`,
    ).all(orgId, ...Repo.RESERVING_STATES) as DbRow[];
    const ivQ = this.db.prepare("SELECT req_worker_hours,req_water_units,req_vehicle,req_workers FROM interventions WHERE id=?");
    let committedWorkerHours = 0, committedWaterUnits = 0, committedVehicles = 0, committedWorkers = 0;
    for (const t of tasks) {
      const iv = ivQ.get(t.intervention_class_id as string) as DbRow | null;
      if (!iv) continue;
      committedWorkerHours += iv.req_worker_hours as number;
      committedWaterUnits += iv.req_water_units as number;
      committedVehicles += iv.req_vehicle === 1 ? 1 : 0;
      committedWorkers += (JSON.parse(t.assigned_worker_ids_json as string) as string[]).length;
    }
    return { committedWorkerHours, committedWaterUnits, committedVehicles, committedWorkers };
  }

  /** Base (regenerable) capacity from the latest snapshot, without the old hand-mutated committed_* counters. */
  baseCapacity(orgId: string): { workerHours: number; waterUnits: number; vehicles: number; availableWorkers: number } {
    const row = this.latestCapacity(orgId);
    if (!row) throw new Error("No capacity snapshot for organisation.");
    return {
      workerHours: row.worker_hours as number,
      waterUnits: row.water_units as number,
      vehicles: row.vehicles as number,
      availableWorkers: row.available_workers as number,
    };
  }

  /* ---------------- evidence ---------------- */
  createEvidence(e: DbRow): void { this.insert("evidence", e); }
  getEvidence(id: string): DbRow | null { return this.db.prepare("SELECT * FROM evidence WHERE id=?").get(id) as DbRow | null; }
  listEvidenceForEntity(entityLevel: string, entityId: string): DbRow[] {
    return this.db.prepare("SELECT * FROM evidence WHERE entity_level=? AND entity_id=? AND verification_status!='REJECTED' ORDER BY captured_at ASC")
      .all(entityLevel, entityId) as DbRow[];
  }
  /** Org-scoped evidence read — a user must only ever see their own org's claim. */
  listEvidenceForEntityInOrg(orgId: string, entityLevel: string, entityId: string): DbRow[] {
    return this.db.prepare("SELECT * FROM evidence WHERE org_id=? AND entity_level=? AND entity_id=? AND verification_status!='REJECTED' ORDER BY captured_at ASC")
      .all(orgId, entityLevel, entityId) as DbRow[];
  }
  latestEvidenceForEntity(entityLevel: string, entityId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM evidence WHERE entity_level=? AND entity_id=? ORDER BY captured_at DESC LIMIT 1")
      .all(entityLevel, entityId)[0] as DbRow | null;
  }
  updateEvidenceVerification(id: string, status: string): void {
    this.db.prepare("UPDATE evidence SET verification_status=? WHERE id=?").run(status, id);
  }
  markEvidenceRejected(id: string): void {
    this.db.prepare("UPDATE evidence SET verification_status='REJECTED' WHERE id=?").run(id);
  }
  evidenceMeta(id: string): { entityLevel: string; entityId: string } {
    const r = this.db.prepare("SELECT entity_level, entity_id FROM evidence WHERE id=?").get(id) as DbRow;
    return { entityLevel: r.entity_level as string, entityId: r.entity_id as string };
  }

  /* ---------------- conflicts ---------------- */
  createConflict(c: DbRow): void { this.insert("evidence_conflicts", c); }
  listConflicts(entityLevel?: string, entityId?: string): DbRow[] {
    if (entityLevel && entityId) return this.db.prepare("SELECT * FROM evidence_conflicts WHERE entity_level=? AND entity_id=? AND resolved=0 ORDER BY detected_at DESC").all(entityLevel, entityId) as DbRow[];
    return this.db.prepare("SELECT * FROM evidence_conflicts WHERE resolved=0 ORDER BY detected_at DESC").all() as DbRow[];
  }

  /* ---------------- assessments / decisions ---------------- */
  createAssessment(a: DbRow): void { this.insert("assessments", a); }
  latestAssessment(entityLevel: string, entityId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM assessments WHERE entity_level=? AND entity_id=? ORDER BY at DESC LIMIT 1").all(entityLevel, entityId)[0] as DbRow | null;
  }
  latestAssessmentInOrg(orgId: string, entityLevel: string, entityId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM assessments WHERE org_id=? AND entity_level=? AND entity_id=? ORDER BY at DESC LIMIT 1").all(orgId, entityLevel, entityId)[0] as DbRow | null;
  }
  createDecision(d: DbRow): void { this.insert("decisions", d); }
  latestDecision(entityLevel: string, entityId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM decisions WHERE entity_level=? AND entity_id=? ORDER BY at DESC LIMIT 1").all(entityLevel, entityId)[0] as DbRow | null;
  }
  latestDecisionInOrg(orgId: string, entityLevel: string, entityId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM decisions WHERE org_id=? AND entity_level=? AND entity_id=? ORDER BY at DESC LIMIT 1").all(orgId, entityLevel, entityId)[0] as DbRow | null;
  }
  getDecision(id: string): DbRow | null { return this.db.prepare("SELECT * FROM decisions WHERE id=?").get(id) as DbRow | null; }
  listLatestDecisions(orgId: string): DbRow[] {
    // latest decision per entity via rowid matching
    return this.db.prepare(`
      SELECT d.* FROM decisions d
      JOIN (SELECT entity_level, entity_id, MAX(at) m FROM decisions WHERE org_id=? GROUP BY entity_level, entity_id) x
        ON x.entity_level=d.entity_level AND x.entity_id=d.entity_id AND x.m=d.at
      ORDER BY d.at DESC`).all(orgId) as DbRow[];
  }
  markDecisionOverridden(id: string): void { this.db.prepare("UPDATE decisions SET overridden=1 WHERE id=?").run(id); }
  createOverride(o: DbRow): void { this.insert("overrides", o); }

  /* ---------------- tasks ---------------- */
  createTask(t: DbRow): void { this.insert("tasks", t); }
  getTask(id: string): DbRow | null { return this.db.prepare("SELECT * FROM tasks WHERE id=?").get(id) as DbRow | null; }
  findTaskByDecision(orgId: string, decisionId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM tasks WHERE org_id=? AND decision_id=? LIMIT 1").get(orgId, decisionId) as DbRow | null;
  }
  listTasks(orgId: string, state?: string): DbRow[] {
    return state
      ? this.db.prepare("SELECT * FROM tasks WHERE org_id=? AND state=? ORDER BY created_at DESC").all(orgId, state) as DbRow[]
      : this.db.prepare("SELECT * FROM tasks WHERE org_id=? ORDER BY created_at DESC").all(orgId) as DbRow[];
  }
  listTasksAssignedTo(orgId: string, workerId: string): DbRow[] {
    const rows = this.db.prepare("SELECT * FROM tasks WHERE org_id=? ORDER BY created_at DESC").all(orgId) as DbRow[];
    return rows.filter((r) => (JSON.parse(r.assigned_worker_ids_json as string) as string[]).includes(workerId));
  }
  updateTaskFields(id: string, fields: DbRow): void {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const set = keys.map((k) => `${k}=?`).join(",");
    this.db.prepare(`UPDATE tasks SET ${set} WHERE id=?`).run(...keys.map((k) => fields[k]), id);
  }
  updateTaskState(id: string, state: string, fields: DbRow = {}): void {
    this.updateTaskFields(id, { state, ...fields });
  }
  /**
   * Optimistic compare-and-set transition: only succeeds if the row is still in
   * `expectedFrom` right now. Prevents two concurrent actors both winning the
   * same transition (check-then-write race). Returns true if applied.
   */
  compareAndSetTaskState(id: string, expectedFrom: string, to: string, fields: DbRow = {}): boolean {
    const keys = Object.keys(fields);
    const setCols: string[] = ["state=?"];
    const bind: any[] = [to];
    for (const k of keys) { setCols.push(`${k}=?`); bind.push(fields[k]); }
    const info = this.db
      .prepare(`UPDATE tasks SET ${setCols.join(", ")} WHERE id=? AND state=?`)
      .run(...bind, id, expectedFrom);
    return info.changes > 0;
  }
  createSlaEvent(e: DbRow): void { this.insert("sla_events", e); }
  listSlaEvents(taskId: string): DbRow[] { return this.db.prepare("SELECT * FROM sla_events WHERE task_id=? ORDER BY at ASC").all(taskId) as DbRow[]; }
  /** Guarded update of derived SLA state so the sweep can't clobber a concurrent writer's version. */
  compareAndSetSlaState(id: string, expectedFrom: string, to: string): boolean {
    const info = this.db.prepare("UPDATE tasks SET sla_state=? WHERE id=? AND sla_state=?").run(to, id, expectedFrom);
    return info.changes > 0;
  }
  /** Tasks whose SLA is about to/now expired across the org. */
  tasksWithSlaState(orgId: string, states: string[]): DbRow[] {
    const marks = states.map(() => "?").join(",");
    return this.db.prepare(`SELECT * FROM tasks WHERE org_id=? AND sla_state IN (${marks})`).all(orgId, ...states) as DbRow[];
  }

  /* ---------------- proofs ---------------- */
  createProof(p: DbRow): void { this.insert("execution_proofs", p); }
  getProof(id: string): DbRow | null { return this.db.prepare("SELECT * FROM execution_proofs WHERE id=?").get(id) as DbRow | null; }
  listProofsForTask(taskId: string): DbRow[] { return this.db.prepare("SELECT * FROM execution_proofs WHERE task_id=? ORDER BY submitted_at ASC").all(taskId) as DbRow[]; }
  findProofBySubmission(workerId: string, submissionId: string): DbRow | null {
    const r = this.db.prepare("SELECT * FROM execution_proofs WHERE worker_id=? AND submission_id=?").get(workerId, submissionId) as DbRow | null;
    return r ?? null;
  }
  updateProof(id: string, fields: DbRow): void {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const set = keys.map((k) => `${k}=?`).join(",");
    this.db.prepare(`UPDATE execution_proofs SET ${set} WHERE id=?`).run(...keys.map((k) => fields[k]), id);
  }
  createVerificationReview(v: DbRow): void { this.insert("verification_reviews", v); }

  /* ---------------- outcomes ---------------- */
  createOutcome(o: DbRow): void { this.insert("outcomes", o); }
  getOutcome(id: string): DbRow | null { return this.db.prepare("SELECT * FROM outcomes WHERE id=?").get(id) as DbRow | null; }
  listOutcomes(orgId: string): DbRow[] { return this.db.prepare("SELECT * FROM outcomes WHERE org_id=? ORDER BY measured_at DESC").all(orgId) as DbRow[]; }
  listOutcomesForEntity(orgId: string, level: string, id: string): DbRow[] { 
    return this.db.prepare("SELECT * FROM outcomes WHERE org_id=? AND entity_level=? AND entity_id=? ORDER BY measured_at DESC").all(orgId, level, id) as DbRow[]; 
  }

  /* ---------------- audit ---------------- */
  appendAudit(a: DbRow): void { this.insert("audit_logs", a); }
  listAudit(orgId: string, limit = 100): DbRow[] {
    return this.db.prepare("SELECT * FROM audit_logs WHERE org_id=? ORDER BY at DESC LIMIT ?").all(orgId, limit) as DbRow[];
  }
  listAuditForEntity(entityType: string, entityId: string): DbRow[] {
    return this.db.prepare("SELECT * FROM audit_logs WHERE entity_type=? AND entity_id=? ORDER BY at DESC").all(entityType, entityId) as DbRow[];
  }

  /* ---------------- offline sync ledger ---------------- */
  createSyncEvent(e: DbRow): void { this.insert("sync_events", e); }
  findSyncEvent(deviceId: string, eventId: string): DbRow | null {
    return this.db.prepare("SELECT * FROM sync_events WHERE device_id=? AND event_id=?").get(deviceId, eventId) as DbRow | null;
  }
  getSyncEventById(id: string): DbRow | null {
    return this.db.prepare("SELECT * FROM sync_events WHERE id=?").get(id) as DbRow | null;
  }
  listSyncEvents(orgId: string, limit = 200): DbRow[] {
    return this.db.prepare("SELECT * FROM sync_events WHERE org_id=? ORDER BY applied_at DESC LIMIT ?").all(orgId, limit) as DbRow[];
  }

  /* ---------------- transactions ---------------- */
  /** Deferred transaction (default). */
  tx<T>(fn: () => T): T {
    const f = this.db.transaction(fn);
    return f();
  }
  /**
   * BEGIN IMMEDIATE transaction: acquires the write lock up front so concurrent
   * writers (including across processes on the same SQLite file) are serialised.
   * Used for commit/override/verification so a second writer's reads see the
   * first writer's inserted rows — closing the read-then-write capacity race.
   */
  txImmediate<T>(fn: () => T): T {
    const f = this.db.transaction(fn);
    return f.immediate();
  }

  private insert(table: string, row: DbRow): void {
    const keys = Object.keys(row);
    const cols = keys.map((k) => snake(k)).join(",");
    const marks = keys.map(() => "?").join(",");
    this.db.prepare(`INSERT INTO ${table}(${cols}) VALUES(${marks})`).run(...keys.map((k) => row[k]));
  }

  /** For tests / reseeding. */
  info(): { users: number; evidence: number; decisions: number; tasks: number; audit: number } {
    const c = (t: string) => (this.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as DbRow).n as number;
    return { users: c("users"), evidence: c("evidence"), decisions: c("decisions"), tasks: c("tasks"), audit: c("audit_logs") };
  }
  initBase(name: string, dataMode: "LIVE" | "SIMULATED") {
    // placeholder to satisfy IDE
    void name; void dataMode;
  }
}

/** snake_case mapping for inserts (db columns). */
function snake(k: string): string {
  return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

/** wrap raw capacity row into domain snapshot */
export function capacityRowToSnapshot(r: DbRow): CapacityRow {
  return {
    workerHoursAvailable: r.worker_hours as number,
    waterUnitsAvailable: r.water_units as number,
    vehiclesAvailable: r.vehicles as number,
    availableWorkers: r.available_workers as number,
    committedWorkerHours: r.committed_worker_hours as number,
    committedWaterUnits: r.committed_water_units as number,
    committedVehicles: r.committed_vehicles as number,
    committedWorkers: r.committed_workers as number,
  };
}

export { ALWAYS_NULL };
export const uuid = () => newId();
