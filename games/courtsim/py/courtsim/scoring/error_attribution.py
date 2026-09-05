"""Requirement 1.9 — separate trainee error from recognizer error.

Amendment 1 §A5: "Treat it as the hardest single item in Phase 1 and design
it before 1.7 and 1.8, not after — both of those depend on it being
possible." Designed and written first, before scoring.py wires it in.

THE PROBLEM
-----------
When the trainee's ASR-transcribed text differs from the source transcript
at some position, the difference could mean either of two very different
things:

  (a) the trainee actually said/typed something different from the source
      — a real trainee error, worth scoring against them; or
  (b) the trainee said the CORRECT word, and faster-whisper mis-heard it —
      a recognizer error, which must NOT be scored against the trainee
      (spec's stated test: "Say a word correctly that the recognizer is
      known to mishear; it is NOT scored against the trainee").

Nothing in this pipeline has independent ground truth for what the trainee
actually said — only the ASR's own output text. So (a) and (b) cannot be
told apart with certainty from text alone. What CAN be used, from the ASR
engine itself, without inventing anything:

  1. faster-whisper's own per-word probability (courtsim/trainee_capture/
     server.py sets word_timestamps=True specifically so this is available).
     A word the recognizer itself is unsure about is more likely to be
     WRONG in the sense a recognizer error is wrong, independent of what
     the source transcript says.
  2. Whether the recognizer's wrong word SOUNDS LIKE the source word. A
     trainee who correctly says "there" and gets misheard as "their" (or
     "affect"/"effect", "council"/"counsel") produces an ASR error that is
     phonetically close to the truth — that closeness is itself evidence of
     a mishearing rather than the trainee saying something unrelated.

DECISION RULE — stated, deterministic (required for 1.8's "same take scored
twice gives identical numbers")
------------------------------------------------------------------------------
For a mismatched word pair (source_word, asr_word) at an aligned position,
with the recognizer's own confidence `p` for asr_word (0.0-1.0, from
faster-whisper's word.probability):

    is_recognizer_error =
        (p < LOW_CONFIDENCE_THRESHOLD)
        OR (phonetic_similarity(source_word, asr_word) >= PHONETIC_MATCH_THRESHOLD)

Both thresholds are named constants below, not magic numbers buried in a
formula, and both are DELIBERATELY CONSERVATIVE (biased toward calling
something a recognizer error rather than a trainee error) because scoring a
trainee for a recognizer's mistake is the worse failure mode of the two —
consistent with G3, refuse/don't-blame over guess/blame.

Confidence data absence: if the ASR adapter did not supply word-level
probability for a given word (e.g. an older recording, or a decode where
words came back empty), `p` is unavailable and the rule falls back to the
phonetic-similarity check alone; if that ALSO cannot run (source_word or
asr_word is empty — a pure deletion/insertion, not a substitution), the
error is attributed to the TRAINEE by default rather than silently excused,
because "the recognizer could not tell" is not evidence the recognizer was
at fault — see ``AttributedError.confidence_basis`` for exactly which
signal(s) were available for each decision.

PHONETIC SIMILARITY — a from-scratch Soundex, not a new dependency
--------------------------------------------------------------------
No phonetic-comparison library (jellyfish, metaphone, ...) is installed on
this machine and none was added — G10 restricts installs to what D10
explicitly authorized (Audio2Face and TTS engines), and a general phonetic
library is neither. Soundex is a public, ~100-year-old, well-documented
algorithm implementable in about 20 lines with no dependency; it is coarser
than Metaphone but sufficient for "do these two short words sound alike",
which is all this rule needs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

# ---------------------------------------------------------------------------
# Stated, named thresholds — not buried in the formula.
# ---------------------------------------------------------------------------

#: Below this recognizer confidence, a mismatch is attributed to the
#: recognizer even with no phonetic evidence. 0.55 is a conservative
#: starting point (faster-whisper word probabilities for genuinely correct,
#: clearly-spoken words are usually well above 0.8 in informal testing this
#: session) — NOT independently calibrated against a labelled corpus of real
#: trainee takes, because no such corpus exists yet. Flagged as a REMAINDER
#: in REPORT.md: this constant should be recalibrated once real trainee
#: sessions exist to compare against.
LOW_CONFIDENCE_THRESHOLD = 0.55

#: Soundex-code equality (1.0) or a one-character Soundex difference (0.75)
#: both count as "sounds alike enough that a mishearing is plausible".
PHONETIC_MATCH_THRESHOLD = 0.75


class ErrorSource(str, Enum):
    TRAINEE = "TRAINEE"
    RECOGNIZER = "RECOGNIZER"


@dataclass(frozen=True)
class AttributedError:
    kind: str                  # "sub" | "missed" | "extra" — from compare.py's Difference.kind
    source_word: str
    asr_word: str
    source: ErrorSource
    confidence_basis: str      # which signal(s) drove the decision, human-readable
    asr_word_probability: float | None
    phonetic_similarity_score: float


# ---------------------------------------------------------------------------
# Soundex — from scratch, no dependency.
# ---------------------------------------------------------------------------

_SOUNDEX_CODES = {
    **{c: "1" for c in "BFPV"},
    **{c: "2" for c in "CGJKQSXZ"},
    **{c: "3" for c in "DT"},
    **{c: "4" for c in "L"},
    **{c: "5" for c in "MN"},
    **{c: "6" for c in "R"},
}


def soundex(word: str) -> str:
    """Classic 4-character Soundex code (e.g. "there"/"their" -> both "T600").

    Standard algorithm: keep the first letter; map every later letter to its
    code digit (vowels and H/W/Y produce no digit); collapse a run of
    CONSECUTIVE identical digits to one; pad/truncate to 4 characters. This
    is the common simplified form (it does not special-case an H/W
    separator between two same-coded letters as "still adjacent" the way
    the original 1918 patent's exact rule does) — adequate for "do these two
    short words sound alike", which is all this rule needs."""
    letters = re.sub(r"[^A-Za-z]", "", word).upper()
    if not letters:
        return "0000"
    first = letters[0]
    collapsed: list[str] = []
    prev_code = _SOUNDEX_CODES.get(first, "")
    for ch in letters[1:]:
        code = _SOUNDEX_CODES.get(ch, "")
        if code and code != prev_code:
            collapsed.append(code)
        prev_code = code
    return (first + "".join(collapsed) + "000")[:4]


def phonetic_similarity(word_a: str, word_b: str) -> float:
    """1.0 if Soundex codes match exactly; 0.75 if they differ in exactly one
    of the three digit positions (a near-miss, e.g. a code ending differs);
    0.0 otherwise. Empty input on either side returns 0.0 — no similarity
    claim is made about a deletion/insertion pair."""
    a, b = word_a.strip(), word_b.strip()
    if not a or not b:
        return 0.0
    sa, sb = soundex(a), soundex(b)
    if sa == sb:
        return 1.0
    if sa[0] != sb[0]:
        return 0.0
    digit_matches = sum(1 for x, y in zip(sa[1:], sb[1:]) if x == y)
    return 0.75 if digit_matches >= 2 else 0.0


def attribute_error(
    kind: str,
    source_word: str,
    asr_word: str,
    asr_word_probability: float | None,
) -> AttributedError:
    """The stated, deterministic rule described in the module docstring."""
    sim = phonetic_similarity(source_word, asr_word)
    if asr_word_probability is not None and asr_word_probability < LOW_CONFIDENCE_THRESHOLD:
        return AttributedError(
            kind=kind, source_word=source_word, asr_word=asr_word,
            source=ErrorSource.RECOGNIZER,
            confidence_basis=f"recognizer word probability {asr_word_probability:.2f} "
                              f"< threshold {LOW_CONFIDENCE_THRESHOLD}",
            asr_word_probability=asr_word_probability, phonetic_similarity_score=sim,
        )
    if sim >= PHONETIC_MATCH_THRESHOLD:
        return AttributedError(
            kind=kind, source_word=source_word, asr_word=asr_word,
            source=ErrorSource.RECOGNIZER,
            confidence_basis=f"phonetic similarity {sim:.2f} >= threshold "
                              f"{PHONETIC_MATCH_THRESHOLD} (Soundex {soundex(source_word)} vs "
                              f"{soundex(asr_word)}) — plausible mishearing",
            asr_word_probability=asr_word_probability, phonetic_similarity_score=sim,
        )
    basis = (
        "no recognizer-confidence or phonetic evidence for a mishearing "
        "(deletion/insertion or unrelated word) — attributed to trainee by "
        "default, not excused"
        if asr_word_probability is None
        else f"recognizer word probability {asr_word_probability:.2f} >= threshold and "
             f"phonetic similarity {sim:.2f} < threshold — no evidence of mishearing"
    )
    return AttributedError(
        kind=kind, source_word=source_word, asr_word=asr_word,
        source=ErrorSource.TRAINEE, confidence_basis=basis,
        asr_word_probability=asr_word_probability, phonetic_similarity_score=sim,
    )
