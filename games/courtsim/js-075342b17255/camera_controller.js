// CAMERA-AND-STAGING-001 Step 2 -- Rule 111 as amended (2026-08-18): where a
// choice is a position on a range (camera distance, angle) rather than a
// fork between designs, build the range. This module owns every way the
// founder can look at the room: discrete named presets (a click, not a menu
// dive), a click-a-point zoom tool with satellite-map-style stepped
// dolly-in/out, a plain +/- zoom, bounded free-drag movement, and a reset
// that always returns to the reporter's seat. State persists across
// sessions (Rule 129 -- legible current state, not a silent default).
import * as THREE from 'three';
import { solveVFovDegrees } from './contain.js';
// COURTSIM-LOOK-049 -- the stationary look mode ("the camera is a head, not a
// crane"). It lives in its own module because it is an INPUT device -- it
// reads a pointer and a webcam and turns them into two angles -- while this
// file is the camera's policy: presets, framing, the CONTAIN solve and the
// locked lens. That module never writes camera.fov, camera.position or a
// guarantee; every write it makes comes back through applyStationaryLook()
// below, which is the single audited seam between the two.
import { StationaryLookInput } from './camera_input.js';

const STORAGE_KEY = 'courtsim_camera_state';

// =========================================================================
// COURTSIM-WIRE-025 -- THE VERSION STAMP ON THE PERSISTED CAMERA STATE.
//
// Bumped ONLY when a stored preference's MEANING changes -- not when a field
// is added. Version 2 is "follow-speaker is a real default, and an OFF in
// this blob is therefore an informed choice rather than the absence of a
// feature". See _loadControls() for the migration rule, which is the whole
// reason this constant exists, and setAutoFollow() for where it is written.
//
// Note for whoever bumps this next: bumping it re-migrates every stored OFF.
// Do not bump it to carry an unrelated schema change; add a separate key.
// =========================================================================
const FOLLOW_STATE_VERSION = 2;

// VIEWPORT-CONTAIN-001 Step 2/3 -- REPLACES the old static-fov-per-preset
// design (WIDE_FOV=50/CLOSE_FOV=30, tuned by eye at ONE aspect ratio,
// 622x389 -- see git history) with CONTAIN, solved fresh from a declared
// world-space guarantee volume G every time the aspect changes (setAspect()
// below). A static fov is itself a fit policy frozen at whatever aspect it
// was tuned at -- exactly the research doc's "accidental Hor+" failure mode,
// which amputates the SIDES on anything narrower than that one aspect (a
// portrait window silently loses a counsel table). CONTAIN's failure
// direction is revealing more room, never cropping a required subject.
//
// Rx/Ry below are the UN-padded half-extents of G (world units); the
// protection-margin CONTROL (Step 4, PROTECTION_FACTOR_DEFAULT / persisted
// state below) is applied at SOLVE time, not baked in, so it stays a real,
// adjustable Rule 129 control rather than a hardcoded constant. D is the
// fit-plane distance -- for the six-seat presets it's fixed (that preset's
// own camera never moves independently of a preset switch); for the close/
// speaker single-subject presets it is the CAMERA-DISTANCE control's actual
// live pos/target distance, computed in _applyPosTarget()/_applyScaledClose()
// below, so dollying the close-up in/out re-solves the correct fov for the
// new range rather than leaving a stale one.
//
// Measured, not guessed: real courtroom_a Bip01_Head bone world positions
// sampled directly off THIS web build (Claude_Browser + window.__courtsimTest,
// state.scene.seatGroups[key].model.getObjectByName('Bip01_Head')) for the
// six REQUIRED speaking seats (bench, witness stand, both counsel tables,
// clerk, bailiff -- jurors/gallery excluded, "MAY be partial" per the
// brief), solved against each preset's own real camera pos/target, then
// cross-checked point-by-point at 21:9/16:9/4:3/portrait -- all four passed
// with a positive margin. See reports/VIEWPORT_CONTAIN_001.md Step 3 for the
// full table. MEASURED BUG, caught and fixed before shipping: an EARLIER
// pass at these two constants used Godot's own head-bone measurements
// (scratch/viewport_contain_001/guarantee_vol/guarantee_vol.json) against
// THIS file's web camera pos/target -- the two builds place the same six
// named seats at completely different world coordinates (e.g. THE COURT is
// at z=+4.34 in Godot's courtroom_a but z=-3.49 here), so that combination
// was internally inconsistent. Re-measured from this build directly before
// use, per this repo's own "raw source over pre-digested copy" doctrine.
const SIX_SEAT_GUARANTEE = { D: 8.5151, Rx: 5.3291, Ry: 1.8950 };         // the OLD gallery 'reporter' camera; now the fallback only

// COURTSIM-FIX-R -- the first-person reporter seat's own guarantee volume.
//
// Derived, not guessed. The seat is at the ReporterChair (x -2.6 left venues
// / 3.05 right, y 1.20 seated eye, z -0.75) and looks into the well at
// (0.8, 1.45, -2.625) -- the midpoint of the witness box and the bench.
//   D = |pos - target| = hypot(3.4, 0.25, 1.875) = 3.89 m   (left venue)
// What must stay in frame from that chair: counsel at x -3.3 through the
// witness enclosure's outer face at x 2.33 -- a 5.63 m span, half-extent
// 2.82, taken to Rx 3.0 for margin. Vertically: the floor of the well up
// past a standing advocate's head, Ry 1.2.
// CONTAIN then solves, at 16:9:
//   Y = max(1.2/3.89, (3.0/3.89)/1.778) = max(0.3085, 0.4337) = 0.4337
//   vfov = 2*atan(0.4337) = 46.9 deg
// which is a natural seated field of view -- close to what a person actually
// takes in without turning their head, and the reason this reads as sitting
// there rather than as another staged shot.
// COURTSIM-FIX-R4 -- re-solved for the squared-up aim point. Rx 3.0 gave
// a 47-75 degree (v-h) field, wide enough to bow the edges of a room this
// close -- part of what the founder called "funky". 2.6 pulls it to a
// calmer field while still holding counsel through the witness box, which
// is what a seated person actually takes in without turning their head.
// =========================================================================
// COURTSIM-FIX-V, DEFECT V-5 -- RE-DERIVED FOR THE STATION'S NEW POSITION.
//
// scene.js moved the reporter to the foot of the bench (x -1.15, z -2.20),
// which is where both usable reference photographs on disk put a real court
// reporter -- see the derivation at the station's own build site. That
// changes every distance this guarantee was solved against, so it is
// re-solved rather than carried over.
//
//   eye      (-1.15, 1.20, -2.20)      seat pan 0.45 + 0.75 seated eye
//   aim      ( 0.00, 1.28,  1.50)      bisector of the two counsel tables
//   delta    ( 1.15, 0.08,  3.70)
//   D        sqrt(1.3225 + 0.0064 + 13.69) = 3.8754
//
// Rx is the half-width that must be held at D. The binding constraint is
// Counsel (named), the farther of the two, at +40.20 degrees off the aim:
//   its range        hypot(4.45, 3.70)   = 5.7867 m
//   body half-width  0.35 m  ->  atan(0.35 / 5.7867) = 3.46 deg
//   half-field needed                    = 40.20 + 3.46 = 43.66 deg
//   Rx = D * tan(43.66)  = 3.8754 * 0.9540 = 3.697  ->  3.70
//
// Ry 1.15 is UNCHANGED -- seated counsel heads sit around y 1.25-1.40 and
// the vertical extent this shot must hold has not moved.
//
// WHAT THIS COSTS, said plainly because it reverses a previous decision.
// The horizontal field becomes 2*atan(3.70/3.8754) = 87.3 degrees, where
// COURTSIM-FIX-R4 had deliberately narrowed this same shot to a "calmer"
// field after the founder said the wide version looked "funky". R4 was
// answering "it started me at this weird angle"; this is answering "it cuts
// out the counsel". BOTH ARE HIS REPORTS AND THEY CONFLICT. Only his field
// test settles it. To go back to R4's framing, change Rx here to 2.60 and
// nothing else -- the station position and aim are independently correct.
// =========================================================================
// =========================================================================
// COURTSIM-CAMERA-003 -- TWO MEASURED DEFECTS IN THE DERIVATION ABOVE.
// Recorded, NOT silently patched: the first belongs to scene.js, which is
// another lane's file this pass, and the second must not be "fixed" by
// quietly widening a lens the founder has twice said is too wide.
//
// (1) THE AIM IS NOT THE BISECTOR IT IS DOCUMENTED AS. scene.js's own
//     derivation says "THE AIM IS THE BISECTOR OF THE TWO COUNSEL TABLES,
//     +10.05 degrees", putting counsel at -40.21 and +40.21. The aim it
//     actually stores is _reporterStation.target = [0.0, 1.28, 1.5], and
//     from the eye at (-1.15, -2.20) that bears
//         atan2(1.15, 3.70) = +17.27 deg,
//     which is 7.22 deg off the bisector it claims. Re-measuring the two
//     counsel tables against the aim that SHIPS:
//         Counsel (Q)      -47.43 deg   (documented as -40.21)
//         Counsel (named)  +32.99 deg   (documented as +40.21)
//     They are not symmetric, and the near one is the far one. To implement
//     the documented bisector the target x would have to be about -0.494,
//     not 0.0 -- scene.js's call, reported rather than made here.
//
// (2) Rx 3.7000 IS UNDER-DERIVED AGAINST THAT SHIPPED AIM. The derivation
//     above takes Counsel (named) at +40.20 as the binding constraint. At
//     the real +17.27 aim the binding constraint is Counsel (Q) instead:
//         range hypot(2.15, 3.70) = 4.2794 m, body half 0.35 m
//         -> atan(0.35/4.2794) = 4.68 deg, half-field 47.43 + 4.68 = 52.10
//         -> Rx would need D*tan(52.10) = 3.8754 * 1.2833 = 4.973 m
//     So at Rx 3.700 Counsel (Q) is outside the frame by 7.03 deg AT 16:9
//     ON THE SHIPPED BUILD, before this job changed anything -- i.e. the
//     widening to 3.70 that COURTSIM-FIX-V made to answer "it cuts out the
//     counsel" did not actually put both counsel in frame. Verified across
//     all six speaking seats; the table is in
//     reports/COURTSIM_CAMERA_003.md.
//
// Rx is LEFT AT 3.7000 on purpose. Raising it to 4.973 would demand a 90+
// degree vertical lens at his aspect, which is the direction he has already
// rejected twice. The seat geometry cannot give both a calm lens and both
// counsel tables from this chair; that is a product decision and it is set
// out with numbers in the report rather than settled here.
// =========================================================================
const REPORTER_SEAT_GUARANTEE = { D: 3.8754, Rx: 3.7000, Ry: 1.1500 };
// SIX_SEAT_GUARANTEE_WIDE = { D: 12.1998, Rx: 5.6066, Ry: 1.9668 } was the
// 'wide' preset's box. DELETED, not merely unreferenced: it framed only 5%
// more room than SIX_SEAT_GUARANTEE, which is why "Wide Shot" did not look
// wide. Its measured D survives in ROOM_GUARANTEE below (the camera did not
// move; only what it must contain changed). Kept here as a comment so the
// numbers are not lost and so nobody restores it thinking it was dropped by
// accident -- see the PER-PRESET GUARANTEE VOLUMES block below.
// Single-subject close-ups (bench/witness/counselA/counselB/speaker): a
// fixed head+shoulder margin box (world units) around whatever point the
// camera is actually looking at. D is NOT stored here -- computed live from
// that preset's real pos/target distance (_applyPosTarget()/_distance()
// below), since 'speaker' picks a different subject (and therefore a
// different D) every utterance, and the CAMERA-DISTANCE control (Step 4)
// can move any of them.
// CLOSE_MARGIN = { Rx: 0.2800, Ry: 0.2000 } was the single box shared by
// bench/witness/counselA/counselB/speaker. DELETED for the reason set out
// immediately below: one box shared by five presets is five identical shots.
// Its 0.28/0.20 figures came from the +0.28m horizontal / 0.20m vertical
// head-margin used when the guarantee volumes were first measured, and they
// remain correct AS A HEAD MARGIN -- they were simply never a sensible
// framing for a whole preset.

// COURTSIM-FIX-C-WEB-VIEWPORT-UI Step 3 -- PER-PRESET GUARANTEE VOLUMES.
//
// THE FOUNDER'S REPORT: "even when you do toggle through the view options it
// doesn't really change the view that much anyways."
//
// DIAGNOSED, NOT GUESSED. CONTAIN solves the fov so that the framed rectangle
// at the fit plane EQUALS the guarantee box. Two presets that share a
// guarantee box therefore frame the same rectangle and show their subject at
// the same apparent size, however far apart their cameras are -- the solve
// cancels the distance out. Every preset above shared one of just two boxes,
// so there were only ever two distinct framings. Worked out exactly, at 16:9,
// with the shipped protection factor of 1.05 (world-space metres framed):
//
//   preset      D       vfov     framed HxW        <- BEFORE this change
//   reporter    8.515   40.53    6.29 x 11.19
//   wide       12.200   30.34    6.61 x 11.77      <- 5% from reporter
//   bench       2.508    9.57    0.42 x 0.75
//   witness     2.433    9.87    0.42 x 0.75       <- identical
//   counselA    2.377   10.10    0.42 x 0.75       <- identical
//   counselB    2.377   10.10    0.42 x 0.75       <- identical
//
// "Wide Shot" framed 5% more room than "Reporter" -- it is not a wide shot,
// it is the reporter's shot from higher up. And all four seat close-ups
// framed a byte-identical 0.42 x 0.75 m window: a 9.6-degree telephoto
// showing forehead-to-chin, four times over, on avatars that already
// resemble each other. That is the whole of "doesn't change much."
//
// THE FIX IS NOT IN THE FIT MATH. contain.js is untouched and the CONTAIN
// policy is unchanged -- it was doing exactly what it was told. What was
// wrong is WHAT IT WAS TOLD TO GUARANTEE. Each preset now declares the volume
// that preset actually means, derived from this build's own room geometry
// (scene.js: floor 16x16 at origin, back wall z=-6, jury box x 4.25..5.25 with
// its back panel at x=5.81, bench platform 0.49, witness platform 0.6, seat
// pan +0.45, seated head ~+0.75 above that). Resulting framings, same
// conditions as the table above:
//
//   speaker     ~2.4    22.0     0.95 x 1.68   head and shoulders (tightest)
//   witness      2.433  33.6     1.47 x 2.62   witness in the box
//   bench        2.508  37.0     1.68 x 2.99   judge + the bench
//   counselA/B   2.377  43.4     1.89 x 3.36   counsel + the table
//   reporter     8.515  40.5     6.29 x 11.19  UNCHANGED (the validated default)
//   wide        12.200  41.5     9.24 x 16.43  the whole room, jury box included
//
// Framed height is strictly increasing down that list, and stays strictly
// increasing at 5:2, at 9:16 portrait and at a 6.2:1 slit -- checked against
// these exact shipped constants, not against the numbers this comment was
// first drafted with.
//
// Six visibly different shots, monotonically ordered, and the guarantee
// property is preserved at every one: CONTAIN still cannot crop what the box
// declares, and its failure direction is still revealing more room. Reporter
// is deliberately left EXACTLY as measured -- it is the default working shot
// and the one VIEWPORT_CONTAIN_001.md's six-seat NDC proof was run against,
// so its numbers stay proven rather than re-derived.
const BENCH_GUARANTEE    = { Rx: 1.2500, Ry: 0.8000 };  // judge + bench front
const WITNESS_GUARANTEE  = { Rx: 1.0500, Ry: 0.7000 };  // witness + box rail
const COUNSEL_GUARANTEE  = { Rx: 1.4500, Ry: 0.9000 };  // counsel + table
const SPEAKER_GUARANTEE  = { Rx: 0.7000, Ry: 0.4500 };  // whoever is talking, tight
// Whole-room establishing shot. Rx 7.6 comfortably clears the jury box's back
// panel (x=5.81) and the clerk/bailiff at x=-5.5/+5.2; Ry 4.4 covers floor to
// well above a standing bailiff's head, so the room reads as a room.
//
// Rx is 7.6 and not the 8.6 that a literal half-floor-width would suggest,
// and the reason is a CHECKED CONSEQUENCE, not a rounding: in a PORTRAIT
// window the Rx branch of CONTAIN dominates (Y = (Rx/D)/a, and a is small),
// so Rx alone sets the fov there. At Rx 8.6 the portrait solve came out at
// 105.5 deg, past the point where perspective distortion becomes
// objectionable; 7.6 lands it at 98.6 deg. The cost in landscape is real but
// small and was accepted deliberately: at 16:9, Rx 8.6 would have put the Rx
// branch marginally ahead (Y = 0.4164 vs Ry's 0.3787), so dropping to 7.6
// hands the solve to the Ry branch and gives up about 10% of framed height --
// 9.24 m instead of 10.15 m, still 1.47x the reporter shot and still the
// widest of the six. This is the research's own open item -- "portrait-
// specific second framing: NOT ATTEMPTED" -- handled here only to the extent
// of not making it worse.
// =========================================================================
// COURTSIM-FIX-V, DEFECT V-4 -- D FOLLOWS THE CAMERA, OR THE FRAMING BREAKS.
//
// D was 12.1998, inherited from the deleted SIX_SEAT_GUARANTEE_WIDE and
// belonging to a camera at [0, 6.5, 10.0]. That camera has moved inside the
// room (see CAMERA_PRESETS.wide), and D MUST move with it, because
// _applyPosTarget does NOT measure the pos/target distance when the
// guarantee declares one:
//
//     this._activeD = guarantee.D != null ? guarantee.D
//                                         : this._distance(pos, target);
//
// Leaving 12.1998 in place while the camera sits 9.4810 m away would solve
// the fov for a distance the camera is no longer at. CHECKED, because this
// is exactly the kind of silent mis-framing that is hard to see and easy to
// ship: at D 12.1998 the solve gives vfov 39.66 deg, whose half-height at
// the REAL 9.4810 m is 9.4810 * tan(19.83) = 3.417 m -- against an Ry of
// 4.4. The room would have overflowed the top and bottom of the frame by
// nearly a metre each way. Re-stated at the true distance.
//
// Rx 7.6 / Ry 4.4 are UNCHANGED -- what the shot must contain has not
// changed, only where it is seen from. The whole portrait-fov argument
// above therefore still stands; it is an argument about Rx, not about D.
// =========================================================================
const ROOM_GUARANTEE     = { D: 9.4810, Rx: 7.6000, Ry: 4.4000 };

// Step 4 controls (Rule 111 as amended -- values on a range get a defended
// default and a real control, not a hardcoded constant or a per-preset
// author's guess). Both persist in the SAME localStorage blob as camera
// state (Rule 129 -- legible current value, effect measured, survives a
// reload).
const PROTECTION_FACTOR_DEFAULT = 1.05;  // research's own "Netflix's own 3-10%" band, §7.2 -- 5% chosen as the mid-band default
const PROTECTION_FACTOR_MIN = 1.03;
const PROTECTION_FACTOR_MAX = 1.10;
const CAMERA_DISTANCE_DEFAULT = 1.0;     // multiplies the close/speaker presets' own pos-target distance -- "the faces and how close it should be" (founder's own ruling)
const CAMERA_DISTANCE_MIN = 0.6;
const CAMERA_DISTANCE_MAX = 1.8;

// The single-subject presets the CAMERA-DISTANCE control applies to --
// reporter/wide are the fixed six-seat establishing shots and are excluded.
const CLOSE_PRESET_NAMES = new Set(['bench', 'witness', 'counselA', 'counselB']);

export const CAMERA_PRESETS = {
  reporter: {
    // COURTSIM-FIX-R -- the label now names what it is. The pos/target below
    // are the BOOT-TIME FALLBACK ONLY (used before any venue exists);
    // setPreset('reporter') resolves the real seat from the scene. See
    // _applyReporterSeat() and scene.js getReporterSeatFraming().
    label: 'Reporter (your seat)',
    pos: [0, 2.3, 7.5], target: [0, 1.4, -2.6], guarantee: SIX_SEAT_GUARANTEE,
  },
  bench: {
    label: 'The Bench',
    // COURTSIM-INTEGRATE-011 -- `anchor` makes this preset track its own
    // subject. See the ANCHORED PRESETS block above _resolvePreset().
    // Decomposed against the LIVE seat (THE COURT at [0, 0.49, -3.5]) so
    // the resolved pair is byte-identical to the literals below today.
    anchor: { seat: 'THE COURT', targetDy: 1.01, targetFwd: 0.00, posDy: 0.20, posFwd: 2.50 },
    pos: [0, 1.7, -1.0], target: [0, 1.5, -3.5], guarantee: BENCH_GUARANTEE,
  },
  witness: {
    label: 'Witness Stand',
    // COURTSIM-FIX-I, Fix 5 -- the witness moved back 0.40 m in Z (scene.js
    // SEATS 'THE WITNESS': z -1.35 -> -1.75, so her folded legs stop hanging
    // out through the front of her own box). BOTH pos and target take the
    // same -0.40, deliberately: that keeps the pos-to-target distance at
    // exactly hypot(0.4, 2.4) = 2.4331 m, which is the D this preset's fov
    // has always been solved at. Moving only the target would have changed D
    // and re-framed a shot that is not the one being fixed.
    // COURTSIM-INTEGRATE-011 -- the comment above describes, by hand, the
    // exact maintenance this `anchor` now does automatically: when the
    // witness seat moved 0.40 m in Z somebody had to remember to move BOTH
    // pos and target by the same amount to preserve D. Decomposed against
    // the live seat (THE WITNESS at [1.6, 0.28, -1.75]); resolves to the
    // identical pair below, and D stays hypot(0.4, 2.4) = 2.4331.
    anchor: { seat: 'THE WITNESS', targetDy: 1.02, targetFwd: 0.15, posDy: 0.40, posFwd: 2.40 },
    pos: [1.6, 1.7, 0.8], target: [1.6, 1.3, -1.6], guarantee: WITNESS_GUARANTEE,
  },
  // =======================================================================
  // COURTSIM-INTEGRATE-011 -- THESE TWO WERE POINTING 1.30 m OFF THEIR OWN
  // SUBJECT, AND THE FOUNDER WOULD HAVE SEEN IT ON THE FIRST CLICK.
  //
  // WEB-007 moved COUNSEL_TABLE_X from 3.30 to 2.00 (so both tables fit the
  // reporter's frustum) and could not fix this from inside scene.js. It
  // MEASURED the damage rather than predicting it: counsel A cut by
  // -5.28 deg, counsel B by -4.29 deg, both subjects clipped by their own
  // close-up.
  //
  // The literals below are LEFT AS THE PRE-VENUE FALLBACK ONLY. The live
  // values come from the seat itself, so the next time the well is
  // re-proportioned these presets move with it and this bug cannot recur.
  // The authored OFFSETS are unchanged, which is what keeps the shot the
  // same shot: posDy 0.60 / posFwd 2.30 is D = hypot(0.60, 2.30) = 2.3769,
  // exactly the distance COUNSEL_GUARANTEE has always been solved at, so
  // the lens does not move either.
  // =======================================================================
  counselA: {
    label: 'Counsel Table (Q)',
    anchor: { seat: 'Counsel (Q)', targetDy: 1.00, targetFwd: 0.00, posDy: 0.60, posFwd: 2.30 },
    pos: [-3.3, 1.6, -0.8], target: [-3.3, 1.0, 1.5], guarantee: COUNSEL_GUARANTEE,
  },
  counselB: {
    label: 'Counsel Table (Named)',
    anchor: { seat: 'Counsel (named)', targetDy: 1.00, targetFwd: 0.00, posDy: 0.60, posFwd: 2.30 },
    pos: [3.3, 1.6, -0.8], target: [3.3, 1.0, 1.5], guarantee: COUNSEL_GUARANTEE,
  },
  wide: {
    label: 'Wide Establishing Shot',
    // COURTSIM-FIX-C-WEB-VIEWPORT-UI Step 3 -- was SIX_SEAT_GUARANTEE_WIDE,
    // which framed 5% more room than 'reporter' and so was not a wide shot at
    // all. ROOM_GUARANTEE keeps this preset's measured D (12.1998) and its
    // camera, and only enlarges what it must contain.
    // =================================================================
    // COURTSIM-FIX-V, DEFECT V-4 -- THE WIDE SHOT STARTED OUTSIDE THE ROOM.
    //
    // FOUNDER, VERBATIM: "when I zoom all the way back out, it just shows
    // blackness at the bottom of the screen... it's designed to make a box
    // cut of the room."  CONFIRMED in his own Screenshot (895).png: in Wide
    // Establishing Shot the room occupies the upper half of the canvas and
    // the lower half is solid black.
    //
    // pos was [0, 6.5, 10.0]. The floor plane ends at z = +8.0 and both
    // side walls end at z = +8.0. So the default "Wide Establishing Shot"
    // put the camera TWO METRES OUTSIDE THE BUILDING, looking in through
    // the wall that did not exist, with no floor under the near half of
    // the frame. The black band is not a framing artefact -- it is the
    // outside of the room, and it measures rgb(3,3,6), which is
    // scene.background 0x0c0c10 through AgX, in every pixel.
    //
    // MOVED INSIDE: pos [0, 4.8, 7.4]. That is 0.35 m inside BOUNDS.zMax
    // (7.2)... no -- 7.4 is OUTSIDE 7.2, and presets deliberately bypass
    // _clampToBounds, so this is legal but it would sit 0.2 m past where
    // free movement may go. Brought to 7.0 so the authored preset and the
    // free-movement limit agree, which is the only way "Reset view" and a
    // dragged view can ever be reconciled.
    //
    // THE FRAMING IS RE-SOLVED, NOT RE-GUESSED. contain.js takes D from the
    // pos/target pair and solves the fov to satisfy ROOM_GUARANTEE, so
    // moving the camera cannot break the guarantee -- it changes the lens
    // instead. Arithmetic for the new pair, so the change is checkable:
    //     pos (0, 4.8, 7.0)  target (0, 0.6, -1.5)
    //     delta      (0, -4.2, -8.5)
    //     D          hypot(4.2, 8.5)          = 9.4809   (was 12.9257)
    //     pitch down atan(4.2 / 8.5)          = 26.29 deg
    //     Y          max(Ry/D, (Rx/D)/a)
    //                Ry/D = 4.4 / 9.4810      = 0.46409
    //                (Rx/D)/a at 16:9
    //                     = (7.6/9.4810)/1.7778 = 0.45093
    //     vfov       2*atan(0.46409)          = 49.79 deg   (was 39.66)
    //     half-vfov                             24.90 deg
    //     bottom frame edge  26.29 + 24.90    = 51.19 deg below horizontal
    //          -> meets y = 0 at a run of 4.8 / tan(51.19) = 3.861 m
    //          -> i.e. at z = 7.0 - 3.861 = +3.14, which is gallery FLOOR,
    //             1.3 m inside the room. Nothing below the frame is outside.
    //     top frame edge     26.29 - 24.90    = 1.40 deg below horizontal
    //          -> at the back wall (run 7.0 + 6.0 = 13.0 m) it is at
    //             y = 4.8 - 13.0*tan(1.40) = 4.48 m, on a 6.0 m wall.
    //             No ceiling gap at the top either.
    //   (All of the above recomputed and checked, not hand-derived.)
    //
    // So the lens is wider (49.8 deg vs 39.7) because the camera is closer,
    // and every edge of the frame now lands on real geometry. Whether it
    // READS as wide enough is his call; the black band is arithmetic.
    // =================================================================
    pos: [0, 4.8, 7.0], target: [0, 0.6, -1.5], guarantee: ROOM_GUARANTEE,
  },
  // 'speaker' has no static pos/target -- computed at runtime from whoever
  // is currently talking (see followSeat()), and falls back to 'reporter'
  // when nobody is. Its guarantee is SPEAKER_GUARANTEE (below, in
  // _followActiveOrReporter) -- deliberately the TIGHTEST of the six, so
  // that switching to Follow Speaker is unmistakably a different shot from
  // any of the static seat presets rather than a fifth near-identical one.
  speaker: { label: 'Current Speaker (close)' },
};

const PRESET_ORDER = ['reporter', 'bench', 'witness', 'counselA', 'counselB', 'wide', 'speaker'];

// =========================================================================
// COURTSIM-INTEGRATE-011 -- the motivated move. See _glideTo().
//
// 520 ms: long enough to read as a camera operator swinging to the new
// speaker rather than a cut, short enough that the first syllable of a line
// is not lost travelling. SPEECH-008 measured the median inter-utterance gap
// at 126 ms, so the move is still running as the new speaker starts -- which
// is what a real multi-camera cut does too, and is far better than arriving
// late and missing the opening of the line.
//
// GLIDE_MIN_DISTANCE_M: below this the move is applied instantly. Easing a
// few centimetres over half a second reads as a stutter, and the same seat
// re-framing itself (a head bone drifting under the idle animation) would
// otherwise start a glide on every utterance from one speaker.
// =========================================================================
const GLIDE_MS = 520;
const GLIDE_MIN_DISTANCE_M = 0.25;

// Room bounds for free movement -- derived from the room geometry in
// scene.js's _buildRoom() (floor 16x16 centered at origin, walls implied
// by the back wall at z=-6 and the room dressing) with a margin so the
// camera can approach a wall/the bench without clipping through it.
// =========================================================================
// COURTSIM-FIX-V, DEFECT V-4 -- zMax 9.5 WAS OUTSIDE THE BUILDING.
//
// FOUNDER, VERBATIM: "if you can still go outside the room where the black
// is."  He can, and this constant is how.
//
// MEASURED against scene.js _buildCourtroomRoom()'s own geometry:
//     floor      PlaneGeometry(16, 16) at the origin  ->  z -8.0 .. +8.0
//     LeftWall / RightWall, 16 deep at x -+7.9         ->  z -8.0 .. +8.0
//     backWall   z = -6.0
//     +Z end     nothing at all, until COURTSIM-FIX-V added BackWallGallery
// zMax 9.5 is therefore 1.5 m PAST the end of the floor and past the end of
// both side walls. Free movement was allowed to leave the building through
// the missing fourth wall and look back at it, with nothing under the
// camera -- which is the "blackness at the bottom of the screen", and that
// black measures rgb(3,3,6) in his screenshots, exactly scene.background.
//
// BackWallGallery's inner face is now at z = +7.75. zMax comes in to 7.2,
// which leaves 0.55 m between the eye and that wall -- comfortably more
// than the 0.1 m near plane, so the wall is DRAWN rather than clipped even
// with the camera pressed right back against the limit (the same near-plane
// arithmetic as DEFECT V-10).
//
// The other five bounds are unchanged and were already correct:
//     xMin/xMax -+7.5 vs side-wall inner faces -+7.75  -> 0.25 m
//     zMin -5.5 vs backWall at -6.0                    -> 0.50 m
//     yMax 5.0 vs ceiling at 6.0 (7.2 in the grand venue)
//     yMin 1.1 -- FIX-I's, untouched.
// =========================================================================
const BOUNDS = { xMin: -7.5, xMax: 7.5, zMin: -5.5, zMax: 7.2, yMin: 1.1, yMax: 5.0 };

// COURTSIM-FIX-I, Fix 2a -- the guard rails for the CONTAIN solve. See
// _solveAndApplyFov() for the full derivation and the two measured routes
// that drove D toward zero.
//
// MIN_SOLVE_DISTANCE is deliberately the SAME 0.6 m that MIN_ZOOM_DISTANCE
// below already declares to be the closest the camera may legitimately get to
// what it is looking at. Using a second, different number here would be a
// second policy for the same fact.
const MIN_SOLVE_DISTANCE = 0.6;
// A perspective camera stops being usable well before 180. 150 degrees is
// past anything any shipped preset asks for -- the widest solved framing in
// this file is the portrait branch of ROOM_GUARANTEE at 98.6 degrees (see
// ROOM_GUARANTEE's own comment), so this clamp is 51 degrees clear of the
// widest legitimate shot and can only ever engage on a degenerate distance.
const MAX_VFOV_DEG = 150;
const MIN_VFOV_DEG = 1;

// =========================================================================
// COURTSIM-CAMERA-003 -- THE ROOM MUST STAY STILL WHILE THE CAMERA MOVES.
//
// FOUNDER, VERBATIM: "when I'm orbiting, it kind of sucks and zooms. Like,
// it stretches out the screen in a weird way... then it'll bounce back to
// normal when I get the right angle. But other angles, it'll move around and
// stretch and disfigure the image... the room is disordered. It's no longer
// squared in the left angle. Now I'm in the back corner, and the straight-
// down wall is now at an angle. But then if I look at it directly instead of
// at an angle, it looks right. Or if I go too low, the ceiling starts to...
//
// I want it to be like the room is locked, and it's the camera, or the
// person's view, that is changing. Right now the room is changing as I move
// around, and it has to adjust the way the room looks."
//
// HE DIAGNOSED IT EXACTLY, AND IT IS TWO SEPARATE FAULTS. Both measured
// before either was touched (harness + full numbers in
// reports/COURTSIM_CAMERA_003.md).
//
// FAULT 1 -- THE LENS CHANGED WHILE HE MOVED. Every free-movement path in
// this file ended in _rederiveActiveD(), which recomputed D and then called
// _solveAndApplyFov(). CONTAIN's whole job is to hold a guarantee box at a
// distance, so the instant D moves the fov moves with it. During an orbit
// drag that is once per pointermove -- a continuously changing lens. MEASURED
// on the real handlers, reporter seat, protection 1.05:
//
//   sweep                     aspect   vfov min    vfov max    RANGE
//   360 deg yaw               1.7778    56.430      58.836      2.406 deg
//   full pitch (down to -80)  1.7778    58.836     144.638     85.802 deg
//   yaw+pitch together        1.7778    58.334     144.638     86.304 deg
//   360 deg yaw               1.2752    73.51       76.26       2.75  deg
//   full pitch                1.2752    76.26      150.000     73.74  deg
//
// 1.2752 is HIS aspect, measured off the canvas rectangle in his own
// Screenshot (947).png (1061 x 832 CSS px). A lens that swings 2.75 degrees
// on a pure horizontal orbit and 74 degrees when he tips down is precisely
// "it sucks and zooms... then bounces back to normal."
//
// AND "ZOOMS" IS THE EXACTLY CORRECT WORD, which is worth writing down
// because it stops the next reader mis-attributing this. Changing vfov
// scales projected x and y by the SAME 1/tan(vfov/2), so it is a PURE
// UNIFORM ZOOM of the image about the frame centre. CHECKED, not asserted:
// projecting five room points at 76.261 and again at 55.000 gives an
// image-offset ratio of 1.507894 on BOTH axes at all five points, matching
// tan(76.261/2)/tan(55/2) = 1.507894 to six decimals. A fov change
// therefore changes NO angle inside the frame -- it cannot skew a wall by
// itself. What it does is change which off-axis angles are inside the frame
// at all, which is fault 2.
//
// FAULT 2 -- THE LENS WAS TOO WIDE EVEN WHEN IT WAS NOT MOVING. At his
// aspect the reporter seat's CONTAIN solve is 76.26 deg vertical / 90.05 deg
// horizontal. In a rectilinear projection a shape at off-axis angle t is
// stretched by sec(t) across the frame and sec^2(t) along the radius, so the
// corner anisotropy is sec(half-diagonal):
//
//   vfov 76.26 @ a=1.2752 -> half-diag 51.83 deg -> sec 1.618, sec^2 2.618
//   vfov 55.00 @ a=1.2752 -> half-diag 40.15 deg -> sec 1.308, sec^2 1.712
//
// A 62% tangential (162% radial) stretch at the frame corner that falls to
// nothing at the centre IS "the room is disordered... it's no longer squared
// in the left angle... but then if I look at it directly instead of at an
// angle, it looks right." It is not a bug in the wall, and per the note
// above it is not the fov skewing anything either: it is that a 76-degree
// lens puts the room's corner geometry 52 degrees off-axis, where a
// rectilinear projection necessarily exaggerates it. Narrowing to 55 pulls
// the frame corner in to 40 degrees off-axis and roughly halves the
// exaggeration he can see.
//
// -------------------------------------------------------------------------
// THE FIX, STATED AS AN INVARIANT:
//   (1) The guarantee volume chooses the lens ONCE, when a view is ENTERED
//       or when the window RESIZES. Never while the camera moves.
//   (2) The lens is never wider than a human reading an interior can take.
//
// NAV_VFOV_CEILING_DEG -- 55 degrees vertical. Chosen, not picked:
//
//   a) It is the middle of the 50-60 deg band where an interior still reads
//      as a room. At his aspect it takes the corner anisotropy from
//      sec(51.82) = 1.618 down to sec(40.15) = 1.308 -- the stretch he can
//      see is roughly halved.
//   b) IT IS A NUMBER HE HAS ALREADY CHOSEN ONCE. COURTSIM-FIX-R4 narrowed
//      this same shot to Rx 2.60 after he said the wide version looked
//      "funky" and bowed the room. Rx 2.60 at D 3.8754 is a half-field of
//      atan(2.60/3.8754) = 33.86 deg, which at his measured aspect 1.2752 is
//      vfov = 2*atan(tan(33.86)/1.2752) = 55.4 deg. Fixing the lens at 55
//      and R4's Rx 2.60 are, at the aspect he actually runs, THE SAME
//      DECISION. That is the strongest evidence available for this number:
//      it is his own earlier preference, arrived at from the other end.
//   c) It does not touch the close-ups. bench/witness/counsel/speaker solve
//      to 9-43 deg, far under the ceiling, so they stay telephoto and stay
//      visibly different from each other (the whole point of
//      COURTSIM-FIX-C-WEB-VIEWPORT-UI Step 3).
//
// WHAT THIS COSTS, AND IT IS A REAL COST -- SEE _solveAndApplyFov()'s
// guarantee_SHORTFALL warning and reports/COURTSIM_CAMERA_003.md. At 55 deg
// the reporter seat can no longer hold both counsel tables. THIS REVERSES
// COURTSIM-FIX-V DEFECT V-5 AND IT IS THE FOUNDER'S CALL, NOT MINE. The one
// line to change is NAV_VFOV_CEILING_DEG; setting it to 180 restores the
// previous framing exactly while KEEPING fault 1 fixed, because the two
// halves of this change are independent.
const NAV_VFOV_CEILING_DEG = 55;
//
// NAV_MAX_DIAGONAL_FOV_DEG -- a vertical ceiling alone is aspect-blind, and
// this is a CHECKED consequence rather than a precaution. A fixed 55 deg
// vertical is a 80.3 deg diagonal at his 1.2752, but a 103 deg diagonal at
// 21:9 and 109 deg at 2.5:1 -- i.e. on an ultrawide window a flat 55 would
// put the shear straight back. Worse, CONTAIN already solves the reporter
// seat to 46.50 deg at 21:9, so a flat 55 would be WIDER than what ships
// today and this "fix" would have made ultrawide worse. 100 deg diagonal is
// sec(50) = 1.556 at the corner; it is inert at every aspect narrower than
// about 2:1 (so it never touches his machine) and only ever narrows.
const NAV_MAX_DIAGONAL_FOV_DEG = 100;

// The vertical fov that lands the DIAGONAL exactly on the cap, for a given
// aspect. tan(half-diag) = tan(half-vfov) * sqrt(1 + a^2), so inverting:
//   tan(half-vfov) = tan(half-diag) / sqrt(1 + a^2)
function vfovForDiagonalCapDeg(aspect, diagCapDeg) {
  const halfDiag = THREE.MathUtils.degToRad(diagCapDeg) / 2;
  const tanHalfV = Math.tan(halfDiag) / Math.sqrt(1 + aspect * aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan(tanHalfV));
}
// =========================================================================

const ZOOM_STEP_FRACTION = 0.22; // satellite-map-style: each click/press covers a fraction of the remaining distance to the target point, not a fixed unit -- feels right whether you're far out or already close in.
const MIN_ZOOM_DISTANCE = 0.6;

// FIELD-TEST-BUILD-002 -- FREE-ORBIT-001. The founder's own field-test
// report: "The view is only looking at it from behind. I want to look at
// it from every angle -- looking at them, then from behind them into the
// audience, then from the left and the right. It needs to be 360, in all
// degrees." The existing bounded-drag control (_bindPointerEvents below)
// WALKS the viewpoint (position translates, look direction stays fixed) --
// it never rotates the view at all, so it can't answer this report by
// itself. Orbit is ADDITIVE: a new toggleable mode, following the SAME
// click-a-mode-then-drag/click pattern this file already established for
// zoom-in/zoom-out (setZoomMode/handleZoomClick), so it reads as one
// consistent interaction language instead of a second one invented from
// scratch. When orbit mode is off, dragging still walks the viewpoint
// exactly as it always has -- presets and Reset are untouched either way
// (Rule 100: additive, not a replacement).
// =========================================================================
// COURTSIM-CAMERA-003 -- THE PITCH LIMITS. FOUNDER: "if I go too low, the
// ceiling starts to..."
//
// WAS +-80 degrees, whose only stated justification was avoiding lookAt()'s
// polar singularity. That is a correct reason to stay off +-90 and a
// completely insufficient reason to allow 80. Two separate things break long
// before the pole, and both were measured:
//
//   1. IT IS NOT A HEAD. This file's whole brief is "a person who's in a
//      locked room". Sustained-posture ergonomics put comfortable neck
//      FLEXION (looking down) at about 35 deg and comfortable EXTENSION
//      (looking up) at about 25 deg -- the asymmetry is real and is why
//      display guidance tells you to never put a screen above eye level. A
//      camera 80 deg below its subject is not a viewpoint a person has.
//
//   2. AT THE REPORTER SEAT, ANY PITCH BELOW -2.66 DEG PUTS THE CAMERA
//      THROUGH THE FLOOR. Measured from this file's own constants: the seat
//      orbits a target at y 1.28 at radius 3.8754, so the camera reaches
//      BOUNDS.yMin (1.10) at asin((1.10-1.28)/3.8754) = -2.66 deg. Past
//      that, _clampToBounds pins y at 1.10 while the spherical solve keeps
//      pulling the camera inward, so it SLIDES ALONG THE FLOOR INTO THE
//      TARGET: at the old -80 clamp the camera ended up 0.6966 m from its
//      aim point, having burrowed into the middle of the well. That collapse
//      is what drove the fov to 144.6 deg, and it is "the ceiling starts
//      to..." -- from 0.70 m with a 144-degree lens, the ceiling is most of
//      what is left in frame.
//
// So the clamp is now the TIGHTER of two limits, applied per drag:
//   - these anatomical constants, and
//   - a GEOMETRIC limit computed from the live target and radius so that
//     _clampToBounds can never engage on the Y axis at all (see the orbit
//     branch in _bindPointerEvents). Once Y is never clamped, the orbit
//     radius is genuinely constant and the camera stops burrowing.
const ORBIT_MIN_PITCH_DEG = -25; // camera BELOW the subject, looking UP -- neck extension, the tighter of the two directions
const ORBIT_MAX_PITCH_DEG = 35;  // camera ABOVE the subject, looking DOWN -- neck flexion
// =========================================================================
const ORBIT_SENSITIVITY = 0.006; // radians of azimuth/pitch per drag-pixel -- tuned so a single drag across most of the canvas covers a bit over half a full revolution, reaching "behind" without needing several repeated drags.
const ORBIT_MIN_RADIUS = 1.0;
const ORBIT_MAX_RADIUS = 9.0; // stays within BOUNDS' own extent (see BOUNDS above) from any room-center-ish target

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.preset === 'string') return parsed;
  } catch (e) { /* corrupt/old value -- fall through to default */ }
  return null;
}

export class CameraController {
  constructor(scene, canvas) {
    this.scene = scene;
    this.camera = scene.camera;
    this.canvas = canvas;
    this.currentPreset = 'reporter';
    this._customPos = null;   // set once free-drag or zoom moves off a preset's exact values
    this._customTarget = null;
    this._followSeatKey = null;
    this._zoomMode = null;    // null | 'in' | 'out'
    this._raycaster = new THREE.Raycaster();
    this._dragState = null;
    // FREE-ORBIT-001 -- separate from _zoomMode/_dragState above: a third,
    // independently-toggleable drag behavior (see setOrbitMode() below),
    // off by default so existing walk-drag behavior is unchanged unless
    // explicitly turned on.
    this._orbitMode = false;
    this._orbitDragState = null;
    this._onChange = null;    // UI callback: (presetName, zoomMode) => void
    // COURTSIM-INTEGRATE-011 -- see setAutoFollow() and _glideTo().
    // DEFAULT TRUE: a fresh profile follows the speaker. LIPS-009 proved
    // that the opposite default costs the founder the entire lipsync fix.
    this._autoFollow = true;
    this._glide = null;
    this._glideEnabled = true;

    // VIEWPORT-CONTAIN-001 Step 2 -- the aspect CONTAIN solves against.
    // scene.js's _resize() is the one place the CSS box's real
    // clientWidth/clientHeight are read (Rule: "engine follows, camera owns
    // framing" -- see contain.js's own header comment); it calls
    // setAspect() here on every change so the ACTIVE preset's fov is always
    // solved for the aspect that is true right now, not whatever aspect was
    // true when the preset was last clicked.
    this._aspect = 16 / 9;
    // Step 4 controls -- persisted, defended defaults, real range (Rule 111
    // as amended). Loaded before setPreset() below so the very first fov
    // solve already uses whatever the founder last set.
    this._protectionFactor = PROTECTION_FACTOR_DEFAULT;
    this._cameraDistanceScale = CAMERA_DISTANCE_DEFAULT;
    this._loadControls();

    this._bindPointerEvents();
    this._bindViewKeys();

    // COURTSIM-LOOK-049 -- created here, armed by nothing. Constructing it
    // binds listeners and reads no permission; the mode is OFF until the
    // button or H says otherwise, and the webcam is off until he ticks a box.
    this._look = new StationaryLookInput(this, this.canvas);
    this._loadLookSettings();
    // The toolbar markup is in index.html above main.js's own module tag, so
    // it exists by the time main.js constructs this controller. The
    // readyState guard is for any caller that constructs it earlier.
    if (typeof document !== 'undefined') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this._look.attachUi(document), { once: true });
      } else {
        this._look.attachUi(document);
      }
    }

    // MEASURED BUG, fixed here: persisting currentPreset:'speaker' across a
    // page reload left it selected with NO seat yet followed (a fresh
    // instance has no _followSeatKey until the first utterance of a NEW
    // session runs) -- but followSeat() checks `this.currentPreset ===
    // 'speaker'` to decide whether to move the camera, so the very FIRST
    // followSeat() call of the new session (fired by the normal speak
    // loop for utterance 1, nothing to do with any explicit preset click)
    // silently snapped the camera to a close-up instead of leaving it on
    // whatever preset a person would expect a fresh load to start on.
    // Reproduced directly: an automated run that happened to end a prior
    // session with 'speaker' active left the WIDE-SHOT assertions of the
    // NEXT run reading a nonsensical off-screen camera rect (cx=-139).
    // 'speaker' has no meaningful saved state on its own (its whole point
    // is "whoever is currently talking," which by definition doesn't
    // exist yet at page load) -- excluded from restoration here; every
    // OTHER preset, including a free-moved/zoomed position within it,
    // still resumes exactly where he left off (Rule 129).
    const persisted = loadPersisted();
    if (persisted && CAMERA_PRESETS[persisted.preset] && persisted.preset !== 'speaker') {
      this.setPreset(persisted.preset, { persist: false });
      if (persisted.pos && persisted.target) {
        this._customPos = persisted.pos;
        this._customTarget = persisted.target;
        this._applyPosTarget(persisted.pos, persisted.target);
        // COURTSIM-FIX-G-WEB-ROUND2, Fix 4 -- the persistence half of the
        // defect. setPreset() above set _activeGuarantee AND an _activeD for
        // the PRESET's staged distance; the line above then moves the camera
        // to the saved free position without re-deriving D, so the restored
        // view was framed with the preset's fov at the saved distance. That
        // is how a framing broken by a zoom survived a page reload.
        // The guarantee from the preset is correct and is kept; only the
        // distance term is re-derived, through the same single site.
        // VIEW ENTRY: a restored session is the founder arriving at a view,
        // so this is exactly when the guarantee is allowed to pick the lens.
        this._rederiveActiveD(persisted.pos, persisted.target, { resolveFov: true });
      }
    } else {
      this.setPreset('reporter', { persist: false });
    }
  }

  onChange(fn) { this._onChange = fn; }

  _notify() {
    if (this._onChange) this._onChange(this.currentPreset, this._zoomMode);
    // COURTSIM-LOOK-049 -- main.js owns #camera-status and is another lane's
    // file this pass, so it cannot know this mode exists and would leave the
    // status line silently wrong about what the mouse now does. Appending
    // AFTER its callback has written, on the same event, keeps Rule 129's
    // "current state is legible" true without a single edit outside my own
    // files. Idempotent -- see decorateStatus().
    if (this._look) this._look.decorateStatus();
  }

  _persist() {
    const pos = [this.camera.position.x, this.camera.position.y, this.camera.position.z];
    const target = this._currentTargetArray();
    try {
      // VIEWPORT-CONTAIN-001 Step 4 -- merge, don't clobber: this same blob
      // also carries protectionFactor/cameraDistanceScale (_persistControls
      // below), which a plain camera-move persist must not silently erase.
      // =================================================================
      // COURTSIM-INTEGRATE-011 -- THE COMMENT ABOVE WAS RIGHT AND THE CODE
      // UNDER IT WAS WRONG, and it cost me a measurement to find.
      //
      // This wrote a fresh four-key object literal. It only LOOKED like a
      // merge because the two keys it had to preserve were re-listed by
      // hand -- so the invariant was "remember to add your key here", which
      // is exactly the kind of instruction that gets missed. MEASURED: the
      // new autoFollow flag was written by setAutoFollow() and then erased
      // by the very next preset change, so the founder's choice to stop the
      // camera following would not have survived a reload.
      //
      // Now an actual merge: read, assign, write. A key this function does
      // not know about can no longer be destroyed by it.
      // =================================================================
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.preset = this.currentPreset;
      parsed.pos = pos;
      parsed.target = target;
      parsed.protectionFactor = this._protectionFactor;
      parsed.cameraDistanceScale = this._cameraDistanceScale;
      parsed.autoFollow = this._autoFollow;
      // COURTSIM-WIRE-025 -- this function also writes autoFollow, so it also
      // stamps the version. Leaving it unstamped here would let an ordinary
      // camera move re-create an unversioned false and re-arm the migration.
      parsed.autoFollowV = FOLLOW_STATE_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage full/unavailable -- state just won't persist, not fatal */ }
  }

  // =====================================================================
  // COURTSIM-FIX-W, DEFECT W-1 -- THE 180 SPIN. FOUND, AND IT IS THIS LINE.
  //
  // FOUNDER, VERBATIM: "when I try and switch to drag, and then as soon as
  // I click the screen, it just spins it 180 degrees, like a glitch spin."
  //
  // THE MECHANISM, traced end to end:
  //   1. setPreset('reporter') clears _customTarget to null, then calls
  //      _applyReporterSeat(), which resolves the REAL seat from the built
  //      scene: pos (-1.15, 1.20, -2.20), target (0, 1.28, +1.50).
  //   2. _applyPosTarget() aims the camera there and records _lastTarget --
  //      but it does NOT set _customTarget, because _customTarget means
  //      "the founder moved off the preset", which he has not.
  //   3. _currentTargetArray() therefore fell through to
  //      CAMERA_PRESETS.reporter.target, which is [0, 1.4, -2.6] -- the
  //      BOOT-TIME FALLBACK for a camera at z = +7.5 that has not been where
  //      this camera is since COURTSIM-FIX-R moved the seat.
  //   4. Both drag paths open by reading _currentTargetArray() and then call
  //      camera.lookAt() on it. The first pointermove therefore snapped the
  //      view from the aim it was actually holding to a target that is
  //      BEHIND AND TO THE SIDE of the camera.
  //
  // MEASURED, in degrees, from the real numbers above:
  //     real view dir   (1.15, 0.08,  3.70) -> yaw atan2(1.15, 3.70)  =  17.27 deg
  //     stale target    (1.15, 0.20, -0.40) -> yaw atan2(1.15,-0.40)  = 109.19 deg
  //     dot of the unit vectors = -0.0295  ->  91.7 deg between them
  // So it is a 91.9-degree yaw whip, not literally 180 -- but it is
  // instantaneous, it happens on the FIRST click of every session (this is
  // the DEFAULT preset and the one "Reset View" restores), and an
  // instantaneous 92-degree whip is exactly what "a glitch spin" describes.
  // I am reporting the number I can derive rather than agreeing with 180.
  //
  // 'speaker' has the identical fault and is worse: CAMERA_PRESETS.speaker
  // carries no `target` at all, so every Follow-Speaker close-up fell
  // through to that same [0, 1.4, -2.6] literal no matter which head it was
  // actually framing. bench/witness/counselA/counselB were always safe --
  // _applyScaledClose() aims at def.target, which is the same array this
  // function returned.
  //
  // THE FIX: ONE SOURCE OF TRUTH. _lastTarget is written by _applyPosTarget
  // on EVERY path, and is by construction the point the camera is actually
  // looking at. Prefer it over the preset literal. The preset literal stays
  // as the last resort for the one frame before any pos/target is applied.
  // =====================================================================
  _currentTargetArray() {
    if (this._customTarget) return this._customTarget;
    if (this._lastTarget) return this._lastTarget;
    const preset = CAMERA_PRESETS[this.currentPreset];
    return preset && preset.target ? preset.target : [0, 1.4, -2.6];
  }

  // VIEWPORT-CONTAIN-001 Step 2 -- `guarantee` replaces the old raw `fov`
  // parameter: {Rx, Ry} (world units, UN-padded) plus an optional fixed `D`.
  // When omitted, whatever guarantee/D is already active stays active (the
  // persisted-custom-position restore path in the constructor below relies
  // on this -- it repositions the camera without re-deriving a fresh D from
  // an arbitrary saved point).
  _applyPosTarget(pos, target, guarantee = null) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(target[0], target[1], target[2]);
    // COURTSIM-FIX-W, DEFECT W-1 -- _lastTarget is now READ by
    // _currentTargetArray(), so it must be a COPY. Several callers pass a
    // module-level preset constant here (_applyScaledClose passes
    // this._baseTarget, which IS CAMERA_PRESETS[x].target), and a reader
    // that later wrote through the reference would silently edit the preset
    // table for the rest of the session.
    this._lastTarget = [target[0], target[1], target[2]];
    if (guarantee) {
      this._activeGuarantee = guarantee;
      this._activeD = guarantee.D != null ? guarantee.D : this._distance(pos, target);
      this._solveAndApplyFov();
    }
  }

  _distance(pos, target) {
    return Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
  }

  // The ONE place vfov is computed (contain.js's solveVFovDegrees is the one
  // place the CONTAIN math itself lives) -- called whenever the aspect
  // changes (setAspect(), driven by scene.js's _resize()), whenever the
  // protection-margin control changes, or whenever a new pos/target/
  // guarantee is applied above.
  _solveAndApplyFov() {
    if (!this._activeGuarantee || this._activeD == null) return;
    const Rx = this._activeGuarantee.Rx * this._protectionFactor;
    const Ry = this._activeGuarantee.Ry * this._protectionFactor;
    // =====================================================================
    // COURTSIM-FIX-I, Fix 2a -- THE BLACK SCREEN. THIS IS THE ARITHMETIC.
    //
    // THE FOUNDER'S REPORT: "now it's going black on me and then it'll show
    // the screen every now and then quickly, maybe because of how much I'm
    // zoomed in." He named the cause correctly.
    //
    // contain.js is exactly Y = max(Ry/D, (Rx/D)/a), vfov = 2*atan(Y) in
    // degrees. D is a DIVISOR and had no floor anywhere. As D -> 0, Y -> inf
    // and vfov -> 180. three.js then computes the projection top as
    // near * tan(fov/2); at fov = 180 that is tan(90 deg), which in double
    // precision is 1.633e16, so every x/y scale term in the projection matrix
    // collapses to ~1e-16 and the entire world projects onto a single pixel
    // at the centre of the frame. The render is not "wrong", it is EMPTY.
    // That is the black screen, and it is a divide, not a driver stall.
    //
    // D REALLY CAN GET THAT SMALL, by two routes that both existed:
    //   1. ORBIT. _bindPointerEvents clamps the orbit radius to >= 1.0, then
    //      passes the result through _clampToBounds (yMin 1.1). counselA's
    //      target is y = 1.0, BELOW that floor. At the -80 deg pitch clamp
    //      and radius 1.0 the sphere point is y = 0.015, the clamp lifts it
    //      to 1.1, and the horizontal term is only r*cos(80) = 0.174 --
    //      leaving D = hypot(0.174, 0.1) = 0.201 m against COUNSEL_GUARANTEE
    //      Ry*1.05 = 0.945. vfov = 2*atan(4.70) = 156 degrees.
    //   2. THE +/- ZOOM. _dollyToward floors the STEP at MIN_ZOOM_DISTANCE
    //      0.6, but then hands the result to _clampToBounds. With the camera
    //      pinned on the y = 1.1 floor and a target at y = 1.0, repeated
    //      presses walk x and z onto the target while y cannot follow, and
    //      D converges on |1.1 - 1.0| = 0.1 m. Against ROOM_GUARANTEE
    //      (Ry*1.05 = 4.62) that is vfov = 2*atan(46.2) = 177.5 degrees.
    // Both land in the range where the frame is black or near-black, and the
    // "shows the screen every now and then quickly" is the view passing back
    // through a sane D as he keeps dragging.
    //
    // FIXED AT THE DIVIDE, not with a throttle and not by touching the fit
    // policy. contain.js is untouched and is still the only place the CONTAIN
    // math lives; this clamps its INPUT to a distance a camera can physically
    // be at, and clamps its OUTPUT to a fov a perspective camera can express.
    // Inside the normal operating range (D from 0.6 m to 12.2 m across every
    // shipped preset) both clamps are inert and the solve is byte-identical
    // to before, so no validated framing moves.
    // =====================================================================
    const D = Math.max(this._activeD, MIN_SOLVE_DISTANCE);
    let vfov = solveVFovDegrees(Rx, Ry, D, this._aspect);
    if (!Number.isFinite(vfov)) {
      // Only reachable if a guarantee or the aspect ever arrives NaN. A NaN
      // fov poisons the projection matrix permanently -- every subsequent
      // frame renders black even after the camera recovers -- so refuse it
      // and say so rather than write it.
      console.error('[courtsim] FOV_NOT_FINITE Rx=', Rx, 'Ry=', Ry, 'D=', D,
        'aspect=', this._aspect, '-- keeping the previous fov', this.camera.fov);
      return;
    }
    const clamped = THREE.MathUtils.clamp(vfov, MIN_VFOV_DEG, MAX_VFOV_DEG);
    if (clamped !== vfov) {
      console.warn('[courtsim] fov_CLAMPED solved=', vfov.toFixed(2),
        'applied=', clamped.toFixed(2), 'D=', D.toFixed(4),
        'Rx=', Rx.toFixed(3), 'Ry=', Ry.toFixed(3), 'aspect=', this._aspect.toFixed(3),
        '-- the guarantee box cannot be fully contained at this distance;',
        'CONTAIN is being overridden to keep the frame renderable.');
      vfov = clamped;
    }
    // =====================================================================
    // COURTSIM-CAMERA-003 -- THE COMFORT CEILING. See NAV_VFOV_CEILING_DEG
    // above for the derivation and for the one line to change to undo it.
    //
    // This is the ONLY place the ceiling is applied, and it is applied AFTER
    // CONTAIN rather than instead of it, deliberately: CONTAIN still computes
    // what the guarantee needs, so the shortfall is a number that can be
    // printed rather than a decision that silently disappeared. A framing
    // that cannot be honoured must SAY SO -- this repo has shipped a silent
    // mis-framing before (COURTSIM-FIX-G-WEB-ROUND2 Fix 4) and the cost was
    // that nobody could see it.
    // =====================================================================
    const diagCeiling = vfovForDiagonalCapDeg(this._aspect, NAV_MAX_DIAGONAL_FOV_DEG);
    const ceiling = Math.min(NAV_VFOV_CEILING_DEG, diagCeiling);
    if (vfov > ceiling) {
      // Report the cost in the two units that mean something: the half-field
      // actually held, and the world-space half-width it holds at the fit
      // plane, against the Rx the guarantee asked for.
      const halfHeldDeg = THREE.MathUtils.radToDeg(
        Math.atan(Math.tan(THREE.MathUtils.degToRad(ceiling) / 2) * this._aspect));
      const halfWidthHeld = D * Math.tan(THREE.MathUtils.degToRad(halfHeldDeg));
      if (this._lastShortfallKey !== `${vfov.toFixed(2)}|${this._aspect.toFixed(4)}`) {
        this._lastShortfallKey = `${vfov.toFixed(2)}|${this._aspect.toFixed(4)}`;
        console.warn('[courtsim] guarantee_SHORTFALL preset=', this.currentPreset,
          'CONTAIN wanted vfov=', vfov.toFixed(2),
          'ceiling applied=', ceiling.toFixed(2), 'deg',
          '| holds +-', halfHeldDeg.toFixed(2), 'deg =', halfWidthHeld.toFixed(3), 'm',
          'at D=', D.toFixed(4), '; guarantee asked for Rx=', Rx.toFixed(3), 'm',
          '-> short by', (Rx - halfWidthHeld).toFixed(3), 'm of half-width.',
          'COURTSIM-CAMERA-003: the lens is being held at a human interior',
          'field on purpose. Raise NAV_VFOV_CEILING_DEG to restore CONTAIN.');
      }
      vfov = ceiling;
    }
    this.camera.fov = vfov;
    this.camera.updateProjectionMatrix();
  }

  // =====================================================================
  // COURTSIM-FIX-G-WEB-ROUND2, Fix 4 -- THE MISSING RE-SOLVE.
  //
  // DEFECT (recon COURTSIM_PHOTO_REVIEW_001 W9/W10, D-28/D-29/D-32/D-33 --
  // "now it's all screwed up with the framing" / "this picture's too big...
  // it cut off again", both his own words captured in-frame).
  //
  // The CONTAIN policy solves vfov so the guarantee box exactly fills the
  // frame AT DISTANCE _activeD. _activeD was written in exactly ONE place --
  // _applyPosTarget(), and only when a `guarantee` argument was passed. Every
  // FREE movement path (the zoom dolly behind Zoom In/Out and +/-, the orbit
  // drag, the walk drag) moved the camera without touching it. So after a
  // zoom the fov was still the one solved for the OLD distance:
  //     zoom out -> D grew, fov unchanged -> subject shrinks, dead space;
  //     zoom in  -> D shrank, fov unchanged -> subject overflows and clips.
  // And because those paths call _persist(), the broken pair was saved and
  // the constructor's restore re-applied it without re-deriving D either, so
  // a broken framing survived a page reload.
  //
  // This is the ONE re-derivation point. It deliberately does NOT introduce a
  // second fit policy -- that is the documented failure mode this codebase
  // already warns about. It only recomputes the DISTANCE term and then hands
  // off to _solveAndApplyFov() above, which remains the single site where a
  // fov is ever computed. The guarantee box itself is untouched: WHAT must
  // stay in frame is preset-scoped and does not change because the operator
  // moved; only HOW FAR AWAY he is has changed.
  //
  // Called from every path that can alter the camera-to-target distance.
  // _distance() is used rather than the intended distance so that bounds
  // clamping (which can shorten a move without warning) is included.
  // =====================================================================
  // =====================================================================
  // COURTSIM-CAMERA-003 -- THIS IS THE LINE THE FOUNDER WAS LOOKING AT.
  //
  // Everything the comment above says is still true: D must follow the
  // camera, or a LATER re-solve uses a stale distance. What was wrong is
  // that this function also RE-SOLVED THE LENS, on every pointermove of
  // every orbit and walk drag, and CONTAIN turns any change in D into a
  // change in fov. That is the whole of "the room is changing as I move
  // around, and it has to adjust the way the room looks."
  //
  //   `resolveFov: true`   a VIEW WAS ENTERED (preset click, Reset, Follow
  //                        Speaker, a restored session, a window resize, or
  //                        an explicit framing control). Re-frame: this is
  //                        the moment the guarantee volume is allowed to
  //                        choose a lens.
  //   `resolveFov: false`  NAVIGATION (orbit, walk, dolly). Record where the
  //                        camera now is so the NEXT view entry solves from
  //                        the truth -- and leave the lens exactly alone.
  //                        The room is locked; only the viewer moves.
  //
  // Not a default, spelled out at all four call sites: which of the two a
  // movement path is, is the entire content of this defect, so a caller that
  // does not say cannot be read.
  // =====================================================================
  _rederiveActiveD(pos, target, { resolveFov }) {
    if (!this._activeGuarantee) return;
    this._activeD = this._distance(pos, target);
    if (resolveFov) this._solveAndApplyFov();
  }

  // Called by scene.js's _resize() -- the ONE place the CSS box's real
  // clientWidth/clientHeight are read (research §10.2 Step 2/Step 3: "CSS
  // owns the box... camera.aspect from the CSS box, not the buffer"). Never
  // called from anywhere else, so aspect and the fov CONTAIN solves for it
  // never drift out of sync with each other.
  setAspect(aspect) {
    this._aspect = aspect;
    this._solveAndApplyFov();
  }

  // Step 4 -- CAMERA DISTANCE control ("the faces and how close it should
  // be," the founder's own ruling). Applies only to the single-subject
  // close-ups (bench/witness/counselA/counselB/speaker) -- the six-seat
  // establishing shots (reporter/wide) are a fixed staged framing, not a
  // "how close to one face" control. Scales the camera's OFFSET from the
  // target (a real dolly, target stays fixed), then re-solves D and fov
  // from the new actual distance -- CONTAIN naturally widens the fov for a
  // closer camera and narrows it for a farther one, keeping the same
  // guarantee box in frame at every distance setting, not just the default.
  _applyScaledClose(guarantee, opts = {}) {
    const scale = this._cameraDistanceScale;
    const base = this._baseTarget;
    const offset = [
      this._basePos[0] - base[0],
      this._basePos[1] - base[1],
      this._basePos[2] - base[2],
    ];
    const pos = [
      base[0] + offset[0] * scale,
      base[1] + offset[1] * scale,
      base[2] + offset[2] * scale,
    ];
    // COURTSIM-INTEGRATE-011 -- speaker-to-speaker moves glide; everything
    // else (a preset click, the distance slider) still lands immediately,
    // because a control the operator is dragging must answer at once.
    if (opts.glide) this._glideTo(pos, base.slice(), guarantee);
    else { this._glide = null; this._applyPosTarget(pos, base, guarantee); }
  }

  setCameraDistanceScale(value) {
    this._cameraDistanceScale = THREE.MathUtils.clamp(value, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
    if (this._basePos && this._baseTarget) {
      this._applyScaledClose(this._activeGuarantee || SPEAKER_GUARANTEE);
    }
    this._persistControls();
    this._notify();
  }

  setProtectionFactor(value) {
    this._protectionFactor = THREE.MathUtils.clamp(value, PROTECTION_FACTOR_MIN, PROTECTION_FACTOR_MAX);
    this._solveAndApplyFov();
    this._persistControls();
    this._notify();
  }

  getControlState() {
    return {
      protectionFactor: this._protectionFactor,
      protectionMin: PROTECTION_FACTOR_MIN, protectionMax: PROTECTION_FACTOR_MAX,
      cameraDistanceScale: this._cameraDistanceScale,
      cameraDistanceMin: CAMERA_DISTANCE_MIN, cameraDistanceMax: CAMERA_DISTANCE_MAX,
    };
  }

  _loadControls() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.protectionFactor === 'number') {
        this._protectionFactor = THREE.MathUtils.clamp(parsed.protectionFactor, PROTECTION_FACTOR_MIN, PROTECTION_FACTOR_MAX);
      }
      if (typeof parsed.cameraDistanceScale === 'number') {
        this._cameraDistanceScale = THREE.MathUtils.clamp(parsed.cameraDistanceScale, CAMERA_DISTANCE_MIN, CAMERA_DISTANCE_MAX);
      }
      // =================================================================
      // COURTSIM-INTEGRATE-011 -- only an explicitly stored false turns
      // auto-follow off. A missing key (a fresh profile, or one saved by any
      // build before this one) means ON, which is the whole point of making
      // it the default rather than an opt-in.
      //
      // COURTSIM-WIRE-025 -- THAT WAS NOT ENOUGH, AND COURTSIM-LAPTOP-022
      // MEASURED WHY. INTEGRATE-011 made ON the default for a FRESH profile.
      // The founder's profile is not fresh: it carries `"autoFollow":false`
      // on BOTH origins (`http://localhost:8080` and `:8081`, read out of his
      // own Brave and confirmed again by this job), written by a build in
      // which OFF was the effective behaviour. So the default that was
      // introduced to fix this could never reach the one person it was for.
      //
      // WHAT THAT COSTS HIM, measured by COURTSIM-LIPS-009 and re-stated by
      // LAPTOP-022: from the reporter framing FIVE OF SIX SEATS produce
      // EXACTLY ZERO mouth pixels. With this flag off he watches a build in
      // which the lips genuinely work and concludes, for the sixth time,
      // that they are broken.
      //
      // THE MIGRATION RULE, and it is a rule rather than an override:
      //
      //   A stored `autoFollow:false` is honoured IF AND ONLY IF it carries
      //   `autoFollowV >= FOLLOW_STATE_VERSION`, i.e. it was written by a
      //   build in which turning follow off was a real, informed choice
      //   against a real, on-by-default camera. An unversioned false
      //   predates that and is migrated ONCE, to true, and re-stamped.
      //
      // The version stamp is the whole point. Without it there is no way to
      // tell "he turned it off last week, under a build where it was off
      // anyway" from "he turned it off ten seconds ago, on purpose" -- and
      // silently ignoring the second is the same class of defect as silently
      // obeying the first. setAutoFollow() below stamps the version on every
      // write, so from this build onward HIS CHOICE STICKS: if he clicks any
      // preset other than Follow Speaker, that off survives every reload and
      // this branch never touches it again.
      //
      // Loud, once, in the console, and readable afterwards from
      // window.__courtsimFollowMigration -- a preference that changes under
      // someone deserves to be findable.
      // =================================================================
      const storedVersion = Number.isFinite(parsed.autoFollowV) ? parsed.autoFollowV : 0;
      if (parsed.autoFollow === false && storedVersion >= FOLLOW_STATE_VERSION) {
        // Written by this build or later: a deliberate choice. Obey it.
        this._autoFollow = false;
      } else if (parsed.autoFollow === false) {
        // Unversioned false -- from before Follow Speaker was a default that
        // a stored value could not defeat. Migrate once, and say so.
        this._autoFollow = true;
        this._migrateFollowState(parsed, storedVersion);
      }
    } catch (e) { /* corrupt/old value -- fall through to defaults */ }
  }

  // COURTSIM-WIRE-025 -- the one-time migration write, split out so the
  // read path above stays readable and so the whole rule lives in one
  // function that can be pointed at.
  _migrateFollowState(parsed, storedVersion) {
    try {
      parsed.autoFollow = true;
      parsed.autoFollowV = FOLLOW_STATE_VERSION;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage unavailable -- the in-memory default still stands */ }
    const note = {
      migrated: true, from: false, to: true,
      storedVersion, newVersion: FOLLOW_STATE_VERSION,
      key: STORAGE_KEY,
      origin: (typeof location !== 'undefined' && location.origin) || null,
      why: 'stored autoFollow:false carried no version stamp, so it predates Follow Speaker '
        + 'being the default. Migrated once. Click any preset other than Follow Speaker to '
        + 'turn it off again and it will stay off.',
    };
    try { window.__courtsimFollowMigration = note; } catch (e) { /* no window */ }
    console.warn('[courtsim/camera] FOLLOW SPEAKER TURNED ON BY MIGRATION. Your stored '
      + `${STORAGE_KEY} had autoFollow:false with no version stamp, which means it was saved `
      + 'before the camera followed the speaker by default. It has been migrated to ON, once. '
      + 'From now on your own choice is versioned and will be kept: pick any view other than '
      + 'Follow Speaker and it stays picked. Details: window.__courtsimFollowMigration');
  }

  _persistControls() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.protectionFactor = this._protectionFactor;
      parsed.cameraDistanceScale = this._cameraDistanceScale;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage full/unavailable -- not fatal */ }
  }

  // =====================================================================
  // COURTSIM-INTEGRATE-011 -- ANCHORED PRESETS. Resolve a static preset's
  // pos/target from where its subject ACTUALLY IS, right now, in the venue
  // that is actually built.
  //
  //     target = seat + (0, targetDy, 0) + seatForward * targetFwd
  //     pos    = target + (0, posDy, 0)  + seatForward * posFwd
  //
  // seatForward is the direction the figure is FACING, so posFwd stands the
  // camera off in front of the face. That matters in this room: counsel are
  // yawed to PI (facing the bench) and the judge and witness to 0 (facing
  // the gallery), so a preset written in raw +/-Z would frame the back of
  // two of the four heads.
  //
  // WHY OFFSETS AND NOT ABSOLUTE POSITIONS: the offsets are the framing
  // DECISION -- how high the camera sits, how far back it stands, where on
  // the body it aims. Those are the parts a human chose and they do not
  // change when the furniture moves. The seat position is the part that
  // does. Separating them is the entire fix.
  //
  // D IS PRESERVED BY CONSTRUCTION: |pos - target| = hypot(posDy, posFwd),
  // a constant, independent of where the seat is. So an anchored preset can
  // never change the distance its guarantee was solved at, and therefore can
  // never change the vfov. COURTSIM-CAMERA-003's locked lens is safe from
  // this whole mechanism by arithmetic, not by care.
  //
  // Falls back to the authored literals whenever the seat is not in this
  // venue (the deposition has no bench) or no venue is built yet.
  // =====================================================================
  _resolvePreset(name) {
    const def = CAMERA_PRESETS[name];
    if (!def) return null;
    // COURTSIM-FIX-038 -- 'wide' has no anchor, so getPresetFramingReport()
    // would have kept reporting the courtroom literal for a deposition even
    // after setPreset() started using the room's own framing. A report that
    // disagrees with the camera is worse than no report.
    if (name === 'wide') {
      const wf = (this.scene && this.scene.getWideShotFraming)
        ? this.scene.getWideShotFraming() : null;
      if (wf) return { pos: wf.pos, target: wf.target, from: 'venue:' + wf.venue };
    }
    const a = def.anchor;
    const anchor = (a && this.scene && this.scene.getSeatAnchor)
      ? this.scene.getSeatAnchor(a.seat) : null;
    if (!a || !anchor) {
      return { pos: def.pos, target: def.target, from: anchor ? 'literal' : 'literal(no-anchor)' };
    }
    const f = anchor.fwd;
    const target = [
      anchor.pos[0] + f[0] * a.targetFwd,
      anchor.pos[1] + a.targetDy,
      anchor.pos[2] + f[2] * a.targetFwd,
    ];
    const pos = [
      target[0] + f[0] * a.posFwd,
      target[1] + a.posDy,
      target[2] + f[2] * a.posFwd,
    ];
    return { pos, target, from: 'anchor:' + a.seat };
  }

  // COURTSIM-INTEGRATE-011 -- the framing margin of every preset, before and
  // after, as a number the founder (or the next lane) can print instead of
  // argue about. Enters each view, measures, and puts the camera back.
  getPresetFramingReport() {
    const was = this.currentPreset;
    const rows = [];
    for (const name of PRESET_ORDER) {
      const def = CAMERA_PRESETS[name];
      const r = { preset: name };
      const lit = def.pos ? { pos: def.pos, target: def.target } : null;
      const res = this._resolvePreset(name);
      r.literal = lit ? { pos: lit.pos.slice(), target: lit.target.slice() } : null;
      // COURTSIM-FIX-038 -- FOUND WHILE VERIFYING, PRE-EXISTING, one line.
      // 'speaker' is in PRESET_ORDER and has no static pos/target by design
      // (it is computed from whoever is talking), so _resolvePreset returns
      // {pos: undefined}. `res.pos.slice()` then threw a TypeError and took
      // the WHOLE report down -- so this instrument has never once returned a
      // value for anybody. It is the instrument a lane reaches for to prove
      // the locked lens did not move, which makes a silent throw here
      // expensive. Guarded, not rewritten.
      r.resolved = (res && res.pos && res.target)
        ? { pos: res.pos.slice(), target: res.target.slice(), from: res.from }
        : (res ? { pos: null, target: null, from: res.from + ' (computed at runtime)' } : null);
      r.moved = (lit && res && res.pos)
        ? +Math.hypot(res.pos[0] - lit.pos[0], res.pos[1] - lit.pos[1], res.pos[2] - lit.pos[2]).toFixed(4)
        : null;
      this.setPreset(name, { persist: false, user: false });
      r.vfov = +this.camera.fov.toFixed(3);
      r.D = this._activeD != null ? +this._activeD.toFixed(4) : null;
      rows.push(r);
    }
    this.setPreset(was, { persist: false, user: false });
    return rows;
  }

  setPreset(name, opts = {}) {
    const def = CAMERA_PRESETS[name];
    if (!def) return;
    // COURTSIM-INTEGRATE-011 -- AUTO-FOLLOW, AND WHO IS ALLOWED TO TURN IT
    // OFF. Only a call that says it came from the operator (`user: true`,
    // which main.js's preset buttons pass) may change the mode. Every
    // internal re-entry -- the boot restore, a venue rebuild, the follow
    // itself -- leaves his choice exactly as he left it.
    //
    // "If he picks a view, it stays picked": picking any view other than
    // Follow Speaker turns auto-follow OFF and the camera stops moving on
    // its own. Picking Follow Speaker turns it back ON.
    if (opts.user) this.setAutoFollow(name === 'speaker', { persist: true, silent: true });
    // MEASURED BUG, fixed here: unconditionally clearing _followSeatKey
    // broke the exact sequence a real caller uses -- main.js's speakLoop
    // calls followSeat(seatKey) once per utterance, and setPreset('speaker')
    // is how the founder actually switches TO that view (clicking "Follow
    // Speaker" mid-proceeding, or it already being selected when a new
    // utterance starts). Clearing the just-set follow target here made
    // 'speaker' silently fall back to the reporter's seat every time --
    // reproduced directly: tests/test_e2e_web.py's own close-speaker
    // assertion read back the IDENTICAL camera rect as the wide shot right
    // after calling followSeat() then setPreset('speaker'). Only clear it
    // when leaving 'speaker' for some other preset, where a stale follow
    // target is genuinely irrelevant.
    if (name !== 'speaker') this._followSeatKey = null;
    this.currentPreset = name;
    this._customPos = null;
    this._customTarget = null;
    if (name === 'speaker') {
      this._followActiveOrReporter();
    } else if (name === 'reporter') {
      // COURTSIM-FIX-R -- resolved at runtime from the built venue, not from
      // a static constant, because the reporter station is MIRRORED in
      // Courtroom B (x 3.05 instead of -2.6). A constant could only ever be
      // correct for one side of the well, which is part of why this preset
      // was left as a gallery shot in the first place.
      this._applyReporterSeat();
    } else if (name === 'wide') {
      // COURTSIM-FIX-038 -- the establishing shot follows the room, for the
      // same reason 'reporter' already does. CAMERA_PRESETS.wide is solved
      // for the 16 x 16 courtroom floor; a deposition room is 12 x 10 with a
      // front wall at z = +5 and a ceiling at y = 4.6, and the authored
      // camera at [0, 4.8, 7.0] is OUTSIDE both of them -- which is
      // COURTSIM-IMPORT-036 H5's flat grey wall with nameplates showing
      // through it.
      //
      // scene.getWideShotFraming() returns null for every courtroom, so the
      // three courtroom venues take the authored literal and the locked lens
      // COURTSIM-FIX-V measured is untouched, byte for byte.
      const wf = (this.scene && this.scene.getWideShotFraming)
        ? this.scene.getWideShotFraming() : null;
      this._basePos = null;
      this._baseTarget = null;
      if (wf) this._applyPosTarget(wf.pos, wf.target, wf.guarantee);
      else this._applyPosTarget(def.pos, def.target, def.guarantee);
    } else if (CLOSE_PRESET_NAMES.has(name)) {
      // COURTSIM-INTEGRATE-011 -- resolved from the live seat, not from the
      // literal. See _resolvePreset().
      const r = this._resolvePreset(name);
      this._basePos = r.pos;
      this._baseTarget = r.target;
      this._applyScaledClose(def.guarantee);
    } else {
      this._basePos = null;
      this._baseTarget = null;
      this._applyPosTarget(def.pos, def.target, def.guarantee);
    }
    if (opts.persist !== false) this._persist();
    // COURTSIM-LOOK-049 -- a preset click IS a view entry. Adopt the new seat
    // and aim as the new straight-ahead without moving anything (reanchor()
    // reproduces exactly the angles setPreset just applied), so "pick a view,
    // then turn your head from it" works without leaving the mode. Placed
    // after the persist so the stored pos/target is the preset's own, not a
    // rotation of it.
    if (this._look && this._look.isEnabled()) this._look.reanchor();
    this._notify();
  }

  cyclePreset(direction = 1) {
    const i = PRESET_ORDER.indexOf(this.currentPreset);
    const next = PRESET_ORDER[(i + direction + PRESET_ORDER.length) % PRESET_ORDER.length];
    this.setPreset(next);
  }

  reset() {
    this.setPreset('reporter');
  }

  // Called by main.js every time the active speaker changes (setActiveSpeaker
  // already fires there) -- only actually MOVES the camera if the 'speaker'
  // preset is the one currently selected, so switching speakers doesn't yank
  // the view out from under someone looking at the bench preset.
  // =====================================================================
  // COURTSIM-INTEGRATE-011 -- THE CAMERA NOW FOLLOWS THE SPEAKER BY
  // DEFAULT. THIS IS THE BIGGEST SINGLE RISK TO THE NEXT FIELD TEST.
  //
  // COURTSIM-LIPS-009 measured this in the founder's own browser:
  // `currentPreset` was 'reporter' CONTINUOUSLY from utterance 6 through
  // utterance 21. It never switched, because followSeat() only moved the
  // camera `if (this.currentPreset === 'speaker')` and NOTHING ever called
  // setPreset('speaker') on the app's behalf. The tight shot only ever
  // happened if the operator clicked Follow Speaker himself.
  //
  // WHY THAT IS THE WHOLE BALLGAME: at the default reporter framing,
  // LIPS-009 probed all six seats and FIVE OF SIX produce EXACTLY ZERO
  // changed pixels at a full anatomical gape. The lips are now genuinely
  // fixed -- 1706 changed pixels at peak against a blink's 272 -- and he
  // would have seen none of it, concluded the lips were still broken for
  // the fifth time, and been right to.
  //
  // DEFAULT ON, and it is a real default rather than a persisted one: a
  // fresh profile with no localStorage follows the speaker. Only an
  // explicit click by the operator turns it off (see setPreset's `user`
  // option), and that choice then persists.
  // =====================================================================
  setAutoFollow(on, opts = {}) {
    this._autoFollow = !!on;
    if (opts.persist !== false) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.autoFollow = this._autoFollow;
        // COURTSIM-WIRE-025 -- STAMP EVERY WRITE. This is the half of the
        // migration rule that protects his choice rather than overriding it:
        // once a value has been written by this build it carries the current
        // version, so _loadControls() obeys it forever and never migrates it
        // again. An OFF he chooses after this change is permanent.
        parsed.autoFollowV = FOLLOW_STATE_VERSION;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (e) { /* storage full/unavailable -- not fatal */ }
    }
    if (!opts.silent) this._notify();
    return this._autoFollow;
  }

  isAutoFollow() { return this._autoFollow !== false; }

  followSeat(seatKey) {
    const changed = this._followSeatKey !== seatKey;
    this._followSeatKey = seatKey;
    // THE FIX. If auto-follow is on and he has not taken the camera
    // somewhere himself, entering the speaker view IS the app's job.
    if (this.isAutoFollow() && this.currentPreset !== 'speaker') {
      this.setPreset('speaker', { persist: false, user: false });
      return;
    }
    if (this.currentPreset === 'speaker') this._followActiveOrReporter({ glide: !changed ? false : true });
  }

  _followActiveOrReporter(opts = {}) {
    const seatKey = this._followSeatKey;
    const framing = seatKey ? this.scene.getSeatCloseFraming(seatKey) : null;
    if (framing) {
      this._basePos = framing.pos;
      this._baseTarget = framing.target;
      // COURTSIM-FIX-C-WEB-VIEWPORT-UI Step 3 -- was CLOSE_MARGIN, i.e. the
      // same box the four seat presets used, which made Follow Speaker frame
      // identically to them. SPEAKER_GUARANTEE is tighter on purpose.
      this._applyScaledClose(SPEAKER_GUARANTEE, { glide: opts.glide !== false });
    } else {
      this._applyReporterSeat();
    }
  }

  // =====================================================================
  // COURTSIM-INTEGRATE-011 -- THE MOTIVATED MOVE.
  //
  // "A hard cut on every line will feel like a music video." It would: at
  // 21 utterances a proceeding, a straight cut per speaker change is a cut
  // every few seconds. This glides instead.
  //
  // THE ONE RULE THAT MATTERS, and the reason this is not just a lerp:
  // COURTSIM-CAMERA-003 locks the field of view and requires ZERO variation
  // during navigation -- "framing is decided on view ENTRY only." CONTAIN
  // turns any change in D into a change in fov, and a glide changes D on
  // every single frame. So the lens is solved ONCE, here, against the
  // DESTINATION framing, and then held: _tickGlide moves the camera and
  // never re-solves. The founder sees the camera move; he does not see the
  // room breathe, which is the exact complaint CAMERA-003 was opened for.
  //
  // _activeD is set to the destination distance up front for the same
  // reason -- so that if a window resize lands mid-glide, setAspect's
  // re-solve uses the distance the shot is ARRIVING at, not a transient one.
  //
  // Interruptible: a new speaker mid-glide simply retargets from wherever
  // the camera currently is, so rapid-fire short lines ease between each
  // other instead of queueing.
  // =====================================================================
  _glideTo(pos, target, guarantee, ms = GLIDE_MS) {
    // Solve the lens for the destination, once, before anything moves.
    if (guarantee) {
      this._activeGuarantee = guarantee;
      this._activeD = guarantee.D != null ? guarantee.D : this._distance(pos, target);
      this._solveAndApplyFov();
    }
    const fromPos = this.camera.position.toArray();
    const fromTarget = (this._lastTarget || target).slice();
    const dist = this._distance(fromPos, pos);
    // A move that is already tiny, or the very first framing of a session
    // (nothing to move FROM), is applied directly -- easing 2 cm over half a
    // second reads as a stutter, not as a camera move.
    if (!this._glideEnabled || dist < GLIDE_MIN_DISTANCE_M) {
      this._applyPosTarget(pos, target, guarantee);
      this._glide = null;
      return;
    }
    this._glide = { fromPos, fromTarget, toPos: pos.slice(), toTarget: target.slice(), t: 0, ms };
    this._lastTarget = fromTarget.slice();
  }

  // Called once per frame from scene.js's _animate(). Returns immediately
  // when nothing is in flight.
  updateGlide(dt) {
    // COURTSIM-LOOK-049 -- the look mode's frame tick rides here, BEFORE the
    // early return, because this is the one function in this file scene.js's
    // _animate() already calls every frame with a real dt. No new frame loop,
    // no worker clock, and not one line added to another lane's file. The
    // edge-of-screen rotation needs a real clock (it is degrees per SECOND,
    // not per event) and this is the only honest one available.
    if (this._look && this._look.isEnabled()) this._look.tick(dt);
    const g = this._glide;
    if (!g) return;
    g.t += (dt || 0) * 1000;
    const u = Math.min(1, g.t / g.ms);
    // smoothstep: zero velocity at both ends, so the move starts and stops
    // without a visible snap at either edge.
    const e = u * u * (3 - 2 * u);
    const lerp = (a, b) => [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
    const p = lerp(g.fromPos, g.toPos);
    const t = lerp(g.fromTarget, g.toTarget);
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.lookAt(t[0], t[1], t[2]);
    this._lastTarget = t;
    // NOTE: no _solveAndApplyFov() and no _rederiveActiveD() here, on
    // purpose. Both were already done against the destination in _glideTo().
    if (u >= 1) {
      this._glide = null;
      this._lastTarget = g.toTarget.slice();
      // COURTSIM-LOOK-049 -- a follow-speaker glide is a VIEW ENTRY: the
      // camera has been put somewhere new, aimed somewhere new. If he is in
      // look mode, adopt that as the new straight-ahead rather than fighting
      // it. Nothing moves at this instant -- reanchor() reproduces exactly the
      // angles the glide just landed on -- he simply turns his head from the
      // new seat. Follow-speaker's default and its migration rule are
      // untouched: this mode does not read or write autoFollow at all.
      if (this._look && this._look.isEnabled()) this._look.reanchor();
    }
  }

  // COURTSIM-FIX-R -- the reporter's own chair, resolved from the built
  // scene. Falls back to the old gallery framing only when no venue has been
  // built yet (boot, before the first rebuildVenue), so the camera is never
  // left aimed at the origin.
  _applyReporterSeat() {
    this._basePos = null;
    this._baseTarget = null;
    const seat = this.scene.getReporterSeatFraming?.();
    if (seat) {
      this._applyPosTarget(seat.pos, seat.target, REPORTER_SEAT_GUARANTEE);
      return;
    }
    const rep = CAMERA_PRESETS.reporter;
    this._applyPosTarget(rep.pos, rep.target, rep.guarantee);
  }

  // --- Zoom: click-a-point mode (satellite-map behaviour) + plain +/- ---

  setZoomMode(mode) {
    // mode: null (off), 'in', 'out'
    // COURTSIM-LOOK-049 -- the three drag behaviours share one canvas, so at
    // most one may be armed. Only an ARM disengages look mode; turning a mode
    // OFF must not, because enable() below turns both of these off as part of
    // entering look mode and a symmetric rule would recurse.
    if (mode && this._look) this._look.disable({ announce: false });
    this._zoomMode = mode;
    this.canvas.style.cursor = mode === 'in' ? 'zoom-in' : mode === 'out' ? 'zoom-out' : '';
    this._notify();
  }

  // FREE-ORBIT-001 -- toggled by main.js's new Orbit button, same on/off
  // idiom as setZoomMode() above. Turning orbit ON does not itself move the
  // camera -- only a subsequent drag does (see _bindPointerEvents below) --
  // so clicking the button alone is a safe, reversible no-op, same as
  // entering zoom-in/zoom-out mode is.
  setOrbitMode(on) {
    if (on && this._look) this._look.disable({ announce: false });  // COURTSIM-LOOK-049 -- see setZoomMode
    this._orbitMode = !!on;
    this.canvas.style.cursor = this._orbitMode ? 'grab' : '';
    this._notify();
  }

  // =====================================================================
  // COURTSIM-LOOK-049 -- THE SEAM BETWEEN THE LOOK INPUT AND THIS FILE.
  //
  // Three small methods, and the reason they are here rather than in the
  // input module is ownership: camera_input.js decides WHERE to look,
  // camera_controller.js remains the only thing in the build that moves the
  // camera or touches the lens. The input module cannot reach past these.
  // =====================================================================

  // Hand the input module the camera's real orientation, computed fresh from
  // the position and the aim it is actually holding (Rule 130), so that
  // entering the mode -- or adopting a new view while in it -- can never
  // produce a jump.
  //
  // R IS THE WHOLE SAFETY ARGUMENT. It is the CURRENT camera-to-target
  // distance, and the input module holds the target on a sphere of that
  // radius. |target - pos| is therefore constant for every yaw and pitch, so
  // _activeD cannot move, so CONTAIN cannot re-solve a different fov.
  // COURTSIM-CAMERA-003's locked field survives this mode by arithmetic.
  getStationaryLookBasis() {
    const t = this._currentTargetArray();
    const p = this.camera.position;
    const dx = t[0] - p.x, dy = t[1] - p.y, dz = t[2] - p.z;
    const R = Math.hypot(dx, dy, dz);
    if (!(R > 1e-4) || !Number.isFinite(R)) return null;
    return {
      pos: { x: p.x, y: p.y, z: p.z },
      R,
      // dir = (sin(yaw)cos(pitch), sin(pitch), cos(yaw)cos(pitch)), inverted.
      yaw: Math.atan2(dx, dz),
      pitch: Math.asin(THREE.MathUtils.clamp(dy / R, -1, 1)),
    };
  }

  // The ONE write path out of the look input.
  //
  // _clampToBounds() is deliberately NOT called: `pos` is the anchor the
  // camera is already at and has not moved, so there is nothing to clamp, and
  // calling it would be the one way this mode could acquire the burrow that
  // COURTSIM-CAMERA-003 removed from orbit. A pure rotation about a legal
  // point is legal.
  applyStationaryLook(pos, target) {
    this.camera.position.set(pos[0], pos[1], pos[2]);
    this.camera.lookAt(target[0], target[1], target[2]);
    this._lastTarget = [target[0], target[1], target[2]];
    this._customPos = [pos[0], pos[1], pos[2]];
    this._customTarget = this._lastTarget.slice();
    // NAVIGATION, so the lens is HELD -- the same contract every other
    // movement path in this file signs. Here it is belt and braces: D is
    // arithmetically constant (see getStationaryLookBasis), so even
    // `resolveFov: true` could not have moved the fov.
    this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
  }

  // ONE OBVIOUS CONTROL, AND IT REACHES ROOM ONLY. "I have to click through
  // all of those buttons" is half his complaint, so entering this mode puts
  // zoom and orbit away itself (see enable() in camera_input.js) and it is
  // reachable from the H key as well as the toolbar button -- because
  // #courtroom-toolbar is display:none in ROOM ONLY, which is the mode he
  // calls the real one. Same reasoning as COURTSIM-TITLES-027's N and
  // COURTSIM-LIGHTBOARD-035's number keys.
  toggleStationaryLook() {
    if (!this._look) return false;
    this._look.toggle();
    if (this._look.isEnabled()) { this._zoomMode = null; this._orbitMode = false; }
    this._persistLook();
    this._notify();
    return this._look.isEnabled();
  }

  isStationaryLook() { return !!(this._look && this._look.isEnabled()); }

  // COURTSIM-TRACK-054 -- the Shift+H route into the tracker's own baseline.
  // Returns false when there is nothing to centre so the caller can say so
  // rather than pretending it worked.
  centreStationaryHead() {
    if (!this._look) return false;
    return this._look.centreHead();
  }

  getStationaryLookState() { return this._look ? this._look.diagnostics() : null; }

  persistLookSettings() { this._persistLook(); }

  // The look mode has no pointerup to persist on -- the pointer IS the head,
  // so there is no gesture that ends. Its equivalent moments are the pointer
  // leaving the canvas and the mode being switched off, and both call this.
  // Routed through the same merge-safe _persist() orbit and the walk drag
  // already use, so COURTSIM-INTEGRATE-011's "read, assign, write" fix covers
  // this path too and no key it does not know about can be destroyed.
  persistLookPose() { this._persist(); }

  _persistLook() {
    if (!this._look) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.lookMode = this._look.isEnabled();
      parsed.lookEdgeRate = this._look.edgeRateDegS;
      // COURTSIM-TRACK-054 -- the head-tracking CHOICE is remembered ('off' |
      // 'lean' | 'precise') rather than a boolean, but nothing here ever
      // re-opens the camera or re-downloads the model. A stored 'precise' is
      // restored as a note that he chose it, never as a setMode() -- a page
      // that raises a camera prompt and pulls 15 MB at boot because of a
      // setting from last week is a defect, not a convenience.
      parsed.lookHeadMode = this._look.webcam.mode;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) { /* storage full/unavailable -- not fatal */ }
  }

  _loadLookSettings() {
    if (!this._look) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (typeof parsed.lookEdgeRate === 'number') this._look.setEdgeRate(parsed.lookEdgeRate);
      // The MODE itself is deliberately NOT restored on. A camera that is
      // already turning its head at boot, before he has touched anything, is
      // the "it moved on its own" failure this build has been burned by.
      // Rule: a mode that changes what the mouse does starts off.
    } catch (e) { /* default rate */ }
  }

  // --- Orbit math: spherical coordinates around whatever target point is
  // currently active (this._currentTargetArray()) -- so orbiting a NAMED
  // preset's own close framing (e.g. 'bench') circles around THAT preset's
  // subject, and orbiting from the wide/reporter view circles around the
  // room's own establishing-shot target. ---

  _sphericalFromPosition(pos, target) {
    const rel = new THREE.Vector3(pos.x - target.x, pos.y - target.y, pos.z - target.z);
    const radius = Math.max(rel.length(), 1e-4);
    const pitch = Math.asin(THREE.MathUtils.clamp(rel.y / radius, -1, 1));
    const azimuth = Math.atan2(rel.x, rel.z);
    return { radius, pitch, azimuth };
  }

  _positionFromSpherical(target, radius, pitch, azimuth) {
    const cp = Math.cos(pitch);
    return new THREE.Vector3(
      target.x + radius * cp * Math.sin(azimuth),
      target.y + radius * Math.sin(pitch),
      target.z + radius * cp * Math.cos(azimuth),
    );
  }

  // Test/diagnostic hook (Rule 130 -- same "read the real state back off
  // the real object" discipline getRobeMaterialsRecolored() etc. already
  // use elsewhere in this codebase): the camera's CURRENT orbit angles,
  // computed fresh from its actual position/target, not a separately
  // tracked value that could drift from what's really on screen.
  getOrbitDebugState() {
    const target = new THREE.Vector3(...this._currentTargetArray());
    const sph = this._sphericalFromPosition(this.camera.position, target);
    return {
      radius: sph.radius,
      pitchDeg: THREE.MathUtils.radToDeg(sph.pitch),
      azimuthDeg: THREE.MathUtils.radToDeg(sph.azimuth),
      pos: this.camera.position.toArray(),
      target: target.toArray(),
    };
  }

  // Called by main.js's canvas click handler when a zoom mode is active.
  // (clientX, clientY) are event coordinates relative to the canvas.
  handleZoomClick(clientX, clientY) {
    if (!this._zoomMode) return false;
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    // COURTSIM-FIX-I, Fix 2c -- the one genuinely UNBOUNDED piece of work on
    // any interaction path in this file, measured rather than assumed. This
    // is a full recursive raycast over the whole scene graph, and three.js
    // raycasts a SkinnedMesh by re-skinning every candidate triangle on the
    // CPU. Twelve avatars at ~5.7k verts each are in that graph.
    //
    // It is NOT being throttled or restricted here, because the honest answer
    // is that I have no measurement showing it is slow: three.js rejects each
    // mesh on its bounding sphere first, so a click that misses the cast is
    // nearly free, and a click that hits one walks a single avatar. The
    // founder's freeze is accounted for by Fix 2b (a native text-selection
    // drag, which the photos show directly) and his black screen by Fix 2a (a
    // degenerate fov). Guessing a third cause and "fixing" it with a throttle
    // would hide whichever of the three is really biting.
    //
    // So it gets a receipt instead of a patch. If this number comes back in
    // the tens of milliseconds on the next field test, that is the evidence
    // to act on and the candidate list to restrict.
    const rcT0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const hits = this._raycaster.intersectObjects(this.scene.scene.children, true);
    if (typeof performance !== 'undefined') {
      const ms = performance.now() - rcT0;
      const line = ['[courtsim] zoom_raycast_ms=', ms.toFixed(2), 'hits=', hits.length];
      if (ms > 16) console.warn(...line, '-- over one frame at 60 Hz; this click visibly hitched.');
      else console.log(...line);
    }
    let point;
    if (hits.length > 0) {
      point = hits[0].point;
    } else {
      // No geometry under the click (e.g. clicked the sky/background) --
      // still zoom TOWARD the ray direction, at a fixed reasonable depth,
      // rather than refusing to do anything.
      const dir = this._raycaster.ray.direction;
      point = this.camera.position.clone().addScaledVector(dir, 8);
    }
    this._dollyToward(point, this._zoomMode === 'in' ? 1 : -1);
    return true;
  }

  // Plain +/- control: dolly along the current view direction (no click
  // point needed) by the same stepped fraction, toward/away from the
  // current look-at target.
  zoomStep(direction) {
    const target = this._currentTargetArray();
    this._dollyToward(new THREE.Vector3(target[0], target[1], target[2]), direction);
  }

  _dollyToward(point, direction) {
    const camPos = this.camera.position;
    const toPoint = new THREE.Vector3(point.x, point.y, point.z).sub(camPos);
    const dist = toPoint.length();
    if (dist < 1e-4) return;
    const step = dist * ZOOM_STEP_FRACTION * direction;
    const newDist = Math.max(MIN_ZOOM_DISTANCE, dist - step);
    const newPos = camPos.clone().addScaledVector(toPoint.normalize(), dist - newDist);
    const clamped = this._clampToBounds(newPos);
    this.camera.position.copy(clamped);
    // Zooming toward a clicked point aims the camera at that point (this IS
    // "move toward/away from that point", not just a dolly along the old
    // look direction) -- but a plain +/- press re-uses the existing target
    // instead, so it doesn't spin the view.
    this.camera.lookAt(point.x, point.y, point.z);
    this._customPos = [clamped.x, clamped.y, clamped.z];
    this._customTarget = [point.x, point.y, point.z];
    // Fix 4 -- THE line this defect was actually about. The dolly has just
    // changed the camera-to-target distance; record it so the next view
    // entry solves from the truth.
    //
    // COURTSIM-CAMERA-003 -- NAVIGATION, so the lens is HELD. This changes
    // what the zoom buttons do, and the change is the point: with CONTAIN
    // re-solving here, a dolly-in was cancelled out almost exactly by a
    // widening fov, because holding the same guarantee box at a shorter D is
    // the definition of what CONTAIN does. The subject barely grew -- only
    // the perspective distortion did. Holding the lens makes Zoom In a real
    // dolly, where moving 22% closer makes the subject 22% bigger, which is
    // what every person means by "zoom".
    this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
    this._persist();
  }

  _clampToBounds(pos) {
    const p = new THREE.Vector3(
      THREE.MathUtils.clamp(pos.x, BOUNDS.xMin, BOUNDS.xMax),
      THREE.MathUtils.clamp(pos.y, BOUNDS.yMin, BOUNDS.yMax),
      THREE.MathUtils.clamp(pos.z, BOUNDS.zMin, BOUNDS.zMax),
    );
    // =====================================================================
    // COURTSIM-FIX-V, DEFECT V-12 -- ONE PASS IS NOT ENOUGH, AND THE ORDER
    // WAS PUTTING HIM INSIDE THE JUDGE.
    //
    // FOUNDER, VERBATIM: "I can still get inside the desk. I'm inside the
    // court's desk. And I'm inside the judge's head... I can see his face
    // from the inside." And separately: "I'm inside their legs."
    //
    // The 26 tagged keep-out sites from FIX-R/R2/R3/R5 and FIX-S are all
    // present and all individually correct -- they are reached, and the
    // volumes are right. The defect is in how they are COMPOSED, and it is
    // visible in his own sentence, in order:
    //
    //   1. _pushOutOfPeople runs, then _pushOutOfFurniture runs. ONCE EACH.
    //   2. The bench worktop, rail, stile, lip, plinth and riser are six
    //      separate boxes sharing one corner of the room, and THE JUDGE IS
    //      SITTING AT THEM. Ejecting the camera out of the bench desk moves
    //      it horizontally -- straight into the man behind the bench.
    //   3. Nothing re-runs the people test. So the last thing that touched
    //      the camera position put it inside the judge's head, and that is
    //      the position that gets committed.
    //
    // He said "I'm inside the court's desk. And I'm inside the judge's
    // head" as one thought because it IS one thought: the second is caused
    // by the escape from the first.
    //
    // The same argument applies within each function on its own -- the
    // loops push out of box 1 and may push into box 2, and box 1 is never
    // re-tested -- which is the "inside their legs" case, where the leg
    // volume and the chair/desk volume overlap.
    //
    // FIXED by running the whole chain to a FIXED POINT: repeat until a
    // full pass changes nothing, capped at 8 rounds. A fixed point is the
    // only composition that is order-independent, and order-independence is
    // the actual property that was missing.
    //
    // COST: this is a movement-EVENT path, not the frame loop -- it runs on
    // pointermove, orbit drag and zoom press, and nothing here is called
    // from _animate(). The common case (already clear) converges on round
    // ONE with a single extra float compare. The cap of 8 exists because
    // two keep-outs whose standoffs overlap can in principle oscillate; in
    // that case the camera is left at the last position, which is no worse
    // than the single-pass behaviour being replaced, and it is logged once
    // so the geometry that caused it can be found rather than guessed at.
    // =====================================================================
    const MAX_ROUNDS = 8;
    for (let i = 0; i < MAX_ROUNDS; i++) {
      const bx = p.x, by = p.y, bz = p.z;
      this._pushOutOfPeople(p);
      this._pushOutOfFurniture(p);
      // Re-clamp to the room: a push-out can legitimately shove the camera
      // through a wall, and BOUNDS must still win. That re-clamp can in turn
      // re-enter a keep-out, which is exactly why this is a loop.
      p.x = THREE.MathUtils.clamp(p.x, BOUNDS.xMin, BOUNDS.xMax);
      p.y = THREE.MathUtils.clamp(p.y, BOUNDS.yMin, BOUNDS.yMax);
      p.z = THREE.MathUtils.clamp(p.z, BOUNDS.zMin, BOUNDS.zMax);
      // Converged: a whole round moved it less than a tenth of a millimetre.
      if (Math.abs(p.x - bx) < 1e-4 && Math.abs(p.y - by) < 1e-4 && Math.abs(p.z - bz) < 1e-4) {
        return p;
      }
    }
    if (!this._keepOutOscillationLogged) {
      this._keepOutOscillationLogged = true;
      console.warn('[courtsim] keepout_NO_FIXED_POINT after', MAX_ROUNDS,
        'rounds at', p.toArray().map((n) => n.toFixed(3)).join(','),
        '-- two keep-out volumes overlap here and are pushing the camera',
        'back and forth. COURTSIM-FIX-V DEFECT V-12. Logged once per session.');
    }
    return p;
  }

  // COURTSIM-FIX-R -- YOU CAN NO LONGER GET INSIDE SOMEBODY'S HEAD.
  //
  // FOUNDER, VERBATIM: "I kind of just turned it, and I can, like, see inside
  // this guy's head. And, oh wow, his eyes just moved, so it's, like, it's
  // hollow on the inside, and it's just, we don't want that. Okay, we want it
  // so people, you can't go inside their heads."
  //
  // It looks hollow because the head mesh is single-sided, which is correct
  // and normal -- a closed surface never needs back faces, and turning on
  // double-sided rendering for twelve skinned characters would cost real
  // fill rate to fix a place the camera should never have been able to reach.
  // So this fixes the reachability, not the shading: the camera is pushed
  // back out to the surface of a sphere around each head.
  //
  // 0.32 m radius: a human head is ~0.20 m across, so this leaves ~0.22 m of
  // standoff from the skin -- close enough for a genuine close-up (the
  // 'speaker' preset sits 2.0 m out and is unaffected), far enough that the
  // near clip plane cannot slice into the face.
  //
  // Applied in _clampToBounds because that is the single choke point every
  // free-movement path already passes through -- dolly (:832), orbit (:999)
  // and walk-drag (:1084). Adding it here means no movement path can be
  // added later that forgets to check. The named PRESETS deliberately do NOT
  // pass through here: they are authored framings, and one of them
  // (Follow Speaker) is supposed to get close to a head on purpose.
  //
  // Cost: one distance test per avatar per movement EVENT -- not per frame.
  // Nothing here runs in the render loop.
  // COURTSIM-FIX-R2 -- widened from head spheres to WHOLE-BODY cylinders.
  // The founder walked into the witness's torso after the sphere version
  // shipped: "I clicked and dragged around, and I got inside the witness's
  // body." A head guard leaves the whole body open. See scene.js
  // getBodyKeepOuts() for the volume and why it is a cylinder.
  //
  // Pushed out HORIZONTALLY only. Ejecting vertically would teleport the
  // camera to the floor or the ceiling for a small sideways overlap, which
  // is a far more disorienting failure than the one being fixed.
  _pushOutOfPeople(p) {
    const bodies = this.scene.getBodyKeepOuts?.();
    if (!bodies || bodies.length === 0) return p;
    for (const b of bodies) {
      if (p.y < b.yMin || p.y > b.yMax) continue;       // above or below them
      const dx = p.x - b.x, dz = p.z - b.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= b.r * b.r) continue;                    // already clear
      const d = Math.sqrt(d2);
      if (d < 1e-4) {
        // Dead centre of the body: no direction to push along, so pick one.
        // +Z is this scene's model-forward convention, so this ejects out
        // in front of the figure rather than through their back.
        p.set(b.x, p.y, b.z + b.r);
      } else {
        const k = b.r / d;
        p.set(b.x + dx * k, p.y, b.z + dz * k);
      }
    }
    return p;
  }

  // COURTSIM-FIX-S -- solid furniture. FOUNDER: "I'm going inside the wood
  // chairs or the wood stands or the tables. It still brings me through all
  // of those."
  //
  // Axis-aligned boxes from scene.js getFurnitureKeepOuts(). If the camera is
  // inside one, it is pushed out through the NEAREST face -- the smallest
  // correction, so sliding along a desk edge does not fling the view across
  // the room.
  //
  // Horizontal faces are allowed as an exit here, unlike the people check:
  // rising just above a desktop is a natural and useful camera move, whereas
  // rising out of a person is not. But a vertical exit is only chosen when it
  // is genuinely the shortest way out, so the common case -- walking into the
  // side of a desk -- still resolves sideways.
  _pushOutOfFurniture(p) {
    const boxes = this.scene.getFurnitureKeepOuts?.();
    if (!boxes || boxes.length === 0) return p;
    for (const b of boxes) {
      if (p.x <= b.minX || p.x >= b.maxX) continue;
      if (p.y <= b.minY || p.y >= b.maxY) continue;
      if (p.z <= b.minZ || p.z >= b.maxZ) continue;
      // Inside. Distance to each of the six faces; take the cheapest exit.
      // COURTSIM-FIX-W, DEFECT W-5 -- an exit that BOUNDS will immediately
      // undo is not an exit. scene.js now gives the underside of every
      // keep-out a standoff too, which means the downward face can sit below
      // BOUNDS.yMin (the bench worktop's does: 1.31 - 0.25 = 1.06 against a
      // yMin of 1.10). Choosing it would put the camera at 1.06, the
      // re-clamp in _clampToBounds would lift it back to 1.10, and the fixed
      // point loop would ping-pong until it gave up and logged
      // keepout_NO_FIXED_POINT. Marked unreachable so the next-cheapest
      // LEGAL face is chosen instead.
      const dxMin = p.x - b.minX, dxMax = b.maxX - p.x;
      const dyMin = p.y - b.minY, dyMax = b.maxY - p.y;
      const dzMin = p.z - b.minZ, dzMax = b.maxZ - p.z;
      const INF = Number.POSITIVE_INFINITY;
      const dyMinLegal = b.minY >= BOUNDS.yMin ? dyMin : INF;
      const dyMaxLegal = b.maxY <= BOUNDS.yMax ? dyMax : INF;
      const m = Math.min(dxMin, dxMax, dyMinLegal, dyMaxLegal, dzMin, dzMax);
      if (!Number.isFinite(m)) continue;   // boxed in on every legal face: leave it
      if (m === dxMin)      p.x = b.minX;
      else if (m === dxMax) p.x = b.maxX;
      else if (m === dzMin) p.z = b.minZ;
      else if (m === dzMax) p.z = b.maxZ;
      else if (m === dyMaxLegal) p.y = b.maxY;
      else                  p.y = b.minY;
    }
    return p;
  }

  // --- Free movement: drag to walk the viewpoint within bounds ---

  // COURTSIM-FIX-C-WEB-VIEWPORT-UI Step 4 -- keyboard access to fullscreen.
  //
  // THE FOUNDER'S REPORT: "[it doesn't] actually do full screen or take up
  // the whole monitor and fit to screen." The FULLSCREEN button existed and
  // main.js's initFullscreen() bound it correctly -- but that button lives at
  // the left end of #window-presets, which until this same job was
  // position:absolute in the canvas's top-RIGHT corner and could be pushed
  // clean off the edge of an over-wide #app with overflow-x:hidden and no
  // scrollbar. The feature was not broken so much as UNREACHABLE, which from
  // the outside is the same thing. The CSS fixes that (see style.css Step 2b
  // and Step 3); this adds the keyboard path so it can never be the only way
  // in again.
  //
  // F        toggle fullscreen
  // Shift+F  same (so it still works if a modifier is being held from a drag)
  //
  // Deliberately DELEGATES to the existing button rather than calling
  // requestFullscreen() here: main.js owns the fullscreen lifecycle
  // (initFullscreen -> label/aria-pressed updates on 'fullscreenchange'), and
  // a second independent call site would be a second source of truth for the
  // same state -- the exact "two policies, whichever wins" shape this whole
  // job exists to remove. Escape is handled natively by the browser and
  // therefore restores cleanly with no code here; main.js's own
  // fullscreenchange listener re-labels the button when it does.
  _bindViewKeys() {
    document.addEventListener('keydown', (e) => {
      // Auto-repeat would fire this many times a second while F is held,
      // thrashing requestFullscreen()/exitFullscreen() against each other.
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Never steal a keystroke from a control that consumes typing or arrow
      // keys itself -- a focused slider, the venue/device pickers, or any
      // future text field. (#transcript-box is a div written to by the ASR,
      // never typed into, so it is not the case this guards.)
      const t = e.target;
      if (t && (t.isContentEditable ||
                /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(t.tagName))) return;
      // Only while the courtroom is actually on screen.
      const screenEl = document.getElementById('courtroom-screen');
      if (!screenEl || screenEl.classList.contains('hidden')) return;
      if (e.key === 'f' || e.key === 'F') {
        const btn = document.getElementById('fullscreen-btn');
        if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
      }
      // =================================================================
      // COURTSIM-LOOK-049 -- H FOR HEAD.
      //
      // Registered here, beside F, rather than only on the toolbar button,
      // for the reason this repo has now written down three times:
      // #courtroom-toolbar is display:none under ROOM ONLY, and Room Only is
      // the mode the founder calls the real one. A mode that exists to answer
      // "I have to click through all of those buttons" cannot be missing from
      // the screen with no buttons on it.
      //
      // H was free. Checked, not assumed: the build's keydown handlers claim
      // C, Space, V, N, D, L, P, A and the digits (main.js, scene.js) and F
      // (here). H collides with nothing.
      // =================================================================
      // =================================================================
      // COURTSIM-TRACK-054 -- SHIFT+H RE-CENTRES THE HEAD TRACKER, and it is
      // here for the same reason H is. Head tracking is baselined: the posture
      // you are in when you press Centre becomes looking straight ahead. If
      // you shift in your chair -- which you will, over a twenty-five minute
      // deposition -- the centre is wrong and the view sits off to one side
      // until you fix it. In ROOM ONLY the Centre button is behind a
      // display:none toolbar, so without this the only fix is to leave the
      // mode he calls the real one. Checked the same way H was: the build's
      // keydown handlers claim C, Space, V, N, D, L, P, A, the digits, F and
      // H, none of them with a Shift variant, and `e.key` for shift+h is the
      // capital 'H' which the branch below already accepts -- so the test has
      // to come FIRST and has to consume the event.
      //
      // It is a no-op with no tracker running, deliberately: a shortcut that
      // silently does nothing is better than one that opens a camera.
      // =================================================================
      if ((e.key === 'h' || e.key === 'H') && e.shiftKey) {
        e.preventDefault();
        this.centreStationaryHead();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.toggleStationaryLook();
      }
    });
  }

  _bindPointerEvents() {
    // =====================================================================
    // COURTSIM-FIX-I, Fix 2b -- THE FREEZE. IT IS A NATIVE TEXT SELECTION,
    // AND THE FIELD-TEST PHOTOS PROVE IT.
    //
    // THE FOUNDER'S REPORT: "it froze on me. I was dragging it around" /
    // "it's freezing, not letting me click anything" / "still frozen, not
    // letting me drag anything, or click, orbit, drag, reset view."
    //
    // THE EVIDENCE, not a theory. Dispatch photos "Screenshot (832).png" and
    // "Screenshot (834).png", both taken while he was reporting the freeze,
    // show the page's own TEXT rendered with a live selection highlight --
    // in 834 the words "around", "Zoom In (click scene)", "Zoom Out (click
    // scene)", "+", "-" and "Reset View" are all selected blue, i.e. one
    // selection range dragged straight across the toolbar; in 832 the
    // instruction paragraph under the canvas is selected the same way. That
    // is not a stalled renderer. That is the browser doing a text-selection
    // drag because nothing here ever told it not to.
    //
    // THE MECHANISM. This handler never called preventDefault(), so the
    // default action of a primary pointerdown -- begin selecting document
    // text -- ran on every drag. Worse, the two early returns below both fire
    // BEFORE setPointerCapture(), so in zoom mode (which 832 shows was
    // active: the "Zoom In (click scene)" button is lit and the status line
    // reads "zoom-in mode: click the scene") there was no capture, no
    // preventDefault and no drag state at all -- every drag in that mode was
    // a pure selection drag and nothing else. Once a selection is in
    // progress the browser owns the pointer, so clicks on the toolbar do not
    // land and the app is, from the outside, frozen.
    //
    // Fixed at the cause: suppress the default on every primary pointerdown
    // on the canvas INCLUDING in zoom mode, drop any selection the previous
    // build may already have left behind, and take the CSS touch-action out
    // of the browser's hands from JS (style.css belongs to another lane this
    // pass and is not edited).
    // =====================================================================
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      // Before any early return: this is the line whose absence was the
      // freeze. It must run in zoom mode too.
      e.preventDefault();
      const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
      if (this._zoomMode) return; // zoom-click takes priority over drag-start
      // =================================================================
      // COURTSIM-LOOK-049 -- IN LOOK MODE, A BUTTON PRESS CHANGES NOTHING.
      //
      // The pointer is already the head, whether or not a button is down, so
      // there is no second gesture to start here. This return is what keeps
      // the mode down to ONE SIGN: if the walk drag ran underneath, a drag
      // would grab-the-world (drag right -> room slides right, COURTSIM-FIX-W)
      // while the same motion as a hover turns the head the OTHER way, which
      // is exactly the "every time you have to rediscover how to move it
      // around" defect FIX-W existed to end. One mode, one meaning.
      //
      // preventDefault() above has already run, so the text-selection freeze
      // COURTSIM-FIX-I fixed cannot come back through this path either.
      // =================================================================
      if (this._look && this._look.isEnabled()) return;
      if (this._orbitMode) {
        // FREE-ORBIT-001 -- capture the CURRENT spherical angles (derived
        // from the real camera position, not a separately tracked value)
        // as this drag's own start point, so orbit composes correctly with
        // whatever zoom/dolly distance or preset was already active.
        const target = new THREE.Vector3(...this._currentTargetArray());
        const sph = this._sphericalFromPosition(this.camera.position, target);
        this._orbitDragState = {
          startX: e.clientX, startY: e.clientY,
          startRadius: sph.radius, startPitch: sph.pitch, startAzimuth: sph.azimuth,
          target,
        };
      } else {
        this._dragState = {
          startX: e.clientX, startY: e.clientY,
          startPos: this.camera.position.clone(),
          startTarget: new THREE.Vector3(...this._currentTargetArray()),
          // COURTSIM-FIX-W, DEFECT W-3 -- `dolly: e.shiftKey` IS REMOVED.
          //
          // FOUNDER: "if I do up and down, it's forward and backwards
          // sometimes... ONE convention, the same everywhere, no mode where
          // the axes swap meaning."
          //
          // Shift+vertical silently meaning "forward/back" IS a mode where
          // the vertical axis swaps meaning, and it was invisible: nothing
          // in the UI said Shift existed, so a Shift key held over from any
          // other interaction turned his next pan into a dolly with no
          // explanation. That is precisely "every time you have to
          // rediscover how to move it around."
          //
          // Nothing is lost. Range is owned by Zoom In / Zoom Out (click a
          // point), the +/- buttons and zoomStep(), all untouched. Vertical
          // drag is now vertical, always, in both drag modes.
        };
      }
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this._orbitDragState) {
        // FREE-ORBIT-001 -- horizontal drag rotates azimuth (yaw around the
        // target, all the way around -- "360, in all degrees"), vertical
        // drag rotates pitch (elevation), clamped near the poles so the
        // camera can never flip upside-down. This is a genuine look-around
        // orbit, not the walk below: the TARGET stays fixed and the camera
        // circles it, which is what actually lets the founder end up
        // "behind them, into the audience."
        const st = this._orbitDragState;
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        // =================================================================
        // COURTSIM-FIX-W, DEFECT W-2 -- BOTH ORBIT AXES WERE INVERTED
        // AGAINST THE PAN'S OWN STATED CONVENTION.
        //
        // FOUNDER, VERBATIM: "the controls with the orbit are just
        // ridiculous again... if I drag it up and down, now it's moving up
        // and down. But some places I'm dragging it side to side and it does
        // side to side. Or if I do up and down, it's forward and backwards
        // sometimes. It's not intuitive... every time you have to rediscover
        // how to move it around."
        //
        // THE CONVENTION, and it is now the ONLY one in this file:
        //
        //     GRAB THE WORLD. The point under the cursor follows the cursor.
        //     drag RIGHT -> the room slides RIGHT
        //     drag LEFT  -> the room slides LEFT
        //     drag UP    -> the room slides UP
        //     drag DOWN  -> the room slides DOWN
        //
        // COURTSIM-FIX-I already chose exactly that for the pan and wrote it
        // down in the branch below. ORBIT DID THE OPPOSITE ON BOTH AXES, and
        // that is arithmetic, not taste:
        //
        //   HORIZONTAL. Camera at +Z from the target, so azimuth = 0.
        //   x = target.x + r*cos(pitch)*sin(azimuth). The old line was
        //   `azimuth + dx*SENS`, so a rightward drag (dx > 0) raised azimuth
        //   and moved the CAMERA toward +X. For a camera looking down -Z,
        //   +X is camera-right -- and moving the camera right slides the
        //   world LEFT. Drag right, room goes left. Backwards.
        //
        //   VERTICAL. y = target.y + r*sin(pitch). The old line was
        //   `pitchDeg - dy*SENS`, so a downward drag (dy > 0) LOWERED the
        //   camera, which raises the subject in frame -- the room slides UP.
        //   Drag down, room goes up. Backwards.
        //
        // Both signs are flipped. Nothing else about the orbit changes: same
        // sensitivity, same pitch clamp, same radius clamp, same target.
        // =================================================================
        const azimuth = st.startAzimuth - dx * ORBIT_SENSITIVITY;
        // =================================================================
        // COURTSIM-CAMERA-003 -- the GEOMETRIC half of the pitch clamp (the
        // anatomical half is ORBIT_MIN/MAX_PITCH_DEG above; this takes the
        // tighter of the two).
        //
        // y on the orbit sphere is target.y + radius*sin(pitch), so the
        // pitch at which the camera meets a BOUNDS plane is exactly
        // asin((planeY - target.y) / radius). Clamping here rather than
        // letting _clampToBounds fix it up afterwards is the difference
        // between an orbit and a burrow: _clampToBounds only moves Y, so it
        // silently shortens the radius and walks the camera into whatever it
        // is looking at (measured: 3.8754 m -> 0.6966 m at the old -80 deg
        // limit). Clamped here, the sphere is never left, the radius is
        // genuinely constant, and the room stays put.
        //
        // asin's argument is clamped because a target closer to a bounds
        // plane than the radius is legal (the close-up presets sit that way)
        // and would otherwise produce NaN -- which would poison the position
        // and, through lookAt(), the whole view matrix.
        const asinClamped = (v) => Math.asin(THREE.MathUtils.clamp(v, -1, 1));
        const geoMinDeg = THREE.MathUtils.radToDeg(
          asinClamped((BOUNDS.yMin - st.target.y) / Math.max(st.startRadius, 1e-4)));
        const geoMaxDeg = THREE.MathUtils.radToDeg(
          asinClamped((BOUNDS.yMax - st.target.y) / Math.max(st.startRadius, 1e-4)));
        // Take the tighter limit on each side, then guard the degenerate case
        // where the two cross (a target outside BOUNDS on Y): lo must never
        // exceed hi or the clamp below would invert.
        const lo = Math.max(ORBIT_MIN_PITCH_DEG, Math.min(geoMinDeg, geoMaxDeg));
        const hi = Math.min(ORBIT_MAX_PITCH_DEG, Math.max(geoMinDeg, geoMaxDeg));
        const pitchDeg = THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(st.startPitch) + dy * THREE.MathUtils.radToDeg(ORBIT_SENSITIVITY),
          Math.min(lo, hi), Math.max(lo, hi),
        );
        // =================================================================
        const pitch = THREE.MathUtils.degToRad(pitchDeg);
        const radius = THREE.MathUtils.clamp(st.startRadius, ORBIT_MIN_RADIUS, ORBIT_MAX_RADIUS);
        const pos = this._positionFromSpherical(st.target, radius, pitch, azimuth);
        // Bounded so the camera can't end up inside a wall or outside the
        // room -- same _clampToBounds() every other movement path in this
        // file already uses (zoom dolly, walk-drag), not a new rule.
        const clamped = this._clampToBounds(pos);
        this.camera.position.copy(clamped);
        this.camera.lookAt(st.target.x, st.target.y, st.target.z);
        this._customPos = [clamped.x, clamped.y, clamped.z];
        this._customTarget = [st.target.x, st.target.y, st.target.z];
        // Fix 4 -- orbit holds the target fixed and swings the camera around
        // it, so the radius is nominally constant; but _clampToBounds() above
        // can shorten it without saying so when the arc would leave the room,
        // and ORBIT_MIN/MAX_RADIUS clamp it too. Re-derive from where the
        // camera ACTUALLY ended up rather than trusting the intended radius.
        //
        // COURTSIM-CAMERA-003 -- NAVIGATION, so the lens is HELD. This is the
        // exact call that made the room breathe: once per pointermove, and
        // CONTAIN converts every millimetre of D into degrees of fov. An
        // orbit now changes position and orientation and NOTHING ELSE.
        this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
        return;
      }
      if (!this._dragState) return;
      const dx = e.clientX - this._dragState.startX;
      const dy = e.clientY - this._dragState.startY;
      // =================================================================
      // COURTSIM-FIX-I, Fix 3 -- THE DRAG CONVENTION.
      //
      // THE FOUNDER'S REPORT: "the physics of it are so weird. It doesn't
      // let me drag it where I just drag easily and then follow it with the
      // mouse, because then it inverts it up and down" / "when I'm trying to
      // drag, it makes the difference of going up and down, or me dragging
      // forward. It doesn't do a good job of distinguishing that."
      //
      // He is describing two separate faults and both were real.
      //
      // FAULT 1 -- VERTICAL DRAG WAS NOT VERTICAL. The old code sent dy to
      // `forward`, which is explicitly flattened (`forward.y = 0`). Dragging
      // up therefore WALKED THE CAMERA INTO THE ROOM at constant height.
      // There was no elevation control on the drag at all, so "up and down"
      // was not merely inverted, it did not exist -- and because walking
      // forward makes everything in view slide down and outward, an upward
      // drag LOOKED like the scene dropping. That is the inversion he saw,
      // and it is also exactly "it makes the difference of going up and
      // down, or me dragging forward" -- one axis was doing both jobs.
      //
      // FAULT 2 -- THE HORIZONTAL SENSE WAS CAMERA-RELATIVE, NOT
      // WORLD-RELATIVE. `right` is (forward x worldUp), which for a camera
      // looking down -Z is +X, and the old code moved the camera along
      // +right for a rightward drag. Moving the CAMERA right slides the
      // WORLD left, so the scene ran away from the cursor. He asked for the
      // opposite: "drag easily and then follow it with the mouse."
      //
      // THE CONVENTION CHOSEN, STATED PLAINLY: GRAB-THE-WORLD. The point
      // under the cursor stays under the cursor.
      //   drag RIGHT -> the room slides right  (camera moves LEFT,  -right)
      //   drag LEFT  -> the room slides left   (camera moves RIGHT, +right)
      //   drag DOWN  -> the room slides down   (camera moves UP,    +worldY)
      //   drag UP    -> the room slides up     (camera moves DOWN,  -worldY)
      // Nothing is inverted relative to the hand, both axes are world axes,
      // and vertical is vertical.
      //
      // FORWARD/BACK IS NOT REMOVED, IT IS SEPARATED. It moves to SHIFT +
      // vertical drag, latched at pointerdown so one gesture can never be
      // both. Shift-drag DOWN pulls back, Shift-drag UP pushes in, which is
      // the same hand-follows-world sense as the pan. The dedicated Zoom
      // In / Zoom Out / +/- controls already in this file remain the primary
      // way to change range and are untouched.
      //
      // The camera's LOOK DIRECTION is still held fixed on every path here
      // (position and target take the same delta) -- rotating the view is
      // Orbit's job, in the branch above, and this stays a pure translation.
      // =================================================================
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const scale = 0.012; // drag-pixels -> world-units
      const moved = this._dragState.startPos.clone();
      // Grab-the-world pan, and now the ONLY thing a drag does in this
      // branch (COURTSIM-FIX-W, DEFECT W-3 removed the Shift dolly).
      // Both terms are NEGATED against the old code's horizontal term and
      // against the naive vertical one -- that sign is the whole of "follow
      // it with the mouse", and the orbit branch above now matches it.
      moved.addScaledVector(right, -dx * scale);
      moved.y += dy * scale;
      const clamped = this._clampToBounds(moved);
      const targetDelta = clamped.clone().sub(this._dragState.startPos);
      const newTarget = this._dragState.startTarget.clone().add(targetDelta);
      this.camera.position.copy(clamped);
      this.camera.lookAt(newTarget.x, newTarget.y, newTarget.z);
      this._customPos = [clamped.x, clamped.y, clamped.z];
      this._customTarget = [newTarget.x, newTarget.y, newTarget.z];
      // Fix 4 -- the walk moves position and target by the SAME delta, so the
      // distance is preserved and this is normally a no-op. It is called
      // anyway so that the invariant "every position mutation re-derives D"
      // holds without exception -- an audited no-op is safe; an unaudited
      // omission is how this defect happened in the first place.
      //
      // COURTSIM-CAMERA-003 -- NAVIGATION, so the lens is HELD. (This path
      // was already fov-neutral in the common case, since pos and target take
      // the same delta; it stops being fov-neutral the moment _clampToBounds
      // shortens one of them, which is exactly what happens against a wall.)
      this._rederiveActiveD(this._customPos, this._customTarget, { resolveFov: false });
    });
    const endDrag = (e) => {
      // Fix 2b -- release the capture we took. Browsers do release implicitly
      // on pointerup, but NOT reliably on pointercancel, and a capture left
      // held on the canvas swallows every subsequent click on it -- the same
      // "frozen, not letting me click anything" symptom by a second route.
      // Guarded because pointercancel can arrive for a pointer we never
      // captured (the zoom-mode path returns before setPointerCapture).
      try {
        if (e && e.pointerId !== undefined && this.canvas.hasPointerCapture &&
            this.canvas.hasPointerCapture(e.pointerId)) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      } catch (err) { /* pointer already gone -- nothing to release */ }
      if (this._orbitDragState) {
        this._orbitDragState = null;
        this._persist();
        return;
      }
      if (!this._dragState) return;
      this._dragState = null;
      this._persist();
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  getBounds() { return { ...BOUNDS }; }
}
