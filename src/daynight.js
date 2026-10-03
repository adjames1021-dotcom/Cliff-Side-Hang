// Sky, sun/moon, fog and everything that changes over the shared day.
import * as THREE from 'three';
import { C, MAT, Builder, sphere, outlineUniforms } from './toon.js';

// f: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset.
const KEYS = [
  { f: 0.00, top: '#26265C', hor: '#56508F', sun: '#CDBDF4', si: 0.7, hs: '#8580C4', hg: '#5E4A72', hi: 1.35, sea: '#4A5590', seaFar: '#5E5794', water: '#7C86C0', night: 1 },
  { f: 0.20, top: '#2F2D68', hor: '#6E5A98', sun: '#CDBDF4', si: 0.65, hs: '#8B82C6', hg: '#664E78', hi: 1.35, sea: '#525A96', seaFar: '#6E5E9A', water: '#8088C2', night: 0.95 },
  { f: 0.255, top: '#7E8FD0', hor: '#FFC39A', sun: '#FFB27A', si: 1.2, hs: '#D9CDE8', hg: '#EBBBA6', hi: 1.45, sea: '#8FA8D4', seaFar: '#F2C3A8', water: '#B2C8E6', night: 0.25 },
  { f: 0.31, top: '#8FC9EC', hor: '#FFF0D8', sun: '#FFF1DA', si: 1.9, hs: '#E8F1F2', hg: '#F0D6AE', hi: 1.75, sea: '#8CC8E2', seaFar: '#C4E4F0', water: '#BFE3EE', night: 0 },
  { f: 0.62, top: '#8FC9EC', hor: '#FFF0D8', sun: '#FFF1DA', si: 1.9, hs: '#E8F1F2', hg: '#F0D6AE', hi: 1.75, sea: '#8CC8E2', seaFar: '#C4E4F0', water: '#BFE3EE', night: 0 },
  { f: 0.70, top: '#86B0E0', hor: '#FFD69E', sun: '#FFCF96', si: 1.8, hs: '#F0E2E4', hg: '#F4CDA4', hi: 1.6, sea: '#94BFDD', seaFar: '#FFD8AE', water: '#C6DDEA', night: 0 },
  { f: 0.745, top: '#7071B8', hor: '#F7A27A', sun: '#FFA06A', si: 1.3, hs: '#D7B6DA', hg: '#EAAE96', hi: 1.45, sea: '#8F8FC4', seaFar: '#F7A88A', water: '#B4ACD4', night: 0.3 },
  { f: 0.785, top: '#3D3A7A', hor: '#C47E9E', sun: '#CDBDF4', si: 0.55, hs: '#9A8ECC', hg: '#755886', hi: 1.3, sea: '#5A5A99', seaFar: '#B77A98', water: '#8E8CC4', night: 0.85 },
  { f: 0.84, top: '#26265C', hor: '#56508F', sun: '#CDBDF4', si: 0.7, hs: '#8580C4', hg: '#5E4A72', hi: 1.35, sea: '#4A5590', seaFar: '#5E5794', water: '#7C86C0', night: 1 },
  { f: 1.00, top: '#26265C', hor: '#56508F', sun: '#CDBDF4', si: 0.7, hs: '#8580C4', hg: '#5E4A72', hi: 1.35, sea: '#4A5590', seaFar: '#5E5794', water: '#7C86C0', night: 1 },
];
const COLOR_KEYS = ['top', 'hor', 'sun', 'hs', 'hg', 'sea', 'seaFar', 'water'];
for (const k of KEYS) for (const n of COLOR_KEYS) k[n] = new THREE.Color(k[n]);

function sample(f) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].f <= f) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = THREE.MathUtils.smoothstep(f, a.f, b.f);
  const o = {};
  for (const n of COLOR_KEYS) o[n] = a[n].clone().lerp(b[n], t);
  o.si = a.si + (b.si - a.si) * t;
  o.hi = a.hi + (b.hi - a.hi) * t;
  o.night = a.night + (b.night - a.night) * t;
  return o;
}

export class DayNight {
  constructor(scene, renderer, world, effects) {
    this.scene = scene; this.renderer = renderer; this.world = world; this.fx = effects;
    this.night = 0;
    this.sunDir = new THREE.Vector3();

    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.5));
    sun.castShadow = true;
    const mobile = matchMedia('(pointer: coarse)').matches;
    sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = sun.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 220;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    scene.add(this.hemi);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; // the world is static: bake, re-bake only as the sun moves
    this.bakedDir = new THREE.Vector3(0, -1, 0);

    scene.fog = new THREE.Fog(0xffffff, 70, 330);

    this.skyU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3() }, uNight: { value: 0 }, uTime: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHor, uSunDir, uSunCol, uMoonDir; uniform float uNight, uTime;
        varying vec3 vDir;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.55, d.y));
          float s = dot(d, normalize(uSunDir));
          col += uSunCol * pow(max(s, 0.0), 10.0) * 0.35 * (1.0 - uNight);
          col = mix(col, mix(vec3(1.0, 0.97, 0.86), uSunCol, 0.35), smoothstep(0.9986, 0.9990, s) * step(-0.02, d.y));
          float m = dot(d, normalize(uMoonDir));
          col = mix(col, vec3(1.0, 0.96, 0.86), smoothstep(0.9993, 0.9996, m) * uNight);
          col += vec3(1.0, 0.95, 0.85) * pow(max(m, 0.0), 60.0) * 0.25 * uNight;
          // stars
          vec2 g = vec2(atan(d.z, d.x) * 60.0, d.y * 120.0);
          vec2 id = floor(g), f = fract(g) - 0.5;
          float r = h21(id);
          float star = step(0.985, r) * smoothstep(0.18, 0.0, length(f)) * smoothstep(0.05, 0.3, d.y);
          star *= 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 50.0);
          col += vec3(1.0, 0.95, 0.85) * star * uNight;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // puffy clouds orbiting slowly
    const cb = new Builder();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3, r = 170 + Math.random() * 70, y = 45 + Math.random() * 35;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 6 + Math.random() * 6;
      for (let j = 0; j < 5; j++) {
        cb.add(sphere(s * (0.6 + Math.random() * 0.5), 12, 8), C.cream2, { pos: [x + (j - 2) * s * 0.75, y + Math.random() * s * 0.4, z + (Math.random() - 0.5) * s], scale: [1, 0.75, 1] });
      }
    }
    this.clouds = cb.build({ outline: true, receiveShadow: false });
    this.clouds.traverse((o) => { o.frustumCulled = false; });
    scene.add(this.clouds);

    this.glows = effects.makeGlows(scene, world.lampGlows);
    this.firefly = 0;
    this.mote = 0;
  }

  // Sun direction for a time of day; rises in the east, sets over the sea.
  static sunDirection(f, out = new THREE.Vector3()) {
    const a = (f - 0.25) * Math.PI * 2;
    return out.set(Math.cos(a), Math.sin(a), 0.35).normalize();
  }

  update(f, dt, t, camera, focus) {
    const k = sample(f);
    this.night = k.night;
    DayNight.sunDirection(f, this.sunDir);
    const sd = this.sunDir;
    const moon = new THREE.Vector3(-sd.x, -sd.y, 0.45).normalize();
    const sunUp = THREE.MathUtils.smoothstep(sd.y, -0.03, 0.08);
    const moonUp = THREE.MathUtils.smoothstep(moon.y, -0.03, 0.12);
    const useSun = sd.y > -0.03;
    const dir = useSun ? sd : moon;
    const inten = k.si * (useSun ? sunUp : moonUp);

    this.sun.color.copy(k.sun);
    this.sun.intensity = inten;
    this.sun.position.copy(dir).multiplyScalar(90);
    this.sun.target.position.set(0, 0, 0);
    this.hemi.color.copy(k.hs);
    this.hemi.groundColor.copy(k.hg);
    this.hemi.intensity = k.hi;

    if (dir.angleTo(this.bakedDir) > 0.008) {
      this.bakedDir.copy(dir);
      this.renderer.shadowMap.needsUpdate = true;
    }

    this.scene.fog.color.copy(k.hor);
    const u = this.skyU;
    u.uTop.value.copy(k.top); u.uHor.value.copy(k.hor);
    u.uSunDir.value.copy(sd); u.uSunCol.value.copy(k.sun);
    u.uMoonDir.value.copy(moon); u.uNight.value = k.night; u.uTime.value = t;
    this.sky.position.copy(camera.position);
    this.clouds.rotation.y = t * 0.002;

    const sea = this.world.sea.uniforms;
    sea.uNear.value.copy(k.sea); sea.uFar.value.copy(k.seaFar);
    sea.uSunDir.value.copy(sd); sea.uSunCol.value.copy(k.sun).lerp(new THREE.Color('#ffffff'), 0.3);
    const w = this.world.water.uniforms;
    w.uShallow.value.copy(k.water); w.uDeep.value.copy(k.water).multiplyScalar(0.82);
    w.uHi.value.copy(k.hor).lerp(new THREE.Color('#ffffff'), 0.6);

    // lamps, windows, ink
    MAT.glow.color.setScalar(0.85 + 0.15 * k.night);
    this.glows.set(THREE.MathUtils.smoothstep(k.night, 0.15, 0.7));
    outlineUniforms.uInk.value.set(C.ink).multiplyScalar(1 - 0.25 * k.night);

    // fireflies at night, dust motes in the golden light
    if (focus && this.fx) {
      if (k.night > 0.6) {
        this.firefly -= dt;
        if (this.firefly <= 0) {
          this.firefly = 0.25;
          const spots = [[10, 9, 6], [-8, 10, 6], [-11.5, -3, 4], [0, 0, 9], [focus.x, focus.z, 7]];
          const [x, z, r] = spots[Math.floor(Math.random() * spots.length)];
          const px = x + (Math.random() - 0.5) * r * 2, pz = z + (Math.random() - 0.5) * r * 2;
          this.fx.emit('firefly', { x: px, y: this.world.groundHeight(px, pz) + 0.5 + Math.random() * 1.3, z: pz });
        }
      }
      const day = 1 - k.night;
      if (day > 0.5) {
        this.mote -= dt;
        if (this.mote <= 0) {
          this.mote = 0.18;
          const golden = THREE.MathUtils.smoothstep(f, 0.6, 0.72) * (1 - THREE.MathUtils.smoothstep(f, 0.75, 0.78));
          this.fx.emit('mote', { x: focus.x + (Math.random() - 0.5) * 9, y: focus.y + 0.3 + Math.random() * 2.5, z: focus.z + (Math.random() - 0.5) * 9 }, { a: 0.3 + golden * 0.5 });
        }
      }
    }
  }
}
