import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, AlertCircle, Crown, ShieldCheck, ShieldOff, Smartphone, KeyRound, Copy, Check, RefreshCw, Users, CreditCard, Search } from 'lucide-react';
import { t } from '@/i18n';

const api = () => (window as any).electronAPI;
const INPUT = "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-pink-500/50 transition-all w-full select-text";

type Lic = {
  id: number; email: string; registered_at: string;
  premium: boolean; plan: string | null; device: string | null;
  provider: string | null; paid_at: string | null; activated_at: string | null;
};
type Pay = { email: string | null; amount: number; currency: string; created: number; userId: string | null; status: string; livemode: boolean };

const fmtDate = (s: string | number | null) => {
  if (!s) return '—';
  const d = typeof s === 'number' ? new Date(s * 1000) : new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
const fmtMoney = (amount: number, cur: string) => (amount / 100).toLocaleString(undefined, { style: 'currency', currency: (cur || 'eur').toUpperCase() });

export default function LicenseAdmin({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'licenses' | 'payments' | 'genkey'>('licenses');
  const [users, setUsers] = useState<Lic[]>([]);
  const [stats, setStats] = useState({ total: 0, premiumCount: 0 });
  const [payments, setPayments] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // Génération / octroi
  const [grantEmail, setGrantEmail] = useState('');
  const [genEmail, setGenEmail] = useState('');
  const [genKey, setGenKey] = useState('');
  const [copied, setCopied] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true); setError(null);
    const r = await api()?.licenseAdminList?.();
    if (r?.ok) { setUsers(r.users || []); setStats({ total: r.total || 0, premiumCount: r.premiumCount || 0 }); }
    else setError(r?.error || t('Échec du chargement.'));
    setLoading(false);
  }, []);

  const loadPayments = useCallback(async () => {
    setError(null);
    const r = await api()?.licenseAdminPayments?.();
    if (r?.ok) setPayments(r.payments || []);
    else setError(r?.error || t('Paiements indisponibles.'));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (tab === 'payments') loadPayments(); }, [tab, loadPayments]);

  const act = async (key: string, fn: () => Promise<any>, after?: () => void) => {
    setBusy(key); setError(null);
    try { const r = await fn(); if (r && r.ok === false) { setError(r.error || t('Échec')); return; } after?.(); }
    finally { setBusy(null); }
  };

  const grant = (email: string) => act('grant:' + email, () => api().licenseAdminGrant(email), loadList);
  const revoke = (email: string) => act('revoke:' + email, () => api().licenseAdminRevoke(email), loadList);
  const resetDevice = (email: string) => act('reset:' + email, () => api().licenseAdminResetDevice(email), loadList);

  const doGrantNew = () => {
    const e = grantEmail.trim().toLowerCase();
    if (!e) return;
    act('grantnew', () => api().licenseAdminGrant(e), () => { setGrantEmail(''); loadList(); });
  };

  const doGenKey = async () => {
    const e = genEmail.trim().toLowerCase();
    if (!e) return;
    setBusy('genkey'); setError(null); setGenKey('');
    try {
      const r = await api().licenseAdminGenKey(e);
      if (r?.ok && r.key) setGenKey(r.key);
      else setError(r?.error || t('Échec de la génération.'));
    } finally { setBusy(null); }
  };

  const copyKey = () => { navigator.clipboard.writeText(genKey); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const revenue = payments.reduce((s, p) => p.status === 'paid' ? s + p.amount : s, 0);
  const filtered = users.filter(u => !query.trim() || u.email.toLowerCase().includes(query.trim().toLowerCase()));

  const TabBtn = ({ id, icon: Icon, label }: { id: typeof tab; icon: any; label: string }) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${tab === id ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(15,15,25,0.96)', backdropFilter: 'blur(24px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h2 className="text-base font-semibold flex items-center gap-2"><Crown className="w-5 h-5" style={{ color: 'var(--accent-strong)' }} /> <span className="os-text-gradient">{t('Administration des licences')}</span></h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { loadList(); if (tab === 'payments') loadPayments(); }} title={t('Rafraîchir')} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-white/10">
          <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Users className="w-3.5 h-3.5" /> {t('Comptes')}</div>
            <div className="text-xl font-bold text-gray-100">{stats.total}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Crown className="w-3.5 h-3.5" /> {t('Premium')}</div>
            <div className="text-xl font-bold" style={{ color: 'var(--accent-strong)' }}>{stats.premiumCount}</div>
          </div>
          <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><CreditCard className="w-3.5 h-3.5" /> {t('Revenus (récents)')}</div>
            <div className="text-xl font-bold text-emerald-400">{payments.length ? fmtMoney(revenue, payments[0]?.currency || 'eur') : '—'}</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/10">
          <TabBtn id="licenses" icon={ShieldCheck} label={t('Licences')} />
          <TabBtn id="payments" icon={CreditCard} label={t('Paiements')} />
          <TabBtn id="genkey" icon={KeyRound} label={t('Générer une clé')} />
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {/* ── LICENCES ── */}
          {tab === 'licenses' && (
            <div className="space-y-3">
              {/* Octroi rapide */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className={INPUT + ' pl-9'} placeholder={t('Rechercher un e-mail…')} value={query} onChange={e => setQuery(e.target.value)} />
                </div>
                <input className={INPUT + ' flex-1'} placeholder={t('Donner Premium à un e-mail…')} value={grantEmail} onChange={e => setGrantEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doGrantNew()} />
                <button onClick={doGrantNew} disabled={busy === 'grantnew' || !grantEmail.trim()} className="shrink-0 px-3 rounded-lg bg-pink-500/20 text-pink-300 hover:bg-pink-500/30 disabled:opacity-40 text-sm font-semibold flex items-center gap-1.5">
                  {busy === 'grantnew' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />} {t('Offrir')}
                </button>
              </div>

              {loading ? (
                <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-500" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-600 py-8 text-center">{t('Aucun compte.')}</p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      {u.premium ? <Crown className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> : <ShieldOff className="w-4 h-4 shrink-0 text-gray-600" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 truncate flex items-center gap-2">
                          {u.email}
                          {u.premium && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">{(u.plan || 'lifetime').toUpperCase()}</span>}
                          {u.provider && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400">{u.provider}</span>}
                        </div>
                        <div className="text-[11px] text-gray-600 truncate flex items-center gap-2">
                          {u.premium ? <>{t('Payé')} : {fmtDate(u.paid_at)}</> : <>{t('Inscrit')} : {fmtDate(u.registered_at)}</>}
                          {u.device && <span className="flex items-center gap-1"><Smartphone className="w-3 h-3" /> {t('appareil lié')}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {u.device && (
                          <button onClick={() => resetDevice(u.email)} disabled={!!busy} title={t('Réinitialiser l\'appareil')} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-white/10">
                            {busy === 'reset:' + u.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                          </button>
                        )}
                        {u.premium ? (
                          <button onClick={() => revoke(u.email)} disabled={!!busy} title={t('Révoquer')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/10">
                            {busy === 'revoke:' + u.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                          </button>
                        ) : (
                          <button onClick={() => grant(u.email)} disabled={!!busy} title={t('Donner Premium')} className="p-1.5 rounded-lg text-gray-400 hover:text-green-400 hover:bg-white/10">
                            {busy === 'grant:' + u.email ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PAIEMENTS ── */}
          {tab === 'payments' && (
            <div className="space-y-1.5">
              {payments.length === 0 ? (
                <p className="text-sm text-gray-600 py-8 text-center">{t('Aucun paiement récent.')}</p>
              ) : payments.map((p, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                  <CreditCard className="w-4 h-4 shrink-0 text-emerald-400" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">{p.email || t('(inconnu)')}</div>
                    <div className="text-[11px] text-gray-600">{fmtDate(p.created)}{!p.livemode && <span className="ml-2 text-amber-400/70">TEST</span>}</div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-400 shrink-0">{fmtMoney(p.amount, p.currency)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── GÉNÉRER UNE CLÉ ── */}
          {tab === 'genkey' && (
            <div className="space-y-3 max-w-xl">
              <p className="text-sm text-gray-400">{t('Génère une clé signée à vie pour un e-mail (livraison manuelle : crypto, cadeau, SAV). Le client la colle dans « Payé en crypto ou reçu une clé ? ».')}</p>
              <div className="flex gap-2">
                <input className={INPUT} type="email" placeholder={t('Adresse e-mail du client')} value={genEmail} onChange={e => setGenEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doGenKey()} />
                <button onClick={doGenKey} disabled={busy === 'genkey' || !genEmail.trim()} className="shrink-0 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}>
                  {busy === 'genkey' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />} {t('Générer')}
                </button>
              </div>
              {genKey && (
                <div className="space-y-2">
                  <div className="relative">
                    <textarea readOnly value={genKey} rows={4} className="os-input font-mono text-xs resize-none select-text w-full pr-10" />
                    <button onClick={copyKey} title={t('Copier')} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">{t('Envoie cette clé au client. Elle est liée au 1er appareil sur lequel il l\'active.')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
