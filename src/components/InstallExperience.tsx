import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';

// ════════════════════════════════════════════════════════════════════════════
// Orbit — Premium first-run install experience
// ────────────────────────────────────────────────────────────────────────────
// A self-contained, dependency-light "installer window" shown on first launch.
// Welcome → Installing (animated steps + glow progress) → Success. Pure
// React + Framer Motion + inline styles, so it never relies on the Nova CSS
// scope and can be reused or extracted into a standalone stub installer later.
// ════════════════════════════════════════════════════════════════════════════

const C = {
  bg0: '#080B12',
  bg1: '#0F172A',
  bg2: '#111827',
  violet: '#7C3AED',
  violet2: '#8B5CF6',
  violet3: '#A855F7',
  cyan: '#00D4FF',
  sky: '#38BDF8',
};

const STEPS = [
  'Downloading packages…',
  'Installing Orbit Core…',
  'Setting up environment…',
  'Optimizing files…',
  'Finalizing installation…',
];

type Phase = 'welcome' | 'installing' | 'done';

export default function InstallExperience({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<Phase>('welcome');
  const [progress, setProgress] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);

  // ── Drive the install sequence ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'installing') return;
    let raf = 0;
    let p = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last); last = now;
      // ease-out: fast early, slows near the end, with a touch of jitter
      const speed = (0.018 + Math.random() * 0.01) * (1 - p / 130);
      p = Math.min(100, p + speed * dt * 1.6);
      setProgress(p);
      setStepIdx(Math.min(STEPS.length - 1, Math.floor((p / 100) * STEPS.length)));
      if (p < 100) raf = requestAnimationFrame(tick);
      else setTimeout(() => setPhase('done'), 650);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.45 } }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,3,8,0.72)', backdropFilter: 'blur(10px)',
        WebkitAppRegion: 'no-drag' as any,
      }}
    >
      <Keyframes />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative',
          width: 'min(1000px, 92vw)', height: 'min(650px, 88vh)',
          borderRadius: 26, overflow: 'hidden',
          background: `linear-gradient(160deg, ${C.bg1}, ${C.bg0} 60%)`,
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: `0 50px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 80px ${rgba(C.violet3, 0.18)}`,
        }}
      >
        <LivingBackground />
        {/* faux window top bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, display: 'flex', alignItems: 'center', padding: '0 18px', zIndex: 5, WebkitAppRegion: 'drag' as any }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Dot color="rgba(255,255,255,0.18)" />
            <Dot color="rgba(255,255,255,0.18)" />
            <Dot color="rgba(255,255,255,0.18)" />
          </div>
          <div style={{ marginLeft: 14, fontSize: 12, letterSpacing: 1.5, color: 'rgba(229,236,245,0.55)', fontWeight: 600 }}>
            ORBIT&nbsp;<span style={{ color: rgba(C.cyan, 0.8) }}>INSTALLER</span>
          </div>
        </div>

        {/* Borders glow accent */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 26, pointerEvents: 'none', boxShadow: `0 1px 0 ${rgba('#ffffff', 0.06)} inset`, zIndex: 4 }} />

        <div style={{ position: 'relative', zIndex: 6, height: '100%' }}>
          <AnimatePresence mode="wait">
            {phase === 'welcome' && (
              <Screen key="welcome">
                <OrbitMark />
                <motion.h1 variants={fadeUp} style={H1}>Welcome to Orbit</motion.h1>
                <motion.p variants={fadeUp} style={Sub}>Discover the next generation platform for creators.</motion.p>
                <motion.div variants={fadeUp} style={{ marginTop: 38 }}>
                  <MagneticButton onClick={() => setPhase('installing')}>Install Orbit</MagneticButton>
                </motion.div>
                <motion.p variants={fadeUp} style={{ marginTop: 22, fontSize: 12, color: 'rgba(138,151,173,0.7)' }}>
                  Aucune action requise · Orbit configure tout pour vous
                </motion.p>
              </Screen>
            )}

            {phase === 'installing' && (
              <Screen key="installing">
                <ProgressRing value={progress} />
                <motion.h2 variants={fadeUp} style={{ ...H1, fontSize: 30, marginTop: 30 }}>Installing Orbit</motion.h2>
                <motion.div variants={fadeUp} style={{ width: 'min(440px, 78%)', marginTop: 26 }}>
                  <GlowBar value={progress} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'rgba(138,151,173,0.85)' }}>
                    <AnimatePresence mode="wait">
                      <motion.span key={stepIdx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                        {STEPS[stepIdx]}
                      </motion.span>
                    </AnimatePresence>
                    <span style={{ color: rgba(C.cyan, 0.95), fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{Math.round(progress)}%</span>
                  </div>
                </motion.div>
                <StepList active={stepIdx} />
              </Screen>
            )}

            {phase === 'done' && (
              <Screen key="done">
                <SuccessCheck />
                <motion.h2 variants={fadeUp} style={{ ...H1, fontSize: 32, marginTop: 26 }}>Orbit Installed Successfully</motion.h2>
                <motion.p variants={fadeUp} style={Sub}>Tout est prêt. Bienvenue dans la nouvelle génération.</motion.p>
                <motion.div variants={fadeUp} style={{ marginTop: 38, display: 'flex', gap: 14 }}>
                  <MagneticButton onClick={onFinish}>Launch Orbit</MagneticButton>
                  <GhostButton onClick={onFinish}>Close Installer</GhostButton>
                </motion.div>
              </Screen>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
const H1: React.CSSProperties = { fontSize: 40, fontWeight: 800, letterSpacing: -0.5, margin: 0, color: '#fff', textAlign: 'center', textShadow: `0 0 40px ${rgba(C.violet3, 0.35)}` };
const Sub: React.CSSProperties = { marginTop: 14, fontSize: 16, color: 'rgba(229,236,245,0.62)', textAlign: 'center', maxWidth: 460, lineHeight: 1.5 };

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="hidden" animate="show" exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.3 } }}
      variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}
    >
      {children}
    </motion.div>
  );
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 11, height: 11, borderRadius: '50%', background: color }} />;
}

// ── Orbit animated logo (welcome) ─────────────────────────────────────────────
function OrbitMark() {
  return (
    <motion.div variants={fadeUp} style={{ position: 'relative', width: 150, height: 150, marginBottom: 8 }}>
      {/* pulsing halo */}
      <motion.div
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: -30, borderRadius: '50%', background: `radial-gradient(circle, ${rgba(C.cyan, 0.35)}, transparent 65%)`, filter: 'blur(8px)' }}
      />
      {/* rotating orbital rings */}
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: 0 }}>
        <svg width="150" height="150" viewBox="0 0 150 150" fill="none">
          <ellipse cx="75" cy="75" rx="70" ry="28" stroke={rgba(C.cyan, 0.55)} strokeWidth="1.6" transform="rotate(-24 75 75)" />
          <circle className="oi-moon" cx="143" cy="61" r="4.5" fill="#fff" />
        </svg>
      </motion.div>
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 24, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: 0 }}>
        <svg width="150" height="150" viewBox="0 0 150 150" fill="none">
          <ellipse cx="75" cy="75" rx="58" ry="42" stroke={rgba(C.violet3, 0.5)} strokeWidth="1.4" transform="rotate(28 75 75)" />
        </svg>
      </motion.div>
      {/* glowing core */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          animate={{ boxShadow: [`0 0 30px ${rgba(C.cyan, 0.6)}`, `0 0 55px ${rgba(C.violet3, 0.75)}`, `0 0 30px ${rgba(C.cyan, 0.6)}`] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 50, height: 50, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, #ffffff, ${C.violet3} 45%, ${C.cyan})`, border: '1px solid rgba(255,255,255,0.4)' }}
        />
      </div>
    </motion.div>
  );
}

// ── Living animated background (mesh + particles + arrows + grain) ────────────
function LivingBackground() {
  const particles = useMemo(
    () => Array.from({ length: 34 }, (_, i) => ({
      left: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5,
      dur: 12 + Math.random() * 16,
      delay: -Math.random() * 28,
      dx: (Math.random() * 60 - 30).toFixed(0),
      col: i % 3 === 0 ? C.cyan : i % 3 === 1 ? C.violet3 : C.sky,
    })),
    []
  );

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {/* animated mesh */}
      <div className="oi-mesh" style={{
        position: 'absolute', inset: '-25%',
        background: `
          radial-gradient(38% 38% at 18% 22%, ${rgba(C.violet, 0.42)}, transparent 70%),
          radial-gradient(34% 34% at 84% 16%, ${rgba(C.cyan, 0.30)}, transparent 70%),
          radial-gradient(42% 42% at 74% 84%, ${rgba(C.violet2, 0.34)}, transparent 72%),
          radial-gradient(36% 36% at 22% 86%, ${rgba(C.sky, 0.24)}, transparent 72%)`,
        filter: 'blur(46px)',
      }} />

      {/* flowing data arrows / light trails */}
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1000 650" style={{ position: 'absolute', inset: 0, opacity: 0.55 }}>
        <defs>
          <linearGradient id="oiLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.violet3} stopOpacity="0" />
            <stop offset="0.5" stopColor={C.cyan} stopOpacity="0.8" />
            <stop offset="1" stopColor={C.sky} stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="url(#oiLine)" strokeWidth="1.3" strokeLinecap="round" fill="none">
          <path className="oi-flow" d="M-40 150 C 200 90, 380 230, 560 170 S 900 80, 1060 200" />
          <path className="oi-flow oi-flow--2" d="M-40 380 C 240 330, 420 460, 640 400 S 960 340, 1060 440" />
          <path className="oi-flow oi-flow--3" d="M-40 560 C 260 510, 440 610, 700 540 S 980 500, 1060 600" />
        </g>
      </svg>

      {/* floating particles */}
      {particles.map((p, i) => (
        <span key={i} className="oi-particle" style={{
          position: 'absolute', bottom: -10, left: `${p.left}%`,
          width: p.size, height: p.size, borderRadius: '50%',
          background: p.col, boxShadow: `0 0 6px ${p.col}`,
          // @ts-expect-error custom prop
          '--dx': `${p.dx}px`,
          animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}

      {/* grain + vignette */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.05, mixBlendMode: 'overlay',
        backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,0.55))' }} />
    </div>
  );
}

// ── Premium glow progress bar ─────────────────────────────────────────────────
function GlowBar({ value }: { value: number }) {
  return (
    <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
      <motion.div
        animate={{ width: `${value}%` }}
        transition={{ ease: 'linear', duration: 0.12 }}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 99,
          background: `linear-gradient(90deg, ${C.violet}, ${C.violet3} 40%, ${C.cyan})`,
          boxShadow: `0 0 18px ${rgba(C.cyan, 0.7)}, 0 0 6px ${rgba(C.violet3, 0.8)}` }}
      >
        {/* travelling shimmer */}
        <div className="oi-shimmer" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)' }} />
      </motion.div>
    </div>
  );
}

// ── Circular progress ring ────────────────────────────────────────────────────
function ProgressRing({ value }: { value: number }) {
  const r = 52, circ = 2 * Math.PI * r;
  return (
    <motion.div variants={fadeUp} style={{ position: 'relative', width: 140, height: 140 }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: `conic-gradient(from 0deg, transparent, ${rgba(C.cyan, 0.25)}, transparent 60%)`, filter: 'blur(2px)' }} />
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
        <defs>
          <linearGradient id="oiRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.violet3} /><stop offset="1" stopColor={C.cyan} />
          </linearGradient>
        </defs>
        <circle cx="70" cy="70" r={r} stroke="url(#oiRing)" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ - (value / 100) * circ}
          style={{ filter: `drop-shadow(0 0 6px ${rgba(C.cyan, 0.8)})`, transition: 'stroke-dashoffset 0.12s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value)}</span>
        <span style={{ fontSize: 11, color: 'rgba(138,151,173,0.8)', letterSpacing: 1 }}>%</span>
      </div>
    </motion.div>
  );
}

// ── Step list with check-offs ─────────────────────────────────────────────────
function StepList({ active }: { active: number }) {
  return (
    <motion.div variants={fadeUp} style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 9, width: 'min(440px, 78%)' }}>
      {STEPS.map((s, i) => {
        const done = i < active, current = i === active;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 11, opacity: done || current ? 1 : 0.4, transition: 'opacity .3s' }}>
            <span style={{
              width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: done ? `linear-gradient(135deg, ${C.violet3}, ${C.cyan})` : 'rgba(255,255,255,0.06)',
              border: current ? `1px solid ${rgba(C.cyan, 0.8)}` : '1px solid rgba(255,255,255,0.1)',
              boxShadow: current ? `0 0 12px ${rgba(C.cyan, 0.6)}` : 'none',
            }}>
              {done ? (
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.5 9.5 3.5" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : current ? (
                <span className="oi-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan }} />
              ) : null}
            </span>
            <span style={{ fontSize: 13, color: done ? 'rgba(229,236,245,0.7)' : current ? '#fff' : 'rgba(138,151,173,0.7)' }}>{s}</span>
          </div>
        );
      })}
    </motion.div>
  );
}

// ── Animated success check ────────────────────────────────────────────────────
function SuccessCheck() {
  return (
    <motion.div variants={fadeUp} style={{ position: 'relative', width: 120, height: 120 }}>
      <motion.div
        animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: `radial-gradient(circle, ${rgba(C.cyan, 0.4)}, transparent 65%)`, filter: 'blur(6px)' }}
      />
      <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <motion.circle cx="60" cy="60" r="52" stroke="url(#oiRing2)" strokeWidth="4" fill="none"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 8px ${rgba(C.cyan, 0.8)})` }} />
        <motion.path d="M38 62 L54 78 L84 44" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.55, duration: 0.45, ease: 'easeOut' }}
          style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.7))' }} />
        <defs>
          <linearGradient id="oiRing2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={C.violet3} /><stop offset="1" stopColor={C.cyan} />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

// ── Magnetic primary button with ripple ───────────────────────────────────────
function MagneticButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const x = useMotionValue(0), y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 250, damping: 18 }), sy = useSpring(y, { stiffness: 250, damping: 18 });
  const ref = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width - 0.5) * 16);
    y.set(((e.clientY - r.top) / r.height - 0.5) * 12);
  };
  const reset = () => { x.set(0); y.set(0); };
  const click = (e: React.MouseEvent) => {
    const el = ref.current; if (el) {
      const r = el.getBoundingClientRect();
      const id = Date.now();
      setRipples(rs => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      setTimeout(() => setRipples(rs => rs.filter(rp => rp.id !== id)), 650);
    }
    onClick();
  };

  return (
    <motion.button
      ref={ref} onMouseMove={onMove} onMouseLeave={reset} onClick={click}
      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
      style={{ x: sx, y: sy,
        position: 'relative', overflow: 'hidden', cursor: 'pointer', border: 'none',
        padding: '14px 38px', borderRadius: 14, fontSize: 15, fontWeight: 700, color: '#fff',
        background: `linear-gradient(135deg, ${C.violet3}, ${C.violet} 50%, ${C.cyan})`,
        boxShadow: `0 12px 34px ${rgba(C.violet, 0.5)}, 0 0 0 1px rgba(255,255,255,0.12) inset, 0 0 26px ${rgba(C.cyan, 0.35)}`,
      }}
    >
      <span style={{ position: 'relative', zIndex: 2 }}>{children}</span>
      {ripples.map(r => (
        <span key={r.id} className="oi-ripple" style={{ left: r.x, top: r.y }} />
      ))}
    </motion.button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button onClick={onClick} whileHover={{ scale: 1.04, borderColor: 'rgba(255,255,255,0.28)' }} whileTap={{ scale: 0.97 }}
      style={{ cursor: 'pointer', padding: '14px 30px', borderRadius: 14, fontSize: 15, fontWeight: 600,
        color: 'rgba(229,236,245,0.85)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
      {children}
    </motion.button>
  );
}

// ── tiny color util + keyframes ───────────────────────────────────────────────
function rgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function Keyframes() {
  return (
    <style>{`
      @keyframes oiMesh { 0%{transform:translate3d(0,0,0) scale(1)} 50%{transform:translate3d(2%,-1.5%,0) scale(1.08)} 100%{transform:translate3d(-2%,2%,0) scale(1.03)} }
      .oi-mesh { animation: oiMesh 24s ease-in-out infinite alternate; will-change: transform; }
      @keyframes oiRise { 0%{transform:translateY(0) translateX(0); opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{transform:translateY(-680px) translateX(var(--dx)); opacity:0} }
      .oi-particle { animation-name: oiRise; animation-timing-function: linear; animation-iteration-count: infinite; }
      @keyframes oiFlow { to { stroke-dashoffset: -560; } }
      .oi-flow { stroke-dasharray: 14 220; animation: oiFlow 6s linear infinite; }
      .oi-flow--2 { animation-duration: 8.5s; }
      .oi-flow--3 { animation-duration: 10s; }
      @keyframes oiShimmer { 0%{transform:translateX(-110%)} 100%{transform:translateX(160%)} }
      .oi-shimmer { animation: oiShimmer 1.6s ease-in-out infinite; }
      @keyframes oiPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.6);opacity:0.5} }
      .oi-pulse { animation: oiPulse 1.1s ease-in-out infinite; }
      @keyframes oiMoon { 0%,100%{opacity:0.5} 50%{opacity:1} }
      .oi-moon { animation: oiMoon 2.4s ease-in-out infinite; filter: drop-shadow(0 0 5px ${C.cyan}); }
      @keyframes oiRipple { 0%{transform:translate(-50%,-50%) scale(0);opacity:0.5} 100%{transform:translate(-50%,-50%) scale(14);opacity:0} }
      .oi-ripple { position:absolute; width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,0.5); pointer-events:none; animation: oiRipple 0.65s ease-out forwards; z-index:1; }
    `}</style>
  );
}
