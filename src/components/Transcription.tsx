import { useState, useEffect, useRef } from "react";

// Each export target maps to the file format(s) the app actually imports.
const TARGETS: { id: string; label: string; icon: string; desc: string; formats: string[] }[] = [
  { id: 'premiere',  label: 'Premiere Pro',    icon: '🟣', desc: 'Sous-titres .srt',          formats: ['srt'] },
  { id: 'ae',        label: 'After Effects',   icon: '🔷', desc: 'Script .jsx → calques texte', formats: ['aejsx', 'srt'] },
  { id: 'capcut',    label: 'CapCut',          icon: '⬛', desc: 'Sous-titres .srt',          formats: ['srt'] },
  { id: 'davinci',   label: 'DaVinci Resolve', icon: '🎚️', desc: 'Sous-titres .srt',          formats: ['srt'] },
  { id: 'fcp',       label: 'Final Cut Pro',   icon: '🎬', desc: 'Titres .fcpxml',            formats: ['fcpxml'] },
  { id: 'web',       label: 'YouTube / Web',   icon: '▶',  desc: '.srt + .vtt',               formats: ['srt', 'vtt'] },
  { id: 'styled',    label: 'Sous-titres stylés', icon: '🎨', desc: '.ass (CapCut/Aegisub)',  formats: ['ass'] },
  { id: 'text',      label: 'Texte brut',      icon: '📄', desc: '.txt',                      formats: ['txt'] },
  { id: 'data',      label: 'Données',         icon: '🧩', desc: '.json + .csv',              formats: ['json', 'csv'] },
  { id: 'lyrics',    label: 'Paroles',         icon: '🎵', desc: '.lrc (synchro musique)',     formats: ['lrc'] },
];

const LANGUAGES = [
  { code: 'auto', label: 'Détection auto' }, { code: 'fr', label: 'Français' },
  { code: 'en', label: 'Anglais' }, { code: 'es', label: 'Espagnol' }, { code: 'de', label: 'Allemand' },
  { code: 'it', label: 'Italien' }, { code: 'pt', label: 'Portugais' }, { code: 'ja', label: 'Japonais' },
  { code: 'ko', label: 'Coréen' }, { code: 'zh', label: 'Chinois' }, { code: 'ru', label: 'Russe' }, { code: 'ar', label: 'Arabe' },
];

const MODELS = [
  { id: 'base', label: 'Base', desc: 'Rapide · ~142 Mo' },
  { id: 'small', label: 'Small', desc: 'Équilibré · ~466 Mo' },
  { id: 'medium', label: 'Medium', desc: 'Précis · ~1.5 Go' },
  { id: 'large', label: 'Large v3', desc: 'Maximum · ~2.9 Go' },
];

type ResultFile = { format: string; ext: string; path: string };

export default function Transcription() {
  const [inputPath, setInputPath] = useState<string>('');
  const [outputDir, setOutputDir] = useState<string>('');
  const [language, setLanguage] = useState('auto');
  const [model, setModel] = useState('base');
  const [selected, setSelected] = useState<Set<string>>(new Set(['premiere', 'ae', 'capcut']));
  const [burnIn, setBurnIn] = useState(false);
  const [fontSize, setFontSize] = useState(48);
  const [primaryColour, setPrimaryColour] = useState('#FFFFFF');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<string>('');
  const [results, setResults] = useState<ResultFile[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const jobId = useRef<string>('');

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    api.onTranscribeProgress?.((d: any) => { if (d.id === jobId.current) setProgress(d.message); });
    api.onTranscribeComplete?.((d: any) => {
      if (d.id !== jobId.current) return;
      setResults(d.files || []); setStatus('done'); setProgress('');
    });
    api.onTranscribeError?.((d: any) => {
      if (d.id !== jobId.current) return;
      setErrorMsg(d.error || 'Erreur inconnue'); setStatus('error'); setProgress('');
    });
  }, []);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const pickFile = async () => {
    const f = await (window as any).electronAPI?.selectMediaFile?.();
    if (f) setInputPath(f);
  };
  const pickDir = async () => {
    const d = await (window as any).electronAPI?.selectDirectory?.();
    if (d) setOutputDir(d);
  };

  const start = () => {
    if (!inputPath) return;
    const formats = Array.from(new Set(
      Array.from(selected).flatMap(id => TARGETS.find(t => t.id === id)?.formats || [])
    ));
    if (!formats.length && !burnIn) return;
    jobId.current = 'trx_' + Date.now();
    setStatus('running'); setResults([]); setErrorMsg(''); setProgress('Initialisation…');
    (window as any).electronAPI?.transcribe?.({
      id: jobId.current, inputPath, language, model, outputDir: outputDir || undefined,
      formats, burnIn,
      style: { fontSize, primaryColour, outlineColour: '#000000', outlineWidth: 2 },
    });
  };

  const fileName = inputPath ? inputPath.split(/[\\/]/).pop() : '';
  const totalFormats = Array.from(new Set(Array.from(selected).flatMap(id => TARGETS.find(t => t.id === id)?.formats || []))).length;

  return (
    <div className="h-full overflow-y-auto p-6 text-gray-200">
      <div className="max-w-3xl mx-auto flex flex-col gap-5">

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>📝</span> Orbit Transcription
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Transcris n'importe quelle vidéo/audio par IA, puis exporte vers Premiere, After Effects, CapCut, DaVinci…
          </p>
        </div>

        {/* File picker */}
        <button onClick={pickFile}
          className={`w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${inputPath ? 'border-pink-500/40 bg-pink-500/5' : 'border-white/10 hover:border-white/25 bg-white/[0.02]'}`}>
          {inputPath ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">🎞️</span>
              <div className="text-left">
                <div className="text-sm font-medium text-white truncate max-w-md">{fileName}</div>
                <div className="text-xs text-gray-500">Cliquer pour changer de fichier</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">📂</span>
              <div className="text-sm font-medium text-white">Choisir une vidéo ou un audio</div>
              <div className="text-xs text-gray-500">MP4, MKV, MOV, MP3, WAV…</div>
            </div>
          )}
        </button>

        {/* Language + model */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Langue</label>
            <select value={language} onChange={e => setLanguage(e.target.value)}
              className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-pink-500/50">
              {LANGUAGES.map(l => <option key={l.code} value={l.code} className="bg-[#12121a]">{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Modèle IA</label>
            <select value={model} onChange={e => setModel(e.target.value)}
              className="mt-1.5 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-pink-500/50">
              {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#12121a]">{m.label} — {m.desc}</option>)}
            </select>
          </div>
        </div>

        {/* Export targets */}
        <div>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Exporter vers {totalFormats > 0 && <span className="text-pink-400">({totalFormats} format{totalFormats > 1 ? 's' : ''})</span>}
          </label>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {TARGETS.map(t => {
              const on = selected.has(t.id);
              return (
                <button key={t.id} onClick={() => toggle(t.id)}
                  className={`relative rounded-xl border p-3 text-left transition-all ${on ? 'border-pink-500/50 bg-pink-500/10' : 'border-white/8 bg-white/[0.02] hover:border-white/20'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{t.icon}</span>
                    <span className="text-sm font-semibold text-white">{t.label}</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1">{t.desc}</div>
                  {on && <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[10px] text-white">✓</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Style + burn-in */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={burnIn} onChange={e => setBurnIn(e.target.checked)} className="accent-pink-500 w-4 h-4" />
            <div>
              <div className="text-sm font-medium text-white">Incruster les sous-titres dans la vidéo</div>
              <div className="text-xs text-gray-500">Génère aussi un .mp4 avec sous-titres gravés (non éditables)</div>
            </div>
          </label>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Taille police</span>
              <input type="number" min={12} max={120} value={fontSize} onChange={e => setFontSize(+e.target.value)}
                className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white outline-none" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Couleur</span>
              <input type="color" value={primaryColour} onChange={e => setPrimaryColour(e.target.value)}
                className="w-9 h-7 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
            </div>
          </div>
        </div>

        {/* Output folder */}
        <div className="flex items-center gap-2">
          <button onClick={pickDir} className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-gray-300 whitespace-nowrap">📁 Dossier de sortie</button>
          <div className="text-xs text-gray-500 truncate">{outputDir || 'À côté du fichier source'}</div>
        </div>

        {/* Action */}
        <button onClick={start} disabled={!inputPath || status === 'running' || (totalFormats === 0 && !burnIn)}
          className="w-full py-3.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)' }}>
          {status === 'running' ? '⏳ Transcription en cours…' : '✨ Transcrire & exporter'}
        </button>

        {/* Progress */}
        {status === 'running' && (
          <div className="rounded-xl border border-pink-500/20 bg-pink-500/5 p-3 text-sm text-pink-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
            {progress || 'Traitement…'}
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            ✗ {errorMsg}
          </div>
        )}

        {/* Results */}
        {status === 'done' && results.length > 0 && (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.04] p-4">
            <div className="text-sm font-semibold text-green-300 mb-3">✅ {results.length} fichier(s) généré(s)</div>
            <div className="flex flex-col gap-1.5">
              {results.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono uppercase text-pink-400 w-14 shrink-0">.{r.ext}</span>
                    <span className="text-xs text-gray-400 truncate">{r.path.split(/[\\/]/).pop()}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => (window as any).electronAPI?.openFile?.(r.path)}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-300">Ouvrir</button>
                    <button onClick={() => (window as any).electronAPI?.showItemInFolder?.(r.path)}
                      className="text-[11px] px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-gray-300">📁</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
