import { useEffect, useRef, useState, type ReactNode } from "react";
import NovaBackground from "./NovaBackground";
import NovaSidebar from "./NovaSidebar";
import NovaTopbar from "./NovaTopbar";
import NovaSearch from "./NovaSearch";
import NovaHome from "./NovaHome";
import { NOVA_HOME } from "./catalog";
import { tap } from "./sfx";
import "./nova.css";

interface Props {
  activeTab: string;
  visibleIds: Set<string>;
  onOpenTab: (id: string) => void;   // reveal + switch to a tab id
  onHome: () => void;                // go to the Nova home
  onOpenSettings: () => void;
  onOpenPremium: () => void;
  onToggleShell: () => void;         // switch back to Classic
  premium: boolean;
  children: ReactNode;               // the (always-mounted) tab content from App
}

// The Orbit Nova shell. Wraps the SAME functional tab components (passed as
// `children`) in a reinvented premium chrome: living background, glass sidebar,
// frameless topbar, command palette and a spectacular home. Classic is untouched.
export default function NovaLayout({
  activeTab, visibleIds, onOpenTab, onHome, onOpenSettings, onOpenPremium, onToggleShell, premium, children,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // drawer (narrow screens only)
  const rootRef = useRef<HTMLDivElement>(null);
  const isHome = activeTab === NOVA_HOME;

  // Ctrl+K opens the command palette anywhere in the shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((v) => !v); }
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Global tap feedback: a soft sound + an expanding ripple at the click point,
  // for every interactive element in the shell. One listener, no per-element wiring.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const INTERACTIVE = "button, a, input, select, label, .nv-card, .nv-nav-item, .nv-chip, .nv-search-trigger, [data-nv-tap]";
    const onDown = (e: PointerEvent) => {
      const target = (e.target as HTMLElement)?.closest(INTERACTIVE) as HTMLElement | null;
      if (!target || target.hasAttribute("disabled")) return;

      // pick a sound that matches the gesture
      let kind: Parameters<typeof tap>[0] = "tap";
      if (target.closest(".nv-card") || target.closest("[data-nv='open']")) kind = "open";
      else if (target.classList.contains("nv-winctl--close")) kind = "back";
      else if (target.getAttribute("role") === "switch" || target.closest("[data-nv='toggle']")) kind = "toggle";
      tap(kind);

      // expanding ripple at the pointer position (body-level → never clipped)
      const r = document.createElement("span");
      r.className = "nv-ripple";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      r.addEventListener("animationend", () => r.remove(), { once: true });
      setTimeout(() => r.remove(), 700); // safety net
    };
    root.addEventListener("pointerdown", onDown);
    return () => root.removeEventListener("pointerdown", onDown);
  }, []);

  const openTab = (id: string) => { onOpenTab(id); setNavOpen(false); };
  const goHome = () => { onHome(); setNavOpen(false); };

  return (
    <div className="nova-shell" ref={rootRef}>
      <NovaBackground />

      <div className="relative z-10 flex h-full w-full">
        {/* backdrop behind the drawer on narrow screens */}
        {navOpen && <div className="nv-nav-backdrop" onClick={() => setNavOpen(false)} />}

        <NovaSidebar
          className={navOpen ? "is-open" : ""}
          activeTab={activeTab}
          visibleIds={visibleIds}
          onOpen={openTab}
          onHome={goHome}
          onOpenSettings={() => { onOpenSettings(); setNavOpen(false); }}
          onOpenPremium={() => { onOpenPremium(); setNavOpen(false); }}
          premium={premium}
        />

        <div className="flex flex-col flex-1 min-w-0 h-full">
          <NovaTopbar
            onOpenSearch={() => setSearchOpen(true)}
            onToggleShell={onToggleShell}
            onToggleNav={() => setNavOpen((v) => !v)}
          />

          <div className="flex-1 min-h-0 relative">
            {/* Tab content stays mounted (state preserved); just hidden on Home. */}
            <div style={{ display: isHome ? "none" : "block", height: "100%" }}>{children}</div>
            {isHome && (
              <NovaHome visibleIds={visibleIds} onOpen={openTab} onOpenSearch={() => setSearchOpen(true)} />
            )}
          </div>
        </div>
      </div>

      <NovaSearch open={searchOpen} onClose={() => setSearchOpen(false)} onOpen={openTab} />
    </div>
  );
}
