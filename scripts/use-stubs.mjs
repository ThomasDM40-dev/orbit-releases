// Remplace les modules natifs optionnels `bufferutil` et `utf-8-validate` (tirés
// par gramjs → websocket) par des équivalents pur-JS (dossier `stubs/`).
// Pourquoi : ces modules natifs font échouer le build electron-builder (node-gyp),
// et s'ils sont absents l'app packagée plante au lancement (« Cannot find module
// 'bufferutil' »). Lancé en postinstall → survit aux `npm install`.
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
for (const mod of ['bufferutil', 'utf-8-validate']) {
  const from = join(root, 'stubs', mod);
  const to = join(root, 'node_modules', mod);
  if (!existsSync(from)) continue;
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) copyFileSync(join(from, f), join(to, f));
  console.log('[use-stubs] ' + mod + ' -> pur-JS');
}
