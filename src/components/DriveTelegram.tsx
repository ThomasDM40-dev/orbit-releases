import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, X, Loader2, LogOut, ShieldCheck, KeyRound, Phone, Hash } from 'lucide-react';
import { t } from '@/i18n';

const api = () => (window as any).electronAPI;
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-sky-500/50 transition-all w-full select-text";

// Défini au niveau module (pas dans le composant) pour ne pas perdre le focus à chaque frappe.
function Field({ icon, ...props }: any) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{icon}</div>
      <input {...props} className={INPUT + ' pl-9'} />
    </div>
  );
}

type Status = { hasApi: boolean; loggedIn: boolean; phone: string };
type Step = 'loading' | 'api' | 'phone' | 'code' | 'password' | 'done';

export default function DriveTelegram({ onClose, onChanged }: { onClose: () => void; onChanged?: () => void }) {
  const [step, setStep] = useState<Step>('loading');
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const refresh = async () => {
    const s: Status = await api().tgStatus();
    setStatus(s);
    setStep(s.loggedIn ? 'done' : (s.hasApi ? 'phone' : 'api'));
  };
  useEffect(() => { refresh(); }, []);

  const saveApi = async () => {
    setError(null);
    if (!apiId.trim() || !apiHash.trim()) { setError(t('Renseigne api_id et api_hash.')); return; }
    setBusy(true);
    try {
      const r = await api().tgSetApi({ apiId: apiId.trim(), apiHash: apiHash.trim() });
      if (!r?.ok) { setError(t('api_id / api_hash invalides.')); return; }
      setStep('phone');
    } finally { setBusy(false); }
  };

  const sendCode = async () => {
    setError(null);
    if (!phone.trim()) { setError(t('Entre ton numéro (format international, ex. +33...).')); return; }
    setBusy(true);
    try {
      const r = await api().tgSendCode({ phone: phone.trim() });
      if (!r?.ok) { setError(r?.error || t('Envoi du code impossible.')); return; }
      setStep('code');
    } finally { setBusy(false); }
  };

  const signIn = async () => {
    setError(null);
    if (!code.trim()) { setError(t('Entre le code reçu dans Telegram.')); return; }
    setBusy(true);
    try {
      const r = await api().tgSignIn({ code: code.trim() });
      if (r?.need2fa) { setStep('password'); return; }
      if (!r?.ok) { setError(r?.error || t('Code invalide.')); return; }
      await refresh(); onChanged?.();
    } finally { setBusy(false); }
  };

  const signInPassword = async () => {
    setError(null);
    if (!password) { setError(t('Entre ton mot de passe de validation en 2 étapes.')); return; }
    setBusy(true);
    try {
      const r = await api().tgSignInPassword({ password });
      if (!r?.ok) { setError(r?.error || t('Mot de passe incorrect.')); return; }
      await refresh(); onChanged?.();
    } finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try { await api().tgLogout(); setApiId(''); setApiHash(''); setPhone(''); setCode(''); setPassword(''); await refresh(); onChanged?.(); }
    finally { setBusy(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => !busy && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#15161d] border border-white/10 rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#3aa9ee,#2b7fd4)' }}>
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{t('Stockage Telegram')}</h3>
              <p className="text-xs text-gray-500">{t('Ton compte (MTProto) — sans bot')}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>

        {error && <div className="mb-4 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        {step === 'loading' && <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 text-gray-500 animate-spin" /></div>}

        {step === 'done' && status?.loggedIn && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-sm text-gray-200">{t('Connecté')} <span className="text-gray-400">· {status.phone}</span><div className="text-xs text-gray-500 mt-0.5">{t('Tes nouveaux fichiers iront sur ton Telegram (blocs de 100 Mo, chiffrés).')}</div></div>
            </div>
            <button onClick={logout} disabled={busy} className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} {t('Déconnecter Telegram')}
            </button>
          </div>
        )}

        {step === 'api' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{t('Sur my.telegram.org → API development tools, récupère :')}</p>
            <Field icon={<Hash className="w-4 h-4" />} placeholder="api_id" value={apiId} onChange={(e: any) => setApiId(e.target.value)} />
            <Field icon={<KeyRound className="w-4 h-4" />} placeholder="api_hash" value={apiHash} onChange={(e: any) => setApiHash(e.target.value)} />
            <button onClick={saveApi} disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#3aa9ee,#2b7fd4)' }}>{busy ? '…' : t('Continuer')}</button>
          </div>
        )}

        {step === 'phone' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{t('Ton numéro au format international (ex. +33612345678). Telegram t\'enverra un code DANS l\'app.')}</p>
            <Field icon={<Phone className="w-4 h-4" />} placeholder="+33612345678" value={phone} onChange={(e: any) => setPhone(e.target.value)} />
            <div className="flex gap-2">
              <button onClick={() => setStep('api')} disabled={busy} className="px-3 py-2.5 rounded-xl text-sm text-gray-400 bg-white/5 hover:bg-white/10 border border-white/10">{t('Retour')}</button>
              <button onClick={sendCode} disabled={busy} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#3aa9ee,#2b7fd4)' }}>{busy ? '…' : t('Envoyer le code')}</button>
            </div>
          </div>
        )}

        {step === 'code' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{t('Entre le code reçu dans la conversation « Telegram » de ton app.')}</p>
            <Field icon={<KeyRound className="w-4 h-4" />} placeholder={t('Code de connexion')} value={code} onChange={(e: any) => setCode(e.target.value)} />
            <button onClick={signIn} disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#3aa9ee,#2b7fd4)' }}>{busy ? '…' : t('Se connecter')}</button>
          </div>
        )}

        {step === 'password' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{t('Ton compte a la validation en 2 étapes. Entre ton mot de passe Telegram.')}</p>
            <Field icon={<ShieldCheck className="w-4 h-4" />} type="password" placeholder={t('Mot de passe 2FA')} value={password} onChange={(e: any) => setPassword(e.target.value)} />
            <button onClick={signInPassword} disabled={busy} className="w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#3aa9ee,#2b7fd4)' }}>{busy ? '…' : t('Se connecter')}</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
