// Lightweight i18n for Orbit.
//
// Design notes
// ------------
// • Source language is French — the French string IS the lookup key, so wrapping
//   a label is just `t("Téléchargements")`. Missing translations fall back to the
//   French source, so the UI is never broken while dictionaries are filled in.
// • `t()` is a plain module function (not a hook): components only need a single
//   `import { t } from "@/i18n"`. Reactivity is handled by remounting the whole
//   tree on language change (see <I18nRoot> in main.tsx via `useLangState`), which
//   is fine because switching language is a rare, deliberate action.
// • Interpolation: `t("Étape {n}/{total}", { n: 2, total: 4 })`.

import { dict } from "./translations";

export type Lang = "fr" | "en" | "es" | "de" | "it" | "pt";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
];

const SUPPORTED = LANGS.map((l) => l.code);
const STORAGE_KEY = "app-lang";

function detectInitial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && SUPPORTED.includes(saved)) return saved;
  } catch {}
  // Auto-detect from the OS / browser locale, fall back to French.
  try {
    const nav = (navigator.language || "").slice(0, 2).toLowerCase();
    if (SUPPORTED.includes(nav as Lang)) return nav as Lang;
  } catch {}
  return "fr";
}

let current: Lang = detectInitial();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (!SUPPORTED.includes(l) || l === current) return;
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {}
  listeners.forEach((f) => f());
}

export function onLangChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * Translate a French source string into the active language.
 * Unknown strings (or language === "fr") return the source unchanged.
 */
export function t(s: string, vars?: Record<string, string | number>): string {
  let out = s;
  if (current !== "fr") {
    const table = dict[current as Exclude<Lang, "fr">];
    if (table && table[s] != null) out = table[s];
  }
  if (vars) {
    for (const k in vars) {
      out = out.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
    }
  }
  return out;
}
