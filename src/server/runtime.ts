/**
 * Process-wide runtime singletons (repo + app services).
 *
 * Lives in its own module with no other imports so there is no import cycle.
 * It writes to globalThis directly so every Next route bundle (dev often
 * duplicates module state per route) observes the SAME values.
 */
import type { Repo } from "@/data/repo";
import type { AppService } from "@/services/app-service";

const KEY = "__survivaloop_runtime__";

export interface Runtime {
  repo: Repo;
  app: AppService;
}

const g = globalThis as unknown as Record<string, Runtime | undefined>;

export function setRuntime(r: Runtime): void {
  g[KEY] = r;
}
export function getRuntime(): Runtime {
  const r = g[KEY];
  if (!r) throw new Error("SurvivaLoop runtime not initialised.");
  return r;
}
export function isRuntimeReady(): boolean {
  return g[KEY] !== undefined;
}
