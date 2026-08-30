"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Role } from "@/domain/types";

const ROLES: { role: Role; label: string; blurb: string }[] = [
  { role: "ADMIN", label: "Admin", blurb: "Full system control" },
  { role: "SUPERVISOR", label: "Supervisor", blurb: "Dispatch, review, override" },
  { role: "FIELD_WORKER", label: "Field Worker", blurb: "My tasks & proof" },
  { role: "AUDITOR", label: "Auditor", blurb: "Read-only oversight" },
];

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function login(role: Role) {
    setBusy(role);
    try {
      await api(`/api/auth/demo/${role}`, { method: "POST" });
      onAuthed();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "radial-gradient(circle at 50% 20%, #12202a, #0b0f14)" }}>
      <div className="panel w-full max-w-md p-8 fade">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🌱</span>
          <h1 className="text-xl font-bold tracking-tight">SurvivaLoop</h1>
        </div>
        <p className="text-sm text-[var(--muted)] mb-6">
          Operational decision support &amp; intervention management for tree survival.
          <br />
          <span className="text-xs">SENSE → ASSESS → DECIDE → COMMIT → ACT → PROVE → CHECK → ADAPT</span>
        </p>
        <div className="text-xs font-semibold text-[var(--warn)] mb-2">DEMO IDENTITY · SIMULATED DATA</div>
        <div className="grid gap-2">
          {ROLES.map((r) => (
            <button
              key={r.role}
              className="btn justify-between w-full"
              disabled={busy !== null}
              onClick={() => login(r.role)}
            >
              <span>{r.label}</span>
              <span className="text-xs text-[var(--muted)]">{r.blurb}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--muted)] mt-6 leading-relaxed">
          Demo uses seeded identities and a signed server-side session. Roles are enforced by the server,
          never by hidden UI controls. All displayed data is synthetic.
        </p>
      </div>
    </div>
  );
}
