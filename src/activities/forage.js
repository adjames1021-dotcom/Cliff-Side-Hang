// Foraging and wildlife: things to find along the trails, by the creek and on the beach, and animals to spot.
// What lies where is worked out from the shared room clock, so friends see the same finds;
// picking one up only hides it for you until the next batch turns up.
import * as THREE from 'three';
import { Builder, sphere, capsule, torus, lathe, roundCyl, rbox, rng, MAT } from '../toon.js';
import { REAL, registerMesh } from '../materials.js';
import { findSpots, W } from '../wilds.js';
import { toast } from '../ui.js';

export const FINDS = [
  { id: 'chanterelle', name: 'Chanterelle', icon: '🍄', zones: ['woods', 'creek'], r: 1, note: 'Golden, frilly, smells faintly of apricots.' },
  { id: 'flyagaric', name: 'Fly agaric', icon: '🍄', zones: ['woods', 'glen'], r: 2, note: 'The storybook toadstool. Look, don\'t nibble.' },
  { id: 'porcini', name: 'Porcini', icon: '🍄', zones: ['woods'], r: 2, note: 'A plump little king of the forest floor.' },
  { id: 'pinecone', name: 'Pine cone', icon: '🌲', zones: ['woods', 'summit'], r: 1, note: 'Closes up when it\'s about to rain.' },
  { id: 'acorn', name: 'Acorn', icon: '🌰', zones: ['woods', 'meadow'], r: 1, note: 'A squirrel is definitely looking for this.' },
  { id: 'jayfeather', name: 'Jay feather', icon: '🪶', zones: ['woods', 'meadow'], r: 2, note: 'Barred in the brightest blue.' },
  { id: 'owlfeather', name: 'Owl feather', icon: '🪶', zones: ['woods', 'glen'], r: 3, night: true, note: 'Soft as a whisper. Only found after dark.' },
  { id: 'strawberry', name: 'Wild strawberries', icon: '🍓', zones: ['meadow', 'woods'], r: 1, note: 'Tiny, and sweeter than the big ones.' },
  { id: 'clover', name: 'Four-leaf clover', icon: '🍀', zones: ['meadow'], r: 3, note: 'Lucky you!' },
  { id: 'bluebell', name: 'Bluebells', icon: '🔔', zones: ['woods', 'creek'], r: 1, note: 'A little nodding bunch.' },
  { id: 'glowmoss', name: 'Glow moss', icon: '✨', zones: ['glen', 'creek'], r: 2, night: true, note: 'It shines on its own at night.' },
  { id: 'riverstone', name: 'Smooth river stone', icon: '🪨', zones: ['creek'], r: 1, note: 'Worn perfectly round by the water.' },
  { id: 'amber', name: 'Amber drop', icon: '🟠', zones: ['creek', 'woods'], r: 3, note: 'Old tree sap, glowing like honey.' },
  { id: 'crystal', name: 'Quartz crystal', icon: '💎', zones: ['summit', 'creek'], r: 3, note: 'Catches the light from every side.' },
  { id: 'goldenacorn', name: 'Golden acorn', icon: '🌟', zones: ['woods', 'glen', 'meadow'], r: 4, note: 'Nobody knows where these come from.' },
  { id: 'thyme', name: 'Wild thyme', icon: '🌿', zones: ['summit', 'meadow'], r: 1, note: 'Smells like summer holidays.' },
  { id: 'scallop', name: 'Scallop shell', icon: '🐚', zones: ['beach'], r: 1, note: 'Ridged like a little fan.' },
  { id: 'spiral', name: 'Spiral shell', icon: '🐚', zones: ['beach'], r: 1, note: 'Hold it to your ear.' },
  { id: 'seaglass', name: 'Sea glass', icon: '🟢', zones: ['beach'], r: 2, note: 'A bottle, softened by years of waves.' },
  { id: 'starfish', name: 'Starfish', icon: '⭐', zones: ['beach'], r: 2, note: 'You put it back in a rock pool. Nice.' },
  { id: 'driftwood', name: 'Driftwood twig', icon: '🪵', zones: ['beach'], r: 1, note: 'Silver-grey and light as a feather.' },
  { id: 'fossil', name: 'Ammonite fossil', icon: '🐌', zones: ['beach', 'summit'], r: 3, note: 'Older than the cliff itself.' },
  { id: 'bottle', name: 'Message in a bottle', icon: '🍾', zones: ['beach'], r: 4, note: '"Whoever finds this — have a lovely day!"' },
  { id: 'pearl', name: 'Pearl', icon: '⚪', zones: ['beach'], r: 4, note: 'Perfectly round and shimmering.' },
];
export const CRITTERS = [
  { id: 'deer', name: 'Deer', icon: '🦌' }, { id: 'rabbit', name: 'Rabbit', icon: '🐇' }, { id: 'owl', name: 'Owl', icon: '🦉' },
  { id: 'crab', name: 'Crab', icon: '🦀' }, { id: 'duck', name: 'Duck', icon: '🦆' },
];
const WEIGHT = { 1: 10, 2: 4, 3: 1.3, 4: 0.35 };
const RESPAWN_MS = 4 * 60 * 1000;
const KEY_FINDS = 'hh.finds', KEY_CRITTERS = 'hh.critters';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------- little models of each find ----------
function findModel(id) {
  const b = new Builder();
  const P = { mat: 'paint', outline: false }, G2 = { mat: 'glossy', outline: false };
  switch (id) {
    case 'chanterelle':
      for (const [x, z, s] of [[0, 0, 1], [0.07, 0.04, 0.75], [-0.06, 0.05, 0.6]]) {
        b.add(capsule(0.014 * s, 0.05 * s, 2, 6), '#E8A93A', { pos: [x, 0.03 * s, z] }, P);
        b.add(lathe([[0, 0], [0.04 * s, 0.01 * s], [0.055 * s, 0.03 * s], [0.03 * s, 0.035 * s], [0, 0.02 * s]], 10), '#F0B444', { pos: [x, 0.055 * s, z] }, P);
      }
      break;
    case 'flyagaric':
      b.add(capsule(0.016, 0.09, 2, 8), '#F4EFE4', { pos: [0, 0.05, 0] }, P);
      b.add(sphere(0.06, 14, 8), '#D43B32', { pos: [0, 0.11, 0], scale: [1, 0.55, 1] }, G2);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; b.add(sphere(0.008, 6, 4), '#FFFFFF', { pos: [Math.cos(a) * 0.035, 0.135, Math.sin(a) * 0.035] }, P); }
      break;
    case 'porcini':
      b.add(capsule(0.03, 0.05, 3, 8), '#E9DCC4', { pos: [0, 0.045, 0], scale: [1, 1, 1] }, P);
      b.add(sphere(0.055, 14, 8), '#8A5A34', { pos: [0, 0.095, 0], scale: [1, 0.6, 1] }, G2);
      break;
    case 'pinecone':
      for (let i = 0; i < 7; i++) b.add(sphere(0.04 - i * 0.004, 8, 6), '#7A5434', { pos: [0, 0.03, -0.035 + i * 0.012], scale: [1, 0.8, 0.6] }, { mat: 'wood', outline: false });
      break;
    case 'acorn':
    case 'goldenacorn': {
      const g = id === 'goldenacorn';
      b.add(sphere(0.025, 10, 8), g ? '#F2C14E' : '#B07A3E', { pos: [0, 0.03, 0], scale: [0.85, 1.2, 0.85] }, g ? { mat: 'metal', outline: false } : G2);
      b.add(sphere(0.026, 10, 6), g ? '#C99A2E' : '#6E4E36', { pos: [0, 0.052, 0], scale: [1, 0.55, 1] }, g ? { mat: 'metal', outline: false } : P);
      b.add(capsule(0.004, 0.012, 2, 4), '#5B4130', { pos: [0, 0.07, 0] }, P);
      break;
    }
    case 'jayfeather':
    case 'owlfeather':
      b.add(capsule(0.003, 0.16, 2, 4), '#F4EFE4', { pos: [0, 0.008, 0], rot: [Math.PI / 2, 0, 0.1] }, P);
      b.add(sphere(0.06, 10, 6), id === 'jayfeather' ? '#3E7CB1' : '#B79A72', { pos: [0, 0.008, 0.02], scale: [0.35, 0.05, 1.2] }, P);
      if (id === 'jayfeather') for (let i = 0; i < 4; i++) b.add(rbox(0.04, 0.004, 0.006, 0.001), '#1D2E4A', { pos: [0, 0.012, -0.02 + i * 0.022] }, P);
      break;
    case 'strawberry':
      for (const [x, z] of [[0, 0], [0.03, 0.02], [-0.025, 0.03]]) {
        b.add(sphere(0.016, 8, 6), '#D9343E', { pos: [x, 0.02, z], scale: [1, 1.2, 1] }, G2);
        b.add(sphere(0.012, 6, 4), '#4E7A34', { pos: [x, 0.036, z], scale: [1.4, 0.3, 1.4] }, P);
      }
      b.add(sphere(0.05, 8, 6), '#4E7A34', { pos: [0, 0.01, 0.01], scale: [1.4, 0.2, 1] }, P);
      break;
    case 'clover':
      b.add(capsule(0.003, 0.06, 2, 4), '#3E6B2E', { pos: [0, 0.03, 0] }, P);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.add(sphere(0.018, 8, 6), '#4F9A3A', { pos: [Math.cos(a) * 0.018, 0.062, Math.sin(a) * 0.018], scale: [1, 0.25, 1] }, P); }
      break;
    case 'bluebell':
      for (const [x, z] of [[0, 0], [0.03, 0.02], [-0.02, 0.03]]) {
        b.add(capsule(0.003, 0.14, 2, 4), '#3E6B2E', { pos: [x, 0.07, z], rot: [0.2, 0, 0] }, P);
        for (let k = 0; k < 3; k++) b.add(lathe([[0, 0], [0.012, -0.004], [0.014, -0.02], [0.018, -0.026], [0, -0.022]], 8), '#6C7FD9', { pos: [x + 0.01, 0.13 - k * 0.025, z + 0.03] }, P);
      }
      break;
    case 'glowmoss':
      for (let i = 0; i < 6; i++) b.add(sphere(0.03, 8, 6), '#9FF2B4', { pos: [(i % 3 - 1) * 0.035, 0.012, Math.floor(i / 3) * 0.035 - 0.02], scale: [1, 0.4, 1] }, P);
      break;
    case 'riverstone':
      b.add(sphere(0.05, 14, 10), '#8E8A84', { pos: [0, 0.02, 0], scale: [1, 0.5, 0.8] }, G2);
      break;
    case 'amber':
      b.add(sphere(0.026, 12, 8), '#E89A2E', { pos: [0, 0.022, 0], scale: [1, 0.85, 0.75] }, G2);
      break;
    case 'crystal':
      for (const [x, z, a] of [[0, 0, 0], [0.02, 0.01, 0.4], [-0.015, 0.015, -0.4]]) b.add(lathe([[0, 0], [0.012, 0.004], [0.012, 0.05], [0, 0.07]], 6), '#E6F0F5', { pos: [x, 0, z], rot: [a, 0, a * 0.6] }, G2);
      break;
    case 'thyme':
      for (let i = 0; i < 8; i++) { const a = i * 0.8; b.add(capsule(0.003, 0.06, 2, 4), '#5E7A3E', { pos: [Math.cos(a) * 0.02, 0.03, Math.sin(a) * 0.02], rot: [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4] }, P); b.add(sphere(0.007, 6, 4), '#B58AD9', { pos: [Math.cos(a) * 0.035, 0.06, Math.sin(a) * 0.035] }, P); }
      break;
    case 'scallop':
      for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.225; b.add(rbox(0.012, 0.008, 0.06, 0.004), i % 2 ? '#F2C9A8' : '#E9B48A', { pos: [Math.sin(a) * 0.026, 0.006, Math.cos(a) * 0.026 - 0.01], rot: [0, a, 0] }, G2); }
      break;
    case 'spiral':
      for (let i = 0; i < 6; i++) b.add(sphere(0.024 - i * 0.003, 10, 8), i % 2 ? '#F4E2C8' : '#D9B48A', { pos: [i * 0.006, 0.02 + i * 0.006, i * 0.004] }, G2);
      break;
    case 'seaglass':
      b.add(sphere(0.022, 8, 6), '#7FC9A8', { pos: [0, 0.008, 0], scale: [1.3, 0.35, 0.9] }, G2);
      b.add(sphere(0.016, 8, 6), '#8FB7E8', { pos: [0.04, 0.007, 0.02], scale: [1.2, 0.35, 1] }, G2);
      break;
    case 'starfish':
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add(capsule(0.012, 0.045, 2, 6), '#E8893A', { pos: [Math.cos(a) * 0.026, 0.01, Math.sin(a) * 0.026], rot: [0, -a, Math.PI / 2], scale: [1, 1, 0.6] }, P); }
      break;
    case 'driftwood':
      b.add(capsule(0.012, 0.18, 2, 6), '#B5A48C', { pos: [0, 0.012, 0], rot: [0, 0.3, Math.PI / 2] }, { mat: 'wood', outline: false });
      b.add(capsule(0.007, 0.06, 2, 6), '#B5A48C', { pos: [0.03, 0.012, 0.03], rot: [0, 1.2, Math.PI / 2] }, { mat: 'wood', outline: false });
      break;
    case 'fossil':
      b.add(roundCyl(0.045, 0.02, 0.006, 16), '#B9AE9C', { pos: [0, 0.0, 0] }, { mat: 'stone', outline: false });
      b.add(torus(0.025, 0.006, 6, 18, Math.PI * 1.6), '#8C8378', { pos: [0, 0.022, 0], rot: [Math.PI / 2, 0, 0] }, { mat: 'stone', outline: false });
      b.add(torus(0.012, 0.005, 6, 12), '#8C8378', { pos: [0, 0.022, 0], rot: [Math.PI / 2, 0, 0] }, { mat: 'stone', outline: false });
      break;
    case 'bottle':
      b.add(lathe([[0, 0], [0.03, 0], [0.032, 0.09], [0.012, 0.12], [0.012, 0.15], [0, 0.15]], 12), '#5FA88A', { pos: [0, 0.03, 0], rot: [0, 0, Math.PI / 2 - 0.05] }, G2);
      b.add(roundCyl(0.013, 0.02, 0.004, 8), '#A8723C', { pos: [-0.16, 0.03, 0], rot: [0, 0, Math.PI / 2] }, P);
      b.add(rbox(0.06, 0.02, 0.02, 0.005), '#F4EFE4', { pos: [-0.04, 0.03, 0], rot: [0, 0, 0] }, P);
      break;
    case 'pearl':
      b.add(sphere(0.04, 12, 8), '#E9DCC4', { pos: [0, 0.012, 0], scale: [1, 0.45, 0.9] }, G2);
      b.add(sphere(0.012, 12, 10), '#F7F2EC', { pos: [0, 0.03, 0] }, G2);
      break;
  }
  return b;
}

export default function forage(game) {
  const { scene, me, fx, audio, clock } = game;
  const R = rng(321);
  const spots = findSpots(R, { near: (x, z, m) => game.world.collidersNear(x, z).some((c) => (c.c ? Math.hypot(x - c.x, z - c.z) < c.r + m : x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m)) }, game.world.terrainHeight);
  spots.forEach((s, i) => { s.i = i; s.rot = R() * 6.28; });
  const found = load(KEY_FINDS), spotted = load(KEY_CRITTERS);
  const picked = new Map(); // spot -> cycle it was picked in

  // one instanced mesh per kind of find (paint / glossy parts drawn separately)
  const meshes = new Map();
  for (const f of FINDS) {
    const b = findModel(f.id);
    const g = b.build({ castShadow: false, outline: false });
    const parts = [];
    for (const child of g.children) {
      if (!child.isMesh) continue;
      const mat = f.id === 'glowmoss' ? MAT.glow : child.material;
      const im = new THREE.InstancedMesh(child.geometry, mat, spots.length);
      im.count = 0;
      im.castShadow = false;
      im.frustumCulled = false;
      if (child.userData.kind) registerMesh(im, f.id === 'glowmoss' ? 'glow' : child.userData.kind);
      scene.add(im);
      parts.push(im);
    }
    meshes.set(f.id, parts);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), one = new THREE.Vector3(1.6, 1.6, 1.6);
  let lastKey = '';

  function itemAt(s, cycle, night) {
    if (hash(s.i * 7 + 1, cycle) > 0.78) return null; // some spots are empty this time round
    const pool = FINDS.filter((f) => f.zones.includes(s.zone) && (!f.night || night));
    if (!pool.length) return null;
    let total = 0;
    for (const f of pool) total += WEIGHT[f.r];
    let x = hash(s.i * 13 + 5, cycle * 3 + 1) * total;
    for (const f of pool) { x -= WEIGHT[f.r]; if (x <= 0) return f; }
    return pool[pool.length - 1];
  }

  function refresh(force) {
    const cycle = Math.floor(clock.ms() / RESPAWN_MS);
    const night = game.sky.night > 0.55;
    const key = `${cycle}|${night}|${picked.size}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    const counts = new Map();
    for (const parts of meshes.values()) for (const im of parts) im.count = 0;
    for (const s of spots) {
      s.item = picked.get(s.i) === cycle ? null : itemAt(s, cycle, night);
      if (!s.item) continue;
      const n = counts.get(s.item.id) || 0;
      counts.set(s.item.id, n + 1);
      q.setFromEuler(e.set(0, s.rot, 0));
      m4.compose(pv.set(s.x, s.y + 0.005, s.z), q, one);
      for (const im of meshes.get(s.item.id)) { im.setMatrixAt(n, m4); im.count = n + 1; im.instanceMatrix.needsUpdate = true; }
    }
  }

  function pick(s) {
    const f = s.item;
    if (!f) return;
    picked.set(s.i, Math.floor(clock.ms() / RESPAWN_MS));
    const first = !found[f.id];
    found[f.id] = (found[f.id] || 0) + 1;
    save(KEY_FINDS, found);
    refresh(true);
    fx.emit('sparkles', { x: s.x, y: s.y + 0.3, z: s.z }, { n: f.r >= 3 ? 16 : 8 });
    audio.play(f.r >= 3 ? 'catch' : 'pop');
    toast(`${f.icon} ${f.name}${first ? ' — new in your journal!' : ''}`, 2600);
    if (f.r >= 3) { game.doEmote('show', f.name); if (f.r >= 4) fx.emit('confetti', game.headPos(me)); }
    game.renderBook?.();
  }

  // ---------- wildlife ----------
  const critters = [];
  function deerModel(stag) {
    const b = new Builder(), fur = { mat: 'fur' };
    const coat = '#8B5A3C', light = '#E9D8BE';
    b.add(capsule(0.22, 0.55, 6, 14), coat, { pos: [0, 0.82, 0], rot: [Math.PI / 2, 0, 0] }, fur);
    b.add(sphere(0.2, 12, 10), light, { pos: [0, 0.74, 0.0], scale: [0.9, 0.7, 1.6] }, fur);
    b.add(sphere(0.06, 8, 6), '#F4EFE4', { pos: [0, 0.9, -0.48] }, fur);
    for (const [x, z] of [[0.13, 0.32], [-0.13, 0.32], [0.13, -0.3], [-0.13, -0.3]]) {
      b.add(capsule(0.035, 0.6, 3, 6), coat, { pos: [x, 0.38, z] }, fur);
      b.add(sphere(0.035, 6, 4), '#2E2420', { pos: [x, 0.06, z + 0.01], scale: [1, 0.8, 1.2] }, { mat: 'glossy', outline: false });
    }
    const head = new Builder();
    head.add(capsule(0.08, 0.4, 4, 10), coat, { pos: [0, 0.2, 0.06], rot: [0.5, 0, 0] }, fur);
    head.add(sphere(0.12, 12, 10), coat, { pos: [0, 0.45, 0.2], scale: [0.85, 0.85, 1.2] }, fur);
    head.add(sphere(0.07, 10, 8), '#5E3E2A', { pos: [0, 0.4, 0.34], scale: [0.9, 0.8, 1] }, fur);
    head.add(sphere(0.03, 8, 6), '#1C120D', { pos: [0, 0.42, 0.4] }, { mat: 'glossy', outline: false });
    for (const s of [-1, 1]) {
      head.add(sphere(0.025, 8, 6), '#1C120D', { pos: [s * 0.08, 0.5, 0.27] }, { mat: 'glossy', outline: false });
      head.add(sphere(0.07, 8, 6), coat, { pos: [s * 0.12, 0.58, 0.12], scale: [0.5, 1, 0.3], rot: [0, 0, s * 0.7] }, fur);
      if (stag) for (let k = 0; k < 3; k++) head.add(capsule(0.015, 0.22 - k * 0.04, 2, 4), '#D9C7A6', { pos: [s * (0.07 + k * 0.05), 0.68 + k * 0.08, 0.12 - k * 0.04], rot: [-0.3, 0, -s * (0.3 + k * 0.25)] }, { mat: 'paint', outline: false });
    }
    const g = b.build({ castShadow: true });
    const hg = head.build({ castShadow: true });
    const neck = new THREE.Group(); neck.position.set(0, 0.9, 0.36); neck.add(hg);
    g.add(neck);
    return { g, neck };
  }
  function rabbitModel() {
    const b = new Builder(), fur = { mat: 'fur' }, coat = '#9C8A74';
    b.add(sphere(0.12, 12, 10), coat, { pos: [0, 0.12, 0], scale: [0.9, 0.85, 1.25] }, fur);
    b.add(sphere(0.08, 10, 8), coat, { pos: [0, 0.2, 0.13] }, fur);
    for (const s of [-1, 1]) {
      b.add(capsule(0.025, 0.11, 2, 6), coat, { pos: [s * 0.03, 0.32, 0.1], rot: [-0.3, 0, s * 0.15] }, fur);
      b.add(sphere(0.012, 6, 4), '#1C120D', { pos: [s * 0.05, 0.22, 0.19] }, { mat: 'glossy', outline: false });
    }
    b.add(sphere(0.045, 8, 6), '#F4EFE4', { pos: [0, 0.14, -0.15] }, fur);
    return { g: b.build({ castShadow: true }) };
  }
  function owlModel() {
    const b = new Builder(), fur = { mat: 'fur' };
    b.add(sphere(0.16, 12, 10), '#8C6A4A', { pos: [0, 0.18, 0], scale: [1, 1.25, 0.9] }, fur);
    b.add(sphere(0.12, 10, 8), '#E9D8BE', { pos: [0, 0.14, 0.06], scale: [1, 1.2, 0.6] }, fur);
    for (const s of [-1, 1]) {
      b.add(sphere(0.05, 10, 8), '#F2E6D0', { pos: [s * 0.06, 0.3, 0.11] }, fur);
      b.add(sphere(0.028, 8, 6), '#E8A93A', { pos: [s * 0.06, 0.3, 0.15] }, { mat: 'glossy', outline: false });
      b.add(sphere(0.014, 6, 4), '#120C08', { pos: [s * 0.06, 0.3, 0.17] }, { mat: 'glossy', outline: false });
      b.add(sphere(0.04, 6, 4), '#6E5238', { pos: [s * 0.1, 0.42, 0.0], scale: [0.6, 1.2, 0.6] }, fur);
    }
    b.add(sphere(0.02, 6, 4), '#C99A2E', { pos: [0, 0.26, 0.16] }, { mat: 'glossy', outline: false });
    return { g: b.build({ castShadow: true }) };
  }
  function crabModel() {
    const b = new Builder(), sh = { mat: 'glossy' }, c = '#D2533A';
    b.add(sphere(0.09, 12, 8), c, { pos: [0, 0.06, 0], scale: [1.3, 0.5, 1] }, sh);
    for (const s of [-1, 1]) {
      b.add(sphere(0.035, 8, 6), c, { pos: [s * 0.13, 0.07, 0.08], scale: [1, 0.7, 1.4] }, sh);
      for (let k = 0; k < 3; k++) b.add(capsule(0.008, 0.07, 2, 4), c, { pos: [s * 0.1, 0.035, -0.03 + k * 0.03], rot: [0, 0, s * 1.1] }, sh);
      b.add(sphere(0.012, 6, 4), '#1C120D', { pos: [s * 0.03, 0.11, 0.06] }, { mat: 'glossy', outline: false });
    }
    return { g: b.build({ castShadow: true }) };
  }
  const H = game.world.terrainHeight;
  const addCritter = (kind, model, x, z, home, radius, extra = {}) => {
    model.g.position.set(x, H(x, z), z);
    scene.add(model.g);
    critters.push({ kind, ...model, x, z, yaw: R() * 6.28, home, radius, state: 'idle', t: R() * 3, speed: 0, phase: 0, ...extra });
  };
  addCritter('deer', deerModel(true), W.meadow.x, W.meadow.z, { x: W.meadow.x, z: W.meadow.z }, 7);
  addCritter('deer', deerModel(false), W.meadow.x + 3, W.meadow.z + 2, { x: W.meadow.x, z: W.meadow.z }, 7);
  addCritter('deer', deerModel(false), 30, 22, { x: 30, z: 22 }, 6);
  for (const [x, z] of [[28, -6], [12, 34], [-6, -40], [42, 8], [22, -44]]) addCritter('rabbit', rabbitModel(), x, z, { x, z }, 5);
  for (const [x, z] of [[-22, 9.5], [-23, 15], [-21.5, 19]]) addCritter('crab', crabModel(), x, z, { x, z }, 1.6, { beach: true });
  // an owl on the cabin roof ridge, only around at night
  {
    const cb = W.cabin, c = Math.cos(cb.yaw), s = Math.sin(cb.yaw);
    const o = owlModel();
    o.g.position.set(cb.x + 1.2 * c, H(cb.x, cb.z) + 0.15 + 4.0, cb.z - 1.2 * s);
    scene.add(o.g);
    critters.push({ kind: 'owl', ...o, fixed: true, x: o.g.position.x, z: o.g.position.z, yaw: cb.yaw, state: 'perch', t: 0 });
  }

  function spot(kind) {
    spotted[kind] = (spotted[kind] || 0) + 1;
    save(KEY_CRITTERS, spotted);
    const c = CRITTERS.find((k) => k.id === kind);
    if (spotted[kind] === 1) toast(`${c.icon} You spotted a ${c.name.toLowerCase()}! It's in your journal now.`, 3000);
    game.renderBook?.();
  }
  const seenNow = new Set();

  let duckSeen = false;
  function updateCritters(dt, t) {
    const night = game.sky.night;
    const pond = game.world.L.pond;
    const dp = Math.hypot(me.pos.x - pond.x, me.pos.z - pond.z);
    if (game.mode === 'play' && dp < 7 && !duckSeen) { duckSeen = true; spot('duck'); } else if (dp > 25) duckSeen = false;
    for (const c of critters) {
      const d = Math.hypot(me.pos.x - c.x, me.pos.z - c.z);
      // spotting: once per visit when you come close
      if (game.mode === 'play' && c.g.visible && d < (c.kind === 'owl' ? 14 : 10)) {
        if (!seenNow.has(c)) { seenNow.add(c); spot(c.kind); }
      } else if (d > 30) seenNow.delete(c);
      if (c.kind === 'owl') {
        c.g.visible = night > 0.55;
        c.g.rotation.y = c.yaw + Math.sin(t * 0.6) * 0.9 * (Math.sin(t * 0.23) > 0 ? 1 : 0.2);
        continue;
      }
      c.t -= dt;
      const scared = d < (c.kind === 'deer' ? 5 : c.kind === 'crab' ? 2.2 : 3.5) && game.mode === 'play';
      if (scared && c.state !== 'flee') { c.state = 'flee'; c.t = 1.6; c.yaw = Math.atan2(c.x - me.pos.x, c.z - me.pos.z) + (R() - 0.5) * 0.6; }
      if (c.t <= 0) {
        if (c.state === 'flee' || c.state === 'walk') { c.state = R() < 0.6 ? 'graze' : 'idle'; c.t = 2 + R() * 4; }
        else { c.state = 'walk'; c.t = 1.5 + R() * 2.5; const back = Math.hypot(c.x - c.home.x, c.z - c.home.z) > c.radius; c.yaw = back ? Math.atan2(c.home.x - c.x, c.home.z - c.z) : c.yaw + (R() - 0.5) * 2; }
      }
      const base = c.kind === 'deer' ? 0.9 : c.kind === 'crab' ? 0.5 : 0.7;
      const want = c.state === 'flee' ? base * (c.kind === 'crab' ? 3 : 5) : c.state === 'walk' ? base : 0;
      c.speed += (want - c.speed) * Math.min(1, dt * 4);
      if (c.speed > 0.01) {
        const dirYaw = c.kind === 'crab' ? c.yaw + Math.PI / 2 : c.yaw; // crabs scuttle sideways
        const nx = c.x + Math.sin(dirYaw) * c.speed * dt, nz = c.z + Math.cos(dirYaw) * c.speed * dt;
        const ok = c.beach ? nx < -20.1 && nx > -24.5 && nz > W.cove.z0 + 0.5 && nz < W.cove.z1 - 0.5 : game.world.walkable(nx, nz) && !game.world.isWater(nx, nz) && Math.hypot(nx - c.home.x, nz - c.home.z) < c.radius * 2.2;
        if (ok) { c.x = nx; c.z = nz; } else c.yaw += Math.PI * 0.6;
        c.phase += dt * c.speed * (c.kind === 'rabbit' ? 5 : 6);
      }
      const gy = c.beach ? game.world.groundHeight(c.x, c.z) : H(c.x, c.z);
      const hop = c.kind === 'rabbit' ? Math.abs(Math.sin(c.phase)) * 0.12 * Math.min(1, c.speed) : c.kind === 'deer' && c.state === 'flee' ? Math.abs(Math.sin(c.phase * 0.5)) * 0.25 : 0;
      c.g.position.set(c.x, gy + hop, c.z);
      c.g.rotation.y = c.yaw;
      if (c.neck) c.neck.rotation.x = c.state === 'graze' ? 1.25 + Math.sin(t * 2) * 0.05 : Math.sin(t * 0.7) * 0.1;
    }
  }

  // ---------- the journal (a tab in the book) ----------
  let tab = 'fish';
  const fishBook = game.renderBook;
  const $ = (id) => document.getElementById(id);
  function renderBook() {
    document.querySelectorAll('#book-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'fish') { fishBook?.(); return; }
    const list = tab === 'finds' ? FINDS : CRITTERS;
    const have = tab === 'finds' ? found : spotted;
    const got = list.filter((f) => have[f.id]).length;
    $('book-sum').textContent = tab === 'finds' ? `${got} of ${list.length} found — keep exploring the woods and the beach` : `${got} of ${list.length} animals spotted`;
    $('book-grid').replaceChildren(...list.map((f) => {
      const el = document.createElement('div');
      el.className = 'fish' + (have[f.id] ? '' : ' unknown');
      const ico = document.createElement('div'); ico.className = 'ico'; ico.textContent = f.icon;
      const name = document.createElement('b'); name.textContent = have[f.id] ? f.name : '???';
      const sub = document.createElement('div');
      sub.textContent = have[f.id] ? (tab === 'finds' ? `${f.note} ×${have[f.id]}` : `spotted ${have[f.id]}×`) : (f.night ? 'only after dark' : tab === 'finds' ? ['', 'common', 'uncommon', 'rare', 'very rare'][f.r] : 'out there somewhere');
      if (tab === 'finds' && have[f.id]) { const st = document.createElement('div'); st.className = 'stars'; st.textContent = '★'.repeat(f.r); el.append(ico, name, st, sub); }
      else el.append(ico, name, sub);
      return el;
    }));
  }
  game.renderBook = renderBook;
  document.querySelectorAll('#book-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderBook(); }));

  let glintT = 0;
  refresh(true);
  return {
    interactables(list) {
      if (game.mode !== 'play' || me.busy) return;
      for (const s of spots) {
        if (!s.item) continue;
        if (Math.abs(s.x - me.pos.x) > 1.6 || Math.abs(s.z - me.pos.z) > 1.6) continue;
        list.push({ x: s.x, z: s.z, r: 1.35, priority: 0.25, label: `Pick up the ${s.item.name.toLowerCase()}`, use: () => pick(s) });
      }
    },
    update(dt, t) {
      refresh(false);
      updateCritters(dt, t);
      // a little glint now and then so finds catch your eye
      glintT -= dt;
      if (glintT <= 0 && game.mode === 'play') {
        glintT = 0.6;
        for (const s of spots) {
          if (!s.item || Math.abs(s.x - me.pos.x) > 14 || Math.abs(s.z - me.pos.z) > 14) continue;
          if (Math.random() < (s.item.r >= 3 ? 0.6 : 0.2)) fx.emit('sparkles', { x: s.x, y: s.y + 0.12, z: s.z }, { n: 2, color: s.item.r >= 3 ? '#FFE08A' : '#FFF3DC' });
        }
      }
    },
    spots, critters, FINDS,
  };
}
