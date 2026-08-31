import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { getCtx } from "@/server/context";

export async function POST(
  req: Request,
  { params }: { params: { level: string; id: string } }
) {
  try {
    const user = await requireCapability("override_decision"); // Must be supervisor or admin
    const body = await req.json();
    const app = getCtx().app;
    
    // Call the recordOutcome service
    const res = app.recordOutcome(user, {
      entityLevel: params.level,
      entityId: params.id,
      taskId: body.taskId || null,
      survived: Boolean(body.survived),
      improved: Boolean(body.improved),
      evidenceIds: body.evidenceIds || []
    });
    
    return NextResponse.json(res);
  } catch (e) {
    return handleError(e);
  }
}
