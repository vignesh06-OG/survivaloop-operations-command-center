"use client";
import { useState, useRef } from "react";
import { useTranslation } from "@/lib/i18n/I18nContext";

export interface PhotoUploadProps {
  entityType?: string;
  entityId?: string;
  onUploadComplete: (urls: string[]) => void;
  maxPhotos?: number;
}

export default function PhotoUpload({ entityType = "general", entityId = "unknown", onUploadComplete, maxPhotos = 3 }: PhotoUploadProps) {
  const { t, lang } = useTranslation();
  const [photos, setPhotos] = useState<{ url: string; progress: number; file: File; id: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const localizedError = lang === "hi" ? "Photo 5MB se chhoti honi chahiye" : "Photo must be less than 5MB";

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const newPhotos = Array.from(files);
    if (photos.length + newPhotos.length > maxPhotos) {
      setError(`Max ${maxPhotos} photos allowed.`);
      return;
    }

    const validPhotos = [];
    for (const file of newPhotos) {
      if (file.size > 5 * 1024 * 1024) {
        setError(localizedError);
        return;
      }
      validPhotos.push(file);
    }

    const items = validPhotos.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      url: URL.createObjectURL(file), // Client-side preview
      progress: 0
    }));

    setPhotos(prev => [...prev, ...items]);

    // Upload each file
    for (const item of items) {
      await uploadFile(item);
    }
  };

  const uploadFile = async (item: { id: string; file: File; url: string; progress: number }) => {
    try {
      const formData = new FormData();
      formData.append("image", item.file);
      formData.append("entityType", entityType);
      formData.append("entityId", entityId);

      // Simulate progress since fetch doesn't support upload progress natively easily without XHR
      const progressInterval = setInterval(() => {
        setPhotos(prev => prev.map(p => {
          if (p.id === item.id && p.progress < 90) return { ...p, progress: p.progress + 10 };
          return p;
        }));
      }, 200);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();

      if (data.isMock && data.base64) {
        // Fallback: save to localStorage/indexedDB for the demo
        try {
          localStorage.setItem(data.url, data.base64);
        } catch (e) {
          console.warn("Could not save to localStorage, maybe too big.");
        }
      }

      setPhotos(prev => {
        const next = prev.map(p => p.id === item.id ? { ...p, progress: 100, url: data.url } : p);
        onUploadComplete(next.filter(p => p.progress === 100).map(p => p.url));
        return next;
      });

    } catch (e) {
      console.error(e);
      setError("Upload failed");
      setPhotos(prev => prev.filter(p => p.id !== item.id));
    }
  };

  const handleDelete = (id: string) => {
    setPhotos(prev => {
      const next = prev.filter(p => p.id !== id);
      onUploadComplete(next.filter(p => p.progress === 100).map(p => p.url));
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {error && <div className="text-sm text-red-500 font-bold bg-red-950 p-2 rounded">{error}</div>}
      
      <div className="flex gap-3">
        <button 
          onClick={() => cameraInputRef.current?.click()}
          className="flex-1 py-4 bg-[#3b82f6] text-white text-lg font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform text-center shadow-lg"
        >
          <input 
            ref={cameraInputRef}
            type="file" 
            accept="image/*" 
            capture="environment" 
            className="hidden" 
            onChange={(e) => handleFiles(e.target.files)} 
          />
          📷 Camera Se Lo
        </button>
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-4 bg-[#1e293b] border border-[var(--line)] text-white text-lg font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-transform text-center"
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*" 
            multiple
            className="hidden" 
            onChange={(e) => handleFiles(e.target.files)} 
          />
          🖼️ Gallery Se Chuno
        </button>
      </div>
      
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {photos.map((p) => (
            <div key={p.id} className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden border-2 border-[var(--line)]">
              <img src={p.url} alt="upload preview" className="w-full h-full object-cover" />
              
              {p.progress < 100 && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                  <div className="w-16 h-2 bg-gray-700 rounded overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${p.progress}%` }}></div>
                  </div>
                  <span className="text-[10px] text-white mt-1 font-bold">{p.progress}%</span>
                </div>
              )}
              
              {p.progress === 100 && (
                <button 
                  onClick={() => handleDelete(p.id)} 
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      
      {photos.some(p => p.url.startsWith("mock://")) && (
        <div className="text-[10px] text-[var(--muted)] text-center">
          Demo mode: photos stored locally
        </div>
      )}
    </div>
  );
}
