# CourtSim — credits and third-party licences

CourtSim is built on work by other people. This page names every piece of it,
says what licence it is under, and ships the complete text of every one of
those licences in this folder. Nothing here is a summary standing in for a
licence: the full text of each is in the files linked below and travels with
every copy of this build.

Assembled 2026-09-18 by COURTSIM-NOTICE-052 from the inventory in
`reports/HANDOFF_TO_LEGAL_LANE_UPDATE_20260918.md`, in which every licence
text was retrieved and read. Facts marked **verified here** were re-measured
on this machine rather than carried over.

---

## Character models — Microsoft Rocketbox

**Modified/conversion derivatives of [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox).
Copyright (c) 2020 Microsoft. MIT License —
[complete licence text](LICENSE-Rocketbox.txt).**

Microsoft released the Rocketbox avatar library under the MIT licence in
November 2020. MIT permits use, modification, distribution and sale without
fee or royalty. What it requires is not credit but **notice**: the copyright
line above *and* the complete permission notice must be included with every
copy of the work. That is what `LICENSE-Rocketbox.txt` beside this file is
for.

The cast was converted from FBX to GLB with texture and facial-morph
adjustments, and is shipped in several optimisation tiers.

**All twenty-one avatars in this build, with their Rocketbox source
identity.** (The published site's earlier copy of this page listed only the
first twelve; the nine spectators were added 2026-09-16 and are recorded
here for the first time. **Verified here** against
`tools/build_spectators.py`, which drives the conversion and names each
source identity in its `SPECTATORS` table.)

| In CourtSim | Rocketbox ID | Rocketbox library file |
|---|---|---|
| judge | — | Business_Male_01 |
| witness | — | Female_Adult_01 |
| counsel A | — | Business_Male_02 |
| counsel B | — | Business_Female_01 |
| bailiff | — | Police_Male_01 |
| clerk | — | Female_Adult_02 |
| juror 1 | — | Male_Adult_02 |
| juror 2 | — | Female_Adult_03 |
| juror 3 | — | Male_Adult_03 |
| juror 4 | — | Female_Adult_04 |
| juror 5 | — | Male_Adult_04 |
| juror 6 | — | Female_Adult_05 |
| spectator 1 | m001 | Male_Adult_11 |
| spectator 2 | m014 | Male_Adult_08 |
| spectator 3 | m015 | Business_Male_04 |
| spectator 4 | m019 | Male_Adult_16 |
| spectator 5 | m169 | Police_Male_05 |
| spectator 6 | m301 | Sports_Male_02 |
| spectator 7 | f009 | Female_Adult_09 |
| spectator 8 | f016 | Business_Female_03 |
| spectator 9 | f017 | Female_Adult_14 |

The Rocketbox README asks — as a courtesy, not as a licence condition — that
research use cite: Gonzalez-Franco et al., *"The Rocketbox library and the
utility of freely available rigged avatars,"* Frontiers in Virtual Reality,
DOI 10.3389/frvir.2020.561558.

---

## Facial animation — NVIDIA Audio2Face-3D

**[NVIDIA Audio2Face-3D-v2.3-Mark](https://huggingface.co/nvidia/Audio2Face-3D-v2.3-Mark)
and the reduced lip-sync data derived from it.
Licensed by NVIDIA Corporation under the NVIDIA Open Model License.**

- [Complete NVIDIA Open Model Agreement](LICENSE-NVIDIA-Open-Model.txt)
- [Incorporated Trustworthy AI terms](NVIDIA-Trustworthy-AI-Terms.txt)
- [**Notice**](Notice) — the file section 3.1 of that agreement requires by
  name, containing the exact attribution sentence it specifies

`lipsync_reduced.json` is a **Derivative Model** under section 1.1 of the
agreement and is covered by the same notice.

Shipped model file: `assets/models/audio2face-3d-v2.3-mark/network.onnx`,
75,751,144 bytes, SHA-256 `dcd16d3b1affb090d4da1ba88791faa6bcd755f97c853b3b667abad9be15cb4b`
— **verified here** on this machine against the value NVIDIA publishes for
that file.

---

## Texture transcoder — Basis Universal

**[Basis Universal](https://github.com/BinomialLLC/basis_universal) transcoder,
Binomial LLC. Apache License 2.0 —
[complete licence text](LICENSE-Apache-2.0.txt), and
[how that was established](LICENSE-BasisUniversal.txt).**

`web/vendor/basis/basis_transcoder.js` and `.wasm` carry no licence header of
their own, and a previous review recorded them as the one component in the
stack with no licence evidence at all. They are now identified: both files
are **byte-identical (SHA-256, verified here)** to the Basis Universal
transcoder bundled inside three.js 0.169.0, whose own README for that folder
states the licence as Apache 2.0. The full working is in
[LICENSE-BasisUniversal.txt](LICENSE-BasisUniversal.txt).

---

## Browser runtime

These are fetched from their public CDNs when needed rather than copied into
this build, so their notice-inclusion clauses are not triggered by the current
architecture. **The complete text of each is shipped here anyway**, because an
offline classroom package would redistribute them and the notice has to be
there before that happens, not after.

| Component | Version | Licence | Full text |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.169.0 | MIT, © 2010-2024 three.js authors | [LICENSE-three.js.txt](LICENSE-three.js.txt) |
| [Pyodide](https://github.com/pyodide/pyodide) | 0.26.4 | MPL-2.0 | [LICENSE-Pyodide-MPL-2.0.txt](LICENSE-Pyodide-MPL-2.0.txt) |
| [Transformers.js](https://github.com/huggingface/transformers.js) | 3.0.0 | Apache-2.0 | [LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt) |
| [kokoro-js](https://github.com/hexgrad/kokoro) | 1.2.1 | Apache-2.0 | [LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | 1.21 / 1.22-dev | MIT, © Microsoft Corporation | [LICENSE-onnxruntime.txt](LICENSE-onnxruntime.txt) |

## Model weights, fetched at runtime

| Model | Licence | Full text |
|---|---|---|
| [Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) (text to speech) | Apache-2.0 | [LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt) |
| [whisper-tiny.en](https://huggingface.co/Xenova/whisper-tiny.en) (speech recognition) | Apache-2.0 | [LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt) |

## Build tools, not shipped

Blender 4.5.12 (GPL family) and `@gltf-transform/cli` are used to prepare
assets on the developer's machine. They are not part of this build and are
not distributed with it; a GPL tool does not place its licence on the output
it produces. Listed for completeness.

---

## Two things this page does *not* answer

**CourtSim's own code has no licence of its own.** There is no `LICENSE` file
in this repository. Under copyright's default that means all rights reserved.
Whether that is the right posture for a build handed to students is the
founder's decision to make and nobody else's; it is flagged, not decided, in
`reports/COURTSIM_NOTICE_052.md`.

**This page covers software and model assets only.** It does not cover the
written study content, the corpus, or any reference material. That is a
separate and larger question tracked elsewhere, and nothing here should be
read as speaking to it.

Nobody who assembled this page is a lawyer and none of it is legal advice.
Every licence named above was retrieved and read; the texts are shipped
beside this file so they can be read again by anyone who wants to.

---

Existing scoring formulas are preserved. Punctuation and speaker attribution
are not graded. Recognizer-error exclusions are a heuristic, not proof of an
audio recognizer fault. Added words can be listed without reducing the
original matched/reference percentage.
