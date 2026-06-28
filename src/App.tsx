import DownloadInterface from "@/components/DownloadInterface";
import SettingsModal from "@/components/SettingsModal";
import ImportModal from "@/components/ImportModal";
import SegmentedTabs from "@/components/SegmentedTabs";
import UpdatePrompt from "@/components/UpdatePrompt";
import OnboardingModal from "@/components/OnboardingModal";
import { TAB_ICONS } from "@/components/TabIcons";
import LiquidLoader from "@/components/LiquidLoader";
import OrbitSpinner from "@/components/OrbitSpinner";
import AIAssistant from "@/components/AIAssistant";
import TaskCenter from "@/components/TaskCenter";
import PremiumModal from "@/components/PremiumModal";
import PremiumGate from "@/components/PremiumGate";
import { usePremium, PREMIUM_TABS } from "@/premium";
import { Sparkles, UploadCloud, Search } from "lucide-react";
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { t, getLang, setLang, LANGS, type Lang } from "@/i18n";

// Heavy studio tabs are code-split and only loaded the first time their tab is
// opened (see `visited` below). This keeps the initial app launch light.
const Converter = lazy(() => import("@/components/Converter"));
const Subscriptions = lazy(() => import("@/components/Subscriptions"));
const AIInterpolator = lazy(() => import("@/components/AIInterpolator"));
const Transcription = lazy(() => import("@/components/Transcription"));
const TopazVideoAI = lazy(() => import("@/components/TopazVideoAI"));
const OrbitEnhance = lazy(() => import("@/components/OrbitEnhance"));
const ImageGen = lazy(() => import("@/components/ImageGen"));
const InpaintStudio = lazy(() => import("@/components/InpaintStudio"));
const HandBrake = lazy(() => import("@/components/HandBrake"));
const MediaLibrary = lazy(() => import("@/components/MediaLibrary"));
const MattingStudio = lazy(() => import("@/components/MattingStudio"));
const DriveStudio = lazy(() => import("@/components/DriveStudio"));
const Toolbox = lazy(() => import("@/components/Toolbox"));

// Fires only once per real process launch. The whole tree is remounted when the
// language changes (<App key={lang}/>), so without this guard the launch update
// check would re-run on every language switch and flash the "Tout est à jour"
// toast each time.
let launchUpdateCheckDone = false;

export default function App() {
  const defaultMainTabs = [
    { id: 'downloads', label: t('Téléchargements') },
    { id: 'converter', label: t('Convertisseur & Tags') },
    { id: 'toolbox', label: t('Boîte à outils') },
    { id: 'subscriptions', label: t('Abonnements') },
    { id: 'interpolator', label: t('Interpolateur IA') },
    { id: 'library', label: t('Médiathèque') },
    { id: 'enhance', label: t('Amélioration IA') },
    { id: 'imagegen', label: t('Génération IA') },
    { id: 'inpaint', label: t('Gomme magique IA') },
    { id: 'matting', label: t('Détourage IA') },
    { id: 'handbrake', label: t('HandBrake') },
    { id: 'topaz', label: t('Topaz Video AI') },
    { id: 'transcription', label: t('Transcription') },
    { id: 'drive', label: t('Drive Discord') }
  ];

  const [mainTabConfig, setMainTabConfig] = useState<{ id: string; label: string; visible: boolean }[]>(() => {
    const saved = localStorage.getItem('orbit_main_tabs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { id: string; label: string; visible: boolean }[];
        const validIds = new Set(defaultMainTabs.map(t => t.id));
        // Drop tabs that no longer exist (e.g. Crunchyroll, removed); always
        // refresh the label from defaults so updated emojis/names propagate.
        const cleaned = parsed.filter(t => validIds.has(t.id)).map(t => {
          const def = defaultMainTabs.find(d => d.id === t.id);
          return def ? { ...t, label: def.label } : t;
        });
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
  const [showTabSearch, setShowTabSearch] = useState(false);
  const [tabQuery, setTabQuery] = useState('');
  const [tabSearchIndex, setTabSearchIndex] = useState(0);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(mainTabConfig.find(t => t.visible)?.id || 'downloads');
  // Tabs the user has opened at least once → their (lazy) component gets mounted
  // and then stays mounted so its state survives switching tabs.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['downloads', activeTab]));
  useEffect(() => { setVisited(prev => prev.has(activeTab) ? prev : new Set(prev).add(activeTab)); }, [activeTab]);

  // Discord Rich Presence: update on tab change
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.rpcUpdate) api.rpcUpdate({ tab: activeTab });
  }, [activeTab]);

  const [showLogs, setShowLogs] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateOk, setUpdateOk] = useState<boolean | null>(null);
  const [isUpdateReady, setIsUpdateReady] = useState(false);
  const language: Lang = getLang();
  const [showSettings, setShowSettings] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPremium, setShowPremium] = useState(false);
  const { premium } = usePremium();
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('orbit-onboarded'));
  
  // AI Assistant & Drag & Drop State
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFile, setDroppedFile] = useState<string | null>(null);

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
    // Assistant IA — clé API Anthropic de l'utilisateur (jamais codée en dur)
    aiApiKey: '',
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
  const tabSearchRef = useRef<HTMLDivElement>(null);
  const tabSearchInputRef = useRef<HTMLInputElement>(null);
  // Always-fresh refs so the AI dispatch handler (registered once) reads latest state.
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const saveSettingsRef = useRef<((s: any) => void) | null>(null);


  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
      if (tabSettingsRef.current && !tabSettingsRef.current.contains(event.target as Node)) {
        setShowMainTabSettings(false);
      }
      if (tabSearchRef.current && !tabSearchRef.current.contains(event.target as Node)) {
        setShowTabSearch(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    // Update check — only on the real app launch, not on language remounts.
    if (!launchUpdateCheckDone) {
      launchUpdateCheckDone = true;
      setUpdateStatus(t("Vérification des mises à jour..."));
      if (typeof window !== "undefined" && (window as any).electronAPI?.checkUpdates) {
        (window as any).electronAPI.checkUpdates().then((res: any) => {
          setUpdateOk(res.upToDate);
          setUpdateStatus(res.message);
          setTimeout(() => setUpdateStatus(null), 6000);
        }).catch(() => {
          setUpdateOk(null);
          setUpdateStatus(t("Impossible de vérifier les mises à jour"));
          setTimeout(() => setUpdateStatus(null), 4000);
        });
      } else {
        setTimeout(() => {
          setUpdateOk(true);
          setUpdateStatus(t("Tout est à jour !"));
        }, 1200);
        setTimeout(() => setUpdateStatus(null), 5000);
      }
    }

    const onUpdateAvailable = () => {
      setUpdateStatus(t("Une nouvelle mise à jour d'Orbit est en cours de téléchargement..."));
      setUpdateOk(null);
    };

    const onUpdateReady = () => {
      setUpdateStatus(t("Mise à jour téléchargée et prête !"));
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

  // --- Drag & Drop ---
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };
    
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };
    
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const filePath = files[0].path;
        setDroppedFile(filePath);
        setShowAIAssistant(true);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // --- AI Actions Dispatch ---
  useEffect(() => {
    const ALL_IDS = defaultMainTabs.map(t => t.id);
    const handleAIDispatch = (e: Event) => {
      const { actionName, payload = {} } = (e as CustomEvent).detail || {};

      switch (actionName) {
        case 'switchTab': {
          if (payload.tab && ALL_IDS.includes(payload.tab)) {
            setMainTabConfig(prev => prev.map(t => t.id === payload.tab ? { ...t, visible: true } : t));
            setActiveTab(payload.tab);
          }
          break;
        }
        case 'setTabVisible': {
          if (!ALL_IDS.includes(payload.tab)) break;
          setMainTabConfig(prev => {
            const next = prev.map(t => t.id === payload.tab ? { ...t, visible: !!payload.visible } : t);
            if (payload.visible) setActiveTab(payload.tab);
            else setActiveTab(cur => cur === payload.tab ? (next.find(t => t.visible)?.id || 'downloads') : cur);
            return next;
          });
          break;
        }
        case 'disableAllTabs': {
          const keep = ALL_IDS[0];
          setMainTabConfig(prev => prev.map(t => ({ ...t, visible: t.id === keep })));
          setActiveTab(keep);
          break;
        }
        case 'enableAllTabs': {
          setMainTabConfig(prev => prev.map(t => ({ ...t, visible: true })));
          break;
        }
        case 'setSetting': {
          if (payload.key) saveSettingsRef.current?.({ ...settingsRef.current, [payload.key]: payload.value });
          break;
        }
        case 'toggleSetting': {
          if (payload.key) saveSettingsRef.current?.({ ...settingsRef.current, [payload.key]: !settingsRef.current[payload.key] });
          break;
        }
        case 'openSettings': { setShowSettings(true); break; }
        case 'openImport': { setShowImportModal(true); break; }
        case 'downloadUrl': {
          if (!payload.url) break;
          // Show the queue, then hand the URL to the always-mounted downloader,
          // which analyses + starts the download automatically.
          setMainTabConfig(prev => prev.map(t => t.id === 'downloads' ? { ...t, visible: true } : t));
          setActiveTab('downloads');
          window.dispatchEvent(new CustomEvent('import-urls', { detail: { urls: [payload.url], audioOnly: !!payload.audioOnly } }));
          break;
        }
        case 'loadFile': {
          // Tool components can listen for this to receive a file path.
          window.dispatchEvent(new CustomEvent('ai-load-file', { detail: payload }));
          break;
        }
      }
    };

    window.addEventListener('ai-dispatch', handleAIDispatch);
    return () => window.removeEventListener('ai-dispatch', handleAIDispatch);
  }, []);

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
      if (e.ctrlKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowTabSearch(v => !v);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.theme, settings.accentColor]);

  // Allow re-opening the onboarding wizard from Settings.
  useEffect(() => {
    const reopen = () => setShowOnboarding(true);
    window.addEventListener('orbit-onboarding', reopen);
    return () => window.removeEventListener('orbit-onboarding', reopen);
  }, []);

  const handleUpdateYtdlp = async () => {
    setActiveMenu(null);
    setUpdateOk(null);
    setUpdateStatus(t("Mise à jour de yt-dlp en cours..."));
    if (typeof window !== "undefined" && (window as any).electronAPI?.updateYtdlp) {
      const res = await (window as any).electronAPI.updateYtdlp();
      setUpdateOk(res.success);
      setUpdateStatus(res.success ? t("yt-dlp mis à jour avec succès !") : `${t("Erreur :")} ${res.message}`);
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

  // Tab search palette: filter all tabs (visible or not) by label.
  const tabSearchResults = (() => {
    const q = tabQuery.trim().toLowerCase();
    if (!q) return mainTabConfig;
    return mainTabConfig.filter(t => t.label.toLowerCase().includes(q));
  })();

  const openTab = (id: string) => {
    // Reveal the tab if it was hidden, then switch to it.
    setMainTabConfig(prev => prev.map(t => t.id === id ? { ...t, visible: true } : t));
    setActiveTab(id);
    setShowTabSearch(false);
    setTabQuery('');
    setTabSearchIndex(0);
  };

  useEffect(() => { setTabSearchIndex(0); }, [tabQuery]);
  useEffect(() => {
    if (showTabSearch) setTimeout(() => tabSearchInputRef.current?.focus(), 30);
  }, [showTabSearch]);

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
  saveSettingsRef.current = saveSettings;

  const applyOnboarding = (r: { visibleIds: string[]; accent: string; theme: string }) => {
    const ids = r.visibleIds && r.visibleIds.length ? r.visibleIds : mainTabConfig.map(t => t.id);
    setMainTabConfig(prev => prev.map(t => ({ ...t, visible: ids.includes(t.id) })));
    setActiveTab(ids[0] || 'downloads');
    saveSettings({ ...settings, accentColor: r.accent || settings.accentColor, theme: r.theme || settings.theme });
    localStorage.setItem('orbit-onboarded', '1');
    setShowOnboarding(false);
  };

  const handleLanguageChange = (lang: Lang) => {
    setActiveMenu(null);
    setLang(lang); // persists + remounts the tree so every t() re-reads
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

  // Export/import des abonnements (côté renderer : aucune IPC supplémentaire).
  const handleExportSubs = async () => {
    setActiveMenu(null);
    try {
      const subs = await (window as any).electronAPI?.getSubscriptions?.();
      const blob = new Blob([JSON.stringify(subs || [], null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'orbit-abonnements.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { }
  };

  const handleImportSubs = () => {
    setActiveMenu(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed) ? parsed : (parsed?.subscriptions || []);
        for (const s of list) {
          const url = typeof s === 'string' ? s : s?.url;
          if (url) await (window as any).electronAPI?.addSubscription?.(url);
        }
        window.dispatchEvent(new Event('subscriptions-updated'));
      } catch (e) { }
    };
    input.click();
  };

  // Render a code-split tab: kept hidden (not unmounted) once visited so its
  // state survives, and only mounted the first time the tab is opened.
  const renderLazyTab = (id: string, node: any) => {
    const locked = PREMIUM_TABS.has(id) && !premium;
    return (
      <div className={activeTab === id ? 'os-anim-fade' : 'hidden'} style={{ height: '100%' }}>
        {locked ? (
          <PremiumGate onUnlock={() => setShowPremium(true)} />
        ) : visited.has(id) && (
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center"><OrbitSpinner size={34} /></div>}>
            {node}
          </Suspense>
        )}
      </div>
    );
  };

  return (
    <main className="h-screen w-screen space-bg text-gray-300 flex flex-col overflow-hidden font-sans selection:bg-pink-500/30 select-none">
      {/* Custom Title Bar */}
      <div className="h-9 flex items-center justify-between pl-3 pr-2 glass-panel border-b-0 border-white/5 relative z-50" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-4 text-xs font-medium text-gray-400 relative" style={{ WebkitAppRegion: 'no-drag' } as any} ref={menuRef}>
          <div className="flex items-center gap-2 mr-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-md text-white" style={{ background: 'linear-gradient(135deg, var(--accent-strong), var(--accent-2))', boxShadow: '0 0 10px -1px var(--accent-glow), 0 1px 0 rgba(255,255,255,0.25) inset' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <span className="os-text-gradient text-[13px] font-extrabold tracking-tight hidden sm:inline">Orbit</span>
          </div>

          {/* File Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')} className={`menu-btn transition-colors ${activeMenu === 'file' ? 'text-[var(--accent-strong)]' : 'hover:text-gray-200'}`}>{t("Fichier")}</button>
            {activeMenu === 'file' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-52 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => { setShowPremium(true); setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '0ms' }}><span className="w-4">{premium ? '👑' : '✨'}</span> {premium ? t("Premium actif") : t("Passer en Premium")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setShowSettings(true); setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '15ms' }}><span className="w-4">⚙</span> {t("Réglages")}</button>
                <button onClick={() => { setShowImportModal(true); setActiveMenu(null); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">📥</span> {t("Importer")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={handleOpenDir} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">📁</span> {t("Ouvrir le dossier de téléchargements")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={handleQuit} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 text-red-400 flex items-center gap-2" style={{ animationDelay: '60ms' }}><span className="w-4">✕</span> {t("Quitter")}</button>
              </div>
            )}
          </div>

          {/* Downloads Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'downloads' ? null : 'downloads')} className={`menu-btn transition-colors ${activeMenu === 'downloads' ? 'text-[var(--accent-strong)]' : 'hover:text-gray-200'}`}>{t("Téléchargements")}</button>
            {activeMenu === 'downloads' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-72 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => dispatchAction('pauseAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '0ms' }}><span className="w-4">⏸</span> {t("Mettre tous les téléchargements en pause")}</button>
                <button onClick={() => dispatchAction('resumeAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">▶</span> {t("Reprendre tous les téléchargements")}</button>
                <button onClick={() => dispatchAction('restartFailed')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '60ms' }}><span className="w-4">↻</span> {t("Redémarrer les téléchargements échoués")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => dispatchAction('clearCompleted')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '90ms' }}><span className="w-4">☐</span> {t("Effacer les téléchargements terminés")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => dispatchAction('clearAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2 text-red-400" style={{ animationDelay: '120ms' }}><span className="w-4">🗑</span> {t("Effacer tous les téléchargements")}</button>
                <button onClick={() => dispatchAction('cancelAll')} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2 text-red-400" style={{ animationDelay: '150ms' }}><span className="w-4">⊗</span> {t("Annuler tous les téléchargements")}</button>
              </div>
            )}
          </div>

          {/* Language Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'language' ? null : 'language')} className={`menu-btn transition-colors ${activeMenu === 'language' ? 'text-[var(--accent-strong)]' : 'hover:text-gray-200'}`}>{t("Langue")}</button>
            {activeMenu === 'language' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-44 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                {LANGS.map((l, i) => (
                  <button key={l.code} onClick={() => handleLanguageChange(l.code)} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center justify-between gap-2" style={{ animationDelay: `${i * 30}ms` }}>
                    <span className="flex items-center gap-2"><span>{l.flag}</span> {l.label}</span>
                    {language === l.code && <span className="text-pink-500">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tools Menu */}
          <div className="relative">
            <button onClick={() => setActiveMenu(activeMenu === 'tools' ? null : 'tools')} className={`menu-btn transition-colors ${activeMenu === 'tools' ? 'text-[var(--accent-strong)]' : 'hover:text-gray-200'}`}>{t("Outils")}</button>
            {activeMenu === 'tools' && (
              <div className="dropdown-menu absolute top-full left-0 mt-2 w-72 bg-[#1e1e1e] border border-white/10 rounded-md shadow-lg py-1 z-50">
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openHomeDir(); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '0ms' }}><span className="w-4">📁</span> {t("Ouvrir le dossier d'Orbit")}</button>
                <button onClick={handleUpdateYtdlp} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '30ms' }}><span className="w-4">↻</span> {t("Réinstaller yt-dlp")}</button>
                <button onClick={() => { setActiveMenu(null); (window as any).electronAPI?.checkUpdates?.().then((res: any) => { setUpdateOk(res.upToDate); setUpdateStatus(res.message); setTimeout(() => setUpdateStatus(null), 6000); }); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '90ms' }}><span className="w-4">☼</span> {t("Mettre à jour yt-dlp avec les dernières configurations")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openExternalUrl('https://skeavisuals.com/donate'); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '120ms' }}><span className="w-4">☆</span> {t("Faire un don à Orbit")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openChangelog(); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '150ms' }}><span className="w-4">🌐</span> {t("Voir le journal des modifications (local)")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={handleExportSubs} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '180ms' }}><span className="w-4">⎘</span> {t("Exporter/Sauvegarder les abonnements")}</button>
                <button onClick={handleImportSubs} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '210ms' }}><span className="w-4">⎗</span> {t("Importer/Restaurer les abonnements")}</button>
                <div className="border-t border-white/10 my-1"></div>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openExternalUrl('https://skeavisuals.com'); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '240ms' }}><span className="w-4">🌐</span> {t("Ouvrir le site d'Orbit (web)")}</button>
                <button onClick={() => { setActiveMenu(null); if (typeof window !== 'undefined' && (window as any).electronAPI) (window as any).electronAPI.openExternalUrl('https://ffmpeg.org/download.html'); }} className="menu-item w-full text-left px-4 py-2 hover:bg-white/5 flex items-center gap-2" style={{ animationDelay: '270ms' }}><span className="w-4">🌐</span> {t("Installer ffmpeg manuellement (web)")}</button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center text-gray-500" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button onClick={() => setShowSettings(true)} title={t("Réglages")} className="winctl group mr-3 text-gray-400 hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] hover:shadow-[0_0_14px_-2px_var(--accent-glow)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:rotate-90"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
          <div className="winctl-tray">
          <button onClick={handleMinimize} title={t("Réduire")} className="winctl text-gray-400 hover:text-amber-200 hover:bg-amber-400/15 hover:shadow-[0_0_14px_-2px_rgba(251,191,36,0.5)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
          <button onClick={() => (window as any).electronAPI?.toggleMaximizeWindow?.()} title={t("Agrandir / Restaurer")} className="winctl text-gray-400 hover:text-[var(--accent-strong)] hover:bg-[var(--accent-soft)] hover:shadow-[0_0_14px_-2px_var(--accent-glow)]"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3" ry="3"></rect></svg></button>
          <button onClick={handleQuit} title={t("Quitter")} className="winctl text-gray-400 hover:text-white hover:bg-red-500/90 hover:shadow-[0_0_16px_-2px_rgba(239,68,68,0.7)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
          </div>
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
              {t("Installer et Redémarrer")}
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
              icons={TAB_ICONS}
            />
          </div>

          {/* Tab search palette */}
          <div className="relative ml-3 shrink-0" ref={tabSearchRef}>
            <button
              onClick={() => setShowTabSearch(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all border ${showTabSearch ? 'text-pink-300 bg-pink-500/10 border-pink-500/25' : 'text-gray-500 hover:text-gray-300 hover:bg-white/8 border-transparent hover:border-white/10'}`}
              title={t("Rechercher un onglet (Ctrl+K)")}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t("Rechercher")}</span>
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded bg-white/8 border border-white/10 text-[9px] font-semibold text-gray-500">Ctrl K</kbd>
            </button>
            <AnimatePresence>
              {showTabSearch && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 top-full mt-2 z-50 w-80 flex flex-col rounded-2xl origin-top-right overflow-hidden"
                  style={{
                    background: "rgba(15,15,25,0.94)",
                    backdropFilter: "blur(24px) saturate(180%)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
                  }}
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/8">
                    <Search className="w-4 h-4 text-gray-500 shrink-0" />
                    <input
                      ref={tabSearchInputRef}
                      value={tabQuery}
                      onChange={e => setTabQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setTabSearchIndex(i => Math.min(i + 1, tabSearchResults.length - 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setTabSearchIndex(i => Math.max(i - 1, 0)); }
                        else if (e.key === 'Enter') { e.preventDefault(); const r = tabSearchResults[tabSearchIndex]; if (r) openTab(r.id); }
                        else if (e.key === 'Escape') { e.preventDefault(); setShowTabSearch(false); setTabQuery(''); }
                      }}
                      placeholder={t("Rechercher un onglet…")}
                      className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
                    />
                    <button onClick={() => { setShowTabSearch(false); setTabQuery(''); }} className="text-gray-600 hover:text-gray-300 shrink-0 text-xs">✕</button>
                  </div>
                  <div className="max-h-[min(60vh,360px)] overflow-y-auto p-1.5">
                    {tabSearchResults.length === 0 ? (
                      <p className="text-center text-gray-600 text-xs py-6">{t("Aucun onglet trouvé")}</p>
                    ) : tabSearchResults.map((tab, idx) => (
                      <button
                        key={tab.id}
                        onClick={() => openTab(tab.id)}
                        onMouseEnter={() => setTabSearchIndex(idx)}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${idx === tabSearchIndex ? 'bg-pink-500/15 text-white' : 'text-gray-300 hover:bg-white/5'}`}
                      >
                        <span className="shrink-0 w-4 h-4 flex items-center justify-center" style={{ color: idx === tabSearchIndex ? '#e879f9' : undefined }}>{TAB_ICONS[tab.id]}</span>
                        <span className="text-sm flex-1 truncate">{tab.label}</span>
                        {tab.id === activeTab && <span className="text-[10px] text-pink-400 font-semibold shrink-0">{t("actif")}</span>}
                        {!tab.visible && tab.id !== activeTab && <span className="text-[10px] text-gray-600 shrink-0">{t("masqué")}</span>}
                      </button>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-white/8 text-[10px] text-gray-600 flex items-center gap-3">
                    <span>↑↓ {t("naviguer")}</span><span>↵ {t("ouvrir")}</span><span>esc {t("fermer")}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tab visibility settings */}
          <div className="relative ml-2 shrink-0" ref={tabSettingsRef}>
            <button
              onClick={() => setShowMainTabSettings(!showMainTabSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-gray-500 hover:text-gray-300 transition-all hover:bg-white/8 border border-transparent hover:border-white/10"
              title={t("Gérer les onglets")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
              <span>{t("Onglets")}</span>
            </button>
            <AnimatePresence>
              {showMainTabSettings && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute right-0 top-full mt-2 z-50 w-72 flex flex-col gap-1.5 p-3 rounded-2xl origin-top-right max-h-[calc(100vh-90px)] overflow-y-auto"
                  style={{
                    background: "rgba(15,15,25,0.92)",
                    backdropFilter: "blur(24px) saturate(180%)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("Onglets — glisser pour réordonner")}</span>
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
                  <p className="text-center text-gray-600 text-[10px] mt-1">{t("Glissez-déposez les onglets pour les réordonner")}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto relative">
          <div className={activeTab === 'downloads' ? 'os-anim-fade' : 'hidden'} style={{ height: '100%' }}>
            <DownloadInterface language={language} globalSettings={settings} setGlobalSettings={saveSettings} />
          </div>
          {renderLazyTab('converter', <Converter language={language} globalSettings={settings} />)}
          {renderLazyTab('toolbox', <Toolbox />)}
          {renderLazyTab('interpolator', <AIInterpolator />)}
          {renderLazyTab('subscriptions', <Subscriptions />)}
          {renderLazyTab('enhance', <OrbitEnhance />)}
          {renderLazyTab('imagegen', <ImageGen />)}
          {renderLazyTab('inpaint', <InpaintStudio />)}
          {renderLazyTab('library', <MediaLibrary />)}
          {renderLazyTab('matting', <MattingStudio />)}
          {renderLazyTab('handbrake', <HandBrake />)}
          {renderLazyTab('topaz', <TopazVideoAI />)}
          {renderLazyTab('transcription', <Transcription />)}
          {renderLazyTab('drive', <DriveStudio />)}
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

      {/* Premium Modal */}
      {showPremium && <PremiumModal onClose={() => setShowPremium(false)} />}

      {/* First-run onboarding wizard (tailors visible tabs to the user's profile) */}
      {showOnboarding && <OnboardingModal onComplete={applyOnboarding} />}

      {/* Floating AI Button */}
      <button
        data-ai-toggle
        onClick={() => setShowAIAssistant(!showAIAssistant)}
        aria-label={t("Assistant IA")}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-2xl transition-all duration-200 flex items-center justify-center text-white z-40 group hover:scale-105 active:scale-95 ${showMainTabSettings ? 'opacity-0 pointer-events-none scale-90' : ''}`}
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent,#ec4899) 88%, white), var(--accent,#ec4899))',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 10px 30px color-mix(in srgb, var(--accent,#ec4899) 45%, transparent), 0 1px 0 rgba(255,255,255,0.25) inset',
          backdropFilter: 'blur(12px)',
        }}
      >
        <Sparkles className="w-6 h-6 group-hover:scale-110 group-hover:rotate-6 transition-transform" />
      </button>

      {/* Global task center (queue) */}
      <TaskCenter />

      {/* AI Assistant */}
      <AnimatePresence>
        {showAIAssistant && (
          <AIAssistant
            onClose={() => {
              setShowAIAssistant(false);
              setDroppedFile(null);
            }}
            droppedFile={droppedFile}
            activeTab={activeTab}
          />
        )}
      </AnimatePresence>

      {/* Drag & Drop Overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center border-[4px] border-dashed border-pink-500/50 pointer-events-none"
          >
            <div className="bg-pink-500/20 p-8 rounded-full mb-6">
              <UploadCloud className="w-20 h-20 text-pink-500" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">{t("Déposez votre fichier ici")}</h2>
            <p className="text-gray-300 text-lg">{t("Orbit IA l'analysera et vous proposera des outils adaptés")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launch update prompt (Orbit + bundled tools) */}
      <UpdatePrompt />

    </main>
  );
}
