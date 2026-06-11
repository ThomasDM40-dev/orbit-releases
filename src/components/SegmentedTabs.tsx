import { useState, useRef, useCallback, useEffect } from "react"

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
}

export default function SegmentedTabs({
  tabs,
  activeTab,
  onTabChange,
  onReorder,
  accentColor = "#e879f9",
}: SegmentedTabsProps) {
  const visibleTabs = tabs.filter(t => t.visible)
  const activeIndex = visibleTabs.findIndex(t => t.id === activeTab)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [sliderStyle, setSliderStyle] = useState({ left: 0, width: 0 })

  // Update slider position
  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-tab-btn]")
    const activeBtn = buttons[activeIndex]
    if (!activeBtn) return
    const containerRect = container.getBoundingClientRect()
    const btnRect = activeBtn.getBoundingClientRect()
    setSliderStyle({
      left: btnRect.left - containerRect.left,
      width: btnRect.width,
    })
  }, [activeIndex, visibleTabs])

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIndex(idx)
    e.dataTransfer.effectAllowed = "move"
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverIndex(idx)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIdx || !onReorder) return
    const allTabs = [...tabs]
    const visibleCopy = [...visibleTabs]
    const [moved] = visibleCopy.splice(dragIndex, 1)
    visibleCopy.splice(dropIdx, 0, moved)
    // Rebuild allTabs preserving invisible ones
    let visIdx = 0
    const newAll = allTabs.map(t => {
      if (!t.visible) return t
      return visibleCopy[visIdx++]
    })
    onReorder(newAll)
    setDragIndex(null)
    setDragOverIndex(null)
  }, [dragIndex, dragOverIndex, visibleTabs, tabs, onReorder])

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDragOverIndex(null)
  }, [])

  return (
    <div
      ref={containerRef}
      className="relative flex items-center p-1 rounded-2xl gap-0.5"
      style={{
        background: "rgba(0,0,0,0.35)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px) saturate(180%)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset",
      }}
    >
      {/* Animated slider */}
      <div
        className="absolute top-1 bottom-1 rounded-xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] pointer-events-none"
        style={{
          left: sliderStyle.left,
          width: sliderStyle.width,
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
            onDragStart={e => handleDragStart(e, idx)}
            onDragOver={e => handleDragOver(e, idx)}
            onDrop={e => handleDrop(e, dropIdx => dropIdx)}
            onDragEnd={handleDragEnd}
            onClick={() => onTabChange(tab.id)}
            className={`relative z-10 px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 select-none whitespace-nowrap ${
              isActive
                ? "text-white"
                : "text-gray-400 hover:text-gray-200"
            } ${isDragging ? "opacity-40 scale-95" : ""} ${isDragOver ? "scale-105" : ""}`}
            style={{
              cursor: onReorder ? "grab" : "pointer",
              textShadow: isActive ? "0 0 20px rgba(255,255,255,0.4)" : "none",
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex === null || dragIndex === idx || !onReorder) return
              const visibleCopy = [...visibleTabs]
              const [moved] = visibleCopy.splice(dragIndex, 1)
              visibleCopy.splice(idx, 0, moved)
              let visIdx = 0
              const newAll = tabs.map(t => {
                if (!t.visible) return t
                return visibleCopy[visIdx++]
              })
              onReorder(newAll)
              setDragIndex(null)
              setDragOverIndex(null)
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
