"""The ingest contract every adapter emits or refuses against (spec 002 §4.3).

Shapes are copied verbatim from
``CourtNey-Core/reports/courtsim/adapters/zoom_adapter.py`` (Role, SourceSpan,
Utterance) rather than redefined, so every adapter in this tree — the Zoom
adapter itself and the Eclipse wrapper written for this job — emits the exact
same structure. One contract, enforced by one set of dataclasses, not by
convention.

Requirement 1.15 (utterance counts in and out of every stage, reported, not
silent) lives here too: ``StageCount`` and ``PipelineCounts`` are the shared
bookkeeping type every subsystem in this package appends to, so a dropped
utterance anywhere in INGEST → SCENE_COMPILER-equivalent → PRESENTATION →
SCORING is visible in one place rather than re-invented per stage.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Role(str, Enum):
    COURT = "COURT"
    WITNESS = "WITNESS"
    COUNSEL_Q = "COUNSEL_Q"
    COUNSEL_A = "COUNSEL_A"
    COUNSEL_NAMED = "COUNSEL_NAMED"
    BAILIFF = "BAILIFF"
    CLERK = "CLERK"
    INTERPRETER = "INTERPRETER"
    REPORTER = "REPORTER"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class SourceSpan:
    page: Optional[int]
    line_start: int
    line_end: int


@dataclass(frozen=True)
class Utterance:
    index: int
    speaker_label: str
    role: Role
    text: str
    source_span: SourceSpan
    on_record: bool
    parenthetical: bool


class AdapterRefusal(ValueError):
    """Raised with a specific, non-guessing reason (G3). An adapter that
    raises this has emitted NOTHING — never a partial transcript."""


@dataclass
class ParseResult:
    utterances: list[Utterance]
    candidate_blocks_in: int
    utterances_out: int
    source_path: str
    adapter: str
    misattributed: list[dict] = field(default_factory=list)
    """Utterances whose role could not be attributed with confidence — listed,
    not hidden (requirement 1.1's test: 'misattributions listed, not hidden').
    Each entry: {"index": int, "speaker_label": str, "reason": str}."""


# ---------------------------------------------------------------------------
# Requirement 1.15 — utterance counts in and out of every pipeline stage
# ---------------------------------------------------------------------------


@dataclass
class StageCount:
    stage: str
    count_in: int
    count_out: int
    dropped: int = field(init=False)
    note: str = ""

    def __post_init__(self) -> None:
        self.dropped = self.count_in - self.count_out

    def to_dict(self) -> dict:
        return {
            "stage": self.stage,
            "count_in": self.count_in,
            "count_out": self.count_out,
            "dropped": self.dropped,
            "note": self.note,
        }


@dataclass
class PipelineCounts:
    """Accumulates one StageCount per pipeline stage a session passes
    through. A presence assertion on the final output cannot detect an
    omission upstream (spec §13 rule 8) — this makes every stage's own
    in/out count part of the record, not just the last one."""

    stages: list[StageCount] = field(default_factory=list)

    def record(self, stage: str, count_in: int, count_out: int, note: str = "") -> StageCount:
        sc = StageCount(stage=stage, count_in=count_in, count_out=count_out, note=note)
        self.stages.append(sc)
        return sc

    def any_silent_drop(self) -> bool:
        """True if any stage dropped an utterance without a note explaining
        why. A note-less drop means something disappeared and nothing said
        so — exactly what requirement 1.15 exists to catch."""
        return any(sc.dropped != 0 and not sc.note for sc in self.stages)

    def report(self) -> str:
        lines = [f"{'stage':<20} {'in':>6} {'out':>6} {'dropped':>8}  note"]
        for sc in self.stages:
            lines.append(
                f"{sc.stage:<20} {sc.count_in:>6} {sc.count_out:>6} {sc.dropped:>8}  {sc.note}"
            )
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {"stages": [sc.to_dict() for sc in self.stages], "any_silent_drop": self.any_silent_drop()}
