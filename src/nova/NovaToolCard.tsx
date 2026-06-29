import { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { TAB_ICONS } from "@/components/TabIcons";
import type { CatalogTool } from "./catalog";

interface Props {
  tool: CatalogTool;
  onOpen: (id: string) => void;
  index?: number;
}

// Premium tool card: pointer-tracked radial glow + subtle 3D tilt + hover lift.
// All transforms are written straight to the DOM node (no React re-render per
// mousemove) so it stays buttery even with a full grid on screen.
export default function NovaToolCard({ tool, onOpen, index = 0 }: Props) {
  const ref = useRef<HTMLButtonElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    el.style.transform = `translateY(-6px) perspective(800px) rotateX(${(0.5 - py) * 6}deg) rotateY(${(px - 0.5) * 8}deg)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = "";
  };

  return (
    <button
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={() => onOpen(tool.id)}
      className="nv-card nv-up text-left group"
      style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="nv-card__ico" style={{ background: `linear-gradient(135deg, ${tool.grad[0]}, ${tool.grad[1]})` }}>
          {TAB_ICONS[tool.id]}
        </div>
        <div className="flex items-center gap-2">
          {tool.badge && <span className="nv-card__badge">{tool.badge}</span>}
          <span className="w-7 h-7 rounded-lg grid place-items-center transition-all"
                style={{ color: "var(--nv-text-dim)", background: "rgba(255,255,255,0.04)" }}>
            <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>

      <h3 className="text-[15px] font-bold mb-1" style={{ color: "#fff" }}>{tool.tLabel}</h3>
      <p className="text-[12.5px] leading-relaxed line-clamp-2" style={{ color: "var(--nv-text-dim)" }}>{tool.tDesc}</p>

      <div className="mt-4 flex items-center gap-2 text-[11px]" style={{ color: "var(--nv-text-dim)" }}>
        {tool.trending && <span className="nv-chip" style={{ padding: "3px 9px" }}>🔥 Trending</span>}
        {tool.fresh && <span className="nv-chip" style={{ padding: "3px 9px" }}>✦ {/* new */}Nouveau</span>}
      </div>
    </button>
  );
}
