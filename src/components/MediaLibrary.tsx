import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Library, Search, Plus, FolderSearch, LayoutGrid, List, Star, Clock, Sparkles,
  Film, X, Play, Pause, ChevronLeft, ChevronRight, FolderOpen, Loader2, Wand2,
  Gauge, CheckCircle2, AlertCircle, Trash2, Filter,
} from 'lucide-react';
import GlassSelect from './GlassSelect';
import { t } from '@/i18n';

const api = () => (window as any).electronAPI;
const mediaUrl = (p: string) => 'media:///' + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-indigo-500/50 transition-all";

type Meta = { width: number; height: number; fps: number; codec: string; duration: number; size: number; hasAudio: boolean; audioCodec: string };
type Item = { id: string; path: string; name: string; series: string; season: number | null; episode: number | null; meta?: Meta; thumb?: string; favorite: boolean; addedAt: number; resumeTime: number };
type Conv = { status: 'running' | 'done' | 'error'; percent: number; stage?: string; outputPath?: string; error?: string };

const resLabel = (h?: number) => !h ? '—' : h >= 2160 ? '4K' : h >= 1440 ? '1440p' : h >= 1080 ? '1080p' : h >= 720 ? '720p' : 'SD';
const fmtSize = (b?: number) => !b ? '—' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(0) + ' Mo';
const fmtDur = (s?: number) => { if (!s) return '—'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(x).padStart(2, '0'); };

export default function MediaLibrary() {
  const electron = api();
  const [items, setItems] = useState<Item[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<string>('all'); // all|recent|favorites|resume|series:<name>
  const [resFilter, setResFilter] = useState('all');
  const [codecFilter, setCodecFilter] = useState('all');
  const [sort, setSort] = useState('added');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [convs, setConvs] = useState<Record<string, Conv>>({});
  const [presets, setPresets] = useState<any>({ presets: {}, prep: {} });
  const [toast, setToast] = useState<{ type: 'info' | 'error'; msg: string } | null>(null);
  const itemsRef = useRef<Item[]>([]); itemsRef.current = items;
  const listenersRef = useRef(false);
  const showToast = (type: 'info' | 'error', msg: string) => { setToast({ type, msg }); setTimeout(() => setToast(null), 4000); };

  // ── load library ──
  useEffect(() => {
    (async () => {
      if (!electron) return;
      const data = await electron.libLoad?.().catch(() => null);
      if (data?.items) setItems(data.items);
      const p = await electron.libPresets?.().catch(() => null); if (p) setPresets(p);
    })();
  }, []);
  // ── persist ──
  useEffect(() => { if (!electron?.libSave) return; const tm = setTimeout(() => electron.libSave({ items }), 600); return () => clearTimeout(tm); }, [items]);
  // ── conversion events ──
  useEffect(() => {
    if (!electron || listenersRef.current) return; listenersRef.current = true;
    electron.onLibConvertProgress?.((d: any) => setConvs(c => ({ ...c, [d.id]: { ...(c[d.id] || { status: 'running', percent: 0 }), status: 'running', percent: d.percent ?? c[d.id]?.percent ?? 0, stage: d.stage } })));
    electron.onLibConvertComplete?.((d: any) => { setConvs(c => ({ ...c, [d.id]: { status: 'done', percent: 100, outputPath: d.outputPath } })); showToast('info', t('Conversion terminée ✓')); });
    electron.onLibConvertError?.((d: any) => { setConvs(c => ({ ...c, [d.id]: { status: 'error', percent: 0, error: d.error } })); showToast('error', d.error || t('Échec conversion')); });
  }, [electron]);

  const enrich = useCallback(async (paths: string[]) => {
    const existing = new Set(itemsRef.current.map(i => i.path));
    const fresh = paths.filter(p => !existing.has(p));
    if (!fresh.length) { showToast('info', t('Déjà dans la bibliothèque.')); return; }
    const base: Item[] = [];
    for (const p of fresh) {
      const name = p.split(/[\\/]/).pop() || p;
      const info = await electron.libParseName?.(name).catch(() => ({ series: name, season: null, episode: null }));
      base.push({ id: uid(), path: p, name, series: info?.series || name, season: info?.season ?? null, episode: info?.episode ?? null, favorite: false, addedAt: Date.now(), resumeTime: 0 });
    }
    setItems(prev => [...base, ...prev]);
    for (const it of base) {
      electron.libProbe?.(it.path).then((m: any) => { if (m && !m.error) setItems(prev => prev.map(x => x.id === it.id ? { ...x, meta: m } : x)); });
      electron.libThumbnail?.(it.path).then((t: string) => { if (t) setItems(prev => prev.map(x => x.id === it.id ? { ...x, thumb: t } : x)); });
    }
  }, [electron]);

  const addFiles = async () => { setBusy(true); const f = await electron.libAddFiles?.().catch(() => []); setBusy(false); if (f?.length) await enrich(f); };
  const scanFolder = async () => { setBusy(true); const f = await electron.libScanFolder?.().catch(() => []); setBusy(false); if (f?.length) { await enrich(f); showToast('info', t('{n} fichier(s) trouvé(s).', { n: f.length })); } };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); const ps: string[] = []; for (const f of Array.from(e.dataTransfer.files)) { const p = (f as any).path; if (p) ps.push(p); } if (ps.length) enrich(ps); };
  const toggleFav = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, favorite: !i.favorite } : i));
  const removeItem = (id: string) => { setItems(prev => prev.filter(i => i.id !== id)); if (selected?.id === id) setSelected(null); };

  const convert = (item: Item, mode: 'preset' | 'prep', value: string) => {
    const jobId = item.id; // one active conversion per item
    setConvs(c => ({ ...c, [jobId]: { status: 'running', percent: 0, stage: t('Démarrage…') } }));
    electron.libConvert?.({ id: jobId, inputPath: item.path, mode, preset: mode === 'preset' ? value : undefined, prep: mode === 'prep' ? value : undefined });
  };
  const cancelConvert = (id: string) => { electron.libCancel?.(id); setConvs(c => { const n = { ...c }; delete n[id]; return n; }); };

  // ── series grouping ──
  const seriesList = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.series, (m.get(i.series) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  // ── filtering ──
  const filtered = useMemo(() => {
    let list = items.slice();
    if (section === 'recent') list = list.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 40);
    else if (section === 'favorites') list = list.filter(i => i.favorite);
    else if (section === 'resume') list = list.filter(i => i.resumeTime > 5 && (!i.meta || i.resumeTime < (i.meta.duration - 5)));
    else if (section.startsWith('series:')) { const s = section.slice(7); list = list.filter(i => i.series === s); }
    if (query.trim()) { const q = query.toLowerCase(); list = list.filter(i => i.name.toLowerCase().includes(q) || i.series.toLowerCase().includes(q)); }
    if (resFilter !== 'all') list = list.filter(i => resLabel(i.meta?.height) === resFilter);
    if (codecFilter !== 'all') list = list.filter(i => (i.meta?.codec || '').toLowerCase() === codecFilter);
    if (section !== 'recent') {
      if (sort === 'added') list.sort((a, b) => b.addedAt - a.addedAt);
      else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === 'duration') list.sort((a, b) => (b.meta?.duration || 0) - (a.meta?.duration || 0));
      else if (sort === 'episode') list.sort((a, b) => (a.season || 0) - (b.season || 0) || (a.episode || 0) - (b.episode || 0));
    }
    return list;
  }, [items, section, query, resFilter, codecFilter, sort]);

  const codecs = useMemo(() => Array.from(new Set(items.map(i => i.meta?.codec).filter(Boolean))) as string[], [items]);

  const sections = [
    { id: 'all', label: t('Toute la bibliothèque'), icon: <Library className="w-4 h-4" /> },
    { id: 'recent', label: t('Récemment ajoutés'), icon: <Sparkles className="w-4 h-4" /> },
    { id: 'favorites', label: t('Favoris'), icon: <Star className="w-4 h-4" /> },
    { id: 'resume', label: t('Reprendre la lecture'), icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="h-full flex flex-col text-gray-300 overflow-hidden" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/30 to-violet-500/30 flex items-center justify-center border border-white/10"><Library className="w-5 h-5 text-indigo-400" /></div>
        <div className="mr-2"><h2 className="text-base font-bold os-text-gradient leading-tight">{t("Médiathèque")}</h2><p className="text-[10px] text-gray-500">{t("{n} médias", { n: items.length })}</p></div>
        <div className="flex-1 relative max-w-md">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Recherche instantanée…")} className={INPUT + ' w-full pl-9'} />
        </div>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-0.5">
          <button onClick={() => setView('grid')} className={`p-1.5 rounded-lg ${view === 'grid' ? 'bg-indigo-500/30 text-indigo-200' : 'text-gray-500 hover:text-gray-300'}`}><LayoutGrid className="w-4 h-4" /></button>
          <button onClick={() => setView('list')} className={`p-1.5 rounded-lg ${view === 'list' ? 'bg-indigo-500/30 text-indigo-200' : 'text-gray-500 hover:text-gray-300'}`}><List className="w-4 h-4" /></button>
        </div>
        <button onClick={addFiles} disabled={busy} className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.7),rgba(139,92,246,0.7))', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t("Ajouter")}</button>
        <button onClick={scanFolder} disabled={busy} className="px-3 py-2 rounded-xl text-sm bg-white/5 border border-white/10 hover:bg-white/10 flex items-center gap-1.5 disabled:opacity-50"><FolderSearch className="w-4 h-4" /> {t("Scanner")}</button>
      </div>

      <AnimatePresence>{toast && (<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className={`mx-5 mt-3 px-4 py-2 rounded-xl text-sm flex items-center gap-2 border ${toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'}`}>{toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}<span className="select-text">{toast.msg}</span></motion.div>)}</AnimatePresence>

      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-white/5 flex flex-col overflow-y-auto p-3 gap-1">
          {sections.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2.5 transition-all ${section === s.id ? 'bg-indigo-500/20 text-white border border-indigo-500/40' : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>{s.icon}{s.label}</button>
          ))}
          {seriesList.length > 0 && <p className="text-[10px] text-gray-600 uppercase font-bold tracking-wider px-3 mt-3 mb-1">{t("Séries")}</p>}
          {seriesList.map(([name, count]) => (
            <button key={name} onClick={() => setSection('series:' + name)} className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition-all ${section === 'series:' + name ? 'bg-indigo-500/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><span className="truncate flex items-center gap-1.5"><Film className="w-3 h-3 shrink-0" />{name}</span><span className="text-[10px] text-gray-600">{count}</span></button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="flex items-center gap-2 px-5 py-2 border-b border-white/5 text-xs">
            <Filter className="w-3.5 h-3.5 text-gray-500" />
            <GlassSelect className="w-44 py-1" value={resFilter} onChange={setResFilter} ariaLabel={t("Résolution")}
              options={[{ value: 'all', label: t('Résolution : toutes') }, ...['4K', '1440p', '1080p', '720p', 'SD'].map(r => ({ value: r, label: r }))]} />
            <GlassSelect className="w-40 py-1" value={codecFilter} onChange={setCodecFilter} ariaLabel={t("Codec")}
              options={[{ value: 'all', label: t('Codec : tous') }, ...codecs.map((c: string) => ({ value: c, label: c }))]} />
            <GlassSelect className="w-48 py-1" value={sort} onChange={setSort} ariaLabel={t("Tri")}
              options={[{ value: 'added', label: t("Tri : date d'ajout") }, { value: 'name', label: t('Nom') }, { value: 'duration', label: t('Durée') }, { value: 'episode', label: t('Saison/Épisode') }]} />
            <span className="ml-auto text-gray-600">{t("{n} résultats", { n: filtered.length })}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {filtered.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-gray-600">
                <FolderOpen className="w-12 h-12 opacity-40" />
                <p className="text-sm">{items.length === 0 ? t('Glissez vos vidéos ici, ou « Ajouter » / « Scanner ».') : t('Aucun média ne correspond.')}</p>
              </div>
            ) : view === 'grid' ? (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
                {filtered.map(it => <Card key={it.id} it={it} conv={convs[it.id]} onOpen={() => setSelected(it)} onFav={() => toggleFav(it.id)} onRemove={() => removeItem(it.id)} />)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map(it => <Rowi key={it.id} it={it} conv={convs[it.id]} onOpen={() => setSelected(it)} onFav={() => toggleFav(it.id)} onRemove={() => removeItem(it.id)} />)}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selected && <Detail item={selected} presets={presets} conv={convs[selected.id]} onClose={(resume: number | null) => { if (resume != null) setItems(prev => prev.map(i => i.id === selected.id ? { ...i, resumeTime: resume } : i)); setSelected(null); }} onConvert={convert} onCancel={cancelConvert} onReveal={(p: string) => electron.showItemInFolder?.(p)} />}
      </AnimatePresence>
    </div>
  );
}

function ConvBadge({ conv }: { conv?: Conv }) {
  if (!conv) return null;
  if (conv.status === 'running') return <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1"><div className="flex justify-between text-[9px] text-indigo-300 mb-0.5"><span>{conv.stage || t('Conversion')}</span><span>{conv.percent}%</span></div><div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${conv.percent}%` }} /></div></div>;
  if (conv.status === 'done') return <span className="absolute bottom-1 right-1 text-[9px] bg-green-500/80 text-white px-1.5 py-0.5 rounded">{t("✓ converti")}</span>;
  if (conv.status === 'error') return <span className="absolute bottom-1 right-1 text-[9px] bg-red-500/80 text-white px-1.5 py-0.5 rounded">{t("erreur")}</span>;
  return null;
}

function Card({ it, conv, onOpen, onFav }: any) {
  return (
    <div className="group rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden hover:border-indigo-500/40 transition-all">
      <div className="relative aspect-video bg-black/50 cursor-pointer" onClick={onOpen}>
        {it.thumb ? <img src={it.thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-7 h-7 text-gray-700" /></div>}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"><Play className="w-9 h-9 text-white fill-white/90" /></div>
        <span className="absolute top-1.5 left-1.5 text-[9px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded">{resLabel(it.meta?.height)}</span>
        {it.meta?.duration ? <span className="absolute top-1.5 right-1.5 text-[9px] bg-black/70 text-gray-200 px-1.5 py-0.5 rounded">{fmtDur(it.meta.duration)}</span> : null}
        {it.resumeTime > 5 && it.meta?.duration ? <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20"><div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, it.resumeTime / it.meta.duration * 100)}%` }} /></div> : null}
        <ConvBadge conv={conv} />
      </div>
      <div className="p-2.5">
        <div className="flex items-start justify-between gap-1">
          <p className="text-xs text-gray-200 font-medium truncate flex-1" title={it.name}>{it.name}</p>
          <button onClick={onFav} className={it.favorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}><Star className="w-3.5 h-3.5" fill={it.favorite ? 'currentColor' : 'none'} /></button>
        </div>
        <p className="text-[10px] text-gray-500 truncate mt-0.5">{it.meta ? `${it.meta.width}×${it.meta.height} · ${it.meta.codec} · ${fmtSize(it.meta.size)}` : t('Analyse…')}</p>
      </div>
    </div>
  );
}

function Rowi({ it, conv, onOpen, onFav, onRemove }: any) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] p-2 hover:border-indigo-500/40 transition-all">
      <div className="w-24 h-14 rounded-lg bg-black/50 overflow-hidden shrink-0 cursor-pointer relative" onClick={onOpen}>{it.thumb ? <img src={it.thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><Film className="w-5 h-5 text-gray-700" /></div>}<ConvBadge conv={conv} /></div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}><p className="text-sm text-gray-200 font-medium truncate">{it.name}</p><p className="text-[11px] text-gray-500 truncate">{it.series}{it.season ? ` · S${it.season}` : ''}{it.episode ? `E${it.episode}` : ''}{it.meta ? ` · ${it.meta.width}×${it.meta.height} · ${it.meta.codec} · ${fmtDur(it.meta.duration)} · ${fmtSize(it.meta.size)}` : ' · analyse…'}</p></div>
      <span className="text-[10px] bg-white/5 px-2 py-1 rounded shrink-0">{resLabel(it.meta?.height)}</span>
      <button onClick={onFav} className={`shrink-0 ${it.favorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}><Star className="w-4 h-4" fill={it.favorite ? 'currentColor' : 'none'} /></button>
      <button onClick={onRemove} className="shrink-0 text-gray-600 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function Detail({ item, presets, conv, onClose, onConvert, onCancel, onReveal }: any) {
  const vref = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState('h264');
  const m: Meta | undefined = item.meta;
  const fps = m?.fps || 24;

  useEffect(() => { const v = vref.current; if (v && item.resumeTime > 5) { const tm = setTimeout(() => { try { v.currentTime = item.resumeTime; } catch (e) {} }, 200); return () => clearTimeout(tm); } }, []);
  useEffect(() => { if (vref.current) vref.current.playbackRate = speed; }, [speed]);
  const step = (frames: number) => { const v = vref.current; if (v) { v.pause(); setPlaying(false); v.currentTime = Math.max(0, v.currentTime + frames / fps); } };
  const close = () => onClose(vref.current ? vref.current.currentTime : null);

  const PRESETS = presets?.presets || {};
  const PREP = presets?.prep || {};
  const presetGroups = useMemo(() => { const g: Record<string, string[]> = {}; Object.entries(PRESETS).forEach(([k, v]: any) => { (g[v.group] = g[v.group] || []).push(k); }); return g; }, [PRESETS]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4" onClick={close}>
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} className="rounded-3xl border border-white/10 w-full max-w-5xl h-[85vh] flex overflow-hidden" style={{ background: 'rgba(14,14,20,0.97)' }} onClick={e => e.stopPropagation()}>
        {/* Player */}
        <div className="flex-1 flex flex-col bg-black min-w-0">
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video ref={vref} src={mediaUrl(item.path)} className="max-h-full max-w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
          </div>
          <div className="flex items-center gap-2 px-4 py-3 bg-black/60 border-t border-white/5">
            <button onClick={() => step(-1)} title={t("Image précédente")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => { const v = vref.current; if (!v) return; v.paused ? v.play() : v.pause(); }} className="p-2 rounded-lg bg-indigo-500/30 text-indigo-100">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}</button>
            <button onClick={() => step(1)} title={t("Image suivante")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
            <div className="flex items-center gap-1.5 ml-3"><Gauge className="w-3.5 h-3.5 text-gray-500" /><span className="text-xs text-gray-400">{t("Vitesse")}</span>
              {[0.25, 0.5, 1, 1.5, 2].map(s => <button key={s} onClick={() => setSpeed(s)} className={`text-[11px] px-1.5 py-0.5 rounded ${speed === s ? 'bg-indigo-500/40 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>{s}×</button>)}
            </div>
            <span className="ml-auto text-[10px] text-gray-500">{t("1 image = {s}s", { s: (1 / fps).toFixed(3) })}</span>
          </div>
        </div>

        {/* Info + actions */}
        <div className="w-80 shrink-0 border-l border-white/8 flex flex-col overflow-y-auto">
          <div className="flex items-start justify-between p-4 border-b border-white/8"><div className="min-w-0"><h3 className="text-sm font-bold text-white truncate">{item.name}</h3><p className="text-[11px] text-gray-500 truncate">{item.series}{item.season ? ` · S${item.season}` : ''}{item.episode ? `E${item.episode}` : ''}</p></div><button onClick={close} className="text-gray-500 hover:text-white shrink-0"><X className="w-5 h-5" /></button></div>

          <div className="p-4 space-y-2 border-b border-white/8">
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{t("Informations")}</p>
            {[[t('Résolution'), m ? `${m.width}×${m.height} (${resLabel(m.height)})` : '—'], ['FPS', m ? Math.round(m.fps) + ' fps' : '—'], [t('Codec vidéo'), m?.codec || '—'], [t('Codec audio'), m?.audioCodec || (m?.hasAudio ? '—' : t('aucun'))], [t('Durée'), fmtDur(m?.duration)], [t('Taille'), fmtSize(m?.size)]].map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs"><span className="text-gray-500">{k}</span><span className="text-gray-200 text-right">{v}</span></div>
            ))}
          </div>

          <div className="p-4 space-y-3">
            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider flex items-center gap-1.5"><Wand2 className="w-3 h-3" /> {t("Export créatif")}</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(PREP).map(([k, v]: any) => (
                <button key={k} disabled={conv?.status === 'running'} onClick={() => onConvert(item, 'prep', k)} className="px-2 py-2 rounded-xl text-xs bg-white/5 border border-white/10 hover:bg-indigo-500/15 hover:border-indigo-500/30 transition-all disabled:opacity-40">{t("Préparer pour")}<br /><strong>{v.label}</strong></button>
              ))}
            </div>
            <div className="pt-1">
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1.5">{t("Conversion")}</p>
              <div className="flex gap-2">
                <GlassSelect className="flex-1 py-1.5" value={preset} onChange={setPreset} ariaLabel={t("Préréglage")}
                  options={Object.entries(presetGroups).flatMap(([g, keys]: any) => (keys as string[]).map((k: string) => ({ value: k, label: PRESETS[k].label, group: g })))} />
                <button disabled={conv?.status === 'running'} onClick={() => onConvert(item, 'preset', preset)} className="px-3 py-1.5 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.75),rgba(139,92,246,0.75))', color: 'white' }}>{t("Convertir")}</button>
              </div>
            </div>

            {conv?.status === 'running' && <div className="pt-1"><div className="flex justify-between text-[11px] text-indigo-300 mb-1"><span>{conv.stage || t('Conversion')}</span><span>{conv.percent}%</span></div><div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${conv.percent}%` }} /></div><button onClick={() => onCancel(item.id)} className="mt-2 w-full text-xs py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300">{t("Annuler")}</button></div>}
            {conv?.status === 'done' && conv.outputPath && <button onClick={() => onReveal(conv.outputPath)} className="w-full text-xs py-2 rounded-lg bg-green-500/15 border border-green-500/30 text-green-300 flex items-center justify-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {t("Terminé — Ouvrir le dossier")}</button>}
            {conv?.status === 'error' && <p className="text-[11px] text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg p-2">{conv.error}</p>}

            <button onClick={() => onReveal(item.path)} className="w-full text-xs py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center gap-1.5 mt-1"><FolderOpen className="w-4 h-4" /> {t("Voir le fichier source")}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
