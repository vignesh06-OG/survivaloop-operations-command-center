/** SurvivaLoop — presentation constants (display only; never business rules). */
import type { Decision, SlaState, TaskState } from "@/domain/types";

export const DECISION_COLORS: Record<Decision, string> = {
  ACT: "#f87171",
  INSPECT: "#fbbf24",
  MONITOR: "#34d399",
  DEFER: "#60a5fa",
  ESCALATE: "#c084fc",
};
export const DECISION_LABELS: Record<Decision, string> = DECISION_COLORS; // placeholder
export const DECISION_TEXT: Record<Decision, string> = {
  ACT: "Act now",
  INSPECT: "Inspect",
  MONITOR: "Monitor",
  DEFER: "Defer",
  ESCALATE: "Escalate",
};

export const SLA_COLORS: Record<SlaState, string> = {
  NORMAL: "#34d399",
  APPROACHING: "#fbbf24",
  CRITICAL: "#f87171",
  EXPIRED: "#ef4444",
  ESCALATED: "#c084fc",
};

export const FALLBACK_TASK_COLOR: Record<string, string> = {
  PROPOSED: "#64748b",
  COMMITTED: "#34d399",
  DISPATCHED: "#22d3ee",
  ACCEPTED: "#60a5fa",
  IN_PROGRESS: "#fbbf24",
  COMPLETED: "#a3e635",
  PROOF_SUBMITTED: "#f472b6",
  VERIFIED: "#10b981",
  EXPIRED: "#ef4444",
  ESCALATED: "#c084fc",
  REJECTED: "#f87171",
  CANCELLED: "#6b7280",
  REASSESS_REQUIRED: "#fb923c",
};

export function fmtTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function pct(x: number): string { return `${Math.round(x * 100)}%`; }
