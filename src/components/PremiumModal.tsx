import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Check, X, ShieldCheck, AlertCircle, CreditCard, Sparkles, Zap, Lock, LogOut, RefreshCw } from 'lucide-react';
import { usePremium } from '@/premium';
import OrbitSpinner from '@/components/OrbitSpinner';
import { t } from '@/i18n';

const PRICE = '14,99 €';
const api = () => (window as any).electronAPI;

const FEATURES = [
  { icon: Sparkles, text: 'Tous les outils IA : Topaz, Upscale, Interpolation, Détourage, Gomme magique' },
  { icon: Zap, text: 'Génération d\'images & transcription sans quota' },
  { icon: Crown, text: 'Téléchargements illimités + stockage Drive étendu' },
  { icon: Lock, text: 'Licence à vie — payée une seule fois, liée à 1 appareil' },
];

type Acct = { loading: boolean; server: string; loggedIn: boolean; email: string };

export default function PremiumModal({ onClose }: { onClose: () => void }) {
  const { status, activate, checkout, sync } = usePremium();
  const [acct, setAcct] = useState<Acct>({ loading: true, server: '', loggedIn: false, email: '' });
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);   // attente du paiement
  const [showKey, setShowKey] = useState(false);
  const [key, setKey] = useState('');
  const pollRef = useRef<any>(null);
  const syncingRef = useRef(false);   // évite d'empiler les requêtes pendant un cold-start

  const loadAcct = async () => {
    try {
      const s = await api()?.cloudStatus?.();
      setAcct({ loading: false, server: s?.server || '', loggedIn: !!s?.loggedIn, email: s?.email || '' });
      setServerUrl(s?.server || '');
      if (s?.loggedIn) sync();   // déjà premium ? on active direct
    } catch { setAcct({ loading: false, server: '', loggedIn: false, email: '' }); }
  };

  useEffect(() => { loadAcct(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);
  // Stoppe l'attente dès que le premium est actif.
  useEffect(() => { if (status.active && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; setWaiting(false); } }, [status.active]);

  const saveServer = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api()?.cloudSetServer?.({ server: serverUrl.trim() });
      if (!r?.ok) setError(r?.error || t('Serveur injoignable.'));
      else await loadAcct();
    } finally { setBusy(false); }
  };

  const doAuth = async () => {
    setBusy(true); setError(null);
    try {
      const fn = isRegister ? api()?.cloudRegister : api()?.cloudLogin;
      const r = await fn?.({ email: email.trim(), password });
      if (!r?.ok) { setError(r?.error || t('Échec de la connexion.')); return; }
      await loadAcct();
    } finally { setBusy(false); }
  };

  const logout = async () => { await api()?.cloudLogout?.(); await loadAcct(); };

  const buy = async () => {
    setBusy(true); setError(null);
    try {
      const r = await checkout();
      if (!r?.ok) { setError(r?.error || t('Paiement indisponible.')); return; }
      // Le checkout s'ouvre dans le navigateur ; on attend la confirmation (webhook).
      setWaiting(true);
      if (pollRef.current) clearInterval(pollRef.current);
      let n = 0;
      pollRef.current = setInterval(async () => {
        if (syncingRef.current) return;   // une requête est déjà en vol (serveur lent)
        n++;
        syncingRef.current = true;
        let s: any;
        try { s = await sync(); } finally { syncingRef.current = false; }
        if (s?.premium || n > 100) { clearInterval(pollRef.current); pollRef.current = null; if (n > 100) setWaiting(false); }
      }, 4000);
    } finally { setBusy(false); }
  };

  const checkNow = async () => { setBusy(true); setError(null); try { const s = await sync(); if (!s?.premium) setError(t('Paiement pas encore confirmé. Réessaie dans un instant.')); if (s?.error) setError(s.error); } finally { setBusy(false); } };

  const activateKey = async () => {
    if (!key.trim()) return;
    setBusy(true); setError(null);
    try { const r = await activate(key.trim()); if (!r?.ok) setError(r?.error || t('Clé invalide.')); else setKey(''); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(15,15,22,0.97)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 text-center relative shrink-0" style={{ background: 'radial-gradient(ellipse at 50% -20%, var(--accent-glow), transparent 70%)' }}>
          <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"><X className="w-4 h-4" /></button>
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, var(--accent-strong), var(--accent-2))', boxShadow: '0 8px 24px -4px var(--accent-glow)' }}>
            <Crown className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold os-text-gradient">Orbit Premium</h2>
          <p className="text-xs text-gray-400 mt-1">{t('Licence à vie · 1 appareil')}</p>
        </div>

        <div className="px-6 pb-6 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          {/* ── Premium actif ── */}
          {status.active ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/25">
                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-300">{t('Premium actif')}</p>
                  <p className="text-xs text-gray-400 truncate">{status.email}{status.plan ? ` · ${status.plan}` : ''}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 text-center">{t('Merci ! Tous les outils sont débloqués.')}</p>
            </div>
          ) : acct.loading ? (
            <div className="py-10 flex justify-center"><OrbitSpinner size={30} /></div>
          ) : !acct.server ? (
            /* ── 1. Serveur non configuré ── */
            <div className="space-y-3">
              <p className="text-sm text-gray-300">{t('Connecte d\'abord le serveur Orbit pour gérer ton compte et ton Premium.')}</p>
              <input value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="https://mon-serveur.onrender.com" className="os-input text-sm select-text" />
              <button onClick={saveServer} disabled={busy || !serverUrl.trim()} className="os-btn os-btn-primary w-full">{busy ? <OrbitSpinner size={16} /> : null} {t('Connecter le serveur')}</button>
            </div>
          ) : !acct.loggedIn ? (
            /* ── 2. Connexion / inscription ── */
            <div className="space-y-3">
              <p className="text-sm text-gray-300">{isRegister ? t('Crée ton compte Orbit pour acheter Premium.') : t('Connecte-toi à ton compte Orbit.')}</p>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder={t('Adresse e-mail')} className="os-input text-sm select-text" />
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder={t('Mot de passe')} onKeyDown={e => e.key === 'Enter' && doAuth()} className="os-input text-sm select-text" />
              <button onClick={doAuth} disabled={busy || !email.trim() || !password} className="os-btn os-btn-primary w-full">{busy ? <OrbitSpinner size={16} /> : null} {isRegister ? t('Créer le compte') : t('Se connecter')}</button>
              <button onClick={() => { setIsRegister(v => !v); setError(null); }} className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors">
                {isRegister ? t('J\'ai déjà un compte → Se connecter') : t('Pas de compte ? En créer un')}
              </button>
            </div>
          ) : (
            /* ── 3. Connecté, pas premium → achat ── */
            <div className="space-y-5">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="truncate">{t('Connecté :')} <span className="text-gray-200">{acct.email}</span></span>
                <button onClick={logout} className="flex items-center gap-1 hover:text-white transition-colors shrink-0"><LogOut className="w-3.5 h-3.5" /> {t('Déconnexion')}</button>
              </div>

              <div className="text-center">
                <span className="text-4xl font-extrabold os-text-gradient">{PRICE}</span>
                <p className="text-xs text-gray-500 mt-1">{t('Paiement unique — accès à vie')}</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-gray-300"><f.icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> {t(f.text)}</div>
                ))}
              </div>

              {waiting ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-white/[0.04] border border-white/10">
                    <OrbitSpinner size={22} className="shrink-0" />
                    <div className="text-xs text-gray-300">{t('En attente de la confirmation du paiement… Le Premium se débloque automatiquement.')}</div>
                  </div>
                  <button onClick={checkNow} disabled={busy} className="os-btn os-btn-secondary w-full"><RefreshCw className="w-4 h-4" /> {t('J\'ai payé — vérifier maintenant')}</button>
                </div>
              ) : (
                <button onClick={buy} disabled={busy} className="os-btn os-btn-primary w-full">
                  {busy ? <OrbitSpinner size={16} /> : <CreditCard className="w-4 h-4" />} {t('Acheter — {price}', { price: PRICE })}
                </button>
              )}

              <p className="text-[11px] text-gray-500 text-center">{t('Paiement sécurisé par Stripe (carte, PayPal selon ta région). Le débloquage est automatique.')}</p>

              {/* Repli : clé manuelle (crypto / SAV) */}
              {!showKey ? (
                <button onClick={() => setShowKey(true)} className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors">{t('Payé en crypto ou reçu une clé ? →')}</button>
              ) : (
                <div className="space-y-2 pt-1 border-t border-white/10">
                  <textarea value={key} onChange={e => setKey(e.target.value)} placeholder="ORBIT-…" rows={3} className="os-input font-mono text-xs resize-none select-text" />
                  <button onClick={activateKey} disabled={busy || !key.trim()} className="os-btn os-btn-secondary w-full"><Check className="w-4 h-4" /> {t('Activer ma clé')}</button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
