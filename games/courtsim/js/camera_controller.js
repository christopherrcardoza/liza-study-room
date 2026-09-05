// CAMERA-AND-STAGING-001 Step 2 -- Rule 111 as amended (2026-08-18): where a
// choice is a position on a range (camera distance, angle) rather than a
// fork between designs, build the range. This module owns every way the
// founder can look at the room: discrete named presets (a click, not a menu
// dive), a click-a-point zoom tool with satellite-map-style stepped
// dolly-in/out, a plain +/- zoom, bounded free-drag movement, and a reset
// that always returns to the reporter's seat. State persists across
// sessions (Rule 129 -- legible current state, not a silent default).
import * as THREE from 'three';
import { solveVFovDegrees } from './contain.js';

const STORAGE_KEY = 'courtsim_camera_state';

// VIEWPORT-CONTAIN-001 Step 2/3 -- REPLACES the old static-fov-per-preset
// design (WIDE_FOV=50/CLOSE_FOV=30, tuned by eye at ONE aspect ratio,
// 622x389 -- see git history) with CONTAIN, solved fresh from a declared
// world-space guarantee volume G every time the aspect changes (setAspect()
// below). A static fov is itself a fit policy frozen at whatever aspect it
// was tuned at -- exactly the research doc's "accidental Hor+" failure mode,
// which amputates the SIDES on anything narrower than that one aspect (a
// portrait window silently loses a counsel table). CONTAIN's failure
// direction is revealing more room, never cropping a required subject.
//
// Rx/Ry below are the UN-padded half-extents of G (world units); the
// protection-margin CONTROL (Step 4, PROTECTION_FACTOR_DEFAULT / persisted
// state below) is applied at SOLVE time, not baked in, so it stays a real,
// adjustable Rule 129 control rather than a hardcoded constant. D is the
// fit-plane distance -- for the six-seat presets it's fixed (that preset's
// own camera never moves independently of a preset switch); for the close/
// speaker single-subject presets it is the CAMERA-DISTANCE control's actual
// live pos/target distance, computed in _applyPosTarget()/_applyScaledClose()
// below, so dollying the close-up in/out re-solves the correct fov for the
// new range rather than leaving a stale one.
//
// Measured, not guessed: real courtroom_a Bip01_Head bone world positions
// sampled directly off THIS web build (Claude_Browser + window.__courtsimTest,
// state.scene.seatGroups[key].model.getObjectByName('Bip01_Head')) for the
// six REQUIRED speaking seats (bench, witness stand, both counsel tables,
// clerk, bailiff -- jurors/gallery excluded, "MAY be partial" per the
// brief), solved against each preset's own real camera pos/target, then
// cross-checked point-by-point at 21:9/16:9/4:3/portrait -- all four passed
// with a positive margin. See reports/VIEWPORT_CONTAIN_001.md Step 3 for the
// full table. MEASURED BUG, caught and fixed before shipping: an EARLIER
// pass at these two constants used Godot's own head-bone measurements
// (scratch/viewport_contain_001/guarantee_vol/guarantee_vol.json) against
// THIS file's web camera pos/target -- the two builds place the same six
// named seats at completely different world coordinates (e.g. THE COURT is
// at z=+4.34 in Godot's courtroom_a but z=-3.49 here), so that combination
// was internally inconsistent. Re-measured from this build directly before
// use, per this repo's own "raw source over pre-digested copy" doctrine.
const SIX_SEAT_GUARANTEE = { D: 8.5151, Rx: 5.3291, Ry: 1.8950 };         // reporter preset's own camera
const SIX_SEAT_GUARANTEE_WIDE = { D: 12.1998, Rx: 5.6066, Ry: 1.9668 };  // wide preset's own camera
// Single-subject close-ups (bench/witness/counselA/counselB/speaker): a
// fixed head+shoulder margin box (world units) around whatever point the
// camera is actually looking at. D is NOT stored here -- computed live from
// that preset's real pos/target distance (_applyPosTarget()/_distance()
// below), since 'speaker' picks a different subject (and therefore a
// different D) every utterance, and the CAMERA-DISTANCE control (Step 4)
// can move any of them.
const CLOSE_MARGIN = { Rx: 0.2800, Ry: 0.2000 };

// Step 4 controls (Rule 111 as amended -- values on a range get a defended
// default and a real control, not a hardcoded constant or a per-preset
// author's guess). Both persist in the SAME localStorage blob as camera
// state (Rule 129 -- legible current value, effect measured, survives a
// reload).
const PROTECTION_FACTOR_DEFAULT = 1.05;  // research's own "Netflix's own 3-10%" band, §7.2 -- 5% chosen as the mid-band default
const PROTECTION_FACTOR_MIN = 1.03;
const PROTECTION_FACTOR_MAX = 1.10;
const CAMERA_DISTANCE_DEFAULT = 1.0;     // multiplies the close/speaker presets' own pos-target distance -- "the faces and how close it should be" (founder's own ruling)
const CAMERA_DISTANCE_MIN = 0.6;
const CAMERA_DISTANCE_MAX = 1.8;

// The single-subject presets the CAMERA-DISTANCE control applies to --
// reporter/wide are the fixed six-seat establishing shots and are excluded.
const CLOSE_PRESET_NAMES = new Set(['bench', 'witness', 'counselA', 'counselB']);

export const CAMERA_PRESETS = {
  reporter: {
    label: 'Reporter (default)',
    pos: [0, 2.3, 7.5], target: [0, 1.4, -2.6], guarantee: SIX_SEAT_GUARANTEE,
  },
  bench: {
    label: 'The Bench',
    pos: [0, 1.7, -1.0], target: [0, 1.5, -3.5], guarantee: CLOSE_MARGIN,
  },
  witness: {
    label: 'Witness Stand',
    pos: [1.6, 1.7, 1.2], target: [1.6, 1.3, -1.2], guarantee: CLOSE_MARGIN,
  },
  counselA: {
    label: 'Counsel Table (Q)',
    pos: [-3.3, 1.6, -0.8], target: [-3.3, 1.0, 1.5], guarantee: CLOSE_MARGIN,
  },
  counselB: {
    label: 'Counsel Table (Named)',
    pos: [3.3, 1.6, -0.8], target: [3.3, 1.0, 1.5], guarantee: CLOSE_MARGIN,
  },
  wide: {
    label: 'Wide Establishing Shot',
    pos: [0, 6.5, 10.0], target: [0, 0.6, -1.5], guarantee: SIX_SEAT_GUARANTEE_WIDE,
  },
  // 'speaker' has no static pos/target -- computed at runtime from whoever
  // is currently talking (see followSeat()), and falls back to 'reporter'
  // when nobody is. Its guarantee is CLOSE_MARGIN (below, in
  // _followActiveOrReporter), same as every other single-subject shot.
  speaker: { label: 'Current Speaker (close)' },
};

const PRESET_ORDER = ['reporter', 'bench', 'witness', 'counselA', 'counselB', 'wide', 'speaker'];

// Room bounds for free movement -- derived from the room geometry in
// scene.js's _buildRoom() (floor 16x16 centered at origin, walls implied
// by the back wall at z=-6 and the room dressing) with a margin so the
// camera can approach a wall/the bench without clipping through it.
const BOUNDS = { xMin: -7.5, xMax: 7.5, zMin: -5.5, zMax: 9.5, yMin: 1.1, yMax: 5.0 };

const ZOOM_STEP_FRACTION = 0.22; // satellite-map-style: each click/press covers a fraction of the remaining distance to the target point, not a fixed unit -- feels right whether you're far out or already close in.
const MIN_ZOOM_DISTANCE = 0.6;

// FIELD-TEST-BUILD-002 -- FREE-ORBIT-001. The founder's own field-test
// report: "The view is only looking at it from behind. I want to look at
// it from every angle -- looking at them, then from behind them into the
// audience, then from the left and the right. It needs to be 360, in all
// degrees." The existing bounded-drag control (_bindPointerEvents below)
// WALKS the viewpoint (position translates, look direction stays fixed) --
// it never rotates the view at all, so it can't answer this report by
// itself. Orbit is ADDITIVE: a new toggleable mode, following the SAME
// click-a-mode-then-drag/click pattern this file already established for
// zoom-in/zoom-out (setZoomMode/handleZoomClick), so it reads as one
// consistent interaction language instead of a second one invented from
// scratch. When orbit mode is off, dragging still walks the viewpoint
// exactly as it always has -- presets and Reset are untouched either way
// (Rule 100: additive, not a replacement).
const ORBIT_MIN_PITCH_DEG = -80; // clamp NEAR, not AT, the poles -- a full
// +-90 points the camera straight down/up, where lookAt()'s own up-vector
// math is singular -- that IS the actual mechanism of "ending up upside-
// down" this task asks to avoid, not just a vague safety margin.
const ORBIT_MAX_PITCH_DEG = 80;
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
    // FREE-ORBIT-001 -- separate from _zoomMode/_dragState above: a third,
    // independently-toggleable drag behavior (see setOrbitMode() below),
    // off by default so existing walk-drag behavior is unchanged unless
    // explicitly turned on.
    this._orbitMode = false;
    this._orbitDragState = null;
    this._onChange = null;    // UI callback: (presetName, zoomMode) => void

    // VIEWPORT-CONTAIN-001 Step 2 -- the aspect CONTAIN solves against.
    // scene.js's _resize() is the one place the CSS box's real
    // clientWidth/clientHeight are read (Rule: "engine follows, camera owns
    // framing" -- see contain.js's own header comment); it calls
    // setAspect() here on every change so the ACTIVE preset's fov is always
    // solved for the aspect that is true right now, not whatever aspect was
    // true when the preset was last clicked.
    this._aspect = 16 / 9;
    // Step 4 controls -- persisted, defended defaults, real range (Rule 111
    // as amended). Loaded before setPreset() below so the very first fov
    // solve already uses whatever the founder last set.
    this._protectionFactor = PROTECTION_FACTOR_DEFAULT;
    this._cameraDistanceScale = CAMERA_DISTANCE_DEFAULT;
    this._loadControls();

    this._bindPointerEvents();

    // MEASURED BUG, fixed here: persisting currentPreset:'speaker' across a
    // page reload left it selected with NO seat yet followed (a fresh
    // instance has no _followSeatKey until the first utterance of a NEW
    // session runs) -- but followSeat() checks `this.currentPreset ===
    // 'speaker'` to decide whether to move the camera, so the very FIRST
    // followSeat() call of the new session (fired by the normal speak
    // loop for utterance 1, nothing to do with any explicit preset click)
    // silently snapped the camera to a close-up instead of leaving it on
    // whatever preset a person would expect a fresh load to start on.
    // Reproduced directly: an automated run that happened to end a prior
    // session with 'speaker' active left the WIDE-SHOT assertions of the
    // NEXT run reading a nonsensical off-screen camera rect (cx=-139).
    // 'speaker' has no meaningful saved state on its own (its whole point
    // is "whoever is currently talking," which by definition doesn't
    // exist yet at page load) -- excluded from restoration here; every
    // OTHER preset, including a free-moved/zoomed position within it,
    // still resumes exactly where he left off (Rule 129).
    const persisted = loadPersisted();
    if (persisted && CAMERA_PRESETS[persisted.preset] && persisted.preset !== 'speaker') {
      this.setPreset(persisted.preset, { persist: false });
      if (persisted.pos && persisted.target) {
        this._customPos = persisted.pos;
        this._customTarget = persisted.target;
        this._applyPosTarget(persisted.pos, persisted.target);
      }
    } else {
      this.setPreset('reporter', { persist: false });
    }
  }

  onChange(fn) { this._onChange = fn; }

  _notify() {
    if (this._onChange) this._onChange(this.currentPreset, this._zoomMode);
  }

  _persist() {
    const pos = [this.camera.position.x, this.camera.position.y, this.camera.position.z];
    const target = this._currentTargetArray();
    try {
      // VIEWPORT-CONTAIN-001 Step 4 -- merge, don't clobber: this same blob
      // also carries protectionFactor/cameraDistanceScale (_persistControls
      // below), which a plain camera-move persist must not silently erase.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        preset: this.currentPreset, pos, target,
        protectionFactor: this._protectionFactor,
        cameraDistanceScale: this._cameraDistanceScale,
      }));
    } catch (e) { /* storage full/unavailable -- state just won't persist, not fatal */ }
  }

  _currentTargetArray() {
    if (this._customTarget) return this._customTarget;
    const preset = CAMERA_PRESETS[this.currentPreset];
    return preset && preset.target ? preset.target : [0, 1.4, -2.6];
  }

  // VIEWPORT-CONTAIN-001 Step 2 -- `guarantee` replaces the old raw `fov`
  // parameter: {Rx, Ry} (world units, UN-padded) plus an optional fixed `D`.
  // When omitted, whatever guarantee/D is already active stays active (the
  // persisted-custom-position restore path in the constructor below relies
  // on this -- it repositions the camera without re-deriving a fresh D from
  // an arbitrary saved point).
  _applyPosTarget(pos, target, guarantee = null) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(target[0], target[1], target[2]);
    this._lastTarget = target;
    if (guarantee) {
      this._activeGuarantee = guarantee;
      this._activeD = guarantee.D != null ? guarantee.D : this._distance(pos, target);
      this._solveAndApplyFov();
    }
  }

  _distance(pos, target) {
    return Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
  }

  // The ONE place vfov is computed (contain.js's solveVFovDegrees is the one
  // place the CONTAIN math itself lives) -- called whenever the aspect
  // changes (setAspect(), driven by scene.js's _resize()), whenever the
  // protection-margin control changes, or whenever a new pos/target/
  // guarantee is applied above.
  _solveAndApplyFov() {
    if (!this._activeGuarantee || this._activeD == null) return;
    const Rx = this._activeGuarantee.Rx * this._protectionFactor;
    const Ry = this._activeGuarantee.Ry * this._protectionFactor;
    this.camera.fov = solveVFovDegrees(Rx, Ry, this._activeD, this._aspect);
    this.camera.updateProjectionMatrix();
  }

  // Called by scene.js's _resize() -- the ONE place the CSS box's real
  // clientWidth/clientHeight are read (research §10.2 Step 2/Step 3: "CSS
  // owns the box... camera.aspect from the CSS box, not the buffer"). Never
  // called from anywhere else, so aspect and the fov CONTAIN solves for it
  // never drift out of sync with each other.
  setAspect(aspect) {
    this._aspect = aspect;
    this._solveAndApplyFov();
  }

  // Step 4 -- CAMERA DISTANCE control ("the faces and how close it should
  // be," the founder's own ruling). Applies only to the single-subject
  // close-ups (bench/witness/counselA/counselB/speaker) -- the six-seat
  // establishing shots (reporter/wide) are a fixed staged framing, not a
  // "how close to one face" control. Scales the camera's OFFSET from the
  // target (a real dolly, target stays fixed), then re-solves D and fov
  // from the new actual distance -- CONTAIN naturally widens the fov for a
  // closer camera and narrows it for a farther one, keeping the same
  // guarantee box in frame at every distance setting, not just the default.
  _applyScaledClose(guarantee) {
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
    this._applyPosTarget(pos, base, guarantee);
  }

  setCameraDistanceScale(value) {
    this._cameraDistanceScale = THREE.MathUtils.clamp(value, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    if (this._basePos && this._baseTarget) {
      this._applyScaledClose(this._activeGuarantee || CLOSE_MARGIN);
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
    } catch (e) { /* corrupt/old value -- fall through to defaults */ }
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

  setPreset(name, opts = {}) {
    const def = CAMERA_PRESETS[name];
    if (!def) return;
    // MEASURED BUG, fixed here: unconditionally clearing _followSeatKey
    // broke the exact sequence a real caller uses -- main.js's speakLoop
    // calls followSeat(seatKey) once per utterance, and setPreset('speaker')
    // is how the founder actually switches TO that view (clicking "Follow
    // Speaker" mid-proceeding, or it already being selected when a new
    // utterance starts). Clearing the just-set follow target here made
    // 'speaker' silently fall back to the reporter's seat every time --
    // reproduced directly: tests/test_e2e_web.py's own close-speaker
    // assertion read back the IDENTICAL camera rect as the wide shot right
    // after calling followSeat() then setPreset('speaker'). Only clear it
    // when leaving 'speaker' for some other preset, where a stale follow
    // target is genuinely irrelevant.
    if (name !== 'speaker') this._followSeatKey = null;
    this.currentPreset = name;
    this._customPos = null;
    this._customTarget = null;
    if (name === 'speaker') {
      this._followActiveOrReporter();
    } else if (CLOSE_PRESET_NAMES.has(name)) {
      this._basePos = def.pos;
      this._baseTarget = def.target;
      this._applyScaledClose(def.guarantee);
    } else {
      this._basePos = null;
      this._baseTarget = null;
      this._applyPosTarget(def.pos, def.target, def.guarantee);
    }
    if (opts.persist !== false) this._persist();
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

  // Called by main.js every time the active speaker changes (setActiveSpeaker
  // already fires there) -- only actually MOVES the camera if the 'speaker'
  // preset is the one currently selected, so switching speakers doesn't yank
  // the view out from under someone looking at the bench preset.
  followSeat(seatKey) {
    this._followSeatKey = seatKey;
    if (this.currentPreset === 'speaker') this._followActiveOrReporter();
  }

  _followActiveOrReporter() {
    const seatKey = this._followSeatKey;
    const framing = seatKey ? this.scene.getSeatCloseFraming(seatKey) : null;
    if (framing) {
      this._basePos = framing.pos;
      this._baseTarget = framing.target;
      this._applyScaledClose(CLOSE_MARGIN);
    } else {
      this._basePos = null;
      this._baseTarget = null;
      const rep = CAMERA_PRESETS.reporter;
      this._applyPosTarget(rep.pos, rep.target, rep.guarantee);
    }
  }

  // --- Zoom: click-a-point mode (satellite-map behaviour) + plain +/- ---

  setZoomMode(mode) {
    // mode: null (off), 'in', 'out'
    this._zoomMode = mode;
    this.canvas.style.cursor = mode === 'in' ? 'zoom-in' : mode === 'out' ? 'zoom-out' : '';
    this._notify();
  }

  // FREE-ORBIT-001 -- toggled by main.js's new Orbit button, same on/off
  // idiom as setZoomMode() above. Turning orbit ON does not itself move the
  // camera -- only a subsequent drag does (see _bindPointerEvents below) --
  // so clicking the button alone is a safe, reversible no-op, same as
  // entering zoom-in/zoom-out mode is.
  setOrbitMode(on) {
    this._orbitMode = !!on;
    this.canvas.style.cursor = this._orbitMode ? 'grab' : '';
    this._notify();
  }

  // --- Orbit math: spherical coordinates around whatever target point is
  // currently active (this._currentTargetArray()) -- so orbiting a NAMED
  // preset's own close framing (e.g. 'bench') circles around THAT preset's
  // subject, and orbiting from the wide/reporter view circles around the
  // room's own establishing-shot target. ---

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

  // Test/diagnostic hook (Rule 130 -- same "read the real state back off
  // the real object" discipline getRobeMaterialsRecolored() etc. already
  // use elsewhere in this codebase): the camera's CURRENT orbit angles,
  // computed fresh from its actual position/target, not a separately
  // tracked value that could drift from what's really on screen.
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

  // Called by main.js's canvas click handler when a zoom mode is active.
  // (clientX, clientY) are event coordinates relative to the canvas.
  handleZoomClick(clientX, clientY) {
    if (!this._zoomMode) return false;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hits = this._raycaster.intersectObjects(this.scene.scene.children, true);
    let point;
    if (hits.length > 0) {
      point = hits[0].point;
    } else {
      // No geometry under the click (e.g. clicked the sky/background) --
      // still zoom TOWARD the ray direction, at a fixed reasonable depth,
      // rather than refusing to do anything.
      const dir = this._raycaster.ray.direction;
      point = this.camera.position.clone().addScaledVector(dir, 8);
    }
    this._dollyToward(point, this._zoomMode === 'in' ? 1 : -1);
    return true;
  }

  // Plain +/- control: dolly along the current view direction (no click
  // point needed) by the same stepped fraction, toward/away from the
  // current look-at target.
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
    // Zooming toward a clicked point aims the camera at that point (this IS
    // "move toward/away from that point", not just a dolly along the old
    // look direction) -- but a plain +/- press re-uses the existing target
    // instead, so it doesn't spin the view.
    this.camera.lookAt(point.x, point.y, point.z);
    this._customPos = [clamped.x, clamped.y, clamped.z];
    this._customTarget = [point.x, point.y, point.z];
    this._persist();
  }

  _clampToBounds(pos) {
    return new THREE.Vector3(
      THREE.MathUtils.clamp(pos.x, BOUNDS.xMin, BOUNDS.xMax),
      THREE.MathUtils.clamp(pos.y, BOUNDS.yMin, BOUNDS.yMax),
      THREE.MathUtils.clamp(pos.z, BOUNDS.zMin, BOUNDS.zMax),
    );
  }

  // --- Free movement: drag to walk the viewpoint within bounds ---

  _bindPointerEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this._zoomMode) return; // zoom-click takes priority over drag-start
      if (e.button !== 0) return;
      if (this._orbitMode) {
        // FREE-ORBIT-001 -- capture the CURRENT spherical angles (derived
        // from the real camera position, not a separately tracked value)
        // as this drag's own start point, so orbit composes correctly with
        // whatever zoom/dolly distance or preset was already active.
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
        // FREE-ORBIT-001 -- horizontal drag rotates azimuth (yaw around the
        // target, all the way around -- "360, in all degrees"), vertical
        // drag rotates pitch (elevation), clamped near the poles so the
        // camera can never flip upside-down. This is a genuine look-around
        // orbit, not the walk below: the TARGET stays fixed and the camera
        // circles it, which is what actually lets the founder end up
        // "behind them, into the audience."
        const st = this._orbitDragState;
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        const azimuth = st.startAzimuth + dx * ORBIT_SENSITIVITY;
        const pitchDeg = THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(st.startPitch) - dy * THREE.MathUtils.radToDeg(ORBIT_SENSITIVITY),
          ORBIT_MIN_PITCH_DEG, ORBIT_MAX_PITCH_DEG,
        );
        const pitch = THREE.MathUtils.degToRad(pitchDeg);
        const radius = THREE.MathUtils.clamp(st.startRadius, ORBIT_MIN_RADIUS, ORBIT_MAX_RADIUS);
        const pos = this._positionFromSpherical(st.target, radius, pitch, azimuth);
        // Bounded so the camera can't end up inside a wall or outside the
        // room -- same _clampToBounds() every other movement path in this
        // file already uses (zoom dolly, walk-drag), not a new rule.
        const clamped = this._clampToBounds(pos);
        this.camera.position.copy(clamped);
        this.camera.lookAt(st.target.x, st.target.y, st.target.z);
        this._customPos = [clamped.x, clamped.y, clamped.z];
        this._customTarget = [st.target.x, st.target.y, st.target.z];
        return;
      }
      if (!this._dragState) return;
      const dx = e.clientX - this._dragState.startX;
      const dy = e.clientY - this._dragState.startY;
      // Screen-space drag -> world-space walk: horizontal drag strafes
      // along the camera's own right vector, vertical drag walks forward/
      // back along its forward vector projected onto the horizontal plane
      // -- "move his own viewpoint within the room" (position) with the
      // look direction held fixed. This is the WALK control -- see the
      // orbit branch above for the look-around/rotate control.
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const scale = 0.012; // drag-pixels -> world-units
      const moved = this._dragState.startPos.clone()
        .addScaledVector(right, dx * scale)
        .addScaledVector(forward, -dy * scale);
      const clamped = this._clampToBounds(moved);
      const targetDelta = clamped.clone().sub(this._dragState.startPos);
      const newTarget = this._dragState.startTarget.clone().add(targetDelta);
      this.camera.position.copy(clamped);
      this.camera.lookAt(newTarget.x, newTarget.y, newTarget.z);
      this._customPos = [clamped.x, clamped.y, clamped.z];
      this._customTarget = [newTarget.x, newTarget.y, newTarget.z];
    });
    const endDrag = (e) => {
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
