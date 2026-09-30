

const LOOK_YAW_SPAN_DEG = 120;
const LOOK_PITCH_SPAN_DEG = 70;

const LOOK_EDGE_BAND = 0.08;

const LOOK_EDGE_RATE_DEFAULT_DEG_S = 60;
const LOOK_EDGE_RATE_MIN_DEG_S = 15;
const LOOK_EDGE_RATE_MAX_DEG_S = 150;

const LOOK_EDGE_RAMP_MS = 250;

const LOOK_PITCH_MIN_DEG = -75;
const LOOK_PITCH_MAX_DEG = 75;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const SOURCE_MOUSE = 'mouse';
const SOURCE_HEAD = 'head';
const SOURCE_HOLD_MS = 400;
const SOURCE_STRONG_HEAD_DEG = 3;
const SOURCE_STRONG_MOUSE_N = 0.05;
const SOURCE_IDLE_HEAD_DEG = 0.5;
const SOURCE_IDLE_MOUSE_N = 0.002;


const WEBCAM_GRID_W = 32;
const WEBCAM_GRID_H = 24;
const WEBCAM_BG_ALPHA = 0.02;      // background EMA -- ~50 frames (3 s at 15 Hz)
const WEBCAM_SMOOTH = 0.25;        // output smoothing; higher = snappier, jitterier
const WEBCAM_DEADZONE = 0.04;      // normalised head offset below which nothing moves
const WEBCAM_YAW_GAIN_DEG = 70;    // full-frame head excursion -> this much head turn
const WEBCAM_PITCH_GAIN_DEG = 40;
const WEBCAM_SAMPLE_MS = 66;       // 15 Hz. A 60 Hz render does not need 60 Hz of head.

const WEBCAM_LEAN_LEAK_S = 8;      // time constant of the decay back to centre
const WEBCAM_HEAD_BAND = 0.55;     // fraction of frame height treated as head space
const WEBCAM_HEAD_BAND_FLOOR = 0.15; // weight given to pixels below that band

const MP_VERSION = '1.0.1';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/'
  + 'face_landmarker/float16/1/face_landmarker.task';
const MP_BYTES = 15994366;        // uncompressed
const MP_WIRE_BYTES = 7006724;    // MEASURED over the wire in his own Chrome

const LM_NOSE_TIP = 1;
const LM_EYE_OUTER_R = 33;
const LM_EYE_OUTER_L = 263;
const LM_MIN_COUNT = 468;
const NOSE_PROUD_RATIO = 22 / 90;
const NOSE_LOW_RATIO = 25 / 90;
const NOSE_R_RATIO = Math.hypot(NOSE_LOW_RATIO, NOSE_PROUD_RATIO);
const NOSE_REST_DEG = Math.atan2(NOSE_PROUD_RATIO, NOSE_LOW_RATIO) / DEG;
const PRECISE_PITCH_MIN_DEG = -(NOSE_REST_DEG - 1.5);
const PRECISE_SMOOTH = 0.35;        // landmarks are steadier than a luma blob
const PRECISE_DEADZONE_DEG = 1.5;   // degrees of head turn that do nothing
const PRECISE_YAW_LIMIT_DEG = 85;   // saturate rather than wrap
const PRECISE_SAMPLE_MS = 66;       // 15 Hz, same budget as the cheap path
const PRECISE_FRAME_BUDGET_MS = 12;
const PRECISE_WARMUP_PX = 64;

const HEAD_OFF = 'off';
const HEAD_LEAN = 'lean';
const HEAD_PRECISE = 'precise';

class WebcamHead {
  constructor() {
    this.mode = HEAD_OFF;
    this.error = null;
    this.loading = false;
    this.stream = null;
    this.video = null;

    this._baseline = null;          // { a, b } in whichever tracker's units
    this._smooth = { a: 0, b: 0 };
    this._raw = { a: 0, b: 0 };
    this._fresh = false;            // did the current tracker see a head this sample
    this.seen = false;
    this._lastSampleMs = 0;
    this._lastEmit = { yawDeg: 0, pitchDeg: 0 };

    this._ctx = null;
    this._bg = null;
    this._detector = null;

    this._landmarker = null;
    this._mp = null;
    this._inferMs = 0;              // MEASURED, rolling
    this._warmupMs = null;          // the one-off shader compile, measured
    this._inferMax = 0;
    this._sampleMs = PRECISE_SAMPLE_MS;
    this._lastVideoTs = -1;
    this._faces = 0;
  }

  isActive() { return this.mode !== HEAD_OFF; }

  signalKind() {
    if (this.mode === HEAD_PRECISE) return 'orientation';
    if (this.mode === HEAD_LEAN) return this._detector ? 'position' : 'position';
    return 'none';
  }


  async setMode(mode) {
    if (mode === this.mode) return true;
    if (mode === HEAD_OFF) { this.stop(); return true; }
    this.error = null;
    this.loading = true;
    try {
      if (!await this._openStream()) return false;
      if (mode === HEAD_PRECISE) {
        if (!await this._loadLandmarker()) return false;
      }
      this._resetCalibration();
      this.mode = mode;
      return true;
    } finally {
      this.loading = false;
    }
  }

  async _openStream() {
    if (this.stream && this.video) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.error = 'This browser has no camera API.';
      return false;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: false,
      });
    } catch (err) {
      this.error = (err && err.name === 'NotAllowedError')
        ? 'Camera permission was refused, so head tracking is off. The mouse still works.'
        : `The camera could not be opened (${(err && err.name) || 'unknown'}). The mouse still works.`;
      return false;
    }
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (e) { /* autoplay of a muted local stream */ }
    const c = document.createElement('canvas');
    c.width = WEBCAM_GRID_W; c.height = WEBCAM_GRID_H;
    this._ctx = c.getContext('2d', { willReadFrequently: true });
    this._bg = null;
    if (typeof window !== 'undefined' && typeof window.FaceDetector === 'function') {
      try { this._detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); }
      catch (e) { this._detector = null; }
    }
    return true;
  }

  async _loadLandmarker() {
    if (this._landmarker) return true;
    try {
      const mp = this._mp || (this._mp = await import(/* @vite-ignore */ MP_BUNDLE));
      const fileset = await mp.FilesetResolver.forVisionTasks(MP_WASM_BASE);
      this._landmarker = await mp.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      this._sampleMs = PRECISE_SAMPLE_MS;
      try {
        const warm = document.createElement('canvas');
        warm.width = PRECISE_WARMUP_PX; warm.height = PRECISE_WARMUP_PX;
        const g = warm.getContext('2d');
        g.fillStyle = '#808080'; g.fillRect(0, 0, PRECISE_WARMUP_PX, PRECISE_WARMUP_PX);
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this._landmarker.detectForVideo(warm, 1);
        this._warmupMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      } catch (e) { this._warmupMs = -1; }
      return true;
    } catch (err) {
      this._landmarker = null;
      this.error = 'Precise head tracking could not load'
        + (navigator && navigator.onLine === false ? ' -- this machine is offline.' : '.')
        + ' Lean tracking still works with no download, and the mouse always works.'
        + ` (${(err && err.message) ? String(err.message).slice(0, 120) : 'unknown'})`;
      return false;
    }
  }

  stop() {
    this.mode = HEAD_OFF;
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); }
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    if (this._landmarker && typeof this._landmarker.close === 'function') {
      try { this._landmarker.close(); } catch (e) { /* already gone */ }
    }
    this._landmarker = null;
    this._ctx = null; this._bg = null; this._detector = null;
    this._resetCalibration();
  }

  _resetCalibration() {
    this._baseline = null;
    this._raw = { a: 0, b: 0 };
    this._smooth = { a: 0, b: 0 };
    this._lastEmit = { yawDeg: 0, pitchDeg: 0 };
    this.seen = false;
    this._faces = 0;
  }

  centre() {
    this._baseline = { a: this._raw.a, b: this._raw.b };
    this._smooth = { a: 0, b: 0 };
  }


  sample(nowMs) {
    if (this.mode === HEAD_OFF || !this.video) return null;
    const period = this.mode === HEAD_PRECISE ? this._sampleMs : WEBCAM_SAMPLE_MS;
    if (nowMs - this._lastSampleMs < period) return this._lastEmit.valid ? this._lastEmit : this._emit(0);
    const dt = this._lastSampleMs ? (nowMs - this._lastSampleMs) / 1000 : 0;
    this._lastSampleMs = nowMs;
    if (this.video.readyState < 2) return this._emit(dt);
    this._fresh = false;
    const raw = this.mode === HEAD_PRECISE ? this._samplePrecise(nowMs) : this._sampleLean();
    if (raw) {
      this.seen = true;
      this._fresh = true;
      this._raw = raw;
      if (!this._baseline) this._baseline = { a: raw.a, b: raw.b };
    }
    return this._emit(dt);
  }

  _emit(dt) {
    if (!this._baseline) return null;
    if (this.mode === HEAD_LEAN && !this._fresh && dt > 0) {
      const k = Math.exp(-dt / WEBCAM_LEAN_LEAK_S);
      this._raw = {
        a: this._baseline.a + (this._raw.a - this._baseline.a) * k,
        b: this._baseline.b + (this._raw.b - this._baseline.b) * k,
      };
    }
    const ta = this._raw.a - this._baseline.a;
    const tb = this._raw.b - this._baseline.b;
    const s = this.mode === HEAD_PRECISE ? PRECISE_SMOOTH : WEBCAM_SMOOTH;
    this._smooth.a += (ta - this._smooth.a) * s;
    this._smooth.b += (tb - this._smooth.b) * s;

    let out;
    if (this.mode === HEAD_PRECISE) {
      const dz = (v) => (Math.abs(v) < PRECISE_DEADZONE_DEG
        ? 0 : v - Math.sign(v) * PRECISE_DEADZONE_DEG);
      out = {
        yawDeg: clamp(dz(this._smooth.a), -PRECISE_YAW_LIMIT_DEG, PRECISE_YAW_LIMIT_DEG),
        pitchDeg: clamp(dz(this._smooth.b), PRECISE_PITCH_MIN_DEG, PRECISE_YAW_LIMIT_DEG),
      };
    } else {
      const dz = (v) => (Math.abs(v) < WEBCAM_DEADZONE ? 0 : v - Math.sign(v) * WEBCAM_DEADZONE);
      out = {
        yawDeg: dz(this._smooth.a) * WEBCAM_YAW_GAIN_DEG,
        pitchDeg: -dz(this._smooth.b) * WEBCAM_PITCH_GAIN_DEG,
      };
    }
    out.valid = true;
    this._lastEmit = out;
    return out;
  }


  _samplePrecise(nowMs) {
    if (!this._landmarker) return null;
    const ts = (this.video.currentTime * 1000) | 0;
    if (ts === this._lastVideoTs) return null;
    this._lastVideoTs = ts;
    let res;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    try { res = this._landmarker.detectForVideo(this.video, nowMs); }
    catch (e) { return null; }
    const cost = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    this._inferMs += (cost - this._inferMs) * 0.2;
    if (cost > this._inferMax) this._inferMax = cost;
    if (cost > PRECISE_FRAME_BUDGET_MS) {
      this._sampleMs = Math.min(this._sampleMs * 1.5, PRECISE_SAMPLE_MS * 4);
    } else if (this._sampleMs > PRECISE_SAMPLE_MS) {
      this._sampleMs = Math.max(this._sampleMs * 0.9, PRECISE_SAMPLE_MS);
    }
    const sets = res && res.faceLandmarks;
    this._faces = sets ? sets.length : 0;
    if (!sets || !sets.length) return null;
    const p = sets[0];
    if (!p || p.length < LM_MIN_COUNT) return null;
    const nose = p[LM_NOSE_TIP], er = p[LM_EYE_OUTER_R], el = p[LM_EYE_OUTER_L];
    if (!nose || !er || !el) return null;
    let ex = el.x - er.x, ey = el.y - er.y;
    const span = Math.hypot(ex, ey);
    if (!(span > 1e-4)) return null;
    ex /= span; ey /= span;
    const mx = (el.x + er.x) / 2, my = (el.y + er.y) / 2;
    const dx = nose.x - mx, dy = nose.y - my;
    const along = (dx * ex + dy * ey) / span;
    const across = (-dx * ey + dy * ex) / span;
    return {
      a: Math.atan(along / NOSE_PROUD_RATIO) / DEG,
      b: Math.acos(clamp(across / NOSE_R_RATIO, -1, 1)) / DEG - NOSE_REST_DEG,
    };
  }


  _sampleLean() {
    if (this._detector) {
      this._detector.detect(this.video).then((faces) => {
        if (!faces || !faces.length) return;
        const b = faces[0].boundingBox;
        const vw = this.video.videoWidth || 640;
        const vh = this.video.videoHeight || 480;
        this._raw = {
          a: ((b.x + b.width / 2) / vw) * 2 - 1,
          b: ((b.y + b.height / 2) / vh) * 2 - 1,
        };
        this.seen = true;
        this._fresh = true;
        if (!this._baseline) this._baseline = { a: this._raw.a, b: this._raw.b };
      }).catch(() => { this._detector = null; });
      return null;
    }
    this._ctx.drawImage(this.video, 0, 0, WEBCAM_GRID_W, WEBCAM_GRID_H);
    let data;
    try { data = this._ctx.getImageData(0, 0, WEBCAM_GRID_W, WEBCAM_GRID_H).data; }
    catch (e) { return null; }   // tainted canvas -- cannot happen for a local stream
    const n = WEBCAM_GRID_W * WEBCAM_GRID_H;
    if (!this._bg) this._bg = new Float32Array(n);
    let sx = 0, sy = 0, sw = 0;
    let first = true;
    const bandRows = Math.max(1, Math.round(WEBCAM_GRID_H * WEBCAM_HEAD_BAND));
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const g = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114);
      const bg = this._bg[i];
      if (bg === 0) { this._bg[i] = g; continue; }
      first = false;
      const d = Math.abs(g - bg);
      this._bg[i] = bg + (g - bg) * WEBCAM_BG_ALPHA;
      if (d > 6) {
        const row = (i / WEBCAM_GRID_W) | 0;
        const w = d * (row < bandRows ? 1 : WEBCAM_HEAD_BAND_FLOOR);
        const px = (i % WEBCAM_GRID_W) / (WEBCAM_GRID_W - 1) * 2 - 1;
        const py = row / (WEBCAM_GRID_H - 1) * 2 - 1;
        sx += px * w; sy += py * w; sw += w;
      }
    }
    if (first || sw < 40) return null;   // nothing moving that looks like a person
    return { a: sx / sw, b: sy / sw };
  }

  diagnostics() {
    return {
      mode: this.mode,
      active: this.isActive(),
      signal: this.signalKind(),
      error: this.error,
      loading: this.loading,
      path: this.mode === HEAD_PRECISE
        ? `mediapipe-face-landmarker@${MP_VERSION}`
        : (this.mode === HEAD_LEAN ? (this._detector ? 'FaceDetector-box' : 'luma-32x24') : 'none'),
      downloadBytes: this.mode === HEAD_PRECISE ? MP_BYTES : 0,
      downloadWireBytes: this.mode === HEAD_PRECISE ? MP_WIRE_BYTES : 0,
      warmupMs: this._warmupMs,
      headSeen: this.seen,
      faces: this._faces,
      calibrated: !!this._baseline,
      inferenceMs: +this._inferMs.toFixed(3),
      inferenceMaxMs: +this._inferMax.toFixed(3),
      sampleHz: +(1000 / (this.mode === HEAD_PRECISE ? this._sampleMs : WEBCAM_SAMPLE_MS)).toFixed(1),
      raw: { ...this._raw },
      smoothed: { ...this._smooth },
      out: { yawDeg: this._lastEmit.yawDeg || 0, pitchDeg: this._lastEmit.pitchDeg || 0 },
    };
  }
}

export const HEAD_TRACKING = {
  OFF: HEAD_OFF, LEAN: HEAD_LEAN, PRECISE: HEAD_PRECISE,
  preciseBytes: MP_BYTES,
  preciseWireBytes: MP_WIRE_BYTES,
  preciseVersion: MP_VERSION,
  preciseFrameBudgetMs: PRECISE_FRAME_BUDGET_MS,
  leakSeconds: WEBCAM_LEAN_LEAK_S,
};

export class StationaryLookInput {
  constructor(controller, canvas) {
    this.controller = controller;
    this.canvas = canvas;
    this.enabled = false;

    this._anchor = { x: 0, y: 0, z: 0 };
    this._R = 1;
    this._neutralYaw = 0;
    this._neutralPitch = 0;
    this._yaw = 0;
    this._pitch = 0;
    this._cursor = null;
    this._edgeHeldMs = 0;
    this._webcamOffset = { yawDeg: 0, pitchDeg: 0 };
    this._lastAppliedYaw = NaN;    // NaN !== NaN, so the first frame always applies
    this._lastAppliedPitch = NaN;

    this._source = SOURCE_MOUSE;
    this._headOffset = { yaw: 0, pitch: 0 };   // radians, from the tracker
    this._headMovedMs = 0;
    this._mouseMovedMs = 0;

    this.edgeRateDegS = LOOK_EDGE_RATE_DEFAULT_DEG_S;
    this.webcam = new WebcamHead();

    this._ui = null;
    this._toastTimer = null;
    this._bindPointer();
  }


  isEnabled() { return this.enabled; }

  setEdgeRate(degPerSec) {
    this.edgeRateDegS = clamp(Number(degPerSec) || LOOK_EDGE_RATE_DEFAULT_DEG_S,
      LOOK_EDGE_RATE_MIN_DEG_S, LOOK_EDGE_RATE_MAX_DEG_S);
    this._syncUi();
    return this.edgeRateDegS;
  }

  getRateRange() {
    return { min: LOOK_EDGE_RATE_MIN_DEG_S, max: LOOK_EDGE_RATE_MAX_DEG_S,
      value: this.edgeRateDegS, default: LOOK_EDGE_RATE_DEFAULT_DEG_S };
  }

  enable(opts = {}) {
    if (this.enabled) return;
    this.enabled = true;
    this.controller.setZoomMode(null);
    this.controller.setOrbitMode(false);
    this.reanchor();
    this._syncUi();
    if (opts.announce !== false) {
      this._toast('LOOK AROUND: on. Move the mouse to turn your head. Push to an edge to keep turning. H turns it off.');
    }
  }

  disable(opts = {}) {
    if (!this.enabled) return;
    this.enabled = false;
    this._cursor = null;
    this._edgeHeldMs = 0;
    this.canvas.style.cursor = '';
    this.controller.persistLookPose();
    this._syncUi();
    if (opts.announce !== false) this._toast('LOOK AROUND: off.');
  }

  toggle() { if (this.enabled) this.disable(); else this.enable(); }

  centreHead() {
    if (!this.webcam.isActive()) {
      this._toast('HEAD TRACKING is off, so there is nothing to centre. Turn it on in the toolbar.');
      return false;
    }
    this.webcam.centre();
    if (this._source === SOURCE_HEAD) {
      this._neutralYaw += this._headOffset.yaw;
      this._neutralPitch += this._headOffset.pitch;
    }
    this._headOffset = { yaw: 0, pitch: 0 };
    this._webcamOffset = { yawDeg: 0, pitchDeg: 0 };
    this._toast(this.webcam.seen
      ? 'HEAD CENTRED. This posture is now looking straight ahead. The view did not move.'
      : 'No head found yet -- check the camera is not covered.');
    return true;
  }

  reanchor() {
    const st = this.controller.getStationaryLookBasis();
    if (!st) return;
    this._anchor = st.pos;
    this._R = st.R;
    this._yaw = st.yaw;
    this._pitch = clamp(st.pitch, LOOK_PITCH_MIN_DEG * DEG, LOOK_PITCH_MAX_DEG * DEG);
    const m = this._offsetOf(this._source);
    this._neutralYaw = this._yaw - m.yaw;
    this._neutralPitch = this._pitch - m.pitch;
    this._edgeHeldMs = 0;
    this._lastAppliedYaw = NaN;
    this._lastAppliedPitch = NaN;
  }


  _map(n) {
    const inner = 1 - LOOK_EDGE_BAND;
    const ux = clamp(n.x / inner, -1, 1);
    const uy = clamp(n.y / inner, -1, 1);
    return {
      yaw: -ux * (LOOK_YAW_SPAN_DEG / 2) * DEG,
      pitch: -uy * (LOOK_PITCH_SPAN_DEG / 2) * DEG,
    };
  }


  _offsetOf(src) {
    if (src === SOURCE_HEAD) {
      return { yaw: this._headOffset.yaw, pitch: this._headOffset.pitch };
    }
    return this._map(this._cursor || { x: 0, y: 0 });
  }

  _setSource(next) {
    if (next === this._source) return;
    const out = this._offsetOf(this._source);
    const inc = this._offsetOf(next);
    this._neutralYaw += out.yaw - inc.yaw;
    this._neutralPitch += out.pitch - inc.pitch;
    this._source = next;
    this._edgeHeldMs = 0;
  }

  _claim(src, mag, nowMs) {
    const t = nowMs || 0;
    if (src === this._source) {
      if (mag >= (src === SOURCE_HEAD ? SOURCE_IDLE_HEAD_DEG : SOURCE_IDLE_MOUSE_N)) {
        if (src === SOURCE_HEAD) this._headMovedMs = t; else this._mouseMovedMs = t;
      }
      return;
    }
    const idle = src === SOURCE_HEAD ? SOURCE_IDLE_HEAD_DEG : SOURCE_IDLE_MOUSE_N;
    if (mag < idle) return;
    const ownerLast = this._source === SOURCE_HEAD ? this._headMovedMs : this._mouseMovedMs;
    const ownerWarm = t - ownerLast < SOURCE_HOLD_MS;
    const strong = src === SOURCE_HEAD ? SOURCE_STRONG_HEAD_DEG : SOURCE_STRONG_MOUSE_N;
    if (ownerWarm && mag < strong) return;
    if (src === SOURCE_HEAD) this._headMovedMs = t; else this._mouseMovedMs = t;
    this._setSource(src);
  }


  tick(dt) {
    if (!this.enabled) return;
    const step = Math.min(Math.max(dt || 0, 0), 0.1);   // a tab that was backgrounded must not lurch

    const c = this._source === SOURCE_MOUSE ? this._cursor : null;
    if (c) {
      const inner = 1 - LOOK_EDGE_BAND;
      const ex = Math.abs(c.x) > inner ? Math.sign(c.x) : 0;
      const ey = Math.abs(c.y) > inner ? Math.sign(c.y) : 0;
      if (ex || ey) {
        this._edgeHeldMs += step * 1000;
        const ramp = clamp(this._edgeHeldMs / LOOK_EDGE_RAMP_MS, 0, 1);
        const d = this.edgeRateDegS * DEG * step * ramp;
        this._neutralYaw -= ex * d;
        const half = (LOOK_PITCH_SPAN_DEG / 2) * DEG;
        const lo = LOOK_PITCH_MIN_DEG * DEG, hi = LOOK_PITCH_MAX_DEG * DEG;
        const loN = lo + half, hiN = hi - half;
        const wasInside = this._neutralPitch >= loN && this._neutralPitch <= hiN;
        const np = this._neutralPitch - ey * d;
        this._neutralPitch = wasInside ? clamp(np, loN, hiN) : clamp(np, lo, hi);
      } else {
        this._edgeHeldMs = 0;
      }
    } else {
      this._edgeHeldMs = 0;
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.webcam.isActive()) {
      const w = this.webcam.sample(now);
      if (w) {
        this._webcamOffset = w;
        const nextYaw = w.yawDeg * DEG, nextPitch = w.pitchDeg * DEG;
        const mag = Math.hypot(nextYaw - this._headOffset.yaw,
          nextPitch - this._headOffset.pitch) / DEG;
        this._headOffset = { yaw: nextYaw, pitch: nextPitch };
        this._claim(SOURCE_HEAD, mag, now);
      }
    } else if (this._headOffset.yaw !== 0 || this._headOffset.pitch !== 0) {
      this._setSource(SOURCE_MOUSE);
      this._headOffset = { yaw: 0, pitch: 0 };
      this._webcamOffset = { yawDeg: 0, pitchDeg: 0 };
    }

    this._apply();
  }

  _apply() {
    const m = this._offsetOf(this._source);
    if (this._neutralYaw > TAU || this._neutralYaw < -TAU) {
      this._neutralYaw = ((this._neutralYaw % TAU) + TAU) % TAU;
    }
    this._yaw = this._neutralYaw + m.yaw;
    this._pitch = clamp(this._neutralPitch + m.pitch,
      LOOK_PITCH_MIN_DEG * DEG, LOOK_PITCH_MAX_DEG * DEG);

    if (this._yaw === this._lastAppliedYaw && this._pitch === this._lastAppliedPitch) return;
    this._lastAppliedYaw = this._yaw;
    this._lastAppliedPitch = this._pitch;

    const cp = Math.cos(this._pitch);
    const target = [
      this._anchor.x + this._R * Math.sin(this._yaw) * cp,
      this._anchor.y + this._R * Math.sin(this._pitch),
      this._anchor.z + this._R * Math.cos(this._yaw) * cp,
    ];
    this.controller.applyStationaryLook(
      [this._anchor.x, this._anchor.y, this._anchor.z], target);
  }


  _bindPointer() {
    const norm = (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 0, y: 0 };
      return {
        x: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1),
        y: clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1),
      };
    };
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const n = norm(e);
      const prev = this._cursor;
      const mag = prev ? Math.hypot(n.x - prev.x, n.y - prev.y) : SOURCE_STRONG_MOUSE_N;
      this._cursor = n;
      this._claim(SOURCE_MOUSE, mag,
        typeof performance !== 'undefined' ? performance.now() : Date.now());
    }, { passive: true });
    this.canvas.addEventListener('pointerenter', (e) => {
      if (!this.enabled) return;
      this._cursor = norm(e);
      this.reanchor();
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.enabled) return;
      const m = this._offsetOf(SOURCE_MOUSE);
      if (this._source === SOURCE_MOUSE) {
        this._neutralYaw += m.yaw;
        this._neutralPitch += m.pitch;
      }
      this._cursor = null;
      this._edgeHeldMs = 0;
      this.controller.persistLookPose();
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this._cursor = norm(e);
    });
  }


  attachUi(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    const btn = d.getElementById('look-mode-btn');
    const rate = d.getElementById('look-rate-slider');
    const rateOut = d.getElementById('look-rate-readout');
    const cam = d.getElementById('look-head-mode');
    const camNote = d.getElementById('look-webcam-note');
    const centreBtn = d.getElementById('look-webcam-centre');
    const toast = d.getElementById('look-toast');
    this._ui = { btn, rate, rateOut, cam, camNote, centreBtn, toast };

    if (btn) btn.addEventListener('click', () => this.toggle());
    if (rate) {
      rate.min = String(LOOK_EDGE_RATE_MIN_DEG_S);
      rate.max = String(LOOK_EDGE_RATE_MAX_DEG_S);
      rate.addEventListener('input', () => {
        this.setEdgeRate(Number(rate.value));
        this.controller.persistLookSettings();
      });
    }
    if (cam) {
      cam.addEventListener('change', async () => {
        const want = cam.value;
        if (want === HEAD_PRECISE && camNote) {
          camNote.textContent = `Downloading the face model once (${(MP_WIRE_BYTES / 1048576).toFixed(1)} MB, about 2 seconds on a good connection)...`;
        }
        this._syncUi();
        const ok = await this.webcam.setMode(want);
        if (!ok) {
          cam.value = this.webcam.mode;
          if (camNote) camNote.textContent = this.webcam.error || 'Head tracking could not start.';
        } else if (camNote) {
          camNote.textContent = want === HEAD_OFF ? ''
            : (want === HEAD_PRECISE
              ? 'Tracking the way your head POINTS. Sit how you mean to sit, then press Centre.'
              : 'Tracking where your head IS -- lean, do not swivel. Sit how you mean to sit, then press Centre.');
        }
        this.controller.persistLookSettings();
        this._syncUi();
      });
    }
    if (centreBtn) centreBtn.addEventListener('click', () => {
      this.centreHead();
      if (camNote) camNote.textContent = this.webcam.seen
        ? 'Centred. This posture is now looking straight ahead.'
        : 'No head found yet -- check the camera is not covered.';
    });
    this._syncUi();
  }

  _syncUi() {
    const u = this._ui;
    if (!u) return;
    if (u.btn) {
      u.btn.setAttribute('aria-pressed', String(this.enabled));
      u.btn.textContent = this.enabled
        ? 'Look Around: ON (H)'
        : 'Look Around (H)';
    }
    if (u.rate) u.rate.value = String(Math.round(this.edgeRateDegS));
    if (u.rateOut) u.rateOut.textContent = `${Math.round(this.edgeRateDegS)}°/s`;
    if (u.cam) {
      u.cam.value = this.webcam.mode;
      if (u.cam.dataset) u.cam.dataset.head = this.webcam.mode;
      u.cam.disabled = this.webcam.loading;
    }
    if (u.centreBtn) u.centreBtn.disabled = !this.webcam.isActive();
    this.decorateStatus();
  }

  static STATUS_MARK = ' — LOOK AROUND';
  decorateStatus() {
    if (typeof document === 'undefined') return;
    const s = document.getElementById('camera-status');
    if (!s) return;
    const i = s.textContent.indexOf(StationaryLookInput.STATUS_MARK);
    const base = i >= 0 ? s.textContent.slice(0, i) : s.textContent;
    const who = this.webcam.isActive()
      ? (this._source === SOURCE_HEAD
        ? ' Your head is driving'
        : ' The mouse is driving (move your head to take it back)')
      : ' The mouse is your gaze;';
    s.textContent = this.enabled
      ? base + StationaryLookInput.STATUS_MARK
        + ': the camera stays where it is and turns its head.' + who
        + ' push to an edge to keep turning. H toggles.'
      : base;
  }

  _toast(text) {
    const el = this._ui && this._ui.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 2500);
  }

  diagnostics() {
    return {
      enabled: this.enabled,
      yawDeg: this._yaw / DEG,
      pitchDeg: this._pitch / DEG,
      neutralYawDeg: this._neutralYaw / DEG,
      neutralPitchDeg: this._neutralPitch / DEG,
      pitchLimitDeg: [LOOK_PITCH_MIN_DEG, LOOK_PITCH_MAX_DEG],
      yawLimit: 'none -- full 360',
      lookDistanceR: this._R,
      anchor: { ...this._anchor },
      cursor: this._cursor ? { ...this._cursor } : null,
      edgeRateDegS: this.edgeRateDegS,
      edgeHeldMs: this._edgeHeldMs,
      spanDeg: { yaw: LOOK_YAW_SPAN_DEG, pitch: LOOK_PITCH_SPAN_DEG },
      source: this._source,
      offsetDeg: (() => {
        const m = this._offsetOf(this._source);
        return { yaw: m.yaw / DEG, pitch: m.pitch / DEG };
      })(),
      headOffsetDeg: { yaw: this._headOffset.yaw / DEG, pitch: this._headOffset.pitch / DEG },
      mouseOffsetDeg: (() => {
        const m = this._offsetOf(SOURCE_MOUSE);
        return { yaw: m.yaw / DEG, pitch: m.pitch / DEG };
      })(),
      webcam: this.webcam.diagnostics(),
    };
  }
}

export const LOOK_LIMITS = {
  pitchMinDeg: LOOK_PITCH_MIN_DEG,
  pitchMaxDeg: LOOK_PITCH_MAX_DEG,
  yawSpanDeg: LOOK_YAW_SPAN_DEG,
  pitchSpanDeg: LOOK_PITCH_SPAN_DEG,
  edgeBand: LOOK_EDGE_BAND,
  edgeRateDefaultDegS: LOOK_EDGE_RATE_DEFAULT_DEG_S,
  edgeRateMinDegS: LOOK_EDGE_RATE_MIN_DEG_S,
  edgeRateMaxDegS: LOOK_EDGE_RATE_MAX_DEG_S,
  edgeRampMs: LOOK_EDGE_RAMP_MS,
  sourceHoldMs: SOURCE_HOLD_MS,
  sourceStrongHeadDeg: SOURCE_STRONG_HEAD_DEG,
  sourceStrongMouseN: SOURCE_STRONG_MOUSE_N,
  noseProudRatio: NOSE_PROUD_RATIO,
  noseLowRatio: NOSE_LOW_RATIO,
  noseRestDeg: NOSE_REST_DEG,
  precisePitchMinDeg: PRECISE_PITCH_MIN_DEG,
  preciseSampleMs: PRECISE_SAMPLE_MS,
  preciseSmooth: PRECISE_SMOOTH,
  leanSampleMs: WEBCAM_SAMPLE_MS,
  leanSmooth: WEBCAM_SMOOTH,
  leanLeakS: WEBCAM_LEAN_LEAK_S,
};
