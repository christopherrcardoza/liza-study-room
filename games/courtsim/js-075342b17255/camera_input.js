// =========================================================================
// COURTSIM-LOOK-049 -- STATIONARY LOOK ("the camera is a head, not a crane")
//
// THE FOUNDER, VERBATIM:
//
//   "right now when we have orbit clicked in, that'll drag the room around.
//    But I want another version... I want it so THE CAMERA IS STATIONARY, BUT
//    IT CAN MOVE AND ROTATE FROM THE SPOT IT'S AT. Right now there's no way
//    to do that. It just drags you across the room."
//
//   "I move the mouse -- it would be like I'm moving my head as the camera."
//
//   "if the camera stays there and you put the mouse to the top of the
//    screen, it'll keep looking up and up, and then we'll have it stop at a
//    certain point. Same thing left and right, because a person's neck can
//    only turn so far. We'll have it go a little more than natural... so
//    yeah, let's just try full freedom of movement."
//
//   "you know what we could call the orbit? We could call it the stationary
//    orbit. Or the stationary movement."
//
// WHY THIS IS NOT A TWEAK TO ORBIT. Every camera mode this build has ever
// had moves the reporter's BODY through the room:
//
//   * the walk drag  -- translates position AND target by the same delta
//   * orbit          -- holds the TARGET still and swings the POSITION
//                       around it on a sphere. Circling a room is a crane
//                       shot. It is the opposite of turning your head.
//   * the zoom dolly -- translates along the view ray
//
// A court reporter sits in ONE seat and turns their head. This project has
// already measured what that costs.
//
// COURTSIM-TRACK-054 -- CORRECTED COUNT, AND IT IS CORRECTED AGAINST THE
// SOURCE TABLE RATHER THAN AGAINST THE PREVIOUS COMMENT. LOOK-049 wrote "the
// six speaking positions span 225.9 degrees". The arc is right; the count is
// SEVEN. COURTSIM_FIX_V_AURA.md's own bearing table, taken from the built
// reporter station with atan2(dx, dz) and relative to the seat's +10.05 deg
// aim, has seven rows -- and the jury box is a speaking position (a juror's
// question, and the foreperson's verdict), which is the one LOOK-049 dropped:
//
//     THE CLERK         -97.42      Counsel (Q)        -40.21
//     Counsel (named)   +40.21      jury box centre    +62.21
//     THE WITNESS       +70.66      bailiff            +87.13
//     THE COURT        +128.45
//
//     span = +128.45 - (-97.42) = 225.87 deg
//
// So NO fixed camera in that room can see all SEVEN -- and from the OLD
// reporter station the same seven spanned 249.9 deg, which is why moving the
// seat inward makes it worse rather than better. The locked lens is 55 deg
// vertical / about 66 deg horizontal at his aspect, so the occupied arc is
// more than three frames wide. Real reporters turn to look. This module is the
// only mode in the build where the camera's POSITION never changes at all.
//
// COURTSIM-CAMERA-003 §7 named this job and declined it, correctly, as out of
// its own scope: "Orbit cannot look down at the floor at all, before or
// after -- it always looks AT a fixed target, so tilting the view is not
// something this control can express. Turning orbit into a free-look is a
// much larger change than this job and needs his sign-off." This is that
// change, with his sign-off, as a SEPARATE mode. Orbit is untouched.
//
// =========================================================================
// THE LOCKED LENS IS SAFE BY ARITHMETIC, NOT BY CARE.
//
// COURTSIM-CAMERA-003 spent a whole job killing "the room stretches and snaps
// back", which was CONTAIN re-solving the field of view from a changing
// camera-to-target distance D on every single pointermove. The rule it left
// behind is that navigation must never re-solve the lens.
//
// This mode cannot change the lens even if that rule were broken, and that is
// structural rather than a promise:
//
//     target = position + direction(yaw, pitch) * R        R constant
//     D      = |target - position| = R                     for all yaw, pitch
//
// The look distance R is captured ONCE when the mode is entered (or
// re-anchored) and never changes while looking. So `_activeD` is not merely
// left alone, it is arithmetically incapable of moving. Rotation about a
// point does not change a radius. The controller is still told
// `{ resolveFov: false }` because that is the contract, but a bug in that
// flag could not reach the fov from here.
//
// And because the camera POSITION never changes, `_clampToBounds()` is never
// called and cannot engage -- which removes, by construction, the entire
// mechanism CAMERA-003 measured as the burrow (D 3.8754 m -> 0.6966 m, a
// 144.6-degree lens, "the ceiling starts to...").
// =========================================================================

// -------------------------------------------------------------------------
// THE INTERACTION, AND WHY IT IS ONE MECHANISM RATHER THAN TWO MODES.
//
// He described two things and the brief asked which should be the default:
//
//   (1) "it'll follow your mouse -- if your mouse moves left or right it'll
//        be like your head moving, or up and down"
//   (2) "put the mouse to the top of the screen, it'll keep looking up and up"
//
// These are usually built as two different controls: POSITION->ANGLE (move
// the mouse, the head turns that far, stop moving and it stops) and
// POSITION->RATE (the cursor is a joystick; hold it off-centre and the view
// keeps turning). They have opposite failure modes. Position->angle cannot
// reach behind you -- a screen only has so many pixels -- but it never drifts.
// Position->rate reaches anywhere but the view creeps whenever the cursor
// happens to sit off-centre, which is both the classic motion-sickness
// complaint and, worse for this founder specifically, a camera that appears
// to move on its own (COURTSIM-INTEGRATE-011: "a camera that moves on its own
// without saying why is indistinguishable from a broken one").
//
// THEY ARE THE SAME CONTROL IF YOU SPLIT THE SCREEN. Inside the canvas the
// cursor's offset from the centre maps DIRECTLY to a head angle, 1:1, no
// drift, no dead zone needed. In a narrow band at the very edge it ALSO adds
// a turn rate, which walks the neutral along -- so parking the cursor at the
// top keeps looking up, and bringing it back continues smoothly from wherever
// you got to. One rule, both sentences, nothing to click between.
//
// THE DEFAULT IS THEREFORE THE DIRECT MAPPING, and the edge band is the part
// that gives unlimited travel. That is the safe way round: the thing that
// happens when you are not asking for anything is nothing.
//
// THE SIGN, STATED PLAINLY, BECAUSE IT IS THE OPPOSITE OF THE OTHER MODES AND
// THAT IS DELIBERATE. COURTSIM-FIX-W settled one convention for this build:
// GRAB THE WORLD -- drag right, the room slides right. That convention is
// about a hand that has taken hold of something, and it still governs the
// walk drag and orbit, which are untouched.
//
// In this mode nothing is grabbed. The cursor is your gaze:
//
//     THE CAMERA LOOKS AT WHATEVER THE CURSOR IS POINTING AT.
//     cursor right -> you look right -> the room slides LEFT
//     cursor up    -> you look up    -> the room slides DOWN
//
// Which is what a head does, and what he asked for in those words. The point
// you put the cursor on travels toward the centre of the frame, so the
// control explains itself the first time it is used. Mixing the two
// conventions inside ONE mode is what "every time you have to rediscover how
// to move it around" was about, so this mode has exactly one sign and a drag
// does not mean something different from a hover -- there is no separate drag
// gesture here at all.
// -------------------------------------------------------------------------

// How far the head turns across the directly-mapped part of the canvas, in
// degrees, edge to edge. 120 across / 70 up-down is a comfortable seated head
// turn without leaning: real cervical rotation is about +-70 deg and the eyes
// add the rest, so a full sweep of the mouse across the window is roughly one
// real head turn. Everything past that is the edge band's job.
const LOOK_YAW_SPAN_DEG = 120;
const LOOK_PITCH_SPAN_DEG = 70;

// The outer fraction of each axis that is the edge band. 0.08 of the
// half-extent, i.e. the outermost 8% of the distance from centre to edge on
// each side, so on his 1061 x 832 canvas the band is about 42 px wide and
// 33 px tall -- reachable on purpose, hard to sit in by accident.
const LOOK_EDGE_BAND = 0.08;

// =========================================================================
// MOTION COMFORT. This is the number that makes people ill if it is wrong,
// so it is chosen rather than left at whatever felt fine while typing.
//
// Edge-driven rotation and head tracking both cause discomfort for some
// people when the view moves faster than the vestibular system expects from
// a movement the body did not make. The usual guidance for non-VR,
// seated, mouse-driven camera rotation is to keep sustained yaw rate under
// roughly 60-90 deg/s; above that a meaningful minority of people report
// discomfort within a minute, and comfort-first designs sit at the bottom of
// that band. 60 deg/s is the bottom of it: a full 360 sweep takes six
// seconds, which is slow enough to track by eye and fast enough that
// reaching the back wall is not a chore.
//
// IT IS A CONTROL, NOT A CONSTANT (Rule 111 as amended, and the brief asked
// for it by name): 15-150 deg/s on the slider beside the button, persisted,
// and the applied value is read back off this object rather than echoed from
// the input.
// =========================================================================
const LOOK_EDGE_RATE_DEFAULT_DEG_S = 60;
const LOOK_EDGE_RATE_MIN_DEG_S = 15;
const LOOK_EDGE_RATE_MAX_DEG_S = 150;

// The edge rate ramps in over this long rather than switching on. Two
// reasons, and the second is the one that matters: a cursor CROSSING the band
// on its way out to the toolbar would otherwise kick the view sideways, and
// an instantaneous start is itself a comfort problem. 250 ms means a quick
// exit through the band moves the view by a couple of degrees at most, while
// a cursor parked there reaches full rate almost at once.
const LOOK_EDGE_RAMP_MS = 250;

// =========================================================================
// THE LIMITS. "a person's neck can only turn so far... we'll have it go a
// little more than natural -- straight up, straight down -- but we can't have
// it look right behind. Well, we can have it look behind. So yeah, let's just
// try full freedom of movement."
//
// YAW: UNLIMITED. He landed on full freedom and said so. There is nothing to
// clamp -- the camera does not move, so there is no wall to end up inside and
// no bounds check to fail. Facing the back wall is just a yaw value.
//
// PITCH: +-75 DEGREES, and both halves of that number are load-bearing.
//
//   WHY NOT +-90 ("straight up"). three.js's Object3D.lookAt() builds the
//   view basis from the world up vector (0,1,0). At exactly +-90 the look
//   direction IS the up vector, the basis is degenerate, and the frame either
//   rolls arbitrarily or flips. That is the same reason the pre-CAMERA-003
//   orbit clamp stayed off the pole, and it is still a good reason. cos(75)
//   = 0.259, which is 15 degrees of margin -- comfortably conditioned.
//
//   WHY 75 IS ALREADY "STRAIGHT UP" IN PRACTICE, which is the part that makes
//   the compromise honest rather than a fudge. The lens is locked at 55
//   degrees vertical (NAV_VFOV_CEILING_DEG), so the half-field is 27.5
//   degrees. At pitch +75 the TOP EDGE of the frame is at
//
//       75.0 + 27.5 = 102.5 degrees
//
//   i.e. 12.5 degrees PAST the zenith. He can see straight up, with room to
//   spare, without the camera ever going through the pole. Straight down is
//   the same by symmetry. A clamp at 75 does not cost him the view he asked
//   for; it costs him only the part of the travel that would have broken the
//   frame.
//
// RECONCILING WITH COURTSIM-CAMERA-003's ORBIT CLAMP, RATHER THAN UNDOING IT.
// That lane clamped orbit to ORBIT_MIN_PITCH_DEG = -25 / ORBIT_MAX = +35 and
// gave two reasons. NEITHER transfers to this mode, and that is a structural
// argument, not a preference:
//
//   1. ITS GEOMETRIC REASON DOES NOT EXIST HERE. Orbit's pitch moves the
//      camera's POSITION on a sphere: y = target.y + radius*sin(pitch), so
//      pitching down drives the camera through the floor, _clampToBounds pins
//      y, the radius silently collapses and the lens blows out to 144 deg.
//      That was the burrow, and it was the real reason for the tight floor.
//      HERE PITCH MOVES NOTHING. The position is frozen; sin(pitch) appears
//      only in the TARGET. There is no floor to hit and no radius to collapse.
//
//   2. ITS ANATOMICAL REASON IS ABOUT A DIFFERENT ANGLE. -25/+35 are
//      sustained-posture limits describing where a CAMERA may STAND relative
//      to its subject ("a camera 80 deg below its subject is not a viewpoint
//      a person has"). This pitch is a GAZE angle from a fixed seat -- the
//      same quantity as a person glancing at the ceiling, which is a
//      transient movement with a much larger comfortable range and which he
//      explicitly asked to exceed a little.
//
// So ORBIT_MIN_PITCH_DEG / ORBIT_MAX_PITCH_DEG are untouched and still govern
// orbit. These are separate constants for a separate mode, and both remain
// true at the same time.
// =========================================================================
const LOOK_PITCH_MIN_DEG = -75;
const LOOK_PITCH_MAX_DEG = 75;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// =========================================================================
// COURTSIM-TRACK-054 -- WHICH HAND IS ON THE HEAD.
//
// Two inputs, one head (see the block in the constructor). A source owns the
// head until the other one produces movement the owner would not have made by
// accident. Three numbers decide that, and all three are about avoiding the
// same failure: a control stolen from under the person using it.
//
//   HOLD    how long an owner stays warm after its last real movement. While
//           it is warm the challenger needs a DELIBERATE movement, not a
//           twitch. 400 ms is about the gap between two mouse movements in
//           one continuous gesture, so a normal sweep never loses the head
//           mid-stroke.
//
//   the two STRONG thresholds are what "deliberate" means for each input.
//           A head is never perfectly still, so 3 degrees of turn; a mouse
//           picks up desk vibration, so 5% of the half-width, about 27 px on
//           his 1061 px canvas.
//
//   the two IDLE thresholds are the far smaller movement needed to reclaim a
//           head nobody currently holds.
// =========================================================================
const SOURCE_MOUSE = 'mouse';
const SOURCE_HEAD = 'head';
const SOURCE_HOLD_MS = 400;
const SOURCE_STRONG_HEAD_DEG = 3;
const SOURCE_STRONG_MOUSE_N = 0.05;
const SOURCE_IDLE_HEAD_DEG = 0.5;
const SOURCE_IDLE_MOUSE_N = 0.002;

// =========================================================================
// COURTSIM-TRACK-054 -- HEAD TRACKING, AND THE TWO DIFFERENT SIGNALS IT CAN
// RETURN. This block replaces LOOK-049's single webcam class.
//
// THE FOUNDER, VERBATIM:
//
//   "when you're in the reporter seat, can we make it so the camera tracks
//    your head movement -- so if you TURN TO THE LEFT, it sees you turn your
//    head to the left and it'll follow you."
//   "I want the head tracking now too."
//
// HE ASKED FOR ORIENTATION. LOOK-049 SHIPPED POSITION, AND SAID SO.
//
// Those are two different physical quantities and only one of them is the
// request:
//
//   POSITION (translation)  where the head IS in the room -- 3 numbers.
//   ORIENTATION (rotation)  which way the head POINTS      -- 3 numbers.
//
// A court reporter turning toward the witness does both at once, which is why
// LOOK-049's position tracker was a defensible first move. But "if you turn to
// the left, it sees you turn your head to the left" is the rotation, and no
// amount of position tracking is that signal.
//
// -------------------------------------------------------------------------
// CAN ORIENTATION BE RECOVERED FROM A CHEAP TRACKER? NO, AND THE REASON IS
// RANK, NOT EFFORT.
//
// The cheap tracker's entire output is ONE 2-D point per frame: the centroid
// of the pixels it thinks are a person. A centroid has two degrees of freedom.
// The head has six. Sliding the head 5 cm left and rotating it 15 deg left
// move that centroid the same way, so ONE centroid cannot tell them apart --
// not because the code is crude but because the measurement is rank
// deficient. Separating rotation from translation needs at least two features
// whose image motion differs between the two, and in practice that means
// facial landmarks: an eye-corner pair plus the nose tip, where the nose
// sticks out in front of the eye plane and therefore SWINGS when the head
// rotates but merely SLIDES when the head translates.
//
// That is measured in scratch/track054/probe.mjs section "identifiability"
// rather than asserted: a synthetic head is translated and rotated
// independently, and the cheap statistic's response to the two is shown to be
// collinear -- one number, two causes, no inverse.
//
// SO THERE ARE TWO PATHS, AND THEY ARE LABELLED HONESTLY ON THE CONTROL.
//
//   'lean'    ZERO DOWNLOAD. 32 x 24 luma foreground centroid, ~0.1 ms/frame
//             at 15 Hz. Returns a POSITION NUDGE. Works offline. This is
//             LOOK-049's tracker with its two real defects fixed (below).
//
//   'precise' TRUE HEAD ORIENTATION. MediaPipe Face Landmarker, imported
//             LAZILY from the CDN the build already uses for three.js and
//             pyodide, and ONLY when he ticks it. Returns yaw and pitch of
//             the skull.
//
// -------------------------------------------------------------------------
// THE DOWNLOAD COST OF 'precise', MEASURED FROM THE CDN'S OWN FILE LIST
// RATHER THAN ESTIMATED. LOOK-049 guessed "3 MB of WASM plus a 3-8 MB model".
// The real figures, from data.jsdelivr.com's flat file list for
// @mediapipe/tasks-vision@1.0.1 and from the GCS object metadata for the
// model:
//
//                                    uncompressed        ON THE WIRE
//     vision_bundle.mjs                 155,439 B          45,056 B
//     wasm/vision_wasm_internal.js      323,377 B          78,848 B
//     wasm/vision_wasm_internal.wasm 11,756,954 B       3,124,224 B
//     face_landmarker.task (float16)  3,758,596 B       3,758,596 B  (already
//     --------------------------------------------------------------  compressed)
//     TOTAL                          15,994,366 B       7,006,724 B
//                                    = 15.25 MiB        = 6.68 MiB
//
// THE WIRE COLUMN IS MEASURED, not estimated -- taken from the Resource Timing
// API in HIS OWN CHROME after actually importing the module on this machine
// (transferSize vs decodedBodySize). jsDelivr serves brotli and compresses the
// WASM 3.8x, which is why the honest number is less than half the tarball
// figure. The model's transferSize reads 0 because storage.googleapis.com
// sends no Timing-Allow-Origin header; its size is the GCS object metadata and
// a .task file is a zip, so it does not compress further.
//
// AND IT REALLY LOADS. Measured on his machine, cold cache, no camera:
//     import the bundle          477 ms
//     FilesetResolver             12 ms
//     FaceLandmarker.create    1,527 ms   (wasm + the 3.6 MB model + GPU init)
//     ---------------------------------
//     TOTAL COLD START         2,016 ms
// and the API shape is exactly what the pinned d.ts declares:
// detectForVideo / close / setOptions are all functions, and the result object
// carries faceLandmarks, faceBlendshapes and facialTransformationMatrixes.
//
// WHY IT IS STILL NOT THE DEFAULT. A lane measured 280 MB per cold-cache
// client as a real problem for a classroom on one wifi access point. 6.68 MB
// x 25 students is another 167 MB on the same access point, so this must never
// be on the default path -- and it is not: it is a dynamic import() behind a
// select, so a client that does not choose it downloads ZERO extra bytes and
// the page weight of this build is unchanged.
//
// AND IT NEEDS THE INTERNET, WHICH 'lean' DOES NOT. The model is served from
// storage.googleapis.com. A LAN-only classroom cannot use 'precise' at all.
// That is on the control too.
// =========================================================================

// --- the zero-download path -----------------------------------------------
const WEBCAM_GRID_W = 32;
const WEBCAM_GRID_H = 24;
const WEBCAM_BG_ALPHA = 0.02;      // background EMA -- ~50 frames (3 s at 15 Hz)
const WEBCAM_SMOOTH = 0.25;        // output smoothing; higher = snappier, jitterier
const WEBCAM_DEADZONE = 0.04;      // normalised head offset below which nothing moves
const WEBCAM_YAW_GAIN_DEG = 70;    // full-frame head excursion -> this much head turn
const WEBCAM_PITCH_GAIN_DEG = 40;
const WEBCAM_SAMPLE_MS = 66;       // 15 Hz. A 60 Hz render does not need 60 Hz of head.

// =========================================================================
// COURTSIM-TRACK-054 -- THE TWO DEFECTS IN LOOK-049's TRACKER, FOUND BY
// READING ITS OWN LOOP RATHER THAN BY TASTE, AND WHAT IS DONE ABOUT THEM.
//
// DEFECT 1: IT IS AN OPEN-LOOP INTEGRATOR THAT CANNOT COME BACK. `_raw` is
// written only when the frame difference is large enough to look like a
// person. Hold still and the background EMA absorbs you in ~3 s, the
// difference falls under the noise floor, the sample returns null -- and
// `_raw` KEEPS ITS LAST VALUE FOREVER. So a single bad frame (someone walks
// behind you, a light changes, you scratch your nose) pins the view at an
// angle it will never leave until the Centre button is pressed again. On a
// tracker this crude that is the worst failure mode there is, because it
// looks exactly like the "the camera moved on its own and won't come back"
// complaint this build has already been burned by.
//
//   FIX: a slow leak toward the calibrated centre, WEBCAM_LEAN_LEAK_S. A
//   nudge that is not being renewed decays to nothing over ~8 s. This is the
//   correct behaviour for a signal that is admittedly unreliable: it is a
//   NUDGE, not a pose, so it must not be able to hold the view hostage.
//   It also means holding a lean does creep back, which is stated on the
//   control -- and is exactly why 'precise' exists.
//
// DEFECT 2: A MOVING HAND STEERS THE HEAD. The centroid is taken over the
// whole frame, so a gesturing hand, a coffee cup or a passing colleague at
// the bottom of the shot pulls the "head" toward it.
//
//   FIX: weight the centroid toward the upper part of the frame, where a
//   seated person's head is, with WEBCAM_HEAD_BAND. Pixels below that are
//   still measured (they contribute to the noise gate) but contribute a
//   fraction of the weight.
// =========================================================================
const WEBCAM_LEAN_LEAK_S = 8;      // time constant of the decay back to centre
const WEBCAM_HEAD_BAND = 0.55;     // fraction of frame height treated as head space
const WEBCAM_HEAD_BAND_FLOOR = 0.15; // weight given to pixels below that band

// --- the landmark path ----------------------------------------------------
// Pinned, not @latest: a silent major bump in a dependency that is only
// exercised when a user ticks a box is a defect nobody would notice until a
// classroom.
const MP_VERSION = '1.0.1';
const MP_BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`;
const MP_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/'
  + 'face_landmarker/float16/1/face_landmarker.task';
const MP_BYTES = 15994366;        // uncompressed
const MP_WIRE_BYTES = 7006724;    // MEASURED over the wire in his own Chrome

// =========================================================================
// HOW YAW AND PITCH ARE RECOVERED FROM THE LANDMARKS, AND WHY IT IS DONE
// FROM GEOMETRY RATHER THAN FROM THE TASK'S 4x4 POSE MATRIX.
//
// FaceLandmarker will hand back facialTransformationMatrixes[0], a 4x4 that
// maps the canonical face into camera space. It is the obvious thing to use
// and it is NOT used here, for one reason: its convention is not verifiable
// from this machine. The declaration says `{ rows, columns, data: number[] }`
// and the proto defaults to column-major, but which axis is the model's
// forward, and therefore the SIGN of the yaw it implies, is a fact about
// Google's canonical mesh that I cannot check without running it against a
// known head pose. A head tracker with an inverted sign is not a small bug --
// LOOK-049 shipped exactly that bug in the mouse path and only caught it by
// projecting a known point. Getting it wrong twice would be a pattern.
//
// THE LANDMARK GEOMETRY HAS A SIGN I CAN DERIVE FROM FIRST PRINCIPLES:
//
//   The nose tip sticks out IN FRONT of the plane of the eyes. Rotate the
//   head and the nose tip SWINGS across the face; translate the head and the
//   nose tip and the eyes move TOGETHER. So the nose tip's offset from the
//   midpoint of the two outer eye corners, measured IN THE EYE LINE'S OWN
//   FRAME, is a rotation signal that translation cannot fake. That is the
//   rank argument at the top of this block, cashed out in three landmarks.
//
//   THE SIGN. The camera faces him and getUserMedia does NOT mirror. He turns
//   his head to HIS left; his left side faces the camera's right; his nose
//   tip therefore moves toward LARGER image x. In this module's head model
//   looking left is yaw INCREASING (see _map: cursor right, i.e. look right,
//   DECREASES yaw). So nose x up => yaw up, a PLUS sign, and it is derived
//   rather than tuned. Pitch: he tips his head UP, the nose tip rises in the
//   image, image y DECREASES, and looking up is pitch increasing -- so pitch
//   carries a MINUS. The two axes therefore have OPPOSITE signs and that
//   asymmetry is the thing to check first if it ever feels wrong.
//
//   ROLL IS CANCELLED EXACTLY, not approximately: the offset is projected
//   onto the eye-corner vector and its perpendicular, so tilting the head
//   rotates the measurement frame with it. Scale (how far he sits from the
//   camera) is cancelled by dividing by the eye-corner separation.
//
// LANDMARK INDICES. 1 = nose tip, 33 = outer corner of his RIGHT eye, 263 =
// outer corner of his LEFT eye, in MediaPipe's 468-point canonical mesh.
// Guarded by a length check so a future mesh change fails loudly rather than
// silently reading the wrong points.
//
// THE GAIN IS ANTHROPOMETRY, AND IT IS THE ONE NUMBER FIELD TESTING MAY NEED
// TO CHANGE. On an adult face the outer eye corners are about 90 mm apart and
// the nose tip stands about 22 mm in front of their plane, so the nose's
// swing is about 0.25 of the eye span per unit sine of yaw. Inverting that
// with asin() makes the reported angle approximately the real one near the
// centre and saturate gracefully at large turns, rather than running away.
// It is NOT a calibrated absolute pose and this file does not claim one: it
// is a baseline-relative angle with a stated gain.
// =========================================================================
const LM_NOSE_TIP = 1;
const LM_EYE_OUTER_R = 33;
const LM_EYE_OUTER_L = 263;
const LM_MIN_COUNT = 468;
// =========================================================================
// THE ANTHROPOMETRY, AND THE TWO INVERSIONS. BOTH INVERSIONS WERE WRONG IN THE
// FIRST VERSION OF THIS FILE AND THE PROBE FOUND BOTH, BY PROJECTING A
// SYNTHETIC HEAD OF KNOWN YAW AND PITCH THROUGH THE REAL ESTIMATOR AND
// COMPARING THE RECOVERED ANGLE WITH THE TRUTH (scratch/track054/probe.mjs,
// section L). Neither was visible by reading.
//
// The model, stated so it can be argued with: on an adult face the outer eye
// corners are about 90 mm apart, and the nose tip stands about 22 mm in FRONT
// of the plane through them and about 25 mm BELOW their line. Normalised by
// the eye span -- which is what makes the whole thing scale-free, so it does
// not matter how far he sits from the camera:
//
//     proud = 22/90 = 0.2444      low = 25/90 = 0.2778
//     R     = hypot(25, 22)/90 = 0.3702      rest angle = atan2(22, 25) = 41.35 deg
//
// YAW: atan, NOT asin. Under projection the nose tip's sideways travel is
// proud*sin(yaw) while the eye span itself FORESHORTENS to cos(yaw), so the
// normalised cue is proud*TAN(yaw). asin() measured 34.4 deg for a true 30 deg
// turn -- a 15% over-report that worsens with angle and needs a clamp to avoid
// blowing up past 40. atan() is the exact inverse of the geometry.
//
// PITCH: acos, and this one was a REAL BUG, not an inaccuracy. The nose tip is
// both proud AND low, so its vertical image offset is
//
//     across(pitch) = R * cos(pitch + 41.35 deg)
//
// -- a cosine, which is NOT MONOTONIC. Inverting it with atan (or asin) on the
// offset compressed the answer to 44% of the real angle AND, worse, the cue
// peaks at pitch = -41.35 deg and then comes back DOWN, so past about 41
// degrees of looking down the estimator REVERSED and the view would have
// started travelling back UP while he kept tipping his head further down.
// Measured: a true -80 deg tip reported -2.6 deg. acos() inverts the geometry
// exactly and recovers the true angle to the digit from -41 deg all the way up
// past +75.
//
// THE FOLD AT -41 DEG SURVIVES, because it is a property of the MEASUREMENT
// and not of the arithmetic: at that pitch the nose tip is at the extreme of
// its arc and one number cannot say which side of it you are on. So the
// reported pitch is clamped to the monotonic side, the limit is stated on the
// control, and the mouse -- which has the full +-75 -- is what covers looking
// further down than that. A court reporter glancing at a laptop transcript is
// nowhere near 41 degrees; someone looking into their own lap is.
// =========================================================================
const NOSE_PROUD_RATIO = 22 / 90;
const NOSE_LOW_RATIO = 25 / 90;
const NOSE_R_RATIO = Math.hypot(NOSE_LOW_RATIO, NOSE_PROUD_RATIO);
const NOSE_REST_DEG = Math.atan2(NOSE_PROUD_RATIO, NOSE_LOW_RATIO) / DEG;
// The monotonic side of the fold, with 1.5 deg of margin off the singularity.
const PRECISE_PITCH_MIN_DEG = -(NOSE_REST_DEG - 1.5);
const PRECISE_SMOOTH = 0.35;        // landmarks are steadier than a luma blob
const PRECISE_DEADZONE_DEG = 1.5;   // degrees of head turn that do nothing
const PRECISE_YAW_LIMIT_DEG = 85;   // saturate rather than wrap
const PRECISE_SAMPLE_MS = 66;       // 15 Hz, same budget as the cheap path
// =========================================================================
// detectForVideo() is SYNCHRONOUS -- it blocks the frame. On a machine already
// running three.js, sixteen avatars, a Whisper worker and Kokoro that is the
// real cost, not the download.
//
// MEASURED ON HIS MACHINE, 40 inferences on a blank 640x480 canvas with the
// GPU delegate: MEDIAN 7.75 ms, p95 13.03 ms. At the 15 Hz sample rate that is
// about 12% of one core, and because it is on the main thread it eats roughly
// half of one 60 Hz frame every fourth frame. A real face is MORE work than a
// blank frame, not less -- the landmark stage only runs when the detector
// finds something -- so treat 7.75 ms as a floor.
//
// The budget is 12 ms rather than 8 for a reason the measurement gave: at 8 ms
// the measured median sat right ON the threshold and the adaptive rate would
// have oscillated between 15 Hz and 10 Hz forever, which is worse than either.
// 12 ms is comfortably above the median and still inside a 60 Hz frame, so the
// back-off only fires when an inference is genuinely hurting the render.
const PRECISE_FRAME_BUDGET_MS = 12;
// THE FIRST inference is not like the others: measured at 5,874 ms, because
// that is when the GPU delegate compiles its shaders. Left on the critical
// path that is a six-second freeze the first time he turns his head, which
// would read as a hang. _loadLandmarker() therefore burns it deliberately on a
// blank canvas while the "downloading" note is still on screen.
const PRECISE_WARMUP_PX = 64;

const HEAD_OFF = 'off';
const HEAD_LEAN = 'lean';
const HEAD_PRECISE = 'precise';

// =========================================================================
// ONE CLASS OWNS THE CAMERA STREAM, BOTH TRACKERS SHARE IT.
//
// Two reasons this is not two classes. First, switching tracker must not
// re-prompt for the camera permission -- a second prompt in one session reads
// as a broken app. Second, the Centre button has to mean the same thing
// whichever tracker is running, so the baseline lives here, above both.
//
// !! THE CAMERA PERMISSION IS NOT TOUCHED BY THIS JOB EITHER. !!
// getUserMedia() is reached only from setMode(), setMode() is reached only
// from the radio buttons' own change handler, and nothing else in this build
// calls either. No automated path in this lane has been allowed to raise a
// camera prompt on his machine, so THE WEBCAM PATHS REMAIN UNVERIFIED AGAINST
// A REAL FACE and the report says so in those words.
// =========================================================================
class WebcamHead {
  constructor() {
    this.mode = HEAD_OFF;
    this.error = null;
    this.loading = false;
    this.stream = null;
    this.video = null;

    // shared calibration
    this._baseline = null;          // { a, b } in whichever tracker's units
    this._smooth = { a: 0, b: 0 };
    this._raw = { a: 0, b: 0 };
    this._fresh = false;            // did the current tracker see a head this sample
    this.seen = false;
    this._lastSampleMs = 0;
    this._lastEmit = { yawDeg: 0, pitchDeg: 0 };

    // lean path
    this._ctx = null;
    this._bg = null;
    this._detector = null;

    // precise path
    this._landmarker = null;
    this._mp = null;
    this._inferMs = 0;              // MEASURED, rolling
    this._warmupMs = null;          // the one-off shader compile, measured
    this._inferMax = 0;
    this._sampleMs = PRECISE_SAMPLE_MS;
    this._lastVideoTs = -1;
    this._faces = 0;
  }

  isActive() { return this.mode !== HEAD_OFF; }

  // Returns 'orientation' for the precise path and 'position' for the cheap
  // one. This is read back by diagnostics() and printed on the control,
  // because the difference between the two IS the founder's request and a UI
  // that blurs it would be the dishonest part.
  signalKind() {
    if (this.mode === HEAD_PRECISE) return 'orientation';
    if (this.mode === HEAD_LEAN) return this._detector ? 'position' : 'position';
    return 'none';
  }

  // ---- lifecycle --------------------------------------------------------

  // ONLY called from a real change on the radio group.
  async setMode(mode) {
    if (mode === this.mode) return true;
    if (mode === HEAD_OFF) { this.stop(); return true; }
    this.error = null;
    this.loading = true;
    try {
      if (!await this._openStream()) return false;
      if (mode === HEAD_PRECISE) {
        if (!await this._loadLandmarker()) return false;
      }
      // Switching tracker changes the UNITS of the signal, so the old
      // baseline is meaningless and must not be carried over -- carrying it
      // would show up as the view jumping the moment he changed the radio.
      this._resetCalibration();
      this.mode = mode;
      return true;
    } finally {
      this.loading = false;
    }
  }

  async _openStream() {
    if (this.stream && this.video) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.error = 'This browser has no camera API.';
      return false;
    }
    try {
      // The precise path wants more pixels than the luma blob does -- 480p is
      // the smallest size the landmark detector is reliable at, and it is
      // still a tenth of the pixels of a default 1080p capture.
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: false,
      });
    } catch (err) {
      this.error = (err && err.name === 'NotAllowedError')
        ? 'Camera permission was refused, so head tracking is off. The mouse still works.'
        : `The camera could not be opened (${(err && err.name) || 'unknown'}). The mouse still works.`;
      return false;
    }
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.srcObject = this.stream;
    try { await this.video.play(); } catch (e) { /* autoplay of a muted local stream */ }
    const c = document.createElement('canvas');
    c.width = WEBCAM_GRID_W; c.height = WEBCAM_GRID_H;
    this._ctx = c.getContext('2d', { willReadFrequently: true });
    this._bg = null;
    if (typeof window !== 'undefined' && typeof window.FaceDetector === 'function') {
      try { this._detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); }
      catch (e) { this._detector = null; }
    }
    return true;
  }

  // THE ONLY NETWORK FETCH THIS LANE ADDS, AND IT IS BEHIND HIS OWN CLICK.
  // Failure is reported in words on the control rather than thrown, because
  // the fallback ("the mouse still works") is genuinely fine.
  async _loadLandmarker() {
    if (this._landmarker) return true;
    try {
      const mp = this._mp || (this._mp = await import(/* @vite-ignore */ MP_BUNDLE));
      const fileset = await mp.FilesetResolver.forVisionTasks(MP_WASM_BASE);
      this._landmarker = await mp.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        // Both off on purpose. Blendshapes are 52 more numbers we do not read,
        // and the 4x4 pose matrix is the thing this file deliberately does not
        // trust (see the block above). Asking for neither is also less work
        // per frame on a machine that has none to spare.
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      this._sampleMs = PRECISE_SAMPLE_MS;
      // BURN THE SHADER COMPILE HERE. Measured at 5,874 ms for the first
      // detect() and ~8 ms for every one after it, so this is not a
      // micro-optimisation -- it is the difference between "it took a moment
      // to set up" and "the app hung for six seconds when I turned my head".
      try {
        const warm = document.createElement('canvas');
        warm.width = PRECISE_WARMUP_PX; warm.height = PRECISE_WARMUP_PX;
        const g = warm.getContext('2d');
        g.fillStyle = '#808080'; g.fillRect(0, 0, PRECISE_WARMUP_PX, PRECISE_WARMUP_PX);
        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this._landmarker.detectForVideo(warm, 1);
        this._warmupMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      } catch (e) { this._warmupMs = -1; }
      return true;
    } catch (err) {
      this._landmarker = null;
      this.error = 'Precise head tracking could not load'
        + (navigator && navigator.onLine === false ? ' -- this machine is offline.' : '.')
        + ' Lean tracking still works with no download, and the mouse always works.'
        + ` (${(err && err.message) ? String(err.message).slice(0, 120) : 'unknown'})`;
      return false;
    }
  }

  stop() {
    this.mode = HEAD_OFF;
    if (this.stream) { for (const t of this.stream.getTracks()) t.stop(); }
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    if (this._landmarker && typeof this._landmarker.close === 'function') {
      try { this._landmarker.close(); } catch (e) { /* already gone */ }
    }
    this._landmarker = null;
    this._ctx = null; this._bg = null; this._detector = null;
    this._resetCalibration();
  }

  _resetCalibration() {
    this._baseline = null;
    this._raw = { a: 0, b: 0 };
    this._smooth = { a: 0, b: 0 };
    this._lastEmit = { yawDeg: 0, pitchDeg: 0 };
    this.seen = false;
    this._faces = 0;
  }

  // "centre my head": whatever posture he is in right now becomes looking
  // straight ahead. Self-baselining is the only thing that makes either
  // tracker usable -- an absolute reading means nothing without it, and for
  // the landmark path it is what lets a stated anthropometric gain stand in
  // for a per-face calibration.
  centre() {
    this._baseline = { a: this._raw.a, b: this._raw.b };
    this._smooth = { a: 0, b: 0 };
  }

  // ---- sampling ---------------------------------------------------------

  // Returns { yawDeg, pitchDeg } offsets from the calibrated centre, or null
  // if there is nothing to say yet.
  sample(nowMs) {
    if (this.mode === HEAD_OFF || !this.video) return null;
    const period = this.mode === HEAD_PRECISE ? this._sampleMs : WEBCAM_SAMPLE_MS;
    if (nowMs - this._lastSampleMs < period) return this._lastEmit.valid ? this._lastEmit : this._emit(0);
    const dt = this._lastSampleMs ? (nowMs - this._lastSampleMs) / 1000 : 0;
    this._lastSampleMs = nowMs;
    if (this.video.readyState < 2) return this._emit(dt);
    this._fresh = false;
    const raw = this.mode === HEAD_PRECISE ? this._samplePrecise(nowMs) : this._sampleLean();
    if (raw) {
      this.seen = true;
      this._fresh = true;
      this._raw = raw;
      if (!this._baseline) this._baseline = { a: raw.a, b: raw.b };
    }
    return this._emit(dt);
  }

  _emit(dt) {
    if (!this._baseline) return null;
    // THE LEAK (defect 1 above) applies to the CHEAP path only. The landmark
    // path measures an absolute orientation every sample, so a stale reading
    // is not a stuck integrator -- and leaking it would fight a held head
    // turn, which is the whole point of that path.
    if (this.mode === HEAD_LEAN && !this._fresh && dt > 0) {
      const k = Math.exp(-dt / WEBCAM_LEAN_LEAK_S);
      this._raw = {
        a: this._baseline.a + (this._raw.a - this._baseline.a) * k,
        b: this._baseline.b + (this._raw.b - this._baseline.b) * k,
      };
    }
    const ta = this._raw.a - this._baseline.a;
    const tb = this._raw.b - this._baseline.b;
    const s = this.mode === HEAD_PRECISE ? PRECISE_SMOOTH : WEBCAM_SMOOTH;
    this._smooth.a += (ta - this._smooth.a) * s;
    this._smooth.b += (tb - this._smooth.b) * s;

    let out;
    if (this.mode === HEAD_PRECISE) {
      // _smooth holds DEGREES of skull rotation relative to the calibrated
      // posture -- the inversions are exact (see the anthropometry block), so
      // inverting first and subtracting the baseline afterwards is correct here
      // and is what makes a per-user rest posture cancel cleanly.
      // Deadzone in degrees, so it means the same thing regardless of how far
      // he sits from the camera.
      const dz = (v) => (Math.abs(v) < PRECISE_DEADZONE_DEG
        ? 0 : v - Math.sign(v) * PRECISE_DEADZONE_DEG);
      out = {
        yawDeg: clamp(dz(this._smooth.a), -PRECISE_YAW_LIMIT_DEG, PRECISE_YAW_LIMIT_DEG),
        // Asymmetric on purpose: see the fold at -41 deg. Down is the limited
        // direction; up is limited only by the head model's own +-75.
        pitchDeg: clamp(dz(this._smooth.b), PRECISE_PITCH_MIN_DEG, PRECISE_YAW_LIMIT_DEG),
      };
    } else {
      const dz = (v) => (Math.abs(v) < WEBCAM_DEADZONE ? 0 : v - Math.sign(v) * WEBCAM_DEADZONE);
      // The video is not mirrored, so a head moving to HIS left appears at
      // LARGER image x. Larger x must mean looking left, and looking left is
      // yaw increasing, so this is a PLUS -- the same derivation as the
      // landmark path, and the opposite of what LOOK-049 shipped. LOOK-049
      // negated here; that was consistent with nothing, because the mouse
      // path it was being added to already carries its own sign inside _map().
      // See scratch/track054/probe.mjs "webcam sign".
      out = {
        yawDeg: dz(this._smooth.a) * WEBCAM_YAW_GAIN_DEG,
        pitchDeg: -dz(this._smooth.b) * WEBCAM_PITCH_GAIN_DEG,
      };
    }
    out.valid = true;
    this._lastEmit = out;
    return out;
  }

  // ---- the landmark tracker (ORIENTATION) -------------------------------

  _samplePrecise(nowMs) {
    if (!this._landmarker) return null;
    // Feeding the same frame twice makes the task throw on a non-monotonic
    // timestamp, and a 15 Hz sample off a 15 Hz camera will land on a repeat.
    const ts = (this.video.currentTime * 1000) | 0;
    if (ts === this._lastVideoTs) return null;
    this._lastVideoTs = ts;
    let res;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    try { res = this._landmarker.detectForVideo(this.video, nowMs); }
    catch (e) { return null; }
    const cost = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    // MEASURED, and it defends itself: an inference that does not fit the
    // budget backs its own rate off instead of dropping the render's frame
    // rate. Capped at 4x the nominal period so it degrades to ~4 Hz rather
    // than to never.
    this._inferMs += (cost - this._inferMs) * 0.2;
    if (cost > this._inferMax) this._inferMax = cost;
    if (cost > PRECISE_FRAME_BUDGET_MS) {
      this._sampleMs = Math.min(this._sampleMs * 1.5, PRECISE_SAMPLE_MS * 4);
    } else if (this._sampleMs > PRECISE_SAMPLE_MS) {
      this._sampleMs = Math.max(this._sampleMs * 0.9, PRECISE_SAMPLE_MS);
    }
    const sets = res && res.faceLandmarks;
    this._faces = sets ? sets.length : 0;
    if (!sets || !sets.length) return null;
    const p = sets[0];
    if (!p || p.length < LM_MIN_COUNT) return null;
    const nose = p[LM_NOSE_TIP], er = p[LM_EYE_OUTER_R], el = p[LM_EYE_OUTER_L];
    if (!nose || !er || !el) return null;
    // The eye line IS the measurement frame, which is what cancels roll.
    let ex = el.x - er.x, ey = el.y - er.y;
    const span = Math.hypot(ex, ey);
    if (!(span > 1e-4)) return null;
    ex /= span; ey /= span;
    const mx = (el.x + er.x) / 2, my = (el.y + er.y) / 2;
    const dx = nose.x - mx, dy = nose.y - my;
    // ALONG the eye line (roll-free horizontal) and ACROSS it (roll-free
    // vertical), each normalised by the eye span, which cancels distance.
    const along = (dx * ex + dy * ey) / span;
    const across = (-dx * ey + dy * ex) / span;
    // THE TWO INVERSIONS. See the anthropometry block for why one is atan and
    // the other acos, and for the two measured bugs that produced them.
    //
    // THE SIGNS, derived rather than tuned, and they are OPPOSITE on the two
    // axes -- which is the first thing to check if it ever feels wrong:
    //   he turns his head to HIS LEFT -> his nose moves to LARGER image x ->
    //     `along` rises -> and looking left is yaw INCREASING, so PLUS.
    //   he tips his face UP -> his nose rises -> image y falls -> `across`
    //     falls -> acos of a smaller argument is a LARGER angle -> and looking
    //     up is pitch INCREASING, so the acos branch needs no negation at all.
    return {
      a: Math.atan(along / NOSE_PROUD_RATIO) / DEG,
      b: Math.acos(clamp(across / NOSE_R_RATIO, -1, 1)) / DEG - NOSE_REST_DEG,
    };
  }

  // ---- the luma tracker (POSITION) --------------------------------------

  // Returns the head's centre in normalised image coordinates, a and b each
  // roughly in [-1, 1]. THE ONE FUNCTION THE LANDMARK PATH REPLACES.
  _sampleLean() {
    // Path A -- native shape detection, zero download, a real face box. Still
    // POSITION only: a box has no orientation.
    if (this._detector) {
      this._detector.detect(this.video).then((faces) => {
        if (!faces || !faces.length) return;
        const b = faces[0].boundingBox;
        const vw = this.video.videoWidth || 640;
        const vh = this.video.videoHeight || 480;
        this._raw = {
          a: ((b.x + b.width / 2) / vw) * 2 - 1,
          b: ((b.y + b.height / 2) / vh) * 2 - 1,
        };
        this.seen = true;
        this._fresh = true;
        if (!this._baseline) this._baseline = { a: this._raw.a, b: this._raw.b };
      }).catch(() => { this._detector = null; });
      return null;
    }
    // Path B -- the luma foreground tracker. 768 pixels, no allocation after
    // the first frame, no model, no download.
    this._ctx.drawImage(this.video, 0, 0, WEBCAM_GRID_W, WEBCAM_GRID_H);
    let data;
    try { data = this._ctx.getImageData(0, 0, WEBCAM_GRID_W, WEBCAM_GRID_H).data; }
    catch (e) { return null; }   // tainted canvas -- cannot happen for a local stream
    const n = WEBCAM_GRID_W * WEBCAM_GRID_H;
    if (!this._bg) this._bg = new Float32Array(n);
    let sx = 0, sy = 0, sw = 0;
    let first = true;
    const bandRows = Math.max(1, Math.round(WEBCAM_GRID_H * WEBCAM_HEAD_BAND));
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      // Rec.601 luma, integer-ish and cheap.
      const g = (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114);
      const bg = this._bg[i];
      if (bg === 0) { this._bg[i] = g; continue; }
      first = false;
      const d = Math.abs(g - bg);
      this._bg[i] = bg + (g - bg) * WEBCAM_BG_ALPHA;
      // Anything under ~6/255 of difference is sensor noise, not a person.
      if (d > 6) {
        const row = (i / WEBCAM_GRID_W) | 0;
        // Defect 2: a gesturing hand at the bottom of the shot must not steer
        // the head. Head space gets full weight, everything below a fraction.
        const w = d * (row < bandRows ? 1 : WEBCAM_HEAD_BAND_FLOOR);
        const px = (i % WEBCAM_GRID_W) / (WEBCAM_GRID_W - 1) * 2 - 1;
        const py = row / (WEBCAM_GRID_H - 1) * 2 - 1;
        sx += px * w; sy += py * w; sw += w;
      }
    }
    if (first || sw < 40) return null;   // nothing moving that looks like a person
    return { a: sx / sw, b: sy / sw };
  }

  diagnostics() {
    return {
      mode: this.mode,
      active: this.isActive(),
      signal: this.signalKind(),
      error: this.error,
      loading: this.loading,
      path: this.mode === HEAD_PRECISE
        ? `mediapipe-face-landmarker@${MP_VERSION}`
        : (this.mode === HEAD_LEAN ? (this._detector ? 'FaceDetector-box' : 'luma-32x24') : 'none'),
      downloadBytes: this.mode === HEAD_PRECISE ? MP_BYTES : 0,
      downloadWireBytes: this.mode === HEAD_PRECISE ? MP_WIRE_BYTES : 0,
      warmupMs: this._warmupMs,
      headSeen: this.seen,
      faces: this._faces,
      calibrated: !!this._baseline,
      inferenceMs: +this._inferMs.toFixed(3),
      inferenceMaxMs: +this._inferMax.toFixed(3),
      sampleHz: +(1000 / (this.mode === HEAD_PRECISE ? this._sampleMs : WEBCAM_SAMPLE_MS)).toFixed(1),
      raw: { ...this._raw },
      smoothed: { ...this._smooth },
      out: { yawDeg: this._lastEmit.yawDeg || 0, pitchDeg: this._lastEmit.pitchDeg || 0 },
    };
  }
}

export const HEAD_TRACKING = {
  OFF: HEAD_OFF, LEAN: HEAD_LEAN, PRECISE: HEAD_PRECISE,
  preciseBytes: MP_BYTES,
  preciseWireBytes: MP_WIRE_BYTES,
  preciseVersion: MP_VERSION,
  preciseFrameBudgetMs: PRECISE_FRAME_BUDGET_MS,
  leakSeconds: WEBCAM_LEAN_LEAK_S,
};

// =========================================================================
export class StationaryLookInput {
  /**
   * @param {object} controller  the CameraController -- this module never
   *        touches camera.fov, camera.position or the CONTAIN solve itself;
   *        every write goes through controller.applyStationaryLook().
   * @param {HTMLCanvasElement} canvas
   */
  constructor(controller, canvas) {
    this.controller = controller;
    this.canvas = canvas;
    this.enabled = false;

    this._anchor = { x: 0, y: 0, z: 0 };
    this._R = 1;
    this._neutralYaw = 0;
    this._neutralPitch = 0;
    this._yaw = 0;
    this._pitch = 0;
    // Cursor position, normalised to [-1, 1] from the canvas centre. null
    // means the pointer is not over the canvas, which FREEZES the view --
    // reaching for a toolbar button must not turn your head.
    this._cursor = null;
    this._edgeHeldMs = 0;
    this._webcamOffset = { yawDeg: 0, pitchDeg: 0 };
    this._lastAppliedYaw = NaN;    // NaN !== NaN, so the first frame always applies
    this._lastAppliedPitch = NaN;

    // =====================================================================
    // COURTSIM-TRACK-054 -- ONE HEAD, TWO HANDS ON IT.
    //
    // "we want it to track the mouse too, the head to track the mouse. So if
    //  the person doesn't use their head, they can still use the mouse to move
    //  the head."
    //
    // He is explicit that the mouse is the fallback for anyone who does not
    // want the camera and that BOTH must exist. So there is exactly one head
    // model -- neutral + offset, clamped, in this object -- and the two inputs
    // are two ways of producing the SAME offset. Not two modes, not two
    // cameras, not two sets of limits. The pitch clamp, the yaw freedom, the
    // frozen anchor and the constant R are all downstream of the arbitration
    // and therefore identical whichever hand is on the head.
    //
    // WHY THE TWO OFFSETS ARE NOT SIMPLY ADDED, WHICH IS WHAT LOOK-049 DID.
    // Adding them means the resting cursor contributes a constant pull that
    // fights the head, and -- much worse -- the cursor parked in an edge band
    // keeps walking the neutral while he is using his head, so the view spins
    // forever for no reason he can see. Additive also makes the total range
    // the SUM of the two ranges, so the two inputs do not agree about where
    // "straight ahead" is. One head cannot have two neutrals.
    //
    // SO: LAST MOVED WINS, AND THE HANDOVER IS EXACTLY CONTINUOUS. The source
    // that most recently produced real movement owns the offset. At the
    // instant of a handover the outgoing source's offset is folded INTO the
    // neutral and the incoming source's is taken out of it, so the total angle
    // is bit-identical across the switch: the view does not move at all when
    // he takes his hand off the mouse and starts using his head, or the
    // reverse. That is the same arithmetic reanchor() already uses to make
    // entering the mode jump-free, applied to a different seam. Measured at
    // 0.000000 deg of jump in scratch/track054/probe.mjs.
    // =====================================================================
    this._source = SOURCE_MOUSE;
    this._headOffset = { yaw: 0, pitch: 0 };   // radians, from the tracker
    this._headMovedMs = 0;
    this._mouseMovedMs = 0;

    this.edgeRateDegS = LOOK_EDGE_RATE_DEFAULT_DEG_S;
    this.webcam = new WebcamHead();

    this._ui = null;
    this._toastTimer = null;
    this._bindPointer();
  }

  // ---- state ------------------------------------------------------------

  isEnabled() { return this.enabled; }

  setEdgeRate(degPerSec) {
    this.edgeRateDegS = clamp(Number(degPerSec) || LOOK_EDGE_RATE_DEFAULT_DEG_S,
      LOOK_EDGE_RATE_MIN_DEG_S, LOOK_EDGE_RATE_MAX_DEG_S);
    this._syncUi();
    return this.edgeRateDegS;
  }

  getRateRange() {
    return { min: LOOK_EDGE_RATE_MIN_DEG_S, max: LOOK_EDGE_RATE_MAX_DEG_S,
      value: this.edgeRateDegS, default: LOOK_EDGE_RATE_DEFAULT_DEG_S };
  }

  enable(opts = {}) {
    if (this.enabled) return;
    this.enabled = true;
    // ONE CONTROL, NOT THREE. His complaint was partly about the number of
    // buttons -- "I have to click through all of those buttons." Entering
    // this mode puts the other two away itself rather than making him do it.
    this.controller.setZoomMode(null);
    this.controller.setOrbitMode(false);
    this.reanchor();
    this._syncUi();
    if (opts.announce !== false) {
      this._toast('LOOK AROUND: on. Move the mouse to turn your head. Push to an edge to keep turning. H turns it off.');
    }
  }

  disable(opts = {}) {
    if (!this.enabled) return;
    this.enabled = false;
    this._cursor = null;
    this._edgeHeldMs = 0;
    this.canvas.style.cursor = '';
    this.controller.persistLookPose();
    this._syncUi();
    if (opts.announce !== false) this._toast('LOOK AROUND: off.');
  }

  toggle() { if (this.enabled) this.disable(); else this.enable(); }

  // COURTSIM-TRACK-054 -- the keyboard route to the tracker's baseline, so
  // ROOM ONLY (no toolbar, therefore no Centre button) can still fix a centre
  // that has drifted because he shifted in his chair. Toasts either way,
  // because in ROOM ONLY the toast is the only thing that can answer.
  centreHead() {
    if (!this.webcam.isActive()) {
      this._toast('HEAD TRACKING is off, so there is nothing to centre. Turn it on in the toolbar.');
      return false;
    }
    this.webcam.centre();
    // The tracker's baseline just moved, so its offset is about to become
    // zero. Fold the OLD offset into the neutral first, or the view snaps back
    // to the neutral by however far his head was off-centre -- the same class
    // of bug as the pointerleave snap below, and it would have been a very
    // visible one because re-centring is a deliberate act.
    if (this._source === SOURCE_HEAD) {
      this._neutralYaw += this._headOffset.yaw;
      this._neutralPitch += this._headOffset.pitch;
    }
    this._headOffset = { yaw: 0, pitch: 0 };
    this._webcamOffset = { yawDeg: 0, pitchDeg: 0 };
    this._toast(this.webcam.seen
      ? 'HEAD CENTRED. This posture is now looking straight ahead. The view did not move.'
      : 'No head found yet -- check the camera is not covered.');
    return true;
  }

  // Re-read the camera's real orientation and adopt it, without moving
  // anything. Called on entry, on pointer re-entry, and by the controller
  // after ANY external view entry (a preset click, Reset, a follow-speaker
  // glide, a restored session). The neutral is offset by the cursor's current
  // position so that adopting a new view never produces a jump: at this
  // instant the mapping reproduces exactly the angles the camera already has.
  reanchor() {
    const st = this.controller.getStationaryLookBasis();
    if (!st) return;
    this._anchor = st.pos;
    this._R = st.R;
    this._yaw = st.yaw;
    this._pitch = clamp(st.pitch, LOOK_PITCH_MIN_DEG * DEG, LOOK_PITCH_MAX_DEG * DEG);
    // COURTSIM-TRACK-054 -- the offset of the CURRENTLY OWNING SOURCE, so a
    // re-anchor that lands while he is head-tracking adopts the view against
    // his head rather than against a cursor he is not touching. With the mouse
    // owning the head this is bit-identical to what LOOK-049 did.
    const m = this._offsetOf(this._source);
    // The mapping is total = neutral + offset (see _apply), so the neutral
    // that REPRODUCES the angles the camera is holding right now is
    // total - offset. Deliberately NOT clamped: an exact adoption is what
    // makes "no jump" true, and the total is clamped at apply time anyway.
    // The edge accumulator below pulls an out-of-range neutral back in
    // without a snap.
    this._neutralYaw = this._yaw - m.yaw;
    this._neutralPitch = this._pitch - m.pitch;
    this._edgeHeldMs = 0;
    // The anchor and R have just changed, so the cached "nothing moved" test
    // in _apply() is stale even when the angles are unchanged. Invalidate it.
    this._lastAppliedYaw = NaN;
    this._lastAppliedPitch = NaN;
  }

  // ---- the mapping ------------------------------------------------------

  // Cursor offset -> head angle offset. `n` is normalised [-1, 1] from the
  // canvas centre. The inner region is scaled so that the START of the edge
  // band is already full deflection, which is what makes the two halves of
  // the control continuous: at the edge you are at maximum head turn AND
  // still turning.
  _map(n) {
    const inner = 1 - LOOK_EDGE_BAND;
    const ux = clamp(n.x / inner, -1, 1);
    const uy = clamp(n.y / inner, -1, 1);
    // THE SIGN. cursor right -> look right. Looking right means the gaze
    // acquires a -X component when facing +Z (screen-right is -X for a camera
    // looking down +Z with world up +Y), and dir.x = sin(yaw)cos(pitch), so
    // looking right is yaw DECREASING. Canvas y grows downward, so a cursor
    // above centre is uy < 0 and must raise the pitch -- hence the same
    // negation on both axes and the mapping is the same shape twice.
    return {
      yaw: -ux * (LOOK_YAW_SPAN_DEG / 2) * DEG,
      pitch: -uy * (LOOK_PITCH_SPAN_DEG / 2) * DEG,
    };
  }

  // =====================================================================
  // COURTSIM-TRACK-054 -- THE SHARED HEAD MODEL, IN THREE SMALL METHODS.
  // Everything above and below this point is common to both inputs; these
  // three are the only place the build knows there is more than one.
  // =====================================================================

  // The offset a given source is asking for RIGHT NOW, in radians, in the one
  // head model's own units. Both sources answer the same question and their
  // answers are interchangeable, which is what "one head model" means
  // concretely: the clamp, the anchor, the constant R and the persisted pose
  // downstream of here cannot tell which one produced the number.
  _offsetOf(src) {
    if (src === SOURCE_HEAD) {
      return { yaw: this._headOffset.yaw, pitch: this._headOffset.pitch };
    }
    return this._map(this._cursor || { x: 0, y: 0 });
  }

  // Hand the head over with the total angle EXACTLY unchanged: fold the
  // outgoing source's offset into the neutral and take the incoming source's
  // out of it. total = neutral + offset, so
  //     neutral' = neutral + out - in   =>   neutral' + in = neutral + out
  // and the two sides are the same float. No blend, no ease, no transient --
  // the view does not move at the moment of the switch, it simply starts
  // answering to the other hand. Measured: 0.000000 deg, both directions.
  _setSource(next) {
    if (next === this._source) return;
    const out = this._offsetOf(this._source);
    const inc = this._offsetOf(next);
    this._neutralYaw += out.yaw - inc.yaw;
    this._neutralPitch += out.pitch - inc.pitch;
    this._source = next;
    // The edge accumulator belongs to the mouse. Handing the head to the head
    // must not leave a half-charged ramp behind to kick in later.
    this._edgeHeldMs = 0;
  }

  // A source reports that it moved by `mag` (degrees for the head, normalised
  // canvas units for the mouse). See the SOURCE_* block for why there are two
  // thresholds per input rather than one.
  _claim(src, mag, nowMs) {
    const t = nowMs || 0;
    if (src === this._source) {
      if (mag >= (src === SOURCE_HEAD ? SOURCE_IDLE_HEAD_DEG : SOURCE_IDLE_MOUSE_N)) {
        if (src === SOURCE_HEAD) this._headMovedMs = t; else this._mouseMovedMs = t;
      }
      return;
    }
    const idle = src === SOURCE_HEAD ? SOURCE_IDLE_HEAD_DEG : SOURCE_IDLE_MOUSE_N;
    if (mag < idle) return;
    const ownerLast = this._source === SOURCE_HEAD ? this._headMovedMs : this._mouseMovedMs;
    const ownerWarm = t - ownerLast < SOURCE_HOLD_MS;
    const strong = src === SOURCE_HEAD ? SOURCE_STRONG_HEAD_DEG : SOURCE_STRONG_MOUSE_N;
    if (ownerWarm && mag < strong) return;
    if (src === SOURCE_HEAD) this._headMovedMs = t; else this._mouseMovedMs = t;
    this._setSource(src);
  }

  // ---- the frame tick ---------------------------------------------------

  // Driven from CameraController.updateGlide(), which scene.js's _animate()
  // already calls once per frame with a real dt. No new frame loop, no timer,
  // and nothing added to another lane's file.
  tick(dt) {
    if (!this.enabled) return;
    const step = Math.min(Math.max(dt || 0, 0), 0.1);   // a tab that was backgrounded must not lurch

    // --- the edge band: hold the cursor there and the head keeps turning ---
    // COURTSIM-TRACK-054 -- GATED ON THE MOUSE OWNING THE HEAD. A cursor
    // parked in an edge band while he is turning his head would otherwise walk
    // the neutral forever, so the room would spin for a reason he cannot see
    // and cannot stop without finding the mouse again. The edge band is the
    // MOUSE's way of reaching past the screen; it is not part of the head
    // model and it does not apply to a head, which can reach past the screen
    // by being a head.
    const c = this._source === SOURCE_MOUSE ? this._cursor : null;
    if (c) {
      const inner = 1 - LOOK_EDGE_BAND;
      const ex = Math.abs(c.x) > inner ? Math.sign(c.x) : 0;
      const ey = Math.abs(c.y) > inner ? Math.sign(c.y) : 0;
      if (ex || ey) {
        this._edgeHeldMs += step * 1000;
        const ramp = clamp(this._edgeHeldMs / LOOK_EDGE_RAMP_MS, 0, 1);
        const d = this.edgeRateDegS * DEG * step * ramp;
        // Yaw is unbounded -- "let's just try full freedom of movement."
        this._neutralYaw -= ex * d;
        // =============================================================
        // PITCH: THE NEUTRAL IS BOUNDED 35 DEGREES INSIDE THE HARD LIMIT,
        // AND THAT NUMBER IS THE HALF-SPAN OF THE DIRECT MAPPING.
        //
        // MEASURED BUG, found by the probe rather than by reading: clamping
        // the neutral to the same +-75 as the total left a 35-degree DEAD
        // BAND. Parking the cursor at the top edge drove the neutral to 75,
        // the mapping added its own +35, the total clamped back to 75 -- and
        // then moving the cursor all the way down to the centre changed
        // NOTHING, because 75 + 0 still clamps to 75. The probe caught it as
        // "pitch ceiling reached by parking at the top edge: 40.0000 deg".
        //
        // Bounding the neutral at +-(75 - 35) = +-40 instead makes the two
        // halves compose exactly: at the top edge 40 + 35 = 75, the limit is
        // reached precisely, and every cursor position in between still maps
        // to a distinct angle. No dead band, no wind-up, and the hard limit
        // is still the hard limit.
        //
        // `wasInside` is the no-snap guard. reanchor() may legitimately set a
        // neutral outside +-40 (a steeply-aimed preset adopted while the
        // cursor sits at an edge), and snapping it to 40 on the next edge
        // frame would be a visible jump of up to 25 degrees. So a neutral
        // that starts outside is only held to the HARD limit and is free to
        // travel back toward the range; once it is inside, it stays inside.
        // =============================================================
        const half = (LOOK_PITCH_SPAN_DEG / 2) * DEG;
        const lo = LOOK_PITCH_MIN_DEG * DEG, hi = LOOK_PITCH_MAX_DEG * DEG;
        const loN = lo + half, hiN = hi - half;
        const wasInside = this._neutralPitch >= loN && this._neutralPitch <= hiN;
        const np = this._neutralPitch - ey * d;
        this._neutralPitch = wasInside ? clamp(np, loN, hiN) : clamp(np, lo, hi);
      } else {
        this._edgeHeldMs = 0;
      }
    } else {
      this._edgeHeldMs = 0;
    }

    // --- the head tracker, if he has turned it on and granted the camera ---
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.webcam.isActive()) {
      const w = this.webcam.sample(now);
      if (w) {
        this._webcamOffset = w;
        const nextYaw = w.yawDeg * DEG, nextPitch = w.pitchDeg * DEG;
        // How far the HEAD asked to move since the last frame, in degrees.
        // This is the movement the arbitration judges -- not the absolute
        // angle, because a head held at 20 degrees is not asking for anything.
        const mag = Math.hypot(nextYaw - this._headOffset.yaw,
          nextPitch - this._headOffset.pitch) / DEG;
        this._headOffset = { yaw: nextYaw, pitch: nextPitch };
        this._claim(SOURCE_HEAD, mag, now);
      }
    } else if (this._headOffset.yaw !== 0 || this._headOffset.pitch !== 0) {
      // Turning the tracker off must not leave its last offset baked in, and
      // must not move the view either. Hand the head back to the mouse first
      // (which folds the head's offset into the neutral, so nothing moves),
      // THEN zero it.
      this._setSource(SOURCE_MOUSE);
      this._headOffset = { yaw: 0, pitch: 0 };
      this._webcamOffset = { yawDeg: 0, pitchDeg: 0 };
    }

    this._apply();
  }

  _apply() {
    // COURTSIM-TRACK-054 -- ONE offset, from whichever source owns the head.
    // LOOK-049 read the cursor here and ADDED the webcam on top; see the
    // constructor for why that cannot be right with two inputs.
    const m = this._offsetOf(this._source);
    // Keep the neutral finite over a long session without ever changing what
    // is on screen: a bare modulo of the total would jump, a modulo of the
    // neutral alone is invisible because the mapping is relative to it.
    if (this._neutralYaw > TAU || this._neutralYaw < -TAU) {
      this._neutralYaw = ((this._neutralYaw % TAU) + TAU) % TAU;
    }
    // total = neutral + offset. MEASURED BUG, caught by the probe: this read
    // `- m.yaw` / `- m.pitch`, which cancelled the negation already inside
    // _map() and inverted BOTH axes -- the cursor moved right and the camera
    // looked left. It passed the "entering the mode moves nothing" check
    // because reanchor() carried the same inverted sign, so the two were
    // consistently wrong and the entry was still jump-free. Only driving the
    // real handler and asking where a known world point LANDED found it.
    //
    // COURTSIM-TRACK-054 -- the webcam is no longer a THIRD term added here.
    // It is one of the two things `m` can be. The limits below therefore apply
    // identically to both inputs, which is the requirement: "make sure the two
    // inputs share one head model so behaviour is identical whichever drives
    // it." If this line could tell them apart, they would not.
    this._yaw = this._neutralYaw + m.yaw;
    this._pitch = clamp(this._neutralPitch + m.pitch,
      LOOK_PITCH_MIN_DEG * DEG, LOOK_PITCH_MAX_DEG * DEG);

    // PERFORMANCE, and it is a real saving rather than a reflex. Without this
    // the mode does a lookAt(), a hypot and two small array allocations on
    // EVERY frame the mode is armed, whether or not anything moved -- 60 Hz
    // of garbage for a camera sitting perfectly still. A cursor that is not
    // moving, an edge that is not held and a webcam that is off produce
    // bit-identical angles, so there is nothing to recompute. The founder is
    // performance-sensitive and this costs one comparison to avoid.
    if (this._yaw === this._lastAppliedYaw && this._pitch === this._lastAppliedPitch) return;
    this._lastAppliedYaw = this._yaw;
    this._lastAppliedPitch = this._pitch;

    const cp = Math.cos(this._pitch);
    const target = [
      this._anchor.x + this._R * Math.sin(this._yaw) * cp,
      this._anchor.y + this._R * Math.sin(this._pitch),
      this._anchor.z + this._R * Math.cos(this._yaw) * cp,
    ];
    // |target - anchor| == R for every yaw and pitch, so D is constant and
    // the locked lens cannot move. See this file's header.
    this.controller.applyStationaryLook(
      [this._anchor.x, this._anchor.y, this._anchor.z], target);
  }

  // ---- input ------------------------------------------------------------

  _bindPointer() {
    const norm = (e) => {
      const r = this.canvas.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 0, y: 0 };
      return {
        x: clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1),
        y: clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1),
      };
    };
    // pointermove rather than mousemove so a pen or a touch drag works the
    // same way, and NOT gated on a button being held -- the whole point is
    // that the head follows the mouse. A drag therefore does exactly what a
    // hover does, which is why this mode has one sign and no second gesture.
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const n = norm(e);
      const prev = this._cursor;
      // COURTSIM-TRACK-054 -- the mouse asks for the head here, and the size
      // of the ask is how far the cursor actually travelled. A pointermove
      // that moved nothing (they do happen) asks for nothing.
      const mag = prev ? Math.hypot(n.x - prev.x, n.y - prev.y) : SOURCE_STRONG_MOUSE_N;
      this._cursor = n;
      this._claim(SOURCE_MOUSE, mag,
        typeof performance !== 'undefined' ? performance.now() : Date.now());
    }, { passive: true });
    this.canvas.addEventListener('pointerenter', (e) => {
      if (!this.enabled) return;
      this._cursor = norm(e);
      // Adopt the current angles at the cursor's new position, so coming back
      // from the toolbar continues from where the view was left rather than
      // snapping to wherever the mapping happens to point.
      this.reanchor();
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (!this.enabled) return;
      // =================================================================
      // COURTSIM-TRACK-054 -- A REAL BUG IN LOOK-049, FOUND BY READING THIS
      // HANDLER AGAINST _apply() AND THEN MEASURED.
      //
      // LOOK-049 set `_cursor = null` here and left it there. But _apply()
      // falls back to _map({0,0}) when the cursor is null, i.e. to ZERO
      // offset -- so the total angle dropped to the bare neutral on the very
      // next frame. And you cannot leave the canvas WITHOUT passing through an
      // edge, where the offset is at its maximum. So every single time he
      // moved the mouse off the picture to click a toolbar button, the view
      // SNAPPED BACK by up to 60 degrees of yaw and 35 of pitch.
      //
      // LOOK-049's §5 measured "leaving the canvas freezes the view dead,
      // yaw -164.1342 -> -164.1342, bit-identical" and that measurement is
      // correct -- it was taken over the two seconds AFTER the pointer had
      // already gone, so it proves there is no DRIFT. It could not see the
      // one-frame jump at the moment of leaving, because it never sampled the
      // frame before. That is the exact shape of the mistake this project
      // keeps making: the right measurement pointed at the wrong instant.
      //
      // FIX: fold the offset into the neutral, which is the same arithmetic
      // as a source handover, so the total is unchanged and the freeze is a
      // real freeze. Measured before: 59.999 deg of yaw jump leaving at the
      // right-hand edge. After: 0.000000.
      // =================================================================
      const m = this._offsetOf(SOURCE_MOUSE);
      if (this._source === SOURCE_MOUSE) {
        this._neutralYaw += m.yaw;
        this._neutralPitch += m.pitch;
      }
      // FREEZE. The view stops dead when the pointer is not over the room --
      // unless the head is driving, in which case the pointer was never what
      // was moving it and leaving the picture must change nothing at all.
      this._cursor = null;
      this._edgeHeldMs = 0;
      // Rule 129 -- resume where he left off. This is the same moment orbit
      // and the walk drag persist (their pointerup), reached by the gesture
      // this mode actually has. Cheap and not chatty: one write when the
      // pointer leaves the room, not one per frame.
      this.controller.persistLookPose();
    });
    // A click in this mode must not start a text selection or a walk drag.
    // The controller's own pointerdown already calls preventDefault(); this
    // one only stops the click being interpreted as anything else.
    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this._cursor = norm(e);
    });
  }

  // ---- the UI this module owns (index.html only; main.js is another lane) -

  attachUi(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return;
    const btn = d.getElementById('look-mode-btn');
    const rate = d.getElementById('look-rate-slider');
    const rateOut = d.getElementById('look-rate-readout');
    const cam = d.getElementById('look-head-mode');
    const camNote = d.getElementById('look-webcam-note');
    const centreBtn = d.getElementById('look-webcam-centre');
    const toast = d.getElementById('look-toast');
    this._ui = { btn, rate, rateOut, cam, camNote, centreBtn, toast };

    if (btn) btn.addEventListener('click', () => this.toggle());
    if (rate) {
      rate.min = String(LOOK_EDGE_RATE_MIN_DEG_S);
      rate.max = String(LOOK_EDGE_RATE_MAX_DEG_S);
      rate.addEventListener('input', () => {
        this.setEdgeRate(Number(rate.value));
        this.controller.persistLookSettings();
      });
    }
    if (cam) {
      // THE ONLY PATH TO getUserMedia IN THIS MODULE, and it is his own choice
      // on this select. Nothing else in the build reaches setMode().
      cam.addEventListener('change', async () => {
        const want = cam.value;
        if (want === HEAD_PRECISE && camNote) {
          // A 15 MB download must announce itself BEFORE it starts, not after.
          camNote.textContent = `Downloading the face model once (${(MP_WIRE_BYTES / 1048576).toFixed(1)} MB, about 2 seconds on a good connection)...`;
        }
        this._syncUi();
        const ok = await this.webcam.setMode(want);
        if (!ok) {
          cam.value = this.webcam.mode;
          if (camNote) camNote.textContent = this.webcam.error || 'Head tracking could not start.';
        } else if (camNote) {
          camNote.textContent = want === HEAD_OFF ? ''
            : (want === HEAD_PRECISE
              ? 'Tracking the way your head POINTS. Sit how you mean to sit, then press Centre.'
              : 'Tracking where your head IS -- lean, do not swivel. Sit how you mean to sit, then press Centre.');
        }
        this.controller.persistLookSettings();
        this._syncUi();
      });
    }
    // COURTSIM-TRACK-054 -- routed through centreHead() rather than calling
    // webcam.centre() directly, so the button and Shift+H cannot diverge and
    // so the button also gets the fold that stops the view snapping.
    if (centreBtn) centreBtn.addEventListener('click', () => {
      this.centreHead();
      if (camNote) camNote.textContent = this.webcam.seen
        ? 'Centred. This posture is now looking straight ahead.'
        : 'No head found yet -- check the camera is not covered.';
    });
    this._syncUi();
  }

  _syncUi() {
    const u = this._ui;
    if (!u) return;
    if (u.btn) {
      u.btn.setAttribute('aria-pressed', String(this.enabled));
      // Rule 129 -- the control says what it currently IS, not what it does.
      u.btn.textContent = this.enabled
        ? 'Look Around: ON (H)'
        : 'Look Around (H)';
    }
    if (u.rate) u.rate.value = String(Math.round(this.edgeRateDegS));
    if (u.rateOut) u.rateOut.textContent = `${Math.round(this.edgeRateDegS)}°/s`;
    if (u.cam) {
      u.cam.value = this.webcam.mode;
      // See style.css: a <select>'s value is not an attribute, so the "the
      // camera is open" highlight has to be driven from here. Guarded because
      // _syncUi() runs from the CameraController's constructor: a cosmetic
      // attribute must not be able to throw and take the whole camera down
      // with it if the element is ever something other than a real <select>.
      if (u.cam.dataset) u.cam.dataset.head = this.webcam.mode;
      u.cam.disabled = this.webcam.loading;
    }
    if (u.centreBtn) u.centreBtn.disabled = !this.webcam.isActive();
    this.decorateStatus();
  }

  // #camera-status belongs to main.js (another lane). Called from the
  // controller's _notify() AFTER main.js has written it, so the one line that
  // tells him what the mouse currently does stays true without editing that
  // file. Idempotent: the marker test means repeated notifies cannot stack up
  // copies of the sentence.
  static STATUS_MARK = ' — LOOK AROUND';
  decorateStatus() {
    if (typeof document === 'undefined') return;
    const s = document.getElementById('camera-status');
    if (!s) return;
    const i = s.textContent.indexOf(StationaryLookInput.STATUS_MARK);
    const base = i >= 0 ? s.textContent.slice(0, i) : s.textContent;
    // COURTSIM-TRACK-054 -- WHICH HAND IS ON THE HEAD IS PART OF THE STATE, so
    // it is on the status line. With two inputs sharing one head, "why did the
    // view not do what I just asked" has exactly one answer and this is it.
    const who = this.webcam.isActive()
      ? (this._source === SOURCE_HEAD
        ? ' Your head is driving'
        : ' The mouse is driving (move your head to take it back)')
      : ' The mouse is your gaze;';
    s.textContent = this.enabled
      ? base + StationaryLookInput.STATUS_MARK
        + ': the camera stays where it is and turns its head.' + who
        + ' push to an edge to keep turning. H toggles.'
      : base;
  }

  // The toolbar is display:none in ROOM ONLY, which is the mode the founder
  // calls the real one -- so the button's own label cannot be the only place
  // the state is legible. This is the same reasoning COURTSIM-TITLES-027 used
  // for N and COURTSIM-LIGHTBOARD-035 used for the number keys, applied to
  // the ANSWER rather than to the shortcut: one line, over the room, for two
  // and a half seconds, and nothing on screen the rest of the time.
  _toast(text) {
    const el = this._ui && this._ui.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.classList.add('hidden'); }, 2500);
  }

  // Rule 130 -- read the real state back off the real object, computed fresh,
  // not a separately tracked value that could drift from what is on screen.
  diagnostics() {
    return {
      enabled: this.enabled,
      yawDeg: this._yaw / DEG,
      pitchDeg: this._pitch / DEG,
      neutralYawDeg: this._neutralYaw / DEG,
      neutralPitchDeg: this._neutralPitch / DEG,
      pitchLimitDeg: [LOOK_PITCH_MIN_DEG, LOOK_PITCH_MAX_DEG],
      yawLimit: 'none -- full 360',
      lookDistanceR: this._R,
      anchor: { ...this._anchor },
      cursor: this._cursor ? { ...this._cursor } : null,
      edgeRateDegS: this.edgeRateDegS,
      edgeHeldMs: this._edgeHeldMs,
      spanDeg: { yaw: LOOK_YAW_SPAN_DEG, pitch: LOOK_PITCH_SPAN_DEG },
      // COURTSIM-TRACK-054 -- the shared head model, read back rather than
      // tracked: `offsetDeg` is recomputed from the owning source on demand, so
      // it cannot disagree with what is on screen.
      source: this._source,
      offsetDeg: (() => {
        const m = this._offsetOf(this._source);
        return { yaw: m.yaw / DEG, pitch: m.pitch / DEG };
      })(),
      headOffsetDeg: { yaw: this._headOffset.yaw / DEG, pitch: this._headOffset.pitch / DEG },
      mouseOffsetDeg: (() => {
        const m = this._offsetOf(SOURCE_MOUSE);
        return { yaw: m.yaw / DEG, pitch: m.pitch / DEG };
      })(),
      webcam: this.webcam.diagnostics(),
    };
  }
}

export const LOOK_LIMITS = {
  pitchMinDeg: LOOK_PITCH_MIN_DEG,
  pitchMaxDeg: LOOK_PITCH_MAX_DEG,
  yawSpanDeg: LOOK_YAW_SPAN_DEG,
  pitchSpanDeg: LOOK_PITCH_SPAN_DEG,
  edgeBand: LOOK_EDGE_BAND,
  edgeRateDefaultDegS: LOOK_EDGE_RATE_DEFAULT_DEG_S,
  edgeRateMinDegS: LOOK_EDGE_RATE_MIN_DEG_S,
  edgeRateMaxDegS: LOOK_EDGE_RATE_MAX_DEG_S,
  edgeRampMs: LOOK_EDGE_RAMP_MS,
  // COURTSIM-TRACK-054 -- exported so the probe measures the shipped numbers
  // rather than its own copies of them.
  sourceHoldMs: SOURCE_HOLD_MS,
  sourceStrongHeadDeg: SOURCE_STRONG_HEAD_DEG,
  sourceStrongMouseN: SOURCE_STRONG_MOUSE_N,
  noseProudRatio: NOSE_PROUD_RATIO,
  noseLowRatio: NOSE_LOW_RATIO,
  noseRestDeg: NOSE_REST_DEG,
  precisePitchMinDeg: PRECISE_PITCH_MIN_DEG,
  preciseSampleMs: PRECISE_SAMPLE_MS,
  preciseSmooth: PRECISE_SMOOTH,
  leanSampleMs: WEBCAM_SAMPLE_MS,
  leanSmooth: WEBCAM_SMOOTH,
  leanLeakS: WEBCAM_LEAN_LEAK_S,
};
