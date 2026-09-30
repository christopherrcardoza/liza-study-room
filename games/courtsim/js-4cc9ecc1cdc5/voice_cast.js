
import {
  deliverableWpm, maxDeliverableBias, isContentSafeWpm, CONTENT_SAFE_WPM_MAX,
  TOTAL_RATE_FLOOR,
} from './tts.js';

export const Role = {
  COURT: 'COURT', WITNESS: 'WITNESS', COUNSEL_Q: 'COUNSEL_Q',
  COUNSEL_A: 'COUNSEL_A', COUNSEL_NAMED: 'COUNSEL_NAMED', BAILIFF: 'BAILIFF',
  CLERK: 'CLERK', INTERPRETER: 'INTERPRETER', REPORTER: 'REPORTER', UNKNOWN: 'UNKNOWN',
};

export function roleForLabel(label) {
  const u = label.toUpperCase().trim();
  if (u.startsWith('THE COURT')) return Role.COURT;
  if (u.startsWith('THE WITNESS')) return Role.WITNESS;
  if (u.startsWith('THE CLERK')) return Role.CLERK;
  if (u.startsWith('THE BAILIFF')) return Role.BAILIFF;
  if (u.startsWith('THE INTERPRETER')) return Role.INTERPRETER;
  if (u.startsWith('THE REPORTER')) return Role.REPORTER;
  if (u.startsWith('MR.') || u.startsWith('MS.') || u.startsWith('MRS.') || u.startsWith('DR.')) {
    return Role.COUNSEL_NAMED;
  }
  return Role.UNKNOWN;
}

export function voiceSexForLabel(label) {
  const u = String(label || '').toUpperCase().trim();
  if (u.startsWith('MS.') || u.startsWith('MRS.') || u.startsWith('MISS ')) return 'F';
  if (u.startsWith('MR.')) return 'M';
  return null; // DR., and anything else -- not guessed
}

export const COUNSEL_SEAT_AVATAR_SEX = {
  'Counsel (Q)': 'M',       // counsel_a.glb -- m008_hipoly_81_bones_opacity
  'Counsel (named)': 'F',   // counsel_b.glb -- f014_hipoly_81_bones_opacity
};

export function buildCounselSeating(labelsInOrder) {
  const seats = Object.create(null);
  const chairs = Object.keys(COUNSEL_SEAT_AVATAR_SEX);
  const taken = new Set();
  let overflow = 0;
  const counsel = [];
  const seen = new Set();
  for (const label of labelsInOrder) {
    if (seen.has(label)) continue;
    seen.add(label);
    if (roleForLabel(label) !== Role.COUNSEL_NAMED) continue;
    counsel.push(label);
  }
  for (const label of counsel) {
    const sex = voiceSexForLabel(label);
    if (!sex) continue;
    const chair = chairs.find((c) => COUNSEL_SEAT_AVATAR_SEX[c] === sex && !taken.has(c));
    if (chair) { seats[label] = chair; taken.add(chair); }
  }
  for (const label of counsel) {
    if (seats[label]) continue;
    const chair = chairs.find((c) => !taken.has(c));
    if (chair) { seats[label] = chair; taken.add(chair); }
    else { seats[label] = chairs[overflow % chairs.length]; overflow += 1; }
  }
  return seats;
}

export function castSexNeeds(seatsByLabel, witnessSex) {
  const needs = Object.create(null);
  for (const [label, seat] of Object.entries(seatsByLabel || {})) {
    const sex = voiceSexForLabel(label);
    if (!sex) continue;
    if (needs[seat] === undefined) needs[seat] = sex;
  }
  if (witnessSex === 'M' || witnessSex === 'F') needs['THE WITNESS'] = witnessSex;
  return needs;
}

const FAMILIES = {
  [Role.COURT]: [{ voice: 'am_onyx', speed: 1.00 }],
  [Role.WITNESS]: [
    { voice: 'bf_emma', speed: 1.0, sex: 'F' },
    { voice: 'am_fenrir', speed: 1.00, sex: 'M' },
  ],
  [Role.COUNSEL_Q]: [{ voice: 'am_michael', speed: 1.0 }],
  [Role.COUNSEL_A]: [{ voice: 'af_bella', speed: 1.0 }],
  [Role.COUNSEL_NAMED]: [
    { voice: 'am_liam', speed: 1.0, sex: 'M' },
    { voice: 'af_nova', speed: 1.0, sex: 'F' },
    { voice: 'bm_george', speed: 1.00, sex: 'M' },
    { voice: 'bf_isabella', speed: 1.00, sex: 'F' },
  ],
  [Role.BAILIFF]: [{ voice: 'am_adam', speed: 1.00 }],
  [Role.CLERK]: [{ voice: 'af_sarah', speed: 1.0 }],
  [Role.INTERPRETER]: [{ voice: 'bf_alice', speed: 1.0 }],
  [Role.REPORTER]: [{ voice: 'am_echo', speed: 1.0 }],
  [Role.UNKNOWN]: [
    { voice: 'am_puck', speed: 1.0 },
    { voice: 'af_kore', speed: 1.0 },
    { voice: 'bm_lewis', speed: 1.0 },
    { voice: 'af_sky', speed: 1.0 },
  ],
};


export const PER_SPEAKER_RATE_MAX = 1.00;
export const PER_SPEAKER_RATE_MIN = 0.90;

export const RATE_TIER = {
  RIPS: 1.00,        // the fast talker: whatever the slider says, in full
  BRISK: 0.97,
  ORDINARY: 0.95,
  MEASURED: 0.93,
  DELIBERATE: 0.92,  // a judge who is not hurried by anybody -- and is not impaired either
};

export const PROCEEDING_RATE_CAST = {
  case_01_contract_dispute: {
    'MS. OKONKWO': RATE_TIER.RIPS,        // direct examination, keeps it moving
    'MR. DELACROIX': RATE_TIER.ORDINARY,
    'THE WITNESS': RATE_TIER.ORDINARY,
    'THE COURT': RATE_TIER.MEASURED,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  case_02_traffic_hearing: {
    'THE WITNESS': RATE_TIER.RIPS,
    'MS. NAVARRO': RATE_TIER.BRISK,
    'MR. BRENNAN': RATE_TIER.MEASURED,
    'THE COURT': RATE_TIER.DELIBERATE,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  case_03_small_claims: {
    'THE WITNESS': RATE_TIER.BRISK,
    'MR. FERRO': RATE_TIER.RIPS,
    'THE COURT': RATE_TIER.DELIBERATE,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  case_04_expert_witness: {
    'THE WITNESS': RATE_TIER.RIPS,
    'MS. WHITFIELD': RATE_TIER.ORDINARY,
    'MR. KESSLER': RATE_TIER.MEASURED,
    'THE COURT': RATE_TIER.DELIBERATE,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  case_05_deposition: {
    'MS. ORTIZ': RATE_TIER.RIPS,
    'THE WITNESS': RATE_TIER.MEASURED,
    'MR. BRENNAN': RATE_TIER.BRISK,
  },
};

export const PROCEEDING_VOICE_CAST = {
  case_02_traffic_hearing: {
    'MR. BRENNAN': 'bm_daniel',  // en-gb. 0.00% = am_liam's 0.00% on his 12 cues; 142.4 vs 145.8 WPM.
  },
  case_03_small_claims: {
    'MR. FERRO': 'bm_daniel',    // en-gb. 0.00% against am_liam's 1.18%; 186.8 vs 190.2 WPM.
  },
  case_04_expert_witness: {
    'MS. WHITFIELD': 'bf_lily',  // en-gb. 2.50% against af_nova's 3.33%; 137.5 vs 140.3 WPM.
    'MR. KESSLER': 'bm_daniel',  // en-gb. 0.43% against bm_fable's 2.15% AT HIS REAL SPEED 0.8499.
  },
};

const VOICE_SEX = {
  am_liam: 'M', am_michael: 'M', am_onyx: 'M', am_adam: 'M', am_echo: 'M',
  am_eric: 'M', am_fenrir: 'M', am_puck: 'M', am_santa: 'M',
  bm_george: 'M', bm_lewis: 'M', bm_daniel: 'M', bm_fable: 'M',
  af_nova: 'F', af_sarah: 'F', af_bella: 'F', af_kore: 'F', af_sky: 'F',
  af_heart: 'F', af_alloy: 'F', af_aoede: 'F', af_jessica: 'F',
  af_nicole: 'F', af_river: 'F',
  bf_emma: 'F', bf_isabella: 'F', bf_alice: 'F', bf_lily: 'F',
};

function overrideVoice(profile, label, proceedingId) {
  const want = proceedingId && PROCEEDING_VOICE_CAST[proceedingId]
    && PROCEEDING_VOICE_CAST[proceedingId][label];
  if (!want || want === profile.voice) return profile;
  const wantSex = VOICE_SEX[want];
  const haveSex = profile.sex || VOICE_SEX[profile.voice] || null;
  if (!wantSex) {
    console.error(`[courtsim/voice] ${label}: voice override "${want}" is not a voice this module `
      + 'knows the sex of. REFUSED -- a voice that disagrees with the avatar at that chair is the '
      + 'defect COURTSIM-REVERT-013 was sent to fix.');
    return profile;
  }
  if (haveSex && wantSex !== haveSex) {
    console.error(`[courtsim/voice] ${label}: voice override "${want}" reads ${wantSex} but the `
      + `seat's profile is ${haveSex}. REFUSED -- see COURTSIM-REVERT-013 section 3.`);
    return profile;
  }
  return { ...profile, voice: want, sex: wantSex };
}

const _labelFingerprints = new Map();

function fingerprint(labelsInOrder) {
  return [...new Set(labelsInOrder)].sort().join('|');
}

export function registerProceedingLabels(proceedingId, labelsInOrder) {
  const fp = fingerprint(labelsInOrder);
  const prior = _labelFingerprints.get(fp);
  if (prior && prior !== proceedingId) {
    console.warn(`[courtsim/voice] proceedings "${prior}" and "${proceedingId}" use an identical `
      + 'set of speaker labels, so per-speaker rate cannot be resolved from the labels alone. '
      + 'Both will use the ORDINARY tier. Give one of them a distinct counsel surname, or wire '
      + 'assignVoices({ proceedingId }) -- see reports/COURTSIM_VOICE_024.md.');
    _labelFingerprints.set(fp, null);
    return;
  }
  if (!_labelFingerprints.has(fp)) _labelFingerprints.set(fp, proceedingId);
}

export function proceedingIdForLabels(labelsInOrder) {
  return _labelFingerprints.get(fingerprint(labelsInOrder)) || null;
}

let _perSpeakerRateEnabled = true;
export function setPerSpeakerRateEnabled(on) { _perSpeakerRateEnabled = !!on; }
export function isPerSpeakerRateEnabled() { return _perSpeakerRateEnabled; }

function composeRate(familyBias, speakerTier, label) {
  const composed = (Number(familyBias) || 1.0) * (Number(speakerTier) || 1.0);
  if (composed > PER_SPEAKER_RATE_MAX + 1e-9) {
    console.error(`[courtsim/voice] ${label}: composed rate bias ${composed.toFixed(3)} exceeds `
      + `PER_SPEAKER_RATE_MAX ${PER_SPEAKER_RATE_MAX}. Clamped. Above this the synthesiser's own `
      + 'speed clamp eats the difference and this speaker would sound identical to the rest of '
      + 'the room while the readout claimed otherwise -- see the measurement at the top of this '
      + 'section.');
    return PER_SPEAKER_RATE_MAX;
  }
  if (composed < PER_SPEAKER_RATE_MIN - 1e-9) {
    console.warn(`[courtsim/voice] ${label}: composed rate bias ${composed.toFixed(3)} is below `
      + `PER_SPEAKER_RATE_MIN ${PER_SPEAKER_RATE_MIN}. Clamped.`);
    return PER_SPEAKER_RATE_MIN;
  }
  return composed;
}

export function assignVoices(speakerLabelsInOrder, options = {}) {
  const cast = {};
  const witnessSex = (options.witnessSex === 'M' || options.witnessSex === 'F')
    ? options.witnessSex : null;
  const proceedingId = options.proceedingId || proceedingIdForLabels(speakerLabelsInOrder);
  const rateCast = (_perSpeakerRateEnabled && proceedingId
    && PROCEEDING_RATE_CAST[proceedingId]) || null;
  const nextIndex = {};
  const seen = new Set();
  for (const label of speakerLabelsInOrder) {
    if (seen.has(label)) continue;
    seen.add(label);
    const role = roleForLabel(label);
    const family = FAMILIES[role] || FAMILIES[Role.UNKNOWN];
    const sex = (role === Role.WITNESS && witnessSex)
      ? witnessSex : voiceSexForLabel(label);
    let pool = family;
    if (sex) {
      const sexed = family.filter((p) => p.sex === sex);
      if (sexed.length) pool = sexed;
    }
    const key = `${role}:${sex || '-'}`;
    const i = nextIndex[key] || 0;
    const profile = overrideVoice(pool[i % pool.length], label, proceedingId);
    const tier = rateCast ? (rateCast[label] !== undefined ? rateCast[label] : RATE_TIER.ORDINARY) : 1.0;
    cast[label] = {
      role,
      sex: profile.sex || sex || null,
      ...profile,
      speed: composeRate(profile.speed, tier, label),
      familyBias: profile.speed,
      rateTier: tier,
      proceedingId: proceedingId || null,
    };
    nextIndex[key] = i + 1;
  }
  return cast;
}

export function speakerRateReport(globalWpm) {
  const wpm = Number(globalWpm) || 150;
  const lines = [];
  lines.push(`per-speaker rate: ${_perSpeakerRateEnabled ? 'ON' : 'OFF (difficulty popup -> "Vary speech rate by speaker")'}`);
  lines.push(`global slider: ${wpm} WPM -- this is the rate of the FASTEST speaker in the room`);
  lines.push('');
  if (!isContentSafeWpm(wpm, PER_SPEAKER_RATE_MAX)) {
    lines.push('');
    lines.push(`*** ${wpm} WPM IS ABOVE ${CONTENT_SAFE_WPM_MAX} WPM, WHERE THE SYNTHESISER STOPS SAYING ALL THE WORDS. ***`);
    lines.push('    Measured this session through the app\'s own recogniser and scorer, on 12 real');
    lines.push('    case_04 cues (275 reference words): 12 word-tokens charged to the trainee at 150 WPM,');
    lines.push('    46 at 254 WPM -- for words kokoro did not speak. The "WORD LOSS" column below marks');
    lines.push('    every speaker that is above the line. Lowering the slider is the only fix; a slower');
    lines.push('    per-speaker tier pulls that speaker back under it on its own.');
    lines.push('');
  }
  const slowestTurnRate = (role) => (role === Role.COURT ? 0.92 : 0.95);
  lines.push('proceeding                 speaker          family  tier   composed  slowest  asks   delivers  clamped  WORD LOSS');
  for (const [id, rates] of Object.entries(PROCEEDING_RATE_CAST)) {
    for (const [label, tier] of Object.entries(rates)) {
      const role = roleForLabel(label);
      const family = FAMILIES[role] || FAMILIES[Role.UNKNOWN];
      const sex = voiceSexForLabel(label);
      const sexed = sex ? family.filter((p) => p.sex === sex) : [];
      const profile = (sexed.length ? sexed : family)[0];
      const composed = _perSpeakerRateEnabled ? composeRate(profile.speed, tier, label) : profile.speed;
      const worst = Math.max(TOTAL_RATE_FLOOR, composed * slowestTurnRate(role));
      const asks = Math.round(wpm * composed);
      const delivers = deliverableWpm(wpm, composed);
      lines.push([
        id.padEnd(26), label.padEnd(16), profile.speed.toFixed(2).padStart(6),
        tier.toFixed(2).padStart(6), composed.toFixed(3).padStart(10),
        worst.toFixed(3).padStart(8),
        String(asks).padStart(6), String(delivers).padStart(10),
        (asks !== delivers ? '  YES <-' : '   no').padStart(9),
        (isContentSafeWpm(wpm, composed) ? '  clean' : '  DROPS WORDS <-'),
      ].join(' '));
    }
    lines.push('');
  }
  lines.push(`largest per-speaker multiplier the synthesiser can still deliver at ${wpm} WPM: `
    + `${maxDeliverableBias(wpm).toFixed(3)}  (every tier above is <= ${PER_SPEAKER_RATE_MAX}, so none of them ask for more)`);
  lines.push(`slowest anything in the room can be: ${TOTAL_RATE_FLOOR.toFixed(2)} x the slider `
    + `= ${Math.round(wpm * TOTAL_RATE_FLOOR)} WPM requested, against ${wpm} for the fastest speaker. `
    + `Widest ordinary spread ${(1.02 / TOTAL_RATE_FLOOR).toFixed(3)}x. Before COURTSIM-VOICE-048 the `
    + 'judge sat at 0.661 and MEASURED 102.8 WPM against a 147.8 WPM witness in case_04.');
  return lines.join('\n');
}

if (typeof window !== 'undefined') {
  window.__courtsimSpeakerRates = (wpm) => {
    let w = wpm;
    if (w === undefined) {
      try { w = Number(window.localStorage.getItem('courtsim_wpm')); } catch (e) { w = null; }
    }
    const text = speakerRateReport(w || 150);
    console.log(text);
    return text;
  };
}
