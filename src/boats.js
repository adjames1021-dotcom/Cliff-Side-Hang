// Sailboats: a lofted hull with painted topsides and antifouling, varnished trim, a rigged mast,
// a mainsail and jib that fill with the wind, a swinging boom and a tiller that steers.
import * as THREE from 'three';
import { Builder, rbox, sphere, capsule, torus, roundCyl } from './toon.js';
import { REAL, registerMesh } from './materials.js';

// Hull shape: station u (0 = transom, 1 = bow) -> half beam, sheer (deck edge) height, keel depth.
const HL = 5.4;
function hullAt(u) {
  const beam = u < 0.38 ? 0.84 + 0.16 * Math.sin((u / 0.38) * Math.PI / 2) : 1 - Math.pow((u - 0.38) / 0.62, 1.9);
  const sheer = 0.6 + 0.2 * u * u;
  const keel = -0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.95)), 0.55) + (u > 0.92 ? (u - 0.92) * 3 : 0);
  return { b: Math.max(0.004, beam), s: sheer, k: Math.min(keel, sheer - 0.05) };
}
// Section point: phi 0 (port sheer) .. PI (starboard sheer) through the keel.
function sectionPoint(h, phi, inset = 0) {
  const c = Math.cos(phi), sn = Math.sin(phi);
  const x = -(h.b - inset) * Math.sign(c) * Math.pow(Math.abs(c), 0.72);
  const y = h.s - inset * 0.4 - (h.s - h.k - inset * 0.6) * Math.pow(sn, 0.75);
  return [x, y];
}

function hullGeometry(colors, inner = false) {
  const NU = 30, NV = 26;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const bottom = new THREE.Color(colors.bottom), boot = new THREE.Color('#F4F1EA'), top = new THREE.Color(colors.hull), stripe = new THREE.Color(colors.stripe), inside = new THREE.Color('#EDE5D4');
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, h = hullAt(u), z = -HL / 2 + u * HL;
    for (let j = 0; j <= NV; j++) {
      const phi = (j / NV) * Math.PI;
      const [x, y] = sectionPoint(h, phi, inner ? 0.05 : 0);
      pos.push(x, inner ? Math.max(y, 0.06 + (h.s - 0.06) * 0) : y, z);
      if (inner) c.copy(inside);
      else if (y < 0.05) c.copy(bottom);
      else if (y < 0.12) c.copy(boot);
      else if (y > h.s - 0.09) c.copy(stripe);
      else c.copy(top);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b2 = a + NV + 1;
    if (inner) idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
    else idx.push(a, b2, a + 1, a + 1, b2, b2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function transomGeometry(color) {
  const h = hullAt(0), shape = new THREE.Shape();
  const n = 20;
  for (let j = 0; j <= n; j++) { const [x, y] = sectionPoint(h, (j / n) * Math.PI); if (j === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
  shape.lineTo(sectionPoint(h, 0)[0], h.s);
  const g = new THREE.ShapeGeometry(shape);
  g.translate(0, 0, -HL / 2 + 0.002);
  g.rotateY(Math.PI); // face backwards
  return g;
}

// the sheer line (top edge of the hull) on one side
function sheerCurve(side, inset = 0) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, h = hullAt(u);
    pts.push(new THREE.Vector3(side * Math.max(0.01, h.b - inset), h.s + 0.015, -HL / 2 + u * HL));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function nameTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = `600 78px Fredoka, "Trebuchet MS", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color; g.fillText(name, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.ready.then(() => { g.clearRect(0, 0, 512, 128); g.font = `600 78px Fredoka, "Trebuchet MS", sans-serif`; g.fillText(name, 256, 68); t.needsUpdate = true; });
  return t;
}

// A triangular sail as a grid that can be re-shaped each frame (camber, luffing).
class Sail {
  constructor(tack, head, clew, color, band, rows = 8, cols = 7) {
    this.tack = tack; this.head = head; this.clew = clew; this.rows = rows; this.cols = cols;
    const n = (rows + 1) * (cols + 1);
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3), idx = [];
    const c0 = new THREE.Color(color), c1 = new THREE.Color(band);
    for (let r = 0; r <= rows; r++) for (let k = 0; k <= cols; k++) {
      const i = r * (cols + 1) + k;
      const cc = r === 1 || (k === cols && r > 0) ? c1 : c0;
      col.set([cc.r, cc.g, cc.b], i * 3);
    }
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const a = r * (cols + 1) + k, b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geo.setIndex(idx);
    this.shape(0, 0.6, 0);
  }
  // fill: -1..1 (which side it bellies out to), depth: camber, luff: flapping 0..1
  shape(fill, depth, luff, t = 0) {
    const { tack, head, clew, rows, cols } = this;
    const v = new THREE.Vector3(), lu = new THREE.Vector3(), le = new THREE.Vector3();
    const span = new THREE.Vector3().subVectors(clew, tack);
    const nrm = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(head, tack), span).normalize();
    for (let r = 0; r <= rows; r++) {
      const h = r / rows; // 0 foot .. 1 head
      lu.lerpVectors(tack, head, h); // luff point
      le.lerpVectors(clew, head, h); // leech point
      for (let k = 0; k <= cols; k++) {
        const c = k / cols;
        v.lerpVectors(lu, le, c);
        const belly = Math.sin(Math.PI * c) * (1 - h * 0.7) * depth * fill;
        const flap = luff * Math.sin(t * 13 + c * 6 + h * 4) * 0.12 * Math.sin(Math.PI * c) * (1 - h * 0.5);
        v.addScaledVector(nrm, belly + flap);
        const i = (r * (cols + 1) + k) * 3;
        this.pos[i] = v.x; this.pos[i + 1] = v.y; this.pos[i + 2] = v.z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

const sailMat = () => {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, sheen: 0.3, sheenColor: new THREE.Color('#ffffff'), transmission: 0, transparent: false });
  return m;
};
let SAIL_MAT = null;
let HULL_MAT = null;

export function makeSailboat({ hull = '#2F5E8C', stripe = '#F4F1EA', bottom = '#7A2E2A', sail = '#F7F3EA', band = '#E8893A', name = 'Pippin', scale = 1, cabin = false } = {}) {
  SAIL_MAT ||= sailMat();
  HULL_MAT ||= new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const root = new THREE.Group(); // at the waterline, heading +z
  const heel = new THREE.Group(); // rolls and pitches with the sea
  root.add(heel);

  const outer = new THREE.Mesh(hullGeometry({ hull, stripe, bottom }), HULL_MAT);
  outer.castShadow = true; outer.receiveShadow = true;
  registerMesh(outer, 'glossy');
  const inner = new THREE.Mesh(hullGeometry({ hull, stripe, bottom }, true), REAL.paint);
  inner.receiveShadow = true;
  registerMesh(inner, 'paint');
  const transom = new THREE.Mesh(transomGeometry(hull), new THREE.MeshPhysicalMaterial({ color: hull, roughness: 0.3, clearcoat: 0.8 }));
  registerMesh(transom, 'glossy');
  heel.add(outer, inner, transom);
  transom.material.userData.envK = 1;

  const b = new Builder();
  const VARN = '#A8723C', TEAK = '#B98A57', METAL = '#C9CDD2';
  // gunwales and rub rails
  for (const side of [-1, 1]) {
    b.add(new THREE.TubeGeometry(sheerCurve(side), 40, 0.035, 6), VARN, {}, { mat: 'wood' });
    b.add(new THREE.TubeGeometry(sheerCurve(side, 0.06), 40, 0.025, 5), VARN, { pos: [0, -0.02, 0] }, { mat: 'wood' });
  }
  // foredeck over the bow
  {
    const shape = new THREE.Shape();
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = 0.66 + (i / 12) * 0.34; pts.push([hullAt(u).b, -HL / 2 + u * HL]); }
    shape.moveTo(-pts[0][0], pts[0][1]);
    for (const [x, z] of pts) shape.lineTo(-x, z);
    for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
    // follow the sheer
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setY(i, hullAt((z + HL / 2) / HL).s + 0.005); }
    g.computeVertexNormals();
    b.add(g, '#F2EEE6', {}, { mat: 'paint' });
    for (let i = 0; i < 8; i++) b.add(rbox(0.03, 0.004, 1.7, 0.001), '#D9D2C4', { pos: [-0.35 + i * 0.1, hullAt(0.8).s + 0.012, 1.4], rot: [-0.12, 0, 0] }, { mat: 'paint', outline: false });
  }
  // cockpit: floorboards, side benches, thwart, centreboard case
  for (let i = 0; i < 9; i++) b.add(rbox(0.09, 0.03, 3.3, 0.01), i % 2 ? TEAK : VARN, { pos: [-0.4 + i * 0.1, 0.1, -0.55] }, { mat: 'wood' });
  for (const side of [-1, 1]) {
    b.add(rbox(0.32, 0.05, 2.9, 0.015), TEAK, { pos: [side * 0.7, 0.4, -0.75] }, { mat: 'wood' });
    b.add(rbox(0.04, 0.3, 2.8, 0.01), '#E7DFCF', { pos: [side * 0.54, 0.25, -0.75] }, { mat: 'paint' });
  }
  b.add(rbox(1.75, 0.06, 0.32, 0.015), TEAK, { pos: [0, 0.42, 0.35] }, { mat: 'wood' });
  b.add(rbox(0.12, 0.34, 1.2, 0.02), '#E7DFCF', { pos: [0, 0.22, 0.6] }, { mat: 'paint' });
  // little cabin trunk on the bigger boats
  if (cabin) {
    b.add(rbox(1.3, 0.42, 1.5, 0.12), '#F2EEE6', { pos: [0, 0.82, 1.35] }, { mat: 'paint' });
    for (const side of [-1, 1]) for (const z of [1.05, 1.55]) b.add(rbox(0.02, 0.14, 0.32, 0.05), '#1E2A30', { pos: [side * 0.655, 0.86, z] }, { mat: 'glossy', outline: false });
    b.add(rbox(1.36, 0.05, 1.56, 0.03), VARN, { pos: [0, 1.04, 1.35] }, { mat: 'wood' });
  }
  // mast, spreaders, rigging
  const MAST_Z = 1.15, MAST_H = 6.3;
  b.add(new THREE.CylinderGeometry(0.045, 0.065, MAST_H, 10), METAL, { pos: [0, MAST_H / 2 + 0.1, MAST_Z] }, { mat: 'metal' });
  b.add(rbox(1.0, 0.04, 0.05, 0.01), METAL, { pos: [0, 4.0, MAST_Z] }, { mat: 'metal' });
  b.add(sphere(0.05, 8, 6), METAL, { pos: [0, MAST_H + 0.12, MAST_Z] }, { mat: 'metal' });
  const line = (a, c, r = 0.008, colr = '#3A3A3A') => {
    const dir = new THREE.Vector3().subVectors(c, a), len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    b.add(new THREE.CylinderGeometry(r, r, len, 4), colr, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), { mat: 'metal', outline: false });
  };
  const top = new THREE.Vector3(0, MAST_H + 0.05, MAST_Z);
  const bowPt = new THREE.Vector3(0, hullAt(1).s + 0.05, HL / 2 - 0.05);
  line(top, bowPt);
  for (const side of [-1, 1]) {
    const spr = new THREE.Vector3(side * 0.5, 4.0, MAST_Z);
    const chain = new THREE.Vector3(side * (hullAt(0.65).b - 0.02), hullAt(0.65).s, MAST_Z - 0.35);
    line(top, spr); line(spr, chain);
    b.add(rbox(0.04, 0.02, 0.12, 0.005), METAL, { pos: [chain.x, chain.y + 0.01, chain.z] }, { mat: 'metal', outline: false });
  }
  // cleats, bow fitting, fenders
  for (const [x, z] of [[-0.62, -2.2], [0.62, -2.2], [0, 2.45], [-0.75, 0.35], [0.75, 0.35]]) b.add(rbox(0.12, 0.03, 0.04, 0.01), METAL, { pos: [x, hullAt((z + HL / 2) / HL).s + 0.03, z] }, { mat: 'metal', outline: false });
  // rudder (moves with the tiller) is separate
  const hullParts = b.build({ castShadow: true, outline: true });
  heel.add(hullParts);

  // name on the transom
  const nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), new THREE.MeshStandardMaterial({ map: nameTexture(name, stripe), transparent: true, roughness: 0.4 }));
  nameMesh.position.set(0, 0.36, -HL / 2 - 0.004);
  nameMesh.rotation.y = Math.PI;
  heel.add(nameMesh);

  // rudder + tiller on a pintle at the transom
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, 0.3, -HL / 2 - 0.06);
  const rb = new Builder();
  rb.add(rbox(0.04, 1.0, 0.36, 0.02), '#E9E3D6', { pos: [0, -0.35, -0.08] }, { mat: 'glossy' });
  rb.add(rbox(0.05, 0.05, 1.1, 0.02), VARN, { pos: [0, 0.32, 0.55], rot: [-0.12, 0, 0] }, { mat: 'wood' });
  rb.add(capsule(0.03, 0.12, 2, 6), '#2A2A2A', { pos: [0, 0.38, 1.08], rot: [Math.PI / 2, 0, 0] }, { mat: 'fabric', outline: false });
  rudderPivot.add(rb.build({ castShadow: true }));
  heel.add(rudderPivot);

  // boom swings round the mast
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, 1.2, MAST_Z);
  const bb = new Builder();
  bb.add(new THREE.CylinderGeometry(0.04, 0.04, 2.75, 8), METAL, { pos: [0, 0, -1.37], rot: [Math.PI / 2, 0, 0] }, { mat: 'metal' });
  bb.add(sphere(0.05, 8, 6), '#2A2A2A', { pos: [0, -0.02, -2.72] }, { mat: 'metal', outline: false });
  boomPivot.add(bb.build({ castShadow: true }));
  heel.add(boomPivot);
  // mainsail lives in the boom's frame so it swings with it
  const main = new Sail(new THREE.Vector3(0, 0.05, -0.06), new THREE.Vector3(0, MAST_H - 1.25, -0.08), new THREE.Vector3(0, 0.05, -2.68), sail, band);
  const mainMesh = new THREE.Mesh(main.geo, SAIL_MAT);
  mainMesh.castShadow = true;
  registerMesh(mainMesh, 'cloth');
  mainMesh.userData.real = SAIL_MAT;
  boomPivot.add(mainMesh);
  // battens across the mainsail
  const battens = [];
  // jib from the forestay to a clew that swings across
  const jibPivot = new THREE.Group();
  jibPivot.position.set(0, 0, 0);
  const jib = new Sail(new THREE.Vector3(0, hullAt(1).s + 0.12, HL / 2 - 0.25), new THREE.Vector3(0, 4.7, MAST_Z + 0.38), new THREE.Vector3(0, 0.75, MAST_Z - 0.45), sail, band, 6, 5);
  const jibMesh = new THREE.Mesh(jib.geo, SAIL_MAT);
  jibMesh.castShadow = true;
  registerMesh(jibMesh, 'cloth');
  jibMesh.userData.real = SAIL_MAT;
  heel.add(jibMesh);

  // masthead pennant
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14, 4, 1).translate(0.21, 0, 0), new THREE.MeshStandardMaterial({ color: band, side: THREE.DoubleSide, roughness: 0.8 }));
  pennant.position.set(0, MAST_H + 0.22, MAST_Z);
  heel.add(pennant);

  // fenders hang over the side while moored
  const fenders = new THREE.Group();
  const fb = new Builder();
  for (const z of [-1.2, 0.4]) {
    fb.add(capsule(0.09, 0.32, 4, 10), '#F4F1EA', { pos: [0.98, 0.25, z] }, { mat: 'glossy' });
    fb.add(capsule(0.006, 0.38, 2, 4), '#E8E2D4', { pos: [0.92, 0.58, z] }, { mat: 'fabric', outline: false });
  }
  fenders.add(fb.build({ castShadow: true }));
  heel.add(fenders);

  root.scale.setScalar(scale);
  const boat = {
    root, heel, boomPivot, rudderPivot, pennant, fenders, main, jib, jibMesh, mainMesh, battens,
    // seats in the boat's frame (helmsman on the stern bench, crew on the thwart)
    seats: { helm: new THREE.Vector3(0.0, 0.46, -1.85), a: new THREE.Vector3(-0.42, 0.47, 0.35), b: new THREE.Vector3(0.42, 0.47, 0.35) },
    boom: 0, rudder: 0, t: Math.random() * 10,
    // windRel: wind angle relative to the bow (radians, 0 = wind from dead ahead); trim 0..1
    setSails(windRel, trim, dt) {
      this.t += dt;
      const a = Math.atan2(Math.sin(windRel), Math.cos(windRel));
      const off = Math.abs(a); // 0 head to wind .. PI dead downwind
      const side = a >= 0 ? -1 : 1; // the boom goes to leeward
      const irons = off < 0.6;
      const target = irons ? Math.sin(this.t * 1.7) * 0.15 : side * THREE.MathUtils.clamp((off - 0.45) * 0.55 * (1.15 - trim * 0.5), 0.12, 1.35);
      this.boom += (target - this.boom) * Math.min(1, dt * (irons ? 4 : 1.6));
      boomPivot.rotation.y = this.boom;
      const fill = irons ? 0 : side;
      main.shape(fill, irons ? 0 : 0.32, irons ? 1 : Math.max(0, 0.75 - off) * 0.4, this.t);
      // the jib clew swings to the same side as the boom
      jib.clew.x = THREE.MathUtils.lerp(jib.clew.x, irons ? 0 : side * 0.7, Math.min(1, dt * 1.5));
      jib.shape(fill, irons ? 0 : 0.22, irons ? 1 : 0, this.t + 1);
      // pennant streams away from the wind
      pennant.rotation.y = Math.PI + a + Math.sin(this.t * 7) * 0.12;
    },
    setRudder(r) {
      this.rudder += (r - this.rudder) * 0.2;
      rudderPivot.rotation.y = -this.rudder * 0.55;
    },
  };
  boat.setSails(Math.PI / 2, 0.5, 0.016);
  return boat;
}

export const BOAT_LEN = HL;

// A little rowing boat (the same hull, smaller and without a rig), e.g. upturned on the beach.
export function makeRowboat({ hull = '#D9544D', stripe = '#F4F1EA', bottom = '#2F5E8C' } = {}) {
  HULL_MAT ||= new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const g = new THREE.Group();
  const outer = new THREE.Mesh(hullGeometry({ hull, stripe, bottom }), HULL_MAT);
  const inner = new THREE.Mesh(hullGeometry({ hull, stripe, bottom }, true), REAL.paint);
  outer.castShadow = true; outer.receiveShadow = true; inner.receiveShadow = true;
  registerMesh(outer, 'glossy'); registerMesh(inner, 'paint');
  const b = new Builder();
  for (const side of [-1, 1]) b.add(new THREE.TubeGeometry(sheerCurve(side), 30, 0.035, 6), '#A8723C', {}, { mat: 'wood' });
  b.add(rbox(1.6, 0.06, 0.32, 0.015), '#B98A57', { pos: [0, 0.42, 0.2] }, { mat: 'wood' });
  b.add(rbox(1.5, 0.06, 0.32, 0.015), '#B98A57', { pos: [0, 0.42, -1.3] }, { mat: 'wood' });
  g.add(outer, inner, b.build({ castShadow: true }));
  g.scale.set(0.6, 0.6, 0.55);
  return g;
}
