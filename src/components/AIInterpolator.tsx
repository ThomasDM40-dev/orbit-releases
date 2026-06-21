import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, FolderOpen, Play, Terminal, Info, AlertCircle, CheckCircle2, Loader2, Square } from 'lucide-react';
import SegmentedTabs from './SegmentedTabs';
import GlassSelect from './GlassSelect';
import { t } from '@/i18n';

const INPUT_CLS = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 hover:border-white/20 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all w-full select-text shadow-sm backdrop-blur-md";
const LABEL_CLS = "text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1";

type LogEntry = { type: 'info' | 'success' | 'error' | 'progress'; text: string; ts: string };

const AI_ENGINES = [
  { value: 'RIFE_NCNN', label: 'RIFE (NCNN) - Vulkan/NCNN Implementation' },
  { value: 'DAIN_NCNN', label: 'DAIN (NCNN) - Vulkan/NCNN Implementation' },
];

const FPS_MULTIPLIERS = ['x2', 'x4', 'x8'];
const OUTPUT_FORMATS = ['MP4', 'MKV', 'MOV', 'GIF', 'WEBM'];
const CODECS = ['h264', 'h265 (HEVC)', 'VP9', 'AV1'];
const WHEN_DONE = ['Do Nothing', 'Open Output Folder'];

export default function AIInterpolator() {
  const electronAPI = (window as any).electronAPI;

  const defaultTabs = [
    { id: 'interpolation', label: t('Interpolation') },
    { id: 'quick', label: t('Préréglages') },
    { id: 'about', label: t('À Propos') },
  ];

  const [tabConfig, setTabConfig] = useState<{ id: string; label: string; visible: boolean }[]>(() => {
    const saved = localStorage.getItem('orbit_tabs');
    if (saved) {
      // Always refresh labels from defaults so the active language wins.
      try {
        const parsed = JSON.parse(saved) as { id: string; label: string; visible: boolean }[];
        return parsed.map(p => ({ ...p, label: defaultTabs.find(d => d.id === p.id)?.label ?? p.label }));
      } catch (e) {}
    }
    return defaultTabs.map(x => ({ ...x, visible: true }));
  });

  useEffect(() => {
    localStorage.setItem('orbit_tabs', JSON.stringify(tabConfig));
  }, [tabConfig]);

  const [showTabSettings, setShowTabSettings] = useState(false);
  const [activeTab, setActiveTab] = useState(tabConfig.find(t => t.visible)?.id || 'interpolation');
  const [engine, setEngine] = useState('RIFE_NCNN');
  const [inputVideo, setInputVideo] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [multiplier, setMultiplier] = useState('x2');
  const [customMultiplier, setCustomMultiplier] = useState('3');
  const [isCustom, setIsCustom] = useState(false);
  const [videoFps, setVideoFps] = useState<number | null>(null);
  const [outFormat, setOutFormat] = useState('MP4');
  const [codec, setCodec] = useState('h264');
  const [whenDone, setWhenDone] = useState('Do Nothing');
  const [gpu, setGpu] = useState('auto');
  const [gpuList, setGpuList] = useState<{id: string, name: string}[]>([]);
  const [status, setStatus] = useState<'ready' | 'running' | 'done' | 'error'>('ready');
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([
    { type: 'info', text: t('Bienvenue dans Orbit Interpolator !'), ts: new Date().toLocaleTimeString() },
    { type: 'info', text: t('Sélectionnez une vidéo et appuyez sur "Interpoler !" pour commencer.'), ts: new Date().toLocaleTimeString() },
  ]);
  const logRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef(false);

  const addLog = (type: LogEntry['type'], text: string) => {
    setLogs(prev => [...prev, { type, text, ts: new Date().toLocaleTimeString() }]);
  };

  // Auto-scroll log console
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Set default output dir and fetch GPUs
  useEffect(() => {
    if (electronAPI?.getDefaultDownloads) {
      electronAPI.getDefaultDownloads().then((dir: string) => {
        if (dir && !outputDir) setOutputDir(dir);
      });
    }
    if (electronAPI?.getGpus) {
      electronAPI.getGpus().then((gpus: any) => {
        if (gpus && gpus.length > 0) setGpuList(gpus);
      });
    }
  }, []);

  // Listen to IPC events from main process - only once
  useEffect(() => {
    if (!electronAPI || listenersRef.current) return;
    listenersRef.current = true;

    electronAPI.onAIInterpolateProgress?.((data: any) => {
      const msg = data?.time || data?.message || '';
      if (!msg) return;
      addLog('progress', msg);

      // Parse progress from RIFE output
      if (msg.includes('Extraction')) {
        setProgress(10);
        setProgressText(t('Extraction des frames...'));
      } else if (msg.includes('Interpolation IA')) {
        setProgress(20);
        setProgressText(t('Interpolation IA en cours...'));
      } else if (msg.includes('Recomposition')) {
        setProgress(80);
        setProgressText(t('Recomposition vidéo...'));
      } else if (msg.includes('Téléchargement')) {
        setProgress(5);
        setProgressText(t('Téléchargement RIFE-NCNN...'));
      }

      // Try to parse frame progress from RIFE output like "123/456"
      const frameMatch = msg.match(/(\d+)\/(\d+)/);
      if (frameMatch) {
        const current = parseInt(frameMatch[1]);
        const total = parseInt(frameMatch[2]);
        if (total > 0) {
          const pct = 20 + Math.round((current / total) * 60);
          setProgress(Math.min(pct, 79));
          setProgressText(t('Frame {c}/{t}', { c: current, t: total }));
        }
      }
    });

    electronAPI.onAIInterpolateComplete?.((data: any) => {
      setStatus('done');
      setProgress(100);
      setProgressText(t('Terminé !'));
      addLog('success', t('✅ Interpolation terminée avec succès !'));
      if (data?.filePath) {
        addLog('success', t('Fichier : {name}', { name: data.filePath.split('\\').pop() }));
      }
    });

    electronAPI.onAIInterpolateError?.((data: any) => {
      setStatus('error');
      setProgress(0);
      setProgressText('');
      addLog('error', data?.error || t('Une erreur est survenue.'));
    });
  }, [electronAPI]);

  const handleBrowseVideo = async () => {
    if (!electronAPI) return;
    const file = await electronAPI.selectVideoFile?.();
    if (file) {
      setInputVideo(file);
      addLog('info', t('Vidéo sélectionnée : {name}', { name: file.split('\\').pop() }));
      // Get FPS
      if (electronAPI.getVideoFps) {
        const fps = await electronAPI.getVideoFps(file);
        if (fps) setVideoFps(fps);
      }
    }
  };

  const handleBrowseOutput = async () => {
    if (!electronAPI) return;
    const dir = await electronAPI.selectDirectory?.();
    if (dir) {
      setOutputDir(dir);
      addLog('info', t('Dossier de sortie : {dir}', { dir }));
    }
  };

  const handleInterpolate = () => {
    if (!inputVideo) {
      addLog('error', t('Veuillez sélectionner une vidéo source.'));
      return;
    }
    if (!outputDir) {
      addLog('error', t('Veuillez sélectionner un dossier de sortie.'));
      return;
    }
    setStatus('running');
    setProgress(0);
    setProgressText(t('Démarrage...'));
    setLogs([]);
    addLog('info', t("Démarrage de l'interpolation ({engine})...", { engine }));
    addLog('info', t('Multiplicateur : {m} | Format : {f} | Codec : {c}', { m: multiplier, f: outFormat, c: codec }));
    addLog('info', t('Vidéo : {name}', { name: inputVideo.split('\\').pop() }));

    if (electronAPI?.aiInterpolate) {
      electronAPI.aiInterpolate({
        inputPath: inputVideo,
        outputDir,
        engine,
        model: 'rife-v4.26',
        multiplier: isCustom ? (parseInt(customMultiplier) || 2) : parseInt(multiplier.replace('x', '')), 
        outputFormat: outFormat,
        codec,
        whenDone,
        gpu,
      });
    } else {
      addLog('error', t('API Electron non disponible.'));
      setStatus('error');
    }
  };

  const moveTab = (index: number, direction: -1 | 1) => {
    const newConfig = [...tabConfig];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newConfig.length) {
      const temp = newConfig[index];
      newConfig[index] = newConfig[targetIndex];
      newConfig[targetIndex] = temp;
      setTabConfig(newConfig);
    }
  };

  const toggleTab = (id: string) => {
    setTabConfig(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center border border-white/10">
            <Zap className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Orbit Interpolator</h2>
            <p className="text-xs text-gray-500">Powered by RIFE-NCNN Vulkan</p>
          </div>
        </div>
        {/* Status indicator */}
        {status === 'running' && (
          <div className="flex items-center gap-2 text-purple-400 text-sm animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("En cours...")}
          </div>
        )}
        {status === 'done' && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {t("Terminé !")}
          </div>
        )}
      </div>

      {/* Progress bar - always visible when running */}
      {(status === 'running' || status === 'done') && (
        <div className="px-6 pt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>{progressText}</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden border border-white/10">
            <motion.div
              className={`h-full rounded-full ${status === 'done' ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-purple-500 to-pink-500'}`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        </div>
      )}

      {/* Tabs - iOS segmented control */}
      <div className="flex items-center justify-between px-6 py-2 border-b border-white/5">
        <SegmentedTabs
          tabs={tabConfig}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onReorder={setTabConfig}
          accentColor="#a855f7"
        />
        <div className="relative">
          <button
            onClick={() => setShowTabSettings(!showTabSettings)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:text-gray-300 transition-all hover:bg-white/8 border border-transparent hover:border-white/10"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            <span>{t("Onglets")}</span>
          </button>
          {showTabSettings && (
            <div
              className="absolute right-0 top-full mt-2 z-50 w-64 flex flex-col gap-1.5 p-3 rounded-2xl"
              style={{
                background: "rgba(15,15,25,0.92)",
                backdropFilter: "blur(24px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
              }}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("Onglets — glisser pour réordonner")}</span>
              </div>
              {tabConfig.map((tab) => (
                <div
                  key={tab.id}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{
                    background: tab.visible ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span className={`text-sm select-none ${tab.visible ? "text-gray-200" : "text-gray-600"}`}>
                    {tab.label}
                  </span>
                  <button
                    onClick={() => toggleTab(tab.id)}
                    className="relative shrink-0 w-10 h-6 rounded-full transition-all duration-300 focus:outline-none"
                    style={{
                      background: tab.visible
                        ? "linear-gradient(135deg, #a855f7, #7c3aed)"
                        : "rgba(255,255,255,0.12)",
                      boxShadow: tab.visible ? "0 0 12px rgba(168,85,247,0.4)" : "none",
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
                      style={{
                        left: tab.visible ? "calc(100% - 22px)" : "2px",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                      }}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'interpolation' && (
          <div className="flex-1 overflow-y-auto flex flex-col gap-0">
            {/* Settings */}
            <div className="p-6 space-y-3">
              {/* AI Engine */}
              <div className="glass-panel rounded-xl p-3 flex items-center gap-4">
                <div className="w-44 shrink-0"><label className={LABEL_CLS}><Info className="w-3 h-3" /> {t("Moteur IA")}</label></div>
                <GlassSelect value={engine} onChange={setEngine} disabled={status === 'running'} className="w-full"
                  options={AI_ENGINES} ariaLabel={t("Moteur IA")} />
              </div>

              {/* Input Video */}
              <div className="glass-panel rounded-xl p-3 flex items-center gap-4">
                <div className="w-44 shrink-0"><label className={LABEL_CLS}><FolderOpen className="w-3 h-3" /> {t("Vidéo Source")}</label></div>
                <input type="text" value={inputVideo} onChange={e => setInputVideo(e.target.value)}
                  placeholder={t("Cliquez Parcourir ou glissez un fichier...")}
                  className={INPUT_CLS} disabled={status === 'running'} />
                <button onClick={handleBrowseVideo} disabled={status === 'running'}
                  className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap disabled:opacity-40"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset",
                    color: "#e2e8f0",
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.12)"; (e.target as HTMLElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.07)"; (e.target as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  📂 {t("Parcourir")}
                </button>
              </div>

              {/* Output Directory */}
              <div className="glass-panel rounded-xl p-3 flex items-center gap-4">
                <div className="w-44 shrink-0"><label className={LABEL_CLS}><FolderOpen className="w-3 h-3" /> {t("Dossier Sortie")}</label></div>
                <input type="text" value={outputDir} onChange={e => setOutputDir(e.target.value)}
                  placeholder={t("Dossier de destination...")} className={INPUT_CLS} disabled={status === 'running'} />
                <button onClick={handleBrowseOutput} disabled={status === 'running'}
                  className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap disabled:opacity-40"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backdropFilter: "blur(12px)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.08) inset",
                    color: "#e2e8f0",
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.12)"; (e.target as HTMLElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.07)"; (e.target as HTMLElement).style.transform = "translateY(0)"; }}
                >
                  📁 {t("Parcourir")}
                </button>
              </div>

              {/* FPS + Format row */}
              <div className="flex gap-3">
                <div className="glass-panel rounded-xl p-3 flex items-center gap-3 flex-1">
                  <div className="w-32 shrink-0"><label className={LABEL_CLS}><Zap className="w-3 h-3" /> {t("Multiplicateur")}</label></div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {FPS_MULTIPLIERS.map(m => (
                      <button key={m} onClick={() => { setMultiplier(m); setIsCustom(false); }} disabled={status === 'running'}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
                          !isCustom && multiplier === m
                            ? 'bg-purple-500/30 text-purple-200 border border-purple-500/50 shadow-purple-500/20 shadow-lg -translate-y-0.5'
                            : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20 hover:bg-white/10'
                        } disabled:opacity-40 backdrop-blur-md`}>
                        {m}
                      </button>
                    ))}
                    {/* Custom button */}
                    <button onClick={() => setIsCustom(true)} disabled={status === 'running'}
                      className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm ${
                        isCustom
                          ? 'bg-pink-500/30 text-pink-200 border border-pink-500/50 shadow-pink-500/20 shadow-lg -translate-y-0.5'
                          : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20 hover:bg-white/10'
                      } disabled:opacity-40 backdrop-blur-md`}>
                      ✏️ {t("Perso")}
                    </button>
                    {isCustom && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-500 text-sm">x</span>
                        <input
                          type="number" min="2" max="64" step="1"
                          value={customMultiplier}
                          onChange={e => setCustomMultiplier(e.target.value)}
                          disabled={status === 'running'}
                          className="w-16 bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-sm text-pink-300 font-bold outline-none text-center disabled:opacity-40 hover:bg-white/10 focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20 transition-all shadow-sm backdrop-blur-md"
                        />
                      </div>
                    )}
                    {/* FPS preview */}
                    {videoFps && (
                      <div className="ml-2 flex items-center gap-1.5 text-xs">
                        <span className="text-gray-500 font-mono">{Math.round(videoFps)} fps</span>
                        <span className="text-gray-600">→</span>
                        <span className="text-purple-400 font-mono font-bold">
                          {Math.round(videoFps * (isCustom ? (parseInt(customMultiplier) || 2) : parseInt((isCustom ? customMultiplier : multiplier).replace('x', ''))))} fps
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="glass-panel rounded-xl p-3 flex items-center gap-3">
                  <label className={LABEL_CLS}>{t("Format")}</label>
                  <GlassSelect value={outFormat} onChange={setOutFormat} disabled={status === 'running'} className="w-full"
                    options={OUTPUT_FORMATS.map(f => ({ value: f, label: f }))} ariaLabel={t("Format")} />
                </div>
                <div className="glass-panel rounded-xl p-3 flex items-center gap-3">
                  <label className={LABEL_CLS}>{t("Codec")}</label>
                  <GlassSelect value={codec} onChange={setCodec} disabled={status === 'running'} className="w-full"
                    options={CODECS.map(c => ({ value: c, label: c }))} ariaLabel={t("Codec")} />
                </div>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-3 justify-between mt-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 font-semibold tracking-wider">{t("GPU :")}</label>
                    <GlassSelect value={gpu} onChange={setGpu} disabled={status === 'running'} className="w-48 py-1.5 text-xs" ariaLabel="GPU"
                      options={[{ value: 'auto', label: 'Auto' }, ...(gpuList.length === 0
                        ? [{ value: '0', label: t('GPU 0 (Défaut)') }, { value: '1', label: 'GPU 1' }, { value: '2', label: 'GPU 2' }]
                        : gpuList.map(g => ({ value: g.id, label: g.name })))]} />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500 font-semibold tracking-wider">{t("Après :")}</label>
                    <GlassSelect value={whenDone} onChange={setWhenDone} disabled={status === 'running'} className="w-52 py-1.5 text-xs" ariaLabel={t("Après")}
                      options={WHEN_DONE.map(w => ({ value: w, label: t(w) }))} />
                  </div>
                </div>
                <motion.button
                  onClick={handleInterpolate}
                  disabled={status === 'running'}
                  whileHover={{ scale: status === 'running' ? 1 : 1.04 }}
                  whileTap={{ scale: status === 'running' ? 1 : 0.96 }}
                  className={`relative px-8 py-3 rounded-2xl font-bold text-sm transition-all overflow-hidden ${
                    status === 'running' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                  }`}
                  style={{
                    background: status === 'running'
                      ? 'rgba(168,85,247,0.15)'
                      : 'linear-gradient(135deg, rgba(168,85,247,0.65) 0%, rgba(236,72,153,0.65) 100%)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(20px) saturate(200%)',
                    boxShadow: status === 'running'
                      ? '0 2px 8px rgba(0,0,0,0.3)'
                      : '0 4px 24px rgba(168,85,247,0.4), 0 1px 0 rgba(255,255,255,0.3) inset, 0 -1px 0 rgba(0,0,0,0.15) inset',
                    color: 'white',
                  }}
                >
                  {status !== 'running' && (
                    <span className="absolute inset-0 pointer-events-none rounded-2xl" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.22) 0%, transparent 65%)' }} />
                  )}
                  {status === 'running' ? (
                    <span className="relative flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t("En cours...")}</span>
                  ) : (
                    <span className="relative flex items-center gap-2"><Play className="w-4 h-4 fill-current" />{t("Interpoler !")}</span>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Log Console */}
            <div className="flex-1 mx-6 mb-6 glass-panel rounded-xl p-4 flex flex-col min-h-[150px]">
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-3 h-3 text-gray-500" />
                <p className="text-[10px] text-gray-500 uppercase font-semibold">{t("Console")}</p>
                <span className="text-[10px] text-gray-600 ml-auto">{t("{n} entrées", { n: logs.length })}</span>
              </div>
              <div ref={logRef} className="flex-1 overflow-y-auto space-y-0.5 font-mono text-xs">
                <AnimatePresence>
                  {logs.map((log, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex gap-2 py-0.5 ${
                        log.type === 'error' ? 'text-red-400' :
                        log.type === 'success' ? 'text-green-400' :
                        log.type === 'progress' ? 'text-purple-400' : 'text-gray-500'
                      }`}
                    >
                      <span className="text-gray-700 shrink-0">[{log.ts}]</span>
                      <span className="select-text">{log.text}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'quick' && (
          <div className="p-6 space-y-4">
            <div className="glass-panel rounded-xl p-6">
              <h3 className="font-bold text-white mb-4">{t("Préréglages Rapides")}</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: 'Anime 60FPS', desc: t('RIFE x2 - Optimisé anime'), icon: '🎌', mult: 'x2', fmt: 'MP4' },
                  { name: 'Film Fluide', desc: t('RIFE x2 - Qualité lossless'), icon: '🎬', mult: 'x2', fmt: 'MKV' },
                  { name: 'Slow Motion', desc: t('RIFE x4 - Ralenti x0.5'), icon: '🐌', mult: 'x4', fmt: 'MP4' },
                  { name: 'Super Fluide 120', desc: t('RIFE x4 - 120FPS'), icon: '⚡', mult: 'x4', fmt: 'MP4' },
                  { name: 'Discord GIF', desc: t('RIFE x2 → GIF'), icon: '💬', mult: 'x2', fmt: 'GIF' },
                  { name: 'Max FPS', desc: t('RIFE x8 - 240FPS'), icon: '🚀', mult: 'x8', fmt: 'MP4' },
                ].map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      setMultiplier(preset.mult);
                      setOutFormat(preset.fmt);
                      setActiveTab('interpolation');
                    }}
                    className="glass-panel hover:bg-white/10 rounded-xl p-4 text-left transition-all hover:scale-[1.02] border border-white/5 hover:border-purple-500/30"
                  >
                    <div className="text-2xl mb-2">{preset.icon}</div>
                    <div className="font-semibold text-sm text-white">{t(preset.name)}</div>
                    <div className="text-xs text-gray-500 mt-1">{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="p-6 flex flex-col items-center justify-center h-full gap-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.3)] border border-purple-500/20">
              <Zap className="w-10 h-10 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Orbit Interpolator</h2>
            <p className="text-gray-500 text-sm text-center max-w-md">
              {t("Interpolation vidéo par IA utilisant RIFE-NCNN (Real-time Intermediate Flow Estimation). Compatible GPU Vulkan (NVIDIA, AMD, Intel).")}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4 w-full max-w-md">
              {[
                { label: t('Moteur'), value: 'RIFE-NCNN Vulkan' },
                { label: t('Accélération'), value: 'GPU (Vulkan)' },
                { label: t('Modèle'), value: 'RIFE v4.26' },
                { label: t('Formats'), value: 'MP4, MKV, MOV, GIF, WEBM' },
              ].map(item => (
                <div key={item.label} className="glass-panel rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 uppercase">{item.label}</p>
                  <p className="text-sm text-white font-medium mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
