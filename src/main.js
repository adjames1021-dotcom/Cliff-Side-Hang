// Game loop, camera, input and players.
import * as THREE from 'three';
import { outlineUniforms } from './toon.js';
import { buildWorld, L, groundHeight, isWater } from './world.js';
import { Character, cleanAvatar, randomAvatar, SIT_DROP } from './characters.js';
import { Effects } from './effects.js';
import { DayNight } from './daynight.js';
import { Creator, loadProfile, saveProfile, toast, randomName } from './ui.js';

const $ = (id) => document.getElementById(id);

// ---------- renderer + scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const maxPR = Math.min(window.devicePixelRatio || 1, 2);
let pixelRatio = maxPR;
renderer.setPixelRatio(pixelRatio);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.15, 700);
const fx = new Effects(scene);
const world = buildWorld(scene, fx);
const sky = new DayNight(scene, renderer, world, fx);

const game = { scene, camera, renderer, world, fx, sky, players: new Map(), mode: 'title', t: 0 };
window.__hh = game; // handy for debugging and tests

// ---------- clock (solo for now) ----------
const clock = { start: Date.now(), frac: 0.70, dayMs: 20 * 60 * 1000, offset: 0 };
game.clock = clock;
const roomMs = () => Date.now() + clock.offset - clock.start;
const dayFrac = () => (((clock.frac + roomMs() / clock.dayMs) % 1) + 1) % 1;

// ---------- local player ----------
const me = {
  id: 'me', name: 'You', avatar: randomAvatar(),
  pos: new THREE.Vector3(L.spawn.x, 0, L.spawn.z), vel: new THREE.Vector3(), yaw: Math.PI, vy: 0,
  grounded: true, landed: false, seat: null, pose: 'idle',
};
me.char = new Character(me.avatar);
game.me = me;

function spawnMe() {
  me.pos.set(L.spawn.x, groundHeight(L.spawn.x, L.spawn.z), L.spawn.z);
  me.yaw = Math.PI;
  me.char.addTo(scene);
  game.players.set(me.id, me);
}

// ---------- input ----------
const keys = new Set();
let typing = false;
const input = { x: 0, z: 0, run: false, jump: false };
addEventListener('keydown', (e) => {
  if (typing || e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const cam = { yaw: 0, pitch: 0.38, dist: 7.5, target: new THREE.Vector3(), look: new THREE.Vector3() };
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerType === 'touch') return;
  orbit(e.clientX - drag.x, e.clientY - drag.y);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 3, 15); e.preventDefault(); }, { passive: false });
function orbit(dx, dy) {
  cam.yaw -= dx * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.005, -0.05, 1.25);
}

// touch: left side = joystick, elsewhere = orbit, two fingers = pinch zoom
const touch = { stick: null, look: new Map(), pinch: 0, x: 0, z: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function setupTouch() {
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  zone.addEventListener('pointerdown', (e) => {
    touch.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
    zone.setPointerCapture(e.pointerId);
    base.style.display = 'block';
    base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
  });
  zone.addEventListener('pointermove', (e) => {
    if (!touch.stick || e.pointerId !== touch.stick.id) return;
    let dx = e.clientX - touch.stick.x, dy = e.clientY - touch.stick.y;
    const d = Math.hypot(dx, dy), max = 50;
    if (d > max) { dx *= max / d; dy *= max / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    touch.x = dx / max; touch.z = -dy / max;
  });
  const end = (e) => {
    if (!touch.stick || e.pointerId !== touch.stick.id) return;
    touch.stick = null; touch.x = touch.z = 0;
    base.style.display = 'none'; knob.style.transform = '';
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    touch.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = touch.look.get(e.pointerId);
    if (!p) return;
    if (touch.look.size === 2) {
      const [a, b] = [...touch.look.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      p.x = e.clientX; p.y = e.clientY;
      const after = Math.hypot(a.x - b.x, a.y - b.y);
      if (before > 0) cam.dist = THREE.MathUtils.clamp(cam.dist * (before / after), 3, 15);
      return;
    }
    orbit((e.clientX - p.x) * 1.3, (e.clientY - p.y) * 1.3);
    p.x = e.clientX; p.y = e.clientY;
  });
  const lift = (e) => touch.look.delete(e.pointerId);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  const hold = (id, fn) => {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('pressed'); fn(); });
    const up = () => b.classList.remove('pressed');
    b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
  };
  hold('t-jump', () => { input.jump = true; });
  game.touchButton = hold;
}

function readInput() {
  let x = 0, z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  x += touch.x; z += touch.z;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  input.x = x; input.z = z;
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(touch.x, touch.z) > 0.92;
}

// ---------- movement + collisions ----------
const WALK = 3.3, RUN = 5.9, JUMP = 4.9, GRAV = 15, RADIUS = 0.33;

export function collide(px, pz, r = RADIUS) {
  for (let it = 0; it < 2; it++) {
    for (const c of world.colliders) {
      if (c.c) {
        const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min) {
          if (d > 1e-5) { px = c.x + (dx / d) * min; pz = c.z + (dz / d) * min; } else px += min;
        }
      } else {
        const cx = Math.max(c.x0, Math.min(px, c.x1)), cz = Math.max(c.z0, Math.min(pz, c.z1));
        const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-5) { px = cx + (dx / d) * r; pz = cz + (dz / d) * r; }
          else {
            const opts = [[c.x0 - r - px, 0], [c.x1 + r - px, 0], [0, c.z0 - r - pz], [0, c.z1 + r - pz]];
            opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
            px += opts[0][0]; pz += opts[0][1];
          }
        }
      }
    }
  }
  const b = L.bounds;
  px = Math.max(b.minX, Math.min(b.maxX, px));
  pz = Math.max(b.minZ, Math.min(b.maxZ, pz));
  return [px, pz];
}
game.collide = collide;

function blockedAt(x, z, fromY, grounded) {
  if (isWater(x, z)) return true;
  const g = groundHeight(x, z);
  return grounded ? g > fromY + 0.22 : g > fromY + 0.05;
}

const fwd = new THREE.Vector3(), right = new THREE.Vector3();
function updateMe(dt) {
  readInput();
  me.landed = false;
  if (me.locked) { me.vel.set(0, 0, 0); input.jump = false; return; }
  if (me.seat) {
    if (Math.hypot(input.x, input.z) > 0.3 || input.jump) game.standUp?.();
    input.jump = false;
    return;
  }
  fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const speed = input.run ? RUN : WALK;
  const tx = (fwd.x * input.z + right.x * input.x) * speed;
  const tz = (fwd.z * input.z + right.z * input.x) * speed;
  const acc = me.grounded ? 14 : 5;
  const k = 1 - Math.exp(-acc * dt);
  me.vel.x += (tx - me.vel.x) * k;
  me.vel.z += (tz - me.vel.z) * k;

  if (input.jump && me.grounded) { me.vy = JUMP; me.grounded = false; game.onHop?.(); }
  input.jump = false;

  const nx = me.pos.x + me.vel.x * dt, nz = me.pos.z + me.vel.z * dt;
  let px = me.pos.x, pz = me.pos.z;
  if (!blockedAt(nx, nz, me.pos.y, me.grounded)) { px = nx; pz = nz; }
  else if (!blockedAt(nx, me.pos.z, me.pos.y, me.grounded)) { px = nx; me.vel.z *= 0.5; }
  else if (!blockedAt(me.pos.x, nz, me.pos.y, me.grounded)) { pz = nz; me.vel.x *= 0.5; }
  else { me.vel.x = me.vel.z = 0; }
  [px, pz] = collide(px, pz);
  if (isWater(px, pz)) { px = me.pos.x; pz = me.pos.z; }
  me.pos.x = px; me.pos.z = pz;

  const g = groundHeight(px, pz);
  me.vy -= GRAV * dt;
  me.pos.y += me.vy * dt;
  if (me.pos.y <= g) {
    if (!me.grounded && me.vy < -2) me.landed = true;
    me.pos.y = g; me.vy = 0; me.grounded = true;
  } else if (me.grounded && me.vy <= 0 && me.pos.y - g < 0.3) {
    me.pos.y = g; me.vy = 0; // follow the ground down slopes and small steps
  } else {
    me.grounded = false;
  }

  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (hs > 0.2) me.yaw = lerpAngle(me.yaw, Math.atan2(me.vel.x, me.vel.z), 1 - Math.exp(-dt * 12));
  me.speed = hs;
  if (hs > 0.3 && me.pose !== 'idle' && !me.seat) me.pose = 'idle';
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
game.lerpAngle = lerpAngle;

// ---------- camera ----------
const camBlockers = [
  { x0: L.cafe.x0, z0: L.cafe.z0, x1: L.cafe.x1, z1: L.cafe.z1, h: 3.4 },
  { x0: -4, z0: L.stage.z0 - 0.3, x1: 4, z1: L.stage.z0 + 0.45, h: 4.2 },
];
const camPos = new THREE.Vector3(), tmp = new THREE.Vector3();
function updateCamera(dt) {
  if (game.cameraOverride) { game.cameraOverride(dt); return; }
  const tgt = tmp.set(me.pos.x, me.pos.y + 1.0, me.pos.z);
  cam.target.lerp(tgt, 1 - Math.exp(-dt * 10));
  let dist = cam.dist;
  const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  for (let d = 0.6; d < dist; d += 0.25) {
    const x = cam.target.x + dir.x * d, y = cam.target.y + dir.y * d, z = cam.target.z + dir.z * d;
    if (camBlockers.some((b) => x > b.x0 - 0.2 && x < b.x1 + 0.2 && z > b.z0 - 0.2 && z < b.z1 + 0.2 && y < b.h)) { dist = Math.max(1.2, d - 0.3); break; }
  }
  camPos.copy(cam.target).addScaledVector(dir, dist);
  const floor = groundHeight(camPos.x, camPos.z) + 0.45;
  if (camPos.y < floor) camPos.y = floor;
  camera.position.copy(camPos);
  camera.lookAt(cam.target);
  setNearFar(0.15, 700);
}
function setNearFar(n, f) {
  if (camera.near !== n || camera.far !== f) { camera.near = n; camera.far = f; camera.updateProjectionMatrix(); }
}

// far-away title camera with a tight near/far range
function titleCamera(t) {
  const a = t * 0.04 + 2.4;
  camera.position.set(Math.cos(a) * 44, 21 + Math.sin(t * 0.1) * 1.5, Math.sin(a) * 44);
  camera.lookAt(0, 1.5, 0);
  setNearFar(4, 520);
}
game.titleCamera = titleCamera;

// ---------- resize + adaptive quality ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  outlineUniforms.uRes.value.copy(buf);
  outlineUniforms.uThickness.value = Math.max(1.3, 1.7 * pixelRatio);
  fx.resize(buf.y, camera.fov);
}
addEventListener('resize', resize);
resize();

const perf = { frames: 0, time: 0, good: 0 };
function adaptQuality(dt) {
  perf.frames++; perf.time += dt;
  if (perf.time < 2) return;
  const fps = perf.frames / perf.time;
  perf.frames = 0; perf.time = 0;
  if (fps < 40 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio - 0.25); resize(); perf.good = 0; }
  else if (fps > 58 && pixelRatio < maxPR) { if (++perf.good >= 4) { pixelRatio = Math.min(maxPR, pixelRatio + 0.25); resize(); perf.good = 0; } }
}

// ---------- name tags ----------
const labels = $('labels');
const v3 = new THREE.Vector3();
function ensureTag(p) {
  if (p.tag) return;
  const el = document.createElement('div');
  el.className = 'tag' + (p === me ? ' me' : '');
  const bubble = document.createElement('div');
  bubble.className = 'bubble hidden';
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = p.name;
  el.append(bubble, name);
  labels.append(el);
  p.tag = { el, bubble, name };
}
function updateTags() {
  const w = innerWidth, h = innerHeight;
  for (const p of game.players.values()) {
    ensureTag(p);
    if (p.tag.name.textContent !== p.name) p.tag.name.textContent = p.name;
    const root = p.char.root.position;
    v3.set(root.x, root.y + p.char.labelY, root.z).project(camera);
    const behind = v3.z > 1;
    const dist = camera.position.distanceTo(root);
    if (behind || dist > 40 || game.mode !== 'play') { p.tag.el.style.display = 'none'; continue; }
    p.tag.el.style.display = '';
    const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
    const s = THREE.MathUtils.clamp(9 / dist, 0.55, 1.1);
    p.tag.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%) scale(${s})`;
    p.tag.el.style.zIndex = String(1000 - Math.round(dist * 10));
  }
}
game.ensureTag = ensureTag;

// ---------- players: pose + transforms ----------
function placeCharacter(p, dt) {
  const c = p.char;
  if (p.seatPose) {
    const sp = p.seatPose;
    c.root.position.set(sp.x, sp.y - SIT_DROP, sp.z);
    c.root.rotation.set(0, sp.yaw, 0);
    if (sp.quat) c.root.quaternion.copy(sp.quat);
  } else {
    c.root.position.copy(p.pos);
    c.root.rotation.set(0, p.yaw, 0);
  }
  c.update(dt, {
    speed: p.speed || 0, grounded: p.grounded !== false, vy: p.vy || 0, landed: p.landed,
    pose: p.seatPose ? p.seatPose.pose : p.pose, groundY: p.seatPose ? p.seatPose.groundY ?? groundHeight(c.root.position.x, c.root.position.z) : groundHeight(p.pos.x, p.pos.z),
  });
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.t += dt;
  const t = game.t;

  if (game.mode === 'play') {
    updateMe(dt);
    for (const fn of game.updaters || []) fn(dt, t);
    updateCamera(dt);
  } else if (game.mode === 'title') {
    titleCamera(t);
  } else if (game.mode === 'creator') {
    game.creatorCamera?.(dt, t);
  }
  for (const p of game.players.values()) placeCharacter(p, dt);
  game.preview && placeCharacter(game.preview, dt);

  const f = dayFrac();
  sky.update(f, dt, t, camera, game.mode === 'play' ? me.pos : null);
  world.update(dt, t, roomMs() / 1000, { night: sky.night });
  fx.update(dt);
  updateTags();
  renderer.render(scene, camera);
  adaptQuality(dt);
  requestAnimationFrame(frame);
}

// ---------- creator ----------
const PREVIEW = { x: 0, z: 3.3 };
game.preview = {
  id: 'preview', char: new Character(me.avatar), pos: new THREE.Vector3(PREVIEW.x, groundHeight(PREVIEW.x, PREVIEW.z), PREVIEW.z),
  yaw: 0, pose: 'idle', speed: 0, grounded: true, spin: 0,
};
let editing = false;
const previewLook = new THREE.Vector3();
game.creatorCamera = (dt, t) => {
  const p = game.preview;
  p.yaw = Math.sin(t * 0.6) * 0.35 + p.spin;
  const wide = innerWidth > 700;
  if (wide) {
    camera.position.set(p.pos.x + 0.15, p.pos.y + 1.25, p.pos.z + 3.4);
    previewLook.set(p.pos.x - 0.95, p.pos.y + 0.72, p.pos.z);
  } else {
    camera.position.set(p.pos.x, p.pos.y + 1.7, p.pos.z + 5.6);
    previewLook.set(p.pos.x, p.pos.y - 1.35, p.pos.z);
  }
  camera.lookAt(previewLook);
  setNearFar(0.1, 700);
};
canvas.addEventListener('pointermove', (e) => {
  if (game.mode === 'creator' && e.buttons) game.preview.spin += e.movementX * 0.01;
});

const creator = new Creator({
  onChange: (prof) => {
    const prev = game.preview.char.avatar.animal;
    game.preview.char.setAvatar(prof.avatar);
    if (prev !== prof.avatar.animal) game.preview.char.playEmote('wave');
  },
  onSubmit: (kind, prof) => {
    me.name = prof.name;
    me.avatar = prof.avatar;
    if (kind === 'done') {
      me.char.setAvatar(me.avatar);
      game.onLook?.();
      closeCreator();
      return;
    }
    me.char.setAvatar(me.avatar);
    startPlay(kind);
  },
});

function openCreator(edit = false) {
  editing = edit;
  const prof = { name: me.name, avatar: me.avatar };
  game.preview.char.setAvatar(me.avatar);
  game.preview.char.addTo(scene);
  game.preview.spin = 0;
  creator.open(prof, { editing: edit });
  $('title').classList.add('hidden');
  if (edit) $('hud').classList.add('hidden');
  game.mode = 'creator';
}
game.openCreator = openCreator;

function closeCreator() {
  creator.close();
  game.preview.char.removeFrom(scene);
  if (editing) {
    $('hud').classList.remove('hidden');
    game.mode = 'play';
  }
}

// ---------- start ----------
function startPlay(kind) {
  closeCreator();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  if (!game.players.has(me.id)) spawnMe();
  cam.yaw = 0;
  cam.target.set(me.pos.x, me.pos.y + 1, me.pos.z);
  game.mode = 'play';
  canvas.focus();
  if (kind !== 'solo') toast('Rooms are coming in the next step — wandering solo for now');
}

const saved = loadProfile();
if (saved) { me.name = saved.name; me.avatar = saved.avatar; me.char.setAvatar(me.avatar); }
else { me.name = randomName(); }

setupTouch();
$('btn-play').addEventListener('click', () => openCreator(false));
renderer.shadowMap.needsUpdate = true;
requestAnimationFrame(frame);
requestAnimationFrame(() => $('loading').classList.add('done'));
