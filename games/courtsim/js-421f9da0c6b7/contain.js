
export function solveVFovDegrees(Rx, Ry, D, aspect) {
  const Y = Math.max(Ry / D, (Rx / D) / aspect);
  return 2 * Math.atan(Y) * (180 / Math.PI);
}
