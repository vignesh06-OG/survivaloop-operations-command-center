"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

export type LanguageCode = "en" | "hi" | "mr" | "bn" | "ta" | "te" | "kn" | "gu" | "pa" | "ml" | "or" | "as" | "ur" | "ks" | "ne" | "sd" | "doi" | "kok" | "mni" | "brx" | "sat" | "mai";

export const LANGUAGES: { code: LanguageCode; name: string; nativeName: string; region: string; speechCode: string }[] = [
  { code: "en", name: "English", nativeName: "English", region: "Other", speechCode: "en-IN" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली", region: "Other", speechCode: "ne-NP" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", region: "North", speechCode: "hi-IN" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ", region: "North", speechCode: "pa-IN" },
  { code: "ur", name: "Urdu", nativeName: "اردو", region: "North", speechCode: "ur-IN" },
  { code: "ks", name: "Kashmiri", nativeName: "کٲشُر", region: "North", speechCode: "ks-IN" },
  { code: "doi", name: "Dogri", nativeName: "डोगरी", region: "North", speechCode: "doi-IN" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", region: "East", speechCode: "bn-IN" },
  { code: "as", name: "Assamese", nativeName: "অসমীয়া", region: "East", speechCode: "as-IN" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ", region: "East", speechCode: "or-IN" },
  { code: "mni", name: "Manipuri", nativeName: "ꯃꯤꯇꯩꯂꯣꯟ", region: "East", speechCode: "mni-IN" },
  { code: "brx", name: "Bodo", nativeName: "बड़ो", region: "East", speechCode: "brx-IN" },
  { code: "sat", name: "Santhali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ", region: "East", speechCode: "sat-IN" },
  { code: "mai", name: "Maithili", nativeName: "मैथिली", region: "East", speechCode: "mai-IN" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", region: "West", speechCode: "mr-IN" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", region: "West", speechCode: "gu-IN" },
  { code: "kok", name: "Konkani", nativeName: "कोंकणी", region: "West", speechCode: "kok-IN" },
  { code: "sd", name: "Sindhi", nativeName: "سنڌي", region: "West", speechCode: "sd-IN" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", region: "South", speechCode: "ta-IN" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", region: "South", speechCode: "te-IN" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", region: "South", speechCode: "kn-IN" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം", region: "South", speechCode: "ml-IN" }
];

interface I18nContextType {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  t: (key: string, params?: Record<string, any>) => string;
  speechCode: string;
}

const I18nContext = createContext<I18nContextType | null>(null);

const rtlLanguages: LanguageCode[] = ["ur", "ks", "sd"];

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

  const speechCode = LANGUAGES.find(l => l.code === lang)?.speechCode || "en-IN";

  return <I18nContext.Provider value={{ lang, setLang, t, speechCode }}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}
