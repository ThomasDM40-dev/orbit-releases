// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Smart Selection (SlimSAM / Segment Anything, ONNX)
//  Click an object → precise mask. Encoder runs once per image (cached), the
//  lightweight decoder runs per click. 100% local. Validated end-to-end.
// ─────────────────────────────────────────────────────────────────────────────
const SAM = {
  encUrl: 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder.onnx',
  decUrl: 'https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder.onnx',
  encFile: 'slimsam_encoder.onnx',
  decFile: 'slimsam_decoder.onnx',
  encMin: 18 * 1024 * 1024,
  decMin: 10 * 1024 * 1024,
  // ImageNet normalisation (HF SamImageProcessor), input is a 1024px square with
  // the resized image top-left-anchored and the padding left at 0.
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  size: 1024,
};

module.exports = { SAM };
