'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_DIR = path.join(__dirname, '..', 'models');
const MODEL_PATH = path.join(MODEL_DIR, 'mira_exp019.onnx');
const MODEL_URL = 'https://huggingface.co/Jeremy341/MIRA-AI/resolve/main/models/detection/mira_exp019.onnx';
const MIN_MODEL_BYTES = 5_000_000;

async function main() {
  fs.mkdirSync(MODEL_DIR, { recursive: true });
  if (fs.existsSync(MODEL_PATH) && fs.statSync(MODEL_PATH).size >= MIN_MODEL_BYTES) {
    console.log(`MIRA model already available (${(fs.statSync(MODEL_PATH).size / 1_000_000).toFixed(1)} MB).`);
    return;
  }

  if (typeof fetch !== 'function') throw new Error('Node.js 18 or newer is required (built-in fetch is unavailable).');
  console.log('Downloading MIRA YOLO11n EXP-019 ONNX model (~10.6 MB) from Hugging Face…');
  console.log('This one-time download requires an internet connection.');

  const tempPath = `${MODEL_PATH}.download`;
  try {
    const response = await fetch(MODEL_URL, { redirect: 'follow', headers: { 'User-Agent': 'Iyarkai-Kavalan-Prototype/1.0' } });
    if (!response.ok || !response.body) throw new Error(`Model download failed with HTTP ${response.status}. Check the model URL or download the ONNX file manually.`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < MIN_MODEL_BYTES) {
      const preview = bytes.subarray(0, 120).toString('utf8').replace(/\s+/g, ' ');
      throw new Error(`Downloaded file was only ${bytes.length} bytes, not a valid ONNX model. Response: ${preview}`);
    }
    fs.writeFileSync(tempPath, bytes);
    fs.renameSync(tempPath, MODEL_PATH);
    console.log(`MIRA model installed at: ${MODEL_PATH}`);
    console.log('Model source: https://huggingface.co/Jeremy341/MIRA-AI (MIT; see THIRD_PARTY_NOTICES.md).');
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
}

main().catch(error => {
  console.error(`\nCould not set up the MIRA model: ${error.message}`);
  console.error('Retry with: npm run setup-model');
  process.exitCode = 1;
});
