// Jam on the stage: piano, drums and xylophone. Notes are shared and lightly quantized.
import * as THREE from 'three';
import { C } from '../toon.js';
import { L } from '../world.js';
import { NOTE_NAMES } from '../audio.js';

const $ = (id) => document.getElementById(id);
const PAD_COLORS = [C.pink, C.apricot, C.butter, C.sage, C.blue, C.lilac, C.rose, C.pumpkin];

export default function music(game) {
  const { net, me, fx, audio, clock, shared } = game;
  const top = L.stage.h;
  const INST = {
    piano: { seat: 'inst-piano', label: 'Play the piano', x: -1.8, y: top + 0.52, z: -14.6, yaw: -Math.PI / 2, pose: 'piano', at: new THREE.Vector3(-2.5, top + 1.3, -14.6), stand: { x: -1.2, z: -14.6 } },
    drums: { seat: 'inst-drums', label: 'Play the drums', x: 0.4, y: top + 0.5, z: -14.95, yaw: 0, pose: 'drums', at: new THREE.Vector3(0.4, top + 1.1, -14.1), stand: { x: 0.4, z: -13.4 } },
    xylo: { seat: 'inst-xylo', label: 'Play the xylophone', x: 2.6, y: top, z: -14.62, yaw: 0, pose: 'play', standing: true, at: new THREE.Vector3(2.6, top + 1.0, -13.9), stand: { x: 2.6, z: -13.0 } },
  };
  const bySeat = Object.fromEntries(Object.entries(INST).map(([k, v]) => [v.seat, k]));
  let active = null;

  const pads = $('pads');
  function buildPads(inst) {
    pads.replaceChildren(...NOTE_NAMES[inst].map((name, i) => {
      const b = document.createElement('button');
      b.className = 'pad';
      b.style.background = PAD_COLORS[i];
      b.innerHTML = '';
      b.append(document.createTextNode(String(i + 1)));
      const s = document.createElement('div');
      s.style.fontSize = '10px';
      s.textContent = name;
      b.append(s);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); audio.unlock(); play(i); });
      return b;
    }));
  }

  function play(n) {
    if (!active) return;
    audio.note(active, n, { roomMs: clock.ms() });
    me.char.noteHit();
    fx.emit('notes', INST[active].at, { color: PAD_COLORS[n] });
    const pad = pads.children[n];
    if (pad) { pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 110); }
    if (net.online) net.send({ t: 'note', i: active, n });
  }

  net.on('note', (m) => {
    const p = game.players.get(m.id);
    const inst = INST[m.i];
    if (!inst) return;
    const d = Math.hypot(inst.at.x - me.pos.x, inst.at.z - me.pos.z);
    audio.note(m.i, m.n, { roomMs: clock.ms(), vol: Math.max(0.15, 1 - d / 35) });
    p?.char.noteHit();
    fx.emit('notes', inst.at, { color: PAD_COLORS[m.n] });
  });

  return {
    seatPose(seatId) {
      const k = bySeat[seatId];
      if (!k) return null;
      const i = INST[k];
      return { x: i.x, y: i.y, z: i.z, yaw: i.yaw, pose: i.pose, stand: i.standing, groundY: top, exit: i.stand };
    },
    interactables(list) {
      if (game.mode !== 'play') return;
      for (const [k, i] of Object.entries(INST)) {
        if (shared.occupant(i.seat)) continue;
        list.push({ x: i.stand.x, z: i.stand.z, r: 1.4, label: i.label, use: () => game.requestSit(i.seat) });
      }
    },
    seatPrompt(seat) {
      if (!bySeat[seat]) return null;
      return { label: game.isTouch ? 'Tap the pads to play · E to stop' : 'Keys 1–8 to play · E to stop', use: game.standUp };
    },
    onSeat(seat) {
      active = bySeat[seat] || null;
      pads.classList.toggle('hidden', !active);
      if (active) buildPads(active);
    },
    key(code) {
      if (!active) return false;
      const m = code.match(/^(?:Digit|Numpad)([1-8])$/);
      if (m) { play(+m[1] - 1); return true; }
      return false;
    },
    onEnd() { active = null; pads.classList.add('hidden'); },
  };
}
