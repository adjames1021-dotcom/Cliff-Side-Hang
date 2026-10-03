// The hand-made map: a hillside village square on a sea cliff.
import * as THREE from 'three';
import { C, MAT, Builder, rbox, sphere, capsule, torus, lathe, roundCyl, matrixOf, toonMaterial, rng, hash, outlineMaterial, addSmoothNormals } from './toon.js';

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
};

export function terrainHeight(x, z) {
  let h = 0;
  const ex = Math.max(0, x - 19.5), ez = Math.max(0, Math.abs(z) - 19.5);
  const e = Math.hypot(ex, ez);
  if (e > 0) h += smooth(0, 14, e) * (6 + 2.5 * Math.sin(x * 0.11 + z * 0.07) + 1.8 * Math.sin(z * 0.23 - x * 0.05));
  const dl = Math.hypot(x - L.lookout.x, z - L.lookout.z);
  if (dl < L.lookout.r) h += L.lookout.h * (0.5 + 0.5 * Math.cos((Math.PI * dl) / L.lookout.r));
  const dp = Math.hypot(x - L.pond.x, z - L.pond.z);
  if (dp < 5.4) h -= 0.95 * (1 - smooth(3.2, 5.4, dp));
  return h;
}

export const inDock = (x, z, m = 0) => x >= L.dock.x0 - 0.3 && x <= L.dock.x1 - m && z >= L.dock.z0 + m && z <= L.dock.z1 - m;

function stageHeight(x, z) {
  const s = L.stage;
  if (x < s.x0 || x > s.x1) return -1;
  if (z >= s.z0 && z <= s.z1) return s.h;
  if (z > s.z1 && z <= s.stepZ && Math.abs(x) <= 2.5) return s.stepH;
  return -1;
}

// Height of whatever you'd stand on (terrain, cobbles, stage, dock).
export function groundHeight(x, z) {
  let h = terrainHeight(x, z);
  const dp = Math.hypot(x - L.plaza.x, z - L.plaza.z);
  if (dp < 7.5) h = Math.max(h, 0.035 * (1 - smooth(7.25, 7.5, dp)));
  const st = stageHeight(x, z);
  if (st > h) h = st;
  if (inDock(x, z)) h = Math.max(h, L.dock.y);
  return h;
}

export const isWater = (x, z, m = 0.3) =>
  Math.hypot(x - L.pond.x, z - L.pond.z) < 4.75 && !inDock(x, z, m * 0.5);

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
  const R = rng(7);
  const circle = (x, z, r) => colliders.push({ c: true, x, z, r });
  const box = (x0, z0, x1, z1) => colliders.push({ c: false, x0, z0, x1, z1 });

  const groups = {};
  const B = (name) => (groups[name] ||= new Builder());
  const G = new Builder(); // glowing bits

  // ---------- terrain ----------
  const xs = [], zs = [];
  for (let i = 0; i <= 130; i++) xs.push(-19.6 + (40.6 * i) / 130);
  for (let i = 1; i <= 40; i++) xs.push(21 + 69 * Math.pow(i / 40, 1.8));
  for (let i = 40; i >= 1; i--) zs.push(-21 - 69 * Math.pow(i / 40, 1.8));
  for (let i = 0; i <= 130; i++) zs.push(-21 + (42 * i) / 130);
  for (let i = 1; i <= 40; i++) zs.push(21 + 69 * Math.pow(i / 40, 1.8));

  const paths = [
    [[0, -7.3], [0, -11.2]], [[5.2, -5.2], [9.5, -7.9]], [[-7.2, -1.2], [-9.4, -2.4]],
    [[-5.4, 5.0], [-7.5, 8.0]], [[6.6, 3.4], [4.6, 8.7]], [[-5.2, -5.2], [-11.2, -10.8]],
    [[-11.2, -10.8], [-13.2, -12.6]], [[7.2, -1.6], [15, -3]],
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

  const cGrass = new THREE.Color(C.sage), cGrass2 = new THREE.Color('#A3C78E'), cGrass3 = new THREE.Color('#BCD6A2');
  const cPath = new THREE.Color('#EED8AE'), cSand = new THREE.Color('#F1DDB2'), cBed = new THREE.Color('#C9B58E');
  const cPlaza = new THREE.Color('#E6D0AD'), cHill = new THREE.Color('#9FC58C'), cHill2 = new THREE.Color('#C3D79B');
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
      if (e > 0) tmp.lerp(Math.sin(x * 0.2 + z * 0.13) > 0 ? cHill : cHill2, smooth(0, 10, e) * 0.8);
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
    const terrain = new THREE.Mesh(g, MAT.toon);
    terrain.receiveShadow = true;
    terrain.name = 'terrain';
    scene.add(terrain);
  }

  // ---------- cliff face + sea ----------
  {
    const cols = [], rows = 16;
    for (let z = -95; z <= 95; z += 0.7) cols.push(z);
    const pos = [], col = [], idx = [];
    const bands = ['#F0CFA0', '#E9B07A', '#E39E6C', '#EDBE8A', '#DB8E5E', '#E9B07A', '#D98A5E'].map((c) => new THREE.Color(c));
    cols.forEach((z, i) => {
      const top = terrainHeight(-19.6, z);
      for (let r = 0; r <= rows; r++) {
        const k = r / rows;
        const y = top + (-9.2 - top) * k;
        const bump = r === 0 ? 0 : (Math.sin(z * 0.9 + r) * 0.25 + Math.sin(z * 0.31 + r * 2.1) * 0.45 + hash(i, r) * 0.25) * Math.min(1, k * 4);
        pos.push(-19.6 - bump - k * 1.6, y, z);
        const c = r === 0 ? new THREE.Color('#A9C98F') : bands[Math.floor((y + 12) * 0.9) % bands.length].clone().lerp(new THREE.Color('#C98962'), k * 0.35);
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
    const cliff = new THREE.Mesh(g, MAT.toon);
    cliff.receiveShadow = true;
    scene.add(cliff);

    // foam hugging the cliff base
    const fp = [], fi = [];
    cols.forEach((z, i) => {
      const w = 0.7 + Math.sin(z * 1.3) * 0.25 + hash(i, 3) * 0.3;
      fp.push(-20.2, L.seaY + 0.03, z, -21.2 - w, L.seaY + 0.03, z);
      if (i) { const a = (i - 1) * 2; fi.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setIndex(fi);
    const foam = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: '#FFF6E6', transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
    scene.add(foam);
  }

  const water = makeWaterMaterial();
  const sea = makeSeaMaterial();
  {
    const g = new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2).translate(-19.8 - 700, L.seaY, 0);
    const m = new THREE.Mesh(g, sea);
    m.receiveShadow = false;
    scene.add(m);
  }

  // sea stacks and far islands
  {
    const b = B('sea');
    for (const [x, z, s] of [[-26, -30, 2.2], [-29, 22, 2.8], [-23.8, 4, 1.2], [-32, -8, 1.6]]) {
      b.add(rbox(s * 1.5, s * 3.2, s * 1.3, s * 0.45), '#E3A77C', { pos: [x, L.seaY + s * 0.9, z], rot: [0.05, 0.4, 0.08] });
      b.add(rbox(s * 1.1, s * 1.8, s, s * 0.35), '#EDC398', { pos: [x + s * 0.9, L.seaY + s * 0.3, z + s * 0.5], rot: [0, -0.3, -0.1] });
      b.add(rbox(s * 0.9, s * 1.1, s * 0.9, s * 0.3), '#D9946A', { pos: [x - s * 0.8, L.seaY + s * 0.1, z - s * 0.4], rot: [0.1, 0.8, 0] });
      b.add(sphere(s * 0.7, 10, 6), C.leaf, { pos: [x, L.seaY + s * 2.5, z], scale: [1.05, 0.35, 0.95] });
    }
    for (const [x, z, s] of [[-150, -70, 22], [-190, 50, 30], [-120, 120, 18]]) {
      b.add(sphere(s, 20, 12), '#C99A8A', { pos: [x, L.seaY - s * 0.3, z], scale: [1.4, 0.7, 1] }, { outline: false });
      b.add(sphere(s * 0.6, 16, 10), '#B8A58E', { pos: [x + s * 0.4, L.seaY + s * 0.1, z + s * 0.3], scale: [1, 0.8, 1] }, { outline: false });
    }
  }

  // ---------- plaza ----------
  {
    const b = B('cobbles');
    const cobCols = [C.cream, C.cream2, '#F2D7B0', '#F1D2C4', '#EAD1A8'];
    for (let r = 2.75; r < 7.2; r += 0.52) {
      const n = Math.floor((2 * Math.PI * r) / 0.56);
      const off = R() * 6;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (pathAmt(x, z) > 0.95 && r > 6.8) continue;
        b.add(sphere(0.24, 7, 4), cobCols[Math.floor(R() * cobCols.length)], {
          pos: [x, 0, z], rot: [0, a, 0], scale: [1 + R() * 0.15, 0.15, 0.85 + R() * 0.15],
        }, { outline: false });
      }
    }
    // fountain
    const f = B('plaza');
    f.add(lathe([[0, -0.05], [2.1, -0.05], [2.2, 0.08], [2.2, 0.48], [2.1, 0.6], [1.92, 0.6], [1.85, 0.5], [1.85, 0.1], [0, 0.1]], 40), C.stone);
    f.add(roundCyl(0.42, 1.25, 0.12, 20), C.cream2, { pos: [0, 0.1, 0] });
    f.add(lathe([[0, 1.1], [0.5, 1.12], [0.95, 1.3], [1.0, 1.42], [0.88, 1.42], [0.5, 1.3], [0, 1.3]], 28), C.stone);
    f.add(roundCyl(0.16, 0.5, 0.08, 14), C.cream2, { pos: [0, 1.3, 0] });
    f.add(sphere(0.22, 14, 10), C.apricot, { pos: [0, 1.88, 0] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      f.add(sphere(0.13, 10, 8), C.pink, { pos: [Math.cos(a) * 2.15, 0.62, Math.sin(a) * 2.15], scale: [1, 0.7, 1] });
    }
    const w1 = new THREE.Mesh(new THREE.CircleGeometry(1.88, 40).rotateX(-Math.PI / 2), water);
    w1.position.y = 0.42;
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.9, 28).rotateX(-Math.PI / 2), water);
    w2.position.y = 1.36;
    scene.add(w1, w2);
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
      f.add(new THREE.TubeGeometry(curve, 24, 0.022, 5), C.ink, {}, { outline: false });
      const bulbCols = [C.butter, C.pink, C.apricot, C.cream2];
      for (let k = 1; k < 8; k++) {
        const p = curve.getPoint(k / 8);
        G.add(sphere(0.075, 10, 8), bulbCols[k % 4], { pos: [p.x, p.y - 0.09, p.z], scale: [1, 1.25, 1] });
        lampGlows.push({ p: new THREE.Vector3(p.x, p.y - 0.09, p.z), size: 0.9, color: bulbCols[k % 4] });
      }
    }
  }

  function lampPost(b, x, z, h = 2.9) {
    const y = placeY(x, z, 0.2).y;
    b.add(roundCyl(0.2, 0.18, 0.06, 16), C.cocoa, { pos: [x, y - 0.02, z] });
    b.add(roundCyl(0.075, h - 0.2, 0.03, 12), C.cocoa, { pos: [x, y, z] });
    b.add(rbox(0.36, 0.08, 0.36, 0.03), C.cocoa, { pos: [x, y + h + 0.02, z] });
    b.add(lathe([[0, 0], [0.26, 0], [0.22, 0.1], [0, 0.2]], 14), C.pumpkin, { pos: [x, y + h + 0.42, z] });
    for (const [dx, dz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]])
      b.add(rbox(0.04, 0.36, 0.04, 0.015), C.cocoa, { pos: [x + dx, y + h + 0.24, z + dz] }, { outline: false });
    G.add(sphere(0.12, 12, 10), C.butter, { pos: [x, y + h + 0.24, z] });
    lampGlows.push({ p: new THREE.Vector3(x, y + h + 0.24, z), size: 2.2, color: C.butter });
    circle(x, z, 0.24);
  }

  function bench(b, x, z, yaw, id, seatH = 0.465) {
    const { y, drop } = placeY(x, z, 0.85);
    b.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
      for (let i = 0; i < 3; i++) g.add(rbox(1.7, 0.07, 0.16, 0.03), C.honey, { pos: [0, 0.43, -0.17 + i * 0.17] });
      for (let i = 0; i < 2; i++) g.add(rbox(1.7, 0.14, 0.06, 0.03), C.honey, { pos: [0, 0.64 + i * 0.19, -0.31], rot: [-0.12, 0, 0] });
      for (const sx of [-0.72, 0.72]) {
        g.add(rbox(0.08, 0.4 + drop, 0.46, 0.03), C.cocoa, { pos: [sx, (0.4 - drop) / 2, -0.02] });
        g.add(rbox(0.08, 0.52, 0.06, 0.03), C.cocoa, { pos: [sx, 0.7, -0.34], rot: [-0.12, 0, 0] });
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

  // ---------- café ----------
  {
    const b = B('cafe');
    const c = L.cafe, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, w = c.x1 - c.x0, d = c.z1 - c.z0;
    b.add(rbox(w, c.h, d, 0.18), C.cream2, { pos: [cx, c.h / 2 - 0.05, cz] });
    b.add(rbox(w + 0.5, 0.3, d + 0.5, 0.12), C.pumpkin, { pos: [cx, c.h + 0.08, cz] });
    b.add(rbox(w - 0.6, 0.35, d - 0.6, 0.12), C.apricot, { pos: [cx, c.h + 0.35, cz] });
    b.add(rbox(0.45, 0.9, 0.45, 0.08), C.pink, { pos: [c.x0 + 1.2, c.h + 0.75, cz - 0.6] });
    smokeSpots.push(new THREE.Vector3(c.x0 + 1.2, c.h + 1.3, cz - 0.6));
    // big window + door on the front
    G.add(rbox(1.6, 1.0, 0.12, 0.06), C.butter, { pos: [c.x0 + 1.25, 1.65, c.z1] });
    G.add(rbox(1.2, 1.0, 0.12, 0.06), C.butter, { pos: [c.x1 - 1.0, 1.65, c.z1] });
    b.add(rbox(1.8, 0.12, 0.2, 0.05), C.honey, { pos: [c.x0 + 1.25, 1.1, c.z1 + 0.05] });
    b.add(rbox(1.4, 0.12, 0.2, 0.05), C.honey, { pos: [c.x1 - 1.0, 1.1, c.z1 + 0.05] });
    // awning stripes
    for (let i = 0; i < 9; i++) {
      const x = c.x0 - 0.1 + (i + 0.5) * ((w + 0.2) / 9);
      b.add(rbox((w + 0.2) / 9 + 0.01, 0.08, 1.7, 0.035), i % 2 ? C.cream2 : C.apricot, { pos: [x, 2.45, c.z1 + 0.75], rot: [0.32, 0, 0] });
    }
    for (const x of [c.x0 + 0.15, c.x1 - 0.15]) {
      b.add(roundCyl(0.07, 2.25, 0.03, 10), C.cocoa, { pos: [x, 0, c.z1 + 1.45] });
      circle(x, c.z1 + 1.45, 0.16);
    }
    // counter
    const k = L.counter, kx = (k.x0 + k.x1) / 2, kz = (k.z0 + k.z1) / 2;
    b.add(rbox(k.x1 - k.x0, k.h - 0.06, k.z1 - k.z0, 0.08), C.honey, { pos: [kx, (k.h - 0.06) / 2, kz] });
    b.add(rbox(k.x1 - k.x0 + 0.2, 0.08, k.z1 - k.z0 + 0.2, 0.04), C.cream, { pos: [kx, k.h - 0.04, kz] });
    for (let i = 0; i < 6; i++) b.add(rbox(0.05, k.h - 0.2, 0.04, 0.02), C.honeyDark, { pos: [k.x0 + 0.3 + i * 0.6, (k.h - 0.06) / 2, k.z1 + 0.01] }, { outline: false });
    const top = k.h;
    // things on the counter
    b.add(rbox(0.5, 0.55, 0.38, 0.08), C.pink, { pos: [k.x0 + 0.45, top + 0.275, kz - 0.05] });
    b.add(roundCyl(0.06, 0.16, 0.02, 10), C.cocoa, { pos: [k.x0 + 0.45, top + 0.05, kz + 0.1] });
    b.add(roundCyl(0.24, 0.05, 0.02, 20), C.cream2, { pos: [kx + 0.9, top, kz] });
    b.add(lathe([[0, 0], [0.2, 0], [0.2, 0.06], [0.17, 0.2], [0.1, 0.27], [0, 0.29]], 20), C.pink, { pos: [kx + 0.9, top + 0.05, kz] });
    for (let i = 0; i < 3; i++) {
      b.add(roundCyl(0.075, 0.14, 0.03, 12), [C.cream2, C.apricot, C.blue][i], { pos: [kx - 0.5 + i * 0.25, top, kz + 0.12] });
      b.add(roundCyl(0.06, 0.02, 0.01, 12), C.cocoa, { pos: [kx - 0.5 + i * 0.25, top + 0.125, kz + 0.12] }, { outline: false });
    }
    b.add(lathe([[0, 0], [0.06, 0], [0.09, 0.22], [0, 0.22]], 14), C.pink, { pos: [kx + 0.35, top, kz - 0.12] });
    b.add(sphere(0.08, 10, 8), C.cream2, { pos: [kx + 0.35, top + 0.25, kz - 0.12] });
    box(c.x0, c.z0, c.x1, c.z1);
    box(k.x0 - 0.05, k.z0, k.x1 + 0.05, k.z1 + 0.05);
    // stools
    [9.8, 11, 12.2].forEach((x, i) => {
      const z = -7.75;
      b.add(roundCyl(0.2, 0.06, 0.02, 16), C.cocoa, { pos: [x, 0, z] });
      b.add(roundCyl(0.055, 0.56, 0.02, 10), C.cocoa, { pos: [x, 0, z] });
      b.add(roundCyl(0.23, 0.1, 0.045, 18), C.pink, { pos: [x, 0.55, z] });
      seats.push({ id: `stool-${i}`, kind: 'stool', x, y: 0.65, z, yaw: Math.PI });
      circle(x, z, 0.2);
    });
    // sign board with painted text
    b.add(rbox(2.3, 0.7, 0.12, 0.1), C.cream2, { pos: [cx, c.h + 0.85, c.z1 - 0.1] });
    const sign = textPlane('Café', 2.0, 0.55, '#E8893A');
    sign.position.set(cx, c.h + 0.85, c.z1 - 0.035);
    scene.add(sign);
    // menu board + flower boxes + barrel for the cat
    b.add(rbox(0.7, 0.9, 0.08, 0.06), C.cocoa, { pos: [c.x1 + 0.6, 0.65, c.z1 + 0.6], rot: [-0.2, -0.3, 0] });
    b.add(rbox(0.5, 0.06, 0.02, 0.02), C.cream2, { pos: [c.x1 + 0.62, 0.85, c.z1 + 0.66], rot: [-0.2, -0.3, 0] }, { outline: false });
    b.add(rbox(0.4, 0.05, 0.02, 0.02), C.pink, { pos: [c.x1 + 0.61, 0.7, c.z1 + 0.64], rot: [-0.2, -0.3, 0] }, { outline: false });
    circle(c.x1 + 0.6, c.z1 + 0.6, 0.35);
    b.add(roundCyl(0.36, 0.72, 0.08, 18), C.honeyDark, { pos: [14.7, 0, -8.5] });
    b.add(torus(0.36, 0.03, 6, 24), C.cocoa, { pos: [14.7, 0.2, -8.5], rot: [Math.PI / 2, 0, 0] }, { outline: false });
    b.add(torus(0.36, 0.03, 6, 24), C.cocoa, { pos: [14.7, 0.52, -8.5], rot: [Math.PI / 2, 0, 0] }, { outline: false });
    circle(14.7, -8.5, 0.42);
    for (const x of [c.x0 + 1.25, c.x1 - 1.0]) {
      b.add(rbox(1.3, 0.22, 0.3, 0.06), C.honeyDark, { pos: [x, 0.95, c.z1 + 0.2] });
      for (let i = 0; i < 5; i++) b.add(sphere(0.09, 8, 6), [C.pink, C.butter, C.rose][i % 3], { pos: [x - 0.5 + i * 0.25, 1.12, c.z1 + 0.2] }, { outline: false });
    }
  }

  // ---------- pond + dock ----------
  {
    const p = L.pond;
    const wm = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48).rotateX(-Math.PI / 2), water);
    wm.position.set(p.x, p.water, p.z);
    scene.add(wm);
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
    for (let i = 0; i < 14; i++) {
      const a = R() * Math.PI * 2, r = 3.0 + R() * 1.1;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (x < p.x - 2.2 && Math.abs(z - p.z) < 1.6) continue;
      b.add(roundCyl(0.32 + R() * 0.15, 0.03, 0.012, 16), R() > 0.5 ? C.leaf : '#9CC98A', { pos: [x, p.water + 0.005, z], rot: [0, R() * 6, 0] }, { outline: false });
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
      b.add(sphere(s, 10, 8), R() > 0.5 ? C.stone : C.stoneDark, { pos: [x, terrainHeight(x, z) + s * 0.25, z], scale: [1.2, 0.7, 1] });
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

  // fence along the cliff edge
  {
    const b = B('fence');
    const x = -18.85;
    for (let z = -19.6; z <= 19.6; z += 1.4) {
      const y = terrainHeight(x, z);
      b.add(roundCyl(0.07, 0.95, 0.04, 10), C.honeyDark, { pos: [x, y - 0.1, z] });
      if (z + 1.4 <= 19.7) {
        const y2 = terrainHeight(x, z + 1.4);
        const ang = Math.atan2(y2 - y, 1.4);
        for (const h of [0.45, 0.75]) b.add(rbox(0.06, 0.08, 1.45, 0.03), C.honey, { pos: [x, (y + y2) / 2 + h, z + 0.7], rot: [-ang, 0, 0] });
      }
    }
  }

  // ---------- trees, bushes, flowers ----------
  function tree(b, x, z, s = 1, kind = 'round') {
    const y = terrainHeight(x, z) - 0.1;
    b.add(roundCyl(0.16 * s, 1.5 * s, 0.05, 12, 0.11 * s), C.honeyDark, { pos: [x, y, z] });
    const leaf = kind === 'blossom' ? [C.pink, '#F9CBD3', C.rose] : [C.leaf, C.sage, C.leafDark];
    if (kind === 'pine') {
      for (let i = 0; i < 3; i++) b.add(lathe([[0, 0], [0.95 - i * 0.22, 0.1], [0.6 - i * 0.15, 0.55], [0, 0.85]].map(([a, c]) => [a * s, c * s]), 14), leaf[i % 3], { pos: [x, y + (1.0 + i * 0.55) * s, z] });
    } else {
      b.add(sphere(0.9 * s, 12, 8), leaf[0], { pos: [x, y + 2.0 * s, z] });
      b.add(sphere(0.65 * s, 10, 7), leaf[1], { pos: [x + 0.55 * s, y + 1.7 * s, z + 0.2 * s] });
      b.add(sphere(0.6 * s, 10, 7), leaf[2], { pos: [x - 0.45 * s, y + 1.75 * s, z - 0.3 * s] });
      b.add(sphere(0.55 * s, 10, 7), leaf[1], { pos: [x - 0.1 * s, y + 2.65 * s, z + 0.1 * s] });
    }
  }
  function bush(b, x, z, s = 1, col = C.leaf) {
    const y = terrainHeight(x, z);
    b.add(sphere(0.45 * s, 12, 9), col, { pos: [x, y + 0.25 * s, z], scale: [1, 0.85, 1] });
    b.add(sphere(0.35 * s, 10, 8), C.sage, { pos: [x + 0.35 * s, y + 0.2 * s, z + 0.1 * s], scale: [1, 0.85, 1] });
    if (R() > 0.4) for (let i = 0; i < 3; i++) b.add(sphere(0.06, 8, 6), [C.pink, C.butter, C.cream2][i], { pos: [x + (R() - 0.5) * 0.5 * s, y + 0.55 * s, z + (R() - 0.5) * 0.5 * s] }, { outline: false });
  }
  {
    const b = B('trees');
    const inner = [[-14, 13, 1.1], [-3, 16, 1], [-15.5, 17, 1.2, 'blossom'], [-2, 11.5, 0.9, 'blossom'], [15, 15, 1.1], [16, 2, 1, 'pine'],
      [-15.5, 1.5, 1.1, 'pine'], [5, -16.5, 1.1], [16.5, -15.5, 1.2, 'blossom'], [-6.5, -16.5, 1.1, 'pine'], [6.5, 16.5, 1], [-9, -8.6, 0.9, 'blossom'], [15.5, -3.5, 0.9]];
    for (const [x, z, s, k] of inner) { tree(b, x, z, s, k); circle(x, z, 0.32 * s); }
    for (let i = 0; i < 72; i++) {
      const side = i % 3;
      let x, z;
      if (side === 0) { x = -19 + R() * 40; z = -20.5 - R() * 12; }
      else if (side === 1) { x = 20.5 + R() * 12; z = -20 + R() * 40; }
      else { x = -19 + R() * 40; z = 20.5 + R() * 12; }
      if (x < -18.8) continue;
      tree(b, x, z, 0.9 + R() * 0.6, R() > 0.75 ? 'pine' : R() > 0.8 ? 'blossom' : 'round');
    }
    const bushes = [[-17, 9], [-16.5, -6], [3.5, -9.5], [-3.5, -9.5], [7.5, 2.5], [17.5, 9], [17.5, -10], [-2.5, 18], [4, 13.5], [13, -15.5], [-17.5, 18.5], [18, 18]];
    for (const [x, z] of bushes) { bush(b, x, z, 1 + R() * 0.3); circle(x, z, 0.5); }
    for (let i = 0; i < 40; i++) {
      const x = -18 + R() * 37, z = -18.5 + R() * 37;
      if (Math.hypot(x, z) < 8 || pathAmt(x, z) > 0.2 || Math.hypot(x - L.pond.x, z - L.pond.z) < 5.6 || nearAny(x, z, 1.2)) continue;
      bush(b, x, z, 0.5 + R() * 0.3, R() > 0.5 ? C.leaf : C.leafDark);
    }
  }
  function nearAny(x, z, m) {
    for (const c of colliders) {
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
    const homes = [[-8, -25, 0], [5, -26.5, 0.2], [15, -24.5, -0.3], [25.5, -9, -1.4], [26, 5, -1.7], [24.5, 15, -2.1], [-6, 25.5, Math.PI], [9, 26, Math.PI + 0.3]];
    const walls = [C.cream2, C.pink, C.butter, C.blue, C.cream];
    homes.forEach(([x, z, yaw], i) => {
      const { y } = placeY(x, z, 2.2);
      const wcol = walls[i % walls.length];
      b.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
        g.add(rbox(3.4, 3.2, 3, 0.2), wcol, { pos: [0, 1.1, 0] });
        g.add(rbox(3.9, 0.35, 2.0, 0.15), C.pumpkin, { pos: [0, 3.05, 0.72], rot: [0.62, 0, 0] });
        g.add(rbox(3.9, 0.35, 2.0, 0.15), C.pumpkin, { pos: [0, 3.05, -0.72], rot: [-0.62, 0, 0] });
        g.add(rbox(3.3, 0.9, 0.5, 0.12), wcol, { pos: [0, 2.9, 0], rot: [0, 0, 0] });
        g.add(rbox(0.5, 1.2, 0.5, 0.08), C.apricot, { pos: [1.0, 3.6, -0.5] });
        g.add(rbox(0.8, 1.3, 0.12, 0.06), C.honeyDark, { pos: [0.6, 0.65, 1.5] });
      });
      const [cx, cz] = toWorld(x, z, yaw, 1.0, -0.5);
      smokeSpots.push(new THREE.Vector3(cx, y + 4.3, cz));
      G.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
        g.add(rbox(0.7, 0.7, 0.12, 0.08), C.butter, { pos: [-0.8, 1.55, 1.5] });
        g.add(rbox(0.6, 0.6, 0.12, 0.08), C.butter, { pos: [1.72, 1.6, 0.4], rot: [0, Math.PI / 2, 0] });
      });
      const [wx, wz] = toWorld(x, z, yaw, -0.8, 1.6);
      lampGlows.push({ p: new THREE.Vector3(wx, y + 1.55, wz), size: 1.6, color: C.butter });
    });
    const hills = [];
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.62 + (i / 25) * Math.PI * 1.24;
      const r = 95 + R() * 45;
      hills.push([Math.cos(a) * r + 15, Math.sin(a) * r * 1.05, 18 + R() * 22]);
    }
    hills.forEach(([x, z, s], i) => {
      b.add(sphere(s, 20, 12), [C.sage, '#A2C590', '#BFD49A', '#94BE86'][i % 4], { pos: [x, -s * 0.45, z], scale: [1.6, 0.85, 1.2] }, { outline: true });
    });
  }

  // ---------- assemble static groups ----------
  const noShadow = new Set(['cobbles', 'flowers', 'sea']);
  for (const [name, b] of Object.entries(groups)) {
    const g = b.build({ castShadow: !noShadow.has(name), outline: name !== 'cobbles' && name !== 'flowers' });
    g.name = name;
    scene.add(g);
  }
  const glowGroup = G.build({ material: MAT.glow, outline: true });
  scene.add(glowGroup);

  // ---------- grass tufts that sway ----------
  const wind = { value: 0 };
  {
    const tb = new Builder();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      tb.add(lathe([[0.035, 0], [0.026, 0.11], [0.008, 0.21], [0, 0.22]], 4), i % 2 ? '#9CC48A' : '#B9D79F', { pos: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] });
    }
    const geo = tb.geometry();
    const mat = toonMaterial({
      vertexColors: true,
      onShader: Object.assign((s) => {
        s.uniforms.uWind = wind;
        s.vertexShader = 'uniform float uWind;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.45 + instanceMatrix[3].z * 0.31;
          float sw = sin(uWind * 1.6 + ph) * 0.6 + sin(uWind * 2.7 + ph * 1.7) * 0.25;
          transformed.x += sw * position.y * 0.9;
          transformed.z += sw * position.y * 0.4;`);
      }, { key: 'grass' }),
    });
    const spots = [];
    for (let i = 0; i < 4000 && spots.length < 1500; i++) {
      const x = -18.6 + R() * 41, z = -22 + R() * 44;
      if (Math.hypot(x, z) < 7.7 || pathAmt(x, z) > 0.05 || Math.hypot(x - L.pond.x, z - L.pond.z) < 5.2 || nearAny(x, z, 0.3) || stageHeight(x, z) > -1) continue;
      if (x > 7.6 && x < 14.6 && z > -13.4 && z < -7.4) continue;
      if (Math.abs(x - L.blanket.x) < 1.2 && Math.abs(z - L.blanket.z) < 1) continue;
      spots.push([x, z]);
    }
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const s = 0.8 + R() * 0.7;
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 6, 0)), new THREE.Vector3(s, s, s));
      im.setMatrixAt(i, m);
    });
    im.receiveShadow = true;
    scene.add(im);
  }

  // ---------- ambient life ----------
  const life = buildLife(scene, fx);

  const world = {
    L, colliders, seats, groundHeight, terrainHeight, isWater, inDock, lampGlows, smokeSpots,
    water, sea, wind,
    seatById: (id) => seats.find((s) => s.id === id),
    update(dt, t, roomSec, env) {
      wind.value = t;
      water.uniforms.uTime.value = t;
      sea.uniforms.uTime.value = t;
      life.update(dt, t, roomSec, { ...env, smokeSpots });
    },
  };
  return world;
}

// ---------- materials for water ----------

function makeWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color('#BFE3EE') },
      uDeep: { value: new THREE.Color('#8CC6DD') },
      uHi: { value: new THREE.Color('#FFF8EC') },
      uLight: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uHi; uniform float uLight;
      varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float n = sin(vW.x * 2.3 + uTime * 1.1 + sin(vW.z * 1.7 + uTime * 0.7)) * sin(vW.z * 2.1 - uTime * 0.9);
        vec3 col = mix(uDeep, uShallow, 0.5 + 0.5 * sin(vW.x * 0.6 + vW.z * 0.5));
        col = mix(col, uHi, step(0.82, n) * 0.55);
        gl_FragColor = vec4(col * uLight, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

function makeSeaMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uNear: { value: new THREE.Color('#9FD0E6') },
      uFar: { value: new THREE.Color('#C9E6F2') },
      uHi: { value: new THREE.Color('#FFF6E8') },
      uSunDir: { value: new THREE.Vector3(-1, 0.3, 0) },
      uSunCol: { value: new THREE.Color('#FFD9A0') },
      uLight: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uNear; uniform vec3 uFar; uniform vec3 uHi; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uLight;
      varying vec3 vW;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float d = length(vW.xz - cameraPosition.xz);
        vec3 col = mix(uNear, uFar, smoothstep(20.0, 160.0, d));
        // stylised wave crests
        float w = sin(vW.z * 0.9 + sin(vW.x * 0.45 + uTime * 0.5) * 1.4 + uTime * 0.8) * sin(vW.x * 0.7 - uTime * 0.45);
        col = mix(col, uHi, step(0.93, w) * 0.45 * (1.0 - smoothstep(25.0, 120.0, d)));
        // sun path, broken into toon dashes
        vec3 v = normalize(vW - cameraPosition);
        vec3 nrm = normalize(vec3(sin(vW.x * 0.9 + uTime) * 0.06, 1.0, sin(vW.z * 1.3 - uTime * 1.3) * 0.06));
        float s = max(dot(reflect(v, nrm), normalize(uSunDir)), 0.0);
        col = mix(col, uSunCol, step(0.985, s) * 0.85 * step(0.0, uSunDir.y + 0.05));
        gl_FragColor = vec4(col * uLight, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), toonMaterial({ map: tex, transparent: true, alphaTest: 0.05 }));
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

  const boats = [];
  const boatDefs = [
    { x: -40, period: 150, sail: C.cream2, hull: C.pumpkin },
    { x: -62, period: 210, sail: C.pink, hull: C.blue, dir: -1 },
    { x: -95, period: 260, sail: C.butter, hull: C.cream2 },
  ];
  for (const d of boatDefs) {
    const b = new Builder();
    b.add(rbox(1.6, 0.7, 4.6, 0.32), d.hull, { pos: [0, 0.2, 0] });
    b.add(sphere(0.8, 14, 10), d.hull, { pos: [0, 0.25, 2.1], scale: [1, 0.55, 0.9] });
    b.add(rbox(1.3, 0.12, 3.6, 0.05), C.honeyLight, { pos: [0, 0.56, -0.1] }, { outline: false });
    b.add(roundCyl(0.07, 4.6, 0.03, 10), C.honeyDark, { pos: [0, 0.5, 0.2] });
    b.add(lathe([[0, 0], [0.05, 0], [1.25, 0.25], [0.06, 3.7], [0, 3.8]], 3), d.sail, { pos: [0, 0.9, 0.1], scale: [0.12, 1, 1.0] });
    b.add(rbox(0.06, 0.35, 0.5, 0.03), C.berry, { pos: [0, 5.05, 0.05] });
    b.add(rbox(0.8, 0.6, 0.9, 0.15), C.cream2, { pos: [0, 0.85, -1.4] });
    const g = b.build();
    const lamp = new Builder();
    lamp.add(sphere(0.12, 10, 8), C.butter, { pos: [0, 1.3, -1.4] });
    const lg = lamp.build({ material: MAT.glow, outline: false });
    g.add(lg);
    scene.add(g);
    boats.push({ g, ...d, dir: d.dir || 1, off: R() });
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
        const x = p.x + 1.2 + Math.cos(a) * 1.9, z = p.z + Math.sin(a) * 2.6;
        d.g.position.set(x, p.water + Math.sin(t * 2 + i) * 0.015 - 0.02, z);
        d.g.rotation.y = Math.atan2(-Math.sin(a) * 1.9, Math.cos(a) * 2.6);
        d.g.rotation.z = Math.sin(t * 2.2 + i) * 0.05;
      });
      boats.forEach((b, i) => {
        const k = ((roomSec / b.period + b.off) % 1 + 1) % 1;
        const z = (b.dir > 0 ? -140 + k * 280 : 140 - k * 280);
        b.g.position.set(b.x, L.seaY + 0.15 + Math.sin(t * 0.9 + i) * 0.12, z);
        b.g.rotation.y = b.dir > 0 ? 0 : Math.PI;
        b.g.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.05;
        b.g.rotation.x = Math.sin(t * 0.55 + i) * 0.03;
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
