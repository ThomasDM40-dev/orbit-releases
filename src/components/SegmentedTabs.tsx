import { useState, useRef, useCallback, useEffect, type ReactNode } from "react"

interface Tab {
  id: string
  label: string
  visible: boolean
}

interface SegmentedTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
  onReorder?: (tabs: Tab[]) => void
  accentColor?: string
  icons?: Record<string, ReactNode>
}

export default function SegmentedTabs({
  tabs,
  activeTab,
  onTabChange,
  onReorder,
  accentColor = "#e879f9",
  icons,
}: SegmentedTabsProps) {
  const visibleTabs = tabs.filter(t => t.visible)
  const activeIndex = visibleTabs.findIndex(t => t.id === activeTab)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0, opacity: 0 })

  // Position the animated slider using offsets (relative to the scroll content,
  // so it stays correct even when the tab strip is scrolled horizontally).
  const updateSlider = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-tab-btn]")
    const activeBtn = buttons[activeIndex]
    if (!activeBtn) { setSliderStyle(s => ({ ...s, opacity: 0 })); return }
    setSliderStyle({ left: activeBtn.offsetLeft, width: activeBtn.offsetWidth, opacity: 1 })
    // Keep the active tab visible when the strip overflows.
    activeBtn.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })
  }, [activeIndex])

  useEffect(() => { updateSlider() }, [updateSlider, visibleTabs.length])
  useEffect(() => {
    const onResize = () => updateSlider()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [updateSlider])

  const handleDrop = useCallback((dropIdx: number) => {
    if (dragIndex === null || dragIndex === dropIdx || !onReorder) { setDragIndex(null); setDragOverIndex(null); return }
    const visibleCopy = [...visibleTabs]
    const [moved] = visibleCopy.splice(dragIndex, 1)
    visibleCopy.splice(dropIdx, 0, moved)
    let visIdx = 0
    const newAll = tabs.map(t => (t.visible ? visibleCopy[visIdx++] : t))
    onReorder(newAll)
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dragIndex, visibleTabs, tabs, onReorder])

  return (
    <div
      ref={scrollRef}
      className="relative flex items-center p-1 rounded-2xl gap-0.5 min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth"
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px) saturate(180%)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset",
        WebkitMaskImage: "linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)",
        maskImage: "linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)",
      }}
    >
      {/* Animated slider */}
      <div
        className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
        style={{
          left: sliderStyle.left,
          width: sliderStyle.width,
          opacity: sliderStyle.opacity,
          background: `linear-gradient(135deg, ${accentColor}30 0%, ${accentColor}18 100%)`,
          border: `1px solid ${accentColor}50`,
          boxShadow: `0 2px 10px ${accentColor}30, 0 1px 0 rgba(255,255,255,0.1) inset`,
          backdropFilter: "blur(8px)",
        }}
      />

      {visibleTabs.map((tab, idx) => {
        const isActive = tab.id === activeTab
        const isDragging = dragIndex === idx
        const isDragOver = dragOverIndex === idx && dragIndex !== idx

        return (
          <button
            key={tab.id}
            data-tab-btn
            draggable={!!onReorder}
            onDragStart={e => { setDragIndex(idx); e.dataTransfer.effectAllowed = "move" }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverIndex(idx) }}
            onDrop={e => { e.preventDefault(); handleDrop(idx) }}
            onDragEnd={() => { setDragIndex(null); setDragOverIndex(null) }}
            onClick={() => onTabChange(tab.id)}
            className={`relative z-10 shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 select-none whitespace-nowrap ${
              isActive ? "text-white" : "text-gray-400 hover:text-gray-200"
            } ${isDragging ? "opacity-40 scale-95" : ""} ${isDragOver ? "scale-105" : ""}`}
            style={{
              cursor: onReorder ? "grab" : "pointer",
              textShadow: isActive ? "0 0 20px rgba(255,255,255,0.4)" : "none",
            }}
          >
            {icons?.[tab.id] && (
              <span className="shrink-0 transition-transform duration-200" style={{ opacity: isActive ? 1 : 0.8, color: isActive ? accentColor : "currentColor", filter: isActive ? `drop-shadow(0 0 6px ${accentColor}90)` : "none" }}>
                {icons[tab.id]}
              </span>
            )}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
