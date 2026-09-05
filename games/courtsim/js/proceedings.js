// WEB-REBUILD-001 -- the three authored proceedings that already ship
// with the local build, reused unchanged (courtsim/content/proceedings/
// *.txt, copied byte-for-byte into web/content/proceedings/). Bundled with
// the page at build time; never uploaded, never typed by the player (D11:
// transcript upload is simply not a feature this tree implements at all --
// absent by construction, not hidden behind a flag the way the Godot
// export's exclude_filter had to arrange for a shared codebase).

export const PROCEEDING_IDS = [
  'case_01_contract_dispute',
  'case_02_traffic_hearing',
  'case_03_small_claims',
];

export async function loadProceedings(engine) {
  const out = [];
  for (const id of PROCEEDING_IDS) {
    const resp = await fetch(`./content/proceedings/${id}.txt`);
    if (!resp.ok) throw new Error(`failed to fetch proceeding ${id}: HTTP ${resp.status}`);
    const rawText = await resp.text();
    const parsed = engine.parseProceeding(id, rawText);
    const speakers = new Set(parsed.utterances.map((u) => u.speaker));
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
