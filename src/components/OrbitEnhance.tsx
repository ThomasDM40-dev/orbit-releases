import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, FolderOpen, Play, Square, Trash2, Plus, Cpu, HardDrive, Gauge,
  Layers, Film, Wand2, Crosshair, Download, Save, AlertCircle, CheckCircle2,
  Loader2, Image as ImageIcon, Eye, RotateCcw, SlidersHorizontal,
} from 'lucide-react';
import SegmentedTabs from './SegmentedTabs';

const api = () => (window as any).electronAPI;
const mediaUrl = (p: string) => 'media://' + encodeURI(p.replace(/\\/g, '/'));
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const SELECT_CLS = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 hover:border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all cursor-pointer w-full shadow-sm backdrop-blur-md";
const INPUT_CLS = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 hover:border-white/20 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all w-full select-text shadow-sm backdrop-blur-md";
const LABEL_CLS = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider";
const OPT = "bg-[#0f1620] text-gray-200";

type Meta = { width: number; height: number; fps: number; codec: string; duration: number; size: number; hasAudio: boolean; audioCodec: string };
type Settings = {
  upscaleEnabled: boolean; upscaleModel: string; scaleMode: 'scale' | 'resolution'; scale: number;
  resPreset: string; targetW: number; targetH: number; tile: number; tta: boolean;
  restoreEnabled: boolean;
  restore: { deinterlace: boolean; denoise: string; temporalDenoise: boolean; deblock: boolean; deband: boolean; detailRecovery: boolean; color: { brightness: number; contrast: number; saturation: number; gamma: number } };
  stabEnabled: boolean; stab: { shakiness: number; smoothing: number; zoom: number; optzoom: boolean };
  interpEnabled: boolean; fps: number; fpsPreset: string; slowmo: number;
  sharpen: number;
  format: string; codec: string; quality: number; audioCopy: boolean; outputDir: string;
  device: string;
};
type Job = {
  id: string; inputPath: string; name: string; meta?: Meta; thumb?: string;
  status: 'idle' | 'running' | 'done' | 'error'; percent: number; stage?: string;
  outputPath?: string; error?: string; settings: Settings;
};

const RES_PRESETS = ['Auto', '720p', '1080p', '1440p', '4K', '8K', 'Personnalisé'];
const SCALES = [2, 3, 4, 6, 8];
const FPS_PRESETS = ['Conserver', '24', '30', '50', '60', '120', 'Personnalisé'];
const FORMATS = ['MP4', 'MOV', 'MKV', 'WEBM'];
const CODECS = [{ v: 'h264', l: 'H.264' }, { v: 'h265', l: 'H.265 (HEVC)' }, { v: 'av1', l: 'AV1' }, { v: 'vp9', l: 'VP9' }, { v: 'prores', l: 'ProRes' }];
const CONTAINER_CODECS: Record<string, string[]> = { MP4: ['h264', 'h265', 'av1'], MOV: ['h264', 'h265', 'prores'], MKV: ['h264', 'h265', 'av1', 'vp9', 'prores'], WEBM: ['vp9', 'av1'] };
const DENOISE = [{ v: 'off', l: 'Aucun' }, { v: 'light', l: 'Léger' }, { v: 'medium', l: 'Moyen' }, { v: 'strong', l: 'Fort' }];

function defaultSettings(outputDir: string): Settings {
  return {
    upscaleEnabled: true, upscaleModel: 'video', scaleMode: 'scale', scale: 2,
    resPreset: 'Auto', targetW: 3840, targetH: 2160, tile: 0, tta: false,
    restoreEnabled: false,
    restore: { deinterlace: false, denoise: 'off', temporalDenoise: false, deblock: false, deband: false, detailRecovery: false, color: { brightness: 0, contrast: 0, saturation: 0, gamma: 100 } },
    stabEnabled: false, stab: { shakiness: 5, smoothing: 10, zoom: 0, optzoom: true },
    interpEnabled: false, fps: 60, fpsPreset: '60', slowmo: 1,
    sharpen: 0,
    format: 'MP4', codec: 'h264', quality: 75, audioCopy: true, outputDir,
    device: 'auto',
  };
}

const BUILTIN_PRESETS: { name: string; icon: string; patch: Partial<Settings> }[] = [
  { name: 'Anime', icon: '🎌', patch: { upscaleEnabled: true, upscaleModel: 'anime', scale: 2, sharpen: 25 } },
  { name: 'Gaming 60→120', icon: '🎮', patch: { upscaleEnabled: true, upscaleModel: 'video', scale: 2, interpEnabled: true, fps: 120, fpsPreset: '120' } },
  { name: 'Film', icon: '🎬', patch: { upscaleEnabled: true, upscaleModel: 'photo', scale: 2, codec: 'h265', quality: 82, format: 'MKV' } },
  { name: 'Vieilles vidéos', icon: '📼', patch: { upscaleEnabled: true, upscaleModel: 'video', scale: 2, restoreEnabled: true, restore: { deinterlace: true, denoise: 'medium', temporalDenoise: true, deblock: true, deband: true, detailRecovery: true, color: { brightness: 0, contrast: 0, saturation: 0, gamma: 100 } } } },
  { name: 'TikTok', icon: '📱', patch: { upscaleEnabled: true, upscaleModel: 'video', scaleMode: 'resolution', resPreset: '1080p', sharpen: 20 } },
  { name: 'Stabiliser', icon: '🎥', patch: { upscaleEnabled: false, stabEnabled: true } },
  { name: 'Qualité Max', icon: '💎', patch: { upscaleEnabled: true, upscaleModel: 'photo', scale: 4, codec: 'prores', quality: 95, format: 'MOV', tta: true } },
];

const fmtSize = (b: number) => !b ? '—' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(1) + ' Mo';
const fmtDur = (s: number) => { if (!s) return '—'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };

export default function OrbitEnhance() {
  const electron = api();
  const [detect, setDetect] = useState<any>(null);
  const [gpuList, setGpuList] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [outputDir, setOutputDir] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState('queue');
  const [subTabs, setSubTabs] = useState([
    { id: 'queue', label: 'File & Réglages', visible: true },
    { id: 'preview', label: 'Aperçu Avant/Après', visible: true },
    { id: 'perf', label: 'Performance GPU', visible: true },
  ]);
  const [presets, setPresets] = useState<any[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [toast, setToast] = useState<{ type: 'error' | 'info'; msg: string } | null>(null);
  const listenersRef = useRef(false);
  const jobsRef = useRef<Job[]>([]); jobsRef.current = jobs;
  const selected = jobs.find(j => j.id === selectedId) || null;

  const showToast = (type: 'error' | 'info', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 5000); };

  useEffect(() => {
    (async () => {
      if (!electron) return;
      const def = await electron.getDefaultDownloads?.().catch(() => '');
      if (def) setOutputDir(def);
      setDetect(await electron.enhanceDetect?.().catch(() => null));
      const g = await electron.enhanceGpus?.().catch(() => []); if (g) setGpuList(g);
      const p = await electron.enhancePresetsLoad?.().catch(() => []); if (Array.isArray(p)) setPresets(p);
      const q = await electron.enhanceQueueLoad?.().catch(() => []);
      if (Array.isArray(q) && q.length) {
        const restored = q.map((j: Job) => ({ ...j, status: (j.status === 'running' ? 'idle' : j.status) as Job['status'], percent: j.status === 'done' ? 100 : 0 }));
        setJobs(restored); setSelectedId(restored[0]?.id || null);
      }
    })();
  }, []);

  useEffect(() => { if (!electron?.enhanceQueueSave) return; const t = setTimeout(() => electron.enhanceQueueSave(jobs), 600); return () => clearTimeout(t); }, [jobs]);

  useEffect(() => {
    if (!electron?.enhanceGpuStats) return;
    let alive = true;
    const tick = async () => { const s = await electron.enhanceGpuStats().catch(() => null); if (alive && s) setStats(s); };
    tick(); const iv = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (!electron || listenersRef.current) return;
    listenersRef.current = true;
    electron.onEnhanceProgress?.((d: any) => {
      setJobs(prev => prev.map(j => j.id === d.id ? { ...j, percent: d.percent != null ? d.percent : j.percent, stage: d.stage || j.stage } : j));
    });
    electron.onEnhanceComplete?.((d: any) => {
      setJobs(prev => prev.map(j => j.id === d.id ? { ...j, status: 'done', percent: 100, outputPath: d.outputPath, stage: 'Terminé' } : j));
      setTimeout(() => runNext(), 400);
    });
    electron.onEnhanceError?.((d: any) => {
      setJobs(prev => prev.map(j => j.id === d.id ? { ...j, status: 'error', error: d.error } : j));
      setTimeout(() => runNext(), 400);
    });
  }, [electron]);

  const addFiles = useCallback(async (paths: string[]) => {
    if (!paths?.length) return;
    const nj: Job[] = paths.map(p => ({ id: uid(), inputPath: p, name: p.split(/[\\/]/).pop() || p, status: 'idle', percent: 0, settings: defaultSettings(outputDir) }));
    setJobs(prev => [...prev, ...nj]);
    if (!selectedId && nj[0]) setSelectedId(nj[0].id);
    for (const j of nj) {
      electron.enhanceProbe?.(j.inputPath).then((m: any) => { if (m && !m.error) setJobs(prev => prev.map(x => x.id === j.id ? { ...x, meta: m } : x)); });
      electron.enhanceThumbnail?.(j.inputPath).then((t: string) => { if (t) setJobs(prev => prev.map(x => x.id === j.id ? { ...x, thumb: t } : x)); });
    }
  }, [outputDir, selectedId, electron]);

  const handleBrowse = async () => { const f = await electron.enhanceSelectFiles?.().catch(() => []); if (f?.length) addFiles(f); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const paths: string[] = []; for (const f of Array.from(e.dataTransfer.files)) { const p = (f as any).path; if (p) paths.push(p); }
    if (paths.length) addFiles(paths);
  };
  const removeJob = (id: string) => { setJobs(prev => prev.filter(j => j.id !== id)); if (selectedId === id) setSelectedId(jobsRef.current.find(j => j.id !== id)?.id || null); };
  const patch = (p: Partial<Settings>) => { if (!selectedId) return; setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, ...p } } : j)); };
  const patchRestore = (p: Partial<Settings['restore']>) => { if (!selectedId) return; setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, restore: { ...j.settings.restore, ...p } } } : j)); };
  const patchColor = (p: Partial<Settings['restore']['color']>) => { if (!selectedId) return; setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, restore: { ...j.settings.restore, color: { ...j.settings.restore.color, ...p } } } } : j)); };
  const patchStab = (p: Partial<Settings['stab']>) => { if (!selectedId) return; setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, stab: { ...j.settings.stab, ...p } } } : j)); };

  const applyToAll = () => { if (!selected) return; setJobs(prev => prev.map(j => ({ ...j, settings: { ...selected.settings } }))); showToast('info', 'Réglages appliqués à toute la file.'); };

  const toSpec = (job: Job, preview?: { start: number; duration: number }) => {
    const s = job.settings;
    let fps = s.fps;
    if (s.fpsPreset === 'Conserver') fps = job.meta?.fps || 60;
    else if (s.fpsPreset !== 'Personnalisé') fps = parseInt(s.fpsPreset) || s.fps;
    return { id: job.id, inputPath: job.inputPath, settings: { ...s, fps }, preview, whenDone: 'none' };
  };

  const startJob = (job: Job) => {
    if (!detect?.ready) { showToast('error', 'Moteur indisponible.'); return; }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'running', percent: 0, stage: 'Démarrage…', error: undefined } : j));
    electron.enhanceStart?.(toSpec(job));
  };
  const runNext = () => { const l = jobsRef.current; if (l.some(j => j.status === 'running')) return; const n = l.find(j => j.status === 'idle'); if (n) startJob(n); };
  const startAll = () => { if (!jobs.some(j => j.status === 'running')) { const n = jobs.find(j => j.status === 'idle'); if (n) startJob(n); else showToast('info', 'Aucun élément en attente.'); } };
  const cancelJob = (job: Job) => { electron.enhanceCancel?.(job.id); setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'idle', percent: 0, stage: undefined } : j)); };

  const applyPreset = (p: Partial<Settings>) => { if (!selected) { showToast('info', 'Sélectionnez un fichier.'); return; } patch(p); showToast('info', 'Préréglage appliqué.'); };
  const savePreset = async () => { if (!selected) return; const name = prompt('Nom du préréglage :'); if (!name) return; const np = [...presets, { name, settings: selected.settings }]; setPresets(np); await electron.enhancePresetsSave?.(np); showToast('info', 'Préréglage enregistré.'); };
  const browseOutput = async () => { const d = await electron.selectDirectory?.(); if (d) { setOutputDir(d); patch({ outputDir: d }); } };

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-500/30 flex items-center justify-center border border-white/10">
            <Sparkles className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Amélioration IA <span className="text-cyan-400">·</span> <span className="text-xs font-normal text-gray-500">moteur libre</span></h2>
            <p className="text-[11px] text-gray-500">
              {detect ? <>Real-ESRGAN {detect.esrganInstalled ? '✓' : '(à installer)'} · RIFE {detect.rifeInstalled ? '✓' : '(via Interpolateur)'} {detect.nvidia ? '· ' + detect.nvidia : ''}{detect.hasNvenc ? ' · NVENC' : ''}</> : 'Détection…'}
            </p>
          </div>
        </div>
        <MiniGpu stats={stats} />
      </div>

      <div className="px-6 py-2 border-b border-white/5">
        <SegmentedTabs tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} onReorder={setSubTabs} accentColor="#22d3ee" />
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`mx-6 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-200'}`}>
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}<span className="select-text">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {subTab === 'queue' && (
        <div className="flex-1 overflow-hidden flex">
          <div className="w-[340px] shrink-0 border-r border-white/5 flex flex-col">
            <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
              className={`m-3 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 py-6 cursor-pointer ${dragOver ? 'border-cyan-500/60 bg-cyan-500/10' : 'border-white/10 hover:border-white/20 bg-white/[0.02]'}`}
              onClick={handleBrowse}>
              <Plus className="w-6 h-6 text-cyan-400" />
              <p className="text-sm text-gray-300 font-medium">Glissez vos vidéos ici</p>
              <p className="text-[11px] text-gray-500">ou cliquez · sélection multiple</p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {jobs.length === 0 && <p className="text-center text-gray-600 text-xs mt-6">File d'attente vide</p>}
              {jobs.map(job => (
                <button key={job.id} onClick={() => setSelectedId(job.id)}
                  className={`w-full text-left rounded-xl border p-2 flex gap-2.5 transition-all ${selectedId === job.id ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <div className="w-16 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
                    {job.thumb ? <img src={job.thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 truncate font-medium">{job.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">{job.meta ? `${job.meta.width}×${job.meta.height} · ${Math.round(job.meta.fps)}fps · ${fmtDur(job.meta.duration)} · ${fmtSize(job.meta.size)}` : 'Analyse…'}</p>
                    {job.status === 'running' && <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `${job.percent}%` }} /></div>}
                    {job.status === 'done' && <span className="text-[10px] text-green-400">✓ Terminé</span>}
                    {job.status === 'error' && <span className="text-[10px] text-red-400">✕ Erreur</span>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); job.status === 'running' ? cancelJob(job) : removeJob(job.id); }} className="shrink-0 text-gray-600 hover:text-red-400 self-start">
                    {job.status === 'running' ? <Square className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-white/5">
              <button onClick={startAll} disabled={!jobs.length} className="w-full px-3 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.7), rgba(59,130,246,0.7))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 20px rgba(34,211,238,0.3)' }}>
                <Play className="w-4 h-4 fill-current" /> Lancer la file
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected ? <div className="h-full flex items-center justify-center text-gray-600 text-sm">Sélectionnez un fichier pour configurer le traitement</div>
              : <SettingsPanel job={selected} detect={detect} gpuList={gpuList} patch={patch} patchRestore={patchRestore} patchColor={patchColor} patchStab={patchStab}
                onApplyAll={applyToAll} onStart={() => startJob(selected)} onCancel={() => cancelJob(selected)} onBrowseOutput={browseOutput}
                presets={presets} onApplyPreset={applyPreset} onSavePreset={savePreset} onOpenOutput={(p: string) => electron.showItemInFolder?.(p)} />}
          </div>
        </div>
      )}

      {subTab === 'preview' && <BeforeAfter job={selected} toSpec={toSpec} electron={electron} showToast={showToast} />}
      {subTab === 'perf' && <PerfPanel stats={stats} detect={detect} gpuList={gpuList} jobs={jobs} electron={electron} showToast={showToast} />}
    </div>
  );
}

function MiniGpu({ stats }: { stats: any }) {
  if (!stats) return null;
  const chip = (icon: React.ReactNode, label: string, val: number | null, total?: number | null) => (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
      {icon}<span className="text-[11px] text-gray-400">{label}</span>
      <span className="text-[11px] font-mono text-gray-200">{val == null ? '—' : total != null ? `${Math.round(val / 1024)}/${Math.round(total / 1024)}Go` : `${val}%`}</span>
    </div>
  );
  return <div className="flex items-center gap-2">{chip(<Gauge className="w-3 h-3 text-cyan-400" />, 'GPU', stats.gpu)}{chip(<HardDrive className="w-3 h-3 text-blue-400" />, 'VRAM', stats.vramUsed, stats.vramTotal)}{chip(<Cpu className="w-3 h-3 text-indigo-400" />, 'CPU', stats.cpu)}</div>;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="relative shrink-0 w-10 h-6 rounded-full transition-all duration-300"
    style={{ background: on ? 'linear-gradient(135deg, #22d3ee, #3b82f6)' : 'rgba(255,255,255,0.12)', boxShadow: on ? '0 0 12px rgba(34,211,238,0.4)' : 'none' }}>
    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300" style={{ left: on ? 'calc(100% - 22px)' : '2px' }} />
  </button>;
}
function Section({ title, icon, on, onToggle, children, accent = '#22d3ee' }: any) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}>{icon}</div><span className="text-sm font-semibold text-gray-200">{title}</span></div>
        {onToggle && <Toggle on={on} onClick={onToggle} />}
      </div>
      {on && <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">{children}</div>}
    </div>
  );
}
function Slider({ label, value, min, max, step = 1, onChange, suffix = '', accent = '#22d3ee' }: any) {
  return (
    <div>
      <div className="flex justify-between mb-1"><span className="text-[11px] text-gray-400">{label}</span><span className="text-[11px] font-mono text-gray-200">{value}{suffix}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${accent} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%)` }} />
    </div>
  );
}

function SettingsPanel({ job, detect, gpuList, patch, patchRestore, patchColor, patchStab, onApplyAll, onStart, onCancel, onBrowseOutput, presets, onApplyPreset, onSavePreset, onOpenOutput }: any) {
  const s: Settings = job.settings;
  const running = job.status === 'running';
  const models = detect?.models || [];
  return (
    <div className="p-5 space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 flex-wrap">
        {BUILTIN_PRESETS.map(p => <button key={p.name} onClick={() => onApplyPreset(p.patch)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/30 transition-all flex items-center gap-1.5"><span>{p.icon}</span> {p.name}</button>)}
        {presets.map((p: any, i: number) => <button key={'u' + i} onClick={() => onApplyPreset(p.settings)} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all">⭐ {p.name}</button>)}
        <button onClick={onSavePreset} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"><Save className="w-3 h-3" /> Enregistrer</button>
      </div>

      {/* Upscale */}
      <Section title="Upscale IA (Real-ESRGAN)" icon={<Wand2 className="w-3.5 h-3.5 text-cyan-400" />} on={s.upscaleEnabled} onToggle={() => patch({ upscaleEnabled: !s.upscaleEnabled })}>
        <div>
          <label className={LABEL_CLS}>Modèle</label>
          <select className={SELECT_CLS + ' mt-1'} value={s.upscaleModel} onChange={e => patch({ upscaleModel: e.target.value })}>
            {models.map((m: any) => <option key={m.family} value={m.family} className={OPT}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Échelle</label>
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            {SCALES.map(sc => <button key={sc} onClick={() => patch({ scaleMode: 'scale', scale: sc, resPreset: 'Auto' })}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all ${s.scaleMode === 'scale' && s.scale === sc ? 'bg-cyan-500/30 text-cyan-100 border border-cyan-500/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}>{sc}×</button>)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div><label className={LABEL_CLS}>Résolution cible</label>
            <select className={SELECT_CLS + ' mt-1'} value={s.scaleMode === 'resolution' ? s.resPreset : 'Auto'} onChange={e => { const v = e.target.value; patch(v === 'Auto' ? { scaleMode: 'scale', resPreset: 'Auto' } : { scaleMode: 'resolution', resPreset: v }); }}>
              {RES_PRESETS.map(r => <option key={r} value={r} className={OPT}>{r}</option>)}
            </select>
          </div>
          {s.scaleMode === 'resolution' && s.resPreset === 'Personnalisé' && (
            <div className="flex gap-2 items-end">
              <div><label className={LABEL_CLS}>Largeur</label><input type="number" className={INPUT_CLS + ' mt-1'} value={s.targetW} onChange={e => patch({ targetW: Number(e.target.value) })} /></div>
              <div><label className={LABEL_CLS}>Hauteur</label><input type="number" className={INPUT_CLS + ' mt-1'} value={s.targetH} onChange={e => patch({ targetH: Number(e.target.value) })} /></div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 items-center">
          <Slider label="Tile size (VRAM faible = plus petit)" value={s.tile} min={0} max={512} step={32} onChange={(v: number) => patch({ tile: v })} suffix={s.tile === 0 ? ' auto' : ''} />
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mt-4"><Toggle on={s.tta} onClick={() => patch({ tta: !s.tta })} /> Mode TTA (qualité max, plus lent)</label>
        </div>
        <p className="text-[10px] text-gray-500">L'upscale extrait les images → Real-ESRGAN → réassemble. Prévoir de l'espace disque pour les longues vidéos.</p>
      </Section>

      {/* Restauration */}
      <Section title="Restauration vidéo" icon={<SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />} accent="#10b981" on={s.restoreEnabled} onToggle={() => patch({ restoreEnabled: !s.restoreEnabled })}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL_CLS}>Débruitage</label>
            <select className={SELECT_CLS + ' mt-1'} value={s.restore.denoise} onChange={e => patchRestore({ denoise: e.target.value })}>{DENOISE.map(d => <option key={d.v} value={d.v} className={OPT}>{d.l}</option>)}</select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mt-5"><Toggle on={s.restore.temporalDenoise} onClick={() => patchRestore({ temporalDenoise: !s.restore.temporalDenoise })} /> Débruitage temporel</label>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.restore.deblock} onClick={() => patchRestore({ deblock: !s.restore.deblock })} /> Récupération compression (deblock)</label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.restore.deband} onClick={() => patchRestore({ deband: !s.restore.deband })} /> Anti-banding</label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.restore.detailRecovery} onClick={() => patchRestore({ detailRecovery: !s.restore.detailRecovery })} /> Récupération de détail</label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.restore.deinterlace} onClick={() => patchRestore({ deinterlace: !s.restore.deinterlace })} /> Désentrelacement</label>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
          <Slider label="Luminosité" value={s.restore.color.brightness} min={-100} max={100} onChange={(v: number) => patchColor({ brightness: v })} accent="#10b981" />
          <Slider label="Contraste" value={s.restore.color.contrast} min={-100} max={100} onChange={(v: number) => patchColor({ contrast: v })} accent="#10b981" />
          <Slider label="Saturation" value={s.restore.color.saturation} min={-100} max={100} onChange={(v: number) => patchColor({ saturation: v })} accent="#10b981" />
          <Slider label="Gamma" value={s.restore.color.gamma} min={50} max={200} onChange={(v: number) => patchColor({ gamma: v })} suffix="%" accent="#10b981" />
        </div>
      </Section>

      {/* Stabilisation */}
      <Section title="Stabilisation (vidstab 2-passes)" icon={<Crosshair className="w-3.5 h-3.5 text-blue-400" />} accent="#3b82f6" on={s.stabEnabled} onToggle={() => patch({ stabEnabled: !s.stabEnabled })}>
        <Slider label="Lissage de la trajectoire" value={s.stab.smoothing} min={0} max={100} onChange={(v: number) => patchStab({ smoothing: v })} accent="#3b82f6" />
        <Slider label="Sensibilité aux secousses" value={s.stab.shakiness} min={1} max={10} onChange={(v: number) => patchStab({ shakiness: v })} accent="#3b82f6" />
        <Slider label="Zoom" value={s.stab.zoom} min={-20} max={20} onChange={(v: number) => patchStab({ zoom: v })} suffix="%" accent="#3b82f6" />
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.stab.optzoom} onClick={() => patchStab({ optzoom: !s.stab.optzoom })} /> Zoom auto (masque les bords noirs)</label>
      </Section>

      {/* Interpolation */}
      <Section title="Interpolation d'images (RIFE)" icon={<Film className="w-3.5 h-3.5 text-violet-400" />} accent="#8b5cf6" on={s.interpEnabled} onToggle={() => patch({ interpEnabled: !s.interpEnabled })}>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL_CLS}>FPS de sortie</label>
            <select className={SELECT_CLS + ' mt-1'} value={s.fpsPreset} onChange={e => patch({ fpsPreset: e.target.value, fps: parseInt(e.target.value) || s.fps })}>{FPS_PRESETS.map(f => <option key={f} value={f} className={OPT}>{f === 'Conserver' || f === 'Personnalisé' ? f : f + ' fps'}</option>)}</select>
          </div>
          {s.fpsPreset === 'Personnalisé' && <div><label className={LABEL_CLS}>FPS</label><input type="number" className={INPUT_CLS + ' mt-1'} value={s.fps} onChange={e => patch({ fps: Number(e.target.value) })} /></div>}
        </div>
        <Slider label="Ralenti ×" value={s.slowmo} min={1} max={16} step={0.5} onChange={(v: number) => patch({ slowmo: v })} suffix="×" accent="#8b5cf6" />
        {!detect?.rifeInstalled && <p className="text-[10px] text-amber-400">RIFE pas encore installé — ouvrez une fois l'onglet « Interpolateur IA » pour le télécharger.</p>}
      </Section>

      {/* Export */}
      <Section title="Netteté & Export" icon={<Download className="w-3.5 h-3.5 text-green-400" />} accent="#22c55e" on={true}>
        <Slider label="Netteté (CAS, sans artefacts)" value={s.sharpen} min={0} max={100} onChange={(v: number) => patch({ sharpen: v })} suffix="%" accent="#22c55e" />
        <div className="grid grid-cols-3 gap-3">
          {(() => {
            const avail: string[] = detect?.availableCodecs || ['h264', 'h265', 'av1', 'prores'];
            const codecsFor = (fmt: string) => (CONTAINER_CODECS[fmt] || CONTAINER_CODECS.MP4).filter(c => avail.includes(c));
            const fmtCodecs = codecsFor(s.format).length ? codecsFor(s.format) : ['h264'];
            return <>
              <div><label className={LABEL_CLS}>Format</label><select className={SELECT_CLS + ' mt-1'} value={s.format} onChange={ev => { const fmt = ev.target.value; const allowed = codecsFor(fmt); const next = allowed.length ? allowed : ['h264']; patch({ format: fmt, codec: next.includes(s.codec) ? s.codec : next[0] }); }}>{FORMATS.map(f => <option key={f} className={OPT}>{f}</option>)}</select></div>
              <div><label className={LABEL_CLS}>Codec</label><select className={SELECT_CLS + ' mt-1'} value={s.codec} onChange={ev => patch({ codec: ev.target.value })}>{CODECS.filter(c => fmtCodecs.includes(c.v)).map(c => <option key={c.v} value={c.v} className={OPT}>{c.l}</option>)}</select></div>
            </>;
          })()}
          <div className="pt-0.5"><Slider label="Qualité" value={s.quality} min={0} max={100} onChange={(v: number) => patch({ quality: v })} suffix="%" accent="#22c55e" /></div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.audioCopy} onClick={() => patch({ audioCopy: !s.audioCopy })} /> Conserver la piste audio</label>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><label className={LABEL_CLS}>Dossier de sortie</label><input className={INPUT_CLS + ' mt-1'} value={s.outputDir} onChange={e => patch({ outputDir: e.target.value })} placeholder="Dossier de destination…" /></div>
          <button onClick={onBrowseOutput} className="px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button>
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-3">
        <div><label className={LABEL_CLS}>Processeur (Device)</label>
          <select className={SELECT_CLS + ' mt-1'} value={s.device} onChange={e => patch({ device: e.target.value })}>
            <option value="auto" className={OPT}>Auto</option>
            {gpuList.map((g: any) => <option key={g.id} value={g.id} className={OPT}>{g.name}</option>)}
            <option value="cpu" className={OPT}>CPU (encodage — l'IA reste sur GPU)</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        {running ? (
          <button onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 flex items-center justify-center gap-2"><Square className="w-4 h-4" /> Arrêter ({job.percent}% · {job.stage})</button>
        ) : job.status === 'done' ? (
          <>
            <button onClick={() => job.outputPath && onOpenOutput(job.outputPath)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-green-500/20 border border-green-500/40 text-green-200 hover:bg-green-500/30 flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Terminé — Ouvrir le dossier</button>
            <button onClick={onStart} className="px-4 py-3 rounded-xl font-bold text-sm bg-white/5 border border-white/10 hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
          </>
        ) : (
          <button onClick={onStart} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.75), rgba(59,130,246,0.75))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 24px rgba(34,211,238,0.4)' }}>
            <Play className="w-4 h-4 fill-current" /> Améliorer cette vidéo
          </button>
        )}
        <button onClick={onApplyAll} title="Appliquer à toute la file" className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><Layers className="w-4 h-4" /> À tous</button>
      </div>

      {job.status === 'error' && job.error && <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-xl p-3 whitespace-pre-wrap select-text">{job.error}</pre>}
    </div>
  );
}

function BeforeAfter({ job, toSpec, electron, showToast }: any) {
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [afterUrl, setAfterUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { setAfterUrl(''); }, [job?.id]);
  if (!job) return <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">Sélectionnez un fichier pour comparer</div>;
  const beforeUrl = mediaUrl(job.inputPath);
  const compareUrl = afterUrl || (job.outputPath ? mediaUrl(job.outputPath) : '');
  const genPreview = async () => {
    setLoading(true);
    const start = beforeRef.current ? Math.max(0, beforeRef.current.currentTime) : 0;
    const res = await electron.enhancePreview?.({ ...toSpec(job, { start, duration: 3 }) }).catch((e: any) => ({ error: String(e) }));
    setLoading(false);
    if (res?.outputPath) setAfterUrl(mediaUrl(res.outputPath)); else showToast('error', res?.error || 'Aperçu impossible.');
  };
  const sync = (from: HTMLVideoElement | null, to: HTMLVideoElement | null) => { if (from && to && Math.abs(from.currentTime - to.currentTime) > 0.05) to.currentTime = from.currentTime; };
  return (
    <div className="flex-1 overflow-hidden flex flex-col p-5 gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={genPreview} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.7), rgba(59,130,246,0.7))', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}{loading ? 'Génération…' : 'Générer un aperçu (3s)'}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-400"><span>Zoom</span><input type="range" min={1} max={4} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-28 accent-cyan-500" /><span className="font-mono">{zoom.toFixed(1)}×</span></div>
        <p className="text-[11px] text-gray-500">Placez la tête de lecture puis générez un aperçu du rendu.</p>
      </div>
      <div className="flex-1 relative rounded-2xl overflow-hidden bg-black border border-white/10 select-none">
        {!compareUrl ? (
          <div className="absolute inset-0 flex items-center justify-center"><video ref={beforeRef} src={beforeUrl} className="max-h-full max-w-full" style={{ transform: `scale(${zoom})` }} controls /></div>
        ) : (
          <>
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden"><video ref={beforeRef} src={beforeUrl} className="max-h-full max-w-full" style={{ transform: `scale(${zoom})` }} onTimeUpdate={() => sync(beforeRef.current, afterRef.current)} controls onPlay={() => afterRef.current?.play()} onPause={() => afterRef.current?.pause()} /></div>
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ clipPath: `inset(0 0 0 ${split}%)` }}><video ref={afterRef} src={compareUrl} className="max-h-full max-w-full" style={{ transform: `scale(${zoom})` }} muted /></div>
            <div className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" style={{ left: `${split}%` }} />
            <input type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} className="absolute bottom-4 left-1/2 -translate-x-1/2 w-2/3 accent-cyan-500" />
            <span className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 text-[10px] text-gray-300">AVANT</span>
            <span className="absolute top-3 right-3 px-2 py-1 rounded-md bg-black/60 text-[10px] text-cyan-300">APRÈS</span>
          </>
        )}
      </div>
    </div>
  );
}

function PerfPanel({ stats, detect, gpuList, jobs, electron, showToast }: any) {
  const [installing, setInstalling] = useState(false);
  const bar = (label: string, val: number | null, color: string, sub?: string) => (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex justify-between mb-2"><span className="text-sm text-gray-300">{label}</span><span className="text-sm font-mono" style={{ color }}>{val == null ? '—' : `${val}%`}</span></div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${val || 0}%`, background: color }} /></div>
      {sub && <p className="text-[11px] text-gray-500 mt-1.5">{sub}</p>}
    </div>
  );
  const vramPct = stats?.vramTotal ? Math.round((stats.vramUsed / stats.vramTotal) * 100) : null;
  const ramPct = stats?.ramTotal ? Math.round((stats.ramUsed / stats.ramTotal) * 100) : null;
  const install = async () => { setInstalling(true); const r = await electron.enhanceInstall?.().catch((e: any) => ({ ok: false, error: String(e) })); setInstalling(false); showToast(r?.ok ? 'info' : 'error', r?.ok ? 'Real-ESRGAN installé ✓' : (r?.error || 'Échec installation')); };
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        {bar('GPU', stats?.gpu ?? null, '#22d3ee', stats?.gpuName || 'GPU')}
        {bar('VRAM', vramPct, '#3b82f6', stats ? `${Math.round((stats.vramUsed || 0) / 1024)} / ${Math.round((stats.vramTotal || 0) / 1024)} Go` : '')}
        {bar('CPU', stats?.cpu ?? null, '#6366f1')}
        {bar('RAM', ramPct, '#22c55e', stats ? `${Math.round((stats.ramUsed || 0) / 1024)} / ${Math.round((stats.ramTotal || 0) / 1024)} Go` : '')}
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Moteurs</h3>
        <Row k="Real-ESRGAN (upscale)" v={detect?.esrganInstalled ? 'Installé ✓' : 'Non installé'} />
        <Row k="RIFE (interpolation)" v={detect?.rifeInstalled ? 'Installé ✓' : 'Non installé (onglet Interpolateur)'} />
        <Row k="GPU NVIDIA" v={detect?.nvidia || 'Non détecté (CPU/AMD/Intel via Auto)'} />
        <Row k="Encodeur matériel" v={detect?.hasNvenc ? 'NVENC disponible' : 'Encodage CPU'} />
        <Row k="GPU détectés" v={gpuList.map((g: any) => g.name).join(', ') || '—'} />
        <Row k="File d'attente" v={`${jobs.length} fichier(s) · ${jobs.filter((j: Job) => j.status === 'done').length} terminé(s)`} />
        {!detect?.esrganInstalled && (
          <button onClick={install} disabled={installing} className="mt-2 px-4 py-2 rounded-xl text-sm font-semibold bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/30 flex items-center gap-2 disabled:opacity-50">
            {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{installing ? 'Installation…' : 'Installer Real-ESRGAN (~45 Mo)'}
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500">Moteur 100% libre & gratuit, accessible à tous les membres. Suivi GPU/VRAM en direct sur NVIDIA (nvidia-smi).</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) { return <div className="flex justify-between gap-4 text-xs"><span className="text-gray-500 shrink-0">{k}</span><span className="text-gray-300 text-right select-text break-all">{v}</span></div>; }
