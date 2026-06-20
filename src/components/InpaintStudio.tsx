import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eraser, Brush, FolderOpen, Download, Undo2, Trash2, Wand2, Loader2,
  AlertCircle, Check, ImagePlus, Maximize2, Plus, Minus, MousePointerClick,
} from 'lucide-react';

const api = () => (window as any).electronAPI;
const mediaUrl = (p: string) => 'media:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');

type Img = { path: string; url: string; w: number; h: number };

export default function InpaintStudio() {
  const electron = api();
  const [img, setImg] = useState<Img | null>(null);
  const [history, setHistory] = useState<Img[]>([]);
  const [brush, setBrush] = useState(40);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'sam'>('brush');
  const erasing = tool === 'eraser';
  const [hasMask, setHasMask] = useState(false);
  const [samPts, setSamPts] = useState<{ x: number; y: number; label: number }[]>([]);
  const samEmbedded = useRef<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ ready: boolean; installed: boolean } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });
  const [outputDir, setOutputDir] = useState('');
  const [prompt, setPrompt] = useState('');

  const overlayRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    (async () => {
      if (!electron) return;
      setEngine(await electron.inpaintDetect?.().catch(() => ({ ready: false, installed: false })));
      const def = await electron.getDefaultDownloads?.().catch(() => '');
      if (def) setOutputDir(def);
    })();
    const off = electron?.onInpaintProgress?.((v: any) => { if (v?.stage) setStage(v.stage); });
    const offSam = electron?.onSamProgress?.((v: any) => { if (v?.stage) setStage(v.stage); });
    return () => { if (typeof off === 'function') off(); if (typeof offSam === 'function') offSam(); };
  }, []);

  // Size the mask canvas to the image's natural resolution.
  const resetMask = useCallback((w: number, h: number) => {
    const c = overlayRef.current; if (!c) return;
    c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (ctx) ctx.clearRect(0, 0, w, h);
    setHasMask(false);
  }, []);

  const loadImage = useCallback((path: string) => {
    const url = mediaUrl(path);
    const probe = new Image();
    probe.onload = () => {
      const im = { path, url, w: probe.naturalWidth, h: probe.naturalHeight };
      setImg(im); setHistory([]); setError(null); setSamPts([]); samEmbedded.current = null;
      requestAnimationFrame(() => resetMask(im.w, im.h));
    };
    probe.onerror = () => setError('Impossible de charger cette image.');
    probe.src = url;
  }, [resetMask]);

  const handleBrowse = async () => { const p = await electron.selectImage?.(); if (p) loadImage(p); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = Array.from(e.dataTransfer.files).find(x => /image/.test(x.type));
    const p = (f as any)?.path; if (p) loadImage(p);
  };

  // ── pointer → natural-coordinate mapping ──
  const toCanvas = (e: React.PointerEvent) => {
    const c = overlayRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height), scale: c.width / r.width };
  };
  const paint = (x: number, y: number, scale: number) => {
    const ctx = overlayRef.current!.getContext('2d')!;
    ctx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = 'rgba(236,72,153,0.55)'; ctx.fillStyle = 'rgba(236,72,153,0.55)';
    ctx.lineWidth = brush * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (last.current) { ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(x, y); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x, y, (brush * scale) / 2, 0, Math.PI * 2); ctx.fill();
    last.current = { x, y };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!img || processing) return;
    if (tool === 'sam') { const { x, y } = toCanvas(e); samClick(x, y, e.button === 2 || e.shiftKey || e.altKey); return; }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true; last.current = null;
    const { x, y, scale } = toCanvas(e); paint(x, y, scale); if (!erasing) setHasMask(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const r = overlayRef.current?.getBoundingClientRect();
    if (r) setCursor({ x: e.clientX - r.left, y: e.clientY - r.top, show: true });
    if (!drawing.current || tool === 'sam') return;
    const { x, y, scale } = toCanvas(e); paint(x, y, scale);
  };
  const onUp = () => { drawing.current = false; last.current = null; };

  // ── SAM smart selection: click an object → precise mask ──
  const renderMaskToOverlay = (maskUrl: string) => {
    const oc = overlayRef.current; if (!oc) return;
    const mimg = new Image();
    mimg.onload = () => {
      const octx = oc.getContext('2d'); if (!octx) return;
      octx.clearRect(0, 0, oc.width, oc.height);
      const t = document.createElement('canvas'); t.width = oc.width; t.height = oc.height;
      const tctx = t.getContext('2d'); if (!tctx) return;
      tctx.drawImage(mimg, 0, 0, oc.width, oc.height);
      const id = tctx.getImageData(0, 0, oc.width, oc.height);
      const od = octx.createImageData(oc.width, oc.height);
      for (let i = 0; i < id.data.length; i += 4) { if (id.data[i] > 127) { od.data[i] = 236; od.data[i + 1] = 72; od.data[i + 2] = 153; od.data[i + 3] = 150; } }
      octx.putImageData(od, 0, 0);
      setHasMask(true);
    };
    mimg.src = maskUrl;
  };
  const samClick = async (natX: number, natY: number, negative: boolean) => {
    if (!img || processing) return;
    setError(null);
    if (samEmbedded.current !== img.path) {
      setProcessing(true); setStage('Analyse de l\'image…');
      const r = await electron.samEmbed?.({ imagePath: img.path }).catch((e: any) => ({ error: String(e) }));
      setProcessing(false); setStage('');
      if (!r?.ok) { setError(r?.error || 'Sélection IA indisponible.'); return; }
      samEmbedded.current = img.path;
    }
    const pts = [...samPts, { x: natX, y: natY, label: negative ? 0 : 1 }];
    setSamPts(pts);
    setProcessing(true); setStage('Sélection…');
    const res = await electron.samPoints?.({ imagePath: img.path, points: pts }).catch((e: any) => ({ error: String(e) }));
    setProcessing(false); setStage('');
    if (res?.ok) renderMaskToOverlay(res.mask); else setError(res?.error || 'Sélection échouée.');
  };

  const clearMask = () => { if (img) resetMask(img.w, img.h); setSamPts([]); };

  // Export the painted overlay to a binary white-on-black mask PNG.
  const exportMask = (): string | null => {
    const c = overlayRef.current; if (!c) return null;
    const ctx = c.getContext('2d')!; const src = ctx.getImageData(0, 0, c.width, c.height);
    const out = document.createElement('canvas'); out.width = c.width; out.height = c.height;
    const octx = out.getContext('2d')!; const dst = octx.createImageData(c.width, c.height);
    let any = false;
    for (let i = 0; i < src.data.length; i += 4) {
      const v = src.data[i + 3] > 10 ? 255 : 0; if (v) any = true;
      dst.data[i] = v; dst.data[i + 1] = v; dst.data[i + 2] = v; dst.data[i + 3] = 255;
    }
    if (!any) return null;
    octx.putImageData(dst, 0, 0);
    return out.toDataURL('image/png');
  };

  const run = async () => {
    if (!img || processing) return;
    const maskPng = exportMask();
    if (!maskPng) { setError('Peins d\'abord la zone avec le pinceau.'); return; }
    const p = prompt.trim();
    setProcessing(true); setError(null); setStage(p ? 'Génération…' : 'Préparation…');
    const res = await electron.inpaintRun?.({ imagePath: img.path, maskPng, outputDir, prompt: p }).catch((e: any) => ({ error: String(e) }));
    setProcessing(false); setStage('');
    if (res?.ok) {
      setHistory(h => [...h, img]);
      const next = { path: res.path, url: res.dataUrl || mediaUrl(res.path), w: res.width || img.w, h: res.height || img.h };
      setImg(next);
      requestAnimationFrame(() => resetMask(next.w, next.h));
      if (!p && engine && !engine.installed) setEngine({ ready: true, installed: true });
      showToast(p ? 'Zone générée ✓' : 'Objet supprimé ✓');
    } else { setError(res?.error || 'Échec.'); }
  };

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1)); setImg(prev);
    requestAnimationFrame(() => resetMask(prev.w, prev.h));
  };

  const browseOutput = async () => { const d = await electron.selectDirectory?.(); if (d) setOutputDir(d); };

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/30 to-fuchsia-500/30 flex items-center justify-center border border-white/10">
            <Eraser className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Gomme magique IA <span className="text-rose-400">·</span> <span className="text-xs font-normal text-gray-500">effacer ou générer — gratuit</span></h2>
            <p className="text-[11px] text-gray-500">Peins une zone. Sans prompt l'IA efface l'objet ; avec un prompt elle génère ce que tu veux à la place.</p>
          </div>
        </div>
        {img && <button onClick={handleBrowse} className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> Nouvelle image</button>}
      </div>

      <AnimatePresence>
        {(toast || error) && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`mx-6 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${error ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-200'}`}>
            {error ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}<span className="select-text">{error || toast}</span>
            {error && <button onClick={() => setError(null)} className="ml-auto text-red-300/70 hover:text-red-200 text-xs">×</button>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-hidden flex">
        {/* ── Toolbar ── */}
        <div className="w-[300px] shrink-0 border-r border-white/5 flex flex-col p-4 gap-4 overflow-y-auto">
          {/* Prompt — vide = effacer, rempli = générer/remplacer */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><Wand2 className="w-3 h-3 text-fuchsia-400" /> Prompt <span className="text-gray-600 normal-case font-normal tracking-normal">(optionnel)</span></label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
              placeholder="Vide = effacer l'objet.&#10;Sinon, décris quoi mettre à la place : « a leather backpack », « a tree »…"
              className="mt-1.5 w-full resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-fuchsia-500/50 focus:ring-2 focus:ring-fuchsia-500/20 transition-all leading-relaxed" />
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
              <span className={`px-2 py-0.5 rounded-full border ${!prompt.trim() ? 'bg-rose-500/15 border-rose-500/40 text-rose-200' : 'bg-white/5 border-white/10 text-gray-500'}`}>🧽 Effacer</span>
              <span className={`px-2 py-0.5 rounded-full border ${prompt.trim() ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200' : 'bg-white/5 border-white/10 text-gray-500'}`}>✨ Générer / Remplacer</span>
            </div>
          </div>

          {/* Outils : sélection IA + pinceau + gomme */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Outil</label>
            <button onClick={() => setTool('sam')} className={`mt-1.5 w-full px-3 py-2 rounded-xl text-sm font-semibold border flex items-center justify-center gap-1.5 transition-all ${tool === 'sam' ? 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-500/50' : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'}`}><MousePointerClick className="w-4 h-4" /> Sélection IA (clic sur l'objet)</button>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button onClick={() => setTool('brush')} className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5 transition-all ${tool === 'brush' ? 'bg-rose-500/25 text-rose-100 border-rose-500/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}><Brush className="w-4 h-4" /> Pinceau</button>
              <button onClick={() => setTool('eraser')} className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5 transition-all ${tool === 'eraser' ? 'bg-rose-500/25 text-rose-100 border-rose-500/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}><Eraser className="w-4 h-4" /> Gomme</button>
            </div>
            {tool === 'sam' && <p className="text-[10px] text-gray-500 mt-1.5">Clique sur un objet → masque auto. Re-clique pour agrandir. <span className="text-gray-400">Maj/clic-droit</span> = retirer une partie. (1ʳᵉ fois : ~40 Mo)</p>}
          </div>

          {/* Brush size */}
          <div className={tool === 'sam' ? 'opacity-40 pointer-events-none' : ''}>
            <div className="flex justify-between mb-1.5"><label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Taille du pinceau</label><span className="text-[11px] font-mono text-gray-200">{brush}px</span></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setBrush(b => Math.max(5, b - 5))} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center"><Minus className="w-3.5 h-3.5" /></button>
              <input type="range" min={5} max={200} value={brush} onChange={e => setBrush(Number(e.target.value))} className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-rose-500"
                style={{ background: `linear-gradient(to right,#f43f5e ${((brush - 5) / 195) * 100}%, rgba(255,255,255,0.1) ${((brush - 5) / 195) * 100}%)` }} />
              <button onClick={() => setBrush(b => Math.min(200, b + 5))} className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={clearMask} disabled={!hasMask} className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 flex items-center justify-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Effacer pinceau</button>
            <button onClick={undo} disabled={!history.length} title="Annuler la dernière suppression" className="px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 flex items-center justify-center gap-1.5"><Undo2 className="w-3.5 h-3.5" /></button>
          </div>

          {/* Output dir */}
          <div>
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dossier de sortie</label>
            <div className="flex gap-2 mt-1.5">
              <input className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-rose-500/50 transition-all w-full" value={outputDir} onChange={e => setOutputDir(e.target.value)} placeholder="Dossier…" />
              <button onClick={browseOutput} className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10"><FolderOpen className="w-4 h-4" /></button>
            </div>
          </div>

          <div className="flex-1" />

          {/* Action — label selon le mode (prompt vide = effacer) */}
          <button onClick={run} disabled={!img || processing || !hasMask}
            className="w-full px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.8), rgba(217,70,239,0.8))', border: '1px solid rgba(255,255,255,0.2)', color: 'white', boxShadow: '0 4px 24px rgba(244,63,94,0.35)' }}>
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{processing ? (stage || 'Traitement…') : (prompt.trim() ? 'Générer dans la sélection' : 'Effacer la sélection')}
          </button>
          {img && (
            <div className="flex gap-2">
              <button onClick={() => electron.showItemInFolder?.(img.path)} className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" /> Dossier</button>
              <button onClick={() => electron.openFile?.(img.path)} className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center gap-1.5"><Maximize2 className="w-3.5 h-3.5" /> Ouvrir</button>
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-hidden p-5 flex items-center justify-center" ref={wrapRef}>
          {!img ? (
            <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={handleBrowse}
              className="w-full h-full max-w-2xl rounded-3xl border-2 border-dashed border-white/12 hover:border-rose-500/40 bg-white/[0.02] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500/15 to-fuchsia-500/15 flex items-center justify-center border border-white/10"><ImagePlus className="w-7 h-7 text-rose-400/70" /></div>
              <p className="text-sm text-gray-300 font-medium">Glisse une photo ici, ou clique pour choisir</p>
              <p className="text-xs text-gray-600">JPG · PNG — peins une zone, puis efface ou génère avec un prompt</p>
            </div>
          ) : (
            <div className="relative max-w-full max-h-full inline-block" style={{ lineHeight: 0 }}
              onPointerLeave={() => setCursor(c => ({ ...c, show: false }))}>
              <img src={img.url} alt="" className="max-w-full max-h-[calc(100vh-220px)] rounded-xl select-none pointer-events-none" style={{ display: 'block' }} draggable={false} />
              <canvas ref={overlayRef}
                className={`absolute inset-0 w-full h-full rounded-xl touch-none ${tool === 'sam' ? 'cursor-crosshair' : 'cursor-none'}`}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                onContextMenu={(e) => { e.preventDefault(); if (tool === 'sam' && img && !processing) { const { x, y } = toCanvas(e as any); samClick(x, y, true); } }} />
              {/* SAM click points */}
              {tool === 'sam' && img && samPts.map((p, i) => (
                <div key={i} className="absolute w-3 h-3 rounded-full border-2 pointer-events-none -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(p.x / img.w) * 100}%`, top: `${(p.y / img.h) * 100}%`, borderColor: '#fff', background: p.label ? '#22c55e' : '#ef4444', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)' }} />
              ))}
              {/* Brush cursor preview (brush/eraser only) */}
              {cursor.show && !processing && tool !== 'sam' && (() => {
                const r = overlayRef.current?.getBoundingClientRect();
                const disp = r ? brush * (r.width / (overlayRef.current!.width)) : brush;
                return <div className="absolute rounded-full border-2 border-rose-400/80 pointer-events-none" style={{ left: cursor.x, top: cursor.y, width: disp, height: disp, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }} />;
              })()}
              {processing && (
                <div className="absolute inset-0 rounded-xl bg-black/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-9 h-9 text-rose-400 animate-spin" />
                  <span className="text-sm text-gray-200">{stage || 'Traitement IA…'}</span>
                  {!prompt.trim() && <span className="text-[11px] text-gray-500">Mode effacer : la 1ʳᵉ fois, le moteur se télécharge (~200 Mo)</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
