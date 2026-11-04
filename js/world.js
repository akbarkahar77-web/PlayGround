// THE HOLLOW — world generation, collision, navigation and static art
export const WORLD_W = 2600;
export const WORLD_H = 1800;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANDMARKS = [
  { x: 1290, y: 800, label: 'THE LODGE' },
  { x: 720, y: 375, label: 'FUEL SHED' },
  { x: 2020, y: 370, label: 'RANGER STATION' },
  { x: 330, y: 850, label: 'CHAPEL RUINS' },
  { x: 710, y: 1260, label: 'TRAPPER CABIN' },
  { x: 2170, y: 1290, label: 'PUMP HOUSE' },
  { x: 130, y: 880, label: 'WEST GATE' },
  { x: 2470, y: 880, label: 'EAST GATE' },
  { x: 2370, y: 1640, label: 'BLACKWATER' }
];

const PATHS = [
  [[40, 880], [300, 940], [620, 920], [860, 900], [1030, 830], [1150, 800]],
  [[1540, 800], [1740, 840], [1960, 900], [2210, 880], [2560, 900]],
  [[860, 900], [820, 710], [720, 520], [640, 370]],
  [[920, 915], [820, 1040], [760, 1190], [760, 1320], [870, 1510]],
  [[1770, 850], [1850, 1000], [2010, 1160], [2160, 1300], [2290, 1480]],
  [[670, 915], [460, 960], [330, 900], [220, 900]],
  [[1430, 700], [1600, 560], [1830, 450], [2020, 380]],
  [[1280, 1080], [1140, 1180], [1000, 1280], [870, 1480]]
];

const GENERATOR_SPOTS = [
  { x: 648, y: 275, label: 'FUEL SHED' },
  { x: 1558, y: 480, label: 'NORTH RIDGE' },
  { x: 2030, y: 905, label: 'EAST YARD' },
  { x: 1355, y: 1125, label: 'SOUTH FIELDS' },
  { x: 745, y: 1355, label: 'TRAPPER CREEK' },
  { x: 330, y: 1080, label: 'CHAPEL WOODS' },
  { x: 2200, y: 1515, label: 'BLACKWATER' }
];

const PALLET_SPOTS = [
  { x: 954, y: 750, angle: -0.45 },
  { x: 1620, y: 790, angle: 1.12 },
  { x: 1050, y: 1075, angle: 0.65 },
  { x: 1890, y: 1040, angle: -0.85 },
  { x: 570, y: 910, angle: 1.42 },
  { x: 1470, y: 1200, angle: 0.05 },
  { x: 2090, y: 1190, angle: 1.3 },
  { x: 1100, y: 620, angle: 0.2 }
];

const EXIT_SPOTS = [
  { x: 52, y: 900, side: 'west', label: 'WEST GATE' },
  { x: 2548, y: 900, side: 'east', label: 'EAST GATE' }
];

export function createWorld(seed = 4177) {
  const rng = mulberry32(seed & 0xffffffff);
  const rects = [];
  const circles = [];
  const walls = [];
  const buildings = [];
  const trees = [];
  const rocks = [];
  const props = [];
  const lamps = [];
  const dynamicRects = [];

  const avoid = [
    ...GENERATOR_SPOTS, ...PALLET_SPOTS, ...EXIT_SPOTS,
    { x: 260, y: 1510 }, { x: 2380, y: 260 }, { x: 2250, y: 1650 },
    { x: 1300, y: 800 }, { x: 1290, y: 860 }
  ];

  function addRect(x, y, w, h, type = 'wall') {
    const r = { x, y, w, h, type };
    rects.push(r);
    if (type === 'wall') walls.push(r);
    return r;
  }
  function addCircle(x, y, r, type = 'tree') {
    const c = { x, y, r, type };
    circles.push(c);
    return c;
  }

  // ── Buildings ───────────────────────────────────────────────
  // Main lodge, with four entry gaps.
  buildings.push({ type: 'lodge', x: 1030, y: 620, w: 500, h: 360, floor: '#171c1b', label: 'THE LODGE' });
  // top wall with a double door gap
  addRect(1030, 620, 175, 16); addRect(1285, 620, 110, 16); addRect(1475, 620, 55, 16);
  // bottom wall
  addRect(1030, 964, 165, 16); addRect(1270, 964, 260, 16);
  // left wall
  addRect(1030, 636, 16, 110); addRect(1030, 826, 16, 138);
  // right wall
  addRect(1514, 636, 16, 105); addRect(1514, 821, 16, 143);
  // interior partition
  addRect(1285, 710, 14, 105); addRect(1285, 875, 14, 89); addRect(1285, 1040, 14, 0);
  addRect(1360, 780, 88, 12);
  // porch
  addRect(1200, 980, 92, 9, 'prop');
  addRect(1410, 980, 50, 9, 'prop');

  // Fuel shed
  buildings.push({ type: 'shed', x: 590, y: 300, w: 215, h: 150, floor: '#141b1a', label: 'FUEL SHED' });
  addRect(590, 300, 80, 14); addRect(730, 300, 75, 14);
  addRect(590, 436, 215, 14);
  addRect(590, 314, 14, 50); addRect(590, 410, 14, 26);
  addRect(791, 314, 14, 122);

  // Ranger station
  buildings.push({ type: 'station', x: 1910, y: 300, w: 230, h: 165, floor: '#161b1a', label: 'RANGER STATION' });
  addRect(1910, 300, 230, 14);
  addRect(1910, 451, 75, 14); addRect(2060, 451, 80, 14);
  addRect(1910, 314, 14, 65); addRect(1910, 425, 14, 26);
  addRect(2126, 314, 14, 137);

  // Chapel ruins
  buildings.push({ type: 'ruins', x: 270, y: 760, w: 170, h: 185, floor: '#121817', label: 'CHAPEL RUINS' });
  addRect(270, 760, 62, 15); addRect(380, 760, 60, 15);
  addRect(270, 930, 54, 15); addRect(370, 930, 70, 15);
  addRect(270, 775, 15, 55); addRect(270, 875, 15, 55);
  addRect(425, 775, 15, 60); addRect(425, 880, 15, 50);

  // Trapper cabin
  buildings.push({ type: 'cabin', x: 610, y: 1160, w: 235, h: 175, floor: '#151a19', label: 'TRAPPER CABIN' });
  addRect(610, 1160, 80, 14); addRect(740, 1160, 105, 14);
  addRect(610, 1321, 95, 14); addRect(755, 1321, 90, 14);
  addRect(610, 1174, 14, 55); addRect(610, 1275, 14, 46);
  addRect(831, 1174, 14, 147);

  // Pump house
  buildings.push({ type: 'pump', x: 2070, y: 1180, w: 200, h: 150, floor: '#141918', label: 'PUMP HOUSE' });
  addRect(2070, 1180, 75, 14); addRect(2200, 1180, 70, 14);
  addRect(2070, 1316, 200, 14);
  addRect(2070, 1194, 14, 122); addRect(2256, 1194, 14, 122);

  // Static props inside / around buildings.
  props.push({ type: 'table', x: 1180, y: 760, w: 80, h: 42, angle: 0.1 });
  props.push({ type: 'table', x: 1405, y: 900, w: 55, h: 38, angle: -0.2 });
  props.push({ type: 'shelf', x: 1450, y: 690, w: 35, h: 75 });
  props.push({ type: 'shelf', x: 1090, y: 870, w: 32, h: 68 });
  props.push({ type: 'crate', x: 635, y: 340, w: 38, h: 38 });
  props.push({ type: 'crate', x: 740, y: 385, w: 31, h: 31 });
  props.push({ type: 'barrel', x: 1960, y: 410, r: 14 });
  props.push({ type: 'barrel', x: 2080, y: 330, r: 13 });
  props.push({ type: 'crate', x: 2120, y: 1270, w: 36, h: 36 });
  props.push({ type: 'crate', x: 650, y: 1260, w: 33, h: 33 });
  props.push({ type: 'grave', x: 335, y: 838, w: 21, h: 30, angle: -0.12 });
  props.push({ type: 'grave', x: 390, y: 870, w: 19, h: 28, angle: 0.2 });
  props.push({ type: 'grave', x: 310, y: 900, w: 20, h: 30, angle: 0.05 });

  for (const p of props) {
    if (p.type === 'crate' || p.type === 'shelf' || p.type === 'table') addRect(p.x, p.y, p.w, p.h, 'prop');
    else if (p.type === 'barrel') addCircle(p.x, p.y, p.r, 'prop');
    else if (p.type === 'grave') addRect(p.x, p.y, p.w, p.h, 'prop');
  }

  // ── Lamps ───────────────────────────────────────────────────
  for (const p of [[920, 845], [1660, 835], [470, 1010], [1960, 1010], [1130, 555], [2140, 585], [780, 1180], [2210, 1210]]) {
    lamps.push({ x: p[0], y: p[1], r: 190, flicker: rng() * 10 });
  }

  // ── Trees, clustered with open paths ────────────────────────
  const pointToSegDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const nearPath = (x, y, d) => PATHS.some(path => path.some((p, i) => i > 0 && pointToSegDist(x, y, path[i - 1][0], path[i - 1][1], p[0], p[1]) < d));
  const tooCloseToBuilding = (x, y, pad = 35) => buildings.some(b => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);

  let attempts = 0;
  while (trees.length < 155 && attempts < 1300) {
    attempts++;
    let x, y;
    if (trees.length < 92) {
      x = 75 + rng() * (WORLD_W - 150);
      y = 75 + rng() * (WORLD_H - 150);
    } else {
      const edge = Math.floor(rng() * 4);
      if (edge === 0) { x = 60 + rng() * 360; y = 60 + rng() * (WORLD_H - 120); }
      else if (edge === 1) { x = WORLD_W - 60 - rng() * 420; y = 60 + rng() * (WORLD_H - 120); }
      else if (edge === 2) { x = 60 + rng() * (WORLD_W - 120); y = 60 + rng() * 290; }
      else { x = 60 + rng() * (WORLD_W - 120); y = WORLD_H - 60 - rng() * 290; }
    }
    if (tooCloseToBuilding(x, y, 55)) continue;
    if (nearPath(x, y, 68)) continue;
    if (avoid.some(p => Math.hypot(x - p.x, y - p.y) < 130)) continue;
    if (trees.some(t => Math.hypot(x - t.x, y - t.y) < 58)) continue;
    const r = 17 + rng() * 18;
    const tree = { x, y, r, alpha: 0.76 + rng() * 0.24, variant: rng() > 0.84 ? 'dead' : 'pine', seed: rng() * 1000, sway: rng() * TAU };
    trees.push(tree);
    addCircle(x, y, 9 + r * 0.18, 'tree');
  }

  // Rocks & woodland clutter
  attempts = 0;
  while (rocks.length < 34 && attempts < 600) {
    attempts++;
    const x = 80 + rng() * (WORLD_W - 160);
    const y = 80 + rng() * (WORLD_H - 160);
    if (tooCloseToBuilding(x, y, 35)) continue;
    if (nearPath(x, y, 45)) continue;
    if (avoid.some(p => Math.hypot(x - p.x, y - p.y) < 90)) continue;
    if (trees.some(t => Math.hypot(x - t.x, y - t.y) < 42)) continue;
    if (rocks.some(t => Math.hypot(x - t.x, y - t.y) < 60)) continue;
    const r = 9 + rng() * 19;
    rocks.push({ x, y, r, seed: rng() * 1000 });
    addCircle(x, y, r * 0.82, 'rock');
  }

  // Dense bracken / fern patches (visual only)
  const ferns = [];
  for (let i = 0; i < 90; i++) {
    const x = 60 + rng() * (WORLD_W - 120);
    const y = 60 + rng() * (WORLD_H - 120);
    if (tooCloseToBuilding(x, y, 10)) continue;
    if (nearPath(x, y, 18)) continue;
    ferns.push({ x, y, r: 12 + rng() * 27, seed: rng() * 1000 });
  }

  // ── Static art ──────────────────────────────────────────────
  const staticCanvas = document.createElement('canvas');
  staticCanvas.width = WORLD_W;
  staticCanvas.height = WORLD_H;
  const sx = staticCanvas.getContext('2d');

  function drawGround() {
    const g = sx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, '#0b1414');
    g.addColorStop(0.4, '#101b19');
    g.addColorStop(0.72, '#111b18');
    g.addColorStop(1, '#0a1212');
    sx.fillStyle = g;
    sx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Broadground mottling.
    for (let i = 0; i < 320; i++) {
      const x = rng() * WORLD_W, y = rng() * WORLD_H;
      const r = 24 + rng() * 120;
      const c = rng() > 0.5 ? 'rgba(31,47,41,.12)' : 'rgba(8,12,12,.16)';
      sx.fillStyle = c;
      sx.beginPath();
      sx.ellipse(x, y, r, r * (0.35 + rng() * 0.4), rng() * TAU, 0, TAU);
      sx.fill();
    }

    // Scattered grass and twigs.
    for (let i = 0; i < 3100; i++) {
      const x = rng() * WORLD_W, y = rng() * WORLD_H;
      const len = 2 + rng() * 8;
      sx.strokeStyle = rng() > 0.72 ? 'rgba(76,100,83,.22)' : 'rgba(43,65,56,.2)';
      sx.lineWidth = 0.7;
      sx.beginPath();
      sx.moveTo(x, y);
      sx.lineTo(x + (rng() - 0.5) * 4, y - len);
      sx.stroke();
    }

    // Puddles / damp patches.
    for (let i = 0; i < 24; i++) {
      const x = rng() * WORLD_W, y = rng() * WORLD_H;
      const w = 20 + rng() * 55, h = 8 + rng() * 24;
      sx.fillStyle = 'rgba(12,26,28,.5)';
      sx.beginPath(); sx.ellipse(x, y, w, h, rng() * TAU, 0, TAU); sx.fill();
      sx.strokeStyle = 'rgba(96,130,126,.08)'; sx.lineWidth = 1; sx.stroke();
    }
  }

  function tracePath(points) {
    sx.beginPath();
    sx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i], n = points[i + 1];
      sx.quadraticCurveTo(p[0], p[1], (p[0] + n[0]) / 2, (p[1] + n[1]) / 2);
    }
    const n = points[points.length - 1];
    sx.lineTo(n[0], n[1]);
  }

  function drawPaths() {
    sx.lineCap = 'round'; sx.lineJoin = 'round';
    for (const path of PATHS) {
      tracePath(path);
      sx.strokeStyle = 'rgba(7,10,9,.32)'; sx.lineWidth = 78; sx.stroke();
      tracePath(path);
      sx.strokeStyle = '#1a211d'; sx.lineWidth = 58; sx.stroke();
      tracePath(path);
      sx.strokeStyle = '#222923'; sx.lineWidth = 42; sx.stroke();
      tracePath(path);
      sx.strokeStyle = 'rgba(56,61,48,.22)'; sx.lineWidth = 2; sx.setLineDash([5, 13]); sx.stroke(); sx.setLineDash([]);
    }
    // worn wheel ruts
    for (const path of PATHS.slice(0, 3)) {
      tracePath(path);
      sx.strokeStyle = 'rgba(6,9,8,.3)'; sx.lineWidth = 2; sx.setLineDash([18, 18]); sx.stroke(); sx.setLineDash([]);
    }
  }

  function drawPonds() {
    const wet = [
      { x: 2370, y: 1630, rx: 165, ry: 105, rot: -0.2 },
      { x: 205, y: 270, rx: 100, ry: 62, rot: 0.4 },
      { x: 1680, y: 1510, rx: 80, ry: 42, rot: 0.2 }
    ];
    for (const p of wet) {
      sx.save(); sx.translate(p.x, p.y); sx.rotate(p.rot);
      const g = sx.createRadialGradient(0, 0, 4, 0, 0, p.rx);
      g.addColorStop(0, 'rgba(15,35,38,.82)');
      g.addColorStop(0.7, 'rgba(10,23,25,.6)');
      g.addColorStop(1, 'rgba(8,17,17,0)');
      sx.fillStyle = g;
      sx.beginPath(); sx.ellipse(0, 0, p.rx, p.ry, 0, 0, TAU); sx.fill();
      sx.strokeStyle = 'rgba(93,137,128,.08)'; sx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        sx.beginPath(); sx.ellipse(-p.rx * .2 + (rng() - .5) * p.rx * .9, (rng() - .5) * p.ry * 1.2, p.rx * .22, p.ry * .12, 0, 0, TAU); sx.stroke();
      }
      sx.restore();
    }
  }

  function drawBuildingFloor(b) {
    sx.save();
    sx.fillStyle = 'rgba(0,0,0,.45)';
    sx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    sx.fillStyle = b.floor;
    sx.fillRect(b.x, b.y, b.w, b.h);
    // floor boards / stone tiles
    sx.strokeStyle = 'rgba(173,179,151,.045)'; sx.lineWidth = 1;
    if (b.type === 'ruins') {
      for (let x = b.x + 22; x < b.x + b.w; x += 34) { sx.beginPath(); sx.moveTo(x, b.y); sx.lineTo(x, b.y + b.h); sx.stroke(); }
      for (let y = b.y + 22; y < b.y + b.h; y += 34) { sx.beginPath(); sx.moveTo(b.x, y); sx.lineTo(b.x + b.w, y); sx.stroke(); }
    } else {
      for (let y = b.y + 14; y < b.y + b.h; y += 16) { sx.beginPath(); sx.moveTo(b.x, y); sx.lineTo(b.x + b.w, y); sx.stroke(); }
      for (let x = b.x + 80; x < b.x + b.w; x += 80) { sx.beginPath(); sx.moveTo(x, b.y); sx.lineTo(x, b.y + b.h); sx.stroke(); }
    }
    // ambient interior stain
    sx.fillStyle = 'rgba(0,0,0,.13)';
    sx.beginPath(); sx.ellipse(b.x + b.w * .55, b.y + b.h * .52, b.w * .3, b.h * .28, 0, 0, TAU); sx.fill();
    sx.restore();
  }

  function drawWalls() {
    for (const r of rects) {
      if (r.type !== 'wall') continue;
      sx.save();
      sx.shadowColor = 'rgba(0,0,0,.8)'; sx.shadowBlur = 12; sx.shadowOffsetY = 6;
      sx.fillStyle = '#1f2b28';
      sx.fillRect(r.x, r.y, r.w, r.h);
      sx.shadowColor = 'transparent';
      sx.fillStyle = '#30403b';
      sx.fillRect(r.x, r.y, r.w, Math.min(5, r.h));
      sx.fillStyle = 'rgba(8,12,11,.45)';
      if (r.h > 12) { sx.fillRect(r.x + r.w - 3, r.y, 3, r.h); }
      // board seams
      sx.strokeStyle = 'rgba(8,13,12,.35)'; sx.lineWidth = 1;
      if (r.w > r.h) {
        for (let x = r.x + 16; x < r.x + r.w; x += 23) { sx.beginPath(); sx.moveTo(x, r.y); sx.lineTo(x, r.y + r.h); sx.stroke(); }
      } else {
        for (let y = r.y + 16; y < r.y + r.h; y += 23) { sx.beginPath(); sx.moveTo(r.x, y); sx.lineTo(r.x + r.w, y); sx.stroke(); }
      }
      // moss creeping up
      sx.fillStyle = 'rgba(73,96,67,.18)';
      for (let i = 0; i < Math.max(2, r.w * r.h / 3500); i++) {
        const cx = r.x + rng() * r.w, cy = r.y + r.h - rng() * Math.min(8, r.h);
        sx.beginPath(); sx.arc(cx, cy, 1 + rng() * 3, 0, TAU); sx.fill();
      }
      sx.restore();
    }
  }

  function drawWindows() {
    const windows = [
      [1140, 613, 28, 6, 0], [1360, 613, 28, 6, 0], [1140, 974, 28, 6, 0], [1360, 974, 28, 6, 0],
      [1022, 700, 6, 28, 0], [1022, 880, 6, 28, 0], [1530, 700, 6, 28, 0], [1530, 880, 6, 28, 0],
      [688, 293, 26, 5, 0], [2000, 293, 25, 5, 0], [2080, 293, 25, 5, 0],
      [626, 1153, 24, 5, 0], [2170, 1173, 26, 5, 0]
    ];
    for (const [x, y, w, h] of windows) {
      sx.fillStyle = 'rgba(139,174,163,.09)';
      sx.fillRect(x, y, w, h);
      sx.fillStyle = 'rgba(209,178,106,.07)';
      sx.fillRect(x + 4, y + 1, w - 8, h - 2);
    }
  }

  function drawProps() {
    for (const p of props) {
      sx.save(); sx.translate(p.x + (p.w || 0) / 2, p.y + (p.h || 0) / 2);
      if (p.angle) sx.rotate(p.angle);
      if (p.type === 'crate') {
        sx.fillStyle = 'rgba(0,0,0,.35)'; sx.fillRect(-p.w / 2 + 4, -p.h / 2 + 4, p.w, p.h);
        sx.fillStyle = '#2b3026'; sx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        sx.strokeStyle = '#434735'; sx.lineWidth = 2; sx.strokeRect(-p.w / 2 + 2, -p.h / 2 + 2, p.w - 4, p.h - 4);
        sx.beginPath(); sx.moveTo(-p.w / 2, -p.h / 2); sx.lineTo(p.w / 2, p.h / 2); sx.moveTo(p.w / 2, -p.h / 2); sx.lineTo(-p.w / 2, p.h / 2); sx.stroke();
      } else if (p.type === 'barrel') {
        sx.fillStyle = 'rgba(0,0,0,.35)'; sx.beginPath(); sx.arc(3, 4, p.r, 0, TAU); sx.fill();
        sx.fillStyle = '#283330'; sx.beginPath(); sx.arc(0, 0, p.r, 0, TAU); sx.fill();
        sx.strokeStyle = '#43524a'; sx.lineWidth = 1.6; sx.beginPath(); sx.arc(0, 0, p.r - 3, 0, TAU); sx.stroke();
        sx.strokeStyle = 'rgba(100,124,106,.2)'; sx.beginPath(); sx.arc(0, 0, p.r * .5, 0, TAU); sx.stroke();
      } else if (p.type === 'table' || p.type === 'shelf') {
        sx.fillStyle = 'rgba(0,0,0,.32)'; sx.fillRect(-p.w / 2 + 3, -p.h / 2 + 4, p.w, p.h);
        sx.fillStyle = '#322f25'; sx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        sx.strokeStyle = '#4c4632'; sx.lineWidth = 1.4; sx.strokeRect(-p.w / 2 + 2, -p.h / 2 + 2, p.w - 4, p.h - 4);
        if (p.type === 'shelf') for (let i = 1; i < 4; i++) { sx.beginPath(); sx.moveTo(-p.w / 2 + 3, -p.h / 2 + i * p.h / 4); sx.lineTo(p.w / 2 - 3, -p.h / 2 + i * p.h / 4); sx.stroke(); }
      } else if (p.type === 'grave') {
        sx.fillStyle = 'rgba(0,0,0,.32)'; sx.fillRect(-p.w / 2 + 3, -p.h / 2 + 4, p.w, p.h);
        sx.fillStyle = '#3a403b'; sx.beginPath(); sx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, [8, 8, 1, 1]); sx.fill();
        sx.strokeStyle = 'rgba(131,146,130,.18)'; sx.lineWidth = 1.2; sx.beginPath(); sx.moveTo(0, -p.h / 2 + 6); sx.lineTo(0, p.h / 2 - 6); sx.moveTo(-5, -2); sx.lineTo(5, -2); sx.stroke();
      }
      sx.restore();
    }
  }

  function drawTree(t) {
    const r = t.r;
    sx.save();
    sx.translate(t.x, t.y);
    // shadow
    sx.fillStyle = 'rgba(0,0,0,.36)';
    sx.beginPath(); sx.ellipse(r * .34, r * .42, r * 1.04, r * .72, 0.35, 0, TAU); sx.fill();
    if (t.variant === 'dead') {
      sx.strokeStyle = '#242b26'; sx.lineWidth = 3.2; sx.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t.seed;
        sx.beginPath(); sx.moveTo(0, 0); sx.lineTo(Math.cos(a) * r * .85, Math.sin(a) * r * .85); sx.stroke();
        sx.beginPath(); sx.moveTo(Math.cos(a) * r * .4, Math.sin(a) * r * .4); sx.lineTo(Math.cos(a + .5) * r * .7, Math.sin(a + .5) * r * .7); sx.stroke();
      }
      sx.fillStyle = '#171d1a'; sx.beginPath(); sx.arc(0, 0, r * .18, 0, TAU); sx.fill();
    } else {
      // trunk
      sx.fillStyle = '#17201c';
      sx.beginPath(); sx.arc(0, 0, r * .2, 0, TAU); sx.fill();
      // layered canopy
      const lobes = 8;
      for (let layer = 0; layer < 3; layer++) {
        const scale = 1 - layer * .2;
        sx.fillStyle = layer === 0 ? 'rgba(9,18,16,.85)' : layer === 1 ? 'rgba(17,31,27,.92)' : 'rgba(24,41,34,.92)';
        sx.beginPath();
        for (let i = 0; i < lobes; i++) {
          const a = (i / lobes) * TAU + t.seed * .2 + layer * .3;
          const rr = r * scale * (0.73 + ((Math.sin(t.seed + i * 2.3) + 1) / 2) * .2);
          const xx = Math.cos(a) * r * scale * .47;
          const yy = Math.sin(a) * r * scale * .47;
          if (i === 0) sx.moveTo(xx + Math.cos(a) * rr, yy + Math.sin(a) * rr);
          else sx.arc(xx, yy, rr, 0, TAU);
        }
        sx.closePath(); sx.fill();
      }
      // moonlit rim
      sx.strokeStyle = 'rgba(98,132,120,.13)'; sx.lineWidth = 1.2;
      sx.beginPath(); sx.arc(-r * .18, -r * .22, r * .72, Math.PI * 1.05, Math.PI * 1.85); sx.stroke();
      // sparse highlights
      sx.fillStyle = 'rgba(91,122,108,.1)';
      for (let i = 0; i < 8; i++) {
        const a = t.seed + i * 2.3;
        sx.beginPath(); sx.arc(Math.cos(a) * r * .3, Math.sin(a) * r * .3 - r * .22, 1.5 + (i % 3), 0, TAU); sx.fill();
      }
    }
    sx.restore();
  }

  function drawRocks() {
    for (const r of rocks) {
      sx.save(); sx.translate(r.x, r.y);
      sx.fillStyle = 'rgba(0,0,0,.38)';
      sx.beginPath(); sx.ellipse(r.r * .25, r.r * .35, r.r, r.r * .66, .4, 0, TAU); sx.fill();
      sx.fillStyle = '#2b322e';
      sx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + r.seed;
        const rr = r.r * (0.75 + ((Math.sin(r.seed + i) + 1) / 2) * .35);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * .8;
        if (i === 0) sx.moveTo(x, y); else sx.lineTo(x, y);
      }
      sx.closePath(); sx.fill();
      sx.strokeStyle = 'rgba(118,130,116,.16)'; sx.lineWidth = 1.2; sx.stroke();
      sx.fillStyle = 'rgba(100,112,99,.08)';
      sx.beginPath(); sx.ellipse(-r.r * .15, -r.r * .2, r.r * .48, r.r * .24, -.3, 0, TAU); sx.fill();
      sx.restore();
    }
  }

  function drawFerns() {
    for (const f of ferns) {
      sx.save(); sx.translate(f.x, f.y); sx.rotate(f.seed);
      sx.strokeStyle = 'rgba(37,64,50,.4)'; sx.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU - Math.PI / 2;
        sx.beginPath(); sx.moveTo(0, 0);
        sx.quadraticCurveTo(Math.cos(a) * f.r * .5, Math.sin(a) * f.r * .5 - 3, Math.cos(a) * f.r, Math.sin(a) * f.r);
        sx.stroke();
      }
      sx.restore();
    }
  }

  function drawLamps() {
    for (const l of lamps) {
      sx.save(); sx.translate(l.x, l.y);
      sx.fillStyle = 'rgba(0,0,0,.4)'; sx.beginPath(); sx.arc(4, 4, 7, 0, TAU); sx.fill();
      sx.fillStyle = '#2e3732'; sx.beginPath(); sx.arc(0, 0, 5, 0, TAU); sx.fill();
      sx.fillStyle = 'rgba(224,180,102,.75)'; sx.beginPath(); sx.arc(0, 0, 2.5, 0, TAU); sx.fill();
      const g = sx.createRadialGradient(0, 0, 2, 0, 0, 64);
      g.addColorStop(0, 'rgba(238,190,105,.24)'); g.addColorStop(.35, 'rgba(218,164,85,.08)'); g.addColorStop(1, 'rgba(218,164,85,0)');
      sx.fillStyle = g; sx.beginPath(); sx.arc(0, 0, 64, 0, TAU); sx.fill();
      sx.restore();
    }
  }

  function drawLabels() {
    sx.save();
    sx.textAlign = 'center'; sx.textBaseline = 'middle';
    for (const l of LANDMARKS) {
      sx.font = "600 10px 'Barlow Condensed', sans-serif";
      sx.letterSpacing = '4px';
      sx.fillStyle = 'rgba(171,183,168,.13)';
      sx.fillText(l.label, l.x, l.y + 5);
    }
    sx.restore();
  }

  drawGround();
  drawPaths();
  drawPonds();
  for (const b of buildings) drawBuildingFloor(b);
  drawLabels();
  drawProps();
  drawWindows();
  drawWalls();
  drawFerns();
  drawRocks();
  for (const t of trees) drawTree(t);
  drawLamps();

  // Add a fine grain/vignette baked into the terrain.
  sx.save();
  sx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * WORLD_W, y = Math.random() * WORLD_H;
    sx.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.018)' : 'rgba(0,0,0,.03)';
    sx.fillRect(x, y, 1, 1);
  }
  sx.restore();

  // ── Navigation grid ─────────────────────────────────────────
  const CELL = 20;
  const COLS = Math.ceil(WORLD_W / CELL);
  const ROWS = Math.ceil(WORLD_H / CELL);
  const staticBlocked = new Uint8Array(COLS * ROWS);
  const pad = 2;
  function markRect(r, padding = pad) {
    const x0 = clamp(Math.floor((r.x - padding) / CELL), 0, COLS - 1);
    const x1 = clamp(Math.floor((r.x + r.w + padding) / CELL), 0, COLS - 1);
    const y0 = clamp(Math.floor((r.y - padding) / CELL), 0, ROWS - 1);
    const y1 = clamp(Math.floor((r.y + r.h + padding) / CELL), 0, ROWS - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) staticBlocked[y * COLS + x] = 1;
  }
  function markCircle(c, padding = pad) {
    const rr = c.r + padding;
    const x0 = clamp(Math.floor((c.x - rr) / CELL), 0, COLS - 1);
    const x1 = clamp(Math.floor((c.x + rr) / CELL), 0, COLS - 1);
    const y0 = clamp(Math.floor((c.y - rr) / CELL), 0, ROWS - 1);
    const y1 = clamp(Math.floor((c.y + rr) / CELL), 0, ROWS - 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = x * CELL + CELL / 2, cy = y * CELL + CELL / 2;
      if ((cx - c.x) ** 2 + (cy - c.y) ** 2 < rr * rr) staticBlocked[y * COLS + x] = 1;
    }
  }
  for (const r of rects) if (r.type !== 'prop') markRect(r);
  for (const c of circles) markCircle(c);
  // world edge
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) staticBlocked[y * COLS + x] = 1;
  }

  const dynamicBlocked = new Uint8Array(COLS * ROWS);

  function rebuildDynamicNav() {
    dynamicBlocked.fill(0);
    for (const r of dynamicRects) {
      const x0 = clamp(Math.floor(r.x / CELL), 0, COLS - 1);
      const x1 = clamp(Math.floor((r.x + r.w) / CELL), 0, COLS - 1);
      const y0 = clamp(Math.floor(r.y / CELL), 0, ROWS - 1);
      const y1 = clamp(Math.floor((r.y + r.h) / CELL), 0, ROWS - 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dynamicBlocked[y * COLS + x] = 1;
    }
  }

  const isBlockedCell = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || staticBlocked[y * COLS + x] || dynamicBlocked[y * COLS + x];
  const isWalkable = (wx, wy) => !isBlockedCell(Math.floor(wx / CELL), Math.floor(wy / CELL));

  function nearestWalkableCell(cx, cy) {
    if (!isBlockedCell(cx, cy)) return [cx, cy];
    for (let r = 1; r < 9; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (!isBlockedCell(x, y)) return [x, y];
      }
    }
    return null;
  }

  class MinHeap {
    constructor() { this.items = []; }
    push(node) {
      const a = this.items; a.push(node); let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]]; i = p;
      }
    }
    pop() {
      const a = this.items; const top = a[0]; const last = a.pop();
      if (a.length && last) {
        a[0] = last; let i = 0;
        while (true) {
          const l = i * 2 + 1, r = l + 1; let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
    get length() { return this.items.length; }
  }

  // A* returns world-space waypoints. Called at most a few times per second.
  function findPath(sxW, syW, txW, tyW, maxNodes = 12000) {
    let scx = clamp(Math.floor(sxW / CELL), 0, COLS - 1), scy = clamp(Math.floor(syW / CELL), 0, ROWS - 1);
    let tcx = clamp(Math.floor(txW / CELL), 0, COLS - 1), tcy = clamp(Math.floor(tyW / CELL), 0, ROWS - 1);
    const s = nearestWalkableCell(scx, scy);
    const t = nearestWalkableCell(tcx, tcy);
    if (!s || !t) return null;
    [scx, scy] = s; [tcx, tcy] = t;
    const start = scy * COLS + scx, goal = tcy * COLS + tcx;
    if (start === goal) return [{ x: txW, y: tyW }];
    const gScore = new Float32Array(COLS * ROWS).fill(Infinity);
    const came = new Int32Array(COLS * ROWS).fill(-1);
    const closed = new Uint8Array(COLS * ROWS);
    const heap = new MinHeap();
    gScore[start] = 0;
    heap.push({ i: start, f: 0 });
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let visited = 0;
    while (heap.length && visited < maxNodes) {
      const cur = heap.pop();
      if (closed[cur.i]) continue;
      closed[cur.i] = 1; visited++;
      if (cur.i === goal) break;
      const cx = cur.i % COLS, cy = (cur.i / COLS) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (isBlockedCell(nx, ny)) continue;
        if (dx && dy && (isBlockedCell(cx + dx, cy) || isBlockedCell(cx, cy + dy))) continue;
        const ni = ny * COLS + nx;
        const step = Math.hypot(dx, dy);
        const ng = gScore[cur.i] + step;
        if (ng >= gScore[ni]) continue;
        gScore[ni] = ng;
        came[ni] = cur.i;
        const h = Math.hypot(nx - tcx, ny - tcy);
        heap.push({ i: ni, f: ng + h * 1.05 });
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    let i = goal;
    while (i !== -1 && i !== start) { cells.push(i); i = came[i]; }
    cells.reverse();
    const points = cells.map(i => ({ x: (i % COLS) * CELL + CELL / 2, y: ((i / COLS) | 0) * CELL + CELL / 2 }));
    // Replace the last cell with the actual target if close enough.
    if (points.length) {
      const last = points[points.length - 1];
      if (Math.hypot(last.x - txW, last.y - tyW) < CELL * 1.2 && isWalkable(txW, tyW)) last.x = txW, last.y = tyW;
    }
    return points.length ? points : [{ x: txW, y: tyW }];
  }

  function lineClear(x1, y1, x2, y2, ignoreTrees = false) {
    for (const r of rects) {
      if (r.type !== 'wall' && r.type !== 'prop') continue;
      if (segRect(x1, y1, x2, y2, r)) return false;
    }
    if (!ignoreTrees) {
      for (const c of circles) {
        if (c.type !== 'tree' && c.type !== 'prop' && c.type !== 'rock') continue;
        if (segCircle(x1, y1, x2, y2, c)) return false;
      }
    }
    return true;
  }

  function segRect(x1, y1, x2, y2, r) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    if (maxX < r.x || minX > r.x + r.w || maxY < r.y || minY > r.y + r.h) return false;
    const dx = x2 - x1, dy = y2 - y1;
    let t0 = 0, t1 = 1;
    for (let edge = 0; edge < 4; edge++) {
      let p, q;
      if (edge === 0) { p = -dx; q = x1 - r.x; }
      else if (edge === 1) { p = dx; q = r.x + r.w - x1; }
      else if (edge === 2) { p = -dy; q = y1 - r.y; }
      else { p = dy; q = r.y + r.h - y1; }
      if (Math.abs(p) < 1e-8) { if (q < 0) return false; }
      else {
        const t = q / p;
        if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
        else { if (t < t0) return false; if (t < t1) t1 = t; }
      }
    }
    return true;
  }

  function segCircle(x1, y1, x2, y2, c) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 < 1) return Math.hypot(x1 - c.x, y1 - c.y) < c.r;
    let t = ((c.x - x1) * dx + (c.y - y1) * dy) / l2;
    t = clamp(t, 0, 1);
    return Math.hypot(x1 + t * dx - c.x, y1 + t * dy - c.y) < c.r;
  }

  function moveCircle(ent, dx, dy, radius = 15) {
    const worldMin = 56;
    // X axis
    ent.x += dx;
    for (const r of rects) {
      if (r.type === 'prop') continue;
      if (circleRect(ent.x, ent.y, radius, r)) {
        if (dx > 0) ent.x = r.x - radius;
        else if (dx < 0) ent.x = r.x + r.w + radius;
      }
    }
    for (const r of dynamicRects) {
      if (circleRect(ent.x, ent.y, radius, r)) {
        if (dx > 0) ent.x = r.x - radius;
        else if (dx < 0) ent.x = r.x + r.w + radius;
      }
    }
    for (const c of circles) {
      if (c.type === 'fern') continue;
      const d = Math.hypot(ent.x - c.x, ent.y - c.y);
      if (d < radius + c.r) {
        const amt = radius + c.r - d;
        if (d > 0.001) ent.x += (ent.x - c.x) / d * amt;
      }
    }
    // Y axis
    ent.y += dy;
    for (const r of rects) {
      if (r.type === 'prop') continue;
      if (circleRect(ent.x, ent.y, radius, r)) {
        if (dy > 0) ent.y = r.y - radius;
        else if (dy < 0) ent.y = r.y + r.h + radius;
      }
    }
    for (const r of dynamicRects) {
      if (circleRect(ent.x, ent.y, radius, r)) {
        if (dy > 0) ent.y = r.y - radius;
        else if (dy < 0) ent.y = r.y + r.h + radius;
      }
    }
    for (const c of circles) {
      if (c.type === 'fern') continue;
      const d = Math.hypot(ent.x - c.x, ent.y - c.y);
      if (d < radius + c.r) {
        const amt = radius + c.r - d;
        if (d > 0.001) ent.y += (ent.y - c.y) / d * amt;
      }
    }
    ent.x = clamp(ent.x, worldMin + radius, WORLD_W - worldMin - radius);
    ent.y = clamp(ent.y, worldMin + radius, WORLD_H - worldMin - radius);
    return ent;
  }

  function circleRect(cx, cy, cr, r) {
    const nx = clamp(cx, r.x, r.x + r.w);
    const ny = clamp(cy, r.y, r.y + r.h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < cr * cr;
  }

  return {
    W: WORLD_W, H: WORLD_H,
    canvas: staticCanvas,
    rects, circles, walls, buildings, trees, rocks, props, lamps,
    dynamicRects,
    generators: GENERATOR_SPOTS.map(g => ({ ...g })),
    pallets: PALLET_SPOTS.map(p => ({ ...p })),
    exits: EXIT_SPOTS.map(e => ({ ...e })),
    isWalkable, findPath, lineClear, moveCircle, rebuildDynamicNav, staticBlocked,
    CELL, COLS, ROWS
  };
}
