"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface GlassOption {
  value: string;
  label: string;
  group?: string;
  disabled?: boolean;
}

interface GlassSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: GlassOption[];
  className?: string;       // trigger button classes
  placeholder?: string;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

// A custom, fully-styled dropdown that replaces the native <select> (whose popup
// is OS-rendered and impossible to theme). Rendered in a portal with fixed
// positioning so it never gets clipped by overflow-hidden ancestors.
export default function GlassSelect({ value, onChange, options, className = "", placeholder = "Sélectionner…", disabled, title, ariaLabel }: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null);

  const selected = options.find(o => o.value === value);
  const enabledOptions = options.filter(o => !o.disabled);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const up = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(320, Math.max(160, (up ? spaceAbove : spaceBelow) - 16));
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, maxHeight, up });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = options.findIndex(o => o.value === value);
      setActiveIdx(idx >= 0 ? idx : 0);
    }
  }, [open, value, options]);

  const commit = (v: string) => { onChange(v); setOpen(false); triggerRef.current?.focus(); };

  const move = (dir: 1 | -1) => {
    if (!enabledOptions.length) return;
    const curr = options[activeIdx];
    let i = enabledOptions.indexOf(curr as GlassOption);
    if (i < 0) i = 0;
    i = (i + dir + enabledOptions.length) % enabledOptions.length;
    setActiveIdx(options.indexOf(enabledOptions[i]));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") { e.preventDefault(); const o = options[activeIdx]; if (o && !o.disabled) commit(o.value); }
    else if (e.key === "Tab") setOpen(false);
  };

  // Build display list, inserting group headers.
  const rows: Array<{ type: "group"; label: string } | { type: "opt"; opt: GlassOption; idx: number }> = [];
  let lastGroup: string | undefined;
  options.forEach((opt, idx) => {
    if (opt.group && opt.group !== lastGroup) { rows.push({ type: "group", label: opt.group }); lastGroup = opt.group; }
    rows.push({ type: "opt", opt, idx });
  });

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
        className={
          "group/gs flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm text-gray-200 text-left outline-none transition-all " +
          "disabled:opacity-50 disabled:cursor-default " +
          (className || "w-full")
        }
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid " + (open ? "rgba(236,72,153,0.55)" : "rgba(255,255,255,0.10)"),
          backdropFilter: "blur(12px)",
          boxShadow: open ? "0 0 0 3px rgba(236,72,153,0.12)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        <span className={"truncate " + (selected ? "" : "text-gray-500")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={"w-4 h-4 flex-shrink-0 text-gray-400 transition-transform duration-200 " + (open ? "rotate-180 text-pink-400" : "group-hover/gs:text-gray-200")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="fixed z-[2000] p-1.5 rounded-xl overflow-y-auto custom-scrollbar dropdown-menu"
          style={{
            left: pos.left,
            width: pos.width,
            maxHeight: pos.maxHeight,
            ...(pos.up ? { bottom: window.innerHeight - pos.top + 6 } : { top: pos.top + 6 }),
            background: "rgba(16,16,22,0.92)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(28px) saturate(180%)",
            WebkitBackdropFilter: "blur(28px) saturate(180%)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
            transformOrigin: pos.up ? "bottom left" : "top left",
          }}
        >
          {rows.map((row, i) =>
            row.type === "group" ? (
              <div key={"g" + i} className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">{row.label}</div>
            ) : (
              <button
                key={row.opt.value + i}
                type="button"
                role="option"
                aria-selected={row.opt.value === value}
                disabled={row.opt.disabled}
                onMouseEnter={() => setActiveIdx(row.idx)}
                onClick={() => !row.opt.disabled && commit(row.opt.value)}
                className={
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-default " +
                  (row.idx === activeIdx ? "bg-pink-500/15 text-white" : "text-gray-300")
                }
              >
                <span className="flex-1 truncate">{row.opt.label}</span>
                {row.opt.value === value && <Check className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </>
  );
}
