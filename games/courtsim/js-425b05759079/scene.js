
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js';
import { createEventMatcher } from './proceedings.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/SSAOPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/OutputPass.js';

const LIPSYNC_PRESENTATION_GAIN = 1.6;


const LIPSYNC_TARGET_PEAK = 0.72;
const LIPSYNC_GAIN_MAX = 24.0;
const LIPSYNC_RAW_PEAK_FLOOR = LIPSYNC_TARGET_PEAK / LIPSYNC_GAIN_MAX;
const LIPSYNC_PEAK_DECAY = 0.995;
const LIPSYNC_GAIN_WARMUP_FRAMES = 15;
const LIPSYNC_PEAK_LIFETIME_FRAC = 0.60;
const LIPSYNC_JAW_MM_PER_UNIT = 15.02;
const LIPSYNC_OPENING_POSES = new Set([
  'jawOpen',
]);
const LIPSYNC_GAINED_PREFIXES = ['jaw', 'mouth'];
const LIPSYNC_UNGAINED_POSES = new Set(['mouthClose']);
const LIPSYNC_SKIP_POSES = new Set(['eyeBlinkLeft', 'eyeBlinkRight']);

const MOUTH_REST_IDLE_MS = 120;
const MOUTH_REST_MS = 180;


const FLOOR_Y = 0.0;
const CHAIR_RISE = 0.37;          // pos[1] offset that puts the legs on the support surface
const CHAIR_SEAT_H = 0.45;        // resulting seat-pan height above that surface (0.37 + 0.08)
const SEAT_PELVIS_LIFT = 0.06;
const SEAT_COLUMN_R = 0.16;
const SEAT_COLUMN_FWD = 0.02;
const SEAT_LIFT_MIN = 0.045;
const SEAT_LIFT_MAX = 0.230;
const CHAIR_ARM_DX = 0.235;      // arm cap centre, chair-local X
const CHAIR_ARM_DZ = 0.03;       // arm cap centre, chair-local Z
const CHAIR_ARM_TOP = 0.28;      // arm cap TOP face, above the chair group origin
const COUNSEL_TABLE_X = 2.00;    // |x| of both counsel tables and their chairs
const COUNSEL_SEAT_Z = 1.5;      // where counsel sit, behind their own table
const COUNSEL_TABLE_Z = 0.8;     // table centre z (UNCHANGED; here so it cannot drift)
const COUNSEL_TABLE_W = 2.0;     // table width  (UNCHANGED)
const COUNSEL_TABLE_D = 0.8;     // table depth  (UNCHANGED)
const COUNSEL_TOP_X0 = COUNSEL_TABLE_X - COUNSEL_TABLE_W / 2 - 0.03;
const COUNSEL_TOP_X1 = COUNSEL_TABLE_X + COUNSEL_TABLE_W / 2 + 0.03;
const COUNSEL_TOP_Z0 = COUNSEL_TABLE_Z - COUNSEL_TABLE_D / 2 - 0.03;
const COUNSEL_TOP_Z1 = COUNSEL_TABLE_Z + COUNSEL_TABLE_D / 2 + 0.03;

const CLERK_DESK_X = -5.50;
const CLERK_DESK_Z = -2.65;
const CLERK_DESK_W = 1.40;
const CLERK_DESK_D = 0.60;
const CLERK_DESK_TOP_Y = 0.80;
const CLERK_SEAT_Z = -2.12;
const CLERK_TOP_X0 = CLERK_DESK_X - CLERK_DESK_W / 2 - 0.03;   // -6.23
const CLERK_TOP_X1 = CLERK_DESK_X + CLERK_DESK_W / 2 + 0.03;   // -4.77
const CLERK_TOP_Z0 = CLERK_DESK_Z - CLERK_DESK_D / 2 - 0.03;   // -2.98
const CLERK_TOP_Z1 = CLERK_DESK_Z + CLERK_DESK_D / 2 + 0.03;   // -2.32

const COUNSEL_HAND_PROPS = {
  counsel_a: {
    L: { on: 'chair arm cap',  armrest: true },
    R: { on: 'tabletop (pen)', lift: 0,     pose: 'pen_hold', heldPen: 'casual' },
  },
  counsel_b: {
    L: { on: 'legal pad (writing)', lift: 0.008, pose: 'pen_hold', heldPen: 'write' },
    R: { on: 'laptop keyboard', lift: 0, pose: 'type_rest', typing: true,
      onSurface: 'CounselTableBTop',
      at: { x: 2.2179, z: 1.1185, y: 0.750 + 0.018 + 0.001 } },
  },
  clerk: {
    L: { on: 'docket terminal keyboard', lift: 0, pose: 'type_rest', typing: true,
      onSurface: 'ClerkDeskTop',
      at: { x: -5.80, z: -2.42, y: CLERK_DESK_TOP_Y + 0.018 + 0.003 } },
    R: { on: 'open minute book', lift: 0, pose: 'open_soft',
      onSurface: 'ClerkDeskTop',
      at: { x: -5.20, z: -2.44, y: CLERK_DESK_TOP_Y + 0.014 + 0.008 } },
  },
};
const REST_WRIST_LIFT = 0.086;
const SOUND_BLOCK_X = -0.20;
const SOUND_BLOCK_Z = -3.95;
const GAVEL_WRIST_ABOVE_WORKTOP = 0.1444;
const GAVEL_SHAFT_OFF_PALM = 0.016;
const REPORTER_X = -3.20;
const REPORTER_DESK_TOP_Y = 0.75;
const BENCH_PLATFORM_H = 0.49;
const BENCH_DESK_TOP_Y = 1.34;

const GAVEL_ELBOW_POLE_DOWN = -0.36;


const BENCH_Z_SHIFT = 0.95;
const WITNESS_PLATFORM_H = 0.28;
const WITNESS_RAIL_TOP = 1.13;
const JURY_TIER_FRONT_H = 0.25;
const JURY_TIER_BACK_H = 0.50;

const SEATS = {
  'THE CLERK':       { pos: [CLERK_DESK_X, FLOOR_Y, CLERK_SEAT_Z], seatY: FLOOR_Y + CHAIR_SEAT_H, role: 'clerk', label: 'THE CLERK' },
  'Counsel (Q)':     { pos: [-COUNSEL_TABLE_X, FLOOR_Y, COUNSEL_SEAT_Z], seatY: FLOOR_Y + CHAIR_SEAT_H, role: 'counsel_a', label: 'Counsel (Q)', chairArms: true },
  'THE COURT':       { pos: [0, BENCH_PLATFORM_H, -3.5], seatY: BENCH_PLATFORM_H + CHAIR_SEAT_H, role: 'judge', label: 'THE COURT', elevated: true, chairArms: true },
  'THE WITNESS':     { pos: [1.6, WITNESS_PLATFORM_H, -1.75], seatY: WITNESS_PLATFORM_H + CHAIR_SEAT_H, role: 'witness', label: 'THE WITNESS', elevated: true, chairArms: true },
  'Counsel (named)': { pos: [COUNSEL_TABLE_X, FLOOR_Y, COUNSEL_SEAT_Z], seatY: FLOOR_Y + CHAIR_SEAT_H, role: 'counsel_b', label: 'Counsel (named)', chairArms: true },
  'OTHER SPEAKERS':  { pos: [5.2, FLOOR_Y, -3.0], seatY: FLOOR_Y + CHAIR_SEAT_H, role: 'bailiff', label: 'OTHER SPEAKERS', faceYaw: 0 },
};

const WELL_FOCUS = [0, -0.5];        // roughly the middle of the well, between bench and bar
const JURY_ROW_X_FRONT = 5.94;
const JURY_ROW_X_BACK = 6.94;
const JURY_SIZE = 6;                 // 6 = shipped. 12 = a full jury.
const JURY_ROWS = 2;
const JURY_PER_ROW = JURY_SIZE / JURY_ROWS;
const JURY_SEAT_HALF = 0.26;
const JURY_SEAT_PITCH = JURY_SIZE <= 6 ? 0.80 : 0.60;
const JURY_SEAT_Z_CENTRE = -0.20;
function jurySeatZ(row, k) {
  return JURY_SEAT_Z_CENTRE
    + (k - (JURY_PER_ROW - 1) / 2) * JURY_SEAT_PITCH
    + (row === 1 ? JURY_SEAT_PITCH / 2 : 0);
}
const JURY_BOX_Z_MIN = JURY_SIZE <= 6 ? -1.75 : jurySeatZ(0, 0) - JURY_SEAT_HALF - 0.14;
const JURY_BOX_Z_MAX = JURY_SIZE <= 6 ? 1.35 : jurySeatZ(1, JURY_PER_ROW - 1) + JURY_SEAT_HALF + 0.14;
const JURY_RAIL_X = 5.23;            // rail slab centre; 0.12 thick -> outer face 5.17 (COURTSIM-SEATED-047: +0.72)
const JURY_BACK_X = 7.50;            // back panel centre; 0.12 thick -> outer face 7.56 (COURTSIM-SEATED-047: +0.84)
const JURY_RAIL_TOP = 1.05;          // cap height above the room floor -- chest height on a seated front-row juror
const JURY_BACK_TOP = 1.35;
const JURY_UPHOLSTERY = 0x2e2a2c;    // dark leather, per empty-jury-box-in-courtroom.webp

const GALLERY_BENCH_Z0 = 5.10;      // front row centre; back panel of row 2 lands 0.075 clear of the wall panelling
const GALLERY_BENCH_PITCH = 1.10;   // unchanged -- the row-to-row pitch was never the problem
const GALLERY_BENCH_Z = [0, 1, 2].map((i) => GALLERY_BENCH_Z0 + i * GALLERY_BENCH_PITCH);
const BAR_RAIL_Z = 3.60;            // slab centre; 0.12 thick -> gallery face 3.66, well face 3.54
const BAR_RAIL_TOP = JURY_RAIL_TOP; // 1.05 -- the bar and the jury box are the SAME height on purpose
const BAR_GATE_HALF = 0.64;         // slab ends; posts at +-0.60 give a 1.06 m clear gate, as the desktop build does
const DOOR_OPEN_W = 1.80;
const DOOR_OPEN_H = 2.70;
const DOOR_CASE_W = 0.15;
const DOOR_CASE_HALF_W = DOOR_OPEN_W / 2 + 0.006 + DOOR_CASE_W + 0.07;   // 1.126
const DOOR_CORNICE_TOP = DOOR_OPEN_H + DOOR_CASE_W + 0.18;        // 3.03
const ROLE_RETEXTURE = {
  spectator_7: {
    note: 'auburn redhead, complexion lightened -- so she stops reading as the '
      + 'blonde witness on the stand (COURTSIM-GAVEL-050 item 4)',
    bodyMap: 'assets/avatars_cast/redhead_spectator_7_body.png',
    headMap: 'assets/avatars_cast/redhead_spectator_7_head.png',
    opacityMap: 'assets/avatars_cast/redhead_spectator_7_opacity.png',
  },
};

const GALLERY_SPECTATORS = [
  { pos: [-2.55, FLOOR_Y, GALLERY_BENCH_Z[0]], seatY: 0.50, role: 'spectator_7', spectator: true },  // f009
  { pos: [ 1.30, FLOOR_Y, GALLERY_BENCH_Z[0]], seatY: 0.50, role: 'spectator_3', spectator: true },  // m015
  { pos: [-0.80, FLOOR_Y, GALLERY_BENCH_Z[2]], seatY: 0.50, role: 'spectator_1', spectator: true },  // m001
  { pos: [ 2.90, FLOOR_Y, GALLERY_BENCH_Z[2]], seatY: 0.50, role: 'spectator_8', spectator: true },  // f016
];

const JURY_ROLES = [
  'juror_1', 'juror_2', 'juror_3', 'juror_4', 'juror_5', 'juror_6',
  'spectator_2', 'spectator_4', 'spectator_9',   // m014, m019, f017 -- civilians
  'spectator_5', 'spectator_6',                  // m169 POLICE, m301 SPORTS KIT
  'spectator_7',                                 // f009 -- DUPLICATE of a gallery seat
];
const JURORS = (() => {
  const out = [];
  for (let k = 0; k < JURY_PER_ROW; k++) {
    for (let row = 0; row < JURY_ROWS; row++) {
      const tierH = row === 0 ? JURY_TIER_FRONT_H : JURY_TIER_BACK_H;
      out.push({
        pos: [row === 0 ? JURY_ROW_X_FRONT : JURY_ROW_X_BACK, tierH, jurySeatZ(row, k)],
        seatY: tierH + CHAIR_SEAT_H,
        role: JURY_ROLES[row * JURY_PER_ROW + k],
        chairArms: true,
      });
    }
  }
  return out.sort((a, b) => (a.pos[0] - b.pos[0]) || (a.pos[2] - b.pos[2]));
})();
if (JURY_SIZE === 6) {
  const EXPECTED = [
    [JURY_ROW_X_FRONT, -1.0, 'juror_1'], [JURY_ROW_X_FRONT, -0.2, 'juror_2'],
    [JURY_ROW_X_FRONT, 0.6, 'juror_3'], [JURY_ROW_X_BACK, -0.6, 'juror_4'],
    [JURY_ROW_X_BACK, 0.2, 'juror_5'], [JURY_ROW_X_BACK, 1.0, 'juror_6'],
  ];
  const bad = [];
  if (JURORS.length !== 6) bad.push(`count ${JURORS.length}`);
  else {
    JURORS.forEach((j, i) => {
      const [x, z, role] = EXPECTED[i];
      if (Math.abs(j.pos[0] - x) > 1e-9 || Math.abs(j.pos[2] - z) > 1e-9 || j.role !== role) {
        bad.push(`seat ${i}: got (${j.pos[0]}, ${j.pos[2]}, ${j.role}) want (${x}, ${z}, ${role})`);
      }
    });
  }
  if (Math.abs(JURY_BOX_Z_MIN + 1.75) > 1e-9 || Math.abs(JURY_BOX_Z_MAX - 1.35) > 1e-9) {
    bad.push(`box Z ${JURY_BOX_Z_MIN}..${JURY_BOX_Z_MAX} want -1.75..1.35`);
  }
  if (bad.length) {
    console.error('[courtsim] JURY_LAYOUT_REGRESSED at JURY_SIZE=6 -- the derived '
      + 'layout no longer reproduces the shipped six seats:', bad);
  }
} else {
  console.warn(`[courtsim] JURY_SIZE=${JURY_SIZE}: the jury box is built for ${JURY_SIZE} `
    + `at a ${JURY_SEAT_PITCH} m seat pitch, box Z ${JURY_BOX_Z_MIN.toFixed(2)}..${JURY_BOX_Z_MAX.toFixed(2)}. `
    + 'Seats 10 and 11 are a police uniform and sports kit, and seat 12 repeats a '
    + 'gallery identity -- see JURY_ROLES. This is not the shipped configuration.');
}

function ceilingFixtureGrid(v) {
  const xs = v.ceilingStyle === 'coffered' ? [-3, 0, 3] : [-4, 0, 4];
  const zs = v.ceilingStyle === 'coffered' ? [-2, 2, 6] : [-4, 0, 4];
  const out = [];
  for (const x of xs) for (const z of zs) out.push([x, z]);
  return out;   // always 9 entries, x-major
}

function yawToward(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

const DEFAULT_STANCE = {
  'THE CLERK': 'sit', 'Counsel (Q)': 'sit', 'THE COURT': 'sit',
  'THE WITNESS': 'sit', 'Counsel (named)': 'sit', 'OTHER SPEAKERS': 'stand',
};

export const VENUES = [
  {
    key: 'courtroom_a', type: 'courtroom', label: 'Courtroom A', subtitle: 'compact & modern',
    wallColor: 0xccc2a8, wainscotColor: 0x6b4a2f, wainscotHeight: 1.3,
    ceilingColor: 0xebe6dc, ceilingStyle: 'flat', floorColor: 0x54514a,
    carpetColor: 0x4d1f24, identityAnchor: 'seal', reporterSide: 'left',
  },
  {
    key: 'courtroom_b', type: 'courtroom', label: 'Courtroom B', subtitle: 'grand & traditional',
    wallColor: 0x38241a, wainscotColor: 0x261811, wainscotHeight: 4.2,
    ceilingColor: 0x523a21, ceilingStyle: 'coffered', floorColor: 0x4d2e1a,
    carpetColor: 0x471a1c, identityAnchor: 'in_god_we_trust', reporterSide: 'right',
  },
  {
    key: 'courtroom_c', type: 'courtroom', label: 'Courtroom C', subtitle: 'institutional mid-century',
    wallColor: 0xe6dcbd, wainscotColor: 0x8c6b42, wainscotHeight: 1.1,
    ceilingColor: 0xe0e0e0, ceilingStyle: 'recessed', floorColor: 0x616675,
    carpetColor: 0x5c6270, identityAnchor: 'scales', reporterSide: 'left',
  },
  {
    key: 'deposition_a', type: 'deposition', label: 'Deposition A', subtitle: 'glass-walled modern office',
    wallColor: 0xdbe3e8, glassWalls: true, tableColor: 0xb7996b, chairColor: 0x242426,
    floorColor: 0x948c80, ceilingColor: 0xf2f2f4, reporterSide: 'left',
  },
  {
    key: 'deposition_b', type: 'deposition', label: 'Deposition B', subtitle: 'enclosed conference room',
    wallColor: 0xc2baa8, glassWalls: false, tableColor: 0x59391f, chairColor: 0x484850,
    floorColor: 0x4c4852, ceilingColor: 0xe0dfd9, reporterSide: 'right',
  },
  {
    key: 'deposition_c', type: 'deposition', label: 'Deposition C', subtitle: 'law firm conference room',
    wallColor: 0x3d291a, glassWalls: false, bookshelfWall: true,
    tableColor: 0x2e1e14, chairColor: 0x4c231a,
    floorColor: 0x332417, ceilingColor: 0x4d3c2e, reporterSide: 'left',
  },
];

const DEPOSITION_SEATS = {
  'THE WITNESS':     { pos: [-1.6, FLOOR_Y, 1.0],  seatY: FLOOR_Y + CHAIR_SEAT_H, faceYaw: yawToward(-1.6, 1.0, 0, 0),  role: 'witness',   label: 'THE WITNESS', chairArms: true },
  'Counsel (Q)':     { pos: [1.6, FLOOR_Y, -1.0],  seatY: FLOOR_Y + CHAIR_SEAT_H, faceYaw: yawToward(1.6, -1.0, 0, 0),  role: 'counsel_a', label: 'Counsel (Q)', chairArms: true },
  'Counsel (named)': { pos: [-1.6, FLOOR_Y, -1.0], seatY: FLOOR_Y + CHAIR_SEAT_H, faceYaw: yawToward(-1.6, -1.0, 0, 0), role: 'counsel_b', label: 'Counsel (named)', chairArms: true },
};

const SEAT_PLATE_DEFAULT = {
  'Counsel (Q)': 'COUNSEL TABLE A',
  'Counsel (named)': 'COUNSEL TABLE B',
  'OTHER SPEAKERS': 'THE BAILIFF',
};
function seatPlateDefault(seatKey, def) {
  return SEAT_PLATE_DEFAULT[seatKey] || (def && def.label) || seatKey;
}

const WOOD_COLOR = 0x6b4a2f;
const WOOD_DARK = 0x4a3320;
const WALL_COLOR = 0x9e9480;
const CARPET_COLOR = 0x4d1f24;
const ROBE_COLOR = 0x141418; // matches courtroom_scene_builder.gd's _dress_the_court() robe recolor, Color(0.08,0.08,0.10)
const TALK_LIGHT_PEAK = 9.6;
const TALK_LIGHT_RAMP = 0.28; // seconds from off to full, and back
const TALK_LIGHT_RISE = 0.46;     // metres the source sits ABOVE the head
const TALK_LIGHT_BEHIND = 0.42;   // and BEHIND it, which is what keeps it off the face
const TALK_LIGHT_ANGLE = 0.62;    // radians, half-angle of the cone (35.5 deg)
const TALK_LIGHT_PENUMBRA = 0.80; // soft edge, so the cone is not a disc on the floor
const AVATAR_BASE_URL = 'assets/avatars_optimized_L2_keepnormals/';
const AVATAR_FALLBACK_URLS = [
  'assets/avatars_optimized/',
  'assets/avatars/',
];

function stdMaterial(opts) {
  const mat = new THREE.MeshStandardMaterial(opts);
  mat.dithering = true;
  return mat;
}

let _texCache = null;

let _maxAnisotropy = 1;
export function setSurfaceAnisotropy(n) {
  _maxAnisotropy = Math.max(1, Math.floor(n) || 1);
}

function _makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function _makeWoodGrainTexture() {
  const c = _makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b4b4b4';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 190; i++) {
    const y = Math.random() * 256;
    const dark = 0.78 + Math.random() * 0.34;
    const v = Math.max(0, Math.min(255, Math.round(180 * dark)));
    ctx.strokeStyle = `rgb(${v},${v},${v})`;
    ctx.lineWidth = 0.4 + Math.random() * 1.9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + (Math.random() - 0.5) * 9, 170, y + (Math.random() - 0.5) * 9, 256, y + (Math.random() - 0.5) * 5);
    ctx.stroke();
  }
  return c;
}

function _makeSpeckleTexture(base, spread) {
  const c = _makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(base + (Math.random() - 0.5) * spread)));
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function _normalFromHeight(sourceCanvas, strength) {
  const w = sourceCanvas.width, h = sourceCanvas.height;
  const src = sourceCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = _makeCanvas(w, h);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function _surfaceTextures() {
  if (_texCache) return _texCache;
  const woodC = _makeWoodGrainTexture();
  const clothC = _makeSpeckleTexture(150, 66);
  const plasterC = _makeSpeckleTexture(190, 22);
  const mk = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = _maxAnisotropy;
    return t;
  };
  _texCache = {
    woodMap: mk(woodC, true),
    woodRough: mk(woodC, false),
    woodNormal: mk(_normalFromHeight(woodC, 1.6), false),
    clothMap: mk(clothC, true),
    clothRough: mk(clothC, false),
    clothNormal: mk(_normalFromHeight(clothC, 2.4), false),
    plasterMap: mk(plasterC, true),
    plasterNormal: mk(_normalFromHeight(plasterC, 1.2), false),
  };
  return _texCache;
}

function _rep(tex, rx, ry) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  t.userData.sharedSurfaceTexture = true;
  return t;
}

function woodMaterial(color) {
  const T = _surfaceTextures();
  return stdMaterial({
    color,
    roughness: 0.75,
    metalness: 0.05,
    map: _rep(T.woodMap, 2, 2),
    roughnessMap: _rep(T.woodRough, 2, 2),
    normalMap: _rep(T.woodNormal, 2, 2),
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
}

function wallMaterial(color, roughness = 0.9) {
  const T = _surfaceTextures();
  return stdMaterial({
    color, roughness, metalness: 0.0,
    map: _rep(T.plasterMap, 6, 6),
    normalMap: _rep(T.plasterNormal, 6, 6),
    normalScale: new THREE.Vector2(0.18, 0.18),
  });
}

function clothMaterial(color, roughness = 0.92) {
  const T = _surfaceTextures();
  return stdMaterial({
    color, roughness, metalness: 0.0,
    map: _rep(T.clothMap, 10, 10),
    roughnessMap: _rep(T.clothRough, 10, 10),
    normalMap: _rep(T.clothNormal, 10, 10),
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
}

function chair(scene, pos, opts = {}) {
  const {
    facing = Math.PI,
    frameColor = WOOD_DARK,
    seatColor = null,     // null -> the old all-wood chair, unchanged
    armrests = false,
    name = 'Chair',
    slide = 0.32,
  } = opts;
  const frameMat = woodMaterial(frameColor);
  const padMat = seatColor === null ? frameMat : clothMaterial(seatColor, 0.55);

  const group = new THREE.Group();
  group.name = name;
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.y = facing + Math.PI;
  group.userData.__isChair = true;
  group.userData.__seatX = pos[0];
  group.userData.__seatZ = pos[2];
  group.userData.__slideX = -Math.sin(facing) * slide;
  group.userData.__slideZ = -Math.cos(facing) * slide;
  const addPart = (size, local, partName, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    mesh.position.set(local[0], local[1], local[2]);
    mesh.name = partName;
    group.add(mesh);
    return mesh;
  };

  addPart([0.42, 0.06, 0.42], [0, 0.05, 0], 'ChairSeat', padMat);
  addPart([0.4, 0.4, 0.06], [0, 0.25, 0.19], 'ChairBack', padMat);
  for (const [ox, oz] of [[0.17, 0.17], [-0.17, 0.17], [0.17, -0.17], [-0.17, -0.17]]) {
    addPart([0.04, 0.42, 0.04], [ox, -0.16, oz], 'ChairLeg', frameMat);
  }
  if (armrests) {
    for (const ox of [-CHAIR_ARM_DX, CHAIR_ARM_DX]) {
      addPart([0.05, 0.04, 0.34], [ox, CHAIR_ARM_TOP - 0.02, CHAIR_ARM_DZ], 'ChairArm', frameMat);
      addPart([0.04, 0.17, 0.05], [ox, 0.16, 0.16], 'ChairArmPost', frameMat);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), frameMat);
      nose.name = 'ChairArmNose';
      nose.scale.set(0.025, 0.030, 0.030);
      nose.position.set(ox, CHAIR_ARM_TOP - 0.030, CHAIR_ARM_DZ - 0.17 + 0.012);
      group.add(nose);
    }
  }
  scene.add(group);
  return group;
}

function paintTextSprite(canvas, ctx, text) {
  const PAD = 10;
  const label = String(text == null ? '' : text);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(20,20,24,0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let px = 26;
  ctx.font = `bold ${px}px sans-serif`;
  const avail = canvas.width - PAD * 2;
  while (px > 13 && ctx.measureText(label).width > avail) {
    px -= 1;
    ctx.font = `bold ${px}px sans-serif`;
  }
  ctx.fillStyle = '#e8e8ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2, avail);
}

function makeTextSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  paintTextSprite(canvas, ctx, text);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture, depthTest: false, depthWrite: false, transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 0.55, 1);
  sprite.userData.plate = { canvas, ctx, texture, text: String(text == null ? '' : text) };
  return sprite;
}

function setTextSpriteText(sprite, text) {
  const p = sprite && sprite.userData && sprite.userData.plate;
  if (!p) return false;
  const next = String(text == null ? '' : text);
  if (next === p.text) return false;
  paintTextSprite(p.canvas, p.ctx, next);
  p.text = next;
  p.texture.needsUpdate = true;
  return true;
}

function box(scene, size, pos, material, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.position.set(pos[0], pos[1], pos[2]);
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

function desk(scene, size, pos, material, namePrefix) {
  const [w, h, d] = size;
  const group = new THREE.Group();
  group.name = namePrefix;
  const topThickness = Math.min(0.06, h * 0.18);
  const overhang = 0.03;
  const legSize = 0.06;
  const apronInset = 0.055;
  const apronHeight = h * 0.5;
  const legHeight = h - topThickness;

  const addPart = (partSize, localPos, partName) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(partSize[0], partSize[1], partSize[2]), material);
    mesh.position.set(localPos[0], localPos[1], localPos[2]);
    mesh.name = partName;
    group.add(mesh);
  };

  addPart([w + overhang * 2, topThickness, d + overhang * 2], [0, h / 2 - topThickness / 2, 0], `${namePrefix}Top`);
  addPart([w - apronInset * 2, apronHeight, 0.04],
    [0, h / 2 - topThickness - apronHeight / 2, -d / 2 + apronInset + 0.02], `${namePrefix}Apron`);

  const legInsetX = w / 2 - legSize;
  const legInsetZ = d / 2 - legSize;
  for (const [ox, oz] of [[legInsetX, legInsetZ], [-legInsetX, legInsetZ], [legInsetX, -legInsetZ], [-legInsetX, -legInsetZ]]) {
    addPart([legSize, legHeight, legSize], [ox, h / 2 - topThickness - legHeight / 2, oz], `${namePrefix}Leg`);
  }

  group.position.set(pos[0], pos[1], pos[2]);
  scene.add(group);
  return group;
}

const _AXIS_X = new THREE.Vector3(1, 0, 0);
const _AXIS_Y = new THREE.Vector3(0, 1, 0);
const _scratchQuat = new THREE.Quaternion();
const _scratchQuat2 = new THREE.Quaternion();

const PEN_LEN_M = 0.145;          // a ballpoint is 135-145 mm; measured against the hand below
const PEN_R_M = 0.0052;           // 10.4 mm across the barrel

let _laptopDeckTexture = null;
function makeLaptopDeckTexture() {
  if (_laptopDeckTexture) return _laptopDeckTexture;
  const W = 512, H = 340;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#26282c'; c.fillRect(0, 0, W, H);          // the deck
  const wellX = 26, wellY = 16, wellW = W - 52, wellH = 176;
  c.fillStyle = '#17191c'; c.fillRect(wellX, wellY, wellW, wellH);
  const key = (x, y, w, h) => {
    c.fillStyle = '#34383e';
    c.fillRect(x, y, w - 2, h - 2);
    c.fillStyle = '#41464d';
    c.fillRect(x, y, w - 2, 2);                              // a lit top bevel
  };
  const rows = [
    { y: wellY + 4, h: 18, n: 14, pad: 0 },
    { y: wellY + 26, h: 30, n: 14, pad: 0 },
    { y: wellY + 58, h: 30, n: 13, pad: 10 },
    { y: wellY + 90, h: 30, n: 12, pad: 16 },
    { y: wellY + 122, h: 30, n: 11, pad: 24 },
  ];
  for (const r of rows) {
    const usable = wellW - 8 - r.pad;
    const kw = usable / r.n;
    for (let i = 0; i < r.n; i++) key(wellX + 4 + r.pad + i * kw, r.y, kw, r.h);
  }
  const by = wellY + 154, bh = 18;
  let bx = wellX + 4;
  for (const w of [30, 24, 24]) { key(bx, by, w, bh); bx += w; }
  key(bx, by, 150, bh); bx += 150;
  for (const w of [24, 24]) { key(bx, by, w, bh); bx += w; }
  key(bx, by, 22, bh / 2); key(bx, by + bh / 2, 22, bh / 2); bx += 22;
  key(bx, by + bh / 2, 22, bh / 2); bx += 22;
  key(bx, by + bh / 2, 22, bh / 2);
  const tw = 150, tht = 96, tx = (W - tw) / 2, ty = wellY + wellH + 16;
  c.fillStyle = '#2c2f34'; c.fillRect(tx, ty, tw, tht);
  c.strokeStyle = '#3c4148'; c.lineWidth = 2;
  c.strokeRect(tx + 1, ty + 1, tw - 2, tht - 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = _maxAnisotropy;
  _laptopDeckTexture = tex;
  return tex;
}

function makePenMesh(name) {
  const L = PEN_LEN_M;
  const R = PEN_R_M;
  const barrelMat = stdMaterial({ color: 0x14285c, roughness: 0.22, metalness: 0.35 });
  const trimMat = stdMaterial({ color: 0xc08a5e, roughness: 0.25, metalness: 0.85 });
  const gripMat = stdMaterial({ color: 0x10203f, roughness: 0.62, metalness: 0.12 });
  const g = new THREE.Group();
  g.name = name;
  const add = (geo, mat, y, partName, rotZ) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    if (rotZ) mesh.rotation.z = rotZ;
    mesh.name = partName;
    mesh.castShadow = false;
    g.add(mesh);
    return mesh;
  };
  const yNib = -L / 2;
  const CONE_H = 0.016;
  const GRIP_H = 0.030;
  const BAND_H = 0.0045;
  const CAP_H = 0.040;
  add(new THREE.SphereGeometry(0.0011, 6, 5), trimMat, yNib + 0.0009, 'PenBall');
  add(new THREE.CylinderGeometry(R * 0.86, 0.0013, CONE_H, 12), trimMat,
    yNib + CONE_H / 2, 'PenTip');
  add(new THREE.CylinderGeometry(R * 0.99, R * 0.86, GRIP_H, 12), gripMat,
    yNib + CONE_H + GRIP_H / 2, 'PenGrip');
  add(new THREE.CylinderGeometry(R * 1.06, R * 1.06, BAND_H, 12), trimMat,
    yNib + CONE_H + GRIP_H + BAND_H / 2, 'PenCentreBand');
  const barrelBottom = yNib + CONE_H + GRIP_H + BAND_H;
  const barrelH = L - CONE_H - GRIP_H - BAND_H - CAP_H;
  add(new THREE.CylinderGeometry(R, R * 0.90, barrelH, 12), barrelMat,
    barrelBottom + barrelH / 2, 'PenBarrel');
  const capBottom = barrelBottom + barrelH;
  add(new THREE.CylinderGeometry(R * 1.02, R * 1.02, CAP_H * 0.72, 12), trimMat,
    capBottom + CAP_H * 0.36, 'PenCap');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 12, 8), trimMat);
  dome.scale.y = 1.3;
  dome.position.y = capBottom + CAP_H * 0.72;
  dome.name = 'PenCapDome';
  g.add(dome);
  const CLIP_L = 0.036;
  const clipX = R * 1.30;
  const clipTop = capBottom + CAP_H * 0.60;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.0034, CLIP_L, 0.0016), trimMat);
  blade.position.set(clipX, clipTop - CLIP_L / 2, 0);
  blade.rotation.z = THREE.MathUtils.degToRad(1.5);
  blade.name = 'PenClip';
  g.add(blade);
  const shoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.0034, 0.0075, R * 0.9), trimMat);
  shoulder.position.set(clipX * 0.72, clipTop - 0.0015, 0);
  shoulder.name = 'PenClipShoulder';
  g.add(shoulder);
  const nub = new THREE.Mesh(new THREE.SphereGeometry(0.0021, 7, 6), trimMat);
  nub.scale.set(1, 0.7, 0.55);
  nub.position.set(clipX, clipTop - CLIP_L, 0);
  nub.name = 'PenClipNub';
  g.add(nub);
  for (const c of g.children) c.castShadow = false;
  return g;
}

const _lifeQuat = new THREE.Quaternion();

const _gvC = new THREE.Vector3();
const _gvA = new THREE.Vector3();
const _gvU = new THREE.Vector3();
const _gvS = new THREE.Vector3();
const _gvQ = new THREE.Quaternion();

const _pinS = new THREE.Vector3();
const _pinT = new THREE.Vector3();
const _pinU = new THREE.Vector3();
const _pinP = new THREE.Vector3();
const _pinE = new THREE.Vector3();
const _pinD = new THREE.Vector3();
const _pinD2 = new THREE.Vector3();
const _pinPQ = new THREE.Quaternion();
const _pinUW = new THREE.Quaternion();
const _pinFW = new THREE.Quaternion();
const _pinMQ = new THREE.Quaternion();
const _pinQ = new THREE.Quaternion();
const _pinInv = new THREE.Quaternion();
const _AXIS_Y_PIN = new THREE.Vector3(0, 1, 0);

function _seatSeed(key) {
  let h = 0x811c9dc5;
  const s = String(key == null ? 'seat' : key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function _rnd(holder) {
  let x = holder.rngState || 1;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;  x >>>= 0;
  holder.rngState = x;
  return x / 4294967296;
}
function _jit(holder, a) { return (_rnd(holder) * 2 - 1) * a; }

const HAND_POSES = [
  { name: 'open_soft',   f: [10, 16, 10], t: [6, 8] },    // barely closed -- "resting on a table, palm down"
  { name: 'relaxed',     f: [24, 34, 20], t: [14, 18] },  // the default human at-rest hand
  { name: 'soft_fist',   f: [38, 52, 30], t: [20, 26] },  // loosely closed, as in a lap
  { name: 'pen_hold',    f: [40, 54, 32], t: [24, 30], indexOverride: [16, 20, 12] }, // holding a pen
  { name: 'clasped',     f: [30, 46, 26], t: [26, 20] },  // hands together
  { name: 'lap_rest',    f: [18, 28, 16], t: [10, 14] },  // open-ish, in the lap
  { name: 'type_rest',   f: [30, 38, 14], t: [10, 12] },
];
const GAVEL_GRIP_POSE = { name: 'gavel_grip', f: [62, 86, 52], t: [42, 58] };

const SEATED_REST_MODES = [
  { name: 'lap_mid', lapFwd: 0.00, armFwd: 0.000, lat: 0.000, lift: 0.000 },
  { name: 'lap_knee', lapFwd: 0.22, armFwd: 0.048, lat: 0.018, lift: 0.000 },
  { name: 'lap_inner', lapFwd: -0.06, armFwd: -0.055, lat: -0.040, lift: 0.000 },
  { name: 'thigh_outer', lapFwd: 0.08, armFwd: 0.022, lat: 0.052, lift: 0.000 },
  { name: 'lap_loose', lapFwd: 0.14, armFwd: -0.020, lat: 0.026, lift: 0.008 },
  { name: 'lap_low', lapFwd: 0.04, armFwd: 0.032, lat: -0.022, lift: 0.000 },
  { name: 'lap_far', lapFwd: 0.30, armFwd: 0.060, lat: 0.008, lift: 0.000 },
];

const SEATED_POSTURES = [
  { name: 'lap_and_knee',   L: 'lap',       R: 'knee' },
  { name: 'knee_and_lap',   L: 'knee',      R: 'lap' },
  { name: 'arms_folded',    L: 'fold',      R: 'fold' },
  { name: 'chin_left',      L: 'chin',      R: 'lap' },
  { name: 'chin_right',     L: 'lap',       R: 'chin' },
  { name: 'bench_arm_left', L: 'benchBack', R: 'lap' },
  { name: 'bench_arm_right', L: 'lap',      R: 'benchBack' },
  { name: 'bench_arm_and_chin', L: 'benchBack', R: 'chin' },
  { name: 'chin_and_bench_arm', L: 'chin',      R: 'benchBack' },
  { name: 'lap_open',       L: 'lap',       R: 'lap' },
  { name: 'knee_and_chin',  L: 'knee',      R: 'chin' },
];
const SEATED_HOLDING_MODES = ['fold', 'chin'];
const SEATED_GALLERY_ONLY_MODES = ['benchBack', 'benchSeat'];
const GALLERY_BENCH_BACK_TOP_Y = 0.825;
const GALLERY_BENCH_BACK_DZ = 0.28;    // from the row's own centre z
const GALLERY_BENCH_SEAT_TOP_Y = 0.50;

const STAND_HAND_POSES = [
  { name: 'stand_open', f: [7, 11, 6], t: [4, 6] },
  { name: 'stand_easy', f: [13, 19, 10], t: [7, 9] },
  { name: 'stand_soft', f: [18, 22, 13], t: [10, 11] },
  { name: 'stand_straight', f: [4, 7, 4], t: [3, 4] },
  { name: 'stand_light', f: [10, 15, 9], t: [12, 8] },
];

const FRAME_BUDGET_MS = 1000 / 60; // 16.67 ms

class FrameProfiler {
  constructor(windowSize = 90) {
    this.enabled = false;
    this.n = windowSize;
    this.phases = ['idle', 'life', 'stance', 'pins', 'clock', 'talklight', 'screen', 'render'];
    this.buf = {};
    for (const p of this.phases) this.buf[p] = new Float32Array(windowSize);
    this.total = new Float32Array(windowSize);
    this.gap = new Float32Array(windowSize);
    this.i = 0;
    this.filled = 0;
    this.starve = 0;
    this.frames = 0;
    this._t = {};
    this._last = 0;
    this.el = null;
  }

  begin(phase) { this._t[phase] = performance.now(); }

  end(phase) {
    const dt = performance.now() - this._t[phase];
    if (this.buf[phase]) this.buf[phase][this.i] = dt;
    return dt;
  }

  frame(frameStart) {
    const now = performance.now();
    this.total[this.i] = now - frameStart;
    const gap = this._last ? (frameStart - this._last) : 0;
    this.gap[this.i] = gap;
    if (gap > FRAME_BUDGET_MS * 2) this.starve++;
    this._last = frameStart;
    this.i = (this.i + 1) % this.n;
    this.filled = Math.min(this.filled + 1, this.n);
    this.frames++;
    if (this.enabled && (this.frames % 15) === 0) this._paint();
  }

  _mean(a) { let s = 0; for (let k = 0; k < this.filled; k++) s += a[k]; return s / Math.max(1, this.filled); }

  _max(a) { let m = 0; for (let k = 0; k < this.filled; k++) if (a[k] > m) m = a[k]; return m; }

  stats() {
    const out = { budget_ms: FRAME_BUDGET_MS, frames: this.frames, starved_frames: this.starve };
    for (const p of this.phases) out[`${p}_ms`] = +this._mean(this.buf[p]).toFixed(3);
    out.total_ms = +this._mean(this.total).toFixed(3);
    out.worst_total_ms = +this._max(this.total).toFixed(2);
    out.frame_gap_ms = +this._mean(this.gap).toFixed(2);
    out.worst_gap_ms = +this._max(this.gap).toFixed(2);
    out.fps = +(1000 / Math.max(0.001, this._mean(this.gap))).toFixed(1);
    return out;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.el) { this.el.remove(); this.el = null; return; }
    if (on && !this.el) {
      const d = document.createElement('div');
      d.id = 'courtsim-perf-hud';
      d.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;'
        + 'font:11px/1.35 ui-monospace,Consolas,monospace;white-space:pre;'
        + 'background:rgba(8,8,12,.86);color:#b8f7c0;padding:8px 10px;'
        + 'border:1px solid #2a5;border-radius:4px;pointer-events:none;';
      document.body.appendChild(d);
      this.el = d;
    }
  }

  _paint() {
    const s = this.stats();
    const bar = (ms) => {
      const frac = ms / FRAME_BUDGET_MS;
      const n = Math.min(20, Math.round(frac * 10));
      return '#'.repeat(n).padEnd(20, '.');
    };
    this.el.textContent =
      `COURTSIM FRAME PROFILER    budget ${FRAME_BUDGET_MS.toFixed(1)} ms (60 fps)\n`
      + `fps ${s.fps.toFixed(1)}   frame ${s.total_ms.toFixed(2)} ms   worst ${s.worst_total_ms.toFixed(1)} ms\n`
      + `gap ${s.frame_gap_ms.toFixed(1)} ms   worst gap ${s.worst_gap_ms.toFixed(1)} ms\n`
      + `STARVED FRAMES ${s.starved_frames}   <- main thread blocked elsewhere\n`
      + `--------------------------------------------\n`
      + `idle      ${s.idle_ms.toFixed(2).padStart(6)} ms ${bar(s.idle_ms)}\n`
      + `life      ${s.life_ms.toFixed(2).padStart(6)} ms ${bar(s.life_ms)}   <- COURTSIM-FIX-O\n`
      + `stance    ${s.stance_ms.toFixed(2).padStart(6)} ms ${bar(s.stance_ms)}\n`
      + `pins      ${s.pins_ms.toFixed(2).padStart(6)} ms ${bar(s.pins_ms)}   <- COURTSIM-IDLE-PROPS-012\n`
      + `clock     ${s.clock_ms.toFixed(2).padStart(6)} ms ${bar(s.clock_ms)}\n`
      + `talklight ${s.talklight_ms.toFixed(2).padStart(6)} ms ${bar(s.talklight_ms)}\n`
      + `screen    ${s.screen_ms.toFixed(2).padStart(6)} ms ${bar(s.screen_ms)}   <- COURTSIM-FIX-W laptop\n`
      + `render    ${s.render_ms.toFixed(2).padStart(6)} ms ${bar(s.render_ms)}\n`
      + `--------------------------------------------\n`
      + `SSAO ${this.ssaoOn === false ? 'OFF (auto-degraded)' : 'on'}   `
      + `AA ${this.aaSamples ? this.aaSamples + 'x MSAA' : 'OFF'}\n`
      + `press P to hide   A toggles antialiasing`;
  }
}

export class CourtroomScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    try {
      this._maxAnisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy() || 1);
    } catch (_) { this._maxAnisotropy = 1; }
    setSurfaceAnisotropy(this._maxAnisotropy);
    console.log('[courtsim] surface_anisotropy=', this._maxAnisotropy,
      '(1 = off, which is what shipped; COURTSIM-FIX-W DEFECT W-6)');
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0c10);
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._pmrem.compileEquirectangularShader();
    this._envRT = null;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.02, 40);
    this.camera.position.set(0, 2.3, 7.5);
    this.camera.lookAt(0, 1.4, -2.6);

    const rtSize = new THREE.Vector2();
    this.renderer.getSize(rtSize);
    const pr = this.renderer.getPixelRatio();
    this._msaaSamples = 4;
    const composerRT = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(rtSize.x * pr)),
      Math.max(1, Math.floor(rtSize.y * pr)),
      { type: THREE.HalfFloatType, samples: this._msaaSamples },
    );
    composerRT.texture.name = 'EffectComposer.rt1(msaa)';
    this.composer = new EffectComposer(this.renderer, composerRT);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ssaoPass = new SSAOPass(this.scene, this.camera,
      this.canvas.clientWidth || 1280, this.canvas.clientHeight || 720);
    const _depthSpan = this.camera.far - this.camera.near;   // 99.9 m here
    this.ssaoPass.kernelRadius = 0.09;                       // metres, view space
    this.ssaoPass.minDistance = 0.008 / _depthSpan;          // 8 mm  -> 8.008e-5
    this.ssaoPass.maxDistance = 0.250 / _depthSpan;          // 250 mm -> 2.503e-3
    this._alphaCutoutMeshes = [];
    this._reporterScreen = null;
    this._counselScreen = null;
    const _ssao = this.ssaoPass;
    const SSAO_RESOLUTION_SCALE = 0.5;
    const _stockSetSize = _ssao.setSize.bind(_ssao);
    _ssao.setSize = (w, h) => _stockSetSize(
      Math.max(1, Math.round(w * SSAO_RESOLUTION_SCALE)),
      Math.max(1, Math.round(h * SSAO_RESOLUTION_SCALE)),
    );
    _ssao.overrideVisibility = () => {
      const list = this._alphaCutoutMeshes;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m) continue;
        m.userData.__ssaoWasVisible = m.visible;
        m.visible = false;
      }
    };
    _ssao.restoreVisibility = () => {
      const list = this._alphaCutoutMeshes;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m) continue;
        m.visible = m.userData.__ssaoWasVisible !== false;
      }
    };
    this.composer.addPass(this.ssaoPass);
    this.composer.addPass(new OutputPass());

    this.scene.add(new THREE.AmbientLight(0x9a9488, 0.30));
    const key = new THREE.DirectionalLight(0xfff2dd, 0.95);
    key.position.set(3, 8, 4);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.4);
    fill.position.set(-5, 6, -6);
    this.scene.add(fill);

    this.venueGroup = new THREE.Group();
    this.venueGroup.name = 'VenueGroup';
    this.scene.add(this.venueGroup);
    this.seatGroups = {};
    this.talkLights = {};
    this.seatPlates = {};
    this._seatNames = {};
    this._mouthRest = {};
    this._animStates = [];
    this._avatarModels = [];  // COURTSIM-FIX-R3 -- camera keep-out volumes
    this._furnitureKeepOuts = null;  // COURTSIM-FIX-S -- rebuilt per venue
    this._clock = new THREE.Clock();
    this._motionSpeed = 1.0;
    this._stanceTransitioning = false;
    this._stanceElapsed = 0;
    this._roomStance = null;    // 'stand' between "all rise" and "be seated"; see _riseAll()
    this._clockHands = null;    // DEFECT 6
    this._activeSeatDefs = SEATS;
    this._arkitShapeCache = {};
    this._lipsyncPeaks = {};    // COURTSIM-FIX-AA
    this._externalLoadProgress = null;
    this._venueGen = 0;
    this._publishSelf();
    this._stanceDuration = 1.1; // seconds -- real "all rise" isn't instantaneous, but reads as one motion, not a straggle
    this._onLoadProgress = null;
    this.venue = VENUES[0];
    this._loadVenue('courtroom_a');

    this._resize();
    window.addEventListener('resize', () => this._resize());
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => this._resize());
      ro.observe(this.canvas.parentElement || this.canvas);
    }
    const armDprWatcher = () => {
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      const onChange = () => {
        this._resize();
        armDprWatcher(); // re-arm against the NEW devicePixelRatio -- see above
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange, { once: true });
      else if (mq.addListener) mq.addListener(onChange);
    };
    armDprWatcher();

    this.profiler = new FrameProfiler();
    this.profiler.ssaoOn = true;
    this.profiler.aaSamples = this._msaaSamples;   // COURTSIM-FIX-V, DEFECT V-1
    try {
      if (new URLSearchParams(location.search).get('perf') === '1') this.profiler.setEnabled(true);
    } catch (_) { /* file:// or a stripped location -- the P key still works */ }
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'p' || e.key === 'P') {
        this.profiler.setEnabled(!this.profiler.enabled);
        console.log('[courtsim] frame profiler', this.profiler.enabled ? 'ON' : 'OFF',
          JSON.stringify(this.profiler.stats()));
      }
      if (e.key === 'a' || e.key === 'A') this.setAntialias(this._msaaSamples === 0);
    });

    this._ssaoEnabled = true;
    this._overBudgetRun = 0;
    this._underBudgetRun = 0;
    this._qualityLocked = false; // set true by setQualityLocked() to pin it

    this._animate();
  }

  setAntialias(on) {
    if (!this.composer) return;
    const want = on ? 4 : 0;
    if (want === this._msaaSamples) return;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(
      Math.max(1, Math.floor(size.x * pr)),
      Math.max(1, Math.floor(size.y * pr)),
      { type: THREE.HalfFloatType, samples: want },
    );
    rt.texture.name = 'EffectComposer.rt1' + (want ? '(msaa)' : '(aliased)');
    this.composer.reset(rt);
    this._msaaSamples = want;
    if (this.profiler) this.profiler.aaSamples = want;
    console.log('[courtsim] antialias', want ? want + 'x MSAA' : 'OFF',
      '-- COURTSIM-FIX-V DEFECT V-1 A/B');
  }

  _publishSelf() {
    if (typeof window !== 'undefined') window.__courtsimScene = this;
  }

  getFrameStats() {
    const s = this.profiler ? this.profiler.stats() : null;
    if (s) s.ssao_enabled = this._ssaoEnabled;
    return s;
  }

  setProfilerEnabled(on) { if (this.profiler) this.profiler.setEnabled(!!on); }

  setQualityLocked(locked) { this._qualityLocked = !!locked; }

  _updateQualityFloor(frameMs) {
    if (this._qualityLocked || !this.composer || !this.ssaoPass) return;
    if (frameMs > FRAME_BUDGET_MS * 1.5) { this._overBudgetRun++; this._underBudgetRun = 0; }
    else if (frameMs < FRAME_BUDGET_MS * 0.8) { this._underBudgetRun++; this._overBudgetRun = 0; }

    if (this._ssaoEnabled && this._overBudgetRun >= 30) {
      this._ssaoEnabled = false;
      this.ssaoPass.enabled = false;
      this._overBudgetRun = 0;
      if (this.profiler) this.profiler.ssaoOn = false;
      console.warn('[courtsim] QUALITY FLOOR: frames ran over budget for ~0.5s -- SSAO disabled to keep '
        + 'the view draggable. Geometry, avatars, arms, camera and lighting are untouched. '
        + 'It will switch back on automatically once frames recover.');
    } else if (!this._ssaoEnabled && this._underBudgetRun >= 180) {
      this._ssaoEnabled = true;
      this.ssaoPass.enabled = true;
      this._underBudgetRun = 0;
      if (this.profiler) this.profiler.ssaoOn = true;
      console.log('[courtsim] QUALITY FLOOR: frames recovered -- SSAO re-enabled.');
    }
  }

  _loadAvatarSeat(loader, seatKey, def, speaking, gen, tierIdx = -1) {
    const base = tierIdx < 0 ? AVATAR_BASE_URL : AVATAR_FALLBACK_URLS[tierIdx];
    const avatarRole = def.avatarRole || def.role;
    const url = base + avatarRole + '.glb';
    loader.load(
      url,
      (gltf) => {
        if (gen !== undefined && gen !== this._venueGen) {
          gltf.scene.traverse((n) => {
            if (!n.isMesh) return;
            n.geometry?.dispose();
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            for (const m of mats) m?.dispose();
          });
          return;
        }
        const model = gltf.scene;
        model.position.set(def.pos[0], def.pos[1], def.pos[2]);
        const isJuror = seatKey === null;
        if (isJuror) {
          model.rotation.y = yawToward(def.pos[0], def.pos[2], WELL_FOCUS[0], WELL_FOCUS[1]);
        } else if (typeof def.faceYaw === 'number') {
          model.rotation.y = def.faceYaw;
        } else {
          model.rotation.y = def.elevated ? 0 : Math.PI;
        }
        this.venueGroup.add(model);
        this._avatarModels.push(model);
        const fwd = new THREE.Vector3(Math.sin(model.rotation.y), 0, Math.cos(model.rotation.y));
        const toWell = new THREE.Vector3(WELL_FOCUS[0] - def.pos[0], 0, WELL_FOCUS[1] - def.pos[2]);
        if (toWell.lengthSq() > 1e-6) {
          console.log('[courtsim] facing_check', def.role,
            'yaw_deg=', (model.rotation.y * 180 / Math.PI).toFixed(1),
            'forward_dot_toWell=', fwd.dot(toWell.normalize()).toFixed(3));
        }

        let robeMaterialsRecolored = 0;
        let wigPartCount = 0;
        if (seatKey === 'THE COURT') {
          robeMaterialsRecolored = this._recolorTorso(model, ROBE_COLOR, 0.4);
          wigPartCount = this._buildJudgeWig(model);
        }

        model.traverse((n) => {
          if (!n.isMesh || !n.material) return;
          const materials = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of materials) if (m) m.dithering = true;
          const cut = materials.some((m) => m && (m.alphaTest > 0 || m.transparent === true));
          if (cut) this._alphaCutoutMeshes.push(n);
        });

        let vertexCount = 0;
        model.traverse((n) => {
          if (n.isMesh && n.geometry) {
            const pos = n.geometry.getAttribute('position');
            if (pos) vertexCount += pos.count;
          }
        });

        const group = { model, vertexCount, pos: def.pos, elevated: !!def.elevated, robeMaterialsRecolored, wigPartCount };
        if (tierIdx >= 0) {
          this._avatarTierFallbacks = this._avatarTierFallbacks || [];
          this._avatarTierFallbacks.push({ role: def.role, tier: base });
          console.warn('[courtsim] AVATAR_LOADED_FROM_FALLBACK_TIER role=', def.role,
            'tier=', base, '(primary', AVATAR_BASE_URL, 'FAILED).',
            'This figure is present but at a lower asset tier than the rest of the cast --',
            'assets/avatars_optimized drops morph NORMAL deltas, so its blink and viseme',
            'shading is flatter. THE PRIMARY ASSET IS BROKEN AND NEEDS FIXING AT SOURCE.');
        }
        this.loadedCount++;
        if (def.spectator) {
          this._spectatorsPlaced = (this._spectatorsPlaced || 0) + 1;
          console.log(`[gallery] spectator placed ${this._spectatorsPlaced}/${GALLERY_SPECTATORS.length} `
            + `role=${def.role} at x=${def.pos[0]} z=${def.pos[2]}`);
          const GALLERY_USES_OWN_IDENTITIES = true;
          if (!GALLERY_USES_OWN_IDENTITIES) {
            this._applyCastVariant(model, GALLERY_SPECTATORS.indexOf(def));
          }
          this._applyRoleRetexture(model, def.role);
        }
        this._registerIdleAnimation(model, seatKey ? (DEFAULT_STANCE[seatKey] || 'sit') : 'sit', def);
        if (seatKey === 'THE COURT') this._attachGavelToHand(model);

        if (seatKey) {
          this.seatGroups[seatKey] = group;

          const label = makeTextSprite(seatPlateDefault(seatKey, def));
          label.scale.set(0.75, 0.19, 1);
          label.position.set(def.pos[0], (def.seatY != null ? def.seatY : 0.45) + 0.12,
            def.pos[2] + (def.elevated ? 0.6 : 0.35));
          this.venueGroup.add(label);
          this.seatPlates = this.seatPlates || {};
          this.seatPlates[seatKey] = { sprite: label, fallback: seatPlateDefault(seatKey, def) };
          this._applySeatPlate(seatKey);
          this._alphaCutoutMeshes.push(label);

          const talkY = (DEFAULT_STANCE[seatKey] === 'stand')
            ? def.pos[1] + 1.5
            : (def.seatY != null ? def.seatY : 0.45) + 0.95;
          const faceFwdX = Math.sin(model.rotation.y);
          const faceFwdZ = Math.cos(model.rotation.y);
          const talkLight = new THREE.SpotLight(
            0xffb347, 0, 2.4, TALK_LIGHT_ANGLE, TALK_LIGHT_PENUMBRA, 2);
          talkLight.position.set(
            def.pos[0] - faceFwdX * TALK_LIGHT_BEHIND,
            talkY + TALK_LIGHT_RISE,
            def.pos[2] - faceFwdZ * TALK_LIGHT_BEHIND);
          const talkTarget = new THREE.Object3D();
          talkTarget.name = 'TalkLightTarget';
          talkTarget.position.set(
            def.pos[0] + faceFwdX * 0.10, talkY - 0.30, def.pos[2] + faceFwdZ * 0.10);
          this.venueGroup.add(talkTarget);
          talkLight.target = talkTarget;
          this.venueGroup.add(talkLight);
          this.talkLights[seatKey] = talkLight;
        }
        if (this._onLoadProgress) this._onLoadProgress(this.loadedCount, this.totalToLoad);
      },
      undefined,
      (err) => {
        console.error('[courtroom] failed to load avatar', avatarRole, 'from', url, err);
        if (gen !== undefined && gen !== this._venueGen) return;
        const nextTier = tierIdx + 1;
        if (nextTier < AVATAR_FALLBACK_URLS.length) {
          console.warn('[courtroom] AVATAR_TIER_FALLBACK role=', avatarRole,
            'tier', url, 'FAILED --  retrying from', AVATAR_FALLBACK_URLS[nextTier] + avatarRole + '.glb.',
            'If this succeeds the figure is present but at a LOWER asset tier than the',
            'rest of the cast; the asset in the primary tier is broken and needs fixing',
            'at source (web/assets/* is not this lane).');
          this._loadAvatarSeat(loader, seatKey, def, speaking, gen, nextTier);
          return;
        }
        this._recordAvatarFailure(def, err);
        this.loadedCount++;
        if (this._onLoadProgress) this._onLoadProgress(this.loadedCount, this.totalToLoad);
      },
    );
  }

  _recordAvatarFailure(def, err) {
    this._avatarFailures = this._avatarFailures || [];
    const rec = {
      role: def.avatarRole || def.role,
      seat: def.label || (def.pos ? `x=${def.pos[0]} z=${def.pos[2]}` : '?'),
      reason: (err && (err.message || err.type)) || String(err),
    };
    this._avatarFailures.push(rec);
    console.error('[courtsim] AVATAR_MISSING_FROM_ROOM role=', rec.role, 'seat=', rec.seat,
      'reason=', rec.reason,
      '-- EVERY tier was tried and none of them loaded. This seat will be EMPTY for the',
      'whole session. Total avatars missing so far:', this._avatarFailures.length,
      'of', this.totalToLoad);
    try {
      const host = document.getElementById('courtroom-stage')
        || document.getElementById('courtroom-screen') || document.body;
      if (!host) return;
      let el = document.getElementById('courtsim-avatar-failure-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'courtsim-avatar-failure-banner';
        el.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:9999;'
          + 'background:#7a1620;color:#fff;font:bold 13px/1.45 system-ui,sans-serif;'
          + 'padding:8px 12px;text-align:center;pointer-events:none;';
        host.appendChild(el);
      }
      el.textContent = 'MISSING FROM THE ROOM: '
        + this._avatarFailures.map((f) => `${f.role} (${f.seat})`).join(', ')
        + ' -- these figures failed to load and their seats are empty. '
        + 'See the console for the reason.';
    } catch (_) {
    }
  }

  getAvatarLoadFailures() {
    return (this._avatarFailures || []).slice();
  }

  _recolorTorso(model, colorHex, roughness) {
    let recoloredCount = 0;
    const meshes = [];
    model.traverse((n) => {
      if (n.isMesh && n.material) meshes.push(n);
    });
    for (const n of meshes) {
      const materials = Array.isArray(n.material) ? n.material : [n.material];
      const splittable = !Array.isArray(n.material) && materials[0]
        && materials[0].name && materials[0].name.toLowerCase().includes('body');
      if (splittable) {
        const mat = materials[0];
        const robe = mat.clone();
        robe.color = new THREE.Color(colorHex);
        robe.roughness = roughness;
        robe.map = null;
        recoloredCount++;
        const split = this._splitOutHandTriangles(n);
        if (split.handTriangles > 0) {
          n.material = [robe, mat];
          console.log('[courtsim] robe_HANDS_KEPT_SKIN mesh=', n.name || '(unnamed)',
            'material=', mat.name,
            'hand_bones=', split.handBones,
            'hand_vertices=', split.handVertices, 'of', split.vertices,
            'hand_triangles=', split.handTriangles, 'of', split.triangles,
            'hand_y_range_m=', split.handYMin.toFixed(3) + '..' + split.handYMax.toFixed(3),
            '-- COURTSIM-FIX-038. The robe colour stops at the wrist; the hands keep',
            'their own albedo map. Zero here would mean this rig has no hand bones and',
            'the whole mesh took the robe, which is the defect POLISH-034 reported.');
        } else {
          n.material = robe;
          console.warn('[courtsim] robe_HAND_SPLIT_UNAVAILABLE mesh=', n.name || '(unnamed)',
            'material=', mat.name, 'reason=', split.reason,
            '-- the whole body material took the robe colour, so if this mesh contains',
            'hands they will be robe-coloured. See COURTSIM-FIX-038 section 2.');
        }
        continue;
      }
      const next = materials.map((mat) => {
        if (mat && mat.name && mat.name.toLowerCase().includes('body')) {
          const override = mat.clone();
          override.color = new THREE.Color(colorHex);
          override.roughness = roughness;
          override.map = null;
          recoloredCount++;
          return override;
        }
        return mat;
      });
      n.material = Array.isArray(n.material) ? next : next[0];
    }
    return recoloredCount;
  }

  _splitOutHandTriangles(mesh) {
    const out = { vertices: 0, triangles: 0, handVertices: 0, handTriangles: 0,
                  handBones: 0, handYMin: 0, handYMax: 0, reason: '' };
    const geom = mesh.geometry;
    if (!geom) { out.reason = 'no geometry'; return out; }
    const skinIndex = geom.getAttribute('skinIndex');
    const skinWeight = geom.getAttribute('skinWeight');
    const index = geom.getIndex();
    const position = geom.getAttribute('position');
    if (!skinIndex || !skinWeight) { out.reason = 'mesh is not skinned'; return out; }
    if (!index) { out.reason = 'geometry is not indexed'; return out; }
    if (!mesh.skeleton || !mesh.skeleton.bones) { out.reason = 'no skeleton'; return out; }
    out.vertices = position ? position.count : 0;
    out.triangles = index.count / 3;
    const handBoneIdx = new Set();
    mesh.skeleton.bones.forEach((b, i) => {
      const nm = String(b.name || '').toLowerCase();
      if (/(^|[ _])(l|r)[ _](hand|finger)/.test(nm)) handBoneIdx.add(i);
    });
    out.handBones = handBoneIdx.size;
    if (!handBoneIdx.size) { out.reason = 'no hand/finger bones on this rig'; return out; }
    const hw = new Float32Array(skinIndex.count);
    for (let v = 0; v < skinIndex.count; v++) {
      let s = 0;
      for (let c = 0; c < 4; c++) {
        if (handBoneIdx.has(skinIndex.getComponent(v, c))) s += skinWeight.getComponent(v, c);
      }
      hw[v] = s;
    }
    let hvCount = 0, yMin = Infinity, yMax = -Infinity;
    for (let v = 0; v < hw.length; v++) {
      if (hw[v] > 0.5) {
        hvCount++;
        if (position) {
          const y = position.getY(v);
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }
    out.handVertices = hvCount;
    out.handYMin = Number.isFinite(yMin) ? yMin : 0;
    out.handYMax = Number.isFinite(yMax) ? yMax : 0;
    const src = index.array;
    const robeTris = [];
    const handTris = [];
    for (let t = 0; t < src.length; t += 3) {
      const a = src[t], b = src[t + 1], c = src[t + 2];
      const mean = (hw[a] + hw[b] + hw[c]) / 3;
      (mean > 0.5 ? handTris : robeTris).push(a, b, c);
    }
    out.handTriangles = handTris.length / 3;
    if (!handTris.length) { out.reason = 'no hand-weighted triangles'; return out; }
    const reordered = new src.constructor(src.length);
    reordered.set(robeTris, 0);
    reordered.set(handTris, robeTris.length);
    index.array.set(reordered);
    index.needsUpdate = true;
    geom.clearGroups();
    geom.addGroup(0, robeTris.length, 0);
    geom.addGroup(robeTris.length, handTris.length, 1);
    return out;
  }

  _buildJudgeWig(model) {
    const JUDGE_WIG_ENABLED = false;
    if (!JUDGE_WIG_ENABLED) {
      console.log('[courtsim] judge_wig DISABLED --',
        'measured: old base enclosed LEye/eyebrow/jaw and exposed crown+hairline;',
        'no ellipsoid clears the face AND covers the skull on this head.',
        'See _buildJudgeWig() for the numbers and how to re-enable.');
      return 0;
    }
    const headBone = model.getObjectByName('Bip01_Head') || model.getObjectByName('Bip01 Head');
    if (!headBone) return 0; // not the expected rig -- skip rather than guess a placement
    headBone.updateWorldMatrix(true, false);
    const headWorldPos = headBone.getWorldPosition(new THREE.Vector3());
    model.updateWorldMatrix(true, false);
    const headLocalPos = model.worldToLocal(headWorldPos.clone());

    const wigMat = stdMaterial({ color: 0xe0dccc, roughness: 0.85, metalness: 0.0 });
    const wig = new THREE.Group();
    wig.name = 'JudgeWig';
    wig.position.copy(headLocalPos);

    const base = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 16), wigMat);
    base.scale.set(1.0, 0.762, 0.952);   // -> semi-axes 0.105 / 0.080 / 0.100
    base.position.set(0, 0.1879, 0.0269);
    base.name = 'WigBase';
    wig.add(base);

    const curlCount = 20;
    for (let i = 0; i < curlCount; i++) {
      const angle = (i / curlCount) * Math.PI * 2;
      if (Math.cos(angle) > 0.25 && Math.abs(Math.sin(angle)) < 0.68) continue;
      const r = 0.112;
      const yBand = (i % 3) * 0.026; // three cascading heights -- a cluster, not one flat ring
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.030 + (i % 3) * 0.005, 8, 6), wigMat);
      curl.position.set(Math.sin(angle) * r, 0.1665 - yBand, Math.cos(angle) * r * 0.95 + 0.0269);
      curl.name = 'WigCurl';
      wig.add(curl);
    }
    model.add(wig);
    return wig.children.length;
  }

  _applyIndirectEnvironment() {
    const v = this.venue;
    const envScene = new THREE.Scene();
    const isCourtroom = v.type !== 'deposition';
    const W = isCourtroom ? 16 : 12;
    const D = isCourtroom ? 12 : 10;
    const H = isCourtroom ? (v.subtitle === 'grand & traditional' ? 7.2 : 6.0) : 4.6;

    const geom = new THREE.BoxGeometry();
    const panel = (color, intensity, sx, sy, sz, px, py, pz) => {
      const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
        color: 0x000000, emissive: color, emissiveIntensity: intensity, side: THREE.DoubleSide,
      }));
      m.scale.set(sx, sy, sz);
      m.position.set(px, py, pz);
      envScene.add(m);
      return m;
    };

    panel(v.ceilingColor, 0.55, W, 0.02, D, 0, H, 0);                 // ceiling
    panel(v.floorColor, 0.22, W, 0.02, D, 0, 0.01, 0);                // floor
    panel(v.wallColor, 0.30, W, H, 0.02, 0, H / 2, -D / 2);           // back
    panel(v.wallColor, 0.30, W, H, 0.02, 0, H / 2, D / 2);            // front
    panel(v.wallColor, 0.30, 0.02, H, D, -W / 2, H / 2, 0);           // left
    panel(v.wallColor, 0.30, 0.02, H, D, W / 2, H / 2, 0);            // right
    if (isCourtroom) {
      const wh = v.wainscotHeight;
      panel(v.wainscotColor, 0.16, W, wh, 0.02, 0, wh / 2, -D / 2 + 0.03);
      panel(v.wainscotColor, 0.16, 0.02, wh, D, -W / 2 + 0.03, wh / 2, 0);
      panel(v.wainscotColor, 0.16, 0.02, wh, D, W / 2 - 0.03, wh / 2, 0);
      panel(v.carpetColor, 0.30, 10, 0.02, 8, 0, 0.05, -1);
      for (const [rx, rz] of ceilingFixtureGrid(v)) {
        panel(0xfff0dd, 6.0, 0.6, 0.02, 0.6, rx, H - 0.15, rz);
      }
      panel(0xdce9ff, 5.0, 0.02, 2.4, 7.0, -W / 2 + 0.05, H * 0.62, 0.5);
    } else {
      for (const rx of [-3, 0, 3]) {
        panel(0xfff2e2, 5.0, 0.8, 0.02, 0.8, rx, H - 0.15, 0);
      }
      if (v.glassWalls) panel(0xdce9ff, 6.0, W - 1, H - 1, 0.02, 0, H / 2, -D / 2 + 0.1);
    }

    const rt = this._pmrem.fromScene(envScene, 0.04);
    if (this._envRT) this._envRT.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    envScene.traverse((n) => { if (n.isMesh) n.material.dispose(); });
    geom.dispose();
  }

  _applyCastPlan(seatDefs) {
    const plan = getCastPlan().bySeat;
    const out = {};
    for (const [key, def] of Object.entries(seatDefs)) {
      out[key] = plan[key] ? { ...def, avatarRole: plan[key] } : { ...def, avatarRole: def.role };
    }
    return out;
  }

  getSeatAvatarRoles() {
    const out = {};
    for (const [key, def] of Object.entries(this._activeSeatDefs || {})) {
      out[key] = def.avatarRole || def.role;
    }
    return out;
  }

  setCastRequirements(needs, venueKey) {
    const key = venueKey || (this.venue && this.venue.key);
    const v = VENUES.find((x) => x.key === key) || VENUES[0];
    const res = registerCastRequirements(needs, v.type);
    const live = this.getSeatAvatarRoles();
    const wanted = this._applyCastPlan(v.type === 'deposition' ? DEPOSITION_SEATS : SEATS);
    let needsRebuild = false;
    for (const [seat, def] of Object.entries(wanted)) {
      if (live[seat] !== def.avatarRole) { needsRebuild = true; break; }
    }
    return { ...res, needsRebuild };
  }

  _loadVenue(venueKey) {
    this.venue = VENUES.find((v) => v.key === venueKey) || VENUES[0];
    this._noJudgeInfoSaid = false;
    this._applyIndirectEnvironment();   // DEFECT 8 -- before any material is built
    this._setCameraForVenue();
    this._buildRoom();
    this._buildRoomDressing();

    const seatDefs = this._applyCastPlan(
      this.venue.type === 'deposition' ? DEPOSITION_SEATS : SEATS);
    const galleryDefs = this.venue.type === 'deposition' ? [] : GALLERY_SPECTATORS;
    this._spectatorsPlaced = 0;   // COURTSIM-FIX-AA, DEFECT AA-5
    this._avatarFailures = [];
    try {
      const b = document.getElementById('courtsim-avatar-failure-banner');
      if (b && b.parentNode) b.parentNode.removeChild(b);
    } catch (_) { /* no DOM in a headless test context */ }
    const jurorDefs = this.venue.type === 'deposition' ? [] : JURORS;
    this._activeSeatDefs = seatDefs;
    this.loadedCount = 0;
    this.totalToLoad = Object.keys(seatDefs).length + jurorDefs.length + galleryDefs.length;
    this._venueGen = (this._venueGen || 0) + 1;
    const gen = this._venueGen;
    if (this._resolveCurrentLoad) this._resolveCurrentLoad();
    const loader = new GLTFLoader();
    return new Promise((resolve) => {
      let settled = false;
      this._resolveCurrentLoad = () => {
        if (!settled) { settled = true; resolve(); }
      };
      this._onLoadProgress = (loaded, total) => {
        if (gen !== this._venueGen) return;   // a newer venue owns the scene now
        if (this._externalLoadProgress) this._externalLoadProgress(loaded, total);
        if (this._pumpAvatarQueue) this._pumpAvatarQueue();
        if (loaded >= total) this._resolveCurrentLoad();
      };
      const AVATAR_LOAD_CONCURRENCY = 2;
      const queue = [];
      for (const [key_, def] of Object.entries(seatDefs)) {
        queue.push(() => this._loadAvatarSeat(loader, key_, def, /*speaking=*/true, gen));
      }
      for (const def of jurorDefs) {
        queue.push(() => this._loadAvatarSeat(loader, null, def, /*speaking=*/false, gen));
      }
      for (const def of galleryDefs) {
        queue.push(() => this._loadAvatarSeat(loader, null, def, /*speaking=*/false, gen));
      }
      let qi = 0, inFlight = 0;
      this._pumpAvatarQueue = () => {
        if (gen !== this._venueGen) { this._pumpAvatarQueue = null; return; }
        if (inFlight > 0) inFlight--;
        while (inFlight < AVATAR_LOAD_CONCURRENCY && qi < queue.length) {
          inFlight++;
          queue[qi++]();
        }
        if (qi >= queue.length && inFlight === 0) this._pumpAvatarQueue = null;
      };
      this._pumpAvatarQueue();
      if (this.totalToLoad === 0) this._resolveCurrentLoad();
    });
  }

  setLoadProgressCallback(fn) {
    this._externalLoadProgress = fn;
  }

  _setCameraForVenue() {
    if (this.venue.type === 'deposition') {
      const sideSign = this.venue.reporterSide === 'left' ? -1 : 1;
      this.camera.position.set(sideSign * 2.0, 1.5, 0.6);
      this.camera.lookAt(0, 0.9, 0);
    } else {
      this.camera.position.set(0, 2.3, 7.5);
      this.camera.lookAt(0, 1.4, -2.6);
    }
  }

  getWideShotSubjects() {
    if (!this.venueGroup) return [];
    const named = (label, re) => {
      const box = new THREE.Box3(); box.makeEmpty();
      this.venueGroup.traverse((o) => { if (o.isMesh && re.test(o.name)) box.expandByObject(o); });
      return box.isEmpty() ? null : { label, box };
    };
    const out = [];
    for (const [label, re] of [
      ['judge bench', /^Bench(Worktop|Front|Platform|Panel|Desk)/],
      ['jury box', /^Jury/],
      ['counsel tables', /^CounselTable/],
      ['clerk station', /^Clerk/],
      ['reporter station', /^Reporter/],
      ['witness stand', /^Witness/],
    ]) { const n = named(label, re); if (n) out.push(n); }
    for (const m of (this._avatarModels || [])) {
      if (m.position.z > 3.5) continue;
      const box = new THREE.Box3().setFromObject(m);
      if (!box.isEmpty()) out.push({ label: 'figure@x' + m.position.x.toFixed(2), box });
    }
    return out;
  }

  auditFraming(camera, label) {
    const subs = this.getWideShotSubjects();
    if (!camera || !subs.length) return [];
    camera.updateMatrixWorld(true);
    const mvp = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix, camera.matrixWorldInverse);
    const rows = [];
    for (const { label: name, box } of subs) {
      let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const p = new THREE.Vector3(x, y, z).applyMatrix4(mvp);
            if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
            if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
          }
        }
      }
      const wIn = Math.max(0, Math.min(maxx, 1) - Math.max(minx, -1));
      const hIn = Math.max(0, Math.min(maxy, 1) - Math.max(miny, -1));
      rows.push({ subject: name,
        pctWidthInFrame: +(100 * wIn / Math.max(1e-6, maxx - minx)).toFixed(1),
        pctHeightInFrame: +(100 * hIn / Math.max(1e-6, maxy - miny)).toFixed(1),
        ndcX: [+minx.toFixed(3), +maxx.toFixed(3)] });
    }
    const bad = rows.filter((r) => r.pctWidthInFrame < 99.5 || r.pctHeightInFrame < 99.5);
    if (bad.length) {
      console.warn('[courtsim] framing_SUBJECTS_OUTSIDE view=', label || 'wide',
        'venue=', this.venue && this.venue.key, 'count=', bad.length,
        'vfov=', camera.fov.toFixed(3),
        bad.map((r) => `${r.subject}:${r.pctWidthInFrame}%w/${r.pctHeightInFrame}%h`).join(' | '),
        '-- COURTSIM-POLISH-065. This used to be silent: getWideShotFraming()',
        'returned null for every courtroom, so no framing check ran at all and',
        'nothing would have said that five of six jurors are out of the',
        'establishing shot. It is a COMPOSITION question (the camera is on the',
        'centreline and the jury box is 55 deg off axis), not a bug this check',
        'can fix -- see getWideShotFraming() above for why the lens is not the',
        'lever and why moving the camera is the founder\'s call.');
    }
    return rows;
  }

  getWideShotFraming() {
    if (!this.venue || this.venue.type !== 'deposition') return null;
    return {
      pos: [0, 2.60, 4.20],
      target: [0, 1.05, -0.40],
      guarantee: { D: 4.8541, Rx: 3.6000, Ry: 1.9000 },
      venue: this.venue.key,
    };
  }

  rebuildVenue(venueKey) {
    this.resetStagedEvents();
    this._exhibitGroupRef = null;
    this._exhibitRefGen = null;
    for (const child of [...this.venueGroup.children]) {
      this.venueGroup.remove(child);
      child.traverse((n) => {
        if (n.isSprite && n.material) {
          n.material.map?.dispose();
          n.material.dispose();
          return;
        }
        if (n.isMesh) {
          n.geometry?.dispose();
          const mats = Array.isArray(n.material) ? n.material : [n.material];
          for (const m of mats) {
            if (!m) continue;
            for (const key_ of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) {
              if (m[key_]?.userData?.sharedSurfaceTexture) continue;
              m[key_]?.dispose();
            }
            m.dispose();
          }
        }
      });
    }
    this.seatGroups = {};
    this.talkLights = {};
    this._animStates = [];
    this._avatarModels = [];  // COURTSIM-FIX-R3 -- camera keep-out volumes
    this._furnitureKeepOuts = null;  // COURTSIM-FIX-S -- rebuilt per venue
    this._alphaCutoutMeshes = [];
    if (this._reporterScreen) {
      try { this._reporterScreen.texture.dispose(); } catch (_) { /* already gone */ }
    }
    this._reporterScreen = null;
    if (this._counselScreen) {
      try { this._counselScreen.texture.dispose(); } catch (_) { /* already gone */ }
    }
    this._counselScreen = null;
    this._stanceTransitioning = false;
    this._stanceElapsed = 0;
    this._roomStance = null;
    this._arkitShapeCache = {};
    this.seatPlates = {};
    this._mouthRest = {};
    this._gavelHeadRef = null;
    this._gavelGroupRef = null;
    this._gavelRefGen = null;
    this._lipsyncPeaks = {};
    this._clockHands = null;
    return this._loadVenue(venueKey);
  }

  _buildRoom() {
    this._reporterStation = null;
    if (this.venue.type === 'deposition') {
      this._buildDepositionRoom();
    } else {
      this._buildCourtroomRoom();
    }
  }

  _buildCourtroomRoom() {
    const v = this.venue;
    const g = this.venueGroup;
    const wallH = v.subtitle === 'grand & traditional' ? 7.2 : 6.0;
    const wallY = wallH / 2;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      wallMaterial(v.floorColor, 0.75),
    );
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(16, wallH),
      wallMaterial(v.wallColor, 0.9),
    );
    backWall.position.set(0, wallY, -6);
    g.add(backWall);

    box(g, [0.3, wallH, 16], [-7.9, wallY, 0], wallMaterial(v.wallColor, 0.85), 'LeftWall');
    box(g, [0.3, wallH, 16], [7.9, wallY, 0], wallMaterial(v.wallColor, 0.85), 'RightWall');
    box(g, [16, wallH, 0.3], [0, wallY, 7.9], wallMaterial(v.wallColor, 0.85), 'BackWallGallery');
    box(g, [10, 0.02, 8], [0, 0.015, -1], clothMaterial(v.carpetColor, 0.95), 'WellCarpet');

    const reporterX = REPORTER_X;
    const REPORTER_EYE_Z = -2.20;
    const REPORTER_AIM_D = 3.8754;           // == REPORTER_SEAT_GUARANTEE.D
    const REPORTER_AIM_ELEV_DEG = -10.82;    // was +1.18 (dy +0.08). Negative = looking down.
    const REPORTER_AIM_DY = REPORTER_AIM_D * Math.sin(THREE.MathUtils.degToRad(REPORTER_AIM_ELEV_DEG));
    const aimYaw = (() => {
      let lo = Infinity, hi = -Infinity;
      for (const cx of [-COUNSEL_TABLE_X, COUNSEL_TABLE_X]) {
        for (const x of [cx - COUNSEL_TABLE_W / 2 - 0.03, cx + COUNSEL_TABLE_W / 2 + 0.03]) {
          for (const z of [COUNSEL_TOP_Z0, COUNSEL_TOP_Z1]) {
            const b = Math.atan2(x - reporterX, z - REPORTER_EYE_Z);
            if (b < lo) lo = b;
            if (b > hi) hi = b;
          }
        }
      }
      return (lo + hi) / 2;
    })();
    const aimH = Math.sqrt(Math.max(0, REPORTER_AIM_D * REPORTER_AIM_D - REPORTER_AIM_DY * REPORTER_AIM_DY));
    this._reporterStation = {
      x: reporterX, z: REPORTER_EYE_Z, deskZ: -1.85, deskTopY: REPORTER_DESK_TOP_Y,
      aimElevDeg: REPORTER_AIM_ELEV_DEG,
      target: [
        reporterX + aimH * Math.sin(aimYaw),
        1.20 + REPORTER_AIM_DY,
        REPORTER_EYE_Z + aimH * Math.cos(aimYaw),
      ],
    };
    console.log('[courtsim] reporter_aim_solved x=', reporterX.toFixed(3),
      'z=', REPORTER_EYE_Z.toFixed(3),
      'bisector_yaw_deg=', THREE.MathUtils.radToDeg(aimYaw).toFixed(3),
      'aim_elevation_deg=', REPORTER_AIM_ELEV_DEG.toFixed(2),
      'target=', this._reporterStation.target.map((n) => n.toFixed(4)).join(','),
      'aim_distance_m=', REPORTER_AIM_D,
      '-- the aim LENGTH is held at REPORTER_SEAT_GUARANTEE.D so the CONTAIN',
      'fov solve is byte-identical; only the direction moved.');
    desk(g, [0.70, REPORTER_DESK_TOP_Y, 0.45], [reporterX, REPORTER_DESK_TOP_Y / 2, -1.85],
      woodMaterial(v.wainscotColor), 'ReporterDesk');
    chair(g, [reporterX, FLOOR_Y + CHAIR_RISE, REPORTER_EYE_Z],
      { name: 'ReporterChair', slide: 0, facing: 0 });
    this._buildReporterLaptop(g, v, reporterX, REPORTER_DESK_TOP_Y, aimYaw);

    box(g, [3.2, BENCH_PLATFORM_H, 2.35], [0, BENCH_PLATFORM_H / 2, -3.725], woodMaterial(v.wainscotColor), 'BenchPlatform');
    box(g, [1.0, BENCH_PLATFORM_H / 2, 0.32], [1.9, BENCH_PLATFORM_H / 4, -3.2], woodMaterial(v.wainscotColor), 'BenchStep');
    const benchDeskH = BENCH_DESK_TOP_Y - BENCH_PLATFORM_H;   // 1.31
    const benchWood = woodMaterial(v.wainscotColor);
    const benchWoodLight = woodMaterial(
      new THREE.Color(v.wainscotColor).lerp(new THREE.Color(0xffffff), 0.15).getHex());
    const benchWoodDark = woodMaterial(
      new THREE.Color(v.wainscotColor).multiplyScalar(0.6).getHex());
    const benchGroup = new THREE.Group();
    benchGroup.name = 'BenchDesk';
    const benchPart = (size, pos, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      m.position.set(pos[0], pos[1], pos[2] + BENCH_Z_SHIFT);
      m.name = name;
      benchGroup.add(m);
    };
    const bodyTopY = BENCH_DESK_TOP_Y - 0.06;        // 1.74, underside of the worktop slab
    const bodyMidY = (BENCH_PLATFORM_H + bodyTopY) / 2;
    const bodyH = bodyTopY - BENCH_PLATFORM_H;       // 1.25
    benchPart([2.6, bodyH, 0.06], [0, bodyMidY, -3.59], benchWood, 'BenchFrontPanel');
    for (const sx of [-1, 1]) {
      benchPart([0.06, bodyH, 0.66], [sx * 1.27, bodyMidY, -3.95], benchWood, 'BenchEndPanel');
    }
    benchPart([2.62, 0.09, 0.14], [0, BENCH_PLATFORM_H + 0.045, -3.59], benchWoodDark, 'BenchPlinth');
    benchPart([2.72, 0.06, 0.76], [0, BENCH_DESK_TOP_Y - 0.03, -3.92], benchWoodLight, 'BenchWorktop');
    for (const sx of [-0.85, 0.85]) {
      benchPart([0.14, bodyH * 0.76, 0.05], [sx, BENCH_PLATFORM_H + bodyH * 0.42, -3.556], benchWoodDark, 'BenchStile');
    }
    benchPart([2.0, 0.12, 0.04], [0, BENCH_PLATFORM_H + bodyH * 0.69, -3.555], benchWoodDark, 'BenchRail');
    benchPart([2.76, 0.05, 0.045], [0, BENCH_DESK_TOP_Y - 0.085, -3.545], benchWoodLight, 'BenchWorktopLip');
    g.add(benchGroup);
    chair(g, [0, BENCH_PLATFORM_H + CHAIR_RISE, -3.5], {
      facing: 0, seatColor: JURY_UPHOLSTERY, armrests: !!SEATS['THE COURT'].chairArms,
      name: 'BenchChair',
    });

    box(g, [1.46, WITNESS_PLATFORM_H, 1.44], [1.6, WITNESS_PLATFORM_H / 2, -1.72], woodMaterial(v.wainscotColor), 'WitnessPlatform');
    chair(g, [1.6, WITNESS_PLATFORM_H + CHAIR_RISE, -1.75], {
      facing: 0, seatColor: JURY_UPHOLSTERY, name: 'WitnessChair',
      armrests: !!SEATS['THE WITNESS'].chairArms,
    });
    box(g, [1.44, WITNESS_RAIL_TOP, 0.12], [1.6, WITNESS_RAIL_TOP / 2, -1.055], woodMaterial(v.wainscotColor), 'WitnessRail');
    box(g, [0.12, WITNESS_RAIL_TOP, 1.265], [0.96, WITNESS_RAIL_TOP / 2, -1.7475], woodMaterial(v.wainscotColor), 'WitnessRailLeft');
    box(g, [0.12, WITNESS_RAIL_TOP, 1.265], [2.24, WITNESS_RAIL_TOP / 2, -1.7475], woodMaterial(v.wainscotColor), 'WitnessRailRight');

    desk(g, [COUNSEL_TABLE_W, 0.75, COUNSEL_TABLE_D], [-COUNSEL_TABLE_X, 0.375, COUNSEL_TABLE_Z], woodMaterial(v.wainscotColor), 'CounselTableA');
    desk(g, [COUNSEL_TABLE_W, 0.75, COUNSEL_TABLE_D], [COUNSEL_TABLE_X, 0.375, COUNSEL_TABLE_Z], woodMaterial(v.wainscotColor), 'CounselTableB');
    this._buildCounselTableProps(g, v);
    desk(g, [CLERK_DESK_W, CLERK_DESK_TOP_Y, CLERK_DESK_D],
      [CLERK_DESK_X, CLERK_DESK_TOP_Y / 2, CLERK_DESK_Z],
      woodMaterial(v.wainscotColor), 'ClerkDesk');
    this._buildClerkStation(g, v);

    chair(g, [CLERK_DESK_X, FLOOR_Y + CHAIR_RISE, CLERK_SEAT_Z], { name: 'ClerkChair' });
    chair(g, [-COUNSEL_TABLE_X, FLOOR_Y + CHAIR_RISE, COUNSEL_SEAT_Z],
      { name: 'CounselChairA', armrests: !!SEATS['Counsel (Q)'].chairArms });
    chair(g, [COUNSEL_TABLE_X, FLOOR_Y + CHAIR_RISE, COUNSEL_SEAT_Z],
      { name: 'CounselChairB', armrests: !!SEATS['Counsel (named)'].chairArms });

    this._buildJuryBox(g, v);
    this._buildBarRail(g, v);

    for (let rowI = 0; rowI < 3; rowI++) {
      const benchZ = GALLERY_BENCH_Z[rowI];
      box(g, [7.5, 0.06, 0.5], [0, GALLERY_BENCH_SEAT_TOP_Y - 0.03, benchZ],
        woodMaterial(v.wainscotColor), `GalleryBenchSeat${rowI}`);
      box(g, [7.5, 0.29, 0.20], [0, 0.305, benchZ + 0.15],
        woodMaterial(v.wainscotColor), `GalleryBenchUnderRiser${rowI}`);
      box(g, [7.5, 0.16, 0.38], [0, 0.08, benchZ + 0.06],
        woodMaterial(v.wainscotColor), `GalleryBenchPlinth${rowI}`);
      box(g, [7.5, 0.55, 0.08], [0, 0.55, benchZ + 0.28], woodMaterial(v.wainscotColor), `GalleryBenchBack${rowI}`);
      for (const sx of [-1, 1]) {
        const endX = sx * 3.78;
        box(g, [0.08, 0.944, 0.60], [endX, 0.468, benchZ + 0.01],
          woodMaterial(v.wainscotColor), `GalleryBenchEnd${rowI}`);
        box(g, [0.05, 0.05, 0.64], [endX, 0.955, benchZ + 0.01],
          woodMaterial(v.wainscotColor), `GalleryBenchEndCap${rowI}`);
        box(g, [0.03, 0.52, 0.36], [sx * 3.87, 0.50, benchZ + 0.01],
          woodMaterial(v.wainscotColor), `GalleryBenchEndPanel${rowI}`);
      }
    }

    box(g, [16, 0.2, 16], [0, wallH, 0], wallMaterial(v.ceilingColor, 0.95), 'Ceiling');
    if (v.ceilingStyle === 'coffered') {
      for (const gx of [-4.5, -1.5, 1.5, 4.5]) {
        box(g, [0.15, 0.15, 15.6], [gx, wallH - 0.12, 0], woodMaterial(v.wainscotColor), 'CofferBeamX');
      }
      for (const gz of [-4, 0, 4]) {
        box(g, [15.6, 0.14, 0.15], [0, wallH - 0.115, gz], woodMaterial(v.wainscotColor), 'CofferBeamZ');
      }
    }

    const troffer = stdMaterial({ color: 0xf7f6ee, roughness: 0.3, emissive: 0xfff0dd, emissiveIntensity: 1.6 });
    for (const [rx, rz] of ceilingFixtureGrid(v)) {
      box(g, [0.5, 0.04, 0.5], [rx, wallH - 0.115, rz], troffer, 'RecessedLight');
    }
    const lampGrid = ceilingFixtureGrid(v);
    for (const [rx, rz] of [lampGrid[0], lampGrid[2], lampGrid[4], lampGrid[6], lampGrid[8]]) {
      const lamp = new THREE.PointLight(0xfff0dd, 11, 13, 2);
      lamp.position.set(rx, wallH - 0.2, rz);
      lamp.name = 'CeilingLamp';
      g.add(lamp);
    }

    const wh = v.wainscotHeight;
    box(g, [15.8, wh, 0.06], [0, wh / 2, -5.94], woodMaterial(v.wainscotColor), 'BackWallPanelling');
    box(g, [0.06, wh, 15.8], [-7.725, wh / 2, 0], woodMaterial(v.wainscotColor), 'LeftWallPanelling');
    box(g, [0.06, wh, 15.8], [7.725, wh / 2, 0], woodMaterial(v.wainscotColor), 'RightWallPanelling');
    box(g, [15.8, 0.08, 0.09], [0, wh + 0.03, -5.91], woodMaterial(v.wainscotColor), 'BackChairRail');
    const railY = wh + 0.03;
    const doorZ = 5.5;
    const railCrossesDoor = railY < DOOR_CORNICE_TOP;
    for (const sx of [-1, 1]) {
      const rx = sx * 7.70;
      const nm = sx < 0 ? 'LeftChairRail' : 'RightChairRail';
      if (!railCrossesDoor) {
        box(g, [0.09, 0.08, 15.8], [rx, railY, 0], woodMaterial(v.wainscotColor), nm);
        continue;
      }
      const z0 = doorZ - DOOR_CASE_HALF_W, z1 = doorZ + DOOR_CASE_HALF_W;
      box(g, [0.09, 0.08, z0 + 7.9], [rx, railY, (-7.9 + z0) / 2],
        woodMaterial(v.wainscotColor), nm);
      box(g, [0.09, 0.08, 7.9 - z1], [rx, railY, (z1 + 7.9) / 2],
        woodMaterial(v.wainscotColor), nm);
    }

    box(g, [15.8, wh, 0.06], [0, wh / 2, 7.725], woodMaterial(v.wainscotColor), 'GalleryWallPanelling');
    box(g, [15.8, 0.08, 0.09], [0, wh + 0.03, 7.70], woodMaterial(v.wainscotColor), 'GalleryChairRail');
    this._buildGalleryWallFeature(g, v, wh, wallH);
    this._buildDoorSet(g, v, [-7.695, 0, 5.5], Math.PI / 2, 'GalleryDoorLeft');
    this._buildDoorSet(g, v, [7.695, 0, 5.5], -Math.PI / 2, 'GalleryDoorRight');
  }

  _buildGalleryWallFeature(g, v, wh, wallH) {
    const WALL_FACE = 7.75;          // BackWallGallery box [16,H,0.3] @ 7.9 -> inner face
    const bottom = wh + 0.18;
    const top = Math.min(wallH - 0.90, bottom + 2.30);
    const h = top - bottom;
    if (h < 0.90) return;            // no room for it; refuse rather than build a squashed one
    const midY = (bottom + top) / 2;
    const FRAME_W = 2.20;
    const CASE_W = 0.15;
    const wood = woodMaterial(v.wainscotColor);
    const woodLight = woodMaterial(
      new THREE.Color(v.wainscotColor).lerp(new THREE.Color(0xffffff), 0.12).getHex());

    box(g, [FRAME_W - CASE_W * 2 + 0.04, h - 0.04, 0.056],
      [0, midY, WALL_FACE - 0.028], woodLight, 'GalleryCrestBackPanel');
    for (const sy of [-1, 1]) {
      box(g, [FRAME_W + 0.04, CASE_W, 0.044],
        [0, midY + sy * (h / 2 + CASE_W / 2), WALL_FACE - 0.068], wood, 'GalleryCrestFrameRail');
    }
    for (const sx of [-1, 1]) {
      box(g, [CASE_W, h + CASE_W, 0.040],
        [sx * (FRAME_W / 2 - CASE_W / 2), midY, WALL_FACE - 0.066], wood, 'GalleryCrestFrameStile');
    }
    box(g, [FRAME_W + 0.26, 0.11, 0.106], [0, top + CASE_W + 0.055, WALL_FACE - 0.053],
      wood, 'GalleryCrestCornice');
    box(g, [FRAME_W + 0.18, 0.09, 0.096], [0, bottom - CASE_W - 0.045, WALL_FACE - 0.048],
      wood, 'GalleryCrestPlinth');

    const crest = this._buildMedallion('GalleryCrest');
    crest.position.set(0, midY, WALL_FACE - 0.050);
    crest.rotation.y = Math.PI;
    g.add(crest);
  }

  _buildClerkStation(g, v) {
    const TOP_Y = CLERK_DESK_TOP_Y;
    const paperMat = stdMaterial({ color: 0xf2f0e8, roughness: 0.92, metalness: 0 });
    const folderMat = stdMaterial({ color: 0xc8a96a, roughness: 0.88, metalness: 0 });
    const darkMat = stdMaterial({ color: 0x1a1a1e, roughness: 0.45, metalness: 0.1 });
    const screenMat = stdMaterial({ color: 0x121a26, roughness: 0.28, metalness: 0.05 });
    const metalMat = stdMaterial({ color: 0x6d7076, roughness: 0.42, metalness: 0.55 });
    const bookMat = stdMaterial({ color: 0x5c2f2a, roughness: 0.82, metalness: 0 });
    const inkMat = stdMaterial({ color: 0x14203a, roughness: 0.5, metalness: 0.05 });
    const tagMat = stdMaterial({ color: 0xe6d24a, roughness: 0.85, metalness: 0 });
    const placed = [];
    const slab = (w, d, h, x, z, top, mat, name, yawDeg = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, top + h / 2, z);
      if (yawDeg) m.rotation.y = THREE.MathUtils.degToRad(yawDeg);
      m.name = name; m.castShadow = false; g.add(m); placed.push(m); return m;
    };
    const cyl = (r, h, x, z, top, mat, name, rotX = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), mat);
      m.position.set(x, top + h / 2, z);
      if (rotX) m.rotation.x = rotX;
      m.name = name; m.castShadow = false; g.add(m); placed.push(m); return m;
    };

    slab(0.20, 0.14, 0.014, -5.95, -2.88, TOP_Y, darkMat, 'ClerkTerminalFoot');
    slab(0.05, 0.05, 0.16, -5.95, -2.88, TOP_Y + 0.014, darkMat, 'ClerkTerminalStem');
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.29, 0.018), darkMat);
    panel.position.set(-5.95, TOP_Y + 0.324, -2.875);
    panel.rotation.x = THREE.MathUtils.degToRad(-8);
    panel.name = 'ClerkTerminalPanel'; panel.castShadow = false; g.add(panel); placed.push(panel);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.432, 0.262, 0.004), screenMat);
    face.position.set(-5.95, TOP_Y + 0.324, -2.8635);
    face.rotation.x = THREE.MathUtils.degToRad(-8);
    face.name = 'ClerkTerminalScreen'; face.castShadow = false; g.add(face); placed.push(face);

    slab(0.32, 0.125, 0.018, -5.80, -2.42, TOP_Y, darkMat, 'ClerkKeyboard');
    slab(0.296, 0.104, 0.003, -5.80, -2.42, TOP_Y + 0.018, stdMaterial({
      color: 0x2b2d33, roughness: 0.7, metalness: 0.05 }), 'ClerkKeyboardKeys');

    slab(0.30, 0.24, 0.014, -5.20, -2.46, TOP_Y, bookMat, 'ClerkMinuteBookBoard');
    slab(0.140, 0.222, 0.008, -5.274, -2.455, TOP_Y + 0.014, paperMat, 'ClerkMinuteBookLeafL');
    slab(0.140, 0.222, 0.008, -5.126, -2.455, TOP_Y + 0.014, paperMat, 'ClerkMinuteBookLeafR');
    slab(0.012, 0.226, 0.016, -5.20, -2.455, TOP_Y + 0.014, bookMat, 'ClerkMinuteBookSpine');
    cyl(0.005, 0.135, -5.02, -2.50, TOP_Y + 0.004, inkMat, 'ClerkPen', Math.PI / 2);

    slab(0.072, 0.056, 0.030, -5.36, -2.86, TOP_Y, darkMat, 'ClerkExhibitStampBase');
    cyl(0.009, 0.052, -5.36, -2.86, TOP_Y + 0.030, metalMat, 'ClerkExhibitStampPost');
    cyl(0.026, 0.020, -5.36, -2.86, TOP_Y + 0.082, bookMat, 'ClerkExhibitStampKnob');

    slab(0.150, 0.092, 0.016, -5.58, -2.86, TOP_Y, darkMat, 'ClerkExhibitTagTray');
    slab(0.126, 0.070, 0.010, -5.58, -2.86, TOP_Y + 0.016, tagMat, 'ClerkExhibitTags');

    cyl(0.042, 0.012, -5.02, -2.74, TOP_Y, darkMat, 'ClerkMicBase');
    cyl(0.006, 0.175, -5.02, -2.74, TOP_Y + 0.012, metalMat, 'ClerkMicStem');
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, 0.048, 10), darkMat);
    cap.position.set(-5.02, TOP_Y + 0.205, -2.715);
    cap.rotation.x = THREE.MathUtils.degToRad(28);
    cap.name = 'ClerkMicCapsule'; cap.castShadow = false; g.add(cap); placed.push(cap);

    slab(0.190, 0.252, 0.008, -4.98, -2.86, TOP_Y, folderMat, 'ClerkFile0', 3);
    slab(0.190, 0.252, 0.008, -4.98, -2.86, TOP_Y + 0.008, folderMat, 'ClerkFile1', -4);
    slab(0.190, 0.252, 0.008, -4.98, -2.86, TOP_Y + 0.016, folderMat, 'ClerkFile2', 1);

    let off = 0;
    for (const m of placed) {
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      const x0 = m.position.x + bb.min.x, x1 = m.position.x + bb.max.x;
      const z0 = m.position.z + bb.min.z, z1 = m.position.z + bb.max.z;
      if (x0 < CLERK_TOP_X0 || x1 > CLERK_TOP_X1 || z0 < CLERK_TOP_Z0 || z1 > CLERK_TOP_Z1) {
        off++;
        console.warn('[courtsim] clerk_prop_OFF_DESK name=', m.name,
          'x=', x0.toFixed(3) + '..' + x1.toFixed(3),
          'z=', z0.toFixed(3) + '..' + z1.toFixed(3),
          'desk_x=', CLERK_TOP_X0.toFixed(3) + '..' + CLERK_TOP_X1.toFixed(3),
          'desk_z=', CLERK_TOP_Z0.toFixed(3) + '..' + CLERK_TOP_Z1.toFixed(3),
          '-- this prop hangs off the desk. Reported, not clamped: a prop',
          'silently pulled inboard is how a layout stops matching its own',
          'comment.');
      }
    }
    console.log('[courtsim] clerk_station_BUILT props=', placed.length,
      'off_desk=', off, 'desk_top_y=', TOP_Y, 'seat_z=', CLERK_SEAT_Z,
      'keyboard_deck_y=', (TOP_Y + 0.018).toFixed(3),
      'minute_book_top_y=', (TOP_Y + 0.022).toFixed(3),
      '-- COURTSIM-CLERK-061: the clerk swears witnesses, marks exhibits,',
      'keeps the minutes and calls the docket, and now has the equipment for',
      'each. Her two hands are solved to the keyboard and the minute book by',
      'name, not to wherever an arm happened to reach.');
  }

  _buildCounselTableProps(g, v) {
    const TOP_Y = 0.75;                 // both counsel tabletops, measured
    const paperMat = stdMaterial({ color: 0xf2f0e8, roughness: 0.92, metalness: 0 });
    const padMat = stdMaterial({ color: 0xe8d98a, roughness: 0.9, metalness: 0 });
    const folderMat = stdMaterial({ color: 0xc8a96a, roughness: 0.88, metalness: 0 });
    const darkMat = stdMaterial({ color: 0x1a1a1e, roughness: 0.45, metalness: 0.1 });
    const inkMat = stdMaterial({ color: 0x14203a, roughness: 0.5, metalness: 0.05 });
    const glassMat = stdMaterial({
      color: 0xdbe7ee, roughness: 0.12, metalness: 0,
      transparent: true, opacity: 0.38,
    });
    const placed = [];
    const slab = (w, d, h, x, z, top, mat, name, yawDeg = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, top + h / 2, z);
      if (yawDeg) m.rotation.y = THREE.MathUtils.degToRad(yawDeg);
      m.name = name;
      m.castShadow = false;
      g.add(m);
      placed.push(m);
      return m;
    };
    const cyl = (r, h, x, z, top, mat, name) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, 12), mat);
      m.position.set(x, top + h / 2, z);
      m.name = name;
      m.castShadow = false;
      g.add(m);
      placed.push(m);
      return m;
    };

    slab(0.216, 0.356, 0.008, -2.242, 1.000, TOP_Y, padMat, 'CounselPropLegalPadA');
    slab(0.206, 0.340, 0.002, -2.242, 0.996, TOP_Y + 0.008, paperMat, 'CounselPropPadSheetA');
    slab(0.210, 0.297, 0.002, -1.450, 0.620, TOP_Y, paperMat, 'CounselPropPapersA', -9);
    slab(0.240, 0.320, 0.010, -2.780, 0.600, TOP_Y, folderMat, 'CounselPropFolderA', 4);
    cyl(0.033, 0.095, -1.100, 0.950, TOP_Y, glassMat, 'CounselPropGlassA');

    slab(0.216, 0.356, 0.008, 1.836, 1.030, TOP_Y, padMat, 'CounselPropLegalPadWriteB', -3);
    slab(0.206, 0.340, 0.002, 1.836, 1.026, TOP_Y + 0.008, paperMat, 'CounselPropPadSheetWriteB', -3);
    slab(0.240, 0.320, 0.012, 1.220, 1.040, TOP_Y, folderMat, 'CounselPropFolderB', 5);
    slab(0.200, 0.280, 0.006, 1.160, 0.660, TOP_Y, paperMat, 'CounselPropBinderLeafB0');
    slab(0.200, 0.280, 0.006, 1.370, 0.660, TOP_Y, paperMat, 'CounselPropBinderLeafB1');
    slab(0.024, 0.290, 0.014, 1.265, 0.660, TOP_Y, inkMat, 'CounselPropBinderSpineB');
    slab(0.216, 0.356, 0.008, 2.700, 0.585, TOP_Y, padMat, 'CounselPropLegalPadB', 6);
    const LAPTOP_B_X = 2.220;
    const LAPTOP_B_Z = 1.060;
    const LAPTOP_B_YAW_DEG = -22;
    const LAPTOP_W = 0.320;          // across the machine
    const LAPTOP_D = 0.220;          // front to back
    const LAPTOP_BASE_T = 0.018;
    const LID_H = 0.200;
    const LID_T = 0.010;
    const LID_TILT_DEG = -22;        // past vertical, leaning back
    const lapTh = THREE.MathUtils.degToRad(LAPTOP_B_YAW_DEG);
    const deckY = TOP_Y + LAPTOP_BASE_T;
    const lap = new THREE.Group();
    lap.name = 'CounselPropLaptopB';
    lap.position.set(LAPTOP_B_X, 0, LAPTOP_B_Z);
    lap.rotation.y = lapTh;
    g.add(lap);
    const lapPart = (size, at, mat, nm, parent) => {
      const mm = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      mm.position.set(at[0], at[1], at[2]);
      mm.name = nm;
      mm.castShadow = false;
      (parent || lap).add(mm);
      return mm;
    };
    const base = lapPart([LAPTOP_W, LAPTOP_BASE_T, LAPTOP_D],
      [0, TOP_Y + LAPTOP_BASE_T / 2, 0], darkMat, 'CounselPropLaptopBaseB');
    placed.push(base);
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(LAPTOP_W * 0.94, LAPTOP_D * 0.90),
      new THREE.MeshStandardMaterial({
        map: makeLaptopDeckTexture(), roughness: 0.55, metalness: 0.05,
      }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, deckY + 0.0006, 0.004);
    deck.name = 'CounselPropLaptopDeckB';
    lap.add(deck);
    const hingeZ = -LAPTOP_D / 2 + 0.009;
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, LAPTOP_W * 0.92, 10), darkMat);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, deckY + 0.004, hingeZ);
    hinge.name = 'CounselPropLaptopHingeB';
    hinge.castShadow = false;
    lap.add(hinge);
    const lidPivot = new THREE.Group();
    lidPivot.name = 'CounselPropLaptopLidPivotB';
    lidPivot.position.set(0, deckY + 0.004, hingeZ);
    lidPivot.rotation.x = THREE.MathUtils.degToRad(LID_TILT_DEG);
    lap.add(lidPivot);
    const lid = lapPart([LAPTOP_W, LID_H, LID_T], [0, LID_H / 2, -LID_T / 2],
      darkMat, 'CounselPropLaptopLidB', lidPivot);
    placed.push(lid);
    const SCR_W = LAPTOP_W * 0.90, SCR_H = LID_H * 0.84;
    const scr = this._makeTranscriptScreen(SCR_W, SCR_H, {
      name: 'CounselLaptopScreenB', kind: 'counsel',
    });
    this._counselScreen = scr.userData.courtsimScreen;
    scr.position.set(0, LID_H / 2, 0.001);
    lidPivot.add(scr);
    lap.updateMatrixWorld(true);
    {
      const invB = new THREE.Matrix4().copy(base.matrixWorld).invert();
      const lidBottom = new THREE.Vector3(0, 0, 0).applyMatrix4(lidPivot.matrixWorld)
        .applyMatrix4(invB);
      const lidTopW = new THREE.Vector3(0, LID_H, 0).applyMatrix4(lidPivot.matrixWorld);
      console.log('[courtsim] counsel_laptop_built base_centre=',
        LAPTOP_B_X + ',' + LAPTOP_B_Z, 'yaw_deg=', LAPTOP_B_YAW_DEG,
        'base_depth_m=', LAPTOP_D,
        'HINGE_FORWARD_OF_BACK_EDGE_m=', (lidBottom.z - (-LAPTOP_D / 2)).toFixed(4),
        '(shipped build: 0.0395)',
        'lid_tilt_deg=', LID_TILT_DEG,
        'lid_top_world_y=', lidTopW.y.toFixed(4),
        'screen=', SCR_W.toFixed(3) + 'x' + SCR_H.toFixed(3),
        'deck_texture=', 'keyboard+trackpad',
        'transcript_sink=', 'setReporterScreenText mirror',
        '-- COURTSIM-PROPS-033 item 5. A hinge that is not on the back edge is',
        'the founder\'s "the screen part isn\'t at the back, it\'s more forward".');
      if (Math.abs(lidBottom.z - (-LAPTOP_D / 2)) > 0.012) {
        console.error('[courtsim] LAPTOP_HINGE_NOT_AT_BACK forward_m=',
          (lidBottom.z - (-LAPTOP_D / 2)).toFixed(4),
          '-- the lid pivot has drifted off the base\'s back edge again.');
      }
    }
    cyl(0.033, 0.095, 1.020, 1.060, TOP_Y, glassMat, 'CounselPropGlassB');

    const bb = new THREE.Box3();
    const infos = [];
    for (const m of placed) {
      m.updateMatrixWorld(true);
      bb.setFromObject(m);
      const cx = (bb.min.x + bb.max.x) / 2;
      const tableX = cx < 0 ? -COUNSEL_TABLE_X : COUNSEL_TABLE_X;
      const x0 = tableX - COUNSEL_TABLE_W / 2 - 0.03;
      const x1 = tableX + COUNSEL_TABLE_W / 2 + 0.03;
      const onTable = bb.min.x >= x0 - 1e-6 && bb.max.x <= x1 + 1e-6
        && bb.min.z >= COUNSEL_TOP_Z0 - 1e-6 && bb.max.z <= COUNSEL_TOP_Z1 + 1e-6;
      const sunk = TOP_Y - bb.min.y;
      infos.push({
        name: m.name, table: cx < 0 ? 'A' : 'B', onTable, sunk,
        box: [bb.min.x, bb.min.z, bb.max.x, bb.max.z], minY: bb.min.y,
        b: bb.clone(),
      });
      if (!onTable) {
        console.warn('[courtsim] counsel_prop_OFF_TABLE name=', m.name,
          'x=', bb.min.x.toFixed(3) + '..' + bb.max.x.toFixed(3),
          'z=', bb.min.z.toFixed(3) + '..' + bb.max.z.toFixed(3),
          '-- outside its own tabletop footprint.');
      }
      if (sunk > 1e-4) {
        console.warn('[courtsim] counsel_prop_INSIDE_TABLE name=', m.name,
          sunk.toFixed(4), 'm below the', TOP_Y, 'top face.');
      }
    }
    let overlaps = 0;
    for (let i = 0; i < infos.length; i++) {
      for (let j = i + 1; j < infos.length; j++) {
        const A = infos[i], B = infos[j];
        if (A.table !== B.table) continue;
        const pair = A.name + '|' + B.name;
        const pairOk = (/LaptopLid/.test(pair) && /LaptopBase/.test(pair))
          || /BinderSpine/.test(pair)
          || /PadSheet/.test(pair);
        if (pairOk) continue;
        if (A.b.intersectsBox(B.b)) {
          overlaps++;
          console.warn('[courtsim] counsel_prop_OVERLAP', A.name, 'x', B.name);
        }
      }
    }
    console.log('[courtsim] counsel_props_BUILT n=', placed.length,
      'tableA=', infos.filter((i) => i.table === 'A').length,
      'tableB=', infos.filter((i) => i.table === 'B').length,
      'off_table=', infos.filter((i) => !i.onTable).length,
      'sunk_into_table=', infos.filter((i) => i.sunk > 1e-4).length,
      'overlaps=', overlaps,
      'lowest_prop_y=', Math.min(...infos.map((i) => i.minY)).toFixed(4),
      'tabletop_y=', TOP_Y,
      '-- COURTSIM-IDLE-PROPS-012.');
  }

  _buildBarRail(g, v) {
    const WALL_FACE = 7.695;                 // side wall panelling front faces
    const T = 0.12;                          // slab thickness, as the jury rail
    const woodMat = () => woodMaterial(v.wainscotColor);
    const runLen = WALL_FACE + 0.02 - BAR_GATE_HALF;   // 7.075
    const runMid = BAR_GATE_HALF + runLen / 2;         // 4.1775, each run's centre
    const BAR_BAYS = 9;
    const bay = runLen / BAR_BAYS;                     // 0.7861 -- see the note above

    for (const sx of [-1, 1]) {
      const midX = sx * runMid;
      box(g, [runLen, BAR_RAIL_TOP + 0.004, T], [midX, BAR_RAIL_TOP / 2 - 0.002, BAR_RAIL_Z],
        woodMat(), 'BarRail');
      box(g, [runLen + 0.24, 0.05, 0.24], [midX, BAR_RAIL_TOP + 0.02, BAR_RAIL_Z],
        woodMat(), 'BarRailCap');
      box(g, [runLen + 0.10, 0.116, T + 0.04], [midX, 0.056, BAR_RAIL_Z],
        woodMat(), 'BarRailPlinth');
      for (let i = 0; i < BAR_BAYS; i++) {
        const px = sx * (BAR_GATE_HALF + bay * (i + 0.5));
        for (const sz of [-1, 1]) {
          box(g, [bay - 0.14, BAR_RAIL_TOP - 0.34, 0.03],
            [px, BAR_RAIL_TOP / 2, BAR_RAIL_Z + sz * (T / 2 + 0.01)],
            woodMat(), 'BarRailRaisedPanel');
        }
      }
    }
    const POST_H = BAR_RAIL_TOP + 0.12;
    const postAt = [];
    for (const sx of [-1, 1]) {
      postAt.push(sx * 7.63, sx * 0.60);
      for (const k of [3, 6]) postAt.push(sx * (BAR_GATE_HALF + bay * k));
    }
    for (const px of postAt) {
      box(g, [0.14, POST_H + 0.006, 0.18], [px, (POST_H - 0.006) / 2, BAR_RAIL_Z],
        woodMat(), 'BarRailPost');
      box(g, [0.20, 0.045, 0.24], [px, POST_H + 0.0025, BAR_RAIL_Z], woodMat(), 'BarRailPostCap');
    }
  }

  _buildMedallion(groupName) {
    const sealBright = stdMaterial({ color: 0xc9a85a, metalness: 0.72, roughness: 0.26 });
    const sealDeep = stdMaterial({ color: 0x8d7433, metalness: 0.55, roughness: 0.52 });
    const sealGroup = new THREE.Group();
    sealGroup.name = groupName;
    const sealProfile = [
      [0.000, 0.000], [0.500, 0.000], [0.500, 0.030], [0.470, 0.052],
      [0.455, 0.050], [0.430, 0.026], [0.410, 0.030], [0.395, 0.055],
      [0.370, 0.052], [0.355, 0.036], [0.250, 0.040], [0.150, 0.048],
      [0.070, 0.070], [0.030, 0.078], [0.000, 0.080],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const sealBody = new THREE.Mesh(new THREE.LatheGeometry(sealProfile, 40), sealBright);
    sealBody.rotation.x = Math.PI / 2;
    sealBody.name = 'SealBody';
    sealGroup.add(sealBody);
    const sealField = new THREE.Mesh(
      new THREE.CylinderGeometry(0.345, 0.345, 0.004, 40), sealDeep);
    sealField.rotation.x = Math.PI / 2;
    sealField.position.z = 0.0405;
    sealField.name = 'SealField';
    sealGroup.add(sealField);
    const sealRope = new THREE.Mesh(new THREE.TorusGeometry(0.300, 0.013, 8, 44), sealBright);
    sealRope.position.z = 0.050;
    sealRope.name = 'SealRope';
    sealGroup.add(sealRope);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + Math.PI / 2;
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), sealBright);
      stud.position.set(Math.cos(a) * 0.325, Math.sin(a) * 0.325, 0.050);
      stud.scale.set(1, 1, 0.65);      // a cast boss, not a ball stuck on
      stud.name = 'SealStud';
      sealGroup.add(stud);
    }
    return sealGroup;
  }

  _buildDoorSet(g, v, pos, yaw, name) {
    const OPEN_W = DOOR_OPEN_W, OPEN_H = DOOR_OPEN_H, CASE_W = DOOR_CASE_W;
    const REVEAL = 0.13;                         // depth of the built recess
    const leafT = 0.055, leafZ = 0.0225;         // spans -0.005 .. +0.050
    const doorWood = woodMaterial(v.wainscotColor);
    const panelWood = woodMaterial(
      new THREE.Color(v.wainscotColor).lerp(new THREE.Color(0xffffff), 0.12).getHex());
    const darkWood = woodMaterial(WOOD_DARK);
    const brass = stdMaterial({ color: 0xb08d3f, metalness: 0.75, roughness: 0.32 });

    const grp = new THREE.Group();
    grp.name = name;
    grp.position.set(pos[0], pos[1], pos[2]);
    grp.rotation.y = yaw;
    const part = (size, at, mat, partName) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      m.position.set(at[0], at[1], at[2]);
      m.name = partName;
      grp.add(m);
      return m;
    };

    const linD = REVEAL;                          // -0.075 .. +0.055
    const linZ = -0.010;
    for (const sx of [-1, 1]) {
      part([0.06, OPEN_H + 0.06, linD], [sx * (OPEN_W / 2 + 0.03), (OPEN_H + 0.06) / 2, linZ],
        darkWood, `${name}JambLining`);
    }
    part([OPEN_W + 0.12, 0.06, 0.126], [0, OPEN_H + 0.03, linZ - 0.002],
      darkWood, `${name}HeadLining`);
    part([OPEN_W + 0.16, OPEN_H + 0.06, 0.03], [0, (OPEN_H + 0.06) / 2, -0.060],
      darkWood, `${name}RecessBack`);

    for (const sx of [-1, 1]) {
      const leafX = sx * 0.4475;
      part([0.885, OPEN_H - 0.02, leafT], [leafX, (OPEN_H - 0.02) / 2, leafZ],
        doorWood, `${name}Leaf`);
      part([0.62, 1.16, 0.020], [leafX, 1.86, 0.058], panelWood, `${name}Panel`);
      part([0.62, 0.96, 0.020], [leafX, 0.62, 0.058], panelWood, `${name}Panel`);
      part([0.05, 0.17, 0.012], [sx * 0.085, 1.05, 0.056], brass, `${name}Plate`);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.10, 12), brass);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(sx * 0.085, 1.05, 0.100);
      knob.name = `${name}Handle`;
      grp.add(knob);
      for (const hy of [0.34, 1.35, 2.36]) {
        part([0.030, 0.13, 0.026], [sx * 0.893, hy, 0.033], brass, `${name}Hinge`);
      }
    }
    part([0.030, OPEN_H - 0.06, 0.016], [0, (OPEN_H - 0.06) / 2, 0.058],
      doorWood, `${name}Astragal`);

    for (const sx of [-1, 1]) {
      part([0.026, OPEN_H, 0.014], [sx * (OPEN_W / 2 - 0.013), OPEN_H / 2, 0.055],
        darkWood, `${name}Stop`);
    }
    part([OPEN_W - 0.052, 0.026, 0.014], [0, OPEN_H - 0.013, 0.055], darkWood, `${name}Stop`);

    const QUIRK_BB = 0.006, QUIRK_ARCH = 0.010;
    const bbW = CASE_W + 0.07;
    const bbX = OPEN_W / 2 + QUIRK_BB + bbW / 2;        // 1.016, outer face 1.126
    const archX = OPEN_W / 2 + QUIRK_ARCH + CASE_W / 2; // 0.985, outer face 1.060
    const jambH = OPEN_H + CASE_W;
    for (const sx of [-1, 1]) {
      part([bbW, jambH + 0.05, 0.170], [sx * bbX, (jambH + 0.05) / 2, 0.025],
        doorWood, `${name}Backband`);
      part([CASE_W, jambH, 0.055], [sx * archX, jambH / 2, 0.1025], doorWood, `${name}Jamb`);
    }
    const headW = 2 * (bbX + bbW / 2);                  // 2.252
    const headArchW = 2 * (archX + CASE_W / 2);         // 2.120
    part([headW, bbW, 0.172], [0, OPEN_H + bbW / 2, 0.026],
      doorWood, `${name}HeadBackband`);
    part([headArchW, CASE_W, 0.057], [0, OPEN_H + CASE_W / 2, 0.1035],
      doorWood, `${name}Head`);
    for (const sx of [-1, 1]) {
      part([0.264, 0.304, 0.150], [sx * 1.034, 0.148, 0.015],
        doorWood, `${name}PlinthBlock`);
    }
    part([headW + 0.24, 0.11, 0.225], [0, OPEN_H + CASE_W + 0.125, 0.0525],
      doorWood, `${name}Cornice`);
    part([headW + 0.10, 0.055, 0.198], [0, OPEN_H + CASE_W + 0.045, 0.041],
      doorWood, `${name}CorniceBed`);
    part([OPEN_W - 0.01, 0.032, REVEAL - 0.01], [0, 0.013, -0.005], darkWood, `${name}Threshold`);

    g.add(grp);
    return grp;
  }

  _buildJuryBox(g, v) {
    const zMid = (JURY_BOX_Z_MIN + JURY_BOX_Z_MAX) / 2;
    const zLen = JURY_BOX_Z_MAX - JURY_BOX_Z_MIN;
    const woodMat = () => woodMaterial(v.wainscotColor);

    const frontTierX0 = JURY_RAIL_X + 0.06;   // inner face of the front rail
    const frontTierX1 = (JURY_ROW_X_FRONT + JURY_ROW_X_BACK) / 2;  // the riser edge, between the rows
    const backTierX1 = JURY_BACK_X - 0.06;    // inner face of the back panel
    box(g, [frontTierX1 - frontTierX0, JURY_TIER_FRONT_H, zLen],
      [(frontTierX0 + frontTierX1) / 2, JURY_TIER_FRONT_H / 2, zMid], woodMat(), 'JuryTierFront');
    box(g, [backTierX1 - frontTierX1, JURY_TIER_BACK_H, zLen],
      [(frontTierX1 + backTierX1) / 2, JURY_TIER_BACK_H / 2, zMid], woodMat(), 'JuryTierBack');

    box(g, [0.12, JURY_RAIL_TOP, zLen], [JURY_RAIL_X, JURY_RAIL_TOP / 2, zMid], woodMat(), 'JuryRailFront');
    box(g, [0.24, 0.05, zLen + 0.24], [JURY_RAIL_X, JURY_RAIL_TOP + 0.02, zMid], woodMat(), 'JuryRailCap');
    const nPanels = Math.max(4, Math.round(zLen / 0.775));
    for (let i = 0; i < nPanels; i++) {
      const pz = JURY_BOX_Z_MIN + zLen * (i + 0.5) / nPanels;
      box(g, [0.03, JURY_RAIL_TOP - 0.34, zLen / nPanels - 0.14],
        [JURY_RAIL_X - 0.07, JURY_RAIL_TOP / 2, pz], woodMat(), 'JuryRailRaisedPanel');
    }

    const boxWidthX = JURY_BACK_X + 0.05 - (JURY_RAIL_X - 0.06);
    const boxMidX = (JURY_RAIL_X - 0.06 + JURY_BACK_X + 0.05) / 2;
    for (const endZ of [JURY_BOX_Z_MIN - 0.06, JURY_BOX_Z_MAX + 0.06]) {
      box(g, [boxWidthX, JURY_RAIL_TOP, 0.12], [boxMidX, JURY_RAIL_TOP / 2, endZ], woodMat(), 'JuryRailEnd');
      box(g, [boxWidthX + 0.10, 0.048, 0.24], [boxMidX, JURY_RAIL_TOP + 0.019, endZ], woodMat(), 'JuryRailEndCap');
    }

    box(g, [0.12, JURY_BACK_TOP, zLen + 0.30], [JURY_BACK_X, JURY_BACK_TOP / 2, zMid], woodMat(), 'JuryBackPanel');
    box(g, [0.24, 0.05, zLen + 0.42], [JURY_BACK_X, JURY_BACK_TOP + 0.02, zMid], woodMat(), 'JuryBackCap');

    for (const j of JURORS) {
      chair(g, [j.pos[0], j.pos[1] + CHAIR_RISE, j.pos[2]], {
        facing: yawToward(j.pos[0], j.pos[2], WELL_FOCUS[0], WELL_FOCUS[1]),
        seatColor: JURY_UPHOLSTERY,
        armrests: !!j.chairArms,
        name: 'JuryChair',
        slide: 0.24,
      });
    }
  }

  _buildDepositionRoom() {
    const v = this.venue;
    const g = this.venueGroup;
    const wallH = 4.6;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), wallMaterial(v.floorColor, 0.6));
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);
    box(g, [12, 0.2, 10], [0, wallH, 0], wallMaterial(v.ceilingColor, 0.9), 'Ceiling');

    if (v.glassWalls) {
      const frameMat = stdMaterial({ color: 0xbfc2c4, roughness: 0.3 });
      for (const gx of [-4, -1.3, 1.3, 4]) {
        box(g, [0.1, wallH, 0.1], [gx, wallH / 2, -5], frameMat, 'RearWallMullion');
      }
      const glassMat = new THREE.MeshStandardMaterial({ color: 0xd9ebf0, roughness: 0.05, transparent: true, opacity: 0.25 });
      box(g, [11.8, wallH - 0.2, 0.04], [0, wallH / 2, -5], glassMat, 'RearWallGlass');
      box(g, [0.15, wallH, 10], [-6, wallH / 2, 0], wallMaterial(v.wallColor, 0.85), 'LeftWall');
      box(g, [0.15, wallH, 10], [6, wallH / 2, 0], wallMaterial(v.wallColor, 0.85), 'RightWall');
    } else {
      box(g, [12, wallH, 0.3], [0, wallH / 2, -5], wallMaterial(v.wallColor, 0.9), 'RearWall');
      box(g, [0.3, wallH, 10], [-6, wallH / 2, 0], wallMaterial(v.wallColor, 0.85), 'LeftWall');
      box(g, [0.3, wallH, 10], [6, wallH / 2, 0], wallMaterial(v.wallColor, 0.85), 'RightWall');
    }
    box(g, [12, wallH, 0.3], [0, wallH / 2, 5], wallMaterial(v.wallColor, 0.9), 'FrontWall');

    if (v.bookshelfWall) {
      box(g, [0.15, wallH - 0.5, 9.6], [5.85, wallH / 2, 0], woodMaterial(v.tableColor), 'BookshelfCarcass');
      for (const shelfY of [0.8, 1.6, 2.4, 3.2]) {
        box(g, [0.4, 0.05, 9.4], [5.7, shelfY, 0], woodMaterial(v.tableColor), 'BookshelfShelf');
      }
    }

    desk(g, [4.4, 0.75, 1.8], [0, 0.375, 0], woodMaterial(v.tableColor), 'ConferenceTable');
    box(g, [0.5, 0.03, 0.35], [-1.2, 0.762, 0.5], stdMaterial({ color: 0x141416, roughness: 0.3 }), 'Laptop');
    box(g, [0.3, 0.03, 0.22], [0.8, 0.762, -0.5], stdMaterial({ color: 0xebe6dc, roughness: 0.8 }), 'Papers');

    const sideSign = v.reporterSide === 'left' ? -1 : 1;
    this._reporterStation = { x: sideSign * 2.75, z: 0, deskZ: 0, deskTopY: 0.75,
                              target: [-sideSign * 0.6, 1.35, 0] };
    for (const def of Object.values(DEPOSITION_SEATS)) {
      chair(g, [def.pos[0], FLOOR_Y + CHAIR_RISE, def.pos[2]], {
        facing: def.faceYaw,
        seatColor: v.chairColor, armrests: !!def.chairArms, name: 'DepoChair',
      });
    }
    chair(g, [sideSign * 2.6, FLOOR_Y + CHAIR_RISE, 0], {
      facing: yawToward(sideSign * 2.6, 0, 0, 0), seatColor: v.chairColor, name: 'DepoChairReporter',
    });
  }

  _fitGavelToFist(model, hand, gavelGroup, comp) {
    const nmR = (s) => model.getObjectByName('Bip01 R ' + s) || model.getObjectByName('Bip01_R_' + s);
    model.updateWorldMatrix(true, true);
    hand.updateWorldMatrix(true, false);
    const toLocal = new THREE.Matrix4().copy(hand.matrixWorld).invert();
    const L = (b) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(toLocal);
    const cs = [];
    for (const f of [1, 2, 3, 4]) {
      const b0 = nmR('Finger' + f), b2 = nmR('Finger' + f + '2');
      if (!b0 || !b2) continue;
      cs.push({ f, c: L(b0).add(L(b2)).multiplyScalar(0.5) });
    }
    if (cs.length < 3) return null;
    const C = new THREE.Vector3();
    for (const o of cs) C.add(o.c);
    C.multiplyScalar(1 / cs.length);
    const seed = cs[0].c.clone().sub(cs[cs.length - 1].c);
    if (seed.lengthSq() < 1e-12) return null;
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const o of cs) {
      const d = o.c.clone().sub(C); const a = [d.x, d.y, d.z];
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) M[p][q] += a[p] * a[q];
    }
    let v = [seed.x, seed.y, seed.z];
    for (let it = 0; it < 40; it++) {
      const w = [0, 0, 0];
      for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) w[p] += M[p][q] * v[q];
      const n = Math.hypot(w[0], w[1], w[2]);
      if (!(n > 1e-12)) break;
      v = [w[0] / n, w[1] / n, w[2] / n];
    }
    const A = new THREE.Vector3(v[0], v[1], v[2]).normalize();
    if (A.dot(seed) < 0) A.negate();       // +A points toward the INDEX side, where the head goes
    const iK = nmR('Finger1'), pK = nmR('Finger4');
    let palm = null;
    if (iK && pK) {
      const pi = L(iK), pp = L(pK);
      const across = pp.clone().sub(pi);
      const long = pi.clone().add(pp).multiplyScalar(0.5);
      if (across.lengthSq() > 1e-12 && long.lengthSq() > 1e-12) {
        palm = new THREE.Vector3().crossVectors(across.normalize(), long.normalize())
          .normalize().multiplyScalar(-1);
        palm.addScaledVector(A, -palm.dot(A));
        if (palm.lengthSq() > 1e-12) palm.normalize(); else palm = null;
      }
    }
    const P = C.clone();
    if (palm) P.addScaledVector(palm, GAVEL_SHAFT_OFF_PALM * comp);
    gavelGroup.quaternion.setFromUnitVectors(_AXIS_X, A);
    gavelGroup.position.copy(P);
    gavelGroup.userData.__gripPos = gavelGroup.position.clone();
    gavelGroup.updateMatrixWorld(true);
    this._closeThumbOnShaft(model, hand, P, A);
    return { C, A, palm, P, cs };
  }

  _closeThumbOnShaft(model, hand, C, A) {
    const rig = model.userData && model.userData.courtsimGavelRig;
    if (!rig) return null;
    const thumb = rig.chains.find((c) => c.f === 0);
    const index = rig.chains.find((c) => c.f === 1);
    const pinky = rig.chains.find((c) => c.f === 4);
    if (!thumb || !index || !pinky || thumb.bones.length < 2) return null;
    hand.updateWorldMatrix(true, false);
    const M = hand.matrixWorld;
    const Cw = C.clone().applyMatrix4(M);
    const Aw = A.clone().transformDirection(M).normalize();
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const dist = (p) => {
      const v = p.clone().sub(Cw);
      return v.addScaledVector(Aw, -v.dot(Aw)).length();
    };
    const across = wp(pinky.bones[0]).sub(wp(index.bones[0]));
    if (across.lengthSq() < 1e-12) return null;
    across.normalize();
    const pq = new THREE.Quaternion();
    if (thumb.bones[0].parent) thumb.bones[0].parent.getWorldQuaternion(pq);
    const oppAxis = across.clone().applyQuaternion(pq.clone().invert()).normalize();
    const setT = (opp, fx) => {
      const spec = [opp, fx, fx * 0.6];
      const axes = [oppAxis, null, null];
      for (let i = 0; i < thumb.bones.length && i < spec.length; i++) {
        _scratchQuat2.setFromAxisAngle(axes[i] || thumb.axes[i], THREE.MathUtils.degToRad(spec[i]));
        thumb.bones[i].quaternion.copy(thumb.rest[i]).premultiply(_scratchQuat2);
      }
      thumb.bones[0].updateMatrixWorld(true);
    };
    const tip = thumb.bones[thumb.bones.length - 1];
    const idxTip = index.bones[index.bones.length - 1];
    const TARGET = 0.0125 + 0.0075;      // shaft radius plus half a thumb
    let best = null; const trials = [];
    for (let opp = -110; opp <= 110; opp += 5) {
      for (let fx = -10; fx <= 70; fx += 5) {
        setT(opp, fx);
        const err = Math.abs(dist(wp(tip)) - TARGET);
        const pinch = wp(tip).distanceTo(wp(idxTip));
        trials.push({ opp, fx, err, pinch });
        if (!best || err < best.err) best = { opp, fx, err, pinch };
      }
    }
    const tol = best.err + 0.002;
    for (const t of trials) if (t.err <= tol && t.pinch < best.pinch) best = t;
    setT(best.opp, best.fx);
    model.updateWorldMatrix(true, true);
    return { opposition: best.opp, flex: best.fx, err: best.err,
      thumbToAxisMm: dist(wp(tip)) * 1000 };
  }

  _levelGavelHead(gavelGroup, gavelHeadPivot) {
    const groupQuat = new THREE.Quaternion();
    gavelGroup.getWorldQuaternion(groupQuat);
    const handleWorld = _AXIS_X.clone().applyQuaternion(groupQuat).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const headAxisWorld = up.clone().addScaledVector(handleWorld, -up.dot(handleWorld));
    if (headAxisWorld.lengthSq() <= 0.0076) return null;     // sin(5 deg)^2
    headAxisWorld.normalize();
    gavelHeadPivot.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      headAxisWorld.clone().applyQuaternion(groupQuat.clone().invert()).normalize());
    gavelGroup.updateMatrixWorld(true);
    return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(headAxisWorld.y))));
  }

  _landGavelOnBlock(model, gavelGroup, gavelHeadPivot, comp) {
    const yBias = (model.userData && model.userData.courtsimSeatYBias) || 0;
    const blk = this._soundBlockTop
      ? { x: this._soundBlockTop.x, y: this._soundBlockTop.y + yBias, z: this._soundBlockTop.z }
      : null;
    const aim = model.userData.courtsimGavelAim;
    const rig = model.userData.courtsimGavelRig;
    const arm = model.userData.courtsimGavelArm;
    const head = gavelGroup.getObjectByName('GavelHead');
    if (!blk || !aim || !rig || !arm || !arm.up || !arm.fo || !arm.ha || !head) {
      console.warn('[courtsim] gavel_landing_SKIPPED block=', !!blk, 'aim=', !!aim,
        'rig=', !!rig, 'arm=', !!arm, 'head=', !!head,
        '-- the gavel keeps the wrist height GAVEL_WRIST_ABOVE_WORKTOP gave it',
        'and _clampGavelToBlock stays load-bearing.');
      return null;
    }
    const { up, fo, ha, pole } = arm;
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const aimBone = (bone, child, dir) => {
      if (!bone || !child || !bone.parent) return;
      model.updateWorldMatrix(true, true);
      const cur = wp(child).sub(wp(bone));
      if (cur.lengthSq() < 1e-10) return;
      cur.normalize();
      const tgt = dir.clone().normalize();
      const ang = cur.angleTo(tgt);
      if (ang < 1e-4 || ang > Math.PI - 1e-3) return;
      const wq = new THREE.Quaternion().setFromUnitVectors(cur, tgt);
      const pq = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(pq);
      bone.quaternion.premultiply(pq.clone().invert().multiply(wq).multiply(pq));
      bone.updateMatrixWorld(true);
    };
    const T = wp(ha);
    let best = null;
    const PASSES = 6;
    for (let i = 0; i < PASSES; i++) {
      model.updateWorldMatrix(true, true);
      const S = wp(up);
      const L1 = wp(up).distanceTo(wp(fo));
      const L2 = wp(fo).distanceTo(wp(ha));
      const toT = T.clone().sub(S);
      let d = toT.length();
      const dMax = (L1 + L2) * 0.995, dMin = Math.abs(L1 - L2) + 1e-3;
      let reach = 'exact';
      if (d > dMax) { d = dMax; reach = 'CLAMPED_FAR'; } else if (d < dMin) { d = dMin; reach = 'CLAMPED_NEAR'; }
      const u = toT.clone().normalize();
      const perp = pole.clone().addScaledVector(u, -pole.dot(u));
      if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0).addScaledVector(u, u.y);
      perp.normalize();
      const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const E = S.clone().addScaledVector(u, L1 * Math.cos(alpha)).addScaledVector(perp, L1 * Math.sin(alpha));
      aimBone(up, fo, E.clone().sub(S));
      model.updateWorldMatrix(true, true);
      aimBone(fo, ha, T.clone().sub(wp(fo)));
      model.updateWorldMatrix(true, true);
      this._orientHand(rig, aim.long, aim.across);
      model.updateWorldMatrix(true, true);
      this._fitGavelToFist(model, rig.hand, gavelGroup, comp);
      this._levelGavelHead(gavelGroup, gavelHeadPivot);
      head.updateWorldMatrix(true, false);
      const hq = head.getWorldQuaternion(new THREE.Quaternion());
      const ay = Math.min(1, Math.abs(new THREE.Vector3(0, 1, 0).applyQuaternion(hq).y));
      const c = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
      const lowest = c.y - (0.0500 * ay + 0.0335 * Math.sqrt(Math.max(0, 1 - ay * ay)));
      const err = new THREE.Vector3(blk.x - c.x, (blk.y + 0.0005) - lowest, blk.z - c.z);
      best = { pass: i + 1, err: err.length(), reach, gapMm: (lowest - blk.y) * 1000, T: T.clone() };
      if (err.length() < 0.0008) break;
      T.add(err);
    }
    const st = this._animStates.find((s2) => s2.model === model);
    if (st) {
      if (st.armStanceBlend) {
        for (const e of st.armStanceBlend) {
          if (e.bone === up || e.bone === fo || e.bone === ha) e.sit.copy(e.bone.quaternion);
        }
      }
      if (st.rHandSitQ) st.rHandSitQ.copy(ha.quaternion);
      if (st.rHandRest) st.rHandRest.copy(ha.quaternion);
      st.rHandPinned = true;
      const Hw = wp(ha);
      const Sw = wp(up), Ew = wp(fo);
      const uw = Hw.clone().sub(Sw);
      let poleLocal = null;
      if (uw.lengthSq() > 1e-10) {
        uw.normalize();
        const perpW = Ew.clone().sub(Sw);
        perpW.addScaledVector(uw, -perpW.dot(uw));
        if (perpW.lengthSq() > 1e-9) {
          poleLocal = perpW.normalize()
            .applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
        }
      }
      if (poleLocal && fo.position.lengthSq() > 1e-12 && ha.position.lengthSq() > 1e-12) {
        if (!st.contactPins) st.contactPins = [];
        for (let i = st.contactPins.length - 1; i >= 0; i--) {
          if (st.contactPins[i].side === 'R') st.contactPins.splice(i, 1);
        }
        st.contactPins.push({
          side: 'R', up, fo, ha,
          A1: Sw.distanceTo(Ew), A2: Ew.distanceTo(Hw),
          local: model.worldToLocal(Hw.clone()),
          wq: ha.getWorldQuaternion(new THREE.Quaternion()),
          poleLocal,
          upLocalRest: up.quaternion.clone(),
          foLocalRest: fo.quaternion.clone(),
          foOff: fo.position.clone().normalize(),
          haOff: ha.position.clone().normalize(),
          what: 'sound block (gavel)',
          supportY: this._soundBlockTop ? this._soundBlockTop.y : 0,
          gavel: true,
        });
        console.log('[courtsim] gavel_hand_PINNED role= judge side= R',
          'pin_local=', st.contactPins[st.contactPins.length - 1].local.toArray()
            .map((n) => n.toFixed(3)).join(','),
          '-- the gavel hand now holds its world point against the breath, the',
          'same way every other resting hand in the room does. It releases for',
          'judgeInterject and above a standing blend.');
      } else {
        console.warn('[courtsim] gavel_hand_PIN_NOT_CAPTURED pole=', !!poleLocal,
          '-- the gavel will drift with the breath and _clampGavelToBlock will',
          'keep sliding the prop through the fist, which is the defect this is for.');
      }
    } else {
      console.warn('[courtsim] gavel_landing_NO_ANIM_STATE -- the solved arm was not',
        'written back into the stance blend, so the first sit/stand will undo it.');
    }
    return best;
  }

  _attachGavelToHand(model) {
    const hand = model.getObjectByName('Bip01_R_Hand') || model.getObjectByName('Bip01 R Hand');
    const gavelMat = woodMaterial(WOOD_DARK);
    const GAVEL_HANDLE_BUTT_X = -0.075;
    const GAVEL_HANDLE_TIP_X = 0.105;
    const GAVEL_HANDLE_LEN = GAVEL_HANDLE_TIP_X - GAVEL_HANDLE_BUTT_X;   // 0.180
    const GAVEL_HEAD_LEN = 0.100;
    const GAVEL_HEAD_R = 0.0335;                                          // max radius, incl. the bands
    const GAVEL_HEAD_X = GAVEL_HANDLE_TIP_X;                              // +0.105
    const GAVEL_BARE_MIN = GAVEL_HANDLE_BUTT_X;                           // -0.075
    const GAVEL_BARE_MAX = GAVEL_HEAD_X - GAVEL_HEAD_R;                   // +0.0715
    const GAVEL_GRIP_TO_HEAD = GAVEL_BARE_MAX;                            // palm is at x = 0
    const gavelGroup = new THREE.Group();
    gavelGroup.name = 'Gavel';

    const gavelHandleProfile = [
      [0.0000, -0.0750], [0.0090, -0.0750], [0.0160, -0.0720], [0.0170, -0.0660],
      [0.0135, -0.0600], [0.0125, -0.0300], [0.0118, 0.0200], [0.0112, 0.0560],
      [0.0150, 0.0620], [0.0165, 0.0700], [0.0150, 0.0760], [0.0120, 0.0800],
      [0.0120, 0.1050], [0.0000, 0.1050],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const gavelHandle = new THREE.Mesh(
      new THREE.LatheGeometry(gavelHandleProfile, 16), gavelMat);
    gavelHandle.rotation.z = -Math.PI / 2;
    gavelHandle.name = 'GavelHandle';
    gavelGroup.add(gavelHandle);

    const gavelHeadPivot = new THREE.Group();
    gavelHeadPivot.name = 'GavelHeadPivot';
    gavelHeadPivot.position.set(GAVEL_HEAD_X, 0, 0);
    const gavelHeadProfile = [
      [0.0000, -0.0500], [0.0250, -0.0500], [0.0300, -0.0455], [0.0335, -0.0430],
      [0.0335, -0.0360], [0.0300, -0.0290], [0.0300, 0.0290], [0.0335, 0.0360],
      [0.0335, 0.0430], [0.0300, 0.0455], [0.0250, 0.0500], [0.0000, 0.0500],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const gavelHead = new THREE.Mesh(
      new THREE.LatheGeometry(gavelHeadProfile, 18), gavelMat);
    gavelHead.rotation.x = Math.PI / 2;
    gavelHead.name = 'GavelHead';
    gavelHeadPivot.add(gavelHead);
    gavelGroup.add(gavelHeadPivot);

    if (!hand) {
      console.warn('[courtsim] gavel_hand_bone_NOT_FOUND: falling back to desk placement');
      gavelGroup.position.set(0.20, BENCH_DESK_TOP_Y + GAVEL_HEAD_R, -3.75 + BENCH_Z_SHIFT);
      gavelGroup.rotation.y = Math.PI / 8;
      this.venueGroup.add(gavelGroup);
      return;
    }

    hand.updateWorldMatrix(true, false);
    const handScale = hand.getWorldScale(new THREE.Vector3());
    const boneScale = (handScale.x + handScale.y + handScale.z) / 3;
    const scaleSpread = Math.max(handScale.x, handScale.y, handScale.z) - Math.min(handScale.x, handScale.y, handScale.z);
    if (boneScale > 1e-9 && scaleSpread / boneScale > 0.02) {
      console.warn('[courtsim] gavel_bone_scale_NON_UNIFORM', handScale.toArray(),
        '-- the single-scalar compensation below will leave the gavel skewed.');
    }
    const comp = (boneScale > 1e-9) ? 1 / boneScale : 1;
    gavelGroup.scale.setScalar(comp);
    const fit = this._fitGavelToFist(model, hand, gavelGroup, comp);
    if (!fit) {
      console.warn('[courtsim] gavel_grip_UNMEASURED -- the finger chains were not found on',
        hand.name, '; falling back to the old hand-local +X handle placement,',
        'which points the handle out of the fingertips.');
      gavelGroup.position.set(0.06 * comp, 0.02 * comp, 0);
    }
    hand.add(gavelGroup);

    gavelGroup.updateMatrixWorld(true);

    let headLevelDeg = this._levelGavelHead(gavelGroup, gavelHeadPivot);
    if (headLevelDeg == null) {
      console.warn('[courtsim] gavel_head_NOT_SQUARED: the handle is within 5 degrees',
        'of vertical, so there is no unique near-vertical axis for the head. Pivot left',
        'at identity -- the gavel is still a gavel, its face is just not square on.');
    }

    const landed = this._landGavelOnBlock(model, gavelGroup, gavelHeadPivot, comp);
    if (landed) {
      headLevelDeg = this._levelGavelHead(gavelGroup, gavelHeadPivot);
      console.log('[courtsim] gavel_LANDED_ON_BLOCK passes=', landed.pass,
        'residual_m=', landed.err.toFixed(5), 'reach=', landed.reach,
        'head_lowest_above_block_mm=', landed.gapMm.toFixed(2),
        'solved_wrist_world=', landed.T.toArray().map((n) => n.toFixed(3)).join(','),
        '-- a POSITIVE number near zero is the gavel resting on its block with',
        'nothing holding it there. _clampGavelToBlock should now fire on zero',
        'frames; if gavel_block_CLAMPED appears at all, this solve did not take.');
      if (landed.err > 0.004) {
        console.warn('[courtsim] gavel_landing_RESIDUAL_HIGH', landed.err.toFixed(4),
          'm after', landed.pass, 'passes (reach=', landed.reach, ')',
          '-- the head is not on the block and the clamp is load-bearing again.');
      }
    }

    const handWorld = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
    const gavelWorld = new THREE.Vector3().setFromMatrixPosition(gavelHandle.matrixWorld);
    const offset = gavelWorld.clone().sub(handWorld);
    const drawnSize = new THREE.Box3().setFromObject(gavelGroup).getSize(new THREE.Vector3());
    const gavelWorldPos = new THREE.Vector3().setFromMatrixPosition(gavelGroup.matrixWorld);
    const seatYBias = model.userData.courtsimSeatYBias || 0;
    const gavelSeated = gavelWorldPos.clone().setY(gavelWorldPos.y - seatYBias);
    console.log('[courtsim] gavel_hand_bone_attached: bone=', hand.name,
      'bone_world_scale=', boneScale, 'scale_compensation=', comp,
      'offset_magnitude=', offset.length(),
      'gavel_world_pos_seated=', gavelSeated.toArray().map((n) => n.toFixed(3)).join(','),
      'drawn_world_size=', drawnSize.toArray().map((n) => n.toFixed(3)).join(','),
      'expected_length_m=', GAVEL_HANDLE_LEN,
      'grip_to_head_inboard_face_m=', GAVEL_GRIP_TO_HEAD.toFixed(4),
      'bare_shaft_len_m=', (GAVEL_BARE_MAX - GAVEL_BARE_MIN).toFixed(4),
      'head_face_tilt_from_down_deg=', headLevelDeg == null ? 'SKIPPED' : headLevelDeg.toFixed(2),
      'head_axis_is_perpendicular_to_handle= true',
      'bench_worktop_top_y=', BENCH_DESK_TOP_Y,
      'above_worktop_m=', (gavelWorldPos.y - seatYBias - BENCH_DESK_TOP_Y).toFixed(3),
      'seat_y_bias_removed=', seatYBias.toFixed(3),
      '(positions are corrected to the SEATED root -- the model is still at its',
      'standing load height here, and _animateStance drops it on frame 1.)');
    if (drawnSize.length() < 0.05) {
      console.error('[courtsim] gavel_TOO_SMALL: the gavel is drawing at',
        drawnSize.length(), 'm across. Scale compensation did not take.');
    }
  }

  _buildReporterLaptop(g, v, x, deskTopY, aimYaw = 0) {
    const z = -1.755;
    const LID_OPEN_RAD = THREE.MathUtils.degToRad(12);   // past vertical
    const shell = stdMaterial({ color: 0x2b2e33, metalness: 0.45, roughness: 0.42 });
    const deckDark = stdMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.6 });

    const grp = new THREE.Group();
    grp.name = 'ReporterLaptop';
    const LAPTOP_DX = 0.12 * Math.sign(aimYaw || 1);
    grp.rotation.y = aimYaw;                 // face the machine at the reporter's sightline
    {
      const c = Math.cos(aimYaw), s = Math.sin(aimYaw);
      grp.position.set(
        x + LAPTOP_DX - (c * x + s * z),
        0,
        z - (-s * x + c * z),
      );
    }
    g.add(grp);
    const part = (size, at, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      m.position.set(at[0], at[1], at[2]);
      m.name = name;
      grp.add(m);
      return m;
    };

    const baseY = deskTopY + 0.016 / 2 - 0.002;        // base centre, ON the desk
    part([0.36, 0.016, 0.25], [x, baseY, z], shell, 'ReporterLaptopBase');
    part([0.30, 0.004, 0.128], [x, baseY + 0.010, z - 0.030], deckDark, 'ReporterLaptopKeys');
    part([0.098, 0.003, 0.062], [x, baseY + 0.0095, z + 0.073], deckDark, 'ReporterLaptopTrackpad');
    const hingeZ = z + 0.125 - 0.010;
    const hingeY = baseY + 0.009;
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.345, 10), shell);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(x, hingeY, hingeZ);
    hinge.name = 'ReporterLaptopHinge';
    grp.add(hinge);

    const lid = new THREE.Group();
    lid.name = 'ReporterLaptopLid';
    lid.position.set(x, hingeY, hingeZ);
    lid.rotation.x = LID_OPEN_RAD;
    grp.add(lid);
    const lidPart = (size, at, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
      m.position.set(at[0], at[1], at[2]);
      m.name = name;
      lid.add(m);
      return m;
    };
    const LID_W = 0.36, LID_H = 0.235, LID_T = 0.010;
    lidPart([LID_W, LID_H, LID_T], [0, LID_H / 2, 0], shell, 'ReporterLaptopLidShell');
    const SCREEN_W = 0.336, SCREEN_H = 0.179;
    const scr = this._makeReporterScreenMesh(SCREEN_W, SCREEN_H);
    scr.position.set(0, 0.028 + SCREEN_H / 2, -LID_T / 2 - 0.001);
    scr.rotation.y = Math.PI;      // a PlaneGeometry faces +Z; this one must face -Z
    lid.add(scr);

    grp.updateMatrixWorld(true);
    const scrWorld = new THREE.Vector3();
    scr.getWorldPosition(scrWorld);
    const eye = new THREE.Vector3(x, 1.20, -2.20);
    const dist = eye.distanceTo(scrWorld);
    const angH = 2 * Math.atan((SCREEN_H / 2) / dist);
    const VFOV_DEG = 55.0;
    const vfov = THREE.MathUtils.degToRad(VFOV_DEG);
    const ASPECT = 1.2752;
    const hHalf = Math.atan(Math.tan(vfov / 2) * ASPECT);
    const PITCH = THREE.MathUtils.degToRad(
      (this._reporterStation && this._reporterStation.aimElevDeg != null)
        ? this._reporterStation.aimElevDeg : 1.18);
    const fwd = new THREE.Vector3(
      Math.sin(aimYaw) * Math.cos(PITCH),
      Math.sin(PITCH),
      Math.cos(aimYaw) * Math.cos(PITCH)).normalize();
    const camRight = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const camUp = new THREE.Vector3().crossVectors(camRight, fwd).normalize();
    scr.geometry.computeBoundingBox();
    const gb = scr.geometry.boundingBox;
    let hMin = Infinity, hMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(
        (i & 1) ? gb.max.x : gb.min.x,
        (i & 2) ? gb.max.y : gb.min.y,
        (i & 4) ? gb.max.z : gb.min.z).applyMatrix4(scr.matrixWorld).sub(eye);
      const zc = p.dot(fwd), yc = p.dot(camUp), xc = p.dot(camRight);
      const b = Math.atan2(xc, zc);
      const e = Math.atan2(yc, zc);
      hMin = Math.min(hMin, b); hMax = Math.max(hMax, b);
      vMin = Math.min(vMin, e); vMax = Math.max(vMax, e);
    }
    const dg = (r) => THREE.MathUtils.radToDeg(r).toFixed(2);
    console.log('[courtsim] reporter_laptop_built screen_world=',
      scrWorld.toArray().map((n) => n.toFixed(3)).join(','),
      'eye_to_screen_m=', dist.toFixed(4),
      'screen_angular_height_deg=', dg(angH),
      'fraction_of_frame_height=', (angH / vfov).toFixed(3),
      'screen_px_tall_at_1080p=', Math.round((angH / vfov) * 1080),
      'em_px_on_screen_at_1080p=', ((36 / 442) * (angH / vfov) * 1080).toFixed(1),
      '| FRAMING at vfov=', VFOV_DEG, 'aspect=', ASPECT,
      'h_half_deg=', dg(hHalf), 'v_half_deg=', dg(vfov / 2),
      'screen_h_deg=', dg(hMin) + '..' + dg(hMax),
      'screen_v_deg=', dg(vMin) + '..' + dg(vMax),
      'h_margin_deg=', Math.min(
        THREE.MathUtils.radToDeg(hHalf - hMax),
        THREE.MathUtils.radToDeg(hMin + hHalf)).toFixed(2),
      'v_bottom_margin_deg=', dg(vMin + vfov / 2),
      '-- COURTSIM-FIX-W DEFECT W-13, re-measured by COURTSIM-WEB-007.',
      'A NEGATIVE v_bottom_margin means the transcript display is below the',
      'bottom of the frame from the reporter seat; the riser that used to',
      'hold it up is the box the founder asked to have removed. See this',
      'method\'s own header for the three ways to get it back.');
    if (vMin + vfov / 2 < 0) {
      console.warn('[courtsim] REPORTER_SCREEN_BELOW_FRAME by',
        (-THREE.MathUtils.radToDeg(vMin + vfov / 2)).toFixed(2), 'deg'
        + ' -- the laptop transcript is NOT visible from the default reporter view.'
        + ' Measured in camera space against vfov ' + VFOV_DEG + ' deg from the seat at'
        + ' (' + eye.x.toFixed(2) + ', 1.20, -2.20). This would be the disclosed cost of'
        + ' removing ReporterLaptopStand.');
    } else {
      console.log('[courtsim] reporter_screen_framing OK -- the transcript is in frame from the'
        + ' reporter seat, bottom margin',
        THREE.MathUtils.radToDeg(vMin + vfov / 2).toFixed(2), 'deg, top margin',
        THREE.MathUtils.radToDeg(vfov / 2 - vMax).toFixed(2),
        'deg, at vfov', VFOV_DEG, 'deg. COURTSIM-TAIL-045 re-derived this check in the'
        + " camera's own basis; the version that printed REPORTER_SCREEN_BELOW_FRAME on every"
        + ' courtroom load for four reports was measuring world spherical elevation around a'
        + ' world-axis-aligned box, and was wrong by 5.8 deg of formula plus 9.7 deg of box.');
    }
  }

  _makeReporterScreenMesh(w, h) {
    const mesh = this._makeTranscriptScreen(w, h, {
      name: 'ReporterLaptopScreen', kind: 'reporter',
    });
    this._reporterScreen = mesh.userData.courtsimScreen;
    return mesh;
  }

  _makeTranscriptScreen(w, h, opts) {
    const o = opts || {};
    const cv = document.createElement('canvas');
    cv.width = 832; cv.height = 442;            // 1.882:1, matching w/h above
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;      // it is a colour image, not data
    tex.generateMipmaps = false;                // never minified much; mips would only soften the type
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = _maxAnisotropy;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
    );
    mesh.name = o.name || 'TranscriptScreen';
    const state = {
      kind: o.kind || 'reporter',
      canvas: cv, ctx: cv.getContext('2d'), texture: tex, mesh,
      lines: null,          // null = idle screen; an array = live transcript
      partial: '',
      cursor: false,
      caretOn: false,
      status: '',
      rowsShown: 0,
      dirty: true,
      lastPaint: 0,
      paints: 0,
      paintMsTotal: 0,
    };
    mesh.userData.courtsimScreen = state;
    return mesh;
  }

  hasReporterScreen() {
    return !!this._reporterScreen;
  }

  getReporterScreenCapacity() {
    if (!this._reporterScreen) return null;
    return { cols: 36, rows: 7 };
  }

  setReporterScreenText(lines, opts) {
    const s = this._reporterScreen;
    if (!s) return false;
    let next = null;
    if (typeof lines === 'string') next = lines.split(/\r?\n/);
    else if (Array.isArray(lines)) next = lines.slice();
    if (next && next.length === 0) next = null;
    const o = opts || {};
    const partial = (typeof o.partial === 'string') ? o.partial.trim() : '';
    const cursor = ('cursor' in o) ? !!o.cursor : s.cursor;
    const a = `${s.lines ? s.lines.join('\n') : ''} ${s.partial || ''} ${s.cursor ? 1 : 0}`;
    const b = `${next ? next.join('\n') : ''} ${partial} ${cursor ? 1 : 0}`;
    s.lines = next;
    s.partial = partial;
    s.cursor = cursor;
    if (a === b) return false;
    s.dirty = true;
    const c = this._counselScreen;
    if (c) {
      c.lines = next ? next.slice() : null;
      c.partial = partial;
      c.cursor = cursor;
      c.dirty = true;
    }
    return true;
  }

  setReporterScreenStatus(line) {
    const s = this._reporterScreen;
    if (!s) return false;
    const next = (line == null) ? '' : String(line).trim();
    if (next === (s.status || '')) return false;
    s.status = next;
    s.dirty = true;
    return true;
  }

  getReporterScreenState() {
    const s = this._reporterScreen;
    if (!s) return null;
    return {
      present: true,
      idle: s.lines === null,
      lines: s.lines ? s.lines.length : 0,
      partial: s.partial || '',
      cursor: !!s.cursor,
      status: s.status || '',
      caret_on: !!s.caretOn,
      rows_shown: s.rowsShown || 0,
      repaints: s.paints,
      mean_repaint_ms: s.paints ? +(s.paintMsTotal / s.paints).toFixed(3) : 0,
    };
  }

  _updateReporterScreen(nowMs) {
    this._updateOneScreen(this._reporterScreen, nowMs);
    this._updateOneScreen(this._counselScreen, nowMs);
  }

  _updateOneScreen(s, nowMs) {
    if (!s) return;
    if (s.cursor) {
      const phase = Math.floor(nowMs / 530) % 2 === 0;
      if (phase !== s.caretOn) { s.caretOn = phase; s.dirty = true; }
    } else if (s.caretOn) {
      s.caretOn = false; s.dirty = true;
    }
    if (!s.dirty) return;
    if (s.lastPaint && (nowMs - s.lastPaint) < 100) return;   // SCREEN_MIN_REPAINT_MS
    s.lastPaint = nowMs;
    s.dirty = false;
    const t0 = performance.now();
    this._paintReporterScreen(s);
    s.texture.needsUpdate = true;
    s.paints++;
    s.paintMsTotal += performance.now() - t0;
  }

  _paintReporterScreen(sIn) {
    const s = sIn || this._reporterScreen;
    if (!s) return;
    const { ctx, canvas } = s;
    const isCounsel = s.kind === 'counsel';
    const W = canvas.width, H = canvas.height;
    const SCREEN_LINES = 7;
    const FONT_PX = 36;
    const LINE_H = 50;
    const PAD_X = 26;
    const CHAR_LIMIT = 36;   // ~832-52 px of 0.6em monospace advance at 36 px

    ctx.fillStyle = '#eceae4';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2b3442';
    ctx.fillRect(0, 0, W, 44);
    ctx.font = 'bold 24px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#d8e2f0';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(isCounsel ? 'REALTIME FEED  --  COUNSEL' : 'REALTIME  --  OFFICIAL RECORD',
      PAD_X, 23);
    ctx.textAlign = 'right';
    const live = !!s.lines;
    ctx.fillStyle = live ? '#7ee08a' : '#c9b26a';
    ctx.fillText(live ? (isCounsel ? 'LIVE' : 'WRITING') : 'STANDBY', W - PAD_X, 23);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W - PAD_X - ctx.measureText(live ? (isCounsel ? 'LIVE' : 'WRITING') : 'STANDBY').width - 18,
      22, 7, 0, Math.PI * 2);
    if (live) ctx.fill(); else ctx.stroke();
    ctx.textAlign = 'left';

    const STATUS_TOP = 366;
    const hasStatus = !isCounsel && !!(s.status && s.status.length);
    const rows = hasStatus ? (SCREEN_LINES - 1) : SCREEN_LINES;
    s.rowsShown = rows;

    if (!s.lines) {
      ctx.strokeStyle = '#d8d5cd';
      ctx.lineWidth = 1;
      for (let i = 0; i < rows; i++) {
        const y = 78 + i * LINE_H + FONT_PX * 0.72;
        ctx.beginPath(); ctx.moveTo(PAD_X, y + 0.5); ctx.lineTo(W - PAD_X, y + 0.5); ctx.stroke();
      }
      ctx.font = `${FONT_PX}px ui-monospace, Consolas, monospace`;
      ctx.fillStyle = '#6a6f78';
      if (isCounsel) {
        ctx.fillText('Realtime feed connected.', PAD_X, 78 + FONT_PX / 2);
        ctx.fillText('Awaiting the first', PAD_X, 78 + LINE_H + FONT_PX / 2);
        ctx.fillText('question.', PAD_X, 78 + LINE_H * 2 + FONT_PX / 2);
      } else {
        ctx.fillText('Ready.', PAD_X, 78 + FONT_PX / 2);
        ctx.fillText('Waiting for the proceeding', PAD_X, 78 + LINE_H + FONT_PX / 2);
        ctx.fillText('to begin.', PAD_X, 78 + LINE_H * 2 + FONT_PX / 2);
      }
      if (!s.cursor || s.caretOn) {
        ctx.fillStyle = '#2b3442';
        ctx.fillRect(PAD_X, 78 + LINE_H * 3 + 6, 16, FONT_PX);
      }
      if (hasStatus) this._paintReporterStatusStrip(ctx, W, H, STATUS_TOP, PAD_X, s);
      return;
    }

    const wrap = (line) => {
      const out = [];
      let rest = String(line == null ? '' : line);
      while (rest.length > CHAR_LIMIT) {
        let cut = rest.lastIndexOf(' ', CHAR_LIMIT);
        if (cut <= 0) cut = CHAR_LIMIT;              // one very long token: break it
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^ +/, '');
      }
      out.push(rest);
      return out;
    };
    const wrapped = [];
    for (const raw of s.lines) {
      const line = String(raw == null ? '' : raw);
      if (line.length <= CHAR_LIMIT) { wrapped.push(line); continue; }
      for (const w of wrap(line)) if (w) wrapped.push(w);
    }
    const partialRows = s.partial ? wrap(s.partial).slice(-1) : [];
    const shown = wrapped.slice(-(rows - partialRows.length));
    ctx.font = `${FONT_PX}px ui-monospace, Consolas, monospace`;
    for (let i = 0; i < shown.length; i++) {
      const y = 78 + i * LINE_H + FONT_PX / 2;
      const age = shown.length - 1 - i;
      ctx.fillStyle = age === 0 ? '#101319' : (age === 1 ? '#3a4049' : '#5d636c');
      ctx.fillText(shown[i], PAD_X, y);
    }
    let caretRow = shown.length - 1;
    let caretText = shown.length ? shown[shown.length - 1] : '';
    if (partialRows.length) {
      caretRow = shown.length;
      caretText = partialRows[0];
      ctx.fillStyle = '#8a5a1e';
      ctx.fillText(caretText, PAD_X, 78 + caretRow * LINE_H + FONT_PX / 2);
    }
    if (s.cursor && s.caretOn && caretRow >= 0) {
      const x = PAD_X + ctx.measureText(caretText ? `${caretText} ` : '').width;
      if (x < W - PAD_X) {
        ctx.fillStyle = partialRows.length ? '#8a5a1e' : '#101319';
        ctx.fillRect(x, 78 + caretRow * LINE_H + 6, 14, FONT_PX);
      }
    }
    if (hasStatus) this._paintReporterStatusStrip(ctx, W, H, STATUS_TOP, PAD_X, s);
  }

  _paintReporterStatusStrip(ctx, W, H, top, padX, sIn) {
    const s = sIn || this._reporterScreen;
    ctx.fillStyle = '#2b3442';
    ctx.fillRect(0, top, W, H - top);
    ctx.font = '26px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#d8e2f0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let line = s.status;
    const avail = W - padX * 2;
    if (ctx.measureText(line).width > avail) {
      while (line.length > 1 && ctx.measureText(`${line}...`).width > avail) line = line.slice(0, -1);
      line = `${line}...`;
    }
    ctx.fillText(line, padX, top + (H - top) / 2);
  }

  _buildSoundBlock(g, v) {
    const mat = woodMaterial(WOOD_DARK);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.018, 20), mat);
    base.position.set(SOUND_BLOCK_X, BENCH_DESK_TOP_Y + 0.008, SOUND_BLOCK_Z + BENCH_Z_SHIFT);
    base.name = 'SoundBlockBase';
    g.add(base);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.026, 20), mat);
    puck.position.set(SOUND_BLOCK_X, BENCH_DESK_TOP_Y + 0.028, SOUND_BLOCK_Z + BENCH_Z_SHIFT);
    puck.name = 'SoundBlock';
    g.add(puck);
    this._soundBlockTop = {
      x: SOUND_BLOCK_X,
      y: BENCH_DESK_TOP_Y + 0.028 + 0.013,
      z: SOUND_BLOCK_Z + BENCH_Z_SHIFT,
    };
  }

  _buildRoomDressing() {
    if (this.venue.type === 'deposition') return; // no flags/seal/lettering/scales -- depositions have none of these, per the reference
    const g = this.venueGroup;
    const v = this.venue;
    const poleMat = woodMaterial(WOOD_DARK);
    const flags = [[-2.0, 0x262693, 'assets/textures/flag_blue_sb.png'],
      [2.0, 0x8c2626, 'assets/textures/flag_red_sb.png']];
    const FLAG_W = 0.75, FLAG_H = 1.05, FLAG_TOP_Y = 2.86;
    for (const [x, color, emblemUrl] of flags) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 12), poleMat);
      pole.position.set(x, 1.5, -3.9);
      pole.name = 'FlagPole';
      g.add(pole);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.06, 16), poleMat);
      base.position.set(x, 0.032, -3.9);   // 0.002 above the floor plane, never coplanar with it
      base.name = 'FlagPoleBase';
      g.add(base);
      const finialMat = stdMaterial({ color: 0xb08d3f, metalness: 0.75, roughness: 0.3 });
      const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), finialMat);
      finialBall.position.set(x, 3.02, -3.9);
      finialBall.name = 'FlagFinial';
      g.add(finialBall);
      const finialSpear = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 12), finialMat);
      finialSpear.position.set(x, 3.11, -3.9);
      finialSpear.name = 'FlagFinial';
      g.add(finialSpear);

      const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 14, 10);
      const fp = flagGeo.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const px = fp.getX(i), py = fp.getY(i);
        const u = (px + FLAG_W / 2) / FLAG_W;          // 0 at the hoist, 1 at the fly
        const vv = (py + FLAG_H / 2) / FLAG_H;         // 0 at the bottom, 1 at the top
        const fold = Math.sin(u * Math.PI * 3.1) * 0.055 * Math.pow(u, 0.8);
        const barrel = Math.sin(vv * Math.PI) * 0.012;
        fp.setZ(i, fold + barrel);
        fp.setY(i, py - 0.16 * u * u);
      }
      fp.needsUpdate = true;
      flagGeo.computeVertexNormals();
      const flagMat = clothMaterial(color, 0.86);
      flagMat.side = THREE.DoubleSide;
      const flag = new THREE.Mesh(flagGeo, flagMat);
      if (emblemUrl) {
        const vg = this.venueGroup;
        new THREE.TextureLoader().load(emblemUrl, (t) => {
          if (this.venueGroup !== vg || !flag.parent) return;
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // one emblem, not ten
          t.repeat.set(1, 1);
          t.anisotropy = this._maxAnisotropy || 1;
          t.needsUpdate = true;
          flagMat.map = t;
          flagMat.color.setHex(0xffffff);
          flagMat.needsUpdate = true;
        }, undefined, () => {
          console.warn('[courtsim] flag_emblem_MISSING', emblemUrl,
            '-- the flag stays plain coloured cloth, which is what it was before',
            'COURTSIM-GAVEL-050. Nothing else changes.');
        });
      }
      flag.position.set(x + FLAG_W / 2, FLAG_TOP_Y - FLAG_H / 2, -3.87);
      flag.name = 'Flag';
      g.add(flag);
    }

    const anchorY = v.subtitle === 'grand & traditional' ? 5.9 : 4.9;
    if (v.identityAnchor === 'seal') {
      const sealGroup = this._buildMedallion('Seal');
      sealGroup.position.set(0, anchorY, -5.99);
      g.add(sealGroup);
    } else if (v.identityAnchor === 'in_god_we_trust') {
      const canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.font = 'bold 72px serif';
      ctx.fillStyle = '#c7a854';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('IN GOD WE TRUST', canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace; // DEFECT 10 (recon D-30)
      const textPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(4.0, 0.5),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
      );
      textPlane.position.set(0, anchorY, -5.97);
      g.add(textPlane);
    } else if (v.identityAnchor === 'scales') {
      const scalesMat = stdMaterial({ color: 0xb89c4d, metalness: 0.5, roughness: 0.3 });
      const scalesZ = -5.85;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 12), scalesMat);
      post.position.set(0, anchorY, scalesZ);
      g.add(post);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 12), scalesMat);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(0, anchorY + 0.3, scalesZ);
      g.add(beam);
      for (const panX of [-0.35, 0.35]) {
        const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.04, 16), scalesMat);
        pan.position.set(panX, anchorY + 0.05, scalesZ);
        g.add(pan);
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.25, 6), scalesMat);
        chain.position.set(panX, anchorY + 0.175, scalesZ);
        g.add(chain);
      }
    }

    this._buildWallClock(g);
    this._buildSoundBlock(g, v);

    const monitorMat = stdMaterial({ color: 0x0c0c0f, metalness: 0.3, roughness: 0.2 });
    const monitorFoot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.012, 0.11), monitorMat);
    monitorFoot.position.set(0.9, BENCH_DESK_TOP_Y + 0.005, -3.8 + BENCH_Z_SHIFT);
    g.add(monitorFoot);
    const monitorStem = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.035), monitorMat);
    monitorStem.position.set(0.9, BENCH_DESK_TOP_Y + 0.055, -3.8 + BENCH_Z_SHIFT);
    g.add(monitorStem);
    const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.025), monitorMat);
    monitor.position.set(0.9, BENCH_DESK_TOP_Y + 0.205, -3.79 + BENCH_Z_SHIFT);
    monitor.name = 'BenchMonitor';
    g.add(monitor);
  }

  _buildWallClock(g) {
    const CLOCK_X = -7.70;         // LeftWall inner face is -7.75
    const CLOCK_Y = 2.55;
    const CLOCK_Z = 2.2;
    const R = 0.22;
    const clock = new THREE.Group();
    clock.name = 'WallClock';
    clock.position.set(CLOCK_X, CLOCK_Y, CLOCK_Z);
    clock.rotation.z = -Math.PI / 2;
    const dialFrame = new THREE.Group();
    dialFrame.name = 'ClockDialFrame';
    dialFrame.rotation.y = -Math.PI / 2;
    clock.add(dialFrame);

    const bezelMat = stdMaterial({ color: 0x2a2622, roughness: 0.45, metalness: 0.15 });
    const dialMat = stdMaterial({ color: 0xf4f2ea, roughness: 0.55 });
    const inkMat = stdMaterial({ color: 0x14140f, roughness: 0.6 });
    const handMat = stdMaterial({ color: 0x101010, roughness: 0.5 });

    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.025, R + 0.025, 0.06, 32), bezelMat);
    bezel.name = 'ClockBezel';
    dialFrame.add(bezel);
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.062, 32), dialMat);
    dial.position.y = 0.012;
    dial.name = 'ClockDial';
    dialFrame.add(dial);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 12), bezelMat);
    boss.position.y = -0.055;
    boss.name = 'ClockMount';
    dialFrame.add(boss);

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const quarter = (i % 3 === 0);
      const len = quarter ? 0.05 : 0.03;
      const wide = quarter ? 0.016 : 0.008;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.006, len), inkMat);
      tick.position.set(Math.sin(a) * (R - len / 2 - 0.012), 0.045, Math.cos(a) * (R - len / 2 - 0.012));
      tick.rotation.y = a;
      tick.name = 'ClockTick';
      dialFrame.add(tick);
    }

    const makeHand = (len, width, thickness, y) => {
      const pivot = new THREE.Group();
      const bar = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, len), handMat);
      bar.position.z = len / 2 - len * 0.14;   // a short counterweight tail past the pivot
      pivot.add(bar);
      pivot.position.y = y;
      dialFrame.add(pivot);
      return pivot;
    };
    const hourHand = makeHand(R * 0.55, 0.015, 0.007, 0.05);
    const minuteHand = makeHand(R * 0.82, 0.011, 0.007, 0.058);
    const capMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), handMat);
    capMesh.position.y = 0.062;
    dialFrame.add(capMesh);

    g.add(clock);
    this._clockHands = { hourHand, minuteHand };
  }

  _updateClock() {
    if (!this._clockHands) return;
    const now = new Date();
    const mins = now.getMinutes() + now.getSeconds() / 60;
    const hours = (now.getHours() % 12) + mins / 60;
    this._clockHands.minuteHand.rotation.y = -(mins / 60) * Math.PI * 2;
    this._clockHands.hourHand.rotation.y = -(hours / 12) * Math.PI * 2;
  }

  _measureHandRig(model, side) {
    const nm = (s) => model.getObjectByName('Bip01 ' + side + ' ' + s)
      || model.getObjectByName('Bip01_' + side + '_' + s);
    const hand = nm('Hand');
    if (!hand) return null;
    const chains = [];
    for (let f = 0; f <= 4; f++) {
      const b0 = nm('Finger' + f);
      const b1 = nm('Finger' + f + '1');
      const b2 = nm('Finger' + f + '2');
      if (!b0 || !b1) continue;
      chains.push({ f, bones: [b0, b1, b2].filter(Boolean) });
    }
    if (chains.length < 4) {
      console.warn('[courtsim] hand_rig_INCOMPLETE side=', side,
        'finger_chains_found=', chains.length,
        '-- this hand keeps its raw open-palm bind pose. No guess is made.');
      return null;
    }
    model.updateWorldMatrix(true, true);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const handW = wp(hand);
    const idx = chains.find((c) => c.f === 1);
    const pky = chains.find((c) => c.f === 4);
    const mid = chains.find((c) => c.f === 2);
    if (!idx || !pky) return null;
    const across = wp(pky.bones[0]).sub(wp(idx.bones[0]));
    if (across.lengthSq() < 1e-8) return null;
    across.normalize();
    const long = wp(idx.bones[0]).add(wp(pky.bones[0])).multiplyScalar(0.5).sub(handW);
    if (long.lengthSq() < 1e-8) return null;
    long.normalize();

    const a = wp(idx.bones[0]);
    const b = wp(idx.bones[1]);
    const c = idx.bones[2] ? wp(idx.bones[2]) : null;
    let flexSign = 0, bindBendDeg = 0;
    if (c) {
      const v1 = b.clone().sub(a).normalize();
      const v2 = c.clone().sub(b).normalize();
      bindBendDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1)));
      const hinge = new THREE.Vector3().crossVectors(v1, v2);
      if (hinge.lengthSq() > 1e-12) flexSign = hinge.dot(across) >= 0 ? 1 : -1;
    }
    const curlDir = new THREE.Vector3().crossVectors(across, long).normalize();
    const thumb = chains.find((cc) => cc.f === 0);
    let thumbDot = NaN;
    if (thumb && thumb.bones[1]) {
      thumbDot = wp(thumb.bones[1]).sub(wp(thumb.bones[0])).normalize().dot(curlDir);
    }
    const thumbSign = Number.isNaN(thumbDot) ? 0 : (thumbDot >= 0 ? 1 : -1);
    if (flexSign === 0) {
      flexSign = thumbSign || (side === 'R' ? -1 : 1);
      console.warn('[courtsim] hand_flex_sign_from_THUMB side=', side,
        '-- the bind pose has no measurable finger curl; sign taken from the',
        'thumb-opposition test instead. thumb_dot_curlDir=', thumbDot);
    } else if (thumbSign !== 0 && thumbSign !== flexSign) {
      console.warn('[courtsim] hand_flex_sign_DISAGREEMENT side=', side,
        'bind_bend_sign=', flexSign, 'thumb_side_sign=', thumbSign,
        'bind_bend_deg=', bindBendDeg.toFixed(2),
        '-- using the bind-bend measurement; the fingers may curl the wrong way.');
    }

    const flexWorld = across.clone().multiplyScalar(flexSign);
    const axisInParent = (bone) => {
      const pq = bone.parent
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion();
      return flexWorld.clone().applyQuaternion(pq.invert()).normalize();
    };
    for (const ch of chains) {
      ch.axes = ch.bones.map(axisInParent);
      ch.rest = ch.bones.map((bb) => bb.quaternion.clone());
    }
    return {
      side, hand, chains, across, long, curlDir, flexWorld, flexSign,
      bindBendDeg, thumbDot,
      midKnuckle: mid ? mid.bones[0] : idx.bones[0],
    };
  }

  _applyHandPose(rig, pose, holder, jitterDeg = 4) {
    if (!rig || !pose) return 0;
    let posed = 0;
    for (const ch of rig.chains) {
      const spec = (ch.f === 0)
        ? pose.t
        : ((ch.f === 1 && pose.indexOverride) ? pose.indexOverride : pose.f);
      for (let i = 0; i < ch.bones.length; i++) {
        if (i >= spec.length) continue;
        const base = spec[i];
        if (base == null) continue;
        const deg = base + _jit(holder, jitterDeg) * (0.4 + 0.6 * Math.min(1, base / 45));
        _scratchQuat2.setFromAxisAngle(ch.axes[i], THREE.MathUtils.degToRad(deg));
        ch.bones[i].quaternion.copy(ch.rest[i]).premultiply(_scratchQuat2);
        posed++;
      }
    }
    rig.hand.updateMatrixWorld(true);
    return posed;
  }

  _orientHand(rig, longTargetW, acrossTargetW) {
    if (!rig) return NaN;
    const hand = rig.hand;
    hand.updateWorldMatrix(true, false);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const handW = wp(hand);
    const idx = rig.chains.find((c) => c.f === 1);
    const pky = rig.chains.find((c) => c.f === 4);
    if (!idx || !pky) return NaN;
    const a1 = wp(idx.bones[0]).add(wp(pky.bones[0])).multiplyScalar(0.5).sub(handW).normalize();
    const rawAcross = wp(pky.bones[0]).sub(wp(idx.bones[0])).normalize();
    const a2 = rawAcross.clone().addScaledVector(a1, -a1.dot(rawAcross));
    if (a2.lengthSq() < 1e-8) return NaN;
    a2.normalize();
    const a3 = new THREE.Vector3().crossVectors(a1, a2);

    const b1 = longTargetW.clone().normalize();
    const b2 = acrossTargetW.clone().addScaledVector(b1, -b1.dot(acrossTargetW));
    if (b2.lengthSq() < 1e-8) return NaN;
    b2.normalize();
    const b3 = new THREE.Vector3().crossVectors(b1, b2);

    const A = new THREE.Matrix4().makeBasis(a1, a2, a3);
    const B = new THREE.Matrix4().makeBasis(b1, b2, b3);
    const R = B.multiply(A.transpose());
    const worldDelta = new THREE.Quaternion().setFromRotationMatrix(R);
    const pq = new THREE.Quaternion();
    if (hand.parent) hand.parent.getWorldQuaternion(pq);
    hand.quaternion.premultiply(pq.clone().invert().multiply(worldDelta).multiply(pq));
    hand.updateMatrixWorld(true);
    hand.updateWorldMatrix(true, true);
    const got = wp(idx.bones[0]).add(wp(pky.bones[0])).multiplyScalar(0.5).sub(wp(hand)).normalize();
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(got.dot(b1), -1, 1)));
  }

  _gripPenInHand(model, rig, sd, opts) {
    if (!rig) return null;
    const o = opts || {};
    const PITCH_DEG = (o.pitchDeg == null) ? 52 : o.pitchDeg;
    const NIB_CLEAR = (o.nibClear == null) ? 0.012 : o.nibClear;
    const PEN_LEN = o.penLen || PEN_LEN_M;
    const CONTACT_R = PEN_R_M + 0.0065;
    const wp = (b) => b.getWorldPosition(new THREE.Vector3());
    const chainOf = (f) => rig.chains.find((c) => c.f === f);
    const thumb = chainOf(0), index = chainOf(1), middle = chainOf(2);
    if (!thumb || !index || !middle || index.bones.length < 3 || thumb.bones.length < 2) {
      console.warn('[courtsim] pen_grip_UNRIGGED role=', o.role, 'side=', sd,
        '-- this hand has no thumb/index/middle chain to close on a barrel.',
        'The pen will be placed but NOT gripped, and it will read as a rod',
        'lying in an open hand. Reported, not hidden.');
      return null;
    }
    model.updateWorldMatrix(true, true);
    const handW = wp(rig.hand);
    const iK = wp(index.bones[0]);
    const pK = wp(chainOf(4) ? chainOf(4).bones[0] : index.bones[0]);
    const longAx = iK.clone().add(pK).multiplyScalar(0.5).sub(handW);
    if (longAx.lengthSq() < 1e-10) return null;
    longAx.normalize();
    const acrossAx = pK.clone().sub(iK);
    if (acrossAx.lengthSq() < 1e-10) return null;
    acrossAx.normalize();
    const web = wp(thumb.bones[0]).add(iK).multiplyScalar(0.5);
    const flat = longAx.clone();
    flat.y = 0;
    if (flat.lengthSq() < 1e-6) {
      if (o.forwardW) flat.copy(o.forwardW).setY(0);
      if (flat.lengthSq() < 1e-6) return null;
      console.warn('[courtsim] pen_heading_FROM_BODY role=', o.role, 'side=', sd,
        '-- this hand points straight up or down, so the pen\'s heading comes',
        'from the figure\'s forward instead of from the hand. Stated because it',
        'is a fallback, not a measurement.');
    }
    flat.normalize();
    const th = THREE.MathUtils.degToRad(PITCH_DEG);
    const dir = flat.clone().multiplyScalar(Math.cos(th))
      .addScaledVector(_AXIS_Y, -Math.sin(th)).normalize();
    const towardThumb = wp(thumb.bones[0]).sub(iK);
    towardThumb.addScaledVector(dir, -towardThumb.dot(dir));
    if (towardThumb.lengthSq() < 1e-10) return null;
    towardThumb.normalize();
    const setChain0 = (ch, degs, axes) => {
      for (let i = 0; i < ch.bones.length && i < degs.length; i++) {
        if (degs[i] == null) continue;
        ch.bones[i].quaternion.copy(ch.rest[i]).premultiply(
          new THREE.Quaternion().setFromAxisAngle(
            axes && axes[i] ? axes[i] : ch.axes[i],
            THREE.MathUtils.degToRad(degs[i])));
      }
      ch.bones[0].updateMatrixWorld(true);
    };
    const contactOf0 = (ch) => {
      const b1 = ch.bones[ch.bones.length - 2], b2 = ch.bones[ch.bones.length - 1];
      return wp(b1).add(wp(b2)).multiplyScalar(0.5);
    };
    const INDEX_POSE = o.indexPose || [38, 46, 14];
    setChain0(index, INDEX_POSE);
    const REST_FINGER_POSE = o.restFingers || [24, 30, 16];
    for (const f of [3, 4]) {
      const ch = chainOf(f);
      if (ch) setChain0(ch, REST_FINGER_POSE);
    }
    model.updateWorldMatrix(true, true);
    const indexPad = contactOf0(index);
    const axisP = indexPad.clone().addScaledVector(towardThumb, CONTACT_R);
    let webPitchDeg = null, headingSource = 'web';
    {
      const palmN = indexPad.clone().sub(iK);
      palmN.addScaledVector(longAx, -palmN.dot(longAx));
      palmN.addScaledVector(acrossAx, -palmN.dot(acrossAx));
      if (palmN.lengthSq() > 1e-12) {
        palmN.normalize();
        const thumbMcp = thumb.bones[1] ? wp(thumb.bones[1]) : wp(thumb.bones[0]);
        const webSpace = thumbMcp.clone().add(iK).multiplyScalar(0.5);
        const webOut = webSpace.clone()
          .addScaledVector(towardThumb, CONTACT_R + 0.006)
          .addScaledVector(palmN, -0.010);
        const webDir = axisP.clone().sub(webOut);
        if (webDir.lengthSq() > 1e-8) {
          webDir.normalize();
          webPitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-webDir.y, -1, 1)));
          const wristW = wp(rig.hand);
          const wv = wristW.clone().sub(axisP);
          const wristToCandidate = wv.addScaledVector(webDir, -wv.dot(webDir)).length();
          if (Math.abs(webPitchDeg - PITCH_DEG) > 18) {
            headingSource = 'stated_pitch_CLAMPED_pitch';
            console.warn('[courtsim] pen_web_heading_REJECTED role=', o.role, 'side=', sd,
              'web_heading_pitch_deg=', webPitchDeg.toFixed(1),
              'stated_pitch_deg=', PITCH_DEG,
              '-- the line from the web to the index pad points somewhere a pen',
              'cannot go on this hand, so the stated pitch is kept. The back of',
              'the barrel will NOT be over the web on this figure.');
          } else if (wristToCandidate < 0.030) {
            headingSource = 'stated_pitch_CLAMPED_wrist';
            console.warn('[courtsim] pen_web_heading_INSIDE_HAND role=', o.role, 'side=', sd,
              'wrist_to_candidate_axis_m=', wristToCandidate.toFixed(4),
              '-- the web-anchored heading would run the barrel through this hand',
              '(under 0.030 is inside it, COURTSIM-PROPS-033). Stated pitch kept.');
          } else {
            dir.copy(webDir);
          }
        }
      }
    }
    const distToAxis = (p) => {
      const v = p.clone().sub(axisP);
      return v.addScaledVector(dir, -v.dot(dir)).length();
    };
    let t = 0.030;
    if (o.supportY != null && Math.abs(dir.y) > 1e-3) {
      t = (axisP.y - (o.supportY + NIB_CLEAR)) / (-dir.y);
    }
    const tRaw = t;
    t = THREE.MathUtils.clamp(t, 0.020, 0.060);
    const nib = axisP.clone().addScaledVector(dir, t);
    const setChain = setChain0;
    const contactOf = contactOf0;
    const receipts = {};
    receipts.index = {
      mcp: INDEX_POSE[0], pip: INDEX_POSE[1], posed: true,
      d: distToAxis(indexPad),
    };
    {
      let best = null;
      for (let a = 14; a <= 86; a += 3) {
        for (let b = 14; b <= 100; b += 3) {
          setChain(middle, [a, b, b * 0.55]);
          const err = Math.abs(distToAxis(contactOf(middle)) - CONTACT_R);
          if (!best || err < best.err) best = { a, b, err };
        }
      }
      setChain(middle, [best.a, best.b, best.b * 0.55]);
      receipts.middle = { mcp: best.a, pip: best.b, err: best.err,
        d: distToAxis(contactOf(middle)) };
    }
    {
      const pq = new THREE.Quaternion();
      if (thumb.bones[0].parent) thumb.bones[0].parent.getWorldQuaternion(pq);
      const oppAxis = acrossAx.clone().applyQuaternion(pq.clone().invert()).normalize();
      const idxTipB = index.bones[index.bones.length - 1];
      let best = null;
      const trials = [];
      for (let opp = -110; opp <= 110; opp += 4) {
        for (let fx = -10; fx <= 70; fx += 5) {
          setChain(thumb, [opp, fx, fx * 0.6], [oppAxis, null, null]);
          const err = Math.abs(distToAxis(contactOf(thumb)) - CONTACT_R);
          const pinch = wp(thumb.bones[thumb.bones.length - 1]).distanceTo(wp(idxTipB));
          trials.push({ opp, fx, err, pinch });
          if (!best || err < best.err) best = { opp, fx, err, pinch };
        }
      }
      {
        const tol = best.err + 0.002;
        for (const t of trials) if (t.err <= tol && t.pinch < best.pinch) best = t;
      }
      setChain(thumb, [best.opp, best.fx, best.fx * 0.6], [oppAxis, null, null]);
      receipts.thumb = { opposition: best.opp, flex: best.fx, err: best.err,
        d: distToAxis(contactOf(thumb)) };
    }
    model.updateWorldMatrix(true, true);
    receipts.web = distToAxis(web);
    receipts.wrist = distToAxis(wp(rig.hand));
    receipts.webPitchDeg = webPitchDeg;
    receipts.headingSource = headingSource;
    {
      const v = web.clone().sub(axisP);
      const tWeb = v.dot(dir);
      receipts.backOverWeb = tWeb - (t - PEN_LEN);
    }
    receipts.nib = nib;
    receipts.dir = dir;
    receipts.contactR = CONTACT_R;
    receipts.tRaw = tRaw;
    receipts.t = t;
    receipts.penLen = PEN_LEN;
    receipts.pinchGap = wp(thumb.bones[thumb.bones.length - 1])
      .distanceTo(wp(index.bones[index.bones.length - 1]));
    return receipts;
  }

  _skinnedModelPos(mesh, i, cache, worldToModel, out) {
    if (!cache.M) {
      cache.M = mesh.skeleton.bones.map((b, j) => new THREE.Matrix4()
        .multiplyMatrices(b.matrixWorld, mesh.skeleton.boneInverses[j]));
      cache.bind = mesh.bindMatrix.clone();
      cache.pos = mesh.geometry.getAttribute('position');
      cache.si = mesh.geometry.getAttribute('skinIndex');
      cache.sw = mesh.geometry.getAttribute('skinWeight');
      cache.base = new THREE.Vector3();
      cache.tmp = new THREE.Vector3();
    }
    cache.base.fromBufferAttribute(cache.pos, i).applyMatrix4(cache.bind);
    out.set(0, 0, 0);
    for (let c = 0; c < 4; c++) {
      const w = cache.sw.getComponent(i, c);
      if (w === 0) continue;
      cache.tmp.copy(cache.base).applyMatrix4(cache.M[cache.si.getComponent(i, c)]);
      out.addScaledVector(cache.tmp, w);
    }
    return out.applyMatrix4(worldToModel);
  }

  _measureBodyProfile(model) {
    if (model.userData.courtsimBodyProfile !== undefined) return model.userData.courtsimBodyProfile;
    model.updateWorldMatrix(true, true);
    const gb = (a, b) => model.getObjectByName(a) || model.getObjectByName(b);
    const worldToModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const mp = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(worldToModel);

    const thighL = gb('Bip01 L Thigh', 'Bip01_L_Thigh');
    const calfL = gb('Bip01 L Calf', 'Bip01_L_Calf');
    const sh = { L: gb('Bip01 L UpperArm', 'Bip01_L_UpperArm'), R: gb('Bip01 R UpperArm', 'Bip01_R_UpperArm') };
    const el = { L: gb('Bip01 L Forearm', 'Bip01_L_Forearm'), R: gb('Bip01 R Forearm', 'Bip01_R_Forearm') };
    const hd = { L: gb('Bip01 L Hand', 'Bip01_L_Hand'), R: gb('Bip01 R Hand', 'Bip01_R_Hand') };

    const bip = gb('Bip01', 'Bip01_Pelvis');
    let sMin = Infinity, sMax = -Infinity, nBones = 0, nonUnitLocal = 0;
    const ws = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.isBone) return;
      nBones++;
      o.getWorldScale(ws);
      sMin = Math.min(sMin, ws.x, ws.y, ws.z);
      sMax = Math.max(sMax, ws.x, ws.y, ws.z);
      if (Math.abs(o.scale.x - 1) > 1e-4 || Math.abs(o.scale.y - 1) > 1e-4 || Math.abs(o.scale.z - 1) > 1e-4) nonUnitLocal++;
    });

    const BIN = 0.02;                 // 2 cm height bins for the torso silhouette
    const torso = new Map();          // floor(y/BIN) -> max |x| of a torso vertex
    const lapSamples = [];
    const foreR = { L: [], R: [] };
    const hipZ = thighL ? mp(thighL).z : null;
    const axes = {};
    for (const sd of ['L', 'R']) {
      if (!el[sd] || !hd[sd]) continue;
      const a = mp(el[sd]), b = mp(hd[sd]);
      const dir = b.clone().sub(a);
      if (dir.lengthSq() > 1e-10) axes[sd] = { o: a, d: dir.normalize() };
    }

    const v = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.skeleton) return;
      const geo = o.geometry;
      if (!geo.getAttribute('position') || !geo.getAttribute('skinIndex') || !geo.getAttribute('skinWeight')) return;
      const cache = {};
      const names = o.skeleton.bones.map((b) => (b.name || '').replace(/_/g, ' '));
      const pos = geo.getAttribute('position');
      const si = geo.getAttribute('skinIndex');
      const sw = geo.getAttribute('skinWeight');
      for (let i = 0; i < pos.count; i++) {
        let best = 0, bestW = -1;
        for (let c = 0; c < 4; c++) {
          const w = sw.getComponent(i, c);
          if (w > bestW) { bestW = w; best = si.getComponent(i, c); }
        }
        const bn = names[best] || '';
        const isTorso = /^Bip01 (Spine\d?|Pelvis)$/i.test(bn);
        const isThigh = /Thigh/i.test(bn);
        const fm = bn.match(/^Bip01 ([LR]) Forearm$/i);
        if (!isTorso && !isThigh && !fm) continue;
        this._skinnedModelPos(o, i, cache, worldToModel, v);
        if (isTorso) {
          const k = Math.floor(v.y / BIN);
          const h = Math.abs(v.x);
          if (!(torso.get(k) >= h)) torso.set(k, h);
        } else if (isThigh) {
          if (hipZ != null && v.z - hipZ > 0) lapSamples.push(v.z - hipZ);
        } else {
          const ax = axes[fm[1].toUpperCase()];
          if (!ax) continue;
          const d = v.clone().sub(ax.o);
          foreR[fm[1].toUpperCase()].push(d.addScaledVector(ax.d, -d.dot(ax.d)).length());
        }
      }
    });

    let bestK = null, bestH = 0;
    const torsoHalfAt = (y) => {
      const k = Math.floor(y / BIN);
      const h = torso.get(k);
      if (h != null) return h;
      let bd = Infinity, got = bestH;
      for (const [kk, hh] of torso) {
        const dd = Math.abs(kk - k);
        if (dd < bd) { bd = dd; got = hh; }
      }
      return got;
    };
    for (const [kk, hh] of torso) { if (bestK === null || hh > bestH) { bestK = kk; bestH = hh; } }

    let lapRadius = null;
    lapSamples.sort((a, b) => a - b);
    if (lapSamples.length >= 20) {
      lapRadius = lapSamples[Math.min(lapSamples.length - 1, Math.floor(lapSamples.length * 0.97))];
    }
    const thighLen = (thighL && calfL)
      ? thighL.getWorldPosition(new THREE.Vector3()).distanceTo(calfL.getWorldPosition(new THREE.Vector3()))
      : null;

    const ARM_TORSO_CLEARANCE = 0.010;   // POSED: 1 cm of daylight at the elbow
    const ARM_OUT_MAX_DEG = 24;          // past this it stops reading as "at his side"
    const armOutMinDeg = {};
    const armOutWhy = {};
    for (const sd of ['L', 'R']) {
      if (!sh[sd] || !el[sd]) { armOutMinDeg[sd] = null; continue; }
      const S = mp(sh[sd]);
      const L1 = S.distanceTo(mp(el[sd]));
      const rs = foreR[sd].slice().sort((a, b) => a - b);
      const rArm = rs.length ? rs[Math.min(rs.length - 1, Math.floor(rs.length * 0.90))] : 0.05;
      let chosen = null, req0 = null, half0 = null;
      const SAMPLES = [0.70, 1.00];
      for (let d = 0; d <= ARM_OUT_MAX_DEG + 1e-6; d += 0.5) {
        const th = THREE.MathUtils.degToRad(d);
        let ok = true;
        for (const f of SAMPLES) {
          const x = Math.abs(S.x) + f * L1 * Math.sin(th);
          const y = S.y - f * L1 * Math.cos(th);
          const half = torsoHalfAt(y);
          const req = half + rArm + ARM_TORSO_CLEARANCE;
          if (f === 1.00 && req0 === null) { req0 = req; half0 = half; }
          if (x < req) { ok = false; break; }
        }
        if (ok) { chosen = d; break; }
      }
      if (chosen === null) {
        console.warn('[courtsim] arm_splay_UNREACHABLE side=', sd,
          'even', ARM_OUT_MAX_DEG, 'deg of splay does not clear this torso --',
          'shoulder_x=', S.x.toFixed(4), 'upperarm_m=', L1.toFixed(4),
          'torso_half_at_elbow=', (half0 == null ? 'n/a' : half0.toFixed(4)),
          'forearm_radius=', rArm.toFixed(4),
          '-- clamped to the maximum; this arm may still graze the body.');
        chosen = ARM_OUT_MAX_DEG;
      }
      armOutMinDeg[sd] = chosen;
      armOutWhy[sd] = { shoulderX: S.x, upperArm: L1, forearmR: rArm, torsoHalfAtElbow: half0, req0, verts: rs.length };
    }

    const bindElev = {};
    for (const sd of ['L', 'R']) {
      if (!sh[sd] || !el[sd]) { bindElev[sd] = null; continue; }
      const dir = mp(el[sd]).sub(mp(sh[sd])).normalize();
      bindElev[sd] = THREE.MathUtils.radToDeg(Math.asin(-dir.y));
    }
    console.log('[courtsim] rig_profile_measured',
      'bind_upperarm_below_horizontal_deg=', [bindElev.L, bindElev.R].map((x) => (x == null ? 'n/a' : x.toFixed(3))).join('/'),
      '(90 = a level T-pose; this cast is an A-POSE and the arm chain aims absolutely, so no swing constant depends on it)',
      'bones=', nBones, 'Bip01_local_scale=', bip ? bip.scale.toArray().map((x) => x.toFixed(4)).join(',') : 'n/a',
      'bone_world_scale_min/max=', sMin.toFixed(5) + '/' + sMax.toFixed(5),
      'bones_with_non_unit_LOCAL_scale=', nonUnitLocal,
      '(the ~0.01 quirk is REAL and lives on Bip01 alone: every other bone is local (1,1,1) and inherits 0.01 in world)',
      'torso_half_max_m=', bestH.toFixed(4),
      'lap_anterior_thigh_radius_m=', lapRadius == null ? 'n/a' : lapRadius.toFixed(4),
      'lap_samples=', lapSamples.length,
      'arm_splay_min_deg_L/R=', [armOutMinDeg.L, armOutMinDeg.R].map((x) => (x == null ? 'n/a' : x.toFixed(1))).join('/'),
      'OLD_hardcoded_ARM_OUT_DEG= 7');

    const profile = { torsoHalfAt, torsoHalfMax: bestH, lapRadius, thighLen, armOutMinDeg, armOutWhy, bindElev };
    model.userData.courtsimBodyProfile = profile;
    return profile;
  }

  _collectBoneVertices(model, boneRe, cacheKey, whatForTheLog) {
    model.userData.courtsimBoneVerts = model.userData.courtsimBoneVerts || {};
    const cache = model.userData.courtsimBoneVerts;
    if (cache[cacheKey] !== undefined) return cache[cacheKey];
    const per = [];
    let total = 0, skinned = 0;
    model.traverse((n) => {
      if (!n.isSkinnedMesh || !n.skeleton || !n.geometry) return;
      skinned++;
      const si = n.geometry.getAttribute('skinIndex');
      const sw = n.geometry.getAttribute('skinWeight');
      if (!si || !sw) return;
      const want = new Set();
      n.skeleton.bones.forEach((b, i) => { if (b && boneRe.test(b.name)) want.add(i); });
      if (!want.size) return;
      const idx = [];
      for (let v = 0; v < si.count; v++) {
        let w = 0;
        for (let k = 0; k < si.itemSize; k++) {
          if (want.has(si.getComponent(v, k))) w += sw.getComponent(v, k);
        }
        if (w > 0.5) idx.push(v);
      }
      if (idx.length) { per.push({ mesh: n, idx }); total += idx.length; }
    });
    const out = total ? { per, total } : null;
    if (!out) {
      console.warn('[courtsim] bone_vertices_NOT_FOUND what=', whatForTheLog,
        'skinnedMeshes=', skinned,
        '-- no bone matching', String(boneRe), 'owns any vertex on this rig, so this',
        'part cannot be measured and the pose that depends on it is left alone.');
    }
    cache[cacheKey] = out;
    return out;
  }

  _collectFootVertices(model) {
    return this._collectBoneVertices(
      model, /^Bip01[ _][LR][ _](Foot|Toe0|Toe0Nub)$/i, 'foot', 'sole');
  }

  _runPendingArmFits() {
    const pend = this._armFitPending;
    if (!pend) return;
    for (let i = pend.length - 1; i >= 0; i--) {
      const e = pend[i];
      const st = this._animStates.find((s) => s.model === e.model);
      if (!st) { pend.splice(i, 1); continue; }
      if (st.stanceBlend < 0.995) continue;
      if (Math.abs(e.model.position.x - e.seatDef.pos[0]) > 0.002
        || Math.abs(e.model.position.z - e.seatDef.pos[2]) > 0.002) continue;
      e.settled = (e.settled || 0) + 1;
      if (e.settled < 40) continue;
      e.model.updateWorldMatrix(true, true);
      if (e.kind === 'step') {
        const saved = [];
        for (const k of ['lThigh', 'rThigh', 'lCalf', 'rCalf']) {
          const bone = st[k], rest = st[k + 'RestQuat'];
          if (bone && rest) { saved.push([bone, bone.quaternion.clone()]); bone.quaternion.copy(rest); }
        }
        e.model.updateWorldMatrix(true, true);
        st.standStep = this._standClearStep(e.model, e.seatDef, e.standY);
        for (const [bone, q] of saved) bone.quaternion.copy(q);
        e.model.updateWorldMatrix(true, true);
      } else if (e.kind === 'armverify') {
        this._assertChairArmContact(e.model, e.role);
      } else {
        this._fitChairArmToArm(e.model, e.seatDef, e.role, e.sides);
        this._armFitPending.push({
          model: e.model, seatDef: e.seatDef, role: e.role, kind: 'armverify',
        });
      }
      pend.splice(i, 1);
    }
    if (!pend.length) this._armFitPending = null;
  }

  _fitChairArmToArm(model, seatDef, roleNow, sides) {
    if (!seatDef || !seatDef.pos || !this.venueGroup) return;
    if (!sides || !sides.length) return;
    const ARM_W = 0.075;           // cap width, was 0.05, then 0.07
    const NOSE_W_EXTRA = 0.005;    // the front scroll stands this far proud of the shank
    const NOSE_Z_SQUASH = 0.65;
    const ARM_T_AUTHORED = 0.04;   // what chair() built, for the BEFORE reading
    const ARM_T_MIN = 0.045;
    const ARM_T_MAX = 0.075;
    const FRONT_MARGIN = 0.030;
    const BACK_MARGIN = 0.060;     // and this far behind the elbow
    const ELBOW_UNDER = 0.035;     // forearm underside below the elbow BONE
    const TILT_MAX_DEG = 18;
    const NOSE_R_MIN = 0.0225;
    const NOSE_R_MAX = 0.040;
    let chair = null, bd = Infinity;
    this.venueGroup.traverse((o) => {
      if (!o.userData || !o.userData.__isChair) return;
      if (!o.children.some((c) => c.name === 'ChairArm')) return;
      const d = Math.hypot(o.position.x - seatDef.pos[0], o.position.z - seatDef.pos[2]);
      if (d < bd) { bd = d; chair = o; }
    });
    if (!chair || bd > 0.60) {
      console.warn('[courtsim] chair_arm_fit_NO_CHAIR role=', roleNow,
        'nearest_with_arms_m=', Number.isFinite(bd) ? bd.toFixed(3) : 'none',
        '-- the arm caps are left at their authored position for this seat.');
      return;
    }
    chair.updateWorldMatrix(true, true);
    model.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(chair.matrixWorld).invert();
    const seated = (w) => w.clone().applyMatrix4(inv);
    const caps = chair.children.filter((c) => c.name === 'ChairArm');
    const posts = chair.children.filter((c) => c.name === 'ChairArmPost');
    const noses = chair.children.filter((c) => c.name === 'ChairArmNose');
    const tmp = new THREE.Vector3();
    const fits = [];
    for (const sd of sides) {
      const fore = model.getObjectByName('Bip01_' + sd + '_Forearm')
        || model.getObjectByName('Bip01 ' + sd + ' Forearm');
      const hand = model.getObjectByName('Bip01_' + sd + '_Hand')
        || model.getObjectByName('Bip01 ' + sd + ' Hand');
      if (!fore || !hand) continue;
      const verts = this._collectHandVertices(model, sd);
      if (!verts) continue;
      let lo = Infinity, loP = null, sx = 0, sz = 0, n = 0;
      for (const g of verts.per) {
        const mesh = g.mesh;
        if (!mesh || !mesh.isSkinnedMesh) continue;
        for (let i = 0; i < g.idx.length; i++) {
          mesh.getVertexPosition(g.idx[i], tmp);
          tmp.applyMatrix4(mesh.matrixWorld);
          if (tmp.y < lo) { lo = tmp.y; loP = tmp.clone(); }
          sx += tmp.x; sz += tmp.z; n += 1;
        }
      }
      if (!loP || !n) continue;
      const handL = seated(new THREE.Vector3(sx / n, lo, sz / n));
      const handLowL = seated(loP);
      const elbowL = seated(fore.getWorldPosition(new THREE.Vector3()));
      let palmLowY = null;
      {
        const pv = this._collectBoneVertices(
          model, new RegExp('^Bip01[ _]' + sd + '[ _]Hand$', 'i'),
          'palm_' + sd, 'chair-arm nose');
        if (pv) {
          let lowest = Infinity;
          for (const g of pv.per) {
            const mesh = g.mesh;
            if (!mesh || !mesh.isSkinnedMesh) continue;
            for (let i = 0; i < g.idx.length; i++) {
              mesh.getVertexPosition(g.idx[i], tmp);
              tmp.applyMatrix4(mesh.matrixWorld);
              const l = seated(tmp);
              if (l.y < lowest) lowest = l.y;
            }
          }
          if (Number.isFinite(lowest)) palmLowY = lowest;
        }
      }
      const tipsL = [];
      for (const fk of ['1', '2', '3', '4']) {
        const tb = model.getObjectByName('Bip01_' + sd + '_Finger' + fk + '2')
          || model.getObjectByName('Bip01 ' + sd + ' Finger' + fk + '2');
        if (tb) tipsL.push(seated(tb.getWorldPosition(new THREE.Vector3())));
      }
      const knucklesL = [];
      for (const fk of ['1', '2', '3', '4']) {
        const kb = model.getObjectByName('Bip01_' + sd + '_Finger' + fk)
          || model.getObjectByName('Bip01 ' + sd + ' Finger' + fk);
        if (kb) knucklesL.push(seated(kb.getWorldPosition(new THREE.Vector3())));
      }
      const zBackForSearch = elbowL.z + BACK_MARGIN;
      let curl = null;
      if (palmLowY != null && tipsL.length >= 3 && knucklesL.length >= 3) {
        const lateralL = knucklesL.concat(tipsL);
        const capX = lateralL.reduce((a, p) => a + p.x, 0) / lateralL.length;
        const zK = knucklesL.reduce((a, p) => a + p.z, 0) / knucklesL.length;
        const zT = tipsL.reduce((a, p) => a + p.z, 0) / tipsL.length;
        const sEll = (p, cz, cy, r, rx) => {
          const dx = (p.x - capX) / rx, dy = (p.y - cy) / r,
            dz = (p.z - cz) / (r * NOSE_Z_SQUASH);
          const t = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const ux = (p.x - capX) / Math.max(t, 1e-9), uy = (p.y - cy) / Math.max(t, 1e-9),
            uz = (p.z - cz) / Math.max(t, 1e-9);
          const rad = Math.hypot(ux, uy, uz);
          return (t - 1) * rad;      // < 0 inside, in metres along the radius
        };
        const sBox = (p, cz, t) => {
          const dx = Math.max((capX - ARM_W / 2) - p.x, p.x - (capX + ARM_W / 2));
          const dy = Math.max((palmLowY - t) - p.y, p.y - palmLowY);
          const dz = Math.max(cz - p.z, p.z - zBackForSearch);
          if (dx <= 0 && dy <= 0 && dz <= 0) return Math.max(dx, dy, dz);
          return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
        };
        const RX = ARM_W / 2 + NOSE_W_EXTRA;
        const PEN_WEIGHT = 25;
        let best = null;
        for (let ri = 0; ri <= 14; ri++) {
          const r = NOSE_R_MIN + (NOSE_R_MAX - NOSE_R_MIN) * (ri / 14);
          const cy = palmLowY - r;
          for (let zi = 0; zi <= 30; zi++) {
            const cz = (zT - 0.020) + ((zK + 0.060) - (zT - 0.020)) * (zi / 30);
            for (let ti = 0; ti <= 6; ti++) {
              const t = ARM_T_MIN + (Math.min(2 * r, ARM_T_MAX) - ARM_T_MIN) * (ti / 6);
              if (t < ARM_T_MIN - 1e-9) continue;
              let worstPen = 0, worstGap = 0;
              for (const p of tipsL) {
                const s = Math.min(sEll(p, cz, cy, r, RX), sBox(p, cz, t));
                if (s < 0) worstPen = Math.max(worstPen, -s);
                else worstGap = Math.max(worstGap, s);
              }
              const score = PEN_WEIGHT * worstPen + worstGap;
              if (!best || score < best.score) {
                best = { r, cz, cy, armT: t, worst: worstGap, pen: worstPen, score };
              }
            }
          }
        }
        if (best) {
          curl = {
            r: best.r, cz: best.cz, cy: best.cy, worst: best.worst,
            pen: best.pen,
            armT: best.armT,
            palmLowY, zK, zT, n: tipsL.length,
            capX,
            halfSpan: Math.max.apply(null, tipsL.map((p) => Math.abs(p.x - capX))),
          };
        }
      }
      if (!curl) {
        console.warn('[courtsim] chair_arm_nose_UNMEASURABLE role=', roleNow, 'side=', sd,
          'palm_plane=', palmLowY != null, 'tips=', tipsL.length, 'knuckles=', knucklesL.length,
          '-- this hand cannot be measured, so the cap keeps COURTSIM-SURFACES-014\'s',
          'flat front end. The hand on this side may still read as cupping nothing;',
          'that is reported here, not hidden.');
      }
      const cap = caps.find((c) => Math.sign(c.position.x) === Math.sign(handL.x || elbowL.x));
      if (!cap) continue;
      const beforeTop = cap.position.y + ARM_T_AUTHORED / 2;
      const beforeZ = [cap.position.z - 0.17, cap.position.z + 0.17];
      const noseR = curl ? curl.r : null;
      const noseClamped = !!(curl
        && (Math.abs(curl.r - NOSE_R_MIN) < 1e-6 || Math.abs(curl.r - NOSE_R_MAX) < 1e-6));
      let zFront = curl
        ? curl.cz
        : (Math.min(handLowL.z, handL.z) - FRONT_MARGIN);
      const zBack = elbowL.z + BACK_MARGIN;
      let capClearPull = 0;
      {
        const toChair = new THREE.Matrix4().copy(chair.matrixWorld).invert();
        const obstacles = [];
        const bb = new THREE.Box3();
        this.venueGroup.traverse((n) => {
          if (!n.isMesh || !n.name) return;
          if (n.parent === chair) return;                    // its own arms and post
          if (!/Table|Desk|Worktop|Rail|Bench|Podium|Lectern/i.test(n.name)) return;
          bb.setFromObject(n);
          if (bb.isEmpty()) return;
          const c = bb.getCenter(new THREE.Vector3());
          if (c.distanceTo(chair.getWorldPosition(new THREE.Vector3())) > 1.6) return;
          const lo = bb.min.clone().applyMatrix4(toChair);
          const hi = bb.max.clone().applyMatrix4(toChair);
          obstacles.push(new THREE.Box3(
            new THREE.Vector3(Math.min(lo.x, hi.x), Math.min(lo.y, hi.y), Math.min(lo.z, hi.z)),
            new THREE.Vector3(Math.max(lo.x, hi.x), Math.max(lo.y, hi.y), Math.max(lo.z, hi.z))));
        });
        if (obstacles.length) {
          const capX = curl ? curl.capX : handL.x;
          const yTopGuess = curl ? curl.palmLowY : handLowL.y;
          const halfW = ARM_W / 2 + NOSE_W_EXTRA + 0.02;
          for (let guard = 0; guard < 60; guard++) {
            const front = zFront - (curl ? curl.r * NOSE_Z_SQUASH : 0);
            const probe = new THREE.Box3(
              new THREE.Vector3(capX - halfW, yTopGuess - 0.09, front),
              new THREE.Vector3(capX + halfW, yTopGuess + 0.005, zFront + 0.02));
            let clash = false;
            for (const ob of obstacles) if (ob.intersectsBox(probe)) { clash = true; break; }
            if (!clash) break;
            zFront += 0.01;
            capClearPull += 0.01;
          }
          if (capClearPull > 0) {
            console.log('[courtsim] chair_arm_PULLED_BACK role=', roleNow, 'side=', sd,
              'by_m=', capClearPull.toFixed(3), 'obstacles=', obstacles.length,
              '-- the cap would have been built into furniture in front of this',
              'chair. COURTSIM-PROPS-033: the hand may now sit slightly forward of',
              'the arm\'s end, which is reported by WORST_FINGERTIP_TO_SOLID below.');
          }
        }
      }
      const frontX = curl ? curl.capX : handL.x;
      const backX = elbowL.x;
      const axDX = backX - frontX;
      const axDZ = zBack - zFront;
      const len = Math.hypot(axDX, axDZ);
      if (!(len > 0.12 && len < 0.80)) {
        console.warn('[courtsim] chair_arm_fit_IMPLAUSIBLE_LEN role=', roleNow, 'side=', sd,
          'len_m=', len.toFixed(4), '-- cap left as authored rather than built to a',
          'length no chair has. The hand will still read as hovering.');
        continue;
      }
      const yawWantedDeg = THREE.MathUtils.radToDeg(Math.atan2(axDX, axDZ));
      const yawRad = 0;
      const yawDeg = 0;
      if (Math.abs(yawWantedDeg) > 15) {
        console.log('[courtsim] chair_arm_forearm_CROSSES role=', roleNow, 'side=', sd,
          'yaw_wanted_deg=', yawWantedDeg.toFixed(2), 'front_x=', frontX.toFixed(4),
          'elbow_x=', backX.toFixed(4),
          '-- this forearm crosses the chair steeply. COURTSIM-SEATED-047 no',
          'longer slews the arm to follow it (the founder called that goofy);',
          'the arm stays straight and the hand sits on its centre line.');
      }
      const yFront = curl ? curl.palmLowY : handLowL.y;
      let yBack = elbowL.y - ELBOW_UNDER;        // and the forearm at the elbow
      const tiltWanted = THREE.MathUtils.radToDeg(Math.atan2(yBack - yFront, len));
      const tiltDeg = 0;
      const clamped = false;
      yBack = yFront;
      const elbowResidual = (elbowL.y - ELBOW_UNDER) - yBack;
      cap.geometry.dispose();
      const armT = curl
        ? THREE.MathUtils.clamp(curl.armT != null ? curl.armT : 2 * noseR, ARM_T_MIN, ARM_T_MAX)
        : ARM_T_AUTHORED;
      cap.geometry = new THREE.BoxGeometry(ARM_W, armT, len);
      const midX = (frontX + backX) / 2;
      const midZ = (zFront + zBack) / 2;
      const midTop = (yFront + yBack) / 2;
      cap.position.set(
        midX,
        midTop - (armT / 2) / Math.cos(THREE.MathUtils.degToRad(tiltDeg)),
        midZ);
      cap.quaternion
        .setFromAxisAngle(_AXIS_Y, yawRad)
        .multiply(new THREE.Quaternion().setFromAxisAngle(
          _AXIS_X, -THREE.MathUtils.degToRad(tiltDeg)));
      cap.rotation.setFromQuaternion(cap.quaternion);
      const post = posts.find((p) => Math.sign(p.position.x) === Math.sign(cap.position.x));
      if (post) {
        const POST_F = 0.68;
        const postX = frontX + axDX * POST_F;
        const postZ = zFront + axDZ * POST_F;
        const topAtPost = midTop
          + Math.tan(THREE.MathUtils.degToRad(tiltDeg)) * ((POST_F - 0.5) * len);
        const SEAT_TOP = 0.08;                            // chair() puts the pan top here
        const h = Math.max(0.06, topAtPost - armT - SEAT_TOP);
        post.geometry.dispose();
        post.geometry = new THREE.BoxGeometry(0.04, h, 0.05);
        post.position.set(postX, SEAT_TOP + h / 2, postZ);
        post.rotation.set(0, yawRad, 0);
      }
      const nose = noses.find((nz) => Math.sign(nz.position.x) === Math.sign(cap.position.x));
      if (nose && curl) {
        nose.scale.set(ARM_W / 2 + NOSE_W_EXTRA, noseR, noseR * NOSE_Z_SQUASH);
        nose.position.set(
          frontX,
          yFront - (armT / 2) / Math.cos(THREE.MathUtils.degToRad(tiltDeg)),
          zFront);
        nose.quaternion.copy(cap.quaternion);
        nose.rotation.setFromQuaternion(nose.quaternion);
        if (noseClamped && curl.worst > 0.012) {
          console.warn('[courtsim] CHAIR_ARM_NOSE_AT_RANGE_END role=', roleNow, 'side=', sd,
            'built_r_m=', noseR.toFixed(4), 'range=', NOSE_R_MIN + '..' + NOSE_R_MAX,
            'worst_tip_m=', curl.worst.toFixed(4),
            '-- the best nose inside the range a chair arm may plausibly have is',
            'at its edge AND the worst fingertip is still more than 12 mm off it,',
            'so this hand really does want an end no chair has. Reported rather',
            'than built, because a bolster is not a chair arm.');
        }
      } else if (nose) {
        nose.position.set(frontX, yFront - 0.030, zFront);
        nose.quaternion.copy(cap.quaternion);
        nose.rotation.setFromQuaternion(nose.quaternion);
      }
      chair.updateMatrixWorld(true);
      {
        const stt = this._animStates.find((x) => x.model === model);
        const pin = stt && stt.contactPins
          && stt.contactPins.find((pp) => pp.side === sd && /^chair arm cap/.test(pp.what));
        if (pin) {
          const under = curl ? (yFront - Math.max(armT, 2 * noseR)) : (yFront - armT);
          pin.supportY = new THREE.Vector3(frontX, under, zFront)
            .applyMatrix4(chair.matrixWorld).y;
          pin.what = 'chair arm cap (underside)';
        }
      }
      let tipGapAfter = null;
      let tipPenAfter = 0;
      const perFinger = [];
      {
        const solids = [cap, nose].filter(Boolean);
        for (const s of solids) s.updateMatrixWorld(true);
        let worst = -1;
        for (const fk of ['0', '1', '2', '3', '4']) {
          const tb = model.getObjectByName('Bip01_' + sd + '_Finger' + fk + '2')
            || model.getObjectByName('Bip01 ' + sd + ' Finger' + fk + '2');
          if (!tb) continue;
          const tw = tb.getWorldPosition(new THREE.Vector3());
          let best = Infinity;
          for (const s of solids) {
            const lp = tw.clone().applyMatrix4(new THREE.Matrix4().copy(s.matrixWorld).invert());
            const ws = s.getWorldScale(new THREE.Vector3());
            let d;
            if (s === nose) {
              const r = lp.length();
              const dir = lp.clone().multiplyScalar(1 / Math.max(r, 1e-9));
              const rad = dir.clone().multiply(ws).length();
              d = (r - 1) * rad;
            } else {
              if (!s.geometry.boundingBox) s.geometry.computeBoundingBox();
              const bb = s.geometry.boundingBox;
              const ox = Math.max(bb.min.x - lp.x, lp.x - bb.max.x);
              const oy = Math.max(bb.min.y - lp.y, lp.y - bb.max.y);
              const oz = Math.max(bb.min.z - lp.z, lp.z - bb.max.z);
              if (ox <= 0 && oy <= 0 && oz <= 0) {
                d = Math.max(ox * ws.x, oy * ws.y, oz * ws.z);
              } else {
                d = Math.hypot(
                  Math.max(ox, 0) * ws.x, Math.max(oy, 0) * ws.y, Math.max(oz, 0) * ws.z);
              }
            }
            if (d < best) best = d;
          }
          perFinger.push({ f: fk, mm: +(best * 1000).toFixed(1) });
          if (best < 0) tipPenAfter = Math.max(tipPenAfter, -best);
          if (best > worst) worst = best;
        }
        if (worst > -Infinity) tipGapAfter = Math.max(0, worst);
      }
      console.log('[courtsim] chair_arm_FITTED role=', roleNow, 'side=', sd,
        'chair=', chair.name,
        'hand_lowest_chair_local=', handLowL.toArray().map((v) => v.toFixed(4)).join(','),
        'elbow_chair_local=', elbowL.toArray().map((v) => v.toFixed(4)).join(','),
        'cap_top_BEFORE_y=', beforeTop.toFixed(4),
        'cap_z_BEFORE=', beforeZ.map((v) => v.toFixed(3)).join('..'),
        'hand_gap_in_front_BEFORE_m=', (beforeZ[0] - handLowL.z).toFixed(4),
        'elbow_above_cap_BEFORE_m=', (elbowL.y - beforeTop).toFixed(4),
        'cap_z_AFTER=', zFront.toFixed(3) + '..' + zBack.toFixed(3),
        'cap_len_AFTER_m=', len.toFixed(4), 'cap_width_AFTER_m=', ARM_W,
        'cap_top_at_hand_AFTER_y=', yFront.toFixed(4),
        'cap_top_at_elbow_AFTER_y=', yBack.toFixed(4),
        'elbow_above_cap_AFTER_m=', elbowResidual.toFixed(4),
        'tilt_deg=', tiltDeg.toFixed(2), 'tilt_clamped=', clamped,
        'tilt_wanted_deg=', tiltWanted.toFixed(2), 'yaw_wanted_deg=', yawWantedDeg.toFixed(2),
        'hand_vertices=', verts.total,
        '| COURTSIM-POLISH-034 lateral:',
        'cap_front_x=', frontX.toFixed(4), 'elbow_x=', backX.toFixed(4),
        'OLD_midpoint_x=', ((handL.x + elbowL.x) / 2).toFixed(4),
        'moved_inboard_m=', Math.abs(frontX - (handL.x + elbowL.x) / 2).toFixed(4),
        'yaw_deg=', yawDeg.toFixed(2),
        'widest_fingertip_off_axis_m=', curl ? curl.halfSpan.toFixed(4) : 'n/a',
        '(arm half-width', (ARM_W / 2).toFixed(4), '+ nose', NOSE_W_EXTRA + ')',
        '| COURTSIM-PROPS-033 nose:',
        'nose_r_m=', noseR == null ? 'n/a' : noseR.toFixed(4),
        'cap_thickness_m=', armT.toFixed(4), '(authored', ARM_T_AUTHORED + ')',
        'nose_clamped=', noseClamped,
        'nose_z=', zFront.toFixed(4),
        'nose_solved_worst_tip_m=', curl ? curl.worst.toFixed(4) : 'n/a',
        'palm_plane_y=', curl ? curl.palmLowY.toFixed(4) : 'n/a',
        'knuckle_z=', curl ? curl.zK.toFixed(4) : 'n/a',
        'tip_z=', curl ? curl.zT.toFixed(4) : 'n/a',
        'WORST_FINGERTIP_TO_SOLID_m=', tipGapAfter == null ? 'n/a' : tipGapAfter.toFixed(4),
        '| COURTSIM-SEATED-047 per finger, SIGNED, mm (F0 thumb .. F4 pinky,',
        'negative = INSIDE the arm):',
        perFinger.map((t) => 'F' + t.f + ':' + t.mm).join(' '),
        'WORST_FINGERTIP_INSIDE_mm=', (tipPenAfter * 1000).toFixed(1),
        '-- COURTSIM-SURFACES-014: the chair moved, the person did not.',
        'COURTSIM-PROPS-033: and it now ends in something the hand can close on.',
        'COURTSIM-SEATED-047: and the fingers are no longer INSIDE it. The',
        'old WORST_FINGERTIP_TO_SOLID was an UNSIGNED distance, so it read',
        '0.0000 for a fingertip 27 mm inside the solid and three lanes shipped',
        'that as a perfect fit.');
      console.log('[courtsim] chair_arm_fit_INTERMEDIATE role=', roleNow, 'side=', sd,
        'worst_inside_mm=', (tipPenAfter * 1000).toFixed(1),
        'worst_gap_mm=', tipGapAfter == null ? 'n/a' : (tipGapAfter * 1000).toFixed(1),
        '-- pre-symmetry, pre-re-aim. See chair_arm_CONTACT for the shipped numbers.');
      fits.push({
        sd,
        palmLowY: curl ? curl.palmLowY : handLowL.y,
        capX: curl ? curl.capX : handL.x,
        zFront, zBack, armT, noseR,
      });
      if (clamped) {
        console.warn('[courtsim] CHAIR_ARM_TILT_CLAMPED role=', roleNow, 'side=', sd,
          'at', TILT_MAX_DEG, 'deg; the elbow is still', elbowResidual.toFixed(4),
          'm above the cap. Closing it would need a ramp, not a chair arm, so the',
          'residual is reported instead of built.');
      }
    }
    this._symmetriseChairArms(chair, roleNow, fits);
  }

  _assertChairArmContact(model, roleForLog) {
    const rep = this.getChairArmReport();
    for (const h of rep.hands) {
      const st = this._animStates.find((s) => s.role === h.role);
      if (!st || st.model !== model) continue;
      if (h.worst_gap_mm > 120) continue;
      console.log('[courtsim] chair_arm_CONTACT role=', h.role, 'side=', h.side,
        'chair=', h.chair, 'per_finger_mm=', h.per,
        'worst_inside_mm=', h.worst_inside_mm, 'worst_gap_mm=', h.worst_gap_mm,
        '-- COURTSIM-SEATED-047 item 2, measured on the pose that renders.');
      if (h.worst_inside_mm > 4) {
        console.error('[courtsim] FINGERS_INSIDE_CHAIR_ARM role=', h.role, 'side=', h.side,
          'worst_inside_mm=', h.worst_inside_mm, 'per_finger=', h.per,
          '-- the founder\'s "the pinky finger and the ring fingers are all',
          'inside the chair as well". A negative number is a finger in the wood.');
      } else if (h.worst_gap_mm > 20) {
        console.error('[courtsim] HAND_CUPPING_NOTHING role=', h.role, 'side=', h.side,
          'worst_gap_mm=', h.worst_gap_mm, 'per_finger=', h.per,
          '-- the fingers close on air. COURTSIM-PROPS-033 item 4.');
      }
    }
  }

  _symmetriseChairArms(chair, roleForLog, fits) {
    if (!chair) return;
    const caps = chair.children.filter((c) => c.name === 'ChairArm');
    if (caps.length !== 2) return;
    const [a, b] = caps;
    if (Math.sign(a.position.x) === Math.sign(b.position.x)) return;
    const pa = a.geometry.parameters, pb = b.geometry.parameters;
    if (!pa || !pb || pa.width == null || pb.width == null) return;
    const mid = (u, v) => (u + v) / 2;
    const x = mid(Math.abs(a.position.x), Math.abs(b.position.x));
    const y = mid(a.position.y, b.position.y);
    const z = mid(a.position.z, b.position.z);
    const w = mid(pa.width, pb.width);
    const t = mid(pa.height, pb.height);
    const len = mid(pa.depth, pb.depth);
    const asym = {
      x: Math.abs(Math.abs(a.position.x) - Math.abs(b.position.x)),
      y: Math.abs(a.position.y - b.position.y),
      z: Math.abs(a.position.z - b.position.z),
      len: Math.abs(pa.depth - pb.depth),
      t: Math.abs(pa.height - pb.height),
    };
    for (const c of caps) {
      const sgn = Math.sign(c.position.x) || 1;
      c.geometry.dispose();
      c.geometry = new THREE.BoxGeometry(w, t, len);
      c.position.set(sgn * x, y, z);
      c.quaternion.identity();
      c.rotation.set(0, 0, 0);
    }
    const noseR = t / 2;
    const zFront = z - len / 2;
    let noseAsym = 0;
    for (const n of chair.children.filter((c) => c.name === 'ChairArmNose')) {
      const sgn = Math.sign(n.position.x) || 1;
      noseAsym = Math.max(noseAsym, Math.abs(Math.abs(n.position.x) - x));
      n.scale.set(w / 2, noseR, noseR * 0.75);
      n.position.set(sgn * x, y + t / 2 - noseR, zFront);
      n.quaternion.identity();
      n.rotation.set(0, 0, 0);
    }
    for (const p of chair.children.filter((c) => c.name === 'ChairArmPost')) {
      const sgn = Math.sign(p.position.x) || 1;
      const pp = p.geometry.parameters;
      const bottom = p.position.y - (pp && pp.height ? pp.height / 2 : 0.085);
      const top = y - t / 2;
      const h = Math.max(0.06, top - bottom);
      p.geometry.dispose();
      p.geometry = new THREE.BoxGeometry(
        (pp && pp.width) || 0.04, h, (pp && pp.depth) || 0.05);
      p.position.set(sgn * x, bottom + h / 2, p.position.z);
      p.quaternion.identity();
      p.rotation.set(0, 0, 0);
    }
    chair.updateMatrixWorld(true);
    const chairInv = new THREE.Matrix4().copy(chair.matrixWorld).invert();
    const zLo = z - len / 2 + 0.045;
    const zHi = z + len / 2 - 0.045;
    for (const st of this._animStates || []) {
      if (st.chair !== chair || !st.contactPins || !st.model) continue;
      st.model.updateMatrixWorld(true);
      for (const pin of st.contactPins) {
        if (!/^chair arm cap/.test(pin.what || '')) continue;
        if (pin.ha && pin.local) {
          const hw = pin.ha.getWorldPosition(new THREE.Vector3());
          const hl = hw.clone().applyMatrix4(chairInv);
          const sgn = Math.sign(hl.x) || 1;
          const f = (fits || []).find((q) => q.sd === pin.side);
          const lift = (f && Number.isFinite(f.palmLowY))
            ? THREE.MathUtils.clamp(hl.y - f.palmLowY, 0.015, 0.140)
            : REST_WRIST_LIFT;
          const moved = new THREE.Vector3(
            sgn * x,
            y + t / 2 + lift,
            THREE.MathUtils.clamp(hl.z, zLo, zHi));
          const before = hl.clone();
          const tipsC = [];
          for (const fk of ['0', '1', '2', '3', '4']) {
            const tb = st.model.getObjectByName('Bip01_' + pin.side + '_Finger' + fk + '2')
              || st.model.getObjectByName('Bip01 ' + pin.side + ' Finger' + fk + '2');
            if (tb) tipsC.push(tb.getWorldPosition(new THREE.Vector3()).applyMatrix4(chairInv));
          }
          if (tipsC.length) {
            const capHalfW = w / 2, capTop = y + t / 2, capBot = y - t / 2;
            const nCz = z - len / 2, nCy = capTop - noseR;
            const sCap = (p) => {
              const dx = Math.max((sgn * x - capHalfW) - p.x, p.x - (sgn * x + capHalfW));
              const dy = Math.max(capBot - p.y, p.y - capTop);
              const dz = Math.max((z - len / 2) - p.z, p.z - (z + len / 2));
              return (dx <= 0 && dy <= 0 && dz <= 0)
                ? Math.max(dx, dy, dz)
                : Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0));
            };
            const sNose = (p) => {
              const ax = (p.x - sgn * x) / capHalfW, ay = (p.y - nCy) / noseR,
                az = (p.z - nCz) / (noseR * 0.75);
              const tt = Math.max(Math.sqrt(ax * ax + ay * ay + az * az), 1e-9);
              const rad = Math.hypot((p.x - sgn * x) / tt, (p.y - nCy) / tt, (p.z - nCz) / tt);
              return (tt - 1) * rad;
            };
            const base = moved.clone().sub(hl);
            let bestD = null;
            const p = new THREE.Vector3();
            const axC = new THREE.Vector3(1, 0, 0);
            const qr = new THREE.Quaternion();
            const rel = new THREE.Vector3();
            for (let it = -10; it <= 10; it++) {
              const th = THREE.MathUtils.degToRad(it * 3);      // +-30 deg
              qr.setFromAxisAngle(axC, th);
              const rot = [];
              for (const tc of tipsC) {
                rel.copy(tc).sub(hl).applyQuaternion(qr).add(hl);
                rot.push(rel.clone());
              }
              for (let iy = -12; iy <= 12; iy++) {
                for (let ix = -6; ix <= 6; ix++) {
                  const dy = iy * 0.004, dx = ix * 0.004;
                  let pen = 0, gap = 0;
                  for (const tc of rot) {
                    p.set(tc.x + base.x + dx, tc.y + base.y + dy, tc.z + base.z);
                    const sd2 = Math.min(sCap(p), sNose(p));
                    if (sd2 < 0) pen = Math.max(pen, -sd2); else gap = Math.max(gap, sd2);
                  }
                  const sc = 4 * pen + gap;
                  if (!bestD || sc < bestD.sc) bestD = { dx, dy, th, sc, pen, gap };
                }
              }
            }
            if (bestD) {
              moved.x += bestD.dx;
              moved.y += bestD.dy;
              if (Math.abs(bestD.th) > 1e-6 && pin.wq) {
                const axW = new THREE.Vector3(1, 0, 0)
                  .applyQuaternion(chair.getWorldQuaternion(new THREE.Quaternion()))
                  .normalize();
                pin.wq = new THREE.Quaternion()
                  .setFromAxisAngle(axW, bestD.th).multiply(pin.wq);
              }
              console.log('[courtsim] chair_arm_TIP_SOLVED role=', st.role, 'side=', pin.side,
                'dx_mm=', (bestD.dx * 1000).toFixed(1), 'dy_mm=', (bestD.dy * 1000).toFixed(1),
                'wrist_deg=', THREE.MathUtils.radToDeg(bestD.th).toFixed(1),
                'predicted_worst_inside_mm=', (bestD.pen * 1000).toFixed(1),
                'predicted_worst_gap_mm=', (bestD.gap * 1000).toFixed(1),
                '-- COURTSIM-SEATED-047 item 2: the hand is placed AND turned so',
                'its own fingertips land on the arm, instead of its wrist being',
                'made level with one.');
            }
          }
          moved.applyMatrix4(chair.matrixWorld);
          pin.local = st.model.worldToLocal(moved.clone());
          console.log('[courtsim] chair_arm_HAND_RE_AIMED role=', st.role, 'side=', pin.side,
            'chair_local_BEFORE=', before.toArray().map((n) => n.toFixed(4)).join(','),
            'chair_local_AFTER=',
            [sgn * x, y + t / 2 + lift,
              THREE.MathUtils.clamp(hl.z, zLo, zHi)].map((n) => n.toFixed(4)).join(','),
            'wrist_above_palm_measured_m=', lift.toFixed(4),
            '(REST_WRIST_LIFT is', REST_WRIST_LIFT, 'and is a PALM-DOWN number)',
            'moved_lateral_mm=', (Math.abs(Math.abs(before.x) - x) * 1000).toFixed(1),
            'moved_vertical_mm=',
            (Math.abs(before.y - (y + t / 2 + lift)) * 1000).toFixed(1),
            'z_clamped=', hl.z < zLo || hl.z > zHi,
            '-- COURTSIM-SEATED-047 item 2: the arm is furniture and does not',
            'bend, so the hand comes to it.');
        }
        pin.supportY = new THREE.Vector3(0, y - t / 2, 0)
          .applyMatrix4(chair.matrixWorld).y;
        pin.what = 'chair arm cap (underside, symmetrised)';
      }
    }
    console.log('[courtsim] chair_arms_SYMMETRISED role=', roleForLog,
      'chair=', chair.name,
      'asym_x_mm=', (asym.x * 1000).toFixed(1),
      'asym_top_y_mm=', (asym.y * 1000).toFixed(1),
      'asym_z_mm=', (asym.z * 1000).toFixed(1),
      'asym_len_mm=', (asym.len * 1000).toFixed(1),
      'asym_thickness_mm=', (asym.t * 1000).toFixed(1),
      'asym_nose_x_mm=', (noseAsym * 1000).toFixed(1),
      'AFTER: |x|=', x.toFixed(4), 'top_y=', (y + t / 2).toFixed(4),
      'len=', len.toFixed(4), 'thickness=', t.toFixed(4), 'nose_r=', noseR.toFixed(4),
      'tilt=0 yaw=0',
      '-- COURTSIM-SEATED-047 item 2: "it\'s two different armrests on one',
      'chair, which is just not right". These are the differences that were',
      'there and are not now.');
  }

  _standClearStep(model, seatDef, standY) {
    if (!seatDef || !seatDef.pos || !this.venueGroup) return 0;
    const MARGIN = 0.035;      // shin to seat edge once clear
    const MAX_STEP = 0.50;     // a step, not a walk. Anything past this is a bug.
    model.updateWorldMatrix(true, true);
    const legs = this._collectBoneVertices(
      model, /^Bip01[ _][LR][ _](Thigh|Calf|Foot|Toe0|Toe0Nub)$/i, 'leg', 'stand-clear');
    if (!legs) return 0;
    const bq = model.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq).setY(0);
    if (fwd.lengthSq() < 1e-8) return 0;
    fwd.normalize();
    const ox = seatDef.pos[0], oz = seatDef.pos[2];
    const toLocal = new THREE.Matrix4().copy(model.matrixWorld).invert();
    let legBack = Infinity;
    const v = new THREE.Vector3();
    for (const g of legs.per) {
      const mesh = g.mesh;
      if (!mesh || !mesh.isSkinnedMesh) continue;
      for (let i = 0; i < g.idx.length; i++) {
        mesh.getVertexPosition(g.idx[i], v);
        v.applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal);
        if (v.z < legBack) legBack = v.z;
      }
    }
    if (!(legBack > -0.60 && legBack < 0.10)) {
      console.warn('[courtsim] stand_clear_LEG_EXTENT_IMPLAUSIBLE role=', seatDef.role,
        'model_local_leg_back_z=', Number.isFinite(legBack) ? legBack.toFixed(4) : 'none',
        '-- no adult standing figure has its heels there. No step is applied;',
        'this figure keeps the shipped chair-slide behaviour.');
      return 0;
    }
    if (!Number.isFinite(legBack)) return 0;
    const box = new THREE.Box3();
    const PAD = 0.32;
    let seatFront = -Infinity, which = null, slide = 0;
    this.venueGroup.traverse((o) => {
      if (!o.isMesh || !/^(ChairSeat|GalleryBenchSeat\d)$/.test(o.name)) return;
      box.setFromObject(o);
      if (box.max.y < standY + 0.20 || box.min.y > standY + 0.80) return;  // a seat, at seat height
      if (ox < box.min.x - PAD || ox > box.max.x + PAD) return;
      if (oz < box.min.z - PAD || oz > box.max.z + PAD) return;
      const slabExit = (mn, mx, o, d) => {
        if (Math.abs(d) < 1e-6) return (o >= mn && o <= mx) ? Infinity : -Infinity;
        const t1 = (mn - o) / d, t2 = (mx - o) / d;
        return Math.max(t1, t2);
      };
      const tx = slabExit(box.min.x, box.max.x, ox, fwd.x);
      const tz = slabExit(box.min.z, box.max.z, oz, fwd.z);
      const localFront = Math.min(tx, tz);
      if (!(localFront > -1e5) || localFront === Infinity) return;
      if (localFront > seatFront) {
        seatFront = localFront; which = o.name;
        const ch = o.parent;
        slide = (ch && ch.userData && ch.userData.__isChair)
          ? Math.hypot(ch.userData.__slideX || 0, ch.userData.__slideZ || 0) : 0;
      }
    });
    if (!Number.isFinite(seatFront) || seatFront === -Infinity) return 0;
    const need = (seatFront - slide) + MARGIN - legBack;
    const step = Math.max(0, Math.min(MAX_STEP, need));
    console.log('[courtsim] stand_clear role=', seatDef.role,
      'seat_solid=', which,
      'seat_front_along_fwd_m=', seatFront.toFixed(4),
      '(COURTSIM-POLISH-034: ray/slab exit, not a corner projection)',
      'chair_slide_m=', slide.toFixed(4),
      'standing_leg_back_along_fwd_m=', legBack.toFixed(4),
      'margin_m=', MARGIN, 'step_required_m=', need.toFixed(4),
      'step_applied_m=', step.toFixed(4),
      'leg_vertices=', legs.total,
      '-- COURTSIM-SURFACES-014: applied only while standing, faded on stanceBlend.');
    if (need > MAX_STEP) {
      console.warn('[courtsim] STAND_CLEAR_CLAMPED role=', seatDef.role,
        'wanted', need.toFixed(4), 'm, capped at', MAX_STEP,
        '-- this figure will still be inside its seat when it stands. That is a',
        'furniture measurement problem, not a step length problem.');
    }
    return step;
  }

  _supportYUnder(x, z, baseY) {
    this._lastSupportName = null;
    if (!this.venueGroup) return baseY;
    const WALKABLE = /carpet|rug|runner|floor|platform|riser|tier|dais|step/i;
    const EXCLUDE = /wall|ceiling|panel|rail|desk|table|chair|bench(?!platform|step)|back|cap|stile|plinth|lip|worktop/i;
    let best = baseY, bestName = null;
    const box = new THREE.Box3();
    this.venueGroup.traverse((o) => {
      if (!o.isMesh || !o.name) return;
      if (!WALKABLE.test(o.name) || EXCLUDE.test(o.name)) return;
      box.setFromObject(o);
      if (x < box.min.x - 1e-4 || x > box.max.x + 1e-4) return;
      if (z < box.min.z - 1e-4 || z > box.max.z + 1e-4) return;
      const top = box.max.y;
      if (top < baseY - 0.01 || top > baseY + 0.25) return;
      if (top > best) { best = top; bestName = o.name; }
    });
    this._lastSupportName = bestName;
    return best;
  }

  _collectHandVertices(model, side) {
    return this._collectBoneVertices(
      model,
      new RegExp('^Bip01[ _]' + side + '[ _](Hand|Finger[0-4][0-3]?|Finger[0-4]Nub)$', 'i'),
      'hand' + side, 'hand ' + side);
  }

  _lowestVertexY(model, verts) {
    if (!verts) return null;
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    let low = Infinity;
    const v = new THREE.Vector3();
    for (const { mesh, idx } of verts.per) {
      for (let i = 0; i < idx.length; i++) {
        mesh.getVertexPosition(idx[i], v);
        v.applyMatrix4(mesh.matrixWorld);
        if (v.y < low) low = v.y;
      }
    }
    return Number.isFinite(low) ? low : null;
  }

  _measureSeatedSoleY(model, ls, seatedRootY, bones, footVerts) {
    if (!footVerts || !ls) return null;
    const { lThigh, rThigh, lCalf, rCalf } = bones;
    if (!lThigh || !rThigh || !lCalf || !rCalf) return null;
    const saveY = model.position.y;
    const save = [lThigh, rThigh, lCalf, rCalf].map((b) => b.quaternion.clone());
    const q = new THREE.Quaternion();
    model.position.y = seatedRootY;
    lThigh.quaternion.copy(save[0]).premultiply(q.setFromAxisAngle(ls.lThighAxis, ls.hipRad));
    rThigh.quaternion.copy(save[1]).premultiply(q.setFromAxisAngle(ls.rThighAxis, ls.hipRad));
    lCalf.quaternion.copy(save[2]).premultiply(q.setFromAxisAngle(ls.lCalfAxis, ls.kneeRad));
    rCalf.quaternion.copy(save[3]).premultiply(q.setFromAxisAngle(ls.rCalfAxis, ls.kneeRad));
    model.updateWorldMatrix(true, false);   // parents
    model.updateMatrixWorld(true);          // self + children, refreshing bindMatrixInverse
    let low = Infinity;
    const v = new THREE.Vector3();
    for (const { mesh, idx } of footVerts.per) {
      for (let i = 0; i < idx.length; i++) {
        mesh.getVertexPosition(idx[i], v);
        v.applyMatrix4(mesh.matrixWorld);
        if (v.y < low) low = v.y;
      }
    }
    model.position.y = saveY;
    lThigh.quaternion.copy(save[0]); rThigh.quaternion.copy(save[1]);
    lCalf.quaternion.copy(save[2]); rCalf.quaternion.copy(save[3]);
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);          // put bindMatrixInverse back too
    return Number.isFinite(low) ? low : null;
  }

  _measureSeatedPelvisDrop(model, roleForLog, seatSurfaceY, standY, pelvisRise) {
    const pelvis = model.getObjectByName('Bip01_Pelvis') || model.getObjectByName('Bip01 Pelvis');
    const get = (n) => model.getObjectByName('Bip01_' + n) || model.getObjectByName('Bip01 ' + n);
    const lThigh = get('L_Thigh') || get('L Thigh');
    const rThigh = get('R_Thigh') || get('R Thigh');
    const lCalf = get('L_Calf') || get('L Calf');
    const rCalf = get('R_Calf') || get('R Calf');
    const lFoot = get('L_Foot') || get('L Foot');
    if (!pelvis || !lThigh || !rThigh || !lCalf || !rCalf) {
      console.warn('[courtsim] seat_drop_UNMEASURABLE role=', roleForLog,
        '-- pelvis or a leg bone is missing, so this figure keeps the old',
        'SEAT_PELVIS_LIFT assumption and may still sit inside its chair.');
      return null;
    }
    model.updateWorldMatrix(true, true);
    const wp = (o) => o.getWorldPosition(new THREE.Vector3());
    const lHipW = wp(lThigh), rHipW = wp(rThigh);
    const hipSpan = new THREE.Vector3().subVectors(rHipW, lHipW);
    if (hipSpan.length() <= 0.02) {
      console.warn('[courtsim] seat_drop_UNMEASURABLE role=', roleForLog,
        'hip_span_m=', hipSpan.length().toFixed(4),
        '-- degenerate hip span; see the leg solve for why one missing thigh',
        'bone produces a near-vertical 0.9 m "span". Keeping the old constant.');
      return null;
    }
    const axisWorld = hipSpan.normalize();
    const yawFwd = new THREE.Vector3(Math.sin(model.rotation.y), 0, Math.cos(model.rotation.y));
    const thighVec = new THREE.Vector3().subVectors(wp(lCalf), lHipW).normalize();
    const rotBy = (deg) => thighVec.clone().applyQuaternion(
      new THREE.Quaternion().setFromAxisAngle(axisWorld, THREE.MathUtils.degToRad(deg)));
    const flexSign = rotBy(88).dot(yawFwd) >= rotBy(-88).dot(yawFwd) ? 1 : -1;
    const inParent = (bone) => {
      const pq = bone.parent
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion();
      return axisWorld.clone().applyQuaternion(pq.invert());
    };
    const lenThigh = lHipW.distanceTo(wp(lCalf));
    const lenCalf = lFoot ? wp(lCalf).distanceTo(wp(lFoot)) : 0.395;
    const ankleAboveRoot = lFoot ? (wp(lFoot).y - model.position.y) : 0.10;
    const bones = [lThigh, rThigh, lCalf, rCalf];
    const save = bones.map((b) => b.quaternion.clone());
    const saveY = model.position.y;
    const axL = inParent(lThigh), axR = inParent(rThigh);
    const axLC = inParent(lCalf), axRC = inParent(rCalf);
    const q = new THREE.Quaternion();
    const footVerts = this._collectFootVertices(model);
    let lift = SEAT_PELVIS_LIFT;
    let soleLift = 0;
    let hipDeg = 88, passes = 0, residSeat = 0, residSole = 0;
    let ok = true;
    for (let pass = 0; pass < 6; pass++) {
      passes = pass + 1;
      const wantDrop = (seatSurfaceY + lift) - (standY + ankleAboveRoot) - soleLift;
      const cosTh = (wantDrop - lenCalf) / lenThigh;
      let hd = (cosTh >= -1 && cosTh <= 1) ? THREE.MathUtils.radToDeg(Math.acos(cosTh)) : 88;
      if (!(hd > 60 && hd < 115)) hd = 88;
      hipDeg = hd;
      const hipRad = THREE.MathUtils.degToRad(hipDeg) * flexSign;
      lThigh.quaternion.copy(save[0]).premultiply(q.setFromAxisAngle(axL, hipRad));
      rThigh.quaternion.copy(save[1]).premultiply(q.setFromAxisAngle(axR, hipRad));
      lCalf.quaternion.copy(save[2]).premultiply(q.setFromAxisAngle(axLC, -hipRad));
      rCalf.quaternion.copy(save[3]).premultiply(q.setFromAxisAngle(axRC, -hipRad));
      model.position.y = seatSurfaceY + lift - pelvisRise;
      model.updateWorldMatrix(true, false);
      model.updateMatrixWorld(true);
      const d = this._lowestInPelvisColumn(model, pelvis);
      if (d == null) { ok = false; break; }
      const pelvisY = pelvis.getWorldPosition(new THREE.Vector3()).y;
      residSeat = seatSurfaceY - (pelvisY - d);      // > 0 => still inside the seat
      residSole = 0;
      if (footVerts) {
        let low = Infinity;
        const v = new THREE.Vector3();
        for (const { mesh, idx } of footVerts.per) {
          for (let i = 0; i < idx.length; i++) {
            mesh.getVertexPosition(idx[i], v);
            v.applyMatrix4(mesh.matrixWorld);
            if (v.y < low) low = v.y;
          }
        }
        if (Number.isFinite(low)) residSole = standY - low;  // > 0 => sole below the floor
      }
      if (Math.abs(residSeat) < 0.002 && Math.abs(residSole) < 0.002) break;
      lift += residSeat;
      soleLift += residSole;
    }
    bones.forEach((b, i) => b.quaternion.copy(save[i]));
    model.position.y = saveY;
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    if (!ok) return null;
    console.log('[courtsim] seat_lift_solved role=', roleForLog,
      'lift_m=', lift.toFixed(4), 'hip_deg_used=', hipDeg.toFixed(2),
      'passes=', passes, 'resid_seat_mm=', (residSeat * 1000).toFixed(1),
      'resid_sole_mm=', (residSole * 1000).toFixed(1),
      'thigh_m=', lenThigh.toFixed(4), 'calf_m=', lenCalf.toFixed(4),
      '-- pre-pass only; the real leg solve and seat_contact are authoritative.');
    return lift;
  }

  _lowestInPelvisColumn(model, pelvis) {
    const pw = pelvis.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1); else fwd.normalize();
    const v = new THREE.Vector3();
    const r2 = SEAT_COLUMN_R * SEAT_COLUMN_R;
    let low = Infinity, n = 0;
    model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry) return;
      const pos = o.geometry.getAttribute('position');
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        o.getVertexPosition(i, v);
        v.applyMatrix4(o.matrixWorld);
        const dx = v.x - pw.x, dz = v.z - pw.z;
        if (dx * dx + dz * dz > r2) continue;
        if (dx * fwd.x + dz * fwd.z > SEAT_COLUMN_FWD) continue;
        n++;
        if (v.y < low) low = v.y;
      }
    });
    if (!n || !Number.isFinite(low)) return null;
    return pw.y - low;
  }

  _seatTopUnder(x, z, nominalSeatY) {
    this._lastSeatSurfaceName = null;
    if (!this.venueGroup) return nominalSeatY;
    const SITTABLE = /ChairSeat|BenchSeat|SeatPan|Pew/i;
    let best = null, bestName = null;
    const box = new THREE.Box3();
    this.venueGroup.traverse((o) => {
      if (!o.isMesh || !o.name || !SITTABLE.test(o.name)) return;
      box.setFromObject(o);
      if (x < box.min.x - 1e-4 || x > box.max.x + 1e-4) return;
      if (z < box.min.z - 1e-4 || z > box.max.z + 1e-4) return;
      const top = box.max.y;
      if (top < nominalSeatY - 0.20 || top > nominalSeatY + 0.20) return;
      if (best === null || top > best) { best = top; bestName = o.name; }
    });
    if (best === null) return nominalSeatY;
    this._lastSeatSurfaceName = bestName;
    if (Math.abs(best - nominalSeatY) > 0.005) {
      console.log('[courtsim] seat_surface_DIFFERS mesh=', bestName,
        'measured_top=', best.toFixed(4), 'seatDef.seatY=', nominalSeatY.toFixed(4),
        '-- the measured surface wins. A seat height literal and the mesh under',
        'it have drifted apart; that drift is what D-01/D-02 were.');
    }
    return best;
  }

  _measureSeatedPelvisLowY(model, ls, seatedRootY, bones) {
    const pelvis = model.getObjectByName('Bip01_Pelvis') || model.getObjectByName('Bip01 Pelvis');
    if (!pelvis || !ls) return null;
    const { lThigh, rThigh, lCalf, rCalf } = bones;
    if (!lThigh || !rThigh || !lCalf || !rCalf) return null;
    const saveY = model.position.y;
    const save = [lThigh, rThigh, lCalf, rCalf].map((b) => b.quaternion.clone());
    const q = new THREE.Quaternion();
    model.position.y = seatedRootY;
    lThigh.quaternion.copy(save[0]).premultiply(q.setFromAxisAngle(ls.lThighAxis, ls.hipRad));
    rThigh.quaternion.copy(save[1]).premultiply(q.setFromAxisAngle(ls.rThighAxis, ls.hipRad));
    lCalf.quaternion.copy(save[2]).premultiply(q.setFromAxisAngle(ls.lCalfAxis, ls.kneeRad));
    rCalf.quaternion.copy(save[3]).premultiply(q.setFromAxisAngle(ls.rCalfAxis, ls.kneeRad));
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    const drop = this._lowestInPelvisColumn(model, pelvis);
    const pelvisY = pelvis.getWorldPosition(new THREE.Vector3()).y;
    model.position.y = saveY;
    [lThigh, rThigh, lCalf, rCalf].forEach((b, i) => b.quaternion.copy(save[i]));
    model.updateWorldMatrix(true, false);
    model.updateMatrixWorld(true);
    return drop == null ? null : pelvisY - drop;
  }

  _measureLapTop(model) {
    const p = this._measureBodyProfile(model);
    if (!p || p.lapRadius == null || p.thighLen == null) {
      console.warn('[courtsim] lap_measure_TOO_FEW_VERTS',
        p ? 'lapRadius=' + p.lapRadius + ' thighLen=' + p.thighLen : 'no profile',
        '-- no lap height can be measured off this mesh, so no lap is posed.');
      return null;
    }
    const radius = p.lapRadius;
    if (!(radius > 0.03) || radius > 0.30) {
      console.warn('[courtsim] lap_radius_OUT_OF_BAND', radius,
        '-- the twelve shipped avatars measure 0.0797-0.1532.',
        'Refusing to pose a lap off a number this far out.');
      return null;
    }
    console.log('[courtsim] lap_measured thigh_radius_m=', radius.toFixed(4),
      '(cast band 0.0797-0.1532, mean 0.1163)',
      'thigh_len_m=', p.thighLen.toFixed(4), '(cast values 0.3990 / 0.4261)');
    return { radius, thighLen: p.thighLen };
  }

  _registerIdleAnimation(model, defaultStance = 'sit', seatDef = null) {
    const spineBone = model.getObjectByName('Bip01_Spine1') || model.getObjectByName('Bip01 Spine1')
      || model.getObjectByName('Bip01_Spine') || model.getObjectByName('Bip01 Spine');
    const headBone = model.getObjectByName('Bip01_Head') || model.getObjectByName('Bip01 Head');
    if (!spineBone && !headBone) {
      const boneNames = [];
      model.traverse((n) => { if (n.isBone && boneNames.length < 40) boneNames.push(n.name); });
      console.error('[courtsim] RIG_NOT_RECOGNISED: no Bip01 Spine/Head bone found on this model.',
        'This avatar will stay in its raw T-pose with no stance, arms, breathing or blinking.',
        'first_bones=', boneNames);
      this._rigFailures = (this._rigFailures || 0) + 1;
      return;
    }

    const blinkTargets = [];
    model.traverse((n) => {
      if (!n.isMesh || !n.morphTargetDictionary) return;
      let l = -1, r = -1;
      for (const [name, idx] of Object.entries(n.morphTargetDictionary)) {
        const lower = name.toLowerCase();
        if (lower.endsWith('eyeblinkleft')) l = idx;
        if (lower.endsWith('eyeblinkright')) r = idx;
      }
      if (l >= 0 || r >= 0) blinkTargets.push({ mesh: n, l, r });
    });

    const lThigh = model.getObjectByName('Bip01 L Thigh') || model.getObjectByName('Bip01_L_Thigh');
    const rThigh = model.getObjectByName('Bip01 R Thigh') || model.getObjectByName('Bip01_R_Thigh');
    const lCalf = model.getObjectByName('Bip01 L Calf') || model.getObjectByName('Bip01_L_Calf');
    const rCalf = model.getObjectByName('Bip01 R Calf') || model.getObjectByName('Bip01_R_Calf');
    const lFoot = model.getObjectByName('Bip01 L Foot') || model.getObjectByName('Bip01_L_Foot');
    const rFoot = model.getObjectByName('Bip01 R Foot') || model.getObjectByName('Bip01_R_Foot');
    const lToe = model.getObjectByName('Bip01 L Toe0') || model.getObjectByName('Bip01_L_Toe0');

    const findBone = (...names) => {
      for (const n of names) {
        const b = model.getObjectByName(n);
        if (b) return b;
      }
      return null;
    };
    const arms = [
      {
        side: 'L', sign: 1,
        clavicle: findBone('Bip01_L_Clavicle', 'Bip01 L Clavicle'),
        upper: findBone('Bip01_L_UpperArm', 'Bip01 L UpperArm'),
        fore: findBone('Bip01_L_Forearm', 'Bip01 L Forearm'),
        hand: findBone('Bip01_L_Hand', 'Bip01 L Hand'),
      },
      {
        side: 'R', sign: -1,
        clavicle: findBone('Bip01_R_Clavicle', 'Bip01 R Clavicle'),
        upper: findBone('Bip01_R_UpperArm', 'Bip01 R UpperArm'),
        fore: findBone('Bip01_R_Forearm', 'Bip01 R Forearm'),
        hand: findBone('Bip01_R_Hand', 'Bip01 R Hand'),
      },
    ];
    const seed = _seatSeed((seatDef && seatDef.role) || (seatDef && seatDef.label) || 'seat');
    const rngHolder = { rngState: seed || 1 };
    const armVary = {
      L: { out: _jit(rngHolder, 3.0), bend: 2.5 + _jit(rngHolder, 3.5) },
      R: { out: _jit(rngHolder, 3.0), bend: 2.5 + _jit(rngHolder, 3.5) },
    };
    const bodyProfile = this._measureBodyProfile(model);
    const ARM_OUT_BASE_DEG = 7;
    const ARM_OUT_JITTER_DEG = 3.0;
    const armOutMin = { L: null, R: null };
    for (const sd of ['L', 'R']) {
      const m = bodyProfile && bodyProfile.armOutMinDeg ? bodyProfile.armOutMinDeg[sd] : null;
      if (m == null) {
        armOutMin[sd] = ARM_OUT_BASE_DEG;
        console.warn('[courtsim] arm_splay_UNMEASURED role=', seatDef && seatDef.role, 'side=', sd,
          '-- falling back to the old shipped', ARM_OUT_BASE_DEG, 'deg constant.');
      } else {
        armOutMin[sd] = m;
      }
    }
    const ELBOW_BEND_DEG = 6;

    const worldPos = (bone) => new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
    const aimBoneAtChild = (bone, childBone, targetDir) => {
      if (!bone || !childBone || !bone.parent) return 0;
      model.updateWorldMatrix(true, true);
      const from = worldPos(bone);
      const to = worldPos(childBone);
      const cur = to.clone().sub(from);
      if (cur.lengthSq() < 1e-10) return 0;
      cur.normalize();
      const tgt = targetDir.clone().normalize();
      const ang = cur.angleTo(tgt);
      if (ang < 1e-4) return 0;
      if (ang > Math.PI - 1e-3) {
        console.warn('[courtsim] arm_aim_ANTIPARALLEL on', bone.name,
          '-- skipped: the rotation axis is undefined at 180 degrees.');
        return 0;
      }
      const worldDelta = new THREE.Quaternion().setFromUnitVectors(cur, tgt);
      const parentWorldQuat = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(parentWorldQuat);
      const composed = parentWorldQuat.clone().invert().multiply(worldDelta).multiply(parentWorldQuat);
      bone.quaternion.premultiply(composed);
      bone.updateMatrixWorld(true);
      return ang;
    };

    const handLongAxis = (hand) => {
      const kids = hand.children.filter((c) => c.isBone);
      if (kids.length < 3) return null;
      const wrist = worldPos(hand);
      const dirs = kids.map((c) => worldPos(c).sub(wrist));
      for (const d of dirs) { if (d.lengthSq() < 1e-12) return null; d.normalize(); }
      const mean = new THREE.Vector3();
      for (const d of dirs) mean.add(d);
      if (mean.lengthSq() < 1e-12) return null;
      mean.normalize();
      let worst = 0;
      for (let i = 1; i < dirs.length; i++) if (dirs[i].dot(mean) < dirs[worst].dot(mean)) worst = i;
      const keep = kids.filter((_, i) => i !== worst);
      const centre = new THREE.Vector3();
      for (const k of keep) centre.add(worldPos(k));
      centre.multiplyScalar(1 / keep.length);
      const dir = centre.sub(wrist);
      if (dir.lengthSq() < 1e-12) return null;
      return { dir: dir.normalize(), thumb: kids[worst].name, kept: keep.length };
    };
    const aimBoneAlong = (bone, curDir, targetDir) => {
      if (!bone || !bone.parent) return 0;
      const cur = curDir.clone().normalize();
      const tgt = targetDir.clone().normalize();
      const ang = cur.angleTo(tgt);
      if (ang < 1e-4) return 0;
      if (ang > Math.PI - 1e-3) {
        console.warn('[courtsim] hand_aim_ANTIPARALLEL on', bone.name,
          '-- skipped: the rotation axis is undefined at 180 degrees.');
        return 0;
      }
      const worldDelta = new THREE.Quaternion().setFromUnitVectors(cur, tgt);
      const pq = new THREE.Quaternion();
      bone.parent.getWorldQuaternion(pq);
      bone.quaternion.premultiply(pq.clone().invert().multiply(worldDelta).multiply(pq));
      bone.updateMatrixWorld(true);
      return ang;
    };

    let armsPosed = 0;
    const armReceipts = [];
    for (const a of arms) {
      if (!a.upper || !a.hand) {
        console.error('[courtsim] ARM_CHAIN_INCOMPLETE side=' + a.side,
          'upperArm=', !!a.upper, 'forearm=', !!a.fore, 'hand=', !!a.hand,
          'clavicle=', !!a.clavicle,
          '-- this arm keeps its raw bind pose. This is the silent failure recon D-07 describes.');
        continue;
      }
      model.updateWorldMatrix(true, true);
      const elbow = a.fore || a.hand;
      const chord = worldPos(a.hand).clone().sub(worldPos(a.upper)).normalize();
      const upperDir = worldPos(elbow).clone().sub(worldPos(a.upper)).normalize();
      const foreDir = a.fore ? worldPos(a.hand).clone().sub(worldPos(a.fore)).normalize() : upperDir;
      const down = new THREE.Vector3(0, -1, 0);
      const chordOff = chord.angleTo(down);
      const elbowOff = upperDir.angleTo(foreDir);
      if (chordOff < THREE.MathUtils.degToRad(2) && elbowOff < THREE.MathUtils.degToRad(2)) continue;

      model.updateWorldMatrix(true, false);
      const bodyQuat = model.getWorldQuaternion(new THREE.Quaternion());
      const vOut = Math.max(ARM_OUT_BASE_DEG, armOutMin[a.side])
        + ARM_OUT_JITTER_DEG + armVary[a.side].out;
      const vBend = ELBOW_BEND_DEG + armVary[a.side].bend;
      const target = new THREE.Vector3(
        a.sign * Math.sin(THREE.MathUtils.degToRad(vOut)), -Math.cos(THREE.MathUtils.degToRad(vOut)), 0,
      ).normalize().applyQuaternion(bodyQuat).normalize();
      const bodyX = new THREE.Vector3(1, 0, 0).applyQuaternion(bodyQuat).normalize();

      if (a.fore) aimBoneAtChild(a.fore, a.hand, upperDir);  // 1. straighten
      aimBoneAtChild(a.upper, elbow, target);                // 2. aim
      if (a.fore) {
        const bent = target.clone().applyAxisAngle(bodyX,
          THREE.MathUtils.degToRad(-vBend));
        aimBoneAtChild(a.fore, a.hand, bent);
        model.updateWorldMatrix(true, true);
        const la = handLongAxis(a.hand);
        if (la) {
          const HAND_RELAX_DEG = 8;
          const handTarget = bent.clone().applyAxisAngle(bodyX,
            THREE.MathUtils.degToRad(-HAND_RELAX_DEG));
          const beforeDeg = THREE.MathUtils.radToDeg(la.dir.angleTo(bent));
          aimBoneAlong(a.hand, la.dir, handTarget);
          model.updateWorldMatrix(true, true);
          const la2 = handLongAxis(a.hand);
          const afterDeg = la2
            ? THREE.MathUtils.radToDeg(la2.dir.angleTo(bent)) : null;
          console.log('[courtsim] hand_long_axis role=', (seatDef && seatDef.role) || 'juror',
            'side=', a.side, 'thumb_excluded=', la.thumb, 'fingers_used=', la.kept,
            'wrist_break_BEFORE_deg=', beforeDeg.toFixed(2),
            'wrist_break_AFTER_deg=', afterDeg == null ? 'n/a' : afterDeg.toFixed(2),
            'relax_deg=', HAND_RELAX_DEG,
            '-- COURTSIM-AESTHETIC-031: the standing hand now follows its own',
            'forearm. BEFORE was the thumb following it instead.');
        } else {
          const handChild = a.hand.children.find((c) => c.isBone) || a.hand.children[0];
          console.warn('[courtsim] hand_long_axis_UNMEASURABLE role=',
            (seatDef && seatDef.role) || 'juror', 'side=', a.side,
            'bone_children=', a.hand.children.filter((c) => c.isBone).length,
            '-- falling back to aiming the first child bone. If this rig numbers',
            'its thumb first, this wrist will break backwards; that is the',
            'COURTSIM-AESTHETIC-031 defect and it is reported here, not hidden.');
          if (handChild) aimBoneAtChild(a.hand, handChild, bent);
        }
      }
      armsPosed++;
      armReceipts.push({ side: a.side, posed: true, hand: a.hand, upper: a.upper });
    }
    const standArmPose = [];
    const standHandQ = { L: null, R: null };
    for (const a of arms) {
      for (const bone of [a.upper, a.fore, a.hand]) {
        if (bone) standArmPose.push({ bone, q: bone.quaternion.clone() });
      }
      if (a.hand) standHandQ[a.side] = a.hand.quaternion.clone();
    }
    {
      const STAND_ELBOW_DEG = 19;     // target flex; measured start is 5-11
      const STAND_ABDUCT_MIN_DEG = 4.0;
      const STAND_ABDUCT_MAX_DEG = 13.0;
      const STAND_ABDUCT_JITTER_DEG = 1.25;   // asymmetry, not posture
      const bq0 = model.getWorldQuaternion(new THREE.Quaternion());
      const fwd0 = new THREE.Vector3(0, 0, 1).applyQuaternion(bq0).normalize();
      const lat0 = new THREE.Vector3(1, 0, 0).applyQuaternion(bq0).normalize();
      model.updateWorldMatrix(true, true);
      for (const a of arms) {
        if (!a.upper || !a.fore || !a.hand) continue;
        const P = (b) => b.getWorldPosition(new THREE.Vector3());
        const sh = P(a.upper), el = P(a.fore), wr = P(a.hand);
        const u = el.clone().sub(sh), f = wr.clone().sub(el);
        if (u.lengthSq() < 1e-8 || f.lengthSq() < 1e-8) continue;
        u.normalize(); f.normalize();
        const flexNow = THREE.MathUtils.radToDeg(Math.acos(
          THREE.MathUtils.clamp(u.dot(f), -1, 1)));
        let axisW = new THREE.Vector3().crossVectors(u, f);
        let axisSrc = 'shoulder-elbow-wrist plane';
        if (axisW.lengthSq() < 0.0012) {          // sin(2 deg)^2
          axisW = lat0.clone().multiplyScalar(a.side === 'R' ? 1 : -1);
          axisSrc = 'FALLBACK body lateral';
          console.warn('[courtsim] stand_elbow_axis_FALLBACK role=',
            (seatDef && seatDef.role) || 'juror', 'side=', a.side,
            'flex_now_deg=', flexNow.toFixed(2),
            '-- this arm is too straight to read a flexion plane off, so the',
            'relax uses the body lateral axis. It may bend slightly off-plane.');
        }
        axisW.normalize();
        const add = THREE.MathUtils.degToRad(Math.max(0, STAND_ELBOW_DEG - flexNow));
        const toParent = (bone, w) => {
          const pq = bone.parent
            ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
            : new THREE.Quaternion();
          return w.clone().applyQuaternion(pq.invert()).normalize();
        };
        if (add > 1e-4) {
          const ax = toParent(a.fore, axisW);
          a.fore.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(ax, add));
        }
        const outward = lat0.clone().multiplyScalar(a.side === 'L' ? 1 : -1);
        const down0 = new THREE.Vector3(0, -1, 0);
        const uc = u.clone().addScaledVector(fwd0, -u.dot(fwd0));
        let abdNow = null;
        if (uc.lengthSq() > 1e-8) {
          uc.normalize();
          abdNow = THREE.MathUtils.radToDeg(Math.atan2(uc.dot(outward), uc.dot(down0)));
        }
        const floorDeg = (armOutMin && armOutMin[a.side] != null)
          ? armOutMin[a.side] : ARM_OUT_BASE_DEG;
        const abdTarget = THREE.MathUtils.clamp(
          floorDeg, STAND_ABDUCT_MIN_DEG, STAND_ABDUCT_MAX_DEG,
        ) + armVary[a.side].out * (STAND_ABDUCT_JITTER_DEG / 3.0);
        let abdApplied = 0;
        if (abdNow == null) {
          abdApplied = THREE.MathUtils.degToRad(4) * (a.side === 'R' ? -1 : 1);
          console.warn('[courtsim] stand_abduction_UNMEASURABLE role=',
            (seatDef && seatDef.role) || 'juror', 'side=', a.side,
            '-- the upper arm has no coronal component on this rig; falling back',
            'to COURTSIM-SURFACES-014\'s blind +4 deg for this arm only.');
        } else {
          abdApplied = THREE.MathUtils.degToRad(abdTarget - abdNow) * (a.side === 'L' ? 1 : -1);
        }
        const axU = toParent(a.upper, fwd0);
        a.upper.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(axU, abdApplied));
        model.updateWorldMatrix(true, true);
        const sh2 = P(a.upper), el2 = P(a.fore), wr2 = P(a.hand);
        const flexAfter = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(
          el2.clone().sub(sh2).normalize().dot(wr2.clone().sub(el2).normalize()), -1, 1)));
        let abdAfter = null;
        {
          const u2 = el2.clone().sub(sh2);
          if (u2.lengthSq() > 1e-8) {
            u2.normalize();
            const uc2 = u2.addScaledVector(fwd0, -u2.dot(fwd0));
            if (uc2.lengthSq() > 1e-8) {
              uc2.normalize();
              abdAfter = THREE.MathUtils.radToDeg(Math.atan2(uc2.dot(outward), uc2.dot(down0)));
            }
          }
        }
        console.log('[courtsim] stand_arm_relax role=', (seatDef && seatDef.role) || 'juror',
          'side=', a.side, 'elbow_flex_BEFORE_deg=', flexNow.toFixed(2),
          'elbow_flex_AFTER_deg=', flexAfter.toFixed(2),
          'target_deg=', STAND_ELBOW_DEG,
          '| COURTSIM-PROPS-033 abduction:',
          'measured_floor_deg=', floorDeg.toFixed(1),
          'abduct_target_deg=', abdTarget.toFixed(2),
          'abduct_BEFORE_deg=', abdNow == null ? 'n/a' : abdNow.toFixed(2),
          'abduct_AFTER_deg=', abdAfter == null ? 'n/a' : abdAfter.toFixed(2),
          'axis_src=', axisSrc,
          '-- STANDING pose only. The seated solve runs after this and',
          'overwrites these bones, so b = 1 is unchanged.');
        if (abdAfter != null && Math.abs(abdAfter - abdTarget) > 1.0) {
          console.warn('[courtsim] STAND_ABDUCTION_RESIDUAL role=',
            (seatDef && seatDef.role) || 'juror', 'side=', a.side,
            'wanted', abdTarget.toFixed(2), 'got', abdAfter.toFixed(2),
            '-- the shoulder did not land where it was sent. This arm may still',
            'read as held out, which is the COURTSIM-PROPS-033 defect.');
        }
      }
      let i = 0;
      for (const a of arms) {
        for (const bone of [a.upper, a.fore, a.hand]) {
          if (bone) { standArmPose[i].q.copy(bone.quaternion); i += 1; }
        }
        if (a.hand) standHandQ[a.side] = a.hand.quaternion.clone();
      }
    }
    model.updateWorldMatrix(true, true);
    const bodyQuatInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const a of arms) {
      const r = armReceipts.find((x) => x.side === a.side);
      const hw = a.hand ? a.hand.getWorldPosition(new THREE.Vector3()) : null;
      const local = hw
        ? hw.clone().sub(model.getWorldPosition(new THREE.Vector3())).applyQuaternion(bodyQuatInv)
        : null;
      console.log('[courtsim] arm_receipt role=', seatDef && seatDef.role, 'side=', a.side,
        'chain_applied=', !!r,
        'upperArm_resolved=', !!a.upper, 'forearm_resolved=', !!a.fore,
        'hand_resolved=', !!a.hand,
        'hand_world=', hw ? hw.toArray().map((v) => v.toFixed(3)).join(',') : 'n/a',
        'hand_lateral_from_spine_m=', local ? Math.abs(local.x).toFixed(3) : 'n/a',
        '(torso half-width at hip is 0.174-0.194 m; below that = inside the body)');
    }

    console.log('[courtsim] arm_chain_posed arms=', armsPosed,
      'clavicles_found=', arms.filter((a) => !!a.clavicle).length,
      'forearms_found=', arms.filter((a) => !!a.fore).length,
      'armOut_L_deg=', (Math.max(ARM_OUT_BASE_DEG, armOutMin.L) + ARM_OUT_JITTER_DEG + armVary.L.out).toFixed(2),
      'armOut_R_deg=', (Math.max(ARM_OUT_BASE_DEG, armOutMin.R) + ARM_OUT_JITTER_DEG + armVary.R.out).toFixed(2),
      'armOut_measured_floor_L/R_deg=', armOutMin.L.toFixed(1) + '/' + armOutMin.R.toFixed(1),
      'armOut_floor_applied_L/R_deg=', Math.max(ARM_OUT_BASE_DEG, armOutMin.L).toFixed(1) + '/' + Math.max(ARM_OUT_BASE_DEG, armOutMin.R).toFixed(1),
      '(OLD: a shared hardcoded 7 for every rig and both sides)',
      'elbow_L_deg=', (ELBOW_BEND_DEG + armVary.L.bend).toFixed(2),
      'elbow_R_deg=', (ELBOW_BEND_DEG + armVary.R.bend).toFixed(2),
      'seed=', seed);

    const handRigs = {
      L: this._measureHandRig(model, 'L'),
      R: this._measureHandRig(model, 'R'),
    };
    for (const sd of ['L', 'R']) {
      const rg = handRigs[sd];
      console.log('[courtsim] hand_rig role=', seatDef && seatDef.role, 'side=', sd,
        'resolved=', !!rg,
        'finger_chains=', rg ? rg.chains.length : 0,
        'posable_bones=', rg ? rg.chains.reduce((n, c) => n + c.bones.length, 0) : 0,
        'flex_sign_about_knuckle_line=', rg ? rg.flexSign : 'n/a',
        'bind_curl_deg=', rg ? rg.bindBendDeg.toFixed(2) : 'n/a',
        'thumb_dot_curlDir=', rg ? rg.thumbDot.toFixed(3) : 'n/a',
        '(flex sign is read off this rig\'s OWN authored bind curl; the thumb dot is the independent cross-check)');
    }

    const pelvisBone = model.getObjectByName('Bip01_Pelvis') || model.getObjectByName('Bip01 Pelvis')
      || model.getObjectByName('Bip01_Spine') || model.getObjectByName('Bip01 Spine');
    let pelvisRise = 1.045;   // fallback = the smaller of the two measured rigs
    if (pelvisBone) {
      model.updateWorldMatrix(true, true);
      pelvisRise = pelvisBone.getWorldPosition(new THREE.Vector3()).y - model.position.y;
      if (!(pelvisRise > 0.4 && pelvisRise < 1.6)) {
        console.error('[courtsim] PELVIS_RISE_IMPLAUSIBLE read=', pelvisRise,
          '-- falling back to 1.045. This seat may sit wrong; the rig root is not where it should be.');
        pelvisRise = 1.045;
      }
    } else {
      console.warn('[courtsim] pelvis bone not found -- seated height falls back to 1.045 m');
    }
    const baseStandY = seatDef && seatDef.pos ? seatDef.pos[1] : model.position.y;
    const standY = this._supportYUnder(
      seatDef && seatDef.pos ? seatDef.pos[0] : model.position.x,
      seatDef && seatDef.pos ? seatDef.pos[2] : model.position.z,
      baseStandY);
    const nominalSeatY = seatDef && seatDef.seatY != null ? seatDef.seatY : standY + CHAIR_SEAT_H;
    const seatSurfaceY = defaultStance === 'sit'
      ? this._seatTopUnder(
        seatDef && seatDef.pos ? seatDef.pos[0] : model.position.x,
        seatDef && seatDef.pos ? seatDef.pos[2] : model.position.z,
        nominalSeatY)
      : nominalSeatY;
    let seatPelvisLift = SEAT_PELVIS_LIFT;
    let seatLiftSrc = 'ASSUMED';
    if (defaultStance === 'sit') {
      const drop = this._measureSeatedPelvisDrop(
        model, seatDef && seatDef.role, seatSurfaceY, standY, pelvisRise);
      if (drop == null) {
        seatLiftSrc = 'UNMEASURABLE';
      } else if (!(drop >= SEAT_LIFT_MIN && drop <= SEAT_LIFT_MAX)) {
        seatLiftSrc = 'OUT_OF_BAND';
        console.warn('[courtsim] seat_lift_OUT_OF_BAND role=', seatDef && seatDef.role,
          'measured_drop_m=', drop.toFixed(4), 'band=', SEAT_LIFT_MIN, '..', SEAT_LIFT_MAX,
          '-- keeping the', SEAT_PELVIS_LIFT, 'assumption. This figure will still sit',
          'inside its seat by roughly', ((drop - SEAT_PELVIS_LIFT) * 1000).toFixed(0), 'mm.',
          'A drop this far out is a MESH property, not a seat property: something',
          'weighted to the pelvis hangs below the buttock.');
      } else {
        seatPelvisLift = drop;
        seatLiftSrc = 'MEASURED';
      }
    }
    const standStep = 0;
    console.log('[courtsim] seat_solve role=', seatDef && seatDef.role,
      'pelvisRise=', pelvisRise.toFixed(4), 'standY=', standY, 'seatSurfaceY=', seatSurfaceY,
      'stand_clear_step_m=', standStep.toFixed(4),
      'nominal_floor_y=', baseStandY,
      'ground_lift_m=', (standY - baseStandY).toFixed(4),
      'ground_surface=', this._lastSupportName || 'nominal',
      'seat_surface=', this._lastSeatSurfaceName || 'nominal',
      'seat_pelvis_lift_m=', seatPelvisLift.toFixed(4), 'lift_src=', seatLiftSrc,
      'lift_was_assumed_m=', SEAT_PELVIS_LIFT,
      'seat_penetration_BEFORE_mm=',
      (defaultStance === 'sit' ? ((seatPelvisLift - SEAT_PELVIS_LIFT) * 1000).toFixed(1) : 'n/a'),
      'seatedRootY=', (seatSurfaceY + seatPelvisLift - pelvisRise).toFixed(4),
      '-- COURTSIM-SURFACES-014: ground_lift_m > 0 means this figure stands on',
      'something lying on the floor (the carpet) and the feet now resolve to IT.');

    if (seatDef && seatDef.role === 'judge') {
      const up = findBone('Bip01_R_UpperArm', 'Bip01 R UpperArm');
      const fo = findBone('Bip01_R_Forearm', 'Bip01 R Forearm');
      const ha = findBone('Bip01_R_Hand', 'Bip01 R Hand');
      if (!up || !fo || !ha) {
        console.error('[courtsim] GAVEL_HAND_POSE_SKIPPED: the judge rig is missing',
          'upperArm=', !!up, 'forearm=', !!fo, 'hand=', !!ha,
          '-- his arm stays at his side and the gavel will not be visible above the bench.');
      } else {
        model.updateWorldMatrix(true, true);
        const S = worldPos(up);
        const L1 = worldPos(up).distanceTo(worldPos(fo));
        const L2 = worldPos(fo).distanceTo(worldPos(ha));
        const seatedRootY = seatSurfaceY + seatPelvisLift - pelvisRise;
        const yBias = model.position.y - seatedRootY;   // +0.385 for the judge
        model.userData.courtsimSeatYBias = yBias;
        const T = new THREE.Vector3(
          seatDef.pos[0] - 0.30,
          BENCH_DESK_TOP_Y + GAVEL_WRIST_ABOVE_WORKTOP + yBias,
          seatDef.pos[2] + 0.45,
        );
        const toT = T.clone().sub(S);
        let d = toT.length();
        const dMax = (L1 + L2) * 0.995;   // never fully locked out -- a dead-straight arm reads as a mannequin
        const dMin = Math.abs(L1 - L2) + 1e-3;
        let reach = 'exact';
        if (d > dMax) { d = dMax; reach = 'CLAMPED_FAR'; }
        else if (d < dMin) { d = dMin; reach = 'CLAMPED_NEAR'; }
        if (reach !== 'exact') {
          console.warn('[courtsim] gavel_hand_reach', reach, 'wanted_m=', toT.length().toFixed(4),
            'arm_span_m=', (L1 + L2).toFixed(4),
            '-- the bench target is out of the judge\'s reach; the hand lands short of it.');
        }
        const u = toT.clone().normalize();
        const bq = model.getWorldQuaternion(new THREE.Quaternion());
        const pole = new THREE.Vector3(-1, GAVEL_ELBOW_POLE_DOWN, 0)
          .normalize().applyQuaternion(bq).normalize();
        const perp = pole.clone().addScaledVector(u, -pole.dot(u));
        if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0).addScaledVector(u, u.y); // pole parallel to the reach -- fall back to plain down
        perp.normalize();
        const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
        const alpha = Math.acos(cosA);
        const elbowW = S.clone()
          .addScaledVector(u, L1 * Math.cos(alpha))
          .addScaledVector(perp, L1 * Math.sin(alpha));
        aimBoneAtChild(up, fo, elbowW.clone().sub(S));
        model.updateWorldMatrix(true, true);
        aimBoneAtChild(fo, ha, T.clone().sub(worldPos(fo)));
        model.updateWorldMatrix(true, true);
        const got = worldPos(ha);
        const seatedHand = got.clone().setY(got.y - yBias);
        console.log('[courtsim] gavel_hand_posed target_seated=',
          [T.x, T.y - yBias, T.z].map((n) => n.toFixed(3)).join(','),
          'hand_world_seated=', seatedHand.toArray().map((n) => n.toFixed(3)).join(','),
          'y_bias_removed=', yBias.toFixed(3),
          'residual_m=', got.distanceTo(T).toFixed(4),
          'upper_m=', L1.toFixed(4), 'fore_m=', L2.toFixed(4),
          'elbow_bend_deg=', THREE.MathUtils.radToDeg(
            Math.acos(THREE.MathUtils.clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1))).toFixed(1),
          'reach=', reach,
          'bench_worktop_top_y=', BENCH_DESK_TOP_Y);
        if (got.distanceTo(T) > 0.06) {
          console.error('[courtsim] GAVEL_HAND_RESIDUAL_HIGH', got.distanceTo(T).toFixed(4),
            'm from the bench target -- the gavel may not read as resting on the worktop.');
        }

        const rigR = handRigs.R;
        if (!rigR) {
          console.warn('[courtsim] gavel_grip_SKIPPED -- no finger bones resolved on the judge\'s',
            'right hand, so the grip cannot be solved and the hand keeps its open bind palm.');
        } else {
          const fwdB = new THREE.Vector3(0, 0, 1).applyQuaternion(bq).normalize();
          const upB = new THREE.Vector3(0, 1, 0);
          const leftB = new THREE.Vector3(1, 0, 0).applyQuaternion(bq).normalize(); // +X is character LEFT on this rig
          const GAVEL_HANDLE_PITCH_DEG = 0;
          const GAVEL_WRIST_ROLL_DEG = 180;
          const hp = THREE.MathUtils.degToRad(GAVEL_HANDLE_PITCH_DEG);
          const handleTarget = fwdB.clone().multiplyScalar(Math.cos(hp))
            .addScaledVector(upB, -Math.sin(hp)).normalize();
          const acrossTarget = handleTarget.clone().multiplyScalar(-1);
          const longTarget = leftB.clone();
          longTarget.addScaledVector(handleTarget, -longTarget.dot(handleTarget));
          if (longTarget.lengthSq() < 1e-8) longTarget.copy(upB).addScaledVector(handleTarget, -upB.dot(handleTarget));
          longTarget.normalize().applyQuaternion(new THREE.Quaternion()
            .setFromAxisAngle(handleTarget, THREE.MathUtils.degToRad(GAVEL_WRIST_ROLL_DEG))).normalize();
          model.userData.courtsimGavelAim = {
            handle: handleTarget.clone(), across: acrossTarget.clone(), long: longTarget.clone(),
            pitchDeg: GAVEL_HANDLE_PITCH_DEG, rollDeg: GAVEL_WRIST_ROLL_DEG,
          };
          const residDeg = this._orientHand(rigR, longTarget, acrossTarget);
          const gripPosed = this._applyHandPose(rigR, GAVEL_GRIP_POSE, rngHolder, 2);
          model.updateWorldMatrix(true, true);
          model.userData.courtsimGavelRig = rigR;
          model.userData.courtsimGavelArm = { up, fo, ha, pole };
          const wp2 = (o) => o.getWorldPosition(new THREE.Vector3());
          const iK = rigR.chains.find((c) => c.f === 1).bones[0];
          const pK = rigR.chains.find((c) => c.f === 4).bones[0];
          const handleAxisW = wp2(pK).sub(wp2(iK)).normalize();
          const longNowW = wp2(iK).add(wp2(pK)).multiplyScalar(0.5).sub(wp2(ha)).normalize();
          console.log('[courtsim] gavel_grip_solved',
            'wrist_aim_residual_deg=', Number.isNaN(residDeg) ? 'n/a' : residDeg.toFixed(2),
            'handle_axis_dot_world_up=', handleAxisW.dot(upB).toFixed(3),
            '(0.000 = handle lies flat, as a gavel in a resting hand does)',
            'angle_hand_long_to_handle_deg=', THREE.MathUtils.radToDeg(
              Math.acos(THREE.MathUtils.clamp(Math.abs(longNowW.dot(handleAxisW)), 0, 1))).toFixed(1),
            '(90.0 = handle crosses the palm; the OLD build was 0.0, i.e. the handle ran out of the fingertips)',
            'hand_long_pitch_below_horizontal_deg=', THREE.MathUtils.radToDeg(
              Math.asin(THREE.MathUtils.clamp(-longNowW.dot(upB), -1, 1))).toFixed(1),
            'commanded_handle_pitch_deg=', GAVEL_HANDLE_PITCH_DEG,
            'commanded_wrist_roll_deg=', GAVEL_WRIST_ROLL_DEG,
            'forearm_to_handle_deg=', (() => {
              const fw = wp2(ha).sub(wp2(fo)).normalize();
              return THREE.MathUtils.radToDeg(Math.acos(
                THREE.MathUtils.clamp(Math.abs(fw.dot(handleAxisW)), 0, 1))).toFixed(1);
            })(),
            'finger_bones_curled=', gripPosed);
          if (!Number.isNaN(residDeg) && residDeg > 2) {
            console.warn('[courtsim] gavel_grip_WRIST_RESIDUAL', residDeg.toFixed(2),
              'deg -- the hand did not reach the commanded orientation.');
          }
        }
      }
    }

    const isDepo = this.venue && this.venue.type === 'deposition';
    const isSpectator = !!(seatDef && seatDef.spectator);
    const roleNow = (seatDef && !isSpectator) ? seatDef.role : null;
    let restSurface = null;
    if (isDepo && !isSpectator) {
      restSurface = { y: 0.75, x0: -2.23, x1: 2.23, z0: -0.93, z1: 0.93, what: 'ConferenceTableTop' };
    } else if (roleNow === 'counsel_a') {
      restSurface = { y: 0.75, x0: -COUNSEL_TOP_X1, x1: -COUNSEL_TOP_X0, z0: COUNSEL_TOP_Z0, z1: COUNSEL_TOP_Z1, what: 'CounselTableATop' };
    } else if (roleNow === 'counsel_b') {
      restSurface = { y: 0.75, x0: COUNSEL_TOP_X0, x1: COUNSEL_TOP_X1, z0: COUNSEL_TOP_Z0, z1: COUNSEL_TOP_Z1, what: 'CounselTableBTop' };
    } else if (roleNow === 'clerk') {
      restSurface = { y: CLERK_DESK_TOP_Y, x0: CLERK_TOP_X0, x1: CLERK_TOP_X1,
        z0: CLERK_TOP_Z0, z1: CLERK_TOP_Z1, what: 'ClerkDeskTop' };
    } else if (roleNow === 'judge') {
      restSurface = { y: BENCH_DESK_TOP_Y, x0: -1.36, x1: 1.36, z0: -3.35, z1: -2.59, what: 'BenchWorktop' };
    }
    const surfaceSides = (restSurface ? (roleNow === 'judge' ? ['L'] : ['L', 'R']) : [])
      .filter((sd) => !(((COUNSEL_HAND_PROPS[roleNow] || {})[sd] || {}).armrest));
    const WRIST_LIFT = REST_WRIST_LIFT;
    const REACH_FRAC = 0.88;       // never a locked-out arm; 0.88 leaves a visible elbow bend
    const handOnSurface = { L: false, R: false };
    const surfaceSolve = { L: null, R: null };
    const contactPins = [];
    for (const sd of surfaceSides) {
      const rg = handRigs[sd];
      const up2 = findBone('Bip01_' + sd + '_UpperArm', 'Bip01 ' + sd + ' UpperArm');
      const fo2 = findBone('Bip01_' + sd + '_Forearm', 'Bip01 ' + sd + ' Forearm');
      const ha2 = findBone('Bip01_' + sd + '_Hand', 'Bip01 ' + sd + ' Hand');
      if (!up2 || !fo2 || !ha2) continue;
      model.updateWorldMatrix(true, true);
      const S2 = worldPos(up2);
      const A1 = worldPos(up2).distanceTo(worldPos(fo2));
      const A2 = worldPos(fo2).distanceTo(worldPos(ha2));
      const span = A1 + A2;
      const seatedRootY2 = seatSurfaceY + seatPelvisLift - pelvisRise;
      const yBias2 = model.position.y - seatedRootY2;
      const tgtY = restSurface.y + WRIST_LIFT + yBias2;
      const dyv = S2.y - tgtY;
      const budget = span * REACH_FRAC;
      const horiz2 = Math.sqrt(Math.max(0, budget * budget - dyv * dyv));
      const bq2 = model.getWorldQuaternion(new THREE.Quaternion());
      const fwd2 = new THREE.Vector3(0, 0, 1).applyQuaternion(bq2).normalize();
      const left2 = new THREE.Vector3(1, 0, 0).applyQuaternion(bq2).normalize();
      const lat = _jit(rngHolder, 0.045);
      const T2 = S2.clone().addScaledVector(fwd2, horiz2).addScaledVector(left2, lat).setY(tgtY);
      const atProp = ((COUNSEL_HAND_PROPS[roleNow] || {})[sd] || {});
      const atSpec = (atProp.onSurface && atProp.onSurface !== restSurface.what)
        ? null : atProp.at;
      let atOverride = false;
      if (atSpec) {
        const want = new THREE.Vector3(atSpec.x, atSpec.y + WRIST_LIFT + yBias2, atSpec.z);
        const reach = want.distanceTo(S2);
        if (reach <= span * 0.985) {
          T2.copy(want);
          atOverride = true;
        } else {
          console.warn('[courtsim] hand_at_OUT_OF_REACH role=', roleNow, 'side=', sd,
            'wanted=', [atSpec.x, atSpec.y, atSpec.z].join(','),
            'reach_m=', reach.toFixed(4), 'arm_span_m=', span.toFixed(4),
            '-- the named object is further than this arm is long, so the hand',
            'keeps the ordinary tabletop solve. Reported rather than stretched.');
        }
      }
      const seatedX = T2.x, seatedZ = T2.z;   // yBias is a Y-only correction
      const onIt = horiz2 > 0.02
        && seatedX >= restSurface.x0 && seatedX <= restSurface.x1
        && seatedZ >= restSurface.z0 && seatedZ <= restSurface.z1;
      if (!onIt) {
        console.log('[courtsim] rest_hand_NOT_ON_SURFACE role=', roleNow, 'side=', sd,
          'surface=', restSurface.what, 'surface_y=', restSurface.y,
          'shoulder_y_seated=', (S2.y - yBias2).toFixed(3),
          'arm_span_m=', span.toFixed(4), 'horiz_reach_m=', horiz2.toFixed(4),
          'solved_xz=', seatedX.toFixed(3) + ',' + seatedZ.toFixed(3),
          'surface_xz_extent=', [restSurface.x0, restSurface.x1, restSurface.z0, restSurface.z1].join(','),
          '-- OUT OF REACH or off the footprint. The arm keeps the pose the',
          'signed-off arm chain gave it; nothing is forced.');
        continue;
      }
      const toT2 = T2.clone().sub(S2);
      let d2 = toT2.length();
      const dMax2 = span * 0.995;
      const dMin2 = Math.abs(A1 - A2) + 1e-3;
      if (d2 > dMax2) d2 = dMax2; else if (d2 < dMin2) d2 = dMin2;
      const u2 = toT2.clone().normalize();
      const poleV = new THREE.Vector3(sd === 'L' ? 1 : -1, -1.2, 0).normalize().applyQuaternion(bq2).normalize();
      const perp2 = poleV.clone().addScaledVector(u2, -poleV.dot(u2));
      if (perp2.lengthSq() < 1e-8) perp2.set(0, -1, 0).addScaledVector(u2, u2.y);
      perp2.normalize();
      const cosA2 = THREE.MathUtils.clamp((A1 * A1 + d2 * d2 - A2 * A2) / (2 * A1 * d2), -1, 1);
      const al2 = Math.acos(cosA2);
      const elbow2 = S2.clone()
        .addScaledVector(u2, A1 * Math.cos(al2))
        .addScaledVector(perp2, A1 * Math.sin(al2));
      aimBoneAtChild(up2, fo2, elbow2.clone().sub(S2));
      model.updateWorldMatrix(true, true);
      aimBoneAtChild(fo2, ha2, T2.clone().sub(worldPos(fo2)));
      model.updateWorldMatrix(true, true);
      let wristResid = NaN;
      if (rg) {
        const PALM_PITCH_DEG = 20;
        const lt = fwd2.clone().multiplyScalar(Math.cos(THREE.MathUtils.degToRad(PALM_PITCH_DEG)))
          .addScaledVector(_AXIS_Y, -Math.sin(THREE.MathUtils.degToRad(PALM_PITCH_DEG))).normalize();
        const at = left2.clone().multiplyScalar(sd === 'L' ? 1 : -1);
        const penSpec = (COUNSEL_HAND_PROPS[roleNow] || {})[sd];
        let atUse = at;
        let penRollDeg = 0;
        if (penSpec && penSpec.heldPen) {
          penRollDeg = 58;      // POSED: the ulnar-side rest in the reference plates
          const rr = THREE.MathUtils.degToRad(penRollDeg);
          const a1 = at.clone().applyAxisAngle(lt, rr);
          const a2 = at.clone().applyAxisAngle(lt, -rr);
          atUse = (a1.y < a2.y) ? a1 : a2;
          if (a1.y === a2.y) {
            console.warn('[courtsim] pen_roll_SIGN_UNDECIDED role=', roleNow, 'side=', sd,
              '-- both rolls put the pinky at the same height, so the palm may',
              'turn the wrong way. The pen will read as held in a flat hand.');
          }
        }
        wristResid = this._orientHand(rg, lt, atUse);
        model.updateWorldMatrix(true, true);
        if (penRollDeg) {
          console.log('[courtsim] pen_hand_ROLLED role=', roleNow, 'side=', sd,
            'roll_deg=', penRollDeg, 'roll_sign=', atUse.y < at.y ? 'pinky down' : 'n/a',
            '-- COURTSIM-PROPS-033: the palm turns in so the barrel can lie',
            'ACROSS the hand instead of down between the fingers.');
        }
      }
      handOnSurface[sd] = true;
      surfaceSolve[sd] = {
        up2, fo2, ha2, rg, S2, T2, A1, A2, span, fwd2, left2, poleV, yBias2,
        surfaceY: atOverride ? atSpec.y : restSurface.y,
        what: (atOverride || (atProp.on && !atProp.onSurface))
          ? (atProp.on || 'named object')
          : restSurface.what,
      };
      const gotH = worldPos(ha2);
      console.log('[courtsim] rest_hand_ON_SURFACE role=', roleNow, 'side=', sd,
        'surface=', restSurface.what, 'surface_top_y=', restSurface.y,
        'hand_world_seated=', [gotH.x, gotH.y - yBias2, gotH.z].map((n) => n.toFixed(3)).join(','),
        'wrist_above_surface_m=', (gotH.y - yBias2 - restSurface.y).toFixed(3),
        'residual_to_target_m=', gotH.distanceTo(T2).toFixed(4),
        'elbow_bend_deg=', THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(
          (A1 * A1 + A2 * A2 - d2 * d2) / (2 * A1 * A2), -1, 1))).toFixed(1),
        'wrist_aim_residual_deg=', Number.isNaN(wristResid) ? 'n/a' : wristResid.toFixed(2),
        'margin_to_near_edge_m=', Math.min(
          Math.abs(seatedZ - restSurface.z0), Math.abs(seatedZ - restSurface.z1)).toFixed(3));
    }

    const lapSides = [];
    if (defaultStance === 'sit') {
      for (const sd of ['L', 'R']) {
        if (handOnSurface[sd]) continue;                  // already on a desk
        if (roleNow === 'judge' && sd === 'R') continue;  // that hand holds the gavel
        lapSides.push(sd);
      }
    }
    const hasArms = !!(seatDef && seatDef.chairArms);
    const lap = lapSides.length ? this._measureLapTop(model) : null;
    const isSpectatorRest = isSpectator;
    const LAP_FWD_FRAC = isSpectatorRest ? 0.30 : 0.50;   // POSED: on the lap, not over the knees
    const LAP_PITCH_DEG = 20;      // POSED: the surface pass's own palm pitch
    const LAP_ROLL_DEG = isSpectatorRest ? 42 : 0;        // POSED: palms roll inboard when resting on a thigh
    let ARM_FWD = 0.26;            // POSED: wrist over the FRONT of the arm cap (was 0.10)
    if (restSurface && seatDef && seatDef.pos && hasArms) {
      const fwdA = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())).setY(0);
      if (fwdA.lengthSq() > 1e-8) {
        fwdA.normalize();
        const seatP = new THREE.Vector3(seatDef.pos[0], 0, seatDef.pos[2]);
        let near = Infinity;
        for (const zz of [restSurface.z0, restSurface.z1]) {
          for (const xx of [restSurface.x0, restSurface.x1]) {
            const d = new THREE.Vector3(xx, 0, zz).sub(seatP).dot(fwdA);
            if (d > 0 && d < near) near = d;
          }
        }
        const HAND_LEN = 0.10;     // wrist to fingertip, this cast
        if (Number.isFinite(near)) {
          const cap = Math.max(0.08, near - HAND_LEN);
          if (cap < ARM_FWD) {
            console.log('[courtsim] armrest_fwd_CAPPED role=', roleNow,
              'from=', ARM_FWD, 'to=', cap.toFixed(3),
              'surface_near_edge_m=', near.toFixed(3), 'surface=', restSurface.what,
              '-- COURTSIM-PROPS-033: this chair is pulled up to a desk, so the',
              'hand stops behind its edge instead of reaching under it.');
            ARM_FWD = cap;
          }
        }
      }
    }
    const ELBOW_POLE_LAT = 0.35;   // POSED: how far out the elbow is driven (was 1.0)
    const ELBOW_MIN_FLEX_DEG = 4;    // never locked out straight, never backward
    const ELBOW_MAX_FLEX_DEG = 145;  // past this the forearm folds onto the biceps
    const armrestRest = {};
    const postureMode = { L: null, R: null };
    for (const sd of lapSides) {
      if (!lap) break;
      const rg = handRigs[sd];
      const up3 = findBone('Bip01_' + sd + '_UpperArm', 'Bip01 ' + sd + ' UpperArm');
      const fo3 = findBone('Bip01_' + sd + '_Forearm', 'Bip01 ' + sd + ' Forearm');
      const ha3 = findBone('Bip01_' + sd + '_Hand', 'Bip01 ' + sd + ' Hand');
      const th3 = findBone('Bip01_' + sd + '_Thigh', 'Bip01 ' + sd + ' Thigh');
      if (!up3 || !fo3 || !ha3 || !th3) {
        console.warn('[courtsim] lap_hand_SKIPPED role=', roleNow || (seatDef && seatDef.role),
          'side=', sd, 'upper=', !!up3, 'fore=', !!fo3, 'hand=', !!ha3, 'thigh=', !!th3,
          '-- this arm keeps the hanging pose. No guess is made.');
        continue;
      }
      model.updateWorldMatrix(true, true);
      const S3 = worldPos(up3);
      const B1 = worldPos(up3).distanceTo(worldPos(fo3));
      const B2 = worldPos(fo3).distanceTo(worldPos(ha3));
      const span3 = B1 + B2;
      const seatedRootY3 = seatSurfaceY + seatPelvisLift - pelvisRise;
      const yBias3 = model.position.y - seatedRootY3;
      const hip3 = worldPos(th3);
      const bq3 = model.getWorldQuaternion(new THREE.Quaternion());
      const fwd3 = new THREE.Vector3(0, 0, 1).applyQuaternion(bq3).normalize();
      const left3 = new THREE.Vector3(1, 0, 0).applyQuaternion(bq3).normalize();
      const chairY = (seatDef ? seatDef.pos[1] : FLOOR_Y) + CHAIR_RISE;
      const restTopY = hasArms
        ? chairY + CHAIR_ARM_TOP
        : seatSurfaceY + seatPelvisLift + lap.radius;
      const lapTopY = restTopY;   // logged under this name either way
      const restMode = SEATED_REST_MODES[
        _seatSeed(String(roleNow || (seatDef && seatDef.role)) + sd
          + (hasArms ? 'A' : 'L')) % SEATED_REST_MODES.length];
      const modeFwd = hasArms ? restMode.armFwd : restMode.lapFwd;
      const modeLat = (sd === 'L' ? 1 : -1) * restMode.lat;
      const postureSeatKey = String(roleNow || (seatDef && seatDef.role) || 'seat');
      const posture = SEATED_POSTURES[
        _seatSeed(postureSeatKey + 'posture061') % SEATED_POSTURES.length];
      let handMode = posture[sd] || 'lap';
      if (SEATED_GALLERY_ONLY_MODES.includes(handMode) && !isSpectator) {
        handMode = (handMode === 'benchBack') ? 'knee' : 'lap';
      }
      if (hasArms && (handMode === 'lap'
        || SEATED_GALLERY_ONLY_MODES.includes(handMode))) handMode = 'arm';

      const upW = _AXIS_Y;
      const sdSign = (sd === 'L' ? 1 : -1);
      const mkArm = () => new THREE.Vector3(seatDef.pos[0], 0, seatDef.pos[2])
        .addScaledVector(left3, sdSign * CHAIR_ARM_DX)
        .addScaledVector(fwd3, ARM_FWD - CHAIR_ARM_DZ + modeFwd)
        .setY(restTopY + REST_WRIST_LIFT + yBias3);
      const mkLap = () => hip3.clone()
        .addScaledVector(fwd3, (LAP_FWD_FRAC + modeFwd) * lap.thighLen)
        .addScaledVector(left3, modeLat + _jit(rngHolder, 0.030))
        .setY(restTopY + REST_WRIST_LIFT + yBias3 + restMode.lift);
      const mkKnee = () => hip3.clone()
        .addScaledVector(fwd3, 0.88 * lap.thighLen)
        .addScaledVector(left3, sdSign * (lap.radius * 0.55) + _jit(rngHolder, 0.018))
        .setY(restTopY + REST_WRIST_LIFT + yBias3 - 0.012);
      const mkFold = () => S3.clone()
        .addScaledVector(upW, -(S3.y - yBias3 - restTopY) * 0.46)
        .addScaledVector(fwd3, 0.135)
        .addScaledVector(left3, -sdSign * 0.115);
      const mkChin = () => {
        const hb = findBone('Bip01_Head', 'Bip01 Head') || findBone('Bip01_Neck', 'Bip01 Neck');
        if (!hb) return null;
        return worldPos(hb).clone()
          .addScaledVector(upW, 0.030)
          .addScaledVector(fwd3, 0.100)
          .addScaledVector(left3, sdSign * 0.048);
      };
      const mkBenchSeat = () => hip3.clone()
        .addScaledVector(fwd3, 0.10 * lap.thighLen)
        .addScaledVector(left3, sdSign * (lap.radius + 0.135))
        .setY(GALLERY_BENCH_SEAT_TOP_Y + REST_WRIST_LIFT + yBias3);
      const mkBenchBack = () => {
        if (!seatDef) return null;
        return new THREE.Vector3(seatDef.pos[0], 0, seatDef.pos[2])
          .addScaledVector(left3, sdSign * 0.285)
          .addScaledVector(fwd3, -GALLERY_BENCH_BACK_DZ)
          .setY(GALLERY_BENCH_BACK_TOP_Y + REST_WRIST_LIFT + yBias3);
      };
      const MAKE = { arm: mkArm, lap: mkLap, knee: mkKnee, fold: mkFold,
        chin: mkChin, benchSeat: mkBenchSeat, benchBack: mkBenchBack };
      let T3 = (MAKE[handMode] || mkLap)();
      let postureFallback = null;
      if (!T3 || T3.distanceTo(S3) > span3 * 0.985) {
        postureFallback = handMode + (T3 ? '(out_of_reach)' : '(no_anchor)');
        handMode = hasArms ? 'arm' : 'lap';
        T3 = (hasArms ? mkArm : mkLap)();
        console.log('[courtsim] seated_posture_FALLBACK role=', postureSeatKey,
          'side=', sd, 'wanted=', postureFallback, 'using=', handMode,
          'arm_span_m=', span3.toFixed(4),
          '-- COURTSIM-CLERK-061: this posture does not fit this figure, so it',
          'is refused rather than stretched to. Said out loud so the next lane',
          'sees which seat lost its variety and why.');
      }
      const toT3 = T3.clone().sub(S3);
      let d3 = toT3.length();
      const dMax3 = span3 * 0.995;
      const dMin3 = Math.abs(B1 - B2) + 1e-3;
      if (d3 > dMax3) d3 = dMax3; else if (d3 < dMin3) d3 = dMin3;
      const u3 = toT3.clone().normalize();
      const pole3 = new THREE.Vector3(
        (sd === 'L' ? 1 : -1) * ELBOW_POLE_LAT, -1.2, 0).normalize()
        .applyQuaternion(bq3).normalize();
      const perp3 = pole3.clone().addScaledVector(u3, -pole3.dot(u3));
      if (perp3.lengthSq() < 1e-8) perp3.set(0, -1, 0).addScaledVector(u3, u3.y);
      perp3.normalize();
      const cos3 = THREE.MathUtils.clamp((B1 * B1 + d3 * d3 - B2 * B2) / (2 * B1 * d3), -1, 1);
      const al3 = Math.acos(cos3);
      const elbow3 = S3.clone()
        .addScaledVector(u3, B1 * Math.cos(al3))
        .addScaledVector(perp3, B1 * Math.sin(al3));
      aimBoneAtChild(up3, fo3, elbow3.clone().sub(S3));
      model.updateWorldMatrix(true, true);
      aimBoneAtChild(fo3, ha3, T3.clone().sub(worldPos(fo3)));
      model.updateWorldMatrix(true, true);
      let elbowDegBefore = NaN, elbowDegAfter = NaN, elbowClamped = false;
      {
        const Sm = worldPos(up3), Em = worldPos(fo3), Hm = worldPos(ha3);
        const d1 = Em.clone().sub(Sm).normalize();
        const d2 = Hm.clone().sub(Em).normalize();
        const raw = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
        const perpC = d2.clone().addScaledVector(d1, -d1.dot(d2));
        const sgn = perpC.dot(fwd3) >= 0 ? 1 : -1;
        elbowDegBefore = THREE.MathUtils.radToDeg(raw) * sgn;
        elbowDegAfter = elbowDegBefore;
        const lo = ELBOW_MIN_FLEX_DEG, hi = ELBOW_MAX_FLEX_DEG;
        const railExempt = (handMode === 'benchBack');
        if (railExempt && (elbowDegBefore < lo || elbowDegBefore > hi)) {
          console.log('[courtsim] elbow_rail_EXEMPT role=', postureSeatKey, 'side=', sd,
            'mode=', handMode, 'signed_elbow_deg=', elbowDegBefore.toFixed(2),
            'band=', lo + '..' + hi, 'true_flexion_deg=',
            THREE.MathUtils.radToDeg(raw).toFixed(2),
            '-- COURTSIM-CLERK-061: the hand is BEHIND the chest, so the rail\'s',
            'forward-referenced sign is meaningless here. The unsigned flexion',
            'is the number that matters and it is inside the band. Not clamped.');
        }
        if (!railExempt && (elbowDegBefore < lo || elbowDegBefore > hi)) {
          const want = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elbowDegBefore, lo, hi));
          let axis = d1.clone().cross(d2);
          if (axis.lengthSq() < 1e-8) axis = d1.clone().cross(fwd3);
          if (axis.lengthSq() < 1e-8) axis = d1.clone().cross(left3);
          axis.normalize();
          const flexDir = d1.clone().applyAxisAngle(axis, want * (
            d1.clone().applyAxisAngle(axis, 0.01).dot(fwd3) >= d1.dot(fwd3) ? 1 : -1));
          aimBoneAtChild(fo3, ha3, flexDir);
          model.updateWorldMatrix(true, true);
          const H2 = worldPos(ha3), E2 = worldPos(fo3);
          const e2 = E2.clone().sub(Sm).normalize();
          const h2 = H2.clone().sub(E2).normalize();
          const raw2 = Math.acos(THREE.MathUtils.clamp(e2.dot(h2), -1, 1));
          const p2 = h2.clone().addScaledVector(e2, -e2.dot(h2));
          elbowDegAfter = THREE.MathUtils.radToDeg(raw2) * (p2.dot(fwd3) >= 0 ? 1 : -1);
          elbowClamped = true;
          console.warn('[courtsim] ELBOW_CLAMPED role=', roleNow || (seatDef && seatDef.role),
            'side=', sd, 'signed_elbow_deg_before=', elbowDegBefore.toFixed(2),
            'after=', elbowDegAfter.toFixed(2), 'band=', lo + '..' + hi,
            '-- a negative value means the solve drove the elbow PAST straight,',
            'which no human elbow does. The hand no longer reaches its target exactly;',
            'that is the correct trade.');
        }
      }
      let lapResid = NaN;
      if (rg) {
        const lt3 = fwd3.clone().multiplyScalar(Math.cos(THREE.MathUtils.degToRad(LAP_PITCH_DEG)))
          .addScaledVector(_AXIS_Y, -Math.sin(THREE.MathUtils.degToRad(LAP_PITCH_DEG))).normalize();
        const at3 = left3.clone().multiplyScalar(sd === 'L' ? 1 : -1);
        if (LAP_ROLL_DEG) {
          at3.applyAxisAngle(lt3, THREE.MathUtils.degToRad(LAP_ROLL_DEG) * (sd === 'L' ? -1 : 1));
          at3.addScaledVector(lt3, -at3.dot(lt3)).normalize();
        }
        lapResid = this._orientHand(rg, lt3, at3);
        model.updateWorldMatrix(true, true);
      }
      const gotL = worldPos(ha3);
      console.log('[courtsim] lap_hand_SOLVED role=', roleNow || (seatDef && seatDef.role),
        'spectator=', isSpectator, 'side=', sd,
        'rest_on=', hasArms ? 'CHAIR_ARM_CAP' : 'LAP',
        'thigh_radius_measured_m=', lap.radius.toFixed(4),
        'thigh_len_m=', lap.thighLen.toFixed(4),
        'rest_top_y=', lapTopY.toFixed(3),
        'seat_pan_y=', seatSurfaceY.toFixed(3),
        'hand_world_seated=', [gotL.x, gotL.y - yBias3, gotL.z].map((n) => n.toFixed(3)).join(','),
        'wrist_above_rest_surface_m=', (gotL.y - yBias3 - lapTopY).toFixed(3),
        'wrist_above_seat_pan_m=', (gotL.y - yBias3 - seatSurfaceY).toFixed(3),
        'residual_to_target_m=', gotL.distanceTo(T3).toFixed(4),
        'elbow_bend_deg=', THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(
          (B1 * B1 + B2 * B2 - d3 * d3) / (2 * B1 * B2), -1, 1))).toFixed(1),
        'signed_elbow_deg=', elbowDegAfter.toFixed(2),
        'signed_elbow_deg_before_clamp=', elbowDegBefore.toFixed(2),
        'elbow_clamped=', elbowClamped,
        'lap_fwd_frac=', LAP_FWD_FRAC, 'palm_roll_deg=', LAP_ROLL_DEG,
        'wrist_aim_residual_deg=', Number.isNaN(lapResid) ? 'n/a' : lapResid.toFixed(2));
      if (gotL.distanceTo(T3) > 0.06) {
        console.warn('[courtsim] LAP_HAND_RESIDUAL_HIGH side=', sd,
          gotL.distanceTo(T3).toFixed(4), 'm -- the hand may not read as resting on the lap.');
      }
      if (hasArms) armrestRest[sd] = { up3, fo3, ha3, restTopY };
      postureMode[sd] = handMode;
      console.log('[courtsim] seated_posture_SOLVED role=', postureSeatKey,
        'side=', sd, 'posture=', posture.name, 'mode=', handMode,
        'fell_back_from=', postureFallback || 'n/a',
        'holds_something=', SEATED_HOLDING_MODES.includes(handMode),
        'hand_world_seated=', [gotL.x, gotL.y - yBias3, gotL.z].map((n) => n.toFixed(3)).join('/'),
        '-- COURTSIM-CLERK-061 item 2. `holds_something` is what licenses a',
        'closed hand; every false here draws an OPEN finger pose.');
    }

    const fingerStance = [];
    for (const sd of ['L', 'R']) {
      const rg = handRigs[sd];
      if (!rg) continue;
      if (roleNow === 'judge' && sd === 'R') continue;   // already gripping the gavel
      const flat = handOnSurface[sd];
      const holding = SEATED_HOLDING_MODES.includes(postureMode[sd]);
      const onRail = postureMode[sd] === 'benchBack'
        || postureMode[sd] === 'benchSeat' || postureMode[sd] === 'arm';
      const draw = Math.floor(_rnd(rngHolder) * 6) % 6;
      const pick = (flat || onRail)
        ? [0, 0, 1, 0, 5, 5][draw]          // palm on something flat
        : holding
          ? [2, 4, 2, 4, 1, 2][draw]        // closed, and there IS something in it
          : [5, 1, 0, 5, 1, 0][draw];       // free hand: OPEN, always
      const propSpec = (COUNSEL_HAND_PROPS[roleNow] || {})[sd];
      let pose = (propSpec && HAND_POSES.find((p) => p.name === propSpec.pose))
        || HAND_POSES[pick];
      if (propSpec && propSpec.heldPen && !flat) {
        pose = HAND_POSES.find((p) => p.name === 'relaxed') || pose;
        console.log('[courtsim] pen_pose_WITHDRAWN role=', roleNow, 'side=', sd,
          '-- this hand did not land on a surface in this venue, so no pen is',
          'built for it and the grip would have closed on nothing. Using',
          pose.name, 'instead.');
      }
      const posedN = this._applyHandPose(rg, pose, rngHolder, 5);
      {
        const standPose = STAND_HAND_POSES[
          _seatSeed(String(roleNow || (seatDef && seatDef.role)) + sd + 'stand')
          % STAND_HAND_POSES.length];
        const sitQ = [];
        for (const ch of rg.chains) {
          for (const b of ch.bones) sitQ.push([b, b.quaternion.clone()]);
        }
        const standHolder = { s: _seatSeed(String(roleNow) + sd + 'standjit') };
        this._applyHandPose(rg, standPose, standHolder, 3);
        for (const [b, q] of sitQ) {
          fingerStance.push({ bone: b, sit: q, stand: b.quaternion.clone() });
        }
        for (const [b, q] of sitQ) b.quaternion.copy(q);
        rg.hand.updateMatrixWorld(true);
        console.log('[courtsim] hand_pose_ASSIGNED role=',
          roleNow || (seatDef && seatDef.role) || 'seat', 'side=', sd,
          'seated=', pose.name, 'standing=', standPose.name,
          'posture_mode=', postureMode[sd] || 'n/a',
          'holds_something=', SEATED_HOLDING_MODES.includes(postureMode[sd]),
          'bones_blended=', sitQ.length,
          '-- COURTSIM-SEATED-047 item 3: the fingers now change when the',
          'figure stands. They never did before, which is why every risen',
          'hand in the room was the same seated cup.');
      }
      let rollDeg = 0;
      if (!flat) {
        rollDeg = _jit(rngHolder, 14);
        model.updateWorldMatrix(true, true);
        const iK2 = rg.chains.find((c) => c.f === 1);
        const pK2 = rg.chains.find((c) => c.f === 4);
        if (iK2 && pK2) {
          const hw2 = rg.hand.getWorldPosition(new THREE.Vector3());
          const longW = iK2.bones[0].getWorldPosition(new THREE.Vector3())
            .add(pK2.bones[0].getWorldPosition(new THREE.Vector3()))
            .multiplyScalar(0.5).sub(hw2);
          if (longW.lengthSq() > 1e-10) {
            longW.normalize();
            const pq2 = new THREE.Quaternion();
            if (rg.hand.parent) rg.hand.parent.getWorldQuaternion(pq2);
            const axisP = longW.clone().applyQuaternion(pq2.clone().invert()).normalize();
            rg.hand.quaternion.premultiply(
              new THREE.Quaternion().setFromAxisAngle(axisP, THREE.MathUtils.degToRad(rollDeg)));
            rg.hand.updateMatrixWorld(true);
          }
        }
      }
      console.log('[courtsim] rest_hand_pose role=', roleNow, 'side=', sd,
        'pose=', pose.name, 'on_surface=', flat,
        'finger_bones_posed=', posedN, 'wrist_roll_deg=', rollDeg.toFixed(1));
    }

    for (const sd of Object.keys(armrestRest)) {
      const a = armrestRest[sd];
      if (!a || !a.up3 || !a.fo3 || !a.ha3) continue;
      model.updateMatrixWorld(true);
      const Sw = worldPos(a.up3), Ew = worldPos(a.fo3), Hw = worldPos(a.ha3);
      const A1w = Sw.distanceTo(Ew), A2w = Ew.distanceTo(Hw);
      const uw = Hw.clone().sub(Sw);
      let pole = null;
      if (uw.lengthSq() > 1e-10) {
        uw.normalize();
        const perpW = Ew.clone().sub(Sw);
        perpW.addScaledVector(uw, -perpW.dot(uw));
        if (perpW.lengthSq() > 1e-9) {
          const mqInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
          pole = perpW.normalize().applyQuaternion(mqInv).normalize();
        }
      }
      if (pole && A1w > 1e-4 && A2w > 1e-4 && a.up3.parent
        && a.fo3.position.lengthSq() > 1e-12 && a.ha3.position.lengthSq() > 1e-12) {
        contactPins.push({
          side: sd,
          up: a.up3, fo: a.fo3, ha: a.ha3,
          A1: A1w, A2: A2w,
          local: model.worldToLocal(Hw.clone()),
          wq: a.ha3.getWorldQuaternion(new THREE.Quaternion()),
          poleLocal: pole,
          upLocalRest: a.up3.quaternion.clone(),
          foLocalRest: a.fo3.quaternion.clone(),
          foOff: a.fo3.position.clone().normalize(),
          haOff: a.ha3.position.clone().normalize(),
          what: 'chair arm cap',
          supportY: a.restTopY,   // replaced by the fit with the cap's underside
        });
        console.log('[courtsim] contact_pin_CAPTURED role=', roleNow || (seatDef && seatDef.role),
          'side=', sd, 'support_top_y=', a.restTopY.toFixed(4),
          'rests_on= chair arm cap',
          'upper_arm_m=', A1w.toFixed(4), 'forearm_m=', A2w.toFixed(4),
          '-- COURTSIM-PROPS-033: armrest hands are pinned now. Measured before',
          'this, they wandered 9-31 mm per idle cycle along the arm they rest on.');
      } else {
        console.warn('[courtsim] contact_pin_NOT_CAPTURED role=', roleNow || (seatDef && seatDef.role),
          'side=', sd, 'pole=', !!pole, 'A1=', A1w.toFixed(4), 'A2=', A2w.toFixed(4),
          '-- this ARMREST hand keeps the old behaviour and WILL drift along the cap.');
      }
    }

    for (const sd of ['L', 'R']) {
      const ss = surfaceSolve[sd];
      if (!ss) continue;
      const verts = this._collectHandVertices(model, sd);
      if (!verts) continue;
      const propLift = ((COUNSEL_HAND_PROPS[roleNow] || {})[sd] || {}).lift || 0;
      const targetY = ss.surfaceY + propLift + ss.yBias2;   // support plane, load-time frame
      let before = NaN, after = NaN, lifted = 0, passes = 0;
      for (let pass = 0; pass < 3; pass++) {
        const low = this._lowestVertexY(model, verts);
        if (low == null) break;
        passes = pass + 1;
        if (pass === 0) before = low;
        after = low;
        const resid = targetY - low;             // > 0 => the hand is INSIDE the surface
        const FLOAT_SETTLE_MAX = 0.030;
        if (Math.abs(resid) <= 0.002) break;     // on the plane: done
        if (resid < -FLOAT_SETTLE_MAX) {
          console.log('[courtsim] hand_float_NOT_SETTLED role=', roleNow, 'side=', sd,
            'surface=', ss.what, 'float_m=', (-resid).toFixed(4),
            'limit_m=', FLOAT_SETTLE_MAX,
            '-- this hand is further above its nominal support than a resting',
            'hand can be, so it is not resting on it. Left where the',
            'signed-off solve put it, and said out loud rather than dragged',
            'down onto a surface it is not on.');
          break;
        }
        lifted += resid;                         // negative lowers, positive lifts
        const T = ss.T2.clone().setY(ss.T2.y + lifted);
        const toT = T.clone().sub(ss.S2);
        let d = toT.length();
        const dMax = ss.span * 0.995;
        const dMin = Math.abs(ss.A1 - ss.A2) + 1e-3;
        if (d > dMax) d = dMax; else if (d < dMin) d = dMin;
        const u = toT.clone().normalize();
        const perp = ss.poleV.clone().addScaledVector(u, -ss.poleV.dot(u));
        if (perp.lengthSq() < 1e-8) perp.set(0, -1, 0).addScaledVector(u, u.y);
        perp.normalize();
        const cosA = THREE.MathUtils.clamp(
          (ss.A1 * ss.A1 + d * d - ss.A2 * ss.A2) / (2 * ss.A1 * d), -1, 1);
        const al = Math.acos(cosA);
        const elbow = ss.S2.clone()
          .addScaledVector(u, ss.A1 * Math.cos(al))
          .addScaledVector(perp, ss.A1 * Math.sin(al));
        aimBoneAtChild(ss.up2, ss.fo2, elbow.clone().sub(ss.S2));
        model.updateWorldMatrix(true, true);
        aimBoneAtChild(ss.fo2, ss.ha2, T.clone().sub(worldPos(ss.fo2)));
        model.updateWorldMatrix(true, true);
        if (ss.rg) {
          const PP = THREE.MathUtils.degToRad(20);
          const lt = ss.fwd2.clone().multiplyScalar(Math.cos(PP))
            .addScaledVector(_AXIS_Y, -Math.sin(PP)).normalize();
          const at = ss.left2.clone().multiplyScalar(sd === 'L' ? 1 : -1);
          this._orientHand(ss.rg, lt, at);
          model.updateWorldMatrix(true, true);
        }
      }
      console.log('[courtsim] hand_on_surface_MEASURED role=', roleNow, 'side=', sd,
        'surface=', ss.what, 'surface_top_y=', ss.surfaceY.toFixed(3),
        'lowest_hand_vertex_BEFORE=', Number.isNaN(before) ? 'n/a' : (before - ss.yBias2).toFixed(4),
        'penetration_BEFORE_m=', Number.isNaN(before) ? 'n/a' : (targetY - before).toFixed(4),
        'lowest_hand_vertex_AFTER=', Number.isNaN(after) ? 'n/a' : (after - ss.yBias2).toFixed(4),
        'penetration_AFTER_m=', Number.isNaN(after) ? 'n/a' : (targetY - after).toFixed(4),
        'wrist_moved_m=', lifted.toFixed(4), 'passes=', passes,
        'hand_vertices_measured=', verts.total,
        'prop_lift_m=', propLift.toFixed(3),
        'rests_on=', (((COUNSEL_HAND_PROPS[roleNow] || {})[sd] || {}).on) || ss.what,
        '-- positive penetration is INSIDE the surface. COURTSIM-WEB-007.');

      {
        const up = ss.up2, fo = ss.fo2, ha = ss.ha2;
        const propSpecForSide = (COUNSEL_HAND_PROPS[roleNow] || {})[sd];
        model.updateMatrixWorld(true);
        const Sw = worldPos(up), Ew = worldPos(fo), Hw = worldPos(ha);
        const A1w = Sw.distanceTo(Ew), A2w = Ew.distanceTo(Hw);
        const uw = Hw.clone().sub(Sw);
        let pole = null;
        if (uw.lengthSq() > 1e-10) {
          uw.normalize();
          const perpW = Ew.clone().sub(Sw);
          perpW.addScaledVector(uw, -perpW.dot(uw));
          if (perpW.lengthSq() > 1e-9) {
            const mqInv = model.getWorldQuaternion(new THREE.Quaternion()).invert();
            pole = perpW.normalize().applyQuaternion(mqInv).normalize();
          }
        }
        if (pole && A1w > 1e-4 && A2w > 1e-4 && up.parent && fo.position.lengthSq() > 1e-12
            && ha.position.lengthSq() > 1e-12) {
          contactPins.push({
            side: sd,
            up, fo, ha,
            A1: A1w, A2: A2w,
            local: model.worldToLocal(Hw.clone()),
            wq: ha.getWorldQuaternion(new THREE.Quaternion()),
            poleLocal: pole,
            upLocalRest: up.quaternion.clone(),
            foLocalRest: fo.quaternion.clone(),
            foOff: fo.position.clone().normalize(),
            haOff: ha.position.clone().normalize(),
            what: ss.what,
            supportY: ss.surfaceY + propLift,
          });
          console.log('[courtsim] contact_pin_CAPTURED role=', roleNow, 'side=', sd,
            'support_top_y=', (ss.surfaceY + propLift).toFixed(4),
            'rests_on=', ss.what,
            'upper_arm_m=', A1w.toFixed(4), 'forearm_m=', A2w.toFixed(4),
            'pin_local=', ss.T2 ? model.worldToLocal(Hw.clone()).toArray().map((n) => n.toFixed(3)).join(',') : 'n/a',
            '-- this wrist will now hold this world point while the body moves.');
        } else {
          console.warn('[courtsim] contact_pin_NOT_CAPTURED role=', roleNow, 'side=', sd,
            'pole=', !!pole, 'A1=', A1w.toFixed(4), 'A2=', A2w.toFixed(4),
            '-- this hand keeps the old behaviour and WILL move with the body.');
        }

        if (propSpecForSide && propSpecForSide.heldPen) {
          const gripKind = (typeof propSpecForSide.heldPen === 'string')
            ? propSpecForSide.heldPen : 'casual';
          const writing = gripKind === 'write';
          const grip = this._gripPenInHand(model, ss.rg, sd, {
            role: roleNow,
            pitchDeg: writing ? 46 : 38,
            nibClear: writing ? 0.020 : 0.006,
            supportY: ss.surfaceY + propLift + ss.yBias2,
            forwardW: ss.fwd2,
          });
          if (grip) {
            const pen = makePenMesh('CounselPropPenHeld_' + roleNow + '_' + sd);
            const mid = grip.nib.clone().addScaledVector(grip.dir, -grip.penLen / 2);
            pen.position.copy(mid);
            pen.quaternion.setFromUnitVectors(_AXIS_Y, grip.dir.clone().negate());
            this.scene.add(pen);
            this.scene.updateMatrixWorld(true);
            ha.attach(pen);
            model.updateMatrixWorld(true);
            const penW = pen.getWorldPosition(new THREE.Vector3());
            const gripGap = penW.distanceTo(worldPos(ha));
            const axW = _AXIS_Y.clone()
              .applyQuaternion(pen.getWorldQuaternion(new THREE.Quaternion()))
              .normalize().negate();
            const nibW = penW.clone().addScaledVector(axW, grip.penLen / 2);
            const off = (p) => {
              const v = p.clone().sub(nibW);
              return v.addScaledVector(axW, -v.dot(axW)).length();
            };
            const padOf = (f) => {
              const c = ss.rg.chains.find((x) => x.f === f);
              if (!c || c.bones.length < 2) return null;
              const b1 = c.bones[c.bones.length - 2], b2 = c.bones[c.bones.length - 1];
              return b1.getWorldPosition(new THREE.Vector3())
                .add(b2.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
            };
            const dThumb = padOf(0) ? off(padOf(0)) : null;
            const dIndex = padOf(1) ? off(padOf(1)) : null;
            const dMiddle = padOf(2) ? off(padOf(2)) : null;
            const nibAbove = (nibW.y - ss.yBias2) - (ss.surfaceY + propLift);
            console.log('[courtsim] held_pen_GRIPPED role=', roleNow, 'side=', sd,
              'grip=', gripKind, 'len_m=', grip.penLen, 'parent=', ha.name,
              'pen_world_centre=', penW.toArray().map((n) => n.toFixed(4)).join(','),
              'centre_to_hand_m=', gripGap.toFixed(4),
              'contact_target_m=', grip.contactR.toFixed(4),
              'THUMB_pad_to_axis_m=', dThumb == null ? 'n/a' : dThumb.toFixed(4),
              'INDEX_pad_to_axis_m=', dIndex == null ? 'n/a' : dIndex.toFixed(4),
              'MIDDLE_pad_to_axis_m=', dMiddle == null ? 'n/a' : dMiddle.toFixed(4),
              'web_to_axis_m=', grip.web.toFixed(4),
              '(COURTSIM-GAVEL-050: should now read ~0.0195, the barrel resting ON the web)',
              'heading_from=', grip.headingSource,
              'web_heading_pitch_deg=', grip.webPitchDeg == null ? 'n/a' : grip.webPitchDeg.toFixed(1),
              'butt_beyond_web_m=', grip.backOverWeb.toFixed(4),
              '(positive = the back of the pen carries on out over the web, which is',
              'the founder\'s "it would just fall down" if it does not)',
              'WRIST_to_axis_m=', grip.wrist.toFixed(4),
              '(under ~0.03 means the barrel is inside the hand)',
              'PINCH_GAP_m=', grip.pinchGap.toFixed(4), '(shipped build: 0.1027)',
              'thumb_opposition_deg=', grip.thumb.opposition,
              'thumb_flex_deg=', grip.thumb.flex,
              'index_mcp/pip_deg=', grip.index.mcp + '/' + grip.index.pip, '(POSED)',
              'middle_mcp/pip_deg=', grip.middle.mcp + '/' + grip.middle.pip,
              'nib_above_support_m=', nibAbove.toFixed(4),
              'nib_reach_m=', grip.t.toFixed(4),
              '(solved', grip.tRaw.toFixed(4), 'before the 0.045..0.085 clamp)',
              '-- COURTSIM-PROPS-033: the three pad distances are the receipt.',
              'A pad ON the barrel reads', grip.contactR.toFixed(4),
              '; the shipped build had no pad on it at all.');
            if (gripGap > 0.20) {
              console.error('[courtsim] HELD_PEN_ESCAPED role=', roleNow, 'side=', sd,
                gripGap.toFixed(4), 'm from its own hand -- this pen is the floating',
                'cylinder defect returning. Check the parent frame before attach().');
            }
            const worstPad = Math.max(
              dThumb == null ? 0 : Math.abs(dThumb - grip.contactR),
              dIndex == null ? 0 : Math.abs(dIndex - grip.contactR),
              dMiddle == null ? 0 : Math.abs(dMiddle - grip.contactR));
            if (worstPad > 0.012) {
              console.error('[courtsim] HELD_PEN_NOT_IN_THE_HAND role=', roleNow, 'side=', sd,
                'worst_pad_error_m=', worstPad.toFixed(4),
                '-- at least one of the three tripod contacts is not on the barrel.',
                'It will read as a pen lying in an open hand, which is the defect',
                'the founder has now reported three times.');
            }
          }
        }
      }
      if (Number.isFinite(after) && (targetY - after) > 0.006) {
        console.warn('[courtsim] HAND_SURFACE_RESIDUAL role=', roleNow, 'side=', sd,
          (targetY - after).toFixed(4), 'm still inside after two passes.');
      }
    }

    if (hasArms) {
      this._armFitPending = this._armFitPending || [];
      this._armFitPending.push({ model, seatDef, role: roleNow, sides: lapSides.slice(), kind: 'arm' });
    }
    if (defaultStance === 'sit' && seatDef && seatDef.pos) {
      this._armFitPending = this._armFitPending || [];
      this._armFitPending.push({ model, seatDef, role: roleNow, kind: 'step', standY });
    }

    let legSolve = null;
    let rightAxisWorld = null;
    if (lThigh && rThigh && lCalf && rCalf) {
      model.updateWorldMatrix(true, true);
      const wp = (o) => o.getWorldPosition(new THREE.Vector3());
      const lHipW = wp(lThigh), rHipW = wp(rThigh);
      const hipSpan = new THREE.Vector3().subVectors(rHipW, lHipW);
      const hipSpanLen = hipSpan.length();
      if (hipSpanLen > 0.02) {
        const axisWorld = hipSpan.clone().normalize(); // character's RIGHT, world space
        rightAxisWorld = axisWorld.clone();            // COURTSIM-FIX-M -- reused by the spine pitch axis below

        let fwdWorld = null;
        if (lFoot && lToe) {
          fwdWorld = new THREE.Vector3().subVectors(wp(lToe), wp(lFoot));
          fwdWorld.y = 0;
          if (fwdWorld.lengthSq() > 1e-8) fwdWorld.normalize(); else fwdWorld = null;
        }
        const yawFwd = new THREE.Vector3(Math.sin(model.rotation.y), 0, Math.cos(model.rotation.y));
        const fwdAgree = fwdWorld ? fwdWorld.dot(yawFwd) : NaN;
        if (!fwdWorld) {
          fwdWorld = yawFwd.clone();
          console.warn('[courtsim] leg_forward_fallback role=', seatDef && seatDef.role,
            '-- no Toe0 bone; forward taken from model.rotation.y, unmeasured.');
        }

        const thighVec = new THREE.Vector3().subVectors(wp(lCalf), lHipW).normalize();
        const rotThighBy = (deg) => thighVec.clone().applyQuaternion(
          new THREE.Quaternion().setFromAxisAngle(axisWorld, THREE.MathUtils.degToRad(deg)));
        const dotPlus = rotThighBy(88).dot(fwdWorld);
        const dotMinus = rotThighBy(-88).dot(fwdWorld);
        const flexSign = dotPlus >= dotMinus ? 1 : -1;
        const probe = thighVec.clone().applyQuaternion(
          new THREE.Quaternion().setFromAxisAngle(axisWorld, Math.PI / 2));
        const dispSign = probe.clone().sub(thighVec).dot(fwdWorld) >= 0 ? 1 : -1;
        if (dispSign !== flexSign) {
          console.warn('[courtsim] hip_flex_sign_DISAGREE role=', seatDef && seatDef.role,
            'resulting-direction test says', flexSign, 'but the knee-displacement test says', dispSign,
            '-- the resulting-direction test wins (it is the one the thigh has to satisfy).',
            'dot_if_plus88=', dotPlus.toFixed(5), 'dot_if_minus88=', dotMinus.toFixed(5));
        }
        const dotBefore = Math.min(dotPlus, dotMinus);   // what the WRONG sign would have given
        const dotAfter = Math.max(dotPlus, dotMinus);

        const hipAboveRoot = lHipW.y - model.position.y;
        const ankleAboveRoot = lFoot ? (wp(lFoot).y - model.position.y) : 0.10;
        const lenThigh = lHipW.distanceTo(wp(lCalf));
        const lenCalf = lFoot ? wp(lCalf).distanceTo(wp(lFoot)) : 0.395;

        const dropBase = (seatSurfaceY + seatPelvisLift) - (standY + ankleAboveRoot);
        let soleLift = 0;                 // metres the ankle target is raised
        let soleBefore = NaN, soleAfter = NaN, solePasses = 0;
        let dropNeeded = dropBase;
        let hipDeg;
        let reach = 'exact';
        let cosTh = (dropNeeded - lenCalf) / lenThigh;
        if (cosTh >= -1 && cosTh <= 1) {
          hipDeg = THREE.MathUtils.radToDeg(Math.acos(cosTh));
        } else {
          hipDeg = cosTh > 1 ? 0 : 180;
          reach = 'CLAMPED';
        }
        if (!(hipDeg > 60 && hipDeg < 115)) {
          console.error('[courtsim] LEG_SOLVE_IMPLAUSIBLE role=', seatDef && seatDef.role,
            'hipDeg=', hipDeg.toFixed(2), 'drop=', dropNeeded.toFixed(4),
            'lenThigh=', lenThigh.toFixed(4), 'lenCalf=', lenCalf.toFixed(4),
            '-- falling back to 88deg. This seat may not sit correctly.');
          hipDeg = 88;
          reach = 'FALLBACK';
        }
        let hipRad = THREE.MathUtils.degToRad(hipDeg) * flexSign;
        let kneeRad = -hipRad;

        const inParent = (bone) => {
          const pq = bone.parent
            ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
            : new THREE.Quaternion();
          return axisWorld.clone().applyQuaternion(pq.invert());
        };
        legSolve = {
          lThighAxis: inParent(lThigh), rThighAxis: inParent(rThigh),
          lCalfAxis: inParent(lCalf), rCalfAxis: inParent(rCalf),
          hipRad, kneeRad,
        };
        if (defaultStance === 'sit') {
          const seatedRootYLeg = seatSurfaceY + seatPelvisLift - pelvisRise;
          const footVerts = this._collectFootVertices(model);
          const SOLE_SOLVE_MAX_PASSES = 6;
          for (let pass = 0; pass < SOLE_SOLVE_MAX_PASSES; pass++) {
            const low = this._measureSeatedSoleY(
              model, legSolve, seatedRootYLeg, { lThigh, rThigh, lCalf, rCalf }, footVerts);
            if (low == null) break;
            solePasses = pass + 1;
            if (pass === 0) soleBefore = low;
            soleAfter = low;
            const resid = standY - low;               // > 0 => the sole is BELOW the floor
            if (Math.abs(resid) < 0.002) break;
            soleLift += resid;
            dropNeeded = dropBase - soleLift;
            cosTh = (dropNeeded - lenCalf) / lenThigh;
            if (!(cosTh >= -1 && cosTh <= 1)) {
              console.warn('[courtsim] sole_correction_UNREACHABLE role=', seatDef && seatDef.role,
                'resid_m=', resid.toFixed(4), '-- the shin cannot span the corrected gap.',
                'Leaving the uncorrected pose rather than folding the leg through itself.');
              soleLift -= resid; dropNeeded = dropBase - soleLift;
              break;
            }
            const hd = THREE.MathUtils.radToDeg(Math.acos(cosTh));
            if (!(hd > 60 && hd < 115)) {
              console.warn('[courtsim] sole_correction_IMPLAUSIBLE role=', seatDef && seatDef.role,
                'hipDeg would be', hd.toFixed(2), '-- correction abandoned, uncorrected pose kept.');
              soleLift -= resid; dropNeeded = dropBase - soleLift;
              break;
            }
            hipDeg = hd;
            hipRad = THREE.MathUtils.degToRad(hipDeg) * flexSign;
            kneeRad = -hipRad;
            legSolve.hipRad = hipRad;
            legSolve.kneeRad = kneeRad;
          }
          console.log('[courtsim] foot_on_floor role=', seatDef && seatDef.role,
            'floor_y=', standY.toFixed(4),
            'lowest_foot_vertex_BEFORE=', Number.isNaN(soleBefore) ? 'n/a' : soleBefore.toFixed(4),
            'penetration_BEFORE_m=', Number.isNaN(soleBefore) ? 'n/a' : (standY - soleBefore).toFixed(4),
            'lowest_foot_vertex_AFTER=', Number.isNaN(soleAfter) ? 'n/a' : soleAfter.toFixed(4),
            'penetration_AFTER_m=', Number.isNaN(soleAfter) ? 'n/a' : (standY - soleAfter).toFixed(4),
            'ankle_target_raised_m=', soleLift.toFixed(4),
            'hip_deg_now=', hipDeg.toFixed(2), 'passes=', solePasses,
            'foot_vertices_measured=', footVerts ? footVerts.total : 0,
            '-- positive penetration is BELOW the floor. COURTSIM-WEB-007.');
          const seatLowY = this._measureSeatedPelvisLowY(
            model, legSolve, seatedRootYLeg, { lThigh, rThigh, lCalf, rCalf });
          if (seatLowY != null) {
            const seatResid = seatSurfaceY - seatLowY;
            console.log('[courtsim] seat_contact role=', seatDef && seatDef.role,
              'seat_top_y=', seatSurfaceY.toFixed(4),
              'lowest_seat_vertex_y=', seatLowY.toFixed(4),
              'penetration_BEFORE_mm=', ((seatPelvisLift - SEAT_PELVIS_LIFT) * 1000).toFixed(1),
              'penetration_AFTER_mm=', (seatResid * 1000).toFixed(1),
              'lift_used_m=', seatPelvisLift.toFixed(4), 'lift_src=', seatLiftSrc,
              '-- COURTSIM-SEATED-047. BEFORE is what the flat 0.06 assumption',
              'was costing this figure; AFTER is measured off the solved pose.');
            if (Math.abs(seatResid) > 0.008 && seatLiftSrc === 'MEASURED') {
              console.warn('[courtsim] SEAT_CONTACT_RESIDUAL role=', seatDef && seatDef.role,
                'resid_mm=', (seatResid * 1000).toFixed(1),
                '-- the canonical-fold approximation in _measureSeatedPelvisDrop did',
                'not hold for this rig. The solved hip angle is', hipDeg.toFixed(2),
                'deg. Fold the residual into seatPelvisLift for this rig.');
            }
          }
          if (Number.isFinite(soleAfter) && Math.abs(standY - soleAfter) > 0.006) {
            console.warn('[courtsim] FOOT_FLOOR_RESIDUAL role=', seatDef && seatDef.role,
              (standY - soleAfter).toFixed(4), 'm after', solePasses, 'pass(es) -- this figure may',
              'still read as sunk or floating. The correction did not converge within',
              SOLE_SOLVE_MAX_PASSES, 'passes, so the defect is in the rig rather than in the',
              'number of passes. COURTSIM-TITLES-027 section 3(a).');
          }
        }

        console.log('[courtsim] leg_axis_measured role=', seatDef && seatDef.role,
          'hip_span_m=', hipSpanLen.toFixed(4),
          'right_axis_world=', axisWorld.toArray().map((v) => v.toFixed(3)).join(','),
          'forward_src=', (lFoot && lToe) ? 'foot->toe' : 'yaw',
          'forward_world=', fwdWorld.toArray().map((v) => v.toFixed(3)).join(','),
          'forward_crosscheck_dot=', Number.isNaN(fwdAgree) ? 'n/a' : fwdAgree.toFixed(3),
          'flex_sign=', flexSign);
        console.log('[courtsim] hip_flex_sign_measured role=', seatDef && seatDef.role,
          'forward_axis_world=', fwdWorld.toArray().map((x) => x.toFixed(5)).join(','),
          'dot_with_forward_if_plus88=', dotPlus.toFixed(5),
          'dot_with_forward_if_minus88=', dotMinus.toFixed(5),
          'sign_chosen=', flexSign,
          'dot_WRONG_sign_would_give=', dotBefore.toFixed(5),
          'dot_CHOSEN=', dotAfter.toFixed(5),
          'knee_displacement_crosscheck_sign=', dispSign,
          '(desktop COURTSIM-EXPLODE-004 defect E2 measured -0.73..-0.80 here; this build does not have it)');
        if (dotAfter <= 0) {
          console.error('[courtsim] HIP_FLEX_BACKWARD role=', seatDef && seatDef.role,
            'dot=', dotAfter.toFixed(5),
            '-- NO sign of this hinge carries the knee forward on this rig. The thighs will',
            'project behind the pelvis. This is desktop defect E2 arriving on the web build.');
        }
        console.log('[courtsim] leg_pose_solved role=', seatDef && seatDef.role,
          'len_thigh_m=', lenThigh.toFixed(4), 'len_calf_m=', lenCalf.toFixed(4),
          'hip_above_root_m=', hipAboveRoot.toFixed(4),
          'ankle_above_root_m=', ankleAboveRoot.toFixed(4),
          'drop_needed_m=', dropNeeded.toFixed(4),
          'HIP_DEG=', hipDeg.toFixed(2), 'KNEE_DEG=', hipDeg.toFixed(2),
          'reach=', reach);
        if (!Number.isNaN(fwdAgree) && fwdAgree < 0.5) {
          console.warn('[courtsim] leg_forward_DISAGREE role=', seatDef && seatDef.role,
            'rig foot->toe and model yaw disagree, dot=', fwdAgree.toFixed(3),
            '-- the rig-measured forward was used. Check this seat in a render.');
        }
      } else {
        console.warn('[courtsim] leg_axis_UNMEASURABLE role=', seatDef && seatDef.role,
          'hip_span_m=', hipSpanLen.toFixed(4),
          '-- legs will NOT be folded; this seat stays standing-posed rather than',
          'being folded about a guessed axis.');
      }
    }

    let headYawAxis = null;
    let spinePitchAxis = null;
    let spineRollAxis = null;   // COURTSIM-FIX-O -- lateral weight shift
    let headPitchAxis = null;   // COURTSIM-FIX-O -- head nod / drift
    const _worldUp = new THREE.Vector3(0, 1, 0);
    const _axisInParentOf = (bone, axisWorld) => {
      const pq = bone.parent
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
        : new THREE.Quaternion();
      return axisWorld.clone().applyQuaternion(pq.invert()).normalize();
    };
    model.updateWorldMatrix(true, true);
    if (headBone) headYawAxis = _axisInParentOf(headBone, _worldUp);
    if (spineBone) {
      let rightW = rightAxisWorld;
      if (!rightW) {
        const fwd = new THREE.Vector3(Math.sin(model.rotation.y), 0, Math.cos(model.rotation.y));
        rightW = new THREE.Vector3().crossVectors(_worldUp, fwd).normalize();
        console.warn('[courtsim] spine_right_fallback role=', seatDef && seatDef.role,
          '-- hip span unmeasurable; breathing axis taken from model.rotation.y, unmeasured.');
      }
      spinePitchAxis = _axisInParentOf(spineBone, rightW);
      spineRollAxis = _axisInParentOf(spineBone,
        new THREE.Vector3().crossVectors(rightW, _worldUp).normalize());
    }
    if (headBone && rightAxisWorld) headPitchAxis = _axisInParentOf(headBone, rightAxisWorld);
    if (headBone) {
      const backToWorld = headYawAxis.clone().applyQuaternion(
        headBone.parent ? headBone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion());
      console.log('[courtsim] head_yaw_axis role=', seatDef && seatDef.role,
        'axis_in_parent=', headYawAxis.toArray().map((v) => v.toFixed(3)).join(','),
        'head_yaw_axis_dot_up=', backToWorld.dot(_worldUp).toFixed(3),
        '(1.000 = yaws about true vertical; the old post-multiplied _AXIS_Y measured 0.152)');
    }

    const lifeCfg = {
      swayAmp: 0.9 + _rnd(rngHolder) * 0.8,      // slow forward/back settle on top of breathing
      swayPeriod: 4.9 + _rnd(rngHolder) * 3.4,
      swayPhase: _rnd(rngHolder) * Math.PI * 2,
      rollAmp: 0.7 + _rnd(rngHolder) * 0.9,      // lateral weight shift -- the "camera isn't still" layer
      rollPeriod: 6.1 + _rnd(rngHolder) * 5.3,
      rollPhase: _rnd(rngHolder) * Math.PI * 2,
      nodAmp: 0.8 + _rnd(rngHolder) * 1.1,       // head drift, vertical
      nodPeriod: 3.7 + _rnd(rngHolder) * 3.2,
      nodPhase: _rnd(rngHolder) * Math.PI * 2,
      driftAmp: 1.2 + _rnd(rngHolder) * 1.6,     // head drift, horizontal, ON TOP of the existing idle sway
      driftPeriod: 5.3 + _rnd(rngHolder) * 4.7,
      driftPhase: _rnd(rngHolder) * Math.PI * 2,
      handAmp: 1.6 + _rnd(rngHolder) * 2.4,      // wrist settle
      handPeriod: 4.3 + _rnd(rngHolder) * 4.1,
      handPhase: _rnd(rngHolder) * Math.PI * 2,
      handPhase2: _rnd(rngHolder) * Math.PI * 2, // the two hands are NOT in step
    };
    const lt0 = _rnd(rngHolder) * 30;
    const settleAxisFor = (rg) => {
      if (!rg) return null;
      const ix = rg.chains.find((c) => c.f === 1);
      const pk = rg.chains.find((c) => c.f === 4);
      if (!ix || !pk) return null;
      model.updateWorldMatrix(true, true);
      const aw = pk.bones[0].getWorldPosition(new THREE.Vector3())
        .sub(ix.bones[0].getWorldPosition(new THREE.Vector3()));
      if (aw.lengthSq() < 1e-10) return null;
      aw.normalize().multiplyScalar(rg.flexSign);
      const pq = new THREE.Quaternion();
      if (rg.hand.parent) rg.hand.parent.getWorldQuaternion(pq);
      return aw.applyQuaternion(pq.invert()).normalize();
    };
    const settleAxisL = settleAxisFor(handRigs.L);
    const settleAxisR = settleAxisFor(handRigs.R);
    const armStanceBlend = [];
    for (const entry of standArmPose) {
      const sitQ = entry.bone.quaternion.clone();
      if (entry.q.angleTo(sitQ) < 0.0017) continue;
      armStanceBlend.push({ bone: entry.bone, stand: entry.q, sit: sitQ });
    }
    if (armStanceBlend.length) {
      console.log('[courtsim] arm_stance_blend role=', (seatDef && seatDef.role) || 'juror',
        'bones=', armStanceBlend.length,
        'max_delta_deg=', armStanceBlend.reduce(
          (m, e) => Math.max(m, THREE.MathUtils.radToDeg(e.stand.angleTo(e.sit))), 0).toFixed(1),
        '-- COURTSIM-FIX-W DEFECT W-8: this many degrees of arm was being carried',
        'into the STANDING pose unchanged, which is the "zombie hands up thing".');
    }
    let seatChair = null;
    if (seatDef && seatDef.pos) {
      for (const c of this.venueGroup.children) {
        if (!c.userData || !c.userData.__isChair) continue;
        if (Math.abs(c.userData.__seatX - seatDef.pos[0]) > 0.05) continue;
        if (Math.abs(c.userData.__seatZ - seatDef.pos[2]) > 0.05) continue;
        seatChair = c;
        break;
      }
    }
    this._animStates.push({
      armStanceBlend,
      chair: seatChair,
      legSolve,
      headYawAxis, spinePitchAxis, spineRollAxis, headPitchAxis,
      spineBone, headBone,
      spineRestQuat: spineBone ? spineBone.quaternion.clone() : null,
      headRestQuat: headBone ? headBone.quaternion.clone() : null,
      rngState: rngHolder.rngState,
      seatSeed: seed,
      role: (seatDef && seatDef.role) || null,
      life: lifeCfg,
      lt: lt0,     // each seat starts at a different point in its own cycle
      evtType: -1, evtT: 0, evtDur: 0, evtAmp: 0,
      evtNextT: lt0 + 6 + _rnd(rngHolder) * 18,
      lHand: handRigs.L ? handRigs.L.hand : null,
      rHand: handRigs.R ? handRigs.R.hand : null,
      lHandAxis: settleAxisL,
      rHandAxis: settleAxisR,
      lHandOnSurface: !!(handOnSurface && handOnSurface.L),
      rHandOnSurface: !!(handOnSurface && handOnSurface.R),
      contactPins: contactPins.length ? contactPins : null,
      lHandPinned: contactPins.some((p) => p.side === 'L'),
      rHandPinned: contactPins.some((p) => p.side === 'R'),
      lHandRest: handRigs.L ? handRigs.L.hand.quaternion.clone() : null,
      rHandRest: handRigs.R ? handRigs.R.hand.quaternion.clone() : null,
      lHandStandQ: standHandQ.L,
      rHandStandQ: standHandQ.R,
      lHandSitQ: handRigs.L ? handRigs.L.hand.quaternion.clone() : null,
      rHandSitQ: handRigs.R ? handRigs.R.hand.quaternion.clone() : null,
      phase: _rnd(rngHolder) * Math.PI * 2, breathPeriod: 3.2 + _rnd(rngHolder) * 1.6,
      headTargetYaw: 0, headCurYaw: 0, headNextShiftT: _rnd(rngHolder) * 4,
      blinkTargets,
      blinkNextT: 2 + _rnd(rngHolder) * 4, blinkUntilT: -1,
      t: 0,
      fingerStanceBlend: fingerStance,
      pelvisRise, standY, seatSurfaceY,
      seatPelvisLift,
      standStep,
      seatMarkX: seatDef && seatDef.pos ? seatDef.pos[0] : model.position.x,
      seatMarkZ: seatDef && seatDef.pos ? seatDef.pos[2] : model.position.z,
      standFwdX: Math.sin(model.rotation.y),
      standFwdZ: Math.cos(model.rotation.y),
      model,
      lThigh, rThigh, lCalf, rCalf,
      lThighRestQuat: lThigh ? lThigh.quaternion.clone() : null,
      rThighRestQuat: rThigh ? rThigh.quaternion.clone() : null,
      lCalfRestQuat: lCalf ? lCalf.quaternion.clone() : null,
      rCalfRestQuat: rCalf ? rCalf.quaternion.clone() : null,
      defaultStance,
      stanceTarget: this._roomStance || defaultStance,
      stanceBlend: (this._roomStance || defaultStance) === 'sit' ? 1 : 0, // 0 = standing, 1 = sitting
    });
  }

  setMotionSpeed(v) {
    this._motionSpeed = THREE.MathUtils.clamp(v, 0, 1);
  }

  _animateIdle(dt) {
    const effDt = dt * this._motionSpeed;
    for (const s of this._animStates) {
      s.t += effDt;
      if (s.spineBone) {
        const angle = THREE.MathUtils.degToRad(1.5) * Math.sin((s.t / s.breathPeriod) * Math.PI * 2 + s.phase);
        _scratchQuat.setFromAxisAngle(s.spinePitchAxis || _AXIS_X, angle);
        if (s.spinePitchAxis) s.spineBone.quaternion.copy(_scratchQuat).multiply(s.spineRestQuat);
        else s.spineBone.quaternion.copy(s.spineRestQuat).multiply(_scratchQuat);
      }
      if (s.headBone) {
        if (s.t >= s.headNextShiftT) {
          s.headTargetYaw = THREE.MathUtils.degToRad(-12 + _rnd(s) * 24);
          s.headNextShiftT = s.t + 3 + _rnd(s) * 4;
        }
        s.headCurYaw = THREE.MathUtils.lerp(s.headCurYaw, s.headTargetYaw, Math.min(1, effDt * 1.2));
        _scratchQuat.setFromAxisAngle(s.headYawAxis || _AXIS_Y, s.headCurYaw);
        if (s.headYawAxis) s.headBone.quaternion.copy(_scratchQuat).multiply(s.headRestQuat);
        else s.headBone.quaternion.copy(s.headRestQuat).multiply(_scratchQuat);
      }
      if (s.blinkTargets && s.blinkTargets.length) {
        if (s.blinkUntilT < 0 && s.t >= s.blinkNextT) s.blinkUntilT = s.t + 0.14;
        if (s.blinkUntilT >= 0) {
          const closing = s.t < s.blinkUntilT;
          const v = closing ? 1.0 : 0.0;
          for (const bt of s.blinkTargets) {
            if (!bt.mesh.morphTargetInfluences) continue;
            if (bt.l >= 0) bt.mesh.morphTargetInfluences[bt.l] = v;
            if (bt.r >= 0) bt.mesh.morphTargetInfluences[bt.r] = v;
          }
          if (!closing) {
            s.blinkUntilT = -1;
            s.blinkNextT = s.t + 2.2 + _rnd(s) * 6.2;
          }
        }
      }
    }
  }

  _animateLife(dt) {
    const effDt = dt * this._motionSpeed;
    const TAU = Math.PI * 2;
    const D2R = Math.PI / 180;
    for (let i = 0; i < this._animStates.length; i++) {
      const s = this._animStates[i];
      const L = s.life;
      if (!L) continue;
      s.lt += effDt;
      const t = s.lt;

      if (effDt > 0 && t >= s.evtNextT) {
        const r = _rnd(s);
        s.evtType = r < 0.45 ? 0 : (r < 0.8 ? 1 : 2);
        s.evtT = 0;
        s.evtDur = 1.4 + _rnd(s) * 2.2;
        s.evtAmp = (_rnd(s) * 2 - 1);
        s.evtNextT = t + 9 + _rnd(s) * 16;
      }
      let evGlance = 0, evLean = 0, evRoll = 0;
      if (s.evtType >= 0 && s.evtT < s.evtDur) {
        s.evtT += effDt;
        const w = Math.sin(Math.PI * Math.min(1, s.evtT / s.evtDur));
        if (s.evtType === 0) evGlance = w * s.evtAmp * 7;        // a slow look aside and back
        else if (s.evtType === 1) { evLean = w * s.evtAmp * 2.2; evGlance = w * s.evtAmp * 2; } // posture reset
        else { evRoll = w * s.evtAmp * 2.6; evLean = w * Math.abs(s.evtAmp) * 1.2; }            // shift in the chair
        if (s.evtT >= s.evtDur) s.evtType = -1;
      }

      if (s.spineBone) {
        if (s.spinePitchAxis) {
          const a = (L.swayAmp * Math.sin((t / L.swayPeriod) * TAU + L.swayPhase) + evLean) * D2R;
          _lifeQuat.setFromAxisAngle(s.spinePitchAxis, a);
          s.spineBone.quaternion.premultiply(_lifeQuat);
        }
        if (s.spineRollAxis) {
          const a = (L.rollAmp * Math.sin((t / L.rollPeriod) * TAU + L.rollPhase) + evRoll) * D2R;
          _lifeQuat.setFromAxisAngle(s.spineRollAxis, a);
          s.spineBone.quaternion.premultiply(_lifeQuat);
        }
      }

      if (s.headBone) {
        if (s.headYawAxis) {
          let d = L.driftAmp * Math.sin((t / L.driftPeriod) * TAU + L.driftPhase) + evGlance;
          const curDeg = s.headCurYaw * 57.29577951308232;
          if (curDeg + d > 38) d = 38 - curDeg;
          else if (curDeg + d < -38) d = -38 - curDeg;
          _lifeQuat.setFromAxisAngle(s.headYawAxis, d * D2R);
          s.headBone.quaternion.premultiply(_lifeQuat);
        }
        if (s.headPitchAxis) {
          const a = (L.nodAmp * Math.sin((t / L.nodPeriod) * TAU + L.nodPhase)) * D2R;
          _lifeQuat.setFromAxisAngle(s.headPitchAxis, a);
          s.headBone.quaternion.premultiply(_lifeQuat);
        }
      }

      const SURFACE_SETTLE_SCALE = 0.2;
      if (s.lHand && s.lHandAxis && s.lHandRest && !s.lHandPinned) {
        const amp = s.lHandOnSurface ? L.handAmp * SURFACE_SETTLE_SCALE : L.handAmp;
        const a = amp * Math.sin((t / L.handPeriod) * TAU + L.handPhase) * D2R;
        _lifeQuat.setFromAxisAngle(s.lHandAxis, a);
        s.lHand.quaternion.copy(s.lHandRest).premultiply(_lifeQuat);
      }
      if (s.rHand && s.rHandAxis && s.rHandRest && !s.rHandPinned) {
        const ampR = (s.rHandOnSurface ? L.handAmp * SURFACE_SETTLE_SCALE : L.handAmp) * 0.85;
        const a = ampR * Math.sin((t / (L.handPeriod * 1.17)) * TAU + L.handPhase2) * D2R;
        _lifeQuat.setFromAxisAngle(s.rHandAxis, a);
        s.rHand.quaternion.copy(s.rHandRest).premultiply(_lifeQuat);
      }
    }
  }

  _clampGavelToBlock() {
    const blk = this._soundBlockTop;
    if (!blk) return;
    if (this._gavelRefGen !== this._venueGen) {
      this._gavelRefGen = this._venueGen;
      this._gavelHeadRef = null;
      this._gavelGroupRef = null;
    }
    const head = this._gavelHeadRef
      || (this._gavelHeadRef = this.scene.getObjectByName('GavelHead') || null);
    if (!head || !head.parent) return;
    const grp = this._gavelGroupRef
      || (this._gavelGroupRef = this.scene.getObjectByName('Gavel') || null);
    if (!grp || !grp.parent) return;
    if (!grp.userData.__gripPos) grp.userData.__gripPos = grp.position.clone();
    grp.position.copy(grp.userData.__gripPos);
    grp.updateMatrixWorld(true);
    head.updateWorldMatrix(true, false);
    _gvC.setFromMatrixPosition(head.matrixWorld);
    const dx = _gvC.x - blk.x, dz = _gvC.z - blk.z;
    if (dx * dx + dz * dz > 0.085 * 0.085) return;
    _gvA.set(0, 1, 0).applyQuaternion(head.getWorldQuaternion(_gvQ)).normalize();
    const ay = Math.min(1, Math.abs(_gvA.y));
    const lowest = _gvC.y - (0.0500 * ay + 0.0335 * Math.sqrt(Math.max(0, 1 - ay * ay)));
    const pen = blk.y - lowest;
    if (pen <= 0.0005) return;
    _gvS.setFromMatrixScale(grp.parent.matrixWorld);
    _gvU.set(0, pen, 0).applyQuaternion(grp.parent.getWorldQuaternion(_gvQ).invert());
    grp.position.x += _gvU.x / (_gvS.x || 1);
    grp.position.y += _gvU.y / (_gvS.y || 1);
    grp.position.z += _gvU.z / (_gvS.z || 1);
    grp.updateMatrixWorld(true);
    this._gavelClampFrames = (this._gavelClampFrames || 0) + 1;
    this._gavelClampMax = Math.max(this._gavelClampMax || 0, pen);
    if (this._gavelClampFrames === 1 || this._gavelClampFrames % 600 === 0) {
      console.log('[courtsim] gavel_block_CLAMPED frames=', this._gavelClampFrames,
        'this_frame_m=', pen.toFixed(4), 'max_seen_m=', this._gavelClampMax.toFixed(4),
        '-- COURTSIM-SURFACES-014: the gavel would have entered its sound block',
        'and was lifted back onto it. A large max here means',
        'GAVEL_WRIST_ABOVE_WORKTOP needs raising, not that the clamp is wrong.');
    }
  }

  _animateContactPins() {
    const states = this._animStates;
    const staged = this._staged;
    let busyArms = null;
    if (staged && staged.runs && staged.runs.length) {
      busyArms = new Set();
      for (const r of staged.runs) busyArms.add(r.up);
    }
    for (let i = 0; i < states.length; i++) {
      const s = states[i];
      const pins = s.contactPins;
      if (!pins) continue;
      if (s.stanceBlend < 0.995) continue;
      const model = s.model;
      const L = s.life;
      const yaw = L
        ? (L.handAmp * 0.55) * Math.sin((s.lt / (L.handPeriod * 1.31)) + L.handPhase) * (Math.PI / 180)
        : 0;
      for (let k = 0; k < pins.length; k++) {
        const p = pins[k];
        if (busyArms && busyArms.has(p.up)) continue;   // a staged event owns this arm
        if (p.gavel && this._interject && this._interject.armBusy) continue;
        p.up.updateWorldMatrix(true, false);
        _pinS.setFromMatrixPosition(p.up.matrixWorld);
        _pinT.copy(p.local).applyMatrix4(model.matrixWorld);
        _pinU.copy(_pinT).sub(_pinS);
        let d = _pinU.length();
        if (d < 1e-6) continue;
        _pinU.multiplyScalar(1 / d);
        const dMax = (p.A1 + p.A2) * 0.995;
        const dMin = Math.abs(p.A1 - p.A2) + 1e-3;
        if (d > dMax) d = dMax; else if (d < dMin) d = dMin;
        model.getWorldQuaternion(_pinMQ);
        _pinP.copy(p.poleLocal).applyQuaternion(_pinMQ);
        _pinP.addScaledVector(_pinU, -_pinP.dot(_pinU));
        if (_pinP.lengthSq() < 1e-9) {
          _pinP.set(0, -1, 0);
          _pinP.addScaledVector(_pinU, -_pinP.dot(_pinU));
        }
        _pinP.normalize();
        let cosA = (p.A1 * p.A1 + d * d - p.A2 * p.A2) / (2 * p.A1 * d);
        if (cosA > 1) cosA = 1; else if (cosA < -1) cosA = -1;
        const al = Math.acos(cosA);
        _pinE.copy(_pinS)
          .addScaledVector(_pinU, p.A1 * Math.cos(al))
          .addScaledVector(_pinP, p.A1 * Math.sin(al));
        p.up.parent.getWorldQuaternion(_pinPQ);
        _pinUW.copy(_pinPQ).multiply(p.upLocalRest);
        _pinD.copy(p.foOff).applyQuaternion(_pinUW);
        _pinD2.copy(_pinE).sub(_pinS).normalize();
        _pinQ.setFromUnitVectors(_pinD, _pinD2);
        _pinUW.premultiply(_pinQ);
        _pinInv.copy(_pinPQ).invert();
        p.up.quaternion.copy(_pinInv).multiply(_pinUW);
        _pinFW.copy(_pinUW).multiply(p.foLocalRest);
        _pinD.copy(p.haOff).applyQuaternion(_pinFW);
        _pinD2.copy(_pinT).sub(_pinE).normalize();
        _pinQ.setFromUnitVectors(_pinD, _pinD2);
        _pinFW.premultiply(_pinQ);
        _pinInv.copy(_pinUW).invert();
        p.fo.quaternion.copy(_pinInv).multiply(_pinFW);
        _pinInv.copy(_pinFW).invert();
        if (yaw) {
          _pinQ.setFromAxisAngle(_AXIS_Y_PIN, yaw);
          p.ha.quaternion.copy(_pinInv).multiply(_pinQ).multiply(p.wq);
        } else {
          p.ha.quaternion.copy(_pinInv).multiply(p.wq);
        }
      }
    }
  }

  getSeatContactReport() {
    const out = { frames: this.profiler ? this.profiler.frames || 0 : 0, seats: [] };
    for (const s of this._animStates || []) {
      if (!s.model || s.defaultStance !== 'sit') continue;
      const pelvis = s.model.getObjectByName('Bip01_Pelvis') || s.model.getObjectByName('Bip01 Pelvis');
      if (!pelvis) { out.seats.push({ role: s.role, err: 'no pelvis bone' }); continue; }
      s.model.updateWorldMatrix(true, false);
      s.model.updateMatrixWorld(true);
      const drop = this._lowestInPelvisColumn(s.model, pelvis);
      if (drop == null) { out.seats.push({ role: s.role, err: 'no vertices in column' }); continue; }
      const pelvisY = pelvis.getWorldPosition(new THREE.Vector3()).y;
      const lowY = pelvisY - drop;
      const seatTop = this._seatTopUnder(s.seatMarkX, s.seatMarkZ, s.seatSurfaceY);
      out.seats.push({
        role: s.role,
        blend: +s.stanceBlend.toFixed(3),
        seat_top_y: +seatTop.toFixed(4),
        lowest_y: +lowY.toFixed(4),
        penetration_mm: +((seatTop - lowY) * 1000).toFixed(1),
        lift_used_m: +(s.seatPelvisLift != null ? s.seatPelvisLift : SEAT_PELVIS_LIFT).toFixed(4),
        surface: this._lastSeatSurfaceName || 'nominal',
      });
    }
    return out;
  }

  getChairArmReport() {
    const out = { frames: this.profiler ? this.profiler.frames || 0 : 0, hands: [] };
    const v = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    for (const s of this._animStates || []) {
      if (!s.model || !s.chair) continue;
      const solids = s.chair.children.filter(
        (c) => c.name === 'ChairArm' || c.name === 'ChairArmNose');
      if (!solids.length) continue;
      s.chair.updateMatrixWorld(true);
      s.model.updateWorldMatrix(true, false);
      s.model.updateMatrixWorld(true);
      for (const sd of ['L', 'R']) {
        const per = [];
        for (const fk of ['0', '1', '2', '3', '4']) {
          const tb = s.model.getObjectByName('Bip01_' + sd + '_Finger' + fk + '2')
            || s.model.getObjectByName('Bip01 ' + sd + ' Finger' + fk + '2');
          if (!tb) continue;
          tb.getWorldPosition(v);
          let best = Infinity;
          for (const so of solids) {
            const lp = v.clone().applyMatrix4(inv.copy(so.matrixWorld).invert());
            const ws = so.getWorldScale(new THREE.Vector3());
            let d;
            if (so.name === 'ChairArmNose') {
              const r = lp.length();
              const dir = lp.clone().multiplyScalar(1 / Math.max(r, 1e-9));
              d = (r - 1) * dir.multiply(ws).length();
            } else {
              if (!so.geometry.boundingBox) so.geometry.computeBoundingBox();
              const bb = so.geometry.boundingBox;
              const ox = Math.max(bb.min.x - lp.x, lp.x - bb.max.x);
              const oy = Math.max(bb.min.y - lp.y, lp.y - bb.max.y);
              const oz = Math.max(bb.min.z - lp.z, lp.z - bb.max.z);
              d = (ox <= 0 && oy <= 0 && oz <= 0)
                ? Math.max(ox * ws.x, oy * ws.y, oz * ws.z)
                : Math.hypot(Math.max(ox, 0) * ws.x, Math.max(oy, 0) * ws.y,
                  Math.max(oz, 0) * ws.z);
            }
            if (d < best) best = d;
          }
          if (Number.isFinite(best)) per.push({ f: fk, mm: +(best * 1000).toFixed(1) });
        }
        if (!per.length) continue;
        const worstIn = Math.min.apply(null, per.map((p) => p.mm));
        const worstOut = Math.max.apply(null, per.map((p) => p.mm));
        out.hands.push({
          role: s.role, side: sd, chair: s.chair.name,
          per: per.map((p) => 'F' + p.f + ':' + p.mm).join(' '),
          worst_inside_mm: worstIn < 0 ? +(-worstIn).toFixed(1) : 0,
          worst_gap_mm: +worstOut.toFixed(1),
          resting_on_arm: sd === 'L' ? !!s.lHandPinned : !!s.rHandPinned,
        });
      }
    }
    return out;
  }

  getContactPinReport() {
    const out = [];
    for (const s of this._animStates) {
      if (!s.contactPins) continue;
      for (const p of s.contactPins) {
        const verts = this._collectHandVertices(s.model, p.side);
        const low = verts ? this._lowestVertexY(s.model, verts) : null;
        out.push({
          role: s.role, side: p.side, rests_on: p.what,
          support_top_y: +p.supportY.toFixed(4),
          lowest_hand_vertex_y: low == null ? null : +low.toFixed(4),
          penetration_mm: low == null ? null : +((p.supportY - low) * 1000).toFixed(2),
          seated: s.stanceBlend >= 0.995,
        });
      }
    }
    return out;
  }

  getIdleLifeSnapshot() {
    const out = {};
    for (const s of this._animStates) {
      if (!s.life) continue;
      out[s.role || 'unknown'] = {
        seed: s.seatSeed,
        breath_period_s: +s.breathPeriod.toFixed(3),
        sway_period_s: +s.life.swayPeriod.toFixed(3),
        roll_period_s: +s.life.rollPeriod.toFixed(3),
        nod_period_s: +s.life.nodPeriod.toFixed(3),
        drift_period_s: +s.life.driftPeriod.toFixed(3),
        hand_period_s: +s.life.handPeriod.toFixed(3),
        clock_s: +s.lt.toFixed(2),
        next_discrete_event_s: +s.evtNextT.toFixed(2),
        axes_resolved: {
          spine_pitch: !!s.spinePitchAxis, spine_roll: !!s.spineRollAxis,
          head_yaw: !!s.headYawAxis, head_pitch: !!s.headPitchAxis,
          hand_l: !!s.lHandAxis, hand_r: !!s.rHandAxis,
        },
      };
    }
    return out;
  }

  handleStandingCue(text) {
    if (!text) return;
    const lower = text.toLowerCase();
    if (/\ball rise\b/.test(lower)) {
      this._riseAll();
    } else if (/\bbe seated\b/.test(lower) || /\byou may sit\b/.test(lower)) {
      this._seatAll();
    }
    try {
      this.handleProceedingCue(text, this._activeSeatKey);
    } catch (err) {
      console.error('[courtsim] staged events threw out of handleStandingCue;'
        + ' the line still plays:', err);
    }
  }

  _riseAll() {
    this._stanceTransitioning = true;
    this._stanceElapsed = 0;
    this._roomStance = 'stand';
    for (const s of this._animStates) s.stanceTarget = 'stand';
  }

  _seatAll() {
    this._stanceTransitioning = true;
    this._stanceElapsed = 0;
    this._roomStance = null;   // back to each role's own default -- see _riseAll
    for (const s of this._animStates) s.stanceTarget = s.defaultStance;
  }

  resetStances(instant = true) {
    return this.resetStance(instant);
  }

  resetStance(instant = true) {
    this._roomStance = null;
    for (const s of this._animStates) {
      s.stanceTarget = s.defaultStance;
      if (instant) {
        s.stanceBlend = s.defaultStance === 'sit' ? 1 : 0;
        s._stanceBlendAtTransitionStart = null;
        s._lastAppliedBlend = null;
      }
    }
    if (instant) {
      this._stanceTransitioning = false;
      this._stanceElapsed = 0;
    } else {
      this._stanceTransitioning = true;
      this._stanceElapsed = 0;
    }
    this.resetStagedEvents();
    console.log('[courtsim] stance_reset instant=', instant,
      'avatars=', this._animStates.length,
      '-- COURTSIM-FIX-W DEFECT W-9. Every seat is back on its own',
      'DEFAULT_STANCE; only the bailiff should still be standing.');
  }


  _stagedState() {
    if (!this._staged) {
      let density = 2;
      if (typeof window !== 'undefined' && window.__courtsimParentheticalDensity != null) {
        density = Math.max(0, Math.min(2, Number(window.__courtsimParentheticalDensity) || 0));
      }
      this._staged = {
        matcher: null, log: [], runs: [], audioHook: null,
        density, deposition: null, lastCueText: '',
      };
      console.log('[courtsim] staged_events_INIT density=', density,
        '(0 = recess/oath/read-back/record only, 1 = + exhibits, 2 = + sidebar)',
        '-- COURTSIM-EVENTS-030.');
    }
    return this._staged;
  }

  setStageAudioHook(fn) {
    const st = this._stagedState();
    st.audioHook = (typeof fn === 'function') ? fn : null;
    console.log('[courtsim] stage_audio_hook', st.audioHook ? 'INSTALLED' : 'CLEARED',
      '-- staged events can now make sound.');
    return !!st.audioHook;
  }

  _stageAudio(kind, ev) {
    const st = this._stagedState();
    if (st.audioHook) {
      try { st.audioHook(kind, ev); return true; }
      catch (err) { console.warn('[courtsim] stage audio hook threw:', err); }
    }
    if (!st._audioWarned) {
      st._audioWarned = true;
      console.warn('[courtsim] STAGED EVENTS ARE SILENT. No audio hook is installed, so the'
        + ' recess gavel and the exhibit handling are VISUAL ONLY. main.js: call'
        + ' scene.setStageAudioHook((kind) => { if (kind === "gavel") strikeGavel("staged"); })'
        + ' -- see reports/COURTSIM_EVENTS_030.md.');
    }
    return false;
  }

  _setStatusFor(text, ttlMs) {
    const st = this._stagedState();
    this.setReporterScreenStatus(text);
    st.statusText = text;
    st.statusGen = (st.statusGen || 0) + 1;
    const gen = st.statusGen;
    const vg = this._venueGen;
    setTimeout(() => {
      const s2 = this._staged;
      if (!s2 || s2.statusGen !== gen || this._venueGen !== vg) return;
      if (s2.statusText !== text) return;
      this.setReporterScreenStatus('');
      s2.statusText = '';
    }, ttlMs);
  }

  _clearStatus() {
    const st = this._stagedState();
    st.statusGen = (st.statusGen || 0) + 1;   // invalidate any pending TTL
    st.statusText = '';
    this.setReporterScreenStatus('');
  }

  setParentheticalDensity(n) {
    const st = this._stagedState();
    const next = Math.max(0, Math.min(2, Number(n) || 0));
    if (next === st.density) return next;
    st.density = next;
    st.matcher = null;   // rebuilt on the next cue at the new density
    console.log('[courtsim] parenthetical_density=', next,
      '(0 = recess/oath/readback/record only, 1 = + exhibits, 2 = + sidebar and counsel conferring)');
    return next;
  }

  _stagedMatcher() {
    const st = this._stagedState();
    const isDepo = !!(this.venue && this.venue.type === 'deposition');
    if (!st.matcher || st.deposition !== isDepo) {
      st.matcher = createEventMatcher({ deposition: isDepo, maxDensity: st.density });
      st.deposition = isDepo;
    }
    return st.matcher;
  }

  resetStagedEvents() {
    const st = this._stagedState();
    st.matcher = null;
    st.log = [];
    for (const r of st.runs) this._endArmRaise(r, true);
    st.runs = [];
    st.oathRun = null;
    this._setExhibitHeld(false, null);
    this._clearStatus();
    console.log('[courtsim] staged_events_reset -- COURTSIM-EVENTS-030.');
  }

  _cueLeadMs(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.min(8000, Math.round((words / 160) * 60000));
  }

  handleProceedingCue(text, seatKey) {
    if (!text) return [];
    const st = this._stagedState();
    const seat = seatKey || this._activeSeatKey || null;
    if (st && st.oathRun && st.runs.indexOf(st.oathRun) !== -1) {
      const run = st.oathRun;
      run.linesSince = (run.linesSince || 0) + 1;
      const answered = /\b(i\s+(do|will|swear|affirm)|so\s+help\s+me)\b/i.test(text);
      const witnessSpoke = seat === this._witnessSeatKey();
      if (run.linesSince >= 2 || answered || witnessSpoke) {
        run.holdMs = Math.max(0, run.t - run.raiseMs);
        st.oathRun = null;
        console.log('[courtsim] oath_hand_RELEASED after_lines=', run.linesSince,
          'held_ms=', run.holdMs.toFixed(0), 'answered_phrase=', answered,
          'witness_spoke=', witnessSpoke,
          '-- COURTSIM-SEATED-047 item 7: the hand stays up until the oath is',
          'done rather than for a fixed 3.4 s.');
      }
    }
    let events = [];
    try {
      events = this._stagedMatcher().feed(text, { isCourt: seat === 'THE COURT' });
    } catch (err) {
      console.warn('[courtsim] staged-event matcher threw; the line still plays:', err);
      return [];
    }
    for (const ev of events) {
      const rec = {
        ...ev,
        seat,
        atMs: performance.now(),
        observability: null,
      };
      try {
        rec.observability = this._stageEvent(ev, seat, text) || null;
        rec.text = ev.text;
      } catch (err) {
        console.error('[courtsim] staging', ev.id, 'threw -- the parenthetical is still logged'
          + ' so the run is not silently short an event:', err);
        rec.observability = { staged: false, error: String(err && err.message || err) };
      }
      st.log.push(rec);
      console.log('[courtsim] STAGED_EVENT', ev.id,
        ev.text ? JSON.stringify(ev.text) : '(no parenthetical -- see the catalogue)',
        'seat=', seat, 'obs=', JSON.stringify(rec.observability));
    }
    return events;
  }

  _stageEvent(ev, seat, cueText) {
    const lead = this._cueLeadMs(cueText);
    switch (ev.stage) {
      case 'recess':          return this._stageRecess(lead);
      case 'back_on_record':  return this._stageBackOnRecord();
      case 'witness_sworn':   return this._stageOath();
      case 'exhibit_marked':  return this._stageExhibit(ev, lead, 'marked');
      case 'exhibit_received':return this._stageExhibit(ev, lead, 'received');
      case 'record_read':     return this._stageRecordRead(lead);
      case 'off_record':      return this._stageOffRecord(lead);
      case 'sidebar':         return this._stageSidebar(lead);
      case 'concluded':       return this._stageConcluded(ev, lead);
      case 'heading':         return { staged: false, sees: 'nothing -- a heading is typed, not performed',
        hears: 'the handoff line itself ("Cross-examination, Mr. Delacroix")', atMs: 0 };
      default:                return { staged: false, reason: 'no staging for ' + ev.stage };
    }
  }

  _stageRecess(lead) {
    const hasJudge = !!(this.seatGroups && this.seatGroups['THE COURT']);
    this._delay(lead, () => {
      if (hasJudge) {
        this.judgeInterject({ lookAt: 'reporter' }).then(() => {
          this._stageAudio('gavel', { id: 'recess' });
        });
      }
      this._setStatusFor('IN RECESS', 90000);
    });
    return {
      staged: true,
      sees: hasJudge
        ? 'the judge lifts the gavel 26 deg off its block and brings it down, then turns to face him,'
          + ' and IN RECESS appears on his own screen. The room standing is the existing "All rise"'
          + ' cue, one or two lines either side of this one.'
        : 'IN RECESS on his screen (no judge in a deposition, so no gavel)',
      hears: 'the gavel, IF main.js has installed the stage audio hook',
      atMs: lead,
      leadIsEstimated: true,
    };
  }

  _stageBackOnRecord() {
    this._seatAll();
    this._clearStatus();
    return {
      staged: true,
      sees: 'the room sits back down over the 1.1 s stance blend; the bailiff stays standing',
      hears: 'nothing -- the return to the record is announced in speech, which is why the'
        + ' catalogue gives it no parenthetical',
      atMs: 0,
    };
  }

  _stageOath() {
    const seat = this._witnessSeatKey();
    const run = this._beginArmRaise(seat, {
      side: 'R', foreAim: [0, 1, 0], upperAim: null,
      raiseMs: 520, holdMs: 25000, lowerMs: 620, tag: 'oath',
    });
    if (run) {
      run.linesSince = 0;
      this._stagedState().oathRun = run;
    }
    return {
      staged: !!run,
      sees: run
        ? `${seat} raises the right hand to ${run.measured.handRiseM.toFixed(3)} m above its rest`
          + ' height and HOLDS it until the oath is answered (released by the next'
          + ' witness line or affirmation; 25 s backstop)'
        : 'nothing -- the witness rig has no right arm bones on this avatar',
      hears: 'the clerk reading the oath (already in the content)',
      atMs: 0,
      measured: run ? run.measured : null,
    };
  }

  _witnessSeatKey() { return 'THE WITNESS'; }

  _stageExhibit(ev, lead, phase) {
    const num = ev.number || '?';
    const ok = this._setExhibitSticker(phase === 'received' ? 'received' : 'marked', num);
    const common = {
      hears: phase === 'received'
        ? 'the court admitting it and the clerk entering it -- both already in the content, and'
          + ' this is the cue he will actually work from'
        : 'counsel asking for it to be marked and the clerk confirming the number and the'
          + ' description -- both already in the content, and this is the cue he will actually'
          + ' work from',
      atMs: 0,
      notObservableFromReporterSeat: 'the sticker is 0.105 m across and about 4 m from his'
        + ' chair. He can see it if he takes the Counsel Table A view; he cannot read it from'
        + ' his own seat, and this lane does not pretend otherwise.',
      notStaged: 'NOBODY HANDS THE EXHIBIT TO ANYBODY. Measured and rejected on the render --'
        + ' see the comment above for the 1.85 m the folder travelled.',
    };
    if (phase === 'received') {
      return {
        ...common, staged: ok ? 'partial' : false,
        sees: ok
          ? 'the exhibit sticker on counsel table A turns from marking yellow to in-evidence blue'
          : 'nothing -- there is no exhibit prop in this venue',
      };
    }
    return {
      ...common, staged: ok ? 'partial' : false,
      sees: ok
        ? `a yellow exhibit sticker appears on the face of the exhibit folder on counsel table A`
        : 'nothing -- there is no exhibit prop in this venue',
    };
  }

  _stageRecordRead(lead) {
    this._delay(lead, () => this._setStatusFor('READ BACK', 6000));
    return {
      staged: true,
      sees: 'READ BACK appears on the reporter\'s own screen in the room',
      hears: 'the read-back itself is driven by readback.js, which already gavels and '
        + 'speaks the judge -- this lane adds the screen state, not the audio',
      atMs: lead,
      leadIsEstimated: true,
    };
  }

  _stageOffRecord(lead) {
    this._delay(lead, () => {
      this._setStatusFor('OFF THE RECORD', 30000);
      this.clearActiveSpeaker();
    });
    return {
      staged: true,
      sees: 'every talk light in the room fades out over the ramp, and OFF THE RECORD '
        + 'appears on the reporter\'s screen',
      hears: 'the request itself; the room does not then fall silent, because the next '
        + 'line plays on schedule -- see the report\'s honest limits',
      atMs: lead,
      leadIsEstimated: true,
    };
  }

  _stageSidebar(lead) {
    const hasJudge = !!(this.seatGroups && this.seatGroups['THE COURT']);
    this._delay(lead, () => {
      this._setStatusFor('SIDEBAR', 30000);
      this.clearActiveSpeaker();
      if (hasJudge) this.judgeInterject({ lookAt: [-2.0, 1.4, 0.6], strike: false, holdMs: 3200 });
    });
    return {
      staged: 'partial',
      sees: 'SIDEBAR on the reporter\'s screen, the talk lights out, and the judge turning '
        + 'toward counsel table A and holding it for 3.2 s',
      hears: 'the request and the court\'s answer (already in the content)',
      atMs: lead,
      leadIsEstimated: true,
      notStaged: 'COUNSEL DO NOT WALK TO THE BENCH. This build has no locomotion at all. '
        + 'The turn and the record stopping are real; the approach is not staged.',
    };
  }

  _stageConcluded(ev, lead) {
    const now = new Date();
    let h = now.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    const mm = String(now.getMinutes()).padStart(2, '0');
    const stamp = `${h}:${mm} ${ampm}`;
    ev.text = String(ev.text || '').replace('H:MM AM', stamp).replace('H:MM PM.', stamp + '.');
    this._delay(lead, () => this._setStatusFor('ADJOURNED ' + stamp, 120000));
    return {
      staged: true,
      sees: 'the wall clock reads ' + stamp + ' -- the same time the parenthetical wants, on '
        + 'a clock with real hands he has to read',
      hears: 'the court adjourning (already in the content)',
      atMs: lead,
      clockReading: stamp,
    };
  }

  _delay(ms, fn) {
    const gen = this._venueGen;
    if (ms <= 16) { fn(); return; }
    setTimeout(() => { if (this._venueGen === gen) fn(); }, ms);
  }

  _beginArmRaise(seatKey, opts = {}) {
    const group = this.seatGroups && this.seatGroups[seatKey];
    if (!group || !group.model) {
      console.warn('[courtsim] arm_raise_NO_SEAT', seatKey,
        '-- nobody is loaded in that chair, so there is no arm to raise.');
      return null;
    }
    const model = group.model;
    const st = this._animStates.find((s) => s.model === model);
    if (!st) return null;
    const side = opts.side === 'L' ? 'L' : 'R';
    const findB = (n) => model.getObjectByName(`Bip01_${side}_${n}`) || model.getObjectByName(`Bip01 ${side} ${n}`);
    const up = findB('UpperArm');
    const fo = findB('Forearm');
    const hand = findB('Hand');
    if (!up || !fo || !hand) {
      console.error('[courtsim] arm_raise_NO_BONES seat=', seatKey, 'side=', side,
        'upperarm=', !!up, 'forearm=', !!fo, 'hand=', !!hand,
        '-- reported rather than faked. Without all three there is no arm to aim.');
      return null;
    }
    const sState = this._stagedState();
    for (const r of sState.runs.slice()) {
      if (r.up === up) this._endArmRaise(r, true);
    }

    const run = {
      tag: opts.tag || 'raise', seatKey, side, model, st, up, fo, hand,
      foreAim: opts.foreAim ? new THREE.Vector3(...opts.foreAim).normalize() : new THREE.Vector3(0, 1, 0),
      upperAim: opts.upperAim ? new THREE.Vector3(...opts.upperAim).normalize() : null,
      raiseMs: opts.raiseMs == null ? 500 : opts.raiseMs,
      holdMs: opts.holdMs == null ? 2400 : opts.holdMs,
      lowerMs: opts.lowerMs == null ? 620 : opts.lowerMs,
      t: 0,
      baseU: up.quaternion.clone(),
      baseF: fo.quaternion.clone(),
      lastSeenBlend: st._lastAppliedBlend,
      venueGen: this._venueGen,
    };

    const readY = (b) => { b.updateWorldMatrix(true, false); return b.matrixWorld.elements[13]; };
    model.updateWorldMatrix(true, true);
    const restWrist = readY(hand);
    const headBone = model.getObjectByName('Bip01_Head') || model.getObjectByName('Bip01 Head');
    const headY = headBone ? readY(headBone) : null;
    this._applyArmRaise(run, 1);
    model.updateWorldMatrix(true, true);
    const topWrist = readY(hand);
    const geom = this._armGeometry(run);
    this._applyArmRaise(run, 0);
    model.updateWorldMatrix(true, true);
    run.measured = {
      restWristY: +restWrist.toFixed(4), raisedWristY: +topWrist.toFixed(4),
      handRiseM: +(topWrist - restWrist).toFixed(4),
      headY: headY == null ? null : +headY.toFixed(4),
      wristBelowHeadM: headY == null ? null : +(headY - topWrist).toFixed(4),
      forearmAboveHorizDeg: geom.forearmAboveHorizDeg,
      upperArmAboveHorizDeg: geom.upperArmAboveHorizDeg,
      elbowAngleDeg: geom.elbowAngleDeg,
    };
    console.log('[courtsim] arm_raise_START seat=', seatKey, 'tag=', run.tag,
      JSON.stringify(run.measured),
      '-- forearmAboveHorizDeg near 90 is a raised hand; near 0 is a person',
      'pointing at something. COURTSIM-EVENTS-030.');

    sState.runs.push(run);
    return run;
  }

  _armGeometry(run) {
    const { up, fo, hand, model } = run;
    model.updateWorldMatrix(true, true);
    const P = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
    const S = P(up), E = P(fo), H = P(hand);
    const u = E.clone().sub(S); const f = H.clone().sub(E);
    if (u.lengthSq() < 1e-9 || f.lengthSq() < 1e-9) {
      return { forearmAboveHorizDeg: null, upperArmAboveHorizDeg: null, elbowAngleDeg: null };
    }
    u.normalize(); f.normalize();
    return {
      upperArmAboveHorizDeg: +(Math.asin(THREE.MathUtils.clamp(u.y, -1, 1)) * 180 / Math.PI).toFixed(1),
      forearmAboveHorizDeg: +(Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)) * 180 / Math.PI).toFixed(1),
      elbowAngleDeg: +(180 - Math.acos(THREE.MathUtils.clamp(u.dot(f), -1, 1)) * 180 / Math.PI).toFixed(1),
    };
  }

  _aimBone(bone, base, fromDir, toDir, k) {
    bone.quaternion.copy(base);
    if (k <= 1e-5) return;
    if (fromDir.lengthSq() < 1e-9 || toDir.lengthSq() < 1e-9) return;
    const qWorld = new THREE.Quaternion().setFromUnitVectors(
      fromDir.clone().normalize(), toDir.clone().normalize());
    if (k < 1) qWorld.slerp(new THREE.Quaternion(), 1 - k);
    const parent = bone.parent;
    if (parent) {
      const P = parent.getWorldQuaternion(new THREE.Quaternion());
      const Pinv = P.clone().invert();
      qWorld.copy(Pinv.multiply(qWorld).multiply(P));
    }
    bone.quaternion.premultiply(qWorld);
  }

  _applyArmRaise(run, k) {
    const { up, fo, hand, model } = run;
    up.quaternion.copy(run.baseU);
    if (run.upperAim && k > 1e-5) {
      up.updateWorldMatrix(true, true);
      const S = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
      const E = new THREE.Vector3().setFromMatrixPosition(fo.matrixWorld);
      this._aimBone(up, run.baseU, E.sub(S), run.upperAim, k);
    }
    fo.quaternion.copy(run.baseF);
    up.updateWorldMatrix(true, true);
    if (k > 1e-5) {
      const E = new THREE.Vector3().setFromMatrixPosition(fo.matrixWorld);
      const H = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
      this._aimBone(fo, run.baseF, H.sub(E), run.foreAim, k);
      fo.updateWorldMatrix(true, true);
    }
    if (model) { /* the caller updates the whole model when it needs to read it */ }
  }

  _endArmRaise(run, instant) {
    const sState = this._stagedState();
    const i = sState.runs.indexOf(run);
    if (i >= 0) sState.runs.splice(i, 1);
    if (run.up && run.baseU) run.up.quaternion.copy(run.baseU);
    if (run.fo && run.baseF) run.fo.quaternion.copy(run.baseF);
    if (!instant) {
      console.log('[courtsim] arm_raise_END seat=', run.seatKey, 'tag=', run.tag,
        '-- bones restored from their captured base; no residue.');
    }
  }

  _animateStagedEvents(dt) {
    const sState = this._staged;
    if (!sState || !sState.runs.length) return;
    for (const run of sState.runs.slice()) {
      if (run.venueGen !== this._venueGen) { this._endArmRaise(run, true); continue; }
      run.t += dt * 1000;
      if (run.st._lastAppliedBlend !== run.lastSeenBlend) {
        run.lastSeenBlend = run.st._lastAppliedBlend;
        run.baseU = run.up.quaternion.clone();
        run.baseF = run.fo.quaternion.clone();
      }
      const T1 = run.raiseMs, T2 = T1 + run.holdMs, T3 = T2 + run.lowerMs;
      let k;
      if (run.t < T1) {
        const u = run.t / T1;
        k = u * u * (3 - 2 * u);              // smoothstep up
      } else if (run.t < T2) {
        k = 1;
      } else if (run.t < T3) {
        const u = (run.t - T2) / run.lowerMs;
        k = 1 - u * u * (3 - 2 * u);          // smoothstep down
      } else {
        this._endArmRaise(run, false);
        continue;
      }
      this._applyArmRaise(run, k);
    }
  }

  _standFrontKeepOut(s) {
    const model = s.model;
    if (!model || !this.venueGroup) return null;
    const MAX_BACK = 0.14;        // a judge steps back from his bench; he does not leave it
    const MARGIN = 0.008;
    const fwd = new THREE.Vector3(s.standFwdX, 0, s.standFwdZ);
    if (fwd.lengthSq() < 1e-8) return null;
    fwd.normalize();
    model.updateMatrixWorld(true);
    const origin = new THREE.Vector3(model.position.x, 0, model.position.z);
    const boxes = [];
    const bb = new THREE.Box3();
    this.venueGroup.traverse((o) => {
      if (!o.isMesh || !o.name) return;
      if (/carpet|floor|ceiling|wall|sky|platform|riser|tier|step|chair|bench(seat|plinth)/i.test(o.name)) return;
      bb.setFromObject(o);
      const cx = (bb.min.x + bb.max.x) * 0.5, cz = (bb.min.z + bb.max.z) * 0.5;
      if ((cx - origin.x) * fwd.x + (cz - origin.z) * fwd.z <= 0) return;   // behind
      boxes.push({ name: o.name, min: bb.min.clone(), max: bb.max.clone() });
    });
    if (!boxes.length) return null;
    const pts = [];
    const v = new THREE.Vector3();
    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      o.updateWorldMatrix(true, false);
      const n = o.geometry.attributes.position.count;
      const stride = n > 4000 ? 2 : 1;    // 2x decimation on the dense body mesh
      for (let i = 0; i < n; i += stride) {
        if (o.isSkinnedMesh) o.getVertexPosition(i, v);
        else v.fromBufferAttribute(o.geometry.attributes.position, i);
        pts.push(v.clone().applyMatrix4(o.matrixWorld));
      }
    });
    const bad = [];
    const slab = (mn, mx, o, d) => {
      if (Math.abs(d) < 1e-9) return (o >= mn && o <= mx) ? [-Infinity, Infinity] : null;
      const a = (mn - o) / d, b = (mx - o) / d;
      return a <= b ? [a, b] : [b, a];
    };
    for (const B of boxes) {
      const yMin = B.min.y - MARGIN, yMax = B.max.y + MARGIN;
      for (const p of pts) {
        if (p.y < yMin || p.y > yMax) continue;
        const ix = slab(B.min.x - MARGIN, B.max.x + MARGIN, p.x, fwd.x);
        if (!ix) continue;
        const iz = slab(B.min.z - MARGIN, B.max.z + MARGIN, p.z, fwd.z);
        if (!iz) continue;
        const lo = Math.max(ix[0], iz[0]), hi = Math.min(ix[1], iz[1]);
        if (hi > lo) bad.push([lo, hi]);
      }
    }
    const want = s.standStep || 0;
    if (!bad.length) return { step: want, moved: 0, intervals: 0 };
    bad.sort((a, b) => a[0] - b[0]);
    const merged = [bad[0].slice()];
    for (let i = 1; i < bad.length; i++) {
      const m = merged[merged.length - 1];
      if (bad[i][0] <= m[1] + 1e-6) m[1] = Math.max(m[1], bad[i][1]);
      else merged.push(bad[i].slice());
    }
    let t = want;
    for (let guard = 0; guard < merged.length + 2; guard++) {
      const hit = merged.find((m) => t > m[0] && t < m[1]);
      if (!hit) break;
      t = hit[0] - 1e-4;
    }
    let clamped = false;
    if (t < -MAX_BACK) { t = -MAX_BACK; clamped = true; }
    let residual = 0;
    if (clamped) {
      for (const B of boxes) {
        for (const p of pts) {
          if (p.y <= B.min.y || p.y >= B.max.y) continue;
          const x = p.x + t * fwd.x, z = p.z + t * fwd.z;
          if (x <= B.min.x || x >= B.max.x || z <= B.min.z || z >= B.max.z) continue;
          residual = Math.max(residual, Math.min(
            x - B.min.x, B.max.x - x, p.y - B.min.y, B.max.y - p.y, z - B.min.z, B.max.z - z));
        }
      }
      if (residual > 0.0005) {
        console.warn('[courtsim] stand_front_keepout_CLAMPED role=', s.role,
          'capped_at_m=', (-MAX_BACK).toFixed(4),
          'residual_penetration_mm=', (residual * 1000).toFixed(1),
          '-- this figure cannot step back far enough to clear what is in front of',
          'it. That is a furniture problem, not a step problem, and it will still',
          'be inside the desk when it stands.');
      }
    }
    return { step: t, moved: t - want, intervals: merged.length, boxes: boxes.length,
      pts: pts.length, clamped, residual_mm: +(residual * 1000).toFixed(1) };
  }

  _exhibitGroup() {
    if (this._exhibitRefGen === this._venueGen && this._exhibitGroupRef) return this._exhibitGroupRef;
    const folder = this.scene.getObjectByName('CounselPropFolderA')
      || this.scene.getObjectByName('DepoPropFolder')
      || this.scene.getObjectByName('Papers')
      || this.scene.getObjectByName('CounselPropFolderB');
    this._exhibitGroupRef = folder || null;
    this._exhibitRefGen = this._venueGen;
    if (!folder) {
      console.warn('[courtsim] exhibit_prop_MISSING -- no CounselPropFolderA in this venue,'
        + ' so the exhibit events will be screen-and-audio only here.');
    }
    return folder;
  }

  _exhibitSticker() {
    const folder = this._exhibitGroup();
    if (!folder) return null;
    let s = folder.getObjectByName('ExhibitSticker');
    if (!s) {
      const bb = new THREE.Box3().setFromObject(folder);
      const w = Math.min(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const h = bb.max.y - bb.min.y;
      const sz = Math.max(0.03, w * 0.40);
      s = new THREE.Mesh(
        new THREE.BoxGeometry(sz, 0.0015, sz * 0.62),
        stdMaterial({ color: 0xe8c33a, roughness: 0.85, metalness: 0 }),
      );
      s.name = 'ExhibitSticker';
      s.castShadow = false;
      s.position.set(0, h / 2 + 0.0012, 0);
      s.visible = false;
      folder.add(s);
      console.log('[courtsim] exhibit_sticker_BUILT on', folder.name,
        'size=', sz.toFixed(4), 'y_above_folder_centre=', (h / 2 + 0.0012).toFixed(4),
        '-- 1.2 mm proud of the folder face, so it cannot be inside it.');
    }
    return s;
  }

  _setExhibitSticker(phase, num) {
    const s = this._exhibitSticker();
    if (!s) return false;
    s.visible = true;
    const col = (phase === 'received') ? 0x3f6fd8 : 0xe8c33a;
    if (s.material && s.material.color) s.material.color.setHex(col);
    s.userData.exhibitNumber = num;
    s.userData.phase = phase;
    return true;
  }

  _setExhibitHeld(on, _num) {
    if (!on) {
      const s = this._exhibitGroupRef && this._exhibitGroupRef.getObjectByName
        ? this._exhibitGroupRef.getObjectByName('ExhibitSticker') : null;
      if (s) s.visible = false;
      return false;
    }
    return !!this._exhibitGroup();
  }

  getStagedEventLog() {
    const st = this._stagedState();
    return st.log.map((r) => ({
      cue: r.cue, id: r.id, kind: r.kind, seat: r.seat,
      parenthetical: r.text || '(none -- see the catalogue)',
      at_ms: Math.round(r.atMs),
      observability: r.observability,
    }));
  }

  getStagedEventSummary() {
    const st = this._stagedState();
    const byId = {};
    let staged = 0, partial = 0, notStaged = 0;
    for (const r of st.log) {
      byId[r.id] = (byId[r.id] || 0) + 1;
      const s = r.observability && r.observability.staged;
      if (s === true) staged++;
      else if (s === 'partial') partial++;
      else notStaged++;
    }
    return {
      events: st.log.length, by_id: byId,
      fully_staged: staged, partially_staged: partial, not_staged: notStaged,
      density: st.density,
      audio_hook: !!st.audioHook,
      deposition: !!st.deposition,
      arm_raises_in_flight: st.runs.length,
    };
  }

  getStanceSnapshot() {
    const out = {};
    for (const [seatKey, group] of Object.entries(this.seatGroups)) {
      const s = this._animStates.find((st) => st.model === group.model);
      out[seatKey] = s ? { blend: s.stanceBlend, target: s.stanceTarget || s.defaultStance } : null;
    }
    return out;
  }

  _animateStance(dt) {
    if (this._stanceTransitioning) {
      this._stanceElapsed += dt;
    }
    const frac = Math.min(1, this._stanceElapsed / this._stanceDuration);
    let anyMidTransition = false;
    for (const s of this._animStates) {
      const target = s.stanceTarget || s.defaultStance;
      const targetBlend = target === 'sit' ? 1 : 0;
      const startBlend = s._stanceBlendAtTransitionStart == null ? s.stanceBlend : s._stanceBlendAtTransitionStart;
      if (this._stanceTransitioning && this._stanceElapsed <= dt) {
        s._stanceBlendAtTransitionStart = s.stanceBlend;
      }
      const from = s._stanceBlendAtTransitionStart == null ? s.stanceBlend : s._stanceBlendAtTransitionStart;
      const eased = frac * frac * (3 - 2 * frac); // smoothstep -- reads as a real sit/stand motion, not a linear robotic snap
      s.stanceBlend = this._stanceTransitioning ? THREE.MathUtils.lerp(from, targetBlend, eased) : targetBlend;
      if (frac < 1 && this._stanceTransitioning) anyMidTransition = true;

      const b = s.stanceBlend;
      if (s.model) {
        const seatedRootY = s.seatSurfaceY + s.seatPelvisLift - s.pelvisRise;
        s.model.position.y = THREE.MathUtils.lerp(s.standY, seatedRootY, b);
        if (s.standStep) {
          const out = s.standStep * (1 - b);
          s.model.position.x = s.seatMarkX + s.standFwdX * out;
          s.model.position.z = s.seatMarkZ + s.standFwdZ * out;
        }
        if (b <= 0.001 && !s.standFrontSolved) {
          s.standFrontSolved = true;
          const kp = this._standFrontKeepOut(s);
          if (kp && Math.abs(kp.moved) > 0.0005) {
            const before = s.standStep;
            s.standStep = kp.step;
            s.model.position.x = s.seatMarkX + s.standFwdX * s.standStep;
            s.model.position.z = s.seatMarkZ + s.standFwdZ * s.standStep;
            console.log('[courtsim] stand_front_keepout role=', s.role,
              'step_was_m=', before.toFixed(4), 'step_now_m=', kp.step.toFixed(4),
              'moved_back_m=', (-kp.moved).toFixed(4),
              'solids_in_front=', kp.boxes, 'points_tested=', kp.pts,
              'blocked_intervals=', kp.intervals,
              '-- this figure was standing inside something in front of it. The',
              'step is now solved against BOTH the seat behind and the furniture',
              'in front, and it is allowed to be negative.');
          }
        }
      }
      const ls = s.legSolve;
      if (s._lastAppliedBlend !== b) {
        s._lastAppliedBlend = b;
        const ab = s.armStanceBlend;
        if (ab) {
          for (let i = 0; i < ab.length; i++) {
            const e = ab[i];
            e.bone.quaternion.copy(e.stand).slerp(e.sit, b);
          }
        }
        const fb = s.fingerStanceBlend;
        if (fb) {
          for (let i = 0; i < fb.length; i++) {
            const e = fb[i];
            e.bone.quaternion.copy(e.stand).slerp(e.sit, b);
          }
        }
        if (s.lHandRest && s.lHandStandQ && s.lHandSitQ) {
          s.lHandRest.copy(s.lHandStandQ).slerp(s.lHandSitQ, b);
        }
        if (s.rHandRest && s.rHandStandQ && s.rHandSitQ) {
          s.rHandRest.copy(s.rHandStandQ).slerp(s.rHandSitQ, b);
        }
        const ch = s.chair;
        if (ch) {
          const back = 1 - b;                       // 1 when fully standing
          ch.position.x = ch.userData.__seatX + ch.userData.__slideX * back;
          ch.position.z = ch.userData.__seatZ + ch.userData.__slideZ * back;
        }
        const q = _scratchQuat2;
        if (ls && s.lThigh && s.lThighRestQuat) {
          s.lThigh.quaternion.copy(s.lThighRestQuat).premultiply(
            q.setFromAxisAngle(ls.lThighAxis, ls.hipRad * b));
        }
        if (ls && s.rThigh && s.rThighRestQuat) {
          s.rThigh.quaternion.copy(s.rThighRestQuat).premultiply(
            q.setFromAxisAngle(ls.rThighAxis, ls.hipRad * b));
        }
        if (ls && s.lCalf && s.lCalfRestQuat) {
          s.lCalf.quaternion.copy(s.lCalfRestQuat).premultiply(
            q.setFromAxisAngle(ls.lCalfAxis, ls.kneeRad * b));
        }
        if (ls && s.rCalf && s.rCalfRestQuat) {
          s.rCalf.quaternion.copy(s.rCalfRestQuat).premultiply(
            q.setFromAxisAngle(ls.rCalfAxis, ls.kneeRad * b));
        }
      }
    }
    if (this._stanceTransitioning && !anyMidTransition) {
      this._stanceTransitioning = false;
      for (const s of this._animStates) s._stanceBlendAtTransitionStart = null;
    }
  }

  getSkinnedVertexSample(seatKey) {
    const group = this.seatGroups[seatKey];
    if (!group) return null;
    const state = this._animStates.find(
      (s) => (s.headBone && group.model.getObjectById(s.headBone.id))
        || (s.spineBone && group.model.getObjectById(s.spineBone.id)),
    );
    if (!state) return null;
    const bone = state.headBone || state.spineBone;
    const target = new THREE.Vector3();
    bone.getWorldPosition(target);
    return { x: target.x, y: target.y, z: target.z };
  }

  _resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || 0;
    const h = this.canvas.clientHeight || 300;
    if (w <= 0 || h <= 0) { this._resizePending = true; return; }
    this._resizePending = false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.cameraController) this.cameraController.setAspect(this.camera.aspect);
    else this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
    }
  }

  handleBecameVisible() {
    this._resize();
  }

  _isCourtroomVisible() {
    if (this._courtroomEl === undefined) {
      this._courtroomEl = document.getElementById('courtroom-screen') || null;
    }
    const el = this._courtroomEl;
    if (!el) return true;
    if (el.classList.contains('hidden')) return false;
    if (typeof el.checkVisibility === 'function') return el.checkVisibility();
    return true;
  }

  _animate = () => {
    requestAnimationFrame(this._animate);
    if (!this._isCourtroomVisible()) {
      this._clock.getDelta();
      this._hiddenFrames = (this._hiddenFrames || 0) + 1;
      this._restIdleMouths(performance.now());
      return;
    }
    const frameStart = performance.now();
    if (this._resizePending) this._resize();
    const dt = Math.min(this._clock.getDelta(), 0.1);  // clamp: a tab-switch stall must not jump animation state
    const p = this.profiler;
    p.begin('idle'); this._animateIdle(dt); p.end('idle');
    p.begin('life'); this._animateLife(dt); p.end('life');
    p.begin('stance'); this._animateStance(dt); p.end('stance');
    this._animateInterject(dt);
    this._animateStagedEvents(dt);
    if (this._armFitPending) this._runPendingArmFits();
    p.begin('pins'); this._animateContactPins(); p.end('pins');
    this._clampGavelToBlock();
    p.begin('clock'); this._updateClock(); p.end('clock');        // DEFECT 6
    p.begin('talklight'); this._updateTalkLights(dt); p.end('talklight'); // DEFECT 7
    this._restIdleMouths(frameStart);
    p.begin('screen'); this._updateReporterScreen(frameStart); p.end('screen');
    if (this.cameraController && this.cameraController.updateGlide) {
      this.cameraController.updateGlide(dt);
    }
    p.begin('render'); this.composer.render(); p.end('render');
    p.frame(frameStart);
    this._updateQualityFloor(performance.now() - frameStart);
  };

  setSeatDisplayName(seatKey, name) {
    if (!seatKey) return false;
    const next = (name == null) ? null : String(name).trim();
    if (!next) delete this._seatNames[seatKey];
    else this._seatNames[seatKey] = next;
    return this._applySeatPlate(seatKey);
  }

  setSeatNameplate(seatKey, name) {
    return this.setSeatDisplayName(seatKey, name);
  }

  setProceedingCast(seatByLabel, displayByLabel) {
    const n = setCounselCast(seatByLabel);
    const display = displayByLabel || {};
    for (const chair of COUNSEL_CHAIR_ORDER) delete this._seatNames[chair];
    for (const [label, seat] of Object.entries(seatByLabel || {})) {
      if (!COUNSEL_CHAIR_ORDER.includes(seat)) continue;
      const shown = (typeof display[label] === 'string' && display[label].trim())
        ? display[label] : label;
      this._seatNames[seat] = String(shown).trim();
    }
    const applied = {};
    for (const key of Object.keys(this.seatPlates || {})) {
      this._applySeatPlate(key);
      applied[key] = this.seatPlates[key].sprite.userData.plate.text;
    }
    console.log('[courtsim] seat_cast_REGISTERED entries=', n,
      'seat_avatar_sex=', JSON.stringify(counselSeatAvatarSex()),
      'seat_avatar_role=', JSON.stringify(this.getSeatAvatarRoles()),
      'plates=', JSON.stringify(applied),
      '-- COURTSIM-SCENE-019. The caption is the person; the seat key never',
      'reaches the screen. A plate here that disagrees with the voice means',
      'voice_cast.js COUNSEL_SEAT_AVATAR_SEX and scene.js AVATAR_SEX_BY_ROLE',
      'have drifted apart.');
    return n;
  }

  getSeatPlates() {
    const out = {};
    for (const [key, p] of Object.entries(this.seatPlates || {})) {
      out[key] = p.sprite.userData.plate.text;
    }
    return out;
  }

  _applySeatPlate(seatKey) {
    const p = (this.seatPlates || {})[seatKey];
    if (!p) return false;
    return setTextSpriteText(p.sprite, this._seatNames[seatKey] || p.fallback);
  }

  setActiveSpeaker(seatKey, displayName) {
    if (seatKey && displayName) this.setSeatDisplayName(seatKey, displayName);
    this._activeSeatKey = seatKey || null;
    for (const [key_, light] of Object.entries(this.talkLights)) {
      light.userData.targetIntensity = (key_ === seatKey) ? TALK_LIGHT_PEAK : 0;
    }
    const defs = this._activeSeatDefs || SEATS;
    const speakerDef = seatKey ? defs[seatKey] : null;
    if (!speakerDef) return;
    const yawLog = [];
    let saturated = 0;
    for (const [key_, group] of Object.entries(this.seatGroups)) {
      if (key_ === seatKey) continue; // the speaker doesn't turn to look at themself
      const s = this._animStates.find((st) => st.model === group.model);
      if (!s || !s.headBone) continue;
      const dx = speakerDef.pos[0] - group.model.position.x;
      const dz = speakerDef.pos[2] - group.model.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.2) continue; // basically the same spot -- no meaningful direction to turn toward
      const worldAngle = Math.atan2(dx, dz);
      const bodyYaw = group.model.rotation.y; // this avatar's own facing (0 or PI -- see _loadAvatarSeat)
      let relYaw = worldAngle - bodyYaw;
      while (relYaw > Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      s.headTargetYaw = THREE.MathUtils.clamp(relYaw, THREE.MathUtils.degToRad(-35), THREE.MathUtils.degToRad(35));
      s.headNextShiftT = s.t + 999; // suppress random idle re-targeting while a speaker is active
      const reqDeg = THREE.MathUtils.radToDeg(relYaw);
      const appDeg = THREE.MathUtils.radToDeg(s.headTargetYaw);
      if (Math.abs(reqDeg) >= 35) saturated++;
      yawLog.push(`${key_}:${reqDeg.toFixed(1)}->${appDeg.toFixed(1)}`);
    }
    console.log('[courtsim] head_turn speaker=', seatKey,
      'venue=', (this.venue && this.venue.key),
      'seat_map=', (this._activeSeatDefs === SEATS ? 'SEATS' : 'DEPOSITION_SEATS'),
      'clamped_at_35=', `${saturated}/${yawLog.length}`,
      'yaw_deg_rel_body_forward=', yawLog.join(' '));
  }

  _updateTalkLights(dt) {
    if (!this.talkLights) return;
    const step = dt / TALK_LIGHT_RAMP;
    for (const light of Object.values(this.talkLights)) {
      const target = light.userData.targetIntensity || 0;
      if (light.intensity === target) continue;
      const d = target - light.intensity;
      const move = Math.sign(d) * Math.min(Math.abs(d), TALK_LIGHT_PEAK * step);
      light.intensity += move;
      if (Math.abs(target - light.intensity) < 1e-3) light.intensity = target;
    }
  }

  judgeInterject(opts = {}) {
    if (this._interject && this._interject.promise) return this._interject.promise;
    const o = {
      lookAt: 'reporter', strike: true,
      raiseMs: 260, strikeMs: 130, settleMs: 380, holdMs: 2400, raiseDeg: 26,
      ...opts,
    };
    const judge = this.seatGroups && this.seatGroups['THE COURT'];
    const st = judge ? this._animStates.find((s) => s.model === judge.model) : null;
    if (!judge || !st) {
      const judgeless = !!(this.venue && this.venue.type === 'deposition');
      if (judgeless) {
        if (!this._noJudgeInfoSaid) {
          this._noJudgeInfoSaid = true;
          console.info('[courtsim] judgeInterject_NO_JUDGE venue=', this.venue.key,
            '-- this is a DEPOSITION and a deposition has no judge, so there is nobody',
            'to raise a gavel. Expected, not a fault. Resolving struck:false immediately',
            'so the caller does not hang. Said once per venue (COURTSIM-FIX-038 / IMPORT-036 H4b).');
        }
      } else {
        console.error('[courtsim] judgeInterject_NO_JUDGE venue=',
          (this.venue && this.venue.key) || '(none)', 'seatGroups=',
          Object.keys(this.seatGroups || {}).join(','),
          '-- THE COURT is not loaded in a venue that HAS a bench, so an avatar is',
          'missing from the room. Resolving struck:false immediately so the caller',
          'does not hang.');
      }
      return Promise.resolve({ struck: false, reason: 'no-judge', judgeless });
    }
    const model = judge.model;
    const findB = (a, b) => model.getObjectByName(a) || model.getObjectByName(b);
    const up = findB('Bip01_R_UpperArm', 'Bip01 R UpperArm');
    const fo = findB('Bip01_R_Forearm', 'Bip01 R Forearm');
    model.updateWorldMatrix(true, true);
    const hand = findB('Bip01_R_Hand', 'Bip01 R Hand');
    const bq = model.getWorldQuaternion(new THREE.Quaternion());
    let lateral = new THREE.Vector3(1, 0, 0).applyQuaternion(bq).normalize();
    let liftSign = 1;
    if (up && hand) {
      const S = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
      const H = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
      const vh = H.clone().sub(S); vh.y = 0;
      if (vh.lengthSq() > 1e-6) {
        vh.normalize();
        lateral = new THREE.Vector3().crossVectors(vh, _AXIS_Y).normalize();
      }
      const saveQ = up.quaternion.clone();
      const y0 = H.y;
      up.quaternion.premultiply(new THREE.Quaternion()
        .setFromAxisAngle(lateral, THREE.MathUtils.degToRad(4)));
      model.updateWorldMatrix(true, true);
      const y1 = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld).y;
      up.quaternion.copy(saveQ);
      model.updateWorldMatrix(true, true);
      liftSign = (y1 >= y0) ? 1 : -1;
      console.log('[courtsim] judgeInterject_lift_axis_probed axis=',
        lateral.toArray().map((n) => n.toFixed(3)).join(','),
        'hand_y_at_0=', y0.toFixed(4), 'hand_y_at_+4deg=', y1.toFixed(4),
        'sign_chosen=', liftSign,
        '(positive means a POSITIVE rotation about that axis raises this rig\'s hand)');
    } else {
      console.warn('[courtsim] judgeInterject: no hand bone -- the lift axis falls back to',
        'the body lateral, unprobed. The strike may swing sideways on this rig.');
    }
    lateral.multiplyScalar(liftSign);

    let lookPoint = null;
    if (Array.isArray(o.lookAt)) {
      lookPoint = new THREE.Vector3(o.lookAt[0], o.lookAt[1], o.lookAt[2]);
    } else if (o.lookAt === 'reporter') {
      const fr = this.getReporterSeatFraming();
      if (fr && fr.pos) lookPoint = new THREE.Vector3(fr.pos[0], fr.pos[1], fr.pos[2]);
      else {
        console.warn('[courtsim] judgeInterject: no reporter framing for this venue --',
          'the head turn is skipped rather than aimed at a guess. The strike still runs.');
      }
    }
    let lookYaw = 0, torsoYaw = 0;
    if (lookPoint) {
      const dx = lookPoint.x - model.position.x;
      const dz = lookPoint.z - model.position.z;
      let rel = Math.atan2(dx, dz) - model.rotation.y;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const HEAD_MAX = THREE.MathUtils.degToRad(55);
      const TORSO_MAX = THREE.MathUtils.degToRad(6);
      lookYaw = THREE.MathUtils.clamp(rel, -HEAD_MAX, HEAD_MAX);
      torsoYaw = THREE.MathUtils.clamp(rel - lookYaw, -TORSO_MAX, TORSO_MAX);
    }

    const total = o.raiseMs + (o.strike ? o.strikeMs : 0);
    let resolveFn = null;
    const promise = new Promise((res) => { resolveFn = res; });
    this._interject = {
      promise, resolve: resolveFn, st, model, up, fo, lateral,
      raiseRad: THREE.MathUtils.degToRad(o.raiseDeg),
      raiseMs: o.raiseMs, strikeMs: o.strikeMs, settleMs: o.settleMs,
      holdMs: o.holdMs, doStrike: !!o.strike,
      lookYaw, torsoYaw, t: 0, landed: false, total,
      prevHeadTarget: st.headTargetYaw, prevHeadShiftT: st.headNextShiftT,
      baseU: up ? up.quaternion.clone() : null,
      baseF: fo ? fo.quaternion.clone() : null,
      baseH: hand ? hand.quaternion.clone() : null,
      hand,
      lastSeenBlend: st._lastAppliedBlend,
    };
    if (lookPoint) this._interject.pendingLook = true;
    console.log('[courtsim] judgeInterject_START lookAt=',
      Array.isArray(o.lookAt) ? o.lookAt.join(',') : o.lookAt,
      'look_point=', lookPoint ? lookPoint.toArray().map((n) => n.toFixed(3)).join(',') : 'none',
      'head_yaw_deg=', THREE.MathUtils.radToDeg(lookYaw).toFixed(2),
      'torso_yaw_deg=', THREE.MathUtils.radToDeg(torsoYaw).toFixed(2),
      'strike=', !!o.strike, 'raise_deg=', o.raiseDeg,
      'lands_at_ms=', total,
      'upper_arm_bone=', !!up, 'forearm_bone=', !!fo);
    if (!up) {
      console.error('[courtsim] judgeInterject_NO_ARM: Bip01 R UpperArm not found on the judge rig',
        '-- the head/torso turn still runs, but there will be no gavel movement at all.');
    }
    return promise;
  }

  _animateInterject(dt) {
    const it = this._interject;
    if (!it) return;
    it.t += dt * 1000;
    const { st, model, up, fo, lateral } = it;
    let lift = 0;
    const T1 = it.raiseMs, T2 = T1 + it.strikeMs, T3 = T2 + it.settleMs;
    it.armBusy = it.doStrike && it.t < T3;
    if (!it.doStrike) {
      lift = 0;
    } else if (it.t < T1) {
      const u = it.t / T1;
      lift = it.raiseRad * (1 - (1 - u) * (1 - u));           // ease-out quad
    } else if (it.t < T2) {
      const u = (it.t - T1) / it.strikeMs;
      lift = it.raiseRad * (1 - u * u);                        // ease-in quad: accelerating down
    } else if (it.t < T3) {
      const u = (it.t - T2) / it.settleMs;
      lift = it.raiseRad * 0.09 * Math.sin(Math.PI * u) * (1 - u);
    }
    if (st._lastAppliedBlend !== it.lastSeenBlend) {
      it.lastSeenBlend = st._lastAppliedBlend;
      if (up) it.baseU = up.quaternion.clone();
      if (fo) it.baseF = fo.quaternion.clone();
      if (it.hand) it.baseH = it.hand.quaternion.clone();
    }
    if (up && it.baseU) {
      up.quaternion.copy(it.baseU);
      if (Math.abs(lift) > 1e-5) {
        _lifeQuat.setFromAxisAngle(lateral, lift);
        up.quaternion.premultiply(_lifeQuat);
      }
      if (fo && it.baseF) {
        fo.quaternion.copy(it.baseF);
        if (Math.abs(lift) > 1e-5) {
          _lifeQuat.setFromAxisAngle(lateral, lift * -0.35);
          fo.quaternion.premultiply(_lifeQuat);
        }
      }
      if (it.hand && it.baseH) {
        it.hand.quaternion.copy(it.baseH);
        if (Math.abs(lift) > 1e-5) {
          _lifeQuat.setFromAxisAngle(lateral, lift * 0.45);
          it.hand.quaternion.premultiply(_lifeQuat);
        }
      }
    }
    if (st.spineBone && Math.abs(it.torsoYaw) > 1e-4) {
      const RAMP = 260;
      const tl = it.t - T2;
      let k;
      if (tl < 0) k = 0;
      else if (tl < RAMP) k = tl / RAMP;
      else if (tl < it.holdMs) k = 1;
      else if (tl < it.holdMs + RAMP) k = 1 - (tl - it.holdMs) / RAMP;
      else k = 0;
      if (k > 1e-3) {
        _lifeQuat.setFromAxisAngle(_AXIS_Y, it.torsoYaw * k);
        st.spineBone.quaternion.premultiply(_lifeQuat);
      }
    }
    if (!it.landed && (it.t >= T2 || !it.doStrike)) {
      it.landed = true;
      model.updateWorldMatrix(true, true);
      this._clampGavelToBlock();
      const head = this.scene.getObjectByName('GavelHead');
      let headWorld = null, gap = NaN;
      if (head) {
        head.updateWorldMatrix(true, false);
        const hb = new THREE.Box3().setFromObject(head);
        headWorld = hb.getCenter(new THREE.Vector3());
        if (this._soundBlockTop) {
          gap = hb.min.y - this._soundBlockTop.y;
        }
      }
      const result = {
        struck: !!it.doStrike && !!up,
        landedAtMs: it.t,
        headWorld: headWorld ? headWorld.toArray().map((n) => +n.toFixed(4)) : null,
        blockTopWorld: this._soundBlockTop
          ? [this._soundBlockTop.x, this._soundBlockTop.y, this._soundBlockTop.z] : null,
        gapAtLandingM: Number.isNaN(gap) ? null : +gap.toFixed(4),
        lookYawDeg: +THREE.MathUtils.radToDeg(it.lookYaw).toFixed(2),
        torsoYawDeg: +THREE.MathUtils.radToDeg(it.torsoYaw).toFixed(2),
      };
      console.log('[courtsim] judgeInterject_LANDED', JSON.stringify(result),
        '-- gapAtLandingM is the gavel head\'s lowest vertex above the sound',
        'block\'s top face. Near zero is a hit; a large positive number means',
        'the bang would play over a gavel that is still in the air.');
      if (Number.isFinite(gap) && Math.abs(gap) > 0.045) {
        console.warn('[courtsim] GAVEL_MISSED_BLOCK by', gap.toFixed(4), 'm',
          '-- the strike animation and the sound block have drifted apart.');
      }
      if (it.pendingLook) {
        st.headTargetYaw = it.lookYaw;
        st.headNextShiftT = st.t + (it.holdMs / 1000) + 1;
      }
      if (it.resolve) it.resolve(result);
    }
    if (it.t >= Math.max(T3, T2 + it.holdMs + 520)) {
      if (up && it.baseU) up.quaternion.copy(it.baseU);
      if (fo && it.baseF) fo.quaternion.copy(it.baseF);
      st.headNextShiftT = st.t;           // back to idle head sway
      this._interject = null;
    }
  }

  clearActiveSpeaker() {
    for (const light of Object.values(this.talkLights)) light.userData.targetIntensity = 0;
    this.restMouths();
    for (const s of this._animStates) s.headNextShiftT = s.t;
  }

  getRobeMaterialsRecolored(seatKey) {
    const group = this.seatGroups[seatKey];
    return group ? (group.robeMaterialsRecolored || 0) : 0;
  }

  getJudgeWigPartCount(seatKey) {
    const group = this.seatGroups[seatKey];
    return group ? (group.wigPartCount || 0) : 0;
  }

  getRigFailureCount() {
    return this._rigFailures || 0;
  }

  getLoadedSeatVertexCounts() {
    const out = {};
    for (const [key_, group] of Object.entries(this.seatGroups)) {
      out[key_] = group.vertexCount;
    }
    return out;
  }

  _findMorphMeshes(model) {
    const found = [];
    model.traverse((n) => {
      if (n.isMesh && n.morphTargetDictionary) found.push(n);
    });
    return found;
  }

  _arkitShapeMap(seatKey) {
    this._arkitShapeCache = this._arkitShapeCache || {};
    const group = this.seatGroups[seatKey];
    const cached = this._arkitShapeCache[seatKey];
    if (cached && cached.length && group && cached.model === group.model) return cached;
    const entries = [];
    if (!group || !group.model) return entries;
    const akRe = /AK_\d+_(.+)$/;
    for (const mesh of this._findMorphMeshes(group.model)) {
      const map = {};
      for (const [name, idx] of Object.entries(mesh.morphTargetDictionary)) {
        const m = akRe.exec(name);
        if (m) {
          const pascal = m[1];
          const arkitName = pascal.charAt(0).toLowerCase() + pascal.slice(1);
          map[arkitName] = idx;
        }
      }
      if (Object.keys(map).length === 0) {
        for (const [name, idx] of Object.entries(mesh.morphTargetDictionary)) {
          const lower = name.toLowerCase();
          for (const arkitName of ARKIT_POSE_NAMES) {
            if (lower.endsWith(arkitName.toLowerCase())) { map[arkitName] = idx; break; }
          }
        }
      }
      if (Object.keys(map).length > 0) entries.push({ mesh, map });
    }
    if (!entries.length) return entries;   // not cached -- see DEFECT AA-2
    entries.model = group.model;
    this._arkitShapeCache[seatKey] = entries;
    try {
      const j = entries.map((e) => (e.map.jawOpen === undefined ? -1 : e.map.jawOpen));
      console.log(`[lipsync] shapemap seat="${seatKey}" meshes=${entries.length} `
        + `names=${Object.keys(entries[0].map).length} jawOpen_idx=[${j.join(',')}] `
        + `tier=${AVATAR_BASE_URL}`);
    } catch (err) { /* a receipt must never break the frame that prints it */ }
    return entries;
  }

  _lipsyncGainFor(seatKey, weights) {
    this._lipsyncPeaks = this._lipsyncPeaks || {};
    let st = this._lipsyncPeaks[seatKey];
    if (!st) { st = { peak: 0, gain: LIPSYNC_PRESENTATION_GAIN, rawMax: 0, frames: 0, voiced: 0, logged: false }; this._lipsyncPeaks[seatKey] = st; }
    if (st.voiced === undefined) st.voiced = 0;   // state carried over from an older build

    let raw = 0;
    for (const name of LIPSYNC_OPENING_POSES) {
      const v = weights[name];
      if (typeof v === 'number' && v > raw) raw = v;
    }
    st.frames++;
    if (raw > st.rawMax) st.rawMax = raw;          // lifetime, for the receipt only
    st.peak *= LIPSYNC_PEAK_DECAY;
    if (raw > st.peak) st.peak = raw;

    const divisor = Math.max(st.peak, st.rawMax * LIPSYNC_PEAK_LIFETIME_FRAC, LIPSYNC_RAW_PEAK_FLOOR);
    let gain = LIPSYNC_TARGET_PEAK / divisor;
    if (gain < LIPSYNC_PRESENTATION_GAIN) gain = LIPSYNC_PRESENTATION_GAIN;  // never weaker than shipped
    if (gain > LIPSYNC_GAIN_MAX) gain = LIPSYNC_GAIN_MAX;
    if (raw > LIPSYNC_RAW_PEAK_FLOOR) st.voiced++;
    if (st.voiced <= LIPSYNC_GAIN_WARMUP_FRAMES) {
      const t = Math.max(0, st.voiced - 1) / LIPSYNC_GAIN_WARMUP_FRAMES;
      gain = LIPSYNC_PRESENTATION_GAIN + (gain - LIPSYNC_PRESENTATION_GAIN) * t;
    }
    st.gain = gain;

    if (!st.logged && raw > LIPSYNC_RAW_PEAK_FLOOR) {
      st.logged = true;
      const disp = Math.min(1, st.peak * gain);
      const was = Math.min(1, st.peak * LIPSYNC_PRESENTATION_GAIN);
      console.log(`[lipsync] gain seat="${seatKey}" jawOpen_raw_peak=${st.peak.toFixed(4)} `
        + `derived_gain=${gain.toFixed(2)}x displayed_peak=${disp.toFixed(3)} `
        + `= ${(disp * LIPSYNC_JAW_MM_PER_UNIT).toFixed(2)} mm of chin travel `
        + `(a fixed ${LIPSYNC_PRESENTATION_GAIN}x would give ${was.toFixed(3)} = `
        + `${(was * LIPSYNC_JAW_MM_PER_UNIT).toFixed(2)} mm)`);
    }
    return gain;
  }

  async _castVariants() {
    if (!this.__castVariantsPromise) {
      this.__castVariantsPromise = fetch('assets/avatars_cast/cast_variants.json')
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return this.__castVariantsPromise;
  }

  async _applyRoleRetexture(root, role) {
    const spec = ROLE_RETEXTURE[role];
    if (!root || !spec) return;
    try {
      const loader = new THREE.TextureLoader();
      const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
      const prep = (t) => {
        t.colorSpace = THREE.SRGBColorSpace;   // baseColor maps
        t.flipY = false;                        // glTF convention
        t.anisotropy = this._maxAnisotropy || 1;
        t.needsUpdate = true;
        return t;
      };
      const [bodyTex, headTex, opacityTex] = await Promise.all([
        spec.bodyMap ? load(spec.bodyMap).then(prep) : Promise.resolve(null),
        spec.headMap ? load(spec.headMap).then(prep) : Promise.resolve(null),
        spec.opacityMap ? load(spec.opacityMap).then(prep) : Promise.resolve(null),
      ]);
      let swapped = 0;
      root.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const out = mats.map((m) => {
          const n = (m.name || '').toLowerCase();
          const c = m.clone();
          c.name = `${m.name}__${role}_retex`;
          if (bodyTex && n.includes('body')) { c.map = bodyTex; swapped++; }
          else if (headTex && n.includes('head')) { c.map = headTex; swapped++; }
          else if (opacityTex && n.includes('opacity')) {
            c.map = opacityTex;
            c.color = new THREE.Color(1, 1, 1);
            swapped++;
          }
          c.needsUpdate = true;
          return c;
        });
        o.material = Array.isArray(o.material) ? out : out[0];
      });
      console.log('[courtsim] role_retexture role=', role, 'materials_swapped=', swapped,
        '--', spec.note);
      if (!swapped) {
        console.warn('[courtsim] role_retexture_NO_MATCH role=', role,
          '-- no material named body/head/opacity on this avatar, so nothing changed.');
      }
    } catch (e) {
      console.warn('[courtsim] role_retexture_SKIPPED role=', role, e,
        '-- this figure keeps its shipped textures. Nothing else is affected.');
    }
  }

  async _applyCastVariant(root, seatIndex) {
    try {
      if (!root || seatIndex < 0) return;
      const man = await this._castVariants();
      const spec = man && man.seats && man.seats.find((s) => s.seat === seatIndex);
      if (!spec) return;

      const loader = new THREE.TextureLoader();
      const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));
      const prep = (t) => {
        t.colorSpace = THREE.SRGBColorSpace;   // these are baseColor maps
        t.flipY = false;                        // glTF convention
        t.anisotropy = this._maxAnisotropy || 1;
        t.needsUpdate = true;
        return t;
      };
      const [bodyTex, headTex, opacityTex] = await Promise.all([
        load(spec.bodyMap).then(prep),
        load(spec.headMap).then(prep),
        spec.opacityMap ? load(spec.opacityMap).then(prep) : Promise.resolve(null),
      ]);

      root.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const out = mats.map((m) => {
          const n = (m.name || '').toLowerCase();
          const c = m.clone();                  // never mutate the shared material
          c.name = `${m.name}__seat${seatIndex}`;
          if (n.includes('body')) c.map = bodyTex;
          else if (n.includes('head')) c.map = headTex;
          else if (n.includes('opacity')) {
            if (opacityTex) {
              c.map = opacityTex;
              c.color = new THREE.Color(...(spec.opacityTint || [1, 1, 1]));
            } else if (spec.strandTint) {
              c.color = new THREE.Color(...spec.strandTint);   // old behaviour
            }
          }
          c.needsUpdate = true;
          return c;
        });
        o.material = Array.isArray(o.material) ? out : out[0];
      });

      this._castVariantsApplied = (this._castVariantsApplied || 0) + 1;
      console.log(`[gallery] cast variant applied seat=${seatIndex} role=${spec.role} -- ${spec.note}`);
    } catch (e) {
      console.warn('[gallery] cast variant skipped', seatIndex, e);
    }
  }

  getGalleryCensus() {
    return {
      expected: this.venue && this.venue.type === 'deposition' ? 0 : GALLERY_SPECTATORS.length,
      placed: this._spectatorsPlaced || 0,
      seats: GALLERY_SPECTATORS.map((d) => ({ role: d.role, x: d.pos[0], z: d.pos[2] })),
    };
  }

  getLipsyncDiagnostics() {
    const out = {};
    for (const [seatKey, st] of Object.entries(this._lipsyncPeaks || {})) {
      const entries = (this._arkitShapeCache || {})[seatKey] || [];
      out[seatKey] = {
        morph_meshes: entries.length,
        arkit_names: entries.length ? Object.keys(entries[0].map).length : 0,
        raw_peak_running: +st.peak.toFixed(4),
        raw_peak_lifetime: +st.rawMax.toFixed(4),
        gain: +st.gain.toFixed(2),
        displayed_peak: +Math.min(1, st.peak * st.gain).toFixed(3),
        frames_applied: st.frames,
        jawOpen_on_mesh: +Number(this.getArkitShapeValue(seatKey, 'jawOpen') || 0).toFixed(4),
        mouthClose_on_mesh: +Number(this.getArkitShapeValue(seatKey, 'mouthClose') || 0).toFixed(4),
        jaw_mm_at_peak: +(Math.min(1, st.peak * st.gain) * LIPSYNC_JAW_MM_PER_UNIT).toFixed(2),
      };
    }
    return out;
  }

  applyArkitWeights(seatKey, weights) {
    const entries = this._arkitShapeMap(seatKey);
    if (!entries.length) return {};
    const gain = this._lipsyncGainFor(seatKey, weights);
    const applied = {};
    for (const [name, value] of Object.entries(weights)) {
      if (LIPSYNC_SKIP_POSES.has(name)) continue;
      const gained = !LIPSYNC_UNGAINED_POSES.has(name)
        && LIPSYNC_GAINED_PREFIXES.some((p) => name.startsWith(p));
      const v = Math.min(1, Math.max(0, value * (gained ? gain : 1)));
      let matchedAny = false;
      for (const { mesh, map } of entries) {
        if (name in map) {
          mesh.morphTargetInfluences[map[name]] = v;
          matchedAny = true;
        }
      }
      if (matchedAny) applied[name] = v;
    }
    let rest = this._mouthRest[seatKey];
    if (!rest) rest = this._mouthRest[seatKey] = { names: new Set(), lastMs: 0, from: null, t0: 0 };
    for (const name of Object.keys(applied)) rest.names.add(name);
    rest.lastMs = performance.now();
    rest.from = null;     // a fresh feed cancels any close in progress
    return applied;
  }

  _restIdleMouths(nowMs) {
    const states = this._mouthRest;
    if (!states) return;
    for (const seatKey of Object.keys(states)) {
      const st = states[seatKey];
      const idle = nowMs - st.lastMs;
      if (idle < MOUTH_REST_IDLE_MS) continue;
      const entries = (this._arkitShapeCache || {})[seatKey];
      if (!entries || !entries.length) { delete states[seatKey]; continue; }
      if (!st.from) {
        st.from = {};
        for (const name of st.names) {
          for (const { mesh, map } of entries) {
            if (name in map) { st.from[name] = mesh.morphTargetInfluences[map[name]] || 0; break; }
          }
        }
        st.t0 = st.lastMs + MOUTH_REST_IDLE_MS;
      }
      const t = Math.min(1, (nowMs - st.t0) / MOUTH_REST_MS);
      const k = 0.5 + 0.5 * Math.cos(Math.PI * t);
      for (const name of st.names) {
        const from = st.from[name] || 0;
        const v = t >= 1 ? 0 : from * k;
        for (const { mesh, map } of entries) {
          if (name in map) mesh.morphTargetInfluences[map[name]] = v;
        }
      }
      if (t >= 1) {
        if (!st.logged) {
          st.logged = true;
          const mm = (Math.max(0, st.from.jawOpen || 0) * LIPSYNC_JAW_MM_PER_UNIT).toFixed(2);
          console.log('[courtsim] mouth_AT_REST seat=', seatKey,
            'closed_from_jawOpen=', (st.from.jawOpen || 0).toFixed(4),
            '=', mm, 'mm', 'poses=', st.names.size, 'over_ms=', MOUTH_REST_MS,
            '-- COURTSIM-SCENE-019 DEFECT 4. Before this pass the seat stayed',
            'at that value for the rest of the proceeding.');
        }
        delete states[seatKey];
      }
    }
  }

  restMouths() {
    const states = this._mouthRest || {};
    const past = performance.now() - MOUTH_REST_IDLE_MS;
    for (const st of Object.values(states)) { if (st.lastMs > past) st.lastMs = past; }
  }

  getArkitShapeValue(seatKey, arkitName) {
    const entries = this._arkitShapeMap(seatKey);
    for (const { mesh, map } of entries) {
      if (arkitName in map) return mesh.morphTargetInfluences[map[arkitName]];
    }
    return -1;
  }

  getSeatScreenRect(seatKey, halfSize = 60) {
    const group = this.seatGroups[seatKey];
    if (!group) return null;
    const headBone = group.model.getObjectByName('Bip01_Head') || group.model.getObjectByName('Bip01 Head');
    let center;
    if (headBone) {
      center = headBone.getWorldPosition(new THREE.Vector3());
    } else {
      const box = new THREE.Box3().setFromObject(group.model);
      center = box.getCenter(new THREE.Vector3());
    }
    const projected = center.clone().project(this.camera);
    const cx = Math.round((projected.x * 0.5 + 0.5) * this.canvas.width);
    const cy = Math.round((1 - (projected.y * 0.5 + 0.5)) * this.canvas.height);
    const x0 = Math.max(0, cx - halfSize);
    const y0 = Math.max(0, cy - halfSize);
    const w = Math.min(2 * halfSize, this.canvas.width - x0);
    const h = Math.min(2 * halfSize, this.canvas.height - y0);
    return { cx, cy, x0, y0, w, h };
  }

  getReporterSeatFraming() {
    const st = this._reporterStation;
    if (!st) return null;
    const EYE_Y = FLOOR_Y + CHAIR_SEAT_H + 0.75;   // 1.20 m, seated
    const pos = [st.x, EYE_Y, st.z];
    return { pos, target: st.target };
  }

  _keepOutStandoff() {
    return Math.max(0.25, (this.camera?.near || 0.1) * 2.5);
  }

  getFurnitureKeepOuts() {
    if (this._furnitureKeepOuts) return this._furnitureKeepOuts;
    const EXCLUDE = /floor|ceiling|wall|carpet|troffer|lamp|light|sky|window|backdrop|seal|scales|flag|clock|nameplate|panelling|wainscot/i;
    const out = [];
    const bb = new THREE.Box3();
    this.venueGroup.traverse((n) => {
      if (!n.isMesh || !n.name || EXCLUDE.test(n.name)) return;
      bb.setFromObject(n);
      if (bb.isEmpty()) return;
      const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      if (Math.max(sx, sy, sz) > 8.5) return;          // structural, not furniture
      if (sx < 0.02 && sz < 0.02) return;              // a sliver: nothing to collide with
      const SO = this._keepOutStandoff();   // 0.250 m
      out.push({
        minX: bb.min.x - SO, maxX: bb.max.x + SO,
        minY: bb.min.y - SO, maxY: bb.max.y + SO,
        minZ: bb.min.z - SO, maxZ: bb.max.z + SO,
      });
    });
    this._furnitureKeepOuts = out;
    return out;
  }

  getBodyKeepOuts() {
    const out = [];
    const SO = this._keepOutStandoff();   // COURTSIM-FIX-V, DEFECT V-10
    for (const model of this._avatarModels) {
      if (!model) continue;
      let k = model.userData.__keepOut;
      if (k && Math.abs(model.position.y - k.measuredAtY) > 0.001) k = null;
      if (k && k.standoff !== SO) k = null;   // near plane changed under us
      if (!k) {
        const bb = new THREE.Box3().setFromObject(model);
        if (bb.isEmpty()) continue;
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        const hx = (bb.max.x - bb.min.x) / 2;
        const hz = (bb.max.z - bb.min.z) / 2;
        const r = Math.hypot(hx, hz) + SO;
        k = {
          x: cx, z: cz,
          yMin: bb.min.y - SO,
          yMax: bb.max.y + SO,
          r: Math.min(Math.max(r, 0.45), 1.30),
          measuredAtY: model.position.y,
          standoff: SO,
        };
        model.userData.__keepOut = k;
      }
      out.push(k);
    }
    return out;
  }

  getSeatAnchor(seatKey) {
    const group = this.seatGroups[seatKey];
    if (!group || !group.pos) return null;
    const yaw = group.model ? group.model.rotation.y : 0;
    return {
      pos: [group.pos[0], group.pos[1], group.pos[2]],
      yaw,
      fwd: [Math.sin(yaw), 0, Math.cos(yaw)],
      elevated: !!group.elevated,
    };
  }

  getSeatCloseFraming(seatKey) {
    const group = this.seatGroups[seatKey];
    if (!group) return null;
    const headBone = group.model.getObjectByName('Bip01_Head') || group.model.getObjectByName('Bip01 Head');
    const headWorld = headBone ? headBone.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3(group.pos[0], group.pos[1] + 1.6, group.pos[2]);
    const yaw = group.model.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const closeDist = 2.0;
    const pos = [
      headWorld.x + fwd.x * closeDist,
      headWorld.y + 0.05,
      headWorld.z + fwd.z * closeDist,
    ];
    const target = [headWorld.x, headWorld.y, headWorld.z];
    return { pos, target };
  }
}

const ARKIT_POSE_NAMES = [
  'eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft',
  'eyeSquintLeft', 'eyeWideLeft', 'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight',
  'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight', 'jawForward',
  'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker',
  'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft',
  'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft',
  'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower',
  'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft',
  'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft',
  'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff',
  'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut',
];


export const AVATAR_SEX_BY_ROLE = {
  judge: 'M', witness: 'F', clerk: 'F', bailiff: 'M',
  counsel_a: 'M', counsel_b: 'F',
  juror_1: 'M', juror_2: 'F', juror_3: 'M', juror_4: 'F', juror_5: 'M', juror_6: 'F',
  spectator_1: 'M', spectator_2: 'M', spectator_3: 'M', spectator_4: 'M',
  spectator_5: 'M', spectator_6: 'M',
  spectator_7: 'F', spectator_8: 'F', spectator_9: 'F',
};

export const AVATAR_CASTING_POOL = {
  M: ['juror_3', 'spectator_3', 'juror_1',                // m004, m015, m003 -- jacketed; free in a deposition
      'spectator_2', 'spectator_1',                       // m014, m001 -- m014 is the best a courtroom can free
      'spectator_4', 'juror_5',                           // m019, m006 -- last, and they read casual
      'counsel_a', 'judge'],                              // m008, m005 -- only reachable where they are not loaded
  F: ['juror_6', 'spectator_8', 'spectator_7',            // f005, f016, f009 -- jacketed; free in a deposition
      'spectator_9',                                      // f017 -- the only one a courtroom can free
      'juror_4', 'juror_2',                               // f004, f003 -- last, and they read casual
      'counsel_b', 'witness', 'clerk'],                   // f014, f001, f002 -- only where they are not loaded
};

export const RECASTABLE_SEATS = ['Counsel (Q)', 'Counsel (named)', 'THE WITNESS'];

export function seatRolesForVenueType(type) {
  const defs = type === 'deposition' ? DEPOSITION_SEATS : SEATS;
  const out = {};
  for (const [key, def] of Object.entries(defs)) out[key] = def.role;
  return out;
}

export const COUNSEL_CHAIR_ORDER = ['Counsel (Q)', 'Counsel (named)'];

export function counselSeatAvatarSex() {
  const out = {};
  for (const key of COUNSEL_CHAIR_ORDER) {
    out[key] = seatAvatarSex(key);
  }
  return out;
}

export function counselSeatDefaultAvatarSex() {
  const out = {};
  for (const key of COUNSEL_CHAIR_ORDER) {
    const def = SEATS[key] || DEPOSITION_SEATS[key];
    out[key] = def ? (AVATAR_SEX_BY_ROLE[def.role] || null) : null;
  }
  return out;
}

export function seatAvatarRole(seatKey) {
  if (_castPlan.bySeat[seatKey]) return _castPlan.bySeat[seatKey];
  const def = SEATS[seatKey] || DEPOSITION_SEATS[seatKey];
  return def ? def.role : null;
}
export function seatAvatarSex(seatKey) {
  const role = seatAvatarRole(seatKey);
  return role ? (AVATAR_SEX_BY_ROLE[role] || null) : null;
}

const _castPlan = { bySeat: Object.create(null), notes: [], needs: Object.create(null) };

export function getCastPlan() {
  return { bySeat: { ..._castPlan.bySeat }, notes: _castPlan.notes.slice(),
           needs: { ..._castPlan.needs } };
}

export function planAvatarCasting(needs, venueType) {
  const isDepo = venueType === 'deposition';
  const seatDefs = isDepo ? DEPOSITION_SEATS : SEATS;
  const bySeat = Object.create(null);
  const notes = [];
  const inRoom = new Set(Object.values(seatDefs).map((d) => d.role));
  if (!isDepo) {
    for (const d of JURORS) inRoom.add(d.role);
    for (const d of GALLERY_SPECTATORS) inRoom.add(d.role);
  }
  const claimed = new Set();
  for (const seatKey of RECASTABLE_SEATS) {
    const def = seatDefs[seatKey];
    if (!def) continue;                       // seat does not exist in this venue
    const want = needs[seatKey];
    if (want !== 'M' && want !== 'F') continue;
    const defaultSex = AVATAR_SEX_BY_ROLE[def.role] || null;
    if (defaultSex === want) continue;        // already right -- the shipped path
    const pool = AVATAR_CASTING_POOL[want] || [];
    const pick = pool.find((r) => !inRoom.has(r) && !claimed.has(r));
    if (pick) {
      bySeat[seatKey] = pick;
      claimed.add(pick);
      notes.push({ seat: seatKey, want, from: def.role, to: pick, ok: true });
    } else {
      notes.push({ seat: seatKey, want, from: def.role, to: def.role, ok: false });
    }
  }
  return { bySeat, notes };
}

export function registerCastRequirements(needs, venueType) {
  const next = planAvatarCasting(needs || {}, venueType);
  const before = JSON.stringify(_castPlan.bySeat);
  _castPlan.bySeat = next.bySeat;
  _castPlan.notes = next.notes;
  _castPlan.needs = { ...(needs || {}) };
  const changed = before !== JSON.stringify(next.bySeat);
  for (const n of next.notes) {
    if (n.ok) {
      console.log('[courtsim] avatar_RECAST seat=', n.seat, 'wanted sex', n.want,
        '-- the venue default', n.from, `(${AVATAR_SEX_BY_ROLE[n.from]})`,
        'is the wrong sex for the person in this chair, so the seat takes', n.to,
        `(${AVATAR_SEX_BY_ROLE[n.to]}),`,
        'an identity this venue does not otherwise put in the room.',
        'COURTSIM-FIX-038: the cast decides the body.');
    } else {
      console.warn('[courtsim] avatar_RECAST_UNMET seat=', n.seat, 'wanted sex', n.want,
        'but every', n.want, 'body in AVATAR_CASTING_POOL is already in this room.',
        'The seat keeps', n.from, `(${AVATAR_SEX_BY_ROLE[n.from]}),`,
        'so the person in this chair is shown as the wrong sex. THIS IS VISIBLE AND',
        'IT IS SAID OUT LOUD rather than left for a field test -- see',
        'reports/COURTSIM_FIX_038.md. The fix is another converted identity of that',
        'sex through tools/build_spectators.py.');
    }
  }
  return { changed, bySeat: { ...next.bySeat }, notes: next.notes };
}

export function speakerSexForLabel(label) {
  const u = String(label || '').toUpperCase().trim();
  if (u.startsWith('MS.') || u.startsWith('MRS.') || u.startsWith('MISS ')) return 'F';
  if (u.startsWith('MR.')) return 'M';
  return null; // DR., and anything else -- not guessed
}

export function isNamedCounselLabel(label) {
  const u = String(label || '').toUpperCase().trim();
  return u.startsWith('MR.') || u.startsWith('MS.')
    || u.startsWith('MRS.') || u.startsWith('DR.');
}

const _counselCast = { byLabel: Object.create(null), size: 0 };

export function castFromLabels(labelsInOrder) {
  const sexByChair = counselSeatDefaultAvatarSex();
  const seats = Object.create(null);
  const taken = new Set();
  const counsel = [];
  const seen = new Set();
  for (const label of (labelsInOrder || [])) {
    const key = String(label || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!isNamedCounselLabel(key)) continue;
    counsel.push(key);
  }
  for (const label of counsel) {
    const sex = speakerSexForLabel(label);
    if (!sex) continue;
    const chair = COUNSEL_CHAIR_ORDER.find((c) => sexByChair[c] === sex && !taken.has(c));
    if (chair) { seats[label] = chair; taken.add(chair); }
  }
  let overflow = 0;
  for (const label of counsel) {
    if (seats[label]) continue;
    const chair = COUNSEL_CHAIR_ORDER.find((c) => !taken.has(c));
    if (chair) { seats[label] = chair; taken.add(chair); }
    else { seats[label] = COUNSEL_CHAIR_ORDER[overflow % COUNSEL_CHAIR_ORDER.length]; overflow += 1; }
  }
  return seats;
}

export function setCounselCast(map) {
  const next = Object.create(null);
  let n = 0;
  for (const [label, seat] of Object.entries(map || {})) {
    const key = String(label || '').trim().toUpperCase();
    if (!key || !COUNSEL_CHAIR_ORDER.includes(seat)) continue;
    next[key] = seat; n += 1;
  }
  _counselCast.byLabel = next;
  _counselCast.size = n;
  return n;
}

export function getCounselCast() {
  return { ...(_counselCast.byLabel) };
}

export function seatKeyForSpeaker(speaker) {
  const s = String(speaker == null ? '' : speaker).toUpperCase().trim();
  if (s.startsWith('THE COURT')) return 'THE COURT';
  if (s.startsWith('THE WITNESS')) return 'THE WITNESS';
  if (s.startsWith('THE CLERK')) return 'THE CLERK';
  if (isNamedCounselLabel(s)) {
    const registered = _counselCast.byLabel[s];
    if (registered) return registered;
    const sex = speakerSexForLabel(s);
    if (sex) {
      const sexByChair = counselSeatDefaultAvatarSex();
      const chair = COUNSEL_CHAIR_ORDER.find((c) => sexByChair[c] === sex);
      if (chair) return chair;
    }
    return COUNSEL_CHAIR_ORDER[0];
  }
  return 'OTHER SPEAKERS';
}
