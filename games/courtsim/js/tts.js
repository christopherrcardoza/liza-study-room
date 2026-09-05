// WEB-REBUILD-001 -- in-browser text-to-speech via kokoro-js
// (onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0).
//
// SPEED-VOLUME-001 MEASURED BUG, fixed here: the founder heard TTS speech
// that "sounded like Swedish... like they sped it up." That is NOT a
// sample-rate mismatch (checked first, per the job brief's own hypothesis,
// and ruled out with direct evidence: kokoro's declared sampling_rate,
// its own toWav() header, and the browser's native decodeAudioData all
// agree at 24000Hz/4.05s for the same test line -- see
// reports/SPEED_VOLUME_001.md). The real cause: `dtype: 'q8'` (int8
// quantization) corrupts this model's actual audio CONTENT on this
// machine's WebGPU backend -- the exact same bug class already measured
// for Xenova/whisper-tiny.en in reports/WEB_RESEARCH_001.md (garbage
// output, 12x slower), just never tested for kokoro's own output content
// until this job's whisper-roundtrip check caught it. `dtype: 'fp16'` was
// also tested and is WORSE (pure hallucinated punctuation tokens, no real
// speech at all). Passing `dtype: 'fp32'` explicitly turned out to be a
// SECOND, separate bug -- kokoro-js silently did not fetch a distinctly-
// named full-precision file for that string (verified via Cache Storage
// inspection: no unquantized onnx/model.onnx entry ever appeared) and fell
// back to quantized weights anyway, with no error thrown. OMITTING the
// `dtype` option entirely is what actually loads the library's true
// default, full-precision weights (onnx/encoder_model.onnx +
// onnx/decoder_model_merged.onnx -- distinctly named, no "_quantized" or
// "_fp16" suffix) and is the only configuration that round-trips through
// Whisper back to the original source text -- see
// reports/SPEED_VOLUME_001.md for the side-by-side transcripts. Costs a
// larger one-time download (~326MB vs ~92MB for q8) -- accepted
// deliberately, matching the same intelligibility-over-size tradeoff
// already made for the ASR model.
export class TtsEngine {
  constructor() {
    this.tts = null;
    // SPEED-VOLUME-001 STEP 4's pre-synthesis buffering pipeline (main.js)
    // deliberately kicks off the NEXT utterance's synthesis while the
    // current one is still playing. kokoro's underlying onnxruntime-web
    // session has the same one-call-at-a-time constraint already measured
    // and fixed for the Whisper ASR session in asr.js ("Session already
    // started" / "Session mismatch" if two inference calls overlap) --
    // this queue serializes every synthesize() call so "ahead of
    // playback" means QUEUED and worked on continuously in the
    // background, never actually concurrent with itself.
    this._queue = Promise.resolve();
  }

  async init(onProgress) {
    const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js');
    this.tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      device: navigator.gpu ? 'webgpu' : 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.total) {
          onProgress?.(`downloading voice model: ${(p.loaded / 1e6).toFixed(0)}MB / ${(p.total / 1e6).toFixed(0)}MB`);
        }
      },
    });
  }

  // Returns a ready-to-play AudioBuffer-like {audio: Float32Array, sampling_rate}.
  // Queued (see constructor) -- safe to call for utterance N+1 before
  // utterance N's call has resolved.
  async synthesize(text, voiceId, speed = 1.0) {
    const call = this._queue.then(() => this.tts.generate(text, { voice: voiceId, speed }));
    this._queue = call.catch(() => {});
    const result = await call;
    return result; // { audio: Float32Array, sampling_rate }
  }
}

// SPEED-VOLUME-001 -- measured this session: at kokoro's own `speed: 1.0`,
// a 23-word line ("At approximately nine forty in the evening, I was
// stationed near the intersection of Birch and Nolan, watching traffic
// move through the area.") synthesized at 141.2 WPM (9.775s). kokoro's
// `speed` parameter is a multiplier on ITS OWN internal rate, not a WPM
// value directly -- this constant converts a player-chosen target WPM
// into the `speed` value that achieves it. Re-measured, not assumed, at
// three settings in reports/SPEED_VOLUME_001.md (STEP 5's requested
// 100/180/250 table).
export const KOKORO_BASELINE_WPM = 141.2;

export function wpmToSpeed(targetWpm, roleBias = 1.0) {
  return (targetWpm / KOKORO_BASELINE_WPM) * roleBias;
}

// Plays a kokoro output through the given AudioContext and resolves when
// playback finishes, so the caller can pace the courtroom's utterance
// sequence off real playback duration (mirrors the desktop build's
// duration_s-driven advance_timer in godot/courtsim_probe/main.gd).
// `destinationNode` defaults to the context's own speakers but SPEED-
// VOLUME-001 passes a GainNode here so the volume slider (0-100%) affects
// only this program's own audio, never the system/OS volume.
export function playSynthesized(audioCtx, synthResult, destinationNode) {
  return new Promise((resolve) => {
    const buffer = audioCtx.createBuffer(1, synthResult.audio.length, synthResult.sampling_rate);
    buffer.copyToChannel(Float32Array.from(synthResult.audio), 0);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(destinationNode || audioCtx.destination);
    src.onended = () => resolve();
    src.start();
  });
}
