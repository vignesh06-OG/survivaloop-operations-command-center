"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/I18nContext";
import type { AiResponse } from "@/lib/ai/provider";
import type { TaskView } from "./TaskPipeline";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Structured AI payload (only on assistant messages). */
  aiPayload?: AiResponse;
  ts: number;
}

interface Props {
  task: TaskView;
  onRefresh: () => void;
  onClose: () => void;
}

/**
 * FieldAssistant — Task-aware AI conversational UI for field workers.
 *
 * Renders inline in the task detail view. Mobile-first, thumb-friendly.
 * Uses the existing i18n system for all UI chrome.
 *
 * SAFETY INVARIANTS:
 *   - The assistant NEVER submits proof or mutates task state directly.
 *   - Draft reports require explicit "Review → Confirm" before submission.
 *   - All AI text is visually distinguished from system data.
 *   - Photos are treated as untrusted input and go through the normal /api/proof flow.
 */
export default function FieldAssistant({ task, onRefresh, onClose }: Props) {
  const { t, lang } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadedRefs, setUploadedRefs] = useState<string[]>([]);
  const [showDraftReview, setShowDraftReview] = useState<Message | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Send initial greeting on mount
  useEffect(() => {
    sendToAi([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToAi = useCallback(async (history: Message[]) => {
    setSending(true);
    try {
      const chatHistory = history.map((m) => ({
        role: m.role,
        content: m.content,
        ts: m.ts,
      }));

      const res = await api<{ response: AiResponse }>("/api/ai/chat", {
        method: "POST",
        body: {
          taskId: task.id,
          history: chatHistory,
          locale: lang,
        },
      });

      const aiMsg: Message = {
        id: "ai_" + Date.now(),
        role: "assistant",
        content: res.response.kind === "text"
          ? res.response.text
          : res.response.kind === "request_upload"
            ? res.response.prompt
            : res.response.kind === "draft_report"
              ? res.response.summary
              : "[Unsupported AI response in FieldAssistant]",
        aiPayload: res.response,
        ts: Date.now(),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      const errMsg: Message = {
        id: "err_" + Date.now(),
        role: "assistant",
        content: (e as Error).message || "Connection error.",
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setSending(false);
    }
  }, [task.id, lang]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: Message = {
      id: "user_" + Date.now(),
      role: "user",
      content: text,
      ts: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    await sendToAi(newHistory);
  }, [input, sending, messages, sendToAi]);

  const handleUpload = useCallback((file: File) => {
    // Simulate photo capture (in production this would use Camera API / file input -> S3)
    const ref = "ipfs://field_photo_" + Date.now() + "_" + file.name;
    setUploadedRefs((prev) => [...prev, ref]);

    const userMsg: Message = {
      id: "user_" + Date.now(),
      role: "user",
      content: `📷 Photo uploaded: ${file.name}`,
      ts: Date.now(),
    };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    sendToAi(newHistory);
  }, [messages, sendToAi]);

  const handleSubmitProof = useCallback(async (draft: { note: string; photoRefs: string[]; location: { lat: number; lng: number } | null }) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Use the standard proof API — same path as EvidenceCaptureForm.
      await api("/api/proof", {
        method: "POST",
        body: {
          taskId: task.id,
          submissionId: "ai_" + Date.now().toString(),
          claimedAt: Date.now(),
          location: draft.location ?? { lat: 12.97, lng: 77.39 },
          photoRefs: uploadedRefs.length > 0 ? uploadedRefs : draft.photoRefs,
          note: draft.note,
        },
      });
      // Also transition state to PROOF_SUBMITTED via the existing validated endpoint.
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: { to: "PROOF_SUBMITTED" } });
      await onRefresh();
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [task.id, uploadedRefs, onRefresh, onClose]);

  // Draft review modal
  if (showDraftReview && showDraftReview.aiPayload?.kind === "draft_report") {
    const draft = showDraftReview.aiPayload.draft;
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
        <div className="w-full max-w-md bg-[#0b0f14] border-t border-[var(--line)] rounded-t-2xl p-5 max-h-[80vh] overflow-y-auto animate-slide-up">
          <h2 className="text-lg font-bold text-[#34d399] mb-3">{t("ai.draftTitle")}</h2>

          <div className="bg-[#121820] border border-[var(--line)] rounded-xl p-4 mb-4">
            <div className="text-xs text-[var(--muted)] mb-1 uppercase tracking-wider">{t("ai.draftNotes")}</div>
            <p className="text-sm text-[#e6edf3] whitespace-pre-wrap">{draft.note}</p>
          </div>

          <div className="bg-[#121820] border border-[var(--line)] rounded-xl p-4 mb-4">
            <div className="text-xs text-[var(--muted)] mb-1 uppercase tracking-wider">{t("ai.draftPhotos")}</div>
            <div className="text-sm text-[#e6edf3]">
              {(uploadedRefs.length > 0 ? uploadedRefs : draft.photoRefs).map((r, i) => (
                <div key={i} className="text-xs text-[#60a5fa] truncate">📷 {r}</div>
              ))}
            </div>
          </div>

          {/* AI provenance notice */}
          <div className="text-[10px] text-[var(--muted)] mb-4 flex items-start gap-1.5 p-2 bg-yellow-950/20 border border-yellow-900/50 rounded-lg">
            <span>⚠️</span>
            <span>This draft was generated by AI and may contain inaccuracies. Review carefully before submitting.</span>
          </div>

          {submitError && (
            <div className="p-3 mb-4 rounded-lg bg-red-950/50 border border-red-900 text-red-300 text-sm">{submitError}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setShowDraftReview(null)}
              className="flex-1 py-3 rounded-xl font-bold border border-[var(--line)] text-[var(--muted)] active:scale-95 transition-transform"
            >
              {t("ai.cancel")}
            </button>
            <button
              disabled={submitting}
              onClick={() => handleSubmitProof(draft)}
              className="flex-1 py-3 rounded-xl font-bold bg-[#10b981] text-white active:scale-95 transition-transform shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              {submitting ? t("field.uploading") : t("ai.submitDraft")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--line)] bg-[#0b0f14] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="font-bold text-sm text-[#34d399]">{t("ai.assistantTitle")}</h3>
        </div>
        <button onClick={onClose} className="text-xs text-[var(--muted)] p-2">✕</button>
      </div>

      {/* System notice */}
      <div className="px-4 py-2 text-[10px] text-[var(--muted)] bg-[#121820]/50 border-b border-[var(--line)]">
        {t("ai.sysMessage")}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-[#0ea5e9] text-white rounded-ee-md"
                : "bg-[#1a232f] text-[#e6edf3] border border-[var(--line)] rounded-es-md"
            }`}>
              {msg.role === "assistant" && (
                <div className="text-[9px] text-[#fbbf24] font-bold mb-1 uppercase tracking-wider">AI Suggestion</div>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Interactive elements for AI responses */}
              {msg.aiPayload?.kind === "request_upload" && (
                <label className="mt-3 w-full py-2.5 rounded-xl bg-[#0ea5e9] text-white font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2 cursor-pointer">
                  <span>📷</span> {t("ai.btnUpload")}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleUpload(e.target.files[0]);
                      }
                    }} 
                  />
                </label>
              )}

              {msg.aiPayload?.kind === "draft_report" && (
                <button
                  onClick={() => setShowDraftReview(msg)}
                  className="mt-3 w-full py-2.5 rounded-xl bg-[#10b981] text-white font-bold text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  <span>📋</span> {t("ai.reviewDraft")}
                </button>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-[#1a232f] border border-[var(--line)] rounded-2xl rounded-bl-md px-4 py-3 text-sm text-[var(--muted)]">
              <div className="flex gap-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-3 py-3 border-t border-[var(--line)] bg-[#0b0f14] flex items-center gap-2 shrink-0">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t("ai.typeMessage")}
          className="flex-1 bg-[#121820] border border-[var(--line)] rounded-xl px-4 py-3 text-sm focus:border-[#34d399] outline-none transition-colors"
          disabled={sending}
          aria-label={t("ai.typeMessage")}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="p-3 rounded-xl bg-[#0ea5e9] text-white font-bold active:scale-95 transition-transform disabled:opacity-40"
          aria-label={t("ai.send")}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
