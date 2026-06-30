import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, FolderOpen, Play, Pause, Square, Trash2, Plus, Cpu, HardDrive,
  Gauge, Layers, Film, Wand2, Crosshair, Download, Save,
  AlertCircle, CheckCircle2, Loader2, Image as ImageIcon, Eye, RotateCcw,
} from 'lucide-react';
import SegmentedTabs from './SegmentedTabs';
import GlassSelect from './GlassSelect';
import { t } from '@/i18n';
import { orbitPrompt } from './orbitPrompt';
import DropZone from './DropZone';

const api = () => (window as any).electronAPI;
const mediaUrl = (p: string) => 'media:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── shared styles (match Orbit conventions) ──
const INPUT_CLS = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 hover:border-white/20 focus:border-fuchsia-500/50 focus:ring-2 focus:ring-fuchsia-500/20 transition-all w-full select-text shadow-sm backdrop-blur-md";
const LABEL_CLS = "text-[11px] font-semibold text-gray-400 uppercase tracking-wider";

type ModelEntry = { family: string; tag: string; name: string; defaultCode: string; codes: string[]; supportsManual: boolean; known: boolean };
type Models = { upscale: ModelEntry[]; interpolate: ModelEntry[]; stabilize: ModelEntry[] };
type Meta = { width: number; height: number; fps: number; codec: string; duration: number; size: number; hasAudio: boolean; audioCodec: string };

type Settings = {
  enhanceEnabled: boolean; enhanceModel: string;
  scaleMode: 'scale' | 'resolution'; scale: number;
  resPreset: string; targetW: number; targetH: number;
  proteusMode: 'auto' | 'manual'; estimate: number;
  manual: { preblur: number; noise: number; details: number; halo: number; blur: number; compression: number };
  grain: number; gsize: number;
  interpEnabled: boolean; interpModel: string; fps: number; fpsPreset: string; slowmo: number;
  stabEnabled: boolean; stabModel: string; smoothness: number; rollingShutter: boolean; fullFrame: boolean; reduce: number;
  format: string; codec: string; quality: number; preset: string; audioCopy: boolean; outputDir: string;
  device: string; vram: number;
};

type Job = {
  id: string; inputPath: string; name: string; meta?: Meta; thumb?: string;
  status: 'idle' | 'running' | 'done' | 'error'; percent: number; stage?: string; speed?: string;
  outputPath?: string; error?: string; settings: Settings;
};

const RES_PRESETS = ['Auto', '720p', '1080p', '1440p', '4K', '8K', 'Personnalisé'];
const RES_HEIGHT: Record<string, number> = { '720p': 720, '1080p': 1080, '1440p': 1440, '4K': 2160, '8K': 4320 };
const SCALES = [1, 2, 3, 4, 6, 8];
const FPS_PRESETS = ['Conserver', '24', '25', '30', '50', '60', '120', 'Personnalisé'];
const FORMATS = ['MP4', 'MOV', 'MKV', 'AVI'];
const CODECS = [{ v: 'h264', l: 'H.264' }, { v: 'h265', l: 'H.265 (HEVC)' }, { v: 'av1', l: 'AV1' }, { v: 'prores', l: 'ProRes' }];
const X264_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];

function defaultSettings(models: Models | null, outputDir: string): Settings {
  return {
    enhanceEnabled: true,
    enhanceModel: models?.upscale.find(m => m.family === 'prob')?.defaultCode || models?.upscale[0]?.defaultCode || 'prob-4',
    scaleMode: 'scale', scale: 2,
    resPreset: 'Auto', targetW: 3840, targetH: 2160,
    proteusMode: 'auto', estimate: 8,
    manual: { preblur: 0, noise: 0, details: 0, halo: 0, blur: 0, compression: 0 },
    grain: 0, gsize: 0,
    interpEnabled: false,
    interpModel: models?.interpolate.find(m => m.family === 'aion')?.defaultCode || models?.interpolate[0]?.defaultCode || 'chr-2',
    fps: 60, fpsPreset: '60', slowmo: 1,
    stabEnabled: false,
    stabModel: models?.stabilize[0]?.defaultCode || 'ref-2',
    smoothness: 6, rollingShutter: false, fullFrame: true, reduce: 0,
    format: 'MP4', codec: 'h264', quality: 70, preset: 'medium', audioCopy: true, outputDir,
    device: 'auto', vram: 1,
  };
}

const BUILTIN_PRESETS: { name: string; icon: string; patch: Partial<Settings> }[] = [
  { name: 'Anime', icon: '🎌', patch: { enhanceModel: '', scale: 2, proteusMode: 'auto' } },
  { name: 'Valorant / Gaming', icon: '🎮', patch: { scale: 2, interpEnabled: true, fps: 120, fpsPreset: '120' } },
  { name: 'YouTube', icon: '▶️', patch: { resPreset: '4K', scaleMode: 'resolution', codec: 'h265', quality: 78 } },
  { name: 'TikTok', icon: '📱', patch: { resPreset: '1080p', scaleMode: 'resolution', codec: 'h264', quality: 72 } },
  { name: 'Film', icon: '🎬', patch: { scale: 2, codec: 'h265', quality: 82, format: 'MKV' } },
  { name: 'Vieilles vidéos', icon: '📼', patch: { scale: 4, proteusMode: 'manual' } },
  { name: 'Qualité Max', icon: '💎', patch: { scale: 4, codec: 'prores', quality: 95, format: 'MOV', vram: 1 } },
];

const fmtSize = (b: number) => !b ? '—' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(1) + ' Mo';
const fmtDur = (s: number) => {
  if (!s) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? `${h}:` : '') + `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export default function TopazVideoAI() {
  const electron = api();
  const [detect, setDetect] = useState<any>(null);
  const [models, setModels] = useState<Models | null>(null);
  const [gpuList, setGpuList] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [outputDir, setOutputDir] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState('queue');
  const [subTabs, setSubTabs] = useState([
    { id: 'queue', label: t('File & Réglages'), visible: true },
    { id: 'preview', label: t('Aperçu Avant/Après'), visible: true },
    { id: 'perf', label: t('Performance GPU'), visible: true },
  ]);
  const [presets, setPresets] = useState<any[]>([]);
  const [toast, setToast] = useState<{ type: 'error' | 'info'; msg: string } | null>(null);
  const listenersRef = useRef(false);
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;

  const selected = jobs.find(j => j.id === selectedId) || null;

  const showToast = (type: 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  };

  // ── init ──
  useEffect(() => {
    (async () => {
      if (!electron) return;
      const def = await electron.getDefaultDownloads?.().catch(() => '');
      if (def) setOutputDir(def);
      const d = await electron.topazDetect?.().catch(() => null);
      setDetect(d);
      if (d?.installed) setModels(d.models);
      const g = await electron.topazGpus?.().catch(() => []);
      if (g) setGpuList(g);
      const p = await electron.topazPresetsLoad?.().catch(() => []);
      if (Array.isArray(p)) setPresets(p);
      const savedQ = await electron.topazQueueLoad?.().catch(() => []);
      if (Array.isArray(savedQ) && savedQ.length) {
        // resume: mark previously-running as idle
        const restored = savedQ.map((j: Job) => ({ ...j, status: (j.status === 'running' ? 'idle' : j.status) as Job['status'], percent: j.status === 'done' ? 100 : 0 }));
        setJobs(restored);
        setSelectedId(restored[0]?.id || null);
      }
    })();
  }, []);

  // ── persist queue (autosave) ──
  useEffect(() => {
    if (!electron?.topazQueueSave) return;
    const tm = setTimeout(() => electron.topazQueueSave(jobs), 600);
    return () => clearTimeout(tm);
  }, [jobs]);

  // ── GPU stats polling ──
  useEffect(() => {
    if (!electron?.topazGpuStats) return;
    let alive = true;
    const tick = async () => { const s = await electron.topazGpuStats().catch(() => null); if (alive && s) setStats(s); };
    tick();
    const iv = setInterval(tick, 1500);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // ── IPC listeners ──
  useEffect(() => {
    if (!electron || listenersRef.current) return;
    listenersRef.current = true;
    electron.onTopazProgress?.((data: any) => {
      setJobs(prev => prev.map(j => j.id === data.id ? {
        ...j,
        percent: data.percent != null ? data.percent : j.percent,
        stage: data.stage || j.stage,
        speed: data.speed || j.speed,
      } : j));
    });
    electron.onTopazComplete?.((data: any) => {
      setJobs(prev => prev.map(j => j.id === data.id ? { ...j, status: 'done', percent: 100, outputPath: data.outputPath, stage: t('Terminé') } : j));
      // auto-start next queued
      setTimeout(() => runNext(), 400);
    });
    electron.onTopazError?.((data: any) => {
      setJobs(prev => prev.map(j => j.id === data.id ? { ...j, status: 'error', error: data.error + (data.log ? '\n' + data.log : '') } : j));
      setTimeout(() => runNext(), 400);
    });
  }, [electron]);

  // ── file import ──
  const addFiles = useCallback(async (paths: string[]) => {
    if (!paths?.length) return;
    const newJobs: Job[] = paths.map(p => ({
      id: uid(), inputPath: p, name: p.split(/[\\/]/).pop() || p,
      status: 'idle', percent: 0, settings: defaultSettings(models, outputDir),
    }));
    setJobs(prev => [...prev, ...newJobs]);
    if (!selectedId && newJobs[0]) setSelectedId(newJobs[0].id);
    // enrich with metadata + thumbnail asynchronously
    for (const nj of newJobs) {
      electron.topazProbe?.(nj.inputPath).then((meta: any) => {
        if (meta && !meta.error) setJobs(prev => prev.map(j => j.id === nj.id ? { ...j, meta } : j));
      });
      electron.topazThumbnail?.(nj.inputPath).then((thumb: string) => {
        if (thumb) setJobs(prev => prev.map(j => j.id === nj.id ? { ...j, thumb } : j));
      });
    }
  }, [models, outputDir, selectedId, electron]);

  const handleBrowse = async () => {
    const files = await electron.topazSelectFiles?.().catch(() => []);
    if (files?.length) addFiles(files);
  };


  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
    if (selectedId === id) setSelectedId(jobsRef.current.find(j => j.id !== id)?.id || null);
  };

  const patchSettings = (patch: Partial<Settings>) => {
    if (!selectedId) return;
    setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, ...patch } } : j));
  };
  const patchManual = (patch: Partial<Settings['manual']>) => {
    if (!selectedId) return;
    setJobs(prev => prev.map(j => j.id === selectedId ? { ...j, settings: { ...j.settings, manual: { ...j.settings.manual, ...patch } } } : j));
  };

  const applyToAll = () => {
    if (!selected) return;
    setJobs(prev => prev.map(j => ({ ...j, settings: { ...selected.settings } })));
    showToast('info', t('Réglages appliqués à toute la file.'));
  };

  // ── build a backend job spec from settings ──
  const toSpec = (job: Job, preview?: { start: number; duration: number }) => {
    const s = job.settings;
    const meta = job.meta;
    // resolve scaling
    let scale = s.scale, targetW = 0, targetH = 0;
    if (s.scaleMode === 'resolution' && s.resPreset !== 'Auto') {
      if (s.resPreset === 'Personnalisé') { targetW = s.targetW; targetH = s.targetH; }
      else {
        const h = RES_HEIGHT[s.resPreset] || 2160;
        const ar = meta && meta.width && meta.height ? meta.width / meta.height : 16 / 9;
        targetH = h; targetW = Math.round(h * ar / 2) * 2;
      }
    } else if (s.scale > 4 && meta?.width) {
      // engine scale maxes at 4 → express larger factors as target resolution
      targetW = meta.width * s.scale; targetH = meta.height * s.scale;
    }
    let fps = s.fps;
    if (s.fpsPreset === 'Conserver') fps = meta?.fps || 60;
    else if (s.fpsPreset !== 'Personnalisé') fps = parseInt(s.fpsPreset) || s.fps;
    return {
      id: job.id, inputPath: job.inputPath, device: s.device, vram: s.vram,
      useGpuEncoder: true,
      preview,
      enhance: s.enhanceEnabled ? {
        enabled: true, model: s.enhanceModel,
        scale: (targetW ? 0 : scale), targetW, targetH,
        auto: s.proteusMode === 'auto', estimate: s.estimate,
        manual: s.manual, grain: s.grain, gsize: s.gsize,
      } : { enabled: false },
      interpolate: s.interpEnabled ? { enabled: true, model: s.interpModel, fps, slowmo: s.slowmo } : { enabled: false },
      stabilize: s.stabEnabled ? {
        enabled: true, model: s.stabModel, smoothness: s.smoothness,
        rollingShutter: s.rollingShutter, fullFrame: s.fullFrame, reduce: s.reduce,
      } : { enabled: false },
      export: {
        format: s.format, codec: s.codec, quality: s.quality, preset: s.preset,
        audioCopy: s.audioCopy, outputDir: s.outputDir || outputDir,
      },
      whenDone: 'none',
    };
  };

  const startJob = (job: Job) => {
    if (!detect?.installed) { showToast('error', t('Topaz non détecté.')); return; }
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'running', percent: 0, stage: t('Démarrage…'), error: undefined } : j));
    electron.topazStart?.(toSpec(job));
  };

  const runNext = () => {
    const list = jobsRef.current;
    if (list.some(j => j.status === 'running')) return;
    const next = list.find(j => j.status === 'idle');
    if (next) startJob(next);
  };

  const startAll = () => {
    if (!jobs.some(j => j.status === 'running')) {
      const next = jobs.find(j => j.status === 'idle');
      if (next) startJob(next);
      else showToast('info', t('Aucun élément en attente.'));
    }
  };

  const cancelJob = (job: Job) => {
    electron.topazCancel?.(job.id);
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'idle', percent: 0, stage: undefined } : j));
  };

  const applyPreset = (patch: Partial<Settings>) => {
    if (!selected) { showToast('info', t('Sélectionnez d\'abord un fichier.')); return; }
    // For "Anime" the model is left blank → pick anime-appropriate (Iris/Proteus).
    const resolved = { ...patch };
    if (patch.enhanceModel === '') {
      resolved.enhanceModel = models?.upscale.find(m => m.family === 'prob')?.defaultCode || selected.settings.enhanceModel;
    }
    if (patch.scaleMode === 'resolution') resolved.scaleMode = 'resolution';
    patchSettings(resolved);
    showToast('info', t('Préréglage appliqué.'));
  };

  const savePreset = async () => {
    if (!selected) return;
    const name = await orbitPrompt(t('Nom du préréglage :'));
    if (!name) return;
    const np = [...presets, { name, settings: selected.settings }];
    setPresets(np);
    await electron.topazPresetsSave?.(np);
    showToast('info', t('Préréglage enregistré.'));
  };

  const browseOutput = async () => {
    const dir = await electron.selectDirectory?.();
    if (dir) { setOutputDir(dir); patchSettings({ outputDir: dir }); }
  };

  // ── not-installed gate ──
  if (detect && !detect.installed) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-purple-500/20 flex items-center justify-center border border-white/10">
          <Sparkles className="w-9 h-9 text-fuchsia-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">{t("Topaz Video AI introuvable")}</h2>
        <p className="text-gray-400 max-w-md text-sm">{detect.reason || t('Aucune installation de Topaz Video détectée.')}</p>
        <p className="text-gray-500 max-w-md text-xs">{t("Orbit pilote votre installation Topaz Video AI. Installez-la et activez votre licence, puis relancez la détection.")}</p>
        <button onClick={async () => { const d = await electron.topazDetect?.(); setDetect(d); if (d?.installed) setModels(d.models); }}
          className="px-5 py-2.5 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/30 transition-all text-sm font-semibold flex items-center gap-2">
          <RotateCcw className="w-4 h-4" /> {t("Relancer la détection")}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500/30 to-purple-500/30 flex items-center justify-center border border-white/10">
            <Sparkles className="w-5 h-5 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Topaz Video AI</h2>
            <p className="text-[11px] text-gray-500">
              {detect?.installed
                ? <>{t("Moteur détecté")}{detect.nvidia ? ` · ${detect.nvidia}` : ''}{detect.hasNvenc ? ' · NVENC' : ''}</>
                : t('Détection…')}
            </p>
          </div>
        </div>
        <MiniGpu stats={stats} />
      </div>

      {/* Sub tabs */}
      <div className="px-6 py-2 border-b border-white/5">
        <SegmentedTabs tabs={subTabs} activeTab={subTab} onTabChange={setSubTab} onReorder={setSubTabs} accentColor="#d946ef" />
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`mx-6 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-200'}`}>
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span className="select-text">{toast.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── QUEUE & SETTINGS ── */}
      {subTab === 'queue' && (
        <div className="flex-1 overflow-hidden flex">
          {/* Left: import + queue */}
          <div className="w-[340px] shrink-0 border-r border-white/5 flex flex-col">
            <DropZone compact className="m-3" accent="#d946ef" icon={<Plus className="w-5 h-5" />}
              title={t("Glissez vos vidéos ici")} hint={t("ou cliquez pour parcourir · sélection multiple")}
              onClick={handleBrowse} onFiles={addFiles} />
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {jobs.length === 0 && <p className="text-center text-gray-600 text-xs mt-6">{t("File d'attente vide")}</p>}
              {jobs.map(job => (
                <button key={job.id} onClick={() => setSelectedId(job.id)}
                  className={`w-full text-left rounded-xl border p-2 flex gap-2.5 transition-all ${selectedId === job.id ? 'border-fuchsia-500/50 bg-fuchsia-500/10' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <div className="w-16 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 flex items-center justify-center">
                    {job.thumb ? <img src={job.thumb} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-200 truncate font-medium">{job.name}</p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {job.meta ? `${job.meta.width}×${job.meta.height} · ${Math.round(job.meta.fps)}fps · ${fmtDur(job.meta.duration)} · ${fmtSize(job.meta.size)}` : t('Analyse…')}
                    </p>
                    {job.status === 'running' && (
                      <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500" style={{ width: `${job.percent}%` }} />
                      </div>
                    )}
                    {job.status === 'done' && <span className="text-[10px] text-green-400">{t("✓ Terminé")}</span>}
                    {job.status === 'error' && <span className="text-[10px] text-red-400">{t("✕ Erreur")}</span>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); job.status === 'running' ? cancelJob(job) : removeJob(job.id); }}
                    className="shrink-0 text-gray-600 hover:text-red-400 transition-colors self-start">
                    {job.status === 'running' ? <Square className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-white/5 flex gap-2">
              <button onClick={startAll} disabled={!jobs.length}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, rgba(217,70,239,0.7), rgba(168,85,247,0.7))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 20px rgba(217,70,239,0.35)' }}>
                <Play className="w-4 h-4 fill-current" /> {t("Lancer la file")}
              </button>
            </div>
          </div>

          {/* Right: settings */}
          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-gray-600 text-sm">{t("Sélectionnez un fichier pour configurer le traitement")}</div>
            ) : (
              <SettingsPanel
                job={selected} models={models} gpuList={gpuList} encoders={detect?.encoders || []}
                patch={patchSettings} patchManual={patchManual}
                onApplyAll={applyToAll} onStart={() => startJob(selected)} onCancel={() => cancelJob(selected)}
                onBrowseOutput={browseOutput}
                presets={presets} onApplyPreset={applyPreset} onSavePreset={savePreset}
                onOpenOutput={(p: string) => electron.showItemInFolder?.(p)}
              />
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW ── */}
      {subTab === 'preview' && (
        <BeforeAfter job={selected} toSpec={toSpec} electron={electron} showToast={showToast} />
      )}

      {/* ── PERFORMANCE ── */}
      {subTab === 'perf' && <PerfPanel stats={stats} detect={detect} gpuList={gpuList} jobs={jobs} />}
    </div>
  );
}

// ── Mini GPU readout in header ──
function MiniGpu({ stats }: { stats: any }) {
  if (!stats) return null;
  const chip = (icon: React.ReactNode, label: string, val: number | null, total?: number | null, unit = '%') => (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
      {icon}
      <span className="text-[11px] text-gray-400">{label}</span>
      <span className="text-[11px] font-mono text-gray-200">{val == null ? '—' : total != null ? `${Math.round(val / 1024)}/${Math.round(total / 1024)}Go` : `${val}${unit}`}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2">
      {chip(<Gauge className="w-3 h-3 text-fuchsia-400" />, 'GPU', stats.gpu)}
      {chip(<HardDrive className="w-3 h-3 text-purple-400" />, 'VRAM', stats.vramUsed, stats.vramTotal)}
      {chip(<Cpu className="w-3 h-3 text-blue-400" />, 'CPU', stats.cpu)}
    </div>
  );
}

// ── Toggle pill ──
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative shrink-0 w-10 h-6 rounded-full transition-all duration-300"
      style={{ background: on ? 'linear-gradient(135deg, #d946ef, #a855f7)' : 'rgba(255,255,255,0.12)', boxShadow: on ? '0 0 12px rgba(217,70,239,0.4)' : 'none' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300" style={{ left: on ? 'calc(100% - 22px)' : '2px' }} />
    </button>
  );
}

function Section({ title, icon, on, onToggle, children, accent = '#d946ef' }: any) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${accent}22`, border: `1px solid ${accent}44` }}>{icon}</div>
          <span className="text-sm font-semibold text-gray-200">{title}</span>
        </div>
        {onToggle && <Toggle on={on} onClick={onToggle} />}
      </div>
      {on && <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">{children}</div>}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, suffix = '', accent = '#d946ef' }: any) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] text-gray-400">{label}</span>
        <span className="text-[11px] font-mono text-gray-200">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${accent} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%)` }} />
    </div>
  );
}

// ── Settings panel ──
function SettingsPanel({ job, models, gpuList, patch, patchManual, onApplyAll, onStart, onCancel, onBrowseOutput, presets, onApplyPreset, onSavePreset, onOpenOutput }: any) {
  const s: Settings = job.settings;
  const enhanceModel: ModelEntry | undefined = models?.upscale.find((m: ModelEntry) => m.codes.includes(s.enhanceModel));
  const supportsManual = !!enhanceModel?.supportsManual;
  const running = job.status === 'running';

  return (
    <div className="p-5 space-y-4 max-w-3xl">
      {/* Presets bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {BUILTIN_PRESETS.map(p => (
          <button key={p.name} onClick={() => onApplyPreset(p.patch)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 hover:border-fuchsia-500/30 transition-all flex items-center gap-1.5">
            <span>{p.icon}</span> {t(p.name)}
          </button>
        ))}
        {presets.map((p: any, i: number) => (
          <button key={'u' + i} onClick={() => onApplyPreset(p.settings)}
            className="px-3 py-1.5 rounded-xl text-xs font-medium bg-fuchsia-500/10 border border-fuchsia-500/30 hover:bg-fuchsia-500/20 transition-all flex items-center gap-1.5">
            ⭐ {p.name}
          </button>
        ))}
        <button onClick={onSavePreset} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 transition-all flex items-center gap-1.5">
          <Save className="w-3 h-3" /> {t("Enregistrer")}
        </button>
      </div>

      {/* Enhance / Upscale */}
      <Section title={t("Amélioration & Upscale")} icon={<Wand2 className="w-3.5 h-3.5 text-fuchsia-400" />} on={s.enhanceEnabled} onToggle={() => patch({ enhanceEnabled: !s.enhanceEnabled })}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>{t("Modèle IA")}</label>
            <GlassSelect className="mt-1 w-full" value={enhanceModel?.family || ''} ariaLabel={t("Modèle IA")}
              onChange={v => { const m = models.upscale.find((x: ModelEntry) => x.family === v); if (m) patch({ enhanceModel: m.defaultCode, proteusMode: m.supportsManual ? s.proteusMode : 'auto' }); }}
              options={(models?.upscale || []).map((m: ModelEntry) => ({ value: m.family, label: m.name }))} />
          </div>
          {enhanceModel && enhanceModel.codes.length > 1 && (
            <div>
              <label className={LABEL_CLS}>{t("Version")}</label>
              <GlassSelect className="mt-1 w-full" value={s.enhanceModel} onChange={v => patch({ enhanceModel: v })} ariaLabel={t("Version")}
                options={enhanceModel.codes.map(c => ({ value: c, label: c }))} />
            </div>
          )}
        </div>

        {/* Scale buttons + resolution */}
        <div>
          <label className={LABEL_CLS}>{t("Échelle")}</label>
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            {SCALES.map(sc => (
              <button key={sc} onClick={() => patch({ scaleMode: 'scale', scale: sc, resPreset: 'Auto' })}
                className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-all ${s.scaleMode === 'scale' && s.scale === sc ? 'bg-fuchsia-500/30 text-fuchsia-100 border border-fuchsia-500/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}>{sc}x</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div>
            <label className={LABEL_CLS}>{t("Résolution cible")}</label>
            <GlassSelect className="mt-1 w-full" value={s.scaleMode === 'resolution' ? s.resPreset : 'Auto'} ariaLabel={t("Résolution cible")}
              onChange={v => { patch(v === 'Auto' ? { scaleMode: 'scale', resPreset: 'Auto' } : { scaleMode: 'resolution', resPreset: v }); }}
              options={RES_PRESETS.map(r => ({ value: r, label: t(r) }))} />
          </div>
          {s.scaleMode === 'resolution' && s.resPreset === 'Personnalisé' && (
            <div className="flex gap-2 items-end">
              <div><label className={LABEL_CLS}>{t("Largeur")}</label><input type="number" className={INPUT_CLS + ' mt-1'} value={s.targetW} onChange={e => patch({ targetW: Number(e.target.value) })} /></div>
              <div><label className={LABEL_CLS}>{t("Hauteur")}</label><input type="number" className={INPUT_CLS + ' mt-1'} value={s.targetH} onChange={e => patch({ targetH: Number(e.target.value) })} /></div>
            </div>
          )}
        </div>

        {/* Proteus auto/manual */}
        {supportsManual && (
          <>
            <div className="flex gap-2">
              {(['auto', 'manual'] as const).map(mode => (
                <button key={mode} onClick={() => patch({ proteusMode: mode })}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${s.proteusMode === mode ? 'bg-fuchsia-500/30 text-fuchsia-100 border border-fuchsia-500/50' : 'bg-white/5 text-gray-400 border border-white/10'}`}>
                  {mode === 'auto' ? t('Auto') : t('Manuel')}
                </button>
              ))}
            </div>
            {s.proteusMode === 'manual' ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
                <Slider label={t("Réduire compression")} value={s.manual.compression} min={-100} max={100} onChange={(v: number) => patchManual({ compression: v })} />
                <Slider label={t("Améliorer détail")} value={s.manual.details} min={-100} max={100} onChange={(v: number) => patchManual({ details: v })} />
                <Slider label={t("Netteté")} value={s.manual.blur} min={-100} max={100} onChange={(v: number) => patchManual({ blur: v })} />
                <Slider label={t("Réduire bruit")} value={s.manual.noise} min={-100} max={100} onChange={(v: number) => patchManual({ noise: v })} />
                <Slider label={t("Dehalo")} value={s.manual.halo} min={-100} max={100} onChange={(v: number) => patchManual({ halo: v })} />
                <Slider label={t("Anti-alias / Deblur")} value={s.manual.preblur} min={-100} max={100} onChange={(v: number) => patchManual({ preblur: v })} />
              </div>
            ) : (
              <Slider label={t("Frames d'estimation auto")} value={s.estimate} min={0} max={100} onChange={(v: number) => patch({ estimate: v })} />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Slider label={t("Grain")} value={s.grain} min={0} max={100} onChange={(v: number) => patch({ grain: v })} />
              <Slider label={t("Taille grain")} value={s.gsize} min={0} max={5} step={0.1} onChange={(v: number) => patch({ gsize: v })} />
            </div>
          </>
        )}
      </Section>

      {/* Interpolation */}
      <Section title={t("Interpolation d'images (Frame Interpolation)")} icon={<Film className="w-3.5 h-3.5 text-purple-400" />} accent="#a855f7" on={s.interpEnabled} onToggle={() => patch({ interpEnabled: !s.interpEnabled })}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>{t("Modèle")}</label>
            <GlassSelect className="mt-1 w-full" value={models?.interpolate.find((m: ModelEntry) => m.codes.includes(s.interpModel))?.family || ''} ariaLabel={t("Modèle")}
              onChange={v => { const m = models.interpolate.find((x: ModelEntry) => x.family === v); if (m) patch({ interpModel: m.defaultCode }); }}
              options={(models?.interpolate || []).map((m: ModelEntry) => ({ value: m.family, label: m.name }))} />
          </div>
          <div>
            <label className={LABEL_CLS}>{t("FPS de sortie")}</label>
            <GlassSelect className="mt-1 w-full" value={s.fpsPreset} onChange={v => patch({ fpsPreset: v, fps: parseInt(v) || s.fps })} ariaLabel={t("FPS de sortie")}
              options={FPS_PRESETS.map(f => ({ value: f, label: (f === 'Conserver' || f === 'Personnalisé') ? t(f) : f + ' fps' }))} />
          </div>
        </div>
        {s.fpsPreset === 'Personnalisé' && (
          <input type="number" className={INPUT_CLS} value={s.fps} onChange={e => patch({ fps: Number(e.target.value) })} placeholder="FPS" />
        )}
        <Slider label={t("Ralenti (slow motion) ×")} value={s.slowmo} min={1} max={16} step={0.5} onChange={(v: number) => patch({ slowmo: v })} suffix="×" accent="#a855f7" />
        <p className="text-[10px] text-gray-500">{t("Le ralenti génère les images manquantes par IA. L'audio est retiré en mode ralenti.")}</p>
      </Section>

      {/* Stabilization */}
      <Section title={t("Stabilisation")} icon={<Crosshair className="w-3.5 h-3.5 text-blue-400" />} accent="#3b82f6" on={s.stabEnabled} onToggle={() => patch({ stabEnabled: !s.stabEnabled })}>
        <Slider label={t("Force du lissage")} value={s.smoothness} min={0} max={16} step={0.5} onChange={(v: number) => patch({ smoothness: v })} accent="#3b82f6" />
        <Slider label={t("Réduction des secousses")} value={s.reduce} min={0} max={5} onChange={(v: number) => patch({ reduce: v })} accent="#3b82f6" />
        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.rollingShutter} onClick={() => patch({ rollingShutter: !s.rollingShutter })} /> {t("Correction rolling shutter")}</label>
          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.fullFrame} onClick={() => patch({ fullFrame: !s.fullFrame })} /> {t("Image pleine (sinon recadrage auto)")}</label>
        </div>
      </Section>

      {/* Export */}
      <Section title={t("Export")} icon={<Download className="w-3.5 h-3.5 text-green-400" />} accent="#22c55e" on={true}>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={LABEL_CLS}>{t("Format")}</label>
            <GlassSelect className="mt-1 w-full" value={s.format} onChange={v => patch({ format: v })} ariaLabel={t("Format")} options={FORMATS.map(f => ({ value: f, label: f }))} /></div>
          <div><label className={LABEL_CLS}>{t("Codec")}</label>
            <GlassSelect className="mt-1 w-full" value={s.codec} onChange={v => patch({ codec: v })} ariaLabel={t("Codec")} options={CODECS.map(c => ({ value: c.v, label: c.l }))} /></div>
          {s.codec !== 'prores' && (
            <div><label className={LABEL_CLS}>{t("Préréglage")}</label>
              <GlassSelect className="mt-1 w-full" value={s.preset} onChange={v => patch({ preset: v })} ariaLabel={t("Préréglage")} options={X264_PRESETS.map(p => ({ value: p, label: p }))} /></div>
          )}
        </div>
        <Slider label={t("Qualité")} value={s.quality} min={0} max={100} onChange={(v: number) => patch({ quality: v })} suffix="%" accent="#22c55e" />
        <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer"><Toggle on={s.audioCopy} onClick={() => patch({ audioCopy: !s.audioCopy })} /> {t("Copier la piste audio")}</label>
        <div className="flex gap-2 items-end">
          <div className="flex-1"><label className={LABEL_CLS}>{t("Dossier de sortie")}</label>
            <input className={INPUT_CLS + ' mt-1'} value={s.outputDir} onChange={e => patch({ outputDir: e.target.value })} placeholder={t("Dossier de destination…")} /></div>
          <button onClick={onBrowseOutput} className="px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"><FolderOpen className="w-4 h-4" /></button>
        </div>
      </Section>

      {/* Device */}
      <div className="grid grid-cols-2 gap-3">
        <div><label className={LABEL_CLS}>{t("Processeur (Device)")}</label>
          <GlassSelect className="mt-1 w-full" value={s.device} onChange={v => patch({ device: v })} ariaLabel={t("Processeur (Device)")}
            options={[{ value: 'auto', label: 'Auto' }, ...gpuList.map((g: any) => ({ value: g.id, label: g.name })), { value: 'cpu', label: t('CPU uniquement') }]} /></div>
        <div className="pt-0.5"><Slider label={t("VRAM max")} value={Math.round(s.vram * 100)} min={10} max={100} onChange={(v: number) => patch({ vram: v / 100 })} suffix="%" /></div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 pt-2 sticky bottom-0">
        {running ? (
          <button onClick={onCancel} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 flex items-center justify-center gap-2">
            <Square className="w-4 h-4" /> {t("Arrêter")} ({job.percent}% · {job.stage}{job.speed ? ` · ${job.speed}` : ''})
          </button>
        ) : job.status === 'done' ? (
          <>
            <button onClick={() => job.outputPath && onOpenOutput(job.outputPath)} className="flex-1 px-4 py-3 rounded-xl font-bold text-sm bg-green-500/20 border border-green-500/40 text-green-200 hover:bg-green-500/30 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {t("Terminé — Ouvrir le dossier")}
            </button>
            <button onClick={onStart} className="px-4 py-3 rounded-xl font-bold text-sm bg-white/5 border border-white/10 hover:bg-white/10"><RotateCcw className="w-4 h-4" /></button>
          </>
        ) : (
          <button onClick={onStart}
            className="flex-1 px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            style={{ background: 'linear-gradient(135deg, rgba(217,70,239,0.75), rgba(168,85,247,0.75))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 24px rgba(217,70,239,0.4)' }}>
            <Play className="w-4 h-4 fill-current" /> {t("Traiter cette vidéo")}
          </button>
        )}
        <button onClick={onApplyAll} title={t("Appliquer ces réglages à toute la file")}
          className="px-4 py-3 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2"><Layers className="w-4 h-4" /> {t("À tous")}</button>
      </div>

      {job.status === 'error' && job.error && (
        <pre className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-xl p-3 whitespace-pre-wrap select-text">{job.error}</pre>
      )}
    </div>
  );
}

// ── Before / After split viewer ──
function BeforeAfter({ job, toSpec, electron, showToast }: any) {
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [afterUrl, setAfterUrl] = useState('');
  const [beforeUrl, setBeforeUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => { setAfterUrl(''); setBeforeUrl(''); setPlaying(false); setSplit(50); setZoom(1); }, [job?.id]);

  // Drag the split handle anywhere over the viewer (relative to the video box).
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current || !boxRef.current) return;
      const r = boxRef.current.getBoundingClientRect();
      setSplit(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  if (!job) return <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">{t("Sélectionnez un fichier pour comparer")}</div>;

  // After = generated preview (or finished render). Before = matching unprocessed
  // clip from the preview (or the source for a finished render).
  const aUrl = afterUrl || (job.outputPath ? mediaUrl(job.outputPath) : '');
  const bUrl = beforeUrl || mediaUrl(job.inputPath);
  const hasResult = !!aUrl;
  const meta = job.meta;
  const ar = meta && meta.width && meta.height ? meta.width / meta.height : 16 / 9;

  const genPreview = async () => {
    setLoading(true); setAfterUrl(''); setBeforeUrl(''); setPlaying(false);
    const start = beforeRef.current ? Math.max(0, beforeRef.current.currentTime) : 0;
    const res = await electron.topazPreview?.({ ...toSpec(job, { start, duration: 3 }) }).catch((e: any) => ({ error: String(e) }));
    setLoading(false);
    if (res?.outputPath) { setAfterUrl(mediaUrl(res.outputPath)); if (res.beforePath) setBeforeUrl(mediaUrl(res.beforePath)); }
    else showToast('error', res?.error || t('Aperçu impossible.'));
  };

  const togglePlay = () => {
    const b = beforeRef.current, a = afterRef.current; if (!b) return;
    if (b.paused) { b.play().catch(() => {}); a?.play().catch(() => {}); setPlaying(true); }
    else { b.pause(); a?.pause(); setPlaying(false); }
  };
  const onTime = () => { const b = beforeRef.current, a = afterRef.current; if (b && a && Math.abs(b.currentTime - a.currentTime) > 0.08) a.currentTime = b.currentTime; };

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-5 gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={genPreview} disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, rgba(217,70,239,0.7), rgba(168,85,247,0.7))', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          {loading ? t('Génération…') : (hasResult ? t('Régénérer (3s)') : t('Générer un aperçu (3s)'))}
        </button>
        {hasResult && (
          <button onClick={togglePlay} className="px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-2">
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}{playing ? t('Pause') : t('Lecture')}
          </button>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{t("Zoom")}</span>
          <input type="range" min={1} max={4} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-28 accent-fuchsia-500" />
          <span className="font-mono w-8">{zoom.toFixed(1)}×</span>
        </div>
        {hasResult && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{t("Comparaison")}</span>
            <input type="range" min={0} max={100} value={split} onChange={e => setSplit(Number(e.target.value))} className="w-32 accent-fuchsia-500" />
          </div>
        )}
      </div>

      <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center select-none" style={{ background: '#0a0a0a' }}>
        {!hasResult ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <video ref={beforeRef} src={bUrl} className="max-h-full max-w-full" style={{ transform: `scale(${zoom})` }} controls />
          </div>
        ) : (
          <div ref={boxRef} className="relative shadow-2xl"
            style={{ aspectRatio: String(ar), width: '100%', height: 'auto', maxWidth: '100%', maxHeight: '100%', transform: `scale(${zoom})`, transition: dragging.current ? 'none' : 'transform 0.15s' }}>
            {/* BEFORE (full) */}
            <video ref={beforeRef} src={bUrl} className="absolute inset-0 w-full h-full object-contain" muted loop playsInline onTimeUpdate={onTime} onEnded={() => setPlaying(false)} />
            {/* AFTER (clipped to the right of the handle) */}
            <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${split}%)` }}>
              <video ref={afterRef} src={aUrl} className="absolute inset-0 w-full h-full object-contain" muted loop playsInline />
            </div>
            {/* Handle */}
            <div className="absolute top-0 bottom-0 z-10 cursor-ew-resize" style={{ left: `${split}%`, transform: 'translateX(-50%)', width: 28 }}
              onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); e.preventDefault(); }}>
              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[2px] bg-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.9)]" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-fuchsia-500 border-2 border-white/90 flex items-center justify-center shadow-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6-4 6 4 6" /><path d="m15 6 4 6-4 6" /></svg>
              </div>
            </div>
            <span className="absolute top-2.5 left-2.5 px-2 py-1 rounded-md bg-black/70 text-[10px] font-semibold text-gray-200 tracking-wide z-10">{t("AVANT")}</span>
            <span className="absolute top-2.5 right-2.5 px-2 py-1 rounded-md bg-black/70 text-[10px] font-semibold text-fuchsia-300 tracking-wide z-10">{t("APRÈS")}</span>
          </div>
        )}
      </div>
      {hasResult && <p className="text-[11px] text-gray-500 text-center">{t("Glissez la poignée pour comparer · les deux clips (3 s, même segment) sont synchronisés.")}</p>}
    </div>
  );
}

// ── Performance panel ──
function PerfPanel({ stats, detect, gpuList, jobs }: any) {
  const bar = (label: string, val: number | null, color: string, sub?: string) => (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex justify-between mb-2"><span className="text-sm text-gray-300">{label}</span><span className="text-sm font-mono" style={{ color }}>{val == null ? '—' : `${val}%`}</span></div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${val || 0}%`, background: color }} /></div>
      {sub && <p className="text-[11px] text-gray-500 mt-1.5">{sub}</p>}
    </div>
  );
  const vramPct = stats?.vramTotal ? Math.round((stats.vramUsed / stats.vramTotal) * 100) : null;
  const ramPct = stats?.ramTotal ? Math.round((stats.ramUsed / stats.ramTotal) * 100) : null;
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        {bar('GPU', stats?.gpu ?? null, '#d946ef', stats?.gpuName || 'GPU')}
        {bar('VRAM', vramPct, '#a855f7', stats ? `${Math.round((stats.vramUsed || 0) / 1024)} / ${Math.round((stats.vramTotal || 0) / 1024)} Go` : '')}
        {bar('CPU', stats?.cpu ?? null, '#3b82f6')}
        {bar('RAM', ramPct, '#22c55e', stats ? `${Math.round((stats.ramUsed || 0) / 1024)} / ${Math.round((stats.ramTotal || 0) / 1024)} Go` : '')}
      </div>
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 space-y-2">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">{t("Moteur")}</h3>
        <Row k={t("Installation")} v={detect?.install || '—'} />
        <Row k={t("GPU NVIDIA")} v={detect?.nvidia || t('Non détecté (CPU/AMD/Intel via Auto)')} />
        <Row k={t("Encodeur matériel")} v={detect?.hasNvenc ? t('NVENC disponible') : t('Encodage CPU')} />
        <Row k={t("GPU détectés")} v={gpuList.map((g: any) => g.name).join(', ') || '—'} />
        <Row k={t("File d'attente")} v={t("{n} fichier(s) · {m} terminé(s)", { n: jobs.length, m: jobs.filter((j: Job) => j.status === 'done').length })} />
      </div>
      <p className="text-[11px] text-gray-500">{t("Le suivi GPU/VRAM en direct nécessite une carte NVIDIA (nvidia-smi). CPU et RAM sont toujours affichés.")}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 text-xs"><span className="text-gray-500 shrink-0">{k}</span><span className="text-gray-300 text-right select-text break-all">{v}</span></div>;
}
