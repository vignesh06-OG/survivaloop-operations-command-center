"use client";
import { DECISION_TEXT, pct, fmtAgo, fmtTime } from "@/lib/present";

export interface WhyData {
  decision: string;
  rule: string;
  reason: string[];
  evidenceUsed: string[];
  quality: { freshness: number; reliability: number; quality: number; conflicted: boolean; qualifyingCount: number };
  severity: { level: string; score: number };
  urgency: { level: string; score: number };
  capacity: null | { feasible: boolean; detail: Record<string, { required: number; available: number; short: number }>; reason: string[] };
  slaHours: number | null;
  nextAction: string;
  overridden?: boolean;
  at?: number;
}

export default function WhyPanel({ data }: { data: WhyData }) {
  const q = data.quality;
  return (
    <div className="panel p-4 fade">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Why this action</h3>
        {data.at && <span className="text-[11px] text-[var(--muted)]">{fmtTime(data.at)}</span>}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className={`pill text-xs ${data.decision === "ACT" ? "bg-red-900/40 text-red-200" : data.decision === "ESCALATE" ? "bg-purple-900/40 text-purple-200" : "bg-emerald-900/40 text-emerald-200"}`}>
          {data.decision}
        </span>
        <span className="text-[12px] text-[var(--muted)]">{data.rule}</span>
      </div>

      {/* Evidence quality — deliberately separate from the decision. */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Evidence quality</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <QualityBar label="freshness" v={q.freshness} />
          <QualityBar label="reliability" v={q.reliability} />
          <QualityBar label="quality" v={q.quality} />
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-1">
          {q.conflicted ? "⚠ conflicting evidence detected" : "no conflict"} · {q.qualifyingCount} qualifying item(s) · {q.freshness !== undefined && q.reliability !== undefined ? "quality ≠ confidence" : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <MiniStat label="Severity" value={data.severity.level} score={data.severity.score} />
        <MiniStat label="Urgency" value={data.urgency.level} score={data.urgency.score} />
      </div>

      {/* Rationale. */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Rationale</div>
        <ol className="list-decimal list-inside text-[12px] leading-relaxed text-[var(--text)]">
          {data.reason.map((r, i) => <li key={i} className="mb-1">{r}</li>)}
        </ol>
      </div>

      {/* Capacity — why commit or defer. */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">Capacity feasibility</div>
        {data.capacity ? (
          <>
            <div className={`text-[12px] font-semibold ${data.capacity.feasible ? "text-emerald-300" : "text-amber-300"}`}>
              {data.capacity.feasible ? "Feasible — resources available" : "Infeasible — resources insufficient"}
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1">
              {Object.entries(data.capacity.detail).map(([k, v]) => (
                <div key={k} className="flex justify-between text-[11px] text-[var(--muted)]">
                  <span>{k}</span>
                  <span className={v.short > 0 ? "text-amber-300" : "text-emerald-300"}>{v.short > 0 ? v.short + " short" : "ok"}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-[12px] text-[var(--muted)]">Not applicable (no actionable requirement).</div>
        )}
      </div>

      <div className="border-t border-[var(--line)] pt-3">
        <div className="text-[12px]"><span className="text-[var(--muted)]">Next step:</span> {data.nextAction}</div>
        {data.overridden && <div className="text-[12px] text-violet-300 mt-1">⚠ This decision was overridden by a supervisor.</div>}
      </div>
    </div>
  );
}

function QualityBar({ label, v }: { label: string; v: number }) {
  return (
    <div className="border border-[var(--line)] rounded-lg p-2">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-sm mono font-bold">{pct(v)}</div>
      <div className="h-1 rounded bg-[#161e26] mt-1 overflow-hidden">
        <div className="h-full" style={{ width: pct(v), background: "var(--accent)" }} />
      </div>
    </div>
  );
}
function MiniStat({ label, value, score }: { label: string; value: string; score: number }) {
  return (
    <div className="border border-[var(--line)] rounded-lg p-2">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[11px] text-[var(--muted)]">{pct(score)}</div>
    </div>
  );
}
