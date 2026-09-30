export class TtsEngine {
  constructor() {
    this.tts = null;
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

  async synthesize(text, voiceId, speed = 1.0) {
    const call = this._queue.then(() => this.tts.generate(text, { voice: voiceId, speed }));
    this._queue = call.catch(() => {});
    const result = await call;
    return result; // { audio: Float32Array, sampling_rate }
  }
}

export const KOKORO_BASELINE_WPM = 141.2;

export function wpmToSpeed(targetWpm, roleBias = 1.0) {
  return (targetWpm / KOKORO_BASELINE_WPM) * roleBias;
}

export function deliverableWpm(targetWpm, roleBias = 1.0) {
  const raw = wpmToSpeed(targetWpm, roleBias);
  const used = Math.min(SYNTH_SPEED_MAX, Math.max(SYNTH_SPEED_MIN, raw));
  return Math.round(used * KOKORO_BASELINE_WPM);
}

export function maxDeliverableBias(globalWpm) {
  return SYNTH_SPEED_MAX / wpmToSpeed(globalWpm, 1.0);
}

export const CONTENT_SAFE_SPEED_MAX = 1.33;
export const CONTENT_SAFE_WPM_MAX = Math.floor(CONTENT_SAFE_SPEED_MAX * KOKORO_BASELINE_WPM); // 187

export function isContentSafeWpm(targetWpm, roleBias = 1.0) {
  return wpmToSpeed(targetWpm, roleBias) <= CONTENT_SAFE_SPEED_MAX;
}


const PITCH_RANGE = 0.06;   // max |P - 1|. ~100 cents. Beyond this, formant drift reads as a different person.
const ENERGY_RANGE_DB = 2.5; // max |gain| in dB. Loudness, not vocal effort -- see the block comment.
export const SYNTH_SPEED_MIN = 0.55;
export const SYNTH_SPEED_MAX = 1.85;

export const TOTAL_RATE_FLOOR = 0.90;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dbToGain = (db) => Math.pow(10, db / 20);

const OBJECTION_RE = /^\s*(objection|your honou?r,?\s*(i\s*)?object)\b/i;
const RULING_RE = /^\s*(sustained|overruled|so ordered)\b/i;
const ORDER_RE = /\b(all rise|be seated|you may (sit|step down|proceed)|order in the court)\b/i;

const QUESTION_LEAD_RE = /^\s*(who|what|when|where|why|how|did|do|does|is|are|was|were|will|would|can|could|have|has|had|isn'?t|didn'?t|weren'?t|and\s+(did|do|is|was|were)|directing your attention|tell (us|the court|the jury))\b/i;

export const TurnType = {
  QUESTION: 'question',
  ANSWER: 'answer',
  THINKING: 'thinking',      // an answer to a long or compound question -- the witness takes a beat
  OBJECTION: 'objection',    // interrupts, by definition
  RULING: 'ruling',          // the court disposing of an objection
  ORDER: 'order',            // "All rise" -- an instruction to the room
  CONTINUATION: 'continuation', // the same speaker carrying on; a breath, not a turn
  STATEMENT: 'statement',
};

const THINKING_QUESTION_WORDS = 30;

export function classifyTurn(text, role, prevText, prevType, sameSpeaker) {
  const t = String(text || '');
  if (OBJECTION_RE.test(t)) return TurnType.OBJECTION;
  if (role === 'COURT' && RULING_RE.test(t)) return TurnType.RULING;
  if (ORDER_RE.test(t)) return TurnType.ORDER;

  const isQuestion = /\?\s*$/.test(t.trim()) || QUESTION_LEAD_RE.test(t);
  if (isQuestion) return TurnType.QUESTION;
  if (sameSpeaker) return TurnType.CONTINUATION;

  if (prevType === TurnType.QUESTION || prevType === TurnType.OBJECTION) {
    const prevWords = (String(prevText || '').match(/\S+/g) || []).length;
    if (prevWords >= THINKING_QUESTION_WORDS || /^\s*(well|um+|uh+|i think|let me|i believe|i'?m not sure)\b/i.test(t)) {
      return TurnType.THINKING;
    }
    return TurnType.ANSWER;
  }
  return TurnType.STATEMENT;
}

export const TURN_PROSODY = {
  [TurnType.QUESTION]: {
    gapMs: 260, jitter: 0.30, rate: 1.00, pitch: 1.010, pitchEnd: +0.022, energyDb: +0.4, breathMs: 0,
    why: 'counsel registering the previous answer before asking again; terminal rise',
  },
  [TurnType.ANSWER]: {
    gapMs: 120, jitter: 0.35, rate: 1.02, pitch: 0.994, pitchEnd: -0.016, energyDb: 0.0, breathMs: 0,
    why: 'a direct answer comes in tight and lands lower than the question that prompted it',
  },
  [TurnType.THINKING]: {
    gapMs: 620, jitter: 0.40, rate: 0.95, pitch: 0.990, pitchEnd: -0.012, energyDb: -0.8, breathMs: 180,
    why: 'a witness working out the answer to a long question -- the most machine-like moment in the old build',
  },
  [TurnType.OBJECTION]: {
    gapMs: -180, jitter: 0.25, rate: 1.10, pitch: 1.035, pitchEnd: -0.020, energyDb: +2.0, breathMs: 0,
    why: 'an objection interrupts by definition; a positive gap here is simply wrong',
  },
  [TurnType.RULING]: {
    gapMs: 420, jitter: 0.20, rate: 0.94, pitch: 0.985, pitchEnd: -0.030, energyDb: +0.8, breathMs: 120,
    why: 'the court takes its time and the ruling falls hard, because it is final',
  },
  [TurnType.ORDER]: {
    gapMs: 480, jitter: 0.15, rate: 0.92, pitch: 0.992, pitchEnd: -0.024, energyDb: +1.4, breathMs: 160,
    why: 'an instruction to the whole room, delivered slower and louder than dialogue',
  },
  [TurnType.CONTINUATION]: {
    gapMs: 90, jitter: 0.30, rate: 1.00, pitch: 1.000, pitchEnd: -0.008, energyDb: 0.0, breathMs: 0,
    why: 'the same speaker carrying on -- a breath, not a turn exchange',
  },
  [TurnType.STATEMENT]: {
    gapMs: 240, jitter: 0.30, rate: 1.00, pitch: 1.000, pitchEnd: -0.014, energyDb: 0.0, breathMs: 0,
    why: 'conversational baseline',
  },
};

const BREATH_TRIGGER_WORDS = 28;
const BREATH_MS = 220;

const ANSWER_PITCH_CARRY = 0.45;

function stableJitter(index, salt) {
  let h = (index * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h / 4294967295) * 2 - 1; // -1..+1
}

export function prosodyForTurn({ index, text, role, wpm, roleBias = 1.0, turnType, prev = null }) {
  const spec = TURN_PROSODY[turnType] || TURN_PROSODY[TurnType.STATEMENT];

  let pitch = spec.pitch;
  if (prev && (turnType === TurnType.ANSWER || turnType === TurnType.THINKING || turnType === TurnType.RULING)) {
    pitch = pitch + (prev.pitchEndAbs - 1) * ANSWER_PITCH_CARRY;
  }
  pitch += stableJitter(index, 11) * 0.006; // a real speaker is not identical twice
  pitch = clamp(pitch, 1 - PITCH_RANGE, 1 + PITCH_RANGE);

  const pitchEndAbs = clamp(pitch + spec.pitchEnd, 1 - PITCH_RANGE, 1 + PITCH_RANGE);

  const rateMul = spec.rate * (1 + stableJitter(index, 23) * 0.025);

  const totalRaw = roleBias * rateMul;
  const totalRate = Math.max(TOTAL_RATE_FLOOR, totalRaw);
  const totalRateFloored = totalRate !== totalRaw;

  const E = wpmToSpeed(wpm, 1.0) * totalRate;

  const R = pitch;
  const Sraw = E / R;
  const S = clamp(Sraw, SYNTH_SPEED_MIN, SYNTH_SPEED_MAX);
  const rateClamped = S !== Sraw;

  const energyDb = clamp(spec.energyDb + stableJitter(index, 37) * 0.35, -ENERGY_RANGE_DB, ENERGY_RANGE_DB);

  const words = (String(text || '').match(/\S+/g) || []).length; // see classifyTurn's note on split()
  const jitterMs = spec.gapMs * spec.jitter * stableJitter(index, 53);
  const gapMs = Math.round(spec.gapMs + jitterMs);
  const leadSilenceMs = Math.round(spec.breathMs + (words >= BREATH_TRIGGER_WORDS ? BREATH_MS : 0));

  return {
    turnType,
    wpm,
    synthSpeed: S,
    playbackRate: R,
    playbackRateEnd: pitchEndAbs,
    gain: dbToGain(energyDb),
    gapMs,
    leadSilenceMs,
    pitchEndAbs,
    roleBias,
    rateClamped,
    requestedSpeakerWpm: Math.round(wpm * totalRate),
    totalRate,
    totalRateFloored,
    deliveredWpm: Math.round(S * R * KOKORO_BASELINE_WPM),
    _debug: { E, rateMul, totalRaw, energyDb, words, why: spec.why },
  };
}

export const FALLBACK_GAP_MS = 180;

export function playSynthesized(audioCtx, synthResult, destinationNode, onStart, prosody) {
  return new Promise((resolve) => {
    const buffer = audioCtx.createBuffer(1, synthResult.audio.length, synthResult.sampling_rate);
    buffer.copyToChannel(synthResult.audio, 0);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    if (prosody && Number.isFinite(prosody.playbackRate) && prosody.playbackRate > 0) {
      src.playbackRate.value = prosody.playbackRate;
    }
    src.connect(destinationNode || audioCtx.destination);
    src.addEventListener('ended', () => resolve());
    src.start();
    if (typeof onStart === 'function') {
      try { onStart(src); } catch (err) { /* ownership is optional; playback is not */ }
    }
  });
}


const GAVEL_LEN_SEC = 0.20;
const GAVEL_MODES = [
  { hz: 220, decay: 38, amp: 1.00 },   // body -- the low "thock"
  { hz: 1450, decay: 62, amp: 0.45 },  // surface -- the "crack"
];
const GAVEL_IMPULSE_SEC = 0.006;
const GAVEL_FADE_SEC = 0.015;

function gavelNoise(i) {
  let h = (i * 2654435761 + 97 * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h / 4294967295) * 2 - 1;
}

export function renderGavelBuffer(sampleRate) {
  const sr = sampleRate || 24000;
  const n = Math.max(1, Math.floor(sr * GAVEL_LEN_SEC));
  const out = new Float32Array(n);
  const impulseN = Math.max(1, Math.floor(sr * GAVEL_IMPULSE_SEC));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    if (i < impulseN) v += gavelNoise(i) * (1 - i / impulseN) * 0.9;
    for (const m of GAVEL_MODES) {
      v += m.amp * Math.sin(2 * Math.PI * m.hz * t) * Math.exp(-m.decay * t);
    }
    out[i] = v;
  }
  const fadeN = Math.max(1, Math.floor(sr * GAVEL_FADE_SEC));
  for (let k = 0; k < fadeN && k < n; k++) {
    const i = n - 1 - k;
    out[i] *= 0.5 * (1 - Math.cos(Math.PI * (k / fadeN)));
  }
  for (let i = 0; i < n; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return { samples: out, sampleRate: sr, lengthSec: n / sr };
}

let _gavelBufferCache = null;

export function playGavelBang(audioCtx, destinationNode, atTime = 0, gain = 0.85) {
  if (!audioCtx) return null;
  if (!_gavelBufferCache || _gavelBufferCache.sampleRate !== audioCtx.sampleRate) {
    const rendered = renderGavelBuffer(audioCtx.sampleRate);
    const buf = audioCtx.createBuffer(1, rendered.samples.length, rendered.sampleRate);
    buf.copyToChannel(rendered.samples, 0);
    _gavelBufferCache = { buffer: buf, sampleRate: audioCtx.sampleRate };
  }
  const when = Math.max(atTime || 0, audioCtx.currentTime);
  const src = audioCtx.createBufferSource();
  src.buffer = _gavelBufferCache.buffer;
  const g = audioCtx.createGain();
  g.gain.value = gain;
  src.connect(g);
  g.connect(destinationNode || audioCtx.destination);
  src.start(when);
  return { source: src, scheduledAt: when, lengthSec: _gavelBufferCache.buffer.duration };
}
