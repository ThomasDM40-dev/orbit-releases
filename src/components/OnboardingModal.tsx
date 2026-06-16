import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';

// First-run wizard: pick a profile → Orbit shows only the relevant tabs
// (10 tabs is a lot). Also a quick look (theme + accent) for ergonomics.

const ROLES = [
  { id: 'monteur', emoji: '🎬', label: 'Monteur vidéo', desc: 'Montage classique, YouTube, réseaux', tabs: ['downloads', 'converter', 'library', 'transcription', 'handbrake', 'matting'] },
  { id: 'motion', emoji: '🌀', label: 'Motion / After Effects', desc: 'Motion design, compositing 2D', tabs: ['library', 'matting', 'enhance', 'transcription', 'converter', 'handbrake'] },
  { id: '3d', emoji: '🧊', label: 'Artiste 3D / VFX', desc: 'Blender, rendu, séquences d\'images', tabs: ['library', 'enhance', 'matting', 'converter', 'handbrake', 'interpolator'] },
  { id: 'audio', emoji: '🎵', label: 'Compositeur / Audio', desc: 'Musique, podcast, sound design', tabs: ['downloads', 'converter', 'transcription'] },
  { id: 'download', emoji: '⬇️', label: 'Téléchargeur / Archiviste', desc: 'Récupérer & organiser des vidéos', tabs: ['downloads', 'subscriptions', 'converter', 'library'] },
];
const ALL_TABS = ['downloads', 'converter', 'subscriptions', 'interpolator', 'library', 'enhance', 'matting', 'handbrake', 'topaz', 'transcription'];
const CORE = ['downloads', 'converter'];
const ACCENTS = [{ id: 'pink', c: '#ec4899' }, { id: 'purple', c: '#a855f7' }, { id: 'blue', c: '#3b82f6' }, { id: 'cyan', c: '#22d3ee' }, { id: 'green', c: '#22c55e' }, { id: 'orange', c: '#f97316' }];
const THEMES = [{ id: 'dark', name: 'Sombre' }, { id: 'amoled', name: 'AMOLED' }, { id: 'midnight', name: 'Minuit' }, { id: 'light', name: 'Clair' }];

export default function OnboardingModal({ onComplete }: { onComplete: (r: { visibleIds: string[]; accent: string; theme: string }) => void }) {
  const [roles, setRoles] = useState<string[]>([]);
  const [discoverAll, setDiscoverAll] = useState(false);
  const [accent, setAccent] = useState('pink');
  const [theme, setTheme] = useState('dark');

  const toggle = (id: string) => { setDiscoverAll(false); setRoles(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); };

  const finish = () => {
    let visible: string[];
    if (discoverAll || roles.length === 0) visible = ALL_TABS;
    else {
      const set = new Set<string>(CORE);
      roles.forEach(r => ROLES.find(x => x.id === r)?.tabs.forEach(t => set.add(t)));
      visible = ALL_TABS.filter(t => set.has(t)); // keep canonical order
    }
    onComplete({ visibleIds: visible, accent, theme });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-xl p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-2xl rounded-3xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]"
        style={{ background: 'rgba(14,14,20,0.98)', boxShadow: '0 40px 100px rgba(0,0,0,0.8)' }}>
        {/* Header */}
        <div className="px-7 pt-7 pb-4 text-center shrink-0" style={{ background: 'radial-gradient(ellipse at 50% -30%, color-mix(in srgb, var(--accent,#ec4899) 26%, transparent), transparent 70%)' }}>
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: 'color-mix(in srgb, var(--accent,#ec4899) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--accent,#ec4899) 40%, transparent)' }}>
            <Sparkles className="w-7 h-7" style={{ color: 'var(--accent,#ec4899)' }} />
          </div>
          <h2 className="text-2xl font-bold text-white">Bienvenue dans Orbit</h2>
          <p className="text-sm text-gray-400 mt-1">Dis-nous ce que tu fais — on affichera les bons outils pour toi.</p>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Ton profil <span className="text-gray-600 font-normal normal-case">(plusieurs choix possibles)</span></p>
          <div className="grid grid-cols-2 gap-2.5">
            {ROLES.map(r => {
              const on = roles.includes(r.id) && !discoverAll;
              return (
                <button key={r.id} onClick={() => toggle(r.id)}
                  className="text-left rounded-2xl border p-3.5 transition-all flex gap-3 items-start"
                  style={{ borderColor: on ? 'var(--accent,#ec4899)' : 'rgba(255,255,255,0.08)', background: on ? 'color-mix(in srgb, var(--accent,#ec4899) 14%, transparent)' : 'rgba(255,255,255,0.02)' }}>
                  <span className="text-2xl leading-none mt-0.5">{r.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">{r.label}{on && <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent,#ec4899)' }} />}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{r.desc}</p>
                  </div>
                </button>
              );
            })}
            {/* Discover all */}
            <button onClick={() => { setDiscoverAll(v => !v); setRoles([]); }}
              className="text-left rounded-2xl border p-3.5 transition-all flex gap-3 items-start col-span-2"
              style={{ borderColor: discoverAll ? 'var(--accent,#ec4899)' : 'rgba(255,255,255,0.08)', background: discoverAll ? 'color-mix(in srgb, var(--accent,#ec4899) 14%, transparent)' : 'rgba(255,255,255,0.02)' }}>
              <span className="text-2xl leading-none mt-0.5">✨</span>
              <div><p className="text-sm font-semibold text-gray-100 flex items-center gap-1.5">Je veux tout découvrir{discoverAll && <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent,#ec4899)' }} />}</p><p className="text-[11px] text-gray-500 mt-0.5">Afficher tous les onglets — tu pourras en masquer plus tard.</p></div>
            </button>
          </div>

          {/* Quick look */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-5 mb-2">Apparence</p>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              {THEMES.map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)} className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${theme === t.id ? 'text-white' : 'text-gray-400 border-white/10 hover:bg-white/5'}`}
                  style={theme === t.id ? { borderColor: 'var(--accent,#ec4899)', background: 'color-mix(in srgb, var(--accent,#ec4899) 16%, transparent)' } : {}}>{t.name}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {ACCENTS.map(a => (
                <button key={a.id} onClick={() => setAccent(a.id)} className={`w-7 h-7 rounded-full transition-all ${accent === a.id ? 'ring-2 ring-offset-2 ring-offset-[#0e0e14] scale-110' : 'hover:scale-105'}`} style={{ background: a.c, boxShadow: `0 0 12px ${a.c}66` }}>{accent === a.id && <Check className="w-3.5 h-3.5 text-white mx-auto" />}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/8 flex items-center justify-between shrink-0">
          <button onClick={() => onComplete({ visibleIds: ALL_TABS, accent, theme })} className="text-xs text-gray-500 hover:text-gray-300">Passer (tout afficher)</button>
          <button onClick={finish} className="px-6 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent,#ec4899) 88%, white), var(--accent,#ec4899))', boxShadow: '0 6px 22px color-mix(in srgb, var(--accent,#ec4899) 40%, transparent)' }}>
            Commencer →
          </button>
        </div>
      </motion.div>
    </div>
  );
}
