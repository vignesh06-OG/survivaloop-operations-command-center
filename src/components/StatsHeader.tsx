"use client";
import React, { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/I18nContext";

function Counter({ end, suffix = "", prefix = "" }: { end: number; suffix?: string; prefix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1500;
    const increment = end / (duration / 16);
    
    if (end === 0) {
      setCount(0);
      return;
    }

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [end]);

  return <span>{prefix}{count}{suffix}</span>;
}

export default function StatsHeader({ oversight }: { oversight: any }) {
  const { t } = useTranslation();
  
  if (!oversight) {
    return (
      <div className="w-full bg-[#0b0f14] p-4 border-b border-[var(--line)] animate-pulse h-[100px] flex gap-4">
        {[1,2,3,4,5].map(i => <div key={i} className="flex-1 bg-[#1a232f] rounded-xl"></div>)}
      </div>
    );
  }

  const { totalTrees = 0, criticalCount = 0, completedToday = 0, avgResponseTime = "0h 0m", loopsClosed = 0 } = oversight;

  return (
    <div className="w-full bg-[#0b0f14] p-4 border-b border-[var(--line)]">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 max-w-[1600px] mx-auto">
        
        {/* Card 1: Total Trees */}
        <div className="bg-[#121820] border border-[#2d3b4a] rounded-xl p-4 flex flex-col justify-between hover:border-[#10b981] transition-colors relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-4xl">🌳</div>
          <div className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mb-2">Total Trees</div>
          <div className="text-3xl font-black text-white">
            <Counter end={totalTrees} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">Monitored entities</div>
        </div>

        {/* Card 2: Critical */}
        <div className={`bg-[#121820] border ${criticalCount > 0 ? 'border-[#ef4444] shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#2d3b4a]'} rounded-xl p-4 flex flex-col justify-between transition-colors relative overflow-hidden group`}>
          <div className={`absolute top-0 right-0 p-2 ${criticalCount > 0 ? 'opacity-20 text-[#ef4444] animate-pulse' : 'opacity-10 text-[var(--muted)]'} text-4xl`}>🔴</div>
          <div className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mb-2">Critical</div>
          <div className={`text-3xl font-black ${criticalCount > 0 ? 'text-[#ef4444]' : 'text-white'}`}>
            <Counter end={criticalCount} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">Urgent attention needed</div>
        </div>

        {/* Card 3: Completed Today */}
        <div className="bg-[#121820] border border-[#2d3b4a] rounded-xl p-4 flex flex-col justify-between hover:border-[#10b981] transition-colors relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-4xl text-[#10b981]">✅</div>
          <div className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mb-2">Completed Today</div>
          <div className="text-3xl font-black text-[#10b981] flex items-center gap-2">
            <Counter end={completedToday} />
            <span className="text-sm">↑</span>
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">Interventions done</div>
        </div>

        {/* Card 4: Avg Response Time */}
        <div className="bg-[#121820] border border-[#2d3b4a] rounded-xl p-4 flex flex-col justify-between hover:border-[#3b82f6] transition-colors relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-4xl text-[#3b82f6]">⏱️</div>
          <div className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mb-2">Avg Response Time</div>
          <div className="text-3xl font-black text-[#3b82f6]">
            {avgResponseTime}
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">Evidence to Dispatch</div>
        </div>

        {/* Card 5: Loops Closed */}
        <div className="bg-[#121820] border border-[#2d3b4a] rounded-xl p-4 flex flex-col justify-between hover:border-[#10b981] transition-colors relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity text-4xl text-[#10b981]">🔄</div>
          <div className="text-xs text-[var(--muted)] font-bold uppercase tracking-wider mb-2">Loops Closed</div>
          <div className="text-3xl font-black text-[#10b981]">
            <Counter end={loopsClosed} />
          </div>
          <div className="text-[10px] text-[var(--muted)] mt-1">Biological outcomes</div>
        </div>

      </div>
    </div>
  );
}
