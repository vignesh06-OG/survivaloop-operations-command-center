import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { entitySchema } from "@/domain/validation-schema";

/** POST /api/decision { level, id, interventionId? } → run the SENSE→DECIDE loop. */
export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("create_task");
    const body = await req.json().catch(() => ({}));
    const parsed = entitySchema.safeParse({
      level: (body.level as string) ?? "MICRO_CLUSTER",
      id: body.id,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid entity.", details: parsed.error.flatten() }, { status: 400 });
    }
    const app = getCtx().app;
    const result = app.runDecision(user, parsed.data.level, parsed.data.id, body.interventionId);
    return NextResponse.json({
      decisionId: (result as any).decisionId ?? null,
      decision: result.decision,
      interventionId: result.interventionId,
      assessmentId: result.assessmentId,
    });
  } catch (e) {
    return handleError(e);
  }
}
