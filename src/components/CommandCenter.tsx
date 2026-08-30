"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import Login from "./Login";
import PriorityQueue, { type QueueItem } from "./PriorityQueue";
import WhyPanel, { type WhyData } from "./WhyPanel";
import MapCanvas, { type MapData } from "./MapCanvas";
import TaskPipeline, { type TaskView } from "./TaskPipeline";
import EvidenceTimeline, { type EvidenceView } from "./EvidenceTimeline";
import Verification, { type ProofView } from "./Verification";

interface Me { id: string; name: string; email: string; role: string; orgId: string; dataMode: string }

export default function CommandCenter() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [oversight, setOversight] = useState<any>(null);
  const [clusters, setClusters] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const m = await api<{ user: Me | null }>("/api/auth/me");
    if (!m.user) { setMe(null); setLoading(false); return; }
    setMe(m.user);
    const [o, ent, zs] = await Promise.all([
      api<any>("/api/oversight"),
      api<{ clusters: any[] }>("/api/entities?scope=clusters"),
      api<{ zones: any[] }>("/api/entities?scope=zones"),
    ]);
    setOversight(o);
    setClusters(ent.clusters ?? []);
    setZones(zs.zones ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await api<any>(`/api/entity/MICRO_CLUSTER/${id}`);
      setDetail(d);
    } catch (e) { /* entity may not exist yet */ setDetail(null); }
  }, []);

  useEffect(() => {
    if (selected) loadDetail(selected);
    else setDetail(null);
  }, [selected, loadDetail]);

  async function onChanged() {
    await refresh();
    if (selected) await loadDetail(selected);
  }

  const queueItems: QueueItem[] = useMemo(() => {
    if (!oversight) return [];
    return (oversight.decisions ?? []).map((d: any) => ({
      entityId: d.entity.id,
      entityCode: d.entityCode ?? d.entity.id,
      decision: d.decision,
      rule: d.rule,
      quality: d.quality?.quality ?? 0,
      severity: d.severity,
      urgency: d.urgency,
      at: d.at,
      conflictCount: d.conflictCount,
      overridden: d.overridden,
      sla: d.sla,
    }));
  }, [oversight]);

  const mapData: MapData = useMemo(() => {
    const nodes: Record<string, any> = {};
    if (oversight) {
      for (const d of oversight.decisions ?? []) {
        nodes[d.entity.id] = { decision: d.decision, sla: d.sla, nEvidence: (d.quality?.qualifyingCount ?? 0) || undefined, severe: d.severity === "SEVERE" || d.severity === "CRITICAL" };
      }
    }
    if (detail) {
      nodes[selected!] = { ...(nodes[selected!] ?? {}), nEvidence: (detail.evidence ?? []).length };
    }
    // Enrich clusters with zone display data (display-only, backend untouched).
    const zoneById = Object.fromEntries(zones.map((z) => [z.id, z]));
    const enriched = clusters.map((c) => ({
      ...c,
      zone: zoneById[c.zone_id]?.name ?? zoneById[c.zone_id]?.code,
    }));
    return { clusters: enriched, nodes, simulatedNote: me?.dataMode === "SIMULATED" ? "SIMULATED" : "LIVE" };
  }, [oversight, detail, clusters, zones, selected, me]);

  const why: WhyData | null = useMemo(() => {
    if (!detail?.latestDecision) return null;
    const d = detail.latestDecision;
    return {
      decision: d.decision,
      rule: d.rule_id,
      reason: JSON.parse(d.reason_json ?? "[]"),
      evidenceUsed: JSON.parse(d.evidence_used_json ?? "[]"),
      quality: JSON.parse(d.quality_json ?? "{}"),
      severity: detail.latestAssessment ? { level: detail.latestAssessment.severity_level, score: detail.latestAssessment.severity_score } : { level: "none", score: 0 },
      urgency: detail.latestAssessment ? { level: detail.latestAssessment.urgency_level, score: detail.latestAssessment.urgency_score } : { level: "none", score: 0 },
      capacity: d.capacity_available_json ? JSON.parse(d.capacity_available_json) : null,
      slaHours: d.sla_hours,
      nextAction: d.next_action,
      overridden: d.overridden === 1,
      at: d.at,
    };
  }, [detail]);

  if (loading) return <div className="min-h-screen grid place-items-center text-[var(--muted)]">Loading…</div>;
  if (!me) return <Login onAuthed={refresh} />;

  const selectedCluster = clusters.find((c) => c.id === selected);
  return (
    <div className="min-h-screen flex flex-col p-3">
      <Header me={me} onLogout={async () => { await api("/api/auth/logout", { method: "POST" }); setMe(null); }} onRunSim={refresh} />

      <div className="flex-1 min-h-0 mt-3">
        <div className="command-body h-full">
          {/* ---- LEFT 20% : Intervention queue ---- */}
          <div className="rail flex flex-col min-h-0">
            <div className="rail-scroll space-y-3 flex-1">
              <PriorityQueue items={queueItems} selected={selected} onSelect={setSelected} />
              {/* KPI mini-strip */}
              <div className="grid grid-cols-2 gap-3">
                <Kpi label="Active" value={(oversight?.alertCounts?.all ?? 0)} />
                <Kpi label="ACT" value={(oversight?.alertCounts?.ACT ?? 0)} tone="crit" />
                <Kpi label="Open tasks" value={openTasks(oversight)} />
                <Kpi label="Verified" value={(oversight?.taskCounts?.VERIFIED ?? 0)} tone="ok" />
              </div>
            </div>
          </div>

          {/* ---- CENTER 60% : realistic forest GIS (hero) ---- */}
          <div className="center-col">
            <MapCanvas data={mapData} selected={selected} onSelect={setSelected} />
          </div>

          {/* ---- RIGHT 20% : audit log + detail ---- */}
          <div className="rail flex flex-col min-h-0">
            <div className="rail-scroll space-y-3 flex-1">
              {error && <div className="text-red-300 text-sm">{error}</div>}
              <div className="panel p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold truncate">{selectedCluster?.code ?? selected ?? "Select a case"}</h2>
                    <div className="text-[11px] text-[var(--muted)] truncate">{selectedCluster?.name ?? "cluster"} {selected ? `· ${selected}` : ""}</div>
                  </div>
                  {selected && (
                    <div className="flex gap-1.5 shrink-0">
                      <button className="btn text-[11px] px-2" title="Re-run decision" onClick={async () => {
                        setError(null);
                        try { await api("/api/decision", { method: "POST", body: { level: "MICRO_CLUSTER", id: selected } }); await onChanged(); }
                        catch (e) { setError((e as Error).message); }
                      }}>⟳</button>
                      <button className="btn text-[11px] px-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10" title="Override Decision" onClick={async () => {
                        if (!detail?.latestDecision?.id) { setError("No decision to override."); return; }
                        const newDecision = window.prompt("Enter new decision (ACT, DEFER, MONITOR, ESCALATE):", "DEFER");
                        if (!newDecision) return;
                        const reason = window.prompt("Reason for override:");
                        if (!reason) return;
                        setError(null);
                        try {
                          await api("/api/override", { method: "POST", body: { entity: { level: "MICRO_CLUSTER", id: selected }, decisionId: detail.latestDecision.id, humanDecision: newDecision.toUpperCase(), reason } });
                          await onChanged();
                        } catch (e) { setError((e as Error).message); }
                      }}>Override</button>
                      <button className="btn btn-primary text-[11px] px-2" title="Sense→Act" onClick={async () => {
                        setError(null);
                        try {
                          const d = await api<any>("/api/decision", { method: "POST", body: { level: "MICRO_CLUSTER", id: selected } });
                          if (d.decision === "ACT") {
                            await api("/api/tasks", { method: "POST", body: { mode: "COMMIT", level: "MICRO_CLUSTER", entityId: selected, decisionId: d.decisionId, interventionId: d.interventionId, workerIds: ["u_w1", "u_w2"] } });
                          }
                          await onChanged();
                        } catch (e) { setError((e as Error).message); }
                      }}>Act</button>
                    </div>
                  )}
                </div>
              </div>
              {selected && (
                <>
                  {why && <WhyPanel data={why} />}
                  <EvidenceTimeline evidence={(detail?.evidence ?? []).map(rowToEvidence)} />
                  <TaskPipeline tasks={(detail?.tasks ?? []).map(rowToTask)} user={me} onChanged={onChanged} />
                  <Verification proofs={(detail?.proofs ?? []).map(rowToProof)} user={me} onChanged={onChanged} />
                </>
              )}
              {!selected && (
                <div className="panel p-5 text-center text-[var(--muted)] text-sm">
                  Select an entity from the map or queue to inspect evidence, rationale, capacity, SLA, tasks &amp; verification.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-3 shrink-0 text-[11px] text-[var(--muted)] text-center">
        SurvivaLoop demo · {me.dataMode === "SIMULATED" ? "SIMULATED / SYNTHETIC DATA — not real measurements" : "LIVE DATA"} · domain logic is server-side; the UI cannot change decisions.
      </footer>
    </div>
  );
}

function Header({ me, onLogout, onRunSim }: { me: Me; onLogout: () => void; onRunSim: () => void }) {
  return (
    <header className="flex items-center justify-between py-2 border-b border-[var(--line)]">
      <div className="flex items-center gap-3">
        <span className="text-xl">🌱</span>
        <div>
          <div className="font-bold leading-tight">SurvivaLoop</div>
          <div className="text-[11px] text-[var(--muted)]">Operations Command Center</div>
        </div>
        <span className="pill ml-2 bg-amber-900/40 text-amber-200">DEMO / SIMULATED</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="pill bg-[#121820] border border-[var(--line)]">{me.role}</span>
        <span className="text-[12px] text-[var(--muted)] hidden sm:inline">{me.name}</span>
        <button className="btn text-[12px]" onClick={onRunSim}>Seed</button>
        <button className="btn text-[12px]" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "crit" | "ok" }) {
  const color = tone === "crit" ? "#f87171" : tone === "ok" ? "#34d399" : "#e6edf3";
  return (
    <div className="panel p-4">
      <div className="text-[11px] text-[var(--muted)] uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mono" style={{ color }}>{value}</div>
    </div>
  );
}

function openTasks(o: any): number {
  if (!o) return 0;
  const live = ["COMMITTED", "DISPATCHED", "ACCEPTED", "IN_PROGRESS", "PROOF_SUBMITTED"];
  return live.reduce((a, s) => a + (o.taskCounts?.[s] ?? 0), 0);
}

function rowToEvidence(r: any): EvidenceView {
  return {
    id: r.id, evidence_type: r.evidence_type, source: r.source, signal: r.signal,
    implied_severity: r.implied_severity, observed_at: r.observed_at, captured_at: r.captured_at,
    lat: r.lat, lng: r.lng, verification_status: r.verification_status, simulated: r.simulated === 1,
  };
}
function rowToTask(t: any): TaskView {
  return {
    id: t.id, state: t.state, entity_id: t.entity_id, sla_state: t.sla_state, sla_deadline: t.sla_deadline,
    committed_at: t.committed_at, assigned_worker_ids_json: t.assigned_worker_ids_json, intervention_class_id: t.intervention_class_id, created_at: t.created_at,
  };
}

function rowToProof(p: any): ProofView {
  let checks: any = null;
  try { checks = p.checks_json ? JSON.parse(p.checks_json) : null; } catch {}
  return {
    id: p.id, task_id: p.task_id, worker_id: p.worker_id, submission_id: p.submission_id,
    claimed_at: p.claimed_at, submitted_at: p.submitted_at, lat: p.lat, lng: p.lng,
    verification_status: p.verification_status, photo_refs_json: p.photo_refs_json, checks_json: p.checks_json, review_outcome: p.review_outcome,
  };
}
