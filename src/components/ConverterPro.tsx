import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Repeat, FileVideo, FileAudio, Image as ImageIcon, Palette, Type, FileText, Box, Sparkles, UploadCloud, FolderOpen, Loader2, CheckCircle2, AlertTriangle, X, ArrowRight, FolderInput } from "lucide-react";
import GlassSelect from "./GlassSelect";
import { t } from "@/i18n";
import { addRecent, notifyDone } from "@/recents";
import { startTask, updateTask, finishTask } from "@/tasks";

const api = () => (window as any).electronAPI;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

type AeInfo = { kind?: string; effectCount?: number; thirdParty?: string[]; error?: string };
type Detected = { path: string; name: string; category: string | null; label: string | null; targets: string[]; enabled: boolean; ae?: AeInfo };
type Row = Detected & { id: string; target: string; status: "idle" | "running" | "done" | "error"; percent: number; outputPath?: string; error?: string };

const CAT_ICON: Record<string, any> = { video: FileVideo, audio: FileAudio, image: ImageIcon, lut: Palette, font: Type, doc: FileText, model: Box, ae: Sparkles };
const CAT_COLOR: Record<string, string> = { video: "#60a5fa", audio: "#f472b6", image: "#a78bfa", lut: "#34d399", font: "#fbbf24", doc: "#fb923c", model: "#22d3ee", ae: "#e879f9" };

export default function ConverterPro() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outputDir, setOutputDir] = useState<string>("");
  const [aeList, setAeList] = useState<{ name: string; version: string; exe: string; versionCode?: number }[]>([]);
  const [aeExe, setAeExe] = useState<string>("");
  const [yearCodes, setYearCodes] = useState<Record<string, number>>({});
  const [compatSel, setCompatSel] = useState<Record<string, number>>({});
  const curRef = useRef<string>("");

  useEffect(() => {
    api()?.aeDetect?.().then((l: any) => { setAeList(l || []); if (l && l.length) setAeExe(l[0].exe); }).catch(() => {});
    api()?.aeYearCodes?.().then((m: any) => setYearCodes(m || {})).catch(() => {});
  }, []);

  // Compatibility targets: installed AE (exact codes) + static year map fallback.
  const compatTargets = (() => {
    const m = new Map<string, { label: string; code: number }>();
    aeList.forEach(a => { if (a.versionCode) m.set("AE " + a.version, { label: "AE " + a.version, code: a.versionCode }); });
    Object.entries(yearCodes).forEach(([y, c]) => { const label = "AE " + y; if (![...m.keys()].some(k => k.includes(y))) m.set(label, { label, code: c as number }); });
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
  })();

  const runCompat = async (row: Row) => {
    const code = compatSel[row.id] ?? compatTargets[0]?.code;
    if (code == null) return;
    const tgt = compatTargets.find(t => t.code === code);
    const dir = outputDir || row.path.replace(/[\\/][^\\/]*$/, "");
    const baseName = row.name.replace(/\.[^.]+$/, "");
    const ext = (row.name.match(/\.[^.]+$/) || [".ffx"])[0];
    const out = `${dir}\\${baseName}_${(tgt?.label || "compat").replace(/\s/g, "")}${ext}`;
    const jobId = row.id; curRef.current = jobId;
    setRows(prev => prev.map(r => r.id === jobId ? { ...r, status: "running", percent: 50 } : r));
    startTask(jobId, `${baseName} → ${tgt?.label || "compat"}`, t("Compatibilité AE"));
    const r = await api()?.aeConvertVersion?.({ inputPath: row.path, outputPath: out, code });
    finishTask(jobId, !!r?.ok, r?.outputPath, r?.error);
    if (r?.ok && r.outputPath) addRecent(r.outputPath, t("Compatibilité AE"));
    setRows(prev => prev.map(x => x.id === jobId ? { ...x, status: r?.ok ? "done" : "error", percent: 100, outputPath: r?.outputPath, error: r?.error } : x));
  };

  const runAe = async (row: Row, op: string) => {
    if (!aeExe) return;
    const dir = outputDir || row.path.replace(/[\\/][^\\/]*$/, "");
    const baseName = row.name.replace(/\.[^.]+$/, "");
    const out = `${dir}\\${baseName}${op === "upgrade-aep" ? "_maj" : "_applique"}.aep`;
    const jobId = row.id; curRef.current = jobId;
    setRows(prev => prev.map(r => r.id === jobId ? { ...r, status: "running", percent: 10 } : r));
    startTask(jobId, `${baseName} (After Effects)`, t("After Effects"));
    const r = await api()?.aeRun?.({ jobId, aeExe, op, inputPath: row.path, outputPath: out });
    finishTask(jobId, !!r?.ok, r?.outputPath, r?.error);
    if (r?.ok && r.outputPath) addRecent(r.outputPath, t("After Effects"));
    setRows(prev => prev.map(x => x.id === jobId ? { ...x, status: r?.ok ? "done" : "error", percent: 100, outputPath: r?.outputPath, error: r?.error } : x));
  };

  useEffect(() => {
    const off = api()?.onConvertproProgress?.((v: any) => {
      if (v.jobId !== curRef.current) return;
      setRows(prev => prev.map(r => r.id === v.jobId ? { ...r, percent: v.percent ?? 0 } : r));
      updateTask(v.jobId, v.percent ?? 0, v.label);
    });
    return () => { off?.(); };
  }, []);

  const addPaths = async (paths: string[]) => {
    if (!paths.length) return;
    const detected: Detected[] = await api()?.convertproDetect?.(paths) || [];
    setRows(prev => {
      const existing = new Set(prev.map(r => r.path));
      const fresh = detected.filter(d => d.category && !existing.has(d.path))
        .map(d => ({ ...d, id: uid(), target: d.targets[0] || "", status: "idle" as const, percent: 0 }));
      return [...prev, ...fresh];
    });
  };

  // Drag & drop (self-contained: stop propagation so the global AI overlay doesn't grab it).
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const items = Array.from(e.dataTransfer.items || []);
    const files = Array.from(e.dataTransfer.files || []);
    const direct: string[] = [];
    const folderPromises: Promise<string[]>[] = [];
    items.forEach((it, i) => {
      const entry = (it as any).webkitGetAsEntry?.();
      const p = (files[i] as any)?.path;
      if (!p) return;
      if (entry?.isDirectory) folderPromises.push(api()?.convertproScan?.(p));
      else direct.push(p);
    });
    const scanned = (await Promise.all(folderPromises)).flat().filter(Boolean);
    await addPaths([...direct, ...scanned]);
  };

  const browseFiles = async () => { const ps = await api()?.toolboxPickAny?.(); if (ps?.length) addPaths(ps); };
  const browseFolder = async () => { const f = await api()?.toolboxPickFolder?.(); if (f) { const ps = await api()?.convertproScan?.(f); addPaths(ps || []); } };
  const pickOut = async () => { const d = await api()?.selectDirectory?.(); if (d) setOutputDir(d); };

  const setTarget = (id: string, target: string) => setRows(prev => prev.map(r => r.id === id ? { ...r, target } : r));
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  // Apply a target to every row of the same category (e.g. all videos → mp4).
  const applyToCategory = (cat: string, target: string) =>
    setRows(prev => prev.map(r => r.category === cat && r.targets.includes(target) ? { ...r, target } : r));

  const convertAll = async () => {
    const todo = rows.filter(r => r.enabled && r.target && r.status !== "done");
    if (!todo.length) return;
    setBusy(true);
    for (const row of todo) {
      const jobId = row.id; curRef.current = jobId;
      setRows(prev => prev.map(r => r.id === jobId ? { ...r, status: "running", percent: 0 } : r));
      startTask(jobId, `${row.name} → ${row.target.toUpperCase()}`, t("Convertisseur Pro"));
      const r = await api()?.convertproRun?.({ jobId, inputPath: row.path, target: row.target, outputDir: outputDir || undefined });
      finishTask(jobId, !!r?.ok, r?.outputPath, r?.error);
      if (r?.ok && r.outputPath) addRecent(r.outputPath, t("Convertisseur Pro"));
      setRows(prev => prev.map(x => x.id === jobId ? { ...x, status: r?.ok ? "done" : "error", percent: 100, outputPath: r?.outputPath, error: r?.error } : x));
    }
    setBusy(false);
    const ok = rows.filter(r => r.status === "done").length;
    notifyDone(t("Orbit — conversions terminées"), `${todo.length} ${t("fichier(s)")}`);
  };

  const cats = Array.from(new Set(rows.map(r => r.category).filter(Boolean))) as string[];
  const convertible = rows.filter(r => r.enabled).length;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent-border)" }}>
            <Repeat className="w-5 h-5" style={{ color: "var(--accent-strong)" }} />
          </span>
          <div>
            <h2 className="text-xl font-bold os-text-gradient">{t("Convertisseur Pro")}</h2>
            <p className="text-xs text-gray-500">{t("Glissez fichiers ou dossiers. Détection auto, qualité adaptative, conversion par lot.")}</p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
          onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); }}
          onDrop={onDrop}
          className="rounded-2xl p-8 flex flex-col items-center justify-center transition-all mb-4"
          style={{
            background: dragging ? "rgba(236,72,153,0.1)" : "rgba(255,255,255,0.03)",
            border: dragging ? "2px dashed rgba(236,72,153,0.6)" : "2px dashed rgba(255,255,255,0.15)",
          }}
        >
          <UploadCloud className={`w-10 h-10 mb-3 ${dragging ? "text-pink-400" : "text-gray-400"}`} />
          <p className="text-sm text-gray-200 font-semibold">{t("Glissez-déposez des fichiers ou des dossiers")}</p>
          <p className="text-xs text-gray-500 mt-1">{t("Vidéo · Audio · Image · LUT — détection automatique")}</p>
          <div className="flex gap-2 mt-4">
            <button onClick={browseFiles} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white transition-all" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}><FolderOpen className="w-4 h-4" /> {t("Fichiers")}</button>
            <button onClick={browseFolder} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-300 hover:text-white transition-all" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)" }}><FolderInput className="w-4 h-4" /> {t("Dossier")}</button>
          </div>
        </div>

        {rows.length > 0 && (
          <>
            {/* Output dir + bulk per-category + convert */}
            <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
              <button onClick={pickOut} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10"><FolderInput className="w-3.5 h-3.5 text-pink-400" /> {t("Dossier de sortie")}</button>
              <span className="text-gray-500 truncate max-w-[40%]">{outputDir || t("Même dossier que la source")}</span>
              {outputDir && <button onClick={() => setOutputDir("")} className="text-gray-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>}
              <button onClick={() => setRows([])} className="ml-auto text-gray-500 hover:text-red-400">{t("Tout effacer")}</button>
            </div>

            {/* Per-category bulk target */}
            {cats.map(cat => {
              const sample = rows.find(r => r.category === cat);
              if (!sample?.enabled || !sample.targets.length) return null;
              return (
                <div key={cat} className="flex items-center gap-2 mb-2 text-xs">
                  <span className="text-gray-500">{t("Tous les")} {t(sample.label || cat)} →</span>
                  <div className="w-40"><GlassSelect value={sample.target} onChange={v => applyToCategory(cat, v)} className="py-1 text-xs" ariaLabel={t("Format")} options={sample.targets.map(x => ({ value: x, label: x.toUpperCase() }))} /></div>
                </div>
              );
            })}

            {/* After Effects bridge bar */}
            {rows.some(r => r.category === "ae") && (
              aeList.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  <span className="text-gray-500">{t("After Effects :")}</span>
                  <div className="w-40"><GlassSelect value={aeExe} onChange={setAeExe} className="py-1 text-xs" ariaLabel="After Effects" options={aeList.map(a => ({ value: a.exe, label: "AE " + a.version }))} /></div>
                  <span className="text-gray-600">{t("(« Compatible » est instantané ; « Maj AE » ouvre After Effects)")}</span>
                </div>
              ) : (
                <p className="text-xs text-amber-400/80 mb-2">{t("After Effects non détecté — seule l'analyse des presets est disponible.")}</p>
              )
            )}

            {/* Rows */}
            <div className="space-y-2 mt-3">
              <AnimatePresence>
                {rows.map(row => {
                  const Icon = CAT_ICON[row.category || ""] || FileText;
                  const color = CAT_COLOR[row.category || ""] || "#9ca3af";
                  return (
                    <motion.div key={row.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${row.status === "done" ? "border-emerald-500/30" : row.status === "error" ? "border-red-500/30" : "border-white/8"}`}
                      style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "22" }}><Icon className="w-4.5 h-4.5" style={{ color }} /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-200 truncate">{row.name}</p>
                        {row.status === "running" ? (
                          <div className="h-1 mt-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: row.percent + "%", background: "linear-gradient(90deg,#e879f9,#a855f7)" }} /></div>
                        ) : row.status === "error" ? (
                          <p className="text-[11px] text-red-400 truncate">{row.error}</p>
                        ) : row.category === "ae" && row.ae ? (
                          <p className="text-[11px] text-gray-500 truncate">
                            {row.ae.error ? row.ae.error : <>{row.ae.kind} · {row.ae.effectCount} {t("effets")}{row.ae.thirdParty && row.ae.thirdParty.length > 0 && <span className="text-amber-400/80"> · {t("plugins requis :")} {row.ae.thirdParty.join(", ")}</span>}</>}
                          </p>
                        ) : (
                          <p className="text-[11px] text-gray-600">{t(row.label || "")}</p>
                        )}
                      </div>

                      {row.category === "ae" ? (
                        row.status === "done" || row.status === "error" ? (
                          <span className="text-[10px] text-cyan-400/80 shrink-0 text-right">{t("analyse ✓")}</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end max-w-[55%]">
                            {compatTargets.length > 0 && (
                              <>
                                <span className="text-[10px] text-gray-500">{t("compatible")}</span>
                                <div className="w-24"><GlassSelect value={String(compatSel[row.id] ?? compatTargets[0]?.code)} onChange={v => setCompatSel(p => ({ ...p, [row.id]: Number(v) }))} disabled={row.status === "running"} className="py-1 text-xs" ariaLabel={t("Version cible")} options={compatTargets.map(tg => ({ value: String(tg.code), label: tg.label }))} /></div>
                                <button onClick={() => runCompat(row)} disabled={row.status === "running"} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white border border-white/10 disabled:opacity-40" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}>{t("Convertir")}</button>
                              </>
                            )}
                            {aeExe && /\.aep$/i.test(row.name) && <button onClick={() => runAe(row, "upgrade-aep")} disabled={row.status === "running"} className="px-2 py-1 rounded-lg text-[11px] bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 disabled:opacity-40" title={t("Ouvre After Effects pour normaliser le projet")}>{t("Maj AE")}</button>}
                          </div>
                        )
                      ) : row.enabled ? (
                        <>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-gray-600 uppercase">{row.target ? "" : ""}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-600" />
                            <div className="w-28"><GlassSelect value={row.target} onChange={v => setTarget(row.id, v)} disabled={row.status === "running"} className="py-1 text-xs" ariaLabel={t("Format de sortie")} options={row.targets.map(x => ({ value: x, label: x.toUpperCase() }))} /></div>
                          </div>
                        </>
                      ) : (
                        <span className="text-[10px] text-amber-400/80 shrink-0">{t("bientôt")}</span>
                      )}

                      <div className="w-5 shrink-0 flex justify-center">
                        {row.status === "done" ? <button onClick={() => api()?.openFile?.(row.outputPath)} title={t("Ouvrir")}><CheckCircle2 className="w-4 h-4 text-emerald-400" /></button>
                          : row.status === "running" ? <Loader2 className="w-4 h-4 text-pink-400 animate-spin" />
                          : row.status === "error" ? <AlertTriangle className="w-4 h-4 text-red-400" />
                          : <button onClick={() => removeRow(row.id)} className="text-gray-600 hover:text-red-400"><X className="w-4 h-4" /></button>}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <button onClick={convertAll} disabled={busy || convertible === 0} className="w-full mt-4 py-3 rounded-xl font-semibold text-white transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: "linear-gradient(135deg,#e879f9,#a855f7)" }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
              {busy ? t("Conversion en cours…") : t("Convertir %n fichier(s)").replace("%n", String(convertible))}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
