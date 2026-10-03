// Trees, bushes and rocks: bark trunks, leafy canopies made of leaf-cluster cards, and sculpted rocks.
import * as THREE from 'three';
import { Builder, rng } from './toon.js';
import { REAL, addDetail } from './materials.js';

// ---------- leaf cluster texture (white, tinted per card) ----------
function leafTexture(kind) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rng(kind === 'needle' ? 5 : kind === 'blossom' ? 9 : 3);
  g.clearRect(0, 0, S, S);
  const n = kind === 'needle' ? 70 : 26;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * S * 0.34;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r;
    const shade = 150 + Math.floor(R() * 105);
    g.save();
    g.translate(x, y);
    g.rotate(a + (R() - 0.5) * 1.2);
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath();
    if (kind === 'needle') g.ellipse(0, 0, 3, 22, 0, 0, Math.PI * 2);
    else if (kind === 'blossom') { for (let p = 0; p < 5; p++) { const pa = (p / 5) * Math.PI * 2; g.ellipse(Math.cos(pa) * 7, Math.sin(pa) * 7, 7, 5, pa, 0, Math.PI * 2); } }
    else g.ellipse(0, 0, 11, 24, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === 'leaf') { g.strokeStyle = `rgba(0,0,0,0.18)`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 20); g.stroke(); }
    if (kind === 'blossom') { g.fillStyle = 'rgb(255,230,150)'; g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Cards light like part of a round canopy, and sway in the wind.
function cardMaterial(tex, wind) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.78 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uWind = wind;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCenter;\nuniform float uWind;')
      .replace('#include <beginnormal_vertex>', `
        vec3 cardPos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 objectNormal = normalize(mix((inverse(mat3(instanceMatrix)) * normalize(cardPos - aCenter)), normal, 0.25));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float sw = sin(uWind * 1.3 + cardPos.x * 0.35 + cardPos.z * 0.27) * 0.5 + sin(uWind * 2.9 + cardPos.y) * 0.25;
        transformed.x += sw * 0.08 * (position.y + 0.5);
        transformed.z += sw * 0.05;`);
  };
  m.customProgramCacheKey = () => 'leafcard';
  return m;
}

function noiseRock(R, detail = 2) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  const o = [R() * 10, R() * 10, R() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.1 + o[0]) * Math.sin(v.y * 2.7 + o[1]) * Math.sin(v.z * 2.3 + o[2]);
    const n2 = Math.sin(v.x * 5.3 + o[1]) * Math.sin(v.z * 4.9 + o[2]) * 0.4;
    v.multiplyScalar(1 + n * 0.22 + n2 * 0.1);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export class Foliage {
  constructor() {
    this.R = rng(1234);
    this.trunks = new Builder();
    this.blobs = new Builder();
    this.rocks = new Builder();
    this.cards = { leaf: [], blossom: [], needle: [] };
    this.wind = { value: 0 };
  }

  addCards(kind, center, rx, ry, rz, count, size, colors) {
    const R = this.R;
    for (let i = 0; i < count; i++) {
      // more cards on the upper, sunny side
      const u = R() * 2 - 1, th = R() * Math.PI * 2;
      let y = u * 0.9 + 0.1;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
      const k = 0.78 + R() * 0.3;
      const pos = new THREE.Vector3(center.x + dir.x * rx * k, center.y + dir.y * ry * k, center.z + dir.z * rz * k);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), R() * Math.PI * 2));
      const sc = size * (0.75 + R() * 0.5);
      this.cards[kind].push({ pos, q, s: sc, center: center.clone(), color: colors[Math.floor(R() * colors.length)] });
    }
  }

  // kind: round | blossom | pine
  tree(x, y, z, s = 1, kind = 'round') {
    const R = this.R;
    const h = (kind === 'pine' ? 1.2 : 1.6) * s;
    const lean = (R() - 0.5) * 0.12;
    this.trunks.add(new THREE.CylinderGeometry(0.1 * s, 0.19 * s, h + 0.4, 9, 3), '#6E4E36', { pos: [x, y + h / 2 - 0.15, z], rot: [lean, R() * 6, lean * 0.6] }, { mat: 'wood' });
    this.trunks.add(new THREE.SphereGeometry(0.24 * s, 9, 6), '#6E4E36', { pos: [x, y + 0.02, z], scale: [1, 0.35, 1] }, { mat: 'wood' });
    if (kind === 'pine') {
      const greens = ['#2F5A3A', '#3A6A44', '#2B5135', '#456F49'];
      for (let i = 0; i < 4; i++) {
        const cy = y + h + 0.1 + i * 0.75 * s, r = (1.25 - i * 0.26) * s;
        const c = new THREE.Vector3(x, cy, z);
        this.blobs.add(new THREE.ConeGeometry(r * 0.85, 1.1 * s, 10, 1), '#24432C', { pos: [x, cy + 0.2 * s, z] }, { mat: 'foliage' });
        this.addCards('needle', c, r, 0.55 * s, r, Math.round(46 * r * r), 0.62 * s, greens);
      }
      return;
    }
    const greens = kind === 'blossom' ? ['#F2B3C2', '#F7C7D2', '#E996AC', '#FAD6DF'] : ['#4F7F3A', '#5E8E42', '#6E9B47', '#46733A', '#7AA552'];
    const inner = kind === 'blossom' ? '#C98097' : '#355B2C';
    const blobs = [[0, 2.0, 0, 1.0], [0.6, 1.7, 0.25, 0.7], [-0.5, 1.75, -0.3, 0.68], [-0.1, 2.6, 0.1, 0.62], [0.2, 2.1, -0.6, 0.55]];
    for (const [bx, by, bz, br] of blobs) {
      const c = new THREE.Vector3(x + bx * s, y + by * s, z + bz * s), r = br * s;
      this.blobs.add(noiseRock(R, 1), inner, { pos: [c.x, c.y, c.z], scale: [r * 0.8, r * 0.7, r * 0.8] }, { mat: 'foliage' });
      this.addCards(kind === 'blossom' ? 'blossom' : 'leaf', c, r, r * 0.86, r, Math.round(70 * r * r), 0.62 * s, greens);
      // a branch reaching into each outer blob
      if (bx || bz) {
        const dir = new THREE.Vector3(bx, by - 1.3, bz).normalize();
        const len = Math.hypot(bx, by - 1.3, bz) * s;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x + (bx * s) / 2, y + 1.3 * s + ((by - 1.3) * s) / 2, z + (bz * s) / 2), q, new THREE.Vector3(1, 1, 1));
        this.trunks.add(new THREE.CylinderGeometry(0.04 * s, 0.08 * s, len, 6), '#6E4E36', m, { mat: 'wood' });
      }
    }
  }

  bush(x, y, z, s = 1, flowers = false) {
    const R = this.R;
    const greens = ['#4F7F3A', '#5E8E42', '#6E9B47', '#46733A'];
    for (const [bx, bz, br] of [[0, 0, 0.5], [0.35, 0.12, 0.38], [-0.3, -0.1, 0.36]]) {
      const c = new THREE.Vector3(x + bx * s, y + br * 0.55 * s, z + bz * s), r = br * s;
      this.blobs.add(noiseRock(R, 1), '#2F5228', { pos: [c.x, c.y, c.z], scale: [r * 0.85, r * 0.65, r * 0.85] }, { mat: 'foliage' });
      this.addCards('leaf', c, r, r * 0.75, r, Math.round(60 * r * r) + 4, 0.34 * s, greens);
      if (flowers) this.addCards('blossom', c, r * 1.02, r * 0.8, r * 1.02, 5, 0.22 * s, ['#F7B9C4', '#FFE08A', '#FFF3DC']);
    }
  }

  rock(x, y, z, s = 1, color = '#A49A8C', squash = 0.65) {
    this.rocks.add(noiseRock(this.R, 2), color, { pos: [x, y + s * squash * 0.35, z], rot: [this.R() * 0.4, this.R() * 6, this.R() * 0.3], scale: [s, s * squash, s * (0.8 + this.R() * 0.4)] }, { mat: 'rock' });
  }

  build(scene) {
    const add = (b, opts) => { if (!b.empty) { const g = b.build(opts); scene.add(g); return g; } return null; };
    add(this.trunks, { castShadow: true, outline: true });
    const blobs = add(this.blobs, { castShadow: true, outline: true });
    add(this.rocks, { castShadow: true, outline: true });
    const quad = new THREE.PlaneGeometry(1, 1);
    for (const [kind, list] of Object.entries(this.cards)) {
      if (!list.length) continue;
      const mat = cardMaterial(leafTexture(kind === 'needle' ? 'needle' : kind === 'blossom' ? 'blossom' : 'leaf'), this.wind);
      const geo = quad.clone();
      const centers = new Float32Array(list.length * 3);
      list.forEach((c, i) => centers.set([c.center.x, c.center.y, c.center.z], i * 3));
      geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      list.forEach((c, i) => {
        m.compose(c.pos, c.q, new THREE.Vector3(c.s, c.s, c.s));
        im.setMatrixAt(i, m);
        im.setColorAt(i, col.set(c.color));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.noAO = true;
      im.computeBoundingSphere();
      scene.add(im);
    }
    this.blobMesh = blobs;
  }

  update(t) { this.wind.value = t; }
}

export { noiseRock };
