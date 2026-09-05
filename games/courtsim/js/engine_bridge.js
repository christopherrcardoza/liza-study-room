// WEB-REBUILD-001 -- runs the EXACT, unmodified courtsim Python engine
// (py/courtsim/ingest/*, py/courtsim/scoring/*, copied byte-for-byte from
// the real repo, verified identical by `diff` at build time -- see
// reports/WEB_BUILD_001.md) inside Pyodide, in the browser, rather than
// re-implementing alignment/scoring/refusal-gate logic in JS. Zero
// reimplementation risk: this is the same code tests/test_scoring_roundtrip.py
// and tests/test_pipeline_e2e.py already verify. See reports/WEB_RESEARCH_001.md
// for why (every module here is pure stdlib -- no numpy, nothing
// OS-specific -- so it runs unmodified with no extra Pyodide packages).

const ENGINE_FILES = [
  'py/courtsim/__init__.py',
  'py/courtsim/ingest/__init__.py',
  'py/courtsim/ingest/contract.py',
  'py/courtsim/ingest/zoom_adapter.py',
  'py/courtsim/scoring/__init__.py',
  'py/courtsim/scoring/compare.py',
  'py/courtsim/scoring/error_attribution.py',
  'py/courtsim/scoring/scoring.py',
];

export class EngineBridge {
  constructor() {
    this.pyodide = null;
  }

  // onProgress(stageLabel) is called with short human-readable stage names
  // so the loading screen can show real progress, not a spinner.
  async init(onProgress) {
    onProgress?.('loading Python runtime...');
    this.pyodide = await loadPyodide();
    this.pyodide.setStdout({ batched: (s) => console.log('[pyodide]', s) });

    onProgress?.('installing the scoring engine...');
    this.pyodide.FS.mkdirTree('/courtsim_pkg/courtsim/ingest');
    this.pyodide.FS.mkdirTree('/courtsim_pkg/courtsim/scoring');
    for (const relPath of ENGINE_FILES) {
      const resp = await fetch('./' + relPath);
      if (!resp.ok) throw new Error(`failed to fetch engine file ${relPath}: HTTP ${resp.status}`);
      const text = await resp.text();
      const dest = '/courtsim_pkg/' + relPath.slice('py/'.length);
      this.pyodide.FS.writeFile(dest, text);
    }

    this.pyodide.FS.mkdirTree('/proceedings');
    this.pyodide.runPython(`
import sys
sys.path.insert(0, '/courtsim_pkg')
from courtsim.ingest.zoom_adapter import parse_zoom_transcript
from courtsim.scoring.scoring import score_take
`);
  }

  // Parses a bundled proceeding's raw text (already fetched by the caller,
  // never uploaded/typed by the player -- D11) via the real, unmodified
  // Zoom-adapter parser. Returns {utterances: [{index, speaker, text}], ...}.
  parseProceeding(id, rawText) {
    const path = `/proceedings/${id}.txt`;
    this.pyodide.FS.writeFile(path, rawText);
    this.pyodide.globals.set('_parse_path', path);
    const result = this.pyodide.runPython(`
import json
_r = parse_zoom_transcript(_parse_path)
json.dumps({
    "utterances": [
        {"index": i, "speaker": u.speaker_label, "text": u.text}
        for i, u in enumerate(_r.utterances)
    ],
    "candidate_blocks_in": _r.candidate_blocks_in,
    "utterances_out": _r.utterances_out,
})
`);
    return JSON.parse(result);
  }

  // Runs the real, unmodified score_take() -- including its G3 refusal gate
  // (REFUSAL_ACCURACY_FLOOR=15.0%, REFUSAL_MIN_MATCHED_WORDS=3, see
  // courtsim/scoring/scoring.py, unchanged) -- against the reference text
  // and the trainee's committed transcript text.
  scoreTake(referenceText, asrText, wordConfidences) {
    this.pyodide.globals.set('_ref_text', referenceText);
    this.pyodide.globals.set('_asr_text', asrText);
    this.pyodide.globals.set('_word_conf', this.pyodide.toPy(wordConfidences || {}));
    const result = this.pyodide.runPython(`
import json
_res = score_take(_ref_text, _asr_text, dict(_word_conf))
json.dumps({
    "outcome": _res.outcome.value,
    "refusal_reason": _res.refusal_reason,
    "raw_accuracy_pct": _res.raw_accuracy_pct,
    "trainee_accuracy_pct": _res.trainee_accuracy_pct,
    "matched": _res.matched,
    "reference_words": _res.reference_words,
    "recognizer_attributed_count": _res.recognizer_attributed_count,
    "trainee_attributed_count": _res.trainee_attributed_count,
    "classified_errors": [
        {"error_class": e.error_class, "source_word": e.source_word,
         "asr_word": e.asr_word, "attributed_to": e.attributed_to.value}
        for e in _res.classified_errors
    ],
})
`);
    return JSON.parse(result);
  }
}
