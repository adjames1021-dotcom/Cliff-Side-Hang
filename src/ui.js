// DOM bits: character creator, toasts, the action prompt and the emote wheel.
import { ANIMALS, ANIMAL_EMOJI, FUR, OUTFIT, ACCESSORIES, ACC_LABEL, DEFAULT_FUR, EMOTES, cleanAvatar, randomAvatar } from './characters.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const NAMES = ['Mochi', 'Pip', 'Bean', 'Toffee', 'Biscuit', 'Maple', 'Pudding', 'Clover', 'Sprout', 'Nugget', 'Peaches', 'Waffles', 'Bun', 'Hazel', 'Juniper', 'Dumpling'];
export const randomName = () => NAMES[Math.floor(Math.random() * NAMES.length)];
export const cleanName = (n) => String(n ?? '').replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem('hh.profile'));
    if (p && p.avatar) return { name: cleanName(p.name) || randomName(), avatar: cleanAvatar(p.avatar) };
  } catch {}
  return null;
}
export function saveProfile(p) {
  try { localStorage.setItem('hh.profile', JSON.stringify({ name: p.name, avatar: p.avatar })); } catch {}
}

// ---------- creator ----------
export class Creator {
  constructor(h) {
    this.h = h;
    this.profile = { name: randomName(), avatar: randomAvatar() };
    this.nameEl = $('name');
    this.nameEl.addEventListener('input', () => { this.profile.name = this.nameEl.value; });
    this.render();
    $('btn-create').onclick = () => this.submit('create');
    $('btn-join').onclick = () => this.submit('join');
    $('btn-solo').onclick = () => this.submit('solo');
    $('btn-done').onclick = () => this.submit('done');
    $('code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.submit('join'); });
  }

  render() {
    const av = this.profile.avatar;
    const animals = $('animals');
    animals.replaceChildren(...ANIMALS.map((a) => {
      const b = el('button', 'chip' + (av.animal === a ? ' on' : ''), `${ANIMAL_EMOJI[a]} ${a[0].toUpperCase() + a.slice(1)}`);
      b.onclick = () => {
        const wasDefault = av.fur === DEFAULT_FUR[av.animal];
        av.animal = a;
        if (wasDefault) av.fur = DEFAULT_FUR[a];
        this.changed();
      };
      return b;
    }));
    const swatches = (id, list, key) => $(id).replaceChildren(...list.map((c) => {
      const b = el('button', 'sw' + (av[key].toLowerCase() === c.toLowerCase() ? ' on' : ''));
      b.style.background = c;
      b.title = c;
      b.setAttribute('aria-label', `${key} ${c}`);
      b.onclick = () => { av[key] = c; this.changed(); };
      return b;
    }));
    swatches('furs', FUR, 'fur');
    swatches('outfits', OUTFIT, 'outfit');
    $('accs').replaceChildren(...ACCESSORIES.map((a) => {
      const b = el('button', 'chip' + (av.acc.includes(a) ? ' on' : ''), ACC_LABEL[a]);
      b.onclick = () => {
        if (av.acc.includes(a)) av.acc = av.acc.filter((x) => x !== a);
        else {
          // one hat at a time so they never poke through each other
          const hats = ['beret', 'crown'];
          if (hats.includes(a)) av.acc = av.acc.filter((x) => !hats.includes(x));
          av.acc.push(a);
          if (av.acc.length > 2) av.acc.shift();
        }
        this.changed();
      };
      return b;
    }));
  }

  changed() {
    this.render();
    this.h.onChange?.(this.profile);
  }

  open(profile, { editing = false, code = '' } = {}) {
    if (profile) this.profile = { name: profile.name, avatar: cleanAvatar(profile.avatar) };
    this.nameEl.value = this.profile.name;
    if (code) $('code').value = code;
    $('creator-title').textContent = editing ? 'Change your look' : 'Make your critter';
    $('join-box').classList.toggle('hidden', editing);
    $('edit-box').classList.toggle('hidden', !editing);
    $('creator').classList.remove('hidden');
    this.message('');
    this.render();
    this.h.onChange?.(this.profile);
  }

  close() { $('creator').classList.add('hidden'); }

  message(text) { $('creator-msg').textContent = text; }

  submit(kind) {
    this.profile.name = cleanName(this.nameEl.value) || randomName();
    this.nameEl.value = this.profile.name;
    const code = $('code').value.trim().toUpperCase();
    if (kind === 'join' && !/^[A-HJ-NP-Z2-9]{4}$/.test(code)) {
      this.message('Room codes are 4 letters/numbers (no 0, O, 1 or I).');
      return;
    }
    saveProfile(this.profile);
    this.h.onSubmit?.(kind, this.profile, code);
  }
}

// ---------- toasts ----------
export function toast(text, ms = 2600) {
  const t = el('div', 'toast', text);
  $('toasts').append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 600);
}

// ---------- action prompt ----------
const promptEl = () => $('prompt');
let promptText = '';
export function showPrompt(text, key = 'E') {
  const full = text ? `${key}|${text}` : '';
  if (full === promptText) return;
  promptText = full;
  const p = promptEl();
  if (!text) { p.classList.add('hidden'); return; }
  const k = el('kbd', '', key);
  p.replaceChildren(k, document.createTextNode(text));
  p.classList.remove('hidden');
  const act = $('t-act');
  if (act) act.textContent = key.length <= 2 ? key : '•';
}

// ---------- emote wheel ----------
export class EmoteWheel {
  constructor(onPick) {
    this.onPick = onPick;
    this.el = $('wheel');
    const ring = el('div', 'wheel-ring');
    EMOTES.forEach((e, i) => {
      const a = (i / EMOTES.length) * Math.PI * 2 - Math.PI / 2;
      const b = el('button', 'wheel-item');
      b.style.left = `${50 + Math.cos(a) * 36}%`;
      b.style.top = `${50 + Math.sin(a) * 36}%`;
      b.append(document.createTextNode(e.icon), el('span', '', e.label), el('small', '', String(i + 1)));
      b.onclick = (ev) => { ev.stopPropagation(); this.pick(e.id); };
      ring.append(b);
    });
    ring.append(el('div', 'wheel-center', 'Emotes'));
    this.el.append(ring);
    this.el.addEventListener('click', () => this.close());
  }
  get isOpen() { return !this.el.classList.contains('hidden'); }
  open() { this.el.classList.remove('hidden'); }
  close() { this.el.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  pick(id) { this.close(); this.onPick(id); }
  key(n) { const e = EMOTES[n - 1]; if (e) this.pick(e.id); }
}

export function overlay(id, show) {
  $(id).classList.toggle('hidden', !show);
}
