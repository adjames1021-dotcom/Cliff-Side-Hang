// The cove under the cliff: steps cut down the cliff face, a sandy beach, a boathouse and the dock.
import * as THREE from 'three';
import { Builder, rbox, sphere, capsule, torus, lathe, roundCyl, rng } from './toon.js';
import { REAL, registerMesh } from './materials.js';
import { W, SEA_Y, CLIFF_LEGS, CLIFF_LANDINGS, beachHeight, shoreX, dockHeight } from './wilds.js';
import { signBoard } from './woods.js';
import { noiseRock } from './foliage.js';
import { makeRowboat } from './boats.js';

export function buildCove(ctx) {
  const { scene, fol, circle, seats, lampGlows, G, lamps } = ctx;
  const R = rng(9090);
  const b = new Builder();
  const ROPE = '#C9B48A', POST = '#5B4130', STONE = ['#9C8B78', '#8E7D6B', '#A89683'];

  // ---------- the beach ----------
  {
    const x0 = -30.5, x1 = -19.5, z0 = W.cove.z0 - 1.5, z1 = W.cove.z1 + 1.5;
    const nx = 56, nz = 96;
    const pos = [], col = [], idx = [];
    const dry = new THREE.Color('#D8C49C'), wet = new THREE.Color('#9E8B68'), under = new THREE.Color('#7E7258'), peb = new THREE.Color('#8C8378'), c = new THREE.Color();
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
      // fade into the cliff foot at both ends of the cove
      const endK = Math.min(1, Math.max(0, Math.min(z - z0, z1 - z) / 2.5));
      const y = THREE.MathUtils.lerp(-9.4, beachHeight(x, z), endK);
      pos.push(x, y, z);
      const sx = shoreX(z);
      c.copy(dry);
      c.lerp(wet, THREE.MathUtils.smoothstep(sx + 2.2 - x, 0, 2.2));
      if (x < sx) c.copy(under);
      const n = Math.sin(x * 3.1 + z * 1.7) * Math.sin(z * 2.3 - x * 0.9);
      if (n > 0.7 && x > sx) c.lerp(peb, 0.6);
      c.multiplyScalar(0.94 + 0.06 * Math.sin(x * 9.1 + z * 7.3));
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b2 = a + 1, c2 = a + nx + 1, d = c2 + 1;
      idx.push(a, c2, b2, b2, c2, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const sand = new THREE.Mesh(g, REAL.ground);
    sand.receiveShadow = true;
    registerMesh(sand, 'ground');
    scene.add(sand);
    // scattered stones, shells-in-the-sand look, seaweed at the tide line
    for (let i = 0; i < 140; i++) {
      const z = W.cove.z0 + R() * (W.cove.z1 - W.cove.z0), x = THREE.MathUtils.lerp(-19.9, shoreX(z) - 0.8, Math.pow(R(), 0.7));
      fol.pebble(x, beachHeight(x, z) - 0.02, z, 0.04 + R() * 0.09, ['#8C8378', '#A39A8E', '#6F6A63', '#B9AE9C'][i % 4]);
    }
    for (let i = 0; i < 26; i++) {
      const z = W.cove.z0 + 1 + R() * (W.cove.z1 - W.cove.z0 - 2), x = shoreX(z) + 0.4 + R() * 0.9;
      b.add(capsule(0.02, 0.35 + R() * 0.3, 2, 4), '#3E5A2E', { pos: [x, beachHeight(x, z) + 0.01, z], rot: [Math.PI / 2, R() * 6, 0] }, { mat: 'foliage', outline: false });
    }
    // rocks at the foot of the cliff and a tide-pool reef round the sea stack
    for (let i = 0; i < 18; i++) {
      const z = W.cove.z0 + R() * (W.cove.z1 - W.cove.z0), x = -20.1 - R() * 0.8, s = 0.4 + R() * 0.8;
      if (Math.abs(z - W.dock.z) < 2.5) continue;
      fol.rock(x, beachHeight(x, z) - s * 0.3, z, s, STONE[i % 3], 0.8, 0.3);
      circle(x, z, s * 0.7);
    }
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2, r = 1.6 + R() * 1.8, x = -23.8 + Math.cos(a) * r, z = 4 + Math.sin(a) * r;
      if (z < W.cove.z0 + 0.3) continue;
      fol.rock(x, beachHeight(x, z) - 0.25, z, 0.3 + R() * 0.45, '#7A6E62', 0.6, 0.6);
    }
    circle(-23.8, 4.0, 1.5);
  }

  // ---------- steps down the cliff ----------
  {
    for (const leg of CLIFF_LEGS) {
      const [ax, az, ay] = leg.a, [bx, bz, by] = leg.b;
      const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
      const nx = Math.cos(yaw), nz = -Math.sin(yaw); // to the right of travel
      const outward = Math.sign(-nx) || 1; // which side faces the sea (west, -x)
      const nSteps = Math.max(4, Math.round((ay - by) / 0.17));
      if (leg.kind === 'rock') {
        // a rough rock shelf under the walkway, carved out of the cliff
        for (let i = 0; i <= Math.ceil(len / 1.1); i++) {
          const k = i / Math.ceil(len / 1.1), x = ax + (bx - ax) * k, z = az + (bz - az) * k, y = ay + (by - ay) * k;
          const g = noiseRock(R, 2);
          b.add(g, STONE[i % 3], { pos: [x + nx * outward * 0.35, y - 0.85, z + nz * outward * 0.35], rot: [R() * 0.3, R() * 6, R() * 0.3], scale: [1.1, 0.85, 0.9] }, { mat: 'rock' });
        }
        // stone treads
        for (let i = 0; i < nSteps; i++) {
          const k = (i + 0.5) / nSteps, x = ax + (bx - ax) * k, z = az + (bz - az) * k, y = ay + (by - ay) * k;
          b.add(rbox(1.36, 0.16, (len / nSteps) * 1.08, 0.04), STONE[(i * 7) % 3], { pos: [x, y - 0.07, z], rot: [0, yaw + (R() - 0.5) * 0.04, 0] }, { mat: 'stone' });
        }
      } else {
        // timber stair on posts down onto the sand
        for (let i = 0; i < nSteps; i++) {
          const k = (i + 0.5) / nSteps, x = ax + (bx - ax) * k, z = az + (bz - az) * k, y = ay + (by - ay) * k;
          b.add(rbox(1.15, 0.06, (len / nSteps) * 0.9, 0.015), i % 2 ? '#8E6640' : '#7F5A38', { pos: [x, y - 0.03, z], rot: [0, yaw, 0] }, { mat: 'wood' });
        }
        for (const s of [-1, 1]) {
          const p0 = new THREE.Vector3(ax + nx * s * 0.58, ay - 0.12, az + nz * s * 0.58), p1 = new THREE.Vector3(bx + nx * s * 0.58, by - 0.12, bz + nz * s * 0.58);
          const mid = p0.clone().add(p1).multiplyScalar(0.5), dir = p1.clone().sub(p0);
          b.add(new THREE.BoxGeometry(0.08, 0.22, dir.length()), '#6A4A2E', new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize()), new THREE.Vector3(1, 1, 1)), { mat: 'wood' });
          for (let i = 0; i <= 3; i++) {
            const k = i / 3, x = ax + (bx - ax) * k + nx * s * 0.58, z = az + (bz - az) * k + nz * s * 0.58, y = ay + (by - ay) * k;
            const ground = beachHeight(x, z);
            b.add(rbox(0.1, y - ground + 0.1, 0.1, 0.02), '#5B4130', { pos: [x, (y + ground) / 2 - 0.1, z] }, { mat: 'wood' });
          }
        }
      }
      // rope railing on posts along the sea side
      const posts = Math.max(2, Math.round(len / 1.6));
      const ropePts = [];
      for (let i = 0; i <= posts; i++) {
        const k = i / posts, x = ax + (bx - ax) * k + nx * outward * (leg.hw - 0.05), z = az + (bz - az) * k + nz * outward * (leg.hw - 0.05), y = ay + (by - ay) * k;
        b.add(capsule(0.045, 0.95, 2, 8), POST, { pos: [x, y + 0.42, z] }, { mat: 'wood' });
        b.add(sphere(0.06, 8, 6), '#4A3424', { pos: [x, y + 0.95, z] }, { mat: 'wood', outline: false });
        ropePts.push(new THREE.Vector3(x, y + 0.86, z));
      }
      for (let i = 0; i < ropePts.length - 1; i++) {
        const a = ropePts[i], c = ropePts[i + 1];
        const sag = [a, a.clone().lerp(c, 0.5).add(new THREE.Vector3(0, -0.12, 0)), c];
        b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sag), 8, 0.018, 4), ROPE, {}, { mat: 'fabric', outline: false });
      }
    }
    // landings: flat stone, a lantern on each
    for (const l of CLIFF_LANDINGS) {
      b.add(roundCyl(l.r + 0.1, 0.18, 0.05, 14), STONE[1], { pos: [l.x, l.y - 0.18, l.z] }, { mat: 'stone' });
      for (let i = 0; i < 3; i++) b.add(noiseRock(R, 2), STONE[i % 3], { pos: [l.x - 0.6 - R() * 0.3, l.y - 0.95, l.z + (R() - 0.5) * 1.6], scale: [1.0, 0.8, 0.9] }, { mat: 'rock' });
      const lx = l.x - l.r * 0.65, lz = l.z;
      b.add(capsule(0.04, 1.3, 2, 8), '#2B2826', { pos: [lx, l.y + 0.62, lz] }, { mat: 'metal' });
      b.add(rbox(0.2, 0.26, 0.2, 0.03), '#2B2826', { pos: [lx, l.y + 1.42, lz] }, { mat: 'metal' });
      G.add(sphere(0.07, 10, 8), '#FFE08A', { pos: [lx, l.y + 1.42, lz] });
      lampGlows.push({ p: new THREE.Vector3(lx, l.y + 1.42, lz), size: 1.3, color: '#FFE08A' });
      lamps.push({ x: lx, y: l.y + 1.4, z: lz });
    }
    // sign and a gap in the fence at the top
    const sg = signBoard(['Cove  ·  steep steps'], 1.4, 0.28, { arrow: -1 });
    sg.position.set(-17.9, 1.35, 2.15);
    sg.rotation.y = Math.PI / 2;
    scene.add(sg);
    b.add(roundCyl(0.06, 1.5, 0.02, 8), POST, { pos: [-17.9, -0.05, 2.15] }, { mat: 'wood' });
    circle(-17.9, 2.15, 0.12);
  }

  // ---------- the dock ----------
  {
    const d = W.dock;
    const n = Math.round((d.x1 - d.x0) / 0.24);
    for (let i = 0; i < n; i++) {
      const x = d.x1 - (i + 0.5) * ((d.x1 - d.x0) / n);
      const y = dockHeight(x);
      b.add(rbox(0.22, 0.06, d.hw * 2, 0.012), i % 4 === 0 ? '#7F5A38' : i % 2 ? '#8E6640' : '#9A7048', { pos: [x, y - 0.03, d.z + (R() - 0.5) * 0.03], rot: [0, (R() - 0.5) * 0.015, 0] }, { mat: 'wood' });
    }
    // stringers under the planks, pilings in pairs
    for (const s of [-1, 1]) b.add(rbox(d.x1 - d.x0, 0.16, 0.12, 0.02), '#5B4130', { pos: [(d.x0 + d.x1) / 2, d.y - 0.14, d.z + s * (d.hw - 0.08)] }, { mat: 'wood' });
    for (let x = d.x0 + 0.3; x < d.x1 - 1.2; x += 2.4) {
      for (const s of [-1, 1]) {
        const z = d.z + s * (d.hw + 0.06);
        b.add(roundCyl(0.13, 3.0, 0.04, 12), '#5B4A3A', { pos: [x, SEA_Y - 2.2, z] }, { mat: 'wood' });
        b.add(sphere(0.135, 10, 6), '#4A3B2E', { pos: [x, SEA_Y + 0.8, z], scale: [1, 0.4, 1] }, { mat: 'wood', outline: false });
        // weed and barnacles at the waterline
        b.add(roundCyl(0.14, 0.35, 0.04, 12), '#3E4A32', { pos: [x, SEA_Y - 0.3, z] }, { mat: 'foliage', outline: false });
      }
      b.add(rbox(0.1, 0.14, d.hw * 2 + 0.3, 0.02), '#5B4130', { pos: [x, d.y - 0.32, d.z] }, { mat: 'wood' });
    }
    // bollards + cleats where the boats tie up
    for (const x of [-27.5, -31.5, -35.5]) for (const s of [-1, 1]) {
      const z = d.z + s * (d.hw - 0.15);
      b.add(roundCyl(0.1, 0.32, 0.04, 12), '#2B2826', { pos: [x, d.y, z] }, { mat: 'metal' });
      b.add(rbox(0.3, 0.05, 0.08, 0.02), '#2B2826', { pos: [x, d.y + 0.34, z] }, { mat: 'metal' });
      circle(x, z, 0.12);
    }
    // lanterns on posts
    for (const x of [-24.6, -30, -36.4]) {
      const z = d.z - d.hw + 0.1;
      b.add(rbox(0.12, 1.7, 0.12, 0.02), POST, { pos: [x, d.y + 0.85, z] }, { mat: 'wood' });
      b.add(rbox(0.5, 0.06, 0.06, 0.02), POST, { pos: [x, d.y + 1.68, z + 0.2], rot: [0, Math.PI / 2, 0] }, { mat: 'wood' });
      b.add(lathe([[0, 0], [0.11, 0], [0.13, 0.18], [0.06, 0.26], [0, 0.28]], 8), '#2B2826', { pos: [x, d.y + 1.35, z + 0.38] }, { mat: 'metal' });
      G.add(sphere(0.07, 10, 8), '#FFE08A', { pos: [x, d.y + 1.47, z + 0.38] });
      lampGlows.push({ p: new THREE.Vector3(x, d.y + 1.47, z + 0.38), size: 1.3, color: '#FFE08A' });
      lamps.push({ x, y: d.y + 1.45, z: z + 0.38 });
      circle(x, z, 0.12);
    }
    // ladder at the end, a bench, a lifebuoy, a coil of rope, crab pot
    for (const s of [-0.25, 0.25]) b.add(rbox(0.05, 1.6, 0.05, 0.01), '#9AA0A6', { pos: [d.x0 - 0.05, d.y - 0.75, d.z + s] }, { mat: 'metal' });
    for (let i = 0; i < 5; i++) b.add(capsule(0.018, 0.48, 2, 6), '#9AA0A6', { pos: [d.x0 - 0.05, d.y - 0.2 - i * 0.3, d.z], rot: [Math.PI / 2, 0, 0] }, { mat: 'metal', outline: false });
    {
      const x = d.x0 + 1.1, z = d.z, y = d.y;
      b.add(rbox(0.36, 0.06, 1.5, 0.02), '#8E6640', { pos: [x, y + 0.45, z] }, { mat: 'wood' });
      for (const s of [-0.55, 0.55]) b.add(rbox(0.32, 0.45, 0.08, 0.02), '#5B4130', { pos: [x, y + 0.22, z + s] }, { mat: 'wood' });
      for (const s of [-0.4, 0.4]) seats.push({ id: `dock-bench-${s < 0 ? 0 : 1}`, kind: 'bench', x, y: y + 0.5, z: z + s, yaw: Math.PI / 2 });
      circle(x, z - 0.4, 0.25); circle(x, z + 0.4, 0.25);
    }
    b.add(torus(0.28, 0.07, 10, 24), '#E8E2D4', { pos: [-26.0, d.y + 0.95, d.z - d.hw + 0.05] }, { mat: 'glossy' });
    for (let i = 0; i < 4; i++) b.add(torus(0.28, 0.072, 10, 6, Math.PI / 6), '#D9544D', { pos: [-26.0, d.y + 0.95, d.z - d.hw + 0.05], rot: [0, 0, (i / 4) * Math.PI * 2] }, { mat: 'glossy', outline: false });
    b.add(rbox(0.1, 1.3, 0.1, 0.02), POST, { pos: [-26.0, d.y + 0.6, d.z - d.hw - 0.05] }, { mat: 'wood' });
    for (let i = 0; i < 4; i++) b.add(torus(0.18 - i * 0.025, 0.02, 4, 18), ROPE, { pos: [-33.2, d.y + 0.02 + i * 0.03, d.z + 0.5], rot: [Math.PI / 2, 0, 0] }, { mat: 'fabric', outline: false });
    b.add(rbox(0.5, 0.36, 0.5, 0.06), '#C9A24A', { pos: [-29.2, d.y + 0.18, d.z - 0.6] }, { mat: 'fabric' });
    circle(-29.2, d.z - 0.6, 0.3);
  }

  // ---------- boathouse + beach life ----------
  {
    const x = -21.4, z = 18.4, y = beachHeight(x, z);
    b.group({ pos: [x, y, z], rot: [0, -Math.PI / 2, 0] }, (g) => {
      g.add(rbox(3.4, 0.25, 2.6, 0.04), '#7A6E62', { pos: [0, -0.05, 0] }, { mat: 'stone' });
      for (let i = 0; i < 12; i++) g.add(rbox(3.2, 0.2, 0.06, 0.01), i % 2 ? '#3E6C8C' : '#356180', { pos: [0, 0.2 + i * 0.19, 1.22] }, { mat: 'paint' });
      for (let i = 0; i < 12; i++) g.add(rbox(3.2, 0.2, 0.06, 0.01), i % 2 ? '#3E6C8C' : '#356180', { pos: [0, 0.2 + i * 0.19, -1.22] }, { mat: 'paint' });
      for (const sx of [-1.58, 1.58]) g.add(rbox(0.06, 2.3, 2.5, 0.01), '#3E6C8C', { pos: [sx, 1.25, 0] }, { mat: 'paint' });
      for (const sd of [-1, 1]) g.add(rbox(3.7, 0.08, 1.7, 0.02), '#B4593A', { pos: [0, 2.75, sd * 0.68], rot: [sd * 0.55, 0, 0] }, { mat: 'stone' });
      g.add(rbox(1.4, 1.6, 0.05, 0.02), '#F2EEE6', { pos: [0, 0.95, 1.27] }, { mat: 'paint' });
      for (let i = 0; i < 4; i++) g.add(rbox(0.04, 1.5, 0.06, 0.01), '#D9D2C4', { pos: [-0.5 + i * 0.33, 0.95, 1.29] }, { mat: 'paint', outline: false });
      g.add(rbox(0.6, 0.5, 0.05, 0.02), '#1E2A30', { pos: [1.58, 1.5, 0.4], rot: [0, Math.PI / 2, 0] }, { mat: 'glossy', outline: false });
      g.add(torus(0.22, 0.06, 8, 18), '#E8E2D4', { pos: [-1.0, 1.6, 1.3] }, { mat: 'glossy' });
      g.add(torus(0.22, 0.062, 8, 4, Math.PI / 4), '#D9544D', { pos: [-1.0, 1.6, 1.3] }, { mat: 'glossy', outline: false });
    });
    for (let lz = -1.3; lz <= 1.31; lz += 0.65) for (const lx of [-1.3, 1.3]) circle(x + lz, z - lx, 0.5);
    // upturned rowboat, oars
    const rx = -22.3, rz = 15.6, ry = beachHeight(rx, rz);
    const row = makeRowboat();
    row.position.set(rx, ry + 0.36, rz);
    row.rotation.set(0, 0.4, Math.PI); // upside down, resting on its gunwales
    scene.add(row);
    b.add(capsule(0.03, 1.8, 2, 6), '#A8723C', { pos: [rx + 0.9, ry + 0.05, rz - 0.4], rot: [Math.PI / 2, 0.3, 0] }, { mat: 'wood' });
    circle(rx, rz, 0.9); circle(rx - 0.4, rz + 0.9, 0.6); circle(rx + 0.4, rz - 0.9, 0.6);
    // umbrella + deck chairs
    const ux = -22.6, uz = 8.4, uy = beachHeight(ux, uz);
    b.add(roundCyl(0.03, 2.3, 0.01, 8), '#E9E3D6', { pos: [ux, uy - 0.1, uz], rot: [0.08, 0, 0.05] }, { mat: 'metal' });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add(new THREE.ConeGeometry(1.3, 0.45, 3, 1, true, a, Math.PI / 4), i % 2 ? '#F4ECDD' : '#3E7CB1', { pos: [ux + 0.17, uy + 2.15, uz + 0.1] }, { mat: 'cloth', outline: false });
    }
    circle(ux, uz, 0.12);
    [[-21.7, 7.4, 1.3], [-23.4, 7.6, 1.9]].forEach(([cx, cz, yaw], i) => {
      const cy = beachHeight(cx, cz);
      b.group({ pos: [cx, cy, cz], rot: [0, yaw, 0] }, (g) => {
        for (const sx of [-0.28, 0.28]) {
          g.add(rbox(0.04, 0.04, 1.1, 0.01), '#A8723C', { pos: [sx, 0.3, 0], rot: [0.35, 0, 0] }, { mat: 'wood' });
          g.add(rbox(0.04, 0.6, 0.04, 0.01), '#A8723C', { pos: [sx, 0.3, -0.42] }, { mat: 'wood' });
        }
        g.add(new THREE.PlaneGeometry(0.56, 1.0, 1, 6).rotateX(-Math.PI / 2 + 0.6), i ? '#E8893A' : '#F7B9C4', { pos: [0, 0.38, 0.05] }, { mat: 'cloth' });
      });
      seats.push({ id: `beach-chair-${i}`, kind: 'ground', x: cx, y: cy + 0.25, z: cz, yaw });
      circle(cx, cz, 0.35);
    });
    // driftwood
    for (const [dx, dz, yaw, l] of [[-21.0, 11.0, 0.4, 2.2], [-23.9, 17.8, 1.2, 1.6], [-21.6, 5.4, -0.7, 1.3]]) {
      const dy = beachHeight(dx, dz);
      b.add(capsule(0.12, l, 2, 8), '#B5A48C', { pos: [dx, dy + 0.1, dz], rot: [0, yaw, Math.PI / 2] }, { mat: 'wood' });
      b.add(capsule(0.05, l * 0.4, 2, 6), '#B5A48C', { pos: [dx + 0.2, dy + 0.12, dz + 0.3], rot: [0, yaw + 0.7, Math.PI / 2] }, { mat: 'wood' });
      circle(dx, dz, 0.3);
    }
    // a buoy bobbing off the beach (moved with the waves by ctx.floaters)
    const bb = new Builder();
    bb.add(lathe([[0, -0.4], [0.35, -0.2], [0.42, 0.2], [0.2, 0.55], [0.05, 1.3], [0, 1.35]], 16), '#D9544D', {}, { mat: 'glossy' });
    bb.add(torus(0.4, 0.04, 6, 20), '#F4F1EA', { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0] }, { mat: 'glossy', outline: false });
    const buoy = bb.build({ castShadow: true });
    buoy.position.set(-33, SEA_Y, 20);
    scene.add(buoy);
    ctx.floaters.push({ obj: buoy, x: -33, z: 20, bob: 0.9 });
  }

  const g = b.build({ castShadow: true });
  g.name = 'cove';
  scene.add(g);
}
