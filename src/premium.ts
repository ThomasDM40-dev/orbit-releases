import { useEffect, useState, useCallback } from 'react';

const api = () => (window as any).electronAPI;

export type LicenseStatus = {
  active: boolean;
  email?: string;
  plan?: string;
  id?: string;
  activatedAt?: number;
  serverConfirmed?: boolean;
  deviceMismatch?: boolean;
  error?: string;
};

// Onglets entièrement réservés au Premium (outils IA lourds). Le Drive/Drop et
// les téléchargements restent accessibles — leurs limites "étendu/illimité"
// seront appliquées plus tard côté serveur.
export const PREMIUM_TABS = new Set([
  'interpolator', 'enhance', 'imagegen', 'inpaint', 'matting', 'topaz', 'transcription',
]);

// Petit store partagé : tous les composants voient le même état de licence.
let cache: LicenseStatus = { active: false };
let loaded = false;
const subs = new Set<() => void>();

export async function refreshLicense() {
  try { cache = (await api()?.licenseStatus?.()) || { active: false }; }
  catch { cache = { active: false }; }
  subs.forEach(f => f());
}

// Réclame en silence un Premium offert à cet appareil (cadeau par ID, sans compte).
// Appelé au démarrage : si un ami nous a offert le Premium, il s'active tout seul.
async function autoClaimDevice() {
  try {
    if (cache.active) return;
    const r = await api()?.licenseClaimDevice?.();
    if (r?.premium) await refreshLicense();
  } catch { /* hors-ligne : on réessaiera au prochain lancement */ }
}

export function usePremium() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force(x => x + 1);
    subs.add(cb);
    if (!loaded) { loaded = true; refreshLicense().then(autoClaimDevice); }
    // Kill-switch : le serveur a révoqué cette licence → l'état local est effacé,
    // on rafraîchit pour reverrouiller les onglets Premium immédiatement.
    const off = api()?.onLicenseRevoked?.(() => { refreshLicense(); });
    return () => { subs.delete(cb); off?.(); };
  }, []);

  const activate = useCallback(async (key: string) => {
    const r = await api()?.licenseActivate?.(key);
    await refreshLicense();
    return r;
  }, []);

  const deactivate = useCallback(async () => {
    await api()?.licenseDeactivate?.();
    await refreshLicense();
  }, []);

  // Ouvre le checkout Stripe (lié au compte connecté).
  const checkout = useCallback(async () => api()?.licenseCheckout?.(), []);

  // Récupère la licence depuis le serveur (après paiement) → active si premium.
  const sync = useCallback(async () => {
    const r = await api()?.licenseSync?.();
    await refreshLicense();
    return r;
  }, []);

  // Réclame un Premium offert à cet appareil (cadeau par ID).
  const claimDevice = useCallback(async () => {
    const r = await api()?.licenseClaimDevice?.();
    await refreshLicense();
    return r;
  }, []);

  return { premium: cache.active, status: cache, refresh: refreshLicense, activate, deactivate, checkout, sync, claimDevice };
}
