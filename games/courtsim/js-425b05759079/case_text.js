
const TS_RE = /^(\d{2}):(\d{2}):(\d{2}) --> (\d{2}):(\d{2}):(\d{2})$/;

export class CaseTextRefusal extends Error {}

function validTime(h, m, s) {
  const hh = Number(h); const mm = Number(m); const ss = Number(s);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || !Number.isInteger(ss)) return false;
  return hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59;
}

function isParenthetical(text) {
  const t = text.trim();
  return t.length >= 2 && t[0] === '(' && t[t.length - 1] === ')'
    && (t.match(/\(/g) || []).length === 1 && (t.match(/\)/g) || []).length === 1;
}

const EXOTIC_BREAKS = new RegExp('[' + [0x0b, 0x0c, 0x1c, 0x1d, 0x1e, 0x85, 0x2028, 0x2029]
  .map((c) => String.fromCharCode(c)).join('') + ']');

export function parseCaseText(sourceName, raw) {
  if (EXOTIC_BREAKS.test(raw)) {
    throw new CaseTextRefusal(`${sourceName}: the file contains a line break this reader and the `
      + 'reference parser would split differently. Refusing rather than reading it two ways.');
  }
  const lines = raw.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();

  if (!lines.some((l) => l.trim() !== '')) {
    throw new CaseTextRefusal(`empty file: ${sourceName}`);
  }

  const candidates = [];
  let i = 0;
  const n = lines.length;
  while (i < n) {
    const stripped = lines[i].trim();
    if (stripped === '') { i += 1; continue; }
    const m = TS_RE.exec(stripped);
    if (m && validTime(m[1], m[2], m[3]) && validTime(m[4], m[5], m[6])) {
      const headerLineNo = i + 1;
      i += 1;
      const body = [];
      while (i < n && lines[i].trim() !== '') { body.push([i + 1, lines[i]]); i += 1; }
      candidates.push([headerLineNo, body]);
    } else {
      i += 1;
    }
  }

  if (candidates.length === 0) {
    throw new CaseTextRefusal(`not a timestamped transcript: zero 'HH:MM:SS --> HH:MM:SS' cue `
      + `headers found in ${sourceName}`);
  }

  const utterances = [];
  for (const [headerLineNo, body] of candidates) {
    if (!body.length) {
      throw new CaseTextRefusal(`${sourceName}:${headerLineNo}: timestamp header with no text `
        + 'line before the next blank line -- refusing rather than emitting an empty utterance');
    }
    const [firstLineNo, firstText] = body[0];
    if (!firstText.includes(':')) {
      throw new CaseTextRefusal(`${sourceName}:${firstLineNo}: cue text has no ':' speaker `
        + `separator -- cannot extract a speaker label without guessing one: ${firstText}`);
    }
    const cut = firstText.indexOf(':');
    const speaker = firstText.slice(0, cut).trim();
    const firstRemainder = firstText.slice(cut + 1);
    if (!speaker) {
      throw new CaseTextRefusal(`${sourceName}:${firstLineNo}: speaker label before ':' is empty`);
    }
    const parts = [firstRemainder.trim()];
    for (let k = 1; k < body.length; k++) parts.push(body[k][1].trim());
    const text = parts.filter((p) => p).join(' ');
    utterances.push({
      index: utterances.length,
      speaker,
      text,
      lineStart: headerLineNo,
      lineEnd: body[body.length - 1][0],
      parenthetical: isParenthetical(text),
    });
  }
  return { utterances, candidateBlocksIn: candidates.length, utterancesOut: utterances.length };
}
