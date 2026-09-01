"use client";
import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/I18nContext";
import PhotoUpload from "./PhotoUpload";

export default function OutcomePanel({ 
  summary, 
  me, 
  onRefresh, 
  entityLevel, 
  entityId 
}: { 
  summary: any; 
  me: any; 
  onRefresh: () => void;
  entityLevel: string;
  entityId: string;
}) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  
  const steps = useMemo(() => {
    const hasAssessment = !!summary.latestAssessment;
    const hasDecision = !!summary.latestDecision;
    const hasTask = summary.tasks && summary.tasks.length > 0;
    
    // Check task states
    const taskStarted = summary.tasks?.some((t: any) => 
      ["IN_PROGRESS", "COMPLETED", "PROOF_SUBMITTED", "VERIFIED"].includes(t.state)
    );
    
    const hasProof = (summary.proofs && summary.proofs.length > 0) || 
      summary.tasks?.some((t: any) => ["PROOF_SUBMITTED", "VERIFIED"].includes(t.state));
      
    const isVerified = (summary.proofs && summary.proofs.some((p: any) => p.status === "HUMAN_VERIFIED" || p.status === "AUTO_PASS")) ||
      summary.tasks?.some((t: any) => t.state === "VERIFIED");
      
    const hasOutcome = summary.outcomes && summary.outcomes.length > 0;

    return [
      { id: "sense", label: "Sense", icon: "📡", done: hasAssessment },
      { id: "assess", label: "Assess", icon: "📊", done: hasAssessment },
      { id: "decide", label: "Decide", icon: "🧠", done: hasDecision },
      { id: "commit", label: "Commit", icon: "✅", done: hasTask },
      { id: "act", label: "Act", icon: "⚡", done: taskStarted },
      { id: "prove", label: "Prove", icon: "📸", done: hasProof },
      { id: "check", label: "Check", icon: "🔍", done: isVerified },
      { id: "adapt", label: "Adapt", icon: "🌱", done: hasOutcome },
    ];
  }, [summary]);

  const allDone = steps.every(s => s.done);
  
  // Find current active step (first one not done)
  const activeStepIndex = steps.findIndex(s => !s.done);
  const activeIndex = activeStepIndex === -1 ? 7 : activeStepIndex;

  const outcome = summary.outcomes?.[0]; // latest outcome
  const canRecord = me && (me.role === "SUPERVISOR" || me.role === "ADMIN");

  return (
    <div className="bg-[#0b0f14] border border-[var(--line)] rounded-xl overflow-hidden mt-4">
      {/* HEADER / LOOP STATUS */}
      <div className="p-4 border-b border-[var(--line)] flex items-center justify-between">
        <h3 className="font-bold text-sm text-[var(--muted)] tracking-widest uppercase">Intervention Lifecycle</h3>
        {allDone && (
          <div className="px-3 py-1 rounded-full bg-[#10b981]/20 border border-[#10b981] text-[#10b981] text-xs font-bold animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]">
            🎉 LOOP CLOSED
          </div>
        )}
      </div>

      {/* HORIZONTAL STEPPER */}
      <div className="p-6 overflow-x-auto">
        <div className="flex items-center min-w-max justify-between relative px-2">
          {/* Connecting line */}
          <div className="absolute top-5 left-6 right-6 h-1 bg-[#1a232f] -z-10 rounded"></div>
          <div 
            className="absolute top-5 left-6 h-1 bg-[#10b981] -z-10 rounded transition-all duration-700" 
            style={{ width: `${(activeIndex / 7) * 100}%`, maxWidth: 'calc(100% - 3rem)' }}
          ></div>

          {steps.map((step, idx) => {
            const isDone = step.done;
            const isActive = idx === activeIndex && !allDone;
            
            return (
              <div key={step.id} className="flex flex-col items-center gap-2 relative z-10 w-16">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shadow-xl transition-all duration-300 ${
                    isDone 
                      ? 'bg-[#10b981] text-white' 
                      : isActive 
                        ? 'bg-[#3b82f6] text-white ring-4 ring-[#3b82f6]/30 animate-pulse' 
                        : 'bg-[#1a232f] text-[#64748b] border border-[#2d3b4a]'
                  }`}
                >
                  {step.icon}
                </div>
                <div className={`text-xs font-bold ${isDone ? 'text-[#10b981]' : isActive ? 'text-[#3b82f6]' : 'text-[#64748b]'}`}>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* OUTCOME SECTION */}
      <div className="p-4 bg-[#121820] border-t border-[var(--line)]">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-bold text-md text-white">Biological Outcome</h4>
          {!outcome && canRecord && (
            <button 
              onClick={() => setModalOpen(true)}
              className="outcome-record-btn px-4 py-2 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold rounded-lg transition-colors shadow-lg"
            >
              Record Outcome
            </button>
          )}
          {!outcome && !canRecord && (
            <span className="text-xs text-[var(--muted)]">Pending Supervisor Review</span>
          )}
        </div>

        {outcome ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-[#1a232f] rounded-lg p-4 border border-[var(--line)]">
              <div className="text-xs text-[var(--muted)] mb-2 uppercase tracking-wider">Status</div>
              <div className={`text-xl font-bold ${outcome.survived ? (outcome.improved ? 'text-[#3b82f6]' : 'text-[#10b981]') : 'text-[#ef4444]'}`}>
                {outcome.survived ? (outcome.improved ? 'IMPROVED' : 'SURVIVED') : 'DECLINED'}
              </div>
              <div className="text-xs text-[var(--muted)] mt-2">Recorded {new Date(outcome.measuredAt).toLocaleDateString()}</div>
            </div>
            
            <div className="bg-[#1a232f] rounded-lg p-4 border border-[var(--line)] flex gap-2">
              <div className="flex-1">
                <div className="text-xs text-[var(--muted)] mb-1 text-center">Before (Evidence)</div>
                <div className="h-24 bg-[#0b0f14] rounded overflow-hidden flex items-center justify-center border border-[#2d3b4a]">
                  <span className="text-2xl">🍂</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="text-xs text-[var(--muted)] mb-1 text-center">After (Outcome)</div>
                <div className="h-24 bg-[#0b0f14] rounded overflow-hidden flex items-center justify-center border border-[#2d3b4a]">
                  <span className="text-2xl">{outcome.survived ? (outcome.improved ? '🌳' : '🌿') : '🪦'}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-[var(--line)] rounded-xl text-[var(--muted)] bg-[#0b0f14]">
            No biological outcome recorded yet. The loop is still open.
          </div>
        )}
      </div>

      {modalOpen && (
        <RecordOutcomeModal 
          entityLevel={entityLevel} 
          entityId={entityId}
          taskId={summary.tasks?.[0]?.id || null}
          evidenceIds={summary.proofs?.map((p:any) => p.id) || []}
          onClose={() => setModalOpen(false)} 
          onSuccess={() => { setModalOpen(false); onRefresh(); }} 
        />
      )}
    </div>
  );
}

function RecordOutcomeModal({ entityLevel, entityId, taskId, evidenceIds, onClose, onSuccess }: any) {
  const [status, setStatus] = useState("SURVIVED");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  const handleSubmit = async () => {
    setBusy(true); setError(null);
    try {
      const survived = status === "SURVIVED" || status === "IMPROVED";
      const improved = status === "IMPROVED";
      
      await api(`/api/entity/${entityLevel}/${entityId}/outcome`, {
        method: "POST",
        body: { survived, improved, taskId, evidenceIds, notes, photoRefs: photos }
      });
      onSuccess();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#121820] w-full max-w-md rounded-2xl border border-[var(--line)] shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[var(--line)] flex justify-between items-center bg-[#0b0f14] rounded-t-2xl">
          <h2 className="font-bold text-lg text-white">Record Biological Outcome</h2>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white p-2">✕</button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {error && <div className="mb-4 p-3 bg-red-950/50 border border-red-900 text-red-300 text-sm rounded-lg">{error}</div>}
          
          <div className="mb-6">
            <label className="block text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">Outcome Status</label>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setStatus("SURVIVED")}
                className={`py-3 rounded-lg border text-sm font-bold transition-colors ${status === "SURVIVED" ? 'bg-[#10b981]/20 border-[#10b981] text-[#10b981]' : 'bg-[#1a232f] border-[var(--line)] text-[var(--muted)] hover:border-[#64748b]'}`}
              >
                SURVIVED
              </button>
              <button 
                onClick={() => setStatus("IMPROVED")}
                className={`py-3 rounded-lg border text-sm font-bold transition-colors ${status === "IMPROVED" ? 'bg-[#3b82f6]/20 border-[#3b82f6] text-[#3b82f6]' : 'bg-[#1a232f] border-[var(--line)] text-[var(--muted)] hover:border-[#64748b]'}`}
              >
                IMPROVED
              </button>
              <button 
                onClick={() => setStatus("DECLINED")}
                className={`py-3 rounded-lg border text-sm font-bold transition-colors ${status === "DECLINED" ? 'bg-[#ef4444]/20 border-[#ef4444] text-[#ef4444]' : 'bg-[#1a232f] border-[var(--line)] text-[var(--muted)] hover:border-[#64748b]'}`}
              >
                DECLINED
              </button>
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">Photographic Evidence</label>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--muted)] uppercase tracking-wider block">After Photo (Proof)</label>
              <PhotoUpload entityType="outcome" entityId={entityId} onUploadComplete={setPhotos} maxPhotos={1} />
            </div>
            <div className="mt-2 text-[10px] text-[var(--muted)] text-center">Using placeholder visual hashes for demo</div>
          </div>
          
          <div className="mb-4">
            <label className="block text-xs font-bold text-[var(--muted)] uppercase tracking-wider mb-2">Supervisor Notes</label>
            <textarea 
              className="w-full bg-[#1a232f] border border-[var(--line)] rounded-lg p-3 text-sm text-white focus:border-[#3b82f6] outline-none min-h-[100px]"
              placeholder="Describe the final outcome and biological health state..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        
        <div className="p-4 border-t border-[var(--line)] bg-[#0b0f14] rounded-b-2xl">
          <button 
            disabled={busy}
            onClick={handleSubmit}
            className="outcome-survived-btn w-full py-3 bg-[#10b981] hover:bg-[#059669] text-white font-bold rounded-xl transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:opacity-50"
          >
            {busy ? "Submitting..." : "Close Loop & Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
