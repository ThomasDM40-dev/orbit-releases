import { motion } from "framer-motion";
import { Home, Sparkles, Settings, Crown, LayoutGrid } from "lucide-react";
import { t } from "@/i18n";
import { TAB_ICONS } from "@/components/TabIcons";
import { getCatalog, NOVA_CATEGORIES, NOVA_HOME, type NovaCategory } from "./catalog";

interface Props {
  activeTab: string;
  visibleIds: Set<string>;
  onOpen: (id: string) => void;
  onHome: () => void;
  onOpenSettings: () => void;
  onOpenPremium: () => void;
  premium: boolean;
  className?: string;
}

// Premium left rail. Groups the catalog by category, shows only tabs the user
// keeps visible (shares the Classic visibility config), highlights the active one
// with a glowing indicator, and keeps Home / Premium / Settings pinned.
export default function NovaSidebar({ activeTab, visibleIds, onOpen, onHome, onOpenSettings, onOpenPremium, premium, className = "" }: Props) {
  const catalog = getCatalog().filter((toolItem) => visibleIds.has(toolItem.id));
  const byCat = (c: NovaCategory) => catalog.filter((x) => x.category === c);

  return (
    <aside className={`nv-sidebar nv-glass relative z-10 flex flex-col h-full w-[260px] shrink-0 ${className}`} style={{ borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0 }}>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[60px] shrink-0" style={{ borderBottom: "1px solid var(--nv-hairline)" }}>
        <div className="w-9 h-9 rounded-xl grid place-items-center text-white shrink-0"
             style={{ background: "var(--nv-grad)", boxShadow: "0 8px 22px -6px rgba(0,212,255,0.6), inset 0 1px 0 rgba(255,255,255,0.4)" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-extrabold tracking-tight nv-grad-text">Orbit Nova</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--nv-text-dim)" }}>Creative Suite</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto nv-scroll px-3 py-4 flex flex-col gap-1">
        <button className={`nv-nav-item w-full ${activeTab === NOVA_HOME ? "is-active" : ""}`} onClick={onHome}>
          <span className="nv-nav-ico"><Home size={18} /></span>
          <span className="flex-1 text-left">{t("Accueil")}</span>
          <LayoutGrid size={13} style={{ opacity: 0.5 }} />
        </button>

        {NOVA_CATEGORIES.map((cat) => {
          const items = byCat(cat.id);
          if (!items.length) return null;
          return (
            <div key={cat.id} className="mt-3">
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] flex items-center gap-2" style={{ color: "var(--nv-text-dim)" }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.accent, boxShadow: `0 0 8px ${cat.accent}` }} />
                {t(cat.label)}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((toolItem) => (
                  <button
                    key={toolItem.id}
                    className={`nv-nav-item w-full ${activeTab === toolItem.id ? "is-active" : ""}`}
                    onClick={() => onOpen(toolItem.id)}
                  >
                    <span className="nv-nav-ico" style={{ color: activeTab === toolItem.id ? "#fff" : cat.accent }}>
                      {TAB_ICONS[toolItem.id] ?? <Sparkles size={16} />}
                    </span>
                    <span className="flex-1 text-left truncate">{toolItem.tLabel}</span>
                    {toolItem.badge && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(0,212,255,0.14)", color: "#7fe3ff" }}>{toolItem.badge}</span>}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-3 flex flex-col gap-1" style={{ borderTop: "1px solid var(--nv-hairline)" }}>
        <motion.button
          whileHover={{ y: -1 }}
          onClick={onOpenPremium}
          className="nv-nav-item w-full"
          style={premium ? {} : { background: "linear-gradient(135deg, rgba(168,85,247,0.16), rgba(0,212,255,0.12))", color: "#fff", borderColor: "rgba(168,85,247,0.3)" }}
        >
          <span className="nv-nav-ico" style={{ color: "#f5c451" }}><Crown size={18} /></span>
          <span className="flex-1 text-left">{premium ? t("Premium actif") : t("Passer en Premium")}</span>
        </motion.button>
        <button className="nv-nav-item w-full" onClick={onOpenSettings}>
          <span className="nv-nav-ico"><Settings size={18} /></span>
          <span className="flex-1 text-left">{t("Réglages")}</span>
        </button>
      </div>
    </aside>
  );
}
