import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, FileVideo, FileAudio, Settings, Music, Play, X, Image as ImageIcon, Loader2, CheckCircle2, FolderOpen, FolderInput } from "lucide-react";
import GlassSelect from "./GlassSelect";

type ConvertItem = {
  id: string;
  file: File;
  path: string;
  targetFormat: 'MP4' | 'MP3' | 'WAV' | 'FLAC' | 'COMPRESS_DISCORD' | 'COMPRESS_WHATSAPP' | 'AI_WHISPER' | 'AI_VOCAL_REMOVER' | 'AI_UPSCALER';
  status: 'ready' | 'converting' | 'completed' | 'error';
  progress?: string;
  outputFilePath?: string;
  errorMessage?: string;
  metadata: {
    title: string;
    artist: string;
    album: string;
    year: string;
    coverArtPath: string;
  };
};

const FORMAT_EXT: Record<string, string> = {
  MP4: 'mp4', MP3: 'mp3', WAV: 'wav', FLAC: 'flac',
  COMPRESS_DISCORD: 'mp4', COMPRESS_WHATSAPP: 'mp4',
  AI_WHISPER: 'srt', AI_VOCAL_REMOVER: 'mp3', AI_UPSCALER: 'mp4'
};

const METADATA_FORMATS = ['MP3', 'MP4', 'WAV', 'FLAC'];

export default function Converter({ language, globalSettings }: { language: string, globalSettings: any }) {
  const [items, setItems] = useState<ConvertItem[]>([]);
  const [outputDir, setOutputDir] = useState(globalSettings?.outputDir || "");
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const api = (window as any).electronAPI;
      api.onConvertProgress((data: any) => {
        setItems(prev => prev.map(d => d.id === data.id ? { ...d, progress: data.time } : d));
      });
      api.onConvertComplete((data: any) => {
        setItems(prev => prev.map(d => d.id === data.id ? { ...d, status: 'completed', outputFilePath: data.filePath } : d));
      });
      api.onConvertError((data: any) => {
        setItems(prev => prev.map(d => d.id === data.id ? { ...d, status: 'error', errorMessage: data.error } : d));
      });
    }
  }, []);

  const makeItems = (files: { name: string; path: string; size: number; type: string }[]): ConvertItem[] =>
    files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file: file as any,
      path: file.path,
      targetFormat: 'MP3',
      status: 'ready',
      metadata: {
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: "",
        album: "",
        year: "",
        coverArtPath: ""
      }
    }));

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setItems(prev => [...makeItems(Array.from(e.dataTransfer.files) as any), ...prev]);
    }
  };

  const handleSelectOutputDir = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const dir = await (window as any).electronAPI.selectDirectory();
      if (dir) setOutputDir(dir);
    }
  };

  const handleBrowse = async () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const files = await (window as any).electronAPI.selectFiles();
      if (files?.length) {
        const mapped = files.map((p: string) => ({
          name: p.split(/[\\/]/).pop() ?? p,
          path: p,
          size: 0,
          type: /\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i.test(p) ? 'video/mp4' : 'audio/mpeg'
        }));
        setItems(prev => [...makeItems(mapped), ...prev]);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleSelectCover = async (id: string) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      const imgPath = await (window as any).electronAPI.selectImage();
      if (imgPath) {
        setItems(prev => prev.map(d => d.id === id ? { ...d, metadata: { ...d.metadata, coverArtPath: imgPath } } : d));
      }
    }
  };

  const updateItem = (id: string, updates: Partial<ConvertItem>) => {
    setItems(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const updateMetadata = (id: string, key: string, value: string) => {
    setItems(prev => prev.map(d => d.id === id ? { ...d, metadata: { ...d.metadata, [key]: value } } : d));
  };

  const handleConvert = (item: ConvertItem) => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      updateItem(item.id, { status: 'converting', progress: '00:00:00', errorMessage: undefined });

      let outDir = outputDir;
      if (!outDir) {
        const lastSlash = item.path.lastIndexOf('\\');
        outDir = lastSlash > 0 ? item.path.substring(0, lastSlash) : "C:\\";
      }
      const ext = FORMAT_EXT[item.targetFormat] ?? item.targetFormat.toLowerCase();
      const safeTitle = item.metadata.title.replace(/[<>:"/\\|?*]+/g, '_');
      const outputPath = `${outDir}\\${safeTitle}.${ext}`;

      (window as any).electronAPI.convertFile({
        id: item.id,
        inputPath: item.path,
        outputPath: outputPath,
        targetFormat: item.targetFormat,
        metadata: item.metadata
      });
    }
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(d => d.id !== id));

  return (
    <div className="p-6 h-full flex flex-col gap-6 bg-transparent">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
          <Settings className="w-5 h-5 text-pink-500" /> Convertisseur & Orbit AI Studio
        </h2>
        <button onClick={() => setItems([])} className="text-xs text-red-400 hover:text-red-300 transition-colors">Tout effacer</button>
      </div>

      {/* Output Directory Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSelectOutputDir}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(12px)",
          }}
        >
          <FolderInput className="w-4 h-4 text-pink-400" />
          Dossier de sortie
        </button>
        <div
          className="flex-1 px-3 py-2 rounded-xl text-xs text-gray-400 truncate"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          title={outputDir || "Même dossier que le fichier source"}
        >
          {outputDir || <span className="italic text-gray-600">Même dossier que le fichier source</span>}
        </div>
        {outputDir && (
          <button
            onClick={() => setOutputDir("")}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors shrink-0"
            title="Réinitialiser"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden group ${isDragging ? 'scale-[1.02]' : ''}`}
        style={{
          background: isDragging ? "rgba(236,72,153,0.1)" : "rgba(255,255,255,0.03)",
          border: isDragging ? "2px dashed rgba(236,72,153,0.6)" : "2px dashed rgba(255,255,255,0.15)",
          backdropFilter: "blur(20px)",
          boxShadow: isDragging ? "0 0 40px rgba(236,72,153,0.2) inset, 0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-pink-400' : 'text-gray-400 group-hover:text-gray-300'}`} />
        <p className="text-base text-gray-200 font-semibold relative z-10">Glissez-déposez vos fichiers multimédias ici</p>
        <p className="text-sm text-gray-500 mt-2 relative z-10">Vidéos (MP4, MKV, AVI) ou Musiques (MP3, FLAC, WAV)</p>
        <button
          onClick={handleBrowse}
          className="mt-4 relative z-10 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(12px)",
          }}
        >
          <FolderOpen className="w-4 h-4" />
          Parcourir les fichiers
        </button>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-4 pb-10">
        <AnimatePresence>
          {items.map(item => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-xl border flex flex-col gap-4 ${item.status === 'completed' ? 'border-green-500/30 glass-panel shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]' : item.status === 'error' ? 'border-red-500/30 glass-panel shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]' : 'glass-panel hover:bg-white/5 transition-all hover:scale-[1.01]'}`}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-10 h-10 rounded bg-black/40 flex items-center justify-center shrink-0">
                    {item.file.type.startsWith('video') ? <FileVideo className="w-5 h-5 text-blue-400" /> : <FileAudio className="w-5 h-5 text-pink-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-200 text-sm truncate">{item.file.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                      {item.file.size > 0 && <span>{(item.file.size / 1024 / 1024).toFixed(2)} MB</span>}
                      {item.status === 'converting' && <span className="text-pink-400 font-medium">Traitement: {item.progress}</span>}
                      {item.status === 'completed' && <span className="text-green-500 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3"/> Terminé</span>}
                      {item.status === 'error' && (
                        <span className="text-red-400 font-medium" title={item.errorMessage}>
                          Erreur{item.errorMessage ? ` — ${item.errorMessage.substring(0, 80)}` : ''}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <GlassSelect
                    value={item.targetFormat}
                    onChange={(v) => updateItem(item.id, { targetFormat: v as any })}
                    disabled={item.status === 'converting'}
                    className="w-56 py-1.5 text-xs"
                    ariaLabel="Format de conversion"
                    options={[
                      { value: 'MP4', label: 'Convertir en MP4', group: 'Conversion' },
                      { value: 'MP3', label: 'Convertir en MP3', group: 'Conversion' },
                      { value: 'WAV', label: 'Convertir en WAV', group: 'Conversion' },
                      { value: 'FLAC', label: 'Convertir en FLAC', group: 'Conversion' },
                      { value: 'COMPRESS_DISCORD', label: 'Smart Compressor (Discord 25MB)', group: 'Orbit AI Studio' },
                      { value: 'COMPRESS_WHATSAPP', label: 'Smart Compressor (WhatsApp 16MB)', group: 'Orbit AI Studio' },
                      { value: 'AI_WHISPER', label: 'AI Whisper (Générer Sous-titres FR)', group: 'Orbit AI Studio' },
                      { value: 'AI_VOCAL_REMOVER', label: 'AI Vocal Remover (Isoler Voix)', group: 'Orbit AI Studio' },
                      { value: 'AI_UPSCALER', label: 'AI Upscaler & 60FPS (RIFE)', group: 'Orbit AI Studio' },
                    ]}
                  />

                  {item.status === 'ready' ? (
                    <button
                      onClick={() => handleConvert(item)}
                      className="group relative px-4 py-1.5 rounded-xl text-sm font-bold text-white shadow-lg overflow-hidden transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: "linear-gradient(135deg, rgba(236,72,153,0.8), rgba(168,85,247,0.8))",
                        boxShadow: "0 4px 15px rgba(236,72,153,0.4), 0 1px 0 rgba(255,255,255,0.3) inset",
                        border: "1px solid rgba(255,255,255,0.2)",
                        backdropFilter: "blur(12px)",
                      }}
                    >
                      <span className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                      <Play className="w-4 h-4 fill-current relative z-10" />
                    </button>
                  ) : item.status === 'converting' ? (
                    <div className="p-1.5 text-pink-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  ) : null}

                  <button onClick={() => removeItem(item.id)} className="p-1.5 border border-white/10 rounded text-gray-400 hover:text-red-500 hover:border-red-500/30 transition-colors ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ID3 Tag Editor — only for formats that support metadata */}
              {item.status === 'ready' && METADATA_FORMATS.includes(item.targetFormat) && (
                <div className="pt-3 border-t border-white/5 flex gap-4">
                  {/* Cover Art Box */}
                  <div
                    onClick={() => handleSelectCover(item.id)}
                    className="w-24 h-24 shrink-0 rounded-lg border border-dashed border-white/20 bg-black/40 hover:bg-white/5 hover:border-pink-500/50 cursor-pointer flex flex-col items-center justify-center transition-colors relative overflow-hidden group"
                  >
                    {item.metadata.coverArtPath ? (
                      <img src={`file://${item.metadata.coverArtPath}`} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <ImageIcon className="w-6 h-6 text-gray-500 mb-1 group-hover:text-pink-400 transition-colors" />
                        <span className="text-[9px] text-gray-500 font-medium">Image</span>
                      </>
                    )}
                  </div>

                  {/* Text Inputs */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Titre</label>
                      <input
                        type="text"
                        value={item.metadata.title}
                        onChange={(e) => updateMetadata(item.id, 'title', e.target.value)}
                        className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs text-gray-300 focus:border-pink-500 outline-none w-full transition-colors"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Artiste</label>
                      <input
                        type="text"
                        value={item.metadata.artist}
                        onChange={(e) => updateMetadata(item.id, 'artist', e.target.value)}
                        placeholder="Inconnu"
                        className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs text-gray-300 focus:border-pink-500 outline-none w-full transition-colors"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Album</label>
                      <input
                        type="text"
                        value={item.metadata.album}
                        onChange={(e) => updateMetadata(item.id, 'album', e.target.value)}
                        placeholder="Inconnu"
                        className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs text-gray-300 focus:border-pink-500 outline-none w-full transition-colors"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-gray-500 uppercase font-semibold">Année</label>
                      <input
                        type="text"
                        value={item.metadata.year}
                        onChange={(e) => updateMetadata(item.id, 'year', e.target.value)}
                        placeholder="2026"
                        className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs text-gray-300 focus:border-pink-500 outline-none w-full transition-colors"
                      />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
