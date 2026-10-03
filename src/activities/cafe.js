// Grab a drink at the café counter or a snack from the picnic basket.
import { L } from '../world.js';

const CAFE = [
  [null, 'Grab a mug of cocoa', 'mug'],
  ['mug', 'Swap for a milkshake', 'shake'],
  ['shake', 'Put the glass back', null],
];
const PICNIC = [
  [null, 'Take a sandwich', 'sandwich'],
  ['sandwich', 'Swap for an apple', 'apple'],
  ['apple', 'Swap for a cookie', 'cookie'],
  ['cookie', 'Put it back in the basket', null],
];

export default function cafe(game) {
  const { me, fx, audio } = game;
  const counter = { x: (L.counter.x0 + L.counter.x1) / 2, z: L.counter.z1 + 0.35 };

  function offer(list, spot, r, cycle) {
    const own = cycle.find(([have]) => have === me.prop) || cycle[0];
    list.push({
      x: spot.x, z: spot.z, r, label: own[1],
      use: () => {
        game.setMyProp(own[2]);
        audio.play('pop');
        if (own[2]) fx.emit('sparkles', game.headPos(me, -0.4), { n: 5 });
      },
    });
  }

  return {
    interactables(list) {
      if (game.mode !== 'play' || me.busy) return;
      offer(list, counter, 1.7, CAFE);
      offer(list, L.basket, 1.25, PICNIC);
    },
  };
}
