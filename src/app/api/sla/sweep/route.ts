import { route } from "@/server/request";
import { ensureSimulation } from "@/server/context";

/**
 * POST /api/sla/sweep — run the deterministic SLA sweep. Moves any task whose
 * SLA has crossed APPROACHING/CRITICAL/EXPIRED and escalates expired ones into
 * the EXPIRED lifecycle state (releasing reserved capacity). In production a
 * supervisor triggers this, or a scheduler runs it on a cron.
 */
export const POST = route(async (user, { app }) => {
  ensureSimulation();
  const moved = app.sweep(user);
  return { ok: true, moved: moved.map((m) => ({ state: m.to, taskId: m.task.id })) };
}, "dispatch_task");
