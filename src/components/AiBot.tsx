"use client";
import React, { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n/I18nContext";
import PhotoUpload from "./PhotoUpload";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  image?: string;
  ts: number;
  isAiResponseObject?: boolean;
  responseData?: any;
};

export default function AiBot() {
  const { t, lang, speechCode } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Complaint tracking state
  const [pendingComplaint, setPendingComplaint] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "sys_1",
          role: "assistant",
          content: lang === "hi" 
            ? "नमस्ते! मैं आपका एआई फील्ड असिस्टेंट हूँ। आप बोलकर शिकायत दर्ज कर सकते हैं या किसी पेड़ की फोटो डालकर उसकी बीमारी जाँच सकते हैं।" 
            : "Hello! I am your AI Field Assistant. You can speak to register a complaint or upload a tree photo to check its health.",
          ts: Date.now()
        }
      ]);
    }
  }, [isOpen, messages.length, lang]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined" && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
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
        setInputText(transcript);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => {
        setIsListening(false);
        // We do not auto-submit on end because user might pause, they can press send.
      };

      recognitionRef.current = recognition;
    }
  }, [lang]);

  const toggleListen = () => {
    if (typeof window === "undefined" || !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert("Voice dictation requires Google Chrome or a Chromium-based browser.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setInputText("");
      recognitionRef.current?.start();
    }
  };

  const handleSend = async (overrideText?: string, imageBase64?: string) => {
    const textToSend = overrideText || inputText.trim();
    if (!textToSend && !imageBase64) return;
    
    setInputText("");
    if (isListening) recognitionRef.current?.stop();

    const userMsg: ChatMessage = {
      id: "u_" + Date.now(),
      role: "user",
      content: textToSend || "Analyze this image.",
      image: imageBase64,
      ts: Date.now()
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsProcessing(true);

    try {
      const res = await api("/api/ai/chat", {
        method: "POST",
        body: {
          history: newHistory.filter(m => !m.isAiResponseObject).map(m => ({ role: m.role, content: m.content, image: m.image, ts: m.ts })),
          locale: lang
        }
      });

      const data = (res as any).response;
      
      let assistantMsg: ChatMessage = {
        id: "a_" + Date.now(),
        role: "assistant",
        content: "",
        ts: Date.now()
      };

      if (data.kind === "text") {
        assistantMsg.content = data.text;
      } else if (data.kind === "intent") {
        assistantMsg.content = data.replyText;
        if (data.intent === "COMPLAINT" && data.extractedComplaint) {
          setPendingComplaint(data.extractedComplaint);
          assistantMsg.content += `\n\n[Complaint Captured: ${data.extractedComplaint.category}] - Would you like to attach a photo?`;
        }
      } else if (data.kind === "tree_health") {
        assistantMsg.content = "Tree Health Analysis Complete";
        assistantMsg.isAiResponseObject = true;
        assistantMsg.responseData = data;
      } else {
        assistantMsg.content = "[Unsupported AI format]";
      }

      setMessages(prev => [...prev, assistantMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: "err_" + Date.now(), role: "system", content: "Error: Could not reach AI.", ts: Date.now() }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotosUploaded = async (urls: string[]) => {
    if (urls.length === 0) return;
    
    if (pendingComplaint) {
      const url = urls[0];
      try {
        setIsProcessing(true);
        await fetch("/api/evidence", {
          method: "POST",
          body: JSON.stringify({
            entityLevel: "cluster",
            entityId: pendingComplaint.category, // Mock
            type: "CITIZEN_REPORT",
            payload: JSON.stringify(pendingComplaint),
            workerId: "citizen_001",
            location: { lat: 0, lng: 0 },
            photoRefs: [url],
          })
        });
        
        setMessages(prev => [...prev, {
          id: "sys_ok", role: "assistant", 
          content: lang === "hi" ? "आपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। संदर्भ संख्या: CMP-2026-X" : "Your complaint has been successfully registered. Reference #CMP-2026-X", 
          ts: Date.now()
        }]);
        setPendingComplaint(null);
      } catch (e) {
        // error handling
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Tree health check flow
    const url = urls[0];
    // In mock mode, we fallback to localStorage base64 for vision API.
    // If we have a true url, we can pass it, but for our backend OpenAI provider, it expects base64 or URL.
    // Let's pass the URL.
    let imageData = url;
    if (url.startsWith("mock://")) {
      imageData = localStorage.getItem(url) || url;
    }
    handleSend("Please analyze the health of this tree.", imageData);
  };

  const submitComplaint = async (file?: File) => {
    // Submit to /api/evidence
    setIsProcessing(true);
    try {
      let photoUrl = "https://example.com/mock-citizen-report.jpg";
      if (file) {
        // mock upload for now
      }
      
      await api("/api/evidence", {
        method: "POST",
        body: {
          entityLevel: "ZONE", 
          entityId: "z1", // Global bot assigns to root for now
          photoUrl: photoUrl,
          type: "CITIZEN_REPORT",
          locationJson: JSON.stringify({ lat: 0, lng: 0 }),
          note: `[Citizen Complaint] ${pendingComplaint.category}: ${pendingComplaint.description}`,
          verificationStatus: "PENDING"
        }
      });
      
      setMessages(prev => [...prev, {
        id: "sys_ok", role: "assistant", 
        content: lang === "hi" ? "आपकी शिकायत सफलतापूर्वक दर्ज कर ली गई है। संदर्भ संख्या: CMP-2026-X" : "Your complaint has been successfully registered. Reference #CMP-2026-X", 
        ts: Date.now()
      }]);
      setPendingComplaint(null);
    } catch (e) {
      setMessages(prev => [...prev, { id: "sys_err", role: "system", content: "Error registering complaint.", ts: Date.now() }]);
    }
    setIsProcessing(false);
  };

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] shadow-[0_4px_20px_rgba(16,185,129,0.5)] flex items-center justify-center text-3xl hover:scale-105 transition-transform z-50 border-2 border-white/20"
        >
          🌳
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[380px] h-[550px] bg-[#0b0f14] border border-[#2d3b4a] rounded-2xl shadow-2xl flex flex-col overflow-hidden z-50">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-[#121820] to-[#1a232f] border-b border-[var(--line)] flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-xl shadow-lg">
                🤖
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">SurvivaLoop Assistant</h3>
                <p className="text-[10px] text-[#10b981] font-bold tracking-wider uppercase">Voice & Vision AI</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-[var(--muted)] hover:text-white p-2">✕</button>
          </div>

          {/* Quick Actions */}
          <div className="px-4 py-2 bg-[#121820] border-b border-[var(--line)] flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
            <button onClick={() => setMessages(prev => [...prev, {id: "t_"+Date.now(), role: "system", content: "To check tree health, please upload a photo using the + button below.", ts: Date.now()}])} className="px-3 py-1.5 bg-[#1a232f] border border-[var(--line)] rounded-full text-xs text-[var(--muted)] hover:text-white hover:border-[#10b981] transition-colors">
              🌳 Tree Health
            </button>
            <button onClick={() => handleSend("I want to register a complaint.")} className="px-3 py-1.5 bg-[#1a232f] border border-[var(--line)] rounded-full text-xs text-[var(--muted)] hover:text-white hover:border-[#10b981] transition-colors">
              📝 Complaint
            </button>
            <button onClick={() => handleSend("Where are my tasks?")} className="px-3 py-1.5 bg-[#1a232f] border border-[var(--line)] rounded-full text-xs text-[var(--muted)] hover:text-white hover:border-[#10b981] transition-colors">
              📋 My Tasks
            </button>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0b0f14]">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 text-sm ${msg.role === "user" ? "bg-[#3b82f6] text-white rounded-tr-sm" : msg.role === "system" ? "bg-red-900/20 text-red-400 border border-red-900/50 rounded-tl-sm w-full text-center text-xs" : "bg-[#1a232f] text-gray-200 border border-[var(--line)] rounded-tl-sm"}`}>
                  {msg.image && <img src={msg.image} alt="upload" className="w-full h-32 object-cover rounded-lg mb-2" />}
                  {msg.content}
                  
                  {msg.isAiResponseObject && msg.responseData?.kind === "tree_health" && (
                    <div className="mt-3 p-3 bg-[#0b0f14] rounded-lg border border-[var(--line)]">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="relative w-12 h-12 rounded-full border-4 border-[#1a232f] flex items-center justify-center font-bold" style={{ borderColor: msg.responseData.healthScore > 60 ? '#10b981' : msg.responseData.healthScore > 30 ? '#eab308' : '#ef4444' }}>
                          {msg.responseData.healthScore}
                        </div>
                        <div>
                          <div className={`font-bold ${msg.responseData.healthScore > 60 ? 'text-[#10b981]' : msg.responseData.healthScore > 30 ? 'text-[#eab308]' : 'text-[#ef4444]'}`}>{msg.responseData.status}</div>
                          <div className="text-[10px] text-[var(--muted)]">{msg.responseData.speciesGuess}</div>
                        </div>
                      </div>
                      <div className="text-xs space-y-1 mb-2">
                        <div className="font-bold text-[var(--muted)]">Issues:</div>
                        {msg.responseData.issues.map((iss: string, i: number) => <div key={i}>• {iss}</div>)}
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="font-bold text-[var(--muted)]">Recommendations:</div>
                        {msg.responseData.recommendations.map((rec: string, i: number) => <div key={i}>• {rec}</div>)}
                      </div>
                    </div>
                  )}

                  {pendingComplaint && msg.id === messages[messages.length - 1].id && msg.role === "assistant" && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => submitComplaint()} className="flex-1 py-2 bg-[#1a232f] rounded border border-[var(--line)] text-xs hover:bg-[#3b82f6]/20 transition-colors">Skip Photo</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-start">
                <div className="bg-[#1a232f] border border-[var(--line)] rounded-2xl rounded-tl-sm p-4 flex gap-1 items-center">
                  <div className="w-2 h-2 rounded-full bg-[#10b981] animate-bounce"></div>
                  <div className="w-2 h-2 rounded-full bg-[#10b981] animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 rounded-full bg-[#10b981] animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-[#121820] border-t border-[var(--line)] flex items-center gap-2 relative">
            <PhotoUpload entityType="citizen" onUploadComplete={handlePhotosUploaded} maxPhotos={1} />
            
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder={isListening ? "Listening..." : "Type or speak..."}
              className="flex-1 bg-transparent border-none text-sm text-white outline-none px-2 placeholder-[var(--muted)]"
            />
            
            {!inputText && (
              <button 
                onClick={toggleListen}
                className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-xl transition-all shadow-lg ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-gradient-to-br from-[#3b82f6] to-[#2563eb] text-white hover:scale-105'}`}
              >
                🎤
              </button>
            )}
            
            {inputText && (
              <button 
                onClick={() => handleSend()}
                className="w-10 h-10 rounded-full bg-[#10b981] flex items-center justify-center text-white hover:bg-[#059669] transition-colors"
              >
                ➤
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
