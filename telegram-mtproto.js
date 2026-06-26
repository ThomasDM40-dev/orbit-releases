// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Backend de stockage Telegram via MTProto (compte utilisateur, sans bot).
//  Utilise gramjs : l'utilisateur se connecte avec SON compte (api_id/api_hash de
//  my.telegram.org + téléphone + code). Les blocs (déjà chiffrés par main.js) sont
//  stockés dans ses « Messages enregistrés » (Saved Messages). La session reste
//  locale (fichier telegram.json), jamais envoyée au serveur Orbit.
//
//  Avantages vs bot : pas besoin de BotFather, blocs jusqu'à ~2 Go, plus tolérant.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { CustomFile } = require('telegram/client/uploads');
const { computeCheck } = require('telegram/Password');

// Bloc MTProto : 100 Mio (gros blocs = peu de requêtes ; tenu en RAM le temps de l'envoi).
const MTPROTO_CHUNK_SIZE = 100 * 1024 * 1024;

let CFG_PATH = null;
let cfg = { apiId: 0, apiHash: '', session: '', phone: '' };
let pending = null;   // { client, phone, phoneCodeHash } entre l'envoi du code et la connexion
let authed = null;    // client connecté (réutilisé)

function init(dir) {
  CFG_PATH = path.join(dir, 'telegram.json');
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) }; } catch (e) {}
}
function save() {
  try { fs.mkdirSync(path.dirname(CFG_PATH), { recursive: true }); fs.writeFileSync(CFG_PATH, JSON.stringify(cfg)); } catch (e) {}
}

function hasApi() { return !!(cfg.apiId && cfg.apiHash); }
function isReady() { return hasApi() && !!cfg.session; }
function status() { return { hasApi: hasApi(), loggedIn: isReady(), phone: cfg.phone || '' }; }

function setApi(apiId, apiHash) {
  cfg.apiId = parseInt(apiId, 10) || 0;
  cfg.apiHash = String(apiHash || '').trim();
  save();
  return { ok: hasApi() };
}

function newClient(sessionStr) {
  const c = new TelegramClient(new StringSession(sessionStr || ''), cfg.apiId, cfg.apiHash, { connectionRetries: 5, autoReconnect: true });
  c.setLogLevel('none');
  return c;
}

// Envoie le code de connexion (reçu DANS l'app Telegram, pas par SMS).
async function sendCode(phone) {
  if (!hasApi()) return { ok: false, error: "api_id / api_hash manquants." };
  phone = String(phone || '').trim();
  try {
    const client = newClient('');
    await client.connect();
    const res = await client.sendCode({ apiId: cfg.apiId, apiHash: cfg.apiHash }, phone);
    pending = { client, phone, phoneCodeHash: res.phoneCodeHash };
    return { ok: true };
  } catch (e) { return { ok: false, error: e.errorMessage || e.message }; }
}

// Valide le code. Renvoie need2fa:true si un mot de passe (validation en 2 étapes) est requis.
async function signIn(code) {
  if (!pending) return { ok: false, error: "Aucune connexion en cours (renvoie un code)." };
  try {
    await pending.client.invoke(new Api.auth.SignIn({
      phoneNumber: pending.phone,
      phoneCodeHash: pending.phoneCodeHash,
      phoneCode: String(code || '').trim(),
    }));
    return finishLogin();
  } catch (e) {
    if ((e.errorMessage || '') === 'SESSION_PASSWORD_NEEDED') return { ok: false, need2fa: true };
    return { ok: false, error: e.errorMessage || e.message };
  }
}

// Connexion avec le mot de passe de validation en 2 étapes (SRP).
async function signInPassword(password) {
  if (!pending) return { ok: false, error: "Aucune connexion en cours." };
  try {
    const pwd = await pending.client.invoke(new Api.account.GetPassword());
    const check = await computeCheck(pwd, String(password || ''));
    await pending.client.invoke(new Api.auth.CheckPassword({ password: check }));
    return finishLogin();
  } catch (e) { return { ok: false, error: e.errorMessage || e.message }; }
}

function finishLogin() {
  cfg.session = pending.client.session.save();
  cfg.phone = pending.phone;
  save();
  authed = pending.client;   // on réutilise ce client déjà connecté
  pending = null;
  return { ok: true };
}

async function logout() {
  try { if (authed) await authed.disconnect(); } catch (e) {}
  try { if (pending && pending.client) await pending.client.disconnect(); } catch (e) {}
  authed = null; pending = null;
  cfg.session = ''; cfg.phone = '';
  save();
  return { ok: true };
}

async function getClient() {
  if (!isReady()) throw new Error("Telegram non connecté (configure-le dans l'app).");
  if (authed && authed.connected) return authed;
  authed = newClient(cfg.session);
  await authed.connect();
  return authed;
}

// Envoie un bloc (Buffer) dans les Messages enregistrés → { messageId, size }.
async function uploadChunk(buffer, filename) {
  const client = await getClient();
  const file = new CustomFile(filename || 'blk.orb', buffer.length, '', buffer);
  const msg = await client.sendFile('me', { file, forceDocument: true, workers: 1 });
  if (!msg || !msg.id) throw new Error("Envoi Telegram échoué (pas d'id de message).");
  return { messageId: String(msg.id), size: buffer.length };
}

async function downloadChunk(messageId) {
  const client = await getClient();
  const msgs = await client.getMessages('me', { ids: [Number(messageId)] });
  if (!msgs || !msgs[0]) throw new Error('Bloc Telegram introuvable (message ' + messageId + ').');
  const buf = await client.downloadMedia(msgs[0], {});
  if (!buf) throw new Error('Téléchargement du bloc Telegram vide.');
  return Buffer.from(buf);
}

async function deleteChunk(messageId) {
  try { const client = await getClient(); await client.deleteMessages('me', [Number(messageId)], { revoke: true }); } catch (e) {}
}

module.exports = {
  MTPROTO_CHUNK_SIZE,
  init, status, setApi, sendCode, signIn, signInPassword, logout, isReady,
  uploadChunk, downloadChunk, deleteChunk,
};
