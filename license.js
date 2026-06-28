// ─────────────────────────────────────────────────────────────────────────────
// Orbit — vérification de licence Premium (processus principal).
//
// Les clés sont signées Ed25519 par l'éditeur (clé privée gardée hors du repo).
// Ici on ne possède que la CLÉ PUBLIQUE (sans danger à publier) : on vérifie la
// signature HORS-LIGNE, donc personne ne peut fabriquer une clé valide.
//
// La liaison stricte « 1 seul appareil » sera renforcée côté serveur (étape 2) ;
// localement on stocke déjà l'empreinte de la machine d'activation et on refuse
// si le fichier de licence est copié tel quel sur une autre machine.
// ─────────────────────────────────────────────────────────────────────────────
const { createPublicKey, verify, createHash } = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Clé publique Ed25519 (générée par tools/, la privée reste sur le PC éditeur).
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAjIag2D5LmjXYtiDBRBItIHKcP1vad0ioU9YxdblJP1c=
-----END PUBLIC KEY-----`;

let PUB = null;
try { PUB = createPublicKey(PUBLIC_KEY_PEM); } catch (e) { PUB = null; }

const ORBIT_DIR = path.join(os.homedir(), '.orbit');
const LICENSE_FILE = path.join(ORBIT_DIR, 'license.json');

// Empreinte d'appareil stable, sans dépendance externe : hash des adresses MAC
// physiques + hostname + modèle CPU + plateforme. Suffisamment stable entre
// redémarrages, différente d'une machine à l'autre.
function deviceFingerprint() {
  const macs = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') macs.push(ni.mac);
    }
  }
  macs.sort();
  const cpu = (os.cpus()[0] && os.cpus()[0].model) || '';
  const raw = macs.join(',') + '|' + os.hostname() + '|' + cpu + '|' + os.platform() + '|' + os.arch();
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// Vérifie la signature d'une clé et renvoie son payload, ou null si invalide.
function verifyKey(key) {
  if (!PUB || typeof key !== 'string' || !key.startsWith('ORBIT-')) return null;
  const body = key.slice('ORBIT-'.length);
  const dot = body.indexOf('.');
  if (dot < 1) return null;
  let payloadBuf, sigBuf, payload;
  try {
    payloadBuf = Buffer.from(body.slice(0, dot), 'base64url');
    sigBuf = Buffer.from(body.slice(dot + 1), 'base64url');
  } catch (e) { return null; }
  let ok = false;
  try { ok = verify(null, payloadBuf, PUB, sigBuf); } catch (e) { return null; }
  if (!ok) return null;
  try { payload = JSON.parse(payloadBuf.toString('utf8')); } catch (e) { return null; }
  return payload;
}

function readLicense() {
  try { return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8')); } catch (e) { return null; }
}

function writeLicense(obj) {
  try {
    if (!fs.existsSync(ORBIT_DIR)) fs.mkdirSync(ORBIT_DIR, { recursive: true });
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(obj, null, 2));
    return true;
  } catch (e) { return false; }
}

function clearLicense() {
  try { if (fs.existsSync(LICENSE_FILE)) fs.unlinkSync(LICENSE_FILE); } catch (e) {}
  return { ok: true };
}

// État courant : on relit la licence stockée, on revérifie la signature et on
// confirme que l'appareil correspond (anti copier-coller du fichier).
function getStatus() {
  const lic = readLicense();
  if (!lic || !lic.key) return { active: false };
  const payload = verifyKey(lic.key);
  if (!payload) return { active: false, error: 'Clé invalide.' };
  const sameDevice = lic.device === deviceFingerprint();
  return {
    active: !!sameDevice,
    email: payload.email,
    plan: payload.plan,
    id: payload.id,
    activatedAt: lic.activatedAt,
    serverConfirmed: !!lic.serverConfirmed,
    deviceMismatch: !sameDevice,
  };
}

// Activation locale (fondation) : vérifie la signature et lie l'appareil courant.
// L'enforcement réseau « 1 appareil » viendra se greffer ici (étape serveur).
function activate(key) {
  const payload = verifyKey(key);
  if (!payload) return { ok: false, error: 'Clé de licence invalide ou corrompue.' };
  const device = deviceFingerprint();
  writeLicense({ key, device, activatedAt: Date.now(), serverConfirmed: false, email: payload.email, id: payload.id });
  return { ok: true, status: getStatus() };
}

function isPremium() {
  return getStatus().active === true;
}

// Kill-switch en ligne (révocation à distance). On demande au serveur si l'id de
// notre clé a été révoqué (remboursement, abus, clé fuitée) et, le cas échéant,
// on efface la licence locale. C'est *fail-open* : toute erreur réseau / réponse
// ambiguë laisse la licence intacte, donc l'usage hors-ligne n'est jamais cassé.
// Throttlé (1×/12 h) via lastRevalidate stocké dans le fichier de licence.
const REVALIDATE_INTERVAL = 12 * 60 * 60 * 1000;
async function revalidate(serverUrl, { force = false } = {}) {
  try {
    if (!serverUrl) return { ok: false };
    const lic = readLicense();
    if (!lic || !lic.key) return { ok: true, revoked: false };
    const payload = verifyKey(lic.key);
    if (!payload || !payload.id) return { ok: true, revoked: false };
    if (!force && lic.lastRevalidate && (Date.now() - lic.lastRevalidate) < REVALIDATE_INTERVAL) return { ok: true, skipped: true };
    const base = String(serverUrl).replace(/\/+$/, '');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try {
      res = await fetch(base + '/api/license/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: payload.id }), signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!res || !res.ok) return { ok: false };                 // fail-open
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true) return { ok: false };       // fail-open
    if (data.revoked === true) { clearLicense(); return { ok: true, revoked: true }; }
    // Toujours valide : on note la date pour throttler les prochains appels.
    writeLicense({ ...lic, lastRevalidate: Date.now() });
    return { ok: true, revoked: false };
  } catch (e) { return { ok: false }; }                        // fail-open
}

module.exports = { verifyKey, deviceFingerprint, getStatus, activate, clearLicense, isPremium, readLicense, writeLicense, revalidate };
