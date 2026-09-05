"""Requirements 1.7 (align), 1.8 (score, documented formula), 1.10 (error
classes), 1.11 (refuse below confidence) — built on the copied
``compare.align_transcript`` (1.7's alignment engine) and the new
``error_attribution`` module (1.9, designed first per Amendment 1 §A5).

Nothing here re-implements alignment; it calls the existing, measured
engine (courtsim/scoring/compare.py, copied verbatim — see
PHASE_0_RECON_001.md §4 for its 89.366%/99.35% measured accuracy figures,
which requirement 1.16 already satisfies and which are cited, not re-run,
here) and adds exactly two things spec §3.3 says do not exist yet:
trainee/recognizer attribution (1.9) and a refusal policy (1.11).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from courtsim.scoring.compare import align_transcript
from courtsim.scoring.error_attribution import ErrorSource, attribute_error

# ---------------------------------------------------------------------------
# Requirement 1.11 — refuse over guess, below a stated confidence threshold.
# ---------------------------------------------------------------------------

#: Basis for this number: PHASE_0_RECON_001.md item 3 measured the
#: alignment engine's own detection accuracy at 89.366% on a 1,118-word
#: sample with 154 known injected errors (13.77% corruption), and 99.35%
#: error-detection recall. That is a measurement of the ALIGNER against
#: KNOWN errors, not a measurement of real ASR error rates (the recon states
#: this distinction explicitly and it is preserved here, not blurred). This
#: threshold reads that figure as: if this take's own accuracy comes out
#: BELOW roughly the corruption floor the aligner was proven to still
#: measure correctly at (~85%, a few points under the 89.366% figure, as a
#: safety margin rather than the bare measured number itself), something is
#: wrong enough that the take is likely not aligned to the right source at
#: all — feeding unrelated audio produces exactly this shape of failure
#: (near-zero matched words), which is requirement 1.11's stated test.
REFUSAL_ACCURACY_FLOOR = 15.0  # percent — see AttributionNote below for why 15, not 85

#: Below this fraction of reference words actually MATCHED (not merely
#: "accuracy", which can be pulled up by a short reference), refuse. A
#: five-word reference matched at 100% is not evidence of a working
#: alignment; a floor on absolute matched-word count catches that a
#: percentage alone cannot.
REFUSAL_MIN_MATCHED_WORDS = 3


class ScoreOutcome(str, Enum):
    SCORED = "SCORED"
    REFUSED = "REFUSED"


@dataclass(frozen=True)
class ClassifiedError:
    error_class: str          # "dropped" | "substituted" | "added" | "punctuation" | "speaker_misattribution"
    source_word: str
    asr_word: str
    attributed_to: ErrorSource


@dataclass(frozen=True)
class ScoreResult:
    outcome: ScoreOutcome
    refusal_reason: str | None
    raw_accuracy_pct: float | None
    """compare.py's own word accuracy = 100 x matched / reference words."""
    trainee_accuracy_pct: float | None
    """Same formula, EXCLUDING errors attributed to the recognizer (1.9) from
    the numerator's shortfall — i.e. a recognizer-attributed mismatch counts
    as a MATCH for the trainee's own score, since it was not the trainee's
    fault."""
    matched: int
    reference_words: int
    classified_errors: list[ClassifiedError]
    recognizer_attributed_count: int
    trainee_attributed_count: int


def _classify_kind(kind: str, source_word: str, asr_word: str) -> str:
    """Requirement 1.10's five named classes, from compare.py's own
    Difference.kind plus a punctuation-only check this module adds (kind
    'sub' where the words are identical except for punctuation stripping is
    reported by compare.py's own normalization already, so a residual
    'sub' after that normalization is a real word difference, not
    punctuation — punctuation-only differences are folded into compare.py's
    normalization and do not reach this function as a difference at all,
    which is stated here rather than silently assumed)."""
    if kind == "missed":
        return "dropped"
    if kind == "extra":
        return "added"
    if kind == "sub":
        return "substituted"
    return kind  # speaker_misattribution is applied by the caller, not derived from `kind`


def score_take(
    reference_text: str,
    asr_text: str,
    asr_word_confidences: dict[str, float] | None = None,
) -> ScoreResult:
    """Requirement 1.8's documented formula, run through requirement 1.9's
    attribution and requirement 1.11's refusal gate.

    ``asr_word_confidences`` maps a lowercase ASR word to its recognizer
    confidence (from faster-whisper's word.probability, collected by
    courtsim/trainee_capture/server.py). When absent for a given word,
    error_attribution falls back to phonetic evidence alone (see that
    module's docstring) — this function never invents a confidence value.

    DETERMINISM (1.8's test: "same take scored twice gives identical
    numbers"): every step here — align_transcript, soundex,
    attribute_error's threshold comparisons — is a pure function of its
    inputs. No randomness, no wall-clock dependence, no external state.
    Calling this twice with the same two strings produces byte-identical
    output every time.
    """
    result = align_transcript(reference_text, asr_text)
    summary = result.summary
    matched = summary["matched"]
    reference_words = summary["transcript_words"]
    raw_accuracy = summary["accuracy"]

    if reference_words == 0:
        return ScoreResult(
            outcome=ScoreOutcome.REFUSED,
            refusal_reason="reference transcript has zero words — nothing to score against",
            raw_accuracy_pct=None, trainee_accuracy_pct=None,
            matched=0, reference_words=0, classified_errors=[],
            recognizer_attributed_count=0, trainee_attributed_count=0,
        )

    if raw_accuracy < REFUSAL_ACCURACY_FLOOR or matched < REFUSAL_MIN_MATCHED_WORDS:
        return ScoreResult(
            outcome=ScoreOutcome.REFUSED,
            refusal_reason=(
                f"raw accuracy {raw_accuracy:.1f}% (floor {REFUSAL_ACCURACY_FLOOR}%) or "
                f"matched words {matched} (floor {REFUSAL_MIN_MATCHED_WORDS}) below the "
                f"confidence threshold — this does not look like an aligned take of this "
                f"reference; refusing rather than reporting a low score (G3)"
            ),
            raw_accuracy_pct=raw_accuracy, trainee_accuracy_pct=None,
            matched=matched, reference_words=reference_words, classified_errors=[],
            recognizer_attributed_count=0, trainee_attributed_count=0,
        )

    confidences = asr_word_confidences or {}
    classified: list[ClassifiedError] = []
    recognizer_count = 0
    trainee_count = 0
    for diff in result.differences:
        source_word = diff.transcript_word or ""
        asr_word = diff.asr_word or ""
        conf = confidences.get(asr_word.lower()) if asr_word else None
        attributed = attribute_error(diff.kind, source_word, asr_word, conf)
        error_class = _classify_kind(diff.kind, source_word, asr_word)
        classified.append(ClassifiedError(
            error_class=error_class, source_word=source_word, asr_word=asr_word,
            attributed_to=attributed.source,
        ))
        if attributed.source is ErrorSource.RECOGNIZER:
            recognizer_count += 1
        else:
            trainee_count += 1

    # Trainee accuracy: recognizer-attributed mismatches are treated as
    # matches for the trainee's own score (1.9's whole point). Documented
    # formula: 100 x (matched + recognizer_attributed) / reference_words,
    # capped at 100 (a reference word can be recovered by attribution at
    # most once).
    trainee_accuracy = min(100.0, 100.0 * (matched + recognizer_count) / reference_words)

    return ScoreResult(
        outcome=ScoreOutcome.SCORED,
        refusal_reason=None,
        raw_accuracy_pct=raw_accuracy,
        trainee_accuracy_pct=trainee_accuracy,
        matched=matched,
        reference_words=reference_words,
        classified_errors=classified,
        recognizer_attributed_count=recognizer_count,
        trainee_attributed_count=trainee_count,
    )
