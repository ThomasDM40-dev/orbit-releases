// ─────────────────────────────────────────────────────────────────────────────
//  Orbit · Auto object detection (YOLOv8n, ONNX) — find people, vehicles, etc.
//  Detections feed the SAM selector (click a box → precise mask). 100% local.
// ─────────────────────────────────────────────────────────────────────────────
const YOLO = {
  urls: [
    'https://raw.githubusercontent.com/Hyuto/yolov8-onnxruntime-web/master/public/model/yolov8n.onnx',
    'https://cdn.jsdelivr.net/gh/Hyuto/yolov8-onnxruntime-web@master/public/model/yolov8n.onnx',
  ],
  file: 'yolov8n.onnx',
  minBytes: 8 * 1024 * 1024,
  size: 640,
};

const COCO = ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush'];

// Labels FR pour l'UI.
const COCO_FR = { person: 'personne', bicycle: 'vélo', car: 'voiture', motorcycle: 'moto', airplane: 'avion', bus: 'bus', train: 'train', truck: 'camion', boat: 'bateau', 'traffic light': 'feu', 'fire hydrant': 'bouche incendie', 'stop sign': 'panneau stop', bench: 'banc', bird: 'oiseau', cat: 'chat', dog: 'chien', horse: 'cheval', sheep: 'mouton', cow: 'vache', elephant: 'éléphant', bear: 'ours', zebra: 'zèbre', giraffe: 'girafe', backpack: 'sac à dos', umbrella: 'parapluie', handbag: 'sac', tie: 'cravate', suitcase: 'valise', bottle: 'bouteille', cup: 'tasse', chair: 'chaise', couch: 'canapé', 'potted plant': 'plante', bed: 'lit', 'dining table': 'table', tv: 'télé', laptop: 'ordinateur', 'cell phone': 'téléphone', book: 'livre', clock: 'horloge', vase: 'vase' };

function nms(dets, iouThr) {
  dets.sort((a, b) => b.score - a.score);
  const keep = [];
  const iou = (a, b) => {
    const x1 = Math.max(a.box[0], b.box[0]), y1 = Math.max(a.box[1], b.box[1]);
    const x2 = Math.min(a.box[0] + a.box[2], b.box[0] + b.box[2]), y2 = Math.min(a.box[1] + a.box[3], b.box[1] + b.box[3]);
    const w = Math.max(0, x2 - x1), h = Math.max(0, y2 - y1), inter = w * h;
    return inter / (a.box[2] * a.box[3] + b.box[2] * b.box[3] - inter || 1);
  };
  for (const d of dets) { if (keep.some(k => iou(k, d) > iouThr)) continue; keep.push(d); }
  return keep;
}

module.exports = { YOLO, COCO, COCO_FR, nms };
