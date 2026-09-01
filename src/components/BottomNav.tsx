"use client";
import React, { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/I18nContext";

interface BottomNavProps {
  role: "FIELD_WORKER" | "SUPERVISOR";
  expiredCount?: number;
}

export default function BottomNav({ role, expiredCount = 0 }: BottomNavProps) {
  const { t } = useTranslation();
  const [isBotOpen, setIsBotOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const handleBotChange = (e: any) => {
      setIsBotOpen(e.detail?.isOpen ?? false);
    };
    window.addEventListener("bot-state-change", handleBotChange);
    return () => window.removeEventListener("bot-state-change", handleBotChange);
  }, []);

  type TabDef = {
    icon: string;
    label: string;
    onClick?: () => void;
    badge?: number;
  };

  // Field Worker tabs
  const fwTabs: TabDef[] = [
    { icon: "🏠", label: "Home" }, // t("nav.home")
    { icon: "📋", label: "My Tasks" },
    { icon: "🤖", label: "AI Bot", onClick: () => {
        // Trigger bot to open by simulating click on floating widget or dispatching event
        // In our case, the floating widget listens to clicks, but we can't easily click it if we don't have its ref.
        // We'll dispatch OPEN_BOT via demo-action to reuse existing logic!
        window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "OPEN_BOT" } }));
      } 
    },
    { icon: "📊", label: "Stats" },
    { icon: "👤", label: "Profile" },
  ];

  // Supervisor tabs
  const supTabs: TabDef[] = [
    { icon: "🗺️", label: "Map" },
    { icon: "📋", label: "Queue" },
    { icon: "🤖", label: "AI Bot", onClick: () => {
        window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "OPEN_BOT" } }));
      }
    },
    { icon: "🔔", label: "Alerts", badge: expiredCount },
    { icon: "⚙️", label: "Settings" },
  ];

  const tabs = role === "FIELD_WORKER" ? fwTabs : supTabs;

  return (
    <div 
      className={`fixed bottom-0 left-0 right-0 bg-[#121820] border-t border-[#2d3b4a] z-[40] transition-transform duration-300 md:hidden ${isBotOpen ? "translate-y-full" : "translate-y-0"}`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab, idx) => (
          <button
            key={idx}
            onClick={() => {
              setActiveTab(idx);
              if (tab.onClick) tab.onClick();
            }}
            className={`flex flex-col items-center justify-center w-full h-full relative ${activeTab === idx ? "text-[#10b981]" : "text-[var(--muted)] hover:text-white"}`}
          >
            <span className={`text-xl mb-1 ${activeTab === idx ? "drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : ""}`}>
              {tab.icon}
            </span>
            <span className="text-[10px] font-bold">{tab.label}</span>
            
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="absolute top-2 right-[20%] bg-[#ef4444] text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.6)]">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
