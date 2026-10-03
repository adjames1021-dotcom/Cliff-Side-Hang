// Post-processing: soft bloom that grows after dark, plus a gentle vignette.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Vignette = {
  uniforms: { tDiffuse: { value: null }, uAmt: { value: 0.3 }, uTint: { value: new THREE.Color(0.85, 0.7, 0.62) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uAmt; uniform vec3 uTint; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = (vUv - 0.5) * vec2(1.15, 1.0);
      float v = smoothstep(0.3, 0.85, length(p));
      c.rgb = mix(c.rgb, c.rgb * uTint, v * uAmt);
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.6, 0.95);
    this.composer.addPass(this.bloom);
    this.vignette = new ShaderPass(Vignette);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
    this.enabled = true;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  // night: 0 day .. 1 night, golden: 0..1 around sunrise/sunset
  setLook(night, golden) {
    this.bloom.strength = 0.22 + golden * 0.1 + night * 0.48;
    this.bloom.threshold = 0.95 - night * 0.22;
    this.bloom.radius = 0.55 + night * 0.2;
    this.vignette.uniforms.uAmt.value = 0.28 + night * 0.3;
    this.vignette.uniforms.uTint.value.setRGB(0.86 - night * 0.42, 0.72 - night * 0.34, 0.62 + night * 0.06);
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
