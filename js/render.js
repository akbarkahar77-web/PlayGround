// THE HOLLOW — all canvas rendering
import { TAU, clamp, lerp } from './config.js';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);
const TAU2 = Math.PI * 2;

function fitCanvas(canvas) {
  const dpr = DPR();
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h, dpr };
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}

function diamond(ctx, x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
}

// ══════════════════════════════════════════════════════════════
// GAME RENDER
// ══════════════════════════════════════════════════════════════
export function renderGame(g, dt) {
  if (!g.world) return;
  const { ctx, w, h, dpr } = fitCanvas(g.gameCanvas);
  g.viewW = w; g.viewH = h;
  const focus = g.getFocus();
  if (!focus) return;

  const narrow = w < 620;
  const zoom = clamp(Math.min(w / (narrow ? 690 : 1600), h / (narrow ? 1320 : 940)), .48, 1.07);
  g.zoom = zoom;

  const viewW = w / zoom, viewH = h / zoom;
  const camTargetX = focus.x + (focus.vx || 0) * .08;
  const camTargetY = focus.y + (focus.vy || 0) * .08;
  if (!g.cam.init) { g.cam.x = camTargetX; g.cam.y = camTargetY; g.cam.init = true; }
  const smooth = 1 - Math.exp(-dt * 7);
  g.cam.x = lerp(g.cam.x, camTargetX, smooth);
  g.cam.y = lerp(g.cam.y, camTargetY, smooth);
  g.cam.x = viewW > g.world.W ? g.world.W / 2 : clamp(g.cam.x, viewW / 2, g.world.W - viewW / 2);
  g.cam.y = viewH > g.world.H ? g.world.H / 2 : clamp(g.cam.y, viewH / 2, g.world.H - viewH / 2);

  const sh = g.shake > 0 ? g.shake : 0;
  const shx = sh ? Math.sin(g.time * 71) * sh * 7 : 0;
  const shy = sh ? Math.cos(g.time * 57) * sh * 5 : 0;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 + shx, h / 2 + shy);
  ctx.scale(zoom, zoom);
  ctx.translate(-g.cam.x, -g.cam.y);

  // Terrain
  ctx.drawImage(g.world.canvas, 0, 0);

  // Ambient lamp halos in world
  for (const l of g.world.lamps) {
    if (Math.abs(l.x - g.cam.x) > viewW * .65 || Math.abs(l.y - g.cam.y) > viewH * .65) continue;
    const fl = 0.82 + Math.sin(g.time * 3.1 + l.flicker) * .09 + Math.sin(g.time * 11.7 + l.flicker * 2) * .035;
    const lg = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 120);
    lg.addColorStop(0, `rgba(235,185,104,${.23 * fl})`);
    lg.addColorStop(.3, `rgba(220,158,82,${.08 * fl})`);
    lg.addColorStop(1, 'rgba(220,158,82,0)');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(l.x, l.y, 120, 0, TAU2); ctx.fill();
  }

  drawExits(ctx, g);
  drawPallets(ctx, g);
  drawGenerators(ctx, g);
  drawGroundParticles(ctx, g);
  drawDeadBodies(ctx, g);
  for (const s of g.survivors) if (s.state !== 'dead') drawSurvivor(ctx, g, s);
  drawKiller(ctx, g);
  drawFrontParticles(ctx, g);
  drawWorldLabels(ctx, g);

  ctx.restore();

  // Fog of war
  drawFog(g, ctx, w, h, focus, zoom, dt);

  // Screen-space objective markers, visible through the fog.
  drawAuras(ctx, g, w, h, zoom);

  // Lamp bloom over the fog.
  drawLampBloom(ctx, g, w, h, zoom, viewW, viewH);

  // Flashlight cone and rain.
  drawFlashlight(ctx, g, w, h, focus, zoom);
  drawWeather(ctx, g, w, h, dt);
  drawScreenEdgeMarkers(ctx, g, w, h, zoom, focus);

  // Crosshair world projection for the killer.
  if (g.role === 'killer' && g.input.mouseActive) {
    // The DOM crosshair does the work; subtle target highlight only.
    const mx = g.input.mouseX, my = g.input.mouseY;
    const wx = (mx - w / 2) / zoom + g.cam.x, wy = (my - h / 2) / zoom + g.cam.y;
    for (const s of g.survivors) {
      if (s.state === 'dead' || s.state === 'escaped') continue;
      const sx = (s.x - g.cam.x) * zoom + w / 2, sy = (s.y - g.cam.y) * zoom + h / 2;
      if (Math.hypot(sx - mx, sy - my) < 48 && Math.hypot(wx - s.x, wy - s.y) < 130) {
        ctx.strokeStyle = 'rgba(230,92,76,.72)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(sx, sy, 24, 0, TAU2); ctx.stroke();
      }
    }
  }

  // Damage/terror chromatic edge in canvas (subtle).
  if (g.danger > .2) {
    const a = (g.danger - .2) * .26;
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .22, w / 2, h / 2, Math.max(w, h) * .66);
    vg.addColorStop(0, 'rgba(100,8,8,0)');
    vg.addColorStop(.78, `rgba(100,8,8,${a * .5})`);
    vg.addColorStop(1, `rgba(127,10,8,${a})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }
}

function drawFog(g, ctx, w, h, focus, zoom, dt) {
  if (!g.fogCanvas) g.fogCanvas = document.createElement('canvas');
  if (g.fogCanvas.width !== Math.round(w) || g.fogCanvas.height !== Math.round(h)) {
    g.fogCanvas.width = Math.round(w); g.fogCanvas.height = Math.round(h);
  }
  const f = g.fogCanvas.getContext('2d');
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.clearRect(0, 0, w, h);
  f.fillStyle = 'rgba(2,6,8,.87)';
  f.fillRect(0, 0, w, h);

  const px = (focus.x - g.cam.x) * zoom + w / 2;
  const py = (focus.y - g.cam.y) * zoom + h / 2;
  const isKiller = g.role === 'killer';
  const vision = isKiller ? 505 : 345 + (focus.def?.vision || 0);
  const r = vision * zoom;
  f.globalCompositeOperation = 'destination-out';

  const hole = (x, y, radius, strength = 1) => {
    const grad = f.createRadialGradient(x, y, radius * .08, x, y, radius);
    grad.addColorStop(0, `rgba(0,0,0,${strength})`);
    grad.addColorStop(.55, `rgba(0,0,0,${strength * .86})`);
    grad.addColorStop(.82, `rgba(0,0,0,${strength * .4})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = grad;
    f.beginPath(); f.arc(x, y, radius, 0, TAU2); f.fill();
  };
  hole(px, py, r, 1);

  if (!isKiller) {
    // Flashlight beam cuts a longer hole ahead of the survivor.
    const angle = focus.aim || focus.dir;
    const beam = 670 * zoom;
    f.save();
    f.beginPath(); f.moveTo(px, py);
    f.arc(px, py, beam, angle - .32, angle + .32);
    f.closePath(); f.clip();
    const grad = f.createRadialGradient(px, py, 8, px, py, beam);
    grad.addColorStop(0, 'rgba(0,0,0,.8)');
    grad.addColorStop(.48, 'rgba(0,0,0,.62)');
    grad.addColorStop(.86, 'rgba(0,0,0,.22)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = grad;
    f.fillRect(px - beam, py - beam, beam * 2, beam * 2);
    f.restore();
  } else {
    // The Warden has a lantern, so his clear radius falls off unevenly.
    hole(px - 40 * zoom, py + 15 * zoom, 220 * zoom, .3);
  }

  f.globalCompositeOperation = 'source-over';
  ctx.drawImage(g.fogCanvas, 0, 0, w, h);
}

function drawFlashlight(ctx, g, w, h, focus, zoom) {
  if (g.role !== 'survivor' || focus.state === 'dead') return;
  const px = (focus.x - g.cam.x) * zoom + w / 2;
  const py = (focus.y - g.cam.y) * zoom + h / 2;
  const angle = focus.aim || focus.dir;
  const range = 580 * zoom;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, range, angle - .3, angle + .3); ctx.closePath();
  const grad = ctx.createRadialGradient(px, py, 4, px, py, range);
  grad.addColorStop(0, 'rgba(245,224,177,.0)');
  grad.addColorStop(.16, 'rgba(245,224,177,.09)');
  grad.addColorStop(.58, 'rgba(236,212,162,.062)');
  grad.addColorStop(1, 'rgba(236,212,162,0)');
  ctx.fillStyle = grad;
  ctx.fill();
  // Lens flare at the point of origin.
  const lens = ctx.createRadialGradient(px, py, 0, px, py, 24 * zoom);
  lens.addColorStop(0, 'rgba(255,241,196,.16)'); lens.addColorStop(1, 'rgba(255,241,196,0)');
  ctx.fillStyle = lens; ctx.beginPath(); ctx.arc(px, py, 24 * zoom, 0, TAU2); ctx.fill();
  ctx.restore();
}

function drawLampBloom(ctx, g, w, h, zoom, viewW, viewH) {
  for (const l of g.world.lamps) {
    if (Math.abs(l.x - g.cam.x) > viewW * .65 || Math.abs(l.y - g.cam.y) > viewH * .65) continue;
    const sx = (l.x - g.cam.x) * zoom + w / 2, sy = (l.y - g.cam.y) * zoom + h / 2;
    const fl = .8 + Math.sin(g.time * 3.2 + l.flicker) * .12;
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createRadialGradient(sx, sy, 1, sx, sy, 120 * zoom);
    grad.addColorStop(0, `rgba(241,198,118,${.2 * fl})`);
    grad.addColorStop(.3, `rgba(224,167,84,${.07 * fl})`);
    grad.addColorStop(1, 'rgba(224,167,84,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, 120 * zoom, 0, TAU2); ctx.fill();
    ctx.restore();
  }
}

function drawWeather(ctx, g, w, h, dt) {
  // Fine drizzle and drifting mist.
  ctx.save();
  ctx.strokeStyle = 'rgba(183,209,201,.095)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of g.rain) {
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x - 2.2, r.y + r.len);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 5; i++) {
    const x = ((g.time * (5 + i * 2.1) + i * 431) % (w + 500)) - 250;
    const y = h * (.35 + i * .11) + Math.sin(g.time * .19 + i * 2) * h * .06;
    const rx = 220 + i * 55, ry = 46 + i * 10;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, rx);
    grad.addColorStop(0, 'rgba(171,198,188,.024)');
    grad.addColorStop(.6, 'rgba(171,198,188,.012)');
    grad.addColorStop(1, 'rgba(171,198,188,0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, rx, 0, TAU2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawAuras(ctx, g, w, h, zoom) {
  const focus = g.getFocus();
  if (!focus) return;
  const isKiller = g.role === 'killer';
  const toS = (x, y) => ({ x: (x - g.cam.x) * zoom + w / 2, y: (y - g.cam.y) * zoom + h / 2 });
  const fogR = isKiller ? 540 : 380;

  // Generators
  for (const gen of g.generators) {
    const d = Math.hypot(gen.x - focus.x, gen.y - focus.y);
    if (!isKiller && d > 1080) continue;
    const s = toS(gen.x, gen.y);
    if (s.x < -34 || s.y < -34 || s.x > w + 34 || s.y > h + 34) continue;
    const alpha = gen.done ? .7 : d < fogR ? .16 : .38;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = gen.done ? 'rgba(151,225,212,.9)' : 'rgba(120,170,162,.8)';
    ctx.fillStyle = gen.done ? 'rgba(107,188,173,.34)' : 'rgba(54,87,83,.28)';
    diamond(ctx, s.x, s.y - 28, 5.5); ctx.fill(); ctx.stroke();
    if (!gen.done && gen.progress > 0) {
      ctx.strokeStyle = 'rgba(213,162,74,.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(s.x, s.y - 28, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (gen.progress / 100)); ctx.stroke();
    }
    if (gen.done) {
      ctx.strokeStyle = 'rgba(149,224,209,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y - 28, 10.5, 0, TAU2); ctx.stroke();
    }
    ctx.restore();
  }

  // Exits
  for (const e of g.exits) {
    const s = toS(e.x, e.y);
    if (s.x < -40 || s.y < -40 || s.x > w + 40 || s.y > h + 40) continue;
    if (!e.powered && Math.hypot(e.x - focus.x, e.y - focus.y) > 550 && !isKiller) continue;
    const col = e.open ? 'rgba(126,214,190,.9)' : e.powered ? 'rgba(226,175,93,.9)' : 'rgba(116,137,130,.5)';
    ctx.save(); ctx.globalAlpha = e.open ? .9 : e.powered ? .7 : .3;
    ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.fillStyle = e.open ? 'rgba(86,172,154,.32)' : 'rgba(100,76,38,.18)';
    diamond(ctx, s.x, s.y, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.font = "600 7px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
    ctx.letterSpacing = '2px';
    ctx.fillText(e.open ? 'EXIT OPEN' : e.powered ? 'OPEN GATE' : 'GATE', s.x, s.y + 18);
    ctx.restore();
  }

  // Team auras
  if (!isKiller) {
    for (const s of g.survivors) {
      if (s === focus || s.state === 'escaped') continue;
      const d = Math.hypot(s.x - focus.x, s.y - focus.y);
      if (d > 1500) continue;
      const p = toS(s.x, s.y);
      if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) continue;
      const col = s.state === 'downed' ? 'rgba(224,105,88,.9)' : s.state === 'dead' ? 'rgba(105,105,105,.35)' : s.state === 'alive' ? 'rgba(149,183,173,.68)' : 'rgba(120,160,151,.4)';
      ctx.save(); ctx.globalAlpha = s.state === 'downed' ? .95 : .55;
      ctx.strokeStyle = col; ctx.fillStyle = col;
      diamond(ctx, p.x, p.y - 26, 4.5); ctx.fill();
      if (s.state === 'downed') {
        ctx.beginPath(); ctx.arc(p.x, p.y - 26, 11 + Math.sin(g.time * 5) * 2, 0, TAU2); ctx.stroke();
        ctx.font = "600 8px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
        ctx.fillText(s.short, p.x, p.y - 43);
      }
      ctx.restore();
    }
  } else {
    // Killer gets a short aura pulse on survivors revealed by Veil Sight.
    if (g.killer.sightTimer > 0) {
      for (const s of g.survivors) {
        if (s.state === 'dead' || s.state === 'escaped') continue;
        const p = toS(s.x, s.y);
        if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) continue;
        ctx.save(); ctx.globalAlpha = .8;
        ctx.strokeStyle = s.state === 'downed' ? 'rgba(238,104,85,.85)' : 'rgba(204,77,62,.7)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 22 + Math.sin(g.time * 4) * 2, 0, TAU2); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 30, 0, TAU2); ctx.globalAlpha = .3; ctx.stroke();
        ctx.restore();
      }
    }
  }
}

function drawScreenEdgeMarkers(ctx, g, w, h, zoom, focus) {
  if (g.role !== 'survivor') return;
  for (const e of g.exits) {
    if (!e.powered || e.open) continue;
    const sx = (e.x - g.cam.x) * zoom + w / 2, sy = (e.y - g.cam.y) * zoom + h / 2;
    if (sx > 35 && sx < w - 35 && sy > 35 && sy < h - 35) continue;
    const cx = w / 2, cy = h / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const rx = Math.min(w / 2 - 44, h / 2 - 44);
    const x = cx + Math.cos(a) * rx * 1.5, y = cy + Math.sin(a) * rx;
    const ax = clamp(x, 24, w - 24), ay = clamp(y, 62, h - 24);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = 'rgba(224,175,93,.66)';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 4); ctx.lineTo(0, 1); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalAlpha = .55; ctx.fillStyle = 'rgba(224,175,93,.9)'; ctx.font = "600 7px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center'; ctx.letterSpacing = '1px';
    ctx.fillText('GATE', ax, ay + 17); ctx.restore();
  }
}

// ── World object drawings ─────────────────────────────────────
function drawGenerators(ctx, g) {
  for (const gen of g.generators) {
    ctx.save();
    ctx.translate(gen.x, gen.y);
    // Aura on ground
    if (gen.done) {
      const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 82);
      glow.addColorStop(0, 'rgba(97,208,190,.17)'); glow.addColorStop(1, 'rgba(97,208,190,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 82, 0, TAU2); ctx.fill();
    } else if (gen.progress > 0) {
      const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 48);
      glow.addColorStop(0, 'rgba(228,159,67,.12)'); glow.addColorStop(1, 'rgba(228,159,67,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 48, 0, TAU2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.48)';
    ctx.beginPath(); ctx.ellipse(5, 8, 40, 24, .28, 0, TAU2); ctx.fill();

    if (gen.highlight) {
      const hp = .5 + Math.sin(g.time * 4) * .18;
      ctx.strokeStyle = `rgba(236,190,106,${hp})`; ctx.lineWidth = 1.4; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(0, 2, 52, 0, TAU2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Concrete pad
    ctx.fillStyle = '#202621';
    ctx.beginPath(); ctx.ellipse(0, 5, 43, 25, 0, 0, TAU2); ctx.fill();
    ctx.strokeStyle = 'rgba(139,149,130,.11)'; ctx.lineWidth = 1; ctx.stroke();

    // Main engine block
    const body = ctx.createLinearGradient(-24, -24, 26, 30);
    body.addColorStop(0, gen.done ? '#2a3b38' : '#333a35');
    body.addColorStop(.5, gen.done ? '#1e2c2a' : '#242a26');
    body.addColorStop(1, '#171c1a');
    ctx.fillStyle = body;
    rounded(ctx, -28, -22, 56, 46, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(124,140,124,.2)'; ctx.lineWidth = 1; ctx.stroke();

    // Coil cylinders
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === 1 ? (gen.done ? '#395b56' : '#4b4c3e') : '#2c342f';
      rounded(ctx, -21 + i * 15, -18, 10, 27, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(13,17,15,.6)'; ctx.lineWidth = 1;
      for (let y = -13; y < 6; y += 6) { ctx.beginPath(); ctx.moveTo(-21 + i * 15, y); ctx.lineTo(-11 + i * 15, y); ctx.stroke(); }
    }
    // Exhaust / vent
    ctx.fillStyle = '#161b18'; ctx.fillRect(8, 4, 13, 10);
    ctx.strokeStyle = 'rgba(148,157,138,.15)'; ctx.strokeRect(8.5, 4.5, 12, 9);
    // Warning label
    ctx.fillStyle = gen.done ? 'rgba(139,227,210,.65)' : 'rgba(218,166,77,.48)';
    ctx.font = "700 5px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
    ctx.fillText(gen.done ? 'ONLINE' : 'FUEL', 0, 20);

    // Status lights
    const blink = gen.done ? .8 + Math.sin(g.time * 2.4) * .2 : (Math.sin(g.time * 4 + gen.x) > .5 ? 1 : .25);
    ctx.fillStyle = gen.done ? `rgba(112,230,207,${blink})` : `rgba(232,112,75,${blink * .85})`;
    ctx.beginPath(); ctx.arc(-20, -25, 2.6, 0, TAU2); ctx.fill();
    if (gen.done) {
      ctx.strokeStyle = 'rgba(116,226,204,.45)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 2, 33 + Math.sin(g.time * 2) * 2, 0, TAU2); ctx.stroke();
      ctx.fillStyle = 'rgba(150,235,217,.14)';
      ctx.beginPath(); ctx.arc(0, 2, 34, 0, TAU2); ctx.fill();
    }

    // Progress ring
    if (!gen.done && gen.progress > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 2, 40, -Math.PI / 2, -Math.PI / 2 + TAU2); ctx.stroke();
      ctx.strokeStyle = 'rgba(224,170,80,.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 2, 40, -Math.PI / 2, -Math.PI / 2 + TAU2 * (gen.progress / 100)); ctx.stroke();
      ctx.fillStyle = 'rgba(231,220,195,.85)'; ctx.font = "600 8px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(gen.progress)}%`, 0, 54);
    }
    // Sparks
    if (!gen.done && gen.pulse > 0) {
      ctx.fillStyle = `rgba(239,181,89,${clamp(gen.pulse, 0, 1) * .6})`;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(-8 + i * 8, -26 - Math.sin(g.time * 20 + i) * 3, 1.2, 0, TAU2); ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawPallets(ctx, g) {
  for (const p of g.pallets) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.broken) {
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(0, 7, 27, 7, 0, 0, TAU2); ctx.fill();
      ctx.strokeStyle = '#4c3f2b'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = p.angle + i * 1.3 + 0.6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (14 + i * 3), Math.sin(a) * (5 + i)); ctx.stroke();
      }
      ctx.restore(); continue;
    }
    ctx.rotate(p.angle);
    if (!p.dropped) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath(); ctx.ellipse(4, 5, 25, 7, 0, 0, TAU2); ctx.fill();
      ctx.fillStyle = '#4a3a27';
      rounded(ctx, -28, -5, 56, 10, 2); ctx.fill();
      ctx.fillStyle = '#6b5437';
      rounded(ctx, -25, -4, 50, 3, 1); ctx.fill();
      ctx.strokeStyle = 'rgba(196,159,99,.22)'; ctx.lineWidth = 1;
      for (let i = -20; i <= 20; i += 13) { ctx.beginPath(); ctx.moveTo(i, -4); ctx.lineTo(i, 4); ctx.stroke(); }
      if (p.highlight) {
        ctx.strokeStyle = 'rgba(221,174,89,.56)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]);
        ctx.strokeRect(-31, -9, 62, 18); ctx.setLineDash([]);
      }
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      rounded(ctx, -36, -8, 72, 19, 2); ctx.fill();
      ctx.fillStyle = '#55422b';
      rounded(ctx, -34, -10, 68, 17, 2); ctx.fill();
      ctx.strokeStyle = '#765e3d'; ctx.lineWidth = 2;
      for (let i = -26; i <= 26; i += 13) {
        ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i, 6); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(201,167,105,.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-34, -7); ctx.lineTo(34, -7); ctx.stroke();
      if (p.breakProgress > 0) {
        ctx.strokeStyle = 'rgba(13,10,7,.8)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const xx = -20 + i * 14;
          ctx.beginPath(); ctx.moveTo(xx, -9); ctx.lineTo(xx + 4, -1); ctx.lineTo(xx - 2, 7); ctx.stroke();
        }
      }
      if (p.highlight) {
        ctx.strokeStyle = 'rgba(209,157,77,.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
        ctx.strokeRect(-37, -13, 74, 27); ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }
}

function drawExits(ctx, g) {
  for (const e of g.exits) {
    ctx.save(); ctx.translate(e.x, e.y);
    const side = e.side;
    const dir = side === 'west' ? 1 : -1;
    const col = e.open ? 'rgba(112,224,198,' : e.powered ? 'rgba(230,179,94,' : 'rgba(145,94,75,';
    // Ground warning strips
    ctx.save(); ctx.rotate(side === 'west' ? 0 : Math.PI);
    ctx.fillStyle = 'rgba(21,25,23,.7)';
    ctx.fillRect(-22, -125, 44, 250);
    ctx.strokeStyle = 'rgba(178,145,80,.12)'; ctx.lineWidth = 1;
    for (let y = -115; y < 115; y += 14) { ctx.beginPath(); ctx.moveTo(-22, y); ctx.lineTo(22, y); ctx.stroke(); }
    ctx.restore();

    // Pillars
    for (const oy of [-115, 105]) {
      ctx.fillStyle = '#242c28';
      ctx.fillRect(-18, oy, 36, 22);
      ctx.fillStyle = '#3b443b';
      ctx.fillRect(-18, oy, 36, 5);
      ctx.strokeStyle = 'rgba(146,159,138,.18)'; ctx.strokeRect(-18.5, oy + .5, 35, 21);
      ctx.fillStyle = e.open ? 'rgba(116,224,199,.82)' : e.powered ? 'rgba(239,187,99,.82)' : 'rgba(173,92,70,.58)';
      ctx.beginPath(); ctx.arc(0, oy + 11, 3, 0, TAU2); ctx.fill();
    }

    // Gate bars
    if (!e.open) {
      ctx.strokeStyle = col + '.6)'; ctx.lineWidth = 3;
      for (let i = 0; i < 9; i++) {
        const yy = -97 + i * 25;
        ctx.beginPath(); ctx.moveTo(-13, yy); ctx.lineTo(13, yy + 7); ctx.stroke();
      }
      ctx.strokeStyle = col + '.38)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-13, -97); ctx.lineTo(-13, 105); ctx.moveTo(13, -90); ctx.lineTo(13, 112); ctx.stroke();
      // faint barrier glow
      const glow = ctx.createLinearGradient(-18, 0, 18, 0);
      glow.addColorStop(0, e.powered ? 'rgba(234,177,83,.02)' : 'rgba(165,74,57,.02)');
      glow.addColorStop(.5, e.powered ? 'rgba(234,177,83,.13)' : 'rgba(165,74,57,.06)');
      glow.addColorStop(1, e.powered ? 'rgba(234,177,83,.02)' : 'rgba(165,74,57,.02)');
      ctx.fillStyle = glow; ctx.fillRect(-19, -108, 38, 228);
    } else {
      // open gate: curling mist and guide lights
      const glow = ctx.createLinearGradient(0, -120, 0, 120);
      glow.addColorStop(0, 'rgba(109,222,195,0)');
      glow.addColorStop(.5, 'rgba(109,222,195,.15)');
      glow.addColorStop(1, 'rgba(109,222,195,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(0, 0, 64, 135, 0, 0, TAU2); ctx.fill();
      ctx.strokeStyle = 'rgba(143,239,213,.42)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-34, -104); ctx.lineTo(-34, 104); ctx.moveTo(34, -104); ctx.lineTo(34, 104); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const yy = -70 + i * 46;
        ctx.fillStyle = `rgba(137,234,210,${.3 + Math.sin(g.time * 3 + i) * .18})`;
        ctx.beginPath(); ctx.moveTo(0, yy - 7); ctx.lineTo(7, yy + 4); ctx.lineTo(-7, yy + 4); ctx.closePath(); ctx.fill();
      }
    }

    // Progress / label
    if (e.powered && !e.open && e.progress > 0) {
      ctx.strokeStyle = 'rgba(226,174,83,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 46, -Math.PI / 2, -Math.PI / 2 + TAU2 * e.progress / 100); ctx.stroke();
      ctx.fillStyle = 'rgba(239,231,213,.9)'; ctx.font = "600 8px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(e.progress)}%`, 0, 3);
    }
    ctx.fillStyle = e.open ? 'rgba(142,237,213,.6)' : e.powered ? 'rgba(231,182,97,.62)' : 'rgba(151,132,99,.35)';
    ctx.font = "600 7px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center'; ctx.letterSpacing = '2px';
    const lx = e.side === 'west' ? 48 : -48;
    ctx.fillText(e.side === 'west' ? 'WEST GATE' : 'EAST GATE', lx, -128);
    if (e.highlight) {
      const hp = .42 + Math.sin(g.time * 4) * .18;
      ctx.strokeStyle = `rgba(232,186,104,${hp})`; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
      ctx.strokeRect(-24, -120, 48, 240);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function drawSurvivor(ctx, g, s) {
  if (s.state === 'escaped') return;
  ctx.save(); ctx.translate(s.x, s.y);
  if (s.state === 'dead') {
    ctx.rotate(s.dir + 1.2);
    ctx.globalAlpha = .55;
    ctx.fillStyle = 'rgba(83,18,17,.52)';
    ctx.beginPath(); ctx.ellipse(0, 2, 26, 17, 0, 0, TAU2); ctx.fill();
    ctx.fillStyle = s.def.shirt; ctx.beginPath(); ctx.ellipse(0, 0, 16, 7, 0, 0, TAU2); ctx.fill();
    ctx.fillStyle = s.def.skin; ctx.beginPath(); ctx.arc(11, 2, 5, 0, TAU2); ctx.fill();
    ctx.restore(); return;
  }
  const bob = Math.sin(s.bob || 0) * (s.moving ? 1.2 : .4);
  if (s.state === 'downed') {
    const pulse = .65 + Math.sin(g.time * 5 + s.index) * .18;
    ctx.fillStyle = 'rgba(97,13,12,.5)';
    ctx.beginPath(); ctx.ellipse(0, 4, 25, 16, .3, 0, TAU2); ctx.fill();
    ctx.strokeStyle = `rgba(211,74,60,${pulse * .65})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU2); ctx.stroke();
    ctx.rotate(s.dir + 1.1);
    ctx.fillStyle = s.def.pants; rounded(ctx, -20, -5, 30, 9, 4); ctx.fill();
    ctx.fillStyle = s.def.shirt; rounded(ctx, -8, -9, 23, 18, 6); ctx.fill();
    ctx.fillStyle = s.def.skin; ctx.beginPath(); ctx.arc(14, -1, 7, 0, TAU2); ctx.fill();
    ctx.fillStyle = s.def.hat; ctx.beginPath(); ctx.arc(14, -1, 7.5, Math.PI, TAU2); ctx.fill();
    ctx.fillStyle = 'rgba(152,35,29,.5)';
    ctx.beginPath(); ctx.ellipse(-2, 0, 8, 5, .3, 0, TAU2); ctx.fill();
    if (s === g.player) {
      ctx.strokeStyle = 'rgba(236,230,216,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 34 + Math.sin(g.time * 4) * 2, 0, TAU2); ctx.stroke();
    }
    ctx.restore(); return;
  }

  // Feet shadow
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.beginPath(); ctx.ellipse(2, 7, 21, 13, .1, 0, TAU2); ctx.fill();

  ctx.rotate(s.dir);
  ctx.translate(0, bob);
  const walk = Math.sin(s.bob || 0) * (s.moving ? 5 : 1);
  const run = s.sprinting ? 1 : 0;
  // legs
  ctx.fillStyle = s.def.pants;
  rounded(ctx, -14, -9 + walk * .5, 16, 7, 3); ctx.fill();
  rounded(ctx, -14, 2 - walk * .5, 16, 7, 3); ctx.fill();
  ctx.fillStyle = 'rgba(15,16,14,.8)';
  rounded(ctx, -14, -10 + walk * .5, 7, 8, 3); ctx.fill();
  rounded(ctx, -14, 2 - walk * .5, 7, 8, 3); ctx.fill();

  // torso
  const gg = ctx.createLinearGradient(-13, -12, 10, 12);
  gg.addColorStop(0, s.def.shirt);
  gg.addColorStop(1, '#202a28');
  ctx.fillStyle = gg;
  ctx.beginPath(); ctx.ellipse(-1, 0, 15, 13.5, 0, 0, TAU2); ctx.fill();
  ctx.strokeStyle = 'rgba(238,238,221,.13)'; ctx.lineWidth = 1; ctx.stroke();
  // backpack / shoulder
  ctx.fillStyle = 'rgba(25,32,30,.75)';
  rounded(ctx, -15, -7, 11, 14, 4); ctx.fill();
  // arms
  ctx.strokeStyle = s.def.shirt; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(5, -9); ctx.lineTo(14, -12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(5, 9); ctx.lineTo(15, 10); ctx.stroke();
  ctx.strokeStyle = s.def.skin; ctx.lineWidth = 3.2;
  ctx.beginPath(); ctx.moveTo(14, -12); ctx.lineTo(18, -10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15, 10); ctx.lineTo(19, 9); ctx.stroke();
  // flashlight
  ctx.fillStyle = '#1b211f'; rounded(ctx, 17, 7, 11, 5, 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,238,187,.8)'; ctx.beginPath(); ctx.arc(28, 9.5, 2.2, 0, TAU2); ctx.fill();
  const lg = ctx.createRadialGradient(28, 9.5, 0, 28, 9.5, 17);
  lg.addColorStop(0, 'rgba(251,232,178,.2)'); lg.addColorStop(1, 'rgba(251,232,178,0)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(28, 9.5, 17, 0, TAU2); ctx.fill();

  // head + hair
  ctx.fillStyle = s.def.skin; ctx.beginPath(); ctx.arc(7, 0, 7.6, 0, TAU2); ctx.fill();
  ctx.fillStyle = s.def.hat;
  ctx.beginPath(); ctx.arc(7.5, -.2, 7.7, Math.PI * 1.02, Math.PI * 1.95); ctx.fill();
  ctx.fillStyle = 'rgba(14,17,16,.55)';
  ctx.beginPath(); ctx.arc(-1, 0, 4.2, 0, TAU2); ctx.fill();
  // face hint
  ctx.fillStyle = 'rgba(247,224,196,.5)';
  ctx.beginPath(); ctx.arc(11, -2.4, 1.1, 0, TAU2); ctx.fill();
  ctx.beginPath(); ctx.arc(11, 2.5, .9, 0, TAU2); ctx.fill();

  if (s.injured) {
    ctx.strokeStyle = 'rgba(183,47,39,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(2, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(137,23,20,.7)'; ctx.beginPath(); ctx.arc(3, 8, 2.4, 0, TAU2); ctx.fill();
  }
  if (s.sprinting && run) {
    ctx.fillStyle = 'rgba(226,224,205,.08)';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath(); ctx.ellipse(-20 - i * 8, (i ? 4 : -4) + walk * .3, 5 + i * 3, 1.5, 0, 0, TAU2); ctx.fill();
    }
  }
  ctx.restore();

  // Player ring / teammate indicator
  if (s === g.player) {
    ctx.save(); ctx.translate(s.x, s.y);
    ctx.strokeStyle = 'rgba(238,228,208,.38)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.arc(0, 0, 24 + Math.sin(g.time * 2.4) * 1.2, 0, TAU2); ctx.stroke();
    ctx.setLineDash([]);
    // Direction chevron
    ctx.rotate(s.dir);
    ctx.fillStyle = 'rgba(239,226,192,.5)';
    ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(25, -4); ctx.lineTo(25, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawKiller(ctx, g) {
  const k = g.killer;
  ctx.save(); ctx.translate(k.x, k.y);
  const t = g.time;
  // Ominous ground aura
  const aura = ctx.createRadialGradient(0, 0, 5, 0, 0, 58);
  aura.addColorStop(0, 'rgba(130,21,18,.18)'); aura.addColorStop(.55, 'rgba(102,18,16,.075)'); aura.addColorStop(1, 'rgba(102,18,16,0)');
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, 58, 0, TAU2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.48)';
  ctx.beginPath(); ctx.ellipse(4, 10, 28, 17, .18, 0, TAU2); ctx.fill();

  ctx.rotate(k.face + (k.stunTimer > 0 ? Math.sin(t * 30) * .06 : 0));
  const stun = k.stunTimer > 0;
  // tattered coat tails
  ctx.fillStyle = '#141a19';
  ctx.beginPath();
  ctx.moveTo(-24, -15);
  ctx.quadraticCurveTo(-44, -10, -39, 0);
  ctx.quadraticCurveTo(-46, 8, -22, 14);
  ctx.quadraticCurveTo(-30, 6, -21, 2);
  ctx.quadraticCurveTo(-32, -5, -24, -15);
  ctx.fill();
  ctx.strokeStyle = 'rgba(106,123,112,.16)'; ctx.lineWidth = 1; ctx.stroke();
  // legs
  ctx.strokeStyle = '#101615'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-13, -14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(-13, 14); ctx.stroke();

  // body
  const body = ctx.createLinearGradient(-20, -20, 20, 20);
  body.addColorStop(0, '#29312e'); body.addColorStop(.55, '#161d1c'); body.addColorStop(1, '#0d1212');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(0, 0, 21, 18, 0, 0, TAU2); ctx.fill();
  ctx.strokeStyle = 'rgba(150,159,137,.16)'; ctx.lineWidth = 1; ctx.stroke();
  // shoulder ridges
  ctx.strokeStyle = 'rgba(126,139,120,.2)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 16, Math.PI * .55, Math.PI * 1.4); ctx.stroke();
  // head / mask
  ctx.fillStyle = '#d8d1bd';
  ctx.beginPath(); ctx.ellipse(10, 0, 8.8, 7.2, .1, 0, TAU2); ctx.fill();
  ctx.fillStyle = '#171d1b';
  ctx.beginPath(); ctx.ellipse(10.5, -2.8, 2.2, 1.5, -.2, 0, TAU2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10.5, 2.8, 2.2, 1.5, .2, 0, TAU2); ctx.fill();
  ctx.fillStyle = `rgba(237,84,66,${.75 + Math.sin(t * 7) * .2})`;
  ctx.beginPath(); ctx.arc(11.6, -2.8, .9, 0, TAU2); ctx.fill();
  ctx.beginPath(); ctx.arc(11.6, 2.8, .9, 0, TAU2); ctx.fill();
  // crown of antlers
  ctx.strokeStyle = '#434337'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(5, side * 5); ctx.quadraticCurveTo(-4, side * 15, -10, side * 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, side * 11); ctx.lineTo(-6, side * 19); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, side * 14); ctx.lineTo(2, side * 22); ctx.stroke();
  }
  // weapon arm
  const swing = k.attackAnim > 0 ? Math.sin((1 - k.attackAnim / .34) * Math.PI) : 0;
  ctx.save(); ctx.translate(12, -10); ctx.rotate(-.25 - swing * 1.6);
  ctx.strokeStyle = '#596059'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, -3); ctx.stroke();
  ctx.fillStyle = '#aab1a1';
  ctx.beginPath(); ctx.moveTo(14, -3); ctx.quadraticCurveTo(30, -11, 37, -3); ctx.quadraticCurveTo(27, 0, 20, 4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(220,224,204,.28)'; ctx.lineWidth = .8; ctx.stroke();
  ctx.restore();
  // lantern arm
  ctx.save(); ctx.translate(10, 12); ctx.rotate(.28);
  ctx.strokeStyle = '#5f6255'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(11, 1); ctx.stroke();
  ctx.fillStyle = '#c9a85b';
  ctx.beginPath(); ctx.arc(14, 2, 4.6, 0, TAU2); ctx.fill();
  const glow = ctx.createRadialGradient(14, 2, 1, 14, 2, 25);
  glow.addColorStop(0, 'rgba(242,198,100,.34)'); glow.addColorStop(1, 'rgba(242,198,100,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(14, 2, 25, 0, TAU2); ctx.fill();
  ctx.restore();

  if (stun) {
    ctx.strokeStyle = `rgba(222,190,120,${.45 + Math.sin(t * 18) * .2})`; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, 0, 25 + i * 4 + Math.sin(t * 6 + i) * 2, 0, TAU2); ctx.stroke();
    }
  }
  if (k.lungeTimer > 0) {
    ctx.strokeStyle = 'rgba(176,43,35,.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(-17, 0, 30, 13, 0, 0, TAU2); ctx.stroke();
  }
  ctx.restore();

  // attack arc
  if (k.attackAnim > 0) {
    const prog = 1 - k.attackAnim / .34;
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.face - .85 + prog * 1.7);
    ctx.strokeStyle = `rgba(220,226,208,${.22 * (1 - prog)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 82, -.55, .55); ctx.stroke();
    ctx.strokeStyle = `rgba(192,57,44,${.16 * (1 - prog)})`; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, 0, 82, -.55, .55); ctx.stroke();
    ctx.restore();
  }

  if (k === g.player) {
    ctx.save(); ctx.translate(k.x, k.y);
    ctx.strokeStyle = 'rgba(204,77,62,.24)'; ctx.lineWidth = 1;
    ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.arc(0, 0, 31 + Math.sin(g.time * 2.2) * 1.5, 0, TAU2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

function drawDeadBodies(ctx, g) {
  for (const s of g.survivors) if (s.state === 'dead') drawSurvivor(ctx, g, s);
}

function drawGroundParticles(ctx, g) {
  for (const p of g.particles) {
    if (p.front) continue;
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    if (p.kind === 'blood') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * (1.4 - a * .3), p.size * .7, p.rot || 0, 0, TAU2); ctx.fill();
    } else if (p.kind === 'dust' || p.kind === 'mist') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.8 - a * .8), 0, TAU2); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFrontParticles(ctx, g) {
  for (const p of g.particles) {
    if (!p.front) continue;
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    if (p.kind === 'spark') {
      ctx.strokeStyle = p.color; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .03, p.y - p.vy * .03); ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.4, p.size * a), 0, TAU2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawWorldLabels(ctx, g) {
  // Downed survivor labels are the most important.
  for (const s of g.survivors) {
    if (s.state !== 'downed') continue;
    const d = Math.hypot(s.x - g.getFocus().x, s.y - g.getFocus().y);
    if (d > 620) continue;
    ctx.save();
    ctx.font = "600 8px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center'; ctx.letterSpacing = '2px';
    ctx.fillStyle = 'rgba(231,191,177,.86)';
    ctx.fillText(`${s.short} DOWN`, s.x, s.y - 38);
    ctx.restore();
  }
  // Killer reveal halo if sight active (subtle world clue).
  if (g.role === 'killer' && g.killer.sightTimer > 0) {
    for (const s of g.survivors) {
      if (s.state === 'dead' || s.state === 'escaped') continue;
      ctx.save(); ctx.globalAlpha = .3; ctx.strokeStyle = 'rgba(206,78,62,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, 30 + Math.sin(g.time * 3) * 2, 0, TAU2); ctx.stroke(); ctx.restore();
    }
  }
}

// ── Minimap ───────────────────────────────────────────────────
export function renderMinimap(g) {
  if (!g.miniCanvas) return;
  const c = g.miniCanvas;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.clearRect(0, 0, w, h);
  const scale = Math.min(w / g.world.W, h / g.world.H);
  const ox = (w - g.world.W * scale) / 2, oy = (h - g.world.H * scale) / 2;
  ctx.save();
  ctx.globalAlpha = .56;
  ctx.drawImage(g.world.canvas, ox, oy, g.world.W * scale, g.world.H * scale);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = 'rgba(4,10,11,.34)'; ctx.fillRect(0, 0, w, h);
  const toM = (x, y) => ({ x: ox + x * scale, y: oy + y * scale });

  for (const gen of g.generators) {
    const p = toM(gen.x, gen.y);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gen.done ? 'rgba(145,228,211,.86)' : 'rgba(99,142,134,.65)';
    ctx.fillRect(-2, -2, 4, 4); ctx.restore();
  }
  for (const e of g.exits) {
    const p = toM(e.x, e.y);
    ctx.fillStyle = e.open ? 'rgba(149,238,212,.9)' : e.powered ? 'rgba(233,184,94,.9)' : 'rgba(117,119,96,.55)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.3, 0, TAU2); ctx.fill();
  }
  const focus = g.getFocus();
  for (const s of g.survivors) {
    if (s.state === 'dead' || s.state === 'escaped' || s === focus) continue;
    if (g.role === 'survivor' && s.state === 'downed') {
      const p = toM(s.x, s.y); ctx.fillStyle = `rgba(231,104,86,${.6 + Math.sin(g.time * 5) * .3})`; ctx.beginPath(); ctx.arc(p.x, p.y, 2.8, 0, TAU2); ctx.fill();
    } else if (g.role === 'killer' || g.killer.sightTimer > 0) {
      const p = toM(s.x, s.y); ctx.fillStyle = 'rgba(213,79,63,.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, TAU2); ctx.fill();
    }
  }
  const fp = toM(focus.x, focus.y);
  ctx.fillStyle = g.role === 'killer' ? 'rgba(228,95,77,.95)' : 'rgba(239,231,209,.95)';
  ctx.beginPath(); ctx.arc(fp.x, fp.y, 3.2, 0, TAU2); ctx.fill();
  ctx.strokeStyle = 'rgba(239,231,209,.32)'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.arc(fp.x, fp.y, 7, 0, TAU2); ctx.stroke();
  if (g.role === 'survivor') {
    const kp = toM(g.killer.x, g.killer.y);
    const kd = Math.hypot(g.killer.x - focus.x, g.killer.y - focus.y);
    if (kd < 760) {
      ctx.fillStyle = `rgba(207,62,49,${clamp((760 - kd) / 500, .15, .85)})`;
      ctx.beginPath(); ctx.arc(kp.x, kp.y, 3, 0, TAU2); ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(215,226,214,.15)'; ctx.lineWidth = 1;
  ctx.strokeRect(.5, .5, w - 1, h - 1);
  ctx.restore();
}

// ── Skill check ───────────────────────────────────────────────
export function renderSkillCheck(g) {
  const c = g.skillCanvas;
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.clearRect(0, 0, w, h);
  if (!g.skillCheck.active) return;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  const R = 78;
  // backdrop
  const bg = ctx.createRadialGradient(0, 0, 18, 0, 0, 105);
  bg.addColorStop(0, 'rgba(4,9,10,.88)'); bg.addColorStop(.7, 'rgba(4,9,10,.5)'); bg.addColorStop(1, 'rgba(4,9,10,0)');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, 106, 0, TAU2); ctx.fill();
  // rings
  ctx.strokeStyle = 'rgba(220,230,218,.18)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU2); ctx.stroke();
  ctx.strokeStyle = 'rgba(220,230,218,.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, R + 12, 0, TAU2); ctx.stroke();
  // success zone
  const start = -Math.PI / 2 + g.skillCheck.zoneStart;
  const end = start + g.skillCheck.zoneWidth;
  ctx.strokeStyle = 'rgba(185,208,192,.35)'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(0, 0, R, start, end); ctx.stroke();
  ctx.strokeStyle = 'rgba(228,181,101,.95)'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(0, 0, R, start, end); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,237,189,.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R, start, end); ctx.stroke();
  // tick marks
  ctx.strokeStyle = 'rgba(220,230,218,.12)'; ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + i / 12 * TAU;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * (R + 9), Math.sin(a) * (R + 9)); ctx.lineTo(Math.cos(a) * (R + 14), Math.sin(a) * (R + 14)); ctx.stroke();
  }
  // needle
  const na = -Math.PI / 2 + g.skillCheck.angle;
  ctx.strokeStyle = g.skillCheck.result === 'good' ? 'rgba(154,240,209,.95)' : g.skillCheck.result === 'bad' ? 'rgba(232,91,73,.95)' : 'rgba(246,241,219,.95)';
  ctx.lineWidth = 2.4; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.moveTo(Math.cos(na) * 28, Math.sin(na) * 28); ctx.lineTo(Math.cos(na) * (R + 6), Math.sin(na) * (R + 6)); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(242,235,217,.9)'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU2); ctx.fill();
  // inner icon
  ctx.strokeStyle = 'rgba(205,217,203,.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, 23, 0, TAU2); ctx.stroke();
  ctx.fillStyle = 'rgba(218,229,215,.72)'; ctx.font = "600 9px 'Barlow Condensed', sans-serif"; ctx.textAlign = 'center';
  ctx.fillText('SPACE', 0, 3.5);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════
// MENU BACKDROP
// ══════════════════════════════════════════════════════════════
let backdropSeed = 0;
let backdropTrees = null;
let backdropSize = '';
function ensureBackdrop(w, h) {
  const key = `${w}x${h}`;
  if (backdropSize === key && backdropTrees) return;
  backdropSize = key;
  backdropSeed = 4177;
  const rng = () => {
    backdropSeed = (backdropSeed * 1664525 + 1013904223) >>> 0;
    return backdropSeed / 4294967296;
  };
  backdropTrees = [];
  for (let i = 0; i < 54; i++) {
    backdropTrees.push({
      x: w * (.02 + rng() * .96),
      y: h * (.40 + rng() * .52),
      s: .22 + rng() * .34,
      type: rng() > .78 ? 'bare' : 'pine',
      depth: .4 + rng() * .9,
      a: .17 + rng() * .22,
      seed: rng() * 100
    });
  }
  backdropTrees.sort((a, b) => a.depth - b.depth);
}

export function renderMenuBackdrop(canvas, t) {
  const { ctx, w, h } = fitCanvas(canvas);
  ensureBackdrop(w, h);
  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#050a0e');
  sky.addColorStop(.33, '#071519');
  sky.addColorStop(.58, '#0b1d1e');
  sky.addColorStop(.63, '#0d1b1a');
  sky.addColorStop(1, '#050a09');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);

  // Moon glow, obscured by cloud.
  const mx = w * .7, my = h * .19;
  const moon = ctx.createRadialGradient(mx, my, 4, mx, my, Math.max(w, h) * .31);
  moon.addColorStop(0, 'rgba(207,221,207,.32)');
  moon.addColorStop(.06, 'rgba(183,204,193,.19)');
  moon.addColorStop(.19, 'rgba(106,150,145,.07)');
  moon.addColorStop(1, 'rgba(70,110,106,0)');
  ctx.fillStyle = moon; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(220,229,211,.32)';
  ctx.beginPath(); ctx.arc(mx, my, Math.min(w, h) * .025, 0, TAU2); ctx.fill();
  // moon cloud bands
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 4; i++) {
    const y = my - 10 + i * 11;
    const off = Math.sin(t * .02 + i * 2.1) * 30;
    const gr = ctx.createLinearGradient(mx - 180 + off, y, mx + 180 + off, y);
    gr.addColorStop(0, 'rgba(8,15,17,0)'); gr.addColorStop(.4, 'rgba(7,14,16,.72)'); gr.addColorStop(.6, 'rgba(7,14,16,.6)'); gr.addColorStop(1, 'rgba(8,15,17,0)');
    ctx.fillStyle = gr; ctx.fillRect(mx - 260 + off, y, 520, 17);
  }
  ctx.restore();

  // Distant ridge
  ctx.fillStyle = 'rgba(6,13,14,.8)';
  ctx.beginPath(); ctx.moveTo(0, h * .57);
  for (let x = 0; x <= w; x += w / 24) {
    ctx.lineTo(x, h * .57 - Math.sin(x * .011 + 1.2) * h * .018 - Math.sin(x * .034) * h * .008);
  }
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();

  // Distant manor silhouette
  drawManor(ctx, w * .74, h * .55, Math.min(w, h) * .185, t);

  // Midground tree line
  for (const tr of backdropTrees) {
    if (tr.depth > .9) continue;
    drawBackdropTree(ctx, tr.x, h * .54 + tr.y * .16, tr.s * h * .34, tr.type, t, tr.seed, tr.a * .7);
  }
  // Fog band
  drawFogBand(ctx, w, h, .60, t, .18);
  drawFogBand(ctx, w, h, .70, t * 1.3, .13);

  // Ground
  const ground = ctx.createLinearGradient(0, h * .62, 0, h);
  ground.addColorStop(0, 'rgba(7,14,13,0)');
  ground.addColorStop(.4, 'rgba(5,11,10,.65)');
  ground.addColorStop(1, '#030807');
  ctx.fillStyle = ground; ctx.fillRect(0, h * .59, w, h * .41);

  // Foreground silhouette trees, framing left and right.
  const fg = [
    { x: -.03, y: .62, s: 1.05 }, { x: .055, y: .72, s: .78 }, { x: .97, y: .60, s: 1.1 }, { x: .925, y: .8, s: .72 }
  ];
  for (const f of fg) drawBackdropTree(ctx, f.x * w, f.y * h, f.s * h * .74, 'pine', t * .4, f.x * 10, .9);
  // branches top corners
  drawBranch(ctx, -20, -20, w * .2, h * .25, -1, 1, t);
  drawBranch(ctx, w + 20, -20, w * .17, h * .2, 1, 1, t);

  // Fireflies / ash
  ctx.save();
  for (let i = 0; i < 36; i++) {
    const seed = i * 71.31;
    const x = (w * ((seed * .131) % 1) + Math.sin(t * .23 + i) * 22 + w) % w;
    const y = h * (.24 + ((seed * .371) % .65)) + Math.cos(t * .19 + i * 2.2) * 13;
    const a = .07 + (Math.sin(t * 1.4 + i * 2.7) * .5 + .5) * .18;
    ctx.fillStyle = `rgba(219,196,132,${a})`;
    ctx.beginPath(); ctx.arc(x, y, .7 + (i % 3) * .4, 0, TAU2); ctx.fill();
  }
  ctx.restore();

  // Red eyes in the treeline
  const blink = Math.max(0, Math.sin(t * .33 - 1)) ** 12;
  if (blink > .02) {
    const ex = w * .84, ey = h * .65;
    ctx.save(); ctx.globalAlpha = blink * .7;
    ctx.fillStyle = 'rgba(220,64,48,.8)';
    ctx.beginPath(); ctx.arc(ex, ey, 1.4, 0, TAU2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 9, ey, 1.4, 0, TAU2); ctx.fill();
    const g = ctx.createRadialGradient(ex + 4, ey, 1, ex + 4, ey, 30);
    g.addColorStop(0, 'rgba(198,44,35,.3)'); g.addColorStop(1, 'rgba(198,44,35,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex + 4, ey, 30, 0, TAU2); ctx.fill();
    ctx.restore();
  }

  // Overall tint/grain vignette
  ctx.save();
  const vg = ctx.createRadialGradient(w * .47, h * .48, Math.min(w, h) * .2, w * .47, h * .48, Math.max(w, h) * .75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(.72, 'rgba(0,0,0,.14)');
  vg.addColorStop(1, 'rgba(0,0,0,.62)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawManor(ctx, x, y, size, t) {
  const w = size * 1.65, h = size * .95;
  ctx.save(); ctx.translate(x, y);
  // Mass
  ctx.fillStyle = '#060c0d';
  ctx.fillRect(-w * .5, -h, w, h);
  ctx.fillStyle = '#050a0b';
  // roof
  ctx.beginPath(); ctx.moveTo(-w * .56, -h); ctx.lineTo(-w * .18, -h * 1.3); ctx.lineTo(w * .15, -h * 1.2); ctx.lineTo(w * .5, -h * .96); ctx.lineTo(w * .5, -h * .86); ctx.closePath(); ctx.fill();
  // wings
  ctx.fillRect(-w * .6, -h * .72, w * .13, h * .72);
  ctx.fillRect(w * .47, -h * .68, w * .12, h * .68);
  // chimneys
  ctx.fillRect(-w * .27, -h * 1.45, w * .045, h * .28);
  ctx.fillRect(w * .16, -h * 1.36, w * .04, h * .24);
  // roof ridge
  ctx.strokeStyle = 'rgba(92,111,103,.17)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-w * .56, -h); ctx.lineTo(-w * .18, -h * 1.3); ctx.lineTo(w * .15, -h * 1.2); ctx.lineTo(w * .5, -h * .96); ctx.stroke();
  // windows
  const flick = .24 + Math.sin(t * 1.3) * .04 + (Math.sin(t * 6.1) > .92 ? .2 : 0);
  for (const [wx, wy, ww, wh] of [[-.35, -.22, .06, .12], [-.19, -.25, .055, .11], [.19, -.2, .055, .11], [.33, -.26, .06, .12], [-.5, -.38, .04, .08], [.43, -.34, .04, .08]]) {
    ctx.fillStyle = `rgba(218,166,84,${flick})`;
    ctx.fillRect(wx * w, wy * h, ww * w, wh * h);
    const gl = ctx.createRadialGradient(wx * w + ww * w / 2, wy * h + wh * h / 2, 0, wx * w + ww * w / 2, wy * h + wh * h / 2, size * .2);
    gl.addColorStop(0, `rgba(226,174,91,${flick * .14})`); gl.addColorStop(1, 'rgba(226,174,91,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(wx * w + ww * w / 2, wy * h + wh * h / 2, size * .2, 0, TAU2); ctx.fill();
  }
  // door
  ctx.fillStyle = 'rgba(218,166,84,.1)';
  ctx.fillRect(-.025 * w, -h * .17, .05 * w, h * .17);
  // foundation silhouette
  ctx.fillStyle = '#020707'; ctx.fillRect(-w * .62, -h * .03, w * 1.24, h * .05);
  ctx.restore();

  // Ground misty glow under manor
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const gl = ctx.createRadialGradient(x, y + 20, 2, x, y + 30, size * 2.2);
  gl.addColorStop(0, 'rgba(78,118,109,.07)'); gl.addColorStop(1, 'rgba(78,118,109,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y + 30, size * 2.2, 0, TAU2); ctx.fill();
  ctx.restore();
}

function drawFogBand(ctx, w, h, yPct, t, alpha) {
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  const y = h * yPct;
  for (let i = 0; i < 3; i++) {
    const x = ((t * (7 + i * 2) + i * 340) % (w + 500)) - 250;
    const grad = ctx.createRadialGradient(x, y + i * 13, 2, x, y + i * 13, 260 + i * 50);
    grad.addColorStop(0, `rgba(144,180,171,${alpha})`);
    grad.addColorStop(.55, `rgba(136,170,162,${alpha * .48})`);
    grad.addColorStop(1, 'rgba(136,170,162,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.ellipse(x, y + i * 13, 300 + i * 50, 42 + i * 8, 0, 0, TAU2); ctx.fill();
  }
  ctx.restore();
}

function drawBackdropTree(ctx, x, y, size, type, t, seed, alpha) {
  ctx.save(); ctx.translate(x, y);
  const sway = Math.sin(t * .2 + seed) * size * .008;
  ctx.rotate(sway);
  ctx.globalAlpha = alpha;
  if (type === 'bare') {
    ctx.strokeStyle = '#060c0c'; ctx.lineWidth = Math.max(1, size * .025); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -size); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const yy = -size * (.35 + i * .11);
      const dir = i % 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(dir * size * (.09 + i * .012), yy - size * .1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dir * size * .09, yy - size * .1); ctx.lineTo(dir * size * .14, yy - size * .17); ctx.stroke();
    }
  } else {
    // Layered pine silhouette
    const layers = 6;
    for (let i = 0; i < layers; i++) {
      const yy = -size * (i / layers) * .82;
      const ww = size * .16 * (1 - i / layers * .62);
      ctx.fillStyle = i % 2 ? '#050b0b' : '#060d0d';
      ctx.beginPath();
      ctx.moveTo(0, yy - size * .22);
      ctx.lineTo(ww, yy + size * .09);
      ctx.lineTo(ww * .3, yy + size * .05);
      ctx.lineTo(ww * .48, yy + size * .13);
      ctx.lineTo(0, yy + size * .08);
      ctx.lineTo(-ww * .48, yy + size * .13);
      ctx.lineTo(-ww * .3, yy + size * .05);
      ctx.lineTo(-ww, yy + size * .09);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

function drawBranch(ctx, x, y, len, drop, dir, side, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
  ctx.strokeStyle = 'rgba(2,6,6,.94)'; ctx.lineWidth = Math.max(3, len * .035); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * .45, drop * .12, len * .78, drop * .62);
  ctx.stroke();
  for (let i = 0; i < 5; i++) {
    const px = len * (.25 + i * .11), py = drop * (.07 + i * .11);
    ctx.lineWidth = Math.max(1, len * .015);
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + len * .08, py + drop * .08, px + len * .12, py + drop * .26);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px - len * .02, py + drop * .12, px - len * .085, py + drop * .2);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderResultBackdrop(canvas, t, outcome) {
  const { ctx, w, h } = fitCanvas(canvas);
  const warm = outcome === 'killer';
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  if (warm) {
    sky.addColorStop(0, '#0c0707'); sky.addColorStop(.5, '#180b0a'); sky.addColorStop(1, '#050302');
  } else {
    sky.addColorStop(0, '#050c0e'); sky.addColorStop(.5, '#081616'); sky.addColorStop(1, '#030706');
  }
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  // hazy moon
  const mx = w * .5, my = h * .2;
  const gl = ctx.createRadialGradient(mx, my, 3, mx, my, Math.max(w, h) * .55);
  gl.addColorStop(0, warm ? 'rgba(182,85,68,.12)' : 'rgba(137,181,169,.12)');
  gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, w, h);
  // Tree silhouettes
  ctx.save();
  ctx.globalAlpha = .55;
  for (let i = 0; i < 13; i++) {
    const x = w * (i / 12) + Math.sin(i * 5.7) * 40;
    const size = h * (.22 + ((i * 7) % 4) * .05);
    drawBackdropTree(ctx, x, h * .83, size, i % 5 === 0 ? 'bare' : 'pine', t, i * 3.1, .56);
  }
  ctx.restore();
  drawFogBand(ctx, w, h, .79, t, .14);
  drawFogBand(ctx, w, h, .9, t * 1.4, .08);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .14, w / 2, h / 2, Math.max(w, h) * .7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.7)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}
