// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Media Library (Anime Media Manager)
//  Organise / convert / prep legally-owned footage for AE, Premiere, Blender,
//  DaVinci… Pure helpers (probe parsing, series detection, FFmpeg preset builders)
//  here; main.js orchestrates scanning, the JSON library store and transcodes.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');

const VIDEO_EXT = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', 'mts', 'mxf', 'm2v'];
function isVideo(file) { const e = path.extname(file).slice(1).toLowerCase(); return VIDEO_EXT.includes(e); }

// Best-effort series / season / episode detection from a filename.
function parseSeriesInfo(filename) {
  let name = filename.replace(/\.[^.]+$/, '');
  // Strip bracketed groups [..]/(..) and common quality/source tokens so episode
  // numbers at the end aren't masked by tags like "[1080p]" or "x265".
  name = name.replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(/\b(1080p|2160p|720p|480p|4k|x26[45]|h\.?26[45]|hevc|aac|web-?dl|bluray|bd(?:rip)?|hdrip|10bit|8bit|dual|vostfr|multi)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  let series = name, season = null, episode = null;
  const se = name.match(/^(.*?)[._\s-]*[Ss](\d{1,2})[._\s-]*[Ee](\d{1,3})/);
  if (se) { series = se[1]; season = parseInt(se[2], 10); episode = parseInt(se[3], 10); }
  else {
    const ep = name.match(/^(.*?)[._\s-]+(?:[Ee][Pp]?|episode|épisode|#)[._\s-]*(\d{1,3})\b/i);
    if (ep) { series = ep[1]; episode = parseInt(ep[2], 10); }
    else { const m = name.match(/^(.*?)[._\s-]+(\d{1,3})\s*$/); if (m && m[1].length > 2) { series = m[1]; episode = parseInt(m[2], 10); } }
  }
  series = series.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[-–]\s*$/, '').trim();
  if (!series) series = name;
  return { series, season, episode };
}

// ── FFmpeg conversion / export presets (editor-ready) ────────────────────────
const PRESETS = {
  h264:        { label: 'MP4 · H.264',          ext: 'mp4', group: 'Diffusion' },
  h265:        { label: 'MP4 · H.265 (HEVC)',   ext: 'mp4', group: 'Diffusion' },
  prores_proxy:{ label: 'ProRes 422 Proxy',     ext: 'mov', group: 'ProRes' },
  prores_lt:   { label: 'ProRes 422 LT',        ext: 'mov', group: 'ProRes' },
  prores_422:  { label: 'ProRes 422',           ext: 'mov', group: 'ProRes' },
  prores_hq:   { label: 'ProRes 422 HQ',        ext: 'mov', group: 'ProRes' },
  dnxhr_lb:    { label: 'DNxHR LB (léger)',     ext: 'mov', group: 'DNxHR' },
  dnxhr_sq:    { label: 'DNxHR SQ',             ext: 'mov', group: 'DNxHR' },
  dnxhr_hq:    { label: 'DNxHR HQ',             ext: 'mov', group: 'DNxHR' },
  proxy:       { label: 'Proxy 720p (rapide)',  ext: 'mp4', group: 'Proxy' },
};

// Creative-app one-click prep → maps to the codec each app prefers.
const PREP = {
  ae:      { preset: 'prores_hq',  suffix: '_AE',      label: 'After Effects' },
  premiere:{ preset: 'prores_422', suffix: '_Premiere',label: 'Premiere Pro' },
  davinci: { preset: 'dnxhr_hq',   suffix: '_DaVinci', label: 'DaVinci Resolve' },
  blender: { preset: 'h264',       suffix: '_Blender', label: 'Blender' },
  proxy:   { preset: 'proxy',      suffix: '_proxy',   label: 'Proxy' },
};

const PRORES_PROFILE = { prores_proxy: 0, prores_lt: 1, prores_422: 2, prores_hq: 3 };

// Build the ffmpeg args for a preset. Returns { args, ext }.
function buildConvert(preset, inputPath, outputPath) {
  const p = PRESETS[preset] ? preset : 'h264';
  const common = ['-hide_banner', '-nostdin', '-y', '-i', inputPath, '-map', '0:v:0', '-map', '0:a?'];
  let v = [], a = [];
  if (p === 'h264') { v = ['-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']; a = ['-c:a', 'aac', '-b:a', '256k']; }
  else if (p === 'h265') { v = ['-c:v', 'libx265', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-movflags', '+faststart']; a = ['-c:a', 'aac', '-b:a', '256k']; }
  else if (p === 'proxy') { v = ['-vf', 'scale=-2:720', '-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']; a = ['-c:a', 'aac', '-b:a', '128k']; }
  else if (p.startsWith('prores')) { v = ['-c:v', 'prores_ks', '-profile:v', String(PRORES_PROFILE[p] ?? 2), '-vendor', 'apl0', '-pix_fmt', 'yuv422p10le']; a = ['-c:a', 'pcm_s16le']; }
  else if (p.startsWith('dnxhr')) { v = ['-c:v', 'dnxhd', '-profile:v', p, '-pix_fmt', 'yuv422p']; a = ['-c:a', 'pcm_s16le']; }
  return { args: [...common, ...v, ...a, outputPath], ext: PRESETS[p].ext, preset: p };
}

function outputName(inputPath, preset, suffix, outDir, ext) {
  const base = path.basename(inputPath, path.extname(inputPath));
  const dir = outDir || path.dirname(inputPath);
  let out = path.join(dir, `${base}${suffix || ('_' + preset)}.${ext}`);
  if (path.resolve(out) === path.resolve(inputPath)) out = path.join(dir, `${base}${suffix || ('_' + preset)}_out.${ext}`);
  return out;
}

module.exports = { VIDEO_EXT, isVideo, parseSeriesInfo, PRESETS, PREP, buildConvert, outputName };
