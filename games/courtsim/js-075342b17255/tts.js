// WEB-REBUILD-001 -- in-browser text-to-speech via kokoro-js
// (onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0).
//
// SPEED-VOLUME-001 MEASURED BUG, fixed here: the founder heard TTS speech
// that "sounded like Swedish... like they sped it up." That is NOT a
// sample-rate mismatch (checked first, per the job brief's own hypothesis,
// and ruled out with direct evidence: kokoro's declared sampling_rate,
// its own toWav() header, and the browser's native decodeAudioData all
// agree at 24000Hz/4.05s for the same test line -- see
// reports/SPEED_VOLUME_001.md). The real cause: `dtype: 'q8'` (int8
// quantization) corrupts this model's actual audio CONTENT on this
// machine's WebGPU backend -- the exact same bug class already measured
// for Xenova/whisper-tiny.en in reports/WEB_RESEARCH_001.md (garbage
// output, 12x slower), just never tested for kokoro's own output content
// until this job's whisper-roundtrip check caught it. `dtype: 'fp16'` was
// also tested and is WORSE (pure hallucinated punctuation tokens, no real
// speech at all). Passing `dtype: 'fp32'` explicitly turned out to be a
// SECOND, separate bug -- kokoro-js silently did not fetch a distinctly-
// named full-precision file for that string (verified via Cache Storage
// inspection: no unquantized onnx/model.onnx entry ever appeared) and fell
// back to quantized weights anyway, with no error thrown. OMITTING the
// `dtype` option entirely is what actually loads the library's true
// default, full-precision weights (onnx/encoder_model.onnx +
// onnx/decoder_model_merged.onnx -- distinctly named, no "_quantized" or
// "_fp16" suffix) and is the only configuration that round-trips through
// Whisper back to the original source text -- see
// reports/SPEED_VOLUME_001.md for the side-by-side transcripts. Costs a
// larger one-time download (~326MB vs ~92MB for q8) -- accepted
// deliberately, matching the same intelligibility-over-size tradeoff
// already made for the ASR model.
export class TtsEngine {
  constructor() {
    this.tts = null;
    // SPEED-VOLUME-001 STEP 4's pre-synthesis buffering pipeline (main.js)
    // deliberately kicks off the NEXT utterance's synthesis while the
    // current one is still playing. kokoro's underlying onnxruntime-web
    // session has the same one-call-at-a-time constraint already measured
    // and fixed for the Whisper ASR session in asr.js ("Session already
    // started" / "Session mismatch" if two inference calls overlap) --
    // this queue serializes every synthesize() call so "ahead of
    // playback" means QUEUED and worked on continuously in the
    // background, never actually concurrent with itself.
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

  // Returns a ready-to-play AudioBuffer-like {audio: Float32Array, sampling_rate}.
  // Queued (see constructor) -- safe to call for utterance N+1 before
  // utterance N's call has resolved.
  async synthesize(text, voiceId, speed = 1.0) {
    const call = this._queue.then(() => this.tts.generate(text, { voice: voiceId, speed }));
    this._queue = call.catch(() => {});
    const result = await call;
    return result; // { audio: Float32Array, sampling_rate }
  }
}

// SPEED-VOLUME-001 -- measured this session: at kokoro's own `speed: 1.0`,
// a 23-word line ("At approximately nine forty in the evening, I was
// stationed near the intersection of Birch and Nolan, watching traffic
// move through the area.") synthesized at 141.2 WPM (9.775s). kokoro's
// `speed` parameter is a multiplier on ITS OWN internal rate, not a WPM
// value directly -- this constant converts a player-chosen target WPM
// into the `speed` value that achieves it. Re-measured, not assumed, at
// three settings in reports/SPEED_VOLUME_001.md (STEP 5's requested
// 100/180/250 table).
// COURTSIM-VOICE-024 -- RE-MEASURED, AND THE NUMBER DOES NOT REPRODUCE.
// The identical 23-word line, at speed 1.0, in kokoro-js 1.2.1 against
// onnx-community/Kokoro-82M-v1.0-ONNX, measured THIS session:
//
//     node, onnxruntime CPU  : 198000 samples @ 24 kHz = 8.250 s = 167.3 WPM
//     the founder's browser  : 198000 samples @ 24 kHz = 8.250 s = 167.3 WPM
//                              (WebGPU, localhost:8080, live page)
//
// Byte-identical in both engines, and 18.5% faster than the 141.2 recorded
// above. So this constant is NOT reproducible on the line it was taken from.
//
// IT IS DELIBERATELY NOT CHANGED, for two measured reasons:
//   1. Delivered rate is TEXT-dependent, not a single constant. Over 109
//      words of real case_02 content at speed 1.0 the same engine measures
//      131.2 WPM (bm_george) to 157.9 WPM (am_liam) -- a 20% spread across
//      voices alone, mean about 147. 141.2 sits inside that spread; the
//      167.3 single-line figure is its top end, not a correction to it.
//   2. Changing it silently re-scales the founder's persisted 254 setting,
//      every duration COURTSIM-CONTENT-020 measured, and the "voice caps at
//      261" readout he has said he finds useful. That is a whole-build
//      re-calibration, not this lane's job.
//
// WHAT THIS LANE DOES INSTEAD: every per-speaker rate below is a RATIO, so
// none of it depends on this constant being exactly right. See
// PER-SPEAKER RATE in voice_cast.js.
export const KOKORO_BASELINE_WPM = 141.2;

export function wpmToSpeed(targetWpm, roleBias = 1.0) {
  return (targetWpm / KOKORO_BASELINE_WPM) * roleBias;
}

// COURTSIM-VOICE-024 -- WHAT THE SYNTHESISER WILL ACTUALLY DELIVER FOR A
// REQUEST, INCLUDING A PER-SPEAKER BIAS.
//
// main.js has carried a private one-argument version of this since
// COURTSIM-SPEED-LIPS-005, and it is what produces the "(voice caps at 261)"
// message. That version cannot see a per-speaker bias, so the moment one
// speaker is rated differently from the rest the readout would describe a
// ceiling for a speaker who is not the one being clamped. Exported here,
// with the bias argument, so there is ONE definition of the ceiling rather
// than two that can drift -- the mistake COURTSIM-REVERT-013 recorded when
// main.js kept its own copy of roleForLabel()'s honorific list.
//
// MEASURED, this session, on 6 real case_02 cues (109 words), am_liam:
//     requested  50 -> delivered  83.2   (clamped at SYNTH_SPEED_MIN)
//     requested 100 -> delivered 109.1
//     requested 150 -> delivered 163.2
//     requested 200 -> delivered 239.8
//     requested 254 -> delivered 268.0   <- the founder's persisted setting
//     requested 300 -> delivered 271.7   (clamped at SYNTH_SPEED_MAX)
// The real ceiling on real content is about 272 WPM, not 261; 261 is what
// this constant PREDICTS. The prediction is kept (see above) and the
// measurement is recorded here so nobody has to guess again.
export function deliverableWpm(targetWpm, roleBias = 1.0) {
  const raw = wpmToSpeed(targetWpm, roleBias);
  const used = Math.min(SYNTH_SPEED_MAX, Math.max(SYNTH_SPEED_MIN, raw));
  return Math.round(used * KOKORO_BASELINE_WPM);
}

// The largest per-speaker rate multiplier that the synthesiser can still
// DELIVER at a given global WPM. Above this the clamp eats the difference
// and two speakers with different rates produce identical audio.
//
// MEASURED, this session, 6 real cues, am_liam, and this is the single most
// important number in this file for the founder:
//
//     global 150 WPM  bias 1.30 -> +43.4% faster.  REAL.
//     global 200 WPM  bias 1.30 -> +13.1% faster.  PARTLY EATEN.
//     global 254 WPM  bias 1.15 -> + 1.3% faster   ) all three produce the
//                     bias 1.30 -> + 1.3% faster   ) SAME clamped audio.
//                     bias 1.45 -> + 1.3% faster   )
//
// AT HIS PERSISTED 254 WPM THERE IS ESSENTIALLY NO HEADROOM ABOVE THE ROOM.
// A "fast talker" built as a bias greater than 1.0 is invisible at his own
// setting. That is why voice_cast.js builds the spread DOWNWARD from 1.0
// instead -- see PER_SPEAKER_RATE_MAX there.
export function maxDeliverableBias(globalWpm) {
  return SYNTH_SPEED_MAX / wpmToSpeed(globalWpm, 1.0);
}

// =========================================================================
// COURTSIM-VOICE-024 -- THE SYNTHESISER STOPS SAYING ALL THE WORDS ABOVE
// kokoro speed 1.33, AND THE FOUNDER HAS BEEN RUNNING AT 1.80.
//
// THIS IS THE MOST IMPORTANT NUMBER IN THIS FILE. It is not a quality
// opinion; it is a scoring defect, because the reference text the trainee is
// marked against IS the text handed to kokoro, and above this speed kokoro
// does not say all of it.
//
// HOW IT WAS FOUND. Sweeping a per-speaker rate, the total audio for 12 real
// case_04 cues fell by about 18 seconds between speed 1.328 and 1.346 -- far
// more than a 1.4% speed change can produce. Walking ONE cue finely, with
// lead-in and trailing silence measured separately so "it just trimmed the
// silence" could be ruled out rather than assumed:
//
//   speed  total_s  trail_s  speech_s   speech x speed (constant if it is
//                                        merely speaking faster)
//   1.32     9.450    0.583     8.617    11.374
//   1.33     9.250    0.582     8.418    11.196
//   1.34     8.325    0.574     7.504    10.055   <- 11% of the utterance is
//   1.35     8.150    0.572     7.332     9.898      simply GONE, in one step
//
// The voiced fraction is 0.65-0.66 at every row, so it is not silence being
// trimmed. It is speech.
//
// WHAT IT COSTS, THROUGH THE APP'S OWN RECOGNISER AND THE APP'S OWN SCORER.
// One cue ("The straight leg raise test was positive on the right at 30
// degrees, and I documented decreased sensation in the L5 distribution along
// the lateral calf and the dorsum of the foot."):
//
//   speed 1.0623 (150 WPM) : all 32 words. 0 charged to the trainee.
//   speed 1.34   (189 WPM) : the leading "The" is GONE. 1 charged.
//   speed 1.7989 (254 WPM) : "The" gone AND "at 30 degrees" spoken as
//                            "at the eight degrees". 3 charged -- INCLUDING
//                            A NUMBER, the class COURTSIM-CONTENT-020 spent
//                            its whole pass protecting.
//
// And across 12 cues / 275 reference words, the app's own score_take():
//
//   slider 150 WPM ->  12 word-tokens charged to the trainee   4.36%
//   slider 187 WPM ->  17                                      6.18%
//   slider 195 WPM ->  31                                     11.27%
//   slider 254 WPM ->  46                                     16.73%   <-- HIS
//   slider 261 WPM ->  44                                     16.00%
//
// AT HIS OWN PERSISTED SETTING HE IS BEING MARKED WRONG FOR ROUGHLY ONE WORD
// IN SIX, FOR WORDS THE MACHINE NEVER SPOKE. That is 3.8x the rate at the
// 150 WPM default. COURTSIM-CONTENT-020 predicted this and could not test it
// ("I did not run the cases at the founder's own current setting ... error
// rates will also be higher at that speed"). This is the test.
//
// This constant is NOT enforced here. Clamping the founder's own slider
// without telling him would be the same class of defect in the other
// direction, and the slider belongs to main.js. It is exported so the
// readout can say it -- see the handoff in reports/COURTSIM_VOICE_024.md --
// and so voice_cast.js's per-speaker report can mark which speakers are
// above it.
//
// 1.33 is the last speed measured clean, not the midpoint of the step; the
// first lossy speed measured is 1.34. The honest statement is "clean at or
// below 1.33, lossy at or above 1.34".
// =========================================================================
export const CONTENT_SAFE_SPEED_MAX = 1.33;
export const CONTENT_SAFE_WPM_MAX = Math.floor(CONTENT_SAFE_SPEED_MAX * KOKORO_BASELINE_WPM); // 187

// Does this requested rate keep every word the reference claims was spoken?
export function isContentSafeWpm(targetWpm, roleBias = 1.0) {
  return wpmToSpeed(targetWpm, roleBias) <= CONTENT_SAFE_SPEED_MAX;
}

// =========================================================================
// COURTSIM-FIX-X -- CONVERSATIONAL PROSODY. THE FOUNDER DIAGNOSED THE CAUSE
// CORRECTLY AND THIS BLOCK IS THE ANSWER TO HIS DIAGNOSIS, NOT TO THE
// SYMPTOM.
//
// His words: "It sounds like people pre-recorded it... people who never
// spoke with each other or couldn't hear each other pre-recorded these
// things. And then if they read what they were supposed to read and they
// just read it any way they wanted. And then they took all of those
// recordings that were just random and then just put them together."
//
// THAT IS A LITERALLY ACCURATE DESCRIPTION OF THE PIPELINE. Every line went
// through `state.tts.synthesize(u.text, profile.voice, speed)` with `speed`
// derived from exactly two things: the global WPM slider, and a fixed
// per-ROLE bias from voice_cast.js. Nothing in that call knew what the
// previous line was, who said it, whether it was a question, or how it
// ended. Independent reads, spliced. He is describing the architecture.
//
// -------------------------------------------------------------------------
// WHAT THE SYNTHESISER CAN AND CANNOT EXPRESS -- STATED PLAINLY FIRST,
// BECAUSE THE BRIEF ASKS FOR IT AND BECAUSE CLAIMING EXPRESSIVENESS THAT
// DOES NOT EXIST WOULD BE THE WORSE FAILURE.
//
// kokoro-js v1.2.1's `generate(text, opts)` accepts exactly TWO options:
// `voice` and `speed`. There is no pitch parameter, no energy parameter, no
// emphasis markup, no SSML, no phoneme-level control. Read directly from the
// call signature this file already uses. So taken alone:
//
//   RATE      -- YES, natively, per line, pitch-preserving (`speed`).
//   TIMBRE    -- YES, per speaker (`voice`); already used by voice_cast.js.
//   PITCH     -- NO. Not available from kokoro at all.
//   ENERGY    -- NO. Not available from kokoro at all.
//   EMPHASIS  -- NO.
//
// THAT WOULD HAVE BEEN THE END OF IT, except that the synthesiser is not the
// only stage in the chain. The audio is played through a Web Audio
// AudioBufferSourceNode, and THAT node has `playbackRate`, which resamples:
// it changes rate and pitch TOGETHER, by the same factor. On its own that is
// useless here (it is the chipmunk knob). Combined with kokoro's own
// pitch-preserving `speed`, it is two knobs on two coupled axes, and two
// such knobs solve for both axes independently:
//
//     effective rate  E = S x R        (kokoro speed, then resampling)
//     pitch ratio     P = R            (resampling only)
//   =>  R = P          and          S = E / P
//
// So a line CAN be rendered at a chosen rate AND a chosen pitch, exactly,
// with no new library and no DSP. `prosodyForTurn()` below returns that
// solved pair. This is the finding that makes the rest of this block
// possible, and it is arithmetic, not an estimate.
//
//   PITCH  -- YES, via the solve above. HONEST LIMIT: resampling moves the
//             FORMANTS with the pitch, so a large P makes a speaker sound
//             like a different, smaller or larger person rather than like
//             the same person speaking higher. PITCH_RANGE below caps |P-1|
//             at 6% (~100 cents) for that reason, which is ample for
//             intonation and well short of identity change. Formant-
//             preserving pitch shift would need a phase vocoder; it is NOT
//             implemented and is NOT claimed.
//   ENERGY -- YES, via a per-utterance GainNode in main.js's play path. This
//             is loudness only. It is NOT vocal effort: a shouted line and a
//             turned-up quiet line differ in spectrum, and only the second
//             is available here. Small ranges are honest; large ones are
//             not, so ENERGY_RANGE is capped at +/-2.5 dB.
//   TIMING -- YES, fully, and it is the axis with the most headroom. Gaps,
//             breath, hesitation and overlap are all pure scheduling and owe
//             the synthesiser nothing.
//
// -------------------------------------------------------------------------
// THE FOUR THINGS THE BRIEF ASKS FOR, AND WHERE EACH ONE IS:
//
//   1. Vary rate/pitch/energy per speaker AND per line function.
//      -> classifyTurn() decides the function; ROLE_VOICE and TURN_PROSODY
//         supply the deltas; prosodyForTurn() solves them into (S, R, gain).
//   2. Carry state across the turn boundary -- an answer should not start
//      from a cold reset.
//      -> prosodyForTurn() takes `prev` (the previous turn's own solved
//         plan) and pulls the new line's starting pitch toward where the
//         last one ENDED, by ANSWER_PITCH_CARRY. This is the single change
//         that most directly addresses "they don't match a conversation two
//         people would be having with each other."
//   3. Vary the inter-line gap by turn type.
//      -> TURN_PROSODY.gapMs, plus jitter. A single fixed gap is exactly
//         what reads as spliced, so a fixed gap per TYPE would only be the
//         same defect one level up -- hence the jitter, which is deliberate
//         and is not noise for its own sake.
//   4. Breath before a long line, hesitation, occasional overlap.
//      -> leadSilenceMs (breath), the `thinking` turn type (hesitation),
//         and a NEGATIVE gap on interruptions (overlap).
//
// NONE OF THE NUMBERS BELOW ARE FITTED TO RECORDINGS OF REAL COURTROOM
// AUDIO. This build has no such corpus. They are reasoned from published
// conversation-analytic ranges for turn-taking gaps (roughly -100 to +700 ms,
// clustering near 200) and from the structural facts of courtroom exchange
// (an objection interrupts by definition; a judge is not hurried). They are
// a first cut meant to be judged by ear and moved. Every one of them is in
// this one table so that moving them is a one-line edit and not an
// archaeology exercise.
// =========================================================================

// Caps. Both exist to stop a plausible-looking table from producing an
// implausible-sounding room, and both are deliberately conservative.
const PITCH_RANGE = 0.06;   // max |P - 1|. ~100 cents. Beyond this, formant drift reads as a different person.
const ENERGY_RANGE_DB = 2.5; // max |gain| in dB. Loudness, not vocal effort -- see the block comment.
// kokoro's own `speed` is clamped to this. Outside roughly this range its
// output quality degrades audibly; the two-knob solve can otherwise push S
// somewhere the model was never meant to go when E and P disagree strongly.
// COURTSIM-SPEED-LIPS-005 -- EXPORTED, because these two numbers are the
// reason both ends of the founder's Speed slider silently under-deliver and
// a control cannot tell the truth about a limit it cannot see. MEASURED this
// pass, straight out of this clamp: the slider runs 50-300 WPM (index.html)
// but 50 is delivered as 78 and 300 as 261. main.js's readout now names the
// ceiling instead of reporting a request the machine never fills.
export const SYNTH_SPEED_MIN = 0.55;
export const SYNTH_SPEED_MAX = 1.85;

// COURTSIM-VOICE-048 -- the floor on (per-speaker tier x per-turn-type rate).
// Exported so voice_cast.js's own instrument can report against it and so
// nothing has to re-derive it. The full reasoning, and the measurement that
// set it at 0.90, is in the block inside prosodyForTurn() where it is used.
export const TOTAL_RATE_FLOOR = 0.90;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dbToGain = (db) => Math.pow(10, db / 20);

// -------------------------------------------------------------------------
// WHAT KIND OF TURN IS THIS. Decided from the line's own text and from the
// line before it -- never from anything the player did, so the room's rhythm
// is a property of the transcript and is identical on every run of the same
// proceeding. (Same determinism discipline assignVoices() already keeps.)
// -------------------------------------------------------------------------
const OBJECTION_RE = /^\s*(objection|your honou?r,?\s*(i\s*)?object)\b/i;
const RULING_RE = /^\s*(sustained|overruled|so ordered)\b/i;
const ORDER_RE = /\b(all rise|be seated|you may (sit|step down|proceed)|order in the court)\b/i;

// A question is not just a '?'. Transcripts of live testimony frequently
// carry a question with no terminal mark at all, and counsel's "Directing
// your attention to..." is functionally a question. Both forms are matched,
// because treating a real question as a statement is what removes the
// answering intonation this whole block exists to restore.
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

// Words in the PREVIOUS question above which the answer is treated as
// needing thought. Reasoned: a long or multi-clause question is the case
// where a real witness visibly pauses, and a flat gap there is the single
// most machine-like moment in the current build.
//
// COURTSIM-SPEECH-008 -- RAISED FROM 18 TO 30, AND THE MEASUREMENT IS WHY.
//
// FOUNDER, VERBATIM: "they ask them a question, was, tell me, did this
// happen that night? And then it goes back to the other person, and then
// we're just looking at them for a while... It's not gonna ask the question,
// and then we're looking at the person for like a minute."
//
// At 18, the ONLY two THINKING turns in the whole shipped content set were
// case_01 #15 and #17 -- and the questions that "earned" them were 20 and 19
// words. Both are ordinary leading cross-examination questions ("And isn't
// it standard practice for a supplier to hold a partial shipment when an
// account is past due?"). Nothing about either requires a witness to work
// anything out. 18 words is simply not a long question in a transcript of
// live testimony; it is an average one, which made the slowest gap in the
// table fire on the most routine exchange in the proceeding.
//
// 30 was chosen against the shipped content, not against a round number: it
// is above every ordinary question in all three proceedings (longest is 20
// words) and below a genuinely compound, multi-clause question. The
// hesitation-marker branch below is untouched, so an answer that actually
// opens with "Well," or "I'm not sure" still earns the beat on its own
// evidence. NET EFFECT, MEASURED: THINKING turns across all three
// proceedings go 2 -> 0, and both of those boundaries become ANSWER.
const THINKING_QUESTION_WORDS = 30;

// `sameSpeaker` is passed in rather than derived from `role`, deliberately:
// two different named counsel share the COUNSEL_NAMED role, and comparing
// roles would classify one lawyer following another as "the same speaker
// carrying on" -- collapsing the single most important exchange in a
// transcript into a continuation, with the tight 90 ms gap that goes with it.
export function classifyTurn(text, role, prevText, prevType, sameSpeaker) {
  const t = String(text || '');
  if (OBJECTION_RE.test(t)) return TurnType.OBJECTION;
  if (role === 'COURT' && RULING_RE.test(t)) return TurnType.RULING;
  if (ORDER_RE.test(t)) return TurnType.ORDER;

  // COURTSIM-FIX-X -- THE QUESTION TEST MUST COME BEFORE THE sameSpeaker
  // TEST. Caught in review, and it was a real prosody defect with a second-
  // order consequence worse than the first.
  //
  // Counsel routinely asks two or three lines in a row -- a preamble, then
  // the question. With sameSpeaker tested first, the actual question was
  // classified CONTINUATION: it lost its terminal rise and its 260 ms gap.
  // WORSE, the next line then saw `prevType === CONTINUATION`, so the
  // `prevType === QUESTION` branch below never fired and the witness's reply
  // was classified STATEMENT rather than ANSWER or THINKING -- losing the
  // pitch carry across the boundary as well. One ordering mistake silently
  // disabled the single change this whole job exists to make, on exactly the
  // exchange that matters most in a transcript.
  const isQuestion = /\?\s*$/.test(t.trim()) || QUESTION_LEAD_RE.test(t);
  if (isQuestion) return TurnType.QUESTION;
  if (sameSpeaker) return TurnType.CONTINUATION;

  if (prevType === TurnType.QUESTION || prevType === TurnType.OBJECTION) {
    // `.split(/\s+/)` returns [''] for an empty string, i.e. a length of 1.
    // A match count is the honest zero. Caught in review.
    const prevWords = (String(prevText || '').match(/\S+/g) || []).length;
    // An answer to a long question, or any answer that opens with a real
    // hesitation marker, is a THINKING turn.
    if (prevWords >= THINKING_QUESTION_WORDS || /^\s*(well|um+|uh+|i think|let me|i believe|i'?m not sure)\b/i.test(t)) {
      return TurnType.THINKING;
    }
    return TurnType.ANSWER;
  }
  return TurnType.STATEMENT;
}

// -------------------------------------------------------------------------
// THE TABLE. `gapMs` is the silence BEFORE this line. Negative means overlap
// -- this line starts before the previous one has finished, which is what an
// interruption actually is and is the one case where a positive gap is
// simply wrong.
//
// `rate`/`pitch` are MULTIPLIERS on the speaker's own baseline, not absolute
// values, so the global WPM slider and each role's voice_cast bias both
// still compose on top exactly as before.
//
// `pitchEnd` is where the line FINISHES relative to where it started -- the
// terminal contour. A question rises; a statement falls; a ruling falls hard
// because it is final. main.js turns this into a playbackRate ramp across
// the last part of the utterance, which is the only intonation contour this
// chain can produce.
//
// -------------------------------------------------------------------------
// COURTSIM-SPEECH-008 -- THESE NUMBERS WERE MEASURED AND THEN DELIBERATELY
// LEFT ALONE. DO NOT "FIX" THEM WITHOUT RE-MEASURING FIRST.
//
// The job that produced this note was sent to hunt a "very long hole after a
// simple question" and expected to find it here. It is NOT here. Solving
// every boundary in all three shipped proceedings through prosodyForTurn()
// -- i.e. these numbers WITH their jitter and breath actually applied, which
// is the only form in which they ever reach a listener -- gives:
//
//     DESIGNED gap, n=56 boundaries:
//       min 43 ms | p25 85 | median 128 | p75 183 | max 619 | mean 170
//
//     by type:  continuation  56 ms     answer        85 ms
//               statement    146 ms     question     169 ms
//               thinking     380 ms     order        539 ms
//
// The brief's target for a simple question-to-answer transition was "roughly
// 200 ms, often near zero." The ANSWER row measures 85 ms and the QUESTION
// row 169 ms. This table was already at target before the job started.
//
// The raw `gapMs` fields below read higher than the delivered medians above
// (ANSWER says 120, delivers 85) because `jitter` is signed and the content
// set's stable hash lands below centre more often than above on this sample.
// That is a property of THESE 56 lines, not a bias in the solver -- do not
// "correct" for it by raising the table, or a different transcript will run
// long.
//
// The real defect was synthesis latency arriving dressed as a pause: up to
// 5,610 ms of it on ONE boundary whose designed gap was 137 ms. Fixed in
// main.js's look-ahead depth, not here. See reports/COURTSIM_SPEECH_008.md.
// -------------------------------------------------------------------------
export const TURN_PROSODY = {
  [TurnType.QUESTION]: {
    gapMs: 260, jitter: 0.30, rate: 1.00, pitch: 1.010, pitchEnd: +0.022, energyDb: +0.4, breathMs: 0,
    // Counsel takes a beat to register the answer before the next question.
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

// A long line gets a breath before it whatever its type. Reasoned: a speaker
// audibly takes air before a long sentence, and its absence is part of what
// makes synthesised dialogue sound unbreathing.
const BREATH_TRIGGER_WORDS = 28;
const BREATH_MS = 220;

// How much of the previous line's ENDING pitch is carried into this line's
// STARTING pitch. 0 would be the cold reset the founder is complaining
// about; 1 would make every line inherit the last one's contour wholesale
// and the room would drift. 0.45 is a first cut, chosen to be audible as
// "these two were listening to each other" without accumulating.
const ANSWER_PITCH_CARRY = 0.45;

// Deterministic jitter. Math.random() would make the same proceeding sound
// different on every run, which breaks the "same take twice" discipline this
// codebase keeps everywhere else AND makes a field test unrepeatable -- the
// founder could not tell a change in the code from a change in the dice.
// This is a plain integer hash of the utterance index: fixed per line,
// uniform across lines, and identical on every run.
function stableJitter(index, salt) {
  let h = (index * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h / 4294967295) * 2 - 1; // -1..+1
}

// -------------------------------------------------------------------------
// THE SOLVE. Returns everything both stages need:
//   synthSpeed   -> kokoro's own `speed` argument
//   playbackRate -> AudioBufferSourceNode.playbackRate at utterance START
//   playbackRateEnd -> where that rate ramps to by the end (the contour)
//   gain         -> per-utterance linear gain multiplier
//   gapMs        -> silence before this line; negative means overlap
//   leadSilenceMs-> breath, inserted as real silence after the gap
//   pitchEndAbs  -> this line's finishing pitch, for the NEXT line to carry
// -------------------------------------------------------------------------
export function prosodyForTurn({ index, text, role, wpm, roleBias = 1.0, turnType, prev = null }) {
  const spec = TURN_PROSODY[turnType] || TURN_PROSODY[TurnType.STATEMENT];

  // --- pitch, including the carry across the boundary (requirement 2) ---
  let pitch = spec.pitch;
  if (prev && (turnType === TurnType.ANSWER || turnType === TurnType.THINKING || turnType === TurnType.RULING)) {
    // A question that ended high is answered from a related place, not from
    // a cold reset. This is the line that makes two utterances sound like
    // they were in the same room as each other.
    pitch = pitch + (prev.pitchEndAbs - 1) * ANSWER_PITCH_CARRY;
  }
  pitch += stableJitter(index, 11) * 0.006; // a real speaker is not identical twice
  pitch = clamp(pitch, 1 - PITCH_RANGE, 1 + PITCH_RANGE);

  const pitchEndAbs = clamp(pitch + spec.pitchEnd, 1 - PITCH_RANGE, 1 + PITCH_RANGE);

  // --- rate ---
  const rateMul = spec.rate * (1 + stableJitter(index, 23) * 0.025);

  // =======================================================================
  // COURTSIM-VOICE-048 -- THE TWO SLOW LAYERS MAY NOT COMPOUND PAST HERE.
  //
  // `roleBias` is voice_cast.js's per-speaker tier. `rateMul` is this table's
  // per-turn-type rate. Until this pass nothing looked at their PRODUCT, and
  // the product is what the listener actually gets. They are not independent:
  // RULING (0.94) and ORDER (0.92) are the two slowest entries in the table
  // and only the judge is ever given either, while the fast talker's
  // commonest type, ANSWER, is 1.02. The slow tier and the slow turn type
  // land on the same speaker, every time, in the same direction.
  //
  // MEASURED, real synthesiser, his own 155 slider, before this guard: THE
  // COURT's effective rate ran 0.71 (ruling) to 0.78 (statement) while the
  // room's fastest speaker ran 0.99 to 1.09. Delivered: 102.8 WPM against
  // 147.8 in case_04. Articulated, silence excluded: 157.1 against 265.1.
  //
  // FOUNDER, VERBATIM: "his is like ridiculously slower. It sounds like he's
  // slow-motion lagging his voice."
  //
  // The floor is on the PRODUCT, deliberately, and not on either table:
  //
  //   - Editing TURN_PROSODY's `rate` column would be the wrong fix. Those
  //     numbers were measured by COURTSIM-SPEECH-008 against the shipped
  //     content and its header says, in terms, not to change them without
  //     re-measuring. They are right FOR A TURN. What was wrong was letting
  //     a turn multiplier ride on top of an already-reduced speaker.
  //   - Lowering the tiers alone would not have held either: a future cast
  //     or a future turn type could reproduce this in one line, silently.
  //     A floor on the product cannot be reintroduced by either table.
  //
  // 0.90 is the value, and it is chosen against the top of the room rather
  // than as a round number: the fastest ordinary delivery in the build is a
  // RIPS speaker answering, 1.00 x 1.02 = 1.02, so the widest ordinary
  // spread this permits is 1.02 / 0.90 = 1.133x. OBJECTION (1.10) can still
  // reach 1.222x against a floored speaker, and that is intended -- an
  // objection is a two-second interruption by design, the founder approved
  // the interjections in this session by name, and nobody hears a spread
  // against a line that is over before it registers as a rate.
  //
  // It is never silent. `totalRateFloored` rides on the plan beside
  // `rateClamped`, and __courtsimSpeakerRates() prints it.
  // =======================================================================
  const totalRaw = roleBias * rateMul;
  const totalRate = Math.max(TOTAL_RATE_FLOOR, totalRaw);
  const totalRateFloored = totalRate !== totalRaw;

  // E is the effective rate the listener hears, in kokoro-baseline units.
  const E = wpmToSpeed(wpm, 1.0) * totalRate;

  // --- THE TWO-KNOB SOLVE (see the block comment: R = P, S = E / P) ---
  const R = pitch;
  // COURTSIM-VOICE-024 -- THE CLAMP IS NO LONGER SILENT.
  //
  // Before this pass the line below was the whole story: E/R was clamped and
  // nothing downstream could tell whether it had been. With every speaker on
  // the same rate that was survivable, because the readout's own
  // deliverableWpm() reached the same conclusion from the slider value
  // alone. With PER-SPEAKER rates it is not: one speaker can be clamped
  // while the rest of the room is not, and the readout, reading only the
  // slider, would report a rate that speaker is not being given.
  //
  // So the plan now carries the truth. `rateClamped` is the fact;
  // `deliveredWpm` is what this line will actually be spoken at, computed
  // from the value that was USED rather than the one that was asked for.
  // main.js can then say so -- see the handoff in reports/COURTSIM_VOICE_024.md.
  const Sraw = E / R;
  const S = clamp(Sraw, SYNTH_SPEED_MIN, SYNTH_SPEED_MAX);
  const rateClamped = S !== Sraw;

  // --- energy ---
  const energyDb = clamp(spec.energyDb + stableJitter(index, 37) * 0.35, -ENERGY_RANGE_DB, ENERGY_RANGE_DB);

  // --- timing ---
  const words = (String(text || '').match(/\S+/g) || []).length; // see classifyTurn's note on split()
  const jitterMs = spec.gapMs * spec.jitter * stableJitter(index, 53);
  const gapMs = Math.round(spec.gapMs + jitterMs);
  const leadSilenceMs = Math.round(spec.breathMs + (words >= BREATH_TRIGGER_WORDS ? BREATH_MS : 0));

  return {
    turnType,
    // COURTSIM-FIX-X -- the WPM this plan was SOLVED with. The live speed
    // trim (main.js applyLiveSpeedTrim) needs it to know how far the slider
    // has moved since this line's audio was rendered -- which is the whole
    // quantity it has to make up for, and it cannot be read off the slider
    // because the slider has already moved.
    wpm,
    synthSpeed: S,
    playbackRate: R,
    playbackRateEnd: pitchEndAbs,
    gain: dbToGain(energyDb),
    gapMs,
    leadSilenceMs,
    pitchEndAbs,
    // COURTSIM-VOICE-024 -- the per-speaker rate, and whether it survived.
    // `roleBias` is this speaker's own multiplier on the global WPM (the
    // composed family x per-speaker value voice_cast.js assigns).
    // `requestedSpeakerWpm` is what that asks for; `deliveredWpm` is what
    // the synthesiser will produce after the clamp. When they differ,
    // `rateClamped` is true and NOTHING may report the requested figure as
    // if it were the delivered one.
    roleBias,
    rateClamped,
    // COURTSIM-VOICE-048 -- `requestedSpeakerWpm` is the rate that was ASKED
    // for after the floor, not before it. Reporting the pre-floor product
    // here would be the same defect as reporting a clamped rate as if it had
    // been delivered, which is precisely what VOICE-024 refused to do one
    // layer down. `totalRateFloored` is the fact, carried beside it, so a
    // readout can say which speakers the floor is holding up and on which
    // turn types rather than leaving it to be inferred from the tables.
    requestedSpeakerWpm: Math.round(wpm * totalRate),
    totalRate,
    totalRateFloored,
    deliveredWpm: Math.round(S * R * KOKORO_BASELINE_WPM),
    // Carried for the instrument and the report, so a gap distribution can be
    // read BY TURN TYPE rather than as one undifferentiated number -- which
    // is the same mistake `proceeding:running` made with blocking time.
    _debug: { E, rateMul, totalRaw, energyDb, words, why: spec.why },
  };
}

// The old single floor, kept ONLY as the value used when no plan exists
// (a failed synthesis, a read-back re-anchor). Everything on the normal path
// now goes through the table above.
export const FALLBACK_GAP_MS = 180;

// Plays a kokoro output through the given AudioContext and resolves when
// playback finishes, so the caller can pace the courtroom's utterance
// sequence off real playback duration (mirrors the desktop build's
// duration_s-driven advance_timer in godot/courtsim_probe/main.gd).
// `destinationNode` defaults to the context's own speakers but SPEED-
// VOLUME-001 passes a GainNode here so the volume slider (0-100%) affects
// only this program's own audio, never the system/OS volume.
// COURTSIM-FIX-U -- two defects, both on the read-back (interrupt) path,
// which is the only caller of this function that main.js still has.
//
// 1. `Float32Array.from(synthResult.audio)` walked the whole utterance
//    through the ITERATOR PROTOCOL to copy a typed array into a typed array.
//    copyToChannel() takes the Float32Array kokoro already returned and does
//    the copy as a memcpy. The same waste was removed from the main speak
//    loop (see main.js prepareAudioBuffer); leaving it here would have meant
//    the claim "the only work left at a boundary is src.start()" held for
//    ordinary lines and quietly failed for interrupts.
//
// 2. THE SOURCE WAS UNSTOPPABLE. This function created an
//    AudioBufferSourceNode that it never handed back, so nothing outside
//    could stop it. restartProceeding() and Finish & Score both stop
//    `state.currentSource` -- and during an interrupt that was null, because
//    the judge's line was playing through a node main.js had no reference
//    to. Pressing Restart while the court was speaking left the judge
//    talking over the restarted proceeding, with no way to silence him.
//    That is a direct violation of the founder's own requirement that he
//    must always be able to stop his own proceeding.
//    `onStart` is how the caller takes ownership of the node.
// COURTSIM-FIX-X -- `prosody` is optional and this function's behaviour with
// it absent is byte-for-byte what it was before. When present, only
// playbackRate is applied here (not the per-utterance gain): this is the
// read-back path, where the court is addressing the player directly, and
// quietly attenuating the one line the player is required to hear and repeat
// would be a mechanic-breaking bug dressed as realism.
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
    // addEventListener, NOT `src.onended = ...`. Every place in main.js that
    // stops a source does `src.onended = null; src.stop();` -- nulling the
    // PROPERTY handler first, deliberately. A resolve installed on that
    // property would therefore be thrown away by exactly the code paths that
    // need this promise to settle (Restart, Finish, Back-from-results), and
    // the awaiting read-back sequence would hang forever instead of
    // unwinding. A listener added this way survives that nulling, so
    // stopping the node always resolves and the caller returns through its
    // normal path.
    src.addEventListener('ended', () => resolve());
    src.start();
    if (typeof onStart === 'function') {
      try { onStart(src); } catch (err) { /* ownership is optional; playback is not */ }
    }
  });
}

// =========================================================================
// COURTSIM-SPEECH-008 -- DEFECT 4. THE GAVEL BANG.
//
// The founder asked for a gavel strike with its sound "long ago and it was
// never built." readback.js has carried the request as a named, unbuilt hook
// since COURTSIM_BUILD_001:
//
//     scene.playGavel()  -- one strike, with its sound, on the ask.
//                           The founder asked for this by name.
//
// The VISUAL half belongs to the concurrent COURTSIM-WEB-007 lane and to
// scene.js, which this job does not edit. This is the AUDIO half.
//
// WHY IT IS SYNTHESISED AND NOT A FILE. There is no gavel sample anywhere in
// this tree (checked: web/assets/ holds avatars and models, no audio of any
// kind), and adding one would mean fetching a binary from somewhere -- which
// this build does not do for audio, and which tests/test_offline.py's static
// scan exists to keep true. Web Audio can produce a wood-block impact
// convincingly from an impulse plus a damped resonance, it costs no bytes and
// no network, and it is DETERMINISTIC, which means it can be measured offline
// instead of argued about. The noise burst is driven by the same stable
// integer hash the prosody jitter uses, not Math.random(), so two strikes in
// the same session are identical and a field test is repeatable.
//
// THE MODEL: a hardwood gavel on a hardwood block is a broadband impulse
// (the strike) followed by two short damped modes (the block ringing).
//   - impulse  : ~6 ms of shaped noise, the attack transient
//   - mode 1   : 220 Hz, the block's body -- the "thock"
//   - mode 2   : 1.45 kHz, the surface -- the "crack"
// Both modes decay exponentially and the whole event is gone in ~180 ms,
// which is what stops it sounding like a drum.
//
// MEASURED OFFLINE by rendering the real samples this function returns and
// reading the envelope off them -- not estimated from the constants:
//
//   @24000 Hz : length 200 ms, peak 1.000 at 3.3 ms, -20 dB by 48 ms,
//               -40 dB by 106 ms, -60 dB by 166 ms, RMS 0.1131, last sample 0
//   @48000 Hz : length 200 ms, peak 1.000 at 3.3 ms, -20 dB by 44 ms,
//               -40 dB by 104 ms, -60 dB by 164 ms, RMS 0.1000, last sample 0
//   identical across two renders at the same rate (deterministic)
//
// The first version of this function was WRONG and the measurement is what
// caught it: its tail was still at -45 dB when the buffer ended, i.e. a step
// discontinuity, i.e. an audible click on the end of every strike. See
// GAVEL_FADE_SEC.
//
// NOT VERIFIED BY EAR. Nothing in this environment can play audio. The
// waveform is measured; whether it SOUNDS like a gavel to the founder is his
// call and is flagged as such in the report.
// =========================================================================

const GAVEL_LEN_SEC = 0.20;
const GAVEL_MODES = [
  { hz: 220, decay: 38, amp: 1.00 },   // body -- the low "thock"
  { hz: 1450, decay: 62, amp: 0.45 },  // surface -- the "crack"
];
const GAVEL_IMPULSE_SEC = 0.006;
// A damped sine truncated at the end of the buffer is a step discontinuity,
// and a step discontinuity is a click -- which would have put a second,
// unintended transient on the end of every strike. CAUGHT BY MEASUREMENT:
// the first render of this function was still at -45 dB when the buffer ran
// out (the envelope never reached -60 dB at all). The decays above were
// raised and this cosine fade added over the last 15 ms, which takes the tail
// to true silence before the buffer ends.
const GAVEL_FADE_SEC = 0.015;

// The same deterministic hash the prosody jitter uses, so the strike is
// byte-identical on every run of the same session.
function gavelNoise(i) {
  let h = (i * 2654435761 + 97 * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h / 4294967295) * 2 - 1;
}

// Renders the strike into an AudioBuffer. Exported separately from the play
// call so the harness can render and measure the exact samples the browser
// will hear, with no browser involved.
export function renderGavelBuffer(sampleRate) {
  const sr = sampleRate || 24000;
  const n = Math.max(1, Math.floor(sr * GAVEL_LEN_SEC));
  const out = new Float32Array(n);
  const impulseN = Math.max(1, Math.floor(sr * GAVEL_IMPULSE_SEC));
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    // The attack: shaped noise, gone almost immediately.
    if (i < impulseN) v += gavelNoise(i) * (1 - i / impulseN) * 0.9;
    // The block ringing.
    for (const m of GAVEL_MODES) {
      v += m.amp * Math.sin(2 * Math.PI * m.hz * t) * Math.exp(-m.decay * t);
    }
    out[i] = v;
  }
  // Fade the tail to true zero, then find the peak on the FINAL waveform.
  const fadeN = Math.max(1, Math.floor(sr * GAVEL_FADE_SEC));
  for (let k = 0; k < fadeN && k < n; k++) {
    const i = n - 1 - k;
    out[i] *= 0.5 * (1 - Math.cos(Math.PI * (k / fadeN)));
  }
  for (let i = 0; i < n; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  // Normalised to 1.0 here so the CALLER's gain is the only loudness control
  // and the strike cannot clip against whatever the speech is already doing.
  if (peak > 0) for (let i = 0; i < n; i++) out[i] /= peak;
  return { samples: out, sampleRate: sr, lengthSec: n / sr };
}

let _gavelBufferCache = null;

/**
 * Plays one gavel strike.
 *
 * `atTime` is an AudioContext timestamp (audioCtx.currentTime + lead), NOT a
 * delay, so the caller can align the bang to a visual event that has its own
 * schedule. Passing 0 or omitting it means "now". Returns the AudioContext
 * time the strike will actually sound, so the caller can log what it asked
 * for against what it got rather than assuming they matched.
 *
 * Scheduled through the audio clock rather than setTimeout deliberately: a
 * setTimeout on a busy main thread drifts by tens of milliseconds, and a
 * bang that lands 40 ms off the visual strike reads as a dubbing error.
 */
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
