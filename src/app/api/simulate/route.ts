import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";
/**
 * POST /api/simulate — runs the decision loop across all simulation clusters and
 * commits feasible ACT decisions, producing a reproducible, populated dashboard.
 * SIMULATED_DATA_ONLY.
 */
export async function POST() {
  try {
    ensureSimulation();
    const user = await requireCapability("run_simulation");
    if (user.dataMode !== "SIMULATED") {
      return NextResponse.json({ error: "Simulation only permitted in SIMULATED mode." }, { status: 403 });
    }
    const { app } = getCtx();
    const clusters = app.repo.listClusters(user.orgId);
    const results: { entity: string; decision: string; rule: string }[] = [];
    for (const c of clusters) {
      const r = app.runDecision(user, "MICRO_CLUSTER", c.id as string);
      const d = r.decision;
      results.push({ entity: c.id as string, decision: d.decision, rule: d.ruleId });
      if (d.decision === "ACT" && d.capacity?.feasible && r.decisionId) {
        // find a suitable intervention
        const intervention = app.repo.getIntervention("int_water")!;
        if (intervention) {
          try {
            app.commit(user, {
              entity: { level: "MICRO_CLUSTER", id: c.id as string },
              interventionId: intervention.id as string,
              decisionId: r.decisionId,
              workerIds: ["demo-worker"],
            });
            app.dispatch(user, app.repo.listTasks(user.orgId).find((t) => t.entity_id === c.id)!.id as string, ["demo-worker"]);
          } catch (e) { /* capacity may be exhausted; defer is fine */ }
        }
      }
    }
    return NextResponse.json({ ok: true, count: clusters.length, results });
  } catch (e) {
    return handleError(e);
  }
}
