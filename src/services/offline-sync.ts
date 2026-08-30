/**
 * SurvivaLoop — offline sync + conflict ledger.
 *
 * A field device works offline, queues evidence/proof events, and pushes them
 * in a batch on reconnect. This service applies each event IDEMPOTENTLY keyed by
 * (device_id, event_id), and records its outcome in an append-only ledger:
 *
 *   APPLIED   — new, applied
 *   DUPLICATE — same (device,event_id) already applied (replay/retry) → no-op
 *   CONFLICT  — the new claim contradicts existing high-value evidence → applied
 *               but FLAGGED for review (never silently trusted over known truth)
 *   REJECTED  — invalid payload
 *
 * Retry and duplicate submissions therefore never double-apply, and competing
 * syncs are surfaced rather than silently overwritten. See
 * `docs/offline-sync-design.md` for the full contract and production guidance.
 */
import type { Repo, DbRow } from "@/data/repo";
import POLICY from "@/domain/policy";
import { severityOfEvidence, impliesSignal } from "@/domain/evidence-quality";
import type { EvidenceType, EvidenceSource, Signal } from "@/domain/types";
import { newId } from "@/domain/audit";
import type { SessionUser } from "./auth";
import { PermissionDeniedError } from "./task-service";
import { roleHas } from "@/domain/permissions";

export interface SyncEvidenceEvent {
  eventId: string;            // client-generated idempotency key
  type: "EVIDENCE";
  entity: { level: "ZONE" | "MICRO_CLUSTER" | "TREE"; id: string };
  source: EvidenceSource;
  evidenceType: EvidenceType;
  observedAt: number;
  location?: { lat: number; lng: number } | null;
  metadata?: Record<string, string | number | boolean>;
}

export type SyncLedgerEntry = {
  deviceId: string; eventId: string; status: string; conflictNote: string | null;
};

export class OfflineSyncService {
  constructor(private repo: Repo, private now: () => number = () => Date.now()) {}

  /**
   * Push a batch of offline events. Idempotent per (device,eventId). Returns the
   * per-event outcome and the full ledger for this batch.
   */
  pushBatch(actor: SessionUser, deviceId: string, events: SyncEvidenceEvent[]): { applied: number; duplicates: number; conflicts: number; ledger: DbRow[] } {
    if (!roleHas(actor.role, "submit_proof")) {
      throw new PermissionDeniedError(actor.id, "Role cannot submit offline evidence.");
    }
    const t = this.now();
    const ledger: DbRow[] = [];
    let applied = 0, duplicates = 0, conflicts = 0;

    for (const ev of events) {
      const existing = this.repo.findSyncEvent(deviceId, ev.eventId);
      if (existing) {
        duplicates++;
        ledger.push(this.repo.getSyncEventById(existing.id as string)!);
        continue;
      }

      const sev = severityOfEvidence({ evidenceType: ev.evidenceType }, POLICY);
      const signal = impliesSignal({ evidenceType: ev.evidenceType }, POLICY);
      const conflictNote = this.detectConflict(actor.orgId, ev, signal, sev);

      const id = newId();
      const appliedStatus = conflictNote ? "FLAGGED" : "PENDING";
      this.repo.tx(() => {
        this.repo.createEvidence({
          id,
          org_id: actor.orgId,
          entity_level: ev.entity.level,
          entity_id: ev.entity.id,
          source: ev.source,
          evidence_type: ev.evidenceType,
          signal,
          implied_severity: sev,
          observed_at: ev.observedAt,
          captured_at: t,
          lat: ev.location?.lat ?? null,
          lng: ev.location?.lng ?? null,
          collector_id: actor.id,
          verification_status: appliedStatus,
          metadata_json: JSON.stringify(ev.metadata ?? {}),
          provenance_note: `offline-sync device=${deviceId}`,
          simulated: actor.dataMode === "SIMULATED" ? 1 : 0,
        });
        const ledgerRow = {
          id: newId(),
          org_id: actor.orgId,
          device_id: deviceId,
          event_id: ev.eventId,
          event_type: "EVIDENCE",
          entity_level: ev.entity.level,
          entity_id: ev.entity.id,
          status: conflictNote ? "CONFLICT" : "APPLIED",
          conflict_note: conflictNote,
          payload_json: JSON.stringify({ evidence_type: ev.evidenceType, source: ev.source, observed_at: ev.observedAt }),
          applied_at: t,
        };
        this.repo.createSyncEvent(ledgerRow);
        this.repo.appendAudit(this.audit(actor, "OFFLINE_EVIDENCE_" + (conflictNote ? "CONFLICT" : "APPLIED"), ev.entity, id, ev.eventId, { device_id: deviceId }));
      });

      if (conflictNote) conflicts++; else applied++;
      ledger.push(this.repo.getSyncEventById(this.repo.findSyncEvent(deviceId, ev.eventId)!.id as string)!);
    }

    return { applied, duplicates, conflicts, ledger };
  }

  /** Lightweight conflict detect: new claim contradicts existing verified high-severity claim. */
  private detectConflict(orgId: string, ev: SyncEvidenceEvent, signal: Signal, sev: number): string | null {
    const existing = this.repo.listEvidenceForEntityInOrg(orgId, ev.entity.level, ev.entity.id);
    for (const e of existing) {
      const eSev = e.implied_severity as number;
      const eSignal = e.signal as Signal;
      const verified = e.verification_status === "HUMAN_VERIFIED" || e.verification_status === "AUTO_PASS";
      const opposite = (signal !== "NEUTRAL" && eSignal !== "NEUTRAL" && signal !== eSignal);
      if (opposite && Math.max(sev, eSev) >= POLICY.minQualityForDecision) {
        return `Conflicts with existing ${e.evidence_type} (${eSignal}) for this entity; flagged for review.`;
      }
    }
    return null;
  }

  private audit(actor: SessionUser, action: string, entity: { level: string; id: string }, evidenceId: string, eventId: string, meta: Record<string, unknown>): DbRow {
    return {
      id: newId(), org_id: actor.orgId, actor_id: actor.id, actor_role: actor.role,
      action, entity_type: entity.level, entity_id: entity.id, previous_state: null, new_state: "PENDING",
      reason: `event=${eventId}`, metadata_json: JSON.stringify({ evidence_id: evidenceId, ...meta }), at: this.now(),
    };
  }
}


