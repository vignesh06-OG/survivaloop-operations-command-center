"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type LanguageCode = "en" | "hi" | "mr" | "bn" | "ta" | "te" | "kn" | "gu" | "pa" | "ml" | "or" | "as" | "ur";

export const LANGUAGES: { code: LanguageCode; name: string; nativeName: string }[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { code: "as", name: "Assamese", nativeName: "অসমীয়া" },
  { code: "ur", name: "Urdu", nativeName: "اردو" }
];

interface I18nContextType {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const rtlLanguages: LanguageCode[] = ["ur"];

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>("en");
  const [dict, setDict] = useState<Record<string, string>>({});
  const [enDict, setEnDict] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("survivaLoop_lang") as LanguageCode;
    if (saved && LANGUAGES.some(l => l.code === saved)) {
      setLangState(saved);
    }
  }, []);

  useEffect(() => {
    import(`./locales/en.json`).then(m => {
      setEnDict(m.default);
      if (lang === "en") setDict(m.default);
      setInitialized(true);
    }).catch(e => console.error("Failed to load base en.json", e));
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (lang === "en") {
      setDict(enDict);
    } else {
      import(`./locales/${lang}.json`)
        .then(m => setDict(m.default))
        .catch(e => {
          console.error(`Failed to load dictionary for ${lang}`, e);
          setDict(enDict); // fallback
        });
    }

    if (rtlLanguages.includes(lang)) {
      document.documentElement.dir = "rtl";
      document.documentElement.classList.add("rtl");
    } else {
      document.documentElement.dir = "ltr";
      document.documentElement.classList.remove("rtl");
    }
  }, [lang, enDict, initialized]);

  const setLang = useCallback((newLang: LanguageCode) => {
    setLangState(newLang);
    localStorage.setItem("survivaLoop_lang", newLang);
  }, []);

  const t = useCallback((key: string, params?: Record<string, any>) => {
    let text = dict[key] ?? enDict[key] ?? key;
    if (params) {
      Object.keys(params).forEach(p => {
        text = text.replace(new RegExp(`{${p}}`, 'g'), String(params[p]));
      });
    }
    return text;
  }, [dict, enDict]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
