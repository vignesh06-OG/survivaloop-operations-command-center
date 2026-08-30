"use client";
import React from "react";
import { useTranslation, LANGUAGES, LanguageCode } from "@/lib/i18n/I18nContext";

export default function LanguageSelector() {
  const { lang, setLang } = useTranslation();

  return (
    <div className="relative inline-block">
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as LanguageCode)}
        className="appearance-none bg-[#121820] text-sm text-[var(--text)] border border-[var(--line)] rounded px-3 py-1.5 pe-8 hover:border-gray-500 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        aria-label="Select Language"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeName} ({l.name})
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--muted)]">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );
}
