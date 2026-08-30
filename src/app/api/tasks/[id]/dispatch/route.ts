import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { reassignSchema } from "@/domain/validation-schema";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    ensureSimulation();
    const user = await requireCapability("dispatch_task");
    const body = await req.json().catch(() => ({}));
    const parsed = reassignSchema.safeParse({ workerIds: body.workerIds });
    if (!parsed.success) {
      return NextResponse.json({ error: "Worker assignment invalid." }, { status: 400 });
    }
    const { app } = getCtx();
    const task = app.dispatch(user, params.id, parsed.data.workerIds);
    return NextResponse.json(task);
  } catch (e) {
    return handleError(e);
  }
}
