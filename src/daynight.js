// Sky, sun/moon, environment lighting, fog, lamp lights and everything else that follows the shared day.
import * as THREE from 'three';
import { C, MAT, Builder, sphere, outlineUniforms } from './toon.js';
import { REAL, STYLE } from './materials.js';

// f: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset (sets over the sea in the west).
export function sunDirection(f, out = new THREE.Vector3()) {
  const a = (f - 0.25) * Math.PI * 2;
  return out.set(Math.cos(a), Math.sin(a), 0.35).normalize();
}
// The moon arcs over the sea through the night.
export function moonDirection(f, out = new THREE.Vector3()) {
  const prog = THREE.MathUtils.clamp(((((f - 0.76) % 1) + 1) % 1) / 0.48, 0, 1);
  const el = Math.sin(Math.PI * prog) * 0.42 + 0.05 - (prog <= 0 || prog >= 1 ? 0.2 : 0);
  const az = 0.75 - 1.5 * prog;
  return out.set(-Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
}

// ---------- Preetham daylight model (same maths as the sky shader, for fog/ambient colours) ----------
const SKY = { turbidity: 3.2, rayleigh: 1.6, mie: 0.006, mieG: 0.82 };
const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MC = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
function skyRadiance(d, s, out = new THREE.Color()) {
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(THREE.MathUtils.clamp(s.y, -1, 1))) / 1.5)));
  const c = 0.2 * SKY.turbidity * 1e-17;
  const zen = Math.acos(Math.max(0, d.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inv, sM = 1.25e3 * inv;
  const cosT = d.x * s.x + d.y * s.y + d.z * s.z;
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g2 = SKY.mieG * SKY.mieG;
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * SKY.mieG * cosT + g2, 1.5));
  const res = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const bR = TR[i] * SKY.rayleigh, bM = 0.434 * c * MC[i] * SKY.mie;
    const Fex = Math.exp(-(bR * sR + bM * sM));
    const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= THREE.MathUtils.lerp(1, Math.pow(sunE * ratio * Fex, 0.5), THREE.MathUtils.clamp(Math.pow(1 - s.y, 5), 0, 1));
    const v = (Lin + 0.1 * Fex) * 0.04 + [0, 0.0003, 0.00075][i];
    res[i] = Math.pow(v, 1 / 2.4);
  }
  return out.setRGB(res[0], res[1], res[2]);
}

const SKY_FRAG = /* glsl */`
  uniform vec3 uSunDir, uMoonDir, uNightTop, uNightHor, uShootA, uShootB, uCloudLit, uCloudShade;
  uniform float uNight, uTime, uMoonVis, uShoot, uGain, uCover;
  uniform float turbidity, rayleigh, mieCoefficient, mieDirectionalG;
  varying vec3 vDir;
  const float pi = 3.141592653589793;
  const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
  const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
  vec3 preetham(vec3 d, vec3 s) {
    float sunE = 1000.0 * max(0.0, 1.0 - exp(-((1.6110731556870734 - acos(clamp(s.y, -1.0, 1.0))) / 1.5)));
    vec3 betaR = totalRayleigh * rayleigh;
    vec3 betaM = 0.434 * (0.2 * turbidity * 1e-17) * MieConst * mieCoefficient;
    float zen = acos(max(0.0, d.y));
    float inv = 1.0 / (cos(zen) + 0.15 * pow(93.885 - ((zen * 180.0) / pi), -1.253));
    vec3 Fex = exp(-(betaR * 8.4E3 * inv + betaM * 1.25E3 * inv));
    float cosT = dot(d, s);
    float rPhase = 0.05968310365946075 * (1.0 + pow(cosT * 0.5 + 0.5, 2.0));
    float g2 = mieDirectionalG * mieDirectionalG;
    float mPhase = 0.07957747154594767 * ((1.0 - g2) / pow(1.0 - 2.0 * mieDirectionalG * cosT + g2, 1.5));
    vec3 ratio = (betaR * rPhase + betaM * mPhase) / (betaR + betaM);
    vec3 Lin = pow(sunE * ratio * (1.0 - Fex), vec3(1.5));
    Lin *= mix(vec3(1.0), pow(sunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - s.y, 5.0), 0.0, 1.0));
    vec3 L0 = vec3(0.1) * Fex;
    L0 += sunE * 19000.0 * Fex * smoothstep(0.99993, 0.99996, cosT);
    vec3 c = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
    return pow(c, vec3(1.0 / 2.4));
  }
  float stars(vec3 d, float scale, float keep, float size, float t) {
    vec2 g = vec2(atan(d.z, d.x) * scale, asin(clamp(d.y, -1.0, 1.0)) * scale * 2.0);
    vec2 id = floor(g), f = fract(g) - 0.5;
    float r = h21(id);
    if (r < keep) return 0.0;
    vec2 o = (vec2(h21(id + 7.1), h21(id + 3.3)) - 0.5) * 0.5;
    float s = smoothstep(size, 0.0, length(f - o));
    s += smoothstep(size * 0.3, 0.0, abs(f.x - o.x)) * smoothstep(size * 2.4, 0.0, abs(f.y - o.y)) * 0.4;
    s += smoothstep(size * 0.3, 0.0, abs(f.y - o.y)) * smoothstep(size * 2.4, 0.0, abs(f.x - o.x)) * 0.4;
    return s * (0.55 + 0.45 * sin(t * (1.0 + r * 4.0) + r * 60.0));
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = preetham(normalize(vec3(d.x, max(d.y, 0.0) + 0.001, d.z)), normalize(uSunDir)) * uGain;
    vec3 night = mix(uNightHor, uNightTop, smoothstep(0.0, 0.6, d.y));
    col = mix(col, night, uNight);
    // clouds on a high layer, lit by the sun
    if (d.y > 0.0) {
      float t = 900.0 / (d.y + 0.03);
      vec2 p = d.xz * t * 0.0011 + vec2(uTime * 0.004, uTime * 0.0015);
      float n = fbm(p);
      float cov = smoothstep(uCover, uCover + 0.28, n);
      float n2 = fbm(p + normalize(uSunDir.xz + 1e-4) * 0.12);
      float lit = clamp(0.55 + (n - n2) * 4.0, 0.15, 1.2);
      float fade = smoothstep(0.0, 0.14, d.y);
      vec3 cc = mix(uCloudShade, uCloudLit, lit);
      float silver = pow(max(dot(d, normalize(uSunDir)), 0.0), 12.0) * (1.0 - cov) * 2.0;
      col = mix(col, cc + uCloudLit * silver * 0.4, cov * fade * 0.92);
    }
    if (uNight > 0.01) {
      float up = smoothstep(-0.02, 0.25, d.y) * smoothstep(0.45, 0.9, uNight);
      vec3 bn = normalize(vec3(0.35, 0.5, 0.79));
      float band = exp(-pow(dot(d, bn) / 0.2, 2.0));
      vec2 bp = vec2(atan(d.z, d.x), d.y) * 6.0;
      float cl = vnoise(bp) * 0.6 + vnoise(bp * 2.3 + 4.0) * 0.4;
      col += vec3(0.32, 0.26, 0.45) * band * (0.35 + 0.65 * cl) * 0.22 * up;
      float st = stars(d, 70.0, 0.955 - band * 0.05, 0.16, uTime) * 0.7 + stars(d, 26.0, 0.975, 0.11, uTime * 0.7) * 1.5;
      vec3 tint = mix(vec3(1.0, 0.9, 0.8), vec3(0.85, 0.9, 1.0), h21(floor(d.xz * 40.0)));
      col += tint * st * up * 1.4;
      float m = dot(d, normalize(uMoonDir));
      vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
      vec3 my = cross(mx, normalize(uMoonDir));
      vec2 mp = vec2(dot(d, mx), dot(d, my)) / 0.03;
      float crater = smoothstep(0.26, 0.18, length(mp - vec2(0.3, 0.22))) * 0.16 + smoothstep(0.17, 0.1, length(mp - vec2(-0.36, -0.08))) * 0.13
                   + smoothstep(0.13, 0.07, length(mp - vec2(0.06, -0.46))) * 0.12 + smoothstep(0.1, 0.05, length(mp - vec2(-0.2, 0.42))) * 0.1;
      col += vec3(0.6, 0.62, 0.8) * (pow(max(m, 0.0), 1500.0) * 0.5 + pow(max(m, 0.0), 60.0) * 0.12) * uMoonVis;
      col = mix(col, vec3(2.4, 2.3, 2.1) * (1.0 - crater), smoothstep(0.99952, 0.99962, m) * uMoonVis);
      if (uShoot > 0.0 && uShoot < 1.0) {
        vec3 head = normalize(mix(uShootA, uShootB, uShoot));
        vec3 tail = normalize(mix(uShootA, uShootB, max(0.0, uShoot - 0.3)));
        vec3 ab = head - tail;
        float h = clamp(dot(d - tail, ab) / dot(ab, ab), 0.0, 1.0);
        float dist = length(d - tail - ab * h);
        col += vec3(2.0, 1.9, 1.7) * smoothstep(0.0018, 0.0, dist) * h * sin(uShoot * 3.14159) * up;
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class DayNight {
  constructor(scene, renderer, world, effects) {
    this.scene = scene; this.renderer = renderer; this.world = world; this.fx = effects;
    this.night = 0; this.golden = 0;
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3(); this.lightDir = new THREE.Vector3();
    this.horizon = new THREE.Color(); this.zenith = new THREE.Color(); this.sunColor = new THREE.Color();
    this.focus = new THREE.Vector3();
    this._c = new THREE.Color(); this._v = new THREE.Vector3();

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 3));
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 0.2);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0028);
    this.setShadowLevel(2);

    this.skyU = {
      uSunDir: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3() },
      uNightTop: { value: new THREE.Color('#05081c') }, uNightHor: { value: new THREE.Color('#1c1d40') },
      uShootA: { value: new THREE.Vector3(0, 1, 0) }, uShootB: { value: new THREE.Vector3(0, 1, 0) },
      uCloudLit: { value: new THREE.Color(1, 1, 1) }, uCloudShade: { value: new THREE.Color(0.6, 0.65, 0.75) },
      uNight: { value: 0 }, uTime: { value: 0 }, uMoonVis: { value: 0 }, uShoot: { value: -1 }, uGain: { value: 1 }, uCover: { value: 0.52 },
      turbidity: { value: SKY.turbidity }, rayleigh: { value: SKY.rayleigh }, mieCoefficient: { value: SKY.mie }, mieDirectionalG: { value: SKY.mieG },
    };
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FRAG,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);
    this.shoot = { t: -1, wait: 6 };

    // environment lighting: the sky (over a grassy ground) captured into a prefiltered map
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(30, 32).rotateX(-Math.PI / 2).translate(0, -0.6, 0), new THREE.MeshBasicMaterial({ color: '#3d4a2c' }));
    this.envScene.add(this.envSky, this.envGround);
    this.envRT = null;
    this.envAt = { dir: new THREE.Vector3(9, 9, 9), night: -1, t: -99, style: '' };

    // toon-style clouds (the realistic sky draws its own)
    const cb = new Builder();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, r = 170 + Math.random() * 80, y = 45 + Math.random() * 35;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 6 + Math.random() * 6;
      for (let j = 0; j < 6; j++) cb.add(sphere(s * (0.6 + Math.random() * 0.5), 12, 8), C.cream2, { pos: [x + (j - 2.5) * s * 0.7, y + Math.random() * s * 0.4, z + (Math.random() - 0.5) * s], scale: [1, 0.72, 1] });
    }
    this.toonClouds = cb.build({ material: MAT.toon, outline: true, receiveShadow: false });
    this.toonClouds.traverse((o) => { o.frustumCulled = false; });
    scene.add(this.toonClouds);

    // pool of real lights the nearest lamps borrow at night
    this.lamps = [];
    this.lampSpots = [...world.lampPosts.map((p) => ({ x: p.x, y: p.y + 2.8, z: p.z, col: '#FFC98A', k: 1 })), { x: 11, y: 1.9, z: -8.4, col: '#FFC27A', k: 0.9 }];

    this.glows = effects.makeGlows(scene, world.lampGlows);
    this.firefly = 0;
    this.mote = 0;
  }

  setLampCount(n) {
    while (this.lamps.length > n) this.scene.remove(this.lamps.pop());
    while (this.lamps.length < n) {
      const l = new THREE.PointLight('#FFC98A', 0, 15, 2);
      this.scene.add(l);
      this.lamps.push(l);
    }
  }

  setShadowLevel(level) {
    const s = this.sun.shadow;
    this.renderer.shadowMap.enabled = level > 0;
    this.sun.castShadow = level > 0;
    const size = [1024, 1024, 2048, 4096][level] || 1024;
    if (s.mapSize.x !== size) {
      s.mapSize.set(size, size);
      s.map?.dispose();
      s.map = null;
    }
    this.shadowRange = [18, 18, 26, 32][level] || 18;
    const c = s.camera;
    c.left = -this.shadowRange; c.right = this.shadowRange; c.top = this.shadowRange; c.bottom = -this.shadowRange;
    c.near = 1; c.far = 220;
    c.updateProjectionMatrix();
    this.renderer.shadowMap.autoUpdate = level >= 2;
    this.renderer.shadowMap.needsUpdate = true;
    this.shadowLevel = level;
  }

  update(f, dt, t, camera, focus, fireInfo) {
    const sd = sunDirection(f, this.sunDir), md = moonDirection(f, this.moonDir);
    const sunUp = THREE.MathUtils.smoothstep(sd.y, -0.04, 0.06);
    const night = (this.night = 1 - THREE.MathUtils.smoothstep(sd.y, -0.16, 0.02));
    this.golden = Math.max(0, 1 - Math.abs(sd.y - 0.08) / 0.2) * (1 - night * 0.7);
    const toon = STYLE.name === 'toon';

    // colours of the day straight from the sky model
    const hz = this.horizon, zen = this.zenith, tmp = this._c, v = this._v;
    hz.setRGB(0, 0, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      hz.add(skyRadiance(v.set(Math.cos(a), 0.06, Math.sin(a)).normalize(), sd, tmp));
    }
    hz.multiplyScalar(0.25);
    skyRadiance(v.set(0, 1, 0), sd, zen);
    hz.lerp(this.skyU.uNightHor.value, night);
    zen.lerp(this.skyU.uNightTop.value, night);
    this.scene.fog.color.copy(hz);
    this.scene.fog.density = 0.0024 + night * 0.0016;

    // the sun reddens near the horizon; the moon takes over at night
    const elev = Math.max(0, sd.y);
    this.sunColor.setRGB(1, 0.62 + 0.36 * Math.min(1, elev * 3.2), 0.38 + 0.56 * Math.min(1, elev * 2.6));
    const useSun = sd.y > -0.03;
    const dir = this.lightDir.copy(useSun ? sd : md);
    const moonUp = THREE.MathUtils.smoothstep(md.y, -0.02, 0.1);
    if (useSun) this.sun.color.copy(this.sunColor); else this.sun.color.set('#B9C2FF');
    this.sun.intensity = useSun ? (toon ? 2.2 : 3.4) * sunUp : (toon ? 0.7 : 0.5) * moonUp * night;

    // shadows follow the player, snapped to shadow texels so they don't shimmer
    this.focus.copy(focus || v.set(0, 0, 0));
    const range = this.shadowRange || 18;
    const texel = (range * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(this.focus.x / texel) * texel, fz = Math.round(this.focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + dir.x * 90, dir.y * 90, fz + dir.z * 90);
    if (this.shadowLevel === 1) {
      this.shadowTick = (this.shadowTick || 0) + 1;
      if (this.shadowTick % 3 === 0) this.renderer.shadowMap.needsUpdate = true;
    }

    // ambient: the environment map does the heavy lifting; a soft fill tops it up (more for toon)
    this.hemi.color.copy(zen).lerp(tmp.set('#9AA4D8'), night * 0.6);
    this.hemi.groundColor.set(night > 0.5 ? '#2b2433' : '#5a5236');
    this.hemi.intensity = toon ? 1.5 : 0.15 + night * 0.4 + this.golden * 0.3;
    this.renderer.toneMapping = toon ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = toon ? 1 : THREE.MathUtils.lerp(0.74, 1.3, night) + this.golden * 0.22;
    this.skyU.uGain.value = toon ? 1 : 0.86;

    // sky
    const u = this.skyU;
    u.uSunDir.value.copy(sd); u.uMoonDir.value.copy(md);
    u.uNight.value = night; u.uTime.value = t;
    u.uMoonVis.value = night * moonUp;
    u.uCloudLit.value.copy(this.sunColor).multiplyScalar(0.55 + 0.6 * sunUp).lerp(tmp.setRGB(0.2, 0.22, 0.32), night);
    u.uCloudShade.value.copy(zen).multiplyScalar(0.75).lerp(tmp.setRGB(0.06, 0.07, 0.12), night * 0.6);
    this.sky.position.copy(camera.position);
    this.toonClouds.visible = toon;
    this.toonClouds.rotation.y = t * 0.002;
    this.updateShootingStar(dt, night);

    // refresh the environment map when the light has changed enough
    const ea = this.envAt;
    if (toon) { ea.style = 'toon'; this.scene.environment = null; }
    else if (ea.dir.angleTo(dir) > 0.02 || Math.abs(ea.night - night) > 0.04 || Math.abs((ea.golden ?? -1) - this.golden) > 0.05 || ea.style !== 'realistic' || t - ea.t > 30) {
      ea.dir.copy(dir); ea.night = night; ea.t = t; ea.style = 'realistic'; ea.golden = this.golden;
      this.envGround.material.color.set('#3d4a2c').multiplyScalar(Math.max(0.05, 1 - night * 0.92));
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      this.scene.environment = rt.texture;
      this.envRT?.dispose();
      this.envRT = rt;
      // sky light should be a fraction of the sun's, or everything looks flat and washed out
      const ei = THREE.MathUtils.lerp(0.34, 0.6, night) + this.golden * 0.3;
      for (const m of Object.values(REAL)) m.envMapIntensity = ei;
      if (!this.envMats || t - (this.envMatsAt || -99) > 20) {
        this.envMatsAt = t;
        this.envMats = new Set();
        this.scene.traverse((o) => { const m = o.material; if (m && m.isMeshStandardMaterial) this.envMats.add(m); });
      }
      for (const m of this.envMats) m.envMapIntensity = ei * (m.userData.envK ?? 1);
    }

    // lamps, windows, ink
    MAT.glow.color.setScalar(toon ? 0.85 + 0.15 * night : 1 + night * 2.2);
    this.glows.set(THREE.MathUtils.smoothstep(night, 0.15, 0.7) * (toon ? 0.8 : 0.45));
    outlineUniforms.uInk.value.set(C.ink).multiplyScalar(1 - 0.25 * night);
    this.updateLamps(night, t, fireInfo);
    this.fx.setNight?.(night);

    // fireflies at night, dust motes in the golden light
    if (focus && this.fx) {
      if (night > 0.6) {
        this.firefly -= dt;
        if (this.firefly <= 0) {
          this.firefly = 0.1;
          const spots = [[10, 9, 6], [-8, 10, 6], [-11.5, -3, 4], [0, 0, 9], [focus.x, focus.z, 7]];
          const [x, z, r] = spots[Math.floor(Math.random() * spots.length)];
          const px = x + (Math.random() - 0.5) * r * 2, pz = z + (Math.random() - 0.5) * r * 2;
          this.fx.emit('firefly', { x: px, y: this.world.groundHeight(px, pz) + 0.5 + Math.random() * 1.3, z: pz });
        }
      }
      if (night < 0.5) {
        this.mote -= dt;
        if (this.mote <= 0) {
          this.mote = 0.18;
          this.fx.emit('mote', { x: focus.x + (Math.random() - 0.5) * 9, y: focus.y + 0.3 + Math.random() * 2.5, z: focus.z + (Math.random() - 0.5) * 9 }, { a: 0.25 + this.golden * 0.5 });
        }
      }
    }
  }

  updateShootingStar(dt, night) {
    const sh = this.shoot, u = this.skyU;
    if (night > 0.7) {
      if (sh.t < 0) {
        sh.wait -= dt;
        if (sh.wait <= 0) {
          const a0 = Math.random() * Math.PI * 2, e0 = 0.45 + Math.random() * 0.4;
          const A = new THREE.Vector3(Math.cos(a0) * Math.cos(e0), Math.sin(e0), Math.sin(a0) * Math.cos(e0));
          const B = A.clone().add(new THREE.Vector3(Math.cos(a0 + 1.6) * 0.32, -0.16, Math.sin(a0 + 1.6) * 0.32)).normalize();
          u.uShootA.value.copy(A); u.uShootB.value.copy(B);
          sh.t = 0;
        }
      } else {
        sh.t += dt / 1.1;
        if (sh.t >= 1) { sh.t = -1; sh.wait = 7 + Math.random() * 14; }
      }
    }
    u.uShoot.value = sh.t;
  }

  updateLamps(night, t, fire) {
    const n = this.lamps.length;
    if (!n) return;
    const on = THREE.MathUtils.smoothstep(night, 0.25, 0.7);
    const spots = this.lampSpots.slice();
    if (fire && fire.lit) spots.push({ x: fire.x, y: 0.9, z: fire.z, col: '#FF9A4A', k: 1.5, fire: true });
    const f = this.focus;
    const score = (s) => Math.hypot(s.x - f.x, s.z - f.z) - (s.fire ? 6 : 0);
    spots.sort((a, b) => score(a) - score(b));
    for (let i = 0; i < n; i++) {
      const l = this.lamps[i], s = spots[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.set(s.x, s.y, s.z);
      l.color.set(s.col);
      const flick = s.fire ? 0.8 + Math.sin(t * 13) * 0.12 + Math.sin(t * 21.7) * 0.08 : 1;
      l.intensity = (s.fire ? Math.max(on, 0.35) : on) * 14 * s.k * flick;
      l.distance = s.fire ? 12 : 14;
    }
  }
}
