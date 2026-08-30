-- ============================================================================
-- SurvivaLoop — production schema (PostgreSQL + PostGIS)
-- ============================================================================
-- This is the deployable database design. The runnable sandbox demo uses a
-- SQLite mirror (src/data/sqlite-schema.ts) so the whole product is verifiable
-- without Postgres/PostGIS; this file is the target production surface and is
-- kept 1:1 in concept (the SQLite DDL mirrors these tables/columns).
--
-- Design notes:
--   * Spatial types are PostGIS (geometry(Point, 4326)); WKT fallback columns
--     are not needed in production.
--   * Every decision/override/audit row is append-only. No UPDATE mutates
--     history; corrections are new rows.
--   * Never assume every deployment has tree-level IDs: zones/clusters/trees
--     are each optional, and evidence/decisions reference an entity by
--     (entity_level, entity_id) rather than a forced FK to trees.
--   * Identity + timestamps are generated server-side; GPS is a *claim* and is
--     verified, never authoritative.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- for gen_random_uuid()

-- --------------------------------------------------------------------- Org/user
CREATE TABLE organisations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  data_mode       TEXT NOT NULL CHECK (data_mode IN ('LIVE','SIMULATED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisations(id),
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','FIELD_WORKER','AUDITOR')),
  password_hash   TEXT NOT NULL,          -- scrypt$salt$hash (Node side)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------- Hierarchy
CREATE TABLE zones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  boundary      geometry(GEOMETRY, 4326) NOT NULL,   -- polygon / multipolygon
  area_m2       DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_zones_geo ON zones USING GIST (boundary);

CREATE TABLE clusters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  zone_id       UUID REFERENCES zones(id),
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  centroid      geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clusters_geo ON clusters USING GIST (centroid);

CREATE TABLE trees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  cluster_id    UUID REFERENCES clusters(id),
  zone_id       UUID REFERENCES zones(id),
  code          TEXT,
  species       TEXT,
  location      geometry(Point, 4326),
  planted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trees_geo ON trees USING GIST (location);

-- ------------------------------------------------------- Intervention catalogue
CREATE TABLE interventions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organisations(id),
  code              TEXT NOT NULL UNIQUE,
  label             TEXT NOT NULL,
  criticality       TEXT NOT NULL CHECK (criticality IN ('ROUTINE','STANDARD','CRITICAL','EMERGENCY')),
  sla_limit_hours   DOUBLE PRECISION NOT NULL,
  req_worker_hours  DOUBLE PRECISION NOT NULL,
  req_water_units   DOUBLE PRECISION NOT NULL,
  req_vehicle       BOOLEAN NOT NULL DEFAULT FALSE,
  req_workers       INT NOT NULL DEFAULT 1
);

-- ------------------------------------------------------------------ Resources
CREATE TABLE workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  user_id       UUID REFERENCES users(id),
  name          TEXT NOT NULL,
  hours_per_day DOUBLE PRECISION NOT NULL DEFAULT 8,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- A running capacity snapshot (effective available minus committed).
CREATE TABLE capacity_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_hours  DOUBLE PRECISION NOT NULL,     -- currently available
  water_units   DOUBLE PRECISION NOT NULL,
  vehicles      INT NOT NULL,
  available_workers INT NOT NULL,
  committed_worker_hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  committed_water_units  DOUBLE PRECISION NOT NULL DEFAULT 0,
  committed_vehicles     INT NOT NULL DEFAULT 0,
  committed_workers      INT NOT NULL DEFAULT 0
);

-- A human-editable resource register (water points, vehicles, crews).
CREATE TABLE resources (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organisations(id),
  kind      TEXT NOT NULL CHECK (kind IN ('WATER','VEHICLE','CREW')),
  name      TEXT NOT NULL,
  available DOUBLE PRECISION NOT NULL,
  unit      TEXT NOT NULL
);

-- --------------------------------------------------------------------- Evidence
CREATE TABLE evidence (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organisations(id),
  entity_level        TEXT NOT NULL CHECK (entity_level IN ('ZONE','MICRO_CLUSTER','TREE')),
  entity_id           UUID NOT NULL,               -- no forced FK: clusters OR trees optional
  source              TEXT NOT NULL CHECK (source IN ('FIELD_PHOTO','FIELD_OBSERVATION','DRONE','SENSOR','WORKER_CLAIM','REPORT','ORGANISATION_RECORD')),
  evidence_type       TEXT NOT NULL,
  signal              TEXT NOT NULL CHECK (signal IN ('DISTRESS','IMPROVEMENT','NEUTRAL')),
  implied_severity    DOUBLE PRECISION NOT NULL,   -- derived server-side from type
  observed_at         TIMESTAMPTZ NOT NULL,        -- claim, bounded
  captured_at         TIMESTAMPTZ NOT NULL,        -- server-authoritative
  location            geometry(Point, 4326),       -- claim, verified
  collector_id        UUID REFERENCES users(id),
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','AUTO_PASS','FLAGGED','HUMAN_VERIFIED','REJECTED')),
  metadata_json       JSONB NOT NULL DEFAULT '{}',
  provenance_note     TEXT,
  simulated           BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_evidence_entity ON evidence(entity_level, entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_geo   ON evidence USING GIST (location);

CREATE TABLE evidence_conflicts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_level       TEXT NOT NULL,
  entity_id          UUID NOT NULL,
  evidence_ids       UUID[] NOT NULL,
  reason             TEXT NOT NULL,
  detected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved           BOOLEAN NOT NULL DEFAULT FALSE
);

-- ------------------------------------------------------------------- Analysis
CREATE TABLE assessments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organisations(id),
  entity_level      TEXT NOT NULL,
  entity_id         UUID NOT NULL,
  at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity_level    TEXT NOT NULL,
  severity_score    DOUBLE PRECISION NOT NULL,
  urgency_level     TEXT NOT NULL,
  urgency_score     DOUBLE PRECISION NOT NULL,
  quality           DOUBLE PRECISION NOT NULL,   -- separate from decision
  conflicted        BOOLEAN NOT NULL DEFAULT FALSE,
  report_json       JSONB NOT NULL
);

CREATE TABLE decisions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES organisations(id),
  entity_level           TEXT NOT NULL,
  entity_id              UUID NOT NULL,
  decision               TEXT NOT NULL CHECK (decision IN ('ACT','INSPECT','MONITOR','DEFER','ESCALATE')),
  rule_id                TEXT NOT NULL,           -- explains WHICH rule fired
  reason_json            JSONB NOT NULL,          -- ordered rationale
  evidence_used_json     JSONB NOT NULL,
  quality_json           JSONB NOT NULL,          -- evidence quality, separate
  capacity_available_json JSONB,
  sla_hours              DOUBLE PRECISION,
  next_action            TEXT NOT NULL,
  overridden             BOOLEAN NOT NULL DEFAULT FALSE,
  at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions(entity_level, entity_id, at DESC);

-- ------------------------------------------------------------------------ Task
CREATE TABLE tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organisations(id),
  entity_level          TEXT NOT NULL,
  entity_id             UUID NOT NULL,
  state                 TEXT NOT NULL CHECK (state IN ('PROPOSED','COMMITTED','DISPATCHED','ACCEPTED','IN_PROGRESS','COMPLETED','PROOF_SUBMITTED','VERIFIED','EXPIRED','ESCALATED','REJECTED','CANCELLED','REASSESS_REQUIRED')),
  intervention_class_id UUID NOT NULL REFERENCES interventions(id),
  decision_id           UUID REFERENCES decisions(id),
  site                  geometry(Point, 4326),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at          TIMESTAMPTZ, dispatched_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
  started_at            TIMESTAMPTZ, completed_at TIMESTAMPTZ, proof_submitted_at TIMESTAMPTZ, verified_at TIMESTAMPTZ,
  -- SLA fields (derived state recomputed deterministically)
  sla_created_at        TIMESTAMPTZ, sla_committed_at TIMESTAMPTZ, sla_deadline TIMESTAMPTZ,
  sla_execution_at      TIMESTAMPTZ, sla_completion_at TIMESTAMPTZ, sla_verification_at TIMESTAMPTZ,
  sla_state             TEXT NOT NULL DEFAULT 'NORMAL' CHECK (sla_state IN ('NORMAL','APPROACHING','CRITICAL','EXPIRED','ESCALATED')),
  assigned_worker_ids   UUID[] NOT NULL DEFAULT '{}',
  simulated             BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_tasks_entity ON tasks(entity_level, entity_id);
CREATE INDEX IF NOT EXISTS idx_tasks_state  ON tasks(state);

CREATE TABLE task_assignments (
  task_id   UUID NOT NULL REFERENCES tasks(id),
  worker_id UUID NOT NULL REFERENCES workers(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, worker_id)
);

CREATE TABLE sla_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id),
  from_state TEXT,
  to_state   TEXT NOT NULL,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  action     TEXT NOT NULL
);

-- ---------------------------------------------------------------------- Proof
CREATE TABLE execution_proofs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             UUID NOT NULL REFERENCES tasks(id),
  worker_id           UUID NOT NULL REFERENCES workers(id),
  submission_id       TEXT NOT NULL,               -- idempotency key (offline retries)
  claimed_at          TIMESTAMPTZ NOT NULL,        -- claim, bounded
  submitted_at        TIMESTAMPTZ NOT NULL,        -- server-authoritative
  location            geometry(Point, 4326),       -- claim, verified
  photo_refs          JSONB NOT NULL DEFAULT '[]',
  note                TEXT,
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','AUTO_PASS','FLAGGED','VERIFIED','REJECTED')),
  checks_json         JSONB,
  review_outcome      TEXT,
  reviewer_id         UUID REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  simulated           BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX ux_proof_submission_worker ON execution_proofs(worker_id, submission_id);
CREATE INDEX IF NOT EXISTS idx_proof_task ON execution_proofs(task_id);

CREATE TABLE verification_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organisations(id),
  proof_id    UUID NOT NULL REFERENCES execution_proofs(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  decision    TEXT NOT NULL CHECK (decision IN ('VERIFIED','REJECTED','NEEDS_HUMAN')),
  reason      TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------- Outcome (separate!)
CREATE TABLE outcomes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  entity_level  TEXT NOT NULL,
  entity_id     UUID NOT NULL,
  task_id       UUID REFERENCES tasks(id),
  survived      BOOLEAN NOT NULL,
  improved      BOOLEAN NOT NULL,
  measured_at   TIMESTAMPTZ NOT NULL,
  evidence_ids  UUID[] NOT NULL DEFAULT '{}',
  simulated     BOOLEAN NOT NULL DEFAULT FALSE
);

-- ------------------------------------------------------------- Override (both)
CREATE TABLE overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organisations(id),
  entity_level    TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  decision_id     UUID NOT NULL REFERENCES decisions(id),
  system_decision TEXT NOT NULL,
  human_decision  TEXT NOT NULL,
  reason          TEXT NOT NULL,           -- REQUIRED, never empty
  actor_id        UUID NOT NULL REFERENCES users(id),
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------- Audit (append-only)
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organisations(id),
  actor_id      UUID,                      -- null = system
  actor_role    TEXT NOT NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  previous_state TEXT,
  new_state      TEXT,
  reason         TEXT,
  metadata_json  JSONB NOT NULL DEFAULT '{}',
  at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at DESC);

-- RESTRICT: prevent direct UPDATE/DELETE on append-only tables.
CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
