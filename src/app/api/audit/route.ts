import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";

/** GET /api/audit?entityType=&entityId= — read-oriented (AUDITOR/SUPERVISOR/ADMIN). */
export async function GET(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("view_audit_trail");
    const { app } = getCtx();
    const url = new URL(req.url);
    const et = url.searchParams.get("entityType");
    const eid = url.searchParams.get("entityId");
    const rows = et && eid
      ? app.repo.listAuditForEntity(et, eid)
      : app.repo.listAudit(user.orgId, 200);
    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
