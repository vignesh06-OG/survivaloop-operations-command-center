import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { evidenceInputSchema } from "@/domain/validation-schema";
import { severityOfEvidence, impliesSignal } from "@/domain/evidence-quality";
import POLICY from "@/domain/policy";
import { newId } from "@/domain/audit";

/** POST /api/evidence — ingest evidence; severity/signal are DERIVED server-side. */
export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("submit_proof");
    const body = await req.json().catch(() => ({}));
    const parsed = evidenceInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid evidence payload.", details: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    // Server-derived severity/signal from the evidence TYPE (not the client's claim).
    const impliedSeverity = severityOfEvidence({ evidenceType: d.evidenceType }, POLICY);
    const impliedSignal = impliesSignal({ evidenceType: d.evidenceType }, POLICY);
    const { app } = getCtx();
    const id = newId();
    app.repo.createEvidence({
      id,
      org_id: user.orgId,
      entity_level: d.entity.level,
      entity_id: d.entity.id,
      source: d.source,
      evidence_type: d.evidenceType,
      signal: impliedSignal,
      implied_severity: impliedSeverity,
      observed_at: d.observedAt,
      captured_at: Date.now(), // server-authoritative
      lat: d.location?.lat ?? null,
      lng: d.location?.lng ?? null,
      collector_id: user.id,
      verification_status: "PENDING",
      metadata_json: JSON.stringify(d.metadata ?? {}),
      provenance_note: d.provenanceNote ?? null,
      simulated: 0,
    });
    app.repo.appendAudit({
      id: newId(), org_id: user.orgId, actor_id: user.id, actor_role: user.role,
      action: "EVIDENCE_INGESTED", entity_type: d.entity.level, entity_id: d.entity.id,
      previous_state: null, new_state: "PENDING", reason: `type=${d.evidenceType} source=${d.source}`,
      metadata_json: JSON.stringify({ implied_severity: impliedSeverity }), at: Date.now(),
    });
    return NextResponse.json({ id, implied_severity: impliedSeverity, implied_signal: impliedSignal });
  } catch (e) {
    return handleError(e);
  }
}
