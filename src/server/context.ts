/**
 * SurvivaLoop — server context (singleton wiring).
 *
 * Builds the repo + AppService once per server lifetime. In dev this survives
 * HMR via globalThis. Initialises auth binding.
 */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Repo } from "@/data/repo";
import { AppService } from "@/services/app-service";
import { setRuntime, getRuntime, type Runtime } from "./runtime";
import { buildSimulation } from "@/services/simulation";

const DB_PATH = process.env.SURVIVALOOP_DB ?? "data/survivaloop.sqlite";

export function getCtx(): Runtime {
  if (runtimeReady()) return getRuntime();
  if (DB_PATH !== ":memory:") {
    try { mkdirSync(dirname(DB_PATH), { recursive: true }); } catch { /* ignore */ }
  }
  const repo = new Repo(DB_PATH);
  const app = new AppService(repo);
  setRuntime({ repo, app });
  return getRuntime();
}

function runtimeReady(): boolean {
  try { getRuntime(); return true; } catch { return false; }
}

/** Ensure the demo dataset exists (idempotent). */
export function ensureSimulation(): void {
  const { repo } = getCtx();
  const org = repo.getOrg("org_demo");

  // Always regenerate if the demo org is present but empty of a fresh loop,
  // but preserve a partially-progressed demo if the file already has content.
  if (org && repo.info().decisions > 0) return;

  if (!org) {
    buildSimulation(repo, {
      scenarios: [
        "fresh_severe_act", "conflicting_evidence", "healthy_monitor",
        "capacity_shortage_defer", "water_shortage", "task_expiry",
        "sudden_distress", "false_report", "stale_evidence",
        "worker_absence", "duplicate_evidence",
      ],
    });
  }
}
