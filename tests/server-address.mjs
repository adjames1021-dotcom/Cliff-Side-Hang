// The page hosted elsewhere (e.g. GitHub Pages) talking to the Worker by address.
// Needs a plain static server for the page: STATIC_URL (default http://localhost:8790), plus wrangler dev.
import { launch, newContext, sleep, check, done, BASE } from './lib.mjs';

const STATIC = process.env.STATIC_URL || 'http://localhost:8790';
const browser = await launch();
const ctx = await newContext(browser, { viewport: { width: 900, height: 600 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(STATIC + '/?norender', { timeout: 120000 });
await page.waitForFunction(() => window.__hh && document.getElementById('loading').classList.contains('done'), null, { timeout: 60000 });
check((await page.textContent('#title-hint')).includes('solo'), 'without a server the title says you can wander solo');
await page.click('#btn-play');
check(await page.isDisabled('#btn-create'), 'Create room is disabled with no server');
await page.click('#server-edit');
await page.fill('#server-input', BASE);
await page.click('#server-save');
await page.waitForFunction(() => !document.getElementById('btn-create').disabled);
check((await page.textContent('#server-name')).includes('localhost:8787'), 'pasted server address is used');
await page.click('#btn-create');
check(await page.waitForFunction(() => window.__hh.net.status === 'online', null, { timeout: 30000 }).then(() => true, () => false), 'creates a room on the pasted server');
const link = await page.evaluate(() => window.__hh.net.inviteLink());
check(link.startsWith(STATIC) && link.includes('server='), 'invite link points at this page and carries the server');
const other = await (await newContext(browser)).newPage();
await other.goto(link.replace('?norender', '?norender'), { timeout: 120000 });
check(await other.waitForFunction(() => window.__hh?.net.status === 'online', null, { timeout: 60000 }).then(() => true, () => false), 'a friend opening that link joins the same room');
check(await page.waitForFunction(() => window.__hh.players.size === 2, null, { timeout: 20000 }).then(() => true, () => false), 'both are in the room');
check(errors.length === 0, 'no page errors');
await browser.close();
done();
