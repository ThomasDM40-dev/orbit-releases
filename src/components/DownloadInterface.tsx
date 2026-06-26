"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Download, Video, CheckCircle2, ClipboardX, Crop, Cloud, MoreHorizontal, Subtitles, Cookie, Trash, LayoutGrid, List, Rss, TerminalSquare, Filter, Folder, Heart, Gift, File, Play, X, Pause, Clock, Globe } from "lucide-react";
import OrbitPlayer from "./OrbitPlayer";
import LogPanel from "./LogPanel";
import SnifferBrowser from "./SnifferBrowser";
import GlassSelect, { GlassOption } from "./GlassSelect";
import { t as tr, type Lang } from "@/i18n";

// Build a safe media:// URL. The path goes in the URL *path* component
// (media:///C%3A/Users/...), never the host — otherwise Chromium normalizes the
// host and playback fails intermittently for names with caps/spaces/accents.
const toMediaUrl = (filePath: string) =>
  'media:///' + filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

type DownloadItem = {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  platform: string;
  format: "BEST" | "MP4" | "MP3" | "FLAC" | "WAV";
  status: "analyzing" | "ready" | "queued" | "scheduled" | "downloading" | "completed" | "error";
  progress?: number;
  speed?: string;
  eta?: string;
  filesize?: string;
  outputDir?: string;
  filePath?: string;
  trimStart?: string;
  trimEnd?: string;
  cookies?: string;
  referer?: string;
  videoTitle?: string;
  showAdvanced?: boolean;
  scheduledTime?: string;
};

type DownloadInterfaceProps = {
  language?: Lang;
  globalSettings?: any;
  setGlobalSettings?: any;
};

export default function DownloadInterface({ globalSettings, setGlobalSettings }: DownloadInterfaceProps) {
  // Labels resolved through the global i18n (French source strings as keys).
  const t = {
    placeholder: tr("Collez une URL et appuyez sur Entrée pour la mettre en réserve !"),
    analyzing: tr("Analyse en cours..."),
    untitled: tr("Vidéo sans titre"),
    demo: tr("Vidéo Démo"),
    unknown: tr("Inconnu"),
    audioOnlyTitle: tr("Télécharger l'audio uniquement ?"),
    audioOnlyDesc: tr("Si cette option est activée, vos sélections de format seront basées sur l'audio et l'audio sera extrait"),
    formatTitle: tr("Format de téléchargement"),
    formatDesc: tr("Le format dans lequel télécharger la vidéo"),
    audioFormats: { MP3: "MP3 (Audio)", FLAC: tr("FLAC (Audio sans perte)"), WAV: tr("WAV (Audio sans perte)"), M4A: tr("M4A (Audio Apple)"), OGG: tr("OGG (Audio Vorbis)"), ALAC: "ALAC (Apple Lossless)" },
    videoFormats: { BEST: tr("Vidéo et Audio de la plus haute qualité"), "8K": tr("Vidéo 8K (4320p)"), "4K": tr("Vidéo 4K (2160p)"), "2K": tr("Vidéo 2K (1440p)"), "1080p": tr("Vidéo HD (1080p)"), "720p": tr("Vidéo HD (720p)"), "480p": tr("Vidéo SD (480p)"), "360p": tr("Vidéo SD (360p)"), "144p": tr("Vidéo Basse (144p)"), MP4: tr("MP4 (Vidéo Standard)"), WEBM: "WEBM (VP9/AV1)" },
    donate: tr("Cliquez pour faire un don !"),
    version: "Version de Orbit 1.0.0",
    changelog: tr("Ouvrir le journal des modifications"),
    done: tr("Terminé"),
    error: tr("Erreur"),
  };

  const [url, setUrl] = useState("");
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [globalFormat, setGlobalFormat] = useState<"BEST" | "8K" | "4K" | "2K" | "1080p" | "720p" | "480p" | "360p" | "144p" | "MP4" | "WEBM" | "MP3" | "FLAC" | "WAV" | "M4A" | "OGG" | "ALAC">("BEST");
  const [embedSubtitles, setEmbedSubtitles] = useState(false);
  const [embedThumbnail, setEmbedThumbnail] = useState(false);
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [useBrowserCookies, setUseBrowserCookies] = useState(false);
  const [showFormatPopover, setShowFormatPopover] = useState(false);
  const [outputDir, setOutputDir] = useState(globalSettings?.outputDir || "");
  const [viewLayout, setViewLayout] = useState<'list'|'grid'|'terminal'>('list');
  const [sortOrder, setSortOrder] = useState<'newest'|'name'|'size'>('newest');
  const [playingMedia, setPlayingMedia] = useState<{url: string, title: string, filePath: string} | null>(null);
  const [snifferOpen, setSnifferOpen] = useState<false | string>(false);

  // Build dropdown options from the localized format labels.
  const videoFmtOpts: GlassOption[] = [
    { value: 'BEST', label: t.videoFormats.BEST, group: tr('Vidéo') },
    { value: '8K', label: t.videoFormats["8K"], group: tr('Vidéo') },
    { value: '4K', label: t.videoFormats["4K"], group: tr('Vidéo') },
    { value: '2K', label: t.videoFormats["2K"], group: tr('Vidéo') },
    { value: '1080p', label: t.videoFormats["1080p"], group: tr('Vidéo') },
    { value: '720p', label: t.videoFormats["720p"], group: tr('Vidéo') },
    { value: '480p', label: t.videoFormats["480p"], group: tr('Vidéo') },
    { value: '360p', label: t.videoFormats["360p"], group: tr('Vidéo') },
    { value: '144p', label: t.videoFormats["144p"], group: tr('Vidéo') },
    { value: 'MP4', label: t.videoFormats.MP4, group: tr('Vidéo') },
    { value: 'WEBM', label: t.videoFormats.WEBM, group: tr('Vidéo') },
  ];
  const audioFmtOpts: GlassOption[] = [
    { value: 'MP3', label: t.audioFormats.MP3, group: tr('Audio') },
    { value: 'FLAC', label: t.audioFormats.FLAC, group: tr('Audio') },
    { value: 'WAV', label: t.audioFormats.WAV, group: tr('Audio') },
    { value: 'M4A', label: t.audioFormats.M4A, group: tr('Audio') },
    { value: 'OGG', label: t.audioFormats.OGG, group: tr('Audio') },
    { value: 'ALAC', label: t.audioFormats.ALAC, group: tr('Audio') },
  ];
  const allFmtOpts: GlassOption[] = [...videoFmtOpts, ...audioFmtOpts];
  const [logPanel, setLogPanel] = useState<{id: string, title: string} | null>(null);
  const downloadLogsRef = React.useRef<Map<string, Array<{line: string, level: string}>>>(new Map());
  const formatPopoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (globalSettings?.outputDir) {
      setOutputDir(globalSettings.outputDir);
    } else if (typeof window !== 'undefined' && (window as any).electronAPI) {
      (window as any).electronAPI.getDefaultDownloads().then((dir: string) => {
        setOutputDir(dir);
      });
    }
  }, [globalSettings]);

  useEffect(() => {
    const handleAction = (e: any) => {
      const action = e.detail;
      if (action === 'clearCompleted') {
        setDownloads(prev => prev.filter(d => d.status !== 'completed'));
      } else if (action === 'clearAll') {
        setDownloads([]);
      } else if (action === 'cancelAll') {
        if (typeof window !== "undefined" && (window as any).electronAPI?.cancelAllDownloads) {
          (window as any).electronAPI.cancelAllDownloads();
        }
        setDownloads(prev => prev.map(d => (d.status === 'downloading' || d.status === 'analyzing' || d.status === 'ready' ? { ...d, status: 'error' } : d)));
      } else if (action === 'pauseAll') {
        // Mock pause
      } else if (action === 'resumeAll') {
        // Mock resume
      } else if (action === 'restartFailed') {
        setDownloads(prev => prev.map(d => (d.status === 'error' ? { ...d, status: 'ready' } : d)));
      }
    };
    const handleImportUrls = (e: any) => {
      // Accept either a bare string[] (ImportModal) or { urls, audioOnly } (AI assistant).
      const detail = e.detail;
      const urls: string[] = Array.isArray(detail) ? detail : (detail?.urls || []);
      const forceAudio: boolean | undefined = Array.isArray(detail) ? undefined : detail?.audioOnly;
      if (urls && urls.length > 0) {
        const processUrl = async (importedUrl: string) => {
          const id = Math.random().toString(36).substr(2, 9);
          const newItem: DownloadItem = {
            id, url: importedUrl, title: t.analyzing || "Analyzing...", thumbnail: "", platform: t.unknown || "Unknown", format: globalFormat as any, status: "analyzing", outputDir: outputDir, progress: 0
          };
          setDownloads(prev => [newItem, ...prev]);
          
          if (typeof window !== "undefined" && (window as any).electronAPI) {
            try {
              // Get metadata first so we have the title and thumbnail
              const res = await (window as any).electronAPI.analyzeUrl(importedUrl);
              if (res.success && res.data) {
                setDownloads(prev => prev.map(d => 
                  d.id === id ? { ...d, title: res.data.title || importedUrl, thumbnail: res.data.thumbnail || "", platform: res.data.extractor_key || t.unknown, status: "downloading" } : d
                ));
              } else {
                setDownloads(prev => prev.map(d => 
                  d.id === id ? { ...d, title: importedUrl, status: "downloading" } : d
                ));
              }
            } catch(e) {
              setDownloads(prev => prev.map(d => 
                d.id === id ? { ...d, title: importedUrl, status: "downloading" } : d
              ));
            }

            // Start download
            (window as any).electronAPI.startDownload({ 
              id, 
              url: importedUrl, 
              format: globalFormat,
              options: {
                outputDir: outputDir,
                audioOnly: forceAudio ?? ['MP3', 'FLAC', 'WAV', 'M4A', 'OGG', 'ALAC'].includes(globalFormat)
              }
            });
          }
        };

        // Process URLs sequentially to avoid crashing yt-dlp with too many concurrent requests
        urls.reduce((promise: Promise<void>, url: string) => {
          return promise.then(() => processUrl(url));
        }, Promise.resolve());
      }
    };
    window.addEventListener('download-action', handleAction);
    window.addEventListener('import-urls', handleImportUrls);
    return () => {
      window.removeEventListener('download-action', handleAction);
      window.removeEventListener('import-urls', handleImportUrls);
    };
  }, [globalFormat, outputDir, t]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      // Ignore clicks inside a GlassSelect dropdown (rendered in a body portal).
      if ((target as HTMLElement)?.closest?.('[role="listbox"]')) return;
      if (formatPopoverRef.current && !formatPopoverRef.current.contains(target)) {
        setShowFormatPopover(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const api = (window as any).electronAPI;
      api.onProgress((data: any) => {
        setDownloads(prev => prev.map(d => d.id === data.id ? { ...d, progress: data.percentage, speed: data.speed, eta: data.eta } : d));
      });
      api.onComplete((data: any) => {
        setDownloads(prev => prev.map(d => d.id === data.id ? { ...d, status: data.success ? "completed" : "error", progress: 100, filePath: data.filePath } : d));
      });
      api.onError((data: any) => {
        setDownloads(prev => prev.map(d => d.id === data.id ? { ...d, status: "error" } : d));
        // Auto-open log panel on error
        setLogPanel({ id: data.id, title: '' });
      });
      // Store logs per download ID for replay
      if (api.onDownloadLog) {
        api.onDownloadLog((data: any) => {
          const logs = downloadLogsRef.current.get(data.id) || [];
          logs.push({ line: data.line, level: data.level || 'info' });
          downloadLogsRef.current.set(data.id, logs);
        });
      }
      const addSniffed = (data: any) => {
        const newId = Math.random().toString(36).substring(7);
        // Let the in-app browser (if open) confirm with a toast — via a window
        // event so we don't add a second IPC listener (the preload cleanup uses
        // removeAllListeners and would nuke this one).
        window.dispatchEvent(new CustomEvent('sniffer-toast', { detail: { title: data.videoTitle || data.title || tr('Flux détecté') } }));
        setDownloads(prev => {
          // Avoid duplicating a stream we already captured.
          if (prev.some(d => d.url === data.url)) return prev;
          return [{
            id: newId,
            url: data.url,         // raw m3u8/mpd URL for yt-dlp
            title: data.videoTitle || data.title || tr('Flux intercepté : {type}', { type: data.type }),
            thumbnail: "",
            platform: "Patreon/Web",
            format: globalFormat,
            status: "ready",
            cookies: data.cookies,
            referer: data.referer || data.pageUrl || "",
            videoTitle: data.videoTitle || ""
          }, ...prev];
        });
      };
      api.onSnifferCaughtVideo(addSniffed);
      // The in-app browser's "Analyser" button adds via this window event.
      const onSnifferAdd = (e: any) => addSniffed(e.detail || {});
      window.addEventListener('sniffer-add', onSnifferAdd);
      return () => window.removeEventListener('sniffer-add', onSnifferAdd);
    }
  }, [globalFormat]);

  // Scheduler Loop
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const currentHHMM = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      
      setDownloads(prev => {
        let changed = false;
        prev.forEach(d => {
          if (d.status === 'scheduled' && d.scheduledTime === currentHHMM) {
            changed = true;
            if (typeof window !== "undefined" && (window as any).electronAPI) {
              (window as any).electronAPI.startDownload({ 
                id: d.id, 
                url: d.url, 
                format: d.format,
                options: { 
                  embedSubtitles, embedThumbnail, isPlaylist, 
                  outputDir: d.outputDir || outputDir, 
                  audioOnly: ['MP3', 'FLAC', 'WAV', 'M4A', 'OGG', 'ALAC'].includes(d.format),
                  trimStart: d.trimStart,
                  trimEnd: d.trimEnd
                }
              });
            }
          }
        });
        
        if (changed) {
          return prev.map(d => (d.status === 'scheduled' && d.scheduledTime === currentHHMM) ? { ...d, status: 'downloading' } : d);
        }
        return prev;
      });
    }, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [embedSubtitles, embedThumbnail, isPlaylist, outputDir]);

  const clearCompleted = () => {
    setDownloads(prev => prev.filter(d => d.status !== "completed"));
  };

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url) return;

    const id = Math.random().toString(36).substr(2, 9);
    const newItem: DownloadItem = {
      id, url, title: t.analyzing, thumbnail: "", platform: t.unknown, format: globalFormat as any, status: "analyzing", outputDir: outputDir
    };

    setDownloads(prev => [newItem, ...prev]);
    setUrl("");

    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const res = await (window as any).electronAPI.analyzeUrl(url);
      if (res.success && res.data) {
        const size = res.data.filesize || res.data.filesize_approx;
        const sizeStr = size ? (size / 1024 / 1024).toFixed(2) + " MB" : "";
        setDownloads(prev => prev.map(d => 
          d.id === id ? { ...d, title: res.data.title || t.untitled, thumbnail: res.data.thumbnail || "", platform: res.data.extractor_key || t.unknown, filesize: sizeStr, status: "ready" } : d
        ));
      } else {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: "error", title: t.error } : d));
      }
    } else {
      setTimeout(() => {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, title: t.demo, status: "ready" } : d));
      }, 1500);
    }
  };

  const handleStart = (id: string, url: string, format: "BEST" | "MP4" | "WEBM" | "MP3" | "FLAC" | "WAV" | "8K" | "4K" | "2K" | "1080p" | "720p" | "480p" | "360p" | "144p" | "M4A" | "OGG" | "ALAC", currentOutputDir?: string, trimStart?: string, trimEnd?: string, cookies?: string, referer?: string, videoTitle?: string) => {
    setDownloads(prev => prev.map(item => item.id === id ? { ...item, status: "downloading" as const } : item));
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.startDownload({ 
        id, 
        url, 
        format,
        options: { 
          embedSubtitles, embedThumbnail, isPlaylist, 
          outputDir: currentOutputDir || outputDir, 
          audioOnly: ['MP3', 'FLAC', 'WAV', 'M4A', 'OGG', 'ALAC'].includes(format),
          proxy: globalSettings?.proxy || undefined,
          limitRate: globalSettings?.limitRate,
          forceIPv4: globalSettings?.forceIPv4,
          forceIPv6: globalSettings?.forceIPv6,
          keepVideo: globalSettings?.keepVideo,
          recodeVideo: globalSettings?.recodeVideo,
          embedMetadata: globalSettings?.embedMetadata,
          embedSubs: globalSettings?.embedSubs,
          removeSponsors: globalSettings?.removeSponsors,
          sponsorChapters: globalSettings?.sponsorChapters,
          trimStart,
          trimEnd,
          cookies,
          referer,
          videoTitle,
          cookiesFromBrowser: useBrowserCookies ? 'chrome' : undefined
        }
      });
    }
  };

  const handleCancel = (id: string) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.cancelDownload(id);
    }
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: 'error' } : d));
  };

  const handleDelete = async (id: string, filePath?: string) => {
    if (typeof window !== "undefined" && (window as any).electronAPI && filePath) {
      await (window as any).electronAPI.deleteFile(filePath);
    }
    setDownloads(prev => prev.filter(d => d.id !== id));
  };

  const handleSelectDir = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const dir = await (window as any).electronAPI.selectDirectory();
      if (dir) {
        setOutputDir(dir);
        if (setGlobalSettings && globalSettings) setGlobalSettings({...globalSettings, outputDir: dir});
      }
    }
  };

  const handleItemSelectDir = async (id: string) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const dir = await (window as any).electronAPI.selectDirectory();
      if (dir) setDownloads(prev => prev.map(d => d.id === id ? { ...d, outputDir: dir } : d));
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 bg-transparent text-gray-300">
      {/* Search Bar - Liquid Glass Style */}
      <div className="relative mb-2">
        <form onSubmit={handleAdd} className="flex items-center rounded-2xl p-2 focus-within:ring-2 focus-within:ring-pink-500/20 transition-all relative overflow-hidden group" style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.05) inset",
        }}>
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 to-purple-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
          <div className="text-gray-400 px-3 relative z-10"><ClipboardX className="w-5 h-5 group-focus-within:text-pink-400 transition-colors" /></div>
          <input
            type="url"
            placeholder={t.placeholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-transparent border-none px-2 py-1.5 text-white placeholder-gray-500 focus:outline-none text-sm relative z-10"
          />
          <div className="flex items-center gap-4 text-gray-400 px-3 border-r border-white/10 relative z-10">
            <button type="button" onClick={() => setSnifferOpen('https://www.patreon.com')} className="transition-colors hover:text-white flex items-center gap-1 group/sniffer" title={tr("Ouvrir le navigateur intégré pour intercepter les flux cachés (Patreon, etc.)")}>
              <Globe className="w-4 h-4 text-pink-400 group-hover/sniffer:drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
              <span className="text-[10px] uppercase font-bold text-pink-400 opacity-80 group-hover/sniffer:opacity-100">Sniffer</span>
            </button>
            <div className="w-px h-4 bg-white/10 mx-1"></div>
            <button type="button" onClick={() => setEmbedThumbnail(!embedThumbnail)} className={`transition-colors ${embedThumbnail ? 'text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'hover:text-white'}`} title={tr("Intégrer la miniature")}><Crop className="w-4 h-4" /></button>
            <button type="button" onClick={() => setIsPlaylist(!isPlaylist)} className={`transition-colors ${isPlaylist ? 'text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'hover:text-white'}`} title={tr("Télécharger la playlist")}><List className="w-4 h-4" /></button>
            <button type="button" onClick={() => setEmbedSubtitles(!embedSubtitles)} className={`transition-colors ${embedSubtitles ? 'text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'hover:text-white'}`} title={tr("Intégrer les sous-titres")}><Subtitles className="w-4 h-4" /></button>
            <button type="button" onClick={() => setUseBrowserCookies(!useBrowserCookies)} className={`transition-colors ${useBrowserCookies ? 'text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]' : 'hover:text-white'}`} title={tr("Utiliser les cookies du navigateur (Chrome) pour contourner les blocages (Patreon, etc.)")}><Cookie className="w-4 h-4" /></button>
          </div>
          <div className="relative z-10" ref={formatPopoverRef}>
            <button 
              type="button" 
              onClick={() => setShowFormatPopover(!showFormatPopover)}
              className="px-3 text-pink-500 font-semibold text-sm hover:text-pink-400 transition-colors whitespace-nowrap"
            >
              {audioOnly ? globalFormat : (globalFormat === 'BEST' ? tr('Qualité maximale') : globalFormat)}
            </button>
            {showFormatPopover && (
              <div className="absolute top-full right-0 mt-3 w-96 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl p-5 z-50 text-gray-200 cursor-default">
                
                {/* Audio Toggle */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h4 className="font-bold text-white mb-1">{t.audioOnlyTitle}</h4>
                    <p className="text-xs text-gray-400">{t.audioOnlyDesc}</p>
                    {audioOnly && <span className="inline-block mt-2 bg-pink-500/20 text-pink-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-pink-500/30">--EXTRACT-AUDIO</span>}
                  </div>
                  <button 
                    type="button"
                    onClick={() => setAudioOnly(!audioOnly)}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${audioOnly ? 'bg-pink-500' : 'bg-gray-600'}`}
                  >
                    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${audioOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="border-t border-white/5 my-4"></div>

                {/* Format Select */}
                <div className="mb-2">
                  <h4 className="font-bold text-white mb-1">{t.formatTitle}</h4>
                  <p className="text-xs text-gray-400 mb-3">{t.formatDesc}</p>
                  
                  <GlassSelect
                    value={globalFormat}
                    onChange={(v) => setGlobalFormat(v as any)}
                    options={(audioOnly ? audioFmtOpts : videoFmtOpts).map(o => ({ ...o, group: undefined }))}
                    className="w-full py-2.5"
                    ariaLabel={tr("Format de téléchargement")}
                  />
                  <span className="inline-block mt-3 bg-pink-500/20 text-pink-500 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-pink-500/30">--FORMAT</span>
                </div>
              </div>
            )}
          </div>
          <button type="button" onClick={() => handleAdd()} className="text-pink-500 px-2 hover:text-pink-400 transition-colors">
            <Download className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Secondary Toolbar */}
      <div className="flex items-center justify-between mb-8 text-gray-400 border-b border-white/5 pb-2 mt-2">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
            {([['grid', LayoutGrid], ['list', List], ['terminal', TerminalSquare]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewLayout(mode)}
                className={`p-1.5 rounded-lg transition-all ${viewLayout === mode ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                style={viewLayout === mode ? { background: 'linear-gradient(135deg, var(--accent-strong), var(--accent-2))', boxShadow: '0 2px 10px -2px var(--accent-glow)' } : undefined}
              ><Icon className="w-4 h-4" /></button>
            ))}
          </div>
          <button onClick={clearCompleted} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-all" title={tr("Effacer les terminés")}><Trash className="w-4 h-4" /> {tr("Effacer")}</button>
        </div>
        <div className="flex items-center gap-3">
          <GlassSelect
            value={sortOrder}
            onChange={(v) => setSortOrder(v as any)}
            options={[
              { value: 'newest', label: tr('Date (récent)') },
              { value: 'name', label: tr('Nom (A-Z)') },
              { value: 'size', label: tr('Taille (grand)') },
            ]}
            className="w-40 py-1.5 text-xs"
            ariaLabel={tr("Trier")}
          />
          <button onClick={handleSelectDir} className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-all truncate max-w-[200px] hover:brightness-110" style={{ color: 'var(--accent-strong)', border: '1px solid var(--accent-border)', background: 'var(--accent-soft)' }}>
            <Folder className="w-3 h-3 flex-shrink-0" />
            {outputDir}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative">
        {downloads.length === 0 ? (
          <div className="flex flex-col items-center text-center animate-in fade-in duration-1000">
            <div className="w-56 h-56 mb-8 relative drop-shadow-[0_0_35px_rgba(236,72,153,0.4)] hover:scale-105 transition-transform duration-700">
              <img src="/orbit.png" alt="Orbit Space" className="w-full h-full object-contain mix-blend-screen animate-[spin_60s_linear_infinite]" />
            </div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500 mb-2">{tr("Bienvenue dans Orbit")}</h2>
            <p className="text-gray-400 max-w-md">{tr("Saisissez l'URL d'une vidéo ou d'une playlist ci-dessus pour lancer votre trajectoire de téléchargement orbital.")}</p>
          </div>
        ) : (
          <div className={`w-full h-full overflow-y-auto pb-10 ${
            viewLayout === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-4 place-content-start' : 'space-y-2'
          }`}>
            <AnimatePresence>
              {[...downloads].sort((a, b) => {
                if (sortOrder === 'name') return a.title.localeCompare(b.title);
                if (sortOrder === 'size') {
                  const sizeA = a.filesize ? parseFloat(a.filesize) : 0;
                  const sizeB = b.filesize ? parseFloat(b.filesize) : 0;
                  return sizeB - sizeA;
                }
                return 0; // newest is default array order
              }).map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`${
                    viewLayout === 'terminal' 
                      ? 'bg-black border border-green-500/30 p-2 font-mono text-[10px] text-green-500'
                      : viewLayout === 'grid'
                        ? 'glass-panel hover:bg-white/5 rounded-lg p-3 flex flex-col items-center gap-3 relative overflow-hidden group text-center transition-all hover:scale-[1.01]'
                        : 'glass-panel hover:bg-white/5 rounded-lg p-3 flex items-center gap-4 relative overflow-hidden group transition-all hover:scale-[1.01]'
                  }`}
                >
                  {item.status === "downloading" && (
                    <div className="absolute inset-0 bg-pink-500/10 transition-all duration-300" style={{ width: `${item.progress || 0}%` }} />
                  )}
                  {viewLayout !== 'terminal' && (
                    <div className={`bg-black rounded overflow-hidden relative z-10 ${viewLayout === 'grid' ? 'w-full aspect-video' : 'w-16 h-12'}`}>
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/orbit.png'; e.currentTarget.className = 'w-full h-full object-contain p-2 opacity-30'; }} />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                          <Video className="w-8 h-8 text-white/20" />
                        </div>
                      )}
                    </div>
                  )}
                  <div className={`flex-1 min-w-0 relative z-10 ${viewLayout === 'grid' ? 'w-full' : ''}`}>
                    <h3 className={`font-medium truncate ${viewLayout === 'terminal' ? 'text-green-400' : 'text-gray-200 text-sm'}`}>{item.title}</h3>
                    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 ${viewLayout === 'terminal' ? 'text-[9px] text-green-600' : 'text-xs text-gray-500'} ${viewLayout === 'grid' ? 'justify-center' : ''}`}>
                      <span className="capitalize">{item.platform}</span>
                      {item.filesize && <span>{item.filesize}</span>}
                      {item.status === "downloading" && <span className={`${viewLayout === 'terminal' ? 'text-yellow-500' : 'text-pink-400'} font-medium`}>{item.progress?.toFixed(1)}% • {item.speed} • ETA: {item.eta}</span>}
                      {item.status === "completed" && <span className={`${viewLayout === 'terminal' ? 'text-green-500' : 'text-green-500'} flex items-center gap-1 font-medium`}><CheckCircle2 className="w-3 h-3" /> {t.done}</span>}
                      {item.status === "error" && (
                        <span
                          className={`${viewLayout === 'terminal' ? 'text-red-500' : 'text-red-400'} font-medium flex items-center gap-1 cursor-pointer hover:text-red-300 transition-colors`}
                          onClick={() => setLogPanel({ id: item.id, title: item.title })}
                          title={tr("Voir les logs d'erreur")}
                        >
                          <TerminalSquare className="w-3 h-3" /> {tr("Erreur — Voir logs")}
                        </span>
                      )}
                      {item.status === "analyzing" && <span className={`flex items-center gap-1 ${viewLayout === 'terminal' ? 'text-blue-500' : 'text-blue-400'} font-medium`}><Loader2 className="w-3 h-3 animate-spin"/> {t.analyzing}</span>}
                      {item.status === "queued" && <span className={`flex items-center gap-1 ${viewLayout === 'terminal' ? 'text-yellow-500' : 'text-yellow-500'} font-medium`}><Clock className="w-3 h-3"/> {tr("En attente")}</span>}
                      {item.status === "scheduled" && <span className={`flex items-center gap-1 ${viewLayout === 'terminal' ? 'text-purple-500' : 'text-purple-500'} font-medium`}><Clock className="w-3 h-3"/> {tr("Planifié à {h}", { h: item.scheduledTime || '' })}</span>}
                    </div>
                  </div>
                  <div className={`relative z-10 flex items-center gap-2 ${viewLayout === 'grid' ? 'w-full justify-center mt-2' : ''}`}>
                    {item.status === "ready" && (
                      <>
                        <GlassSelect
                          value={item.format}
                          onChange={(v) => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, format: v as any } : d))}
                          options={allFmtOpts}
                          className="w-36 py-1.5 text-xs"
                          ariaLabel="Format"
                        />
                        
                        <button onClick={() => handleItemSelectDir(item.id)} className={`p-1.5 border border-white/10 rounded hover:bg-white/5 transition-colors group relative ${viewLayout === 'terminal' ? 'text-green-500 border-green-500/30' : 'text-gray-400 hover:text-white'}`} title={item.outputDir || outputDir}>
                          <Folder className="w-4 h-4" />
                        </button>

                        <button 
                          onClick={() => handleStart(item.id, item.url, item.format, item.outputDir, item.trimStart, item.trimEnd, item.cookies, item.referer, item.videoTitle)}
                          className={`group relative p-2 rounded-xl text-white shadow-lg overflow-hidden transition-all hover:scale-105 active:scale-95 ml-1 ${viewLayout === 'terminal' ? 'hidden' : ''}`}
                          style={{
                            background: "linear-gradient(135deg, rgba(236,72,153,0.8), rgba(168,85,247,0.8))",
                            boxShadow: "0 4px 15px rgba(236,72,153,0.4), 0 1px 0 rgba(255,255,255,0.3) inset",
                            border: "1px solid rgba(255,255,255,0.2)",
                            backdropFilter: "blur(12px)",
                          }}
                        >
                          <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                          <Download className="w-4 h-4 relative z-10" />
                        </button>
                        <button onClick={() => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, showAdvanced: !d.showAdvanced } : d))} className={`p-1.5 rounded transition-colors ml-1 border border-white/10 hover:bg-white/10 text-gray-400`} title={tr("Options avancées (Trimmer / Planificateur)")}>
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className={`p-1.5 rounded transition-colors ml-1 border border-white/10 hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/50 text-gray-400`}>
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {(item.status === "queued" || item.status === "scheduled") && (
                      <>
                        <button onClick={() => handleStart(item.id, item.url, item.format, item.outputDir, item.trimStart, item.trimEnd, item.cookies, item.referer, item.videoTitle)} className={`p-1.5 border border-white/10 rounded hover:bg-green-500/20 hover:text-green-500 hover:border-green-500/50 transition-colors flex items-center justify-center text-gray-400`} title={tr("Démarrer maintenant")}>
                          <Play className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'ready' } : d))} className={`p-1.5 border border-white/10 rounded hover:bg-white/5 transition-colors flex items-center justify-center text-gray-400`} title={tr("Annuler la planification")}>
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {item.status === "downloading" && (
                      <>
                        <button onClick={() => handleCancel(item.id)} className={`p-1.5 border border-white/10 rounded hover:bg-yellow-500/20 hover:text-yellow-500 hover:border-yellow-500/50 transition-colors text-gray-400`} title="Pause">
                          <Pause className="w-4 h-4 fill-current" />
                        </button>
                        <button onClick={() => handleCancel(item.id)} className={`p-1.5 border border-white/10 rounded hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/50 transition-colors text-gray-400`} title="Stop">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {(item.status === "completed" || item.status === "error") && (
                      <div className="flex items-center gap-1">
                        {item.status === "completed" && item.filePath && (
                          <button 
                            onClick={() => {
                              if (item.filePath) {
                                setPlayingMedia({
                                  url: toMediaUrl(item.filePath),
                                  title: item.title || "Video",
                                  filePath: item.filePath
                                });
                              }
                            }}
                            className={`p-1.5 border border-white/10 rounded hover:bg-white/5 transition-colors flex items-center justify-center ${viewLayout === 'terminal' ? 'text-green-500 border-green-500/30' : 'text-pink-500 border-pink-500/30 hover:bg-pink-500/10'}`} 
                            title={tr("Lire dans Orbit")}
                          >
                            <Play className="w-4 h-4 fill-current" />
                          </button>
                        )}
                        {item.status === "error" && (
                          <button onClick={() => handleStart(item.id, item.url, item.format, item.outputDir)} className={`p-1.5 border border-white/10 rounded hover:bg-white/5 transition-colors flex items-center justify-center text-gray-400 hover:text-white`} title={tr("Réessayer")}>
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => { if (typeof window !== "undefined" && (window as any).electronAPI) (window as any).electronAPI.showItemInFolder(item.filePath || item.outputDir); }} className={`p-1.5 border border-white/10 rounded hover:bg-white/5 transition-colors ${viewLayout === 'terminal' ? 'text-green-500 border-green-500/30' : 'text-gray-400 hover:text-white'}`} title={tr("Ouvrir le dossier")}>
                          <Folder className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id, item.filePath)} className={`p-1.5 border border-white/10 rounded hover:bg-red-500/20 hover:text-red-500 hover:border-red-500/50 transition-colors flex items-center justify-center text-gray-400`} title={tr("Supprimer")}>
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Trimmer Settings */}
                  {item.status === "ready" && item.showAdvanced && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="w-full mt-1 pt-2 border-t border-white/5 flex flex-wrap gap-2 items-center text-xs relative z-10">
                      <span className="text-gray-400 flex items-center gap-1"><Crop className="w-3 h-3"/> {tr("Trimmer :")}</span>
                      <input
                        type="text"
                        placeholder={tr("Début (ex: 01:20)")}
                        className="bg-black/50 border border-white/10 rounded px-2 py-1 w-28 text-gray-300 focus:border-pink-500 outline-none transition-colors"
                        value={item.trimStart || ''}
                        onChange={(e) => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, trimStart: e.target.value } : d))}
                      />
                      <span className="text-gray-500">-</span>
                      <input 
                        type="text" 
                        placeholder={tr("Fin (ex: 02:45)")}
                        className="bg-black/50 border border-white/10 rounded px-2 py-1 w-28 text-gray-300 focus:border-pink-500 outline-none transition-colors"
                        value={item.trimEnd || ''}
                        onChange={(e) => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, trimEnd: e.target.value } : d))}
                      />
                      <div className="w-px h-4 bg-white/10 mx-2"></div>
                      <span className="text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3"/> {tr("Planifier :")}</span>
                      <input 
                        type="time" 
                        className="bg-black/50 border border-white/10 rounded px-2 py-1 w-24 text-gray-300 focus:border-purple-500 outline-none transition-colors"
                        value={item.scheduledTime || ''}
                        onChange={(e) => setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, scheduledTime: e.target.value } : d))}
                      />
                      <button 
                        onClick={() => {
                          if (item.scheduledTime) {
                            setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'scheduled' } : d));
                          } else {
                            setDownloads(prev => prev.map(d => d.id === item.id ? { ...d, status: 'queued' } : d));
                          }
                        }}
                        className="bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/40 px-3 py-1 rounded transition-colors ml-2"
                      >
                        {item.scheduledTime ? tr("Valider l'heure") : tr("Mettre en attente")}
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {snifferOpen !== false && (
          <SnifferBrowser
            initialUrl={snifferOpen || undefined}
            onClose={() => setSnifferOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playingMedia && (
          <OrbitPlayer
            fileUrl={playingMedia.url}
            filePath={playingMedia.filePath}
            title={playingMedia.title}
            onClose={() => setPlayingMedia(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {logPanel && (
          <LogPanel
            downloadId={logPanel.id}
            title={downloads.find(d => d.id === logPanel.id)?.title || logPanel.title}
            initialLogs={downloadLogsRef.current.get(logPanel.id) || []}
            onClose={() => setLogPanel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
