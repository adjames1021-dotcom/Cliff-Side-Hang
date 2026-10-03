// Game loop, camera, input and players.
import * as THREE from 'three';
import { outlineUniforms, Builder, sphere, lathe, C } from './toon.js';
import { buildWorld, L, groundHeight, isWater } from './world.js';
import { Character, randomAvatar, SIT_DROP, PROP_INFO, EMOTES } from './characters.js';
import { Effects } from './effects.js';
import { DayNight } from './daynight.js';
import { buildScenery } from './scenery.js';
import { Post } from './post.js';
import { Creator, loadProfile, toast, randomName, showPrompt, EmoteWheel, overlay } from './ui.js';
import { Net, Chat, renderLobby, readInvite, makeCode, copyText } from './net.js';
import { Snapshots, updateRemote, RoomClock, Shared, lerpAngle } from './sync.js';
import { Audio } from './audio.js';
import { ACTIVITIES } from './activities/index.js';

const $ = (id) => document.getElementById(id);
const r2 = (v) => Math.round(v * 100) / 100;

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
const scenery = buildScenery(scene, world, fx);
const post = new Post(renderer, scene, camera);
const net = new Net();
const shared = new Shared();
const clock = new RoomClock();
const audio = new Audio();

const game = {
  scene, camera, renderer, world, fx, sky, net, shared, clock, audio, post,
  players: new Map(), mode: 'title', t: 0, maxPlayers: 8, toast,
};
game.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
game.noRender = new URLSearchParams(location.search).has('norender'); // headless tests only
game.lockQuality = new URLSearchParams(location.search).has('hq'); // keep full quality (screenshots)
window.__hh = game; // handy for debugging and the Playwright checks

// ---------- local player ----------
const me = {
  id: 'me', name: 'You', avatar: randomAvatar(),
  pos: new THREE.Vector3(L.spawn.x, 0, L.spawn.z), vel: new THREE.Vector3(), yaw: Math.PI, vy: 0, speed: 0,
  grounded: true, landed: false, seat: null, pose: 'idle', prop: null, swing: 0, busy: null,
};
me.char = new Character(me.avatar);
game.me = me;

function spawnMe() {
  const x = L.spawn.x + (Math.random() - 0.5) * 2, z = L.spawn.z + Math.random();
  me.pos.set(x, groundHeight(x, z), z);
  me.yaw = Math.PI;
  me.char.addTo(scene);
  game.players.set(me.id, me);
}

// ---------- remote players ----------
function addRemote(rec) {
  let p = game.players.get(rec.id);
  if (!p) {
    p = {
      id: rec.id, name: rec.name, avatar: rec.avatar, char: new Character(rec.avatar),
      pos: new THREE.Vector3(...rec.p), yaw: rec.r || 0, snaps: new Snapshots(), speed: 0, pose: rec.a || 'idle',
      swing: rec.s || 0, prop: null, seat: null, grounded: true, vy: 0,
    };
    p.char.addTo(scene);
    game.players.set(p.id, p);
  } else if (p !== me) {
    if (p.name !== rec.name) p.name = rec.name;
    if (JSON.stringify(p.avatar) !== JSON.stringify(rec.avatar)) { p.avatar = rec.avatar; p.char.setAvatar(rec.avatar); }
  }
  p.snaps.push({ p: rec.p, r: rec.r, a: rec.a, s: rec.s });
  if ((rec.prop || null) !== p.prop) { p.prop = rec.prop || null; p.char.setProp(p.prop); }
  if (rec.seat !== undefined) applySit(rec.id, rec.seat || null);
  return p;
}
function removeRemote(id) {
  const p = game.players.get(id);
  if (!p || p === me) return;
  p.char.removeFrom(scene);
  p.tag?.el.remove();
  game.players.delete(id);
  shared.setSeat(id, null);
  for (const a of activities) a.onLeave?.(id);
}
game.addRemote = addRemote;
game.removeRemote = removeRemote;
function clearRemotes() {
  for (const id of [...game.players.keys()]) if (id !== me.id) removeRemote(id);
}

// ---------- input ----------
const keys = new Set();
let typing = false;
const input = { x: 0, z: 0, run: false, jump: false };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

addEventListener('keydown', (e) => {
  if (typing || e.target.tagName === 'INPUT') return;
  if (game.mode !== 'play') return;
  if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
  keys.add(e.code);
  if (overlayOpen()) {
    if (e.code === 'Escape') closeOverlays();
    return;
  }
  if (e.code === 'Escape' && me.busy) { game.endBusy(); return; }
  for (const a of activities) if (a.key?.(e.code, e)) { e.preventDefault(); return; }
  if (wheel.isOpen && /^Digit[1-8]$/.test(e.code)) { wheel.key(+e.code.slice(5)); return; }
  switch (e.code) {
    case 'Space': e.preventDefault(); input.jump = true; break;
    case 'Enter': e.preventDefault(); chat.open(); break;
    case 'KeyE': act(); break;
    case 'KeyQ': wheel.toggle(); break;
    case 'KeyG': doPing(); break;
    case 'KeyB': openBook(); break;
    case 'KeyM': toggleSound(); break;
    case 'KeyR': if (me.prop && !me.busy) setMyProp(null); break;
    case 'Escape':
      if (wheel.isOpen) wheel.close();
      else if ($('lobby').classList.contains('hidden') === false) $('lobby').classList.add('hidden');
      else openPause();
      break;
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const cam = { yaw: 0, pitch: 0.38, dist: 7.5, target: new THREE.Vector3() };
game.cam = cam;
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (e.pointerType === 'touch') return;
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  canvas.focus();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerType === 'touch') return;
  orbit(e.clientX - drag.x, e.clientY - drag.y);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + Math.sign(e.deltaY) * 0.1), 3, 15); e.preventDefault(); }, { passive: false });
function orbit(dx, dy) {
  if (game.mode === 'creator') { game.preview.spin += dx * 0.01; return; }
  if (game.lookHook?.(dx, dy)) return;
  cam.yaw -= dx * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.005, -0.05, 1.25);
}

// touch: left side = joystick, elsewhere = orbit, two fingers = pinch zoom
const touch = { stick: null, look: new Map(), x: 0, z: 0 };
function setupTouch() {
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  zone.addEventListener('pointerdown', (e) => {
    audio.unlock();
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
      if (before > 0 && after > 0) cam.dist = THREE.MathUtils.clamp(cam.dist * (before / after), 3, 15);
      return;
    }
    orbit((e.clientX - p.x) * 1.3, (e.clientY - p.y) * 1.3);
    p.x = e.clientX; p.y = e.clientY;
  });
  const lift = (e) => touch.look.delete(e.pointerId);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);
  const btn = (id, fn) => {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); b.classList.add('pressed'); fn(); });
    const up = () => b.classList.remove('pressed');
    b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
  };
  btn('t-jump', () => { for (const a of activities) if (a.key?.('Space')) return; input.jump = true; });
  btn('t-act', () => act());
  btn('t-emote', () => wheel.toggle());
  btn('t-chat', () => chat.open());
}

function readInput() {
  let x = 0, z = 0;
  if (!typing) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  }
  x += touch.x; z += touch.z;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  input.x = x; input.z = z;
  input.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(touch.x, touch.z) > 0.92;
  if (game.autoMove) { input.x = game.autoMove.x; input.z = game.autoMove.z; input.run = !!game.autoMove.run; }
}

// ---------- movement + collisions ----------
const WALK = 3.3, RUN = 5.9, JUMP = 4.9, GRAV = 15, RADIUS = 0.33;

function collide(px, pz, r = RADIUS) {
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
  return [Math.max(b.minX, Math.min(b.maxX, px)), Math.max(b.minZ, Math.min(b.maxZ, pz))];
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
  const wantsMove = Math.hypot(input.x, input.z) > 0.3;
  if (me.busy) {
    me.vel.set(0, 0, 0); me.speed = 0;
    if (wantsMove && me.busyCancelOnMove) game.endBusy?.();
    input.jump = false;
    return;
  }
  if (me.seat) {
    if (wantsMove || (input.jump && !seatTakesSpace())) standUp();
    input.jump = false;
    return;
  }
  fwd.set(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
  right.set(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
  const speed = input.run ? RUN : WALK;
  const tx = (fwd.x * input.z + right.x * input.x) * speed;
  const tz = (fwd.z * input.z + right.z * input.x) * speed;
  const k = 1 - Math.exp(-(me.grounded ? 14 : 5) * dt);
  me.vel.x += (tx - me.vel.x) * k;
  me.vel.z += (tz - me.vel.z) * k;
  if (wantsMove && (me.pose === 'sitground' || me.pose === 'sleep')) me.pose = 'idle';

  if (input.jump && me.grounded) {
    me.vy = JUMP; me.grounded = false;
    if (me.pose !== 'idle') me.pose = 'idle';
    audio.play('hop');
  }
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
    me.pos.y = g; me.vy = 0;
  } else {
    me.grounded = false;
  }
  const hs = Math.hypot(me.vel.x, me.vel.z);
  if (hs > 0.2) me.yaw = lerpAngle(me.yaw, Math.atan2(me.vel.x, me.vel.z), 1 - Math.exp(-dt * 12));
  me.speed = hs;
}

// ---------- camera ----------
const camBlockers = [
  { x0: L.cafe.x0, z0: L.cafe.z0, x1: L.cafe.x1, z1: L.cafe.z1, h: 3.4 },
  { x0: -4, z0: L.stage.z0 - 0.3, x1: 4, z1: L.stage.z0 + 0.45, h: 4.2 },
];
const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), camDir = new THREE.Vector3();
function updateCamera(dt) {
  if (game.cameraOverride) { game.cameraOverride(dt); return; }
  tmp.set(me.pos.x, me.pos.y + 1.0, me.pos.z);
  if (me.seat && !me.seatPose?.stand) tmp.y -= SIT_DROP;
  cam.target.lerp(tmp, 1 - Math.exp(-dt * 10));
  let dist = cam.dist;
  camDir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  for (let d = 0.6; d < dist; d += 0.25) {
    const x = cam.target.x + camDir.x * d, y = cam.target.y + camDir.y * d, z = cam.target.z + camDir.z * d;
    if (camBlockers.some((b) => x > b.x0 - 0.2 && x < b.x1 + 0.2 && z > b.z0 - 0.2 && z < b.z1 + 0.2 && y < b.h)) { dist = Math.max(1.2, d - 0.3); break; }
  }
  camPos.copy(cam.target).addScaledVector(camDir, dist);
  const floor = groundHeight(camPos.x, camPos.z) + 0.45;
  if (camPos.y < floor) camPos.y = floor;
  camera.position.copy(camPos);
  camera.lookAt(cam.target);
  setNearFar(0.15, 700);
}
function setNearFar(n, f) {
  if (camera.near !== n || camera.far !== f) { camera.near = n; camera.far = f; camera.updateProjectionMatrix(); }
}
game.setNearFar = setNearFar;

// far-away title camera with a tight near/far range so nothing z-fights
function titleCamera(t) {
  const a = t * 0.04 + 2.4;
  camera.position.set(Math.cos(a) * 44, 21 + Math.sin(t * 0.1) * 1.5, Math.sin(a) * 44);
  camera.lookAt(0, 1.5, 0);
  setNearFar(4, 520);
}

// ---------- resize + adaptive quality ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = game.fovOverride || (w < h ? 62 : 50);
  camera.updateProjectionMatrix();
  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  outlineUniforms.uRes.value.copy(buf);
  outlineUniforms.uThickness.value = Math.max(1.3, 1.7 * pixelRatio);
  fx.resize(buf.y, camera.fov);
  post.setSize(w, h, pixelRatio);
}
game.resize = resize;
addEventListener('resize', resize);
resize();

const perf = { frames: 0, time: 0, good: 0 };
function adaptQuality(dt) {
  if (game.lockQuality) return;
  perf.frames++; perf.time += dt;
  if (perf.time < 2) return;
  const fps = perf.frames / perf.time;
  perf.frames = 0; perf.time = 0;
  // struggling? drop the bloom first, then resolution
  if (fps < 40 && post.enabled) { post.enabled = false; perf.good = 0; }
  else if (fps < 40 && pixelRatio > 0.7) { pixelRatio = Math.max(0.7, pixelRatio - 0.25); resize(); perf.good = 0; }
  else if (fps > 58 && !post.enabled) { if (++perf.good >= 6) { post.enabled = true; perf.good = 0; } }
  else if (fps > 58 && pixelRatio < maxPR) { if (++perf.good >= 4) { pixelRatio = Math.min(maxPR, pixelRatio + 0.25); resize(); perf.good = 0; } }
}

// ---------- name tags + speech bubbles ----------
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
    const sitting = p.char.root.position.y < (p.seatPose ? p.seatPose.y : p.pos.y) - 0.05;
    v3.set(root.x, root.y + p.char.labelY - (sitting ? 0.05 : 0), root.z).project(camera);
    const dist = camera.position.distanceTo(root);
    if (v3.z > 1 || dist > 40 || game.mode !== 'play' || game.hideTags) { p.tag.el.style.display = 'none'; continue; }
    p.tag.el.style.display = '';
    const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
    const s = THREE.MathUtils.clamp(9 / dist, 0.55, 1.1);
    p.tag.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
    p.tag.el.style.zIndex = String(1000 - Math.round(dist * 10));
  }
}
function say(p, text, ms) {
  ensureTag(p);
  const b = p.tag.bubble;
  b.textContent = text; // plain text only
  b.classList.remove('hidden');
  b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(p.sayTimer);
  p.sayTimer = setTimeout(() => b.classList.add('hidden'), ms || 4500 + text.length * 45);
}
game.say = say;

// ---------- seats ----------
const STATIC_POSE = { bench: 'sit', log: 'sit', stool: 'stool', ground: 'sitground' };
function seatPose(p, seatId) {
  for (const a of activities) {
    const sp = a.seatPose?.(seatId, p);
    if (sp) return sp;
  }
  const s = world.seatById(seatId);
  if (!s) return null;
  return { x: s.x, y: s.y, z: s.z, yaw: s.yaw, pose: STATIC_POSE[s.kind] || 'sit', groundY: groundHeight(s.x, s.z) };
}
function applySit(id, seat) {
  const p = game.players.get(id);
  shared.setSeat(id, seat);
  if (!p) return;
  const was = p.seat;
  p.seat = seat;
  p.seatPose = seat ? seatPose(p, seat) : null;
  if (p === me) {
    me.vel.set(0, 0, 0);
    if (seat) { me.pose = 'idle'; audio.play('pop'); }
    for (const a of activities) a.onSeat?.(seat, was);
  }
}
function requestSit(seatId) {
  const holder = shared.occupant(seatId);
  if (holder && holder !== me.id) { toast("Someone's already sitting there"); return; }
  if (net.online) net.send({ t: 'sit', seat: seatId });
  else applySit(me.id, seatId);
}
function standUp() {
  if (!me.seat) return;
  const sp = me.seatPose || seatPose(me, me.seat);
  if (sp) {
    const fx2 = Math.sin(sp.yaw), fz2 = Math.cos(sp.yaw);
    let [x, z] = sp.exit ? collide(sp.exit.x, sp.exit.z) : collide(sp.x + fx2 * 0.7, sp.z + fz2 * 0.7);
    if (isWater(x, z)) [x, z] = [sp.x, sp.z];
    me.pos.set(x, groundHeight(x, z), z);
    me.yaw = sp.yaw;
  }
  if (net.online) net.send({ t: 'sit', seat: null });
  applySit(me.id, null);
}
const seatTakesSpace = () => activities.some((a) => a.seatUsesSpace?.(me.seat));
Object.assign(game, { requestSit, standUp, applySit, seatPose });

// ---------- props ----------
function setMyProp(name, mallowColor) {
  me.prop = name || null;
  me.bites = 0;
  me.char.setProp(me.prop, mallowColor);
  if (net.online) net.send({ t: 'prop', prop: me.prop });
}
function useProp() {
  const info = PROP_INFO[me.prop];
  if (!info) return;
  me.char.sip();
  audio.play(info.drink ? 'sip' : 'munch');
  if (net.online) net.send({ t: 'emote', e: 'sip' });
  me.bites = (me.bites || 0) + 1;
  fx.emit('hearts', headPos(me), { n: 1 });
  if ((info.food && me.bites >= 3) || (info.drink && me.bites >= 5)) {
    setTimeout(() => { if (me.prop) { setMyProp(null); toast(info.drink ? 'All gone — that was lovely' : 'Yum! All gone'); } }, 700);
  }
}
game.setMyProp = setMyProp;

// ---------- busy activities (fishing, toasting, telescope) ----------
let busyEnd = null;
game.startBusy = (kind, o = {}) => {
  if (me.seat) standUp();
  me.busy = kind;
  me.busyPose = o.pose || 'idle';
  me.busyCancelOnMove = o.cancelOnMove !== false;
  me.pose = 'idle';
  busyEnd = o.end || null;
  game.busyPrompt = o.prompt || null;
  sendMove(true);
};
game.endBusy = () => {
  if (!me.busy) return;
  const f = busyEnd;
  me.busy = null;
  busyEnd = null;
  game.busyPrompt = null;
  f?.();
  sendMove(true);
};

// ---------- emotes ----------
const headPos = (p, up = 0) => new THREE.Vector3(p.char.root.position.x, p.char.root.position.y + p.char.labelY - 0.25 + up, p.char.root.position.z);
game.headPos = headPos;
function doEmote(id, x) {
  if (me.busy) return;
  if (id === 'sitground' || id === 'sleep') {
    if (me.seat) standUp();
    me.vel.set(0, 0, 0);
    me.pose = me.pose === id ? 'idle' : id;
    if (me.pose === id) emoteFx(me, id);
    sendMove(true);
  } else {
    me.char.playEmote(id);
    emoteFx(me, id, x);
  }
  if (net.online) net.send({ t: 'emote', e: id, x });
}
game.doEmote = doEmote;
function emoteFx(p, e, x) {
  const h = headPos(p);
  p.fxTimer = 0; p.fxKind = e; p.fxLeft = { dance: 3.8, clap: 1.8, heart: 1.6 }[e] || 0;
  switch (e) {
    case 'wave': fx.emit('sparkles', h, { n: 5 }); break;
    case 'laugh': fx.emit('sparkles', h, { n: 8, color: C.butter }); say(p, 'Hehe!', 1600); break;
    case 'heart': fx.emit('hearts', h, { n: 4 }); break;
    case 'cheer': fx.emit('confetti', h); break;
    case 'sitground': fx.emit('puff', p.char.root.position, { n: 6 }); break;
    case 'catch': fx.emit('sparkles', h, { n: 12 }); if (x) say(p, `Caught a ${x}!`, 3000); break;
    case 'show': fx.emit('sparkles', h, { n: 10 }); if (x) say(p, `Look, a ${x}!`, 3000); break;
    case 'sip': p.char.sip(); break;
  }
  if (p !== me && e !== 'sip') audio.play('emote', { at: p.char.root.position, listener: me.pos });
  else if (e !== 'sip') audio.play('emote');
}
function emoteTicks(dt) {
  for (const p of game.players.values()) {
    if (p.fxLeft > 0) {
      p.fxLeft -= dt; p.fxTimer -= dt;
      if (p.fxTimer <= 0) {
        p.fxTimer = p.fxKind === 'dance' ? 0.5 : p.fxKind === 'clap' ? 0.25 : 0.7;
        const h = headPos(p);
        if (p.fxKind === 'dance') fx.emit('notes', h);
        if (p.fxKind === 'clap') fx.emit('sparkles', h.setY(h.y - 0.45), { n: 3 });
        if (p.fxKind === 'heart') fx.emit('hearts', h, { n: 2 });
      }
    }
    const pose = p.seatPose ? p.seatPose.pose : p.pose;
    if (pose === 'sleep') {
      p.zT = (p.zT || 0) - dt;
      if (p.zT <= 0) { p.zT = 1.1; fx.emit('z', headPos(p, 0.15)); }
    }
  }
}
const wheel = new EmoteWheel((id) => doEmote(id));

// ---------- chat ----------
const chat = new Chat((text) => {
  say(me, text);
  chat.add(me.name, text);
  audio.play('blip');
  if (net.online) net.send({ t: 'chat', text });
}, (on) => { typing = on; if (on) keys.clear(); });

// ---------- pings ----------
const pingGeo = (() => {
  const b = new Builder();
  b.add(sphere(0.22, 14, 10), C.apricot, { pos: [0, 0.62, 0] });
  b.add(lathe([[0, 0], [0.05, 0.05], [0.16, 0.32], [0.2, 0.45], [0, 0.45]], 14), C.apricot, { pos: [0, 0.05, 0] });
  b.add(sphere(0.09, 10, 8), C.cream2, { pos: [0, 0.65, 0.17] }, { outline: false });
  return b;
})();
const pings = [];
function showPing(p, pos) {
  const g = pingGeo.build();
  g.position.set(pos[0], pos[1], pos[2]);
  scene.add(g);
  const label = document.createElement('div');
  label.className = 'ping-tag';
  label.textContent = `${p.name}`;
  labels.append(label);
  pings.push({ g, label, t: 0, base: pos[1] });
  fx.emit('ring', { x: pos[0], y: pos[1] + 0.05, z: pos[2] });
  audio.play('ping');
  while (pings.length > 6) dropPing(pings[0]);
}
function dropPing(pg) {
  scene.remove(pg.g);
  pg.g.traverse((o) => o.geometry?.dispose());
  pg.label.remove();
  pings.splice(pings.indexOf(pg), 1);
}
function updatePings(dt) {
  for (const pg of [...pings]) {
    pg.t += dt;
    if (pg.t > 5) { dropPing(pg); continue; }
    pg.g.position.y = pg.base + Math.abs(Math.sin(pg.t * 4)) * 0.3 * Math.max(0, 1 - pg.t / 3);
    pg.g.rotation.y = pg.t * 2;
    const s = Math.min(1, pg.t * 6) * (pg.t > 4.6 ? (5 - pg.t) / 0.4 : 1);
    pg.g.scale.setScalar(Math.max(0.01, s));
    v3.copy(pg.g.position).setY(pg.g.position.y + 1.1).project(camera);
    if (v3.z > 1) { pg.label.style.display = 'none'; continue; }
    pg.label.style.display = '';
    pg.label.style.transform = `translate(${((v3.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-v3.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -100%)`;
  }
}
function lookPoint() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const p = camera.position.clone();
  let prev = p.clone();
  for (let d = 0; d < 70; d += 0.25) {
    p.copy(camera.position).addScaledVector(dir, d);
    if (p.y <= groundHeight(p.x, p.z)) {
      for (let i = 0; i < 8; i++) {
        const mid = prev.clone().lerp(p, 0.5);
        if (mid.y <= groundHeight(mid.x, mid.z)) p.copy(mid); else prev.copy(mid);
      }
      return [r2(p.x), r2(groundHeight(p.x, p.z)), r2(p.z)];
    }
    prev.copy(p);
  }
  return null;
}
function doPing() {
  const p = lookPoint();
  if (!p) { toast('Look at the ground to drop a ping'); return; }
  showPing(me, p);
  if (net.online) net.send({ t: 'ping', p });
}
game.doPing = doPing;

// ---------- interactions ----------
let current = null;
function interactables() {
  const list = [];
  for (const s of world.seats) {
    const holder = shared.occupant(s.id);
    if (holder && holder !== me.id) continue;
    list.push({ x: s.x, z: s.z, r: 1.35, label: s.kind === 'ground' ? 'Sit on the blanket' : 'Sit', use: () => requestSit(s.id) });
  }
  for (const a of activities) a.interactables?.(list);
  return list;
}
function pickInteraction() {
  if (me.busy) return game.busyPrompt?.() || null;
  const consumable = me.prop && PROP_INFO[me.prop] && (PROP_INFO[me.prop].food || PROP_INFO[me.prop].drink);
  const useLabel = () => (PROP_INFO[me.prop].drink ? `Sip your ${PROP_INFO[me.prop].label}` : `Eat your ${PROP_INFO[me.prop].label}`);
  if (me.seat) {
    for (const a of activities) { const c = a.seatPrompt?.(me.seat); if (c) return c; }
    if (consumable) return { label: `${useLabel()} (walk to stand)`, use: useProp };
    return { label: 'Stand up', use: standUp };
  }
  if (!me.grounded) return null;
  let best = null, bd = Infinity;
  for (const it of interactables()) {
    const raw = Math.hypot(it.x - me.pos.x, it.z - me.pos.z);
    const d = raw - (it.priority || 0); // priority only breaks ties between nearby things
    if (raw < it.r && d < bd) { bd = d; best = it; }
  }
  if (!best && consumable) return { label: useLabel(), use: useProp };
  return best;
}
function act() {
  audio.unlock();
  if (wheel.isOpen) return;
  const it = pickInteraction();
  if (it) it.use();
}
game.act = act;

// ---------- networking ----------
let lastSent = 0, lastSig = '';
function myPose() {
  if (me.busy) return me.busyPose || 'idle';
  if (me.seat) return me.seatPose?.pose || 'sit';
  if (!me.grounded) return 'jump';
  if (me.pose === 'sitground' || me.pose === 'sleep') return me.pose;
  return me.speed > 4.2 ? 'run' : me.speed > 0.25 ? 'walk' : 'idle';
}
function sendMove(force = false) {
  if (!net.online) return;
  const now = performance.now();
  if (!force && now - lastSent < 95) return;
  const msg = { t: 'move', p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], r: r2(me.yaw), a: myPose(), s: r2(me.swing || 0) };
  const sig = JSON.stringify(msg);
  if (!force && sig === lastSig) return;
  lastSig = sig; lastSent = now;
  net.send(msg);
}
game.sendMove = sendMove;

net.on('roster', (m) => {
  clearRemotes();
  game.players.delete(me.id);
  me.id = m.you;
  game.players.set(me.id, me);
  game.maxPlayers = m.max || 8;
  clock.set(m.clock);
  shared.seats = new Map(Object.entries(m.seats || {}));
  shared.fire = { litAt: m.fire.litAt, by: m.fire.by, burnMs: m.fire.burnMs };
  clock.fireOffset = m.fire.now - Date.now();
  const mine = m.players.find((p) => p.id === m.you);
  if (mine && !m.rejoin) {
    me.pos.set(mine.p[0], groundHeight(mine.p[0], mine.p[2]), mine.p[2]);
    me.yaw = mine.r;
  }
  for (const rec of m.players) if (rec.id !== m.you) addRemote(rec);
  // after a reconnect, re-assert what we were doing
  if (me.seat && (!mine || mine.seat !== me.seat)) net.send({ t: 'sit', seat: me.seat });
  else if (!me.seat && mine?.seat) net.send({ t: 'sit', seat: null });
  if (me.prop) net.send({ t: 'prop', prop: me.prop });
  for (const a of activities) a.onRoster?.(m);
  sendMove(true);
  updateRoomUI();
  if (!m.rejoin) {
    toast(m.players.length > 1 ? `Joined room ${net.room} — ${m.players.length - 1} friend${m.players.length > 2 ? 's' : ''} here` : `Room ${net.room} is ready — share the invite link!`);
    chat.add('', `You joined room ${net.room}.`, true);
  }
});
net.on('join', (m) => {
  const known = game.players.has(m.p.id);
  addRemote(m.p);
  if (!known && !m.rejoin) { chat.add('', `${m.p.name} arrived.`, true); audio.play('join'); }
  updateRoomUI();
});
net.on('leave', (m) => {
  const p = game.players.get(m.id);
  if (p && p !== me) chat.add('', `${p.name} headed home.`, true);
  removeRemote(m.id);
  updateRoomUI();
});
net.on('move', (m) => {
  const p = game.players.get(m.id);
  if (!p || p === me) return;
  p.snaps.push({ p: m.p, r: m.r, a: m.a, s: m.s });
});
net.on('look', (m) => {
  const p = game.players.get(m.id);
  if (!p || p === me) return;
  p.name = m.name; p.avatar = m.avatar; p.char.setAvatar(m.avatar);
  fx.emit('puff', p.char.root.position);
  updateRoomUI();
});
net.on('chat', (m) => {
  const p = game.players.get(m.id);
  if (!p) return;
  say(p, m.text);
  chat.add(p.name, m.text);
  audio.play('blip');
});
net.on('emote', (m) => {
  const p = game.players.get(m.id);
  if (!p || p === me) return;
  if (m.e !== 'sitground' && m.e !== 'sleep' && m.e !== 'sip') p.char.playEmote(m.e);
  emoteFx(p, m.e, m.x);
});
net.on('sit', (m) => {
  if (m.ok === false) {
    if (m.id === me.id) toast(m.reason || "Someone's already there");
    return;
  }
  applySit(m.id, m.seat);
});
net.on('prop', (m) => {
  const p = game.players.get(m.id);
  if (!p || p === me) return;
  p.prop = m.prop; p.char.setProp(m.prop);
});
net.on('ping', (m) => {
  const p = game.players.get(m.id);
  if (p) showPing(p, m.p);
});
net.on('full', () => {
  leaveToCreator();
  creator.message(`That room is full (${game.maxPlayers}/${game.maxPlayers}). Try another code or make a new room.`);
  toast('That room is full');
});
net.on('replaced', () => {
  toast('You opened the village in another tab — this one is resting now');
  chat.add('', 'Connected from another tab.', true);
  updateRoomUI();
});
net.on('status', () => updateRoomUI());

function updateRoomUI() {
  const online = net.room && net.status === 'online';
  $('room-code').textContent = net.room ? net.room : 'Solo';
  $('room-count').textContent = net.room ? ` · ${game.players.size}/${game.maxPlayers}` : '';
  $('net-dot').classList.toggle('off', !!net.room && !online);
  $('net-dot').classList.toggle('hidden', !net.room);
  $('p-invite').classList.toggle('hidden', !net.room);
  $('p-leave').textContent = net.room ? 'Leave room' : 'Back to the menu';
  if (net.room && net.status === 'reconnecting') $('room-code').textContent = `${net.room} (reconnecting…)`;
  renderLobby(game);
}

// ---------- overlays: lobby, pause, book, sound ----------
const overlayOpen = () => ['pause', 'book'].some((id) => !$(id).classList.contains('hidden'));
function closeOverlays() { overlay('pause', false); overlay('book', false); }
function openPause() { $('lobby').classList.add('hidden'); overlay('pause', true); }
function openBook() { game.renderBook?.(); overlay('pause', false); overlay('book', true); }
function toggleSound() {
  audio.setMuted(!audio.muted);
  $('btn-sound').textContent = audio.muted ? '🔇' : '🔊';
  $('p-sound').textContent = `Sound: ${audio.muted ? 'off' : 'on'}`;
}
async function copyInvite() {
  if (!net.room) return;
  const ok = await copyText(net.inviteLink());
  toast(ok ? 'Invite link copied — send it to a friend!' : net.inviteLink(), ok ? 2600 : 6000);
}
$('room-pill').onclick = () => { renderLobby(game); $('lobby').classList.toggle('hidden'); };
$('btn-invite').onclick = copyInvite;
$('btn-menu').onclick = openPause;
$('btn-emote').onclick = () => wheel.toggle();
$('btn-chat').onclick = () => chat.open();
$('btn-book').onclick = openBook;
$('btn-sound').onclick = toggleSound;
$('p-resume').onclick = closeOverlays;
$('p-look').onclick = () => { closeOverlays(); openCreator(true); };
$('p-invite').onclick = copyInvite;
$('p-book').onclick = openBook;
$('p-sound').onclick = toggleSound;
$('p-leave').onclick = () => { closeOverlays(); leaveToCreator(); };
$('book-close').onclick = () => overlay('book', false);
for (const id of ['pause', 'book']) $(id).addEventListener('click', (e) => { if (e.target.id === id) overlay(id, false); });

// ---------- activities ----------
const activities = ACTIVITIES.map((make) => make(game));
game.activities = activities;

// ---------- players: pose + transforms ----------
const GROUND_POSES = new Set(['sitground', 'sleep']);
function placeCharacter(p, dt) {
  const c = p.char;
  let pose = p.pose;
  if (p.seat && p.seatPose) {
    const sp = (p.seatPose = seatPose(p, p.seat) || p.seatPose);
    c.root.position.set(sp.x, sp.y - (sp.stand ? 0 : SIT_DROP), sp.z);
    if (sp.quat) c.root.quaternion.copy(sp.quat); else c.root.rotation.set(0, sp.yaw, 0);
    pose = sp.pose;
    if (p === me) me.pos.set(sp.x, sp.y, sp.z);
  } else {
    c.root.position.copy(p.pos);
    if (GROUND_POSES.has(pose)) c.root.position.y -= SIT_DROP;
    c.root.rotation.set(0, p.yaw, 0);
  }
  if (pose === 'walk' || pose === 'run' || pose === 'jump') pose = 'idle';
  c.update(dt, {
    speed: p.speed || 0, grounded: p.grounded !== false, vy: p.vy || 0, landed: p.landed, pose,
    groundY: p.seatPose ? p.seatPose.groundY ?? groundHeight(c.root.position.x, c.root.position.z) : groundHeight(p.pos.x, p.pos.z),
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
    for (const p of game.players.values()) if (p !== me) updateRemote(p, dt, groundHeight);
    for (const a of activities) a.update?.(dt, t);
    updateCamera(dt);
    sendMove();
    current = pickInteraction();
    showPrompt(current?.label || '', current?.key || (isTouch ? 'Tap' : 'E'));
    emoteTicks(dt);
    updatePings(dt);
  } else if (game.mode === 'title') {
    titleCamera(t);
    for (const a of activities) a.update?.(dt, t);
  } else if (game.mode === 'creator') {
    creatorCamera(dt, t);
    for (const a of activities) a.update?.(dt, t);
  }
  for (const p of game.players.values()) placeCharacter(p, dt);
  if (game.mode === 'creator') placeCharacter(game.preview, dt);

  sky.update(clock.day(), dt, t, camera, game.mode === 'play' ? me.pos : null);
  world.update(dt, t, clock.ms() / 1000, { night: sky.night });
  scenery.update(dt, t, clock.ms() / 1000, { night: sky.night, horizon: sky.horizon, focus: game.mode === 'play' ? me.pos : null });
  post.setLook(sky.night, sky.golden);
  audio.update?.(dt, game);
  fx.update(dt);
  updateTags();
  if (!game.noRender) { post.render(); adaptQuality(dt); }
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
function creatorCamera(dt, t) {
  const p = game.preview;
  p.yaw = Math.sin(t * 0.6) * 0.35 + p.spin;
  if (innerWidth > 700) {
    camera.position.set(p.pos.x + 0.15, p.pos.y + 1.25, p.pos.z + 3.4);
    previewLook.set(p.pos.x - 0.95, p.pos.y + 0.72, p.pos.z);
  } else {
    camera.position.set(p.pos.x, p.pos.y + 1.7, p.pos.z + 5.6);
    previewLook.set(p.pos.x, p.pos.y - 1.35, p.pos.z);
  }
  camera.lookAt(previewLook);
  setNearFar(0.1, 700);
}
canvas.addEventListener('pointermove', (e) => {
  if (game.mode === 'creator' && e.buttons && e.pointerType !== 'touch') game.preview.spin += e.movementX * 0.01;
});

const creator = new Creator({
  onChange: (prof) => {
    const prev = game.preview.char.avatar.animal;
    game.preview.char.setAvatar(prof.avatar);
    if (prev !== prof.avatar.animal) game.preview.char.playEmote('wave');
    audio.unlock();
    audio.play('pop');
  },
  onSubmit: (kind, prof, code) => {
    audio.unlock();
    me.name = prof.name;
    me.avatar = prof.avatar;
    me.char.setAvatar(me.avatar);
    if (kind === 'done') {
      closeCreator();
      if (net.online) net.send({ t: 'look', name: me.name, avatar: me.avatar });
      fx.emit('puff', me.char.root.position);
      updateRoomUI();
      return;
    }
    if (kind === 'solo') return startPlay(null);
    if (!net.base) { creator.message('No server found. Set a server address below, or wander solo.'); return; }
    startPlay(kind === 'create' ? makeCode() : code);
  },
});

function openCreator(edit = false) {
  editing = edit;
  game.preview.char.setAvatar(me.avatar);
  game.preview.char.addTo(scene);
  game.preview.spin = 0;
  creator.open({ name: me.name, avatar: me.avatar }, { editing: edit, code: readInvite().code || '' });
  $('title').classList.add('hidden');
  if (edit) $('hud').classList.add('hidden');
  game.mode = 'creator';
  refreshServerLine();
}
game.openCreator = openCreator;

function closeCreator() {
  creator.close();
  game.preview.char.removeFrom(scene);
  if (editing) { $('hud').classList.remove('hidden'); game.mode = 'play'; editing = false; }
}

// ---------- start / leave ----------
function startPlay(code) {
  closeCreator();
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  if (!game.players.has(me.id)) spawnMe();
  cam.yaw = 0;
  cam.target.set(me.pos.x, me.pos.y + 1, me.pos.z);
  game.mode = 'play';
  canvas.focus();
  clock.solo();
  shared.reset();
  for (const a of activities) a.onStart?.(code);
  if (code) {
    history.replaceState(null, '', net.inviteLink(code));
    net.join(code, { name: me.name, avatar: me.avatar });
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    toast('Wandering solo — everything works, just no friends yet');
  }
  updateRoomUI();
}

function leaveToCreator() {
  for (const a of activities) a.onEnd?.();
  if (me.seat) applySit(me.id, null);
  me.busy = null;
  if (me.prop) setMyProp(null);
  net.leave();
  clearRemotes();
  me.char.removeFrom(scene);
  me.tag?.el.remove(); me.tag = null;
  game.players.clear();
  me.id = 'me';
  $('hud').classList.add('hidden');
  $('lobby').classList.add('hidden');
  game.cameraOverride = null;
  history.replaceState(null, '', location.pathname + location.search);
  openCreator(false);
}

async function refreshServerLine() {
  const base = net.base;
  $('server-name').textContent = base ? (base === location.origin ? 'this site' : new URL(base).host) : 'none (solo only)';
  $('btn-create').disabled = !base;
  $('btn-join').disabled = !base;
}
$('server-edit').onclick = (e) => {
  e.preventDefault();
  $('server-box').classList.toggle('hidden');
  $('server-input').value = net.customServer;
  $('server-input').focus();
};
$('server-save').onclick = async () => {
  const v = $('server-input').value.trim();
  if (!v) { net.setServer(''); await net.detect(); }
  else net.setServer(v);
  $('server-box').classList.add('hidden');
  refreshServerLine();
  if (net.base) {
    try {
      const r = await fetch(net.base + '/health', { cache: 'no-store' });
      creator.message((await r.json()).ok ? '' : 'That server did not answer /health.');
    } catch { creator.message("Couldn't reach that server — check the address."); }
  }
};

// ---------- boot ----------
const saved = loadProfile();
if (saved) { me.name = saved.name; me.avatar = saved.avatar; me.char.setAvatar(me.avatar); }
else me.name = randomName();

setupTouch();
$('btn-play').addEventListener('click', () => { audio.unlock(); openCreator(false); });
renderer.shadowMap.needsUpdate = true;
requestAnimationFrame(frame);

(async () => {
  const invite = readInvite();
  if (invite.server) net.setServer(invite.server);
  await net.detect();
  refreshServerLine();
  $('title-hint').textContent = net.base ? '' : 'No room server here yet — you can still wander solo';
  $('loading').classList.add('done');
  if (invite.code && net.base) {
    // invite links drop you straight in (with your saved look, or a fresh random one)
    if (!saved) toast(`Hi ${me.name}! You can change your look from the ☰ menu`, 4200);
    startPlay(invite.code);
  }
})();
