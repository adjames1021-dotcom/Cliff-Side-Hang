// Landmarks and set dressing: lighthouse, windmill, far mountains, balloon, gulls,
// pools of lamplight, foam around the sea stacks and drifting blossom petals.
import * as THREE from 'three';
import { C, MAT, Builder, rbox, sphere, capsule, torus, lathe, roundCyl, toonMaterial, rng } from './toon.js';
import { L, terrainHeight, groundHeight } from './world.js';

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  for (const [o, col] of stops) r.addColorStop(o, col);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
const POOL = radialTexture([[0, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]);

function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

// Soft cone of light; brightest at the lamp, fading along its length and at its edges.
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOn: { value: 0 } },
    vertexShader: /* glsl */`
      varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOn;
      varying float vAlong; varying vec3 vN; varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(vAlong, 1.8) * pow(facing, 1.5) * uOn * 0.55;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function buildScenery(scene, world, fx) {
  const R = rng(321);
  const parts = {};

  // ---------- lighthouse on the big sea stack ----------
  {
    const lh = L.lighthouse;
    const b = new Builder(), glow = new Builder();
    b.add(roundCyl(1.3, 0.55, 0.15, 28), C.stone, { pos: [0, 0, 0] });
    const segs = 5, y0 = 0.5, H = 5.5;
    for (let i = 0; i < segs; i++) {
      const r0 = 1.0 - (0.28 * i) / segs, r1 = 1.0 - (0.28 * (i + 1)) / segs;
      b.add(roundCyl(r0, H / segs + 0.02, 0.03, 26, r1), i % 2 ? C.pumpkin : C.cream2, { pos: [0, y0 + (H / segs) * i, 0] });
    }
    b.add(rbox(0.55, 0.95, 0.2, 0.1), C.cocoa, { pos: [0.95, 0.95, 0], rot: [0, Math.PI / 2, 0] });
    b.add(roundCyl(1.1, 0.16, 0.06, 28), C.honeyDark, { pos: [0, y0 + H, 0] });
    b.add(torus(1.0, 0.045, 6, 32), C.cocoa, { pos: [0, y0 + H + 0.5, 0], rot: [Math.PI / 2, 0, 0] }, { outline: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.add(capsule(0.03, 0.42, 2, 5), C.cocoa, { pos: [Math.cos(a) * 1.0, y0 + H + 0.32, Math.sin(a) * 1.0] }, { outline: false });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.add(capsule(0.04, 0.9, 2, 5), C.cocoa, { pos: [Math.cos(a) * 0.57, y0 + H + 0.62, Math.sin(a) * 0.57] }, { outline: false });
    }
    b.add(lathe([[0.72, 0], [0.64, 0.2], [0.36, 0.48], [0.08, 0.66], [0, 0.7]], 22), C.pumpkin, { pos: [0, y0 + H + 1.1, 0] });
    b.add(sphere(0.12, 10, 8), C.butter, { pos: [0, y0 + H + 1.85, 0] });
    for (const [y, a] of [[1.9, 0.4], [3.5, -0.6]]) glow.add(rbox(0.3, 0.42, 0.14, 0.07), C.butter, { pos: [Math.cos(a) * 0.93, y, Math.sin(a) * 0.93], rot: [0, -a + Math.PI / 2, 0] });
    glow.add(roundCyl(0.55, 0.92, 0.1, 20), C.butter, { pos: [0, y0 + H + 0.16, 0] });
    const g = b.build({ castShadow: false });
    const gg = glow.build({ material: MAT.glow, outline: false });
    const root = new THREE.Group();
    root.position.set(lh.x, lh.y, lh.z);
    root.add(g, gg);
    // two beams sweeping round at night
    const beamMat = beamMaterial('#FFE9B0');
    const cone = new THREE.ConeGeometry(4.5, 55, 28, 1, true).translate(0, -27.5, 0).rotateZ(Math.PI / 2);
    const beams = new THREE.Group();
    beams.position.set(0, y0 + H + 0.62, 0);
    for (const r of [0, Math.PI]) {
      const m = new THREE.Mesh(cone, beamMat);
      m.rotation.y = r;
      m.rotation.z = -0.05;
      m.renderOrder = 4;
      m.frustumCulled = false;
      beams.add(m);
    }
    const lamp = glowSprite('#FFE6A8', 7);
    lamp.position.copy(beams.position);
    root.add(beams, lamp);
    scene.add(root);
    parts.lighthouse = { beams, beamMat, lamp };
  }

  // ---------- windmill on the north hill ----------
  {
    const wm = L.windmill;
    const y = Math.min(...[[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([dx, dz]) => terrainHeight(wm.x + dx, wm.z + dz))) - 0.3;
    const b = new Builder(), glow = new Builder();
    b.add(lathe([[1.65, 0], [1.6, 0.25], [1.3, 4.6], [1.18, 5.3], [0, 5.3]], 24), C.cream2);
    b.add(lathe([[1.42, 0], [1.3, 0.45], [0.9, 1.15], [0.3, 1.55], [0, 1.6]], 20), C.pumpkin, { pos: [0, 5.15, 0] });
    b.add(rbox(0.8, 1.3, 0.3, 0.12), C.honeyDark, { pos: [0, 0.95, 1.5] });
    b.add(roundCyl(1.75, 0.3, 0.1, 24), C.stoneDark, { pos: [0, -0.05, 0] });
    b.add(sphere(0.3, 12, 10), C.cocoa, { pos: [0, 5.75, 1.35] });
    glow.add(rbox(0.45, 0.55, 0.16, 0.08), C.butter, { pos: [0, 3.4, 1.38], rot: [-0.06, 0, 0] });
    glow.add(rbox(0.4, 0.5, 0.16, 0.08), C.butter, { pos: [1.2, 2.2, 0.75], rot: [0, 1.0, 0] });
    const root = new THREE.Group();
    root.position.set(wm.x, y, wm.z);
    root.rotation.y = 0.15;
    root.add(b.build({ castShadow: true }), glow.build({ material: MAT.glow, outline: false }));
    const sb = new Builder();
    for (let i = 0; i < 4; i++) {
      sb.group({ rot: [0, 0, (i * Math.PI) / 2] }, (g) => {
        g.add(rbox(0.2, 4.4, 0.14, 0.06), C.honeyDark, { pos: [0, 2.3, 0] });
        g.add(rbox(1.05, 3.1, 0.07, 0.05), i % 2 ? C.cream2 : C.pink, { pos: [0.6, 2.75, -0.02] });
        for (let k = 0; k < 4; k++) g.add(rbox(1.1, 0.05, 0.1, 0.02), C.honeyDark, { pos: [0.6, 1.4 + k * 0.9, 0.02] }, { outline: false });
      });
    }
    const sails = sb.build({ castShadow: false });
    sails.position.set(0, 5.75, 1.55);
    root.add(sails);
    scene.add(root);
    parts.sails = sails;
  }

  // ---------- painted mountain ranges far away (hazed by hand, not by fog) ----------
  {
    const ranges = [];
    for (const [R0, base, amp, seed, col, cap] of [[340, 46, 34, 1.7, '#A99CC8', '#F2E4EE'], [285, 30, 24, 4.2, '#9FB4C8', '#F7EEE4']]) {
      const pos = [], cols = [], idx = [];
      const N = 180, a0 = -Math.PI * 0.66, a1 = Math.PI * 0.66;
      const cBase = new THREE.Color(col), cCap = new THREE.Color(cap), cMid = cBase.clone().lerp(cCap, 0.35);
      for (let i = 0; i <= N; i++) {
        const a = a0 + ((a1 - a0) * i) / N;
        const edge = Math.min(1, Math.min(i, N - i) / 22);
        const n = Math.sin(a * 5.3 + seed) * 0.5 + Math.sin(a * 11.7 + seed * 2) * 0.28 + Math.sin(a * 23.1 + seed * 3) * 0.12;
        const peak = Math.pow(Math.max(0, n * 0.5 + 0.55), 1.6);
        const h = (base + amp * peak) * (edge * edge * (3 - 2 * edge));
        const x = Math.cos(a) * R0 + 15, z = Math.sin(a) * R0;
        for (const [k, c] of [[-0.25, cBase], [0.62, cMid], [1, cCap]]) {
          pos.push(x, k < 0 ? -25 : h * k, z);
          const cc = k === 1 && peak < 0.45 ? cMid : c;
          cols.push(cc.r, cc.g, cc.b);
        }
        if (i) {
          const p = (i - 1) * 3, q = i * 3;
          idx.push(p, q, p + 1, p + 1, q, q + 1, p + 1, q + 1, p + 2, p + 2, q + 1, q + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uHaze: { value: new THREE.Color() }, uAmt: { value: 0.5 } },
        vertexShader: 'varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uHaze; uniform float uAmt; varying vec3 vC; void main(){ gl_FragColor = vec4(mix(vC, uHaze, uAmt), 1.0);\n#include <colorspace_fragment>\n}',
        vertexColors: true, side: THREE.DoubleSide, fog: false,
      });
      const m = new THREE.Mesh(g, mat);
      m.frustumCulled = false;
      m.renderOrder = -5;
      scene.add(m);
      ranges.push({ mat, amt: R0 > 300 ? 0.5 : 0.34 });
    }
    parts.ranges = ranges;
  }

  // ---------- hot air balloon drifting far off ----------
  {
    const b = new Builder(), glow = new Builder();
    const env = [[0, -0.2], [1.2, 0.4], [2.6, 2.2], [2.9, 4.2], [2.4, 6.0], [1.2, 7.1], [0, 7.4]];
    const stripes = [C.pink, C.butter, C.blue, C.cream2, C.apricot, C.sage, C.pink, C.butter];
    for (let i = 0; i < stripes.length; i++) {
      b.add(new THREE.LatheGeometry(env.map(([x, y]) => new THREE.Vector2(x, y)), 4, (i / stripes.length) * Math.PI * 2, (Math.PI * 2) / stripes.length), stripes[i], {});
    }
    b.add(rbox(1.3, 0.9, 1.3, 0.2), C.honey, { pos: [0, -2.4, 0] });
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) b.add(capsule(0.04, 2.0, 2, 5), C.cocoa, { pos: [x, -1.0, z], rot: [z * 0.25, 0, -x * 0.25] }, { outline: false });
    glow.add(sphere(0.25, 10, 8), C.apricot, { pos: [0, -0.9, 0] });
    const g = new THREE.Group();
    g.add(b.build({ castShadow: false }), glow.build({ material: MAT.glow, outline: false }));
    const burner = glowSprite('#FFB866', 3);
    burner.position.set(0, -0.8, 0);
    g.add(burner);
    g.scale.setScalar(1.4);
    scene.add(g);
    parts.balloon = { g, burner };
  }

  // ---------- gulls over the sea ----------
  {
    const N = 7;
    const body = new THREE.InstancedMesh(sphere(0.22, 10, 8).scale(0.8, 0.7, 1.7), toonMaterial({ color: '#FFF8EE' }), N);
    const wingGeo = capsule(0.07, 0.75, 2, 6).rotateZ(Math.PI / 2).translate(0.42, 0, 0).scale(1, 0.5, 1.6);
    const wings = new THREE.InstancedMesh(wingGeo, toonMaterial({ color: '#F4ECE4' }), N * 2);
    body.frustumCulled = wings.frustumCulled = false;
    scene.add(body, wings);
    const gulls = Array.from({ length: N }, (_, i) => ({ cx: -32 - R() * 14, cz: -10 + R() * 30, r: 6 + R() * 9, h: -2 + R() * 7, sp: (0.25 + R() * 0.2) * (R() > 0.5 ? 1 : -1), ph: R() * 10 }));
    parts.gulls = { body, wings, gulls };
  }

  // ---------- pools of lamplight on the ground (night) ----------
  {
    const geos = [];
    const add = (x, z, r) => {
      const y = groundHeight(x, z) + 0.03;
      geos.push(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).translate(x, y, z));
    };
    for (const p of world.lampPosts) add(p.x, p.z, 2.6);
    add(11, -8.2, 3.2);
    add(0, -13.7, 1.9); // stays on the stage boards so it never hangs in the air
    const merged = mergeQuads(geos);
    const mat = new THREE.MeshBasicMaterial({ map: POOL, color: '#FFD98A', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, fog: false });
    const pools = new THREE.Mesh(merged, mat);
    pools.renderOrder = 2;
    scene.add(pools);
    parts.pools = mat;
  }

  // ---------- foam lapping at the sea stacks ----------
  {
    const rings = [];
    for (const [x, z, s] of L.seaStacks) {
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(new THREE.RingGeometry(s * 0.95, s * 1.25, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#FFF8EC', transparent: true, opacity: 0.6, depthWrite: false, fog: true }));
        m.position.set(x, L.seaY + 0.04 + k * 0.01, z);
        m.scale.set(1.2, 1, 1);
        scene.add(m);
        rings.push({ m, ph: k * 0.5 + R() });
      }
    }
    parts.rings = rings;
  }

  let petalT = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  return {
    update(dt, t, roomSec, env) {
      const night = env.night;
      // lighthouse
      const L1 = parts.lighthouse;
      const on = THREE.MathUtils.smoothstep(night, 0.25, 0.75);
      L1.beams.rotation.y = roomSec * 0.45;
      L1.beamMat.uniforms.uOn.value = on;
      L1.beams.visible = on > 0.01;
      L1.lamp.material.opacity = 0.25 + on * 0.75;
      // windmill
      parts.sails.rotation.z = -roomSec * 0.35;
      // mountains take on the sky's colour at the horizon
      for (const r of parts.ranges) {
        r.mat.uniforms.uHaze.value.copy(env.horizon);
        r.mat.uniforms.uAmt.value = r.amt + night * 0.2;
      }
      // balloon on a slow loop, the same for everyone
      const B = parts.balloon;
      const a = roomSec * 0.006;
      B.g.position.set(-35 + Math.cos(a) * 95, 38 + Math.sin(roomSec * 0.05) * 3, Math.sin(a) * 80);
      B.g.rotation.y = roomSec * 0.02;
      const puff = (Math.sin(roomSec * 0.7) > 0.6 ? 1 : 0.35) * (0.4 + night * 0.6);
      B.burner.material.opacity = puff;
      // gulls glide in lazy circles by day
      const G = parts.gulls, show = 1 - THREE.MathUtils.smoothstep(night, 0.4, 0.8);
      G.gulls.forEach((gl, i) => {
        const ang = t * gl.sp + gl.ph;
        const x = gl.cx + Math.cos(ang) * gl.r, z = gl.cz + Math.sin(ang) * gl.r, y = gl.h + Math.sin(t * 0.6 + gl.ph) * 0.8;
        const heading = Math.atan2(-Math.sin(ang) * gl.sp, Math.cos(ang) * gl.sp);
        const bank = -Math.sign(gl.sp) * 0.35;
        e.set(0, heading, bank, 'YXZ');
        q.setFromEuler(e);
        sc.setScalar(show || 0.0001);
        m4.compose(v.set(x, y, z), q, sc);
        G.body.setMatrixAt(i, m4);
        const flapping = Math.sin(t * 0.5 + gl.ph * 3) > 0.55;
        const flap = flapping ? Math.sin(t * 9 + i) * 0.55 : 0.18;
        for (let s = 0; s < 2; s++) {
          e.set(0, heading + s * Math.PI, (s ? -bank : bank) + flap, 'YXZ');
          q.setFromEuler(e);
          m4.compose(v.set(x, y + 0.05, z), q, sc);
          G.wings.setMatrixAt(i * 2 + s, m4);
        }
      });
      G.body.instanceMatrix.needsUpdate = true;
      G.wings.instanceMatrix.needsUpdate = true;
      // pools of light, foam
      parts.pools.opacity = THREE.MathUtils.smoothstep(night, 0.2, 0.8) * 0.4;
      for (const r of parts.rings) {
        const k = (t * 0.25 + r.ph) % 1;
        r.m.scale.set(1.05 + k * 0.5, 1, 1.05 + k * 0.5);
        r.m.material.opacity = 0.65 * (1 - k);
      }
      // blossom petals drifting near you
      if (env.focus && night < 0.6) {
        petalT -= dt;
        if (petalT <= 0) {
          petalT = 0.2;
          const near = world.blossoms.filter((b) => Math.hypot(b.x - env.focus.x, b.z - env.focus.z) < 22);
          if (near.length) {
            const b = near[Math.floor(Math.random() * near.length)];
            fx.emit('petal', { x: b.x + (Math.random() - 0.5) * 1.6 * b.s, y: b.y + Math.random() * 0.6, z: b.z + (Math.random() - 0.5) * 1.6 * b.s });
          }
        }
      }
    },
  };
}

function mergeQuads(list) {
  const pos = [], uv = [], idx = [];
  let base = 0;
  for (const g of list) {
    const p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    for (const i of g.index.array) idx.push(base + i);
    base += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
