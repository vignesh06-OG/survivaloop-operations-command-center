"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

type DemoState = "IDLE" | "PLAYING" | "PAUSED";

const DEMO_STEPS = [
  {
    id: "login",
    start: 0,
    end: 20000,
    text: "Welcome to SurvivaLoop — India's capacity-aware tree survival system",
    action: async () => {
      // Navigate to root to ensure we're at login or command center
      if (window.location.pathname !== "/") {
        window.location.href = "/";
        return;
      }
      // Wait a moment, then log in as Supervisor
      setTimeout(async () => {
        try {
          await api("/api/auth/demo/SUPERVISOR", { method: "POST" });
          window.location.reload();
        } catch (e) {}
      }, 5000);
    },
  },
  {
    id: "map",
    start: 20000,
    end: 50000,
    text: "2,000 trees planted. 400 showing distress signals today.",
    action: () => {
      window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "MAP_PAN" } }));
    },
  },
  {
    id: "decision",
    start: 50000,
    end: 80000,
    text: "System assessed evidence, checked capacity (3 tankers, 8 workers), and decided: 80 trees get water TODAY, 50 get inspected, 270 deferred.",
    action: () => {
      window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "SELECT_ENTITY", id: "c1" } }));
    },
  },
  {
    id: "queue",
    start: 80000,
    end: 110000,
    text: "Tasks have strict SLAs. Expired tasks auto-escalate to supervisors.",
    action: () => {
      window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "SCROLL_QUEUE" } }));
    },
  },
  {
    id: "field",
    start: 110000,
    end: 140000,
    text: "Field worker completes task in 30 seconds. No typing needed. Works offline.",
    action: async () => {
      // Login as field worker
      if (window.location.pathname !== "/field") {
        await api("/api/auth/demo/FIELD_WORKER", { method: "POST" });
        window.location.href = "/field";
      } else {
        window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "FIELD_TASK" } }));
      }
    },
  },
  {
    id: "ai",
    start: 140000,
    end: 170000,
    text: "AI bot enables citizens and workers to report issues by voice, in any Indian language.",
    action: () => {
      window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "OPEN_BOT" } }));
    },
  },
  {
    id: "adapt",
    start: 170000,
    end: 190000,
    text: "45 days later: tree survived. Full loop closed. System learns and adapts.",
    action: async () => {
      if (window.location.pathname !== "/") {
        await api("/api/auth/demo/SUPERVISOR", { method: "POST" });
        window.location.href = "/";
      } else {
        window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "RECORD_OUTCOME", id: "c1" } }));
      }
    },
  },
  {
    id: "final",
    start: 190000,
    end: 200000,
    text: "SurvivaLoop: Not just monitoring. Decision-making under scarcity.\nTeam: AgniVega",
    action: () => {
      window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "ZOOM_OUT" } }));
    },
  },
];

const TOTAL_DURATION = 200000;

export default function AutoDemo() {
  const [state, setState] = useState<DemoState>("IDLE");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTimeRef = useRef<number>(0);
  const currentStepIdRef = useRef<string | null>(null);

  // Effect to handle the loop
  useEffect(() => {
    if (state === "PLAYING") {
      lastTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const now = Date.now();
          const delta = now - lastTimeRef.current;
          lastTimeRef.current = now;
          const newElapsed = prev + delta;
          if (newElapsed >= TOTAL_DURATION) {
            setState("IDLE");
            return 0;
          }
          return newElapsed;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state]);

  // Handle step transitions
  useEffect(() => {
    if (state !== "PLAYING") return;
    
    const activeStep = DEMO_STEPS.find((s) => elapsed >= s.start && elapsed < s.end);
    if (activeStep && currentStepIdRef.current !== activeStep.id) {
      currentStepIdRef.current = activeStep.id;
      activeStep.action();
    }
  }, [elapsed, state]);

  // Handle external persistence of demo state across page loads
  useEffect(() => {
    const saved = localStorage.getItem("demo_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.state === "PLAYING" && Date.now() - parsed.lastUpdated < 10000) {
          // Resume playing
          setElapsed(parsed.elapsed);
          setState("PLAYING");
        }
      } catch (e) {}
    }
  }, []);

  // Save state before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (state === "PLAYING") {
        localStorage.setItem("demo_state", JSON.stringify({ state, elapsed, lastUpdated: Date.now() }));
      } else {
        localStorage.removeItem("demo_state");
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [state, elapsed]);

  // Check if we are in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "1") {
    return null;
  }

  const activeStep = DEMO_STEPS.find((s) => elapsed >= s.start && elapsed < s.end);
  const progressPercent = (elapsed / TOTAL_DURATION) * 100;

  if (state === "IDLE") {
    return (
      <button
        onClick={() => { setState("PLAYING"); setElapsed(0); currentStepIdRef.current = null; }}
        className="fixed top-4 right-4 z-[9999] bg-[#10b981] text-black font-bold px-4 py-2 rounded-full shadow-[0_0_15px_#10b981] hover:scale-105 transition-transform flex items-center gap-2"
      >
        <span>▶️</span> Auto-Demo
      </button>
    );
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-[9998] flex flex-col justify-end pb-24">
      {/* Overlay Text */}
      {activeStep && (
        <div className="mx-auto max-w-3xl bg-black/80 border border-[#10b981]/50 text-white p-6 rounded-2xl shadow-2xl backdrop-blur-sm pointer-events-auto transition-all duration-500 ease-in-out text-center">
          <p className="text-xl md:text-2xl font-light leading-relaxed whitespace-pre-wrap">
            {activeStep.text}
          </p>
        </div>
      )}

      {/* Controls */}
      <div className="fixed top-4 right-4 flex items-center gap-3 bg-black/80 p-2 rounded-full border border-white/10 pointer-events-auto backdrop-blur-md">
        <button onClick={() => setState(state === "PLAYING" ? "PAUSED" : "PLAYING")} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg">
          {state === "PLAYING" ? "⏸️" : "▶️"}
        </button>
        <button onClick={() => {
          const next = DEMO_STEPS.find(s => s.start > elapsed);
          if (next) {
             setElapsed(next.start);
             currentStepIdRef.current = null;
          }
        }} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg" title="Skip to next section">
          ⏭️
        </button>
        <button onClick={() => { setState("IDLE"); setElapsed(0); localStorage.removeItem("demo_state"); }} className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 flex items-center justify-center text-lg">
          ❌
        </button>
      </div>

      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1.5 bg-black/50 z-[9999]">
        <div className="h-full bg-[#10b981] transition-all duration-100 ease-linear" style={{ width: `${progressPercent}%` }} />
      </div>
    </div>
  );
}
