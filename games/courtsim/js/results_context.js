// WEB-REBUILD-001 -- ports courtsim/bridge/server.py's
// _attach_utterance_context() (STEP 2 of FULL_BUILD_002) to JS. This is
// bridge-side presentation glue, not part of the trusted scoring core
// (courtsim/scoring/*, reused unchanged via Pyodide) -- same category as
// voice_cast.js's assignment logic: simple enough to reimplement and
// directly compare against the Python original rather than round-trip
// through Pyodide for it.

function words(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g)) || [];
}

// utterances: [{index, speaker, text}], classifiedErrors: [{error_class,
// source_word, asr_word, attributed_to}] (as returned by
// EngineBridge.scoreTake). Returns classifiedErrors with
// {utterance_index, speaker, utterance_text} attached -- best-effort, never
// guessed: an error with no match found gets nulls, not a wrong line.
export function attachUtteranceContext(utterances, classifiedErrors) {
  const wordStarts = [];
  const utteranceWords = utterances.map((u) => words(u.text));
  utteranceWords.forEach((w, ui) => {
    for (let wi = 0; wi < w.length; wi++) wordStarts.push([ui, wi]);
  });

  let pos = 0;
  const out = [];
  for (const c of classifiedErrors) {
    const entry = { ...c, utterance_index: null, speaker: null, utterance_text: null };
    if (c.error_class !== 'added' && c.source_word) {
      const target = c.source_word.trim().toLowerCase();
      let found = null;
      for (let j = pos; j < Math.min(pos + 40, wordStarts.length); j++) {
        const [ui, wi] = wordStarts[j];
        if (utteranceWords[ui][wi] === target) { found = j; break; }
      }
      if (found !== null) {
        const [ui] = wordStarts[found];
        entry.utterance_index = ui;
        entry.speaker = utterances[ui].speaker;
        entry.utterance_text = utterances[ui].text;
        pos = found + 1;
      }
    }
    out.push(entry);
  }
  return out;
}
