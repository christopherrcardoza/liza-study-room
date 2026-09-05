// WEB-REBUILD-001 -- in-browser speech recognition via transformers.js
// (Xenova/whisper-tiny.en, fp32, WebGPU-preferred). Measured this session
// (reports/WEB_RESEARCH_001.md): 151.5MB one-time download, ~96% word
// accuracy, ~4.4x realtime inference on this machine. int8 quantization
// was measured BROKEN on WebGPU here (garbage output, 12.6x slower) --
// fp32 is used deliberately, not the smaller default.
//
// TraineeInputSource-equivalent abstraction (Amendment 1 SA1, mirroring
// courtsim/trainee_capture/input_abstraction.py's own reasoning): one
// small interface -- start()/poll()/stop() -- so a future non-voice input
// modality (steno, keyboard) could implement the same three methods
// without this file's callers changing. VoiceInputSource is the only
// concrete implementation here, exactly as on the desktop build.

const TARGET_RATE = 16000;
const SPEECH_DB_THRESHOLD = -45;
const SILENCE_MS_TO_FINALIZE = 700;
const PARTIAL_INTERVAL_MS = 1400;
const MIN_UTTERANCE_MS = 300;

export async function listCaptureDevices() {
  // Labels are empty until a getUserMedia permission has been granted at
  // least once -- callers should call this again after start() succeeds
  // to get real labels, same "prove it, don't assume it" discipline as
  // the desktop build's device picker.
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ id: d.deviceId, name: d.label || '(unnamed input device)' }));
}

// MEASURED BUG, fixed here: the onnxruntime-web inference session backing
// the transformers.js pipeline does NOT support overlapping calls -- a
// partial decode still in flight when a finalize decode starts (or two
// finalize calls fired close together) fails with "Session already
// started" / "Session mismatch", and the caller previously swallowed that
// into a silent EMPTY final transcript, which is a real, dangerous
// failure mode (looks like "the recognizer heard nothing" when it's
// actually "two decodes collided"). Reproduced directly this session by
// feeding a prerecorded file through the VAD loop fast enough to trigger
// overlapping decodes. Same class of bug and same fix shape as the
// desktop build's PortAudio thread-affinity fix (reports/FULL_BUILD_002.md
// STEP 1, AUDIO_EXECUTOR) -- serialize every call to the shared inference
// session through one queue so only one ever runs at a time.
let _transcribeQueue = Promise.resolve();
function runTranscription(transcriber, audio, options) {
  // DICTATION-001 Step 1 WEB -- audio_s/wall_ms logged per call (see
  // AsrPipelineSingleton.get()'s own comment for why): lets a real session
  // show, live in the console, whether decode is keeping up with speech
  // (wall_ms << audio_s*1000) or falling behind (wall_ms >> audio_s*1000,
  // the queue backing up) -- exactly the distinction that separates
  // "the words aren't coming up" being a wiring bug from a latency one.
  const audioS = audio.length / TARGET_RATE;
  const queuedAt = performance.now();
  const result = _transcribeQueue.then(() => {
    const t0 = performance.now();
    return transcriber(audio, options).then((r) => {
      console.log(`[asr] decode: audio_s=${audioS.toFixed(2)} queue_wait_ms=${Math.round(t0 - queuedAt)} decode_ms=${Math.round(performance.now() - t0)}`);
      return r;
    });
  });
  // Keep the queue alive even if this call rejects, so a later call isn't
  // stuck waiting on a permanently-rejected promise.
  _transcribeQueue = result.catch(() => {});
  return result;
}

class AsrPipelineSingleton {
  static instance = null;
  static async get(onProgress) {
    if (!this.instance) {
      // FIELD-TEST-FINISH-001 Step 1 -- ROOT CAUSE FOUND AND FIXED, not the
      // three hypotheses this job's brief named (all individually ruled out
      // by direct measurement first): device was genuinely hardware WebGPU
      // (adapter.info reported vendor=nvidia architecture=ampere, not a
      // software fallback); dtype was already fp32, not the broken int8;
      // the ONNX session was already a reused singleton, not recreated per
      // call. The REAL cause: this app runs TWO onnxruntime-web WebGPU
      // sessions concurrently in real gameplay -- this one (Whisper ASR)
      // and kokoro TTS's own (tts.js) -- on the SAME shared WebGPU device.
      // lipsync.js was already moved to WASM for exactly this reason
      // (colliding with "kokoro TTS, whisper ASR", its own comment says)
      // but that fix left ASR and TTS themselves contending with EACH
      // OTHER. Measured directly, isolated worker, identical audio, this
      // session: the SAME clip decoded in 820ms alone on WebGPU vs.
      // 12,569ms (15.3x slower) with a concurrent TTS synthesis call
      // running on the shared GPU -- exactly what happens whenever a
      // witness/character is speaking (TTS) while the trainee dictates
      // (ASR), i.e. normal play. WASM sidesteps the shared device entirely:
      // measured 2,764ms for the same clip WITH a concurrent TTS call
      // running (1.35x realtime, effectively unaffected by the contention
      // that made WebGPU 15x slower) and correct text both times. An
      // earlier apparent "WASM produces garbage" result during this
      // session's own investigation was traced to this test harness
      // feeding un-resampled 24kHz TTS output directly to a 16kHz-expecting
      // model -- a rate-mismatch bug in the TEST, not in WASM decoding;
      // once corrected, WASM (both its default q8 and an explicit fp32)
      // transcribed correctly. Full numbers in reports/FIELD_TEST_FINISH_001.md
      // Step 1. Forced to 'wasm' unconditionally -- not "when GPU is
      // unavailable" -- because the failure mode is GPU CONTENTION with
      // another already-present session, which is exactly as present when
      // navigator.gpu reports true as when it doesn't.
      const device = 'wasm';
      const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0');
      const t0 = performance.now();
      this.instance = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
        device,
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            onProgress?.(`downloading speech model: ${(p.loaded / 1e6).toFixed(0)}MB / ${(p.total / 1e6).toFixed(0)}MB`);
          }
        },
      });
      // Kept, cheap and still real diagnostic value: confirms on the
      // founder's own machine, in his own console, that this is really
      // running device=wasm and how long a fresh decode takes there.
      console.log(`[asr] pipeline ready: device=${device} load_ms=${Math.round(performance.now() - t0)} -- if dictation text lags far behind speech, check this device value (webgpu vs. wasm) and compare to a fresh decode's own timing.`);
    }
    return this.instance;
  }
}

export class VoiceInputSource {
  constructor() {
    this._events = [];
    this._utteranceCounter = 0;
    this._stream = null;
    this._audioCtx = null;
    this._processor = null;
    this._source = null;
    this._buffer = [];
    this._bufferMs = 0;
    this._speaking = false;
    this._silenceMs = 0;
    this._sinceLastPartialMs = 0;
    this._decoding = false;
    this._deviceName = '';
    this._levelDb = -90;
    this._vadState = 'SILENCE';
    this._state = 'MIC READY';
    this._error = null;
  }

  static async preload(onProgress) {
    await AsrPipelineSingleton.get(onProgress);
  }

  async start(deviceId) {
    try {
      this._transcriber = await AsrPipelineSingleton.get();
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      };
      this._stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = this._stream.getAudioTracks()[0];
      this._deviceName = track?.label || 'default microphone';

      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TARGET_RATE });
      this._source = this._audioCtx.createMediaStreamSource(this._stream);
      this._wireProcessor();

      this._state = 'LISTENING';
      this._vadState = 'SILENCE';
      this._error = null;
      return this.getStatus();
    } catch (err) {
      this._state = 'MIC DISCONNECTED';
      this._error = String(err && err.message ? err.message : err);
      return this.getStatus();
    }
  }

  // TEST-ONLY, not reachable from any player-facing UI path: proves the
  // ASR pipeline's real VAD/partial/final event logic end-to-end on a
  // prerecorded file, without a live microphone -- exactly the same
  // substitution the desktop build's MicrophoneAsrRuntime.start_external()
  // makes (reports/FULL_BUILD_002.md STEP 1), and for the same reason: an
  // automated/sandboxed verification run cannot grant getUserMedia
  // permission or produce live human speech, so everything from the audio
  // SOURCE onward is proven with a substitute, and only the OS-level
  // getUserMedia device-acquisition step itself is not exercised by this
  // path (that step is proven separately: real device enumeration is
  // real, and getUserMedia's permission-denied path was proven to fail
  // safely and readably in this same session's manual verification).
  async startWithSyntheticSource(float32Audio, sourceSampleRate, sourceName) {
    this._transcriber = await AsrPipelineSingleton.get();
    this._audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: TARGET_RATE });
    const buffer = this._audioCtx.createBuffer(1, float32Audio.length, sourceSampleRate);
    buffer.copyToChannel(Float32Array.from(float32Audio), 0);
    const bufferSource = this._audioCtx.createBufferSource();
    bufferSource.buffer = buffer;
    this._source = bufferSource;
    this._wireProcessor();
    this._deviceName = sourceName || 'synthetic test source (not a live microphone)';
    this._state = 'LISTENING';
    this._vadState = 'SILENCE';
    this._error = null;
    bufferSource.start();
    return new Promise((resolve) => {
      bufferSource.onended = () => resolve(this.getStatus());
    });
  }

  _wireProcessor() {
    // ScriptProcessorNode is deprecated but universally supported and
    // simple to reason about for this proof; an AudioWorklet migration
    // is a named REMAINDER (reports/WEB_BUILD_001.md), not a correctness
    // gap -- both deliver the same raw PCM chunks to this same VAD loop.
    this._processor = this._audioCtx.createScriptProcessor(4096, 1, 1);
    this._processor.onaudioprocess = (e) => this._onAudioProcess(e);
    this._source.connect(this._processor);
    this._processor.connect(this._makeSilentSink());
  }

  // A gain node at 0 keeps the ScriptProcessorNode graph alive (Chrome
  // silently stops firing onaudioprocess for nodes not connected toward a
  // destination) without ever producing audible mic monitoring/echo.
  _makeSilentSink() {
    const gain = this._audioCtx.createGain();
    gain.gain.value = 0;
    gain.connect(this._audioCtx.destination);
    return gain;
  }

  _onAudioProcess(e) {
    const chunk = e.inputBuffer.getChannelData(0);
    let sumSq = 0;
    for (let i = 0; i < chunk.length; i++) sumSq += chunk[i] * chunk[i];
    const rms = Math.sqrt(sumSq / chunk.length);
    this._levelDb = rms > 0 ? Math.max(-90, 20 * Math.log10(rms)) : -90;
    const chunkMs = (chunk.length / TARGET_RATE) * 1000;

    const isSpeechNow = this._levelDb > SPEECH_DB_THRESHOLD;
    if (isSpeechNow) {
      this._speaking = true;
      this._silenceMs = 0;
      this._vadState = 'SPEECH';
      this._buffer.push(Float32Array.from(chunk));
      this._bufferMs += chunkMs;
      this._sinceLastPartialMs += chunkMs;
    } else {
      this._vadState = 'SILENCE';
      if (this._speaking) {
        this._silenceMs += chunkMs;
        this._buffer.push(Float32Array.from(chunk)); // keep trailing silence in-utterance
        this._bufferMs += chunkMs;
        if (this._silenceMs >= SILENCE_MS_TO_FINALIZE && this._bufferMs >= MIN_UTTERANCE_MS) {
          this._finalizeUtterance();
        }
      }
    }

    if (this._speaking && !this._decoding && this._sinceLastPartialMs >= PARTIAL_INTERVAL_MS) {
      this._sinceLastPartialMs = 0;
      this._runPartial();
    }
  }

  _concatBuffer() {
    const total = this._buffer.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let off = 0;
    for (const c of this._buffer) { out.set(c, off); off += c.length; }
    return out;
  }

  async _runPartial() {
    if (this._buffer.length === 0) return;
    this._decoding = true;
    try {
      const audio = this._concatBuffer();
      const result = await runTranscription(this._transcriber, audio, { chunk_length_s: 30 });
      this._events.push({
        text: (result.text || '').trim(), is_final: false,
        utterance_index: this._utteranceCounter + 1, confidence: null, word_confidences: {},
      });
    } catch (err) {
      console.error('[asr] partial decode failed', err);
    } finally {
      this._decoding = false;
    }
  }

  async _finalizeUtterance() {
    const audio = this._concatBuffer();
    this._buffer = [];
    this._bufferMs = 0;
    this._speaking = false;
    this._silenceMs = 0;
    this._sinceLastPartialMs = 0;
    this._utteranceCounter += 1;
    const idx = this._utteranceCounter;
    this._decoding = true;
    try {
      const result = await runTranscription(this._transcriber, audio, { chunk_length_s: 30, return_timestamps: 'word' });
      const wordConfidences = {};
      // Xenova whisper-tiny.en does not reliably emit per-word probability
      // through this pipeline call (unlike faster-whisper's word.probability
      // on the desktop build) -- left empty rather than invented; the
      // ported scoring.py already tolerates absent confidences (falls back
      // to phonetic evidence alone, per error_attribution.py's own
      // docstring, unchanged here).
      this._events.push({
        text: (result.text || '').trim(), is_final: true,
        utterance_index: idx, confidence: null, word_confidences: wordConfidences,
      });
    } catch (err) {
      console.error('[asr] final decode failed', err);
      this._events.push({ text: '', is_final: true, utterance_index: idx, confidence: null, word_confidences: {} });
    } finally {
      this._decoding = false;
    }
  }

  poll() {
    const out = this._events;
    this._events = [];
    return out;
  }

  // PLAY-PAUSE-001 (web lane) -- pauses capture on the SAME real Web Audio
  // clock the mic's own ScriptProcessorNode graph already runs on, rather
  // than a separate flag main.js would have to remember to check on every
  // chunk. Suspending this input's own AudioContext is enough on its own:
  // per the Web Audio spec, a suspended context stops firing
  // onaudioprocess entirely (no chunks arrive, so nothing is buffered,
  // scored, or silently dropped mid-word) and its own clock freezes, then
  // resumes counting from exactly where it left off -- the same
  // "no drift, because the platform's own clock provides it" property
  // main.js's shared TTS AudioContext relies on for playback pause. Two
  // separate AudioContexts (this one at 16kHz for ASR, the TTS one at the
  // browser default rate) are paused/resumed independently by main.js's
  // pauseSession()/resumeSession(), but each is driftless on its own terms.
  async pause() {
    if (this._audioCtx && this._audioCtx.state === 'running') {
      await this._audioCtx.suspend();
    }
  }

  async resume() {
    if (this._audioCtx && this._audioCtx.state === 'suspended') {
      await this._audioCtx.resume();
    }
  }

  getStatus() {
    return {
      device_name: this._deviceName,
      level_db: this._levelDb,
      vad_state: this._vadState,
      state: this._state,
      error: this._error,
    };
  }

  async stop() {
    if (this._speaking && this._bufferMs >= MIN_UTTERANCE_MS) {
      await this._finalizeUtterance();
    }
    if (this._processor) { this._processor.disconnect(); this._processor.onaudioprocess = null; }
    if (this._source) this._source.disconnect();
    if (this._audioCtx) await this._audioCtx.close().catch(() => {});
    if (this._stream) this._stream.getTracks().forEach((t) => t.stop());
    this._state = 'MIC READY';
    return { stopped: true };
  }
}
