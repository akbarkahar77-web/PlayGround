import { CLUBS, LEAGUES } from './data.js';
import { getPlayer, squadOf } from './db.js';

export const FORMATIONS = {
  '4-3-3': ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'RW', 'ST', 'LW'],
  '4-2-3-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CDM', 'CAM', 'RW', 'LW', 'ST'],
  '4-4-2': ['GK', 'RB', 'CB', 'CB', 'LB', 'RM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '3-5-2': ['GK', 'CB', 'CB', 'CB', 'RM', 'CM', 'CM', 'CM', 'LM', 'ST', 'ST'],
  '5-3-2': ['GK', 'RB', 'CB', 'CB', 'CB', 'LB', 'CM', 'CM', 'CM', 'ST', 'ST'],
  '4-1-4-1': ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'RM', 'CM', 'CM', 'LM', 'ST'],
};

export const FORMATION_LIST = Object.keys(FORMATIONS);
export const MENTALITIES = ['defensive', 'balanced', 'attacking'];
export const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST'];

const DEF_SLOTS = new Set(['GK', 'CB', 'LB', 'RB']);
const MID_SLOTS = new Set(['CDM', 'CM', 'CAM', 'LM', 'RM']);
const ATT_SLOTS = new Set(['ST', 'LW', 'RW']);

const COMPAT = {
  GK: { GK: 1 },
  CB: { CB: 1, CDM: 0.82, LB: 0.78, RB: 0.78, CM: 0.62 },
  LB: { LB: 1, RB: 0.84, CB: 0.8, LM: 0.82, CM: 0.6 },
  RB: { RB: 1, LB: 0.84, CB: 0.8, RM: 0.82, CM: 0.6 },
  CDM: { CDM: 1, CM: 0.9, CB: 0.8, CAM: 0.7 },
  CM: { CM: 1, CDM: 0.92, CAM: 0.9, LM: 0.8, RM: 0.8, ST: 0.5 },
  CAM: { CAM: 1, CM: 0.9, LW: 0.82, RW: 0.82, ST: 0.75 },
  LM: { LM: 1, LW: 0.95, RM: 0.82, CM: 0.82, LB: 0.78 },
  RM: { RM: 1, RW: 0.95, LM: 0.82, CM: 0.82, RB: 0.78 },
  LW: { LW: 1, LM: 0.95, RW: 0.85, CAM: 0.84, ST: 0.8 },
  RW: { RW: 1, RM: 0.95, LW: 0.85, CAM: 0.84, ST: 0.8 },
  ST: { ST: 1, LW: 0.82, RW: 0.82, CAM: 0.75 },
};

export function positionGroup(pos) {
  if (pos === 'GK') return 'GK';
  if (DEF_SLOTS.has(pos)) return 'DEF';
  if (MID_SLOTS.has(pos)) return 'MID';
  return 'ATT';
}

export function compat(slot, pos) {
  if (slot === 'GK') return pos === 'GK' ? 1 : 0.12;
  if (pos === 'GK') return 0.12;
  return (COMPAT[slot] && COMPAT[slot][pos]) || 0.52;
}

export function effectiveRating(player, slot) {
  const c = compat(slot, player.pos);
  return Math.max(25, player.ovr - (1 - c) * 18);
}

export function autoLineup(clubId, formation = '4-3-3') {
  const slots = FORMATIONS[formation] || FORMATIONS['4-3-3'];
  const pool = squadOf(clubId).slice();
  const chosen = [];
  for (const slot of slots) {
    let best = null;
    let bestScore = -1;
    for (const p of pool) {
      const score = effectiveRating(p, slot) + p.ovr * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      chosen.push(best.id);
      pool.splice(pool.indexOf(best), 1);
    } else {
      chosen.push(null);
    }
  }
  const bench = pool
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, 7)
    .map(p => p.id);
  return { lineup: chosen, bench };
}

export function validateLineup(lineup, clubId) {
  if (!Array.isArray(lineup) || lineup.length !== 11) return false;
  const ids = new Set();
  for (const id of lineup) {
    if (!id || ids.has(id)) return false;
    const p = getPlayer(id);
    if (!p || p.club !== clubId) return false;
    ids.add(id);
  }
  return true;
}

export function bestLineup(clubId, formation) {
  return autoLineup(clubId, formation);
}

function avg(values) {
  if (!values.length) return 55;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function teamStrength(clubId, lineup, formation, mentality = 'balanced', staff = [], isHome = false) {
  const slots = FORMATIONS[formation] || FORMATIONS['4-3-3'];
  const players = slots.map((slot, i) => {
    const p = getPlayer(lineup[i]);
    return {
      slot,
      player: p,
      rating: p ? effectiveRating(p, slot) : 45,
      compatibility: p ? compat(slot, p.pos) : 0.4,
    };
  });
  const def = avg(players.filter(p => DEF_SLOTS.has(p.slot)).map(p => p.rating));
  const mid = avg(players.filter(p => MID_SLOTS.has(p.slot)).map(p => p.rating));
  const att = avg(players.filter(p => ATT_SLOTS.has(p.slot)).map(p => p.rating));
  let atk = att * 0.58 + mid * 0.3 + def * 0.12;
  let dfn = def * 0.55 + mid * 0.3 + att * 0.15;
  const chemistry = avg(players.map(p => p.compatibility));

  // Backroom staff bonuses
  for (const coach of staff) {
    if (!coach) continue;
    const r = coach.rating || 0;
    if (coach.role === 'Assistant Manager') {
      atk += r * 0.35;
      dfn += r * 0.35;
    } else if (coach.role === 'Attacking Coach') {
      atk += r * 0.7;
    } else if (coach.role === 'Defensive Coach') {
      dfn += r * 0.7;
    } else if (coach.role === 'Fitness Coach') {
      atk += r * 0.22;
      dfn += r * 0.22;
    }
  }

  atk += (chemistry - 0.9) * 5;
  dfn += (chemistry - 0.9) * 5;

  if (mentality === 'attacking') {
    atk += 3.5;
    dfn -= 2.5;
  } else if (mentality === 'defensive') {
    atk -= 2.5;
    dfn += 3.5;
  }
  if (isHome) {
    atk += 1.8;
    dfn += 1.5;
  }

  return {
    atk: Math.max(35, atk),
    dfn: Math.max(35, dfn),
    mid: Math.max(35, mid),
    overall: def * 0.33 + mid * 0.34 + att * 0.33,
    chemistry,
    players,
  };
}

export function expectedGoals(atk, dfn, isHome) {
  const base = isHome ? 1.32 : 1.12;
  const ratio = atk / Math.max(45, dfn);
  const xg = base * Math.pow(ratio, 2.35);
  return Math.max(0.12, Math.min(4.4, xg));
}

function weightedPick(items, weightFn) {
  const weights = items.map(weightFn);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)] || null;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const SCORER_WEIGHT = {
  ST: 30, LW: 17, RW: 17, CAM: 13, LM: 10, RM: 10, CM: 7, CDM: 4,
  CB: 3.5, LB: 2.2, RB: 2.2, GK: 0.05,
};

export class MatchSim {
  constructor(homeId, awayId, opts = {}) {
    this.homeId = homeId;
    this.awayId = awayId;
    this.homeFormation = opts.homeFormation || '4-3-3';
    this.awayFormation = opts.awayFormation || '4-3-3';
    this.homeMentality = opts.homeMentality || 'balanced';
    this.awayMentality = opts.awayMentality || 'balanced';
    this.homeStaff = opts.homeStaff || [];
    this.awayStaff = opts.awayStaff || [];
    this.silent = !!opts.silent;
    this.home = CLUBS[homeId];
    this.away = CLUBS[awayId];

    const homeAuto = autoLineup(homeId, this.homeFormation);
    const awayAuto = autoLineup(awayId, this.awayFormation);
    this.homeLineup = opts.homeLineup && validateLineup(opts.homeLineup, homeId) ? opts.homeLineup : homeAuto.lineup;
    this.awayLineup = opts.awayLineup && validateLineup(opts.awayLineup, awayId) ? opts.awayLineup : awayAuto.lineup;
    this.homeBench = homeAuto.bench;
    this.awayBench = awayAuto.bench;

    this.homeStrength = teamStrength(homeId, this.homeLineup, this.homeFormation, this.homeMentality, this.homeStaff, true);
    this.awayStrength = teamStrength(awayId, this.awayLineup, this.awayFormation, this.awayMentality, this.awayStaff, false);
    this.homeXg = expectedGoals(this.homeStrength.atk, this.awayStrength.dfn, true);
    this.awayXg = expectedGoals(this.awayStrength.atk, this.homeStrength.dfn, false);

    const midDiff = this.homeStrength.mid - this.awayStrength.mid;
    this.possessionHome = Math.max(32, Math.min(68, 50 + midDiff * 0.9 + (Math.random() * 6 - 3)));

    this.minute = 0;
    this.hg = 0;
    this.ag = 0;
    this.finished = false;
    this.events = [];
    this.goals = [];
    this.cards = [];
    this.stats = {
      shotsHome: 0, shotsAway: 0,
      onTargetHome: 0, onTargetAway: 0,
      cornersHome: 0, cornersAway: 0,
      foulsHome: 0, foulsAway: 0,
      cardsHome: 0, cardsAway: 0,
    };
  }

  get score() {
    return { home: this.hg, away: this.ag };
  }

  lineupFor(side) {
    return side === 'home' ? this.homeLineup : this.awayLineup;
  }

  clubFor(side) {
    return side === 'home' ? this.home : this.away;
  }

  idFor(side) {
    return side === 'home' ? this.homeId : this.awayId;
  }

  pushEvent(event) {
    this.events.push(event);
    return event;
  }

  chooseScorer(side) {
    const players = this.lineupFor(side)
      .map(id => getPlayer(id))
      .filter(Boolean);
    const pick = weightedPick(players, p => {
      const base = SCORER_WEIGHT[p.pos] || 1;
      return base * (0.6 + (p.sho || p.ovr) / 120);
    });
    return pick;
  }

  chooseAssist(side, scorer) {
    const players = this.lineupFor(side)
      .map(id => getPlayer(id))
      .filter(p => p && p.id !== scorer.id);
    return weightedPick(players, p => {
      const base = p.pos === 'GK' ? 0.2 : 1;
      return base * (0.5 + (p.pas || p.ovr) / 100);
    });
  }

  scoreGoal(side) {
    const scorer = this.chooseScorer(side);
    if (!scorer) return;
    const assist = Math.random() < 0.72 ? this.chooseAssist(side, scorer) : null;
    if (side === 'home') {
      this.hg++;
      this.stats.shotsHome++;
      this.stats.onTargetHome++;
    } else {
      this.ag++;
      this.stats.shotsAway++;
      this.stats.onTargetAway++;
    }
    const club = this.clubFor(side);
    const event = {
      type: 'goal',
      minute: this.minute,
      side,
      clubId: club.id,
      scorerId: scorer.id,
      scorerName: scorer.name,
      assistId: assist ? assist.id : null,
      assistName: assist ? assist.name : null,
      text: `GOAL! ${scorer.name} scores for ${club.name}${assist ? `, assisted by ${assist.name}` : ''}.`,
    };
    this.goals.push(event);
    this.pushEvent(event);
  }

  chance(side) {
    const club = this.clubFor(side);
    const players = this.lineupFor(side).map(id => getPlayer(id)).filter(Boolean);
    const player = weightedPick(players, p => (SCORER_WEIGHT[p.pos] || 1));
    if (!player) return;
    const roll = Math.random();
    if (side === 'home') this.stats.shotsHome++;
    else this.stats.shotsAway++;
    let text;
    if (roll < 0.38) {
      if (side === 'home') this.stats.onTargetHome++;
      else this.stats.onTargetAway++;
      text = `${player.name} forces a fine save from the goalkeeper.`;
    } else if (roll < 0.62) {
      if (side === 'home') this.stats.cornersHome++;
      else this.stats.cornersAway++;
      text = `${club.name} win a corner after ${player.name}'s effort is deflected wide.`;
    } else if (roll < 0.82) {
      text = `${player.name} drags a shot wide of the target for ${club.name}.`;
    } else {
      text = `${player.name} tries a spectacular effort, but it flies over the bar.`;
    }
    this.pushEvent({ type: 'chance', minute: this.minute, side, clubId: club.id, text });
  }

  card(side) {
    const players = this.lineupFor(side).map(id => getPlayer(id)).filter(Boolean);
    const player = weightedPick(players, p => (DEF_SLOTS.has(p.pos) || p.pos === 'CDM' ? 3 : 1));
    if (!player) return;
    const red = Math.random() < 0.025;
    if (side === 'home') this.stats.cardsHome++;
    else this.stats.cardsAway++;
    this.stats.foulsHome += side === 'home' ? 1 : 0;
    this.stats.foulsAway += side === 'away' ? 1 : 0;
    const event = {
      type: red ? 'red' : 'yellow',
      minute: this.minute,
      side,
      clubId: this.idFor(side),
      playerId: player.id,
      text: red
        ? `RED CARD! ${player.name} (${this.clubFor(side).name}) is sent off.`
        : `Yellow card for ${player.name} (${this.clubFor(side).name}).`,
    };
    this.cards.push(event);
    this.pushEvent(event);
  }

  step() {
    if (this.finished) return [];
    this.minute++;
    const before = this.events.length;

    if (this.minute === 46 && !this.silent) {
      this.pushEvent({ type: 'half', minute: 45, text: `Half-time: ${this.home.short} ${this.hg}-${this.ag} ${this.away.short}` });
    }

    if (Math.random() < this.homeXg / 90) this.scoreGoal('home');
    if (Math.random() < this.awayXg / 90) this.scoreGoal('away');

    if (!this.silent) {
      if (Math.random() < 0.036) this.chance(Math.random() < this.possessionHome / 100 ? 'home' : 'away');
      if (Math.random() < 0.00075) this.card(Math.random() < 0.5 ? 'home' : 'away');
    } else {
      if (Math.random() < 0.00045) this.card(Math.random() < 0.5 ? 'home' : 'away');
    }

    if (this.minute >= 90) {
      this.finished = true;
      this.pushEvent({
        type: 'full',
        minute: 90,
        text: `Full-time: ${this.home.short} ${this.hg}-${this.ag} ${this.away.short}`,
      });
    }
    return this.events.slice(before);
  }

  runToEnd() {
    let guard = 0;
    while (!this.finished && guard < 200) {
      this.step();
      guard++;
    }
    return this.result();
  }

  result() {
    return {
      homeId: this.homeId,
      awayId: this.awayId,
      hg: this.hg,
      ag: this.ag,
      goals: this.goals,
      cards: this.cards,
      events: this.events,
      stats: this.stats,
      possessionHome: Math.round(this.possessionHome),
      homeLineup: this.homeLineup,
      awayLineup: this.awayLineup,
      homeFormation: this.homeFormation,
      awayFormation: this.awayFormation,
      homeXg: Math.round(this.homeXg * 10) / 10,
      awayXg: Math.round(this.awayXg * 10) / 10,
      homeRating: Math.round(this.homeStrength.overall * 10) / 10,
      awayRating: Math.round(this.awayStrength.overall * 10) / 10,
    };
  }
}

export function quickSim(homeId, awayId, opts = {}) {
  const sim = new MatchSim(homeId, awayId, { ...opts, silent: true });
  return sim.runToEnd();
}

export function generateLeagueFixtures(clubIds) {
  const teams = [...clubIds];
  const n = teams.length;
  const rounds = [];
  const arr = [...teams];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i];
      let away = arr[n - 1 - i];
      if ((r + i) % 2 === 1) [home, away] = [away, home];
      round.push({ home, away, played: false, hg: null, ag: null, scorers: [] });
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop());
  }
  const reverse = rounds.map(round => round.map(f => ({
    home: f.away,
    away: f.home,
    played: false,
    hg: null,
    ag: null,
    scorers: [],
  })));
  return [...rounds, ...reverse];
}

export function generateAllFixtures() {
  const fixtures = {};
  for (const league of LEAGUES) {
    fixtures[league.id] = generateLeagueFixtures(league.clubs);
  }
  return fixtures;
}

export function computeTable(leagueId, fixtures) {
  const league = LEAGUES.find(l => l.id === leagueId);
  if (!league) return [];
  const rows = new Map();
  for (const clubId of league.clubs) {
    rows.set(clubId, {
      clubId,
      club: CLUBS[clubId],
      played: 0, won: 0, drawn: 0, lost: 0,
      gf: 0, ga: 0, pts: 0, form: [],
    });
  }
  const rounds = fixtures || [];
  for (const round of rounds) {
    for (const f of round) {
      if (!f.played || f.hg == null) continue;
      const home = rows.get(f.home);
      const away = rows.get(f.away);
      if (!home || !away) continue;
      home.played++;
      away.played++;
      home.gf += f.hg;
      home.ga += f.ag;
      away.gf += f.ag;
      away.ga += f.hg;
      if (f.hg > f.ag) {
        home.won++; home.pts += 3; home.form.push('W');
        away.lost++; away.form.push('L');
      } else if (f.hg < f.ag) {
        away.won++; away.pts += 3; away.form.push('W');
        home.lost++; home.form.push('L');
      } else {
        home.drawn++; away.drawn++;
        home.pts++; away.pts++;
        home.form.push('D');
        away.form.push('D');
      }
    }
  }
  const list = [...rows.values()];
  for (const r of list) {
    r.gd = r.gf - r.ga;
    r.form = r.form.slice(-5);
  }
  list.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (b.club.reputation || 0) - (a.club.reputation || 0) || a.club.name.localeCompare(b.club.name));
  list.forEach((r, i) => { r.pos = i + 1; });
  return list;
}

export function topScorers(leagueId, stats, limit = 10) {
  const league = LEAGUES.find(l => l.id === leagueId);
  if (!league) return [];
  const clubSet = new Set(league.clubs);
  const list = [];
  for (const [id, s] of Object.entries(stats || {})) {
    if (!s || !s.goals) continue;
    const p = getPlayer(id);
    if (!p || !p.club || !clubSet.has(p.club)) continue;
    list.push({ player: p, club: CLUBS[p.club], ...s });
  }
  list.sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.player.ovr - a.player.ovr);
  return list.slice(0, limit);
}

// ---------- Economics ----------

export function valueFor(age, ovr, pot) {
  const base = 2.0 * Math.exp((ovr - 60) * 0.12);
  let af;
  if (age <= 20) af = 1.6;
  else if (age <= 22) af = 1.5;
  else if (age <= 24) af = 1.35;
  else if (age <= 27) af = 1.12;
  else if (age <= 29) af = 0.9;
  else if (age <= 31) af = 0.62;
  else if (age <= 33) af = 0.4;
  else af = 0.2;
  const potf = 1 + Math.max(0, pot - ovr) / 55;
  return Math.max(0.15, Math.round(Math.min(240, base * af * potf) * 10) / 10);
}

export function wageFor(age, ovr) {
  let w = 8000 * Math.exp((ovr - 60) * 0.11);
  if (age <= 20) w *= 0.75;
  else if (age >= 33) w *= 0.9;
  return Math.max(1500, Math.round(w / 500) * 500);
}

export function askingPrice(player) {
  const club = CLUBS[player.club];
  const rep = club ? club.reputation : 3;
  let mult = 1.06 + Math.max(0, player.pot - player.ovr) / 55 + rep * 0.025;
  if (player.age <= 21) mult += 0.12;
  if (player.age >= 31) mult -= 0.08;
  return Math.round(player.value * mult * 10) / 10;
}

export function wageDemand(player, userRep = 3) {
  const seller = CLUBS[player.club];
  const sellerRep = seller ? seller.reputation : 3;
  const bump = Math.max(0, userRep - sellerRep) * 0.03;
  return Math.max(1500, Math.round((player.wage * (1.1 + bump) + 500) / 500) * 500);
}

export function matchPrize(pos, totalClubs, reputation) {
  const base = (totalClubs - pos + 1) * 0.9;
  return Math.round((base * (0.6 + reputation * 0.15) + (pos === 1 ? 12 : 0)) * 10) / 10;
}

// ---------- Youth & development ----------

const FIRST_NAMES = {
  England: ['Harry', 'Jude', 'Bukayo', 'Phil', 'Declan', 'Marcus', 'Cole', 'Levi', 'Rico', 'Archie', 'Ollie', 'Jacob', 'Tyler', 'Lewis', 'Callum', 'Reece', 'Kobbie', 'Ethan', 'Sam', 'Finley'],
  Spain: ['Pau', 'Nico', 'Lamine', 'Pedri', 'Gavi', 'Fermín', 'Álvaro', 'Hugo', 'Iker', 'Dani', 'Marc', 'Sergio', 'Aitor', 'Unai', 'Javi', 'Rodrigo', 'Adrián', 'Mateo', 'Bryan', 'Iván'],
  Italy: ['Francesco', 'Nicolò', 'Lorenzo', 'Matteo', 'Federico', 'Riccardo', 'Davide', 'Tommaso', 'Alessandro', 'Giorgio', 'Andrea', 'Simone', 'Pietro', 'Salvatore', 'Marco', 'Luca', 'Edoardo', 'Filippo', 'Giovanni', 'Daniele'],
  Germany: ['Luca', 'Noah', 'Elias', 'Jonas', 'Leon', 'Felix', 'Max', 'Paul', 'Tim', 'Niklas', 'Malik', 'Jamal', 'Florian', 'Lennart', 'Nico', 'Tom', 'Erik', 'Marvin', 'Julian', 'Kai'],
  France: ['Hugo', 'Mathis', 'Enzo', 'Léo', 'Gabriel', 'Rayan', 'Ibrahim', 'Nolan', 'Sacha', 'Yanis', 'Malo', 'Théo', 'Evan', 'Noé', 'Amine', 'Kevin', 'Lucas', 'Jules', 'Ismaël', 'Ayoub'],
  Brazil: ['Gabriel', 'Lucas', 'Matheus', 'João', 'Pedro', 'Rafael', 'Bruno', 'Vinícius', 'Kaique', 'Wesley', 'Danilo', 'Murilo', 'Iago', 'Caio', 'Éder', 'Ruan', 'Yuri', 'Luiz', 'Diego', 'André'],
  Argentina: ['Lautaro', 'Julián', 'Alejandro', 'Santiago', 'Facundo', 'Agustín', 'Tomás', 'Valentín', 'Franco', 'Nicolás', 'Máximo', 'Thiago', 'Bautista', 'Joaquín', 'Enzo', 'Bruno', 'Luka', 'Ian', 'Ramiro', 'Matías'],
  Portugal: ['Diogo', 'Gonçalo', 'Rafael', 'Tiago', 'João', 'Pedro', 'Afonso', 'Duarte', 'Miguel', 'Vasco', 'Rodrigo', 'Hugo', 'Francisco', 'Nuno', 'Tomás', 'André', 'Daniel', 'Luís', 'Martim', 'Simão'],
  Netherlands: ['Daan', 'Sem', 'Lars', 'Thijs', 'Ruben', 'Jesse', 'Mats', 'Sven', 'Bram', 'Joris', 'Stijn', 'Milan', 'Teun', 'Kees', 'Wout', 'Joep', 'Timo', 'Niek', 'Yannick', 'Xavi'],
  Belgium: ['Arthur', 'Louis', 'Noah', 'Jules', 'Lucas', 'Milan', 'Wout', 'Victor', 'Senne', 'Thibaut', 'Maxim', 'Ruben', 'Emile', 'Lander', 'Yorbe', 'Sami', 'Amine', 'Niels', 'Mats', 'Senne'],
  Nigeria: ['Chidi', 'Emeka', 'Tunde', 'Kelechi', 'Samuel', 'Victor', 'David', 'Ola', 'Kingsley', 'Ebere', 'Chinedu', 'Femi', 'Uche', 'Segun', 'Bright', 'Daniel', 'Ifeanyi', 'Tobi', 'Paul', 'Emmanuel'],
  Ghana: ['Kwame', 'Kofi', 'Yaw', 'Kojo', 'Nana', 'Mohammed', 'Issah', 'Daniel', 'Ernest', 'Felix', 'Prince', 'Samuel', 'Emmanuel', 'Isaac', 'Joshua', 'Kelvin', 'Michael', 'Rashid', 'Sadiq', 'Abdul'],
  Senegal: ['Ibrahima', 'Pape', 'Moussa', 'Cheikh', 'Abdou', 'Amadou', 'Lamine', 'Ousmane', 'Samba', 'Mamadou', 'Ibou', 'Assane', 'Baba', 'Lassana', 'Habib', 'Omar', 'Souleymane', 'Modou', 'Aliou', 'Demba'],
  Morocco: ['Youssef', 'Achraf', 'Amine', 'Anas', 'Bilal', 'Ilias', 'Nabil', 'Oussama', 'Sofiane', 'Zakaria', 'Hamza', 'Ismael', 'Mehdi', 'Rachid', 'Samir', 'Yassine', 'Ayoub', 'Karim', 'Nizar', 'Walid'],
  Denmark: ['Mikkel', 'Frederik', 'Emil', 'Oliver', 'Noah', 'Lucas', 'William', 'Magnus', 'Oscar', 'Alfred', 'Anton', 'Malthe', 'Viggo', 'Sander', 'Jonas', 'Rasmus', 'Mads', 'Jeppe', 'Anders', 'Kasper'],
  Sweden: ['Elias', 'Oscar', 'Hugo', 'Lucas', 'Viktor', 'Alexander', 'William', 'Noah', 'Filip', 'Anton', 'Gustav', 'Erik', 'Linus', 'Max', 'Isak', 'Joel', 'Leo', 'Adam', 'Viggo', 'Axel'],
  Norway: ['Emil', 'Jonas', 'Mathias', 'Oliver', 'Elias', 'Sander', 'Magnus', 'Henrik', 'Kristian', 'Martin', 'Andreas', 'Fredrik', 'Oskar', 'Aksel', 'Håkon', 'Sindre', 'Even', 'Tobias', 'Erik', 'Nils'],
  Croatia: ['Luka', 'Ivan', 'Marko', 'Josip', 'Ante', 'Petar', 'Nikola', 'Mateo', 'Filip', 'Dario', 'Stipe', 'Marin', 'Karlo', 'Borna', 'Mislav', 'Tonči', 'Roko', 'Vito', 'Fran', 'Leon'],
  Serbia: ['Luka', 'Stefan', 'Nikola', 'Aleksandar', 'Marko', 'Filip', 'Dušan', 'Nemanja', 'Uroš', 'Miloš', 'Petar', 'Strahinja', 'Vukašin', 'Lazar', 'Andrej', 'Bogdan', 'Ognjen', 'Danilo', 'Mihajlo', 'Vladimir'],
  Poland: ['Jakub', 'Szymon', 'Kacper', 'Antoni', 'Filip', 'Jan', 'Michał', 'Wojciech', 'Piotr', 'Mateusz', 'Bartosz', 'Igor', 'Aleksander', 'Oskar', 'Mikołaj', 'Adam', 'Krzysztof', 'Tomasz', 'Paweł', 'Marcin'],
  Turkey: ['Arda', 'Emir', 'Efe', 'Kerem', 'Berke', 'Can', 'Cem', 'Deniz', 'Ege', 'Furkan', 'Hakan', 'İbrahim', 'Kaan', 'Mert', 'Ozan', 'Ömer', 'Yusuf', 'Alper', 'Burak', 'Serkan'],
  Japan: ['Sota', 'Riku', 'Haruto', 'Yuto', 'Ren', 'Kaito', 'Ayumu', 'Takumi', 'Koki', 'Sho', 'Daiki', 'Hiroki', 'Ryota', 'Shun', 'Yuki', 'Kenta', 'Naoki', 'Tsubasa', 'Koya', 'Ryo'],
  'United States': ['Landon', 'Weston', 'Gio', 'Yunus', 'Ricardo', 'Brandon', 'Caden', 'Jackson', 'Owen', 'Tyler', 'Ethan', 'Noah', 'Liam', 'Mason', 'Logan', 'Caleb', 'Jaden', 'Elijah', 'Cameron', 'Jordan'],
  Mexico: ['Santiago', 'Diego', 'Mateo', 'Emiliano', 'Leonardo', 'Ángel', 'Sergio', 'Andrés', 'Jesús', 'Luis', 'Alejandro', 'Daniel', 'Eduardo', 'Fernando', 'Jorge', 'Ricardo', 'Roberto', 'Carlos', 'Miguel', 'Iván'],
};

const LAST_NAMES = {
  England: ['Smith', 'Johnson', 'Williams', 'Brown', 'Taylor', 'Davies', 'Evans', 'Wilson', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood'],
  Spain: ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Gómez', 'Fernández', 'Ruiz', 'Díaz', 'Moreno', 'Álvarez', 'Romero', 'Navarro', 'Torres', 'Domínguez', 'Vázquez', 'Ramos', 'Gil', 'Serrano', 'Blanco'],
  Italy: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Costa', 'Giordano', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti'],
  Germany: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Kruse'],
  France: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier'],
  Brazil: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa'],
  Argentina: ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Díaz', 'Romero', 'Sosa', 'Torres', 'Álvarez', 'Ruiz', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'Pereyra'],
  Portugal: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira'],
  Netherlands: ['de Jong', 'van Dijk', 'de Vries', 'van den Berg', 'Bakker', 'Jansen', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'de Groot', 'Bos', 'Vos', 'Peters', 'Hendriks', 'van Leeuwen', 'Dekker', 'Brouwer', 'de Wit'],
  Belgium: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Mertens', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Vermeulen', 'Pauwels', 'Hermans', 'Van Damme', 'Michiels', 'Segers', 'Dhondt', 'Coppens', 'Verhoeven', 'De Clercq'],
  Nigeria: ['Okafor', 'Adeyemi', 'Obi', 'Eze', 'Okonkwo', 'Balogun', 'Adebayo', 'Ogunleye', 'Chukwu', 'Nwosu', 'Afolabi', 'Ibrahim', 'Yusuf', 'Bello', 'Olawale', 'Okoro', 'Uche', 'Ajayi', 'Ojo', 'Nwankwo'],
  Ghana: ['Mensah', 'Owusu', 'Boateng', 'Asante', 'Appiah', 'Osei', 'Agyemang', 'Addo', 'Amoah', 'Frimpong', 'Gyasi', 'Sarpong', 'Antwi', 'Baffour', 'Danso', 'Ofori', 'Quaye', 'Tetteh', 'Yeboah', 'Nkrumah'],
  Senegal: ['Diallo', 'Ndiaye', 'Sarr', 'Fall', 'Gueye', 'Ba', 'Diop', 'Cissé', 'Faye', 'Thiam', 'Kane', 'Sy', 'Camara', 'Traoré', 'Diatta', 'Mendy', 'Sow', 'Niang', 'Badji', 'Seck'],
  Morocco: ['El Amrani', 'Bennani', 'Alaoui', 'Idrissi', 'Ouahbi', 'Tazi', 'Berrada', 'Chraibi', 'Fassi', 'Lahlou', 'Mansouri', 'Naciri', 'Rahmani', 'Saidi', 'Ziani', 'Bouzid', 'Haddad', 'Kabbaj', 'Moutaouakil', 'Ouali'],
  Denmark: ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen', 'Jørgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen', 'Thomsen', 'Christiansen', 'Poulsen', 'Johansen', 'Møller', 'Mortensen'],
  Sweden: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Olsson', 'Persson', 'Svensson', 'Gustafsson', 'Pettersson', 'Jonsson', 'Lindberg', 'Berg', 'Lindström', 'Lund', 'Ek', 'Holm', 'Wallin', 'Dahl'],
  Norway: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nilsen', 'Kristiansen', 'Jensen', 'Karlsen', 'Johnsen', 'Pettersen', 'Eriksen', 'Berg', 'Haugen', 'Hagen', 'Johannessen', 'Andreassen', 'Dahl', 'Halvorsen'],
  Croatia: ['Horvat', 'Kovačević', 'Babić', 'Marić', 'Jurić', 'Novak', 'Kovač', 'Knežević', 'Vuković', 'Marković', 'Petrović', 'Matić', 'Tomić', 'Pavlović', 'Kralj', 'Božić', 'Blažević', 'Grgić', 'Perić', 'Šimić'],
  Serbia: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović', 'Ilić', 'Stanković', 'Pavlović', 'Milošević', 'Kostić', 'Ristić', 'Lazić', 'Todorović', 'Simić', 'Vuković', 'Popović', 'Mitić', 'Radović', 'Bogdanović'],
  Poland: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Kwiatkowski', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Nowicki', 'Pawłowski'],
  Turkey: ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek'],
  Japan: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Yamaguchi', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Saito'],
  'United States': ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Garcia', 'Rodriguez', 'Wilson', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White'],
  Mexico: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Mendoza'],
};

const COUNTRY_POOL = Object.keys(FIRST_NAMES);

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function youthNation(clubCountry) {
  if (Math.random() < 0.62) return clubCountry;
  return randPick(COUNTRY_POOL);
}

export function generateYouthPlayer(clubCountry, academyLevel, youthCoachRating, id, opts = {}) {
  const nation = opts.nation || youthNation(clubCountry);
  const first = FIRST_NAMES[nation] || FIRST_NAMES.England;
  const last = LAST_NAMES[nation] || LAST_NAMES.England;
  const name = `${randPick(first)} ${randPick(last)}`;
  const age = 15 + Math.floor(Math.random() * 4);
  const roll = Math.random();
  let pos;
  if (roll < 0.08) pos = 'GK';
  else if (roll < 0.38) pos = randPick(['CB', 'LB', 'RB']);
  else if (roll < 0.72) pos = randPick(['CDM', 'CM', 'CAM', 'LM', 'RM']);
  else pos = randPick(['ST', 'LW', 'RW']);
  const baseOvr = 34 + academyLevel * 3 + Math.floor(Math.random() * 11);
  const ovr = Math.min(68, baseOvr);
  const coachBoost = (youthCoachRating || 0) * 2.2;
  const pot = Math.min(95, Math.round(ovr + 12 + Math.random() * 20 + coachBoost + academyLevel * 1.5));
  const value = valueFor(age, ovr, pot) * 0.55;
  return {
    id,
    name,
    age,
    nation,
    flag: nationFlag(nation),
    pos,
    ovr,
    pot,
    value: Math.round(value * 10) / 10,
    wage: Math.max(1000, Math.round((900 + academyLevel * 250 + Math.random() * 700) / 500) * 500),
    club: null,
    foot: Math.random() < 0.72 ? 'Right' : 'Left',
    height: 165 + Math.floor(Math.random() * 25),
    contract: 3,
    pac: Math.max(35, Math.min(85, ovr + Math.floor(Math.random() * 16 - 8))),
    sho: Math.max(30, Math.min(80, ovr + Math.floor(Math.random() * 16 - 10))),
    pas: Math.max(30, Math.min(80, ovr + Math.floor(Math.random() * 16 - 10))),
    dri: Math.max(30, Math.min(85, ovr + Math.floor(Math.random() * 16 - 8))),
    def: Math.max(25, Math.min(80, ovr + Math.floor(Math.random() * 16 - 10))),
    phy: Math.max(30, Math.min(85, ovr + Math.floor(Math.random() * 16 - 8))),
    gk_div: pos === 'GK' ? Math.max(35, Math.min(80, ovr + 3)) : 0,
    gk_han: pos === 'GK' ? Math.max(35, Math.min(80, ovr + 1)) : 0,
    gk_kic: pos === 'GK' ? Math.max(35, Math.min(80, ovr - 2)) : 0,
    gk_pos: pos === 'GK' ? Math.max(35, Math.min(80, ovr + 2)) : 0,
    gk_ref: pos === 'GK' ? Math.max(35, Math.min(80, ovr + 4)) : 0,
    sm: Math.floor(Math.random() * 4),
    wf: 1 + Math.floor(Math.random() * 4),
    custom: true,
  };
}

export function developPlayer(player, youthCoachRating = 0, fitnessRating = 0) {
  player.age += 1;
  const gap = Math.max(0, player.pot - player.ovr);
  let delta = 0;
  if (player.age <= 20) {
    delta = (Math.random() < 0.85 ? 1 : 0) + (Math.random() < 0.55 ? 1 : 0) + (gap > 6 ? 1 : 0);
    delta += Math.round((youthCoachRating || 0) * 0.22);
  } else if (player.age <= 23) {
    delta = (Math.random() < 0.65 ? 1 : 0) + (gap > 5 && Math.random() < 0.35 ? 1 : 0);
    delta += Math.round((youthCoachRating || 0) * 0.15);
  } else if (player.age <= 27) {
    delta = gap > 0 && Math.random() < 0.3 ? 1 : 0;
  } else if (player.age <= 30) {
    delta = Math.random() < 0.22 ? -1 : 0;
  } else if (player.age <= 33) {
    delta = -1 - (Math.random() < 0.25 ? 1 : 0);
  } else {
    delta = -2 - Math.floor(Math.random() * 2);
  }
  if (player.age <= 24 && gap === 0) delta = Math.min(delta, 0);
  player.ovr = Math.max(35, Math.min(player.pot, player.ovr + delta));
  if (player.ovr >= player.pot && player.age <= 24) player.pot = Math.min(95, player.pot + (Math.random() < 0.4 ? 1 : 0));
  if (player.age >= 25) player.pot = Math.max(player.ovr, player.pot);
  player.value = valueFor(player.age, player.ovr, player.pot);
  player.wage = wageFor(player.age, player.ovr);
  player.contract = (player.contract || 1) - 1;
  if (player.contract <= 0) {
    player.contract = 3;
    player.wage = Math.round(player.wage * 1.08 / 500) * 500;
  }
  return player;
}

const FLAG_MAP = {
  England: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', Scotland: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', Wales: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  France: '🇫🇷', Spain: '🇪🇸', Italy: '🇮🇹', Germany: '🇩🇪', Portugal: '🇵🇹', Brazil: '🇧🇷',
  Argentina: '🇦🇷', Netherlands: '🇳🇱', Belgium: '🇧🇪', Croatia: '🇭🇷', Serbia: '🇷🇸',
  Poland: '🇵🇱', Denmark: '🇩🇰', Sweden: '🇸🇪', Norway: '🇳🇴', Switzerland: '🇨🇭',
  Austria: '🇦🇹', Turkey: '🇹🇷', Greece: '🇬🇷', Ukraine: '🇺🇦', Russia: '🇷🇺',
  'Czech Republic': '🇨🇿', Slovakia: '🇸🇰', Slovenia: '🇸🇮', Hungary: '🇭🇺', Romania: '🇷🇴',
  Uruguay: '🇺🇾', Colombia: '🇨🇴', Chile: '🇨🇱', Peru: '🇵🇪', Ecuador: '🇪🇨',
  Paraguay: '🇵🇾', Venezuela: '🇻🇪', Bolivia: '🇧🇴', Mexico: '🇲🇽', 'United States': '🇺🇸',
  Canada: '🇨🇦', 'Costa Rica': '🇨🇷', Jamaica: '🇯🇲', Morocco: '🇲🇦', Algeria: '🇩🇿',
  Tunisia: '🇹🇳', Egypt: '🇪🇬', Senegal: '🇸🇳', 'Ivory Coast': '🇨🇮', "Côte d'Ivoire": '🇨🇮',
  Ghana: '🇬🇭', Nigeria: '🇳🇬', Cameroon: '🇨🇲', Mali: '🇲🇱', 'Burkina Faso': '🇧🇫',
  Guinea: '🇬🇳', 'South Africa': '🇿🇦', Kenya: '🇰🇪', Japan: '🇯🇵', 'Korea Republic': '🇰🇷',
  Australia: '🇦🇺', 'New Zealand': '🇳🇿', 'Saudi Arabia': '🇸🇦', Iran: '🇮🇷', Iraq: '🇮🇶',
  Israel: '🇮🇱', Georgia: '🇬🇪', Albania: '🇦🇱', Kosovo: '🇽🇰', 'Bosnia and Herzegovina': '🇧🇦',
  'North Macedonia': '🇲🇰', Montenegro: '🇲🇪', Finland: '🇫🇮', Iceland: '🇮🇸', Cyprus: '🇨🇾',
  Luxembourg: '🇱🇺', Estonia: '🇪🇪', Latvia: '🇱🇻', Lithuania: '🇱🇹', Belarus: '🇧🇾',
  Moldova: '🇲🇩', Armenia: '🇦🇲', Azerbaijan: '🇦🇿', Kazakhstan: '🇰🇿', Uzbekistan: '🇺🇿',
  India: '🇮🇳', Indonesia: '🇮🇩', Thailand: '🇹🇭', Philippines: '🇵🇭', 'China PR': '🇨🇳',
  Curaçao: '🇨🇼', Suriname: '🇸🇷', Guyana: '🇬🇾', Haiti: '🇭🇹', 'Trinidad and Tobago': '🇹🇹',
  'Cape Verde Islands': '🇨🇻', 'Guinea-Bissau': '🇬🇼', 'Equatorial Guinea': '🇬🇶',
  Gabon: '🇬🇦', Congo: '🇨🇬', 'Congo DR': '🇨🇩', Angola: '🇦🇴', Zambia: '🇿🇲',
  Zimbabwe: '🇿🇼', Tanzania: '🇹🇿', Uganda: '🇺🇬', Rwanda: '🇷🇼', Mozambique: '🇲🇿',
  Namibia: '🇳🇦', Madagascar: '🇲🇬', Malawi: '🇲🇼', Liberia: '🇱🇷', 'Sierra Leone': '🇸🇱',
  Togo: '🇹🇬', Benin: '🇧🇯', Gambia: '🇬🇲', Mauritania: '🇲🇷', Libya: '🇱🇾',
  Sudan: '🇸🇩', Somalia: '🇸🇴', Jordan: '🇯🇴', Lebanon: '🇱🇧', Syria: '🇸🇾',
  Palestine: '🇵🇸', 'United Arab Emirates': '🇦🇪', Honduras: '🇭🇳', Guatemala: '🇬🇹',
  'El Salvador': '🇸🇻', Panama: '🇵🇦', Cuba: '🇨🇺', 'Dominican Republic': '🇩🇴',
  'Puerto Rico': '🇵🇷', Barbados: '🇧🇧', Bermuda: '🇧🇲', Grenada: '🇬🇩',
  'St. Lucia': '🇱🇨', 'St. Kitts and Nevis': '🇰🇳', 'Antigua and Barbuda': '🇦🇬',
  Montserrat: '🇲🇸', 'Faroe Islands': '🇫🇴', Malta: '🇲🇹', Andorra: '🇦🇩',
  Liechtenstein: '🇱🇮', 'Chinese Taipei': '🇹🇼', 'Hong Kong': '🇭🇰', Fiji: '🇫🇯',
  Vanuatu: '🇻🇺', 'Sri Lanka': '🇱🇰', Nepal: '🇳🇵', Bangladesh: '🇧🇩',
};

export function nationFlag(nation) {
  return FLAG_MAP[nation] || '🏳️';
}

export function coachRatingStars(rating) {
  return '★'.repeat(Math.floor(rating)) + (rating % 1 >= 0.5 ? '½' : '');
}
