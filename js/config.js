export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleDiff = (a, b) => {
  let d = (a - b + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return Math.abs(d - Math.PI);
};
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const fmtTime = s => {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const MATCH_TIME = 8 * 60;
export const GENS_REQUIRED = 5;
export const GEN_PROGRESS = 100;
export const GATE_PROGRESS = 100;

export const THREATS = {
  whisper: {
    id: 'whisper', label: 'WHISPER',
    killerSpeed: 166, killerDetect: 510, killerHearing: 560, attackCd: 1.22, reaction: 0.54,
    botSkill: 0.8, repairRate: 5.1, gateRate: 7.4, fleeAt: 345
  },
  nightmare: {
    id: 'nightmare', label: 'NIGHTMARE',
    killerSpeed: 183, killerDetect: 650, killerHearing: 760, attackCd: 1.02, reaction: 0.34,
    botSkill: 0.9, repairRate: 5.35, gateRate: 7.8, fleeAt: 390
  },
  oblivion: {
    id: 'oblivion', label: 'OBLIVION',
    killerSpeed: 196, killerDetect: 790, killerHearing: 940, attackCd: 0.88, reaction: 0.18,
    botSkill: 0.96, repairRate: 5.55, gateRate: 8.2, fleeAt: 430
  }
};

export const ROSTER = [
  {
    id: 'mara', name: 'MARA VOSS', short: 'MARA', job: 'MECHANIC',
    perk: 'SALVAGE', perkText: 'Repairs generators 12% faster.',
    skin: '#c09170', shirt: '#435b52', pants: '#2c3936', hat: '#9a563a', accent: '#d6a86a',
    repair: 1.12, revive: 1, speed: 1, vision: 0
  },
  {
    id: 'ellis', name: 'ELLIS ROWE', short: 'ELLIS', job: 'PARAMEDIC',
    perk: 'SECOND WIND', perkText: 'Revives teammates 30% faster.',
    skin: '#8a624c', shirt: '#7d6d3e', pants: '#33382f', hat: '#b9a36a', accent: '#d3bd7a',
    repair: 0.95, revive: 1.3, speed: 1.0, vision: 0
  },
  {
    id: 'juno', name: 'JUNO PARK', short: 'JUNO', job: 'TRACKER',
    perk: 'LIGHT FEET', perkText: 'Moves 5% faster and makes less noise.',
    skin: '#caa583', shirt: '#5d4a64', pants: '#2c2c3b', hat: '#3d334a', accent: '#b48fc8',
    repair: 0.96, revive: 1, speed: 1.05, vision: 20
  },
  {
    id: 'silas', name: 'SILAS VANE', short: 'SILAS', job: 'ARCHIVIST',
    perk: 'FIELD NOTES', perkText: 'Senses objectives and allies from farther away.',
    skin: '#b98b68', shirt: '#384b5b', pants: '#283238', hat: '#2e3d42', accent: '#87aec5',
    repair: 1.0, revive: 1, speed: 0.99, vision: 70
  }
];

export const SURVIVOR_SPAWNS = [
  { x: 260, y: 1510 },
  { x: 2370, y: 255 },
  { x: 2250, y: 1650 },
  { x: 660, y: 1480 }
];

export const KILLER_SPAWN = { x: 1340, y: 855 };
export const SURVIVOR_SPEED = 151;
export const SURVIVOR_SPRINT = 224;
export const SURVIVOR_CROUCH = 79;
export const KILLER_RADIUS = 19;
export const SURVIVOR_RADIUS = 13;
