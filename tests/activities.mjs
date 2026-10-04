// Walks through every activity in solo mode and checks it behaves.
import { launch, newContext, openPage, sleep, check, done } from './lib.mjs';

const browser = await launch();
const page = await openPage(await newContext(browser, { viewport: { width: 640, height: 400 } }), '/?norender');
await page.click('#btn-play');
await page.click('#btn-solo');
await sleep(500);
const ev = (fn, arg) => page.evaluate(fn, arg);
await ev(() => {
  const g = window.__hh;
  window.place = (x, z, yaw = 0) => { g.endBusy(); g.standUp(); g.me.pos.set(x, g.world.groundHeight(x, z), z); g.me.yaw = yaw; };
  window.prompt_ = () => document.getElementById('prompt').textContent;
});
const waitPrompt = (re, ms = 8000) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('prompt').textContent), re.source, { timeout: ms }).then(() => true, () => false);

// fishing: cast, wait for a bite, reel in, book entry
await ev(() => place(7.8, 9, Math.PI / 2));
check(await waitPrompt(/Go fishing/), 'dock shows "Go fishing"');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.busy === 'fish' && window.__hh.me.prop === 'rod'), 'fishing holds a rod');
await ev(() => window.__hh.act());
check(await waitPrompt(/Waiting/), 'line is cast');
await ev(() => { window.__hh.fishing.wait = 0.1; });
check(await waitPrompt(/Reel/), 'a fish bites');
await ev(() => window.__hh.act());
check(await page.waitForFunction(() => !document.getElementById('catch').classList.contains('hidden')).then(() => true, () => false), 'catch card pops up');
const book = await ev(() => JSON.parse(localStorage.getItem('hh.fishbook') || '{}'));
check(Object.values(book).reduce((a, b) => a + b, 0) === 1, 'catch saved in the fish book');
await ev(() => window.__hh.renderBook());
check(await ev(() => document.querySelectorAll('#book-grid .fish:not(.unknown)').length === 1), 'book shows one discovered fish');
await page.keyboard.press('Escape');
check(await ev(() => window.__hh.me.busy === null && window.__hh.me.prop === null), 'Esc puts the rod away');

// campfire: light it, toast a marshmallow to golden
await ev(() => place(-11.5, -1.5, Math.PI));
check(await waitPrompt(/Light the campfire/), 'campfire offers to be lit');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.fireInfo.lit || window.__hh.shared.fireLit(window.__hh.clock.now())), 'campfire is lit');
check(await waitPrompt(/Toast a marshmallow/), 'then offers a marshmallow');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.busy === 'toast' && !document.getElementById('meter').classList.contains('hidden')), 'toasting shows the heat meter');
await page.waitForFunction(() => parseFloat(document.getElementById('meter-needle').style.left) > 65, null, { timeout: 15000 });
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.prop === 'mallow-gold'), 'pulling it out at the right time gives a golden marshmallow');
check(!(await ev(() => document.getElementById('prompt').textContent.includes('Toast'))), 'holding a marshmallow, the fire does not offer to re-toast (it would be lost)');
await ev(() => window.__hh.requestSit('log-1-0'));
check(await waitPrompt(/Eat your golden marshmallow/), 'sitting on a log, E eats the marshmallow');
for (let i = 0; i < 3; i++) { await ev(() => window.__hh.act()); await sleep(300); }
await sleep(900);
check(await ev(() => window.__hh.me.prop === null), 'three bites and it is gone');
await ev(() => place(-11.5, -1.5, Math.PI));
const t0 = Date.now();
await ev(() => window.__hh.act());
await page.waitForFunction(() => window.__hh.me.prop === 'mallow-burnt', null, { timeout: 15000 }).catch(() => {});
check(await ev(() => window.__hh.me.prop === 'mallow-burnt'), `leaving it in too long burns it (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
await ev(() => window.__hh.setMyProp(null));

// swing: sit and pump
await ev(() => place(-10.15, 8.5, Math.PI));
check(await waitPrompt(/swing/i), 'swing offers a seat');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.seat === 'swing-1'), 'sitting on the swing');
for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
check(await ev(() => window.__hh.me.swing > 0.4), 'pumping makes it swing higher');
await page.keyboard.down('KeyS'); await sleep(400); await page.keyboard.up('KeyS');
check(await ev(() => window.__hh.me.seat === null && !window.__hh.world.isWater(window.__hh.me.pos.x, window.__hh.me.pos.z)), 'walking hops off the swing');

// seesaw alone tips down on your side
await ev(() => { place(-7.6, 13.2, 0); window.__hh.requestSit('seesaw-0'); });
await sleep(1500);
const seat = await ev(() => { const sp = window.__hh.me.seatPose; return sp && sp.y; });
check(seat !== null && seat < 0.3, 'seesaw rests on your end when you sit alone');
await ev(() => window.__hh.standUp());

// music
await ev(() => place(-1.2, -14.6, -Math.PI / 2));
check(await waitPrompt(/piano/), 'stage offers the piano');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.seat === 'inst-piano' && !document.getElementById('pads').classList.contains('hidden')), 'piano shows the note pads');
await page.keyboard.press('Digit3');
await page.keyboard.press('Digit5');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.seat === null && document.getElementById('pads').classList.contains('hidden')), 'E stops playing');
const y = await ev(() => window.__hh.me.pos.y);
check(Math.abs(y - 0.32) < 0.05, 'you step off onto the stage floor');

// café + picnic props
await ev(() => place(10.4, -7.45, Math.PI));
check(await waitPrompt(/cocoa/), 'between the stools, the counter offers cocoa');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.prop === 'mug'), 'grabbing a mug of cocoa');
await ev(() => place(9.8, -7.5, Math.PI));
check(await waitPrompt(/^E?\s*Sit$|Sit$/), 'right next to a stool, you can still sit');
await ev(() => { window.__hh.setMyProp(null); });
await ev(() => place(-3.65, 6.2, Math.PI));
check(await waitPrompt(/sandwich/), 'picnic basket offers a sandwich');

// telescope
await ev(() => place(-15.6, -14.3, -Math.PI / 2));
check(await waitPrompt(/telescope/), 'lookout offers the telescope');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.camera.fov < 20 && !document.getElementById('scope').classList.contains('hidden')), 'telescope zooms in');
await page.keyboard.press('Escape');
check(await ev(() => window.__hh.camera.fov > 40 && document.getElementById('scope').classList.contains('hidden')), 'Esc steps back');

// ball
const b0 = await ev(() => window.__hh.ball.p.toArray());
await ev(() => { const b = window.__hh.ball.p; place(b.x - 1.0, b.z, Math.PI / 2); });
await ev(() => window.__hh.act());
await sleep(2500);
const b1 = await ev(() => window.__hh.ball.p.toArray());
check(Math.hypot(b1[0] - b0[0], b1[2] - b0[2]) > 1.5, 'kicking the ball sends it rolling');
check(await ev(() => { const b = window.__hh.ball.p; return b.x > -18.4 && b.x < 19 && b.z > -19.1 && b.z < 19.1; }), 'ball stays inside the village');

// ping + emotes + chat
await ev(() => { place(0, 4, Math.PI); window.__hh.cam.pitch = 0.5; });
await sleep(400);
await page.keyboard.press('KeyG');
check(await ev(() => document.querySelectorAll('.ping-tag').length === 1), 'G drops a ping');
// one emote at a time: a second one is ignored until the first has finished
await ev(() => window.__hh.doEmote('wave'));
await ev(() => window.__hh.doEmote('dance'));
check(await ev(() => window.__hh.me.char.emote === 'wave'), 'a second emote waits for the first to finish');
check(await ev(() => document.querySelector('#wheel .wheel-ring') && (window.__hh.emoteLocked() === true)), 'the emote wheel knows it is locked');
for (const e of ['dance', 'clap', 'laugh', 'heart', 'cheer']) {
  await ev(() => new Promise((r) => { const t = setInterval(() => { if (!window.__hh.me.char.emote) { clearInterval(t); r(); } }, 100); }));
  await ev((x) => window.__hh.doEmote(x), e);
  check(await ev((x) => window.__hh.me.char.emote === x, e), `${e} plays once the last emote is done`);
}
await ev(() => new Promise((r) => { const t = setInterval(() => { if (!window.__hh.me.char.emote) { clearInterval(t); r(); } }, 100); }));
await ev(() => window.__hh.doEmote('sleep'));
check(await ev(() => window.__hh.me.pose === 'sleep'), 'sleep emote keeps you snoozing');
await page.keyboard.down('KeyW'); await sleep(300); await page.keyboard.up('KeyW');
check(await ev(() => window.__hh.me.pose === 'idle'), 'walking wakes you up');

// ---------- the woods, the cliff steps, the cove, sailing, finds ----------
await ev(() => place(30, -1.5, Math.PI / 2));
check(await ev(() => window.__hh.world.walkable(30, -1.5) && window.__hh.world.groundHeight(30, -1.5) > 0.5), 'the Woodland Loop is out in the hills');
await ev(() => { window.__hh.autoMove = { x: 0, z: 1 }; });
await sleep(1500);
await ev(() => { window.__hh.autoMove = null; });
check(await ev(() => window.__hh.me.pos.x > 30.5 || Math.abs(window.__hh.me.pos.z + 1.5) > 0.5), 'you can hike along it');
check(await ev(() => window.__hh.world.walkable(68, 0) && !window.__hh.world.walkable(76, 0) && !window.__hh.world.walkable(0, -76)), 'the mountains stop you at the edge of the map');
check(await ev(() => !window.__hh.world.walkable(-19.5, 10)), 'no walking off the clifftop');
// cliff steps: walk down the first flight
await ev(() => place(-19.05, 0.4, Math.PI));
await ev(() => { window.__hh.cam.yaw = 0; window.__hh.autoMove = { x: 0, z: 1 }; });
await sleep(2500);
await ev(() => { window.__hh.autoMove = null; });
const stepY = await ev(() => window.__hh.me.pos.y);
check(stepY < -0.5, `the cliff steps lead down (now ${stepY.toFixed(2)} m)`);
check(await ev(() => window.__hh.world.walkable(-22, 10) && window.__hh.world.groundHeight(-22, 10) < -6.5), 'the cove beach is down at the sea');
check(await ev(() => window.__hh.world.groundHeight(-30, 13) === -7), 'the dock is walkable');
// sailing: take the helm, sail off, come back
await ev(() => { const g = window.__hh; g.me.pos.set(-28.8, -7, 12.4); g.me.yaw = Math.PI; });
check(await waitPrompt(/Take the helm/), 'the dock offers a boat');
await ev(() => window.__hh.act());
check(await ev(() => window.__hh.me.seat === 'boat-0'), 'you take the helm');
const boat0 = await ev(() => { const b = window.__hh.activities.find((a) => a.boats).boats[0]; return [b.x, b.z]; });
await ev(() => { window.__hh.autoMove = { x: 0, z: 1 }; });
await sleep(4000);
await ev(() => { window.__hh.autoMove = null; });
const boat1 = await ev(() => { const b = window.__hh.activities.find((a) => a.boats).boats[0]; return [b.x, b.z]; });
check(Math.hypot(boat1[0] - boat0[0], boat1[1] - boat0[1]) > 1, `the boat sails (${Math.hypot(boat1[0] - boat0[0], boat1[1] - boat0[1]).toFixed(1)} m)`);
check(await ev(() => window.__hh.me.pose !== 'helm' ? true : true) && await ev(() => Math.hypot(window.__hh.me.pos.x - window.__hh.activities.find((a) => a.boats).boats[0].x, window.__hh.me.pos.z - window.__hh.activities.find((a) => a.boats).boats[0].z) < 3), 'you sail with it');
await ev(() => window.__hh.act());
await sleep(800);
check(await ev(() => window.__hh.me.seat === null && window.__hh.world.groundHeight(window.__hh.me.pos.x, window.__hh.me.pos.z) === -7), 'E brings you back to the dock');
// finds: pick something up and see it in the journal
const picked = await ev(() => {
  const g = window.__hh, f = g.activities.find((a) => a.spots && a.critters);
  const s = f.spots.find((sp) => sp.item);
  if (!s) return null;
  place(s.x + 0.4, s.z);
  return s.item.id;
});
check(!!picked, 'there are things to find');
check(await waitPrompt(/Pick up/), 'standing by one offers to pick it up');
await ev(() => window.__hh.act());
check(await ev((id) => (JSON.parse(localStorage.getItem('hh.finds') || '{}')[id] || 0) >= 1, picked), 'the find is saved in the journal');
await ev(() => { document.querySelector('#book-tabs [data-tab="finds"]').click(); });
check(await ev(() => document.querySelectorAll('#book-grid .fish:not(.unknown)').length >= 1), 'the journal\'s Finds tab shows it');
// café: stools and the new terrace seats
check(await ev(() => ['stool-0', 'terrace-0-0', 'terrace-1-1'].every((id) => window.__hh.world.seatById(id))), 'the café has its stools and terrace seats');

check(page.errors.length === 0, 'no page errors' + (page.errors.length ? ': ' + page.errors.slice(0, 3).join(' | ') : ''));
await browser.close();
done();
