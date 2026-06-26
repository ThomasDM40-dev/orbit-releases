import { useState } from 'react';
import { UploadCloud, Download, Copy, Check, Loader2, Link2, FileUp } from 'lucide-react';
import { t } from '@/i18n';
import { useEta } from '@/eta';

const api = () => (window as any).electronAPI;
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const INPUT = "bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 outline-none hover:bg-white/10 focus:border-pink-500/50 transition-all w-full select-text";

type Drop = { name: string; code: string };

export default function DriveDrop({ progress }: { progress?: { phase: string; name?: string; percent: number; chunk?: number; chunks?: number } | null }) {
  const [tab, setTab] = useState<'send' | 'receive'>('send');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const prog = progress;
  const eta = useEta(prog);

  const send = async () => {
    setError(null); setOkMsg(null);
    const paths = await api().discloudPickFiles();
    if (!paths?.length) return;
    setBusy(true);
    try {
      const r = await api().dropUpload({ paths, jobId: uid() });
      if (!r?.ok) { setError(r?.error || t('Échec du dépôt')); return; }
      setDrops(prev => [...(r.drops || []), ...prev]);
    } finally { setBusy(false); }
  };

  const receive = async () => {
    setError(null); setOkMsg(null);
    if (!code.trim()) { setError(t('Colle un code de partage.')); return; }
    setBusy(true);
    try {
      const r = await api().dropDownload({ code: code.trim(), jobId: uid() });
      if (!r?.ok) { if (!/annul/i.test(r?.error || '')) setError(r?.error || t('Échec de la récupération')); return; }
      setOkMsg(t('Fichier enregistré !') + ' ' + (r.path || ''));
      setCode('');
    } finally { setBusy(false); }
  };

  const copy = async (c: string) => {
    try { await navigator.clipboard.writeText(c); setCopied(c); setTimeout(() => setCopied(null), 1500); } catch {}
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl mx-auto">
      <div className="glass-panel rounded-2xl p-6 border border-white/10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#e879f9,#a855f7)' }}>
            <Link2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{t('Partage rapide (Drop)')}</h2>
            <p className="text-xs text-gray-500">{t('Sans compte : dépose un fichier, partage le code, récupère-le quand tu veux.')}</p>
          </div>
        </div>

        <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-0.5 text-sm my-5">
          <button onClick={() => setTab('send')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${tab === 'send' ? 'bg-pink-500/20 text-pink-300' : 'text-gray-400 hover:text-gray-200'}`}><UploadCloud className="w-3.5 h-3.5" /> {t('Déposer')}</button>
          <button onClick={() => setTab('receive')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${tab === 'receive' ? 'bg-pink-500/20 text-pink-300' : 'text-gray-400 hover:text-gray-200'}`}><Download className="w-3.5 h-3.5" /> {t('Récupérer')}</button>
        </div>

        {error && <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>}
        {okMsg && <div className="mb-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 break-all">{okMsg}</div>}

        {busy && (
          <div className="mb-4 bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between text-xs text-gray-300 mb-1.5">
              <span className="flex items-center gap-2 truncate">
                <Loader2 className="w-3.5 h-3.5 text-pink-400 animate-spin shrink-0" />
                <span className="truncate">{prog?.name || t('Préparation…')}</span>
                {prog?.chunks ? <span className="text-gray-500">· {t('bloc')} {prog.chunk}/{prog.chunks}</span> : null}
                {eta && <span className="text-gray-500">· {eta} {t('restant')}</span>}
              </span>
              <span>{prog?.percent ?? 0}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: (prog?.percent ?? 0) + '%', background: 'linear-gradient(90deg, #e879f9, #a855f7)' }} /></div>
          </div>
        )}

        {tab === 'send' && (
          <div className="space-y-4">
            <button onClick={send} disabled={busy} className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#e879f9,#a855f7)' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} {busy ? t('Envoi en cours…') : t('Choisir un ou des fichiers')}
            </button>
            <p className="text-xs text-gray-500 text-center">{t('Le fichier est chiffré ; la clé est dans le code. Garde le code en lieu sûr.')}</p>

            {drops.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('Codes de partage')}</p>
                {drops.map((d, i) => (
                  <div key={i} className="bg-white/[0.04] border border-white/10 rounded-xl p-3">
                    <div className="text-sm text-gray-200 truncate mb-2">{d.name}</div>
                    <div className="flex items-center gap-2">
                      <input readOnly value={d.code} className={INPUT + ' font-mono text-xs'} onFocus={e => e.currentTarget.select()} />
                      <button onClick={() => copy(d.code)} className="shrink-0 p-2.5 rounded-xl bg-pink-500/15 text-pink-300 hover:bg-pink-500/25 border border-pink-500/20 transition-all" title={t('Copier')}>
                        {copied === d.code ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'receive' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{t('Colle le code reçu pour télécharger le fichier.')}</p>
            <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('Code de partage')} className={INPUT + ' font-mono text-xs'} />
            <button onClick={receive} disabled={busy} className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#e879f9,#a855f7)' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} {busy ? t('Récupération…') : t('Récupérer le fichier')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
