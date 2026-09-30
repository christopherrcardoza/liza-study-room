import * as THREE from 'three';
import { solveVFovDegrees } from './contain.js';
import { StationaryLookInput } from './camera_input.js';

const STORAGE_KEY = 'courtsim_camera_state';

const FOLLOW_STATE_VERSION = 2;

const SIX_SEAT_GUARANTEE = { D: 8.5151, Rx: 5.3291, Ry: 1.8950 };         // the OLD gallery 'reporter' camera; now the fallback only

const REPORTER_SEAT_GUARANTEE = { D: 3.8754, Rx: 3.7000, Ry: 1.1500 };

const BENCH_GUARANTEE    = { Rx: 1.2500, Ry: 0.8000 };  // judge + bench front
const WITNESS_GUARANTEE  = { Rx: 1.0500, Ry: 0.7000 };  // witness + box rail
const COUNSEL_GUARANTEE  = { Rx: 1.4500, Ry: 0.9000 };  // counsel + table
const SPEAKER_GUARANTEE  = { Rx: 0.7000, Ry: 0.4500 };  // whoever is talking, tight
const ROOM_GUARANTEE     = { D: 9.4810, Rx: 7.6000, Ry: 4.4000 };

const PROTECTION_FACTOR_DEFAULT = 1.05;  // research's own "Netflix's own 3-10%" band, §7.2 -- 5% chosen as the mid-band default
const PROTECTION_FACTOR_MIN = 1.03;
const PROTECTION_FACTOR_MAX = 1.10;
const CAMERA_DISTANCE_DEFAULT = 1.0;     // multiplies the close/speaker presets' own pos-target distance -- "the faces and how close it should be" (founder's own ruling)
const CAMERA_DISTANCE_MIN = 0.6;
const CAMERA_DISTANCE_MAX = 1.8;

const CLOSE_PRESET_NAMES = new Set(['bench', 'witness', 'counselA', 'counselB']);

export const CAMERA_PRESETS = {
  reporter: {
    label: 'Reporter (your seat)',
    pos: [0, 2.3, 7.5], target: [0, 1.4, -2.6], guarantee: SIX_SEAT_GUARANTEE,
  },
  bench: {
    label: 'The Bench',
    anchor: { seat: 'THE COURT', targetDy: 1.01, targetFwd: 0.00, posDy: 0.20, posFwd: 2.50 },
    pos: [0, 1.7, -1.0], target: [0, 1.5, -3.5], guarantee: BENCH_GUARANTEE,
  },
  witness: {
    label: 'Witness Stand',
    anchor: { seat: 'THE WITNESS', targetDy: 1.02, targetFwd: 0.15, posDy: 0.40, posFwd: 2.40 },
    pos: [1.6, 1.7, 0.8], target: [1.6, 1.3, -1.6], guarantee: WITNESS_GUARANTEE,
  },
  counselA: {
    label: 'Counsel Table (Q)',
    anchor: { seat: 'Counsel (Q)', targetDy: 1.00, targetFwd: 0.00, posDy: 0.60, posFwd: 2.30 },
    pos: [-3.3, 1.6, -0.8], target: [-3.3, 1.0, 1.5], guarantee: COUNSEL_GUARANTEE,
  },
  counselB: {
    label: 'Counsel Table (Named)',
    anchor: { seat: 'Counsel (named)', targetDy: 1.00, targetFwd: 0.00, posDy: 0.60, posFwd: 2.30 },
    pos: [3.3, 1.6, -0.8], target: [3.3, 1.0, 1.5], guarantee: COUNSEL_GUARANTEE,
  },
  wide: {
    label: 'Wide Establishing Shot',
    pos: [0, 4.8, 7.0], target: [0, 0.6, -1.5], guarantee: ROOM_GUARANTEE,
  },
  speaker: { label: 'Current Speaker (close)' },
};

const PRESET_ORDER = ['reporter', 'bench', 'witness', 'counselA', 'counselB', 'wide', 'speaker'];

const GLIDE_MS = 520;
const GLIDE_MIN_DISTANCE_M = 0.25;

const BOUNDS = { xMin: -7.5, xMax: 7.5, zMin: -5.5, zMax: 7.2, yMin: 1.1, yMax: 5.0 };

const MIN_SOLVE_DISTANCE = 0.6;
const MAX_VFOV_DEG = 150;
const MIN_VFOV_DEG = 1;

const NAV_VFOV_CEILING_DEG = 55;
const NAV_MAX_DIAGONAL_FOV_DEG = 100;

function vfovForDiagonalCapDeg(aspect, diagCapDeg) {
  const halfDiag = THREE.MathUtils.degToRad(diagCapDeg) / 2;
  const tanHalfV = Math.tan(halfDiag) / Math.sqrt(1 + aspect * aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfV));
}

const ZOOM_STEP_FRACTION = 0.22; // satellite-map-style: each click/press covers a fraction of the remaining distance to the target point, not a fixed unit -- feels right whether you're far out or already close in.
const MIN_ZOOM_DISTANCE = 0.6;

const ORBIT_MIN_PITCH_DEG = -25; // camera BELOW the subject, looking UP -- neck extension, the tighter of the two directions
const ORBIT_MAX_PITCH_DEG = 35;  // camera ABOVE the subject, looking DOWN -- neck flexion
const ORBIT_SENSITIVITY = 0.006; // radians of azimuth/pitch per drag-pixel -- tuned so a single drag across most of the canvas covers a bit over half a full revolution, reaching "behind" without needing several repeated drags.
const ORBIT_MIN_RADIUS = 1.0;
const ORBIT_MAX_RADIUS = 9.0; // stays within BOUNDS' own extent (see BOUNDS above) from any room-center-ish target

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.preset === 'string') return parsed;
  } catch (e) { /* corrupt/old value -- fall through to default */ }
  return null;
}

export class CameraController {
  constructor(scene, canvas) {
    this.scene = scene;
    this.camera = scene.camera;
    this.canvas = canvas;
    this.currentPreset = 'reporter';
    this._customPos = null;   // set once free-drag or zoom moves off a preset's exact values
    this._customTarget = null;
    this._followSeatKey = null;
    this._zoomMode = null;    // null | 'in' | 'out'
    this._raycaster = new THREE.Raycaster();
    this._dragState = null;
    this._orbitMode = false;
    this._orbitDragState = null;
    this._onChange = null;    // UI callback: (presetName, zoomMode) => void
    this._autoFollow = true;
    this._glide = null;
    this._glideEnabled = true;

    this._aspect = 16 / 9;
    this._protectionFactor = PROTECTION_FACTOR_DEFAULT;
    this._cameraDistanceScale = CAMERA_DISTANCE_DEFAULT;
    this._loadControls();

    this._bindPointerEvents();
    this._bindViewKeys();

    this._look = new StationaryLookInput(this, this.canvas);
    this._loadLookSettings();
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._look.attachUi(document), { once: true });
      } else {
        this._look.attachUi(document);
      }
    }

    const persisted = loadPersisted();
    if (persisted && CAMERA_PRESETS[persisted.preset] && persisted.preset !== 'speaker') {
      this.setPreset(persisted.preset, { persist: false });
      if (persisted.pos && persisted.target) {
        this._customPos = persisted.pos;
        this._customTarget = persisted.target;
        this._applyPosTarget(persisted.pos, persisted.target);
        this._rederiveActiveD(persisted.pos, persisted.target, { resolveFov: true });
      }
    } else {
      this.setPreset('reporter', { persist: false });
    }
  }

  onChange(fn) { this._onChange = fn; }

  _notify() {
    if (this._onChange) this._onChange(this.currentPreset, this._zoomMode);
    if (this._look) this._look.decorateStatus();
  }

  _persist() {
    const pos = [this.camera.position.x, this.camera.position.y, this.camera.position.z];
    const target = this._currentTargetArray();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.preset = this.currentPreset;
      parsed.pos = pos;
      parsed.target = target;
      parsed.protectionFactor = this._protectionFactor;
      parsed.cameraDistanceScale = this._cameraDistanceScale;
      parsed.autoFollow = this._autoFollow;
      parsed.autoFollowV = FOLLOW_STATE_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage full/unavailable -- state just won't persist, not fatal */ }
  }

  _currentTargetArray() {
    if (this._customTarget) return this._customTarget;
    if (this._lastTarget) return this._lastTarget;
    const preset = CAMERA_PRESETS[this.currentPreset];
    return preset && preset.target ? preset.target : [0, 1.4, -2.6];
  }

  _applyPosTarget(pos, target, guarantee = null) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(target[0], target[1], target[2]);
    this._lastTarget = [target[0], target[1], target[2]];
    if (guarantee) {
      this._activeGuarantee = guarantee;
      this._activeD = guarantee.D != null ? guarantee.D : this._distance(pos, target);
      this._solveAndApplyFov();
    }
  }

  _distance(pos, target) {
    return Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
  }

  _solveAndApplyFov() {
    if (!this._activeGuarantee || this._activeD == null) return;
    const Rx = this._activeGuarantee.Rx * this._protectionFactor;
    const Ry = this._activeGuarantee.Ry * this._protectionFactor;
    const D = Math.max(this._activeD, MIN_SOLVE_DISTANCE);
    let vfov = solveVFovDegrees(Rx, Ry, D, this._aspect);
    if (!Number.isFinite(vfov)) {
      console.error('[courtsim] FOV_NOT_FINITE Rx=', Rx, 'Ry=', Ry, 'D=', D,
        'aspect=', this._aspect, '-- keeping the previous fov', this.camera.fov);
      return;
    }
    const clamped = THREE.MathUtils.clamp(vfov, MIN_VFOV_DEG, MAX_VFOV_DEG);
    if (clamped !== vfov) {
      console.warn('[courtsim] fov_CLAMPED solved=', vfov.toFixed(2),
        'applied=', clamped.toFixed(2), 'D=', D.toFixed(4),
        'Rx=', Rx.toFixed(3), 'Ry=', Ry.toFixed(3), 'aspect=', this._aspect.toFixed(3),
        '-- the guarantee box cannot be fully contained at this distance;',
        'CONTAIN is being overridden to keep the frame renderable.');
      vfov = clamped;
    }
    const diagCeiling = vfovForDiagonalCapDeg(this._aspect, NAV_MAX_DIAGONAL_FOV_DEG);
    const ceiling = Math.min(NAV_VFOV_CEILING_DEG, diagCeiling);
    if (vfov > ceiling) {
      const halfHeldDeg = THREE.MathUtils.radToDeg(
        Math.atan(Math.tan(THREE.MathUtils.degToRad(ceiling) / 2) * this._aspect));
      const halfWidthHeld = D * Math.tan(THREE.MathUtils.degToRad(halfHeldDeg));
      if (this._lastShortfallKey !== `${vfov.toFixed(2)}|${this._aspect.toFixed(4)}`) {
        this._lastShortfallKey = `${vfov.toFixed(2)}|${this._aspect.toFixed(4)}`;
        console.warn('[courtsim] guarantee_SHORTFALL preset=', this.currentPreset,
          'CONTAIN wanted vfov=', vfov.toFixed(2),
          'ceiling applied=', ceiling.toFixed(2), 'deg',
          '| holds +-', halfHeldDeg.toFixed(2), 'deg =', halfWidthHeld.toFixed(3), 'm',
          'at D=', D.toFixed(4), '; guarantee asked for Rx=', Rx.toFixed(3), 'm',
          '-> short by', (Rx - halfWidthHeld).toFixed(3), 'm of half-width.',
          'COURTSIM-CAMERA-003: the lens is being held at a human interior',
          'field on purpose. Raise NAV_VFOV_CEILING_DEG to restore CONTAIN.');
      }
      vfov = ceiling;
    }
    this.camera.fov = vfov;
    this.camera.updateProjectionMatrix();
  }

  _rederiveActiveD(pos, target, { resolveFov }) {
    if (!this._activeGuarantee) return;
    this._activeD = this._distance(pos, target);
    if (resolveFov) this._solveAndApplyFov();
  }

  setAspect(aspect) {
    this._aspect = aspect;
    this._solveAndApplyFov();
  }

  _applyScaledClose(guarantee, opts = {}) {
    const scale = this._cameraDistanceScale;
    const base = this._baseTarget;
    const offset = [
      this._basePos[0] - base[0],
      this._basePos[1] - base[1],
      this._basePos[2] - base[2],
    ];
    const pos = [
      base[0] + offset[0] * scale,
      base[1] + offset[1] * scale,
      base[2] + offset[2] * scale,
    ];
    if (opts.glide) this._glideTo(pos, base.slice(), guarantee);
    else { this._glide = null; this._applyPosTarget(pos, base, guarantee); }
  }

  setCameraDistanceScale(value) {
    this._cameraDistanceScale = THREE.MathUtils.clamp(value, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    if (this._basePos && this._baseTarget) {
      this._applyScaledClose(this._activeGuarantee || SPEAKER_GUARANTEE);
    }
    this._persistControls();
    this._notify();
  }

  setProtectionFactor(value) {
    this._protectionFactor = THREE.MathUtils.clamp(value, PROTECTION_FACTOR_MIN, PROTECTION_FACTOR_MAX);
    this._solveAndApplyFov();
    this._persistControls();
    this._notify();
  }

  getControlState() {
    return {
      protectionFactor: this._protectionFactor,
      protectionMin: PROTECTION_FACTOR_MIN, protectionMax: PROTECTION_FACTOR_MAX,
      cameraDistanceScale: this._cameraDistanceScale,
      cameraDistanceMin: CAMERA_DISTANCE_MIN, cameraDistanceMax: CAMERA_DISTANCE_MAX,
    };
  }

  _loadControls() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.protectionFactor === 'number') {
        this._protectionFactor = THREE.MathUtils.clamp(parsed.protectionFactor, PROTECTION_FACTOR_MIN, PROTECTION_FACTOR_MAX);
      }
      if (typeof parsed.cameraDistanceScale === 'number') {
        this._cameraDistanceScale = THREE.MathUtils.clamp(parsed.cameraDistanceScale, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
      }
      const storedVersion = Number.isFinite(parsed.autoFollowV) ? parsed.autoFollowV : 0;
      if (parsed.autoFollow === false && storedVersion >= FOLLOW_STATE_VERSION) {
        this._autoFollow = false;
      } else if (parsed.autoFollow === false) {
        this._autoFollow = true;
        this._migrateFollowState(parsed, storedVersion);
      }
    } catch (e) { /* corrupt/old value -- fall through to defaults */ }
  }

  _migrateFollowState(parsed, storedVersion) {
    try {
      parsed.autoFollow = true;
      parsed.autoFollowV = FOLLOW_STATE_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage unavailable -- the in-memory default still stands */ }
    const note = {
      migrated: true, from: false, to: true,
      storedVersion, newVersion: FOLLOW_STATE_VERSION,
      key: STORAGE_KEY,
      origin: (typeof location !== 'undefined' && location.origin) || null,
      why: 'stored autoFollow:false carried no version stamp, so it predates Follow Speaker '
        + 'being the default. Migrated once. Click any preset other than Follow Speaker to '
        + 'turn it off again and it will stay off.',
    };
    try { window.__courtsimFollowMigration = note; } catch (e) { /* no window */ }
    console.warn('[courtsim/camera] FOLLOW SPEAKER TURNED ON BY MIGRATION. Your stored '
      + `${STORAGE_KEY} had autoFollow:false with no version stamp, which means it was saved `
      + 'before the camera followed the speaker by default. It has been migrated to ON, once. '
      + 'From now on your own choice is versioned and will be kept: pick any view other than '
      + 'Follow Speaker and it stays picked. Details: window.__courtsimFollowMigration');
  }

  _persistControls() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.protectionFactor = this._protectionFactor;
      parsed.cameraDistanceScale = this._cameraDistanceScale;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage full/unavailable -- not fatal */ }
  }

  _resolvePreset(name) {
    const def = CAMERA_PRESETS[name];
    if (!def) return null;
    if (name === 'wide') {
      const wf = (this.scene && this.scene.getWideShotFraming)
        ? this.scene.getWideShotFraming() : null;
      if (wf) return { pos: wf.pos, target: wf.target, from: 'venue:' + wf.venue };
    }
    const a = def.anchor;
    const anchor = (a && this.scene && this.scene.getSeatAnchor)
      ? this.scene.getSeatAnchor(a.seat) : null;
    if (!a || !anchor) {
      return { pos: def.pos, target: def.target, from: anchor ? 'literal' : 'literal(no-anchor)' };
    }
    const f = anchor.fwd;
    const target = [
      anchor.pos[0] + f[0] * a.targetFwd,
      anchor.pos[1] + a.targetDy,
      anchor.pos[2] + f[2] * a.targetFwd,
    ];
    const pos = [
      target[0] + f[0] * a.posFwd,
      target[1] + a.posDy,
      target[2] + f[2] * a.posFwd,
    ];
    return { pos, target, from: 'anchor:' + a.seat };
  }

  getPresetFramingReport() {
    const was = this.currentPreset;
    const rows = [];
    for (const name of PRESET_ORDER) {
      const def = CAMERA_PRESETS[name];
      const r = { preset: name };
      const lit = def.pos ? { pos: def.pos, target: def.target } : null;
      const res = this._resolvePreset(name);
      r.literal = lit ? { pos: lit.pos.slice(), target: lit.target.slice() } : null;
      r.resolved = (res && res.pos && res.target)
        ? { pos: res.pos.slice(), target: res.target.slice(), from: res.from }
        : (res ? { pos: null, target: null, from: res.from + ' (computed at runtime)' } : null);
      r.moved = (lit && res && res.pos)
        ? +Math.hypot(res.pos[0] - lit.pos[0], res.pos[1] - lit.pos[1], res.pos[2] - lit.pos[2]).toFixed(4)
        : null;
      this.setPreset(name, { persist: false, user: false });
      r.vfov = +this.camera.fov.toFixed(3);
      r.D = this._activeD != null ? +this._activeD.toFixed(4) : null;
      rows.push(r);
    }
    this.setPreset(was, { persist: false, user: false });
    return rows;
  }

  setPreset(name, opts = {}) {
    const def = CAMERA_PRESETS[name];
    if (!def) return;
    if (opts.user) this.setAutoFollow(name === 'speaker', { persist: true, silent: true });
    if (name !== 'speaker') this._followSeatKey = null;
    this.currentPreset = name;
    this._customPos = null;
    this._customTarget = null;
    if (name === 'speaker') {
      this._followActiveOrReporter();
    } else if (name === 'reporter') {
      this._applyReporterSeat();
    } else if (name === 'wide') {
      const wf = (this.scene && this.scene.getWideShotFraming)
        ? this.scene.getWideShotFraming() : null;
      this._basePos = null;
      this._baseTarget = null;
      if (wf) this._applyPosTarget(wf.pos, wf.target, wf.guarantee);
      else this._applyPosTarget(def.pos, def.target, def.guarantee);
    } else if (CLOSE_PRESET_NAMES.has(name)) {
      const r = this._resolvePreset(name);
      this._basePos = r.pos;
      this._baseTarget = r.target;
      this._applyScaledClose(def.guarantee);
    } else {
      this._basePos = null;
      this._baseTarget = null;
      this._applyPosTarget(def.pos, def.target, def.guarantee);
    }
    if (opts.persist !== false) this._persist();
    if (this._look && this._look.isEnabled()) this._look.reanchor();
    this._notify();
  }

  cyclePreset(direction = 1) {
    const i = PRESET_ORDER.indexOf(this.currentPreset);
    const next = PRESET_ORDER[(i + direction + PRESET_ORDER.length) % PRESET_ORDER.length];
    this.setPreset(next);
  }

  reset() {
    this.setPreset('reporter');
  }

  setAutoFollow(on, opts = {}) {
    this._autoFollow = !!on;
    if (opts.persist !== false) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.autoFollow = this._autoFollow;
        parsed.autoFollowV = FOLLOW_STATE_VERSION;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (e) { /* storage full/unavailable -- not fatal */ }
    }
    if (!opts.silent) this._notify();
    return this._autoFollow;
  }

  isAutoFollow() { return this._autoFollow !== false; }

  followSeat(seatKey) {
    const changed = this._followSeatKey !== seatKey;
    this._followSeatKey = seatKey;
    if (this.isAutoFollow() && this.currentPreset !== 'speaker') {
      this.setPreset('speaker', { persist: false, user: false });
      return;
    }
    if (this.currentPreset === 'speaker') this._followActiveOrReporter({ glide: !changed ? false : true });
  }

  _followActiveOrReporter(opts = {}) {
    const seatKey = this._followSeatKey;
    const framing = seatKey ? this.scene.getSeatCloseFraming(seatKey) : null;
    if (framing) {
      this._basePos = framing.pos;
      this._baseTarget = framing.target;
      this._applyScaledClose(SPEAKER_GUARANTEE, { glide: opts.glide !== false });
    } else {
      this._applyReporterSeat();
    }
  }

  _glideTo(pos, target, guarantee, ms = GLIDE_MS) {
    if (guarantee) {
      this._activeGuarantee = guarantee;
      this._activeD = guarantee.D != null ? guarantee.D : this._distance(pos, target);
      this._solveAndApplyFov();
    }
    const fromPos = this.camera.position.toArray();
    const fromTarget = (this._lastTarget || target).slice();
    const dist = this._distance(fromPos, pos);
    if (!this._glideEnabled || dist < GLIDE_MIN_DISTANCE_M) {
      this._applyPosTarget(pos, target, guarantee);
      this._glide = null;
      return;
    }
    this._glide = { fromPos, fromTarget, toPos: pos.slice(), toTarget: target.slice(), t: 0, ms };
    this._lastTarget = fromTarget.slice();
  }

  updateGlide(dt) {
    if (this._look && this._look.isEnabled()) this._look.tick(dt);
    const g = this._glide;
    if (!g) return;
    g.t += (dt || 0) * 1000;
    const u = Math.min(1, g.t / g.ms);
    const e = u * u * (3 - 2 * u);
    const lerp = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
    const p = lerp(g.fromPos, g.toPos);
    const t = lerp(g.fromTarget, g.toTarget);
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.lookAt(t[0], t[1], t[2]);
    this._lastTarget = t;
    if (u >= 1) {
      this._glide = null;
      this._lastTarget = g.toTarget.slice();
      if (this._look && this._look.isEnabled()) this._look.reanchor();
    }
  }

  _applyReporterSeat() {
    this._basePos = null;
    this._baseTarget = null;
    const seat = this.scene.getReporterSeatFraming?.();
    if (seat) {
      this._applyPosTarget(seat.pos, seat.target, REPORTER_SEAT_GUARANTEE);
      return;
    }
    const rep = CAMERA_PRESETS.reporter;
    this._applyPosTarget(rep.pos, rep.target, rep.guarantee);
  }


  setZoomMode(mode) {
    if (mode && this._look) this._look.disable({ announce: false });
    this._zoomMode = mode;
    this.canvas.style.cursor = mode === 'in' ? 'zoom-in' : mode === 'out' ? 'zoom-out' : '';
    this._notify();
  }

  setOrbitMode(on) {
    if (on && this._look) this._look.disable({ announce: false });  // COURTSIM-LOOK-049 -- see setZoomMode
    this._orbitMode = !!on;
    this.canvas.style.cursor = this._orbitMode ? 'grab' : '';
    this._notify();
  }


  getStationaryLookBasis() {
    const t = this._currentTargetArray();
    const p = this.camera.position;
    const dx = t[0] - p.x, dy = t[1] - p.y, dz = t[2] - p.z;
    const R = Math.hypot(dx, dy, dz);
    if (!(R > 1e-4) || !Number.isFinite(R)) return null;
    return {
      pos: { x: p.x, y: p.y, z: p.z },
      R,
      yaw: Math.atan2(dx, dz),
      pitch: Math.asin(THREE.MathUtils.clamp(dy / R, -1, 1)),
    };
  }

  applyStationaryLook(pos, target) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(target[0], target[1], target[2]);
    this._lastTarget = [target[0], target[1], target[2]];
    this._customPos = [pos[0], pos[1], pos[2]];
    this._customTarget = this._lastTarget.slice();
    this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
  }

  toggleStationaryLook() {
    if (!this._look) return false;
    this._look.toggle();
    if (this._look.isEnabled()) { this._zoomMode = null; this._orbitMode = false; }
    this._persistLook();
    this._notify();
    return this._look.isEnabled();
  }

  isStationaryLook() { return !!(this._look && this._look.isEnabled()); }

  centreStationaryHead() {
    if (!this._look) return false;
    return this._look.centreHead();
  }

  getStationaryLookState() { return this._look ? this._look.diagnostics() : null; }

  persistLookSettings() { this._persistLook(); }

  persistLookPose() { this._persist(); }

  _persistLook() {
    if (!this._look) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.lookMode = this._look.isEnabled();
      parsed.lookEdgeRate = this._look.edgeRateDegS;
      parsed.lookHeadMode = this._look.webcam.mode;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage full/unavailable -- not fatal */ }
  }

  _loadLookSettings() {
    if (!this._look) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (typeof parsed.lookEdgeRate === 'number') this._look.setEdgeRate(parsed.lookEdgeRate);
    } catch (e) { /* default rate */ }
  }


  _sphericalFromPosition(pos, target) {
    const rel = new THREE.Vector3(pos.x - target.x, pos.y - target.y, pos.z - target.z);
    const radius = Math.max(rel.length(), 1e-4);
    const pitch = Math.asin(THREE.MathUtils.clamp(rel.y / radius, -1, 1));
    const azimuth = Math.atan2(rel.x, rel.z);
    return { radius, pitch, azimuth };
  }

  _positionFromSpherical(target, radius, pitch, azimuth) {
    const cp = Math.cos(pitch);
    return new THREE.Vector3(
      target.x + radius * cp * Math.sin(azimuth),
      target.y + radius * Math.sin(pitch),
      target.z + radius * cp * Math.cos(azimuth),
    );
  }

  getOrbitDebugState() {
    const target = new THREE.Vector3(...this._currentTargetArray());
    const sph = this._sphericalFromPosition(this.camera.position, target);
    return {
      radius: sph.radius,
      pitchDeg: THREE.MathUtils.radToDeg(sph.pitch),
      azimuthDeg: THREE.MathUtils.radToDeg(sph.azimuth),
      pos: this.camera.position.toArray(),
      target: target.toArray(),
    };
  }

  handleZoomClick(clientX, clientY) {
    if (!this._zoomMode) return false;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const rcT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const hits = this._raycaster.intersectObjects(this.scene.scene.children, true);
    if (typeof performance !== 'undefined') {
      const ms = performance.now() - rcT0;
      const line = ['[courtsim] zoom_raycast_ms=', ms.toFixed(2), 'hits=', hits.length];
      if (ms > 16) console.warn(...line, '-- over one frame at 60 Hz; this click visibly hitched.');
      else console.log(...line);
    }
    let point;
    if (hits.length > 0) {
      point = hits[0].point;
    } else {
      const dir = this._raycaster.ray.direction;
      point = this.camera.position.clone().addScaledVector(dir, 8);
    }
    this._dollyToward(point, this._zoomMode === 'in' ? 1 : -1);
    return true;
  }

  zoomStep(direction) {
    const target = this._currentTargetArray();
    this._dollyToward(new THREE.Vector3(target[0], target[1], target[2]), direction);
  }

  _dollyToward(point, direction) {
    const camPos = this.camera.position;
    const toPoint = new THREE.Vector3(point.x, point.y, point.z).sub(camPos);
    const dist = toPoint.length();
    if (dist < 1e-4) return;
    const step = dist * ZOOM_STEP_FRACTION * direction;
    const newDist = Math.max(MIN_ZOOM_DISTANCE, dist - step);
    const newPos = camPos.clone().addScaledVector(toPoint.normalize(), dist - newDist);
    const clamped = this._clampToBounds(newPos);
    this.camera.position.copy(clamped);
    this.camera.lookAt(point.x, point.y, point.z);
    this._customPos = [clamped.x, clamped.y, clamped.z];
    this._customTarget = [point.x, point.y, point.z];
    this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
    this._persist();
  }

  _clampToBounds(pos) {
    const p = new THREE.Vector3(
      THREE.MathUtils.clamp(pos.x, BOUNDS.xMin, BOUNDS.xMax),
      THREE.MathUtils.clamp(pos.y, BOUNDS.yMin, BOUNDS.yMax),
      THREE.MathUtils.clamp(pos.z, BOUNDS.zMin, BOUNDS.zMax),
    );
    const MAX_ROUNDS = 8;
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const bx = p.x, by = p.y, bz = p.z;
      this._pushOutOfPeople(p);
      this._pushOutOfFurniture(p);
      p.x = THREE.MathUtils.clamp(p.x, BOUNDS.xMin, BOUNDS.xMax);
      p.y = THREE.MathUtils.clamp(p.y, BOUNDS.yMin, BOUNDS.yMax);
      p.z = THREE.MathUtils.clamp(p.z, BOUNDS.zMin, BOUNDS.zMax);
      if (Math.abs(p.x - bx) < 1e-4 && Math.abs(p.y - by) < 1e-4 && Math.abs(p.z - bz) < 1e-4) {
        return p;
      }
    }
    if (!this._keepOutOscillationLogged) {
      this._keepOutOscillationLogged = true;
      console.warn('[courtsim] keepout_NO_FIXED_POINT after', MAX_ROUNDS,
        'rounds at', p.toArray().map((n) => n.toFixed(3)).join(','),
        '-- two keep-out volumes overlap here and are pushing the camera',
        'back and forth. COURTSIM-FIX-V DEFECT V-12. Logged once per session.');
    }
    return p;
  }

  _pushOutOfPeople(p) {
    const bodies = this.scene.getBodyKeepOuts?.();
    if (!bodies || bodies.length === 0) return p;
    for (const b of bodies) {
      if (p.y < b.yMin || p.y > b.yMax) continue;       // above or below them
      const dx = p.x - b.x, dz = p.z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= b.r * b.r) continue;                    // already clear
      const d = Math.sqrt(d2);
      if (d < 1e-4) {
        p.set(b.x, p.y, b.z + b.r);
      } else {
        const k = b.r / d;
        p.set(b.x + dx * k, p.y, b.z + dz * k);
      }
    }
    return p;
  }

  _pushOutOfFurniture(p) {
    const boxes = this.scene.getFurnitureKeepOuts?.();
    if (!boxes || boxes.length === 0) return p;
    for (const b of boxes) {
      if (p.x <= b.minX || p.x >= b.maxX) continue;
      if (p.y <= b.minY || p.y >= b.maxY) continue;
      if (p.z <= b.minZ || p.z >= b.maxZ) continue;
      const dxMin = p.x - b.minX, dxMax = b.maxX - p.x;
      const dyMin = p.y - b.minY, dyMax = b.maxY - p.y;
      const dzMin = p.z - b.minZ, dzMax = b.maxZ - p.z;
      const INF = Number.POSITIVE_INFINITY;
      const dyMinLegal = b.minY >= BOUNDS.yMin ? dyMin : INF;
      const dyMaxLegal = b.maxY <= BOUNDS.yMax ? dyMax : INF;
      const m = Math.min(dxMin, dxMax, dyMinLegal, dyMaxLegal, dzMin, dzMax);
      if (!Number.isFinite(m)) continue;   // boxed in on every legal face: leave it
      if (m === dxMin)      p.x = b.minX;
      else if (m === dxMax) p.x = b.maxX;
      else if (m === dzMin) p.z = b.minZ;
      else if (m === dzMax) p.z = b.maxZ;
      else if (m === dyMaxLegal) p.y = b.maxY;
      else                  p.y = b.minY;
    }
    return p;
  }


  _bindViewKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable ||
                /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(t.tagName))) return;
      const screenEl = document.getElementById('courtroom-screen');
      if (!screenEl || screenEl.classList.contains('hidden')) return;
      if (e.key === 'f' || e.key === 'F') {
        const btn = document.getElementById('fullscreen-btn');
        if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
      }
      if ((e.key === 'h' || e.key === 'H') && e.shiftKey) {
        e.preventDefault();
        this.centreStationaryHead();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.toggleStationaryLook();
      }
    });
  }

  _bindPointerEvents() {
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
      if (this._zoomMode) return; // zoom-click takes priority over drag-start
      if (this._look && this._look.isEnabled()) return;
      if (this._orbitMode) {
        const target = new THREE.Vector3(...this._currentTargetArray());
        const sph = this._sphericalFromPosition(this.camera.position, target);
        this._orbitDragState = {
          startX: e.clientX, startY: e.clientY,
          startRadius: sph.radius, startPitch: sph.pitch, startAzimuth: sph.azimuth,
          target,
        };
      } else {
        this._dragState = {
          startX: e.clientX, startY: e.clientY,
          startPos: this.camera.position.clone(),
          startTarget: new THREE.Vector3(...this._currentTargetArray()),
        };
      }
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this._orbitDragState) {
        const st = this._orbitDragState;
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        const azimuth = st.startAzimuth - dx * ORBIT_SENSITIVITY;
        const asinClamped = (v) => Math.asin(THREE.MathUtils.clamp(v, -1, 1));
        const geoMinDeg = THREE.MathUtils.radToDeg(
          asinClamped((BOUNDS.yMin - st.target.y) / Math.max(st.startRadius, 1e-4)));
        const geoMaxDeg = THREE.MathUtils.radToDeg(
          asinClamped((BOUNDS.yMax - st.target.y) / Math.max(st.startRadius, 1e-4)));
        const lo = Math.max(ORBIT_MIN_PITCH_DEG, Math.min(geoMinDeg, geoMaxDeg));
        const hi = Math.min(ORBIT_MAX_PITCH_DEG, Math.max(geoMinDeg, geoMaxDeg));
        const pitchDeg = THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(st.startPitch) + dy * THREE.MathUtils.radToDeg(ORBIT_SENSITIVITY),
          Math.min(lo, hi), Math.max(lo, hi),
        );
        const pitch = THREE.MathUtils.degToRad(pitchDeg);
        const radius = THREE.MathUtils.clamp(st.startRadius, ORBIT_MIN_RADIUS, ORBIT_MAX_RADIUS);
        const pos = this._positionFromSpherical(st.target, radius, pitch, azimuth);
        const clamped = this._clampToBounds(pos);
        this.camera.position.copy(clamped);
        this.camera.lookAt(st.target.x, st.target.y, st.target.z);
        this._customPos = [clamped.x, clamped.y, clamped.z];
        this._customTarget = [st.target.x, st.target.y, st.target.z];
        this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
        return;
      }
      if (!this._dragState) return;
      const dx = e.clientX - this._dragState.startX;
      const dy = e.clientY - this._dragState.startY;
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const scale = 0.012; // drag-pixels -> world-units
      const moved = this._dragState.startPos.clone();
      moved.addScaledVector(right, -dx * scale);
      moved.y += dy * scale;
      const clamped = this._clampToBounds(moved);
      const targetDelta = clamped.clone().sub(this._dragState.startPos);
      const newTarget = this._dragState.startTarget.clone().add(targetDelta);
      this.camera.position.copy(clamped);
      this.camera.lookAt(newTarget.x, newTarget.y, newTarget.z);
      this._customPos = [clamped.x, clamped.y, clamped.z];
      this._customTarget = [newTarget.x, newTarget.y, newTarget.z];
      this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
    });
    const endDrag = (e) => {
      try {
        if (e && e.pointerId !== undefined && this.canvas.hasPointerCapture &&
            this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) { /* pointer already gone -- nothing to release */ }
      if (this._orbitDragState) {
        this._orbitDragState = null;
        this._persist();
        return;
      }
      if (!this._dragState) return;
      this._dragState = null;
      this._persist();
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  getBounds() { return { ...BOUNDS }; }
}
