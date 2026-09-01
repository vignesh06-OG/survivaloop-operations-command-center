"use client";
import { useState } from "react";
import type { MapData } from "./MapCanvas";
import { useTranslation } from "@/lib/i18n/I18nContext";

export default function FallbackMap({ data, selected, onSelect }: {
  data: MapData;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, 8));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.5, 0.5));
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);

  // Simple mapping from lat/lng to India SVG coordinates (approximate bounding box)
  // India approx: Long 68 to 97 (X), Lat 8 to 37 (Y)
  // SVG viewBox: 0 0 1000 1000
  const mapLonToX = (lon: number) => ((lon - 68) / (97 - 68)) * 1000;
  const mapLatToY = (lat: number) => 1000 - (((lat - 8) / (37 - 8)) * 1000);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "normal": return "#22c55e"; // green
      case "warning": return "#eab308"; // yellow
      case "critical": return "#ef4444"; // red
      default: return "#22c55e";
    }
  };

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-gradient-to-br from-[#022c22] to-[#064e3b] touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ minHeight: "400px" }}
    >
      {/* Zoom Controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-[#1a2332] rounded-md overflow-hidden shadow-lg border border-[var(--line)]">
        <button onClick={handleZoomIn} className="p-2 text-white hover:bg-[var(--line)] transition-colors w-8 h-8 flex items-center justify-center font-bold">+</button>
        <div className="h-px bg-[var(--line)] w-full"></div>
        <button onClick={handleZoomOut} className="p-2 text-white hover:bg-[var(--line)] transition-colors w-8 h-8 flex items-center justify-center font-bold">-</button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 text-xs text-green-300/60 font-mono pointer-events-none">
        Zoom: {Math.round(zoom * 100)}%
      </div>

      <div 
        className="w-full h-full origin-center transition-transform duration-200 ease-out"
        style={{ transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)` }}
      >
        <svg 
          viewBox="0 0 1000 1000" 
          className="w-full h-full opacity-30 drop-shadow-2xl" 
          style={{ pointerEvents: 'none' }}
        >
          {/* Simplified highly stylized India SVG path for fallback */}
          <path 
            d="M 300,400 L 250,500 L 280,600 L 350,750 L 400,850 L 450,900 L 500,850 L 550,750 L 650,600 L 700,500 L 750,450 L 850,400 L 900,350 L 850,300 L 750,250 L 650,200 L 550,150 L 450,100 L 350,150 L 300,250 Z" 
            fill="url(#grad)" 
            stroke="#34d399" 
            strokeWidth="2" 
          />
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#047857" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#065f46" stopOpacity="0.4" />
            </linearGradient>
          </defs>
        </svg>

        <div className="absolute inset-0">
          {data.clusters.map((c) => {
            // Check if entity has lat/lon directly, if not generate some random jitter around center
            const lon = c.lng || (78.96 + (Math.random() * 20 - 10));
            const lat = c.lat || (20.59 + (Math.random() * 20 - 10));
            
            const x = mapLonToX(lon);
            const y = mapLatToY(lat);

            let status = "normal";
            const meta = data.nodes ? data.nodes[c.id] : undefined;
            if (meta?.severe || meta?.decision === "ACT") status = "critical";
            else if (meta?.nEvidence && meta.nEvidence > 5) status = "warning";

            return (
              <div 
                key={c.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                style={{ left: `${x / 10}%`, top: `${y / 10}%` }}
                onClick={(e) => { e.stopPropagation(); onSelect(c.id); }}
              >
                <div 
                  className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] transition-transform duration-200 group-hover:scale-150 ${selected === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''}`}
                  style={{ 
                    backgroundColor: getStatusColor(status), 
                    color: getStatusColor(status),
                    animation: status === "critical" ? "pulse-critical 2s infinite" : "none" 
                  }}
                />
                
                {/* Custom popup on hover or selected */}
                {(selected === c.id) && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a2332] border border-[var(--line)] text-white text-xs p-2 rounded shadow-xl whitespace-nowrap z-20">
                    <div className="font-bold">{c.name || c.id}</div>
                    <div className="text-[var(--muted)]">{meta?.nEvidence || 1} {t("entities")}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
