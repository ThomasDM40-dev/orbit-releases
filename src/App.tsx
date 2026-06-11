import DownloadInterface from "@/components/DownloadInterface";
import Converter from "@/components/Converter";
import Subscriptions from "@/components/Subscriptions";
import SettingsModal from "@/components/SettingsModal";
import ImportModal from "@/components/ImportModal";
import AIInterpolator from "@/components/AIInterpolator";
import SegmentedTabs from "@/components/SegmentedTabs";
import Transcription from "@/components/Transcription";
import TopazVideoAI from "@/components/TopazVideoAI";
import OrbitEnhance from "@/components/OrbitEnhance";
import HandBrake from "@/components/HandBrake";
import MediaLibrary from "@/components/MediaLibrary";
import MattingStudio from "@/components/MattingStudio";
import LiquidLoader from "@/components/LiquidLoader";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function App() {
  const defaultMainTabs = [
    { id: 'downloads', label: '🌐 Téléchargements' },
    { id: 'converter', label: '🔃 Convertisseur & Tags' },
    { id: 'subscriptions', label: '📡Abonnements ' },
    { id: 'interpolator', label: '⚡ Interpolateur IA' },
    { id: 'library', label: '🎬 Médiathèque' },
    { id: 'enhance', label: '🚀 Amélioration IA' },
    { id: 'matting', label: '✂️ Détourage IA' },
    { id: 'handbrake', label: '🔥 HandBrake' },
    { id: 'topaz', label: '✨ Topaz Video AI' },
    { id: 'transcription', label: '📝 Transcription' }
  ];

  const [mainTabConfig, setMainTabConfig] = useState<{ id: string; label: string; visible: boolean }[]>(() => {
    const saved = localStorage.getItem('orbit_main_tabs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { id: string; label: string; visible: boolean }[];
        const validIds = new Set(defaultMainTabs.map(t => t.id));
        // Drop tabs that no longer exist (e.g. Crunchyroll, removed).
        const cleaned = parsed.filter(t => validIds.has(t.id));
        // Merge in any newly-added default tabs so they appear for existing users.
        const known = new Set(cleaned.map(t => t.id));
        const merged = [...cleaned];
        defaultMainTabs.forEach(t => { if (!known.has(t.id)) merged.push({ ...t, visible: true }); });
        return merged;
      } catch (e) { }
    }
    return defaultMainTabs.map(t => ({ ...t, visible: true }));
  });

  useEffect(() => {
    localStorage.setItem('orbit_main_tabs', JSON.stringify(mainTabConfig));
  }, [mainTabConfig]);

  const [showMainTabSettings, setShowMainTabSettings] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(mainTabConfig.find(t => t.visible)?.id || 'downloads');

  // Discord Rich Presence: update on tab change
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.rpcUpdate) api.rpcUpdate({ tab: activeTab });
  }, [activeTab]);

  const [showLogs, setShowLogs] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateOk, setUpdateOk] = useState<boolean | null>(null);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const [language, setLanguage] = useState<'en' | 'fr' | 'es'>(() => (localStorage.getItem('app-lang') as any) || 'en');
  const [showSettings, setShowSettings] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const SETTINGS_DEFAULTS: any = {
    outputDir: localStorage.getItem('app-output-dir') || "C:\\Users\\User\\Downloads",
    proxy: localStorage.getItem('app-proxy') || "",
    maxConcurrent: parseInt(localStorage.getItem('app-max-concurrent') || "3", 10),
    theme: localStorage.getItem('app-theme') || "dark",
    accentColor: 'pink',
    // Téléchargements
    extractAudio: false, defaultFormat: 'best', embedThumbnail: false, embedMetadata: false,
    embedSubs: false, writeInfoJson: false, writeThumbnail: false, sponsorblock: false, removeSponsors: false,
    downloadArchive: false, noPart: false, mtime: false, noCheckCertificate: false, ignoreErrors: false,
    restrictFilenames: false, limitRate: '', concurrentFragments: 1, cookiesFromBrowser: 'none', customArgs: '',
    // Système
    launchAtStartup: false, minimizeToTray: false, notifications: false, disableHardwareAccel: false,
    // IA
    enhanceOutputDir: '', defaultGpu: 'auto',
  };
  const [settings, setSettings] = useState<any>(() => {
    try {
      const raw = localStorage.getItem('orbit-settings');
      if (raw) return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
    } catch (e) { }
    return { ...SETTINGS_DEFAULTS };
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const tabSettingsRef = useRef<HTMLDivElement>(null);

  const t = {
    en: {
      file: "File", downloads: "Downloads", languageMenu: "Language", tools: "Tools",
      minimize: "Minimize to Tray", newSub: "New Subscription", import: "Importer", openDir: "Open Downloads Folder", quit: "Quit",
      pauseAll: "Pause All Downloads", resumeAll: "Resume All Downloads", restartFailed: "Restart Failed Downloads", clearCompleted: "Clear Completed Downloads", clearAll: "Clear All Downloads", cancelAll: "Cancel All Downloads",
      viewLogs: "View Logs", updateYtdlp: "Update yt-dlp", checkUpdates: "Check for Updates",
      updateChecking: "Checking for updates...", upToDate: "Everything is up to date!", updateError: "Cannot check for updates",
      ytdlpUpdating: "Updating yt-dlp...", ytdlpSuccess: "yt-dlp updated successfully!", ytdlpError: "Error:"
    },
    fr: {
      file: "Fichier", downloads: "Téléchargements", languageMenu: "Langue", tools: "Outils",
      minimize: "Réduire dans la zone de notification", newSub: "Nouvel Abonnement", import: "Importer", openDir: "Ouvrir le dossier de téléchargements", quit: "Quitter",
      pauseAll: "Mettre tous les téléchargements en pause", resumeAll: "Reprendre tous les téléchargements", restartFailed: "Redémarrer les téléchargements échoués", clearCompleted: "Effacer les téléchargements terminés", clearAll: "Effacer tous les téléchargements", cancelAll: "Annuler tous les téléchargements",
      viewLogs: "Voir les journaux", updateYtdlp: "Mettre à jour yt-dlp", checkUpdates: "Vérifier les mises à jour",
      updateChecking: "Vérification des mises à jour...", upToDate: "Tout est à jour !", updateError: "Impossible de vérifier les mises à jour",
      ytdlpUpdating: "Mise à jour de yt-dlp en cours...", ytdlpSuccess: "yt-dlp mis à jour avec succès !", ytdlpError: "Erreur :"
    },
    es: {
      file: "Archivo", downloads: "Descargas", languageMenu: "Idioma", tools: "Herramientas",
      minimize: "Minimizar a la bandeja", newSub: "Nueva suscripción", import: "Importar", openDir: "Abrir carpeta de descargas", quit: "Salir",
      pauseAll: "Pausar todas las descargas", resumeAll: "Reanudar todas las descargas", restartFailed: "Reiniciar descargas fallidas", clearCompleted: "Borrar descargas completadas", clearAll: "Borrar todas las descargas", cancelAll: "Cancelar todas las descargas",
      viewLogs: "Ver registros", updateYtdlp: "Actualizar yt-dlp", checkUpdates: "Buscar actualizaciones",
      updateChecking: "Buscando actualizaciones...", upToDate: "¡Todo está actualizado!", updateError: "No se pueden buscar actualizaciones",
      ytdlpUpdating: "Actualizando yt-dlp...", ytdlpSuccess: "¡yt-dlp actualizado con éxito!", ytdlpError: "Error:"
    }
  }[language];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
      if (tabSettingsRef.current && !tabSettingsRef.current.contains(event.target as Node)) {
        setShowMainTabSettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    // Update check on launch
    setUpdateStatus(t.updateChecking);
    if (typeof window !== "undefined" && (window as any).electronAPI?.checkUpdates) {
      (window as any).electronAPI.checkUpdates().then((res: any) => {
        setUpdateOk(res.upToDate);
        setUpdateStatus(res.message);
        setTimeout(() => setUpdateStatus(null), 6000);
      }).catch(() => {
        setUpdateOk(null);
        setUpdateStatus(t.updateError);
        setTimeout(() => setUpdateStatus(null), 4000);
      });
    } else {
      setTimeout(() => {
        setUpdateOk(true);
        setUpdateStatus(t.upToDate);
      }, 1200);
      setTimeout(() => setUpdateStatus(null), 5000);
    }

    const onUpdateAvailable = () => {
      setUpdateStatus("Une nouvelle mise à jour d'Orbit est en cours de téléchargement...");
      setUpdateOk(null);
    };

    const onUpdateReady = () => {
      setUpdateStatus("Mise à jour téléchargée et prête !");
      setUpdateOk(true);
      setIsUpdateReady(true);
    };

    window.addEventListener('app-update-available', onUpdateAvailable);
    window.addEventListener('app-update-ready', onUpdateReady);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener('app-update-available', onUpdateAvailable);
      window.removeEventListener('app-update-ready', onUpdateReady);
    };
  }, [language]);

  // Merge any settings already on disk (written by a previous session / the engine).
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.getGlobalSettings) return;
    api.getGlobalSettings().then((remote: any) => {
      if (remote && Object.keys(remote).length) setSettings((prev: any) => ({ ...SETTINGS_DEFAULTS, ...remote, ...prev }));
    }).catch(() => { });
  }, []);

  // --- Keyboard Shortcuts & Theme Manager ---
  useEffect(() => {
    // Theme Manager — apply theme class + accent colour variable.
    const ACCENTS: Record<string, string> = { pink: '#ec4899', purple: '#a855f7', blue: '#3b82f6', green: '#22c55e', orange: '#f97316', cyan: '#22d3ee', red: '#ef4444' };
    document.documentElement.className = '';
    document.documentElement.classList.add(`theme-${settings.theme || 'dark'}`);
    document.documentElement.style.setProperty('--accent', ACCENTS[settings.accentColor] || ACCENTS.pink);

    // Keyboard Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        // Just trigger visual terminal via settings for now
        setShowSettings(true);
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowImportModal(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.theme, settings.accentColor]);

  const handleUpdateYtdlp = async () => {
    setActiveMenu(null);
    setUpdateOk(null);
    setUpdateStatus(t.ytdlpUpdating);
    if (typeof window !== "undefined" && (window as any).electronAPI?.updateYtdlp) {
      const res = await (window as any).electronAPI.updateYtdlp();
      setUpdateOk(res.success);
      setUpdateStatus(res.success ? t.ytdlpSuccess : `${t.ytdlpError} ${res.message}`);
      setTimeout(() => setUpdateStatus(null), 5000);
    }
  };

  const moveMainTab = (index: number, direction: -1 | 1) => {
    const newConfig = [...mainTabConfig];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newConfig.length) {
      const temp = newConfig[index];
      newConfig[index] = newConfig[targetIndex];
      newConfig[targetIndex] = temp;
      setMainTabConfig(newConfig);
    }
  };

  const toggleMainTab = (id: string) => {
    setMainTabConfig(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));
  };

  const dispatchAction = (action: string) => {
    setActiveMenu(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent('download-action', { detail: action }));
    }
  };

  const saveSettings = (newSettings: typeof settings) => {
    setSettings(newSettings);
    // Full object for the renderer …
    try { localStorage.setItem('orbit-settings', JSON.stringify(newSettings)); } catch (e) { }
    // … legacy quick-access keys …
    localStorage.setItem('app-output-dir', newSettings.outputDir || '');
    localStorage.setItem('app-proxy', newSettings.proxy || '');
    localStorage.setItem('app-max-concurrent', String(newSettings.maxConcurrent ?? 3));
    localStorage.setItem('app-theme', newSettings.theme || "dark");
    // … and the file the download/AI engine actually reads.
    (window as any).electronAPI?.saveGlobalSettings?.(newSettings);
  };

  const handleLanguageChange = (lang: 'en' | 'fr' | 'es') => {
    setLanguage(lang);
    localStorage.setItem('app-lang', lang);
    setActiveMenu(null);
  };

  const handleQuit = () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.appQuit();
    }
  };
  const handleOpenDir = async () => {
    setActiveMenu(null);
    if (typeof window !== "undefined" && (window as any).electronAPI?.openHomeDir) {
      await (window as any).electronAPI.openHomeDir();
    }
  };

  const handleMinimize = () => {
    setActiveMenu(null);
    if (typeof window !== "undefined" && (window as any).electronAPI?.minimizeWindow) {
      (window as any).electronAPI.minimizeWindow();
    }
  };

  return (
    <main className="h-screen w-screen space-bg text-gray-300 flex flex-col overflow-hidden font-sans selection:bg-pink-500/30 select-none">
      {/* Custom Title Bar */}
      <div className="h-8 flex items-center justify-between px-3 glass-panel border-b-0 border-white/5 relative z-50" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-4 text-xs font-medium text-gray-400 relative" style={{ WebkitAppRegion: 'no-drag' } as any} ref={menuRef}>
          <div className="flex items-center justify-center w-5 h-5 rounded-md bg-pink-500/20 text-pink-500 mr-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
          </div>

          {/* File Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')} className={`menu-btn transition-colors ${activeMenu === 'file' ? 'text-pink-500' : 'hover:text-gray-200'}`}>{t.file}</button>
            {activeMenu === 'file' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-52 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => { setShowSettings(true); setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '0ms' }}><span className="w-4">⚙</span> Settings</button>
                <button onClick={() => { setShowImportModal(true); setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '15ms' }}><span className="w-4">📥</span> {t.import}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={handleOpenDir} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">📁</span> {t.openDir}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={handleQuit} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 text-red-400 flex items-center gap-2" style={{ animationDelay: '60ms' }}><span className="w-4">✕</span> {t.quit}</button>
              </div>
            )}
          </div>

          {/* Downloads Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'downloads' ? null : 'downloads')} className={`menu-btn transition-colors ${activeMenu === 'downloads' ? 'text-pink-500' : 'hover:text-gray-200'}`}>{t.downloads}</button>
            {activeMenu === 'downloads' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-72 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => dispatchAction('pauseAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '0ms' }}><span className="w-4">⏸</span> {t.pauseAll}</button>
                <button onClick={() => dispatchAction('resumeAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">▶</span> {t.resumeAll}</button>
                <button onClick={() => dispatchAction('restartFailed')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '60ms' }}><span className="w-4">↻</span> {t.restartFailed}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => dispatchAction('clearCompleted')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '90ms' }}><span className="w-4">☐</span> {t.clearCompleted}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => dispatchAction('clearAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2 text-red-400" style={{ animationDelay: '120ms' }}><span className="w-4">🗑</span> {t.clearAll}</button>
                <button onClick={() => dispatchAction('cancelAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2 text-red-400" style={{ animationDelay: '150ms' }}><span className="w-4">⊗</span> {t.cancelAll}</button>
              </div>
            )}
          </div>

          {/* Language Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'language' ? null : 'language')} className={`menu-btn transition-colors ${activeMenu === 'language' ? 'text-pink-500' : 'hover:text-gray-200'}`}>{t.languageMenu}</button>
            {activeMenu === 'language' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-40 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => handleLanguageChange('en')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center justify-between" style={{ animationDelay: '0ms' }}>English {language === 'en' && <span className="text-pink-500">✓</span>}</button>
                <button onClick={() => handleLanguageChange('fr')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center justify-between" style={{ animationDelay: '30ms' }}>Français {language === 'fr' && <span className="text-pink-500">✓</span>}</button>
                <button onClick={() => handleLanguageChange('es')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center justify-between" style={{ animationDelay: '60ms' }}>Español {language === 'es' && <span className="text-pink-500">✓</span>}</button>
              </div>
            )}
          </div>

          {/* Tools Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'tools' ? null : 'tools')} className={`menu-btn transition-colors ${activeMenu === 'tools' ? 'text-pink-500' : 'hover:text-gray-200'}`}>{t.tools}</button>
            {activeMenu === 'tools' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-72 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openHomeDir(); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '0ms' }}><span className="w-4">📁</span> Open Orbit Home Directory</button>
                <button onClick={handleUpdateYtdlp} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">↻</span> Re-install yt-dlp</button>
                <button onClick={() => { setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '60ms' }}><span className="w-4">↻</span> Re-install Node Dependencies</button>
                <button onClick={() => { setActiveMenu(null); (window as any).electronAPI?.checkUpdates?.().then((res: any) => { setUpdateOk(res.upToDate); setUpdateStatus(res.message); setTimeout(() => setUpdateStatus(null), 6000); }); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '90ms' }}><span className="w-4">☼</span> Update yt-dlp With Latest Configurations</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openExternalUrl('https://skeavisuals.com/donate'); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '120ms' }}><span className="w-4">☆</span> Donate to Orbit</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openChangelog(); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '150ms' }}><span className="w-4">🌐</span> View Change Log (local)</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '180ms' }}><span className="w-4">⎘</span> Export/Backup Subscriptions</button>
                <button onClick={() => { setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '210ms' }}><span className="w-4">⎗</span> Import/Restore Subscriptions</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openExternalUrl('https://skeavisuals.com'); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '240ms' }}><span className="w-4">🌐</span> Open Orbit Homepage (web)</button>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openExternalUrl('https://ffmpeg.org/download.html'); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '270ms' }}><span className="w-4">🌐</span> Manually install ffmpeg (web)</button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-gray-500" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button className="hover:text-green-500 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
          <button className="hover:text-gray-200 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg></button>
          <button className="hover:text-gray-200 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
          <div className="w-px h-4 bg-gray-700 mx-1"></div>
          <button onClick={handleMinimize} title="Réduire" className="hover:text-gray-200 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
          <button onClick={() => (window as any).electronAPI?.toggleMaximizeWindow?.()} title="Agrandir / Restaurer" className="hover:text-gray-200 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg></button>
          <button onClick={handleQuit} className="hover:text-red-500 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
      </div>

      {/* Liquid glass loading bar — active while a global task is in progress */}
      <LiquidLoader active={updateOk === null && !!updateStatus} />

      {/* Update Toast */}
      {updateStatus && (
        <div className={`update-toast absolute top-10 right-4 border text-gray-200 px-4 py-2 rounded shadow-lg z-50 flex items-center gap-3 text-sm animate-in max-w-lg ${updateOk === false
            ? 'bg-[#1e1e1e] border-yellow-500/40'
            : updateOk === true
              ? 'bg-[#1e1e1e] border-green-500/30'
              : 'bg-[#1e1e1e] border-pink-500/30'
          }`}>
          {updateOk === null ? (
            <svg className="animate-spin h-4 w-4 text-pink-500 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          ) : updateOk ? (
            <span className="text-green-500 shrink-0">✓</span>
          ) : (
            <span className="text-yellow-400 shrink-0">⚠</span>
          )}
          <span className="truncate">{updateStatus}</span>

          {isUpdateReady && (
            <button
              onClick={() => { if (typeof window !== "undefined") (window as any).electronAPI?.installUpdate?.() || (window as any).require?.('electron').ipcRenderer.invoke('install-update'); }}
              className="ml-2 bg-pink-500 hover:bg-pink-600 text-white text-xs px-3 py-1 rounded transition-colors"
            >
              Installer et Redémarrer
            </button>
          )}

          <button onClick={() => { setUpdateStatus(null); setIsUpdateReady(false); }} className="ml-auto text-gray-500 hover:text-white shrink-0">✕</button>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col z-10 relative">
        {/* Tab bar */}
        <div
          className="flex items-center justify-between px-4 py-2 relative z-10"
          style={{
            background: "rgba(0,0,0,0.25)",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex-1 min-w-0">
            <SegmentedTabs
              tabs={mainTabConfig}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onReorder={setMainTabConfig}
              accentColor="#e879f9"
            />
          </div>

          {/* Tab visibility settings */}
          <div className="relative ml-3 shrink-0" ref={tabSettingsRef}>
            <button
              onClick={() => setShowMainTabSettings(!showMainTabSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:text-gray-300 transition-all hover:bg-white/8 border border-transparent hover:border-white/10"
              title="Gérer les onglets"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              <span>Onglets</span>
            </button>
            <AnimatePresence>
              {showMainTabSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 top-full mt-2 z-50 w-72 flex flex-col gap-1.5 p-3 rounded-2xl origin-top-right"
                  style={{
                    background: "rgba(15,15,25,0.92)",
                    backdropFilter: "blur(24px) saturate(180%)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Onglets — glisser pour réordonner</span>
                  </div>
                  {mainTabConfig.map((tab) => (
                    <div
                      key={tab.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors"
                      style={{
                        background: tab.visible ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span className={`text-sm select-none ${tab.visible ? "text-gray-200" : "text-gray-600"}`}>
                        {tab.label}
                      </span>
                      {/* iOS-style toggle */}
                      <button
                        onClick={() => toggleMainTab(tab.id)}
                        className="relative shrink-0 w-10 h-6 rounded-full transition-all duration-300 focus:outline-none"
                        style={{
                          background: tab.visible
                            ? "linear-gradient(135deg, #e879f9, #a855f7)"
                            : "rgba(255,255,255,0.12)",
                          boxShadow: tab.visible ? "0 0 12px rgba(232,121,249,0.4)" : "none",
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
                  <p className="text-center text-gray-600 text-[10px] mt-1">Glissez-déposez les onglets pour les réordonner</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <div className={activeTab === 'downloads' ? '' : 'hidden'} style={{ height: '100%' }}>
            <DownloadInterface language={language} globalSettings={settings} setGlobalSettings={saveSettings} />
          </div>
          <div className={activeTab === 'converter' ? '' : 'hidden'} style={{ height: '100%' }}>
            <Converter language={language} globalSettings={settings} />
          </div>
          <div className={activeTab === 'interpolator' ? '' : 'hidden'} style={{ height: '100%' }}>
            <AIInterpolator />
          </div>
          <div className={activeTab === 'subscriptions' ? '' : 'hidden'} style={{ height: '100%' }}>
            <Subscriptions />
          </div>
          <div className={activeTab === 'enhance' ? '' : 'hidden'} style={{ height: '100%' }}>
            <OrbitEnhance />
          </div>
          <div className={activeTab === 'library' ? '' : 'hidden'} style={{ height: '100%' }}>
            <MediaLibrary />
          </div>
          <div className={activeTab === 'matting' ? '' : 'hidden'} style={{ height: '100%' }}>
            <MattingStudio />
          </div>
          <div className={activeTab === 'handbrake' ? '' : 'hidden'} style={{ height: '100%' }}>
            <HandBrake />
          </div>
          <div className={activeTab === 'topaz' ? '' : 'hidden'} style={{ height: '100%' }}>
            <TopazVideoAI />
          </div>
          <div className={activeTab === 'transcription' ? '' : 'hidden'} style={{ height: '100%' }}>
            <Transcription />
          </div>
        </div>
      </div>



      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          language={language}
          settings={settings}
          saveSettings={saveSettings}
          handleLanguageChange={handleLanguageChange}
          electronAPI={typeof window !== "undefined" ? (window as any).electronAPI : undefined}
        />
      )}
      {/* Import Modal */}
      {showImportModal && (
        <ImportModal onClose={() => setShowImportModal(false)} language={language} />
      )}

    </main>
  );
}
