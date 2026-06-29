import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft } from "lucide-react";
import { t } from "@/i18n";
import { TAB_ICONS } from "@/components/TabIcons";
import { getCatalog, NOVA_CATEGORIES } from "./catalog";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpen: (id: string) => void;
}

// Raycast / Spotlight-style command palette. Fuzzy-ish substring match over the
// catalog (label + description + category), keyboard navigable, glowing focus.
export default function NovaSearch({ open, onClose, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const catalog = getCatalog();
  const catLabel = (id: string) => NOVA_CATEGORIES.find((c) => c.id === id)?.label ?? "";
  const query = q.trim().toLowerCase();
  const results = !query
    ? catalog
    : catalog.filter((x) =>
        (x.tLabel + " " + x.tDesc + " " + t(catLabel(x.category))).toLowerCase().includes(query)
      );

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 40); } }, [open]);
  useEffect(() => { setIdx(0); }, [q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-start justify-center pt-[14vh] px-4"
          style={{ background: "rgba(4,6,12,0.6)", backdropFilter: "blur(8px)" }}
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="nv-glass-strong w-full max-w-[600px] rounded-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 h-[58px]" style={{ borderBottom: "1px solid var(--nv-hairline)" }}>
              <Search size={18} style={{ color: "#7fe3ff" }} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                  else if (e.key === "Enter") { e.preventDefault(); const r = results[idx]; if (r) { onOpen(r.id); onClose(); } }
                  else if (e.key === "Escape") { e.preventDefault(); onClose(); }
                }}
                placeholder={t("Rechercher un outil, une action…")}
                className="flex-1 bg-transparent outline-none text-[15px]"
                style={{ color: "var(--nv-text)" }}
              />
              <kbd className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: "rgba(255,255,255,0.06)", color: "var(--nv-text-dim)" }}>ESC</kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto nv-scroll p-2">
              {results.length === 0 ? (
                <div className="text-center py-10 text-sm" style={{ color: "var(--nv-text-dim)" }}>{t("Aucun résultat")}</div>
              ) : (
                results.map((r, i) => (
                  <button
                    key={r.id}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => { onOpen(r.id); onClose(); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
                    style={{ background: i === idx ? "var(--nv-grad-soft)" : "transparent" }}
                  >
                    <span className="w-9 h-9 rounded-lg grid place-items-center text-white shrink-0"
                          style={{ background: `linear-gradient(135deg, ${r.grad[0]}, ${r.grad[1]})` }}>
                      {TAB_ICONS[r.id]}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold truncate" style={{ color: i === idx ? "#fff" : "var(--nv-text)" }}>{r.tLabel}</span>
                      <span className="block text-[12px] truncate" style={{ color: "var(--nv-text-dim)" }}>{r.tDesc}</span>
                    </span>
                    {i === idx && <CornerDownLeft size={15} style={{ color: "#7fe3ff" }} />}
                  </button>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 flex items-center gap-4 text-[11px]" style={{ borderTop: "1px solid var(--nv-hairline)", color: "var(--nv-text-dim)" }}>
              <span>↑↓ {t("naviguer")}</span><span>↵ {t("ouvrir")}</span><span>esc {t("fermer")}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
