import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Check, Loader2, X, ShieldCheck, AlertCircle, ExternalLink, CreditCard, Wallet, Coins, Copy, Sparkles, Zap, Lock } from 'lucide-react';
import { usePremium } from '@/premium';
import { t } from '@/i18n';

// ⚙️ ─────────────────────────────────────────────────────────────────────────
// CONFIG PAIEMENT — remplace par TES vrais liens / adresses.
// (Le client paie via le checkout hébergé, puis reçoit sa clé par e-mail.)
const PAY = {
  price: '14,99 €',
  // Stripe Payment Link (Dashboard Stripe → Paiements → Liens de paiement)
  stripe: 'https://buy.stripe.com/REMPLACE_MOI',
  // PayPal.me ou lien Smart Button
  paypal: 'https://www.paypal.com/paypalme/REMPLACE_MOI/14.99',
  // Adresses crypto (laisse vide '' pour masquer une ligne)
  crypto: [
    { label: 'Bitcoin (BTC)', address: 'bc1qREMPLACE_MOI' },
    { label: 'Ethereum (ETH)', address: '0xREMPLACE_MOI' },
    { label: 'USDT (ERC-20)', address: '0xREMPLACE_MOI' },
  ],
  // E-mail où le client t'écrit / reçoit sa clé
  contactEmail: 'duguemerellethomas@gmail.com',
};
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: Sparkles, text: 'Tous les outils IA : Topaz, Upscale, Interpolation, Détourage, Gomme magique' },
  { icon: Zap, text: 'Génération d\'images & transcription sans quota' },
  { icon: Crown, text: 'Téléchargements illimités + stockage Drive étendu' },
  { icon: Lock, text: 'Licence à vie — payée une seule fois, liée à 1 appareil' },
];

const open = (url: string) => (window as any).electronAPI?.openExternalUrl?.(url);
// Un lien/adresse est "prêt" tant qu'il ne contient pas le marqueur placeholder.
const isSet = (s: string) => !!s && !s.includes('REMPLACE_MOI');

export default function PremiumModal({ onClose }: { onClose: () => void }) {
  const { status, activate, deactivate } = usePremium();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCrypto, setShowCrypto] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await activate(key.trim());
      if (!r?.ok) setError(r?.error || t('Clé invalide.'));
      else setKey('');
    } finally { setBusy(false); }
  };

  const copy = async (addr: string) => {
    try { await navigator.clipboard.writeText(addr); setCopied(addr); setTimeout(() => setCopied(null), 1500); } catch {}
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
            <div className="space-y-5">
              {/* Prix */}
              <div className="text-center">
                <div className="flex items-end justify-center gap-1.5">
                  <span className="text-4xl font-extrabold os-text-gradient">{PAY.price}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{t('Paiement unique — accès à vie')}</p>
              </div>

              {/* Avantages */}
              <div className="grid grid-cols-1 gap-2">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm text-gray-300">
                    <f.icon className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> {t(f.text)}
                  </div>
                ))}
              </div>

              {/* Moyens de paiement */}
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t('Payer avec')}</p>
                <button onClick={() => open(PAY.stripe)} disabled={!isSet(PAY.stripe)} className="os-btn os-btn-primary w-full justify-between">
                  <span className="flex items-center gap-2"><CreditCard className="w-4 h-4" /> {t('Carte bancaire')}</span>
                  {isSet(PAY.stripe) ? <ExternalLink className="w-3.5 h-3.5 opacity-80" /> : <span className="text-[10px] opacity-80">{t('bientôt')}</span>}
                </button>
                <button onClick={() => open(PAY.paypal)} disabled={!isSet(PAY.paypal)} className="os-btn os-btn-secondary w-full justify-between">
                  <span className="flex items-center gap-2"><Wallet className="w-4 h-4" /> PayPal</span>
                  {isSet(PAY.paypal) ? <ExternalLink className="w-3.5 h-3.5 opacity-70" /> : <span className="text-[10px] opacity-70">{t('bientôt')}</span>}
                </button>
                <button onClick={() => setShowCrypto(v => !v)} className="os-btn os-btn-secondary w-full justify-between">
                  <span className="flex items-center gap-2"><Coins className="w-4 h-4" /> {t('Crypto (BTC / ETH / USDT)')}</span>
                  <span className="text-xs opacity-70">{showCrypto ? '▲' : '▼'}</span>
                </button>
                {showCrypto && (
                  <div className="space-y-2 rounded-xl bg-white/[0.03] border border-white/10 p-3">
                    {PAY.crypto.filter(c => isSet(c.address)).length === 0 && (
                      <p className="text-[11px] text-gray-500">{t('Adresses crypto bientôt disponibles.')}</p>
                    )}
                    {PAY.crypto.filter(c => isSet(c.address)).map((c) => (
                      <div key={c.label}>
                        <p className="text-[11px] text-gray-400 mb-1">{c.label}</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 text-[11px] text-gray-300 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 truncate select-text">{c.address}</code>
                          <button onClick={() => copy(c.address)} className="shrink-0 p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all" title={t('Copier')}>
                            {copied === c.address ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-500 pt-1">{t('Après envoi, écris-moi à {email} avec la transaction pour recevoir ta clé.', { email: PAY.contactEmail })}</p>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-[11px] text-gray-400 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-strong)' }} />
                <span>{t('Après le paiement, tu reçois ta clé par e-mail. Colle-la ci-dessous pour activer Premium.')}</span>
              </div>

              {/* Activation clé */}
              {!showKey ? (
                <button onClick={() => setShowKey(true)} className="w-full text-center text-xs text-gray-400 hover:text-white transition-colors py-1">
                  {t('J\'ai déjà une clé →')}
                </button>
              ) : (
                <div className="space-y-3 pt-1 border-t border-white/10">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t('Clé de licence')}</label>
                  <textarea value={key} onChange={e => setKey(e.target.value)} placeholder="ORBIT-…" rows={3} className="os-input font-mono text-xs resize-none select-text" />
                  {status.deviceMismatch && (
                    <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{t('Cette licence est liée à un autre appareil.')}</span>
                    </div>
                  )}
                  {error && (
                    <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                  )}
                  <button onClick={handleActivate} disabled={busy || !key.trim()} className="os-btn os-btn-primary w-full">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {busy ? t('Activation…') : t('Activer Premium')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
