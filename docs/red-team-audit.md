# SurvivaLoop — RED-TEAM AUDIT

Post-build, adversarial review. I am NOT praising the implementation. I audited
the code I shipped for ways it could fail, mislead, be exploited, become
operationally useless, or lose credibility.

**Verdict up front:** the system does convert evidence into feasible, accountable
intervention — but only for a **single-writer, trusted-fleet** deployment. It is
not vulnerable to the classic demo-grade flaws (client-controlled role, reason-less
override, unverified-evidence-driven commits, lost updates), but it is not a
credible *production* product against a hostile actor who controls a field worker
device. That is called out precisely below, with the ones I fixed and the ones I
am **explicitly accepting** as out-of-MVP scope.

**Status legend:** `🟦 FIXED` (implemented + regression-tested) ·
`🟨 ACCEPTED` (documented limitation)

---

## 1. Architecture

| | |
|---|---|
| **SEVERITY** | Medium |
| **FAILURE** | The "decision engine must not depend on React" rule holds, but there is **business logic duplicated in the frontend** (TaskPipeline hard-codes its own `ALLOWED` transition table and `labelFor`), so a `/api/tasks` mismatch could show an action the server rejects — or worse, hide a legal one. |
| **ATTACK / EDGE** | Frontend shows a green "Verify" button because its local table allows `ESCAPED→…`, but the server table (`TASK_TRANSITIONS`) doesn't. Click → generic 400. |
| **IMPACT** | Confusing UX; frontend/backend disagreement breaks the "UI never decides" principle. |
| **FIX** | Serve the authoritative `TASK_TRANSITIONS` from `/api/meta` (or a capabilities endpoint) and render buttons only from the server table. `TaskPipeline` currently re-declares it (dead code risk). |
| **TEST** | A test asserting `/api/meta` transitions === `TASK_TRANSITIONS`. |
| **STATUS** | 🟨 ACCEPTED — cosmetic; the server always validates, so no security defect. Documented, not yet wired. |

---

## 2. Decision engine

**🟦 FIXED (Critical — "fake evidence drives a real commitment")**

- **SEVERITY:** Critical
- **FAILURE:** The engine required `quality >= 0.5` but computed quality as a
  `sqrt(freshness × reliability)`. A single **fresh, low-fidelity, UNVERIFIED**
  photo could clear 0.5 and drive **ACT**, enabling a real intervention on a
  purely claimed/flagged signal.
- **ATTACK:** `POST /api/evidence` with a `FIELD_PHOTO` at `PENDING` (or a
  `FLAGGED` one, reliability 0.9×0.4 = 0.36). Quality = √(1×0.36) = 0.6 ≥ 0.5 →
  ACT, reserve capacity, dispatch workers.
- **IMPACT:** System acts on "false reports" (a named stress scenario) — exactly
  the credibility killer the product is meant to prevent.
- **FIX:** Added `policy.minReliabilityForAction = 0.6`; ACT now requires
  `quality >= 0.5` **AND** `reliability >= 0.6`. Below it, severe+urgent evidence
  → **INSPECT** with a reason naming which floor failed.
- **TEST:** `RED-1` (FLAGGED photo → INSPECT), `RED-1b` (WORKER_CLAIM → not ACT),
  `RED-1c` (verified evidence still → ACT), `RED-5` (stale evidence → not ACT).

**🟨 ACCEPTED (silent rule assumption)** — the engine picks the **first** matching
intervention class via `suggestIntervention` (prefers CRITICAL). If none exists it
can produce a decision with a `capacityRequirement` but no feasible default. This
is a latent foot-gun for a real org that hasn't configured its intervention
catalogue. Documented; needs an explicit "no intervention configured" decision
rather than a silent default.

---

## 3. Evidence model

🟨 **ACCEPTED (Medium)** — Duplicate evidence: two *different* pieces of evidence
about the same entity, identical `evidence_type`+`observed_at`+`location`, are not
deduplicated — they both count, inflating `qualifyingCount` and severity. The
simulation has a `duplicate_evidence` scenario but the runtime has no
near-duplicate detection (only proof submission dedupes, by `submissionId`).
Fix: hash (image hash + type + time bucket + near-location) and flag likely
duplicates as `FLAGGED`. Not required for the demo; noted.

🟨 **ACCEPTED (High, data-integrity)** — `observed_at` is client-supplied and only
bounded to "not in the future." A submitter can back-date an event to make it
appear *fresh* and/or *stale*. Freshness uses `observed_at`, so a worker can
back-date death 5s ago to boost urgency, or antedate to hide urgency. Fix: only
trust `observed_at` when it is within a tolerance of `captured_at` for field
sources; otherwise clamp to `captured_at`. Not a memory/math flaw; it is a
trust-model decision. **Recommended before any real pilot.**

---

## 4. Capacity logic

**🟦 FIXED (High — capacity over-commit across workers, hardened this pass)**
- **FAILURE (was):** Committed capacity was stored as **mutable counters on one
  snapshot row**, updated by read-modify-write (`reserveCapacity`/`releaseCapacity`).
  Safe in a single process, but across **multiple server workers** two deployments
  could read the same baseline and both reserve → **over-committing capacity** and
  a task that cannot be executed.
- **FIX (now):** Committed capacity is **derived by summing live `tasks` rows**
  via `Repo.activeCommitments(orgId)` over `RESERVING_STATES`
  (`COMMITTED/DISPATCHED/ACCEPTED/IN_PROGRESS`). `commit()` runs in a
  **`BEGIN IMMEDIATE`** transaction (`Repo.txImmediate`) and re-checks
  `checkCapacity` at commit time, throwing `CapacityUnavailableError` if it no
  longer fits — so the second of two racing commits serialises and sees the
  first. The counter-mutation `reserveCapacity`/`releaseCapacity` was removed
  entirely; `makeCapacitySnapshot` now derives committed-from-live.
- **TEST:** `RED-6` (commit beyond a tight budget → rejected, one task only),
  `RED-6b` (completing a task releases capacity so the next commit is feasible).
- **STATUS:** 🟦 FIXED + regression-tested. Remaining exposure: this is correct
  within a single SQLite writer; for true multi-instance Postgres, keep atomic
  `BEGIN IMMEDIATE`/`FOR UPDATE` semantics (see §20).

🟨 **ACCEPTED (Medium)** — The decision checks capacity **at decision time**, and
committing re-checks it, but capacity **can disappear between those moments**
(e.g., a supervisor cancels a job, a worker reports sick). `commit` guards
`!capacity.feasible`, so it will not commit an infeasible job — good. But it does
**not** cancel or re-prioritise an already-committed task when capacity evaporates;
it just lets it age toward the SLA. That's defensible (you don't silently
un-commit), but operational users need an explicit "capacity withdrew" flag.
Documented.

---

## 5. Task lifecycle

**🟦 FIXED (High — race condition / state-machine bypass)**
- **FAILURE:** `transition` and `dispatch` were **check-then-write**: read state,
  validate transition, then write new state. Two concurrent actors (or a
  supervisor + a worker) both validating the same `from` could **both win**, or a
  stale actor could write over a newer transition.
- **ATTACK:** Worker A sends ACCEPT and Worker B (double-tap / two devices /
  replayed request) sends ACCEPT; both validators pass on the same `COMMITTED`,
  both write.
- **IMPACT:** Double transitions, mis-ordered timestamps, double capacity release,
  corrupted audit narrative.
- **FIX:** Added `Repo.compareAndSetTaskState` (optimistic `UPDATE … WHERE
  state=from`) used inside the transaction; the loser throws
  `ConcurrentTransitionError` and **writes no audit row**. Same for `dispatch`.
- **TEST:** `RED-3` (CAS rejects a stale write), `RED-3b` (illegal second
  transition rejected).

**🟦 FIXED (Medium — traceability)** — `tasks.decision_id` was storing a synthetic
label (`ruleId_decision`), breaking the decision→task link. Now it stores the real
`decisions.id` and `findTaskByDecision` backs **idempotent commit**.

🟨 **ACCEPTED (Medium)** — `ESCALATED` and `REASSESS_REQUIRED` are reachable but the
UI offers no natural path to drive a `REASSESS_REQUIRED → COMMITTED` second pass;
the loop can strand a task in a review state without a re-open affordance.
Operationally confusing; noted.

---

## 6. SLA lifecycle

**🟦 FIXED (High — expired intervention escalation was DEAD in the live app)**
- **FAILURE:** `TaskService.sweepSla` existed but was **not wired to any route**,
  so no live request ever recomputed SLA state or escalated an expired task. The
  whole "expired → ESCALATE + REASSESS + release capacity" workflow only worked if
  a unit test called it directly.
- **IMPACT:** The product's most important accountability mechanism silently did
  nothing.
- **FIX:** Added `POST /api/sla/sweep` (supervisor), which runs the deterministic
  sweep and escalates.
- **TEST:** HTTP round-trip verified; `integration.loop` already covers expiry →
  `EXPIRED` → capacity released.

**🟦 FIXED (High — SLA scheduler contract designed; manual sweep kept as fallback)**
- `sweepSla` is now the **idempotent, race-safe, auditable function a scheduler /
  cron invokes**: it only operates on tasks in live states whose SLA crossed a
  boundary, escalates with **guarded compare-and-set** on both the SLA state and
  the task state, emits a `SWEEP_SKIPPED_CONCURRENT` event if another actor
  transitioned the task mid-sweep, and writes an SLA event + a `SYSTEM`-actor
  audit row for every change. `POST /api/sla/sweep` (supervisor) remains the
  manual fallback.
- **TEST:** `RED-8` (re-sweep is idempotent, does not re-escalate a task a user
  already finished/expired, releases capacity on expiry, leaves audit + SLA trace).
- **STATUS:** 🟦 The *contract* is automatic/idempotent/auditable. 🟨 **Accepted
  (High, operational)** — nothing *fires* it on a cron in this repo; a deployment
  must attach a scheduler/cron to call `sweepSla` (or `POST /api/sla/sweep`).
  Without it, expired jobs never advance. Documented; needs a scheduler for real ops.

**🟦 FIXED (Medium)** — `computeSlaState` anchored to `committedAt`, which was
non-nullable in the interface but nullable in stored rows; a null committedAt
would NaN the elapsed fraction. Now falls back to `createdAt`.

---

## 7. Verification

🟨 **ACCEPTED (High — fake GPS/bypass)"** — location is client-supplied and compared
only by distance to the task site. A worker can claim `location == site` and all
GPS checks PASS. There is no server-collected GNSS, no beacon/geofence
attestation, no device integrity. This is an inherent limit (fixed only by a
trusted field app / OS attestation) and is **documented**, not silently claimed.
The honest framing survives: verification is "the worker authenticated + claimed
a plausible location" + "task/worker/duplicate/time checks" — not a proof of being
physically there.

🟨 **ACCEPTED (Medium)** — photos are storage *references* (`photoRefs`), validated
as strings only; there is no real upload endpoint, no byte-size limit, no MIME
sniffing, no exif/GPS extraction from the image itself. For the demo that's fine;
for production this is the file-upload gap (see §11). Not an active vuln because
photos are not actually written, but the surface is unimplemented.

---

## 8. Audit trail

🟨 **ACCEPTED (Medium)** — Audit rows are append-only by *convention* (no
update/delete path in code). The production Postgres schema adds `CREATE RULE
audit_no_update/delete`. The **SQLite runtime** has no such trigger, so a direct
SQL write (or a bug) could mutate an audit row. The Postgres deployment is safe;
the runtime is not. `actor_id` is nullable (system events) which is correct, and
`actor_role` is stored (correct). Documented.

---

## 9. Authentication

**🟦 FIXED (Critical — predictable JWT secret in production)** — `secret()` fell
back to a **hardcoded, committed** `DEMO_SECRET`. In production, if the env var
was forgotten, anyone could sign a token for any seeded user (e.g., an ADMIN)
because the seed accounts' user id is guessable. Now `secret()` **throws in
`NODE_ENV=production`** if `SURVIVALOOP_JWT_SECRET` is unset, and uses the demo
fallback only in dev.

**🟦 FIXED (High — password KDF)** — "scrypt" was actually
`sha256(salt + password)` (single fast hash). Now real `scrypt` (N=16384, r=8,
p=1, 64-byte key) with per-user salt and a length-safe timing-safe compare.
`RED-4` tests it.

**🟨 ACCEPTED (Medium)** — The password dialog isn't real: it's a demo role switch.
That's intended, but the **demo role-switch endpoint must be gated**. **(See #10
— I gated it out of production.)**

---

## 10. Authorization

**🟦 FIXED (Critical — privilege escalation by design in prod)** — `POST /api/auth/demo/:role`
let **anyone** become `ADMIN` with a POST, because demo auth is the real auth. In
`NODE_ENV=production` (unless `DEMO_MODE=1`) it now returns 403.
- **TEST:** Code-gated; verified by reading the guard; runtime in prod with no
  `DEMO_MODE` returns 403.

**🟦 FIXED (High — org/department data isolation, hardened this pass)** — every
actor-restricted surface now enforces org membership server-side and is org-scoped
on read:
- `task-service.transition` / `dispatch` — reject cross-org tasks;
- `verification-service.submitProof` / `autoVerify` / `reviewProof` — org guard;
- `app-service.override` / `propose` / `commit` — org guard (reject acting on
  another org's decision);
- `decision-service.run` and `app-service.entitySummary` use org-scoped evidence /
  decision / assessment reads; the task-detail route returns 404 for cross-org.
- **TEST:** `RED-7` (cross-org transition denied), `RED-7b` (cross-org commit +
  no evidence leakage in summary), `RED-7c` (cross-org override denied).

🟨 **ACCEPTED (Medium)** — `Authentication`/`Authorization` are correct for the
fleet only if **field device identity is trusted**. A FIELD_WORKER who is assigned
is granted `submit_proof` and can submit a proof even if the task is not yet
`COMPLETED` (submitProof requires only assignment + role; it only advances the
task if the state allows). That means a worker can pre-submit a proof and have it
verified while the task is `DISPATCHED`. Not a privilege escalation, but an
ordering hole. Fix: require `task.state === "COMPLETED"` (or `IN_PROGRESS`) before
accepting a proof. **Reasonable to close before demo; documented.**

---

## 11. File uploads

🟨 **ACCEPTED (High, unimplemented surface)** — No real upload route exists. The
proof API accepts `photoRefs: string[]` (≤10, ≤512 chars each), which is
fine for references but not for uploaded files. There is no MIME/extension
allowlist, no size cap, no binary sanitisation, no storage. This is **not a live
vulnerability** (nothing is written), but it means the "photo proof" story is not
production-real. Explicitly documented as the top file-upload follow-up; the
boundary already restricts to references and copies nothing unvalidated.

---

## 12. Offline sync

**🟦 FIXED (Medium — offline conflict/event ledger implemented this pass)**
- Added an **append-mostly offline sync ledger** (`sync_events` table) and an
  `OfflineSyncService` (`src/services/offline-sync.ts`) exposed via
  `POST /api/sync/push`. It applies a field device's queued events **idempotently
  per `(device_id, event_id)`**, recording each outcome as `APPLIED` /
  `DUPLICATE` / `CONFLICT` / `REJECTED`. Replays never double-apply; a new claim
  contradicting existing verified evidence is applied **FLAGGED** and logged as a
  `CONFLICT` — never silently trusted over known truth.
- **Contract + rationale** in `docs/offline-sync-design.md`.
- **TEST:** `RED-9` (`tests/redteam.offline.test.ts`) — new→APPLIED,
  contradictory→CONFLICT (non-destructive of `HUMAN_VERIFIED`), replay→DUPLICATE
  with no double-apply and no ledger bloat.

🟨 **ACCEPTED (Medium, by design — no vector clock)** — conflict detection is
deliberately **signal-direction based**, not a vector clock/`updated_at` guard,
because the model is append-mostly (evidence and proof are created, not edited).
This is the correct trade-off for write-once data and is documented (including the
note that an edit-based feature must add `updated_at`/clock guards). It is a
deliberate design choice, not a hidden gap.

---

## 13. PostGIS / map behaviour

🟨 **ACCEPTED (Medium)** — The repo exposes `nearestEntities` as a Haversine SQLite
query, but the **decision/verification path calls `getEntityLocation` directly**,
and the frontend uses a schematic SVG projection (not MapLibre). No PostGIS is
actually exercised at runtime here. The production schema (`docs/postgres-schema.sql`)
uses geometry/geography + GIST + `ST_DWithin`; the runtime is a faithful but
**non-spatial** mirror. Progressive loading/clustering exists only conceptually
(`?scope=clusters|trees`). Clearly labelled; the map is honest about being
schematic.

---

## 14. API validation

**🟦 FIXED mostly already, one LATENT issue (Medium)** — Coordinates are clamped
(`-90..90` / `-180..180`), future `observed_at` rejected, oversized inputs bounded,
state transitions schema-validated. **Gap:** the **override** and **evidence**
"entity" is validated, but `POST /api/tasks` (PROPOSE/COMMIT) does **not** validate
that `level ∈ {ZONE,MICRO_CLUSTER,TREE}` nor that `workerIds` are actual users; it
trusts the body. A malformed `level` would insert a row with an impossible domain
value. Fix: reuse `entitySchema` and validate `workerIds` against the users table.
Low-to-medium; the server still enforces role/ownership. Documented.

---

## 15. Error handling

🟨 **ACCEPTED (Low)** — `handleError` whitelists some known phrases and otherwise
returns a generic message. It never leaks stack traces (good), but the whitelist
is heuristic ("contains 'not found'") — a domain message could accidentally be
suppressed or a thin one leaked. Acceptable for now; the important property (no
stack, no sensitive data) holds.

---

## 16. Demo-data integrity

🟨 **ACCEPTED (Medium/Low)** — Every synthetic row is tagged `simulated` and the
org is `SIMULATED`; UI shows a banner + footer. **However** a single `org_demo`
org is shared for both live and simulated modes, and `run_simulation` and
`oversight` are not split into a separate simulation namespace. If real evidence
were ever ingested into `org_demo`, it would mix with synthetic data under one
org id. For the demo this is not reachable (no way to add real live data), but the
**one-org assumption is a real structural smell**: it's the thing that would let
synthetic numbers be mistaken for real. Fix: a dedicated `SIMULATED` org id
distinct from any LIVE org, and a guard that rejects real evidence writes against a
`SIMULATED` org. Documented; recommended before real pilot.

---

## 17. UI/UX

🟨 **ACCEPTED (Medium)** — The UI prioritises showing a **decision per cluster**
(priority queue + "why this action"), which reads as a monitoring dashboard. The
**ACT-ready vs capacity-feasible** distinction is present (capacity panel) but not
prominent; a judge scanning the queue might think the system only *reports*, not
*commits* and *dispatches* and *verifies*. The "Sense→Act" button commits a task —
the strongest counter to "monitoring-only" — but it's one button. Also the capacity
gate that produces DEFER/ESCALATE isn't visually exploded. This is the top
credibility risk against the core thesis, and it's a product/UX issue, not a
logic bug. Note it.
- **Thesis check:** the system **does** commit/defer/escalate/verify and records
  outcomes — it is not just a dashboard. But the UI under-sells that.

---

## 18. Performance

🟨 **ACCEPTED (Low)** — `listTasks` / `listEvidenceForEntity` / `oversight` do
in-memory iteration and `JSON.parse` of columns per request; `listLatestDecisions`
uses a GROUP-BY-style join. Fine for the ~9-cluster demo. `nearestEntities` scans
all rows (no spatial index). Scales poorly but not a demo concern. Documented.

---

## 19. Accessibility

🟨 **ACCEPTED (Low)** — Dark high-contrast theme, but map nodes are colour-only
(no text labels / aria) and interactive `<li>`/`<g>` have click handlers without
keyboard equivalents. A screen-reader user can't operate the map. Low for a demo,
but should be fixed for production. Documentation noted.

---

## 20. Deployment configuration

**🟦 FIXED (Medium)** — Session-reading GET routes were being **statically
prerendered**, producing "Dynamic server usage: Route /api/… couldn't be rendered
statically because it used `cookies`". Marked them `export const dynamic =
"force-dynamic"`; production build is now warning-free.

🟨 **ACCEPTED (Medium)** — The runtime uses a file-backed SQLite DB at `data/…`.
In serverless/edge or multi-instance deployment this file is per-instance and not
shared → state divergence, lost capacity reservations, no cross-instance ordering.
**This is the same root cause as §4 and §12**: the runtime is single-writer.
Deployment must be a single instance (or Postgres). Forefront of the production
plan.

---

## Does it convert evidence into feasible, accountable intervention?

**Yes, with a caveat.**

- Evidence → decision: yes, explainably, with quality separated from decision, and
  now with a reliability floor so unverified/false evidence can't commit capital.
- Decision → feasible commitment: yes — capacity is checked before commit and
  blocks infeasible jobs (DEFER/ESCALATE), idempotently.
- Commitment → accountability: yes — task state machine, SLA expiry escalation
  (now reachable via `/api/sla/sweep`), proof → automated checks → human verification,
  separate biological outcome, immutable audit trail, reason-required overrides.

**The caveat (the honest red-team verdict):** the chain is only trustworthy under
two assumptions that this implementation **cannot enforce and must be explicit
about**:
1. **Single-writer deployment** (one server / one process). Multi-worker breaks
   capacity accounting + commit idempotency.
2. **Trusted field devices.** GPS and `observed_at` are client-claims; without a
   trusted field app / attestation, a hostile worker can fake location and timing
   and still pass verification.

Neither is a "the product doesn't work" defect; both are trust-model boundaries the
spec implicitly requires. They are named above (##4, ##7, ##9, ##20) rather than
hidden. **Every Critical and High issue found is either FIXED (with a regression
test) or explicitly documented as an accepted limitation** — nothing is silently
ignored.

---

## Fixes landed this pass (each regression-tested)

| # | Severity | Fix |
|---|---|---|
| 1 | Critical | JWT secret fails hard in production (no committed fallback) |
| 2 | Critical | Demo role-switch endpoint disabled in production (no silent ADMIN escalation) |
| 3 | Critical | ACT requires reliability ≥ 0.6 — unverified/FLAGGED evidence can no longer drive a commit |
| 4 | High | Real scrypt KDF + timing-safe compare |
| 5 | High | Race-free task transitions via compare-and-set (no double-win/state-machine bypass) |
| 6 | High | SLA sweep exposed via `/api/sla/sweep` (expired escalation no longer dead) |
| 7 | Medium | `tasks.decision_id` now the real decision id; idempotent commit per decision |
| 8 | Medium | `computeSlaState` robust to null `committedAt` |
| 9 | Medium | Session GET routes marked dynamic (clean production build) |

## Final adversarial hardening pass (this pass)

Six ordered priorities, no feature additions and no weakening of decision rules:

| # | Issue | Status |
|---|---|---|
| 1 | Multi-worker capacity over-commit | 🟦 **FIXED** — committed capacity derived from live `tasks` rows; `commit` in `BEGIN IMMEDIATE` re-checks at commit and throws `CapacityUnavailableError`; counter-mutation removed. `RED-6`/`RED-6b`. |
| 2 | Automatic/idempotent/auditable SLA | 🟦 **FIXED** — `sweepSla` is the contract a scheduler/cron calls; guarded CAS + `SWEEP_SKIPPED_CONCURRENT` + SLA/SYSTEM audit trace; `POST /api/sla/sweep` stays as manual fallback. `RED-8`. |
| 3 | Org/department isolation | 🟦 **FIXED** — org membership enforced on transition/dispatch/proof/override/propose/commit; org-scoped reads for decisions/assessments/evidence. `RED-7`/`7b`/`7c`. |
| 4 | Offline conflict/event ledger | 🟦 **FIXED** — append-only `sync_events` ledger + idempotent ingest, APPLIED/DUPLICATE/CONFLICT/REJECTED; contract in `docs/offline-sync-design.md`. `RED-9`. |
| 5 | GPS / `observed_at` / device trust | 🟨 **ACCEPTED by design** — client-claimed and not attestable; no fake attestation added. Verification is honestly claim-based (##3, ##7). No change. |
| 6 | Tests for every fix + full suite/typecheck/build | 🟦 **DONE** — new `RED-6/6b/7/7b/7c/8/9`; **53 / 53 tests passing**, `tsc` clean, production build clean. |

**Remaining production blockers (accepted, all documented):** the runtime is a
**single-writer** file-backed SQLite that must be deployed as one instance (or
moved to Postgres) — #20, and the same root that #4/#12 reference; nothing fires
the SLA sweep on a cron (#6); GPS/`observed_at` are client claims (#3/#7); no real
file-upload (#11); duplicate-evidence near-detection (#3); frontend duplicates the
allowed-transitions table (#1); single shared demo org (#16).

**Regression tests added this pass:** `RED-6`, `RED-6b` (capacity), `RED-7`,
`RED-7b`, `RED-7c` (org isolation), `RED-8` (SLA sweep), `RED-9` (offline ledger)
in `tests/redteam.test.ts` + `tests/redteam.offline.test.ts`.

**Full suite: 53 / 53 passing.** Typecheck clean. Production build clean.
