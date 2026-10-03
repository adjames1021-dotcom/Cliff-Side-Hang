// Toon materials, ink outlines and geometry helpers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REAL, STYLE, guessKind, registerMesh, registerOutline } from './materials.js';

export const C = {
  cream: '#F8E8C8', cream2: '#FFF3DC', apricot: '#F4A646', pumpkin: '#E8893A',
  pink: '#F7B9C4', sage: '#AFCB9C', blue: '#AFD6EC', butter: '#FFE08A',
  honey: '#D9A35F', honeyDark: '#B9824E', honeyLight: '#E8C08A',
  ink: '#4B2E1D', eye: '#3A2418', leaf: '#8DBA7A', leafDark: '#76A866',
  rose: '#E98A9B', stone: '#EAD7B7', stoneDark: '#D9BF98', berry: '#E2645A',
  lilac: '#D9C2EE', cocoa: '#8E5B3E', white: '#FFFAF0',
};

// ---------- gradient + materials ----------

// Four warm steps: the darkest stays light and rosy instead of grey.
function makeGradient() {
  const steps = [[0.52, 0.42, 0.46], [0.72, 0.62, 0.62], [0.91, 0.86, 0.81], [1, 1, 1]];
  const data = new Uint8Array(16);
  steps.forEach((s, i) => {
    data[i * 4] = s[0] * 255; data[i * 4 + 1] = s[1] * 255; data[i * 4 + 2] = s[2] * 255; data[i * 4 + 3] = 255;
  });
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
export const GRADIENT = makeGradient();

// Use the full RGB of the gradient map so shade steps can be tinted.
const rgbGradientChunk = THREE.ShaderChunk.gradientmap_pars_fragment.replace(
  'return vec3( texture2D( gradientMap, coord ).r );',
  'return texture2D( gradientMap, coord ).rgb;'
);

export function toonMaterial(opts = {}) {
  const { onShader, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, ...rest });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <gradientmap_pars_fragment>', rgbGradientChunk);
    if (onShader) onShader(s);
  };
  m.customProgramCacheKey = () => 'toonrgb' + (onShader ? onShader.key || 'x' : '');
  return m;
}

// Shared material for everything built from vertex-coloured parts.
export const MAT = {
  toon: toonMaterial({ vertexColors: true }),
  // Bulbs, windows and flames: unlit (and over-bright at night) so they glow and bloom.
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
};
STYLE.toon = MAT.toon;

// ---------- ink outlines ----------

export const outlineUniforms = {
  uRes: { value: new THREE.Vector2(1280, 720) },
  uThickness: { value: 2.2 },
  uInk: { value: new THREE.Color(C.ink) },
};

export const outlineMaterial = new THREE.ShaderMaterial({
  uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...outlineUniforms },
  vertexShader: /* glsl */`
    attribute vec3 smoothNormal;
    uniform vec2 uRes;
    uniform float uThickness;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vec4 clip = projectionMatrix * mvPosition;
      vec3 vn = normalize(normalMatrix * smoothNormal);
      vec2 dir = (projectionMatrix * vec4(vn, 0.0)).xy;
      float len = length(dir);
      dir = len > 1e-5 ? dir / len : vec2(0.0);
      // Constant pixel width that thins gently with distance.
      float fade = mix(1.0, 0.35, smoothstep(4.0, 70.0, clip.w));
      clip.xy += dir * uThickness * fade / uRes * 2.0 * clip.w;
      gl_Position = clip;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uInk;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(uInk, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
  side: THREE.BackSide,
  fog: true,
});

// Averages normals of vertices that share a position so hulls don't split at hard edges.
export function addSmoothNormals(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const acc = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = [0, 0, 0]));
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('smoothNormal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// ---------- shapes (all soft and rounded) ----------

export const rbox = (w, h, d, r = 0.08, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export const sphere = (r, ws = 18, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const capsule = (r, len, cs = 5, rs = 14) => new THREE.CapsuleGeometry(r, len, cs, rs);
export const torus = (r, t, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

export function lathe(pts, segs = 20) {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(x, 0), y)), segs);
}

// Cylinder with rounded top and bottom edges, base at y=0.
export function roundCyl(r, h, bevel = 0.05, segs = 20, rTop = r) {
  const b = Math.min(bevel, h / 2, r, rTop);
  const pts = [[0, 0]];
  for (let i = 0; i <= 4; i++) {
    const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
    pts.push([r - b + Math.cos(a) * b, b + Math.sin(a) * b]);
  }
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    pts.push([rTop - b + Math.cos(a) * b, h - b + Math.sin(a) * b]);
  }
  pts.push([0, h]);
  return lathe(pts, segs);
}

// ---------- part builder ----------

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function matrixOf({ pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  _p.set(pos[0], pos[1], pos[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ'));
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

function prepGeo(geo, matrix, color) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const keepColor = color === null && g.attributes.color; // null colour: keep the geometry's own vertex colours
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && !(keepColor && name === 'color')) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (matrix) g.applyMatrix4(matrix);
  if (keepColor) return g;
  const col = new THREE.Color(color);
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Collects coloured parts, then merges them into one mesh plus one outline hull.
export class Builder {
  constructor() { this.parts = []; this.base = null; }

  // Everything added while inside `group(matrix, fn)` is transformed by matrix.
  group(m, fn) {
    const prev = this.base;
    const mm = m.isMatrix4 ? m : matrixOf(m);
    this.base = prev ? prev.clone().multiply(mm) : mm;
    fn(this);
    this.base = prev;
    return this;
  }

  // mat: which surface this part is (wood, stone, fur...); guessed from the colour if left out.
  add(geo, color, t = {}, { outline = true, mat } = {}) {
    let m = t.isMatrix4 ? t : matrixOf(t);
    if (this.base) m = this.base.clone().multiply(m);
    this.parts.push({ geo: prepGeo(geo, m, color), outline, mat: mat || guessKind(color) });
    return this;
  }

  get empty() { return this.parts.length === 0; }

  geometry() { return mergeGeometries(this.parts.map((p) => p.geo)); }

  outlineGeometry() {
    const list = this.parts.filter((p) => p.outline).map((p) => {
      const g = p.geo.clone();
      g.deleteAttribute('color');
      return addSmoothNormals(g);
    });
    return list.length ? mergeGeometries(list) : null;
  }

  // Returns a Group: one merged mesh per kind of surface, plus the ink outline (toon style only).
  build({ material = null, outline = true, castShadow = false, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    if (this.empty) return group;
    const make = (geo, mat, kind) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
      if (kind) registerMesh(mesh, kind);
      return mesh;
    };
    if (material) {
      make(this.geometry(), material, material === MAT.glow ? 'glow' : null);
    } else {
      const byKind = new Map();
      for (const p of this.parts) {
        if (!byKind.has(p.mat)) byKind.set(p.mat, []);
        byKind.get(p.mat).push(p.geo);
      }
      for (const [kind, geos] of byKind) make(geos.length > 1 ? mergeGeometries(geos) : geos[0], REAL[kind] || REAL.paint, kind);
    }
    if (outline) {
      const og = this.outlineGeometry();
      if (og) {
        const o = new THREE.Mesh(og, outlineMaterial);
        o.raycast = () => {};
        group.add(o);
        registerOutline(o);
      }
    }
    group.userData.mesh = group.children[0];
    return group;
  }
}

// Soft round blob shadow texture shared by characters and props.
let blobTex = null;
export function blobShadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grd.addColorStop(0, 'rgba(90,50,40,0.42)');
  grd.addColorStop(0.6, 'rgba(90,50,40,0.25)');
  grd.addColorStop(1, 'rgba(90,50,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.colorSpace = THREE.SRGBColorSpace;
  return blobTex;
}

export function blobShadow(size = 0.9) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  );
  m.renderOrder = 1;
  return m;
}

export function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

export const hash = (x, z) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// Seeded random for stable layouts.
export function rng(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
