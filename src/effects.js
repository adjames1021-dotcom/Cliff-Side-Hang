// Particle effects: two point clouds (additive glow + normal) sharing one atlas.
import * as THREE from 'three';
import { C } from './toon.js';

const T = { glow: 0, sparkle: 1, heart: 2, note: 3, puff: 4, z: 5, confetti: 6, drop: 7 };

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 64); fn(); g.restore(); };
  const ink = 'rgba(120,70,60,1)';
  cell(T.glow, () => {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 60);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(-64, -64, 128, 128);
  });
  cell(T.sparkle, () => {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 40);
    r.addColorStop(0, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 11 : 50;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  });
  const outlined = (path) => { g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = ink; path(); g.stroke(); g.fillStyle = '#fff'; path(); g.fill(); };
  cell(T.heart, () => outlined(() => {
    g.beginPath(); g.moveTo(0, 40);
    g.bezierCurveTo(-58, 2, -38, -50, 0, -18);
    g.bezierCurveTo(38, -50, 58, 2, 0, 40); g.closePath();
  }));
  cell(T.note, () => outlined(() => {
    g.beginPath();
    g.ellipse(-14, 28, 20, 15, -0.4, 0, Math.PI * 2);
    g.rect(0, -42, 9, 70);
    g.moveTo(5, -42); g.quadraticCurveTo(38, -30, 34, -2); g.quadraticCurveTo(28, -20, 7, -22); g.closePath();
  }));
  cell(T.puff, () => {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 56);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.6, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.fill();
  });
  cell(T.z, () => {
    g.font = '700 92px Fredoka, "Trebuchet MS", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = ink; g.strokeText('z', 0, 4);
    g.fillStyle = '#fff'; g.fillText('z', 0, 4);
  });
  cell(T.confetti, () => outlined(() => { g.beginPath(); g.roundRect(-26, -16, 52, 32, 10); }));
  cell(T.drop, () => outlined(() => {
    g.beginPath(); g.moveTo(0, -42); g.quadraticCurveTo(30, 0, 22, 18); g.arc(0, 18, 22, 0, Math.PI); g.quadraticCurveTo(-30, 0, 0, -42); g.closePath();
  }));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, canvas: c, redraw: () => { tex.needsUpdate = true; } };
}

const vert = /* glsl */`
  attribute float size; attribute vec4 pcolor; attribute float tile;
  uniform float uScale;
  varying vec4 vColor; varying float vTile;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
    vColor = pcolor; vTile = tile;
  }`;
const frag = /* glsl */`
  uniform sampler2D uMap; uniform float uAlpha; uniform vec3 uTint;
  varying vec4 vColor; varying float vTile;
  void main() {
    float col = mod(vTile, 4.0), row = floor(vTile / 4.0);
    vec2 uv = vec2((col + 0.04 + gl_PointCoord.x * 0.92) / 4.0, 1.0 - (row + 0.04 + gl_PointCoord.y * 0.92) / 2.0);
    vec4 t = texture2D(uMap, uv);
    // smoke and dust pick up the evening light; little icons only a touch
    vec3 tint = mix(vec3(1.0), uTint, abs(vTile - 4.0) < 0.5 ? 1.0 : 0.3);
    gl_FragColor = vec4(vColor.rgb * t.rgb * tint, vColor.a * t.a * uAlpha);
    if (gl_FragColor.a < 0.01) discard;
    #include <colorspace_fragment>
  }`;

class Cloud {
  constructor(scene, atlas, max, blending, scaleU, tintU) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max); this.tile = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('tile', new THREE.BufferAttribute(this.tile, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas.tex }, uScale: scaleU, uAlpha: { value: 1 }, uTint: tintU },
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 3 : 2;
    scene.add(this.points);
  }

  spawn(p) {
    if (this.list.length >= this.max) this.list.shift();
    p.age = 0;
    this.list.push(p);
  }

  update(dt, t) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-(p.drag || 0) * dt);
      p.vx *= drag; p.vy *= drag; p.vz *= drag;
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.wob) { p.x += Math.sin(t * 2 + p.seed) * p.wob * dt; p.z += Math.cos(t * 1.7 + p.seed) * p.wob * dt; }
      const k = p.age / p.life;
      let a = Math.min(1, k / (p.fadeIn || 0.12)) * (1 - Math.max(0, (k - (p.hold || 0.6)) / (1 - (p.hold || 0.6))));
      if (p.blink) a *= 0.5 + 0.5 * Math.sin(t * p.blink + p.seed);
      L[n++] = p;
      const j = n - 1;
      this.pos[j * 3] = p.x; this.pos[j * 3 + 1] = p.y; this.pos[j * 3 + 2] = p.z;
      this.col[j * 4] = p.r; this.col[j * 4 + 1] = p.g; this.col[j * 4 + 2] = p.b; this.col[j * 4 + 3] = a * (p.a ?? 1);
      this.size[j] = p.size + (p.grow || 0) * k;
      this.tile[j] = p.tile;
    }
    L.length = n;
    for (const name of ['position', 'pcolor', 'size', 'tile']) this.geo.attributes[name].needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }
}

const PAL = [C.pink, C.butter, C.blue, C.apricot, C.sage, C.lilac].map((c) => new THREE.Color(c));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

export class Effects {
  constructor(scene) {
    this.scaleU = { value: 600 };
    this.atlas = makeAtlas();
    this.tintU = { value: new THREE.Color(1, 1, 1) };
    this.add = new Cloud(scene, this.atlas, 700, THREE.AdditiveBlending, this.scaleU, { value: new THREE.Color(1, 1, 1) });
    this.norm = new Cloud(scene, this.atlas, 700, THREE.NormalBlending, this.scaleU, this.tintU);
    this.t = 0;
    document.fonts?.ready.then(() => {
      // redraw the "z" now that Fredoka is loaded
      const fresh = makeAtlas();
      this.atlas.tex.image = fresh.canvas;
      this.atlas.tex.needsUpdate = true;
    });
  }

  setNight(k) { this.tintU.value.setRGB(1 - 0.5 * k, 1 - 0.52 * k, 1 - 0.38 * k); }

  resize(heightPx, fov) {
    this.scaleU.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  p(cloud, o) {
    const col = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color || '#ffffff');
    cloud.spawn({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: o.life || 1, size: o.size || 0.3, grow: o.grow || 0, tile: o.tile,
      r: col.r, g: col.g, b: col.b, a: o.a ?? 1, grav: o.grav || 0, drag: o.drag || 0,
      fadeIn: o.fadeIn, hold: o.hold, wob: o.wob, blink: o.blink, seed: Math.random() * 100,
    });
  }

  emit(kind, pos, opts = {}) {
    const x = pos.x, y = pos.y, z = pos.z;
    switch (kind) {
      case 'hearts':
        for (let i = 0; i < (opts.n || 3); i++) this.p(this.norm, { x: x + rnd(-0.25, 0.25), y: y + rnd(0, 0.2), z: z + rnd(-0.25, 0.25), vy: rnd(0.6, 1.0), vx: rnd(-0.15, 0.15), life: rnd(1.3, 1.8), size: rnd(0.22, 0.3), tile: T.heart, color: pick([C.pink, '#F48FA6', C.rose]), wob: 0.3, drag: 0.6 });
        break;
      case 'sparkles':
        for (let i = 0; i < (opts.n || 8); i++) {
          const a = Math.random() * Math.PI * 2, s = rnd(0.6, 1.6);
          this.p(this.add, { x, y, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(0.4, 1.6), life: rnd(0.5, 0.9), size: rnd(0.16, 0.28), tile: T.sparkle, color: opts.color || pick([C.butter, C.cream2, C.pink]), drag: 2.5, grav: -1 });
        }
        break;
      case 'notes':
        for (let i = 0; i < (opts.n || 1); i++) this.p(this.norm, { x: x + rnd(-0.2, 0.2), y, z: z + rnd(-0.2, 0.2), vy: rnd(0.7, 1.1), vx: rnd(-0.3, 0.3), life: rnd(1.1, 1.5), size: rnd(0.22, 0.3), tile: T.note, color: opts.color || pick(PAL), wob: 0.5, drag: 0.4 });
        break;
      case 'puff':
        for (let i = 0; i < (opts.n || 6); i++) {
          const a = Math.random() * Math.PI * 2;
          this.p(this.norm, { x: x + Math.cos(a) * 0.2, y: y + 0.05, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * 0.8, vz: Math.sin(a) * 0.8, vy: rnd(0.2, 0.5), life: rnd(0.5, 0.8), size: rnd(0.22, 0.32), grow: 0.25, tile: T.puff, color: opts.color || '#FFF3DC', a: 0.85, drag: 3 });
        }
        break;
      case 'smoke':
        this.p(this.norm, { x: x + rnd(-0.05, 0.05), y, z: z + rnd(-0.05, 0.05), vy: rnd(0.45, 0.7), vx: 0.25, life: rnd(3.2, 4.2), size: 0.35, grow: 1.1, tile: T.puff, color: opts.color || '#F3E6DA', a: 0.55, wob: 0.2, hold: 0.3, fadeIn: 0.15 });
        break;
      case 'z':
        this.p(this.norm, { x, y, z, vy: 0.35, vx: 0.15, life: 2.2, size: 0.18, grow: 0.12, tile: T.z, color: opts.color || C.blue, wob: 0.15 });
        break;
      case 'confetti':
        for (let i = 0; i < (opts.n || 18); i++) {
          const a = Math.random() * Math.PI * 2, s = rnd(0.5, 1.6);
          this.p(this.norm, { x, y, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(2.2, 3.6), life: rnd(1.2, 1.7), size: rnd(0.1, 0.15), tile: T.confetti, color: pick(PAL), grav: -6, drag: 1.5, wob: 0.6 });
        }
        break;
      case 'splash':
        for (let i = 0; i < (opts.n || 10); i++) {
          const a = Math.random() * Math.PI * 2, s = rnd(0.3, 0.9);
          this.p(this.norm, { x, y, z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rnd(1.2, 2.2), life: rnd(0.5, 0.8), size: rnd(0.08, 0.13), tile: T.drop, color: '#DDF1F7', grav: -8 });
        }
        break;
      case 'drop':
        this.p(this.norm, { x, y, z, vx: opts.vx || 0, vz: opts.vz || 0, vy: opts.vy ?? 1.6, life: opts.life || 0.7, size: opts.size || 0.08, tile: T.drop, color: '#E6F5FA', grav: -7, a: 0.9 });
        break;
      case 'ember':
        this.p(this.add, { x: x + rnd(-0.2, 0.2), y, z: z + rnd(-0.2, 0.2), vy: rnd(0.8, 1.6), life: rnd(0.8, 1.4), size: rnd(0.06, 0.1), tile: T.sparkle, color: pick([C.butter, C.apricot, '#FFB070']), wob: 0.6 });
        break;
      case 'firefly':
        this.p(this.add, { x, y, z, vx: rnd(-0.1, 0.1), vy: rnd(-0.05, 0.08), vz: rnd(-0.1, 0.1), life: rnd(5, 8), size: rnd(0.16, 0.22), tile: T.glow, color: '#FFF0A0', wob: 0.4, blink: rnd(1.5, 3), hold: 0.8, fadeIn: 0.2 });
        break;
      case 'mote':
        this.p(this.add, { x, y, z, vx: rnd(-0.05, 0.05), vy: rnd(-0.02, 0.04), vz: rnd(-0.05, 0.05), life: rnd(4, 6), size: rnd(0.035, 0.06), tile: T.glow, color: '#FFE9B0', a: opts.a ?? 0.6, wob: 0.12, hold: 0.7, fadeIn: 0.3 });
        break;
      case 'petal':
        this.p(this.norm, { x, y, z, vx: rnd(0.15, 0.45), vy: rnd(-0.35, -0.2), vz: rnd(-0.2, 0.2), life: rnd(4, 6), size: rnd(0.06, 0.09), tile: T.confetti, color: pick([C.pink, '#F9CBD3', '#FFE4EA']), wob: 0.9, hold: 0.75, fadeIn: 0.1 });
        break;
      case 'mist':
        for (let i = 0; i < (opts.n || 1); i++) this.p(this.norm, { x: x + rnd(-0.6, 0.6), y, z: z + rnd(-0.6, 0.6), vx: rnd(-0.25, 0.25), vy: rnd(0.25, 0.6), vz: rnd(-0.25, 0.25), life: rnd(1.6, 2.6), size: rnd(0.5, 0.85), grow: 1.0, tile: T.puff, color: '#F2F7FA', a: opts.a ?? 0.3, drag: 0.6, fadeIn: 0.25 });
        break;
      case 'foam':
        this.p(this.norm, { x: x + rnd(-0.15, 0.15), y, z: z + rnd(-0.15, 0.15), vx: opts.vx || 0, vz: opts.vz || 0, vy: -0.05, life: rnd(1.2, 2.0), size: rnd(0.16, 0.28) * (opts.k || 1), grow: 0.5, tile: T.puff, color: '#F4FAFB', a: (opts.a ?? 0.55) * 0.6, drag: 1.2, hold: 0.2 });
        break;
      case 'ring':
        this.p(this.add, { x, y, z, life: 0.6, size: 0.5, grow: 1.4, tile: T.glow, color: opts.color || C.butter, a: 0.8 });
        break;
    }
  }

  update(dt) {
    this.t += dt;
    this.add.update(dt, this.t);
    this.norm.update(dt, this.t);
  }

  // Static additive glows (lamps, windows) faded in at night.
  makeGlows(scene, list) {
    const n = list.length;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n), tile = new Float32Array(n);
    list.forEach((l, i) => {
      pos.set([l.p.x, l.p.y, l.p.z], i * 3);
      const c = new THREE.Color(l.color);
      col.set([c.r, c.g, c.b, 0.9], i * 4);
      size[i] = l.size; tile[i] = T.glow;
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('tile', new THREE.BufferAttribute(tile, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.atlas.tex }, uScale: this.scaleU, uAlpha: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    scene.add(pts);
    return { set: (k) => { mat.uniforms.uAlpha.value = k; pts.visible = k > 0.01; } };
  }
}
