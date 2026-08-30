/**
 * SurvivaLoop — SQLite runtime schema (for the mobile/sandbox demo).
 *
 * This mirrors the production PostgreSQL/PostGIS schema (see
 * `/docs/postgres-schema.sql`) 1:1 conceptually. SQLite is used for the
 * runnable demo because Postgres/PostGIS is not available in this sandbox.
 * Spatial columns are stored as WKT strings here; the runtime uses a small
 * nearest-neighbour / proximity adapter. In production PostGIS types are used.
 *
 * No `ON UPDATE` chains — audit rows are append-only.
 */
export const SQLITE_DDL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_mode TEXT NOT NULL CHECK (data_mode IN ('LIVE','SIMULATED'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','FIELD_WORKER','AUDITOR')),
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  area_m2 REAL NOT NULL DEFAULT 0,
  boundary_wkt TEXT
);

CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  zone_id TEXT NOT NULL REFERENCES zones(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL,
  lng REAL
);

CREATE TABLE IF NOT EXISTS trees (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  cluster_id TEXT REFERENCES clusters(id),
  zone_id TEXT REFERENCES zones(id),
  code TEXT,
  species TEXT,
  lat REAL,
  lng REAL,
  planted_at INTEGER
);

CREATE TABLE IF NOT EXISTS interventions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  criticality TEXT NOT NULL CHECK (criticality IN ('ROUTINE','STANDARD','CRITICAL','EMERGENCY')),
  sla_limit_hours REAL NOT NULL,
  req_worker_hours REAL NOT NULL,
  req_water_units REAL NOT NULL,
  req_vehicle INTEGER NOT NULL DEFAULT 0,
  req_workers INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS workers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  hours_per_day REAL NOT NULL DEFAULT 8,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS capacity (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  time INTEGER NOT NULL,
  worker_hours REAL NOT NULL,
  water_units REAL NOT NULL,
  vehicles REAL NOT NULL,
  available_workers INTEGER NOT NULL,
  committed_worker_hours REAL NOT NULL DEFAULT 0,
  committed_water_units REAL NOT NULL DEFAULT 0,
  committed_vehicles REAL NOT NULL DEFAULT 0,
  committed_workers INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id),
  entity_level TEXT NOT NULL CHECK (entity_level IN ('ZONE','MICRO_CLUSTER','TREE')),
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  signal TEXT NOT NULL,
  implied_severity REAL NOT NULL,
  observed_at INTEGER NOT NULL,
  captured_at INTEGER NOT NULL,
  lat REAL,
  lng REAL,
  collector_id TEXT,
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  provenance_note TEXT,
  simulated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidence_conflicts (
  id TEXT PRIMARY KEY,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  severity_level TEXT NOT NULL,
  severity_score REAL NOT NULL,
  urgency_level TEXT NOT NULL,
  urgency_score REAL NOT NULL,
  quality REAL NOT NULL,
  conflicted INTEGER NOT NULL DEFAULT 0,
  report_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  reason_json TEXT NOT NULL,
  evidence_used_json TEXT NOT NULL,
  quality_json TEXT NOT NULL,
  capacity_available_json TEXT,
  sla_hours REAL,
  next_action TEXT NOT NULL,
  overridden INTEGER NOT NULL DEFAULT 0,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  state TEXT NOT NULL,
  intervention_class_id TEXT NOT NULL REFERENCES interventions(id),
  decision_id TEXT,  -- soft reference; production enforces FK to decisions(id)
  lat REAL,
  lng REAL,
  created_at INTEGER NOT NULL,
  committed_at INTEGER,
  dispatched_at INTEGER,
  accepted_at INTEGER,
  started_at INTEGER,
  completed_at INTEGER,
  proof_submitted_at INTEGER,
  verified_at INTEGER,
  sla_created_at INTEGER,
  sla_committed_at INTEGER,
  sla_deadline INTEGER,
  sla_execution_at INTEGER,
  sla_completion_at INTEGER,
  sla_verification_at INTEGER,
  sla_state TEXT NOT NULL DEFAULT 'NORMAL',
  assigned_worker_ids_json TEXT NOT NULL DEFAULT '[]',
  simulated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sla_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  at INTEGER NOT NULL,
  action TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_proofs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  worker_id TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  claimed_at INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  lat REAL,
  lng REAL,
  photo_refs_json TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  verification_status TEXT NOT NULL DEFAULT 'PENDING',
  checks_json TEXT,
  review_outcome TEXT,
  reviewer_id TEXT,
  reviewed_at INTEGER,
  simulated INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_proof_submission_worker
  ON execution_proofs(worker_id, submission_id);

CREATE TABLE IF NOT EXISTS verification_reviews (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  proof_id TEXT NOT NULL REFERENCES execution_proofs(id),
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('VERIFIED','REJECTED','NEEDS_HUMAN')),
  reason TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS outcomes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  task_id TEXT,
  survived INTEGER NOT NULL,
  improved INTEGER NOT NULL,
  measured_at INTEGER NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  simulated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS overrides (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  entity_level TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  system_decision TEXT NOT NULL,
  human_decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  actor_id TEXT,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  reason TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at DESC);

-- Offline sync + conflict ledger (append-only).
-- A field device reports a batch of events (evidence, proof submissions). Each
-- is applied idempotently keyed by (device_id, event_id); the outcome
-- (APPLIED / DUPLICATE / CONFLICT / REJECTED) is recorded here so competing or
-- replayed syncs are visible and never silently double-applied.
CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_level TEXT,
  entity_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('APPLIED','DUPLICATE','CONFLICT','REJECTED')),
  conflict_note TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  applied_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sync_device_event ON sync_events(device_id, event_id);
`;
