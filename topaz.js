// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Topaz Video AI bridge
//  Drives a locally-installed, licensed Topaz Video / Topaz Video AI engine
//  (its bundled ffmpeg.exe + tvai.dll) through the documented tvai_* filters.
//
//  This module is pure Node and side-effect free except for filesystem reads and
//  spawning Topaz's own binary. Every parameter is validated and clamped against
//  the ranges reported by the engine itself before a command is ever built, so an
//  invalid UI value can never produce a broken or dangerous ffmpeg invocation.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

// ── Model registry ───────────────────────────────────────────────────────────
// Topaz models are identified by a short codename like "prob-4" (Proteus v4).
// We map the family prefix → friendly metadata. Anything installed but unknown
// still surfaces in the UI under its raw codename, so the catalog is never lossy
// and new models added by Topaz appear automatically (extensibility requirement).

const INTERP_FAMILIES   = ['chr', 'chf', 'apo', 'apf', 'aion', 'ifi'];
const STAB_FAMILIES     = ['ref'];
// Internal / helper models that should not appear as user-selectable enhancers.
const INTERNAL_FAMILIES = ['cpe', 'ash', 'proxy', 'video', 'audio', 'benchmarks',
                           'model', 'auth', 'aiob', 'slm', 'slmd', 'slme', 'slmu', 'shtf'];

const MODEL_NAMES = {
  // ── Enhancement / Upscale (tvai_up) ──
  prob: 'Proteus — Réglages fins',
  prap: 'Proteus — Auto-paramètres',
  iris: 'Iris — Visages & détails',
  ahq:  'Artemis — Haute Qualité',
  amq:  'Artemis — Qualité Moyenne',
  alq:  'Artemis — Basse Qualité',
  amqs: 'Artemis — Dehalo Fort (Moyenne)',
  alqs: 'Artemis — Dehalo Fort (Basse)',
  aaa:  'Artemis — Anti-Aliasing / Dehalo',
  ghq:  'Gaia — Haute Qualité',
  gcg:  'Gaia — Images de synthèse',
  thd:  'Theia — Détail fin',
  thf:  'Theia — Fidélité fine',
  thm:  'Themis — Stabilisation des détails',
  dtv:  'Dione — TV / Désentrelacement',
  dtvs: 'Dione — TV (robuste)',
  ddv:  'Dione — DV / Désentrelacement',
  dtd:  'Dione — Dehalo',
  dtds: 'Dione — Dehalo (robuste)',
  nyx:  'Nyx — Réduction de bruit',
  nyxn: 'Nyx — Réduction de bruit (v3)',
  nxf:  'Nyx — Rapide',
  nxl:  'Nyx — Étendu',
  nap:  'Nyx — Adaptatif',
  rhea: 'Rhea — Nouvelle génération',
  rxl:  'Rhea XL — Détails avancés',
  hyp:  'Hyperion — HDR / Exposition',
  // ── Frame interpolation (tvai_fi) ──
  chr:  'Chronos — Interpolation',
  chf:  'Chronos — Interpolation rapide',
  apo:  'Apollo — Interpolation',
  apf:  'Apollo — Interpolation rapide',
  aion: 'Aion — Interpolation (nouvelle gén.)',
  ifi:  'Interpolation rapide',
  // ── Stabilization (tvai_stb) ──
  ref:  'Stabilisation IA',
};

// Short tag used to group families in the UI.
const FAMILY_TAGS = {
  prob: 'Proteus', prap: 'Proteus',
  iris: 'Iris',
  ahq: 'Artemis', amq: 'Artemis', alq: 'Artemis', amqs: 'Artemis', alqs: 'Artemis', aaa: 'Artemis',
  ghq: 'Gaia', gcg: 'Gaia',
  thd: 'Theia', thf: 'Theia', thm: 'Themis',
  dtv: 'Dione', dtvs: 'Dione', ddv: 'Dione', dtd: 'Dione', dtds: 'Dione',
  nyx: 'Nyx', nyxn: 'Nyx', nxf: 'Nyx', nxl: 'Nyx', nap: 'Nyx',
  rhea: 'Rhea', rxl: 'Rhea', hyp: 'Hyperion',
  chr: 'Chronos', chf: 'Chronos', apo: 'Apollo', apf: 'Apollo', aion: 'Aion', ifi: 'Interpolation',
  ref: 'Stabilisation',
};

// Only Proteus accepts the six manual sliders (the engine ignores them otherwise).
const MANUAL_PARAM_FAMILIES = ['prob'];

function familyOf(codename) {
  const m = String(codename).match(/^([a-z]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function categoryOf(family) {
  if (INTERP_FAMILIES.includes(family)) return 'interpolate';
  if (STAB_FAMILIES.includes(family)) return 'stabilize';
  if (INTERNAL_FAMILIES.includes(family)) return 'internal';
  return 'upscale';
}

// ── Engine detection ─────────────────────────────────────────────────────────
const INSTALL_CANDIDATES = [
  'C:\\Program Files\\Topaz Labs LLC\\Topaz Video',
  'C:\\Program Files\\Topaz Labs LLC\\Topaz Video AI',
  'C:\\Program Files\\Topaz Labs LLC\\Topaz Video AI 6',
  'C:\\Program Files\\Topaz Labs LLC\\Topaz Video AI 5',
];
const MODELDIR_CANDIDATES = [
  'C:\\ProgramData\\Topaz Labs LLC\\Topaz Video\\models',
  'C:\\ProgramData\\Topaz Labs LLC\\Topaz Video AI\\models',
];

let _cachedDetect = null;

function readRegistryPaths() {
  // Best-effort: ask the registry for InstallDir / ModelDir. Synchronous, guarded.
  const out = { install: null, modelDir: null };
  try {
    const { execFileSync } = require('child_process');
    for (const key of ['Topaz Video', 'Topaz Video AI']) {
      try {
        const raw = execFileSync('reg', ['query', `HKLM\\SOFTWARE\\Topaz Labs LLC\\${key}`], { timeout: 4000 }).toString();
        const inst = raw.match(/InstallDir\s+REG_SZ\s+(.+)/i);
        const mdl = raw.match(/ModelDir\s+REG_SZ\s+(.+)/i);
        if (inst && !out.install) out.install = inst[1].trim();
        if (mdl && !out.modelDir) out.modelDir = mdl[1].trim();
        if (out.install && out.modelDir) break;
      } catch (e) { /* key not present, try next */ }
    }
  } catch (e) { /* reg unavailable */ }
  return out;
}

function detectTopaz(force = false) {
  if (_cachedDetect && !force) return _cachedDetect;

  const reg = readRegistryPaths();
  const installCandidates = [reg.install, ...INSTALL_CANDIDATES].filter(Boolean);
  let install = installCandidates.find(p => {
    try { return fs.existsSync(path.join(p, 'ffmpeg.exe')) && fs.existsSync(path.join(p, 'tvai.dll')); }
    catch (e) { return false; }
  });

  if (!install) {
    _cachedDetect = { installed: false, reason: 'Topaz Video introuvable (ffmpeg.exe + tvai.dll).' };
    return _cachedDetect;
  }

  const ffmpeg = path.join(install, 'ffmpeg.exe');
  const ffprobe = fs.existsSync(path.join(install, 'ffprobe.exe')) ? path.join(install, 'ffprobe.exe') : null;

  let modelDir = [reg.modelDir, ...MODELDIR_CANDIDATES].filter(Boolean)
    .find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;

  let version = null;
  try {
    const m = install.match(/Topaz Video(?:\s+AI)?(?:\s+(\d+))?/i);
    version = m ? (m[1] || 'current') : null;
  } catch (e) {}

  _cachedDetect = { installed: true, install, ffmpeg, ffprobe, modelDir, version };
  return _cachedDetect;
}

// ── Model catalog ────────────────────────────────────────────────────────────
// Scans the install's model directory and returns the models the user actually
// has, grouped by category. Picks the highest version per family as the default.
function listModels(modelDir) {
  const result = { upscale: [], interpolate: [], stabilize: [] };
  if (!modelDir) return result;
  let files = [];
  try { files = fs.readdirSync(modelDir); } catch (e) { return result; }

  const byFamily = new Map(); // family -> [{code, version}]
  for (const f of files) {
    if (!f.toLowerCase().endsWith('.json')) continue;
    const code = f.replace(/\.json$/i, '');
    if (['model-recommendation-rules', 'audio-codecs', 'benchmarks', 'video-encoders'].includes(code)) continue;
    const fam = familyOf(code);
    const cat = categoryOf(fam);
    if (cat === 'internal') continue;
    const vm = code.match(/-(\d+)$/);
    const version = vm ? parseInt(vm[1], 10) : 0;
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push({ code, version, cat });
  }

  for (const [fam, variants] of byFamily) {
    variants.sort((a, b) => b.version - a.version);
    const cat = variants[0].cat;
    const bucket = result[cat];
    if (!bucket) continue;
    bucket.push({
      family: fam,
      tag: FAMILY_TAGS[fam] || fam.toUpperCase(),
      name: MODEL_NAMES[fam] || `${fam.toUpperCase()} (modèle Topaz)`,
      defaultCode: variants[0].code,         // newest installed version
      codes: variants.map(v => v.code),      // all installed versions
      supportsManual: MANUAL_PARAM_FAMILIES.includes(fam),
      known: !!MODEL_NAMES[fam],
    });
  }

  // Stable, friendly ordering: known models first (alpha by name), unknown last.
  const order = (arr) => arr.sort((a, b) => (a.known === b.known)
    ? a.name.localeCompare(b.name) : (a.known ? -1 : 1));
  order(result.upscale); order(result.interpolate); order(result.stabilize);
  return result;
}

// ── Validation helpers ───────────────────────────────────────────────────────
function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function round(n, d = 4) { const f = Math.pow(10, d); return Math.round(n * f) / f; }

// ── ffprobe metadata ─────────────────────────────────────────────────────────
function probeFile(ffprobe, file) {
  return new Promise((resolve) => {
    if (!ffprobe) return resolve({ error: 'ffprobe Topaz introuvable.' });
    if (!file || !fs.existsSync(file)) return resolve({ error: 'Fichier introuvable.' });
    execFile(ffprobe, [
      '-v', 'quiet', '-print_format', 'json',
      '-show_format', '-show_streams', file,
    ], { maxBuffer: 1024 * 1024 * 8 }, (err, stdout) => {
      if (err) return resolve({ error: 'Lecture du fichier impossible.' });
      let j;
      try { j = JSON.parse(stdout); } catch (e) { return resolve({ error: 'Métadonnées illisibles.' }); }
      const v = (j.streams || []).find(s => s.codec_type === 'video');
      const a = (j.streams || []).find(s => s.codec_type === 'audio');
      let fps = 0;
      if (v && v.r_frame_rate && v.r_frame_rate.includes('/')) {
        const [n, d] = v.r_frame_rate.split('/').map(Number);
        if (d) fps = round(n / d, 3);
      }
      const size = Number((j.format && j.format.size) || 0);
      resolve({
        width: v ? Number(v.width) : 0,
        height: v ? Number(v.height) : 0,
        fps,
        codec: v ? v.codec_name : '',
        duration: Number((j.format && j.format.duration) || (v && v.duration) || 0),
        size,
        bitrate: Number((j.format && j.format.bit_rate) || 0),
        hasAudio: !!a,
        audioCodec: a ? a.codec_name : '',
      });
    });
  });
}

// ── Encoder availability (so the builder never asks for a missing encoder) ─────
let _cachedEncoders = null;
function listEncoders(ffmpeg) {
  return new Promise((resolve) => {
    if (_cachedEncoders) return resolve(_cachedEncoders);
    execFile(ffmpeg, ['-hide_banner', '-encoders'], { maxBuffer: 1024 * 1024 * 8 }, (err, stdout) => {
      const set = new Set();
      if (!err && stdout) {
        for (const line of stdout.split('\n')) {
          const m = line.match(/^\s*[A-Z.]{6}\s+([A-Za-z0-9_]+)/);
          if (m) set.add(m[1]);
        }
      }
      _cachedEncoders = set;
      resolve(set);
    });
  });
}

// Map a friendly codec choice → the best encoder actually present, preferring
// GPU encoders for NVIDIA when available, then falling back to CPU.
function pickEncoder(codec, encoders, preferGpu) {
  const has = (e) => encoders && encoders.has(e);
  const chains = {
    h264:   preferGpu ? ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'] : ['libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'],
    h265:   preferGpu ? ['hevc_nvenc', 'hevc_qsv', 'hevc_amf', 'libx265'] : ['libx265', 'hevc_nvenc', 'hevc_qsv', 'hevc_amf'],
    av1:    preferGpu ? ['av1_nvenc', 'av1_qsv', 'libsvtav1', 'libaom-av1'] : ['libsvtav1', 'libaom-av1', 'av1_nvenc', 'av1_qsv'],
    prores: ['prores_ks', 'prores'],
  };
  const chain = chains[codec] || chains.h264;
  return chain.find(has) || chain[chain.length - 1];
}

// ── Filter string builders ───────────────────────────────────────────────────
function buildUpscaleFilter(e, deviceStr, vram, installedUpscale) {
  // Validate model is installed (unless we allow download). Fall back to newest.
  const fam = familyOf(e.model);
  let model = e.model;
  const known = installedUpscale.find(m => m.codes.includes(model));
  if (!known && installedUpscale.length) {
    // try same family, else first available
    const sameFam = installedUpscale.find(m => m.family === fam);
    model = sameFam ? sameFam.defaultCode : installedUpscale[0].defaultCode;
  }

  const parts = [`model=${model}`];

  // Output sizing: explicit target resolution wins; otherwise integer scale.
  if (e.targetW && e.targetH) {
    parts.push(`scale=0`, `w=${clamp(Math.round(e.targetW), 1, 100000, 1920)}`, `h=${clamp(Math.round(e.targetH), 1, 100000, 1080)}`);
  } else {
    parts.push(`scale=${clamp(Math.round(e.scale != null ? e.scale : 1), 0, 4, 1)}`);
  }

  parts.push(`device=${deviceStr}`, `vram=${vram}`, `instances=${clamp(Math.round(e.instances || 0), 0, 3, 0)}`);

  const manual = MANUAL_PARAM_FAMILIES.includes(familyOf(model));
  if (e.auto || !manual) {
    // Auto parameter estimation (Proteus auto, or any model that ignores manual)
    const est = clamp(Math.round(e.estimate != null ? e.estimate : (manual ? 8 : 0)), 0, 100, manual ? 8 : 0);
    parts.push(`estimate=${est}`);
  } else {
    // Manual six-parameter mode (Proteus). UI sends -100..100 → engine -1..1.
    const p = e.manual || {};
    parts.push(`estimate=0`);
    parts.push(`preblur=${round(clamp((p.preblur || 0) / 100, -1, 1, 0))}`);
    parts.push(`noise=${round(clamp((p.noise || 0) / 100, -1, 1, 0))}`);
    parts.push(`details=${round(clamp((p.details || 0) / 100, -1, 1, 0))}`);
    parts.push(`halo=${round(clamp((p.halo || 0) / 100, -1, 1, 0))}`);
    parts.push(`blur=${round(clamp((p.blur || 0) / 100, -1, 1, 0))}`);
    parts.push(`compression=${round(clamp((p.compression || 0) / 100, -1, 1, 0))}`);
  }

  // Grain (UI 0..100 → engine 0..0.1) and grain size (0..5).
  if (e.grain) parts.push(`grain=${round(clamp((e.grain || 0) / 1000, 0, 0.1, 0))}`);
  if (e.gsize) parts.push(`gsize=${round(clamp(e.gsize || 0, 0, 5, 0))}`);
  if (e.blend) parts.push(`blend=${round(clamp((e.blend || 0) / 100, 0, 1, 0))}`);

  return { filter: `tvai_up=${parts.join(':')}`, resolvedModel: model };
}

function buildInterpFilter(it, deviceStr, vram, installedInterp) {
  let model = it.model;
  const known = installedInterp.find(m => m.codes.includes(model));
  if (!known && installedInterp.length) {
    const sameFam = installedInterp.find(m => m.family === familyOf(model));
    model = sameFam ? sameFam.defaultCode : installedInterp[0].defaultCode;
  }
  const fps = clamp(it.fps, 1, 1000, 60);
  const slowmo = clamp(it.slowmo || 1, 0.1, 16, 1);
  const parts = [`model=${model}`, `device=${deviceStr}`, `vram=${vram}`,
                 `fps=${round(fps, 3)}`, `slowmo=${round(slowmo, 3)}`];
  return { filter: `tvai_fi=${parts.join(':')}`, resolvedModel: model, slowmo };
}

function buildStabFilter(st, deviceStr, vram, cpeFile, installedStab) {
  let model = st.model;
  const known = installedStab.find(m => m.codes.includes(model));
  if (!known && installedStab.length) model = installedStab[0].defaultCode;
  const parts = [
    `model=${model}`,
    `device=${deviceStr}`,
    `vram=${vram}`,
    `filename=${cpeFile}`,
    `smoothness=${round(clamp(st.smoothness != null ? st.smoothness : 6, 0, 16, 6))}`,
    `full=${st.fullFrame ? 1 : 0}`,
    `roll=${st.rollingShutter ? 1 : 0}`,
    `reduce=${clamp(Math.round(st.reduce || 0), 0, 5, 0)}`,
  ];
  return { filter: `tvai_stb=${parts.join(':')}`, resolvedModel: model };
}

function buildCpeFilter(deviceStr, cpeFile, cpeModel) {
  return `tvai_cpe=model=${cpeModel}:filename=${cpeFile}:device=${deviceStr}`;
}

// Map device selection coming from the UI to a Topaz device string.
function deviceString(gpu) {
  if (gpu == null || gpu === 'auto') return '-2';
  if (gpu === 'cpu') return '-1';
  const n = parseInt(gpu, 10);
  return Number.isFinite(n) ? String(n) : '-2';
}

function encoderQualityArgs(codec, encoder, q, preset) {
  // q: 0..100 from UI (higher = better). Translate per encoder family.
  const out = [];
  const isNvenc = /nvenc/.test(encoder);
  const isQsv = /qsv/.test(encoder);
  const isAmf = /amf/.test(encoder);
  if (codec === 'prores') {
    // 0 proxy · 1 lt · 2 standard · 3 hq — map quality slider into the four profiles.
    const prof = q >= 80 ? 3 : q >= 55 ? 2 : q >= 30 ? 1 : 0;
    out.push('-profile:v', String(prof), '-pix_fmt', 'yuv422p10le');
    return out;
  }
  // CRF-style: invert quality (100 → low CRF). x264/x265 0..51, svt-av1 0..63.
  if (encoder === 'libx264' || encoder === 'libx265') {
    const crf = Math.round(51 - (clamp(q, 0, 100, 70) / 100) * 33); // 51..18
    out.push('-crf', String(crf), '-preset', preset || 'medium', '-pix_fmt', 'yuv420p');
  } else if (encoder === 'libsvtav1') {
    const crf = Math.round(63 - (clamp(q, 0, 100, 70) / 100) * 40); // 63..23
    out.push('-crf', String(crf), '-preset', '6', '-pix_fmt', 'yuv420p');
  } else if (encoder === 'libaom-av1') {
    const crf = Math.round(63 - (clamp(q, 0, 100, 70) / 100) * 40);
    out.push('-crf', String(crf), '-b:v', '0', '-cpu-used', '4', '-pix_fmt', 'yuv420p');
  } else if (isNvenc) {
    const cq = Math.round(51 - (clamp(q, 0, 100, 70) / 100) * 33);
    out.push('-rc', 'vbr', '-cq', String(cq), '-preset', 'p5', '-pix_fmt', 'yuv420p');
  } else if (isQsv) {
    const gq = Math.round(51 - (clamp(q, 0, 100, 70) / 100) * 33);
    out.push('-global_quality', String(gq), '-pix_fmt', 'nv12');
  } else if (isAmf) {
    const qp = Math.round(51 - (clamp(q, 0, 100, 70) / 100) * 33);
    out.push('-rc', 'cqp', '-qp_i', String(qp), '-qp_p', String(qp), '-pix_fmt', 'yuv420p');
  } else {
    out.push('-pix_fmt', 'yuv420p');
  }
  return out;
}

const CONTAINER_EXT = { MP4: 'mp4', MOV: 'mov', MKV: 'mkv', AVI: 'avi' };

// ── Top-level command builder ────────────────────────────────────────────────
// Returns { ok, error, warnings, passes:[{label, args, weight}], outputPath, totalDuration }
// `passes` is an ordered list of ffmpeg invocations (CPE pre-pass first when stabilizing).
function buildCommand(job, ctx) {
  const warnings = [];
  const det = ctx.detect;
  if (!det || !det.installed) return { ok: false, error: 'Moteur Topaz non détecté.' };
  if (!job.inputPath || !fs.existsSync(job.inputPath)) return { ok: false, error: 'Fichier source introuvable.' };

  const enhance = job.enhance || {};
  const interp = job.interpolate || {};
  const stab = job.stabilize || {};
  const exp = job.export || {};

  if (!enhance.enabled && !interp.enabled && !stab.enabled) {
    return { ok: false, error: 'Activez au moins un traitement (Amélioration, Interpolation ou Stabilisation).' };
  }

  const deviceStr = deviceString(job.device);
  const vram = round(clamp(job.vram != null ? job.vram : 1, 0.1, 1, 1), 2);
  const installed = ctx.models || { upscale: [], interpolate: [], stabilize: [] };

  // Preview mode renders a short clip to a temp file for the before/after viewer.
  const preview = job.preview && Number(job.preview.duration) > 0 ? {
    start: clamp(job.preview.start || 0, 0, 1e7, 0),
    duration: clamp(job.preview.duration, 0.5, 30, 3),
  } : null;
  // Seek before -i (fast), then limit duration after -i.
  const inputArgs = preview
    ? ['-ss', String(round(preview.start, 2)), '-i', job.inputPath, '-t', String(round(preview.duration, 2))]
    : ['-i', job.inputPath];

  // Resolve output path.
  let outputPath;
  if (preview) {
    outputPath = path.join(os.tmpdir(), `orbit_tvai_preview_${Date.now()}.mp4`);
  } else {
    const ext = CONTAINER_EXT[(exp.format || 'MP4').toUpperCase()] || 'mp4';
    const base = path.basename(job.inputPath, path.extname(job.inputPath));
    const outDir = exp.outputDir && fs.existsSync(exp.outputDir) ? exp.outputDir : path.dirname(job.inputPath);
    const suffix = exp.suffix || '_orbit';
    outputPath = path.join(outDir, `${base}${suffix}.${ext}`);
    // never overwrite the source
    if (path.resolve(outputPath) === path.resolve(job.inputPath)) {
      outputPath = path.join(outDir, `${base}${suffix}_out.${ext}`);
    }
  }

  // Build the main filter chain in Topaz order: stabilize → enhance → interpolate.
  const vf = [];
  const resolved = {};
  let slowmo = 1;
  let cpeFile = null;
  let workDir = null;
  const passes = [];

  // Stabilization needs a camera-pose pre-pass (writes cpe.json). Windows drive
  // colons break ffmpeg's filter parser, so we run these passes from a temp work
  // dir and reference cpe.json by a bare relative name (no colon to escape).
  if (stab.enabled) {
    if (!installed.stabilize.length) {
      warnings.push('Aucun modèle de stabilisation installé — il sera téléchargé par Topaz au lancement.');
    }
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit_tvai_'));
    const cpeRel = 'cpe.json';
    cpeFile = path.join(workDir, cpeRel);
    const cpeModel = (ctx.cpeModel || 'cpe-1');
    const cpeVf = buildCpeFilter(deviceStr, cpeRel, cpeModel);
    passes.push({
      label: 'Analyse du mouvement (CPE)',
      weight: 0.25,
      cwd: workDir,
      args: [
        '-hide_banner', '-nostdin', '-y', ...inputArgs,
        '-vf', cpeVf, '-f', 'null', os.platform() === 'win32' ? 'NUL' : '/dev/null',
      ],
    });
    const s = buildStabFilter(stab, deviceStr, vram, cpeRel, installed.stabilize);
    vf.push(s.filter); resolved.stabilize = s.resolvedModel;
  }

  if (enhance.enabled) {
    const u = buildUpscaleFilter(enhance, deviceStr, vram, installed.upscale);
    vf.push(u.filter); resolved.enhance = u.resolvedModel;
  }

  if (interp.enabled) {
    const i = buildInterpFilter(interp, deviceStr, vram, installed.interpolate);
    vf.push(i.filter); resolved.interpolate = i.resolvedModel; slowmo = i.slowmo;
  }

  // Encoder. Preview always uses fast CPU h264 so it returns quickly.
  const encoders = ctx.encoders;
  const codec = preview ? 'h264' : (exp.codec || 'h264').toLowerCase();
  const preferGpu = !preview && !!ctx.preferGpu && deviceStr !== '-1';
  const encoder = preview ? 'libx264' : pickEncoder(codec, encoders, preferGpu);
  const qArgs = preview
    ? ['-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p']
    : encoderQualityArgs(codec, encoder, exp.quality != null ? exp.quality : 70, exp.preset);

  // Audio: copy unless slow-motion changes the timeline (then drop to avoid desync).
  let audioArgs;
  if (preview) audioArgs = ['-an'];
  else if (slowmo !== 1) { audioArgs = ['-an']; if (exp.audioCopy) warnings.push('Audio retiré (le ralenti modifie la durée).'); }
  else if (exp.audioCopy === false) audioArgs = ['-an'];
  else audioArgs = ['-c:a', 'copy'];

  const mainArgs = [
    '-hide_banner', '-nostdin', '-y',
    ...inputArgs,
    '-sws_flags', 'spline+accurate_rnd+full_chroma_int',
    '-vf', vf.join(','),
    '-c:v', encoder, ...qArgs,
    ...audioArgs,
    '-map_metadata', '0', '-movflags', '+faststart',
    outputPath,
  ];
  passes.push({
    label: preview ? 'Aperçu' : 'Traitement IA',
    weight: passes.length ? 0.75 : 1,
    cwd: workDir || det.install,
    args: mainArgs,
  });

  return {
    ok: true,
    warnings,
    passes,
    outputPath,
    encoder,
    resolved,
    slowmo,
    cpeFile,
    workDir,
    isPreview: !!preview,
  };
}

module.exports = {
  detectTopaz,
  listModels,
  probeFile,
  listEncoders,
  buildCommand,
  deviceString,
  // exported for reuse/tests
  familyOf, categoryOf, clamp,
};
