import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive, Lock, Unlock, KeyRound, Link2, FolderPlus, Folder, File as FileIcon,
  UploadCloud, Download, Trash2, Loader2, ChevronRight, AlertCircle, ShieldCheck, X, RefreshCw,
  Cloud, Monitor, LogOut, Server, Mail, User as UserIcon, FolderCog,
} from 'lucide-react';
import { t } from '@/i18n';
import DriveAdmin from './DriveAdmin';

const api = () => (window as any).electronAPI;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-pink-500/50 transition-all w-full select-text shadow-sm";

type Node = {
  id: string; type: 'folder' | 'file'; name: string; parent: string | null;
  size?: number; icon?: string | null; createdAt?: number;
};
type Prog = { id: string; phase: 'upload' | 'download'; name: string; percent: number; chunk?: number; chunks?: number; fileIndex?: number; fileCount?: number };

const fmtSize = (b?: number) => !b ? '0 o' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' Ko';

type Mode = 'local' | 'cloud';

export default function DriveStudio() {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('orbit_drive_mode') as Mode) || 'local');
  useEffect(() => { localStorage.setItem('orbit_drive_mode', mode); }, [mode]);

  // Shared drive state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [prog, setProg] = useState<Prog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Node | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Local mode
  const [localStatus, setLocalStatus] = useState<{ configured: boolean; unlocked: boolean; webhookMasked: string } | null>(null);
  const [webhook, setWebhook] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Cloud mode
  const [cloud, setCloud] = useState<{ server: string; email: string; admin?: boolean; loggedIn: boolean; unlocked: boolean } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [cloudCrypto, setCloudCrypto] = useState<{ hasParams: boolean } | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [serverInfo, setServerInfo] = useState<{ mail?: boolean; registration?: boolean } | null>(null);
  const [forgotMode, setForgotMode] = useState<'none' | 'request' | 'reset'>('none');
  const [code, setCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [info, setInfo] = useState<string | null>(null);

  // Shared passphrase / password field
  const [pass, setPass] = useState('');

  const unlocked = mode === 'local' ? !!localStatus?.unlocked : !!cloud?.unlocked;

  const backend = mode === 'local'
    ? { nodes: () => api().discloudIndex(), mkdir: (d: any) => api().discloudMkdir(d), del: (d: any) => api().discloudDelete(d), upload: (d: any) => api().discloudUpload(d), download: (d: any) => api().discloudDownload(d) }
    : { nodes: () => api().cloudNodes(), mkdir: (d: any) => api().cloudMkdir(d), del: (d: any) => api().cloudDelete(d), upload: (d: any) => api().cloudUpload(d), download: (d: any) => api().cloudDownload(d) };

  const refreshNodes = useCallback(async () => {
    try { setNodes((await backend.nodes()) || []); } catch (e) { /* locked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const refreshLocal = useCallback(async () => {
    const s = await api()?.discloudStatus?.();
    setLocalStatus(s || null);
    if (s?.unlocked) { setNodes((await api().discloudIndex()) || []); }
  }, []);

  const refreshCloud = useCallback(async () => {
    const s = await api()?.cloudStatus?.();
    setCloud(s || null);
    if (s?.server && !s.loggedIn) { api().cloudServerInfo().then((i: any) => setServerInfo(i || {})).catch(() => setServerInfo({})); }
    if (s?.loggedIn && !s.unlocked) {
      const c = await api().cloudCryptoStatus().catch(() => null);
      setCloudCrypto(c?.ok ? { hasParams: c.hasParams } : { hasParams: false });
    }
    if (s?.unlocked) { setNodes((await api().cloudNodes()) || []); }
  }, []);

  useEffect(() => { setFolder(null); setError(null); setPass(''); if (mode === 'local') refreshLocal(); else refreshCloud(); }, [mode, refreshLocal, refreshCloud]);

  useEffect(() => {
    const off = api()?.onDiscloudProgress?.((p: Prog) => setProg(p));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  // ── Local handlers ──────────────────────────────────────────────────────────
  const handleLocalSetup = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().discloudSetup({ webhook: webhook.trim(), passphrase: pass });
      if (!r?.ok) { setError(r?.error || t('Échec de la configuration')); return; }
      setPass(''); setWebhook(''); await refreshLocal();
    } finally { setBusy(false); }
  };
  const handleLocalUnlock = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().discloudUnlock({ passphrase: pass });
      if (!r?.ok) { setError(r?.error || t('Phrase secrète incorrecte.')); return; }
      setPass(''); await refreshLocal();
    } finally { setBusy(false); }
  };
  const handleLocalLock = async () => { await api().discloudLock(); await refreshLocal(); };

  // ── Cloud handlers ──────────────────────────────────────────────────────────
  const handleSetServer = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().cloudSetServer({ server: serverUrl.trim() });
      if (!r?.ok) { setError(r?.error || t('Serveur injoignable')); return; }
      await refreshCloud();
    } finally { setBusy(false); }
  };
  const handleAuth = async () => {
    setError(null); setBusy(true);
    try {
      const r = isRegister ? await api().cloudRegister({ email: email.trim(), password: pass }) : await api().cloudLogin({ email: email.trim(), password: pass });
      if (!r?.ok) { setError(r?.error || t('Échec de la connexion')); return; }
      setPass(''); await refreshCloud();
    } finally { setBusy(false); }
  };
  const handleLogout = async () => { await api().cloudLogout(); setCloudCrypto(null); await refreshCloud(); };
  const handleForgotRequest = async () => {
    setError(null); setInfo(null); setBusy(true);
    try {
      const r = await api().cloudForgot({ email: email.trim() });
      if (!r?.ok && r?.error) { setError(r.error); return; }
      setInfo(t('Si un compte existe pour cet e-mail, un code vient d\'être envoyé.'));
      setForgotMode('reset');
    } finally { setBusy(false); }
  };
  const handleResetPassword = async () => {
    setError(null); setInfo(null); setBusy(true);
    try {
      const r = await api().cloudReset({ email: email.trim(), code: code.trim(), password: newPass });
      if (!r?.ok) { setError(r?.error || t('Code invalide ou expiré.')); return; }
      setCode(''); setNewPass(''); setForgotMode('none');
      setInfo(t('Mot de passe réinitialisé. Connecte-toi avec ton nouveau mot de passe.'));
    } finally { setBusy(false); }
  };
  const handleCloudSetupCrypto = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().cloudSetupCrypto({ passphrase: pass });
      if (!r?.ok) { setError(r?.error || t('Échec de la configuration')); return; }
      setPass(''); await refreshCloud();
    } finally { setBusy(false); }
  };
  const handleCloudUnlock = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().cloudUnlock({ passphrase: pass });
      if (r?.needSetup) { setCloudCrypto({ hasParams: false }); setError(null); return; }
      if (!r?.ok) { setError(r?.error || t('Phrase secrète incorrecte.')); return; }
      setPass(''); await refreshCloud();
    } finally { setBusy(false); }
  };

  // ── Shared drive actions ────────────────────────────────────────────────────
  const handleNewFolder = async () => {
    const name = window.prompt(t('Nom du dossier'));
    if (!name) return;
    setNodes((await backend.mkdir({ name, parent: folder })) || []);
  };
  const handleUpload = async () => {
    const paths = await api().discloudPickFiles();
    if (!paths?.length) return;
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setError(null); setProg({ id: jobId, phase: 'upload', name: '', percent: 0 });
    try {
      const r = await backend.upload({ paths, parent: folder, jobId });
      if (!r?.ok && !/annul/i.test(r?.error || '')) setError(r?.error || t('Échec de l\'envoi'));
      await refreshNodes();
    } finally { setBusy(false); setProg(null); jobRef.current = null; }
  };
  const handleDownload = async (n: Node) => {
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setError(null); setProg({ id: jobId, phase: 'download', name: n.name, percent: 0 });
    try {
      const r = await backend.download({ id: n.id, jobId });
      if (!r?.ok && !r?.cancelled && !/annul/i.test(r?.error || '')) setError(r?.error || t('Échec du téléchargement'));
    } finally { setBusy(false); setProg(null); jobRef.current = null; }
  };
  const handleDelete = (n: Node) => setConfirmDel(n);
  const doDelete = async () => {
    const n = confirmDel;
    if (!n) return;
    setDeleting(true); setError(null);
    try {
      const r = await backend.del({ id: n.id });
      if (r?.ok === false) { setError(r?.error || t('Échec de la suppression')); return; }
      if (r?.nodes) setNodes(r.nodes); else await refreshNodes();
      setConfirmDel(null);
    } catch (e: any) { setError(e?.message || t('Échec de la suppression')); }
    finally { setDeleting(false); }
  };
  const handleCancel = () => { if (jobRef.current) api().discloudCancel(jobRef.current); };

  // ── Header + mode switch ────────────────────────────────────────────────────
  const ModeSwitch = (
    <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 text-sm">
      {(['local', 'cloud'] as Mode[]).map(m => (
        <button key={m} onClick={() => setMode(m)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${mode === m ? 'bg-pink-500/20 text-pink-300' : 'text-gray-400 hover:text-gray-200'}`}>
          {m === 'local' ? <Monitor className="w-3.5 h-3.5" /> : <Cloud className="w-3.5 h-3.5" />}
          {m === 'local' ? t('Local') : t('Cloud (compte)')}
        </button>
      ))}
    </div>
  );

  const Header = (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)', boxShadow: '0 8px 24px rgba(168,85,247,0.35)' }}>
          <HardDrive className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">{t('Drive Discord')} <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/20">{t('Chiffré AES-256')}</span></h1>
          <p className="text-xs text-gray-500">{t('Stockez vos fichiers gratuitement sur un salon Discord, chiffrés de bout en bout.')}</p>
        </div>
      </div>
      {ModeSwitch}
    </div>
  );

  const errorBar = error && (
    <div className="mb-4 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
      <AlertCircle className="w-4 h-4 shrink-0" /> <span className="flex-1">{error}</span>
      <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-300"><X className="w-4 h-4" /></button>
    </div>
  );

  const card = (children: any, max = 'max-w-2xl') => (
    <div className={`h-full overflow-y-auto p-6 ${max} mx-auto`}>{Header}{errorBar}<div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-5">{children}</div></div>
  );
  const primaryBtn = "w-full py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2";
  const grad = { background: 'linear-gradient(135deg, #e879f9, #a855f7)' };

  // ── LOCAL: gating screens ───────────────────────────────────────────────────
  if (mode === 'local' && localStatus && !localStatus.configured) {
    return card(<>
      <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><Link2 className="w-3.5 h-3.5" /> {t('URL du webhook Discord')}</label>
        <input className={INPUT} placeholder="https://discord.com/api/webhooks/…" value={webhook} onChange={e => setWebhook(e.target.value)} />
        <button onClick={() => setShowHelp(!showHelp)} className="text-xs text-pink-400 hover:text-pink-300 mt-1.5">{showHelp ? t('Masquer l\'aide') : t('Comment créer un webhook ?')}</button>
        <AnimatePresence>
          {showHelp && (
            <motion.ol initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-xs text-gray-400 mt-2 space-y-1 list-decimal list-inside bg-white/5 rounded-xl p-3 overflow-hidden">
              <li>{t('Sur Discord, choisissez (ou créez) un salon privé.')}</li>
              <li>{t('Paramètres du salon → Intégrations → Webhooks → Nouveau webhook.')}</li>
              <li>{t('Cliquez sur « Copier l\'URL du webhook » et collez-la ci-dessus.')}</li>
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><KeyRound className="w-3.5 h-3.5" /> {t('Phrase secrète de chiffrement')}</label>
        <input className={INPUT} type="password" placeholder={t('Choisissez une phrase forte')} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLocalSetup()} />
        <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-green-400" /> {t('Vos fichiers sont chiffrés avant l\'envoi. Sans cette phrase, ils sont irrécupérables — gardez-la précieusement.')}</p>
      </div>
      <button onClick={handleLocalSetup} disabled={busy || !webhook || !pass} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {t('Configurer le Drive')}</button>
      <p className="text-[11px] text-gray-600 text-center">{t('Note : utiliser Discord comme stockage va à l\'encontre de ses conditions — à réserver à un usage d\'appoint, pas comme sauvegarde unique.')}</p>
    </>);
  }
  if (mode === 'local' && localStatus && !localStatus.unlocked) {
    return card(<div className="text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto"><Lock className="w-7 h-7 text-pink-400" /></div>
      <p className="text-sm text-gray-400">{t('Saisissez votre phrase secrète pour déverrouiller le Drive.')}</p>
      <input className={INPUT} type="password" autoFocus placeholder={t('Phrase secrète')} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLocalUnlock()} />
      <button onClick={handleLocalUnlock} disabled={busy || !pass} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />} {t('Déverrouiller')}</button>
    </div>, 'max-w-md');
  }

  // ── CLOUD: gating screens ───────────────────────────────────────────────────
  if (mode === 'cloud' && cloud && !cloud.server) {
    return card(<>
      <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><Server className="w-3.5 h-3.5" /> {t('Adresse du serveur')}</label>
        <input className={INPUT} placeholder="https://drive.mondomaine.com" value={serverUrl} onChange={e => setServerUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetServer()} />
        <p className="text-[11px] text-gray-500 mt-1.5">{t('Adresse de votre serveur Orbit Drive (auto-hébergé). Le contenu reste chiffré côté client.')}</p>
      </div>
      <button onClick={handleSetServer} disabled={busy || !serverUrl} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />} {t('Se connecter au serveur')}</button>
    </>, 'max-w-md');
  }
  if (mode === 'cloud' && cloud && !cloud.loggedIn) {
    const infoBar = info && (
      <div className="flex items-center gap-2 text-sm text-green-300 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
        <ShieldCheck className="w-4 h-4 shrink-0" /> <span className="flex-1">{info}</span>
        <button onClick={() => setInfo(null)} className="text-green-400/60 hover:text-green-300"><X className="w-4 h-4" /></button>
      </div>
    );
    // Demande de code (mot de passe oublié)
    if (forgotMode === 'request') {
      return card(<>
        {infoBar}
        <h2 className="text-base font-semibold text-white">{t('Mot de passe oublié')}</h2>
        <p className="text-[11px] text-gray-500">{t('Entre ton e-mail : on t\'envoie un code à 6 chiffres pour choisir un nouveau mot de passe.')}</p>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><Mail className="w-3.5 h-3.5" /> {t('E-mail')}</label>
          <input className={INPUT} type="email" autoFocus placeholder="vous@exemple.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgotRequest()} />
        </div>
        <button onClick={handleForgotRequest} disabled={busy || !email} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} {t('Envoyer le code')}</button>
        <button onClick={() => { setForgotMode('none'); setError(null); }} className="text-xs text-gray-400 hover:text-gray-200 w-full text-center">{t('Retour à la connexion')}</button>
      </>, 'max-w-md');
    }
    // Saisie du code + nouveau mot de passe
    if (forgotMode === 'reset') {
      return card(<>
        {infoBar}
        <h2 className="text-base font-semibold text-white">{t('Nouveau mot de passe')}</h2>
        <p className="text-[11px] text-gray-500">{t('Saisis le code reçu par e-mail et ton nouveau mot de passe.')}</p>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">{t('Code reçu par e-mail')}</label>
          <input className={INPUT} inputMode="numeric" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><KeyRound className="w-3.5 h-3.5" /> {t('Nouveau mot de passe')}</label>
          <input className={INPUT} type="password" placeholder={t('Nouveau mot de passe')} value={newPass} onChange={e => setNewPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleResetPassword()} />
        </div>
        <button onClick={handleResetPassword} disabled={busy || !code || !newPass} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {t('Réinitialiser')}</button>
        <button onClick={() => { setForgotMode('request'); setError(null); }} className="text-xs text-gray-400 hover:text-gray-200 w-full text-center">{t('Renvoyer un code')}</button>
      </>, 'max-w-md');
    }
    // Connexion / inscription
    return card(<>
      {infoBar}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">{isRegister ? t('Créer un compte') : t('Connexion')}</h2>
        <button onClick={() => { api().cloudSetServer({ server: '' }); refreshCloud(); }} className="text-[11px] text-gray-500 hover:text-gray-300">{t('Changer de serveur')}</button>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><Mail className="w-3.5 h-3.5" /> {t('E-mail')}</label>
        <input className={INPUT} type="email" placeholder="vous@exemple.com" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5"><KeyRound className="w-3.5 h-3.5" /> {t('Mot de passe')}</label>
        <input className={INPUT} type="password" placeholder={t('Mot de passe')} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth()} />
      </div>
      <button onClick={handleAuth} disabled={busy || !email || !pass} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserIcon className="w-4 h-4" />} {isRegister ? t('Créer le compte') : t('Se connecter')}</button>
      <div className="flex items-center justify-between">
        <button onClick={() => { setIsRegister(!isRegister); setError(null); }} className="text-xs text-pink-400 hover:text-pink-300">{isRegister ? t('J\'ai déjà un compte') : t('Créer un compte')}</button>
        {!isRegister && serverInfo?.mail && <button onClick={() => { setForgotMode('request'); setError(null); setInfo(null); }} className="text-xs text-gray-400 hover:text-gray-200">{t('Mot de passe oublié ?')}</button>}
      </div>
    </>, 'max-w-md');
  }
  if (mode === 'cloud' && cloud && cloud.loggedIn && !cloud.unlocked) {
    const needSetup = cloudCrypto && !cloudCrypto.hasParams;
    return card(<div className="text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto">{needSetup ? <ShieldCheck className="w-7 h-7 text-pink-400" /> : <Lock className="w-7 h-7 text-pink-400" />}</div>
      <p className="text-sm text-gray-400">{needSetup ? t('Choisissez une phrase secrète de chiffrement. Elle protège vos fichiers et fonctionne sur tous vos appareils.') : t('Saisissez votre phrase secrète pour déverrouiller le Drive.')}</p>
      <input className={INPUT} type="password" autoFocus placeholder={t('Phrase secrète')} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && (needSetup ? handleCloudSetupCrypto() : handleCloudUnlock())} />
      <button onClick={needSetup ? handleCloudSetupCrypto : handleCloudUnlock} disabled={busy || !pass} className={primaryBtn} style={grad}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : needSetup ? <ShieldCheck className="w-4 h-4" /> : <Unlock className="w-4 h-4" />} {needSetup ? t('Activer le chiffrement') : t('Déverrouiller')}</button>
      <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-300 w-full flex items-center justify-center gap-1"><LogOut className="w-3.5 h-3.5" /> {cloud.email} · {t('Se déconnecter')}</button>
    </div>, 'max-w-md');
  }

  // While the relevant status is still loading
  if ((mode === 'local' && !localStatus) || (mode === 'cloud' && !cloud)) {
    return <div className="h-full w-full flex items-center justify-center text-gray-600"><Loader2 className="w-7 h-7 animate-spin" /></div>;
  }

  // ── Unlocked: the drive (shared for both modes) ─────────────────────────────
  const crumbs: Node[] = [];
  { let c = folder; while (c) { const n = nodes.find(x => x.id === c); if (!n) break; crumbs.unshift(n); c = n.parent; } }
  const children = nodes.filter(n => n.parent === folder).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));

  return (
    <div className="h-full flex flex-col p-6">
      {Header}
      {errorBar}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={handleUpload} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40" style={grad}>
          <UploadCloud className="w-4 h-4" /> {t('Envoyer des fichiers')}
        </button>
        <button onClick={handleNewFolder} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40">
          <FolderPlus className="w-4 h-4" /> {t('Nouveau dossier')}
        </button>
        <button onClick={refreshNodes} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40" title={t('Actualiser')}>
          <RefreshCw className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        {mode === 'cloud' && cloud?.admin && (
          <button onClick={() => setShowAdmin(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all" title={t('Webhooks & profils')}><FolderCog className="w-4 h-4" /> {t('Webhooks')}</button>
        )}
        {mode === 'cloud'
          ? <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"><LogOut className="w-4 h-4" /> {cloud?.email}</button>
          : <button onClick={handleLocalLock} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"><Lock className="w-4 h-4" /> {t('Verrouiller')}</button>}
      </div>

      {showAdmin && <DriveAdmin onClose={() => setShowAdmin(false)} />}

      <AnimatePresence>
        {confirmDel && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !deleting && setConfirmDel(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-[#15161d] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/25 flex items-center justify-center mb-4">
                  <Trash2 className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">
                  {confirmDel.type === 'folder' ? t('Supprimer ce dossier ?') : t('Supprimer ce fichier ?')}
                </h3>
                <div className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 mb-4">
                  {confirmDel.type === 'folder'
                    ? <Folder className="w-4 h-4 text-pink-400 shrink-0" />
                    : (confirmDel.icon
                        ? <img src={confirmDel.icon} alt="" className="w-4 h-4 object-contain shrink-0" draggable={false} />
                        : <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />)}
                  <span className="text-sm text-gray-200 truncate">{confirmDel.name}</span>
                </div>
                <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                  {confirmDel.type === 'folder'
                    ? t('Le dossier et tout son contenu seront définitivement supprimés de Discord. Cette action est irréversible.')
                    : t('Ce fichier sera définitivement supprimé de Discord. Cette action est irréversible.')}
                </p>
                <div className="flex items-center gap-2 w-full">
                  <button onClick={() => setConfirmDel(null)} disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40">
                    {t('Annuler')}
                  </button>
                  <button onClick={doDelete} disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500/90 hover:bg-red-500 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                    {deleting ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('Suppression…')}</> : <><Trash2 className="w-4 h-4" /> {t('Supprimer')}</>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-1 mb-3 text-sm flex-wrap">
        <button onClick={() => setFolder(null)} className={`px-2 py-1 rounded-lg hover:bg-white/5 transition-colors ${folder === null ? 'text-pink-400 font-semibold' : 'text-gray-400'}`}>{t('Racine')}</button>
        {crumbs.map(c => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <button onClick={() => setFolder(c.id)} className={`px-2 py-1 rounded-lg hover:bg-white/5 transition-colors ${folder === c.id ? 'text-pink-400 font-semibold' : 'text-gray-400'}`}>{c.name}</button>
          </span>
        ))}
      </div>

      <AnimatePresence>
        {prog && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-4 bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
              <span className="flex items-center gap-2 truncate">
                {prog.phase === 'upload' ? <UploadCloud className="w-3.5 h-3.5 text-pink-400" /> : <Download className="w-3.5 h-3.5 text-pink-400" />}
                <span className="truncate">{prog.name || t('Préparation…')}</span>
                {prog.fileCount && prog.fileCount > 1 && <span className="text-gray-500">({(prog.fileIndex ?? 0) + 1}/{prog.fileCount})</span>}
                {prog.chunks ? <span className="text-gray-500">· {t('bloc')} {prog.chunk}/{prog.chunks}</span> : null}
              </span>
              <span className="flex items-center gap-2">{prog.percent}%<button onClick={handleCancel} className="text-gray-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button></span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: prog.percent + '%', background: 'linear-gradient(90deg, #e879f9, #a855f7)' }} /></div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {children.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-3">
            <UploadCloud className="w-12 h-12 opacity-30" />
            <p className="text-sm">{t('Ce dossier est vide. Envoyez votre premier fichier.')}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {children.map(n => (
              <div key={n.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 transition-colors">
                {n.type === 'folder' ? (
                  <button onClick={() => setFolder(n.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Folder className="w-5 h-5 text-pink-400 shrink-0" />
                    <span className="text-sm text-gray-200 truncate">{n.name}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {n.icon
                      ? <img src={n.icon} alt="" className="w-5 h-5 shrink-0 object-contain" draggable={false} />
                      : <FileIcon className="w-5 h-5 text-gray-400 shrink-0" />}
                    <span className="text-sm text-gray-200 truncate">{n.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{fmtSize(n.size)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {n.type === 'file' && (
                    <button onClick={() => handleDownload(n)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-pink-400 hover:bg-white/10 disabled:opacity-30" title={t('Télécharger')}><Download className="w-4 h-4" /></button>
                  )}
                  <button onClick={() => handleDelete(n)} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/10 disabled:opacity-30" title={t('Supprimer')}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
