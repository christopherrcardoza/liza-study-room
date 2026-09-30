
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
    trigger: /\bread[\s-]?back\b|\bread\s+(?:that|it|this|them)\s+back\b|\b(?:ms\.|mrs\.|miss|madam)\s+reporter\b[^.?]{0,50}\bread\b|\bmay\s+we\s+have\s+the\s+question\b/i,
    exclude: /\b(?:do\s+not|don't|no)\s+need\s+the\s+read/i,
    stage: 'record_read',
    debounce: 6,
    density: 0,
  },
  {
    id: 'exhibit_marked',
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
    trigger: /\bexhibit\s+(?:no\.\s*)?(\d+)\s+(?:is|was|has\s+been)\s+marked\b|\bmark(?:ing|ed)?\s+[^.?]{0,90}?\bas\s+exhibit\s+(?:no\.\s*)?(\d+)\b|\bmark\s+(?:it|this|that)\s+as\s+exhibit\s+(?:no\.\s*)?(\d+)\b/i,
    needsNumber: true,
    stage: 'exhibit_marked',
    debounce: Infinity,
    density: 1,
  },
  {
    id: 'exhibit_received',
    text: "(Plaintiff's Exhibit N was received in evidence.)",
    partyText: "(PARTY's Exhibit N was received in evidence.)",
    variants: [],
    sources: [
      'WVC_Sample_Court_Transcript.pdf l.12 -- after "THE COURT: Let\'s now have Exhibit Number 1 received into evidence."',
    ],
    trigger: /\bexhibit\s+(?:no\.\s*)?(\d+)\s+(?:is|was|will\s+be)\s+(?:admitted|received)\b/i,
    needsNumber: true,
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
    text: '(Discussion off the record.)',
    srcClass: 'B -- course book (CAT II p.157), NOT attested in the five sample transcripts',
    variants: [],
    sources: [
      'ECLIPSE_FORMAT_SPEC_001 SS3.2 row 24, citing CAT II p.157.',
      'The four deposition files print it as speech with no parenthetical -- an evidence-backed ABSENCE from the sample, which is why srcClass is B and not E.',
    ],
    trigger: /\b(?:go|going|are|be)\s+off\s+the\s+record\b|\boff\s+the\s+microphone\b/i,
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
    trigger: /\bback\s+on\s+the\s+record\b|\bwe\s+are\s+back\b/i,
    requiresOffRecord: true,
    stage: 'back_on_record',
    debounce: 1,
    density: 0,
  },
  {
    id: 'witness_sworn',
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
    trigger: /\bwe\s+(?:are|stand)\s+adjourned\b|\bstands?\s+adjourned\b|\bis\s+concluded\b|\bdeposition\s+of\s+[^.]{0,40}\s+is\s+concluded\b/i,
    exclude: /\bsuspended\s+rather\s+than\s+concluded\b/i,
    stage: 'concluded',
    debounce: 12,
    density: 0,
  },
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

export const EXAMINATION_HEADINGS = [
  {
    id: 'direct',
    heading: 'DIRECT EXAMINATION',
    depositionHeading: 'EXAMINATION',
    sources: ['WVC l.205', 'LA l.314, l.696, l.970, l.1260, l.1524', 'depo form: SAMPLE_Depo l.244'],
    trigger: /\bcalls?\b[^.]{0,60}\b(?:to\s+the\s+stand|as\s+(?:an?\s+)?(?:adverse\s+)?witness)\b|\bcall\s+your\s+(?:first\s+)?witness\b|\bproceed\s+with\s+your\s+direct\s+examination\b|\bgoes\s+first,\s+from\s+the\s+stand\b|\bthis\s+is\s+the\s+deposition\s+of\b/i,
    courtOnly: true,
    oncePerWitness: true,
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

const COUNSEL_LABEL_RE = /^(?:MR\.|MS\.|MRS\.|DR\.)\s+\S/i;
export function isCounselLabel(label) {
  return COUNSEL_LABEL_RE.test(String(label || '').trim());
}

export function createEventMatcher(opts = {}) {
  const isDeposition = !!opts.deposition;
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
