// Trees, bushes, ferns and rocks: bark trunks, leafy canopies made of leaf-cluster cards, and sculpted rocks.
// Everything is grouped into square chunks of the map so whole patches of forest can be skipped when off screen.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, rng } from './toon.js';
import { REAL, registerMesh } from './materials.js';

const CHUNK = 36;

// ---------- card textures (white, tinted per card) ----------
function leafTexture(kind) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = rng({ needle: 5, blossom: 9, leaf: 3, fern: 13, litter: 17, birch: 21 }[kind] || 3);
  g.clearRect(0, 0, S, S);
  if (kind === 'fern') {
    // one frond: a curved stem with paired leaflets getting smaller toward the tip
    g.strokeStyle = 'rgb(200,200,200)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(S / 2, S - 4); g.quadraticCurveTo(S / 2 + 10, S / 2, S / 2 - 6, 8); g.stroke();
    for (let i = 0; i < 22; i++) {
      const t = i / 22, y = S - 10 - t * (S - 26), x = S / 2 + Math.sin(t * 2.4) * 8;
      const len = (1 - t) * 78 + 10, wdt = (1 - t) * 9 + 3;
      for (const sd of [-1, 1]) {
        const shade = 170 + Math.floor(R() * 70);
        g.fillStyle = `rgb(${shade},${shade},${shade})`;
        g.save(); g.translate(x, y); g.rotate(sd * (1.25 - t * 0.35));
        g.beginPath(); g.ellipse(0, -len / 2, wdt, len / 2, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
  } else if (kind === 'litter') {
    // a single fallen leaf with a stem and veins
    g.fillStyle = 'rgb(235,235,235)';
    g.beginPath(); g.ellipse(S / 2, S / 2, S * 0.26, S * 0.42, 0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(S * 0.38, S * 0.9); g.lineTo(S * 0.62, S * 0.12); g.stroke();
    for (let i = 1; i < 6; i++) { const t = i / 6; g.beginPath(); g.moveTo(S * (0.38 + 0.24 * t), S * (0.9 - 0.78 * t)); g.lineTo(S * (0.38 + 0.24 * t) + 40, S * (0.9 - 0.78 * t) - 10); g.stroke(); }
  } else {
    const n = kind === 'needle' ? 70 : kind === 'birch' ? 34 : 26;
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
      else if (kind === 'birch') g.ellipse(0, 0, 9, 13, 0, 0, Math.PI * 2);
      else g.ellipse(0, 0, 11, 24, 0, 0, Math.PI * 2);
      g.fill();
      if (kind === 'leaf') { g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 20); g.stroke(); }
      if (kind === 'blossom') { g.fillStyle = 'rgb(255,230,150)'; g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Cards light like part of a round canopy, and sway in the wind.
function cardMaterial(tex, wind, sway = 1) {
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
        transformed.x += sw * ${(0.08 * sway).toFixed(3)} * (position.y + 0.5);
        transformed.z += sw * ${(0.05 * sway).toFixed(3)};`);
  };
  m.customProgramCacheKey = () => 'leafcard' + sway;
  return m;
}

function noiseRock(R, detail = 2) {
  // welded so the normals come out smooth instead of faceted
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
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

// moss creeping over the top of a rock: tint vertices whose normals face up
function mossy(geo, rock, moss, amt) {
  const n = geo.attributes.normal, c = new THREE.Color(rock), m = new THREE.Color(moss), out = new THREE.Color();
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const k = THREE.MathUtils.smoothstep(n.getY(i), 0.45, 0.85) * amt;
    out.copy(c).lerp(m, k);
    col.set([out.r, out.g, out.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

class Chunk {
  constructor() {
    this.trunks = new Builder();
    this.blobs = new Builder();
    this.rocks = new Builder();
    this.cards = { leaf: [], blossom: [], needle: [], birch: [], fern: [], litter: [] };
    this.pebbles = [];
  }
}

// one tier of a pine: a cone whose skirt is ragged and droops at the tips (jitter depends on angle, so the seam stays closed)
function pineTier(r, h, ph) {
  const g = new THREE.ConeGeometry(r, h, 12, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = 0.5 - y / h; // 0 at the tip, 1 at the skirt
    const a = Math.atan2(z, x);
    const k = 1 + t * (0.2 * Math.sin(a * 5 + ph) + 0.12 * Math.sin(a * 9 - ph * 1.7));
    p.setXYZ(i, x * k, y - t * t * h * (0.1 + 0.08 * Math.sin(a * 7 + ph)), z * k);
  }
  g.computeVertexNormals();
  return g;
}

export class Foliage {
  constructor() {
    this.R = rng(1234);
    this.chunks = new Map();
    this.wind = { value: 0 };
    this.groups = [];
    this.small = []; // ferns, leaf litter and pebbles: hidden once they're too far away to make out
  }

  chunk(x, z) {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let c = this.chunks.get(k);
    if (!c) this.chunks.set(k, (c = new Chunk()));
    return c;
  }

  addCards(ch, kind, center, rx, ry, rz, count, size, colors) {
    const R = this.R;
    for (let i = 0; i < count; i++) {
      const u = R() * 2 - 1, th = R() * Math.PI * 2;
      const y = u * 0.9 + 0.1;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const dir = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
      const k = 0.78 + R() * 0.3;
      const pos = new THREE.Vector3(center.x + dir.x * rx * k, center.y + dir.y * ry * k, center.z + dir.z * rz * k);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), R() * Math.PI * 2));
      const sc = size * (0.75 + R() * 0.5);
      ch.cards[kind].push({ pos, q, s: sc, center: center.clone(), color: colors[Math.floor(R() * colors.length)] });
    }
  }

  // kind: round | blossom | pine | birch
  tree(x, y, z, s = 1, kind = 'round') {
    const R = this.R, ch = this.chunk(x, z);
    if (kind === 'birch') return this.birch(ch, x, y, z, s);
    const h = (kind === 'pine' ? 1.2 : 1.6) * s;
    const lean = (R() - 0.5) * 0.12;
    const bark = kind === 'pine' ? '#5E4532' : '#6E4E36';
    ch.trunks.add(new THREE.CylinderGeometry(0.1 * s, 0.19 * s, h + 0.4, 9, 3), bark, { pos: [x, y + h / 2 - 0.15, z], rot: [lean, R() * 6, lean * 0.6] }, { mat: 'wood' });
    ch.trunks.add(new THREE.SphereGeometry(0.24 * s, 9, 6), bark, { pos: [x, y + 0.02, z], scale: [1, 0.35, 1] }, { mat: 'wood' });
    // roots spreading into the ground
    for (let i = 0; i < 4; i++) {
      const a = R() * Math.PI * 2;
      ch.trunks.add(new THREE.CapsuleGeometry(0.06 * s, 0.35 * s, 2, 6), bark, { pos: [x + Math.cos(a) * 0.2 * s, y + 0.02, z + Math.sin(a) * 0.2 * s], rot: [0, -a, Math.PI / 2 - 0.25] }, { mat: 'wood' });
    }
    if (kind === 'pine') {
      const greens = ['#2F5A3A', '#3A6A44', '#2B5135', '#456F49'];
      for (let i = 0; i < 4; i++) {
        const cy = y + h + 0.1 + i * 0.75 * s, r = (1.25 - i * 0.26) * s;
        const c = new THREE.Vector3(x, cy, z);
        ch.blobs.add(pineTier(r * 0.85, 1.1 * s, R() * 6.28), '#1F3B27', { pos: [x, cy + 0.2 * s, z], rot: [0, R() * 6.28, 0] }, { mat: 'foliage' });
        this.addCards(ch, 'needle', c, r, 0.55 * s, r, Math.round(46 * r * r), 0.62 * s, greens);
      }
      return;
    }
    const greens = kind === 'blossom' ? ['#F2B3C2', '#F7C7D2', '#E996AC', '#FAD6DF'] : ['#4F7F3A', '#5E8E42', '#6E9B47', '#46733A', '#7AA552'];
    const inner = kind === 'blossom' ? '#C98097' : '#355B2C';
    const blobs = [[0, 2.0, 0, 1.0], [0.6, 1.7, 0.25, 0.7], [-0.5, 1.75, -0.3, 0.68], [-0.1, 2.6, 0.1, 0.62], [0.2, 2.1, -0.6, 0.55]];
    for (const [bx, by, bz, br] of blobs) {
      const c = new THREE.Vector3(x + bx * s, y + by * s, z + bz * s), r = br * s;
      ch.blobs.add(noiseRock(R, 1), inner, { pos: [c.x, c.y, c.z], scale: [r * 0.8, r * 0.7, r * 0.8] }, { mat: 'foliage' });
      this.addCards(ch, kind === 'blossom' ? 'blossom' : 'leaf', c, r, r * 0.86, r, Math.round(70 * r * r), 0.62 * s, greens);
      if (bx || bz) {
        const dir = new THREE.Vector3(bx, by - 1.3, bz).normalize();
        const len = Math.hypot(bx, by - 1.3, bz) * s;
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x + (bx * s) / 2, y + 1.3 * s + ((by - 1.3) * s) / 2, z + (bz * s) / 2), q, new THREE.Vector3(1, 1, 1));
        ch.trunks.add(new THREE.CylinderGeometry(0.04 * s, 0.08 * s, len, 6), '#6E4E36', m, { mat: 'wood' });
      }
    }
  }

  // slender white birch with dark marks and a light, airy crown
  birch(ch, x, y, z, s) {
    const R = this.R;
    const h = 3.2 * s, lean = (R() - 0.5) * 0.1;
    ch.trunks.add(new THREE.CylinderGeometry(0.07 * s, 0.12 * s, h, 8, 4), '#E9E4D8', { pos: [x, y + h / 2 - 0.1, z], rot: [lean, R() * 6, lean] }, { mat: 'wood' });
    for (let i = 0; i < 7; i++) {
      const yy = y + 0.3 + R() * (h - 0.6), a = R() * Math.PI * 2;
      ch.trunks.add(new THREE.BoxGeometry(0.06 * s, 0.025, 0.05 * s), '#2C2622', { pos: [x + Math.cos(a) * 0.1 * s, yy, z + Math.sin(a) * 0.1 * s], rot: [0, -a, 0] }, { mat: 'paint' });
    }
    const greens = ['#8DB255', '#9DC062', '#7EA548', '#B5CD6E'];
    for (const [bx, by, bz, br] of [[0, 0.95, 0, 0.7], [0.35, 0.78, 0.2, 0.5], [-0.3, 0.82, -0.2, 0.5], [0, 1.15, 0.1, 0.45]]) {
      const c = new THREE.Vector3(x + bx * s, y + by * h, z + bz * s), r = br * s * 1.2;
      this.addCards(ch, 'birch', c, r, r * 1.2, r, Math.round(60 * r * r), 0.5 * s, greens);
    }
  }

  bush(x, y, z, s = 1, flowers = false) {
    const ch = this.chunk(x, z);
    const R = this.R;
    const greens = ['#4F7F3A', '#5E8E42', '#6E9B47', '#46733A'];
    for (const [bx, bz, br] of [[0, 0, 0.5], [0.35, 0.12, 0.38], [-0.3, -0.1, 0.36]]) {
      const c = new THREE.Vector3(x + bx * s, y + br * 0.55 * s, z + bz * s), r = br * s;
      ch.blobs.add(noiseRock(R, 1), '#2F5228', { pos: [c.x, c.y, c.z], scale: [r * 0.85, r * 0.65, r * 0.85] }, { mat: 'foliage' });
      this.addCards(ch, 'leaf', c, r, r * 0.75, r, Math.round(60 * r * r) + 4, 0.34 * s, greens);
      if (flowers) this.addCards(ch, 'blossom', c, r * 1.02, r * 0.8, r * 1.02, 5, 0.22 * s, ['#F7B9C4', '#FFE08A', '#FFF3DC']);
    }
  }

  // a clump of fern fronds arching out from the middle
  fern(x, y, z, s = 1) {
    const ch = this.chunk(x, z), R = this.R;
    const n = 6 + Math.floor(R() * 4);
    const center = new THREE.Vector3(x, y - 0.25 * s, z);
    const greens = ['#4E7A34', '#5C8A3C', '#46702E', '#6A9444'];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + R() * 0.5, tilt = 0.75 + R() * 0.45;
      const len = (0.32 + R() * 0.2) * s;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, a, 0, 'YXZ'));
      const pos = new THREE.Vector3(0, len / 2, 0).applyQuaternion(q).add(new THREE.Vector3(x, y, z));
      ch.cards.fern.push({ pos, q, s: len, center, color: greens[Math.floor(R() * greens.length)] });
    }
  }

  // fallen leaves lying flat on the ground
  litter(x, y, z, s = 0.12) {
    const ch = this.chunk(x, z), R = this.R;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (R() - 0.5) * 0.3, R() * 6.28, 0, 'YXZ'));
    ch.cards.litter.push({ pos: new THREE.Vector3(x, y + 0.012, z), q, s: s * (0.7 + R() * 0.6), center: new THREE.Vector3(x, y - 1, z), color: ['#B5772F', '#9C5A28', '#C99A3C', '#7E6A2C', '#A84A2A'][Math.floor(R() * 5)] });
  }

  rock(x, y, z, s = 1, color = '#A49A8C', squash = 0.65, moss = 0) {
    const ch = this.chunk(x, z);
    let g = noiseRock(this.R, s > 1.2 ? 3 : 2);
    if (moss > 0) g = mossy(g, color, '#56743A', moss);
    ch.rocks.add(g, moss > 0 ? null : color, { pos: [x, y + s * squash * 0.35, z], rot: [this.R() * 0.4, this.R() * 6, this.R() * 0.3], scale: [s, s * squash, s * (0.8 + this.R() * 0.4)] }, { mat: 'rock' });
  }

  // small stones (instanced: one shape, many copies)
  pebble(x, y, z, s = 0.1, color = '#8E857A') {
    this.chunk(x, z).pebbles.push({ x, y, z, s, color, r: this.R() * 6.28 });
  }

  build(scene) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const mats = {};
    const matFor = (kind) => (mats[kind] ||= cardMaterial(leafTexture(kind === 'needle' ? 'needle' : kind), this.wind, kind === 'litter' ? 0 : kind === 'fern' ? 0.6 : 1));
    const pebGeo = noiseRock(rng(77), 1);
    pebGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pebGeo.attributes.position.count * 3).fill(1), 3));
    const m = new THREE.Matrix4(), col = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const [key, ch] of this.chunks) {
      const group = new THREE.Group();
      group.name = 'foliage ' + key;
      const small = new THREE.Group();
      const [kx, kz] = key.split(',').map(Number);
      small.userData.cx = (kx + 0.5) * CHUNK;
      small.userData.cz = (kz + 0.5) * CHUNK;
      group.add(small);
      this.small.push(small);
      const add = (b, opts) => { if (!b.empty) group.add(b.build(opts)); };
      add(ch.trunks, { castShadow: true, outline: true });
      add(ch.blobs, { castShadow: true, outline: true });
      add(ch.rocks, { castShadow: true, outline: true });
      for (const [kind, list] of Object.entries(ch.cards)) {
        if (!list.length) continue;
        const geo = quad.clone();
        const centers = new Float32Array(list.length * 3);
        list.forEach((c, i) => centers.set([c.center.x, c.center.y, c.center.z], i * 3));
        geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(centers, 3));
        const im = new THREE.InstancedMesh(geo, matFor(kind), list.length);
        list.forEach((c, i) => {
          m.compose(c.pos, c.q, sc.set(c.s, c.s, c.s));
          im.setMatrixAt(i, m);
          im.setColorAt(i, col.set(c.color));
        });
        im.castShadow = kind !== 'litter';
        im.receiveShadow = true;
        im.userData.noAO = true;
        im.computeBoundingSphere();
        (kind === 'fern' || kind === 'litter' ? small : group).add(im);
      }
      if (ch.pebbles.length) {
        const im = new THREE.InstancedMesh(pebGeo, REAL.stone, ch.pebbles.length);
        ch.pebbles.forEach((p, i) => {
          q.setFromEuler(e.set(0, p.r, 0));
          m.compose(v.set(p.x, p.y + p.s * 0.2, p.z), q, sc.set(p.s, p.s * 0.55, p.s * 0.85));
          im.setMatrixAt(i, m);
          im.setColorAt(i, col.set(p.color));
        });
        im.receiveShadow = true;
        im.computeBoundingSphere();
        registerMesh(im, 'stone');
        small.add(im);
      }
      scene.add(group);
      this.groups.push(group);
    }
  }

  update(t) { this.wind.value = t; }

  // hide the small stuff in chunks well beyond where you could see it (saves a lot of draw calls in the big forest)
  cull(x, z, range = 70) {
    const r = range + CHUNK * 0.71;
    for (const g of this.small) g.visible = Math.hypot(g.userData.cx - x, g.userData.cz - z) < r;
  }
}

export { noiseRock, mossy };
