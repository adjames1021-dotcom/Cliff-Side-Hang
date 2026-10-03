// Realistic water: waves, ripples, sky reflections, sun glitter, foam and (optionally) mirror reflections.
import * as THREE from 'three';
import { DETAIL } from './materials.js';
import { L } from './world.js';

// direction x, direction z, wavelength (m), amplitude (m)
const SEA_WAVES = [
  [1, 0.25, 14, 0.32], [0.9, -0.45, 8.5, 0.17], [1, 0.7, 5.2, 0.09], [0.6, -1, 3.1, 0.05], [1, 0.1, 1.9, 0.025], [-0.3, 1, 2.6, 0.02],
];
const POND_WAVES = [[1, 0.3, 2.2, 0.012], [-0.4, 1, 1.4, 0.008], [0.7, -0.7, 0.9, 0.005], [-1, -0.2, 0.6, 0.003], [0.2, 1, 0.45, 0.002], [1, -1, 0.3, 0.001]];

// Height of the sea surface at (x, z) at time t (same waves as the shader, minus the sideways drift).
export function seaHeight(x, z, t, out) {
  let y = 0, sx = 0, sz = 0;
  for (const [dx0, dz0, wl, a] of SEA_WAVES) {
    const l = Math.hypot(dx0, dz0), dx = dx0 / l, dz = dz0 / l;
    const k = (Math.PI * 2) / wl, om = Math.sqrt(9.8 * k);
    const ph = k * (dx * x + dz * z) - om * t;
    y += a * Math.sin(ph);
    sx += dx * k * a * Math.cos(ph);
    sz += dz * k * a * Math.cos(ph);
  }
  if (out) { out.slopeX = sx; out.slopeZ = sz; }
  return L.seaY + y;
}

function waveUniform(list) {
  return list.map(([dx, dz, wl, a]) => {
    const l = Math.hypot(dx, dz);
    return new THREE.Vector4(dx / l, dz / l, wl, a);
  });
}

const VERT_PARS = /* glsl */`
  uniform float uTime;
  uniform vec4 uWaves[6];
  uniform float uSteep;
  varying vec3 vWPos;
  varying float vCrest;
  vec3 gDisp;
`;
const VERT_NORMAL = /* glsl */`
  vec4 wp0 = modelMatrix * vec4(position, 1.0);
  float camD = length(wp0.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(120.0, 500.0, camD);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  gDisp = vec3(0.0);
  float crest = 0.0, total = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 w = uWaves[i];
    float k = 6.2831853 / w.z;
    float om = sqrt(9.8 * k);
    float a = w.w * fade;
    float ph = k * dot(w.xy, wp0.xz) - om * uTime;
    float c = cos(ph), s = sin(ph);
    float q = uSteep / (k * max(w.w, 1e-4) * 6.0);
    gDisp.x += q * a * w.x * c;
    gDisp.z += q * a * w.y * c;
    gDisp.y += a * s;
    nrm.x -= w.x * k * a * c;
    nrm.z -= w.y * k * a * c;
    nrm.y -= q * k * a * s;
    crest += a * s; total += w.w;
  }
  vCrest = crest / max(total, 1e-4);
  vec3 objectNormal = normalize(nrm);
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif
`;
const FRAG_PARS = /* glsl */`
  uniform float uTime;
  uniform sampler2D uNoise;
  uniform vec3 uDeep, uShallow, uSSS, uSunDir;
  uniform float uFoamAmt, uShoreX, uRipple, uCove;
  uniform vec4 uStacks[4];
  uniform sampler2D uMirror;
  uniform mat4 uMirrorMatrix;
  uniform float uMirrorAmt;
  varying vec3 vWPos;
  varying float vCrest;
  float wn(vec2 p) { return texture2D(uNoise, p).r; }
`;

export function makeWaterMaterial({ waves = SEA_WAVES, deep = '#0b3f57', shallow = '#1f7f8c', sss = '#2fb0a8', steep = 0.55, foam = 1, shoreX = L.cliffX - 0.3, ripple = 1, transparent = false, opacity = 1, stacks = true } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0, ior: 1.33, transparent, opacity, envMapIntensity: 1 });
  mat.userData.envK = 1.5; // water mirrors the sky, so it keeps more of the sky light
  const U = {
    uTime: { value: 0 }, uWaves: { value: waveUniform(waves) }, uSteep: { value: steep },
    uNoise: { value: DETAIL }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uSSS: { value: new THREE.Color(sss) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uFoamAmt: { value: foam }, uShoreX: { value: shoreX }, uRipple: { value: ripple }, uCove: { value: stacks ? 1 : 0 },
    uStacks: { value: (stacks ? L.seaStacks : []).map(([x, z, s]) => new THREE.Vector4(x, z, s * 1.05, 0)).concat(Array(4).fill(0).map(() => new THREE.Vector4(0, 0, -1, 0))).slice(0, 4) },
    uMirror: { value: null }, uMirrorMatrix: { value: new THREE.Matrix4() }, uMirrorAmt: { value: 0 },
  };
  mat.userData.u = U;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', 'vec3 transformed = position + gDisp;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        // how close to the cliff or a sea stack: shallow colour and foam
        float shore = clamp((vWPos.x - uShoreX) / -6.0, 0.0, 1.0);
        float near = 1.0 - shore;
        // surf running up the sand in the cove
        if (uCove > 0.5 && vWPos.z > 4.2 && vWPos.z < 21.5) {
          float sx = -25.43 - 1.8 * sin(3.14159 * (vWPos.z - 4.2) / 17.3);
          float swash = sin(uTime * 0.9 + vWPos.z * 0.35) * 0.6;
          near = max(near, 0.82 * (1.0 - smoothstep(0.0, 2.4, sx + swash - vWPos.x)) * smoothstep(4.2, 6.2, vWPos.z) * smoothstep(21.5, 19.5, vWPos.z));
        }
        for (int i = 0; i < 4; i++) {
          if (uStacks[i].z > 0.0) {
            float d = length(vWPos.xz - uStacks[i].xy) - uStacks[i].z;
            near = max(near, 1.0 - smoothstep(0.0, 3.5, d));
          }
        }
        float camDist = length(vWPos - cameraPosition);
        vec2 fp = vWPos.xz * 0.11;
        float foamN = wn(fp + vec2(uTime * 0.01, uTime * 0.017)) * 0.6 + wn(fp * 2.7 - vec2(uTime * 0.02, 0.0)) * 0.4;
        float edgeFoam = smoothstep(0.55, 0.95, near) * smoothstep(0.32, 0.6, foamN + near * 0.35 + sin(uTime * 1.3 + vWPos.x * 0.7) * 0.06);
        float crestFoam = smoothstep(0.42, 0.75, vCrest + foamN * 0.25) * (1.0 - smoothstep(60.0, 200.0, camDist));
        float foam = clamp((edgeFoam + crestFoam * 0.55) * uFoamAmt, 0.0, 1.0);
        diffuseColor.rgb = mix(uDeep, uShallow, smoothstep(0.2, 1.0, near) * 0.8 + clamp(vCrest, 0.0, 1.0) * 0.25);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), foam);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, foam);')
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          // two layers of drifting ripples on top of the big waves
          vec2 p1 = vWPos.xz * 0.21 + vec2(uTime * 0.021, uTime * 0.013);
          vec2 p2 = vWPos.xz * 0.53 - vec2(uTime * 0.017, -uTime * 0.026);
          float e = 0.012;
          float h1 = wn(p1), h2 = wn(p2);
          vec2 g = vec2(wn(p1 + vec2(e, 0.0)) - h1, wn(p1 + vec2(0.0, e)) - h1) * 1.6 + vec2(wn(p2 + vec2(e, 0.0)) - h2, wn(p2 + vec2(0.0, e)) - h2);
          float fadeR = 1.0 - smoothstep(20.0, 150.0, length(vWPos - cameraPosition));
          vec3 pw = vec3(-g.x, 0.0, -g.y) * (5.0 * uRipple * fadeR);
          normal = normalize(normal + (viewMatrix * vec4(pw, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        // light glowing through the thin tops of waves facing away from the sun
        vec3 vdir = normalize(vWPos - cameraPosition);
        float back = pow(max(dot(vdir, normalize(uSunDir)), 0.0), 4.0) * max(uSunDir.y + 0.1, 0.0);
        totalEmissiveRadiance += uSSS * clamp(vCrest * 1.6 + 0.15, 0.0, 1.0) * back * 0.6 * (1.0 - foam);`)
      .replace('#include <dithering_fragment>', /* glsl */`#include <dithering_fragment>
        if (uMirrorAmt > 0.0) {
          vec4 mc = uMirrorMatrix * vec4(vWPos, 1.0);
          vec2 muv = mc.xy / mc.w + normal.xz * 0.03;
          vec3 refl = texture2D(uMirror, muv).rgb;
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-vdir, vec3(0.0, 1.0, 0.0)), 0.0), 5.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, refl, fres * uMirrorAmt * (1.0 - foam));
        }`);
  };
  mat.customProgramCacheKey = () => 'water-v1';
  return mat;
}

// Ring-shaped grid that follows the camera: dense near you, sparse at the horizon.
function seaGeometry() {
  const radii = [0];
  let r = 0.6;
  while (r < 1600) { radii.push(r); r = r < 30 ? r + 0.6 : r * 1.06; }
  const seg = 160, pos = [], idx = [];
  pos.push(0, 0, 0);
  for (let i = 1; i < radii.length; i++) for (let j = 0; j < seg; j++) {
    const a = (j / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * radii[i], 0, Math.sin(a) * radii[i]);
  }
  const at = (i, j) => (i === 0 ? 0 : 1 + (i - 1) * seg + (j % seg));
  for (let j = 0; j < seg; j++) idx.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < radii.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j), d = at(i + 1, j + 1);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export class Waters {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.sea = makeWaterMaterial();
    this.seaMesh = new THREE.Mesh(seaGeometry(), this.sea);
    this.seaMesh.position.y = L.seaY;
    this.seaMesh.frustumCulled = false;
    this.seaMesh.receiveShadow = true;
    this.seaMesh.userData.noAO = true;
    this.seaMesh.renderOrder = -1;
    scene.add(this.seaMesh);
    this.pond = makeWaterMaterial({ waves: POND_WAVES, deep: '#2c5a4c', shallow: '#4f8a76', sss: '#6fb39a', steep: 0.3, foam: 0, ripple: 0.25, transparent: true, opacity: 0.86, stacks: false, shoreX: 1e5 });
    this.mats = [this.sea, this.pond];
    // mirror reflections (Ultra)
    this.mirror = { on: false, rt: null, cam: new THREE.PerspectiveCamera(), m: new THREE.Matrix4() };
  }

  setReflections(on) {
    const M = this.mirror;
    M.on = on;
    if (on && !M.rt) M.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });
    this.sea.userData.u.uMirrorAmt.value = on ? 0.85 : 0;
    this.sea.userData.u.uMirror.value = M.rt ? M.rt.texture : null;
  }

  // reflect the camera in the sea plane and render the world from below
  renderMirror(camera, hide) {
    const M = this.mirror;
    if (!M.on) return;
    const y = L.seaY;
    const cam = M.cam;
    cam.copy(camera);
    cam.position.y = 2 * y - camera.position.y;
    const target = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position);
    target.y = 2 * y - target.y;
    cam.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    cam.up.y *= -1;
    cam.lookAt(target);
    cam.near = Math.max(0.5, camera.near);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    // clip everything below the water
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const r = this.renderer;
    const prevClip = r.clippingPlanes, prevRT = r.getRenderTarget(), prevXR = r.xr.enabled, prevShadow = r.shadowMap.autoUpdate;
    r.clippingPlanes = [plane];
    r.shadowMap.autoUpdate = false;
    for (const o of hide) o.visible = false;
    this.seaMesh.visible = false;
    r.setRenderTarget(M.rt);
    r.clear();
    r.render(this.scene, cam);
    r.setRenderTarget(prevRT);
    r.clippingPlanes = prevClip;
    r.shadowMap.autoUpdate = prevShadow;
    for (const o of hide) o.visible = true;
    this.seaMesh.visible = true;
    M.m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    M.m.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.sea.userData.u.uMirrorMatrix.value.copy(M.m);
  }

  update(t, camera, light, night) {
    this.seaMesh.position.x = Math.round(camera.position.x / 2) * 2;
    this.seaMesh.position.z = Math.round(camera.position.z / 2) * 2;
    for (const m of this.mats) {
      const u = m.userData.u;
      u.uTime.value = t;
      u.uSunDir.value.copy(light);
    }
    // darker, calmer colours at night
    const k = 1 - night * 0.75;
    this.sea.userData.u.uDeep.value.set('#0b3f57').multiplyScalar(k);
    this.sea.userData.u.uShallow.value.set('#1f7f8c').multiplyScalar(k);
    this.pond.userData.u.uDeep.value.set('#2c5a4c').multiplyScalar(k);
    this.pond.userData.u.uShallow.value.set('#4f8a76').multiplyScalar(k);
  }
}
