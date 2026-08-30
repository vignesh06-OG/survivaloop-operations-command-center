/**
 * SurvivaLoop — authorization matrix.
 *
 * All authorization is decided here and enforced server-side. The frontend
 * only *renders affordances* derived from these rules; it never decides access.
 */
import type { Role } from "./types";

export type Capability =
  | "view_org_dashboard"
  | "view_map"
  | "view_priority_queue"
  | "view_audit_trail"
  | "view_evidence"
  | "view_capacity"
  | "view_tasks_any"
  | "view_tasks_own"
  | "create_task"
  | "dispatch_task"
  | "accept_task"
  | "start_task"
  | "complete_task"
  | "submit_proof"
  | "review_proof"
  | "override_decision"
  | "manage_users"
  | "run_simulation"
  | "manage_org"
  | "reassign_task";

/** Capability per role. AUDITOR is read-only (no *_task write caps), by intent. */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  ADMIN: [
    "view_org_dashboard", "view_map", "view_priority_queue", "view_audit_trail",
    "view_evidence", "view_capacity", "view_tasks_any",
    "override_decision", "manage_users", "manage_org", "run_simulation",
    "reassign_task",
  ],
  SUPERVISOR: [
    "view_org_dashboard", "view_map", "view_priority_queue", "view_audit_trail",
    "view_evidence", "view_capacity", "view_tasks_any",
    "create_task", "dispatch_task", "review_proof", "override_decision",
    "reassign_task", "run_simulation",
  ],
  FIELD_WORKER: [
    "view_map", "view_priority_queue", "view_evidence", "view_tasks_own",
    "accept_task", "start_task", "complete_task", "submit_proof",
  ],
  AUDITOR: [
    "view_org_dashboard", "view_map", "view_priority_queue", "view_audit_trail",
    "view_evidence", "view_capacity", "view_tasks_any",
  ],
};

export function roleHas(role: Role, cap: Capability): boolean {
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap);
}

/**
 * Scoped task access. FIELD_WORKER may only see tasks they are assigned to;
 * everyone else reads within their capability. This is the server-side gate.
 */
export function canAccessTask(role: Role, taskAssignedWorkerIds: string[], userId: string): boolean {
  switch (role) {
    case "FIELD_WORKER":
      return taskAssignedWorkerIds.includes(userId);
    case "SUPERVISOR":
    case "AUDITOR":
      return true; // scope: org-wide read (writer caps gated by roleHas/capability)
    case "ADMIN":
      return true;
    default:
      return false;
  }
}

/** A FIELD_WORKER may only act on a task they are assigned to. */
export function canActOnTask(role: Role, taskAssignedWorkerIds: string[], userId: string): boolean {
  if (role !== "FIELD_WORKER") return true;
  return taskAssignedWorkerIds.includes(userId);
}
