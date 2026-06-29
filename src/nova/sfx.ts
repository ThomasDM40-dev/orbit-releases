// ────────────────────────────────────────────────────────────────────────────
// Orbit Nova — UI sound effects
// ────────────────────────────────────────────────────────────────────────────
// Tiny, tasteful interface "blips" played on interaction. Sounds are SYNTHESISED
// with the Web Audio API (oscillator + gain envelope) so there are zero audio
// files to bundle or load. Globally mutable and persisted, exposed both in the
// Nova topbar (quick mute) and in Settings.
// ────────────────────────────────────────────────────────────────────────────

const KEY = "orbit-sfx-enabled";

let enabled = (() => {
  try { const v = localStorage.getItem(KEY); return v === null ? true : v === "1"; } catch { return true; }
})();

const listeners = new Set<(v: boolean) => void>();

export function isSfxEnabled(): boolean { return enabled; }
export function setSfxEnabled(v: boolean): void {
  enabled = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
  listeners.forEach((f) => f(v));
  if (v) tap("toggle"); // little confirmation chirp when (re)enabling
}
export function subscribeSfx(f: (v: boolean) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

// Lazily created, shared AudioContext (first real user gesture unlocks it).
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}

export type SfxKind = "tap" | "open" | "toggle" | "back" | "hover";

// One short enveloped tone (optionally a quick two-note glide).
function blip(freq: number, dur: number, vol: number, type: OscillatorType = "sine", glideTo?: number) {
  const ac = audio();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now + dur * 0.9);
  // fast attack, smooth exponential decay → a soft "tick", never harsh
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(vol, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(lp); lp.connect(gain); gain.connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Play an interface sound (no-op when muted). */
export function tap(kind: SfxKind = "tap"): void {
  if (!enabled) return;
  switch (kind) {
    case "open":   blip(520, 0.13, 0.05, "triangle", 880); break;       // rising — "enter"
    case "back":   blip(560, 0.12, 0.045, "triangle", 320); break;      // falling — "leave"
    case "toggle": blip(680, 0.09, 0.05, "sine", 920); break;           // crisp confirm
    case "hover":  blip(900, 0.04, 0.018, "sine"); break;               // very faint
    default:       blip(440 + Math.random() * 30, 0.07, 0.045, "sine"); // generic tick
  }
}
