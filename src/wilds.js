// The wider world around the village: rolling woods with hiking trails, a creek with a waterfall,
// the steps cut down the cliff face, the cove at the bottom and its dock.
// This file is the layout and the rules for walking on it (heights, where you can go);
// woods.js and cove.js build what you see.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (dx, dz, s) => Math.exp(-(dx * dx + dz * dz) / (2 * s * s));
const lerp = (a, b, t) => a + (b - a) * t;

export const SEA_Y = -8;

export const W = {
  edge: 61, // the woods are walkable out to here (east, north and south)
  cliffEdgeX: -18.35, // the clifftop: no further west except on the cliff steps
  summit: { x: 45, z: -41 },
  pool: { x: 40.6, z: 26.6, r: 3.4, y: 2.2 },
  lip: { x: 45.1, z: 27.35, y: 4.9 },
  cabin: { x: 54.5, z: -9, yaw: -Math.PI / 2 - 0.25 },
  ruins: { x: 52.5, z: 17 },
  fairy: { x: 16.5, z: 54.5 },
  meadow: { x: 25, z: -31, r: 8.5 },
  cove: { z0: 4.2, z1: 21.5 },
  dock: { x0: -37.5, x1: -22.4, z: 13, hw: 1.1, y: -7.0 },
  cliffFall: { x: -19.9, z: 47.6 },
};

// ---------- polylines ----------
// Control points -> a smooth curve sampled about every `step` metres. Points may carry a height.
function densify(ctrl, step = 0.8) {
  const pts = ctrl.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z, p.y]);
}

// Segments bucketed into a grid so "what's near here" stays cheap.
class SegGrid {
  constructor(cell = 6) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 4096 + j; }
  add(seg, pad) {
    const c = this.cell;
    const i0 = Math.floor((Math.min(seg.ax, seg.bx) - pad) / c), i1 = Math.floor((Math.max(seg.ax, seg.bx) + pad) / c);
    const j0 = Math.floor((Math.min(seg.az, seg.bz) - pad) / c), j1 = Math.floor((Math.max(seg.az, seg.bz) + pad) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = this.key(i, j);
      let list = this.map.get(k);
      if (!list) this.map.set(k, (list = []));
      list.push(seg);
    }
  }
  at(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))) || EMPTY; }
}
const EMPTY = [];

function project(seg, x, z) {
  const dx = seg.bx - seg.ax, dz = seg.bz - seg.az;
  const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (z - seg.az) * dz) / (dx * dx + dz * dz || 1)));
  return { t, d: Math.hypot(x - seg.ax - dx * t, z - seg.az - dz * t) };
}

// ---------- hiking trails ----------
export const TRAILS = [
  { id: 'east', name: 'Woodland Loop', pts: [[15, -3], [20.5, -3.2], [25.5, -1.6], [31, -1.5]] },
  { id: 'summit', name: 'Summit Path', pts: [[31, -1.5], [34.5, -7.5], [37.3, -15], [39.8, -23], [42.3, -31], [44.2, -37], [45, -40.2]] },
  { id: 'ridge', name: 'Ridge Walk', pts: [[45, -40.2], [39.5, -46.5], [30.5, -49.5], [21.5, -47.5], [13.5, -44], [6.5, -39], [1, -35.5], [-3.5, -35]] },
  { id: 'hamlet', name: 'Windmill Way', pts: [[-3.5, -35], [-8, -32.5], [-11.2, -27.8], [-12.6, -22.6], [-12.3, -19], [-11.8, -15.6]] },
  { id: 'meadow', name: 'Meadow Cut', pts: [[39.8, -23], [33.5, -26.5], [27.5, -30.5], [21.5, -34], [17, -38.5], [13.5, -44]] },
  { id: 'south', name: 'Falls Path', pts: [[31, -1.5], [33.8, 5], [35.8, 12], [37.2, 18], [38.4, 22.4]] },
  { id: 'creekside', name: 'Creekside Walk', pts: [[38.4, 22.4], [34.8, 25.8], [30.8, 29], [26, 32.2], [19.2, 34.6], [12, 35.6], [6.2, 32.8], [2.6, 28], [1, 23.2], [0.6, 19.6], [1.5, 14], [4.6, 8.7]] },
  { id: 'cabin', name: 'Cabin Spur', pts: [[31, -1.5], [37, -2.6], [43, -4.4], [48.6, -6.6], [52.2, -8.2]] },
  { id: 'ruins', name: 'Ruins Spur', pts: [[38.4, 22.4], [43.6, 21.2], [48, 19], [50.8, 17.8]] },
  { id: 'fairy', name: 'Fairy Glen', pts: [[19.2, 34.6], [18.4, 40], [17.6, 45.2], [17, 49.5], [16.6, 52.2]] },
];
const TRAIL_HW = 0.85; // half width of the worn tread
const trailGrid = new SegGrid(6);
let trailSegs = [];

// ---------- the creek ----------
// [x, z, water surface height]; it tumbles over a waterfall into a pool, then winds to the cliff and falls into the sea.
const CREEK_UP = [[61.5, 33.5, 6.3], [55.5, 32, 5.8], [50, 29.6, 5.3], [W.lip.x, W.lip.z, W.lip.y]];
const CREEK_LO = [[41.6, 27.4, W.pool.y], [37.2, 30.4, 2.1], [33, 34.2, 1.95], [28, 39, 1.75], [21, 43.8, 1.5], [13, 47.4, 1.25], [4, 49, 1.0], [-5, 49.4, 0.75], [-12, 48.6, 0.5], [W.cliffFall.x, W.cliffFall.z, 0.3]];
const creekGrid = new SegGrid(8);
export const CREEK = { upper: [], lower: [] };
export const BRIDGE = { x: 17.45, z: 45.6, len: 6.4, hw: 0.8, yaw: 0, y: 0 };

// ---------- the cliff steps ----------
// Three flights cut into the cliff face and a wooden stair onto the beach.
export const CLIFF_LEGS = [
  { a: [-19.05, 0.9, 0.0], b: [-19.72, -10.5, -2.9], hw: 0.72, kind: 'rock' },
  { a: [-21.2, -10.9, -3.05], b: [-21.62, 1.6, -5.85], hw: 0.72, kind: 'rock' },
  { a: [-21.78, 2.7, -5.95], b: [-21.35, 7.9, -6.84], hw: 0.62, kind: 'wood' },
];
export const CLIFF_LANDINGS = [
  { x: -20.45, z: -11.45, y: -2.97, r: 1.3 },
  { x: -21.75, z: 2.2, y: -5.9, r: 0.95 },
];
const legSegs = CLIFF_LEGS.map((l) => ({ ax: l.a[0], az: l.a[1], bx: l.b[0], bz: l.b[1], y0: l.a[2], y1: l.b[2], hw: l.hw, kind: l.kind }));

// ---------- the cove ----------
const coveS = (z) => (z < W.cove.z0 || z > W.cove.z1 ? 0 : 1.8 * Math.sin((Math.PI * (z - W.cove.z0)) / (W.cove.z1 - W.cove.z0)));
// sand height: high under the cliff, sloping into the sea
export function beachHeight(x, z) {
  const run = Math.max(0, -20.2 - x - coveS(z));
  return -6.85 - run * 0.22 + Math.sin(x * 1.3 + z * 0.7) * 0.03;
}
export const shoreX = (z) => -25.43 - coveS(z); // where the sand meets the sea (sea level)
export function inCove(x, z, m = 0) { return z > W.cove.z0 + m && z < W.cove.z1 - m && x < -19.7 && x > -30; }
export const onDock = (x, z, m = 0) => x > W.dock.x0 + m && x < W.dock.x1 - m && Math.abs(z - W.dock.z) < W.dock.hw - m;
// the dock ramps up from the sand
export function dockHeight(x) { return x > -23.6 ? lerp(beachHeight(-22.4, W.dock.z) + 0.04, W.dock.y, smooth(-22.4, -23.6, x)) : W.dock.y; }

// ---------- hills ----------
export function hills(x, z) {
  const e = Math.hypot(Math.max(0, x - 19.5), Math.max(0, Math.abs(z) - 19.5));
  if (e <= 0) return 0;
  const rise = smooth(0, 18, e);
  let h = rise * (3.0 + 1.5 * Math.sin(x * 0.085 + 1.1) * Math.cos(z * 0.07 - 0.4) + 1.1 * Math.sin(x * 0.047 - z * 0.11 + 2.0) + 0.45 * Math.sin(x * 0.19 + z * 0.15));
  h += rise * (8.5 * gauss(x - W.summit.x, z - W.summit.z, 11) + 3.6 * gauss(x - 56, z - 29, 9) + 2.0 * gauss(x - 8, z + 45, 10) - 1.3 * gauss(x - W.meadow.x, z - W.meadow.z, 8));
  // wooded mountains close the map in (steep enough to stop you, not a wall in the sky)
  const edge = Math.max(x - 60, Math.abs(z) - 60, 0);
  if (edge > 0) h += 24 * smooth(0, 38, edge) * (0.75 + 0.25 * Math.sin(x * 0.05 + z * 0.07)) + 6 * smooth(0, 6, edge);
  return h;
}

// ---------- setup ----------
let raw = null; // village + hills, before trails and the creek are cut in
export function initWilds(rawHeight) {
  raw = rawHeight;
  // creek: densify with heights
  for (const [name, ctrl] of [['upper', CREEK_UP], ['lower', CREEK_LO]]) {
    const pts = densify(ctrl, 1.2);
    // water sits below its banks and only ever runs downhill
    for (let i = 0; i < pts.length; i++) {
      pts[i][2] = Math.min(pts[i][2], rawAt(pts[i][0], pts[i][1]) - 0.45);
      if (i > 0) pts[i][2] = Math.min(pts[i][2], pts[i - 1][2] - 0.003);
    }
    CREEK[name] = pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az, ay] = pts[i], [bx, bz, by] = pts[i + 1];
      const k = i / (pts.length - 1);
      const hw = name === 'upper' ? 0.9 : lerp(1.25, 1.75, k);
      creekGrid.add({ ax, az, bx, bz, y0: ay, y1: by, hw, name }, hw + 7);
    }
  }
  // trails: each gets a smoothed height profile so the tread is even
  trailSegs = [];
  for (const tr of TRAILS) {
    const pts = densify(tr.pts, 0.9);
    let hs = pts.map(([x, z]) => rawAt(x, z));
    for (let it = 0; it < 4; it++) hs = hs.map((h, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < hs.length) { s += hs[j]; n++; } } return s / n; });
    tr.line = pts.map(([x, z], i) => [x, z, hs[i]]);
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], y0: hs[i], y1: hs[i + 1], trail: tr };
      trailSegs.push(seg);
      trailGrid.add(seg, TRAIL_HW + 3);
    }
  }
  // the footbridge sits where the Fairy Glen path crosses the creek
  const fl = TRAILS.find((t) => t.id === 'fairy').line;
  let best = null;
  for (let i = 0; i < fl.length - 1; i++) {
    const c = creekAt(fl[i][0], fl[i][1]);
    if (c && (!best || c.d < best.d)) best = { d: c.d, i, c };
  }
  if (best) {
    const a = fl[Math.max(0, best.i - 3)], b = fl[Math.min(fl.length - 1, best.i + 4)];
    BRIDGE.x = (a[0] + b[0]) / 2; BRIDGE.z = (a[1] + b[1]) / 2;
    BRIDGE.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    BRIDGE.len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 1;
    BRIDGE.y = best.c.wy + 0.75;
    BRIDGE.ends = [rawAt(a[0], a[1]), rawAt(b[0], b[1])];
  }
}
const rawAt = (x, z) => raw(x, z);

// ---------- queries ----------
export function trailAt(x, z) {
  let best = null;
  for (const s of trailGrid.at(x, z)) {
    const p = project(s, x, z);
    if (!best || p.d < best.d) best = { d: p.d, h: lerp(s.y0, s.y1, p.t), seg: s, t: p.t };
  }
  return best;
}
// 0..1: how much of a worn trail is here (for colour, grass, decoration)
export function trailAmt(x, z) {
  const t = trailAt(x, z);
  if (!t) return 0;
  return 1 - smooth(TRAIL_HW * 0.75, TRAIL_HW + 0.35, t.d);
}
export function creekAt(x, z) {
  let best = null;
  for (const s of creekGrid.at(x, z)) {
    const p = project(s, x, z);
    if (!best || p.d < best.d) best = { d: p.d, wy: lerp(s.y0, s.y1, p.t), hw: s.hw, seg: s, t: p.t };
  }
  return best;
}
function legAt(x, z) {
  let best = null;
  for (const s of legSegs) {
    const p = project(s, x, z);
    if (p.d < s.hw + 0.05 && (!best || p.d < best.d)) best = { d: p.d, y: lerp(s.y0, s.y1, p.t), seg: s, t: p.t };
  }
  for (const l of CLIFF_LANDINGS) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < l.r && (!best || d < best.d)) best = { d, y: l.y, landing: l };
  }
  return best;
}
export function onBridge(x, z) {
  const c = Math.cos(BRIDGE.yaw), s = Math.sin(BRIDGE.yaw);
  const dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  const along = dx * s + dz * c, across = dx * c - dz * s;
  if (Math.abs(across) > BRIDGE.hw || Math.abs(along) > BRIDGE.len / 2) return null;
  const k = along / (BRIDGE.len / 2); // -1..1
  const ends = BRIDGE.ends || [BRIDGE.y, BRIDGE.y];
  const base = lerp(ends[0], ends[1], (k + 1) / 2);
  return Math.max(base, BRIDGE.y + 0.35 * (1 - k * k)) + 0.02;
}

// Terrain after the trails, creek, pool and cliff steps are cut in.
export function shapeTerrain(x, z, h) {
  // trails: blend toward the smoothed tread height, slightly worn in
  const t = trailAt(x, z);
  if (t && t.d < TRAIL_HW + 2.6) {
    const k = 1 - smooth(TRAIL_HW, TRAIL_HW + 2.6, t.d);
    h = lerp(h, t.h - 0.035 * (1 - smooth(0, TRAIL_HW, t.d)), k);
  }
  // creek bed and banks
  const c = creekAt(x, z);
  if (c && c.d < c.hw + 7) {
    const bed = c.d < c.hw ? c.wy - 0.55 * (1 - (c.d / c.hw) ** 2) - 0.05 : c.wy + 0.08 + (c.d - c.hw) * 0.6;
    h = Math.min(h, bed);
  }
  // the pool under the waterfall
  const dp = Math.hypot(x - W.pool.x, z - W.pool.z);
  if (dp < W.pool.r + 6) {
    // the bank is a steep rock step on the waterfall side
    const lx = W.lip.x - W.pool.x, lz = W.lip.z - W.pool.z, ll = Math.hypot(lx, lz);
    const facing = Math.max(0, ((x - W.pool.x) * lx + (z - W.pool.z) * lz) / (ll * (dp || 1)));
    const slope = 0.75 + 3.2 * facing * facing;
    h = Math.min(h, dp < W.pool.r ? W.pool.y - 0.95 * (1 - (dp / W.pool.r) ** 2) - 0.05 : W.pool.y + 0.1 + (dp - W.pool.r) * slope);
  }
  // the cliff steps are cut down into the clifftop
  if (x < -18 && z > -13 && z < 3.5) {
    for (const s of legSegs) {
      const p = project(s, x, z);
      const y = lerp(s.y0, s.y1, p.t);
      h = Math.min(h, y - 0.03 + Math.max(0, p.d - s.hw) * 3.2);
    }
    for (const l of CLIFF_LANDINGS) h = Math.min(h, l.y - 0.03 + Math.max(0, Math.hypot(x - l.x, z - l.z) - l.r) * 3.2);
  }
  return h;
}

// Something special to stand on here (cliff steps, the beach, the dock, the bridge)? Height, or null.
// `y` (the walker's current height) picks the right flight where the steps pass above each other.
export function specialGround(x, z, y) {
  if (x < -18.3) {
    const leg = legAt(x, z);
    if (leg && (y === undefined || Math.abs(leg.y - y) < 1.2)) return leg.y;
    if (onDock(x, z)) return dockHeight(x);
    if (inCove(x, z)) return beachHeight(x, z);
    return null;
  }
  if (x > 10 && z > 40) {
    const b = onBridge(x, z);
    if (b !== null) return b;
  }
  return null;
}

// Can you be here at all? (water is checked separately)
export function walkable(x, z, y) {
  if (x < W.cliffEdgeX) {
    const leg = legAt(x, z);
    if (leg && (y === undefined || Math.abs(leg.y - y) < 1.2)) return true;
    if (onDock(x, z)) return true;
    if (inCove(x, z) && x < -20.0 && beachHeight(x, z) > SEA_Y + 0.3) return true;
    if (inCove(x, z) && x >= -20.0 && x < -19.75) return true; // right under the cliff
    return false;
  }
  return x < W.edge && Math.abs(z) < W.edge;
}

// Deep enough to stop you walking (creek and pool; the sea is "not walkable")
export function wildWater(x, z) {
  if (Math.hypot(x - W.pool.x, z - W.pool.z) < W.pool.r - 0.3) return true;
  const c = creekAt(x, z);
  if (c && c.d < c.hw * 0.7) {
    if (onBridge(x, z) !== null) return false;
    return true;
  }
  return false;
}

// Is this open water a boat can float in?
export function sailable(x, z, r = 1.2) {
  if (x > -22.2) return false;
  if (inCove(x, z, -2) && x > shoreX(z) - r) return false;
  if (Math.abs(z - W.dock.z) < W.dock.hw + r * 0.6 && x > W.dock.x0 - r && x < W.dock.x1) return false;
  if (Math.hypot(x, z) > 330) return false;
  return true;
}

// Grass grows less on trails and not in water.
export function wildGrass(x, z) {
  const t = trailAmt(x, z);
  const c = creekAt(x, z);
  let k = 1 - t;
  if (c) k *= smooth(c.hw * 0.9, c.hw + 1.2, c.d);
  k *= smooth(W.pool.r, W.pool.r + 1.2, Math.hypot(x - W.pool.x, z - W.pool.z));
  return k;
}

// Spots for things to find, by zone (deterministic).
export function findSpots(rng, colliders, terrainHeight) {
  const spots = [];
  const blocked = (x, z, m) => colliders.near(x, z, m);
  const tryAdd = (x, z, zone) => {
    if (blocked(x, z, 0.5) || wildWater(x, z)) return false;
    spots.push({ x, z, y: terrainHeight(x, z), zone });
    return true;
  };
  // along the trails, a little off the tread
  for (const tr of TRAILS) {
    const line = tr.line;
    for (let i = 4; i < line.length - 4; i += 6) {
      const [x, z] = line[i], [x2, z2] = line[i + 1];
      const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
      const side = rng() < 0.5 ? -1 : 1, off = 1.4 + rng() * 2.4;
      const px = x - (dz / l) * off * side, pz = z + (dx / l) * off * side;
      const zone = Math.hypot(px - W.meadow.x, pz - W.meadow.z) < W.meadow.r + 3 ? 'meadow' : creekAt(px, pz)?.d < 4 ? 'creek' : 'woods';
      tryAdd(px, pz, zone);
    }
  }
  // the meadow, the creek banks, the summit, the glen
  for (let i = 0; i < 14; i++) { const a = rng() * Math.PI * 2, r = rng() * W.meadow.r; tryAdd(W.meadow.x + Math.cos(a) * r, W.meadow.z + Math.sin(a) * r, 'meadow'); }
  for (const pts of [CREEK.lower]) for (let i = 6; i < pts.length - 4; i += 4) {
    const [x, z] = pts[i]; const c = creekAt(x, z); const off = (c?.hw || 1.4) + 0.7 + rng() * 0.8; const side = rng() < 0.5 ? -1 : 1;
    const [x2, z2] = pts[i + 1]; const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
    tryAdd(x - (dz / l) * off * side, z + (dx / l) * off * side, 'creek');
  }
  for (let i = 0; i < 6; i++) { const a = rng() * Math.PI * 2, r = 2.5 + rng() * 3; tryAdd(W.fairy.x + Math.cos(a) * r, W.fairy.z + Math.sin(a) * r, 'glen'); }
  for (let i = 0; i < 4; i++) { const a = rng() * Math.PI * 2, r = 3 + rng() * 3; tryAdd(W.summit.x + Math.cos(a) * r, W.summit.z + Math.sin(a) * r, 'summit'); }
  // the beach
  for (let i = 0; i < 26; i++) {
    const z = W.cove.z0 + 1 + rng() * (W.cove.z1 - W.cove.z0 - 2);
    const x = lerp(-20.5, shoreX(z) + 0.6, rng());
    if (onDock(x, z, -0.6)) continue;
    spots.push({ x, z, y: beachHeight(x, z), zone: 'beach' });
  }
  return spots;
}
