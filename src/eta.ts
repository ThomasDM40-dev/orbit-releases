import { useRef } from 'react';

// Met en forme une durée en secondes → « 45 s », « 1 min 20 s », « 1 h 5 min ».
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '';
  seconds = Math.round(seconds);
  if (seconds < 60) return seconds + ' s';
  const m = Math.floor(seconds / 60), s = seconds % 60;
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h} h ${mm} min` : `${h} h`;
}

type ProgLike = { id: string; percent: number } | null | undefined;

// Estime le temps restant d'un transfert à partir de la vitesse d'avancement du
// pourcentage, sur une fenêtre glissante de ~10 s (pour ignorer le réveil du
// serveur ou les à-coups). Renvoie une chaîne prête à afficher, ou '' tant qu'on
// n'a pas assez de mesures.
export function useEta(prog: ProgLike): string {
  const ref = useRef<{ id: string; samples: { t: number; p: number }[] }>({ id: '', samples: [] });
  if (!prog) { ref.current = { id: '', samples: [] }; return ''; }
  const p = prog.percent || 0;
  const now = Date.now();
  const st = ref.current;
  if (st.id !== prog.id) { st.id = prog.id; st.samples = []; }
  const s = st.samples;
  if (!s.length || s[s.length - 1].p !== p || now - s[s.length - 1].t > 800) s.push({ t: now, p });
  const cutoff = now - 10000;
  while (s.length > 2 && s[0].t < cutoff) s.shift();
  if (p <= 0 || p >= 100) return '';
  const first = s[0], last = s[s.length - 1];
  const dt = (last.t - first.t) / 1000, dp = last.p - first.p;
  if (dt < 1.2 || dp <= 0) return '';
  const remaining = (100 - p) / (dp / dt);
  return formatDuration(remaining);
}
