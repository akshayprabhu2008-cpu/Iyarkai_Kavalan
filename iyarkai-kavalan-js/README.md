# Iyarkai Kavalan — Smart Waste Dashboard + MIRA YOLO11n

A professional JavaScript/Node.js prototype for smart waste management. It preserves the existing Iyarkai Kavalan dashboard, login, bin overview, activity alerts, route preview, waste guidance, public reports and CSV export. Its image detector now uses **MIRA YOLO11n EXP-019**, a waste-specific model published under the MIT license where applicable, with support for up to eight images per batch and multiple object detections per photo.

## AI model selected

- **Model:** MIRA YOLO11n EXP-019 (ONNX)
- **Source/model card:** https://huggingface.co/Jeremy341/MIRA-AI
- **Model file:** `models/detection/mira_exp019.onnx` on the source repository; downloaded locally as `models/mira_exp019.onnx`
- **Reported classes:** glass, metal, paper, plastic, trash
- **Reported evaluation:** 90.58% mAP@50, 82.15% mAP@50–95, 87.2% precision, 84.6% recall on the publisher's documented 1,375-image test set
- **Runtime:** ONNX Runtime for Node.js, CPU inference; image preprocessing uses Sharp
- **Reported license:** MIT (see model card and `THIRD_PARTY_NOTICES.md`; underlying dataset terms can differ)

These are the model publisher's results, not an independent benchmark or a promise of the same accuracy for every uploaded image. Its published limitations include overlapping objects, unusual lighting, unusual viewing angles and waste outside the training data. The model does not have a dedicated `cardboard` class: paper/cardboard-like items may be labelled `paper` or `trash`.

## Quick start (Windows / VS Code)

Requirements: **Node.js 18 or newer** and npm. Internet access is needed once to download the model.

1. Extract the ZIP and open the `iyarkai-kavalan-mira` folder in VS Code.
2. Open **Terminal → New Terminal**.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the project:

   ```bash
   npm start
   ```

   `npm start` automatically checks/downloads the model before starting the website. You can also run `npm run setup-model` manually. The downloaded ONNX model is about 10.6 MB. Keep the terminal open while using the website.

5. Open **http://localhost:3000** in your browser.

If model setup fails, verify internet access and run `npm run setup-model` again. The model is publicly downloadable without an API key.

## Demo login

- **Email:** `admin@iyarkai.in`
- **Password:** `Kavalan@123`

These are demo credentials only. For local development, they can be overridden with `DEMO_EMAIL` and `DEMO_PASSWORD` environment variables.

## Image detection

1. Sign in and open **Waste assistant → AI image detection**.
2. Select up to **8 images** (JPG, PNG or WebP; up to 8 MB per image).
3. Click **Detect waste in selected images**.
4. The app processes images sequentially to keep memory use low. Each image shows its own object boxes, labels and confidence values; the batch summary aggregates detected categories.

The detector can identify multiple visible items in a single photo, subject to model performance. The confidence score is the model's score, not a calibrated probability of correctness. Review all boxes and labels before using them for any decision.

## Project structure

```text
iyarkai-kavalan-mira/
├── server.js
├── package.json
├── README.md
├── THIRD_PARTY_NOTICES.md
├── .gitignore
├── scripts/
│   └── download-model.js
├── lib/
│   └── yolo.js
├── models/
│   └── README.md
├── data/
│   └── .gitkeep
└── public/
    ├── login.html
    ├── login.js
    ├── index.html
    ├── style.css
    └── app.js
```

`models/mira_exp019.onnx` is downloaded automatically at first launch and is not embedded in this ZIP because the file-build environment had no outbound binary-download access. Once you run `npm start` online, the weights are stored locally. The `models/*.onnx` path is not excluded by `.gitignore`, so you may optionally include the downloaded model in your GitHub repository (about 10.6 MB) if you want GitHub to host it; review the model card and license notice first.

## Other dashboard features

- Demo login and server-side session checking
- Responsive dashboard and six sample smart-bin fill levels
- Simulated animal safety alert / pause scenario
- Activity feed with resolve actions
- Collection route preview and recalculation
- Rule-based waste disposal guidance
- Community complaint form stored in `data/complaints.json`
- CSV export for the sample smart-bin network

## Important prototype limitations

Only the image-detection model is real inference. Smart-bin levels, animal alerts and collection routes are simulated; they are not connected to sensors, cameras, GPS, external navigation or live municipal systems. Do not use this demo for safety-critical decisions.

For a public production deployment, replace the demo credentials, use a password-hashed user store, set a unique `SESSION_SECRET`, use HTTPS and a production session store, and add rate limiting, CSRF protection and stronger upload validation.
