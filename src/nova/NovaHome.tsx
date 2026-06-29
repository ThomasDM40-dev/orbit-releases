import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Search, Sparkles, TrendingUp, Rocket, Stars, Wand2, ArrowRight } from "lucide-react";
import { t } from "@/i18n";
import { TAB_ICONS } from "@/components/TabIcons";
import { getCatalog, NOVA_CATEGORIES, type NovaCategory } from "./catalog";
import NovaToolCard from "./NovaToolCard";

interface Props {
  visibleIds: Set<string>;
  onOpen: (id: string) => void;
  onOpenSearch: () => void;
}

// ── Animated count-up number (stats) ────────────────────────────────────────
function Stat({ value, suffix = "", label }: { value: number; suffix?: string; label: string }) {
  const [n, setN] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const dur = 1400;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * value));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value]);
  return (
    <div className="text-center">
      <div className="text-[26px] font-extrabold nv-grad-text leading-none">{n}{suffix}</div>
      <div className="text-[11px] mt-1.5 font-medium uppercase tracking-wider" style={{ color: "var(--nv-text-dim)" }}>{label}</div>
    </div>
  );
}

// ── Horizontal rail (Trending / New) ────────────────────────────────────────
function Rail({ title, icon, tools, onOpen }: { title: string; icon: React.ReactNode; tools: ReturnType<typeof getCatalog>; onOpen: (id: string) => void }) {
  if (!tools.length) return null;
  return (
    <section className="mt-10">
      <div className="flex items-center gap-2.5 mb-4 px-1">
        <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: "var(--nv-grad-soft)", color: "#7fe3ff" }}>{icon}</span>
        <h2 className="text-[16px] font-bold" style={{ color: "#fff" }}>{title}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto nv-scroll pb-3 -mx-1 px-1" style={{ scrollSnapType: "x mandatory" }}>
        {tools.map((toolItem, i) => (
          <div key={toolItem.id} className="shrink-0 w-[300px]" style={{ scrollSnapAlign: "start" }}>
            <NovaToolCard tool={toolItem} onOpen={onOpen} index={i} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function NovaHome({ visibleIds, onOpen, onOpenSearch }: Props) {
  const catalog = getCatalog().filter((x) => visibleIds.has(x.id));
  const byCat = (c: NovaCategory) => catalog.filter((x) => x.category === c);
  const trending = catalog.filter((x) => x.trending);
  const fresh = catalog.filter((x) => x.fresh);
  const aiTools = byCat("ai");

  return (
    <div className="relative z-10 h-full overflow-y-auto nv-scroll">
      <div className="nv-home-wrap max-w-[1180px] mx-auto px-8 pb-20">
        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <section className="pt-14 pb-6 text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 nv-chip mb-6"
          >
            <Sparkles size={13} style={{ color: "#7fe3ff" }} />
            <span>{t("Bienvenue dans Orbit Nova")}</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="text-[44px] md:text-[56px] font-black leading-[1.04] tracking-tight"
          >
            <span className="nv-grad-text">{t("Discover The Best")}</span><br />
            <span style={{ color: "#fff" }}>{t("Creative Tools")}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[640px] mx-auto mt-5 text-[15px] leading-relaxed" style={{ color: "var(--nv-text-dim)" }}
          >
            {t("Trouvez les meilleurs plugins, scripts, outils IA, ressources et logiciels pour accélérer votre workflow créatif.")}
          </motion.p>

          {/* big search trigger */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex justify-center"
          >
            <button onClick={onOpenSearch} className="nv-search-trigger" style={{ maxWidth: 520, padding: "13px 18px", borderRadius: 16 }}>
              <Search size={18} style={{ color: "#7fe3ff" }} />
              <span className="flex-1 text-left text-[14px]">{t("Rechercher un outil, une action…")}</span>
              <kbd className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(255,255,255,0.07)" }}>Ctrl K</kbd>
            </button>
          </motion.div>

          {/* stats */}
          <motion.div
            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-[640px] mx-auto"
          >
            <div className="nv-glass rounded-2xl py-4"><Stat value={catalog.length} suffix="+" label={t("Outils")} /></div>
            <div className="nv-glass rounded-2xl py-4"><Stat value={NOVA_CATEGORIES.length} suffix="" label={t("Catégories")} /></div>
            <div className="nv-glass rounded-2xl py-4"><Stat value={aiTools.length} suffix="" label={t("Outils IA")} /></div>
            <div className="nv-glass rounded-2xl py-4 grid place-items-center"><div className="text-center"><div className="text-[18px] font-extrabold nv-grad-text">∞</div><div className="text-[11px] mt-1.5 font-medium uppercase tracking-wider" style={{ color: "var(--nv-text-dim)" }}>{t("Mises à jour")}</div></div></div>
          </motion.div>
        </section>

        {/* ── Rails ─────────────────────────────────────────────────────── */}
        <Rail title={t("Tendances")} icon={<TrendingUp size={15} />} tools={trending} onOpen={onOpen} />
        <Rail title={t("Nouveautés")} icon={<Rocket size={15} />} tools={fresh} onOpen={onOpen} />

        {/* ── Categories grid ───────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="flex items-center gap-2.5 mb-4 px-1">
            <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: "var(--nv-grad-soft)", color: "#7fe3ff" }}><Stars size={15} /></span>
            <h2 className="text-[16px] font-bold" style={{ color: "#fff" }}>{t("Catégories")}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {NOVA_CATEGORIES.map((cat) => {
              const items = byCat(cat.id);
              if (!items.length) return null;
              return (
                <button key={cat.id} onClick={() => onOpen(items[0].id)} className="nv-glass rounded-2xl p-4 text-left nv-border-glow transition-transform hover:-translate-y-1">
                  <div className="w-9 h-9 rounded-xl grid place-items-center mb-3" style={{ background: `${cat.accent}22`, color: cat.accent }}>{TAB_ICONS[items[0].id]}</div>
                  <div className="text-[13.5px] font-bold" style={{ color: "#fff" }}>{t(cat.label)}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--nv-text-dim)" }}>{items.length} {t("outils")}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── AI section ────────────────────────────────────────────────── */}
        {aiTools.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-2.5 mb-4 px-1">
              <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: "var(--nv-grad-soft)", color: "#7fe3ff" }}><Wand2 size={15} /></span>
              <h2 className="text-[16px] font-bold" style={{ color: "#fff" }}>{t("Outils IA")}</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {aiTools.map((toolItem, i) => <NovaToolCard key={toolItem.id} tool={toolItem} onOpen={onOpen} index={i} />)}
            </div>
          </section>
        )}

        {/* ── All tools ─────────────────────────────────────────────────── */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-[16px] font-bold flex items-center gap-2.5" style={{ color: "#fff" }}>
              <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: "var(--nv-grad-soft)", color: "#7fe3ff" }}><Sparkles size={15} /></span>
              {t("Tous les outils")}
            </h2>
            <button onClick={onOpenSearch} className="text-[12px] flex items-center gap-1.5 nv-chip">
              {t("Tout explorer")} <ArrowRight size={13} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.map((toolItem, i) => <NovaToolCard key={toolItem.id} tool={toolItem} onOpen={onOpen} index={i} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
