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
  
  const [method, setMethod] = useState<"PHONE" | "EMAIL">("PHONE");
  const [step, setStep] = useState<"CREDENTIALS" | "OTP" | "ROLE">("CREDENTIALS");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  
  const handleOtpChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);
    if (val && index < 3) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === "PHONE" && phone.length < 10) return setError("Please enter a valid phone number");
    if (method === "EMAIL" && !email.includes("@")) return setError("Please enter a valid email");
    setError(null);
    if (method === "PHONE") {
      setStep("OTP");
    } else {
      setStep("ROLE");
    }
  };

  const submitOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.join("").length < 4) return setError("Please enter the 4-digit OTP");
    setError(null);
    setStep("ROLE");
  };

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

        {step === "CREDENTIALS" && (
          <div className="animate-fade-in">
            <div className="flex gap-2 p-1 bg-[#0a1628] rounded-xl mb-6 border border-[var(--line)]">
              <button 
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${method === "PHONE" ? 'bg-[#22c55e] text-black shadow-lg' : 'text-[var(--muted)] hover:text-white'}`}
                onClick={() => { setMethod("PHONE"); setError(null); }}
              >
                Phone
              </button>
              <button 
                className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${method === "EMAIL" ? 'bg-[#22c55e] text-black shadow-lg' : 'text-[var(--muted)] hover:text-white'}`}
                onClick={() => { setMethod("EMAIL"); setError(null); }}
              >
                Email
              </button>
            </div>

            <form onSubmit={submitCredentials} className="space-y-4">
              {method === "PHONE" ? (
                <div>
                  <label className="block text-xs font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Phone Number</label>
                  <div className="flex bg-[#0a1628] rounded-xl border border-[var(--line)] focus-within:border-[#22c55e] transition-colors overflow-hidden">
                    <span className="px-4 py-3 text-[var(--muted)] font-mono border-r border-[var(--line)] bg-[#050806]">+91</span>
                    <input 
                      type="tel" 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 bg-transparent px-4 py-3 text-white outline-none font-mono"
                      placeholder="99999 99999"
                      maxLength={10}
                      autoFocus
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-[var(--muted)] mb-1 uppercase tracking-wider">Email Address</label>
                  <input 
                    type="email" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#0a1628] border border-[var(--line)] rounded-xl px-4 py-3 text-white outline-none focus:border-[#22c55e] transition-colors"
                    placeholder="user@example.com"
                    autoFocus
                  />
                </div>
              )}
              
              <button type="submit" className="w-full py-3 bg-[#22c55e] hover:bg-[#16a34a] text-black font-black rounded-xl text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all hover:scale-[1.02] active:scale-95">
                Continue
              </button>
            </form>
          </div>
        )}

        {step === "OTP" && (
          <form onSubmit={submitOtp} className="animate-fade-in flex flex-col items-center">
            <h2 className="text-xl font-bold text-white mb-2">Verify Phone</h2>
            <p className="text-sm text-[var(--muted)] mb-6">Enter the 4-digit code sent to +91 {phone}</p>
            
            <div className="flex gap-3 mb-8">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  id={`otp-${i}`}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !digit && i > 0) {
                      document.getElementById(`otp-${i - 1}`)?.focus();
                    }
                  }}
                  className="w-14 h-14 text-center text-2xl font-black bg-[#0a1628] border-2 border-[var(--line)] rounded-xl text-white focus:border-[#22c55e] focus:bg-[#0f233f] outline-none transition-all shadow-inner"
                  autoFocus={i === 0}
                />
              ))}
            </div>

            <button type="submit" className="w-full py-3 bg-[#22c55e] hover:bg-[#16a34a] text-black font-black rounded-xl text-lg shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all hover:scale-[1.02] active:scale-95">
              Verify OTP
            </button>
            
            <button type="button" onClick={() => setStep("CREDENTIALS")} className="mt-4 text-sm text-[var(--muted)] hover:text-white transition-colors">
              Wrong number? Go back
            </button>
          </form>
        )}

        {step === "ROLE" && (
          <div className="animate-fade-in">
            <div className="text-center mb-6">
              <h2 className="text-xl font-bold text-white mb-1">Select Identity</h2>
              <p className="text-xs text-[var(--warn)] font-mono bg-[var(--warn)]/10 inline-block px-2 py-1 rounded">DEMO MODE ACTIVE</p>
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
              {t("demoNotice")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
