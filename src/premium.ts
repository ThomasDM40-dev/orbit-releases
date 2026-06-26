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

export function usePremium() {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force(x => x + 1);
    subs.add(cb);
    if (!loaded) { loaded = true; refreshLicense(); }
    return () => { subs.delete(cb); };
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

  return { premium: cache.active, status: cache, refresh: refreshLicense, activate, deactivate };
}
