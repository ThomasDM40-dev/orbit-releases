// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · HandBrake bridge
//  Wraps the genuine, open-source HandBrakeCLI (GPL) — auto-downloaded and driven
//  by Orbit, exactly like yt-dlp / Real-ESRGAN. Gives Orbit HandBrake's real
//  preset engine + filters with zero reimplementation.
//  Pure builders + validation here; main.js orchestrates download & runs.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const HB_EXE = 'HandBrakeCLI.exe';
const HB_API_LATEST = 'https://api.github.com/repos/HandBrake/HandBrake/releases/latest';

function clamp(v, lo, hi, dflt) { const n = Number(v); if (!Number.isFinite(n)) return dflt; return Math.min(hi, Math.max(lo, n)); }

function findExe(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isFile() && e.name.toLowerCase() === HB_EXE.toLowerCase()) return full;
      if (e.isDirectory()) { const f = findExe(full); if (f) return f; }
    }
  } catch (e) {}
  return null;
}

function detect(orbitDir) {
  const dir = path.join(orbitDir, 'modules', 'handbrake');
  const exe = findExe(dir);
  return { dir, exe, installed: !!exe };
}

// Parse `HandBrakeCLI --preset-list` into { category: [names] } (+ flat list).
function parsePresetList(output) {
  const groups = {};
  let cat = 'Général';
  for (const raw of String(output).split('\n')) {
    if (!raw.trim()) continue;
    if (/^\[/.test(raw)) continue;                 // [timestamp] log lines
    if (/^[^\s\[]/.test(raw)) { cat = raw.replace(/\/\s*$/, '').trim(); if (!groups[cat]) groups[cat] = []; continue; }
    // Preset names are shallowly indented (≤6 spaces); descriptions are deeper.
    const m = raw.match(/^(\s+)(\S.*?)\s*$/);
    if (m && m[1].length <= 6) { const n = m[2].trim(); if (n) (groups[cat] = groups[cat] || []).push(n); }
  }
  // drop empty categories
  for (const k of Object.keys(groups)) if (!groups[k].length) delete groups[k];
  const flat = Object.values(groups).flat();
  return { groups, flat };
}

// User-facing encoder options → HandBrakeCLI encoder ids.
const ENCODERS = [
  { v: 'x264', l: 'H.264 (x264)' },
  { v: 'x265', l: 'H.265 (x265)' },
  { v: 'x265_10bit', l: 'H.265 10-bit' },
  { v: 'svt_av1', l: 'AV1 (SVT)' },
  { v: 'nvenc_h264', l: 'H.264 NVENC (GPU)' },
  { v: 'nvenc_h265', l: 'H.265 NVENC (GPU)' },
  { v: 'nvenc_av1', l: 'AV1 NVENC (GPU)' },
];
const CONTAINERS = { mp4: 'av_mp4', mkv: 'av_mkv', webm: 'av_webm' };
const ENCODER_PRESETS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
const NVENC_PRESETS = ['fastest', 'faster', 'fast', 'medium', 'slow', 'slowest'];
const DENOISE = ['off', 'ultralight', 'light', 'medium', 'strong'];
const SHARPEN = ['off', 'ultralight', 'light', 'medium', 'strong'];

function isNvenc(enc) { return /nvenc/.test(enc); }

// Build the HandBrakeCLI argument list from a validated job spec.
function buildArgs(job, outputPath) {
  const a = ['-i', job.inputPath, '-o', outputPath];

  if (job.preset) a.push('--preset', job.preset);

  const container = (job.container || 'mp4').toLowerCase();
  a.push('--format', CONTAINERS[container] || 'av_mp4');

  const encoder = (ENCODERS.find(e => e.v === job.encoder) ? job.encoder : 'x264');
  a.push('--encoder', encoder);

  // Quality: constant-quality RF (HandBrake's signature) or average bitrate.
  if (job.rateMode === 'bitrate' && job.bitrate) {
    a.push('--vb', String(clamp(job.bitrate, 100, 200000, 6000)));
    if (job.twoPass) a.push('--multi-pass', '--turbo');
  } else {
    a.push('--quality', String(clamp(job.quality != null ? job.quality : 22, 0, 63, 22)));
  }

  // Encoder speed preset (different scale for NVENC).
  if (job.encoderPreset) {
    const valid = isNvenc(encoder) ? NVENC_PRESETS : ENCODER_PRESETS;
    if (valid.includes(job.encoderPreset)) a.push('--encoder-preset', job.encoderPreset);
  }

  // Resolution cap (keeps aspect ratio). 0 = source.
  const maxH = clamp(job.maxHeight || 0, 0, 8000, 0);
  if (maxH > 0) a.push('--maxHeight', String(maxH));

  // Frame rate. "Source" → variable frame rate that matches the original exactly
  // (no resampling = no speed-up, even on variable-frame-rate sources). A chosen
  // rate defaults to constant unless the caller asks for VFR.
  if (job.fps && job.fps !== 'same') { a.push('--rate', String(job.fps)); a.push(job.cfr === false ? '--vfr' : '--cfr'); }
  else { a.push('--vfr'); }

  // Audio.
  if (job.audioMode === 'none') a.push('--audio', 'none');
  else if (job.audioMode === 'aac') a.push('--aencoder', container === 'webm' ? 'opus' : 'av_aac', '--ab', String(clamp(job.audioBitrate || 192, 32, 1024, 192)));
  else a.push('--aencoder', 'copy:*'); // passthrough when possible

  // Subtitles (carry all when the container supports them).
  if (job.subtitles && container !== 'webm') a.push('--all-subtitles');

  // ── Filters (HandBrake's own, battle-tested) ──
  if (job.deinterlace) a.push('--decomb');
  if (job.denoise && job.denoise !== 'off') a.push(`--nlmeans=${job.denoise}`, '--nlmeans-tune=film');
  if (job.deblock) a.push('--deblock=medium');
  if (job.sharpen && job.sharpen !== 'off') a.push(`--lapsharp=${job.sharpen}`);
  if (job.grayscale) a.push('--grayscale');
  if (job.rotate && [90, 180, 270].includes(Number(job.rotate))) a.push(`--rotate=angle=${job.rotate}`);

  if (container === 'mp4' && job.webOptimize) a.push('--optimize'); // faststart

  return { args: a, encoder, container };
}

module.exports = {
  HB_EXE, HB_API_LATEST,
  findExe, detect, parsePresetList, buildArgs, clamp,
  ENCODERS, CONTAINERS, ENCODER_PRESETS, NVENC_PRESETS, DENOISE, SHARPEN,
};
