// Connection to the room server, the lobby panel and the chat box.
import { ANIMAL_EMOJI } from './characters.js';

// If you host the page somewhere other than the Worker (e.g. GitHub Pages),
// put your Worker's address here, e.g. 'https://hillside-hangout.yourname.workers.dev'.
export const DEFAULT_SERVER = '';

const $ = (id) => document.getElementById(id);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const makeCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const validCode = (c) => /^[A-HJ-NP-Z2-9]{4}$/.test(c);

function clientId() {
  let id = null;
  try { id = localStorage.getItem('hh.cid'); } catch {}
  if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    id = Array.from(bytes, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36);
    try { localStorage.setItem('hh.cid', id); } catch {}
  }
  return id;
}

function normalizeServer(s) {
  s = String(s || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).origin; } catch { return ''; }
}

export class Net {
  constructor() {
    this.cid = clientId();
    this.handlers = {};
    this.ws = null;
    this.room = null;
    this.base = null;
    this.status = 'offline';
    this.retry = 0;
    setInterval(() => { if (this.ws?.readyState === 1) this.ws.send('ping'); }, 20000);
  }

  on(t, fn) { (this.handlers[t] ||= []).push(fn); }
  emit(t, m) { for (const fn of this.handlers[t] || []) fn(m); }

  // Same-origin Worker first, then a saved address, then DEFAULT_SERVER.
  async detect() {
    let saved = '';
    try { saved = localStorage.getItem('hh.server') || ''; } catch {}
    if (saved) { this.base = saved; return this.base; }
    if (location.protocol.startsWith('http')) {
      try {
        const r = await fetch('/health', { cache: 'no-store' });
        const j = await r.json();
        if (j && j.ok) { this.base = location.origin; return this.base; }
      } catch {}
    }
    this.base = normalizeServer(DEFAULT_SERVER) || null;
    return this.base;
  }

  setServer(s) {
    const url = normalizeServer(s);
    try { url ? localStorage.setItem('hh.server', url) : localStorage.removeItem('hh.server'); } catch {}
    this.base = url || null;
    return this.base;
  }

  get customServer() { try { return localStorage.getItem('hh.server') || ''; } catch { return ''; } }

  wsUrl(code) {
    const u = new URL(this.base);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = `/room/${code}`;
    return u.toString();
  }

  join(code, profile) {
    this.room = code;
    this.profile = profile;
    this.leaving = false;
    this.retry = 0;
    this.joinedOnce = false;
    this.connect();
  }

  connect() {
    clearTimeout(this.timer);
    if (!this.room || !this.base) return;
    let ws;
    try { ws = new WebSocket(this.wsUrl(this.room)); } catch { return this.scheduleRetry(); }
    this.ws = ws;
    this.setStatus(this.joinedOnce ? 'reconnecting' : 'connecting');
    ws.onopen = () => {
      this.send({ t: 'hello', cid: this.cid, name: this.profile.name, avatar: this.profile.avatar });
    };
    ws.onmessage = (ev) => {
      if (ev.data === 'pong') return;
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'roster') {
        this.retry = 0;
        this.setStatus('online');
        m.rejoin = this.joinedOnce;
        this.joinedOnce = true;
      }
      this.emit(m.t, m);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (ev.code === 4001) { this.room = null; this.setStatus('offline'); this.emit('full', {}); return; }
      if (ev.code === 4000) { this.room = null; this.setStatus('offline'); this.emit('replaced', {}); return; }
      if (this.leaving || !this.room) { this.setStatus('offline'); return; }
      this.scheduleRetry();
    };
  }

  scheduleRetry() {
    this.setStatus('reconnecting');
    const delay = Math.min(15000, 1000 * 2 ** this.retry++) * (0.8 + Math.random() * 0.4);
    this.timer = setTimeout(() => this.connect(), delay);
  }

  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }

  leave() {
    this.leaving = true;
    this.room = null;
    clearTimeout(this.timer);
    try { this.ws?.close(1000, 'leaving'); } catch {}
    this.ws = null;
    this.setStatus('offline');
  }

  setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  get online() { return this.status === 'online'; }

  inviteLink(code = this.room) {
    const u = new URL(location.href);
    u.hash = `room=${code}`;
    if (this.base && this.base !== location.origin) u.hash += `&server=${encodeURIComponent(this.base)}`;
    return u.toString();
  }
}

// Reads #room=CODE(&server=...) from the address bar.
export function readInvite() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const code = (h.get('room') || '').toUpperCase();
  return { code: validCode(code) ? code : null, server: h.get('server') || null };
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

// ---------- lobby panel ----------
export function renderLobby(game) {
  const list = $('lobby-list');
  const players = [...game.players.values()];
  $('lobby-title').textContent = game.net.room ? 'Room ' : 'Wandering solo';
  $('lobby-code').textContent = game.net.room || '';
  list.replaceChildren(...players.map((p) => {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = p.avatar.outfit;
    const label = document.createElement('span');
    label.textContent = `${ANIMAL_EMOJI[p.avatar.animal] || ''} ${p.name}`;
    li.append(sw, label);
    if (p === game.me) {
      const y = document.createElement('span');
      y.className = 'you';
      y.textContent = 'you';
      li.append(y);
    }
    return li;
  }));
  const st = game.net.room ? { online: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', offline: 'Offline' }[game.net.status] : 'Just you, wandering solo';
  $('lobby-status').textContent = `${st} · ${players.length}/${game.maxPlayers || 8} here`;
  $('btn-invite').classList.toggle('hidden', !game.net.room);
}

// ---------- chat ----------
export class Chat {
  constructor(onSend, onTyping) {
    this.onSend = onSend;
    this.onTyping = onTyping;
    this.form = $('chat-form');
    this.input = $('chat-input');
    this.log = $('chat-log');
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.replace(/\s+/g, ' ').trim().slice(0, 140);
      this.input.value = '';
      if (text) this.onSend(text);
      this.close();
    });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.input.value = ''; this.close(); }
      e.stopPropagation();
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
  }
  get isOpen() { return !this.form.classList.contains('hidden'); }
  open() {
    this.form.classList.remove('hidden');
    this.log.classList.add('open');
    this.onTyping(true);
    setTimeout(() => this.input.focus(), 0);
  }
  close() {
    this.form.classList.add('hidden');
    this.log.classList.remove('open');
    this.input.blur();
    this.onTyping(false);
  }
  add(name, text, sys = false) {
    const line = document.createElement('div');
    line.className = 'chat-line' + (sys ? ' sys' : '');
    if (name) {
      const b = document.createElement('b');
      b.textContent = name + ': ';
      line.append(b);
    }
    line.append(document.createTextNode(text)); // text only, never HTML
    this.log.append(line);
    while (this.log.children.length > 8) this.log.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 9000);
  }
}
