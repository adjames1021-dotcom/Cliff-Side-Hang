// The hilltop telescope: peek at the boats out at sea.
import * as THREE from 'three';
import { L, groundHeight } from '../world.js';

const $ = (id) => document.getElementById(id);

export default function lookout(game) {
  const { me, camera } = game;
  const T = L.telescope;
  // just past the end of the tube, so the camera is never inside the telescope
  const eye = new THREE.Vector3(T.x - 1.0, groundHeight(T.x, T.z) + 1.25, T.z);
  const look = { yaw: -Math.PI / 2, pitch: -0.05 };

  function start() {
    game.startBusy('scope', { pose: 'scope', cancelOnMove: false, end: stop, prompt: () => ({ label: 'Step back', use: game.endBusy }) });
    me.pos.set(T.standX, groundHeight(T.standX, T.z), T.z);
    me.yaw = -Math.PI / 2;
    // start aimed at whichever boat is easiest to see
    look.yaw = -Math.PI / 2; look.pitch = -0.04;
    let best = Infinity;
    for (const b of game.world.boats) {
      const p = b.g.position;
      const yaw = Math.atan2(p.x - eye.x, p.z - eye.z);
      const off = Math.abs(yaw + Math.PI / 2);
      if (off < 1.35 && off < best) { best = off; look.yaw = yaw; look.pitch = Math.atan2(p.y + 1.5 - eye.y, Math.hypot(p.x - eye.x, p.z - eye.z)); }
    }
    game.fovOverride = 15;
    game.hideTags = true;
    game.resize();
    $('scope').classList.remove('hidden');
    game.cameraOverride = () => {
      camera.position.copy(eye);
      const d = new THREE.Vector3(Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), Math.cos(look.yaw) * Math.cos(look.pitch));
      camera.lookAt(eye.clone().add(d));
      game.setNearFar(0.3, 700);
    };
    game.lookHook = (dx, dy) => {
      look.yaw = THREE.MathUtils.clamp(look.yaw - dx * 0.0012, -Math.PI / 2 - 1.4, -Math.PI / 2 + 1.4);
      look.pitch = THREE.MathUtils.clamp(look.pitch - dy * 0.0012, -0.35, 0.3);
      return true;
    };
  }
  function stop() {
    game.fovOverride = 0;
    game.hideTags = false;
    game.cameraOverride = null;
    game.lookHook = null;
    $('scope').classList.add('hidden');
    game.resize();
  }

  return {
    interactables(list) {
      if (game.mode !== 'play') return;
      list.push({ x: T.standX, z: T.z, r: 1.3, label: 'Look through the telescope', use: start });
    },
    key(code) {
      if (me.busy !== 'scope') return false;
      if (code === 'KeyE') { game.endBusy(); return true; }
      const step = 0.04;
      if (code === 'KeyA' || code === 'ArrowLeft') { look.yaw += step; return true; }
      if (code === 'KeyD' || code === 'ArrowRight') { look.yaw -= step; return true; }
      return false;
    },
    onEnd() { if (me.busy === 'scope') game.endBusy(); },
  };
}
