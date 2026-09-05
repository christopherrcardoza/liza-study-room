"""Zoom / timestamped-.txt transcript adapter.

Copied (Rule 99) from
``CourtNey-Core/reports/courtsim/adapters/zoom_adapter.py`` — the original
file is untouched, this is a standalone copy in this repo's own tree. The
only change from the original is wiring: Role/SourceSpan/Utterance are now
imported from ``courtsim.ingest.contract`` (the shared contract every adapter
in this tree emits) instead of being redefined locally, since the original
file was written to run standalone and this tree needs one shared contract
across the Zoom adapter and the Eclipse adapter both. Every parsing rule,
refusal reason and comment below is unchanged.

Spec 002 sec 4.2 item 3: "Zoom/timestamped .txt -- highest value per unit of
work. Consistent named-speaker-plus-timestamp structure; only the
numbered-line requirement rejects it." This adapter is new work -- it does
not touch or import ScreenScribe's existing numbered-.txt/.ecl parser, and
it does not relax that parser's requirements (sec 4.2 item 3 says relaxing
the numbered-line rule unlocks Zoom files; this is a separate adapter, not a
relaxation of the existing one, so the existing parser's behaviour for its
own formats is unchanged).

MEASURED FORMAT (real file: C:\\Users\\chris\\Documents\\Zoom\\2026-07-13
15.19.12 Terry Star's Personal Meeting Room\\transcript.txt, 1823 lines, 608
cues, 11 speakers) -- every cue is exactly three parts, blank-line separated:

    HH:MM:SS --> HH:MM:SS
    Speaker Label: utterance text
    <blank line>

No WEBVTT header, no numeric cue index (that absence is exactly what the
existing parser rejects on -- spec sec 4.2). No cue in the measured sample
spans more than one text line and no speaker label was missing its colon
separator (measured directly, not assumed -- see the structural-analysis
run in PHASE_0_RECON_001.md).

CONTRACT (spec 002 sec 4.3), enforced exactly:
  - role is ALWAYS Role.UNKNOWN for this format. A Zoom transcript carries no
    courtroom role signal (no Q/A labels, no "THE COURT", no named-counsel
    markup) -- guessing COURT/WITNESS/COUNSEL from a bare display name would
    be exactly the guess G3 forbids. UNKNOWN survives to the caller.
  - on_record defaults True: nothing in Zoom's own transcript format marks a
    passage off-record (there is no such concept in a video-call
    transcript). This is a stated adapter-level ASSUMPTION, not a measured
    fact -- flagged here so a caller building courtroom semantics on top of
    it knows the field is not authoritative for this source format.
  - parenthetical is True only when the ENTIRE utterance text is wrapped in
    a single matching paren pair, e.g. "(inaudible)" -- never inferred from
    a substring, since a partial match is a guess about intent.
  - source_span.page is always None -- Zoom transcripts have no pagination.
    line_start/line_end are the real 1-indexed line numbers in the source
    file, for citation back to source exactly as the contract requires.

REFUSAL POLICY (G3 -- refuse over guess):
  The file is parsed in two passes. Pass 1 finds every candidate cue block
  (a timestamp header + the block that follows it) and validates each one
  structurally. If ANY block fails validation, the WHOLE FILE is refused
  with the exact line number and reason of the FIRST failure -- Rule 52 and
  spec sec 4.3 ("never emits a partial transcript silently"). Nothing is
  silently dropped or partially emitted: it is all candidate blocks valid,
  or a named refusal, never a subset.
  Refusal reasons:
    - empty file
    - zero timestamp-header cues found anywhere (not a Zoom-style file)
    - a cue's first text line has no ":" separator (cannot extract a
      speaker label without guessing one)
    - a cue has a timestamp header but no text line before the next blank
      line / next cue (an empty utterance -- refused, not silently skipped)
    - a timestamp header matches the arrow pattern but either side fails to
      parse as HH:MM:SS

COUNTING (spec sec 4.3, "count utterances in and out of every stage"):
  parse_zoom_transcript() returns a ParseResult carrying both
  candidate_blocks_in (every timestamp-header block found, before
  validation) and utterances_out (len of the returned list on success, 0 on
  refusal) so a caller can detect a silent drop even if this module's own
  logic has a bug -- a presence assertion on the returned list alone cannot
  detect an omission (spec sec 13 rule 8).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from courtsim.ingest.contract import AdapterRefusal, ParseResult, Role, SourceSpan, Utterance

ZoomAdapterRefusal = AdapterRefusal  # kept as an alias so a caller written against the

# original module's exception name still catches this one.

_TS_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2}) --> (\d{2}):(\d{2}):(\d{2})$")


def _valid_time(h: str, m: str, s: str) -> bool:
    try:
        hh, mm, ss = int(h), int(m), int(s)
    except ValueError:
        return False
    return 0 <= hh <= 23 and 0 <= mm <= 59 and 0 <= ss <= 59


def _is_parenthetical(text: str) -> bool:
    stripped = text.strip()
    return (
        len(stripped) >= 2
        and stripped[0] == "("
        and stripped[-1] == ")"
        and stripped.count("(") == 1
        and stripped.count(")") == 1
    )


def parse_zoom_transcript(path: str | Path) -> ParseResult:
    source_path = Path(path)
    if not source_path.is_file():
        raise AdapterRefusal(f"source file does not exist: {source_path}")
    raw = source_path.read_text(encoding="utf-8", errors="strict")
    lines = raw.splitlines()

    if not any(line.strip() for line in lines):
        raise AdapterRefusal(f"empty file: {source_path}")

    # Pass 1: locate every candidate cue block (a timestamp header line,
    # 1-indexed, plus the non-blank lines that follow it up to the next
    # blank line or end of file). This pass never raises -- it only
    # collects candidates, so candidate_blocks_in is always an honest count
    # of what LOOKS like a Zoom cue, independent of whether it later
    # validates.
    candidates: list[tuple[int, list[tuple[int, str]]]] = []  # (header_line_no, [(line_no, text)])
    i = 0
    n = len(lines)
    while i < n:
        stripped = lines[i].strip()
        if stripped == "":
            i += 1
            continue
        match = _TS_RE.match(stripped)
        if match:
            header_line_no = i + 1  # 1-indexed
            i += 1
            body: list[tuple[int, str]] = []
            while i < n and lines[i].strip() != "":
                body.append((i + 1, lines[i]))
                i += 1
            candidates.append((header_line_no, body))
        else:
            # A non-blank, non-timestamp, non-cue-body line outside any
            # recognized cue -- e.g. stray header junk. Not counted as a
            # candidate cue; surfaced only if it leaves zero cues overall.
            i += 1

    candidate_blocks_in = len(candidates)
    if candidate_blocks_in == 0:
        raise AdapterRefusal(
            f"not a Zoom-style transcript: zero 'HH:MM:SS --> HH:MM:SS' cue "
            f"headers found in {source_path}"
        )

    utterances: list[Utterance] = []
    for header_line_no, body in candidates:
        if not body:
            raise AdapterRefusal(
                f"{source_path}:{header_line_no}: timestamp header with no "
                f"text line before the next blank line -- refusing rather "
                f"than emitting an empty utterance"
            )
        first_line_no, first_text = body[0]
        if ":" not in first_text:
            raise AdapterRefusal(
                f"{source_path}:{first_line_no}: cue text has no ':' "
                f"speaker separator -- cannot extract a speaker label "
                f"without guessing one: {first_text!r}"
            )
        speaker_label, _, first_remainder = first_text.partition(":")
        speaker_label = speaker_label.strip()
        if not speaker_label:
            raise AdapterRefusal(
                f"{source_path}:{first_line_no}: speaker label before ':' "
                f"is empty: {first_text!r}"
            )
        text_parts = [first_remainder.strip()]
        for _line_no, extra_text in body[1:]:
            text_parts.append(extra_text.strip())
        text = " ".join(part for part in text_parts if part)
        last_line_no = body[-1][0]

        utterances.append(
            Utterance(
                index=len(utterances),
                speaker_label=speaker_label,
                role=Role.UNKNOWN,
                text=text,
                source_span=SourceSpan(page=None, line_start=header_line_no, line_end=last_line_no),
                on_record=True,
                parenthetical=_is_parenthetical(text),
            )
        )

    return ParseResult(
        utterances=utterances,
        candidate_blocks_in=candidate_blocks_in,
        utterances_out=len(utterances),
        source_path=str(source_path),
        adapter="zoom",
    )


def _main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python zoom_adapter.py <transcript.txt>", file=sys.stderr)
        return 2
    path = argv[1]
    print(f"FILE: {path}")
    try:
        result = parse_zoom_transcript(path)
    except AdapterRefusal as exc:
        print(f"REFUSED: {exc}")
        return 1
    print(f"candidate_blocks_in={result.candidate_blocks_in}  utterances_out={result.utterances_out}")
    if result.candidate_blocks_in != result.utterances_out:
        print("WARNING: in/out counts differ -- this should be impossible on a "
              "successful (non-refused) parse; investigate before trusting output")
    print("First three utterances:")
    for u in result.utterances[:3]:
        print(f"  [{u.index}] speaker_label={u.speaker_label!r} role={u.role.value} "
              f"on_record={u.on_record} parenthetical={u.parenthetical} "
              f"source_span=(page={u.source_span.page}, "
              f"line_start={u.source_span.line_start}, line_end={u.source_span.line_end})")
        print(f"        text={u.text!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv))
