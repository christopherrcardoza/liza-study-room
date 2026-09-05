"""Word-level document comparison for SCREENSCRIBE-COMPARE-001.

Pure logic, no Tk, so the whole thing is testable headlessly: normalization, the diff, the
summary arithmetic and the saved report all live here. The tab in screenscribe.py only renders
what these functions return.

The intended use is comparing a reference document (lyrics copied off a website, a script, a
known-good transcript) against what the model heard. Raw text from those two sources differs in
ways that are not about hearing at all -- curly apostrophes, [Chorus] markers, casing -- and
those differences would drown the real signal, so normalization is on by default and switchable.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
from dataclasses import dataclass, field

# Apostrophes and quotes that lyric sites use interchangeably with the ASCII forms.
_APOSTROPHES = dict.fromkeys(map(ord, "‘’ʼʻ′`´"), "'")
_QUOTES = dict.fromkeys(map(ord, "“”„″"), '"')
_DASHES = dict.fromkeys(map(ord, "‐‑‒–—―"), "-")

# A word is letters/digits, allowing internal apostrophes so "don't" stays one token. Keeping
# contractions whole is deliberate: "don't" against "do not" should read as a substitution,
# because that is real signal about what the model heard.
_WORD_RE = re.compile(r"[^\W_]+(?:'[^\W_]+)*", re.UNICODE)

# --------------------------------------------------------------------------------------------
# Dialect / contraction normalisation (SCREENSCRIBE-COMPARE-005)
#
# A Mac Miller comparison scored 84.0% with 51 substitutions, and the large majority were the
# reference's dropped-g spellings against the model's standard ones: gettin'/getting,
# breakin'/breaking, 'em/them. That is orthography, not mishearing, and it buried the genuine
# errors. Everything below is applied to BOTH documents, so the two spellings meet in the middle.
#
# TO ADD A PAIR: put single words in _DIALECT_WORDS, multi-word forms in _DIALECT_PHRASES.
# --------------------------------------------------------------------------------------------

# Phrases first, because these change the token COUNT: "going to" is two tokens and "gon'" is
# one, so they can only be reconciled before tokenising.
_DIALECT_PHRASES = [
    (r"\bgoing to\b", "gonna"),
    (r"\bwant to\b", "wanna"),
    (r"\bgot to\b", "gotta"),
    (r"\btrying to\b", "tryna"),
    (r"\bkind of\b", "kinda"),
    (r"\bsort of\b", "sorta"),
    (r"\bout of\b", "outta"),
    (r"\blet me\b", "lemme"),
    (r"\bgive me\b", "gimme"),
]

# Single tokens, matched after apostrophes are unified and the text is casefolded.
_DIALECT_WORDS = {
    "'em": "them", "em": "them",
    "'cause": "because", "cause": "because", "cuz": "because", "cos": "because",
    "coz": "because", "'cuz": "because", "'cos": "because",
    "'bout": "about", "bout": "about",
    "'til": "until", "til": "until", "till": "until",
    "'round": "around", "round": "around",
    "gon": "gonna", "gon'": "gonna", "gonna": "gonna",
    "ya": "you", "yo'": "your", "ur": "your",
    "y'all": "you all", "yall": "you all",
    "outta": "outta", "lemme": "lemme", "gimme": "gimme",
    "nothin": "nothing", "somethin": "something", "everythin": "everything",
    "'nother": "another",
    "o'": "of", "d'": "do", "n": "and", "'n": "and", "an'": "and",
    # ain't is deliberately absent: it is a real word both sides use, and folding it would
    # hide a genuine difference rather than an orthographic one.
}

# The dropped g: gettin' / gettin -> getting. Guarded by a minimum stem length so real words
# ending in "in" (in, thin, begin, within, chin) are not mangled into nonsense.
_DROPPED_G = re.compile(r"^(?P<stem>[^\W_]{3,}?)in'?$", re.UNICODE)
_DROPPED_G_KEEP = {
    "in", "thin", "begin", "within", "chin", "skin", "spin", "grin", "twin", "coin", "join",
    "rain", "pain", "main", "gain", "brain", "train", "again", "certain", "captain", "cabin",
    "robin", "satin", "latin", "basin", "resin", "ruin", "origin", "margin", "virgin", "plain",
    "sin", "win", "din", "kin", "pin", "tin", "bin", "fin", "min", "vein", "protein", "domain",
}


def _apply_dialect(token: str) -> str:
    """One token, folded toward its standard spelling. Unknown tokens pass through unchanged."""
    mapped = _DIALECT_WORDS.get(token)
    if mapped is not None:
        return mapped
    if token.endswith("'"):
        # gettin' -> getting handled below; anything else loses only the trailing mark.
        stripped = token[:-1]
        if _DROPPED_G.match(token) and stripped not in _DROPPED_G_KEEP:
            return stripped + "g"
        token = stripped or token
    if token in _DROPPED_G_KEEP:
        return token
    match = _DROPPED_G.match(token)
    if match:
        return token + "g"
    return token

# Lyric-site furniture. These are structural annotations, not words anybody sang.
_BRACKET_LINE = re.compile(r"^\s*[\[\(\{].*[\]\)\}]\s*$")
_SECTION_WORDS = {
    "chorus", "verse", "bridge", "outro", "intro", "pre-chorus", "prechorus", "refrain",
    "hook", "coro", "estribillo", "puente", "instrumental", "solo", "interlude",
}
_SECTION_LINE = re.compile(r"^\s*(pre-?chorus|chorus|verse|bridge|outro|intro|refrain|hook|"
                           r"coro|estribillo|puente|instrumental|solo|interlude)"
                           r"\s*\d*\s*:?\s*$", re.IGNORECASE)
_REPEAT_MARK = re.compile(r"[\(\[]\s*[xX]\s*\d+\s*[\)\]]|\b[xX]\d+\b")
_SITE_NOISE = re.compile(
    r"^\s*(you might also like|embed|see .* live|get tickets as low as .*|"
    r"\d+\s+contributors?.*|read more|translations?|lyrics)\s*$", re.IGNORECASE)
# Our own transcript furniture: a leading [HH:MM:SS] stamp, and the session note lines.
_TIMESTAMP = re.compile(r"^\s*\[\d{1,2}:\d{2}(?::\d{2})?\]\s*")
_NOTE_LINE = re.compile(r"^\s*--\s.*\s--\s*$")
_EN_LINE = re.compile(r"^\s*EN>\s?")


@dataclass
class Summary:
    accuracy: float = 0.0
    matched: int = 0
    missed: int = 0
    extra: int = 0
    substituted: int = 0
    words_a: int = 0
    words_b: int = 0
    # Set when dialect folding is on, so the stricter number is never hidden by the kinder one.
    strict_accuracy: float | None = None
    normalizations: list[str] = field(default_factory=list)

    def accuracy_text(self) -> str:
        if self.strict_accuracy is None:
            return f"Word accuracy {self.accuracy:.1f}%"
        return (f"Word accuracy {self.accuracy:.1f}% (dialect ignored)"
                f" | {self.strict_accuracy:.1f}% (strict)")

    def line(self) -> str:
        return (
            f"{self.accuracy_text()}   "
            f"matched {self.matched}   missed {self.missed}   extra {self.extra}   "
            f"substituted {self.substituted}   |   A {self.words_a} words, B {self.words_b} words"
        )


@dataclass
class Comparison:
    summary: Summary = field(default_factory=Summary)
    # (tag, a_text, b_text) where tag is same | missed | extra | sub
    spans: list[tuple[str, str, str]] = field(default_factory=list)
    tokens_a: list[str] = field(default_factory=list)
    tokens_b: list[str] = field(default_factory=list)
    profile: 'ErrorProfile | None' = None


def _unify(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    return text.translate(_APOSTROPHES).translate(_QUOTES).translate(_DASHES)


def has_en_lines(text: str) -> bool:
    return any(_EN_LINE.match(line) for line in text.splitlines())


def strip_furniture(text: str, keep_en: bool, drop_en: bool) -> str:
    """Remove annotation lines that are not anybody's words.

    keep_en=True keeps ONLY the EN> lines (both documents are English streams).
    drop_en=True removes them (compare the source language only).
    """
    out: list[str] = []
    for raw in text.splitlines():
        line = _unify(raw)
        if keep_en:
            if not _EN_LINE.match(line):
                continue
            line = _EN_LINE.sub("", line)
        elif drop_en and _EN_LINE.match(line):
            continue
        line = _TIMESTAMP.sub("", line)
        if _NOTE_LINE.match(line):
            continue
        stripped = line.strip()
        if not stripped:
            continue
        if _SITE_NOISE.match(stripped):
            continue
        if _SECTION_LINE.match(stripped):
            continue
        # [Chorus], [Verse 1: Diomedes], (Instrumental) -- a whole line inside brackets.
        if _BRACKET_LINE.match(stripped):
            continue
        line = _REPEAT_MARK.sub(" ", line)
        if line.strip():
            out.append(line)
    return "\n".join(out)


def tokenize(text: str, ignore_formatting: bool = True,
             ignore_dialect: bool = False) -> list[str]:
    text = _unify(text)
    if not ignore_formatting:
        # Raw mode: whitespace split, nothing folded, nothing dropped. Punctuation and case then
        # register as real differences, which is what "off" is for.
        return text.split()
    text = text.casefold()
    if ignore_dialect:
        for pattern, replacement in _DIALECT_PHRASES:
            text = re.sub(pattern, replacement, text)
    tokens = _WORD_RE.findall(text)
    if not ignore_dialect:
        return tokens
    folded: list[str] = []
    for token in tokens:
        mapped = _apply_dialect(token)
        # A mapping may expand to two words ("y'all" -> "you all"); keep the stream flat.
        folded.extend(mapped.split()) if " " in mapped else folded.append(mapped)
    return folded


def prepare_pair(text_a: str, text_b: str, ignore_formatting: bool = True,
                 ignore_dialect: bool = False) -> tuple[list[str], list[str]]:
    """Normalize both documents together, because one decision needs to see both.

    If BOTH sides carry EN> lines they are English streams and get compared to each other;
    if only one does, its EN> lines are dropped so the source languages are compared.
    """
    if not ignore_formatting:
        return tokenize(text_a, False), tokenize(text_b, False)
    both_en = has_en_lines(text_a) and has_en_lines(text_b)
    clean_a = strip_furniture(text_a, keep_en=both_en, drop_en=not both_en)
    clean_b = strip_furniture(text_b, keep_en=both_en, drop_en=not both_en)
    return (tokenize(clean_a, True, ignore_dialect),
            tokenize(clean_b, True, ignore_dialect))


def active_normalizations(ignore_formatting: bool, ignore_dialect: bool) -> list[str]:
    """What was folded away, in words, so two reports are never confused for each other."""
    active = []
    if ignore_formatting:
        active.append("formatting (case, punctuation, lyric-site furniture)")
    if ignore_dialect:
        active.append("dialect and contraction spelling")
    return active or ["none (raw comparison)"]


def _tighten_replace(chunk_a: list[str], chunk_b: list[str],
                     spans: list[tuple[str, str, str]]) -> None:
    """Break one replace block into per-word brackets instead of one long unreadable one.

    Field-tested on Titanium: the old rendering collapsed unbalanced replacements into things
    like [titanium -> tactic am tactic you shoot me down but]. Two stages:

    Stage 1 -- a second SequenceMatcher scoped to just this block. Any word the two sides share
    comes out as a match instead of riding inside a bracket. (With autojunk off, the outer
    matcher provably leaves no shared word inside a replace block -- a shared word would have
    been a find_longest_match hit -- so today this stage is a guarantee rather than a workhorse;
    it is what keeps "shared words emerge as matches" true if the tokenizer or matcher ever
    changes.)

    Stage 2 -- the remaining unequal runs are paired word-for-word in order. A bracket is now
    one word against one word ([titanium -> tactic]) and the unpaired tail becomes MISSED or
    EXTRA on its own, instead of padding its partner's bracket. A pair that turns out equal is
    promoted to matched text, never bracketed.
    """
    inner = difflib.SequenceMatcher(None, chunk_a, chunk_b, autojunk=False)
    for op, a1, a2, b1, b2 in inner.get_opcodes():
        sub_a, sub_b = chunk_a[a1:a2], chunk_b[b1:b2]
        if op == "equal":
            spans.append(("same", " ".join(sub_a), " ".join(sub_a)))
        elif op == "delete":
            spans.append(("missed", " ".join(sub_a), ""))
        elif op == "insert":
            spans.append(("extra", "", " ".join(sub_b)))
        else:
            paired = min(len(sub_a), len(sub_b))
            for word_a, word_b in zip(sub_a[:paired], sub_b[:paired]):
                if word_a == word_b:
                    spans.append(("same", word_a, word_b))
                else:
                    spans.append(("sub", word_a, word_b))
            if len(sub_a) > paired:
                spans.append(("missed", " ".join(sub_a[paired:]), ""))
            if len(sub_b) > paired:
                spans.append(("extra", "", " ".join(sub_b[paired:])))


def _merge_same_runs(spans: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Collapse consecutive matched spans so the rendering stays one flowing run of text."""
    merged: list[tuple[str, str, str]] = []
    for tag, chunk_a, chunk_b in spans:
        if merged and tag == "same" and merged[-1][0] == "same":
            joined_a = f"{merged[-1][1]} {chunk_a}".strip()
            merged[-1] = ("same", joined_a, joined_a)
        else:
            merged.append((tag, chunk_a, chunk_b))
    return merged


def _summarize(spans: list[tuple[str, str, str]], words_a: int, words_b: int) -> Summary:
    """Counts recomputed from the final spans, so the numbers and the markup always agree."""
    summary = Summary(words_a=words_a, words_b=words_b)
    for tag, chunk_a, chunk_b in spans:
        if tag == "same":
            summary.matched += len(chunk_a.split())
        elif tag == "missed":
            summary.missed += len(chunk_a.split())
        elif tag == "extra":
            summary.extra += len(chunk_b.split())
        else:
            summary.substituted += len(chunk_a.split())
    summary.accuracy = 100.0 * summary.matched / words_a if words_a else 0.0
    return summary


def compare_documents(text_a: str, text_b: str, ignore_formatting: bool = True,
                      ignore_dialect: bool = False) -> Comparison:
    """Word-level diff of B (transcription) against A (reference)."""
    tokens_a, tokens_b = prepare_pair(text_a, text_b, ignore_formatting, ignore_dialect)
    result = Comparison(tokens_a=tokens_a, tokens_b=tokens_b)
    # autojunk=False matters here: on a song, a repeated chorus makes some words very common,
    # and difflib's popularity heuristic would discard exactly those as junk.
    matcher = difflib.SequenceMatcher(None, tokens_a, tokens_b, autojunk=False)
    spans: list[tuple[str, str, str]] = []
    for op, a1, a2, b1, b2 in matcher.get_opcodes():
        chunk_a = " ".join(tokens_a[a1:a2])
        chunk_b = " ".join(tokens_b[b1:b2])
        if op == "equal":
            spans.append(("same", chunk_a, chunk_a))
        elif op == "delete":
            spans.append(("missed", chunk_a, ""))
        elif op == "insert":
            spans.append(("extra", "", chunk_b))
        else:  # replace: refine rather than emit one collapsed bracket
            _tighten_replace(tokens_a[a1:a2], tokens_b[b1:b2], spans)
    result.spans = _merge_same_runs(spans)
    result.summary = _summarize(result.spans, len(tokens_a), len(tokens_b))
    result.summary.normalizations = active_normalizations(ignore_formatting, ignore_dialect)
    # The shape of the failure, read off the alignment that was just computed.
    stamps = timestamps_for_tokens(text_b, ignore_formatting, ignore_dialect)
    if len(stamps) != len(tokens_b):
        stamps = []  # streams disagree; better no timestamp than a wrong one
    result.profile = build_error_profile(result, stamps)
    if ignore_dialect:
        # A second alignment pass: the two normalisations produce different token streams, so
        # the strict number cannot be read off this one. Cheap on a song, and it means the
        # kinder headline can never hide the stricter truth.
        strict = compare_documents(text_a, text_b, ignore_formatting, ignore_dialect=False)
        result.summary.strict_accuracy = strict.summary.accuracy
    return result


SECTION_RULE = "=" * 78

# The saved report's three sections, in the order a reader wants them.
# How long the transcription's source audio ran, when the report knows. Read back by
# corpus_report so a whole folder of runs can be sorted by capture length.
CAPTURED_LABEL = "Captured audio: "
SECTION_COMPARISON = "1. COMPARISON"
SECTION_DOCUMENT_A = "2. DOCUMENT A (reference)"
SECTION_DOCUMENT_B = "3. DOCUMENT B (transcription)"


def marked_up_diff(result: Comparison) -> str:
    """The diff as inline markers: [MISSED: ...] [EXTRA: ...] [a -> b]."""
    body: list[str] = []
    for tag, chunk_a, chunk_b in result.spans:
        if tag == "same":
            body.append(chunk_a)
        elif tag == "missed":
            body.append(f"[MISSED: {chunk_a}]")
        elif tag == "extra":
            body.append(f"[EXTRA: {chunk_b}]")
        else:
            body.append(f"[{chunk_a} -> {chunk_b}]")
    return " ".join(body)


# ---------------------------------------------------------------------------------------------
# Error profile (SCREENSCRIBE-ERRORSHAPE-001)
#
# Two transcriptions of the same song scored 78.9% and 76.3% -- near-identical -- and failed in
# completely different ways: one scattered its errors evenly, the other tracked the verses and
# then collapsed at the end while looping a phrase. Accuracy alone cannot tell those apart, and
# the difference is the whole finding. Everything below is read off the alignment that already
# exists: no extra model calls, no network.
#
# Thresholds are deliberately blunt and stated in the report, so the founder can check every
# claim by eye against the diff rather than trusting a score.
# ---------------------------------------------------------------------------------------------

BUCKET_COUNT = 5                    # accuracy is reported over each fifth of the reference

# --- calibration (SCREENSCRIBE-ERRORSHAPE-002) ------------------------------------------
# ERRORSHAPE-001 guessed a 5% floor for scattered substitution and it fired on 8 of the 9
# real comparisons; a label that appears on everything distinguishes nothing. Measured over
# the founder's saved reports (tools/errorshape_calibrate.py), substitution rate as a share
# of reference words runs: min 4.3%, Q1 10.0%, MEDIAN 11.5%, Q3 12.7%, max 17.9%,
# stdev 3.9. 'Scattered' is meant to mean WORSE THAN TYPICAL, so the floor sits at the
# upper quartile rounded up -- 13% flags the top 2 of 9 (22%), the closest whole percent to
# the intended top quartile. The severity bands are median + 1 and 2 standard deviations.
CALIBRATION_CORPUS = 9              # distinct comparisons the thresholds were fitted to
CALIBRATION_MEDIAN_SUB_RATE = 11.5
CALIBRATION_Q3_SUB_RATE = 12.7
CALIBRATION_STDEV_SUB_RATE = 3.9
SCATTERED_MIN_SHARE = 0.13          # upper quartile: worse than the typical document
SCATTERED_MODERATE_SHARE = 0.15     # median + 1 stdev
SCATTERED_HEAVY_SHARE = 0.19        # median + 2 stdev: beyond anything in the corpus
SCATTERED_MIN_BUCKETS = 4           # ...and present in at least 4 of the 5 fifths
COLLAPSE_MIN_WORDS = 20             # a run of loss shorter than this is ordinary noise
COLLAPSE_MIN_SHARE = 0.50           # ...and at least half the words in it must be missing
LOOP_MIN_PHRASE = 3                 # shortest repeated phrase worth reporting, in words
LOOP_MAX_PHRASE = 8
LOOP_MIN_COUNT = 3                  # the phrase must appear at least this often in B
LOOP_MIN_EXCESS = 2                 # ...and at least this many times more than in A
FABRICATION_MIN_WORDS = 3           # extra words before the first match
DRIFT_MIN_WRONG_AFTER = 2           # a flip must stick, not be a single slip
DRIFT_MIN_TERM_LENGTH = 4           # drift is about a term, not "the" or "a"
# Function words drift all the time without it meaning anything; the pattern worth
# reporting is a content word the model locked onto wrongly (the titanium/tactic case).
_DRIFT_SKIP = {
    "the", "and", "that", "this", "with", "from", "have", "been", "they", "them",
    "then", "than", "your", "youre", "were", "will", "would", "what", "when", "just",
    "like", "some", "into", "over", "only", "also", "very", "much", "more", "most",
    "such", "each", "both", "here", "there", "well", "even", "know", "dont", "cant",
}


@dataclass
class ErrorPattern:
    kind: str
    headline: str
    detail: str
    severity: str = ""

    def label(self) -> str:
        return f"{self.kind} ({self.severity})" if self.severity else self.kind

    def lines(self) -> list[str]:
        return [f"  {self.headline}", f"      {self.detail}"]


@dataclass
class ErrorProfile:
    patterns: list[ErrorPattern] = field(default_factory=list)
    buckets: list[float] = field(default_factory=list)
    clean: bool = True

    def bucket_line(self) -> str:
        if not self.buckets:
            return "by section: (too short to divide)"
        return "by section: " + " ".join(f"{value:.0f}%" for value in self.buckets)

    def compact(self) -> str:
        names = ", ".join(p.label().replace("_", " ") for p in self.patterns) or "clean"
        return f"Error shape: {names}   |   {self.bucket_line()}"


def _walk_alignment(spans: list[tuple[str, str, str]]) -> tuple[list[dict], list[dict]]:
    """Per-reference-word outcomes, plus the extra (B-only) runs, with positions on both sides.

    Returns (reference, extras) where each reference entry is
    {a_index, b_index, word, outcome, heard} and outcome is match | missed | sub.
    """
    reference: list[dict] = []
    extras: list[dict] = []
    a_pos = b_pos = 0
    for tag, chunk_a, chunk_b in spans:
        words_a = chunk_a.split()
        words_b = chunk_b.split()
        if tag == "same":
            for offset, word in enumerate(words_a):
                reference.append({"a_index": a_pos + offset, "b_index": b_pos + offset,
                                  "word": word, "outcome": "match", "heard": word})
            a_pos += len(words_a)
            b_pos += len(words_a)
        elif tag == "missed":
            for offset, word in enumerate(words_a):
                reference.append({"a_index": a_pos + offset, "b_index": b_pos,
                                  "word": word, "outcome": "missed", "heard": ""})
            a_pos += len(words_a)
        elif tag == "extra":
            extras.append({"a_index": a_pos, "b_index": b_pos, "words": words_b})
            b_pos += len(words_b)
        else:  # sub
            for offset, word in enumerate(words_a):
                heard = words_b[offset] if offset < len(words_b) else ""
                reference.append({"a_index": a_pos + offset, "b_index": b_pos + offset,
                                  "word": word, "outcome": "sub", "heard": heard})
            a_pos += len(words_a)
            b_pos += len(words_b)
    return reference, extras


def _bucket_accuracy(reference: list[dict]) -> list[float]:
    if len(reference) < BUCKET_COUNT:
        return []
    size = len(reference) / BUCKET_COUNT
    out = []
    for index in range(BUCKET_COUNT):
        start, end = int(index * size), int((index + 1) * size)
        window = reference[start:end] or reference[start:start + 1]
        matched = sum(1 for entry in window if entry["outcome"] == "match")
        out.append(100.0 * matched / len(window))
    return out


def _longest_loss_run(reference: list[dict]) -> tuple[int, int, float] | None:
    """Kadane over +1 missing / -1 otherwise: the best contiguous stretch dominated by loss."""
    best_sum = best_start = best_end = 0
    current_sum = 0
    current_start = 0
    for index, entry in enumerate(reference):
        value = 1 if entry["outcome"] == "missed" else -1
        if current_sum <= 0:
            current_sum, current_start = value, index
        else:
            current_sum += value
        if current_sum > best_sum:
            best_sum, best_start, best_end = current_sum, current_start, index
    if best_sum <= 0:
        return None
    window = reference[best_start:best_end + 1]
    if len(window) < COLLAPSE_MIN_WORDS:
        return None
    share = sum(1 for e in window if e["outcome"] == "missed") / len(window)
    if share < COLLAPSE_MIN_SHARE:
        return None
    return best_start, len(window), share


def _ngram_counts(tokens: list[str], size: int) -> dict[tuple[str, ...], int]:
    counts: dict[tuple[str, ...], int] = {}
    for index in range(len(tokens) - size + 1):
        key = tuple(tokens[index:index + size])
        counts[key] = counts.get(key, 0) + 1
    return counts


def _find_loop(tokens_a: list[str], tokens_b: list[str]) -> tuple[str, int, int] | None:
    """A phrase the transcription repeats more often than the reference does.

    Songs repeat choruses legitimately, so the test is always B against A, never B alone.
    """
    best = None
    for size in range(LOOP_MAX_PHRASE, LOOP_MIN_PHRASE - 1, -1):
        counts_b = _ngram_counts(tokens_b, size)
        counts_a = _ngram_counts(tokens_a, size)
        for phrase, count_b in counts_b.items():
            if count_b < LOOP_MIN_COUNT:
                continue
            count_a = counts_a.get(phrase, 0)
            excess = count_b - count_a
            if excess < LOOP_MIN_EXCESS:
                continue
            # Rank by how far B overshoots, then how often it repeats, then length.
            # Order matters: overlapping copies of a looped phrase also produce
            # LONGER n-grams with a LOWER count, and reporting one of those
            # describes the overlap artefact rather than the phrase the model
            # actually got stuck on.
            candidate = (excess, count_b, size, " ".join(phrase), count_a)
            if best is None or candidate[:3] > best[:3]:
                best = candidate
    if best is None:
        return None
    return best[3], best[1], best[4]


def _find_drift(reference: list[dict]) -> tuple[str, str, int, int, int] | None:
    """A term heard correctly, then wrong from some point on and never right again."""
    by_word: dict[str, list[dict]] = {}
    for entry in reference:
        if entry["outcome"] in ("match", "sub"):
            by_word.setdefault(entry["word"], []).append(entry)
    best = None
    for word, entries in by_word.items():
        entries.sort(key=lambda e: e["a_index"])
        if len(word) < DRIFT_MIN_TERM_LENGTH or word in _DRIFT_SKIP:
            continue
        subs = [e for e in entries if e["outcome"] == "sub"]
        if len(subs) < DRIFT_MIN_WRONG_AFTER:
            continue
        first_sub = subs[0]["a_index"]
        before = [e for e in entries if e["a_index"] < first_sub]
        after = [e for e in entries if e["a_index"] >= first_sub]
        if not before or any(e["outcome"] == "match" for e in after):
            continue  # never right before, or it recovers: not a one-way flip
        heard = subs[0]["heard"] or "(nothing)"
        candidate = (len(subs), word, heard, first_sub, len(before), len(subs))
        if best is None or candidate[0] > best[0]:
            best = candidate
    if best is None:
        return None
    return best[1], best[2], best[3], best[4], best[5]


def build_error_profile(result: "Comparison", stamps_b: list[str] | None = None) -> ErrorProfile:
    """Name the failure patterns present, each with the numbers behind it."""
    reference, extras = _walk_alignment(result.spans)
    profile = ErrorProfile(buckets=_bucket_accuracy(reference))
    total = len(reference)
    if not total:
        return profile

    def stamp_for(b_index: int) -> str:
        if not stamps_b:
            return ""
        # A collapse running to the end of the recording has no B token of its
        # own; the last word actually transcribed is the right place to point at.
        value = stamps_b[min(b_index, len(stamps_b) - 1)]
        return f" (around {value} in Document B)" if value else ""

    # --- FABRICATION AT START: extras before anything matched
    leading = 0
    for tag, _chunk_a, chunk_b in result.spans:
        if tag == "same":
            break
        if tag == "extra":
            leading += len(chunk_b.split())
        elif tag == "sub":
            break
    if leading >= FABRICATION_MIN_WORDS:
        profile.patterns.append(ErrorPattern(
            "fabrication_at_start",
            "FABRICATION AT START - the transcription opens with words that are not in the "
            "reference.",
            f"{leading} invented words before the first word that matched. This is the known "
            "session-start artefact: the model fills in before it has heard anything real.",
        ))

    # --- COLLAPSE / RUN OF LOSS
    run = _longest_loss_run(reference)
    if run:
        start, length, share = run
        entry = reference[start]
        profile.patterns.append(ErrorPattern(
            "collapse",
            "COLLAPSE / RUN OF LOSS - a stretch of the reference went missing in one block, "
            "not scattered.",
            f"starts at reference word {start + 1} of {total}"
            f"{stamp_for(entry['b_index'])}, runs {length} words, "
            f"{share * 100:.0f}% of them missing. Threshold: at least {COLLAPSE_MIN_WORDS} "
            f"words with at least {COLLAPSE_MIN_SHARE * 100:.0f}% missing. "
            f"First words lost: \"{' '.join(e['word'] for e in reference[start:start + 8] if e['outcome'] == 'missed')}\"",
        ))

    # --- LOOPING / REPETITION
    loop = _find_loop(result.tokens_a, result.tokens_b)
    if loop:
        phrase, count_b, count_a = loop
        profile.patterns.append(ErrorPattern(
            "looping",
            "LOOPING / REPETITION - the transcription repeats a phrase more often than the "
            "reference does.",
            f"\"{phrase}\" appears {count_b} times in Document B against {count_a} in "
            f"Document A. Threshold: at least {LOOP_MIN_COUNT} occurrences and at least "
            f"{LOOP_MIN_EXCESS} more than the reference.",
        ))

    # --- DRIFT AFTER AN ERROR
    drift = _find_drift(reference)
    if drift:
        word, heard, flip_index, before, after = drift
        profile.patterns.append(ErrorPattern(
            "drift_after_error",
            "DRIFT AFTER AN ERROR - a word was heard correctly, then got it wrong from one "
            "point on and never recovered.",
            f"\"{word}\" was correct {before} time(s), then heard as \"{heard}\" from "
            f"reference word {flip_index + 1} onward, wrong {after} time(s) after that and "
            f"never right again.",
        ))

    # --- SCATTERED SUBSTITUTION
    subs = [e for e in reference if e["outcome"] == "sub"]
    share = len(subs) / total
    touched = len({min(BUCKET_COUNT - 1, int(e["a_index"] * BUCKET_COUNT / total)) for e in subs})
    if share >= SCATTERED_MIN_SHARE and touched >= SCATTERED_MIN_BUCKETS:
        singles = sum(1 for span in result.spans
                      if span[0] == "sub" and len(span[1].split()) == 1)
        if share >= SCATTERED_HEAVY_SHARE:
            severity = "heavy"
        elif share >= SCATTERED_MODERATE_SHARE:
            severity = "moderate"
        else:
            severity = "mild"
        profile.patterns.append(ErrorPattern(
            "scattered_substitution",
            f"SCATTERED SUBSTITUTION ({severity}) - wrong words spread evenly through the "
            "document rather than clustered.",
            f"{len(subs)} substituted words ({share * 100:.1f}% of the reference), "
            f"{singles} of them single words, present in {touched} of the "
            f"{BUCKET_COUNT} sections. The typical document in the calibration corpus "
            f"substitutes {CALIBRATION_MEDIAN_SUB_RATE:.1f}%; this one is "
            f"{share * 100 - CALIBRATION_MEDIAN_SUB_RATE:+.1f} points from that. "
            f"Bands: mild from {SCATTERED_MIN_SHARE * 100:.0f}%, moderate from "
            f"{SCATTERED_MODERATE_SHARE * 100:.0f}%, heavy from "
            f"{SCATTERED_HEAVY_SHARE * 100:.0f}%; at least {SCATTERED_MIN_BUCKETS} of "
            f"{BUCKET_COUNT} sections.",
            severity,
        ))

    profile.clean = not profile.patterns
    if profile.clean:
        profile.patterns.append(ErrorPattern(
            "clean",
            "CLEAN - no failure pattern above ordinary noise.",
            f"{result.summary.accuracy:.1f}% accuracy with errors too few, too short or too "
            "clustered in one place to name a pattern.",
        ))
    return profile


def _clean_line(line: str, keep_en: bool, drop_en: bool) -> tuple[str | None, str]:
    """One line of furniture stripping. Returns (kept text or None, timestamp seen)."""
    line = _unify(line)
    if keep_en:
        if not _EN_LINE.match(line):
            return None, ""
        line = _EN_LINE.sub("", line)
    elif drop_en and _EN_LINE.match(line):
        return None, ""
    stamp_match = _TIMESTAMP.match(line)
    stamp = stamp_match.group(0).strip().strip("[]") if stamp_match else ""
    line = _TIMESTAMP.sub("", line)
    if _NOTE_LINE.match(line):
        return None, stamp
    stripped = line.strip()
    if not stripped or _SITE_NOISE.match(stripped) or _SECTION_LINE.match(stripped):
        return None, stamp
    if _BRACKET_LINE.match(stripped):
        return None, stamp
    line = _REPEAT_MARK.sub(" ", line)
    return (line if line.strip() else None), stamp


def timestamps_for_tokens(text: str, ignore_formatting: bool = True,
                          ignore_dialect: bool = False) -> list[str]:
    """A [HH:MM:SS] stamp per token of Document B, for locating a collapse in the recording.

    Returns [] when the two token streams disagree in length, rather than risk naming a time
    that belongs to a different part of the document.
    """
    stamps: list[str] = []
    current = ""
    for raw in text.splitlines():
        kept, stamp = _clean_line(raw, keep_en=False, drop_en=has_en_lines(text))
        if stamp:
            current = stamp
        if kept is None:
            continue
        for _token in tokenize(kept, ignore_formatting, ignore_dialect):
            stamps.append(current)
    return stamps


def _profile_lines(result: Comparison) -> list[str]:
    """The error profile, directly under the accuracy numbers and above the diff."""
    profile = result.profile
    if profile is None:
        return []
    lines = [profile.bucket_line(),
             "    (accuracy over each fifth of the reference, in order)",
             "",
             "ERROR PROFILE - how it failed, not just how much:",
             f"  (thresholds calibrated on {CALIBRATION_CORPUS} saved comparisons; "
             f"median substitution rate {CALIBRATION_MEDIAN_SUB_RATE:.1f}%, "
             f"upper quartile {CALIBRATION_Q3_SUB_RATE:.1f}%)"]
    for pattern in profile.patterns:
        lines.extend(pattern.lines())
    lines.append("")
    return lines


def report_text(result: Comparison, text_a: str = "", text_b: str = "",
                name_a: str = "Document A (reference)",
                name_b: str = "Document B (transcription)",
                ignore_formatting: bool = True,
                captured_s: float | None = None) -> str:
    """The saved .txt, in three sections: the comparison, then both sources verbatim.

    Comparison first because that is what a reader opens the file for. The two source documents
    follow, exactly as they were pasted or loaded, so the report is self-contained -- another
    lane can review the finding without needing the originals alongside.
    """
    summary = result.summary
    lines = [
        "ScreenScribe document comparison",
        SECTION_RULE,
        f"{name_a}: {summary.words_a} words",
        f"{name_b}: {summary.words_b} words",
        # SCREENSCRIBE-DECLINE-FORENSICS-001: carried through so the corpus tool can say whether
        # a run scored badly because it heard the audio poorly or because it barely heard any.
        # Only present when the transcription came from a live session that measured it.
        *([f"{CAPTURED_LABEL}{captured_s:.1f} s "
           f"({int(captured_s) // 60:d}m {int(captured_s) % 60:02d}s)"] if captured_s else []),
        f"Formatting differences: {'ignored' if ignore_formatting else 'INCLUDED (raw)'}",
        # Recorded so a kinder report can never be mistaken for a stricter one later.
        "Normalizations applied: " + "; ".join(
            summary.normalizations or active_normalizations(ignore_formatting, False)
        ),
        "",
        SECTION_RULE,
        SECTION_COMPARISON,
        SECTION_RULE,
        "",
        f"Word accuracy : {summary.accuracy:.1f}%   (matched / reference words)",
        *([f"  strict      : {summary.strict_accuracy:.1f}%   "
           "(same documents, dialect spelling NOT folded)"]
          if summary.strict_accuracy is not None else []),
        f"Matched       : {summary.matched}",
        f"Missed  (in A only, not heard) : {summary.missed}",
        f"Extra   (in B only, invented)  : {summary.extra}",
        f"Substituted (heard differently): {summary.substituted}",
        "",
        *_profile_lines(result),
        marked_up_diff(result),
        "",
        SECTION_RULE,
        SECTION_DOCUMENT_A,
        SECTION_RULE,
        "",
        text_a.rstrip("\n"),
        "",
        SECTION_RULE,
        SECTION_DOCUMENT_B,
        SECTION_RULE,
        "",
        text_b.rstrip("\n"),
    ]
    return "\n".join(lines) + "\n"


def srt_to_text(raw: str) -> str:
    """Strip SRT numbering and timing so a subtitle file can be pasted in as a document."""
    out: list[str] = []
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.isdigit():
            continue
        if "-->" in stripped:
            continue
        out.append(stripped)
    return "\n".join(out)


def load_document(path) -> str:
    """Read a .txt or .srt into comparable text."""
    from pathlib import Path

    path = Path(path)
    raw = path.read_text(encoding="utf-8", errors="replace")
    return srt_to_text(raw) if path.suffix.lower() == ".srt" else raw


def strip_timestamps(text: str) -> str:
    """What Send to Compare uses: drop [HH:MM:SS] stamps but keep the words and line breaks."""
    return "\n".join(_TIMESTAMP.sub("", _unify(line)) for line in text.splitlines())


# =============================================================================================
# PUBLIC LIBRARY API (SCREENSCRIBE-COMPARELIB-001)
#
# A plain-data surface over the diff engine above, for callers outside this app (GT / the
# AUDIO-PROOF lane) that align an ASR pass against an EXISTING transcript. No Tk, no app state:
# in / out are strings and dataclasses. The full contract is written up in docs/COMPARE_API.md.
#
# The engine's compare_documents() is the reference implementation of the alignment and the
# error-shape classifier, and it is NOT modified here -- everything below sits on top of it, so
# the ScreenScribe UI behaves exactly as before. This layer adds three things the raw engine
# never gave a caller:
#
#   1. CHARACTER OFFSETS into the supplied transcript text for every positioned difference.
#   2. An honest UNPOSITIONED marker for differences that exist on the ASR side only, instead of
#      a synthesized one-character span (the defect GT hit: highlights landing on punctuation).
#   3. Per-difference error-shape labels, alongside the document-level patterns with evidence.
#
# Orientation of the two documents (this is the whole basis of "which side has a position"):
#   transcript_text -> Document A, the existing transcript. Offsets index into THIS text.
#   asr_text        -> Document B, the fresh ASR pass.
# A word in A only (missed) or in both (substituted) HAS a position in the transcript. A word in
# B only (an ASR word with no transcript counterpart) has NO position in the transcript, so it is
# returned UNPOSITIONED. This library never synthesizes a position and never rules on which side
# is right -- both surfaces are returned and the human decides.
# =============================================================================================

# GT's defaults if it passes nothing: fold formatting (case, punctuation, lyric/transcript
# furniture) so the offsets and counts track words rather than typography, but do NOT fold
# dialect/contraction spelling. Dialect folding rewrites and can merge/expand tokens
# ("going to"->"gonna", "y'all"->"you all"), which breaks the one-word-to-one-span correspondence
# offsets depend on; leaving it off keeps every positioned difference's offset exact. Callers who
# want it can still pass ignore_dialect=True (see the degradation note on align_transcript).
DEFAULT_IGNORE_FORMATTING = True
DEFAULT_IGNORE_DIALECT = False


@dataclass
class Difference:
    """One word-level disagreement between the transcript (A) and the ASR pass (B).

    kind is one of:
      "missed" -- a transcript word the ASR pass did not produce (in A only).
      "extra"  -- an ASR word with no transcript counterpart (in B only). Always UNPOSITIONED.
      "sub"    -- a transcript word the ASR pass heard as something else (in both).

    positioned is True iff this difference has a character span in transcript_text. When True,
    transcript_text[start:end] == transcript_word EXACTLY -- that invariant is asserted at 100%
    by the offset-integrity test. When False, start and end are None and no span is invented.

    Both surfaces are always carried, never a verdict: transcript_word is the word as it appears
    in the transcript (original case, for a highlighter to select), asr_word is the word the ASR
    pass produced (normalized). One side is "" for one-sided differences.

    shapes / shape_evidence (SCREENSCRIBE-COMPARELIB-002): shapes lists the error-shape labels
    this difference belongs to; shape_evidence maps each of those labels to the MEASURED numbers
    the classifier used to assign it -- e.g. looping -> {phrase, count_b, count_a}, collapse ->
    {start_word, length, missing_share, total_reference}. These are the classifier's own
    quantities, not a synthesized per-difference score: a caller (like GT's noise gate) can grade
    on them directly instead of re-deriving what the classifier already computed. When a
    difference carries NO shape, both are empty -- shape_evidence == {} means "no shape was
    measured for this difference", which is deliberately NOT the same as a measured zero. No single
    confidence value is emitted: any such number would have to be derived from these same
    quantities, and an unstated/unre-checkable score is worse than none (Rule 52), so the raw
    evidence is surfaced and the caller combines it as its own gate requires.
    """
    kind: str
    transcript_word: str
    asr_word: str
    start: int | None
    end: int | None
    positioned: bool
    shapes: list[str] = field(default_factory=list)
    shape_evidence: dict = field(default_factory=dict)
    a_index: int | None = None
    b_index: int | None = None


@dataclass
class ShapePattern:
    """A document-level failure shape from the existing classifier, with its evidence numbers.

    kind matches build_error_profile's kinds (fabrication_at_start, collapse, looping,
    drift_after_error, scattered_substitution, clean). headline/detail are the classifier's own
    human-readable text, verbatim; evidence is the same numbers as plain data so a caller does
    not have to parse the prose.
    """
    kind: str
    severity: str
    headline: str
    detail: str
    evidence: dict = field(default_factory=dict)


@dataclass
class AlignmentResult:
    """The whole plain-data result of align_transcript().

    transcript_text is the exact string the offsets index into: the supplied transcript after
    Unicode NFC normalization and quote/dash unification. For ASCII / already-composed input this
    is byte-identical to what was passed; slice THIS text (not your own copy) with the offsets.

    differences are sorted with every positioned difference first (by start offset), then the
    unpositioned ones in document order -- so a caller rendering highlights walks the positioned
    ones and shows the rest in a side list.
    """
    transcript_text: str
    differences: list[Difference]
    patterns: list[ShapePattern]
    summary: dict
    normalizations: dict


def _span_overlaps(lo: int, hi: int, spans: list[tuple[int, int]]) -> bool:
    return any(lo < end and start < hi for start, end in spans)


def _norm_of(surface: str, ignore_dialect: bool) -> str:
    """The normalized token the alignment sees for one raw surface word."""
    token = surface.casefold()
    return _apply_dialect(token) if ignore_dialect else token


def _offset_tokens(text: str, ignore_formatting: bool, ignore_dialect: bool,
                   keep_en: bool, drop_en: bool) -> list[tuple[str, str, int, int]]:
    """Tokenize `text` (already unified) as Document A, keeping a character span per token.

    Returns (norm, surface, start, end) per token, in order, where text[start:end] == surface.
    The furniture handling mirrors strip_furniture()/tokenize() exactly so the sequence of norm
    values lines up 1:1 with what compare_documents() aligned; the caller verifies that and falls
    back to unpositioned if the two streams ever diverge (dialect folding can change token count).
    """
    if not ignore_formatting:
        # Raw mode: whitespace split, no folding, no furniture -- mirror tokenize(text, False).
        return [(m.group(0), m.group(0), m.start(), m.end())
                for m in re.finditer(r"\S+", text)]

    out: list[tuple[str, str, int, int]] = []
    for line, line_off in _lines_with_offsets(text):
        # --- EN> handling, a pure prefix trim (or a whole-line drop)
        if keep_en:
            m = _EN_LINE.match(line)
            if not m:
                continue
            trim = m.end()
        elif drop_en and _EN_LINE.match(line):
            continue
        else:
            trim = 0
        # --- leading [HH:MM:SS] stamp, another pure prefix trim
        ts = _TIMESTAMP.match(line[trim:])
        if ts:
            trim += ts.end()
        body = line[trim:]
        body_off = line_off + trim
        stripped = body.strip()
        if not stripped:
            continue
        if _NOTE_LINE.match(body) or _SITE_NOISE.match(stripped) \
                or _SECTION_LINE.match(stripped) or _BRACKET_LINE.match(stripped):
            continue
        # Repeat marks become a space in tokenize(); exclude any word match that overlaps one.
        repeat_spans = [(m.start(), m.end()) for m in _REPEAT_MARK.finditer(body)]
        for wm in _WORD_RE.finditer(body):
            if repeat_spans and _span_overlaps(wm.start(), wm.end(), repeat_spans):
                continue
            surface = wm.group(0)
            out.append((_norm_of(surface, ignore_dialect), surface,
                        body_off + wm.start(), body_off + wm.end()))
    return out


def _lines_with_offsets(text: str) -> list[tuple[str, int]]:
    """Split on \\n / \\r / \\r\\n, returning (line, start_offset) into `text`.

    A trailing newline yields no empty final line, matching str.splitlines() for these breaks.
    """
    out: list[tuple[str, int]] = []
    i = start = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\n":
            out.append((text[start:i], start))
            i += 1
            start = i
        elif ch == "\r":
            out.append((text[start:i], start))
            i += 2 if i + 1 < n and text[i + 1] == "\n" else 1
            start = i
        else:
            i += 1
    if start < n:
        out.append((text[start:n], start))
    return out


def _pattern_evidence(result: Comparison, kind: str) -> dict:
    """Recompute the numbers behind one classifier pattern, from the same helpers it uses."""
    reference, _extras = _walk_alignment(result.spans)
    total = len(reference)
    if kind == "fabrication_at_start":
        leading = 0
        for tag, _a, chunk_b in result.spans:
            if tag == "same" or tag == "sub":
                break
            if tag == "extra":
                leading += len(chunk_b.split())
        return {"leading_words": leading}
    if kind == "collapse":
        run = _longest_loss_run(reference)
        if not run:
            return {}
        start, length, share = run
        return {"start_word": start + 1, "length": length,
                "missing_share": round(share, 4), "total_reference": total}
    if kind == "looping":
        loop = _find_loop(result.tokens_a, result.tokens_b)
        if not loop:
            return {}
        phrase, count_b, count_a = loop
        return {"phrase": phrase, "count_b": count_b, "count_a": count_a}
    if kind == "drift_after_error":
        drift = _find_drift(reference)
        if not drift:
            return {}
        word, heard, flip_index, before, after = drift
        return {"word": word, "heard": heard, "flip_word": flip_index + 1,
                "correct_before": before, "wrong_after": after}
    if kind == "scattered_substitution":
        subs = [e for e in reference if e["outcome"] == "sub"]
        share = len(subs) / total if total else 0.0
        touched = len({min(BUCKET_COUNT - 1, int(e["a_index"] * BUCKET_COUNT / total))
                       for e in subs}) if total else 0
        return {"substituted": len(subs), "share": round(share, 4),
                "sections_touched": touched, "sections_total": BUCKET_COUNT}
    if kind == "clean":
        return {"accuracy": round(result.summary.accuracy, 4)}
    return {}


def _shape_membership(result: Comparison) -> dict:
    """Which differences each localizable shape covers, keyed for per-difference labelling.

    Returns a dict with: fabrication (a set of b_index for leading extras), collapse (an a_index
    range), drift (word + first-flip a_index), looping (b_index ranges of the repeated phrase).
    Only the shapes the classifier actually reported are populated. Scattered/clean are
    document-wide by nature and carry no per-difference members.
    """
    reference, _extras = _walk_alignment(result.spans)
    kinds = {p.kind for p in (result.profile.patterns if result.profile else [])}
    members: dict = {"fab_b": set(), "collapse_a": None, "drift": None, "loop_b": []}

    if "fabrication_at_start" in kinds:
        b_pos = 0
        for tag, _a, chunk_b in result.spans:
            if tag == "same" or tag == "sub":
                break
            if tag == "extra":
                words = chunk_b.split()
                for j in range(len(words)):
                    members["fab_b"].add(b_pos + j)
                b_pos += len(words)

    if "collapse" in kinds:
        run = _longest_loss_run(reference)
        if run:
            start, length, _share = run
            members["collapse_a"] = (start, start + length)

    if "drift_after_error" in kinds:
        drift = _find_drift(reference)
        if drift:
            word, _heard, flip_index, _before, _after = drift
            members["drift"] = (word, flip_index)

    if "looping" in kinds:
        loop = _find_loop(result.tokens_a, result.tokens_b)
        if loop:
            phrase = loop[0].split()
            size = len(phrase)
            tokens_b = result.tokens_b
            for idx in range(len(tokens_b) - size + 1):
                if tokens_b[idx:idx + size] == phrase:
                    members["loop_b"].append((idx, idx + size))
    return members


def _raw_differences(result: Comparison) -> list[dict]:
    """Per-word difference records with a_index/b_index, mirroring _walk_alignment's arithmetic."""
    diffs: list[dict] = []
    a_pos = b_pos = 0
    for tag, chunk_a, chunk_b in result.spans:
        words_a, words_b = chunk_a.split(), chunk_b.split()
        if tag == "same":
            a_pos += len(words_a)
            b_pos += len(words_a)
        elif tag == "missed":
            for off, word in enumerate(words_a):
                diffs.append({"kind": "missed", "a_index": a_pos + off, "b_index": b_pos,
                              "a_word": word, "b_word": ""})
            a_pos += len(words_a)
        elif tag == "extra":
            for off, word in enumerate(words_b):
                diffs.append({"kind": "extra", "a_index": a_pos, "b_index": b_pos + off,
                              "a_word": "", "b_word": word})
            b_pos += len(words_b)
        else:  # sub -- tightened to one-for-one pairs, but pair defensively
            paired = min(len(words_a), len(words_b))
            for off in range(paired):
                diffs.append({"kind": "sub", "a_index": a_pos + off, "b_index": b_pos + off,
                              "a_word": words_a[off], "b_word": words_b[off]})
            for off in range(paired, len(words_a)):
                diffs.append({"kind": "missed", "a_index": a_pos + off, "b_index": b_pos + len(words_b),
                              "a_word": words_a[off], "b_word": ""})
            for off in range(paired, len(words_b)):
                diffs.append({"kind": "extra", "a_index": a_pos + paired, "b_index": b_pos + off,
                              "a_word": "", "b_word": words_b[off]})
            a_pos += len(words_a)
            b_pos += len(words_b)
    return diffs


def _shapes_for(raw: dict, members: dict) -> list[str]:
    """The per-difference error-shape labels that apply to one raw difference record."""
    shapes: list[str] = []
    if raw["kind"] == "extra" and raw["b_index"] in members["fab_b"]:
        shapes.append("fabrication_at_start")
    if raw["kind"] == "missed" and members["collapse_a"]:
        lo, hi = members["collapse_a"]
        if lo <= raw["a_index"] < hi:
            shapes.append("collapse")
    if raw["kind"] == "sub" and members["drift"]:
        word, flip_index = members["drift"]
        if raw["a_word"] == word and raw["a_index"] >= flip_index:
            shapes.append("drift_after_error")
    if raw["kind"] in ("extra", "sub"):
        if any(lo <= raw["b_index"] < hi for lo, hi in members["loop_b"]):
            shapes.append("looping")
    return shapes


def align_transcript(transcript_text: str, asr_text: str, *,
                     ignore_formatting: bool = DEFAULT_IGNORE_FORMATTING,
                     ignore_dialect: bool = DEFAULT_IGNORE_DIALECT) -> AlignmentResult:
    """Align an ASR pass (asr_text, Document B) against an existing transcript (transcript_text,
    Document A) and return every word-level difference as plain data.

    This is (a)-(d) of the library contract in one call:
      (a) word-level alignment with caller-controlled normalization,
      (b) a per-difference error-shape label on each Difference (.shapes), with the classifier's
          measured evidence behind each label (.shape_evidence); unlabelled differences carry {},
      (c) character offsets into transcript_text for every positioned difference,
      (d) no opinion on which side is right -- both surfaces are returned.

    Positioning: differences on the transcript side (missed, sub) carry real offsets into
    result.transcript_text; differences on the ASR side only (extra) are returned UNPOSITIONED
    (start/end None, positioned False) rather than with a synthesized span.

    Normalization degradation: with ignore_dialect=True, dialect folding can change the token
    count (merge "going to"->"gonna", expand "y'all"->"you all"), and when it does the offset
    stream can no longer be lined up word-for-word. Rather than emit a wrong offset, this function
    then returns every difference UNPOSITIONED for that run. With the defaults it never degrades.
    """
    result = compare_documents(transcript_text, asr_text, ignore_formatting, ignore_dialect)

    canonical = _unify(transcript_text)
    both_en = has_en_lines(_unify(transcript_text)) and has_en_lines(_unify(asr_text))
    offset_tokens = _offset_tokens(canonical, ignore_formatting, ignore_dialect,
                                   keep_en=both_en, drop_en=not both_en)
    # Trust offsets only if the reconstructed token stream matches what was aligned, exactly.
    offset_map: list[tuple[str, int, int]] | None
    if [tok[0] for tok in offset_tokens] == result.tokens_a:
        offset_map = [(surface, start, end) for _norm, surface, start, end in offset_tokens]
    else:
        offset_map = None

    members = _shape_membership(result)
    # (COMPARELIB-002) The classifier's measured evidence, computed once and shared: it backs both
    # the document-level patterns and the per-difference shape_evidence, so a difference's numbers
    # can never disagree with the document pattern they came from.
    profile_patterns = result.profile.patterns if result.profile else []
    evidence_by_kind = {p.kind: _pattern_evidence(result, p.kind) for p in profile_patterns}

    differences: list[Difference] = []
    for raw in _raw_differences(result):
        shapes = _shapes_for(raw, members)
        # Attach the measured numbers behind each label this difference carries. An unlabelled
        # difference gets {} -- explicitly no shape measured, never a zero that reads as measured.
        shape_evidence = {kind: evidence_by_kind[kind] for kind in shapes
                          if kind in evidence_by_kind}
        kind = raw["kind"]
        if kind == "extra":
            differences.append(Difference(
                kind="extra", transcript_word="", asr_word=raw["b_word"],
                start=None, end=None, positioned=False, shapes=shapes,
                shape_evidence=shape_evidence, a_index=None, b_index=raw["b_index"]))
            continue
        # missed / sub: positioned iff we have a trustworthy offset for this A token
        if offset_map is not None and raw["a_index"] < len(offset_map):
            surface, start, end = offset_map[raw["a_index"]]
            differences.append(Difference(
                kind=kind, transcript_word=surface,
                asr_word=raw["b_word"], start=start, end=end, positioned=True,
                shapes=shapes, shape_evidence=shape_evidence,
                a_index=raw["a_index"], b_index=raw["b_index"]))
        else:
            differences.append(Difference(
                kind=kind, transcript_word=raw["a_word"], asr_word=raw["b_word"],
                start=None, end=None, positioned=False, shapes=shapes,
                shape_evidence=shape_evidence, a_index=raw["a_index"], b_index=raw["b_index"]))

    # (3) positioned first (by offset), then unpositioned in document (B) order.
    differences.sort(key=lambda d: (0, d.start) if d.positioned
                     else (1, d.b_index if d.b_index is not None else 0))

    patterns = [ShapePattern(kind=p.kind, severity=p.severity, headline=p.headline,
                             detail=p.detail, evidence=evidence_by_kind[p.kind])
                for p in profile_patterns]

    summary = result.summary
    return AlignmentResult(
        transcript_text=canonical,
        differences=differences,
        patterns=patterns,
        summary={
            "accuracy": summary.accuracy,
            "strict_accuracy": summary.strict_accuracy,
            "matched": summary.matched,
            "missed": summary.missed,
            "extra": summary.extra,
            "substituted": summary.substituted,
            "transcript_words": summary.words_a,
            "asr_words": summary.words_b,
        },
        normalizations={
            "ignore_formatting": ignore_formatting,
            "ignore_dialect": ignore_dialect,
            "applied": active_normalizations(ignore_formatting, ignore_dialect),
            "offsets_available": offset_map is not None,
        },
    )
