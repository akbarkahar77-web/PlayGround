import { LEAGUES, CLUBS, COACHES } from './data.js';
import { DB, getPlayer, squadOf } from './db.js';
import {
  FORMATIONS, FORMATION_LIST, MENTALITIES, POSITIONS, positionGroup,
  computeTable, topScorers, autoLineup, validateLineup, effectiveRating,
  askingPrice, wageDemand, MatchSim,
} from './engine.js';
import * as G from './game.js';

const UI = {
  view: 'dashboard',
  onboarding: { name: '', leagueId: 'premier-league', clubId: null },
  forcedOnboarding: false,
  market: { q: '', league: 'all', pos: 'all', maxFee: '', minOvr: '', maxAge: '', limit: 30 },
  squadSort: { key: 'ovr', dir: -1 },
  leagueTab: 'premier-league',
  fixtureRound: null,
  staffFilter: 'all',
  modal: null,
  match: null,
  saleOffers: null,
  pendingSeasonSummary: false,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return G.formatMillion(value);
}

function wage(value) {
  if (value == null) return '—';
  return `£${Math.round(value / 1000)}k`;
}

function pct(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function initials(name) {
  const parts = String(name || '').replaceAll('.', '').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function lum(hex) {
  const h = String(hex || '#888888').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ink(hex) {
  return lum(hex) > 0.62 ? '#0a1216' : '#ffffff';
}

function clubBadge(club, size = 44) {
  if (!club) return '';
  const [primary, secondary] = club.colors || ['#444', '#222'];
  const star = club.reputation >= 4.5 ? '<span class="crest-star">★</span>' : '';
  return `<span class="crest" style="--size:${size}px" title="${esc(club.name)}"><span class="crest-shield" style="--c1:${primary};--c2:${secondary};--ink:${ink(primary)}"><span class="crest-stripes"></span><span class="crest-code">${esc(club.short)}</span>${star}</span></span>`;
}

function avatar(player, size = 34) {
  if (!player) return '';
  const group = positionGroup(player.pos).toLowerCase();
  return `<span class="pavatar pos-${group}" style="--size:${size}px">${esc(initials(player.name))}</span>`;
}

function ovrClass(ovr) {
  if (ovr >= 86) return 'elite';
  if (ovr >= 82) return 'great';
  if (ovr >= 77) return 'good';
  if (ovr >= 72) return 'ok';
  return 'low';
}

function posTag(pos) {
  return `<span class="pos-tag ${positionGroup(pos)}">${esc(pos)}</span>`;
}

function stars(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)));
}

function potentialStars(pot) {
  const full = Math.round(pot / 20);
  return '★'.repeat(Math.min(5, full)) + '☆'.repeat(Math.max(0, 5 - full));
}

function formChips(form = []) {
  if (!form.length) return '<span class="tiny muted">No matches yet</span>';
  return `<div class="form-strip">${form.map(f => `<span class="form-chip ${f}">${f}</span>`).join('')}</div>`;
}

const ICONS = {
  dashboard: '<path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z"/>',
  squad: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  transfer: '<path d="M7 7h11l-3-3M17 17H6l3 3"/><path d="M4 12h16"/>',
  youth: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M2 8v6l10 5 10-5V8"/><path d="M12 13v8"/>',
  staff: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M12 12v4"/>',
  fixtures: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  leagues: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>',
  finance: '<path d="M12 2v20M17 6.5c0-2-2.2-3.5-5-3.5s-5 1.3-5 3.2c0 4.8 10 2.2 10 7 0 2-2.2 3.3-5 3.3s-5-1.4-5-3.3"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 2c-.7 1-2 1.3-2.4 2.6M12 18h.01"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Z"/><path d="M12 3v4M4.7 9.8l4.3 1M19.3 9.8l-4.3 1M7.2 20l2.3-4.5M16.8 20l-2.3-4.5"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.1-1.3-2-3-2s-3 .8-3 1.8c0 2.8 5.6 1.3 5.6 4.2 0 1.1-1.3 1.9-3 1.9s-3-.9-3-2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 1.7-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-2.4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.7-1.7.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.7-1.7.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V6h2.4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.7 1.7-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H20v2.4h-.1a1.7 1.7 0 0 0-1.6 1Z"/>',
  flag: '<path d="M5 21V3M5 4h11l-2 4 2 4H5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M9 10 7 3M15 10l2-7M9.5 15l1.5 1.5 3-3.5"/>',
  shirt: '<path d="m4 6 4-3 4 3 4-3 4 3v5l-3 1v10H7V12l-3-1V6Z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
};

function icon(name, size = 19) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.ball}</svg>`;
}

const NAV_ITEMS = [
  ['dashboard', 'Dashboard', 'dashboard'],
  ['squad', 'Squad', 'squad'],
  ['transfers', 'Transfers', 'transfer'],
  ['youth', 'Academy', 'youth'],
  ['staff', 'Staff', 'staff'],
  ['fixtures', 'Fixtures', 'fixtures'],
  ['leagues', 'Leagues', 'leagues'],
  ['finances', 'Finances', 'finance'],
  ['help', 'Help & Save', 'help'],
];

const MOBILE_NAV = [
  ['dashboard', 'Home', 'dashboard'],
  ['squad', 'Squad', 'squad'],
  ['transfers', 'Transfers', 'transfer'],
  ['youth', 'Academy', 'youth'],
  ['leagues', 'Table', 'leagues'],
  ['more', 'More', 'settings'],
];

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  squad: 'Squad',
  transfers: 'Transfer Market',
  youth: 'Youth Academy',
  staff: 'Backroom Staff',
  fixtures: 'Fixtures & Results',
  leagues: 'League Tables',
  finances: 'Finances',
  help: 'Help & Save',
};

function pageHead(title, sub, actions = '') {
  return `<div class="page-head"><div><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}

function emptyState(iconName, title, text) {
  return `<div class="empty-state"><div class="es-icon">${icon(iconName, 22)}</div><b>${esc(title)}</b><span>${esc(text)}</span></div>`;
}

function userClub() { return G.getUserClub(); }
function userLeague() { return G.getUserLeague(); }
function userSquad() { return G.getUserSquad(); }
function userTable() { return G.getUserTable(); }
function userRow() {
  const table = userTable();
  return table.find(r => r.clubId === G.state?.clubId) || null;
}

function leagueTableRowHtml(row, league, options = {}) {
  const club = row.club;
  const isMe = club.id === G.state?.clubId;
  const isChampion = row.pos === 1;
  const isQual = row.pos > 1 && row.pos <= 4;
  const isRel = row.pos > league.clubs.length - 3;
  const cls = [isMe ? 'me' : '', isChampion ? 'champion' : '', isQual ? 'qual' : '', isRel ? 'relegation' : ''].filter(Boolean).join(' ');
  const indicator = isChampion || isQual || isRel ? '<span class="pos-indicator"></span>' : '';
  return `<tr class="${cls}">
    <td class="center">${indicator}${row.pos}</td>
    <td class="left"><div class="table-club">${clubBadge(club, 24)}<div><div class="tc-name">${esc(club.name)}</div>${options.showLeague ? `<div class="tc-sub">${esc(league.name)}</div>` : ''}</div></div></td>
    <td class="center">${row.played}</td>
    <td class="center">${row.won}</td>
    <td class="center">${row.drawn}</td>
    <td class="center">${row.lost}</td>
    <td class="center">${row.gf}</td>
    <td class="center">${row.ga}</td>
    <td class="center">${row.gd > 0 ? '+' : ''}${row.gd}</td>
    <td class="center"><b>${row.pts}</b></td>
    <td class="center">${formChips(row.form.slice(-3))}</td>
  </tr>`;
}

function fullLeagueTableHtml(leagueId) {
  const league = LEAGUES.find(l => l.id === leagueId) || userLeague();
  if (!league) return '';
  const table = G.getTable(league.id);
  return `<div class="league-table-wrap"><table class="league-table">
    <thead><tr><th>#</th><th class="left">Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Form</th></tr></thead>
    <tbody>${table.map(row => leagueTableRowHtml(row, league)).join('')}</tbody>
  </table></div>`;
}

function miniTableHtml(leagueId, limit = 7) {
  const league = LEAGUES.find(l => l.id === leagueId);
  if (!league) return '';
  const table = G.getTable(leagueId);
  let rows = table.slice(0, limit);
  const me = table.find(r => r.clubId === G.state?.clubId);
  if (me && !rows.some(r => r.clubId === me.clubId)) {
    rows = [...rows, { ...me, separator: true }];
  }
  return `<table class="quick-table">
    <thead><tr><th>#</th><th>Club</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.clubId === G.state?.clubId ? 'me' : ''}">
      <td>${r.pos}</td>
      <td><div class="club-inline">${clubBadge(r.club, 19)}<span>${esc(r.club.name)}</span></div></td>
      <td>${r.played}</td>
      <td>${r.gd > 0 ? '+' : ''}${r.gd}</td>
      <td><b>${r.pts}</b></td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function topScorerListHtml(leagueId, limit = 5) {
  const list = G.getTopScorers(leagueId, limit);
  if (!list.length) return emptyState('ball', 'No goals yet', 'The scoresheet is still empty this season.');
  return list.map((s, i) => `<div class="top-scorer-card">
    <div class="ts-rank">${i + 1}</div>
    ${avatar(s.player, 30)}
    <div class="ts-info"><div class="ts-name">${esc(s.player.name)}</div><div class="ts-club">${esc(s.club.name)}</div></div>
    <div class="ts-goals">${s.goals}</div>
  </div>`).join('');
}

function newsListHtml(limit = 14) {
  const news = G.state.news.slice(0, limit);
  if (!news.length) return emptyState('help', 'No news yet', 'Match reports, transfers and board updates will appear here.');
  return `<div class="news-list">${news.map(n => `<div class="news-item">
    <div class="news-icon ${esc(n.type)}">${icon(n.type === 'win' ? 'trophy' : n.type === 'transfer' ? 'transfer' : n.type === 'youth' ? 'youth' : n.type === 'board' ? 'flag' : n.type === 'loss' ? 'x' : 'ball', 14)}</div>
    <div><div class="news-text">${esc(n.text)}</div><div class="news-meta">${esc(n.date || '')} · ${esc(G.state.seasonLabel)}</div></div>
  </div>`).join('')}</div>`;
}

function nextFixtureCard() {
  const fixture = G.getUserFixture();
  if (!fixture) {
    return `<div class="next-match"><div class="next-team">${clubBadge(userClub(), 44)}<div class="nt-name">${esc(userClub().name)}</div></div><div class="next-vs"><div class="vs-label">Season</div><div class="vs-time">Complete</div></div><div class="next-team"><div class="nt-name">Review</div><div class="nt-meta">Start the next season</div></div></div>`;
  }
  const home = CLUBS[fixture.home];
  const away = CLUBS[fixture.away];
  const userHome = fixture.home === G.state.clubId;
  const opp = userHome ? away : home;
  const league = userLeague();
  return `<div class="next-match">
    <div class="next-team">${clubBadge(home, 46)}<div class="nt-name">${esc(home.name)}</div><div class="nt-meta">${home.id === G.state.clubId ? 'You' : 'Home'}</div></div>
    <div class="next-vs"><div class="vs-label">${userHome ? 'Home' : 'Away'}</div><div class="vs-time">vs</div><div class="vs-md">MD ${G.state.round + 1}</div></div>
    <div class="next-team">${clubBadge(away, 46)}<div class="nt-name">${esc(away.name)}</div><div class="nt-meta">${away.id === G.state.clubId ? 'You' : 'Away'}</div></div>
  </div>
  <div class="small muted" style="text-align:center;margin-top:9px">${esc(league.name)} · ${esc(CLUBS[fixture.home].stadium)} · Opponent: ${esc(opp.name)}</div>
  <div class="match-actions">
    <button class="btn btn-primary" data-action="play-match">${icon('ball', 16)} Play match</button>
    <button class="btn" data-action="instant-match">Instant result</button>
  </div>`;
}

function recentResults() {
  if (!G.state) return [];
  const league = userLeague();
  const rounds = G.state.fixtures[league.id] || [];
  const out = [];
  for (let i = 0; i < Math.min(G.state.round, rounds.length); i++) {
    const f = rounds[i].find(x => (x.home === G.state.clubId || x.away === G.state.clubId) && x.played);
    if (!f) continue;
    const userHome = f.home === G.state.clubId;
    const gf = userHome ? f.hg : f.ag;
    const ga = userHome ? f.ag : f.hg;
    out.push({ round: i + 1, opp: CLUBS[userHome ? f.away : f.home], gf, ga, result: gf > ga ? 'W' : gf < ga ? 'L' : 'D' });
  }
  return out.slice(-5).reverse();
}

// ============================================================
// Landing / onboarding
// ============================================================
function landingShell(panel) {
  return `<div class="landing">
    <section class="landing-hero">
      <div class="hero-brand"><span class="brand-mark">${icon('ball', 22)}</span><div><div>TOUCHLINE</div><div class="brand-tag">Football Manager</div></div></div>
      <div class="hero-copy">
        <span class="eyebrow">${icon('trophy', 13)} The dugout is yours</span>
        <h1 class="hero-title">BUILD.<br/>DEVELOP.<br/><span class="accent">WIN.</span></h1>
        <p class="hero-lead">Take charge of a real European giant or a club fighting for survival. Buy players, hire coaches, raise academy wonderkids and lead your team through a full season.</p>
        <div class="hero-features">
          <div class="feature"><div class="feature-icon">${icon('leagues', 17)}</div><div><b>Five real leagues</b><span>Premier League, La Liga, Serie A, Bundesliga and Ligue 1.</span></div></div>
          <div class="feature"><div class="feature-icon">${icon('transfer', 17)}</div><div><b>Transfers & budgets</b><span>Negotiate fees, wages and build a squad within your means.</span></div></div>
          <div class="feature"><div class="feature-icon">${icon('youth', 17)}</div><div><b>Youth academy</b><span>Scout, promote and develop high-potential teenagers.</span></div></div>
          <div class="feature"><div class="feature-icon">${icon('staff', 17)}</div><div><b>Hire your staff</b><span>Coaches shape match tactics and player development.</span></div></div>
        </div>
      </div>
      <div class="hero-footer">Fan-made game · Real clubs and players · Not affiliated with EA or any league</div>
    </section>
    <section class="landing-panel">${panel}</section>
  </div>`;
}

function renderContinueScreen(saved) {
  const club = CLUBS[saved.clubId];
  const panel = `<div class="panel-head"><div><h2 class="panel-title">Welcome back, ${esc(saved.manager)}</h2><p class="panel-sub">Your career is saved on this device.</p></div></div>
    <div class="continue-card">
      <div class="saved-club">${clubBadge(club, 58)}<div><div style="font-size:18px;font-weight:850">${esc(club.name)}</div><div class="saved-meta">${esc(LEAGUES.find(l => l.id === club.league)?.name)} · Season <b>${esc(saved.season)}/${String(saved.season + 1).slice(-2)}</b></div></div></div>
      <div class="saved-meta">${saved.seasonOver ? 'Season complete' : `Matchday ${Math.min(saved.round + 1, 38)}`}</div>
    </div>
    <div class="start-row">
      <button class="btn btn-primary" data-action="continue-career">${icon('ball', 16)} Continue career</button>
      <button class="btn" data-action="new-career">Start a new career</button>
    </div>
    <p class="modal-note">Starting a new career will overwrite your current save.</p>`;
  return landingShell(panel);
}

function renderOnboarding() {
  const onb = UI.onboarding;
  const league = LEAGUES.find(l => l.id === onb.leagueId) || LEAGUES[0];
  const selected = onb.clubId ? CLUBS[onb.clubId] : null;
  const clubs = league.clubs.map(id => CLUBS[id]).sort((a, b) => b.avg - a.avg);
  const panel = `<div class="panel-head"><div><h2 class="panel-title">Start your career</h2><p class="panel-sub">Pick a league and a club. Every club has real players, a budget and a board objective.</p></div></div>
    <div class="onb-name-wrap"><label class="onb-label" for="manager-name">Your name</label><input class="input" id="manager-name" maxlength="30" placeholder="e.g. Alex Morgan" value="${esc(onb.name)}" /></div>
    <div class="onb-name-wrap"><label class="onb-label">League</label><div class="league-tabs">${LEAGUES.map(l => `<button class="league-tab ${l.id === league.id ? 'active' : ''}" data-action="select-league" data-league="${l.id}">${l.flag} ${esc(l.name)}</button>`).join('')}</div></div>
    <div class="onb-name-wrap"><label class="onb-label">Club · ${league.clubs.length} teams</label><div class="club-grid">${clubs.map(c => `<button class="club-card ${onb.clubId === c.id ? 'selected' : ''}" data-action="select-club" data-club="${c.id}">${clubBadge(c, 31)}<span class="club-text"><span class="club-name">${esc(c.name)}</span><span class="club-meta">${c.avg} OVR · ${money(c.budget)} budget</span></span></button>`).join('')}</div></div>
    ${selected ? `<div class="club-detail">${clubBadge(selected, 54)}<div><div class="detail-name">${esc(selected.name)}</div><div class="detail-meta">${esc(selected.stadium)} · ${selected.capacity.toLocaleString()} capacity · Reputation ${'★'.repeat(Math.floor(selected.reputation))}${selected.reputation % 1 ? '½' : ''}</div></div><div class="detail-budget"><b>${money(selected.budget)}</b><span>Transfer budget</span></div></div>` : `<div class="empty-state" style="padding:18px"><b>Select a club</b><span>Choose any of the 96 clubs from Europe's top five leagues.</span></div>`}
    <div class="start-row"><button class="btn btn-primary" data-action="begin-career" ${selected ? '' : 'disabled'}>${icon('arrowRight', 16)} Begin career</button><button class="btn" data-action="random-club">Surprise me</button></div>
    <p class="modal-note">Recommended for a first save: a mid-table club with room to grow. Big clubs have bigger budgets — and bigger expectations.</p>`;
  return landingShell(panel);
}

function renderLanding() {
  if (!UI.forcedOnboarding && G.hasSave()) {
    const saved = G.getSavedSummary();
    if (saved) {
      document.getElementById('app').innerHTML = renderContinueScreen(saved);
      return;
    }
  }
  document.getElementById('app').innerHTML = renderOnboarding();
}

// ============================================================
// App shell
// ============================================================
function topbarHtml() {
  const club = userClub();
  const league = userLeague();
  const position = userRow()?.pos || 0;
  return `<header class="topbar">
    <div><div class="topbar-title">${esc(VIEW_TITLES[UI.view] || 'Dashboard')}</div><div class="topbar-sub">${esc(club.name)} · ${esc(league.name)} ${position ? `· ${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` : ''} · ${esc(G.state.seasonLabel)}</div></div>
    <div class="topbar-spacer"></div>
    <div class="topbar-meta">
      <div class="budget-chip"><span>Transfer</span><b>${money(G.state.budgets.transfer)}</b></div>
      <div class="budget-chip wage"><span>Wage/wk</span><b>${wage(G.getUserWageBill())}</b></div>
      <button class="icon-btn" data-action="save-game" title="Save game">${icon('save', 17)}</button>
      <div class="user-pill">${avatar({ name: G.state.manager, pos: 'CM' }, 29)}<div><div class="up-name">${esc(G.state.manager)}</div><div class="up-role">Manager</div></div></div>
    </div>
  </header>`;
}

function sidebarHtml() {
  const club = userClub();
  const league = userLeague();
  const row = userRow();
  return `<aside class="sidebar">
    <div class="brand"><span class="brand-mark">${icon('ball', 22)}</span><div><div class="brand-name">TOUCHLINE</div><div class="brand-tag">Football Manager</div></div></div>
    <div class="club-summary">${clubBadge(club, 40)}<div class="cs-text"><div class="cs-name">${esc(club.name)}</div><div class="cs-meta">${esc(league.name)} · ${row ? `${row.pos}${row.pos === 1 ? 'st' : row.pos === 2 ? 'nd' : row.pos === 3 ? 'rd' : 'th'}` : 'Pre-season'}</div></div></div>
    <nav class="side-nav">${NAV_ITEMS.map(([id, label, ic]) => `<button class="nav-item ${UI.view === id ? 'active' : ''}" data-action="nav" data-view="${id}"><span class="nav-icon">${icon(ic, 18)}</span><span class="nav-label">${label}</span>${id === 'transfers' ? `<span class="nav-badge">${DB.players.filter(p => p.club && p.club !== G.state.clubId).length > 900 ? 'LIVE' : ''}</span>` : ''}</button>`).join('')}</nav>
    <div class="side-footer">
      <div class="side-note"><span><span class="dot"></span>${esc(G.state.seasonLabel)} · MD ${Math.min(G.state.round + 1, 38)}</span><span>Auto-save</span></div>
      <div class="side-note"><span>Board: ${esc(G.boardLabel(G.state.boardConfidence))}</span><span>${Math.round(G.state.boardConfidence)}%</span></div>
    </div>
  </aside>`;
}

function mobileNavHtml() {
  return `<nav class="mobile-nav">${MOBILE_NAV.map(([id, label, ic]) => `<button class="mn-item ${UI.view === id ? 'active' : ''}" data-action="${id === 'more' ? 'more-menu' : 'nav'}" ${id !== 'more' ? `data-view="${id}"` : ''}>${icon(ic, 19)}<span>${label}</span></button>`).join('')}</nav>`;
}

function renderApp() {
  if (!G.state) {
    renderLanding();
    return;
  }
  if (!UI.view) UI.view = G.state.activeView || 'dashboard';
  document.getElementById('app').innerHTML = `<div class="shell">${sidebarHtml()}<main class="main">${topbarHtml()}<div class="view">${renderView()}</div></main></div>${mobileNavHtml()}`;
}

// ============================================================
// Dashboard
// ============================================================
function renderDashboard() {
  const club = userClub();
  const league = userLeague();
  const row = userRow();
  const table = userTable();
  const squad = userSquad().slice().sort((a, b) => b.ovr - a.ovr);
  const squadRating = squad.slice(0, 11).reduce((s, p) => s + p.ovr, 0) / Math.max(1, squad.slice(0, 11).length);
  const objective = G.state.objective || G.getObjective();
  const recent = recentResults();
  const wageRoom = G.state.budgets.wage * 1000 - G.getUserWageBill();
  const topScorers = G.getTopScorers(league.id, 5);
  const userTop = topScorers.find(s => s.player.club === G.state.clubId);
  const seasonOver = G.state.seasonOver;

  return `${pageHead(`Good morning, ${G.state.manager.split(' ')[0] || 'gaffer'}`, `${esc(club.name)} · ${esc(league.name)} · Season ${esc(G.state.seasonLabel)}`, `<button class="btn btn-sm" data-action="nav" data-view="help">${icon('help', 15)} How to play</button><button class="btn btn-sm btn-primary" data-action="save-game">${icon('save', 15)} Save</button>`)}
    <section class="dash-hero">
      <div class="hero-top">
        <div class="hero-club">${clubBadge(club, 66)}<div><div class="hc-name">${esc(club.name)}</div><div class="hc-meta"><span class="chip green">${esc(league.name)}</span><span class="chip">${club.reputation >= 4.5 ? 'Elite club' : club.reputation >= 3 ? 'Established club' : 'Underdog'}</span><span class="chip">${esc(club.stadium)}</span></div></div></div>
        <div class="hero-next"><div class="next-card-mini"><div class="ncm-label">Board objective</div><div style="font-size:13px;font-weight:800">${esc(objective.label)}</div><div class="ncm-foot"><span>Confidence ${Math.round(G.state.boardConfidence)}%</span><span class="green-text">${esc(G.boardLabel(G.state.boardConfidence))}</span></div></div></div>
      </div>
      <div style="height:16px"></div>
      ${seasonOver ? `<div class="next-match"><div class="next-team">${clubBadge(club, 44)}<div class="nt-name">${esc(club.name)}</div></div><div class="next-vs"><div class="vs-label">Season</div><div class="vs-time">Complete</div></div><div class="next-team"><div class="nt-name">${esc(G.state.seasonSummary?.champion || 'Review')}</div><div class="nt-meta">Champions</div></div></div><div class="match-actions"><button class="btn btn-primary" data-action="season-summary">Review season & continue</button></div>` : nextFixtureCard()}
    </section>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">League position</div><div class="stat-value">${row ? `${row.pos}<small> / ${league.clubs.length}</small>` : '—'}</div><div class="stat-note">${row ? `${row.pts} pts · ${row.played} played` : 'Season not started'}</div></div>
      <div class="stat-card"><div class="stat-label">Squad rating</div><div class="stat-value">${squadRating.toFixed(1)}</div><div class="stat-note">${squad.length} players · ${squad.filter(p => p.pot - p.ovr >= 8).length} high-potential</div></div>
      <div class="stat-card"><div class="stat-label">Transfer budget</div><div class="stat-value">${money(G.state.budgets.transfer)}</div><div class="stat-note">Balance ${money(G.state.balance)}</div></div>
      <div class="stat-card"><div class="stat-label">Wage headroom</div><div class="stat-value">${wage(Math.max(0, wageRoom))}</div><div class="stat-note">of ${money(G.state.budgets.wage / 1000)}/wk budget</div></div>
    </div>
    <div class="grid two">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Season progress</div><div class="card-sub">${esc(league.name)} · ${esc(objective.label)}</div></div><span class="chip ${row && row.pos <= objective.position ? 'green' : 'gold'}">${row ? `${row.pos}${row.pos === 1 ? 'st' : row.pos === 2 ? 'nd' : row.pos === 3 ? 'rd' : 'th'}` : '—'}</span></div>
          <div class="confidence-box">
            <div class="confidence-top"><b>${esc(G.boardLabel(G.state.boardConfidence))}</b><span>Board confidence ${Math.round(G.state.boardConfidence)}%</span></div>
            <div class="meter ${G.state.boardConfidence < 40 ? 'red' : G.state.boardConfidence < 65 ? 'gold' : ''}"><span style="width:${Math.max(2, G.state.boardConfidence)}%"></span></div>
          </div>
          <div style="height:12px"></div>
          ${miniTableHtml(league.id, 7)}
          <div class="match-actions"><button class="btn btn-sm" data-action="nav" data-view="fixtures">${icon('fixtures', 14)} Full fixtures</button><button class="btn btn-sm" data-action="nav" data-view="leagues">${icon('leagues', 14)} All tables</button></div>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Recent results</div><div class="card-sub">Your last five matches</div></div>${recent.length ? formChips(recent.map(r => r.result).reverse()) : ''}</div>
          ${recent.length ? `<div class="fixture-list">${recent.map(r => `<div class="fixture-row ${r.result === 'W' ? 'user' : ''}"><div class="fixture-team">${clubBadge(r.opp, 22)}<span>${esc(r.opp.short)}</span></div><div class="fixture-score">${r.gf}-${r.ga}<span class="fs-time">MD ${r.round}</span></div><div class="fixture-team away"><span>${r.result === 'W' ? 'Win' : r.result === 'D' ? 'Draw' : 'Loss'}</span></div></div>`).join('')}</div>` : emptyState('calendar', 'No matches played', 'Your first result will appear here.')}
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Squad leaders</div><div class="card-sub">Top rated players in your squad</div></div><button class="btn btn-sm" data-action="nav" data-view="squad">View squad</button></div>
          ${squad.slice(0, 4).map(p => `<div class="top-scorer-card">${avatar(p, 30)}<div class="ts-info"><div class="ts-name">${esc(p.name)}</div><div class="ts-club">${esc(p.pos)} · ${p.age} yrs · POT ${p.pot}</div></div><span class="ovr ${ovrClass(p.ovr)}">${p.ovr}</span></div>`).join('')}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Latest news</div><div class="card-sub">Dressing room and board updates</div></div><span class="chip">${G.state.news.length} stories</span></div>
          ${newsListHtml(12)}
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Top scorers</div><div class="card-sub">${esc(league.name)}</div></div><button class="btn btn-sm" data-action="nav" data-view="leagues">More</button></div>
          ${topScorerListHtml(league.id, 5)}
          ${userTop ? `<div class="fin-row" style="margin-top:8px"><span class="muted">Your top scorer</span><b>${esc(userTop.player.name)} · ${userTop.goals}</b></div>` : ''}
        </div>
      </div>
    </div>`;
}

// ============================================================
// Squad
// ============================================================
function renderSquad() {
  const squad = userSquad().slice();
  const { key, dir } = UI.squadSort;
  squad.sort((a, b) => {
    let va = a[key], vb = b[key];
    if (key === 'potential') { va = a.pot; vb = b.pot; }
    if (typeof va === 'string') return va.localeCompare(vb) * dir;
    return (va - vb) * dir;
  });
  const wageBill = G.getUserWageBill();
  const avg = squad.length ? squad.reduce((s, p) => s + p.ovr, 0) / squad.length : 0;
  const starters = new Set(G.state.lineup);
  const highPot = squad.filter(p => p.pot - p.ovr >= 6).length;
  const sortArrow = k => key === k ? `<span class="sort-arrow">${dir < 0 ? '↓' : '↑'}</span>` : '';

  return `${pageHead('Squad', `${esc(userClub().name)} · ${squad.length} players · ${esc(G.state.formation)} · ${esc(G.state.mentality)}`, `<button class="btn btn-sm" data-action="edit-lineup">${icon('shirt', 15)} Edit XI</button><button class="btn btn-sm" data-action="auto-lineup">Auto pick</button><button class="btn btn-sm" data-action="nav" data-view="transfers">Buy players</button>`)}
    <div class="squad-summary">
      <div class="mini"><span>Squad size</span><b>${squad.length}<small class="muted" style="font-size:10px"> / 30</small></b></div>
      <div class="mini"><span>Average rating</span><b>${avg.toFixed(1)}</b></div>
      <div class="mini"><span>Weekly wage bill</span><b>${wage(wageBill)}</b></div>
      <div class="mini"><span>High potential</span><b>${highPot}</b></div>
    </div>
    <div class="table-toolbar">
      <select class="select" data-action="set-formation" aria-label="Formation">${FORMATION_LIST.map(f => `<option value="${f}" ${G.state.formation === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <select class="select" data-action="set-mentality" aria-label="Mentality">${MENTALITIES.map(m => `<option value="${m}" ${G.state.mentality === m ? 'selected' : ''}>${m[0].toUpperCase() + m.slice(1)}</option>`).join('')}</select>
      <span class="chip">${starters.size} selected XI</span>
      <div class="spacer"></div>
      <span class="tiny muted">Click a player for the full report</span>
    </div>
    <div class="card flush">
      <div class="table-wrap">
        <table class="data-table squad-table">
          <thead><tr><th>#</th><th class="sortable" data-action="sort-squad" data-key="name">Player ${sortArrow('name')}</th><th>Pos</th><th class="num sortable" data-action="sort-squad" data-key="age">Age ${sortArrow('age')}</th><th class="num sortable" data-action="sort-squad" data-key="ovr">OVR ${sortArrow('ovr')}</th><th class="num sortable" data-action="sort-squad" data-key="potential">POT ${sortArrow('potential')}</th><th class="num sortable" data-action="sort-squad" data-key="value">Value ${sortArrow('value')}</th><th class="num sortable" data-action="sort-squad" data-key="wage">Wage ${sortArrow('wage')}</th><th class="center">Contract</th><th class="center">Status</th><th class="center"></th></tr></thead>
          <tbody>${squad.map((p, i) => `<tr data-action="open-player" data-id="${p.id}" style="cursor:pointer">
            <td class="num muted">${i + 1}</td>
            <td><div class="player-cell">${avatar(p, 30)}<div><div class="pc-name">${esc(p.name)}</div><div class="pc-meta"><span class="nation">${p.flag || '🏳️'}</span>${esc(p.nation)} · ${esc(p.foot)} foot</div></div></div></td>
            <td>${posTag(p.pos)}</td>
            <td class="num">${p.age}</td>
            <td class="num"><span class="ovr ${ovrClass(p.ovr)}">${p.ovr}</span></td>
            <td class="num"><span class="pot ${p.pot - p.ovr >= 8 ? 'up' : p.pot >= 88 ? 'max' : ''}">${p.pot}</span></td>
            <td class="num">${money(p.value)}</td>
            <td class="num">${wage(p.wage)}</td>
            <td class="center">${p.contract} yrs</td>
            <td class="center">${starters.has(p.id) ? '<span class="tag green">XI</span>' : '<span class="tag">SUB</span>'}</td>
            <td class="center"><button class="btn btn-sm" data-action="open-player" data-id="${p.id}">View</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`;
}

// ============================================================
// Transfers
// ============================================================
function filteredMarketPlayers() {
  const m = UI.market;
  const userRep = userClub().reputation;
  let list = DB.players.filter(p => p.club && p.club !== G.state.clubId);
  if (m.q) {
    const q = m.q.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (CLUBS[p.club]?.name || '').toLowerCase().includes(q));
  }
  if (m.league !== 'all') {
    const league = LEAGUES.find(l => l.id === m.league);
    if (league) {
      const set = new Set(league.clubs);
      list = list.filter(p => set.has(p.club));
    }
  }
  if (m.pos !== 'all') {
    list = list.filter(p => positionGroup(p.pos) === m.pos);
  }
  if (m.minOvr) list = list.filter(p => p.ovr >= Number(m.minOvr));
  if (m.maxAge) list = list.filter(p => p.age <= Number(m.maxAge));
  if (m.maxFee) list = list.filter(p => askingPrice(p) <= Number(m.maxFee));
  list.sort((a, b) => b.ovr - a.ovr || b.pot - a.pot || a.value - b.value);
  return list;
}

function marketResultsHtml() {
  const list = filteredMarketPlayers();
  const shown = list.slice(0, UI.market.limit);
  if (!list.length) return emptyState('search', 'No players found', 'Try widening your filters or increasing your budget.');
  return `<div class="market-head"><div class="market-count"><b>${list.length.toLocaleString()}</b> players match your filters</div><div class="market-actions"><span class="chip green">Budget ${money(G.state.budgets.transfer)}</span></div></div>
    <div class="card flush"><div class="table-wrap"><table class="data-table market-table">
      <thead><tr><th>Player</th><th>Club</th><th>Pos</th><th class="num">Age</th><th class="num">OVR</th><th class="num">POT</th><th class="num">Value</th><th class="num">Asking</th><th class="center">Action</th></tr></thead>
      <tbody>${shown.map(p => {
        const club = CLUBS[p.club];
        const ask = askingPrice(p);
        const afford = ask <= G.state.budgets.transfer;
        return `<tr>
          <td><div class="player-cell" data-action="open-player" data-id="${p.id}" style="cursor:pointer">${avatar(p, 29)}<div><div class="pc-name">${esc(p.name)}</div><div class="pc-meta"><span class="nation">${p.flag || '🏳️'}</span><span class="pc-nation-text">${esc(p.nation)}</span><span class="pc-club-mobile">${esc(club.short)}</span></div></div></div></td>
          <td><div class="table-club">${clubBadge(club, 22)}<div><div class="tc-name">${esc(club.short)}</div><div class="tc-sub">${esc(LEAGUES.find(l => l.id === club.league)?.short || '')}</div></div></div></td>
          <td>${posTag(p.pos)}</td>
          <td class="num">${p.age}</td>
          <td class="num"><span class="ovr ${ovrClass(p.ovr)}">${p.ovr}</span></td>
          <td class="num"><span class="pot ${p.pot - p.ovr >= 8 ? 'up' : ''}">${p.pot}</span></td>
          <td class="num">${money(p.value)}</td>
          <td class="num ${afford ? 'green-text' : 'red-text'}">${money(ask)}</td>
          <td class="center"><button class="btn btn-sm ${afford ? 'btn-primary' : ''}" data-action="bid-player" data-id="${p.id}" ${afford ? '' : 'disabled'}>Bid</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>
    ${shown.length < list.length ? `<div style="display:flex;justify-content:center;margin-top:12px"><button class="btn" data-action="load-more">Load more players</button></div>` : ''}`;
}

function renderTransfers() {
  const wageBill = G.getUserWageBill();
  const activity = (G.state.transfers || []).slice(-6).reverse();
  return `${pageHead('Transfer market', 'Find the missing piece. Bid for real players from all 96 clubs — fees come out of your transfer budget and wages must fit your weekly limit.', `<span class="chip green">Budget ${money(G.state.budgets.transfer)}</span><span class="chip gold">Wage ${wage(wageBill)} / ${money(G.state.budgets.wage / 1000)}</span>`)}
    <div class="card">
      <div class="filters">
        <div class="filter"><label>Search player or club</label><input class="input" data-market-filter="q" placeholder="Name or club…" value="${esc(UI.market.q)}" /></div>
        <div class="filter"><label>League</label><select class="select" data-market-filter="league"><option value="all">All leagues</option>${LEAGUES.map(l => `<option value="${l.id}" ${UI.market.league === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
        <div class="filter"><label>Position</label><select class="select" data-market-filter="pos"><option value="all">All positions</option><option value="GK" ${UI.market.pos === 'GK' ? 'selected' : ''}>Goalkeepers</option><option value="DEF" ${UI.market.pos === 'DEF' ? 'selected' : ''}>Defenders</option><option value="MID" ${UI.market.pos === 'MID' ? 'selected' : ''}>Midfielders</option><option value="ATT" ${UI.market.pos === 'ATT' ? 'selected' : ''}>Attackers</option></select></div>
        <div class="filter"><label>Min OVR</label><select class="select" data-market-filter="minOvr"><option value="">Any</option>${[70, 75, 78, 80, 82, 85, 88].map(n => `<option value="${n}" ${UI.market.minOvr == n ? 'selected' : ''}>${n}+</option>`).join('')}</select></div>
        <div class="filter"><label>Max age</label><select class="select" data-market-filter="maxAge"><option value="">Any</option>${[21, 23, 25, 27, 29, 31, 34].map(n => `<option value="${n}" ${UI.market.maxAge == n ? 'selected' : ''}>${n} or under</option>`).join('')}</select></div>
        <div class="filter"><label>Max asking price</label><select class="select" data-market-filter="maxFee"><option value="">Any</option>${[5, 10, 20, 30, 50, 75, 100, 150].map(n => `<option value="${n}" ${UI.market.maxFee == n ? 'selected' : ''}>£${n}m</option>`).join('')}</select></div>
      </div>
      <div id="market-results">${marketResultsHtml()}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><div><div class="card-title">Recent transfer activity</div><div class="card-sub">Deals completed this season</div></div><span class="chip">${(G.state.transfers || []).length} deals</span></div>
      ${activity.length ? `<div class="offer-list">${activity.map(t => `<div class="offer-item"><div class="oi-text"><div class="oi-name">${esc(t.playerName)}</div><div class="oi-meta">${t.type === 'in' ? `Signed from ${esc(t.from || 'another club')}` : `Sold to ${esc(CLUBS[t.to]?.name || 'another club')}`} · ${esc(t.season || G.state.season)}</div></div><div class="oi-amount">${money(t.fee)}</div></div>`).join('')}</div>` : emptyState('transfer', 'No transfers yet', 'Your completed deals will appear here.')}
    </div>`;
}

function updateMarketResults() {
  const target = document.getElementById('market-results');
  if (target) target.innerHTML = marketResultsHtml();
}

// ============================================================
// Academy
// ============================================================
function renderYouth() {
  const level = G.state.academy.level;
  const cost = G.academyUpgradeCost();
  const youthCoach = G.getStaffForRole('Youth Coach');
  const youth = G.state.youth;
  return `${pageHead('Youth academy', 'Scout raw talent, upgrade your facilities and turn teenagers into first-team players.', `<span class="chip purple">Level ${level} / 5</span><button class="btn btn-sm" data-action="scout-youth">${icon('search', 14)} Scout prospect · £0.4m</button>`)}
    <div class="academy-banner">
      <div class="ab-icon">${icon('youth', 27)}</div>
      <div><div class="ab-title">Academy Level ${level}</div><div class="ab-sub">${youthCoach ? `Youth Coach: ${esc(youthCoach.name)} (${youthCoach.rating}★)` : 'No youth coach hired — hire one in Staff for better intakes.'}</div><div class="ab-stars">${'★'.repeat(level)}${'☆'.repeat(5 - level)}</div></div>
      <div class="ab-actions">${cost ? `<button class="btn btn-sm btn-primary" data-action="upgrade-academy" ${G.state.budgets.transfer < cost ? 'disabled' : ''}>Upgrade · £${cost}m</button>` : '<span class="chip gold">Max level</span>'}<button class="btn btn-sm" data-action="nav" data-view="staff">Hire youth coach</button></div>
    </div>
    <div class="youth-note">${icon('help', 15)} <span>Academy level raises the starting quality and potential of new intakes. A strong Youth Coach adds a bonus. A new intake arrives automatically at the end of every season.</span></div>
    <div class="card flush">
      <div class="table-toolbar" style="padding:13px 13px 0"><span class="card-title">Prospects</span><span class="chip">${youth.length} players</span><div class="spacer"></div><span class="tiny muted">Promote players to the first team when they are ready.</span></div>
      ${youth.length ? `<div class="table-wrap" style="margin-top:10px"><table class="data-table youth-table">
        <thead><tr><th>Player</th><th>Pos</th><th class="num">Age</th><th class="num">OVR</th><th class="num">POT</th><th class="num">Value</th><th class="center">Potential</th><th class="center">Actions</th></tr></thead>
        <tbody>${youth.slice().sort((a, b) => b.pot - a.pot).map(p => `<tr>
          <td><div class="player-cell">${avatar(p, 29)}<div><div class="pc-name">${esc(p.name)}</div><div class="pc-meta"><span class="nation">${p.flag || '🏳️'}</span>${esc(p.nation)}</div></div></div></td>
          <td>${posTag(p.pos)}</td>
          <td class="num">${p.age}</td><td class="num"><span class="ovr ${ovrClass(p.ovr)}">${p.ovr}</span></td><td class="num"><span class="pot up">${p.pot}</span></td>
          <td class="num">${money(p.value)}</td><td class="center gold-text">${potentialStars(p.pot)}</td>
          <td class="center"><button class="btn btn-sm btn-primary" data-action="promote-youth" data-id="${p.id}">Promote</button> <button class="btn btn-sm btn-danger" data-action="release-youth" data-id="${p.id}">Release</button></td>
        </tr>`).join('')}</tbody></table></div>` : emptyState('youth', 'No academy prospects', 'Scout a prospect or wait for the end-of-season intake.')}
    </div>`;
}

// ============================================================
// Staff
// ============================================================
const STAFF_ROLES = ['Assistant Manager', 'Attacking Coach', 'Defensive Coach', 'Fitness Coach', 'Youth Coach'];
const STAFF_EFFECTS = {
  'Assistant Manager': 'Adds a small bonus to attack and defence in every match.',
  'Attacking Coach': 'Improves attacking match rating and attacking player development.',
  'Defensive Coach': 'Improves defensive match rating and defensive player development.',
  'Fitness Coach': 'Improves physical development and gives a small match bonus.',
  'Youth Coach': 'Raises youth intake quality and youth player development.',
};

function coachCardHtml(coach, options = {}) {
  if (!coach) {
    return `<div class="coach-card empty"><div class="cc-top"><div class="cc-avatar">${options.role ? '—' : '?'}</div><div><div class="cc-name">${esc(options.role || 'Empty role')}</div><div class="cc-role">Not filled</div></div></div><div class="cc-effect">Hire a specialist to fill this role.</div></div>`;
  }
  const isCurrent = !!options.current;
  return `<div class="coach-card">
    <div class="cc-top"><div class="cc-avatar">${esc(initials(coach.name))}</div><div style="flex:1;min-width:0"><div class="cc-name">${esc(coach.name)}</div><div class="cc-role">${esc(coach.role)}</div><div class="cc-stars">${stars(coach.rating)}</div></div></div>
    <div class="cc-effect">${esc(STAFF_EFFECTS[coach.role] || '')}</div>
    <div class="cc-bottom"><span class="cc-wage">£${Math.round(coach.wage)}k/wk</span>${isCurrent ? `<button class="btn btn-sm btn-danger" data-action="fire-coach" data-id="${coach.id}">Dismiss</button>` : `<button class="btn btn-sm btn-primary" data-action="hire-coach" data-name="${esc(coach.name)}" ${options.roleFilled || options.cantAfford ? 'disabled' : ''}>${options.roleFilled ? 'Role filled' : 'Hire'}</button>`}</div>
  </div>`;
}

function renderStaff() {
  const filters = ['all', ...STAFF_ROLES];
  const available = G.availableCoaches().filter(c => UI.staffFilter === 'all' || c.role === UI.staffFilter);
  const budget = G.state.budgets.transfer;
  return `${pageHead('Backroom staff', 'Your coaches shape match performance and player development. One specialist per role.', `<span class="chip green">Staff wages ${money(G.getUserStaffWages() / 1e6)}/wk</span><span class="chip gold">Budget ${money(budget)}</span>`)}
    <div class="card">
      <div class="card-head"><div><div class="card-title">Your staff</div><div class="card-sub">${G.state.staff.length} of ${STAFF_ROLES.length} roles filled</div></div></div>
      <div class="coach-grid">${STAFF_ROLES.map(role => coachCardHtml(G.getStaffForRole(role), { role, current: true })).join('')}</div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="card-head"><div><div class="card-title">Available coaches</div><div class="card-sub">Hiring costs a one-time compensation fee plus weekly wages.</div></div></div>
      <div class="staff-tabs">${filters.map(f => `<button class="staff-tab ${UI.staffFilter === f ? 'active' : ''}" data-action="staff-filter" data-filter="${f}">${f === 'all' ? 'All roles' : f}</button>`).join('')}</div>
      ${available.length ? `<div class="coach-grid">${available.map(c => coachCardHtml(c, { roleFilled: !!G.getStaffForRole(c.role), cantAfford: c.fee > budget })).join('')}</div>` : emptyState('staff', 'No coaches in this category', 'Try another role filter.')}
    </div>`;
}

// ============================================================
// Fixtures
// ============================================================
function renderFixtures() {
  const league = userLeague();
  const rounds = G.state.fixtures[league.id] || [];
  const current = Math.min(G.state.round, rounds.length - 1);
  if (UI.fixtureRound == null) UI.fixtureRound = current;
  const r = Math.max(0, Math.min(rounds.length - 1, UI.fixtureRound));
  const round = rounds[r] || [];
  const table = userTable();
  return `${pageHead('Fixtures & results', `${esc(league.name)} · Season ${esc(G.state.seasonLabel)} · Matchday ${G.state.round} of ${rounds.length}`, `<button class="btn btn-sm" data-action="nav" data-view="leagues">${icon('leagues', 14)} All leagues</button>`)}
    <div class="grid two">
      <div class="card">
        <div class="card-head"><div><div class="card-title">${esc(league.name)} table</div><div class="card-sub">Live standings</div></div><span class="chip">${table.length} clubs</span></div>
        ${fullLeagueTableHtml(league.id)}
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Matchday ${r + 1}</div><div class="card-sub">${r + 1 === G.state.round + 1 ? 'Current round' : r < G.state.round ? 'Played' : 'Upcoming'}</div></div></div>
          <div class="round-nav"><button class="icon-btn" data-action="round-prev">${icon('arrowLeft', 17)}</button><select class="select" data-action="fixture-round">${rounds.map((_, i) => `<option value="${i}" ${i === r ? 'selected' : ''}>Matchday ${i + 1}${i === G.state.round ? ' · current' : ''}</option>`).join('')}</select><button class="icon-btn" data-action="round-next">${icon('arrowRight', 17)}</button></div>
          ${round.length ? `<div class="fixture-list">${round.map(f => {
            const home = CLUBS[f.home], away = CLUBS[f.away];
            const isUser = f.home === G.state.clubId || f.away === G.state.clubId;
            const isCurrent = r === G.state.round && isUser && !f.played;
            return `<div class="fixture-row ${isUser ? 'user' : ''}">
              <div class="fixture-team">${clubBadge(home, 23)}<span>${esc(home.short)}</span></div>
              <div class="fixture-score">${f.played ? `${f.hg}-${f.ag}` : isCurrent ? '<button class="btn btn-sm btn-primary" data-action="play-match">Play</button>' : 'vs'}<span class="fs-time ${isUser ? 'user' : ''}">${f.played ? 'FT' : isCurrent ? 'Next' : ''}</span></div>
              <div class="fixture-team away"><span>${esc(away.short)}</span>${clubBadge(away, 23)}</div>
            </div>`;
          }).join('')}</div>` : emptyState('calendar', 'No fixtures', 'This matchday has no games.')}
          ${round.some(f => f.played && (f.home === G.state.clubId || f.away === G.state.clubId)) ? `<div style="margin-top:12px">${round.filter(f => (f.home === G.state.clubId || f.away === G.state.clubId) && f.played).map(f => `<div class="modal-note">${f.hg}-${f.ag} — ${(f.scorers || []).map(s => `${esc(s.name)} ${s.minute}'`).join(' · ') || 'No goals'}</div>`).join('')}</div>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Next up</div><div class="card-sub">Your next fixture</div></div></div>
          ${nextFixtureCard()}
        </div>
      </div>
    </div>`;
}

// ============================================================
// Leagues
// ============================================================
function renderLeagues() {
  const league = LEAGUES.find(l => l.id === UI.leagueTab) || userLeague();
  const table = G.getTable(league.id);
  return `${pageHead('League tables', 'All five leagues simulated every matchday. Follow the title race, European places and relegation battles.', '')}
    <div class="league-tabs-lg">${LEAGUES.map(l => `<button class="league-tab-lg ${l.id === league.id ? 'active' : ''}" data-action="league-tab" data-league="${l.id}"><span class="lt-dot" style="--lg-color:${l.color}"></span>${l.flag} ${esc(l.name)}</button>`).join('')}</div>
    <div class="grid two">
      <div class="card">
        <div class="card-head"><div><div class="card-title">${esc(league.name)}</div><div class="card-sub">${esc(league.country)} · ${league.clubs.length} clubs · Season ${esc(G.state.seasonLabel)}</div></div><span class="chip gold">${esc(table[0]?.club.name || '')}</span></div>
        ${fullLeagueTableHtml(league.id)}
        <div class="row" style="margin-top:10px"><span class="chip gold">Champion</span><span class="chip blue">European places</span><span class="chip red">Relegation</span></div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Top scorers</div><div class="card-sub">${esc(league.name)}</div></div></div>
          ${topScorerListHtml(league.id, 10)}
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Your position</div><div class="card-sub">${esc(userLeague().name)}</div></div></div>
          ${userRow() ? `<div class="fin-row"><span>Position</span><b>${userRow().pos} of ${userLeague().clubs.length}</b></div><div class="fin-row"><span>Points</span><b>${userRow().pts}</b></div><div class="fin-row"><span>Goal difference</span><b>${userRow().gd > 0 ? '+' : ''}${userRow().gd}</b></div><div class="fin-row"><span>Form</span><span>${formChips(userRow().form)}</span></div>` : ''}
        </div>
      </div>
    </div>`;
}

// ============================================================
// Finances
// ============================================================
function renderFinances() {
  const club = userClub();
  const proj = G.getWeeklyProjection();
  const wageBill = G.getUserWageBill();
  const wageBudget = G.state.budgets.wage * 1000;
  const wagePct = pct(wageBill, wageBudget);
  const history = G.state.history || [];
  return `${pageHead('Finances', 'Keep the board happy. Transfer fees come from your transfer budget; wages and staff costs hit the club balance every matchday.', `<span class="chip green">Balance ${money(G.state.balance)}</span>`)}
    <div class="fin-grid">
      <div class="fin-card green"><div class="fc-label">Transfer budget</div><div class="fc-value">${money(G.state.budgets.transfer)}</div><div class="fc-note">Available for fees and academy upgrades</div></div>
      <div class="fin-card gold"><div class="fc-label">Weekly wage budget</div><div class="fc-value">${money(G.state.budgets.wage / 1000)}</div><div class="fc-note">Current bill ${wage(wageBill)}</div></div>
      <div class="fin-card ${G.state.balance < 0 ? 'red' : ''}"><div class="fc-label">Club balance</div><div class="fc-value">${money(G.state.balance)}</div><div class="fc-note">Projected ${proj.net >= 0 ? '+' : ''}${money(proj.net)}/week</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Wage bill</div><div class="card-sub">${wage(wageBill)} of ${money(wageBudget / 1e6)} weekly budget</div></div><span class="chip ${wagePct > 95 ? 'red' : wagePct > 80 ? 'gold' : 'green'}">${Math.round(wagePct)}%</span></div>
          <div class="meter ${wagePct > 95 ? 'red' : wagePct > 80 ? 'gold' : ''}"><span style="width:${wagePct}%"></span></div>
          <div class="fin-bar-row" style="margin-top:14px"><div class="fbr-top"><span>Staff wages</span><b>${money(proj.staffWages)}/wk</b></div><div class="meter blue"><span style="width:${pct(proj.staffWages, Math.max(0.01, proj.expenses))}%"></span></div></div>
          <div class="fin-row"><span>Academy upkeep</span><b>${money(G.state.academy.level * 0.03)}/wk</b></div>
          <div class="fin-row"><span>Squad size</span><b>${userSquad().length} players</b></div>
          <div class="fin-row"><span>Highest earner</span><b>${esc(userSquad().slice().sort((a, b) => b.wage - a.wage)[0]?.name || '—')}</b></div>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Season cash flow</div><div class="card-sub">${esc(G.state.seasonLabel)}</div></div></div>
          <div class="fin-row"><span>Income collected</span><b class="green-text">${money(G.state.finances.income)}</b></div>
          <div class="fin-row"><span>Expenses paid</span><b class="red-text">${money(G.state.finances.expenses)}</b></div>
          <div class="fin-row"><span>Gate receipts</span><b>${money(G.state.finances.gate)}</b></div>
          <div class="fin-row"><span>Prize money</span><b class="gold-text">${money(G.state.finances.prize)}</b></div>
          <div class="fin-row"><span>Transfers spent</span><b>${money(G.state.finances.transferSpent)}</b></div>
          <div class="fin-row"><span>Transfers received</span><b>${money(G.state.finances.transferReceived)}</b></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Weekly projection</div><div class="card-sub">Matchday income and running costs</div></div><span class="chip ${proj.net >= 0 ? 'green' : 'red'}">${proj.net >= 0 ? '+' : ''}${money(proj.net)}</span></div>
          <div class="fin-row"><span>Sponsorship</span><b>${money(proj.income * 0.2)}</b></div>
          <div class="fin-row"><span>TV & commercial</span><b>${money(proj.income * 0.8)}</b></div>
          <div class="fin-row"><span>Player wages</span><b>-${money(proj.wages)}</b></div>
          <div class="fin-row"><span>Staff wages</span><b>-${money(proj.staffWages)}</b></div>
          <div class="fin-row"><span>Operations & academy</span><b>-${money(Math.max(0, proj.expenses - proj.wages - proj.staffWages))}</b></div>
          <div class="fin-row"><b>Net per week</b><b class="${proj.net >= 0 ? 'green-text' : 'red-text'}">${proj.net >= 0 ? '+' : ''}${money(proj.net)}</b></div>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Season history</div><div class="card-sub">Your managerial record</div></div></div>
          ${history.length ? `<div class="table-wrap"><table class="data-table" style="min-width:420px"><thead><tr><th>Season</th><th>League</th><th class="num">Pos</th><th class="num">Pts</th><th class="num">Prize</th></tr></thead><tbody>${history.slice().reverse().map(h => `<tr><td>${esc(h.seasonLabel)}</td><td>${esc(h.league)}</td><td class="num">${h.position}</td><td class="num">${h.points}</td><td class="num">${money(h.prize)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('chart', 'No completed seasons', 'Your season-by-season record will appear here.')}
        </div>
      </div>
    </div>`;
}

// ============================================================
// Help
// ============================================================
function renderHelp() {
  return `${pageHead('Help & save', 'Everything you need to know about running your club — plus save management.', `<button class="btn btn-sm btn-primary" data-action="save-game">${icon('save', 14)} Save now</button>`)}
    <div class="grid two">
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">How to play</div><div class="card-sub">A quick start guide</div></div></div>
          <div class="news-list">
            <div class="news-item"><div class="news-icon win">${icon('ball', 14)}</div><div><div class="news-text"><b>Play matches.</b> Open the dashboard and press Play match for live commentary, or Instant result to sim straight to full time.</div></div></div>
            <div class="news-item"><div class="news-icon transfer">${icon('transfer', 14)}</div><div><div class="news-text"><b>Buy and sell.</b> Use Transfers to bid for real players. Fees use your transfer budget; wages must fit your weekly limit. Click any player for a full report.</div></div></div>
            <div class="news-item"><div class="news-icon youth">${icon('youth', 14)}</div><div><div class="news-text"><b>Grow your own.</b> Scout prospects, upgrade the academy and promote teenagers. Potential is shown for every player.</div></div></div>
            <div class="news-item"><div class="news-icon board">${icon('staff', 14)}</div><div><div class="news-text"><b>Hire coaches.</b> Each role gives a different match or development bonus. One specialist per role.</div></div></div>
            <div class="news-item"><div class="news-icon win">${icon('trophy', 14)}</div><div><div class="news-text"><b>Meet the board.</b> Results and final league position affect confidence. Finish below expectations and you may be sacked.</div></div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Data & assumptions</div><div class="card-sub">What is real, what is simulated</div></div></div>
          <div class="modal-note" style="margin-top:0">Clubs, leagues and player names/ratings are based on the EA SPORTS FC 25 fan dataset. All 96 clubs in the Premier League, La Liga, Serie A, Bundesliga and Ligue 1 are included. Potential, values, wages, budgets, youth prospects and match events are simulated for gameplay. The 96-club universe is fixed — there is no promotion or relegation between leagues. Generated youth players are fictional. This is an unofficial fan project and is not affiliated with EA, the leagues or the clubs.</div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Save management</div><div class="card-sub">Progress is stored in this browser</div></div></div>
          <div class="fin-row"><span>Current season</span><b>${esc(G.state.seasonLabel)}</b></div>
          <div class="fin-row"><span>Manager</span><b>${esc(G.state.manager)}</b></div>
          <div class="fin-row"><span>Club</span><b>${esc(userClub().name)}</b></div>
          <div class="fin-row"><span>Matchday</span><b>${G.state.round}</b></div>
          <div class="fin-row"><span>Auto-save</span><b class="green-text">On</b></div>
          <div style="height:12px"></div>
          <button class="btn btn-block btn-primary" data-action="save-game">${icon('save', 15)} Save game</button>
          <div style="height:8px"></div>
          <button class="btn btn-block btn-danger" data-action="quit-career">Delete save & return to menu</button>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="card-title">Controls</div><div class="card-sub">Desktop and mobile</div></div></div>
          <div class="fin-row"><span>Open a player</span><b>Click / tap any player</b></div>
          <div class="fin-row"><span>Change view</span><b>Sidebar or bottom bar</b></div>
          <div class="fin-row"><span>Match speed</span><b>1x / 2x / 4x</b></div>
          <div class="fin-row"><span>Close popup</span><b>Esc or backdrop</b></div>
        </div>
      </div>
    </div>`;
}

function renderView() {
  switch (UI.view) {
    case 'squad': return renderSquad();
    case 'transfers': return renderTransfers();
    case 'youth': return renderYouth();
    case 'staff': return renderStaff();
    case 'fixtures': return renderFixtures();
    case 'leagues': return renderLeagues();
    case 'finances': return renderFinances();
    case 'help': return renderHelp();
    default: return renderDashboard();
  }
}

// ============================================================
// Modal system
// ============================================================
function openModal(config) {
  UI.modal = config;
  renderModal();
}

function closeModal() {
  UI.modal = null;
  document.getElementById('modal-root').innerHTML = '';
}

function modalFooter(buttons) {
  if (!buttons) return '';
  return `<div class="modal-foot">${buttons}</div>`;
}

function renderModal() {
  const root = document.getElementById('modal-root');
  if (!UI.modal) { root.innerHTML = ''; return; }
  const m = UI.modal;
  const wide = m.wide ? ' wide' : m.narrow ? ' narrow' : '';
  root.innerHTML = `<div class="modal-backdrop" data-action="modal-backdrop">
    <div class="modal${wide}" role="dialog" aria-modal="true" aria-label="${esc(m.title)}">
      <div class="modal-head"><div class="mh-text"><div class="modal-title">${esc(m.title)}</div>${m.subtitle ? `<div class="modal-sub">${esc(m.subtitle)}</div>` : ''}</div><button class="close-btn" data-action="close-modal" aria-label="Close">×</button></div>
      <div class="modal-body">${m.body}</div>
      ${m.footer ? modalFooter(m.footer) : ''}
    </div>
  </div>`;
}

function playerModalHtml(p) {
  const club = CLUBS[p.club];
  const stats = G.state.playerStats[p.id] || {};
  const isMine = p.club === G.state.clubId;
  const avgRating = stats.ratingCount ? (stats.ratingSum / stats.ratingCount).toFixed(1) : '—';
  const isGK = p.pos === 'GK';
  const attrs = isGK
    ? [['DIV', p.gk_div], ['HAN', p.gk_han], ['KIC', p.gk_kic], ['POS', p.gk_pos], ['REF', p.gk_ref], ['PHY', p.phy]]
    : [['PAC', p.pac], ['SHO', p.sho], ['PAS', p.pas], ['DRI', p.dri], ['DEF', p.def], ['PHY', p.phy]];
  return `<div class="player-hero">${avatar(p, 64)}<div><div class="ph-name">${esc(p.name)}</div><div class="ph-meta"><span class="nation">${p.flag || '🏳️'}</span>${esc(p.nation)} · ${posTag(p.pos)} · ${p.age} years · ${esc(p.foot)} foot · ${p.height}cm</div><div class="ph-meta">${isMine ? '<span class="tag green">Your player</span>' : `<span class="tag">${esc(club?.short || 'Free agent')}</span>`} ${p.pot - p.ovr >= 8 ? '<span class="tag gold">High potential</span>' : ''}</div></div><div class="ph-club">${club ? clubBadge(club, 30) : ''}<span>${esc(club?.name || 'Free agent')}</span></div></div>
    <div class="detail-grid">
      <div class="detail-box"><span>Overall</span><b>${p.ovr}</b></div>
      <div class="detail-box"><span>Potential</span><b class="green-text">${p.pot}</b></div>
      <div class="detail-box"><span>Value</span><b>${money(p.value)}</b></div>
      <div class="detail-box"><span>Wage</span><b>${wage(p.wage)}/wk</b></div>
      <div class="detail-box"><span>Contract</span><b>${p.contract} yrs</b></div>
      <div class="detail-box"><span>Apps / goals</span><b>${stats.apps || 0} / ${stats.goals || 0}</b></div>
      <div class="detail-box"><span>Assists</span><b>${stats.assists || 0}</b></div>
      <div class="detail-box"><span>Avg rating</span><b>${avgRating}</b></div>
      <div class="detail-box"><span>Potential stars</span><b class="gold-text">${potentialStars(p.pot)}</b></div>
    </div>
    <div class="attr-grid">${attrs.map(([label, value]) => `<div class="attr"><div class="attr-top"><span>${label}</span><b>${value}</b></div><div class="attr-bar ${Number(value) >= 80 ? 'gold' : Number(value) >= 65 ? '' : 'blue'}"><span style="width:${Math.max(2, Math.min(100, Number(value)))}%"></span></div></div>`).join('')}</div>
    ${isMine ? `<div class="modal-note">This player is part of your squad. You can offer him to other clubs or release him from his contract.</div>` : `<div class="modal-note">${esc(club?.name || 'This player')} value him at around <b>${money(askingPrice(p))}</b>. Wage demand: <b>${wage(wageDemand(p, userClub().reputation))}/wk</b>.</div>`}`;
}

function openPlayerModal(id) {
  const p = getPlayer(id);
  if (!p) return;
  const isMine = p.club === G.state.clubId;
  const footer = isMine
    ? `<button class="btn btn-danger" data-action="release-player" data-id="${p.id}">Release</button><button class="btn" data-action="sell-player" data-id="${p.id}">Offer to clubs</button><button class="btn btn-primary" data-action="close-modal">Close</button>`
    : `<button class="btn btn-primary" data-action="bid-player" data-id="${p.id}">${icon('transfer', 15)} Make an offer</button><button class="btn" data-action="close-modal">Close</button>`;
  openModal({ title: 'Player report', subtitle: 'Scout report and contract details', body: playerModalHtml(p), footer });
}

function openBidModal(playerId, message = '', messageType = 'info', presetBid = null, presetWage = null) {
  const p = getPlayer(playerId);
  if (!p) return;
  const ask = askingPrice(p);
  const demand = wageDemand(p, userClub().reputation);
  openModal({
    title: `Bid for ${p.name}`,
    subtitle: `${CLUBS[p.club]?.name || 'Free agent'} · ${p.pos} · ${p.ovr} OVR · POT ${p.pot}`,
    body: `${playerModalHtml(p)}
      <div class="offer-box"><div>Asking price <b>${money(ask)}</b></div><div>Wage demand <b>${wage(demand)}/wk</b></div><div>Your budget <b>${money(G.state.budgets.transfer)}</b> · Wage space <b>${wage(Math.max(0, G.state.budgets.wage * 1000 - G.getUserWageBill()))}</b></div></div>
      <form data-form="bid"><div class="form-row">
        <div class="field"><label>Transfer bid (£m)</label><input class="input" name="bid" type="number" min="0" step="0.1" value="${(presetBid ?? ask).toFixed(1)}" /></div>
        <div class="field"><label>Wage offer (£k/wk)</label><input class="input" name="wage" type="number" min="1" step="1" value="${Math.round((presetWage ?? demand) / 1000)}" /></div>
        <div class="field"><label>Contract years</label><select class="select" name="years"><option>2</option><option>3</option><option selected>4</option><option>5</option></select></div>
      </div>
      ${message ? `<div class="msg ${messageType}">${esc(message)}</div>` : ''}
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:8px">${icon('transfer', 15)} Submit offer</button></form>`,
    footer: `<button class="btn" data-action="close-modal">Cancel</button>`,
    wide: true,
  });
  if (UI.modal) UI.modal.playerId = playerId;
}

function openSaleModal(playerId) {
  const p = getPlayer(playerId);
  if (!p) return;
  UI.saleOffers = G.getSaleOffers(playerId);
  const offers = UI.saleOffers;
  const body = `${playerModalHtml(p)}
    <div class="card-title" style="margin-bottom:8px">Offers on the table</div>
    ${offers.length ? `<div class="offer-list">${offers.map((o, i) => `<div class="offer-item">${clubBadge(o.club, 34)}<div class="oi-text"><div class="oi-name">${esc(o.club.name)}</div><div class="oi-meta">${esc(LEAGUES.find(l => l.id === o.club.league)?.name || '')}</div></div><div class="oi-amount">${money(o.amount)}</div><button class="btn btn-sm btn-primary" data-action="accept-offer" data-id="${p.id}" data-index="${i}">Accept</button></div>`).join('')}</div>` : emptyState('transfer', 'No offers yet', 'No club is willing to meet your valuation right now.')}
    <div class="modal-note">Selling frees the player's wages and adds the fee to your transfer budget. You need at least 18 players in the squad.</div>`;
  openModal({ title: `Sell ${p.name}`, subtitle: 'Offers from interested clubs', body, footer: `<button class="btn btn-danger" data-action="release-player" data-id="${p.id}">Release for free</button><button class="btn" data-action="close-modal">Close</button>`, wide: true });
}

function openLineupModal() {
  const formation = G.state.formation;
  const slots = FORMATIONS[formation];
  const squad = userSquad().slice();
  const current = validateLineup(G.state.lineup, G.state.clubId) ? G.state.lineup : autoLineup(G.state.clubId, formation).lineup;
  const body = `<div class="formation-pitch">${current.map((id, i) => {
    const p = getPlayer(id);
    return `<div class="formation-dot ${p ? '' : 'formation-empty'}" title="${esc(slots[i])}">${esc(slots[i])}</div>`;
  }).join('')}</div>
  <form data-form="lineup"><div class="lineup-grid">${slots.map((slot, i) => {
    const options = squad.slice().sort((a, b) => effectiveRating(b, slot) - effectiveRating(a, slot));
    return `<div class="lineup-slot"><label>${slot}</label><select class="select" name="slot-${i}" data-lineup-slot="${i}">${options.map(p => `<option value="${p.id}" ${current[i] === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.pos)} ${p.ovr})</option>`).join('')}</select></div>`;
  }).join('')}</div>${UI.modal?.message ? `<div class="msg ${UI.modal.messageType || 'bad'}">${esc(UI.modal.message)}</div>` : ''}<div class="modal-note">Players out of position lose effectiveness. Your bench is selected automatically from the remaining squad.</div><button class="btn btn-primary btn-block" type="submit" style="margin-top:10px">${icon('check', 15)} Save starting XI</button></form>`;
  openModal({
    title: 'Edit starting XI',
    subtitle: `${formation} · ${G.state.mentality} mentality`,
    body,
    footer: `<button class="btn" data-action="close-modal">Cancel</button><button class="btn" data-action="lineup-auto">Auto pick</button>`,
    wide: true,
  });
}

function openMoreMenu() {
  const body = `<div class="offer-list">${[
    ['staff', 'Backroom staff', 'staff', 'Hire coaches and specialists'],
    ['fixtures', 'Fixtures & results', 'fixtures', 'Your match schedule and form'],
    ['finances', 'Finances', 'finance', 'Budgets, wages and cash flow'],
    ['help', 'Help & save', 'help', 'How to play and save management'],
    ['leagues', 'League tables', 'leagues', 'All five leagues'],
  ].map(([view, label, ic, sub]) => `<button class="offer-item" style="width:100%;text-align:left;cursor:pointer" data-action="nav" data-view="${view}">${icon(ic, 20)}<div class="oi-text"><div class="oi-name">${label}</div><div class="oi-meta">${sub}</div></div>${icon('arrowRight', 16)}</button>`).join('')}</div>`;
  openModal({ title: 'More', subtitle: 'Club management', body, footer: `<button class="btn" data-action="close-modal">Close</button>`, narrow: true });
}

function confirmModal(title, text, action, data = '', label = 'Confirm', danger = true) {
  openModal({
    title,
    subtitle: 'Please confirm',
    body: `<div class="modal-note" style="margin-top:0;font-size:13px">${esc(text)}</div>`,
    footer: `<button class="btn" data-action="close-modal">Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="${action}" ${data}>${esc(label)}</button>`,
    narrow: true,
  });
}

// ============================================================
// Season summary
// ============================================================
function showSeasonSummary() {
  const s = G.state.seasonSummary;
  if (!s) return;
  const body = `<div class="season-summary-hero"><div class="ssh-label">Season ${esc(s.seasonLabel)} complete</div><div class="ssh-title">${s.sacked ? 'SACKED' : s.position === 1 ? 'CHAMPIONS' : `${s.position}${s.position === 1 ? 'st' : s.position === 2 ? 'nd' : s.position === 3 ? 'rd' : 'th'} PLACE`}</div><div class="ssh-sub">${esc(s.leagueName)} · ${esc(s.champion)} won the title${s.position === 1 ? ' — that\'s you!' : ''}</div></div>
    <div class="summary-grid"><div class="summary-box"><span>Played</span><b>${s.played}</b></div><div class="summary-box"><span>Points</span><b>${s.points}</b></div><div class="summary-box"><span>Record</span><b>${s.won}-${s.drawn}-${s.lost}</b></div><div class="summary-box"><span>Prize money</span><b>${money(s.prize)}</b></div></div>
    <div class="msg ${s.sacked ? 'bad' : 'ok'}">${esc(s.boardMessage)}</div>
    <div class="fin-row"><span>Goals for / against</span><b>${s.gf} / ${s.ga}</b></div>
    <div class="fin-row"><span>Board confidence</span><b>${Math.round(G.state.boardConfidence)}%</b></div>
    <div class="fin-row"><span>Next season budget</span><b>${s.sacked ? '—' : 'Set by the board'}</b></div>`;
  openModal({
    title: s.sacked ? 'You have been dismissed' : 'Season review',
    subtitle: `${s.leagueName} · ${s.seasonLabel}`,
    body,
    footer: s.sacked
      ? `<button class="btn" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="new-career">Start a new career</button>`
      : `<button class="btn" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="next-season">Start next season</button>`,
    wide: true,
  });
}

// ============================================================
// Match simulation UI
// ============================================================
function matchTeamHtml(club, side, lineup) {
  const names = lineup.map(id => getPlayer(id)).filter(Boolean);
  return `<div class="side-block"><h3>${esc(club.name)} XI</h3><div class="lineup-list">${names.map(p => `<div class="ll-row"><span class="ll-pos">${esc(p.pos)}</span><span class="ll-name">${esc(p.name)}</span></div>`).join('')}</div></div>
    <div class="side-block"><h3>${esc(club.short)} key men</h3><div class="lineup-list">${names.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 4).map(p => `<div class="ll-row"><span class="ll-pos">${p.ovr}</span><span class="ll-name">${esc(p.name)}</span></div>`).join('')}</div></div>`;
}

function feedHtml(events) {
  if (!events.length) return '<div class="feed-event"><span class="fe-min">0\'</span><span class="fe-text">Kick-off! The match is under way.</span></div>';
  return events.map(e => `<div class="feed-event ${e.type || ''}"><span class="fe-min">${e.minute || 0}'</span><span class="fe-text">${esc(e.text)}</span></div>`).join('');
}

function statsHtml(sim) {
  const s = sim.stats;
  const totalShots = Math.max(1, s.shotsHome + s.shotsAway);
  const totalOn = Math.max(1, s.onTargetHome + s.onTargetAway);
  const totalCorners = Math.max(1, s.cornersHome + s.cornersAway);
  const rows = [
    [s.shotsHome, s.shotsAway, 'Shots', totalShots],
    [s.onTargetHome, s.onTargetAway, 'On target', totalOn],
    [s.cornersHome, s.cornersAway, 'Corners', totalCorners],
  ];
  const xgHome = sim.homeXg * Math.max(0.05, Math.min(1, sim.minute / 90));
  const xgAway = sim.awayXg * Math.max(0.05, Math.min(1, sim.minute / 90));
  const totalXg = Math.max(0.1, xgHome + xgAway);
  return `<div class="match-stats">
    <div class="stat-line"><b>${Math.round(sim.possessionHome)}%</b><div class="sl-mid"><div class="sl-label">Possession</div><div class="stat-track"><span class="home" style="width:${Math.round(sim.possessionHome)}%"></span><span class="away" style="width:${100 - Math.round(sim.possessionHome)}%"></span></div></div><b class="num-right">${100 - Math.round(sim.possessionHome)}%</b></div>
    ${rows.map(([home, away, label, total]) => `<div class="stat-line"><b>${home}</b><div class="sl-mid"><div class="sl-label">${label}</div><div class="stat-track"><span class="home" style="width:${pct(home, total)}%"></span><span class="away" style="width:${pct(away, total)}%"></span></div></div><b class="num-right">${away}</b></div>`).join('')}
    <div class="stat-line"><b>${xgHome.toFixed(1)}</b><div class="sl-mid"><div class="sl-label">Expected goals</div><div class="stat-track"><span class="home" style="width:${pct(xgHome, totalXg)}%"></span><span class="away" style="width:${pct(xgAway, totalXg)}%"></span></div></div><b class="num-right">${xgAway.toFixed(1)}</b></div>
  </div>`;
}

function matchStaticHtml(sim) {
  const home = sim.home, away = sim.away;
  return `<div class="match-overlay">
    <div class="match-header">
      <div class="match-comp">${esc(userLeague().name)} · Matchday ${G.state.round + 1} · ${esc(home.stadium)}</div>
      <div class="match-scoreline">
        <div class="match-team">${clubBadge(home, 52)}<div><div class="mt-name">${esc(home.name)}</div><div class="mt-sub">${home.id === G.state.clubId ? 'You · Home' : 'Home'}</div></div></div>
        <div><div class="match-score"><span id="match-hg">0</span><span class="dash">-</span><span id="match-ag">0</span></div><div class="match-clock" id="match-clock">0'</div></div>
        <div class="match-team away"><div><div class="mt-name">${esc(away.name)}</div><div class="mt-sub">${away.id === G.state.clubId ? 'You · Away' : 'Away'}</div></div>${clubBadge(away, 52)}</div>
      </div>
    </div>
    <div class="match-grid">
      <div class="match-feed-wrap"><h3>Live commentary</h3><div class="match-feed" id="match-feed">${feedHtml([])}</div></div>
      <div class="match-pitch-wrap">
        <div class="pitch" id="match-pitch">
          <div class="pitch-halfway"></div><div class="pitch-box left"></div><div class="pitch-box right"></div><div class="pitch-goal left"></div><div class="pitch-goal right"></div>
          <div class="pitch-label home">${esc(home.short)}</div><div class="pitch-label away">${esc(away.short)}</div>
          <div class="match-ball" id="match-ball" style="left:50%;top:50%"></div>
        </div>
        <div id="match-stats">${statsHtml(sim)}</div>
      </div>
      <div class="match-side">${matchTeamHtml(home, 'home', sim.homeLineup)}${matchTeamHtml(away, 'away', sim.awayLineup)}</div>
    </div>
    <div class="match-footer" id="match-footer">
      <button class="btn" data-action="match-pause" id="pause-btn">Pause</button>
      <div class="speed-group"><button class="speed-btn active" data-action="match-speed" data-speed="1">1x</button><button class="speed-btn" data-action="match-speed" data-speed="2">2x</button><button class="speed-btn" data-action="match-speed" data-speed="4">4x</button></div>
      <button class="btn" data-action="match-skip">Skip to result</button>
    </div>
  </div>`;
}

function updateMatchUi() {
  const m = UI.match;
  if (!m) return;
  const sim = m.sim;
  const hg = document.getElementById('match-hg');
  const ag = document.getElementById('match-ag');
  const clock = document.getElementById('match-clock');
  const feed = document.getElementById('match-feed');
  const stats = document.getElementById('match-stats');
  const ball = document.getElementById('match-ball');
  if (!hg) return;
  hg.textContent = sim.hg;
  ag.textContent = sim.ag;
  clock.textContent = sim.finished ? 'FT' : `${sim.minute}'`;
  if (feed) { feed.innerHTML = feedHtml(sim.events); feed.scrollTop = feed.scrollHeight; }
  if (stats) stats.innerHTML = statsHtml(sim);
  if (ball) {
    const lastGoal = [...sim.goals].reverse()[0];
    const side = lastGoal ? lastGoal.side : (Math.random() < 0.5 ? 'home' : 'away');
    const x = side === 'home' ? 78 + Math.random() * 10 : 12 + Math.random() * 10;
    const y = 24 + Math.random() * 52;
    ball.style.left = `${x}%`;
    ball.style.top = `${y}%`;
  }
  if (sim.goals.length > (m.lastGoals || 0)) {
    m.lastGoals = sim.goals.length;
    if (m.lastGoals > 0) {
      const flash = document.createElement('div');
      flash.className = 'goal-flash';
      flash.innerHTML = '<b>GOAL!</b>';
      document.getElementById('match-root').appendChild(flash);
      setTimeout(() => flash.remove(), 950);
    }
  }
}

function scheduleMatchTick() {
  const m = UI.match;
  if (!m) return;
  if (m.timer) clearInterval(m.timer);
  m.timer = setInterval(() => {
    if (!UI.match || UI.match.paused) return;
    const sim = UI.match.sim;
    if (sim.finished) return;
    sim.step();
    updateMatchUi();
    if (sim.finished) finishLiveMatch();
  }, 900 / m.speed);
}

function startLiveMatch() {
  if (G.state.seasonOver) { showToast('The season is complete. Review it and start the next season.', 'gold'); return; }
  const sim = G.createUserMatch();
  if (!sim) { showToast('No fixture to play right now.', 'bad'); return; }
  UI.match = { sim, speed: 1, paused: false, timer: null, lastGoals: 0 };
  document.body.classList.add('match-open');
  document.getElementById('match-root').innerHTML = matchStaticHtml(sim);
  updateMatchUi();
  scheduleMatchTick();
}

function finishLiveMatch() {
  const m = UI.match;
  if (!m) return;
  if (m.timer) clearInterval(m.timer);
  m.timer = null;
  const sim = m.sim;
  updateMatchUi();
  const footer = document.getElementById('match-footer');
  if (footer) footer.innerHTML = `<span class="chip green" style="font-size:12px;padding:7px 12px">Full time · ${sim.home.short} ${sim.hg}-${sim.ag} ${sim.away.short}</span><button class="btn btn-primary" data-action="match-continue">Continue</button>`;
}

function closeMatchOverlay() {
  if (UI.match?.timer) clearInterval(UI.match.timer);
  UI.match = null;
  document.body.classList.remove('match-open');
  document.getElementById('match-root').innerHTML = '';
}

function matchContinue() {
  const m = UI.match;
  if (!m) return;
  const result = m.sim.result();
  closeMatchOverlay();
  G.completeUserMatch(result);
  UI.view = G.state.activeView || 'dashboard';
  renderApp();
  showMatchReport(result);
}

function skipMatch() {
  const m = UI.match;
  if (!m) return;
  if (m.timer) clearInterval(m.timer);
  m.sim.runToEnd();
  m.lastGoals = m.sim.goals.length;
  updateMatchUi();
  finishLiveMatch();
}

function instantMatch() {
  if (G.state.seasonOver) { showToast('The season is complete. Review it and start the next season.', 'gold'); return; }
  const sim = G.createUserMatch();
  if (!sim) { showToast('No fixture to play right now.', 'bad'); return; }
  const result = sim.runToEnd();
  G.completeUserMatch(result);
  renderApp();
  showMatchReport(result);
}

function showMatchReport(result) {
  const home = CLUBS[result.homeId], away = CLUBS[result.awayId];
  const userHome = result.homeId === G.state.clubId;
  const userGoals = userHome ? result.hg : result.ag;
  const oppGoals = userHome ? result.ag : result.hg;
  const won = userGoals > oppGoals, drew = userGoals === oppGoals;
  const scorers = result.goals.map(g => `<div class="fin-row"><span>${g.minute}' ${esc(g.scorerName)} <span class="muted">(${g.side === 'home' ? home.short : away.short})</span></span><b>${g.assistName ? `A: ${esc(g.assistName)}` : ''}</b></div>`).join('') || '<div class="modal-note">No goals.</div>';
  openModal({
    title: won ? 'Victory' : drew ? 'Draw' : 'Defeat',
    subtitle: `${esc(userLeague().name)} · Matchday ${G.state.round}`,
    body: `<div class="season-summary-hero"><div class="ssh-label">Full time</div><div class="ssh-title">${home.short} ${result.hg} - ${result.ag} ${away.short}</div><div class="ssh-sub">${esc(home.name)} vs ${esc(away.name)}</div></div>
      <div class="summary-grid"><div class="summary-box"><span>Possession</span><b>${result.possessionHome}% - ${100 - result.possessionHome}%</b></div><div class="summary-box"><span>Shots</span><b>${result.stats.shotsHome} - ${result.stats.shotsAway}</b></div><div class="summary-box"><span>On target</span><b>${result.stats.onTargetHome} - ${result.stats.onTargetAway}</b></div><div class="summary-box"><span>xG</span><b>${result.homeXg} - ${result.awayXg}</b></div></div>
      <div class="card-title" style="margin-bottom:6px">Goals</div>${scorers}
      <div class="modal-note">${won ? 'A big result for the dressing room.' : drew ? 'A point on the board.' : 'The board will expect a response in the next match.'}</div>`,
    footer: `<button class="btn" data-action="close-modal">Close</button>${G.state.seasonOver ? `<button class="btn btn-primary" data-action="season-summary">Season review</button>` : `<button class="btn btn-primary" data-action="close-modal">Continue</button>`}`,
    wide: true,
  });
}

// ============================================================
// Toast
// ============================================================
export function showToast(text, type = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = text;
  root.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

// ============================================================
// Event handlers
// ============================================================
function setView(view, scroll = true) {
  UI.view = view;
  if (G.state) G.setActiveView(view);
  if (UI.match) closeMatchOverlay();
  closeModal();
  renderApp();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function beginCareer() {
  const name = (UI.onboarding.name || '').trim() || 'Alex Morgan';
  const clubId = UI.onboarding.clubId;
  if (!clubId) { showToast('Select a club first.', 'bad'); return; }
  G.startNewGame(name, clubId);
  UI.view = 'dashboard';
  UI.forcedOnboarding = false;
  renderApp();
  showToast(`Welcome to ${CLUBS[clubId].name}. Your career begins now.`);
}

function continueCareer() {
  if (G.loadGame()) {
    UI.view = G.state.activeView || 'dashboard';
    renderApp();
    if (G.state.seasonOver) {
      setTimeout(() => showSeasonSummary(), 350);
    }
    showToast('Career loaded.');
  } else {
    showToast('Could not load the save. Start a new career.', 'bad');
    UI.forcedOnboarding = true;
    renderLanding();
  }
}

function newCareer() {
  confirmModal('Start a new career?', 'This will delete your current save and return to club selection.', 'confirm-new-career', '', 'Start new career');
}

function handleAction(action, el) {
  const id = el.dataset.id;
  const leagueId = el.dataset.league;
  const view = el.dataset.view;

  switch (action) {
    case 'nav':
      setView(view);
      break;
    case 'more-menu':
      openMoreMenu();
      break;
    case 'select-league':
      UI.onboarding.leagueId = leagueId;
      UI.onboarding.clubId = null;
      renderLanding();
      break;
    case 'select-club':
      UI.onboarding.clubId = el.dataset.club;
      renderLanding();
      break;
    case 'random-club': {
      const league = LEAGUES[Math.floor(Math.random() * LEAGUES.length)];
      UI.onboarding.leagueId = league.id;
      const clubs = league.clubs;
      UI.onboarding.clubId = clubs[Math.floor(Math.random() * clubs.length)];
      renderLanding();
      break;
    }
    case 'begin-career':
      beginCareer();
      break;
    case 'continue-career':
      continueCareer();
      break;
    case 'new-career':
      newCareer();
      break;
    case 'confirm-new-career':
      G.quitToMenu();
      UI.forcedOnboarding = true;
      UI.onboarding.clubId = null;
      closeModal();
      renderLanding();
      showToast('Save deleted. Choose your next club.');
      break;
    case 'save-game':
      showToast(G.saveGame() ? 'Game saved.' : 'Could not save — browser storage may be full.', G.saveGame() ? '' : 'bad');
      break;
    case 'play-match':
      startLiveMatch();
      break;
    case 'instant-match':
      instantMatch();
      break;
    case 'match-pause': {
      if (!UI.match) break;
      UI.match.paused = !UI.match.paused;
      el.textContent = UI.match.paused ? 'Resume' : 'Pause';
      break;
    }
    case 'match-speed': {
      if (!UI.match) break;
      UI.match.speed = Number(el.dataset.speed) || 1;
      $$('.speed-btn').forEach(b => b.classList.toggle('active', b.dataset.speed === String(UI.match.speed)));
      scheduleMatchTick();
      break;
    }
    case 'match-skip':
      skipMatch();
      break;
    case 'match-continue':
      matchContinue();
      break;
    case 'open-player':
      openPlayerModal(id);
      break;
    case 'bid-player':
      openBidModal(id);
      break;
    case 'sell-player':
      openSaleModal(id);
      break;
    case 'accept-offer': {
      const offer = UI.saleOffers?.[Number(el.dataset.index)];
      if (!offer) break;
      const res = G.sellPlayer(id, offer);
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) { closeModal(); renderApp(); }
      break;
    }
    case 'release-player':
      confirmModal('Release player?', 'The player will leave for free. You need at least 18 players in your squad.', 'confirm-release-player', `data-id="${id}"`, 'Release');
      break;
    case 'confirm-release-player': {
      const res = G.releasePlayer(id);
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) { closeModal(); renderApp(); }
      break;
    }
    case 'edit-lineup':
      openLineupModal();
      break;
    case 'auto-lineup':
    case 'lineup-auto':
      G.autoPickLineup();
      showToast('Best available XI selected.');
      closeModal();
      renderApp();
      break;
    case 'sort-squad': {
      const key = el.dataset.key;
      if (UI.squadSort.key === key) UI.squadSort.dir *= -1;
      else UI.squadSort = { key, dir: key === 'name' || key === 'age' ? 1 : -1 };
      renderApp();
      break;
    }
    case 'load-more':
      UI.market.limit += 30;
      updateMarketResults();
      break;
    case 'staff-filter':
      UI.staffFilter = el.dataset.filter;
      renderApp();
      break;
    case 'hire-coach': {
      const res = G.hireCoach(el.dataset.name);
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) renderApp();
      break;
    }
    case 'fire-coach':
      confirmModal('Dismiss coach?', 'You will save their weekly wage, but lose their bonus immediately.', 'confirm-fire-coach', `data-id="${id}"`, 'Dismiss');
      break;
    case 'confirm-fire-coach': {
      const res = G.fireCoach(id);
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) { closeModal(); renderApp(); }
      break;
    }
    case 'upgrade-academy': {
      const res = G.upgradeAcademy();
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) renderApp();
      break;
    }
    case 'scout-youth': {
      const res = G.scoutYouth();
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) renderApp();
      break;
    }
    case 'promote-youth': {
      const res = G.promoteYouth(id);
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) renderApp();
      break;
    }
    case 'release-youth':
      confirmModal('Release prospect?', 'The prospect will leave the academy permanently.', 'confirm-release-youth', `data-id="${id}"`, 'Release');
      break;
    case 'confirm-release-youth': {
      const res = G.releaseYouth(id);
      showToast(res.message, res.ok ? '' : 'bad');
      if (res.ok) { closeModal(); renderApp(); }
      break;
    }
    case 'league-tab':
      UI.leagueTab = leagueId;
      renderApp();
      break;
    case 'fixture-round':
      break;
    case 'round-prev':
    case 'round-next': {
      const league = userLeague();
      const rounds = G.state.fixtures[league.id] || [];
      const current = UI.fixtureRound ?? G.state.round;
      UI.fixtureRound = Math.max(0, Math.min(rounds.length - 1, current + (action === 'round-prev' ? -1 : 1)));
      renderApp();
      break;
    }
    case 'season-summary':
      closeModal();
      showSeasonSummary();
      break;
    case 'next-season':
      if (G.startNextSeason()) {
        closeModal();
        UI.view = 'dashboard';
        renderApp();
        showToast('A new season begins. Good luck.');
      } else {
        showToast('Could not start the next season.', 'bad');
      }
      break;
    case 'quit-career':
      confirmModal('Delete save and return to menu?', 'All progress in this career will be lost.', 'confirm-quit-career', '', 'Delete save');
      break;
    case 'confirm-quit-career':
      G.quitToMenu();
      UI.forcedOnboarding = true;
      UI.onboarding.clubId = null;
      closeModal();
      renderLanding();
      break;
    case 'close-modal':
      closeModal();
      break;
    case 'modal-backdrop':
      if (el === el.target) closeModal();
      break;
  }
}

function handleClick(event) {
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (!action) return;
  // Clicks inside a modal resolve to the backdrop via closest(); only treat
  // the backdrop itself as the close action, and let native form submits run.
  if (action === 'modal-backdrop' && event.target !== actionEl) return;
  // Selects and text inputs use data-action for change/input handling, so
  // never swallow their native behaviour with preventDefault.
  const tag = actionEl.tagName;
  if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
  event.preventDefault();
  handleAction(action, actionEl);
}

function handleChange(event) {
  const el = event.target;
  if (el.matches('[data-action="set-formation"]')) {
    G.setFormation(el.value);
    renderApp();
    return;
  }
  if (el.matches('[data-action="set-mentality"]')) {
    G.setMentality(el.value);
    renderApp();
    return;
  }
  if (el.matches('[data-action="fixture-round"]')) {
    UI.fixtureRound = Number(el.value);
    renderApp();
    return;
  }
  if (el.matches('[data-market-filter]')) {
    UI.market[el.dataset.marketFilter] = el.value;
    UI.market.limit = 30;
    updateMarketResults();
    return;
  }
  if (el.matches('[data-lineup-formation]')) {
    // handled in modal via form, not used
  }
}

function handleInput(event) {
  const el = event.target;
  if (el.id === 'manager-name') {
    UI.onboarding.name = el.value;
    return;
  }
  if (el.matches('[data-market-filter="q"]')) {
    UI.market.q = el.value;
    UI.market.limit = 30;
    updateMarketResults();
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (form.matches('[data-form="bid"]')) {
    event.preventDefault();
    // The player id is stored on the modal when opened.
    const playerId = UI.modal?.playerId;
    const p = getPlayer(playerId);
    if (!p) return;
    const bid = Number(form.bid.value);
    const wageK = Number(form.wage.value);
    const years = Number(form.years.value);
    if (!Number.isFinite(bid) || !Number.isFinite(wageK) || bid <= 0 || wageK <= 0) {
      showToast('Enter a valid bid and wage.', 'bad');
      return;
    }
    const res = G.makeOffer(playerId, bid, wageK * 1000, years);
    if (res.status === 'accepted') {
      showToast(res.message, '');
      closeModal();
      renderApp();
    } else {
      openBidModal(playerId, res.message, res.status === 'counter' ? 'info' : 'bad', res.asking, res.demand);
    }
    return;
  }
  if (form.matches('[data-form="lineup"]')) {
    event.preventDefault();
    const lineup = [];
    for (let i = 0; i < 11; i++) {
      const sel = form.querySelector(`[data-lineup-slot="${i}"]`);
      if (sel) lineup.push(sel.value);
    }
    if (G.setLineup(lineup)) {
      showToast('Starting XI saved.');
      closeModal();
      renderApp();
    } else {
      UI.modal.message = 'That lineup is invalid. Pick 11 different players.';
      UI.modal.messageType = 'bad';
      renderModal();
    }
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (UI.modal) closeModal();
  }
}

export function initUI() {
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
  document.addEventListener('input', handleInput);
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('keydown', handleKeydown);
  if (G.hasSave()) {
    renderLanding();
  } else {
    UI.forcedOnboarding = true;
    renderLanding();
  }
}

