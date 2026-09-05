# CourtSim browser credits

## Character models

Modified/conversion derivatives of [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox). Copyright (c) 2020 Microsoft. [Complete MIT license](LICENSE-Rocketbox.txt).

The selected cast was converted to GLB with texture and facial-morph adjustments. Role/source mappings: judge / Business_Male_01; witness / Female_Adult_01; counsel A / Business_Male_02; counsel B / Business_Female_01; bailiff / Police_Male_01; clerk / Female_Adult_02; jurors / Male_Adult_02, Female_Adult_03, Male_Adult_03, Female_Adult_04, Male_Adult_04, Female_Adult_05.

## Facial animation

[NVIDIA Audio2Face-3D-v2.3-Mark](https://huggingface.co/nvidia/Audio2Face-3D-v2.3-Mark) and derived reduced lip-sync data. Licensed by NVIDIA Corporation under the NVIDIA Open Model License.

- [Complete NVIDIA Open Model Agreement](LICENSE-NVIDIA-Open-Model.txt)
- [Incorporated Trustworthy AI terms](NVIDIA-Trustworthy-AI-Terms.txt)
- [Required Notice](Notice)

Network SHA256: `dcd16d3b1affb090d4da1ba88791faa6bcd755f97c853b3b667abad9be15cb4b`, matching NVIDIA's published model file. Binary integrity is recorded in [the asset manifest](../asset-manifest.json).

## Browser runtime

CourtSim uses [Three.js](https://github.com/mrdoob/three), [Pyodide](https://github.com/pyodide/pyodide), [Transformers.js](https://github.com/huggingface/transformers.js), [Kokoro](https://github.com/hexgrad/kokoro), and [ONNX Runtime](https://github.com/microsoft/onnxruntime). These dependencies are fetched from their public CDNs when needed. The app's Python scoring runs in the browser.

Existing scoring formulas are preserved. Punctuation and speaker attribution are not graded. Recognizer-error exclusions are a heuristic, not proof of an audio recognizer fault. Added words can be listed without reducing the original matched/reference percentage.
