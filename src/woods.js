// The woods: forest, trail dressing, the creek and its waterfall, the footbridge,
// and places worth hiking to (summit, falls, cabin, ruins, fairy glen, meadow).
import * as THREE from 'three';
import { Builder, rbox, sphere, capsule, torus, lathe, roundCyl, rng, MAT } from './toon.js';
import { DETAIL, registerMesh } from './materials.js';
import { W, TRAILS, CREEK, BRIDGE, trailAt, creekAt, wildWater } from './wilds.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- a carved wooden sign ----------
export function signBoard(lines, w = 1.2, h = 0.34, { bg = '#7A5434', ink = '#F6E7C8', arrow = 0 } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round((512 * h) / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  // wood grain
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(40,22,10,${0.08 + Math.random() * 0.1})`; g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * c.height;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(c.width * 0.3, y + 6, c.width * 0.6, y - 6, c.width, y + 2); g.stroke();
  }
  const lh = c.height / lines.length;
  g.font = `600 ${Math.round(lh * 0.62)}px Fredoka, "Trebuchet MS", sans-serif`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  lines.forEach((t, i) => {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(t, c.width / 2 + 2, lh * (i + 0.5) + 3);
    g.fillStyle = ink; g.fillText(t, c.width / 2, lh * (i + 0.5) + 1);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const shape = new THREE.Shape();
  const hw = w / 2, hh = h / 2, tip = arrow ? 0.14 : 0;
  shape.moveTo(-hw, -hh); shape.lineTo(hw - (arrow > 0 ? 0 : 0), -hh);
  if (arrow > 0) { shape.lineTo(hw, -hh); shape.lineTo(hw + tip, 0); shape.lineTo(hw, hh); } else shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  if (arrow < 0) { shape.lineTo(-hw - tip, 0); }
  shape.lineTo(-hw, -hh);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
  geo.translate(0, 0, -0.02);
  // map the face uvs to the board
  const p = geo.attributes.position, uv = geo.attributes.uv, nr = geo.attributes.normal;
  // the back of the board reads the right way round too
  for (let i = 0; i < p.count; i++) { const u = (p.getX(i) + hw) / w; uv.setXY(i, nr.getZ(i) < -0.5 ? 1 - u : u, (p.getY(i) + hh) / h); }
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  document.fonts?.ready.then(() => {
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.font = `600 ${Math.round(lh * 0.62)}px Fredoka, "Trebuchet MS", sans-serif`;
    lines.forEach((t, i) => { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(t, c.width / 2 + 2, lh * (i + 0.5) + 3); g.fillStyle = ink; g.fillText(t, c.width / 2, lh * (i + 0.5) + 1); });
    tex.needsUpdate = true;
  });
  return mesh;
}

// ---------- flowing water (creek, waterfall pool outflow) ----------
function flowMaterial(time) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.08, transparent: true, opacity: 0.88, ior: 1.33, depthWrite: false });
  m.userData.envK = 1.4;
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.uniforms.uNoise = { value: DETAIL };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aFlow;\nvarying vec3 vFlow;\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFlow = aFlow;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D uNoise;\nvarying vec3 vFlow;\nvarying vec3 vWP;\nfloat fn(vec2 p) { return texture2D(uNoise, p).r; }')
      // vFlow: x across (0..1), y along (metres), z steepness
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float speed = 0.6 + vFlow.z * 3.0;
        vec2 fp = vec2(vFlow.x * 0.35, vFlow.y * 0.18 - uTime * speed * 0.18);
        float n = fn(fp) * 0.6 + fn(fp * 2.3 + 0.37) * 0.4;
        float edge = 1.0 - smoothstep(0.0, 0.18, min(vFlow.x, 1.0 - vFlow.x));
        float foam = clamp(smoothstep(0.55, 0.85, n + vFlow.z * 0.6 + edge * 0.35) * (0.4 + vFlow.z), 0.0, 1.0);
        diffuseColor.rgb = mix(vec3(0.16, 0.27, 0.22), vec3(0.3, 0.42, 0.36), n);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.95, 0.95), foam);
        diffuseColor.a = mix(0.72, 0.95, foam) * smoothstep(0.0, 0.06, min(vFlow.x, 1.0 - vFlow.x));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.06, 0.7, foam);')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          float e = 0.012;
          vec2 g = vec2(fn(fp + vec2(e, 0.0)) - fn(fp), fn(fp + vec2(0.0, e)) - fn(fp)) * (5.0 + vFlow.z * 6.0);
          normal = normalize(normal + (viewMatrix * vec4(-g.x, 0.0, -g.y, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'creek-flow';
  return m;
}

// A ribbon of water following a polyline of [x, z, surfaceY].
function ribbon(pts, widthAt) {
  const pos = [], flow = [], idx = [], nrm = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z, y] = pts[i];
    const [x0, z0] = pts[Math.max(0, i - 1)], [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    const w = widthAt(i);
    const prevY = pts[Math.max(0, i - 1)][2], nextY = pts[Math.min(pts.length - 1, i + 1)][2];
    const steep = Math.min(1, Math.abs(prevY - nextY) / (Math.hypot(dx, dz) || 1) * 6);
    for (const s of [-1, 1]) {
      pos.push(x + nx * w * s, y, z + nz * w * s);
      nrm.push(0, 1, 0);
      flow.push(s < 0 ? 0 : 1, along, steep);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 3));
  g.setIndex(idx);
  return g;
}

// Falling water: a sheet bowing out from the lip, with streaks pouring down it.
function fallMaterial(time) {
  const m = new THREE.MeshStandardMaterial({ color: '#EAF4F6', roughness: 0.35, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.uniforms.uNoise = { value: DETAIL };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vFallUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvFallUv = uv;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform sampler2D uNoise;\nvarying vec2 vFallUv;')
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec2 q = vec2(vFallUv.x * 3.0, vFallUv.y * 0.6 + uTime * 1.4);
        float streak = texture2D(uNoise, vec2(q.x, q.y * 0.25)).r * 0.65 + texture2D(uNoise, q * vec2(2.0, 0.5) + 0.3).r * 0.35;
        float side = smoothstep(0.0, 0.12, vFallUv.x) * smoothstep(1.0, 0.88, vFallUv.x);
        diffuseColor.a = clamp(smoothstep(0.3, 0.75, streak) * 0.85 + 0.25, 0.0, 1.0) * side;
        diffuseColor.rgb *= mix(0.8, 1.08, streak);`);
  };
  m.customProgramCacheKey = () => 'waterfall';
  return m;
}
export function fallSheet(top, bottom, width, out = 0.6, segs = 14) {
  // top/bottom: Vector3 (centre of lip and of splash), the sheet faces along `dir`
  const g = new THREE.PlaneGeometry(width, 1, 6, segs);
  const p = g.attributes.position;
  const dir = new THREE.Vector3(bottom.x - top.x, 0, bottom.z - top.z);
  const run = dir.length(); dir.normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / width, v = 0.5 - p.getY(i); // v: 0 at the lip, 1 at the bottom
    const fall = v * v; // accelerating
    const x = top.x + side.x * u * width * (1 + v * 0.25) + dir.x * (run * v + Math.sin(v * Math.PI) * out);
    const z = top.z + side.z * u * width * (1 + v * 0.25) + dir.z * (run * v + Math.sin(v * Math.PI) * out);
    const y = THREE.MathUtils.lerp(top.y, bottom.y, fall * 0.85 + v * 0.15);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- the plan: where the trees go ----------
export function planWoods({ terrainHeight, avoid }) {
  const R = rng(4242);
  const trees = [];
  const step = 2.6;
  for (let gx = -18; gx < 72; gx += step) for (let gz = -72; gz < 72; gz += step) {
    const x = gx + R() * step * 0.9, z = gz + R() * step * 0.9;
    if (x < -17.6) continue;
    if (Math.abs(z) < 20.8 && x < 20.8) continue; // the village
    // denser the further you go from the village, with glades here and there
    const far = Math.min(1, Math.max(0, (Math.hypot(Math.max(0, x - 19.5), Math.max(0, Math.abs(z) - 19.5)) - 6) / 25));
    const dens = 0.42 + 0.3 * far + 0.3 * Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + 0.18 * Math.sin(x * 0.31 - z * 0.27);
    if (R() > dens) continue;
    const tr = trailAt(x, z);
    if (tr && tr.d < 2.4) continue;
    const c = creekAt(x, z);
    if (c && c.d < c.hw + 1.4) continue;
    if (Math.hypot(x - W.meadow.x, z - W.meadow.z) < W.meadow.r + 1) continue;
    if (Math.hypot(x - W.pool.x, z - W.pool.z) < W.pool.r + 2.2) continue;
    if (avoid(x, z)) continue;
    const y = terrainHeight(x, z);
    const n = Math.sin(x * 0.07 - z * 0.05) * 0.5 + 0.5;
    let kind = y > 5.5 || n > 0.72 ? 'pine' : (c && c.d < 7) || (n < 0.18 && R() < 0.6) ? 'birch' : 'round';
    if (kind === 'round' && R() < 0.05) kind = 'blossom';
    // a mix of ages: saplings, ordinary trees and big old ones
    const age = R();
    const s = age < 0.2 ? 0.5 + R() * 0.2 : age > 0.85 ? 1.55 + R() * 0.5 : (kind === 'pine' ? 1.0 : 0.95) + R() * 0.5;
    trees.push({ x, z, y, s, kind });
  }
  // pines climbing the mountains round the edge (just scenery: you can't get up there)
  for (let gx = -18; gx < 96; gx += 4.2) for (let gz = -96; gz < 96; gz += 4.2) {
    const x = gx + R() * 3.5, z = gz + R() * 3.5;
    const edge = Math.max(x - 72.5, Math.abs(z) - 72.5);
    if (edge < 0 || edge > 22 || x < -17.6 || R() > 0.62 - edge * 0.012) continue;
    trees.push({ x, z, y: terrainHeight(x, z), s: 1.1 + R() * 0.6, kind: R() < 0.85 ? 'pine' : 'round', far: true });
  }
  return trees;
}

// where the fallen trees ended up (filled in by buildWoods)
export const FALLEN = [];

// ---------- build everything ----------
export function buildWoods(ctx) {
  const { scene, fol, terrainHeight, avoid = () => false, nearHome = () => false, circle, seats, lampGlows, smokeSpots, G, windows, trees, time } = ctx;
  const R = rng(5150);
  const b = new Builder(); // structures
  const near = (x, z, list, r) => list.some((p) => Math.hypot(p.x - x, p.z - z) < r);

  // ---- forest ----
  for (const t of trees) {
    fol.tree(t.x, t.y - 0.05, t.z, t.s, t.kind);
    if (!t.far) circle(t.x, t.z, t.kind === 'birch' ? 0.18 : 0.22 * t.s + 0.08);
  }
  // undergrowth: ferns and bushes under the canopy, mossy rocks, stumps
  const nearTrees = trees.filter((t) => !t.far);
  for (let i = 0; i < 1900; i++) {
    const t = nearTrees[Math.floor(R() * nearTrees.length)];
    if (!t) break;
    const a = R() * Math.PI * 2, r = 1.0 + R() * 2.6;
    const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    const tr = trailAt(x, z);
    if ((tr && tr.d < 1.3) || wildWater(x, z) || (creekAt(x, z)?.d ?? 99) < 2) continue;
    const y = terrainHeight(x, z);
    if (i % 3 === 0) fol.fern(x, y, z, 0.8 + R() * 0.5);
    else if (i % 7 === 1) fol.bush(x, y, z, 0.6 + R() * 0.4, R() < 0.2);
    else if (i % 11 === 2) { fol.rock(x, y - 0.2, z, 0.35 + R() * 0.7, ['#8F8A80', '#7E796F', '#99928A'][i % 3], 0.6, 0.8); circle(x, z, 0.4); }
    else if (i % 13 === 3) {
      b.add(roundCyl(0.2 + R() * 0.1, 0.35, 0.04, 12), '#6A4B33', { pos: [x, y - 0.05, z] }, { mat: 'wood' });
      b.add(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2), '#C9A77A', { pos: [x, y + 0.305, z] }, { mat: 'wood', outline: false });
      circle(x, z, 0.3);
    } else if (i % 5 === 4) fol.fern(x, y, z, 0.6 + R() * 0.3);
  }
  // little mushroom clusters on the forest floor (just for looks)
  for (let i = 0; i < 70; i++) {
    const t = nearTrees[Math.floor(R() * nearTrees.length)];
    if (!t) break;
    const a = R() * Math.PI * 2, x = t.x + Math.cos(a) * 0.6, z = t.z + Math.sin(a) * 0.6;
    const y = terrainHeight(x, z);
    for (let k = 0; k < 3; k++) {
      const mx = x + (R() - 0.5) * 0.25, mz = z + (R() - 0.5) * 0.25, h = 0.05 + R() * 0.05;
      b.add(capsule(0.012, h, 2, 6), '#EFE6D2', { pos: [mx, y + h / 2, mz] }, { mat: 'paint', outline: false });
      b.add(sphere(0.035, 10, 6), '#B8865A', { pos: [mx, y + h + 0.01, mz], scale: [1, 0.55, 1] }, { mat: 'paint', outline: false });
    }
  }

  // ---- trail dressing: edge stones, leaf litter, steps, markers ----
  const COLORS = { east: '#E8893A', summit: '#C8434F', ridge: '#3E7CB1', hamlet: '#E8C14A', meadow: '#7FB24E', south: '#2E9C9A', creekside: '#2E9C9A', cabin: '#8E5B3E', ruins: '#9A8F80', fairy: '#C78BD9' };
  for (const tr of TRAILS) {
    const line = tr.line;
    let sinceStep = 0, sinceMark = 12;
    for (let i = 0; i < line.length - 1; i++) {
      const [x, z, h] = line[i], [x2, z2, h2] = line[i + 1];
      const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      const inVillage = Math.abs(z) < 19.5 && x < 19.5 && x > -19;
      // stones lining both edges
      for (const s of [-1, 1]) {
        if (R() < 0.55) {
          const o = 0.95 + R() * 0.35, px = x + nx * o * s + (R() - 0.5) * 0.4, pz = z + nz * o * s + (R() - 0.5) * 0.4;
          fol.pebble(px, terrainHeight(px, pz) - 0.02, pz, 0.07 + R() * 0.11, ['#8E857A', '#7D766D', '#A0968A', '#6F6A63'][Math.floor(R() * 4)]);
        }
      }
      // gravel and fallen leaves on the tread
      if (!inVillage) {
        for (let k = 0; k < 3; k++) {
          const o = (R() - 0.5) * 1.5, px = x + nx * o + dx * R(), pz = z + nz * o + dz * R();
          if (R() < 0.6) fol.litter(px, terrainHeight(px, pz), pz, 0.09 + R() * 0.06);
          else fol.pebble(px, terrainHeight(px, pz) - 0.015, pz, 0.025 + R() * 0.03, ['#A69A88', '#8A8074'][k % 2]);
        }
      }
      // timber steps where the trail climbs
      sinceStep += l;
      const slope = Math.abs(h2 - h) / l;
      if (slope > 0.11 && sinceStep > 0.9 && !inVillage) {
        sinceStep = 0;
        const yaw = Math.atan2(dx, dz);
        const y = Math.min(h, h2);
        b.add(rbox(1.5, 0.13, 0.14, 0.03), '#5B4130', { pos: [x, y + 0.02, z], rot: [0, yaw, 0] }, { mat: 'wood' });
        for (const s of [-0.8, 0.8]) b.add(capsule(0.03, 0.18, 2, 6), '#4A3424', { pos: [x + nx * s, y + 0.05, z + nz * s] }, { mat: 'wood' });
      }
      // waymarker posts with the trail's colour band
      sinceMark += l;
      if (sinceMark > 34 && !inVillage && i > 4) {
        sinceMark = 0;
        const px = x + nx * 1.3, pz = z + nz * 1.3, y = terrainHeight(px, pz);
        b.add(rbox(0.12, 0.85, 0.12, 0.02), '#6E4E36', { pos: [px, y + 0.38, pz] }, { mat: 'wood' });
        b.add(rbox(0.13, 0.12, 0.13, 0.01), COLORS[tr.id] || '#C8434F', { pos: [px, y + 0.7, pz] }, { mat: 'paint', outline: false });
        b.add(lathe([[0, 0], [0.09, 0], [0, 0.08]], 4), '#5B4130', { pos: [px, y + 0.8, pz], rot: [0, Math.PI / 4, 0] }, { mat: 'wood' });
        circle(px, pz, 0.12);
      }
    }
  }

  // ---- signposts at the junctions ----
  const signs = [
    { x: 16.4, z: -4.9, yaw: 0.2, boards: [['Woodland Loop', 1], ['Village', -1]] },
    { x: 31.6, z: -3.6, yaw: 0.0, boards: [['Summit  ·  0.4 km', 1], ['Falls  ·  0.3 km', -1], ['Cabin', 1]] },
    { x: 40.4, z: -21, yaw: -0.4, boards: [['Summit', 1], ['Meadow', -1]] },
    { x: 37.4, z: 20.3, yaw: 0.3, boards: [['Mossfall Falls', 1], ['Old Ruins', 1], ['Village', -1]] },
    { x: 20.6, z: 33.2, yaw: 0.0, boards: [['Fairy Glen', 1], ['Village', -1]] },
    { x: -1.6, z: -33.2, yaw: 0.5, boards: [['Windmill Way', -1], ['Ridge Walk', 1]] },
    { x: 2.2, z: 21.6, yaw: Math.PI, boards: [['Creekside Walk', 1]] },
    { x: -10.4, z: -18.6, yaw: Math.PI / 2, boards: [['Windmill Way', 1]] },
  ];
  for (const sg of signs) {
    const y = terrainHeight(sg.x, sg.z);
    b.add(roundCyl(0.07, 2.0, 0.02, 10), '#5B4130', { pos: [sg.x, y - 0.1, sg.z] }, { mat: 'wood' });
    b.add(lathe([[0, 0], [0.1, 0], [0, 0.1]], 8), '#4A3424', { pos: [sg.x, y + 1.9, sg.z] }, { mat: 'wood' });
    sg.boards.forEach(([text, dir], i) => {
      const m = signBoard([text], 1.25, 0.26, { arrow: dir });
      m.position.set(sg.x, y + 1.62 - i * 0.32, sg.z);
      m.rotation.y = sg.yaw + (i % 2 ? 0.35 : -0.2);
      m.translateX(dir * 0.62);
      scene.add(m);
    });
    circle(sg.x, sg.z, 0.15);
  }

  // ---- benches and logs to rest on ----
  const benchAt = (x, z, yaw, id) => {
    const y = terrainHeight(x, z);
    b.group({ pos: [x, y, z], rot: [0, yaw, 0] }, (g) => {
      g.add(capsule(0.2, 1.3, 4, 12), '#7A5434', { pos: [0, 0.3, 0], rot: [0, 0, Math.PI / 2] }, { mat: 'wood' });
      g.add(rbox(1.5, 0.06, 0.32, 0.02), '#8E6640', { pos: [0, 0.5, 0] }, { mat: 'wood' });
      for (const sx of [-0.55, 0.55]) g.add(rbox(0.14, 0.32, 0.4, 0.04), '#5B4130', { pos: [sx, 0.12, 0] }, { mat: 'wood' });
    });
    for (const lx of [-0.4, 0.4]) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const sx = x + lx * c, sz = z - lx * s;
      seats.push({ id: `${id}-${lx < 0 ? 0 : 1}`, kind: 'log', x: sx, y: y + 0.55, z: sz, yaw });
      circle(sx, sz, 0.3);
    }
  };

  // ---- summit: paved top, cairn, flag, benches, a view finder ----
  {
    const s = W.summit, y = terrainHeight(s.x, s.z);
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 3.8;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      fol.pebble(x, terrainHeight(x, z) - 0.05, z, 0.08 + R() * 0.12, ['#7E776D', '#6F695F', '#8A8276'][i % 3]);
    }
    // cairn of stacked stones
    let cy = y;
    for (let i = 0; i < 7; i++) {
      const r = 0.42 - i * 0.05;
      b.add(sphere(r, 12, 8), ['#8F8678', '#A1978A', '#7D756B'][i % 3], { pos: [s.x + 2 + (R() - 0.5) * 0.06, cy + r * 0.35, s.z - 1.6], scale: [1, 0.42, 0.9], rot: [0, R() * 3, (R() - 0.5) * 0.15] }, { mat: 'stone' });
      cy += r * 0.62;
    }
    circle(s.x + 2, s.z - 1.6, 0.5);
    // flag
    b.add(roundCyl(0.035, 3.2, 0.01, 8), '#C9C3B8', { pos: [s.x - 1.8, y, s.z - 1.8] }, { mat: 'metal' });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55, 10, 4), new THREE.MeshStandardMaterial({ color: '#E8893A', side: THREE.DoubleSide, roughness: 0.85 }));
    flag.position.set(s.x - 1.8 + 0.46, y + 2.85, s.z - 1.8);
    flag.castShadow = true;
    scene.add(flag);
    ctx.flags.push(flag);
    circle(s.x - 1.8, s.z - 1.8, 0.12);
    // view finder on a stone plinth
    b.add(roundCyl(0.3, 0.9, 0.06, 14), '#9A9184', { pos: [s.x + 0.6, y, s.z + 2.2] }, { mat: 'stone' });
    b.add(roundCyl(0.42, 0.06, 0.02, 24, 0.42), '#B08D57', { pos: [s.x + 0.6, y + 0.9, s.z + 2.2], rot: [-0.25, 0, 0] }, { mat: 'metal' });
    circle(s.x + 0.6, s.z + 2.2, 0.35);
    const plate = signBoard(['Summit  ·  ' + Math.round(y + 8) + ' m'], 1.1, 0.24, { bg: '#5B4130' });
    plate.position.set(s.x + 0.6, y + 1.0, s.z + 2.62); plate.rotation.x = -0.3;
    scene.add(plate);
    benchAt(s.x - 2.6, s.z + 1.4, 2.2, 'summit-a');
    benchAt(s.x + 2.4, s.z + 0.8, -2.3, 'summit-b');
  }

  // ---- Mossfall Falls: rock wall, falling water, pool, mist ----
  {
    const p = W.pool, up = CREEK.upper[CREEK.upper.length - 1];
    const lip = { x: up[0], z: up[1], y: up[2] };
    // the crescent of rock the water spills over
    for (let i = 0; i < 26; i++) {
      const a = -1.5 + (i / 25) * 3.0 + (R() - 0.5) * 0.15;
      const r = p.r + 1.2 + R() * 1.4;
      const x = p.x + Math.cos(a) * r * 0.9 + 1.3, z = p.z + Math.sin(a) * r;
      if (Math.hypot(x - lip.x, z - lip.z) < 1.3) continue;
      const s = 0.7 + R() * 1.0;
      fol.rock(x, terrainHeight(x, z) - s * 0.3, z, s, ['#7E786E', '#6F6A62', '#8C857A'][i % 3], 0.85, 0.9);
      circle(x, z, s * 0.7);
    }
    for (const [ox, oz, s] of [[0.9, -0.9, 0.9], [0.9, 0.95, 1.0], [-0.3, -1.4, 0.6], [-0.2, 1.5, 0.65], [1.6, 0, 1.2]]) {
      const x = lip.x + ox, z = lip.z + oz;
      fol.rock(x, lip.y - 1.2 * s, z, s, '#6C675F', 0.95, 1);
    }
    // stones poking out of the pool
    for (let i = 0; i < 6; i++) {
      const a = R() * Math.PI * 2, r = p.r * (0.55 + R() * 0.4);
      fol.rock(p.x + Math.cos(a) * r, p.y - 0.35, p.z + Math.sin(a) * r, 0.3 + R() * 0.35, '#77716A', 0.7, 0.6);
    }
    const top = new THREE.Vector3(lip.x - 0.15, lip.y + 0.06, lip.z);
    const bottom = new THREE.Vector3(p.x + p.r * 0.55, p.y, p.z + 0.2);
    const sheet = new THREE.Mesh(fallSheet(top, bottom, 1.5, 0.35), fallMaterial(time));
    sheet.renderOrder = 3;
    sheet.userData.noAO = true;
    scene.add(sheet);
    ctx.mist.push({ x: bottom.x - 0.2, y: p.y + 0.1, z: bottom.z, rate: 0.12 });
    // ferns round the pool
    for (let i = 0; i < 18; i++) {
      const a = R() * Math.PI * 2, r = p.r + 0.9 + R() * 2.2;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (trailAt(x, z)?.d < 1.3) continue;
      fol.fern(x, terrainHeight(x, z), z, 0.8 + R() * 0.4);
    }
    benchAt(p.x - 4.6, p.z - 3.3, Math.PI * 0.82, 'falls');
    const sg = signBoard(['Mossfall Falls'], 1.3, 0.28, { bg: '#5B4130' });
    const sy = terrainHeight(p.x - 5.6, p.z - 1.2);
    b.add(rbox(0.1, 1.2, 0.1, 0.02), '#5B4130', { pos: [p.x - 5.6, sy + 0.5, p.z - 1.2] }, { mat: 'wood' });
    sg.position.set(p.x - 5.6, sy + 1.15, p.z - 1.2); sg.rotation.y = Math.PI / 2 + 0.6;
    scene.add(sg);
    circle(p.x - 5.6, p.z - 1.2, 0.12);
  }

  // ---- the creek: flowing water ribbons, rocks along the banks ----
  {
    const mat = flowMaterial(time);
    for (const [name, pts] of [['upper', CREEK.upper], ['lower', CREEK.lower]]) {
      const n = pts.length;
      const geo = ribbon(pts.map(([x, z, y]) => [x, z, y + 0.01]), (i) => (name === 'upper' ? 0.95 : THREE.MathUtils.lerp(1.3, 1.8, i / n)));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 2;
      mesh.userData.noAO = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      for (let i = 2; i < n - 1; i += 2) {
        const [x, z, y] = pts[i], [x2, z2] = pts[i + 1];
        const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
        const side = R() < 0.5 ? -1 : 1, w = (name === 'upper' ? 0.95 : 1.5) + R() * 0.5;
        const px = x - (dz / l) * w * side, pz = z + (dx / l) * w * side;
        if (Math.hypot(px - BRIDGE.x, pz - BRIDGE.z) < 3) continue;
        if (R() < 0.6) fol.rock(px, y - 0.25, pz, 0.25 + R() * 0.4, ['#7E786E', '#8C857A'][i % 2], 0.7, 0.7);
        else fol.pebble(px, y - 0.05, pz, 0.12 + R() * 0.1, '#8A8276');
        if (R() < 0.3) { const mx = x + (R() - 0.5) * 0.8, mz = z + (R() - 0.5) * 0.8; fol.rock(mx, y - 0.32, mz, 0.22 + R() * 0.15, '#6F6A62', 0.6, 0.5); }
      }
      // reeds and ferns on the banks
      for (let i = 3; i < n - 2; i += 5) {
        const [x, z, y] = pts[i];
        const a = R() * Math.PI * 2, r = 2.2 + R() * 1.5;
        const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
        if (wildWater(fx, fz) || trailAt(fx, fz)?.d < 1.2) continue;
        fol.fern(fx, terrainHeight(fx, fz), fz, 0.7 + R() * 0.4);
      }
    }
    // the creek pours off the clifftop into the sea
    const end = CREEK.lower[CREEK.lower.length - 1];
    const cliffSheet = new THREE.Mesh(fallSheet(new THREE.Vector3(end[0] + 0.3, end[2], end[1]), new THREE.Vector3(end[0] - 2.4, -8.0, end[1] + 0.2), 2.4, 0.9, 20), fallMaterial(time));
    cliffSheet.renderOrder = 3;
    cliffSheet.userData.noAO = true;
    scene.add(cliffSheet);
    ctx.mist.push({ x: end[0] - 2.6, y: -7.9, z: end[1] + 0.2, rate: 0.1, big: true });
  }

  // ---- footbridge over the creek ----
  {
    const B = BRIDGE, half = B.len / 2;
    const c = Math.cos(B.yaw), s = Math.sin(B.yaw);
    const at = (along, across) => [B.x + s * along + c * across, B.z + c * along - s * across];
    const ends = B.ends || [B.y, B.y];
    const deck = (k) => Math.max(THREE.MathUtils.lerp(ends[0], ends[1], (k + 1) / 2), B.y + 0.35 * (1 - k * k));
    const n = Math.round(B.len / 0.2);
    for (let i = 0; i <= n; i++) {
      const k = -1 + (2 * i) / n, along = k * half;
      const [x, z] = at(along, 0);
      const y = deck(k);
      const slope = (deck(Math.min(1, k + 0.02)) - deck(Math.max(-1, k - 0.02))) / (0.04 * half);
      b.add(rbox(1.7, 0.06, 0.17, 0.015), i % 3 ? '#8E6640' : '#7F5A38', { pos: [x, y - 0.03, z], rot: [-Math.atan(slope) * 0, B.yaw, 0] }, { mat: 'wood' });
    }
    // stringers + rails following the arch
    for (const across of [-0.78, 0.78]) {
      const pts = [], rail = [];
      for (let i = 0; i <= 16; i++) {
        const k = -1 + i / 8, [x, z] = at(k * half, across);
        pts.push(new THREE.Vector3(x, deck(k) - 0.14, z));
        rail.push(new THREE.Vector3(x, deck(k) + 0.95, z));
      }
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 6), '#5B4130', {}, { mat: 'wood' });
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 24, 0.045, 6), '#7A5434', {}, { mat: 'wood' });
      for (let i = 0; i <= 6; i++) {
        const k = -1 + i / 3, [x, z] = at(k * half * 0.96, across);
        const y = deck(k);
        b.add(rbox(0.09, 1.05, 0.09, 0.02), '#5B4130', { pos: [x, y + 0.43, z] }, { mat: 'wood' });
      }
      for (let i = 0; i < 6; i++) {
        const k0 = -1 + i / 3, k1 = k0 + 1 / 3;
        const [x0, z0] = at(k0 * half * 0.96, across), [x1, z1] = at(k1 * half * 0.96, across);
        const y0 = deck(k0) + 0.1, y1 = deck(k1) + 0.88;
        const mid = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        b.add(new THREE.CylinderGeometry(0.025, 0.025, dir.length(), 6), '#6E4E36', new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), { mat: 'wood' });
      }
    }
    // stone abutments
    for (const k of [-1, 1]) {
      const [x, z] = at(k * (half + 0.2), 0);
      b.add(rbox(2.0, 0.9, 0.8, 0.08), '#8F8678', { pos: [x, deck(k) - 0.55, z], rot: [0, B.yaw, 0] }, { mat: 'stone' });
    }
  }

  // ---- the woodcutter's cabin ----
  {
    const cb = W.cabin;
    const y = terrainHeight(cb.x, cb.z) + 0.15;
    const LOG = '#7A5434', LOG2 = '#6A4A2E';
    b.group({ pos: [cb.x, y, cb.z], rot: [0, cb.yaw, 0] }, (g) => {
      // stone footing
      g.add(rbox(4.6, 0.6, 3.9, 0.06), '#857D71', { pos: [0, -0.2, 0] }, { mat: 'stone' });
      // log walls: stacked logs with crossed corners
      for (let i = 0; i < 9; i++) {
        const yy = 0.18 + i * 0.27, col = i % 2 ? LOG : LOG2;
        g.add(capsule(0.14, 4.3, 3, 10), col, { pos: [0, yy, 1.75], rot: [0, 0, Math.PI / 2] }, { mat: 'wood' });
        g.add(capsule(0.14, 4.3, 3, 10), col, { pos: [0, yy, -1.75], rot: [0, 0, Math.PI / 2] }, { mat: 'wood' });
        g.add(capsule(0.14, 3.6, 3, 10), col, { pos: [2.15, yy + 0.13, 0], rot: [Math.PI / 2, 0, 0] }, { mat: 'wood' });
        g.add(capsule(0.14, 3.6, 3, 10), col, { pos: [-2.15, yy + 0.13, 0], rot: [Math.PI / 2, 0, 0] }, { mat: 'wood' });
      }
      // gables + shingle roof
      for (const sx of [-2.15, 2.15]) {
        const tri = new THREE.Shape(); tri.moveTo(-1.85, 0); tri.lineTo(1.85, 0); tri.lineTo(0, 1.35); tri.lineTo(-1.85, 0);
        g.add(new THREE.ExtrudeGeometry(tri, { depth: 0.18, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-0.09, 0, 0), '#8E6640', { pos: [sx, 2.55, 0] }, { mat: 'wood' });
      }
      for (const sd of [-1, 1]) {
        for (let r = 0; r < 7; r++) {
          g.add(rbox(4.9, 0.05, 0.36, 0.01), r % 2 ? '#5C4A3E' : '#4F3F35', { pos: [0, 2.6 + (r + 0.5) * 0.19, sd * (2.05 - (r + 0.5) * 0.3)], rot: [sd * 0.58, 0, 0] }, { mat: 'wood' });
        }
      }
      g.add(rbox(5.0, 0.12, 0.18, 0.03), '#4F3F35', { pos: [0, 3.95, 0] }, { mat: 'wood' });
      // chimney
      g.add(rbox(0.6, 2.4, 0.6, 0.04), '#857D71', { pos: [-1.5, 2.9, -0.9] }, { mat: 'stone' });
      g.add(rbox(0.7, 0.12, 0.7, 0.03), '#6F685F', { pos: [-1.5, 4.12, -0.9] }, { mat: 'stone' });
      // porch on the front (+z)
      g.add(rbox(4.6, 0.12, 1.6, 0.03), '#8E6640', { pos: [0, 0.12, 2.6] }, { mat: 'wood' });
      for (const px of [-2.1, 0, 2.1]) g.add(rbox(0.14, 2.3, 0.14, 0.03), '#6A4A2E', { pos: [px, 1.2, 3.3] }, { mat: 'wood' });
      g.add(rbox(4.7, 0.08, 1.9, 0.02), '#4F3F35', { pos: [0, 2.42, 2.65], rot: [0.18, 0, 0] }, { mat: 'wood' });
      for (const px of [-1.05, 1.05]) g.add(rbox(1.9, 0.07, 0.07, 0.02), '#6A4A2E', { pos: [px, 0.9, 3.3] }, { mat: 'wood' });
      // door + windows
      g.add(rbox(0.9, 1.8, 0.08, 0.02), '#5B4130', { pos: [0.6, 1.08, 1.86] }, { mat: 'wood' });
      g.add(sphere(0.04, 8, 6), '#C9A24A', { pos: [0.95, 1.05, 1.92] }, { mat: 'metal', outline: false });
      g.add(rbox(0.8, 0.7, 0.06, 0.02), '#1E2A30', { pos: [-1.2, 1.45, 1.86] }, { mat: 'glossy', outline: false });
      g.add(rbox(0.94, 0.84, 0.05, 0.02), '#E9E1D0', { pos: [-1.2, 1.45, 1.89] }, { mat: 'paint' });
      g.add(rbox(0.04, 0.7, 0.06, 0.01), '#E9E1D0', { pos: [-1.2, 1.45, 1.92] }, { mat: 'paint', outline: false });
      g.add(rbox(1.0, 0.3, 0.3, 0.04), '#6A4A2E', { pos: [-1.2, 0.95, 2.02] }, { mat: 'wood' });
      for (let i = 0; i < 4; i++) g.add(sphere(0.08, 8, 6), ['#E98A9B', '#FFE08A', '#F4A646'][i % 3], { pos: [-1.55 + i * 0.23, 1.15, 2.05] }, { mat: 'paint', outline: false });
    });
    windows.group({ pos: [cb.x, y, cb.z], rot: [0, cb.yaw, 0] }, (g) => g.add(rbox(0.76, 0.66, 0.02, 0.01), '#FFE08A', { pos: [-1.2, 1.45, 1.94] }));
    const c = Math.cos(cb.yaw), s = Math.sin(cb.yaw);
    const W2 = (lx, lz) => [cb.x + lx * c + lz * s, cb.z - lx * s + lz * c];
    // colliders around the walls
    for (let lx = -2.0; lx <= 2.01; lx += 0.8) for (const lz of [-1.6, 1.6]) { const [x, z] = W2(lx, lz); circle(x, z, 0.5); }
    for (let lz = -1.2; lz <= 1.21; lz += 0.8) for (const lx of [-2.0, 2.0]) { const [x, z] = W2(lx, lz); circle(x, z, 0.5); }
    for (const px of [-2.1, 0, 2.1]) { const [x, z] = W2(px, 3.3); circle(x, z, 0.12); }
    const [chx, chz] = W2(-1.5, -0.9);
    smokeSpots.push(new THREE.Vector3(chx, y + 4.4, chz));
    const [lwx, lwz] = W2(-1.2, 1.95);
    lampGlows.push({ p: new THREE.Vector3(lwx, y + 1.45, lwz), size: 1.4, color: '#FFE08A' });
    // porch lantern
    const [lx, lz] = W2(1.6, 3.15);
    G.add(sphere(0.09, 10, 8), '#FFE08A', { pos: [lx, y + 2.05, lz] });
    lampGlows.push({ p: new THREE.Vector3(lx, y + 2.05, lz), size: 1.2, color: '#FFE08A' });
    ctx.lamps.push({ x: lx, y: y + 2.0, z: lz });
    // rocking chairs on the porch
    for (const px of [-1.4, 0.9]) {
      const [x, z] = W2(px, 2.85);
      const yaw = cb.yaw;
      b.group({ pos: [x, y + 0.18, z], rot: [0, yaw, 0] }, (g) => {
        g.add(rbox(0.55, 0.06, 0.5, 0.02), '#8E6640', { pos: [0, 0.42, 0] }, { mat: 'wood' });
        g.add(rbox(0.55, 0.6, 0.06, 0.02), '#8E6640', { pos: [0, 0.75, -0.24], rot: [-0.15, 0, 0] }, { mat: 'wood' });
        for (const sx of [-0.25, 0.25]) {
          g.add(torus(0.42, 0.025, 4, 16, 1.1), '#6A4A2E', { pos: [sx, 0.42, 0], rot: [0, Math.PI / 2, Math.PI + 1.0] }, { mat: 'wood' });
          g.add(rbox(0.04, 0.4, 0.04, 0.01), '#6A4A2E', { pos: [sx, 0.22, 0.18] }, { mat: 'wood' });
          g.add(rbox(0.04, 0.4, 0.04, 0.01), '#6A4A2E', { pos: [sx, 0.22, -0.18] }, { mat: 'wood' });
        }
        g.add(rbox(0.5, 0.06, 0.46, 0.02), '#C9737A', { pos: [0, 0.47, 0.02] }, { mat: 'fabric' });
      });
      seats.push({ id: `cabin-chair-${px < 0 ? 0 : 1}`, kind: 'bench', x, y: y + 0.18 + 0.5, z, yaw });
    }
    // woodpile and chopping block
    {
      const [x, z] = W2(3.1, -0.6);
      for (let row = 0; row < 4; row++) for (let k = 0; k < 6 - row; k++) {
        const [lx2, lz2] = [3.1, -1.6 + k * 0.32 + row * 0.16];
        const [wx, wz] = W2(lx2, lz2);
        b.add(capsule(0.14, 0.9, 2, 8), k % 2 ? '#8E6640' : '#7A5434', { pos: [wx, y - 0.05 + 0.15 + row * 0.26, wz], rot: [0, cb.yaw, Math.PI / 2] }, { mat: 'wood' });
      }
      circle(x, z, 0.8); const [x2, z2] = W2(3.1, -1.4); circle(x2, z2, 0.7);
      const [bx, bz] = W2(3.2, 1.4);
      b.add(roundCyl(0.32, 0.5, 0.04, 14), '#7A5434', { pos: [bx, y - 0.15, bz] }, { mat: 'wood' });
      b.add(new THREE.CircleGeometry(0.31, 14).rotateX(-Math.PI / 2), '#C9A77A', { pos: [bx, y + 0.355, bz] }, { mat: 'wood', outline: false });
      b.add(capsule(0.025, 0.6, 2, 6), '#8E6640', { pos: [bx + 0.1, y + 0.62, bz], rot: [0, 0, 0.5] }, { mat: 'wood' });
      b.add(rbox(0.04, 0.16, 0.14, 0.01), '#9AA0A6', { pos: [bx + 0.02, y + 0.4, bz] }, { mat: 'metal' });
      circle(bx, bz, 0.35);
    }
  }

  // ---- old ruins: crumbling walls, an arch and a well ----
  {
    const r = W.ruins;
    const y0 = terrainHeight(r.x, r.z);
    const STONES = ['#9A9184', '#8A8276', '#A79E90', '#7D756B'];
    const wall = (x0, z0, x1, z1, hmax) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      const n = Math.round(len / 0.55);
      for (let i = 0; i < n; i++) {
        const k = (i + 0.5) / n, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
        const h = Math.max(1, Math.round(hmax * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + x0))) / 0.32));
        const gy = terrainHeight(x, z) - 0.1;
        for (let j = 0; j < h; j++) {
          b.add(rbox(0.52 + (R() - 0.5) * 0.08, 0.3, 0.5, 0.05), STONES[(i + j) % 4], { pos: [x + (R() - 0.5) * 0.04, gy + 0.15 + j * 0.31, z], rot: [0, yaw + Math.PI / 2 + (R() - 0.5) * 0.06, 0] }, { mat: 'stone' });
        }
        if (R() < 0.35) fol.addCards(fol.chunk(x, z), 'leaf', new THREE.Vector3(x, gy + h * 0.31, z), 0.4, 0.3, 0.4, 6, 0.3, ['#3F6B2E', '#4E7A34', '#365E28']);
        circle(x, z, 0.32);
      }
    };
    wall(r.x - 3, r.z - 3, r.x + 3, r.z - 3, 2.2);
    wall(r.x - 3, r.z - 3, r.x - 3, r.z + 1.2, 1.6);
    wall(r.x + 3, r.z - 3, r.x + 3, r.z + 2.4, 1.2);
    // the arch, still standing
    const ax = r.x, az = r.z + 3.2, ay = terrainHeight(ax, az);
    for (const sx of [-1.1, 1.1]) for (let j = 0; j < 6; j++) b.add(rbox(0.5, 0.3, 0.55, 0.05), STONES[j % 4], { pos: [ax + sx, ay + 0.15 + j * 0.31, az] }, { mat: 'stone' });
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i / 8) * Math.PI;
      b.add(rbox(0.36, 0.5, 0.55, 0.05), STONES[i % 4], { pos: [ax + Math.cos(a) * 1.1, ay + 1.95 + Math.sin(a) * 1.1, az], rot: [0, 0, a - Math.PI / 2] }, { mat: 'stone' });
    }
    circle(ax - 1.1, az, 0.35); circle(ax + 1.1, az, 0.35);
    fol.addCards(fol.chunk(ax, az), 'leaf', new THREE.Vector3(ax - 0.7, ay + 2.6, az), 0.6, 0.5, 0.4, 14, 0.32, ['#3F6B2E', '#4E7A34']);
    // fallen blocks
    for (let i = 0; i < 9; i++) {
      const x = r.x + (R() - 0.5) * 8, z = r.z + (R() - 0.5) * 8;
      b.add(rbox(0.5, 0.3, 0.5, 0.05), STONES[i % 4], { pos: [x, terrainHeight(x, z) + 0.08, z], rot: [(R() - 0.5) * 0.4, R() * 3, (R() - 0.5) * 0.4] }, { mat: 'stone' });
    }
    // a well with a little roof
    const wx = r.x + 0.4, wz = r.z - 0.6, wy = terrainHeight(wx, wz);
    b.add(lathe([[0.62, 0], [0.72, 0], [0.72, 0.75], [0.62, 0.75]], 20), '#8F8678', { pos: [wx, wy - 0.05, wz] }, { mat: 'stone' });
    b.add(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2), '#0E1A1C', { pos: [wx, wy + 0.25, wz] }, { mat: 'glossy', outline: false });
    for (const sx of [-0.66, 0.66]) b.add(rbox(0.08, 1.5, 0.08, 0.02), '#6A4A2E', { pos: [wx + sx, wy + 1.2, wz] }, { mat: 'wood' });
    b.add(capsule(0.05, 1.3, 2, 8), '#6A4A2E', { pos: [wx, wy + 1.55, wz], rot: [0, 0, Math.PI / 2] }, { mat: 'wood' });
    b.add(rbox(1.7, 0.06, 0.7, 0.02), '#5C4A3E', { pos: [wx, wy + 2.05, wz + 0.3], rot: [0.5, 0, 0] }, { mat: 'wood' });
    b.add(rbox(1.7, 0.06, 0.7, 0.02), '#5C4A3E', { pos: [wx, wy + 2.05, wz - 0.3], rot: [-0.5, 0, 0] }, { mat: 'wood' });
    b.add(roundCyl(0.12, 0.18, 0.02, 10), '#7A5434', { pos: [wx, wy + 1.2, wz] }, { mat: 'wood' });
    circle(wx, wz, 0.8);
  }

  // ---- fairy glen: a ring of mushrooms that glow at night ----
  {
    const f = W.fairy;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + R() * 0.2, r = 2.3 + R() * 0.25;
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r, y = terrainHeight(x, z);
      const h = 0.12 + R() * 0.14, cap = 0.08 + R() * 0.06;
      b.add(capsule(0.025, h, 2, 8), '#F1E9D8', { pos: [x, y + h / 2, z] }, { mat: 'paint', outline: false });
      b.add(sphere(cap, 14, 8, 0), '#C8434F', { pos: [x, y + h + 0.02, z], scale: [1, 0.6, 1] }, { mat: 'glossy' });
      for (let k = 0; k < 4; k++) {
        const sa = R() * Math.PI * 2;
        G.add(sphere(0.012, 6, 4), '#F6FFF4', { pos: [x + Math.cos(sa) * cap * 0.6, y + h + 0.02 + cap * 0.45, z + Math.sin(sa) * cap * 0.6] });
      }
    }
    const sy = terrainHeight(f.x, f.z);
    fol.rock(f.x, sy - 0.3, f.z, 0.45, '#8C857A', 1.6, 0.7);
    ctx.fireflySpots.push([f.x, f.z, 4], [W.pool.x, W.pool.z, 5], [W.meadow.x, W.meadow.z, 7]);
    lampGlows.push({ p: new THREE.Vector3(f.x, sy + 0.35, f.z), size: 1.4, color: '#B7F0C8' });
    benchAt(f.x + 3.6, f.z - 2.8, -0.9, 'glen');
  }

  // ---- the meadow: wildflowers ----
  {
    const m = W.meadow;
    const fb = new Builder();
    const cols = ['#F7F2E8', '#FFE08A', '#C78BD9', '#E98A9B', '#8FB7E8', '#F4A646'];
    for (let i = 0; i < 380; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (m.r + 3);
      const x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r;
      if (trailAt(x, z)?.d < 1.1) continue;
      const y = terrainHeight(x, z), h = 0.18 + R() * 0.2;
      fb.add(capsule(0.008, h, 2, 4), '#4E7A34', { pos: [x, y + h / 2, z] }, { mat: 'foliage', outline: false });
      fb.add(sphere(0.045 + R() * 0.02, 8, 5), cols[i % cols.length], { pos: [x, y + h, z], scale: [1, 0.55, 1] }, { mat: 'paint', outline: false });
    }
    scene.add(fb.build({ outline: false }));
    benchAt(m.x - 6.5, m.z + 6.6, 2.4, 'meadow');
  }

  // ---- hollow logs to sit on beside the trails ----
  for (const [tid, frac, side] of [['summit', 0.35, 1], ['ridge', 0.45, -1], ['creekside', 0.3, 1], ['hamlet', 0.4, 1], ['cabin', 0.5, -1], ['south', 0.55, -1]]) {
    const tr = TRAILS.find((t) => t.id === tid);
    const i = Math.floor(tr.line.length * frac);
    const [x, z] = tr.line[i], [x2, z2] = tr.line[i + 1];
    const dx = x2 - x, dz = z2 - z, l = Math.hypot(dx, dz) || 1;
    const px = x - (dz / l) * 1.9 * side, pz = z + (dx / l) * 1.9 * side;
    const tx = dx / l, tz = dz / l;
    const axis = Math.atan2(-tz, tx); // capsule turned so it lies along the trail
    const face = Math.atan2(side * tz, -side * tx); // sitters look at the trail
    const y = terrainHeight(px, pz);
    b.add(capsule(0.24, 1.5, 4, 12), '#6A4B33', { pos: [px, y + 0.18, pz], rot: [0, axis, Math.PI / 2] }, { mat: 'wood' });
    for (const e of [-1, 1]) b.add(new THREE.CircleGeometry(0.21, 12).rotateY(Math.PI / 2), '#C9A77A', { pos: [px + tx * 0.98 * e, y + 0.18, pz + tz * 0.98 * e], rot: [0, axis, 0] }, { mat: 'wood', outline: false });
    fol.fern(px - (dz / l) * 0.7 * side, y, pz + (dx / l) * 0.7 * side, 0.6);
    for (const lx of [-0.4, 0.4]) {
      const sx = px + tx * lx, sz = pz + tz * lx;
      seats.push({ id: `trail-log-${tid}-${lx < 0 ? 0 : 1}`, kind: 'log', x: sx, y: y + 0.42, z: sz, yaw: face });
      circle(sx, sz, 0.3);
    }
  }

  // ---- fallen trees: old mossy trunks lying in the deep woods, roots and all ----
  {
    const standing = trees.filter((t) => !t.far);
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < 24; tries++) {
      const cx = 24 + R() * 46, cz = (R() - 0.5) * 136;
      const yaw = R() * Math.PI, L = 4.5 + R() * 4.5, r = 0.2 + R() * 0.17;
      const ux = Math.cos(yaw), uz = -Math.sin(yaw);
      let ok = !FALLEN.some((f) => Math.hypot(f.x - cx, f.z - cz) < (f.len + L) * 0.5 + 2);
      for (let k = -1; k <= 1.001 && ok; k += 0.25) {
        const x = cx + ux * L * 0.5 * k, z = cz + uz * L * 0.5 * k;
        const tr = trailAt(x, z), c = creekAt(x, z);
        if ((tr && tr.d < 2.6) || (c && c.d < c.hw + 1.5) || wildWater(x, z)) ok = false;
        else if (Math.hypot(x - W.meadow.x, z - W.meadow.z) < W.meadow.r + 1.5 || Math.hypot(x - W.pool.x, z - W.pool.z) < W.pool.r + 3) ok = false;
        else if (Math.max(x - 71, Math.abs(z) - 71) > 0 || Math.max(x - 30, Math.abs(z) - 30) < 0) ok = false; // deep woods only
        else if (avoid(x, z) || nearHome(x, z, 9)) ok = false;
        else if (standing.some((t) => Math.abs(t.x - x) < 1.2 && Math.abs(t.z - z) < 1.2)) ok = false;
      }
      if (!ok) continue;
      const x0 = cx - ux * L / 2, z0 = cz - uz * L / 2, x1 = cx + ux * L / 2, z1 = cz + uz * L / 2;
      const h0 = terrainHeight(x0, z0), h1 = terrainHeight(x1, z1);
      if (Math.abs(h1 - h0) / L > 0.3) continue;
      placed++;
      FALLEN.push({ x: cx, z: cz, yaw, len: L });
      const pitch = Math.atan2(h1 - h0, L), cy = (h0 + h1) / 2 + r * 0.7;
      const bark = ['#5E4A38', '#6B5A48', '#574536'][placed % 3];
      b.group({ pos: [cx, cy, cz], rot: [0, yaw, 0] }, (g) => {
        g.group({ rot: [0, 0, pitch] }, (t) => {
          // the trunk, a moss blanket along its top, and a splintered tip
          t.add(capsule(r, L, 4, 14), bark, { rot: [0, 0, Math.PI / 2] }, { mat: 'wood' });
          for (let k = 0, at = -L * 0.42; k < 3 && at < L * 0.36; k++) {
            const len = L * (0.12 + R() * 0.18);
            t.add(capsule(r * 0.9, len, 4, 12), ['#4F6B2E', '#5A7434', '#465F2A'][k], { pos: [at + len / 2, r * 0.42, (R() - 0.5) * r * 0.3], rot: [0, 0, Math.PI / 2], scale: [0.55, 1, 0.95] }, { mat: 'foliage', outline: false });
            at += len + L * (0.06 + R() * 0.12);
          }
          t.add(lathe([[0, 0], [r * 0.9, 0], [r * 0.5, r * 1.1], [0, r * 1.8]], 9), '#7D6650', { pos: [L / 2 + r * 0.6, 0, 0], rot: [0, 0, -Math.PI / 2] }, { mat: 'wood' });
          // branch stubs
          for (let k = 0; k < 4; k++) {
            const along = (R() - 0.3) * L * 0.7, side = R() < 0.5 ? -1 : 1;
            t.add(capsule(r * 0.22, r * (1.4 + R() * 2.2), 2, 6), bark, { pos: [along, r * 0.35, side * r * 0.9], rot: [side * (1.0 + R() * 0.5), R(), 0] }, { mat: 'wood' });
          }
          // the root plate torn up with the tree, still clotted with earth
          t.add(roundCyl(r * 3.2, r * 0.9, r * 0.4, 14), '#5A4532', { pos: [-L / 2 - r * 0.2, r * 0.6, 0], rot: [0, 0, Math.PI / 2] }, { mat: 'ground' });
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2 + R() * 0.4;
            t.add(capsule(r * 0.16, r * (1.6 + R()), 2, 5), '#4E3A2A', { pos: [-L / 2 - r * 0.45, r * 0.6 + Math.sin(a) * r * 2.6, Math.cos(a) * r * 2.6], rot: [a, 0, 0.4] }, { mat: 'wood' });
          }
        });
      });
      // a hollow where the roots came up, ferns and mushrooms along it, and something to bump into
      for (let k = -0.5; k <= 0.5001; k += 0.9 / Math.max(2, Math.round(L / 0.9))) circle(cx + ux * L * k, cz + uz * L * k, r + 0.08);
      circle(x0 - ux * r * 0.3, z0 - uz * r * 0.3, r * 2.4);
      for (let k = 0; k < 4; k++) {
        const along = (R() - 0.5) * L * 0.8, side = R() < 0.5 ? -1 : 1;
        const fx = cx + ux * along - uz * side * (r + 0.4), fz = cz + uz * along + ux * side * (r + 0.4);
        fol.fern(fx, terrainHeight(fx, fz), fz, 0.6 + R() * 0.4);
      }
      for (let k = 0; k < 3; k++) {
        const along = (R() - 0.5) * L * 0.6, my = cy + (h1 - h0) * along / L + r * 0.8;
        const mx = cx + ux * along - uz * r * 0.7, mz = cz + uz * along + ux * r * 0.7;
        b.add(sphere(0.06, 10, 6), '#C9A77A', { pos: [mx, my, mz], scale: [1, 0.35, 1], rot: [0.9, yaw, 0] }, { mat: 'paint', outline: false });
      }
    }
  }

  const g = b.build({ castShadow: true });
  g.name = 'woods';
  scene.add(g);
}
