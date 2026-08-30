import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { syncBatchSchema } from "@/domain/validation-schema";

/** POST /api/sync/push — apply a queued batch of offline events (idempotent, ledgered). */
export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("submit_proof");
    const body = await req.json().catch(() => ({}));
    const parsed = syncBatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid sync batch.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { app } = getCtx();
    const result = app.pushSync(user, parsed.data.deviceId, parsed.data.events);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}

/** GET /api/sync/push — read the offline event ledger (scope: field/supervisor). */
export async function GET() {
  try {
    ensureSimulation();
    const user = await requireCapability("view_evidence");
    const { app } = getCtx();
    return NextResponse.json(app.listSyncLedger(user));
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
