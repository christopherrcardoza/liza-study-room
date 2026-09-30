

const MODEL_BASE = 'assets/models/audio2face-3d-v2.3-mark';
const ORT_VERSION = '1.20.1';
const SOLVE_ITERS = 600;
const SOLVE_TOL = 1e-5;
const YIELD_BUDGET_MS = 8;
const TRACK_HOP_DIVISOR = 3;

let _ort = null;
let _session = null;
let _reduced = null;
let _initPromise = null;
let _queue = Promise.resolve();

export function isSupported() {
  return typeof WebAssembly !== 'undefined';
}

export function isWebGpuAvailable() {
  return !!navigator.gpu;
}

async function ensureInitialized(onProgress) {
  if (_session) return;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _ort = await import(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.webgpu.mjs`);
    _ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
    const provider = 'wasm';

    _ort.env.wasm.proxy = true;
    _ort.env.wasm.numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
      ? Math.min(4, navigator.hardwareConcurrency || 1)
      : 1;
    console.log(`[lipsync] ort wasm: proxy=true (off main thread) numThreads=${_ort.env.wasm.numThreads} `
      + `crossOriginIsolated=${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'unknown'}`);

    const [modelBuf, reduced] = await Promise.all([
      fetch(`${MODEL_BASE}/network.onnx`).then((r) => {
        onProgress?.('downloading lip-sync model...');
        return r.arrayBuffer();
      }),
      fetch(`${MODEL_BASE}/lipsync_reduced.json`).then((r) => r.json()),
    ]);
    _reduced = reduced;
    onProgress?.(`lip-sync model downloaded: ${(modelBuf.byteLength / 1e6).toFixed(0)}MB, compiling shaders...`);
    _session = await _ort.InferenceSession.create(modelBuf, { executionProviders: [provider] });
  })();
  return _initPromise;
}

function resampleTo16kMono(float32Audio, sourceRate, targetRate) {
  if (sourceRate === targetRate) return float32Audio;
  const ratio = targetRate / sourceRate;
  const outLen = Math.max(1, Math.round(float32Audio.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, float32Audio.length - 1);
    const frac = srcPos - i0;
    out[i] = float32Audio[i0] * (1 - frac) + float32Audio[Math.min(i1, float32Audio.length - 1)] * frac;
  }
  return out;
}

function matVecFlat(M, rows, cols, v, out) {
  for (let r = 0; r < rows; r++) {
    let s = 0;
    const rowOff = r * cols;
    for (let c = 0; c < cols; c++) s += M[rowOff + c] * v[c];
    out[r] = s;
  }
  return out;
}

let _lrCache = null;
let _lrCacheFor = null;
let _scratch = null;

function ensureScratch(n) {
  if (_scratch && _scratch.n === n) return _scratch;
  _scratch = {
    n,
    v: new Float64Array(n),
    g: new Float64Array(n),
    w: new Float64Array(n),
    y: new Float64Array(n),
    wn: new Float64Array(n),
  };
  return _scratch;
}

function stepSizeFor(AtAFlat, n) {
  if (_lrCache !== null && _lrCacheFor === AtAFlat) return _lrCache;
  const v = new Float64Array(n).fill(1);
  const Av = new Float64Array(n);
  for (let it = 0; it < 60; it++) {
    matVecFlat(AtAFlat, n, n, v, Av);
    let norm = 0;
    for (let i = 0; i < n; i++) norm += Av[i] * Av[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < n; i++) v[i] = Av[i] / norm;
  }
  matVecFlat(AtAFlat, n, n, v, Av);
  let lambdaMax = 0;
  for (let i = 0; i < n; i++) lambdaMax += v[i] * Av[i];
  _lrCacheFor = AtAFlat;
  _lrCache = 1.0 / (lambdaMax || 1);
  return _lrCache;
}

function solveBounded(AtAFlat, n, Atb, warmStart) {
  const lr = stepSizeFor(AtAFlat, n);
  const s = ensureScratch(n);
  const { g, w, y, wn } = s;

  if (warmStart) w.set(warmStart); else w.fill(0);
  y.set(w);
  let t = 1;

  matVecFlat(AtAFlat, n, n, w, g);
  let fPrev = 0;
  for (let i = 0; i < n; i++) fPrev += 0.5 * w[i] * g[i] - Atb[i] * w[i];

  let used = SOLVE_ITERS;
  for (let it = 0; it < SOLVE_ITERS; it++) {
    matVecFlat(AtAFlat, n, n, y, g);
    let step = 0;
    for (let i = 0; i < n; i++) {
      let z = y[i] - lr * (g[i] - Atb[i]);
      z = z < 0 ? 0 : (z > 1 ? 1 : z);
      const dz = z - w[i];
      const adz = dz < 0 ? -dz : dz;
      if (adz > step) step = adz;
      wn[i] = z;
    }
    matVecFlat(AtAFlat, n, n, wn, g);
    let f = 0;
    for (let i = 0; i < n; i++) f += 0.5 * wn[i] * g[i] - Atb[i] * wn[i];

    const tn = (1 + Math.sqrt(1 + 4 * t * t)) / 2;
    if (f > fPrev) {
      y.set(wn);
      t = 1;
    } else {
      const beta = (t - 1) / tn;
      for (let i = 0; i < n; i++) y[i] = wn[i] + beta * (wn[i] - w[i]);
      t = tn;
    }
    fPrev = f;
    w.set(wn);
    if (step < SOLVE_TOL) { used = it + 1; break; }
  }
  _lastSolveIters = used;
  return Float64Array.from(w);
}

let _lastSolveIters = 0;

let _yieldChannel = null;
function yieldToBrowser() {
  if (typeof scheduler !== 'undefined' && scheduler.yield) return scheduler.yield();
  if (!_yieldChannel) _yieldChannel = new MessageChannel();
  return new Promise((resolve) => {
    _yieldChannel.port1.onmessage = () => resolve();
    _yieldChannel.port2.postMessage(0);
  });
}

const QUEUE_UNBLOCK_MS = 30000;
let _queueUnblocks = 0;
let _queueAbandoned = 0;
let _queueDepth = 0;

export function computeWeightTrack(audioFloat32, sourceSampleRate, onProgress, opts) {
  const shouldAbort = opts && typeof opts.shouldAbort === 'function' ? opts.shouldAbort : null;
  _queueDepth++;
  const call = _queue.then(() => {
    if (shouldAbort && shouldAbort()) {
      _queueAbandoned++;
      return null;
    }
    return computeWeightTrackImpl(audioFloat32, sourceSampleRate, onProgress, shouldAbort);
  }).finally(() => { _queueDepth = Math.max(0, _queueDepth - 1); });
  _queue = new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    call.then(finish, finish);
    const t = setTimeout(() => {
      if (done) return;
      _queueUnblocks++;
      console.error(`[lipsync] a weight-track computation has not settled in ${QUEUE_UNBLOCK_MS} ms `
        + `(unblock #${_queueUnblocks}). Releasing the serialisation queue so the REST of the `
        + 'proceeding still gets lip-sync -- before this fix every later line was silently '
        + 'left with a still mouth for the whole session.');
      finish();
    }, QUEUE_UNBLOCK_MS);
    call.then(() => clearTimeout(t), () => clearTimeout(t));
  });
  return call;
}

export function lipsyncQueueHealth() {
  return {
    unblocks: _queueUnblocks,
    unblock_after_ms: QUEUE_UNBLOCK_MS,
    depth: _queueDepth,
    abandoned: _queueAbandoned,
  };
}

async function computeWeightTrackImpl(audioFloat32, sourceSampleRate, onProgress, shouldAbort) {
  await ensureInitialized(onProgress);
  if (shouldAbort && shouldAbort()) { _queueAbandoned++; return null; }
  const { buffer_len: bufferLen, buffer_ofs: bufferOfs, samplerate: sr,
    pose_names: poseNames, active_mask: activeMask, n_active: nActive,
    C, AtA, emotion_vec: emotionVec } = _reduced;

  const audio = resampleTo16kMono(audioFloat32, sourceSampleRate, sr);

  const hop = Math.max(1, Math.round(bufferOfs / TRACK_HOP_DIVISOR));
  let nFrames = Math.max(1, Math.floor((audio.length - bufferLen) / hop) + 1);
  if ((audio.length - bufferLen) % hop !== 0 || audio.length < bufferLen) nFrames += 1;
  const paddedLen = Math.max(audio.length, (nFrames - 1) * hop + bufferLen);
  const padded = new Float32Array(paddedLen);
  padded.set(audio);

  const { CFlat, AtAFlat } = ensureFlatCache(C, AtA);
  const emotionSrc = Float32Array.from(emotionVec);

  const frameTimesS = [];
  const weights = [];
  const Atb = new Float64Array(nActive);
  const coeffs = new Float64Array(272);
  let prevW = null;

  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let solveMs = 0;
  let iterTotal = 0;
  let sliceStart = t0;

  for (let i = 0; i < nFrames; i++) {
    const start = i * hop;
    const windowData = padded.slice(start, start + bufferLen);
    const windowT = new _ort.Tensor('float32', windowData, [1, 1, bufferLen]);
    const emotionT = new _ort.Tensor('float32', emotionSrc.slice(), [1, 1, emotionSrc.length]);
    const results = await _session.run({ input: windowT, emotion: emotionT });
    const resultData = results[_session.outputNames[0]].data;
    for (let k = 0; k < 272; k++) coeffs[k] = resultData[k];

    const tSolve = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    matVecFlat(CFlat, nActive, 272, coeffs, Atb);
    const wActive = solveBounded(AtAFlat, nActive, Atb, prevW);
    prevW = wActive;
    solveMs += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - tSolve;
    iterTotal += _lastSolveIters;

    const wFull = new Array(poseNames.length).fill(0);
    let ai = 0;
    for (let p = 0; p < poseNames.length; p++) {
      if (activeMask[p]) { wFull[p] = wActive[ai]; ai++; }
    }
    weights.push(wFull);
    frameTimesS.push((i * hop + bufferLen / 2) / sr);

    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - sliceStart >= YIELD_BUDGET_MS) {
      await yieldToBrowser();
      sliceStart = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (shouldAbort && shouldAbort()) {
        _queueAbandoned++;
        console.log(`[lipsync] track ABANDONED at frame ${i + 1}/${nFrames} -- its caller was `
          + 'superseded (a newer speed was chosen for this line). COURTSIM-REVERT-013.');
        return null;
      }
    }
  }

  const totalMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const audioS = audio.length / sr;
  console.log(`[lipsync] track: frames=${nFrames} audio=${audioS.toFixed(2)}s `
    + `solve=${solveMs.toFixed(1)}ms (${(solveMs / nFrames).toFixed(2)}ms/frame, `
    + `${(iterTotal / nFrames).toFixed(0)} iters/frame) `
    + `total=${totalMs.toFixed(0)}ms realtime_x=${(audioS * 1000 / Math.max(1, totalMs)).toFixed(2)} `
    + `track_hz=${(nFrames / Math.max(1e-6, audioS)).toFixed(2)} (hop_divisor=${TRACK_HOP_DIVISOR}, `
    + `was ${(sr / bufferOfs).toFixed(2)} Hz) `
    + `-- solve was 12.51ms/frame before COURTSIM-FIX-K. COURTSIM-LIPS-009: `
    + 'realtime_x must stay above 1; if it does not, lower TRACK_HOP_DIVISOR.');

  return balanceMouthTrack({ pose_names: poseNames, frame_times_s: frameTimesS, weights });
}


const LIP_TO_JAW_PEAK_RATIO = 0.70;
const LIP_BALANCE_MIN_JAW_PEAK = 0.02;
const LIP_BALANCE_EXEMPT = new Set(['jawOpen', 'mouthClose']);
const LIP_BALANCE_PREFIXES = ['jaw', 'mouth'];

export function balanceMouthTrack(track) {
  if (!track || !track.weights || !track.weights.length) return track;
  const { pose_names: names, weights } = track;
  const jawIdx = names.indexOf('jawOpen');
  if (jawIdx < 0) return track;
  let jawPeak = 0;
  for (const w of weights) if (w[jawIdx] > jawPeak) jawPeak = w[jawIdx];
  if (!(jawPeak > LIP_BALANCE_MIN_JAW_PEAK)) return track;
  const ceiling = jawPeak * LIP_TO_JAW_PEAK_RATIO;

  const scaled = [];
  for (let p = 0; p < names.length; p++) {
    const name = names[p];
    if (LIP_BALANCE_EXEMPT.has(name)) continue;
    if (!LIP_BALANCE_PREFIXES.some((pre) => name.startsWith(pre))) continue;
    let peak = 0;
    for (const w of weights) if (w[p] > peak) peak = w[p];
    if (peak <= ceiling) continue;
    const k = ceiling / peak;
    for (const w of weights) w[p] *= k;
    scaled.push(`${name} x${k.toFixed(3)}`);
  }

  if (scaled.length) {
    console.log(`[lipsync] lip balance: jawOpen peak ${jawPeak.toFixed(4)}, ceiling `
      + `${ceiling.toFixed(4)} (${LIP_TO_JAW_PEAK_RATIO}x) -- scaled ${scaled.length} pose(s): `
      + `${scaled.join(', ')}. COURTSIM-VOICE-048: before this stage `
      + 'mouthLowerDownRight was clamped at full lip retraction on 55.2% of frames while jawOpen '
      + 'was never clamped at all -- the lips were flapping, not the jaw.');
  }
  return track;
}

let _flatCache = null;
function ensureFlatCache(C, AtA) {
  if (_flatCache && _flatCache.C === C) return _flatCache;
  _flatCache = {
    C,
    CFlat: Float64Array.from(C.flat()),
    AtAFlat: Float64Array.from(AtA.flat()),
  };
  return _flatCache;
}
