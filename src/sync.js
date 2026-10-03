// Interpolating other players, plus shared room state (seats, campfire, clock).
import * as THREE from 'three';

export const INTERP_DELAY = 110; // ms behind the newest update

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Buffer of {t, p:[x,y,z], r, a, s} snapshots, sampled a little in the past.
export class Snapshots {
  constructor() { this.list = []; }
  push(snap) {
    const L = this.list;
    snap.t = performance.now();
    L.push(snap);
    if (L.length > 30) L.splice(0, L.length - 30);
  }
  latest() { return this.list[this.list.length - 1]; }
  sample(now, out) {
    const L = this.list;
    if (!L.length) return null;
    const rt = now - INTERP_DELAY;
    if (rt <= L[0].t) { out.set(...L[0].p); return L[0]; }
    for (let i = L.length - 2; i >= 0; i--) {
      const a = L[i], b = L[i + 1];
      if (a.t <= rt) {
        if (rt >= b.t) { out.set(...b.p); return b; }
        const k = (rt - a.t) / Math.max(1, b.t - a.t);
        out.set(a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k);
        return k < 0.5 ? a : b;
      }
    }
    out.set(...L[L.length - 1].p);
    return L[L.length - 1];
  }
}

// Moves a remote player's position/yaw toward the interpolated target.
const tmp = new THREE.Vector3();
export function updateRemote(p, dt, groundHeight) {
  const snap = p.snaps.sample(performance.now(), tmp);
  if (!snap) return;
  const prev = p.pos.clone();
  if (p.pos.distanceTo(tmp) > 6) p.pos.copy(tmp); // teleport (respawn, reload)
  else p.pos.lerp(tmp, 1 - Math.exp(-dt * 25));
  const moved = Math.hypot(p.pos.x - prev.x, p.pos.z - prev.z) / Math.max(dt, 1e-3);
  p.speed += (Math.min(moved, 7) - p.speed) * Math.min(1, dt * 10);
  if (p.speed < 0.08) p.speed = 0;
  p.yaw = lerpAngle(p.yaw, snap.r ?? p.yaw, 1 - Math.exp(-dt * 12));
  p.pose = snap.a || 'idle';
  p.swing = snap.s || 0;
  const g = groundHeight(p.pos.x, p.pos.z, p.pos.y);
  p.grounded = p.pos.y - g < 0.06;
  p.vy = (p.pos.y - prev.y) / Math.max(dt, 1e-3);
}

// Shared clock: same day for everyone in the room.
export class RoomClock {
  constructor() { this.solo(); }
  solo() { this.start = Date.now(); this.frac = 0.7; this.dayMs = 20 * 60 * 1000; this.offset = 0; }
  set(c) {
    this.start = c.start; this.frac = c.frac; this.dayMs = c.dayMs;
    this.offset = c.now - Date.now();
  }
  now() { return Date.now() + this.offset; }
  ms() { return this.now() - this.start; }
  day() { return (((this.frac + this.ms() / this.dayMs) % 1) + 1) % 1; }
}

// Who sits where, plus the campfire. The server referees; solo applies locally.
export class Shared {
  constructor() {
    this.seats = new Map(); // seat -> player id
    this.fire = { litAt: 0, by: '', burnMs: 10 * 60 * 1000 };
  }
  reset() {
    this.seats.clear();
    this.fire = { litAt: 0, by: '', burnMs: 10 * 60 * 1000 };
  }
  occupant(seat) { return this.seats.get(seat) || null; }
  setSeat(id, seat) {
    for (const [s, who] of this.seats) if (who === id) this.seats.delete(s);
    if (seat) this.seats.set(seat, id);
  }
  fireLit(nowMs) { return this.fire.litAt > 0 && nowMs - this.fire.litAt < this.fire.burnMs; }
}
