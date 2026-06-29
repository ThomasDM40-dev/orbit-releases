import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Minus, Square, X, Sparkles, Volume2, VolumeX, Menu } from "lucide-react";
import { t } from "@/i18n";
import { isSfxEnabled, setSfxEnabled, subscribeSfx } from "./sfx";

interface Props {
  onOpenSearch: () => void;
  onToggleShell: () => void;
  onToggleNav: () => void;
}

const api = () => (typeof window !== "undefined" ? (window as any).electronAPI : undefined);

// Frameless top bar for Nova: draggable region + global search trigger +
// "switch to Classic" toggle + window controls. Mirrors the Classic title bar's
// capabilities (minimize / maximize / quit) so nothing is lost.
export default function NovaTopbar({ onOpenSearch, onToggleShell, onToggleNav }: Props) {
  const [sfxOn, setSfxOn] = useState(isSfxEnabled());
  useEffect(() => subscribeSfx(setSfxOn), []);

  return (
    <div
      className="relative z-20 flex items-center gap-3 h-[60px] px-4 shrink-0"
      style={{ WebkitAppRegion: "drag", borderBottom: "1px solid var(--nv-hairline)" } as any}
    >
      {/* Hamburger (mobile / narrow only) */}
      <button
        onClick={onToggleNav}
        className="nv-hamburger nv-winctl"
        style={{ WebkitAppRegion: "no-drag" } as any}
        title={t("Menu")}
      >
        <Menu size={17} />
      </button>

      {/* Search trigger */}
      <button
        onClick={onOpenSearch}
        className="nv-search-trigger ml-1"
        style={{ WebkitAppRegion: "no-drag" } as any}
        title={t("Rechercher (Ctrl+K)")}
      >
        <Search size={16} />
        <span className="flex-1 text-left text-[13.5px] truncate">{t("Rechercher un outil, une action…")}</span>
        <kbd className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.07)" }}>Ctrl K</kbd>
      </button>

      <div className="flex-1" />

      {/* Quick mute toggle for UI sounds */}
      <button
        onClick={() => setSfxEnabled(!sfxOn)}
        className="nv-winctl"
        style={{ WebkitAppRegion: "no-drag" } as any}
        title={sfxOn ? t("Couper les sons de l'interface") : t("Activer les sons de l'interface")}
      >
        {sfxOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
      </button>

      {/* Shell switch back to Classic */}
      <motion.button
        whileHover={{ y: -1 }}
        onClick={onToggleShell}
        className="nv-chip"
        style={{ WebkitAppRegion: "no-drag" } as any}
        title={t("Revenir à l'interface classique")}
      >
        <Sparkles size={13} style={{ color: "#7fe3ff" }} />
        <span className="hidden sm:inline">{t("Interface Classique")}</span>
      </motion.button>

      {/* Window controls */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button className="nv-winctl" title={t("Réduire")} onClick={() => api()?.minimizeWindow?.()}><Minus size={15} /></button>
        <button className="nv-winctl" title={t("Agrandir / Restaurer")} onClick={() => api()?.toggleMaximizeWindow?.()}><Square size={12} /></button>
        <button className="nv-winctl nv-winctl--close" title={t("Quitter")} onClick={() => api()?.appQuit?.()}><X size={15} /></button>
      </div>
    </div>
  );
}
