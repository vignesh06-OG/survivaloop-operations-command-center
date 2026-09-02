"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import Login from "./Login";
import { FALLBACK_TASK_COLOR } from "@/lib/present";
import type { TaskView } from "./TaskPipeline";
import { useTranslation } from "@/lib/i18n/I18nContext";
import PhotoUpload from "./PhotoUpload";
import BottomNav from "./BottomNav";
import ProfileModal from "./ProfileModal";

interface Me { id: string; name: string; email: string; role: string; orgId: string; dataMode: string; points: number; city?: string; locality?: string; age?: number }

function FieldViewInner() {
  const { t, lang, speechCode } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "rewards">("tasks");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const refresh = useCallback(async () => {
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 8000);
      let res;
      try {
        res = await fetch("/api/auth/me", { signal: abortController.signal });
        clearTimeout(timeoutId);
        if (res.status === 401) {
          setMe(null);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error("Auth endpoint returned " + res.status);
      } catch (err) {
        clearTimeout(timeoutId);
        // Only clear session if it's explicitly unauthorized. Network errors shouldn't auto-logout.
        setLoading(false);
        return;
      }

      const m = await res.json();
      if (!m.user) { setMe(null); setLoading(false); return; }
      if (m.user.role !== "FIELD_WORKER") { window.location.assign("/"); return; }
      setMe(m.user);
      
      try {
        const ts = await api<TaskView[]>("/api/tasks");
        const activeTasks = ts.filter(t => !["PROOF_SUBMITTED", "VERIFIED", "REJECTED", "EXPIRED", "CANCELLED"].includes(t.state));
        setTasks(activeTasks.sort((a, b) => b.created_at - a.created_at));

        const lb = await api<any[]>("/api/leaderboard?scope=overall").catch(() => []);
        setLeaderboard(lb);
      } catch (e) {
        console.error("Failed to load tasks/leaderboard:", e);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    refresh(); 
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    
    const handleDemoAction = (e: any) => {
      const type = e.detail?.type;
      if (type === "FIELD_TASK") {
        setTimeout(() => {
          const startBtn = document.querySelector(".demo-shuru-karo-btn") as HTMLButtonElement;
          if (startBtn) startBtn.click();
          setTimeout(() => {
            const endBtn = document.querySelector(".demo-task-poora-btn") as HTMLButtonElement;
            if (endBtn) endBtn.click();
          }, 3000); // 3 seconds later
        }, 1000);
      }
    };
    window.addEventListener("demo-action", handleDemoAction);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('demo-action', handleDemoAction);
    };
  }, [refresh]);

  if (loading) return <div className="min-h-screen bg-black grid place-items-center text-xl text-white">Loading…</div>;
  if (!me || me.role !== "FIELD_WORKER") return <Login onAuthed={refresh} />;

  // Display the first task in the queue
  const activeTask = tasks[0];

  return (
    <div className="min-h-screen bg-black text-[#e6edf3] flex flex-col max-w-md mx-auto relative overflow-hidden">
      <ProfileModal user={me} onComplete={refresh} />
      
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-[#eab308] text-black font-bold p-3 text-center text-lg shadow-md z-50">
          📡 Internet nahi hai. Data save ho raha hai, sync hoga baad mein.
        </div>
      )}

      {/* TOP BAR */}
      <header className="p-4 border-b border-[var(--line)] bg-[#0b0f14] sticky top-0 z-10 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#1a232f] border border-[var(--line)] flex items-center justify-center text-2xl">
            👤
          </div>
          <div>
            <h1 className="font-bold text-xl text-white">{me.name}</h1>
            <div className="text-sm font-bold text-[#34d399]">{tasks.length} {t("field.tasksToday") || "tasks today"}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-3xl" title="Sync Status">
            {isOnline ? "✅" : "⚠️"}
          </div>
          <button onClick={async () => { await api("/api/auth/logout", { method: "POST" }); setMe(null); }} className="text-xs text-[var(--muted)] underline p-1">
            Logout
          </button>
        </div>
      </header>

      {/* TABS */}
      <div className="flex border-b border-[var(--line)] bg-[#0b0f14]">
        <button 
          onClick={() => setActiveTab("tasks")} 
          className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'tasks' ? 'border-[#34d399] text-[#34d399]' : 'border-transparent text-[var(--muted)]'}`}
        >
          My Tasks
        </button>
        <button 
          onClick={() => setActiveTab("rewards")} 
          className={`flex-1 py-3 text-sm font-bold border-b-2 ${activeTab === 'rewards' ? 'border-[#34d399] text-[#34d399]' : 'border-transparent text-[var(--muted)]'}`}
        >
          Rewards & Rank
        </button>
      </div>
      
      {/* TASK CARD OR EMPTY STATE */}
      {activeTab === "tasks" ? (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto">
          {!activeTask ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="text-6xl animate-bounce">🎉</div>
              <h2 className="text-2xl font-bold text-[#34d399]">{t("field.allTasksDone") || "All tasks complete for today"}</h2>
              <p className="text-xl text-[var(--muted)] mb-4">{t("field.youAreDone") || "You're done"}</p>
              
              <button 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch('/api/simulate', { method: 'POST' });
                    if (!res.ok) throw new Error('Simulation failed');
                    await refresh();
                  } catch (err) {
                    console.error('Failed to load demo tasks:', err);
                    setLeaderboard([{ id: 'err', name: 'Failed to load demo tasks. Please try again.', points: 0 }]);
                  } finally {
                    setLoading(false);
                  }
                }}
                className="mt-4 px-6 py-3 bg-[#34d399] text-black font-bold rounded-xl"
              >
                Load Demo Tasks
              </button>
            </div>
          ) : (
            <TaskCard task={activeTask} onNext={() => refresh()} lang={lang} isOnline={isOnline} />
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-6">
          <div className="bg-[#1a232f] border border-[var(--line)] rounded-2xl p-6 text-center shadow-lg">
            <h2 className="text-sm font-bold text-[var(--muted)] uppercase tracking-wider mb-2">My Points</h2>
            <div className="text-5xl font-black text-[#34d399]">{me.points}</div>
            <p className="text-xs text-[var(--muted)] mt-2">Earn points for every verified task</p>
          </div>
          
          <div>
            <h3 className="text-lg font-bold text-white mb-3">Leaderboard <span className="text-xs font-normal text-[var(--muted)] ml-2">(Demo incentive layer - Synthetic)</span></h3>
            <div className="bg-[#0b0f14] border border-[var(--line)] rounded-2xl overflow-hidden">
              {leaderboard.map((lbUser, idx) => (
                <div key={lbUser.id} className={`flex items-center justify-between p-4 border-b border-[var(--line)] last:border-0 ${lbUser.id === me.id ? 'bg-[#34d399]/10' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${idx < 3 ? 'bg-[#34d399] text-black' : 'bg-[#1a232f] text-white'}`}>
                      {idx + 1}
                    </div>
                    <div>
                      <div className="font-bold text-white">{lbUser.name}</div>
                      <div className="text-xs text-[var(--muted)]">{lbUser.locality || 'Unknown'}</div>
                    </div>
                  </div>
                  <div className="font-black text-[#34d399]">{lbUser.points} pts</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Updated TaskView definition to match API
export interface FieldTaskView extends TaskView {
  title?: string;
  entityName?: string;
  type?: string;
  coordinates?: { lat: number; lng: number };
}

function TaskCard({ task, onNext, lang, isOnline }: { task: FieldTaskView; onNext: () => void; lang: string; isOnline: boolean }) {
  const { t, speechCode } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State machine local view
  const [localState, setLocalState] = useState(task.state);
  const [showSuccess, setShowSuccess] = useState(false);

  // Evidence state
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Derive task icon based on type (provided by API) or fallback
  const getIcon = (type?: string, ic?: string) => {
    if (type === "WATER" || (ic && ic.includes("WATER"))) return "💧";
    if (type === "INSPECT" || (ic && ic.includes("INSPECT"))) return "🔍";
    if (type === "REPAIR" || (ic && (ic.includes("PRUNE") || ic.includes("REPAIR")))) return "🛠️";
    if (ic && ic.includes("PLANT")) return "🌱";
    return "📋";
  };
  const icon = getIcon(task.type, task.intervention_class_id);
  const typeLabel = task.type === "WATER" ? "Water" : task.type === "INSPECT" ? "Inspect" : task.type === "REPAIR" ? "Repair" : "Task";
  const distance = Math.floor(Math.random() * 800) + 100; // Mock distance for UI
  const points = task.type === "WATER" ? 10 : task.type === "INSPECT" ? 5 : 15;

  
  const handleTransition = async (to: string) => {
    setBusy(true); setError(null);
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { to } });
      setLocalState(to as any);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true); setError(null);
    try {
      // First post evidence
      await api("/api/proof", {
        method: "POST",
        body: {
          taskId: task.id,
          submissionId: "mob_" + Date.now().toString(),
          claimedAt: Date.now(),
          location: { lat: 12.97, lng: 77.39 }, // Mock GPS
          photoRefs: photos.length > 0 ? photos : ["ipfs://mock_photo_hash_" + Date.now()],
          note: note || "Task completed."
        }
      });
      // Then advance task state
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { to: "PROOF_SUBMITTED" } });
      
      // Show success animation
      setShowSuccess(true);
      setTimeout(() => {
        onNext(); // Advance to next task
      }, 2000);
      
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };



  const toggleListen = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setError("Voice dictation requires Google Chrome or a Chromium-based browser.");
      return;
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = speechCode;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join("");
        setNote(prev => prev ? prev + " " + transcript : transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  if (showSuccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-32 h-32 rounded-full bg-[#10b981] flex items-center justify-center text-6xl shadow-[0_0_50px_rgba(16,185,129,0.5)] animate-pulse">
          ✅
        </div>
        <h2 className="text-3xl font-bold text-white">Shabash! 🎉</h2>
        <p className="text-xl text-[var(--muted)]">Task saved.</p>
      </div>
    );
  }

  // Pre-start view (PENDING/DISPATCHED/ACCEPTED)
  if (localState !== "IN_PROGRESS" && localState !== "COMPLETED") {
    return (
      <div className="flex flex-col flex-1">
        {error && <div className="p-4 bg-red-900 border border-red-500 rounded-xl mb-4 text-white text-lg shadow-md">{error}</div>}
        
        <div className="flex-1 flex flex-col bg-gradient-to-b from-[#1a232f] to-transparent p-6 rounded-2xl border border-[var(--line)] shadow-xl relative overflow-hidden mb-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#34d399]/10 rounded-bl-full blur-2xl"></div>
          
          {/* Top meta row */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2 bg-[#0b0f14] px-3 py-1.5 rounded-full border border-[var(--line)] shadow-inner">
              <span className="text-xl">{icon}</span>
              <span className="text-sm font-bold text-white uppercase tracking-wider">{typeLabel}</span>
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-1.5 bg-[#0b0f14] rounded-full border border-[var(--line)] shadow-inner`}>
              <div className={`w-2.5 h-2.5 rounded-full ${task.sla_state === 'NORMAL' ? 'bg-[#10b981]' : task.sla_state === 'CRITICAL' ? 'bg-[#ef4444] animate-pulse' : 'bg-[#eab308]'}`}></div>
              <span className="text-xs font-bold text-white uppercase">{task.sla_state}</span>
            </div>
          </div>
          
          <h2 className="text-3xl font-black text-white leading-tight mb-2 drop-shadow-sm">{task.entityName || task.entity_id}</h2>
          
          <p className="text-lg text-[var(--muted)] mb-6 leading-relaxed">
            {task.title || `Perform ${typeLabel.toLowerCase()} operations`}
          </p>

          <div className="flex flex-wrap gap-4 mt-auto">
            <div className="flex items-center gap-2 bg-[#0b0f14] px-4 py-2 rounded-xl border border-[var(--line)]">
              <span className="text-xl">📍</span>
              <span className="text-sm font-bold text-[#34d399]">{t("field.distanceAway", { distance: distance + 'm' }) || `${distance}m away`}</span>
            </div>
            
            <div className="flex items-center gap-2 bg-[#0b0f14] px-4 py-2 rounded-xl border border-[var(--line)]">
              <span className="text-xl">⭐</span>
              <span className="text-sm font-bold text-yellow-400">+{points} pts</span>
            </div>
          </div>

          <a 
            href={`https://maps.google.com/?q=${task.coordinates?.lat || 12.97},${task.coordinates?.lng || 77.39}`} 
            target="_blank" 
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#2563eb] text-white text-sm font-bold rounded-xl active:scale-95 transition-transform mt-6 shadow-md"
          >
            🗺️ {t("field.getDirections") || "Get Directions"}
          </a>
        </div>

        <button 
          disabled={busy} 
          onClick={() => handleTransition("IN_PROGRESS")}
          className="demo-shuru-karo-btn w-full h-16 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xl font-black rounded-2xl shadow-[0_4px_20px_rgba(16,185,129,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 mt-auto"
        >
          {busy ? t("field.wait") || "Wait..." : t("field.startTask") || "START TASK"}
        </button>
      </div>
    );
  }

  // Active View (IN_PROGRESS) -> Evidence gathering
  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {error && <div className="p-4 bg-red-900 border border-red-500 rounded-xl mb-4 text-white text-lg">{error}</div>}
      
      <div className="flex items-center justify-between mb-6 bg-[#1a232f] p-4 rounded-xl border border-[var(--line)] shadow-md">
        <div>
          <h2 className="text-xl font-black text-white">{task.entityName || task.entity_id}</h2>
          <div className="text-sm text-[#34d399] font-bold flex items-center gap-1 mt-1">
            <span className="animate-pulse">📍</span> GPS locked
          </div>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>

      <div className="space-y-6 flex-1">
        {/* Photo Uploads */}
        <PhotoUpload entityType="task" entityId={task.id} onUploadComplete={setPhotos} maxPhotos={3} />

        {/* Voice Notes */}
        <div className="space-y-3">
          <button 
            onClick={toggleListen}
            className={`w-full py-4 text-xl font-bold rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-lg ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-[#1a232f] border border-[var(--line)] text-white active:bg-[#2d3b4a]'}`}
          >
            {isListening ? t("field.listening") || "Listening..." : t("field.voiceNote") || "Add Voice Note"}
          </button>
          
          <textarea 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("field.typeHere") || "Type a note..."}
            className="w-full p-4 bg-[#0b0f14] border border-[var(--line)] rounded-xl text-lg text-white focus:border-[#10b981] outline-none min-h-[120px]"
          />
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <button 
          disabled={busy} 
          onClick={handleComplete}
          className="demo-task-poora-btn w-full h-16 bg-gradient-to-r from-[#10b981] to-[#059669] text-white text-xl font-black rounded-2xl shadow-[0_4px_20px_rgba(16,185,129,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
          {busy ? t("field.wait") || "Wait..." : t("field.completeTask") || "COMPLETE TASK"}
        </button>

        <button className="w-full py-4 bg-transparent border border-red-500/50 text-red-500 text-sm font-bold rounded-xl active:bg-red-950 transition-colors flex items-center justify-center gap-2">
          {t("field.reportProblem") || "Report a Problem"}
        </button>
      </div>
      
      <BottomNav role="FIELD_WORKER" />
    </div>
  );
}

import React from "react";
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("FieldView Error Boundary Caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black grid place-items-center text-white p-6 text-center">
          <div>
            <h1 className="text-xl font-bold text-red-500 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-400 mb-4">{this.state.error?.message}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#34d399] text-black font-bold rounded">Reload Page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function FieldView() {
  return (
    <ErrorBoundary>
      <FieldViewInner />
    </ErrorBoundary>
  );
}

