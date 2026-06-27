import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, AlertCircle, Crown, ShieldCheck, ShieldOff, Smartphone, KeyRound,
  Copy, Check, RefreshCw, Users, CreditCard, Search, Trash2, ChevronDown, Gift, Mail, Calendar, Fingerprint, Hash, Tag,
} from 'lucide-react';
import { t } from '@/i18n';
import OrbitSpinner from '@/components/OrbitSpinner';

const api = () => (window as any).electronAPI;
const INPUT = "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-pink-500/50 transition-all w-full select-text";

type Lic = {
  id: number | string; email: string; registered_at: string;
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
  const [filter, setFilter] = useState<'all' | 'premium' | 'free'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Lic | null>(null);

  const [grantEmail, setGrantEmail] = useState('');
  const [genEmail, setGenEmail] = useState('');
  const [genKey, setGenKey] = useState('');
  const [devInput, setDevInput] = useState('');
  const [devNote, setDevNote] = useState('');
  const [devices, setDevices] = useState<{ device: string; note: string | null; plan: string | null; created_at: string }[]>([]);

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

  const loadDevices = useCallback(async () => {
    const r = await api()?.licenseAdminDevices?.();
    if (r?.ok) setDevices(r.devices || []);
  }, []);

  useEffect(() => { loadList(); loadPayments(); loadDevices(); }, [loadList, loadPayments, loadDevices]);

  const grantDevice = async () => {
    const d = devInput.trim();
    if (!d) return;
    setBusy('grantdev'); setError(null);
    try {
      const r = await api().licenseAdminGrantDevice(d, devNote.trim());
      if (r?.ok === false) { setError(r.error || t('Échec')); return; }
      setDevInput(''); setDevNote(''); await loadDevices();
    } finally { setBusy(null); }
  };
  const revokeDevice = async (device: string) => {
    setBusy('revdev:' + device); setError(null);
    try { const r = await api().licenseAdminRevokeDevice(device); if (r?.ok === false) { setError(r.error || t('Échec')); return; } await loadDevices(); }
    finally { setBusy(null); }
  };

  const copy = (text: string, field: string) => { navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 1500); };

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError(null);
    try { const r = await fn(); if (r && r.ok === false) { setError(r.error || t('Échec')); return false; } await loadList(); return true; }
    finally { setBusy(null); }
  };

  const grant = (email: string) => act('grant:' + email, () => api().licenseAdminGrant(email));
  const revoke = (email: string) => act('revoke:' + email, () => api().licenseAdminRevoke(email));
  const resetDevice = (email: string) => act('reset:' + email, () => api().licenseAdminResetDevice(email));
  const del = async (email: string) => {
    setConfirmDel(null);
    await act('del:' + email, () => api().licenseAdminDeleteUser(email));
  };

  const doGrantNew = async () => {
    const e = grantEmail.trim().toLowerCase();
    if (!e) return;
    if (await act('grantnew', () => api().licenseAdminGrant(e))) setGrantEmail('');
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

  const revenue = payments.reduce((s, p) => p.status === 'paid' ? s + p.amount : s, 0);
  const freeCount = Math.max(0, stats.total - stats.premiumCount);
  const filtered = users.filter(u => {
    if (filter === 'premium' && !u.premium) return false;
    if (filter === 'free' && u.premium) return false;
    return !query.trim() || u.email.toLowerCase().includes(query.trim().toLowerCase());
  });

  const TabBtn = ({ id, icon: Icon, label }: { id: typeof tab; icon: any; label: string }) => (
    <button onClick={() => setTab(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${tab === id ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  const Stat = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color?: string }) => (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Icon className="w-3.5 h-3.5" /> {label}</div>
      <div className="text-xl font-bold" style={color ? { color } : { color: '#e5e7eb' }}>{value}</div>
    </div>
  );

  const Detail = ({ icon: Icon, label, value, copyKey }: { icon: any; label: string; value: string; copyKey?: string }) => (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-gray-600 shrink-0" />
      <span className="text-gray-500 shrink-0">{label} :</span>
      <span className="text-gray-300 font-mono truncate">{value}</span>
      {copyKey && value !== '—' && (
        <button onClick={() => copy(value, copyKey)} className="text-gray-600 hover:text-white shrink-0">
          {copiedField === copyKey ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(15,15,25,0.97)', backdropFilter: 'blur(24px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h2 className="text-base font-semibold flex items-center gap-2"><Crown className="w-5 h-5" style={{ color: 'var(--accent-strong)' }} /> <span className="os-text-gradient">{t('Administration des licences')}</span></h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { loadList(); loadPayments(); }} title={t('Rafraîchir')} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"><RefreshCw className="w-4 h-4" /></button>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-white/10">
          <Stat icon={Users} label={t('Comptes')} value={stats.total} />
          <Stat icon={Crown} label={t('Premium')} value={stats.premiumCount} color="var(--accent-strong)" />
          <Stat icon={ShieldOff} label={t('Gratuits')} value={freeCount} color="#9ca3af" />
          <Stat icon={CreditCard} label={t('Revenus')} value={payments.length ? fmtMoney(revenue, payments[0]?.currency || 'eur') : '—'} color="#34d399" />
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
              {/* Offrir Premium */}
              <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-400"><Gift className="w-4 h-4" style={{ color: 'var(--accent-strong)' }} /> {t('Offrir Premium à un compte existant (ton ami doit avoir créé un compte Orbit avec cet e-mail)')}</div>
                <div className="flex gap-2">
                  <input className={INPUT} type="email" placeholder={t('e-mail du compte…')} value={grantEmail} onChange={e => setGrantEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doGrantNew()} />
                  <button onClick={doGrantNew} disabled={busy === 'grantnew' || !grantEmail.trim()} className="shrink-0 px-4 rounded-lg bg-pink-500/20 text-pink-300 hover:bg-pink-500/30 disabled:opacity-40 text-sm font-semibold flex items-center gap-1.5">
                    {busy === 'grantnew' ? <OrbitSpinner size={16} /> : <Crown className="w-4 h-4" />} {t('Offrir')}
                  </button>
                </div>
              </div>

              {/* Recherche + filtres */}
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input className={INPUT + ' pl-9'} placeholder={t('Rechercher un e-mail…')} value={query} onChange={e => setQuery(e.target.value)} />
                </div>
                {(['all', 'premium', 'free'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${filter === f ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                    {f === 'all' ? t('Tous') : f === 'premium' ? t('Premium') : t('Gratuits')}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="py-10 flex justify-center"><OrbitSpinner size={28} /></div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-600 py-8 text-center">{t('Aucun compte.')}</p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(u => {
                    const open = expanded === u.email;
                    return (
                      <div key={String(u.id)} className="rounded-xl bg-white/[0.03] border border-white/5 overflow-hidden">
                        <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpanded(open ? null : u.email)}>
                          {u.premium ? <Crown className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> : <ShieldOff className="w-4 h-4 shrink-0 text-gray-600" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-gray-200 truncate flex items-center gap-2">
                              {u.email}
                              {u.premium && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">{(u.plan || 'lifetime').toUpperCase()}</span>}
                              {u.provider && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 text-gray-400">{u.provider}</span>}
                              {u.device && <Smartphone className="w-3 h-3 text-gray-500" />}
                            </div>
                            <div className="text-[11px] text-gray-600 truncate">{u.premium ? <>{t('Payé')} : {fmtDate(u.paid_at)}</> : <>{t('Inscrit')} : {fmtDate(u.registered_at)}</>}</div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </div>

                        <AnimatePresence>
                          {open && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-2.5">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2">
                                  <Detail icon={Hash} label="ID" value={String(u.id)} />
                                  <Detail icon={Tag} label={t('Plan')} value={u.premium ? (u.plan || 'lifetime') : t('gratuit')} />
                                  <Detail icon={Mail} label="E-mail" value={u.email} copyKey={'email:' + u.id} />
                                  <Detail icon={CreditCard} label={t('Source')} value={u.provider || '—'} />
                                  <Detail icon={Calendar} label={t('Inscrit')} value={fmtDate(u.registered_at)} />
                                  <Detail icon={Calendar} label={t('Payé')} value={fmtDate(u.paid_at)} />
                                  <Detail icon={Fingerprint} label={t('Appareil')} value={u.device || '—'} copyKey={'dev:' + u.id} />
                                  <Detail icon={Calendar} label={t('Activé')} value={fmtDate(u.activated_at)} />
                                </div>
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                  {u.premium ? (
                                    <button onClick={() => revoke(u.email)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 flex items-center gap-1.5 disabled:opacity-40">
                                      {busy === 'revoke:' + u.email ? <OrbitSpinner size={14} /> : <ShieldOff className="w-3.5 h-3.5" />} {t('Révoquer Premium')}
                                    </button>
                                  ) : (
                                    <button onClick={() => grant(u.email)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-300 hover:bg-green-500/20 flex items-center gap-1.5 disabled:opacity-40">
                                      {busy === 'grant:' + u.email ? <OrbitSpinner size={14} /> : <ShieldCheck className="w-3.5 h-3.5" />} {t('Donner Premium')}
                                    </button>
                                  )}
                                  {u.device && (
                                    <button onClick={() => resetDevice(u.email)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 flex items-center gap-1.5 disabled:opacity-40">
                                      {busy === 'reset:' + u.email ? <OrbitSpinner size={14} /> : <Smartphone className="w-3.5 h-3.5" />} {t('Réinitialiser l\'appareil')}
                                    </button>
                                  )}
                                  <button onClick={() => setConfirmDel(u)} disabled={!!busy} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-400 hover:bg-red-500/20 hover:text-red-300 flex items-center gap-1.5 disabled:opacity-40 ml-auto">
                                    {busy === 'del:' + u.email ? <OrbitSpinner size={14} /> : <Trash2 className="w-3.5 h-3.5" />} {t('Supprimer le compte')}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
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
                    <div className="text-[11px] text-gray-600">{fmtDate(p.created)}{!p.livemode && <span className="ml-2 text-amber-400/70">TEST</span>}{p.status === 'no_payment_required' && <span className="ml-2 text-sky-400/70">{t('CODE PROMO')}</span>}</div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-400 shrink-0">{fmtMoney(p.amount, p.currency)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── GÉNÉRER UNE CLÉ ── */}
          {tab === 'genkey' && (
            <div className="space-y-3 max-w-xl">
              <p className="text-sm text-gray-400">{t('Génère une clé signée à vie pour un e-mail (livraison manuelle : crypto, cadeau, SAV). Le client la colle dans « Payé en crypto ou reçu une clé ? » — ça marche même sans compte.')}</p>
              <div className="flex gap-2">
                <input className={INPUT} type="email" placeholder={t('Adresse e-mail du client')} value={genEmail} onChange={e => setGenEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doGenKey()} />
                <button onClick={doGenKey} disabled={busy === 'genkey' || !genEmail.trim()} className="shrink-0 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}>
                  {busy === 'genkey' ? <OrbitSpinner size={16} /> : <KeyRound className="w-4 h-4" />} {t('Générer')}
                </button>
              </div>
              {genKey && (
                <div className="space-y-2">
                  <div className="relative">
                    <textarea readOnly value={genKey} rows={4} className="os-input font-mono text-xs resize-none select-text w-full pr-10" />
                    <button onClick={() => copy(genKey, 'genkey')} title={t('Copier')} className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10">
                      {copiedField === 'genkey' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-500">{t('Envoie cette clé au client. Elle est liée au 1er appareil sur lequel il l\'active.')}</p>
                </div>
              )}

              {/* Offrir par ID d'appareil (sans compte ni clé à renvoyer) */}
              <div className="pt-4 mt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-300"><Gift className="w-4 h-4" style={{ color: 'var(--accent-strong)' }} /> {t('Offrir par ID d\'appareil')}</div>
                <p className="text-[11px] text-gray-500">{t('Demande à ton ami son « ID d\'appareil » (affiché dans sa fenêtre Premium), colle-le ici → son app se débloque toute seule, sans compte ni paiement.')}</p>
                <input className={INPUT + ' font-mono text-xs'} placeholder={t('ID d\'appareil de l\'ami')} value={devInput} onChange={e => setDevInput(e.target.value)} />
                <div className="flex gap-2">
                  <input className={INPUT} placeholder={t('Note (ex. cadeau Théo) — optionnel')} value={devNote} onChange={e => setDevNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && grantDevice()} />
                  <button onClick={grantDevice} disabled={busy === 'grantdev' || !devInput.trim()} className="shrink-0 px-4 rounded-lg bg-pink-500/20 text-pink-300 hover:bg-pink-500/30 disabled:opacity-40 text-sm font-semibold flex items-center gap-1.5">
                    {busy === 'grantdev' ? <OrbitSpinner size={16} /> : <Gift className="w-4 h-4" />} {t('Offrir')}
                  </button>
                </div>
                {devices.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{t('Appareils offerts')}</p>
                    {devices.map(d => (
                      <div key={d.device} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5">
                        <Fingerprint className="w-4 h-4 text-gray-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-200 truncate">{d.note || t('(sans note)')}</div>
                          <div className="text-[10px] text-gray-600 font-mono truncate">{d.device}</div>
                        </div>
                        <button onClick={() => revokeDevice(d.device)} disabled={!!busy} title={t('Révoquer')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/10 shrink-0">
                          {busy === 'revdev:' + d.device ? <OrbitSpinner size={14} /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Confirmation de suppression (stylée, remplace window.confirm) */}
      <AnimatePresence>
        {confirmDel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onMouseDown={() => setConfirmDel(null)}>
            <motion.div initial={{ scale: 0.92, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} onMouseDown={e => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-red-500/20 overflow-hidden" style={{ background: 'rgba(22,13,17,0.98)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
              <div className="p-6 text-center">
                <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-red-500/15 border border-red-500/25">
                  <Trash2 className="w-7 h-7 text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{t('Supprimer ce compte ?')}</h3>
                <p className="text-sm text-gray-300 mb-1 break-all">{confirmDel.email}</p>
                <p className="text-xs text-gray-500 mb-5">{confirmDel.premium ? t('Ce compte est Premium — sa licence sera aussi supprimée.') : t('Cette action est définitive et irréversible.')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDel(null)} className="os-btn os-btn-secondary flex-1">{t('Annuler')}</button>
                  <button onClick={() => del(confirmDel.email)} disabled={busy === 'del:' + confirmDel.email}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)', boxShadow: '0 8px 24px -6px rgba(239,68,68,0.6)' }}>
                    {busy === 'del:' + confirmDel.email ? <OrbitSpinner size={16} /> : <Trash2 className="w-4 h-4" />} {t('Supprimer')}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
