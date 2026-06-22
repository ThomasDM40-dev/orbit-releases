import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HardDrive, Lock, Unlock, KeyRound, Link2, FolderPlus, Folder, File as FileIcon,
  UploadCloud, Download, Trash2, Loader2, ChevronRight, AlertCircle, ShieldCheck, X, RefreshCw,
} from 'lucide-react';
import { t } from '@/i18n';

const api = () => (window as any).electronAPI;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-pink-500/50 transition-all w-full select-text shadow-sm";

type Node = {
  id: string; type: 'folder' | 'file'; name: string; parent: string | null;
  size?: number; chunks?: { messageId: string; size: number }[]; icon?: string | null; createdAt?: number;
};
type Status = { configured: boolean; encrypted: boolean; unlocked: boolean; webhookMasked: string };
type Prog = { id: string; phase: 'upload' | 'download'; name: string; percent: number; chunk?: number; chunks?: number; fileIndex?: number; fileCount?: number };

const fmtSize = (b?: number) => !b ? '0 o' : b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' Ko';

export default function DriveStudio() {
  const [status, setStatus] = useState<Status | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [prog, setProg] = useState<Prog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);

  // Setup / unlock form fields
  const [webhook, setWebhook] = useState('');
  const [pass, setPass] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const refreshIndex = useCallback(async () => {
    try { setNodes((await api()?.discloudIndex?.()) || []); } catch (e) { /* locked */ }
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await api()?.discloudStatus?.();
    setStatus(s || null);
    if (s?.unlocked) refreshIndex();
  }, [refreshIndex]);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  useEffect(() => {
    const off = api()?.onDiscloudProgress?.((p: Prog) => setProg(p));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  const handleSetup = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().discloudSetup({ webhook: webhook.trim(), passphrase: pass });
      if (!r?.ok) { setError(r?.error || t('Échec de la configuration')); return; }
      setPass(''); setWebhook('');
      await refreshStatus();
    } finally { setBusy(false); }
  };

  const handleUnlock = async () => {
    setError(null); setBusy(true);
    try {
      const r = await api().discloudUnlock({ passphrase: pass });
      if (!r?.ok) { setError(r?.error || t('Phrase secrète incorrecte.')); return; }
      setPass('');
      await refreshStatus();
    } finally { setBusy(false); }
  };

  const handleLock = async () => { await api().discloudLock(); await refreshStatus(); };

  const handleNewFolder = async () => {
    const name = window.prompt(t('Nom du dossier'));
    if (!name) return;
    setNodes((await api().discloudMkdir({ name, parent: folder })) || []);
  };

  const handleUpload = async () => {
    const paths = await api().discloudPickFiles();
    if (!paths?.length) return;
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setError(null); setProg({ id: jobId, phase: 'upload', name: '', percent: 0 });
    try {
      const r = await api().discloudUpload({ paths, parent: folder, jobId });
      if (!r?.ok && !/annul/i.test(r?.error || '')) setError(r?.error || t('Échec de l\'envoi'));
      await refreshIndex();
    } finally { setBusy(false); setProg(null); jobRef.current = null; }
  };

  const handleDownload = async (n: Node) => {
    const jobId = uid(); jobRef.current = jobId;
    setBusy(true); setError(null); setProg({ id: jobId, phase: 'download', name: n.name, percent: 0 });
    try {
      const r = await api().discloudDownload({ id: n.id, jobId });
      if (!r?.ok && !r?.cancelled && !/annul/i.test(r?.error || '')) setError(r?.error || t('Échec du téléchargement'));
    } finally { setBusy(false); setProg(null); jobRef.current = null; }
  };

  const handleDelete = async (n: Node) => {
    const msg = n.type === 'folder' ? t('Supprimer ce dossier et tout son contenu de Discord ?') : t('Supprimer ce fichier de Discord ?');
    if (!window.confirm(msg)) return;
    setBusy(true);
    try { const r = await api().discloudDelete({ id: n.id }); if (r?.nodes) setNodes(r.nodes); }
    finally { setBusy(false); }
  };

  const handleCancel = () => { if (jobRef.current) api().discloudCancel(jobRef.current); };

  // Breadcrumb path from root to current folder.
  const crumbs: Node[] = [];
  { let c = folder; while (c) { const n = nodes.find(x => x.id === c); if (!n) break; crumbs.unshift(n); c = n.parent; } }
  const children = nodes.filter(n => n.parent === folder).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));

  // ── Header ────────────────────────────────────────────────────────────────
  const Header = (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)', boxShadow: '0 8px 24px rgba(168,85,247,0.35)' }}>
        <HardDrive className="w-6 h-6 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">{t('Drive Discord')} <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-pink-500/15 text-pink-300 border border-pink-500/20">{t('Chiffré AES-256')}</span></h1>
        <p className="text-xs text-gray-500">{t('Stockez vos fichiers gratuitement sur un salon Discord, chiffrés de bout en bout.')}</p>
      </div>
    </div>
  );

  const errorBar = error && (
    <div className="mb-4 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
      <AlertCircle className="w-4 h-4 shrink-0" /> <span className="flex-1">{error}</span>
      <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-300"><X className="w-4 h-4" /></button>
    </div>
  );

  // ── Not configured: setup screen ────────────────────────────────────────────
  if (status && !status.configured) {
    return (
      <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto">
        {Header}
        {errorBar}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-5">
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
            <input className={INPUT} type="password" placeholder={t('Choisissez une phrase forte')} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSetup()} />
            <p className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-green-400" /> {t('Vos fichiers sont chiffrés avant l\'envoi. Sans cette phrase, ils sont irrécupérables — gardez-la précieusement.')}</p>
          </div>
          <button onClick={handleSetup} disabled={busy || !webhook || !pass} className="w-full py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {t('Configurer le Drive')}
          </button>
          <p className="text-[11px] text-gray-600 text-center">{t('Note : utiliser Discord comme stockage va à l\'encontre de ses conditions — à réserver à un usage d\'appoint, pas comme sauvegarde unique.')}</p>
        </div>
      </div>
    );
  }

  // ── Configured but locked: unlock screen ────────────────────────────────────
  if (status && !status.unlocked) {
    return (
      <div className="h-full overflow-y-auto p-6 max-w-md mx-auto">
        {Header}
        {errorBar}
        <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mx-auto"><Lock className="w-7 h-7 text-pink-400" /></div>
          <p className="text-sm text-gray-400">{t('Saisissez votre phrase secrète pour déverrouiller le Drive.')}</p>
          <input className={INPUT} type="password" autoFocus placeholder={t('Phrase secrète')} value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleUnlock()} />
          <button onClick={handleUnlock} disabled={busy || !pass} className="w-full py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />} {t('Déverrouiller')}
          </button>
          {status.webhookMasked && <p className="text-[11px] text-gray-600">{t('Webhook')} : {status.webhookMasked}</p>}
        </div>
      </div>
    );
  }

  // ── Unlocked: the drive ─────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col p-6">
      {Header}
      {errorBar}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={handleUpload} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}>
          <UploadCloud className="w-4 h-4" /> {t('Envoyer des fichiers')}
        </button>
        <button onClick={handleNewFolder} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40">
          <FolderPlus className="w-4 h-4" /> {t('Nouveau dossier')}
        </button>
        <button onClick={refreshIndex} disabled={busy} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all disabled:opacity-40" title={t('Actualiser')}>
          <RefreshCw className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button onClick={handleLock} className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10 transition-all" title={t('Verrouiller')}>
          <Lock className="w-4 h-4" /> {t('Verrouiller')}
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 mb-3 text-sm flex-wrap">
        <button onClick={() => setFolder(null)} className={`px-2 py-1 rounded-lg hover:bg-white/5 transition-colors ${folder === null ? 'text-pink-400 font-semibold' : 'text-gray-400'}`}>{t('Racine')}</button>
        {crumbs.map(c => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
            <button onClick={() => setFolder(c.id)} className={`px-2 py-1 rounded-lg hover:bg-white/5 transition-colors ${folder === c.id ? 'text-pink-400 font-semibold' : 'text-gray-400'}`}>{c.name}</button>
          </span>
        ))}
      </div>

      {/* Progress */}
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

      {/* File list */}
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
