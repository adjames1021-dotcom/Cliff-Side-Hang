// Fishing at the end of the dock, with a little collection book saved on this device.
import * as THREE from 'three';
import { C, Builder, sphere, roundCyl } from '../toon.js';
import { L } from '../world.js';

const $ = (id) => document.getElementById(id);

export const FISH = [
  { id: 'minnow', name: 'Pond Minnow', icon: '🐟', w: 30, stars: 1 },
  { id: 'sunfish', name: 'Sunny Sunfish', icon: '🐠', w: 22, stars: 1 },
  { id: 'boot', name: 'Soggy Boot', icon: '🥾', w: 11, stars: 1 },
  { id: 'frog', name: 'Lily Frog', icon: '🐸', w: 11, stars: 2 },
  { id: 'crab', name: 'Shy Crab', icon: '🦀', w: 8, stars: 2 },
  { id: 'shell', name: 'Swirly Shell', icon: '🐚', w: 7, stars: 2 },
  { id: 'puffer', name: 'Puff Puff', icon: '🐡', w: 4, stars: 3 },
  { id: 'koi', name: 'Peach Koi', icon: '🎏', w: 3, stars: 3 },
  { id: 'star', name: 'Wishing Star', icon: '⭐', w: 5, stars: 4, when: 'night' },
  { id: 'carp', name: 'Golden Carp', icon: '✨', w: 3, stars: 5, when: 'golden' },
];

function loadBook() { try { return JSON.parse(localStorage.getItem('hh.fishbook')) || {}; } catch { return {}; } }
function saveBook(b) { try { localStorage.setItem('hh.fishbook', JSON.stringify(b)); } catch {} }

function bobberMesh() {
  const b = new Builder();
  b.add(sphere(0.07, 12, 8), C.berry, { pos: [0, 0.04, 0] });
  b.add(sphere(0.066, 12, 8), C.cream2, { pos: [0, -0.005, 0], scale: [1, 0.6, 1] });
  b.add(roundCyl(0.012, 0.06, 0.005, 6), C.ink, { pos: [0, 0.09, 0] }, { outline: false });
  return b.build();
}

export default function fishing(game) {
  const { scene, net, me, fx, audio } = game;
  const spot = L.fishSpot, water = L.pond.water;
  const book = loadBook();
  const lineMat = new THREE.LineBasicMaterial({ color: C.ink });
  const lines = new Map(); // player id -> { bobber, line }

  function visual(id) {
    let v = lines.get(id);
    if (!v) {
      const bobber = bobberMesh();
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, lineMat);
      line.frustumCulled = false;
      scene.add(bobber, line);
      v = { bobber, line };
      lines.set(id, v);
    }
    return v;
  }
  function drop(id) {
    const v = lines.get(id);
    if (!v) return;
    scene.remove(v.bobber, v.line);
    v.bobber.traverse((o) => o.geometry?.dispose());
    v.line.geometry.dispose();
    lines.delete(id);
  }

  const st = { state: 'off', t: 0, wait: 0, target: new THREE.Vector3(), from: new THREE.Vector3() };
  game.fishing = st;

  function start() {
    game.startBusy('fish', { pose: 'fish', end: stop, prompt: busyPrompt });
    me.pos.set(spot.x, L.dock.y, spot.z);
    me.yaw = spot.yaw;
    game.setMyProp('rod');
    st.state = 'ready';
    st.t = 0;
  }
  function stop() {
    st.state = 'off';
    drop(me.id);
    if (me.prop === 'rod') game.setMyProp(null);
  }
  function cast() {
    st.state = 'cast';
    st.t = 0;
    me.char.tipTo = null;
    const side = (Math.random() - 0.5) * 1.4;
    st.target.set(spot.x + 2.9 + Math.random() * 0.8, water + 0.02, spot.z + side);
    me.char.propTipWorld(st.from);
    audio.play('cast');
  }
  function reel() {
    if (st.state === 'bite') return catchFish();
    if (st.state === 'wait') {
      st.state = 'ready';
      audio.play('miss');
      game.toast('Too early — it swam off');
      return;
    }
  }
  function roll() {
    const night = game.sky.night > 0.6;
    const f = game.clock.day();
    const golden = f > 0.66 && f < 0.77;
    const pool = FISH.filter((x) => !x.when || (x.when === 'night' && night) || (x.when === 'golden' && golden));
    let r = Math.random() * pool.reduce((a, x) => a + x.w, 0);
    for (const x of pool) { if ((r -= x.w) <= 0) return x; }
    return pool[0];
  }
  function catchFish() {
    const fish = roll();
    const isNew = !book[fish.id];
    book[fish.id] = (book[fish.id] || 0) + 1;
    saveBook(book);
    st.state = 'caught';
    st.t = 0;
    fx.emit('splash', st.target, { n: 14 });
    audio.play('catch');
    showCard(fish, isNew);
    me.char.playEmote('catch');
    game.doEmote('catch', fish.name);
  }
  function showCard(fish, isNew) {
    const el = $('catch');
    el.replaceChildren();
    const ico = document.createElement('div'); ico.className = 'ico'; ico.textContent = fish.icon;
    const b = document.createElement('b'); b.textContent = fish.name;
    const stars = document.createElement('div'); stars.style.color = C.pumpkin; stars.textContent = '★'.repeat(fish.stars) + '☆'.repeat(5 - fish.stars);
    el.append(ico, b, stars);
    if (isNew) { const n = document.createElement('span'); n.className = 'new'; n.textContent = 'New for your book!'; el.append(n); }
    el.classList.remove('hidden');
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(showCard.t);
    showCard.t = setTimeout(() => el.classList.add('hidden'), 2800);
  }
  function busyPrompt() {
    switch (st.state) {
      case 'ready': return { label: 'Cast your line', use: cast };
      case 'cast': case 'wait': return { label: 'Waiting for a nibble… (move to stop)', use: reel };
      case 'bite': return { label: 'Reel it in!', use: reel, key: '!' };
      default: return null;
    }
  }

  function renderBook() {
    const got = FISH.filter((f) => book[f.id]).length;
    $('book-sum').textContent = `${got} of ${FISH.length} found${got === FISH.length ? ' — a true angler! 🎣' : ''}`;
    $('book-grid').replaceChildren(...FISH.map((f) => {
      const n = book[f.id] || 0;
      const d = document.createElement('div');
      d.className = 'fish' + (n ? '' : ' unknown');
      const ico = document.createElement('div'); ico.className = 'ico'; ico.textContent = f.icon;
      const b = document.createElement('b'); b.textContent = n ? f.name : '???';
      const s = document.createElement('div'); s.className = 'stars'; s.textContent = '★'.repeat(f.stars);
      const c = document.createElement('div');
      c.textContent = n ? `caught ×${n}` : f.when === 'night' ? 'only at night' : f.when === 'golden' ? 'only at golden hour' : 'not yet';
      d.append(ico, b, s, c);
      return d;
    }));
  }
  game.renderBook = renderBook;

  const tip = new THREE.Vector3(), fwd = new THREE.Vector3();
  function setLine(v, from, to) {
    const a = v.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true;
  }

  return {
    interactables(list) {
      if (game.mode !== 'play') return;
      list.push({ x: spot.x, z: spot.z, r: 1.4, label: 'Go fishing', use: start });
    },
    key(code) {
      if (me.busy !== 'fish') return false;
      if (code === 'Space' || code === 'KeyE') { const p = busyPrompt(); p?.use(); return true; }
      return false;
    },
    onLeave(id) { drop(id); },
    onEnd() { drop(me.id); },
    update(dt, t) {
      // my own line
      if (me.busy === 'fish') {
        st.t += dt;
        const v = visual(me.id);
        me.char.propTipWorld(tip);
        if (st.state === 'ready') {
          v.bobber.position.copy(tip).add(new THREE.Vector3(0, -0.35, 0));
        } else if (st.state === 'cast') {
          const k = Math.min(1, st.t / 0.7);
          v.bobber.position.lerpVectors(st.from, st.target, k);
          v.bobber.position.y += Math.sin(k * Math.PI) * 1.4;
          if (k >= 1) {
            st.state = 'wait'; st.t = 0; st.wait = 2 + Math.random() * 4.5;
            fx.emit('splash', st.target, { n: 6 });
            audio.play('splash', { at: st.target, listener: me.pos });
          }
        } else if (st.state === 'wait') {
          v.bobber.position.copy(st.target);
          v.bobber.position.y += Math.sin(t * 2.4) * 0.015;
          if (st.t > st.wait - 1 && Math.random() < dt * 2) v.bobber.position.y -= 0.02; // a nibble
          if (st.t > st.wait) {
            st.state = 'bite'; st.t = 0;
            fx.emit('splash', st.target, { n: 8 });
            audio.play('bloop');
          }
        } else if (st.state === 'bite') {
          v.bobber.position.copy(st.target);
          v.bobber.position.y -= 0.07 + Math.abs(Math.sin(t * 18)) * 0.03;
          if (st.t > 0.9) {
            st.state = 'ready';
            audio.play('miss');
            game.toast('It got away… try again!');
          }
        } else if (st.state === 'caught') {
          const k = Math.min(1, st.t / 0.5);
          v.bobber.position.lerpVectors(st.target, tip, k);
          if (st.t > 1.4) st.state = 'ready';
        }
        setLine(v, tip, v.bobber.position);
      } else if (lines.has(me.id)) drop(me.id);

      // everyone else's lines
      for (const p of game.players.values()) {
        if (p === me) continue;
        const fishing = p.pose === 'fish' && p.prop === 'rod';
        if (!fishing) { if (lines.has(p.id)) drop(p.id); continue; }
        const v = visual(p.id);
        p.char.propTipWorld(tip);
        fwd.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
        v.bobber.position.set(p.pos.x + fwd.x * 3.3, water + 0.02 + Math.sin(t * 2.4 + p.id.length) * 0.015, p.pos.z + fwd.z * 3.3);
        setLine(v, tip, v.bobber.position);
      }
    },
  };
}
