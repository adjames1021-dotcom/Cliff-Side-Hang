// End-to-end multiplayer checks against `npx wrangler dev --persist-to /tmp/hangout-rooms`.
// Run: node tests/multiplayer.mjs   (BASE_URL defaults to http://localhost:8787)
import { launch, newContext, openPage, OUT, BASE, sleep, check, done } from './lib.mjs';

const small = { viewport: { width: 520, height: 360 } };
const until = (page, fn, arg, ms = 30000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);
const state = (page) => page.evaluate(() => {
  const g = window.__hh;
  return {
    id: g.me.id, room: g.net.room, status: g.net.status, count: g.players.size,
    players: [...g.players.values()].map((p) => ({ id: p.id, name: p.name, x: p.pos.x, z: p.pos.z, seat: p.seat, emote: p.char.emote, pose: p.pose })),
  };
});

async function joinViaCreator(ctx, name, code) {
  const page = await openPage(ctx, '/?norender');
  await page.click('#btn-play');
  await page.fill('#name', name);
  if (code) { await page.fill('#code', code); await page.click('#btn-join'); }
  else await page.click('#btn-create');
  const ok = await until(page, () => window.__hh.net.status === 'online');
  return { page, ok };
}

const browser = await launch();
const [ctxA, ctxB, ctxC, ctxD, ctxE] = await Promise.all([0, 1, 2, 3, 4].map(() => newContext(browser, small)));

// --- joining by code and by invite link ---
const { page: A, ok: aOk } = await joinViaCreator(ctxA, 'Alice');
check(aOk, 'Alice creates a room and connects');
const code = await A.evaluate(() => window.__hh.net.room);
check(/^[A-HJ-NP-Z2-9]{4}$/.test(code), `room code looks right (${code})`);
await A.evaluate(() => { window.__leaves = 0; window.__hh.net.on('leave', () => window.__leaves++); });

const { page: B, ok: bOk } = await joinViaCreator(ctxB, 'Bob', code);
check(bOk, 'Bob joins by typing the code');
const link = await A.evaluate(() => window.__hh.net.inviteLink());
check(link.includes(`#room=${code}`), 'invite link carries the room code');
const C = await openPage(ctxC, new URL(link).pathname + '?norender' + new URL(link).hash); // the link as shared, minus rendering
check(await until(C, () => window.__hh.net.status === 'online' && window.__hh.mode === 'play'), 'Cara joins automatically from the invite link');
check(await until(A, () => window.__hh.players.size === 3), 'Alice sees three players');
const sB = await state(B);
check(sB.players.some((p) => p.name === 'Alice') && sB.count === 3, 'Bob sees Alice and Cara');

// --- movement ---
const aId = await A.evaluate(() => window.__hh.me.id);
const before = (await state(B)).players.find((p) => p.id === aId);
await A.evaluate(() => { window.__hh.autoMove = { x: 0, z: 1 }; });
await sleep(2500);
await A.evaluate(() => { window.__hh.autoMove = null; });
const aNow = (await state(A)).players.find((p) => p.id === aId);
await sleep(1200);
const after = (await state(B)).players.find((p) => p.id === aId);
const moved = Math.hypot(aNow.x - before.x, aNow.z - before.z);
const gap = Math.hypot(aNow.x - after.x, aNow.z - after.z);
check(moved > 0.3, `Alice walked ${moved.toFixed(2)} m`);
check(gap < 0.25, `Bob sees Alice where she is (off by ${gap.toFixed(2)} m)`);
const cView = (await state(C)).players.find((p) => p.id === aId);
check(Math.hypot(aNow.x - cView.x, aNow.z - cView.z) < 0.25, 'Cara sees Alice move too');

// --- chat both ways (typed with the keyboard) ---
await A.click('#game');
await A.keyboard.press('Enter');
await A.waitForFunction(() => document.activeElement?.id === 'chat-input');
await A.keyboard.type('hello from alice <b>hi</b>');
await A.keyboard.press('Enter');
check(await until(B, () => [...document.querySelectorAll('.chat-line')].some((l) => l.textContent.includes('hello from alice <b>hi</b>'))), 'Bob gets Alice\'s chat (HTML shown as text)');
check(await B.evaluate(() => !document.querySelector('#chat-log b b')), 'chat text is never parsed as HTML');
const bubble = await B.evaluate((id) => window.__hh.players.get(id).tag?.bubble.textContent, aId);
check(bubble?.includes('hello from alice'), 'Alice\'s speech bubble shows over her head for Bob');
await B.click('#game');
await B.keyboard.press('Enter');
await B.waitForFunction(() => document.activeElement?.id === 'chat-input');
await B.keyboard.type('hey alice!');
await B.keyboard.press('Enter');
check(await until(A, () => [...document.querySelectorAll('.chat-line')].some((l) => l.textContent.includes('hey alice!'))), 'Alice gets Bob\'s reply');
const long = 'x'.repeat(300);
await B.evaluate((t) => window.__hh.net.send({ t: 'chat', text: t }), long);
check(await until(A, () => [...document.querySelectorAll('.chat-line')].some((l) => /x{140}$/.test(l.textContent) && !/x{141}/.test(l.textContent))), 'server trims chat to 140 characters');

// --- emote + sit seen by others ---
await A.evaluate(() => window.__hh.doEmote('wave'));
check(await until(B, (id) => window.__hh.players.get(id)?.char.emote === 'wave', aId, 5000), 'Bob sees Alice wave');
await B.evaluate(() => window.__hh.requestSit('plaza-45-0'));
const bId = sB.id;
check(await until(A, (id) => window.__hh.players.get(id)?.seat === 'plaza-45-0', bId), 'Alice sees Bob sit on the bench');
check(await A.evaluate((id) => window.__hh.players.get(id).char.root.position.y < 0.45, bId), 'Bob is lowered onto the seat for Alice');
await C.evaluate(() => window.__hh.requestSit('plaza-45-0'));
await sleep(800);
const cSeat = await C.evaluate(() => window.__hh.me.seat);
check(cSeat === null, 'Cara can\'t take the seat Bob is on (server says no)');
// Cara bypasses the client check: the server must still refuse
await C.evaluate(() => window.__hh.net.send({ t: 'sit', seat: 'plaza-45-0' }));
await sleep(800);
check(await A.evaluate((id) => window.__hh.players.get(id)?.seat === 'plaza-45-0', bId), 'server keeps Bob in his seat when Cara tries to force it');
// one emote at a time: sitting down waits for the wave to finish
await A.evaluate(() => window.__hh.doEmote('sitground'));
check(await A.evaluate(() => window.__hh.me.pose !== 'sitground'), 'Alice can\'t sit down mid-wave (one emote at a time)');
await until(A, () => !window.__hh.me.char.emote, null, 6000);
await A.evaluate(() => window.__hh.doEmote('sitground'));
check(await until(B, (id) => window.__hh.players.get(id)?.pose === 'sitground', aId), 'Bob sees Alice sit on the ground');
// one emote at a time: sitting down waits for the wave to finish
await A.evaluate(() => window.__hh.doEmote('sitground'));
check(await A.evaluate(() => window.__hh.me.pose !== 'sitground'), 'Alice can\'t sit down mid-wave (one emote at a time)');
await until(A, () => !window.__hh.me.char.emote, null, 6000);
await A.evaluate(() => window.__hh.doEmote('sitground'));

// --- props ---
await C.evaluate(() => window.__hh.setMyProp('shake'));
check(await until(A, () => [...window.__hh.players.values()].some((p) => p.char.propName === 'shake')), 'Alice sees Cara holding a milkshake');

// --- ball stays in sync ---
const ballStart = await A.evaluate(() => window.__hh.ball.p.toArray());
await A.evaluate(() => {
  const g = window.__hh, b = g.ball;
  g.me.pos.set(b.p.x - 0.9, g.world.groundHeight(b.p.x - 0.9, b.p.z), b.p.z);
  g.kickBall(1, 0.3, 7, 4);
});
await sleep(600);
check(await until(B, () => !window.__hh.ball.resting || window.__hh.ball.owner, null, 4000), 'Bob\'s ball starts moving');
await sleep(5000);
const balls = await Promise.all([A, B, C].map((p) => p.evaluate(() => ({ p: window.__hh.ball.p.toArray(), owner: window.__hh.ball.owner }))));
const spread = Math.max(...balls.map((b) => Math.hypot(b.p[0] - balls[0].p[0], b.p[2] - balls[0].p[2])));
check(Math.hypot(balls[0].p[0] - ballStart[0], balls[0].p[2] - ballStart[2]) > 1, `ball travelled ${Math.hypot(balls[0].p[0] - ballStart[0], balls[0].p[2] - ballStart[2]).toFixed(1)} m`);
check(spread < 0.6, `everyone's ball is in the same place (spread ${spread.toFixed(2)} m)`);
check(balls.every((b) => b.owner === aId), 'everyone agrees Alice last touched the ball');

// --- campfire for a late joiner ---
await A.evaluate(() => window.__hh.net.send({ t: 'fire', lit: true }));
check(await until(B, () => window.__hh.fireInfo.lit), 'Bob sees the campfire lit');
const D = await openPage(ctxD, `/?norender#room=${code}`);
check(await until(D, () => window.__hh.net.status === 'online'), 'Dee joins late');
check(await until(D, () => window.__hh.fireInfo.lit && window.__hh.shared.fire.by === 'Alice', null, 10000), 'late joiner sees the fire already burning (lit by Alice)');
check(await until(D, () => { const id = window.__hh.shared.seats.get('plaza-45-0'); return !!id && window.__hh.players.get(id)?.seat === 'plaza-45-0'; }), 'late joiner sees Bob on his bench');

// --- room full ---
await ctxC.close();
await ctxD.close();
check(await until(A, () => window.__hh.players.size === 2), 'Cara and Dee closing their tabs leave the room');
await A.evaluate(() => { window.__leaves = 0; });
const fillers = [];
for (let i = 0; i < 6; i++) {
  const ws = new WebSocket(BASE.replace('http', 'ws') + `/room/${code}`);
  await new Promise((res) => { ws.onopen = res; });
  const got = new Promise((res) => { ws.onmessage = (e) => res(JSON.parse(e.data)); });
  ws.send(JSON.stringify({ t: 'hello', cid: `filler-${i}-${Date.now()}`, name: `Bot${i}`, avatar: { animal: 'bear' } }));
  const m = await got;
  ws.keepalive = setInterval(() => ws.send('ping'), 10000); // like a real client
  fillers.push(ws);
  if (i === 5) check(m.t === 'roster' && m.players.length === 8, 'eighth player fits');
}
check(await until(A, () => window.__hh.players.size === 8), 'Alice sees a full room of 8');
const leavesBefore = await A.evaluate(() => window.__leaves);
const E = await openPage(ctxE, '/?norender');
await E.click('#btn-play');
await E.fill('#name', 'Eve');
await E.fill('#code', code);
await E.click('#btn-join');
check(await until(E, () => document.getElementById('creator-msg').textContent.includes('full')), 'ninth player is told the room is full');
await sleep(1000);
check((await A.evaluate(() => window.__leaves)) === leavesBefore, 'turning someone away does not broadcast a "left"');
check((await A.evaluate(() => window.__hh.players.size)) === 8, 'still 8 in the room');
await E.screenshot({ path: OUT + 'room-full.png' });

// --- reload comes back as the same player (no ghost) ---
const bIdBefore = await B.evaluate(() => window.__hh.me.id);
await B.reload();
await B.waitForFunction(() => window.__hh && window.__hh.net.status === 'online', null, { timeout: 60000 });
const bIdAfter = await B.evaluate(() => window.__hh.me.id);
check(bIdAfter === bIdBefore, 'Bob reloads and comes back with the same id');
const noGhost = await until(A, () => window.__hh.players.size === 8);
if (!noGhost) console.log('  players seen by Alice:', await A.evaluate(() => [...window.__hh.players.values()].map((p) => p.name + ':' + p.id).join(', ')), await B.evaluate(() => window.__hh.players.size));
check(noGhost, 'no ghost: still exactly 8 players after the reload');
check(await A.evaluate((id) => window.__hh.players.get(id)?.name === 'Bob', bIdAfter), 'Alice still sees Bob by name');

// a second socket with the same client id replaces the first instead of duplicating
const dupCount = await A.evaluate(() => window.__hh.players.size);
const cid = await B.evaluate(() => localStorage.getItem('hh.cid'));
const dup = new WebSocket(BASE.replace('http', 'ws') + `/room/${code}`);
await new Promise((res) => { dup.onopen = res; });
dup.send(JSON.stringify({ t: 'hello', cid, name: 'Bob', avatar: { animal: 'bear' } }));
await sleep(1500);
check((await A.evaluate(() => window.__hh.players.size)) === dupCount, 'same client id on a new socket replaces the old one');
check(await until(B, () => window.__hh.net.status === 'offline'), 'the replaced tab is told it was replaced');
dup.close();

for (const ws of fillers) { clearInterval(ws.keepalive); ws.close(); }
await sleep(1500);
check(await until(A, () => window.__hh.players.size === 1), 'bots (and the replaced Bob) leaving are removed');

for (const p of [A, B, E]) if (p.errors.length) console.log('page errors:', p.errors.slice(0, 5));
check([A, B, E].every((p) => p.errors.length === 0), 'no page errors');
await browser.close();
done();
