// WEB-REBUILD-001 -- app bootstrap and Selection -> Courtroom -> Results
// flow. Mirrors the desktop build's own flow (godot/courtsim_probe/main.gd)
// deliberately, so the two builds feel like the same product (Rule 111:
// neither is a fallback for the other) -- but everything here runs
// natively in this tab. No Python process. No server call carrying audio
// or transcript text (see reports/WEB_BUILD_001.md's network-trace proof).

import { EngineBridge } from './engine_bridge.js';
import { TtsEngine, playSynthesized, wpmToSpeed } from './tts.js';
import { VoiceInputSource, listCaptureDevices } from './asr.js';
import { CourtroomScene, seatKeyForSpeaker, VENUES } from './scene.js';
import { CameraController, CAMERA_PRESETS } from './camera_controller.js';
import { loadProceedings } from './proceedings.js';
import { assignVoices } from './voice_cast.js';
import { attachUtteranceContext } from './results_context.js';
import { computeWeightTrack, isSupported as lipsyncSupported } from './lipsync.js';
import { initDifficultySettings } from './difficulty_settings.js';

// SPEED-VOLUME-001 -- "instead of predetermined, it's a bar that scrolls
// up": continuous WPM (50-300) and volume (0-100%) sliders, persisted
// between sessions so he does not reset them every launch.
const WPM_MIN = 50, WPM_MAX = 300, WPM_DEFAULT = 150;
const VOLUME_MIN = 0, VOLUME_MAX = 100, VOLUME_DEFAULT = 80;
// MOTION-SPEED-001 -- 0 = completely still, 100 = today's normal ("full")
// idle-motion rate. Same continuous-slider-with-persisted-readout pattern
// as WPM/Volume above, not a new idiom.
const MOTION_MIN = 0, MOTION_MAX = 100, MOTION_DEFAULT = 100;

function loadPersistedNumber(key, min, max, fallback) {
  const raw = localStorage.getItem(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

const el = (id) => document.getElementById(id);
const screens = {
  loading: el('loading-screen'),
  selection: el('selection-screen'),
  courtroom: el('courtroom-screen'),
  results: el('results-screen'),
};
function showScreen(name) {
  for (const [k, node] of Object.entries(screens)) node.classList.toggle('hidden', k !== name);
}

const state = {
  engine: null,
  tts: null,
  scene: null,
  proceedings: [],
  selectedProceeding: null,
  selectedDeviceId: null,
  voiceCast: {},
  input: null,
  audioCtx: null,
  gainNode: null,
  wpm: loadPersistedNumber('courtsim_wpm', WPM_MIN, WPM_MAX, WPM_DEFAULT),
  volume: loadPersistedNumber('courtsim_volume', VOLUME_MIN, VOLUME_MAX, VOLUME_DEFAULT),
  motionSpeed: loadPersistedNumber('courtsim_motion_speed', MOTION_MIN, MOTION_MAX, MOTION_DEFAULT),
  proceedingStarted: false,
  finalTextParts: [],
  wordConfidences: {},
  micTimer: null,
  pollTimer: null,
  currentIndex: 0,
  playing: false,
  // PLAY-PAUSE-001 -- distinct from `playing` (which means "the speak loop
  // is running at all" and is only ever set false by Finish). `paused` is
  // a temporary halt of all three clocks (audio, capture, lip-sync)
  // WITHOUT ending the proceeding -- see pauseSession()/resumeSession().
  paused: false,
  difficulty: null,
};

function setLoadingProgress(pct, status, detail) {
  el('loading-progress').style.width = `${pct}%`;
  if (status) el('loading-status').textContent = status;
  el('loading-detail').textContent = detail || '';
}

async function boot() {
  showScreen('loading');
  setLoadingProgress(5, 'Starting up...');

  state.engine = new EngineBridge();
  await state.engine.init((msg) => setLoadingProgress(20, 'Preparing the scoring engine...', msg));
  setLoadingProgress(35, 'Loading proceedings...');
  state.proceedings = await loadProceedings(state.engine);

  setLoadingProgress(45, 'Loading voices (one-time download, cached after this)...');
  state.tts = new TtsEngine();
  await state.tts.init((msg) => setLoadingProgress(60, 'Loading voices...', msg));

  setLoadingProgress(75, 'Loading the speech recognizer (one-time download, cached after this)...');
  await VoiceInputSource.preload((msg) => setLoadingProgress(85, 'Loading the speech recognizer...', msg));

  setLoadingProgress(92, 'Preparing the courtroom...');
  state.scene = new CourtroomScene(el('scene-canvas'));
  state.cameraController = new CameraController(state.scene, el('scene-canvas'));
  // VIEWPORT-CONTAIN-001 Step 2 -- back-reference so scene.js's _resize()
  // (the one place the CSS box's real size is read) can delegate vfov
  // solving to the controller that owns G/CONTAIN, instead of the two
  // drifting apart. See scene.js's own _resize() comment.
  state.scene.cameraController = state.cameraController;
  state.scene.handleBecameVisible(); // re-solve now that the controller (and its real fov) actually exists -- the constructor's own first _resize() ran before this
  initSliders();
  initCameraControls();
  initWindowPresets();
  initFullscreen();
  state.difficulty = initDifficultySettings();
  initPlayPause();

  setLoadingProgress(98, 'Preparing the selection screen...');
  await refreshDevices();
  buildSelectionScreen();
  // MEASURED (this job): 'Ready.' used to be set BEFORE refreshDevices()/
  // buildSelectionScreen() ran, so there was a real window where the
  // loading screen already claimed readiness while the proceedings list
  // was still empty. Not the founder's black-screen cause (that was the
  // courtroom canvas, see reports/WEB_FIX_001.md), but a real latent race
  // found while building this job's automated test, worth closing: 'Ready.'
  // now only appears once the selection screen is actually populated and
  // about to be shown.
  setLoadingProgress(100, 'Ready.');
  showScreen('selection');
}

function buildSelectionScreen() {
  const list = el('proceedings-list');
  list.innerHTML = '';
  state.proceedings.forEach((p, i) => {
    const li = document.createElement('li');
    li.textContent = `${p.title}  (${p.speaker_count} speakers, ${p.utterance_count} lines)`;
    li.addEventListener('click', () => {
      [...list.children].forEach((c) => c.classList.remove('selected'));
      li.classList.add('selected');
      state.selectedProceeding = p;
      el('start-session-btn').disabled = false;
    });
    list.appendChild(li);
  });
  el('d11-note').textContent = ''; // D11: no upload option exists in this build at all -- nothing to gate here.

  // VENUES-001 -- "six distinct rooms." Rule 111 second amendment: build
  // them, let the founder judge -- a compact <select> next to the
  // proceeding picker, defaulting to Courtroom A (state.scene's own
  // constructor default), so picking a venue costs one click. Read at
  // Begin Session time (see the start-session-btn handler below), the same
  // deferred-rebuild pattern the Godot build's own venue_picker uses.
  const venuePicker = el('venue-picker');
  venuePicker.innerHTML = '';
  for (const v of VENUES) {
    const opt = document.createElement('option');
    opt.value = v.key;
    opt.textContent = `${v.label} -- ${v.subtitle}`;
    venuePicker.appendChild(opt);
  }
}

async function refreshDevices() {
  el('device-hint').textContent = 'Listing input devices...';
  const devices = await listCaptureDevices();
  const picker = el('device-picker');
  const prevValue = picker.value;
  picker.innerHTML = '<option value="">System default microphone</option>';
  for (const d of devices) {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    picker.appendChild(opt);
  }
  picker.value = prevValue || '';
  el('device-hint').textContent = devices.length
    ? `${devices.length} input device(s) found. If your USB stenomask isn't listed, or shows as "(unnamed input device)", press Begin Session once -- Chrome only reveals real device names after microphone permission is granted, then press Refresh Devices again.`
    : 'No input devices reported yet -- press Begin Session to grant microphone permission, then Refresh Devices.';
}

// SPEED-VOLUME-001 -- continuous sliders, live numeric readout, persisted
// between sessions. A mid-proceeding change takes effect no later than
// the next utterance: speakLoop() reads state.wpm fresh for every
// utterance it synthesizes, and the volume slider writes directly to the
// live GainNode already in the playback graph, so it applies even to
// audio already mid-playback, not just the next line.
function initSliders() {
  const wpmSlider = el('wpm-slider');
  const wpmReadout = el('wpm-readout');
  const volumeSlider = el('volume-slider');
  const volumeReadout = el('volume-readout');

  wpmSlider.value = String(state.wpm);
  wpmReadout.textContent = `${state.wpm} WPM`;
  volumeSlider.value = String(state.volume);
  volumeReadout.textContent = `${state.volume}%`;

  wpmSlider.addEventListener('input', () => {
    state.wpm = Number(wpmSlider.value);
    wpmReadout.textContent = `${state.wpm} WPM`;
    localStorage.setItem('courtsim_wpm', String(state.wpm));
  });

  volumeSlider.addEventListener('input', () => {
    state.volume = Number(volumeSlider.value);
    volumeReadout.textContent = `${state.volume}%`;
    localStorage.setItem('courtsim_volume', String(state.volume));
    if (state.gainNode) state.gainNode.gain.value = state.volume / 100;
  });

  // MOTION-SPEED-001 -- "a toggle for how fast the people move, from zero
  // to not moving at all." Wired straight to CourtroomScene.setMotionSpeed()
  // (scene.js), which scales the idle-motion clock itself (0 = frozen, not
  // merely slowed) -- applied both at init (the persisted value, so a
  // reload doesn't silently reset to full speed) and on every slider move.
  const motionSlider = el('motion-speed-slider');
  const motionReadout = el('motion-speed-readout');
  motionSlider.value = String(state.motionSpeed);
  motionReadout.textContent = `${state.motionSpeed}%`;
  if (state.scene) state.scene.setMotionSpeed(state.motionSpeed / 100);
  motionSlider.addEventListener('input', () => {
    state.motionSpeed = Number(motionSlider.value);
    motionReadout.textContent = `${state.motionSpeed}%`;
    localStorage.setItem('courtsim_motion_speed', String(state.motionSpeed));
    if (state.scene) state.scene.setMotionSpeed(state.motionSpeed / 100);
  });
}

// CAMERA-AND-STAGING-001 Step 2 -- wires the preset buttons, the click-a-
// point zoom tool (satellite-map behaviour: toggle a mode, then click
// somewhere in the room), the plain +/- zoom, and the reset. Every control's
// current state stays legible via aria-pressed + the status line (Rule 129),
// not a silent default the founder has to guess at.
function initCameraControls() {
  const cc = state.cameraController;
  const presetButtons = [...document.querySelectorAll('.cam-preset-btn')];
  const orbitBtn = el('orbit-mode-btn');
  const zoomInBtn = el('zoom-in-mode-btn');
  const zoomOutBtn = el('zoom-out-mode-btn');
  const statusEl = el('camera-status');

  function refreshUi(presetName, zoomMode) {
    for (const btn of presetButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.preset === presetName));
    }
    orbitBtn.setAttribute('aria-pressed', String(!!cc._orbitMode));
    zoomInBtn.setAttribute('aria-pressed', String(zoomMode === 'in'));
    zoomOutBtn.setAttribute('aria-pressed', String(zoomMode === 'out'));
    const label = (CAMERA_PRESETS[presetName] && CAMERA_PRESETS[presetName].label) || presetName;
    const modeNote = cc._orbitMode ? ' -- orbit mode: drag the scene to look around'
      : zoomMode ? ` -- zoom-${zoomMode} mode: click the scene` : '';
    statusEl.textContent = `View: ${label}${modeNote}`;
  }
  cc.onChange(refreshUi);
  refreshUi(cc.currentPreset, cc._zoomMode);

  for (const btn of presetButtons) {
    btn.addEventListener('click', () => {
      cc.setZoomMode(null);
      cc.setOrbitMode(false);
      cc.setPreset(btn.dataset.preset);
    });
  }

  // FREE-ORBIT-001 -- orbit, zoom-click, and plain drag-to-walk all use the
  // same canvas pointer events, so at most one of orbit/zoom-click is ever
  // armed at a time (same mutual-exclusivity discipline zoom-in/zoom-out
  // already have with each other, extended to the new third mode).
  orbitBtn.addEventListener('click', () => {
    cc.setZoomMode(null);
    cc.setOrbitMode(!cc._orbitMode); // setOrbitMode() itself calls _notify() -> refreshUi(), which reads cc._orbitMode directly
  });
  zoomInBtn.addEventListener('click', () => {
    cc.setOrbitMode(false);
    cc.setZoomMode(cc._zoomMode === 'in' ? null : 'in');
  });
  zoomOutBtn.addEventListener('click', () => {
    cc.setOrbitMode(false);
    cc.setZoomMode(cc._zoomMode === 'out' ? null : 'out');
  });
  el('zoom-plus-btn').addEventListener('click', () => cc.zoomStep(1));
  el('zoom-minus-btn').addEventListener('click', () => cc.zoomStep(-1));
  el('camera-reset-btn').addEventListener('click', () => {
    cc.setZoomMode(null);
    cc.setOrbitMode(false);
    cc.reset();
  });

  const canvas = el('scene-canvas');
  canvas.addEventListener('click', (e) => {
    if (cc.handleZoomClick(e.clientX, e.clientY)) {
      // A click-to-zoom moves off whatever named preset was active --
      // reflect that in the UI (no preset button stays highlighted once
      // the view no longer matches its exact framing).
      refreshUi(cc.currentPreset, cc._zoomMode);
    }
  });

  // VIEWPORT-CONTAIN-001 Step 4 -- protection margin (3-10%, defended
  // default 5%) and camera distance (0.6x-1.8x, default 1.0x) controls.
  // Slider values are read back from the controller after each change (not
  // just echoed from the input's own raw value) -- Rule 129's "current
  // value legible" means the REAL applied value, which THREE.MathUtils.clamp
  // inside setProtectionFactor()/setCameraDistanceScale() may differ from
  // if the persisted value predates a range change.
  const protectionSlider = el('protection-slider');
  const protectionReadout = el('protection-readout');
  const distanceSlider = el('camera-distance-slider');
  const distanceReadout = el('camera-distance-readout');
  const refreshControlReadouts = () => {
    const s = cc.getControlState();
    protectionSlider.value = String(Math.round((s.protectionFactor - 1) * 100));
    protectionReadout.textContent = `${Math.round((s.protectionFactor - 1) * 100)}%`;
    distanceSlider.value = String(Math.round(s.cameraDistanceScale * 100));
    distanceReadout.textContent = `${s.cameraDistanceScale.toFixed(2)}x`;
  };
  protectionSlider.addEventListener('input', () => {
    cc.setProtectionFactor(1 + Number(protectionSlider.value) / 100);
    refreshControlReadouts();
  });
  distanceSlider.addEventListener('input', () => {
    cc.setCameraDistanceScale(Number(distanceSlider.value) / 100);
    refreshControlReadouts();
  });
  refreshControlReadouts();
}

// CAMERA-AND-STAGING-001 Step 3 -- window/aspect presets. The 3D view's own
// aspect correctness is scene.js's job (aspect-ratio CSS + camera.aspect
// kept in sync by _resize()/ResizeObserver, already fixed by prior jobs);
// this only changes how much of the BROWSER WINDow's content area the app
// itself occupies, via the #app container's own size -- never anything that
// could clamp x/y to >=0, which would break the founder's own six-monitor
// layout (four of six sit at negative X).
// VIEWPORT-CONTAIN-001 Step 4 -- "SHIP EVERY window preset, not narrow to a
// favourite" (Rule 111 as amended). These SIX are named directly in the
// brief and in the research doc's own acceptance matrix (§10.2 Step 10):
// the founder's own measured minimum-supported floor (846x522), the two
// common desktop targets, a real 21:9 ultrawide, a portrait window (the
// shape CONTAIN exists specifically to keep safe -- plain Hor+ amputates
// exactly here), and a 4K TV size. 'fill' and 'fit' (computed at click
// time from the real screen, not a fixed pair) are ADDITIVE, kept from the
// prior preset set -- Rule 100, not a narrowing.
const WINDOW_PRESETS = {
  fill:      { width: '100vw', height: '100vh' },
  floor:     { width: '846px', height: '522px' },   // research's own measured minimum-supported floor
  hd720:     { width: '1280px', height: '720px' },
  hd1080:    { width: '1920px', height: '1080px' },
  ultrawide: { width: '2100px', height: '900px' },  // 21:9 exactly
  portrait:  { width: '720px', height: '1280px' },
  tv:        { width: '3840px', height: '2160px' }, // 4K TV
  // 'fit' is computed at click time from the real screen, not a fixed pair.
};

function applyWindowPreset(name) {
  const app = el('app');
  if (name === 'fit') {
    // MEASURES THE ACTUAL DISPLAY (Step 3's own wording) -- window.screen
    // reports the real monitor the browser window currently lives on,
    // including on a negative-X monitor layout; availWidth/availHeight
    // exclude the OS taskbar.
    // VIEWPORT-CONTAIN-001 Step 2 -- MEASURED BUG, caught here: this used
    // to force an 8:5 targetAspect on #app itself, a THIRD authored fit
    // policy alongside the CSS aspect-ratio (style.css) and the camera's
    // own static per-preset fov (camera_controller.js), both already
    // removed/replaced this same job. It served the same purpose those did
    // -- keeping the room from looking "wrong" at an odd shape -- which is
    // now the camera's job (CONTAIN), not this container's. Fit now just
    // takes the full available display; whatever aspect results, the
    // camera's own CONTAIN solve (scene.js _resize -> camera_controller.js
    // setAspect) keeps the guarantee volume in frame at that shape.
    const availW = window.screen.availWidth || window.innerWidth;
    const availH = window.screen.availHeight || window.innerHeight;
    app.style.width = `${Math.round(availW * 0.96)}px`;
    app.style.height = `${Math.round(availH * 0.92)}px`;
  } else {
    const preset = WINDOW_PRESETS[name];
    if (!preset) return;
    app.style.width = preset.width;
    app.style.height = preset.height;
  }
  app.style.margin = name === 'fill' ? '0' : '0 auto';
  localStorage.setItem('courtsim_window_preset', name);
  for (const btn of document.querySelectorAll('.win-preset-btn')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.winpreset === name));
  }
  // #app resizing changes #scene-canvas-wrap's own available box; the
  // canvas needs to know NOW, not on the next window 'resize' event (which
  // won't fire from a CSS-only size change the browser itself didn't
  // trigger) -- same reasoning as handleBecameVisible() elsewhere in this
  // file for the screen-switch case.
  if (state.scene) state.scene.handleBecameVisible();
}

// FIELD-TEST-BUILD-002 -- WINDOW-GEOMETRY-002. MEASURED BUG, the founder's
// own field-test report: "When I reopened it, half of the screen was moved
// over to the right. I could only see half of the interface, and it all
// went grey on the left." A prior lane in this same job already re-checked
// every place this file touches window.screenX/screenY/moveTo and found
// nothing -- correctly: this file never positions the browser window at
// all. The actual mechanism lives here instead: every NAMED window preset
// except 'fill'/'fit' (WINDOW_PRESETS above -- 'large' 1280x800, 'small'
// 760x480, 'portrait' 480x800, 'landscape' 1024x640) sets a FIXED pixel
// width/height on #app via inline style (applyWindowPreset() below), which
// OVERRIDES the responsive `width:100%` rule #app otherwise carries
// (style.css). initWindowPresets() used to re-apply whatever preset NAME
// was persisted in localStorage on every single page load, unconditionally
// -- with no check of any kind against the display the page is actually
// opening into THIS time. Reopen the app on a smaller display (or a
// smaller window on the same six-monitor desktop -- the founder's own
// measured 846x522 client area) after a session that last used, or simply
// defaulted toward, a bigger preset, and the stale size gets blindly
// reapplied: #app becomes wider/taller than the real viewport, and
// html/body's own `overflow-x:hidden` (style.css) clips whatever doesn't
// fit -- reading exactly like "half the interface, grey on the left." Not
// a window-position bug; a STALE-CSS-SIZE-RESTORED-WITHOUT-VALIDATION bug.
// Fixed here: before reapplying a persisted NAMED preset, measure it
// against window.screen.availWidth/availHeight -- the real, CURRENT
// display this load is running on (dimensions only, never
// screenX/screenY/moveTo -- his own six-monitor layout, four of six at
// negative X, is untouched by this check) -- and only reapply it if it
// actually fits with a small margin; otherwise fall back to 'fit', which
// recomputes its own size FRESH from the CURRENT screen every time it's
// applied (see applyWindowPreset('fit') above) and so can never go stale
// the same way, and say why, loudly, in the console rather than silently
// substituting a different size with no trace of why.
const WINDOW_PRESET_FIT_MARGIN = 1.02; // ~2% tolerance for rounding/OS chrome -- meaningfully over this is the actual bug, not a hairline miss

function namedWindowPresetPixelSize(name) {
  const preset = WINDOW_PRESETS[name];
  if (!preset) return null; // 'fit' has no fixed size to check -- always safe by construction
  const parsePx = (v) => (v.endsWith('px') ? Number(v.slice(0, -2)) : null); // 'fill' uses vw/vh -- always relative to the CURRENT viewport, always safe
  const w = parsePx(preset.width);
  const h = parsePx(preset.height);
  return (w != null && h != null) ? { w, h } : null;
}

function windowPresetFitsCurrentDisplay(name) {
  const size = namedWindowPresetPixelSize(name);
  if (!size) return true; // 'fill'/'fit' are always relative to the CURRENT display -- nothing that can go stale
  const availW = window.screen.availWidth || window.innerWidth;
  const availH = window.screen.availHeight || window.innerHeight;
  return size.w <= availW * WINDOW_PRESET_FIT_MARGIN && size.h <= availH * WINDOW_PRESET_FIT_MARGIN;
}

// FIELD-TEST-BUILD-003 Step 1 -- MEASURED BUG, THE DEFECT: every window
// preset above only ever resizes #app via CSS (width/height on a div) --
// the BROWSER WINDOW and its own chrome (tab bar, address bar, OS window
// border) never go away. That is exactly the founder's own "three nested
// rectangles" complaint -- monitor, then the browser/app window, then a
// box inside it that's still not the whole screen -- and no CSS size can
// ever fix it, because CSS only ever resizes a box INSIDE the page; it
// cannot remove the page's own chrome. The real Fullscreen API is a
// different mechanism entirely: the browser itself takes over the whole
// physical display for one specific element (and everything inside it),
// with no browser chrome at all -- "like when you go full screen mode on
// a game," his own words. Targets #courtroom-screen (not just the bare
// canvas) so the camera/window-preset controls AND the WPM/volume/motion
// sliders, Begin Proceeding, Play/Pause, Finish & Score, transcript and
// captions -- everything a session actually needs -- all stay inside the
// fullscreened element and stay reachable, per this job's own instruction
// that a fullscreen he cannot escape or adjust is worse than none. Escape
// exits browser fullscreen natively, with no code needed here for that
// half; the button below explicitly also listens for fullscreenchange so
// its own label/state stays correct if the founder exits via Escape (or
// any other browser-native way) rather than by clicking it again.
function initFullscreen() {
  const btn = el('fullscreen-btn');
  const target = el('courtroom-screen');
  if (!btn || !target) return;
  if (!target.requestFullscreen && !target.webkitRequestFullscreen) {
    btn.disabled = true;
    btn.title = 'Full screen is not supported in this browser.';
    return;
  }
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const updateLabel = () => {
    btn.textContent = isFs() ? 'EXIT FULLSCREEN (Esc)' : 'FULLSCREEN';
    btn.setAttribute('aria-pressed', String(isFs()));
  };
  btn.addEventListener('click', async () => {
    try {
      if (isFs()) {
        await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
      } else {
        await (target.requestFullscreen ? target.requestFullscreen() : target.webkitRequestFullscreen());
      }
    } catch (err) {
      console.warn('[courtsim] fullscreen request failed:', err);
    }
  });
  document.addEventListener('fullscreenchange', updateLabel);
  document.addEventListener('webkitfullscreenchange', updateLabel);
  updateLabel();
}

function initWindowPresets() {
  for (const btn of document.querySelectorAll('.win-preset-btn')) {
    btn.addEventListener('click', () => applyWindowPreset(btn.dataset.winpreset));
  }
  const persisted = localStorage.getItem('courtsim_window_preset');
  if (!persisted || !(WINDOW_PRESETS[persisted] || persisted === 'fit')) return;
  if (windowPresetFitsCurrentDisplay(persisted)) {
    applyWindowPreset(persisted);
    return;
  }
  const size = namedWindowPresetPixelSize(persisted);
  console.warn(
    `[courtsim] WINDOW-GEOMETRY-002: refused to restore persisted window preset ${JSON.stringify(persisted)}` +
    `${size ? ` (${size.w}x${size.h}px)` : ''} on reload -- it does not fit the CURRENT display ` +
    `(window.screen.availWidth x availHeight = ${window.screen.availWidth}x${window.screen.availHeight}). ` +
    `Falling back to 'fit' (computed fresh from this display) instead of blindly applying stale geometry -- ` +
    `this is the founder's own "half off-screen, grey on the left" field-test report.`
  );
  applyWindowPreset('fit');
}

// PLAY-PAUSE-001 -- one button, two icon states, pausing/resuming THREE
// things on the SAME shared clock with no drift: audio playback, capture
// (mic polling), and the lip-sync weight track.
//
// The "shared clock, no drift" property comes from the Web Audio API's own
// spec behavior, not from anything invented here: AudioContext.suspend()
// freezes .currentTime at the exact instant of suspension, and resume()
// continues counting from that SAME frozen value -- it never jumps ahead
// to reflect wall-clock time that passed while suspended. speakLoop()'s
// playSynthesizedWithLipsync() (below) drives BOTH audio playback (the
// AudioBufferSourceNode, which itself pauses when its context suspends)
// AND the lip-sync tick's own position read (`audioCtx.currentTime -
// startTime`) off this one context -- so suspending state.audioCtx alone
// freezes audio and lip-sync together, correctly, with no separate
// bookkeeping needed for either. Capture is a SEPARATE AudioContext (see
// asr.js's own VoiceInputSource -- a dedicated 16kHz context, not the same
// one TTS plays through) and is paused the same way, independently, via
// VoiceInputSource.pause()/resume() added for this job.
const PLAY_ICON = '▶'; // ▶
const PAUSE_ICON = '⏸'; // ⏸

function updatePlayPauseUi() {
  const btn = el('play-pause-btn');
  btn.textContent = state.paused ? PLAY_ICON : PAUSE_ICON;
  btn.setAttribute('aria-pressed', String(state.paused));
  btn.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
}

async function pauseSession() {
  if (state.paused) return;
  state.paused = true;
  if (state.audioCtx && state.audioCtx.state === 'running') {
    await state.audioCtx.suspend().catch(() => {});
  }
  if (state.input && typeof state.input.pause === 'function') {
    await state.input.pause().catch(() => {});
  }
  // Stop polling while paused -- nothing new can arrive from a suspended
  // capture context anyway, and this keeps the DOM (mic meter, transcript)
  // from flickering against stale data while paused.
  if (state.micTimer) { clearInterval(state.micTimer); state.micTimer = null; }
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  updatePlayPauseUi();
}

async function resumeSession() {
  if (!state.paused) return;
  state.paused = false;
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    await state.audioCtx.resume().catch(() => {});
  }
  if (state.input && typeof state.input.resume === 'function') {
    await state.input.resume().catch(() => {});
  }
  if (!state.micTimer) state.micTimer = setInterval(onMicTick, 100);
  if (!state.pollTimer) state.pollTimer = setInterval(onPollTick, 300);
  updatePlayPauseUi();
}

function initPlayPause() {
  el('play-pause-btn').addEventListener('click', () => {
    if (state.paused) resumeSession(); else pauseSession();
  });
}

el('refresh-devices-btn').addEventListener('click', refreshDevices);

el('start-session-btn').addEventListener('click', async () => {
  // VENUES-001 -- state.scene is constructed once, eagerly, at boot()
  // (default 'courtroom_a'), before the founder has ever touched this
  // picker -- a venue change only takes effect via a real rebuild, read
  // here at the moment a session actually starts, same as the Godot
  // build's own _rebuild_courtroom_venue_if_changed().
  const chosenVenueKey = el('venue-picker').value || VENUES[0].key;
  if (state.scene.venue.key !== chosenVenueKey) {
    await state.scene.rebuildVenue(chosenVenueKey);
  }

  const deviceId = el('device-picker').value || null;
  state.selectedDeviceId = deviceId;
  const proceeding = state.selectedProceeding;

  const labelsInOrder = proceeding.utterances.map((u) => u.speaker);
  state.voiceCast = assignVoices(labelsInOrder);

  // MEASURED BUG, fixed here: speakLoop() used to create a BRAND NEW
  // AudioContext for every single utterance (`state.input?._audioCtx ||
  // new AudioContext()`, with `state.input._audioCtx` almost always
  // undefined since the mic's own AudioContext is a separate, dedicated
  // 16kHz context -- see asr.js). Besides being wasteful, a fresh
  // AudioContext created many `await`s and seconds removed from the
  // click that triggered it risks Chrome's autoplay-gesture policy
  // treating it as NOT gesture-attached and starting it 'suspended' --
  // which plays no audible sound at all, silently, with no error thrown
  // (source.start() and onended both still "succeed" on a suspended
  // context). One context, created HERE inside the real click handler
  // and explicitly resumed, removes that risk entirely and is reused for
  // every utterance this session.
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioCtx.state === 'suspended') {
    await state.audioCtx.resume().catch(() => {});
  }
  // SPEED-VOLUME-001 -- a GainNode sits between every TTS voice and the
  // speakers so the volume slider affects ONLY this program's own audio,
  // never the system/OS volume (the founder's own complaint: turning up
  // the TV to compensate then leaves the TV itself too loud for
  // everything else). Created once, reused for the whole session.
  if (!state.gainNode) {
    state.gainNode = state.audioCtx.createGain();
    state.gainNode.connect(state.audioCtx.destination);
  }
  state.gainNode.gain.value = state.volume / 100;

  state.input = new VoiceInputSource();
  const startStatus = await state.input.start(deviceId);

  state.finalTextParts = [];
  state.wordConfidences = {};
  state.currentIndex = 0;
  state.proceedingStarted = false;
  el('transcript-box').textContent = '';
  el('partial-label').textContent = '';
  el('progress-label').textContent = `Utterance 0 / ${proceeding.utterances.length}`;
  el('begin-proceeding-btn').disabled = false;
  el('begin-proceeding-btn').textContent = "Begin Proceeding (I'm ready)";
  state.paused = false;
  el('play-pause-btn').disabled = true;
  updatePlayPauseUi();
  el('caption').textContent = startStatus.error
    ? 'Microphone failed to open -- see status below.'
    : "Microphone is armed. Speak a few words to check the level meter below, then press Begin Proceeding whenever you're ready -- nothing starts until you do.";
  state.scene.clearActiveSpeaker();

  const banner = el('mic-warning-banner');
  if (startStatus.error) {
    el('mic-status').textContent = `Microphone: FAILED TO OPEN (${startStatus.error})`;
    // Rule 52: a silent/small failure here is exactly what produced the
    // founder's 0.0% / 0 matched words result -- this is deliberately loud,
    // not tucked into the caption line, and states the CONSEQUENCE plainly.
    banner.textContent = `Your microphone did not open (${startStatus.error}). `
      + 'Nothing you say will be captured, and this take will score 0%. '
      + 'You can still watch/listen, or reload the page and click "Allow" '
      + 'when Chrome asks for microphone permission.';
    banner.classList.remove('hidden');
  } else {
    el('mic-status').textContent = `Microphone: ${startStatus.device_name}`;
    banner.classList.add('hidden');
  }

  showScreen('courtroom');
  state.scene.handleBecameVisible(); // MEASURED BUG fix -- see scene.js; the canvas was sized while hidden
  await refreshDevices(); // labels are real now that permission was granted

  if (state.micTimer) clearInterval(state.micTimer);
  state.micTimer = setInterval(onMicTick, 100);
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(onPollTick, 300);
});

function onMicTick() {
  if (!state.input) return;
  const status = state.input.getStatus();
  const frac = Math.max(0, Math.min(1, (status.level_db + 50) / 40));
  el('mic-meter-fill').style.width = `${frac * 100}%`;
  el('mic-meter-fill').style.background =
    status.error ? 'var(--error)' : (status.vad_state === 'SPEECH' ? 'var(--accent)' : '#6a6a75');
  if (status.error) {
    el('mic-status').textContent = `Microphone: ERROR -- ${status.error}`;
  } else if (status.device_name) {
    el('mic-status').textContent = `Microphone: ${status.device_name}  [${status.state}]`;
  }
}

function onPollTick() {
  if (!state.input) return;
  const events = state.input.poll();
  let sawFinal = false;
  for (const e of events) {
    if (e.is_final) {
      if (e.text) state.finalTextParts.push(e.text);
      Object.assign(state.wordConfidences, e.word_confidences || {});
      sawFinal = true;
    } else {
      el('partial-label').textContent = e.text ? `hearing now: ${e.text}` : '';
    }
  }
  if (sawFinal) {
    el('transcript-box').textContent = state.finalTextParts.join(' ');
    el('transcript-box').scrollTop = el('transcript-box').scrollHeight;
  }
}

el('begin-proceeding-btn').addEventListener('click', async () => {
  if (state.proceedingStarted) return;
  state.proceedingStarted = true;
  el('begin-proceeding-btn').disabled = true;
  el('play-pause-btn').disabled = false;
  await speakLoop();
});

// SPEED-VOLUME-001 STEP 4 -- MEASURED: reports/WEB_RESEARCH_001.md's
// original "~8-10s per short line, slower than realtime" figure was
// measured against the BROKEN q8 model (STEP 2's own bug). After the
// STEP 2 fix, the same 23-word line now generates in 0.63-3.28s
// (requested 250 WPM -> 626ms generating 5.7s of audio; requested 100
// WPM -> 3278ms generating 13.98s of audio) -- both FASTER than
// realtime, not slower. Generation time scales with OUTPUT DURATION
// (more audio to render costs more inference time), not with the
// requested WPM directly -- confirming this is fundamentally a
// synthesis SPEED (inference-latency) characteristic of the model, not
// something the WPM parameter itself controls, even though the STEP 2
// fix substantially reduced its practical impact versus the old broken
// build. The look-ahead buffer below is kept regardless, as a real,
// additional safeguard (longer lines, a slower machine, or WASM instead
// of WebGPU could still generate slower than they play): the NEXT
// utterance starts synthesizing the moment the CURRENT one begins
// playing (queued through tts.js's own serialization, never truly
// concurrent -- kokoro's onnx session has the same one-call-at-a-time
// constraint already measured for Whisper's session in asr.js), so by
// the time playback catches up, the next line is often already ready.
// This can only look one line ahead (not further) so that a mid-session
// WPM change is reflected no later than the line after the one already
// in flight when it changed -- exactly the "no later than the next
// utterance" requirement, honestly bounded by the fact that audio already
// being generated cannot be un-generated.
function synthesizeUtterance(utterances, index) {
  const u = utterances[index];
  const profile = state.voiceCast[u.speaker] || { voice: 'am_puck', speed: 1.0 };
  const speed = wpmToSpeed(state.wpm, profile.speed);
  return state.tts.synthesize(u.text, profile.voice, speed);
}

// LIPSYNC-INTEGRATION-001 -- PRE-COMPUTED, same as the desktop build: the
// weight track is computed once the audio exists, before it plays, never
// streamed. Chained onto the SAME look-ahead-by-one buffer speakLoop()
// already uses for TTS itself (STEP 4 of SPEED-VOLUME-001), so by the time
// playback reaches an utterance its lip-sync track is very often already
// sitting ready, same as its audio. Failures (WebGPU unsupported, model
// load error) degrade to a still mouth for that utterance, never a thrown
// error that stops the proceeding -- logged loudly, not silently.
function computeLipsyncForSynth(synthPromise, speaker) {
  if (!lipsyncSupported()) return Promise.resolve(null);
  return synthPromise.then((synth) => computeWeightTrack(synth.audio, synth.sampling_rate))
    .catch((err) => {
      console.error(`[lipsync] failed for ${speaker}:`, err);
      return null;
    });
}

async function speakLoop() {
  const utterances = state.selectedProceeding.utterances;
  state.playing = true;
  let nextPromise = synthesizeUtterance(utterances, 0);
  let nextLipsyncPromise = computeLipsyncForSynth(nextPromise, utterances[0]?.speaker);

  for (state.currentIndex = 0; state.currentIndex < utterances.length; state.currentIndex++) {
    if (!state.playing) return;
    const idx = state.currentIndex;
    const u = utterances[idx];
    const seatKey = seatKeyForSpeaker(u.speaker);
    state.scene.setActiveSpeaker(seatKey);
    if (state.cameraController) state.cameraController.followSeat(seatKey);
    state.scene.handleStandingCue(u.text);
    el('progress-label').textContent = `Utterance ${idx + 1} / ${utterances.length}`;

    const thisPromise = nextPromise;
    const thisLipsyncPromise = nextLipsyncPromise;
    // Kick off the NEXT line's synthesis (and its lip-sync track) now, in
    // parallel with awaiting (and then playing) this one -- the
    // look-ahead-by-one buffer, extended to cover lip-sync too.
    nextPromise = (idx + 1 < utterances.length) ? synthesizeUtterance(utterances, idx + 1) : null;
    nextLipsyncPromise = nextPromise ? computeLipsyncForSynth(nextPromise, utterances[idx + 1]?.speaker) : null;

    let ready = false;
    thisPromise.then(() => { ready = true; });
    await Promise.resolve(); // let an already-finished promise settle before we decide what to show
    el('caption').textContent = ready
      ? `${u.speaker} is speaking...`
      : `${u.speaker} is speaking... (preparing audio)`;
    const synth = await thisPromise;
    const lipsyncTrack = await thisLipsyncPromise;
    el('caption').textContent = `${u.speaker} is speaking...`;
    await playSynthesizedWithLipsync(state.audioCtx, synth, state.gainNode, state.scene, seatKey, lipsyncTrack);
  }
  state.scene.clearActiveSpeaker();
  el('caption').textContent = '(end of proceeding -- press Finish & Score when ready)';
}

// LIPSYNC-INTEGRATION-001 STEP 3 -- "drive the weight track from the
// player's own playback position, not from a separate timer": here that IS
// audioCtx.currentTime, read directly every requestAnimationFrame tick, no
// polling or estimation involved at all (unlike the desktop build, which
// has to cross an HTTP boundary to reach its real player clock) -- this is
// the actual, current position of the actual AudioBufferSourceNode that is
// actually playing, not a separately-invented clock.
function interpolateLipsyncWeights(track, t) {
  const times = track.frame_times_s;
  const n = times.length;
  if (n === 0) return null;
  if (n === 1 || t <= times[0]) return lipsyncWeightsAtIndex(track, 0);
  if (t >= times[n - 1]) return lipsyncWeightsAtIndex(track, n - 1);
  for (let i = 0; i < n - 1; i++) {
    if (t >= times[i] && t <= times[i + 1]) {
      const frac = (t - times[i]) / Math.max(0.0001, times[i + 1] - times[i]);
      const w0 = track.weights[i];
      const w1 = track.weights[i + 1];
      const out = {};
      for (let p = 0; p < track.pose_names.length; p++) {
        out[track.pose_names[p]] = w0[p] + (w1[p] - w0[p]) * frac;
      }
      return out;
    }
  }
  return lipsyncWeightsAtIndex(track, n - 1);
}

function lipsyncWeightsAtIndex(track, i) {
  const out = {};
  const w = track.weights[i];
  for (let p = 0; p < track.pose_names.length; p++) out[track.pose_names[p]] = w[p];
  return out;
}

// MEASURED BUG, fixed here: requestAnimationFrame is throttled to near-zero
// by the browser whenever the tab is not the visible/foreground one
// (document.hidden) -- reproduced directly running this job's own
// automated browser test (document.hidden was true there, and the mouth
// never moved despite a real, correct weight track existing and being
// fetched every tick). A trainee who alt-tabs or runs the app on a second
// monitor without focus would hit the same silent freeze in real use, not
// just in a test harness. setInterval is not immune to background
// throttling either (browsers clamp it too), but does not fully suspend
// the way rAF can, and gives an explicit, known tick rate to reason about
// -- the same design already used for mic_timer/poll_timer in this same
// file, and the same choice the desktop build's own lipsync_apply_timer
// makes (a plain Timer, not a render-frame callback).
const LIPSYNC_TICK_MS = 33; // ~30Hz, matches the desktop build's own cadence

function playSynthesizedWithLipsync(audioCtx, synthResult, destinationNode, scene, seatKey, lipsyncTrack) {
  return new Promise((resolve) => {
    const buffer = audioCtx.createBuffer(1, synthResult.audio.length, synthResult.sampling_rate);
    buffer.copyToChannel(Float32Array.from(synthResult.audio), 0);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(destinationNode || audioCtx.destination);

    const startTime = audioCtx.currentTime;
    let intervalId = null;
    const sampleLog = [];
    function tick() {
      const pos = audioCtx.currentTime - startTime;
      const w = interpolateLipsyncWeights(lipsyncTrack, pos);
      if (w) {
        const applied = scene.applyArkitWeights(seatKey, w);
        if (sampleLog.length < 400) sampleLog.push({ t: pos, jawOpen: 'jawOpen' in applied ? applied.jawOpen : -1 });
      }
    }
    src.onended = () => {
      if (intervalId) clearInterval(intervalId);
      if (lipsyncTrack) logLipsyncSample(seatKey, sampleLog);
      resolve();
    };
    src.start();
    if (lipsyncTrack) intervalId = setInterval(tick, LIPSYNC_TICK_MS);
  });
}

// Rule 129/130 proof for the web build -- the actual per-frame jawOpen
// value this build applied to the actual mesh, printed verbatim to the
// console, same discipline and same sampling stride as the desktop
// build's own _print_lipsync_sample_log().
function logLipsyncSample(seatKey, sampleLog) {
  if (!sampleLog.length) return;
  const stride = Math.max(1, Math.floor(sampleLog.length / 12));
  console.log(`[courtsim] lipsync_applied_sample seat=${seatKey} total_ticks=${sampleLog.length} shown_every=${stride}`);
  for (let i = 0; i < sampleLog.length; i += stride) {
    const e = sampleLog[i];
    console.log(`[courtsim] lipsync_frame: t=${e.t.toFixed(3)} seat=${seatKey} jawOpen=${e.jawOpen.toFixed(4)}`);
  }
}

el('finish-btn').addEventListener('click', async () => {
  // PLAY-PAUSE-001 -- never leave the shared AudioContext (or the mic's
  // own) sitting suspended once the courtroom screen is being left; force
  // a resume first so nothing carries a stuck-suspended context into the
  // results screen or a later session.
  if (state.paused) await resumeSession();
  state.playing = false;
  if (state.micTimer) { clearInterval(state.micTimer); state.micTimer = null; }
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  el('finish-btn').disabled = true;
  el('play-pause-btn').disabled = true;

  if (state.input) {
    const finalEvents = await state.input.stop();
    // Drain any trailing final event produced by stop()'s own flush.
    const events = state.input.poll();
    for (const e of events) {
      if (e.is_final && e.text) state.finalTextParts.push(e.text);
    }
  }

  const referenceText = state.selectedProceeding.utterances.map((u) => u.text).join(' ');
  const asrText = state.finalTextParts.join(' ');
  const result = state.engine.scoreTake(referenceText, asrText, state.wordConfidences);
  if (result.outcome === 'SCORED') {
    result.classified_errors = attachUtteranceContext(state.selectedProceeding.utterances, result.classified_errors);
  }
  el('finish-btn').disabled = false;
  showResults(result);
});

function showResults(r) {
  showScreen('results');
  const lines = [];
  lines.push(`Proceeding: ${state.selectedProceeding.title}`);
  lines.push(`Outcome: ${r.outcome}`);
  if (r.outcome === 'REFUSED') {
    lines.push('');
    lines.push('The scorer refused to grade this take:');
    lines.push(r.refusal_reason || '');
    lines.push('');
    lines.push('(This is correct behavior, not an error -- G3: below its confidence');
    lines.push('threshold the scorer refuses rather than guessing a grade.)');
  } else {
    lines.push(`Raw accuracy: ${r.raw_accuracy_pct.toFixed(1)}%`);
    lines.push(`Trainee accuracy (heuristic recognizer exclusions): ${r.trainee_accuracy_pct.toFixed(1)}%`);
    lines.push('Attribution is a text-based heuristic, not proof of a recognizer fault. Added words may not reduce the matched/reference percentage.');
    lines.push(`Matched words: ${r.matched} / ${r.reference_words}`);
    lines.push(`Recognizer-attributed misses: ${r.recognizer_attributed_count}    Trainee-attributed misses: ${r.trainee_attributed_count}`);
    lines.push('');
    lines.push('--------------------------------------------------------------');
    lines.push('Errors, in context (a score is a number; this is WHERE):');
    lines.push('--------------------------------------------------------------');
    const errors = r.classified_errors || [];
    if (errors.length === 0) {
      lines.push('  (none -- a clean take)');
    }
    for (const e of errors) {
      const cls = e.error_class.toUpperCase();
      lines.push('');
      if (e.attributed_to === 'RECOGNIZER') {
        lines.push(`[${cls}] -- THIS WAS OUR SYSTEM'S MISTAKE, NOT YOURS.`);
        lines.push('   The heuristic flagged a possible recognizer error; it is excluded from trainee accuracy, but should be checked against the recording.');
      } else {
        lines.push(`[${cls}] -- yours to review.`);
      }
      if (cls === 'ADDED') {
        lines.push(`   You wrote an extra word that isn't in the source: "${e.asr_word}"`);
      } else if (cls === 'DROPPED') {
        lines.push(`   Source word not found in your transcript: "${e.source_word}"`);
      } else {
        lines.push(`   Source said "${e.source_word}" -- you wrote "${e.asr_word}"`);
      }
      if (e.utterance_text) {
        lines.push(`   Line: [${e.speaker}] "${e.utterance_text}"`);
      } else {
        lines.push('   (no source line reference found for this word)');
      }
    }
  }
  el('results-box').textContent = lines.join('\n');
}

el('play-again-btn').addEventListener('click', () => {
  state.selectedProceeding = null;
  el('start-session-btn').disabled = true;
  [...el('proceedings-list').children].forEach((c) => c.classList.remove('selected'));
  showScreen('selection');
});

boot().catch((err) => {
  console.error(err);
  setLoadingProgress(0, 'CourtSim failed to start.', String(err && err.stack ? err.stack : err));
});

// TEST-ONLY (Rule 120 / STEP 4 verification hook), not part of any
// player-facing path and never referenced by the UI above: lets an
// automated/headless verification run exercise the real engine, scene,
// and ASR pipeline (including VoiceInputSource.startWithSyntheticSource,
// see asr.js) without a live human or microphone permission. Mirrors the
// desktop build's own accepted precedent
// (courtsim/bridge/server.py's /test/inject_trainee_text).
window.__courtsimTest = {
  state, VoiceInputSource, EngineBridge, attachUtteranceContext,
  playSynthesized, showScreen, showResults, el, wpmToSpeed,
  // LIPSYNC-INTEGRATION-001 -- for tests/test_e2e_web.py's own real morph-
  // target-influence assertions (Step 3): computeWeightTrack/lipsyncSupported
  // let a test drive the real pipeline directly; scene.applyArkitWeights/
  // getArkitShapeValue (on state.scene) read back the real mesh.
  computeWeightTrack, lipsyncSupported, interpolateLipsyncWeights,
  // PLAY-PAUSE-001 / FIELD-TEST-BUILD-001 (web lane) -- pauseSession/
  // resumeSession exposed directly for tests that want to call them
  // without going through a real DOM click (the real UI path is still
  // exercised too -- see tests/test_e2e_web.py, which clicks the actual
  // #play-pause-btn, this hook exists for any assertion that wants direct
  // access to the promise chain instead of polling for a DOM effect).
  pauseSession, resumeSession, updatePlayPauseUi,
  // FIELD-TEST-BUILD-002 -- WINDOW-GEOMETRY-002 / MOTION-SPEED-001 / real
  // test hooks for a headless CDP run to drive and read back, matching the
  // rest of this block's own "real production functions, not test-only
  // bypasses" discipline.
  applyWindowPreset, initWindowPresets, windowPresetFitsCurrentDisplay,
  namedWindowPresetPixelSize, WINDOW_PRESETS,
};
