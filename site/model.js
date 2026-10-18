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

export const SCHEMA = 3;
export const PRIMARY_ID = 'team1';
const WS_KEYS = ['schema', 'teams', 'library', 'clubs'];
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
  teamsOf(ws).forEach(t => repairTeam(t));
  return ws;
}
/* ---------- Clubs ---------- */
// A club holds what's shared by its teams: who it is, how to reach it, where it plays, its links and
// its officials. A team names its club (team.clubId) and keeps its own division, category, season and
// staff. The club's public details go into each of its teams' players' copies; officials' phone
// numbers and email addresses stay in the coach's copy.
export const CLUB_PUBLIC = ['id', 'name', 'shortName', 'sport', 'governingBody', 'founded', 'website', 'email', 'phone', 'postal', 'facebook', 'instagram', 'colours', 'homeGround', 'homeAddress', 'nights', 'registration', 'conduct', 'juniorBrand'];
export const CLUB_ROLES = ['President', 'Vice-president', 'Secretary', 'Treasurer', 'Registrar', 'Representative coordinator', 'Member protection officer', 'Referee coordinator', 'Other'];
export const TEAM_ROLES = ['Head coach', 'Assistant coach', 'Team manager', 'Trainer', 'First aid', 'Other'];
export const TEAM_CATEGORIES = { mixed: 'Mixed', men: 'Men', women: 'Women', boys: 'Boys', girls: 'Girls', open: 'Open (any)' };
export function normClub(c) {
  const out = { ...obj(c) };
  if (!out.id || typeof out.id !== 'string') out.id = uid();
  CLUB_PUBLIC.forEach(k => { if (k !== 'id' && typeof out[k] !== 'string') out[k] = out[k] == null ? '' : String(out[k]); });
  if (!out.sport) out.sport = 'Oztag';
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
  const max = Number(t.team && t.team.maxMales) || 4;
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
const COLLECTIONS = ['players', 'sessions', 'matches', 'lineups', 'tasks', 'helpers', 'notices', 'messages', 'plays', 'playerSets'];
const NOT_SETTINGS = new Set([...COLLECTIONS, ...WS_KEYS, 'systems', 'updatedAt', 'id']);
const LABEL = {
  players: p => `Player: ${p.name || '?'}`, sessions: s => `Training: ${s.date || '?'}`, matches: m => `Match: ${m.opponent || 'opponent TBC'}, ${m.date || '?'}`,
  lineups: l => `Lineup: ${l.name || '?'}`, tasks: x => `Task: ${x.title || '?'}, ${x.date || '?'}`, helpers: h => `Helper: ${h.name || '?'}`,
  notices: n => `Notice: ${String(n.text || '').slice(0, 40)}`, messages: m => `Message: ${String(m.text || '').split('\n')[0].slice(0, 40)}`,
  plays: p => `Play: ${p.name || '?'}`, playerSets: x => `Player list: ${x.name || '?'}`
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
  const L = normLibrary(ws.library);
  ['plays', 'playerSets'].forEach(c => L[c].forEach(x => { if (x.id) put(`lib/${c}/${x.id}`, x, `Library · ${LABEL[c](x)}`); }));
  Object.entries(L.systems).forEach(([id, v]) => put(`lib/systems/${id}`, v, `Library · Game system: ${id}`));
  return out;
}
// Put one record (or remove it, when value is undefined) into a workspace.
function putRecord(ws, key, value, template) {
  const parts = key.split('/');
  if (parts[0] === 'club') {
    ws.clubs = arr(ws.clubs);
    const i = ws.clubs.findIndex(c => c.id === parts[1]);
    if (value === undefined) { if (i >= 0) ws.clubs.splice(i, 1); } else if (i >= 0) ws.clubs[i] = clone(value); else ws.clubs.push(clone(value));
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
