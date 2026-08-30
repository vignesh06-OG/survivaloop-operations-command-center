"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { FALLBACK_TASK_COLOR, fmtAgo } from "@/lib/present";
import type { TaskState } from "@/domain/types";

export interface TaskView {
  id: string;
  state: TaskState;
  entity_id: string;
  sla_state: string;
  sla_deadline: number | null;
  committed_at: number | null;
  assigned_worker_ids_json: string;
  intervention_class_id: string;
  created_at: number;
  simulated?: boolean;
}
const ALLOWED: Record<TaskState, TaskState[]> = {
  PROPOSED: ["COMMITTED", "CANCELLED"],
  COMMITTED: ["DISPATCHED", "CANCELLED", "ESCALATED"],
  DISPATCHED: ["ACCEPTED", "CANCELLED", "ESCALATED"],
  ACCEPTED: ["IN_PROGRESS", "ESCALATED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ESCALATED"],
  COMPLETED: ["PROOF_SUBMITTED"],
  PROOF_SUBMITTED: ["VERIFIED", "REJECTED"],
  VERIFIED: [], EXPIRED: [], ESCALATED: ["REASSESS_REQUIRED"], REJECTED: ["REASSESS_REQUIRED"], CANCELLED: [], REASSESS_REQUIRED: ["COMMITTED"],
};

export default function TaskPipeline({ tasks, user, onChanged }: {
  tasks: TaskView[]; user: { role: string; name: string; id: string }; onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  if (tasks.length === 0) return <div className="panel p-4 text-[var(--muted)] text-sm">No tasks for this entity.</div>;

  const isWorker = user.role === "FIELD_WORKER";
  return (
    <div className="panel p-4 fade">
      <h3 className="text-sm font-bold mb-2">Intervention / Task pipeline</h3>
      {error && <div className="text-[12px] text-red-300 mb-2 bg-red-900/20 rounded p-2">{error}</div>}
      <ul className="space-y-2">
        {tasks.map((t) => {
          const assigned = JSON.parse(t.assigned_worker_ids_json) as string[];
          const mine = isWorker ? assigned.includes(user.id) : true;
          const allowed = ALLOWED[t.state] ?? [];
          return (
            <li key={t.id} className="border border-[var(--line)] rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="pill text-[11px]" style={{ background: "#121a22", color: FALLBACK_TASK_COLOR[t.state] ?? "#94a3b8" }}>{t.state}</span>
                {!mine && <span className="text-[11px] text-[var(--muted)]">not assigned to you</span>}
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-1">
                Task {t.id.slice(0, 8)} · created {fmtAgo(t.created_at)} · SLA {t.sla_state}
                {t.sla_deadline ? ` · deadline ${fmtAgo(t.sla_deadline)}` : ""}
              </div>
              {allowed.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {allowed.map((to) => (
                    <button key={to} className="btn text-[12px] py-1" disabled={!mine}
                      onClick={async () => {
                        setError(null);
                        try { await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { to } }); onChanged(); }
                        catch (e) { setError((e as Error).message); }
                      }}>
                      {labelFor(to)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
function labelFor(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}
