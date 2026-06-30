import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Download, CheckCircle2, X, FolderOpen, AlertCircle } from "lucide-react";
import GlassSelect from "./GlassSelect";

type Quality = '1080p' | '720p' | '480p' | '360p';
type AudioLang = 'ja-JP' | 'en-US' | 'fr-FR' | 'de-DE' | 'es-419' | 'pt-BR';
type SubLang = 'fr-FR' | 'en-US' | 'fr-FR,en-US' | 'none';

type CrunchyrollEpisode = {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  cookies: string;
  quality: Quality;
  audioLang: AudioLang;
  subLang: SubLang;
  status: 'ready' | 'downloading' | 'completed' | 'error';
  progress?: number;
  speed?: string;
  eta?: string;
  errorMessage?: string;
};

export default function CrunchyrollDownloader() {
  const [episodes, setEpisodes] = useState<CrunchyrollEpisode[]>([]);
  const [snifferStatus, setSnifferStatus] = useState<{ isLoggedIn: boolean; currentUrl?: string } | null>(null);
  const [outputDir, setOutputDir] = useState('');

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;

    api.onCrunchyrollEpisodeDetected?.((data: any) => {
      setEpisodes(prev => {
        if (prev.find(e => e.url === data.url)) return prev;
        return [{
          id: Math.random().toString(36).substr(2, 9),
          url: data.url,
          title: data.title || 'Épisode Crunchyroll',
          thumbnail: data.thumbnail,
          cookies: data.cookies || '',
          quality: '1080p',
          audioLang: 'ja-JP',
          subLang: 'fr-FR',
          status: 'ready',
        }, ...prev];
      });
    });

    api.onCrunchyrollProgress?.((data: any) => {
      setEpisodes(prev => prev.map(e => e.id === data.id
        ? { ...e, progress: data.percent, speed: data.speed, eta: data.eta }
        : e));
    });

    api.onCrunchyrollComplete?.((data: any) => {
      setEpisodes(prev => prev.map(e => e.id === data.id ? { ...e, status: 'completed' } : e));
    });

    api.onCrunchyrollError?.((data: any) => {
      setEpisodes(prev => prev.map(e => e.id === data.id
        ? { ...e, status: 'error', errorMessage: data.error }
        : e));
    });

    api.onCrunchyrollSnifferStatus?.((data: any) => {
      setSnifferStatus(data);
    });
  }, []);

  const handleOpenSniffer = () => (window as any).electronAPI?.openCrunchyrollSniffer?.();

  const handleSelectOutputDir = async () => {
    const dir = await (window as any).electronAPI?.selectDirectory();
    if (dir) setOutputDir(dir);
  };

  const handleDownload = (ep: CrunchyrollEpisode) => {
    setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, status: 'downloading', progress: 0, errorMessage: undefined } : e));
    (window as any).electronAPI?.startCrunchyrollDownload({
      id: ep.id,
      url: ep.url,
      cookies: ep.cookies,
      quality: ep.quality,
      audioLang: ep.audioLang,
      subLang: ep.subLang,
      outputDir: outputDir || undefined,
    });
  };

  const handleCancel = (ep: CrunchyrollEpisode) => {
    (window as any).electronAPI?.cancelDownload(ep.id);
    setEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, status: 'ready', progress: undefined } : e));
  };

  const updateEp = (id: string, changes: Partial<CrunchyrollEpisode>) =>
    setEpisodes(prev => prev.map(e => e.id === id ? { ...e, ...changes } : e));

  const removeEp = (id: string) => setEpisodes(prev => prev.filter(e => e.id !== id));

  return (
    <div className="p-6 h-full flex flex-col gap-5 bg-transparent">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.25)' }}>
            🍥
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-200">Crunchyroll Downloader</h2>
            <p className="text-xs text-gray-500">Télécharge des animés en haute qualité via le Sniffer</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {snifferStatus && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              snifferStatus.isLoggedIn
                ? 'text-green-400 border-green-500/30 bg-green-500/10'
                : 'text-orange-400 border-orange-500/30 bg-orange-500/10'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${snifferStatus.isLoggedIn ? 'bg-green-400' : 'bg-orange-400'}`} />
              {snifferStatus.isLoggedIn ? 'Connecté à Crunchyroll' : 'Non connecté'}
            </div>
          )}
          {episodes.length > 0 && (
            <button onClick={() => setEpisodes([])} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              Tout effacer
            </button>
          )}
        </div>
      </div>

      {/* Output directory */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSelectOutputDir}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)' }}
        >
          <FolderOpen className="w-4 h-4 text-orange-400" />
          Dossier de sortie
        </button>
        <div
          className="flex-1 px-3 py-2 rounded-xl text-xs text-gray-400 truncate"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          title={outputDir || 'Dossier Téléchargements par défaut'}
        >
          {outputDir || <span className="italic text-gray-600">Dossier Téléchargements par défaut</span>}
        </div>
        {outputDir && (
          <button onClick={() => setOutputDir('')} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Empty state */}
      {episodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-8">
          <div
            className="w-full max-w-md rounded-2xl p-8 flex flex-col items-center gap-5 text-center"
            style={{
              background: 'rgba(249,115,22,0.05)',
              border: '1px dashed rgba(249,115,22,0.25)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="text-6xl">🍥</div>
            <div>
              <h3 className="text-lg font-bold text-gray-200 mb-2">Comment télécharger un animé</h3>
              <ol className="text-sm text-gray-500 leading-relaxed space-y-1 text-left list-decimal list-inside">
                <li>Ouvre le navigateur Crunchyroll</li>
                <li>Connecte-toi à ton compte Crunchyroll</li>
                <li>Navigue vers la page de l'épisode</li>
                <li>L'épisode apparaît automatiquement ici</li>
                <li>Choisis la qualité, la langue et lance le téléchargement</li>
              </ol>
            </div>
            <button
              onClick={handleOpenSniffer}
              className="flex items-center gap-3 px-8 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, rgba(249,115,22,0.85), rgba(239,68,68,0.85))',
                boxShadow: '0 8px 32px rgba(249,115,22,0.3), 0 1px 0 rgba(255,255,255,0.2) inset',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <Globe className="w-5 h-5" />
              Ouvrir Crunchyroll
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 overflow-hidden">

          {/* Sniffer button compact */}
          <button
            onClick={handleOpenSniffer}
            className="self-start flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(249,115,22,0.75), rgba(239,68,68,0.75))',
              boxShadow: '0 4px 16px rgba(249,115,22,0.2)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <Globe className="w-4 h-4" />
            Ouvrir Crunchyroll
          </button>

          {/* Episodes list */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
            <AnimatePresence>
              {episodes.map(ep => (
                <motion.div
                  key={ep.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`p-4 rounded-xl border flex flex-col gap-3 ${
                    ep.status === 'completed'
                      ? 'border-green-500/30 glass-panel shadow-[inset_0_0_20px_rgba(34,197,94,0.08)]'
                      : ep.status === 'error'
                      ? 'border-red-500/30 glass-panel'
                      : 'glass-panel hover:bg-white/5 transition-all'
                  }`}
                >
                  {/* Episode row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
                        style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.2)' }}>
                        🍥
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-200 text-sm truncate">{ep.title}</p>
                        <p className="text-[10px] text-gray-600 truncate mt-0.5">{ep.url}</p>

                        {ep.status === 'downloading' && (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-300"
                                  style={{
                                    width: `${ep.progress || 0}%`,
                                    background: 'linear-gradient(90deg, #f97316, #ef4444)',
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-orange-400 font-bold shrink-0">
                                {ep.progress?.toFixed(0) ?? 0}%
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-500">
                              {ep.speed && <span>{ep.speed}</span>}
                              {ep.eta && ep.eta !== 'Unknown' && <span>ETA {ep.eta}</span>}
                            </div>
                          </div>
                        )}

                        {ep.status === 'completed' && (
                          <span className="text-[10px] text-green-400 font-semibold flex items-center gap-1 mt-1">
                            <CheckCircle2 className="w-3 h-3" /> Téléchargé avec succès
                          </span>
                        )}

                        {ep.status === 'error' && (
                          <span className="text-[10px] text-red-400 font-medium flex items-center gap-1 mt-1" title={ep.errorMessage}>
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ep.errorMessage ? ep.errorMessage.substring(0, 70) : 'Erreur inconnue'}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {(ep.status === 'ready' || ep.status === 'error') && (
                        <button
                          onClick={() => handleDownload(ep)}
                          className="group relative px-3 py-1.5 rounded-xl text-sm font-bold text-white overflow-hidden transition-all hover:scale-105 active:scale-95"
                          style={{
                            background: 'linear-gradient(135deg, rgba(249,115,22,0.8), rgba(239,68,68,0.8))',
                            boxShadow: '0 4px 15px rgba(249,115,22,0.3)',
                            border: '1px solid rgba(255,255,255,0.2)',
                          }}
                        >
                          <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                          <Download className="w-4 h-4 relative z-10" />
                        </button>
                      )}
                      {ep.status === 'downloading' && (
                        <button
                          onClick={() => handleCancel(ep)}
                          className="p-1.5 border border-red-500/30 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Annuler"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeEp(ep.id)}
                        className="p-1.5 border border-white/10 rounded-lg text-gray-400 hover:text-red-500 hover:border-red-500/30 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Options */}
                  {(ep.status === 'ready' || ep.status === 'error') && (
                    <div className="flex flex-wrap gap-3 pt-2 border-t border-white/5">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Qualité</label>
                        <GlassSelect value={ep.quality} onChange={v => updateEp(ep.id, { quality: v as Quality })} className="w-40 py-1.5 text-xs" ariaLabel="Qualité"
                          options={[{ value: '1080p', label: '1080p — Full HD' }, { value: '720p', label: '720p — HD' }, { value: '480p', label: '480p — SD' }, { value: '360p', label: '360p' }]} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Audio</label>
                        <GlassSelect value={ep.audioLang} onChange={v => updateEp(ep.id, { audioLang: v as AudioLang })} className="w-44 py-1.5 text-xs" ariaLabel="Audio"
                          options={[{ value: 'ja-JP', label: 'Japonais (VO)' }, { value: 'en-US', label: 'Anglais (VA)' }, { value: 'fr-FR', label: 'Français (VF)' }, { value: 'de-DE', label: 'Allemand' }, { value: 'es-419', label: 'Espagnol (LATAM)' }, { value: 'pt-BR', label: 'Portugais (BR)' }]} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500 uppercase font-semibold tracking-wide">Sous-titres</label>
                        <GlassSelect value={ep.subLang} onChange={v => updateEp(ep.id, { subLang: v as SubLang })} className="w-48 py-1.5 text-xs" ariaLabel="Sous-titres"
                          options={[{ value: 'fr-FR', label: 'Français' }, { value: 'en-US', label: 'Anglais' }, { value: 'fr-FR,en-US', label: 'Français + Anglais' }, { value: 'none', label: 'Aucun' }]} />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
