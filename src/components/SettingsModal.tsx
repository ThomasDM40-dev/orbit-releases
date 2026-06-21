import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Settings as SettingsIcon, Download, Palette, Monitor, Cpu, Globe, Info,
  Folder, FolderOpen, Check, Loader2, Trash2, Bell, Rocket, X, FileText, ExternalLink, Bot, Boxes
} from 'lucide-react';
import ChangelogModal from './ChangelogModal';
import ModulesPanel from './ModulesPanel';
import GlassSelect from './GlassSelect';
import { t, LANGS, type Lang } from '@/i18n';

type SettingsModalProps = {
  onClose: () => void;
  language: Lang;
  settings: any;
  saveSettings: (s: any) => void;
  handleLanguageChange: (lang: Lang) => void;
  electronAPI?: any;
};

const ACCENTS = [
  { id: 'pink', c: '#ec4899' }, { id: 'purple', c: '#a855f7' }, { id: 'blue', c: '#3b82f6' },
  { id: 'cyan', c: '#22d3ee' }, { id: 'green', c: '#22c55e' }, { id: 'orange', c: '#f97316' }, { id: 'red', c: '#ef4444' },
];
const THEMES = [
  { id: 'dark', name: 'Sombre', bg: '#0e0e14', fg: '#e5e7eb' },
  { id: 'amoled', name: 'AMOLED', bg: '#000000', fg: '#e5e7eb' },
  { id: 'midnight', name: 'Minuit', bg: '#0b1220', fg: '#c7d2fe' },
  { id: 'light', name: 'Clair', bg: '#f4f4f7', fg: '#1a1a1a' },
];

// ── reusable controls ──
const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (c: boolean) => void }) => (
  <button onClick={() => onChange(!checked)} className="relative shrink-0 w-11 h-6 rounded-full transition-all duration-300"
    style={{ background: checked ? 'var(--accent, #ec4899)' : 'rgba(255,255,255,0.14)', boxShadow: checked ? '0 0 12px color-mix(in srgb, var(--accent, #ec4899) 50%, transparent)' : 'none' }}>
    <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300" style={{ left: checked ? 'calc(100% - 22px)' : '2px' }} />
  </button>
);
const Card = ({ title, icon, children }: any) => (
  <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-1.5 mb-4">
    {title && <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">{icon}{title}</div>}
    <div>{children}</div>
  </div>
);
const Row = ({ title, desc, children }: any) => (
  <div className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-xl hover:bg-white/[0.03] transition-colors">
    <div className="min-w-0"><p className="text-sm text-gray-200">{title}</p>{desc && <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>}</div>
    <div className="shrink-0">{children}</div>
  </div>
);
const INPUT = "bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none focus:border-white/30 transition-all";

export default function SettingsModal({ onClose, language, settings, saveSettings, handleLanguageChange, electronAPI }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [appVersion, setAppVersion] = useState('');
  const [showChangelog, setShowChangelog] = useState(false);
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = useState<{ version?: string; percent?: number; message?: string }>({});
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [proxyTest, setProxyTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [gpuList, setGpuList] = useState<{ id: string; name: string }[]>([]);
  const [llm, setLlm] = useState<{ installed?: boolean }>({});
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmProg, setLlmProg] = useState<{ stage?: string; percent?: number } | null>(null);

  const update = (key: string, value: any) => saveSettings({ ...settings, [key]: value });

  useEffect(() => {
    electronAPI?.llmStatus?.().then((s: any) => s && setLlm(s)).catch(() => {});
    const off = electronAPI?.onLlmProgress?.((d: any) => setLlmProg(d));
    return () => { if (off) off(); };
  }, [electronAPI]);
  const installLlm = async () => {
    setLlmBusy(true); setLlmProg({ stage: t('Préparation…'), percent: 0 });
    const r = await electronAPI?.llmInstall?.().catch((e: any) => ({ ok: false, error: String(e) }));
    setLlmBusy(false); setLlmProg(null);
    if (r?.ok) setLlm({ installed: true });
  };

  useEffect(() => {
    if (!electronAPI) return;
    electronAPI.getAppVersion?.().then((v: string) => setAppVersion(v));
    electronAPI.onUpdaterStatus?.((data: any) => { setUpdateState(data.type); setUpdateInfo(data); });
    electronAPI.getCacheSize?.().then((b: number) => setCacheSize(b));
    electronAPI.enhanceGpus?.().then((g: any) => { if (g) setGpuList(g); });
    electronAPI.getLaunchAtStartup?.().then((v: boolean) => { if (v !== settings.launchAtStartup) saveSettings({ ...settings, launchAtStartup: v }); });
  }, [electronAPI]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleDirSelect = async (key: string) => { const dir = await electronAPI?.selectDirectory?.(); if (dir) update(key, dir); };
  const handleLaunch = (v: boolean) => { update('launchAtStartup', v); electronAPI?.setLaunchAtStartup?.(v); };
  const handleClearCache = async () => { setClearing(true); const r = await electronAPI?.clearTempCache?.().catch(() => null); setClearing(false); const b = await electronAPI?.getCacheSize?.().catch(() => 0); setCacheSize(b || 0); if (r) electronAPI?.notify?.('Orbit', t('Cache vidé ({n} libérés)', { n: fmtMo(r.freed) })); };
  const handleProxyTest = async () => { setProxyTest('testing'); const r = await electronAPI?.testProxy?.(settings.proxy).catch(() => ({ ok: false })); setProxyTest(r?.ok ? 'ok' : 'fail'); setTimeout(() => setProxyTest('idle'), 4000); };
  const handleCheckUpdate = async () => { setUpdateState('checking'); setUpdateInfo({}); const r = await electronAPI?.checkForUpdate?.(); if (!r?.success) setUpdateState('error'); };

  const fmtMo = (b: number) => !b ? '0 Mo' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : (b / 1e6).toFixed(1) + ' Mo';

  const tabs = [
    { id: 'general', label: t('Général'), icon: <SettingsIcon className="w-4 h-4" /> },
    { id: 'downloads', label: t('Téléchargements'), icon: <Download className="w-4 h-4" /> },
    { id: 'appearance', label: t('Apparence'), icon: <Palette className="w-4 h-4" /> },
    { id: 'ai', label: t('IA & Performance'), icon: <Cpu className="w-4 h-4" /> },
    { id: 'modules', label: t('Modules & IA'), icon: <Boxes className="w-4 h-4" /> },
    { id: 'network', label: t('Réseau'), icon: <Globe className="w-4 h-4" /> },
    { id: 'system', label: t('Système'), icon: <Monitor className="w-4 h-4" /> },
    { id: 'about', label: t('À propos'), icon: <Info className="w-4 h-4" /> },
  ];

  const FORMATS = ['best', 'mp4', 'webm', 'mkv'];
  const BROWSERS = [{ v: 'none', l: t('Aucun') }, { v: 'chrome', l: 'Chrome' }, { v: 'edge', l: 'Edge' }, { v: 'firefox', l: 'Firefox' }, { v: 'brave', l: 'Brave' }, { v: 'opera', l: 'Opera' }];

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div>
            <Card title={t("Sortie")} icon={<Folder className="w-3.5 h-3.5" />}>
              <Row title={t("Dossier de téléchargement")} desc={settings.outputDir || '—'}>
                <button onClick={() => handleDirSelect('outputDir')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5"><FolderOpen className="w-4 h-4" /> {t("Choisir")}</button>
              </Row>
              <Row title={t("Format vidéo par défaut")} desc={t("Conteneur préféré pour les nouveaux téléchargements")}>
                <GlassSelect className="w-44 py-1.5" value={settings.defaultFormat || 'best'} onChange={v => update('defaultFormat', v)} ariaLabel={t("Format vidéo par défaut")} options={FORMATS.map(f => ({ value: f, label: f }))} />
              </Row>
              <Row title={t("Noms de fichiers restreints (ASCII)")} desc={t("Évite les caractères spéciaux dans les noms")}>
                <Toggle checked={!!settings.restrictFilenames} onChange={c => update('restrictFilenames', c)} />
              </Row>
            </Card>
            <Card title={t("Langue")} icon={<Globe className="w-3.5 h-3.5" />}>
              <Row title={t("Langue de l'interface")}>
                <GlassSelect className="w-44 py-1.5" value={language} onChange={v => handleLanguageChange(v as any)} ariaLabel={t("Langue de l'interface")}
                  options={LANGS.map(l => ({ value: l.code, label: `${l.flag} ${l.label}` }))} />
              </Row>
            </Card>
          </div>
        );

      case 'downloads':
        return (
          <div>
            <Card title={t("Contenu intégré")} icon={<Download className="w-3.5 h-3.5" />}>
              <Row title={t("Audio uniquement")} desc={t("Extrait la piste audio (MP3/FLAC/…)")}><Toggle checked={!!settings.extractAudio} onChange={c => update('extractAudio', c)} /></Row>
              <Row title={t("Intégrer la miniature")} desc={t("Pochette dans le fichier")}><Toggle checked={!!settings.embedThumbnail} onChange={c => update('embedThumbnail', c)} /></Row>
              <Row title={t("Intégrer les métadonnées")} desc={t("Titre, auteur, date…")}><Toggle checked={!!settings.embedMetadata} onChange={c => update('embedMetadata', c)} /></Row>
              <Row title={t("Intégrer les sous-titres")}><Toggle checked={!!settings.embedSubs} onChange={c => update('embedSubs', c)} /></Row>
              <Row title={t("Écrire le .info.json")}><Toggle checked={!!settings.writeInfoJson} onChange={c => update('writeInfoJson', c)} /></Row>
            </Card>
            <Card title="SponsorBlock" icon={<X className="w-3.5 h-3.5" />}>
              <Row title={t("Marquer les segments sponsors")} desc={t("Chapitres SponsorBlock dans le fichier")}><Toggle checked={!!settings.sponsorblock} onChange={c => update('sponsorblock', c)} /></Row>
              <Row title={t("Supprimer les sponsors")} desc={t("Coupe les segments (intro, pub, etc.)")}><Toggle checked={!!settings.removeSponsors} onChange={c => update('removeSponsors', c)} /></Row>
            </Card>
            <Card title={t("Comportement")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>
              <Row title={t("Archive de téléchargement")} desc={t("Ne pas re-télécharger ce qui l'a déjà été")}><Toggle checked={!!settings.downloadArchive} onChange={c => update('downloadArchive', c)} /></Row>
              <Row title={t("Ignorer les erreurs")} desc={t("Continuer la playlist en cas d'échec")}><Toggle checked={!!settings.ignoreErrors} onChange={c => update('ignoreErrors', c)} /></Row>
              <Row title={t("Conserver l'horodatage d'origine")}><Toggle checked={!!settings.mtime} onChange={c => update('mtime', c)} /></Row>
              <Row title={t("Pas de fichiers .part")}><Toggle checked={!!settings.noPart} onChange={c => update('noPart', c)} /></Row>
              <Row title={t("Fragments simultanés")} desc={t("Accélère les flux HLS/DASH")}>
                <input type="number" min={1} max={16} className={INPUT + ' w-20 text-center'} value={settings.concurrentFragments || 1} onChange={e => update('concurrentFragments', parseInt(e.target.value) || 1)} />
              </Row>
              <Row title={t("Limite de vitesse")} desc={t("Ex : 5M, 800k (vide = illimité)")}>
                <input type="text" placeholder={t("illimité")} className={INPUT + ' w-28'} value={settings.limitRate || ''} onChange={e => update('limitRate', e.target.value)} />
              </Row>
            </Card>
            <Card title={t("Authentification")} icon={<Globe className="w-3.5 h-3.5" />}>
              <Row title={t("Cookies du navigateur")} desc={t("Pour les contenus nécessitant une connexion")}>
                <GlassSelect className="w-44 py-1.5" value={settings.cookiesFromBrowser || 'none'} onChange={v => update('cookiesFromBrowser', v)} ariaLabel={t("Cookies du navigateur")} options={BROWSERS.map(b => ({ value: b.v, label: b.l }))} />
              </Row>
            </Card>
          </div>
        );

      case 'appearance':
        return (
          <div>
            <Card title={t("Thème")} icon={<Palette className="w-3.5 h-3.5" />}>
              <div className="grid grid-cols-2 gap-3 p-3">
                {THEMES.map(th => (
                  <button key={th.id} onClick={() => update('theme', th.id)}
                    className={`rounded-xl p-4 border-2 text-left transition-all ${settings.theme === th.id ? '' : 'border-white/10 hover:border-white/20'}`}
                    style={{ background: th.bg, color: th.fg, borderColor: settings.theme === th.id ? 'var(--accent)' : undefined }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{t(th.name)}</span>
                      {settings.theme === th.id && <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
                    </div>
                    <div className="flex gap-1 mt-3">
                      <span className="w-6 h-2 rounded-full" style={{ background: 'var(--accent)' }} />
                      <span className="w-3 h-2 rounded-full" style={{ background: th.fg, opacity: 0.4 }} />
                    </div>
                  </button>
                ))}
              </div>
            </Card>
            <Card title={t("Assistant")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>
              <Row title={t("Assistant de démarrage")} desc={t("Reconfigurer les onglets selon ton profil (monteur, 3D, audio…)")}>
                <button onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('orbit-onboarding')); }} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">{t("Relancer")}</button>
              </Row>
            </Card>
            <Card title={t("Couleur d'accent")} icon={<Palette className="w-3.5 h-3.5" />}>
              <div className="flex gap-3 p-3 flex-wrap">
                {ACCENTS.map(a => (
                  <button key={a.id} onClick={() => update('accentColor', a.id)}
                    className={`w-10 h-10 rounded-full transition-all ${settings.accentColor === a.id ? 'ring-2 ring-offset-2 ring-offset-[#0e0e14] scale-110' : 'hover:scale-105'}`}
                    style={{ background: a.c, boxShadow: `0 0 16px ${a.c}66` }}>
                    {settings.accentColor === a.id && <Check className="w-4 h-4 text-white mx-auto" />}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        );

      case 'ai':
        return (
          <div>
            <Card title={t("Assistant IA")} icon={<Cpu className="w-3.5 h-3.5" />}>
              {/* Free local AI (no key, for everyone) */}
              <div className="px-3 py-2.5 border-b border-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200">{t("IA locale gratuite")} {settings.aiApiKey ? '' : <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 ml-1">{t("active")}</span>}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{llm.installed ? t('Installée — fonctionne hors-ligne, sans clé.') : t('Téléchargée une fois (~2 Go), tourne sur ta machine. Sans clé, c\'est elle qui répond.')}</p>
                  </div>
                  <button onClick={installLlm} disabled={llmBusy} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5 disabled:opacity-50 shrink-0">
                    {llmBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : llm.installed ? <Check className="w-4 h-4 text-green-400" /> : <Cpu className="w-4 h-4" />}
                    {llmBusy ? t('En cours…') : llm.installed ? t('Vérifier') : t('Installer')}
                  </button>
                </div>
                {llmBusy && llmProg ? (
                  <div className="mt-2">
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1"><span className="truncate">{llmProg.stage}</span><span>{llmProg.percent ?? 0}%</span></div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${llmProg.percent ?? 0}%`, background: 'var(--accent,#ec4899)' }} /></div>
                  </div>
                ) : null}
              </div>
              {/* Optional Claude key (more powerful) */}
              <div className="px-3 py-2.5">
                <p className="text-sm text-gray-200 mb-1">{t("Clé API Anthropic (Claude)")} <span className="text-gray-500 text-[11px]">{t("— optionnel, plus puissant")}</span></p>
                <p className="text-[11px] text-gray-500 mb-2">{t("Ajoute ta clé pour utiliser Claude à la place de l'IA locale. Crée-en une sur")} <span className="text-gray-300">console.anthropic.com</span>. {t("Elle reste sur ta machine.")}</p>
                <input type="password" placeholder="sk-ant-..." className={INPUT + ' w-full font-mono'} value={settings.aiApiKey || ''} onChange={e => update('aiApiKey', e.target.value.trim())} />
                {settings.aiApiKey ? <p className="text-[11px] text-green-400 mt-1.5">{t("✓ Clé enregistrée ({a}…{b}) — Claude actif", { a: settings.aiApiKey.slice(0, 7), b: settings.aiApiKey.slice(-4) })}</p> : null}
              </div>
            </Card>
            <Card title={t("Amélioration IA & Topaz")} icon={<Cpu className="w-3.5 h-3.5" />}>
              <Row title={t("Dossier de sortie IA par défaut")} desc={settings.enhanceOutputDir || t('Identique à la source')}>
                <button onClick={() => handleDirSelect('enhanceOutputDir')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5"><FolderOpen className="w-4 h-4" /> {t("Choisir")}</button>
              </Row>
              <Row title={t("GPU par défaut")} desc={t("Pour l'upscale / interpolation / Topaz")}>
                <GlassSelect className="w-44 py-1.5" value={settings.defaultGpu || 'auto'} onChange={v => update('defaultGpu', v)} ariaLabel={t("GPU par défaut")}
                  options={[{ value: 'auto', label: 'Auto' }, ...gpuList.map(g => ({ value: g.id, label: g.name }))]} />
              </Row>
            </Card>
            <Card title={t("Performance")} icon={<Monitor className="w-3.5 h-3.5" />}>
              <Row title={t("Désactiver l'accélération matérielle")} desc={t("Si l'interface scintille (redémarrage requis)")}>
                <Toggle checked={!!settings.disableHardwareAccel} onChange={c => update('disableHardwareAccel', c)} />
              </Row>
              <Row title={t("Téléchargements simultanés max")} desc={t("Nombre de fichiers en parallèle")}>
                <input type="number" min={1} max={10} className={INPUT + ' w-20 text-center'} value={settings.maxConcurrent ?? 3} onChange={e => update('maxConcurrent', parseInt(e.target.value) || 1)} />
              </Row>
            </Card>
          </div>
        );

      case 'modules':
        return <ModulesPanel electronAPI={electronAPI} />;

      case 'network':
        return (
          <div>
            <Card title="Proxy" icon={<Globe className="w-3.5 h-3.5" />}>
              <Row title={t("Serveur proxy")} desc="http://, https:// ou socks5://">
                <input type="text" placeholder="socks5://127.0.0.1:1080" className={INPUT + ' w-64'} value={settings.proxy || ''} onChange={e => update('proxy', e.target.value)} />
              </Row>
              <Row title={t("Tester le proxy")} desc={t("Vérifie la connexion via yt-dlp")}>
                <button onClick={handleProxyTest} disabled={!settings.proxy || proxyTest === 'testing'} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5 disabled:opacity-40">
                  {proxyTest === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : proxyTest === 'ok' ? <Check className="w-4 h-4 text-green-400" /> : proxyTest === 'fail' ? <X className="w-4 h-4 text-red-400" /> : <Globe className="w-4 h-4" />}
                  {proxyTest === 'ok' ? t('OK !') : proxyTest === 'fail' ? t('Échec') : t('Tester')}
                </button>
              </Row>
            </Card>
            <Card title={t("Sécurité")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>
              <Row title={t("Ne pas vérifier le certificat HTTPS")} desc={t("Pour les serveurs au certificat invalide")}><Toggle checked={!!settings.noCheckCertificate} onChange={c => update('noCheckCertificate', c)} /></Row>
            </Card>
            <Card title={t("Avancé")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>
              <div className="px-3 py-2.5">
                <p className="text-sm text-gray-200 mb-1.5">{t("Arguments yt-dlp personnalisés")}</p>
                <p className="text-[11px] text-gray-500 mb-2">{t("Ajoutés à chaque téléchargement (utilisateurs avancés).")}</p>
                <input type="text" placeholder="--no-mtime --force-ipv4" className={INPUT + ' w-full'} value={settings.customArgs || ''} onChange={e => update('customArgs', e.target.value)} />
              </div>
            </Card>
          </div>
        );

      case 'system':
        return (
          <div>
            <Card title={t("Démarrage & fenêtre")} icon={<Rocket className="w-3.5 h-3.5" />}>
              <Row title={t("Lancer Orbit au démarrage de Windows")}><Toggle checked={!!settings.launchAtStartup} onChange={handleLaunch} /></Row>
              <Row title={t("Réduire dans la zone de notification")} desc={t("Au lieu de fermer")}><Toggle checked={!!settings.minimizeToTray} onChange={c => update('minimizeToTray', c)} /></Row>
              <Row title={t("Notifications bureau")} desc={t("Quand un téléchargement/rendu se termine")}>
                <div className="flex items-center gap-2">
                  <button onClick={() => electronAPI?.notify?.('Orbit', t('Notification de test ✓'))} className="text-[11px] px-2 py-1 rounded-md bg-white/5 border border-white/10 hover:bg-white/10"><Bell className="w-3 h-3 inline" /> {t("Test")}</button>
                  <Toggle checked={!!settings.notifications} onChange={c => update('notifications', c)} />
                </div>
              </Row>
            </Card>
            <Card title={t("Stockage")} icon={<Folder className="w-3.5 h-3.5" />}>
              <Row title={t("Fichiers temporaires")} desc={cacheSize == null ? t('Calcul…') : t('{n} de fichiers de travail (frames, audio, aperçus)', { n: fmtMo(cacheSize) })}>
                <button onClick={handleClearCache} disabled={clearing} className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 text-sm flex items-center gap-1.5 disabled:opacity-40">
                  {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} {t("Vider")}
                </button>
              </Row>
              <Row title={t("Dossier de données Orbit")} desc="~/.orbit (moteurs, modèles, config)">
                <button onClick={() => electronAPI?.openHomeDir?.()} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5"><FolderOpen className="w-4 h-4" /> {t("Ouvrir")}</button>
              </Row>
            </Card>
            <Card title={t("Maintenance")} icon={<SettingsIcon className="w-3.5 h-3.5" />}>
              <Row title={t("Réinstaller yt-dlp")} desc={t("Si les téléchargements échouent")}><button onClick={() => electronAPI?.updateYtdlp?.()} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">{t("Réinstaller")}</button></Row>
              <Row title={t("Voir les journaux")}><button onClick={() => electronAPI?.openLogs?.()} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-1.5"><FileText className="w-4 h-4" /> Logs</button></Row>
            </Card>
          </div>
        );

      case 'about':
        return (
          <div className="flex flex-col items-center justify-center h-full gap-5">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', boxShadow: '0 0 50px color-mix(in srgb, var(--accent) 30%, transparent)' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
            </div>
            <div className="text-center"><h2 className="text-3xl font-bold text-white">Orbit</h2><p className="text-gray-400 font-mono text-sm mt-1">{t("Version")} {appVersion || '…'}</p></div>

            <div className="w-full max-w-sm rounded-2xl p-5 flex flex-col gap-3 border border-white/8 bg-white/[0.02]">
              <p className="text-[11px] text-gray-500 uppercase font-semibold tracking-wider text-center">{t("Mise à jour")}</p>
              {updateState === 'idle' && <p className="text-center text-sm text-gray-400">{t("Vérifiez si une nouvelle version est disponible.")}</p>}
              {updateState === 'checking' && <div className="flex items-center justify-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t("Vérification…")}</div>}
              {updateState === 'up-to-date' && <div className="flex items-center justify-center gap-2 text-green-400 text-sm"><Check className="w-4 h-4" /> {t("Vous avez la dernière version !")}</div>}
              {updateState === 'available' && <p className="text-center text-sm" style={{ color: 'var(--accent)' }}>{t("✨ Version {v} disponible — téléchargement…", { v: updateInfo.version || '' })}</p>}
              {updateState === 'downloading' && (
                <div className="flex flex-col gap-2"><div className="flex justify-between text-xs text-gray-400"><span>{t("Téléchargement…")}</span><span>{updateInfo.percent}%</span></div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${updateInfo.percent || 0}%`, background: 'var(--accent)' }} /></div></div>
              )}
              {updateState === 'ready' && <p className="text-center text-sm text-green-400">{t("✅ Mise à jour prête (v{v}) — redémarrage requis.", { v: updateInfo.version || '' })}</p>}
              {updateState === 'error' && <p className="text-center text-red-400 text-xs">{t("Erreur :")} {updateInfo.message || t('Impossible de vérifier.')}</p>}
              {updateState === 'ready' ? (
                <button onClick={() => electronAPI?.installUpdate?.()} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold text-sm">{t("Redémarrer et installer")}</button>
              ) : (
                <button onClick={handleCheckUpdate} disabled={['checking', 'downloading', 'available'].includes(updateState)} className="w-full py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-40" style={{ background: 'var(--accent)' }}>
                  {['checking', 'downloading', 'available'].includes(updateState) ? t('En cours…') : t('Vérifier les mises à jour')}
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowChangelog(true)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Changelog</button>
              <button onClick={() => electronAPI?.openExternalUrl?.('https://github.com/ThomasDM40-dev/orbit-releases')} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm flex items-center gap-2"><ExternalLink className="w-4 h-4" /> GitHub</button>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-200" onClick={onClose}>
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-3xl shadow-[0_0_80px_rgba(0,0,0,0.8)] w-full max-w-[980px] h-[80vh] flex overflow-hidden border border-white/10"
          style={{ background: 'rgba(14,14,20,0.96)', backdropFilter: 'blur(28px)' }} onClick={(e) => e.stopPropagation()}>

          {/* Sidebar */}
          <div className="w-60 shrink-0 border-r border-white/8 flex flex-col p-3" style={{ background: 'rgba(0,0,0,0.25)' }}>
            <div className="px-3 py-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}><SettingsIcon className="w-4 h-4" style={{ color: 'var(--accent)' }} /></div>
              <span className="text-sm font-bold text-white">{t("Paramètres")}</span>
            </div>
            <div className="flex-1 overflow-y-auto mt-2 space-y-1">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2.5 ${activeTab === tab.id ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                  style={activeTab === tab.id ? { background: 'color-mix(in srgb, var(--accent) 22%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent)' } : {}}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col relative min-w-0">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white p-2 rounded-full hover:bg-white/5 z-10"><X className="w-5 h-5" /></button>
            <div className="px-6 py-5 border-b border-white/8"><h2 className="text-xl font-bold text-white">{tabs.find(x => x.id === activeTab)?.label}</h2></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">{renderContent()}</div>
          </div>
        </motion.div>
      </div>
      {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
    </>
  );
}
