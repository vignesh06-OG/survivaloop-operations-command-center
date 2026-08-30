import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";

/** GET /api/entity/:level/:id → evidence timeline, latest decision, tasks, conflicts. */
export async function GET(
  _req: Request,
  { params }: { params: { level: string; id: string } },
) {
  try {
    ensureSimulation();
    const user = await requireCapability("view_evidence");
    const level = params.level as any;
    if (!["ZONE", "MICRO_CLUSTER", "TREE"].includes(level)) {
      return NextResponse.json({ error: "Invalid level." }, { status: 400 });
    }
    const app = getCtx().app;
    const summary = app.entitySummary(user, level, params.id);
    return NextResponse.json(summary);
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
