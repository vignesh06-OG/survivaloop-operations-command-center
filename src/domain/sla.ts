/**
 * SurvivaLoop — SLA state machine.
 *
 * SLA state is *derived deterministically from time*, not merely a stored
 * colour. The system must react to EXPIRED and CRITICAL with a workflow, not by
 * repainting a badge. `computeSla` is a pure function of (clock, limits); the
 * orchestrator turns derived states into real events.
 */
import type { Sla, SlaState } from "./types";
import type { Policy } from "./policy";

export interface SlaSpec {
  createdAt: number;
  committedAt: number | null;
  deadline: number;
  executionAt: number | null;
  completionAt: number | null;
  verificationAt: number | null;
}

/** Build an SLA from commitment time + duration. */
export function createSla(
  createdAt: number,
  committedAt: number,
  slaLimitHours: number,
): Sla {
  const deadline = committedAt + slaLimitHours * 3_600_000;
  return {
    createdAt,
    committedAt,
    deadline,
    executionAt: null,
    completionAt: null,
    verificationAt: null,
    state: "NORMAL",
  };
}

/**
 * Deterministically recompute SLA state from absolute time.
 * idempotent and always correct even if the clock moves.
 */
export function computeSlaState(sla: SlaSpec, now: number, policy: Policy): SlaState {
  const anchor = sla.committedAt ?? sla.createdAt;
  const total = sla.deadline - anchor;
  if (total <= 0) return deadlineInPast(sla, now);

  // Already satisfied → terminal summary state (not a live risk).
  if (sla.verificationAt && sla.verificationAt <= now) return "NORMAL";

  if (now >= sla.deadline) return "EXPIRED";

  const elapsed = now - anchor;
  const fraction = elapsed / total;

  if (fraction >= policy.slaCriticalFraction) return "CRITICAL";
  if (fraction >= policy.slaApproachingFraction) return "APPROACHING";
  return "NORMAL";
}

function deadlineInPast(_sla: SlaSpec, _now: number): SlaState {
  return "EXPIRED";
}

/** Milestones for the SLA audit line — these are the "real" workflow triggers. */
export type SlaMilestone =
  | { type: "APPROACHING"; at: number }
  | { type: "CRITICAL"; at: number }
  | { type: "EXPIRED"; at: number }
  | { type: "SATISFIED"; at: number };

/** The moments (now or future) each milestone would trigger. */
export function slaMilestones(sla: SlaSpec, policy: Policy): SlaMilestone[] {
  const anchor = sla.committedAt ?? sla.createdAt;
  const total = sla.deadline - anchor;
  const approachingAt = anchor + total * policy.slaApproachingFraction;
  const criticalAt = anchor + total * policy.slaCriticalFraction;
  return [
    { type: "APPROACHING", at: approachingAt },
    { type: "CRITICAL", at: criticalAt },
    { type: "EXPIRED", at: sla.deadline },
  ];
}
