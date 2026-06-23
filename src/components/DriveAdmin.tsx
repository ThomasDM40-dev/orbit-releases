import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Plus, Trash2, Check, Loader2, Link2, Power, FolderCog, AlertCircle } from 'lucide-react';
import { t } from '@/i18n';

const api = () => (window as any).electronAPI;
const INPUT = "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-pink-500/50 transition-all w-full select-text";

type Profile = { id: string; label: string; active: boolean; webhookCount: number; enabledCount: number };
type Webhook = { id: string; profileId: string; label: string; enabled: boolean; urlMasked: string };

export default function DriveAdmin({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newProfile, setNewProfile] = useState('');
  const [whLabel, setWhLabel] = useState('');
  const [whUrl, setWhUrl] = useState('');

  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setError(null);
    try { const r = await fn(); if (r && r.ok === false) { setError(r.error || t('Échec')); return null; } return r; }
    finally { setBusy(false); }
  };

  const loadProfiles = useCallback(async () => {
    const r = await api().cloudAdminProfiles();
    if (r?.ok) {
      setProfiles(r.profiles);
      setSelected(prev => prev && r.profiles.some((p: Profile) => p.id === prev) ? prev : (r.profiles.find((p: Profile) => p.active)?.id || r.profiles[0]?.id || null));
    } else setError(r?.error || t('Échec'));
  }, []);

  const loadWebhooks = useCallback(async (pid: string) => {
    const r = await api().cloudAdminWebhooks({ profileId: pid });
    if (r?.ok) setWebhooks(r.webhooks); else setError(r?.error || t('Échec'));
  }, []);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { if (selected) loadWebhooks(selected); else setWebhooks([]); }, [selected, loadWebhooks]);

  const createProfile = async () => {
    if (!newProfile.trim()) return;
    if (await run(() => api().cloudAdminCreateProfile({ label: newProfile.trim() }))) { setNewProfile(''); await loadProfiles(); }
  };
  const activateProfile = async (id: string) => { if (await run(() => api().cloudAdminActivateProfile({ id }))) await loadProfiles(); };
  const deleteProfile = async (id: string) => {
    if (!window.confirm(t('Supprimer ce profil ?'))) return;
    if (await run(() => api().cloudAdminDeleteProfile({ id }))) await loadProfiles();
  };
  const addWebhook = async () => {
    if (!selected || !whUrl.trim()) return;
    if (await run(() => api().cloudAdminAddWebhook({ profileId: selected, label: whLabel.trim(), url: whUrl.trim() }))) {
      setWhLabel(''); setWhUrl(''); await loadWebhooks(selected); await loadProfiles();
    }
  };
  const toggleWebhook = async (w: Webhook) => { if (await run(() => api().cloudAdminToggleWebhook({ id: w.id, enabled: !w.enabled }))) { await loadWebhooks(selected!); await loadProfiles(); } };
  const deleteWebhook = async (w: Webhook) => {
    if (!window.confirm(t('Supprimer ce webhook ?'))) return;
    if (await run(() => api().cloudAdminDeleteWebhook({ id: w.id }))) { await loadWebhooks(selected!); await loadProfiles(); }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6" onMouseDown={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        onMouseDown={e => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-2xl border border-white/10 overflow-hidden"
        style={{ background: 'rgba(15,15,25,0.95)', backdropFilter: 'blur(24px)' }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h2 className="text-base font-semibold text-white flex items-center gap-2"><FolderCog className="w-5 h-5 text-pink-400" /> {t('Webhooks & profils')}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-300"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="flex-1 overflow-hidden grid grid-cols-[260px_1fr]">
          {/* Profils */}
          <div className="border-r border-white/10 p-4 overflow-y-auto">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('Profils')}</p>
            <div className="space-y-1.5 mb-3">
              {profiles.map(p => (
                <div key={p.id} className={`group rounded-xl px-3 py-2 border transition-colors cursor-pointer ${selected === p.id ? 'bg-white/8 border-pink-500/30' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'}`} onClick={() => setSelected(p.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-gray-200 truncate flex items-center gap-1.5">{p.label}{p.active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300">{t('ACTIF')}</span>}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-gray-500">{p.enabledCount}/{p.webhookCount} {t('actifs')}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!p.active && <button onClick={(e) => { e.stopPropagation(); activateProfile(p.id); }} title={t('Activer')} className="p-1 rounded text-gray-400 hover:text-green-400 hover:bg-white/10"><Power className="w-3.5 h-3.5" /></button>}
                      <button onClick={(e) => { e.stopPropagation(); deleteProfile(p.id); }} title={t('Supprimer le profil')} className="p-1 rounded text-gray-400 hover:text-red-400 hover:bg-white/10"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              <input className={INPUT} placeholder={t('Nouveau profil')} value={newProfile} onChange={e => setNewProfile(e.target.value)} onKeyDown={e => e.key === 'Enter' && createProfile()} />
              <button onClick={createProfile} disabled={busy || !newProfile.trim()} className="shrink-0 px-2.5 rounded-lg bg-pink-500/20 text-pink-300 hover:bg-pink-500/30 disabled:opacity-40"><Plus className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Webhooks du profil sélectionné */}
          <div className="p-4 overflow-y-auto">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{t('Webhooks du profil')}</p>
            <div className="space-y-1.5 mb-4">
              {webhooks.length === 0 && <p className="text-sm text-gray-600 py-4 text-center">{t('Aucun webhook dans ce profil.')}</p>}
              {webhooks.map(w => (
                <div key={w.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5">
                  <Link2 className={`w-4 h-4 shrink-0 ${w.enabled ? 'text-pink-400' : 'text-gray-600'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${w.enabled ? 'text-gray-200' : 'text-gray-500'}`}>{w.label || t('Webhook')}</div>
                    <div className="text-[11px] text-gray-600 truncate">{w.urlMasked}</div>
                  </div>
                  <button onClick={() => toggleWebhook(w)} title={w.enabled ? t('Désactiver') : t('Activer')} className={`p-1.5 rounded-lg hover:bg-white/10 ${w.enabled ? 'text-green-400' : 'text-gray-500'}`}>{w.enabled ? <Check className="w-4 h-4" /> : <Power className="w-4 h-4" />}</button>
                  <button onClick={() => deleteWebhook(w)} title={t('Supprimer')} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-white/10"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            {selected && (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{t('Ajouter un webhook')}</p>
                <input className={INPUT} placeholder={t('Libellé (ex. Salon 1)')} value={whLabel} onChange={e => setWhLabel(e.target.value)} />
                <input className={INPUT} placeholder="https://discord.com/api/webhooks/…" value={whUrl} onChange={e => setWhUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWebhook()} />
                <button onClick={addWebhook} disabled={busy || !whUrl.trim()} className="w-full py-2 rounded-lg text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #e879f9, #a855f7)' }}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {t('Ajouter')}
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
