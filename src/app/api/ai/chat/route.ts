import { NextResponse } from "next/server";
import { requireUser, handleError, HttpError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
import { canAccessTask, roleHas } from "@/domain/permissions";
import type { ChatMessage, TaskContext } from "@/lib/ai/provider";
import { getProvider } from "@/lib/ai/factory";

/**
 * POST /api/ai/chat — AI Field Assistant conversation endpoint.
 *
 * SECURITY:
 *   1. Requires an authenticated session (FIELD_WORKER or SUPERVISOR).
 *   2. Validates that the user has access to the specified taskId.
 *   3. Builds TaskContext from verified server data (never from the client).
 *   4. Passes only sanitized conversation history to the AI provider.
 *   5. Never exposes system prompts, task context internals, or secrets.
 *   6. The AI response is advisory only — no state mutations occur here.
 */

const provider = getProvider();

export async function POST(req: Request) {
  try {
    ensureSimulation();
    const user = await requireUser();

    // Only FIELD_WORKER and SUPERVISOR may use the assistant.
    if (!roleHas(user.role, "view_tasks_own") && !roleHas(user.role, "view_tasks_any")) {
      throw new HttpError(403, "Your role cannot use the field assistant.");
    }

    const body = await req.json().catch(() => ({}));
    const taskId = body.taskId;
    const history: ChatMessage[] = body.history ?? [];
    const locale: string = body.locale ?? "en";

    // Sanitize history: limit array size, only allow user/assistant roles, cap string length.
    if (!Array.isArray(history) || history.length > 50) {
      throw new HttpError(400, "History too long or invalid format.");
    }

    const sanitizedHistory: ChatMessage[] = history
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content).slice(0, 2000), // cap length to prevent abuse
        image: m.image ? String(m.image) : undefined, // allow base64 image
        ts: typeof m.ts === "number" ? m.ts : Date.now(),
      }));

    let context: TaskContext | null = null;
    
    if (taskId && typeof taskId === "string") {
      // Load task from verified server data (never trust client-supplied task info).
      const { app } = getCtx();
      const task = app.repo.getTask(taskId);
      if (!task || task.org_id !== user.orgId) {
        throw new HttpError(404, "Task not found.");
      }

      // Check user has access to this specific task.
      const workerIds = JSON.parse(task.assigned_worker_ids_json as string) as string[];
      if (!canAccessTask(user.role as any, workerIds, user.id)) {
        throw new HttpError(403, "You do not have access to this task.");
      }

      // Build context from verified server-side data.
      const proofs = app.repo.listProofsForTask(taskId);
      const existingPhotoRefs: string[] = [];
      let existingNotes: string | null = null;
      for (const p of proofs) {
        try {
          const refs = JSON.parse(p.photo_refs_json as string) as string[];
          existingPhotoRefs.push(...refs);
        } catch { /* ignore parse failures */ }
        if (p.note) existingNotes = p.note as string;
      }

      context = {
        taskId: task.id as string,
        entityId: task.entity_id as string,
        interventionClassId: task.intervention_class_id as string,
        state: task.state as string,
        slaState: (task.sla_state ?? "NORMAL") as string,
        slaDeadline: task.sla_deadline as number | null,
        assignedWorkerIds: workerIds,
        createdAt: task.created_at as number,
        existingPhotoRefs,
        existingNotes,
      };
    }

    // Call the AI provider. Context is NEVER sent to the client.
    const response = await provider.chat(sanitizedHistory, context, locale);

    // Return the AI response. Never include TaskContext or system prompts.
    return NextResponse.json({ response });
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
