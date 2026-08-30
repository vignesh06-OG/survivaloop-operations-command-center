"use client";
import { DECISION_TEXT, fmtAgo, pct } from "@/lib/present";
import type { Decision } from "@/domain/types";

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
}
const ORDER: Record<Decision, number> = { ESCALATE: 0, ACT: 1, INSPECT: 2, DEFER: 3, MONITOR: 4 };

export default function PriorityQueue({ items, selected, onSelect }: {
  items: QueueItem[]; selected: string | null; onSelect: (id: string) => void;
}) {
  const sorted = [...items].sort((a, b) => ORDER[a.decision] - ORDER[b.decision] || b.at - a.at);
  return (
    <div className="panel">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
        <h2 className="text-sm font-bold">Priority Queue</h2>
        <span className="text-[11px] text-[var(--muted)]">{sorted.length} entities</span>
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {sorted.map((it) => {
          const active = selected === it.entityId;
          return (
            <li key={it.entityId} onClick={() => onSelect(it.entityId)}
              className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition ${active ? "bg-[#16232e]" : "hover:bg-[#141b24]"}`}>
              <span className="w-10 h-10 rounded-lg grid place-items-center text-white font-bold shrink-0"
                style={{ background: decColor(it.decision) }}>
                {it.decision[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{it.entityCode}</span>
                  <span className="text-[11px] text-[var(--muted)]">{fmtAgo(it.at)}</span>
                  {it.overridden && <span className="pill bg-violet-900/50 text-violet-200 text-[10px]">override</span>}
                  {it.sla && <span className="pill text-[10px]" style={{ background: "#201a2e", color: slaC(it.sla) }}>SLA {it.sla}</span>}
                </div>
                <div className="text-[12px] text-[var(--muted)] truncate">
                  {DECISION_TEXT[it.decision]} · {it.severity.toLowerCase()} · {it.rule}
                  {it.conflictCount ? ` · ⚠ ${it.conflictCount} conflict(s)` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-[var(--muted)]">quality</div>
                <div className="mono text-sm">{pct(it.quality)}</div>
              </div>
            </li>
          );
        })}
        {sorted.length === 0 && <li className="p-6 text-center text-[var(--muted)]">No entities assessed yet.</li>}
      </ul>
    </div>
  );
}

function decColor(d: string): string {
  const map: Record<string, string> = { ACT: "#dc2626", INSPECT: "#d97706", MONITOR: "#059669", DEFER: "#2563eb", ESCALATE: "#9333ea" };
  return map[d] ?? "#475569";
}
function slaC(s: string): string {
  const map: Record<string, string> = { NORMAL: "#34d399", APPROACHING: "#fbbf24", CRITICAL: "#f87171", EXPIRED: "#ef4444", ESCALATED: "#c084fc" };
  return map[s] ?? "#94a3b8";
}
