// Chibi animals, accessories, props and their little animations.
import * as THREE from 'three';
import { C, Builder, sphere, capsule, torus, lathe, roundCyl, rbox, blobShadow, outlineMaterial } from './toon.js';
import { STYLE } from './materials.js';

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
    b.add(lathe([[0, -0.145], [0.068, -0.145], [0.074, -0.13], [0.078, 0.0], [0.08, 0.005], [0.074, 0.005], [0.07, -0.125], [0, -0.125]], 24), C.cream2, { pos: [0, 0.075, 0] }, { mat: 'ceramic' });
    b.add(roundCyl(0.0795, 0.035, 0.008, 24), C.pumpkin, { pos: [0, -0.02, 0] }, { outline: false, mat: 'ceramic' });
    b.add(torus(0.042, 0.013, 8, 16, Math.PI), C.cream2, { pos: [0.077, 0.0, 0], rot: [0, 0, -Math.PI / 2] }, { mat: 'ceramic' });
    b.add(new THREE.CircleGeometry(0.069, 24).rotateX(-Math.PI / 2), '#5B3524', { pos: [0, 0.062, 0] }, { outline: false, mat: 'glossy' });
    b.add(sphere(0.026, 10, 8), '#FFF8F0', { pos: [0.015, 0.072, 0.01], scale: [1, 0.6, 1] }, { outline: false, mat: 'paint' });
    b.add(sphere(0.02, 10, 8), '#FFF8F0', { pos: [-0.02, 0.07, -0.012], scale: [1, 0.6, 1] }, { outline: false, mat: 'paint' });
  } else if (name === 'shake') {
    b.add(lathe([[0, -0.1], [0.04, -0.1], [0.045, -0.08], [0.075, 0.1], [0.07, 0.1], [0, 0.098]], 24), '#F7B9C4', {}, { mat: 'glossy' });
    b.add(sphere(0.072, 16, 10), '#FFF6EA', { pos: [0, 0.11, 0], scale: [1, 0.62, 1] }, { mat: 'paint' });
    b.add(sphere(0.05, 14, 10), '#FFF6EA', { pos: [0.005, 0.15, 0], scale: [1, 0.7, 1] }, { mat: 'paint' });
    b.add(sphere(0.022, 12, 8), '#C8323E', { pos: [0.01, 0.19, 0] }, { mat: 'glossy' });
    b.add(capsule(0.009, 0.17, 2, 8), '#AFD6EC', { pos: [-0.03, 0.18, 0], rot: [0, 0, 0.3] }, { outline: false, mat: 'glossy' });
  } else if (name === 'sandwich') {
    b.add(rbox(0.16, 0.035, 0.12, 0.016), '#E9C27E', { pos: [0, -0.03, 0] }, { mat: 'paint' });
    b.add(rbox(0.175, 0.012, 0.135, 0.005), '#7DAF4A', { pos: [0, -0.008, 0], rot: [0, 0.08, 0] }, { mat: 'foliage' });
    b.add(rbox(0.15, 0.014, 0.11, 0.005), '#D9544D', { pos: [0, 0.005, 0] }, { outline: false, mat: 'glossy' });
    b.add(rbox(0.155, 0.01, 0.115, 0.004), '#F2C14E', { pos: [0, 0.016, 0.003], rot: [0, -0.1, 0] }, { outline: false, mat: 'paint' });
    b.add(rbox(0.16, 0.035, 0.12, 0.016), '#E9C27E', { pos: [0, 0.04, 0] }, { mat: 'paint' });
  } else if (name === 'apple') {
    b.add(lathe(Array.from({ length: 13 }, (_, i) => { const a = (i / 12) * Math.PI; const r = Math.sin(a) * 0.072 * (1 + 0.12 * Math.cos(a)); return [Math.max(0.004, r), -Math.cos(a) * 0.066 + (i === 0 || i === 12 ? 0.012 : 0)]; }), 24), '#C8323E', {}, { mat: 'glossy' });
    b.add(capsule(0.006, 0.03, 2, 6), '#5B3A26', { pos: [0, 0.07, 0], rot: [0, 0, 0.2] }, { outline: false, mat: 'wood' });
    b.add(sphere(0.024, 8, 6), '#5E9B3E', { pos: [0.025, 0.078, 0], scale: [1.5, 0.3, 0.8], rot: [0, 0, -0.3] }, { outline: false, mat: 'foliage' });
  } else if (name === 'cookie') {
    b.add(roundCyl(0.075, 0.024, 0.011, 24), '#D9A35F', { rot: [Math.PI / 2, 0, 0] }, { mat: 'paint' });
    for (const [x, y] of [[0.02, 0.02], [-0.03, -0.01], [0.01, -0.035], [-0.02, 0.035], [0.04, -0.01]]) b.add(sphere(0.011, 8, 6), '#4A2C1D', { pos: [x, y, 0.026], scale: [1, 1, 0.6] }, { outline: false, mat: 'glossy' });
  } else if (name === 'stick' || name.startsWith('mallow')) {
    b.add(capsule(0.011, 0.62, 2, 8), '#8E5B3E', { pos: [0, 0, 0.27], rot: [Math.PI / 2, 0, 0] }, { mat: 'wood' });
    if (name !== 'stick') b.add(capsule(0.04, 0.05, 6, 14), mallowColor || MALLOW_COL[name.split('-')[1]] || MALLOW_COL.raw, { pos: [0, 0, 0.56], rot: [Math.PI / 2, 0, 0] }, { mat: 'fabric' });
    tip.set(0, 0, 0.56);
  } else if (name === 'rod') {
    b.add(capsule(0.02, 0.16, 2, 10), '#4A2C1D', { pos: [0, 0, 0] }, { mat: 'fabric' });
    b.add(torus(0.032, 0.01, 8, 16), '#C9A24A', { pos: [0.03, 0.02, 0], rot: [0, Math.PI / 2, 0] }, { outline: false, mat: 'metal' });
    b.add(roundCyl(0.016, 0.02, 0.004, 10), '#C9A24A', { pos: [0, 0.1, 0] }, { outline: false, mat: 'metal' });
    b.add(capsule(0.01, 1.15, 2, 8), '#D9A35F', { pos: [0, 0.68, 0] }, { mat: 'wood' });
    for (const y of [0.45, 0.8, 1.1]) b.add(torus(0.012, 0.003, 4, 8), '#C9A24A', { pos: [0.012, y, 0], rot: [0, Math.PI / 2, 0] }, { outline: false, mat: 'metal' });
    tip.set(0, 1.25, 0);
  } else if (name.startsWith('fish')) {
    const col = name.split(':')[1] || C.apricot;
    b.add(sphere(0.1, 18, 12), col, { scale: [0.55, 1, 1.6] }, { mat: 'glossy' });
    b.add(sphere(0.06, 12, 8), col, { pos: [0, 0, -0.2], scale: [0.25, 1.2, 0.8] }, { mat: 'glossy' });
    b.add(sphere(0.04, 10, 6), col, { pos: [0, 0.08, -0.02], scale: [0.2, 1, 1.4] }, { mat: 'glossy' });
    for (const s of [-1, 1]) {
      b.add(sphere(0.016, 10, 8), '#1A120C', { pos: [s * 0.05, 0.03, 0.1] }, { outline: false, mat: 'glossy' });
      b.add(sphere(0.005, 6, 4), '#FFFFFF', { pos: [s * 0.062, 0.036, 0.106] }, { outline: false, mat: 'shine' });
    }
  }
  const g = b.build({ castShadow: true });
  g.userData.tip = tip;
  return g;
}

// ---------- fur shells ----------
// Fluffy fur: each furry part is drawn a few more times, each copy pushed a little further out
// along its normals and with more and more of it cut away, leaving soft tufts at the edges.
const SHELLS = 7;
const shellMats = new Map();
function shellMaterial(len) {
  let m = shellMats.get(len);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, alphaToCoverage: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLen = { value: len };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uLen;\nvarying vec3 vFurP;\nvarying float vShell;')
      .replace('#include <begin_vertex>', /* glsl */`
        float shellK = (float(gl_InstanceID) + 1.0) / ${SHELLS.toFixed(1)};
        vShell = shellK;
        vFurP = position * 150.0;
        vec3 transformed = position + normalize(objectNormal) * uLen * shellK;
        transformed.y -= uLen * shellK * shellK * 0.45;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        varying vec3 vFurP; varying float vShell;
        float furHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <clipping_planes_fragment>', /* glsl */`#include <clipping_planes_fragment>
        vec3 fcell = floor(vFurP);
        float fh = furHash(fcell);
        float frad = mix(0.9, 0.38, vShell) * (0.8 + 0.2 * fh);
        float fa = (1.0 - smoothstep(frad * 0.5, frad, length(fract(vFurP) - 0.5))) * step(vShell, fh * 0.9 + 0.1);
        if (fa < 0.25) discard;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.8, 1.04, vShell);')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = fa;');
  };
  m.customProgramCacheKey = () => 'fur-shell-' + len;
  shellMats.set(len, m);
  return m;
}
function addShells(group, len) {
  const fur = group.children.find((c) => c.userData.kind === 'fur');
  if (!fur) return null;
  const src = fur.geometry;
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'color']) if (src.attributes[k]) g.setAttribute(k, src.attributes[k]);
  g.setIndex(src.index);
  g.instanceCount = SHELLS;
  g.boundingSphere = src.boundingSphere || (src.computeBoundingSphere(), src.boundingSphere);
  const mesh = new THREE.Mesh(g, shellMaterial(len));
  mesh.userData.shell = true;
  mesh.userData.noAO = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// ---------- characters ----------
const PAD = '#E9A0A8';
const EYE_DARK = '#1C120D';

function buildParts(av) {
  const fur = av.fur, outfit = av.outfit;
  const light = av.fur === '#FFF3DC' ? '#FFFBF4' : mix(fur, '#FFF8EC', 0.62);
  const inner = fur === '#F7B9C4' ? '#EE94AA' : '#F2AFBB';
  const knit = mix(outfit, '#2B1A10', 0.12), stripe = mix(outfit, '#FFFFFF', 0.6);
  const has = (a) => av.acc.includes(a);
  const c = HEAD_C;
  const FUR_M = { mat: 'fur' }, FAB = { mat: 'fabric' };

  // ---- torso: a fur body in a knitted jumper ----
  const torso = new Builder();
  torso.add(sphere(0.245, 28, 20), light, { pos: [0, 0.12, 0], scale: [0.98, 1, 0.9] }, FUR_M);
  const jumper = lathe([[0.226, -0.005], [0.25, 0.04], [0.262, 0.12], [0.258, 0.2], [0.236, 0.28], [0.19, 0.35], [0.13, 0.4], [0.09, 0.425]], 32);
  torso.add(jumper, outfit, { pos: [0, 0, 0], scale: [1, 1, 0.92] }, FAB);
  for (const y of [0.125, 0.19]) torso.add(torus(0.262, 0.011, 6, 40), stripe, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [1.0, 0.92, 1] }, { outline: false, mat: 'fabric' });
  torso.add(torus(0.232, 0.022, 8, 40), knit, { pos: [0, 0.002, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.92, 1] }, FAB);
  torso.add(torus(0.095, 0.03, 10, 28), knit, { pos: [0, 0.41, 0.005], rot: [Math.PI / 2 + 0.12, 0, 0] }, FAB);
  if (has('scarf')) {
    torso.add(torus(0.155, 0.062, 12, 32), '#E8893A', { pos: [0, 0.41, 0.005], rot: [Math.PI / 2 + 0.08, 0, 0] }, FAB);
    torso.add(rbox(0.11, 0.24, 0.05, 0.025), '#E8893A', { pos: [0.1, 0.27, 0.205], rot: [-0.25, 0, 0.15] }, FAB);
    for (const y of [0.18, 0.205]) torso.add(rbox(0.115, 0.012, 0.055, 0.005), '#FFE08A', { pos: [0.087, y, 0.226], rot: [-0.25, 0, 0.15] }, { outline: false, mat: 'fabric' });
    for (let i = 0; i < 5; i++) torso.add(capsule(0.005, 0.03, 2, 4), '#E8893A', { pos: [0.065 + i * 0.016, 0.135 - i * 0.003, 0.235], rot: [-0.25, 0, 0.15] }, { outline: false, mat: 'fabric' });
  }
  if (has('bowtie')) {
    for (const s of [-1, 1]) torso.add(sphere(0.065, 14, 10), '#E98A9B', { pos: [s * 0.062, 0.385, 0.16], scale: [1.1, 0.75, 0.5], rot: [0, 0, s * 0.2] }, { mat: 'glossy' });
    torso.add(sphere(0.03, 10, 8), darker('#E98A9B'), { pos: [0, 0.385, 0.185] }, { mat: 'glossy' });
  }
  if (has('backpack')) {
    torso.add(rbox(0.32, 0.34, 0.16, 0.07, 3), '#8FB07C', { pos: [0, 0.2, -0.27] }, FAB);
    torso.add(rbox(0.33, 0.13, 0.18, 0.05, 3), darker('#8FB07C', 0.12), { pos: [0, 0.33, -0.27] }, FAB);
    torso.add(rbox(0.16, 0.1, 0.05, 0.03), '#AFCB9C', { pos: [0, 0.15, -0.365] }, FAB);
    for (const s of [-1, 1]) {
      torso.add(rbox(0.035, 0.28, 0.02, 0.008), '#7A4E33', { pos: [s * 0.12, 0.24, 0.0], rot: [0, 0, 0] , scale: [1, 1, 1] }, { outline: false, mat: 'paint' });
      torso.add(torus(0.215, 0.012, 4, 24, Math.PI * 0.9), '#7A4E33', { pos: [s * 0.13, 0.22, -0.04], rot: [0, Math.PI / 2, Math.PI / 2 + 0.2], scale: [1, 1.15, 1] }, { outline: false, mat: 'paint' });
    }
    torso.add(rbox(0.04, 0.03, 0.012, 0.005), '#C9A24A', { pos: [0, 0.27, -0.362] }, { outline: false, mat: 'metal' });
  }

  // ---- head ----
  const head = new Builder();
  head.add(sphere(0.33, 40, 30), fur, { pos: [0, c, 0], scale: [1.1, 0.95, 1] }, FUR_M);
  for (const s of [-1, 1]) head.add(sphere(0.17, 20, 14), fur, { pos: [s * 0.19, c - 0.085, 0.1], scale: [1, 0.85, 1] }, FUR_M); // chubby cheeks
  head.add(sphere(0.125, 24, 16), light, { pos: [0, c - 0.088, 0.262], scale: [1.28, 0.86, 0.78] }, FUR_M);
  const noseCol = av.animal === 'bunny' || av.animal === 'cat' ? '#E58A9B' : '#2E1C14';
  head.add(sphere(0.046, 18, 12), noseCol, { pos: [0, c - 0.038, 0.352], scale: [1.32, 0.86, 0.8] }, { outline: false, mat: 'glossy' });
  head.add(sphere(0.012, 8, 6), '#FFFFFF', { pos: [0.014, c - 0.022, 0.385], scale: [1.4, 0.8, 0.6] }, { outline: false, mat: 'shine' });
  for (const s of [-1, 1]) {
    head.add(sphere(0.058, 14, 10), '#F2A2B0', { pos: [s * 0.215, c - 0.075, 0.24], scale: [1.3, 0.7, 0.3], rot: [0, s * 0.62, 0] }, { outline: false, mat: 'paint' });
    head.add(torus(0.022, 0.0065, 6, 12, Math.PI), '#3A2418', { pos: [s * 0.022, c - 0.1, 0.33], rot: [0.25, 0, Math.PI] }, { outline: false, mat: 'paint' });
  }
  head.add(capsule(0.005, 0.03, 2, 6), '#3A2418', { pos: [0, c - 0.072, 0.345], rot: [0.3, 0, 0] }, { outline: false, mat: 'paint' });
  if (av.animal === 'cat' || av.animal === 'fox') {
    for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
      head.add(capsule(0.0025, 0.12, 2, 4), '#FFFFFF', { pos: [s * 0.17, c - 0.07 + k * 0.018, 0.3], rot: [0, s * 0.35, Math.PI / 2 + k * 0.15 * s] }, { outline: false, mat: 'glossy' });
    }
  }
  if (av.animal === 'fox') for (const s of [-1, 1]) head.add(sphere(0.12, 16, 12), '#FFF3DC', { pos: [s * 0.16, c - 0.115, 0.16], scale: [1, 0.75, 0.9] }, FUR_M);
  if (av.animal === 'puppy') head.add(sphere(0.1, 16, 12), light, { pos: [-0.13, c + 0.1, 0.22], scale: [1, 1, 0.5] }, FUR_M); // eye patch
  if (has('beret')) {
    const tall = av.animal === 'bunny' || av.animal === 'cat' || av.animal === 'fox';
    head.add(sphere(tall ? 0.2 : 0.25, 28, 12), '#C8434F', { pos: [0.05, c + (tall ? 0.24 : 0.27), tall ? 0.09 : -0.01], rot: [tall ? 0.35 : 0, 0, -0.22], scale: [1, 0.32, 1] }, FAB);
    head.add(capsule(0.012, 0.03, 2, 6), darker('#C8434F'), { pos: [tall ? 0.03 : 0.0, c + (tall ? 0.32 : 0.36), tall ? 0.12 : -0.01] }, FAB);
  }
  if (has('crown')) {
    head.add(torus(0.27, 0.022, 8, 40), '#5E8E42', { pos: [0, c + 0.17, -0.005], rot: [Math.PI / 2 + 0.12, 0, 0], scale: [1.12, 1, 1] }, { mat: 'foliage' });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const x = Math.cos(a) * 0.3, z = Math.sin(a) * 0.27;
      const col = ['#F7B9C4', '#FFE08A', '#FFF6EA', '#D9C2EE'][i % 4];
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        head.add(sphere(0.022, 8, 6), col, { pos: [x + Math.cos(pa) * 0.022, c + 0.18 - z * 0.12 + Math.sin(pa) * 0.022, z], scale: [1, 1, 0.4], rot: [0, a + Math.PI / 2, 0] }, { outline: false, mat: 'fabric' });
      }
      head.add(sphere(0.014, 8, 6), '#F4A646', { pos: [x, c + 0.18 - z * 0.12, z] }, { outline: false, mat: 'paint' });
      head.add(sphere(0.02, 6, 4), '#6E9B47', { pos: [x * 1.04, c + 0.155 - z * 0.12, z * 1.04], scale: [1.6, 0.4, 0.8] }, { outline: false, mat: 'foliage' });
    }
  }
  if (has('glasses')) {
    for (const s of [-1, 1]) {
      head.add(torus(0.07, 0.011, 8, 28), '#4A2C1D', { pos: [s * 0.13, c + 0.035, 0.345], rot: [-0.08, s * 0.14, 0] }, { mat: 'glossy' });
      head.add(capsule(0.008, 0.2, 2, 6), '#4A2C1D', { pos: [s * 0.255, c + 0.05, 0.23], rot: [Math.PI / 2, 0, -s * 0.35] }, { outline: false, mat: 'glossy' });
    }
    head.add(torus(0.03, 0.009, 6, 12, Math.PI), '#4A2C1D', { pos: [0, c + 0.04, 0.36] }, { outline: false, mat: 'glossy' });
  }

  // ---- ears: their own pivots so they can twitch and flop ----
  const ears = [];
  const ear = (pts) => lathe(pts, 16);
  for (const s of [-1, 1]) {
    const e = new Builder();
    let pos, rot = [0, 0, 0];
    switch (av.animal) {
      case 'bear':
        pos = [s * 0.235, c + 0.21, -0.03];
        e.add(sphere(0.11, 18, 14), fur, { pos: [0, 0.045, 0], scale: [1, 1, 0.6] }, FUR_M);
        e.add(sphere(0.062, 14, 10), inner, { pos: [0, 0.042, 0.042], scale: [1, 1, 0.38] }, FUR_M);
        break;
      case 'cat':
        pos = [s * 0.19, c + 0.2, -0.02]; rot = [0, 0, -s * 0.32];
        e.add(ear([[0.1, 0], [0.088, 0.07], [0.052, 0.14], [0.018, 0.18], [0, 0.186]]), fur, { scale: [1, 1, 0.55] }, FUR_M);
        e.add(ear([[0.062, 0], [0.05, 0.05], [0.025, 0.1], [0, 0.112]]), inner, { pos: [0, 0.01, 0.035], scale: [1, 1, 0.38] }, FUR_M);
        break;
      case 'bunny':
        pos = [s * 0.11, c + 0.27, -0.03]; rot = [0, 0, -s * 0.13];
        e.add(capsule(0.068, 0.26, 6, 16), fur, { pos: [0, 0.16, 0], scale: [1, 1, 0.6] }, FUR_M);
        e.add(capsule(0.036, 0.2, 5, 12), inner, { pos: [0, 0.16, 0.03], scale: [1, 1, 0.38] }, FUR_M);
        break;
      case 'puppy':
        pos = [s * 0.29, c + 0.13, -0.03]; rot = [0, 0, s * 0.32];
        e.add(sphere(0.13, 18, 14), darker(fur, 0.16), { pos: [0, -0.1, 0], scale: [0.42, 1, 0.8] }, FUR_M);
        break;
      case 'fox':
        pos = [s * 0.2, c + 0.2, -0.02]; rot = [0, 0, -s * 0.3];
        e.add(ear([[0.13, 0], [0.112, 0.09], [0.066, 0.18], [0.022, 0.25], [0, 0.262]]), fur, { scale: [1, 1, 0.55] }, FUR_M);
        e.add(ear([[0.072, 0], [0.06, 0.06], [0.03, 0.13], [0, 0.152]]), '#FFF3DC', { pos: [0, 0.01, 0.04], scale: [1, 1, 0.38] }, FUR_M);
        e.add(ear([[0.05, 0], [0.032, 0.035], [0.012, 0.06], [0, 0.066]]), '#3A2418', { pos: [0, 0.198, 0.002], scale: [1, 1, 0.58] }, FUR_M);
        break;
    }
    ears.push({ b: e, pos, rot, side: s });
  }

  // ---- eyes: glossy, with a coloured iris and two catch-lights ----
  const eyes = new Builder();
  const iris = av.animal === 'cat' ? '#7A6A2A' : av.animal === 'fox' ? '#7A4A1E' : '#4A2E1C';
  for (const s of [-1, 1]) {
    eyes.add(sphere(0.05, 20, 16), EYE_DARK, { pos: [s * 0.13, 0, 0], scale: [1, 1.2, 0.58] }, { outline: false, mat: 'glossy' });
    eyes.add(sphere(0.036, 18, 12), iris, { pos: [s * 0.13, -0.008, 0.012], scale: [1, 1.15, 0.5] }, { outline: false, mat: 'glossy' });
    eyes.add(sphere(0.02, 14, 10), '#0A0604', { pos: [s * 0.13, -0.004, 0.022], scale: [av.animal === 'cat' ? 0.55 : 1, 1.2, 0.5] }, { outline: false, mat: 'glossy' });
    eyes.add(sphere(0.0145, 10, 8), '#FFFFFF', { pos: [s * 0.13 + 0.016, 0.026, 0.03] }, { outline: false, mat: 'shine' });
    eyes.add(sphere(0.0065, 8, 6), '#FFFFFF', { pos: [s * 0.13 - 0.014, -0.022, 0.03] }, { outline: false, mat: 'shine' });
  }

  const arm = () => {
    const a = new Builder();
    a.add(capsule(0.072, 0.1, 6, 16), outfit, { pos: [0, -0.075, 0] }, FAB);
    a.add(torus(0.058, 0.02, 8, 20), knit, { pos: [0, -0.15, 0], rot: [Math.PI / 2, 0, 0] }, FAB);
    a.add(sphere(0.074, 18, 14), fur, { pos: [0, -0.205, 0.01] }, FUR_M);
    a.add(sphere(0.032, 12, 8), PAD, { pos: [0, -0.235, 0.05], scale: [1, 0.55, 0.9] }, { outline: false, mat: 'paint' });
    return a;
  };
  const leg = () => {
    const l = new Builder();
    l.add(capsule(0.078, 0.07, 6, 16), fur, { pos: [0, -0.09, 0] }, FUR_M);
    l.add(sphere(0.088, 18, 14), light, { pos: [0, -0.148, 0.035], scale: [1, 0.6, 1.3] }, FUR_M);
    l.add(sphere(0.042, 14, 10), PAD, { pos: [0, -0.196, 0.02], scale: [1.15, 0.22, 1.05] }, { outline: false, mat: 'paint' });
    for (const x of [-0.034, 0, 0.034]) l.add(sphere(0.016, 10, 8), PAD, { pos: [x, -0.19, 0.088 - Math.abs(x) * 0.3], scale: [1, 0.35, 1] }, { outline: false, mat: 'paint' });
    return l;
  };

  const tail = new Builder();
  switch (av.animal) {
    case 'bear': tail.add(sphere(0.075, 16, 12), fur, { pos: [0, 0, -0.03] }, FUR_M); break;
    case 'bunny': tail.add(sphere(0.1, 18, 14), light, { pos: [0, 0, -0.04] }, FUR_M); break;
    case 'cat':
      tail.add(capsule(0.042, 0.2, 6, 12), fur, { pos: [0, 0.08, -0.08], rot: [-0.7, 0, 0] }, FUR_M);
      tail.add(capsule(0.042, 0.12, 6, 12), fur, { pos: [0, 0.22, -0.13], rot: [0.4, 0, 0] }, FUR_M);
      break;
    case 'puppy': tail.add(capsule(0.045, 0.13, 6, 12), fur, { pos: [0, 0.07, -0.05], rot: [-0.8, 0, 0] }, FUR_M); break;
    case 'fox':
      tail.add(sphere(0.13, 22, 16), fur, { pos: [0, 0.1, -0.14], rot: [-0.7, 0, 0], scale: [0.8, 0.8, 1.7] }, FUR_M);
      tail.add(sphere(0.088, 18, 14), '#FFF3DC', { pos: [0, 0.27, -0.27], rot: [-0.7, 0, 0] }, FUR_M);
      break;
  }
  return { torso, head, ears, eyes, arm, leg, tail };
}

// shells per part: how long the fur is (metres)
const FUR_LEN = { head: 0.012, ear: 0.01, torso: 0.014, leg: 0.014, arm: 0.01, tail: 0.026 };
const HIDDEN = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

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
    this.furOn = true;
    this.castShadows = true;
    this.camHidden = null;
    this.twitch = { t: 2, side: 0, k: 0 };
    this.j = {}; // current joint values (smoothed)
    this.setAvatar(avatar);
  }

  setAvatar(avatar) {
    this.avatar = cleanAvatar(avatar);
    if (this.body) {
      this.tilt.remove(this.body, this.legL, this.legR);
      this.body.traverse((o) => o.geometry?.dispose());
      this.legL.traverse((o) => o.geometry?.dispose());
      this.legR.traverse((o) => o.geometry?.dispose());
    }
    const p = buildParts(this.avatar);
    this.shells = [];
    const part = (builder, kind, opts) => {
      const g = builder.build(opts);
      const sh = addShells(g, FUR_LEN[kind]);
      if (sh) this.shells.push(sh);
      return g;
    };
    const body = (this.body = new THREE.Group());
    body.position.y = HIP_Y;
    body.add(part(p.torso, 'torso'));
    const neck = (this.neck = new THREE.Group());
    neck.position.y = 0.43;
    neck.add(part(p.head, 'head'));
    this.ears = p.ears.map((e) => {
      const pivot = new THREE.Group();
      pivot.position.set(...e.pos);
      pivot.rotation.set(...e.rot);
      pivot.userData.base = e.rot.slice();
      pivot.userData.side = e.side;
      pivot.add(part(e.b, 'ear'));
      neck.add(pivot);
      return pivot;
    });
    const eyes = (this.eyes = p.eyes.build({ outline: false }));
    eyes.position.set(0, HEAD_C + 0.03, 0.302);
    neck.add(eyes);
    body.add(neck);
    this.armL = new THREE.Group(); this.armL.position.set(0.24, 0.33, 0); this.armL.add(part(p.arm(), 'arm'));
    this.armR = new THREE.Group(); this.armR.position.set(-0.24, 0.33, 0); this.armR.add(part(p.arm(), 'arm'));
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.22, 0.04); this.armR.add(this.hand);
    body.add(this.armL, this.armR);
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.08, -0.21); this.tail.add(part(p.tail, 'tail'));
    body.add(this.tail);
    this.legL = new THREE.Group(); this.legL.position.set(0.11, HIP_Y, 0); this.legL.add(part(p.leg(), 'leg'));
    this.legR = new THREE.Group(); this.legR.position.set(-0.11, HIP_Y, 0); this.legR.add(part(p.leg(), 'leg'));
    this.tilt.add(body, this.legL, this.legR);
    if (this.propName) { const n = this.propName; this.propName = null; this.setProp(n); }
    this.labelY = this.avatar.animal === 'bunny' ? 1.72 : this.avatar.animal === 'fox' ? 1.58 : 1.45;
    this.setShadows(this.castShadows);
    this.camHidden = null;
  }

  setProp(name, mallowColor) {
    if (name === this.propName && !mallowColor) return;
    if (this.prop) { this.hand.remove(this.prop); this.prop.traverse((o) => o.geometry?.dispose()); this.prop = null; }
    this.propName = name || null;
    this.camHidden = null;
    if (!name) return;
    this.prop = makeProp(name, mallowColor);
    this.prop.traverse((o) => { if (o.isMesh && !o.userData.shell) o.castShadow = this.castShadows; });
    this.hand.add(this.prop);
  }

  // fluffy fur shells on/off (graphics setting)
  setFur(on) { this.furOn = on; }

  // real shadows: the body casts them; the soft blob underneath stays as contact shadow
  setShadows(on) {
    this.castShadows = on;
    this.root.traverse((o) => { if (o.isMesh && !o.userData.shell && o.material !== outlineMaterial) o.castShadow = on; });
    this.shadow.material.opacity = on ? 0.55 : 1;
    this.shadowK = on ? 0.55 : 1;
  }

  // first person: the camera sees through you, but your shadow stays
  setHiddenFromCamera(on) {
    if (on === this.camHidden) return;
    this.camHidden = on;
    this.root.traverse((o) => {
      if (!o.isMesh || o.userData.shell) return;
      if (o.material === outlineMaterial || o.userData.outline) {
        o.userData.outline = true;
        o.visible = !on && STYLE.name === 'toon';
        return;
      }
      if (on) { if (o.material !== HIDDEN) { o.userData.camMat = o.material; o.material = HIDDEN; } }
      else if (o.material === HIDDEN) o.material = o.userData.camMat || o.material;
    });
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
    const sitting = ['sit', 'swing', 'seesaw', 'piano', 'drums', 'stool', 'helm'].includes(pose);
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
      bodyY: HIP_Y, bodyRx: 0, bodyRy: 0, bodyRz: 0, headX: 0, headY: 0, headZ: 0, tail: 0, eyes: 1, ear: 0, earZ: 0,
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
    // idle: now and then glance around
    T.headY = (1 - w) * Math.sin(t * 0.31) * Math.max(0, Math.sin(t * 0.13)) * 0.35;
    T.tail = Math.sin(t * (this.avatar.animal === 'puppy' ? 9 : 2.5)) * (this.avatar.animal === 'puppy' ? 0.45 : 0.2);
    // ears trail behind when running, bounce with steps
    T.ear = -w * 0.35 + Math.abs(Math.sin(ph)) * 0.12 * w;
    T.earZ = Math.sin(ph) * 0.1 * w;

    if (!s.grounded && !sitting) {
      T.legL = T.legR = -0.45;
      T.armLz = 1.3; T.armRz = -1.3;
      T.ear = (s.vy || 0) > 0 ? -0.45 : 0.3;
    }
    if (sitting) {
      T.legL = T.legR = pose === 'stool' ? -1.15 : -1.42;
      T.bodyY = HIP_Y; T.bodyRz = 0; T.bodyRx = 0;
      if (pose === 'swing') { T.armLx = T.armRx = -2.75; T.armLz = 0.12; T.armRz = -0.12; }
      if (pose === 'seesaw') { T.armLx = T.armRx = -1.45; T.armLz = 0.2; T.armRz = -0.2; }
      if (pose === 'helm') { T.armLx = T.armRx = -1.25; T.armLz = 0.32; T.armRz = -0.32; T.legL = T.legR = -1.2; }
    }
    if (ground) {
      T.legL = T.legR = -1.5;
      T.bodyY = HIP_Y; T.bodyRz = 0;
      T.armLx = T.armRx = -0.5; T.armLz = 0.5; T.armRz = -0.5;
      if (pose === 'sleep') { T.headX = 0.32; T.headZ = 0.22; T.headY = 0; T.bodyRx = 0.12; T.eyes = 0.1; T.armLz = 0.3; T.armRz = -0.3; T.ear = 0.35; }
    }
    if (pose === 'fish') { T.armRx = -0.95; T.armRz = -0.05; T.armLx = -0.8; T.armLz = 0.55; T.headY = 0; }
    if (pose === 'toast') { T.armRx = -1.25; T.armRz = -0.05; T.armLx = -0.4; T.headY = 0; }
    if (pose === 'scope') { T.headY = 0; T.armLx = T.armRx = -1.3; T.armLz = 0.3; T.armRz = -0.3; }
    if (pose === 'play' || pose === 'piano' || pose === 'drums') {
      const h = this.hit;
      T.armLx = -1.15 - (this.hitSide ? h * 0.5 : 0); T.armRx = -1.15 - (this.hitSide ? 0 : h * 0.5);
      T.armLz = 0.18; T.armRz = -0.18;
      T.bodyY += h * 0.02;
      T.headY = 0;
    }
    if (this.propName && !['fish', 'toast'].includes(pose) && !e) {
      const sip = this.sipT > 0 ? Math.sin(Math.min(1, this.sipT) * Math.PI) : 0;
      T.armRx = -0.95 - sip * 1.0; T.armRz = -0.15 + sip * 0.35;
      T.headX -= sip * 0.15;
      if (sip > 0) T.eyes = 0.2;
    }
    if (this.sipT > 0) this.sipT -= dt;

    // emotes layered on top
    if (e) T.headY = 0;
    if (e === 'wave') { T.armRz = -2.55 + Math.sin(et * 12) * 0.35; T.armRx = -0.2; T.headZ = 0.12; T.ear = 0.1; }
    if (e === 'dance') {
      T.bodyRy = Math.sin(et * 6) * 0.45; T.bodyY = HIP_Y + Math.abs(Math.sin(et * 6)) * 0.08;
      T.armLz = 2.3 + Math.sin(et * 6) * 0.5; T.armRz = -2.3 + Math.sin(et * 6) * 0.5;
      T.legL = Math.max(0, Math.sin(et * 6)) * -0.5; T.legR = Math.max(0, -Math.sin(et * 6)) * -0.5;
      T.headZ = Math.sin(et * 6) * 0.15;
      T.earZ = Math.sin(et * 6) * 0.25;
    }
    if (e === 'clap') { T.armLx = T.armRx = -1.3; const k = 0.5 + 0.5 * Math.sin(et * 16); T.armLz = -0.05 + k * 0.45; T.armRz = 0.05 - k * 0.45; }
    if (e === 'laugh') { T.headX = -0.3; T.bodyRz = Math.sin(et * 32) * 0.06; T.bodyY += Math.abs(Math.sin(et * 16)) * 0.025; T.armLx = T.armRx = -0.5; T.armLz = 0.75; T.armRz = -0.75; T.eyes = 0.15; T.ear = -0.2; }
    if (e === 'heart') { T.armLx = T.armRx = -1.6; T.armLz = -0.55; T.armRz = 0.55; T.headZ = 0.2; T.eyes = 0.3; }
    if (e === 'cheer') { T.armLz = 2.85; T.armRz = -2.85; T.bodyY = HIP_Y + Math.abs(Math.sin(et * 9)) * 0.14; T.legL = T.legR = -Math.abs(Math.sin(et * 9)) * 0.3; T.eyes = 0.15; T.ear = -0.3 + Math.abs(Math.sin(et * 9)) * 0.4; }
    if (e === 'catch' || e === 'show') { T.armRx = -2.6; T.armRz = -0.2; T.bodyRx = -0.1; T.headX = -0.15; T.eyes = 0.15; T.tail = Math.sin(t * 12) * 0.5; }
    if (e === 'heart' || e === 'cheer' || e === 'dance') T.tail = Math.sin(t * 12) * 0.5;

    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    if (this.blinkT < 0.13) T.eyes = Math.min(T.eyes, 0.1);

    // squash and stretch
    if (s.landed) this.squash = 1;
    this.squash = Math.max(0, this.squash - dt * 5);
    const stretch = !s.grounded && !sitting ? Math.min(0.08, Math.max(-0.05, (s.vy || 0) * 0.02)) : 0;
    const sq = this.squash * 0.14;
    const breathe = Math.sin(t * 2.1) * 0.012 * (1 - w);

    const k = 1 - Math.exp(-dt * 14), j = this.j;
    for (const key in T) j[key] = j[key] === undefined ? T[key] : j[key] + (T[key] - j[key]) * (key === 'eyes' ? 1 : key === 'headY' ? k * 0.25 : k);
    this.hit = Math.max(0, this.hit - dt * 6);

    this.legL.rotation.x = j.legL; this.legR.rotation.x = j.legR;
    this.armL.rotation.set(j.armLx, 0, j.armLz);
    this.armR.rotation.set(j.armRx, 0, j.armRz);
    this.body.position.y = j.bodyY;
    this.body.rotation.set(j.bodyRx, j.bodyRy, j.bodyRz);
    this.body.scale.set(1 + sq + breathe * 0.5, 1 - sq + stretch + breathe, 1 + sq + breathe * 0.5);
    this.neck.rotation.set(j.headX, j.headY, j.headZ, 'YXZ');
    this.tail.rotation.set(0, j.tail, j.tail * 0.3);
    this.eyes.scale.y = j.eyes;

    // ear twitches every few seconds
    const tw = this.twitch;
    tw.t -= dt;
    if (tw.t < 0) { tw.t = 2.5 + Math.random() * 5; tw.side = Math.random() < 0.5 ? -1 : 1; tw.k = 1; }
    tw.k = Math.max(0, tw.k - dt * 5);
    const floppy = this.avatar.animal === 'puppy' ? 1.6 : this.avatar.animal === 'bunny' ? 1.2 : 0.6;
    for (const ear of this.ears) {
      const b = ear.userData.base, sd = ear.userData.side;
      const twitch = tw.side === sd ? Math.sin(tw.k * Math.PI * 3) * 0.25 * tw.k : 0;
      ear.rotation.set(b[0] + j.ear * floppy + twitch * 0.4, b[1], b[2] + (j.earZ * floppy + twitch) * (this.avatar.animal === 'puppy' ? 1 : -sd) * 0.6);
    }

    if (this.prop) {
      // keep held things upright-ish whatever the arm does
      this.prop.rotation.set(-j.armRx - (pose === 'fish' ? 0.6 : pose === 'toast' ? 1.25 : 0), 0, -j.armRz);
    }

    // fur shells: realistic style only, and only up close
    const furVis = this.furOn && STYLE.name !== 'toon' && !this.camHidden;
    for (const sh of this.shells) sh.visible = furVis;

    // blob shadow stays on the ground
    if (s.groundY !== undefined) {
      this.shadow.position.set(this.root.position.x, s.groundY + 0.012, this.root.position.z);
      const lift = Math.max(0, this.root.position.y - s.groundY);
      this.shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.35));
      this.shadow.material.opacity = Math.max(0.2, 1 - lift * 0.4) * (this.shadowK || 1);
    }
  }

  sip() { this.sipT = 0.9; }

  handWorld(out = new THREE.Vector3()) { return this.hand.getWorldPosition(out); }
  headWorld(out = new THREE.Vector3()) { return this.eyes.getWorldPosition(out); }
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
