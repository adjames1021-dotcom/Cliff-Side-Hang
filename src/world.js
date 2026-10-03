// The hand-made map: a hillside village square on a sea cliff.
import * as THREE from 'three';
import { C, MAT, Builder, rbox, sphere, capsule, torus, lathe, roundCyl, matrixOf, toonMaterial, rng, hash, outlineMaterial, addSmoothNormals } from './toon.js';
import { REAL, registerMesh } from './materials.js';
import { Foliage, noiseRock } from './foliage.js';
import { W as WILD, initWilds, hills, shapeTerrain, specialGround, walkable as wildWalkable, wildWater, trailAmt, creekAt, wildGrass, sailable, beachHeight, inCove, onDock } from './wilds.js';
import { planWoods, buildWoods, signBoard } from './woods.js';
import { buildCove } from './cove.js';
import { makeSailboat } from './boats.js';
import { seaHeight } from './water.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- layout (metres; north is -z, the sea is to the west) ----------
export const L = {
  bounds: { minX: -18.3, maxX: 19, minZ: -19, maxZ: 19 },
  cliffX: -19.6,
  seaY: -8,
  plaza: { x: 0, z: 0, r: 7.4 },
  fountain: { x: 0, z: 0, r: 2.15 },
  cafe: { x0: 8, x1: 14, z0: -13, z1: -9.4, h: 2.8 },
  counter: { x0: 9.2, x1: 12.8, z0: -9.4, z1: -8.55, h: 0.95 },
  pond: { x: 10, z: 9, r: 4.7, water: -0.32 },
  dock: { x0: 4.5, x1: 8.7, z0: 8.3, z1: 9.7, y: 0.1 },
  fishSpot: { x: 8.3, z: 9, yaw: Math.PI / 2 },
  swings: { x: -11, z: 7.5, top: 2.5, len: 1.9, xs: [-11.85, -10.15] },
  seesaw: { x: -6.2, z: 12.6, h: 0.45, half: 1.7 },
  blanket: { x: -4.4, z: 7.4 },
  basket: { x: -3.65, z: 6.85 },
  ballSpawn: { x: -9, z: 13.6 },
  stage: { x0: -4, x1: 4, z0: -15.9, z1: -11.8, h: 0.32, stepZ: -11.2, stepH: 0.16 },
  campfire: { x: -11.5, z: -3 },
  lookout: { x: -14.5, z: -14, h: 1.3, r: 5.5 },
  telescope: { x: -16.4, z: -14.3, standX: -15.6 },
  spawn: { x: 0, z: 5.6 },
  seaStacks: [[-26, -30, 2.2], [-29, 22, 2.8], [-23.8, 4, 1.2], [-32, -8, 1.6]],
  lighthouse: { x: -29, z: 22, y: -0.9 },
  windmill: { x: -3, z: -29.5 },
};

// village shape (mounds, the pond) on top of the hills, before trails and the creek are cut in
function rawHeight(x, z) {
  let h = hills(x, z);
  const dl = Math.hypot(x - L.lookout.x, z - L.lookout.z);
  if (dl < L.lookout.r) h += L.lookout.h * (0.5 + 0.5 * Math.cos((Math.PI * dl) / L.lookout.r));
  const dp = Math.hypot(x - L.pond.x, z - L.pond.z);
  if (dp < 5.4) h -= 0.95 * (1 - smooth(3.2, 5.4, dp));
  return h;
}
initWilds(rawHeight);

export function terrainHeight(x, z) {
  return shapeTerrain(x, z, rawHeight(x, z));
}

export const inDock = (x, z, m = 0) => x >= L.dock.x0 - 0.3 && x <= L.dock.x1 - m && z >= L.dock.z0 + m && z <= L.dock.z1 - m;

function stageHeight(x, z) {
  const s = L.stage;
  if (x < s.x0 || x > s.x1) return -1;
  if (z >= s.z0 && z <= s.z1) return s.h;
  if (z > s.z1 && z <= s.stepZ && Math.abs(x) <= 2.5) return s.stepH;
  return -1;
}

// Height of whatever you'd stand on (terrain, cobbles, stage, dock, cliff steps, beach, bridge).
// `y` (the walker's height) helps where paths pass above one another.
export function groundHeight(x, z, y) {
  const sp = specialGround(x, z, y);
  if (sp !== null) return sp;
  let h = terrainHeight(x, z);
  const dp = Math.hypot(x - L.plaza.x, z - L.plaza.z);
  if (dp < 7.5) h = Math.max(h, 0.035 * (1 - smooth(7.25, 7.5, dp)));
  const st = stageHeight(x, z);
  if (st > h) h = st;
  if (inDock(x, z)) h = Math.max(h, L.dock.y);
  return h;
}

export const isWater = (x, z, m = 0.3) =>
  (Math.hypot(x - L.pond.x, z - L.pond.z) < 4.75 && !inDock(x, z, m * 0.5)) || (x > 19 || Math.abs(z) > 19 ? wildWater(x, z) : false);
export const walkable = (x, z, y) => wildWalkable(x, z, y);

// A weathered sea stack: a tapered, lumpy pillar with ledges, base at the origin.
function stackGeo(R, s, h) {
  const g = new THREE.CylinderGeometry(s * 0.72, s * 1.15, h, 18, 14, false);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position, v = new THREE.Vector3();
  const o = [R() * 10, R() * 10, R() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), t = v.y / h;
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-4) continue;
    const ledge = Math.sin(t * 9 + o[0]) > 0.6 ? 0.08 : 0;
    const n = Math.sin(a * 3 + o[1] + t * 2) * 0.12 + Math.sin(a * 7 + o[2] - t * 5) * 0.06 + Math.sin(t * 23 + a * 2) * 0.03 + ledge;
    const k = 1 + n - (t > 0.97 ? 0.15 : 0);
    v.x *= k; v.z *= k;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Max ground height under a footprint, so things never float.
function placeY(x, z, r = 0.5) {
  let h = -Infinity, lo = Infinity;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, -r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, r * 0.7]]) {
    const g = terrainHeight(x + dx, z + dz);
    h = Math.max(h, g); lo = Math.min(lo, g);
  }
  return { y: h, drop: h - lo + 0.06 };
}

// local (lx, lz) of something at (x, z) facing `yaw` -> world
export function toWorld(x, z, yaw, lx, lz) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
}
export const yawTo = (fx, fz) => Math.atan2(fx, fz);

// ---------- world ----------
export function buildWorld(scene, fx) {
  const colliders = [];
  const seats = [];
  const smokeSpots = [];
  const lampGlows = [];
  const lampPosts = [];
  const blossoms = [];
  const R = rng(7);
  // colliders are also bucketed into a grid so "what's near me" is quick even with a forest of them
  const CG = 4, cgrid = new Map(), NONE = [];
  const gkey = (i, j) => i * 10007 + j;
  const gridAdd = (c, x0, z0, x1, z1) => {
    for (let i = Math.floor((x0 - 1.5) / CG); i <= Math.floor((x1 + 1.5) / CG); i++) for (let j = Math.floor((z0 - 1.5) / CG); j <= Math.floor((z1 + 1.5) / CG); j++) {
      const k = gkey(i, j);
      let l = cgrid.get(k);
      if (!l) cgrid.set(k, (l = []));
      l.push(c);
    }
  };
  const collidersNear = (x, z) => cgrid.get(gkey(Math.floor(x / CG), Math.floor(z / CG))) || NONE;
  const circle = (x, z, r) => { const c = { c: true, x, z, r }; colliders.push(c); gridAdd(c, x - r, z - r, x + r, z + r); };
  const box = (x0, z0, x1, z1) => { const c = { c: false, x0, z0, x1, z1 }; colliders.push(c); gridAdd(c, x0, z0, x1, z1); };
  const camBoxes = []; // solid things cameras shouldn't end up inside
  const HOMES = [[-8, -25, 0], [5, -26.5, 0.2], [15, -24.5, -0.3], [25.5, -9, -1.4], [26, 5, -1.7], [24.5, 15, -2.1], [-6, 25.5, Math.PI], [9, 26, Math.PI + 0.3]];
  const nearHome = (x, z, r) => HOMES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < r);

  const groups = {};
  let terrainGeo = null;
  const fol = new Foliage();
  const B = (name) => (groups[name] ||= new Builder());
  const G = new Builder(); // glowing bits
  const W = new Builder(); // windows that light up at night

  // ---------- terrain ----------
  // fine grid over the village, a little coarser over the woods, sparse out to the mountains
  const xs = [], zs = [];
  for (let i = 0; i <= 130; i++) xs.push(-19.6 + (40.6 * i) / 130);
  for (let i = 1; i <= 76; i++) xs.push(21 + (41 * i) / 76);
  for (let i = 1; i <= 26; i++) xs.push(62 + 108 * Math.pow(i / 26, 1.7));
  for (let i = 26; i >= 1; i--) zs.push(-62 - 108 * Math.pow(i / 26, 1.7));
  for (let i = 0; i < 76; i++) zs.push(-62 + (41 * i) / 76);
  for (let i = 0; i <= 130; i++) zs.push(-21 + (42 * i) / 130);
  for (let i = 1; i <= 76; i++) zs.push(21 + (41 * i) / 76);
  for (let i = 1; i <= 26; i++) zs.push(62 + 108 * Math.pow(i / 26, 1.7));

  const paths = [
    [[0, -7.3], [0, -11.2]], [[5.2, -5.2], [9.5, -7.9]], [[-7.2, -1.2], [-9.4, -2.4]],
    [[-5.4, 5.0], [-7.5, 8.0]], [[6.6, 3.4], [4.6, 8.7]], [[-5.2, -5.2], [-11.2, -10.8]],
    [[-11.2, -10.8], [-13.2, -12.6]], [[7.2, -1.6], [15, -3]], [[-11.8, -15.6], [-11.2, -10.8]],
    [[-12.6, 0.2], [-17.2, 1.4]],
  ];
  const segDist = (px, pz, [a, b]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
  };
  const pathAmt = (x, z) => {
    let d = 9;
    for (const p of paths) d = Math.min(d, segDist(x, z, p));
    return 1 - smooth(0.7, 1.05, d + (hash(x, z) - 0.5) * 0.25);
  };

  const cGrass = new THREE.Color('#5E8A3E'), cGrass2 = new THREE.Color('#527E36'), cGrass3 = new THREE.Color('#6F9A48');
  const cPath = new THREE.Color('#A68E6C'), cSand = new THREE.Color('#CDB892'), cBed = new THREE.Color('#6E6550');
  const cPlaza = new THREE.Color('#8E8579'), cHill = new THREE.Color('#5A8638'), cHill2 = new THREE.Color('#7A9A4A');
  const cFloor = new THREE.Color('#4F5A2C'), cFloor2 = new THREE.Color('#5E5232'), cTrail = new THREE.Color('#8C7556'), cTrailEdge = new THREE.Color('#6B5A40');
  const cBank = new THREE.Color('#6E6450'), cMud = new THREE.Color('#5A4E3C'), cRock = new THREE.Color('#857C70'), cMeadow = new THREE.Color('#7FA54C');
  const woodsPlan = planWoods({ terrainHeight, avoid: (x, z) => nearHome(x, z, 4.4) || Math.hypot(x - L.windmill.x, z - L.windmill.z) < 7 || Math.hypot(x - WILD.cabin.x, z - WILD.cabin.z) < 7.5 || Math.hypot(x - WILD.ruins.x, z - WILD.ruins.z) < 7 || Math.hypot(x - WILD.summit.x, z - WILD.summit.z) < 6 || Math.hypot(x - WILD.fairy.x, z - WILD.fairy.z) < 5 });
  // how shaded by the canopy a spot is (for the forest floor colour)
  const canopyCell = new Map();
  for (const t of woodsPlan) { const k = Math.floor(t.x / 4) * 1000 + Math.floor(t.z / 4); canopyCell.set(k, (canopyCell.get(k) || 0) + 1); }
  const canopy = (x, z) => { let n = 0; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) n += canopyCell.get((Math.floor(x / 4) + i) * 1000 + Math.floor(z / 4) + j) || 0; return Math.min(1, n / 5); };
  {
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    const tmp = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = (j * nx + i) * 3;
      const h = terrainHeight(x, z);
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      const n = hash(Math.floor(x * 0.5), Math.floor(z * 0.5));
      tmp.copy(cGrass).lerp(n > 0.5 ? cGrass2 : cGrass3, Math.abs(n - 0.5));
      const e = Math.hypot(Math.max(0, x - 19.5), Math.max(0, Math.abs(z) - 19.5));
      if (e > 0) {
        tmp.lerp(Math.sin(x * 0.2 + z * 0.13) > 0 ? cHill : cHill2, smooth(0, 10, e) * 0.6);
        const cn = canopy(x, z);
        if (cn > 0) tmp.lerp(hash(Math.floor(x * 0.7), Math.floor(z * 0.7)) > 0.5 ? cFloor : cFloor2, cn * 0.75);
        const dm = Math.hypot(x - WILD.meadow.x, z - WILD.meadow.z);
        if (dm < WILD.meadow.r + 4) tmp.lerp(cMeadow, (1 - smooth(WILD.meadow.r, WILD.meadow.r + 4, dm)) * 0.6);
        const cr = creekAt(x, z);
        if (cr && cr.d < cr.hw + 2.5) tmp.lerp(cr.d < cr.hw ? cMud : cBank, 1 - smooth(cr.hw, cr.hw + 2.5, cr.d));
        const dpo = Math.hypot(x - WILD.pool.x, z - WILD.pool.z);
        if (dpo < WILD.pool.r + 2) tmp.lerp(cBank, 1 - smooth(WILD.pool.r, WILD.pool.r + 2, dpo));
        const edge = Math.max(x - 60, Math.abs(z) - 60);
        if (edge > 0) tmp.lerp(cRock, smooth(0, 14, edge) * 0.7);
      }
      const ta = trailAmt(x, z);
      if (ta > 0) tmp.lerp(ta > 0.6 ? cTrail : cTrailEdge, Math.min(1, ta * 1.2) * (0.85 + 0.15 * hash(Math.floor(x * 3), Math.floor(z * 3))));
      const pa = pathAmt(x, z);
      if (pa > 0) tmp.lerp(cPath, pa);
      const dpz = Math.hypot(x, z);
      if (dpz < 7.6) tmp.lerp(cPlaza, 1 - smooth(7.2, 7.6, dpz));
      const dp = Math.hypot(x - L.pond.x, z - L.pond.z);
      if (dp < 5.6) tmp.lerp(cSand, 1 - smooth(4.9, 5.6, dp));
      if (dp < 4.6) tmp.lerp(cBed, 1 - smooth(3.9, 4.6, dp));
      col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const terrain = new THREE.Mesh(g, REAL.ground);
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    registerMesh(terrain, 'ground');
    scene.add(terrain);
    terrainGeo = g;
  }

  // ---------- cliff face + sea ----------
  {
    const cols = [], rows = 30;
    for (let z = -95; z <= 95; z += 0.45) cols.push(z);
    const pos = [], col = [], idx = [];
    const bands = ['#B89474', '#A9835F', '#C3A07C', '#9E7A5A', '#B08A66', '#C9A983', '#987456'].map((c) => new THREE.Color(c));
    cols.forEach((z, i) => {
      const top = terrainHeight(-19.6, z);
      const cove = smooth(3.0, 5.2, z) * (1 - smooth(20.6, 22.8, z)); // the cove's wall stands straight up
      const steps = smooth(-13.4, -12.2, z) * (1 - smooth(2.6, 3.8, z)); // keep the rock behind the cliff steps
      for (let r = 0; r <= rows; r++) {
        const k = r / rows;
        const y = top + (-9.2 - top) * k;
        const bump = r === 0 ? 0 : (Math.sin(z * 0.9 + r * 0.6) * 0.3 + Math.sin(z * 0.31 + r * 1.3) * 0.5 + Math.sin(z * 2.3 + y * 1.7) * 0.12 + hash(i, r) * 0.18 + Math.max(0, Math.sin(y * 1.9 + z * 0.15)) * 0.35) * Math.min(1, k * 4);
        let fx = -19.6 - bump * (1 - cove * 0.8) - k * 1.6 * (1 - cove);
        if (steps > 0 && y > -6.2) fx = THREE.MathUtils.lerp(fx, Math.max(fx, -20.45), steps);
        pos.push(fx, y, z);
        const c = r === 0 ? new THREE.Color('#5E8A3E') : bands[Math.floor((y + 12) * 1.3) % bands.length].clone().lerp(new THREE.Color('#6E5A48'), k * 0.4);
        col.push(c.r, c.g, c.b);
      }
    });
    for (let i = 0; i < cols.length - 1; i++) for (let r = 0; r < rows; r++) {
      const a = i * (rows + 1) + r, b = a + 1, c = a + rows + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const cliff = new THREE.Mesh(g, REAL.rock);
    cliff.receiveShadow = true;
    cliff.castShadow = true;
    registerMesh(cliff, 'rock');
    scene.add(cliff);
    // tumbled boulders at the foot of the cliff
    for (let i = 0; i < 70; i++) {
      const z = -60 + R() * 120, sz = 0.6 + R() * 1.8;
      if (z > 2 && z < 24) continue; // the cove beach
      fol.rock(-21.2 - R() * 2.5, L.seaY - sz * 0.5, z, sz, ['#8E7A68', '#9C8774', '#7F6D5E'][i % 3], 0.8);
    }

  }

  // water surfaces get the shared pond material later
  const waterMat = new THREE.MeshStandardMaterial({ color: '#2c5a4c' });
  const waterMeshes = [];

  // sea stacks and far islands
  {
    const b = B('sea');
    for (const [x, z, s] of L.seaStacks) {
      const big = x === L.lighthouse.x && z === L.lighthouse.z;
      const top = big ? L.lighthouse.y + 0.2 : L.seaY + s * (2.2 + R() * 0.8);
      b.add(stackGeo(R, s, top - L.seaY + 0.8), '#9C8470', { pos: [x, L.seaY - 0.8, z] }, { mat: 'rock' });
      b.add(noiseRock(R, 2), '#4E7434', { pos: [x, top - 0.05, z], scale: [s * 0.95, s * 0.22, s * 0.95] }, { mat: 'foliage' });
      if (!big) fol.bush(x + s * 0.2, top + 0.05, z, s * 0.6);
      for (let k = 0; k < 4; k++) fol.rock(x + (R() - 0.5) * s * 3, L.seaY - 0.4, z + (R() - 0.5) * s * 3, 0.4 + R() * s * 0.5, '#86725F', 0.9);
    }
    for (const [x, z, s] of [[-150, -70, 22], [-190, 50, 30], [-120, 120, 18]]) {
      b.add(noiseRock(R, 5), '#7F7466', { pos: [x, L.seaY - s * 0.2, z], scale: [s * 1.4, s * 0.6, s] }, { outline: false, mat: 'rock' });
      b.add(noiseRock(R, 4), '#4E6E3A', { pos: [x + s * 0.2, L.seaY + s * 0.3, z + s * 0.1], scale: [s * 1.1, s * 0.25, s * 0.8] }, { outline: false, mat: 'foliage' });
    }
  }

  // ---------- plaza ----------
  {
    // cobbles: one instanced pebble shape, each stone tinted and turned a little differently
    const spots = [];
    for (let r = 2.6; r < 7.28; r += 0.25) {
      const n = Math.floor((2 * Math.PI * r) / 0.26);
      const off = R() * 6;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (pathAmt(x, z) > 0.95 && r > 6.8) continue;
        spots.push([x, z, a]);
      }
    }
    const peb = noiseRock(R, 1);
    peb.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(peb.attributes.position.count * 3).fill(1), 3));
    const cob = new THREE.InstancedMesh(peb, REAL.stone, spots.length);
    const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), ce = new THREE.Euler(), cc = new THREE.Color();
    const cobCols = ['#8F8578', '#7E766B', '#9A8F80', '#6F685F', '#8C7B69', '#A39684', '#857A6E'];
    spots.forEach(([x, z, a], i) => {
      cq.setFromEuler(ce.set(R() * 0.1, a + R() * 0.6, R() * 0.1));
      cm.compose(new THREE.Vector3(x, 0.0, z), cq, new THREE.Vector3(0.125 + R() * 0.02, 0.045, 0.11 + R() * 0.02));
      cob.setMatrixAt(i, cm);
      cob.setColorAt(i, cc.set(cobCols[Math.floor(R() * cobCols.length)]));
    });
    cob.receiveShadow = true;
    registerMesh(cob, 'stone');
    scene.add(cob);
    // fountain
    const f = B('plaza');
    f.add(lathe([[0, -0.05], [2.1, -0.05], [2.2, 0.08], [2.2, 0.48], [2.1, 0.6], [1.92, 0.6], [1.85, 0.5], [1.85, 0.1], [0, 0.1]], 40), C.stone);
    f.add(roundCyl(0.42, 1.25, 0.12, 20), '#CFC4B2', { pos: [0, 0.1, 0] }, { mat: 'stone' });
    f.add(lathe([[0, 1.1], [0.5, 1.12], [0.95, 1.3], [1.0, 1.42], [0.88, 1.42], [0.5, 1.3], [0, 1.3]], 28), C.stone);
    f.add(roundCyl(0.16, 0.5, 0.08, 14), '#CFC4B2', { pos: [0, 1.3, 0] }, { mat: 'stone' });
    f.add(sphere(0.22, 14, 10), '#B9AE9C', { pos: [0, 1.88, 0] }, { mat: 'stone' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      f.add(sphere(0.13, 10, 8), '#C8BCA8', { pos: [Math.cos(a) * 2.15, 0.62, Math.sin(a) * 2.15], scale: [1, 0.7, 1] }, { mat: 'stone' });
    }
    const w1 = new THREE.Mesh(new THREE.CircleGeometry(1.88, 48).rotateX(-Math.PI / 2), waterMat);
    w1.position.y = 0.42;
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2), waterMat);
    w2.position.y = 1.36;
    scene.add(w1, w2);
    waterMeshes.push(w1, w2);
    circle(0, 0, 2.25);

    // benches facing the fountain
    for (const deg of [45, 135, 225, 315]) {
      const a = (deg * Math.PI) / 180, x = Math.cos(a) * 5.7, z = Math.sin(a) * 5.7;
      bench(f, x, z, yawTo(-x, -z), `plaza-${deg}`);
    }

    // lamp posts with string lights between them
    const posts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 7.0, z = Math.sin(a) * 7.0;
      posts.push(new THREE.Vector3(x, 2.9, z));
      lampPost(f, x, z);
    }
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i], c = posts[(i + 1) % posts.length];
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const p = a.clone().lerp(c, t);
        p.y -= Math.sin(t * Math.PI) * 0.55;
        pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      f.add(new THREE.TubeGeometry(curve, 24, 0.014, 5), '#2A2624', {}, { outline: false, mat: 'metal' });
      const bulbCols = [C.butter, C.pink, C.apricot, C.cream2];
      for (let k = 1; k < 8; k++) {
        const p = curve.getPoint(k / 8);
        G.add(sphere(0.075, 10, 8), bulbCols[k % 4], { pos: [p.x, p.y - 0.09, p.z], scale: [1, 1.25, 1] });
        lampGlows.push({ p: new THREE.Vector3(p.x, p.y - 0.09, p.z), size: 0.6, color: bulbCols[k % 4] });
      }
    }
  }

  function lampPost(b, x, z, h = 2.9) {
    const y = placeY(x, z, 0.2).y;
    const iron = '#2B2826', o = { mat: 'metal' };
    b.add(roundCyl(0.2, 0.18, 0.06, 16), iron, { pos: [x, y - 0.02, z] }, o);
    b.add(roundCyl(0.06, h - 0.2, 0.03, 12), iron, { pos: [x, y, z] }, o);
    b.add(torus(0.07, 0.02, 6, 14), iron, { pos: [x, y + 0.6, z], rot: [Math.PI / 2, 0, 0] }, { outline: false, mat: 'metal' });
    b.add(rbox(0.36, 0.06, 0.36, 0.02), iron, { pos: [x, y + h + 0.02, z] }, o);
    b.add(lathe([[0, 0], [0.27, 0], [0.22, 0.08], [0.06, 0.2], [0, 0.24]], 14), iron, { pos: [x, y + h + 0.42, z] }, o);
    b.add(roundCyl(0.12, 0.34, 0.02, 12), '#F6E9C8', { pos: [x, y + h + 0.06, z] }, { outline: false, mat: 'glossy' });
    for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]])
      b.add(rbox(0.03, 0.36, 0.03, 0.01), iron, { pos: [x + dx, y + h + 0.24, z + dz] }, { outline: false, mat: 'metal' });
    G.add(sphere(0.12, 12, 10), C.butter, { pos: [x, y + h + 0.24, z] });
    lampGlows.push({ p: new THREE.Vector3(x, y + h + 0.24, z), size: 1.5, color: C.butter });
    lampPosts.push({ x, y, z });
    circle(x, z, 0.24);
  }

  function bench(b, x, z, yaw, id, seatH = 0.465) {
    const { y, drop } = placeY(x, z, 0.85);
    b.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
      for (let i = 0; i < 3; i++) g.add(rbox(1.7, 0.07, 0.16, 0.03), C.honey, { pos: [0, 0.43, -0.17 + i * 0.17] });
      for (let i = 0; i < 2; i++) g.add(rbox(1.7, 0.14, 0.06, 0.03), C.honey, { pos: [0, 0.64 + i * 0.19, -0.31], rot: [-0.12, 0, 0] });
      for (const sx of [-0.72, 0.72]) {
        g.add(rbox(0.07, 0.4 + drop, 0.46, 0.03), '#2B2826', { pos: [sx, (0.4 - drop) / 2, -0.02] }, { mat: 'metal' });
        g.add(rbox(0.07, 0.52, 0.06, 0.03), '#2B2826', { pos: [sx, 0.7, -0.34], rot: [-0.12, 0, 0] }, { mat: 'metal' });
      }
    });
    for (const lx of [-0.42, 0.42]) {
      const [sx, sz] = toWorld(x, z, yaw, lx, 0.04);
      seats.push({ id: `${id}-${lx < 0 ? 0 : 1}`, kind: 'bench', x: sx, y: y + seatH, z: sz, yaw });
    }
    for (const lx of [-0.55, 0.55]) {
      const [cx, cz] = toWorld(x, z, yaw, lx, -0.08);
      circle(cx, cz, 0.36);
    }
  }

  // ---------- café: a two-storey corner café with a serving hatch, awning and a terrace ----------
  {
    const b = B('cafe');
    const c = L.cafe, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, w = c.x1 - c.x0, d = c.z1 - c.z0;
    const PL = { mat: 'plaster' }, WD = { mat: 'wood' }, ST = { mat: 'stone' }, MT = { mat: 'metal' };
    const CREAM = '#F1E6D2', BEAM = '#5B4130', TILE = ['#B4593A', '#A44F35', '#BD6342'], IRON = '#2B2826';
    const H1 = c.h, H2 = 2.25; // ground floor, upper floor
    const hatch = { x0: 9.3, x1: 12.7, y0: 1.05, y1: 2.25, back: c.z1 - 0.8 };
    // stone plinth
    b.add(rbox(w + 0.14, 0.42, d + 0.14, 0.05), '#9C8E7C', { pos: [cx, 0.12, cz] }, ST);
    // ground floor walls, hollowed for the hatch
    b.add(rbox(w, H1, 0.25, 0.05), CREAM, { pos: [cx, H1 / 2, c.z0 + 0.125] }, PL);
    for (const x of [c.x0 + 0.125, c.x1 - 0.125]) b.add(rbox(0.25, H1, d, 0.05), CREAM, { pos: [x, H1 / 2, cz] }, PL);
    b.add(rbox(hatch.x0 - c.x0, H1, 0.25, 0.05), CREAM, { pos: [(c.x0 + hatch.x0) / 2, H1 / 2, c.z1 - 0.125] }, PL);
    b.add(rbox(c.x1 - hatch.x1, H1, 0.25, 0.05), CREAM, { pos: [(c.x1 + hatch.x1) / 2, H1 / 2, c.z1 - 0.125] }, PL);
    b.add(rbox(hatch.x1 - hatch.x0, H1 - hatch.y1, 0.25, 0.04), CREAM, { pos: [cx + (hatch.x0 + hatch.x1) / 2 - cx, (H1 + hatch.y1) / 2, c.z1 - 0.125] }, PL);
    b.add(rbox(hatch.x1 - hatch.x0, hatch.y0, 0.25, 0.04), CREAM, { pos: [(hatch.x0 + hatch.x1) / 2, hatch.y0 / 2, c.z1 - 0.125] }, PL);
    // the nook behind the hatch: back wall, ceiling, worktop, shelves and everything on them
    const nz = (hatch.back + c.z1) / 2;
    b.add(rbox(hatch.x1 - hatch.x0, hatch.y1 - hatch.y0 + 0.1, 0.06, 0.01), '#E8D6B8', { pos: [(hatch.x0 + hatch.x1) / 2, (hatch.y0 + hatch.y1) / 2, hatch.back] }, PL);
    b.add(rbox(hatch.x1 - hatch.x0, 0.06, 0.8, 0.01), '#6E4A32', { pos: [(hatch.x0 + hatch.x1) / 2, hatch.y1, nz] }, WD);
    b.add(rbox(hatch.x1 - hatch.x0, 0.07, 0.8, 0.01), '#8E6640', { pos: [(hatch.x0 + hatch.x1) / 2, hatch.y0 + 0.02, nz] }, WD);
    for (const y of [1.55, 1.92]) {
      b.add(rbox(1.5, 0.035, 0.2, 0.008), '#8E6640', { pos: [9.95, y, hatch.back + 0.12] }, WD);
      for (let i = 0; i < 6; i++) {
        const col = ['#C9A24A', '#D9544D', '#8FB7E8', '#F4EFE4', '#7FB24E', '#E8893A'][(i + (y > 1.7 ? 3 : 0)) % 6];
        if (i % 2) b.add(roundCyl(0.05, 0.16, 0.02, 10), col, { pos: [9.35 + i * 0.22, y + 0.02, hatch.back + 0.12] }, { mat: 'glossy', outline: false });
        else b.add(lathe([[0, 0], [0.05, 0], [0.055, 0.08], [0.045, 0.1], [0, 0.1]], 10), '#F4EFE4', { pos: [9.35 + i * 0.22, y + 0.02, hatch.back + 0.12] }, { mat: 'ceramic', outline: false });
      }
    }
    // espresso machine
    b.add(rbox(0.55, 0.42, 0.35, 0.05), '#C9CDD2', { pos: [11.05, hatch.y0 + 0.27, hatch.back + 0.24] }, MT);
    b.add(rbox(0.56, 0.06, 0.36, 0.02), '#8E3B32', { pos: [11.05, hatch.y0 + 0.5, hatch.back + 0.24] }, { mat: 'glossy' });
    for (const x of [10.9, 11.2]) {
      b.add(roundCyl(0.03, 0.08, 0.01, 8), '#2B2826', { pos: [x, hatch.y0 + 0.1, hatch.back + 0.4] }, { mat: 'metal', outline: false });
      b.add(lathe([[0, 0], [0.03, 0], [0.035, 0.05], [0, 0.05]], 8), '#F4EFE4', { pos: [x, hatch.y0 + 0.05, hatch.back + 0.4] }, { mat: 'ceramic', outline: false });
    }
    b.add(sphere(0.05, 10, 8), '#F4EFE4', { pos: [11.25, hatch.y0 + 0.4, hatch.back + 0.42] }, { mat: 'glossy', outline: false });
    // cake under a glass dome on a stand
    b.add(roundCyl(0.2, 0.15, 0.02, 16), '#E9E3D6', { pos: [12.2, hatch.y0 + 0.05, nz] }, { mat: 'ceramic' });
    b.add(roundCyl(0.16, 0.14, 0.03, 16), '#F7B9C4', { pos: [12.2, hatch.y0 + 0.2, nz] }, { mat: 'paint' });
    b.add(roundCyl(0.163, 0.03, 0.01, 16), '#FFF6EA', { pos: [12.2, hatch.y0 + 0.33, nz] }, { mat: 'paint', outline: false });
    b.add(sphere(0.03, 8, 6), '#C8323E', { pos: [12.2, hatch.y0 + 0.38, nz] }, { mat: 'glossy', outline: false });
    // pendant lamps in the nook
    for (const x of [9.9, 11.9]) {
      b.add(capsule(0.006, 0.25, 2, 4), IRON, { pos: [x, hatch.y1 - 0.14, nz] }, { mat: 'metal', outline: false });
      b.add(lathe([[0, 0], [0.12, -0.02], [0.1, 0.06], [0.02, 0.1], [0, 0.1]], 12), '#2F5E44', { pos: [x, hatch.y1 - 0.38, nz] }, { mat: 'glossy' });
      G.add(sphere(0.045, 8, 6), C.butter, { pos: [x, hatch.y1 - 0.4, nz] });
      lampGlows.push({ p: new THREE.Vector3(x, hatch.y1 - 0.42, nz), size: 1.1, color: C.butter });
    }
    W.add(rbox(hatch.x1 - hatch.x0 - 0.1, hatch.y1 - hatch.y0 - 0.05, 0.02, 0.01), '#FFD9A0', { pos: [(hatch.x0 + hatch.x1) / 2, (hatch.y0 + hatch.y1) / 2, hatch.back + 0.04] });
    // glazed door on the right and a planter window on the left
    b.add(rbox(0.85, 2.05, 0.08, 0.02), '#2F5E44', { pos: [13.32, 1.05, c.z1 + 0.02] }, { mat: 'glossy' });
    b.add(rbox(0.55, 1.1, 0.04, 0.02), '#1E2A30', { pos: [13.32, 1.35, c.z1 + 0.06] }, { mat: 'glossy', outline: false });
    b.add(sphere(0.035, 8, 6), '#C9A24A', { pos: [13.0, 1.0, c.z1 + 0.1] }, { mat: 'metal', outline: false });
    W.add(rbox(0.5, 1.05, 0.02, 0.01), '#FFD9A0', { pos: [13.32, 1.35, c.z1 + 0.08] });
    b.add(rbox(0.8, 1.0, 0.06, 0.02), '#1E2A30', { pos: [8.68, 1.6, c.z1 + 0.01] }, { mat: 'glossy', outline: false });
    b.add(rbox(0.92, 1.12, 0.05, 0.02), '#F4EEE2', { pos: [8.68, 1.6, c.z1 + 0.03] }, { mat: 'paint' });
    b.add(rbox(0.04, 1.0, 0.07, 0.01), '#F4EEE2', { pos: [8.68, 1.6, c.z1 + 0.06] }, { mat: 'paint', outline: false });
    W.add(rbox(0.76, 0.96, 0.02, 0.01), '#FFD9A0', { pos: [8.68, 1.6, c.z1 + 0.05] });
    b.add(rbox(0.95, 0.22, 0.28, 0.04), '#6E4A32', { pos: [8.68, 0.98, c.z1 + 0.16] }, WD);
    for (let i = 0; i < 5; i++) b.add(sphere(0.08, 8, 6), [C.pink, C.butter, C.rose, C.cream2, C.lilac][i], { pos: [8.32 + i * 0.18, 1.14, c.z1 + 0.16] }, { mat: 'paint', outline: false });
    // wall lanterns either side of the door
    for (const x of [12.85, 13.82]) {
      b.add(rbox(0.05, 0.25, 0.12, 0.01), IRON, { pos: [x, 2.2, c.z1 + 0.06] }, MT);
      b.add(lathe([[0, 0], [0.08, 0], [0.1, 0.16], [0.05, 0.22], [0, 0.24]], 6), IRON, { pos: [x, 2.05, c.z1 + 0.16] }, MT);
      G.add(sphere(0.05, 8, 6), C.butter, { pos: [x, 2.13, c.z1 + 0.16] });
      lampGlows.push({ p: new THREE.Vector3(x, 2.13, c.z1 + 0.16), size: 1.0, color: C.butter });
    }

    // upper floor: half-timbered, jutting out a little over the street
    const y2 = H1, f2 = c.z1 + 0.22;
    b.add(rbox(w + 0.1, 0.18, d + 0.32, 0.03), BEAM, { pos: [cx, y2 + 0.05, cz + 0.11] }, WD);
    b.add(rbox(w, H2, d + 0.2, 0.05), CREAM, { pos: [cx, y2 + 0.1 + H2 / 2, cz + 0.1] }, PL);
    for (let i = 0; i <= 5; i++) b.add(rbox(0.12, H2, 0.06, 0.01), BEAM, { pos: [c.x0 + 0.06 + i * ((w - 0.12) / 5), y2 + 0.1 + H2 / 2, f2] }, WD);
    b.add(rbox(w, 0.12, 0.06, 0.01), BEAM, { pos: [cx, y2 + 0.1 + H2 - 0.06, f2] }, WD);
    b.add(rbox(w, 0.1, 0.06, 0.01), BEAM, { pos: [cx, y2 + 1.1, f2] }, WD);
    for (const [x, dir] of [[c.x0 + 0.66, 1], [c.x1 - 0.66, -1]]) b.add(rbox(0.09, 1.35, 0.05, 0.01), BEAM, { pos: [x, y2 + 0.75, f2 + 0.005], rot: [0, 0, dir * 0.75] }, WD);
    for (const sx of [c.x0 + 0.06, c.x1 - 0.06]) for (let i = 0; i <= 3; i++) b.add(rbox(0.06, H2, 0.12, 0.01), BEAM, { pos: [sx, y2 + 0.1 + H2 / 2, c.z0 + 0.1 + i * ((d + 0.1) / 3)] }, WD);
    // upper windows with shutters and window boxes
    for (const x of [9.75, 12.25]) {
      b.add(rbox(0.8, 0.95, 0.06, 0.02), '#1E2A30', { pos: [x, y2 + 1.25, f2 + 0.01] }, { mat: 'glossy', outline: false });
      b.add(rbox(0.92, 1.07, 0.05, 0.02), '#F4EEE2', { pos: [x, y2 + 1.25, f2 + 0.035] }, { mat: 'paint' });
      b.add(rbox(0.04, 0.95, 0.07, 0.01), '#F4EEE2', { pos: [x, y2 + 1.25, f2 + 0.06] }, { mat: 'paint', outline: false });
      b.add(rbox(0.8, 0.04, 0.07, 0.01), '#F4EEE2', { pos: [x, y2 + 1.3, f2 + 0.06] }, { mat: 'paint', outline: false });
      for (const s of [-1, 1]) {
        b.add(rbox(0.42, 1.0, 0.05, 0.02), '#4F7A5A', { pos: [x + s * 0.68, y2 + 1.25, f2 + 0.05], rot: [0, s * 0.25, 0] }, { mat: 'paint' });
        for (let k = 0; k < 5; k++) b.add(rbox(0.36, 0.025, 0.06, 0.005), '#3E6248', { pos: [x + s * 0.68, y2 + 0.85 + k * 0.18, f2 + 0.08], rot: [0, s * 0.25, 0] }, { mat: 'paint', outline: false });
      }
      b.add(rbox(0.95, 0.2, 0.25, 0.03), '#8E6640', { pos: [x, y2 + 0.68, f2 + 0.15] }, WD);
      for (let k = 0; k < 6; k++) b.add(sphere(0.07, 8, 6), [C.pink, '#E98A9B', C.butter, '#C78BD9'][k % 4], { pos: [x - 0.38 + k * 0.15, y2 + 0.83, f2 + 0.17] }, { mat: 'paint', outline: false });
      fol.addCards(fol.chunk(x, f2), 'leaf', new THREE.Vector3(x, y2 + 0.8, f2 + 0.18), 0.45, 0.12, 0.15, 10, 0.18, ['#4E7A34', '#5E8E42']);
      W.add(rbox(0.76, 0.9, 0.02, 0.01), C.butter, { pos: [x, y2 + 1.25, f2 + 0.045] });
      lampGlows.push({ p: new THREE.Vector3(x, y2 + 1.25, f2 + 0.1), size: 1.3, color: C.butter });
    }
    // roof: terracotta tiles in rows on both slopes, gable ends, a dormer and a chimney
    const eave = y2 + 0.1 + H2, ridge = eave + 1.65, front = c.z1 + 0.5, back = c.z0 - 0.35, mid = (front + back) / 2;
    const run = (front - back) / 2, slope = Math.atan2(ridge - eave, run), rows = 9;
    for (const sd of [-1, 1]) {
      for (let r = 0; r < rows; r++) {
        const k = (r + 0.5) / rows;
        const zz = sd > 0 ? front - run * k : back + run * k, yy = eave + (ridge - eave) * k + 0.06;
        b.add(rbox(w + 0.55, 0.06, (run / rows) * 1.25 / Math.cos(slope), 0.015), TILE[(r + (sd > 0 ? 0 : 1)) % 3], { pos: [cx, yy, zz], rot: [sd * slope, 0, 0] }, ST);
      }
    }
    b.add(capsule(0.09, w + 0.4, 3, 10), '#8E3B28', { pos: [cx, ridge + 0.1, mid], rot: [0, 0, Math.PI / 2] }, ST);
    for (const sx of [c.x0 + 0.05, c.x1 - 0.05]) {
      const tri = new THREE.Shape(); tri.moveTo(back + 0.2, 0); tri.lineTo(front - 0.2, 0); tri.lineTo(mid, ridge - eave - 0.05); tri.lineTo(back + 0.2, 0);
      b.add(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.1, 0, 0), CREAM, { pos: [sx, eave, 0] }, PL);
      b.add(rbox(0.08, 0.08, 1.9, 0.01), BEAM, { pos: [sx + (sx < cx ? -0.1 : 0.1), eave + 0.5, mid] }, WD);
    }
    // dormer
    b.group({ pos: [11, eave + 0.55, front - run * 0.42] }, (g) => {
      g.add(rbox(1.1, 0.95, 0.9, 0.03), CREAM, { pos: [0, 0.2, 0] }, PL);
      g.add(rbox(0.6, 0.55, 0.05, 0.02), '#1E2A30', { pos: [0, 0.25, 0.46] }, { mat: 'glossy', outline: false });
      g.add(rbox(0.7, 0.65, 0.04, 0.02), '#F4EEE2', { pos: [0, 0.25, 0.48] }, { mat: 'paint' });
      for (const s of [-1, 1]) g.add(rbox(0.75, 0.05, 1.05, 0.01), TILE[1], { pos: [s * 0.32, 0.8, 0.05], rot: [0, 0, -s * 0.62] }, ST);
    });
    W.add(rbox(0.56, 0.5, 0.02, 0.01), C.butter, { pos: [11, eave + 0.8, front - run * 0.42 + 0.49] });
    b.add(rbox(0.55, 1.9, 0.55, 0.04), '#8C5A44', { pos: [8.9, ridge - 0.2, c.z0 + 0.7] }, ST);
    b.add(rbox(0.65, 0.12, 0.65, 0.03), '#6F4A3A', { pos: [8.9, ridge + 0.8, c.z0 + 0.7] }, ST);
    smokeSpots.push(new THREE.Vector3(8.9, ridge + 1.2, c.z0 + 0.7));

    // scalloped striped awning over the hatch
    {
      const ax0 = 8.95, ax1 = 13.05, top = 2.62, low = 2.18, out = 1.25, n = 12;
      const sw = (ax1 - ax0) / n;
      for (let i = 0; i < n; i++) {
        const x = ax0 + (i + 0.5) * sw;
        const col = i % 2 ? '#F4ECDD' : '#4F7A5A';
        b.add(rbox(sw + 0.005, 0.03, Math.hypot(out, top - low), 0.01), col, { pos: [x, (top + low) / 2, c.z1 + out / 2], rot: [Math.atan2(top - low, out), 0, 0] }, { mat: 'cloth' });
        b.add(new THREE.CircleGeometry(sw / 2, 10, Math.PI, Math.PI), col, { pos: [x, low - 0.01, c.z1 + out + 0.005] }, { mat: 'cloth', outline: false });
        b.add(rbox(sw + 0.005, 0.2, 0.02, 0.005), col, { pos: [x, low + 0.09, c.z1 + out] }, { mat: 'cloth', outline: false });
      }
      for (const x of [ax0, ax1]) b.add(rbox(0.03, 0.03, out + 0.1, 0.01), IRON, { pos: [x, (top + low) / 2 + 0.03, c.z1 + out / 2], rot: [Math.atan2(top - low, out), 0, 0] }, MT);
      const name = textPlane('Hillside Café', 2.6, 0.24, '#FFF3DC');
      name.position.set(cx, low + 0.1, c.z1 + out + 0.02);
      scene.add(name);
    }
    // hanging sign on an iron bracket
    b.add(rbox(0.05, 0.05, 0.9, 0.01), IRON, { pos: [c.x1 - 0.2, 3.25, c.z1 + 0.65] }, MT);
    b.add(torus(0.2, 0.015, 6, 16, Math.PI / 2), IRON, { pos: [c.x1 - 0.2, 3.05, c.z1 + 0.2], rot: [0, Math.PI / 2, 0] }, MT);
    {
      const sg = signBoard(['☕'], 0.62, 0.62, { bg: '#2F5E44', ink: '#FFE08A' });
      sg.position.set(c.x1 - 0.2, 2.88, c.z1 + 0.85);
      sg.rotation.y = Math.PI / 2;
      scene.add(sg);
    }

    // the counter: varnished top, tiled front, a pastry case and the bits and bobs of a café
    const k = L.counter, kx = (k.x0 + k.x1) / 2, kz = (k.z0 + k.z1) / 2, top = k.h;
    b.add(rbox(k.x1 - k.x0, k.h - 0.08, k.z1 - k.z0, 0.04), '#6E4A32', { pos: [kx, (k.h - 0.08) / 2, kz] }, WD);
    for (let i = 0; i < 18; i++) for (let j = 0; j < 4; j++) {
      b.add(rbox(0.19, 0.19, 0.02, 0.01), (i + j) % 2 ? '#2E7D7A' : '#F2EEE6', { pos: [k.x0 + 0.1 + i * 0.2, 0.2 + j * 0.2, k.z1 + 0.005] }, { mat: 'ceramic', outline: false });
    }
    b.add(rbox(k.x1 - k.x0 + 0.16, 0.06, k.z1 - k.z0 + 0.14, 0.03), '#A8723C', { pos: [kx, k.h - 0.03, kz] }, WD);
    b.add(rbox(k.x1 - k.x0, 0.1, 0.04, 0.01), '#4A3424', { pos: [kx, 0.05, k.z1 + 0.01] }, WD);
    // pastry case
    b.add(rbox(0.9, 0.04, 0.45, 0.01), '#C9CDD2', { pos: [k.x0 + 0.6, top + 0.02, kz] }, MT);
    b.add(rbox(0.9, 0.38, 0.45, 0.02), '#DDEBF0', { pos: [k.x0 + 0.6, top + 0.21, kz] }, { mat: 'glossy', outline: false });
    for (let i = 0; i < 4; i++) {
      b.add(roundCyl(0.07, 0.06, 0.02, 10), ['#E9C27E', '#F7B9C4', '#6E4A32', '#FFF6EA'][i], { pos: [k.x0 + 0.3 + i * 0.2, top + 0.05, kz] }, { mat: 'paint', outline: false });
      b.add(sphere(0.02, 6, 4), '#C8323E', { pos: [k.x0 + 0.3 + i * 0.2, top + 0.13, kz] }, { mat: 'glossy', outline: false });
    }
    // cups, a register, a bell, a tip jar, a little vase
    for (let i = 0; i < 3; i++) b.add(lathe([[0, 0], [0.045, 0], [0.05, 0.08], [0, 0.08]], 10), ['#F4EFE4', '#E8893A', '#8FB7E8'][i], { pos: [kx - 0.15 + i * 0.16, top, kz + 0.12] }, { mat: 'ceramic', outline: false });
    b.add(rbox(0.36, 0.2, 0.3, 0.04), '#8E3B32', { pos: [kx + 0.6, top + 0.1, kz - 0.05] }, { mat: 'glossy' });
    b.add(rbox(0.3, 0.06, 0.18, 0.02), '#2B2826', { pos: [kx + 0.6, top + 0.24, kz - 0.08], rot: [-0.4, 0, 0] }, MT);
    b.add(sphere(0.05, 10, 6), '#C9A24A', { pos: [kx + 1.15, top + 0.03, kz + 0.1], scale: [1, 0.7, 1] }, MT);
    b.add(lathe([[0, 0], [0.06, 0], [0.065, 0.14], [0, 0.14]], 12), '#DDEBF0', { pos: [kx + 1.4, top, kz] }, { mat: 'glossy', outline: false });
    b.add(lathe([[0, 0], [0.04, 0], [0.05, 0.08], [0.02, 0.14], [0, 0.14]], 10), '#2F5E8C', { pos: [kx + 0.25, top, kz - 0.12] }, { mat: 'ceramic', outline: false });
    b.add(sphere(0.06, 8, 6), C.pink, { pos: [kx + 0.25, top + 0.2, kz - 0.12] }, { mat: 'paint', outline: false });
    box(c.x0, c.z0, c.x1, c.z1);
    box(k.x0 - 0.05, k.z0, k.x1 + 0.05, k.z1 + 0.05);
    // stools
    [9.8, 11, 12.2].forEach((x, i) => {
      const z = -7.75;
      b.add(roundCyl(0.2, 0.04, 0.02, 16), IRON, { pos: [x, 0, z] }, MT);
      b.add(roundCyl(0.035, 0.58, 0.02, 10), '#C9CDD2', { pos: [x, 0, z] }, MT);
      b.add(torus(0.15, 0.012, 6, 16), '#C9CDD2', { pos: [x, 0.25, z], rot: [Math.PI / 2, 0, 0] }, { mat: 'metal', outline: false });
      b.add(roundCyl(0.22, 0.09, 0.04, 18), '#7A3B2E', { pos: [x, 0.56, z] }, { mat: 'fabric' });
      seats.push({ id: `stool-${i}`, kind: 'stool', x, y: 0.65, z, yaw: Math.PI });
      circle(x, z, 0.2);
    });
    // chalkboard A-frame menu by the left corner
    b.group({ pos: [8.05, 0, -8.55], rot: [0, 0.35, 0] }, (g) => {
      for (const s of [-1, 1]) {
        g.add(rbox(0.62, 0.9, 0.04, 0.02), '#6E4A32', { pos: [0, 0.45, s * 0.14], rot: [s * 0.16, 0, 0] }, WD);
        g.add(rbox(0.52, 0.78, 0.01, 0.005), '#25302C', { pos: [0, 0.47, s * 0.165], rot: [s * 0.16, 0, 0] }, { mat: 'paint', outline: false });
      }
    });
    {
      const menu = textPlane('Cocoa · Shakes · Cake', 0.5, 0.12, '#F4EFE4');
      menu.position.set(8.11, 0.66, -8.37); menu.rotation.set(-0.16, 0.35, 0);
      scene.add(menu);
    }
    circle(8.05, -8.55, 0.32);
    // the cat's barrel
    b.add(roundCyl(0.36, 0.72, 0.08, 18), '#7A5434', { pos: [14.7, 0, -8.5] }, WD);
    for (const y of [0.15, 0.55]) b.add(torus(0.365, 0.025, 6, 24), IRON, { pos: [14.7, y, -8.5], rot: [Math.PI / 2, 0, 0] }, { mat: 'metal', outline: false });
    circle(14.7, -8.5, 0.42);

    // terrace on the east side: bistro tables, an umbrella, olive trees in pots, string lights
    const tables = [[15.9, -11.4], [16.6, -9.1]];
    tables.forEach(([tx, tz], ti) => {
      b.add(roundCyl(0.32, 0.03, 0.01, 20), '#E9E3D6', { pos: [tx, 0.72, tz] }, { mat: 'stone' });
      b.add(roundCyl(0.03, 0.72, 0.01, 8), IRON, { pos: [tx, 0, tz] }, MT);
      b.add(roundCyl(0.2, 0.03, 0.01, 12), IRON, { pos: [tx, 0, tz] }, MT);
      b.add(lathe([[0, 0], [0.04, 0], [0.045, 0.08], [0, 0.08]], 8), '#F4EFE4', { pos: [tx + 0.1, 0.75, tz] }, { mat: 'ceramic', outline: false });
      for (const [sx, yaw] of [[-0.62, Math.PI / 2], [0.62, -Math.PI / 2]]) {
        const x = tx + sx;
        b.group({ pos: [x, 0, tz], rot: [0, yaw, 0] }, (g) => {
          g.add(roundCyl(0.2, 0.04, 0.01, 14), '#4F7A5A', { pos: [0, 0.44, 0] }, { mat: 'paint' });
          for (const [lx, lz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) g.add(capsule(0.012, 0.42, 2, 4), IRON, { pos: [lx, 0.22, lz] }, MT);
          g.add(torus(0.18, 0.014, 4, 16, Math.PI), '#4F7A5A', { pos: [0, 0.75, -0.17], rot: [0, 0, 0] }, { mat: 'paint' });
          for (let k = -1; k <= 1; k++) g.add(capsule(0.01, 0.3, 2, 4), '#4F7A5A', { pos: [k * 0.1, 0.62, -0.18] }, { mat: 'paint', outline: false });
        });
        seats.push({ id: `terrace-${ti}-${sx < 0 ? 0 : 1}`, kind: 'bench', x, y: 0.47, z: tz, yaw });
        circle(x, tz, 0.22);
      }
      circle(tx, tz, 0.34);
    });
    // umbrella over the first table
    b.add(roundCyl(0.025, 2.4, 0.01, 8), '#E9E3D6', { pos: [15.9, 0.74, -11.4] }, MT);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(new THREE.ConeGeometry(1.25, 0.42, 3, 1, true, a, Math.PI / 4), i % 2 ? '#F4ECDD' : '#4F7A5A', { pos: [15.9, 2.95, -11.4] }, { mat: 'cloth', outline: false });
    }
    // olive trees in terracotta pots
    for (const [px, pz] of [[14.6, -12.7], [17.9, -12.4], [17.9, -7.4]]) {
      b.add(lathe([[0, 0], [0.26, 0], [0.34, 0.5], [0.37, 0.52], [0.36, 0.56], [0, 0.56]], 16), '#B4593A', { pos: [px, 0, pz] }, { mat: 'ceramic' });
      b.add(capsule(0.04, 0.9, 2, 6), '#6E5A44', { pos: [px, 0.95, pz], rot: [0.08, 0, -0.06] }, WD);
      fol.addCards(fol.chunk(px, pz), 'leaf', new THREE.Vector3(px, 1.7, pz), 0.5, 0.45, 0.5, 30, 0.3, ['#7E9A5E', '#8FAA6A', '#6E8A52']);
      circle(px, pz, 0.4);
    }
    // string lights from the café to two posts
    {
      const posts = [[18.3, -7.0], [18.3, -12.9]];
      for (const [px, pz] of posts) {
        b.add(roundCyl(0.05, 2.9, 0.02, 8), BEAM, { pos: [px, 0, pz] }, WD);
        circle(px, pz, 0.12);
      }
      const ends = [[new THREE.Vector3(c.x1, 2.75, c.z1 + 0.05), new THREE.Vector3(18.3, 2.85, -7.0)], [new THREE.Vector3(c.x1, 2.75, c.z0 + 0.5), new THREE.Vector3(18.3, 2.85, -12.9)], [new THREE.Vector3(18.3, 2.85, -7.0), new THREE.Vector3(18.3, 2.85, -12.9)]];
      for (const [a, e] of ends) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; const p = a.clone().lerp(e, t); p.y -= Math.sin(t * Math.PI) * 0.4; pts.push(p); }
        const curve = new THREE.CatmullRomCurve3(pts);
        b.add(new THREE.TubeGeometry(curve, 16, 0.01, 4), '#2A2624', {}, { outline: false, mat: 'metal' });
        for (let i = 1; i < 7; i++) {
          const p = curve.getPoint(i / 7);
          G.add(sphere(0.055, 8, 6), [C.butter, C.cream2, C.apricot][i % 3], { pos: [p.x, p.y - 0.07, p.z] });
          lampGlows.push({ p: new THREE.Vector3(p.x, p.y - 0.07, p.z), size: 0.55, color: C.butter });
        }
      }
    }
    // a bicycle with a basket of flowers leaning on the west wall
    b.group({ pos: [7.75, 0, -11.2], rot: [0, 0, -0.08] }, (g) => {
      for (const z of [-0.55, 0.55]) {
        g.add(torus(0.32, 0.03, 8, 24), '#2B2826', { pos: [0, 0.34, z], rot: [0, Math.PI / 2, 0] }, { mat: 'fabric' });
        g.add(torus(0.3, 0.008, 4, 18), '#C9CDD2', { pos: [0, 0.34, z], rot: [0, Math.PI / 2, 0] }, { mat: 'metal', outline: false });
      }
      g.add(capsule(0.022, 0.95, 2, 6), '#5FA88A', { pos: [0, 0.55, 0], rot: [Math.PI / 2 - 0.25, 0, 0] }, { mat: 'glossy' });
      g.add(capsule(0.022, 0.5, 2, 6), '#5FA88A', { pos: [0, 0.5, -0.25], rot: [0.5, 0, 0] }, { mat: 'glossy' });
      g.add(capsule(0.022, 0.55, 2, 6), '#5FA88A', { pos: [0, 0.6, 0.45], rot: [-0.3, 0, 0] }, { mat: 'glossy' });
      g.add(rbox(0.12, 0.05, 0.24, 0.02), '#4A3424', { pos: [0, 0.85, -0.35] }, { mat: 'fabric' });
      g.add(capsule(0.015, 0.45, 2, 6), '#C9CDD2', { pos: [0, 0.92, 0.55], rot: [0, 0, Math.PI / 2] }, { mat: 'metal' });
      g.add(rbox(0.32, 0.2, 0.26, 0.05), '#C9A24A', { pos: [0, 0.82, 0.72] }, WD);
      for (let i = 0; i < 5; i++) g.add(sphere(0.06, 8, 6), [C.pink, C.butter, C.rose, C.lilac, C.cream2][i], { pos: [-0.1 + (i % 3) * 0.1, 0.95, 0.66 + Math.floor(i / 3) * 0.12] }, { mat: 'paint', outline: false });
    });
    box(7.55, -11.95, 7.95, -10.45);
  }

  // ---------- pond + dock ----------
  {
    const p = L.pond;
    const wm = new THREE.Mesh(new THREE.CircleGeometry(p.r, 96, 0, Math.PI * 2).rotateX(-Math.PI / 2), waterMat);
    wm.position.set(p.x, p.water, p.z);
    scene.add(wm);
    waterMeshes.push(wm);
    const b = B('pond');
    const d = L.dock;
    for (let x = d.x0; x < d.x1 - 0.05; x += 0.34) {
      b.add(rbox(0.3, 0.08, d.z1 - d.z0, 0.03), R() > 0.5 ? C.honey : C.honeyLight, { pos: [x + 0.15, d.y - 0.04, (d.z0 + d.z1) / 2] });
    }
    for (const x of [d.x0 + 0.6, d.x1 - 0.12]) for (const z of [d.z0 + 0.05, d.z1 - 0.05]) {
      b.add(roundCyl(0.09, 1.4, 0.04, 10), C.honeyDark, { pos: [x, d.y - 1.25, z] });
    }
    b.add(rbox(d.x1 - d.x0 - 0.4, 0.07, 0.07, 0.03), C.honeyDark, { pos: [(d.x0 + d.x1) / 2 + 0.2, d.y - 0.12, d.z0 + 0.03] }, { outline: false });
    b.add(rbox(d.x1 - d.x0 - 0.4, 0.07, 0.07, 0.03), C.honeyDark, { pos: [(d.x0 + d.x1) / 2 + 0.2, d.y - 0.12, d.z1 - 0.03] }, { outline: false });
    // lily pads, keeping clear of the dock and the ducks' loop
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, r = 3.6 + R() * 0.4;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (x < p.x - 2.2 && Math.abs(z - p.z) < 1.6) continue;
      b.add(roundCyl(0.28 + R() * 0.1, 0.03, 0.012, 16), R() > 0.5 ? C.leaf : '#9CC98A', { pos: [x, p.water + 0.005, z], rot: [0, R() * 6, 0] }, { outline: false });
      if (R() > 0.6) {
        b.add(sphere(0.11, 10, 8), C.pink, { pos: [x + 0.05, p.water + 0.08, z], scale: [1, 0.8, 1] });
        b.add(sphere(0.05, 8, 6), C.butter, { pos: [x + 0.05, p.water + 0.15, z] }, { outline: false });
      }
    }
    // reeds and rocks around the far shore
    for (let i = 0; i < 22; i++) {
      const a = -1.2 + R() * 3.4, r = 4.55 + R() * 0.5;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const y = terrainHeight(x, z);
      const h = 0.7 + R() * 0.5;
      b.add(capsule(0.025, h, 2, 6), C.leafDark, { pos: [x, y + h / 2, z], rot: [R() * 0.2 - 0.1, 0, R() * 0.2 - 0.1] }, { outline: false });
      if (i % 2) b.add(capsule(0.05, 0.16, 3, 8), C.cocoa, { pos: [x, y + h, z] }, { outline: false });
    }
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2, r = 4.9 + R() * 0.4;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (inDock(x, z) || Math.abs(z - p.z) < 1.2 && x < p.x) continue;
      const s = 0.2 + R() * 0.2;
      fol.rock(x, terrainHeight(x, z) - s * 0.15, z, s, R() > 0.5 ? '#A59B8C' : '#948A7C', 0.7);
    }
  }

  // ---------- park ----------
  {
    const b = B('park');
    const s = L.swings;
    for (const x of [s.x - 1.75, s.x + 1.75]) {
      for (const dz of [-0.85, 0.85]) {
        const len = Math.hypot(s.top, dz);
        b.add(capsule(0.08, len - 0.1, 4, 10), C.pumpkin, { pos: [x, s.top / 2, s.z + dz / 2], rot: [Math.atan2(dz, s.top) * -1, 0, 0] });
        circle(x, s.z + dz, 0.16);
      }
    }
    b.add(capsule(0.09, 3.5, 4, 10), C.apricot, { pos: [s.x, s.top, s.z], rot: [0, 0, Math.PI / 2] });
    box(s.x - 1.5, s.z - 0.25, s.x + 1.5, s.z + 0.25);

    const ss = L.seesaw;
    b.add(rbox(0.5, ss.h - 0.06, 0.6, 0.1), C.pumpkin, { pos: [ss.x, (ss.h - 0.06) / 2, ss.z] });
    b.add(capsule(0.08, 0.6, 3, 10), C.cocoa, { pos: [ss.x, ss.h - 0.02, ss.z], rot: [Math.PI / 2, 0, 0] });
    box(ss.x - 1.85, ss.z - 0.25, ss.x + 1.85, ss.z + 0.25);

    // picnic blanket with a checker pattern
    const bl = L.blanket;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      b.add(rbox(0.34, 0.02, 0.33, 0.008), (i + j) % 2 ? C.pink : C.cream2, { pos: [bl.x - 0.85 + i * 0.34, 0.01, bl.z - 0.66 + j * 0.33] }, { outline: false });
    }
    const bk = L.basket;
    b.add(rbox(0.5, 0.3, 0.36, 0.08), C.honey, { pos: [bk.x, 0.16, bk.z] });
    b.add(rbox(0.52, 0.06, 0.38, 0.03), C.honeyDark, { pos: [bk.x, 0.3, bk.z] });
    b.add(torus(0.18, 0.03, 6, 16, Math.PI), C.honeyDark, { pos: [bk.x, 0.32, bk.z] });
    b.add(sphere(0.07, 10, 8), C.berry, { pos: [bk.x + 0.4, 0.07, bk.z + 0.1] });
    circle(bk.x, bk.z, 0.3);
    seats.push({ id: 'blanket-0', kind: 'ground', x: bl.x - 0.5, y: 0.02, z: bl.z + 0.1, yaw: Math.PI / 2 });
    seats.push({ id: 'blanket-1', kind: 'ground', x: bl.x + 0.5, y: 0.02, z: bl.z + 0.25, yaw: -Math.PI / 2 });
  }

  // ---------- stage ----------
  {
    const b = B('stage');
    const s = L.stage, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    b.add(rbox(s.x1 - s.x0, s.h, s.z1 - s.z0, 0.06), C.honey, { pos: [cx, s.h / 2, cz] });
    for (let i = 1; i < 12; i++) b.add(rbox(0.03, 0.01, s.z1 - s.z0 - 0.2, 0.004), C.honeyDark, { pos: [s.x0 + i * 0.66, s.h + 0.001, cz] }, { outline: false });
    b.add(rbox(5, s.stepH, s.stepZ - s.z1 + 0.1, 0.04), C.honeyLight, { pos: [0, s.stepH / 2, (s.stepZ + s.z1) / 2 - 0.05] });
    // shell behind the stage (lower half is buried)
    b.add(roundCyl(3.9, 0.3, 0.12, 48), C.cream2, { pos: [0, s.h, s.z0 + 0.05], rot: [Math.PI / 2, 0, 0] });
    b.add(roundCyl(3.4, 0.1, 0.05, 44), C.pink, { pos: [0, s.h, s.z0 + 0.38], rot: [Math.PI / 2, 0, 0] }, { outline: false });
    box(-4, s.z0 - 0.3, 4, s.z0 + 0.45);
    // bunting around the shell
    for (let i = 1; i < 14; i++) {
      const a = Math.PI - (i / 14) * Math.PI;
      b.add(rbox(0.2, 0.28, 0.03, 0.05), [C.apricot, C.pink, C.butter, C.blue, C.sage][i % 5], {
        pos: [Math.cos(a) * 3.65, s.h + Math.sin(a) * 3.65 - 0.12, s.z0 + 0.48], rot: [0, 0, a - Math.PI / 2],
      }, { outline: false });
    }
    // piano (keys face +x, player sits at x=-1.8)
    const py = s.h;
    b.add(rbox(0.65, 1.2, 1.5, 0.08), C.honeyDark, { pos: [-2.75, py + 0.6, -14.6] });
    b.add(rbox(0.4, 0.1, 1.4, 0.03), C.honeyDark, { pos: [-2.3, py + 0.72, -14.6] });
    b.add(rbox(0.28, 0.05, 1.3, 0.02), C.cream2, { pos: [-2.28, py + 0.79, -14.6] });
    for (let i = 0; i < 9; i++) if (i % 3 !== 2) b.add(rbox(0.14, 0.04, 0.07, 0.015), C.cocoa, { pos: [-2.35, py + 0.83, -15.1 + i * 0.13] }, { outline: false });
    b.add(rbox(0.36, 0.08, 0.7, 0.04), C.pink, { pos: [-1.8, py + 0.48, -14.6] });
    for (const z of [-14.85, -14.35]) b.add(roundCyl(0.04, 0.45, 0.02, 8), C.cocoa, { pos: [-1.8, py, z] });
    box(-3.1, -15.4, -2.1, -13.8);
    // drums (player on the stool behind, facing the audience)
    const dx = 0.4, dz = -14.2;
    b.add(roundCyl(0.36, 0.42, 0.06, 22), C.pink, { pos: [dx, py + 0.38, dz + 0.21], rot: [Math.PI / 2, 0, 0] });
    b.add(roundCyl(0.25, 0.04, 0.02, 20), C.cream2, { pos: [dx, py + 0.38, dz + 0.25], rot: [Math.PI / 2, 0, 0] }, { outline: false });
    b.add(roundCyl(0.2, 0.2, 0.05, 18), C.pink, { pos: [dx - 0.5, py + 0.45, dz - 0.25] });
    b.add(roundCyl(0.17, 0.18, 0.05, 18), C.apricot, { pos: [dx + 0.2, py + 0.78, dz - 0.05], rot: [0.3, 0, 0] });
    b.add(roundCyl(0.03, 0.5, 0.01, 8), C.cocoa, { pos: [dx - 0.5, py, dz - 0.25] }, { outline: false });
    b.add(roundCyl(0.03, 1.0, 0.01, 8), C.cocoa, { pos: [dx + 0.6, py, dz - 0.2] }, { outline: false });
    b.add(roundCyl(0.3, 0.025, 0.01, 22), C.butter, { pos: [dx + 0.6, py + 1.0, dz - 0.2], rot: [0.15, 0, 0] });
    b.add(roundCyl(0.2, 0.08, 0.04, 16), C.cocoa, { pos: [dx, py + 0.42, dz - 0.75] });
    b.add(roundCyl(0.05, 0.42, 0.02, 8), C.cocoa, { pos: [dx, py, dz - 0.75] });
    circle(dx, dz + 0.1, 0.55);
    // xylophone (player stands behind it)
    const xx = 2.6, xz = -13.9;
    b.add(rbox(1.3, 0.08, 0.5, 0.03), C.honeyDark, { pos: [xx, py + 0.66, xz] });
    for (const sx of [-0.55, 0.55]) for (const sz of [-0.18, 0.18]) b.add(roundCyl(0.03, 0.62, 0.01, 8), C.cocoa, { pos: [xx + sx, py, xz + sz] }, { outline: false });
    const barCols = [C.pink, C.apricot, C.butter, C.sage, C.blue, C.lilac, C.rose, C.pumpkin];
    for (let i = 0; i < 8; i++) b.add(rbox(0.12, 0.05, 0.42 - i * 0.025, 0.02), barCols[i], { pos: [xx - 0.5 + i * 0.143, py + 0.72, xz] });
    circle(xx, xz, 0.62);
    // speakers
    for (const x of [-3.6, 3.6]) {
      b.add(rbox(0.6, 0.9, 0.5, 0.1), C.cocoa, { pos: [x, py + 0.45, -15.2] });
      b.add(roundCyl(0.2, 0.04, 0.02, 16), C.honeyLight, { pos: [x, py + 0.55, -14.94], rot: [Math.PI / 2, 0, 0] }, { outline: false });
      circle(x, -15.2, 0.42);
    }
  }

  // ---------- campfire ----------
  {
    const b = B('camp');
    const f = L.campfire;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      b.add(sphere(0.2, 10, 8), i % 2 ? C.stone : C.stoneDark, { pos: [f.x + Math.cos(a) * 0.72, 0.06, f.z + Math.sin(a) * 0.72], scale: [1.2, 0.75, 1] });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      b.add(capsule(0.07, 0.65, 3, 8), C.honeyDark, { pos: [f.x + Math.cos(a) * 0.18, 0.2, f.z + Math.sin(a) * 0.18], rot: [0, -a, 1.05] });
    }
    circle(f.x, f.z, 1.0);
    [200, 320, 80].forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const x = f.x + Math.cos(a) * 2.3, z = f.z + Math.sin(a) * 2.3;
      const yaw = yawTo(f.x - x, f.z - z);
      b.add(capsule(0.21, 0.9, 4, 12), C.honeyDark, { pos: [x, 0.19, z], rot: [0, yaw, Math.PI / 2] });
      for (const lx of [-0.33, 0.33]) {
        const [sx, sz] = toWorld(x, z, yaw, lx, 0.02);
        seats.push({ id: `log-${i}-${lx < 0 ? 0 : 1}`, kind: 'log', x: sx, y: 0.42, z: sz, yaw });
      }
      for (const lx of [-0.4, 0.4]) { const [cx, cz] = toWorld(x, z, yaw, lx, -0.05); circle(cx, cz, 0.28); }
    });
  }

  // ---------- lookout ----------
  {
    const b = B('lookout');
    const t = L.telescope;
    const y = placeY(t.x, t.z, 0.4).y;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.add(capsule(0.04, 1.05, 3, 8), C.cocoa, { pos: [t.x + Math.cos(a) * 0.22, y + 0.5, t.z + Math.sin(a) * 0.22], rot: [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22] });
    }
    b.add(sphere(0.09, 10, 8), C.cocoa, { pos: [t.x, y + 1.05, t.z] });
    b.group({ pos: [t.x, y + 1.15, t.z], rot: [0, -Math.PI / 2, 0] }, (g) => {
      g.add(roundCyl(0.12, 0.9, 0.04, 16, 0.16), C.apricot, { pos: [0, 0, -0.3], rot: [Math.PI / 2 - 0.12, 0, 0] });
      g.add(roundCyl(0.06, 0.2, 0.02, 12), C.cocoa, { pos: [0, 0.03, -0.4], rot: [-Math.PI / 2 - 0.12, 0, 0] });
      g.add(torus(0.155, 0.035, 6, 18), C.butter, { pos: [0, 0.1, 0.55], rot: [-0.12, 0, 0] });
    });
    circle(t.x, t.z, 0.45);
    bench(b, -14.2, -11.9, -Math.PI / 2, 'lookout');
    b.add(rbox(0.9, 0.5, 0.08, 0.08), C.cream2, { pos: [-13.1, placeY(-13.1, -15.7).y + 0.9, -15.7], rot: [0, 0.4, 0] });
    b.add(roundCyl(0.05, 0.9, 0.02, 8), C.cocoa, { pos: [-13.1, placeY(-13.1, -15.7).y - 0.1, -15.7] });
    circle(-13.1, -15.7, 0.2);
  }

  // fence along the cliff edge, stepping back round the cut for the cliff steps (with a gap to go down)
  {
    const b = B('fence');
    const run = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.4));
        for (let k = 0; k <= n; k++) {
          const x = x0 + ((x1 - x0) * k) / n, z = z0 + ((z1 - z0) * k) / n;
          if (wildWater(x, z) || (creekAt(x, z)?.d ?? 99) < 2.2) continue;
          const y = terrainHeight(x, z);
          if (k === 0 && i > 0) continue;
          b.add(roundCyl(0.07, 0.95, 0.03, 7), C.honeyDark, { pos: [x, y - 0.1, z] });
          if (k < n) {
            const xn = x0 + ((x1 - x0) * (k + 1)) / n, zn = z0 + ((z1 - z0) * (k + 1)) / n;
            if (wildWater(xn, zn) || (creekAt(xn, zn)?.d ?? 99) < 2.2) continue;
            const y2 = terrainHeight(xn, zn), seg = Math.hypot(xn - x, zn - z);
            const ang = Math.atan2(y2 - y, seg), yaw = Math.atan2(xn - x, zn - z);
            for (const h of [0.45, 0.75]) b.add(rbox(0.06, 0.08, seg + 0.05, 0.03), C.honey, { pos: [(x + xn) / 2, (y + y2) / 2 + h, (z + zn) / 2], rot: [-ang, yaw, 0], });
          }
        }
      }
    };
    run([[-18.85, -60], [-18.85, -12.6], [-17.7, -12.2], [-17.7, 0.1]]);
    run([[-18.85, 1.9], [-18.85, 60]]);
  }

  // ---------- trees, bushes, flowers ----------
  function tree(b, x, z, s = 1, kind = 'round') {
    const y = terrainHeight(x, z) - 0.05;
    if (kind === 'blossom') blossoms.push({ x, y: y + 2.1 * s, z, s });
    fol.tree(x, y, z, s, kind);
  }
  function bush(b, x, z, s = 1) {
    fol.bush(x, terrainHeight(x, z), z, s, R() > 0.5);
  }
  {
    const b = null;
    const inner = [[-14, 13, 1.1], [-3, 16, 1], [-15.5, 17, 1.2, 'blossom'], [-3.6, 15.4, 0.9, 'blossom'], [15, 15, 1.1], [16, 2, 1, 'pine'],
      [-15.5, 1.5, 1.1, 'pine'], [5, -16.5, 1.1], [16.5, -15.5, 1.2, 'blossom'], [-6.5, -16.5, 1.1, 'pine'], [6.5, 16.5, 1], [-9, -8.6, 0.9, 'blossom'], [15.5, -3.5, 0.9]];
    for (const [x, z, s, k] of inner) { tree(b, x, z, s, k); circle(x, z, 0.3 * s); }
    const bushes = [[-17, 9], [-16.5, -6], [3.5, -9.5], [-3.5, -9.5], [7.5, 2.5], [17.5, 9], [-2.5, 18], [4, 13.5], [13, -15.5], [-17.5, 18.5], [18, 18]];
    for (const [x, z] of bushes) { bush(b, x, z, 1 + R() * 0.3); circle(x, z, 0.5); }
    for (let i = 0; i < 40; i++) {
      const x = -18 + R() * 37, z = -18.5 + R() * 37;
      if (Math.hypot(x, z) < 8 || pathAmt(x, z) > 0.2 || Math.hypot(x - L.pond.x, z - L.pond.z) < 5.6 || nearAny(x, z, 1.2)) continue;
      bush(b, x, z, 0.5 + R() * 0.3);
    }
  }
  function nearAny(x, z, m) {
    for (const c of collidersNear(x, z)) {
      if (c.c ? Math.hypot(x - c.x, z - c.z) < c.r + m : x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m) return true;
    }
    return false;
  }
  {
    const b = B('flowers');
    const cols = [C.pink, C.butter, C.cream2, C.rose, C.apricot, C.lilac];
    for (let i = 0; i < 260; i++) {
      const x = -18 + R() * 37, z = -18.5 + R() * 37;
      if (Math.hypot(x, z) < 7.8 || pathAmt(x, z) > 0.1 || Math.hypot(x - L.pond.x, z - L.pond.z) < 5.3 || nearAny(x, z, 0.5) || stageHeight(x, z) > -1 || (x > 7.5 && x < 15 && z < -7)) continue;
      const y = terrainHeight(x, z);
      b.add(capsule(0.018, 0.16, 2, 5), C.leafDark, { pos: [x, y + 0.08, z] }, { outline: false });
      b.add(sphere(0.06, 8, 6), cols[i % cols.length], { pos: [x, y + 0.2, z], scale: [1, 0.7, 1] }, { outline: false });
      b.add(sphere(0.025, 6, 4), C.butter, { pos: [x, y + 0.235, z] }, { outline: false });
    }
  }

  // ---------- houses + painted hills around the edge ----------
  {
    const b = B('houses');
    const homes = HOMES;
    const walls = ['#EFE3CF', '#E8C9C0', '#EDDDB0', '#C9D6DA', '#E6D8C2'];
    homes.forEach(([x, z, yaw], i) => {
      const { y, drop } = placeY(x, z, 2.3);
      const wcol = walls[i % walls.length];
      b.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
        // stone foundation reaching down to the lowest ground so nothing floats
        g.add(rbox(3.6, 0.5 + drop, 3.2, 0.06), '#8E8374', { pos: [0, (0.2 - drop) / 2 - 0.05, 0] }, { mat: 'stone' });
        g.add(rbox(3.4, 3.0, 3, 0.08), wcol, { pos: [0, 1.6, 0] }, { mat: 'plaster' });
        g.add(rbox(3.9, 0.22, 2.0, 0.06), '#A44F35', { pos: [0, 3.15, 0.72], rot: [0.62, 0, 0] }, { mat: 'stone' });
        g.add(rbox(3.9, 0.22, 2.0, 0.06), '#A44F35', { pos: [0, 3.15, -0.72], rot: [-0.62, 0, 0] }, { mat: 'stone' });
        g.add(rbox(3.3, 0.9, 0.5, 0.06), wcol, { pos: [0, 3.05, 0] }, { mat: 'plaster' });
        g.add(rbox(0.5, 1.3, 0.5, 0.04), '#8C7F70', { pos: [1.0, 3.75, -0.5] }, { mat: 'stone' });
        g.add(rbox(0.8, 1.35, 0.1, 0.03), '#6E4A32', { pos: [0.6, 0.78, 1.52] }, { mat: 'wood' });
        g.add(sphere(0.04, 8, 6), '#C9A65A', { pos: [0.85, 0.8, 1.6] }, { mat: 'metal', outline: false });
        for (const [wx, wy, wz, ry] of [[-0.8, 1.75, 1.5, 0], [1.72, 1.8, 0.4, Math.PI / 2]]) {
          g.group({ pos: [wx, wy, wz], rot: [0, ry, 0] }, (h) => {
            h.add(rbox(0.72, 0.72, 0.08, 0.02), '#1E2A30', { pos: [0, 0, 0.01] }, { mat: 'glossy', outline: false });
            h.add(rbox(0.84, 0.84, 0.05, 0.02), '#F4EEE2', { pos: [0, 0, 0.03] });
            h.add(rbox(0.04, 0.72, 0.06, 0.01), '#F4EEE2', { pos: [0, 0, 0.06] }, { outline: false });
            h.add(rbox(0.72, 0.04, 0.06, 0.01), '#F4EEE2', { pos: [0, 0, 0.06] }, { outline: false });
            h.add(rbox(0.86, 0.08, 0.16, 0.02), '#F4EEE2', { pos: [0, -0.44, 0.07] });
          });
        }
      });
      const [cx, cz] = toWorld(x, z, yaw, 1.0, -0.5);
      smokeSpots.push(new THREE.Vector3(cx, y + 4.5, cz));
      for (const [lx, lz] of [[-1, -0.9], [1, -0.9], [-1, 0.9], [1, 0.9]]) { const [px, pz] = toWorld(x, z, yaw, lx, lz); circle(px, pz, 1.05); }
      camBoxes.push({ x0: x - 2.2, z0: z - 2.2, x1: x + 2.2, z1: z + 2.2, h: y + 4.2 });
      W.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
        g.add(rbox(0.68, 0.68, 0.02, 0.01), C.butter, { pos: [-0.8, 1.75, 1.555] });
        g.add(rbox(0.68, 0.68, 0.02, 0.01), C.butter, { pos: [1.755, 1.8, 0.4], rot: [0, Math.PI / 2, 0] });
      });
      const [wx, wz] = toWorld(x, z, yaw, -0.8, 1.6);
      lampGlows.push({ p: new THREE.Vector3(wx, y + 1.75, wz), size: 1.6, color: C.butter });
    });
    const hills = [];
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.62 + (i / 25) * Math.PI * 1.24;
      const r = 95 + R() * 45;
      hills.push([Math.cos(a) * r + 15, Math.sin(a) * r * 1.05, 18 + R() * 22]);
    }
    hills.forEach(([x, z, s], i) => {
      b.add(sphere(s, 24, 14), ['#557F38', '#5E8A3E', '#6F9548', '#4F7734'][i % 4], { pos: [x, -s * 0.45, z], scale: [1.6, 0.85, 1.2] }, { outline: true, mat: 'ground' });
    });
  }

  // ---------- the woods and the cove ----------
  const wildTime = { value: 0 };
  const wild = { flags: [], mist: [], lamps: [], fireflySpots: [], floaters: [] };
  const wctx = { scene, fol, terrainHeight, circle, seats, lampGlows, smokeSpots, G, windows: W, trees: woodsPlan, time: wildTime, ...wild };
  buildWoods(wctx);
  buildCove(wctx);
  {
    const cb = WILD.cabin, cy = terrainHeight(cb.x, cb.z);
    camBoxes.push({ x0: cb.x - 2.6, z0: cb.z - 2.6, x1: cb.x + 2.6, z1: cb.z + 2.6, h: cy + 4.0 });
    camBoxes.push({ x0: -22.8, z0: 16.6, x1: -20.0, z1: 20.2, h: beachHeight(-21.4, 18.4) + 3.0 });
  }

  // ---------- assemble static groups ----------
  const noShadow = new Set(['cobbles', 'flowers', 'fence']);
  for (const [name, b] of Object.entries(groups)) {
    const g = b.build({ castShadow: !noShadow.has(name), outline: name !== 'cobbles' && name !== 'flowers' });
    g.name = name;
    scene.add(g);
  }
  const glowGroup = G.build({ material: MAT.glow, outline: true });
  scene.add(glowGroup);
  const windowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const winGroup = W.build({ material: windowMat, outline: false });
  winGroup.traverse((o) => { o.renderOrder = 2; });
  scene.add(winGroup);
  fol.build(scene);

  // soft contact shadows baked into the ground around everything that stands on it
  {
    const pos = terrainGeo.attributes.position, col = terrainGeo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      if (x < -20 || x > 61 || z < -61 || z > 61) continue;
      let occ = 1;
      for (const c of collidersNear(x, z)) {
        const d = c.c ? Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r) : Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
        if (d < 1.4) occ *= 1 - 0.32 * Math.exp(-d * 2.6);
      }
      col.setXYZ(i, col.getX(i) * occ, col.getY(i) * occ, col.getZ(i) * occ);
    }
    col.needsUpdate = true;
  }

  const wind = { value: 0 };

  // where grass grows (0..1): not on paths, the plaza, sand, the stage, under buildings or past the cliff
  function grassDensity(x, z) {
    if (x < L.cliffX + 0.3) return 0;
    if (isWater(x, z, 0) || Math.hypot(x - L.pond.x, z - L.pond.z) < 5.0) return 0;
    let d = 1 - pathAmt(x, z) * 1.6;
    const dp = Math.hypot(x, z);
    if (dp < 7.7) d = Math.min(d, smooth(7.3, 7.9, dp));
    if (stageHeight(x, z) > -1) return 0;
    if (x > 7.6 && x < 14.6 && z > -13.4 && z < -7.0) return 0;
    if (Math.abs(x - L.blanket.x) < 1.15 && Math.abs(z - L.blanket.z) < 0.95) return 0;
    let near = 9;
    for (const c of collidersNear(x, z)) {
      const dd = c.c ? Math.hypot(x - c.x, z - c.z) - c.r : Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
      if (dd < 0.15) return 0;
      near = Math.min(near, dd);
    }
    const e = Math.hypot(Math.max(0, x - 19.5), Math.max(0, Math.abs(z) - 19.5));
    if (e > 0) d = Math.min(d, wildGrass(x, z));
    // thinner under the trees, none up on the mountains
    const shade = e > 0 ? 0.55 + 0.45 * smooth(0.2, 2.2, near) : 1;
    const edge = Math.max(x - 60, Math.abs(z) - 60);
    return Math.max(0, d) * shade * (0.75 + 0.25 * Math.sin(x * 0.7 + z * 0.4)) * (1 - smooth(4, 12, e) * 0.25) * (1 - smooth(0, 6, edge));
  }

  // ---------- ambient life ----------
  const life = buildLife(scene, fx);

  const seatMap = new Map(seats.map((st) => [st.id, st]));
  let mistT = 0;
  const fp = new THREE.Vector3();
  const world = {
    L, colliders, seats, groundHeight, terrainHeight, isWater, inDock, lampGlows, smokeSpots, walkable, collidersNear, camBoxes,
    wind, boats: life.boats, lampPosts, blossoms, waterMeshes, windowMat, foliage: fol, wild: WILD, sailable,
    extraLamps: wild.lamps, fireflySpots: wild.fireflySpots,
    grassDensity: (x, z) => grassDensity(x, z),
    seatById: (id) => seatMap.get(id) || seats.find((s) => s.id === id),
    // is this point inside the ground or the cliff? (cameras back off)
    solidAt(x, y, z) {
      if (x >= -19.6) return y < terrainHeight(x, z) - 0.15;
      const top = terrainHeight(-19.6, z);
      if (y > top) return false;
      const k = (top - y) / (top + 9.2);
      const cove = smooth(3.0, 5.2, z) * (1 - smooth(20.6, 22.8, z));
      let face = -19.6 - (0.35 * Math.min(1, k * 4) + 1.6 * k) * (1 - cove * 0.85);
      if (z > -12.6 && z < 3.2 && y > -6.2) face = Math.max(face, -20.45);
      return x > face;
    },
    // keep a camera out of the cliff and above whatever is under it
    cameraFloor(x, z, y) {
      if (x < -19.5) {
        let f = L.seaY + 0.7;
        if (inCove(x, z)) f = Math.max(f, beachHeight(x, z) + 0.45);
        if (onDock(x, z)) f = Math.max(f, WILD.dock.y + 0.5);
        return f;
      }
      return groundHeight(x, z, y) + 0.45;
    },
    update(dt, t, roomSec, env) {
      wind.value = t;
      wildTime.value = t;
      fol.update(t);
      windowMat.opacity = THREE.MathUtils.smoothstep(env.night, 0.2, 0.7);
      life.update(dt, t, roomSec, { ...env, smokeSpots });
      // flags flutter, buoys bob, the falls throw up mist near you
      for (const f of wild.flags) {
        const p = f.geometry.attributes.position;
        if (!f.userData.base) f.userData.base = Float32Array.from(p.array);
        const base = f.userData.base;
        for (let i = 0; i < p.count; i++) {
          const x = base[i * 3] + 0.45;
          p.setZ(i, Math.sin(t * 6 + x * 5) * 0.08 * x + Math.sin(t * 3.1 + x * 2) * 0.03 * x);
        }
        p.needsUpdate = true;
        f.geometry.computeVertexNormals();
      }
      for (const fl of wild.floaters) {
        const o = {};
        fl.obj.position.y = seaHeight(fl.x, fl.z, t, o) - 0.1;
        fl.obj.rotation.set(o.slopeZ * 0.5, 0, -o.slopeX * 0.5);
      }
      mistT -= dt;
      if (fx && env.focus && mistT <= 0) {
        mistT = 0.1;
        for (const m of wild.mist) {
          fp.set(m.x, m.y, m.z);
          if (fp.distanceTo(env.focus) < 70 && Math.random() < 0.8) fx.emit('mist', fp, { a: m.big ? 0.35 : 0.28, n: m.big ? 2 : 1 });
        }
      }
    },
  };
  return world;
}

// Painted text on a transparent plane.
function textPlane(text, w, h, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.font = `600 ${Math.round(c.height * 0.72)}px Fredoka, "Trebuchet MS", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = C.ink;
  g.strokeText(text, c.width / 2, c.height / 2 + 4);
  g.fillStyle = color;
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, roughness: 0.8 }));
  // redraw once the web font is ready
  document.fonts?.ready.then(() => {
    g.clearRect(0, 0, c.width, c.height);
    g.font = `600 ${Math.round(c.height * 0.72)}px Fredoka, "Trebuchet MS", sans-serif`;
    g.strokeText(text, c.width / 2, c.height / 2 + 4);
    g.fillText(text, c.width / 2, c.height / 2 + 4);
    tex.needsUpdate = true;
  });
  return m;
}

// ---------- ducks, boats, butterflies, the sleeping cat, smoke ----------

function buildLife(scene, fx) {
  const R = rng(99);
  const p = L.pond;

  const ducks = [];
  for (let i = 0; i < 3; i++) {
    const b = new Builder();
    const body = i === 2 ? C.butter : C.cream2;
    b.add(sphere(0.2, 14, 10), body, { pos: [0, 0.1, 0], scale: [1, 0.75, 1.35] });
    b.add(sphere(0.07, 8, 6), body, { pos: [0, 0.2, -0.24], scale: [1, 1.6, 1.2] });
    b.add(sphere(0.13, 12, 10), body, { pos: [0, 0.34, 0.18] });
    b.add(sphere(0.06, 10, 8), C.apricot, { pos: [0, 0.31, 0.32], scale: [1.3, 0.6, 1.3] });
    b.add(sphere(0.022, 6, 5), C.eye, { pos: [0.07, 0.38, 0.27] }, { outline: false });
    b.add(sphere(0.022, 6, 5), C.eye, { pos: [-0.07, 0.38, 0.27] }, { outline: false });
    b.add(sphere(0.1, 10, 8), shadeHex(body, -0.06), { pos: [0.15, 0.13, -0.02], scale: [0.4, 0.7, 1.2] });
    b.add(sphere(0.1, 10, 8), shadeHex(body, -0.06), { pos: [-0.15, 0.13, -0.02], scale: [0.4, 0.7, 1.2] });
    const g = b.build();
    g.scale.setScalar(i === 2 ? 0.75 : 1);
    scene.add(g);
    ducks.push({ g, ph: (i / 3) * Math.PI * 2 + (i === 2 ? 0.35 : 0) });
  }

  // sailboats passing far out at sea
  const boats = [];
  const boatDefs = [
    { x: -58, period: 170, hull: '#2F5E8C', band: '#E8893A', name: 'Seabird', scale: 1.3 },
    { x: -84, period: 230, hull: '#F4F1EA', stripe: '#2F5E8C', band: '#C8434F', name: 'Clementine', dir: -1, scale: 1.6, cabin: true },
    { x: -118, period: 280, hull: '#8E3B32', band: '#3E7CB1', name: 'Old Maud', scale: 1.8, cabin: true },
  ];
  for (const d of boatDefs) {
    const boat = makeSailboat(d);
    boat.fenders.visible = false;
    const lamp = new Builder();
    lamp.add(sphere(0.07, 10, 8), C.butter, { pos: [0, 6.5, 1.15] });
    lamp.add(sphere(0.09, 10, 8), C.butter, { pos: [0, 1.2, -2.6] });
    boat.heel.add(lamp.build({ material: MAT.glow, outline: false }));
    scene.add(boat.root);
    boats.push({ g: boat.root, boat, ...d, dir: d.dir || 1, off: R() });
  }

  // butterflies: two instanced wings each
  const NB = 8;
  const wingGeo = sphere(0.09, 10, 6).scale(1, 0.15, 0.75).translate(0.08, 0, 0);
  const wings = new THREE.InstancedMesh(wingGeo, toonMaterial({ color: '#ffffff' }), NB * 2);
  const flyCols = [C.pink, C.butter, C.blue, C.apricot, C.lilac, C.cream2];
  const flies = [];
  for (let i = 0; i < NB; i++) {
    const home = [[-6, 9], [-12, 11], [4, 12], [-2, -9], [14, 3], [-13, -7], [3, -6], [16, 12]][i];
    flies.push({ hx: home[0], hz: home[1], ph: R() * 10, sp: 0.4 + R() * 0.3 });
    const c = new THREE.Color(flyCols[i % flyCols.length]);
    wings.setColorAt(i * 2, c); wings.setColorAt(i * 2 + 1, c);
  }
  wings.frustumCulled = false;
  scene.add(wings);

  // sleeping cat curled on the barrel by the café
  const cat = new Builder();
  const fur = '#F4C08A';
  cat.add(sphere(0.3, 16, 12), fur, { pos: [0, 0.16, 0], scale: [1.1, 0.6, 0.9] });
  cat.add(sphere(0.18, 14, 10), fur, { pos: [0.22, 0.24, 0.1] });
  cat.add(lathe([[0.07, 0], [0.05, 0.06], [0.02, 0.1], [0, 0.11]], 8), fur, { pos: [0.3, 0.36, 0.06], rot: [0.3, 0, -0.3], scale: [1, 1, 0.6] });
  cat.add(lathe([[0.07, 0], [0.05, 0.06], [0.02, 0.1], [0, 0.11]], 8), fur, { pos: [0.18, 0.38, 0.2], rot: [0.5, 0, 0.1], scale: [1, 1, 0.6] });
  cat.add(torus(0.25, 0.06, 8, 20, Math.PI * 1.1), '#E8A86A', { pos: [-0.02, 0.07, 0.02], rot: [Math.PI / 2, 0, 0.6] });
  cat.add(capsule(0.025, 0.05, 2, 6), C.eye, { pos: [0.3, 0.25, 0.22], rot: [0, 0, Math.PI / 2] }, { outline: false });
  cat.add(capsule(0.025, 0.05, 2, 6), C.eye, { pos: [0.19, 0.26, 0.26], rot: [0, 0.5, Math.PI / 2] }, { outline: false });
  cat.add(sphere(0.04, 8, 6), C.pink, { pos: [0.36, 0.2, 0.2], scale: [1.2, 0.6, 0.6] }, { outline: false });
  const catG = cat.build();
  catG.position.set(14.7, 0.72, -8.5);
  catG.rotation.y = -0.6;
  scene.add(catG);

  let smokeT = 0, zT = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  return {
    ducks, boats,
    update(dt, t, roomSec, env) {
      ducks.forEach((d, i) => {
        const a = roomSec * 0.12 + d.ph;
        const x = p.x + 1.1 + Math.cos(a) * 1.6, z = p.z + Math.sin(a) * 2.2;
        d.g.position.set(x, p.water + Math.sin(t * 2 + i) * 0.015 - 0.02, z);
        d.g.rotation.y = Math.atan2(-Math.sin(a) * 1.6, Math.cos(a) * 2.2);
        d.g.rotation.z = Math.sin(t * 2.2 + i) * 0.05;
      });
      boats.forEach((b, i) => {
        const k = ((roomSec / b.period + b.off) % 1 + 1) % 1;
        const z = (b.dir > 0 ? -160 + k * 320 : 160 - k * 320);
        const o = {};
        b.g.position.set(b.x, seaHeight(b.x, z, t, o) - 0.05, z);
        b.g.rotation.y = b.dir > 0 ? 0 : Math.PI;
        b.boat.heel.rotation.set(o.slopeZ * 0.4 * b.dir, 0, -0.12 - o.slopeX * 0.3);
        // the breeze is from the west-north-west: both ways along the coast are a reach
        b.boat.setSails(b.dir > 0 ? 1.91 : -1.23, 0.7, dt);
      });
      flies.forEach((f, i) => {
        const tt = t * f.sp + f.ph;
        const x = f.hx + Math.sin(tt * 0.9) * 2.2 + Math.sin(tt * 2.1) * 0.5;
        const z = f.hz + Math.cos(tt * 0.7) * 2.0;
        const y = terrainHeight(x, z) + 0.8 + Math.sin(tt * 3.1) * 0.3;
        const heading = Math.atan2(Math.cos(tt * 0.9) * 2.0, -Math.sin(tt * 0.7) * 1.4);
        const flap = Math.sin(t * 22 + i) * 0.9;
        const show = env.night < 0.6 ? 1 : 0.001;
        for (let s = 0; s < 2; s++) {
          e.set(0, heading + s * Math.PI, flap, 'YXZ');
          q.setFromEuler(e);
          m4.compose(v.set(x, y, z), q, one.set(show, show, show));
          wings.setMatrixAt(i * 2 + s, m4);
        }
      });
      wings.instanceMatrix.needsUpdate = true;
      catG.scale.set(1 + Math.sin(t * 1.4) * 0.03, 1 + Math.sin(t * 1.4) * 0.05, 1);
      if (fx) {
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = 0.55;
          for (const s of env.smokeSpots) fx.emit('smoke', s);
        }
        zT -= dt;
        if (zT <= 0) { zT = 1.6; fx.emit('z', new THREE.Vector3(14.9, 1.25, -8.35)); }
      }
    },
  };
}

function shadeHex(hex, k) {
  return '#' + new THREE.Color(hex).offsetHSL(0, 0, k).getHexString();
}
