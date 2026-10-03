// A big beach ball anyone can kick. The last toucher simulates it; the server corrects it.
import * as THREE from 'three';
import { C, outlineMaterial, addSmoothNormals, MAT, blobShadow } from '../toon.js';
import { L, groundHeight } from '../world.js';

const R = 0.45, GRAV = 12;
const STRIPES = [C.pink, C.cream2, C.butter, C.cream2, C.blue, C.cream2];

function ballMesh() {
  const g = new THREE.SphereGeometry(R, 24, 16).toNonIndexed();
  g.deleteAttribute('uv');
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    // colour whole triangles by their longitude so stripes stay crisp
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const k = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * STRIPES.length) % STRIPES.length;
    c.set(Math.abs(y) > R * 0.86 ? C.apricot : STRIPES[k]);
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const group = new THREE.Group();
  const m = new THREE.Mesh(g, MAT.toon);
  m.castShadow = false;
  m.receiveShadow = true;
  const o = new THREE.Mesh(addSmoothNormals(g.clone()), outlineMaterial);
  group.add(m, o);
  return group;
}

export default function ball(game) {
  const { scene, net, me, fx, audio } = game;
  const mesh = ballMesh();
  const shadow = blobShadow(1.1);
  scene.add(mesh, shadow);
  const spawn = new THREE.Vector3(L.ballSpawn.x, groundHeight(L.ballSpawn.x, L.ballSpawn.z) + R, L.ballSpawn.z);
  const s = { p: spawn.clone(), v: new THREE.Vector3(), owner: null, corr: new THREE.Vector3(), sendT: 0, cool: 0, resting: true };
  game.ball = s;
  const pond = L.pond;

  const inPond = (x, z) => Math.hypot(x - pond.x, z - pond.z) < 4.6;
  const floorAt = (x, z) => (inPond(x, z) ? Math.max(groundHeight(x, z), pond.water - 0.18) : groundHeight(x, z));

  function step(dt) {
    s.v.y -= GRAV * dt;
    s.p.addScaledVector(s.v, dt);
    // bump off benches, trees, walls...
    const [cx, cz] = game.collide(s.p.x, s.p.z, R * 0.9);
    if (cx !== s.p.x || cz !== s.p.z) {
      const nx = cx - s.p.x, nz = cz - s.p.z, l = Math.hypot(nx, nz) || 1;
      const vn = (s.v.x * nx + s.v.z * nz) / l;
      if (vn < 0) { s.v.x -= (1.7 * vn * nx) / l; s.v.z -= (1.7 * vn * nz) / l; if (vn < -1.5) audio.play('bounce', { at: s.p, listener: me.pos, k: 0.6 }); }
      s.p.x = cx; s.p.z = cz;
    }
    const f = floorAt(s.p.x, s.p.z) + R;
    const water = inPond(s.p.x, s.p.z);
    if (s.p.y <= f) {
      s.p.y = f;
      if (s.v.y < -1.3 && !water) {
        s.v.y = -s.v.y * 0.55;
        audio.play('bounce', { at: s.p, listener: me.pos, k: Math.min(1, -s.v.y / 4) });
      } else {
        if (water && s.v.y < -1.5) { fx.emit('splash', s.p); audio.play('splash', { at: s.p, listener: me.pos }); }
        s.v.y = 0;
      }
      // roll downhill a little and slow down
      const gx = groundHeight(s.p.x + 0.2, s.p.z) - groundHeight(s.p.x - 0.2, s.p.z);
      const gz = groundHeight(s.p.x, s.p.z + 0.2) - groundHeight(s.p.x, s.p.z - 0.2);
      if (!water) { s.v.x -= gx * 6 * dt; s.v.z -= gz * 6 * dt; }
      const fr = Math.exp(-(water ? 1.8 : 0.9) * dt);
      s.v.x *= fr; s.v.z *= fr;
      if (water) {
        // drift back to the shore so it never gets stuck in the pond
        const dx = s.p.x - pond.x, dz = s.p.z - pond.z, d = Math.hypot(dx, dz) || 1;
        s.v.x += (dx / d) * 0.9 * dt; s.v.z += (dz / d) * 0.9 * dt;
      }
    }
  }

  function kick(dirX, dirZ, power, up) {
    const l = Math.hypot(dirX, dirZ) || 1;
    s.v.set((dirX / l) * power, up, (dirZ / l) * power);
    s.owner = me.id;
    s.cool = 0.3;
    s.resting = false;
    audio.play('kick');
    fx.emit('puff', { x: s.p.x, y: s.p.y - R, z: s.p.z }, { n: 4 });
    if (net.online) {
      game.sendMove(true); // so the server knows we're really next to the ball
      net.send({ t: 'ball', k: 1, p: vec(s.p), v: vec(s.v) });
    }
  }
  game.kickBall = kick;
  const vec = (v) => [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100];

  net.on('ball', (m) => {
    const p = new THREE.Vector3(...m.p), v = new THREE.Vector3(...m.v);
    const err = p.clone().sub(s.p);
    if (m.owner === me.id && m.k) { s.owner = me.id; return; } // our own kick, confirmed
    s.owner = m.owner;
    if (err.length() > 2.5) { s.p.copy(p); s.corr.set(0, 0, 0); } else s.corr.copy(err);
    s.v.copy(v);
    s.resting = false;
  });

  const axis = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    onRoster(m) {
      s.p.set(...m.ball.p); s.v.set(...m.ball.v); s.owner = m.ball.owner; s.corr.set(0, 0, 0); s.resting = false;
    },
    onLeave(id) { if (s.owner === id) s.owner = null; },
    onStart(code) {
      if (!code) { s.p.copy(spawn); s.v.set(0, 0, 0); s.owner = null; }
    },
    interactables(list) {
      if (game.mode !== 'play') return;
      list.push({ x: s.p.x, z: s.p.z, r: 1.6, label: 'Kick the ball', use: () => {
        let dx = s.p.x - me.pos.x, dz = s.p.z - me.pos.z;
        if (Math.hypot(dx, dz) < 0.2) { dx = Math.sin(me.yaw); dz = Math.cos(me.yaw); }
        kick(dx, dz, 8, 4.5);
        me.char.playEmote('cheer');
      } });
    },
    update(dt) {
      s.cool -= dt;
      // walking into the ball nudges it
      if (game.mode === 'play' && !me.seat && !me.busy && s.cool <= 0) {
        const dx = s.p.x - me.pos.x, dz = s.p.z - me.pos.z, d = Math.hypot(dx, dz);
        if (d < R + 0.38 && s.p.y - me.pos.y < 1.1 && s.p.y - R < me.pos.y + 0.9) {
          const sp = Math.hypot(me.vel.x, me.vel.z);
          if (sp > 0.4 || d < R + 0.2) kick(dx || Math.sin(me.yaw), dz || Math.cos(me.yaw), 2.6 + sp * 1.25, 1.6 + sp * 0.45);
        }
      }
      if (!s.resting) {
        const n = Math.ceil(dt / (1 / 90));
        for (let i = 0; i < n; i++) step(dt / n);
        if (s.corr.lengthSq() > 1e-6) {
          const c = s.corr.clone().multiplyScalar(Math.min(1, dt * 8));
          s.p.add(c); s.corr.sub(c);
        }
        const f = floorAt(s.p.x, s.p.z) + R;
        if (s.v.lengthSq() < 0.004 && s.p.y - f < 0.01 && s.corr.lengthSq() < 1e-4 && !inPond(s.p.x, s.p.z)) {
          s.v.set(0, 0, 0);
          s.resting = true;
          if (s.owner === me.id && net.online) net.send({ t: 'ball', p: vec(s.p), v: [0, 0, 0] });
        }
        // spin to match the roll
        const hs = Math.hypot(s.v.x, s.v.z);
        if (hs > 0.01) {
          axis.set(s.v.z, 0, -s.v.x).normalize();
          q.setFromAxisAngle(axis, (hs * dt) / R);
          mesh.quaternion.premultiply(q);
        }
      }
      if (s.owner === me.id && net.online && !s.resting) {
        s.sendT -= dt;
        if (s.sendT <= 0) { s.sendT = 0.1; net.send({ t: 'ball', p: vec(s.p), v: vec(s.v) }); }
      }
      mesh.position.copy(s.p);
      const fl = floorAt(s.p.x, s.p.z);
      shadow.position.set(s.p.x, fl + 0.015, s.p.z);
      const lift = s.p.y - R - fl;
      shadow.scale.setScalar(Math.max(0.4, 1 - lift * 0.3));
      shadow.visible = !inPond(s.p.x, s.p.z);
    },
  };
}
