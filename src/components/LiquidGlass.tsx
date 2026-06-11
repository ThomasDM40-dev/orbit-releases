import { type CSSProperties, forwardRef, useCallback, useEffect, useId, useRef, useState } from "react"

// --------------- SVG Displacement Map Data URI ---------------
const displacementMap = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXM9IjMiIHN0aXRjaFRpbGVzPSJzdGl0Y2giLz48ZmVDb2xvck1hdHJpeCB0eXBlPSJzYXR1cmF0ZSIgdmFsdWVzPSIwIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbHRlcj0idXJsKCNub2lzZSkiIG9wYWNpdHk9IjEiLz48L3N2Zz4=`

/* ---------- SVG filter ---------- */
const GlassFilter: React.FC<{
  id: string
  displacementScale: number
  aberrationIntensity: number
  width: number
  height: number
}> = ({ id, displacementScale, aberrationIntensity, width, height }) => (
  <svg style={{ position: "absolute", width, height, pointerEvents: "none" }} aria-hidden="true">
    <defs>
      <filter id={id} x="-35%" y="-35%" width="170%" height="170%" colorInterpolationFilters="sRGB">
        <feImage x="0" y="0" width="100%" height="100%" result="DISPLACEMENT_MAP" href={displacementMap} preserveAspectRatio="xMidYMid slice" />
        <feColorMatrix in="DISPLACEMENT_MAP" type="matrix"
          values="0.3 0.3 0.3 0 0 0.3 0.3 0.3 0 0 0.3 0.3 0.3 0 0 0 0 0 1 0"
          result="EDGE_INTENSITY"
        />
        <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
          <feFuncA type="discrete" tableValues={`0 ${aberrationIntensity * 0.05} 1`} />
        </feComponentTransfer>
        <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale={-displacementScale} xChannelSelector="R" yChannelSelector="B" result="RED_DISPLACED" />
        <feColorMatrix in="RED_DISPLACED" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="RED_CHANNEL" />
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale={-displacementScale - aberrationIntensity * 0.05} xChannelSelector="R" yChannelSelector="B" result="GREEN_DISPLACED" />
        <feColorMatrix in="GREEN_DISPLACED" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="GREEN_CHANNEL" />
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale={-displacementScale - aberrationIntensity * 0.1} xChannelSelector="R" yChannelSelector="B" result="BLUE_DISPLACED" />
        <feColorMatrix in="BLUE_DISPLACED" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="BLUE_CHANNEL" />
        <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" result="GB_COMBINED" />
        <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" result="RGB_COMBINED" />
        <feGaussianBlur in="RGB_COMBINED" stdDeviation={Math.max(0.1, 0.5 - aberrationIntensity * 0.1)} result="ABERRATED_BLURRED" />
        <feComposite in="ABERRATED_BLURRED" in2="EDGE_MASK" operator="in" result="EDGE_ABERRATION" />
        <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feComposite in="CENTER_ORIGINAL" in2="INVERTED_MASK" operator="in" result="CENTER_CLEAN" />
        <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
      </filter>
    </defs>
  </svg>
)

/* ---------- Inner glass container ---------- */
const GlassContainer = forwardRef<
  HTMLDivElement,
  React.PropsWithChildren<{
    className?: string
    style?: React.CSSProperties
    displacementScale?: number
    blurAmount?: number
    saturation?: number
    aberrationIntensity?: number
    mouseOffset?: { x: number; y: number }
    onMouseLeave?: () => void
    onMouseEnter?: () => void
    onMouseDown?: () => void
    onMouseUp?: () => void
    active?: boolean
    cornerRadius?: number
    padding?: string
    glassSize?: { width: number; height: number }
    onClick?: () => void
    tint?: string
  }>
>(
  (
    {
      children,
      className = "",
      style,
      displacementScale = 25,
      blurAmount = 12,
      saturation = 180,
      aberrationIntensity = 2,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onMouseUp,
      active = false,
      cornerRadius = 999,
      padding = "12px 20px",
      glassSize = { width: 200, height: 50 },
      onClick,
      tint = "rgba(255,255,255,0.05)",
    },
    ref,
  ) => {
    const filterId = useId()

    const backdropStyle = {
      filter: `url(#${filterId})`,
      backdropFilter: `blur(${4 + blurAmount * 32}px) saturate(${saturation}%)`,
    }

    return (
      <div
        ref={ref}
        className={`relative ${className} ${active ? "active" : ""} ${Boolean(onClick) ? "cursor-pointer" : ""}`}
        style={style}
        onClick={onClick}
      >
        <GlassFilter id={filterId} displacementScale={displacementScale} aberrationIntensity={aberrationIntensity} width={glassSize.width} height={glassSize.height} />
        <div
          style={{
            borderRadius: `${cornerRadius}px`,
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding,
            overflow: "hidden",
            transition: "all 0.2s ease-in-out",
            boxShadow: "0px 8px 32px rgba(0, 0, 0, 0.3), 0 1px 0 rgba(255,255,255,0.08) inset",
            width: "100%",
            height: "100%",
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
        >
          {/* Backdrop warp layer */}
          <span
            style={{
              ...backdropStyle,
              position: "absolute",
              inset: "0",
              background: tint,
            } as CSSProperties}
          />
          {/* Content layer */}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              width: "100%",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    )
  },
)

GlassContainer.displayName = "GlassContainer"

/* ---------- Main LiquidGlass Component ---------- */
export interface LiquidGlassProps {
  children: React.ReactNode
  displacementScale?: number
  blurAmount?: number
  saturation?: number
  aberrationIntensity?: number
  elasticity?: number
  cornerRadius?: number
  className?: string
  padding?: string
  style?: React.CSSProperties
  onClick?: () => void
  tint?: string
  disabled?: boolean
}

export default function LiquidGlass({
  children,
  displacementScale = 40,
  blurAmount = 0.1,
  saturation = 160,
  aberrationIntensity = 3,
  elasticity = 0.08,
  cornerRadius = 16,
  className = "",
  padding = "10px 20px",
  style = {},
  onClick,
  tint = "rgba(255,255,255,0.06)",
  disabled = false,
}: LiquidGlassProps) {
  const glassRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [glassSize, setGlassSize] = useState({ width: 200, height: 50 })
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 })
  const [globalMousePos, setGlobalMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!glassRef.current) return
    const rect = glassRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    setMouseOffset({
      x: ((e.clientX - centerX) / rect.width) * 100,
      y: ((e.clientY - centerY) / rect.height) * 100,
    })
    setGlobalMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    const el = glassRef.current
    if (!el) return
    el.addEventListener("mousemove", handleMouseMove)
    return () => el.removeEventListener("mousemove", handleMouseMove)
  }, [handleMouseMove])

  useEffect(() => {
    const updateSize = () => {
      if (glassRef.current) {
        const rect = glassRef.current.getBoundingClientRect()
        setGlassSize({ width: rect.width, height: rect.height })
      }
    }
    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  const calculateDirectionalScale = useCallback(() => {
    if (!globalMousePos.x || !globalMousePos.y || !glassRef.current) return "scale(1)"
    const rect = glassRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = globalMousePos.x - cx
    const dy = globalMousePos.y - cy
    const edgeDistX = Math.max(0, Math.abs(dx) - glassSize.width / 2)
    const edgeDistY = Math.max(0, Math.abs(dy) - glassSize.height / 2)
    const edgeDist = Math.sqrt(edgeDistX ** 2 + edgeDistY ** 2)
    const zone = 150
    if (edgeDist > zone) return "scale(1)"
    const fade = 1 - edgeDist / zone
    const dist = Math.sqrt(dx ** 2 + dy ** 2)
    if (dist === 0) return "scale(1)"
    const nx = dx / dist
    const ny = dy / dist
    const stretch = Math.min(dist / 300, 1) * elasticity * fade
    const sx = 1 + Math.abs(nx) * stretch * 0.3 - Math.abs(ny) * stretch * 0.15
    const sy = 1 + Math.abs(ny) * stretch * 0.3 - Math.abs(nx) * stretch * 0.15
    return `scaleX(${Math.max(0.85, sx)}) scaleY(${Math.max(0.85, sy)})`
  }, [globalMousePos, elasticity, glassSize])

  const transform = isActive && Boolean(onClick) && !disabled
    ? "translate(-50%, -50%) scale(0.95)"
    : `translate(-50%, -50%) ${calculateDirectionalScale()}`

  const containerStyle: React.CSSProperties = {
    ...style,
    position: "relative",
    top: "50%",
    left: "50%",
    transform,
    transition: "all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
    opacity: disabled ? 0.4 : 1,
    pointerEvents: disabled ? "none" : "auto",
  }

  return (
    <>
      <GlassContainer
        ref={glassRef}
        className={className}
        style={containerStyle}
        cornerRadius={cornerRadius}
        displacementScale={displacementScale}
        blurAmount={blurAmount}
        saturation={saturation}
        aberrationIntensity={aberrationIntensity}
        glassSize={glassSize}
        padding={padding}
        mouseOffset={mouseOffset}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={() => { if (!disabled) setIsActive(true) }}
        onMouseUp={() => setIsActive(false)}
        active={isActive}
        onClick={disabled ? undefined : onClick}
        tint={tint}
      >
        {children}
      </GlassContainer>

      {/* Border layer (shimmering highlight) */}
      <span
        style={{
          position: "relative",
          top: "50%",
          left: "50%",
          height: glassSize.height,
          width: glassSize.width,
          borderRadius: `${cornerRadius}px`,
          transform,
          transition: "all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
          pointerEvents: "none",
          mixBlendMode: "screen",
          opacity: 0.25,
          padding: "1px",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          boxShadow: "0 0 0 0.5px rgba(255,255,255,0.5) inset, 0 1px 2px rgba(255,255,255,0.2) inset",
          background: `linear-gradient(${135 + mouseOffset.x * 1.2}deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${0.15 + Math.abs(mouseOffset.x) * 0.01}) ${Math.max(10, 33 + mouseOffset.y * 0.3)}%, rgba(255,255,255,${0.45 + Math.abs(mouseOffset.x) * 0.01}) ${Math.min(90, 66 + mouseOffset.y * 0.4)}%, rgba(255,255,255,0) 100%)`,
        }}
      />

      {/* Hover glow overlay */}
      {Boolean(onClick) && !disabled && (
        <div
          style={{
            position: "relative",
            top: "50%",
            left: "50%",
            height: glassSize.height,
            width: glassSize.width,
            borderRadius: `${cornerRadius}px`,
            transform,
            transition: "all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1)",
            pointerEvents: "none",
            opacity: isHovered ? 0.35 : 0,
            backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 60%)",
            mixBlendMode: "overlay",
          }}
        />
      )}
    </>
  )
}

/* ---------- Convenience wrapper for buttons ---------- */
export function LiquidButton({
  children,
  onClick,
  disabled,
  className = "",
  style = {},
  tint = "rgba(255,255,255,0.07)",
  cornerRadius = 14,
  padding = "10px 22px",
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  tint?: string
  cornerRadius?: number
  padding?: string
}) {
  return (
    <div style={{ position: "relative", display: "inline-flex" }} className={className}>
      <LiquidGlass
        onClick={onClick}
        disabled={disabled}
        tint={tint}
        cornerRadius={cornerRadius}
        padding={padding}
        style={style}
      >
        {children}
      </LiquidGlass>
    </div>
  )
}
