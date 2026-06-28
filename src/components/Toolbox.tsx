import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scissors, Music2, Minimize2, Image as ImageIcon, QrCode, FolderOpen, Loader2, CheckCircle2, AlertTriangle, FileUp, Download, X, Combine, Captions, GitCompareArrows, Eye, FolderSync, Play, Square, Languages, ScanText, Copy } from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import GlassSelect from "./GlassSelect";
import { t } from "@/i18n";
import { addRecent, notifyDone, getRecents, clearRecents, type RecentItem } from "@/recents";
import { startTask, updateTask, finishTask } from "@/tasks";

const api = () => (window as any).electronAPI;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const INPUT = "bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none focus:border-pink-500/50 transition-all w-full";

type ToolId = "trim" | "audio" | "compress" | "image" | "merge" | "subtitles" | "translate" | "ocr" | "pdf" | "compare" | "watch" | "qr";

const TOOLS: { id: ToolId; label: string; icon: any; desc: string }[] = [
  { id: "trim", label: "Découper", icon: Scissors, desc: "Couper un extrait sans réencoder (instantané, sans perte)." },
  { id: "audio", label: "Extraire l'audio", icon: Music2, desc: "Sortir la piste audio d'une vidéo (MP3, WAV, FLAC, M4A)." },
  { id: "compress", label: "Compresser à une taille", icon: Minimize2, desc: "Viser une taille précise (ex. 8 Mo pour Discord)." },
  { id: "image", label: "Convertir une image", icon: ImageIcon, desc: "PNG, JPG, WEBP, AVIF, ICO… + redimensionnement." },
  { id: "merge", label: "Fusionner des vidéos", icon: Combine, desc: "Mettre plusieurs vidéos bout à bout en un seul fichier." },
  { id: "subtitles", label: "Incruster sous-titres", icon: Captions, desc: "Graver un fichier .srt dans la vidéo (hardsub)." },
  { id: "translate", label: "Traduire sous-titres", icon: Languages, desc: "Traduire un .srt dans une autre langue (IA Claude)." },
  { id: "ocr", label: "OCR (texte d'image)", icon: ScanText, desc: "Extraire le texte d'une image ou capture (IA Claude)." },
  { id: "pdf", label: "Images → PDF", icon: FileUp, desc: "Combiner plusieurs images en un seul PDF." },
  { id: "compare", label: "Comparateur", icon: GitCompareArrows, desc: "Glisser pour comparer avant / après (upscale, etc.)." },
  { id: "watch", label: "Dossier surveillé", icon: FolderSync, desc: "Convertir automatiquement tout fichier déposé dans un dossier." },
  { id: "qr", label: "QR Code", icon: QrCode, desc: "Générer ou lire un QR code (URL, texte, code Drop)." },
];

function fmtSecInput(v: string) { return v; }
// Accept "mm:ss", "hh:mm:ss" or raw seconds → seconds (number).
function parseTime(s: string): number {
  if (!s) return 0;
  const parts = s.split(":").map(p => parseFloat(p.trim()) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export default function Toolbox() {
  const [tool, setTool] = useState<ToolId>("trim");

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
            <Scissors className="w-5 h-5" style={{ color: "var(--accent-strong)" }} />
          </span>
          <div>
            <h2 className="text-xl font-bold os-text-gradient">{t("Boîte à outils")}</h2>
            <p className="text-xs text-gray-500">{t("Des utilitaires rapides pour vos fichiers du quotidien.")}</p>
          </div>
        </div>

        {/* Tool picker */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
          {TOOLS.map(tl => {
            const Icon = tl.icon;
            const active = tool === tl.id;
            return (
              <button
                key={tl.id}
                onClick={() => setTool(tl.id)}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-semibold transition-all ${active ? "text-pink-300" : "text-gray-400 hover:text-gray-200"}`}
                style={{
                  background: active ? "rgba(236,72,153,0.12)" : "rgba(255,255,255,0.04)",
                  borderColor: active ? "rgba(236,72,153,0.4)" : "rgba(255,255,255,0.08)",
                }}
              >
                <Icon className="w-5 h-5" />
                {t(tl.label)}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tool} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
            {tool === "qr" ? <QrTool />
              : tool === "merge" ? <MergeTool />
              : tool === "subtitles" ? <SubsTool />
              : tool === "translate" ? <TranslateTool />
              : tool === "ocr" ? <OcrTool />
              : tool === "pdf" ? <PdfTool />
              : tool === "compare" ? <CompareTool />
              : tool === "watch" ? <WatchTool />
              : <FfmpegTool tool={tool as "trim" | "audio" | "compress" | "image"} />}
          </motion.div>
        </AnimatePresence>

        <RecentsPanel />
      </div>
    </div>
  );
}

// ── Recent outputs (shared history across tools) ─────────────────────────────
function RecentsPanel() {
  const [items, setItems] = useState<RecentItem[]>(getRecents());
  useEffect(() => {
    const refresh = () => setItems(getRecents());
    window.addEventListener("orbit-recents-updated", refresh);
    return () => window.removeEventListener("orbit-recents-updated", refresh);
  }, []);
  if (!items.length) return null;
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t("Fichiers récents")}</span>
        <button onClick={() => clearRecents()} className="text-xs text-gray-600 hover:text-red-400 transition-colors">{t("Effacer")}</button>
      </div>
      <div className="space-y-1.5">
        {items.slice(0, 8).map((r, i) => (
          <div key={i} className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gray-300 truncate">{r.name}</p>
              <p className="text-[10px] text-gray-600">{r.tool}</p>
            </div>
            <button onClick={() => api()?.openFile?.(r.path)} className="p-1.5 rounded-lg text-gray-500 hover:text-pink-300 hover:bg-white/5" title={t("Ouvrir")}><FolderOpen className="w-3.5 h-3.5" /></button>
            <button onClick={() => api()?.showItemInFolder?.(r.path)} className="p-1.5 rounded-lg text-gray-500 hover:text-pink-300 hover:bg-white/5" title={t("Dans le dossier")}><FileUp className="w-3.5 h-3.5 rotate-180" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ffmpeg-backed tools (trim / audio / compress / image) ────────────────────
function FfmpegTool({ tool }: { tool: Exclude<ToolId, "qr"> }) {
  const meta = TOOLS.find(t => t.id === tool)!;
  const [input, setInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ ok: boolean; outputPath?: string; error?: string } | null>(null);
  const jobRef = useRef<string>("");

  // options
  const [start, setStart] = useState("00:00");
  const [end, setEnd] = useState("");
  const [audioFmt, setAudioFmt] = useState("mp3");
  const [targetMB, setTargetMB] = useState("8");
  const [imgFmt, setImgFmt] = useState("png");
  const [imgWidth, setImgWidth] = useState("");

  useEffect(() => {
    const off = api()?.onToolboxProgress?.((v: any) => {
      if (v.jobId !== jobRef.current) return;
      setPercent(v.percent ?? 0);
      if (v.label) setLabel(v.label);
      updateTask(v.jobId, v.percent ?? 0, v.label);
    });
    return () => { off?.(); };
  }, []);

  // Reset when switching tool.
  useEffect(() => { setInput(null); setResult(null); setPercent(0); setBusy(false); }, [tool]);

  const pick = async () => {
    const kind = tool === "image" ? "image" : tool === "audio" || tool === "compress" || tool === "trim" ? "video" : "media";
    const p = await api()?.toolboxPick?.(kind);
    if (p) { setInput(p); setResult(null); }
  };

  const run = async () => {
    if (!input) return;
    const opts: any = {};
    if (tool === "trim") { opts.start = parseTime(start); opts.end = parseTime(end); if (opts.end <= opts.start) { setResult({ ok: false, error: t("La fin doit être après le début.") }); return; } }
    if (tool === "audio") opts.format = audioFmt;
    if (tool === "compress") opts.targetMB = parseFloat(targetMB) || 8;
    if (tool === "image") { opts.format = imgFmt; opts.width = imgWidth; }
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setResult(null); setPercent(0); setLabel(t("Préparation…"));
    startTask(jobId, t(meta.label), t(meta.label));
    try {
      const r = await api()?.toolboxRun?.({ jobId, op: tool === "image" ? "convert-image" : tool === "audio" ? "extract-audio" : tool, inputPath: input, opts });
      setResult(r || { ok: false, error: t("Aucune réponse.") });
      finishTask(jobId, !!r?.ok, r?.outputPath, r?.error);
      if (r?.ok && r.outputPath) {
        addRecent(r.outputPath, t(meta.label));
        notifyDone(t("Orbit — terminé"), `${t(meta.label)} : ${r.outputPath.split(/[\\/]/).pop()}`);
      }
    } finally { setBusy(false); }
  };

  const cancel = () => { if (jobRef.current) api()?.toolboxCancel?.(jobRef.current); };
  const fileName = input ? input.split(/[\\/]/).pop() : null;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-5">
      <p className="text-sm text-gray-400">{t(meta.desc)}</p>

      {/* File picker */}
      <button onClick={pick} disabled={busy} className="w-full py-8 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 hover:bg-white/[0.03] transition-all flex flex-col items-center gap-2 disabled:opacity-40">
        <FileUp className="w-7 h-7 text-gray-400" />
        <span className="text-sm text-gray-300 font-medium">{fileName || t("Choisir un fichier")}</span>
        {fileName && <span className="text-xs text-gray-600 truncate max-w-full px-4">{input}</span>}
      </button>

      {/* Options */}
      {input && !busy && (
        <div className="space-y-3">
          {tool === "trim" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Début")} (mm:ss)</label>
                <input value={start} onChange={e => setStart(fmtSecInput(e.target.value))} placeholder="00:00" className={INPUT + " font-mono mt-1"} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Fin")} (mm:ss)</label>
                <input value={end} onChange={e => setEnd(fmtSecInput(e.target.value))} placeholder="01:30" className={INPUT + " font-mono mt-1"} />
              </div>
            </div>
          )}
          {tool === "audio" && (
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Format de sortie")}</label>
              <GlassSelect value={audioFmt} onChange={setAudioFmt} className="mt-1" ariaLabel={t("Format audio")}
                options={[{ value: "mp3", label: "MP3" }, { value: "m4a", label: "M4A (AAC)" }, { value: "wav", label: "WAV" }, { value: "flac", label: "FLAC" }]} />
            </div>
          )}
          {tool === "compress" && (
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Taille cible (Mo)")}</label>
              <input type="number" min={1} value={targetMB} onChange={e => setTargetMB(e.target.value)} className={INPUT + " mt-1"} />
              <div className="flex gap-2 mt-2">
                {[8, 10, 25, 50].map(v => (
                  <button key={v} onClick={() => setTargetMB(String(v))} className="px-2.5 py-1 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10">{v} Mo</button>
                ))}
              </div>
            </div>
          )}
          {tool === "image" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Format")}</label>
                <GlassSelect value={imgFmt} onChange={setImgFmt} className="mt-1" ariaLabel={t("Format image")}
                  options={[{ value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }, { value: "webp", label: "WEBP" }, { value: "avif", label: "AVIF" }, { value: "bmp", label: "BMP" }, { value: "tiff", label: "TIFF" }, { value: "ico", label: "ICO" }]} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Largeur (px, option.)")}</label>
                <input type="number" min={0} value={imgWidth} onChange={e => setImgWidth(e.target.value)} placeholder={t("auto")} className={INPUT + " mt-1"} />
              </div>
            </div>
          )}

          <button onClick={run} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}>
            {(() => { const Icon = meta.icon; return <Icon className="w-4 h-4" />; })()} {t("Lancer")}
          </button>
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
            <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin" /> {label}</span>
            <span className="flex items-center gap-2">{percent}% <button onClick={cancel} className="text-gray-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button></span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: percent + "%", background: "linear-gradient(90deg,#e879f9,#a855f7)" }} /></div>
        </div>
      )}

      {/* Result */}
      {result && !busy && (
        result.ok ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> {t("Terminé !")}</div>
            <p className="text-xs text-gray-400 break-all">{result.outputPath}</p>
            <div className="flex gap-2">
              <button onClick={() => api()?.openFile?.(result.outputPath)} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {t("Ouvrir")}</button>
              <button onClick={() => api()?.showItemInFolder?.(result.outputPath)} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {t("Dans le dossier")}</button>
            </div>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-sm text-red-300">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span className="break-all">{result.error}</span>
          </div>
        )
      )}
    </div>
  );
}

// ── QR code generator + reader ───────────────────────────────────────────────
function QrTool() {
  const [mode, setMode] = useState<"gen" | "read">("gen");
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 text-sm">
        <button onClick={() => setMode("gen")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${mode === "gen" ? "bg-pink-500/20 text-pink-300" : "text-gray-400 hover:text-gray-200"}`}><QrCode className="w-3.5 h-3.5" /> {t("Générer")}</button>
        <button onClick={() => setMode("read")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${mode === "read" ? "bg-pink-500/20 text-pink-300" : "text-gray-400 hover:text-gray-200"}`}><Eye className="w-3.5 h-3.5" /> {t("Lire")}</button>
      </div>
      {mode === "gen" ? <QrGenerate /> : <QrRead />}
    </div>
  );
}

function QrRead() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onFile = (file: File) => {
    setError(null); setResult(null);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { setError(t("Lecture impossible.")); return; }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(data.data, data.width, data.height);
      if (code?.data) setResult(code.data);
      else setError(t("Aucun QR code détecté dans l'image."));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setError(t("Image illisible."));
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">{t("Choisis une image (capture, photo) contenant un QR code.")}</p>
      <label className="w-full py-8 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 hover:bg-white/[0.03] transition-all flex flex-col items-center gap-2 cursor-pointer">
        <ImageIcon className="w-7 h-7 text-gray-400" />
        <span className="text-sm text-gray-300 font-medium">{t("Choisir une image")}</span>
        <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-2">
          <p className="text-xs text-gray-400 uppercase font-semibold">{t("Contenu")}</p>
          <p className="text-sm text-gray-100 break-all select-text">{result}</p>
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10">{copied ? t("Copié !") : t("Copier")}</button>
            {/^https?:\/\//.test(result) && <button onClick={() => api()?.openExternalUrl?.(result)} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10">{t("Ouvrir le lien")}</button>}
          </div>
        </div>
      )}
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</div>}
    </div>
  );
}

function QrGenerate() {
  const [text, setText] = useState("");
  const [dataUrl, setDataUrl] = useState<string>("");
  const [fg, setFg] = useState("#0f0f19");
  const [bg, setBg] = useState("#ffffff");

  useEffect(() => {
    if (!text.trim()) { setDataUrl(""); return; }
    let cancelled = false;
    QRCode.toDataURL(text, { width: 512, margin: 2, color: { dark: fg, light: bg }, errorCorrectionLevel: "M" })
      .then(url => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(""); });
    return () => { cancelled = true; };
  }, [text, fg, bg]);

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qrcode.png";
    a.click();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">{t("Colle une URL, un texte ou un code de partage Drop pour générer un QR code.")}</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder={t("https://… ou n'importe quel texte")} className={INPUT + " resize-none"} />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-400">{t("Couleur")} <input type="color" value={fg} onChange={e => setFg(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/10" /></label>
        <label className="flex items-center gap-2 text-xs text-gray-400">{t("Fond")} <input type="color" value={bg} onChange={e => setBg(e.target.value)} className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/10" /></label>
      </div>
      {dataUrl ? (
        <div className="flex flex-col items-center gap-4 pt-2">
          <img src={dataUrl} alt="QR" className="w-56 h-56 rounded-xl border border-white/10" style={{ imageRendering: "pixelated" }} />
          <button onClick={download} className="px-4 py-2 rounded-xl font-semibold text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}>
            <Download className="w-4 h-4" /> {t("Télécharger le PNG")}
          </button>
        </div>
      ) : (
        <div className="h-56 flex items-center justify-center text-gray-600 text-sm border border-dashed border-white/10 rounded-xl">
          <QrCode className="w-10 h-10 opacity-40" />
        </div>
      )}
    </div>
  );
}

// ── Shared progress + result UI for backend (toolbox-run) jobs ────────────────
function useToolboxJob(toolLabel: string) {
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ ok: boolean; outputPath?: string; error?: string } | null>(null);
  const jobRef = useRef("");
  useEffect(() => {
    const off = api()?.onToolboxProgress?.((v: any) => {
      if (v.jobId !== jobRef.current) return;
      setPercent(v.percent ?? 0); if (v.label) setLabel(v.label);
      updateTask(v.jobId, v.percent ?? 0, v.label);
    });
    return () => { off?.(); };
  }, []);
  const run = async (op: string, inputPath: string | null, opts: any) => {
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setResult(null); setPercent(0); setLabel(t("Préparation…"));
    startTask(jobId, toolLabel, toolLabel);
    try {
      const r = await api()?.toolboxRun?.({ jobId, op, inputPath, opts });
      setResult(r || { ok: false, error: t("Aucune réponse.") });
      finishTask(jobId, !!r?.ok, r?.outputPath, r?.error);
      if (r?.ok && r.outputPath) { addRecent(r.outputPath, toolLabel); notifyDone(t("Orbit — terminé"), `${toolLabel} : ${r.outputPath.split(/[\\/]/).pop()}`); }
    } finally { setBusy(false); }
  };
  const cancel = () => { if (jobRef.current) api()?.toolboxCancel?.(jobRef.current); };
  return { busy, percent, label, result, run, cancel };
}

function ProgressBlock({ percent, label, onCancel }: { percent: number; label: string; onCancel: () => void }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3">
      <div className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
        <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin" /> {label}</span>
        <span className="flex items-center gap-2">{percent}% <button onClick={onCancel} className="text-gray-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button></span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: percent + "%", background: "linear-gradient(90deg,#e879f9,#a855f7)" }} /></div>
    </div>
  );
}

function ResultBlock({ result }: { result: { ok: boolean; outputPath?: string; error?: string } }) {
  if (result.ok) return (
    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-emerald-300 text-sm font-medium"><CheckCircle2 className="w-4 h-4" /> {t("Terminé !")}</div>
      <p className="text-xs text-gray-400 break-all">{result.outputPath}</p>
      <div className="flex gap-2">
        <button onClick={() => api()?.openFile?.(result.outputPath)} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {t("Ouvrir")}</button>
        <button onClick={() => api()?.showItemInFolder?.(result.outputPath)} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> {t("Dans le dossier")}</button>
      </div>
    </div>
  );
  return <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2 text-sm text-red-300"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span className="break-all">{result.error}</span></div>;
}

// ── Fusion de vidéos ─────────────────────────────────────────────────────────
function MergeTool() {
  const [paths, setPaths] = useState<string[]>([]);
  const job = useToolboxJob(t("Fusion"));
  const pick = async () => { const p = await api()?.toolboxPickMany?.("video"); if (p?.length) setPaths(prev => [...prev, ...p]); };
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Ajoute des vidéos dans l'ordre voulu ; elles seront mises bout à bout (réencodées en 720p pour la compatibilité).")}</p>
      <button onClick={pick} disabled={job.busy} className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 hover:bg-white/[0.03] transition-all flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-40"><FileUp className="w-4 h-4" /> {t("Ajouter des vidéos")}</button>
      {paths.length > 0 && (
        <div className="space-y-1.5">
          {paths.map((p, i) => (
            <div key={i} className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-xl px-3 py-2">
              <span className="text-xs text-gray-500 w-5">{i + 1}.</span>
              <span className="text-xs text-gray-300 truncate flex-1">{p.split(/[\\/]/).pop()}</span>
              <button onClick={() => setPaths(prev => prev.filter((_, j) => j !== i))} className="text-gray-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {!job.busy && paths.length >= 2 && (
        <button onClick={() => job.run("merge-video", null, { paths })} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}><Combine className="w-4 h-4" /> {t("Fusionner")}</button>
      )}
      {job.busy && <ProgressBlock percent={job.percent} label={job.label} onCancel={job.cancel} />}
      {job.result && !job.busy && <ResultBlock result={job.result} />}
    </div>
  );
}

// ── Incrustation de sous-titres ──────────────────────────────────────────────
function SubsTool() {
  const [video, setVideo] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const job = useToolboxJob(t("Sous-titres"));
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Grave un fichier .srt directement dans l'image de la vidéo.")}</p>
      <button onClick={async () => { const p = await api()?.toolboxPick?.("video"); if (p) setVideo(p); }} disabled={job.busy} className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-40"><FileUp className="w-4 h-4" /> {video ? video.split(/[\\/]/).pop() : t("Choisir la vidéo")}</button>
      <button onClick={async () => { const p = await api()?.toolboxPickSub?.(); if (p) setSub(p); }} disabled={job.busy} className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-40"><Captions className="w-4 h-4" /> {sub ? sub.split(/[\\/]/).pop() : t("Choisir les sous-titres (.srt)")}</button>
      {!job.busy && video && sub && (
        <button onClick={() => job.run("hardsub", video, { subPath: sub })} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}><Captions className="w-4 h-4" /> {t("Incruster")}</button>
      )}
      {job.busy && <ProgressBlock percent={job.percent} label={job.label} onCancel={job.cancel} />}
      {job.result && !job.busy && <ResultBlock result={job.result} />}
    </div>
  );
}

// ── Images → PDF (renderer-side, via pdf-lib) ────────────────────────────────
function PdfTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = async () => {
    if (!files.length) return;
    setBusy(true); setError(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const isPng = /\.png$/i.test(f.name) || f.type === "image/png";
        const img = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const page = pdf.addPage([img.width, img.height]);
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      const out = await pdf.save();
      const blob = new Blob([out], { type: "application/pdf" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "images.pdf"; a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      setError(t("Échec : seules les images PNG et JPG sont prises en charge.") + " " + (e?.message || ""));
    } finally { setBusy(false); }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Combine plusieurs images (PNG / JPG) en un seul PDF, une image par page.")}</p>
      <label className="w-full py-6 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex flex-col items-center gap-2 cursor-pointer">
        <ImageIcon className="w-7 h-7 text-gray-400" />
        <span className="text-sm text-gray-300">{files.length ? t("%n image(s) sélectionnée(s)").replace("%n", String(files.length)) : t("Choisir des images")}</span>
        <input type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={e => setFiles(Array.from(e.target.files || []))} />
      </label>
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}</div>}
      {files.length > 0 && (
        <button onClick={build} disabled={busy} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {t("Créer le PDF")}
        </button>
      )}
    </div>
  );
}

// ── Comparateur avant / après (pur rendu) ────────────────────────────────────
function CompareTool() {
  const [before, setBefore] = useState<string>("");
  const [after, setAfter] = useState<string>("");
  const [pos, setPos] = useState(50);
  const load = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) setter(URL.createObjectURL(f));
  };
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Charge deux images (avant / après) et glisse le curseur pour comparer.")}</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-xs text-gray-300 cursor-pointer"><FileUp className="w-4 h-4" /> {before ? t("Avant ✓") : t("Image avant")}<input type="file" accept="image/*" className="hidden" onChange={load(setBefore)} /></label>
        <label className="py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-xs text-gray-300 cursor-pointer"><FileUp className="w-4 h-4" /> {after ? t("Après ✓") : t("Image après")}<input type="file" accept="image/*" className="hidden" onChange={load(setAfter)} /></label>
      </div>
      {before && after ? (
        <div className="relative w-full rounded-xl overflow-hidden border border-white/10 select-none" style={{ aspectRatio: "16/10", background: "#000" }}>
          <img src={before} alt="avant" className="absolute inset-0 w-full h-full object-contain" />
          <img src={after} alt="après" className="absolute inset-0 w-full h-full object-contain" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-pink-400 pointer-events-none" style={{ left: pos + "%" }} />
          <input type="range" min={0} max={100} value={pos} onChange={e => setPos(+e.target.value)} className="absolute inset-x-0 bottom-3 mx-auto w-[90%] accent-pink-500" />
          <div className="absolute top-2 left-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded">{t("Avant")}</div>
          <div className="absolute top-2 right-2 text-[10px] bg-black/60 text-white px-2 py-0.5 rounded">{t("Après")}</div>
        </div>
      ) : (
        <div className="h-48 flex items-center justify-center text-gray-600 text-sm border border-dashed border-white/10 rounded-xl"><GitCompareArrows className="w-10 h-10 opacity-40" /></div>
      )}
    </div>
  );
}

// ── Traduction de sous-titres (IA Claude) ────────────────────────────────────
const LANGS_TR = ["Français", "Anglais", "Espagnol", "Allemand", "Italien", "Portugais", "Néerlandais", "Japonais", "Coréen", "Chinois (simplifié)", "Arabe", "Russe"];
function TranslateTool() {
  const [sub, setSub] = useState<string | null>(null);
  const [lang, setLang] = useState("Anglais");
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<{ ok: boolean; outputPath?: string; error?: string } | null>(null);
  const jobRef = useRef("");
  useEffect(() => {
    const off = api()?.onToolboxProgress?.((v: any) => { if (v.jobId !== jobRef.current) return; setPercent(v.percent ?? 0); if (v.label) setLabel(v.label); updateTask(v.jobId, v.percent ?? 0, v.label); });
    return () => { off?.(); };
  }, []);
  const run = async () => {
    if (!sub) return;
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setResult(null); setPercent(0); setLabel(t("Préparation…"));
    startTask(jobId, t("Traduction sous-titres"), t("Traduction sous-titres"));
    try {
      const r = await api()?.toolboxTranslateSrt?.({ jobId, subPath: sub, lang });
      setResult(r || { ok: false, error: t("Aucune réponse.") });
      finishTask(jobId, !!r?.ok, r?.outputPath, r?.error);
      if (r?.ok && r.outputPath) { addRecent(r.outputPath, t("Traduction sous-titres")); notifyDone(t("Orbit — terminé"), r.outputPath.split(/[\\/]/).pop() || ""); }
    } finally { setBusy(false); }
  };
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Traduit un fichier .srt vers une autre langue en gardant les minutages. Utilise ta clé API Anthropic (Réglages → Assistant IA).")}</p>
      <button onClick={async () => { const p = await api()?.toolboxPickSub?.(); if (p) setSub(p); }} disabled={busy} className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-40"><Captions className="w-4 h-4" /> {sub ? sub.split(/[\\/]/).pop() : t("Choisir le .srt")}</button>
      <div>
        <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Traduire vers")}</label>
        <GlassSelect value={lang} onChange={setLang} className="mt-1" ariaLabel={t("Langue cible")} options={LANGS_TR.map(l => ({ value: l, label: l }))} />
      </div>
      {!busy && sub && <button onClick={run} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}><Languages className="w-4 h-4" /> {t("Traduire")}</button>}
      {busy && <ProgressBlock percent={percent} label={label} onCancel={() => { }} />}
      {result && !busy && <ResultBlock result={result} />}
    </div>
  );
}

// ── OCR — texte depuis une image (IA Claude vision) ──────────────────────────
function OcrTool() {
  const [img, setImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const run = async () => {
    if (!img) return;
    setBusy(true); setError(null); setText("");
    try {
      const r = await api()?.toolboxOcr?.({ imagePath: img });
      if (r?.ok) setText(r.text || ""); else setError(r?.error || t("Échec de l'OCR."));
    } finally { setBusy(false); }
  };
  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Extrait le texte d'une image ou capture d'écran. Utilise ta clé API Anthropic (Réglages → Assistant IA).")}</p>
      <button onClick={async () => { const p = await api()?.toolboxPick?.("image"); if (p) { setImg(p); setText(""); setError(null); } }} disabled={busy} className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-40"><ImageIcon className="w-4 h-4" /> {img ? img.split(/[\\/]/).pop() : t("Choisir une image")}</button>
      {img && !busy && <button onClick={run} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}><ScanText className="w-4 h-4" /> {t("Extraire le texte")}</button>}
      {busy && <div className="flex items-center gap-2 text-sm text-gray-300"><Loader2 className="w-4 h-4 text-pink-400 animate-spin" /> {t("Analyse de l'image…")}</div>}
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-300 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}</div>}
      {text && (
        <div className="space-y-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className={INPUT + " resize-none font-mono text-xs"} />
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" /> {copied ? t("Copié !") : t("Copier")}</button>
            <button onClick={async () => { const r = await api()?.toolboxSaveText?.({ suggestedName: "ocr.txt", content: text }); if (r?.ok) addRecent(r.outputPath, t("OCR")); }} className="px-3 py-1.5 rounded-lg text-xs bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> {t("Enregistrer .txt")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dossier surveillé ────────────────────────────────────────────────────────
function WatchTool() {
  const [folder, setFolder] = useState<string | null>(null);
  const [action, setAction] = useState("to-mp4");
  const [imgFmt, setImgFmt] = useState("webp");
  const [watching, setWatching] = useState(false);
  const [log, setLog] = useState<{ type: string; file: string }[]>([]);

  useEffect(() => {
    const off = api()?.onToolboxWatchEvent?.((v: any) => {
      setLog(prev => [{ type: v.type, file: v.file }, ...prev].slice(0, 30));
      if (v.type === "done" && v.outputPath) { addRecent(v.outputPath, t("Dossier surveillé")); notifyDone(t("Orbit — converti"), v.file); }
    });
    return () => { off?.(); };
  }, []);
  useEffect(() => () => { api()?.toolboxWatchStop?.(); }, []);

  const toggle = async () => {
    if (watching) { await api()?.toolboxWatchStop?.(); setWatching(false); return; }
    if (!folder) return;
    const r = await api()?.toolboxWatchStart?.({ folder, action, opts: { format: imgFmt } });
    if (r?.ok) setWatching(true);
  };

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
      <p className="text-sm text-gray-400">{t("Choisis un dossier : chaque nouveau fichier déposé sera converti automatiquement dans un sous-dossier « orbit-out ».")}</p>
      <button onClick={async () => { const p = await api()?.toolboxPickFolder?.(); if (p) setFolder(p); }} disabled={watching} className="w-full py-3 rounded-xl border-2 border-dashed border-white/15 hover:border-pink-500/40 transition-all flex items-center justify-center gap-2 text-sm text-gray-300 disabled:opacity-40"><FolderOpen className="w-4 h-4" /> {folder || t("Choisir un dossier")}</button>
      <div>
        <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Action automatique")}</label>
        <GlassSelect value={action} onChange={setAction} className="mt-1" ariaLabel={t("Action")} options={[
          { value: "to-mp4", label: t("Vidéos → MP4 (H.264)") },
          { value: "to-mp3", label: t("Vidéos → MP3") },
          { value: "to-image", label: t("Images → autre format") },
        ]} />
      </div>
      {action === "to-image" && (
        <div>
          <label className="text-[10px] text-gray-500 uppercase font-semibold">{t("Format image")}</label>
          <GlassSelect value={imgFmt} onChange={setImgFmt} className="mt-1" ariaLabel={t("Format image")} options={[{ value: "webp", label: "WEBP" }, { value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }, { value: "avif", label: "AVIF" }]} />
        </div>
      )}
      <button onClick={toggle} disabled={!folder} className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: watching ? "linear-gradient(135deg,#ef4444,#b91c1c)" : "linear-gradient(135deg,#e879f9,#a855f7)" }}>
        {watching ? <><Square className="w-4 h-4" /> {t("Arrêter la surveillance")}</> : <><Play className="w-4 h-4" /> {t("Démarrer la surveillance")}</>}
      </button>
      {watching && <div className="flex items-center gap-2 text-xs text-emerald-300"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {t("Surveillance active…")}</div>}
      {log.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {log.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-white/[0.03]">
              {l.type === "done" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : l.type === "error" ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : <Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin" />}
              <span className="text-gray-300 truncate">{l.file}</span>
              <span className="text-gray-600 ml-auto">{l.type === "done" ? t("converti") : l.type === "error" ? t("erreur") : t("en cours")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
