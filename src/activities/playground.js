// Swings and a seesaw. Motion comes from the shared room clock, so everyone sees the same thing.
import * as THREE from 'three';
import { C, Builder, rbox, capsule } from '../toon.js';
import { L } from '../world.js';

export default function playground(game) {
  const { scene, me, clock, shared, audio } = game;
  const S = L.swings, SS = L.seesaw;
  const W = Math.sqrt(9.8 / S.len); // pendulum frequency

  const swings = S.xs.map((x, i) => {
    const b = new Builder();
    for (const dx of [-0.24, 0.24]) b.add(capsule(0.025, S.len - 0.1, 2, 6), C.honeyDark, { pos: [dx, -S.len / 2, 0] });
    b.add(rbox(0.62, 0.07, 0.3, 0.03), C.pink, { pos: [0, -S.len, 0] });
    const g = b.build({ castShadow: false });
    g.position.set(x, S.top - 0.05, S.z);
    scene.add(g);
    return { id: `swing-${i}`, g, x, ph: i * 1.3, angle: 0 };
  });

  const plank = new Builder();
  plank.add(rbox(SS.half * 2, 0.08, 0.32, 0.035), C.apricot, { pos: [0, 0.04, 0] });
  for (const x of [-1.0, 1.0]) {
    plank.add(capsule(0.035, 0.18, 2, 8), C.cocoa, { pos: [x, 0.2, 0] });
    plank.add(capsule(0.035, 0.24, 2, 8), C.cocoa, { pos: [x, 0.3, 0], rot: [Math.PI / 2, 0, 0] });
  }
  const seesaw = plank.build({ castShadow: false });
  seesaw.position.set(SS.x, SS.h, SS.z);
  scene.add(seesaw);
  const REST = 0.25;
  let tilt = REST;

  const ampOf = (id) => {
    if (!id) return 0;
    if (id === me.id) return me.swing || 0;
    return game.players.get(id)?.swing || 0;
  };
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  let creakT = 0;

  function seatPose(seatId) {
    const sw = swings.find((s) => s.id === seatId);
    if (sw) {
      const a = sw.angle;
      const quat = q1.setFromAxisAngle(X, -a).clone();
      return {
        x: sw.x, y: S.top - 0.05 - Math.cos(a) * S.len + 0.035, z: S.z + Math.sin(a) * S.len, yaw: 0, quat, pose: 'swing',
        groundY: 0, exit: { x: sw.x, z: S.z + 0.9 },
      };
    }
    if (seatId === 'seesaw-0' || seatId === 'seesaw-1') {
      const side = seatId === 'seesaw-0' ? -1 : 1;
      const lx = side * 1.42, ly = 0.08;
      const x = SS.x + lx * Math.cos(tilt) - ly * Math.sin(tilt);
      const y = SS.h + lx * Math.sin(tilt) + ly * Math.cos(tilt);
      const yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const quat = q1.setFromAxisAngle(Z, tilt).multiply(q2.setFromAxisAngle(Y, yaw)).clone();
      return { x, y, z: SS.z, yaw, quat, pose: 'seesaw', groundY: 0, exit: { x: SS.x + side * 1.5, z: SS.z + 0.8 } };
    }
    return null;
  }

  return {
    seatPose,
    interactables(list) {
      if (game.mode !== 'play') return;
      for (const sw of swings) if (!shared.occupant(sw.id)) list.push({ x: sw.x, z: S.z + 0.55, r: 1.2, label: 'Sit on the swing', use: () => game.requestSit(sw.id) });
      for (const [id, side] of [['seesaw-0', -1], ['seesaw-1', 1]]) {
        if (!shared.occupant(id)) list.push({ x: SS.x + side * 1.45, z: SS.z + 0.45, r: 1.2, label: 'Hop on the seesaw', use: () => game.requestSit(id) });
      }
    },
    seatUsesSpace: (seat) => seat?.startsWith('swing'),
    seatPrompt(seat) {
      if (seat?.startsWith('swing')) return { label: 'Swing higher (walk to hop off)', key: 'Space', use: pump };
      if (seat?.startsWith('seesaw')) {
        const other = shared.occupant(seat === 'seesaw-0' ? 'seesaw-1' : 'seesaw-0');
        return { label: other ? 'Wheee! (walk to hop off)' : 'Waiting for a friend… (E to hop off)', use: game.standUp };
      }
      return null;
    },
    key(code) {
      if (me.seat?.startsWith('swing') && (code === 'Space' || code === 'KeyE')) { pump(); return true; }
      return false;
    },
    onSeat(seat) { if (!seat?.startsWith('swing')) me.swing = 0; },
    update(dt, t) {
      const sec = clock.ms() / 1000;
      if (me.seat?.startsWith('swing')) me.swing = Math.max(0, (me.swing || 0) - dt * 0.045);
      for (const sw of swings) {
        const who = shared.occupant(sw.id);
        const amp = ampOf(who);
        sw.angle = who ? amp * 0.85 * Math.sin(sec * W + sw.ph) : Math.sin(t * 0.8 + sw.ph) * 0.03;
        sw.g.rotation.x = -sw.angle;
      }
      if (me.seat?.startsWith('swing') && me.swing > 0.3) {
        creakT -= dt;
        if (creakT <= 0) { creakT = Math.PI / W; audio.play('creak'); }
      }
      const a = shared.occupant('seesaw-0'), b = shared.occupant('seesaw-1');
      const target = a && b ? Math.sin(sec * 1.8) * 0.22 : b && !a ? -REST : REST;
      tilt += (target - tilt) * Math.min(1, dt * (a && b ? 8 : 3));
      seesaw.rotation.z = tilt;
    },
  };

  function pump() {
    me.swing = Math.min(1, (me.swing || 0) + 0.16);
    game.sendMove(true);
  }
}
