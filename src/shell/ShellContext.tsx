import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Orbit shell system
// ────────────────────────────────────────────────────────────────────────────
// Orbit can render its whole UI through one of several "shells" (top-level chromes
// that wrap the SAME functional tab components). This is intentionally open-ended
// so new shells can be added later without touching the existing ones.
//
//   • "classic" — the original Orbit interface (untouched).
//   • "nova"    — a reinvented, futuristic premium experience (Orbit Nova).
//
// Switching is instant (no reload): the choice is React state, persisted to
// localStorage so it survives restarts. Everything functional keeps working in
// every shell because the shells only swap the chrome, not the features.
// ────────────────────────────────────────────────────────────────────────────

export type ShellId = "classic" | "nova";

export const SHELLS: { id: ShellId; label: string; tagline: string }[] = [
  { id: "classic", label: "Orbit Classic", tagline: "L'interface d'origine" },
  { id: "nova", label: "Orbit Nova", tagline: "Expérience nouvelle génération" },
];

const STORAGE_KEY = "orbit-shell";

function readInitial(): ShellId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "classic" || saved === "nova") return saved;
  } catch {}
  return "nova"; // Orbit Nova is the default experience; Classic stays one click away.
}

interface ShellCtx {
  shell: ShellId;
  setShell: (s: ShellId) => void;
  toggleShell: () => void;
}

const Ctx = createContext<ShellCtx | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [shell, setShellState] = useState<ShellId>(readInitial);

  const setShell = (s: ShellId) => {
    setShellState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch {}
  };
  const toggleShell = () => setShell(shell === "nova" ? "classic" : "nova");

  // Expose the active shell as a root class so shell-scoped CSS can key off it.
  useEffect(() => {
    document.documentElement.setAttribute("data-shell", shell);
    return () => document.documentElement.removeAttribute("data-shell");
  }, [shell]);

  return <Ctx.Provider value={{ shell, setShell, toggleShell }}>{children}</Ctx.Provider>;
}

export function useShell(): ShellCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShell must be used within <ShellProvider>");
  return v;
}
