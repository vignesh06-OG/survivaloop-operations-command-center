"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import Login from "./Login";
import { FALLBACK_TASK_COLOR } from "@/lib/present";
import type { TaskView } from "./TaskPipeline";
import { useTranslation } from "@/lib/i18n/I18nContext";
import PhotoUpload from "./PhotoUpload";
import BottomNav from "./BottomNav";

interface Me { id: string; name: string; email: string; role: string; orgId: string; dataMode: string }

export default function FieldView() {
  const { t, lang, speechCode } = useTranslation();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const m = await api<{ user: Me | null }>("/api/auth/me");
      if (!m.user) { setMe(null); setLoading(false); return; }
      if (m.user.role !== "FIELD_WORKER") { window.location.href = "/"; return; }
      setMe(m.user);
      
      const ts = await api<TaskView[]>("/api/tasks");
      // Filter out finished tasks from the queue for simplicity
      const activeTasks = ts.filter(t => !["PROOF_SUBMITTED", "VERIFIED", "REJECTED", "EXPIRED", "CANCELLED"].includes(t.state));
      // Sort by creation time (or SLA)
      setTasks(activeTasks.sort((a, b) => b.created_at - a.created_at));
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
    <div className="min-h-screen bg-black text-[#e6edf3] flex flex-col max-w-md mx-auto">
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
            <div className="text-sm font-bold text-[#34d399]">{tasks.length} tasks aaj</div>
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
      
      {/* TASK CARD OR EMPTY STATE */}
      <div className="flex-1 flex flex-col p-4">
        {!activeTask ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
            <div className="text-6xl animate-bounce">🎉</div>
            <h2 className="text-2xl font-bold text-[#34d399]">Aaj ke saare task ho gaye!</h2>
            <p className="text-xl text-[var(--muted)]">Ghar jao!</p>
          </div>
        ) : (
          <TaskCard task={activeTask} onNext={() => refresh()} lang={lang} isOnline={isOnline} />
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, onNext, lang, isOnline }: { task: TaskView; onNext: () => void; lang: string; isOnline: boolean }) {
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

  // Derive task icon based on intervention class
  const getIcon = (ic: string) => {
    if (ic.includes("WATER")) return "💧";
    if (ic.includes("INSPECT")) return "🔍";
    if (ic.includes("PRUNE") || ic.includes("REPAIR")) return "🛠️";
    if (ic.includes("PLANT")) return "🌱";
    return "📋";
  };
  const icon = getIcon(task.intervention_class_id);
  const distance = Math.floor(Math.random() * 800) + 100; // Mock distance for UI
  
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
      alert("Voice dictation requires Google Chrome or a Chromium-based browser.");
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
        {error && <div className="p-4 bg-red-900 border border-red-500 rounded-xl mb-4 text-white text-lg">{error}</div>}
        
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 p-4">
          <div className="text-8xl">{icon}</div>
          <h2 className="text-4xl font-black text-white leading-tight">{task.entity_id}</h2>
          <div className="text-2xl text-[#34d399] font-bold">{distance}m door</div>
          
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1a232f] rounded-full border border-[var(--line)]">
            <div className={`w-4 h-4 rounded-full ${task.sla_state === 'NORMAL' ? 'bg-[#10b981]' : 'bg-[#ef4444] animate-pulse'}`}></div>
            <span className="text-lg font-bold text-white uppercase">{task.sla_state}</span>
          </div>

          <a 
            href={`https://maps.google.com/?q=12.97,77.39`} 
            target="_blank" 
            className="flex items-center justify-center gap-3 w-full py-4 bg-[#2563eb] text-white text-xl font-bold rounded-2xl active:scale-95 transition-transform mt-4"
          >
            {t("field.rastaDekho")}
          </a>
        </div>

        <button 
          disabled={busy} 
          onClick={() => handleTransition("IN_PROGRESS")}
          className="demo-shuru-karo-btn w-full h-20 bg-[#10b981] text-white text-2xl font-black rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.4)] active:bg-[#059669] transition-colors mt-auto flex items-center justify-center gap-3"
        >
          {busy ? t("field.rukiye") : t("field.shuruKaro")}
        </button>
      </div>
    );
  }

  // Active View (IN_PROGRESS) -> Evidence gathering
  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {error && <div className="p-4 bg-red-900 border border-red-500 rounded-xl mb-4 text-white text-lg">{error}</div>}
      
      <div className="flex items-center justify-between mb-6 bg-[#1a232f] p-4 rounded-xl border border-[var(--line)]">
        <div>
          <h2 className="text-2xl font-black text-white">{task.entity_id}</h2>
          <div className="text-lg text-[#34d399] font-bold flex items-center gap-1">
            <span className="animate-pulse">📍</span> GPS locked
          </div>
        </div>
        <div className="text-4xl">{icon}</div>
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
            {isListening ? t("field.sunRaha") : t("field.bolkeNote")}
          </button>
          
          <textarea 
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("field.typeYahan")}
            className="w-full p-4 bg-[#0b0f14] border border-[var(--line)] rounded-xl text-lg text-white focus:border-[#10b981] outline-none min-h-[120px]"
          />
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <button 
          disabled={busy} 
          onClick={handleComplete}
          className="demo-task-poora-btn w-full h-20 bg-[#10b981] text-white text-2xl font-black rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.4)] active:bg-[#059669] transition-colors flex items-center justify-center gap-3"
        >
          {busy ? t("field.rukiye") : t("field.taskPoora")}
        </button>

        <button className="w-full py-4 bg-transparent border border-red-500/50 text-red-500 text-lg font-bold rounded-2xl active:bg-red-950 transition-colors flex items-center justify-center gap-2">
          {t("field.problemReport")}
        </button>
      </div>
      
      <BottomNav role="FIELD_WORKER" />
    </div>
  );
}
