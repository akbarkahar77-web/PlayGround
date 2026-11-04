import { CLUBS, LEAGUES, COACHES } from './data.js';
import {
  DB, resetDB, addPlayer, movePlayer, refreshClubSquads, getPlayer, squadOf,
} from './db.js';
import {
  FORMATIONS, autoLineup, validateLineup, MatchSim, quickSim,
  generateAllFixtures, computeTable, topScorers, generateYouthPlayer,
  developPlayer, matchPrize, askingPrice, wageDemand, valueFor, wageFor,
} from './engine.js';

const SAVE_KEY = 'touchline-save-v1';
const SAVE_VERSION = 1;

export let state = null;

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function getSavedSummary() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.clubId) return null;
    return {
      manager: data.manager,
      clubId: data.clubId,
      season: data.season,
      round: data.round,
      seasonOver: data.seasonOver,
    };
  } catch {
    return null;
  }
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function quitToMenu() {
  state = null;
  deleteSave();
}

export function getUserClub() {
  if (!state) return null;
  return CLUBS[state.clubId];
}

export function getUserLeague() {
  const club = getUserClub();
  return club ? LEAGUES.find(l => l.id === club.league) : null;
}

export function getUserSquad() {
  if (!state) return [];
  return squadOf(state.clubId);
}

export function getUserWageBill() {
  return getUserSquad().reduce((sum, p) => sum + p.wage, 0);
}

export function getUserStaffWages() {
  if (!state) return 0;
  return state.staff.reduce((sum, c) => sum + c.wage * 1000, 0);
}

export function getObjective() {
  const club = getUserClub();
  const league = getUserLeague();
  if (!club || !league) return { position: 10, label: 'Build a competitive team' };
  const n = league.clubs.length;
  const rep = club.reputation;
  let pos;
  if (rep >= 4.75) pos = 1;
  else if (rep >= 4.25) pos = 2;
  else if (rep >= 3.75) pos = 4;
  else if (rep >= 3.25) pos = 6;
  else if (rep >= 2.75) pos = 8;
  else if (rep >= 2.25) pos = 10;
  else if (rep >= 1.75) pos = Math.min(14, n - 3);
  else pos = n - 2;
  let label;
  if (pos === 1) label = 'Win the league';
  else if (pos === 2) label = 'Finish in the top 2';
  else if (pos >= n - 3) label = 'Avoid relegation';
  else label = `Finish in the top ${pos}`;
  return { position: pos, label };
}

export function boardLabel(confidence) {
  if (confidence >= 85) return 'Delighted';
  if (confidence >= 70) return 'Pleased';
  if (confidence >= 50) return 'Content';
  if (confidence >= 35) return 'Concerned';
  if (confidence >= 20) return 'Under pressure';
  return 'On the brink';
}

function seasonLabel(season) {
  return `${season}/${String(season + 1).slice(-2)}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function addNews(text, type = 'info') {
  if (!state) return;
  state.news.unshift({
    id: uid(),
    season: state.season,
    round: state.round,
    type,
    text,
    date: `MD ${Math.min(state.round + 1, 38)}`,
  });
  if (state.news.length > 45) state.news.length = 45;
}

function makeYouth(level, coachRating, count) {
  const club = getUserClub();
  const country = getUserLeague()?.country || 'England';
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = generateYouthPlayer(country, level, coachRating, `y${state.nextYouthId++}`);
    out.push(p);
  }
  return out;
}

export function startNewGame(manager, clubId) {
  resetDB();
  const club = CLUBS[clubId];
  if (!club) throw new Error('Unknown club');
  const league = LEAGUES.find(l => l.id === club.league);
  const academyLevel = club.reputation >= 4.5 ? 3 : club.reputation >= 3 ? 2 : 1;
  const season = 2024;
  state = {
    version: SAVE_VERSION,
    manager: manager || 'Alex Morgan',
    clubId,
    season,
    seasonLabel: seasonLabel(season),
    round: 0,
    formation: '4-3-3',
    mentality: 'balanced',
    lineup: [],
    budgets: {
      transfer: club.budget,
      wage: club.wageBudget,
    },
    balance: Math.round((club.budget * 1.6 + 15) * 10) / 10,
    academy: { level: academyLevel },
    staff: [],
    youth: [],
    news: [],
    fixtures: {},
    playerStats: {},
    boardConfidence: 65,
    finances: { income: 0, expenses: 0, gate: 0, prize: 0, transferSpent: 0, transferReceived: 0 },
    history: [],
    transfers: [],
    seasonOver: false,
    seasonSummary: null,
    sacked: false,
    lastResult: null,
    nextYouthId: 1,
    activeView: 'dashboard',
  };
  state.objective = getObjective();
  state.fixtures = generateAllFixtures();
  const auto = autoLineup(clubId, state.formation);
  state.lineup = auto.lineup;
  state.youth = makeYouth(state.academy.level, 0, 6);
  addNews(`Welcome to ${club.name}. The board has appointed you as manager for the ${state.seasonLabel} season.`, 'board');
  addNews(`Board objective: ${state.objective.label}. Transfer budget: £${club.budget.toFixed(1)}m.`, 'board');
  addNews('Your backroom team is empty. Visit Staff to hire coaches and improve player development.', 'staff');
  addNews('Your academy has produced a first group of prospects. Check the Youth Academy.', 'youth');
  saveGame();
  return state;
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION || !data.clubId || !CLUBS[data.clubId]) return false;
    resetDB();
    const overrides = data.overrides || {};
    const custom = data.custom || [];
    delete data.overrides;
    delete data.custom;
    for (const [id, arr] of Object.entries(overrides)) {
      const p = DB.byId.get(id);
      if (!p || !Array.isArray(arr)) continue;
      const [club, ovr, pot, age, value, wage, contract] = arr;
      p.club = club;
      p.ovr = ovr;
      p.pot = pot;
      p.age = age;
      p.value = value;
      p.wage = wage;
      p.contract = contract;
    }
    for (const p of custom) {
      if (!p || !p.id) continue;
      if (!DB.byId.has(p.id)) {
        p.custom = true;
        DB.players.push(p);
      }
    }
    refreshClubSquads();
    state = data;
    state.playerStats = state.playerStats || {};
    state.news = state.news || [];
    state.staff = state.staff || [];
    state.youth = state.youth || [];
    state.history = state.history || [];
    state.transfers = state.transfers || [];
    state.finances = state.finances || { income: 0, expenses: 0, gate: 0, prize: 0, transferSpent: 0, transferReceived: 0 };
    state.nextYouthId = state.nextYouthId || 1000;
    state.objective = getObjective();
    if (!validateLineup(state.lineup, state.clubId)) {
      state.lineup = autoLineup(state.clubId, state.formation).lineup;
    }
    if (!state.fixtures || !state.fixtures[getUserLeague()?.id]) {
      state.fixtures = generateAllFixtures();
    }
    return true;
  } catch (err) {
    console.error('Failed to load save', err);
    return false;
  }
}

export function saveGame() {
  if (!state) return false;
  try {
    const overrides = {};
    for (const p of DB.players) {
      if (p.custom) continue;
      const base = DB.baseById.get(p.id);
      if (!base) continue;
      if (p.club !== base.club || p.ovr !== base.ovr || p.pot !== base.pot ||
          p.age !== base.age || p.value !== base.value || p.wage !== base.wage ||
          p.contract !== base.contract) {
        overrides[p.id] = [p.club, p.ovr, p.pot, p.age, p.value, p.wage, p.contract];
      }
    }
    const custom = DB.players.filter(p => p.custom).map(p => ({ ...p }));
    const payload = { ...state, overrides, custom };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('Failed to save', err);
    return false;
  }
}

export function getUserFixture() {
  const league = getUserLeague();
  if (!league) return null;
  const rounds = state.fixtures[league.id] || [];
  const round = rounds[state.round];
  if (!round) return null;
  return round.find(f => f.home === state.clubId || f.away === state.clubId) || null;
}

export function getLeagueRounds() {
  const league = getUserLeague();
  return league ? (state.fixtures[league.id] || []) : [];
}

export function isUserHome(fixture) {
  return fixture && fixture.home === state.clubId;
}

export function createUserMatch() {
  const fixture = getUserFixture();
  if (!fixture) return null;
  const home = fixture.home === state.clubId;
  return new MatchSim(fixture.home, fixture.away, {
    homeFormation: home ? state.formation : '4-3-3',
    awayFormation: home ? '4-3-3' : state.formation,
    homeMentality: home ? state.mentality : 'balanced',
    awayMentality: home ? 'balanced' : state.mentality,
    homeLineup: home ? state.lineup : null,
    awayLineup: home ? null : state.lineup,
    homeStaff: home ? state.staff : [],
    awayStaff: home ? [] : state.staff,
    silent: false,
  });
}

function ensureStat(id) {
  if (!state.playerStats[id]) {
    state.playerStats[id] = { apps: 0, goals: 0, assists: 0, ratingSum: 0, ratingCount: 0 };
  }
  return state.playerStats[id];
}

function recordGoals(result) {
  for (const g of result.goals) {
    if (g.scorerId) ensureStat(g.scorerId).goals++;
    if (g.assistId) ensureStat(g.assistId).assists++;
  }
}

function recordUserApps(result, userHome, won, drew) {
  const lineup = userHome ? result.homeLineup : result.awayLineup;
  const goalsBy = {};
  const assistsBy = {};
  for (const g of result.goals) {
    if (g.scorerId) goalsBy[g.scorerId] = (goalsBy[g.scorerId] || 0) + 1;
    if (g.assistId) assistsBy[g.assistId] = (assistsBy[g.assistId] || 0) + 1;
  }
  for (const id of lineup) {
    if (!id) continue;
    const s = ensureStat(id);
    s.apps++;
    let rating = 6.3 + (won ? 0.45 : drew ? 0.1 : -0.25) + Math.random() * 0.5;
    rating += (goalsBy[id] || 0) * 1.15 + (assistsBy[id] || 0) * 0.55;
    rating = Math.max(4, Math.min(10, rating));
    s.ratingSum += rating;
    s.ratingCount++;
  }
}

function applyFixtureResult(fixture, result, keepDetail = false) {
  fixture.played = true;
  fixture.hg = result.hg;
  fixture.ag = result.ag;
  fixture.scorers = result.goals.map(g => ({
    side: g.side === 'home' ? 'h' : 'a',
    minute: g.minute,
    name: g.scorerName,
  }));
  if (keepDetail) {
    fixture.stats = result.stats;
    fixture.possessionHome = result.possessionHome;
    fixture.xg = [result.homeXg, result.awayXg];
    fixture.ratings = [result.homeRating, result.awayRating];
  }
}

function simulateOthersThisRound() {
  for (const league of LEAGUES) {
    const rounds = state.fixtures[league.id] || [];
    const round = rounds[state.round];
    if (!round) continue;
    for (const fixture of round) {
      if (fixture.played) continue;
      const result = quickSim(fixture.home, fixture.away);
      applyFixtureResult(fixture, result);
      recordGoals(result);
    }
  }
}

function weeklyFinances(userWasHome) {
  const club = getUserClub();
  if (!club) return;
  const rep = club.reputation;
  const wages = getUserWageBill() / 1_000_000;
  const staffWages = getUserStaffWages() / 1_000_000;
  const sponsor = 0.05 + rep * 0.05;
  const tv = 0.1 + rep * rep * 0.08;
  const commercial = rep * 0.08;
  const gate = userWasHome ? club.capacity * 0.00003 : 0;
  const academy = state.academy.level * 0.03;
  const operations = 0.05 + rep * 0.03;
  const income = sponsor + tv + commercial + gate;
  const expenses = wages + staffWages + academy + operations;
  const net = income - expenses;
  state.balance = Math.round((state.balance + net) * 1000) / 1000;
  state.finances.income = Math.round((state.finances.income + income) * 1000) / 1000;
  state.finances.expenses = Math.round((state.finances.expenses + expenses) * 1000) / 1000;
  state.finances.gate = Math.round((state.finances.gate + gate) * 1000) / 1000;
  if (state.balance < 0) {
    state.boardConfidence = Math.max(0, state.boardConfidence - 0.6);
  }
}

export function completeUserMatch(result) {
  const fixture = getUserFixture();
  if (!fixture) return { ok: false };
  const userHome = fixture.home === state.clubId;
  const won = userHome ? result.hg > result.ag : result.ag > result.hg;
  const drew = result.hg === result.ag;
  applyFixtureResult(fixture, result, true);
  recordGoals(result);
  recordUserApps(result, userHome, won, drew);
  state.lastResult = {
    home: fixture.home,
    away: fixture.away,
    hg: result.hg,
    ag: result.ag,
    userHome,
    won,
    drew,
  };

  const oppRating = userHome ? result.awayRating : result.homeRating;
  const myRating = userHome ? result.homeRating : result.awayRating;
  let change = won ? 4 : drew ? 1 : -3;
  if (won && oppRating > myRating + 2) change += 1.5;
  if (!won && oppRating < myRating - 2) change -= 1.5;
  state.boardConfidence = Math.max(0, Math.min(100, state.boardConfidence + change));

  const homeClub = CLUBS[fixture.home];
  const awayClub = CLUBS[fixture.away];
  addNews(
    `${homeClub.short} ${result.hg}-${result.ag} ${awayClub.short} — ${won ? 'Important win' : drew ? 'A share of the points' : 'Defeat'} for ${getUserClub().short}.`,
    won ? 'win' : drew ? 'draw' : 'loss'
  );

  simulateOthersThisRound();
  state.round++;
  weeklyFinances(userHome);
  saveGame();

  const league = getUserLeague();
  const rounds = state.fixtures[league.id] || [];
  if (state.round >= rounds.length) {
    finishSeason();
  }
  return { ok: true, seasonOver: state.seasonOver };
}

export function instantUserMatch() {
  const sim = createUserMatch();
  if (!sim) return null;
  const result = sim.runToEnd();
  completeUserMatch(result);
  return result;
}

export function getUserTable() {
  const league = getUserLeague();
  if (!league) return [];
  return computeTable(league.id, state.fixtures[league.id]);
}

export function getTable(leagueId) {
  return computeTable(leagueId, state.fixtures[leagueId]);
}

export function getUserPosition() {
  const table = getUserTable();
  return table.find(r => r.clubId === state.clubId)?.pos || 0;
}

export function getTopScorers(leagueId, limit = 10) {
  return topScorers(leagueId, state.playerStats, limit);
}

export function finishSeason() {
  if (state.seasonOver) return;
  const maxRounds = Math.max(...LEAGUES.map(l => (state.fixtures[l.id] || []).length));
  for (let r = state.round; r < maxRounds; r++) {
    for (const league of LEAGUES) {
      const rounds = state.fixtures[league.id] || [];
      const round = rounds[r];
      if (!round) continue;
      for (const fixture of round) {
        if (fixture.played) continue;
        const result = quickSim(fixture.home, fixture.away);
        applyFixtureResult(fixture, result);
        recordGoals(result);
      }
    }
  }
  const league = getUserLeague();
  const table = computeTable(league.id, state.fixtures[league.id]);
  const row = table.find(r => r.clubId === state.clubId);
  const position = row ? row.pos : league.clubs.length;
  const champion = table[0];
  const prize = matchPrize(position, league.clubs.length, getUserClub().reputation);
  state.budgets.transfer = Math.round((state.budgets.transfer + prize) * 10) / 10;
  state.balance = Math.round((state.balance + prize) * 10) / 10;
  state.finances.prize = Math.round((state.finances.prize + prize) * 10) / 10;

  const objective = state.objective || getObjective();
  let confidenceChange;
  let boardMessage;
  if (position <= objective.position) {
    confidenceChange = position === 1 ? 24 : 16;
    boardMessage = `The board is delighted: ${position === 1 ? 'you won the league' : `you finished ${position}${position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}`}.`;
  } else if (position <= objective.position + 4) {
    confidenceChange = -8;
    boardMessage = `The board expected ${objective.label.toLowerCase()}, but you finished ${position}th. They are disappointed.`;
  } else {
    confidenceChange = -28;
    boardMessage = `The board expected ${objective.label.toLowerCase()}. Finishing ${position}th is unacceptable.`;
  }
  state.boardConfidence = Math.max(0, Math.min(100, state.boardConfidence + confidenceChange));
  state.sacked = state.boardConfidence < 20;
  if (state.sacked) {
    boardMessage += ' You have been dismissed.';
  }

  state.history.push({
    season: state.season,
    seasonLabel: state.seasonLabel,
    league: league.name,
    position,
    points: row ? row.pts : 0,
    champion: champion?.club.name || '',
    prize,
  });
  state.seasonSummary = {
    season: state.season,
    seasonLabel: state.seasonLabel,
    leagueName: league.name,
    position,
    points: row ? row.pts : 0,
    played: row ? row.played : 0,
    won: row ? row.won : 0,
    drawn: row ? row.drawn : 0,
    lost: row ? row.lost : 0,
    gf: row ? row.gf : 0,
    ga: row ? row.ga : 0,
    champion: champion?.club.name || '',
    championId: champion?.clubId || null,
    prize,
    confidenceChange,
    boardMessage,
    sacked: state.sacked,
  };
  state.seasonOver = true;
  addNews(boardMessage, state.sacked ? 'loss' : 'board');
  saveGame();
}

export function startNextSeason() {
  if (!state || !state.seasonOver) return false;
  if (state.sacked) return false;
  const youthCoach = state.staff.find(c => c.role === 'Youth Coach');
  const youthRating = youthCoach?.rating || 0;
  const fitness = state.staff.find(c => c.role === 'Fitness Coach')?.rating || 0;

  // Age and develop every player in the universe.
  for (const p of DB.players) {
    if (p.custom) developPlayer(p, youthRating, fitness);
    else developPlayer(p, 0, 0);
  }
  // Academy players also improve while they wait.
  for (const y of state.youth) {
    y.age++;
    const inc = 1 + (Math.random() < 0.55 ? 1 : 0) + Math.round(youthRating * 0.15);
    y.ovr = Math.min(y.pot, y.ovr + inc);
    y.value = Math.round(valueFor(y.age, y.ovr, y.pot) * 0.55 * 10) / 10;
    y.wage = Math.max(1000, Math.round(y.wage * 1.03 / 500) * 500);
  }

  // New intake.
  const count = 3 + Math.floor(state.academy.level / 2) + (youthRating >= 4 ? 1 : 0);
  const intake = makeYouth(state.academy.level, youthRating, count);
  state.youth.push(...intake);
  addNews(`Youth intake: ${intake.length} new prospects have joined the academy.`, 'youth');

  state.season++;
  state.seasonLabel = seasonLabel(state.season);
  state.round = 0;
  state.fixtures = generateAllFixtures();
  state.playerStats = {};
  state.finances = { income: 0, expenses: 0, gate: 0, prize: 0, transferSpent: 0, transferReceived: 0 };
  state.lastResult = null;
  const prevSummary = state.seasonSummary;
  state.seasonSummary = null;
  state.seasonOver = false;
  state.sacked = false;
  state.objective = getObjective();

  const league = getUserLeague();
  const pos = prevSummary?.position || Math.ceil(league.clubs.length / 2);
  const performance = (league.clubs.length - pos + 1) / league.clubs.length;
  const boardBudget = getUserClub().budget * (0.55 + performance * 0.75);
  state.budgets.transfer = Math.round(Math.max(4, boardBudget + state.budgets.transfer * 0.2) * 10) / 10;
  state.budgets.wage = Math.round(Math.max(getUserClub().wageBudget, getUserWageBill() / 1000 * 1.12) * 10) / 10;
  state.balance = Math.round((state.balance + 8) * 10) / 10;
  state.boardConfidence = Math.max(45, state.boardConfidence);
  if (!validateLineup(state.lineup, state.clubId)) {
    state.lineup = autoLineup(state.clubId, state.formation).lineup;
  }
  addNews(`A new season begins. The board has set a new transfer budget of £${state.budgets.transfer.toFixed(1)}m.`, 'board');
  addNews(`Board objective for ${state.seasonLabel}: ${state.objective.label}.`, 'board');
  saveGame();
  return true;
}

// ---------- Transfers ----------

export function canAddPlayer(wage) {
  const squad = getUserSquad();
  if (squad.length >= 30) return { ok: false, message: 'Squad limit reached (30 players). Sell or release someone first.' };
  const newBill = getUserWageBill() + wage;
  if (newBill > state.budgets.wage * 1000) {
    return { ok: false, message: 'This signing would exceed your weekly wage budget.' };
  }
  return { ok: true };
}

export function makeOffer(playerId, bid, wage, years) {
  const player = getPlayer(playerId);
  if (!player || player.club === state.clubId) return { status: 'rejected', message: 'Player unavailable.' };
  if (!player.club) return { status: 'rejected', message: 'Player is a free agent.' };
  const asking = askingPrice(player);
  const demand = wageDemand(player, getUserClub().reputation);
  if (bid > state.budgets.transfer + 0.001) {
    return { status: 'rejected', message: `You cannot afford that bid. Transfer budget: £${state.budgets.transfer.toFixed(1)}m.` };
  }
  const addCheck = canAddPlayer(wage);
  if (!addCheck.ok) return { status: 'rejected', message: addCheck.message };
  if (bid < asking * 0.85) {
    return { status: 'rejected', message: `${CLUBS[player.club].name} rejected the bid. They value ${player.name} at around £${asking.toFixed(1)}m.` };
  }
  if (bid < asking * 0.985) {
    return {
      status: 'counter',
      asking: Math.round(asking * 0.96 * 10) / 10,
      message: `${CLUBS[player.club].name} rejected £${bid.toFixed(1)}m but will accept £${(asking * 0.96).toFixed(1)}m.`,
    };
  }
  if (wage < demand * 0.88) {
    return {
      status: 'counter',
      demand,
      message: `${player.name}'s agent wants £${Math.round(demand / 1000)}k/week. Increase your wage offer.`,
    };
  }
  if (wage < demand * 0.96) {
    const mid = Math.round((wage + demand) / 2 / 500) * 500;
    return {
      status: 'counter',
      demand: mid,
      message: `${player.name} is listening, but wants £${Math.round(mid / 1000)}k/week to sign.`,
    };
  }
  const sellerRep = CLUBS[player.club]?.reputation || 3;
  const userRep = getUserClub().reputation;
  if (sellerRep > userRep + 1.4 && wage < demand * 1.2 && Math.random() < 0.42) {
    return { status: 'rejected', message: `${player.name} wants to play at a bigger club. Improve the wage offer to convince him.` };
  }

  const fee = Math.round(bid * 10) / 10;
  const oldClub = CLUBS[player.club]?.name || 'Free agent';
  state.budgets.transfer = Math.round((state.budgets.transfer - fee) * 10) / 10;
  state.finances.transferSpent = Math.round((state.finances.transferSpent + fee) * 10) / 10;
  movePlayer(player, state.clubId);
  player.wage = Math.round(wage / 500) * 500;
  player.contract = years;
  addNews(`${getUserClub().name} sign ${player.name} from ${oldClub} for £${fee.toFixed(1)}m on a ${years}-year deal.`, 'transfer');
  state.transfers.push({
    type: 'in', playerId: player.id, playerName: player.name, fee, from: oldClub,
    season: state.season,
  });
  saveGame();
  return { status: 'accepted', message: `${player.name} has signed for ${getUserClub().name}! Fee: £${fee.toFixed(1)}m.`, player };
}

export function getSaleOffers(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.club !== state.clubId) return [];
  const candidates = Object.values(CLUBS).filter(c =>
    c.id !== state.clubId &&
    c.reputation >= Math.max(1, getUserClub().reputation - 1.5) &&
    c.reputation <= getUserClub().reputation + 1.8 &&
    squadOf(c.id).length < 32
  );
  if (!candidates.length) return [];
  const pool = candidates.sort(() => Math.random() - 0.5).slice(0, 3);
  return pool.map(c => {
    let mult = 0.78 + Math.random() * 0.38;
    if (player.age >= 31) mult -= 0.12;
    if (player.pot - player.ovr > 6) mult += 0.1;
    const amount = Math.round(player.value * mult * 10) / 10;
    return { clubId: c.id, club: c, amount };
  });
}

export function sellPlayer(playerId, offer) {
  const player = getPlayer(playerId);
  if (!player || player.club !== state.clubId) return { ok: false, message: 'Player not found.' };
  if (getUserSquad().length <= 18) return { ok: false, message: 'You need at least 18 players in the squad.' };
  movePlayer(player, offer.clubId);
  state.budgets.transfer = Math.round((state.budgets.transfer + offer.amount) * 10) / 10;
  state.finances.transferReceived = Math.round((state.finances.transferReceived + offer.amount) * 10) / 10;
  state.lineup = state.lineup.filter(id => id !== playerId);
  if (!validateLineup(state.lineup, state.clubId)) {
    state.lineup = autoLineup(state.clubId, state.formation).lineup;
  }
  addNews(`${player.name} joins ${CLUBS[offer.clubId].name} for £${offer.amount.toFixed(1)}m.`, 'transfer');
  state.transfers.push({ type: 'out', playerId, playerName: player.name, fee: offer.amount, to: offer.clubId, season: state.season });
  saveGame();
  return { ok: true, message: `${player.name} sold to ${CLUBS[offer.clubId].name} for £${offer.amount.toFixed(1)}m.` };
}

export function releasePlayer(playerId) {
  const player = getPlayer(playerId);
  if (!player || player.club !== state.clubId) return { ok: false, message: 'Player not found.' };
  if (getUserSquad().length <= 18) return { ok: false, message: 'You need at least 18 players in the squad.' };
  movePlayer(player, null);
  state.lineup = state.lineup.filter(id => id !== playerId);
  if (!validateLineup(state.lineup, state.clubId)) {
    state.lineup = autoLineup(state.clubId, state.formation).lineup;
  }
  addNews(`${player.name} has been released by ${getUserClub().name}.`, 'transfer');
  saveGame();
  return { ok: true, message: `${player.name} released.` };
}

// ---------- Academy ----------

export function academyUpgradeCost() {
  const level = state.academy.level;
  if (level >= 5) return null;
  return [0, 5, 12, 25, 45, 0][level] || 45;
}

export function upgradeAcademy() {
  const cost = academyUpgradeCost();
  if (cost == null) return { ok: false, message: 'Academy is already at the maximum level.' };
  if (state.budgets.transfer < cost) return { ok: false, message: `You need £${cost}m to upgrade the academy.` };
  state.budgets.transfer = Math.round((state.budgets.transfer - cost) * 10) / 10;
  state.academy.level++;
  addNews(`Academy upgraded to Level ${state.academy.level}. Future intakes will be stronger.`, 'youth');
  saveGame();
  return { ok: true, message: `Academy upgraded to Level ${state.academy.level}.` };
}

export function scoutYouth() {
  const cost = 0.4;
  if (state.budgets.transfer < cost) return { ok: false, message: 'Scouting costs £0.4m. You cannot afford it.' };
  state.budgets.transfer = Math.round((state.budgets.transfer - cost) * 10) / 10;
  const coach = state.staff.find(c => c.role === 'Youth Coach');
  const p = generateYouthPlayer(getUserLeague().country, state.academy.level + 1, coach?.rating || 0, `y${state.nextYouthId++}`);
  state.youth.push(p);
  addNews(`Scouts have found a new prospect: ${p.name} (${p.pos}, age ${p.age}).`, 'youth');
  saveGame();
  return { ok: true, message: `Scouting complete: ${p.name} joined the academy.`, player: p };
}

export function promoteYouth(youthId) {
  const idx = state.youth.findIndex(p => p.id === youthId);
  if (idx < 0) return { ok: false, message: 'Prospect not found.' };
  const y = state.youth[idx];
  if (y.age < 15) return { ok: false, message: 'This prospect is too young to promote.' };
  const check = canAddPlayer(y.wage);
  if (!check.ok) return { ok: false, message: check.message };
  state.youth.splice(idx, 1);
  y.club = state.clubId;
  y.custom = true;
  y.contract = 3;
  addPlayer(y);
  addNews(`${y.name} has been promoted from the academy to the first team.`, 'youth');
  saveGame();
  return { ok: true, message: `${y.name} promoted to the first team.` };
}

export function releaseYouth(youthId) {
  const idx = state.youth.findIndex(p => p.id === youthId);
  if (idx < 0) return { ok: false, message: 'Prospect not found.' };
  const y = state.youth[idx];
  state.youth.splice(idx, 1);
  addNews(`${y.name} has left the academy.`, 'youth');
  saveGame();
  return { ok: true, message: `${y.name} released from the academy.` };
}

// ---------- Staff ----------

export function availableCoaches() {
  const hired = new Set(state.staff.map(c => c.name));
  return COACHES.filter(c => !hired.has(c.name));
}

export function hireCoach(name) {
  const coach = COACHES.find(c => c.name === name);
  if (!coach) return { ok: false, message: 'Coach not found.' };
  if (state.staff.some(c => c.name === name)) return { ok: false, message: 'Coach already employed.' };
  if (state.staff.some(c => c.role === coach.role)) {
    return { ok: false, message: `You already have a ${coach.role}. Fire them first.` };
  }
  if (state.budgets.transfer < coach.fee) {
    return { ok: false, message: `Compensation of £${coach.fee.toFixed(1)}m is required.` };
  }
  state.budgets.transfer = Math.round((state.budgets.transfer - coach.fee) * 10) / 10;
  state.staff.push({ ...coach, id: uid() });
  addNews(`${coach.name} joins your staff as ${coach.role}.`, 'staff');
  saveGame();
  return { ok: true, message: `${coach.name} hired as ${coach.role}.` };
}

export function fireCoach(id) {
  const idx = state.staff.findIndex(c => c.id === id);
  if (idx < 0) return { ok: false, message: 'Coach not found.' };
  const [coach] = state.staff.splice(idx, 1);
  addNews(`${coach.name} has left the club.`, 'staff');
  saveGame();
  return { ok: true, message: `${coach.name} dismissed.` };
}

// ---------- Lineup/tactics ----------

export function setFormation(formation) {
  if (!FORMATIONS[formation]) return;
  state.formation = formation;
  state.lineup = autoLineup(state.clubId, formation).lineup;
  saveGame();
}

export function setMentality(mentality) {
  state.mentality = mentality;
  saveGame();
}

export function setLineup(lineup) {
  if (validateLineup(lineup, state.clubId)) {
    state.lineup = lineup;
    saveGame();
    return true;
  }
  return false;
}

export function autoPickLineup() {
  state.lineup = autoLineup(state.clubId, state.formation).lineup;
  saveGame();
}

export function setActiveView(view) {
  if (state) state.activeView = view;
}

export function getStaffForRole(role) {
  return state.staff.find(c => c.role === role) || null;
}

export function getWeeklyProjection() {
  const club = getUserClub();
  if (!club) return { income: 0, expenses: 0, net: 0 };
  const rep = club.reputation;
  const wages = getUserWageBill() / 1_000_000;
  const staffWages = getUserStaffWages() / 1_000_000;
  const sponsor = 0.05 + rep * 0.05;
  const tv = 0.1 + rep * rep * 0.08;
  const commercial = rep * 0.08;
  const gate = club.capacity * 0.00003 * 0.5;
  const academy = state.academy.level * 0.03;
  const operations = 0.05 + rep * 0.03;
  const income = sponsor + tv + commercial + gate;
  const expenses = wages + staffWages + academy + operations;
  return {
    income: Math.round(income * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    net: Math.round((income - expenses) * 100) / 100,
    wages: Math.round(wages * 100) / 100,
    staffWages: Math.round(staffWages * 100) / 100,
  };
}

export function formatMillion(value) {
  if (value == null) return '—';
  if (Math.abs(value) >= 1000) return `£${(value / 1000).toFixed(2)}b`;
  if (Math.abs(value) < 1) return `£${(value * 1000).toFixed(0)}k`;
  return `£${value.toFixed(1)}m`;
}
