import { CLUBS, PLAYERS } from './data.js';

export const DB = {
  players: [],
  byId: new Map(),
  byClub: new Map(),
  baseById: new Map(),
};

function rebuildMaps() {
  DB.byId = new Map();
  DB.byClub = new Map();
  for (const p of DB.players) {
    DB.byId.set(p.id, p);
    if (p.club) {
      if (!DB.byClub.has(p.club)) DB.byClub.set(p.club, []);
      DB.byClub.get(p.club).push(p);
    }
  }
}

export function resetDB() {
  DB.players = PLAYERS.map(p => ({ ...p }));
  DB.baseById = new Map(PLAYERS.map(p => [p.id, p]));
  rebuildMaps();
}

export function getPlayer(id) {
  return DB.byId.get(id);
}

export function getClub(id) {
  return CLUBS[id] || null;
}

export function squadOf(clubId) {
  return DB.byClub.get(clubId) || [];
}

export function addPlayer(player) {
  player.custom = true;
  DB.players.push(player);
  DB.byId.set(player.id, player);
  if (!DB.byClub.has(player.club)) DB.byClub.set(player.club, []);
  DB.byClub.get(player.club).push(player);
  return player;
}

export function movePlayer(player, clubId) {
  const old = player.club;
  if (old && DB.byClub.has(old)) {
    const list = DB.byClub.get(old);
    const i = list.indexOf(player);
    if (i >= 0) list.splice(i, 1);
  }
  player.club = clubId;
  if (clubId) {
    if (!DB.byClub.has(clubId)) DB.byClub.set(clubId, []);
    DB.byClub.get(clubId).push(player);
  }
}

export function refreshClubSquads() {
  rebuildMaps();
}

export function allPlayers() {
  return DB.players;
}
