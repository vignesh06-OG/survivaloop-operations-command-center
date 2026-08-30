import { NextResponse } from "next/server";
import { requireCapability, handleError } from "@/server/request";
import { ensureSimulation, getCtx } from "@/server/context";

/**
 * Hierarchy read: zones → clusters → trees, with progressive loading.
 * Query: ?scope=zones|clusters|trees&zoneId=&clusterId=
 */
export async function GET(req: Request) {
  try {
    ensureSimulation();
    const user = await requireCapability("view_map");
    const { repo } = getCtx();
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") ?? "zones";
    const zoneId = url.searchParams.get("zoneId") ?? undefined;
    const clusterId = url.searchParams.get("clusterId") ?? undefined;

    let zones = [] as Record<string, unknown>[];
    let clusters = [] as Record<string, unknown>[];
    let trees = [] as Record<string, unknown>[];

    if (scope === "zones") zones = repo.listZones(user.orgId);
    else if (scope === "clusters") clusters = repo.listClusters(user.orgId, zoneId);
    else if (scope === "trees") trees = repo.listTrees(user.orgId, clusterId);

    return NextResponse.json({ zones, clusters, trees, simulated: user.dataMode === "SIMULATED" });
  } catch (e) {
    return handleError(e);
  }
}

export const dynamic = "force-dynamic";
