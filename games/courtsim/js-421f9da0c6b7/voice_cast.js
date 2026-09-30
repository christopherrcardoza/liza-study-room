// WEB-REBUILD-001 -- role inference and voice casting.
//
// roleForLabel() is a faithful, line-for-line port of
// courtsim/bridge/server.py's own _role_for_label() (the desktop build's
// already-reviewed rule set for these exact built-in proceedings' speaker
// labels) -- deterministic label-prefix matching, never inferred from
// prose content. Kept as a small, directly-comparable port rather than
// routed through Pyodide, since it's ~15 lines with no numpy/stdlib
// dependency worth the extra Pyodide round-trip.
//
// assignVoices() is a NEW design for the web build, not a port of
// courtsim/presentation/voice_cast.py -- that module's whole point was
// squeezing distinct IDENTITIES out of only 2 measured SAPI voices via
// pitch-shift/rate-bias/pan DSP (see reports/FULL_BUILD_002.md). The web
// build has 28 real, acoustically distinct kokoro voices (measured,
// reports/WEB_RESEARCH_001.md) and needs none of that DSP -- every role
// family below gets its own real voice(s), cycling only when a
// proceeding has more named counsel than the family has profiles for,
// exactly the same "cycle, stated in code" discipline the original used.

import {
  deliverableWpm, maxDeliverableBias, isContentSafeWpm, CONTENT_SAFE_WPM_MAX,
  // COURTSIM-VOICE-048 -- the floor on (tier x turn-type rate), so this
  // module's own instrument reports the same number tts.js enforces rather
  // than a second copy of it.
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

// =========================================================================
// COURTSIM-SPEECH-008 -- THE HONORIFIC IS EVIDENCE AND IT WAS BEING THROWN
// AWAY.
//
// FOUNDER, VERBATIM: "when they have the girl go, they just have it to be
// the same counsel member who was talking the first time to the guy" and
// "Counsel Q was talking every time, and the counsel named was never
// speaking. Counsel named is the girl."
//
// MEASURED, by running assignVoices() over the real shipped transcripts:
//
//   MS. OKONKWO    (direct examination) -> am_liam   <- A MALE VOICE
//   MR. DELACROIX  (cross examination)  -> af_nova   <- A FEMALE VOICE
//
// Both are exactly backwards. The COUNSEL_NAMED family was cycled by
// FIRST-APPEARANCE ORDER -- profiles[0] to whoever spoke first, profiles[1]
// to whoever spoke second -- and profiles[0] happened to be male and
// profiles[1] female. The label said "MS." and the code never looked.
//
// THIS ALSO CORRECTS THE JOB BRIEF. The brief states the founder "thought
// the voice changed gender mid-trial -- it did not; he was hearing the same
// man throughout." The mapping above says he was right and the brief is
// wrong: in case_01 the counsel voice really does change sex at utterance
// 14, from am_liam to af_nova, while the seat routing (scene.js, see
// main.js's counselSeatForSpeaker) kept showing him the SAME avatar. One
// person on screen, two sexes out of the speakers. That is not a
// misperception, it is the defect, and it is two defects compounding.
//
// Inferred from the honorific ONLY -- never from the name, never from prose.
// "MS."/"MRS." and "MR." are unambiguous in these transcripts and are the
// same label-prefix discipline roleForLabel() already keeps. "DR." and any
// unrecognised form are deliberately left unsexed: guessing a voice's sex
// from a surname is exactly the inference this module refuses to make, and
// an unsexed speaker simply cycles the mixed pool below.
// =========================================================================
export function voiceSexForLabel(label) {
  const u = String(label || '').toUpperCase().trim();
  if (u.startsWith('MS.') || u.startsWith('MRS.') || u.startsWith('MISS ')) return 'F';
  if (u.startsWith('MR.')) return 'M';
  return null; // DR., and anything else -- not guessed
}

// =========================================================================
// COURTSIM-REVERT-013 -- DEFECT 3. THE VOICE WAS RIGHT FOR THE LABEL AND
// WRONG FOR THE BODY, AND THAT IS WHY THEY READ AS "FLIP-FLOPPED".
//
// FOUNDER, VERBATIM: "the council named, that's the girl, is speaking with a
// guy voice. So the voices are completely wrong with the council. They
// flip-flopped them." / "The council Q is speaking as the woman though."
//
// COURTSIM-SPEECH-008 fixed the LABEL -> VOICE half (MS. -> female voice,
// MR. -> male voice) and never checked the SEAT -> AVATAR half. The avatars
// at the two counsel chairs are fixed, and their sexes are opposite:
//
//   MEASURED, read out of the shipped binaries' own root node names
//   (Rocketbox naming: f### = female model, m### = male model), and
//   independently confirmed on the running build from scene.js's live
//   _activeSeatDefs / _avatarModels:
//
//     scene.js SEAT_DEFS 'Counsel (Q)'     -> role counsel_a -> counsel_a.glb -> m008  MALE
//     scene.js SEAT_DEFS 'Counsel (named)' -> role counsel_b -> counsel_b.glb -> f014  FEMALE
//     (the deposition venue's own table at scene.js:1090-1091 uses the same
//      two roles at the same two seat keys, so this is venue-independent)
//
// SPEECH-008's seating rule was "first named counsel to speak takes
// Counsel (Q)". In case_01 that is MS. OKONKWO -- a woman, given a woman's
// voice, seated in the MALE avatar's chair -- and MR. DELACROIX, a man with
// a man's voice, in the FEMALE avatar's chair. Both backwards, which is
// exactly what the founder reported, and it is worse than before SPEECH-008
// only because SPEECH-008 corrected the voices without moving the bodies:
// the previous (wrong-for-the-label) voices happened to match the avatars.
//
// So the seat is chosen by SEX MATCH against the avatar that is actually
// sitting there. No hash, no appearance-order cycling, no coin flip. The
// table below is the one piece of scene.js knowledge main.js needs and it is
// stated here, once, with the measurement that produced it, rather than
// inferred at runtime from a private field of a file this lane does not own.
//
// IF THE AVATARS ARE EVER RECAST this table is the single place to update,
// and __courtsimCast() prints the resulting seating so the check is one call.
// =========================================================================
// COURTSIM-FIX-038 -- THIS TABLE IS NOW THE DEFAULT, NOT THE LAW.
//
// It states which body each counsel chair holds when nobody has said
// otherwise, and that is still exactly what buildCounselSeating() below
// needs: the seating decision must be a pure function of the transcript's
// labels, or it could depend on a plan that was itself derived from the
// seating. Seating decides first, from these defaults; scene.js then casts
// the bodies to fit the decision (planAvatarCasting / setCastRequirements).
//
// So a chair's LIVE occupant may be a different GLB from the one named here,
// and the only honest place to read that is scene.js's counselSeatAvatarSex(),
// which derives it from the seat defs the venue was actually built from.
// __courtsimCast() prints the live answer for exactly that reason.
export const COUNSEL_SEAT_AVATAR_SEX = {
  'Counsel (Q)': 'M',       // counsel_a.glb -- m008_hipoly_81_bones_opacity
  'Counsel (named)': 'F',   // counsel_b.glb -- f014_hipoly_81_bones_opacity
};

// Deterministic seating for named counsel.
//
//   labelsInOrder : every speaker label, in the transcript's own order.
//   returns       : { 'MS. OKONKWO': 'Counsel (named)', ... }
//
// THE RULE, in priority order, and every step of it is total and explicit:
//   1. Each distinct named-counsel label is sexed from its honorific ONLY
//      (voiceSexForLabel -- never from the surname, never from prose).
//   2. A sexed counsel takes the FREE counsel chair whose avatar is the same
//      sex. That is the whole fix: what the founder sees and what he hears
//      are then the same person.
//   3. A counsel with no readable honorific (DR., anything else), or one
//      whose matching chair is already taken, falls back to the first free
//      chair in the declared order of COUNSEL_SEAT_AVATAR_SEX.
//   4. A proceeding with more named counsel than chairs wraps that same
//      declared order, so the third one shares with the first.
//
// There is no iteration order in this function that depends on anything but
// the transcript, so the same transcript always produces the same seating --
// run it three times, get the same table. That is checked in __courtsimCast().
export function buildCounselSeating(labelsInOrder) {
  const seats = Object.create(null);
  const chairs = Object.keys(COUNSEL_SEAT_AVATAR_SEX);
  const taken = new Set();
  let overflow = 0;
  // Pass 1 is the distinct-label list, in first-appearance order. Building it
  // first (rather than assigning inside the scan) keeps the sex-matching pass
  // from depending on how many unnamed speakers happened to sit between two
  // lawyers.
  const counsel = [];
  const seen = new Set();
  for (const label of labelsInOrder) {
    if (seen.has(label)) continue;
    seen.add(label);
    if (roleForLabel(label) !== Role.COUNSEL_NAMED) continue;
    counsel.push(label);
  }
  // Pass 2: sexed counsel claim their matching chair first, so a woman can
  // never be pushed into the man's chair merely because she spoke first.
  for (const label of counsel) {
    const sex = voiceSexForLabel(label);
    if (!sex) continue;
    const chair = chairs.find((c) => COUNSEL_SEAT_AVATAR_SEX[c] === sex && !taken.has(c));
    if (chair) { seats[label] = chair; taken.add(chair); }
  }
  // Pass 3: everyone still unseated takes the first free chair, then wraps.
  for (const label of counsel) {
    if (seats[label]) continue;
    const chair = chairs.find((c) => !taken.has(c));
    if (chair) { seats[label] = chair; taken.add(chair); }
    else { seats[label] = chairs[overflow % chairs.length]; overflow += 1; }
  }
  return seats;
}

// =========================================================================
// COURTSIM-FIX-038 -- WHAT THE ROOM HAS TO PROVIDE, once the seating above
// has decided who sits where.
//
// buildCounselSeating() is UNCHANGED, deliberately and by measurement: pass 2
// still gives a sexed counsel the chair whose DEFAULT body matches, so all
// five shipped cases produce byte-identical seating to COURTSIM-REVERT-013's
// proven table and nobody who is correctly seated today moves. What was
// broken was never pass 2; it was pass 3, where a SECOND man had nowhere
// matching to go and took the woman's chair while keeping his own voice.
//
// This function says what pass 3 leaves owing. It is the bridge to scene.js:
//
//     seatsByLabel   { 'MR. ZAFRAN': 'Counsel (Q)', 'MR. BURGUNDY': 'Counsel (named)' }
//     witnessSex     'M' | 'F' | null -- stated, never inferred (see assignVoices)
//     ->             { 'Counsel (Q)': 'M', 'Counsel (named)': 'M', 'THE WITNESS': 'M' }
//
// A label with no readable honorific contributes NOTHING -- not a guess, not
// a default -- so the seat keeps its shipped body. That is the property that
// makes this change unable to move any proceeding it was not sent to fix.
//
// Two counsel of the same sex in the same chair (more counsel than chairs)
// resolve to that one sex: the chair can only hold one body, the overflow is
// already disclosed by buildCounselSeating's own wrap, and the LAST writer
// would otherwise silently win. First writer wins here, which matches the
// first-appearance order everything else in this module uses.
// =========================================================================
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

// speed: a per-role RATE BIAS (mirrors the desktop build's own
// profile.wpm_bias in courtsim/presentation/voice_cast.py), not an
// absolute kokoro speed value -- SPEED-VOLUME-001 multiplies this by the
// player's own chosen WPM (tts.js's wpmToSpeed()) so the global slider
// sets the overall pace while these small per-role variations are
// preserved on top of it, same two-layer model the desktop build uses.
//
// COURTSIM-VOICE-024 -- am_fenrir and bf_isabella were 1.02 and are now
// 1.00. Not a style edit: PER_SPEAKER_RATE_MAX below is 1.00 and the
// composed bias is asserted against it, and 1.02 at the founder's persisted
// 254 WPM solves to kokoro speed 1.835 against a SYNTH_SPEED_MAX of 1.85 --
// i.e. it was already within 1% of silently clamping. Neither profile is
// reachable in any shipped proceeding (both are the second entry in a pool
// that no case has two same-sex speakers for), so nothing audible moves.
//
// COURTSIM-VOICE-048 -- THE COURT's family bias was 0.95 and is now 1.00,
// and this is a correction, not a preference.
//
// FOUNDER, VERBATIM, FIVE SEPARATE TIMES: "the judge's voice is slow ... the
// court is like he's in slow motion compared to everyone else ... his is like
// ridiculously slower ... They should all be the same."
//
// He was right, and 0.95 was half of why. The judge's rate was being set in
// TWO places that multiplied: this family bias AND his RATE_TIER. A reader of
// either one alone saw a defensible number; what reached the synthesiser was
// 0.95 x 0.74 = 0.703, and PER_SPEAKER_RATE_MIN had already been lowered from
// 0.74 to 0.70 to stop that product from tripping its own guard -- the guard
// was reporting the defect and was moved out of its way.
//
// MEASURED, out of the real synthesiser, at his own 155 slider, on his own
// case_04 lines: THE COURT delivered 102.8 WPM against a 147.8 WPM witness,
// and articulated (words per VOICED second, silence excluded) at 157.1
// against her 265.1 -- 40.7% slower, a 1.688x articulation spread. That is
// not a measured judge. That is the slow-motion he described.
//
// A speaker's rate now comes from ONE number: his tier. Every family bias
// that is not 1.00 is a second, invisible multiplier on somebody's rate and
// should be read as a defect waiting to be reported, not as a style knob.
const FAMILIES = {
  [Role.COURT]: [{ voice: 'am_onyx', speed: 1.00 }],
  // COURTSIM-FIX-038 -- the two witness profiles are now SEXED, for the same
  // reason COURTSIM-SPEECH-008 sexed the counsel pool: the sexes were already
  // opposite and nothing could read them. bf_emma stays profiles[0], so a
  // proceeding that says nothing about its witness gets bf_emma exactly as it
  // always has. See the `witnessSex` option on assignVoices().
  [Role.WITNESS]: [
    { voice: 'bf_emma', speed: 1.0, sex: 'F' },
    { voice: 'am_fenrir', speed: 1.00, sex: 'M' },
  ],
  [Role.COUNSEL_Q]: [{ voice: 'am_michael', speed: 1.0 }],
  [Role.COUNSEL_A]: [{ voice: 'af_bella', speed: 1.0 }],
  // COURTSIM-SPEECH-008 -- the same four profiles as before, unchanged in
  // voice and bias, but now SEXED so the honorific can pick the pool. The
  // flat list that used to be here is what put am_liam behind "MS. OKONKWO".
  // Ordering within each pool is still first-appearance, so the cast is as
  // deterministic as it ever was -- it is just no longer wrong.
  [Role.COUNSEL_NAMED]: [
    { voice: 'am_liam', speed: 1.0, sex: 'M' },
    { voice: 'af_nova', speed: 1.0, sex: 'F' },
    // COURTSIM-VOICE-048 -- bm_george was 0.98. Same correction as THE COURT's
    // 0.95 and the bailiff's 0.97 below: a rate must be stated in ONE place.
    // Not audible today -- this is profiles[2] of the male counsel pool and no
    // shipped case has three male named counsel, so nothing reaches it.
    { voice: 'bm_george', speed: 1.00, sex: 'M' },
    { voice: 'bf_isabella', speed: 1.00, sex: 'F' },
  ],
  // COURTSIM-VOICE-048 -- was 0.97. No shipped proceeding has a BAILIFF label,
  // so this is unreachable today; it is corrected anyway, because leaving one
  // hidden second multiplier in the file is how the judge's 0.95 survived.
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

// =========================================================================
// COURTSIM-VOICE-024 -- PER-SPEAKER RATE. ONE WITNESS WHO RIPS WHILE THE
// JUDGE STAYS MEASURED, WHICH IS WHAT THE GLOBAL SLIDER CANNOT SIMULATE.
//
// COURTSIM-CONTENT-020 named this as its own unclosable gap: "The 'fast
// talker' is not actually faster. The WPM slider is global, so the
// fast-talker effect is authored as DENSITY (long unbroken cues), not rate.
// A student will feel it as a longer stretch without a breath rather than
// as a genuinely faster speaker."
//
// -------------------------------------------------------------------------
// THE MEASUREMENT THAT DECIDED THE WHOLE DESIGN, AND IT IS NOT THE OBVIOUS
// ONE.
//
// The obvious design is a multiplier ABOVE 1.0 on the fast speaker. It does
// not work, and here is the number. kokoro's `speed` is clamped to
// SYNTH_SPEED_MAX = 1.85 (tts.js). The founder's persisted global rate is
// 254 WPM, which already solves to speed 1.7989 -- 97% of the ceiling.
// Measured this session on 6 real case_02 cues through the real engine:
//
//     global 254 WPM   bias 1.15 -> +1.3% faster  )
//                      bias 1.30 -> +1.3% faster  ) IDENTICAL CLAMPED AUDIO
//                      bias 1.45 -> +1.3% faster  )
//     global 200 WPM   bias 1.30 -> +13.1%        (partly eaten)
//     global 150 WPM   bias 1.30 -> +43.4%        (real)
//
// AT THE SETTING HE ACTUALLY USES, A FASTER-THAN-EVERYONE SPEAKER CANNOT
// EXIST. Any bias above about 1.03 at 254 WPM is a promise the synthesiser
// silently refuses. Shipping that would be the exact defect this project
// keeps paying for: a control that reports a number the machine never
// produces.
//
// -------------------------------------------------------------------------
// SO THE SPREAD HANGS DOWNWARD FROM THE SLIDER, NOT UPWARD FROM IT.
//
//     THE GLOBAL SLIDER NOW MEANS: THE RATE OF THE FASTEST SPEAKER IN THE
//     ROOM. Everybody else is a fraction of it.
//
// Every multiplier below is <= PER_SPEAKER_RATE_MAX (1.00), which is
// asserted, not merely intended (see composeRate). Three consequences, all
// of them measured rather than argued:
//
//   1. THE CLAMP CAN NEVER BE REACHED FROM ABOVE. A composed bias of at
//      most 1.0 can never solve past SYNTH_SPEED_MAX, at any slider
//      position the slider can reach, so a per-speaker rate can never
//      silently turn into "the same as everyone else".
//   2. IT GETS STRONGER WHERE HE ACTUALLY PLAYS, because kokoro's
//      speed->rate response is strongly non-linear and steep at the top.
//      The SAME 0.80 multiplier, on the same 12 real case_04 witness cues,
//      measured:
//          global 150 WPM -> -13.5%
//          global 190 WPM -> -28.7%
//      A bias-above-1.0 design does the opposite: it dies exactly where he
//      plays. This one is at its strongest there.
//   3. The room's AVERAGE rate falls, so a proceeding runs longer than
//      COURTSIM-CONTENT-020 measured it. That direction is safe: its
//      [REDACTED-PRE-FILING] gate needs a session LONGER than 9 minutes and every case
//      clears it by more than 11.
//
// HONEST LIMIT, at the other end: SYNTH_SPEED_MIN is 0.55, so the slowest
// tier below (0.74) hits the FLOOR when the global slider is under about
// 106 WPM. That is not silent either -- prosodyForTurn() returns
// `rateClamped` and `deliveredWpm` on every plan from this pass onward.
//
// NOT VERIFIED BY EAR. Every figure here is words-per-second read off the
// sample buffer kokoro returned, cross-checked between node/CPU and the
// founder's own WebGPU browser (byte-identical, 198000 samples on the
// calibration line). Whether a 25% spread READS as two different people is
// his judgement.
// =========================================================================

// The ceiling is 1.00 BY CONSTRUCTION, for the reason above. Do not raise
// it without re-running the measurement -- at 254 WPM there is 1.028 of
// headroom in total and the founder will hear nothing for the trouble.
export const PER_SPEAKER_RATE_MAX = 1.00;
// COURTSIM-VOICE-048 -- THE FLOOR IS 0.90 AND IT IS NOW A REAL GUARD AGAIN.
//
// It was 0.70, and the comment it replaces explained that 0.70 was chosen so
// that 0.95 x 0.74 = 0.703 would fit UNDER it. That is a guard being moved
// out of the way of the thing it exists to catch, and the founder heard the
// result five times. With THE COURT's family bias corrected to 1.00 (see
// FAMILIES) and the ladder compressed below, every family bias is 1.00, so
// the lowest composed bias any cast can produce is exactly DELIBERATE, 0.92.
// A floor of 0.90 therefore sits one small step under the real minimum: close
// enough to bite on the very next mistake rather than twenty-two hundredths
// away from it.
//   0.90 x wpmToSpeed(254) = 1.619  -- inside SYNTH_SPEED_MAX 1.85
//   0.90 x wpmToSpeed(155) = 0.988  -- his own setting, nowhere near a clamp
//   0.90 x wpmToSpeed( 86) = 0.5482 -- where SYNTH_SPEED_MIN finally bites
// The slider would have to go below about 87 WPM before the slowest speaker
// stops getting slower, against 112 before; prosodyForTurn() still reports
// `rateClamped` when it happens.
export const PER_SPEAKER_RATE_MIN = 0.90;

// =========================================================================
// COURTSIM-VOICE-048 -- THE LADDER IS COMPRESSED. 1.351x OF TIER SPREAD
// BECOMES 1.087x, AND THE MEASUREMENT IS WHY.
//
// The tiers were 1.00 / 0.93 / 0.86 / 0.80 / 0.74. COURTSIM-VOICE-024 built
// them and reported a 1.280x spread, measured on IDENTICAL TEXT -- which
// necessarily means identical turn types, because classifyTurn() reads the
// text. In a real proceeding the turn-type layer in tts.js multiplies on top
// of the tier and it is not distributed evenly across the room: RULING is
// 0.94 and ORDER is 0.92 and only the judge is ever given either, while the
// fast talker's own commonest type, ANSWER, is 1.02. The two layers compound
// on the same speaker in the same direction, and nothing measured the
// product until this pass.
//
// MEASURED, real synthesiser, his own 155 slider, 220 real cues across all
// five cases -- delivered WPM, fastest speaker to slowest:
//
//   case_01  159.3 -> 134.6   1.183x
//   case_02  178.9 -> 116.8   1.531x
//   case_03  183.1 -> 126.9   1.443x
//   case_04  147.8 -> 102.8   1.438x
//   case_05  175.1 -> 158.3   1.106x
//
// He set the slider to 155 and case_04's judge spoke at 102.8.
//
// THE OTHER HALF OF THE MEASUREMENT, and it is the one that answers "is it
// really rate": words per VOICED second, silence excluded, so a line of short
// clipped commands cannot be mistaken for slow articulation. case_04: THE
// COURT 157.1, THE WITNESS 265.1 -- 40.7% slower, 1.688x. It is articulation,
// not pausing. He was describing exactly what is there.
//
// RULED OUT, by measurement, not by reasoning:
//   - NOT the voice. COURTSIM-ACCENT-042's lesson applied -- am_onyx measured
//     AT THE RATE THE JUDGE IS ACTUALLY GIVEN (bias 0.703) delivers 148.3 WPM
//     on a fixed text, against bf_emma's 137.8 at the SAME bias. The judge's
//     voice is the FASTER of the two. Timbre is not the cause.
//   - NOT playbackRate applied twice. Achieved WPM tracks the raw kokoro
//     length to within 1% in every rate bucket (114.0 vs 114.9, 142.5 vs
//     143.3, 166.8 vs 167.0). The two-knob solve cancels exactly as FIX-X
//     designed it to; R never double-counts.
//   - NOT time-stretching or pitch-shifting. THE COURT's mean playbackRate is
//     0.993, within 0.7% of unity.
//
// WHAT HE ALLOWS, VERBATIM: "I can see how maybe some people speak at
// different speeds, which isn't bad, maybe we do throw that in there from
// time to time." So the ladder is compressed, not deleted. The ordering, the
// names, the per-case cast and the between-case difficulty ramp are all
// unchanged -- only the size of each step moves. A judge one step below
// counsel still reads as unhurried; a judge two-thirds of everyone else's
// rate reads as impaired, and that is the distinction this pass exists to
// make.
//
// Every tier is still <= PER_SPEAKER_RATE_MAX, still asserted in
// composeRate(), so the clamp guarantee COURTSIM-VOICE-024 built is intact.
// =========================================================================
export const RATE_TIER = {
  RIPS: 1.00,        // the fast talker: whatever the slider says, in full
  BRISK: 0.97,
  ORDINARY: 0.95,
  MEASURED: 0.93,
  DELIBERATE: 0.92,  // a judge who is not hurried by anybody -- and is not impaired either
};

// =========================================================================
// WHO SPEAKS AT WHAT RATE, PER PROCEEDING.
//
// Keyed by proceeding id and then by the SPEAKER LABEL the transcript uses.
// A label with no entry takes RATE_TIER.ORDINARY, so silence here is a
// decision with a stated value rather than an accident.
//
// The spread widens across the five cases deliberately, extending the
// difficulty ramp COURTSIM-CONTENT-020 built INSIDE each case to a ramp
// BETWEEN them: case_01 is nearly flat and case_04 is the widest.
// =========================================================================
export const PROCEEDING_RATE_CAST = {
  // Gentlest. The founder's first case should not also be the fastest room.
  case_01_contract_dispute: {
    'MS. OKONKWO': RATE_TIER.RIPS,        // direct examination, keeps it moving
    'MR. DELACROIX': RATE_TIER.ORDINARY,
    'THE WITNESS': RATE_TIER.ORDINARY,
    'THE COURT': RATE_TIER.MEASURED,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  // The arresting officer on the stand, reciting what he wrote down, fast --
  // the single most familiar "fast talker" in a real misdemeanour hearing.
  case_02_traffic_hearing: {
    'THE WITNESS': RATE_TIER.RIPS,
    'MS. NAVARRO': RATE_TIER.BRISK,
    'MR. BRENNAN': RATE_TIER.MEASURED,
    'THE COURT': RATE_TIER.DELIBERATE,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  // Lay parties. The claimant runs away with herself; the judge deliberately
  // slows the room down, which is what a judge does with unrepresented
  // parties and is also the relief this case is for.
  case_03_small_claims: {
    'THE WITNESS': RATE_TIER.BRISK,
    'MR. FERRO': RATE_TIER.RIPS,
    'THE COURT': RATE_TIER.DELIBERATE,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  // The widest spread in the build, on top of the heaviest vocabulary. The
  // expert rips through terminology; the court is at the slowest tier.
  case_04_expert_witness: {
    'THE WITNESS': RATE_TIER.RIPS,
    'MS. WHITFIELD': RATE_TIER.ORDINARY,
    'MR. KESSLER': RATE_TIER.MEASURED,
    'THE COURT': RATE_TIER.DELIBERATE,
    'THE CLERK': RATE_TIER.ORDINARY,
  },
  // No judge, so nobody slows anybody down: examining counsel sets the pace
  // and the witness answers at her own. That is what a deposition is.
  case_05_deposition: {
    'MS. ORTIZ': RATE_TIER.RIPS,
    'THE WITNESS': RATE_TIER.MEASURED,
    'MR. BRENNAN': RATE_TIER.BRISK,
  },
};

// =========================================================================
// COURTSIM-VOICE-024 -- THE SECOND HALF OF THE BRIEF: THE DIFFICULT SPEAKER,
// AND WHAT I REFUSED TO BUILD.
//
// COURTSIM-CONTENT-020 wrote: "Accented speech is not represented ... Kokoro's
// voice inventory includes British voices but no genuinely accented
// non-native speaker, and I will not claim an accent the engine cannot
// produce." It was right not to fake one. It was only half right about the
// inventory, and here is the whole of it, read off the shipped library and
// the live engine rather than taken on trust:
//
//   kokoro-js 1.2.1's VOICES map holds EXACTLY 28 voices: 20 `en-us` and
//   8 `en-gb`. Confirmed three ways -- the package's own types/voices.d.ts,
//   the bundled dist/kokoro.js source, and `tts.voices` read off the LIVE
//   engine in the founder's own browser on localhost:8080.
//
//   The npm package ALSO ships 25 further voice embeddings on disk --
//   Hindi (hf_alpha, hf_beta, hm_omega, hm_psi), Spanish, French, Italian,
//   Portuguese, Japanese, Mandarin. They are NOT reachable: `generate()`
//   calls `_validate_voice()`, which throws for anything outside the 28
//   ("Voice \"hf_alpha\" not found. Should be one of: ...", reproduced live),
//   and the bundled phonemizer has exactly two languages, `en-us` and `en`.
//
// COULD THEY BE REACHED ANYWAY? YES, AND I MEASURED IT RATHER THAN ASSUMING
// EITHER WAY, BECAUSE THE BRIEF SAID NOT TO TAKE IMPOSSIBILITY ON TRUST.
// Overriding `_validate_voice` on the live engine and speaking an ordinary
// courtroom line through the Hindi, Spanish and Italian embeddings produces
// intelligible audio -- and the app's own recogniser and scorer return
// trainee_accuracy 100% on all of them, 0 tokens charged.
//
// THAT RESULT IS THE REASON TO REFUSE, not a reason to ship it. What comes
// out is AMERICAN-ENGLISH PHONEMES in a foreign speaker's timbre, because
// the phonemizer is the only thing that decides pronunciation and it has no
// Hindi. It is not an accent -- an accent is a different phonology, not a
// different voice colour. A machine trained on American English hearing it
// perfectly is the evidence: a genuinely accented speaker would be HARDER
// for it, and this is not. So labelling it "the accented speaker" would ship
// a costume, sold as a person's way of speaking, that no speaker of that
// language actually produces. That is the caricature the brief forbids, and
// it would also require monkey-patching past a guard the library author put
// there on purpose. NOT BUILT, DELIBERATELY.
//
// AND THE HONEST NEGATIVE RESULT, which matters more than either: WITHIN the
// reachable 28, THE CHOICE OF VOICE IS NOT A DIFFICULTY LEVER. Ten real
// case_04 cues per voice, through the app's own recogniser and scorer:
//
//   witness seat (f001, female)        counsel (Q) seat (m008, male)
//     bf_emma     148.1 WPM  4.05%       am_liam     172.0 WPM  1.96%
//     bf_isabella 147.6      2.70%       bm_george   147.0      1.47%
//     bf_alice    143.6      2.70%       bm_daniel   170.4      0.49%
//     bf_lily     145.5      1.80%       bm_fable    168.3      1.47%
//     af_sky      145.2      2.25%       bm_lewis    147.0      0.49%
//     af_jessica  159.3      1.80%       am_michael  142.0      0.98%
//     af_nicole    94.6      4.95%
//
// Two percentage points of spread, and the charged tokens are the same
// proper nouns in every row (Aurelia, Navarro, Aaron) -- voice-independent.
// RATE moves the same measurement from 4.36% to 16.73%. Rate is the lever;
// timbre is not. That is why this pass built per-speaker RATE and did not
// pretend a voice swap was a difficulty feature.
//
// WHAT IS SHIPPED, AND EXACTLY WHAT IS AND IS NOT CLAIMED FOR IT: case_04
// gets a SECOND ACCENT IN THE ROOM. Its counsel (Q) moves from am_liam
// (en-us) to bm_fable (en-gb), so the founder hears two British speakers
// among three Americans instead of one among four, with genuinely different
// vowels -- kokoro phonemises `b` voices through espeak `en` and `a` voices
// through `en-us`, so this is a real pronunciation difference, not a
// re-colouring.
//
//   CLAIMED, AND MEASURED: it is SAFE. On the exact ten MR. KESSLER cues it
//   will speak, in the exact seat, bm_fable charges the trainee 1.47%
//   against am_liam's 1.96%. It does not manufacture false errors, which is
//   the only thing that would make it worse than nothing.
//   NOT CLAIMED, AND NOT MEASURABLE HERE: that it is HARDER FOR HIM.
//   whisper-tiny.en is a proxy for "did the machine say the words", not for
//   a human ear trained on American English. Whether a British barrister is
//   harder to write is his judgement and nobody here can take it from him.
//
// Sex is preserved by assertion below, because a voice that disagrees with
// the body at that chair is precisely the defect COURTSIM-REVERT-013 was
// sent to fix, and reintroducing it would be worse than shipping nothing.
//
// MEASURED-SAFE ALTERNATIVES, if he wants more variety later: bf_lily
// (1.80%) or bf_isabella (2.70%) in a witness seat; bm_daniel (0.49%) or
// bm_lewis (0.49%) in counsel (Q). af_nicole is on the table only as a
// warning -- it is kokoro's ASMR voice and runs at 94.6 WPM, 36% slower
// than the rest, which would fight every rate tier in this file.
// =========================================================================
// COURTSIM-ACCENT-042 -- THE SEARCH WAS RE-RUN WITH INTERNET AND A REAL
// PHONEME PATH. THE ANSWER IS STILL NO, FOR A BETTER REASON, AND VOICE-024's
// OWN CHOICE ABOVE TURNED OUT TO BE MEASURED AT THE WRONG SPEED.
//
// 1. THE INVENTORY IS BIGGER THAN VOICE-024 COULD SEE, AND IT DOES NOT HELP.
//    kokoro-js 1.2.1 is the LATEST release (npm dist-tags.latest, published
//    2025-05-03; hexgrad/Kokoro-82M last modified 2025-04-10). No newer
//    release adds voices. But the accents were never in the VOICE table at
//    all -- they are in the PHONEMIZER, which kokoro-js already depends on and
//    already ships. `phonemizer@1.2.1`'s list_voices() returns EIGHT English
//    phonologies, not two:
//
//      en-us  en(-gb)  en-gb-x-rp  en-gb-scotland  en-gb-x-gbclan
//      en-gb-x-gbcwmd  en-us-nyc  en-029
//
//    and kokoro's only tie to two of them is one ternary in a private
//    function: `const n = "a" === lang ? "en-us" : "en"`. Steps 2 and 3 of
//    generate() -- tokenize and generate_from_ids -- are PUBLIC. So an accent
//    can be spoken with NO monkey-patching, NO forced voice, NO extra
//    download, by a shipped and validated voice. That was built and PROVEN
//    exact: 191 real cues from all five proceedings, both languages, rendered
//    through the phoneme path and through generate(), SAMPLE-IDENTICAL,
//    0 differ. `tools/accent_probe.mjs` reproduces it.
//
// 2. IT STILL MUST NOT SHIP, AND THIS TIME THE REASON IS A NUMBER.
//    Every phonology far enough from en-us/en-gb to BE an accent is also far
//    enough outside what the 82M model was trained on that it stops rendering
//    words. 10 real case_04 witness cues + 10 counsel cues, through the app's
//    own recogniser and score_take(), trainee-charged / reference words:
//
//      en-gb-x-rp      1.17%   (4.3% from en-gb -- too close to BE an accent)
//      en-gb-x-gbclan  2.11%   (2.7% -- same)
//      en (shipped)    2.82%   baseline
//      en-029          4.93%
//      en-gb-x-gbcwmd  5.63%
//      en-us-nyc       8.92%
//      en-gb-scotland 10.56%   (21.7% from en-us -- the only real distance)
//
//    THERE IS NO PHONOLOGY THAT IS BOTH FAR AND CLEAN. And it is damage, not
//    accent: Scottish English is strongly RHOTIC, the model was handed 43%
//    MORE post-vocalic /ɹ/ than the British baseline, and what came back had
//    7% FEWER r-sounds in it -- "certified" heard as "setified", "nerve root"
//    as "naverut", "I took a history" as "Itika Histere". Word boundaries
//    dissolving, not vowels shifting. A cross-control settles it: Scottish
//    phonemes in an AMERICAN voice damage exactly as much (9.91%), American
//    phonemes in a BRITISH voice damage exactly as little (1.35%). The
//    phonology carries all of it and the timbre carries none -- the precise
//    INVERSE of the Hindi-embedding costume VOICE-024 refused above.
//
// 3. THE SECOND ENGINE WAS MEASURED, NOT WAVED OFF. Piper (MIT) publishes
//    en_US-arctic-medium: 18 CMU ARCTIC speakers, several of them REAL
//    RECORDINGS of real people speaking accented English (awb Scottish, ksp /
//    aup / gka / axb / slp Indian, fem Irish, ahw German), on a licence that
//    permits commercial use and whose voice talents signed waivers. It is the
//    honest article and it was run through the same instrument at a
//    rate MATCHED to kokoro's (149 WPM):
//
//      piper slt (US control)   7.66%      piper awb (Scottish)  7.21%
//      piper bdl (US control)   9.46%      piper ksp (Indian)    8.11%
//      kokoro bf_emma           4.05%      piper fem (Irish)     7.66%
//
//    The accent buys nothing the scorer can see -- piper's own Americans are
//    no easier than its Scot or its Indian speakers -- while the ENGINE costs
//    ~4 points of parity and 73.2 MiB on a build already 125-280 MB cold.
//    Paying 73 MiB and a parity regression for zero measured difficulty is
//    not a trade worth making, and the founder is the one who would pay it.
//
// 4. AND THE CORRECTION TO THE DECISION ABOVE. VOICE-024 chose bm_fable for
//    MR. KESSLER on 1.47%-vs-1.96%, measured at kokoro speed 1.0623 -- but
//    KESSLER's composed bias is 0.800, so he actually runs at speed 0.8499.
//    Re-measured AT HIS OWN OPERATING POINT, on 12 of his own cues:
//    bm_fable 2.15%, am_liam 0.00%, bm_daniel 0.43%. The shipped choice is
//    worse than the voice it replaced. bm_daniel keeps the second accent in
//    the room AND fixes the parity, so that is the change -- not a revert.
//
// SO WHAT SHIPS IS THE ONE ACCENT THIS ENGINE RENDERS CLEANLY: en-gb against
// en-us, 13.0% IPA distance, the largest distance anywhere in the eight-way
// sweep that carries no boundary damage -- in MORE of the room, chosen per
// case by measurement. VOICE-024 round-tripped only case_04 and said so
// (its limit #8); this is all five, 480 round-trips, 12 real cues per
// candidate at each speaker's OWN composed rate.
//
// THE ACCEPTANCE RULE, fixed before the numbers were seen, and every change
// below clears BOTH halves of it:
//   (a) PARITY: trainee-charged tokens <= the incumbent's, on that case's own
//       cues, in that seat, at that seat's real speed. A voice that
//       manufactures false errors is worse than no change.
//   (b) RATE COMPATIBILITY: delivered WPM within 5% of the incumbent's, so
//       the per-speaker tiers still mean what they say. This is what rules
//       out bm_george and bm_lewis everywhere -- both measure 0.00% in places
//       but run 13-21% slow, and would fight every tier in this file exactly
//       the way af_nicole would.
//
//   case  speaker          from      -> to           blame%        WPM
//   01    (unchanged -- the onboarding case stays the gentlest room)
//   02    MR. BRENNAN      am_liam   -> bm_daniel    0.00 -> 0.00  -2.3%
//   03    MR. FERRO        am_liam   -> bm_daniel    1.18 -> 0.00  -1.8%
//   04    MS. WHITFIELD    af_nova   -> bf_lily      3.33 -> 2.50  -2.0%
//   04    MR. KESSLER      bm_fable  -> bm_daniel    2.15 -> 0.43  +3.3%
//   05    (unchanged -- see below)
//
// Non-American voices in the room, which is the VARIETY ramp and is stated as
// variety and NOT as difficulty: case_01 1/5, case_05 1/3, case_02 2/5,
// case_03 2/4, case_04 3/5. Monotone, and case_04 -- the heaviest vocabulary
// and the widest rate spread -- is still the widest here too.
//
// case_05 is LEFT ALONE DELIBERATELY, and it cost something to leave: bf_alice
// measured 0.39% against af_nova's 1.16% for MS. ORTIZ, a real improvement
// declined. Taking it would have made the deposition 2/3 non-American -- the
// most accented room in the build -- which would put it above case_04 and
// break the ramp for two tokens out of 258 words. Recorded rather than taken.
//
// STILL NOT CLAIMED, AND STILL NOT MEASURABLE HERE: that a British speaker is
// HARDER FOR HIM. whisper-tiny.en is a proxy for "did the machine say the
// words", not for an American ear. VOICE-024 drew that line and it stands.
// What IS claimed is that there is more than one phonology in more of the
// rooms, and that not one of these changes costs him a mark.
// =========================================================================
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

// Every voice an override may select, with the sex it reads as. The override
// is REFUSED, loudly, if it disagrees with the profile it is replacing.
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

// -------------------------------------------------------------------------
// WHICH PROCEEDING IS THIS? Answered from the content itself, not guessed.
//
// main.js calls assignVoices(labelsInOrder) with nothing but the labels, so
// this module cannot be told the id without a change to a file this lane
// does not own. Rather than hard-code a fingerprint table that a later
// content edit would silently invalidate, proceedings.js -- which parses
// every case at boot and therefore knows both halves -- REGISTERS the
// mapping as it loads. The registry is rebuilt from the real files on every
// page load, so renaming a speaker cannot break it.
//
// `assignVoices(labels, { proceedingId })` remains the exact route and is
// the one the handoff in reports/COURTSIM_VOICE_024.md asks main.js to use.
// This registry is the fallback that makes the feature work TODAY, with no
// change to any file this lane does not own.
// -------------------------------------------------------------------------
const _labelFingerprints = new Map();

function fingerprint(labelsInOrder) {
  return [...new Set(labelsInOrder)].sort().join('|');
}

export function registerProceedingLabels(proceedingId, labelsInOrder) {
  const fp = fingerprint(labelsInOrder);
  const prior = _labelFingerprints.get(fp);
  if (prior && prior !== proceedingId) {
    // Two proceedings with the same cast of labels. The registry cannot tell
    // them apart, so it refuses to guess and per-speaker rate falls back to
    // ORDINARY for both -- which is exactly today's behaviour, not a wrong
    // answer. Checked at boot rather than discovered in a field test.
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

// -------------------------------------------------------------------------
// THE DIFFICULTY CONTROL THIS FINALLY PUTS AN ENGINE BEHIND.
//
// difficulty_settings.js has shipped a "Vary speech rate by speaker" toggle
// since FIELD-TEST-BUILD-001 with nothing behind it, and its own header says
// so. It is wired now. The direction is settings -> here (a push), not here
// -> settings (a pull), deliberately: pulling would make this module import
// the popup's DOM chrome, and a voice-casting module that cannot be loaded
// without a document is a module that cannot be measured offline. It was
// measured offline this session, repeatedly.
//
// It is read at CAST time, which is Begin Session. Toggling mid-proceeding
// does nothing until the next session, and the popup says so.
// -------------------------------------------------------------------------
let _perSpeakerRateEnabled = true;
export function setPerSpeakerRateEnabled(on) { _perSpeakerRateEnabled = !!on; }
export function isPerSpeakerRateEnabled() { return _perSpeakerRateEnabled; }

// The composition rule, in one place: the family's own long-standing role
// bias MULTIPLIED by the per-speaker tier. A multiplier rather than an
// absolute WPM for three reasons, and the first is the one that matters:
//
//   1. The founder's slider keeps its authority over every speaker. An
//      absolute per-speaker WPM would make one voice deaf to the control he
//      actually uses.
//   2. It is immune to KOKORO_BASELINE_WPM being wrong, and this session
//      measured that it IS wrong for the line it was taken from (tts.js).
//      A ratio between two speakers does not care what the baseline is.
//   3. It composes with the per-role bias that has been in this file since
//      WEB-REBUILD-001 instead of replacing it.
//
// The ASSERTION is the guarantee. A composed bias above PER_SPEAKER_RATE_MAX
// would be a rate the synthesiser may silently refuse to deliver, so it is
// clamped here AND reported loudly, rather than left to be discovered as
// "two speakers who sound identical" in a field test.
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

// Deterministic: same speaker-label order always produces the same cast
// (first-appearance order within a role family decides which profile in
// that family a speaker gets), matching the original module's own
// determinism discipline (1.8: "same take scored twice gives identical
// numbers" -- presentation casting isn't scored, but the same discipline
// is preserved so a session can be closed and reopened and sound the same).
//
// COURTSIM-VOICE-024 -- the second argument is OPTIONAL and every existing
// call site keeps working unchanged. With no options the proceeding is
// resolved from the label registry proceedings.js fills at boot.
// =========================================================================
// COURTSIM-FIX-038 -- `witnessSex`, and why it is a stated fact rather than
// an inference.
//
// COURTSIM-IMPORT-036 §2: "The witness is a woman and the transcript says
// JOHN BLACK." It was right about the cause and right about the remedy. This
// module's refusal to read a person's sex off their NAME is correct policy
// and is not being relaxed -- `voiceSexForLabel` still reads the honorific
// and nothing else, and 'THE WITNESS' carries no honorific, so on its own it
// still resolves to nothing.
//
// What changes is that the CALLER may now state it. An Eclipse job dictionary
// carries the deponent in its `>W` field; an importer that has it can pass an
// explicit, user-visible, user-correctable answer instead of the room
// guessing. `witnessSex` is 'M', 'F' or null, it defaults to null, and null is
// today's behaviour exactly -- bf_emma, as shipped, in all five cases.
//
//     assignVoices(labels)                       -> unchanged, forever
//     assignVoices(labels, { witnessSex: 'M' })  -> am_fenrir, and scene.js
//                                                   casts a male body into
//                                                   the witness chair
//
// The voice and the body are driven from the SAME field, in the same session,
// so they cannot disagree. That is the whole lesson of COURTSIM-REVERT-013
// and it is why this is one option and not two.
// =========================================================================
export function assignVoices(speakerLabelsInOrder, options = {}) {
  const cast = {};
  const witnessSex = (options.witnessSex === 'M' || options.witnessSex === 'F')
    ? options.witnessSex : null;
  const proceedingId = options.proceedingId || proceedingIdForLabels(speakerLabelsInOrder);
  const rateCast = (_perSpeakerRateEnabled && proceedingId
    && PROCEEDING_RATE_CAST[proceedingId]) || null;
  // COURTSIM-SPEECH-008 -- the cycle counter is now per (role, pool) rather
  // than per role, so two women and two men in one proceeding each walk their
  // own pool and no honorific can push another one off its sex.
  const nextIndex = {};
  const seen = new Set();
  for (const label of speakerLabelsInOrder) {
    if (seen.has(label)) continue;
    seen.add(label);
    const role = roleForLabel(label);
    const family = FAMILIES[role] || FAMILIES[Role.UNKNOWN];
    // The honorific decides the pool. Where the family has no sexed profiles
    // (every role except COUNSEL_NAMED), or the label carries no honorific we
    // are willing to read, the pool is the whole family exactly as before --
    // so this change cannot move THE COURT, THE WITNESS, THE CLERK or any
    // other role off the voice it has always had.
    // COURTSIM-FIX-038 -- the honorific decides every pool except the witness
    // chair's, which has no honorific to read and takes the caller's stated
    // answer instead. `witnessSex` null (every shipped case, and any import
    // that does not know) leaves `sex` null and the pool whole, so profiles[0]
    // -- bf_emma -- is still what comes out.
    const sex = (role === Role.WITNESS && witnessSex)
      ? witnessSex : voiceSexForLabel(label);
    let pool = family;
    if (sex) {
      const sexed = family.filter((p) => p.sex === sex);
      if (sexed.length) pool = sexed;
    }
    const key = `${role}:${sex || '-'}`;
    const i = nextIndex[key] || 0;
    // COURTSIM-VOICE-024 -- the pool pick is unchanged and still decides the
    // default; the override is applied AFTER it and only where a proceeding
    // names one, so the cycle counter and every unnamed speaker behave
    // exactly as they did before this pass.
    const profile = overrideVoice(pool[i % pool.length], label, proceedingId);
    // COURTSIM-VOICE-024 -- the per-speaker tier rides on the family bias.
    // `speed` is the field main.js already reads and passes to
    // prosodyForTurn() as `roleBias`, so this needs no change outside this
    // lane. `rateTier` and `familyBias` are carried alongside it purely so
    // the instrument and the report can show the arithmetic rather than
    // assert it.
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

// =========================================================================
// COURTSIM-VOICE-024 -- THE INSTRUMENT. The founder's own console, one call,
// no session required:
//
//     __courtsimSpeakerRates()        // uses his persisted slider value
//     __courtsimSpeakerRates(190)     // or any WPM he is considering
//
// It prints, per proceeding and per speaker: the family bias, the
// per-speaker tier, the composed multiplier, what that ASKS the synthesiser
// for, what the synthesiser will actually DELIVER after its own clamp, and
// whether those two differ. A rate that cannot be delivered is the one
// failure mode this whole feature has, so it is the column the table is
// built around.
//
// Registered from this module rather than from main.js on purpose: main.js
// belongs to a concurrent lane this pass, and an instrument the founder
// cannot run is not an instrument.
// =========================================================================
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
  // COURTSIM-VOICE-048 -- the SLOWEST TURN column. The composed bias is only
  // half of what a speaker is actually given; tts.js multiplies the turn type
  // on top of it, and until this pass nothing showed the product. The judge
  // was the only speaker ever given RULING (0.94) or ORDER (0.92), so the
  // table could look reasonable while what he heard was 0.703 x 0.94 = 0.661.
  // The column is the worst turn type that speaker's role can draw, after
  // TOTAL_RATE_FLOOR, so the number in it is the real slowest thing he can
  // hear from that chair.
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
  // COURTSIM-VOICE-048 -- the one line the founder's own complaint is about.
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
