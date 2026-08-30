/**
 * SurvivaLoop — audit + override.
 *
 * Overrides never silently replace a system decision: both the system decision
 * and the human decision are retained, and a *reason is required* (server-side).
 * Audit rows are append-only; this module provides factories and validators so
 * the repository can persist them immutably.
 */
import { z } from "zod";
import { DECISION_VALUES } from "./validation-schema";
import type { AuditEvent, Decision, Override } from "./types";

export function requireOverrideReason(reason: string | null | undefined): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    throw new Error("An override reason is REQUIRED. Refusing to record an unexplained override.");
  }
  if (trimmed.length < 5) {
    throw new Error("Override reason must be at least 5 characters.");
  }
  return trimmed;
}

/** Zod schema for the override payload (server-side; no client-trusted IDs). */
export const overrideInputSchema = z.object({
  entity: z.object({ level: z.enum(["ZONE", "MICRO_CLUSTER", "TREE"]), id: z.string().min(1) }),
  decisionId: z.string().min(1),
  humanDecision: z.enum(DECISION_VALUES as unknown as [Decision, ...Decision[]]),
  reason: z.string().min(1),
});
export type OverrideInput = z.infer<typeof overrideInputSchema>;

export function makeOverride(input: OverrideInput, systemDecision: Decision, actorId: string, at: number): Override {
  return {
    id: "ovr_" + newId(),
    entity: input.entity,
    decisionId: input.decisionId,
    systemDecision,
    humanDecision: input.humanDecision,
    reason: requireOverrideReason(input.reason),
    actorId,
    at,
  };
}

/** Audit factory. Does not write; returns an event the repo persists cursor-append. */
export function auditEvent(
  partial: Omit<AuditEvent, "id" | "at"> & { at?: number },
): Omit<AuditEvent, "id"> {
  return {
    ...partial,
    at: partial.at ?? Date.now(),
  };
}

/** Server-side random id (Node/edge safe). */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replace(/-/g, "").slice(0, 24);
  // deterministic fallback (never used in prod auth paths)
  return Math.random().toString(36).slice(2, 16) + Date.now().toString(36);
}
