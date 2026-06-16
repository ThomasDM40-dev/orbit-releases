import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Scissors, FolderOpen, Play, Square, Trash2, Plus, Layers, Download, Eye,
  AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, RotateCcw, Wand2,
} from 'lucide-react';

const api = () => (window as any).electronAPI;
const mediaUrl = (p: string) => 'media://' + encodeURI(p.replace(/\\/g, '/'));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const SELECT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-teal-500/50 transition-all w-full shadow-sm";
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-teal-500/50 transition-all w-full";
const LABEL = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider";
const OPT = "bg-[#0d1414] text-gray-200";
const CHECKER = { backgroundImage: 'linear-gradient(45deg,#2a2a2a 25%,transparent 25%),linear-gradient(-45deg,#2a2a2a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#2a2a2a 75%),linear-gradient(-45deg,transparent 75%,#2a2a2a 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0,0 10px,10px -10px,-10px 0', backgroundColor: '#1a1a1a' } as React.CSSProperties;

type Meta = { width: number; height: number; fps: number; codec: string; duration: number; size: number; hasAudio: boolean };
type S = { model: string; quality: string; mode: string; transparentFormat: string; color: string; blurStrength: number; bgImage: string; choke: number; feather: number; outputDir: string };
type Job = { id: string; inputPath: string; name: string; meta?: Meta; thumb?: string; status: 'idle' | 'running' | 'done' | 'error'; percent: number; stage?: string; outputPath?: string; error?: string; settings: S };

const MODES = [
  { v: 'transparent', l: 'Transparent', emoji: '🫧' },
  { v: 'green', l: 'Fond vert', emoji: '🟩' },
  { v: 'color', l: 'Couleur', emoji: '🎨' },
  { v: 'blur', l: 'Flou', emoji: '🌫️' },
  { v: 'image', l: 'Image', emoji: '🖼️' },
];
function defaults(outputDir: string): S { return { model: 'mobilenetv3', quality: 'balanced', mode: 'transparent', transparentFormat: 'webm', color: '#00ff00', blurStrength: 20, bgImage: '', choke: 0, feather: 0.6, outputDir }; }
const fmtDur = (s?: number) => { if (!s) return '—'; const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}`; };
const hexToFF = (h: string) => '0x' + (h || '#000000').replace('#', '').toUpperCase();

function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }: any) {
  return <div><div className="flex justify-between mb-1"><span className="text-[11px] text-gray-400">{label}</span><span className="text-[11px] font-mono text-gray-200">{value}{suffix}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right,#14b8a6 ${((value - min) / (max - min)) * 100}%,rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%)` }} /></div>;
}

export default function MattingStudio() {
  const electron = api();
  const [detect, setDetect] = useState<any>(null);
  const [outputDir, setOutputDir] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ type: 'info' | 'error'; msg: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState('');
  const jobsRef = useRef<Job[]>([]); jobsRef.current = jobs;
  const listenersRef = useRef(false);
  const selected = jobs.find(j => j.id === selectedId) || null;
  const showToast = (type: 'info' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4500); };

  useEffect(() => { (async () => { if (!electron) return; const def = await electron.getDefaultDownloads?.().catch(() => ''); if (def) setOutputDir(def); setDetect(await electron.mattingDetect?.().catch(() => null)); })(); }, []);
  useEffect(() => {
    if (!electron || listenersRef.current) return; listenersRef.current = true;
    electron.onMattingProgress?.((d: any) => { if (d.id === 'install') { if (d.log) setInstallLog(d.log); return; } setJobs(prev => prev.map(j => j.id === d.id ? { ...j, percent: d.percent ?? j.percent, stage: d.stage || j.stage } : j)); });
    electron.onMattingComplete?.((d: any) => { setJobs(prev => prev.map(j => j.id === d.id ? { ...j, status: 'done', percent: 100, outputPath: d.outputPath, stage: 'Terminé' } : j)); setTimeout(() => runNext(), 400); });
    electron.onMattingError?.((d: any) => { setJobs(prev => prev.map(j => j.id === d.id ? { ...j, status: 'error', error: d.error } : j)); setTimeout(() => runNext(), 400); });
  }, [electron]);

  const addFiles = useCallback(async (paths: string[]) => {
    if (!paths?.length) return;
    const nj: Job[] = paths.map(p => ({ id: uid(), inputPath: p, name: p.split(/[\\/]/).pop() || p, status: 'idle', percent: 0, settings: defaults(outputDir) }));
    setJobs(prev => [...prev, ...nj]); if (!selectedId && nj[0]) setSelectedId(nj[0].id);
    for (const j of nj) { electron.enhanceProbe?.(j.inputPath).then((m: any) => { if (m && !m.error) setJobs(prev => prev.map(x => x.id === j.id ? { ...x, meta: m } : x)); }); electron.enhanceThumbnail?.(j.inputPath).then((t: string) => { if (t) setJobs(prev => prev.map(x => x.id === j.id ? { ...x, thumb: t } : x)); }); }
  }, [outputDir, selectedId, electron]);
  const handleBrowse = async () => { const f = await electron.enhanceSelectFiles?.().catch(() => []); if (f?.length) addFiles(f); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const ps: string[] = []; for (const f of Array.from(e.dataTransfer.files)) { const p = (f as any).path; if (p) ps.push(p); } if (ps.length) addFiles(ps); };
  const removeJob = (id: string) => { setJobs(prev => prev.filter(j => j.id !== id)); if (selectedId === id) setSelectedId(jobsRef.current.find(j => j.id !== id)?.id || null); };
  const patch = (p: Partial<S>) => { if (!selectedId) return; setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, ...p } } : j)); setPreviewUrl(''); };
  const applyToAll = () => { if (!selected) return; setJobs(prev => prev.map(j => ({ ...j, settings: { ...selected.settings } }))); showToast('info', 'Réglages appliqués à toute la file.'); };

  const toSpec = (job: Job, preview?: any) => ({ id: job.id, inputPath: job.inputPath, model: job.settings.model, quality: job.settings.quality, mode: job.settings.mode, transparentFormat: job.settings.transparentFormat, color: hexToFF(job.settings.color), blurStrength: job.settings.blurStrength, bgImage: job.settings.bgImage || undefined, choke: job.settings.choke, feather: job.settings.feather, outputDir: job.settings.outputDir || outputDir, preview, whenDone: 'none' });
  const startJob = (job: Job) => { setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'running', percent: 0, stage: 'Démarrage…', error: undefined } : j)); electron.mattingStart?.(toSpec(job)); };
  const runNext = () => { const l = jobsRef.current; if (l.some(j => j.status === 'running')) return; const n = l.find(j => j.status === 'idle'); if (n) startJob(n); };
  const startAll = () => { if (!jobs.some(j => j.status === 'running')) { const n = jobs.find(j => j.status === 'idle'); if (n) startJob(n); else showToast('info', 'Aucun élément en attente.'); } };
  const cancelJob = (job: Job) => { electron.mattingCancel?.(job.id); setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'idle', percent: 0, stage: undefined } : j)); };
  const browseOutput = async () => { const d = await electron.selectDirectory?.(); if (d) { setOutputDir(d); patch({ outputDir: d }); } };
  const browseBg = async () => { const f = await electron.selectImage?.().catch(() => null); if (f) patch({ bgImage: f }); };
  const installModel = async (key: string) => { setInstalling(true); const r = await electron.mattingInstall?.(key).catch((e: any) => ({ ok: false, error: String(e) })); setInstalling(false); if (r?.ok) { showToast('info', 'Modèle installé ✓'); setDetect(await electron.mattingDetect?.()); } else showToast('error', r?.error || 'Échec'); };
  const genPreview = async () => { if (!selected) return; setPreviewing(true); setPreviewUrl(''); const r = await electron.mattingPreview?.(toSpec(selected, { start: 0, duration: 3 })).catch((e: any) => ({ error: String(e) })); setPreviewing(false); if (r?.outputPath) setPreviewUrl(mediaUrl(r.outputPath)); else showToast('error', r?.error || 'Aperçu impossible.'); };

  if (detect && detect.ready === false) {
    return <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8"><div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10"><Scissors className="w-9 h-9 text-teal-400" /></div><h2 className="text-2xl font-bold text-white">Moteur IA indisponible</h2><p className="text-gray-400 max-w-md text-sm">onnxruntime n'a pas pu se charger. Réinstallez l'application.</p><p className="text-[11px] text-gray-600">{detect.err}</p></div>;
  }

  const s = selected?.settings;
  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/30 to-cyan-500/30 flex items-center justify-center border border-white/10"><Scissors className="w-5 h-5 text-teal-400" /></div>
          <div><h2 className="text-lg font-bold text-white">Suppression de fond IA</h2><p className="text-[11px] text-gray-500">Robust Video Matting · détourage en alpha, sans fond vert</p></div>
        </div>
      </div>

      <AnimatePresence>{toast && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`mx-6 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-teal-500/10 border-teal-500/30 text-teal-200'}`}>{toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}<span className="select-text">{toast.msg}</span></motion.div>)}</AnimatePresence>

      <div className="flex-1 overflow-hidden flex">
        {/* Queue */}
        <div className="w-[320px] shrink-0 border-r border-white/5 flex flex-col">
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={handleBrowse} className={`m-3 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 py-6 cursor-pointer ${dragOver ? 'border-teal-500/60 bg-teal-500/10' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'}`}>
            <Plus className="w-6 h-6 text-teal-400" /><p className="text-sm text-gray-300 font-medium">Glissez vos vidéos ici</p><p className="text-[11px] text-gray-500">ou cliquez · sélection multiple</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {jobs.length === 0 && <p className="text-center text-gray-600 text-xs mt-6">File d'attente vide</p>}
            {jobs.map(job => (
              <button key={job.id} onClick={() => { setSelectedId(job.id); setPreviewUrl(''); }} className={`w-full text-left rounded-xl border p-2 flex gap-2.5 transition-all ${selectedId === job.id ? 'border-teal-500/50 bg-teal-500/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                <div className="w-16 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">{job.thumb ? <img src={job.thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-600" />}</div>
                <div className="flex-1 min-w-0"><p className="text-xs text-gray-200 truncate font-medium">{job.name}</p><p className="text-[10px] text-gray-500 truncate">{job.meta ? `${job.meta.width}×${job.meta.height} · ${fmtDur(job.meta.duration)}` : 'Analyse…'}</p>{job.status === 'running' && <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${job.percent}%` }} /></div>}{job.status === 'done' && <span className="text-[10px] text-green-400">✓ Terminé</span>}{job.status === 'error' && <span className="text-[10px] text-red-400">✕ Erreur</span>}</div>
                <button onClick={(e) => { e.stopPropagation(); job.status === 'running' ? cancelJob(job) : removeJob(job.id); }} className="shrink-0 text-gray-600 hover:text-red-400 self-start">{job.status === 'running' ? <Square className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}</button>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-white/5"><button onClick={startAll} disabled={!jobs.length} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40" style={{ background: 'linear-gradient(135deg,rgba(20,184,166,0.75),rgba(6,182,212,0.75))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 20px rgba(20,184,166,0.3)' }}><Play className="w-4 h-4 fill-current" /> Lancer la file</button></div>
        </div>

        {/* Settings */}
        <div className="flex-1 overflow-y-auto">
          {!selected || !s ? <div className="h-full flex items-center justify-center text-gray-600 text-sm">Sélectionnez un fichier pour configurer le détourage</div> : (
            <div className="p-5 grid grid-cols-2 gap-5 max-w-5xl">
              {/* Left col: settings */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
                  <div className="flex items-center gap-2"><Wand2 className="w-3.5 h-3.5 text-teal-400" /><span className="text-sm font-semibold text-gray-200">Modèle & qualité</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={LABEL}>Modèle IA</label>
                      <select className={SELECT + ' mt-1'} value={s.model} onChange={e => patch({ model: e.target.value })}>
                        {(detect?.models || [{ key: 'mobilenetv3', label: 'MobileNetV3 (rapide)' }, { key: 'resnet50', label: 'ResNet50 (qualité)' }]).map((m: any) => <option key={m.key} value={m.key} className={OPT}>{m.label}{m.installed === false ? ' — à télécharger' : ''}</option>)}
                      </select>
                    </div>
                    <div><label className={LABEL}>Vitesse / qualité</label>
                      <select className={SELECT + ' mt-1'} value={s.quality} onChange={e => patch({ quality: e.target.value })}><option value="fast" className={OPT}>Rapide (512p)</option><option value="balanced" className={OPT}>Équilibré (960p)</option><option value="max" className={OPT}>Max (source)</option></select>
                    </div>
                  </div>
                  {detect?.models?.find((m: any) => m.key === s.model && !m.installed) && (
                    <button onClick={() => installModel(s.model)} disabled={installing} className="w-full text-xs py-2 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-200 flex items-center justify-center gap-1.5 disabled:opacity-50">{installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{installing ? (installLog || 'Téléchargement…') : 'Télécharger ce modèle'}</button>
                  )}
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
                  <span className="text-sm font-semibold text-gray-200">Arrière-plan</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {MODES.map(m => <button key={m.v} onClick={() => patch({ mode: m.v })} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${s.mode === m.v ? 'bg-teal-500/30 text-teal-100 border border-teal-500/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}><span>{m.emoji}</span>{m.l}</button>)}
                  </div>
                  {s.mode === 'transparent' && (
                    <div><label className={LABEL}>Format (avec alpha)</label>
                      <select className={SELECT + ' mt-1'} value={s.transparentFormat} onChange={e => patch({ transparentFormat: e.target.value })}><option value="webm" className={OPT}>WebM (VP9 · web/montage)</option><option value="prores" className={OPT}>ProRes 4444 (.mov · pro)</option><option value="png" className={OPT}>Séquence PNG (VFX)</option></select>
                      <p className="text-[10px] text-gray-500 mt-1">Le fond devient transparent — idéal incrustation AE / Premiere.</p>
                    </div>
                  )}
                  {s.mode === 'color' && <div><label className={LABEL}>Couleur de fond</label><div className="flex items-center gap-2 mt-1"><input type="color" value={s.color} onChange={e => patch({ color: e.target.value })} className="w-10 h-9 rounded-lg bg-transparent border border-white/10 cursor-pointer" /><input className={INPUT} value={s.color} onChange={e => patch({ color: e.target.value })} /></div></div>}
                  {s.mode === 'blur' && <Slider label="Intensité du flou" value={s.blurStrength} min={2} max={60} onChange={(v: number) => patch({ blurStrength: v })} />}
                  {s.mode === 'image' && <div><label className={LABEL}>Image de fond</label><div className="flex gap-2 mt-1"><input className={INPUT} value={s.bgImage} onChange={e => patch({ bgImage: e.target.value })} placeholder="Choisir une image…" /><button onClick={browseBg} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button></div></div>}
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
                  <span className="text-sm font-semibold text-gray-200">Affinage des bords</span>
                  <Slider label="Adoucissement (anti-crénelage)" value={s.feather} min={0} max={4} step={0.1} onChange={(v: number) => patch({ feather: v })} suffix="px" />
                  <Slider label="Resserrer ◀ / Élargir ▶ le masque" value={s.choke} min={-40} max={40} onChange={(v: number) => patch({ choke: v })} />
                  <p className="text-[10px] text-gray-500">Resserrer enlève le liseré de fond autour du sujet ; adoucir lisse les contours.</p>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-3">
                  <span className="text-sm font-semibold text-gray-200">Sortie</span>
                  <div className="flex gap-2 items-end"><div className="flex-1"><label className={LABEL}>Dossier</label><input className={INPUT + ' mt-1'} value={s.outputDir} onChange={e => patch({ outputDir: e.target.value })} placeholder="Dossier de destination…" /></div><button onClick={browseOutput} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button></div>
                </div>

                <div className="flex items-center gap-3">
                  {selected.status === 'running' ? <button onClick={() => cancelJob(selected)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 flex items-center justify-center gap-2"><Square className="w-4 h-4" /> Arrêter ({selected.percent}% · {selected.stage})</button>
                    : selected.status === 'done' ? <><button onClick={() => selected.outputPath && electron.showItemInFolder?.(selected.outputPath)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-green-500/20 border border-green-500/40 text-green-200 hover:bg-green-500/30 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Terminé — Ouvrir</button><button onClick={() => startJob(selected)} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button></>
                      : <button onClick={() => startJob(selected)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all" style={{ background: 'linear-gradient(135deg,rgba(20,184,166,0.78),rgba(6,182,212,0.78))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 24px rgba(20,184,166,0.4)' }}><Scissors className="w-4 h-4" /> Détourer</button>}
                  <button onClick={applyToAll} title="Appliquer à toute la file" className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><Layers className="w-4 h-4" /></button>
                </div>
                {selected.status === 'error' && selected.error && <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-xl p-3 whitespace-pre-wrap select-text">{selected.error}</pre>}
              </div>

              {/* Right col: preview */}
              <div className="space-y-3">
                <button onClick={genPreview} disabled={previewing} className="w-full px-4 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,rgba(20,184,166,0.6),rgba(6,182,212,0.6))', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>{previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}{previewing ? 'Génération…' : 'Aperçu (3s)'}</button>
                <div className="rounded-2xl border border-white/10 overflow-hidden aspect-video flex items-center justify-center" style={CHECKER}>
                  {previewUrl ? <video src={previewUrl} className="max-h-full max-w-full" autoPlay loop muted controls />
                    : selected.thumb ? <img src={selected.thumb} alt="" className="max-h-full max-w-full opacity-60" />
                      : <p className="text-xs text-gray-500">Générez un aperçu pour visualiser le détourage</p>}
                </div>
                <p className="text-[10px] text-gray-500 text-center">Damier = zones transparentes. L'aperçu applique vos réglages sur 3 s.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
