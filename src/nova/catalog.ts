import { t } from "@/i18n";

// ────────────────────────────────────────────────────────────────────────────
// Orbit Nova — tool catalog
// ────────────────────────────────────────────────────────────────────────────
// Presentation metadata for every Orbit feature, used by the Nova home grid,
// sidebar and search. Each entry maps 1:1 to an existing tab `id`, so opening a
// Nova card just switches to that already-working tab component — no feature is
// duplicated or reimplemented.
//
// `labels`/`descriptions` are wrapped in t() at read time (getCatalog()) so they
// re-translate on language change.
// ────────────────────────────────────────────────────────────────────────────

export type NovaCategory =
  | "download"
  | "convert"
  | "ai"
  | "studio"
  | "cloud";

export interface NovaTool {
  id: string;            // matches the tab id in App.tsx
  label: string;         // French source (passed through t())
  desc: string;          // short French source (passed through t())
  category: NovaCategory;
  /** two-stop gradient for the card / icon glow */
  grad: [string, string];
  badge?: string;        // optional pill (e.g. "IA", "Pro")
  trending?: boolean;    // surfaced in "Trending" rail
  fresh?: boolean;       // surfaced in "New releases" rail
}

export const NOVA_CATEGORIES: { id: NovaCategory; label: string; accent: string }[] = [
  { id: "download", label: "Téléchargement", accent: "#38BDF8" },
  { id: "convert", label: "Conversion", accent: "#A855F7" },
  { id: "ai", label: "IA Créative", accent: "#8B5CF6" },
  { id: "studio", label: "Studio & Outils", accent: "#00D4FF" },
  { id: "cloud", label: "Cloud", accent: "#7C3AED" },
];

// Raw catalog (French source strings; translated on read).
const RAW: NovaTool[] = [
  { id: "downloads",     label: "Téléchargements",     desc: "Aspirez vidéos, playlists et audio depuis des centaines de sites.", category: "download", grad: ["#38BDF8", "#7C3AED"], trending: true },
  { id: "subscriptions", label: "Abonnements",         desc: "Suivez vos chaînes et récupérez automatiquement les nouveautés.",  category: "download", grad: ["#00D4FF", "#3B82F6"] },

  { id: "convertpro",    label: "Convertisseur Pro",   desc: "Convertisseur universel : vidéo, audio, image, LUT, polices, 3D, docs & After Effects.", category: "convert", grad: ["#A855F7", "#00D4FF"], badge: "Pro", trending: true, fresh: true },
  { id: "converter",     label: "Convertisseur & Tags",desc: "Conversion média rapide avec édition des métadonnées.",            category: "convert", grad: ["#8B5CF6", "#38BDF8"] },
  { id: "handbrake",     label: "HandBrake",           desc: "Compression vidéo avancée, presets et encodage par lots.",         category: "convert", grad: ["#7C3AED", "#A855F7"] },

  { id: "imagegen",      label: "Génération IA",       desc: "Créez des images à partir d'un simple texte.",                     category: "ai", grad: ["#A855F7", "#8B5CF6"], badge: "IA", trending: true },
  { id: "inpaint",       label: "Gomme magique IA",    desc: "Effacez n'importe quel objet d'une image en un clic.",            category: "ai", grad: ["#8B5CF6", "#00D4FF"], badge: "IA" },
  { id: "matting",       label: "Détourage IA",        desc: "Supprimez l'arrière-plan automatiquement, sans Photoshop.",        category: "ai", grad: ["#00D4FF", "#7C3AED"], badge: "IA" },
  { id: "enhance",       label: "Amélioration IA",     desc: "Upscalez et restaurez vos images et vidéos.",                      category: "ai", grad: ["#38BDF8", "#A855F7"], badge: "IA" },
  { id: "interpolator",  label: "Interpolateur IA",    desc: "Boostez la fluidité de vos vidéos jusqu'au slow-motion parfait.",  category: "ai", grad: ["#8B5CF6", "#38BDF8"], badge: "IA" },
  { id: "topaz",         label: "Topaz Video AI",      desc: "Pipeline pro d'amélioration vidéo par IA.",                        category: "ai", grad: ["#A855F7", "#00D4FF"], badge: "IA" },

  { id: "toolbox",       label: "Boîte à outils",      desc: "QR, OCR, fusion, sous-titres, filigrane, PDF, surveillance…",     category: "studio", grad: ["#00D4FF", "#8B5CF6"], fresh: true },
  { id: "transcription", label: "Transcription",       desc: "Transcrivez et sous-titrez automatiquement votre audio.",          category: "studio", grad: ["#38BDF8", "#7C3AED"] },
  { id: "library",       label: "Médiathèque",         desc: "Parcourez, lisez et organisez tous vos médias.",                   category: "studio", grad: ["#7C3AED", "#38BDF8"] },

  { id: "drive",         label: "Drive Discord",       desc: "Stockage cloud illimité propulsé par Discord.",                    category: "cloud", grad: ["#7C3AED", "#A855F7"], badge: "Cloud", trending: true },
];

export interface CatalogTool extends NovaTool {
  /** translated, ready to render */
  tLabel: string;
  tDesc: string;
}

/** Catalog with labels/descriptions translated for the active language. */
export function getCatalog(): CatalogTool[] {
  return RAW.map((x) => ({ ...x, tLabel: t(x.label), tDesc: t(x.desc) }));
}

/** Lookup a single tool by tab id (translated). */
export function catalogTool(id: string): CatalogTool | undefined {
  return getCatalog().find((x) => x.id === id);
}

export const NOVA_HOME = "__nova_home__";
