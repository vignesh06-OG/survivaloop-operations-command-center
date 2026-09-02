"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface ProfileModalProps {
  user: { name: string; city?: string; locality?: string; age?: number };
  onComplete: () => void;
}

export default function ProfileModal({ user, onComplete }: ProfileModalProps) {
  const [show, setShow] = useState(false);
  
  const [age, setAge] = useState(user.age ? String(user.age) : "");
  const [city, setCity] = useState(user.city || "");
  const [locality, setLocality] = useState(user.locality || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Show if they lack city/locality and haven't skipped yet
    const skipped = localStorage.getItem("profileSkipped");
    if (!user.city && !skipped) {
      setShow(true);
    }
  }, [user]);

  if (!show) return null;

  const handleSkip = () => {
    localStorage.setItem("profileSkipped", "true");
    setShow(false);
    onComplete();
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Demo Option A: store locally and skip API call to prevent blocking
      localStorage.setItem("profileSkipped", "true");
      localStorage.setItem("demoProfile", JSON.stringify({ age, city, locality }));
    } catch (err) {
      console.error(err);
    } finally {
      setShow(false);
      onComplete();
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-6 animate-fade-in backdrop-blur-sm">
      <div className="bg-[#0b0f14] border border-[#22c55e]/30 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#22c55e] to-emerald-900" />
        
        <button 
          onClick={handleSkip} 
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors text-xl font-bold"
          title="Close"
          type="button"
        >
          &times;
        </button>

        <h2 className="text-xl font-bold text-white mb-2 mt-2">Complete Profile</h2>
        <p className="text-sm text-[var(--muted)] mb-6">Earn points and track your rank on the leaderboard.</p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--muted)] mb-1 uppercase">Full Name</label>
            <input type="text" value={user.name} disabled className="w-full bg-[#050806] border border-[var(--line)] rounded-lg px-4 py-2 text-white/50" />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--muted)] mb-1 uppercase">Age (Optional)</label>
            <input 
              type="number" 
              value={age} 
              onChange={e => setAge(e.target.value)} 
              className="w-full bg-[#0a1628] border border-[var(--line)] rounded-lg px-4 py-2 text-white outline-none focus:border-[#22c55e]" 
              placeholder="e.g. 30"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--muted)] mb-1 uppercase">City (Optional)</label>
            <input 
              type="text" 
              value={city} 
              onChange={e => setCity(e.target.value)} 
              className="w-full bg-[#0a1628] border border-[var(--line)] rounded-lg px-4 py-2 text-white outline-none focus:border-[#22c55e]" 
              placeholder="e.g. Pune"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--muted)] mb-1 uppercase">Locality (Optional)</label>
            <input 
              type="text" 
              value={locality} 
              onChange={e => setLocality(e.target.value)} 
              className="w-full bg-[#0a1628] border border-[var(--line)] rounded-lg px-4 py-2 text-white outline-none focus:border-[#22c55e]" 
              placeholder="e.g. Riverside"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={handleSkip} 
              className="flex-1 py-3 bg-transparent border border-[var(--line)] hover:bg-[#1a232f] text-white rounded-xl text-sm transition-colors"
            >
              Skip for now
            </button>
            <button 
              type="submit" 
              disabled={busy}
              className="flex-1 py-3 bg-[#22c55e] hover:bg-[#16a34a] text-black font-bold rounded-xl text-sm shadow-[0_0_15px_rgba(34,197,94,0.3)] transition-all"
            >
              {busy ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
