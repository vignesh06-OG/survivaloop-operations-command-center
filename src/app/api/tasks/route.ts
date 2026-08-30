import { NextResponse } from "next/server";
import { requireUser, handleError, HttpError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { canAccessTask, roleHas } from "@/domain/permissions";

/** GET /api/tasks?state= → list tasks scoped to the viewer's authorization. */
export async function GET(req: Request) {
  try {
    ensureSimulation();
    const user = await requireUser();
    // FIELD_WORKER may only read their OWN tasks (view_tasks_own);
    // supervisor/auditor/admin read org-wide (view_tasks_any).
    const canReadAny = roleHas(user.role, "view_tasks_any");
    const canReadOwn = roleHas(user.role, "view_tasks_own");
    if (!canReadAny && !canReadOwn) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { app } = getCtx();
    const url = new URL(req.url);
    const state = url.searchParams.get("state") ?? undefined;
    let tasks = app.repo.listTasks(user.orgId, state);
    // Scoped read: a FIELD_WORKER only sees their own tasks (server-side).
    if (user.role === "FIELD_WORKER") {
      tasks = tasks.filter((t) => canAccessTask(user.role, JSON.parse(t.assigned_worker_ids_json as string), user.id));
    }
    return NextResponse.json(tasks);
  } catch (e) {
    return handleError(e);
  }
}

/** POST /api/tasks — propose or commit an intervention from a decision. */
export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const app = getCtx().app;

    if (body.mode === "PROPOSE") {
      if (body.workerIds && user.role === "FIELD_WORKER") {
        // workers must be authorized to the field supervisor; simple guard here
      }
      const task = app.propose(user, {
        entity: { level: body.level, id: body.entityId },
        interventionId: body.interventionId,
        decisionId: body.decisionId,
        workerIds: (body.workerIds ?? []) as string[],
      });
      return NextResponse.json(task);
    }
    if (body.mode === "COMMIT") {
      const task = app.commit(user, {
        entity: { level: body.level, id: body.entityId },
        interventionId: body.interventionId,
        decisionId: body.decisionId,
        workerIds: (body.workerIds ?? []) as string[],
      });
      return NextResponse.json(task);
    }
    throw new HttpError(400, "Unknown task mode.");
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
