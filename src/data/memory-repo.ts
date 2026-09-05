import { newId } from "@/domain/audit";
import type { DbRow, Repo } from "./repo";
import { buildSimulation } from "@/services/simulation";

export class MemoryRepo implements Partial<Repo> {
  tx<T>(fn: () => T): T { return fn(); }
  private tables: Record<string, DbRow[]> = {
    organisations: [],
    users: [],
    zones: [],
    clusters: [],
    trees: [],
    evidence: [],
    evidence_conflicts: [],
    assessments: [],
    decisions: [],
    tasks: [],
    interventions: [],
    workers: [],
    capacity: []
  };

  private _hydrating = false;
  private autoHydrate() {
    if (this._hydrating) return;
    if (this.tables.trees.length === 0 || this.tables.tasks.length === 0) {
      this._hydrating = true;
      try {
        buildSimulation(this as any, {
          scenarios: [
            "fresh_severe_act", "conflicting_evidence", "healthy_monitor",
            "capacity_shortage_defer", "water_shortage", "task_expiry",
            "sudden_distress", "false_report", "stale_evidence",
            "worker_absence", "duplicate_evidence",
          ],
          seedDemoTasks: true,
        });
      } finally {
        this._hydrating = false;
      }
    }
  }

  private insert(table: string, row: DbRow) {
    this.tables[table].push(row);
  }

  createOrg(o: { id: string; name: string; dataMode: "LIVE" | "SIMULATED" }) {
    this.insert("organisations", { id: o.id, name: o.name, data_mode: o.dataMode });
  }
  getOrg(id: string) { return this.tables.organisations.find(o => o.id === id) || null; }

  createUser(u: { id: string; orgId: string; email: string; name: string; role: string; passwordHash: string; age?: number; city?: string; locality?: string; points?: number }) {
    this.insert("users", { 
      id: u.id, org_id: u.orgId, email: u.email, name: u.name, role: u.role, password_hash: u.passwordHash,
      age: u.age, city: u.city, locality: u.locality, points: u.points || 0
    });
  }
  updateUser(id: string, data: { age?: number; city?: string; locality?: string; points?: number }) {
    const user = this.tables.users.find(u => u.id === id);
    if (!user) return;
    if (data.age !== undefined) user.age = data.age;
    if (data.city !== undefined) user.city = data.city;
    if (data.locality !== undefined) user.locality = data.locality;
    if (data.points !== undefined) user.points = data.points;
  }
  getUserByEmail(email: string) { return this.tables.users.find(u => u.email === email) || null; }
  getUser(id: string) { return this.tables.users.find(u => u.id === id) || null; }
  listUsers(orgId: string) { return this.tables.users.filter(u => u.org_id === orgId).sort((a, b) => (a.name as string).localeCompare(b.name as string)); }

  createZone(z: DbRow) { this.insert("zones", z); }
  createCluster(c: DbRow) { this.insert("clusters", c); }
  createTree(t: DbRow) { this.insert("trees", t); }
  listZones(orgId: string) { return this.tables.zones.filter(z => z.org_id === orgId); }
  listClusters(orgId: string, zoneId?: string) {
    this.autoHydrate();
    return this.tables.clusters.filter(c => c.org_id === orgId && (!zoneId || c.zone_id === zoneId));
  }
  listTrees(orgId: string, clusterId?: string) {
    this.autoHydrate();
    return this.tables.trees.filter(t => t.org_id === orgId && (!clusterId || t.cluster_id === clusterId));
  }
  getEntityLocation(level: string, id: string) {
    if (level === "TREE") {
      const t = this.tables.trees.find(t => t.id === id);
      return t ? { lat: t.lat as number, lng: t.lng as number } : null;
    } else if (level === "MICRO_CLUSTER") {
      const c = this.tables.clusters.find(c => c.id === id);
      return c ? { lat: c.lat as number, lng: c.lng as number } : null;
    }
    return null;
  }
  nearestEntities(orgId: string, lat: number, lng: number, table: "clusters" | "trees", limit: number, radiusM: number) {
    const rows = this.tables[table].filter(r => r.org_id === orgId && r.lat != null && r.lng != null);
    const withDist = rows.map(r => {
      const d = 6371000 * 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((((r.lat as number) - lat) * Math.PI / 180) / 2), 2) + Math.cos(lat * Math.PI / 180) * Math.cos((r.lat as number) * Math.PI / 180) * Math.pow(Math.sin((((r.lng as number) - lng) * Math.PI / 180) / 2), 2)));
      return { ...r, distance_m: d };
    });
    return withDist.filter(r => r.distance_m <= radiusM).sort((a, b) => a.distance_m - b.distance_m).slice(0, limit).map(({ distance_m, ...rest }) => rest);
  }

  createIntervention(i: DbRow) { this.insert("interventions", i); }
  getIntervention(id: string) { return this.tables.interventions.find(i => i.id === id) || null; }
  listInterventions(orgId: string) { return this.tables.interventions.filter(i => i.org_id === orgId); }

  createWorker(w: DbRow) { this.insert("workers", w); }
  listWorkers(orgId: string) { return this.tables.workers.filter(w => w.org_id === orgId && w.active === 1); }

  insertCapacitySnapshot(c: DbRow) { this.insert("capacity", c); }
  latestCapacity(orgId: string) {
    const caps = this.tables.capacity.filter(c => c.org_id === orgId);
    return caps.length ? caps[caps.length - 1] : null;
  }
  updateCapacityCommitments(orgId: string, delta: DbRow) {
    const snap = this.latestCapacity(orgId);
    if (!snap) return;
    if (delta.committed_worker_hours !== undefined) snap.committed_worker_hours = (snap.committed_worker_hours as number) + (delta.committed_worker_hours as number);
    if (delta.committed_water_units !== undefined) snap.committed_water_units = (snap.committed_water_units as number) + (delta.committed_water_units as number);
    if (delta.committed_vehicles !== undefined) snap.committed_vehicles = (snap.committed_vehicles as number) + (delta.committed_vehicles as number);
    if (delta.committed_workers !== undefined) snap.committed_workers = (snap.committed_workers as number) + (delta.committed_workers as number);
  }
  setCapacityCommitments(orgId: string, vals: DbRow) {
    const snap = this.latestCapacity(orgId);
    if (!snap) return;
    if (vals.committed_worker_hours !== undefined) snap.committed_worker_hours = vals.committed_worker_hours;
    if (vals.committed_water_units !== undefined) snap.committed_water_units = vals.committed_water_units;
    if (vals.committed_vehicles !== undefined) snap.committed_vehicles = vals.committed_vehicles;
    if (vals.committed_workers !== undefined) snap.committed_workers = vals.committed_workers;
  }

  activeCommitments(orgId: string) {
    const RESERVING_STATES = ["COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS"];
    const tasks = this.tables.tasks.filter(t => t.org_id === orgId && RESERVING_STATES.includes(t.state as string));
    let committedWorkerHours = 0, committedWaterUnits = 0, committedVehicles = 0, committedWorkers = 0;
    for (const t of tasks) {
      const iv = this.getIntervention(t.intervention_class_id as string);
      if (!iv) continue;
      committedWorkerHours += iv.req_worker_hours as number;
      committedWaterUnits += iv.req_water_units as number;
      committedVehicles += iv.req_vehicle === 1 ? 1 : 0;
      committedWorkers += (JSON.parse(t.assigned_worker_ids_json as string) as string[]).length;
    }
    return { committedWorkerHours, committedWaterUnits, committedVehicles, committedWorkers };
  }
  baseCapacity(orgId: string) {
    const row = this.latestCapacity(orgId);
    if (!row) throw new Error("No capacity snapshot for organisation.");
    return {
      workerHours: row.worker_hours as number,
      waterUnits: row.water_units as number,
      vehicles: row.vehicles as number,
      availableWorkers: row.available_workers as number,
    };
  }

  createEvidence(e: DbRow) { this.insert("evidence", e); }
  getEvidence(id: string) { return this.tables.evidence.find(e => e.id === id) || null; }
  listEvidenceForEntity(entityLevel: string, entityId: string) {
    return this.tables.evidence.filter(e => e.entity_level === entityLevel && e.entity_id === entityId && e.verification_status !== "REJECTED").sort((a, b) => new Date(a.captured_at as string).getTime() - new Date(b.captured_at as string).getTime());
  }
  listEvidenceForEntityInOrg(orgId: string, entityLevel: string, entityId: string) {
    return this.tables.evidence.filter(e => e.org_id === orgId && e.entity_level === entityLevel && e.entity_id === entityId && e.verification_status !== "REJECTED").sort((a, b) => new Date(a.captured_at as string).getTime() - new Date(b.captured_at as string).getTime());
  }
  latestEvidenceForEntity(entityLevel: string, entityId: string) {
    const ev = this.tables.evidence.filter(e => e.entity_level === entityLevel && e.entity_id === entityId).sort((a, b) => new Date(b.captured_at as string).getTime() - new Date(a.captured_at as string).getTime());
    return ev[0] || null;
  }
  updateEvidenceVerification(id: string, status: string) {
    const e = this.getEvidence(id);
    if (e) e.verification_status = status;
  }
  markEvidenceRejected(id: string) { this.updateEvidenceVerification(id, "REJECTED"); }
  evidenceMeta(id: string) {
    const e = this.getEvidence(id);
    if (!e) throw new Error("not found");
    return { entityLevel: e.entity_level as string, entityId: e.entity_id as string };
  }

  createConflict(c: DbRow) { this.insert("evidence_conflicts", c); }
  listConflicts(entityLevel?: string, entityId?: string) {
    const c = this.tables.evidence_conflicts.filter(c => c.resolved === 0);
    if (entityLevel && entityId) return c.filter(x => x.entity_level === entityLevel && x.entity_id === entityId).sort((a, b) => new Date(b.detected_at as string).getTime() - new Date(a.detected_at as string).getTime());
    return c.sort((a, b) => new Date(b.detected_at as string).getTime() - new Date(a.detected_at as string).getTime());
  }

  createAssessment(a: DbRow) { this.insert("assessments", a); }
  latestAssessment(entityLevel: string, entityId: string) {
    const a = this.tables.assessments.filter(a => a.entity_level === entityLevel && a.entity_id === entityId).sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime());
    return a[0] || null;
  }
  latestAssessmentInOrg(orgId: string, entityLevel: string, entityId: string) {
    const a = this.tables.assessments.filter(a => a.org_id === orgId && a.entity_level === entityLevel && a.entity_id === entityId).sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime());
    return a[0] || null;
  }
  
  createDecision(d: DbRow) { this.insert("decisions", d); }
  latestDecision(entityLevel: string, entityId: string) {
    const d = this.tables.decisions.filter(d => d.entity_level === entityLevel && d.entity_id === entityId).sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime());
    return d[0] || null;
  }
  latestDecisionInOrg(orgId: string, entityLevel: string, entityId: string) {
    const d = this.tables.decisions.filter(d => d.org_id === orgId && d.entity_level === entityLevel && d.entity_id === entityId).sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime());
    return d[0] || null;
  }
  getDecision(id: string) { return this.tables.decisions.find(d => d.id === id) || null; }
  listLatestDecisions(orgId: string) {
    this.autoHydrate();
    const map = new Map<string, DbRow>();
    const decs = this.tables.decisions.filter(d => d.org_id === orgId).sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
    for (const d of decs) {
      map.set(`${d.entity_level}:${d.entity_id}`, d);
    }
    return Array.from(map.values());
  }

  createTask(t: DbRow) { this.insert("tasks", t); }
  updateTask(id: string, updates: Partial<DbRow>) {
    const t = this.getTask(id);
    if (t) Object.assign(t, updates);
  }
  getTask(id: string) { 
    this.autoHydrate();
    return this.tables.tasks.find(t => t.id === id) || null; 
  }
  listTasks(orgId: string) { 
    this.autoHydrate();
    return this.tables.tasks.filter(t => t.org_id === orgId).sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()); 
  }
  tasksByState(orgId: string, state: string) { return this.tables.tasks.filter(t => t.org_id === orgId && t.state === state).sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()); }
  tasksByEntity(orgId: string, level: string, entityId: string) {
    return this.tables.tasks.filter(t => t.org_id === orgId && t.entity_level === level && t.entity_id === entityId).sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());
  }
  getTaskForEvidence(evidenceId: string) { return this.tables.tasks.find(t => t.proof_evidence_id === evidenceId) || null; }
  
  info() {
    this.autoHydrate();
    return {
      users: this.tables.users.length,
      evidence: this.tables.evidence.length,
      decisions: this.tables.decisions.length,
      tasks: this.tables.tasks.length,
      audit: this.tables.audit_logs?.length || 0
    };
  }

  compareAndSetTaskState(id: string, expectedFrom: string, to: string, fields: DbRow = {}): boolean {
    const task = this.getTask(id);
    if (!task || task.state !== expectedFrom) return false;
    task.state = to;
    Object.assign(task, fields);
    return true;
  }
  updateTaskFields(id: string, fields: Partial<DbRow>): void {
    const task = this.getTask(id);
    if (task) Object.assign(task, fields);
  }
  appendAudit(a: DbRow): void {
    if (!this.tables.audit_logs) this.tables.audit_logs = [];
    this.tables.audit_logs.push(a);
  }
  createSlaEvent(e: DbRow): void {
    if (!this.tables.sla_events) this.tables.sla_events = [];
    this.tables.sla_events.push(e);
  }
  createProof(p: DbRow): void {
    this.autoHydrate();
    if (!this.tables.execution_proofs) this.tables.execution_proofs = [];
    this.tables.execution_proofs.push(p);
  }
  getProof(id: string): DbRow | null {
    this.autoHydrate();
    return (this.tables.execution_proofs || []).find(p => p.id === id) || null;
  }
  updateProof(id: string, updates: Partial<DbRow>): void {
    const p = this.getProof(id);
    if (p) Object.assign(p, updates);
  }
  findProofBySubmission(workerId: string, submissionId: string): DbRow | null {
    this.autoHydrate();
    return (this.tables.execution_proofs || []).find(p => p.worker_id === workerId && p.submission_id === submissionId) || null;
  }
  listProofsForTask(taskId: string): DbRow[] {
    this.autoHydrate();
    return (this.tables.execution_proofs || []).filter(p => p.task_id === taskId).sort((a, b) => new Date(a.submitted_at as string).getTime() - new Date(b.submitted_at as string).getTime());
  }
  findTaskByDecision(orgId: string, decisionId: string): DbRow | null {
    this.autoHydrate();
    return this.tables.tasks.find(t => t.org_id === orgId && t.decision_id === decisionId) || null;
  }
  markDecisionOverridden(id: string): void {
    const d = this.getDecision(id);
    if (d) d.overridden = 1;
  }
  createOverride(o: DbRow): void {
    this.autoHydrate();
    if (!this.tables.overrides) this.tables.overrides = [];
    this.tables.overrides.push(o);
  }
  createVerificationReview(r: DbRow): void {
    if (!this.tables.verification_reviews) this.tables.verification_reviews = [];
    this.tables.verification_reviews.push(r);
  }
  createOutcome(o: DbRow): void {
    if (!this.tables.outcomes) this.tables.outcomes = [];
    this.tables.outcomes.push(o);
  }
  listOutcomes(orgId: string): DbRow[] {
    return (this.tables.outcomes || []).filter(o => o.org_id === orgId);
  }
  listOutcomesForEntity(orgId: string, level: string, id: string): DbRow[] {
    return (this.tables.outcomes || []).filter(o => o.org_id === orgId && o.entity_level === level && o.entity_id === id);
  }
  getOutcome(id: string): DbRow | null {
    return (this.tables.outcomes || []).find(o => o.id === id) || null;
  }
  listAudit(orgId: string): DbRow[] {
    return (this.tables.audit_logs || []).filter(a => a.org_id === orgId);
  }
  listAuditForEntity(entityLevel: string, id: string): DbRow[] {
    return (this.tables.audit_logs || []).filter(a => a.entity_level === entityLevel && a.entity_id === id);
  }
  listTasksAssignedTo(orgId: string, workerId: string): DbRow[] {
    this.autoHydrate();
    return this.tables.tasks.filter(t => t.org_id === orgId && (t.assigned_worker_ids_json as string || "").includes(workerId));
  }
  updateTaskState(id: string, state: string): void {
    const t = this.getTask(id);
    if (t) t.state = state;
  }
  initBase(): void {}
}
