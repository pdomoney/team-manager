// Team Manager data rules. No screens here, only the data: what is linked to what, what counts as
// confirmed, how the numbers in the reports are worked out, how teams and the library fit together,
// and how two copies of the data are compared. Shared by the app (site/app.js) and the tests
// (test/model.test.js), so every rule the coach relies on can be checked in Node.
//
// The coach's data (schema 3, a "workspace")
//   The first team's data sits at the top level, exactly as it did before there could be more than
//   one team, so an older copy of the app (or a rollback to it) still opens that team. Other teams
//   live in `teams`, and the shared library of plays, game systems and player lists in `library`.
//
//     { schema: 3, id: 'team1', team: {...}, players: [...], sessions: [...], ...   <- first team
//       teams: [{ id, team, players, sessions, ... }],                              <- other teams
//       library: { plays: [], systems: {}, playerSets: [] },
//       clubs: [{ id, name, ... }],                                  <- clubs; a team names its club in team.clubId
//       updatedAt }
//
// People on a task are 'p:<player id>' or 'h:<helper id>'. Replies a coach records (RSVPs, task
// replies) carry `via: 'coach'`, so a future sign-in system can tell them apart from people's own.

import { RULES } from './rules.js';
export { RULES };

// Schema 4 adds seasons (team.seasons, and a seasonId on training, matches, tasks, messages and
// notices) and competitions (ws.competitions, with entries for a team's season). Both are additions:
// an earlier app still opens a schema 4 copy, showing every season's records together.
export const SCHEMA = 4;
export const PRIMARY_ID = 'team1';
const WS_KEYS = ['schema', 'teams', 'library', 'clubs', 'competitions'];
const TEAM_ID = /^[a-z0-9]{3,32}$/;

export const arr = v => Array.isArray(v) ? v : [];
export const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const pad = n => String(n).padStart(2, '0');
export const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(iso, n) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return isoDay(new Date(y, (m || 1) - 1, (d || 1) + n));
}
const byWhen = (a, b) => (String(a.date) + (a.start || '')).localeCompare(String(b.date) + (b.start || ''));
// JSON with the keys sorted, so two copies of the same record compare equal whatever order their
// keys were written in.
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/* ---------- Teams ---------- */
export const teamsOf = ws => ws ? [ws, ...arr(ws.teams)] : [];
export const activeTeams = ws => teamsOf(ws).filter(t => !t.archived);
export const findTeam = (ws, id) => teamsOf(ws).find(t => t.id === id) || null;
export const teamName = t => (t && t.team && t.team.name) || 'Team';
// The players' file for each team. The first team keeps the original name so existing invite links work.
export const teamFile = (ws, t) => t === ws ? 'team.enc.json' : `team-${t.id}.enc.json`;
export const TEAM_FILE = /^team(?:-([a-z0-9]{3,32}))?\.enc\.json$/;
export function stripWs(t) { const out = { ...obj(t) }; WS_KEYS.forEach(k => delete out[k]); return out; }

// Any earlier copy becomes a workspace. A single-team copy (schema 1 or 2) becomes the first team
// with the id 'team1', so the upgrade gives the same result every time and on every device.
// `normTeam` fills in a team's missing parts (the app passes its own normalize).
export function migrateWorkspace(raw, normTeam = t => t) {
  const src = obj(raw);
  const ws = normTeam(stripWs(src));
  ws.id = typeof src.id === 'string' && src.id ? src.id : PRIMARY_ID;
  const seen = new Set([ws.id]);
  ws.teams = arr(src.teams).filter(isObj).map((t, i) => {
    const n = normTeam(stripWs(t));
    let id = typeof t.id === 'string' && TEAM_ID.test(t.id) ? t.id : `team${i + 2}`;
    while (seen.has(id)) id += 'x';
    seen.add(id); n.id = id; n.archived = !!t.archived;
    return n;
  });
  ws.archived = !!src.archived;
  ws.library = normLibrary(src.library);
  ws.clubs = src.clubs === undefined ? seedClubs(ws) : arr(src.clubs).filter(isObj).map(normClub);
  const clubIds = new Set(ws.clubs.map(c => c.id));
  teamsOf(ws).forEach(t => { if (t.team && t.team.clubId && !clubIds.has(t.team.clubId)) t.team.clubId = ''; });
  ws.schema = SCHEMA;
  ws.updatedAt = src.updatedAt || null;
  teamsOf(ws).forEach(t => ensureSeasons(t));
  ws.competitions = src.competitions === undefined ? seedCompetitions(ws) : arr(src.competitions).filter(isObj).map(normComp);
  repairCompetitions(ws);
  syncEvents(ws);
  fixDefaultPositions(ws);
  teamsOf(ws).forEach(t => repairTeam(t));
  return ws;
}
/* ---------- Seasons ---------- */
// A team keeps its identity across seasons: its id, club, name, settings, plays and game systems. A
// season is one period of play with its own squad, staff and records. Training sessions, matches,
// tasks, messages and notices carry the seasonId of the season they belong to. People stay in
// team.players (one record per person, never matched by name); a season's squad entries say who
// played that season and with what number, positions, availability and registration.
// While a season is active, the player records hold its current values, and anyone not yet in any
// season's squad counts as in it (so adding a player only changes that player's record, and two
// phones adding different players don't clash). When a season is completed, or the next one is made,
// its squad is written down in full: from then on its squad entries are the record of that season.
export const SEASON_STATUS = { planned: 'Planned', active: 'Active', completed: 'Completed', archived: 'Archived' };
export const SEASON_MOVES = { planned: ['active', 'archived'], active: ['completed'], completed: ['active', 'archived'], archived: ['completed'] };
export const SEASON_KINDS = ['sessions', 'matches', 'tasks', 'messages', 'notices'];
export const REG_STATUS = { '': 'Not recorded', registered: 'Registered', pending: 'Pending' };
const DEFAULT_KEYS = ['trainingVenue', 'trainingStart', 'trainingEnd'];
const memberOf = p => ({ playerId: p.id, number: String(p.number || ''), positions: arr(p.positions).slice(), status: p.status || 'available', reg: '' });
export function normSeason(x) {
  const s = obj(x);
  return {
    id: String(s.id || uid()), name: String(s.name || 'Season'), label: String(s.label || ''), year: String(s.year || ''),
    start: String(s.start || ''), end: String(s.end || ''), status: SEASON_STATUS[s.status] ? s.status : 'planned',
    staff: arr(s.staff).filter(isObj).map(r => ({ role: String(r.role || 'Other'), name: String(r.name || ''), phone: String(r.phone || ''), email: String(r.email || '') })),
    defaults: Object.fromEntries(Object.entries(obj(s.defaults)).filter(([k]) => DEFAULT_KEYS.includes(k)).map(([k, v]) => [k, String(v || '')])),
    squad: arr(s.squad).filter(m => isObj(m) && m.playerId).map(m => ({ playerId: String(m.playerId), number: String(m.number || ''), positions: arr(m.positions).map(String),
      status: ['available', 'injured', 'unavailable'].includes(m.status) ? m.status : 'available', reg: REG_STATUS[m.reg] !== undefined ? m.reg : '' })),
    createdAt: s.createdAt || null, completedAt: s.completedAt || null, from: String(s.from || '')
  };
}
export const seasonsOf = t => arr(t && t.seasons);
export const activeSeason = t => seasonsOf(t).find(s => s.status === 'active') || null;
export const findSeason = (t, id) => (id && seasonsOf(t).find(s => s.id === id)) || null;
export const memberSeasons = (t, pid) => seasonsOf(t).filter(s => s.squad.some(m => m.playerId === pid));
// Is this person in that season's squad (the active season also has anyone not yet in any squad)?
export const inSeason = (t, sid, pid) => { const s = findSeason(t, sid); return !!s && (s.squad.some(m => m.playerId === pid) || (s.status === 'active' && !inAnySeason(t).has(pid))); };
// The first season for data from before seasons: named from the team's season setting, or the years
// its records span ("2026–27"); its dates are left for the coach to fill in.
function firstSeason(t) {
  const T = obj(t.team);
  const years = SEASON_KINDS.flatMap(k => arr(t[k]).map(x => String((x && (x.date || x.at)) || '').slice(0, 4))).filter(y => /^\d{4}$/.test(y)).sort();
  const span = !years.length ? '' : years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1].slice(2)}`;
  return normSeason({ id: 'season1', name: T.season || span || 'Current season', year: years[0] || '', status: 'active',
    staff: arr(T.staff), defaults: Object.fromEntries(DEFAULT_KEYS.map(k => [k, T[k] || ''])), squad: arr(t.players).filter(p => p && p.id).map(memberOf) });
}
// Every team has its seasons in order: the first one made from its existing data (always the same,
// so two phones upgrading the same copy agree), at most one active, and records claimed by a season.
export function ensureSeasons(t) {
  t.seasons = seasonsOf(t).filter(isObj).map(normSeason);
  if (!t.seasons.length) t.seasons.push(firstSeason(t));
  let seen = false;
  t.seasons.forEach(s => { if (s.status === 'active') { if (seen) s.status = 'completed'; seen = true; } });
  const a = activeSeason(t);
  if (a && t.team) t.team.season = a.name;   // the team's season setting is the active season's name
  claimRecords(t);
  ensureJerseys(t);
  return t;
}
// Records without a season (new ones, or made by an earlier app) join the season being worked on, and
// a match's own lineup goes with its match. Only those new records change.
export function claimRecords(t, sid) {
  const target = findSeason(t, sid) || activeSeason(t);
  if (!target) return 0;
  let n = 0;
  SEASON_KINDS.forEach(k => arr(t[k]).forEach(x => { if (isObj(x) && !x.seasonId) { x.seasonId = target.id; n++; } }));
  const lineups = new Map(arr(t.lineups).map(l => [l.id, l]));
  arr(t.matches).forEach(m => { const l = m.lineupId && lineups.get(m.lineupId); if (l && !l.seasonId) l.seasonId = m.seasonId; });
  return n;
}
const inAnySeason = t => new Set(seasonsOf(t).flatMap(s => s.squad.map(m => m.playerId)));
// Write the active season down as it stands: its whole squad with current numbers, positions and
// availability (registration kept), its staff and training defaults.
function syncActive(t) {
  const s = activeSeason(t); if (!s) return;
  const old = new Map(s.squad.map(m => [m.playerId, m]));
  s.squad = seasonLens(t, s.id).players.map(p => ({ ...memberOf(p), reg: (old.get(p.id) || {}).reg || '' }));
  const T = obj(t.team);
  s.staff = arr(T.staff).filter(isObj).map(r => ({ role: String(r.role || 'Other'), name: String(r.name || ''), phone: String(r.phone || ''), email: String(r.email || '') }));
  s.defaults = Object.fromEntries(DEFAULT_KEYS.map(k => [k, String(T[k] || '')]));
  if (t.team) t.team.season = s.name;
}
// A season becoming active: its squad entries become the players' current number, positions and
// availability, and its staff and training defaults become the team's.
function applySeason(t, s) {
  const ps = new Map(arr(t.players).map(p => [p.id, p]));
  s.squad.forEach(m => { const p = ps.get(m.playerId); if (p) Object.assign(p, { number: m.number, positions: m.positions.slice(), status: m.status || 'available' }); });
  if (!t.team) t.team = {};
  t.team.staff = s.staff.map(r => ({ ...r }));
  DEFAULT_KEYS.forEach(k => { if (k in s.defaults) t.team[k] = s.defaults[k]; });
  t.team.season = s.name;
}
// Planned → active or archived; active → completed; completed → active (reopened) or archived;
// archived → completed. Only one season can be active. Returns '' or why it can't.
export function seasonMove(t, id, to, now = new Date()) {
  const s = findSeason(t, id); if (!s) return 'missing';
  if (!(SEASON_MOVES[s.status] || []).includes(to)) return 'not-allowed';
  const a = activeSeason(t);
  if (to === 'active' && a && a !== s) return 'other-active';
  if (s.status === 'active') syncActive(t);
  s.status = to;
  if (to === 'active') { applySeason(t, s); claimRecords(t); }
  if (to === 'completed' && !s.completedAt) s.completedAt = isoDay(now);
  return '';
}
// The next season. Only the players the coach picked are in it (each with the number and positions
// given), plus anyone new; availability starts fresh. Nothing from the last season is copied: no
// training, matches, results, RSVPs, tasks, lifts or messages. Staff and training defaults only if
// asked for. Optionally completes the current season and starts the new one straight away.
export function rollover(t, d, now = new Date()) {
  const cur = activeSeason(t);
  if (cur) syncActive(t);
  const ids = new Set(arr(t.players).map(p => p.id)), squad = [], seen = new Set();
  arr(d.carry).forEach(c => { if (!ids.has(c.playerId) || seen.has(c.playerId)) return; seen.add(c.playerId);
    squad.push({ playerId: c.playerId, number: String(c.number || ''), positions: arr(c.positions).map(String), status: 'available', reg: '' }); });
  const added = arr(d.newPlayers).filter(x => x && String(x.name || '').trim()).map(x => {
    const p = { id: uid(), name: String(x.name).trim(), gender: x.gender === 'F' || x.gender === 'M' ? x.gender : '', number: String(x.number || ''), phone: '', positions: arr(x.positions).map(String), status: 'available', notes: '' };
    t.players = arr(t.players); t.players.push(p); squad.push(memberOf(p)); return p;
  });
  const T = obj(t.team);
  const s = normSeason({ id: uid(), name: d.name || 'Next season', label: d.label, year: d.year, start: d.start, end: d.end, status: 'planned', squad,
    staff: arr(d.staff), defaults: Object.fromEntries(DEFAULT_KEYS.map(k => [k, d.keepDefaults ? T[k] || '' : ''])), createdAt: isoDay(now), from: cur ? cur.id : '' });
  t.seasons = seasonsOf(t); t.seasons.push(s);
  if (d.activate) { if (cur) seasonMove(t, cur.id, 'completed', now); seasonMove(t, s.id, 'active', now); }
  return { season: s, added };
}
// The next season's name: the same name a year on ("Winter 2026" → "Winter 2027", "2026–27" → "2027–28").
export const nextSeasonName = name => String(name || '').replace(/(\d{4})(\s*[–-]\s*)(\d{2})\b/, (m, a, sep, b) => `${+a + 1}${sep}${String((+b + 1) % 100).padStart(2, '0')}`)
  .replace(/\b(\d{4})\b(?!\s*[–-]\s*\d)/, y => String(+y + 1));
// Take someone out of one season's squad. They stay in the seasons they played; a person who's in
// no other season is removed altogether (as before seasons). Returns 'season' or 'player'.
export function removeMember(t, sid, pid) {
  const s = findSeason(t, sid); if (!s) return '';
  s.squad = s.squad.filter(m => m.playerId !== pid);
  if (memberSeasons(t, pid).length) return 'season';
  t.players = arr(t.players).filter(p => p.id !== pid);
  return 'player';
}
// One season of a team as the app shows it: its squad (from its squad entries, so a past season keeps
// that season's numbers and positions), its records, the lineups made for its matches and the
// team's own saved lineups. A season that isn't active is read-only. With no season to show, nothing.
export function seasonLens(t, sid) {
  if (!seasonsOf(t).length) return t;
  const s = findSeason(t, sid);
  if (!s) return { ...t, players: [], sessions: [], matches: [], tasks: [], messages: [], notices: [], lineups: arr(t.lineups).filter(l => !l.seasonId), viewSeason: null, readOnly: true };
  const live = s.status === 'active', mine = x => x && (x.seasonId === s.id || (!x.seasonId && live));
  const members = new Map(s.squad.map(m => [m.playerId, m])), known = live ? inAnySeason(t) : null;
  const players = arr(t.players).filter(p => members.has(p.id) || (live && !known.has(p.id))).map(p => {
    if (live) return p;
    const m = members.get(p.id);
    return { ...p, number: m.number, positions: m.positions.slice(), status: m.status };
  });
  const out = { ...t, players, lineups: arr(t.lineups).filter(l => !l.seasonId || l.seasonId === s.id), viewSeason: s, readOnly: !live };
  SEASON_KINDS.forEach(k => { out[k] = arr(t[k]).filter(mine); });
  return out;
}
export const activeLens = t => seasonLens(t, (activeSeason(t) || {}).id);
// Each season's figures side by side, from what was recorded in it.
export function seasonStats(t, today) {
  return seasonsOf(t).map(s => {
    const L = seasonLens(t, s.id), sum = summary(L, '', '', today);
    const dates = SEASON_KINDS.slice(0, 3).flatMap(k => L[k].map(x => x.date)).filter(Boolean).sort();
    return { id: s.id, name: s.name, status: s.status, start: s.start || dates[0] || '', end: s.end || dates[dates.length - 1] || '', squad: L.players.length, ...sum };
  });
}

/* ---------- Competitions ---------- */
// A competition is an organised event, kept once in the coach's copy: a league, a tournament, a
// championship. A team takes part through an entry for one of its seasons (with an optional division
// or pool). A match can belong to an entry; one that doesn't is a friendly or simply not linked yet.
export const COMP_FORMATS = { league: 'League', knockout: 'Knockout tournament', roundrobin: 'Round-robin tournament', championship: 'Championship', carnival: 'Carnival or festival', other: 'Other' };
export const TOURNAMENT_FORMATS = ['knockout', 'roundrobin', 'championship', 'carnival'];
export const COMP_STATUS = { planned: 'Planned', active: 'Active', completed: 'Completed', archived: 'Archived' };
export const ENTRY_STATUS = { entered: 'Entered', withdrawn: 'Withdrawn' };
export const COMP_PUBLIC = ['id', 'name', 'sport', 'format', 'edition', 'start', 'end', 'organiser', 'venue', 'status', 'description'];
export function normComp(c) {
  const x = obj(c), out = { id: String(x.id || uid()) };
  COMP_PUBLIC.slice(1).forEach(k => { out[k] = String(x[k] == null ? '' : x[k]); });
  if (!COMP_FORMATS[out.format]) out.format = 'other';
  if (!COMP_STATUS[out.status]) out.status = 'planned';
  out.rules = String(x.rules || '');
  out.bylaws = arr(x.bylaws).filter(isObj).map((b, i) => ({ ...normBylaw(b), id: String(b.id || `b${i + 1}`) })).filter(b => b.text);
  out.entries = arr(x.entries).filter(e => isObj(e) && e.teamId).map(e => ({ id: String(e.id || uid()), teamId: String(e.teamId), seasonId: String(e.seasonId || ''),
    status: ENTRY_STATUS[e.status] ? e.status : 'entered', division: String(e.division || ''), pool: String(e.pool || '') }));
  return out;
}
export const compsOf = ws => arr(ws && ws.competitions);
export const findComp = (ws, id) => (id && compsOf(ws).find(c => c.id === id)) || null;
export function findEntry(ws, entryId) {
  for (const comp of compsOf(ws)) { const entry = comp.entries.find(e => e.id === entryId); if (entry) return { comp, entry }; }
  return null;
}
// A team's entries, for one season or all of them.
export const teamEntries = (ws, teamId, seasonId) => compsOf(ws).flatMap(comp => comp.entries.filter(e => e.teamId === teamId && (!seasonId || e.seasonId === seasonId)).map(entry => ({ comp, entry })));
const sameDiv = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
// Enter a team's season. The same team, season and division can only be entered once (entering again
// after withdrawing brings the entry back); a different division is a separate entry.
export function addEntry(ws, compId, teamId, seasonId, { division = '', pool = '' } = {}) {
  const comp = findComp(ws, compId), t = findTeam(ws, teamId);
  if (!comp) return { error: 'no-competition' };
  if (!t || !findSeason(t, seasonId)) return { error: 'no-season' };
  const same = comp.entries.find(e => e.teamId === teamId && e.seasonId === seasonId && sameDiv(e.division, division));
  if (same) { if (same.status === 'entered') return { error: 'duplicate', entry: same }; same.status = 'entered'; same.pool = pool; return { entry: same }; }
  const entry = { id: uid(), teamId, seasonId, status: 'entered', division: String(division).trim(), pool: String(pool).trim() };
  comp.entries.push(entry);
  return { entry };
}
// Withdrawing keeps the entry and its fixtures and results; removing is only for an entry with no
// matches (made by mistake).
export function withdrawEntry(ws, compId, entryId) { const e = (findComp(ws, compId) || { entries: [] }).entries.find(x => x.id === entryId); if (!e) return false; e.status = 'withdrawn'; return true; }
export function removeEntry(ws, compId, entryId) {
  const comp = findComp(ws, compId); if (!comp) return 'missing';
  if (teamsOf(ws).some(t => arr(t.matches).some(m => m.entryId === entryId))) return 'has-fixtures';
  comp.entries = comp.entries.filter(e => e.id !== entryId);
  return '';
}
// Link a match to an entry of its own team and season (or unlink it with '').
export function linkMatch(ws, t, m, entryId) {
  if (!entryId) { m.entryId = ''; m.compId = ''; return ''; }
  const f = findEntry(ws, entryId);
  if (!f || f.entry.teamId !== t.id) return 'wrong-team';
  if (m.seasonId && f.entry.seasonId !== m.seasonId) return 'wrong-season';
  m.entryId = entryId; m.compId = f.comp.id;
  if (TOURNAMENT_FORMATS.includes(f.comp.format) || t.team.eventCompId === f.comp.id) m.tournament = true;
  return '';
}
// What a match is: part of a competition (a tournament format counts as a tournament), a friendly,
// or not linked to anything (matches from before competitions).
export function matchKind(ws, m) {
  const f = m && m.entryId && findEntry(ws, m.entryId);
  if (f) return { kind: TOURNAMENT_FORMATS.includes(f.comp.format) ? 'tournament' : 'competition', comp: f.comp, entry: f.entry };
  return { kind: m && m.friendly ? 'friendly' : 'none', comp: null, entry: null };
}
// Every match in a competition, across its teams, with the team and entry it belongs to.
export function compMatches(ws, compId) {
  const comp = findComp(ws, compId); if (!comp) return [];
  const entries = new Map(comp.entries.map(e => [e.id, e]));
  return teamsOf(ws).flatMap(t => arr(t.matches).filter(m => entries.has(m.entryId)).map(m => ({ team: t, entry: entries.get(m.entryId), match: m })))
    .sort((a, b) => byWhen(a.match, b.match) || a.team.id.localeCompare(b.team.id));
}
// Matches of the team in the competition's dates that aren't linked to anything: offered to the coach
// to link, never linked on their own.
export function unlinkedInDates(ws, compId, teamId) {
  const comp = findComp(ws, compId), t = findTeam(ws, teamId);
  if (!comp || !t || !comp.start) return [];
  const to = comp.end || comp.start;
  return arr(t.matches).filter(m => !m.entryId && !m.friendly && m.date >= comp.start && m.date <= to).sort(byWhen);
}
// The team's tournament (team.event and its dates) becomes a competition when the copy is upgraded:
// one per distinct event, entered by each team with it, for that team's active season. Only matches
// already marked as tournament matches are linked to it.
function seedCompetitions(ws) {
  const comps = new Map();
  teamsOf(ws).forEach(t => {
    const T = obj(t.team);
    if (!T.event || !validDay(T.eventStart)) return;
    const end = validDay(T.eventEnd) ? T.eventEnd : T.eventStart;
    const key = `${T.event.trim().toLowerCase()}|${T.eventStart}|${end}`;
    if (!comps.has(key)) comps.set(key, normComp({ id: `c${T.eventStart.replace(/-/g, '')}${T.event.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)}`, name: T.event, format: 'other',
      edition: T.eventStart.slice(0, 4), start: T.eventStart, end, venue: T.venue || '', sport: '', status: 'planned', entries: [] }));
    const comp = comps.get(key), s = activeSeason(t);
    if (!s) return;
    const entry = { id: `${t.id}-${s.id}`, teamId: t.id, seasonId: s.id, status: 'entered', division: T.division || '', pool: '' };
    comp.entries.push(entry);
    T.eventCompId = comp.id;
    arr(t.matches).forEach(m => { if (m.tournament && !m.entryId && (!m.seasonId || m.seasonId === s.id)) { m.entryId = entry.id; m.compId = comp.id; } });
  });
  return [...comps.values()];
}
// Entries for teams or seasons that no longer exist are dropped; a match whose entry is gone is
// unlinked (it keeps everything else).
export function repairCompetitions(ws) {
  const teams = new Map(teamsOf(ws).map(t => [t.id, t]));
  compsOf(ws).forEach(c => { c.entries = c.entries.filter(e => { const t = teams.get(e.teamId); return t && findSeason(t, e.seasonId); }); });
  const entries = new Map(compsOf(ws).flatMap(c => c.entries.map(e => [e.id, c.id])));
  teamsOf(ws).forEach(t => arr(t.matches).forEach(m => {
    if (m.entryId && !entries.has(m.entryId)) { m.entryId = ''; m.compId = ''; }
    else if (m.entryId) m.compId = entries.get(m.entryId);
  }));
  teamsOf(ws).forEach(t => { if (t.team && t.team.eventCompId && !findComp(ws, t.team.eventCompId)) t.team.eventCompId = ''; });
}
// A team's tournament settings follow the competition they were made into.
export function syncEvents(ws) {
  teamsOf(ws).forEach(t => {
    const c = t.team && findComp(ws, t.team.eventCompId); if (!c) return;
    Object.assign(t.team, { event: c.name, eventStart: c.start, eventEnd: c.end, venue: c.venue || t.team.venue || '' });
  });
}
// What a team's players see of its competitions this season.
export function compsForPlayers(ws, t) {
  const s = activeSeason(t); if (!s) return [];
  return teamEntries(ws, t.id, s.id).map(({ comp, entry }) => ({ ...Object.fromEntries(COMP_PUBLIC.map(k => [k, comp[k]])), entryId: entry.id, division: entry.division, pool: entry.pool,
    entryStatus: entry.status, bylaws: comp.bylaws.map(b => ({ topic: b.topic, text: b.text })) }));
}

/* ---------- Jerseys ---------- */
// Giving a player a number means they have their jersey. Each jersey handed out is kept on the player
// as a loan: its number, the season, the day it went out and the day it came back. Where jerseys are
// lent (team.jerseyLoan) the coach marks them returned. Loans stay with the person, so a player who
// leaves while still holding a jersey still shows up.
export const normLoan = j => ({ id: String(j.id || uid()), number: String(j.number || ''), seasonId: String(j.seasonId || ''), out: String(j.out || ''), back: String(j.back || '') });
export const openLoans = p => arr(p && p.jerseys).filter(j => !j.back);
// An explicit correction is a tombstone for the automatic issue rule. It is kept with the
// player so saving or syncing on another device cannot resurrect a deleted, mistaken issue.
const correctionKey = (sid, number) => JSON.stringify([String(sid || ''), String(number || '').trim()]);
export const correctedJersey = (p, sid, number) => arr(p && p.jerseyCorrections).includes(correctionKey(sid, number));
export function issueJersey(p, number, sid, today) {
  const num = String(number || '').trim(); if (!num || !sid) return false;
  p.jerseys = arr(p.jerseys);
  p.jerseyCorrections = arr(p.jerseyCorrections).filter(k => k !== correctionKey(sid, num));
  if (p.jerseys.some(j => j.number === num && !j.back)) return false;
  p.jerseys.push({ id: uid(), number: num, seasonId: sid, out: today, back: '' });
  return true;
}
// Anyone in the active season with a number has that jersey, unless they still have it from before or
// already handed this season's back.
export function syncJerseys(t, today) {
  const s = activeSeason(t); if (!s) return 0;
  let n = 0;
  seasonLens(t, s.id).players.forEach(p => {
    const num = String(p.number || '').trim(); if (!num) return;
    if (!Array.isArray(p.jerseys)) p.jerseys = [];
    if (correctedJersey(p, s.id, num)) return;  // explicitly removed as a mistake
    if (p.jerseys.some(j => j.number === num && (!j.back || j.seasonId === s.id))) return;   // has it, or handed this season's back
    if (issueJersey(p, num, s.id, today)) n++;
  });
  return n;
}
// From before jerseys were tracked: a player in the active season with a number has their jersey (the
// day isn't known). Always the same, so two phones upgrading agree.
function ensureJerseys(t) {
  const s = activeSeason(t), live = s ? new Set(seasonLens(t, s.id).players.map(p => p.id)) : new Set();
  arr(t.players).forEach(p => {
    if (!isObj(p)) return;
    if (Array.isArray(p.jerseyCorrections)) p.jerseyCorrections = [...new Set(p.jerseyCorrections.filter(x => typeof x === 'string'))];
    if (Array.isArray(p.jerseys)) { p.jerseys = p.jerseys.filter(isObj).map(normLoan); return; }
    const num = String(p.number || '').trim();
    p.jerseys = num && live.has(p.id) ? [{ id: `j-${p.id}`, number: num, seasonId: s.id, out: '', back: '' }] : [];
  });
}
const loanOf = (p, id) => arr(p && p.jerseys).find(j => j.id === id);
export function returnJersey(p, id, today) { const j = loanOf(p, id); if (!j || j.back) return false; j.back = today; return true; }
export function undoReturn(p, id) { const j = loanOf(p, id); if (!j || !j.back) return false; j.back = ''; return true; }
export function removeLoan(p, id) {
  const loan = loanOf(p, id); if (!loan) return false;
  const key = correctionKey(loan.seasonId, loan.number);
  p.jerseys = arr(p.jerseys).filter(j => j.id !== id);
  p.jerseyCorrections = [...new Set([...arr(p.jerseyCorrections), key])];
  return true;
}
// Historical activity is scoped to the issue's origin season; an issue from a future
// season must never change an earlier season's return status.
export function jerseyReport(t, sid) {
  const L = seasonLens(t, sid), squad = new Map(L.players.map(p => [p.id, p]));
  const rows = arr(t.players).filter(p => squad.has(p.id) || arr(p.jerseys).some(j => j.seasonId === sid)).map(p => {
    const season = arr(p.jerseys).filter(j => j.seasonId === sid), open = season.filter(j => !j.back), sp = squad.get(p.id);
    return { id: p.id, name: p.name, inSquad: !!sp, number: sp ? sp.number : '', season, open,
      status: open.length ? 'out' : season.some(j => j.back) ? 'returned' : 'none' };
  }).sort((a, b) => ['out', 'returned', 'none'].indexOf(a.status) - ['out', 'returned', 'none'].indexOf(b.status) || a.name.localeCompare(b.name));
  return { rows, out: rows.filter(r => r.status === 'out').length, returned: rows.filter(r => r.status === 'returned').length,
    none: rows.filter(r => r.status === 'none').length, gone: rows.filter(r => !r.inSquad && r.status === 'out').length };
}
// Equipment still outstanding now, including jerseys issued in older seasons and
// held by people who no longer belong to the current squad.
export function jerseyInventory(t) {
  const active = activeSeason(t), ids = new Set(active ? seasonLens(t, active.id).players.map(p => p.id) : []);
  const rows = arr(t.players).map(p => ({ id: p.id, name: p.name, inSquad: ids.has(p.id), open: openLoans(p) }))
    .filter(p => p.open.length).sort((a,b) => a.name.localeCompare(b.name));
  return { rows, outstanding: rows.reduce((n,p) => n + p.open.length,0), formerPlayers: rows.filter(p => !p.inSquad).length };
}

/* ---------- Clubs ---------- */
// A club holds what's shared by its teams: who it is, how to reach it, where it plays, its links and
// its officials. A team names its club (team.clubId) and keeps its own division, category, season and
// staff. The club's public details go into each of its teams' players' copies; officials' phone
// numbers and email addresses stay in the coach's copy.
export const CLUB_PUBLIC = ['id', 'name', 'shortName', 'sport', 'governingBody', 'founded', 'website', 'email', 'phone', 'postal', 'facebook', 'instagram', 'colours', 'homeGround', 'homeAddress', 'nights', 'registration', 'conduct', 'juniorBrand', 'logo'];
// A club's logo is a small picture kept with the club (the app shrinks it to a 160 px badge): PNG, JPEG
// or WebP as a data URL, nothing else, and nothing big.
export const LOGO_MAX = 120000;
export const validImage = (v, max) => typeof v === 'string' && v.length <= max && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v);
export const validLogo = v => validImage(v, LOGO_MAX);
// A player's photo, kept in the coach's copy only (never in the players' file).
export const PHOTO_MAX = 80000;
export const validPhoto = v => validImage(v, PHOTO_MAX);
export const CLUB_ROLES = ['President', 'Vice-president', 'Secretary', 'Treasurer', 'Registrar', 'Representative coordinator', 'Member protection officer', 'Referee coordinator', 'Other'];
export const TEAM_ROLES = ['Head coach', 'Assistant coach', 'Team manager', 'Trainer', 'First aid', 'Other'];
export const TEAM_CATEGORIES = { mixed: 'Mixed', men: 'Men', women: 'Women', boys: 'Boys', girls: 'Girls', open: 'Open (any)' };
export function normClub(c) {
  const out = { ...obj(c) };
  if (!out.id || typeof out.id !== 'string') out.id = uid();
  CLUB_PUBLIC.forEach(k => { if (k !== 'id' && typeof out[k] !== 'string') out[k] = out[k] == null ? '' : String(out[k]); });
  if (!out.sport) out.sport = 'Oztag';
  if (!validLogo(out.logo)) out.logo = '';
  out.officials = arr(out.officials).filter(isObj).map(o => ({ role: String(o.role || 'Other'), name: String(o.name || ''), phone: String(o.phone || ''), email: String(o.email || '') }));
  out.notes = String(out.notes || '');
  return out;
}
// The team this app was made for belongs to St George Oztag. When an earlier copy (with no clubs yet)
// is upgraded, that club is added once, with its published details, and a DragonTag team is put in it.
export const ST_GEORGE = {
  id: 'stgeorge', name: 'St George Oztag', shortName: 'St George', sport: 'Oztag', governingBody: 'Australian Oztag',
  founded: '1992', juniorBrand: 'DragonTag (juniors, since 2001)', website: 'https://www.nswoztag.au/',
  email: 'stgeorgeoztag@oztag.com', phone: '0421 065 242', postal: 'PO Box 399, Padstow NSW 2211',
  facebook: 'https://www.facebook.com/stgeorge.oztag', instagram: 'https://www.instagram.com/stgeorgeoztag',
  notes: 'Home of the first Oztag competition (1992). Details from the club’s website; check the venue, nights and officials.'
};
function seedClubs(ws) {
  const club = normClub(ST_GEORGE);
  teamsOf(ws).forEach(t => { if (t.team && !t.team.clubId && /dragon\s*tag/i.test(t.team.name || '')) t.team.clubId = club.id; });
  return [club];
}
export const clubOf = (ws, t) => (t && t.team && t.team.clubId && arr(ws && ws.clubs).find(c => c.id === t.team.clubId)) || null;
export const clubTeams = (ws, id) => teamsOf(ws).filter(t => t.team && t.team.clubId === id);
// What a team's players see of its club: no officials, no notes.
export const clubForPlayers = c => c ? Object.fromEntries(CLUB_PUBLIC.filter(k => c[k]).map(k => [k, c[k]])) : null;
export function removeClub(ws, id) {
  clubTeams(ws, id).forEach(t => { t.team.clubId = ''; });
  ws.clubs = arr(ws.clubs).filter(c => c.id !== id);
}

/* ---------- rule sets ---------- */
// The official rules (site/rules.js) are the owner's: a team picks a rule set ('oztag/mixed') and adds
// its competition's by-laws (team.bylaws), which are the coach's own and never touched by an update.
// team.rulesSeen is the last rule pack the coach reviewed for that team.
// The sports the app knows. Rule sets exist for Oztag, rugby league and league tag; every sport has
// positions for the player form (a team can keep its own list instead, in Settings).
export const SPORTS = ['Oztag', 'Touch football', 'League tag', 'Rugby league', 'Rugby union', 'Rugby sevens', 'Tag rugby', 'AFL', 'Netball', 'Football (soccer)', 'Basketball', 'Hockey', 'Cricket', 'Other'];
const LEAGUE_POS = ['Fullback', 'Wing', 'Centre', 'Five-eighth', 'Halfback', 'Hooker', 'Prop', 'Second row', 'Lock'];
export const SPORT_POSITIONS = {
  'Oztag': ['Wing', 'Link', 'Rover', 'Middle'], 'Touch football': ['Wing', 'Link', 'Middle'], 'League tag': LEAGUE_POS, 'Rugby league': LEAGUE_POS,
  'Rugby union': ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8', 'Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback'],
  'Rugby sevens': ['Prop', 'Hooker', 'Scrum-half', 'Fly-half', 'Centre', 'Wing'], 'Tag rugby': ['Middle', 'Link', 'Wing'],
  'AFL': ['Back', 'Half-back', 'Midfield', 'Ruck', 'Wing', 'Half-forward', 'Forward'], 'Netball': ['GS', 'GA', 'WA', 'C', 'WD', 'GD', 'GK'],
  'Football (soccer)': ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], 'Basketball': ['Point guard', 'Shooting guard', 'Small forward', 'Power forward', 'Centre'],
  'Hockey': ['Goalkeeper', 'Defender', 'Midfielder', 'Forward'], 'Cricket': ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper'], 'Other': []
};
// The rule sets' sports, from a sport's name ('' for sports without one).
const SPORT_OF = [[/league\s*tag/i, 'league-tag'], [/rugby\s*league|^\s*league\s*$/i, 'league'], [/oz\s*tag/i, 'oztag']];
export const sportOf = name => (SPORT_OF.find(([re]) => re.test(name || '')) || [, ''])[1];
// A team plays its own sport if it has one set, otherwise its club's.
export const teamSport = (team, club) => (team && team.sport) || (club && club.sport) || 'Oztag';
const sameList = (a, b) => arr(a).join('|') === arr(b).join('|');
const isKnownDefault = positions => Object.values(SPORT_POSITIONS).some(p => p.length && sameList(positions, p));
// A known default inherited from another sport is not an intentional custom list.
// Explicit customisation, including an empty custom list, always wins.
export function positionsFor(team, club) {
  const t = obj(team), saved = arr(t.positions), defaults = SPORT_POSITIONS[teamSport(t, club)] || [];
  if (t.positionsCustom === true) return saved;
  if (t.positionsCustom === false || !saved.length || isKnownDefault(saved)) return defaults.slice();
  return saved;
}
// Resolve defaults BEFORE mutating the club/sport. A coach-edited list survives
// a switch; a recognised prior sport default follows the new sport.
export function changedSportPositions(oldTeam, oldClub, newTeam, newClub, entered) {
  const previous = teamSport(oldTeam, oldClub), next = teamSport(newTeam, newClub);
  const prevDefaults = SPORT_POSITIONS[previous] || [], nextDefaults = SPORT_POSITIONS[next] || [];
  const value = arr(entered).map(String);
  if (sameList(value, nextDefaults)) return { positions: nextDefaults.slice(), positionsCustom: false };
  const wasDefault = oldTeam.positionsCustom !== true && (sameList(value, prevDefaults) ||
    (oldTeam.positionsCustom === false && sameList(value, positionsFor(oldTeam, oldClub))));
  if (previous !== next && wasDefault) return { positions: nextDefaults.slice(), positionsCustom: false };
  return { positions: value, positionsCustom: true };
}
// Deterministically distinguish recognised legacy defaults from genuine custom
// lists. Preserve legacy edits even when the team is moved to a new club.
function fixDefaultPositions(ws) {
  teamsOf(ws).forEach(t => {
    const T = t.team || {}, club = clubOf(ws, t);
    if (T.positionsCustom === true) return;
    if (T.positionsCustom === false || !arr(T.positions).length || isKnownDefault(T.positions)) {
      T.positions = (SPORT_POSITIONS[teamSport(T, club)] || []).slice();
      T.positionsCustom = false;
    } else T.positionsCustom = true;
  });
}
// Called on every save as well as migration: changing a club's sport updates
// inherited team defaults before the players' encrypted projection is produced.
export const syncSportPositions = ws => fixDefaultPositions(ws);
export function ruleSetList(R = RULES) {
  return Object.entries(R.sports).flatMap(([sid, s]) => s.grades.map(g => ({ id: `${sid}/${g.id}`, sport: sid, sportName: s.name, name: g.name })));
}
// A rule set: the sport's base rules with the grade's own in place of any with the same id.
export function ruleSet(id, R = RULES) {
  const [sid, gid] = String(id || '').split('/'), s = R.sports[sid], g = s && s.grades.find(x => x.id === gid);
  if (!g) return null;
  const own = new Map(arr(g.rules).map(r => [r.id, r]));
  const rules = s.rules.map(r => own.get(r.id) || r);
  arr(g.rules).forEach(r => { if (!s.rules.some(b => b.id === r.id)) rules.push(r); });
  const topics = [...new Set(rules.map(r => r.topic))];
  rules.sort((a, b) => topics.indexOf(a.topic) - topics.indexOf(b.topic));
  const sourceId = g.source || s.source;
  return { id: `${sid}/${gid}`, sport: sid, sportName: s.name, grade: gid, name: g.name, note: g.note || '',
    values: { ...s.values, ...obj(g.values) }, rules, sourceId, source: R.sources[sourceId] || null };
}
// Which rule set a team uses: its choice, or one from its club's sport and its category.
export function defaultRuleSet(team, club, R = RULES) {
  const t = obj(team), named = t.sport || (club && club.sport) || '', sport = named ? sportOf(named) : 'oztag';
  if (!sport) return '';   // a sport without a rule set in the app
  const grades = R.sports[sport].grades.map(g => g.id);
  const cat = t.category || 'mixed', age = String(t.ageGroup || '').toLowerCase().replace(/\s|under/g, m => m === 'under' ? 'u' : '');
  const want = sport === 'oztag' ? ({ boys: 'juniors', girls: 'juniors', open: 'men' }[cat] || cat)
    : grades.find(g => age && (g === age || g.replace('-', '') === age.replace(/^u/, ''))) || ({ women: 'women', girls: 'women' }[cat] || 'men');
  return `${sport}/${grades.includes(want) ? want : grades[0]}`;
}
export const ruleSetId = (team, club, R = RULES) => (team && team.rules && ruleSet(team.rules, R) ? team.rules : defaultRuleSet(team, club, R));
export const teamRules = (team, club, R = RULES) => ruleSet(ruleSetId(team, club, R), R);
// Most males on field: the team's own number (a by-law) if it has one, otherwise the rule set's.
export function maxMalesOf(team, club, R = RULES) {
  const own = team && team.maxMales;
  if (own !== '' && own != null && Number.isFinite(Number(own))) return Number(own);
  const v = (teamRules(team, club, R) || {}).values || {};
  return Number.isFinite(Number(v.maxMales)) ? Number(v.maxMales) : 4;
}
export const normBylaw = b => ({ id: String(b.id || ''), topic: String(b.topic || 'Other'), text: String(b.text || '').trim(), replaces: String(b.replaces || '') });
// Rule packs the team hasn't reviewed that touch its sport, newest first.
export const rulesNew = (team, sport, R = RULES) => R.changes.filter(c => c.pack > (Number(team && team.rulesSeen) || 0) && (!c.sports || c.sports.includes(sport))).sort((a, b) => b.pack - a.pack);
// What a rule update asks the coach to look at: anything (a play, a game system) that relies on a rule
// that changed, and the team's by-laws that replace one.
export function ruleReview(changes, items, bylaws = []) {
  const ids = [...new Set(changes.flatMap(c => arr(c.rules)))];
  return {
    ids,
    items: items.map(it => ({ ...it, hit: arr(it.rules).filter(r => ids.includes(r)) })).filter(it => it.hit.length),
    bylaws: arr(bylaws).filter(b => b.replaces && ids.includes(b.replaces))
  };
}
// Rule books the watch has seen change since the rules were last checked against them.
export function sourceAlerts(watch, R = RULES) {
  const w = obj(watch && watch.sources);
  return Object.entries(R.sources).filter(([k, s]) => w[k] && w[k].changedAt && w[k].changedAt.slice(0, 10) > s.checked)
    .map(([k, s]) => ({ id: k, title: s.title, changedAt: w[k].changedAt }));
}

// One team as a single-team copy in the earlier format, for rolling back to the previous app version.
export function legacyTeam(ws, id) {
  const t = findTeam(ws, id); if (!t) return null;
  const out = clone(stripWs(t));
  delete out.archived; out.version = 2;
  return out;
}
export function addTeam(ws, team) {
  ws.teams = arr(ws.teams);
  if (!team.id || findTeam(ws, team.id)) team.id = uid();
  ensureSeasons(team);
  ws.teams.push(team);
  return team;
}
// Archive or restore a team. At least one team always stays active.
export function setArchived(ws, id, archived) {
  const t = findTeam(ws, id); if (!t) return false;
  if (archived && !activeTeams(ws).some(x => x !== t)) return false;
  t.archived = !!archived;
  return true;
}

/* ---------- Keeping links consistent ---------- */
// Take out anything that points at a record that no longer exists: people on tasks who have left,
// riders in a car whose driver is off the task, tasks linked to a deleted session or match, lineup
// places held by removed players. Returns what was fixed.
export function repairTeam(t) {
  const fixes = [];
  const ids = k => new Set(arr(t[k]).map(x => x && x.id));
  const players = ids('players'), helpers = ids('helpers'), sessions = ids('sessions'), matches = ids('matches'), lineups = ids('lineups');
  const known = who => { const [k, id] = String(who || '').split(':'); return k === 'p' ? players.has(id) : k === 'h' ? helpers.has(id) : false; };
  arr(t.tasks).forEach(task => {
    const people = arr(task.people);
    task.people = people.filter(p => p && known(p.who));
    if (task.people.length !== people.length) fixes.push({ what: 'task-person', id: task.id, n: people.length - task.people.length });
    const drivers = new Set(task.people.filter(p => p.role === 'driver').map(p => p.who));
    task.people.forEach(p => { if (p.car && !drivers.has(p.car)) { p.car = ''; fixes.push({ what: 'car', id: task.id }); } });
    if (task.sessionId && !sessions.has(task.sessionId)) { task.sessionId = ''; fixes.push({ what: 'task-session', id: task.id }); }
    if (task.matchId && !matches.has(task.matchId)) { task.matchId = ''; fixes.push({ what: 'task-match', id: task.id }); }
  });
  arr(t.lineups).forEach(l => arr(l && l.slots).forEach(s => { if (s.playerId && !players.has(s.playerId)) { s.playerId = null; fixes.push({ what: 'slot', id: l.id }); } }));
  arr(t.helpers).forEach(h => { if (h.playerId && !players.has(h.playerId)) { h.playerId = ''; fixes.push({ what: 'helper-player', id: h.id }); } });
  arr(t.matches).forEach(m => { if (m.lineupId && !lineups.has(m.lineupId)) { m.lineupId = ''; fixes.push({ what: 'match-lineup', id: m.id }); } });
  arr(t.seasons).forEach(se => { const n = arr(se.squad).length; se.squad = arr(se.squad).filter(m => m && players.has(m.playerId)); if (se.squad.length !== n) fixes.push({ what: 'season-member', id: se.id, n: n - se.squad.length }); });
  return fixes;
}

/* ---------- Starting over ---------- */
export const RESET_PARTS = {
  squad: 'Players, and their places in lineups, roll calls and RSVPs',
  training: 'Training sessions, roll calls and RSVPs',
  matches: 'Matches, availability and results',
  tasks: 'Volunteer tasks and lifts',
  helpers: 'Helpers',
  lineups: 'Saved lineups (back to one empty starting 8)',
  notices: 'Noticeboard',
  messages: 'Message log'
};
// Clear the chosen parts of a team and everything that pointed at them. Team settings, plays, game
// systems, player lists and passwords are never touched. `freshLineups` makes the replacement lineups.
export function resetTeam(t, parts, freshLineups = () => []) {
  const P = new Set(arr(parts).filter(k => RESET_PARTS[k]));
  const n = {};
  const count = k => arr(t[k]).length;
  if (P.has('squad')) {
    n.squad = count('players'); t.players = [];
    arr(t.lineups).forEach(l => arr(l.slots).forEach(s => { s.playerId = null; }));
    arr(t.sessions).forEach(s => { s.attendance = {}; s.rsvp = {}; });
    arr(t.matches).forEach(m => { m.rsvp = {}; });
  }
  if (P.has('training')) { n.training = count('sessions'); t.sessions = []; }
  if (P.has('matches')) { n.matches = count('matches'); t.matches = []; }
  if (P.has('tasks')) { n.tasks = count('tasks'); t.tasks = []; }
  if (P.has('helpers')) { n.helpers = count('helpers'); t.helpers = []; }
  if (P.has('lineups')) { n.lineups = count('lineups'); t.lineups = freshLineups(); }
  if (P.has('notices')) { n.notices = count('notices'); t.notices = []; }
  if (P.has('messages')) { n.messages = count('messages'); t.messages = []; }
  repairTeam(t);
  return n;
}

/* ---------- Tasks linked to a training session or a match ---------- */
const LINK = { session: 'sessionId', match: 'matchId' };
export const linkedTasks = (t, kind, id) => id ? arr(t.tasks).filter(x => x[LINK[kind]] === id) : [];
const WHEN_KEYS = ['date', 'start', 'end', 'place'];
export const whenChanged = (a, b) => WHEN_KEYS.some(k => (a[k] || '') !== (b[k] || ''));
// The session or match moved: its tasks go with it, to the new day, and to the new times and place
// wherever they had the old ones (a BBQ that starts before the game keeps its own start time).
export function followEvent(t, kind, id, from, to) {
  const ts = linkedTasks(t, kind, id);
  ts.forEach(x => {
    x.date = to.date;
    ['start', 'end', 'place'].forEach(k => { if ((x[k] || '') === (from[k] || '')) x[k] = to[k] || ''; });
  });
  return ts.length;
}
// Keep the tasks where they are, no longer tied to the session or match.
export function detachTasks(t, kind, id) {
  const ts = linkedTasks(t, kind, id);
  ts.forEach(x => { x[LINK[kind]] = ''; });
  return ts.length;
}
export function cancelTasks(t, kind, id) {
  const ts = linkedTasks(t, kind, id).filter(x => !x.cancelled);
  ts.forEach(x => { x.cancelled = true; x.cancelledWith = `${kind}:${id}`; });
  return ts.length;
}
// Bring back the tasks that were cancelled along with the session or match.
export function reinstateTasks(t, kind, id) {
  const ts = arr(t.tasks).filter(x => x.cancelledWith === `${kind}:${id}`);
  ts.forEach(x => { x.cancelled = false; delete x.cancelledWith; });
  return ts.length;
}
export function removeTasks(t, kind, id) {
  const gone = new Set(linkedTasks(t, kind, id).map(x => x.id));
  t.tasks = arr(t.tasks).filter(x => !gone.has(x.id));
  return gone.size;
}

/* ---------- Volunteer replies ---------- */
// The four replies, kept apart: invited (asked, no answer yet), accepted, declined, and done.
export const TASK_STATES = { asked: 'Invited', yes: 'Accepted', no: 'Declined', done: 'Done' };
// How a task's spots stand. Only accepted and done count as confirmed; an invitation with no answer
// is shown separately and never fills a spot.
export function coverage(task) {
  const need = task.kind === 'lift' ? 0 : Math.max(1, Number(task.need) || 1);
  let done = 0, accepted = 0, invited = 0, declined = 0;
  if (Array.isArray(task.people)) {
    task.people.filter(p => p.role !== 'rider').forEach(p => {
      if (p.status === 'done') done++; else if (p.status === 'yes') accepted++; else if (p.status === 'no') declined++; else invited++;
    });
  } else {
    // The players' copy has no names, only each spot's state ('taken' is from before replies were split).
    arr(task.spots).forEach(s => { if (s === 'done') done++; else if (s === 'invited') invited++; else accepted++; });
  }
  const confirmed = done + accepted;
  return { need, done, accepted, invited, declined, confirmed,
    short: Math.max(0, need - confirmed), toFind: Math.max(0, need - confirmed - invited),
    complete: need > 0 && done >= need, cancelled: !!task.cancelled };
}
// One mark per spot, in order: done, confirmed, invited, open.
export function spotsOf(c) {
  const filled = [...Array(c.done).fill('done'), ...Array(c.accepted).fill('confirmed'), ...Array(c.invited).fill('invited')];
  return [...filled, ...Array(Math.max(0, c.need - filled.length)).fill('open')];
}
// Set someone's reply. A driver who can't go takes their riders out of the car.
export function setReply(task, who, status) {
  const p = arr(task.people).find(x => x.who === who);
  if (!p || !TASK_STATES[status]) return false;
  p.status = status; p.at = new Date().toISOString(); p.via = 'coach';
  if (p.role === 'driver' && status === 'no') arr(task.people).forEach(r => { if (r.car === who) r.car = ''; });
  return true;
}

/* ---------- Lifts ---------- */
// The cars on a lift. Seats only count as confirmed when the driver has accepted; a rider in a car
// whose driver hasn't answered yet is "tentative", and one without a car is waiting.
export function liftPlan(task) {
  if (!Array.isArray(task.people)) {
    const L = obj(task.lift);
    const cars = arr(L.cars).map(c => ({ who: '', seats: Number(c.seats) || 0, taken: Number(c.taken) || 0, done: !!c.done, confirmed: c.confirmed !== false,
      free: Math.max(0, (Number(c.seats) || 0) - (Number(c.taken) || 0)), over: Math.max(0, (Number(c.taken) || 0) - (Number(c.seats) || 0)), riders: [] }));
    const tentative = Number(L.tentative) || 0, waiting = Number(L.waiting) || 0, riders = Number(L.riders) || 0;
    return { cars, riders, seated: Math.max(0, riders - waiting - tentative), tentative, waiting, over: cars.reduce((n, c) => n + c.over, 0),
      confirmedSeats: cars.filter(c => c.confirmed).reduce((n, c) => n + c.seats, 0), possibleSeats: cars.reduce((n, c) => n + c.seats, 0), list: [] };
  }
  const drivers = task.people.filter(p => p.role === 'driver' && p.status !== 'no');
  const riders = task.people.filter(p => p.role !== 'driver' && p.status !== 'no');
  const cars = drivers.map(d => {
    const inCar = riders.filter(r => r.car === d.who), seats = Number(d.seats) || 0;
    return { who: d.who, status: d.status, confirmed: d.status === 'yes' || d.status === 'done', done: d.status === 'done', seats,
      taken: inCar.length, free: Math.max(0, seats - inCar.length), over: Math.max(0, inCar.length - seats), riders: inCar.map(r => r.who) };
  });
  const carOf = r => cars.find(c => c.who === r.car);
  const seated = riders.filter(r => carOf(r) && carOf(r).confirmed).length;
  const tentative = riders.filter(r => carOf(r) && !carOf(r).confirmed).length;
  return { cars, riders: riders.length, seated, tentative, waiting: riders.length - seated - tentative, over: cars.reduce((n, c) => n + c.over, 0),
    confirmedSeats: cars.filter(c => c.confirmed).reduce((n, c) => n + c.seats, 0), possibleSeats: cars.reduce((n, c) => n + c.seats, 0), list: riders };
}
export const liftShort = L => L.waiting > 0 || L.tentative > 0 || (L.riders > 0 && !L.cars.some(c => c.confirmed));
// Can this rider go in this car without going over its seats?
export function canSeat(task, driver, rider) {
  const c = liftPlan(task).cars.find(x => x.who === driver);
  if (!c) return false;
  return c.riders.includes(rider) || c.free > 0;
}
// Give everyone without a seat one in a confirmed car with room. Never goes over a car's seats.
export function fillSeats(task) {
  const L = liftPlan(task);
  const free = L.cars.filter(c => c.confirmed).map(c => ({ who: c.who, n: c.free }));
  let moved = 0;
  const hasCar = r => L.cars.some(c => c.who === r.car);
  // Riders with no car at all go first; then anyone waiting on a driver who hasn't answered.
  L.list.filter(r => !L.cars.some(c => c.who === r.car && c.confirmed)).sort((a, b) => hasCar(a) - hasCar(b)).forEach(r => {
    const c = free.find(x => x.n > 0);
    if (c) { r.car = c.who; c.n--; moved++; }
  });
  return moved;
}

/* ---------- RSVPs and availability ---------- */
// What someone said they'd do (planned), kept apart from the roll call (what happened).
export const RSVP = { yes: 'Attending', no: 'Not attending', maybe: 'Unsure' };
export function rsvpOf(rec, pid) {
  const e = obj(rec && rec.rsvp)[pid];
  const v = typeof e === 'string' ? e : e && e.v;
  return RSVP[v] ? v : '';
}
export function setRsvp(rec, pid, v, at = new Date().toISOString()) {
  rec.rsvp = { ...obj(rec.rsvp) };
  if (RSVP[v]) rec.rsvp[pid] = { v, at, via: 'coach' }; else delete rec.rsvp[pid];
}
export function rsvpCounts(rec, players) {
  const c = { yes: 0, no: 0, maybe: 0, none: 0 };
  arr(players).forEach(p => { c[rsvpOf(rec, p.id) || 'none']++; });
  return c;
}
const asking = rec => Object.keys(obj(rec && rec.rsvp)).length > 0;

/* ---------- Matches ---------- */
export const MATCH_STATUS = { scheduled: 'Scheduled', played: 'Played', forfeit: 'Forfeit', postponed: 'Postponed', cancelled: 'Cancelled' };
const num = v => v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
// Win, loss or draw from the recorded score; null when there's no result to go on.
export function matchOutcome(m) {
  if (!m) return null;
  const r = obj(m.result);
  if (m.status === 'forfeit') return r.forfeit === 'us' ? 'loss' : r.forfeit === 'them' ? 'win' : null;
  if (m.status !== 'played') return null;
  const us = num(r.us), them = num(r.them);
  if (us === null || them === null) return null;
  return us > them ? 'win' : us < them ? 'loss' : 'draw';
}
// Is a result still to be entered? Played with no score, or the day has passed and it's still scheduled.
export const awaitingResult = (m, today) => (m.status === 'played' && !matchOutcome(m)) || (m.status === 'forfeit' && !matchOutcome(m)) || (m.status === 'scheduled' && m.date < today);
export function teamRecord(matches, today) {
  const rec = { matches: 0, withResult: 0, awaiting: 0, upcoming: 0, offField: 0, won: 0, lost: 0, drawn: 0, forfeits: 0, scored: 0, conceded: 0, scoredGames: 0 };
  arr(matches).forEach(m => {
    rec.matches++;
    if (m.status === 'cancelled' || m.status === 'postponed') { rec.offField++; return; }
    const o = matchOutcome(m);
    if (!o) { if (awaitingResult(m, today)) rec.awaiting++; else rec.upcoming++; return; }
    rec.withResult++;
    rec[o === 'win' ? 'won' : o === 'loss' ? 'lost' : 'drawn']++;
    if (m.status === 'forfeit') { rec.forfeits++; return; }
    rec.scored += num(m.result.us); rec.conceded += num(m.result.them); rec.scoredGames++;
  });
  rec.diff = rec.scored - rec.conceded;
  return rec;
}
// Is a lineup fit to send out? Empty positions, too many males, unavailable or injured players and
// anyone who said they can't play are problems; unsure and no reply are listed as things to check.
export function lineupCheck(t, lu, rec) {
  const players = new Map(arr(t.players).map(p => [p.id, p]));
  const slots = arr(lu && lu.slots);
  const on = slots.map(s => players.get(s.playerId)).filter(Boolean);
  const max = maxMalesOf(t.team);
  const males = on.filter(p => p.gender === 'M').length, females = on.filter(p => p.gender === 'F').length;
  const out = on.filter(p => p.status && p.status !== 'available');
  const said = v => rec ? on.filter(p => rsvpOf(rec, p.id) === v) : [];
  const declined = said('no'), unsure = said('maybe'), noReply = rec ? on.filter(p => !rsvpOf(rec, p.id)) : [];
  const issues = [];
  if (on.length < slots.length) issues.push(`${slots.length - on.length} position${slots.length - on.length === 1 ? '' : 's'} empty`);
  const mixed = !t.team || !t.team.category || t.team.category === 'mixed';
  if (mixed && males > max) issues.push(`${males} males on field (max ${max})`);
  if (on.length - males - females) issues.push(`${on.length - males - females} on field without a gender set`);
  out.forEach(p => issues.push(`${p.name} is marked ${p.status}`));
  declined.forEach(p => issues.push(`${p.name} said they can’t play`));
  const checks = [...unsure.map(p => `${p.name} is unsure`), ...noReply.map(p => `${p.name} hasn’t replied`)];
  return { onField: on.length, slots: slots.length, males, females, maxMales: max, out, declined, unsure, noReply, issues, checks, ready: !issues.length };
}
// The tournament: matches in the event dates (or marked as tournament matches), day by day.
export function tournamentDays(t) {
  const T = obj(t.team), from = T.eventStart || '', to = T.eventEnd || T.eventStart || '';
  const inEvent = m => m.tournament || (from && m.date >= from && m.date <= to);
  const days = new Map();
  arr(t.matches).filter(inEvent).sort(byWhen).forEach(m => { if (!days.has(m.date)) days.set(m.date, []); days.get(m.date).push(m); });
  return [...days].map(([date, matches]) => ({ date, matches }));
}

/* ---------- Upcoming commitments ---------- */
// Everything coming up, in date order: training, matches and volunteer tasks. Nothing here names
// anyone, so the same list works for players.
export function agenda(t, today, days = 42) {
  const until = addDays(today, days), within = x => x.date >= today && x.date <= until;
  return [
    ...arr(t.sessions).filter(within).map(s => ({ kind: 'session', date: s.date, start: s.start || '', id: s.id, cancelled: !!s.cancelled, x: s })),
    ...arr(t.matches).filter(within).map(m => ({ kind: 'match', date: m.date, start: m.start || '', id: m.id, cancelled: m.status === 'cancelled' || m.status === 'postponed', x: m })),
    ...arr(t.tasks).filter(within).map(x => ({ kind: 'task', date: x.date, start: x.start || '', id: x.id, cancelled: !!x.cancelled, x }))
  ].sort((a, b) => byWhen(a, b) || ['match', 'session', 'task'].indexOf(a.kind) - ['match', 'session', 'task'].indexOf(b.kind));
}

/* ---------- Reports ---------- */
// Every figure comes from what was recorded. Where nothing was recorded the value is null, which the
// app shows as "not recorded", never as 0.
export const rollTaken = s => !!s && Object.keys(obj(s.attendance)).length > 0;
const came = a => a === 'present' || a === 'late';
export function attendanceTrend(sessions, today) {
  return arr(sessions).filter(s => s.date <= today).sort(byWhen).map(s => {
    if (s.cancelled) return { id: s.id, date: s.date, status: 'cancelled', attended: null };
    if (!rollTaken(s)) return { id: s.id, date: s.date, status: 'missing', attended: null };
    const v = Object.values(s.attendance), c = k => v.filter(x => x === k).length;
    return { id: s.id, date: s.date, status: 'recorded', attended: c('present') + c('late'), late: c('late'), apology: c('apology'), absent: c('absent'), marked: v.length };
  });
}
// What people said before training against what the roll call recorded. Only sessions with both a
// roll call and at least one RSVP count; the others are reported as left out, and why.
export function plannedVsActual(sessions, today) {
  const rows = Object.fromEntries(['yes', 'no', 'maybe', 'none'].map(k => [k, { came: 0, missed: 0 }]));
  const out = { rows, used: 0, noRoll: 0, noRsvp: 0, cancelled: 0 };
  arr(sessions).filter(s => s.date <= today).forEach(s => {
    if (s.cancelled) { if (asking(s)) out.cancelled++; return; }
    if (!asking(s)) { if (rollTaken(s)) out.noRsvp++; return; }
    if (!rollTaken(s)) { out.noRoll++; return; }
    out.used++;
    Object.entries(s.attendance).forEach(([pid, a]) => { rows[rsvpOf(s, pid) || 'none'][came(a) ? 'came' : 'missed']++; });
  });
  return out;
}
const playedOrPast = (m, today) => m.status !== 'cancelled' && m.status !== 'postponed' && (m.status === 'played' || m.status === 'forfeit' || m.date < today);
// Each player's record: training from roll calls, RSVPs where they were collected, and matches
// they were named for (in the match's lineup).
export function participation(t, today) {
  const sessions = arr(t.sessions).filter(s => !s.cancelled && s.date <= today);
  const asked = arr(t.sessions).filter(s => !s.cancelled && asking(s));
  const lineups = new Map(arr(t.lineups).map(l => [l.id, l]));
  const past = arr(t.matches).filter(m => playedOrPast(m, today) && m.lineupId && lineups.has(m.lineupId));
  return arr(t.players).map(p => {
    let recorded = 0, attended = 0, late = 0, apology = 0;
    sessions.forEach(s => { const a = obj(s.attendance)[p.id]; if (!a) return; recorded++; if (came(a)) attended++; if (a === 'late') late++; if (a === 'apology') apology++; });
    const said = { yes: 0, no: 0, maybe: 0, none: 0 };
    asked.forEach(s => { said[rsvpOf(s, p.id) || 'none']++; });
    const positions = {};
    past.forEach(m => lineups.get(m.lineupId).slots.forEach(s => { if (s.playerId === p.id) positions[s.id] = (positions[s.id] || 0) + 1; }));
    const named = Object.values(positions).reduce((a, b) => a + b, 0);
    return { id: p.id, name: p.name,
      training: { recorded, attended, late, apology, pct: recorded ? Math.round(attended / recorded * 100) : null },
      rsvp: { asked: asked.length, ...said },
      matches: { withLineup: past.length, named }, positions };
  });
}
// How often each position was filled in match lineups, and by whom.
export function positionUsage(t, today) {
  const lineups = new Map(arr(t.lineups).map(l => [l.id, l]));
  const ms = arr(t.matches).filter(m => playedOrPast(m, today) && m.lineupId && lineups.has(m.lineupId));
  const use = {};
  ms.forEach(m => lineups.get(m.lineupId).slots.forEach(s => {
    const u = use[s.id] || (use[s.id] = { label: s.label || s.id, filled: 0, empty: 0, players: {} });
    if (s.playerId) { u.filled++; u.players[s.playerId] = (u.players[s.playerId] || 0) + 1; } else u.empty++;
  }));
  return { matches: ms.length, use };
}
// Volunteering per person: done, coming up (accepted or still invited), declined, and past spots
// they accepted that were never marked done (so they aren't counted as helped).
export function volunteerLoad(t, today) {
  const load = {};
  arr(t.tasks).forEach(x => {
    if (x.cancelled) return;
    arr(x.people).forEach(p => {
      if (p.role === 'rider') return;
      const L = load[p.who] || (load[p.who] = { done: 0, accepted: 0, invited: 0, declined: 0, unmarked: 0 });
      if (p.status === 'done') L.done++;
      else if (p.status === 'no') L.declined++;
      else if (x.date >= today) L[p.status === 'yes' ? 'accepted' : 'invited']++;
      else if (p.status === 'yes') L.unmarked++;
    });
  });
  return load;
}
export const loadOf = (load, who) => load[who] || { done: 0, accepted: 0, invited: 0, declined: 0, unmarked: 0 };
// Loose ends: availability not in, tasks short of people or waiting on replies, riders without a
// confirmed seat, matches without a lineup or a result, and WhatsApp messages not confirmed as sent.
export function outstanding(t, today, days = 28) {
  const until = addDays(today, days), soon = x => x.date >= today && x.date <= until;
  const avail = arr(t.players).filter(p => !p.status || p.status === 'available');
  const missing = rec => avail.filter(p => !rsvpOf(rec, p.id)).length;
  const out = { rsvp: [], toFind: [], awaiting: [], riders: [], noLineup: [], noResult: [], unconfirmed: 0 };
  arr(t.matches).filter(m => soon(m) && m.status === 'scheduled').sort(byWhen).forEach(m => {
    if (missing(m)) out.rsvp.push({ kind: 'match', id: m.id, date: m.date, missing: missing(m) });
    if (!m.lineupId) out.noLineup.push(m.id);
  });
  arr(t.sessions).filter(s => soon(s) && !s.cancelled && asking(s)).sort(byWhen).forEach(s => {
    if (missing(s)) out.rsvp.push({ kind: 'session', id: s.id, date: s.date, missing: missing(s) });
  });
  out.rsvp.sort(byWhen);
  arr(t.tasks).filter(x => soon(x) && !x.cancelled).sort(byWhen).forEach(x => {
    if (x.kind === 'lift') { const L = liftPlan(x); if (L.waiting || L.tentative) out.riders.push({ id: x.id, waiting: L.waiting, tentative: L.tentative }); return; }
    const c = coverage(x);
    if (c.toFind) out.toFind.push({ id: x.id, n: c.toFind });
    if (c.invited) out.awaiting.push({ id: x.id, n: c.invited });
  });
  arr(t.matches).filter(m => awaitingResult(m, today)).sort(byWhen).forEach(m => out.noResult.push(m.id));
  out.unconfirmed = arr(t.messages).filter(m => msgStatus(m) === 'prepared').length;
  return out;
}
// The season (or the tournament) at a glance, from what was recorded in the dates given.
export function summary(t, from, to, today) {
  const inRange = x => (!from || x.date >= from) && (!to || x.date <= to);
  const trend = attendanceTrend(arr(t.sessions).filter(inRange), today);
  const recorded = trend.filter(x => x.status === 'recorded');
  const squad = arr(t.players).length;
  const tasks = arr(t.tasks).filter(x => inRange(x) && !x.cancelled && x.kind !== 'lift');
  const helped = new Set();
  tasks.forEach(x => arr(x.people).forEach(p => { if (p.status === 'done') helped.add(p.who); }));
  return {
    sessions: { held: trend.length - trend.filter(x => x.status === 'cancelled').length, cancelled: trend.filter(x => x.status === 'cancelled').length,
      recorded: recorded.length, missing: trend.filter(x => x.status === 'missing').length,
      avgAttended: recorded.length ? Math.round(recorded.reduce((n, x) => n + x.attended, 0) / recorded.length * 10) / 10 : null,
      avgPct: recorded.length && squad ? Math.round(recorded.reduce((n, x) => n + x.attended, 0) / recorded.length / squad * 100) : null },
    matches: teamRecord(arr(t.matches).filter(inRange), today),
    volunteers: { tasks: tasks.length, spotsDone: tasks.reduce((n, x) => n + coverage(x).done, 0), spotsNeeded: tasks.reduce((n, x) => n + coverage(x).need, 0), people: helped.size }
  };
}

/* ---------- Home: the coach's command centre ---------- */
// Worked out from the teams' own records every time Home is drawn; nothing here is saved. Home shows
// a scope (every club, one club, or one team), the most urgent item in it, the next few weeks in one
// list, and the loose ends, each tied to the team it belongs to.
//
// Priority levels (1 is most urgent), from recorded dates and times only:
//   1 critical  a match within 24 hours whose lineup isn't ready, or with too few players confirmed
//               while replies are missing; riders without a seat, or volunteer spots not confirmed,
//               for a task within 24 hours
//   2 imminent  training within 24 hours; a match, or the tournament starting, within 72 hours; a
//               task within 72 hours still waiting on volunteers or drivers
//   3 upcoming  training, a match or the tournament within 7 days; tasks short of people within 14
//               days; rule updates to review, results to enter, messages to confirm (no deadline)
//   4 routine   everything else coming up
// Without a recorded start time an event counts by calendar day (24 hours means today or tomorrow).
// Same level: earliest first, then the one with more to sort, then by team and record.
const ISO_DAY = /^\d{4}-\d\d-\d\d$/, HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOUR = 3600000, WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const NO_CLUB = 'none';
const dateOf = (s, hhmm = '') => { const [y, m, d] = s.split('-').map(Number), [h, mi] = hhmm ? hhmm.split(':').map(Number) : [0, 0]; return new Date(y, m - 1, d, h, mi); };
const validDay = s => ISO_DAY.test(String(s || '')) && isoDay(dateOf(s)) === s;
// When something is, from now: calendar days from today, the start (or the start of its day when no
// time is recorded), and whether it's over (past its end, or 3 hours after a start with no end).
export function eventTime(date, start, end, now) {
  if (!validDay(date)) return null;
  const timed = HHMM.test(start || ''), at = dateOf(date, timed ? start : '').getTime();
  const days = Math.round((dateOf(date) - dateOf(isoDay(now))) / 86400000);
  const fin = timed ? (HHMM.test(end || '') && end > start ? dateOf(date, end).getTime() : at + 3 * HOUR) : null;
  return { date, start: timed ? start : '', timed, at, days, until: at - now.getTime(), over: days < 0 || (days === 0 && timed && now.getTime() > fin) };
}
const within = (e, hours) => e.timed ? e.until <= hours * HOUR : e.days <= hours / 24;
export function dayWord(e) {
  if (e.days === 0) return 'today';
  if (e.days === 1) return 'tomorrow';
  const d = dateOf(e.date);
  return e.days > 1 && e.days < 7 ? `on ${WEEKDAY[d.getDay()]}` : `on ${WEEKDAY[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const KIND_ORDER = ['match', 'session', 'task', 'tournament', 'rules', 'result', 'messages'];
const byRank = (a, b) => a.level - b.level || (a.at === b.at ? 0 : a.at < b.at ? -1 : 1) || b.issues.length - a.issues.length
  || a.teamId.localeCompare(b.teamId) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || String(a.id).localeCompare(String(b.id));
const byTime = (a, b) => a.at - b.at || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.teamId.localeCompare(b.teamId) || String(a.id).localeCompare(String(b.id));

// Clubs with active teams, then "No club" for teams without one. Archived teams are left out.
export function homeClubs(ws) {
  const teams = activeTeams(ws).sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const out = arr(ws && ws.clubs).map(c => ({ id: c.id, name: c.name || 'Club', short: c.shortName || c.name || 'Club', colours: c.colours || '', logo: validLogo(c.logo) ? c.logo : '', teams: teams.filter(t => t.team.clubId === c.id) }))
    .filter(c => c.teams.length).sort((a, b) => a.name.localeCompare(b.name));
  const none = teams.filter(t => !clubOf(ws, t));
  if (none.length) out.push({ id: NO_CLUB, name: 'No club', short: 'No club', colours: '', teams: none });
  return out;
}
// The scope Home shows: one team when there's only one; otherwise the remembered choice if it still
// exists, or every club.
export function homeScope(ws, pref) {
  const teams = activeTeams(ws), p = obj(pref);
  if (teams.length <= 1) return { kind: 'team', id: teams[0] ? teams[0].id : '' };
  if (p.kind === 'team' && teams.some(t => t.id === p.id)) return { kind: 'team', id: p.id };
  if (p.kind === 'club' && homeClubs(ws).some(c => c.id === p.id)) return { kind: 'club', id: p.id };
  return { kind: 'all', id: '' };
}
export const scopeTeams = (ws, scope) => activeTeams(ws).filter(t => scope.kind === 'all'
  || (scope.kind === 'team' ? t.id === scope.id : scope.id === NO_CLUB ? !clubOf(ws, t) : t.team.clubId === scope.id));

// Every item for one team, each with its priority level. `coach` false leaves out anything private.
export function homeItems(ws, team, now, coach = true) {
  const t = activeLens(team);   // the active season only: past seasons never raise anything
  const T = obj(t.team), club = ws ? clubOf(ws, t) : null, rs = teamRules(T, club), today = isoDay(now), out = [];
  const base = { teamId: t.id || PRIMARY_ID, team: teamName(t), club: club ? club.shortName || club.name : '', season: (activeSeason(team) || {}).name || '' };
  const add = x => out.push({ ...base, issues: [], place: '', ...x });
  const avail = arr(t.players).filter(p => !p.status || p.status === 'available');
  const need = Number(rs && rs.values.players) || avail.length;
  const missing = rec => avail.filter(p => !rsvpOf(rec, p.id)).length;
  arr(t.matches).forEach(m => {
    if (m.status !== 'scheduled') return;
    const e = eventTime(m.date, m.start, '', now); if (!e || e.over) return;
    const issues = []; let lineup = false, short = false;
    if (coach) {
      const lu = m.lineupId && arr(t.lineups).find(l => l.id === m.lineupId), chk = lu && lineupCheck(t, lu, m);
      if (!lu) issues.push('No lineup yet'); else if (!chk.ready) issues.push(`Lineup: ${chk.issues[0]}`);
      lineup = !lu || !chk.ready;
      const n = missing(m), yes = avail.filter(p => rsvpOf(m, p.id) === 'yes').length;
      if (n) issues.push(`${plural(n, 'availability reply', 'availability replies')} missing`);
      short = n > 0 && yes < need;
      if (short) issues.push(`${yes} of ${need} players confirmed`);
    }
    const level = (lineup || short) && within(e, 24) ? 1 : within(e, 72) ? 2 : within(e, 168) ? 3 : 4;
    const mk = ws ? matchKind(ws, m) : { comp: null, entry: null };
    add({ kind: 'match', id: m.id, ...e, level, issues, act: 'match-open', title: `vs ${m.opponent || 'TBC'}`, round: m.round || '', comp: mk.comp ? mk.comp.name : '', compId: mk.comp ? mk.comp.id : '',
      place: [m.venue, m.field ? `Field ${m.field}` : ''].filter(Boolean).join(' · '),
      label: level === 1 ? (lineup ? 'Lineup incomplete' : 'Availability not in') : `Match ${dayWord(e)}` });
  });
  arr(t.sessions).forEach(s => {
    if (s.cancelled) return;
    const e = eventTime(s.date, s.start, s.end, now); if (!e || e.over) return;
    const n = coach && Object.keys(obj(s.rsvp)).length ? missing(s) : 0;
    add({ kind: 'session', id: s.id, ...e, level: within(e, 24) ? 2 : within(e, 168) ? 3 : 4, act: 'edit-session', title: 'Training', label: `Training ${dayWord(e)}`,
      place: s.venue || T.trainingVenue || '', issues: n ? [`${plural(n, 'availability reply', 'availability replies')} missing`] : [] });
  });
  arr(t.tasks).forEach(x => {
    if (x.cancelled) return;
    const e = eventTime(x.date, x.start, x.end, now); if (!e || e.over) return;
    const lift = x.kind === 'lift', issues = []; let urgent = false;
    if (lift) {
      const L = liftPlan(x);
      if (L.waiting) issues.push(`${L.waiting} without a seat`);
      if (L.tentative) issues.push(`${L.tentative} waiting on a driver’s reply`);
      urgent = L.waiting > 0;
    } else {
      const c = coverage(x);
      if (c.short) issues.push(`${c.short} of ${plural(c.need, 'spot', 'spots')} not confirmed${c.invited ? ` (${c.invited} invited)` : ''}`);
      urgent = c.short > 0;
    }
    const level = urgent && within(e, 24) ? 1 : issues.length && within(e, 72) ? 2 : issues.length && within(e, 336) ? 3 : 4;
    add({ kind: 'task', id: x.id, ...e, level, issues, act: 'task-open', lift, title: x.title || (lift ? 'Lifts' : 'Task'), place: x.place || '',
      parent: x.sessionId ? `session:${x.sessionId}` : x.matchId ? `match:${x.matchId}` : '',
      label: issues.length ? (lift ? 'Transport needs confirmation' : 'Volunteers needed') : `${lift ? 'Lifts' : x.title || 'Task'} ${dayWord(e)}` });
  });
  const ev = validDay(T.eventStart) && eventTime(T.eventStart, '', '', now);
  const evComp = ws && findComp(ws, T.eventCompId);
  if (ev && ev.days >= 0) add({ kind: 'tournament', ...ev, level: within(ev, 72) ? 2 : within(ev, 168) ? 3 : 4, ...(evComp ? { id: evComp.id, act: 'comp-open', compId: evComp.id } : { id: 'event', act: 'tab', tab: 'matches' }),
    title: T.event || 'Tournament', place: T.venue || '', label: ev.days === 0 ? 'Tournament today' : `Tournament starts ${dayWord(ev)}` });
  if (coach) {
    const later = { at: Infinity, date: '', start: '', timed: false, days: null, over: false };
    const fresh = rs ? rulesNew(T, rs.sport) : [];
    if (fresh.length) add({ kind: 'rules', id: 'rules', ...later, level: 3, act: 'rules-review', title: `Rule set version ${fresh[0].pack}`, label: 'Rules updated' });
    arr(t.matches).filter(m => validDay(m.date) && awaitingResult(m, today)).forEach(m => add({ kind: 'result', id: m.id, ...later, date: m.date, level: 3, act: 'match-open', title: `vs ${m.opponent || 'TBC'}`, label: 'Result not entered' }));
    const n = arr(t.messages).filter(m => msgStatus(m) === 'prepared').length;
    if (n) add({ kind: 'messages', id: 'messages', ...later, level: 3, act: 'tab', tab: 'messages', title: `${plural(n, 'WhatsApp message', 'WhatsApp messages')} not confirmed as sent`, label: 'Messages to confirm' });
  }
  return out;
}

// The loose ends for one team, with the record each opens and its urgency (taken from the item it's
// about). Cancelled tasks and past events don't count.
function homeActions(t, items, today) {
  const o = outstanding(t, today), tid = t.id || PRIMARY_ID, base = { teamId: tid, team: teamName(t) };
  const of = (k, id) => items.find(x => x.kind === k && x.id === id);
  const out = [];
  const add = (k, id, x) => { const it = of(k, id); out.push({ ...base, club: it ? it.club : '', recKind: k, recId: id, level: it ? it.level : 3, date: it ? it.date : '', at: it ? it.at : Infinity, ...x, key: `${tid}:${k}:${id}` }); };
  o.rsvp.forEach(x => { const it = of(x.kind, x.id); add(x.kind, x.id, { kind: 'rsvp', act: 'rsvp-open', k: x.kind, title: `${plural(x.missing, 'availability reply', 'availability replies')} missing`, what: it ? (x.kind === 'match' ? it.title : 'Training') : '' }); });
  o.noLineup.forEach(id => { const it = of('match', id); add('match', id, { kind: 'lineup', act: 'match-open', title: 'Match lineup not made', what: it ? it.title : '' }); });
  o.toFind.forEach(x => { const it = of('task', x.id); add('task', x.id, { kind: 'volunteers', act: 'task-open', title: `${plural(x.n, 'volunteer spot', 'volunteer spots')} still to find`, what: it ? it.title : '' }); });
  o.awaiting.forEach(x => { const it = of('task', x.id); add('task', x.id, { kind: 'invites', act: 'task-open', title: `${plural(x.n, 'volunteer invitation', 'volunteer invitations')} awaiting a reply`, what: it ? it.title : '' }); });
  o.riders.forEach(x => { const it = of('task', x.id); add('task', x.id, { kind: 'transport', act: 'task-open', title: x.waiting ? `${x.waiting} without a seat` : `${x.tentative} waiting on a driver’s reply`, what: it ? it.title : 'Lifts' }); });
  items.filter(x => ['result', 'rules', 'messages'].includes(x.kind)).forEach(x => out.push({ ...base, club: x.club, recKind: x.kind, recId: x.id, level: x.level, date: x.date, at: Infinity,
    kind: x.kind, act: x.act, tab: x.tab, title: x.label === 'Rules updated' ? 'Rules updated: check what it affects' : x.kind === 'messages' ? x.title : x.label, what: x.kind === 'messages' ? 'Message log' : x.title, key: `${tid}:${x.kind}:${x.id}` }));
  return out;
}
const byAction = (a, b) => a.level - b.level || (a.at === b.at ? 0 : a.at < b.at ? -1 : 1) || String(a.date).localeCompare(String(b.date)) || a.teamId.localeCompare(b.teamId) || a.kind.localeCompare(b.kind) || String(a.recId).localeCompare(String(b.recId));

// One team at a glance, for Home when a single team is selected.
export function teamInsight(team, now) {
  const t = activeLens(team), today = isoDay(now), P = arr(t.players), T = obj(t.team);
  const trend = attendanceTrend(t.sessions, today).filter(x => x.status === 'recorded').slice(-5);
  const rec = teamRecord(t.matches, today);
  const end = T.eventEnd || T.eventStart;
  const event = validDay(T.eventStart) ? { name: T.event || 'Tournament', start: T.eventStart, end, days: eventTime(T.eventStart, '', '', now).days,
    state: today < T.eventStart ? 'before' : today <= end ? 'during' : 'after' } : null;
  return {
    players: P.length, available: P.filter(p => !p.status || p.status === 'available').length, injured: P.filter(p => p.status === 'injured').length,
    unavailable: P.filter(p => p.status === 'unavailable').length, female: P.filter(p => p.gender === 'F').length, male: P.filter(p => p.gender === 'M').length,
    attendance: trend.map(x => ({ date: x.date, attended: x.attended })),
    avgPct: trend.length && P.length ? Math.round(trend.reduce((n, x) => n + x.attended, 0) / trend.length / P.length * 100) : null,
    record: { won: rec.won, lost: rec.lost, drawn: rec.drawn, withResult: rec.withResult }, event
  };
}

// Our side of each active competition: results so far, today's matches, the next one and the last.
function liveRow(t, entryId, now) {
  const today = isoDay(now), ms = arr(t.matches).filter(m => m.entryId === entryId).sort(byWhen);
  const upcoming = ms.filter(m => m.status === 'scheduled' && (eventTime(m.date, m.start, '', now) || { over: true }).over === false);
  return { record: teamRecord(ms, today), today: ms.filter(m => m.date === today), next: upcoming[0] || null,
    last: ms.filter(m => matchOutcome(m)).slice(-1)[0] || null, fixtures: ms.length };
}
// Where an active competition is up to: day n of a tournament, week n of a league, or before/after.
export function compPhase(c, now) {
  const today = isoDay(now);
  if (!validDay(c.start)) return { kind: 'open' };
  const end = validDay(c.end) ? c.end : c.start, d = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 86400000);
  if (today < c.start) return { kind: 'before', days: d(today, c.start) };
  if (today > end) return { kind: 'after' };
  const n = d(c.start, today) + 1, total = d(c.start, end) + 1;
  return total > 14 ? { kind: 'week', n: Math.ceil(n / 7), of: Math.ceil(total / 7) } : { kind: 'day', n, of: total };
}
export function liveComps(ws, teams, now) {
  return compsOf(ws).filter(c => c.status === 'active').map(comp => {
    const rows = teams.flatMap(t => { const s = activeSeason(t); if (!s) return [];
      return comp.entries.filter(e => e.teamId === t.id && e.seasonId === s.id && e.status === 'entered').map(entry => ({ teamId: t.id, team: teamName(t), entry, ...liveRow(t, entry.id, now) })); });
    return rows.length ? { comp, phase: compPhase(comp, now), rows } : null;
  }).filter(Boolean);
}
// The same for a players' copy: its own competitions and matches only.
export function liveCompsForTeam(t, now) {
  return arr(t.competitions).filter(c => c.status === 'active' && c.entryStatus !== 'withdrawn')
    .map(c => ({ comp: c, phase: compPhase(c, now), rows: [{ teamId: t.id || PRIMARY_ID, team: teamName(t), entry: { id: c.entryId, division: c.division, pool: c.pool }, ...liveRow(t, c.entryId, now) }] }));
}

// Everything Home needs for the coach: the clubs and teams, the scope, every item in the scope ranked,
// the most urgent one, the next `days` days in date order (a task tied to a training session or match
// in the list goes under it), events that were cancelled or postponed, and the loose ends (leaving
// out the record already in the spotlight).
export function homeView(ws, pref, now, { days = 14 } = {}) {
  const today = isoDay(now), clubs = homeClubs(ws), scope = homeScope(ws, pref), teams = scopeTeams(ws, scope);
  const byTeam = new Map(activeTeams(ws).map(t => [t.id, homeItems(ws, t, now, true)]));
  const urgency = {};
  byTeam.forEach((items, id) => { urgency[id] = items.some(x => x.level === 1) ? 'critical' : items.some(x => x.level === 2 && x.issues.length) ? 'soon' : ''; });
  const items = teams.flatMap(t => byTeam.get(t.id)).sort(byRank);
  const spotlight = items[0] || null, spotKey = spotlight ? `${spotlight.teamId}:${spotlight.kind}:${spotlight.id}` : '';
  const events = items.filter(x => ['match', 'session', 'task', 'tournament'].includes(x.kind) && x.days <= days).map(x => ({ ...x, subs: [] })).sort(byTime);
  const parents = new Map(events.filter(x => x.kind === 'match' || x.kind === 'session').map(x => [`${x.teamId}:${x.kind}:${x.id}`, x]));
  const upcoming = [];
  events.forEach(x => { const p = x.kind === 'task' && x.parent && parents.get(`${x.teamId}:${x.parent}`); if (p) p.subs.push(x); else upcoming.push(x); });
  const changed = teams.map(activeLens).flatMap(t => [
    ...arr(t.sessions).filter(s => s.cancelled).map(s => ({ kind: 'session', id: s.id, date: s.date, start: s.start, status: 'Cancelled', title: 'Training', act: 'edit-session' })),
    ...arr(t.matches).filter(m => m.status === 'cancelled' || m.status === 'postponed').map(m => ({ kind: 'match', id: m.id, date: m.date, start: m.start, status: MATCH_STATUS[m.status], title: `vs ${m.opponent || 'TBC'}`, act: 'match-open' }))
  ].map(x => ({ ...x, teamId: t.id, team: teamName(t), e: eventTime(x.date, x.start, '', now) })).filter(x => x.e && x.e.days >= 0 && x.e.days <= days))
    .sort((a, b) => a.e.at - b.e.at || a.teamId.localeCompare(b.teamId) || a.id.localeCompare(b.id));
  const actions = teams.flatMap(t => homeActions(activeLens(t), byTeam.get(t.id), today)).sort(byAction);
  const team = scope.kind === 'team' ? teams[0] || null : null;
  return { today, clubs, scope, teams, urgency, items, spotlight, upcoming, changed, actions: actions.filter(a => a.key !== spotKey), featured: actions.filter(a => a.key === spotKey).length,
    insight: team ? teamInsight(team, now) : null, multi: activeTeams(ws).length > 1 };
}

/* ---------- WhatsApp message log ---------- */
// Opening WhatsApp only prepares a message; it's "sent" once the coach says it went. Nothing here
// ever claims a message was delivered.
export const msgStatus = m => m && m.status === 'sent' ? 'sent' : 'prepared';
export function logEntry(text, to, ref = '', at = new Date().toISOString()) {
  return { id: uid(), at, text, to, ref, status: 'prepared' };
}
export function markSent(m, sent = true, at = new Date().toISOString()) {
  if (!m) return;
  if (sent) { m.status = 'sent'; m.sentAt = at; } else { m.status = 'prepared'; delete m.sentAt; }
}
export const lastMessage = (messages, ref) => ref ? arr(messages).find(m => m.ref === ref) || null : null;

/* ---------- The library ---------- */
// Plays, game systems and player lists kept once and used by any team. Adding one to a team makes a
// linked copy ({ lib: { id, rev } }). Changing the copy marks it edited. Saving to the library bumps
// its version and brings every unedited copy up to date; edited copies are left alone and show that
// a newer library version exists. Game systems are the playbook systems with the coach's changes,
// so a library system is keyed by the system's id.
export const LIB_KINDS = { plays: 'Play', systems: 'Game system', playerSets: 'Player list' };
const LIB_STRIP = ['id', 'lib', 'rev', 'at', 'builtin', 'edited', 'setDef'];
const SYS_KEYS = ['pos', 'when', 'points', 'jobs'];
export function normLibrary(lib) {
  const L = obj(lib);
  return { plays: arr(L.plays).filter(isObj), playerSets: arr(L.playerSets).filter(isObj),
    systems: Object.fromEntries(Object.entries(obj(L.systems)).filter(([, v]) => isObj(v))) };
}
function content(kind, x) {
  if (kind === 'systems') return clone(Object.fromEntries(SYS_KEYS.filter(k => x[k] !== undefined).map(k => [k, x[k]])));
  const c = { ...x }; LIB_STRIP.forEach(k => delete c[k]);
  return clone(c);
}
export function libGet(ws, kind, id) {
  const L = obj(ws && ws.library);
  if (kind === 'systems') return isObj(obj(L.systems)[id]) ? { ...L.systems[id], id } : null;
  return arr(L[kind]).find(x => x.id === id) || null;
}
export const libItems = (ws, kind) => kind === 'systems' ? Object.keys(obj(ws.library.systems)).map(id => libGet(ws, 'systems', id)) : arr(ws.library[kind]);
// A team's item: a play or player list by id, or the team's version of a game system.
export const teamItem = (t, kind, id) => kind === 'systems' ? (isObj(obj(t.systems)[id]) ? t.systems[id] : null) : arr(t[kind]).find(x => x.id === id) || null;
const teamCopyOf = (t, kind, libId) => kind === 'systems'
  ? (teamItem(t, 'systems', libId) && teamItem(t, 'systems', libId).lib ? teamItem(t, 'systems', libId) : null)
  : arr(t[kind]).find(x => x.lib && x.lib.id === libId) || null;
export function libStatus(ws, kind, x) {
  if (!x || !x.lib) return null;
  const li = libGet(ws, kind, x.lib.id); if (!li) return 'gone';
  const behind = (x.lib.rev || 0) < (li.rev || 0);
  return x.lib.edited ? (behind ? 'edited-behind' : 'edited') : behind ? 'behind' : 'current';
}
export const libMarkEdited = x => { if (x && x.lib) x.lib.edited = true; };
// Put a library item in a team, as a linked copy. Returns the copy (or the existing one).
export function libAdd(ws, t, kind, libId) {
  const li = libGet(ws, kind, libId); if (!li) return null;
  const have = teamCopyOf(t, kind, libId); if (have) return have;
  if (kind === 'systems') {
    t.systems = obj(t.systems);
    t.systems[libId] = { ...content('systems', li), lib: { id: libId, rev: li.rev || 1 } };
    return t.systems[libId];
  }
  const copy = { ...content(kind, li), id: uid(), lib: { id: li.id, rev: li.rev || 1 } };
  if (kind === 'plays' && li.setDef && li.set && !arr(t.playerSets).some(s => s.id === li.set)) {
    t.playerSets = arr(t.playerSets); t.playerSets.push({ ...clone(li.setDef), id: li.set });
  }
  t[kind] = arr(t[kind]); t[kind].push(copy);
  return copy;
}
// Save a team's item to the library: a new library item, or a new version of the one it came from.
// Every other team's unedited copy takes the new version; edited copies are kept as they are.
export function libSave(ws, t, kind, id, opts = {}) {
  const x = teamItem(t, kind, id);
  if (!x && kind !== 'systems') return null;
  const src = x || {};
  const now = opts.now || new Date().toISOString();
  ws.library = normLibrary(ws.library);
  let li = src.lib ? libGet(ws, kind, src.lib.id) : (kind === 'systems' ? libGet(ws, kind, id) : null);
  const rev = li ? (li.rev || 1) + 1 : 1;
  const libId = kind === 'systems' ? id : li ? li.id : 'lib' + uid();
  const item = { ...content(kind, src), rev, at: now };
  if (kind === 'plays' && opts.setDef) item.setDef = clone(opts.setDef);
  if (kind === 'systems') ws.library.systems[libId] = item;
  else {
    const list = ws.library[kind], i = list.findIndex(y => y.id === libId);
    if (i >= 0) list[i] = { ...item, id: libId }; else list.push({ ...item, id: libId });
  }
  li = libGet(ws, kind, libId);
  if (kind === 'systems') { t.systems = obj(t.systems); t.systems[id] = { ...content('systems', src), lib: { id: libId, rev } }; }
  else x.lib = { id: libId, rev };
  const report = { id: libId, rev, updated: [], kept: [] };
  teamsOf(ws).forEach(o => {
    if (o === t) return;
    const c = teamCopyOf(o, kind, libId); if (!c) return;
    if (c.lib.edited) { report.kept.push(o.id); return; }
    replaceCopy(o, kind, c, li);
    report.updated.push(o.id);
  });
  return report;
}
function replaceCopy(t, kind, c, li) {
  if (kind === 'systems') { t.systems[li.id] = { ...content('systems', li), lib: { id: li.id, rev: li.rev } }; return t.systems[li.id]; }
  const i = t[kind].indexOf(c);
  const fresh = { ...content(kind, li), id: c.id, lib: { id: li.id, rev: li.rev } };
  if (i >= 0) t[kind][i] = fresh;
  return fresh;
}
// Take the library's latest version into this team (the team's own changes to it go).
export function libUpdate(ws, t, kind, id) {
  const x = teamItem(t, kind, id); if (!x || !x.lib) return null;
  const li = libGet(ws, kind, x.lib.id); if (!li) return null;
  return replaceCopy(t, kind, x, li);
}
// Keep the team's version as its own, no longer linked to the library.
export function libUnlink(t, kind, id) {
  const x = teamItem(t, kind, id); if (!x || !x.lib) return false;
  delete x.lib; return true;
}
export function libUsage(ws, kind, libId) {
  return teamsOf(ws).map(t => ({ team: t, item: teamCopyOf(t, kind, libId) })).filter(u => u.item).map(u => ({ ...u, status: libStatus(ws, kind, u.item) }));
}
// Take an item out of the library. Teams keep their copies as their own.
export function libRemove(ws, kind, libId) {
  teamsOf(ws).forEach(t => { const c = teamCopyOf(t, kind, libId); if (c) delete c.lib; });
  if (kind === 'systems') delete ws.library.systems[libId];
  else ws.library[kind] = arr(ws.library[kind]).filter(x => x.id !== libId);
}
// The library as a file another coach can import. It holds plays, systems and labels, no people.
export const LIB_FORMAT = 'team-manager-library';
export const libExport = ws => ({ format: LIB_FORMAT, version: 1, exportedAt: new Date().toISOString(), library: normLibrary(ws.library) });
export function libImport(ws, file) {
  if (!file || file.format !== LIB_FORMAT) return null;
  const inc = normLibrary(file.library), n = { added: 0, updated: 0, same: 0 };
  ws.library = normLibrary(ws.library);
  ['plays', 'playerSets'].forEach(kind => inc[kind].forEach(li => {
    if (!li.id) return;
    const list = ws.library[kind], i = list.findIndex(x => x.id === li.id);
    if (i < 0) { list.push(clone(li)); n.added++; } else if ((li.rev || 1) > (list[i].rev || 1)) { list[i] = clone(li); n.updated++; } else n.same++;
  }));
  Object.entries(inc.systems).forEach(([id, li]) => {
    const cur = ws.library.systems[id];
    if (!cur) { ws.library.systems[id] = clone(li); n.added++; } else if ((li.rev || 1) > (cur.rev || 1)) { ws.library.systems[id] = clone(li); n.updated++; } else n.same++;
  });
  return n;
}

/* ---------- Comparing two copies (publishing conflicts) ---------- */
// A workspace broken into records: each player, session, match, task and so on; each team's settings;
// each game system; each library item. Two copies can then be compared record by record.
const COLLECTIONS = ['players', 'sessions', 'matches', 'lineups', 'tasks', 'helpers', 'notices', 'messages', 'plays', 'playerSets', 'seasons'];
const NOT_SETTINGS = new Set([...COLLECTIONS, ...WS_KEYS, 'systems', 'updatedAt', 'id']);
const LABEL = {
  players: p => `Player: ${p.name || '?'}`, sessions: s => `Training: ${s.date || '?'}`, matches: m => `Match: ${m.opponent || 'opponent TBC'}, ${m.date || '?'}`,
  lineups: l => `Lineup: ${l.name || '?'}`, tasks: x => `Task: ${x.title || '?'}, ${x.date || '?'}`, helpers: h => `Helper: ${h.name || '?'}`,
  notices: n => `Notice: ${String(n.text || '').slice(0, 40)}`, messages: m => `Message: ${String(m.text || '').split('\n')[0].slice(0, 40)}`,
  plays: p => `Play: ${p.name || '?'}`, playerSets: x => `Player list: ${x.name || '?'}`, seasons: x => `Season: ${x.name || '?'}`
};
export function records(ws) {
  const out = new Map();
  const many = teamsOf(ws).length > 1;
  const put = (key, value, label) => out.set(key, { value, label, sig: stable(value) });
  teamsOf(ws).forEach(t => {
    const pre = many ? `${teamName(t)} · ` : '', tk = `t/${t.id}`;
    put(`${tk}/settings`, Object.fromEntries(Object.entries(t).filter(([k]) => !NOT_SETTINGS.has(k))), `${pre}Team settings and access`);
    COLLECTIONS.forEach(c => arr(t[c]).forEach(x => { if (x && x.id) put(`${tk}/${c}/${x.id}`, x, pre + LABEL[c](x)); }));
    Object.entries(obj(t.systems)).forEach(([id, v]) => put(`${tk}/systems/${id}`, v, `${pre}Game system: ${id}`));
  });
  arr(ws.clubs).forEach(c => { if (c && c.id) put(`club/${c.id}`, c, `Club: ${c.name || '?'}`); });
  compsOf(ws).forEach(c => { if (c && c.id) put(`comp/${c.id}`, c, `Competition: ${c.name || '?'}`); });
  const L = normLibrary(ws.library);
  ['plays', 'playerSets'].forEach(c => L[c].forEach(x => { if (x.id) put(`lib/${c}/${x.id}`, x, `Library · ${LABEL[c](x)}`); }));
  Object.entries(L.systems).forEach(([id, v]) => put(`lib/systems/${id}`, v, `Library · Game system: ${id}`));
  return out;
}
// Put one record (or remove it, when value is undefined) into a workspace.
function putRecord(ws, key, value, template) {
  const parts = key.split('/');
  if (parts[0] === 'club' || parts[0] === 'comp') {
    const k = parts[0] === 'club' ? 'clubs' : 'competitions';
    ws[k] = arr(ws[k]);
    const i = ws[k].findIndex(c => c.id === parts[1]);
    if (value === undefined) { if (i >= 0) ws[k].splice(i, 1); } else if (i >= 0) ws[k][i] = clone(value); else ws[k].push(clone(value));
    return;
  }
  if (parts[0] === 'lib') {
    ws.library = normLibrary(ws.library);
    const [, c, id] = parts;
    if (c === 'systems') { if (value === undefined) delete ws.library.systems[id]; else ws.library.systems[id] = clone(value); return; }
    const list = ws.library[c], i = list.findIndex(x => x.id === id);
    if (value === undefined) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = clone(value); else list.push(clone(value));
    return;
  }
  const [, teamId, c, id] = parts;
  let t = findTeam(ws, teamId);
  if (!t) {
    if (value === undefined) return;
    t = { id: teamId, ...Object.fromEntries(COLLECTIONS.map(k => [k, []])), systems: {} };
    if (template && template.archived) t.archived = true;
    ws.teams = arr(ws.teams); ws.teams.push(t);
  }
  if (c === 'settings') {
    Object.keys(t).filter(k => !NOT_SETTINGS.has(k)).forEach(k => delete t[k]);
    Object.assign(t, clone(value || {}));
    return;
  }
  if (c === 'systems') { t.systems = obj(t.systems); if (value === undefined) delete t.systems[id]; else t.systems[id] = clone(value); return; }
  t[c] = arr(t[c]);
  const i = t[c].findIndex(x => x && x.id === id);
  if (value === undefined) { if (i >= 0) t[c].splice(i, 1); } else if (i >= 0) t[c][i] = clone(value); else t[c].push(clone(value));
}
// Three-way comparison of this device's copy and the online copy against the copy they both started
// from. A record changed on one side only takes that side; a record changed on both is listed for the
// coach to choose (this device's version until they do). Without the starting copy, every difference
// is listed for the coach to choose.
export function merge3(base, local, remote) {
  const B = base ? records(base) : null, L = records(local), R = records(remote);
  const keys = [...new Set([...R.keys(), ...L.keys(), ...(B ? B.keys() : [])])];
  const merged = clone(remote);
  const changes = { local: [], remote: [], both: [] };
  for (const k of keys) {
    const l = L.get(k), r = R.get(k), b = B ? B.get(k) : undefined;
    const ls = l && l.sig, rs = r && r.sig, bs = b && b.sig;
    if (ls === rs) continue;
    const label = (l || r || b).label;
    if (B && ls === bs) { changes.remote.push({ key: k, label, gone: !r, added: !b }); continue; }
    if (B && rs === bs) { changes.local.push({ key: k, label, gone: !l, added: !b }); putRecord(merged, k, l && l.value, findTeam(local, k.split('/')[1])); continue; }
    changes.both.push({ key: k, label, local: l && l.value, remote: r && r.value, localGone: !l, remoteGone: !r });
    putRecord(merged, k, l && l.value, findTeam(local, k.split('/')[1]));
  }
  merged.updatedAt = [local.updatedAt, remote.updatedAt].filter(Boolean).sort().pop() || null;
  return { merged, changes, threeWay: !!B };
}
// Apply the coach's choices for records changed on both sides: { key: 'remote' } takes the online one.
export function resolve(result, choices) {
  result.changes.both.forEach(c => { if (choices[c.key] === 'remote') putRecord(result.merged, c.key, c.remote); });
  return result.merged;
}
