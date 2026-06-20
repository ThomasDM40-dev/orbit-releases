// ── Local Stable Diffusion 1.5 Inpainting (ONNX · CPU · 100% local) ────────────
// True generative fill: the UNet is conditioned on the surrounding photo
// (masked-image latent + mask channels), so the result blends with the scene
// instead of being a random text-to-image picture.
//
// Weights are fp16. onnxruntime-node's CPU binding can only read fp16 tensors
// that are backed by Uint16Array — and ort-common silently re-wraps Uint16Array
// into Float16Array when the latter exists (Node ≥22/25). So we capture the
// native Float16Array (for fast fp32↔fp16 conversion) and hide it globally
// before ORT initialises its float16 type map. Nothing else in the app uses
// fp16, so this is safe.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const F16 = globalThis.Float16Array;
const HAS_F16 = typeof F16 === 'function';
try { Object.defineProperty(globalThis, 'Float16Array', { value: undefined, configurable: true }); } catch (e) {}

const SCALE = 0.18215;
const SIZE = 512, LAT = 64, NLAT = 4 * LAT * LAT;

// fp32 → fp16(Uint16Array) and back. Falls back to a manual codec if the native
// Float16Array is unavailable (older runtimes).
let f32ToU16, u16ToF32;
if (HAS_F16) {
  f32ToU16 = (f32) => { const h = new F16(f32); return new Uint16Array(h.buffer, h.byteOffset, h.length); };
  u16ToF32 = (u16) => { const h = new F16(u16.buffer, u16.byteOffset, u16.length); return Float32Array.from(h); };
} else {
  const fround = Math.fround;
  f32ToU16 = (f32) => {
    const o = new Uint16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      let x = fround(f32[i]); const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x);
      const u = b.getUint32(0); const sign = (u >>> 16) & 0x8000; let exp = ((u >>> 23) & 0xff) - 127 + 15; let man = (u >>> 13) & 0x3ff;
      if (exp <= 0) { o[i] = sign; } else if (exp >= 0x1f) { o[i] = sign | 0x7c00; } else { o[i] = sign | (exp << 10) | man; }
    }
    return o;
  };
  u16ToF32 = (u16) => {
    const o = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) {
      const h = u16[i]; const sign = (h & 0x8000) << 16; let exp = (h >> 10) & 0x1f; let man = h & 0x3ff; let val;
      if (exp === 0) { val = man / 1024 * Math.pow(2, -14); } else if (exp === 0x1f) { val = man ? NaN : Infinity; } else { val = (1 + man / 1024) * Math.pow(2, exp - 15); }
      const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, sign); o[i] = (sign ? -1 : 1) * val;
    }
    return o;
  };
}

// ── Model descriptors (SD1.5 inpainting, diffusers ONNX, fp16) ────────────────
const HF = 'https://huggingface.co/RanaLLC/stable-diffusion-v1-5-inpainting-onnx-fp16/resolve/main';
const SD = {
  totalLabel: '~2,1 Go',
  files: [
    { url: HF + '/text_encoder/model.onnx', file: 'text_encoder.onnx', min: 200 * 1e6, label: 'encodeur de texte' },
    { url: HF + '/vae_encoder/model.onnx', file: 'vae_encoder.onnx', min: 50 * 1e6, label: 'VAE (analyse)' },
    { url: HF + '/vae_decoder/model.onnx', file: 'vae_decoder.onnx', min: 80 * 1e6, label: 'VAE (rendu)' },
    { url: HF + '/unet/model.onnx', file: 'unet.onnx', min: 1500 * 1e6, label: 'UNet (~1,7 Go)' },
    { url: HF + '/tokenizer/vocab.json', file: 'vocab.json', min: 800 * 1e3, label: 'vocabulaire' },
    { url: HF + '/tokenizer/merges.txt', file: 'merges.txt', min: 300 * 1e3, label: 'fusions BPE' },
  ],
};

function sdInstalled(dir) {
  try { return SD.files.every(f => { const p = path.join(dir, f.file); return fs.existsSync(p) && fs.statSync(p).size >= f.min; }); } catch (e) { return false; }
}

async function installSd(dir, onLog) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const f of SD.files) {
    const dest = path.join(dir, f.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size >= f.min) continue;
    onLog && onLog(`Téléchargement du moteur SD local — ${f.label}…`);
    await new Promise((resolve, reject) => {
      const c = spawn('curl', ['-L', '--output', dest, '--progress-bar', '--retry', '3', f.url]);
      c.on('error', e => reject(new Error('curl indisponible: ' + e.message)));
      c.stderr.on('data', d => { const s = d.toString().replace(/\r/g, '\n').split('\n').filter(Boolean).pop(); if (s) onLog && onLog(`${f.label}: ${s.trim()}`); });
      c.on('close', code => code === 0 ? resolve() : reject(new Error('Téléchargement échoué (curl ' + code + ')')));
    });
    if (!fs.existsSync(dest) || fs.statSync(dest).size < f.min) { try { fs.unlinkSync(dest); } catch (e) {} throw new Error('Modèle SD incomplet (' + f.label + ').'); }
  }
  return dir;
}

// ── CLIP BPE tokenizer (matches HF CLIPTokenizer) ─────────────────────────────
function bytesToUnicode() {
  const bs = [];
  for (let i = 33; i <= 126; i++) bs.push(i);
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice(); let n = 0;
  for (let b = 0; b < 256; b++) { if (!bs.includes(b)) { bs.push(b); cs.push(256 + n); n++; } }
  const map = {}; for (let i = 0; i < bs.length; i++) map[bs[i]] = String.fromCharCode(cs[i]); return map;
}
function getPairs(word) { const p = new Set(); for (let i = 0; i < word.length - 1; i++) p.add(word[i] + ' ' + word[i + 1]); return p; }
class CLIPTokenizer {
  constructor(vocabPath, mergesPath) {
    this.encoder = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    const merges = fs.readFileSync(mergesPath, 'utf8').split('\n').slice(1).filter(l => l && !l.startsWith('#'));
    this.bpeRanks = {}; merges.forEach((m, i) => { const p = m.split(/\s+/); if (p.length === 2) this.bpeRanks[p[0] + ' ' + p[1]] = i; });
    this.byteEncoder = bytesToUnicode();
    this.bos = this.encoder['<|startoftext|>']; this.eos = this.encoder['<|endoftext|>']; this.cache = {};
    this.pat = /<\|startoftext\|>|<\|endoftext\|>|'s|'t|'re|'ve|'m|'ll|'d|\p{L}+|\p{N}|[^\s\p{L}\p{N}]+/giu;
  }
  bpe(token) {
    if (this.cache[token] != null) return this.cache[token];
    let word = token.split(''); word[word.length - 1] += '</w>';
    let pairs = getPairs(word); if (pairs.size === 0) return token + '</w>';
    while (true) {
      let minRank = Infinity, bigram = null;
      for (const p of pairs) { const r = this.bpeRanks[p]; if (r !== undefined && r < minRank) { minRank = r; bigram = p; } }
      if (bigram === null) break;
      const sp = bigram.split(' '), first = sp[0], second = sp[1], nw = []; let i = 0;
      while (i < word.length) {
        const j = word.indexOf(first, i);
        if (j === -1) { for (let k = i; k < word.length; k++) nw.push(word[k]); break; }
        for (let k = i; k < j; k++) nw.push(word[k]); i = j;
        if (word[i] === first && i < word.length - 1 && word[i + 1] === second) { nw.push(first + second); i += 2; } else { nw.push(word[i]); i += 1; }
      }
      word = nw; if (word.length === 1) break; pairs = getPairs(word);
    }
    const out = word.join(' '); this.cache[token] = out; return out;
  }
  encode(text) {
    const clean = text.replace(/\s+/g, ' ').trim().toLowerCase(); const ids = [];
    for (const tok of (clean.match(this.pat) || [])) {
      let mapped = ''; for (const b of Buffer.from(tok, 'utf8')) mapped += this.byteEncoder[b];
      for (const bt of this.bpe(mapped).split(' ')) { const id = this.encoder[bt]; if (id !== undefined) ids.push(id); }
    }
    return ids;
  }
  tokenize(text, maxLen = 77) {
    let ids = this.encode(text); if (ids.length > maxLen - 2) ids = ids.slice(0, maxLen - 2);
    ids = [this.bos].concat(ids, [this.eos]); while (ids.length < maxLen) ids.push(this.eos); return ids;
  }
}

// ── DDIM scheduler (scaled_linear, epsilon, leading, steps_offset=1) ──────────
function makeScheduler(numTrain = 1000) {
  const betas = new Float64Array(numTrain), bs = Math.sqrt(0.00085), be = Math.sqrt(0.012);
  for (let i = 0; i < numTrain; i++) { const b = bs + (be - bs) * i / (numTrain - 1); betas[i] = b * b; }
  const acp = new Float64Array(numTrain); let c = 1; for (let i = 0; i < numTrain; i++) { c *= (1 - betas[i]); acp[i] = c; }
  return { acp, numTrain, finalAlpha: acp[0] };
}
function makeTimesteps(sched, steps, offset = 1) {
  const ratio = Math.floor(sched.numTrain / steps), ts = [];
  for (let i = 0; i < steps; i++) ts.push(Math.round(i * ratio) + offset);
  ts.reverse(); return { ts, ratio };
}
function ddimStep(sched, ratio, eps, t, sample) {
  const prevT = t - ratio, at = sched.acp[t], atPrev = prevT >= 0 ? sched.acp[prevT] : sched.finalAlpha;
  const sqrtAt = Math.sqrt(at), sqrtBt = Math.sqrt(1 - at), sqrtAtPrev = Math.sqrt(atPrev), sqrtBtPrev = Math.sqrt(1 - atPrev);
  const out = new Float32Array(sample.length);
  for (let i = 0; i < sample.length; i++) { const pred0 = (sample[i] - sqrtBt * eps[i]) / sqrtAt; out[i] = sqrtAtPrev * pred0 + sqrtBtPrev * eps[i]; }
  return out;
}
function randn(n, seed) {
  let s = (seed >>> 0) || 0x2545f491; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 2) { let u = rnd(); if (u < 1e-7) u = 1e-7; const v = rnd(), r = Math.sqrt(-2 * Math.log(u)); out[i] = r * Math.cos(2 * Math.PI * v); if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v); }
  return out;
}

// Cached sessions (avoid reloading 1.7 GB on each edit).
let _sess = null, _tok = null, _dir = null, _device = null; // 'gpu' | 'cpu'

// Create a session on the GPU (DirectML — works on any Windows GPU, no extra
// install) and fall back to CPU per-session if that fails (old driver, low VRAM…).
async function makeSession(ort, file) {
  try {
    const s = await ort.InferenceSession.create(file, { executionProviders: ['dml'], graphOptimizationLevel: 'all' });
    if (_device !== 'cpu') _device = 'gpu';
    return s;
  } catch (e) {
    const s = await ort.InferenceSession.create(file, { executionMode: 'parallel', graphOptimizationLevel: 'all' });
    _device = 'cpu';
    return s;
  }
}
function getDevice() { return _device; }

async function getSessions(ort, dir) {
  if (_sess && _dir === dir) return _sess;
  _device = null;
  // UNet first so the GPU/CPU decision is driven by the model that dominates cost.
  const unet = await makeSession(ort, path.join(dir, 'unet.onnx'));
  const te = await makeSession(ort, path.join(dir, 'text_encoder.onnx'));
  const vaeEnc = await makeSession(ort, path.join(dir, 'vae_encoder.onnx'));
  const vaeDec = await makeSession(ort, path.join(dir, 'vae_decoder.onnx'));
  _sess = { te, vaeEnc, vaeDec, unet }; _dir = dir;
  _tok = new CLIPTokenizer(path.join(dir, 'vocab.json'), path.join(dir, 'merges.txt'));
  return _sess;
}

// Run inpainting on a 512×512 window. Returns an rgb24 Buffer (512*512*3).
//   ort, ff, ffDecodeRaw — supplied by main.js
//   imagePath/maskPath + cropStr — ffmpeg crop expression for the work window
async function runSdInpaint(opts) {
  const { ort, ff, ffDecodeRaw, modelDir, imagePath, maskPath, cropStr,
    prompt, negPrompt = 'blurry, low quality, distorted, deformed, watermark, text',
    steps = 22, guidance = 7.5, seed = (Math.random() * 1e9) | 0, onStep } = opts;
  const { te, vaeEnc, vaeDec, unet } = await getSessions(ort, modelDir);
  const tok = _tok;

  const encEhs = async (text) => {
    const ids = Int32Array.from(tok.tokenize(text));
    const o = await te.run({ input_ids: new ort.Tensor('int32', ids, [1, 77]) });
    return o.last_hidden_state;
  };
  const ehsCond = await encEhs(prompt || 'high quality photo');
  const ehsUncond = await encEhs(negPrompt);

  // Decode the work window to raw 512.
  const imgRaw = await ffDecodeRaw(ff, imagePath, SIZE, SIZE, 'rgb24', cropStr);
  const maskRaw = await ffDecodeRaw(ff, maskPath, SIZE, SIZE, 'gray', cropStr);

  const maskPix = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) maskPix[i] = maskRaw[i] > 127 ? 1 : 0;
  const maskedImg = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) { const keep = maskPix[i] > 0.5 ? 0 : 1; for (let c = 0; c < 3; c++) maskedImg[c * SIZE * SIZE + i] = (imgRaw[i * 3 + c] / 255 * 2 - 1) * keep; }

  const meOut = await vaeEnc.run({ sample: new ort.Tensor('float16', f32ToU16(maskedImg), [1, 3, SIZE, SIZE]) });
  const maskedLat = u16ToF32(meOut.latent_sample.data); for (let i = 0; i < maskedLat.length; i++) maskedLat[i] *= SCALE;

  const maskLat = new Float32Array(LAT * LAT);
  for (let y = 0; y < LAT; y++) for (let x = 0; x < LAT; x++) { let m = 0; const y0 = y * 8, x0 = x * 8; for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const v = maskPix[(y0 + yy) * SIZE + (x0 + xx)]; if (v > m) m = v; } maskLat[y * LAT + x] = m; }

  const sched = makeScheduler();
  const { ts, ratio } = makeTimesteps(sched, steps);
  let latents = randn(NLAT, seed);

  for (let si = 0; si < ts.length; si++) {
    const t = ts[si];
    const inp = new Float32Array(9 * LAT * LAT);
    inp.set(latents, 0); inp.set(maskLat, 4 * LAT * LAT); inp.set(maskedLat, 5 * LAT * LAT);
    const inT = () => new ort.Tensor('float16', f32ToU16(inp), [1, 9, LAT, LAT]);
    const tT = () => new ort.Tensor('float16', f32ToU16(new Float32Array([t])), [1]);
    const oU = await unet.run({ sample: inT(), timestep: tT(), encoder_hidden_states: ehsUncond });
    const oC = await unet.run({ sample: inT(), timestep: tT(), encoder_hidden_states: ehsCond });
    const eU = u16ToF32(oU.out_sample.data), eC = u16ToF32(oC.out_sample.data), eps = new Float32Array(NLAT);
    for (let i = 0; i < NLAT; i++) eps[i] = eU[i] + guidance * (eC[i] - eU[i]);
    latents = ddimStep(sched, ratio, eps, t, latents);
    if (onStep) onStep(si + 1, ts.length);
  }

  const decIn = new Float32Array(NLAT); for (let i = 0; i < NLAT; i++) decIn[i] = latents[i] / SCALE;
  const dOut = await vaeDec.run({ latent_sample: new ort.Tensor('float16', f32ToU16(decIn), [1, 4, LAT, LAT]) });
  const dec = u16ToF32(dOut.sample.data);
  const out = Buffer.allocUnsafe(SIZE * SIZE * 3);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) { let v = (dec[c * SIZE * SIZE + i] / 2 + 0.5) * 255; out[i * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : v | 0; }
  return out;
}

module.exports = { SD, SIZE, sdInstalled, installSd, runSdInpaint, getDevice };
