// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Convertisseur Pro — conversion intelligence (pure logic)
//  Inspired by Helix Converter: one tool, many categories, drag-drop + batch.
//  This module holds CLASSIFICATION, the format MATRIX, ffmpeg ARG BUILDERS and
//  pure-JS LUT parsing/writing. main.js orchestrates picking, probing & spawning.
//  No spawning / no Electron here → trivially unit-testable.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

// ── Category detection ───────────────────────────────────────────────────────
const EXT_CATEGORY = {
  // video
  mp4: 'video', mov: 'video', mkv: 'video', webm: 'video', avi: 'video', gif: 'video', m4v: 'video', flv: 'video', wmv: 'video', ts: 'video', mpg: 'video', mpeg: 'video',
  // audio
  wav: 'audio', mp3: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', m4a: 'audio', wma: 'audio', aiff: 'audio',
  // image
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', avif: 'image', tiff: 'image', tif: 'image', bmp: 'image', heic: 'image', heif: 'image',
  // lut
  cube: 'lut', '3dl': 'lut', csp: 'lut', mga: 'lut',
  // font
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
  // documents
  docx: 'doc', xlsx: 'doc', pptx: 'doc', doc: 'doc', xls: 'doc', ppt: 'doc', odt: 'doc', md: 'doc', markdown: 'doc',
  // 3d models
  gltf: 'model', glb: 'model', obj: 'model', stl: 'model', ply: 'model', fbx: 'model',
  // after effects
  ffx: 'ae', aep: 'ae', mbl: 'ae', rgx: 'ae',
};

function extOf(p) { return path.extname(String(p || '')).replace('.', '').toLowerCase(); }
function classify(p) { return EXT_CATEGORY[extOf(p)] || null; }

// ── Output targets per category (Phase 1 enables: video, audio, image, lut) ──
const TARGETS = {
  video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'gif'],
  audio: ['wav', 'mp3', 'flac', 'aac', 'ogg', 'opus', 'm4a'],
  image: ['png', 'jpg', 'webp', 'avif', 'tiff', 'bmp'],
  lut: ['cube', '3dl'],
  // OTF (CFF) output isn't supported by the engine; OTF is read-only as a source.
  font: ['ttf', 'woff', 'woff2'],
  doc: ['pdf', 'html'],
  // GLB is the self-contained web3D target; OBJ/STL/PLY via our own exporters.
  // (.gltf as output is intentionally omitted to avoid multi-file naming issues.)
  model: ['glb', 'obj', 'stl', 'ply'],
  ae: ['ffx', 'aep'],
};

// Which categories are actually wired to a working engine right now.
const ENABLED = { video: true, audio: true, image: true, lut: true, font: true, doc: true, model: true, ae: false };

// Documents have per-source targets (a spreadsheet can become CSV, a doc can't).
const DOC_TARGETS = { md: ['html', 'pdf'], markdown: ['html', 'pdf'], docx: ['pdf', 'html'], xlsx: ['pdf', 'html', 'csv'], xls: ['pdf', 'html', 'csv'] };

function targetsFor(p) {
  const cat = classify(p);
  if (!cat) return [];
  if (cat === 'doc') return DOC_TARGETS[extOf(p)] || [];
  // Don't offer the input's own extension as a target.
  return (TARGETS[cat] || []).filter(t => t !== extOf(p));
}

const CATEGORY_LABELS = { video: 'Vidéo', audio: 'Audio', image: 'Image', lut: 'LUT / Couleur', font: 'Police', doc: 'Document', model: '3D', ae: 'After Effects' };

// ── ffmpeg argument builders (video / audio / image) ─────────────────────────
// `info` may carry probed { width, height, durationSec } for adaptive choices.
function buildFfmpegArgs(category, inputPath, outputPath, target, info = {}) {
  const tgt = target.toLowerCase();
  const base = ['-y', '-i', inputPath];

  if (category === 'video') {
    if (tgt === 'gif') {
      const w = Math.min(640, info.width || 480);
      return [...base, '-vf', `fps=15,scale=${w}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, '-loop', '0', outputPath];
    }
    if (tgt === 'webm') return [...base, '-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '160k', outputPath];
    if (tgt === 'avi') return [...base, '-c:v', 'mpeg4', '-qscale:v', '3', '-c:a', 'libmp3lame', '-qscale:a', '4', outputPath];
    // mp4 / mov / mkv — H.264 + AAC, source-adaptive (keeps resolution, visually lossless CRF)
    return [...base, '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', outputPath];
  }

  if (category === 'audio') {
    const a = ['-vn'];
    if (tgt === 'wav') a.push('-c:a', 'pcm_s16le');
    else if (tgt === 'mp3') a.push('-c:a', 'libmp3lame', '-q:a', '2');
    else if (tgt === 'flac') a.push('-c:a', 'flac');
    else if (tgt === 'aac' || tgt === 'm4a') a.push('-c:a', 'aac', '-b:a', '256k');
    else if (tgt === 'ogg') a.push('-c:a', 'libvorbis', '-q:a', '5');
    else if (tgt === 'opus') a.push('-c:a', 'libopus', '-b:a', '160k');
    return [...base, ...a, outputPath];
  }

  if (category === 'image') {
    const a = [];
    if (tgt === 'jpg' || tgt === 'jpeg') a.push('-q:v', '2');
    else if (tgt === 'webp') a.push('-quality', '90');
    else if (tgt === 'avif') a.push('-c:v', 'libaom-av1', '-still-picture', '1', '-crf', '24');
    return [...base, ...a, '-frames:v', '1', outputPath];
  }

  return null;
}

// ── LUT conversion (pure JS, lossless math) ──────────────────────────────────
// Internal model: { size: N, data: Float32Array(N*N*N*3) }, R-fastest ordering:
//   idx(r,g,b) = ((b*N + g)*N + r) * 3   with channel values in [0,1].

function parseCube(text) {
  let size = 0; const vals = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^TITLE/i.test(line) || /^DOMAIN_(MIN|MAX)/i.test(line) || /^LUT_1D_SIZE/i.test(line)) continue;
    const m = line.match(/^LUT_3D_SIZE\s+(\d+)/i);
    if (m) { size = parseInt(m[1], 10); continue; }
    const parts = line.split(/\s+/).map(Number);
    if (parts.length >= 3 && parts.every(n => Number.isFinite(n))) vals.push(parts[0], parts[1], parts[2]);
  }
  if (!size || vals.length !== size * size * size * 3) throw new Error('Fichier .cube invalide ou non 3D.');
  return { size, data: Float32Array.from(vals) };
}

function writeCube(lut) {
  const { size, data } = lut;
  const out = [`# Generated by Orbit`, `LUT_3D_SIZE ${size}`, `DOMAIN_MIN 0.0 0.0 0.0`, `DOMAIN_MAX 1.0 1.0 1.0`, ''];
  for (let i = 0; i < size * size * size; i++) {
    const o = i * 3;
    out.push(`${data[o].toFixed(6)} ${data[o + 1].toFixed(6)} ${data[o + 2].toFixed(6)}`);
  }
  return out.join('\n') + '\n';
}

// Autodesk Lustre .3dl: a mesh line then N^3 integer triplets, BLUE fastest.
function parse3dl(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let mesh = null; const rows = [];
  for (const line of lines) {
    const nums = line.split(/\s+/).map(Number);
    if (!nums.every(n => Number.isFinite(n))) continue;
    if (!mesh && nums.length > 3) { mesh = nums; continue; }   // mesh/index line
    if (nums.length === 3) rows.push(nums);
  }
  const N = mesh ? mesh.length : Math.round(Math.cbrt(rows.length));
  if (N * N * N !== rows.length) throw new Error('Fichier .3dl invalide.');
  // Infer bit-depth from the max value (10-bit→1023, 12-bit→4095, etc.).
  let max = 0; for (const r of rows) for (const v of r) if (v > max) max = v;
  const scale = max > 4095 ? 65535 : max > 1023 ? 4095 : max > 255 ? 1023 : 255;
  const data = new Float32Array(N * N * N * 3);
  // .3dl order: blue fastest → row index k = (r*N + g)*N + b.
  let k = 0;
  for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
    const row = rows[k++];
    const idx = ((b * N + g) * N + r) * 3;
    data[idx] = row[0] / scale; data[idx + 1] = row[1] / scale; data[idx + 2] = row[2] / scale;
  }
  return { size: N, data };
}

function write3dl(lut) {
  const { size: N, data } = lut;
  // 10-bit mesh, evenly spaced.
  const mesh = []; for (let i = 0; i < N; i++) mesh.push(Math.round((i / (N - 1)) * 1023));
  const out = [mesh.join(' ')];
  for (let r = 0; r < N; r++) for (let g = 0; g < N; g++) for (let b = 0; b < N; b++) {
    const idx = ((b * N + g) * N + r) * 3;
    out.push(`${Math.round(data[idx] * 1023)} ${Math.round(data[idx + 1] * 1023)} ${Math.round(data[idx + 2] * 1023)}`);
  }
  return out.join('\n') + '\n';
}

function parseLut(inputPath) {
  const ext = extOf(inputPath);
  const text = fs.readFileSync(inputPath, 'utf8');
  if (ext === 'cube') return parseCube(text);
  if (ext === '3dl') return parse3dl(text);
  throw new Error(`Lecture LUT .${ext} non supportée pour le moment.`);
}

function convertLut(inputPath, outputPath, target) {
  const lut = parseLut(inputPath);
  const tgt = target.toLowerCase();
  let text;
  if (tgt === 'cube') text = writeCube(lut);
  else if (tgt === '3dl') text = write3dl(lut);
  else throw new Error(`Écriture LUT .${tgt} non supportée pour le moment.`);
  fs.writeFileSync(outputPath, text, 'utf8');
  return outputPath;
}

// ── Fonts (pure-JS via fonteditor-core; reads ttf/otf/woff/woff2) ────────────
let _woff2Ready = null;
async function ensureWoff2() {
  const { woff2 } = require('fonteditor-core');
  if (!_woff2Ready) _woff2Ready = woff2.init();
  await _woff2Ready;
}
async function convertFont(inputPath, outputPath, target) {
  const { Font } = require('fonteditor-core');
  const srcType = extOf(inputPath);
  const dstType = String(target).toLowerCase();
  if (srcType === 'woff2' || dstType === 'woff2') await ensureWoff2();
  const buffer = fs.readFileSync(inputPath);
  const font = Font.create(buffer, { type: srcType, hinting: true, kerning: true });
  let out = font.write({ type: dstType, hinting: true, toBuffer: true });
  if (out instanceof ArrayBuffer) out = Buffer.from(out);
  else if (!Buffer.isBuffer(out)) out = Buffer.from(out);
  fs.writeFileSync(outputPath, out);
  return outputPath;
}

// ── 3D models (Assimp/WASM import → GLB; our own OBJ/STL/PLY exporters) ───────
let _ajs = null;
async function ensureAssimp() { if (!_ajs) _ajs = await require('assimpjs')(); return _ajs; }

async function assimpToGlb(inputPath) {
  const ajs = await ensureAssimp();
  const list = new ajs.FileList();
  list.AddFile(path.basename(inputPath), new Uint8Array(fs.readFileSync(inputPath)));
  const res = ajs.ConvertFileList(list, 'glb2');
  if (!res.IsSuccess()) throw new Error('Lecture du modèle 3D échouée (format non pris en charge ?).');
  for (let i = 0; i < res.FileCount(); i++) { const f = res.GetFile(i); if (/\.glb$/i.test(f.GetPath())) return Buffer.from(f.GetContent()); }
  return Buffer.from(res.GetFile(0).GetContent());
}

// --- minimal 4x4 matrix maths (column-major, glTF convention) ---
function matMul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function matFromTRS(t, r, s) {
  const [x, y, z, w] = r; const [sx, sy, sz] = s; const [tx, ty, tz] = t;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
function applyMat(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('GLB invalide.');
  let off = 12, json = null, bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off); const type = buf.readUInt32LE(off + 4); const start = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(buf.slice(start, start + len).toString('utf8'));
    else if (type === 0x004e4942) bin = buf.slice(start, start + len);
    off = start + len;
  }
  return { json, bin };
}

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUMC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gltf, bin, idx) {
  const acc = gltf.accessors[idx];
  const bv = gltf.bufferViews[acc.bufferView];
  const Ctor = COMP[acc.componentType];
  const comps = NUMC[acc.type];
  const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  // Assume tightly packed (Assimp output) — no interleaving.
  return new Ctor(bin.buffer, bin.byteOffset + byteOffset, acc.count * comps);
}

// Merge all primitives into one triangle soup, baking node world transforms.
function extractGeometry(glb) {
  const { json: g, bin } = glb;
  const positions = []; const indices = [];
  const nodeWorld = (node, parent) => {
    const local = node.matrix ? node.matrix : matFromTRS(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
    return parent ? matMul(parent, local) : local;
  };
  const visit = (nodeIdx, parentMat) => {
    const node = g.nodes[nodeIdx];
    const world = nodeWorld(node, parentMat);
    if (node.mesh != null) {
      for (const prim of g.meshes[node.mesh].primitives) {
        if (prim.attributes.POSITION == null) continue;
        const pos = readAccessor(g, bin, prim.attributes.POSITION);
        const baseVert = positions.length / 3;
        for (let i = 0; i < pos.length; i += 3) { const p = applyMat(world, pos[i], pos[i + 1], pos[i + 2]); positions.push(p[0], p[1], p[2]); }
        if (prim.indices != null) { const idx = readAccessor(g, bin, prim.indices); for (let i = 0; i < idx.length; i++) indices.push(baseVert + idx[i]); }
        else { const n = pos.length / 3; for (let i = 0; i < n; i++) indices.push(baseVert + i); }
      }
    }
    for (const c of (node.children || [])) visit(c, world);
  };
  const scene = g.scenes[g.scene || 0];
  for (const n of scene.nodes) visit(n, null);
  return { positions, indices };
}

function writeObj(geo) {
  const out = ['# Generated by Orbit'];
  for (let i = 0; i < geo.positions.length; i += 3) out.push(`v ${geo.positions[i]} ${geo.positions[i + 1]} ${geo.positions[i + 2]}`);
  for (let i = 0; i < geo.indices.length; i += 3) out.push(`f ${geo.indices[i] + 1} ${geo.indices[i + 1] + 1} ${geo.indices[i + 2] + 1}`);
  return out.join('\n') + '\n';
}
function writePly(geo) {
  const nv = geo.positions.length / 3, nf = geo.indices.length / 3;
  const out = ['ply', 'format ascii 1.0', 'comment Generated by Orbit', `element vertex ${nv}`, 'property float x', 'property float y', 'property float z', `element face ${nf}`, 'property list uchar int vertex_indices', 'end_header'];
  for (let i = 0; i < geo.positions.length; i += 3) out.push(`${geo.positions[i]} ${geo.positions[i + 1]} ${geo.positions[i + 2]}`);
  for (let i = 0; i < geo.indices.length; i += 3) out.push(`3 ${geo.indices[i]} ${geo.indices[i + 1]} ${geo.indices[i + 2]}`);
  return out.join('\n') + '\n';
}
function writeStlBinary(geo) {
  const nf = geo.indices.length / 3;
  const buf = Buffer.alloc(84 + nf * 50);
  buf.write('Orbit STL export', 0); buf.writeUInt32LE(nf, 80);
  const P = geo.positions, I = geo.indices;
  let o = 84;
  for (let f = 0; f < nf; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    buf.writeFloatLE(nx, o); buf.writeFloatLE(ny, o + 4); buf.writeFloatLE(nz, o + 8); o += 12;
    for (const vi of [a, b, c]) { buf.writeFloatLE(P[vi], o); buf.writeFloatLE(P[vi + 1], o + 4); buf.writeFloatLE(P[vi + 2], o + 8); o += 12; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  return buf;
}

async function convert3d(inputPath, outputPath, target) {
  const tgt = String(target).toLowerCase();
  const glb = await assimpToGlb(inputPath);
  if (tgt === 'glb') { fs.writeFileSync(outputPath, glb); return outputPath; }
  const geo = extractGeometry(parseGlb(glb));
  if (!geo.positions.length) throw new Error('Aucune géométrie trouvée dans le modèle.');
  if (tgt === 'obj') fs.writeFileSync(outputPath, writeObj(geo), 'utf8');
  else if (tgt === 'ply') fs.writeFileSync(outputPath, writePly(geo), 'utf8');
  else if (tgt === 'stl') fs.writeFileSync(outputPath, writeStlBinary(geo));
  else throw new Error(`Format 3D .${tgt} non supporté.`);
  return outputPath;
}

// ── Documents (pure-JS readers → HTML/CSV; main.js prints HTML→PDF via Chromium)
function wrapHtml(inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Segoe UI',Arial,sans-serif;padding:32px;color:#111;line-height:1.5}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:4px 8px}img{max-width:100%}h2{margin-top:24px}</style></head><body>${inner}</body></html>`;
}
async function docToHtml(inputPath) {
  const ext = extOf(inputPath);
  if (ext === 'md' || ext === 'markdown') {
    const { marked } = require('marked');
    return wrapHtml(marked.parse(fs.readFileSync(inputPath, 'utf8')));
  }
  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const r = await mammoth.convertToHtml({ path: inputPath });
    return wrapHtml(r.value);
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(inputPath);
    let body = '';
    for (const name of wb.SheetNames) body += `<h2>${name}</h2>` + XLSX.utils.sheet_to_html(wb.Sheets[name]);
    return wrapHtml(body);
  }
  throw new Error('Conversion document non prise en charge pour ce format.');
}
function docToCsv(inputPath) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(inputPath);
  return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]);
}

// ── After Effects (.ffx/.aep = RIFX container) — SAFE read-only analysis ──────
// AE/Red Giant binary formats are proprietary with no public spec. We can READ
// the RIFX structure reliably (verified on real presets) to report the kind and
// the effects/plugins a preset needs. Actual cross-version CONVERSION requires a
// real After Effects → handled by the cloud pipeline (see roadmap), never a
// blind local rewrite that could corrupt the file.
function walkRifx(buf, start, end, cb) {
  let off = start;
  while (off + 8 <= end) {
    const id = buf.toString('latin1', off, off + 4);
    const size = buf.readUInt32BE(off + 4);
    const dataStart = off + 8; const dataEnd = dataStart + size;
    if (dataEnd > end || size < 0) break;
    if (id === 'LIST' && size >= 4) { walkRifx(buf, dataStart + 4, dataEnd, cb); }
    else cb(id, dataStart, dataEnd);
    off = dataEnd + (size & 1);
  }
}
function analyzeAe(inputPath) {
  const buf = fs.readFileSync(inputPath);
  if (buf.toString('latin1', 0, 4) !== 'RIFX') throw new Error("Ce fichier n'est pas un conteneur RIFX After Effects.");
  const formType = buf.toString('latin1', 8, 12);
  const names = new Set();
  walkRifx(buf, 12, buf.length, (id, s, e) => {
    if (id === 'tdmn') { let str = buf.toString('latin1', s, e).replace(/\0[\s\S]*$/, '').trim(); if (str) names.add(str); }
  });
  const STRUCT = new Set(['ADBE Effect Parade', 'ADBE Group End', 'ADBE Group', 'ADBE Effects Group']);
  // Strip per-instance suffixes ("MB LookSuite3-0000" → "MB LookSuite3") and dedupe.
  const clean = m => m.replace(/-\d{3,}$/, '').trim();
  const effects = [...new Set([...names].map(clean))].filter(m => m && !STRUCT.has(m));
  const thirdParty = effects.filter(m => !/^ADBE/.test(m));
  const kind = formType === 'FaFX' ? 'Preset After Effects (.ffx)' : formType === 'Egg!' ? 'Projet After Effects (.aep)' : `RIFX (${formType})`;
  return { formType, kind, effectCount: effects.length, effects, thirdParty };
}

// ── Local After Effects bridge (drives the user's OWN installed AE) ───────────
// Real fidelity for what AE actually supports, via ExtendScript (.jsx) run by
// AfterFX.exe -r. No server, no Adobe licensing to host.
function detectAfterEffects() {
  const bases = ['C:/Program Files/Adobe', 'C:/Program Files (x86)/Adobe'];
  const found = [];
  for (const b of bases) {
    if (!fs.existsSync(b)) continue;
    let dirs = [];
    try { dirs = fs.readdirSync(b); } catch (e) { continue; }
    for (const d of dirs) {
      if (!/After Effects/i.test(d)) continue;
      const exe = path.join(b, d, 'Support Files', 'AfterFX.exe');
      if (fs.existsSync(exe)) {
        const version = (d.match(/After Effects\s*(.+)$/i) || [])[1] || d;
        found.push({ name: d, version: version.trim(), exe });
      }
    }
  }
  // Newest first (year desc).
  found.sort((a, b) => (parseInt((b.version.match(/\d{4}/) || [0])[0], 10)) - (parseInt((a.version.match(/\d{4}/) || [0])[0], 10)));
  return found;
}

// --- .ffx/.aep version compatibility (Helix-style local RIFX rewrite) ---
// The AE "preset/project format version" is the 2nd uint32 of the `head` chunk
// (verified empirically: AE2023=94, AE2025/26=95, older packs=93). Making a file
// open in an older/newer AE = rewriting THAT single field. Non-destructive: we
// copy the bytes and overwrite 4 bytes; everything else stays identical.
function aeVersionInfo(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFX') return null;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString('latin1', off, off + 4);
    const size = buf.readUInt32BE(off + 4);
    const dataStart = off + 8;
    if (id === 'head') {
      if (dataStart + 8 > buf.length) return null;
      return { offset: dataStart + 4, code: buf.readUInt32BE(dataStart + 4), formType: buf.toString('latin1', 8, 12) };
    }
    off = dataStart + size + (size & 1);
  }
  return null;
}
function firstFfxIn(dir, depth) {
  if (!dir || depth > 5 || !fs.existsSync(dir)) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && /\.ffx$/i.test(e.name)) return full;
    if (e.isDirectory()) { const f = firstFfxIn(full, depth + 1); if (f) return f; }
  }
  return null;
}
// Read the format version code an installed AE writes (from its factory presets).
function aeInstallVersionCode(aeExe) {
  try {
    const presets = path.join(path.dirname(aeExe), 'Presets');
    const sample = firstFfxIn(presets, 0);
    if (sample) { const i = aeVersionInfo(fs.readFileSync(sample)); return i ? i.code : null; }
  } catch (e) {}
  return null;
}
// Marketing year → format code, for AE versions the user doesn't have installed.
// (Codes read from an installed AE always win over this best-effort table.)
const AE_YEAR_CODES = { 2022: 0x5d, 2023: 0x5e, 2024: 0x5f, 2025: 0x60, 2026: 0x61 };

function convertAeVersion(inputPath, outputPath, code) {
  const buf = fs.readFileSync(inputPath);
  if (buf.toString('latin1', 0, 4) !== 'RIFX') throw new Error('Pas un conteneur After Effects (.ffx/.aep).');
  const out = Buffer.from(buf);
  const info = aeVersionInfo(buf);
  if (info) {
    out.writeUInt32BE(code >>> 0, info.offset);
  } else {
    // Fallback (FFX-Downgrader heuristic): patch the first byte in the known
    // version range. Less precise but covers files where `head` isn't first.
    let patched = false;
    for (let i = 12; i < out.length; i++) {
      if (out[i] >= 0x5d && out[i] <= 0x62) { out[i] = code & 0xff; patched = true; break; }
    }
    if (!patched) throw new Error('Champ de version introuvable.');
  }
  fs.writeFileSync(outputPath, out);
  return outputPath;
}

function jsxPath(p) { return String(p).replace(/\\/g, '/').replace(/'/g, "\\'"); }

// op: 'upgrade-aep' (open + save in the chosen AE version) | 'apply-ffx' (apply
// the preset onto a fresh comp and save a project).
function buildAeScript(op, input, output, logFile) {
  const I = jsxPath(input), O = jsxPath(output), L = jsxPath(logFile);
  let body;
  if (op === 'upgrade-aep') {
    body = `app.open(new File('${I}')); app.project.save(new File('${O}'));`;
  } else if (op === 'apply-ffx') {
    body = `app.newProject();
    var comp = app.project.items.addComp('Preset Orbit', 1920, 1080, 1.0, 5, 30);
    var solid = comp.layers.addSolid([0,0,0], 'Preset Layer', 1920, 1080, 1.0);
    solid.selected = true;
    solid.applyPreset(new File('${I}'));
    app.project.save(new File('${O}'));`;
  } else {
    body = `throw new Error('Opération inconnue.');`;
  }
  return `#target aftereffects
(function () {
  var log = new File('${L}');
  function w(s){ try { log.open('w'); log.write(s); log.close(); } catch (e) {} }
  try {
    app.beginSuppressDialogs();
    ${body}
    app.endSuppressDialogs(false);
    w('OK:${O}');
  } catch (e) {
    w('ERR:' + (e && e.toString ? e.toString() : e));
  }
  try { app.quit(); } catch (e) {}
})();`;
}

module.exports = {
  classify, targetsFor, extOf, TARGETS, ENABLED, CATEGORY_LABELS,
  buildFfmpegArgs, parseLut, convertLut, parseCube, writeCube, parse3dl, write3dl,
  convertFont, convert3d, parseGlb, extractGeometry,
  docToHtml, docToCsv, analyzeAe, walkRifx,
  detectAfterEffects, buildAeScript,
  aeVersionInfo, aeInstallVersionCode, convertAeVersion, AE_YEAR_CODES,
};
