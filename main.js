const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const { autoUpdater } = require('electron-updater');

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, supportFetchAPI: true, stream: true, secure: true } }
]);
const path = require('path');
let youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const serve = require('electron-serve');
const isDev = !app.isPackaged;
const https = require('https');
const { execFile, exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ytDlpPath = require('youtube-dl-exec/src/constants').YOUTUBE_DL_PATH;

// Resolve the correct yt-dlp path: prefer manually updated local copy,
// then bundled binary (unpacked from asar and already signed), then module default.
function getYtDlpBin() {
  const localUpdated = path.join(os.homedir(), '.orbit', 'yt-dlp.exe');
  if (fs.existsSync(localUpdated) && fs.statSync(localUpdated).size > 5000000) return localUpdated;
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  return ytDlpPath;
}

// Resolve ffmpeg: prefer local copy, then bundled unpacked binary.
function getFfmpegBin() {
  const localFfmpeg = path.join(os.homedir(), '.orbit', 'ffmpeg', 'ffmpeg.exe');
  if (fs.existsSync(localFfmpeg)) return localFfmpeg;
  if (app.isPackaged) {
    const bundled = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  return ffmpegPath;
}
const DiscordRPC = require('discord-rpc');


const loadURL = (serve.default || serve)({ directory: 'dist' });

let mainWindow;

// Always target the MAIN UI window for progress/complete events. Using
// uiWin() was a bug: when the sniffer/browser or
// changelog window is open, [0] can be one of those (which have no listeners),
// so AI renders (Topaz/Enhance/HandBrake/Library/Converter) appeared to "load
// forever" because their completion events were delivered to the wrong window.
function uiWin() {
  return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : BrowserWindow.getAllWindows()[0];
}

// ---- DISCORD RICH PRESENCE ----
// IMPORTANT: Replace with your Discord Application ID from:
// https://discord.com/developers/applications
const DISCORD_CLIENT_ID = '1513138156965466132';

let rpcClient = null;
let rpcReady = false;
let sessionStart = Date.now();
let rpcState = {
  details: 'Orbit - Téléchargeur Multimédia',
  state: 'En attente...',
  activeDownloads: 0,
  tab: 'downloads'
};

function buildPresence() {
  const tab = rpcState.tab;
  let details = 'Orbit - Téléchargeur Multimédia';
  let state = 'Prêt';
  if (tab === 'downloads') {
    details = rpcState.activeDownloads > 0
      ? `⬇️ ${rpcState.activeDownloads} téléchargement(s) en cours`
      : '⬇️ Onglet Téléchargements';
    state = rpcState.activeDownloads > 0 ? 'Téléchargement actif' : 'En attente d\'un lien...';
  } else if (tab === 'converter') {
    details = '🎬 Convertisseur & Orbit AI Studio';
    state = 'Conversion de fichiers multimédias';
  } else if (tab === 'interpolator') {
    details = '⚡ Interpolateur IA (RIFE)';
    state = 'Interpolation vidéo 60FPS';
  } else if (tab === 'subscriptions') {
    details = '📡 Gestionnaire d\'Abonnements';
    state = 'Surveillance des chaînes';
  }
  return {
    details,
    state,
    startTimestamp: sessionStart,
    largeImageKey: 'orbit_logo',
    largeImageText: 'Orbit v' + require('./package.json').version,
    smallImageKey: rpcState.activeDownloads > 0 ? 'downloading' : 'idle',
    smallImageText: rpcState.activeDownloads > 0 ? 'Téléchargement' : 'Prêt',
    buttons: [
      { label: '⬇️ Télécharger Orbit', url: 'https://github.com/ThomasDM40-dev/orbit-releases/releases/latest' },
      { label: '⭐ GitHub', url: 'https://github.com/ThomasDM40-dev/orbit-releases' }
    ],
    instance: false
  };
}

async function initDiscordRPC() {
  try {
    DiscordRPC.register(DISCORD_CLIENT_ID);
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    rpcClient.on('ready', () => {
      rpcReady = true;
      console.log('[Discord RPC] Connecté à Discord !');
      rpcClient.setActivity(buildPresence());
      // Update every 15 seconds
      setInterval(() => {
        if (rpcReady) rpcClient.setActivity(buildPresence());
      }, 15000);
    });
    rpcClient.on('disconnected', () => {
      rpcReady = false;
      console.log('[Discord RPC] Déconnecté de Discord.');
    });
    await rpcClient.login({ clientId: DISCORD_CLIENT_ID });
  } catch (e) {
    console.log('[Discord RPC] Discord non disponible ou non ouvert:', e.message);
  }
}

function updateRPC(patch) {
  Object.assign(rpcState, patch);
  if (rpcReady && rpcClient) {
    try { rpcClient.setActivity(buildPresence()); } catch(e) {}
  }
}

// IPC: renderer updates RPC state
ipcMain.on('rpc-update', (event, data) => updateRPC(data));


// Logging system
const logPath = path.join(os.homedir(), '.orbit', 'orbit.log');
function logToFile(...args) {
  try {
    const msg = new Date().toISOString() + ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') + '\n';
    fs.appendFileSync(logPath, msg);
  } catch (e) {}
}
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args) => { originalConsoleLog(...args); logToFile('[INFO]', ...args); };
console.error = (...args) => { originalConsoleError(...args); logToFile('[ERROR]', ...args); };

// ── AI Assistant: proxy Claude API calls from renderer (avoids CORS) ──
// ─── Local AI (free, no key) — bundled llama.cpp + Qwen2.5 ────────────────────
// Downloaded once from official sources (github.com/ggml-org + HuggingFace/Qwen),
// runs offline on the user's machine. Used when no Anthropic key is configured.
const LLM_DIR = path.join(os.homedir(), '.orbit', 'modules', 'llm'); // = ORBIT_DIR/modules/llm (ORBIT_DIR is declared later → avoid TDZ)
const LLAMA_URL = 'https://github.com/ggml-org/llama.cpp/releases/download/b9672/llama-b9672-bin-win-cpu-x64.zip';
const LLM_MODEL_URL = 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf';
const LLM_MODEL_FILE = 'qwen2.5-3b-instruct-q4_k_m.gguf';
const LLM_PORT = 8769;
const LLM_MIN_MODEL_BYTES = 5e8;
const llmState = { proc: null, ready: false, starting: null };

function findLlamaServer(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isFile() && e.name.toLowerCase() === 'llama-server.exe') return f; if (e.isDirectory()) { const x = findLlamaServer(f); if (x) return x; } } } catch (e) {}
  return null;
}
function llmModelOk() { try { return fs.existsSync(path.join(LLM_DIR, 'models', LLM_MODEL_FILE)) && fs.statSync(path.join(LLM_DIR, 'models', LLM_MODEL_FILE)).size >= LLM_MIN_MODEL_BYTES; } catch (e) { return false; } }
function llmInstalled() { return !!findLlamaServer(LLM_DIR) && llmModelOk(); }

// ── Module install process tracking (lets the UI cancel a running install) ──
const installProcs = new Set();
function trackInstall(child) { installProcs.add(child); child.on('close', () => installProcs.delete(child)); return child; }
function cancelInstalls() { let n = 0; for (const c of installProcs) { try { c.kill('SIGKILL'); n++; } catch (e) {} } installProcs.clear(); return n; }

function curlTo(url, dest, onPct) {
  return new Promise((resolve, reject) => {
    const c = trackInstall(spawn('curl', ['-L', '--fail', '--retry', '3', '--progress-bar', '-o', dest, url]));
    c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
    c.stderr.on('data', d => { const m = d.toString().match(/([\d.]+)%/); if (m && onPct) onPct(parseFloat(m[1])); });
    c.on('close', code => code === 0 ? resolve() : reject(new Error(code === null ? 'Annulé' : 'Téléchargement échoué (curl ' + code + ')')));
  });
}

async function ensureLocalLlm(onLog) {
  fs.mkdirSync(path.join(LLM_DIR, 'models'), { recursive: true });
  let exe = findLlamaServer(LLM_DIR);
  if (!exe) {
    onLog && onLog({ stage: 'Téléchargement du moteur IA local…', percent: 0 });
    const zip = path.join(LLM_DIR, 'llama.zip');
    await curlTo(LLAMA_URL, zip, p => onLog && onLog({ stage: 'Moteur IA…', percent: Math.round(p * 0.05) }));
    require('child_process').execSync(`powershell -Command "Expand-Archive -Path '${zip}' -DestinationPath '${LLM_DIR}' -Force"`, { timeout: 120000 });
    try { fs.unlinkSync(zip); } catch (e) {}
    exe = findLlamaServer(LLM_DIR);
  }
  if (!exe) throw new Error('llama-server introuvable après extraction.');
  const modelPath = path.join(LLM_DIR, 'models', LLM_MODEL_FILE);
  if (!llmModelOk()) {
    onLog && onLog({ stage: 'Téléchargement du modèle IA (~2 Go, une seule fois)…', percent: 5 });
    await curlTo(LLM_MODEL_URL, modelPath, p => onLog && onLog({ stage: 'Modèle IA (~2 Go)…', percent: 5 + Math.round(p * 0.94) }));
    if (!llmModelOk()) { try { fs.unlinkSync(modelPath); } catch (e) {} throw new Error('Modèle IA incomplet.'); }
  }
  return { exe, modelPath };
}

function startLocalLlm(onLog) {
  if (llmState.ready && llmState.proc && !llmState.proc.killed) return Promise.resolve();
  if (llmState.starting) return llmState.starting;
  llmState.starting = (async () => {
    const { exe, modelPath } = await ensureLocalLlm(onLog);
    onLog && onLog({ stage: 'Démarrage de l\'IA locale…', percent: 99 });
    const srv = spawn(exe, ['-m', modelPath, '--port', String(LLM_PORT), '-c', '4096', '-ngl', '0', '--no-webui'], { cwd: path.dirname(exe), windowsHide: true });
    srv.stderr.on('data', () => {}); srv.stdout.on('data', () => {});
    srv.on('exit', () => { llmState.ready = false; if (llmState.proc === srv) llmState.proc = null; });
    llmState.proc = srv;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const httpGet = (u) => new Promise(r => { require('http').get(u, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => r(b)); }).on('error', () => r(null)); });
    for (let i = 0; i < 90; i++) { await sleep(1000); if (srv.killed) break; const h = await httpGet(`http://127.0.0.1:${LLM_PORT}/health`); if (h && /ok/i.test(h)) { llmState.ready = true; break; } }
    if (!llmState.ready) { try { srv.kill('SIGKILL'); } catch (e) {} throw new Error('Le serveur IA local n\'a pas démarré.'); }
  })();
  try { return llmState.starting; } finally { const p = llmState.starting; p.finally(() => { if (llmState.starting === p) llmState.starting = null; }); }
}

async function localChat(messages, systemPrompt, onLog) {
  await startLocalLlm(onLog);
  const body = JSON.stringify({ messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 512, temperature: 0.7, stream: false });
  const text = await new Promise((resolve, reject) => {
    const req = require('http').request({ host: '127.0.0.1', port: LLM_PORT, path: '/v1/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, x => {
      let b = ''; x.on('data', d => b += d); x.on('end', () => { try { const j = JSON.parse(b); resolve((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim()); } catch (e) { reject(new Error('Réponse IA locale illisible.')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
  return text;
}

app.on('before-quit', () => { try { llmState.proc && llmState.proc.kill('SIGKILL'); } catch (e) {} });

// Pre-download / verify the local AI (with progress) — from Settings.
ipcMain.handle('llm-status', () => {
  let size = 0;
  try { size = fs.statSync(path.join(LLM_DIR, 'models', LLM_MODEL_FILE)).size; } catch (e) {}
  return { installed: llmInstalled(), running: !!(llmState.ready && llmState.proc), size };
});
ipcMain.handle('llm-install', async () => {
  try { await startLocalLlm(d => uiWin()?.webContents.send('llm-progress', d)); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ai-chat', async (event, { messages }) => {
  // Anthropic key (optional, most powerful) — the user's OWN key, never hardcoded.
  let apiKey = '';
  try { const gs = JSON.parse(fs.readFileSync(path.join(ORBIT_DIR, 'settings.json'), 'utf8')); apiKey = (gs.aiApiKey || '').trim(); } catch (e) {}

  const systemPrompt = `Tu es Orbit IA, l'assistant intégré au logiciel vidéo/audio Orbit, et tu PILOTES l'application toi-même.
Orbit embarque déjà tous les moteurs nécessaires (yt-dlp, ffmpeg, RIFE, Real-ESRGAN, HandBrake, Whisper, Topaz, etc.) — l'utilisateur n'a RIEN à installer.

RÈGLE D'OR : ne refuse JAMAIS et ne dis jamais à l'utilisateur d'utiliser un outil externe ou de taper des commandes. Tu FAIS l'action directement dans Orbit.
- Si l'utilisateur donne un lien (YouTube, etc.) ou demande de télécharger une vidéo : Orbit lance le téléchargement automatiquement. Confirme simplement (« Je télécharge ça pour toi »), ne donne pas d'instructions manuelles.
- Si l'utilisateur veut convertir / upscaler / compresser / détourer / transcrire / Topaz : emmène-le dans le bon onglet et explique en une phrase.

Outils (id) : Téléchargements "downloads", Convertisseur & Tags "converter", Abonnements "subscriptions", Interpolateur IA "interpolator", Médiathèque "library", Amélioration IA "enhance", Détourage IA "matting", HandBrake "handbrake", Topaz Video AI "topaz", Transcription "transcription".

Tu peux PILOTER l'interface via l'outil "dispatch_action" : ouvrir un onglet, masquer/afficher un ou tous les onglets, couper le proxy, changer le thème, ouvrir les paramètres, etc. Quand l'utilisateur demande une action, utilise dispatch_action au lieu d'expliquer où cliquer.
Sois concis, chaleureux et concret. Réponds toujours en français.`;

  // No Anthropic key → free local AI (llama.cpp + Qwen). Downloads on first use.
  if (!apiKey) {
    try { return { text: await localChat(messages, systemPrompt, d => uiWin()?.webContents.send('llm-progress', d)) }; }
    catch (e) { return { error: 'IA locale : ' + ((e && e.message) || 'indisponible') }; }
  }

  const tools = [{
    name: "dispatch_action",
    description: "Pilote l'interface Orbit. actionName possibles: 'switchTab' (payload {tab}), 'setTabVisible' (payload {tab,visible:bool}), 'enableAllTabs', 'disableAllTabs', 'setSetting' (payload {key,value} — clés: proxy, theme('dark'|'light'), accentColor, notifications(bool), maxConcurrent), 'toggleSetting' (payload {key}), 'openSettings', 'openImport'. tab parmi: downloads, converter, subscriptions, interpolator, library, enhance, matting, handbrake, topaz, transcription.",
    input_schema: {
      type: "object",
      properties: {
        actionName: { type: "string", description: "Ex: 'switchTab', 'disableAllTabs', 'setSetting'" },
        payload: { type: "object", description: "Ex: { tab: 'handbrake' } ou { key: 'proxy', value: '' }", additionalProperties: true }
      },
      required: ["actionName", "payload"]
    }
  }];

  const body = JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages,
    temperature: 0.7,
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            resolve({ error: parsed.error.message || 'Erreur API Claude.' });
            return;
          }
          // Extract text + tool_use blocks
          let text = '';
          let functionCall = null;
          if (parsed.content && Array.isArray(parsed.content)) {
            for (const block of parsed.content) {
              if (block.type === 'text') text += block.text;
              else if (block.type === 'tool_use' && block.name === 'dispatch_action') {
                functionCall = { name: block.name, arguments: block.input };
              }
            }
          }
          resolve({ text: text || (functionCall ? "J'exécute l'action :" : ''), functionCall });
        } catch (e) {
          resolve({ error: 'Erreur de parsing de la réponse Claude.' });
        }
      });
    });

    req.on('error', (e) => resolve({ error: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ error: 'Délai dépassé (30s).' }); });
    req.write(body);
    req.end();
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // Fully frameless: no native caption buttons — Orbit draws its own window
    // controls in the custom title bar (avoids the duplicate native min/max/close).
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    }
  });

  // Setup Auto-Updater Listeners
  autoUpdater.autoDownload = false; // We'll trigger manually so user sees progress
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater-status', { type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    // Do NOT auto-download — ask the user first (handled by the launch prompt).
    mainWindow.webContents.send('updater-status', { type: 'available', version: info.version });
    mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('app-update-available', { detail: ${JSON.stringify(info)} }))`);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater-status', { type: 'up-to-date' });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater-status', { type: 'downloading', percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater-status', { type: 'ready', version: info.version });
    mainWindow.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('app-update-ready', { detail: ${JSON.stringify(info)} }))`);
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater check failed:', err.message || err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', { type: 'error', message: err.message });
    }
  });

  // Global unhandled rejection handler to prevent crashes
  process.on('unhandledRejection', (reason) => {
    // Silently ignore SIGINT (cancelled downloads) and GitHub update errors
    if (reason && (reason.signal === 'SIGINT' || (reason.message || '').includes('No published versions') || (reason.message || '').includes('latest.yml'))) return;
    console.error('UnhandledRejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    if ((err.message || '').includes('SIGINT') || (err.message || '').includes('No published versions')) return;
    console.error('UncaughtException:', err);
  });

  ipcMain.handle('check-for-update', async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(true, true);
  });

  // Download the pending app update (after the user accepts the launch prompt).
  ipcMain.handle('start-update-download', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  // Check bundled tools (yt-dlp) for updates — returned structured for the launch prompt.
  ipcMain.handle('check-tool-updates', async () => {
    const out = { ytdlp: null };
    try {
      const bin = getYtDlpBin();
      const cur = await new Promise(res => { try { const p = spawn(bin, ['--version'], { windowsHide: true }); let s = ''; p.stdout.on('data', d => s += d); p.on('close', () => res(s.trim())); p.on('error', () => res('')); } catch (e) { res(''); } });
      let latest = '';
      try {
        const j = await new Promise((rs, rj) => { https.get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', { headers: { 'User-Agent': 'Orbit' } }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { rs(JSON.parse(b)); } catch (e) { rj(e); } }); }).on('error', rj); });
        latest = (j.tag_name || j.name || '').trim();
      } catch (e) {}
      if (cur) out.ytdlp = { current: cur, latest, outdated: !!(latest && latest.replace(/[^0-9.]/g, '') !== cur.replace(/[^0-9.]/g, '')) };
    } catch (e) {}
    return out;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    loadURL(mainWindow);
  }
}

const ORBIT_DIR = path.join(os.homedir(), '.orbit');

// Return a writable download directory. A path saved on another machine (a
// different user's home that doesn't exist here) throws WinError 5 when created
// → fall back to THIS machine's Downloads folder.
function usableDownloadDir(d) {
  try { if (d) { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } } catch (e) {}
  try { const dl = app.getPath('downloads'); fs.mkdirSync(dl, { recursive: true }); return dl; } catch (e) { return os.homedir(); }
}

// Apply persisted app-level settings that MUST be set before app is ready.
let bootSettings = {};
try { bootSettings = JSON.parse(fs.readFileSync(path.join(ORBIT_DIR, 'settings.json'), 'utf8')); } catch (e) {}
if (bootSettings.disableHardwareAccel) { try { app.disableHardwareAcceleration(); } catch (e) {} }

function setupOrbitEnv() {
  const dirs = [
    ORBIT_DIR,
    path.join(ORBIT_DIR, 'ffmpeg'),
    path.join(ORBIT_DIR, 'storage'),
    path.join(ORBIT_DIR, 'subscriptions'),
    path.join(ORBIT_DIR, 'deno')
  ];

  dirs.forEach(d => {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  });

  // Note: the changelog shown via the menu is the bundled changelog.html
  // (loaded from __dirname in the 'open-changelog' handler). Keep that file
  // updated with every release — no runtime generation needed here.

  // Copy ffmpeg if missing
  const localFfmpegPath = path.join(ORBIT_DIR, 'ffmpeg', 'ffmpeg.exe');
  if (ffmpegPath && !fs.existsSync(localFfmpegPath)) {
    try { fs.copyFileSync(ffmpegPath, localFfmpegPath); } catch (e) { console.error('Failed to copy ffmpeg', e); }
  }

  // Load Settings
  const settingsPath = path.join(ORBIT_DIR, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) {}
  }
  
  // Use the bundled signed binary — no download at startup (AV-friendly)
  youtubedl = require('youtube-dl-exec').create(getYtDlpBin());
  console.log('[yt-dlp] Using:', getYtDlpBin());
}

function downloadYtDlp(dest) {
  const tmpDest = dest + '.tmp';
  const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
  const file = fs.createWriteStream(tmpDest);
  
  const handleResponse = (response) => {
    if (response.statusCode === 302 || response.statusCode === 301) {
      https.get(response.headers.location, handleResponse).on('error', handleError);
    } else {
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            fs.renameSync(tmpDest, dest);
            console.log("yt-dlp download complete!");
            youtubedl = require('youtube-dl-exec').create(dest);
          } catch(e) {
            console.error("Error renaming yt-dlp.exe", e);
          }
        });
      });
    }
  };

  const handleError = (err) => {
    console.error("Error downloading yt-dlp:", err);
    try { fs.unlinkSync(tmpDest); } catch(e) {}
  };

  https.get(url, handleResponse).on('error', handleError);
}

ipcMain.handle('get-global-settings', () => {
  const settingsPath = path.join(ORBIT_DIR, 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { return {}; }
  }
  return {};
});

ipcMain.handle('save-global-settings', (event, settings) => {
  const settingsPath = path.join(ORBIT_DIR, 'settings.json');
  try { if (!fs.existsSync(ORBIT_DIR)) fs.mkdirSync(ORBIT_DIR, { recursive: true }); } catch (e) {}
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return true;
});

// ── App-level system settings (all genuinely functional) ──
ipcMain.handle('set-launch-at-startup', (event, enabled) => {
  try { app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath }); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('get-launch-at-startup', () => {
  try { return app.getLoginItemSettings().openAtLogin; } catch (e) { return false; }
});

// Compute / clear Orbit's temporary working files (leftover frame dirs, audio, previews).
function listCacheTargets() {
  const targets = [];
  const modulesDir = path.join(ORBIT_DIR, 'modules');
  try {
    for (const name of fs.readdirSync(modulesDir)) {
      if (/^(interp_|enh_|trx_)/.test(name) || /_audio\.wav$/.test(name) || /_(in|out|uin|uout|iin|iout)$/.test(name)) {
        targets.push(path.join(modulesDir, name));
      }
    }
  } catch (e) {}
  try {
    const tmp = os.tmpdir();
    for (const name of fs.readdirSync(tmp)) {
      if (/^orbit_(tvai|enh|vs|thumb|ethumb|cookies|rife_test)/.test(name)) targets.push(path.join(tmp, name));
    }
  } catch (e) {}
  return targets;
}
function dirSize(p) {
  let total = 0;
  try {
    const st = fs.statSync(p);
    if (st.isFile()) return st.size;
    for (const e of fs.readdirSync(p)) total += dirSize(path.join(p, e));
  } catch (e) {}
  return total;
}
ipcMain.handle('get-cache-size', () => {
  let bytes = 0;
  for (const t of listCacheTargets()) bytes += dirSize(t);
  return bytes;
});
ipcMain.handle('clear-temp-cache', () => {
  let freed = 0;
  for (const t of listCacheTargets()) { const s = dirSize(t); try { fs.rmSync(t, { recursive: true, force: true }); freed += s; } catch (e) {} }
  return { freed };
});

ipcMain.handle('test-proxy', async (event, proxy) => {
  if (!proxy) return { ok: false, error: 'Aucun proxy défini.' };
  return new Promise((resolve) => {
    try {
      const ytdlpBin = getYtDlpBin();
      const child = spawn(ytdlpBin, ['--proxy', proxy, '--simulate', '--no-warnings', '-q', 'https://www.youtube.com/watch?v=jNQXAC9IVRw'], { windowsHide: true });
      let err = '';
      child.stderr.on('data', d => err += d.toString());
      const to = setTimeout(() => { try { child.kill(); } catch (e) {} resolve({ ok: false, error: 'Délai dépassé' }); }, 15000);
      child.on('close', code => { clearTimeout(to); resolve(code === 0 ? { ok: true } : { ok: false, error: err.slice(-150) || 'Échec' }); });
      child.on('error', e => { clearTimeout(to); resolve({ ok: false, error: e.message }); });
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
});

ipcMain.handle('notify', (event, { title, body }) => {
  try {
    const { Notification } = require('electron');
    if (Notification.isSupported()) { new Notification({ title: title || 'Orbit', body: body || '' }).show(); return true; }
  } catch (e) {}
  return false;
});

app.whenReady().then(() => {
  protocol.registerFileProtocol('media', (request, callback) => {
    try {
      // Canonical form: media:///C%3A/Users/.../video.mp4 (path in the URL path
      // component, NOT the host — putting it in the host makes Chromium lowercase
      // and mangle the percent-encoded drive/path, which broke playback at random).
      const parsed = new URL(request.url);
      let raw = decodeURIComponent(parsed.pathname || '');
      // Legacy fallback: old builds emitted media://<encoded-whole-path>, which
      // lands in the host component.
      if (!raw || raw === '/') {
        raw = decodeURIComponent((parsed.host || '') + (parsed.pathname || ''));
      }
      // Strip the leading slash before a Windows drive letter ("/C:/..." -> "C:/...").
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(raw)) raw = raw.slice(1);
      raw = raw.replace(/\//g, path.sep);

      if (!raw || !fs.existsSync(raw)) {
        console.error('Media protocol: file not found ->', raw, '(from', request.url + ')');
        return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      }
      return callback({ path: raw });
    } catch (error) {
      console.error('Media protocol error:', error, request.url);
      return callback({ error: -2 }); // net::FAILED
    }
  });

  setupOrbitEnv();
  setupSnifferSession();
  createWindow();

  // Init Discord Rich Presence
  setTimeout(() => initDiscordRPC(), 3000);

  // Check for updates at launch — only CHECK (no auto-download); the renderer
  // shows a prompt asking the user whether to update.
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(e => console.error("Auto-updater check failed:", e));
    }, 2500);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (rpcClient) { try { rpcClient.destroy(); } catch(e) {} }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('app-quit', () => {
  app.quit();
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('toggle-maximize-window', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) { mainWindow.unmaximize(); return false; }
  mainWindow.maximize(); return true;
});

ipcMain.handle('open-home-dir', async () => {
  await shell.openPath(ORBIT_DIR);
});



ipcMain.handle('open-file', async (event, filePath) => {
  if (!filePath) return;
  const result = await shell.openPath(filePath);
  if (result) {
    await shell.openPath(path.dirname(filePath));
  }
});

ipcMain.handle('show-item-in-folder', (event, filePath) => {
  if (!filePath) return;
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    shell.openPath(path.dirname(filePath));
  }
});

ipcMain.handle('open-external-url', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return { success: true };
  }
  return { success: false, message: 'Invalid URL' };
});

ipcMain.handle('open-changelog', async () => {
  const changelogPath = path.join(__dirname, 'changelog.html');
  const win = new BrowserWindow({
    width: 900,
    height: 780,
    title: 'Orbit — Changelog',
    autoHideMenuBar: true,
    backgroundColor: '#080808',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    icon: path.join(__dirname, 'assets', 'icon.ico').replace(/\.ico$/, process.platform === 'darwin' ? '.icns' : '.ico'),
  });
  win.loadFile(changelogPath);
});


// Helper: fetch JSON from HTTPS
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.get({
      hostname: options.hostname,
      path: options.pathname + options.search,
      headers: { 'User-Agent': 'Orbit-App/1.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// Helper: run a command and get stdout
function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

ipcMain.handle('check-updates', async () => {
  const results = [];
  let allGood = true;

  // --- Check yt-dlp ---
  try {
    let localVersion = null;
    try {
      // Check the SAME binary that's actually used for downloads (the updated
      // ~/.orbit/yt-dlp.exe when present), not the stale bundled one — otherwise
      // it reports "update available" forever even after updating.
      const ytBin = getYtDlpBin();
      if (ytBin && fs.existsSync(ytBin)) {
        localVersion = await runCommand(ytBin, ['--version']);
      }
    } catch (_) {}

    // Get latest yt-dlp release from GitHub
    let latestVersion = null;
    try {
      const ghData = await fetchJSON('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
      latestVersion = ghData.tag_name || ghData.name;
    } catch (_) {}

    if (localVersion && latestVersion) {
      const localClean = localVersion.replace(/[^0-9.]/g, '');
      const latestClean = latestVersion.replace(/[^0-9.]/g, '');
      if (localClean === latestClean) {
        results.push(`✓ yt-dlp ${localVersion} (à jour)`);
      } else {
        allGood = false;
        results.push(`⚠ yt-dlp ${localVersion} → ${latestVersion} disponible`);
      }
    } else if (localVersion) {
      results.push(`✓ yt-dlp ${localVersion} (installé)`);
    } else {
      allGood = false;
      results.push('✗ yt-dlp non trouvé');
    }
  } catch (err) {
    allGood = false;
    results.push(`✗ Erreur yt-dlp: ${err.message}`);
  }

  // --- Check ffmpeg ---
  try {
    const ffmpegVersion = await runCommand(ffmpegPath, ['-version']);
    const match = ffmpegVersion.match(/ffmpeg version ([^\s]+)/);
    const ver = match ? match[1] : 'installé';
    results.push(`✓ ffmpeg ${ver}`);
  } catch (_) {
    results.push('⚠ ffmpeg non trouvé (certains formats peuvent ne pas fonctionner)');
  }

  const message = allGood
    ? `Tout est à jour ! (${results.join(' | ')})`
    : results.join(' | ');

  return { upToDate: allGood, message, details: results };
});

ipcMain.handle('cancel-install', () => ({ ok: true, killed: cancelInstalls() }));

ipcMain.handle('update-ytdlp', async () => {
  try {
    const dest = path.join(ORBIT_DIR, 'yt-dlp.exe');
    await new Promise((resolve, reject) => {
      downloadYtDlp(dest);
      // Poll until file appears or timeout
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (fs.existsSync(dest) && fs.statSync(dest).size > 5000000) { clearInterval(check); resolve(); }
        else if (attempts > 60) { clearInterval(check); reject(new Error('Timeout')); }
      }, 2000);
    });
    return { success: true, message: 'yt-dlp mis à jour avec succès dans ~/.orbit/' };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('analyze-url', async (event, url) => {
  try {
    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      youtubeSkipDashManifest: true,
    });
    return { success: true, data: info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-default-downloads', () => {
  return app.getPath('downloads');
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-logs', () => {
  const logPath = path.join(os.homedir(), '.orbit', 'orbit.log');
  if (fs.existsSync(logPath)) {
    shell.openPath(logPath);
  } else {
    fs.writeFileSync(logPath, '--- Orbit Logs ---\n');
    shell.openPath(logPath);
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

let snifferWindow = null;
const seenSnifferUrls = new Set();
// Map of media-request-URL → real page Referer captured from request headers.
// CDNs like Mux enforce a referer/domain restriction, so we must forward the
// actual embedding page URL, not the media URL itself.
const refererByUrl = new Map();
let lastMainFrameUrl = '';
// Real page title/URL reported by browser.html so downloads are named after the
// actual video page instead of an opaque stream-URL hash.
let snifferPageTitle = '';
let snifferPageUrl = '';

// ── Attach stream interceptors to the sniffer session at startup ──────────────
// This runs once. The webview in browser.html uses partition="persist:sniffer",
// so all traffic goes through this session regardless of which window opened it.
function setupSnifferSession() {
  const { session } = require('electron');
  const sSession = session.fromPartition('persist:sniffer');

  // Collect every cookie the session knows so yt-dlp can authenticate. We grab
  // cookies for both the media host AND the page host (often different domains).
  async function gatherCookies(mediaUrl, pageUrl) {
    const jar = new Map();
    for (const u of [mediaUrl, pageUrl].filter(Boolean)) {
      try {
        const cks = await sSession.cookies.get({ url: u });
        cks.forEach(c => jar.set(c.name, c.value));
      } catch (e) {}
    }
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // Capture the real Referer header on EVERY request so we can associate it
  // with media URLs. Track the current top page too.
  const allReq = { urls: ['https://*/*', 'http://*/*'] };
  sSession.webRequest.onBeforeSendHeaders(allReq, (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.url.startsWith('http')) {
      lastMainFrameUrl = details.url;
    }
    const h = details.requestHeaders || {};
    const ref = h['Referer'] || h['referer'] || h['Origin'] || h['origin'] || '';
    const urlLower = details.url.toLowerCase();
    if (urlLower.includes('.m3u8') || urlLower.includes('.mpd') || urlLower.includes('.mp4')) {
      refererByUrl.set(details.url.split('?')[0], ref || lastMainFrameUrl);
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  const emit = async (url, title, type) => {
    const key = url.split('?')[0];
    if (seenSnifferUrls.has(key)) return;
    seenSnifferUrls.add(key);
    const pageRef = snifferPageUrl || refererByUrl.get(key) || lastMainFrameUrl || url;
    const cookieStr = await gatherCookies(url, pageRef);
    // Prefer the real page title for both the display label and the output filename.
    const niceTitle = snifferPageTitle || title;
    const data = {
      url, type, cookies: cookieStr, referer: pageRef, pageUrl: pageRef,
      title: niceTitle,
      videoTitle: snifferPageTitle || '',
    };
    if (snifferWindow) snifferWindow.webContents.send('browser-video-detected', data);
    if (mainWindow) mainWindow.webContents.send('sniffer-caught-video', data);
  };

  const streamFilter = { urls: ['*://*/*.m3u8*', '*://*/*.mpd*'] };
  sSession.webRequest.onBeforeRequest(streamFilter, (details, callback) => {
    const urlLower = details.url.toLowerCase();
    if (urlLower.includes('rendition') || urlLower.includes('audio.m3u8') || urlLower.includes('.m4s')) {
      callback({ cancel: false }); return;
    }
    const type = urlLower.includes('.m3u8') ? 'HLS (m3u8)' : 'DASH (mpd)';
    emit(details.url, 'Flux ' + type + ' détecté', type);
    callback({ cancel: false });
  });

  const allFilter = { urls: ['https://*/*', 'http://*/*'] };
  sSession.webRequest.onHeadersReceived(allFilter, (details, callback) => {
    const urlLower = details.url.toLowerCase();
    if (urlLower.includes('.ts') || urlLower.includes('.m4s') || urlLower.includes('segment') ||
        urlLower.includes('rendition') || urlLower.includes('chunk')) {
      callback({}); return;
    }
    const ct = ([...(details.responseHeaders?.['content-type'] || []), ...(details.responseHeaders?.['Content-Type'] || [])]).join('').toLowerCase();
    if (ct.includes('video/mp2t') || ct.includes('video/iso.segment') || ct.includes('application/octet')) {
      callback({}); return;
    }
    const isVideo = ct.startsWith('video/') || ct.includes('application/x-mpegurl') || ct.includes('application/vnd.apple.mpegurl');
    if (isVideo) {
      const ext = urlLower.includes('.mp4') ? 'MP4' : urlLower.includes('.webm') ? 'WebM' : urlLower.includes('.mov') ? 'MOV' : 'Vidéo';
      emit(details.url, `Fichier ${ext} détecté`, ext);
    }
    callback({});
  });
}

ipcMain.on('open-sniffer', (event, targetUrl) => {
  if (snifferWindow) {
    snifferWindow.focus();
    if (targetUrl) {
      snifferWindow.webContents.executeJavaScript(
        `navigate(${JSON.stringify(targetUrl)})`
      ).catch(() => {});
    }
    return;
  }

  seenSnifferUrls.clear();

  snifferWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    title: 'Orbit Browser',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'browser-preload.js'),
      webviewTag: true,
    }
  });

  snifferWindow.setMenu(null);
  snifferWindow.loadFile(path.join(__dirname, 'browser.html'),
    targetUrl ? { query: { url: targetUrl } } : {}
  );

  snifferWindow.on('closed', () => {
    snifferWindow = null;
    seenSnifferUrls.clear();
  });
});

// In-app sniffer (embedded webview) asks to reset the dedup set so a fresh
// browsing session can re-detect streams it saw before.
ipcMain.on('sniffer-clear-seen', () => {
  seenSnifferUrls.clear();
});

// Route "download this video" from browser → DownloadInterface in main window
// browser.html reports the current page title + URL so downloads can be named
// after the real video instead of a stream-URL hash.
ipcMain.on('sniffer-page-info', (event, info) => {
  if (info && typeof info.title === 'string') snifferPageTitle = info.title.trim();
  if (info && typeof info.url === 'string' && info.url.startsWith('http')) snifferPageUrl = info.url;
});

ipcMain.on('browser-download-video', (event, data) => {
  if (mainWindow) {
    const title = data.videoTitle || data.title || snifferPageTitle || 'Vidéo';
    mainWindow.webContents.send('sniffer-caught-video', {
      url: data.url,
      title,
      videoTitle: data.videoTitle || snifferPageTitle || '',
      cookies: data.cookies || '',
      referer: data.referer || snifferPageUrl || data.url,
      pageUrl: data.referer || snifferPageUrl || data.url,
      type: data.type || 'Vidéo',
    });
    mainWindow.focus();
  }
});

// Analyze a page URL with yt-dlp --dump-json to check if it's downloadable
ipcMain.handle('browser-analyze-url', async (event, url) => {
  return new Promise(resolve => {
    const ytdlp = getYtDlpBin();
    const args = ['--dump-json', '--no-playlist', '--no-warnings', '--socket-timeout', '10', url];
    const child = spawn(ytdlp, args, { windowsHide: true });
    let out = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.on('close', code => {
      if (code === 0 && out.trim()) {
        try {
          const info = JSON.parse(out.split('\n').find(l => l.trim().startsWith('{')));
          resolve({ title: info.title, extractor: info.extractor_key || info.extractor, thumbnail: info.thumbnail });
        } catch(e) { resolve(null); }
      } else { resolve(null); }
    });
    child.on('error', () => resolve(null));
    setTimeout(() => { try { child.kill(); } catch(e) {} resolve(null); }, 20000);
  });
});


const activeDownloads = new Map();

// ─── Crunchyroll Sniffer ───────────────────────────────────────────────────────

let crunchyrollWindow = null;

ipcMain.on('open-crunchyroll-sniffer', async () => {
  if (crunchyrollWindow) {
    crunchyrollWindow.focus();
    return;
  }

  crunchyrollWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    title: 'Orbit — Crunchyroll',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:crunchyroll'
    }
  });

  crunchyrollWindow.setMenu(null);
  crunchyrollWindow.loadURL('https://www.crunchyroll.com');

  async function getCrunchyrollCookies() {
    try {
      const cookies = await crunchyrollWindow.webContents.session.cookies.get({ url: 'https://www.crunchyroll.com' });
      const etpRt = cookies.find(c => c.name === 'etp_rt');
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      return { cookies, cookieStr, etpRt: etpRt?.value || null };
    } catch(e) {
      return { cookies: [], cookieStr: '', etpRt: null };
    }
  }

  async function handleNavigation(url) {
    if (!crunchyrollWindow) return;

    const { cookieStr, etpRt } = await getCrunchyrollCookies();
    mainWindow.webContents.send('crunchyroll-sniffer-status', {
      isLoggedIn: !!etpRt,
      currentUrl: url
    });

    // Detect episode page navigation
    if (url.includes('crunchyroll.com/watch/')) {
      try {
        const title = crunchyrollWindow.webContents.getTitle();
        // Extract thumbnail from og:image meta tag
        let thumbnail = '';
        try {
          thumbnail = await crunchyrollWindow.webContents.executeJavaScript(
            `document.querySelector('meta[property="og:image"]')?.content || ''`
          );
        } catch(e) {}

        mainWindow.webContents.send('crunchyroll-episode-detected', {
          url,
          title: title.replace(' | Crunchyroll', '').trim() || 'Épisode Crunchyroll',
          thumbnail,
          cookies: cookieStr,
          etpRt,
          isLoggedIn: !!etpRt
        });
      } catch(e) {
        console.error('Crunchyroll episode detect error:', e);
      }
    }
  }

  crunchyrollWindow.webContents.on('did-navigate', (e, url) => handleNavigation(url));
  crunchyrollWindow.webContents.on('did-navigate-in-page', (e, url) => handleNavigation(url));

  crunchyrollWindow.on('closed', () => { crunchyrollWindow = null; });
});

// ─── Crunchyroll Download ──────────────────────────────────────────────────────

ipcMain.on('start-crunchyroll-download', (event, { id, url, cookies, quality, audioLang, subLang, outputDir }) => {
  const downloadDir = usableDownloadDir(outputDir);

  // Write Netscape-format cookie file
  const cookieFilePath = path.join(ORBIT_DIR, `cr_${id}.txt`);
  const cookieLines = ['# Netscape HTTP Cookie File'];
  if (cookies) {
    cookies.split('; ').forEach(pair => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx < 1) return;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (name) cookieLines.push(`.crunchyroll.com\tTRUE\t/\tFALSE\t2147483647\t${name}\t${value}`);
    });
  }
  fs.writeFileSync(cookieFilePath, cookieLines.join('\n') + '\n', 'utf8');

  const ytdlpBin = getYtDlpBin();
  const ffmpegBin = getFfmpegBin();

  // Quality → height
  const heightMap = { '1080p': 1080, '720p': 720, '480p': 480, '360p': 360 };
  const height = heightMap[quality] || 1080;

  // Output template: Series/S01E01 - Title [1080p].mkv
  const outputTemplate = path.join(downloadDir,
    '%(series,title)s', 'Saison %(season_number,1)s',
    'S%(season_number,1)02dE%(episode_number,0)02d - %(episode,title)s [%(height)sp].%(ext)s'
  );

  const args = [
    url,
    '--cookies', cookieFilePath,
    '-f', `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`,
    '--merge-output-format', 'mkv',
    '-o', outputTemplate,
    '--embed-metadata',
    '--no-warnings',
    '--newline',
  ];

  if (fs.existsSync(ffmpegBin)) args.push('--ffmpeg-location', ffmpegBin);

  // Subtitles
  if (subLang && subLang !== 'none') {
    args.push('--write-subs', '--sub-langs', subLang, '--embed-subs', '--convert-subs', 'ass');
  }

  // Audio language hint via extractor args
  args.push('--extractor-args', `crunchyrollbeta:hardsub=none`);

  console.log(`[CR] Starting download: ${url} quality=${quality} audio=${audioLang} subs=${subLang}`);

  const child = spawn(ytdlpBin, args, { windowsHide: true });

  child.stdout.on('data', data => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      const pctMatch = line.match(/(\d+\.?\d*)%/);
      const speedMatch = line.match(/([\d.]+\s*[KMGkm]iB\/s)/);
      const etaMatch = line.match(/ETA\s+(\S+)/);
      if (pctMatch) {
        mainWindow.webContents.send('crunchyroll-dl-progress', {
          id,
          percent: parseFloat(pctMatch[1]),
          speed: speedMatch?.[1] || '',
          eta: etaMatch?.[1] || ''
        });
      }
      mainWindow.webContents.send('download-log', { id, line, level: 'info' });
    });
  });

  child.stderr.on('data', data => {
    data.toString().split('\n').filter(l => l.trim()).forEach(line => {
      mainWindow.webContents.send('download-log', { id, line, level: 'error' });
    });
  });

  child.on('close', code => {
    try { fs.unlinkSync(cookieFilePath); } catch(e) {}
    if (code === 0) {
      mainWindow.webContents.send('crunchyroll-dl-complete', { id });
    } else {
      mainWindow.webContents.send('crunchyroll-dl-error', { id, error: `yt-dlp exit code ${code} — vérifie que tu es bien connecté à Crunchyroll dans le Sniffer` });
    }
  });

  child.on('error', err => {
    try { fs.unlinkSync(cookieFilePath); } catch(e) {}
    mainWindow.webContents.send('crunchyroll-dl-error', { id, error: err.message });
  });

  activeDownloads.set(id, child);
});

ipcMain.on('start-download', (event, { id, url, format, options }) => {
  // Crunchyroll: sniffer catches the raw MPD manifest URL — redirect to the
  // episode watch page so yt-dlp's crunchyrollbeta extractor handles DRM auth.
  if (/crunchyroll\.com\/playback\/v\d+\/manifest\//i.test(url)) {
    const m = url.match(/\/manifest\/([A-Z0-9]+)/i);
    if (m) {
      // strip 4-char locale suffix (FRFR, DEDE, ESES …)
      const videoId = m[1].replace(/[A-Z]{4}$/i, '');
      url = `https://www.crunchyroll.com/watch/${videoId}/`;
    }
  }

  const settingsPath = path.join(ORBIT_DIR, 'settings.json');
  let globalSettings = {};
  if (fs.existsSync(settingsPath)) {
    try { globalSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch(e) {}
  }

  // Resolve a USABLE download directory (handles paths saved on another machine
  // that can't be created here → WinError 5; falls back to this PC's Downloads).
  const downloadDir = usableDownloadDir(globalSettings.outputDir || options.outputDir);

  // Is this a direct stream URL (sniffer-caught m3u8/mpd/mp4)?
  const isDirectStream = /\.(m3u8|mpd|mp4|webm|mov)(\?|$)/i.test(url);

  // Sanitize a title for use as a Windows filename (strip illegal chars).
  const sanitizeName = (s) => (s || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')   // illegal on Windows
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);

  // When the sniffer provides the real page title, name the file after it.
  // yt-dlp's generic extractor would otherwise use an opaque URL hash.
  const cleanTitle = sanitizeName(options.videoTitle);
  const outputTemplate = cleanTitle
    ? path.join(downloadDir, `${cleanTitle}.%(ext)s`)
    : path.join(downloadDir, '%(title)s.%(ext)s');

  const args = {
    output: outputTemplate,
    ffmpegLocation: path.join(ORBIT_DIR, 'ffmpeg', 'ffmpeg.exe')
  };

  if (globalSettings.proxy || options.proxy) args.proxy = globalSettings.proxy || options.proxy;
  if (globalSettings.extractAudio) args.extractAudio = true;
  if (globalSettings.noPart) args.noPart = true;
  if (globalSettings.mtime) args.mtime = true;
  if (globalSettings.limitRate) args.limitRate = globalSettings.limitRate;
  if (globalSettings.forceIPv4) args.forceIpv4 = true;
  if (globalSettings.forceIPv6) args.forceIpv6 = true;
  if (globalSettings.keepVideo) args.keepVideo = true;
  if (globalSettings.embedMetadata) args.addMetadata = true;
  if (globalSettings.embedThumbnail || globalSettings.writeThumbnail) args.writeThumbnail = true;
  if (globalSettings.embedSubs) args.embedSubs = true;
  if (globalSettings.writeInfoJson) args.writeInfoJson = true;
  if (globalSettings.sponsorblock) args.sponsorblockMark = 'all';
  if (globalSettings.removeSponsors) args.sponsorblockRemove = 'all';
  if (globalSettings.downloadArchive) args.downloadArchive = path.join(ORBIT_DIR, 'archive.txt');
  if (globalSettings.noCheckCertificate) args.noCheckCertificate = true;
  if (globalSettings.embedThumbnail) args.embedThumbnail = true;
  if (globalSettings.restrictFilenames) args.restrictFilenames = true;
  if (globalSettings.ignoreErrors) args.ignoreErrors = true;
  if (globalSettings.concurrentFragments && Number(globalSettings.concurrentFragments) > 1) args.concurrentFragments = Number(globalSettings.concurrentFragments);
  if (globalSettings.cookiesFromBrowser && globalSettings.cookiesFromBrowser !== 'none' && !options.cookies && !options.cookiesFromBrowser) args.cookiesFromBrowser = globalSettings.cookiesFromBrowser;
  // Advanced: parse user-supplied yt-dlp flags ("--flag value" / "--bool") into options.
  if (globalSettings.customArgs && typeof globalSettings.customArgs === 'string') {
    const toks = globalSettings.customArgs.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      if (!tok.startsWith('--')) continue;
      const key = tok.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = toks[i + 1];
      if (next && !next.startsWith('--')) { args[key] = next.replace(/^"|"$/g, ''); i++; } else { args[key] = true; }
    }
  }

  // Toggles
  if (options.embedSubtitles || options.embedSubs) args.embedSubs = true;
  if (options.embedThumbnail) args.embedThumbnail = true;
  if (options.isPlaylist) {
    args.yesPlaylist = true;
  } else {
    args.noPlaylist = true;
  }

  // Format mapping
  if (options.audioOnly || globalSettings.extractAudio) {
    args.extractAudio = true;
    if (format === 'MP3') args.audioFormat = 'mp3';
    else if (format === 'FLAC') args.audioFormat = 'flac';
    else if (format === 'WAV') args.audioFormat = 'wav';
    else if (format === 'M4A') args.audioFormat = 'm4a';
    else if (format === 'OGG') args.audioFormat = 'vorbis';
    else if (format === 'ALAC') args.audioFormat = 'alac';
    else args.audioFormat = 'mp3'; // default fallback
  } else if (isDirectStream) {
    // Direct HLS/DASH/MP4 stream from the sniffer. The [ext=mp4] filters below
    // break on HLS variants (which have no ext), so use plain resolution caps
    // with a generous fallback to 'best'.
    const heightMap = { '8K': 4320, '4K': 2160, '2K': 1440, '1080p': 1080, '720p': 720, '480p': 480, '360p': 360, '144p': 144 };
    const h = heightMap[format];
    args.format = h
      ? `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]/best`
      : 'bestvideo+bestaudio/best';
    args.mergeOutputFormat = 'mp4';
  } else {
    // Video resolutions
    if (format === '8K') {
      args.format = 'bestvideo[height<=4320][ext=mp4]+bestaudio[ext=m4a]/best[height<=4320][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '4K') {
      args.format = 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '2K') {
      args.format = 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '1080p') {
      args.format = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '720p') {
      args.format = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '480p') {
      args.format = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '360p') {
      args.format = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === '144p') {
      args.format = 'bestvideo[height<=144][ext=mp4]+bestaudio[ext=m4a]/best[height<=144][ext=mp4]/best';
      args.mergeOutputFormat = 'mp4';
    } else if (format === 'WEBM') {
      args.format = 'bestvideo[ext=webm]+bestaudio/best[ext=webm]/best';
    } else { // BEST or MP4
      args.format = 'bestvideo+bestaudio/best';
      args.mergeOutputFormat = 'mp4';
    }
  }

  // Toggles
  if (options.embedSubtitles || options.embedSubs) args.embedSubs = true;
  if (options.embedThumbnail) args.embedThumbnail = true;
  if (options.isPlaylist) {
    args.yesPlaylist = true;
  } else {
    args.noPlaylist = true;
  }

  // New Advanced Global Settings
  if (options.limitRate) {
    args.limitRate = '50K'; // Example usage or logic if limitRate is boolean or string
  }
  if (options.forceIPv4) args.forceIpv4 = true;
  if (options.forceIPv6) args.forceIpv6 = true;
  if (options.keepVideo) args.keepVideo = true;
  if (options.embedMetadata) args.embedMetadata = true;
  if (options.removeSponsors) {
    args.sponsorblockRemove = 'all';
  }
  if (options.sponsorChapters) {
    args.sponsorblockMark = 'all';
  }
  if (options.recodeVideo) {
    args.recodeVideo = 'mp4';
  }

  if (options.trimStart || options.trimEnd) {
    const start = options.trimStart || '0';
    const end = options.trimEnd || 'inf';
    args.downloadSections = `*${start}-${end}`;
  }

  if (options.cookiesFromBrowser && !options.cookies) {
    // Verify Chrome profile exists before passing --cookies-from-browser
    const chromeCookiePaths = [
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies'),
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Cookies'),
      path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome Beta', 'User Data', 'Default', 'Network', 'Cookies'),
    ];
    if (chromeCookiePaths.some(p => fs.existsSync(p))) {
      args.cookiesFromBrowser = options.cookiesFromBrowser;
    }
  }

  if (options.cookies || options.referer) {
    const refererStr = options.referer || '';
    if (options.cookies) {
      // Write a Netscape-format cookie file — more reliable than --add-header Cookie:
      // (especially for Crunchyroll whose extractor does its own cookie handling)
      const cookieFilePath = path.join(os.tmpdir(), `orbit_cookies_${id}.txt`);
      let cookieContent = '# Netscape HTTP Cookie File\n';
      options.cookies.split(/;\s*/).forEach(pair => {
        const eq = pair.indexOf('=');
        if (eq === -1) return;
        const name = pair.substring(0, eq).trim();
        const value = pair.substring(eq + 1).trim();
        if (!name) return;
        // Derive domain from referer or default to .crunchyroll.com
        let domain = '.crunchyroll.com';
        if (refererStr) {
          try { domain = '.' + new URL(refererStr).hostname.replace(/^www\./, ''); } catch(e) {}
        }
        cookieContent += `${domain}\tTRUE\t/\tFALSE\t2147483647\t${name}\t${value}\n`;
      });
      fs.writeFileSync(cookieFilePath, cookieContent, 'utf8');
      args.cookies = cookieFilePath;
      setTimeout(() => { try { fs.unlinkSync(cookieFilePath); } catch(e) {} }, 120000);
    }
    if (refererStr) {
      // Many CDNs (Mux, etc.) enforce both Referer and Origin domain checks.
      const headers = [`Referer:${refererStr}`];
      try {
        const o = new URL(refererStr);
        headers.push(`Origin:${o.protocol}//${o.host}`);
      } catch (e) {}
      args.addHeader = headers;
    }
  }

  // Instagram reels/posts expose several renditions (and carousels = multiple
  // entries), so a plain download grabs many files. Keep a SINGLE best-quality
  // video: one entry only + best video+audio merged to mp4.
  if (/instagram\.com/i.test(url) && !options.audioOnly && !globalSettings.extractAudio) {
    args.noPlaylist = true;
    args.playlistItems = '1';
    args.format = 'bestvideo*+bestaudio/best/best';
    args.mergeOutputFormat = 'mp4';
  }

  // Ask yt-dlp to print the EXACT final path after all post-processing
  // (merge / remux / recode / extract-audio) so playback opens the real file
  // instead of a name guessed from stdout. The "after_move:" WHEN-prefix prints
  // during a real download (not a simulation); --no-simulate makes that explicit.
  if (!options.isPlaylist && !args.yesPlaylist) {
    args.print = 'after_move:ORBIT_FINAL=%(filepath)s';
    args.noSimulate = true;
  }

  youtubedl = require('youtube-dl-exec').create(getYtDlpBin());
  const subprocess = youtubedl.exec(url, args);
  if (subprocess.catch) {
    subprocess.catch(err => {
      console.log(`yt-dlp exec rejected for ${url}:`, err.message);
      mainWindow.webContents.send('download-log', { id, line: `CRASH ERROR: ${err.message}`, level: 'error' });
      if (err.stderr) {
        err.stderr.split('\n').forEach(l => {
          if (l.trim()) mainWindow.webContents.send('download-log', { id, line: `[STDERR] ${l.trim()}`, level: 'error' });
        });
      }
      if (err.stdout) {
        err.stdout.split('\n').forEach(l => {
          if (l.trim()) mainWindow.webContents.send('download-log', { id, line: `[STDOUT] ${l.trim()}`, level: 'info' });
        });
      }
    });
  }
  activeDownloads.set(id, subprocess);

  let finalFilePath = '';
  let stderrLog = [];
  let stdoutLog = [];

  subprocess.stdout.on('data', (data) => {
    const output = data.toString();
    stdoutLog.push(output.trim());
    
    // Stream log lines to frontend (hide our internal final-path marker).
    output.split('\n').filter(l => l.trim() && !l.includes('ORBIT_FINAL=')).forEach(line => {
      mainWindow.webContents.send('download-log', { id, line: line.trim(), level: 'info' });
    });

    // Canonical final path printed by yt-dlp after all post-processing.
    const finalMatch = output.match(/ORBIT_FINAL=(.+)/);
    if (finalMatch && finalMatch[1]) {
      let fp = finalMatch[1].trim().replace(/^"|"$/g, '');
      if (!path.isAbsolute(fp)) fp = path.join(downloadDir, path.basename(fp));
      finalFilePath = fp;
    }

    const destMatch = output.match(/\[download\] Destination: (.*)/) ||
                      output.match(/\[download\] (.*) has already been downloaded/) ||
                      output.match(/\[Merger\] Merging formats into "(.*)"/) ||
                      output.match(/\[ExtractAudio\] Destination: (.*)/) ||
                      output.match(/\[FixupM4a\] Fixing .* into "(.*)"/) ||
                      output.match(/\[VideoConvertor\] Converting .* to (.*)/);
    if (destMatch && destMatch[1]) {
      let fp = destMatch[1].trim().replace(/"/g, '');
      // yt-dlp sometimes outputs relative paths or just filenames for merged files
      if (!path.isAbsolute(fp)) {
        fp = path.join(downloadDir, path.basename(fp));
      }
      finalFilePath = fp;
    }

    const progressMatch = output.match(/\[download\]\s+([\d\.]+)%\s+of\s+([~]?[\d\.]+\w+)\s+at\s+([\d\.]+\w+\/s)\s+ETA\s+([\d:]+)/);
    if (progressMatch) {
      mainWindow.webContents.send('download-progress', {
        id,
        percentage: parseFloat(progressMatch[1]),
        size: progressMatch[2],
        speed: progressMatch[3],
        eta: progressMatch[4]
      });
    }
  });

  subprocess.stderr.on('data', (data) => {
    const output = data.toString();
    stderrLog.push(output.trim());
    // Stream error lines to frontend
    output.split('\n').filter(l => l.trim()).forEach(line => {
      mainWindow.webContents.send('download-log', { id, line: line.trim(), level: line.startsWith('ERROR') ? 'error' : 'warn' });
    });
  });

  subprocess.on('close', (code) => {
    activeDownloads.delete(id);
    const success = code === 0;
    if (success) {
      // Make sure the path we report to the UI is a file that exists (handles
      // extension changes from merge/remux and any parsing gaps).
      finalFilePath = resolveDownloadedFile(finalFilePath, downloadDir);
    }
    if (!success) {
      // Send full error summary
      const errorSummary = stderrLog.join('\n') || stdoutLog.slice(-5).join('\n');
      mainWindow.webContents.send('download-log', { id, line: `--- Exit code: ${code} ---`, level: 'error' });
      mainWindow.webContents.send('download-error', { id, error: errorSummary });
    }
    mainWindow.webContents.send('download-complete', { id, success, filePath: finalFilePath });
    // Desktop notification on completion (if enabled in settings).
    try {
      let gs = {};
      try { gs = JSON.parse(fs.readFileSync(path.join(ORBIT_DIR, 'settings.json'), 'utf8')); } catch (e) {}
      if (gs.notifications && success) {
        const { Notification } = require('electron');
        if (Notification.isSupported()) new Notification({ title: 'Orbit — Téléchargement terminé', body: finalFilePath ? path.basename(finalFilePath) : 'Terminé' }).show();
      }
    } catch (e) {}
  });

  subprocess.on('error', (err) => {
    activeDownloads.delete(id);
    mainWindow.webContents.send('download-log', { id, line: `SPAWN ERROR: ${err.message}`, level: 'error' });
    mainWindow.webContents.send('download-error', { id, error: err.message });
  });
});

ipcMain.on('cancel-download', (event, id) => {
  const subprocess = activeDownloads.get(id);
  if (subprocess) subprocess.kill('SIGINT');
});

ipcMain.handle('get-log-file', () => logPath);

ipcMain.on('cancel-all-downloads', () => {
  for (const [id, subprocess] of activeDownloads.entries()) {
    subprocess.kill('SIGINT');
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
});

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-video-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Vidéos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Médias', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('get-gpus', async () => {
  const modulesDir = path.join(ORBIT_DIR, 'modules');
  const rifeDir = path.join(modulesDir, 'rife');
  
  function findRifeExeLocal(dir) {
    if (!fs.existsSync(dir)) return null;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === 'rife-ncnn-vulkan.exe') return full;
        if (entry.isDirectory()) { const found = findRifeExeLocal(full); if (found) return found; }
      }
    } catch(e) {}
    return null;
  }
  
  const rifeExe = findRifeExeLocal(rifeDir);
  if (!rifeExe) return [];

  return new Promise(resolve => {
    const tmpDir = path.join(require('os').tmpdir(), 'orbit_rife_test_' + Date.now());
    try { require('fs').mkdirSync(tmpDir, { recursive: true }); } catch(e) {}

    const proc = require('child_process').spawn(rifeExe, ['-i', tmpDir, '-o', tmpDir]);
    let out = '';
    proc.stderr.on('data', d => out += d.toString());
    proc.stdout.on('data', d => out += d.toString());
    proc.on('close', () => {
      try { require('fs').rmdirSync(tmpDir); } catch(e) {}
      const gpus = [];
      const regex = /\[(\d+)\s+([^\]]+)\]/g;
      let match;
      const seen = new Set();
      while ((match = regex.exec(out)) !== null) {
        const id = match[1];
        const name = match[2].trim();
        if (!seen.has(id)) {
          seen.add(id);
          gpus.push({ id, name });
        }
      }
      resolve(gpus);
    });
  });
});

ipcMain.handle('get-video-fps', async (event, inputPath) => {
  const ffmpegLocation = path.join(ORBIT_DIR, 'ffmpeg', 'ffmpeg.exe');
  if (!require('fs').existsSync(ffmpegLocation)) return null;
  return new Promise(resolve => {
    const p = require('child_process').spawn(ffmpegLocation, ['-i', inputPath]);
    let out = '';
    p.stderr.on('data', d => out += d.toString());
    p.on('close', () => {
      const match = out.match(/(\d+(?:\.\d+)?)\s+fps/);
      if (match) return resolve(parseFloat(match[1]));
      resolve(null);
    });
  });
});

ipcMain.on('ai-interpolate', async (event, { inputPath, outputDir, engine, model, multiplier, outputFormat, codec, whenDone, gpu }) => {
  const modulesDir = path.join(ORBIT_DIR, 'modules');
  const rifeDir = path.join(modulesDir, 'rife');
  const ffmpegLocation = path.join(ORBIT_DIR, 'ffmpeg', 'ffmpeg.exe');
  if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true });

  const win = uiWin();
  const sendP = (msg) => win?.webContents.send('ai-interpolate-progress', { time: msg });
  const sendErr = (e) => win?.webContents.send('ai-interpolate-error', { error: e });

  // Recursive search for rife-ncnn-vulkan.exe
  function findRifeExe(dir) {
    if (!fs.existsSync(dir)) return null;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile() && entry.name === 'rife-ncnn-vulkan.exe') return full;
        if (entry.isDirectory()) {
          const found = findRifeExe(full);
          if (found) return found;
        }
      }
    } catch(e) {}
    return null;
  }

  let rifeExe = findRifeExe(rifeDir);

  if (!rifeExe) {
    sendP('Téléchargement du moteur RIFE-NCNN (~400MB, première utilisation — merci de patienter)...');
    try {
      const rifeZip = path.join(modulesDir, 'rife.zip');
      if (!fs.existsSync(rifeDir)) fs.mkdirSync(rifeDir, { recursive: true });

      // Fetch latest release URL from GitHub API
      let RIFE_URL = 'https://github.com/nihui/rife-ncnn-vulkan/releases/download/20221029/rife-ncnn-vulkan-20221029-windows.zip';
      try {
        sendP('Recherche de la dernière version RIFE...');
        const apiData = await new Promise((res, rej) => {
          https.get('https://api.github.com/repos/nihui/rife-ncnn-vulkan/releases/latest', { headers: { 'User-Agent': 'Orbit-App' } }, (r) => {
            let body = '';
            r.on('data', d => body += d);
            r.on('end', () => { try { res(JSON.parse(body)); } catch(e) { rej(e); } });
          }).on('error', rej);
        });
        const winAsset = apiData.assets?.find(a => a.name.includes('windows') && a.name.endsWith('.zip'));
        if (winAsset?.browser_download_url) {
          RIFE_URL = winAsset.browser_download_url;
          sendP(`Version RIFE trouvée : ${apiData.tag_name}`);
        }
      } catch(e) {
        sendP('API GitHub inaccessible, utilisation URL de secours...');
      }

      await new Promise((resolve, reject) => {
        // curl -L follows redirects, --output saves to file, -# shows progress bar
        const curlProc = spawn('curl', ['-L', '--output', rifeZip, '--progress-bar', '--retry', '3', RIFE_URL]);
        curlProc.on('error', (e) => reject(new Error('curl non disponible: ' + e.message)));
        curlProc.stderr.on('data', (d) => {
          // curl writes progress to stderr
          const s = d.toString().trim();
          if (s) sendP('Téléchargement RIFE: ' + s.replace(/\r/g, '').split('\n').pop());
        });
        curlProc.on('close', (code) => {
          if (code !== 0) return reject(new Error('curl a retourné le code ' + code));
          // Validate file size (RIFE zip should be > 5MB)
          try {
            const stat = fs.statSync(rifeZip);
            if (stat.size < 5 * 1024 * 1024) {
              fs.unlinkSync(rifeZip);
              return reject(new Error(`Fichier téléchargé trop petit (${Math.round(stat.size/1024)}KB) — réessayez`));
            }
            sendP(`Téléchargement terminé (${Math.round(stat.size / 1024 / 1024)}MB) ✓`);
            resolve(rifeZip);
          } catch(e) { reject(e); }
        });
      });

      sendP('Extraction de l\'archive RIFE...');
      const { execSync } = require('child_process');
      execSync(`powershell -Command "Expand-Archive -Path '${rifeZip}' -DestinationPath '${rifeDir}' -Force"`, { timeout: 60000 });
      try { fs.unlinkSync(rifeZip); } catch(e) {}
      rifeExe = findRifeExe(rifeDir);
    } catch(e) {
      return sendErr(`Erreur téléchargement RIFE: ${e.message}\n\nSolution manuelle :\n1. Téléchargez : https://github.com/nihui/rife-ncnn-vulkan/releases/download/20240622/rife-ncnn-vulkan-20240622-windows.zip\n2. Extrayez dans : ${path.join(ORBIT_DIR, 'modules', 'rife')}`);
    }
  }

  if (!rifeExe) {
    return sendErr('Impossible de trouver rife-ncnn-vulkan.exe après installation. Vérifiez le dossier .orbit/modules/rife/');
  }

  const jobId = 'interp_' + Date.now();
  const framesIn = path.join(modulesDir, `${jobId}_in`);
  const framesOut = path.join(modulesDir, `${jobId}_out`);
  fs.mkdirSync(framesIn, { recursive: true });
  fs.mkdirSync(framesOut, { recursive: true });

  // Normalize multiplier to a positive integer (x2 / x4 / x8 / custom).
  const mult = Math.max(2, Math.round(Number(multiplier) || 2));

  // ── Step 0: detect the SOURCE frame rate first (needed to keep speed) ───────
  // ffprobe isn't bundled, so parse it from ffmpeg's stderr. Prefer the exact
  // rational (e.g. 30000/1001) so 23.976/29.97 fps stay perfectly in sync.
  const detectFps = () => new Promise(resolve => {
    const p = spawn(ffmpegLocation, ['-i', inputPath]);
    let out = '';
    p.stderr.on('data', d => out += d.toString());
    p.on('close', () => {
      // "... , 30 fps, 30 tbr, ..."  — tbr is usually the truest rational source
      const tbr = out.match(/(\d+(?:\.\d+)?)\s+tbr/);
      const fps = out.match(/(\d+(?:\.\d+)?)\s+fps/);
      const v = parseFloat((fps && fps[1]) || (tbr && tbr[1]) || '30');
      resolve(v > 0 ? v : 30);
    });
  });

  sendP('Extraction des frames source...');
  // Force constant frame rate on extraction so frame count ↔ duration stays exact.
  const extract = spawn(ffmpegLocation, ['-y', '-i', inputPath, '-vsync', 'cfr', path.join(framesIn, 'frame%08d.png')]);
  let extractErrorLog = '';
  extract.stderr.on('data', d => extractErrorLog += d.toString());
  extract.on('error', (err) => sendErr('Erreur FFmpeg: ' + err.message));
  extract.on('close', async (code) => {
    if (code !== 0) return sendErr(`Erreur extraction frames (code ${code}): \n${extractErrorLog.slice(-500)}`);

    // ── Count the extracted frames so we can request an EXACT output count ────
    let inFrameCount = 0;
    try { inFrameCount = fs.readdirSync(framesIn).filter(f => f.toLowerCase().endsWith('.png')).length; } catch(e) {}
    if (inFrameCount < 2) return sendErr('Pas assez de frames extraites pour interpoler.');

    const originalFps = await detectFps();
    // Exact target output frame count and frame rate — this is what keeps the
    // video at its ORIGINAL speed/duration instead of slowing or speeding up.
    const targetFrameCount = inFrameCount * mult;
    const targetFps = originalFps * mult;

    sendP(`Interpolation IA x${mult} en cours (RIFE) — ${inFrameCount} → ${targetFrameCount} frames. Cela peut prendre plusieurs minutes selon votre GPU.`);

    // Find the best rife-v4 model available (required for arbitrary multipliers)
    const rifeExeDir = path.dirname(rifeExe);
    let modelPath = null;
    const preferredModels = ['rife-v4.6', 'rife-v4.5', 'rife-v4.4', 'rife-v4.3', 'rife-v4.2', 'rife-v4.1', 'rife-v4.0', 'rife-v4'];
    for (const modelName of preferredModels) {
      const candidate = path.join(rifeExeDir, modelName);
      if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'flownet.param'))) {
        modelPath = candidate;
        sendP(`Modèle utilisé : ${modelName}`);
        break;
      }
    }
    if (!modelPath) {
      sendP('Aucun modèle rife-v4 trouvé, utilisation du modèle par défaut...');
    }

    // CRITICAL: use -n (target frame count), NOT -s. In directory mode -s is the
    // time-step and is ignored for multipliers >2, which made x4/x8 play too fast.
    const rifeArgs = ['-i', framesIn, '-o', framesOut, '-n', String(targetFrameCount)];
    if (modelPath) rifeArgs.push('-m', modelPath);
    if (gpu !== undefined && gpu !== 'auto') rifeArgs.push('-g', String(gpu));

    const rifeProc = spawn(rifeExe, rifeArgs, { cwd: rifeExeDir });
    activeDownloads.set(jobId, { kill: () => rifeProc.kill('SIGINT') });
    rifeProc.on('error', (err) => sendErr('Erreur lancement RIFE: ' + err.message));
    rifeProc.stdout.on('data', d => { const s = d.toString().trim(); if (s) sendP(s); });
    rifeProc.stderr.on('data', d => { const s = d.toString().trim(); if (s) sendP(s); });
    rifeProc.on('close', async (rc) => {
      if (rc !== 0) return sendErr('Erreur interpolation RIFE (code ' + rc + ').');

      const ext = (outputFormat || 'mp4').toLowerCase();
      const baseName = path.basename(inputPath, path.extname(inputPath));

      // Detect what RIFE actually named its output frames (00000000 or 00000001).
      let outFiles = [];
      try { outFiles = fs.readdirSync(framesOut).filter(f => f.toLowerCase().endsWith('.png')).sort(); } catch(e) {}
      if (!outFiles.length) return sendErr('RIFE n\'a produit aucune frame.');
      const startNum = parseInt(outFiles[0], 10);

      const fpsStr = Number.isFinite(targetFps) ? targetFps.toFixed(3).replace(/\.?0+$/, '') : '60';
      const finalOut = path.join(outputDir, `${baseName}_x${mult}_${Math.round(targetFps)}fps.${ext}`);
      sendP('Recomposition de la vidéo finale...');
      const codecMap = { 'h264': 'libx264', 'h265 (hevc)': 'libx265', 'vp9': 'libvpx-vp9', 'av1': 'libaom-av1' };
      const vcodec = codecMap[(codec || 'h264').toLowerCase()] || 'libx264';
      const reenc = spawn(ffmpegLocation, [
        '-y',
        '-framerate', fpsStr,
        '-start_number', String(startNum),
        '-i', path.join(framesOut, '%08d.png'),
        '-i', inputPath,
        '-map', '0:v:0', '-map', '1:a?',
        '-c:v', vcodec, '-pix_fmt', 'yuv420p', '-crf', '18',
        '-r', fpsStr,            // force output CFR so players read the right speed
        '-c:a', 'copy',
        finalOut
      ]);
      let reencErrorLog = '';
      reenc.stderr.on('data', d => { reencErrorLog += d.toString(); });
      reenc.on('error', (err) => sendErr('Erreur recomposition: ' + err.message));
      reenc.on('close', (rc2) => {
        try { fs.rmSync(framesIn, { recursive: true }); } catch(e) {}
        try { fs.rmSync(framesOut, { recursive: true }); } catch(e) {}
        activeDownloads.delete(jobId);
        if (rc2 === 0) {
          sendP(`✅ Vidéo interpolée sauvegardée : ${path.basename(finalOut)} (${Math.round(targetFps)} fps, vitesse normale)`);
          win?.webContents.send('ai-interpolate-complete', { filePath: finalOut });
          if (whenDone === 'Open Output Folder') shell.openPath(outputDir);
        } else {
          sendErr(`Erreur recomposition vidéo finale (code ${rc2}): \n${reencErrorLog.slice(-500)}`);
        }
      });
    });
  });
});


// Helper: get video duration in seconds via ffprobe
function getVideoDuration(ffmpegPath, inputPath) {
  return new Promise((resolve) => {
    const ffprobe = ffmpegPath.replace('ffmpeg.exe', 'ffprobe.exe');
    // Fallback: use ffmpeg itself to get duration
    const proc = spawn(ffmpegPath, ['-i', inputPath, '-f', 'null', '-']);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (match) {
        const duration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
        resolve(duration);
      } else {
        resolve(null);
      }
    });
  });
}

// Safety net: yt-dlp's reported path can be wrong/stale (merge/remux changes the
// extension, etc.). Make sure we hand back a file that actually exists on disk.
const MEDIA_EXT_RE = /\.(mp4|mkv|webm|mov|avi|m4v|flv|ts|m4a|mp3|flac|wav|ogg|opus|aac|alac|wma)$/i;
function resolveDownloadedFile(fp, dir) {
  try {
    if (fp && fs.existsSync(fp)) return fp;
    // Same base name, different extension (merge/remux/recode).
    if (fp && dir && fs.existsSync(dir)) {
      const base = path.basename(fp, path.extname(fp));
      const sameBase = fs.readdirSync(dir)
        .filter(f => f.startsWith(base) && MEDIA_EXT_RE.test(f) && !f.endsWith('.part'))
        .map(f => path.join(dir, f));
      if (sameBase.length) return sameBase.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    }
    // Last resort: newest media file written in the last 10 minutes.
    if (dir && fs.existsSync(dir)) {
      const now = Date.now();
      const recent = fs.readdirSync(dir)
        .map(f => path.join(dir, f))
        .filter(f => { try { const s = fs.statSync(f); return s.isFile() && MEDIA_EXT_RE.test(f) && !f.endsWith('.part') && (now - s.mtimeMs) < 600000; } catch (e) { return false; } });
      if (recent.length) return recent.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    }
  } catch (e) {}
  return fp;
}

// ── On-the-fly playback preparation ─────────────────────────────────────────
// The HTML5 <video> element can't decode every container/codec (MKV, H.265…).
// When in-app playback fails, we remux/transcode the file to a browser-friendly
// MP4 with the bundled ffmpeg so the user can read ANY file inside Orbit.
const PLAYBACK_CACHE_DIR = path.join(os.tmpdir(), 'orbit-playback');

// Probe video/audio codec by parsing ffmpeg's stderr (ffprobe isn't bundled).
function probeCodecs(ffmpegBin, inputPath) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegBin, ['-hide_banner', '-i', inputPath]);
    let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', () => resolve({ vcodec: null, acodec: null, duration: null }));
    p.on('close', () => {
      const v = stderr.match(/Stream #\d+:\d+.*?:\s*Video:\s*([a-z0-9_]+)/i);
      const a = stderr.match(/Stream #\d+:\d+.*?:\s*Audio:\s*([a-z0-9_]+)/i);
      const dm = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve({
        vcodec: v ? v[1].toLowerCase() : null,
        acodec: a ? a[1].toLowerCase() : null,
        duration: dm ? (parseInt(dm[1]) * 3600 + parseInt(dm[2]) * 60 + parseFloat(dm[3])) : null
      });
    });
  });
}

ipcMain.handle('prepare-playback', async (event, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'not-found' };
    const ffmpegBin = getFfmpegBin();
    if (!ffmpegBin || !fs.existsSync(ffmpegBin)) return { ok: false, error: 'no-ffmpeg' };

    // Cache by source path + size + mtime so re-playing is instant.
    const st = fs.statSync(filePath);
    const key = require('crypto').createHash('md5')
      .update(filePath + '|' + st.size + '|' + st.mtimeMs).digest('hex');
    if (!fs.existsSync(PLAYBACK_CACHE_DIR)) fs.mkdirSync(PLAYBACK_CACHE_DIR, { recursive: true });
    const outPath = path.join(PLAYBACK_CACHE_DIR, key + '.mp4');
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
      return { ok: true, path: outPath, cached: true };
    }

    const { vcodec, acodec, duration } = await probeCodecs(ffmpegBin, filePath);
    // Copy the stream when it's already browser-compatible (near-instant remux),
    // otherwise re-encode just that stream.
    const vArgs = (vcodec === 'h264')
      ? ['-c:v', 'copy']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p'];
    const aArgs = (acodec === 'aac' || acodec === 'mp3')
      ? ['-c:a', 'copy']
      : (acodec ? ['-c:a', 'aac', '-b:a', '192k'] : ['-an']);

    const args = ['-y', '-hide_banner', '-i', filePath, ...vArgs, ...aArgs,
      '-movflags', '+faststart', outPath];

    return await new Promise((resolve) => {
      const proc = spawn(ffmpegBin, args);
      let stderr = '';
      proc.stderr.on('data', (d) => {
        const s = d.toString();
        stderr += s;
        if (duration) {
          const m = s.match(/time=(\d+):(\d+):([\d.]+)/);
          if (m) {
            const cur = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
            const percent = Math.min(99, Math.round((cur / duration) * 100));
            try { event.sender.send('playback-progress', { percent }); } catch (e) {}
          }
        }
      });
      proc.on('error', () => resolve({ ok: false, error: 'spawn-failed' }));
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
          resolve({ ok: true, path: outPath });
        } else {
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) {}
          resolve({ ok: false, error: 'ffmpeg-failed', detail: stderr.slice(-400) });
        }
      });
    });
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Helper: download AI module
function downloadModule(url, destPath, progressId) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.tmp';
    const file = fs.createWriteStream(tmpPath);
    const handleResponse = (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, handleResponse).on('error', reject);
        return;
      }
      const total = parseInt(response.headers['content-length'] || '0');
      let downloaded = 0;
      response.on('data', chunk => {
        downloaded += chunk.length;
        if (total > 0) {
          const pct = Math.round(downloaded / total * 100);
          uiWin()?.webContents.send('convert-progress', { id: progressId, time: `Téléchargement module IA: ${pct}%` });
        }
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(tmpPath, destPath);
          resolve(destPath);
        });
      });
    };
    https.get(url, handleResponse).on('error', reject);
  });
}

// ─── Transcription (Whisper → SRT → every editor format) ─────────────────────
const WHISPER_MODELS = {
  base:   { file: 'ggml-base.bin',     url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',     size: '~142 Mo', minBytes: 130000000 },
  small:  { file: 'ggml-small.bin',    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',    size: '~466 Mo', minBytes: 450000000 },
  medium: { file: 'ggml-medium.bin',   url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',   size: '~1.5 Go', minBytes: 1400000000 },
  large:  { file: 'ggml-large-v3.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin', size: '~2.9 Go', minBytes: 2800000000 },
};

ipcMain.handle('select-media-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Médias', extensions: ['mp4','mkv','avi','mov','webm','flv','wmv','mp3','wav','flac','aac','ogg','m4a'] }]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.on('transcribe', async (event, { id, inputPath, language, model, outputDir, formats, style, burnIn }) => {
  const win = uiWin();
  const sendP = (msg) => win?.webContents.send('transcribe-progress', { id, message: msg });
  const sendErr = (e) => win?.webContents.send('transcribe-error', { id, error: e });
  const sendDone = (files) => win?.webContents.send('transcribe-complete', { id, files });

  try {
    let ffmpegLocation = path.join(ORBIT_DIR, 'ffmpeg', 'ffmpeg.exe');
    if (!fs.existsSync(ffmpegLocation)) ffmpegLocation = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');

    const modulesDir = path.join(ORBIT_DIR, 'modules');
    const whisperDir = path.join(modulesDir, 'whisper');
    if (!fs.existsSync(whisperDir)) fs.mkdirSync(whisperDir, { recursive: true });

    // Locate (or fetch) the whisper CLI executable. Recent whisper.cpp renamed
    // `main.exe` → `whisper-cli.exe`; the old `main.exe` is now a deprecated stub
    // that exits with code 1 without transcribing. Always PREFER whisper-cli.exe.
    const findWhisperExe = (dir) => {
      const priority = ['whisper-cli.exe', 'whisper.exe', 'whisper-cpp.exe', 'main.exe'];
      const matches = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (priority.includes(e.name.toLowerCase())) matches.push(full);
        }
      };
      try { walk(dir); } catch (e) { return null; }
      matches.sort((a, b) => priority.indexOf(path.basename(a).toLowerCase()) - priority.indexOf(path.basename(b).toLowerCase()));
      return matches[0] || null;
    };

    let whisperExe = findWhisperExe(whisperDir);

    // Validate: the installed CLI must be whisper.cpp (ggerganov), which supports -osrt.
    // Const-me's cli.zip ships a DirectML binary with different flags — it silently
    // ignores -osrt and exits with code 3. Detect this by checking the help text.
    if (whisperExe) {
      const isCompatible = await new Promise(resolve => {
        try {
          const probe = spawn(whisperExe, [], { cwd: path.dirname(whisperExe) });
          let out = '';
          probe.stdout.on('data', d => out += d.toString());
          probe.stderr.on('data', d => out += d.toString());
          probe.on('close', () => resolve(out.includes('osrt')));
          probe.on('error', () => resolve(false));
          setTimeout(() => { try { probe.kill(); } catch(e){} resolve(false); }, 4000);
        } catch(e) { resolve(false); }
      });
      if (!isCompatible) {
        sendP('Moteur Whisper incompatible détecté — mise à jour automatique…');
        // Remove old CLI files but keep .bin model files.
        try {
          for (const entry of fs.readdirSync(whisperDir, { withFileTypes: true })) {
            if (entry.name.endsWith('.bin')) continue;
            const fp = path.join(whisperDir, entry.name);
            try { fs.rmSync(fp, { recursive: true, force: true }); } catch(e) {}
          }
        } catch(e) {}
        whisperExe = null;
      }
    }

    if (!whisperExe) {
      sendP('Téléchargement du moteur Whisper (whisper.cpp officiel)…');
      // whisper.cpp (ggerganov) releases Windows binaries compatible with -osrt and ggml models.
      const candidates = [
        'https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-blas-bin-x64.zip',
        'https://github.com/ggerganov/whisper.cpp/releases/latest/download/whisper-bin-x64.zip',
        'https://github.com/Const-me/Whisper/releases/latest/download/cli.zip',
        'https://github.com/Const-me/Whisper/releases/latest/download/Cli.zip',
      ];
      const { execSync } = require('child_process');
      for (const url of candidates) {
        try {
          const zip = path.join(whisperDir, 'whisper-cli.zip');
          await downloadModule(url, zip, id);
          if (!fs.existsSync(zip) || fs.statSync(zip).size < 100000) { try { fs.unlinkSync(zip); } catch (e) {} continue; }
          execSync(`powershell -Command "Expand-Archive -Path '${zip}' -DestinationPath '${whisperDir}' -Force"`, { timeout: 120000 });
          try { fs.unlinkSync(zip); } catch (e) {}
          whisperExe = findWhisperExe(whisperDir);
          if (whisperExe) break;
        } catch (e) { /* try next candidate */ }
      }
    }
    if (!whisperExe) return sendErr('Impossible d\'installer la CLI Whisper. Téléchargez « whisper-blas-bin-x64.zip » depuis github.com/ggerganov/whisper.cpp/releases et extrayez-le dans : ' + whisperDir);

    // Ensure the chosen model is present AND complete. A partial/corrupt model
    // is the #1 cause of whisper exit code 3 ("failed to load model"), and an
    // earlier incomplete download to the same path would otherwise be reused.
    const modelInfo = WHISPER_MODELS[model] || WHISPER_MODELS.base;
    const modelPath = path.join(whisperDir, modelInfo.file);
    const modelValid = () => {
      try { return fs.existsSync(modelPath) && fs.statSync(modelPath).size >= modelInfo.minBytes; }
      catch (e) { return false; }
    };
    if (!modelValid()) {
      if (fs.existsSync(modelPath)) {
        sendP('Modèle incomplet détecté — re-téléchargement…');
        try { fs.unlinkSync(modelPath); } catch (e) {}
      }
      sendP(`Téléchargement du modèle IA « ${model} » (${modelInfo.size})…`);
      try { await downloadModule(modelInfo.url, modelPath, id); }
      catch (e) { return sendErr('Erreur téléchargement modèle : ' + e.message); }
      if (!modelValid()) {
        try { fs.unlinkSync(modelPath); } catch (e) {}
        return sendErr('Le modèle téléchargé est incomplet. Vérifie ta connexion et réessaie.');
      }
    }

    // Extract audio → 16 kHz mono WAV (what whisper expects).
    sendP('Extraction de l\'audio…');
    const tmpWav = path.join(modulesDir, `${id}_audio.wav`);
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpegLocation, ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tmpWav]);
      let err = '';
      p.stderr.on('data', d => err += d.toString());
      p.on('close', c => c === 0 ? resolve() : reject(new Error(err.slice(-300))));
      p.on('error', reject);
    });

    // Run Whisper → SRT.
    sendP('Transcription en cours (IA Whisper)… cela peut prendre quelques minutes.');
    const wArgs = ['-m', modelPath, '-f', tmpWav, '-osrt'];
    if (language && language !== 'auto') wArgs.push('-l', language);
    // No -l flag = auto-detect (whisper.cpp default)
    let whisperLog = '';
    await new Promise((resolve, reject) => {
      const wp = spawn(whisperExe, wArgs, { cwd: path.dirname(whisperExe) });
      activeDownloads.set(id, { kill: () => { try { wp.kill('SIGINT'); } catch (e) {} } });
      wp.stdout.on('data', d => { const s = d.toString(); whisperLog += s; const t = s.trim(); if (t) sendP('Whisper : ' + t.slice(-80)); });
      wp.stderr.on('data', d => { const s = d.toString(); whisperLog += s; const t = s.trim(); if (t) sendP('Whisper : ' + t.slice(-80)); });
      wp.on('close', c => {
        if (c === 0) return resolve();
        const tail = whisperLog.trim().slice(-300);
        let hint = '';
        if (c === 3) hint = ' — échec du chargement du modèle (modèle corrompu/incompatible).';
        reject(new Error(`code ${c}${hint}${tail ? '\n' + tail : ''}`));
      });
      wp.on('error', reject);
    });

    // Whisper writes <wav>.srt (Const-me) or <wav-without-ext>.srt — find it.
    const srtCandidates = [tmpWav + '.srt', tmpWav.replace(/\.wav$/i, '.srt')];
    const srtPath = srtCandidates.find(p => fs.existsSync(p));
    if (!srtPath) { try { fs.unlinkSync(tmpWav); } catch (e) {} return sendErr('Whisper n\'a pas généré de transcription.'); }

    const srtRaw = fs.readFileSync(srtPath, 'utf8');
    const { parseSrt, GENERATORS } = require('./transcription.js');
    const cues = parseSrt(srtRaw);
    if (!cues.length) { return sendErr('Transcription vide — audio inaudible ou langue non détectée.'); }

    sendP(`Génération des fichiers (${cues.length} segments)…`);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outDir = outputDir || path.dirname(inputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    // Detect source resolution/fps for FCPXML & AE comp sizing (best effort).
    const opts = { style: style || {}, width: 1920, height: 1080, fps: 30 };

    const written = [];
    const wanted = Array.isArray(formats) && formats.length ? formats : ['srt'];
    for (const key of wanted) {
      const gen = GENERATORS[key];
      if (!gen) continue;
      const outFile = path.join(outDir, `${baseName}.${gen.ext}`);
      try {
        fs.writeFileSync(outFile, gen.build(cues, opts), 'utf8');
        written.push({ format: key, ext: gen.ext, path: outFile });
      } catch (e) { sendP(`⚠ Échec ${key} : ${e.message}`); }
    }

    // Optionally burn subtitles into the video.
    if (burnIn) {
      sendP('Incrustation des sous-titres dans la vidéo…');
      const burnOut = path.join(outDir, `${baseName}_sous-titres.mp4`);
      // ffmpeg subtitles filter needs an escaped path on Windows.
      const srtForFilter = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      const force = `FontSize=${(style && style.fontSize) || 24},PrimaryColour=&H00FFFFFF,Outline=2`;
      await new Promise((resolve) => {
        const p = spawn(ffmpegLocation, [
          '-y', '-i', inputPath,
          '-vf', `subtitles='${srtForFilter}':force_style='${force}'`,
          '-c:a', 'copy', burnOut
        ]);
        let err = '';
        p.stderr.on('data', d => err += d.toString());
        p.on('close', c => { if (c === 0) written.push({ format: 'burned', ext: 'mp4', path: burnOut }); else sendP('⚠ Incrustation échouée : ' + err.slice(-200)); resolve(); });
        p.on('error', () => resolve());
      });
    }

    // Cleanup temp files.
    try { fs.unlinkSync(tmpWav); } catch (e) {}
    try { fs.unlinkSync(srtPath); } catch (e) {}
    activeDownloads.delete(id);

    if (!written.length) return sendErr('Aucun fichier généré.');
    sendP(`✅ ${written.length} fichier(s) généré(s).`);
    sendDone(written);
  } catch (e) {
    sendErr(e.message || String(e));
  }
});

ipcMain.on('convert-file', async (event, { id, inputPath, outputPath, targetFormat, metadata }) => {
  let ffmpegLocation = path.join(ORBIT_DIR, 'ffmpeg', 'ffmpeg.exe');
  if (!fs.existsSync(ffmpegLocation)) ffmpegLocation = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
  const modulesDir = path.join(ORBIT_DIR, 'modules');
  if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true });

  const sendProgress = (msg) => uiWin()?.webContents.send('convert-progress', { id, time: msg });
  const sendComplete = (filePath) => uiWin()?.webContents.send('convert-complete', { id, filePath });
  const sendError = (err) => uiWin()?.webContents.send('convert-error', { id, error: err });

  // ---- SMART COMPRESSOR ----
  if (targetFormat === 'COMPRESS_DISCORD' || targetFormat === 'COMPRESS_WHATSAPP') {
    const targetMB = targetFormat === 'COMPRESS_DISCORD' ? 24.5 : 15.5;
    const targetBytes = targetMB * 1024 * 1024;
    sendProgress('Analyse de la vidéo...');
    const duration = await getVideoDuration(ffmpegLocation, inputPath);
    if (!duration) return sendError('Impossible de lire la durée de la vidéo.');
    const audioBitrate = 96; // kbps
    const totalBitrateKbps = Math.floor((targetBytes * 8) / duration / 1000);
    const videoBitrate = Math.max(totalBitrateKbps - audioBitrate, 100);
    sendProgress(`Compression vers ${targetMB}MB (${videoBitrate}kbps)...`);
    const compressedOutput = outputPath.replace(/\.[^.]+$/, '_compressed.mp4');
    const args = ['-y', '-i', inputPath, '-c:v', 'libx264', '-b:v', `${videoBitrate}k`, '-pass', '1', '-an', '-f', 'null', '-'];
    const pass1 = spawn(ffmpegLocation, args);
    pass1.on('close', () => {
      const pass2args = ['-y', '-i', inputPath, '-c:v', 'libx264', '-b:v', `${videoBitrate}k`, '-pass', '2', '-c:a', 'aac', '-b:a', `${audioBitrate}k`, compressedOutput];
      const pass2 = spawn(ffmpegLocation, pass2args);
      activeDownloads.set(id, { kill: () => pass2.kill('SIGINT') });
      pass2.stderr.on('data', d => {
        const m = d.toString().match(/time=(\d{2}:\d{2}:\d{2})/);
        if (m) sendProgress(`Compression: ${m[1]}`);
      });
      pass2.on('close', (code) => {
        // cleanup passlog files
        ['ffmpeg2pass-0.log', 'ffmpeg2pass-0.log.mbtree'].forEach(f => { try { fs.unlinkSync(f); } catch(e){} });
        if (code === 0) sendComplete(compressedOutput);
        else sendError('Erreur lors de la compression 2-pass.');
      });
    });
    return;
  }

  // ---- AI WHISPER SUBTITLES ----
  if (targetFormat === 'AI_WHISPER') {
    const whisperDir = path.join(modulesDir, 'whisper');
    const whisperExe = path.join(whisperDir, 'whisper.exe');
    const modelPath = path.join(whisperDir, 'ggml-base.bin');
    if (!fs.existsSync(whisperDir)) fs.mkdirSync(whisperDir, { recursive: true });

    if (!fs.existsSync(whisperExe)) {
      sendProgress('Téléchargement du moteur Whisper...');
      try {
        await downloadModule('https://github.com/Const-me/Whisper/releases/latest/download/WhisperDesktop.zip', path.join(whisperDir, 'whisper.zip'), id);
        const { execSync } = require('child_process');
        execSync(`powershell -Command "Expand-Archive -Path '${path.join(whisperDir, 'whisper.zip')}' -DestinationPath '${whisperDir}' -Force"`);
        fs.unlinkSync(path.join(whisperDir, 'whisper.zip'));
      } catch(e) {
        return sendError('Erreur téléchargement Whisper: ' + e.message);
      }
    }
    if (!fs.existsSync(modelPath)) {
      sendProgress('Téléchargement du modèle IA (base ~142MB)...');
      try {
        await downloadModule('https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin', modelPath, id);
      } catch(e) {
        return sendError('Erreur téléchargement modèle Whisper: ' + e.message);
      }
    }

    // Extract audio first
    sendProgress('Extraction de l\'audio pour transcription...');
    const tmpAudio = path.join(modulesDir, `${id}_audio.wav`);
    const extractArgs = ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tmpAudio];
    const extractProc = spawn(ffmpegLocation, extractArgs);
    extractProc.on('close', (code) => {
      if (code !== 0) return sendError('Erreur extraction audio.');
      sendProgress('Transcription en cours (IA Whisper)...');
      // whisper.cpp CLI
      const wProc = spawn(whisperExe, ['--model', modelPath, '--language', 'auto', '--output-srt', '--file', tmpAudio]);
      activeDownloads.set(id, { kill: () => wProc.kill('SIGINT') });
      wProc.stdout.on('data', d => sendProgress('Whisper: ' + d.toString().substring(0, 60)));
      wProc.on('close', (wCode) => {
        try { fs.unlinkSync(tmpAudio); } catch(e) {}
        const srtPath = tmpAudio + '.srt';
        const finalSrt = outputPath.replace(/\.[^.]+$/, '.srt');
        if (wCode === 0 && fs.existsSync(srtPath)) {
          fs.renameSync(srtPath, finalSrt);
          sendComplete(finalSrt);
        } else {
          sendError('Whisper n\'a pas pu générer les sous-titres.');
        }
      });
    });
    return;
  }

  // ---- AI VOCAL REMOVER (Spleeter via Python) ----
  if (targetFormat === 'AI_VOCAL_REMOVER') {
    const pythonDir = path.join(modulesDir, 'python');
    const pythonExe = path.join(pythonDir, 'python.exe');
    
    if (!fs.existsSync(pythonExe)) {
      sendProgress('Téléchargement de Python portable (nécessaire pour Spleeter)...');
      try {
        const pythonZip = path.join(modulesDir, 'python.zip');
        await downloadModule('https://www.python.org/ftp/python/3.11.9/python-3.11.9-embed-amd64.zip', pythonZip, id);
        const { execSync } = require('child_process');
        if (!fs.existsSync(pythonDir)) fs.mkdirSync(pythonDir, { recursive: true });
        execSync(`powershell -Command "Expand-Archive -Path '${pythonZip}' -DestinationPath '${pythonDir}' -Force"`);
        fs.unlinkSync(pythonZip);
        // Install spleeter
        sendProgress('Installation de Spleeter IA (première utilisation, 2-3 minutes)...');
        execSync(`"${pythonExe}" -m pip install spleeter 2>&1`, { timeout: 300000 });
      } catch(e) {
        return sendError('Erreur installation Spleeter: ' + e.message);
      }
    }

    sendProgress('Séparation vocale en cours (IA Spleeter)...');
    const outputFolder = path.dirname(outputPath);
    const spleeterProc = spawn(pythonExe, ['-m', 'spleeter', 'separate', '-o', outputFolder, '-p', 'spleeter:2stems', inputPath]);
    activeDownloads.set(id, { kill: () => spleeterProc.kill('SIGINT') });
    spleeterProc.stdout.on('data', d => sendProgress('Spleeter: ' + d.toString().substring(0, 60)));
    spleeterProc.stderr.on('data', d => sendProgress('Spleeter: ' + d.toString().substring(0, 60)));
    spleeterProc.on('close', (code) => {
      if (code === 0) {
        sendProgress('Séparation terminée !');
        sendComplete(outputFolder);
      } else {
        sendError('Erreur lors de la séparation vocale.');
      }
    });
    return;
  }

  // ---- AI UPSCALER 60FPS (RIFE-NCNN) ----
  if (targetFormat === 'AI_UPSCALER') {
    const rifeDir = path.join(modulesDir, 'rife');
    const rifeExe = path.join(rifeDir, 'rife-ncnn-vulkan.exe');

    if (!fs.existsSync(rifeExe)) {
      sendProgress('Téléchargement du moteur RIFE (interpolation IA 60FPS)...');
      try {
        const rifeZip = path.join(modulesDir, 'rife.zip');
        await downloadModule('https://github.com/nihui/rife-ncnn-vulkan/releases/latest/download/rife-ncnn-vulkan-windows.zip', rifeZip, id);
        const { execSync } = require('child_process');
        if (!fs.existsSync(rifeDir)) fs.mkdirSync(rifeDir, { recursive: true });
        execSync(`powershell -Command "Expand-Archive -Path '${rifeZip}' -DestinationPath '${rifeDir}' -Force"`);
        fs.unlinkSync(rifeZip);
      } catch(e) {
        return sendError('Erreur téléchargement RIFE: ' + e.message);
      }
    }

    sendProgress('Extraction des frames (IA Upscaler)...');
    const framesDir = path.join(modulesDir, `${id}_frames`);
    const outputFramesDir = path.join(modulesDir, `${id}_frames_out`);
    if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });
    if (!fs.existsSync(outputFramesDir)) fs.mkdirSync(outputFramesDir, { recursive: true });

    // Step 1: Extract frames
    const extractFrames = spawn(ffmpegLocation, ['-y', '-i', inputPath, path.join(framesDir, 'frame%08d.png')]);
    extractFrames.on('close', (code) => {
      if (code !== 0) return sendError('Erreur extraction des frames.');
      sendProgress('Interpolation IA 60FPS en cours (RIFE)...');
      // Step 2: Run RIFE
      const rifeProc = spawn(rifeExe, ['-i', framesDir, '-o', outputFramesDir]);
      activeDownloads.set(id, { kill: () => rifeProc.kill('SIGINT') });
      rifeProc.stdout.on('data', d => sendProgress('RIFE: ' + d.toString().substring(0, 60)));
      rifeProc.on('close', (rifeCode) => {
        if (rifeCode !== 0) return sendError('Erreur RIFE interpolation.');
        sendProgress('Recomposition de la vidéo 60FPS...');
        // Step 3: Re-encode with original audio
        const upscaledOutput = outputPath.replace(/\.[^.]+$/, '_60fps.mp4');
        const reencodeProc = spawn(ffmpegLocation, ['-y', '-framerate', '60', '-i', path.join(outputFramesDir, 'frame%08d.png'), '-i', inputPath, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'copy', upscaledOutput]);
        reencodeProc.on('close', (reCode) => {
          // Cleanup temp frames
          try { fs.rmSync(framesDir, { recursive: true }); } catch(e) {}
          try { fs.rmSync(outputFramesDir, { recursive: true }); } catch(e) {}
          if (reCode === 0) sendComplete(upscaledOutput);
          else sendError('Erreur recomposition vidéo 60FPS.');
        });
      });
    });
    return;
  }

  // ---- STANDARD CONVERT ----
  let args = ['-y', '-i', inputPath];
  
  if (metadata?.coverArtPath) {
    args.push('-i', metadata.coverArtPath, '-map', '0:a', '-map', '1', '-c', 'copy', '-id3v2_version', '3', '-metadata:s:v', 'title=Album cover');
  }
  
  if (metadata?.title) args.push('-metadata', `title=${metadata.title}`);
  if (metadata?.artist) args.push('-metadata', `artist=${metadata.artist}`);
  if (metadata?.album) args.push('-metadata', `album=${metadata.album}`);
  if (metadata?.year) args.push('-metadata', `date=${metadata.year}`);
  
  if (targetFormat === 'MP3') {
     if (!metadata?.coverArtPath) args.push('-vn');
     args.push('-ar', '44100', '-ac', '2', '-b:a', '192k');
  } else if (targetFormat === 'MP4') {
     args.push('-c:v', 'libx264', '-c:a', 'aac');
  } else if (targetFormat === 'WAV') {
     args.push('-c:a', 'pcm_s16le');
  } else if (targetFormat === 'FLAC') {
     args.push('-c:a', 'flac');
  }
  
  args.push(outputPath);

  const ffmpegProcess = spawn(ffmpegLocation, args);
  activeDownloads.set(id, { kill: () => ffmpegProcess.kill('SIGINT') });
  
  ffmpegProcess.on('error', (err) => {
    activeDownloads.delete(id);
    uiWin()?.webContents.send('convert-error', { id, error: `Erreur FFmpeg: ${err.message}` });
  });

  ffmpegProcess.stderr.on('data', (data) => {
    const output = data.toString();
    const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}.\d{2})/);
    if (timeMatch) {
       uiWin()?.webContents.send('convert-progress', { id, time: timeMatch[1] });
    }
  });

  ffmpegProcess.on('close', (code) => {
    activeDownloads.delete(id);
    if (code === 0) {
      uiWin()?.webContents.send('convert-complete', { id, filePath: outputPath });
    } else {
      uiWin()?.webContents.send('convert-error', { id, error: `FFmpeg exited with code ${code}` });
    }
  });
});

// --- SUBSCRIPTIONS SYSTEM ---
const subsFile = path.join(ORBIT_DIR, 'subscriptions.json');

function getSubscriptions() {
  if (!fs.existsSync(subsFile)) return [];
  try {
    return JSON.parse(fs.readFileSync(subsFile, 'utf8'));
  } catch(e) { return []; }
}

function saveSubscriptions(subs) {
  fs.writeFileSync(subsFile, JSON.stringify(subs, null, 2));
}

ipcMain.handle('get-subscriptions', () => getSubscriptions());

ipcMain.handle('add-subscription', async (event, url) => {
  try {
    // To be fast, we use yt-dlp to just get the title
    const info = await youtubedl(url, { dumpSingleJson: true, playlistEnd: 1, flatPlaylist: true });
    const title = info.uploader || info.channel || info.title || url;
    const subs = getSubscriptions();
    if (!subs.find(s => s.url === url)) {
      subs.push({ id: Date.now().toString(), url, title, dateAdded: new Date().toISOString() });
      saveSubscriptions(subs);
    }
    return subs;
  } catch(e) {
    console.error(e);
    throw new Error("Impossible de récupérer la chaîne. Vérifiez l'URL.");
  }
});

ipcMain.handle('delete-subscription', (event, id) => {
  const subs = getSubscriptions().filter(s => s.id !== id);
  saveSubscriptions(subs);
  return subs;
});

function checkSubscriptions() {
  const subs = getSubscriptions();
  if (subs.length === 0) return;
  
  const archivePath = path.join(ORBIT_DIR, 'orbit_archive.txt');
  const subOutDir = path.join(app.getPath('downloads'), 'Orbit_Abonnements');
  if (!fs.existsSync(subOutDir)) fs.mkdirSync(subOutDir, { recursive: true });

  const template = path.join(subOutDir, '%(uploader)s', '%(title)s.%(ext)s');

  subs.forEach(sub => {
    // Fix: use youtubedl(url, options) signature, not youtubedl.exec(array)
    const ytdlpBin = getYtDlpBin();
    const args = [
      '--download-archive', archivePath,
      '--playlist-end', '5',
      '-o', template,
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '--merge-output-format', 'mp4',
      '--no-warnings'
    ];
    const child = spawn(ytdlpBin, [sub.url, ...args], { detached: false, windowsHide: true });
    child.on('error', (e) => console.error('Auto-dl spawn error for', sub.url, e.message));
    child.on('close', (code) => {
      if (code && code !== 0) console.error('Auto-dl exit code', code, 'for', sub.url);
      else console.log('Auto-dl done for', sub.url);
    });
  });
}

// Check every 6 hours
setInterval(checkSubscriptions, 6 * 60 * 60 * 1000);
// Check 10 seconds after launch
setTimeout(checkSubscriptions, 10000);

ipcMain.handle('check-subscriptions-now', () => {
  checkSubscriptions();
  return true;
});

// ─── Topaz Video AI bridge ───────────────────────────────────────────────────
// Drives a locally-installed, licensed Topaz Video engine through Orbit's UI.
const topaz = require('./topaz.js');
const TOPAZ_DIR = path.join(ORBIT_DIR, 'topaz');

function ensureTopazDir() { try { if (!fs.existsSync(TOPAZ_DIR)) fs.mkdirSync(TOPAZ_DIR, { recursive: true }); } catch (e) {} }
function topazReadJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function topazWriteJson(file, data) { ensureTopazDir(); try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; } }

// CPU utilisation sampled between polls.
let _topazLastCpu = null;
function topazCpuPercent() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const c of cpus) { for (const k in c.times) total += c.times[k]; idle += c.times.idle; }
  const cur = { idle, total };
  if (!_topazLastCpu) { _topazLastCpu = cur; return 0; }
  const idleD = cur.idle - _topazLastCpu.idle;
  const totalD = cur.total - _topazLastCpu.total;
  _topazLastCpu = cur;
  if (totalD <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - idleD / totalD) * 100)));
}

function topazNvidiaStats() {
  return new Promise(resolve => {
    try {
      execFile('nvidia-smi',
        ['--query-gpu=utilization.gpu,memory.used,memory.total,name', '--format=csv,noheader,nounits'],
        { timeout: 4000 }, (err, out) => {
          if (err || !out) return resolve(null);
          const line = out.trim().split('\n')[0];
          const parts = line.split(',').map(s => s.trim());
          if (parts.length < 4) return resolve(null);
          resolve({
            gpuUtil: Number(parts[0]),
            vramUsed: Number(parts[1]),
            vramTotal: Number(parts[2]),
            name: parts.slice(3).join(',').trim(),
          });
        });
    } catch (e) { resolve(null); }
  });
}

ipcMain.handle('topaz-detect', async () => {
  try {
    const det = topaz.detectTopaz(true);
    if (!det.installed) return { installed: false, reason: det.reason };
    const models = topaz.listModels(det.modelDir);
    let encoders = [];
    try { encoders = Array.from(await topaz.listEncoders(det.ffmpeg)); } catch (e) {}
    const nv = await topazNvidiaStats();
    return {
      installed: true, install: det.install, version: det.version, modelDir: det.modelDir,
      models, encoders,
      hasNvenc: encoders.some(e => /nvenc/.test(e)),
      nvidia: nv ? nv.name : null,
    };
  } catch (e) {
    return { installed: false, reason: 'Erreur de détection Topaz : ' + (e && e.message) };
  }
});

ipcMain.handle('topaz-select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Vidéos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', 'gif'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('topaz-probe', async (event, file) => {
  const det = topaz.detectTopaz();
  if (!det.installed) return { error: 'Topaz introuvable.' };
  return topaz.probeFile(det.ffprobe, file);
});

ipcMain.handle('topaz-thumbnail', async (event, file) => {
  const det = topaz.detectTopaz();
  if (!det.installed || !file || !fs.existsSync(file)) return null;
  const out = path.join(os.tmpdir(), `orbit_thumb_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  return new Promise(resolve => {
    execFile(det.ffmpeg, ['-hide_banner', '-y', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=320:-1', out],
      { timeout: 15000 }, (err) => {
        if (err || !fs.existsSync(out)) return resolve(null);
        try { const b = fs.readFileSync(out); fs.unlinkSync(out); resolve('data:image/jpeg;base64,' + b.toString('base64')); }
        catch (e) { resolve(null); }
      });
  });
});

ipcMain.handle('topaz-gpus', async () => {
  return new Promise(resolve => {
    try {
      execFile('powershell',
        ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'],
        { timeout: 6000 }, (err, out) => {
          const gpus = [];
          if (!err && out) {
            out.split('\n').map(s => s.trim()).filter(Boolean).forEach((name, i) => gpus.push({ id: String(i), name }));
          }
          resolve(gpus);
        });
    } catch (e) { resolve([]); }
  });
});

ipcMain.handle('topaz-gpu-stats', async () => {
  const nv = await topazNvidiaStats();
  const totalmem = os.totalmem(), freemem = os.freemem();
  return {
    cpu: topazCpuPercent(),
    ramUsed: Math.round((totalmem - freemem) / 1048576),
    ramTotal: Math.round(totalmem / 1048576),
    gpu: nv ? nv.gpuUtil : null,
    vramUsed: nv ? nv.vramUsed : null,
    vramTotal: nv ? nv.vramTotal : null,
    gpuName: nv ? nv.name : null,
  };
});

// Presets & queue persistence (auto-save, resumable).
ipcMain.handle('topaz-presets-load', () => topazReadJson(path.join(TOPAZ_DIR, 'presets.json'), []));
ipcMain.handle('topaz-presets-save', (e, presets) => topazWriteJson(path.join(TOPAZ_DIR, 'presets.json'), presets));
ipcMain.handle('topaz-queue-load', () => topazReadJson(path.join(TOPAZ_DIR, 'queue.json'), []));
ipcMain.handle('topaz-queue-save', (e, queue) => topazWriteJson(path.join(TOPAZ_DIR, 'queue.json'), queue));

ipcMain.on('topaz-cancel', (event, id) => {
  const job = activeDownloads.get(id);
  if (job && job.kill) job.kill();
});

// Quick before/after preview: render a short clip with the current settings.
ipcMain.handle('topaz-preview', async (event, job) => {
  try {
    const det = topaz.detectTopaz();
    if (!det.installed) return { error: det.reason || 'Topaz introuvable.' };
    const models = topaz.listModels(det.modelDir);
    const encoders = await topaz.listEncoders(det.ffmpeg);
    const built = topaz.buildCommand({ ...job, preview: job.preview || { start: 0, duration: 3 } },
      { detect: det, models, encoders, preferGpu: false });
    if (!built.ok) return { error: built.error };
    const env = {
      ...process.env,
      TVAI_MODEL_DIR: det.modelDir, TVAI_MODEL_DATA_DIR: det.modelDir,
      PATH: det.install + path.delimiter + (process.env.PATH || ''),
    };
    for (const pass of built.passes) {
      await new Promise((resolve, reject) => {
        const p = spawn(det.ffmpeg, pass.args, { cwd: pass.cwd || det.install, env, windowsHide: true });
        let log = '';
        p.stderr.on('data', d => log += d.toString());
        p.on('error', reject);
        p.on('close', c => c === 0 ? resolve() : reject(new Error('code ' + c + '\n' + log.slice(-300))));
      });
    }
    if (built.workDir) { try { fs.rmSync(built.workDir, { recursive: true, force: true }); } catch (e) {} }
    if (!fs.existsSync(built.outputPath)) return { error: 'Aperçu non généré.' };
    // Also render a matching UNprocessed clip of the same segment so the
    // before/after viewer compares identical frames at identical timing.
    let beforePath = null;
    try {
      const pv = job.preview || { start: 0, duration: 3 };
      // Topaz's ffmpeg lacks libx264 — use Orbit's bundled ffmpeg for the plain clip.
      const orbitFf = enhanceLib.detectEngines(ORBIT_DIR).ffmpeg || det.ffmpeg;
      const bp = path.join(os.tmpdir(), `orbit_tvai_before_${Date.now()}.mp4`);
      await new Promise((resolve) => {
        const p = spawn(orbitFf, ['-hide_banner', '-nostdin', '-y', '-ss', String(pv.start || 0), '-t', String(pv.duration || 3), '-i', job.inputPath, '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', bp], { windowsHide: true });
        p.stderr.on('data', () => {});
        p.on('error', () => resolve()); p.on('close', () => resolve());
      });
      if (fs.existsSync(bp) && fs.statSync(bp).size > 1000) beforePath = bp;
    } catch (e) {}
    return { outputPath: built.outputPath, beforePath };
  } catch (e) {
    return { error: 'Aperçu impossible : ' + (e && e.message) };
  }
});

ipcMain.on('topaz-start', async (event, job) => {
  const win = uiWin();
  const id = job.id;
  const sendP = (data) => win?.webContents.send('topaz-progress', { id, ...data });
  const sendErr = (msg, log) => win?.webContents.send('topaz-error', { id, error: msg, log });
  const sendDone = (data) => win?.webContents.send('topaz-complete', { id, ...data });

  try {
    const det = topaz.detectTopaz();
    if (!det.installed) return sendErr(det.reason || 'Moteur Topaz introuvable.');
    const models = topaz.listModels(det.modelDir);
    const encoders = await topaz.listEncoders(det.ffmpeg);
    const nv = await topazNvidiaStats();
    const ctx = { detect: det, models, encoders, preferGpu: !!nv && job.useGpuEncoder !== false };

    const meta = await topaz.probeFile(det.ffprobe, job.inputPath);
    const totalDuration = (meta && meta.duration) || 0;

    const built = topaz.buildCommand(job, ctx);
    if (!built.ok) return sendErr(built.error);
    (built.warnings || []).forEach(w => sendP({ log: '⚠ ' + w }));
    sendP({ log: `Modèles : ${JSON.stringify(built.resolved)}` });
    sendP({ log: `Encodeur : ${built.encoder}` });

    const env = {
      ...process.env,
      TVAI_MODEL_DIR: det.modelDir, TVAI_MODEL_DATA_DIR: det.modelDir,
      PATH: det.install + path.delimiter + (process.env.PATH || ''),
    };

    let cancelled = false;
    let currentProc = null;
    activeDownloads.set(id, { kill: () => { cancelled = true; try { currentProc && currentProc.kill('SIGKILL'); } catch (e) {} } });

    const totalWeight = built.passes.reduce((a, p) => a + (p.weight || 1), 0);
    let doneWeight = 0;
    let fullLog = '';

    for (const pass of built.passes) {
      if (cancelled) break;
      sendP({ stage: pass.label, percent: Math.round((doneWeight / totalWeight) * 100) });
      const passTotal = (pass.label === 'Traitement IA' && built.slowmo !== 1) ? totalDuration * built.slowmo : totalDuration;
      await new Promise((resolve, reject) => {
        const proc = spawn(det.ffmpeg, pass.args, { cwd: pass.cwd || det.install, env, windowsHide: true });
        currentProc = proc;
        const onData = (d) => {
          const s = d.toString(); fullLog += s;
          const tm = s.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (tm && passTotal > 0) {
            const secs = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3]);
            const passFrac = Math.max(0, Math.min(1, secs / passTotal));
            const overall = ((doneWeight + (pass.weight || 1) * passFrac) / totalWeight) * 100;
            const speed = (s.match(/speed=\s*([\d.]+x)/) || [])[1] || '';
            const fps = (s.match(/fps=\s*([\d.]+)/) || [])[1] || '';
            sendP({ percent: Math.min(99, Math.round(overall)), stage: pass.label, speed, fps });
          }
          const trimmed = s.trim();
          if (/download|loading model|out of memory|error|failed/i.test(trimmed)) {
            const last = trimmed.split('\n').pop().slice(-140);
            if (last) sendP({ log: last });
          }
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
        proc.on('error', reject);
        proc.on('close', code => {
          if (cancelled) return resolve();
          if (code === 0) { doneWeight += (pass.weight || 1); resolve(); }
          else reject(new Error('code ' + code));
        });
      });
    }

    if (built.workDir) { try { fs.rmSync(built.workDir, { recursive: true, force: true }); } catch (e) {} }
    activeDownloads.delete(id);

    if (cancelled) return sendErr('Annulé par l\'utilisateur.');

    if (!fs.existsSync(built.outputPath) || fs.statSync(built.outputPath).size < 2000) {
      return sendErr('La sortie est vide ou n\'a pas été créée.', fullLog.slice(-700));
    }
    sendP({ percent: 100, stage: 'Terminé' });
    sendDone({ outputPath: built.outputPath });
    if (job.whenDone === 'open') { try { shell.showItemInFolder(built.outputPath); } catch (e) {} }
  } catch (e) {
    try { activeDownloads.delete(job.id); } catch (er) {}
    const msg = (e && e.message) || String(e);
    let hint = '';
    if (/code 1\b/.test(msg)) hint = ' — vérifiez que Topaz Video est activé et connecté à votre compte.';
    else if (/out of memory|vram/i.test(msg)) hint = ' — mémoire GPU insuffisante : réduisez la résolution cible ou la VRAM max.';
    sendErr('Échec du traitement Topaz : ' + msg + hint);
  }
});

// ─── Orbit Enhance — free, bundled AI engine (Real-ESRGAN + RIFE + ffmpeg) ────
const enhanceLib = require('./enhance.js');
const ENHANCE_DIR = path.join(ORBIT_DIR, 'enhance');
const IS_WIN = os.platform() === 'win32';

function ensureEnhanceDir() { try { if (!fs.existsSync(ENHANCE_DIR)) fs.mkdirSync(ENHANCE_DIR, { recursive: true }); } catch (e) {} }
function enhanceReadJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fb; } }
function enhanceWriteJson(f, d) { ensureEnhanceDir(); try { fs.writeFileSync(f, JSON.stringify(d, null, 2)); return true; } catch (e) { return false; } }

// Lightweight metadata probe via ffmpeg stderr (ffprobe isn't bundled in .orbit).
function enhanceProbe(ff, file) {
  return new Promise(res => {
    if (!ff || !file || !fs.existsSync(file)) return res({ error: 'Fichier introuvable.' });
    const p = spawn(ff, ['-hide_banner', '-i', file]);
    let out = '';
    p.stderr.on('data', d => out += d.toString());
    p.stdout.on('data', d => out += d.toString());
    p.on('error', () => res({ error: 'ffmpeg indisponible.' }));
    p.on('close', () => {
      const dim = out.match(/,\s(\d{2,5})x(\d{2,5})/);
      const fpsM = out.match(/(\d+(?:\.\d+)?)\s+fps/) || out.match(/(\d+(?:\.\d+)?)\s+tbr/);
      const durM = out.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const vcodec = out.match(/Video:\s*([a-z0-9_]+)/i);
      const acodec = out.match(/Audio:\s*([a-z0-9_]+)/i);
      let size = 0; try { size = fs.statSync(file).size; } catch (e) {}
      res({
        width: dim ? +dim[1] : 0, height: dim ? +dim[2] : 0,
        fps: fpsM ? parseFloat(fpsM[1]) : 0,
        duration: durM ? (+durM[1] * 3600 + +durM[2] * 60 + parseFloat(durM[3])) : 0,
        codec: vcodec ? vcodec[1] : '', hasAudio: !!acodec, audioCodec: acodec ? acodec[1] : '', size,
      });
    });
  });
}

async function installRealEsrgan(onLine) {
  const dir = path.join(ORBIT_DIR, 'modules', 'realesrgan');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let exe = enhanceLib.findExe(dir, enhanceLib.REALESRGAN.exe);
  if (exe) return exe;
  onLine && onLine('Téléchargement de Real-ESRGAN (~45 Mo, première utilisation)…');
  const zip = path.join(dir, 'realesrgan.zip');
  await new Promise((resolve, reject) => {
    const c = trackInstall(spawn('curl', ['-L', '--output', zip, '--progress-bar', '--retry', '3', enhanceLib.REALESRGAN.url]));
    c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
    c.stderr.on('data', d => { const s = d.toString().trim(); if (s) onLine && onLine('Real-ESRGAN: ' + s.replace(/\r/g, '').split('\n').pop()); });
    c.on('close', code => {
      if (code !== 0) return reject(new Error(code === null ? 'Annulé' : 'Téléchargement échoué (curl ' + code + ')'));
      try { if (fs.statSync(zip).size < enhanceLib.REALESRGAN.minZipBytes) { fs.unlinkSync(zip); return reject(new Error('archive incomplète')); } }
      catch (e) { return reject(e); }
      resolve();
    });
  });
  onLine && onLine('Extraction de Real-ESRGAN…');
  require('child_process').execSync(`powershell -Command "Expand-Archive -Path '${zip}' -DestinationPath '${dir}' -Force"`, { timeout: 120000 });
  try { fs.unlinkSync(zip); } catch (e) {}
  exe = enhanceLib.findExe(dir, enhanceLib.REALESRGAN.exe);
  if (!exe) throw new Error('Real-ESRGAN introuvable après extraction.');
  return exe;
}

// The staged pipeline: restoration+stabilize → upscale → interpolate → encode.
async function runEnhancePipeline(job, opts) {
  const onProgress = opts.onProgress || (() => {});
  const onLog = opts.onLog || (() => {});
  const isCancelled = opts.isCancelled || (() => false);
  const setProc = opts.setProc || (() => {});

  const eng = enhanceLib.detectEngines(ORBIT_DIR);
  if (!eng.ffmpeg) throw new Error('ffmpeg introuvable.');
  const ff = eng.ffmpeg;
  const modulesDir = eng.modulesDir;
  if (!fs.existsSync(modulesDir)) fs.mkdirSync(modulesDir, { recursive: true });

  const encoders = await topaz.listEncoders(ff);
  const nv = await topazNvidiaStats();
  const s = job.settings || {};
  // Real-ESRGAN & RIFE are Vulkan-only (no CPU mode). 'cpu' / 'auto' → let the
  // engine pick its default GPU; a numeric index selects a specific GPU.
  const ncnnGpu = (s.device === 'cpu' || s.device === 'auto' || s.device == null) ? null : String(s.device);
  if (s.device === 'cpu' && (s.upscaleEnabled || s.interpEnabled)) onLog('Note : l\'upscale/interpolation IA nécessitent un GPU Vulkan ; le CPU ne s\'applique qu\'à l\'encodage final.');
  const preferGpu = !!nv && s.device !== 'cpu';

  const meta = await enhanceProbe(ff, job.inputPath);
  const srcFps = meta.fps || 30;
  const totalDur = meta.duration || 0;

  const jobId = 'enh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const temps = [];
  let workInput = job.inputPath;

  // ── stage list + overall progress reporter ──
  const active = [];
  if (s.restoreEnabled || s.stabEnabled) active.push('restore');
  if (s.upscaleEnabled) active.push('upscale');
  if (s.interpEnabled) active.push('interp');
  active.push('final');
  let stageIdx = 0;
  const total = active.length;
  const report = (stage, frac) => onProgress({ percent: Math.min(99, Math.round(((stageIdx + (frac || 0)) / total) * 100)), stage });

  // helper: run an ffmpeg pass with progress + cancel support
  const runFF = (args, cwd, label, dur) => new Promise((resolve, reject) => {
    if (isCancelled()) return reject(new Error('cancelled'));
    const p = spawn(ff, args, { cwd: cwd || undefined, windowsHide: true });
    setProc(p);
    let log = '';
    const ond = d => {
      const str = d.toString(); log += str;
      const tm = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (tm && dur > 0) { const sec = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3]); report(label, Math.min(1, sec / dur)); }
    };
    p.stdout.on('data', ond); p.stderr.on('data', ond);
    p.on('error', reject);
    p.on('close', c => c === 0 ? resolve(log) : reject(new Error(label + ' (code ' + c + ')\n' + log.slice(-400))));
  });
  const runTool = (exe, args, cwd, label, parse) => new Promise((resolve, reject) => {
    if (isCancelled()) return reject(new Error('cancelled'));
    const p = spawn(exe, args, { cwd, windowsHide: true });
    setProc(p);
    let log = '';
    const ond = d => { const str = d.toString(); log += str; const m = parse && str.match(parse); if (m) { const frac = m[2] ? (parseFloat(m[1]) / parseFloat(m[2])) : (parseFloat(m[1]) / 100); report(label, Math.min(1, frac)); } };
    p.stdout.on('data', ond); p.stderr.on('data', ond);
    p.on('error', reject);
    p.on('close', c => c === 0 ? resolve(log) : reject(new Error(label + ' (code ' + c + ')\n' + log.slice(-300))));
  });

  // ── preview: cut a short clip first ──
  if (opts.previewClip) {
    const clip = path.join(modulesDir, jobId + '_clip.mp4'); temps.push(clip);
    await runFF(['-hide_banner', '-y', '-ss', String(opts.previewClip.start || 0), '-t', String(opts.previewClip.duration || 3), '-i', job.inputPath, '-c:v', 'libx264', '-crf', '16', '-an', clip], undefined, 'Préparation aperçu', 0);
    workInput = clip;
  }

  // ── Stage 1: restoration + stabilization ──
  if (s.restoreEnabled || s.stabEnabled) {
    report('Restauration', 0);
    let workDir = null;
    const restoreFilters = s.restoreEnabled ? enhanceLib.buildRestoreFilters(s.restore || {}) : [];
    const vf = [...restoreFilters];
    if (s.stabEnabled) {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit_vs_'));
      await runFF(['-hide_banner', '-nostdin', '-y', '-i', workInput, '-vf', enhanceLib.buildVidstabDetect(s.stab || {}, 'transforms.trf'), '-f', 'null', IS_WIN ? 'NUL' : '/dev/null'], workDir, 'Stabilisation (analyse)', totalDur);
      vf.push(enhanceLib.buildVidstabTransform(s.stab || {}, 'transforms.trf'));
    }
    if (vf.length) {
      const outp = path.join(modulesDir, jobId + '_restored.mp4'); temps.push(outp);
      await runFF(['-hide_banner', '-nostdin', '-y', '-i', workInput, '-vf', vf.join(','), '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-an', outp], workDir || undefined, 'Restauration', totalDur);
      workInput = outp;
    }
    if (workDir) { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) {} }
    if (isCancelled()) throw new Error('cancelled');
    stageIdx++;
  }

  // ── Stage 2: AI upscale (Real-ESRGAN, frame-based) ──
  if (s.upscaleEnabled) {
    report('Upscale IA', 0);
    const esrExe = await installRealEsrgan(onLog);
    const framesIn = path.join(modulesDir, jobId + '_uin');
    const framesOut = path.join(modulesDir, jobId + '_uout');
    fs.mkdirSync(framesIn, { recursive: true }); fs.mkdirSync(framesOut, { recursive: true });
    temps.push(framesIn, framesOut);
    await runFF(['-hide_banner', '-y', '-i', workInput, '-vsync', 'cfr', path.join(framesIn, 'frame%08d.png')], undefined, 'Extraction (upscale)', totalDur);
    if (isCancelled()) throw new Error('cancelled');
    const wantScale = s.scaleMode === 'scale' ? (s.scale || 2) : 4;
    const { model, native } = enhanceLib.resolveEsrgan(s.upscaleModel || 'video', wantScale);
    onLog('Upscale : modèle ' + model + ' ×' + native);
    const VULKAN_RE = /vkcreateinstance|vkenumerate|vulkan|invalid gpu device|no gpu|failed -9/i;
    const esrgan = (gpu) => runTool(esrExe, enhanceLib.esrganArgs({ inDir: framesIn, outDir: framesOut, model, native, tile: s.tile || 0, tta: s.tta, gpu }), path.dirname(esrExe), 'Upscale IA', /([\d.]+)%/);
    try {
      await esrgan(ncnnGpu);
    } catch (err) {
      const m = (err && err.message) || '';
      // A specific GPU index can be wrong (ncnn enumerates differently from
      // Windows) → retry once on the default device before giving up.
      if (ncnnGpu != null && VULKAN_RE.test(m)) {
        onLog('GPU sélectionné invalide — nouvel essai sur le GPU par défaut…');
        try { await esrgan(null); }
        catch (err2) { throw VULKAN_RE.test((err2 && err2.message) || '') ? new Error('Aucun GPU compatible Vulkan détecté. L\'upscale IA (Real-ESRGAN) nécessite un GPU Vulkan récent (NVIDIA, AMD ou Intel) avec des pilotes à jour. Mets à jour tes pilotes graphiques, ou désactive l\'upscale.') : err2; }
      } else if (VULKAN_RE.test(m)) {
        throw new Error('Aucun GPU compatible Vulkan détecté. L\'upscale IA (Real-ESRGAN) nécessite un GPU Vulkan récent (NVIDIA, AMD ou Intel) avec des pilotes à jour. Mets à jour tes pilotes graphiques, ou désactive l\'upscale.');
      } else { throw err; }
    }
    if (isCancelled()) throw new Error('cancelled');
    let outFiles = []; try { outFiles = fs.readdirSync(framesOut).filter(f => f.toLowerCase().endsWith('.png')).sort(); } catch (e) {}
    if (!outFiles.length) throw new Error('Upscale : aucune frame produite.');
    const startNum = parseInt(outFiles[0], 10) || 1;
    const tgt = enhanceLib.resolveTarget(meta, s.scaleMode, s.scale, s.resPreset, s.targetW, s.targetH);
    const upOut = path.join(modulesDir, jobId + '_up.mp4'); temps.push(upOut);
    await runFF(['-hide_banner', '-y', '-framerate', String(srcFps), '-start_number', String(startNum), '-i', path.join(framesOut, 'frame%08d.png'), '-vf', `scale=${tgt.w}:${tgt.h}:flags=lanczos`, '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', upOut], undefined, 'Recomposition (upscale)', totalDur);
    try { fs.rmSync(framesIn, { recursive: true, force: true }); fs.rmSync(framesOut, { recursive: true, force: true }); } catch (e) {}
    workInput = upOut;
    stageIdx++;
  }

  // ── Stage 3: AI interpolation (RIFE, frame-based) ──
  if (s.interpEnabled) {
    report('Interpolation IA', 0);
    const rifeExe = eng.rifeExe || enhanceLib.findExe(path.join(modulesDir, 'rife'), 'rife-ncnn-vulkan.exe');
    if (!rifeExe) throw new Error('Moteur RIFE absent — ouvrez une fois l\'onglet « Interpolateur IA » pour l\'installer, puis réessayez.');
    const framesIn = path.join(modulesDir, jobId + '_iin');
    const framesOut = path.join(modulesDir, jobId + '_iout');
    fs.mkdirSync(framesIn, { recursive: true }); fs.mkdirSync(framesOut, { recursive: true });
    temps.push(framesIn, framesOut);
    await runFF(['-hide_banner', '-y', '-i', workInput, '-vsync', 'cfr', path.join(framesIn, 'frame%08d.png')], undefined, 'Extraction (interpolation)', totalDur);
    if (isCancelled()) throw new Error('cancelled');
    let inCount = 0; try { inCount = fs.readdirSync(framesIn).filter(f => f.toLowerCase().endsWith('.png')).length; } catch (e) {}
    if (inCount < 2) throw new Error('Pas assez de frames pour interpoler.');
    const targetFps = enhanceLib.clamp(s.fps || 60, 1, 480, 60);
    const slowmo = enhanceLib.clamp(s.slowmo || 1, 1, 16, 1);
    const outCount = Math.max(inCount + 1, Math.round(inCount * (targetFps / srcFps) * slowmo));
    // pick best rife-v4 model
    const rifeDir = path.dirname(rifeExe);
    let modelPath = null;
    for (const m of ['rife-v4.6', 'rife-v4.4', 'rife-v4.3', 'rife-v4']) {
      const c = path.join(rifeDir, m);
      if (fs.existsSync(path.join(c, 'flownet.param'))) { modelPath = c; break; }
    }
    const baseRifeArgs = ['-i', framesIn, '-o', framesOut, '-n', String(outCount)];
    if (modelPath) baseRifeArgs.push('-m', modelPath);
    const RIFE_VULKAN_RE = /vkcreateinstance|vkenumerate|vulkan|invalid gpu device|no gpu|failed -9/i;
    const rife = (gpu) => runTool(rifeExe, gpu != null ? [...baseRifeArgs, '-g', String(gpu)] : baseRifeArgs, rifeDir, 'Interpolation IA', /(\d+)\/(\d+)/);
    try {
      await rife(ncnnGpu);
    } catch (err) {
      const m = (err && err.message) || '';
      if (ncnnGpu != null && RIFE_VULKAN_RE.test(m)) {
        onLog('GPU sélectionné invalide — nouvel essai sur le GPU par défaut…');
        try { await rife(null); }
        catch (err2) { throw RIFE_VULKAN_RE.test((err2 && err2.message) || '') ? new Error('Aucun GPU compatible Vulkan détecté. L\'interpolation IA (RIFE) nécessite un GPU Vulkan récent avec des pilotes à jour. Mets à jour tes pilotes, ou désactive l\'interpolation.') : err2; }
      } else if (RIFE_VULKAN_RE.test(m)) {
        throw new Error('Aucun GPU compatible Vulkan détecté. L\'interpolation IA (RIFE) nécessite un GPU Vulkan récent avec des pilotes à jour. Mets à jour tes pilotes, ou désactive l\'interpolation.');
      } else { throw err; }
    }
    if (isCancelled()) throw new Error('cancelled');
    let outFiles = []; try { outFiles = fs.readdirSync(framesOut).filter(f => f.toLowerCase().endsWith('.png')).sort(); } catch (e) {}
    if (!outFiles.length) throw new Error('Interpolation : aucune frame produite.');
    const startNum = parseInt(outFiles[0], 10);
    const fpsStr = targetFps.toFixed(3).replace(/\.?0+$/, '');
    const ipOut = path.join(modulesDir, jobId + '_ip.mp4'); temps.push(ipOut);
    await runFF(['-hide_banner', '-y', '-framerate', fpsStr, '-start_number', String(startNum), '-i', path.join(framesOut, '%08d.png'), '-c:v', 'libx264', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', fpsStr, ipOut], undefined, 'Recomposition (interpolation)', totalDur * slowmo);
    try { fs.rmSync(framesIn, { recursive: true, force: true }); fs.rmSync(framesOut, { recursive: true, force: true }); } catch (e) {}
    workInput = ipOut;
    stageIdx++;
  }

  // ── Stage 4: final encode (sharpen + codec + audio) ──
  report('Encodage final', 0);
  const codec = (s.codec || 'h264').toLowerCase();
  const enc = enhanceLib.pickVideoEncoder(codec, encoders, preferGpu);
  // The encoder may differ from the requested codec (unavailable on this build);
  // derive everything downstream from what will ACTUALLY be produced.
  const realCodec = enhanceLib.encoderCodec(enc);
  if (realCodec !== codec) onLog(`Codec ${codec.toUpperCase()} indisponible → ${realCodec.toUpperCase()} (${enc})`);
  const qargs = enhanceLib.encoderQualityArgs(realCodec, enc, s.quality != null ? s.quality : 75);
  const sharpen = enhanceLib.buildSharpenFilter(s.sharpen || 0);
  // Auto-correct impossible container/codec combos (e.g. H.264-in-WEBM, ProRes-in-MP4).
  const reqFmt = (s.format || 'MP4').toUpperCase();
  const safeFmt = enhanceLib.safeContainer(reqFmt, realCodec);
  if (safeFmt !== reqFmt) onLog(`Conteneur ${reqFmt} incompatible avec ${realCodec.toUpperCase()} → ${safeFmt}`);
  const ext = enhanceLib.CONTAINER_EXT[safeFmt] || 'mp4';
  const faststart = safeFmt === 'MP4' || safeFmt === 'MOV';
  const slowmoActive = s.interpEnabled && (s.slowmo || 1) > 1;
  let outputPath;
  if (opts.previewClip) outputPath = path.join(os.tmpdir(), 'orbit_enh_preview_' + Date.now() + '.mp4');
  else {
    const outDir = (s.outputDir && fs.existsSync(s.outputDir)) ? s.outputDir : path.dirname(job.inputPath);
    const base = path.basename(job.inputPath, path.extname(job.inputPath));
    outputPath = path.join(outDir, base + '_orbit.' + ext);
    if (path.resolve(outputPath) === path.resolve(job.inputPath)) outputPath = path.join(outDir, base + '_orbit_out.' + ext);
  }
  // Honour the "keep audio" toggle; drop audio when slow-motion changes the timeline.
  const useOrigAudio = !slowmoActive && meta.hasAudio && s.audioCopy !== false && !opts.previewClip;
  // WEBM only accepts Opus/Vorbis audio; everything else takes AAC.
  const audioCodec = safeFmt === 'WEBM' ? 'libopus' : 'aac';
  const finalArgs = ['-hide_banner', '-nostdin', '-y', '-i', workInput];
  if (useOrigAudio) finalArgs.push('-i', job.inputPath);
  if (sharpen) finalArgs.push('-vf', sharpen);
  finalArgs.push('-map', '0:v:0');
  if (useOrigAudio) finalArgs.push('-map', '1:a:0?', '-c:a', audioCodec, '-b:a', '192k'); else finalArgs.push('-an');
  if (opts.previewClip) finalArgs.push('-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
  else finalArgs.push('-c:v', enc, ...qargs);
  if (faststart) finalArgs.push('-movflags', '+faststart');
  finalArgs.push(outputPath);
  await runFF(finalArgs, undefined, 'Encodage final', totalDur * (slowmoActive ? (s.slowmo || 1) : 1));
  stageIdx++;

  for (const t of temps) { try { fs.rmSync(t, { recursive: true, force: true }); } catch (e) {} }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 2000) throw new Error('La sortie est vide.');
  return { outputPath };
}

ipcMain.handle('enhance-detect', async () => {
  try {
    const eng = enhanceLib.detectEngines(ORBIT_DIR);
    let encoders = [];
    try { encoders = Array.from(await topaz.listEncoders(eng.ffmpeg)); } catch (e) {}
    const nv = await topazNvidiaStats();
    return {
      ready: !!eng.ffmpeg,
      ffmpeg: !!eng.ffmpeg,
      esrganInstalled: !!eng.esrganExe,
      rifeInstalled: !!eng.rifeExe,
      models: enhanceLib.ESRGAN_MODELS,
      encoders,
      availableCodecs: enhanceLib.availableCodecs(encoders),
      hasNvenc: encoders.some(e => /nvenc/.test(e)),
      nvidia: nv ? nv.name : null,
    };
  } catch (e) { return { ready: false, reason: (e && e.message) }; }
});

ipcMain.handle('enhance-install', async () => {
  const win = uiWin();
  try {
    await installRealEsrgan((m) => win?.webContents.send('enhance-progress', { id: 'install', log: m }));
    return { ok: true };
  } catch (e) { return { ok: false, error: (e && e.message) }; }
});

ipcMain.handle('enhance-select-files', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Vidéos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', 'gif'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('enhance-probe', async (e, file) => {
  const eng = enhanceLib.detectEngines(ORBIT_DIR);
  return enhanceProbe(eng.ffmpeg, file);
});

ipcMain.handle('enhance-thumbnail', async (e, file) => {
  const eng = enhanceLib.detectEngines(ORBIT_DIR);
  if (!eng.ffmpeg || !file || !fs.existsSync(file)) return null;
  const out = path.join(os.tmpdir(), `orbit_ethumb_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  return new Promise(resolve => {
    execFile(eng.ffmpeg, ['-hide_banner', '-y', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=320:-1', out], { timeout: 15000 }, (err) => {
      if (err || !fs.existsSync(out)) return resolve(null);
      try { const b = fs.readFileSync(out); fs.unlinkSync(out); resolve('data:image/jpeg;base64,' + b.toString('base64')); }
      catch (e) { resolve(null); }
    });
  });
});

ipcMain.handle('enhance-gpus', async () => {
  return new Promise(resolve => {
    try {
      execFile('powershell', ['-NoProfile', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name'], { timeout: 6000 }, (err, out) => {
        const gpus = [];
        if (!err && out) out.split('\n').map(s => s.trim()).filter(Boolean).forEach((name, i) => gpus.push({ id: String(i), name }));
        resolve(gpus);
      });
    } catch (e) { resolve([]); }
  });
});

ipcMain.handle('enhance-gpu-stats', async () => {
  const nv = await topazNvidiaStats();
  const totalmem = os.totalmem(), freemem = os.freemem();
  return {
    cpu: topazCpuPercent(),
    ramUsed: Math.round((totalmem - freemem) / 1048576),
    ramTotal: Math.round(totalmem / 1048576),
    gpu: nv ? nv.gpuUtil : null, vramUsed: nv ? nv.vramUsed : null, vramTotal: nv ? nv.vramTotal : null, gpuName: nv ? nv.name : null,
  };
});

ipcMain.handle('enhance-presets-load', () => enhanceReadJson(path.join(ENHANCE_DIR, 'presets.json'), []));
ipcMain.handle('enhance-presets-save', (e, p) => enhanceWriteJson(path.join(ENHANCE_DIR, 'presets.json'), p));
ipcMain.handle('enhance-queue-load', () => enhanceReadJson(path.join(ENHANCE_DIR, 'queue.json'), []));
ipcMain.handle('enhance-queue-save', (e, q) => enhanceWriteJson(path.join(ENHANCE_DIR, 'queue.json'), q));

ipcMain.on('enhance-cancel', (e, id) => { const j = activeDownloads.get(id); if (j && j.kill) j.kill(); });

ipcMain.handle('enhance-preview', async (e, job) => {
  try {
    const r = await runEnhancePipeline(job, { previewClip: job.preview || { start: 0, duration: 3 } });
    return r;
  } catch (e2) { return { error: 'Aperçu impossible : ' + (e2 && e2.message) }; }
});

ipcMain.on('enhance-start', async (event, job) => {
  const win = uiWin();
  const id = job.id;
  const sendP = (d) => win?.webContents.send('enhance-progress', { id, ...d });
  const sendErr = (msg) => win?.webContents.send('enhance-error', { id, error: msg });
  const sendDone = (d) => win?.webContents.send('enhance-complete', { id, ...d });
  let cancelled = false, currentProc = null;
  activeDownloads.set(id, { kill: () => { cancelled = true; try { currentProc && currentProc.kill('SIGKILL'); } catch (e) {} } });
  try {
    const s = job.settings || {};
    if (!s.upscaleEnabled && !s.interpEnabled && !s.restoreEnabled && !s.stabEnabled && !(s.sharpen > 0)) {
      activeDownloads.delete(id);
      return sendErr('Activez au moins un traitement (upscale, interpolation, restauration, stabilisation ou netteté).');
    }
    const r = await runEnhancePipeline(job, {
      onProgress: (d) => sendP(d),
      onLog: (m) => sendP({ log: m }),
      isCancelled: () => cancelled,
      setProc: (p) => { currentProc = p; },
    });
    activeDownloads.delete(id);
    if (cancelled) return sendErr('Annulé par l\'utilisateur.');
    sendP({ percent: 100, stage: 'Terminé' });
    sendDone({ outputPath: r.outputPath });
    if (job.whenDone === 'open') { try { shell.showItemInFolder(r.outputPath); } catch (e) {} }
  } catch (e) {
    activeDownloads.delete(id);
    const msg = (e && e.message) || String(e);
    if (/cancelled/i.test(msg)) return sendErr('Annulé par l\'utilisateur.');
    let hint = '';
    if (/out of memory|vram|VK_ERROR/i.test(msg)) hint = ' — mémoire GPU insuffisante : réduisez l\'échelle ou activez « tile size », ou passez en CPU.';
    sendErr('Échec : ' + msg + hint);
  }
});

// ─── Génération d'image IA (Pollinations · Flux — gratuit, sans clé API) ───────
// Modèle Flux : open-source, niveau Midjourney, totalement gratuit & illimité.
const IMAGEGEN_DIR_NAME = 'Orbit Images IA';
const IMAGEGEN_MODELS_FALLBACK = [
  { value: 'flux',         label: 'Flux — qualité maximale (recommandé)' },
  { value: 'flux-realism', label: 'Flux Realism — photoréaliste' },
  { value: 'flux-anime',   label: 'Flux Anime — manga / anime' },
  { value: 'flux-3d',      label: 'Flux 3D — rendu 3D / Blender' },
  { value: 'flux-cablyai', label: 'Flux CablyAI — artistique' },
  { value: 'turbo',        label: 'Turbo — ultra rapide' },
];

// Fetch a URL to a Buffer, following redirects (Pollinations redirects to a CDN).
function httpGetBuffer(url, opts = {}, redirects = 0) {
  const timeout = opts.timeout || 180000;
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('Trop de redirections.'));
    const lib = url.startsWith('https') ? https : require('http');
    const req = lib.get(url, { headers: { 'User-Agent': 'Orbit/1.0', ...(opts.headers || {}) } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        return resolve(httpGetBuffer(next, opts, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error('Délai dépassé — réessayez.')));
    req.on('error', reject);
  });
}

// Turn a user's request (often French / conversational) into a clean English
// text-to-image prompt. Flux is English-trained, so "couchée de soleil" was read
// as "couch"; this fixes the subject. Cached; falls back to the raw text.
const _promptCache = new Map();
async function toImagePrompt(text) {
  const t = (text || '').trim();
  if (!t) return t;
  if (_promptCache.has(t)) return _promptCache.get(t);
  let result = t;
  try {
    const sys = encodeURIComponent("You are an image-prompt engineer. Translate and rewrite the user's request into a single concise English text-to-image prompt describing the subject and style. Output ONLY the prompt — no quotes, no preface, no explanation.");
    const q = encodeURIComponent(t);
    const { buffer } = await httpGetBuffer(`https://text.pollinations.ai/${q}?system=${sys}`, { timeout: 25000 });
    const out = (buffer.toString('utf8') || '').trim();
    if (out && !out.startsWith('{') && !/queue full|error|<html/i.test(out.slice(0, 60)) && out.length <= 600) result = out;
  } catch (e) {}
  _promptCache.set(t, result);
  return result;
}

ipcMain.handle('image-gen-models', async () => {
  try {
    const { buffer, contentType } = await httpGetBuffer('https://image.pollinations.ai/models', { timeout: 8000 });
    const txt = buffer.toString('utf8').trim();
    if (/json/.test(contentType) || txt[0] === '[') {
      const arr = JSON.parse(txt);
      if (Array.isArray(arr) && arr.length) {
        const known = Object.fromEntries(IMAGEGEN_MODELS_FALLBACK.map(m => [m.value, m.label]));
        // Keep the curated order first, then any extra models the API exposes.
        const set = new Set(arr.map(String));
        const ordered = IMAGEGEN_MODELS_FALLBACK.filter(m => set.has(m.value));
        for (const m of arr.map(String)) if (!ordered.some(o => o.value === m)) ordered.push({ value: m, label: known[m] || m });
        return ordered.length ? ordered : IMAGEGEN_MODELS_FALLBACK;
      }
    }
  } catch (e) {}
  return IMAGEGEN_MODELS_FALLBACK;
});

ipcMain.handle('image-gen', async (e, params = {}) => {
  try {
    const prompt = (params.prompt || '').trim();
    if (!prompt) return { error: 'Décris l\'image que tu veux générer.' };
    const width = Math.round(enhanceLib.clamp(params.width || 1024, 64, 2048, 1024));
    const height = Math.round(enhanceLib.clamp(params.height || 1024, 64, 2048, 1024));
    const model = params.model || 'flux';
    const seed = (params.seed != null && params.seed !== '') ? String(params.seed) : String(Math.floor(Math.random() * 1e9));
    const q = new URLSearchParams({
      width: String(width), height: String(height), seed, model,
      nologo: 'true', enhance: params.enhance ? 'true' : 'false', private: 'true', safe: 'false',
    });
    // Translate/clean the request into a proper English prompt (Flux is
    // English-trained — French phrasing produced wrong subjects).
    const finalPrompt = await toImagePrompt(prompt);
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(finalPrompt) + '?' + q.toString();
    const { buffer, contentType } = await httpGetBuffer(url, { timeout: 180000 });
    if (!buffer || buffer.length < 800) return { error: 'Image vide — réessaie ou change de modèle.' };
    if (/json|text\/(?!plain)/.test(contentType) && buffer.length < 4000) {
      return { error: 'Le service a renvoyé une erreur : ' + buffer.toString('utf8').slice(0, 200) };
    }
    // Save into a dedicated, writable subfolder so the images are organised and
    // not lost among other downloads (and survive Downloads-root cleanups).
    let outDir = path.join(usableDownloadDir(params.outputDir), IMAGEGEN_DIR_NAME);
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e2) { outDir = usableDownloadDir(params.outputDir); }
    const ext = /png/.test(contentType) ? 'png' : 'jpg';
    const safeName = prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'image';
    const file = path.join(outDir, `orbit-${safeName}-${Date.now().toString(36)}.${ext}`);
    fs.writeFileSync(file, buffer);
    const dataUrl = `data:${contentType || 'image/jpeg'};base64,` + buffer.toString('base64');
    return { ok: true, path: file, dataUrl, seed, model, width, height, prompt };
  } catch (err) {
    return { error: 'Échec de la génération : ' + ((err && err.message) || String(err)) };
  }
});

// ─── HandBrake — genuine HandBrakeCLI engine, auto-downloaded & wrapped ────────
const handbrake = require('./handbrake.js');

async function installHandBrake(onLine) {
  const dir = path.join(ORBIT_DIR, 'modules', 'handbrake');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let det = handbrake.detect(ORBIT_DIR);
  if (det.installed) return det.exe;
  onLine && onLine('Recherche de la dernière version de HandBrake…');
  const rel = await new Promise((res, rej) => {
    https.get(handbrake.HB_API_LATEST, { headers: { 'User-Agent': 'Orbit' } }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
  const asset = (rel.assets || []).find(a => /HandBrakeCLI.*win.*x86_64\.zip$/i.test(a.name)) || (rel.assets || []).find(a => /HandBrakeCLI.*win.*\.zip$/i.test(a.name));
  if (!asset) throw new Error('Archive HandBrakeCLI introuvable dans la dernière release.');
  onLine && onLine(`Téléchargement de HandBrake ${rel.tag_name} (~26 Mo, première utilisation)…`);
  const zip = path.join(dir, 'handbrake.zip');
  await new Promise((resolve, reject) => {
    const c = trackInstall(spawn('curl', ['-L', '--output', zip, '--progress-bar', '--retry', '3', asset.browser_download_url]));
    c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
    c.stderr.on('data', d => { const s = d.toString().trim(); if (s) onLine && onLine('HandBrake: ' + s.replace(/\r/g, '').split('\n').pop()); });
    c.on('close', code => code === 0 ? resolve() : reject(new Error(code === null ? 'Annulé' : 'Téléchargement échoué (curl ' + code + ')')));
  });
  onLine && onLine('Extraction de HandBrake…');
  require('child_process').execSync(`powershell -Command "Expand-Archive -Path '${zip}' -DestinationPath '${dir}' -Force"`, { timeout: 120000 });
  try { fs.unlinkSync(zip); } catch (e) {}
  det = handbrake.detect(ORBIT_DIR);
  if (!det.installed) throw new Error('HandBrakeCLI introuvable après extraction.');
  return det.exe;
}

function hbReadPresets(exe) {
  return new Promise(resolve => {
    execFile(exe, ['--preset-list'], { maxBuffer: 1024 * 1024 * 8 }, (e, so, se) => {
      resolve(handbrake.parsePresetList((so || '') + '\n' + (se || '')));
    });
  });
}

ipcMain.handle('hb-detect', async () => {
  const det = handbrake.detect(ORBIT_DIR);
  const base = { encoders: handbrake.ENCODERS, encoderPresets: handbrake.ENCODER_PRESETS, nvencPresets: handbrake.NVENC_PRESETS, denoise: handbrake.DENOISE, sharpen: handbrake.SHARPEN };
  if (!det.installed) return { installed: false, ...base };
  let presets = { groups: {}, flat: [] };
  try { presets = await hbReadPresets(det.exe); } catch (e) {}
  return { installed: true, presets, ...base };
});

ipcMain.handle('hb-install', async () => {
  const win = uiWin();
  try {
    const exe = await installHandBrake(m => win?.webContents.send('hb-progress', { id: 'install', log: m }));
    const presets = await hbReadPresets(exe);
    return { ok: true, presets };
  } catch (e) { return { ok: false, error: (e && e.message) }; }
});

ipcMain.on('hb-cancel', (e, id) => { const j = activeDownloads.get(id); if (j && j.kill) j.kill(); });
ipcMain.handle('hb-queue-load', () => enhanceReadJson(path.join(ENHANCE_DIR, 'hb-queue.json'), []));
ipcMain.handle('hb-queue-save', (e, q) => enhanceWriteJson(path.join(ENHANCE_DIR, 'hb-queue.json'), q));
ipcMain.handle('hb-presets-load', () => enhanceReadJson(path.join(ENHANCE_DIR, 'hb-presets.json'), []));
ipcMain.handle('hb-presets-save', (e, p) => enhanceWriteJson(path.join(ENHANCE_DIR, 'hb-presets.json'), p));

ipcMain.on('hb-start', async (event, job) => {
  const win = uiWin();
  const id = job.id;
  const sendP = (d) => win?.webContents.send('hb-progress', { id, ...d });
  const sendErr = (msg) => win?.webContents.send('hb-error', { id, error: msg });
  const sendDone = (d) => win?.webContents.send('hb-complete', { id, ...d });
  let cancelled = false, proc = null;
  activeDownloads.set(id, { kill: () => { cancelled = true; try { proc && proc.kill('SIGKILL'); } catch (e) {} } });
  try {
    const exe = await installHandBrake(m => sendP({ log: m }));
    const container = (job.container || 'mp4').toLowerCase();
    const outDir = (job.outputDir && fs.existsSync(job.outputDir)) ? job.outputDir : path.dirname(job.inputPath);
    const base = path.basename(job.inputPath, path.extname(job.inputPath));
    let outputPath = path.join(outDir, `${base}_hb.${container}`);
    if (path.resolve(outputPath) === path.resolve(job.inputPath)) outputPath = path.join(outDir, `${base}_hb_out.${container}`);
    const { args } = handbrake.buildArgs(job, outputPath);
    sendP({ log: 'HandBrakeCLI ' + args.join(' ') });

    const attempt = () => new Promise((resolve, reject) => {
      try { fs.unlinkSync(outputPath); } catch (e) {}
      proc = spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true });
      let log = '';
      const ond = d => { const s = d.toString(); log += s; const m = s.match(/([\d.]+)\s*%/); if (m) sendP({ percent: Math.min(99, Math.round(parseFloat(m[1]))), stage: 'Encodage' }); };
      proc.stdout.on('data', ond); proc.stderr.on('data', ond);
      proc.on('error', reject);
      proc.on('close', c => { if (cancelled) return resolve('cancelled'); if (c === 0) return resolve('ok'); reject(new Error('code ' + c + (/initialize job/i.test(log) ? ' (init)' : '') + '\n' + log.slice(-300))); });
    });

    let res;
    try { res = await attempt(); }
    catch (e) {
      if (!cancelled && /init/i.test(e.message)) { sendP({ log: 'Initialisation échouée — nouvelle tentative…' }); await new Promise(r => setTimeout(r, 1200)); res = await attempt(); }
      else throw e;
    }
    activeDownloads.delete(id);
    if (cancelled || res === 'cancelled') return sendErr('Annulé par l\'utilisateur.');
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 2000) return sendErr('La sortie est vide ou n\'a pas été créée.');
    sendP({ percent: 100, stage: 'Terminé' });
    sendDone({ outputPath });
    try {
      let gs = {}; try { gs = JSON.parse(fs.readFileSync(path.join(ORBIT_DIR, 'settings.json'), 'utf8')); } catch (e) {}
      if (gs.notifications) { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title: 'Orbit — HandBrake terminé', body: path.basename(outputPath) }).show(); }
    } catch (e) {}
    if (job.whenDone === 'open') { try { shell.showItemInFolder(outputPath); } catch (e) {} }
  } catch (e) {
    activeDownloads.delete(id);
    sendErr('Échec HandBrake : ' + ((e && e.message) || String(e)));
  }
});

// ─── Media Library (Anime Media Manager) ──────────────────────────────────────
const library = require('./library.js');
const LIB_FILE = path.join(ORBIT_DIR, 'library.json');

ipcMain.handle('lib-load', () => enhanceReadJson(LIB_FILE, { items: [] }));
ipcMain.handle('lib-save', (e, data) => { try { if (!fs.existsSync(ORBIT_DIR)) fs.mkdirSync(ORBIT_DIR, { recursive: true }); fs.writeFileSync(LIB_FILE, JSON.stringify(data, null, 2)); return true; } catch (er) { return false; } });

ipcMain.handle('lib-add-files', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Vidéos', extensions: library.VIDEO_EXT }] });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('lib-scan-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return [];
  const root = r.filePaths[0];
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 8 || found.length > 5000) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, depth + 1);
      else if (ent.isFile() && library.isVideo(ent.name)) found.push(full);
    }
  };
  walk(root, 0);
  return found;
});

ipcMain.handle('lib-probe', async (e, file) => {
  const eng = enhanceLib.detectEngines(ORBIT_DIR);
  return enhanceProbe(eng.ffmpeg, file);
});
ipcMain.handle('lib-thumbnail', async (e, file) => {
  const eng = enhanceLib.detectEngines(ORBIT_DIR);
  if (!eng.ffmpeg || !file || !fs.existsSync(file)) return null;
  const out = path.join(os.tmpdir(), `orbit_lib_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  return new Promise(resolve => {
    execFile(eng.ffmpeg, ['-hide_banner', '-y', '-ss', '2', '-i', file, '-frames:v', '1', '-vf', 'scale=400:-1', out], { timeout: 15000 }, (err) => {
      if (err || !fs.existsSync(out)) return resolve(null);
      try { const b = fs.readFileSync(out); fs.unlinkSync(out); resolve('data:image/jpeg;base64,' + b.toString('base64')); } catch (e) { resolve(null); }
    });
  });
});
ipcMain.handle('lib-parse-name', (e, filename) => library.parseSeriesInfo(filename));
ipcMain.handle('lib-presets', () => ({ presets: library.PRESETS, prep: library.PREP }));

ipcMain.on('lib-cancel', (e, id) => { const j = activeDownloads.get(id); if (j && j.kill) j.kill(); });

ipcMain.on('lib-convert', async (event, job) => {
  const win = uiWin();
  const id = job.id;
  const sendP = (d) => win?.webContents.send('lib-convert-progress', { id, ...d });
  const sendErr = (msg) => win?.webContents.send('lib-convert-error', { id, error: msg });
  const sendDone = (d) => win?.webContents.send('lib-convert-complete', { id, ...d });
  let cancelled = false, proc = null;
  activeDownloads.set(id, { kill: () => { cancelled = true; try { proc && proc.kill('SIGKILL'); } catch (e) {} } });
  try {
    const eng = enhanceLib.detectEngines(ORBIT_DIR);
    if (!eng.ffmpeg) return sendErr('ffmpeg introuvable.');
    const meta = await enhanceProbe(eng.ffmpeg, job.inputPath);
    const totalDur = (meta && meta.duration) || 0;
    // Resolve preset + suffix (creative-app prep maps to a codec).
    let preset = job.preset, suffix = '';
    if (job.mode === 'prep' && library.PREP[job.prep]) { preset = library.PREP[job.prep].preset; suffix = library.PREP[job.prep].suffix; }
    const ext = (library.PRESETS[preset] || library.PRESETS.h264).ext;
    const outputPath = library.outputName(job.inputPath, preset, suffix, (job.outputDir && fs.existsSync(job.outputDir)) ? job.outputDir : null, ext);
    const { args } = library.buildConvert(preset, job.inputPath, outputPath);
    sendP({ stage: 'Conversion', percent: 0 });
    await new Promise((resolve, reject) => {
      proc = spawn(eng.ffmpeg, args, { windowsHide: true });
      let log = '';
      const ond = d => { const s = d.toString(); log += s; const tm = s.match(/time=(\d+):(\d+):(\d+\.\d+)/); if (tm && totalDur > 0) { const sec = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3]); sendP({ percent: Math.min(99, Math.round(sec / totalDur * 100)), stage: 'Conversion' }); } };
      proc.stdout.on('data', ond); proc.stderr.on('data', ond);
      proc.on('error', reject);
      proc.on('close', c => { if (cancelled) return resolve('cancelled'); c === 0 ? resolve('ok') : reject(new Error('code ' + c + '\n' + log.slice(-300))); });
    });
    activeDownloads.delete(id);
    if (cancelled) return sendErr('Annulé.');
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 2000) return sendErr('Sortie vide.');
    sendP({ percent: 100, stage: 'Terminé' });
    sendDone({ outputPath });
    try { let gs = {}; try { gs = JSON.parse(fs.readFileSync(path.join(ORBIT_DIR, 'settings.json'), 'utf8')); } catch (e) {} if (gs.notifications) { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title: 'Orbit — Conversion terminée', body: path.basename(outputPath) }).show(); } } catch (e) {}
  } catch (e) {
    activeDownloads.delete(id);
    sendErr('Échec : ' + ((e && e.message) || String(e)));
  }
});

// ─── AI Background Removal (Robust Video Matting · ONNX) ──────────────────────
const matting = require('./matting.js');
const inpaint = require('./inpaint.js');
const sam = require('./sam.js');
const yolo = require('./yolo.js');
const sdinpaint = require('./sdinpaint.js');
let _ort = null;
function getOrt() { if (!_ort) { _ort = require('onnxruntime-node'); try { _ort.env.logLevel = 'error'; } catch (e) {} } return _ort; }
const RVM_DIR = path.join(ORBIT_DIR, 'modules', 'rvm');

async function installRvmModel(modelKey, onLog) {
  const m = matting.MODELS[modelKey] || matting.MODELS.mobilenetv3;
  if (!fs.existsSync(RVM_DIR)) fs.mkdirSync(RVM_DIR, { recursive: true });
  const dest = path.join(RVM_DIR, m.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= m.minBytes) return dest;
  onLog && onLog(`Téléchargement du modèle RVM « ${m.label} »…`);
  await new Promise((resolve, reject) => {
    const c = trackInstall(spawn('curl', ['-L', '--output', dest, '--progress-bar', '--retry', '3', m.url]));
    c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
    c.stderr.on('data', d => { const s = d.toString().trim(); if (s) onLog && onLog('RVM: ' + s.replace(/\r/g, '').split('\n').pop()); });
    c.on('close', code => code === 0 ? resolve() : reject(new Error(code === null ? 'Annulé' : 'Téléchargement échoué (curl ' + code + ')')));
  });
  if (!fs.existsSync(dest) || fs.statSync(dest).size < m.minBytes) { try { fs.unlinkSync(dest); } catch (e) {} throw new Error('Modèle RVM incomplet.'); }
  return dest;
}

ipcMain.handle('matting-detect', async () => {
  let ready = false, err = null;
  try { getOrt(); ready = true; } catch (e) { err = (e && e.message) || String(e); }
  const models = Object.entries(matting.MODELS).map(([k, m]) => { let size = 0, installed = false; try { size = fs.statSync(path.join(RVM_DIR, m.file)).size; installed = size >= m.minBytes; } catch (e) {} return { key: k, label: m.label, installed, size }; });
  return { ready, err, models };
});
ipcMain.handle('matting-install', async (e, modelKey) => {
  const win = uiWin();
  try { await installRvmModel(modelKey, m => win?.webContents.send('matting-progress', { id: 'install', log: m })); return { ok: true }; }
  catch (er) { return { ok: false, error: er.message }; }
});
ipcMain.on('matting-cancel', (e, id) => { const j = activeDownloads.get(id); if (j && j.kill) j.kill(); });

// The streaming pipeline: ffmpeg decode → RVM recurrent loop → alpha → ffmpeg composite.
async function runMatting(job, opts) {
  const onProgress = opts.onProgress || (() => {});
  const onLog = opts.onLog || (() => {});
  const isCancelled = opts.isCancelled || (() => false);
  const reg = opts.registerProc || (() => {});

  const ort = getOrt();
  const eng = enhanceLib.detectEngines(ORBIT_DIR);
  if (!eng.ffmpeg) throw new Error('ffmpeg introuvable.');
  const ff = eng.ffmpeg;
  const modelPath = await installRvmModel(job.model || 'mobilenetv3', onLog);

  // Probe + (optional) trim for preview.
  let input = job.inputPath;
  const tmpFiles = [];
  let meta = await enhanceProbe(ff, input);
  if (opts.preview) {
    const clip = path.join(os.tmpdir(), `orbit_rvm_clip_${Date.now()}.mp4`); tmpFiles.push(clip);
    await new Promise((res, rej) => { const p = spawn(ff, ['-hide_banner', '-y', '-ss', String(opts.preview.start || 0), '-t', String(opts.preview.duration || 3), '-i', job.inputPath, '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', clip], { windowsHide: true }); reg(p); p.on('error', rej); p.on('close', c => c === 0 ? res() : rej(new Error('clip ' + c))); });
    input = clip; meta = await enhanceProbe(ff, input);
  }
  const W = meta.width || 1280, H = meta.height || 720, fps = Math.round(meta.fps || 30) || 30;
  const totalFrames = Math.max(1, Math.round((meta.duration || 0) * fps));
  const { pw, ph, ratio } = matting.procSize(W, H, job.quality || 'balanced');
  onLog(`Matte ${pw}×${ph} (ratio ${ratio}) · ${W}×${H} sortie`);

  // ── Stage A: decode → RVM → alpha video ──
  const alphaPath = path.join(os.tmpdir(), `orbit_rvm_alpha_${Date.now()}.mkv`); tmpFiles.push(alphaPath);
  const session = await ort.InferenceSession.create(modelPath);
  const decode = spawn(ff, matting.decodeArgs(input, pw, ph, fps), { windowsHide: true });
  const aenc = spawn(ff, matting.alphaEncodeArgs(pw, ph, fps, alphaPath), { windowsHide: true });
  reg(decode); reg(aenc);
  decode.stderr.on('data', () => {}); aenc.stderr.on('data', () => {});

  const frameSize = pw * ph * 3, N = pw * ph;
  const empty = () => new ort.Tensor('float32', new Float32Array(1), [1, 1, 1, 1]);
  let rec = [empty(), empty(), empty(), empty()];
  const ratioT = new ort.Tensor('float32', new Float32Array([ratio]), [1]);
  const chw = new Float32Array(3 * N);
  const drain = (s) => new Promise(r => s.once('drain', r));
  let acc = Buffer.alloc(0), frames = 0, fatal = null;

  await new Promise((resolve, reject) => {
    decode.stdout.on('data', async (chunk) => {
      if (fatal) return;
      acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
      while (acc.length >= frameSize) {
        if (isCancelled()) { fatal = new Error('cancelled'); decode.stdout.destroy(); try { aenc.stdin.end(); } catch (e) {} return reject(fatal); }
        decode.stdout.pause();
        const fr = acc.subarray(0, frameSize); acc = acc.subarray(frameSize);
        for (let i = 0; i < N; i++) { chw[i] = fr[i * 3] / 255; chw[N + i] = fr[i * 3 + 1] / 255; chw[2 * N + i] = fr[i * 3 + 2] / 255; }
        let out;
        try { out = await session.run({ src: new ort.Tensor('float32', chw, [1, 3, ph, pw]), r1i: rec[0], r2i: rec[1], r3i: rec[2], r4i: rec[3], downsample_ratio: ratioT }); }
        catch (e) { fatal = e; return reject(e); }
        rec = [out.r1o, out.r2o, out.r3o, out.r4o];
        const pha = out.pha.data; const gray = Buffer.allocUnsafe(N);
        for (let i = 0; i < N; i++) { const v = pha[i] * 255; gray[i] = v < 0 ? 0 : v > 255 ? 255 : v; }
        frames++;
        if (frames % 3 === 0 || frames === 1) onProgress({ percent: Math.min(70, Math.round(frames / totalFrames * 70)), stage: `Détourage IA (${frames}/${totalFrames})` });
        if (!aenc.stdin.write(gray)) await drain(aenc.stdin);
        decode.stdout.resume();
      }
    });
    decode.stdout.on('end', () => { try { aenc.stdin.end(); } catch (e) {} });
    decode.on('error', reject); aenc.on('error', reject);
    aenc.on('close', () => fatal ? reject(fatal) : resolve());
  });
  if (frames === 0) throw new Error('Aucune frame traitée (vidéo illisible ?).');

  // ── Stage B: composite ──
  onProgress({ percent: 72, stage: 'Composition' });
  const outDir = opts.preview ? os.tmpdir() : ((job.outputDir && fs.existsSync(job.outputDir)) ? job.outputDir : path.dirname(job.inputPath));
  const cOpts = { mode: opts.preview ? (job.mode === 'transparent' ? 'transparent' : job.mode) : job.mode, color: job.color, bgImage: job.bgImage, transparentFormat: job.transparentFormat || 'webm', blurStrength: job.blurStrength, choke: job.choke, feather: job.feather, hasAudio: !!meta.hasAudio, fps, outputDir: outDir };
  let outputPath = opts.preview ? path.join(os.tmpdir(), `orbit_rvm_preview_${Date.now()}.${job.mode === 'transparent' && (job.transparentFormat === 'prores') ? 'mov' : job.mode === 'transparent' ? 'webm' : 'mp4'}`) : matting.outputPathFor(job.inputPath, job.mode, job.transparentFormat || 'webm', outDir);
  const cArgs = matting.compositeArgs(input, alphaPath, W, H, cOpts, outputPath);
  await new Promise((resolve, reject) => {
    const cp = spawn(ff, cArgs, { windowsHide: true }); reg(cp);
    let log = '';
    const ond = d => { const s = d.toString(); log += s; const tm = s.match(/time=(\d+):(\d+):(\d+\.\d+)/); if (tm && meta.duration > 0) { const sec = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3]); onProgress({ percent: Math.min(99, 72 + Math.round(sec / meta.duration * 27)), stage: 'Composition' }); } };
    cp.stdout.on('data', ond); cp.stderr.on('data', ond);
    cp.on('error', reject);
    cp.on('close', c => { if (isCancelled()) return reject(new Error('cancelled')); c === 0 ? resolve() : reject(new Error('Composition échouée (code ' + c + ')\n' + log.slice(-300))); });
  });

  for (const t of tmpFiles) { try { fs.unlinkSync(t); } catch (e) {} }
  const checkPath = outputPath.includes('%05d') ? outputPath.replace('%05d', '00001') : outputPath;
  if (!fs.existsSync(checkPath)) throw new Error('Sortie non générée.');
  return { outputPath };
}

ipcMain.handle('matting-preview', async (e, job) => {
  try { return await runMatting(job, { preview: job.preview || { start: 0, duration: 3 } }); }
  catch (er) { return { error: 'Aperçu impossible : ' + (er && er.message) }; }
});

ipcMain.on('matting-start', async (event, job) => {
  const win = uiWin();
  const id = job.id;
  const sendP = (d) => win?.webContents.send('matting-progress', { id, ...d });
  const sendErr = (msg) => win?.webContents.send('matting-error', { id, error: msg });
  const sendDone = (d) => win?.webContents.send('matting-complete', { id, ...d });
  let cancelled = false; const procs = new Set();
  activeDownloads.set(id, { kill: () => { cancelled = true; for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } } });
  try {
    const r = await runMatting(job, {
      onProgress: (d) => sendP(d), onLog: (m) => sendP({ log: m }),
      isCancelled: () => cancelled, registerProc: (p) => procs.add(p),
    });
    activeDownloads.delete(id);
    if (cancelled) return sendErr('Annulé par l\'utilisateur.');
    sendP({ percent: 100, stage: 'Terminé' });
    sendDone({ outputPath: r.outputPath });
    try { let gs = {}; try { gs = JSON.parse(fs.readFileSync(path.join(ORBIT_DIR, 'settings.json'), 'utf8')); } catch (e) {} if (gs.notifications) { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title: 'Orbit — Détourage terminé', body: path.basename(r.outputPath) }).show(); } } catch (e) {}
    if (job.whenDone === 'open') { try { shell.showItemInFolder(r.outputPath); } catch (e) {} }
  } catch (e) {
    activeDownloads.delete(id);
    const msg = (e && e.message) || String(e);
    if (/cancelled/i.test(msg)) return sendErr('Annulé par l\'utilisateur.');
    sendErr('Échec : ' + msg);
  }
});

// ─── Gomme magique IA · suppression d'objet (LaMa · ONNX, local & gratuit) ─────
const LAMA_DIR = path.join(ORBIT_DIR, 'modules', 'lama');
const SD_DIR = path.join(ORBIT_DIR, 'modules', 'sd-inpaint');

async function installLamaModel(onLog) {
  if (!fs.existsSync(LAMA_DIR)) fs.mkdirSync(LAMA_DIR, { recursive: true });
  const dest = path.join(LAMA_DIR, inpaint.LAMA.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= inpaint.LAMA.minBytes) return dest;
  onLog && onLog('Téléchargement du moteur LaMa (~200 Mo, première utilisation)…');
  await new Promise((resolve, reject) => {
    const c = trackInstall(spawn('curl', ['-L', '--output', dest, '--progress-bar', '--retry', '3', inpaint.LAMA.url]));
    c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
    c.stderr.on('data', d => { const s = d.toString().trim(); if (s) onLog && onLog('LaMa: ' + s.replace(/\r/g, '').split('\n').pop()); });
    c.on('close', code => code === 0 ? resolve() : reject(new Error(code === null ? 'Annulé' : 'Téléchargement échoué (curl ' + code + ')')));
  });
  if (!fs.existsSync(dest) || fs.statSync(dest).size < inpaint.LAMA.minBytes) { try { fs.unlinkSync(dest); } catch (e) {} throw new Error('Modèle LaMa incomplet.'); }
  return dest;
}

// Decode any image to a raw pixel Buffer at an exact size via ffmpeg.
function ffDecodeRaw(ff, input, w, h, pix, crop) {
  const vf = (crop ? crop + ',' : '') + `scale=${w}:${h}:flags=bilinear`;
  return new Promise((resolve, reject) => {
    const p = spawn(ff, ['-hide_banner', '-nostdin', '-i', input, '-vf', vf, '-f', 'rawvideo', '-pix_fmt', pix, 'pipe:1'], { windowsHide: true });
    const chunks = []; let err = '';
    p.stdout.on('data', d => chunks.push(d)); p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', c => c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('décodage image (' + c + ')')));
  });
}
function ffEncodeRaw(ff, buf, w, h, pix, outPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(ff, ['-hide_banner', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', pix, '-s', `${w}x${h}`, '-i', 'pipe:0', outPath], { windowsHide: true });
    let err = ''; p.stderr.on('data', d => err += d); p.on('error', reject);
    p.on('close', c => c === 0 ? resolve() : reject(new Error('encodage image (' + c + ')')));
    p.stdin.on('error', () => {}); p.stdin.write(buf); p.stdin.end();
  });
}
const _byte = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

ipcMain.handle('inpaint-detect', async () => {
  let ready = false, err = null;
  try { getOrt(); ready = true; } catch (e) { err = (e && e.message) || String(e); }
  let installed = false, size = 0;
  try { const d = path.join(LAMA_DIR, inpaint.LAMA.file); const st = fs.statSync(d); size = st.size; installed = fs.existsSync(d) && st.size >= inpaint.LAMA.minBytes; } catch (e) {}
  return { ready, err, installed, size };
});

ipcMain.handle('inpaint-install', async () => {
  const win = uiWin();
  try { await installLamaModel(m => win?.webContents.send('inpaint-progress', { stage: m })); return { ok: true }; }
  catch (er) { return { ok: false, error: er.message }; }
});

ipcMain.handle('inpaint-run', async (e, params = {}) => {
  const win = uiWin();
  const prog = (stage) => win?.webContents.send('inpaint-progress', { stage });
  const tmp = [];
  try {
    const eng = enhanceLib.detectEngines(ORBIT_DIR);
    if (!eng.ffmpeg) return { error: 'ffmpeg introuvable.' };
    const ff = eng.ffmpeg;
    const imagePath = params.imagePath;
    if (!imagePath || !fs.existsSync(imagePath)) return { error: 'Image introuvable.' };
    if (!params.maskPng) return { error: 'Sélectionne d\'abord une zone avec le pinceau.' };

    const meta = await enhanceProbe(ff, imagePath);
    const W = meta.width, H = meta.height;
    if (!W || !H) return { error: 'Image illisible.' };

    // Write the painted mask (PNG data URL) to a temp file.
    const maskB64 = String(params.maskPng).replace(/^data:image\/\w+;base64,/, '');
    const maskTmp = path.join(os.tmpdir(), `orbit_mask_${Date.now()}.png`); tmp.push(maskTmp);
    fs.writeFileSync(maskTmp, Buffer.from(maskB64, 'base64'));

    // Shared output target — dedicated, writable subfolder.
    let outDir = path.join(usableDownloadDir(params.outputDir), IMAGEGEN_DIR_NAME);
    try { fs.mkdirSync(outDir, { recursive: true }); } catch (e2) { outDir = usableDownloadDir(params.outputDir); }
    const base = path.basename(imagePath, path.extname(imagePath));
    const finalPath = path.join(outDir, `${base}-retouche-${Date.now().toString(36)}.png`);

    const prompt = (params.prompt || '').trim();

    // ── Mode « Ajouter / Remplacer » : prompt fourni → inpainting Stable Diffusion local ──
    // Contrairement au texte→image, l'inpainting conditionne le UNet sur la PHOTO
    // (latent de l'image masquée + canal masque), donc le rendu comprend la scène
    // et se fond dedans au lieu d'inventer une image aléatoire. 100% local, hors-ligne.
    if (prompt) {
      const ort = getOrt();
      prog('Analyse de la zone…');
      const mRaw = await ffDecodeRaw(ff, maskTmp, W, H, 'gray');
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) { if (mRaw[row + x] > 127) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } } }
      if (maxX < 0) return { error: 'Aucune zone sélectionnée — peins la zone à générer.' };
      const bw0 = maxX - minX + 1, bh0 = maxY - minY + 1;

      // Work window: bbox + context, made square (SD runs 512×512), clamped to image.
      const padBase = Math.round(Math.max(bw0, bh0) * 0.35) + 32;
      let cx0 = Math.max(0, minX - padBase), cy0 = Math.max(0, minY - padBase);
      const cx1 = Math.min(W, maxX + padBase + 1), cy1 = Math.min(H, maxY + padBase + 1);
      let side = Math.min(Math.max(cx1 - cx0, cy1 - cy0), Math.min(W, H));
      const ccx = (cx0 + cx1) / 2, ccy = (cy0 + cy1) / 2;
      cx0 = Math.max(0, Math.min(W - side, Math.round(ccx - side / 2)));
      cy0 = Math.max(0, Math.min(H - side, Math.round(ccy - side / 2)));
      let cw = side, ch = side;
      cx0 -= cx0 % 2; cy0 -= cy0 % 2; cw -= cw % 2; ch -= ch % 2;
      if (cw < 8 || ch < 8) return { error: 'Zone trop petite.' };
      const cropStr = `crop=${cw}:${ch}:${cx0}:${cy0}`;

      // Auto-install the local SD engine on first use.
      if (!sdinpaint.sdInstalled(SD_DIR)) { prog('Installation du moteur SD local (~2,1 Go, première utilisation)…'); await sdinpaint.installSd(SD_DIR, m => prog(m)); }

      const seed = (params.seed != null && params.seed !== '') ? (parseInt(params.seed, 10) | 0) : ((Math.random() * 1e9) | 0);
      const genPrompt = (await toImagePrompt(prompt)) + ', photorealistic, natural lighting, highly detailed';
      prog('Génération IA locale… (préparation)');
      const sdBuf = await sdinpaint.runSdInpaint({
        ort, ff, ffDecodeRaw, modelDir: SD_DIR, imagePath, maskPath: maskTmp, cropStr,
        prompt: genPrompt, steps: 22, guidance: 7.5, seed,
        onStep: (i, n) => prog(`Génération IA locale (${sdinpaint.getDevice() === 'gpu' ? 'GPU' : 'CPU'})… ${i}/${n}`),
      });

      const S = sdinpaint.SIZE;
      const genTmp = path.join(os.tmpdir(), `orbit_sd_${Date.now()}.png`); tmp.push(genTmp);
      await ffEncodeRaw(ff, sdBuf, S, S, 'rgb24', genTmp);

      prog('Composition…');
      // Paste the generated window back, blended via the feathered mask so only the
      // painted pixels change and the join is invisible (unmasked stays identical).
      const feather = Math.max(6, Math.min(60, Math.round(Math.max(cw, ch) * 0.02)));
      await new Promise((resolve, reject) => {
        const args = ['-hide_banner', '-nostdin', '-y', '-i', imagePath, '-i', genTmp, '-i', maskTmp, '-filter_complex',
          `[0:v]format=rgb24,scale=${W}:${H},split=2[b1][b2];[1:v]scale=${cw}:${ch}:flags=lanczos,format=rgb24[gen];[b2][gen]overlay=${cx0}:${cy0}:format=auto[full];[2:v]format=gray,scale=${W}:${H},gblur=sigma=${feather}:steps=2[m];[full][m]alphamerge[fulla];[b1][fulla]overlay=format=auto[o]`,
          '-map', '[o]', finalPath];
        const p = spawn(ff, args, { windowsHide: true }); let log = '';
        p.stderr.on('data', d => log += d); p.on('error', reject);
        p.on('close', c => c === 0 ? resolve() : reject(new Error('composition (' + c + ')\n' + log.slice(-300))));
      });
      for (const f of tmp) { try { fs.unlinkSync(f); } catch (e) {} }
      if (!fs.existsSync(finalPath)) return { error: 'Sortie non générée.' };
      const gb = fs.readFileSync(finalPath);
      return { ok: true, path: finalPath, dataUrl: 'data:image/png;base64,' + gb.toString('base64'), width: W, height: H };
    }

    // ── Mode « Effacer » : LaMa, recadrage haute résolution ──
    // LaMa a une entrée fixe 512×512. Plutôt que d'écraser TOUTE l'image en 512,
    // on recadre une fenêtre autour de l'objet (avec contexte), on l'inpainte en
    // 512, puis on la replace en pleine résolution → bien plus net dans la zone.
    const ort = getOrt();
    prog('Préparation du moteur…');
    const modelPath = await installLamaModel(m => prog(m));
    const S = inpaint.LAMA.size || 512;

    prog('Analyse de la zone…');
    const mFull = await ffDecodeRaw(ff, maskTmp, W, H, 'gray');
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) { if (mFull[row + x] > 127) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } } }
    if (maxX < 0) return { error: 'Aucune zone sélectionnée — peins sur l\'objet à effacer.' };
    const bw0 = maxX - minX + 1, bh0 = maxY - minY + 1;
    // Context window around the object (LaMa needs surroundings to rebuild well).
    const pad = Math.round(Math.max(bw0, bh0) * 0.7) + 24;
    let cx0 = Math.max(0, minX - pad), cy0 = Math.max(0, minY - pad);
    const cx1 = Math.min(W, maxX + pad + 1), cy1 = Math.min(H, maxY + pad + 1);
    cx0 -= cx0 % 2; cy0 -= cy0 % 2;
    let cw = cx1 - cx0, ch = cy1 - cy0; cw -= cw % 2; ch -= ch % 2;
    if (cw < 8 || ch < 8) return { error: 'Zone trop petite.' };
    const cropStr = `crop=${cw}:${ch}:${cx0}:${cy0}`;

    prog('Reconstruction IA…');
    const N = S * S;
    const imgRaw = await ffDecodeRaw(ff, imagePath, S, S, 'rgb24', cropStr);
    const maskRaw = await ffDecodeRaw(ff, maskTmp, S, S, 'gray', cropStr);
    if (imgRaw.length < 3 * N || maskRaw.length < N) return { error: 'Décodage incomplet de l\'image.' };

    // CHW float tensors. LaMa: image in [0,1], mask binary (1 = à reconstruire).
    const img = new Float32Array(3 * N);
    for (let i = 0; i < N; i++) { img[i] = imgRaw[i * 3] / 255; img[N + i] = imgRaw[i * 3 + 1] / 255; img[2 * N + i] = imgRaw[i * 3 + 2] / 255; }
    const mask = new Float32Array(N);
    let painted = 0;
    for (let i = 0; i < N; i++) { const v = maskRaw[i] > 127 ? 1 : 0; mask[i] = v; painted += v; }
    if (!painted) return { error: 'Aucune zone sélectionnée — peins sur l\'objet à effacer.' };

    const session = await ort.InferenceSession.create(modelPath);
    const inNames = session.inputNames || [];
    const outNames = session.outputNames || [];
    if (inNames.length < 2 || !outNames.length) return { error: 'Modèle LaMa inattendu.' };
    let maskName = inNames.find(n => /mask/i.test(n));
    let imgName = inNames.find(n => /image|img|src|input/i.test(n) && !/mask/i.test(n));
    if (!imgName) imgName = inNames.find(n => n !== maskName) || inNames[0];
    if (!maskName) maskName = inNames.find(n => n !== imgName) || inNames[1];
    const feeds = {};
    feeds[imgName] = new ort.Tensor('float32', img, [1, 3, S, S]);
    feeds[maskName] = new ort.Tensor('float32', mask, [1, 1, S, S]);
    const out = await session.run(feeds);
    const od = out[outNames[0]].data;
    if (!od || od.length < 3 * N) return { error: 'Sortie du modèle invalide.' };
    let mx = 0; for (let i = 0; i < od.length; i += 1009) if (od[i] > mx) mx = od[i];
    const sc = mx <= 1.5 ? 255 : 1;
    const outBuf = Buffer.allocUnsafe(3 * N);
    for (let i = 0; i < N; i++) { outBuf[i * 3] = _byte(od[i] * sc); outBuf[i * 3 + 1] = _byte(od[N + i] * sc); outBuf[i * 3 + 2] = _byte(od[2 * N + i] * sc); }
    const inpaintedTmp = path.join(os.tmpdir(), `orbit_inpaint_${Date.now()}.png`); tmp.push(inpaintedTmp);
    await ffEncodeRaw(ff, outBuf, S, S, 'rgb24', inpaintedTmp);

    prog('Finalisation…');
    // Paste the inpainted window back at full resolution, blended with a feather
    // so only the painted region changes and the join is invisible.
    const fE = Math.max(3, Math.min(40, Math.round(Math.max(cw, ch) * 0.03)));
    await new Promise((resolve, reject) => {
      const args = ['-hide_banner', '-nostdin', '-y', '-i', imagePath, '-i', inpaintedTmp, '-i', maskTmp, '-filter_complex',
        `[0:v]format=rgb24,scale=${W}:${H},split=2[b1][b2];[1:v]scale=${cw}:${ch}:flags=lanczos,format=rgb24[gen];[b2][gen]overlay=${cx0}:${cy0}:format=auto[full];[2:v]format=gray,scale=${W}:${H},gblur=sigma=${fE}:steps=2[m];[full][m]alphamerge[fulla];[b1][fulla]overlay=format=auto[o]`,
        '-map', '[o]', finalPath];
      const p = spawn(ff, args, { windowsHide: true }); let log = '';
      p.stderr.on('data', d => log += d); p.on('error', reject);
      p.on('close', c => c === 0 ? resolve() : reject(new Error('composition (' + c + ')\n' + log.slice(-300))));
    });

    for (const f of tmp) { try { fs.unlinkSync(f); } catch (e) {} }
    if (!fs.existsSync(finalPath)) return { error: 'Sortie non générée.' };
    const buf = fs.readFileSync(finalPath);
    return { ok: true, path: finalPath, dataUrl: 'data:image/png;base64,' + buf.toString('base64'), width: W, height: H };
  } catch (err) {
    for (const f of tmp) { try { fs.unlinkSync(f); } catch (e) {} }
    const msg = (err && err.message) || String(err);
    let hint = '';
    if (/out of memory|alloc|bad_alloc/i.test(msg)) hint = ' — réduis la résolution de traitement.';
    return { error: 'Échec : ' + msg + hint };
  }
});

// ─── Sélection intelligente (SAM · clic → masque, local & gratuit) ─────────────
const SAM_DIR = path.join(ORBIT_DIR, 'modules', 'sam');
let _samEnc = null, _samDec = null, _samEmb = null; // cached encoder/decoder + last image embeddings

async function installSam(onLog) {
  if (!fs.existsSync(SAM_DIR)) fs.mkdirSync(SAM_DIR, { recursive: true });
  const enc = path.join(SAM_DIR, sam.SAM.encFile), dec = path.join(SAM_DIR, sam.SAM.decFile);
  const need = [];
  if (!(fs.existsSync(enc) && fs.statSync(enc).size >= sam.SAM.encMin)) need.push([sam.SAM.encUrl, enc, 'encodeur']);
  if (!(fs.existsSync(dec) && fs.statSync(dec).size >= sam.SAM.decMin)) need.push([sam.SAM.decUrl, dec, 'décodeur']);
  for (const [url, dst, label] of need) {
    onLog && onLog(`Téléchargement du moteur de sélection IA (${label}, ~40 Mo)…`);
    await new Promise((resolve, reject) => {
      const c = spawn('curl', ['-L', '--output', dst, '--progress-bar', '--retry', '3', url]);
      c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
      c.on('close', code => code === 0 ? resolve() : reject(new Error('Téléchargement échoué (curl ' + code + ')')));
    });
    if (!fs.existsSync(dst) || fs.statSync(dst).size < 1024 * 1024) { try { fs.unlinkSync(dst); } catch (e) {} throw new Error('Modèle SAM incomplet.'); }
  }
  return { enc, dec };
}

ipcMain.handle('sam-detect', async () => {
  let ready = false, err = null;
  try { getOrt(); ready = true; } catch (e) { err = (e && e.message) || String(e); }
  let installed = false;
  try {
    const enc = path.join(SAM_DIR, sam.SAM.encFile), dec = path.join(SAM_DIR, sam.SAM.decFile);
    installed = fs.existsSync(enc) && fs.existsSync(dec) && fs.statSync(enc).size >= sam.SAM.encMin && fs.statSync(dec).size >= sam.SAM.decMin;
  } catch (e) {}
  return { ready, err, installed };
});

// Run the encoder once for an image and cache its embeddings.
ipcMain.handle('sam-embed', async (e, params = {}) => {
  const win = uiWin(); const prog = (s) => win?.webContents.send('sam-progress', { stage: s });
  try {
    const ort = getOrt();
    const eng = enhanceLib.detectEngines(ORBIT_DIR);
    if (!eng.ffmpeg) return { error: 'ffmpeg introuvable.' };
    const ff = eng.ffmpeg;
    const imagePath = params.imagePath;
    if (!imagePath || !fs.existsSync(imagePath)) return { error: 'Image introuvable.' };
    prog('Préparation du moteur de sélection…');
    const { enc, dec } = await installSam(m => prog(m));
    if (!_samEnc) _samEnc = await ort.InferenceSession.create(enc);
    if (!_samDec) _samDec = await ort.InferenceSession.create(dec);
    const meta = await enhanceProbe(ff, imagePath);
    const W = meta.width, H = meta.height;
    if (!W || !H) return { error: 'Image illisible.' };
    const key = imagePath + '|' + (() => { try { return fs.statSync(imagePath).mtimeMs; } catch (e) { return 0; } })();
    if (_samEmb && _samEmb.key === key) return { ok: true, W, H, cached: true };
    prog('Analyse de l\'image…');
    const T = sam.SAM.size, s = T / Math.max(W, H), rw = Math.max(1, Math.round(W * s)), rh = Math.max(1, Math.round(H * s));
    const raw = await ffDecodeRaw(ff, imagePath, rw, rh, 'rgb24');
    const pv = new Float32Array(3 * T * T); const { mean, std } = sam.SAM;
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) { const o = (y * rw + x) * 3; for (let c = 0; c < 3; c++) pv[c * T * T + y * T + x] = ((raw[o + c] / 255) - mean[c]) / std[c]; }
    const out = await _samEnc.run({ pixel_values: new ort.Tensor('float32', pv, [1, 3, T, T]) });
    _samEmb = { key, image_embeddings: out.image_embeddings, image_positional_embeddings: out.image_positional_embeddings, W, H, s, rw, rh };
    return { ok: true, W, H };
  } catch (err) { return { error: 'Sélection IA : ' + ((err && err.message) || String(err)) }; }
});

// Decode a mask from accumulated click points (label 1 = inclure, 0 = exclure).
ipcMain.handle('sam-points', async (e, params = {}) => {
  try {
    const ort = getOrt();
    const eng = enhanceLib.detectEngines(ORBIT_DIR);
    const ff = eng.ffmpeg;
    if (!_samEmb || !_samDec) return { error: 'Analyse l\'image d\'abord (clique dessus).' };
    const pts = params.points || [];
    if (!pts.length) return { error: 'Aucun point.' };
    const { s, rw, rh, W, H } = _samEmb;
    const np = pts.length;
    const pcoords = new Float32Array(np * 2);
    const plabels = new BigInt64Array(np);
    for (let i = 0; i < np; i++) { pcoords[i * 2] = pts[i].x * s; pcoords[i * 2 + 1] = pts[i].y * s; plabels[i] = BigInt(pts[i].label != null ? pts[i].label : 1); }
    const d = await _samDec.run({
      input_points: new ort.Tensor('float32', pcoords, [1, 1, np, 2]),
      input_labels: new ort.Tensor('int64', plabels, [1, 1, np]),
      image_embeddings: _samEmb.image_embeddings,
      image_positional_embeddings: _samEmb.image_positional_embeddings,
    });
    const iou = d.iou_scores.data; let bi = 0; for (let i = 1; i < iou.length; i++) if (iou[i] > iou[bi]) bi = i;
    const M = 256, md = d.pred_masks.data, off = bi * M * M;
    const gray = Buffer.allocUnsafe(M * M);
    let fg = 0;
    for (let i = 0; i < M * M; i++) { const v = md[off + i] > 0 ? 255 : 0; gray[i] = v; if (v) fg++; }
    if (!fg) return { error: 'Aucun objet détecté ici — clique en plein sur l\'objet.' };
    const maskTmp = path.join(os.tmpdir(), `orbit_sammask_${Date.now()}.png`);
    await ffEncodeRaw(ff, gray, M, M, 'gray', maskTmp);
    // 256 mask → 1024 input space → crop the resized (unpadded) region → original size.
    const outPng = path.join(os.tmpdir(), `orbit_sammask_full_${Date.now()}.png`);
    await new Promise((resolve, reject) => {
      const p = spawn(ff, ['-hide_banner', '-nostdin', '-y', '-i', maskTmp, '-vf', `scale=1024:1024:flags=bilinear,crop=${rw}:${rh}:0:0,scale=${W}:${H}:flags=bilinear`, outPng], { windowsHide: true });
      let lg = ''; p.stderr.on('data', x => lg += x); p.on('error', reject);
      p.on('close', c => c === 0 ? resolve() : reject(new Error('mask resize ' + c)));
    });
    const buf = fs.readFileSync(outPng);
    try { fs.unlinkSync(maskTmp); fs.unlinkSync(outPng); } catch (e) {}
    return { ok: true, mask: 'data:image/png;base64,' + buf.toString('base64'), width: W, height: H };
  } catch (err) { return { error: 'Sélection : ' + ((err && err.message) || String(err)) }; }
});

// ─── Détection automatique d'objets (YOLOv8, local & gratuit) ──────────────────
const YOLO_DIR = path.join(ORBIT_DIR, 'modules', 'yolo');
let _yolo = null;

async function installYolo(onLog) {
  if (!fs.existsSync(YOLO_DIR)) fs.mkdirSync(YOLO_DIR, { recursive: true });
  const dest = path.join(YOLO_DIR, yolo.YOLO.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= yolo.YOLO.minBytes) return dest;
  let lastErr = null;
  for (const url of yolo.YOLO.urls) {
    try {
      onLog && onLog('Téléchargement du modèle de détection (~13 Mo)…');
      await new Promise((resolve, reject) => {
        const c = spawn('curl', ['-L', '--output', dest, '--progress-bar', '--retry', '2', url]);
        c.on('error', e => reject(new Error('curl ' + e.message)));
        c.on('close', code => code === 0 ? resolve() : reject(new Error('curl ' + code)));
      });
      if (fs.existsSync(dest) && fs.statSync(dest).size >= yolo.YOLO.minBytes) return dest;
    } catch (e) { lastErr = e; }
  }
  try { fs.unlinkSync(dest); } catch (e) {}
  throw new Error('Téléchargement du modèle de détection échoué' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

ipcMain.handle('yolo-detect', async (e, params = {}) => {
  const win = uiWin(); const prog = (s) => win?.webContents.send('sam-progress', { stage: s });
  try {
    const ort = getOrt();
    const eng = enhanceLib.detectEngines(ORBIT_DIR);
    if (!eng.ffmpeg) return { error: 'ffmpeg introuvable.' };
    const ff = eng.ffmpeg;
    const imagePath = params.imagePath;
    if (!imagePath || !fs.existsSync(imagePath)) return { error: 'Image introuvable.' };
    prog('Préparation de la détection…');
    const modelPath = await installYolo(m => prog(m));
    if (!_yolo) _yolo = await ort.InferenceSession.create(modelPath);
    const meta = await enhanceProbe(ff, imagePath);
    const W = meta.width, H = meta.height;
    if (!W || !H) return { error: 'Image illisible.' };
    prog('Détection des objets…');
    const S = yolo.YOLO.size;
    const r = Math.min(S / W, S / H), nw = Math.round(W * r), nh = Math.round(H * r);
    const px = Math.floor((S - nw) / 2), py = Math.floor((S - nh) / 2);
    // Letterbox to S×S (centred, black padding) → raw rgb.
    const raw = await new Promise((resolve, reject) => {
      const p = spawn(ff, ['-hide_banner', '-nostdin', '-i', imagePath, '-vf', `scale=${nw}:${nh},pad=${S}:${S}:${px}:${py}:color=black`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
      const c = []; p.stdout.on('data', d => c.push(d)); p.on('error', reject);
      p.on('close', x => x === 0 ? resolve(Buffer.concat(c)) : reject(new Error('décodage ' + x)));
    });
    const inp = new Float32Array(3 * S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const o = (y * S + x) * 3; inp[y * S + x] = raw[o] / 255; inp[S * S + y * S + x] = raw[o + 1] / 255; inp[2 * S * S + y * S + x] = raw[o + 2] / 255; }
    const out = await _yolo.run({ images: new ort.Tensor('float32', inp, [1, 3, S, S]) });
    const o = out[_yolo.outputNames[0]];
    const cols = o.dims[2], rows = o.dims[1], d = o.data, nc = rows - 4;
    const conf = params.conf != null ? params.conf : 0.3;
    let dets = [];
    for (let i = 0; i < cols; i++) {
      let best = 0, bc = 0;
      for (let c = 0; c < nc; c++) { const v = d[(4 + c) * cols + i]; if (v > best) { best = v; bc = c; } }
      if (best < conf) continue;
      const cx = d[i], cy = d[cols + i], ww = d[2 * cols + i], hh = d[3 * cols + i];
      const x = (cx - ww / 2 - px) / r, y = (cy - hh / 2 - py) / r, bw = ww / r, bh = hh / r;
      const label = yolo.COCO[bc] || ('obj' + bc);
      dets.push({ label, labelFr: yolo.COCO_FR[label] || label, score: best, box: [Math.max(0, x), Math.max(0, y), bw, bh] });
    }
    dets = yolo.nms(dets, 0.45).slice(0, 50);
    return { ok: true, detections: dets, width: W, height: H };
  } catch (err) { return { error: 'Détection : ' + ((err && err.message) || String(err)) }; }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Discloud — stockage de fichiers sur Discord (webhook + AES-256)
// ─────────────────────────────────────────────────────────────────────────────
const discloud = require('./discloud.js');
const licensing = require('./license.js');   // licence Premium (vérif Ed25519 hors-ligne)
const tgm = require('./telegram-mtproto.js');   // backend Telegram MTProto (compte perso, sans bot)
const DISCLOUD_DIR = path.join(ORBIT_DIR, 'discloud');
tgm.init(DISCLOUD_DIR);
// Clé de chiffrement dérivée de la phrase secrète, gardée en mémoire le temps
// de la session uniquement (jamais écrite sur le disque).
let discloudKey = null;
const discloudCancelled = new Set();

// ── Licence Premium ──────────────────────────────────────────────────────────
ipcMain.handle('license-status', () => licensing.getStatus());
ipcMain.handle('license-activate', (e, { key } = {}) => licensing.activate(key));
ipcMain.handle('license-deactivate', () => licensing.clearLicense());
// Nombre de blocs envoyés/téléchargés en parallèle. Plus = plus rapide, mais
// Discord limite le débit par webhook (429) — 6 est un bon compromis vitesse/stabilité.
const DISCLOUD_CONCURRENCY = 6;

function discloudEmit(payload) { uiWin()?.webContents.send('discloud-progress', payload); }
function discloudCtx() {
  const cfg = discloud.loadConfig(DISCLOUD_DIR);
  if (!cfg.webhook) { const e = new Error('Discloud non configuré.'); e.code = 'unconfigured'; throw e; }
  if (!discloudKey) { const e = new Error('verrouillé'); e.code = 'locked'; throw e; }
  return cfg;
}
// Tous les descendants (dossier inclus) d'un nœud, le nœud lui-même en premier.
function discloudDescendants(nodes, id) {
  const out = [];
  const walk = (nid) => { const n = nodes.find(x => x.id === nid); if (!n) return; out.push(n); nodes.filter(x => x.parent === nid).forEach(c => walk(c.id)); };
  walk(id);
  return out;
}

ipcMain.handle('discloud-status', () => {
  const cfg = discloud.loadConfig(DISCLOUD_DIR);
  const wh = cfg.webhook || '';
  return {
    configured: !!cfg.webhook,
    encrypted: !!cfg.verifier,
    unlocked: !!discloudKey,
    webhookMasked: wh ? wh.replace(/\/[\w-]+$/, '/••••••' + wh.slice(-4)) : '',
  };
});

ipcMain.handle('discloud-setup', (e, { webhook, passphrase } = {}) => {
  webhook = String(webhook || '').trim();
  if (!discloud.isValidWebhook(webhook)) return { ok: false, error: 'URL de webhook Discord invalide.' };
  if (!passphrase || String(passphrase).length < 4) return { ok: false, error: 'Phrase secrète trop courte (4 caractères minimum).' };
  const salt = require('crypto').randomBytes(16).toString('hex');
  const key = discloud.deriveKey(passphrase, salt);
  const cfg = { webhook, salt, verifier: discloud.makeVerifier(key), encrypted: true, createdAt: Date.now() };
  discloud.saveConfig(DISCLOUD_DIR, cfg);
  discloudKey = key;
  return { ok: true };
});

ipcMain.handle('discloud-unlock', (e, { passphrase } = {}) => {
  const cfg = discloud.loadConfig(DISCLOUD_DIR);
  if (!cfg.salt || !cfg.verifier) return { ok: false, error: 'Discloud non configuré.' };
  const key = discloud.deriveKey(passphrase, cfg.salt);
  if (!discloud.checkVerifier(key, cfg.verifier)) return { ok: false, error: 'Phrase secrète incorrecte.' };
  discloudKey = key;
  return { ok: true };
});

ipcMain.handle('discloud-lock', () => { discloudKey = null; return { ok: true }; });

ipcMain.handle('discloud-index', () => discloud.loadIndex(DISCLOUD_DIR).nodes || []);

ipcMain.handle('discloud-mkdir', (e, { name, parent } = {}) => {
  const idx = discloud.loadIndex(DISCLOUD_DIR);
  const node = { id: discloud.uuid(), type: 'folder', name: String(name || 'Dossier').trim() || 'Dossier', parent: parent || null, createdAt: Date.now() };
  idx.nodes.push(node);
  discloud.saveIndex(DISCLOUD_DIR, idx);
  return idx.nodes;
});

ipcMain.handle('discloud-rename', (e, { id, name } = {}) => {
  const idx = discloud.loadIndex(DISCLOUD_DIR);
  const n = idx.nodes.find(x => x.id === id);
  if (n) { n.name = String(name || n.name).trim() || n.name; discloud.saveIndex(DISCLOUD_DIR, idx); }
  return idx.nodes;
});

ipcMain.handle('discloud-pick-files', async () => {
  const r = await dialog.showOpenDialog(uiWin(), { properties: ['openFile', 'multiSelections'], title: 'Fichiers à envoyer sur Discord' });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.on('discloud-cancel', (e, jobId) => { if (jobId) discloudCancelled.add(jobId); });

ipcMain.handle('discloud-upload', async (e, { paths, parent, jobId } = {}) => {
  let cfg;
  try { cfg = discloudCtx(); } catch (er) { return { ok: false, error: er.message, code: er.code }; }
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return { ok: false, error: 'Aucun fichier.' };
  jobId = jobId || discloud.uuid();
  const webhook = cfg.webhook;
  try {
    for (let fi = 0; fi < paths.length; fi++) {
      const filePath = paths[fi];
      const stat = fs.statSync(filePath);
      const name = path.basename(filePath);
      const total = stat.size;
      // Récupère l'icône native du fichier (Blender, Word, Excel…) telle que
      // Windows l'affiche, pour la montrer dans le Drive après l'envoi.
      let icon = null;
      try { const img = await app.getFileIcon(filePath, { size: 'normal' }); if (img && !img.isEmpty()) icon = img.toDataURL(); } catch (x) {}
      const numChunks = Math.max(1, Math.ceil(total / discloud.CHUNK_SIZE));
      const fh = await fs.promises.open(filePath, 'r');
      const chunks = new Array(numChunks);   // gardé dans l'ordre malgré le parallélisme
      let uploaded = 0, doneCount = 0;
      try {
        // Plusieurs blocs envoyés en parallèle : c'est ce qui accélère le transfert.
        await discloud.runPool(numChunks, DISCLOUD_CONCURRENCY, async (i) => {
          if (discloudCancelled.has(jobId)) throw new Error('Annulé');
          const len = Math.min(discloud.CHUNK_SIZE, total - i * discloud.CHUNK_SIZE);
          const buf = Buffer.allocUnsafe(len);
          if (len > 0) await fh.read(buf, 0, len, i * discloud.CHUNK_SIZE);
          const payload = discloud.encryptBuffer(discloudKey, buf);
          const r = await discloud.webhookUpload(webhook, `${name}.part${i}.orb`, payload);
          chunks[i] = { messageId: r.messageId, size: len };
          uploaded += len; doneCount++;
          discloudEmit({ id: jobId, phase: 'upload', name, fileIndex: fi, fileCount: paths.length, percent: total ? Math.round((uploaded / total) * 100) : 100, chunk: doneCount, chunks: numChunks });
        });
      } finally { await fh.close(); }
      const idx = discloud.loadIndex(DISCLOUD_DIR);
      idx.nodes.push({ id: discloud.uuid(), type: 'file', name, parent: parent || null, size: total, encrypted: true, chunkSize: discloud.CHUNK_SIZE, chunks, icon, createdAt: Date.now() });
      discloud.saveIndex(DISCLOUD_DIR, idx);
    }
    discloudCancelled.delete(jobId);
    return { ok: true };
  } catch (er) {
    discloudCancelled.delete(jobId);
    return { ok: false, error: er.message };
  }
});

ipcMain.handle('discloud-download', async (e, { id, jobId } = {}) => {
  let cfg;
  try { cfg = discloudCtx(); } catch (er) { return { ok: false, error: er.message, code: er.code }; }
  const idx = discloud.loadIndex(DISCLOUD_DIR);
  const node = idx.nodes.find(x => x.id === id);
  if (!node || node.type !== 'file') return { ok: false, error: 'Fichier introuvable.' };
  const save = await dialog.showSaveDialog(uiWin(), { defaultPath: node.name, title: 'Enregistrer sous' });
  if (save.canceled || !save.filePath) return { ok: false, error: 'Annulé', cancelled: true };
  jobId = jobId || discloud.uuid();
  const webhook = cfg.webhook;
  const chunkSize = node.chunkSize || discloud.CHUNK_SIZE;
  // Fichier préalloué : chaque bloc est déchiffré puis écrit directement à son
  // offset, ce qui permet de télécharger plusieurs blocs en parallèle.
  const fh = await fs.promises.open(save.filePath, 'w');
  let done = 0, doneCount = 0;
  try {
    try { await fh.truncate(node.size || 0); } catch (x) {}
    await discloud.runPool(node.chunks.length, DISCLOUD_CONCURRENCY, async (i) => {
      if (discloudCancelled.has(jobId)) throw new Error('Annulé');
      const ch = node.chunks[i];
      const url = await discloud.webhookGetUrl(webhook, ch.messageId);
      const blob = await discloud.fetchBytes(url);
      const plain = node.encrypted ? discloud.decryptBuffer(discloudKey, blob) : blob;
      await fh.write(plain, 0, plain.length, i * chunkSize);
      done += ch.size; doneCount++;
      discloudEmit({ id: jobId, phase: 'download', name: node.name, percent: node.size ? Math.round((done / node.size) * 100) : 100, chunk: doneCount, chunks: node.chunks.length });
    });
    await fh.close();
    discloudCancelled.delete(jobId);
    return { ok: true, path: save.filePath };
  } catch (er) {
    discloudCancelled.delete(jobId);
    try { await fh.close(); } catch (x) {}
    try { fs.unlinkSync(save.filePath); } catch (x) {}
    return { ok: false, error: er.message };
  }
});

ipcMain.handle('discloud-delete', async (e, { id } = {}) => {
  let cfg;
  try { cfg = discloudCtx(); } catch (er) { return { ok: false, error: er.message, code: er.code }; }
  const idx = discloud.loadIndex(DISCLOUD_DIR);
  const toDelete = discloudDescendants(idx.nodes, id);
  const webhook = cfg.webhook;
  // Supprime les chunks côté Discord (best effort), puis purge l'index.
  for (const n of toDelete) {
    if (n.type !== 'file' || !n.chunks) continue;
    for (const ch of n.chunks) { try { await discloud.webhookDelete(webhook, ch.messageId); } catch (x) {} }
  }
  const ids = new Set(toDelete.map(n => n.id));
  idx.nodes = idx.nodes.filter(n => !ids.has(n.id));
  discloud.saveIndex(DISCLOUD_DIR, idx);
  return { ok: true, nodes: idx.nodes };
});

// ─────────────────────────────────────────────────────────────────────────────
//  Discloud CLOUD — Drive via serveur (comptes + pool de webhooks côté serveur)
//  Le contenu reste chiffré côté client : on chiffre/déchiffre ici, le serveur ne
//  voit que du chiffré. Le sel + verifier vivent sur le serveur (multi-appareils).
// ─────────────────────────────────────────────────────────────────────────────
const CLOUD_CFG = path.join(DISCLOUD_DIR, 'cloud.json');
let cloud = { server: '', token: '', email: '', admin: false };
try { cloud = { ...cloud, ...JSON.parse(fs.readFileSync(CLOUD_CFG, 'utf8')) }; } catch (e) {}
let cloudKey = null;
function saveCloud() { try { fs.mkdirSync(DISCLOUD_DIR, { recursive: true }); fs.writeFileSync(CLOUD_CFG, JSON.stringify(cloud)); } catch (e) {} }

function cloudBase() { if (!cloud.server) throw new Error('Serveur non configuré.'); return cloud.server.replace(/\/+$/, ''); }
async function cloudFetch(p, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cloud.token) headers['Authorization'] = 'Bearer ' + cloud.token;
  // Délai maximal par défaut : empêche un transfert de se figer indéfiniment si
  // le serveur (Render endormi) ou le réseau ne répond jamais. Le caller peut
  // fournir son propre signal (ex. cloudWake) pour gérer son propre délai.
  if (opts.signal) return fetch(cloudBase() + p, { ...opts, headers });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 90000);
  try { return await fetch(cloudBase() + p, { ...opts, headers, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}
async function cloudJson(p, opts = {}) {
  const res = await cloudFetch(p, opts);
  let body = null; try { body = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error((body && body.error) || ('Erreur serveur (HTTP ' + res.status + ')'));
  return body;
}
function cloudPost(p, obj) { return cloudJson(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }); }
// Concurrence des transferts en mode Cloud. C'est le SERVEUR qui la fixe
// (maxConcurrency dans /health), car en mode relais c'est sa RAM/CPU qui limite,
// pas le nombre de webhooks. Repli prudent si le serveur ne l'indique pas.
async function cloudConcurrency() {
  try {
    const r = await cloudFetch('/health'); const h = await r.json();
    const m = h && (h.maxConcurrency | 0);
    if (m > 0) return Math.max(2, Math.min(16, m));
    if (h && h.webhooks > 0) return Math.min(6, Math.max(3, h.webhooks)); // ancien serveur sans maxConcurrency
  } catch (e) {}
  return 4;
}

// Mode « direct » : récupère le pool de webhooks du serveur pour que l'app parle
// directement à Discord (le serveur ne relaie plus les octets → bien plus rapide,
// plus de limite RAM serveur / 502). Renvoie null si le serveur ne le supporte pas
// (ancien serveur) → on retombe alors sur le relais.
async function cloudWebhooks() {
  try {
    const w = await cloudJson('/api/drive/webhooks');
    if (w && Array.isArray(w.active)) return { active: w.active, all: w.all || {} };
  } catch (e) {}
  return null;
}
// En direct, c'est Discord qui limite (un envoi à la fois par webhook), plus la RAM
// du serveur : on peut donc paralléliser autant qu'il y a de webhooks (plafonné).
function directConcurrency(poolLen) { return Math.max(2, Math.min(poolLen || 1, 16)); }

// Config de stockage (mode direct multi-backend) : { provider, telegram, discord }.
// provider = backend ACTIF pour les nouveaux envois ; on peut lire d'anciens blocs
// des deux backends (chaque bloc connaît son provider). null si serveur trop ancien.
async function cloudStorage() {
  try {
    const s = await cloudJson('/api/drive/storage');
    if (s && s.provider) return s;
  } catch (e) {}
  // Repli : ancien serveur sans /storage → on tente le pool de webhooks.
  const w = await cloudWebhooks();
  if (w) return { provider: 'discord', telegram: null, discord: w };
  return null;
}

ipcMain.handle('discloud-cloud-status', () => ({ server: cloud.server, email: cloud.email, admin: !!cloud.admin, loggedIn: !!cloud.token, unlocked: !!cloudKey }));

ipcMain.handle('discloud-cloud-set-server', async (e, { server } = {}) => {
  server = String(server || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/.+/.test(server)) return { ok: false, error: 'URL de serveur invalide (http(s)://…).' };
  try {
    const res = await fetch(server + '/health');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const h = await res.json();
    cloud.server = server; saveCloud();
    return { ok: true, webhooks: h.webhooks, registration: h.registration };
  } catch (er) { return { ok: false, error: 'Serveur injoignable : ' + er.message }; }
});

ipcMain.handle('discloud-cloud-register', async (e, { email, password } = {}) => {
  try { const r = await cloudPost('/api/auth/register', { email, password }); cloud.token = r.token; cloud.email = r.email; cloud.admin = !!r.admin; saveCloud(); return { ok: true }; }
  catch (er) { return { ok: false, error: er.message }; }
});
ipcMain.handle('discloud-cloud-login', async (e, { email, password } = {}) => {
  try { const r = await cloudPost('/api/auth/login', { email, password }); cloud.token = r.token; cloud.email = r.email; cloud.admin = !!r.admin; saveCloud(); return { ok: true }; }
  catch (er) { return { ok: false, error: er.message }; }
});
ipcMain.handle('discloud-cloud-logout', () => { cloud.token = ''; cloud.email = ''; cloud.admin = false; cloudKey = null; saveCloud(); return { ok: true }; });

// ── Stockage Telegram (MTProto, compte perso, sans bot) ──────────────────────
ipcMain.handle('discloud-tg-status', () => tgm.status());
ipcMain.handle('discloud-tg-set-api', (e, { apiId, apiHash } = {}) => tgm.setApi(apiId, apiHash));
ipcMain.handle('discloud-tg-send-code', (e, { phone } = {}) => tgm.sendCode(phone));
ipcMain.handle('discloud-tg-sign-in', (e, { code } = {}) => tgm.signIn(code));
ipcMain.handle('discloud-tg-sign-in-password', (e, { password } = {}) => tgm.signInPassword(password));
ipcMain.handle('discloud-tg-logout', () => tgm.logout());

// ── Drop : partage de fichiers SANS compte (clé aléatoire dans le code) ───────
// Code = "<id>~<cléBase64url>". Upload/download passent par le serveur (proxy Discord).

// Réveille le serveur Render (endormi après ~15 min) avant un transfert, pour
// éviter un HTTP 502 sur la 1ʳᵉ requête. Attend jusqu'à ~60 s le démarrage à froid.
async function cloudWake() {
  for (let i = 0; i < 3; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 55000);
      try { const r = await cloudFetch('/health', { signal: ctrl.signal }); if (r.ok) return true; }
      finally { clearTimeout(timer); }
    } catch (e) {}
    await cloudSleep(1500);
  }
  return false;
}
// Envoi d'un bloc de drop, avec retries (502 = réveil Render, 429, réseau).
async function dropPostChunk(payload) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try {
      const form = new FormData();
      form.append('file', new Blob([payload]), 'd.orb');
      res = await cloudFetch('/api/drop/chunk', { method: 'POST', body: form });
    } catch (e) { lastErr = e; await cloudSleep(1500 * (attempt + 1)); continue; }
    if (res.ok) return res.json();
    if (res.status < 500 && res.status !== 429) { let b = null; try { b = await res.json(); } catch (x) {} throw new Error((b && b.error) || ('Envoi refusé (HTTP ' + res.status + ')')); }
    lastErr = new Error('Envoi refusé (HTTP ' + res.status + ')');
    await cloudSleep(1500 * (attempt + 1));
  }
  throw lastErr || new Error('Envoi du bloc échoué');
}
async function dropGetChunk(id, idx) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    let res;
    try { res = await cloudFetch('/api/drop/' + encodeURIComponent(id) + '/chunk/' + idx); }
    catch (e) { lastErr = e; await cloudSleep(1500 * (attempt + 1)); continue; }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status < 500 && res.status !== 429) throw new Error('Bloc indisponible (HTTP ' + res.status + ')');
    lastErr = new Error('Bloc indisponible (HTTP ' + res.status + ')');
    await cloudSleep(1500 * (attempt + 1));
  }
  throw lastErr || new Error('Téléchargement du bloc échoué');
}

// Mode DIRECT : envoie un bloc directement à Discord via un webhook du pool
// (aucun octet ne transite par Render → rapide, et plus de plantage sur gros
// fichiers). Bascule de webhook à chaque tentative pour répartir la charge.
async function dropPutChunkDirect(targets, idx, payload) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const t = targets[(idx + attempt) % targets.length];
    try {
      const r = await discloud.webhookUpload(t.url, 'drop_' + idx + '.orb', payload);
      return { webhookId: t.id, messageId: r.messageId };
    } catch (e) { lastErr = e; await cloudSleep(800 * (attempt + 1)); }
  }
  throw lastErr || new Error('Envoi du bloc échoué');
}
// Mode DIRECT : récupère un bloc en demandant au serveur un lien frais, puis en le
// téléchargeant directement depuis le CDN Discord (le webhook reste caché).
async function dropGetChunkDirect(id, idx) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const meta = await cloudJson('/api/drop/' + encodeURIComponent(id) + '/chunk/' + idx + '/url');
      return await discloud.fetchBytes(meta.url);
    } catch (e) { lastErr = e; await cloudSleep(1000 * (attempt + 1)); }
  }
  throw lastErr || new Error('Téléchargement du bloc échoué');
}

ipcMain.handle('discloud-drop-upload', async (e, { paths, jobId } = {}) => {
  if (!cloud.server) return { ok: false, error: 'Serveur non configuré (mode Cloud).' };
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return { ok: false, error: 'Aucun fichier.' };
  jobId = jobId || discloud.uuid();
  const results = [];
  try {
    // réveille Render (évite le 502 sur le 1ᵉʳ appel) ; si injoignable, on échoue
    // proprement au lieu de figer l'interface plusieurs minutes.
    const awake = await cloudWake();
    if (!awake) return { ok: false, error: 'Serveur injoignable pour le moment. Réessaie dans quelques instants.' };
    // Récupère les webhooks du pool → envoi DIRECT à Discord (rapide, sans charger
    // Render). Repli sur le relais serveur si aucun webhook n'est exposé.
    let targets = [];
    try { const t = await cloudJson('/api/drop/targets'); targets = (t && t.webhooks) || []; } catch (x) {}
    const direct = targets.length > 0;
    const conc = direct ? Math.min(8, Math.max(4, targets.length * 2)) : 3;
    for (let fi = 0; fi < paths.length; fi++) {
      const filePath = paths[fi];
      const stat = fs.statSync(filePath);
      const name = path.basename(filePath);
      const total = stat.size;
      const key = require('crypto').randomBytes(32);   // clé de chiffrement aléatoire par drop
      const CHUNK = discloud.CHUNK_SIZE;
      const numChunks = Math.max(1, Math.ceil(total / CHUNK));
      const fh = await fs.promises.open(filePath, 'r');
      const chunks = new Array(numChunks);
      let uploaded = 0, doneCount = 0;
      try {
        await discloud.runPool(numChunks, conc, async (i) => {
          if (discloudCancelled.has(jobId)) throw new Error('Annulé');
          const len = Math.min(CHUNK, total - i * CHUNK);
          const buf = Buffer.allocUnsafe(len);
          if (len > 0) await fh.read(buf, 0, len, i * CHUNK);
          const payload = discloud.encryptBuffer(key, buf);
          const r = direct ? await dropPutChunkDirect(targets, i, payload) : await dropPostChunk(payload);
          chunks[i] = { idx: i, webhookId: r.webhookId, messageId: r.messageId, size: len };
          uploaded += len; doneCount++;
          discloudEmit({ id: jobId, phase: 'upload', name, fileIndex: fi, fileCount: paths.length, percent: total ? Math.round((uploaded / total) * 100) : 100, chunk: doneCount, chunks: numChunks });
        });
      } finally { await fh.close(); }
      const commit = await cloudJson('/api/drop/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, size: total, chunkSize: CHUNK, chunks }) });
      results.push({ name, code: commit.id + '~' + key.toString('base64url'), expiresAt: commit.expiresAt });
    }
    discloudCancelled.delete(jobId);
    return { ok: true, drops: results };
  } catch (er) { discloudCancelled.delete(jobId); return { ok: false, error: er.message }; }
});

ipcMain.handle('discloud-drop-download', async (e, { code, jobId } = {}) => {
  if (!cloud.server) return { ok: false, error: 'Serveur non configuré (mode Cloud).' };
  code = String(code || '').trim();
  const sep = code.lastIndexOf('~');
  if (sep < 1) return { ok: false, error: 'Code invalide.' };
  const id = code.slice(0, sep);
  let key; try { key = Buffer.from(code.slice(sep + 1), 'base64url'); } catch (x) { key = Buffer.alloc(0); }
  if (key.length !== 32) return { ok: false, error: 'Code invalide (clé).' };
  let meta;
  const awake = await cloudWake();   // réveille Render endormi (évite le 502 sur la 1ʳᵉ requête)
  if (!awake) return { ok: false, error: 'Serveur injoignable pour le moment. Réessaie dans quelques instants.' };
  try { meta = await cloudJson('/api/drop/' + encodeURIComponent(id)); } catch (er) { return { ok: false, error: er.message }; }
  const list = meta.chunks || [];
  const chunkSize = meta.chunkSize || discloud.CHUNK_SIZE;
  // Détecte le mode DIRECT (serveur récent) : téléchargement direct depuis le CDN
  // Discord (rapide), sinon repli sur le relais serveur.
  let direct = false;
  if (list.length) {
    try { const probe = await cloudFetch('/api/drop/' + encodeURIComponent(id) + '/chunk/' + list[0].idx + '/url'); direct = probe.ok; } catch (x) {}
  }
  const conc = direct ? 6 : 3;
  const save = await dialog.showSaveDialog(uiWin(), { defaultPath: meta.name, title: 'Enregistrer le fichier' });
  if (save.canceled || !save.filePath) return { ok: false, error: 'Annulé', cancelled: true };
  jobId = jobId || discloud.uuid();
  const fh = await fs.promises.open(save.filePath, 'w');
  let done = 0, doneCount = 0;
  try {
    try { await fh.truncate(meta.size || 0); } catch (x) {}
    await discloud.runPool(list.length, conc, async (k) => {
      if (discloudCancelled.has(jobId)) throw new Error('Annulé');
      const ch = list[k];
      const blob = direct ? await dropGetChunkDirect(id, ch.idx) : await dropGetChunk(id, ch.idx);
      const plain = discloud.decryptBuffer(key, blob);
      await fh.write(plain, 0, plain.length, ch.idx * chunkSize);
      done += plain.length; doneCount++;
      discloudEmit({ id: jobId, phase: 'download', name: meta.name, percent: meta.size ? Math.round((done / meta.size) * 100) : 100, chunk: doneCount, chunks: list.length });
    });
    await fh.close(); discloudCancelled.delete(jobId);
    return { ok: true, path: save.filePath };
  } catch (er) {
    discloudCancelled.delete(jobId);
    try { await fh.close(); } catch (x) {}
    try { fs.unlinkSync(save.filePath); } catch (x) {}
    return { ok: false, error: er.message };
  }
});

// Infos publiques du serveur (webhooks, mail dispo, etc.) — pour adapter l'UI.
ipcMain.handle('discloud-cloud-server-info', async () => { try { const r = await cloudFetch('/health'); return await r.json(); } catch (e) { return {}; } });
// Mot de passe oublié : demande d'un code par e-mail, puis réinitialisation.
ipcMain.handle('discloud-cloud-forgot', async (e, { email } = {}) => { try { return await cloudPost('/api/auth/forgot', { email }); } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-reset', async (e, { email, code, password } = {}) => { try { await cloudPost('/api/auth/reset', { email, code, password }); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });

// ── Administration du pool (profils + webhooks) — comptes admin ──────────────
ipcMain.handle('discloud-cloud-admin-profiles', async () => { try { return { ok: true, profiles: await cloudJson('/api/admin/profiles') }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-create-profile', async (e, { label } = {}) => { try { await cloudPost('/api/admin/profiles', { label }); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-activate-profile', async (e, { id } = {}) => { try { await cloudPost('/api/admin/profiles/' + id + '/activate', {}); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-delete-profile', async (e, { id } = {}) => { try { await cloudJson('/api/admin/profiles/' + id, { method: 'DELETE' }); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-webhooks', async (e, { profileId } = {}) => { try { return { ok: true, webhooks: await cloudJson('/api/admin/webhooks?profileId=' + encodeURIComponent(profileId || '')) }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-add-webhook', async (e, { profileId, label, url } = {}) => { try { await cloudPost('/api/admin/webhooks', { profileId, label, url }); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-toggle-webhook', async (e, { id, enabled } = {}) => { try { await cloudJson('/api/admin/webhooks/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });
ipcMain.handle('discloud-cloud-admin-delete-webhook', async (e, { id } = {}) => { try { await cloudJson('/api/admin/webhooks/' + id, { method: 'DELETE' }); return { ok: true }; } catch (er) { return { ok: false, error: er.message }; } });

ipcMain.handle('discloud-cloud-crypto-status', async () => {
  try { const c = await cloudJson('/api/drive/crypto'); return { ok: true, hasParams: !!(c && c.salt) }; }
  catch (er) { return { ok: false, error: er.message }; }
});
ipcMain.handle('discloud-cloud-setup-crypto', async (e, { passphrase } = {}) => {
  if (!passphrase || String(passphrase).length < 4) return { ok: false, error: 'Phrase secrète trop courte (4 caractères minimum).' };
  try {
    const salt = require('crypto').randomBytes(16).toString('hex');
    const key = discloud.deriveKey(passphrase, salt);
    await cloudPost('/api/drive/crypto', { salt, verifier: discloud.makeVerifier(key) });
    cloudKey = key;
    return { ok: true };
  } catch (er) { return { ok: false, error: er.message }; }
});
ipcMain.handle('discloud-cloud-unlock', async (e, { passphrase } = {}) => {
  try {
    const c = await cloudJson('/api/drive/crypto');
    if (!c || !c.salt) return { ok: false, needSetup: true };
    const key = discloud.deriveKey(passphrase, c.salt);
    if (!discloud.checkVerifier(key, c.verifier)) return { ok: false, error: 'Phrase secrète incorrecte.' };
    cloudKey = key;
    return { ok: true };
  } catch (er) { return { ok: false, error: er.message }; }
});

ipcMain.handle('discloud-cloud-nodes', async () => { try { return await cloudJson('/api/drive/nodes'); } catch (e) { return []; } });
ipcMain.handle('discloud-cloud-mkdir', async (e, { name, parent } = {}) => {
  try { await cloudPost('/api/drive/folder', { name, parent: parent || null }); return await cloudJson('/api/drive/nodes'); }
  catch (er) { return []; }
});
ipcMain.handle('discloud-cloud-rename', async (e, { id, name } = {}) => {
  try { await cloudPost('/api/drive/rename', { id, name }); } catch (er) {}
  try { return await cloudJson('/api/drive/nodes'); } catch (er) { return []; }
});
ipcMain.handle('discloud-cloud-delete', async (e, { id } = {}) => {
  try { await cloudJson('/api/drive/node/' + id, { method: 'DELETE' }); return { ok: true, nodes: await cloudJson('/api/drive/nodes') }; }
  catch (er) { return { ok: false, error: er.message }; }
});

const cloudSleep = (ms) => new Promise(r => setTimeout(r, ms));

// Envoie un bloc chiffré au serveur, qui le pousse sur un webhook du pool.
// Ré-essaie sur erreur réseau / 5xx / 429 (transitoires) ; échoue vite sur une
// erreur définitive (4xx : auth, taille). → un bloc capricieux ne casse plus tout.
async function cloudUploadChunk(payload) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      const form = new FormData();
      form.append('file', new Blob([payload]), 'blk.orb');
      res = await cloudFetch('/api/drive/upload/chunk', { method: 'POST', body: form });
    } catch (e) { lastErr = e; await cloudSleep(800 * (attempt + 1)); continue; } // réseau
    if (res.ok) return res.json(); // { webhookId, messageId }
    if (res.status < 500 && res.status !== 429) { // erreur définitive : inutile de ré-essayer
      let b = null; try { b = await res.json(); } catch (x) {}
      throw new Error((b && b.error) || ('Envoi refusé (HTTP ' + res.status + ')'));
    }
    lastErr = new Error('Envoi refusé (HTTP ' + res.status + ')');
    await cloudSleep(800 * (attempt + 1));
  }
  throw lastErr || new Error('Envoi du bloc échoué');
}

// Récupère les octets (chiffrés) d'un bloc, avec retries sur erreurs transitoires.
async function cloudDownloadChunk(chunkId) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try { res = await cloudFetch('/api/drive/chunk/' + chunkId); }
    catch (e) { lastErr = e; await cloudSleep(800 * (attempt + 1)); continue; }
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (res.status < 500 && res.status !== 429) throw new Error('Bloc indisponible (HTTP ' + res.status + ')');
    lastErr = new Error('Bloc indisponible (HTTP ' + res.status + ')');
    await cloudSleep(800 * (attempt + 1));
  }
  throw lastErr || new Error('Téléchargement du bloc échoué');
}

ipcMain.handle('discloud-cloud-upload', async (e, { paths, parent, jobId } = {}) => {
  if (!cloud.token) return { ok: false, error: 'Non connecté.' };
  if (!cloudKey) return { ok: false, error: 'verrouillé', code: 'locked' };
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return { ok: false, error: 'Aucun fichier.' };
  jobId = jobId || discloud.uuid();
  // Priorité au stockage Telegram MTProto (compte perso) s'il est connecté dans l'app.
  // Sinon : backend décidé par le serveur (Telegram bot / Discord direct / relais).
  const mt = tgm.isReady();
  const storage = mt ? null : await cloudStorage();
  const tg = (!mt && storage && storage.provider === 'telegram' && storage.telegram && storage.telegram.token) ? storage.telegram : null;
  const dPool = (storage && storage.discord) ? storage.discord : null;
  const directDiscord = !mt && !tg && !!(dPool && dPool.active && dPool.active.length);
  const CHUNK = mt ? tgm.MTPROTO_CHUNK_SIZE : (tg ? (tg.chunkSize || discloud.TG_CHUNK_SIZE) : discloud.CHUNK_SIZE);
  // MTProto = un seul client (concurrence basse) ; bot Telegram = 4 ; Discord = pool.
  const conc = mt ? 2 : (tg ? 4 : (directDiscord ? directConcurrency(dPool.active.length) : await cloudConcurrency()));
  try {
    for (let fi = 0; fi < paths.length; fi++) {
      const filePath = paths[fi];
      const stat = fs.statSync(filePath);
      const name = path.basename(filePath);
      const total = stat.size;
      let icon = null;
      try { const img = await app.getFileIcon(filePath, { size: 'normal' }); if (img && !img.isEmpty()) icon = img.toDataURL(); } catch (x) {}
      const numChunks = Math.max(1, Math.ceil(total / CHUNK));
      const fh = await fs.promises.open(filePath, 'r');
      const chunks = new Array(numChunks);
      let uploaded = 0, doneCount = 0;
      try {
        await discloud.runPool(numChunks, conc, async (i) => {
          if (discloudCancelled.has(jobId)) throw new Error('Annulé');
          const len = Math.min(CHUNK, total - i * CHUNK);
          const buf = Buffer.allocUnsafe(len);
          if (len > 0) await fh.read(buf, 0, len, i * CHUNK);
          const payload = discloud.encryptBuffer(cloudKey, buf);
          if (mt) {
            // Envoi via TON compte Telegram (MTProto) → Messages enregistrés.
            const r = await tgm.uploadChunk(payload, 'blk_' + Date.now() + '_' + i + '.orb');
            chunks[i] = { idx: i, provider: 'telegram', messageId: r.messageId, size: len };
          } else if (tg) {
            // Envoi DIRECT sur Telegram (bot).
            const r = await discloud.tgUpload(tg.token, tg.chatId, 'blk_' + Date.now() + '_' + i + '.orb', payload);
            chunks[i] = { idx: i, provider: 'telegram', messageId: r.messageId, fileId: r.fileId, size: len };
          } else if (directDiscord) {
            // Envoi DIRECT sur Discord, round-robin par index (0 collision sous concurrence).
            const wh = dPool.active[i % dPool.active.length];
            const r = await discloud.webhookUpload(wh.url, 'blk_' + Date.now() + '_' + i + '.orb', payload);
            chunks[i] = { idx: i, provider: 'discord', webhookId: wh.id, messageId: r.messageId, size: len };
          } else {
            const r = await cloudUploadChunk(payload);
            chunks[i] = { idx: i, provider: 'discord', webhookId: r.webhookId, messageId: r.messageId, size: len };
          }
          uploaded += len; doneCount++;
          discloudEmit({ id: jobId, phase: 'upload', name, fileIndex: fi, fileCount: paths.length, percent: total ? Math.round((uploaded / total) * 100) : 100, chunk: doneCount, chunks: numChunks });
        });
      } finally { await fh.close(); }
      await cloudPost('/api/drive/upload/commit', { name, parent: parent || null, size: total, chunkSize: CHUNK, icon, chunks });
    }
    discloudCancelled.delete(jobId);
    return { ok: true };
  } catch (er) { discloudCancelled.delete(jobId); return { ok: false, error: er.message }; }
});

ipcMain.handle('discloud-cloud-download', async (e, { id, jobId } = {}) => {
  if (!cloud.token) return { ok: false, error: 'Non connecté.' };
  if (!cloudKey) return { ok: false, error: 'verrouillé', code: 'locked' };
  let meta;
  try { meta = await cloudJson('/api/drive/file/' + id); } catch (er) { return { ok: false, error: er.message }; }
  const node = meta.node, list = meta.chunks || [];
  const save = await dialog.showSaveDialog(uiWin(), { defaultPath: node.name, title: 'Enregistrer sous' });
  if (save.canceled || !save.filePath) return { ok: false, error: 'Annulé', cancelled: true };
  jobId = jobId || discloud.uuid();
  const chunkSize = node.chunkSize || discloud.CHUNK_SIZE;
  // Mode direct : on télécharge les blocs DIRECTEMENT depuis Discord/Telegram selon
  // le provider de CHAQUE bloc. Repli sur le relais si on ne peut pas faire en direct.
  const mt = tgm.isReady();
  const storage = await cloudStorage();
  const tg = (storage && storage.telegram && storage.telegram.token) ? storage.telegram : null;
  const allMap = (storage && storage.discord && storage.discord.all) || null;
  // Un bloc Telegram avec fileId vient du bot (→ besoin du bot) ; sans fileId, il
  // vient de MTProto (→ besoin du compte MTProto connecté). Un bloc Discord → pool.
  const chunkOk = (c) => c.provider === 'telegram'
    ? (c.fileId ? !!tg : (mt && !!c.messageId))
    : !!(allMap && c.webhookId && c.messageId && allMap[c.webhookId]);
  const canDirect = !!(list.length && list.every(chunkOk));
  const hasTg = canDirect && list.some(c => c.provider === 'telegram');
  const dActive = (storage && storage.discord && storage.discord.active) || [];
  const conc = canDirect ? (hasTg ? 3 : directConcurrency(dActive.length)) : await cloudConcurrency();
  const fh = await fs.promises.open(save.filePath, 'w');
  let done = 0, doneCount = 0;
  try {
    try { await fh.truncate(node.size || 0); } catch (x) {}
    await discloud.runPool(list.length, conc, async (k) => {
      if (discloudCancelled.has(jobId)) throw new Error('Annulé');
      const ch = list[k];
      let blob;
      if (canDirect && ch.provider === 'telegram') {
        if (ch.fileId) {                                   // bloc bot Telegram
          const url = await discloud.tgGetUrl(tg.token, ch.fileId);
          blob = await discloud.fetchBytes(url);
        } else {                                           // bloc MTProto (ton compte)
          blob = await tgm.downloadChunk(ch.messageId);
        }
      } else if (canDirect) {
        const url = await discloud.webhookGetUrl(allMap[ch.webhookId], ch.messageId);
        blob = await discloud.fetchBytes(url);
      } else {
        blob = await cloudDownloadChunk(ch.id);
      }
      const plain = node.encrypted ? discloud.decryptBuffer(cloudKey, blob) : blob;
      await fh.write(plain, 0, plain.length, ch.idx * chunkSize);
      done += ch.size; doneCount++;
      discloudEmit({ id: jobId, phase: 'download', name: node.name, percent: node.size ? Math.round((done / node.size) * 100) : 100, chunk: doneCount, chunks: list.length });
    });
    await fh.close();
    discloudCancelled.delete(jobId);
    return { ok: true, path: save.filePath };
  } catch (er) {
    discloudCancelled.delete(jobId);
    try { await fh.close(); } catch (x) {}
    try { fs.unlinkSync(save.filePath); } catch (x) {}
    return { ok: false, error: er.message };
  }
});
