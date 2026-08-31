"use client";
/**
 * SurvivaLoop — forestry GIS map (center hero) - Three.js version.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Html, PerspectiveCamera, Plane, Line, Sphere, Environment } from "@react-three/drei";
import * as THREE from "three";
import { DECISION_COLORS, SLA_COLORS, FALLBACK_TASK_COLOR } from "@/lib/present";
import { useTranslation } from "@/lib/i18n/I18nContext";

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

// Map the percentage coordinates (0 to 100) to 3D world space coordinates
// World width = 100, depth = 62
const percentToWorld = (px: number, py: number) => {
  return [px - 50, 0, py - 31] as [number, number, number];
};

function Drone({ origin, target }: { origin: { x: number; y: number }; target: { x: number; y: number } }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const startVec = new THREE.Vector3(...percentToWorld(origin.x, origin.y));
  const endVec = new THREE.Vector3(...percentToWorld(target.x, target.y));
  
  // A simple quadratic bezier curve for the drone flight path
  const controlVec = new THREE.Vector3(
    (startVec.x + endVec.x) / 2 + 5,
    15, // Flight altitude arc
    (startVec.z + endVec.z) / 2
  );
  
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(startVec, controlVec, endVec), [startVec, controlVec, endVec]);
  const points = useMemo(() => curve.getPoints(50), [curve]);
  
  const { t } = useTranslation();
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    // loop every 7 seconds
    const timeScale = (clock.getElapsedTime() % 7) / 7; 
    const pos = curve.getPointAt(timeScale);
    meshRef.current.position.copy(pos);
  });

  return (
    <>
      <Line points={points} color="#5eead4" lineWidth={1.5} dashed={true} dashSize={1} gapSize={0.5} opacity={0.6} transparent />
      <Line points={points} color="#5eead4" lineWidth={5} opacity={0.1} transparent />
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#5eead4" />
        <Html position={[0, 1.5, 0]} center zIndexRange={[100, 0]}>
          <div className="gis-hud" style={{ width: 148, transform: "translateY(-100%)", background: "rgba(15,23,42,0.8)", backdropFilter: "blur(4px)" }}>
            <div className="flex items-center justify-between">
              <span className="k">{t("map.drone")}</span>
              <span className="text-[9.5px] font-bold text-sky-200">{t("map.delta")}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="pill" style={{ background: "rgba(56,189,248,.16)", color: "#7dd3fc", border: "1px solid rgba(56,189,248,.4)", padding: "0 6px", fontSize: 9 }}>{t("map.enRoute")}</span>
              <span className="mono text-[10px] text-[#bae6fd]">{t("map.eta")} 02:12</span>
            </div>
          </div>
        </Html>
      </mesh>
    </>
  );
}

function Terrain() {
  const texture = useLoader(THREE.TextureLoader, "/map/forest-basemap.jpg");
  return (
    <Plane args={[100, 62]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
      <meshStandardMaterial map={texture} roughness={0.8} />
    </Plane>
  );
}

function Marker({ cluster, meta, pos, isTarget, isSelected, onClick }: { cluster: Cluster; meta: NodeMeta; pos: { x: number; y: number }; isTarget: boolean; isSelected: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const color = meta.decision ? DECISION_COLORS[meta.decision as keyof typeof DECISION_COLORS]
    : meta.sla ? SLA_COLORS[meta.sla as keyof typeof SLA_COLORS]
    : meta.taskState ? (FALLBACK_TASK_COLOR[meta.taskState] ?? "#64748b") : "#6b7c6f";
    
  const worldPos = percentToWorld(pos.x, pos.y);
  
  if (isTarget) {
    return (
      <group position={worldPos}>
        {/* Pulsing rings and core for target */}
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 2, 32]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshBasicMaterial color="#ef4444" />
        </mesh>
        
        <Html position={[0, 2, 0]} center zIndexRange={[100, 0]}>
          <div className="gis-hud" style={{ width: 152, padding: "7px 9px", textAlign: "left", background: "rgba(15,23,42,0.8)", backdropFilter: "blur(4px)" }}>
            <div className="text-[11px] font-bold tracking-wide text-red-200">{cluster.code}</div>
            <div className="text-[9.5px] text-[#e9c9b0]">{t("map.timberRot")} · {t(`decision.${meta.decision}`) ?? t("severity.CRITICAL")}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="pill" style={{ background: "rgba(239,68,68,.18)", color: "#f87171", border: "1px solid rgba(239,68,68,.4)", padding: "0 6px", fontSize: 9 }}>{t(`decision.${meta.decision}`) ?? t("severity.CRITICAL")}</span>
              <span className="mono text-[10px] text-[#fca5a5]">00:14:32</span>
            </div>
          </div>
        </Html>
      </group>
    );
  }

  const r = meta.severe ? 0.8 : isSelected ? 1.0 : 0.5;

  return (
    <group position={worldPos} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <mesh position={[0, r/2, 0]}>
        <cylinderGeometry args={[r, r, r, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isSelected ? 0.5 : 0.2} />
      </mesh>
      {isSelected && (
        <Html position={[0, r + 1, 0]} center>
          <div className="gis-label" style={{ background: "rgba(0,0,0,0.7)" }}>{cluster.code}{meta.nEvidence ? ` · ${meta.nEvidence}` : ""}</div>
        </Html>
      )}
    </group>
  );
}

export default function MapCanvas({ data, selected, onSelect }: {
  data: MapData;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);

  // Project cluster coords onto the forest viewport as percentages (0-100).
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
      let x = mapX(c.lng), y = mapY(c.lat);
      if (spanX < 1e-6 && spanY < 1e-6) { x = 30 + (i % 4) * 14; y = 30 + Math.floor(i / 4) * 18; }
      out[c.id] = { x, y };
    });
    return out;
  }, [data.clusters]);

  const targetId = useMemo(() => {
    if (selected && proj[selected]) return selected;
    const cs = data.clusters;
    if (!cs.length) return null;
    const rank = (m?: NodeMeta) => (m?.decision === "ACT" ? 0 : m?.decision === "ESCALATE" ? 1 : m?.decision === "MONITOR" ? 2 : m?.decision === "INSPECT" ? 3 : 4);
    const pick = cs.filter((c) => proj[c.id]).sort((a, b) => (rank(data.nodes[a.id]) - rank(data.nodes[b.id])) || b.lat - a.lat);
    return pick[0]?.id ?? null;
  }, [selected, proj, data.clusters, data.nodes]);

  const target = targetId ? data.clusters.find((c) => c.id === targetId) ?? null : null;
  const tPos = targetId ? proj[targetId] : { x: 62, y: 50 };
  const origin = { x: 10.5, y: 16 };

  const selCluster = selected ? data.clusters.find((c) => c.id === selected) : null;
  const sectorLabel = (target?.zone ?? selCluster?.zone) ?? "NW QUADRANT";
  const coordLat = target?.lat ?? 12.9784;
  const coordLng = target?.lng ?? 77.3964;

  return (
    <div className="gis-map" ref={hostRef} style={{ position: "relative", width: "100%", height: "100%", background: "#050806" }}>
      <Canvas style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
        <PerspectiveCamera makeDefault position={[0, 45, 45]} fov={50} rotation={[-Math.PI / 4, 0, 0]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 20, 10]} intensity={1.5} color="#eef5f0" />
        
        <Terrain />
        
        {data.clusters.map((c) => {
          const pos = proj[c.id];
          if (!pos) return null;
          const meta = data.nodes[c.id] ?? {};
          return (
            <Marker 
              key={c.id} 
              cluster={c} 
              meta={meta} 
              pos={pos} 
              isTarget={targetId === c.id} 
              isSelected={selected === c.id} 
              onClick={() => onSelect(c.id)} 
            />
          );
        })}

        {target && <Drone origin={origin} target={tPos} />}
      </Canvas>

      {/* HTML OVERLAYS (HUD) */}
      <div className="gis-vignette" style={{ pointerEvents: "none", zIndex: 10 }} />

      <div className="gis-hud" style={{ position: "absolute", left: 12, top: 12, minWidth: 150, zIndex: 20 }}>
        <div className="flex items-center gap-1.5">
          <span style={{ width: 7, height: 7, borderRadius: 2, background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
          <span className="k">{t("map.sector")}</span>
        </div>
        <div className="text-[12px] font-bold text-[#eef5f0]">{sectorLabel}</div>
        <div className="text-[10px] text-[#9fb2a4]">{target?.name ?? "Agri-Zone 2"} · {data.simulatedNote ? t("nav.simulatedData") : t("nav.liveData")}</div>
      </div>

      <div className="gis-hud" style={{ position: "absolute", right: 12, top: 12, textAlign: "right", zIndex: 20 }}>
        <div className="k">{t("map.sector")}</div>
        <div className="mono text-[11px] font-bold text-[#eef5f0]">{t("map.lat")} {coordLat.toFixed(4)}</div>
        <div className="mono text-[11px] font-bold text-[#eef5f0]">{t("map.lng")} {coordLng.toFixed(4)}</div>
      </div>



      <div className="gis-hud" style={{ position: "absolute", left: 108, bottom: 12, zIndex: 20 }}>
        <div className="k" style={{ marginBottom: 3 }}>{t("map.legend")}</div>
        <div className="gis-legend">
          <span className="row"><span className="sw" style={{ background: "#2f6b3a" }} />{t("map.healthy")}</span>
          <span className="row"><span className="sw" style={{ background: "#a08a2c" }} />{t("map.stressed")}</span>
          <span className="row"><span className="sw" style={{ background: "#7f2d2d" }} />{t("map.critical")}</span>
        </div>
      </div>

      <div className="gis-hud" style={{ position: "absolute", right: 12, bottom: 12, textAlign: "right", zIndex: 20 }}>
        <div className="k text-[#cfe0d6]">{t("map.experimental")}</div>
      </div>
    </div>
  );
}
