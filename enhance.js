// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Free AI enhancement engine
//  100% open-source & redistributable — bundled for ALL Orbit users:
//    · Real-ESRGAN ncnn-Vulkan  → AI upscaling (general / photo / anime)
//    · RIFE ncnn-Vulkan         → AI frame interpolation (reused from Orbit)
//    · ffmpeg filters           → restoration, denoise, deblock/deband,
//                                 deinterlace, color, CAS sharpen, vidstab
//  Pure builders + validation here; main.js orchestrates the staged pipeline.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Engines ──────────────────────────────────────────────────────────────────
const REALESRGAN = {
  // Pinned release that bundles the ncnn binary + the three working models.
  url: 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip',
  exe: 'realesrgan-ncnn-vulkan.exe',
  minZipBytes: 10 * 1024 * 1024,
};

// Only the models that actually ship in the release above (verified present).
const ESRGAN_MODELS = [
  { family: 'video', model: 'realesr-animevideov3', name: 'Vidéo — rapide & polyvalent', nativeScales: [2, 3, 4], best: 4 },
  { family: 'photo', model: 'realesrgan-x4plus',    name: 'Photo / Général — détaillé', nativeScales: [4], best: 4 },
  { family: 'anime', model: 'realesrgan-x4plus-anime', name: 'Anime / Dessins',          nativeScales: [4], best: 4 },
];

function clamp(v, lo, hi, dflt) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
const round = (n, d = 3) => { const f = Math.pow(10, d); return Math.round(n * f) / f; };

// ── Detection ────────────────────────────────────────────────────────────────
function findExe(dir, name) {
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return full;
      if (e.isDirectory()) { const f = findExe(full, name); if (f) return f; }
    }
  } catch (e) {}
  return null;
}

function detectEngines(orbitDir) {
  const modulesDir = path.join(orbitDir, 'modules');
  const ffmpeg = (() => {
    const local = path.join(orbitDir, 'ffmpeg', 'ffmpeg.exe');
    if (fs.existsSync(local)) return local;
    try { return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); } catch (e) { return null; }
  })();
  const esrganExe = findExe(path.join(modulesDir, 'realesrgan'), REALESRGAN.exe);
  const rifeExe = findExe(path.join(modulesDir, 'rife'), 'rife-ncnn-vulkan.exe');
  return {
    ffmpeg,
    esrganExe,
    esrganModelsDir: esrganExe ? path.join(path.dirname(esrganExe), 'models') : null,
    rifeExe,
    modulesDir,
  };
}

// ── Real-ESRGAN: choose native scale & resolve model ─────────────────────────
function resolveEsrgan(modelFamily, wantScale) {
  const m = ESRGAN_MODELS.find(x => x.family === modelFamily) || ESRGAN_MODELS[0];
  // animevideov3 supports 2/3/4 natively; pick the smallest native ≥ wantScale.
  let native = m.best;
  if (m.nativeScales.length > 1) {
    native = m.nativeScales.find(s => s >= wantScale) || m.nativeScales[m.nativeScales.length - 1];
  }
  return { model: m.model, native };
}

function esrganArgs({ inDir, outDir, model, native, tile, tta, gpu }) {
  const args = ['-i', inDir, '-o', outDir, '-n', model, '-s', String(native), '-f', 'png'];
  const t = clamp(tile, 0, 1024, 0);
  if (t > 0) args.push('-t', String(Math.round(t)));
  if (tta) args.push('-x');
  if (gpu != null && gpu !== 'auto') args.push('-g', String(gpu));
  return args;
}

// ── ffmpeg restoration filter chain (validated) ──────────────────────────────
const DENOISE = {
  off: null,
  light: 'hqdn3d=1.5:1.5:6:6',
  medium: 'hqdn3d=4:3:6:6',
  strong: 'hqdn3d=8:6:9:9',
};

// Returns an array of filter snippets, in the recommended processing order.
function buildRestoreFilters(o = {}) {
  const f = [];
  if (o.deinterlace) f.push('bwdif=mode=send_frame');
  if (o.denoise && DENOISE[o.denoise]) {
    f.push(DENOISE[o.denoise]);
    if (o.temporalDenoise) f.push('atadenoise');
  }
  if (o.deblock) f.push('deblock=filter=strong:block=8');
  if (o.deband) f.push('deband=range=16:r=4:d=4');
  // colour / exposure
  const c = o.color || {};
  const eqParts = [];
  if (c.brightness) eqParts.push(`brightness=${round(clamp(c.brightness, -100, 100, 0) / 333, 3)}`);
  if (c.contrast) eqParts.push(`contrast=${round(1 + clamp(c.contrast, -100, 100, 0) / 200, 3)}`);
  if (c.saturation) eqParts.push(`saturation=${round(1 + clamp(c.saturation, -100, 100, 0) / 100, 3)}`);
  if (c.gamma && c.gamma !== 100) eqParts.push(`gamma=${round(clamp(c.gamma, 10, 400, 100) / 100, 3)}`);
  if (eqParts.length) f.push('eq=' + eqParts.join(':'));
  // detail recovery (mild high-freq lift) — distinct from final sharpen
  if (o.detailRecovery) f.push('cas=strength=0.35');
  return f;
}

// Final sharpen pass (CAS — contrast-adaptive, artifact-free). 0..100 → 0..1.
function buildSharpenFilter(sharpen) {
  const s = clamp(sharpen, 0, 100, 0);
  if (s <= 0) return null;
  return `cas=strength=${round(s / 100, 3)}`;
}

// vidstab is 2-pass. The .trf path must be RELATIVE (Windows drive colon breaks
// the filter parser) — caller runs these passes with cwd = a temp work dir.
function buildVidstabDetect(o = {}, trfRelative = 'transforms.trf') {
  const shakiness = clamp(Math.round(o.shakiness || 5), 1, 10, 5);
  return `vidstabdetect=shakiness=${shakiness}:accuracy=15:result=${trfRelative}`;
}
function buildVidstabTransform(o = {}, trfRelative = 'transforms.trf') {
  const smoothing = clamp(Math.round(o.smoothing != null ? o.smoothing : 10), 0, 100, 10);
  const optzoom = o.optzoom === false ? 0 : 1;     // auto-zoom to hide borders
  const zoom = clamp(o.zoom || 0, -50, 50, 0);
  return `vidstabtransform=input=${trfRelative}:smoothing=${smoothing}:optzoom=${optzoom}:zoom=${zoom}:interpol=bicubic`;
}

// ── Encoder mapping ──────────────────────────────────────────────────────────
function pickVideoEncoder(codec, encoders, preferGpu) {
  const has = (e) => encoders && encoders.has(e);
  const chains = {
    h264: preferGpu ? ['h264_nvenc', 'libx264'] : ['libx264', 'h264_nvenc'],
    h265: preferGpu ? ['hevc_nvenc', 'libx265'] : ['libx265', 'hevc_nvenc'],
    av1: ['libsvtav1', 'libaom-av1', 'av1_nvenc'],
    vp9: ['libvpx-vp9'],
    prores: ['prores_ks'],
  };
  const chain = chains[codec] || chains.h264;
  // Prefer an available encoder; if none in the chain exists on this ffmpeg
  // build, fall back to libx264 (always present) so the render never fails.
  return chain.find(has) || (has('libx264') ? 'libx264' : chain[chain.length - 1]);
}

// The codec family an encoder actually produces (so the container matches reality
// even when we've fallen back to a different encoder than requested).
function encoderCodec(enc) {
  if (/265|hevc/.test(enc)) return 'h265';
  if (/av1/.test(enc)) return 'av1';
  if (/vp9|vpx/.test(enc)) return 'vp9';
  if (/prores/.test(enc)) return 'prores';
  return 'h264';
}

// Which user-facing codecs are actually encodable on this ffmpeg build.
function availableCodecs(encoders) {
  const has = (e) => encoders && (encoders.has ? encoders.has(e) : encoders.includes(e));
  const out = [];
  if (has('libx264') || has('h264_nvenc') || has('h264_qsv') || has('h264_amf')) out.push('h264');
  if (has('libx265') || has('hevc_nvenc') || has('hevc_qsv') || has('hevc_amf')) out.push('h265');
  if (has('libsvtav1') || has('libaom-av1') || has('av1_nvenc') || has('av1_qsv')) out.push('av1');
  if (has('libvpx-vp9')) out.push('vp9');
  if (has('prores_ks') || has('prores')) out.push('prores');
  return out;
}

function encoderQualityArgs(codec, encoder, q) {
  q = clamp(q, 0, 100, 70);
  if (/prores/.test(encoder)) return ['-profile:v', q >= 80 ? '3' : q >= 55 ? '2' : '1', '-pix_fmt', 'yuv422p10le'];
  if (encoder === 'libx264' || encoder === 'libx265') return ['-crf', String(Math.round(51 - (q / 100) * 33)), '-preset', 'medium', '-pix_fmt', 'yuv420p'];
  if (encoder === 'libsvtav1') return ['-crf', String(Math.round(63 - (q / 100) * 40)), '-preset', '6', '-pix_fmt', 'yuv420p'];
  if (encoder === 'libaom-av1') return ['-crf', String(Math.round(63 - (q / 100) * 40)), '-b:v', '0', '-cpu-used', '4', '-pix_fmt', 'yuv420p'];
  if (encoder === 'libvpx-vp9') return ['-crf', String(Math.round(63 - (q / 100) * 40)), '-b:v', '0', '-pix_fmt', 'yuv420p'];
  if (/nvenc/.test(encoder)) return ['-rc', 'vbr', '-cq', String(Math.round(51 - (q / 100) * 33)), '-preset', 'p5', '-pix_fmt', 'yuv420p'];
  return ['-pix_fmt', 'yuv420p'];
}

const CONTAINER_EXT = { MP4: 'mp4', MOV: 'mov', MKV: 'mkv', AVI: 'avi', WEBM: 'webm' };

// Which codecs each container can legally hold. Used to validate + auto-correct
// so an impossible combo (e.g. H.264-in-WEBM, ProRes-in-MP4) never reaches ffmpeg.
const CONTAINER_CODECS = {
  MP4: ['h264', 'h265', 'av1'],
  MOV: ['h264', 'h265', 'prores'],
  MKV: ['h264', 'h265', 'av1', 'vp9', 'prores'],
  WEBM: ['vp9', 'av1'],
  AVI: ['h264'],
};
function codecsForContainer(format) {
  return CONTAINER_CODECS[(format || 'MP4').toUpperCase()] || CONTAINER_CODECS.MP4;
}
// Return a container (uppercase) guaranteed to hold the requested codec, keeping
// the user's choice when possible, else the most sensible compatible one.
function safeContainer(format, codec) {
  const f = (format || 'MP4').toUpperCase();
  if (codecsForContainer(f).includes(codec)) return f;
  if (codec === 'prores') return 'MOV';
  if (codec === 'vp9') return 'WEBM';
  return 'MKV'; // universal fallback (holds h264/h265/av1/vp9/prores)
}

// ── Target resolution resolver ───────────────────────────────────────────────
const RES_HEIGHT = { '720p': 720, '1080p': 1080, '1440p': 1440, '4K': 2160, '8K': 4320 };
function resolveTarget(meta, mode, scale, resPreset, customW, customH) {
  const w = meta && meta.width ? meta.width : 1920;
  const h = meta && meta.height ? meta.height : 1080;
  if (mode === 'resolution' && resPreset && resPreset !== 'Auto') {
    if (resPreset === 'Personnalisé') return { w: clamp(customW, 16, 16000, w), h: clamp(customH, 16, 16000, h) };
    const th = RES_HEIGHT[resPreset] || 2160;
    const ar = w / h;
    return { w: Math.round(th * ar / 2) * 2, h: th };
  }
  const s = clamp(scale, 1, 8, 2);
  return { w: Math.round(w * s / 2) * 2, h: Math.round(h * s / 2) * 2 };
}

module.exports = {
  REALESRGAN, ESRGAN_MODELS,
  detectEngines, findExe,
  resolveEsrgan, esrganArgs,
  buildRestoreFilters, buildSharpenFilter,
  buildVidstabDetect, buildVidstabTransform,
  pickVideoEncoder, encoderQualityArgs, encoderCodec, availableCodecs,
  resolveTarget, CONTAINER_EXT,
  safeContainer, codecsForContainer, CONTAINER_CODECS,
  clamp,
};
