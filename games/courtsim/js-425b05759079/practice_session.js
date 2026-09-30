import { seatKeyForSpeaker } from './scene.js';
import {
  assignVoices, buildCounselSeating, castSexNeeds, roleForLabel, Role,
} from './voice_cast.js';
import {
  TtsEngine, classifyTurn, prosodyForTurn, TurnType,
  FALLBACK_GAP_MS, playGavelBang, deliverableWpm, CONTENT_SAFE_WPM_MAX,
} from './tts.js';
import { computeWeightTrack, isSupported as lipsyncSupported } from './lipsync.js';
import { setProceeding as setTitleProceeding, titleFor } from './speaker_titles.js';
import { parseCaseText } from './case_text.js';

export const CASE_FILES = [
  'case_01_contract_dispute',
  'case_02_traffic_hearing',
  'case_03_small_claims',
  'case_04_expert_witness',
  'case_05_deposition',
];

const caseUrl = (id) => new URL(`./cases/${id}.txt`, import.meta.url).href;

const LIPSYNC_TICK_MS = 33;
const LOOKAHEAD_DEPTH = 3;
const SYNTH_TIMEOUT_MS = 45000;
const LIPSYNC_WAIT_MS = 1200;

function titleCase(id) {
  return id.replace(/_/g, ' ').replace(/^case (\d+)/, 'Case $1 —');
}

const _cursors = new WeakMap();
const _out = {};
function weightsAt(track, t) {
  if (!track) return null;
  const times = track.frame_times_s;
  const n = times.length;
  if (!n) return null;
  const at = (i) => {
    const w = track.weights[i];
    const names = track.pose_names;
    for (let p = 0; p < names.length; p++) _out[names[p]] = w[p];
    return _out;
  };
  if (n === 1 || t <= times[0]) return at(0);
  if (t >= times[n - 1]) return at(n - 1);
  let cursor = _cursors.get(track);
  if (cursor === undefined || cursor >= n - 1 || times[cursor] > t) cursor = 0;
  let i = cursor;
  while (i < n - 1 && t > times[i + 1]) i++;
  _cursors.set(track, i);
  const frac = (t - times[i]) / Math.max(0.0001, times[i + 1] - times[i]);
  const w0 = track.weights[i];
  const w1 = track.weights[i + 1];
  const names = track.pose_names;
  for (let p = 0; p < names.length; p++) _out[names[p]] = w0[p] + (w1[p] - w0[p]) * frac;
  return _out;
}

export class PracticeSession {
  constructor({ scene, camera, gain, audioCtx, ui }) {
    this.scene = scene;
    this.camera = camera;
    this.audioCtx = audioCtx;
    this.gain = gain;
    this.ui = ui || {};
    this.tts = new TtsEngine();
    this.ttsReady = false;
    this.cases = [];
    this.playing = false;
    this.paused = false;
    this.runToken = 0;
    this.currentIndex = -1;
    this.liveSources = new Set();
    this.tickHandle = null;
    this.voiceCast = {};
    this.counselSeats = {};
    this.turnTypes = [];
    this.turnPlans = [];
    this.wpm = 150;
    this.startedAtMs = null;
    this.silentMs = 0;
    this._queue = [];
  }

  say(msg) { if (typeof this.ui.status === 'function') this.ui.status(msg); }

  async loadCases(onProgress) {
    const out = [];
    const problems = [];
    for (const id of CASE_FILES) {
      onProgress?.(`reading ${titleCase(id)}`);
      let raw;
      try {
        const resp = await fetch(caseUrl(id));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        raw = await resp.text();
      } catch (err) {
        problems.push(`${id}: could not be fetched (${err.message})`);
        continue;
      }
      try {
        const parsed = parseCaseText(`${id}.txt`, raw);
        const labels = parsed.utterances.map((u) => u.speaker);
        out.push({
          id,
          title: titleCase(id),
          utterances: parsed.utterances,
          labels,
          speakerCount: new Set(labels).size,
        });
      } catch (err) {
        problems.push(`${id}: ${err.message}`);
      }
    }
    this.cases = out;
    this.caseProblems = problems;
    if (!out.length) throw new Error('none of the bundled cases could be read');
    return { cases: out, problems };
  }

  async initVoice(onProgress) {
    if (this.ttsReady) return;
    await this.tts.init(onProgress);
    this.ttsReady = true;
  }

  async castFor(proceeding, venueKey) {
    const labels = proceeding.labels;
    this.voiceCast = assignVoices(labels, {});
    this.counselSeats = buildCounselSeating(labels);
    let needsRebuild = false;
    if (this.scene && typeof this.scene.setCastRequirements === 'function') {
      try {
        const plan = this.scene.setCastRequirements(castSexNeeds(this.counselSeats, null), venueKey);
        needsRebuild = !!(plan && plan.needsRebuild);
      } catch (err) {
        console.warn('[practice] setCastRequirements threw; the default cast will be used:', err);
      }
    }
    if ((this.scene.venue && this.scene.venue.key !== venueKey) || needsRebuild) {
      await this.scene.rebuildVenue(venueKey);
    }
    try { setTitleProceeding(proceeding.id, labels); } catch (err) { /* plates are cosmetic */ }
    if (typeof this.scene.setProceedingCast === 'function') {
      try {
        this.scene.setProceedingCast(this.counselSeats, {});
      } catch (err) {
        console.warn('[practice] setProceedingCast threw; the nameplates will read '
          + 'COUNSEL TABLE A / B. Cosmetic only:', err);
      }
    }
    this.turnTypes = this._buildTurnTypes(proceeding.utterances);
    this.turnPlans = [];
  }

  _buildTurnTypes(utterances) {
    const types = new Array(utterances.length);
    for (let i = 0; i < utterances.length; i++) {
      const u = utterances[i];
      const prev = i > 0 ? utterances[i - 1] : null;
      const role = (this.voiceCast[u.speaker] || {}).role || 'UNKNOWN';
      const sameSpeaker = prev ? prev.speaker === u.speaker : false;
      types[i] = classifyTurn(u.text, role, prev ? prev.text : null,
        i > 0 ? types[i - 1] : null, sameSpeaker);
    }
    return types;
  }

  _planFor(utterances, index) {
    const u = utterances[index];
    const profile = this.voiceCast[u.speaker] || { voice: 'am_puck', speed: 1.0, role: 'UNKNOWN' };
    const plan = prosodyForTurn({
      index,
      text: u.text,
      role: profile.role,
      wpm: this.wpm,
      roleBias: profile.speed,
      turnType: (this.turnTypes && this.turnTypes[index]) || TurnType.STATEMENT,
      prev: index > 0 ? this.turnPlans[index - 1] : null,
    });
    this.turnPlans[index] = plan;
    return plan;
  }

  seatKeyFor(speaker) {
    const override = this.counselSeats && this.counselSeats[speaker];
    if (override) return override;
    if (roleForLabel(String(speaker || '')) === Role.COUNSEL_NAMED) {
      return 'counsel_a';
    }
    return seatKeyForSpeaker(speaker);
  }

  _prepare(utterances, index) {
    const u = utterances[index];
    const profile = this.voiceCast[u.speaker] || { voice: 'am_puck', speed: 1.0 };
    const plan = this._planFor(utterances, index);
    const promise = this.tts.synthesize(u.text, profile.voice, plan.synthSpeed);
    const lipsync = lipsyncSupported()
      ? promise.then((s) => computeWeightTrack(s.audio, s.sampling_rate))
        .catch((err) => { console.error('[practice/lipsync] track failed:', err); return null; })
      : Promise.resolve(null);
    return { index, promise, lipsync, plan };
  }

  _play(synth, plan, seatKey, track) {
    return new Promise((resolve) => {
      const ctx = this.audioCtx;
      const buffer = ctx.createBuffer(1, synth.audio.length, synth.sampling_rate);
      buffer.copyToChannel(synth.audio, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const rate = (plan && Number.isFinite(plan.playbackRate) && plan.playbackRate > 0)
        ? plan.playbackRate : 1;
      src.playbackRate.value = rate;
      const rawDur = buffer.duration;
      if (plan && Number.isFinite(plan.playbackRateEnd) && plan.playbackRateEnd > 0
          && rawDur > 0.4) {
        try {
          const t0 = ctx.currentTime;
          src.playbackRate.setValueAtTime(rate, t0);
          src.playbackRate.linearRampToValueAtTime(plan.playbackRateEnd,
            t0 + (rawDur / rate) * 0.98);
        } catch (err) { /* a flat line is better than no line */ }
      }
      let node = this.gain;
      let perLine = null;
      if (plan && Number.isFinite(plan.gain) && plan.gain > 0) {
        try {
          perLine = ctx.createGain();
          perLine.gain.value = plan.gain;
          perLine.connect(this.gain);
          node = perLine;
        } catch (err) { node = this.gain; }
      }
      src.connect(node);

      let interval = null;
      let settled = false;
      let lastTickAt = ctx.currentTime;
      let pos = 0;
      const tick = () => {
        const now = ctx.currentTime;
        const dt = Math.max(0, now - lastTickAt);
        lastTickAt = now;
        pos += dt * (src.playbackRate.value || 1);
        const w = weightsAt(track, pos);
        if (w) {
          try { this.scene.applyArkitWeights(seatKey, w); } catch (err) { /* still mouth */ }
        }
      };
      const done = () => {
        if (settled) return;
        settled = true;
        if (interval) clearInterval(interval);
        this.liveSources.delete(src);
        if (perLine) { try { perLine.disconnect(); } catch (err) { /* gone */ } }
        resolve();
      };
      src.addEventListener('ended', done);
      this.liveSources.add(src);
      try {
        src.start();
      } catch (err) {
        console.error('[practice] this line could not start playing; moving on:', err);
        done();
        return;
      }
      if (track) interval = setInterval(tick, LIPSYNC_TICK_MS);
    });
  }

  async run(proceeding, { wpm, onLine, onEnd }) {
    this.wpm = wpm;
    this.playing = true;
    this.paused = false;
    this.runToken += 1;
    const token = this.runToken;
    this.startedAtMs = performance.now();
    this.silentMs = 0;
    const utterances = proceeding.utterances;

    this._queue = [];
    for (let k = 0; k < LOOKAHEAD_DEPTH && k < utterances.length; k++) {
      this._queue.push(this._prepare(utterances, k));
    }

    for (this.currentIndex = 0; this.currentIndex < utterances.length; this.currentIndex++) {
      if (!this.playing || token !== this.runToken) return;
      const idx = this.currentIndex;
      const u = utterances[idx];
      const seatKey = this.seatKeyFor(u.speaker);
      try {
        this.scene.setActiveSpeaker(seatKey, titleFor(u.speaker));
        if (this.camera && typeof this.camera.followSeat === 'function') {
          this.camera.followSeat(seatKey);
        }
        this.scene.handleStandingCue(u.text);
      } catch (err) { /* staging is cosmetic; the line still plays */ }
      onLine?.({ index: idx, total: utterances.length, speaker: titleFor(u.speaker), text: u.text });

      const current = (this._queue.length && this._queue[0].index === idx)
        ? this._queue.shift() : this._prepare(utterances, idx);
      while (this._queue.length < LOOKAHEAD_DEPTH) {
        const next = idx + 1 + this._queue.length;
        if (next >= utterances.length) break;
        this._queue.push(this._prepare(utterances, next));
      }

      let synth = null;
      const waitStart = performance.now();
      try {
        const narrate = setTimeout(() => this.say('preparing the next line…'), 900);
        try {
          synth = await Promise.race([
            current.promise,
            new Promise((_, rej) => setTimeout(
              () => rej(new Error(`synthesis of line ${idx + 1} took longer than `
                + `${SYNTH_TIMEOUT_MS / 1000}s`)), SYNTH_TIMEOUT_MS)),
          ]);
        } finally { clearTimeout(narrate); }
      } catch (err) {
        console.error(`[practice] line ${idx + 1} could not be synthesized:`, err);
        this.say(`line ${idx + 1} could not be produced — skipping it`);
        continue;
      }
      if (!this.playing || token !== this.runToken) return;
      let track = null;
      try {
        track = await Promise.race([
          current.lipsync,
          new Promise((r) => setTimeout(() => r(null), LIPSYNC_WAIT_MS)),
        ]);
      } catch (err) { track = null; }
      if (!this.playing || token !== this.runToken) return;
      this.silentMs += performance.now() - waitStart;
      this.say('in session.');

      await this._play(synth, current.plan, seatKey, track);
      if (!this.playing || token !== this.runToken) return;

      const gap = (current.plan && Number.isFinite(current.plan.gapMs))
        ? current.plan.gapMs : FALLBACK_GAP_MS;
      await new Promise((r) => setTimeout(r, Math.max(0, gap)));
      while (this.paused && this.playing && token === this.runToken) {
        await new Promise((r) => setTimeout(r, 120));
      }
    }
    if (token !== this.runToken) return;
    this.playing = false;
    try { this.scene.clearActiveSpeaker(); } catch (err) { /* nothing to clear */ }
    onEnd?.({
      reason: 'finished',
      elapsedMs: performance.now() - this.startedAtMs,
      silentMs: this.silentMs,
    });
  }

  stop(reason = 'stopped') {
    this.playing = false;
    this.paused = false;
    this.runToken += 1;
    for (const src of this.liveSources) {
      try { src.stop(); } catch (err) { /* already ended */ }
    }
    this.liveSources.clear();
    this._queue = [];
    try { this.scene.clearActiveSpeaker(); } catch (err) { /* nothing to clear */ }
    return reason;
  }

  setPaused(on) {
    this.paused = !!on;
    if (!this.audioCtx) return;
    try {
      if (on) this.audioCtx.suspend(); else this.audioCtx.resume();
    } catch (err) { /* the loop's own gate still holds */ }
  }

  gavel() {
    try { playGavelBang(this.audioCtx, this.gain, 0, 0.85); } catch (err) { /* silent */ }
  }

  rateNote(wpm) {
    const delivered = Math.round(deliverableWpm(wpm, 1.0));
    const safe = wpm <= CONTENT_SAFE_WPM_MAX;
    return { requested: wpm, delivered, safe, ceiling: CONTENT_SAFE_WPM_MAX };
  }
}
