// The hilltop telescope: peek at the boats out at sea.
import * as THREE from 'three';
import { L, groundHeight } from '../world.js';

const $ = (id) => document.getElementById(id);

export default function lookout(game) {
  const { me, camera } = game;
  const T = L.telescope;
  const eye = new THREE.Vector3(T.x - 0.1, groundHeight(T.x, T.z) + 1.3, T.z);
  const look = { yaw: -Math.PI / 2, pitch: -0.05 };

  function start() {
    game.startBusy('scope', { pose: 'scope', cancelOnMove: false, end: stop, prompt: () => ({ label: 'Step back', use: game.endBusy }) });
    me.pos.set(T.standX, groundHeight(T.standX, T.z), T.z);
    me.yaw = -Math.PI / 2;
    look.yaw = -Math.PI / 2; look.pitch = -0.05;
    game.fovOverride = 15;
    game.hideTags = true;
    game.resize();
    $('scope').classList.remove('hidden');
    game.cameraOverride = () => {
      camera.position.copy(eye);
      const d = new THREE.Vector3(Math.sin(look.yaw) * Math.cos(look.pitch), Math.sin(look.pitch), Math.cos(look.yaw) * Math.cos(look.pitch));
      camera.lookAt(eye.clone().add(d));
      game.setNearFar(0.5, 700);
    };
    game.lookHook = (dx, dy) => {
      look.yaw = THREE.MathUtils.clamp(look.yaw - dx * 0.0012, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1);
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
