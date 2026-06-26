import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Check, Loader2, X, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';
import { usePremium } from '@/premium';
import { t } from '@/i18n';

const BUY_URL = 'https://skeavisuals.com/premium';

export default function PremiumModal({ onClose }: { onClose: () => void }) {
  const { status, activate, deactivate } = usePremium();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await activate(key.trim());
      if (!r?.ok) setError(r?.error || t('Clé invalide.'));
      else setKey('');
    } finally { setBusy(false); }
  };

  const openBuy = () => (window as any).electronAPI?.openExternalUrl?.(BUY_URL);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(15,15,22,0.97)', boxShadow: '0 30px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center relative" style={{ background: 'radial-gradient(ellipse at 50% -20%, var(--accent-glow), transparent 70%)' }}>
          <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"><X className="w-4 h-4" /></button>
          <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, var(--accent-strong), var(--accent-2))', boxShadow: '0 8px 24px -4px var(--accent-glow)' }}>
            <Crown className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold os-text-gradient">Orbit Premium</h2>
          <p className="text-xs text-gray-400 mt-1">{t('Licence à vie · 1 appareil')}</p>
        </div>

        <div className="px-6 pb-6 pt-2">
          {status.active ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/25">
                <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-emerald-300">{t('Premium actif')}</p>
                  <p className="text-xs text-gray-400 truncate">{status.email}{status.plan ? ` · ${status.plan}` : ''}</p>
                </div>
              </div>
              <button onClick={deactivate} className="os-btn os-btn-secondary w-full">{t('Désactiver sur cet appareil')}</button>
            </div>
          ) : (
            <div className="space-y-4">
              {status.deviceMismatch && (
                <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('Cette licence est liée à un autre appareil.')}</span>
                </div>
              )}
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t('Clé de licence')}</label>
                <textarea
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="ORBIT-…"
                  rows={3}
                  className="os-input mt-1 font-mono text-xs resize-none select-text"
                />
              </div>
              {error && (
                <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <button onClick={handleActivate} disabled={busy || !key.trim()} className="os-btn os-btn-primary w-full">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {busy ? t('Activation…') : t('Activer Premium')}
              </button>
              <button onClick={openBuy} className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                {t('Pas encore de clé ? Obtenir Premium')} <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
