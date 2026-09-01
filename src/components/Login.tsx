"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Role } from "@/domain/types";
import { useTranslation } from "@/lib/i18n/I18nContext";
import { Logo } from "@/components/Logo";
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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg)]" style={{ background: "radial-gradient(circle at 50% 20%, #064e3b, #050806)" }}>
      <div className="absolute top-4 right-4"><LanguageSelector /></div>
      <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl border-t-4 border-t-[#22c55e]">
        
        {/* Header / Logo */}
        <div className="flex flex-col items-center justify-center space-y-2 mb-12">
          <Logo variant="login" />
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/30 text-red-400 animate-fade-in flex items-center gap-2">
            <span>⚠</span> {error}
          </div>
        )}

        <div className="animate-fade-in">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-1">Demo Identity &middot; Simulated Data</h2>
            <p className="text-xs text-[var(--warn)] font-mono bg-[var(--warn)]/10 inline-block px-2 py-1 rounded mt-2">DEMO MODE ACTIVE</p>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            {ROLES.map((role, i) => (
              <button
                key={role}
                className="group relative p-4 bg-[#0a1628] border border-[var(--line)] rounded-xl text-left hover:border-[#22c55e] transition-all hover:-translate-y-1 overflow-hidden"
                disabled={busy !== null}
                onClick={() => login(role)}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#22c55e]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative z-10">
                  <div className="font-bold text-white group-hover:text-[#22c55e] transition-colors mb-1">{t(`role.${role}`)}</div>
                  <div className="text-[10px] text-[var(--muted)] leading-tight">{t(`roleBlurb.${role}`)}</div>
                </div>
                {busy === role && (
                  <div className="absolute top-2 right-2 w-4 h-4 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
                )}
              </button>
            ))}
          </div>
          
          <p className="text-[10px] text-[var(--muted)] text-center max-w-[280px] mx-auto leading-relaxed opacity-60">
            Demo uses seeded identities. All data is synthetic.
          </p>
        </div>
      </div>
    </div>
  );
}
