// Graphics settings: presets, individual options, saved per device, plus the menu that edits them.
const KEY = 'hh.gfx';

export const PRESETS = {
  low: { res: 0.75, aa: false, shadows: 0, lights: 0, grass: 0, bloom: false, rays: false, ao: false, reflections: false, fur: false },
  medium: { res: 1, aa: true, shadows: 1, lights: 3, grass: 1, bloom: true, rays: false, ao: false, reflections: false, fur: false },
  high: { res: 1, aa: true, shadows: 2, lights: 6, grass: 2, bloom: true, rays: true, ao: false, reflections: false, fur: false },
  ultra: { res: 1, aa: true, shadows: 3, lights: 8, grass: 3, bloom: true, rays: true, ao: true, reflections: true, fur: false },
};

function defaultPreset() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  if (touch) return cores >= 8 ? 'medium' : 'low';
  return cores >= 8 ? 'high' : 'medium';
}

export const settings = {
  preset: 'high', style: 'realistic', view: 'third', auto: true, fps: false, fov: 'normal',
  ...PRESETS.high,
};

export function loadSettings() {
  const p = defaultPreset();
  Object.assign(settings, { preset: p }, PRESETS[p]);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') {
      // version 2: fluffy fur is now off unless you turn it on again
      if (saved.v !== 2) delete saved.fur;
      for (const k of Object.keys(settings)) if (k in saved) settings[k] = saved[k];
    }
    settings.v = 2;
  } catch {}
  return settings;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {}
}

const listeners = [];
export function onSettings(fn) { listeners.push(fn); }
function emit(changed) { for (const fn of listeners) fn(settings, changed); }

export function setSetting(key, value) {
  if (settings[key] === value) return;
  settings[key] = value;
  if (key in PRESETS.low) settings.preset = matchPreset();
  save();
  emit([key]);
  renderMenu();
}
export function applyPreset(name) {
  Object.assign(settings, PRESETS[name], { preset: name });
  save();
  emit(Object.keys(PRESETS[name]));
  renderMenu();
}
function matchPreset() {
  for (const [name, p] of Object.entries(PRESETS)) if (Object.entries(p).every(([k, v]) => settings[k] === v)) return name;
  return 'custom';
}

// ---------- menu ----------
const ROWS = [
  ['preset', 'Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]],
  ['style', 'Look', [['realistic', 'Realistic'], ['toon', 'Toon']]],
  ['view', 'Camera', [['third', 'Third person'], ['first', 'First person']]],
  ['res', 'Resolution', [[0.5, '50%'], [0.75, '75%'], [1, '100%']]],
  ['auto', 'Auto-adjust when slow', [[true, 'On'], [false, 'Off']]],
  ['shadows', 'Shadows', [[0, 'Off'], [1, 'Low'], [2, 'High'], [3, 'Ultra']]],
  ['lights', 'Lamp light at night', [[0, 'Off'], [3, '3'], [6, '6'], [8, '8']]],
  ['grass', 'Grass', [[0, 'Off'], [1, 'Low'], [2, 'Medium'], [3, 'Lush']]],
  ['bloom', 'Glow (bloom)', [[true, 'On'], [false, 'Off']]],
  ['rays', 'Sun rays', [[true, 'On'], [false, 'Off']]],
  ['ao', 'Ambient occlusion', [[true, 'On'], [false, 'Off']]],
  ['reflections', 'Sea reflections', [[true, 'On'], [false, 'Off']]],
  ['fur', 'Fuzzy fur (experimental)', [[true, 'On'], [false, 'Off']]],
  ['aa', 'Anti-aliasing', [[true, 'On'], [false, 'Off']]],
  ['fov', 'Field of view', [['normal', 'Normal'], ['wide', 'Wide']]],
  ['fps', 'Show FPS', [[true, 'On'], [false, 'Off']]],
];

let menuEl = null;
export function buildMenu(el) {
  menuEl = el;
  renderMenu();
}
function renderMenu() {
  if (!menuEl) return;
  menuEl.replaceChildren(...ROWS.map(([key, label, opts]) => {
    const row = document.createElement('div');
    row.className = 'gfx-row';
    const l = document.createElement('div');
    l.className = 'gfx-label';
    l.textContent = label + (key === 'preset' && settings.preset === 'custom' ? ' (custom)' : '');
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [v, text] of opts) {
      const b = document.createElement('button');
      b.textContent = text;
      if (settings[key] === v) b.className = 'on';
      b.onclick = () => (key === 'preset' ? applyPreset(v) : setSetting(key, v));
      seg.append(b);
    }
    row.append(l, seg);
    return row;
  }));
}
