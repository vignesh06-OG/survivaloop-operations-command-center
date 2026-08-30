# Offline Sync & Conflict Ledger — Design

Status: **implemented** (`src/services/offline-sync.ts`, `src/data/sqlite-schema.ts`,
`src/app/api/sync/push/route.ts`). This is the field-operations sync contract.

## Problem

A field worker operates offline, queues evidence/proof events on-device, and pushes
them in a batch on reconnect. Two hazards must be handled:

1. **Duplicate/replayed submissions** — a retried batch must not double-apply
   (no double evidence for the same capture).
2. **Conflicting claims** — an offline claim that contradicts the server's
   current picture must never **silently overwrite** known, verified truth.

## Contract

`POST /api/sync/push` accepts `{ deviceId, events: [...] }` where each event carries
a client-generated `eventId` (an idempotency key). The server applies each event
**exactly once per `(device_id, event_id)`** and records its outcome in an
append-only ledger table (`sync_events`):

| status    | meaning                                                            |
|-----------|--------------------------------------------------------------------|
| `APPLIED` | new event, created as evidence                                     |
| `DUPLICATE`| same `(device,event)` already applied → no-op, returned in response |
| `CONFLICT`| new claim contradicts existing verified high-value evidence → created **FLAGGED** and reported |
| `REJECTED`| invalid payload                                                    |

Key properties:

- **Idempotent** — replayed/retried batches never double-apply. The unique index
  `ux_sync_device_event` is the hard guard; duplicates are reported in the batch
  response but **not** re-inserted into the ledger (an append-mostly ledger must
  not bloat with replay rows).
- **Outcome recorded** — every distinct event produces a ledger row + an audit
  row (`OFFLINE_EVIDENCE_APPLIED` / `OFFLINE_EVIDENCE_CONFLICT`), so a sync is
  traceable and auditable.
- **Conflict surfaced, not silently trusted** — a new claim whose signal differs
  from an existing verified non-neutral claim for the same entity (and whose
  severity meets the decision-quality threshold) is applied but set to
  `verification_status = FLAGGED` so it cannot drive ACT, and the conflict is
  recorded with a note. Known-truth evidence (`HUMAN_VERIFIED`) is never
  overwritten by an offline claim.

## Conflict detection (simple, deterministic)

No vector clocks. For each event we compare against the entity's existing
evidence:

```
opposite  = signal(e) != NEUTRAL  && e_signal != NEUTRAL  && signal(e) != e_signal
conflict  = opposite && max(severity(e), e_severity) >= minQualityForDecision
```

If `conflict`, the event is applied with `verification_status = FLAGGED` and the
ledger row is `CONFLICT`. This is deliberately conservative: it never degrades a
verified claim, and it never lets a contradiction into the decision pipeline
without review.

## Why no vector clock / optimistic concurrency?

The domain model is **append-mostly** — evidence and proof are created, not edited.
Conflicts only arise when two sources describe the *same entity* with
*opposite signals*. A vector clock would multiply complexity for a case the
signal-direction check already catches deterministically. For the current
read-heavy, write-once model, the append-mostly design plus the explicit
conflict flag is the correct trade-off.

**Accepted limitation** (documented, not hidden): if a future feature allows
*editing* evidence or proof, this design must add an `updated_at`/vector-clock
guard. Until then this contract holds.

## Storage

```sql
CREATE TABLE sync_events (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  event_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  entity_level  TEXT,
  entity_id     TEXT,
  status        TEXT NOT NULL CHECK (status IN ('APPLIED','DUPLICATE','CONFLICT','REJECTED')),
  conflict_note TEXT,
  payload_json  TEXT NOT NULL DEFAULT '{}',
  applied_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_sync_device_event ON sync_events(device_id, event_id);
```

## Production notes

- In the Postgres adapter, keep `ux_sync_device_event`, and use a serializable
  transaction (or `INSERT ... ON CONFLICT DO NOTHING` returning the status) for
  the apply step so concurrent syncs from the same device stay idempotent.
- `deviceId` is a client-supplied identifier bound to the authenticated worker;
  bind it to the user/session at the route layer and reject a mismatch.
- Push a batch inside one transaction so a partial failure cannot leave a
  half-applied batch; each event is individually idempotent regardless.

## Regression tests

`tests/redteam.offline.test.ts` (RED-9) pins: new→APPLIED, contradictory→CONFLICT
(non-destructive of verified data), replay→DUPLICATE with no double-apply and no
ledger bloat.
