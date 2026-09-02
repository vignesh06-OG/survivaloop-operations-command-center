/**
 * SurvivaLoop — task lifecycle state machine.
 *
 * Every transition is declared here. No arbitrary transitions are allowed, and
 * the server re-validates every real transition against this table. The UI may
 * only *offer* actions that this table permits.
 */
import type { Role, TaskState } from "./types";

/** Allowed transitions: from state → array of permitted next states. */
export const TASK_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  PROPOSED: ["COMMITTED", "CANCELLED"],
  COMMITTED: ["DISPATCHED", "CANCELLED", "ESCALATED"],
  DISPATCHED: ["ACCEPTED", "CANCELLED", "ESCALATED", "IN_PROGRESS"],
  ACCEPTED: ["IN_PROGRESS", "ESCALATED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "ESCALATED"],
  COMPLETED: ["PROOF_SUBMITTED", "REASSESS_REQUIRED"],
  PROOF_SUBMITTED: ["VERIFIED", "REJECTED", "REASSESS_REQUIRED"],
  VERIFIED: [], // terminal success
  EXPIRED: [], // terminal
  ESCALATED: ["REASSESS_REQUIRED", "COMMITTED"],
  REJECTED: ["REASSESS_REQUIRED"],
  CANCELLED: [], // terminal
  REASSESS_REQUIRED: ["COMMITTED", "CANCELLED"],
};

/** Terminal states that can never be transitioned out of. */
export const TERMINAL_STATES: readonly TaskState[] = [
  "VERIFIED",
  "EXPIRED",
  "CANCELLED",
];

export class InvalidTransitionError extends Error {
  readonly from: TaskState;
  readonly to: TaskState | null;
  constructor(from: TaskState, to: TaskState | null, message?: string) {
    super(message ?? `Cannot transition from '${from}' to '${to ?? "(end)"}'.`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Pure, exception-throwing transition guard. */
export function assertTransition(from: TaskState, to: TaskState): void {
  const allowed = TASK_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** Returns true/false without throwing (for UI affordances). */
export function canTransition(from: TaskState, to: TaskState): boolean {
  return (TASK_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Which roles may authorise each transition. FIELD_WORKER narrow, SUPERVISOR
 * broad. AUDITOR and ADMIN have no write path here (admin is for system config).
 */
export const TRANSITION_AUTHORS: Partial<
  Record<TaskState, { to: TaskState; roles: readonly Role[] }[]>
> = {
  PROPOSED: [{ to: "COMMITTED", roles: ["SUPERVISOR"] }],
  COMMITTED: [
    { to: "DISPATCHED", roles: ["SUPERVISOR"] },
    { to: "CANCELLED", roles: ["SUPERVISOR"] },
  ],
  DISPATCHED: [
    { to: "ACCEPTED", roles: ["FIELD_WORKER"] },
    { to: "IN_PROGRESS", roles: ["FIELD_WORKER"] },
    { to: "CANCELLED", roles: ["SUPERVISOR"] },
  ],
  ACCEPTED: [{ to: "IN_PROGRESS", roles: ["FIELD_WORKER"] }],
  IN_PROGRESS: [{ to: "COMPLETED", roles: ["FIELD_WORKER"] }],
  COMPLETED: [{ to: "PROOF_SUBMITTED", roles: ["FIELD_WORKER"] }],
  PROOF_SUBMITTED: [
    { to: "VERIFIED", roles: ["SUPERVISOR"] },
    { to: "REJECTED", roles: ["SUPERVISOR"] },
  ],
};
