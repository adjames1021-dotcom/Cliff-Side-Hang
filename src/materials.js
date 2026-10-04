// Realistic materials: PBR surfaces with procedural surface detail, plus a toon fallback style.
import * as THREE from 'three';

// ---------- procedural detail texture (tileable) ----------
// R: fine noise (plaster, ground, foliage), G: stone cells + cracks, B: wood grain, A: woven fabric.
function makeDetail(size = 256) {
  const N = size;
  const lattice = (p, seed) => {
    const grid = [];
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < p * p; i++) grid.push(rnd());
    return grid;
  };
  const value = (grid, p, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const g = (a, b) => grid[((((b % p) + p) % p) * p) + (((a % p) + p) % p)];
    const a = g(xi, yi), b = g(xi + 1, yi), c = g(xi, yi + 1), d = g(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  // cache lattices per octave for speed
  const cache = new Map();
  const fbmFast = (x, y, oct, base, seed) => {
    let sum = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) {
      const p = base << o, key = p * 1000 + seed + o;
      let grid = cache.get(key);
      if (!grid) cache.set(key, (grid = lattice(p, seed + o * 31)));
      sum += value(grid, p, (x / N) * p, (y / N) * p) * amp;
      tot += amp; amp *= 0.5;
    }
    return sum / tot;
  };
  // tileable voronoi for stones
  const CN = 7;
  let s0 = 9;
  const r0 = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);
  const cells = [];
  for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) cells.push([(i + 0.15 + r0() * 0.7) / CN, (j + 0.15 + r0() * 0.7) / CN, r0()]);
  const cellAt = (i, j) => cells[(((j % CN) + CN) % CN) * CN + (((i % CN) + CN) % CN)];
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (y * N + x) * 4;
    const n = fbmFast(x, y, 5, 4, 3);
    // stone: distance to nearest/second nearest cell (wrapping) => rounded stones with cracks
    const u = x / N, v = y / N;
    let d1 = 9, d2 = 9, id = 0;
    const ci = Math.floor(u * CN), cj = Math.floor(v * CN);
    for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
      const [cx, cy, cid] = cellAt(ci + oi, cj + oj);
      const wx = cx + Math.floor((ci + oi) / CN), wy = cy + Math.floor((cj + oj) / CN);
      const dx = u - wx, dy = v - wy, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = cid; } else if (d < d2) d2 = d;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    const stone = Math.min(1, edge * 9) * (0.75 + id * 0.25) * 0.8 + fbmFast(x, y, 4, 8, 11) * 0.2;
    // wood: long grain lines warped by noise
    const w = Math.sin((v * 22 + fbmFast(x, y, 3, 2, 21) * 3.5) * Math.PI * 2) * 0.5 + 0.5;
    const wood = w * 0.55 + fbmFast(x * 0.25, y * 4, 3, 4, 41) * 0.45;
    // fabric: a soft knit
    const kx = Math.sin(u * Math.PI * 2 * 32) * 0.5 + 0.5, ky = Math.sin(v * Math.PI * 2 * 32 + Math.sin(u * Math.PI * 2 * 32) * 1.2) * 0.5 + 0.5;
    const fabric = kx * 0.5 + ky * 0.5;
    data[k] = n * 255; data[k + 1] = stone * 255; data[k + 2] = wood * 255; data[k + 3] = fabric * 255;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
export const DETAIL = makeDetail();

// ---------- detail patch (triplanar, needs no UVs) ----------
const DETAIL_PARS = /* glsl */`
  uniform sampler2D uDetail;
  uniform vec4 uDetailP; // scale (repeats per metre), bump height (metres), albedo, roughness variation
  varying vec3 vDPos;
  varying vec3 vDNrm;
  vec3 detailW() {
    vec3 w = pow(abs(normalize(vDNrm)), vec3(4.0));
    return w / (w.x + w.y + w.z + 1e-5);
  }
  float detailAt(vec3 p, vec3 w) {
    return texture2D(uDetail, p.yz).DETAIL_CH * w.x + texture2D(uDetail, p.xz).DETAIL_CH * w.y + texture2D(uDetail, p.xy).DETAIL_CH * w.z;
  }
  // smooth bump: compare the height here with the height one pixel over (like three's bump maps)
  vec3 detailBump(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
    vec3 vSigmaX = dFdx(surf_pos);
    vec3 vSigmaY = dFdy(surf_pos);
    vec3 R1 = cross(vSigmaY, surf_norm);
    vec3 R2 = cross(surf_norm, vSigmaX);
    float fDet = dot(vSigmaX, R1) * faceDir;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }
`;

// Patches a built-in material: triplanar detail modulates colour, roughness and normal.
export function addDetail(mat, { ch = 'r', scale = 2, bump = 1, albedo = 0.1, rough = 0.15, space = 'world' } = {}, extra) {
  const prev = mat.onBeforeCompile;
  mat.userData.detail = { value: new THREE.Vector4(scale, bump, albedo, rough) };
  mat.onBeforeCompile = (s, r) => {
    s.uniforms.uDetail = { value: DETAIL };
    s.uniforms.uDetailP = mat.userData.detail;
    s.defines = { ...(s.defines || {}), DETAIL_CH: ch };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDPos;\nvarying vec3 vDNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec4 dp = vec4(transformed, 1.0);
          vec3 dn = objectNormal;
          ${space === 'world' ? `
          #ifdef USE_INSTANCING
            dp = instanceMatrix * dp; dn = mat3(instanceMatrix) * dn;
          #endif
          dp = modelMatrix * dp; dn = mat3(modelMatrix) * dn;` : ''}
          vDPos = dp.xyz; vDNrm = dn;
        }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DETAIL_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 dW = detailW();
        vec3 dP = vDPos * uDetailP.x;
        float dH = detailAt(dP, dW);
        // fade the fine detail out with distance so it never turns into noise
        float dFade = 1.0 - smoothstep(14.0, 60.0, length(vViewPosition) * uDetailP.x);
        diffuseColor.rgb *= mix(1.0, mix(1.0 - uDetailP.z, 1.0 + uDetailP.z, dH), mix(0.35, 1.0, dFade));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0 - uDetailP.w, 1.0 + uDetailP.w, dH), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float dHx = detailAt(dP + dFdx(dP), dW), dHy = detailAt(dP + dFdy(dP), dW);
        normal = detailBump(-vViewPosition, normal, vec2(dHx - dH, dHy - dH) * uDetailP.y * dFade, faceDirection);`);
    if (extra) extra(s, r);
    if (prev) prev(s, r);
  };
  const key = `detail-${ch}-${space}-${extra ? extra.key || 'x' : ''}`;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key + prevKey();
  return mat;
}

const std = (o, d) => addDetail(new THREE.MeshStandardMaterial({ vertexColors: true, ...o }), d);
const phys = (o, d) => (d ? addDetail(new THREE.MeshPhysicalMaterial({ vertexColors: true, ...o }), d) : new THREE.MeshPhysicalMaterial({ vertexColors: true, ...o }));

// One shared material per kind of surface; merged meshes are split by these.
export const REAL = {
  paint: std({ roughness: 0.62 }, { ch: 'r', scale: 2.2, bump: 0.0015, albedo: 0.05, rough: 0.12 }),
  plaster: std({ roughness: 0.9 }, { ch: 'r', scale: 1.3, bump: 0.004, albedo: 0.09, rough: 0.08 }),
  wood: std({ roughness: 0.74 }, { ch: 'b', scale: 1.1, bump: 0.003, albedo: 0.16, rough: 0.12 }),
  stone: std({ roughness: 0.93 }, { ch: 'g', scale: 0.9, bump: 0.012, albedo: 0.2, rough: 0.06 }),
  rock: std({ roughness: 0.97 }, { ch: 'r', scale: 0.45, bump: 0.045, albedo: 0.24, rough: 0.05 }),
  foliage: std({ roughness: 0.82 }, { ch: 'r', scale: 3.2, bump: 0.006, albedo: 0.16, rough: 0.1 }),
  ground: std({ roughness: 0.96 }, { ch: 'r', scale: 1.7, bump: 0.008, albedo: 0.2, rough: 0.04 }),
  fabric: phys({ roughness: 0.95, sheen: 0.7, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff') }, { ch: 'a', scale: 11, bump: 0.0008, albedo: 0.05, rough: 0.05, space: 'object' }),
  fur: phys({ roughness: 0.88, sheen: 0.55, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff6ea') }, { ch: 'r', scale: 18, bump: 0.0003, albedo: 0.04, rough: 0.05, space: 'object' }),
  metal: std({ roughness: 0.36, metalness: 0.72 }, { ch: 'r', scale: 3, bump: 0.0005, albedo: 0.05, rough: 0.2 }),
  glossy: phys({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 }),
  ceramic: phys({ roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.1 }),
  cloth: phys({ roughness: 0.88, sheen: 0.4, sheenRoughness: 0.8, side: THREE.DoubleSide }, { ch: 'a', scale: 6, bump: 0.001, albedo: 0.04, rough: 0.05 }),
  shine: new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.5, 1.5, 1.5) }), // catch-lights in eyes
};

// Guess a surface from the palette colour when a part doesn't say.
const BY_COLOR = {
  '#d9a35f': 'wood', '#b9824e': 'wood', '#e8c08a': 'wood', '#8e5b3e': 'wood',
  '#ead7b7': 'stone', '#d9bf98': 'stone',
  '#8dba7a': 'foliage', '#76a866': 'foliage', '#afcb9c': 'foliage',
  '#4b2e1d': 'metal',
};
export function guessKind(color) {
  return BY_COLOR[String(color).toLowerCase()] || 'paint';
}

// ---------- style switching (realistic <-> toon) ----------
export const STYLE = { name: 'realistic', toon: null, outlines: [], meshes: [] };

export function registerMesh(mesh, kind) {
  mesh.userData.kind = kind;
  mesh.userData.real = mesh.material;
  STYLE.meshes.push(mesh);
  if (STYLE.name === 'toon' && kind !== 'glow' && STYLE.toon) mesh.material = STYLE.toon;
}
export function registerOutline(mesh) {
  STYLE.outlines.push(mesh);
  mesh.visible = STYLE.name === 'toon';
}
export function setStyle(name) {
  STYLE.name = name;
  STYLE.meshes = STYLE.meshes.filter((m) => m.parent);
  STYLE.outlines = STYLE.outlines.filter((m) => m.parent);
  for (const m of STYLE.meshes) {
    if (m.userData.kind === 'glow') continue;
    m.material = name === 'toon' && STYLE.toon ? STYLE.toon : m.userData.real;
  }
  for (const o of STYLE.outlines) o.visible = name === 'toon';
}
