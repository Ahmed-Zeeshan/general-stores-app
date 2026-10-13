"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DICT } from "./i18n-dict";

/**
 * Interface language (English / اردو / Roman Urdu), chosen per computer. Numbers and
 * amounts stay in English digits so they match receipts and calculators.
 */
export type Lang = "en" | "ur" | "roman";
const KEY = "dukaan:lang";
const LANGS: Lang[] = ["en", "ur", "roman"];

/** English → Urdu / Roman Urdu. Falls back to English when a phrase is not in the list yet. */
export function translate(text: string, lang: Lang): string {
  if (lang === "en" || !text) return text;
  const col = lang === "ur" ? 0 : 1;
  const hit = DICT[text];
  if (hit) return hit[col];
  // "Name *", "Bills (3)", "Search…", "Total:" — translate the words, keep the rest.
  const m = text.match(/^(.*?)(\s\*|\s\([^)]*\d[^)]*\)|…|:)$/);
  if (m && DICT[m[1]]) return DICT[m[1]][col] + m[2];
  return text;
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Lang | null;
      if (saved && LANGS.includes(saved)) setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "ur" ? "ur" : "en";
    document.documentElement.classList.toggle("lang-ur", lang === "ur");
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

/** t("Old udhaar: {amount}", { amount: "Rs 500" }) — Urdu when chosen, English otherwise. */
export function useT() {
  const { lang } = useContext(LangContext);
  return useCallback(
    (text: string, vars?: Record<string, string | number>) => {
      let out = translate(text, lang);
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
      return out;
    },
    [lang],
  );
}

/** Small English / اردو / Roman Urdu switch. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();
  const btn = (l: Lang, label: string, extra = "") => (
    <button type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`rounded-md px-2.5 py-1 ${extra} ${lang === l ? "bg-white text-slate-900 shadow-xs" : "text-slate-500"}`}>
      {label}
    </button>
  );
  return (
    <div className={`inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold ${className}`} role="group" aria-label="Language">
      {btn("en", "English")}
      {btn("ur", "اردو", "urdu")}
      {btn("roman", "Roman Urdu")}
    </div>
  );
}
