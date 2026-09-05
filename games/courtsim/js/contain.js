// VIEWPORT-CONTAIN-001 -- the ONE fit-policy function, applied at exactly
// one place per engine (here: camera_controller.js is the only caller on
// the web build; camera_controller.gd's solve_vfov_deg() is its GDScript
// twin). Everything else in the codebase that used to set camera.fov to a
// static, aspect-blind number goes through this instead.
//
// Research doc COURTNEY-Core/reports/research/COURTSIM_VIEWPORT_FRAMING_001.md
// §10.2 Step 2, verbatim:
//   a      = cssWidth / cssHeight             // CSS pixels, never buffer pixels
//   Rx, Ry = half-extents of G at the fit plane, times the protection factor
//   Y      = max( Ry/D , (Rx/D)/a )            // CONTAIN
//   vfov   = 2 * atan(Y)                       // degrees for both engines
//
// CONTAIN (not plain Hor+/Vert-) because its failure direction is *revealing
// more room*, never amputating a subject -- the one property that matters
// when the guarantee is "all six people fully visible" (Rule 130).

/**
 * @param {number} Rx half-extent of the guarantee box G at the fit plane, X axis, world units, protection factor already applied
 * @param {number} Ry half-extent of the guarantee box G at the fit plane, Y axis, world units, protection factor already applied
 * @param {number} D  distance from the camera to the fit plane, world units
 * @param {number} aspect cssWidth / cssHeight -- CSS pixels, never buffer pixels
 * @returns {number} vertical field of view, in DEGREES
 */
export function solveVFovDegrees(Rx, Ry, D, aspect) {
  const Y = Math.max(Ry / D, (Rx / D) / aspect);
  return 2 * Math.atan(Y) * (180 / Math.PI);
}
