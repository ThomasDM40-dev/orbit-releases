import { X, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { t } from '@/i18n';

const changelog = [
  {
    version: '0.43.0',
    date: '30 Juin 2026',
    changes: [
      { type: 'feat', text: "Toute nouvelle expérience d'installation premium au premier lancement : écran animé Welcome → Installing → Success, avec logo orbital, fond vivant, particules, flèches lumineuses, barre de progression à glow et animation de succès." }
    ]
  },
  {
    version: '0.42.0',
    date: '30 Juin 2026',
    changes: [
      { type: 'feat', text: "Nouvel installateur Orbit Nova : page de bienvenue, panneau spatial avec anneaux orbitaux et cœur lumineux violet→cyan, en-tête et icônes assortis." },
      { type: 'feat', text: "Orbit IA accepte le glisser-déposer : dépose un fichier directement sur le panneau de l'assistant pour qu'il te propose quoi en faire." },
      { type: 'feat', text: "Assistant IA plus rapide sur les PC modestes, avec une barre de progression au premier lancement (téléchargement et démarrage du modèle) au lieu d'un « Réflexion… » figé." },
      { type: 'fix', text: "Déposer un fichier n'importe où n'ouvre plus l'assistant IA par erreur — seules les vraies zones de dépôt réagissent." }
    ]
  },
  {
    version: '0.41.0',
    date: '30 Juin 2026',
    changes: [
      { type: 'feat', text: "Convertisseur Pro : nouvelle sortie ProRes (.mov), l'intermédiaire idéal pour After Effects, Premiere et Resolve." },
      { type: 'feat', text: "Téléchargements : option « Forcer H.264 (compatible montage) » dans les réglages — évite le VP9/AV1 que les logiciels de montage refusent." },
      { type: 'feat', text: "Moteur JS pour YouTube (Deno) installable en un clic, pour une extraction complète sans formats manquants." },
      { type: 'feat', text: "Glisser-déposer repensé et unifié sur toute l'application : retour visuel cohérent et déposes plus fiables." },
      { type: 'fix', text: "Déposer un fichier sur un outil le charge maintenant dans cet outil au lieu d'ouvrir l'assistant IA par erreur." },
      { type: 'fix', text: "Cookies du navigateur : réessai automatique sans cookies quand Chrome/Edge verrouille sa base — fini les téléchargements qui plantent avec le code 1." },
      { type: 'fix', text: "Correction du plantage « prompt() is not supported » lors de l'enregistrement d'un préréglage ou de la création d'un dossier." },
      { type: 'fix', text: "After Effects : la conversion vidéo produit désormais un H.264 réellement importable." }
    ]
  },
  {
    version: '0.7.1',
    date: '8 Juin 2026',
    changes: [
      { type: 'fix', text: "Convertisseur : Correction d'un problème qui empêchait la conversion si le moteur FFmpeg n'était pas mis à jour manuellement par l'utilisateur. Orbit utilise désormais son moteur interne par défaut." }
    ]
  },
  {
    version: '0.7.0',
    date: '8 Juin 2026',
    changes: [
      { type: 'fix', text: "Convertisseur : Correction du dossier d'enregistrement par défaut. Le fichier converti est désormais automatiquement enregistré dans le même dossier que le fichier source original." }
    ]
  },
  {
    version: '0.6.9',
    date: '8 Juin 2026',
    changes: [
      { type: 'feat', text: "Sniffer (Patreon/Mux) : Le Sniffer filtre désormais toutes les \"renditions\" secondaires pour ne garder que le flux maître, éliminant les doublons." },
      { type: 'feat', text: "Remuxing MP4 : Lors de l'utilisation de flux .m3u8, yt-dlp assemble automatiquement tous les flux dans un seul fichier final .mp4." }
    ]
  },
  {
    version: '0.6.8',
    date: '8 Juin 2026',
    changes: [
      { type: 'feat', text: "Panneau de Logs Amélioré : Capture des erreurs internes du processus enfant et affichage des messages d'erreur critiques." }
    ]
  },
  {
    version: '0.6.6',
    date: '8 Juin 2026',
    changes: [
      { type: 'fix', text: "Cookies Chrome Exclusifs : Désactivation de la recherche Chrome si le Sniffer fournit déjà des cookies de session (ex: Patreon)." }
    ]
  }
];

export default function ChangelogModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={onClose}>
      {/* Morph Glass Liquid Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />
      
      <div 
        className="relative w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(135deg, rgba(20,20,20,0.8), rgba(30,30,30,0.9))",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1) inset, 0 0 40px rgba(236,72,153,0.15)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 to-purple-500/10 opacity-50" />
          <h2 className="text-xl font-bold flex items-center gap-3 relative z-10">
            <Sparkles className="w-5 h-5" style={{ color: 'var(--accent-strong)' }} />
            <span className="os-text-gradient">{t("Nouveautés & Historique")}</span>
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors relative z-10 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
          {changelog.map((release, idx) => (
            <div key={idx} className="relative pl-6 border-l border-white/10 group">
              {/* Timeline Dot */}
              <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.8)]" />
              
              <div className="flex items-end justify-between mb-4">
                <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                  {t("Version")} {release.version}
                </h3>
                <span className="text-xs font-mono text-gray-500">{release.date}</span>
              </div>
              
              <div className="space-y-3">
                {release.changes.map((change, cIdx) => (
                  <div key={cIdx} className="flex gap-3 text-sm text-gray-300 items-start">
                    {change.type === 'feat' ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mt-0.5 text-orange-400 shrink-0" />
                    )}
                    <span className="leading-relaxed">{change.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          <div className="text-center pt-8 text-xs text-gray-600 font-medium">
            {t("Propulsé par Orbit AI Studio.")}
          </div>
        </div>
      </div>
    </div>
  );
}
