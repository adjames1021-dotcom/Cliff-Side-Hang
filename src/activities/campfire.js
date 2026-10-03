// Campfire: anyone can light it (shared), then toast a marshmallow with a timing mini-game.
import * as THREE from 'three';
import { C, MAT, Builder, lathe, toonMaterial } from '../toon.js';
import { L, yawTo } from '../world.js';
import { MALLOW_COL, PROP_INFO } from '../characters.js';

const $ = (id) => document.getElementById(id);
const ZONES = [[0.38, 'raw'], [0.6, 'toasty'], [0.78, 'gold'], [Infinity, 'burnt']];
const LABEL = { raw: 'gooey marshmallow', toasty: 'toasty marshmallow', gold: 'golden marshmallow', burnt: 'crispy marshmallow' };

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  r.addColorStop(0, 'rgba(255,190,110,0.9)'); r.addColorStop(0.4, 'rgba(255,150,80,0.35)'); r.addColorStop(1, 'rgba(255,140,80,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function campfire(game) {
  const { scene, net, me, fx, audio, shared, clock } = game;
  const F = L.campfire;
  const flames = new THREE.Group();
  flames.position.set(F.x, 0.12, F.z);
  const parts = [];
  [[0, 0, 1, C.apricot], [0.14, 0.08, 0.7, C.pumpkin], [-0.12, -0.06, 0.75, C.pumpkin], [0.02, 0.02, 0.55, C.butter]].forEach(([x, z, s, col], i) => {
    const b = new Builder();
    b.add(lathe([[0, 0], [0.2, 0.08], [0.22, 0.22], [0.13, 0.45], [0.04, 0.62], [0, 0.66]], 14), col, { scale: s * 1.45 });
    const g = b.build({ material: MAT.glow, outline: i !== 3 });
    g.position.set(x, 0, z);
    flames.add(g);
    parts.push({ g, s, ph: i * 1.7 });
  });
  scene.add(flames);
  const tex = glowTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
  ground.position.set(F.x, 0.02, F.z);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.set(F.x, 0.7, F.z);
  halo.scale.set(3.2, 3.2, 1);
  scene.add(ground, halo);

  let level = 0, wasLit = false, emberT = 0, smokeT = 0;
  const toast = { heat: 0, active: false };
  game.fireInfo = { x: F.x, z: F.z, lit: false };

  const isLit = () => shared.fireLit(clock.now());

  function light() {
    if (isLit()) return;
    if (net.online) net.send({ t: 'fire', lit: true });
    else { shared.fire.litAt = clock.now(); shared.fire.by = me.name; }
  }

  net.on('fire', (m) => {
    shared.fire = { litAt: m.litAt, by: m.by, burnMs: m.burnMs };
  });

  function startToast() {
    const ang = yawTo(F.x - me.pos.x, F.z - me.pos.z);
    me.yaw = ang;
    game.startBusy('toast', { pose: 'toast', end: stopToast, prompt: () => ({ label: 'Pull it out when golden!', use: finish }) });
    toast.heat = 0;
    toast.active = true;
    game.setMyProp('mallow-raw');
    $('meter').classList.remove('hidden');
    $('meter-label').textContent = "Toasting… pull it out when it's golden!";
  }
  function stopToast() {
    toast.active = false;
    $('meter').classList.add('hidden');
    if (me.prop === 'mallow-raw' && !toast.result) game.setMyProp(null);
    toast.result = null;
  }
  function finish(auto) {
    if (!toast.active) return;
    const kind = ZONES.find(([max]) => toast.heat < max)[1];
    toast.result = kind;
    game.endBusy();
    game.setMyProp('mallow-' + kind);
    const label = LABEL[kind];
    if (kind === 'gold') { me.char.playEmote('cheer'); fx.emit('confetti', game.headPos(me)); game.toast('Perfectly golden! ✨'); }
    else if (kind === 'burnt') { fx.emit('smoke', game.headPos(me)); audio.play('sizzle'); game.toast(auto ? 'Whoops — it caught fire! Crispy…' : 'A little crispy… still yummy'); }
    else game.toast(kind === 'raw' ? 'Still gooey — maybe a bit longer next time' : 'Nice and toasty!');
    game.doEmote('show', label);
  }

  return {
    interactables(list) {
      if (game.mode !== 'play') return;
      if (!isLit()) list.push({ x: F.x, z: F.z, r: 2.0, priority: 1, label: 'Light the campfire', use: light });
      else if (!me.prop || !(PROP_INFO[me.prop]?.food || PROP_INFO[me.prop]?.drink)) list.push({ x: F.x, z: F.z, r: 2.0, priority: 1, label: 'Toast a marshmallow', use: startToast });
    },
    key(code) {
      if (me.busy === 'toast' && (code === 'Space' || code === 'KeyE')) { finish(); return true; }
      return false;
    },
    onStart() { if (toast.active) game.endBusy(); },
    update(dt, t) {
      const lit = isLit();
      game.fireInfo.lit = lit;
      if (lit && !wasLit && game.mode === 'play') {
        audio.play('whoosh');
        fx.emit('sparkles', { x: F.x, y: 0.6, z: F.z }, { n: 14, color: C.butter });
        if (shared.fire.by) game.toast(`${shared.fire.by === me.name ? 'You' : shared.fire.by} lit the campfire 🔥`);
      }
      wasLit = lit;
      level += ((lit ? 1 : 0) - level) * Math.min(1, dt * (lit ? 1.5 : 0.6));
      flames.visible = level > 0.02;
      parts.forEach((p, i) => {
        const f = 1 + Math.sin(t * 11 + p.ph) * 0.09 + Math.sin(t * 17.3 + p.ph * 2) * 0.06;
        p.g.scale.set(level * (1 - (f - 1) * 0.5), level * f, level * (1 - (f - 1) * 0.5));
        p.g.rotation.y = t * (0.6 + i * 0.2);
      });
      const night = game.sky.night;
      ground.material.opacity = level * (0.3 + night * 0.4);
      halo.material.opacity = level * (0.18 + night * 0.32);
      ground.visible = halo.visible = level > 0.02;
      if (level > 0.3) {
        emberT -= dt; smokeT -= dt;
        if (emberT <= 0) { emberT = 0.15; fx.emit('ember', { x: F.x, y: 0.5, z: F.z }); }
        if (smokeT <= 0) { smokeT = 0.5; fx.emit('smoke', { x: F.x, y: 1.0, z: F.z }, { color: '#E9DCD0' }); }
      } else if (wasLit === false && level > 0.05 && level < 0.3) {
        smokeT -= dt;
        if (smokeT <= 0) { smokeT = 0.4; fx.emit('smoke', { x: F.x, y: 0.4, z: F.z }); }
      }
      if (toast.active) {
        if (!lit) { game.endBusy(); return; }
        toast.heat += dt / 4.5;
        const k = Math.min(1, toast.heat);
        const col = toast.heat < 0.38 ? MALLOW_COL.raw : toast.heat < 0.6 ? MALLOW_COL.toasty : toast.heat < 0.78 ? MALLOW_COL.gold : MALLOW_COL.burnt;
        const prev = toast.heat - dt / 4.5;
        if ([0.38, 0.6, 0.78].some((z) => prev < z && toast.heat >= z)) {
          me.char.setProp('mallow-raw', col);
          if (toast.heat >= 0.6 && prev < 0.6) audio.play('pop');
        }
        $('meter-needle').style.left = `${k * 100}%`;
        if (toast.heat > 1.05) finish(true);
      }
    },
  };
}
