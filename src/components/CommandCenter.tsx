"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import Login from "./Login";
import PriorityQueue, { type QueueItem } from "./PriorityQueue";
import WhyPanel, { type WhyData } from "./WhyPanel";
import MapCanvas, { type MapData } from "./MapCanvas";
import RealMap from "./RealMap";
import TaskPipeline, { type TaskView } from "./TaskPipeline";
import EvidenceTimeline, { type EvidenceView } from "./EvidenceTimeline";
import OutcomePanel from "./OutcomePanel";
import Verification, { type ProofView } from "./Verification";
import { useTranslation } from "@/lib/i18n/I18nContext";
import LanguageSelector from "./LanguageSelector";

interface Me { id: string; name: string; email: string; role: string; orgId: string; dataMode: string }

export default function CommandCenter() {
  const { t, lang } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [oversight, setOversight] = useState<any>(null);
  const [clusters, setClusters] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [overrideModal, setOverrideModal] = useState<{ decisionId: string; decision: string; reason: string } | null>(null);
  const hasMapboxToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN && !process.env.NEXT_PUBLIC_MAPBOX_TOKEN.includes("placeholder");
  const [use3D, setUse3D] = useState(!hasMapboxToken);
  const [mapError, setMapError] = useState(!hasMapboxToken);

  const refresh = useCallback(async () => {
    const m = await api<{ user: Me | null }>("/api/auth/me");
    if (!m.user) { setMe(null); setLoading(false); return; }
    if (m.user.role === "FIELD_WORKER") { window.location.href = "/field"; return; }
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
      slaDeadline: d.slaDeadline,
      assignedWorkerIds: d.assignedWorkerIds,
      reason: d.reason,
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
                <Kpi label={t("kpi.active")} value={(oversight?.alertCounts?.all ?? 0)} />
                <Kpi label={t("kpi.act")} value={(oversight?.alertCounts?.ACT ?? 0)} tone="crit" />
                <Kpi label={t("kpi.openTasks")} value={openTasks(oversight)} />
                <Kpi label={t("kpi.verified")} value={(oversight?.taskCounts?.VERIFIED ?? 0)} tone="ok" />
              </div>
            </div>
          </div>

          {/* ---- CENTER 60% : realistic forest GIS (hero) ---- */}
          <div className="center-col relative min-h-0">
            {mapError && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-amber-900/90 text-amber-200 px-4 py-2 rounded-lg text-xs shadow-lg border border-amber-500/50 flex items-center gap-2">
                <span>⚠️</span> Satellite view requires a valid Mapbox API key. Defaulting to 3D map.
              </div>
            )}
            <div className="absolute top-4 left-4 z-50 flex bg-[#121820] border border-[var(--line)] rounded-lg overflow-hidden shadow-lg">
              <button 
                onClick={() => setUse3D(false)} 
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${!use3D ? 'bg-[#34d399] text-black' : 'text-[var(--muted)] hover:text-white'}`}
              >
                🌐 Satellite
              </button>
              <button 
                onClick={() => setUse3D(true)} 
                className={`px-3 py-1.5 text-xs font-bold border-l border-[var(--line)] transition-colors ${use3D ? 'bg-[#34d399] text-black' : 'text-[var(--muted)] hover:text-white'}`}
              >
                🎮 3D Experimental
              </button>
            </div>
            {use3D ? (
              <MapCanvas data={mapData} selected={selected} onSelect={setSelected} />
            ) : (
              <RealMap data={mapData} selected={selected} onSelect={setSelected} onError={() => { setUse3D(true); setMapError(true); }} />
            )}
          </div>

          {/* ---- RIGHT 20% : audit log + detail ---- */}
          <div className="rail flex flex-col min-h-0">
            <div className="rail-scroll space-y-3 flex-1">
              {error && <div className="text-red-300 text-sm">{error}</div>}
              <div className="panel p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold truncate">{selectedCluster?.code ?? selected ?? t("selectCase")}</h2>
                    <div className="text-[11px] text-[var(--muted)] truncate">{selectedCluster?.name ?? "cluster"} {selected ? `· ${selected}` : ""}</div>
                  </div>
                  {selected && (
                    <div className="flex gap-1.5 shrink-0">
                      <button className="btn text-[11px] px-2" title={t("btn.rerun")} onClick={async () => {
                        setError(null);
                        try { await api("/api/decision", { method: "POST", body: { level: "MICRO_CLUSTER", id: selected } }); await onChanged(); }
                        catch (e) { setError((e as Error).message); }
                      }}>{t("btn.rerun")}</button>
                      <button className="btn text-[11px] px-2 text-amber-500 border-amber-500/30 hover:bg-amber-500/10" title={t("btn.override")} onClick={() => {
                        if (!detail?.latestDecision?.id) { setError("No decision to override."); return; }
                        setOverrideModal({ decisionId: detail.latestDecision.id, decision: "DEFER", reason: "" });
                      }}>{t("btn.override")}</button>
                      <button className="btn btn-primary text-[11px] px-2" title={t("btn.act")} onClick={async () => {
                        setError(null);
                        try {
                          const d = await api<any>("/api/decision", { method: "POST", body: { level: "MICRO_CLUSTER", id: selected } });
                          if (d.decision === "ACT") {
                            await api("/api/tasks", { method: "POST", body: { mode: "COMMIT", level: "MICRO_CLUSTER", entityId: selected, decisionId: d.decisionId, interventionId: d.interventionId, workerIds: ["u_w1", "u_w2"] } });
                          }
                          await onChanged();
                        } catch (e) { setError((e as Error).message); }
                      }}>{t("btn.act")}</button>
                    </div>
                  )}
                </div>
              </div>
              {selected && (
                <>
                  {why && <WhyPanel data={why} />}
                  <EvidenceTimeline evidence={(detail?.evidence ?? []).map(rowToEvidence)} />
                  <OutcomePanel 
                    summary={detail || {}} 
                    me={me} 
                    onRefresh={() => loadDetail(selected!)} 
                    entityLevel="MICRO_CLUSTER" 
                    entityId={selected} 
                  />
                  <TaskPipeline tasks={(detail?.tasks ?? []).map(rowToTask)} user={me} onChanged={onChanged} />
                  <Verification proofs={(detail?.proofs ?? []).map(rowToProof)} user={me} onChanged={onChanged} />
                </>
              )}
              {!selected && (
                <div className="panel p-5 text-center text-[var(--muted)] text-sm">
                  {t("emptyState.select")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <footer className="mt-3 shrink-0 text-[11px] text-[var(--muted)] text-center">
        {t("footer.demo", { dataMode: me.dataMode === "SIMULATED" ? t("footer.simulatedMode") : t("footer.liveMode") })}
      </footer>
      {overrideModal && selected && (
        <OverrideModal state={overrideModal} selected={selected} onClose={() => setOverrideModal(null)} onChanged={onChanged} />
      )}
    </div>
  );
}

function Header({ me, onLogout, onRunSim }: { me: Me; onLogout: () => void; onRunSim: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="flex items-center justify-between py-2 border-b border-[var(--line)]">
      <div className="flex items-center gap-3">
        <span className="text-xl">🌱</span>
        <div>
          <div className="font-bold leading-tight">{t("appTitle")}</div>
          <div className="text-[11px] text-[var(--muted)]">{t("nav.commandCenter")}</div>
        </div>
        <span className="pill ms-2 bg-amber-900/40 text-amber-200">{t("nav.simulatedData")}</span>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSelector />
        <span className="pill bg-[#121820] border border-[var(--line)]">{t(`role.${me.role}`) || me.role}</span>
        <span className="text-[12px] text-[var(--muted)] hidden sm:inline">{me.name}</span>
        <button className="btn text-[12px]" onClick={onRunSim}>{t("nav.seed")}</button>
        <button className="btn text-[12px]" onClick={onLogout}>{t("nav.logout")}</button>
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

/** In-app override modal (replaces window.prompt). */
function OverrideModal({ state, selected, onClose, onChanged }: { state: { decisionId: string; decision: string; reason: string }; selected: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState(state.decision);
  const [reason, setReason] = useState(state.reason);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) { setErr(t("err.reasonRequired") || "A reason is required."); return; }
    setBusy(true);
    setErr(null);
    try {
      await api("/api/override", { method: "POST", body: { entity: { level: "MICRO_CLUSTER", id: selected }, decisionId: state.decisionId, humanDecision: decision.toUpperCase(), reason } });
      await onChanged();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="panel p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-4">{t("btn.override")}</h3>
        <label className="text-xs text-[var(--muted)] block mb-1">{t("overrideDecision") || "New Decision"}</label>
        <select className="w-full p-2 rounded text-sm mb-3" style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--fg)" }} value={decision} onChange={(e) => setDecision(e.target.value)}>
          {["ACT", "DEFER", "MONITOR", "ESCALATE"].map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="text-xs text-[var(--muted)] block mb-1">{t("overrideReason") || "Reason"}</label>
        <textarea className="w-full p-2 rounded text-sm mb-3" style={{ background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--fg)", minHeight: 60 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("overrideReasonPlaceholder") || "Enter the reason for this override..."} />
        {err && <div className="text-xs mb-2" style={{ color: "#f87171" }}>⚠ {err}</div>}
        <div className="flex gap-2 justify-end">
          <button className="btn text-xs px-3" onClick={onClose} disabled={busy}>{t("btn.cancel") || "Cancel"}</button>
          <button className="btn btn-primary text-xs px-3" onClick={submit} disabled={busy || !reason.trim()}>{busy ? "..." : t("btn.confirm") || "Confirm Override"}</button>
        </div>
      </div>
    </div>
  );
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
