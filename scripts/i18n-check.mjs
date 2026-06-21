// i18n coverage checker.
//
// Scans the source for every t("…") / tr("…") French key and reports the ones
// that have no entry in src/i18n/translations.ts (they would silently fall back
// to French in EN/ES/DE/IT/PT). Run with:  node scripts/i18n-check.mjs
//
// Exit code 1 if any key is missing — handy in CI / before a release.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');
const dictFile = path.join(srcDir, 'i18n', 'translations.ts');

// Collect all .ts/.tsx files under src (excluding the i18n folder itself).
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (path.basename(p) !== 'i18n') out.push(...walk(p)); }
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

// Keys present in the dictionary (the quoted property names before ": {").
const dictSrc = fs.readFileSync(dictFile, 'utf8');
const known = new Set();
for (const m of dictSrc.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*\{/gm)) {
  known.add(m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
}

// Every t("…") / tr("…") / tr('…') call with a *static string literal* argument.
const callRe = /\b(?:t|tr)\(\s*(["'])((?:[^"'\\]|\\.)*?)\1/g;
const missing = new Map(); // key -> Set(files)

for (const file of walk(srcDir)) {
  const code = fs.readFileSync(file, 'utf8');
  for (const m of code.matchAll(callRe)) {
    const key = m[2].replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    if (!key.trim()) continue;
    if (!known.has(key)) {
      if (!missing.has(key)) missing.set(key, new Set());
      missing.get(key).add(path.relative(root, file));
    }
  }
}

if (missing.size === 0) {
  console.log(`✓ i18n: toutes les chaînes t()/tr() ont une traduction (${known.size} clés).`);
  process.exit(0);
}

console.log(`✗ i18n: ${missing.size} chaîne(s) sans traduction (repli français) :\n`);
for (const [key, files] of [...missing].sort()) {
  console.log(`  "${key}"`);
  console.log(`      ↳ ${[...files].join(', ')}`);
}
console.log(`\nAjoute-les dans src/i18n/translations.ts.`);
process.exit(1);
