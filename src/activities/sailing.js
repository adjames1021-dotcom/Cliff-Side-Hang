// Sailing: take the helm of a boat at the cove dock and sail the bay. Friends can hop aboard as crew.
// The helmsman's game sails the boat; everyone else sees it follow the helmsman's position.
import * as THREE from 'three';
import { makeSailboat } from '../boats.js';
import { seaHeight } from '../water.js';
import { W } from '../wilds.js';
import { toast } from '../ui.js';

// The breeze comes in off the sea from the west-north-west.
const WIND_TO = new THREE.Vector2(1, 0.35).normalize();
const MAX_SPEED = 6.4;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// how hard the sails pull at an angle `off` from the wind (0 = straight into it)
function polar(off) {
  if (off < 0.62) return 0.05; // in irons: the sails just flap
  const close = smooth(0.62, 1.1, off);
  return close * (0.6 + 0.4 * Math.sin(Math.min(off, 1.9))) * (off > 2.3 ? 1 - (off - 2.3) * 0.3 : 1);
}

const DEFS = [
  // moored stern-to along the north side of the dock, bows pointing out to sea
  { name: 'Pippin', hull: '#2F5E8C', band: '#E8893A', home: { x: -28.8, z: W.dock.z - 3.75, yaw: Math.PI } },
  { name: 'Marigold', hull: '#E2B53E', stripe: '#F4F1EA', band: '#3E7CB1', home: { x: -31.9, z: W.dock.z - 3.75, yaw: Math.PI } },
  { name: 'Wren', hull: '#3F6B4F', stripe: '#F4F1EA', band: '#C8434F', home: { x: -35.0, z: W.dock.z - 3.75, yaw: Math.PI } },
];

export default function sailing(game) {
  const { scene, me, shared, fx, audio } = game;
  const boats = DEFS.map((d, i) => {
    const model = makeSailboat({ ...d, name: d.name });
    scene.add(model.root);
    return { i, id: `boat-${i}`, def: d, model, x: d.home.x, z: d.home.z, yaw: d.home.yaw, speed: 0, trim: 0.5, rudder: 0, heel: 0, wakeT: 0, bumpT: 0, y: W.dock.y };
  });
  const byId = new Map(boats.map((b) => [b.id, b]));
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), wave = {};
  let wasCaptain = false;

  const boatOf = (seat) => (seat ? byId.get(seat.replace(/-(a|b)$/, '')) : null);
  const isHelm = (seat) => !!seat && byId.has(seat);
  const captainOf = (b) => shared.occupant(b.id);

  function windRel(yaw) {
    const fx2 = Math.sin(yaw), fz2 = Math.cos(yaw);
    const wx = -WIND_TO.x, wz = -WIND_TO.y; // where the wind comes from
    return Math.atan2(fx2 * wz - fz2 * wx, fx2 * wx + fz2 * wz);
  }

  // the bow, the stern and the middle all need to be in open water
  function clear(b, x, z, yaw) {
    const fx2 = Math.sin(yaw), fz2 = Math.cos(yaw);
    if (!game.world.sailable(x, z, 1.1)) return false;
    if (!game.world.sailable(x + fx2 * 2.5, z + fz2 * 2.5, 0.25)) return false;
    if (!game.world.sailable(x - fx2 * 2.4, z - fz2 * 2.4, 0.2)) return false;
    // sea stacks and the other boats
    for (const [sx, sz, s] of game.world.L.seaStacks) if (Math.hypot(x - sx, z - sz) < s * 1.15 + 1.6) return false;
    for (const o of boats) if (o !== b && Math.hypot(x - o.x, z - o.z) < 2.6) return false;
    return true;
  }
  let sailingBoat = null;

  function steer(b, dt) {
    const inp = game.input;
    const fwd = inp.z, turn = -inp.x;
    // W trims the sails in, S eases them (and paddles backwards when nearly stopped)
    b.trim = THREE.MathUtils.clamp(b.trim + fwd * dt * 0.7, 0, 1);
    b.rudder += (turn - b.rudder) * Math.min(1, dt * 4);
    const rel = windRel(b.yaw), off = Math.abs(rel);
    let target = MAX_SPEED * polar(off) * (0.25 + 0.75 * b.trim);
    if (fwd < -0.3 && b.speed < 0.6) target = -0.9;
    const k = target > b.speed ? 0.45 : 0.8;
    b.speed += (target - b.speed) * Math.min(1, dt * k);
    const grip = 0.25 + 0.75 * Math.min(1, Math.abs(b.speed) / 2.5);
    b.yaw += b.rudder * grip * 0.8 * dt * Math.sign(b.speed || 1);
    const nx = b.x + Math.sin(b.yaw) * b.speed * dt, nz = b.z + Math.cos(b.yaw) * b.speed * dt;
    if (clear(b, nx, nz, b.yaw)) { b.x = nx; b.z = nz; }
    else {
      if (b.bumpT <= 0) { audio.play('bounce'); fx.emit('splash', { x: b.x + Math.sin(b.yaw) * 2.6, y: b.y + 0.2, z: b.z + Math.cos(b.yaw) * 2.6 }, { n: 10 }); b.bumpT = 1.2; }
      if (Math.hypot(b.x, b.z) > 300 && b.bumpT > 1.1) toast('That\'s far enough — the village is waving you home', 2600);
      b.speed *= -0.35;
    }
    b.bumpT -= dt;
    // the boat leans away from the wind when it's pulling hard, and into its turns
    const heelTarget = -Math.sign(rel) * polar(off) * b.trim * 0.22 * Math.sin(Math.min(off, Math.PI / 2)) + b.rudder * Math.abs(b.speed) * 0.012;
    b.heel += (heelTarget - b.heel) * Math.min(1, dt * 1.5);
  }

  function place(b, t, dt) {
    const m = b.model;
    b.y = seaHeight(b.x, b.z, t, wave);
    m.root.position.set(b.x, b.y - 0.02, b.z);
    m.root.rotation.y = b.yaw;
    // pitch and roll with the waves (slope along and across the hull) plus heel
    const fx2 = Math.sin(b.yaw), fz2 = Math.cos(b.yaw);
    const along = wave.slopeX * fx2 + wave.slopeZ * fz2, across = wave.slopeX * fz2 - wave.slopeZ * fx2;
    m.heel.rotation.set(-along * 0.35, 0, across * 0.35 + b.heel);
    m.setSails(windRel(b.yaw), b.trim, dt);
    m.setRudder(b.rudder);
    m.fenders.visible = !captainOf(b) && Math.hypot(b.x - b.def.home.x, b.z - b.def.home.z) < 0.5;
    m.root.updateMatrixWorld(true);
  }

  function returnToDock() {
    const b = boatOf(me.seat);
    if (!b) return;
    const ov = document.getElementById('fade');
    ov?.classList.add('on');
    setTimeout(() => {
      game.standUp();
      if (b) { Object.assign(b, { x: b.def.home.x, z: b.def.home.z, yaw: b.def.home.yaw, speed: 0, rudder: 0, heel: 0 }); }
      ov?.classList.remove('on');
    }, 350);
  }

  return {
    seatPose(seatId, p) {
      const b = boatOf(seatId);
      if (!b) return null;
      const local = isHelm(seatId) ? b.model.seats.helm : seatId.endsWith('-a') ? b.model.seats.a : b.model.seats.b;
      b.model.heel.localToWorld(v.copy(local));
      b.model.heel.getWorldQuaternion(q);
      const floor = b.model.heel.localToWorld(new THREE.Vector3(0, 0.1, local.z)).y;
      return {
        x: v.x, y: v.y, z: v.z, yaw: b.yaw, quat: q.clone(), pose: isHelm(seatId) ? 'helm' : 'sit', groundY: floor,
        exit: { x: b.def.home.x + 0.6, z: W.dock.z + Math.sign(b.def.home.z - W.dock.z) * 0.55 },
      };
    },
    seatHoldsInput: (seat) => isHelm(seat),
    interactables(list) {
      if (game.mode !== 'play' || me.busy) return;
      for (const b of boats) {
        const moored = !captainOf(b) || Math.hypot(b.x - b.def.home.x, b.z - b.def.home.z) < 2;
        if (!moored) continue;
        const sx = b.def.home.x, sz = W.dock.z + Math.sign(b.def.home.z - W.dock.z) * 0.7;
        if (!captainOf(b)) list.push({ x: sx, z: sz, r: 1.9, priority: 0.3, label: `Take the helm of the ${b.def.name}`, use: () => game.requestSit(b.id) });
        else for (const s of ['a', 'b']) if (!shared.occupant(`${b.id}-${s}`)) { list.push({ x: sx + (s === 'a' ? 0.6 : -0.6), z: sz, r: 1.9, label: `Hop aboard the ${b.def.name}`, use: () => game.requestSit(`${b.id}-${s}`) }); break; }
      }
    },
    seatPrompt(seat) {
      if (isHelm(seat)) return { label: 'W/S sails · A/D steer · E back to the dock', use: returnToDock };
      if (boatOf(seat)) return { label: 'Enjoy the ride (E to hop off at the dock)', use: returnToDock };
      return null;
    },
    onSeat(seat, was) {
      const b = boatOf(seat);
      if (isHelm(seat)) {
        sailingBoat = b;
        b.speed = 0.8; b.trim = 0.55;
        game.cam.dist = Math.max(game.cam.dist, 10);
        game.cam.pitch = Math.max(game.cam.pitch, 0.3);
        game.cam.yaw = b.yaw + Math.PI;
        toast(`Casting off in the ${b.def.name} — the breeze is from the west`, 3000);
        audio.play('whoosh');
      } else if (b) {
        game.cam.dist = Math.max(game.cam.dist, 8);
      }
      if (!seat && boatOf(was)) {
        if (isHelm(was)) { sailingBoat = null; const ob = boatOf(was); Object.assign(ob, { x: ob.def.home.x, z: ob.def.home.z, yaw: ob.def.home.yaw, speed: 0, rudder: 0, heel: 0 }); }
        game.cam.dist = 7.5;
      }
    },
    onLeave(id) {
      for (const b of boats) if (captainOf(b) === id) Object.assign(b, { x: b.def.home.x, z: b.def.home.z, yaw: b.def.home.yaw, speed: 0 });
    },
    update(dt, t) {
      for (const b of boats) {
        const cap = captainOf(b);
        if (cap && cap === me.id) {
          steer(b, dt);
          me.yaw = b.yaw;
          wasCaptain = true;
        } else if (cap) {
          // follow the helmsman we can see
          const p = game.players.get(cap);
          if (p) {
            const h = b.model.seats.helm;
            b.yaw = p.yaw;
            b.x = p.pos.x - (Math.sin(b.yaw) * h.z + Math.cos(b.yaw) * h.x);
            b.z = p.pos.z - (Math.cos(b.yaw) * h.z - Math.sin(b.yaw) * h.x);
            b.speed += ((p.speed || 0) - b.speed) * Math.min(1, dt * 3);
            b.trim = 0.7;
          }
        } else {
          const h = b.def.home;
          b.x += (h.x - b.x) * Math.min(1, dt * 2);
          b.z += (h.z - b.z) * Math.min(1, dt * 2);
          b.yaw = h.yaw;
          b.speed = 0; b.rudder *= 0.9; b.heel *= 0.9; b.trim = 0.2;
        }
        place(b, t, dt);
        // wake and spray
        b.wakeT -= dt;
        if (Math.abs(b.speed) > 1 && b.wakeT <= 0 && game.camera.position.distanceTo(b.model.root.position) < 90) {
          b.wakeT = 0.09;
          const sx = Math.sin(b.yaw), sz = Math.cos(b.yaw);
          fx.emit('foam', { x: b.x - sx * 2.7, y: b.y - 0.02, z: b.z - sz * 2.7 }, { vx: -sx * 0.3, vz: -sz * 0.3, k: 0.8 + Math.abs(b.speed) * 0.1 });
          for (const side of [-1, 1]) fx.emit('foam', { x: b.x + sx * 1.4 + sz * side * 0.95, y: b.y - 0.02, z: b.z + sz * 1.4 - sx * side * 0.95 }, { vx: sz * side * 0.5, vz: -sx * side * 0.5, k: 0.5, a: 0.4 });
          if (Math.abs(b.speed) > 4 && Math.random() < 0.3) fx.emit('drop', { x: b.x + sx * 2.6, y: b.y + 0.5, z: b.z + sz * 2.6 }, { vx: sz * (Math.random() - 0.5) * 2, vz: -sx * (Math.random() - 0.5) * 2, vy: 1.8 });
        }
      }
      if (wasCaptain && !isHelm(me.seat)) wasCaptain = false;
    },
    boats,
  };
}
