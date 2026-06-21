import { useEffect, useRef, useState } from 'react';
import {
  Download, Bot, Sparkles, Video, Zap, Cpu, Monitor,
  Loader2, Check, RefreshCw, AlertCircle, ExternalLink,
} from 'lucide-react';
import { t } from '@/i18n';

type Status = { installed?: boolean; partial?: boolean; ready?: boolean; version?: string; detail?: string; models?: any[]; reason?: string };
type Prog = { label?: string; percent?: number };

type Mod = {
  id: string;
  name: string;
  desc: string;
  icon: any;
  external?: boolean;            // licensed/3rd-party, status only (no install button)
  actionLabel: (s: Status) => string;
  detect: (api: any) => Promise<Status>;
  install?: (api: any, s: Status) => Promise<any>;
  subscribe?: (api: any, cb: (p: Prog) => void) => (() => void) | undefined;
};

const MODULES: Mod[] = [
  {
    id: 'ytdlp',
    name: 'yt-dlp',
    desc: t("Moteur de téléchargement (YouTube et 1000+ sites)"),
    icon: Download,
    actionLabel: () => t("Mettre à jour"),
    detect: async () => ({ installed: true }),
    install: (api) => api.updateYtdlp?.(),
  },
  {
    id: 'llm',
    name: t("IA locale (Assistant)"),
    desc: t("Modèle de langage hors-ligne, sans clé (~2 Go)"),
    icon: Bot,
    actionLabel: (s) => s.installed ? t("Réinstaller") : t("Installer"),
    detect: (api) => api.llmStatus?.() ?? Promise.resolve({}),
    install: (api) => api.llmInstall?.(),
    subscribe: (api, cb) => api.onLlmProgress?.((d: any) => cb({ label: d.stage, percent: d.percent })),
  },
  {
    id: 'enhance',
    name: t("Amélioration IA (Real-ESRGAN + RIFE)"),
    desc: t("Upscale et interpolation de fluidité"),
    icon: Sparkles,
    actionLabel: (s) => s.installed ? t("Réinstaller") : t("Installer"),
    detect: async (api) => {
      const d = await api.enhanceDetect?.();
      if (!d) return {};
      return { installed: !!(d.esrganInstalled && d.rifeInstalled), partial: !!(d.esrganInstalled || d.rifeInstalled) };
    },
    install: (api) => api.enhanceInstall?.(),
    subscribe: (api, cb) => api.onEnhanceProgress?.((d: any) => { if (d.id === 'install') cb({ label: d.log }); }),
  },
  {
    id: 'handbrake',
    name: 'HandBrake',
    desc: t("Compression et conversion vidéo avancée"),
    icon: Video,
    actionLabel: (s) => s.installed ? t("Réinstaller") : t("Installer"),
    detect: (api) => api.hbDetect?.() ?? Promise.resolve({}),
    install: (api) => api.hbInstall?.(),
    subscribe: (api, cb) => api.onHbProgress?.((d: any) => { if (d.id === 'install') cb({ label: d.log }); }),
  },
  {
    id: 'inpaint',
    name: t("Gomme magique IA (LaMa)"),
    desc: t("Suppression d'objets sur les images"),
    icon: Zap,
    actionLabel: (s) => s.installed ? t("Réinstaller") : t("Installer"),
    detect: (api) => api.inpaintDetect?.() ?? Promise.resolve({}),
    install: (api) => api.inpaintInstall?.(),
    subscribe: (api, cb) => api.onInpaintProgress?.((d: any) => cb({ label: d.stage })),
  },
  {
    id: 'matting',
    name: t("Détourage IA (Robust Video Matting)"),
    desc: t("Suppression de fond sur les vidéos"),
    icon: Cpu,
    actionLabel: (s) => s.installed ? t("Réinstaller") : t("Installer"),
    detect: async (api) => {
      const d = await api.mattingDetect?.();
      if (!d) return {};
      return { installed: !!d.models?.some((m: any) => m.installed), models: d.models };
    },
    install: (api, s) => api.mattingInstall?.(s.models?.[0]?.key || 'mobilenetv3'),
    subscribe: (api, cb) => api.onMattingProgress?.((d: any) => { if (d.id === 'install') cb({ label: d.log }); }),
  },
  {
    id: 'topaz',
    name: 'Topaz Video AI',
    desc: t("Logiciel sous licence — détecté automatiquement"),
    icon: Monitor,
    external: true,
    actionLabel: () => '',
    detect: (api) => api.topazDetect?.() ?? Promise.resolve({}),
  },
];

export default function ModulesPanel({ electronAPI }: { electronAPI?: any }) {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const progRef = useRef(setProg); progRef.current = setProg;

  const detectOne = async (m: Mod) => {
    try { const s = await m.detect(electronAPI); setStatus(prev => ({ ...prev, [m.id]: s || {} })); }
    catch { setStatus(prev => ({ ...prev, [m.id]: {} })); }
  };

  const refreshAll = async () => {
    if (!electronAPI) return;
    setRefreshing(true);
    await Promise.all(MODULES.map(detectOne));
    setRefreshing(false);
  };

  useEffect(() => {
    refreshAll();
    const offs = MODULES.map(m => m.subscribe?.(electronAPI, (p) => setProg(prev => ({ ...prev, [m.id]: { ...prev[m.id], ...p } })))).filter(Boolean) as (() => void)[];
    return () => offs.forEach(off => { try { off(); } catch {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electronAPI]);

  const handleInstall = async (m: Mod) => {
    if (!m.install || busy) return;
    setBusy(m.id);
    setErrors(prev => { const n = { ...prev }; delete n[m.id]; return n; });
    setProg(prev => ({ ...prev, [m.id]: { label: t("Préparation…") } }));
    try {
      const r = await m.install(electronAPI, status[m.id] || {});
      if (r && r.ok === false) setErrors(prev => ({ ...prev, [m.id]: r.error || t("Échec de l'installation") }));
      if (r && r.success === false) setErrors(prev => ({ ...prev, [m.id]: r.message || t("Échec de l'installation") }));
      await detectOne(m);
    } catch (e: any) {
      setErrors(prev => ({ ...prev, [m.id]: (e && e.message) || String(e) }));
    } finally {
      setBusy(null);
      setProg(prev => { const n = { ...prev }; delete n[m.id]; return n; });
    }
  };

  const badge = (m: Mod, s: Status) => {
    if (m.external) {
      return s.installed
        ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-300">{t("Détecté")}{s.version ? ` · v${s.version}` : ''}</span>
        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-gray-400">{t("Non détecté")}</span>;
    }
    if (s.installed) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-300">{t("Installé")}</span>;
    if (s.partial) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">{t("Partiel")}</span>;
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-gray-400">{t("Non installé")}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-gray-500 max-w-md">{t("Gère les moteurs et modèles d'IA d'Orbit. Chaque module est téléchargé une seule fois et tourne sur ta machine.")}</p>
        <button onClick={refreshAll} disabled={refreshing} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> {t("Actualiser")}
        </button>
      </div>

      <div className="space-y-2.5">
        {MODULES.map(m => {
          const s = status[m.id] || {};
          const p = prog[m.id];
          const isBusy = busy === m.id;
          const err = errors[m.id];
          const Icon = m.icon;
          return (
            <div key={m.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><p className="text-sm font-semibold text-gray-100 truncate">{m.name}</p>{badge(m, s)}</div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">{m.desc}</p>
                </div>
                <div className="shrink-0">
                  {m.external ? (
                    <button onClick={() => electronAPI?.openExternalUrl?.('https://www.topazlabs.com/topaz-video-ai')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5"><ExternalLink className="w-4 h-4" /> {t("Site")}</button>
                  ) : (
                    <button onClick={() => handleInstall(m)} disabled={isBusy || (!!busy && !isBusy)} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5 disabled:opacity-50 min-w-[120px] justify-center">
                      {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : s.installed ? <RefreshCw className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                      {isBusy ? t("En cours…") : m.actionLabel(s)}
                    </button>
                  )}
                </div>
              </div>

              {isBusy && p && (
                <div className="mt-3">
                  {typeof p.percent === 'number' ? (
                    <>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span className="truncate">{p.label}</span><span>{p.percent}%</span></div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${p.percent}%`, background: 'var(--accent,#ec4899)' }} /></div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full w-1/3 rounded-full animate-pulse" style={{ background: 'var(--accent,#ec4899)' }} /></div>
                      <span className="truncate max-w-[60%]">{p.label}</span>
                    </div>
                  )}
                </div>
              )}

              {err && !isBusy && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-400"><AlertCircle className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{err}</span></div>
              )}
              {!isBusy && !err && status[m.id] === undefined && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> {t("Vérification…")}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
