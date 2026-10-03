// Dense grass placed entirely on the GPU: blades tile around the camera on a stable grid,
// read the ground height and density from a baked map, sway in the wind and bend away from players.
import * as THREE from 'three';

const COUNTS = [0, 22000, 48000, 90000];
const RADIUS = [0, 16, 22, 28];

// One tuft: a few thin blades of different heights leaning out from a common root.
function tuftGeometry() {
  const seg = 3, blades = 4;
  const pos = [], nrm = [], hgt = [], idx = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rnd() * 0.8;
    const ox = Math.cos(a) * 0.035 * rnd(), oz = Math.sin(a) * 0.035 * rnd();
    const h = 0.6 + rnd() * 0.4, w = 0.011 + rnd() * 0.006;
    const lean = (0.12 + rnd() * 0.16) * 0.3, face = a + Math.PI / 2 + (rnd() - 0.5);
    const cx = Math.cos(face), cz = Math.sin(face);
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const width = w * (1 - t * 0.85);
      const bend = t * t * lean;
      const x = ox + Math.cos(a) * bend, z = oz + Math.sin(a) * bend, y = t * h;
      pos.push(x - cx * width, y, z - cz * width, x + cx * width, y, z + cz * width);
      // mostly-up normals light the tuft softly, like real grass seen together
      const nx = -cz * 0.45 + Math.cos(a) * 0.2, nz = cx * 0.45 + Math.sin(a) * 0.2;
      nrm.push(nx, 1, nz, nx, 1, nz);
      hgt.push(t * h, t * h);
    }
    for (let i = 0; i < seg; i++) {
      const k = base + i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  g.setIndex(idx);
  return g;
}

export class Grass {
  // density(x, z) -> 0..1, height(x, z) -> metres
  constructor(scene, { density, height, rect, size = 256 }) {
    this.scene = scene;
    const N = size;
    const [x0, z0, w, d] = rect;
    const data = new Uint16Array(N * N * 4);
    const hs = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) hs[j * N + i] = height(x0 + ((i + 0.5) / N) * w, z0 + ((j + 0.5) / N) * d);
    const dx = w / N, dz = d / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = x0 + ((i + 0.5) / N) * w, z = z0 + ((j + 0.5) / N) * d;
      const k = (j * N + i) * 4;
      // nothing grows on steep cuts (the cliff steps, the creek gorge, the mountain sides)
      const sx = (hs[j * N + Math.min(N - 1, i + 1)] - hs[j * N + Math.max(0, i - 1)]) / (2 * dx);
      const sz = (hs[Math.min(N - 1, j + 1) * N + i] - hs[Math.max(0, j - 1) * N + i]) / (2 * dz);
      const steep = Math.hypot(sx, sz) > 1.0;
      data[k] = THREE.DataUtils.toHalfFloat(hs[j * N + i]);
      data[k + 1] = THREE.DataUtils.toHalfFloat(steep ? 0 : density(x, z));
      data[k + 2] = THREE.DataUtils.toHalfFloat(0.5 + 0.5 * Math.sin(x * 0.31 + Math.sin(z * 0.23) * 2) * Math.cos(z * 0.17 - x * 0.05));
      data[k + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    const map = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
    map.magFilter = map.minFilter = THREE.LinearFilter;
    map.needsUpdate = true;

    this.u = {
      uMap: { value: map }, uRect: { value: new THREE.Vector4(x0, z0, w, d) },
      uCenter: { value: new THREE.Vector3() }, uCell: { value: 0.2 }, uSide: { value: 100 }, uRadius: { value: 22 },
      uTime: { value: 0 }, uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -99, 0, 0)) },
      uBase: { value: new THREE.Color('#3A6326') }, uTip: { value: new THREE.Color('#90B24E') }, uDry: { value: new THREE.Color('#B3A955') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uHeight: { value: 0.34 },
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', /* glsl */`#include <common>
          uniform sampler2D uMap; uniform vec4 uRect; uniform vec3 uCenter; uniform float uCell, uSide, uRadius, uTime, uHeight;
          uniform vec4 uPush[8];
          attribute float aH;
          varying float vH; varying float vTint; varying vec3 vGW;
          float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <beginnormal_vertex>', /* glsl */`
          float id = float(gl_InstanceID);
          vec2 g = vec2(mod(id, uSide), floor(id / uSide));
          vec2 cell = floor(uCenter.xz / uCell) * uCell + (g - uSide * 0.5) * uCell;
          vec2 jit = vec2(gh(cell), gh(cell + 17.3));
          vec2 wp = cell + jit * uCell;
          vec2 muv = (wp - uRect.xy) / uRect.zw;
          vec4 m = texture2D(uMap, muv);
          float inside = step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
          float dist = length(wp - uCenter.xz);
          float fadeD = 1.0 - smoothstep(uRadius * 0.65, uRadius, dist);
          float keep = step(gh(cell + 3.1), m.g) * inside;
          float hScale = uHeight * (0.5 + gh(cell + 9.7) * 0.7) * (0.5 + 0.5 * m.g) * keep * fadeD;
          float ang = gh(cell + 5.3) * 6.2831853;
          float ca = cos(ang), sa = sin(ang);
          vec3 objectNormal = vec3(normal.x * ca + normal.z * sa, normal.y, -normal.x * sa + normal.z * ca);
          vH = aH; vTint = m.b * 0.7 + gh(cell + 1.3) * 0.3;
          vGW = (modelMatrix * vec4(wp.x, m.r, wp.y, 1.0)).xyz;`)
        .replace('#include <begin_vertex>', /* glsl */`
          vec3 bp = position * vec3(0.8 + hScale, hScale, 0.8 + hScale);
          vec3 transformed = vec3(bp.x * ca + bp.z * sa, bp.y, -bp.x * sa + bp.z * ca);
          // wind gusts roll across the field
          float gust = sin(uTime * 1.6 + wp.x * 0.35 + wp.y * 0.21) * 0.5 + sin(uTime * 2.7 + wp.x * 0.9) * 0.2;
          vec2 bend = vec2(0.55, 0.25) * gust * 0.22;
          // players push the grass aside
          for (int i = 0; i < 8; i++) {
            vec2 dlt = wp - uPush[i].xz;
            float dl = length(dlt);
            if (uPush[i].y > -50.0 && dl < 0.7) bend += normalize(dlt + 1e-4) * (0.7 - dl) * 0.9;
          }
          transformed.xz += bend * aH * aH * hScale;
          transformed.y -= length(bend) * aH * aH * hScale * 0.35;
          transformed += vec3(wp.x, m.r - 0.02, wp.y);`);
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uBase, uTip, uDry, uSunDir, uSunCol;\nvarying float vH; varying float vTint; varying vec3 vGW;')
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          vec3 tip = mix(uTip, uDry, smoothstep(0.55, 1.0, vTint));
          diffuseColor.rgb = mix(uBase, tip, smoothstep(0.0, 1.0, vH)) * (0.85 + vTint * 0.3);`)
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= mix(0.4, 1.0, vH);')
        // sunlight glowing through blades when you look toward the sun
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec3 gv = normalize(vGW - cameraPosition);
          totalEmissiveRadiance += diffuseColor.rgb * uSunCol * pow(max(dot(gv, uSunDir), 0.0), 3.0) * vH * 0.9;`);
    };
    mat.customProgramCacheKey = () => 'gpu-grass';
    this.geo = tuftGeometry();
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
    this.setLevel(2);
  }

  setLevel(level) {
    const n = COUNTS[level] || 0;
    this.mesh.visible = n > 0;
    const side = Math.ceil(Math.sqrt(n));
    this.geo.instanceCount = side * side;
    this.u.uSide.value = side;
    this.u.uRadius.value = RADIUS[level] || 20;
    this.u.uCell.value = (this.u.uRadius.value * 2) / Math.max(1, side);
  }

  update(t, center, players) {
    this.u.uTime.value = t;
    this.u.uCenter.value.copy(center);
    const push = this.u.uPush.value;
    let i = 0;
    for (const p of players) {
      if (i >= 8) break;
      const r = p.char.root.position;
      push[i++].set(r.x, r.y, r.z, 1);
    }
    for (; i < 8; i++) push[i].set(0, -99, 0, 0);
  }

  setLight(dir, color, k) {
    this.u.uSunDir.value.copy(dir);
    this.u.uSunCol.value.copy(color).multiplyScalar(k);
  }
}
