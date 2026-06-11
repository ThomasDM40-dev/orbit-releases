// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · AI Background Removal (Robust Video Matting, ONNX)
//  Detours a subject to alpha — no green screen needed. Streaming pipeline:
//    ffmpeg(decode, scaled) → RVM onnx (recurrent) → alpha video → ffmpeg(composite)
//  Pure model spec + ffmpeg arg builders + validation here; main.js runs the
//  onnxruntime loop & spawns. Engine validated end-to-end before shipping.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');

// Official RVM ONNX models (PeterL1n/RobustVideoMatting, releases v1.0.0).
const MODELS = {
  mobilenetv3: { file: 'rvm_mobilenetv3_fp32.onnx', url: 'https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_mobilenetv3_fp32.onnx', label: 'MobileNetV3 (rapide)', minBytes: 10 * 1024 * 1024 },
  resnet50:    { file: 'rvm_resnet50_fp32.onnx',    url: 'https://github.com/PeterL1n/RobustVideoMatting/releases/download/v1.0.0/rvm_resnet50_fp32.onnx',    label: 'ResNet50 (qualité)', minBytes: 90 * 1024 * 1024 },
};

function clamp(v, lo, hi, dflt) { const n = Number(v); if (!Number.isFinite(n)) return dflt; return Math.min(hi, Math.max(lo, n)); }
function even(n) { n = Math.round(n); return n % 2 ? n + 1 : n; }

// Processing resolution (speed/quality) + RVM downsample_ratio recommendation.
function procSize(srcW, srcH, quality) {
  const capW = quality === 'fast' ? 512 : quality === 'max' ? Math.min(srcW, 1920) : 960;
  const w = Math.min(srcW || capW, capW);
  const h = even((srcH || (w * 9 / 16)) * w / (srcW || w));
  const ratio = w >= 1280 ? 0.25 : w >= 854 ? 0.375 : 0.5;
  return { pw: even(w), ph: h, ratio };
}

function decodeArgs(input, pw, ph, fps) {
  return ['-hide_banner', '-nostdin', '-i', input, '-vf', `scale=${pw}:${ph}:flags=bilinear`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-vsync', 'cfr', '-r', String(fps), 'pipe:1'];
}
function alphaEncodeArgs(pw, ph, fps, alphaPath) {
  return ['-hide_banner', '-nostdin', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${pw}x${ph}`, '-r', String(fps), '-i', 'pipe:0', '-c:v', 'ffv1', '-g', '1', alphaPath];
}

const CONTAINER_EXT = { mp4: 'mp4', mov: 'mov', webm: 'webm', png: 'png', mkv: 'mkv' };

// Stage B: composite original + alpha into the requested background.
// opts: { mode:'transparent'|'green'|'color'|'blur'|'image', color, bgImage, transparentFormat:'webm'|'prores'|'png', blurStrength, hasAudio, fps, outputDir }
function compositeArgs(input, alphaPath, W, H, opts, outputPath) {
  const fps = opts.fps || 30;
  const a = ['-hide_banner', '-nostdin', '-y', '-i', input, '-i', alphaPath];
  const alphaChain = `[1:v]scale=${W}:${H},format=gray[a];[0:v][a]alphamerge[fg]`;
  let filter, vcodec = [], map = ['-map', '[o]'];
  // Audio codec MUST match the container: WebM → Opus, PNG seq → none, else AAC.
  const tf = opts.transparentFormat || 'webm';
  const noAudio = !opts.hasAudio || (opts.mode === 'transparent' && tf === 'png');
  const audio = noAudio ? ['-an']
    : (opts.mode === 'transparent' && tf === 'webm') ? ['-map', '0:a?', '-c:a', 'libopus', '-b:a', '192k']
      : ['-map', '0:a?', '-c:a', 'aac', '-b:a', '192k'];

  if (opts.mode === 'transparent') {
    filter = `${alphaChain};[fg]copy[o]`;
    const f = opts.transparentFormat || 'webm';
    if (f === 'prores') vcodec = ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le'];
    else if (f === 'png') { filter = `${alphaChain};[fg]copy[o]`; vcodec = ['-c:v', 'png']; }
    else vcodec = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24'];
  } else if (opts.mode === 'green' || opts.mode === 'color') {
    const c = opts.mode === 'green' ? '0x00FF00' : (opts.color || '0x000000');
    filter = `${alphaChain};color=c=${c}:s=${W}x${H}:r=${fps}[bg];[bg][fg]overlay=shortest=1[o]`;
    vcodec = ['-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-movflags', '+faststart'];
  } else if (opts.mode === 'blur') {
    const s = clamp(opts.blurStrength || 20, 2, 60, 20);
    filter = `${alphaChain};[0:v]boxblur=${s}[bg];[bg][fg]overlay=shortest=1[o]`;
    vcodec = ['-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-movflags', '+faststart'];
  } else if (opts.mode === 'image' && opts.bgImage) {
    a.push('-i', opts.bgImage);
    filter = `${alphaChain};[2:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[bg];[bg][fg]overlay=shortest=1[o]`;
    vcodec = ['-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-movflags', '+faststart'];
  } else {
    filter = `${alphaChain};[fg]copy[o]`;
    vcodec = ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24'];
  }
  return [...a, '-filter_complex', filter, ...map, ...vcodec, ...audio, outputPath];
}

function outputPathFor(input, mode, transparentFormat, outDir) {
  const base = path.basename(input, path.extname(input));
  const dir = outDir || path.dirname(input);
  let ext = 'mp4';
  if (mode === 'transparent') ext = transparentFormat === 'prores' ? 'mov' : transparentFormat === 'png' ? 'png' : 'webm';
  let suffix = mode === 'transparent' ? '_alpha' : mode === 'green' ? '_greenscreen' : '_bg';
  if (mode === 'transparent' && transparentFormat === 'png') return path.join(dir, `${base}_alpha_%05d.png`);
  let out = path.join(dir, `${base}${suffix}.${ext}`);
  if (path.resolve(out) === path.resolve(input)) out = path.join(dir, `${base}${suffix}_out.${ext}`);
  return out;
}

module.exports = { MODELS, procSize, decodeArgs, alphaEncodeArgs, compositeArgs, outputPathFor, CONTAINER_EXT, clamp, even };
