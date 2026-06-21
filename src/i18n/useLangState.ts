import { useEffect, useReducer } from "react";
import { getLang, onLangChange, type Lang } from "./index";

/**
 * Subscribe a component to language changes. Used at the very top of the tree
 * (see main.tsx) to remount everything when the language switches, so every
 * `t(...)` call re-reads the active dictionary without per-component plumbing.
 */
export function useLangState(): Lang {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => onLangChange(force), []);
  return getLang();
}
