"use client";
/**
 * SurvivaLoop — forestry GIS map (center hero).
 *
 * A single responsive renderer against the real container. It draws a
 * cinematic, top-down forest basemap (dense canopy, winding service roads,
 * natural clearings, dark olive/green palette) and layers the tactical
 * operational picture on top: decision/SLA markers, the MC-target critical
 * intervention, and the Drone Delta route.
 *
 * Data contract is unchanged from the schematic version — it consumes the same
 * `MapData` (clusters + per-node decision/SLA/severity) and keeps the exact
 * `selected`/`onSelect` behaviour. This is display only; backend untouched.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { DECISION_COLORS, SLA_COLORS, FALLBACK_TASK_COLOR } from "@/lib/present";

interface Cluster { id: string; code: string; name: string; lat: number; lng: number; zone_id?: string; zone?: string }
interface NodeMeta {
  decision?: string;
  sla?: string;
  taskState?: string;
  nEvidence?: number;
  severe?: boolean;
  simulated?: boolean;
}
export interface MapData {
  clusters: Cluster[];
  nodes: Record<string, NodeMeta>;
  simulatedNote?: string;
}

export default function MapCanvas({ data, selected, onSelect }: {
  data: MapData;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 100, h: 62 });

  // ResizeObserver: the GIS always fills the actual center column.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Project cluster coords onto the forest viewport as percentages.
  const proj = useMemo(() => {
    const cs = data.clusters;
    if (cs.length === 0) return {};
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of cs) { minX = Math.min(minX, c.lng); maxX = Math.max(maxX, c.lng); minY = Math.min(minY, c.lat); maxY = Math.max(maxY, c.lat); }
    const spread = (min: number, max: number) => (max - min);
    const spanX = spread(minX, maxX), spanY = spread(minY, maxY);
    const mapX = (lng: number) => {
      if (spanX < 1e-6 && spanY < 1e-6) return 50;
      return 8 + ((lng - minX) / (spanX || 1)) * 84;
    };
    const mapY = (lat: number) => {
      if (spanY < 1e-6 && spanX < 1e-6) return 50;
      return 84 - ((lat - minY) / (spanY || 1)) * 74;
    };
    const out: Record<string, { x: number; y: number }> = {};
    cs.forEach((c, i) => {
      // Degenerate single-point: fan out deterministically so markers don't stack.
      let x = mapX(c.lng), y = mapY(c.lat);
      if (spanX < 1e-6 && spanY < 1e-6) { x = 30 + (i % 4) * 14; y = 30 + Math.floor(i / 4) * 18; }
      out[c.id] = { x, y };
    });
    return out;
  }, [data.clusters]);

  // The critical intervention target: the selected cluster if any, else the
  // highest-priority ACT/ESCALATE/MONITOR node.
  const targetId = useMemo(() => {
    if (selected && proj[selected]) return selected;
    const cs = data.clusters;
    if (!cs.length) return null;
    const rank = (m?: NodeMeta) => (m?.decision === "ACT" ? 0 : m?.decision === "ESCALATE" ? 1 : m?.decision === "MONITOR" ? 2 : m?.decision === "INSPECT" ? 3 : 4);
    const pick = cs.filter((c) => proj[c.id]).sort((a, b) => (rank(data.nodes[a.id]) - rank(data.nodes[b.id])) || b.lat - a.lat);
    return pick[0]?.id ?? null;
  }, [selected, proj, data.clusters, data.nodes]);

  const target = targetId ? data.clusters.find((c) => c.id === targetId) ?? null : null;
  const targetMeta = targetId ? data.nodes[targetId] : undefined;
  const tPos = targetId ? proj[targetId] : { x: 62, y: 50 };

  // Drone Delta origin (off-map top-left) and its route toward the target.
  const origin = { x: 10.5, y: 16 };
  const routeD = useMemo(() => {
    const dx = tPos.x - origin.x, dy = tPos.y - origin.y;
    const cx = origin.x + dx * 0.36, cy = origin.y - dy * 0.28;
    return `M ${origin.x} ${origin.y} Q ${cx} ${cy} ${tPos.x} ${tPos.y}`;
  }, [tPos.x, tPos.y]);

  const selCluster = selected ? data.clusters.find((c) => c.id === selected) : null;
  const sectorLabel = (target?.zone ?? selCluster?.zone) ?? "NW QUADRANT";
  const sectorCode = (target?.code ?? selCluster?.code) ?? "MC-07";
  const coordLat = target?.lat ?? 12.9784;
  const coordLng = target?.lng ?? 77.3964;
  const targetName = targetMeta?.decision ? `${sectorCode} // ${targetMeta.decision}` : `${sectorCode}`;

  return (
    <div className="gis-map" ref={hostRef}>
      {/* realistic forest basemap (same-origin asset) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/map/forest-basemap.jpg" alt="" className="gis-basemap" draggable={false} />
      <div className="gis-grade" />
      <div className="gis-vignette" />

      {/* tactical route + drone (SVG, scales to container) */}
      <svg className="gis-svg" viewBox="0 0 100 62" preserveAspectRatio="none">
        {/* faint route ribbon */}
        <path d={routeD} fill="none" stroke="rgba(52,211,153,0.16)" strokeWidth="7" strokeLinecap="round" />
        <path d={routeD} fill="none" className="route-glow" stroke="rgba(52,211,153,0.75)" strokeWidth="1.3" strokeLinecap="round" />
        <circle r="1.1" fill="#5eead4">
          <animateMotion dur="7s" repeatCount="indefinite" path={routeD} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
        </circle>
      </svg>

      {/* ---------- cluster markers (decision-coloured tactical dots) ---------- */}
      <div className="gis-layer">
        {data.clusters.map((c) => {
          const pos = proj[c.id];
          if (!pos) return null;
          const meta = data.nodes[c.id] ?? {};
          const isSel = selected === c.id;
          const isTarget = targetId === c.id;
          const isHover = hover === c.id;
          const color = meta.decision ? DECISION_COLORS[meta.decision as keyof typeof DECISION_COLORS]
            : meta.sla ? SLA_COLORS[meta.sla as keyof typeof SLA_COLORS]
            : meta.taskState ? (FALLBACK_TASK_COLOR[meta.taskState] ?? "#64748b") : "#6b7c6f";
          if (isTarget) return null; // drawn as the big MC marker below
          const r = meta.severe ? 11 : isSel ? 9 : isHover ? 8 : 6.5;
          return (
            <div key={"poi" + c.id} className="poi" style={{ left: `${pos.x}%`, top: `${pos.y}%`, position: "absolute", transform: "translate(-50%,-50%)", zIndex: 5 }}
              onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}
              onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
              <span className="gis-cluster" style={{ width: r, height: r, background: color, ...(isSel ? { transform: "translate(-50%,-50%) scale(1.18)" } : {}) }} />
              {(isSel || isHover) && (
                <span className="gis-label" style={{ top: r + 7 }}>{c.code}{meta.nEvidence ? ` · ${meta.nEvidence}` : ""}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ---------- MC target marker (critical intervention) ---------- */}
      {target && (
        <div className="mc-marker" style={{ left: `${tPos.x}%`, top: `${tPos.y}%` }}>
          <span className="mc-halo" />
          <span className="mc-halo h2" />
          <span className="mc-ring" />
          <span className="mc-core" />
          <div className="gis-hud" style={{ transform: "translate(-50%, 46px)", width: 152, padding: "7px 9px", textAlign: "left" }}>
            <div className="text-[11px] font-bold tracking-wide text-red-200">{sectorCode}</div>
            <div className="text-[9.5px] text-[#e9c9b0]">Timber Rot · {targetMeta?.decision ?? "CRITICAL"}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="pill" style={{ background: "rgba(239,68,68,.18)", color: "#f87171", border: "1px solid rgba(239,68,68,.4)", padding: "0 6px", fontSize: 9 }}>{targetMeta?.decision ?? "CRITICAL"}</span>
              <span className="mono text-[10px] text-[#fca5a5]">00:14:32</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Drone Delta ---------- */}
      <div className="drone bob" style={{ left: `${origin.x}%`, top: `${origin.y}%` }}>
        <span className="dring" />
        <span className="head" />
        <div className="gis-hud" style={{ transform: "translate(-50%, 26px)", width: 148 }}>
          <div className="flex items-center justify-between">
            <span className="k">DRONE</span>
            <span className="text-[9.5px] font-bold text-sky-200">DELTA</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="pill" style={{ background: "rgba(56,189,248,.16)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,.4)", padding: "0 6px", fontSize: 9 }}>EN ROUTE</span>
            <span className="mono text-[10px] text-[#bae6fd]">ETA 02:12</span>
          </div>
        </div>
      </div>

      {/* ---------- top-left sector HUD ---------- */}
      <div className="gis-hud" style={{ left: 12, top: 12, minWidth: 150 }}>
        <div className="flex items-center gap-1.5">
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
          <span className="k">SECTOR 4</span>
        </div>
        <div className="text-[12px] font-bold text-[#eef5f0]">{sectorLabel}</div>
        <div className="text-[10px] text-[#9fb2a4]">{target?.name ?? "Agri-Zone 2"} · {data.simulatedNote ?? ""}</div>
      </div>

      {/* ---------- top-right coordinate + compass HUD ---------- */}
      <div className="gis-hud" style={{ right: 12, top: 12, textAlign: "right" }}>
        <div className="k">SECTOR 4</div>
        <div className="mono text-[11px] font-bold text-[#eef5f0]">LAT {coordLat.toFixed(4)}</div>
        <div className="mono text-[11px] font-bold text-[#eef5f0]">LNG {coordLng.toFixed(4)}</div>
      </div>

      {/* compass */}
      <div className="gis-hud" style={{ right: 12, top: 96, width: 40, height: 40, display: "grid", placeItems: "center", padding: 0 }}>
        <svg viewBox="0 0 40 40" width="30" height="30">
          <circle cx="20" cy="20" r="17" fill="none" stroke="#3d4c3c" strokeWidth="1" />
          <path d="M20 5 L24 20 L20 17 L16 20 Z" fill="#34d399" />
          <text x="20" y="12" textAnchor="middle" fontSize="5" fill="#cfe0d6">N</text>
        </svg>
      </div>

      {/* ---------- right-side map controls ---------- */}
      <div className="gis-ctrl">
        {[
          { icon: "◉", label: "my location", color: "#34d399" },
          { icon: "▤", label: "layers", color: "#9fb2a4" },
          { icon: "＋", label: "zoom in", color: "#9fb2a4" },
          { icon: "－", label: "zoom out", color: "#9fb2a4" },
        ].map((b) => (
          <button key={b.label} title={b.label} className="gis-ctrl-btn" style={{ color: b.color }}>
            {b.icon}
          </button>
        ))}
      </div>

      {/* ---------- bottom scale + legend + coords ---------- */}
      <div className="gis-hud" style={{ left: 12, bottom: 12, display: "flex", alignItems: "flex-end", gap: 8 }}>
        <div>
          <div style={{ width: 62, height: 4, borderBottom: "2px solid #cfe0d6", borderLeft: "1px solid #cfe0d6", borderRight: "1px solid #cfe0d6", marginBottom: 3 }} />
          <div className="mono text-[9px] text-[#cfe0d6]">100 m</div>
        </div>
      </div>

      <div className="gis-hud" style={{ left: 108, bottom: 12 }}>
        <div className="k" style={{ marginBottom: 3 }}>LEGEND</div>
        <div className="gis-legend">
          <span className="row"><span className="sw" style={{ background: "#2f6b3a" }} />HEALTHY</span>
          <span className="row"><span className="sw" style={{ background: "#a08a2c" }} />STRESSED</span>
          <span className="row"><span className="sw" style={{ background: "#7f2d2d" }} />CRITICAL</span>
          <span className="row"><span className="sw" style={{ background: "none", border: "none" }}><svg width="14" height="9"><line x1="0" y1="4.5" x2="14" y2="4.5" stroke="#34d399" strokeWidth="2" strokeDasharray="3 2" /></svg></span>ACTIVE ROUTE</span>
        </div>
      </div>

      <div className="gis-hud" style={{ right: 12, bottom: 12, textAlign: "right" }}>
        <div className="mono text-[10px] text-[#cfe0d6]">{coordLat.toFixed(4)}°N · {coordLng.toFixed(4)}°E</div>
        <div className="k">MISSION CONTROL · OVERVIEW</div>
      </div>
    </div>
  );
}
