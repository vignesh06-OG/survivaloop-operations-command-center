"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import Login from "./Login";
import { FALLBACK_TASK_COLOR, fmtAgo } from "@/lib/present";
import type { TaskView } from "./TaskPipeline";
import { useTranslation } from "@/lib/i18n/I18nContext";
import LanguageSelector from "./LanguageSelector";
import FieldAssistant from "./FieldAssistant";

interface Me { id: string; name: string; email: string; role: string; orgId: string; dataMode: string }

export default function FieldView() {
  const { t } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api<{ user: Me | null }>("/api/auth/me");
      if (!m.user) { setMe(null); setLoading(false); return; }
      setMe(m.user);
      
      const ts = await api<TaskView[]>("/api/tasks");
      setTasks(ts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) return <div className="min-h-screen bg-black grid place-items-center text-[var(--muted)]">Loading…</div>;
  if (!me || me.role !== "FIELD_WORKER") return <Login onAuthed={refresh} />;

  if (selectedTask) {
    const activeTask = tasks.find((t) => t.id === selectedTask.id) ?? selectedTask;
    return <TaskDetail task={activeTask} onBack={() => setSelectedTask(null)} onRefresh={refresh} />;
  }

  return (
    <div className="min-h-screen bg-black text-[#e6edf3] flex flex-col max-w-md mx-auto border-x border-[var(--line)]">
      <header className="p-4 border-b border-[var(--line)] bg-[#0b0f14] sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-lg text-[#34d399]">{t("field.title")}</h1>
          <div className="text-xs text-[var(--muted)]">{me.name} · {t("field.assignedTasks", { count: tasks.length })}</div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <button onClick={async () => { await api("/api/auth/logout", { method: "POST" }); setMe(null); }} className="p-2 text-xs text-[var(--muted)]">{t("field.logout")}</button>
        </div>
      </header>
      
      <div className="p-4 space-y-4 overflow-y-auto flex-1 pb-24">
        {tasks.length === 0 ? (
          <div className="text-center p-8 text-[var(--muted)] text-sm border border-[var(--line)] rounded-xl border-dashed">
            {t("field.noDispatches")}
          </div>
        ) : (
          tasks.sort((a, b) => b.created_at - a.created_at).map(task => (
            <div key={task.id} onClick={() => setSelectedTask(task)} className="bg-[#121820] border border-[var(--line)] rounded-xl p-4 active:scale-[0.98] transition-transform cursor-pointer shadow-lg shadow-black/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono text-[#94a3b8]">{task.entity_id}</span>
                <span className="pill text-[10px]" style={{ background: "rgba(0,0,0,0.5)", border: `1px solid ${FALLBACK_TASK_COLOR[task.state] ?? "#64748b"}`, color: FALLBACK_TASK_COLOR[task.state] ?? "#94a3b8" }}>
                  {t(`state.${task.state}`) || task.state}
                </span>
              </div>
              <div className="text-sm font-semibold mb-1">{t("field.intervention")} {task.intervention_class_id}</div>
              <div className="text-xs text-[var(--muted)]">{t("field.dispatched")} {fmtAgo(task.created_at)}</div>
              {task.sla_deadline && <div className="text-xs text-[#fbbf24] mt-1">{t("field.slaDeadline")} {new Date(task.sla_deadline).toLocaleTimeString()}</div>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TaskDetail({ task, onBack, onRefresh }: { task: TaskView; onBack: () => void; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);

  const handleTransition = async (to: string) => {
    setBusy(true); setError(null);
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { to } });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isCompleted = task.state === "COMPLETED";
  const needsProof = task.state === "COMPLETED"; // proof can be submitted
  const isFinished = ["PROOF_SUBMITTED", "VERIFIED", "REJECTED", "EXPIRED", "CANCELLED"].includes(task.state);
  const canUseAssistant = ["IN_PROGRESS", "COMPLETED"].includes(task.state);

  // Fullscreen assistant overlay
  if (showAssistant) {
    return (
      <div className="min-h-screen bg-black text-[#e6edf3] flex flex-col max-w-md mx-auto border-x border-[var(--line)]">
        <FieldAssistant task={task} onRefresh={onRefresh} onClose={() => setShowAssistant(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-[#e6edf3] flex flex-col max-w-md mx-auto border-x border-[var(--line)]">
      <header className="p-4 border-b border-[var(--line)] bg-[#0b0f14] sticky top-0 z-10 flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ms-2 text-[var(--muted)] active:text-white rtl-flip">{t("field.back")}</button>
        <h1 className="font-bold text-md truncate flex-1">{task.entity_id}</h1>
        {canUseAssistant && (
          <button onClick={() => setShowAssistant(true)} className="px-3 py-1.5 rounded-lg bg-[#1a232f] border border-[var(--line)] text-xs font-bold text-[#34d399] active:scale-95 transition-transform flex items-center gap-1.5" aria-label={t("ai.assistantTitle")}>
            🤖 <span className="hidden sm:inline">{t("ai.assistantTitle")}</span>
          </button>
        )}
      </header>

      <div className="p-4 flex-1 overflow-y-auto pb-24">
        {error && <div className="p-3 mb-4 rounded-lg bg-red-950/50 border border-red-900 text-red-300 text-sm">{error}</div>}
        
        <div className="bg-[#121820] border border-[var(--line)] rounded-xl p-4 mb-4">
          <div className="text-xs text-[var(--muted)] mb-1 uppercase tracking-wider">{t("field.currentStatus")}</div>
          <div className="text-lg font-bold" style={{ color: FALLBACK_TASK_COLOR[task.state] ?? "#fff" }}>{t(`state.${task.state}`) || task.state}</div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[var(--muted)] text-xs">{t("field.action")}</div>
              <div className="font-semibold">{task.intervention_class_id}</div>
            </div>
            <div>
              <div className="text-[var(--muted)] text-xs">{t("field.slaStatus")}</div>
              <div className="font-semibold" style={{ color: task.sla_state === "NORMAL" ? "#34d399" : "#f87171" }}>{task.sla_state}</div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        {!isFinished && !needsProof && (
          <div className="space-y-3 mt-8">
            <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-2">{t("field.executeAction")}</h3>
            {task.state === "DISPATCHED" && (
              <button disabled={busy} onClick={() => handleTransition("ACCEPTED")} className="w-full py-4 rounded-xl font-bold bg-[#0ea5e9] text-white active:scale-95 transition-transform text-lg shadow-[0_0_20px_rgba(14,165,233,0.3)]">
                {busy ? t("field.updating") : t("field.acceptDispatch")}
              </button>
            )}
            {task.state === "ACCEPTED" && (
              <button disabled={busy} onClick={() => handleTransition("IN_PROGRESS")} className="w-full py-4 rounded-xl font-bold bg-[#eab308] text-black active:scale-95 transition-transform text-lg shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                {busy ? t("field.updating") : t("field.startIntervention")}
              </button>
            )}
            {task.state === "IN_PROGRESS" && (
              <button disabled={busy} onClick={() => handleTransition("COMPLETED")} className="w-full py-4 rounded-xl font-bold bg-[#22c55e] text-white active:scale-95 transition-transform text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)]">
                {busy ? t("field.updating") : t("field.markCompleted")}
              </button>
            )}
          </div>
        )}

        {/* Evidence Submission */}
        {needsProof && (
          <EvidenceCaptureForm task={task} onRefresh={onRefresh} />
        )}
        
        {isFinished && (
          <div className="mt-8 p-4 bg-[#064e3b]/20 border border-[#064e3b] rounded-xl text-center">
            <div className="text-2xl mb-2">✅</div>
            <div className="font-bold text-[#34d399]">{t("field.workflowComplete")}</div>
            <p className="text-sm text-[var(--muted)] mt-1">{t("field.workflowCompleteDesc")}</p>
          </div>
        )}
      </div>

      {/* Floating AI Assistant button (visible when task is active but not yet showing assistant) */}
      {canUseAssistant && (
        <div className="fixed bottom-6 right-6 z-20 max-w-md" style={{ marginInlineEnd: "max(0px, calc(50vw - 14rem))" }}>
          <button
            onClick={() => setShowAssistant(true)}
            className="w-14 h-14 rounded-full bg-[#10b981] text-white text-2xl shadow-[0_0_30px_rgba(16,185,129,0.4)] active:scale-90 transition-transform flex items-center justify-center"
            aria-label={t("ai.assistantTitle")}
          >
            🤖
          </button>
        </div>
      )}
    </div>
  );
}

function EvidenceCaptureForm({ task, onRefresh }: { task: TaskView; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setBusy(true); setError(null);
    try {
      await api("/api/proof", {
        method: "POST",
        body: {
          taskId: task.id,
          submissionId: "mob_" + Date.now().toString(),
          claimedAt: Date.now(),
          location: { lat: 12.97, lng: 77.39 }, // Mock GPS
          photoRefs: ["ipfs://mock_photo_hash_" + Date.now()],
          note: note || "Task completed in the field."
        }
      });
      // also transition state to PROOF_SUBMITTED so UI updates
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { to: "PROOF_SUBMITTED" } });
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-4">{t("field.captureEvidence")}</h3>
      {error && <div className="p-3 mb-4 rounded-lg bg-red-950/50 border border-red-900 text-red-300 text-sm">{error}</div>}
      
      <div className="space-y-4">
        <div className="p-6 bg-[#1a232f] border border-[#2d3b4a] rounded-xl flex flex-col items-center justify-center gap-2 text-[var(--muted)] cursor-not-allowed">
          <span className="text-3xl">📷</span>
          <span className="text-sm">{t("field.cameraApi")}</span>
          <span className="text-[10px] text-center max-w-[200px]">{t("field.cameraDesc")}</span>
        </div>
        
        <div>
          <label className="text-xs text-[var(--muted)] block mb-1">{t("field.fieldNotes")}</label>
          <textarea 
            className="w-full bg-[#121820] border border-[var(--line)] rounded-lg p-3 text-sm focus:border-[#34d399] outline-none transition-colors"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("field.describeOutcome")}
          />
        </div>

        <button disabled={busy} onClick={handleSubmit} className="w-full py-4 rounded-xl font-bold bg-[#10b981] text-white active:scale-95 transition-transform text-lg shadow-[0_0_20px_rgba(16,185,129,0.3)]">
          {busy ? t("field.uploading") : t("field.submitProof")}
        </button>
      </div>
    </div>
  );
}
