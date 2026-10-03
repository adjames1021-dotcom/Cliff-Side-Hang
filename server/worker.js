// Hillside Hangout server: serves the game and runs one Durable Object per room.
import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 8;
const DAY_MS = 20 * 60 * 1000;   // one full day/night cycle
const START_FRAC = 0.7;          // new rooms begin at golden hour
const BURN_MS = 10 * 60 * 1000;  // how long a lit campfire lasts
const STALE_MS = 75 * 1000;      // drop sockets that went quiet (client pings every 20 s)
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

const ANIMALS = ['cat', 'bunny', 'bear', 'puppy', 'fox'];
const ACCESSORIES = ['beret', 'bowtie', 'scarf', 'crown', 'glasses', 'backpack'];
const ANIMS = new Set(['idle', 'walk', 'run', 'jump', 'sit', 'stool', 'swing', 'seesaw', 'piano', 'drums', 'play', 'fish', 'toast', 'sitground', 'sleep', 'scope']);
const EMOTES = new Set(['wave', 'dance', 'clap', 'laugh', 'sitground', 'heart', 'sleep', 'cheer', 'catch', 'show', 'sip']);
const PROP_RE = /^(mug|shake|sandwich|apple|cookie|rod|stick|mallow-(raw|toasty|gold|burnt))$/;
const SEAT_RE = /^[a-z0-9-]{1,24}$/;
const INSTRUMENTS = new Set(['piano', 'drums', 'xylo']);
const B = { minX: -20, maxX: 21, minZ: -21, maxZ: 21, minY: -2, maxY: 8 };
const BALL_B = { minX: -18.4, maxX: 19.1, minZ: -19.1, maxZ: 19.1 }; // a hair looser than the client's walls so they never fight

const json = (data, init = {}) => new Response(JSON.stringify(data), {
  ...init, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...(init.headers || {}) },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true });
    const m = url.pathname.match(/^\/room\/([^/]+)\/?$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return new Response('Bad room code', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

// ---------- small validators ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
function vec3(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map(num);
  return out.every((x) => x !== null) ? out : null;
}
const clampPos = (p) => [r2(clamp(p[0], B.minX, B.maxX)), r2(clamp(p[1], B.minY, B.maxY)), r2(clamp(p[2], B.minZ, B.maxZ))];
const cleanText = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
function cleanAvatar(a = {}) {
  const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  let acc = Array.isArray(a.acc) ? [...new Set(a.acc.filter((x) => ACCESSORIES.includes(x)))].slice(0, 2) : [];
  if (acc.includes('beret') && acc.includes('crown')) acc = acc.filter((x) => x !== 'crown');
  return { animal: ANIMALS.includes(a.animal) ? a.animal : 'bear', fur: hex(a.fur, '#C8875A'), outfit: hex(a.outfit, '#F4A646'), acc };
}
// Stable public id from the private client id (cyrb53).
function publicId(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(10, '0').slice(-10);
}
const pub = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, p: p.p, r: p.r, a: p.a, s: p.s, prop: p.prop, seat: p.seat });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.players = new Map(); // id -> player
    this.seats = new Map();   // seat id -> player id
    this.limits = new Map();  // sid -> rate limit buckets
    this.recent = new Map();  // id -> last spot, so a quick reload lands where you were
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    this.state = this.load('state');
    if (!this.state) {
      this.state = { start: Date.now(), fire: { litAt: 0, by: '' }, ball: { p: [-9, 0.45, 13.6], v: [0, 0, 0], owner: null } };
      this.save('state', this.state);
    }
    // Rebuild the roster from socket attachments after hibernation.
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a || !a.id || a.replaced || a.rejected) continue;
      const pl = { ...a, ws, seen: Date.now() };
      this.players.set(a.id, pl);
      if (a.seat) this.seats.set(a.seat, a.id);
    }
    if (this.state.ball.owner && !this.players.has(this.state.ball.owner)) this.state.ball.owner = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.ballSaved = 0;
  }

  load(k) {
    const row = this.ctx.storage.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0];
    return row ? JSON.parse(row.v) : null;
  }
  save(k, v) { this.ctx.storage.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, JSON.stringify(v)); }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ pending: true });
    return new Response(null, { status: 101, webSocket: client });
  }

  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch {} }
  broadcast(msg, exceptId = null) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.id !== exceptId) this.send(p.ws, s);
  }
  attach(pl) {
    const { ws, seen, savedAt, ...rest } = pl;
    try { pl.ws.serializeAttachment(rest); } catch {}
    pl.savedAt = Date.now();
  }

  // token buckets: general traffic and chat
  allow(sid, kind) {
    let b = this.limits.get(sid);
    const now = Date.now();
    if (!b) this.limits.set(sid, (b = { t: now, msg: 40, chat: 4, ping: 2 }));
    const dt = (now - b.t) / 1000;
    b.t = now;
    b.msg = Math.min(40, b.msg + dt * 25);
    b.chat = Math.min(4, b.chat + dt * 0.6);
    b.ping = Math.min(2, b.ping + dt * 0.5);
    if (b.msg < 1) return false;
    b.msg -= 1;
    if (kind === 'chat') { if (b.chat < 1) return false; b.chat -= 1; }
    if (kind === 'ping') { if (b.ping < 1) return false; b.ping -= 1; }
    return true;
  }

  clock() { return { now: Date.now(), start: this.state.start, frac: START_FRAC, dayMs: DAY_MS }; }
  fire() { return { litAt: this.state.fire.litAt, by: this.state.fire.by, burnMs: BURN_MS, now: Date.now() }; }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 2048) return;
    const att = ws.deserializeAttachment() || {};
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!this.allow(att.sid || 'pending', m.t)) return;
    if (m.t === 'hello') return this.hello(ws, m, att);
    const pl = att.id && this.players.get(att.id);
    if (!pl || pl.sid !== att.sid) return; // not joined, or replaced by a newer socket
    pl.seen = Date.now();
    switch (m.t) {
      case 'move': return this.onMove(pl, m);
      case 'emote': {
        if (!EMOTES.has(m.e)) return;
        const x = typeof m.x === 'string' ? cleanText(m.x, 24) : undefined;
        return this.broadcast({ t: 'emote', id: pl.id, e: m.e, x }, pl.id);
      }
      case 'chat': {
        const text = cleanText(m.text, 140);
        if (!text) return;
        return this.broadcast({ t: 'chat', id: pl.id, text }, pl.id);
      }
      case 'sit': return this.onSit(pl, m);
      case 'prop': {
        const prop = m.prop === null ? null : PROP_RE.test(m.prop) ? m.prop : undefined;
        if (prop === undefined) return;
        pl.prop = prop;
        this.attach(pl);
        return this.broadcast({ t: 'prop', id: pl.id, prop }, pl.id);
      }
      case 'note': {
        const n = Math.round(num(m.n) ?? -1);
        if (!INSTRUMENTS.has(m.i) || n < 0 || n > 7 || this.seats.get('inst-' + m.i) !== pl.id) return;
        return this.broadcast({ t: 'note', id: pl.id, i: m.i, n }, pl.id);
      }
      case 'ball': return this.onBall(pl, m);
      case 'fire': return this.onFire(pl, m);
      case 'ping': {
        const p = vec3(m.p);
        if (!p) return;
        return this.broadcast({ t: 'ping', id: pl.id, p: clampPos(p) }, pl.id);
      }
      case 'look': {
        pl.name = cleanText(m.name, 16) || pl.name;
        pl.avatar = cleanAvatar(m.avatar);
        this.attach(pl);
        return this.broadcast({ t: 'look', id: pl.id, name: pl.name, avatar: pl.avatar }, pl.id);
      }
    }
  }

  hello(ws, m, att) {
    if (att.id) return; // already joined on this socket
    const cid = typeof m.cid === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(m.cid) ? m.cid : null;
    if (!cid) { this.send(ws, { t: 'err', reason: 'bad hello' }); try { ws.close(4002, 'Bad hello'); } catch {} return; }
    const id = publicId(cid);
    const existing = this.players.get(id);
    if (!existing && this.players.size >= MAX_PLAYERS) {
      // turned away: never counted as joined, so no "left" message later
      ws.serializeAttachment({ rejected: true });
      this.send(ws, { t: 'full', max: MAX_PLAYERS });
      try { ws.close(4001, 'Room is full'); } catch {}
      return;
    }
    const name = cleanText(m.name, 16) || 'Friend';
    const avatar = cleanAvatar(m.avatar);
    const sid = crypto.randomUUID();
    let pl;
    if (existing) {
      // reconnect: swap sockets quietly instead of leaving a ghost behind
      const old = existing.ws;
      try { old.serializeAttachment({ replaced: true }); } catch {}
      try { old.close(4000, 'Replaced by a newer connection'); } catch {}
      Object.assign(existing, { ws, sid, name, avatar, seen: Date.now() });
      pl = existing;
    } else {
      const back = this.recent.get(id);
      const p = back && Date.now() - back.at < 120000 ? back.p : [r2((Math.random() - 0.5) * 3), 0.04, r2(5 + Math.random() * 1.5)];
      pl = { id, sid, ws, name, avatar, p, r: back ? back.r : Math.PI, a: 'idle', s: 0, prop: null, seat: null, seen: Date.now() };
      this.players.set(id, pl);
    }
    this.attach(pl);
    this.send(ws, {
      t: 'roster', you: id, max: MAX_PLAYERS, players: [...this.players.values()].map(pub),
      clock: this.clock(), fire: this.fire(), ball: this.state.ball, seats: Object.fromEntries(this.seats),
    });
    this.broadcast({ t: 'join', p: pub(pl), rejoin: !!existing }, id);
    this.ctx.storage.getAlarm().then((a) => { if (!a) this.ctx.storage.setAlarm(Date.now() + 30000); });
  }

  onMove(pl, m) {
    const p = vec3(m.p);
    if (!p) return;
    pl.p = clampPos(p);
    const r = num(m.r);
    if (r !== null) pl.r = r2(Math.atan2(Math.sin(r), Math.cos(r)));
    pl.a = ANIMS.has(m.a) ? m.a : 'idle';
    pl.s = r2(clamp(num(m.s) ?? 0, 0, 1));
    this.broadcast({ t: 'move', id: pl.id, p: pl.p, r: pl.r, a: pl.a, s: pl.s }, pl.id);
    if (Date.now() - (pl.savedAt || 0) > 2000) this.attach(pl);
  }

  onSit(pl, m) {
    const seat = m.seat === null ? null : typeof m.seat === 'string' && SEAT_RE.test(m.seat) ? m.seat : undefined;
    if (seat === undefined) return;
    if (seat) {
      const holder = this.seats.get(seat);
      if (holder && holder !== pl.id && this.players.has(holder)) {
        return this.send(pl.ws, { t: 'sit', id: pl.id, seat: pl.seat, ok: false, want: seat, reason: "Someone's already there" });
      }
      if (!holder && this.seats.size >= 64) return;
    }
    if (pl.seat && this.seats.get(pl.seat) === pl.id) this.seats.delete(pl.seat);
    pl.seat = seat;
    if (seat) this.seats.set(seat, pl.id);
    this.attach(pl);
    this.broadcast({ t: 'sit', id: pl.id, seat, ok: true });
  }

  onBall(pl, m) {
    const b = this.state.ball;
    let p = vec3(m.p), v = vec3(m.v);
    if (!p || !v) return;
    if (m.k) {
      // claiming the ball by kicking it: you have to actually be near it
      const near = Math.hypot(pl.p[0] - p[0], pl.p[2] - p[2]) < 3.2;
      const wasHere = Math.hypot(b.p[0] - p[0], b.p[2] - p[2]) < 5;
      if (!near || !wasHere) return this.send(pl.ws, { t: 'ball', p: b.p, v: b.v, owner: b.owner });
      b.owner = pl.id;
    } else if (b.owner !== pl.id) return;
    // server correction: keep it in the village and at a sane speed
    let fixed = false;
    const cp = [clamp(p[0], BALL_B.minX, BALL_B.maxX), clamp(p[1], -1, 8), clamp(p[2], BALL_B.minZ, BALL_B.maxZ)];
    if (cp[0] !== p[0] || cp[1] !== p[1] || cp[2] !== p[2]) fixed = true;
    const sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > 16) { v = v.map((x) => (x * 16) / sp); fixed = true; }
    if (cp[0] !== p[0]) v[0] = -v[0] * 0.5;
    if (cp[2] !== p[2]) v[2] = -v[2] * 0.5;
    b.p = cp.map(r2); b.v = v.map(r2);
    this.broadcast({ t: 'ball', p: b.p, v: b.v, owner: b.owner, k: m.k ? 1 : 0 }, fixed || m.k ? null : pl.id);
    const now = Date.now();
    if (now - this.ballSaved > 3000 || sp < 0.05) { this.ballSaved = now; this.save('state', this.state); }
  }

  onFire(pl, m) {
    const f = this.state.fire;
    const lit = Date.now() - f.litAt < BURN_MS;
    if (m.lit === true && !lit) {
      f.litAt = Date.now();
      f.by = pl.name;
      this.save('state', this.state);
      return this.broadcast({ t: 'fire', ...this.fire() });
    }
    this.send(pl.ws, { t: 'fire', ...this.fire() });
  }

  remove(pl) {
    if (this.players.get(pl.id) !== pl) return;
    this.players.delete(pl.id);
    this.limits.delete(pl.sid);
    if (pl.seat && this.seats.get(pl.seat) === pl.id) this.seats.delete(pl.seat);
    this.recent.set(pl.id, { p: pl.p, r: pl.r, at: Date.now() });
    const b = this.state.ball;
    if (b.owner === pl.id) {
      b.owner = null;
      b.v = [0, 0, 0];
      b.p[1] = Math.max(0.45, b.p[1]);
      this.save('state', this.state);
      this.broadcast({ t: 'ball', p: b.p, v: b.v, owner: null });
    }
    this.broadcast({ t: 'leave', id: pl.id });
  }

  closed(ws) {
    const att = ws.deserializeAttachment() || {};
    if (!att.id || att.replaced || att.rejected) return;
    const pl = this.players.get(att.id);
    if (!pl || pl.sid !== att.sid) return;
    this.remove(pl);
  }

  async webSocketClose(ws, code) {
    this.closed(ws);
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {}
  }
  async webSocketError(ws) { this.closed(ws); }

  // Sweep sockets that silently vanished (closed laptop, lost signal).
  async alarm() {
    const now = Date.now();
    for (const pl of [...this.players.values()]) {
      const auto = this.ctx.getWebSocketAutoResponseTimestamp(pl.ws);
      const last = Math.max(pl.seen || 0, auto ? auto.getTime() : 0);
      if (now - last > STALE_MS) {
        try { pl.ws.serializeAttachment({ replaced: true }); pl.ws.close(4003, 'Timed out'); } catch {}
        this.remove(pl);
      }
    }
    if (this.players.size) await this.ctx.storage.setAlarm(Date.now() + 30000);
  }
}
