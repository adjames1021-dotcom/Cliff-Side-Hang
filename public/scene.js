// Cliffside Hang — a modern house on a cliff at sunset, chibi bears, passing boats.
// Everything is drawn on one <canvas> in "world units": the world is 900 units
// tall (bottom-anchored) and as wide as the screen allows.
(() => {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  const BASE_H = 900;  // world height that always fits on screen
  const MIN_W = 760;   // world width that always fits on screen
  const SEA = 560;     // horizon line
  const CT = 360;      // cliff top (ground level for the house)
  const CB = 770;      // cliff base, where the rock meets the water

  // Boat lanes: further lanes sit nearer the horizon and draw smaller.
  // The last lane passes in front of the cliff.
  const LANES = [
    { y: 592, s: 0.32 },
    { y: 640, s: 0.5 },
    { y: 712, s: 0.72 },
    { y: 838, s: 1.05 },
  ];

  let W, H, DPR, S, VW, VH, TOP;
  let t = 0;
  let lightsOn = true;
  const L = {}; // layout, recomputed on resize

  // ---------- helpers ----------
  function mulberry(a) {
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let r = Math.imul(a ^ (a >>> 15), 1 | a);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = Math.random;
  const lerp = (a, b, k) => a + (b - a) * k;
  const TAU = Math.PI * 2;

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const tgt = k < 0 ? 0 : 255, a = Math.abs(k);
    return `rgb(${c.map((v) => Math.round(lerp(v, tgt, a))).join(",")})`;
  }
  function ell(x, y, rx, ry, fill, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function blob(x, y, rx, ry, fill, rot = 0) {
    ell(x, y, rx, ry, fill, rot);
    ctx.stroke();
  }
  function rect(x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }
  function roundRect(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // ---------- layout ----------
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    S = Math.min(H / BASE_H, W / MIN_W);
    VW = W / S;
    VH = H / S;
    TOP = BASE_H - VH; // world y at the top of the screen (<= 0)
    layout();
  }

  function layout() {
    const r = mulberry(11);
    L.cliffX = Math.max(VW * 0.4, VW - 740);
    L.edge = L.cliffX + 30;          // lip of the cliff
    L.hx = L.edge + 150;             // left wall of the ground floor
    L.deckL = L.edge + 6;
    L.treeX = L.hx + 330;
    L.sunX = Math.min(VW * 0.24, L.cliffX * 0.5);
    L.sunY = 528;

    // jagged cliff face from the lip down to the waterline
    L.face = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      const jitter = i === 0 ? 0 : (r() - 0.5) * 24;
      L.face.push([L.edge - k * 115 - Math.sin(k * 8) * 12 + jitter, CT + k * (CB - CT)]);
    }
    // ragged base line along the water
    L.base = [];
    const fx = L.face[N][0];
    for (let x = fx; x <= VW + 20; x += 18) L.base.push([x, CB + (r() - 0.5) * 10]);

    // rock strata
    L.strata = [];
    for (let y = CT + 34; y < CB - 10; y += 30 + r() * 18) {
      const line = [];
      for (let x = L.edge - 140; x <= VW + 20; x += 26) line.push([x, y + (r() - 0.5) * 8 + (x - L.edge) * 0.03]);
      L.strata.push(line);
    }

    // rocks at the base
    L.rocks = [];
    for (let i = 0; i < 4; i++) {
      L.rocks.push({ x: fx - 8 - i * 30 - r() * 14, y: CB + 4 + r() * 8, w: 26 - i * 4 + r() * 10, h: 14 - i * 2 + r() * 8 });
    }

    // sparkles on the water (denser near the horizon)
    L.dashes = [];
    for (let i = 0; i < 260; i++) {
      const k = Math.pow(r(), 1.7);
      L.dashes.push({ x: r() * VW, y: SEA + 3 + k * (BASE_H - SEA), len: (5 + k * 46) * (0.5 + r()), ph: r() * TAU, sp: 0.6 + r() });
    }

    // clouds: long sunset streaks
    L.clouds = [];
    const ctop = Math.max(TOP + 60, 40);
    for (let i = 0; i < 9; i++) {
      L.clouds.push({ x: r() * (VW + 400) - 200, y: lerp(ctop, 470, r()), w: 120 + r() * 220, h: 8 + r() * 12, sp: 3 + r() * 5 });
    }

    // stars in the deep purple at the top
    L.stars = [];
    for (let i = 0; i < 60; i++) {
      L.stars.push({ x: r() * VW, y: TOP + r() * (VH * 0.28), s: 0.6 + r() * 1.3, ph: r() * TAU });
    }

    // distant islands
    L.islands = [
      { x: -20, w: VW * 0.16, h: 26 },
      { x: L.cliffX * 0.62, w: 80, h: 10 },
    ];
  }

  // ---------- bears ----------
  const bears = [
    { name: "Mocha", col: "#8b5a3c", r: 15, zone: "deck", u: 0.5, tu: 0.8, speed: 26 },
    { name: "Honey", col: "#d69b55", r: 14, zone: "deckSit", sit: true, u: 0, flip: true },
    { name: "Mallow", col: "#f3e6d0", r: 14, zone: "upstairs", u: 0.3, tu: 0.7, speed: 20 },
    { name: "Pebble", col: "#9b8f88", r: 15, zone: "lawn", u: 0.2, tu: 0.9, speed: 22 },
  ];
  for (const b of bears) {
    Object.assign(b, { pause: 1 + rand() * 2, wave: 0, walkPh: 0, walking: false, blink: 0, blinkT: 1 + rand() * 3 });
  }

  function zone(b) {
    switch (b.zone) {
      case "deck": return { y: CT, a: L.deckL + 84, b: L.hx - 16 };
      case "deckSit": return { y: CT, a: L.deckL + 52, b: L.deckL + 52 };
      case "upstairs": return { y: 254, a: L.hx - 66, b: L.hx + 132 };
      case "lawn": {
        const a = L.hx + 285, e = Math.min(VW - 26, L.hx + 420);
        return e - a > 50 ? { y: CT + 3, a, b: e } : null;
      }
    }
  }
  function bearPos(b) {
    const z = zone(b);
    return z && { x: lerp(z.a, z.b, b.u), y: z.y };
  }

  function updateBear(b, dt) {
    const z = zone(b);
    b.visible = !!z;
    if (!z) return;
    if (b.wave > 0) b.wave -= dt;
    b.blinkT -= dt;
    if (b.blinkT < 0) { b.blink = 0.13; b.blinkT = 2 + rand() * 4; }
    if (b.blink > 0) b.blink -= dt;
    if (b.sit || b.wave > 0) { b.walking = false; return; }
    if (b.pause > 0) { b.pause -= dt; b.walking = false; return; }
    const span = Math.max(1, z.b - z.a);
    const d = (b.tu - b.u) * span;
    if (Math.abs(d) < 1) {
      b.pause = 1.5 + rand() * 4;
      b.tu = rand();
      b.walking = false;
      if (rand() < 0.5) b.flip = true; // turn to watch the sunset
      return;
    }
    b.u += (Math.sign(d) * Math.min(Math.abs(d), b.speed * dt)) / span;
    b.flip = d < 0;
    b.walking = true;
    b.walkPh += dt * 10;
  }

  // Chibi bear, drawn standing on (0,0) after translate. r = head radius.
  function drawBear(x, y, r, col, o = {}) {
    const light = shade(col, 0.55), mid = shade(col, -0.12);
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.strokeStyle = shade(col, -0.55);
    ctx.lineJoin = "round";
    const step = o.walking ? Math.sin(o.walkPh) : 0;
    const bounce = o.walking ? Math.abs(Math.sin(o.walkPh)) * r * 0.14 : Math.sin(t * 2 + x * 0.1) * r * 0.03;

    if (!o.noShadow) {
      ctx.globalAlpha = 0.25;
      ell(0, 0, r * 0.9, r * 0.16, "#2a1530");
      ctx.globalAlpha = 1;
    }
    ctx.translate(0, -bounce);

    // back arm
    blob(-r * 0.56, -r * 0.8, r * 0.17, r * 0.28, mid, 0.5);
    if (o.sit) {
      blob(0, -r * 0.58, r * 0.72, r * 0.6, col);
      ell(0, -r * 0.52, r * 0.42, r * 0.36, light);
      blob(-r * 0.32, -r * 0.14, r * 0.24, r * 0.17, mid);
      blob(r * 0.34, -r * 0.14, r * 0.24, r * 0.17, mid);
    } else {
      blob(0, -r * 0.7, r * 0.66, r * 0.62, col);
      ell(0, -r * 0.6, r * 0.4, r * 0.36, light);
      blob(-r * 0.3 + step * r * 0.16, -r * 0.12, r * 0.26, r * 0.16, mid);
      blob(r * 0.3 - step * r * 0.16, -r * 0.12, r * 0.26, r * 0.16, mid);
    }

    const hy = (o.sit ? -r * 1.82 : -r * 1.95);
    // ears
    for (const sx of [-1, 1]) {
      blob(sx * r * 0.7, hy - r * 0.68, r * 0.32, r * 0.32, col);
      ell(sx * r * 0.7, hy - r * 0.66, r * 0.16, r * 0.16, light);
    }
    // head with warm rim light from the sun (world-left)
    blob(0, hy, r, r * 0.94, col);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, hy, r, r * 0.94, 0, 0, TAU);
    ctx.clip();
    const rim = o.flip ? 1 : -1;
    ell(rim * r * 1.05, hy - r * 0.15, r * 0.55, r * 0.95, "rgba(255,170,95,0.35)");
    ctx.restore();
    // face
    ctx.lineWidth = Math.max(0.6, r * 0.05);
    blob(0, hy + r * 0.32, r * 0.4, r * 0.28, light);
    ell(0, hy + r * 0.2, r * 0.13, r * 0.09, "#2b1b17");
    ctx.beginPath();
    ctx.moveTo(-r * 0.13, hy + r * 0.34);
    ctx.quadraticCurveTo(-r * 0.065, hy + r * 0.44, 0, hy + r * 0.32);
    ctx.quadraticCurveTo(r * 0.065, hy + r * 0.44, r * 0.13, hy + r * 0.34);
    ctx.strokeStyle = "#2b1b17";
    ctx.stroke();
    for (const sx of [-1, 1]) {
      if (o.wave > 0) {
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.38 - r * 0.11, hy + r * 0.03);
        ctx.quadraticCurveTo(sx * r * 0.38, hy - r * 0.14, sx * r * 0.38 + r * 0.11, hy + r * 0.03);
        ctx.lineWidth = r * 0.07;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
      } else if (o.blink) {
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.38 - r * 0.1, hy);
        ctx.lineTo(sx * r * 0.38 + r * 0.1, hy);
        ctx.lineWidth = r * 0.07;
        ctx.stroke();
      } else {
        ell(sx * r * 0.38, hy - r * 0.02, r * 0.1, r * 0.12, "#2b1b17");
        ell(sx * r * 0.38 + r * 0.035, hy - r * 0.07, r * 0.035, r * 0.035, "#fff");
      }
      ell(sx * r * 0.62, hy + r * 0.24, r * 0.16, r * 0.09, "rgba(255,115,135,0.45)");
    }
    if (o.hat) {
      roundRect(-r * 0.55, hy - r * 1.02, r * 1.1, r * 0.28, r * 0.1, "#fffaf2");
      rect(-r * 0.55, hy - r * 0.84, r * 1.1, r * 0.1, "#2d3b6b");
      rect(-r * 0.7, hy - r * 0.76, r * 1.4, r * 0.1, "#1f2a4f");
    }

    // front arm (waves when tapped)
    ctx.strokeStyle = shade(col, -0.55);
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.save();
    if (o.wave > 0) {
      ctx.translate(r * 0.62, -r * 1.05 + (o.sit ? r * 0.12 : 0));
      ctx.rotate(0.45 + Math.sin(t * 14) * 0.4);
      blob(0, -r * 0.3, r * 0.18, r * 0.32, col);
    } else {
      ctx.translate(r * 0.5, -r * 0.98 + (o.sit ? r * 0.1 : 0));
      ctx.rotate(0.35 + step * 0.3);
      blob(0, r * 0.26, r * 0.17, r * 0.29, col);
    }
    ctx.restore();

    ctx.restore();
  }

  // ---------- boats ----------
  const boats = [];
  const HULLS = ["#2d3b6b", "#b8463f", "#f4ece6", "#2f6f73", "#e9b04a"];

  function spawnBoat(opts = {}) {
    if (boats.length >= 12) return;
    const lane = opts.lane ?? Math.floor(rand() * LANES.length);
    const { y, s } = LANES[lane];
    const roll = rand();
    const type = opts.type || (roll < 0.5 ? "sail" : roll < 0.75 ? "motor" : "yacht");
    const dir = opts.dir ?? (rand() < 0.5 ? 1 : -1);
    const len = type === "yacht" ? 110 : 70;
    const base = type === "motor" ? 60 : type === "yacht" ? 26 : 20;
    boats.push({
      type, lane, y, s, dir,
      x: opts.x ?? (dir > 0 ? -len * s : VW + len * s),
      speed: base * (0.8 + rand() * 0.4) * Math.max(0.45, s),
      hull: HULLS[Math.floor(rand() * HULLS.length)],
      flag: ["#e85d75", "#f2c14e", "#5fb3b3"][Math.floor(rand() * 3)],
      captain: type !== "yacht" && rand() < 0.6 ? ["#8b5a3c", "#d69b55", "#f3e6d0", "#9b8f88"][Math.floor(rand() * 4)] : null,
      ph: rand() * TAU,
      fade: opts.x !== undefined ? 0 : 1,
    });
  }

  function updateBoats(dt) {
    for (const b of boats) {
      b.x += b.dir * b.speed * dt;
      b.fade = Math.min(1, b.fade + dt * 1.6);
    }
    for (let i = boats.length - 1; i >= 0; i--) {
      const b = boats[i];
      if ((b.dir > 0 && b.x > VW + 160 * b.s) || (b.dir < 0 && b.x < -160 * b.s)) boats.splice(i, 1);
    }
  }

  function drawWake(b) {
    const fast = b.type === "motor";
    for (let k = 0; k < 7; k++) {
      const a = (fast ? 0.5 : 0.32) * (1 - k / 7);
      const x0 = (b.type === "yacht" ? -88 : -50) - k * (fast ? 26 : 18);
      const wob = Math.sin(t * 3 + k + b.ph) * 2;
      ctx.strokeStyle = `rgba(255,236,228,${a})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x0, 8 + wob * 0.3);
      ctx.lineTo(x0 - 14 - k * 3, 8 + k * 1.2 + wob * 0.2);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,236,228,0.35)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-60, 10);
    ctx.lineTo(70, 10);
    ctx.stroke();
  }

  function sailGrad() {
    const g = ctx.createLinearGradient(-50, -110, 40, 0);
    g.addColorStop(0, "#fff4e6");
    g.addColorStop(1, "#f7b7a0");
    return g;
  }

  function drawBoat(b) {
    const bob = Math.sin(t * 1.6 + b.ph) * 1.6 * b.s;
    ctx.save();
    ctx.globalAlpha = b.fade;
    ctx.translate(b.x, b.y);
    ctx.scale(b.dir * b.s, b.s);
    drawWake(b);
    // soft reflection under the hull
    ell(0, 13, b.type === "yacht" ? 95 : 55, 5, "rgba(40,20,60,0.25)");
    ctx.translate(0, bob / b.s);
    ctx.rotate(Math.sin(t * 1.3 + b.ph) * 0.025);

    if (b.type === "sail") {
      rect(-2, -118, 3, 112, "#3a2a3a");
      ctx.beginPath();
      ctx.moveTo(-3, -112);
      ctx.quadraticCurveTo(-30, -55, -50, -14);
      ctx.lineTo(-3, -14);
      ctx.fillStyle = sailGrad();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(3, -104);
      ctx.quadraticCurveTo(30, -50, 46, -12);
      ctx.lineTo(3, -12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(1, -118);
      ctx.lineTo(16, -114 + Math.sin(t * 6 + b.ph) * 1.5);
      ctx.lineTo(1, -110);
      ctx.fillStyle = b.flag;
      ctx.fill();
      if (b.captain) drawBear(-26, -6, 8, b.captain, { hat: true, noShadow: true });
      ctx.beginPath();
      ctx.moveTo(-54, -8);
      ctx.lineTo(58, -8);
      ctx.quadraticCurveTo(48, 8, 30, 9);
      ctx.lineTo(-40, 9);
      ctx.quadraticCurveTo(-50, 4, -54, -8);
      ctx.fillStyle = b.hull;
      ctx.fill();
      rect(-50, -5, 104, 2.5, "rgba(255,255,255,0.7)");
    } else if (b.type === "motor") {
      ctx.beginPath();
      ctx.moveTo(-30, -10);
      ctx.lineTo(-24, -24);
      ctx.lineTo(8, -24);
      ctx.lineTo(26, -10);
      ctx.fillStyle = "#ece2dc";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(10, -22);
      ctx.lineTo(24, -11);
      ctx.lineTo(10, -11);
      ctx.fillStyle = "rgba(110,150,200,0.8)";
      ctx.fill();
      if (b.captain) drawBear(-8, -10, 7, b.captain, { noShadow: true });
      ctx.beginPath();
      ctx.moveTo(-62, -10);
      ctx.lineTo(40, -10);
      ctx.lineTo(68, -4);
      ctx.quadraticCurveTo(50, 8, 30, 8);
      ctx.lineTo(-60, 8);
      ctx.closePath();
      ctx.fillStyle = "#f6eee8";
      ctx.fill();
      rect(-60, -2, 116, 3, b.hull === "#f4ece6" ? "#b8463f" : b.hull);
      // spray
      for (let i = 0; i < 5; i++) {
        const k = (t * 2 + i / 5 + b.ph) % 1;
        ell(-64 - k * 22, 4 - Math.sin(k * Math.PI) * 9, 3 * (1 - k) + 1, 2 * (1 - k) + 1, `rgba(255,240,235,${0.7 * (1 - k)})`);
      }
    } else {
      // yacht
      rect(-1, -74, 2, 28, "#d9cfd0");
      roundRect(-50, -48, 70, 16, 4, "#f2ebe6");
      rect(-44, -44, 56, 6, lightsGlow(0.9));
      roundRect(-78, -32, 124, 20, 5, "#f8f2ee");
      rect(-70, -26, 104, 7, lightsGlow(1));
      ctx.beginPath();
      ctx.moveTo(-92, -14);
      ctx.lineTo(72, -14);
      ctx.lineTo(104, -6);
      ctx.quadraticCurveTo(84, 10, 56, 10);
      ctx.lineTo(-90, 10);
      ctx.closePath();
      ctx.fillStyle = "#fbf6f2";
      ctx.fill();
      rect(-90, -1, 170, 3, "#2d3b6b");
    }
    ctx.restore();
  }
  function lightsGlow(a) {
    return `rgba(255,${200 + Math.round(Math.sin(t * 2) * 6)},130,${a})`;
  }

  // ---------- particles ----------
  const particles = [];
  function heart(x, y, s, a) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 3);
    ctx.bezierCurveTo(-7, -2, -4, -9, 0, -5);
    ctx.bezierCurveTo(4, -9, 7, -2, 0, 3);
    ctx.fillStyle = `rgba(255,105,140,${a})`;
    ctx.fill();
    ctx.restore();
  }

  // ---------- scene layers ----------
  function drawSky() {
    const g = ctx.createLinearGradient(0, TOP, 0, SEA);
    g.addColorStop(0, "#1d1a48");
    g.addColorStop(0.3, "#46336f");
    g.addColorStop(0.55, "#a2467a");
    g.addColorStop(0.76, "#ec7868");
    g.addColorStop(0.9, "#fbb16a");
    g.addColorStop(1, "#ffdc9c");
    rect(0, TOP, VW, SEA - TOP + 1, g);

    for (const s of L.stars) {
      const a = 0.35 + 0.35 * Math.sin(t * 1.5 + s.ph);
      ell(s.x, s.y, s.s, s.s, `rgba(255,240,255,${a})`);
    }

    // sun glow + disc
    const glow = ctx.createRadialGradient(L.sunX, L.sunY, 10, L.sunX, L.sunY, 360);
    glow.addColorStop(0, "rgba(255,220,150,0.65)");
    glow.addColorStop(0.35, "rgba(255,160,110,0.22)");
    glow.addColorStop(1, "rgba(255,140,120,0)");
    rect(0, TOP, VW, SEA - TOP, glow);
    const sg = ctx.createLinearGradient(0, L.sunY - 56, 0, L.sunY + 56);
    sg.addColorStop(0, "#fff4c8");
    sg.addColorStop(1, "#ff9f55");
    ell(L.sunX, L.sunY, 56, 56, sg);

    // clouds
    for (const c of L.clouds) {
      const x = ((c.x + t * c.sp) % (VW + 500)) - 250;
      ell(x, c.y, c.w * 0.5, c.h, "rgba(170,80,130,0.45)");
      ell(x + c.w * 0.08, c.y + c.h * 0.35, c.w * 0.42, c.h * 0.55, "rgba(255,170,140,0.55)");
      ell(x - c.w * 0.18, c.y - c.h * 0.25, c.w * 0.25, c.h * 0.7, "rgba(190,95,140,0.4)");
    }

    // islands on the horizon
    for (const i of L.islands) {
      ctx.beginPath();
      ctx.moveTo(i.x, SEA + 1);
      ctx.quadraticCurveTo(i.x + i.w * 0.3, SEA - i.h * 1.4, i.x + i.w * 0.55, SEA - i.h * 0.7);
      ctx.quadraticCurveTo(i.x + i.w * 0.8, SEA - i.h * 0.2, i.x + i.w, SEA + 1);
      ctx.fillStyle = "rgba(120,58,108,0.7)";
      ctx.fill();
    }
  }

  function drawSea() {
    const g = ctx.createLinearGradient(0, SEA, 0, BASE_H);
    g.addColorStop(0, "#f4ad8c");
    g.addColorStop(0.18, "#d4778a");
    g.addColorStop(0.55, "#664378");
    g.addColorStop(1, "#2a2750");
    rect(0, SEA, VW, BASE_H - SEA + 2, g);

    // sun's reflection: a shimmering broken column
    for (let y = SEA + 2; y < BASE_H; y += 5) {
      const k = (y - SEA) / (BASE_H - SEA);
      const w = (26 + k * 150) * (0.55 + 0.45 * Math.sin(t * 2.2 + y * 0.37));
      const a = 0.75 * (1 - k * 0.85);
      const off = Math.sin(t * 1.4 + y * 0.11) * 6 * k;
      ctx.fillStyle = `rgba(255,214,140,${a})`;
      ctx.fillRect(L.sunX - w / 2 + off, y, w * 0.45, 1.6 + k * 1.6);
      ctx.fillRect(L.sunX + w * 0.05 + off, y, w * 0.45, 1.6 + k * 1.6);
    }

    for (const d of L.dashes) {
      const a = 0.35 * (0.5 + 0.5 * Math.sin(t * d.sp * 1.5 + d.ph));
      const x = (d.x + Math.sin(t * 0.4 + d.ph) * 8 + VW) % VW;
      ctx.fillStyle = `rgba(255,220,210,${a})`;
      ctx.fillRect(x, d.y, d.len, 1.2 + (d.y - SEA) / 260);
    }
  }

  function drawCliff() {
    // rock body
    ctx.beginPath();
    ctx.moveTo(L.face[0][0], L.face[0][1]);
    for (const [x, y] of L.face) ctx.lineTo(x, y);
    for (const [x, y] of L.base) ctx.lineTo(x, y);
    ctx.lineTo(VW + 20, CB);
    ctx.lineTo(VW + 20, CT);
    ctx.closePath();
    const g = ctx.createLinearGradient(L.edge - 130, 0, L.edge + 260, 0);
    g.addColorStop(0, "#d97c5c");
    g.addColorStop(0.35, "#a5545a");
    g.addColorStop(1, "#5d3249");
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();
    const vg = ctx.createLinearGradient(0, CT, 0, CB);
    vg.addColorStop(0, "rgba(255,160,110,0.15)");
    vg.addColorStop(1, "rgba(40,20,55,0.45)");
    rect(0, CT, VW + 20, CB - CT + 20, vg);
    ctx.strokeStyle = "rgba(55,22,45,0.28)";
    ctx.lineWidth = 2;
    for (const line of L.strata) {
      ctx.beginPath();
      line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.restore();

    // sunlit edge on the face
    ctx.beginPath();
    L.face.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "rgba(255,190,130,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // grass cap
    ctx.beginPath();
    ctx.moveTo(L.edge - 8, CT + 4);
    ctx.quadraticCurveTo(L.edge - 4, CT - 6, L.edge + 10, CT - 4);
    ctx.lineTo(VW + 20, CT - 4);
    ctx.lineTo(VW + 20, CT + 10);
    ctx.lineTo(L.edge + 4, CT + 12);
    ctx.closePath();
    ctx.fillStyle = "#4b6438";
    ctx.fill();
    rect(L.edge, CT - 5, VW - L.edge + 20, 2.5, "#b9b45c");

    // rocks + foam at the waterline
    for (const r of L.rocks) {
      ell(r.x, r.y, r.w, r.h, "#6a3a4c");
      ell(r.x - r.w * 0.3, r.y - r.h * 0.4, r.w * 0.4, r.h * 0.35, "rgba(230,140,110,0.6)");
    }
    ctx.strokeStyle = "rgba(255,240,235,0.75)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    const fx = L.rocks[L.rocks.length - 1].x - 30;
    for (let x = fx; x < VW + 10; x += 15 + ((x * 7.3) % 14)) {
      const y = CB + 6 + Math.sin(x * 0.07 + t * 2.4) * 2.5;
      const len = 9 + Math.sin(x * 0.3 + t * 1.7) * 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y - 3, x + len, y);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  function interior(x, y, w, h) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (lightsOn) {
      g.addColorStop(0, "#ffd99a");
      g.addColorStop(1, "#f2a05c");
    } else {
      g.addColorStop(0, "#3d3958");
      g.addColorStop(1, "#2a2742");
    }
    rect(x, y, w, h, g);
  }
  function glassShine(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.13)";
    for (const o of [0.15, 0.55]) {
      ctx.beginPath();
      ctx.moveTo(x + w * o, y + h);
      ctx.lineTo(x + w * o + 18, y + h);
      ctx.lineTo(x + w * o + 18 + h * 0.6, y);
      ctx.lineTo(x + w * o + h * 0.6, y);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHouse() {
    const hx = L.hx;

    // ground floor: white concrete box
    const wallG = ctx.createLinearGradient(hx, 0, hx + 260, 0);
    wallG.addColorStop(0, "#fbe6d6");
    wallG.addColorStop(1, "#cdb6b4");
    rect(hx, 262, 260, CT - 262, wallG);
    // floor-to-ceiling glass
    const gx = hx + 10, gy = 272, gw = 146, gh = CT - 272;
    interior(gx, gy, gw, gh);
    if (lightsOn) {
      // pendant lamp, sofa, plant
      rect(gx + 70, gy, 1.5, 26, "#5a4040");
      ell(gx + 71, gy + 28, 10, 6, "#3b2b30");
      ell(gx + 71, gy + 34, 22, 8, "rgba(255,240,190,0.5)");
    }
    roundRect(gx + 34, gy + gh - 26, 74, 26, 6, lightsOn ? "#8e5b5b" : "#2f2a40");
    roundRect(gx + 30, gy + gh - 34, 14, 34, 5, lightsOn ? "#7c4c4e" : "#2a2538");
    rect(gx + 126, gy + gh - 16, 12, 16, lightsOn ? "#b06a43" : "#2a2538");
    ell(gx + 132, gy + gh - 28, 10, 14, lightsOn ? "#4f7a48" : "#252a35");
    glassShine(gx, gy, gw, gh);
    ctx.fillStyle = "#2a2430";
    for (let i = 0; i <= 3; i++) ctx.fillRect(gx + (gw / 3) * i - 1.5, gy, 3, gh);
    ctx.fillRect(gx, gy - 2, gw, 3);
    // wood slat section
    rect(hx + 166, 272, 94, CT - 272, "#9b6644");
    ctx.fillStyle = "rgba(60,30,25,0.45)";
    for (let x = hx + 170; x < hx + 260; x += 7) ctx.fillRect(x, 272, 2, CT - 272);
    rect(hx + 166, 272, 94, 3, "rgba(255,200,150,0.35)");
    // roof cap of the ground floor (right of the upper box)
    rect(hx + 180, 254, 90, 8, "#efe2d6");

    // upper floor: dark cantilevered box over the deck
    const ux = hx - 92, uw = 284;
    rect(ux, 172, uw, 90, "#2f2b38");
    rect(ux, 172, 3, 90, "rgba(255,170,110,0.4)");
    const wx = ux + 12, wy = 184, ww = 228, wh = 70;
    interior(wx, wy, ww, wh);
    if (lightsOn) {
      roundRect(wx + 170, wy + 14, 26, 20, 2, "#c9705a"); // painting
      roundRect(wx + 173, wy + 17, 20, 14, 2, "#f6c47a");
      ell(wx + 30, wy + 34, 9, 7, "rgba(255,245,200,0.9)"); // lamp
      rect(wx + 29, wy + 40, 2, wh - 40, "#5a4040");
    }
    const up = bears.find((b) => b.zone === "upstairs");
    renderBear(up);
    if (!lightsOn) rect(wx, wy, ww, wh, "rgba(25,20,45,0.45)");
    glassShine(wx, wy, ww, wh);
    ctx.fillStyle = "#1e1a24";
    ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    ctx.fillRect(wx, wy + wh - 2, ww, 4);
    // thin roof slab
    rect(ux - 10, 164, uw + 20, 9, "#f1e5da");
    rect(ux - 10, 164, uw + 20, 2, "rgba(255,210,170,0.8)");
    rect(ux, 262, 92, 4, "#24202c"); // soffit

    // soffit downlights
    for (const lx of [ux + 18, ux + 46, ux + 74]) {
      if (lightsOn) {
        const cg = ctx.createLinearGradient(0, 266, 0, CT);
        cg.addColorStop(0, "rgba(255,220,160,0.35)");
        cg.addColorStop(1, "rgba(255,220,160,0)");
        ctx.beginPath();
        ctx.moveTo(lx - 3, 266);
        ctx.lineTo(lx + 3, 266);
        ctx.lineTo(lx + 16, CT);
        ctx.lineTo(lx - 16, CT);
        ctx.fillStyle = cg;
        ctx.fill();
      }
      ell(lx, 266, 3, 1.6, lightsOn ? "#fff1c8" : "#5a5560");
    }
  }

  function drawDeck() {
    const dl = L.deckL, dr = L.hx;
    rect(dl, CT - 6, dr - dl, 8, "#7a4f36");
    rect(dl, CT - 6, dr - dl, 2, "#d6955e");

    // fire pit
    const fx = dl + 24;
    const fl = 1 + Math.sin(t * 9) * 0.08 + Math.sin(t * 13.7) * 0.06;
    const glow = ctx.createRadialGradient(fx, CT - 18, 2, fx, CT - 18, 60);
    glow.addColorStop(0, "rgba(255,170,80,0.45)");
    glow.addColorStop(1, "rgba(255,140,60,0)");
    rect(fx - 60, CT - 80, 120, 80, glow);
    for (const [ox, h, c] of [[-5, 16, "#ff8a3d"], [5, 13, "#ff8a3d"], [0, 20, "#ffb347"], [0, 11, "#fff0a0"]]) {
      ctx.beginPath();
      ctx.moveTo(fx + ox - 5, CT - 16);
      ctx.quadraticCurveTo(fx + ox - 4, CT - 16 - h * fl * 0.6, fx + ox + Math.sin(t * 8 + ox) * 1.5, CT - 16 - h * fl);
      ctx.quadraticCurveTo(fx + ox + 4, CT - 16 - h * fl * 0.6, fx + ox + 5, CT - 16);
      ctx.fillStyle = c;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(fx - 16, CT - 17);
    ctx.lineTo(fx + 16, CT - 17);
    ctx.lineTo(fx + 10, CT - 6);
    ctx.lineTo(fx - 10, CT - 6);
    ctx.fillStyle = "#3a3038";
    ctx.fill();
  }

  function drawRailing() {
    const dl = L.deckL, dr = L.hx;
    rect(dl, CT - 40, dr - dl, 34, "rgba(200,230,255,0.14)");
    rect(dl, CT - 41, dr - dl, 2.5, "#2a2430");
    rect(dl, CT - 41, 2.5, 35, "#2a2430");
    ctx.save();
    ctx.globalAlpha = 0.5;
    glassShine(dl, CT - 40, dr - dl, 34);
    ctx.restore();
  }

  function drawTree() {
    const x = L.treeX;
    if (x > VW - 30) return;
    ctx.fillStyle = "#4a2f2a";
    ctx.beginPath();
    ctx.moveTo(x - 5, CT);
    ctx.quadraticCurveTo(x - 2, CT - 60, x - 18, CT - 120);
    ctx.lineTo(x - 12, CT - 120);
    ctx.quadraticCurveTo(x + 6, CT - 60, x + 5, CT);
    ctx.fill();
    // windswept foliage leaning toward the sea
    const sway = Math.sin(t * 0.9) * 2;
    for (const [ox, oy, rx, ry] of [[-22, -128, 46, 18], [-6, -100, 38, 15], [-34, -150, 32, 13], [4, -76, 28, 12]]) {
      ell(x + ox + sway, CT + oy, rx, ry, "#3c5236");
      ell(x + ox + sway - rx * 0.3, CT + oy - ry * 0.3, rx * 0.6, ry * 0.55, "rgba(230,150,90,0.35)");
    }
    // a few grass tufts
    ctx.strokeStyle = "#6f8a45";
    ctx.lineWidth = 1.5;
    for (let gx = L.hx + 270; gx < VW - 10; gx += 37) {
      ctx.beginPath();
      ctx.moveTo(gx, CT - 3);
      ctx.lineTo(gx - 3, CT - 10);
      ctx.moveTo(gx + 3, CT - 3);
      ctx.lineTo(gx + 5, CT - 11);
      ctx.stroke();
    }
  }

  const birds = Array.from({ length: 5 }, (_, i) => ({ x: rand() * 1600, y: 200 + rand() * 180, sp: 18 + rand() * 14, ph: rand() * TAU, s: 0.6 + rand() * 0.6 }));
  function drawBirds(dt) {
    ctx.strokeStyle = "rgba(60,25,55,0.75)";
    ctx.lineWidth = 1.6;
    for (const b of birds) {
      b.x += b.sp * dt;
      if (b.x > VW + 40) { b.x = -40; b.y = 180 + rand() * 200; }
      const f = Math.sin(t * 7 + b.ph) * 4 * b.s;
      ctx.beginPath();
      ctx.moveTo(b.x - 8 * b.s, b.y - f);
      ctx.quadraticCurveTo(b.x - 3 * b.s, b.y - 3 * b.s, b.x, b.y);
      ctx.quadraticCurveTo(b.x + 3 * b.s, b.y - 3 * b.s, b.x + 8 * b.s, b.y - f);
      ctx.stroke();
    }
  }

  function renderBear(b) {
    if (!b.visible) return;
    const p = bearPos(b);
    drawBear(p.x, p.y, b.r, b.col, { flip: b.flip, sit: b.sit, walking: b.walking, walkPh: b.walkPh, wave: b.wave, blink: b.blink > 0 });
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(VW / 2, TOP + VH * 0.55, Math.min(VW, VH) * 0.4, VW / 2, TOP + VH * 0.55, Math.max(VW, VH) * 0.8);
    g.addColorStop(0, "rgba(40,15,50,0)");
    g.addColorStop(1, "rgba(40,15,50,0.35)");
    rect(0, TOP, VW, VH, g);
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    for (const b of bears) updateBear(b, dt);
    updateBoats(dt);
    nextBoat -= dt;
    if (nextBoat <= 0) { spawnBoat(); nextBoat = 4 + rand() * 6; }

    ctx.setTransform(S * DPR, 0, 0, S * DPR, 0, (H - BASE_H * S) * DPR);
    drawSky();
    drawBirds(dt);
    drawSea();
    const sorted = boats.slice().sort((a, b) => a.y - b.y);
    for (const b of sorted) if (b.y < CB) drawBoat(b);
    drawCliff();
    drawHouse();
    drawDeck();
    for (const b of bears) if (b.zone === "deck" || b.zone === "deckSit") renderBear(b);
    drawRailing();
    drawTree();
    renderBear(bears.find((b) => b.zone === "lawn"));
    for (const b of sorted) if (b.y >= CB) drawBoat(b);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.y += p.vy * dt;
      p.x += Math.sin(t * 4 + p.ph) * 0.3;
      const a = Math.min(1, p.life);
      if (p.kind === "heart") heart(p.x, p.y, p.s, a);
      else if (p.kind === "ring") {
        const k = 1 - p.life / p.max;
        ctx.strokeStyle = `rgba(255,240,235,${0.8 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 10 + k * 60, 3 + k * 14, 0, 0, TAU);
        ctx.stroke();
      } else {
        ctx.font = "600 13px Fredoka, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(255,244,230,${a})`;
        ctx.fillText(p.text, p.x, p.y);
      }
    }
    drawVignette();
    requestAnimationFrame(frame);
  }

  // ---------- interaction ----------
  canvas.addEventListener("pointerdown", (e) => {
    const wx = e.clientX / S;
    const wy = (e.clientY - (H - BASE_H * S)) / S;

    for (const b of bears) {
      if (!b.visible) continue;
      const p = bearPos(b);
      if (Math.hypot(wx - p.x, wy - (p.y - b.r * 1.6)) < b.r * 1.9) {
        b.wave = 1.6;
        b.pause = Math.max(b.pause, 1.6);
        for (let i = 0; i < 3; i++) {
          particles.push({ kind: "heart", x: p.x + (rand() - 0.5) * 20, y: p.y - b.r * 3.2, vy: -24 - rand() * 18, s: 1 + rand() * 0.5, life: 1.4 + i * 0.25, ph: rand() * TAU });
        }
        particles.push({ kind: "text", text: b.name, x: p.x, y: p.y - b.r * 4.6, vy: -14, life: 1.8, ph: 0 });
        return;
      }
    }

    if (wx > L.hx - 102 && wx < L.hx + 270 && wy > 160 && wy < CT) {
      lightsOn = !lightsOn;
      return;
    }

    if (wy > SEA + 8 && !(wx > L.face[L.face.length - 1][0] && wy < CB)) {
      // pick the nearest lane and float a boat in right where you tapped
      let lane = 0;
      LANES.forEach((l, i) => { if (Math.abs(l.y - wy) < Math.abs(LANES[lane].y - wy)) lane = i; });
      const ly = LANES[lane].y;
      particles.push({ kind: "ring", x: wx, y: ly + 8, vy: 0, life: 0.9, max: 0.9, ph: 0 });
      spawnBoat({ lane, x: wx, dir: wx < VW / 2 ? 1 : -1 });
    }
  });

  window.addEventListener("resize", resize);
  resize();
  let nextBoat = 3;
  // start with a few boats already out on the water
  spawnBoat({ lane: 0, type: "sail", x: VW * 0.15, dir: 1 });
  spawnBoat({ lane: 2, type: "sail", x: VW * 0.3, dir: -1 });
  spawnBoat({ lane: 1, type: "yacht", x: VW * 0.05, dir: 1 });
  spawnBoat({ lane: 3, type: "motor", x: VW * 0.6, dir: -1 });
  for (const b of boats) b.fade = 1;
  requestAnimationFrame(frame);
})();
