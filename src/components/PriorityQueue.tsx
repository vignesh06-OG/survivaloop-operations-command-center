"use client";
import { useEffect, useState } from "react";
import { pct } from "@/lib/present";
import type { Decision } from "@/domain/types";
import { useTranslation } from "@/lib/i18n/I18nContext";

export interface QueueItem {
  entityId: string;
  entityCode: string;
  decision: Decision;
  rule: string;
  quality: number;
  severity: string;
  urgency: string;
  at: number;
  conflictCount?: number;
  overridden?: boolean;
  sla?: string;
  slaDeadline?: number;
  assignedWorkerIds?: string[];
  reason?: string;
}

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, SEVERE: 1, HIGH: 2, MODERATE: 3, LOW: 4, none: 5 };

export default function PriorityQueue({ items, selected, onSelect }: {
  items: QueueItem[]; selected: string | null; onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "URGENT" | "EXPIRED">("ALL");
  const [now, setNow] = useState(Date.now());

  // Update time every 30s for live countdowns
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const getIcon = (decision: string) => {
    if (decision === "ACT") return "🛠️";
    if (decision === "INSPECT") return "🔍";
    if (decision === "MONITOR") return "💧";
    if (decision === "DEFER") return "🕒";
    return "📋";
  };

  const getWorkerName = (ids?: string[]) => {
    if (!ids || ids.length === 0) return null;
    if (ids.includes("user2")) return "Demo Field Worker";
    if (ids.includes("user3")) return "Demo Auditor";
    if (ids.includes("user4")) return "Demo Supervisor";
    return `Worker ${ids[0].slice(0, 4)}`;
  };

  // Filter items
  const filtered = items.filter(it => {
    if (filter === "ALL") return true;
    if (filter === "EXPIRED") return it.sla === "EXPIRED" || (it.slaDeadline && it.slaDeadline < now);
    if (filter === "URGENT") return it.sla === "CRITICAL" || (it.slaDeadline && (it.slaDeadline - now) < 4 * 3600000);
    if (filter === "ACTIVE") return it.slaDeadline && it.slaDeadline > now;
    return true;
  });

  // Sort items: Expired first -> SLA ascending -> Severity
  const sorted = [...filtered].sort((a, b) => {
    const aExpired = a.sla === "EXPIRED" || (a.slaDeadline && a.slaDeadline < now);
    const bExpired = b.sla === "EXPIRED" || (b.slaDeadline && b.slaDeadline < now);
    if (aExpired && !bExpired) return -1;
    if (!aExpired && bExpired) return 1;

    if (a.slaDeadline && b.slaDeadline) {
      if (a.slaDeadline !== b.slaDeadline) return a.slaDeadline - b.slaDeadline;
    } else if (a.slaDeadline) return -1;
    else if (b.slaDeadline) return 1;

    return (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5);
  });

  return (
    <div className="panel flex flex-col h-full">
      <div className="flex flex-col gap-2 px-4 py-3 border-b border-[var(--line)]">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{t("queue.interventionQueue")}</h2>
          <span className="text-[11px] text-[var(--muted)]">{t("queue.evidence", { count: sorted.length })}</span>
        </div>
        
        {/* Filter Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold no-scrollbar">
          <button onClick={() => setFilter("ALL")} className={`px-3 py-1 rounded-full whitespace-nowrap ${filter === 'ALL' ? 'bg-[#34d399] text-black' : 'bg-[#1a232f] text-[var(--muted)]'}`}>Sab</button>
          <button onClick={() => setFilter("ACTIVE")} className={`px-3 py-1 rounded-full whitespace-nowrap ${filter === 'ACTIVE' ? 'bg-[#3b82f6] text-white' : 'bg-[#1a232f] text-[var(--muted)]'}`}>Active</button>
          <button onClick={() => setFilter("URGENT")} className={`px-3 py-1 rounded-full whitespace-nowrap ${filter === 'URGENT' ? 'bg-[#ef4444] text-white' : 'bg-[#1a232f] text-[var(--muted)]'}`}>Urgent</button>
          <button onClick={() => setFilter("EXPIRED")} className={`px-3 py-1 rounded-full whitespace-nowrap ${filter === 'EXPIRED' ? 'bg-[#9333ea] text-white' : 'bg-[#1a232f] text-[var(--muted)]'}`}>Expired</button>
        </div>
      </div>

      <ul className="divide-y divide-[var(--line)] flex-1 overflow-y-auto">
        {sorted.map((it) => {
          const active = selected === it.entityId;
          const isExpired = it.sla === "EXPIRED" || (it.slaDeadline && it.slaDeadline < now);
          const hrsLeft = it.slaDeadline ? (it.slaDeadline - now) / 3600000 : null;
          
          let slaLabel = "";
          let slaBg = "";
          let slaClass = "";

          if (isExpired) {
            slaLabel = "ESCALATED";
            slaBg = "#4c1d95"; // Dark purple/red
            slaClass = "line-through text-gray-400";
          } else if (hrsLeft !== null) {
            if (hrsLeft < 4) {
              slaLabel = "URGENT";
              slaBg = "#ef4444";
              slaClass = "animate-pulse";
            } else if (hrsLeft < 12) {
              slaLabel = "Dhyan Do";
              slaBg = "#eab308";
            } else {
              slaLabel = "Normal";
              slaBg = "#10b981";
            }
          }

          const workerName = getWorkerName(it.assignedWorkerIds);
          
          return (
            <li key={it.entityId} onClick={() => onSelect(it.entityId)}
              className={`px-4 py-3 flex flex-col gap-2 cursor-pointer transition ${active ? "bg-[#16232e]" : "hover:bg-[#141b24]"}`}>
              
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0 mt-1">{getIcon(it.decision)}</span>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-sm text-white">{it.entityCode}</span>
                    <span className="text-[11px] font-bold" style={{ color: pctColor(it.quality) }}>{pct(it.quality)} Q</span>
                  </div>

                  <div className="text-[12px] text-[var(--muted)] truncate mb-1" title={it.reason}>
                    {it.reason}
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    {/* Worker Assignment */}
                    {workerName ? (
                      <span className="text-[10px] font-bold bg-[#1e293b] text-[#94a3b8] px-2 py-0.5 rounded">
                        👤 {workerName}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-red-950 text-red-400 px-2 py-0.5 rounded">
                        ❌ Unassigned
                      </span>
                    )}

                    {/* SLA Countdown */}
                    {hrsLeft !== null && !isExpired && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-black ${slaClass}`} style={{ backgroundColor: slaBg }}>
                        {Math.floor(hrsLeft)}h {Math.floor((hrsLeft % 1) * 60)}m baaki ({slaLabel})
                      </span>
                    )}

                    {isExpired && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white bg-purple-600">
                        ESCALATED
                      </span>
                    )}
                  </div>

                  {isExpired && (
                    <div className="mt-2 text-[11px] font-bold text-purple-400">
                      ⚠️ Supervisor ko bheja gaya
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {sorted.length === 0 && <li className="p-6 text-center text-[var(--muted)]">{t("queue.empty")}</li>}
      </ul>
    </div>
  );
}

function pctColor(q: number) {
  if (q > 0.8) return "#34d399";
  if (q > 0.5) return "#fbbf24";
  return "#f87171";
}
