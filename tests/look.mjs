// Quick visual probe: node tests/look.mjs "<query>" name1:"js" name2:"js" ...
// Opens the game (solo), runs each snippet in the page, waits, and saves a screenshot per step.
import { launch, newContext, openPage, OUT, sleep } from './lib.mjs';

const [query = '?hq', ...steps] = process.argv.slice(2);
const browser = await launch();
const ctx = await newContext(browser, { viewport: { width: +(process.env.W || 1280), height: +(process.env.H || 720) } });
const t0 = Date.now();
const page = await openPage(ctx, '/' + query);
console.log('loaded in', Date.now() - t0, 'ms');
if (page.errors.length) console.log('load errors:', [...new Set(page.errors)].slice(0, 8).join('\n'));
await page.evaluate(() => {
  const g = window.__hh;
  window.setTime = (f) => { g.clock.start = Date.now(); g.clock.frac = f; g.clock.offset = 0; };
  window.place = (x, z, yaw = 0) => { g.me.pos.set(x, g.world.groundHeight(x, z), z); g.me.yaw = yaw; g.cam.target.set(x, g.me.pos.y + 1, z); };
  window.view = (yaw, pitch, dist) => { Object.assign(g.cam, { yaw, pitch, dist }); };
  window.friend = (id, name, avatar, x, z, r = 0, extra = {}) => g.addRemote({ id, name, avatar, p: [x, g.world.groundHeight(x, z), z], r, a: 'idle', s: 0, prop: null, seat: null, ...extra });
  window.solo = () => { document.getElementById('btn-play').click(); document.getElementById('btn-solo').click(); };
});
for (const step of steps) {
  const i = step.indexOf(':');
  const name = step.slice(0, i), js = step.slice(i + 1);
  const m = /^(\d+)\|/.exec(js);
  const wait = m ? +m[1] : 2500;
  const code = m ? js.slice(m[0].length) : js;
  const t = Date.now();
  try { await page.evaluate(code); } catch (e) { console.log('step error', name, e.message); }
  await sleep(wait);
  if (page.errors.length) console.log('errors so far:', [...new Set(page.errors)].slice(0, 8).join('\n'));
  // JPG=dir saves compressed images there instead (for the README)
  if (process.env.JPG) await page.screenshot({ path: `${process.env.JPG}/${name}.jpg`, type: 'jpeg', quality: 82, timeout: 180000 });
  else await page.screenshot({ path: OUT + name + '.png', timeout: 180000 });
  console.log('shot', name, Date.now() - t, 'ms');
}
if (page.errors.length) console.log('ERRORS:\n' + [...new Set(page.errors)].slice(0, 20).join('\n'));
const info = await page.evaluate(() => { const r = window.__hh.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, progs: r.programs.length }; });
console.log(JSON.stringify(info));
await browser.close();
