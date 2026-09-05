import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { overrideInputCoreSchema } from "@/domain/validation-schema";

/** POST /api/override ?" supervisor override; reason is REQUIRED (server-side). */
export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("override_decision");
    const body = await req.json().catch(() => ({}));
    const parsed = overrideInputCoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid override payload.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { app } = getCtx();
    const o = app.override(user, parsed.data);
    return NextResponse.json(o);
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";