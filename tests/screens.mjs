// Screenshots of the main scenes for a visual check. Run against wrangler dev.
import { launch, newContext, openPage, OUT, sleep } from './lib.mjs';

const browser = await launch();
const shots = [];
const ctx = await newContext(browser, { viewport: { width: 1280, height: 720 } });
const page = await openPage(ctx, '/');
const shot = async (name, wait = 1800) => { await sleep(wait); await page.screenshot({ path: OUT + name + '.png' }); shots.push(name); };

await shot('01-title', 2500);
await page.click('#btn-play');
await shot('02-creator');
await page.click('#btn-solo');
await sleep(1500);

// helpers inside the page
await page.evaluate(() => {
  const g = window.__hh;
  window.setTime = (f) => { g.clock.start = Date.now(); g.clock.frac = f; g.clock.offset = 0; };
  window.place = (x, z, yaw = 0) => { g.me.pos.set(x, g.world.groundHeight(x, z), z); g.me.yaw = yaw; g.cam.target.set(x, g.me.pos.y + 1, z); };
  window.view = (yaw, pitch, dist) => { Object.assign(g.cam, { yaw, pitch, dist }); };
  window.friend = (id, name, avatar, x, z, r = 0, extra = {}) => g.addRemote({ id, name, avatar, p: [x, g.world.groundHeight(x, z), z], r, a: 'idle', s: 0, prop: null, seat: null, ...extra });
  window.sit = (id, seat) => g.applySit(id, seat);
});

await page.evaluate(() => { setTime(0.45); place(0, 5, Math.PI); view(0.4, 0.42, 9); });
await page.evaluate(() => {
  friend('f1', 'Pip', { animal: 'cat', fur: '#F4A646', outfit: '#AFD6EC', acc: ['scarf'] }, -1.6, 4.2, 0.6);
  friend('f2', 'Bean', { animal: 'puppy', fur: '#FFE08A', outfit: '#F7B9C4', acc: ['beret', 'bowtie'] }, 1.5, 3.8, -0.5);
  friend('f3', 'Hazel', { animal: 'fox', fur: '#E8893A', outfit: '#AFCB9C', acc: ['glasses', 'backpack'] }, 0.5, 2.6, 2.6);
  friend('f4', 'Bun', { animal: 'bunny', fur: '#FFF3DC', outfit: '#E98A9B', acc: ['crown'] }, -0.8, 6.6, 3.0);
  window.__hh.say(window.__hh.players.get('f1'), 'what a lovely day!');
});
await shot('03-plaza-day');

await page.evaluate(() => { window.__hh.doEmote('wave'); window.__hh.players.get('f2').char.playEmote('dance'); window.__hh.players.get('f3').char.playEmote('heart'); });
await shot('04-emotes', 700);

await page.evaluate(() => { setTime(0.93); view(0.4, 0.3, 10); });
await shot('05-plaza-night', 2500);

const reset = () => page.evaluate(() => { const g = window.__hh; g.endBusy(); g.standUp(); for (const id of ['f1', 'f2', 'f3', 'f4']) g.applySit(id, null); });

await page.evaluate(() => { setTime(0.72); place(-10.2, -1.2, Math.PI); view(-0.3, 0.35, 7); window.__hh.shared.fire.litAt = window.__hh.clock.now(); sit('f1', 'log-0-0'); sit('f2', 'log-1-1'); });
await shot('06-campfire-golden', 3000);
await page.evaluate(() => { setTime(0.88); place(-11.5, -1.6, Math.PI); window.__hh.act(); });
await shot('07-campfire-toasting-night', 2600);
await reset();

await page.evaluate(() => { setTime(0.5); place(-10.4, 10.2, Math.PI); view(0.1, 0.25, 6); sit('f3', 'swing-0'); window.__hh.players.get('f3').swing = 0.8; sit('f4', 'seesaw-0'); sit('f1', 'seesaw-1'); });
await page.evaluate(() => window.__hh.requestSit('swing-1'));
await page.evaluate(() => { window.__hh.me.swing = 0.6; });
await shot('08-park', 2600);
await reset();

await page.evaluate(() => { setTime(0.55); place(7.7, 9, Math.PI / 2); view(-2.3, 0.28, 5.5); });
await page.evaluate(() => window.__hh.act());
await sleep(500);
await page.evaluate(() => window.__hh.act());
await shot('09-fishing', 2600);
await reset();

await page.evaluate(() => { place(0.2, -11.0, Math.PI); view(0.25, 0.3, 6.5); sit('f2', 'inst-drums'); sit('f4', 'inst-xylo'); window.__hh.requestSit('inst-piano'); });
await shot('10-stage');
await reset();

await page.evaluate(() => { place(11.2, -6.9, Math.PI); view(0.5, 0.3, 5); sit('f3', 'stool-0'); window.__hh.players.get('f1').char.setProp('shake'); window.__hh.setMyProp('mug'); });
await shot('11-cafe');
await reset();

await page.evaluate(() => { setTime(0.73); place(-15.6, -14.3, -Math.PI / 2); window.__hh.act(); });
await shot('12-telescope', 2600);
await reset();

await page.evaluate(() => { setTime(0.6); place(0, 5, Math.PI); view(0, 0.4, 8); });
await page.click('#btn-emote');
await shot('13-emote-wheel', 800);
await page.click('#wheel');
await page.click('#room-pill');
await shot('14-lobby', 800);
console.log(shots.join(' '), page.errors);
await ctx.close();

// phone layout
const phone = await newContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const pp = await openPage(phone, '/');
await pp.click('#btn-play');
await pp.click('#btn-solo');
await sleep(2500);
await pp.screenshot({ path: OUT + '15-phone.png' });
console.log('phone', pp.errors);
await browser.close();
