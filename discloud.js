// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Discloud — stockage de fichiers sur Discord (façon Disbox)
//  Découpe les fichiers en chunks, les chiffre (AES-256-GCM) puis les envoie en
//  pièces jointes via un webhook Discord. Les métadonnées (arbre fichiers/dossiers
//  + IDs de messages) restent en local. Les URLs des pièces jointes Discord
//  expirent (~24 h) : on régénère donc un lien frais à la demande via
//  GET {webhook}/messages/{messageId} — aucun bot token nécessaire.
//
//  main.js orchestre (IPC, dialogues, événements de progression) ; ici on garde
//  les helpers purs : crypto, REST webhook, chunking, et le store JSON local.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Taille de bloc : 8 Mio, la limite de pièce jointe historiquement acceptée par
// TOUS les serveurs Discord (même non boostés). Les serveurs gratuits récents
// tolèrent parfois plus, mais 8 Mio garantit qu'on ne prend jamais de HTTP 413.
const CHUNK_SIZE = 8 * 1024 * 1024; // 8 Mio de clair par chunk
const PBKDF2_ITERS = 200000;
const VERIFIER_PLAINTEXT = 'orbit-discloud-v1';

// ── Store local ──────────────────────────────────────────────────────────────
function indexPath(dir) { return path.join(dir, 'index.json'); }
function configPath(dir) { return path.join(dir, 'config.json'); }

function loadIndex(dir) {
  try { return JSON.parse(fs.readFileSync(indexPath(dir), 'utf8')); }
  catch (e) { return { version: 1, nodes: [] }; }
}
function saveIndex(dir, idx) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexPath(dir), JSON.stringify(idx, null, 2));
}
function loadConfig(dir) {
  try { return JSON.parse(fs.readFileSync(configPath(dir), 'utf8')); }
  catch (e) { return {}; }
}
function saveConfig(dir, cfg) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2));
}

function uuid() { return crypto.randomBytes(16).toString('hex'); }

// ── Chiffrement (AES-256-GCM) ────────────────────────────────────────────────
// Clé dérivée de la phrase secrète via PBKDF2. La phrase n'est jamais stockée ;
// seul le sel + un "verifier" (un texte connu chiffré) le sont, ce qui permet
// de vérifier qu'une phrase saisie est la bonne.
function deriveKey(passphrase, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.pbkdf2Sync(String(passphrase), salt, PBKDF2_ITERS, 32, 'sha256');
}
function encryptBuffer(key, buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]); // [12 IV][16 tag][ciphertext]
}
function decryptBuffer(key, blob) {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
function makeVerifier(key) {
  return encryptBuffer(key, Buffer.from(VERIFIER_PLAINTEXT, 'utf8')).toString('base64');
}
function checkVerifier(key, verifierB64) {
  try {
    const out = decryptBuffer(key, Buffer.from(verifierB64, 'base64'));
    return out.toString('utf8') === VERIFIER_PLAINTEXT;
  } catch (e) { return false; }
}

// ── REST webhook Discord ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Envoie un blob en pièce jointe et renvoie l'ID du message. Gère le rate-limit
// (429 → on attend retry_after) et quelques erreurs transitoires.
async function webhookUpload(webhook, filename, buffer, attempt = 0) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  const res = await fetch(webhook + '?wait=true', { method: 'POST', body: form });
  if (res.status === 429) {
    let wait = 1000;
    try { const j = await res.json(); wait = Math.ceil((j.retry_after || 1) * 1000) + 250; } catch (e) {}
    await sleep(wait);
    return webhookUpload(webhook, filename, buffer, attempt);
  }
  if ((res.status === 500 || res.status === 502 || res.status === 503) && attempt < 4) {
    await sleep(1000 * (attempt + 1));
    return webhookUpload(webhook, filename, buffer, attempt + 1);
  }
  if (!res.ok) throw new Error('Discord a refusé l\'envoi (HTTP ' + res.status + ')');
  const msg = await res.json();
  const att = msg.attachments && msg.attachments[0];
  if (!msg.id || !att) throw new Error('Réponse Discord invalide à l\'envoi');
  return { messageId: msg.id, size: att.size };
}

// Régénère un lien frais (les liens Discord expirent) à partir de l'ID de message.
async function webhookGetUrl(webhook, messageId, attempt = 0) {
  const res = await fetch(webhook + '/messages/' + messageId);
  if (res.status === 429) {
    let wait = 1000;
    try { const j = await res.json(); wait = Math.ceil((j.retry_after || 1) * 1000) + 250; } catch (e) {}
    await sleep(wait);
    return webhookGetUrl(webhook, messageId, attempt);
  }
  if (!res.ok && attempt < 3) { await sleep(800 * (attempt + 1)); return webhookGetUrl(webhook, messageId, attempt + 1); }
  if (!res.ok) throw new Error('Message Discord introuvable (HTTP ' + res.status + ')');
  const msg = await res.json();
  const att = msg.attachments && msg.attachments[0];
  if (!att || !att.url) throw new Error('Pièce jointe introuvable sur Discord');
  return att.url;
}

async function webhookDelete(webhook, messageId, attempt = 0) {
  const res = await fetch(webhook + '/messages/' + messageId, { method: 'DELETE' });
  if (res.status === 429) {
    let wait = 1000;
    try { const j = await res.json(); wait = Math.ceil((j.retry_after || 1) * 1000) + 250; } catch (e) {}
    await sleep(wait);
    return webhookDelete(webhook, messageId, attempt);
  }
  // 404 = déjà supprimé : on considère que c'est bon.
  if (!res.ok && res.status !== 404 && attempt < 3) { await sleep(800 * (attempt + 1)); return webhookDelete(webhook, messageId, attempt + 1); }
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Téléchargement du chunk échoué (HTTP ' + res.status + ')');
  return Buffer.from(await res.arrayBuffer());
}

// Vérifie qu'une URL ressemble à un webhook Discord valide.
function isValidWebhook(url) {
  return /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+$/.test(String(url || '').trim());
}

module.exports = {
  CHUNK_SIZE,
  indexPath, configPath, loadIndex, saveIndex, loadConfig, saveConfig, uuid,
  deriveKey, encryptBuffer, decryptBuffer, makeVerifier, checkVerifier,
  webhookUpload, webhookGetUrl, webhookDelete, fetchBytes, isValidWebhook,
};
