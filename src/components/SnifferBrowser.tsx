"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCw, Home, Search, X, Globe, Lock, Download, Loader2 } from "lucide-react";

// <webview> is an Electron custom element, unknown to React's JSX types.
const WebView = "webview" as unknown as React.FC<any>;

interface SnifferBrowserProps {
  initialUrl?: string;
  onClose: () => void;
}

const QUICK_LINKS = [
  { ic: "▶", name: "YouTube", url: "https://www.youtube.com" },
  { ic: "🎮", name: "Twitch", url: "https://www.twitch.tv" },
  { ic: "🎁", name: "Patreon", url: "https://www.patreon.com" },
  { ic: "🎥", name: "Vimeo", url: "https://vimeo.com" },
  { ic: "🎵", name: "TikTok", url: "https://www.tiktok.com" },
  { ic: "📹", name: "Dailymotion", url: "https://www.dailymotion.com" },
  { ic: "📸", name: "Instagram", url: "https://www.instagram.com" },
  { ic: "🐦", name: "X / Twitter", url: "https://x.com" },
];

const cleanTitle = (raw: string) =>
  (raw || "").replace(/\s*[-|–—]\s*(YouTube|Bilibili[^-|]*|Twitch|Vimeo|Dailymotion|TikTok|Crunchyroll|Patreon|SoundCloud|Reddit)\s*$/i, "").trim();

const normalizeUrl = (raw: string) => {
  let url = (raw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//.test(url)) {
    url = url.includes(".") && !url.includes(" ")
      ? "https://" + url
      : "https://www.google.com/search?q=" + encodeURIComponent(url);
  }
  return url;
};

export default function SnifferBrowser({ initialUrl, onClose }: SnifferBrowserProps) {
  const wvRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [addressValue, setAddressValue] = useState("");
  const [webviewSrc, setWebviewSrc] = useState("about:blank");
  const [showHome, setShowHome] = useState(!initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [secure, setSecure] = useState(true);
  const [status, setStatus] = useState("Prêt");
  const [toast, setToast] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const navigate = (raw: string) => {
    const url = normalizeUrl(raw);
    if (!url) { setShowHome(true); return; }
    setShowHome(false);
    setAddressValue(url);
    // Controlled src: changing the attribute navigates the webview.
    setWebviewSrc(url);
  };

  // Reset the main-process dedup set so this session can detect streams afresh.
  useEffect(() => {
    const api = (window as any).electronAPI;
    api?.snifferClearSeen?.();
    if (initialUrl) navigate(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Streams caught by the interceptors are auto-added to the download list by
  // DownloadInterface, which fires this window event so we can confirm it landed
  // in the app (no extra IPC listener — the preload cleanup uses removeAllListeners).
  useEffect(() => {
    const onToast = (e: any) => flashToast(`✓ ${e.detail?.title || "Flux détecté"} — ajouté à Téléchargements`);
    window.addEventListener("sniffer-toast", onToast);
    return () => window.removeEventListener("sniffer-toast", onToast);
  }, []);

  // Wire webview DOM events.
  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return;
    const reportPage = () => {
      try {
        const url = wv.getURL();
        if (!url || url.startsWith("data:") || url === "about:blank") return;
        (window as any).electronAPI?.reportSnifferPage?.({ url, title: cleanTitle(wv.getTitle()) });
      } catch (e) {}
    };
    const syncNav = () => { try { setCanBack(wv.canGoBack()); setCanFwd(wv.canGoForward()); } catch (e) {} };
    const onNav = (e: any) => {
      const url = e.url || "";
      if (url && !url.startsWith("data:")) { setAddressValue(url); setSecure(url.startsWith("https://")); }
      syncNav(); reportPage();
    };
    const onStart = () => { setIsLoading(true); setStatus("Chargement…"); };
    const onStop = () => { setIsLoading(false); syncNav(); reportPage(); try { setStatus(wv.getTitle() || "Prêt"); } catch (e) {} };
    const onTitle = (e: any) => { setStatus(e.title || "Prêt"); reportPage(); };
    const onNewWindow = (e: any) => { if (e.url && !e.url.startsWith("data:")) navigate(e.url); };

    wv.addEventListener("did-navigate", onNav);
    wv.addEventListener("did-navigate-in-page", onNav);
    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-stop-loading", onStop);
    wv.addEventListener("page-title-updated", onTitle);
    wv.addEventListener("new-window", onNewWindow);
    return () => {
      wv.removeEventListener("did-navigate", onNav);
      wv.removeEventListener("did-navigate-in-page", onNav);
      wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-stop-loading", onStop);
      wv.removeEventListener("page-title-updated", onTitle);
      wv.removeEventListener("new-window", onNewWindow);
    };
  }, [showHome]);

  const goBack = () => { try { if (wvRef.current?.canGoBack()) wvRef.current.goBack(); } catch (e) {} };
  const goFwd = () => { try { if (wvRef.current?.canGoForward()) wvRef.current.goForward(); } catch (e) {} };
  const refresh = () => { try { isLoading ? wvRef.current?.stop() : wvRef.current?.reload(); } catch (e) {} };
  const goHome = () => { setShowHome(true); setAddressValue(""); setStatus("Prêt"); };

  const analyzePage = async () => {
    const wv = wvRef.current;
    let url = "";
    try { url = wv?.getURL?.() || ""; } catch (e) {}
    if (!url || url === "about:blank" || url.startsWith("data:")) { flashToast("Navigue d'abord vers une page vidéo"); return; }
    setAnalyzing(true);
    setStatus("Analyse de la page…");
    const info = await (window as any).electronAPI?.analyzeUrl?.(url).catch(() => null);
    setAnalyzing(false);
    if (info && (info.success ? info.data?.title : info.title)) {
      const data = info.success ? info.data : info;
      const title = data.title;
      window.dispatchEvent(new CustomEvent("sniffer-add", { detail: {
        url, title, videoTitle: title, type: data.extractor_key || data.extractor || "yt-dlp", referer: url, pageUrl: url,
      }}));
      // Confirmation toast comes back via the 'sniffer-toast' window event.
      setStatus("✓ " + title);
    } else {
      flashToast("✗ Aucune vidéo téléchargeable ici (Netflix/Amazon = DRM)");
      setStatus("✗ Page non supportée");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        className="relative w-full max-w-6xl h-[88vh] flex flex-col rounded-2xl overflow-hidden border border-white/10 bg-[#060608] shadow-[0_0_60px_rgba(168,85,247,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 h-12 bg-[#0a0a12] border-b border-white/8 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.3))", border: "1px solid rgba(236,72,153,0.25)" }}>
            <Globe className="w-3.5 h-3.5 text-pink-300" />
          </div>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button onClick={goBack} disabled={!canBack} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 enabled:hover:bg-white/8 enabled:hover:text-white disabled:opacity-20 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
          <button onClick={goFwd} disabled={!canFwd} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 enabled:hover:bg-white/8 enabled:hover:text-white disabled:opacity-20 transition-colors"><ArrowRight className="w-4 h-4" /></button>
          <button onClick={refresh} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-white/8 hover:text-white transition-colors">{isLoading ? <X className="w-4 h-4" /> : <RotateCw className="w-4 h-4" />}</button>
          <button onClick={goHome} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-white/8 hover:text-white transition-colors"><Home className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-white/10 mx-1" />

          {/* URL bar */}
          <div className="flex-1 min-w-0 flex items-center gap-2 h-8 px-3 rounded-lg bg-white/5 border border-white/10 focus-within:border-pink-500/50 transition-colors" onClick={() => inputRef.current?.focus()}>
            {secure ? <Lock className="w-3 h-3 text-gray-600 flex-shrink-0" /> : <Globe className="w-3 h-3 text-amber-500 flex-shrink-0" />}
            <input
              ref={inputRef}
              value={addressValue}
              onChange={(e) => setAddressValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") navigate(addressValue); }}
              onFocus={(e) => e.target.select()}
              spellCheck={false}
              placeholder="Entrez une adresse ou recherchez…"
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-700 outline-none"
            />
          </div>

          <button onClick={analyzePage} disabled={analyzing} className="flex-shrink-0 h-8 px-3 rounded-lg text-xs font-semibold text-pink-400 border border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Analyser
          </button>
          <button onClick={onClose} className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Content */}
        <div className="relative flex-1 min-h-0 flex">
          <WebView
            ref={wvRef}
            partition="persist:sniffer"
            allowpopups="true"
            src={webviewSrc}
            style={{ display: showHome ? "none" : "flex", flex: "1 1 0", width: "100%", border: "none" }}
          />

          {showHome && (
            <div className="absolute inset-0 z-[5] flex flex-col items-center gap-7 px-10 py-14 overflow-y-auto" style={{ background: "radial-gradient(1200px 600px at 50% -10%, rgba(168,85,247,0.10), transparent 60%), #060608" }}>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.25), rgba(168,85,247,0.25))", border: "1px solid rgba(236,72,153,0.3)", boxShadow: "0 8px 40px rgba(168,85,247,0.25)" }}>
                  <Globe className="w-8 h-8 text-pink-300" />
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-purple-500">Navigateur Orbit</h1>
                <p className="text-gray-500 text-sm mt-2">Navigue vers une page vidéo — les flux détectés s'ajoutent <strong className="text-pink-400 font-semibold">automatiquement à Téléchargements</strong></p>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("q") as HTMLInputElement)?.value; if (v) navigate(v); }}
                className="flex items-center gap-2 w-full max-w-xl rounded-2xl pl-4 pr-1.5 py-1.5 bg-white/5 border border-white/10 focus-within:border-pink-500/50 transition-colors"
              >
                <Search className="w-4 h-4 text-gray-600 flex-shrink-0" />
                <input name="q" autoFocus spellCheck={false} placeholder="Rechercher sur Google ou saisir une adresse…" className="flex-1 min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-700 outline-none py-1.5" />
                <button type="submit" className="flex-shrink-0 px-5 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, #ec4899, #a855f7)" }}>Aller</button>
              </form>

              <div className="w-full max-w-2xl">
                <div className="text-[11px] font-bold tracking-wider uppercase text-gray-700 mb-2.5">Accès rapides</div>
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                  {QUICK_LINKS.map((l) => (
                    <button key={l.name} onClick={() => navigate(l.url)} className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl bg-white/[0.035] border border-white/8 text-gray-400 hover:bg-white/7 hover:border-pink-500/35 hover:text-gray-100 hover:-translate-y-0.5 transition-all">
                      <span className="text-2xl">{l.ic}</span>
                      <span className="text-xs font-medium">{l.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 h-6 px-3 bg-[#040408] border-t border-white/5 flex-shrink-0">
          {isLoading && <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse flex-shrink-0" />}
          <span className="text-[10px] text-gray-600 truncate">{status}</span>
        </div>

        {/* Toast */}
        {toast && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs text-gray-200 border border-white/10 bg-[#0c0c14]/95 backdrop-blur-xl flex items-center gap-2 shadow-lg z-[20]">
            <Download className="w-3.5 h-3.5 text-pink-400" /> {toast}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
