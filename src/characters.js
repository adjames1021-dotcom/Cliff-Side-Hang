// Chibi animals, accessories, props and their little animations.
import * as THREE from 'three';
import { C, Builder, sphere, capsule, torus, lathe, roundCyl, rbox, blobShadow } from './toon.js';

export const ANIMALS = ['cat', 'bunny', 'bear', 'puppy', 'fox'];
export const ANIMAL_EMOJI = { cat: '🐱', bunny: '🐰', bear: '🐻', puppy: '🐶', fox: '🦊' };
export const FUR = ['#FFF3DC', '#FFE08A', '#F4A646', '#E8893A', '#C8875A', '#8E5B3E', '#F7B9C4', '#D9C2EE'];
export const OUTFIT = ['#F4A646', '#E8893A', '#F7B9C4', '#E98A9B', '#AFCB9C', '#AFD6EC', '#FFE08A', '#F8E8C8'];
export const ACCESSORIES = ['beret', 'bowtie', 'scarf', 'crown', 'glasses', 'backpack'];
export const ACC_LABEL = { beret: 'Beret', bowtie: 'Bow tie', scarf: 'Scarf', crown: 'Flower crown', glasses: 'Glasses', backpack: 'Backpack' };
export const DEFAULT_FUR = { cat: '#F4A646', bunny: '#FFF3DC', bear: '#C8875A', puppy: '#FFE08A', fox: '#E8893A' };
export const EMOTES = [
  { id: 'wave', label: 'Wave', icon: '👋' }, { id: 'dance', label: 'Dance', icon: '💃' },
  { id: 'clap', label: 'Clap', icon: '👏' }, { id: 'laugh', label: 'Laugh', icon: '😆' },
  { id: 'sitground', label: 'Sit', icon: '🪑' }, { id: 'heart', label: 'Heart', icon: '💖' },
  { id: 'sleep', label: 'Sleep', icon: '💤' }, { id: 'cheer', label: 'Cheer', icon: '🎉' },
];
const EMOTE_LEN = { wave: 2.2, dance: 4, clap: 2, laugh: 2, heart: 2.4, cheer: 2.4, catch: 2.2, show: 2.2 };

export function randomAvatar() {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return { animal, fur: DEFAULT_FUR[animal], outfit: OUTFIT[Math.floor(Math.random() * OUTFIT.length)], acc: [] };
}

export function cleanAvatar(a = {}) {
  const animal = ANIMALS.includes(a.animal) ? a.animal : 'bear';
  const hex = (v, list, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d || list[0]);
  let acc = Array.isArray(a.acc) ? [...new Set(a.acc.filter((x) => ACCESSORIES.includes(x)))].slice(0, 2) : [];
  if (acc.includes('beret') && acc.includes('crown')) acc = acc.filter((x) => x !== 'crown');
  return { animal, fur: hex(a.fur, FUR, DEFAULT_FUR[animal]), outfit: hex(a.outfit, OUTFIT), acc };
}

const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
const darker = (a, k = 0.18) => '#' + new THREE.Color(a).multiplyScalar(1 - k).getHexString();

// Standing proportions (metres, root at the feet).
const HIP_Y = 0.2;
const HEAD_C = 0.29; // head centre above the neck pivot
export const SIT_DROP = 0.115; // root height below a seat top

// ---------- props ----------

export const PROP_INFO = {
  mug: { label: 'cocoa', drink: true }, shake: { label: 'milkshake', drink: true },
  sandwich: { label: 'sandwich', food: true }, apple: { label: 'apple', food: true }, cookie: { label: 'cookie', food: true },
  'mallow-raw': { label: 'marshmallow', food: true }, 'mallow-toasty': { label: 'toasty marshmallow', food: true },
  'mallow-gold': { label: 'golden marshmallow', food: true }, 'mallow-burnt': { label: 'burnt marshmallow', food: true },
  rod: { label: 'fishing rod' }, stick: { label: 'toasting stick' },
};
export const MALLOW_COL = { raw: '#FFF8EE', toasty: '#F6D8A0', gold: '#E9A64A', burnt: '#6B4330' };

export function makeProp(name, mallowColor) {
  const b = new Builder();
  const tip = new THREE.Vector3();
  if (name === 'mug') {
    b.add(roundCyl(0.075, 0.15, 0.025, 16), C.cream2, { pos: [0, -0.07, 0] });
    b.add(roundCyl(0.078, 0.04, 0.01, 16), C.pumpkin, { pos: [0, -0.02, 0] }, { outline: false });
    b.add(torus(0.045, 0.016, 6, 12, Math.PI), C.cream2, { pos: [0.075, 0.005, 0], rot: [0, 0, -Math.PI / 2] });
    b.add(roundCyl(0.062, 0.02, 0.008, 14), C.cocoa, { pos: [0, 0.065, 0] }, { outline: false });
    b.add(sphere(0.03, 8, 6), C.white, { pos: [0.02, 0.09, 0.01] }, { outline: false });
  } else if (name === 'shake') {
    b.add(lathe([[0, -0.1], [0.04, -0.1], [0.045, -0.08], [0.075, 0.1], [0, 0.1]], 16), C.pink, {});
    b.add(sphere(0.07, 12, 8), C.cream2, { pos: [0, 0.11, 0], scale: [1, 0.7, 1] });
    b.add(sphere(0.025, 8, 6), C.berry, { pos: [0.01, 0.17, 0] });
    b.add(capsule(0.012, 0.16, 2, 6), C.blue, { pos: [-0.03, 0.17, 0], rot: [0, 0, 0.3] }, { outline: false });
  } else if (name === 'sandwich') {
    b.add(rbox(0.16, 0.04, 0.12, 0.018), C.butter, { pos: [0, -0.03, 0] });
    b.add(rbox(0.17, 0.02, 0.13, 0.008), C.leaf, { pos: [0, 0, 0] });
    b.add(rbox(0.15, 0.015, 0.11, 0.006), C.berry, { pos: [0, 0.015, 0] }, { outline: false });
    b.add(rbox(0.16, 0.04, 0.12, 0.018), C.butter, { pos: [0, 0.04, 0] });
  } else if (name === 'apple') {
    b.add(sphere(0.07, 14, 10), C.berry, { scale: [1, 0.92, 1] });
    b.add(capsule(0.008, 0.03, 2, 5), C.cocoa, { pos: [0, 0.075, 0] }, { outline: false });
    b.add(sphere(0.022, 6, 4), C.leaf, { pos: [0.025, 0.08, 0], scale: [1.4, 0.4, 0.8] }, { outline: false });
  } else if (name === 'cookie') {
    b.add(roundCyl(0.075, 0.025, 0.012, 16), C.honeyLight, { rot: [Math.PI / 2, 0, 0] });
    for (const [x, y] of [[0.02, 0.02], [-0.03, -0.01], [0.01, -0.035], [-0.02, 0.035]]) b.add(sphere(0.012, 6, 4), C.cocoa, { pos: [x, y, 0.027] }, { outline: false });
  } else if (name === 'stick' || name.startsWith('mallow')) {
    b.add(capsule(0.012, 0.62, 2, 6), C.honeyDark, { pos: [0, 0, 0.27], rot: [Math.PI / 2, 0, 0] });
    if (name !== 'stick') b.add(capsule(0.042, 0.05, 4, 10), mallowColor || MALLOW_COL[name.split('-')[1]] || MALLOW_COL.raw, { pos: [0, 0, 0.56], rot: [Math.PI / 2, 0, 0] });
    tip.set(0, 0, 0.56);
  } else if (name === 'rod') {
    b.add(capsule(0.022, 0.18, 2, 8), C.cocoa, { pos: [0, 0, 0] });
    b.add(torus(0.035, 0.012, 6, 12), C.butter, { pos: [0.03, 0.02, 0], rot: [0, Math.PI / 2, 0] }, { outline: false });
    b.add(capsule(0.012, 1.15, 2, 6), C.honey, { pos: [0, 0.62, 0] });
    tip.set(0, 1.2, 0);
  } else if (name.startsWith('fish')) {
    const col = name.split(':')[1] || C.apricot;
    b.add(sphere(0.1, 12, 8), col, { scale: [0.6, 1, 1.6] });
    b.add(sphere(0.06, 8, 6), col, { pos: [0, 0, -0.2], scale: [0.3, 1.2, 0.8] });
    b.add(sphere(0.015, 6, 4), C.eye, { pos: [0.05, 0.03, 0.1] }, { outline: false });
  }
  const g = b.build();
  g.userData.tip = tip;
  return g;
}

// ---------- characters ----------

function buildParts(av) {
  const fur = av.fur, outfit = av.outfit;
  const light = av.fur === '#FFF3DC' ? '#FFFAF2' : mix(fur, '#FFF8EC', 0.62);
  const inner = fur === '#F7B9C4' ? '#EE94AA' : C.pink;
  const has = (a) => av.acc.includes(a);
  const c = HEAD_C;

  const torso = new Builder();
  torso.add(sphere(0.255, 20, 14), outfit, { pos: [0, 0.17, 0], scale: [1, 1.02, 0.92] });
  torso.add(sphere(0.15, 14, 10), mix(outfit, '#FFFFFF', 0.25), { pos: [0, 0.13, 0.13], scale: [1, 0.9, 0.55] }, { outline: false });
  if (has('scarf')) {
    torso.add(torus(0.165, 0.065, 10, 24), C.pumpkin, { pos: [0, 0.4, 0.005], rot: [Math.PI / 2 + 0.08, 0, 0] });
    torso.add(rbox(0.11, 0.24, 0.06, 0.03), C.pumpkin, { pos: [0.1, 0.27, 0.19], rot: [-0.25, 0, 0.15] });
    torso.add(rbox(0.115, 0.03, 0.065, 0.012), C.butter, { pos: [0.093, 0.2, 0.208], rot: [-0.25, 0, 0.15] }, { outline: false });
  }
  if (has('bowtie')) {
    for (const s of [-1, 1]) torso.add(sphere(0.065, 10, 8), C.rose, { pos: [s * 0.062, 0.39, 0.15], scale: [1.1, 0.75, 0.5], rot: [0, 0, s * 0.2] });
    torso.add(sphere(0.032, 8, 6), darker(C.rose), { pos: [0, 0.39, 0.175] });
  }
  if (has('backpack')) {
    torso.add(rbox(0.32, 0.34, 0.17, 0.07), C.sage, { pos: [0, 0.2, -0.27] });
    torso.add(rbox(0.33, 0.12, 0.19, 0.05), darker(C.sage, 0.1), { pos: [0, 0.33, -0.27] });
    torso.add(rbox(0.14, 0.1, 0.05, 0.03), C.butter, { pos: [0, 0.17, -0.37] });
  }

  const head = new Builder();
  head.add(sphere(0.33, 24, 18), fur, { pos: [0, c, 0], scale: [1.12, 0.96, 1] });
  head.add(sphere(0.12, 14, 10), light, { pos: [0, c - 0.085, 0.27], scale: [1.25, 0.85, 0.75] });
  head.add(sphere(0.045, 10, 8), C.ink, { pos: [0, c - 0.04, 0.352], scale: [1.25, 0.85, 0.8] }, { outline: false });
  for (const s of [-1, 1]) {
    head.add(sphere(0.06, 10, 8), C.pink, { pos: [s * 0.205, c - 0.07, 0.252], scale: [1.3, 0.7, 0.35], rot: [0, s * 0.6, 0] }, { outline: false });
    head.add(torus(0.024, 0.008, 4, 8, Math.PI), C.ink, { pos: [s * 0.024, c - 0.105, 0.343], rot: [0, 0, Math.PI] }, { outline: false });
  }
  const ear = (pts) => lathe(pts, 12);
  switch (av.animal) {
    case 'bear':
      for (const s of [-1, 1]) {
        head.add(sphere(0.11, 12, 10), fur, { pos: [s * 0.24, c + 0.25, -0.03], scale: [1, 1, 0.62] });
        head.add(sphere(0.06, 10, 8), inner, { pos: [s * 0.24, c + 0.245, 0.02], scale: [1, 1, 0.4] }, { outline: false });
      }
      break;
    case 'cat':
      for (const s of [-1, 1]) {
        head.add(ear([[0.1, 0], [0.085, 0.07], [0.05, 0.14], [0.018, 0.18], [0, 0.185]]), fur, { pos: [s * 0.19, c + 0.2, -0.02], rot: [0, 0, -s * 0.32], scale: [1, 1, 0.55] });
        head.add(ear([[0.06, 0], [0.05, 0.05], [0.025, 0.1], [0, 0.11]]), inner, { pos: [s * 0.19, c + 0.21, 0.02], rot: [0, 0, -s * 0.32], scale: [1, 1, 0.4] }, { outline: false });
      }
      break;
    case 'bunny':
      for (const s of [-1, 1]) {
        head.add(capsule(0.07, 0.26, 5, 12), fur, { pos: [s * 0.11, c + 0.42, -0.03], rot: [0, 0, -s * 0.13], scale: [1, 1, 0.6] });
        head.add(capsule(0.038, 0.2, 4, 10), inner, { pos: [s * 0.113, c + 0.42, 0.0], rot: [0, 0, -s * 0.13], scale: [1, 1, 0.4] }, { outline: false });
      }
      break;
    case 'puppy':
      for (const s of [-1, 1]) head.add(sphere(0.13, 12, 10), darker(fur, 0.14), { pos: [s * 0.33, c + 0.02, -0.03], rot: [0, 0, s * 0.32], scale: [0.45, 1, 0.8] });
      break;
    case 'fox':
      for (const s of [-1, 1]) {
        head.add(ear([[0.13, 0], [0.11, 0.09], [0.065, 0.18], [0.022, 0.25], [0, 0.26]]), fur, { pos: [s * 0.2, c + 0.2, -0.02], rot: [0, 0, -s * 0.3], scale: [1, 1, 0.55] });
        head.add(ear([[0.07, 0], [0.06, 0.06], [0.03, 0.13], [0, 0.15]]), C.cream2, { pos: [s * 0.2, c + 0.21, 0.025], rot: [0, 0, -s * 0.3], scale: [1, 1, 0.4] }, { outline: false });
        head.add(sphere(0.038, 8, 6), C.cocoa, { pos: [s * 0.27, c + 0.43, -0.02], scale: [1, 1, 0.6] }, { outline: false });
        head.add(sphere(0.12, 12, 10), C.cream2, { pos: [s * 0.15, c - 0.11, 0.16], scale: [1, 0.75, 0.9] }, { outline: false });
      }
      break;
  }
  if (has('beret')) {
    const tall = av.animal === 'bunny' || av.animal === 'cat' || av.animal === 'fox';
    head.add(sphere(tall ? 0.2 : 0.25, 18, 10), C.rose, { pos: [0.05, c + (tall ? 0.24 : 0.27), tall ? 0.09 : -0.01], rot: [tall ? 0.35 : 0, 0, -0.22], scale: [1, 0.32, 1] });
    head.add(sphere(0.03, 8, 6), darker(C.rose), { pos: [tall ? 0.03 : 0.0, c + (tall ? 0.31 : 0.355), tall ? 0.12 : -0.01] });
  }
  if (has('crown')) {
    head.add(torus(0.27, 0.028, 6, 30), C.leaf, { pos: [0, c + 0.17, -0.005], rot: [Math.PI / 2 + 0.12, 0, 0], scale: [1.12, 1, 1] });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.27;
      head.add(sphere(0.048, 10, 8), [C.pink, C.butter, C.cream2][i % 3], { pos: [x, c + 0.17 - z * 0.12, z], scale: [1, 0.75, 1] });
      head.add(sphere(0.018, 6, 4), C.apricot, { pos: [x, c + 0.205 - z * 0.12, z] }, { outline: false });
    }
  }
  if (has('glasses')) {
    for (const s of [-1, 1]) head.add(torus(0.072, 0.017, 6, 20), C.cocoa, { pos: [s * 0.13, c + 0.035, 0.338], rot: [-0.08, s * 0.12, 0] });
    head.add(capsule(0.012, 0.05, 2, 6), C.cocoa, { pos: [0, c + 0.05, 0.35], rot: [0, 0, Math.PI / 2] }, { outline: false });
  }

  const eyes = new Builder();
  for (const s of [-1, 1]) {
    eyes.add(sphere(0.045, 12, 10), C.eye, { pos: [s * 0.13, 0, 0], scale: [1, 1.25, 0.6] }, { outline: false });
    eyes.add(sphere(0.015, 6, 5), '#FFFFFF', { pos: [s * 0.13 + 0.015, 0.022, 0.024] }, { outline: false });
  }

  const arm = () => {
    const a = new Builder();
    a.add(capsule(0.07, 0.1, 4, 10), outfit, { pos: [0, -0.08, 0] });
    a.add(sphere(0.075, 12, 10), fur, { pos: [0, -0.2, 0.01] });
    return a;
  };
  const leg = () => {
    const l = new Builder();
    l.add(capsule(0.075, 0.07, 4, 10), fur, { pos: [0, -0.09, 0] });
    l.add(sphere(0.085, 12, 10), light, { pos: [0, -0.149, 0.03], scale: [1, 0.6, 1.3] });
    return l;
  };

  const tail = new Builder();
  switch (av.animal) {
    case 'bear': tail.add(sphere(0.075, 10, 8), fur, { pos: [0, 0, -0.03] }); break;
    case 'bunny': tail.add(sphere(0.1, 12, 10), light, { pos: [0, 0, -0.04] }); break;
    case 'cat':
      tail.add(capsule(0.045, 0.2, 4, 8), fur, { pos: [0, 0.08, -0.08], rot: [-0.7, 0, 0] });
      tail.add(capsule(0.045, 0.12, 4, 8), fur, { pos: [0, 0.22, -0.13], rot: [0.4, 0, 0] });
      break;
    case 'puppy': tail.add(capsule(0.045, 0.13, 4, 8), fur, { pos: [0, 0.07, -0.05], rot: [-0.8, 0, 0] }); break;
    case 'fox':
      tail.add(sphere(0.13, 14, 10), fur, { pos: [0, 0.1, -0.14], rot: [-0.7, 0, 0], scale: [0.8, 0.8, 1.7] });
      tail.add(sphere(0.085, 12, 10), C.cream2, { pos: [0, 0.27, -0.27], rot: [-0.7, 0, 0] });
      break;
  }
  return { torso, head, eyes, arm, leg, tail };
}

export class Character {
  constructor(avatar) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.root.add(this.tilt);
    this.shadow = blobShadow(0.95);
    this.t = Math.random() * 10;
    this.phase = 0;
    this.walk = 0;
    this.blinkT = 2;
    this.squash = 0;
    this.emote = null;
    this.emoteT = 0;
    this.hit = 0;
    this.hitSide = 0;
    this.prop = null;
    this.propName = null;
    this.j = {}; // current joint values (smoothed)
    this.setAvatar(avatar);
  }

  setAvatar(avatar) {
    this.avatar = cleanAvatar(avatar);
    if (this.body) {
      this.tilt.remove(this.body, this.legL, this.legR);
      this.body.traverse((o) => o.geometry?.dispose());
    }
    const p = buildParts(this.avatar);
    const body = (this.body = new THREE.Group());
    body.position.y = HIP_Y;
    body.add(p.torso.build());
    const neck = (this.neck = new THREE.Group());
    neck.position.y = 0.43;
    neck.add(p.head.build());
    const eyes = (this.eyes = p.eyes.build({ outline: false }));
    eyes.position.set(0, HEAD_C + 0.03, 0.302);
    neck.add(eyes);
    body.add(neck);
    this.armL = new THREE.Group(); this.armL.position.set(0.24, 0.33, 0); this.armL.add(p.arm().build());
    this.armR = new THREE.Group(); this.armR.position.set(-0.24, 0.33, 0); this.armR.add(p.arm().build());
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.22, 0.04); this.armR.add(this.hand);
    body.add(this.armL, this.armR);
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.08, -0.21); this.tail.add(p.tail.build());
    body.add(this.tail);
    this.legL = new THREE.Group(); this.legL.position.set(0.11, HIP_Y, 0); this.legL.add(p.leg().build());
    this.legR = new THREE.Group(); this.legR.position.set(-0.11, HIP_Y, 0); this.legR.add(p.leg().build());
    this.tilt.add(body, this.legL, this.legR);
    if (this.propName) { const n = this.propName; this.propName = null; this.setProp(n); }
    this.labelY = this.avatar.animal === 'bunny' ? 1.72 : this.avatar.animal === 'fox' ? 1.58 : 1.45;
  }

  setProp(name, mallowColor) {
    if (name === this.propName && !mallowColor) return;
    if (this.prop) { this.hand.remove(this.prop); this.prop.traverse((o) => o.geometry?.dispose()); this.prop = null; }
    this.propName = name || null;
    if (!name) return;
    this.prop = makeProp(name, mallowColor);
    this.hand.add(this.prop);
  }

  playEmote(id) {
    this.emote = id;
    this.emoteT = 0;
  }

  noteHit() { this.hit = 1; this.hitSide ^= 1; }

  // s: { speed, grounded, vy, pose, groundY }
  update(dt, s) {
    this.t += dt;
    const t = this.t;
    const pose = s.pose || 'idle';
    const sitting = ['sit', 'swing', 'seesaw', 'piano', 'drums', 'stool'].includes(pose);
    const ground = pose === 'sitground' || pose === 'sleep';
    const speed = sitting || ground ? 0 : s.speed || 0;
    this.walk += ((speed > 0.15 ? Math.min(1.3, speed / 3.2) : 0) - this.walk) * Math.min(1, dt * 10);
    this.phase += dt * speed * 3.7;
    const w = this.walk, ph = this.phase;

    if (this.emote) {
      this.emoteT += dt;
      const len = EMOTE_LEN[this.emote];
      if (len && this.emoteT > len) this.emote = null;
      if (speed > 0.5 && this.emoteT > 0.2) this.emote = null;
    }
    const e = this.emote, et = this.emoteT;

    // targets
    const T = {
      legL: 0, legR: 0, armLx: 0, armLz: 0.22, armRx: 0, armRz: -0.22,
      bodyY: HIP_Y, bodyRx: 0, bodyRy: 0, bodyRz: 0, headX: 0, headY: 0, headZ: 0, tail: 0, eyes: 1,
    };
    T.legL = Math.sin(ph) * 0.75 * w;
    T.legR = -Math.sin(ph) * 0.75 * w;
    T.armLx = -Math.sin(ph) * 0.7 * w;
    T.armRx = Math.sin(ph) * 0.7 * w;
    T.bodyY = HIP_Y + Math.abs(Math.sin(ph)) * 0.07 * w + Math.sin(t * 2.2) * 0.004;
    T.bodyRz = Math.sin(ph) * 0.12 * w;
    T.bodyRx = 0.07 * w;
    T.headZ = -Math.sin(ph) * 0.06 * w + Math.sin(t * 0.7) * 0.03 * (1 - w);
    T.headX = Math.sin(t * 0.9) * 0.02;
    T.tail = Math.sin(t * (this.avatar.animal === 'puppy' ? 9 : 2.5)) * (this.avatar.animal === 'puppy' ? 0.45 : 0.2);

    if (!s.grounded && !sitting) {
      T.legL = T.legR = -0.45;
      T.armLz = 1.3; T.armRz = -1.3;
    }
    if (sitting) {
      T.legL = T.legR = pose === 'stool' ? -1.15 : -1.42;
      T.bodyY = HIP_Y; T.bodyRz = 0; T.bodyRx = 0;
      if (pose === 'swing') { T.armLx = T.armRx = -2.75; T.armLz = 0.12; T.armRz = -0.12; }
      if (pose === 'seesaw') { T.armLx = T.armRx = -1.45; T.armLz = 0.2; T.armRz = -0.2; }
    }
    if (ground) {
      T.legL = T.legR = -1.5;
      T.bodyY = HIP_Y; T.bodyRz = 0;
      T.armLx = T.armRx = -0.5; T.armLz = 0.5; T.armRz = -0.5;
      if (pose === 'sleep') { T.headX = 0.32; T.headZ = 0.22; T.bodyRx = 0.12; T.eyes = 0.12; T.armLz = 0.3; T.armRz = -0.3; }
    }
    if (pose === 'fish') { T.armRx = -0.95; T.armRz = -0.05; T.armLx = -0.8; T.armLz = 0.55; }
    if (pose === 'toast') { T.armRx = -1.25; T.armRz = -0.05; T.armLx = -0.4; }
    if (pose === 'play' || pose === 'piano' || pose === 'drums') {
      const h = this.hit;
      T.armLx = -1.15 - (this.hitSide ? h * 0.5 : 0); T.armRx = -1.15 - (this.hitSide ? 0 : h * 0.5);
      T.armLz = 0.18; T.armRz = -0.18;
      T.bodyY += h * 0.02;
    }
    if (this.propName && !['fish', 'toast'].includes(pose) && !e) {
      const sip = this.sipT > 0 ? Math.sin(Math.min(1, this.sipT) * Math.PI) : 0;
      T.armRx = -0.95 - sip * 1.0; T.armRz = -0.15 + sip * 0.35;
      T.headX -= sip * 0.15;
    }
    if (this.sipT > 0) this.sipT -= dt;

    // emotes layered on top
    if (e === 'wave') { T.armRz = -2.55 + Math.sin(et * 12) * 0.35; T.armRx = -0.2; T.headZ = 0.12; }
    if (e === 'dance') {
      T.bodyRy = Math.sin(et * 6) * 0.45; T.bodyY = HIP_Y + Math.abs(Math.sin(et * 6)) * 0.08;
      T.armLz = 2.3 + Math.sin(et * 6) * 0.5; T.armRz = -2.3 + Math.sin(et * 6) * 0.5;
      T.legL = Math.max(0, Math.sin(et * 6)) * -0.5; T.legR = Math.max(0, -Math.sin(et * 6)) * -0.5;
      T.headZ = Math.sin(et * 6) * 0.15;
    }
    if (e === 'clap') { T.armLx = T.armRx = -1.3; const k = 0.5 + 0.5 * Math.sin(et * 16); T.armLz = -0.05 + k * 0.45; T.armRz = 0.05 - k * 0.45; }
    if (e === 'laugh') { T.headX = -0.3; T.bodyRz = Math.sin(et * 32) * 0.06; T.bodyY += Math.abs(Math.sin(et * 16)) * 0.025; T.armLx = T.armRx = -0.5; T.armLz = 0.75; T.armRz = -0.75; T.eyes = 0.15; }
    if (e === 'heart') { T.armLx = T.armRx = -1.6; T.armLz = -0.55; T.armRz = 0.55; T.headZ = 0.2; }
    if (e === 'cheer') { T.armLz = 2.85; T.armRz = -2.85; T.bodyY = HIP_Y + Math.abs(Math.sin(et * 9)) * 0.14; T.legL = T.legR = -Math.abs(Math.sin(et * 9)) * 0.3; T.eyes = 0.15; }
    if (e === 'catch' || e === 'show') { T.armRx = -2.6; T.armRz = -0.2; T.bodyRx = -0.1; T.headX = -0.15; T.eyes = 0.15; T.tail = Math.sin(t * 12) * 0.5; }
    if (e === 'heart' || e === 'cheer' || e === 'dance') T.tail = Math.sin(t * 12) * 0.5;

    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    if (this.blinkT < 0.13) T.eyes = Math.min(T.eyes, 0.12);

    // squash and stretch
    if (s.landed) this.squash = 1;
    this.squash = Math.max(0, this.squash - dt * 5);
    const stretch = !s.grounded && !sitting ? Math.min(0.08, Math.max(-0.05, (s.vy || 0) * 0.02)) : 0;
    const sq = this.squash * 0.14;

    const k = 1 - Math.exp(-dt * 14), j = this.j;
    for (const key in T) j[key] = j[key] === undefined ? T[key] : j[key] + (T[key] - j[key]) * (key === 'eyes' ? 1 : k);
    this.hit = Math.max(0, this.hit - dt * 6);

    this.legL.rotation.x = j.legL; this.legR.rotation.x = j.legR;
    this.armL.rotation.set(j.armLx, 0, j.armLz);
    this.armR.rotation.set(j.armRx, 0, j.armRz);
    this.body.position.y = j.bodyY;
    this.body.rotation.set(j.bodyRx, j.bodyRy, j.bodyRz);
    this.body.scale.set(1 + sq, 1 - sq + stretch, 1 + sq);
    this.neck.rotation.set(j.headX, j.headY, j.headZ);
    this.tail.rotation.set(0, j.tail, j.tail * 0.3);
    this.eyes.scale.y = j.eyes;
    if (this.prop) {
      // keep held things upright-ish whatever the arm does
      this.prop.rotation.set(-j.armRx - (pose === 'fish' ? 0.6 : pose === 'toast' ? 1.25 : 0), 0, -j.armRz);
    }

    // blob shadow stays on the ground
    if (s.groundY !== undefined) {
      this.shadow.position.set(this.root.position.x, s.groundY + 0.012, this.root.position.z);
      const lift = Math.max(0, this.root.position.y - s.groundY);
      this.shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.35));
      this.shadow.material.opacity = Math.max(0.25, 1 - lift * 0.4);
    }
  }

  sip() { this.sipT = 0.9; }

  handWorld(out = new THREE.Vector3()) { return this.hand.getWorldPosition(out); }
  propTipWorld(out = new THREE.Vector3()) {
    if (!this.prop) return this.handWorld(out);
    return this.prop.localToWorld(out.copy(this.prop.userData.tip));
  }

  addTo(scene) { scene.add(this.root, this.shadow); }
  removeFrom(scene) {
    scene.remove(this.root, this.shadow);
    this.root.traverse((o) => o.geometry?.dispose());
  }
}
