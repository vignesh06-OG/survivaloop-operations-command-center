"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Role } from "@/domain/types";
import { useTranslation } from "@/lib/i18n/I18nContext";
import LanguageSelector from "./LanguageSelector";

const ROLES: Role[] = ["ADMIN", "SUPERVISOR", "FIELD_WORKER", "AUDITOR"];

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  async function login(role: Role) {
    setBusy(role);
    setError(null);
    try {
      await api(`/api/auth/demo/${role}`, { method: "POST" });
      onAuthed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "radial-gradient(circle at 50% 20%, #12202a, #0b0f14)" }}>
      <div className="absolute top-4 right-4"><LanguageSelector /></div>
      <div className="panel w-full max-w-md p-8 fade">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🌱</span>
          <h1 className="text-xl font-bold tracking-tight">{t("appTitle")}</h1>
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">
          {t("appTagline")}
          <br />
          <span className="text-xs">{t("appPipeline")}</span>
        </p>
        {error && (
          <div className="mb-4 p-3 rounded-md text-sm border" style={{ background: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: "#f87171" }}>
            <div className="flex items-center justify-between gap-2">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
            </div>
          </div>
        )}
        <div className="text-xs font-semibold text-[var(--warn)] mb-2">{t("demoIdentity")}</div>
        <div className="grid gap-2">
          {ROLES.map((role) => (
            <button
              key={role}
              className="btn justify-between w-full"
              disabled={busy !== null}
              onClick={() => login(role)}
            >
              <span>{t(`role.${role}`)}</span>
              <span className="text-xs text-[var(--muted)]">{t(`roleBlurb.${role}`)}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--muted)] mt-6 leading-relaxed">
          {t("demoNotice")}
        </p>
      </div>
    </div>
  );
}

