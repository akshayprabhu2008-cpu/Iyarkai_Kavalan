# Model files

The MIRA EXP-019 ONNX weights are downloaded once by `npm run setup-model` (also run automatically by `npm start`). The binary is not bundled in this ZIP because the build environment cannot fetch external binary assets.

- Expected path: `models/mira_exp019.onnx`
- Official source: https://huggingface.co/Jeremy341/MIRA-AI/tree/main/models/detection
- Model card and reported metrics: https://huggingface.co/Jeremy341/MIRA-AI
- License: MIT (as stated by the model publisher)
- Input: RGB 640 × 640
- Classes: glass, metal, paper, plastic, trash

Do not rename a different model to `mira_exp019.onnx`; the output shape and class order must match this code.
