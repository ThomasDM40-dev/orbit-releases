import { useState, useEffect, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ListChecks, X, Loader2, CheckCircle2, AlertTriangle, FolderOpen } from "lucide-react";
import { subscribeTasks, getTasks, clearFinished, type Task } from "@/tasks";
import { t } from "@/i18n";

const api = () => (window as any).electronAPI;

export default function TaskCenter() {
  const tasks = useSyncExternalStore(subscribeTasks, getTasks, getTasks);
  const [open, setOpen] = useState(false);
  const running = tasks.filter(t => t.status === "running").length;

  // Auto-open the panel the first time a task starts, so progress is visible.
  useEffect(() => {
    if (running > 0) setOpen(true);
  }, [running > 0]);

  if (tasks.length === 0) return null;

  return (
    <>
      {/* Floating button (bottom-left, opposite the AI button) */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 left-6 h-12 px-4 rounded-2xl flex items-center gap-2 text-white z-40 transition-all hover:scale-105 active:scale-95"
        style={{
          background: running ? "linear-gradient(135deg,#e879f9,#a855f7)" : "rgba(20,20,30,0.85)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          backdropFilter: "blur(12px)",
        }}
        title={t("Centre de tâches")}
      >
        {running > 0 ? <Loader2 className="w-5 h-5 animate-spin" /> : <ListChecks className="w-5 h-5" />}
        <span className="text-sm font-semibold">{running > 0 ? `${running} ${t("en cours")}` : t("Tâches")}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-20 left-6 z-40 w-80 rounded-2xl overflow-hidden flex flex-col"
            style={{
              background: "rgba(15,15,25,0.95)",
              backdropFilter: "blur(24px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <span className="text-sm font-semibold text-gray-200 flex items-center gap-2"><ListChecks className="w-4 h-4 text-pink-400" /> {t("Centre de tâches")}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => clearFinished()} className="text-[11px] text-gray-500 hover:text-gray-300">{t("Nettoyer")}</button>
                <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-200"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1.5">
              {tasks.map(task => <TaskRow key={task.id} task={task} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <div className="bg-white/[0.04] border border-white/8 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1">
        {task.status === "running" ? <Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin shrink-0" />
          : task.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          : <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        <span className="text-xs text-gray-200 truncate flex-1">{task.title}</span>
        <span className="text-[10px] text-gray-600 shrink-0">{task.tool}</span>
      </div>
      {task.status === "running" && (
        task.indeterminate ? (
          <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full w-1/3 rounded-full os-indeterminate" style={{ background: "linear-gradient(90deg,#e879f9,#a855f7)" }} /></div>
        ) : (
          <div className="h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: task.percent + "%", background: "linear-gradient(90deg,#e879f9,#a855f7)" }} /></div>
        )
      )}
      {task.status === "error" && <p className="text-[10px] text-red-400/80 break-all mt-0.5">{task.error}</p>}
      {task.status === "done" && task.outputPath && (
        <div className="flex gap-2 mt-1">
          <button onClick={() => api()?.openFile?.(task.outputPath)} className="text-[10px] text-gray-400 hover:text-pink-300 flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {t("Ouvrir")}</button>
          <button onClick={() => api()?.showItemInFolder?.(task.outputPath)} className="text-[10px] text-gray-400 hover:text-pink-300 flex items-center gap-1"><FolderOpen className="w-3 h-3" /> {t("Dossier")}</button>
        </div>
      )}
    </div>
  );
}
