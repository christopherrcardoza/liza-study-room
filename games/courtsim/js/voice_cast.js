// WEB-REBUILD-001 -- role inference and voice casting.
//
// roleForLabel() is a faithful, line-for-line port of
// courtsim/bridge/server.py's own _role_for_label() (the desktop build's
// already-reviewed rule set for these exact built-in proceedings' speaker
// labels) -- deterministic label-prefix matching, never inferred from
// prose content. Kept as a small, directly-comparable port rather than
// routed through Pyodide, since it's ~15 lines with no numpy/stdlib
// dependency worth the extra Pyodide round-trip.
//
// assignVoices() is a NEW design for the web build, not a port of
// courtsim/presentation/voice_cast.py -- that module's whole point was
// squeezing distinct IDENTITIES out of only 2 measured SAPI voices via
// pitch-shift/rate-bias/pan DSP (see reports/FULL_BUILD_002.md). The web
// build has 28 real, acoustically distinct kokoro voices (measured,
// reports/WEB_RESEARCH_001.md) and needs none of that DSP -- every role
// family below gets its own real voice(s), cycling only when a
// proceeding has more named counsel than the family has profiles for,
// exactly the same "cycle, stated in code" discipline the original used.

export const Role = {
  COURT: 'COURT', WITNESS: 'WITNESS', COUNSEL_Q: 'COUNSEL_Q',
  COUNSEL_A: 'COUNSEL_A', COUNSEL_NAMED: 'COUNSEL_NAMED', BAILIFF: 'BAILIFF',
  CLERK: 'CLERK', INTERPRETER: 'INTERPRETER', REPORTER: 'REPORTER', UNKNOWN: 'UNKNOWN',
};

export function roleForLabel(label) {
  const u = label.toUpperCase().trim();
  if (u.startsWith('THE COURT')) return Role.COURT;
  if (u.startsWith('THE WITNESS')) return Role.WITNESS;
  if (u.startsWith('THE CLERK')) return Role.CLERK;
  if (u.startsWith('THE BAILIFF')) return Role.BAILIFF;
  if (u.startsWith('THE INTERPRETER')) return Role.INTERPRETER;
  if (u.startsWith('THE REPORTER')) return Role.REPORTER;
  if (u.startsWith('MR.') || u.startsWith('MS.') || u.startsWith('MRS.') || u.startsWith('DR.')) {
    return Role.COUNSEL_NAMED;
  }
  return Role.UNKNOWN;
}

// speed: a per-role RATE BIAS (mirrors the desktop build's own
// profile.wpm_bias in courtsim/presentation/voice_cast.py), not an
// absolute kokoro speed value -- SPEED-VOLUME-001 multiplies this by the
// player's own chosen WPM (tts.js's wpmToSpeed()) so the global slider
// sets the overall pace while these small per-role variations are
// preserved on top of it, same two-layer model the desktop build uses.
const FAMILIES = {
  [Role.COURT]: [{ voice: 'am_onyx', speed: 0.95 }],
  [Role.WITNESS]: [
    { voice: 'bf_emma', speed: 1.0 },
    { voice: 'am_fenrir', speed: 1.02 },
  ],
  [Role.COUNSEL_Q]: [{ voice: 'am_michael', speed: 1.0 }],
  [Role.COUNSEL_A]: [{ voice: 'af_bella', speed: 1.0 }],
  [Role.COUNSEL_NAMED]: [
    { voice: 'am_liam', speed: 1.0 },
    { voice: 'af_nova', speed: 1.0 },
    { voice: 'bm_george', speed: 0.98 },
    { voice: 'bf_isabella', speed: 1.02 },
  ],
  [Role.BAILIFF]: [{ voice: 'am_adam', speed: 0.97 }],
  [Role.CLERK]: [{ voice: 'af_sarah', speed: 1.0 }],
  [Role.INTERPRETER]: [{ voice: 'bf_alice', speed: 1.0 }],
  [Role.REPORTER]: [{ voice: 'am_echo', speed: 1.0 }],
  [Role.UNKNOWN]: [
    { voice: 'am_puck', speed: 1.0 },
    { voice: 'af_kore', speed: 1.0 },
    { voice: 'bm_lewis', speed: 1.0 },
    { voice: 'af_sky', speed: 1.0 },
  ],
};

// Deterministic: same speaker-label order always produces the same cast
// (first-appearance order within a role family decides which profile in
// that family a speaker gets), matching the original module's own
// determinism discipline (1.8: "same take scored twice gives identical
// numbers" -- presentation casting isn't scored, but the same discipline
// is preserved so a session can be closed and reopened and sound the same).
export function assignVoices(speakerLabelsInOrder) {
  const cast = {};
  const familyNextIndex = {};
  const seen = new Set();
  for (const label of speakerLabelsInOrder) {
    if (seen.has(label)) continue;
    seen.add(label);
    const role = roleForLabel(label);
    const profiles = FAMILIES[role] || FAMILIES[Role.UNKNOWN];
    const i = familyNextIndex[role] || 0;
    cast[label] = { role, ...profiles[i % profiles.length] };
    familyNextIndex[role] = i + 1;
  }
  return cast;
}
