import { NextResponse } from "next/server";
import { requireCapability, requireUser, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { canAccessTask } from "@/domain/permissions";
import { taskTransitionSchema } from "@/domain/validation-schema";

/** GET /api/tasks/:id — scoped read. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    ensureSimulation();
    const user = await requireUser();
    const { app } = getCtx();
    const task = app.repo.getTask(params.id);
    if (!task || task.org_id !== user.orgId) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (!canAccessTask(user.role, JSON.parse(task.assigned_worker_ids_json as string), user.id)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const proofs = app.repo.listProofsForTask(params.id);
    const slaEvents = app.repo.listSlaEvents(params.id);
    return NextResponse.json({ task, proofs, slaEvents });
  } catch (e) {
    return handleError(e);
  }
}

/** PATCH /api/tasks/:id — server-validated state transition. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    ensureSimulation();
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const parsed = taskTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid transition payload.", details: parsed.error.flatten() }, { status: 400 });
    }
    const { app } = getCtx();
    const task = app.transition(user, params.id, parsed.data.to as any, parsed.data.reason);
    return NextResponse.json(task);
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
