"use client";
import { fmtTime, pct } from "@/lib/present";
export interface EvidenceView {
  id: string; evidence_type: string; source: string; signal: string;
  implied_severity: number; observed_at: number; captured_at: number;
  lat: number | null; lng: number | null; verification_status: string; simulated?: boolean;
}
const VSTATUS: Record<string, string> = {
  PENDING: "#fbbf24", AUTO_PASS: "#34d399", FLAGGED: "#f87171", HUMAN_VERIFIED: "#10b981", REJECTED: "#ef4444",
};
export default function EvidenceTimeline({ evidence }: { evidence: EvidenceView[] }) {
  return (
    <div className="panel p-4">
      <h3 className="text-sm font-bold mb-2">Evidence timeline</h3>
      {evidence.length === 0 && <div className="text-[var(--muted)] text-sm">No evidence recorded.</div>}
      <ol className="space-y-2">
        {evidence.map((e) => (
          <li key={e.id} className="flex gap-3 text-[12px]">
            <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ background: signalColor(e.signal) }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{e.evidence_type}</span>
                <span className="text-[var(--muted)]">{e.source}</span>
                <span className="pill text-[10px]" style={{ background: "#121a22", color: VSTATUS[e.verification_status] ?? "#94a3b8" }}>{e.verification_status}</span>
                {e.simulated && <span className="pill text-[10px] bg-amber-900/30 text-amber-300">SIM</span>}
              </div>
              <div className="text-[var(--muted)]">
                observed {fmtTime(e.observed_at)} · captured {fmtTime(e.captured_at)} · sev {pct(e.implied_severity)}
                {e.lat != null ? ` · ${e.lat.toFixed(4)},${e.lng?.toFixed(4)}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-[var(--muted)] mt-3">Evidence is a claim, not truth. Severity is derived from the evidence type server-side.</p>
    </div>
  );
}
function signalColor(s: string): string {
  return s === "DISTRESS" ? "#f87171" : s === "IMPROVEMENT" ? "#34d399" : "#94a3b8";
}
