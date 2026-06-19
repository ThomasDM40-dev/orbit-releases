// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · AI Object Removal / Inpainting (LaMa, ONNX)
//  "Magic eraser" — paint over an object, the AI fills the hole plausibly.
//  No prompt, no API key, 100% local. Pure spec + size math here; main.js runs
//  the ffmpeg decode → ONNX → ffmpeg composite pipeline.
// ─────────────────────────────────────────────────────────────────────────────

// LaMa (big-lama) exported to ONNX. Handles arbitrary sizes (multiple of 8),
// no text prompt — ideal for removing objects (trash, people, logos, wires…).
const LAMA = {
  file: 'lama_fp32.onnx',
  url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx',
  label: 'LaMa — suppression d\'objet',
  minBytes: 40 * 1024 * 1024,
  // This ONNX export has a FIXED input resolution (512×512). The model runs at
  // this size; the inpainted region is scaled back to the original resolution
  // during compositing (untouched pixels keep full quality via the mask).
  size: 512,
};

function roundTo(n, m) { return Math.max(m, Math.round(n / m) * m); }

// Processing size: cap the long edge (LaMa is heavy on CPU) and snap to /8.
function procSize(w, h, maxDim) {
  let W = w, H = h;
  const long = Math.max(w, h);
  if (long > maxDim) { const s = maxDim / long; W = Math.round(w * s); H = Math.round(h * s); }
  return { pw: roundTo(W, 8), ph: roundTo(H, 8) };
}

module.exports = { LAMA, procSize, roundTo };
