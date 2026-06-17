import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, X, Volume2, VolumeX, Maximize, Minimize, Loader2, AlertTriangle, ExternalLink, Folder, Music } from 'lucide-react';
import { motion } from 'framer-motion';

interface OrbitPlayerProps {
  fileUrl: string;
  title: string;
  onClose: () => void;
  filePath?: string;
}

const AUDIO_EXT = ['mp3', 'flac', 'wav', 'm4a', 'ogg', 'opus', 'aac', 'alac', 'wma'];

const toMediaUrl = (filePath: string) =>
  'media:///' + filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

export default function OrbitPlayer({ fileUrl, title, onClose, filePath }: OrbitPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSrc, setCurrentSrc] = useState(fileUrl);
  const [preparing, setPreparing] = useState(false);
  const [prepProgress, setPrepProgress] = useState(0);
  const triedPrepareRef = useRef(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ext = (filePath || fileUrl).split('.').pop()?.toLowerCase() || '';
  const isAudio = AUDIO_EXT.includes(ext);

  const openInSystemPlayer = () => {
    const api = (window as any).electronAPI;
    if (filePath && api?.openFile) api.openFile(filePath);
  };
  const openFolder = () => {
    const api = (window as any).electronAPI;
    if (filePath && api?.showItemInFolder) api.showItemInFolder(filePath);
  };

  // When the built-in player can't decode the file, transcode/remux it to a
  // browser-friendly MP4 with ffmpeg, then swap the source — so any file plays.
  const preparePlayback = async () => {
    const api = (window as any).electronAPI;
    if (!filePath || !api?.preparePlayback) {
      setError("Ce fichier ne peut pas être lu ici (codec non pris en charge). Ouvre-le dans ton lecteur système.");
      return;
    }
    triedPrepareRef.current = true;
    setPreparing(true);
    setPrepProgress(0);
    setError(null);
    let unsub: (() => void) | undefined;
    if (api.onPlaybackProgress) unsub = api.onPlaybackProgress((v: any) => setPrepProgress(v?.percent || 0));
    try {
      const res = await api.preparePlayback(filePath);
      if (res?.ok && res.path) {
        setCurrentSrc(toMediaUrl(res.path));
        setPreparing(false);
        // Reload with the new compatible source.
        setTimeout(() => { const v = videoRef.current; if (v) { v.load(); v.play().catch(() => {}); } }, 0);
      } else {
        setPreparing(false);
        setError("Impossible de préparer ce fichier pour la lecture intégrée. Ouvre-le dans ton lecteur système.");
      }
    } catch (e) {
      setPreparing(false);
      setError("Impossible de préparer ce fichier pour la lecture intégrée. Ouvre-le dans ton lecteur système.");
    } finally {
      if (unsub) unsub();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen();
        else onClose();
      }
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'ArrowRight' && videoRef.current) videoRef.current.currentTime += 5;
      if (e.key === 'ArrowLeft' && videoRef.current) videoRef.current.currentTime -= 5;
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || error) return;
    if (v.paused) {
      const p = v.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => setError("Lecture impossible — ce format n'est pas pris en charge par le lecteur intégré."));
      }
    } else {
      v.pause();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const p = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(p || 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTo = parseFloat(e.target.value);
    if (videoRef.current && isFinite(videoRef.current.duration)) {
      videoRef.current.currentTime = (videoRef.current.duration / 100) * seekTo;
      setProgress(seekTo);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      if (vol > 0 && isMuted) { setIsMuted(false); videoRef.current.muted = false; }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen(); setIsFullscreen(true); }
    else { document.exitFullscreen(); setIsFullscreen(false); }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="relative w-full max-w-5xl aspect-video bg-[#0a0a0a] rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(236,72,153,0.18)] border border-white/10 group"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowControls(false)}
      >
        <video
          ref={videoRef}
          src={currentSrc}
          className={`w-full h-full object-contain ${isAudio || error || preparing ? 'opacity-0' : ''}`}
          onClick={togglePlay}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadStart={() => { setLoading(true); setError(null); }}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onPlaying={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            // First failure → auto-transcode to a playable MP4. Only show the
            // hard error if even the prepared file fails.
            if (!triedPrepareRef.current) preparePlayback();
            else setError("Ce fichier ne peut pas être lu ici (codec non pris en charge, ex. MKV / H.265). Ouvre-le dans ton lecteur système.");
          }}
          autoPlay
        />

        {/* Audio artwork */}
        {isAudio && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none bg-gradient-to-br from-pink-950/40 to-purple-950/40">
            <div className="w-28 h-28 rounded-full bg-pink-500/15 border border-pink-500/30 flex items-center justify-center">
              <Music className="w-12 h-12 text-pink-400" />
            </div>
            <p className="text-gray-300 text-sm font-medium px-6 text-center truncate max-w-md">{title}</p>
          </div>
        )}

        {/* Preparing (transcoding) overlay */}
        {preparing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-10 text-center bg-[#0a0a0a]">
            <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
            <p className="text-gray-300 text-sm">Préparation de la lecture…</p>
            <div className="w-full max-w-xs h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300" style={{ width: `${prepProgress}%` }} />
            </div>
            <p className="text-[11px] text-gray-500">{prepProgress > 0 ? `${prepProgress}%` : 'Conversion du format pour la lecture intégrée'}</p>
          </div>
        )}

        {/* Loading spinner */}
        {loading && !error && !preparing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center bg-[#0a0a0a]">
            <AlertTriangle className="w-12 h-12 text-amber-400" />
            <p className="text-gray-300 text-sm max-w-md leading-relaxed">{error}</p>
            <div className="flex items-center gap-3 mt-1">
              {filePath && (
                <button onClick={openInSystemPlayer} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.9), rgba(168,85,247,0.9))", boxShadow: "0 4px 15px rgba(236,72,153,0.4)" }}>
                  <ExternalLink className="w-4 h-4" /> Lecteur système
                </button>
              )}
              {filePath && (
                <button onClick={openFolder} className="flex items-center gap-2 px-4 py-2 rounded-xl text-gray-300 text-sm font-medium border border-white/15 hover:bg-white/5 transition-colors">
                  <Folder className="w-4 h-4" /> Dossier
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 flex justify-between items-center ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
          <h3 className="text-white font-medium truncate pr-10 text-sm drop-shadow-md">{title}</h3>
          <button onClick={onClose} className="text-white hover:text-pink-500 transition-colors p-1 bg-black/20 rounded-full hover:bg-black/40"><X className="w-5 h-5" /></button>
        </div>

        {/* Big play button overlay when paused */}
        {!isPlaying && !loading && !error && !preparing && (
          <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center backdrop-blur-sm border border-pink-500/30 transition-transform hover:scale-110">
              <Play className="w-8 h-8 text-pink-500 fill-pink-500 ml-1" />
            </div>
          </button>
        )}

        {/* Controls */}
        {!error && (
        <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${showControls || !isPlaying ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] text-gray-300 font-mono">{formatTime(videoRef.current?.currentTime || 0)}</span>
            <input
              type="range" min="0" max="100" step="0.1"
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-125 transition-all"
            />
            <span className="text-[10px] text-gray-300 font-mono">{formatTime(videoRef.current?.duration || 0)}</span>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button onClick={togglePlay} className="text-white hover:text-pink-500 transition-colors">
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
              </button>

              <div className="flex items-center gap-2 group/vol relative">
                <button onClick={toggleMute} className="text-white hover:text-pink-500 transition-colors">
                  {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolume}
                  className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all duration-300 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              {filePath && (
                <button onClick={openInSystemPlayer} className="text-white hover:text-pink-500 transition-colors" title="Ouvrir dans le lecteur système">
                  <ExternalLink className="w-5 h-5" />
                </button>
              )}
              {!isAudio && (
                <button onClick={toggleFullscreen} className="text-white hover:text-pink-500 transition-colors">
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </motion.div>
  );
}
