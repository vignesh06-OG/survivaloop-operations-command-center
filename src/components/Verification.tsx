"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/I18nContext";
export interface ProofView {
  id: string; task_id: string; worker_id: string; submission_id: string;
  claimed_at: number; submitted_at: number; lat: number | null; lng: number | null;
  verification_status: string; photo_refs_json: string; checks_json: string | null; review_outcome: string | null;
}
const STATUS: Record<string, string> = {
  PENDING: "#fbbf24", AUTO_PASS: "#34d399", FLAGGED: "#f87171", VERIFIED: "#10b981", REJECTED: "#ef4444",
};
export default function Verification({ proofs, user, onChanged }: {
  proofs: ProofView[]; user: { role: string }; onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const canReview = user.role === "SUPERVISOR" || user.role === "ADMIN";
  if (proofs.length === 0) return <div className="panel p-4 text-[var(--muted)] text-sm">No execution proof submitted.</div>;
  return (
    <div className="panel p-4">
      <h3 className="text-sm font-bold mb-2">{t("verification.titleText")}</h3>
      {err && <div className="text-[12px] text-red-300 bg-red-900/20 rounded p-2 mb-2">{err}</div>}
      <div className="space-y-3">
        {proofs.map((p) => {
          let checks: { id: string; status: string; detail: string }[] = [];
          try { checks = p.checks_json ? JSON.parse(p.checks_json) : []; } catch {}
          return (
            <div key={p.id} className="border border-[var(--line)] rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="pill text-[11px]" style={{ background: "#121a22", color: STATUS[p.verification_status] ?? "#94a3b8" }}>{p.verification_status}</span>
                <span className="text-[11px] text-[var(--muted)]">{t("verification.worker")} {p.worker_id.slice(0, 8)} · {p.submission_id.slice(0, 10)}…</span>
              </div>
              <div className="text-[12px] text-[var(--muted)] mt-1">
                {t("verification.claimed")} {new Date(p.claimed_at).toLocaleTimeString()} · {t("verification.received")} {new Date(p.submitted_at).toLocaleTimeString()}
                {p.lat != null ? ` · GPS ${p.lat.toFixed(4)},${p.lng?.toFixed(4)}` : ` · ${t("verification.noGps")}`}
              </div>
              {checks.length > 0 && (
                <ul className="mt-2 text-[11px] space-y-1">
                  {checks.map((c) => (
                    <li key={c.id} className="flex gap-2">
                      <span className={c.status === "PASS" ? "text-emerald-300" : c.status === "FLAG" ? "text-red-300" : "text-amber-300"}>{c.status}</span>
                      <span className="text-[var(--muted)]">{c.id}: {c.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canReview && (
                <div className="flex gap-2 items-center mt-2">
                  <button className="btn text-[12px] py-1" onClick={async () => {
                    setErr(null);
                    try { await api(`/api/proof/${p.id}/auto`, { method: "POST" }); onChanged(); }
                    catch (e) { setErr((e as Error).message); }
                  }}>{t("verification.btnAuto")}</button>
                  <input className="input text-[12px] flex-1" placeholder={t("verification.reviewReason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className="btn btn-primary text-[12px] py-1" onClick={async () => {
                    setErr(null);
                    try { await api(`/api/proof/${p.id}/review`, { method: "POST", body: { decision: "VERIFIED", reason } }); onChanged(); }
                    catch (e) { setErr((e as Error).message); }
                  }}>{t("verification.btnVerify")}</button>
                  <button className="btn btn-danger text-[12px] py-1" onClick={async () => {
                    setErr(null);
                    try { await api(`/api/proof/${p.id}/review`, { method: "POST", body: { decision: "REJECTED", reason } }); onChanged(); }
                    catch (e) { setErr((e as Error).message); }
                  }}>{t("verification.btnReject")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--muted)] mt-3">{t("verification.disclaimer")}</p>
    </div>
  );
}
