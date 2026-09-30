// WEB-REBUILD-001 -- the authored proceedings that ship with the local
// build. Bundled with the page at build time; never uploaded, never typed
// by the player (D11: transcript upload is simply not a feature this tree
// implements at all -- absent by construction, not hidden behind a flag the
// way the Godot export's exclude_filter had to arrange for a shared
// codebase).
//
// COURTSIM-CONTENT-020 -- ALL FIVE FILES ARE LONG-FORM NOW, AND THE LENGTH
// IS THE POINT, NOT A STYLE CHOICE.
//
// The three original files ran about 90 seconds each (219, 202 and 195
// spoken words). COURTSIM-REPORT-016 shipped a [REDACTED-PRE-FILING] endurance
// measurement that refuses to interpret a session shorter than
// MIN_SESSION_MS ([REDACTED-PRE-FILING]), and reported honestly that no proceeding
// in this tree could reach it. That was a CONTENT gap, not a code gap, and
// this is the content. Each file is now 3,300-3,600 spoken words, which
// measured at 23-25 minutes of synthesised speech at the default 150 WPM
// setting (per-case measurements in reports/COURTSIM_CONTENT_020.md).
//
// Two properties of these files are load-bearing and easy to destroy by
// editing casually:
//
//   1. WORD DENSITY IS DELIBERATELY EVEN across each file. The endurance
//      block table cuts the session into equal-DURATION blocks and every
//      one of them has to clear a minimum word count, so a long run of
//      one-word answers anywhere in a file makes the whole curve refuse to
//      interpret itself. Do not "tighten" a case by replacing substantive
//      answers with "Yes." / "No."
//   2. EACH FILE PLANTS THE SAME DISTINCTIVE CONTENT WORDS IN ITS OPENING
//      AND ITS CLOSING. The drift comparison is only computed over
//      vocabulary shared between the first and last block, so the bench
//      ruling at the end of each case deliberately re-uses the nouns the
//      opening statement introduced. That repetition is a fixture, not
//      sloppy writing.
//
// The numeric and date FORMS in these files are also not free-form: they
// were each round-tripped through the real Kokoro synthesiser and the real
// whisper-tiny.en recogniser this session, because the reference transcript
// the scoring compares against IS this text, so a construct the synthesiser
// speaks one way and the recogniser writes another way marks the trainee
// wrong for being right. The measured rules are written up in
// reports/COURTSIM_CONTENT_020.md; the short form is: numbers one through
// ten as words, 12 and up as figures, money as figures, dates as
// "March 14, 2023", clock times as "9:40 in the evening", and never a
// letter-digit docket number like CS-1001.

//
// COURTSIM-VOICE-024 -- A THIRD PROPERTY IS NOW LOAD-BEARING: WHO SPEAKS
// FAST. Each case carries a per-speaker RATE CAST in voice_cast.js
// (PROCEEDING_RATE_CAST), keyed by this file's ids and by the speaker labels
// these files use. The global WPM slider now sets the rate of the FASTEST
// speaker in the room and everybody else is a measured fraction of it, so:
//
//   - RENAMING A SPEAKER LABEL IN A CONTENT FILE SILENTLY DEMOTES THAT
//     SPEAKER TO THE ORDINARY TIER. The rate cast is matched by label. If a
//     surname changes here, change it there in the same commit.
//   - ADDING A CASE means adding it to PROCEEDING_RATE_CAST too, or it runs
//     with every speaker at the same rate, which is the defect this closes.
//
// The registration below is what lets voice_cast.js know WHICH case it is
// casting. main.js hands it a bare list of labels, so the mapping from "this
// set of labels" to "this proceeding id" is built here, from the real parsed
// files, on every page load -- rather than hard-coded somewhere that a
// content edit would quietly invalidate.
import { registerProceedingLabels } from './voice_cast.js';

export const PROCEEDING_IDS = [
  'case_01_contract_dispute',
  'case_02_traffic_hearing',
  'case_03_small_claims',
  'case_04_expert_witness',
  'case_05_deposition',
];

export async function loadProceedings(engine) {
  const out = [];
  for (const id of PROCEEDING_IDS) {
    const resp = await fetch(`./content/proceedings/${id}.txt`);
    if (!resp.ok) throw new Error(`failed to fetch proceeding ${id}: HTTP ${resp.status}`);
    const rawText = await resp.text();
    const parsed = engine.parseProceeding(id, rawText);
    const labelsInOrder = parsed.utterances.map((u) => u.speaker);
    // COURTSIM-VOICE-024 -- the labels come from the REAL parse, through the
    // same zoom_adapter the scorer uses, so the registry can never disagree
    // with what main.js will later hand assignVoices().
    registerProceedingLabels(id, labelsInOrder);
    const speakers = new Set(labelsInOrder);
    out.push({
      id,
      title: id.replace(/_/g, ' ').replace(/^case (\d+)/, 'Case $1 —'),
      utterances: parsed.utterances,
      speaker_count: speakers.size,
      utterance_count: parsed.utterances.length,
    });
  }
  return out;
}

// ===========================================================================
// COURTSIM-EVENTS-030 -- THE PARENTHETICAL CATALOGUE, AND WHY IT LIVES HERE.
//
// FOUNDER, VERBATIM: "in the transcripts review them for anything else we
// should add -- like how they have a recess taken in actual courts, or
// showing an exhibit, interruption. Basically all the parenthetical inserts
// which represent things like that occur and you insert them into your
// transcript. WE NEED TO MAKE SURE THE SIMULATOR ACTUALLY DOES THOSE THINGS
// THAT ARE HAPPENING DURING DEPOS AND COURT."
//
// The emphasis is his and it is the whole job. He does not want a list of
// strings to type. He wants the EVENT to happen in the room, so that writing
// the parenthetical is a RESPONSE TO SOMETHING HE OBSERVED -- which is what a
// real reporter does.
//
// EVERY WORDING BELOW WAS READ OUT OF A REAL TRANSCRIPT HE UPLOADED. Nothing
// here is a guess about "what transcripts usually say". The six source files
// and the exact line each wording was taken from are recorded in
// `sources`, and the full extraction is in reports/COURTSIM_EVENTS_030.md
// SS1. Six files, 24 distinct parentheticals found, catalogued below.
//
// WHY THE CATALOGUE IS IN proceedings.js AND THE STAGING IS IN scene.js.
// A parenthetical is a property of the CONTENT -- it is the wording a
// reporter is expected to produce -- so it belongs beside the content this
// module already owns. scene.js imports this table and is responsible only
// for making the thing HAPPEN. One table, two consumers, no second copy of
// the wording anywhere.
//
// ---------------------------------------------------------------------------
// THE TRIGGER IS THE SPOKEN LINE, NOT A MARKUP LINE IN THE CONTENT FILE.
// ---------------------------------------------------------------------------
// This follows the pattern scene.js's own handleStandingCue() established and
// argued for in its header: "Detected straight from the utterance text (never
// a special-cased proceeding file)." Three reasons it is right here too:
//
//   1. THE CONTENT ALREADY CONTAINS THE MOMENTS. COURTSIM-CONTENT-020 wrote
//      114 minutes across five cases and it already has the clerk saying
//      "Please raise your right hand", "Exhibit 3 is marked for
//      identification", "All rise. This court is in recess for 15 minutes",
//      "Let us go off the record", "Come up. We will be at sidebar."
//      MEASURED this pass: 47 such moments across the five files. Every one
//      of them was already written and NONE of them happened in the room.
//      That gap -- authored speech with no staged consequence -- is exactly
//      the founder's complaint, and it is closed by staging, not by authoring
//      more text.
//   2. A MARKUP LINE WOULD HAVE TO SURVIVE THE PARSER AND THE SYNTHESISER.
//      The content file is parsed by the real zoom_adapter, whose refusal
//      policy rejects any cue whose first text line has no ":" separator --
//      so a bare "(Recess taken.)" line REFUSES THE WHOLE FILE. Giving it a
//      fake speaker label instead would put it into the utterance stream,
//      where main.js would synthesise it and Kokoro would read the word
//      "paren" out loud.
//   3. IT WORKS ON THE CONTENT THAT ALREADY SHIPPED. No content edit is
//      required for an event to fire, so the difficulty ramp CONTENT-020
//      measured (the even per-block word density the endurance curve depends
//      on) cannot be damaged by this lane adding lines.
//
// ---------------------------------------------------------------------------
// HOW A PARENTHETICAL IS SCORED. MEASURED, NOT ASSERTED.
// ---------------------------------------------------------------------------
// A parenthetical is REPORTER-INSERTED: nobody speaks it. So it is NOT in the
// spoken stream and NOT in the scored reference, and the consequence was
// measured against the app's own engine (courtsim/scoring/scoring.py through
// compare.align_transcript) rather than reasoned about:
//
//   accuracy = 100 x matched / REFERENCE words.  The denominator is the
//   reference only, so a word the trainee ADDS cannot lower it.
//
//   A perfect take                                   raw 100.0000  trainee 100.0000
//   A perfect take + 2 parentheticals written        raw 100.0000  trainee 100.0000
//   ... written without the paren characters         raw 100.0000  trainee 100.0000
//   ... dictated as "open paren ... close paren"     raw 100.0000  trainee 100.0000
//   A parenthetical IN the reference, trainee omits  raw  99.4450  <- A PENALTY
//
// The last row is why they stay out of the reference. Put one in and a
// reporter who does not write it is marked wrong; leave it out and a reporter
// who DOES write it is charged nothing. He has been marked wrong for being
// right twice already; this is the arrangement where that cannot happen in
// either direction. Full run in reports/COURTSIM_EVENTS_030.md SS5.
// ===========================================================================

// `stage` names the thing scene.js is asked to make happen. `''` means there
// is a real parenthetical convention for it but this lane did not stage it --
// those rows are kept in the table deliberately, so the report's "omitted and
// why" list is generated from the same table the build runs off rather than
// written separately and allowed to drift.
//
// ---------------------------------------------------------------------------
// THE TRIGGERS ARE NARROW ON PURPOSE, AND THE NARROWING IS MEASURED.
// ---------------------------------------------------------------------------
// The first draft of this table matched `\bread\b.*back|read the` for
// `(Record read.)`. Run over the five shipped cases it fired 29 times, and
// TWENTY of those were wrong: "I have read the pretrial statements", "Did you
// read the document before you signed it?", "You do not read the fine print
// on a shingle order", "I read it over the break", and -- the subtle one --
// "Officer, would you read the second paragraph of your report into the
// record?", which is A WITNESS READING AN EXHIBIT ALOUD and takes no
// parenthetical at all. `(Record read.)` is the REPORTER reading back. Only
// the reporter's read-back gets the parenthetical.
//
// This matters more than tidiness. An event that fires when nothing happened
// teaches the founder to write a parenthetical for a thing he did not see,
// which is the same failure as marking him wrong for being right, pointed the
// other way. Every pattern below was run over all 1,141 shipped cues and
// every hit was read by eye; the false-positive count is in the report.
export const PARENTHETICAL_CATALOGUE = [
  {
    id: 'recess',
    text: '(Recess taken.)',
    variants: ['(Recess was taken.)', '(NOON RECESS.)'],
    sources: [
      'WVC_Sample_Court_Transcript.pdf p.6 l.2 -- after "MS. REDDING: Can we break for ten minutes? / THE COURT: Yes."',
      'Depo_Transcript.pdf -- "(Recess was taken.)"',
      'Court_Transcript_Sample_Los_Angeles.pdf p.54 -- "(NOON RECESS.)"',
    ],
    // The CLERK's "All rise. This court is in recess..." is the moment the
    // recess actually begins, and it is also the line the room already stands
    // on. The judge's earlier "we will take a 15 minute recess" is matched
    // too, because in case_04 the judge announces it and no clerk repeats it;
    // `debounce` collapses the pair when both are present.
    trigger: /\b(?:is|stands?)\s+in\s+recess\b|\bwe\s+(?:will\s+)?stand\s+in\s+recess\b|\bwe\s+will\s+take\s+a\s+[^.]{0,24}recess\b/i,
    stage: 'recess',
    debounce: 6,          // in utterances -- see EventMatcher
    density: 0,
  },
  {
    id: 'record_read',
    text: '(Record read.)',
    variants: [],
    sources: [
      'SAMPLE_Depo_Transcript._REV_4.pdf l.22 -- after "Ms. Reporter, can you read back the last question, please."',
      'WVC_Sample_Court_Transcript.pdf l.18 -- after "THE COURT: May we have the question, Ms. Reporter."',
      'DEPO_Final.pdf / DEPO_Final.txt -- "(Record read.)"',
      'Depo_Transcript.pdf -- "(Record read.)"',
    ],
    // FOUR of the six sample files carry this one -- more than any other
    // parenthetical in the sample. It is the reporter's own most common
    // insert and the one the founder will write most.
    //
    // NARROW: a read-BACK, by the reporter. Not "read this exhibit aloud",
    // not "have you read", not "I read it over the break".
    // MEASURED NARROWING. An earlier draft carried a fourth alternative,
    // `read\s+(?:the|my|your)\s+[^.?]{0,40}\bback\b`, meant to catch "read the
    // last question back". It caught case_01 cue 154 -- "You did not read the
    // BACK of the purchase order?" -- where "back" is the back of a piece of
    // paper. Deleted: `read[\s-]?back` already covers every real form in the
    // sample, including the spaced one.
    trigger: /\bread[\s-]?back\b|\bread\s+(?:that|it|this|them)\s+back\b|\b(?:ms\.|mrs\.|miss|madam)\s+reporter\b[^.?]{0,50}\bread\b|\bmay\s+we\s+have\s+the\s+question\b/i,
    // "I do not need the read back after all" is a DECLINED read-back: the
    // reporter never reads. Found in case_05 at cue 168, two cues after the
    // request it withdraws. Excluded explicitly rather than left to debounce.
    exclude: /\b(?:do\s+not|don't|no)\s+need\s+the\s+read/i,
    stage: 'record_read',
    // 6, not 3. In case_01 counsel asks at cue 165 and the court orders it at
    // cue 168 -- one read-back, two cues that both say "read back", 3 apart.
    debounce: 6,
    density: 0,
  },
  {
    id: 'exhibit_marked',
    // TWO ATTESTED FORMS, AND WHICH ONE IS RIGHT DEPENDS ON THE ROOM. All
    // three deposition transcripts use the short form; the one court
    // transcript that marks an exhibit on the record uses the long one. That
    // is a real distinction a reporter has to know, so the simulator teaches
    // it rather than flattening it: `text` is the deposition form,
    // `courtroomText` the court form, and case_05 (a deposition) gets the
    // former while the four courtroom cases get the latter.
    text: '(Exhibit N marked.)',
    courtroomText: "(Plaintiff's Exhibit N was marked for identification.)",
    variants: [
      "(Plaintiff's Exhibit N was marked for identification.)",
      "(LATENT PRINTS AND THE ENVELOPE WERE MARKED FOR IDENTIFICATION AS PEOPLE'S EXHIBIT 28.)",
    ],
    sources: [
      'SAMPLE_Depo_Transcript._REV_4.pdf l.11 -- "(Exhibit 1 marked.)" after "MS. GOOD: I would like to mark this photograph ... as Exhibit No. 1."',
      'DEPO_Final.pdf -- "(Exhibit 11 marked.)", "(Exhibit 12 marked.)"',
      'Depo_Transcript.pdf -- "(Exhibit 1 marked.)", "(Exhibit 2 marked.)"',
      "WVC_Sample_Court_Transcript.pdf -- \"(Plaintiff's Exhibit 1 was marked for identification.)\"",
      "Court_Transcript_Sample_Los_Angeles.pdf -- the long all-caps People's-exhibit forms",
    ],
    // `needsNumber` -- an exhibit parenthetical names its exhibit, so a line
    // that talks about marking without naming one ("The exhibits are marked
    // for identification only", case_01 cue 10, which describes PREMARKING
    // that happened before the reporter arrived) produces no event. The
    // number is also what dedupes counsel's request from the clerk's
    // confirmation: they carry the same number, so the second is suppressed.
    // EVERY ALTERNATIVE CONTAINS THE VERB "mark", AND THAT IS THE WHOLE
    // NARROWING. An earlier draft also matched `exhibit (\d+) for
    // identification`, which fired on "I am showing you Exhibit 1 for
    // identification" -- five times in case_01 alone. Showing the witness an
    // exhibit that was PREMARKED before the reporter sat down is not a
    // marking and takes no parenthetical; case_01's own cue 10 says the
    // exhibits were premarked, so those five were staging a thing the room
    // had already done off camera.
    trigger: /\bexhibit\s+(?:no\.\s*)?(\d+)\s+(?:is|was|has\s+been)\s+marked\b|\bmark(?:ing|ed)?\s+[^.?]{0,90}?\bas\s+exhibit\s+(?:no\.\s*)?(\d+)\b|\bmark\s+(?:it|this|that)\s+as\s+exhibit\s+(?:no\.\s*)?(\d+)\b/i,
    needsNumber: true,
    stage: 'exhibit_marked',
    // ONCE PER EXHIBIT, FOREVER. An exhibit is marked once. case_03's closing
    // inventory ("Exhibit 7 is marked and refused", cue 214) re-announced a
    // number marked 58 cues earlier, and a cue-window debounce cannot reach
    // that far without swallowing genuinely different exhibits.
    debounce: Infinity,
    density: 1,
  },
  {
    id: 'exhibit_received',
    // THE PARTY IS READ OFF THE CUE, NOT ASSUMED. WVC gives the template with
    // "Plaintiff's" in it; case_01's Exhibit 5 is the DEFENDANT's replacement
    // invoice, and printing "Plaintiff's" over it would be a factual error in
    // the reference the founder is being taught to produce. The possessive is
    // substituted into the attested template when the cue names the other
    // party -- a mechanical swap inside a real form, not a new form.
    text: "(Plaintiff's Exhibit N was received in evidence.)",
    partyText: "(PARTY's Exhibit N was received in evidence.)",
    variants: [],
    sources: [
      'WVC_Sample_Court_Transcript.pdf l.12 -- after "THE COURT: Let\'s now have Exhibit Number 1 received into evidence."',
    ],
    trigger: /\bexhibit\s+(?:no\.\s*)?(\d+)\s+(?:is|was|will\s+be)\s+(?:admitted|received)\b/i,
    needsNumber: true,
    // A DEPOSITION ADMITS NOTHING. There is no judge and no evidentiary
    // ruling, so no exhibit is ever "received in evidence" -- which is why
    // none of the four deposition transcripts in the sample contains this
    // parenthetical and the one court transcript that does, does so once.
    courtroomOnly: true,
    stage: 'exhibit_received',
    debounce: Infinity,
    density: 1,
  },
  {
    id: 'sidebar',
    text: '(THE FOLLOWING PROCEEDINGS WERE HELD AT SIDEBAR:)',
    variants: [],
    sources: [
      'Court_Transcript_Sample_Los_Angeles.pdf p.42 l.5 -- after "MR. BELL: MAY WE APPROACH BRIEFLY? / THE COURT: CAN I SEE COUNSEL?"',
    ],
    trigger: /\b(?:may\s+we\s+approach|approach\s+the\s+bench|at\s+sidebar|can\s+i\s+see\s+counsel)\b/i,
    stage: 'sidebar',
    debounce: 4,
    density: 2,
  },
  {
    id: 'counsel_confer_off_record',
    text: '(DEFENSE COUNSEL CONFER OFF THE RECORD.)',
    variants: [],
    sources: [
      'Court_Transcript_Sample_Los_Angeles.pdf p.14 l.8 -- after "MS. ACKERMAN: CAN WE HAVE A MOMENT?"',
    ],
    trigger: /\b(?:can\s+we\s+have\s+a\s+moment|a\s+moment\s+with\s+my\s+client|confer\s+with\s+(?:my|co-?)counsel)\b/i,
    stage: 'off_record',
    debounce: 4,
    density: 2,
  },
  {
    id: 'off_record',
    // I ORIGINALLY SHIPPED THIS WITH NO WORDING, AND THE SPEC LANE CORRECTED
    // ME. In every deposition transcript in the sample, "let us go off the
    // record" is printed as SPOKEN TEXT with no parenthetical after it --
    // checked in all four depo files -- so I refused to invent one rather
    // than guess. ECLIPSE_FORMAT_SPEC_001 SS3.2 row 24 then supplied it from a
    // source I did not have: CAT II p.157 documents "(Discussion off the
    // record.)" as a real industry form. So it is a BOOK form (Src B), not a
    // measured one (Src E), and this row says which -- because the
    // distinction is the whole reason the first version was blank.
    text: '(Discussion off the record.)',
    srcClass: 'B -- course book (CAT II p.157), NOT attested in the five sample transcripts',
    variants: [],
    sources: [
      'ECLIPSE_FORMAT_SPEC_001 SS3.2 row 24, citing CAT II p.157.',
      'The four deposition files print it as speech with no parenthetical -- an evidence-backed ABSENCE from the sample, which is why srcClass is B and not E.',
    ],
    trigger: /\b(?:go|going|are|be)\s+off\s+the\s+record\b|\boff\s+the\s+microphone\b/i,
    // case_03 cue 160 is "Both of you approach the bench again. I want a word
    // off the microphone" -- ONE moment that matched both `sidebar` and this,
    // and printed two parentheticals for it. The sidebar parenthetical is the
    // one the transcripts actually use for a bench conference, so it wins.
    notWith: ['sidebar', 'recess'],
    stage: 'off_record',
    debounce: 3,
    density: 0,
  },
  {
    id: 'back_on_record',
    text: '',
    variants: [],
    sources: ['Court_Transcript_Sample_Los_Angeles.pdf l.1490 -- "WE\'LL GO BACK ON THE RECORD" (speech, not a parenthetical)'],
    // `requiresOffRecord` -- this is the RETURN, so it only fires if the room
    // is actually off the record. Without it, every case's opening line ("We
    // are on the record in the matter of...") fired a return-from-recess that
    // re-seated a room that had never stood up.
    trigger: /\bback\s+on\s+the\s+record\b|\bwe\s+are\s+back\b/i,
    requiresOffRecord: true,
    stage: 'back_on_record',
    debounce: 1,
    density: 0,
  },
  {
    id: 'witness_sworn',
    // NOT a parenthetical in the evidence -- in all six files the oath is
    // recorded as the WITNESS-IDENTIFICATION BLOCK printed above the
    // examination heading. It is carried in this table because it is the same
    // class of object: reporter-inserted, never spoken, and written in
    // response to something observed -- a hand going up.
    //
    //     WVC l.195-200      RICHARD NEWMEYER,
    //                        having been called by and on behalf of the plaintiff,
    //                        having been first duly sworn, testified as follows:
    //
    //     SAMPLE_Depo l.238  GEORGE HANSON,
    //                        having been first duly sworn, was examined and
    //                        testified as follows:
    // TWO CORRECT ANSWERS, AND WHICH ONE IS RIGHT DEPENDS ON THE HOUSE.
    // Every one of the five sample transcripts records the oath as the
    // WITNESS-IDENTIFICATION BLOCK (`identBlock`), because all five transcribe
    // the oath verbatim. ECLIPSE_FORMAT_SPEC_001 SS3.2 row 19 adds the short
    // form from CAT II p.157, used when the oath is NOT transcribed verbatim.
    // Both are real; the sample uses the block, so the block is the primary.
    text: '(Witness sworn.)',
    srcClass: 'text: B -- course book (CAT II p.157), for a house that does not transcribe the oath. '
      + 'identBlock: E -- attested in all five sample transcripts, and the form this tree uses.',
    identBlock: 'having been first duly sworn, testified as follows:',
    variants: [
      'having been first duly sworn, was examined and testified as follows:  [SAMPLE_Depo l.238]',
      'CALLED BY THE PEOPLE AS A WITNESS, WAS SWORN AND TESTIFIED  [LA l.276]',
      'having been first duly sworn through the English-Spanish interpreter  [DEPO_Final l.246]',
    ],
    sources: [
      'WVC_Sample_Court_Transcript.pdf l.195-201',
      'SAMPLE_Depo_Transcript._REV_4.pdf l.234-240',
      'Court_Transcript_Sample_Los_Angeles.pdf l.276, l.670, l.950, l.1232, l.1504',
    ],
    trigger: /\braise\s+your\s+right\s+hand\b/i,
    stage: 'witness_sworn',
    debounce: 10,
    density: 0,
  },
  {
    id: 'concluded',
    text: '(Proceedings concluded at H:MM AM)',
    depositionText: '(Deposition concluded at H:MM PM.)',
    variants: [
      '(Deposition concluded at 1:20 p.m.)',
      '(Deposition concluded at 1:00 PM.)',
      '(Deposition concluded at 10:00 AM.)',
    ],
    sources: [
      'WVC_Sample_Court_Transcript.pdf l.15 -- "(Proceedings concluded at 10:45 AM)"',
      'SAMPLE_Depo_Transcript._REV_4.pdf -- "(Deposition concluded at 1:20 p.m.)"',
      'DEPO_Final.pdf -- "(Deposition concluded at 1:00 PM.)"',
      'Depo_Transcript.pdf -- "(Deposition concluded at 10:00 AM.)"',
    ],
    // The time is NOT a constant. scene.js reads it off the room's own wall
    // clock, which _updateClock() drives from the real clock on every frame.
    // The reporter reads the time off the wall, the way he would in a room --
    // and the wall clock in this build is a real clock with real hands, so
    // that is a genuine reading task and not a caption.
    trigger: /\bwe\s+(?:are|stand)\s+adjourned\b|\bstands?\s+adjourned\b|\bis\s+concluded\b|\bdeposition\s+of\s+[^.]{0,40}\s+is\s+concluded\b/i,
    // "SUSPENDED rather than concluded" is not a conclusion. case_05 ends in a
    // suspended deposition on purpose (a real and common ending), and the
    // first draft printed "(Deposition concluded at ...)" over it -- teaching
    // the founder to certify as concluded a deposition that plainly was not.
    // There is no attested parenthetical for a suspension in the sample, so
    // the honest answer is to emit nothing rather than to invent one.
    exclude: /\bsuspended\s+rather\s+than\s+concluded\b/i,
    stage: 'concluded',
    debounce: 12,
    density: 0,
  },
  // ------------------------------------------------------------------------
  // FOUND IN THE EVIDENCE, NOT STAGED. These rows are in the same table the
  // build runs off so that the report's "omitted and why" list cannot drift
  // away from what the code actually does. `trigger: null` is what makes them
  // inert.
  // ------------------------------------------------------------------------
  {
    id: 'information_requested',
    text: '(Information Requested: ______.)',
    variants: [],
    sources: [
      'Depo_Transcript.pdf p.6 ll.20-22 -- the reporter leaves a ruled blank in the body of the transcript',
      "SAMPLE_Depo_Transcript._REV_4.pdf -- the matching INFORMATION REQUESTED index page",
      'Flagged as a gap in my first catalogue by ECLIPSE_FORMAT_SPEC_001 SS3.3.',
    ],
    trigger: null, stage: '', density: 3,
    omitReason: 'ATTESTED, UNUSUAL, AND GENUINELY WORTH HAVING -- and there is nothing in this '
      + 'tree to trigger it. It fires when counsel UNDERTAKES to supply something later ("I '
      + 'will get you that figure"), and no cue in the five shipped cases does that. Adding '
      + 'the exchange is a small content edit and the right next job for whoever owns this '
      + 'content; staging it against a cue that does not exist would be staging nothing.',
  },
  {
    id: 'jury_out',
    text: '(THE FOLLOWING PROCEEDINGS WERE HELD OUT OF THE PRESENCE OF THE JURY:)',
    variants: ['(THE FOLLOWING PROCEEDINGS WERE HELD IN THE PRESENCE OF THE JURY:)'],
    sources: ['Court_Transcript_Sample_Los_Angeles.pdf p.54 l.6, and its "IN THE PRESENCE" counterpart'],
    trigger: null, stage: '', density: 3,
    omitReason: 'The jurors would have to LEAVE the box and come back. This build has no '
      + 'locomotion at all: every figure is solved into a fixed seat and blended between a '
      + 'sit pose and a stand pose. Six jurors sliding out of a jury box without walking '
      + 'would undo more credibility than the event buys.',
  },
  {
    id: 'exhibit_remarked',
    text: '(REMARKED AS 28-A)',
    variants: ["(PEOPLE'S 28 WAS REMARKED AS PEOPLE'S 28-A FOR IDENTIFICATION, AND AN EXEMPLAR WAS MARKED AS PEOPLE'S 28-B FOR IDENTIFICATION.)"],
    sources: ['Court_Transcript_Sample_Los_Angeles.pdf l.128 and the long form later in the same file'],
    trigger: null, stage: '', density: 3,
    omitReason: 'Re-marking an already-marked exhibit with a letter suffix is real and '
      + 'attested, but it needs an exhibit already in play and a reason to split it. No case '
      + 'in this tree has one, and authoring a case around a parenthetical is the tail '
      + 'wagging the dog.',
  },
  {
    id: 'not_requested',
    text: '(PROCEEDINGS REPORTED BUT NOT REQUESTED IN THIS TRANSCRIPT.)',
    variants: ['(PROCEEDINGS NOT REQUESTED IN THIS TRANSCRIPT WERE HELD OUT OF THE PRESENCE OF THE JURY.)'],
    sources: ['Court_Transcript_Sample_Los_Angeles.pdf'],
    trigger: null, stage: '', density: 3,
    omitReason: 'A TRANSCRIPT-PRODUCTION note, written after the fact by the transcribing '
      + 'reporter about what the ordering party paid for. Nothing happens in the room when '
      + 'it is written. There is no event to stage.',
  },
  {
    id: 'certificate_furniture',
    text: '(Declaration under penalty of perjury on the following page hereof.)',
    variants: ['(City)', '(State)', '(Information Requested: ____.)'],
    sources: ['DEPO_Final.pdf and Depo_Transcript.pdf -- certificate and errata pages'],
    trigger: null, stage: '', density: 3,
    omitReason: 'Certificate-page and errata-page furniture. "(City)" and "(State)" are FORM '
      + 'FIELD LABELS on the jurat page, not events. They are listed here because the same '
      + 'regex that found the real parentheticals found these too, and a catalogue that '
      + 'quietly dropped them would be overstating its own precision.',
  },
  {
    id: 'interruption',
    // The interruption convention in these transcripts is NOT a parenthetical.
    // It is a trailing double hyphen on the interrupted line. MEASURED across
    // the sample: 16 in the LA transcript, 2 in WVC, 2 in Depo_Transcript, 1
    // each in the two DEPO_Final files. The content in this tree already uses
    // it -- case_03 cue 86 ends "...and that is somehow my problem --".
    text: '-- (trailing double hyphen on the cut-off line)',
    variants: [],
    sources: [
      'Court_Transcript_Sample_Los_Angeles.pdf -- 16 lines ending in "--", e.g. l.382 "THE WITNESS: I HAD A --"',
      'WVC_Sample_Court_Transcript.pdf -- 2',
      'Depo_Transcript.pdf -- 2',
      'DEPO_Final.pdf / .txt -- 1 each',
    ],
    trigger: null, stage: '', density: 3,
    omitReason: 'A real interruption needs TWO voices sounding at once. Synthesis, the audio '
      + 'graph and the lip-sync queue all live in tts.js / main.js, which this lane does not '
      + 'own, and the queue is explicitly single-track (COURTSIM-REVERT-013 chased a stall '
      + 'in it). Cutting speaker A off early and starting B is not an overlap, it is a GAP: '
      + 'the founder would hear no talking-over at all and would have nothing to react to. '
      + 'Copy-ready handoff in reports/COURTSIM_EVENTS_030.md.',
  },
];

// ===========================================================================
// THE EXAMINATION HEADINGS.
//
// FOUNDER: "oh and it was called a direct or cross examination -- that's what
// has the question and answer process."
//
// Same class of object as a parenthetical -- typed by the reporter, spoken by
// nobody -- so it runs through the same machinery and is scored the same way,
// which is to say not at all. Both court transcripts in the sample print them
// as a centred heading followed by a "BY MR./MS. X:" line:
//
//     WVC l.205        DIRECT EXAMINATION
//     WVC l.501        CROSS-EXAMINATION
//     LA  l.314/565    DIRECT EXAMINATION / CROSS-EXAMINATION
//     LA  l.51-56      the index form: "DIRECT EXAMINATION BY MS. BAILLINGS"
//
// NOTE THE HYPHEN, AND NOTE THE DEPOSITION.
//   * "CROSS-EXAMINATION" is hyphenated in every occurrence in both court
//     files; "DIRECT EXAMINATION" never is. That is not a house style this
//     lane picked, it is what is on the page, in two different courts.
//     RECROSS-EXAMINATION follows CROSS-EXAMINATION by the same rule.
//   * A DEPOSITION DOES NOT USE "DIRECT". All three depo transcripts head it
//     plain "EXAMINATION" over "BY MS. GOOD:" -- SAMPLE_Depo l.244,
//     Depo_Transcript l.243/l.359, DEPO_Final l.252. Depo_Transcript uses
//     "EXAMINATION" a second time for the defending attorney rather than
//     "CROSS-EXAMINATION". case_05 is a deposition, so it gets that form.
//
// WHO IS ASKING is resolved from the SPEAKER LABEL OF THE NEXT COUNSEL WHO
// ACTUALLY SPEAKS, not by parsing the judge's sentence for a surname. A
// sibling lane recently had to fix one lawyer conducting both sides; reading
// the name off the room means a heading can never claim an examiner the room
// does not then produce, and a disagreement is logged instead of papered over.
//
// `courtOnly` -- the handoff comes from the bench. Without it the heading
// fired on "Objection, leading and argumentative on redirect examination"
// (case_04 cue 182, MR. KESSLER) and on "Objection, asked and answered. This
// was covered twice already on cross-examination" (cue 194, MS. WHITFIELD).
// An objection that mentions the examination is not the start of one.
//
// `oncePerWitness` -- the heading is printed once, under the witness's name.
// Without it case_04 printed DIRECT twice ("call your witness" at cue 14 and
// "Proceed with your direct examination" at cue 44) and CROSS twice ("Mr.
// Kessler, cross-examination" at 105 and "Continue your cross-examination"
// at 162). Both counters reset when a new witness is sworn.
// ===========================================================================
export const EXAMINATION_HEADINGS = [
  {
    id: 'direct',
    heading: 'DIRECT EXAMINATION',
    depositionHeading: 'EXAMINATION',
    sources: ['WVC l.205', 'LA l.314, l.696, l.970, l.1260, l.1524', 'depo form: SAMPLE_Depo l.244'],
    trigger: /\bcalls?\b[^.]{0,60}\b(?:to\s+the\s+stand|as\s+(?:an?\s+)?(?:adverse\s+)?witness)\b|\bcall\s+your\s+(?:first\s+)?witness\b|\bproceed\s+with\s+your\s+direct\s+examination\b|\bgoes\s+first,\s+from\s+the\s+stand\b|\bthis\s+is\s+the\s+deposition\s+of\b/i,
    courtOnly: true,
    oncePerWitness: true,
    // THE HEADING GOES UNDER THE WITNESS BLOCK, NOT ABOVE IT. Every sample
    // transcript prints the witness's name and "having been first duly
    // sworn..." FIRST and the examination heading after it -- WVC l.195-205,
    // SAMPLE_Depo l.234-244. The trigger, though, is the court CALLING the
    // witness, which happens several cues before the oath. So a `direct` that
    // matches before anybody has been sworn is HELD and emitted on the
    // swearing cue, immediately after the witness block.
    //
    // It also fixes a duplicate. case_04's court says "call your witness"
    // (cue 14) and, 30 cues later, "Proceed with your direct examination"
    // (cue 44). With the heading emitted at 14 the once-per-witness key was
    // stamped with the PRE-oath generation, the oath at cue 17 bumped the
    // generation, and cue 44 printed DIRECT EXAMINATION a second time.
    // Deferring past the oath stamps the right generation and the second one
    // is suppressed.
    //
    // A deposition has no swearing on the record -- the officer swears the
    // witness before it opens (case_05 cue 3 says exactly that, and the depo
    // transcripts print the oath in the witness block, not as speech) -- so
    // the deferral is skipped there and the heading lands on cue 0.
    deferUntilSworn: true,
  },
  {
    id: 'cross',
    heading: 'CROSS-EXAMINATION',
    depositionHeading: 'EXAMINATION',
    sources: ['WVC l.501', 'LA l.565, l.872, l.895, l.1146, l.1205'],
    trigger: /\bcross-?examination\b|\byou\s+may\s+cross-?examine\b|\byou\s+may\s+ask\s+(?:her|him|them)\s+questions\s+now\b/i,
    exclude: /^\s*objection\b|\bcontinue\s+your\s+cross/i,
    courtOnly: true,
    oncePerWitness: true,
  },
  {
    id: 'redirect',
    heading: 'REDIRECT EXAMINATION',
    depositionHeading: 'FURTHER EXAMINATION',
    sources: ['LA l.653 "DO YOU HAVE ANY REDIRECT?", l.938 "ANY REDIRECT?"'],
    trigger: /\b(?:any\s+redirect|your\s+redirect|redirect\s+examination)\b/i,
    exclude: /^\s*objection\b/i,
    courtOnly: true,
    oncePerWitness: true,
  },
  {
    id: 'recross',
    heading: 'RECROSS-EXAMINATION',
    depositionHeading: 'FURTHER EXAMINATION',
    sources: ["LA index block l.51-56 pattern; follows CROSS-EXAMINATION's hyphen"],
    trigger: /\brecross\b/i,
    exclude: /^\s*objection\b/i,
    courtOnly: true,
    oncePerWitness: true,
  },
];

// Counsel labels in this tree are "MS. OKONKWO" / "MR. DELACROIX" / "MR.
// FERRO" -- an honorific plus a surname. THE COURT / THE CLERK / THE WITNESS
// are not counsel, and neither are the seat-plate defaults.
const COUNSEL_LABEL_RE = /^(?:MR\.|MS\.|MRS\.|DR\.)\s+\S/i;
export function isCounselLabel(label) {
  return COUNSEL_LABEL_RE.test(String(label || '').trim());
}

// ===========================================================================
// ONE MATCHER, TWO CONSUMERS.
//
// scene.js drives this one line at a time from handleStandingCue(); the
// planner below drives the same object over a whole parsed file. They are the
// same code, so a plan printed into the report and a run in the browser cannot
// disagree about which events fire -- which is the only way "here is what he
// will see" is a claim rather than a hope.
//
// DEBOUNCE IS COUNTED IN UTTERANCES, NOT MILLISECONDS, and that is deliberate.
// The planner has no clock. Counting cues makes the plan and the live run
// identical by construction, and a cue is the right unit anyway: what is being
// suppressed is "the clerk repeating what the judge just said", which is one
// or two cues later regardless of how fast anybody is speaking.
// ===========================================================================
export function createEventMatcher(opts = {}) {
  const isDeposition = !!opts.deposition;
  // `maxDensity` gates events by difficulty. 0 = the events every reporter
  // must catch; 1 = exhibits; 2 = the quiet ones (a sidebar, counsel asking
  // for a moment) that need him to notice something small. The number comes
  // from difficulty_settings.js -- see parentheticalDensityFor().
  const maxDensity = opts.maxDensity == null ? 2 : opts.maxDensity;
  let cue = -1;
  let offRecord = false;
  let sworn = false;          // has a witness been sworn on the record yet
  let witnessGen = 0;
  const lastCue = new Map();      // dedupe key -> cue index
  const headingDone = new Set();  // `${id}@${witnessGen}`
  let pendingDirect = null;       // a DIRECT EXAMINATION held for the oath

  function headingText(row) {
    return (isDeposition && row.depositionHeading) ? row.depositionHeading : row.heading;
  }

  // The parenthetical wording, with the room and the exhibit number resolved.
  function parentheticalText(row, num, cueText) {
    let t = row.text;
    if (isDeposition && row.depositionText) t = row.depositionText;
    if (!isDeposition && row.courtroomText) t = row.courtroomText;
    if (row.partyText && /\bdefend(?:ant|ant's|ants)\b/i.test(cueText)) {
      t = row.partyText.replace(/\bPARTY\b/, 'Defendant');
    } else if (row.partyText) {
      t = row.partyText.replace(/\bPARTY\b/, 'Plaintiff');
    }
    return num ? t.replace(/\bN\b/g, num) : t;
  }

  return {
    get cueIndex() { return cue; },
    get isOffRecord() { return offRecord; },
    get witnessSworn() { return sworn; },
    reset() {
      cue = -1; offRecord = false; sworn = false; witnessGen = 0;
      lastCue.clear(); headingDone.clear(); pendingDirect = null;
    },
    // `ctx.isCourt` is passed explicitly so neither consumer has to re-derive
    // it: the planner knows the speaker LABEL, scene.js knows the SEAT KEY,
    // and both can answer "is the bench speaking" without agreeing on a
    // string format.
    feed(text, ctx = {}) {
      cue += 1;
      const s2 = String(text || '');
      const isCourt = ctx.isCourt != null
        ? !!ctx.isCourt
        : /^THE COURT$/i.test(String(ctx.speaker || '').trim());
      const out = [];
      const stagesThisCue = new Set();

      for (const row of PARENTHETICAL_CATALOGUE) {
        if (!row.trigger || !row.stage) continue;
        if ((row.density || 0) > maxDensity) continue;
        if (row.courtroomOnly && isDeposition) continue;
        if (row.exclude && row.exclude.test(s2)) continue;
        const m = row.trigger.exec(s2);
        if (!m) continue;
        const num = m.slice(1).find((g) => g != null) || null;
        if (row.needsNumber && !num) continue;
        if (row.requiresOffRecord && !offRecord) continue;
        if (row.notWith && row.notWith.some((x) => stagesThisCue.has(x))) continue;
        const key = num ? `${row.id}#${num}` : row.id;
        const prev = lastCue.get(key);
        if (prev != null && cue - prev < (row.debounce || 0)) continue;
        lastCue.set(key, cue);
        stagesThisCue.add(row.id);
        out.push({
          id: row.id, cue, kind: 'parenthetical', stage: row.stage,
          text: parentheticalText(row, num, s2), number: num, cueText: s2,
        });
        if (row.stage === 'off_record' || row.stage === 'recess' || row.stage === 'sidebar') offRecord = true;
        if (row.stage === 'back_on_record') offRecord = false;
        if (row.stage === 'witness_sworn') {
          sworn = true;
          witnessGen += 1;
          // The held DIRECT EXAMINATION, emitted right under the witness
          // block it belongs beneath.
          if (pendingDirect) {
            const key2 = `${pendingDirect.id}@${witnessGen}`;
            if (!headingDone.has(key2)) {
              headingDone.add(key2);
              out.push({
                id: pendingDirect.id, cue, kind: 'heading', stage: 'heading',
                text: headingText(pendingDirect), cueText: s2, deferred: true,
              });
            }
            pendingDirect = null;
          }
        }
      }

      for (const row of EXAMINATION_HEADINGS) {
        if (row.exclude && row.exclude.test(s2)) continue;
        if (!row.trigger.test(s2)) continue;
        if (row.courtOnly && !isCourt && !isDeposition) continue;
        if (row.deferUntilSworn && !sworn && !isDeposition) {
          // Held, not dropped. Emitted on the swearing cue above.
          if (!pendingDirect) pendingDirect = row;
          continue;
        }
        const key = `${row.id}@${witnessGen}`;
        if (row.oncePerWitness && headingDone.has(key)) continue;
        headingDone.add(key);
        out.push({
          id: row.id, cue, kind: 'heading', stage: 'heading',
          text: headingText(row), cueText: s2,
        });
      }
      return out;
    },
  };
}

// One pass over a parsed proceeding, returning every event that WILL fire and
// the cue it fires on. This is how the report proves observability without a
// browser, and how a test asserts that a content edit did not silently delete
// a staged moment.
export function planStagedEvents(utterances, opts = {}) {
  const m = createEventMatcher(opts);
  const plan = [];
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    const evs = m.feed(u.text, { speaker: u.speaker });
    for (const e of evs) {
      const c = String(u.text || '');
      plan.push({ ...e, index: i, speaker: u.speaker, cue: c.length > 92 ? c.slice(0, 89) + '...' : c });
    }
  }
  return plan;
}
