import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, FolderOpen, Play, Square, Trash2, Plus, Save, Layers, Download,
  AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, RotateCcw, Sliders, Film,
} from 'lucide-react';

const api = () => (window as any).electronAPI;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const SELECT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer w-full shadow-sm backdrop-blur-md";
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-orange-500/50 transition-all w-full select-text shadow-sm";
const LABEL = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider";
const OPT = "bg-[#17120c] text-gray-200";

type Meta = { width: number; height: number; fps: number; codec: string; duration: number; size: number; hasAudio: boolean };
type S = {
  preset: string; container: string; encoder: string; rateMode: 'quality' | 'bitrate'; quality: number; bitrate: number; twoPass: boolean;
  encoderPreset: string; maxHeight: number; fps: string; cfr: boolean; audioMode: string; audioBitrate: number;
  deinterlace: boolean; denoise: string; deblock: boolean; sharpen: string; grayscale: boolean; rotate: number; webOptimize: boolean; subtitles: boolean; outputDir: string;
};
type Job = { id: string; inputPath: string; name: string; meta?: Meta; thumb?: string; status: 'idle' | 'running' | 'done' | 'error'; percent: number; stage?: string; outputPath?: string; error?: string; settings: S };

const CONTAINERS = ['mp4', 'mkv', 'webm'];
const HEIGHTS = [{ v: 0, l: 'Source' }, { v: 720, l: '720p' }, { v: 1080, l: '1080p' }, { v: 1440, l: '1440p' }, { v: 2160, l: '2160p (4K)' }];
const FPSES = ['same', '24', '25', '30', '50', '60'];
const ROTATIONS = [{ v: 0, l: '0°' }, { v: 90, l: '90°' }, { v: 180, l: '180°' }, { v: 270, l: '270°' }];

function defaults(outputDir: string): S {
  return { preset: '', container: 'mp4', encoder: 'x264', rateMode: 'quality', quality: 22, bitrate: 6000, twoPass: false, encoderPreset: 'medium', maxHeight: 0, fps: 'same', cfr: true, audioMode: 'aac', audioBitrate: 192, deinterlace: false, denoise: 'off', deblock: false, sharpen: 'off', grayscale: false, rotate: 0, webOptimize: true, subtitles: true, outputDir };
}
const BUILTIN = [
  { name: 'YouTube 1080p', icon: '▶️', patch: { encoder: 'x264', container: 'mp4', quality: 20, maxHeight: 1080, webOptimize: true } },
  { name: '4K HEVC', icon: '🎞️', patch: { encoder: 'x265', container: 'mp4', quality: 22, maxHeight: 2160 } },
  { name: 'Discord (8 Mo)', icon: '💬', patch: { encoder: 'x264', container: 'mp4', rateMode: 'bitrate', bitrate: 1200, maxHeight: 720, audioBitrate: 96 } },
  { name: 'Archivage MKV', icon: '📦', patch: { encoder: 'x265', container: 'mkv', quality: 18, audioMode: 'copy', subtitles: true } },
  { name: 'AV1 léger', icon: '🪶', patch: { encoder: 'svt_av1', container: 'mp4', quality: 30 } },
  { name: 'NVENC rapide', icon: '⚡', patch: { encoder: 'nvenc_h265', container: 'mp4', quality: 24, encoderPreset: 'medium' } },
];
const fmtSize = (b: number) => !b ? '—' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(1) + ' Mo';
const fmtDur = (s: number) => { if (!s) return '—'; const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${m}:${String(x).padStart(2, '0')}`; };

function Toggle({ on, onClick }: any) {
  return <button onClick={onClick} className="relative shrink-0 w-10 h-6 rounded-full transition-all duration-300" style={{ background: on ? 'linear-gradient(135deg,#f97316,#ef4444)' : 'rgba(255,255,255,0.12)', boxShadow: on ? '0 0 12px rgba(249,115,22,0.4)' : 'none' }}><span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300" style={{ left: on ? 'calc(100% - 22px)' : '2px' }} /></button>;
}
function Section({ title, icon, children }: any) {
  return <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden"><div className="flex items-center gap-2.5 px-4 py-3"><div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/15 border border-orange-500/30">{icon}</div><span className="text-sm font-semibold text-gray-200">{title}</span></div><div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">{children}</div></div>;
}
function Slider({ label, value, min, max, step = 1, onChange, suffix = '' }: any) {
  return <div><div className="flex justify-between mb-1"><span className="text-[11px] text-gray-400">{label}</span><span className="text-[11px] font-mono text-gray-200">{value}{suffix}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right,#f97316 ${((value - min) / (max - min)) * 100}%,rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%)` }} /></div>;
}

export default function HandBrake() {
  const electron = api();
  const [detect, setDetect] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  const [outputDir, setOutputDir] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [presets, setPresets] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ type: 'error' | 'info'; msg: string } | null>(null);
  const [installLog, setInstallLog] = useState('');
  const listenersRef = useRef(false);
  const jobsRef = useRef<Job[]>([]); jobsRef.current = jobs;
  const selected = jobs.find(j => j.id === selectedId) || null;
  const showToast = (type: 'error' | 'info', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); };

  useEffect(() => {
    (async () => {
      if (!electron) return;
      const def = await electron.getDefaultDownloads?.().catch(() => ''); if (def) setOutputDir(def);
      setDetect(await electron.hbDetect?.().catch(() => null));
      const p = await electron.hbPresetsLoad?.().catch(() => []); if (Array.isArray(p)) setPresets(p);
      const q = await electron.hbQueueLoad?.().catch(() => []);
      if (Array.isArray(q) && q.length) { const r = q.map((j: Job) => ({ ...j, status: (j.status === 'running' ? 'idle' : j.status) as Job['status'], percent: j.status === 'done' ? 100 : 0 })); setJobs(r); setSelectedId(r[0]?.id || null); }
    })();
  }, []);
  useEffect(() => { if (!electron?.hbQueueSave) return; const t = setTimeout(() => electron.hbQueueSave(jobs), 600); return () => clearTimeout(t); }, [jobs]);
  useEffect(() => {
    if (!electron || listenersRef.current) return; listenersRef.current = true;
    electron.onHbProgress?.((d: any) => { if (d.id === 'install') { if (d.log) setInstallLog(d.log); return; } setJobs(prev => prev.map(j => j.id === d.id ? { ...j, percent: d.percent != null ? d.percent : j.percent, stage: d.stage || j.stage } : j)); });
    electron.onHbComplete?.((d: any) => { setJobs(prev => prev.map(j => j.id === d.id ? { ...j, status: 'done', percent: 100, outputPath: d.outputPath, stage: 'Terminé' } : j)); setTimeout(() => runNext(), 400); });
    electron.onHbError?.((d: any) => { setJobs(prev => prev.map(j => j.id === d.id ? { ...j, status: 'error', error: d.error } : j)); setTimeout(() => runNext(), 400); });
  }, [electron]);

  const addFiles = useCallback(async (paths: string[]) => {
    if (!paths?.length) return;
    const nj: Job[] = paths.map(p => ({ id: uid(), inputPath: p, name: p.split(/[\\/]/).pop() || p, status: 'idle', percent: 0, settings: defaults(outputDir) }));
    setJobs(prev => [...prev, ...nj]); if (!selectedId && nj[0]) setSelectedId(nj[0].id);
    for (const j of nj) {
      electron.enhanceProbe?.(j.inputPath).then((m: any) => { if (m && !m.error) setJobs(prev => prev.map(x => x.id === j.id ? { ...x, meta: m } : x)); });
      electron.enhanceThumbnail?.(j.inputPath).then((t: string) => { if (t) setJobs(prev => prev.map(x => x.id === j.id ? { ...x, thumb: t } : x)); });
    }
  }, [outputDir, selectedId, electron]);
  const handleBrowse = async () => { const f = await electron.enhanceSelectFiles?.().catch(() => []); if (f?.length) addFiles(f); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const ps: string[] = []; for (const f of Array.from(e.dataTransfer.files)) { const p = (f as any).path; if (p) ps.push(p); } if (ps.length) addFiles(ps); };
  const removeJob = (id: string) => { setJobs(prev => prev.filter(j => j.id !== id)); if (selectedId === id) setSelectedId(jobsRef.current.find(j => j.id !== id)?.id || null); };
  const patch = (p: Partial<S>) => { if (!selectedId) return; setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, ...p } } : j)); };
  const applyToAll = () => { if (!selected) return; setJobs(prev => prev.map(j => ({ ...j, settings: { ...selected.settings } }))); showToast('info', 'Réglages appliqués à toute la file.'); };

  const startJob = (job: Job) => { setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'running', percent: 0, stage: 'Démarrage…', error: undefined } : j)); electron.hbStart?.({ id: job.id, inputPath: job.inputPath, ...job.settings, whenDone: 'none' }); };
  const runNext = () => { const l = jobsRef.current; if (l.some(j => j.status === 'running')) return; const n = l.find(j => j.status === 'idle'); if (n) startJob(n); };
  const startAll = () => { if (!jobs.some(j => j.status === 'running')) { const n = jobs.find(j => j.status === 'idle'); if (n) startJob(n); else showToast('info', 'Aucun élément en attente.'); } };
  const cancelJob = (job: Job) => { electron.hbCancel?.(job.id); setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'idle', percent: 0, stage: undefined } : j)); };
  const applyPreset = (p: Partial<S>) => { if (!selected) { showToast('info', 'Sélectionnez un fichier.'); return; } patch(p); showToast('info', 'Préréglage appliqué.'); };
  const savePreset = async () => { if (!selected) return; const name = prompt('Nom du préréglage :'); if (!name) return; const np = [...presets, { name, settings: selected.settings }]; setPresets(np); await electron.hbPresetsSave?.(np); showToast('info', 'Préréglage enregistré.'); };
  const browseOutput = async () => { const d = await electron.selectDirectory?.(); if (d) { setOutputDir(d); patch({ outputDir: d }); } };
  const install = async () => { setInstalling(true); const r = await electron.hbInstall?.().catch((e: any) => ({ ok: false, error: String(e) })); setInstalling(false); if (r?.ok) { showToast('info', 'HandBrake installé ✓'); setDetect((d: any) => ({ ...(d || {}), installed: true, presets: r.presets })); } else showToast('error', r?.error || 'Échec installation'); };

  if (detect && !detect.installed) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center border border-white/10"><Flame className="w-9 h-9 text-orange-400" /></div>
        <h2 className="text-2xl font-bold text-white">HandBrake</h2>
        <p className="text-gray-400 max-w-md text-sm">Le moteur HandBrake (open-source) sera téléchargé et installé automatiquement (~26 Mo). Tous les membres y ont accès, aucune licence requise.</p>
        {installing && installLog && <p className="text-[11px] text-gray-500 font-mono max-w-md truncate">{installLog}</p>}
        <button onClick={install} disabled={installing} className="px-5 py-2.5 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-200 hover:bg-orange-500/30 transition-all text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{installing ? 'Installation…' : 'Installer HandBrake'}
        </button>
      </div>
    );
  }

  const encoders = detect?.encoders || [];
  const isNvenc = /nvenc/.test(selected?.settings.encoder || '');
  const speedPresets = isNvenc ? (detect?.nvencPresets || []) : (detect?.encoderPresets || []);
  const denoiseOpts = detect?.denoise || ['off', 'light', 'medium', 'strong'];
  const sharpenOpts = detect?.sharpen || ['off', 'light', 'medium', 'strong'];
  const presetGroups = detect?.presets?.groups || {};

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/30 to-red-500/30 flex items-center justify-center border border-white/10"><Flame className="w-5 h-5 text-orange-400" /></div>
          <div><h2 className="text-lg font-bold text-white">HandBrake</h2><p className="text-[11px] text-gray-500">Compression vidéo · moteur HandBrakeCLI officiel{detect?.presets?.flat?.length ? ` · ${detect.presets.flat.length} préréglages` : ''}</p></div>
        </div>
      </div>

      <AnimatePresence>{toast && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`mx-6 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-orange-500/10 border-orange-500/30 text-orange-200'}`}>{toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}<span className="select-text">{toast.msg}</span></motion.div>)}</AnimatePresence>

      <div className="flex-1 overflow-hidden flex">
        {/* Queue */}
        <div className="w-[330px] shrink-0 border-r border-white/5 flex flex-col">
          <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={handleBrowse}
            className={`m-3 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 py-6 cursor-pointer ${dragOver ? 'border-orange-500/60 bg-orange-500/10' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'}`}>
            <Plus className="w-6 h-6 text-orange-400" /><p className="text-sm text-gray-300 font-medium">Glissez vos vidéos ici</p><p className="text-[11px] text-gray-500">ou cliquez · sélection multiple</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {jobs.length === 0 && <p className="text-center text-gray-600 text-xs mt-6">File d'attente vide</p>}
            {jobs.map(job => (
              <button key={job.id} onClick={() => setSelectedId(job.id)} className={`w-full text-left rounded-xl border p-2 flex gap-2.5 transition-all ${selectedId === job.id ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                <div className="w-16 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">{job.thumb ? <img src={job.thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-600" />}</div>
                <div className="flex-1 min-w-0"><p className="text-xs text-gray-200 truncate font-medium">{job.name}</p><p className="text-[10px] text-gray-500 truncate">{job.meta ? `${job.meta.width}×${job.meta.height} · ${fmtDur(job.meta.duration)} · ${fmtSize(job.meta.size)}` : 'Analyse…'}</p>
                  {job.status === 'running' && <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-orange-500 to-red-500" style={{ width: `${job.percent}%` }} /></div>}
                  {job.status === 'done' && <span className="text-[10px] text-green-400">✓ Terminé</span>}{job.status === 'error' && <span className="text-[10px] text-red-400">✕ Erreur</span>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); job.status === 'running' ? cancelJob(job) : removeJob(job.id); }} className="shrink-0 text-gray-600 hover:text-red-400 self-start">{job.status === 'running' ? <Square className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}</button>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-white/5"><button onClick={startAll} disabled={!jobs.length} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40" style={{ background: 'linear-gradient(135deg,rgba(249,115,22,0.75),rgba(239,68,68,0.75))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 20px rgba(249,115,22,0.3)' }}><Play className="w-4 h-4 fill-current" /> Encoder la file</button></div>
        </div>

        {/* Settings */}
        <div className="flex-1 overflow-y-auto">
          {!selected ? <div className="h-full flex items-center justify-center text-gray-600 text-sm">Sélectionnez un fichier pour configurer l'encodage</div> : (
            <div className="p-5 space-y-4 max-w-3xl">
              <div className="flex items-center gap-2 flex-wrap">
                {BUILTIN.map(p => <button key={p.name} onClick={() => applyPreset(p.patch as any)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 hover:border-orange-500/30 transition-all flex items-center gap-1.5"><span>{p.icon}</span>{p.name}</button>)}
                {presets.map((p: any, i: number) => <button key={'u' + i} onClick={() => applyPreset(p.settings)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-orange-500/10 border border-orange-500/30 hover:bg-orange-500/20 transition-all">⭐ {p.name}</button>)}
                <button onClick={savePreset} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"><Save className="w-3 h-3" /> Enregistrer</button>
              </div>

              <Section title="Préréglage & Format" icon={<Film className="w-3.5 h-3.5 text-orange-400" />}>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Préréglage HandBrake (base)</label>
                    <select className={SELECT + ' mt-1'} value={selected.settings.preset} onChange={e => patch({ preset: e.target.value })}>
                      <option value="" className={OPT}>Aucun (réglages manuels)</option>
                      {Object.entries(presetGroups).map(([g, names]: any) => (<optgroup key={g} label={g} className={OPT}>{names.map((n: string) => <option key={n} value={n} className={OPT}>{n}</option>)}</optgroup>))}
                    </select>
                  </div>
                  <div><label className={LABEL}>Conteneur</label><select className={SELECT + ' mt-1'} value={selected.settings.container} onChange={e => patch({ container: e.target.value })}>{CONTAINERS.map(c => <option key={c} className={OPT}>{c}</option>)}</select></div>
                </div>
                {selected.settings.container === 'mp4' && <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={selected.settings.webOptimize} onClick={() => patch({ webOptimize: !selected.settings.webOptimize })} /> Optimisé web (lecture progressive)</label>}
              </Section>

              <Section title="Vidéo" icon={<Sliders className="w-3.5 h-3.5 text-orange-400" />}>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Encodeur</label><select className={SELECT + ' mt-1'} value={selected.settings.encoder} onChange={e => patch({ encoder: e.target.value, encoderPreset: /nvenc/.test(e.target.value) ? 'medium' : 'medium' })}>{encoders.map((e: any) => <option key={e.v} value={e.v} className={OPT}>{e.l}</option>)}</select></div>
                  <div><label className={LABEL}>Vitesse d'encodage</label><select className={SELECT + ' mt-1'} value={selected.settings.encoderPreset} onChange={e => patch({ encoderPreset: e.target.value })}>{speedPresets.map((p: string) => <option key={p} className={OPT}>{p}</option>)}</select></div>
                </div>
                <div className="flex gap-2">
                  {(['quality', 'bitrate'] as const).map(m => <button key={m} onClick={() => patch({ rateMode: m })} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${selected.settings.rateMode === m ? 'bg-orange-500/30 text-orange-100 border border-orange-500/50' : 'bg-white/5 text-gray-400 border border-white/10'}`}>{m === 'quality' ? 'Qualité constante (RF)' : 'Débit moyen'}</button>)}
                </div>
                {selected.settings.rateMode === 'quality'
                  ? <Slider label="Qualité RF (bas = meilleur)" value={selected.settings.quality} min={0} max={51} onChange={(v: number) => patch({ quality: v })} />
                  : <div className="flex items-center gap-3"><div className="flex-1"><label className={LABEL}>Débit vidéo (kbit/s)</label><input type="number" className={INPUT + ' mt-1'} value={selected.settings.bitrate} onChange={e => patch({ bitrate: Number(e.target.value) })} /></div><label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mt-4"><Toggle on={selected.settings.twoPass} onClick={() => patch({ twoPass: !selected.settings.twoPass })} /> 2 passes</label></div>}
                <div className="grid grid-cols-3 gap-3">
                  <div><label className={LABEL}>Résolution max</label><select className={SELECT + ' mt-1'} value={selected.settings.maxHeight} onChange={e => patch({ maxHeight: Number(e.target.value) })}>{HEIGHTS.map(h => <option key={h.v} value={h.v} className={OPT}>{h.l}</option>)}</select></div>
                  <div><label className={LABEL}>Images / s</label><select className={SELECT + ' mt-1'} value={selected.settings.fps} onChange={e => patch({ fps: e.target.value })}>{FPSES.map(f => <option key={f} value={f} className={OPT}>{f === 'same' ? 'Source' : f}</option>)}</select></div>
                  <div><label className={LABEL}>Rotation</label><select className={SELECT + ' mt-1'} value={selected.settings.rotate} onChange={e => patch({ rotate: Number(e.target.value) })}>{ROTATIONS.map(r => <option key={r.v} value={r.v} className={OPT}>{r.l}</option>)}</select></div>
                </div>
              </Section>

              <Section title="Filtres" icon={<Sliders className="w-3.5 h-3.5 text-orange-400" />}>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Débruitage (NLMeans)</label><select className={SELECT + ' mt-1'} value={selected.settings.denoise} onChange={e => patch({ denoise: e.target.value })}>{denoiseOpts.map((d: string) => <option key={d} value={d} className={OPT}>{d === 'off' ? 'Aucun' : d}</option>)}</select></div>
                  <div><label className={LABEL}>Netteté (Lapsharp)</label><select className={SELECT + ' mt-1'} value={selected.settings.sharpen} onChange={e => patch({ sharpen: e.target.value })}>{sharpenOpts.map((d: string) => <option key={d} value={d} className={OPT}>{d === 'off' ? 'Aucun' : d}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={selected.settings.deinterlace} onClick={() => patch({ deinterlace: !selected.settings.deinterlace })} /> Désentrelacement (decomb)</label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={selected.settings.deblock} onClick={() => patch({ deblock: !selected.settings.deblock })} /> Deblock</label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={selected.settings.grayscale} onClick={() => patch({ grayscale: !selected.settings.grayscale })} /> Noir & blanc</label>
                </div>
              </Section>

              <Section title="Audio & Sortie" icon={<Download className="w-3.5 h-3.5 text-orange-400" />}>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={LABEL}>Audio</label><select className={SELECT + ' mt-1'} value={selected.settings.audioMode} onChange={e => patch({ audioMode: e.target.value })}><option value="copy" className={OPT}>Copier (sans ré-encodage)</option><option value="aac" className={OPT}>{selected.settings.container === 'webm' ? 'Opus' : 'AAC'}</option><option value="none" className={OPT}>Aucun</option></select></div>
                  {selected.settings.audioMode === 'aac' && <div><label className={LABEL}>Débit audio (kbit/s)</label><input type="number" className={INPUT + ' mt-1'} value={selected.settings.audioBitrate} onChange={e => patch({ audioBitrate: Number(e.target.value) })} /></div>}
                </div>
                {selected.settings.container !== 'webm' && <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={selected.settings.subtitles} onClick={() => patch({ subtitles: !selected.settings.subtitles })} /> Conserver les sous-titres</label>}
                <div className="flex gap-2 items-end"><div className="flex-1"><label className={LABEL}>Dossier de sortie</label><input className={INPUT + ' mt-1'} value={selected.settings.outputDir} onChange={e => patch({ outputDir: e.target.value })} placeholder="Dossier de destination…" /></div><button onClick={browseOutput} className="px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button></div>
              </Section>

              <div className="flex items-center gap-3 pt-1">
                {selected.status === 'running' ? <button onClick={() => cancelJob(selected)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 flex items-center justify-center gap-2"><Square className="w-4 h-4" /> Arrêter ({selected.percent}% · {selected.stage})</button>
                  : selected.status === 'done' ? <><button onClick={() => selected.outputPath && electron.showItemInFolder?.(selected.outputPath)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-green-500/20 border border-green-500/40 text-green-200 hover:bg-green-500/30 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Terminé — Ouvrir</button><button onClick={() => startJob(selected)} className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button></>
                    : <button onClick={() => startJob(selected)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all" style={{ background: 'linear-gradient(135deg,rgba(249,115,22,0.75),rgba(239,68,68,0.75))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 24px rgba(249,115,22,0.4)' }}><Play className="w-4 h-4 fill-current" /> Encoder cette vidéo</button>}
                <button onClick={applyToAll} title="Appliquer à toute la file" className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><Layers className="w-4 h-4" /> À tous</button>
              </div>
              {selected.status === 'error' && selected.error && <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-xl p-3 whitespace-pre-wrap select-text">{selected.error}</pre>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
