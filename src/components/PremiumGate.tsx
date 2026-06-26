import { Crown, Sparkles, Zap, Lock } from 'lucide-react';
import { t } from '@/i18n';

// Affiché à la place d'un onglet réservé au Premium tant que la licence n'est
// pas active. Pur visuel + CTA qui ouvre la fenêtre d'activation.
export default function PremiumGate({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="h-full w-full flex items-center justify-center p-8 os-anim-fade">
      <div className="max-w-md w-full text-center os-card rounded-2xl p-8 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, var(--accent-glow), transparent 70%)' }} />
        <div className="relative">
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, var(--accent-strong), var(--accent-2))', boxShadow: '0 10px 30px -6px var(--accent-glow)' }}>
            <Crown className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold os-text-gradient mb-2">{t('Fonctionnalité Premium')}</h2>
          <p className="text-sm text-gray-400 mb-6">{t('Cet outil fait partie d\'Orbit Premium. Active ta licence à vie pour le débloquer.')}</p>

          <div className="grid grid-cols-1 gap-2 text-left mb-6">
            <div className="flex items-center gap-2.5 text-sm text-gray-300"><Sparkles className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> {t('Tous les outils IA (Topaz, Upscale, Interpolation, Détourage…)')}</div>
            <div className="flex items-center gap-2.5 text-sm text-gray-300"><Zap className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> {t('Téléchargements illimités + génération & transcription sans quota')}</div>
            <div className="flex items-center gap-2.5 text-sm text-gray-300"><Lock className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-strong)' }} /> {t('Licence à vie, liée à 1 appareil')}</div>
          </div>

          <button onClick={onUnlock} className="os-btn os-btn-primary w-full">
            <Crown className="w-4 h-4" /> {t('Activer Premium')}
          </button>
        </div>
      </div>
    </div>
  );
}
