import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Shown at launch when an Orbit and/or bundled-tool (yt-dlp) update is available.
export default function UpdatePrompt() {
  const electron = (window as any).electronAPI;
  const [appUpdate, setAppUpdate] = useState<{ version?: string } | null>(null);
  const [ytdlp, setYtdlp] = useState<{ current: string; latest: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<'ask' | 'working' | 'ready'>('ask');
  const [percent, setPercent] = useState(0);
  const [toolMsg, setToolMsg] = useState('');
  const dismissed = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    if (!electron || started.current) return; started.current = true;
    electron.onUpdaterStatus?.((d: any) => {
      if (d.type === 'available') { setAppUpdate({ version: d.version }); if (!dismissed.current) setOpen(true); }
      else if (d.type === 'downloading') { setPhase('working'); setPercent(d.percent || 0); }
      else if (d.type === 'ready') { setPhase('ready'); setPercent(100); }
    });
    electron.checkForUpdate?.();
    electron.checkToolUpdates?.().then((r: any) => { if (r?.ytdlp?.outdated) { setYtdlp(r.ytdlp); if (!dismissed.current) setOpen(true); } }).catch(() => {});
  }, [electron]);

  if (!open) return null;

  const updateAll = async () => {
    setPhase('working');
    if (appUpdate) electron.startUpdateDownload?.();
    if (ytdlp) {
      setToolMsg('🔧 Mise à jour de yt-dlp…');
      const res = await electron.updateYtdlp?.().catch(() => null);
      setToolMsg(res?.success ? '✓ yt-dlp à jour' : '⚠ yt-dlp : ' + (res?.message || 'échec'));
      setYtdlp(null);
      // If there was no app update, we're done after tools.
      if (!appUpdate) setTimeout(() => setOpen(false), 1800);
    }
  };
  const later = () => { dismissed.current = true; setOpen(false); };
  const install = () => electron.installUpdate?.();

  const items: { icon: string; name: string; detail: string }[] = [];
  if (appUpdate) items.push({ icon: '🚀', name: `Orbit ${appUpdate.version ? 'v' + appUpdate.version : ''}`, detail: 'Nouvelle version de l\'application' });
  if (ytdlp) items.push({ icon: '🌐', name: 'yt-dlp', detail: `${ytdlp.current} → ${ytdlp.latest || 'dernière'}` });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
        <motion.div initial={{ scale: 0.94, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden" style={{ background: 'rgba(15,15,22,0.97)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}>
          {/* Header */}
          <div className="px-6 pt-6 pb-4 text-center relative" style={{ background: 'radial-gradient(ellipse at 50% -20%, color-mix(in srgb, var(--accent,#ec4899) 22%, transparent), transparent 70%)' }}>
            <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-3" style={{ background: 'color-mix(in srgb, var(--accent,#ec4899) 18%, transparent)', border: '1px solid color-mix(in srgb, var(--accent,#ec4899) 40%, transparent)' }}>✨</div>
            <h2 className="text-lg font-bold text-white">Mise à jour disponible</h2>
            <p className="text-xs text-gray-400 mt-1">{phase === 'ready' ? 'Téléchargée — prête à installer' : phase === 'working' ? 'Mise à jour en cours…' : 'Souhaitez-vous mettre à jour maintenant ?'}</p>
          </div>

          {/* Items */}
          <div className="px-6 py-3 space-y-2">
            {items.length === 0 && phase !== 'ask' && <p className="text-center text-sm text-gray-400 py-2">{toolMsg || 'Traitement…'}</p>}
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
                <span className="text-2xl">{it.icon}</span>
                <div className="flex-1 min-w-0"><p className="text-sm text-gray-200 font-medium">{it.name}</p><p className="text-[11px] text-gray-500">{it.detail}</p></div>
                {phase === 'working' && it.icon === '🚀' && <span className="text-[11px] font-mono text-gray-300">{percent}%</span>}
              </div>
            ))}

            {phase === 'working' && appUpdate && (
              <div className="h-2 bg-white/10 rounded-full overflow-hidden mt-1"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: 'var(--accent,#ec4899)' }} /></div>
            )}
            {toolMsg && phase === 'working' && <p className="text-[11px] text-gray-400 text-center">{toolMsg}</p>}
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 pt-2 flex gap-2">
            {phase === 'ready' ? (
              <button onClick={install} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>🔄 Redémarrer & installer</button>
            ) : phase === 'working' ? (
              <button disabled className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white opacity-70" style={{ background: 'var(--accent,#ec4899)' }}>⏳ En cours…</button>
            ) : (
              <>
                <button onClick={later} className="px-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10">Plus tard</button>
                <button onClick={updateAll} className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent,#ec4899) 90%, white) , var(--accent,#ec4899))', boxShadow: '0 6px 20px color-mix(in srgb, var(--accent,#ec4899) 40%, transparent)' }}>⬆️ Mettre à jour</button>
              </>
            )}
          </div>
          {phase === 'ready' && <button onClick={() => setOpen(false)} className="w-full pb-4 text-[11px] text-gray-500 hover:text-gray-300">Installer au prochain démarrage</button>}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
