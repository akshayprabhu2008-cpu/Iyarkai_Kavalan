'use strict';

const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-node');
const sharp = require('sharp');

// MIRA EXP-019 is a community-trained, MIT-licensed YOLO11n waste detector.
// Source/model card: https://huggingface.co/Jeremy341/MIRA-AI
const MODEL_PATH = path.join(__dirname, '..', 'models', 'mira_exp019.onnx');
const INPUT_SIZE = 640;
const CLASS_NAMES = ['glass', 'metal', 'paper', 'plastic', 'trash'];
const CONFIDENCE_THRESHOLD = Number(process.env.YOLO_CONFIDENCE || 0.25);
const IOU_THRESHOLD = 0.45;
let sessionPromise;

async function getSession() {
  if (!fs.existsSync(MODEL_PATH) || fs.statSync(MODEL_PATH).size < 1_000_000) {
    const error = new Error('MIRA waste-detection model is not installed. Run "npm run setup-model" or start the app with "npm start" while connected to the internet.');
    error.statusCode = 503;
    throw error;
  }
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'] }).catch(error => {
      sessionPromise = null;
      throw new Error(`Could not load the MIRA ONNX model: ${error.message}`);
    });
  }
  return sessionPromise;
}

function intersectionOverUnion(a, b) {
  const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  return intersection / (areaA + areaB - intersection + 1e-9);
}

function decodeYoloOutput(output, dims, threshold = CONFIDENCE_THRESHOLD) {
  // Exported YOLO detection tensors normally have [1, 4 + classes, candidates].
  // Also accept [1, candidates, 4 + classes] to support alternate ONNX exports.
  if (!Array.isArray(dims) || dims.length !== 3) {
    throw new Error(`Unexpected YOLO output shape: ${Array.isArray(dims) ? dims.join(' × ') : 'unknown'}`);
  }
  const a = dims[1], b = dims[2];
  let channels, candidates, transposed;
  if (a <= 64 && b > a) { channels = a; candidates = b; transposed = false; }
  else if (b <= 64 && a > b) { candidates = a; channels = b; transposed = true; }
  else throw new Error(`Cannot interpret YOLO output shape: ${dims.join(' × ')}`);

  const classCount = channels - 4;
  if (classCount !== CLASS_NAMES.length) {
    throw new Error(`This model has ${classCount} output classes, but ${CLASS_NAMES.length} labels are configured. Check the model file and labels.`);
  }
  const at = (candidate, channel) => transposed
    ? output[candidate * channels + channel]
    : output[channel * candidates + candidate];
  const candidatesFound = [];

  for (let i = 0; i < candidates; i++) {
    let classId = -1, score = 0;
    for (let c = 0; c < classCount; c++) {
      const value = at(i, c + 4);
      if (value > score) { score = value; classId = c; }
    }
    if (score < threshold || classId < 0) continue;
    const cx = at(i, 0), cy = at(i, 1), width = at(i, 2), height = at(i, 3);
    candidatesFound.push({
      classId,
      label: CLASS_NAMES[classId],
      confidence: Number(score),
      x1: Math.max(0, cx - width / 2),
      y1: Math.max(0, cy - height / 2),
      x2: Math.min(INPUT_SIZE, cx + width / 2),
      y2: Math.min(INPUT_SIZE, cy + height / 2)
    });
  }

  // Greedy non-maximum suppression: keep high-confidence boxes and remove same-class overlaps.
  candidatesFound.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const candidate of candidatesFound) {
    if (kept.every(other => other.classId !== candidate.classId || intersectionOverUnion(other, candidate) < IOU_THRESHOLD)) {
      kept.push(candidate);
    }
    if (kept.length >= 100) break;
  }
  return kept;
}

async function detectWaste(buffer) {
  const session = await getSession();

  // Respect EXIF orientation and preserve aspect ratio with letterboxing instead of stretching.
  const oriented = await sharp(buffer).rotate().flatten({ background: { r: 114, g: 114, b: 114 } }).toBuffer({ resolveWithObject: true });
  const imageWidth = oriented.info.width;
  const imageHeight = oriented.info.height;
  if (!imageWidth || !imageHeight) throw new Error('Could not read image dimensions. Try a JPG, PNG or WebP image.');

  const scale = Math.min(INPUT_SIZE / imageWidth, INPUT_SIZE / imageHeight);
  const resizedWidth = Math.max(1, Math.min(INPUT_SIZE, Math.round(imageWidth * scale)));
  const resizedHeight = Math.max(1, Math.min(INPUT_SIZE, Math.round(imageHeight * scale)));
  const padLeft = Math.floor((INPUT_SIZE - resizedWidth) / 2);
  const padTop = Math.floor((INPUT_SIZE - resizedHeight) / 2);
  const padRight = INPUT_SIZE - resizedWidth - padLeft;
  const padBottom = INPUT_SIZE - resizedHeight - padTop;

  const { data, info } = await sharp(oriented.data)
    .resize(resizedWidth, resizedHeight, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .extend({ top: padTop, bottom: padBottom, left: padLeft, right: padRight, background: { r: 114, g: 114, b: 114 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== INPUT_SIZE || info.height !== INPUT_SIZE || info.channels < 3) {
    throw new Error('Image preprocessing did not produce a valid 640 × 640 RGB tensor.');
  }

  const plane = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = data[i * info.channels] / 255;
    input[plane + i] = data[i * info.channels + 1] / 255;
    input[2 * plane + i] = data[i * info.channels + 2] / 255;
  }

  const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const outputs = await session.run({ [session.inputNames[0]]: tensor });
  const detectionsOnInput = decodeYoloOutput(outputs[session.outputNames[0]].data, outputs[session.outputNames[0]].dims);

  // Convert boxes from model-space coordinates back to EXIF-corrected source-image pixels.
  const scaleX = resizedWidth / imageWidth;
  const scaleY = resizedHeight / imageHeight;
  const detections = detectionsOnInput.map(item => ({
    label: item.label,
    confidence: item.confidence,
    x1: Math.max(0, Math.min(imageWidth, (item.x1 - padLeft) / scaleX)),
    y1: Math.max(0, Math.min(imageHeight, (item.y1 - padTop) / scaleY)),
    x2: Math.max(0, Math.min(imageWidth, (item.x2 - padLeft) / scaleX)),
    y2: Math.max(0, Math.min(imageHeight, (item.y2 - padTop) / scaleY))
  })).filter(item => item.x2 > item.x1 && item.y2 > item.y1);

  const summary = {};
  for (const detection of detections) summary[detection.label] = (summary[detection.label] || 0) + 1;
  return {
    detections,
    summary,
    model: 'MIRA YOLO11n EXP-019',
    imageWidth,
    imageHeight,
    inputSize: INPUT_SIZE,
    confidenceThreshold: CONFIDENCE_THRESHOLD
  };
}

module.exports = { detectWaste, MODEL_PATH };
