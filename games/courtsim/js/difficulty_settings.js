// FIELD-TEST-BUILD-001 (web lane) -- the difficulty/settings popup. Every
// control here is a STATIC UI toggle/slider ONLY, per this job's own scope:
// none of them call an LLM, and most are NOT wired into actual gameplay
// behavior yet -- this build has no engine hook for readback frequency,
// overlapping speech, exhibit handling, sidebar conferences, etc. to
// attach to. Building the control now, honestly disclosed as unwired
// where that's true, beats leaving nothing at all; faking the behavior a
// control's own label promises would be worse than not having the control.
// See reports/_WEB_LANE_NOTES.md for the exact wired/unwired breakdown.
//
// All settings persist as ONE JSON object under a single localStorage key
// -- same pattern camera_controller.js's own STORAGE_KEY already
// establishes for this codebase, not a fresh convention per feature.
import { attachPopupChrome } from './popup_chrome.js';

const STORAGE_KEY = 'courtsim_difficulty_settings';

export const DIFFICULTY_DEFAULTS = {
  mode: 'manual', // 'manual' | 'adaptive' | 'both' -- 'adaptive' has NO ENGINE BEHIND IT (see below)
  readbackFrequency: 50,
  overlappingSpeech: false,
  readbackSpecificity: 'last-question', // 'last-question' | 'from-point'
  varySpeechRateBySpeaker: false,
  mumblingTrailingOff: false,
  objectionsOverlapAnswers: false,
  sidebarConferences: false,
  exhibitHandling: false,
  spellingRequests: false,
  similarVoices: false,
  technicalVocabDensity: 0,
  audioRoomEcho: false,
  audioBadSpeakerphone: false,
  audioHvacNoise: false,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DIFFICULTY_DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DIFFICULTY_DEFAULTS, ...parsed };
  } catch (e) {
    return { ...DIFFICULTY_DEFAULTS }; // corrupt/old value -- fall back, never throw
  }
}

function save(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) { /* storage full/unavailable -- state just won't persist, not fatal */ }
}

const el = (id) => document.getElementById(id);

export function initDifficultySettings() {
  const settings = load();
  const popup = el('settings-popup');
  const chrome = attachPopupChrome(popup);

  el('settings-gear-btn').addEventListener('click', () => chrome.open());

  // --- MODE -- prominent, per this job's own instruction ("not buried").
  // 'adaptive' and 'both' are stored and shown as selected exactly like any
  // other option -- nothing here fakes an adaptive behavior; the note
  // below states plainly, in the popup's own UI text, that no engine sits
  // behind it yet, regardless of which mode is currently selected.
  const modeBtns = [...popup.querySelectorAll('.mode-btn')];
  function refreshMode() {
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
  }
  for (const b of modeBtns) {
    b.addEventListener('click', () => {
      settings.mode = b.dataset.mode;
      refreshMode();
      save(settings);
    });
  }
  refreshMode();

  // --- generic ON/OFF toggle-button wiring -- current value always shown
  // as the button's own label text (Rule 129: never a silent default).
  function wireToggle(btnId, key, onLabel, offLabel) {
    const btn = el(btnId);
    function refresh() {
      btn.setAttribute('aria-pressed', String(!!settings[key]));
      btn.textContent = settings[key] ? onLabel : offLabel;
    }
    btn.addEventListener('click', () => {
      settings[key] = !settings[key];
      refresh();
      save(settings);
    });
    refresh();
  }

  wireToggle('overlap-speech-toggle', 'overlappingSpeech', 'On', 'Off');
  wireToggle('vary-rate-toggle', 'varySpeechRateBySpeaker', 'On', 'Off');
  wireToggle('mumbling-toggle', 'mumblingTrailingOff', 'On', 'Off');
  wireToggle('objections-overlap-toggle', 'objectionsOverlapAnswers', 'On', 'Off');
  wireToggle('sidebar-conf-toggle', 'sidebarConferences', 'On', 'Off');
  wireToggle('exhibit-handling-toggle', 'exhibitHandling', 'On', 'Off');
  wireToggle('spelling-requests-toggle', 'spellingRequests', 'On', 'Off');
  wireToggle('similar-voices-toggle', 'similarVoices', 'On', 'Off');
  wireToggle('audio-room-echo-toggle', 'audioRoomEcho', 'Room echo: On', 'Room echo: Off');
  wireToggle('audio-bad-speakerphone-toggle', 'audioBadSpeakerphone', 'Bad speakerphone: On', 'Bad speakerphone: Off');
  wireToggle('audio-hvac-noise-toggle', 'audioHvacNoise', 'HVAC noise: On', 'HVAC noise: Off');

  // --- readback specificity -- a two-option toggle, labeled plainly which
  // option is harder (this job's own explicit instruction).
  const specBtns = [...popup.querySelectorAll('.specificity-btn')];
  function refreshSpec() {
    for (const b of specBtns) b.setAttribute('aria-pressed', String(b.dataset.specificity === settings.readbackSpecificity));
  }
  for (const b of specBtns) {
    b.addEventListener('click', () => {
      settings.readbackSpecificity = b.dataset.specificity;
      refreshSpec();
      save(settings);
    });
  }
  refreshSpec();

  // --- sliders -- same continuous-slider-with-live-readout pattern as
  // main.js's own WPM/volume sliders (SPEED-VOLUME-001), not a new idiom.
  function wireSlider(sliderId, readoutId, key, suffix = '%') {
    const slider = el(sliderId);
    const readout = el(readoutId);
    slider.value = String(settings[key]);
    readout.textContent = `${settings[key]}${suffix}`;
    slider.addEventListener('input', () => {
      settings[key] = Number(slider.value);
      readout.textContent = `${settings[key]}${suffix}`;
      save(settings);
    });
  }
  wireSlider('readback-freq-slider', 'readback-freq-readout', 'readbackFrequency');
  wireSlider('tech-vocab-slider', 'tech-vocab-readout', 'technicalVocabDensity');

  return { settings, popup, chrome, STORAGE_KEY };
}
