// Post-processing: ambient occlusion, sun rays, bloom, a gentle grade, then tone mapping.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// AO that skips things whose vertex shaders place them on the GPU (grass, leaves) or that are far away (sky, sea).
class AOPass extends GTAOPass {
  overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      cache.set(o, o.visible);
      if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO) o.visible = false;
    });
  }
}

// Light shafts: march from each pixel toward the sun, gathering bright sky that peeks past obstacles.
const Rays = {
  uniforms: {
    tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 0 },
    uCol: { value: new THREE.Color(1, 0.9, 0.7) }, uAspect: { value: 1 }, uThresh: { value: 0.9 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAmt; uniform vec3 uCol; uniform float uAspect; uniform float uThresh;
    varying vec2 vUv;
    float source(vec2 uv) {
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float d = length((uv - uSun) * vec2(uAspect, 1.0));
      return smoothstep(uThresh, uThresh * 2.2, l) * (1.0 - smoothstep(0.0, 0.5, d));
    }
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      if (uAmt <= 0.0) { gl_FragColor = base; return; }
      const int N = 40;
      vec2 stepv = (vUv - uSun) / float(N) * 0.92;
      vec2 uv = vUv;
      float acc = 0.0, w = 1.0;
      float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
      uv -= stepv * jitter;
      for (int i = 0; i < N; i++) {
        uv -= stepv;
        acc += source(uv) * w;
        w *= 0.962;
      }
      acc /= float(N);
      gl_FragColor = vec4(base.rgb + uCol * acc * uAmt, base.a);
    }`,
};

const Grade = {
  uniforms: {
    tDiffuse: { value: null }, uVig: { value: 0.3 }, uTint: { value: new THREE.Color(0.86, 0.72, 0.62) },
    uSat: { value: 1.08 }, uContrast: { value: 1.04 }, uLift: { value: new THREE.Color(0, 0, 0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVig, uSat, uContrast; uniform vec3 uTint, uLift; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.18) * uContrast + 0.18 + uLift;
      vec2 p = (vUv - 0.5) * vec2(1.15, 1.0);
      float v = smoothstep(0.3, 0.88, length(p));
      c.rgb = mix(c.rgb, c.rgb * uTint, v * uVig);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.samples = 4;
    this.build();
    this.enabled = true;
    this.want = { ao: false, rays: true, bloom: true };
    this.sunScreen = new THREE.Vector3();
  }

  build() {
    const { x, y } = this.size;
    const rt = new THREE.WebGLRenderTarget(x, y, { type: THREE.HalfFloatType, samples: this.samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ao = new AOPass(this.scene, this.camera, x, y);
    this.ao.blendIntensity = 0.85;
    this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 12 });
    this.ao.enabled = false;
    this.composer.addPass(this.ao);
    this.rays = new ShaderPass(Rays);
    this.composer.addPass(this.rays);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(x, y), 0.3, 0.6, 0.95);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(Grade);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  setAA(on) {
    const s = on ? 4 : 0;
    if (s === this.samples) return;
    this.samples = s;
    this.composer.renderTarget1.samples = s;
    this.composer.renderTarget2.samples = s;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.size.set(Math.round(w * pr), Math.round(h * pr));
  }

  // night 0..1, golden 0..1, light: { dir (world), color, strength }, toon: flat look
  setLook(night, golden, light, toon) {
    const w = this.want;
    this.ao.enabled = w.ao && !toon;
    this.bloom.enabled = w.bloom;
    this.bloom.strength = toon ? 0.25 + night * 0.5 : 0.16 + golden * 0.12 + night * 0.4;
    this.bloom.threshold = toon ? 0.95 - night * 0.22 : 1.0 - night * 0.25;
    this.bloom.radius = 0.5 + night * 0.25;
    const g = this.grade.uniforms;
    g.uVig.value = 0.26 + night * 0.28;
    g.uTint.value.setRGB(0.86 - night * 0.42, 0.74 - night * 0.34, 0.66 + night * 0.04);
    g.uSat.value = toon ? 1 : 1.1 - night * 0.08;
    g.uContrast.value = toon ? 1 : 1.05;
    // sun rays: only when the sun (or moon) is in front of us
    const r = this.rays.uniforms;
    let amt = 0;
    if (w.rays && !toon && light) {
      const s = this.sunScreen.copy(light.dir).multiplyScalar(400).add(this.camera.position).project(this.camera);
      if (s.z < 1 && light.dir.y > -0.03) {
        r.uSun.value.set(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5);
        const edge = Math.max(Math.abs(s.x), Math.abs(s.y));
        amt = light.strength * (1 - THREE.MathUtils.smoothstep(edge, 0.9, 1.6));
        r.uCol.value.copy(light.color);
      }
    }
    r.uAmt.value = amt;
    r.uAspect.value = this.size.x / Math.max(1, this.size.y);
    r.uThresh.value = night > 0.5 ? 0.35 : 0.9;
    this.rays.enabled = amt > 0.001;
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
