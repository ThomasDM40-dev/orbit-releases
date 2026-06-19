import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Wand2, Image as ImageIcon, Download, FolderOpen, Copy, Trash2,
  RotateCcw, Shuffle, Lock, Dice5, AlertCircle, Loader2, X, Maximize2, Check,
} from 'lucide-react';
import GlassSelect from './GlassSelect';

const api = () => (window as any).electronAPI;
const mediaUrl = (p: string) => 'media:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const INPUT_CLS = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 hover:border-white/20 focus:border-fuchsia-500/50 focus:ring-2 focus:ring-fuchsia-500/20 transition-all w-full select-text shadow-sm backdrop-blur-md";
const LABEL_CLS = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider";

type GalleryItem = {
  id: string; status: 'loading' | 'done' | 'error';
  src?: string; path?: string; prompt: string; model: string;
  width: number; height: number; seed?: string; error?: string;
};

const RATIOS = [
  { label: '1:1', w: 1024, h: 1024 },
  { label: '16:9', w: 1280, h: 720 },
  { label: '9:16', w: 720, h: 1280 },
  { label: '4:3', w: 1024, h: 768 },
  { label: '3:4', w: 768, h: 1024 },
  { label: '3:2', w: 1248, h: 832 },
  { label: '21:9', w: 1536, h: 640 },
];

const STYLES = [
  { name: 'Aucun', icon: '∅', suffix: '' },
  { name: 'Photoréaliste', icon: '📷', suffix: ', photorealistic, ultra detailed, 8k, sharp focus, professional photography, natural lighting' },
  { name: 'Cinématique', icon: '🎬', suffix: ', cinematic lighting, dramatic, film grain, shallow depth of field, color graded, anamorphic' },
  { name: '3D / Blender', icon: '🧊', suffix: ', 3d render, octane render, blender, cycles, subsurface scattering, ray tracing, highly detailed' },
  { name: 'Anime', icon: '🌸', suffix: ', anime style, studio ghibli, vibrant colors, detailed illustration, key visual' },
  { name: 'Digital Art', icon: '🎨', suffix: ', digital art, artstation, concept art, highly detailed, trending, masterpiece' },
  { name: 'Aquarelle', icon: '🖌️', suffix: ', watercolor painting, soft, artistic, hand painted, delicate brush strokes' },
  { name: 'Cyberpunk', icon: '🌃', suffix: ', cyberpunk, neon lights, futuristic, vibrant colors, blade runner atmosphere' },
  { name: 'Minimaliste', icon: '◻️', suffix: ', minimalist, clean, simple, elegant, lots of negative space' },
  { name: 'Logo / Vecteur', icon: '⬡', suffix: ', vector logo, flat design, clean lines, simple shapes, white background' },
];

const COUNTS = [1, 2, 3, 4];

export default function ImageGen() {
  const electron = api();
  const [prompt, setPrompt] = useState('');
  const [models, setModels] = useState<{ value: string; label: string }[]>([{ value: 'flux', label: 'Flux — qualité maximale (recommandé)' }]);
  const [model, setModel] = useState('flux');
  const [styleIdx, setStyleIdx] = useState(0);
  const [ratioIdx, setRatioIdx] = useState(0);
  const [count, setCount] = useState(1);
  const [enhance, setEnhance] = useState(true);
  const [seedLock, setSeedLock] = useState(false);
  const [seed, setSeed] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<{ type: 'error' | 'info'; msg: string } | null>(null);
  const [lightbox, setLightbox] = useState<GalleryItem | null>(null);
  const cancelRef = useRef(false);

  const showToast = (type: 'error' | 'info', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  // Load models + persisted gallery + default output dir.
  useEffect(() => {
    (async () => {
      if (!electron) return;
      const m = await electron.imageGenModels?.().catch(() => null);
      if (Array.isArray(m) && m.length) { setModels(m); if (!m.some((x: any) => x.value === model)) setModel(m[0].value); }
      const def = await electron.getDefaultDownloads?.().catch(() => '');
      if (def) setOutputDir(def);
    })();
    try {
      const saved = localStorage.getItem('orbit_imagegen_gallery');
      if (saved) {
        const arr = JSON.parse(saved) as GalleryItem[];
        if (Array.isArray(arr)) setGallery(arr.filter(g => g.path).map(g => ({ ...g, status: 'done', src: mediaUrl(g.path!) })));
      }
    } catch (e) {}
  }, []);

  // Persist the finished gallery (paths only — re-resolved via media:// on load).
  useEffect(() => {
    const done = gallery.filter(g => g.status === 'done' && g.path)
      .slice(0, 60)
      .map(({ id, path, prompt, model, width, height, seed }) => ({ id, path, prompt, model, width, height, seed, status: 'done' as const }));
    try { localStorage.setItem('orbit_imagegen_gallery', JSON.stringify(done)); } catch (e) {}
  }, [gallery]);

  const generate = useCallback(async () => {
    const base = prompt.trim();
    if (!base) { showToast('error', 'Écris une description (prompt) d\'abord.'); return; }
    if (generating) return;
    setGenerating(true); cancelRef.current = false;
    const ratio = RATIOS[ratioIdx];
    const fullPrompt = base + (STYLES[styleIdx]?.suffix || '');
    for (let i = 0; i < count; i++) {
      if (cancelRef.current) break;
      const id = uid();
      setGallery(prev => [{ id, status: 'loading', prompt: base, model, width: ratio.w, height: ratio.h }, ...prev]);
      const thisSeed = seedLock && seed !== '' ? seed : undefined;
      const res = await electron.imageGenerate?.({
        prompt: fullPrompt, model, width: ratio.w, height: ratio.h, enhance, seed: thisSeed, outputDir,
      }).catch((e: any) => ({ error: String(e) }));
      if (cancelRef.current) { setGallery(prev => prev.filter(g => g.id !== id)); break; }
      if (res?.ok) {
        setGallery(prev => prev.map(g => g.id === id ? {
          ...g, status: 'done', src: res.dataUrl, path: res.path, seed: res.seed, width: res.width, height: res.height,
        } : g));
        if (!seedLock && i === 0 && res.seed) setSeed(res.seed);
      } else {
        setGallery(prev => prev.map(g => g.id === id ? { ...g, status: 'error', error: res?.error || 'Échec.' } : g));
      }
    }
    setGenerating(false);
  }, [prompt, generating, ratioIdx, styleIdx, count, model, enhance, seedLock, seed, outputDir, electron]);

  const stop = () => { cancelRef.current = true; setGenerating(false); };
  const browseOutput = async () => { const d = await electron.selectDirectory?.(); if (d) setOutputDir(d); };
  const removeItem = (id: string) => { setGallery(prev => prev.filter(g => g.id !== id)); if (lightbox?.id === id) setLightbox(null); };
  const reuse = (g: GalleryItem) => { setPrompt(g.prompt); if (g.seed) { setSeed(g.seed); setSeedLock(true); } showToast('info', 'Prompt & seed réutilisés.'); };
  const copyPrompt = (g: GalleryItem) => { navigator.clipboard?.writeText(g.prompt).then(() => showToast('info', 'Prompt copié.'), () => {}); };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); } };

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-purple-500/30 flex items-center justify-center border border-white/10">
            <Wand2 className="w-5 h-5 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Génération d'image IA <span className="text-fuchsia-400">·</span> <span className="text-xs font-normal text-gray-500">Flux — gratuit & illimité</span></h2>
            <p className="text-[11px] text-gray-500">Décris ton image, choisis un style, et laisse l'IA créer. Aucune clé requise.</p>
          </div>
        </div>
        <div className="text-[11px] text-gray-500 hidden md:block">{gallery.filter(g => g.status === 'done').length} image(s) générée(s)</div>
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`mx-6 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-200'}`}>
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}<span className="select-text">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-hidden flex">
        {/* ── Controls ── */}
        <div className="w-[360px] shrink-0 border-r border-white/5 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Prompt */}
            <div>
              <label className={LABEL_CLS}>Description (prompt)</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={onKey} rows={4}
                placeholder="Un renard roux majestueux dans une forêt enneigée au lever du soleil…"
                className={INPUT_CLS + ' mt-1 resize-none leading-relaxed'} />
              <p className="text-[10px] text-gray-600 mt-1">Astuce : écris en anglais pour de meilleurs résultats · Ctrl+Entrée pour générer</p>
            </div>

            {/* Styles */}
            <div>
              <label className={LABEL_CLS}>Style</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {STYLES.map((st, i) => (
                  <button key={st.name} onClick={() => setStyleIdx(i)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${styleIdx === i ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-500/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                    <span>{st.icon}</span>{st.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div>
              <label className={LABEL_CLS}>Modèle IA</label>
              <GlassSelect className="mt-1 w-full" value={model} onChange={setModel} options={models} ariaLabel="Modèle IA" />
            </div>

            {/* Ratio */}
            <div>
              <label className={LABEL_CLS}>Format / Ratio</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {RATIOS.map((r, i) => (
                  <button key={r.label} onClick={() => setRatioIdx(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${ratioIdx === i ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-500/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                    {r.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">{RATIOS[ratioIdx].w} × {RATIOS[ratioIdx].h} px</p>
            </div>

            {/* Count */}
            <div>
              <label className={LABEL_CLS}>Nombre d'images</label>
              <div className="flex gap-1.5 mt-1.5">
                {COUNTS.map(c => (
                  <button key={c} onClick={() => setCount(c)}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-bold border transition-all ${count === c ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-500/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Seed */}
            <div>
              <label className={LABEL_CLS}>Seed (graine)</label>
              <div className="flex gap-2 mt-1.5">
                <button onClick={() => setSeedLock(!seedLock)} title={seedLock ? 'Seed fixe' : 'Seed aléatoire'}
                  className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-1.5 transition-all ${seedLock ? 'bg-fuchsia-500/20 border-fuchsia-500/40 text-fuchsia-200' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                  {seedLock ? <Lock className="w-3.5 h-3.5" /> : <Shuffle className="w-3.5 h-3.5" />}{seedLock ? 'Fixe' : 'Aléatoire'}
                </button>
                <input value={seed} onChange={e => setSeed(e.target.value.replace(/[^0-9]/g, ''))} disabled={!seedLock}
                  placeholder="auto" className={INPUT_CLS + ' flex-1 disabled:opacity-40'} />
                <button onClick={() => setSeed(String(Math.floor(Math.random() * 1e9)))} disabled={!seedLock} title="Nouvelle seed"
                  className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40"><Dice5 className="w-4 h-4" /></button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Seed fixe = résultats reproductibles pour ajuster un prompt.</p>
            </div>

            {/* Enhance + output dir */}
            <label className="flex items-center justify-between gap-2 text-xs text-gray-300 cursor-pointer rounded-xl bg-white/[0.03] border border-white/8 px-3 py-2.5">
              <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-fuchsia-400" /> Amélioration auto du prompt</span>
              <span onClick={() => setEnhance(!enhance)} className="relative w-10 h-6 rounded-full transition-all shrink-0"
                style={{ background: enhance ? 'linear-gradient(135deg,#d946ef,#a855f7)' : 'rgba(255,255,255,0.12)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all" style={{ left: enhance ? 'calc(100% - 22px)' : '2px' }} />
              </span>
            </label>

            <div>
              <label className={LABEL_CLS}>Dossier de sortie</label>
              <div className="flex gap-2 mt-1.5">
                <input className={INPUT_CLS} value={outputDir} onChange={e => setOutputDir(e.target.value)} placeholder="Dossier de destination…" />
                <button onClick={browseOutput} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="p-4 border-t border-white/5">
            {generating ? (
              <button onClick={stop} className="w-full px-4 py-3 rounded-xl font-bold text-sm bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Génération en cours — Arrêter
              </button>
            ) : (
              <button onClick={generate} disabled={!prompt.trim()} className="w-full px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(217,70,239,0.8), rgba(168,85,247,0.8))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 24px rgba(217,70,239,0.35)' }}>
                <Wand2 className="w-4 h-4" /> Générer {count > 1 ? `${count} images` : "l'image"}
              </button>
            )}
          </div>
        </div>

        {/* ── Gallery ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {gallery.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-600 gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-fuchsia-500/15 to-purple-500/15 flex items-center justify-center border border-white/10">
                <ImageIcon className="w-7 h-7 text-fuchsia-400/70" />
              </div>
              <p className="text-sm text-gray-400 font-medium">Tes créations apparaîtront ici</p>
              <p className="text-xs max-w-xs">Décris une image à gauche, choisis un style et clique sur <span className="text-fuchsia-300">Générer</span>. Propulsé par Flux — gratuit.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {gallery.map(g => (
                <motion.div key={g.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="group relative rounded-2xl overflow-hidden border border-white/10 bg-black/40 aspect-square">
                  {g.status === 'loading' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-fuchsia-500/5 to-purple-500/5">
                      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                      <Loader2 className="w-7 h-7 text-fuchsia-400 animate-spin" />
                      <span className="text-[11px] text-gray-400">Création…</span>
                    </div>
                  )}
                  {g.status === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                      <AlertCircle className="w-7 h-7 text-red-400" />
                      <span className="text-[10px] text-red-300 line-clamp-3">{g.error}</span>
                      <button onClick={() => removeItem(g.id)} className="text-[10px] text-gray-500 hover:text-gray-300 underline">retirer</button>
                    </div>
                  )}
                  {g.status === 'done' && g.src && (
                    <>
                      <img src={g.src} alt={g.prompt} className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightbox(g)} loading="lazy" />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-gray-300 line-clamp-2 mb-1.5">{g.prompt}</p>
                        <div className="flex items-center gap-1.5">
                          <IconBtn title="Ouvrir le dossier" onClick={() => g.path && electron.showItemInFolder?.(g.path)}><Download className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Ouvrir l'image" onClick={() => g.path && electron.openFile?.(g.path)}><Maximize2 className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Réutiliser prompt + seed" onClick={() => reuse(g)}><RotateCcw className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Copier le prompt" onClick={() => copyPrompt(g)}><Copy className="w-3.5 h-3.5" /></IconBtn>
                          <IconBtn title="Supprimer de la galerie" onClick={() => removeItem(g.id)}><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && lightbox.src && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setLightbox(null)}>
            <button className="absolute top-5 right-5 text-gray-400 hover:text-white" onClick={() => setLightbox(null)}><X className="w-7 h-7" /></button>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="max-w-full max-h-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
              <img src={lightbox.src} alt={lightbox.prompt} className="max-w-full max-h-[78vh] rounded-xl shadow-2xl object-contain" />
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="text-xs text-gray-400 max-w-xl text-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 select-text">{lightbox.prompt}</span>
                <span className="text-[11px] text-gray-500 px-2 py-1.5">{lightbox.width}×{lightbox.height} · {lightbox.model} · seed {lightbox.seed}</span>
                <button onClick={() => lightbox.path && electron.showItemInFolder?.(lightbox.path)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/30 flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Dossier</button>
                <button onClick={() => reuse(lightbox)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Réutiliser</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return <button title={title} onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-fuchsia-500/40 border border-white/15 text-gray-200 flex items-center justify-center transition-all">{children}</button>;
}
