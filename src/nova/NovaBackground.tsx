import { useMemo } from "react";

// Living background for Orbit Nova: mesh gradient + slow orbs + rising particles
// + animated SVG "data-flow" arrows + noise + vignette. Everything is CSS/SVG and
// GPU-composited (see nova.css), so it stays smooth and never blocks the UI.
// Purely decorative → pointer-events: none.

export default function NovaBackground() {
  // Particles are generated once with stable randomised offsets/timings.
  const particles = useMemo(
    () =>
      Array.from({ length: 26 }, () => ({
        left: Math.random() * 100,
        dx: (Math.random() * 80 - 40).toFixed(0) + "px",
        dur: 14 + Math.random() * 22,
        delay: -Math.random() * 30,
        size: 2 + Math.random() * 2.5,
      })),
    []
  );

  return (
    <div className="nv-bg" aria-hidden>
      <div className="nv-bg__mesh" />
      <div className="nv-orb nv-orb--1" />
      <div className="nv-orb nv-orb--2" />
      <div className="nv-orb nv-orb--3" />

      {/* flowing data arrows — large, faint, looping */}
      <svg className="nv-flow" width="100%" height="100%" preserveAspectRatio="none"
           viewBox="0 0 1440 900" fill="none" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
        <defs>
          <linearGradient id="nvLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A855F7" stopOpacity="0" />
            <stop offset="0.5" stopColor="#00D4FF" stopOpacity="0.7" />
            <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="url(#nvLine)" strokeWidth="1.4" strokeLinecap="round">
          <path d="M-40 200 C 280 120, 520 320, 820 240 S 1320 120, 1500 260" />
          <g className="nv-flow--slow"><path d="M-40 520 C 320 460, 560 640, 900 560 S 1300 480, 1500 600" /></g>
          <path d="M-40 760 C 360 700, 600 840, 980 760 S 1340 700, 1500 820" />
        </g>
        {/* travelling glow heads */}
        <circle className="nv-flow__head" cx="820" cy="240" r="3" fill="#00D4FF" />
        <circle className="nv-flow__head" cx="900" cy="560" r="3" fill="#A855F7" style={{ animationDelay: "1.1s" }} />
      </svg>

      {particles.map((p, i) => (
        <span
          key={i}
          className="nv-particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            // @ts-expect-error custom prop
            "--dx": p.dx,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      <div className="nv-bg__noise" />
      <div className="nv-bg__vignette" />
    </div>
  );
}
