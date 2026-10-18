// Team Manager — coach and player app for an Oztag representative team.
//
// Roles
//   Coach   signs in with the coach password. Sees and edits everything, and publishes.
//   Player  signs in with the team password (or an invite link). Read-only: schedule, squad
//           names and positions, lineups and notices. No phone numbers, injuries, notes or
//           attendance.
//
// Test mode
//   Until the coach goes live, the app opens straight into the coach view with no passwords.
//   Everything stays on that phone (browser storage) and nothing is published.
//
// Data
//   The coach's working copy is kept encrypted on their phone and published (encrypted) to the
//   `data` branch on GitHub. A GitHub Actions workflow copies the encrypted files into the
//   GitHub Pages site, where players' phones download and decrypt their team's file.
//
// Teams
//   The coach's copy is a workspace (see model.js): one or more teams plus a shared library of plays,
//   game systems and player lists. `ws` is the workspace and `data` the team on screen. Each team has
//   its own players' file and its own team password, so one team's players can't open another's.

import { ITERATIONS, makeLock, newSalt, seal, openFile, teamView, toB64, fromB64, toB64Url, fromB64Url, exportKey, importKey, isSealed } from './vault.js';
import { GitHub, repoFromLocation } from './github.js';
import * as M from './model.js';

const KEYS = { auth: 'tm-auth', draft: 'tm-coach-draft', github: 'tm-github', teamCache: 'tm-team-file', trial: 'tm-test-data', backup: 'tm-before-upgrade', seasonsBackup: 'tm-before-seasons', team: 'tm-team' };

// Eight on field, symmetrical: from the centre out to each touch line, Middle, Rover, Link, Wing.
const SLOT_DEFS = [
  { id: 'LW', label: 'LW', name: 'Left wing', group: 'Wing' },
  { id: 'LL', label: 'LL', name: 'Left link', group: 'Link' },
  { id: 'LR', label: 'LR', name: 'Left rover', group: 'Rover' },
  { id: 'LM', label: 'LM', name: 'Left middle', group: 'Middle' },
  { id: 'RM', label: 'RM', name: 'Right middle', group: 'Middle' },
  { id: 'RR', label: 'RR', name: 'Right rover', group: 'Rover' },
  { id: 'RL', label: 'RL', name: 'Right link', group: 'Link' },
  { id: 'RW', label: 'RW', name: 'Right wing', group: 'Wing' }
];
// Field is 50 m wide x 70 m long plus 5 m in-goal each end (y 0–80). The team attacks up the page.
// Players are spread evenly across the width, mirrored about the centre (x = 25).
const ACROSS = { M: 3.2, R: 9.6, L: 16, W: 22.4 };
const mirror = (depth) => Object.fromEntries(['W', 'L', 'R', 'M'].flatMap(k => [[`L${k}`, [+(25 - ACROSS[k]).toFixed(1), depth[k]]], [`R${k}`, [+(25 + ACROSS[k]).toFixed(1), depth[k]]]]));
const SHAPES = {
  attack: mirror({ M: 42, R: 47, L: 52, W: 57 }),     // arrowhead: middles up at the ruck, wings deepest
  defence: mirror({ M: 41, R: 38, L: 41, W: 38 })  // flat line, slightly staggered so names don't collide
};
// Field markings for an Oztag field (50 m wide, 70 m try line to try line). Rugby league's 20 m zones
// on a 100 m field scale to 14 m here. Channels run try line to try line: a narrow touch channel each
// side, a wider outside channel, and a narrow red channel down the middle.
const FIELD_DEFAULTS = { zone: 14, touch: 5, middle: 12 };
function fieldDims(f) {
  const F = { ...FIELD_DEFAULTS, ...(f || {}) };
  const outside = (50 - F.middle - 2 * F.touch) / 2;
  return { ...F, outside, bounds: [0, F.touch, F.touch + outside, F.touch + outside + F.middle, 50 - F.touch, 50] };
}
const STATUS = { available: 'Available', injured: 'Injured', unavailable: 'Unavailable' };
const ROLL = { present: 'Here', late: 'Late', apology: 'Apol', absent: 'Absent' };
const FOCUS_IDEAS = ['Defence line speed', 'Attack shape', 'Ball skills', 'Fitness', 'Set plays', 'Kick chase', 'Match simulation', 'Tagging technique'];
// Five sections, each with one or more views (state.tab is the view on screen). Views marked coach
// are left out for players.
const NAV = [
  { id: 'home', label: 'Home', icon: '<path d="M3.5 11 12 4l8.5 7v9h-5.5v-6h-6v6H3.5z"/>', views: [['home', 'Home']] },
  { id: 'schedule', label: 'Schedule', icon: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    views: [['agenda', 'Upcoming'], ['training', 'Training'], ['matches', 'Matches'], ['attendance', 'Attendance', true]] },
  { id: 'team', label: 'Team', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.5.1 4.2 1.8 5 5"/>',
    views: [['squad', 'Squad'], ['tasks', 'Tasks'], ['helpers', 'Helpers', true], ['tally', 'Tally', true]] },
  { id: 'tactics', label: 'Tactics', icon: '<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><path d="M5 12h14M5 5.5h14M5 18.5h14"/>',
    views: [['field', 'Lineup'], ['plays', 'Plays'], ['rules', 'Rules'], ['library', 'Library', true]] },
  { id: 'more', label: 'More', icon: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
    views: [['more', 'More'], ['club', 'Club'], ['messages', 'Messages', true], ['reports', 'Reports', true], ['teams', 'Clubs and teams', true], ['comps', 'Competitions', true], ['notices', 'Notices']] }
];
const VIEW_IDS = NAV.flatMap(g => g.views.map(v => v[0]));


/* ---------- storage ---------- */
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { mem[k] = v; return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } }
};
const readJson = k => { try { return JSON.parse(store.get(k) || 'null'); } catch (e) { return null; } };

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const todayISO = () => toISODate(new Date());
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const fmtDay = s => parseDate(s).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = s => parseDate(s).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDM = s => parseDate(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const fmtShort = s => { const d = parseDate(s); return `${d.getDate()}/${d.getMonth() + 1}`; };
function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; const hh = ((h + 11) % 12) + 1; return m ? `${hh}:${pad(m)}${ap}` : `${hh}${ap}`; }
const fmtRange = s => s.start ? fmtTime(s.start) + (s.end ? '–' + fmtTime(s.end) : '') : 'Time TBC';
function fmtStamp(iso) { const d = new Date(iso); return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }); }
const firstName = p => (p.name || '').trim().split(/\s+/)[0] || '?';
function shortName(p) { const parts = (p.name || '').trim().split(/\s+/); let n = parts[0] || '?'; if (parts.length > 1) n += ' ' + parts[parts.length - 1][0]; return n.length > 10 ? n.slice(0, 9) + '…' : n; }
const initials = p => (p.name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
function waNumber(phone) {
  const d = String(phone || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0')) return '61' + d.slice(1); // Australian local number
  return d;
}
const fail = (code, message) => Object.assign(new Error(message || code), { code });
const clone = v => JSON.parse(JSON.stringify(v));
// Show a problem beside the field it's about, and move the focus there.
function fieldError(form, name, msg) {
  const inp = form && form.querySelector(`[name="${name}"]`); if (!inp) { toast(msg); return; }
  const wrap = inp.closest('.field-l') || inp.parentElement;
  let e = wrap.querySelector('.err');
  if (!e) { e = document.createElement('small'); e.className = 'err'; e.id = `err-${name}-${Math.random().toString(36).slice(2, 7)}`; e.setAttribute('role', 'alert'); wrap.appendChild(e); }
  e.textContent = msg; inp.setAttribute('aria-invalid', 'true'); inp.setAttribute('aria-describedby', e.id); inp.focus();
  const clear = () => { inp.removeAttribute('aria-invalid'); inp.removeAttribute('aria-describedby'); e.remove(); };
  inp.addEventListener('input', clear, { once: true }); inp.addEventListener('change', clear, { once: true });
}

/* ---------- data ---------- */
function makeLineup(name, shape = 'attack') {
  return { id: uid(), name, slots: SLOT_DEFS.map(s => ({ ...s, x: SHAPES[shape][s.id][0], y: SHAPES[shape][s.id][1], playerId: null })) };
}
function defaultData() {
  return {
    version: 2,
    team: {
      name: 'DragonTag Mixed 20s', event: 'NSW State Cup',
      eventStart: '2027-03-19', eventEnd: '2027-03-21',
      venue: 'C.ex Coffs International Stadium, Coffs Harbour',
      trainingVenue: '', trainingStart: '18:00', trainingEnd: '19:30',
      maxMales: '', positions: ['Wing', 'Link', 'Rover', 'Middle'],
      clubId: '', division: '', category: 'mixed', ageGroup: '', season: '', colours: '', staff: [], rules: '', bylaws: [],
      field: { ...FIELD_DEFAULTS }, tasksContact: { name: '', phone: '' }
    },
    players: [], sessions: [], lineups: [makeLineup('Starting 8')], messages: [], notices: [], plays: starterPlays(), playerSets: [], systems: {}, tasks: [], helpers: [], matches: [],
    teamPass: '', teamSalt: '', updatedAt: null
  };
}
const arr = v => Array.isArray(v) ? v : [];
const obj = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
// Earlier versions called the eighth position "Half"; it is now "Rover". Custom names are left alone.
function renameHalfToRover(d) {
  const t = d.team || {};
  if (Array.isArray(t.positions) && t.positions.join('|') === 'Wing|Link|Middle|Half') {
    t.positions = ['Wing', 'Link', 'Rover', 'Middle'];
    arr(d.players).forEach(p => { if (Array.isArray(p.positions)) p.positions = p.positions.map(x => x === 'Half' ? 'Rover' : x); });
  }
  arr(d.lineups).forEach(l => arr(l.slots).forEach(sl => {
    if (sl.id !== 'H' || sl.group !== 'Half') return;
    sl.id = 'R'; sl.group = 'Rover';
    if (sl.label === 'H') sl.label = 'R';
    if (sl.name === 'Half') sl.name = 'Rover';
  }));
  return d;
}
// The previous field layout had a centre Middle (M) and a single Rover (R). Move to the paired layout:
// shared positions keep their player and any custom name; the Rover goes to LR and the centre Middle to RR.
const PREV_SLOTS = 'LL,LM,LW,M,R,RL,RM,RW';
function toPairedLayout(d) {
  arr(d.lineups).forEach(l => {
    const slots = arr(l.slots);
    if (slots.map(s => s.id).sort().join(',') !== PREV_SLOTS) return;
    const old = Object.fromEntries(slots.map(s => [s.id, s]));
    const carry = { LR: 'R', RR: 'M' };
    l.slots = SLOT_DEFS.map(def => {
      const from = old[def.id];
      return {
        ...def,
        ...(from ? { label: from.label || def.label, name: from.name || def.name } : {}),
        x: SHAPES.attack[def.id][0], y: SHAPES.attack[def.id][1],
        playerId: (from || old[carry[def.id]] || {}).playerId || null
      };
    });
  });
  return d;
}
function normalize(d) {
  const base = defaultData();
  if (!d || typeof d !== 'object') return base;
  const out = { ...base, ...d, team: { ...base.team, ...(d.team || {}) } };
  out.team.field = { ...FIELD_DEFAULTS, ...((d.team && d.team.field) || {}) };
  ['players', 'sessions', 'lineups', 'messages', 'notices', 'plays', 'playerSets', 'tasks', 'helpers', 'matches'].forEach(k => { out[k] = arr(out[k]); });
  out.systems = obj(out.systems);
  out.seasons = arr(out.seasons);
  out.team.tasksContact = { name: '', phone: '', ...obj(out.team.tasksContact) };
  out.team.staff = arr(out.team.staff).filter(x => x && typeof x === 'object');
  out.team.bylaws = arr(out.team.bylaws).filter(x => x && typeof x === 'object').map(M.normBylaw);
  out.tasks.forEach(t => { t.people = arr(t.people); t.cancelled = !!t.cancelled; });
  out.matches.forEach(m => { m.rsvp = obj(m.rsvp); m.result = obj(m.result); if (!M.MATCH_STATUS[m.status]) m.status = 'scheduled'; });
  renameHalfToRover(out);
  toPairedLayout(out);
  upgradePlays(out);
  if (!out.lineups.length) out.lineups = base.lineups;
  out.sessions.forEach(s => { if (!s.attendance || typeof s.attendance !== 'object') s.attendance = {}; s.rsvp = obj(s.rsvp); });
  out.players.forEach(p => { p.positions = arr(p.positions); if (!p.status) p.status = 'available'; });
  M.repairTeam(out);
  return out;
}
function normalizeTeam(t) {
  const base = teamView(defaultData());
  const out = { ...base, ...(t || {}), team: { ...base.team, ...((t && t.team) || {}) } };
  out.team.field = { ...FIELD_DEFAULTS, ...((t && t.team && t.team.field) || {}) };
  ['players', 'sessions', 'lineups', 'notices', 'plays', 'playerSets', 'tasks', 'matches'].forEach(k => { out[k] = arr(out[k]); });
  out.systems = obj(out.systems);
  out.team.tasksContact = { name: '', phone: '', ...obj(out.team.tasksContact) };
  out.club = t && t.club && typeof t.club === 'object' ? t.club : null;
  out.staff = arr(out.staff);
  out.team.bylaws = arr(out.team.bylaws).filter(x => x && typeof x === 'object').map(M.normBylaw);
  if (!out.lineups.length) out.lineups = base.lineups;
  renameHalfToRover(out);
  toPairedLayout(out);
  upgradePlays(out, false);
  out.players.forEach(p => { p.positions = arr(p.positions); });
  return out;
}

// The coach's whole copy: every team, the library, and the upgrade from a single-team copy.
const normalizeWs = raw => M.migrateWorkspace(raw, normalize);

/* ---------- session ---------- */
const S = {
  role: null,            // 'coach' | 'player'
  trial: false,          // test mode: no passwords, nothing leaves this phone
  coachLock: null, teamLock: null,
  baseSha: null,         // data-branch commit this device last loaded or published
  remoteStamp: null,     // updatedAt of the copy this device started from
  base: null,            // that copy itself, to show what changed on each side if publishing clashes
  dirty: false, publishing: false, again: false,
  pub: 'idle', pubMsg: '', lastPublished: null,
  teamLocks: {},         // each team's players' lock, by team id
  teamFile: null,        // player: which team file this phone opened
  watch: undefined       // coach: the Rules watch results, loaded once per visit
};
let ws = null;        // coach: every team and the library
let data = null;      // coach: the team on screen (inside ws)
let teamData = null;  // player: the team view
// Show a team (this device remembers which). Archived teams are only shown when asked for directly.
function pickTeam(id) {
  const want = M.findTeam(ws, id || store.get(KEYS.team));
  data = want && (!want.archived || id) ? want : M.activeTeams(ws)[0] || ws;
  store.set(KEYS.team, data.id);
  return data;
}
// Load a coach copy. An older single-team copy is kept as it was (encrypted when live) before it is
// upgraded, so it can be downloaded again from Settings.
async function loadWs(raw, lock) {
  if (raw && typeof raw === 'object' && raw.schema !== M.SCHEMA && Array.isArray(raw.players) && !store.get(KEYS.backup)) {
    const at = new Date().toISOString();
    store.set(KEYS.backup, JSON.stringify(lock ? { at, file: await seal(raw, lock, 'coach') } : { at, data: raw }));
  }
  // The copy as it was before seasons and competitions (schema 4), kept once, so it can be downloaded again.
  if (raw && typeof raw === 'object' && (Number(raw.schema) || 0) < 4 && (Array.isArray(raw.players) || raw.team) && !store.get(KEYS.seasonsBackup)) {
    const at = new Date().toISOString();
    store.set(KEYS.seasonsBackup, JSON.stringify(lock ? { at, file: await seal(raw, lock, 'coach') } : { at, data: raw }));
  }
  ws = normalizeWs(raw);
  return pickTeam();
}
let V = null;         // what the current screen shows (set in render)
let gh = { autoPublish: true, ...repoFromLocation(), ...(readJson(KEYS.github) || {}) };

const state = {
  tab: 'home', squadFilter: 'all', squadSearch: '', showPast: false,
  msgEvent: null, msgRef: '', askSent: null, pending: null, conflict: null, lastView: {}, reportRange: 'season',
  lineupId: null, moveMode: false, msgTpl: 'reminder', msgSession: null, msgDraft: null, postNotice: true,
  layers: { zones: true, channels: true, ...(readJson('tm-field-layers') || {}) },
  system: null, sysFlip: false,
  playId: null, playSide: 'right', ped: null,
  taskFilter: 'up', taskPick: null,
  preview: false, lockMode: 'player', lockMsg: '', noTeam: false, remember: true, busy: false,
  viewSeason: {},        // the season on screen for each team, when it isn't the active one
  correcting: null       // a past season the coach chose to correct ({ team, season })
};
const isCoach = () => S.role === 'coach' && !state.preview;
// The coach sees one season of the team at a time: the active one, or a past one being looked back on
// (read-only unless they choose to correct it). Players see their published copy (this season only).
const viewSeasonId = () => { const want = state.viewSeason[data.id]; return M.findSeason(data, want) ? want : (M.activeSeason(data) || M.seasonsOf(data).slice(-1)[0] || {}).id; };
const correcting = () => !!(state.correcting && data && state.correcting.team === data.id && V && V.viewSeason && V.viewSeason.id === state.correcting.season);
const readOnlyView = () => S.role === 'coach' && !state.preview && !!V && !!V.readOnly && !correcting();
const editingSeasonId = () => state.correcting && data && state.correcting.team === data.id ? state.correcting.season : '';
const playersCopy = t => teamView(M.activeLens(t), M.clubOf(ws, t), M.compsForPlayers(ws, t));
const curView = () => S.role === 'coach' ? (state.preview ? normalizeTeam(playersCopy(data)) : M.seasonLens(data, viewSeasonId())) : teamData;
// The club of the team on screen: from the workspace for the coach, from the players' copy otherwise.
const curClub = () => S.role === 'coach' && !state.preview ? M.clubOf(ws, data) : (V && V.club) || null;
const isMixed = T => !T.category || T.category === 'mixed';

const playerById = id => V.players.find(p => p.id === id);
const sessionById = id => V.sessions.find(s => s.id === id);
const matchById = id => arr(V.matches).find(m => m.id === id);
const bySession = (a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''));
const sortedPlayers = () => V.players.slice().sort((a, b) => a.name.localeCompare(b.name));
const upcomingSessions = () => V.sessions.filter(s => s.date >= todayISO()).sort(bySession);
const pastSessions = () => V.sessions.filter(s => s.date < todayISO()).sort(bySession).reverse();
const nextSession = () => upcomingSessions().find(s => !s.cancelled);
const rollTaken = s => !!s.attendance && Object.keys(s.attendance).length > 0;
const rollSessions = () => V.sessions.filter(s => !s.cancelled && rollTaken(s)).sort(bySession);
function playerStats(pid) {
  let att = 0, late = 0, apol = 0, total = 0;
  for (const s of rollSessions()) {
    const v = s.attendance[pid]; if (!v) continue; total++;
    if (v === 'present') att++; else if (v === 'late') { att++; late++; } else if (v === 'apology') apol++;
  }
  return { att, late, apol, total, pct: total ? Math.round(att / total * 100) : null };
}
function countdown() {
  const T = V.team; if (!T.eventStart) return null;
  const today = todayISO(), end = T.eventEnd || T.eventStart;
  if (today < T.eventStart) return { state: 'before', days: daysBetween(today, T.eventStart) };
  if (today <= end) return { state: 'during' };
  return { state: 'after' };
}
function fmtEventDates() {
  const T = V.team; if (!T.eventStart) return '';
  const a = parseDate(T.eventStart), b = parseDate(T.eventEnd || T.eventStart);
  const o = { day: 'numeric', month: 'long', year: 'numeric' };
  if (T.eventStart === (T.eventEnd || T.eventStart)) return a.toLocaleDateString('en-AU', o);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.toLocaleDateString('en-AU', o)}`;
  return `${a.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('en-AU', o)}`;
}
const curLineup = () => V.lineups.find(l => l.id === state.lineupId) || V.lineups[0];
// The invite link carries the team password, and which team (the first team's link is unchanged).
const inviteLink = () => `${location.origin}${location.pathname}#join=${toB64Url(data.teamPass)}${data === ws ? '' : '.' + data.id}`;

/* =========================================================
   LOADING, SIGN-IN AND PUBLISHING
   ========================================================= */
const ghReady = () => !!(gh.owner && gh.repo && gh.token);
const ghClient = () => new GitHub(gh);
const saveGh = () => store.set(KEYS.github, JSON.stringify(gh));
const readDraft = () => { const d = readJson(KEYS.draft); return d && isSealed(d.file) ? d : null; };

async function fetchSite(name) {
  let r;
  try { r = await fetch(`data/${name}?t=${Date.now()}`, { cache: 'no-store' }); }
  catch (e) { throw fail('NETWORK', "Couldn't connect. Check your reception and try again."); }
  if (r.status === 404) return null;
  if (!r.ok) throw fail('NETWORK', `The site returned an error (${r.status}).`);
  try { return await r.json(); } catch (e) { return null; }
}
const cacheKey = name => name === 'team.enc.json' ? KEYS.teamCache : `${KEYS.teamCache}:${name}`;
async function fetchTeamFile(name = 'team.enc.json') {
  try {
    const f = await fetchSite(name);
    if (f) store.set(cacheKey(name), JSON.stringify(f));
    S.fromCache = false;
    return f;
  } catch (e) {
    const cached = readJson(cacheKey(name)); // keeps the app usable with no reception at the ground
    if (cached) { S.fromCache = true; return cached; }
    throw e;
  }
}
// The published files, from the site's manifest (null if it can't be read).
async function siteFiles() {
  try { const m = await fetchSite('manifest.json'); return m && Array.isArray(m.files) ? m.files : null; } catch (e) { return null; }
}
// The freshest published copy of the coach file: from GitHub if connected, otherwise the website.
async function fetchCoachRemote() {
  if (ghReady()) {
    const g = ghClient();
    const head = await g.head();
    if (!head) return null;
    return { file: await g.readJson('coach.enc.json', head), sha: head };
  }
  const file = await fetchSite('coach.enc.json');
  return file ? { file, sha: null } : null;
}

async function rememberAuth(role, lock, file) {
  store.set(KEYS.auth, JSON.stringify({ role, key: await exportKey(lock.key), salt: toB64(lock.salt), iterations: lock.iterations, ...(file ? { file } : {}) }));
}
async function lockFromAuth(a) {
  return { key: await importKey(a.key), salt: fromB64(a.salt), iterations: a.iterations || ITERATIONS };
}

// A player opens their team's file. With an invite link or a remembered sign-in the file is known;
// with a typed password each published team file is tried in turn (the first team's first).
async function openPlayer(cred, remember, name) {
  let names = name ? [name] : null;
  if (!names) { const listed = await siteFiles(); names = ['team.enc.json', ...(listed || []).filter(n => M.TEAM_FILE.test(n) && n !== 'team.enc.json')]; }
  let lastErr = null, found = false;
  for (const n of names) {
    const file = await fetchTeamFile(n); if (!file) continue;
    found = true;
    try {
      const { value, lock } = await openFile(file, cred, 'team');
      teamData = normalizeTeam(value);
      S.role = 'player'; S.teamLock = lock; S.teamFile = n;
      if (remember) await rememberAuth('player', lock, n);
      return;
    } catch (e) { if (e.code !== 'WRONG') throw e; lastErr = e; }
  }
  throw found ? lastErr : fail('NO_TEAM');
}

async function openCoach(cred, remember) {
  let remote = null, remoteErr = null;
  try { remote = await fetchCoachRemote(); } catch (e) { remoteErr = e; }
  const draft = readDraft();
  // Unpublished changes on this phone come first; publishing checks whether the online copy moved on.
  let chosen = null;
  if (draft && draft.dirty) chosen = { file: draft.file, sha: draft.baseSha, stamp: draft.remoteStamp, dirty: true };
  else if (remote) chosen = { file: remote.file, sha: remote.sha };
  else if (draft) chosen = { file: draft.file, sha: draft.baseSha, stamp: draft.remoteStamp, dirty: false };
  if (!chosen) throw remoteErr || fail('NO_TEAM');
  const { value, lock } = await openFile(chosen.file, cred, 'coach');
  await loadWs(value, lock);
  S.base = null;
  if (!chosen.dirty) S.base = clone(ws);
  else if (draft && draft.baseFile) { try { S.base = normalizeWs((await openFile(draft.baseFile, lock, 'coach')).value); } catch (e) { S.base = null; } }
  S.role = 'coach'; S.coachLock = lock; S.dirty = chosen.dirty;
  S.baseSha = chosen.sha || null;
  S.remoteStamp = chosen.stamp !== undefined ? chosen.stamp : ws.updatedAt;
  if (remember) await rememberAuth('coach', lock);
  persistDraft();
  if (S.dirty) schedulePublish();
}

let draftChain = Promise.resolve();
// The draft keeps, encrypted, this phone's copy and the copy it started from (the base), so a clash
// when publishing can show what changed on each side. If the phone runs short of storage, the base
// is dropped first.
let sealedBase = { of: null, file: null };
function persistDraft() {
  if (S.role !== 'coach' || !S.coachLock) return;
  const snapshot = JSON.parse(JSON.stringify(ws)), base = S.base;
  const meta = { baseSha: S.baseSha, remoteStamp: S.remoteStamp, dirty: S.dirty };
  draftChain = draftChain.then(async () => {
    const file = await seal(snapshot, S.coachLock, 'coach');
    if (base && sealedBase.of !== base) sealedBase = { of: base, file: await seal(base, S.coachLock, 'coach') };
    const at = new Date().toISOString();
    if (base && store.set(KEYS.draft, JSON.stringify({ file, baseFile: sealedBase.file, ...meta, at }))) return;
    if (store.set(KEYS.draft, JSON.stringify({ file, ...meta, at }))) {
      if (!S.storageWarned) { S.storageWarned = true; toast('Storage getting full. Export a backup from Settings.'); }
      return;
    }
    S.storageFull = true; renderStatus();
    if (!S.storageWarned) { S.storageWarned = true; toast('Changes could not be stored on this phone. Export a backup immediately.'); }
  }).catch(() => { S.storageFull = true; renderStatus(); });
}

// Every change: keep it (encrypted) on this phone, then publish shortly after.
function save() {
  M.syncSportPositions(ws);            // club sport changes must also update team/player projections
  M.claimRecords(data, editingSeasonId());   // new records join the season being worked on
  M.syncJerseys(data, todayISO());            // a number given out is a jersey given out
  M.syncEvents(ws);
  data.updatedAt = ws.updatedAt = new Date().toISOString();
  if (S.trial) { if (!store.set(KEYS.trial, JSON.stringify(ws))) S.storageFull = true; renderStatus(); return; }
  S.dirty = true;
  persistDraft();
  schedulePublish();
  renderStatus();
}

let publishTimer = null;
function schedulePublish() {
  clearTimeout(publishTimer);
  if (!S.trial && ghReady() && gh.autoPublish && online()) publishTimer = setTimeout(() => publish(true), 5000);
}
window.addEventListener('online', () => { renderStatus(); if (S.role === 'coach' && S.dirty) schedulePublish(); });
window.addEventListener('offline', () => renderStatus());

async function teamLockFor(d) {
  if (!d.teamSalt) d.teamSalt = toB64(newSalt());
  const L = S.teamLocks[d.id];
  if (L && L.pass === d.teamPass && toB64(L.salt) === d.teamSalt) return L;
  const lock = await makeLock(d.teamPass, fromB64(d.teamSalt));
  S.teamLocks[d.id] = { ...lock, pass: d.teamPass };
  return S.teamLocks[d.id];
}
// A strong random team password, for teams made without one. The coach can see and change it in
// Settings, and the invite link carries it.
function newTeamPass() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(15));
  return [0, 5, 10].map(i => Array.from(r.slice(i, i + 5), b => abc[b % abc.length]).join('')).join('-');
}

async function remoteMovedOn(g, head) {
  if (!head) return false;
  if (S.baseSha) return head !== S.baseSha;
  // This phone loaded from the website, so it doesn't know the commit; compare timestamps instead.
  try {
    const remote = await openFile(await g.readJson('coach.enc.json', head), S.coachLock, 'coach');
    return remote.value.updatedAt !== S.remoteStamp;
  } catch (e) { return true; }
}

async function publish(auto = false, force = false) {
  if (S.role !== 'coach') return;
  if (S.trial) { if (!auto) openGoLive(); return; }
  if (!ghReady()) { if (!auto) openGithubSheet(); return; }
  if (S.publishing) { S.again = true; return; }
  clearTimeout(publishTimer);
  S.publishing = true; S.pub = 'busy'; renderStatus();
  try {
    const g = ghClient();
    const head = await g.head();
    if (!force && await remoteMovedOn(g, head)) {
      S.pub = 'conflict';
      S.pubMsg = 'The team was changed from another device since this phone last loaded it.';
      if (!auto) openConflictSheet();
      return;
    }
    if (!gh.defaultBranch) { try { gh.defaultBranch = (await g.repoInfo()).default_branch; saveGh(); } catch (e) { /* fall back to main */ } }
    // Every team that's in use gets a password before anything is encrypted.
    M.activeTeams(ws).forEach(t => { if (!t.teamPass) t.teamPass = newTeamPass(); });
    const snapshot = JSON.parse(JSON.stringify(ws)), files = {};
    for (const t of M.teamsOf(snapshot)) {
      const name = M.teamFile(snapshot, t);
      if (t.archived) { files[name] = null; continue; }   // an archived team's file comes off the site
      files[name] = JSON.stringify(await seal(teamView(M.activeLens(t), M.clubOf(snapshot, t), M.compsForPlayers(snapshot, t)), await teamLockFor(t), 'team'), null, 1);
      const live = M.findTeam(ws, t.id); if (live) live.teamSalt = t.teamSalt;
    }
    files['coach.enc.json'] = JSON.stringify(await seal(snapshot, S.coachLock, 'coach'), null, 1);
    const sha = await g.commitFiles(files, head, `Update team data (${new Date().toISOString().slice(0, 16)}Z)`);
    S.baseSha = sha; S.remoteStamp = snapshot.updatedAt; S.base = snapshot;
    if (JSON.stringify(ws) === JSON.stringify(snapshot)) S.dirty = false;
    persistDraft();
    try {
      await g.startPublish(gh.defaultBranch || 'main');
      S.pub = 'ok'; S.lastPublished = Date.now();
    } catch (e) {
      S.pub = 'error';
      S.pubMsg = `Saved to GitHub, but the site update didn't start. ${e.message}`;
    }
  } catch (e) {
    S.pub = e.code === 'CONFLICT' ? 'conflict' : 'error';
    S.pubMsg = e.message || 'Publishing failed.';
  } finally {
    S.publishing = false;
    renderStatus();
    if (S.again) { S.again = false; if (S.dirty) schedulePublish(); }
  }
}

async function loadLatest() {
  try {
    const remote = await fetchCoachRemote();
    if (!remote) { toast('Nothing has been published yet.'); return; }
    const { value } = await openFile(remote.file, S.coachLock, 'coach');
    await loadWs(value, S.coachLock);
    S.baseSha = remote.sha; S.remoteStamp = ws.updatedAt; S.dirty = false; S.pub = 'idle'; S.base = clone(ws);
    state.lineupId = null; state.msgDraft = null;
    persistDraft(); closeSheet(); render(); toast('Loaded the latest version');
  } catch (e) {
    if (e.code === 'WRONG') { toast('The coach password was changed on another device. Sign in again.'); setTimeout(signOutNow, 1500); }
    else toast(e.message || "Couldn't load the latest version");
  }
}

function signOutNow() { store.del(KEYS.auth); location.hash = ''; location.reload(); }

/* =========================================================
   RENDER
   ========================================================= */
const ICON = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M20.5 11.5a8 8 0 0 1-11.6 7.2L3.5 20l1.4-4.8a8 8 0 1 1 15.6-3.7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v6.5h14V13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cog: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.5.1 4.2 1.8 5 5"/>',
  rsvp: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3"/><path d="M15 17.5l2 2 4.5-4.5"/>'
};
const icon = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const gBadge = p => { const g = p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : 'U'; return `<span class="g ${g}" title="${g === 'F' ? 'Female' : g === 'M' ? 'Male' : 'Gender not set'}">${g === 'U' ? '?' : g}</span>`; };
const jersey = p => `<span class="jersey ${p.number ? '' : 'none'}">${esc(p.number || initials(p))}</span>`;
// A player's photo with their number on it (coach only); the number badge when there's no photo.
const playerPic = (p, big = false) => isCoach() && M.validPhoto(p.photo)
  ? `<span class="pphoto${big ? ' big' : ''}"><img src="${p.photo}" alt="">${p.number ? `<b>${esc(p.number)}</b>` : ''}</span>`
  : big ? `<span class="pphoto big none" aria-hidden="true">${esc(initials(p) || '?')}</span>` : jersey(p);
const isOut = p => isCoach() && p.status && p.status !== 'available';
const statusPill = p => isOut(p) ? ` <span class="pill ${p.status}">${STATUS[p.status]}</span>` : '';

function render() {
  animStop();
  if (!S.role) return renderLock();
  V = curView();
  if (!VIEW_IDS.includes(state.tab) || !viewsOf(navOf(state.tab)).some(v => v[0] === state.tab)) state.tab = 'home';
  renderNav();
  renderStatus();
  const coachSeason = S.role === 'coach' && !state.preview && M.seasonsOf(data).length;
  const sName = coachSeason ? (V.viewSeason ? V.viewSeason.name : 'No active season') : (V.season && V.season.name) || '';
  const tag = !sName ? '' : coachSeason ? `<button class="season-tag${V.readOnly ? ' past' : ''}" data-act="season-pick" aria-haspopup="dialog" aria-label="Season: ${esc(sName)}${V.readOnly ? ', looking back' : ''}. Change season">${esc(sName)}${V.readOnly ? ' · looking back' : ''}</button>` : `<span class="season-tag">${esc(sName)}</span>`;
  $('#team-title').classList.toggle('with-season', !!tag);
  $('#team-title').innerHTML = (multiTeam() && !state.preview ? `<button class="team-btn" data-act="team-switch" aria-haspopup="dialog" aria-label="${esc(V.team.name)}. Switch team"><span class="t-name">${esc(V.team.name || 'Team')}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>` : `<span class="t-name">${esc(V.team.name || 'Team Manager')}</span>`) + tag;
  document.title = V.team.name || 'Team Manager';
  $('#menu-btn').hidden = false;
  renderBell(); loadWatch();
  const cd = countdown(), chip = $('#days-chip');
  if (cd && cd.state === 'before') { chip.hidden = false; chip.innerHTML = `<b>${cd.days}</b> day${cd.days === 1 ? '' : 's'}`; chip.title = `Days until ${V.team.event}`; }
  else if (cd && cd.state === 'during') { chip.hidden = false; chip.innerHTML = '<b>Game day</b>'; }
  else chip.hidden = true;

  const v = $('#view'), g = navOf(state.tab);
  state.lastView[g.id] = state.tab;
  document.title = `${viewLabel(state.tab)} · ${V.team.name || 'Team Manager'}`;
  v.innerHTML = subNav(g) + (state.tab === 'home' ? '' : seasonBanner()) + VIEWS[state.tab]();
  if (state.tab === 'field') bindField();
  renderAsk();
}
const VIEWS = {
  home: () => viewHome(), agenda: () => viewAgenda(), training: () => viewSchedule(), matches: () => viewMatches(), attendance: () => viewAttendance(),
  squad: () => viewSquad(), tasks: () => viewTaskList(), helpers: () => viewHelpers(), tally: () => viewHelped(),
  field: () => viewField(), plays: () => viewPlays(), rules: () => viewRules(), library: () => viewLibrary(),
  more: () => viewMore(), club: () => viewClub(), messages: () => viewMessages(), reports: () => viewReports(), teams: () => viewTeams(), comps: () => viewComps(), notices: () => viewNotices()
};
const navOf = tab => NAV.find(g => g.views.some(v => v[0] === tab)) || NAV[0];
const viewsOf = g => g.views.filter(v => !v[2] || isCoach());
const viewLabel = tab => (navOf(tab).views.find(v => v[0] === tab) || [, 'Home'])[1];
// The views in a section, across the top of the page (on a wide screen they're in the side bar).
function subNav(g) {
  const vs = viewsOf(g); if (vs.length < 2 || g.id === 'more') return '';
  return `<nav class="subnav" aria-label="${esc(g.label)}">${vs.map(([id, l]) => `<button data-act="tab" data-tab="${id}" ${id === state.tab ? 'aria-current="page"' : ''}>${esc(l)}</button>`).join('')}</nav>`;
}
function goTo(tab, focus = true) {
  if (tab === 'plays') state.playId = null;
  if (tab === 'comps') state.compId = null;
  state.tab = tab; history.replaceState(null, '', '#' + tab);
  closeSheet(); render(); window.scrollTo(0, 0);
  if (focus) { const v = $('#view'); try { v.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
}

function renderNav() {
  const nav = $('#tabs'), cur = navOf(state.tab);
  nav.hidden = false;
  nav.style.gridTemplateColumns = `repeat(${NAV.length},1fr)`;
  nav.innerHTML = NAV.map(g => { const vs = viewsOf(g), on = g === cur;
    return `<div class="nav-group${on ? ' on' : ''}"><button class="nav-main" data-act="nav" data-g="${g.id}" ${on ? 'aria-current="page"' : ''}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${g.icon}</svg>${g.label}</button>
      ${vs.length > 1 && g.id !== 'more' ? `<div class="nav-sub">${vs.map(([id, l]) => `<button data-act="tab" data-tab="${id}" ${id === state.tab ? 'aria-current="page"' : ''}>${esc(l)}</button>`).join('')}</div>` : ''}</div>`; }).join('');
}

const online = () => navigator.onLine !== false;
function renderStatus() {
  const el = $('#status');
  if (S.role !== 'coach') {
    el.hidden = !(S.role === 'player' && (!online() || S.fromCache));
    if (!el.hidden) { el.className = 'status warn'; el.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="grow">No connection. You’re seeing the copy saved on this phone.</span>`; }
    return;
  }
  el.hidden = false;
  let cls = 'ok', text = '', btn = '';
  if (state.preview) { cls = 'info'; text = 'You are seeing what players see.'; btn = `<button data-act="preview-off">Back to coach view</button>`; }
  else if (S.storageFull) { cls = 'bad'; text = 'This phone’s storage for the app is full, so the latest changes may not be kept. Export a backup now.'; btn = `<button data-act="settings">Settings</button>`; }
  else if (S.trial) { cls = 'warn'; text = 'Test mode. Saved on this phone only; nothing is shared.'; btn = `<button data-act="go-live">Go live</button>`; }
  else if (!online() && S.dirty) { cls = 'warn'; text = 'Offline. Changes are saved on this phone and will publish when you’re back online.'; }
  else if (!online()) { cls = 'warn'; text = 'Offline. Everything here is saved on this phone.'; }
  else if (!ghReady()) { cls = 'warn'; text = 'Saved on this phone only.'; btn = `<button data-act="github">Connect GitHub to publish</button>`; }
  else if (S.publishing) { cls = 'busy'; text = 'Publishing…'; }
  else if (S.pub === 'conflict') { cls = 'bad'; text = 'Changed on another device.'; btn = `<button data-act="conflict">Sort it out</button>`; }
  else if (S.pub === 'error') { cls = 'bad'; text = S.pubMsg; btn = `<button data-act="publish">Try again</button>`; }
  else if (S.dirty) { cls = 'warn'; text = gh.autoPublish ? 'Publishing shortly…' : 'Changes not published yet.'; btn = `<button data-act="publish">Publish now</button>`; }
  else if (S.lastPublished && Date.now() - S.lastPublished < 180000) { text = 'Published. Players see it in about a minute.'; }
  else { text = S.lastPublished ? `All changes published (${new Date(S.lastPublished).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}).` : 'All changes published.'; }
  el.className = `status ${cls}`;
  el.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="grow">${esc(text)}</span>${btn}`;
}
setInterval(() => { if (S.role === 'coach' && !S.publishing) renderStatus(); }, 30000);

/* ---------- Lock screen and setup ---------- */
function renderLock() {
  $('#tabs').hidden = true; $('#status').hidden = true; $('#days-chip').hidden = true; $('#menu-btn').hidden = true; $('#bell-btn').hidden = true;
  $('#team-title').textContent = 'Team Manager';
  const coach = state.lockMode === 'coach';
  const draft = readDraft();
  let body;
  if (state.lockMode === 'setup') body = setupForm();
  else if (!coach && state.noTeam) body = `<p class="muted">Your coach hasn't published the team yet. Check back once they've sent the link.</p>
      <button class="link-btn" data-act="lock-mode" data-mode="coach">I'm the coach</button>`;
  else if (coach && state.noTeam && !draft) body = `<p class="muted">No team has been set up here yet.</p>
      <button class="btn primary block" data-act="lock-mode" data-mode="setup">Set up the team</button>
      <button class="link-btn" data-act="lock-mode" data-mode="player">I'm a player</button>`;
  else body = `<p class="muted">${coach ? 'Sign in with the coach password.' : 'Enter the team password your coach gave you.'}</p>
      <form data-form="unlock" data-role="${coach ? 'coach' : 'player'}">
        <label class="field-l"><span>${coach ? 'Coach password' : 'Team password'}</span>
          <input type="password" name="password" required autocomplete="current-password" ${state.busy ? 'disabled' : ''}></label>
        <label class="check"><input type="checkbox" name="remember" ${state.remember ? 'checked' : ''}> Keep me signed in on this phone</label>
        <button class="btn primary block" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Unlocking…' : coach ? 'Sign in' : 'Open'}</button>
      </form>
      <button class="link-btn" data-act="lock-mode" data-mode="${coach ? 'player' : 'coach'}">${coach ? "I'm a player" : "I'm the coach"}</button>`;
  $('#view').innerHTML = `<section class="lock">
    <div class="lock-mark" aria-hidden="true">${icon('lock', 30)}</div>
    <h2>${state.lockMode === 'setup' ? 'Set up your team' : coach ? 'Coach sign in' : 'Team Manager'}</h2>
    ${state.lockMsg ? `<p class="note" role="alert">${esc(state.lockMsg)}</p>` : ''}
    ${body}
  </section>`;
}
function setupForm() {
  return `<p class="muted" style="margin-bottom:14px">You'll choose two passwords. Everything is encrypted with them before it goes online, so there's no way to recover them — keep both in your phone's password manager.</p>
    <form data-form="setup" autocomplete="off">
      <label class="field-l"><span>Team name</span><input type="text" name="name" required value="DragonTag Mixed 20s"></label>
      <h3 class="form-sec">Coach password</h3>
      <p class="muted small" style="margin-bottom:10px">Only for you (and any assistant coach). Unlocks everything, including phone numbers and attendance. At least 10 characters — three or four random words works well.</p>
      <label class="field-l"><span>Coach password</span><input type="password" name="coach" required minlength="10" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="coach2" required autocomplete="new-password"></label>
      <h3 class="form-sec">Team password</h3>
      <p class="muted small" style="margin-bottom:10px">Shared with players. Shows the schedule, squad names, lineups and notices only. At least 8 characters.</p>
      <label class="field-l"><span>Team password</span><input type="password" name="team" required minlength="8" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="team2" required autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" name="remember" checked> Keep me signed in on this phone</label>
      <button class="btn primary block" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Setting up…' : 'Create team'}</button>
    </form>
    <button class="link-btn" data-act="lock-mode" data-mode="coach">Back</button>`;
}

/* ---------- Home ---------- */
/* ---------- Home ---------- */
// The coach's command centre: pick the clubs or team to look at, the one thing that matters most, the
// next two weeks, the loose ends, and (for one team) how it's going. Everything comes from M.homeView,
// worked out fresh from the teams' records. Nothing here switches the team being edited: that only
// happens when the coach picks a team or opens something that belongs to another team.
const HOME_LEVEL = { 1: 'Critical', 2: 'Imminent', 3: 'Upcoming', 4: 'Next up' };
const HOME_OPEN = { match: 'Open match', session: 'Open training', task: 'Open task', tournament: 'See the draw', rules: 'Review the update', result: 'Enter the result', messages: 'Open message log' };
const HOME_KIND = { match: ['Match', 'k-match'], session: ['Training', 'k-train'], task: ['Help needed', 'k-task'], tournament: ['Tournament', 'k-event'] };
const homePref = () => readJson('tm-home-scope');
const homeDays = () => [7, 14, 30].includes(Number(store.get('tm-home-days'))) ? Number(store.get('tm-home-days')) : 14;
// Club colours are words ("red and white"); the first two known colours make the badge, otherwise a
// colour from the app's own palette, the same one every time for that club.
const COLOUR_WORDS = { red: '#C8102E', maroon: '#7A1F2B', white: '#FFFFFF', black: '#16201B', blue: '#1F4FA3', navy: '#1B2A4A', sky: '#5AA9E6', green: '#2F7D4E', gold: '#E3A400', yellow: '#F2C200', orange: '#E87722', purple: '#5B2C83', grey: '#6B756F', gray: '#6B756F' };
const CREST_PALETTE = ['#123D2B', '#174E87', '#B01D30', '#6E5000', '#55399A', '#2F7D4E'];
const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const clubBadge = c => c ? { id: c.id, name: c.name, short: c.shortName || c.short || c.name, colours: c.colours, logo: c.logo } : null;
function crest(c, big = false) {
  if (!c) return `<span class="crest all${big ? ' big' : ''}" aria-hidden="true">All</span>`;
  if (M.validLogo(c.logo)) return `<span class="crest logo${big ? ' big' : ''}" aria-hidden="true"><img src="${c.logo}" alt=""></span>`;
  const words = String(c.colours || '').toLowerCase().match(/[a-z]+/g) || [], cols = [...new Set(words.map(w => COLOUR_WORDS[w]).filter(Boolean))];
  const bg = cols[0] || CREST_PALETTE[[...String(c.id)].reduce((n, ch) => n + ch.charCodeAt(0), 0) % CREST_PALETTE.length];
  let fg = cols[1] || '#FFFFFF'; if (contrast(bg, fg) < 3) fg = contrast(bg, '#FFFFFF') >= 3 ? '#FFFFFF' : '#16201B';
  const parts = String(c.short || c.name || '').replace(/\b(oztag|club|football|rugby|league|tag|inc|fc)\b/gi, '').trim().split(/\s+/).filter(Boolean);
  const ini = c.id === M.NO_CLUB ? '–' : parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || c.name || '?').slice(0, 2);
  return `<span class="crest${big ? ' big' : ''}" style="background:${bg};color:${fg}${bg === '#FFFFFF' ? ';border-color:var(--line)' : ''}" aria-hidden="true">${esc(ini.toUpperCase())}</span>`;
}
const urgencyDot = u => u ? `<span class="u-dot ${u}" aria-hidden="true"></span><span class="sr-only">${u === 'critical' ? ', needs attention now' : ', needs attention soon'}</span>` : '';
function homeSelector(hv) {
  const T = data.team, club = M.clubOf(ws, data);
  if (!hv.multi) return `<div class="scope single">${crest(club ? clubBadge(club) : { id: M.NO_CLUB, name: 'No club' }, true)}
    <span class="grow"><span class="name" style="display:block">${esc(T.name || 'Team')}</span><span class="sub" style="display:block">${esc([club && club.name, T.division, T.season].filter(Boolean).join(' · ') || 'Not in a club')}</span></span></div>`;
  const sc = hv.scope, clubOfScope = sc.kind === 'club' ? sc.id : sc.kind === 'team' ? (hv.clubs.find(c => c.teams.some(t => t.id === sc.id)) || {}).id : null;
  const clubUrg = c => c.teams.some(t => hv.urgency[t.id] === 'critical') ? 'critical' : c.teams.some(t => hv.urgency[t.id] === 'soon') ? 'soon' : '';
  const clubBtn = c => `<button class="scope-club" data-act="home-scope" data-kind="club" data-id="${esc(c.id)}" aria-pressed="${sc.kind === 'club' && sc.id === c.id}" ${clubOfScope === c.id ? 'data-open="1"' : ''} title="${esc(c.name)}">${crest(c)}<span class="scope-name">${esc(c.short)}</span>${urgencyDot(clubUrg(c))}</button>`;
  const teams = clubOfScope ? (hv.clubs.find(c => c.id === clubOfScope) || { teams: [] }).teams : hv.clubs.flatMap(c => c.teams);
  const teamBtn = t => `<button class="scope-team" data-act="home-scope" data-kind="team" data-id="${esc(t.id)}" aria-pressed="${sc.kind === 'team' && sc.id === t.id}" title="${esc(M.teamName(t))}"><span class="scope-name">${esc(M.teamName(t))}</span>${t === data ? '<span class="sr-only"> (the team you’re editing)</span>' : ''}${urgencyDot(hv.urgency[t.id])}</button>`;
  return `<nav class="scope" aria-label="Clubs and teams on Home">
    <div class="scope-row">
      <button class="scope-club" data-act="home-scope" data-kind="all" aria-pressed="${sc.kind === 'all'}">${crest(null)}<span class="scope-name">All clubs</span></button>
      ${hv.clubs.map(clubBtn).join('')}
    </div>
    <div class="scope-row teams" aria-label="${clubOfScope ? esc((hv.clubs.find(c => c.id === clubOfScope) || {}).name || '') + ' teams' : 'All teams'}" role="group">${teams.map(teamBtn).join('')}</div>
  </nav>`;
}
const homeWhen = x => x.date ? `${x.days === 0 ? 'Today' : x.days === 1 ? 'Tomorrow' : fmtDay(x.date)}, ${x.start ? fmtTime(x.start) : 'time TBC'}` : '';
function homeWhy(x) {
  if (x.level === 1) return 'Less than 24 hours away and not ready.';
  if (!x.date) return 'Waiting on you. There’s no deadline, but it’s still open.';
  if (x.level === 2) return x.issues.length ? 'Within the next 72 hours, with things still to sort.' : x.kind === 'session' ? 'Within the next 24 hours.' : 'Within the next 72 hours.';
  if (x.level === 3) return x.kind === 'task' ? 'Coming up and still short of people.' : 'Within the next 7 days.';
  return 'The next thing on the schedule.';
}
// A dashboard button keeps the team its record belongs to; home-go switches to that team first.
const goAttrs = (x, act, id) => `data-act="home-go" data-team="${esc(x.teamId)}" data-go="${esc(act)}" data-id="${esc(id)}"${x.k ? ` data-k="${esc(x.k)}"` : ''}${x.tab ? ` data-tab="${esc(x.tab)}"` : ''}`;
function homeSpotlight(hv) {
  const x = hv.spotlight;
  if (!x) return `<section class="focus calm" aria-labelledby="spot-h"><h2 id="spot-h">Nothing coming up</h2>
    <p class="spot-what">No training, matches or tasks ${hv.scope.kind === 'all' ? 'for any team' : hv.scope.kind === 'club' ? 'for this club’s teams' : 'for this team'} yet.</p>
    ${hv.scope.kind === 'team' && hv.scope.id === data.id ? `<div class="btn-row"><button class="btn primary" data-act="add-session">${icon('plus')}Add training</button><button class="btn" data-act="tab" data-tab="matches">Matches</button></div>` : ''}</section>`;
  const who = [x.team, hv.multi && x.club ? x.club : ''].filter(Boolean).join(' · ');
  const share = x.kind === 'match' ? `<button class="btn sm on-dark" data-act="home-go" data-team="${esc(x.teamId)}" data-go="day-share" data-date="${esc(x.date)}">${icon('chat', 18)}Send match day</button>` : '';
  return `<section class="focus lvl-${x.level}" aria-labelledby="spot-h">
    <p class="spot-k"><span class="lvl-pill">${HOME_LEVEL[x.level]}</span>${hv.multi ? `<span>${esc(who)}</span>` : ''}</p>
    <h2 id="spot-h">${esc(x.label)}</h2>
    <p class="spot-what">${[x.kind === 'session' ? '' : `<b>${esc(x.title)}</b>`, x.comp ? esc(x.comp) : '', x.round ? esc(x.round) : '', x.date ? esc(homeWhen(x)) : '', x.place ? esc(x.place) : ''].filter(Boolean).join(' · ')}</p>
    <p class="spot-why">${esc(homeWhy(x))}</p>
    ${x.issues.length ? `<ul class="spot-issues">${x.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
    <div class="btn-row"><button class="btn primary" ${goAttrs(x, x.act, x.id)}>${HOME_OPEN[x.kind]}${x.teamId !== data.id ? `<span class="sr-only"> for ${esc(x.team)}</span>` : ''}</button>${share}${x.compId && x.act !== 'comp-open' ? `<button class="btn sm on-dark" ${goAttrs(x, 'comp-open', x.compId)}>${esc(x.comp)}</button>` : ''}</div>
  </section>`;
}
function homeUpcoming(hv) {
  const days = homeDays(), all = state.homeAllUp, list = all ? hv.upcoming : hv.upcoming.slice(0, 5);
  const named = new Map(); hv.teams.forEach(t => named.set(M.teamName(t), (named.get(M.teamName(t)) || 0) + 1));
  const dup = n => named.get(n) > 1;   // two teams with the same name: add the club
  const teamOf = x => hv.teams.length > 1 ? `${x.team}${dup(x.team) && x.club ? ` (${x.club})` : ''}` : '';
  const row = x => { const [k, cls] = HOME_KIND[x.kind] || ['', ''];
    const meta = [teamOf(x), x.comp, x.place].filter(Boolean).join(' · ');
    return `<li><button class="tl-row" ${goAttrs(x, x.act, x.id)}>
      <span class="tl-when"><b>${x.days === 0 ? 'Today' : x.days === 1 ? 'Tmrw' : esc(parseDate(x.date).toLocaleDateString('en-AU', { weekday: 'short' }) + ' ' + parseDate(x.date).getDate())}</b><span>${x.start ? esc(fmtTime(x.start)) : 'Time TBC'}</span></span>
      <span class="tl-main"><span class="tl-top"><span class="ag-kind ${cls}">${k}</span><span class="t">${esc(x.title)}</span></span>
        ${meta ? `<span class="sub tl-meta">${esc(meta)}</span>` : ''}
        ${x.issues.length ? `<span class="tl-issue">${esc(x.issues.join(' · '))}</span>` : ''}</span>
      <span aria-hidden="true" class="chev">›</span></button>
      ${x.subs.map(s => `<button class="tl-sub" ${goAttrs(s, s.act, s.id)}><span aria-hidden="true">↳</span> ${esc(s.title)}${s.issues.length ? ` · <span class="tl-issue">${esc(s.issues.join(' · '))}</span>` : ' · covered'}</button>`).join('')}</li>`; };
  return `<section class="sec home-up" aria-labelledby="up-h"><div class="sec-h"><h2 id="up-h">Coming up</h2>
      <div class="seg mini" role="group" aria-label="How far ahead">${[7, 14, 30].map(d => `<button data-act="home-days" data-v="${d}" aria-pressed="${days === d}">${d} days</button>`).join('')}</div></div>
    ${list.length ? `<ol class="tl">${list.map(row).join('')}</ol>` : `<p class="muted small">Nothing in the next ${days} days.</p>`}
    <div class="tl-foot">${hv.upcoming.length > 5 ? `<button class="link-btn" data-act="home-more">${all ? 'Show fewer' : `Show all ${hv.upcoming.length}`}</button>` : ''}<button class="link-btn" data-act="tab" data-tab="agenda">Full schedule${hv.teams.length > 1 ? ` for ${esc(data.team.name)}` : ''}</button></div>
    ${hv.changed.length ? `<p class="hint tl-changed"><b>Changed:</b> ${hv.changed.map(c => `<button class="link-btn inline" ${goAttrs(c, c.act, c.id)}>${esc(c.title)}, ${esc(fmtDay(c.date))}${hv.teams.length > 1 ? ` (${esc(c.team)})` : ''}: ${esc(c.status.toLowerCase())}</button>`).join('; ')}</p>` : ''}
  </section>`;
}
function homeActionList(hv) {
  const list = hv.actions.slice(0, 5), more = hv.actions.length - list.length;
  const sub = a => [hv.teams.length > 1 ? a.team : '', a.what, a.date ? fmtDay(a.date) : ''].filter(Boolean).join(' · ');
  return `<section class="sec home-act" aria-labelledby="act-h"><div class="sec-h"><h2 id="act-h">Outstanding actions</h2>${more > 0 ? '<button class="btn sm" data-act="tab" data-tab="reports">All loose ends</button>' : ''}</div>
    ${list.length ? `<div class="list">${list.map(a => `<button class="pick act-row lvl-${a.level}" ${goAttrs(a, a.act, a.recId)}><span class="u-dot l${a.level}" aria-hidden="true"></span><span class="grow"><span class="name" style="display:block">${a.level <= 2 ? `<span class="sr-only">${HOME_LEVEL[a.level]}: </span>` : ''}${esc(a.title)}</span><span class="tagline">${esc(sub(a))}</span></span><span aria-hidden="true" class="chev">›</span></button>`).join('')}</div>
      ${more > 0 ? `<p class="hint">And ${more} more.</p>` : ''}`
      : `<p class="muted small all-clear">${icon('check', 18)} ${hv.featured ? 'Nothing else requiring attention.' : 'Nothing requiring attention.'}</p>`}</section>`;
}
function sparkBars(vals, max) {
  if (!vals.length) return '';
  const w = 8, gap = 4, h = 22, top = Math.max(1, max);
  return `<svg class="spark" width="${vals.length * (w + gap) - gap}" height="${h}" viewBox="0 0 ${vals.length * (w + gap) - gap} ${h}" aria-hidden="true">${vals.map((v, i) => { const bh = Math.max(2, Math.round(h * Math.min(1, v / top))); return `<rect x="${i * (w + gap)}" y="${h - bh}" width="${w}" height="${bh}" rx="2"/>`; }).join('')}</svg>`;
}
function homeInsight(hv) {
  const s = hv.insight, t = hv.teams[0]; if (!s || !t) return '';
  const it = k => hv.items.find(x => x.kind === k && x.teamId === t.id);
  const ns = it('session'), nm = it('match'), r = s.record, ev = s.event;
  const cell = (dt, dd, sub = '') => `<div><dt>${dt}</dt><dd>${dd}</dd>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  return `<section class="sec home-ins" aria-labelledby="ins-h"><div class="sec-h"><h2 id="ins-h">${esc(M.teamName(t))} at a glance</h2>${t === data ? '<button class="btn sm" data-act="tab" data-tab="reports">Reports</button>' : ''}</div>
    <dl class="ins-grid">
      ${cell('Available', s.players ? `${s.available} of ${s.players}` : 'No squad yet', s.players ? esc([s.injured ? `${s.injured} injured` : '', s.unavailable ? `${s.unavailable} unavailable` : '', `${s.female} F · ${s.male} M`].filter(Boolean).join(' · ')) : '')}
      ${cell('Next training', ns ? esc(homeWhen(ns)) : 'None booked', ns && ns.place ? esc(ns.place) : '')}
      ${cell('Next match', nm ? esc(homeWhen(nm)) : 'None scheduled', nm ? esc(nm.title) : '')}
      ${cell('Training turnout', s.avgPct === null ? 'Not recorded' : `${s.avgPct}%`, s.attendance.length ? `${sparkBars(s.attendance.map(a => a.attended), s.players)}<span class="sr-only">Last ${s.attendance.length} roll calls: ${s.attendance.map(a => a.attended).join(', ')}</span>` : 'Take a roll call at training')}
      ${cell('Results', r.withResult ? `W ${r.won} · L ${r.lost}${r.drawn ? ` · D ${r.drawn}` : ''}` : 'No results yet')}
      ${ev ? cell(esc(ev.name), ev.state === 'before' ? `${ev.days} day${ev.days === 1 ? '' : 's'}` : ev.state === 'during' ? 'On now' : 'Finished', esc(fmtDay(ev.start))) : ''}
    </dl></section>`;
}
function homeNotices(n) {
  const notices = V.notices.slice(0, n);
  return notices.length ? `<section class="sec"><div class="sec-h"><h2>Notices</h2>${isCoach() ? '<button class="btn sm" data-act="tab" data-tab="messages">Manage</button>' : ''}</div>
      <div class="list">${notices.map(n => `<div class="notice"><span class="sub">${esc(fmtStamp(n.at))}</span><p>${esc(n.text)}</p></div>`).join('')}</div></section>` : '';
}
function startSquad() {
  return `<section class="empty start-squad">
      <h3>Start with your squad</h3>
      <p>Add your players first. Roll call, lineups and messages all build on the squad list.</p>
      <div class="btn-row"><button class="btn primary" data-act="add-player">${icon('plus')}Add a player</button><button class="btn" data-act="bulk-add">Paste a list</button></div>
      <p class="hint" style="margin-top:14px">Just exploring? <button class="link-btn inline" data-act="sample">Load a sample squad</button>. Clear it in Settings before you invite players.</p>
    </section>`;
}
// An active competition on Home: where it's up to, our results so far, today's matches (a tournament
// day), the next match and the last result. Players get the same for their own team.
const TROPHY = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>';
function phaseText(ph) {
  return ph.kind === 'day' ? `Day ${ph.n} of ${ph.of}` : ph.kind === 'week' ? `Week ${ph.n} of ${ph.of}` : ph.kind === 'before' ? `Starts in ${ph.days} day${ph.days === 1 ? '' : 's'}` : ph.kind === 'after' ? 'Finished' : '';
}
function liveCard(lc, coach) {
  const c = lc.comp, many = lc.rows.length > 1, phase = phaseText(lc.phase);
  const go = (r, act, id) => coach ? `data-act="home-go" data-team="${esc(r.teamId)}" data-go="${act}" data-id="${esc(id)}"` : '';
  const when = m => [m.date === todayISO() ? '' : fmtDay(m.date), m.start ? fmtTime(m.start) : 'time TBC', m.field ? `Field ${m.field}` : ''].filter(Boolean).join(' · ');
  const rows = lc.rows.map(r => {
    const rec = r.record, tag = coach ? 'button' : 'div';
    const today = r.today.map(m => { const res = resultText(m), o = M.matchOutcome(m);
      return `<li><${tag} class="cl-match" ${go(r, 'match-open', m.id)}><span class="cl-time">${m.start ? esc(fmtTime(m.start)) : 'TBC'}</span><span class="grow"><b>vs ${esc(m.opponent || 'TBC')}</b><small>${esc([m.field && `Field ${m.field}`, m.round].filter(Boolean).join(' · ') || 'Field TBC')}</small></span>${res ? `<span class="cl-res ${o}">${esc(res)}</span>` : m.status !== 'scheduled' ? `<span class="cl-res">${esc(M.MATCH_STATUS[m.status])}</span>` : ''}</${tag}></li>`; }).join('');
    const next = r.next && !r.today.includes(r.next) ? `<${tag} class="cl-line" ${go(r, 'match-open', r.next.id)}><span class="cl-lbl">Next</span><span><b>vs ${esc(r.next.opponent || 'TBC')}</b> · ${esc(when(r.next))}${r.next.round ? ` · ${esc(r.next.round)}` : ''}</span></${tag}>` : '';
    const last = r.last && !r.today.includes(r.last) ? `<${tag} class="cl-line" ${go(r, 'match-open', r.last.id)}><span class="cl-lbl">Last</span><span>vs ${esc(r.last.opponent || 'TBC')} · <b>${esc(resultText(r.last))}</b></span></${tag}>` : '';
    return `<div class="cl-team">${many ? `<p class="cl-tname">${esc(r.team)}${r.entry.division ? ` · ${esc(r.entry.division)}` : ''}</p>` : ''}
      <dl class="cl-rec"><div><dt>Won</dt><dd>${rec.won}</dd></div><div><dt>Drawn</dt><dd>${rec.drawn}</dd></div><div><dt>Lost</dt><dd>${rec.lost}</dd></div><div><dt>For–against</dt><dd>${rec.scoredGames ? `${rec.scored}–${rec.conceded}` : '–'}</dd></div></dl>
      ${today ? `<p class="cl-lbl" style="margin-top:10px">Today</p><ol class="cl-day">${today}</ol>` : ''}${next}${last}${r.fixtures ? '' : '<p class="cl-line">No fixtures linked to it yet.</p>'}</div>`;
  }).join('');
  return `<section class="comp-live" aria-labelledby="cl-${esc(c.id)}">
    <div class="cl-head"><span class="cl-trophy">${TROPHY}</span><div class="grow"><p class="cl-k"><span class="cl-dot" aria-hidden="true"></span>Live${M.COMP_FORMATS[c.format] ? ` · ${esc(M.COMP_FORMATS[c.format])}` : ''}${phase ? ` · ${esc(phase)}` : ''}</p>
      <h2 id="cl-${esc(c.id)}">${esc(c.name)}</h2><p class="cl-sub">${esc([!many && lc.rows[0].entry.division, c.venue, c.start ? compDates(c) : ''].filter(Boolean).join(' · '))}</p></div></div>
    ${rows}
    ${coach ? `<button class="btn sm on-dark cl-open" data-act="home-go" data-team="${esc(lc.rows[0].teamId)}" data-go="comp-open" data-id="${esc(c.id)}">Open competition</button>` : ''}
  </section>`;
}
function viewHome() {
  if (!isCoach()) return playerHome();
  const hv = M.homeView(ws, homePref(), new Date(), { days: homeDays() });
  const one = hv.scope.kind === 'team' && hv.teams[0] === data;
  const live = M.liveComps(ws, hv.teams, new Date()).map(lc => liveCard(lc, true)).join('');
  const left = (one && !M.activeLens(data).players.length ? startSquad() : '') + homeSpotlight(hv) + live + homeUpcoming(hv);
  const right = homeActionList(hv) + (hv.insight ? homeInsight(hv) : '') + (one ? homeNotices(3) : '');
  return `${homeSelector(hv)}<div class="cols home-cols"><div class="col">${left}</div><div class="col">${right}</div></div>`;
}
// Players see their own team only: what's next, the next two weeks, notices and where help is needed.
function playerHome() {
  const T = V.team, club = curClub(), today = todayISO();
  const strip = `<div class="scope single">${crest(club ? clubBadge(club) : { id: M.NO_CLUB, name: 'No club' }, true)}
    <span class="grow"><span class="name" style="display:block">${esc(T.name || 'Team')}</span><span class="sub" style="display:block">${esc([club && club.name, T.division, T.event && countdown() && countdown().state === 'before' ? `${T.event} in ${countdown().days} days` : T.event].filter(Boolean).join(' · '))}</span></span></div>`;
  if (!V.players.length) return strip + homeNotices(10) + `<p class="muted">The squad hasn't been announced yet.</p>`;
  const items = M.agenda(V, today, 14).filter(it => !it.cancelled && it.kind !== 'task');   // tasks are under Help needed
  const next = items[0], rest = items.slice(1);
  const spot = next ? `<section class="focus lite" aria-labelledby="spot-h"><p class="spot-k"><span class="lvl-pill">Next up</span></p>
      <h2 id="spot-h">${next.kind === 'match' ? `Match ${next.date === today ? 'today' : next.date === M.addDays(today, 1) ? 'tomorrow' : esc(fmtDay(next.date))}` : `Training ${next.date === today ? 'today' : next.date === M.addDays(today, 1) ? 'tomorrow' : esc(fmtDay(next.date))}`}</h2>
      <p class="spot-what">${next.kind === 'match' ? `<b>vs ${esc(next.x.opponent || 'TBC')}</b> · ` : ''}${next.start ? esc(fmtTime(next.start)) : 'Time TBC'}${(next.x.venue || (next.kind === 'session' && T.trainingVenue)) ? ` · ${esc(next.x.venue || T.trainingVenue)}` : ''}${next.x.field ? ` · Field ${esc(next.x.field)}` : ''}</p>
      ${replyBtns(next.kind, next.x)}</section>`
    : `<section class="focus calm" aria-labelledby="spot-h"><h2 id="spot-h">Nothing scheduled yet</h2><p class="spot-what">Training and matches show here once your coach adds them.</p></section>`;
  const fresh = rulesUnseen();
  const rules = fresh.length ? `<div class="note rules-new">${esc(fresh[0].notice || fresh[0].summary)} <button class="link-btn inline" data-act="rules-open">See the rules</button></div>` : '';
  const up = `<section class="sec home-up" aria-labelledby="up-h"><div class="sec-h"><h2 id="up-h">Coming up</h2><button class="btn sm" data-act="tab" data-tab="agenda">Full schedule</button></div>
    ${rest.length ? `<div class="list">${rest.slice(0, 5).map(agendaItem).join('')}</div>` : `<p class="muted small">Nothing else in the next two weeks.</p>`}</section>`;
  const live = M.liveCompsForTeam(V, new Date()).map(lc => liveCard(lc, false)).join('');
  return `${strip}<div class="cols home-cols"><div class="col">${spot}${live}${rules}${up}</div><div class="col">${homeNotices(10)}${homeTasks()}</div></div>`;
}
function calBlock(date) {
  const d = parseDate(date);
  return `<div class="cal" aria-hidden="true"><span class="dow">${d.toLocaleDateString('en-AU', { weekday: 'short' })}</span><span class="d">${d.getDate()}</span><span class="mo">${d.toLocaleDateString('en-AU', { month: 'short' })}</span></div>`;
}
/* ---------- Squad ---------- */
function viewSquad() {
  const P = V.players;
  if (!P.length) return isCoach()
    ? `<section class="empty"><h3>No players yet</h3><p>Add players one by one, or paste a whole list from a spreadsheet or the team chat.</p>
      <div class="btn-row"><button class="btn primary" data-act="add-player">${icon('plus')}Add a player</button><button class="btn" data-act="bulk-add">Paste a list</button></div></section>`
    : `<p class="muted">The squad hasn't been announced yet.</p>`;
  const cnt = { all: P.length, F: P.filter(p => p.gender === 'F').length, M: P.filter(p => p.gender === 'M').length, out: P.filter(p => p.status && p.status !== 'available').length };
  if (!isCoach() && state.squadFilter === 'out') state.squadFilter = 'all';
  const chip = (k, l) => `<button class="chip" data-act="squad-filter" data-f="${k}" aria-pressed="${state.squadFilter === k}">${l} (${cnt[k]})</button>`;
  return `<div class="sec-h"><h2>Squad</h2>${isCoach() ? `<div class="btn-row"><button class="btn sm" data-act="bulk-add">Paste list</button><button class="btn primary sm" data-act="add-player">${icon('plus', 18)}Add</button></div>` : ''}</div>
    <input type="text" placeholder="Search players" aria-label="Search players" data-input="squad-search" value="${esc(state.squadSearch)}" style="margin-bottom:10px">
    <div class="chips">${chip('all', 'All')}${chip('F', 'Female')}${chip('M', 'Male')}${isCoach() ? chip('out', 'Injured / unavailable') : ''}</div>
    <div id="squad-list">${squadList()}</div>
    ${isCoach() ? '<p class="hint">Percentages are training attendance from roll calls. Tap a player to edit. Players only see names, numbers and positions.</p>' : ''}`;
}
function squadList() {
  const q = state.squadSearch.trim().toLowerCase();
  const list = sortedPlayers().filter(p => {
    if (state.squadFilter === 'F' && p.gender !== 'F') return false;
    if (state.squadFilter === 'M' && p.gender !== 'M') return false;
    if (state.squadFilter === 'out' && (!p.status || p.status === 'available')) return false;
    if (q && !(p.name.toLowerCase().includes(q) || String(p.number || '').includes(q))) return false;
    return true;
  });
  if (!list.length) return `<p class="muted" style="padding:12px 0">No players match.</p>`;
  return `<div class="list grid">${list.map(p => {
    const main = `${playerPic(p)}
      <span class="grow"><span class="name" style="display:block">${esc(p.name)} ${gBadge(p)}${statusPill(p)}</span><span class="sub" style="display:block">${esc(p.positions.join(', ') || 'No positions set')}</span></span>`;
    if (!isCoach()) return `<div class="row"><div class="row-main">${main}</div></div>`;
    const st = playerStats(p.id);
    return `<div class="row">
      <button class="row-main" data-act="edit-player" data-id="${p.id}">${main}
        <span class="pct">${st.pct === null ? '<small>–</small>' : st.pct + '<small>%</small>'}</span>
      </button>
      ${p.phone ? `<button class="icon-btn" style="color:var(--wa)" data-act="wa-player" data-id="${p.id}" aria-label="WhatsApp ${esc(p.name)}">${icon('chat', 22)}</button>` : `<span style="width:44px"></span>`}
    </div>`;
  }).join('')}</div>`;
}
function playerForm(p) {
  const isNew = !p; p = p || { name: '', gender: '', number: '', phone: '', positions: [], status: 'available', notes: '' };
  const st = p.id ? playerStats(p.id) : null;
  return `<form data-form="player" autocomplete="off">
    <input type="hidden" name="id" value="${esc(p.id || '')}">
    <div class="photo-row"><span class="photo-prev">${playerPic(p, true)}</span>
      <div class="grow"><label class="field-l" style="margin-bottom:6px"><span>Name</span><input type="text" name="name" required value="${esc(p.name)}" autocapitalize="words"></label>
      <div class="btn-row" style="margin:0"><label class="btn sm file-btn"><input type="file" accept="image/*" data-change="player-photo" aria-label="Choose a photo of the player">${p.photo ? 'Change photo' : 'Add photo'}</label><button type="button" class="btn sm" data-act="player-photo-clear" ${p.photo ? '' : 'hidden'}>Remove photo</button></div></div></div>
    <input type="hidden" name="photo" value="${esc(p.photo || '')}">
    <p class="hint" style="margin:-2px 0 12px">The photo helps you put names to faces. It stays in the coach’s copy; players never see it.</p>
    <div class="field-l"><span>Gender</span><div class="opts">
      <label class="opt"><input type="radio" name="gender" value="F" ${p.gender === 'F' ? 'checked' : ''}><span>Female</span></label>
      <label class="opt"><input type="radio" name="gender" value="M" ${p.gender === 'M' ? 'checked' : ''}><span>Male</span></label>
    </div><small>Used for the mixed ratio check on the lineup screen.</small></div>
    <div class="two">
      <label class="field-l"><span>Jersey no.</span><input type="text" name="number" inputmode="numeric" maxlength="3" value="${esc(p.number)}"></label>
      <label class="field-l"><span>Status</span><select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <label class="field-l"><span>Mobile</span><input type="tel" name="phone" placeholder="04xx xxx xxx" value="${esc(p.phone)}"><small>Coach only. For messaging them directly on WhatsApp.</small></label>
    <div class="field-l"><span>Preferred positions</span><div class="opts">
      ${[...new Set([...M.positionsFor(data.team, M.clubOf(ws, data)), ...arr(p.positions)])].map(x => `<label class="opt"><input type="checkbox" name="positions" value="${esc(x)}" ${p.positions.includes(x) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}
    </div><small>${esc(M.teamSport(data.team, M.clubOf(ws, data)))} positions. Change the list in Settings › Team.</small></div>
    <label class="field-l"><span>Notes</span><input type="text" name="notes" value="${esc(p.notes)}" placeholder="Coach only, e.g. works Thursdays"></label>
    ${isNew ? '' : jerseyBlock(p)}
    ${st && st.total ? `<p class="note" style="background:var(--ok-soft)">Training: ${st.att} of ${st.total} sessions (${st.pct}%)${st.late ? `, ${st.late} late` : ''}${st.apol ? `, ${st.apol} apolog${st.apol === 1 ? 'y' : 'ies'}` : ''}.</p>` : ''}
    <div class="btn-row">
      <button class="btn primary" type="submit" value="save">${isNew ? 'Add player' : 'Save changes'}</button>
      ${isNew ? `<button class="btn" type="submit" value="another">Add and next</button>` : ''}
    </div>
    ${!isNew ? `<div class="btn-row" style="margin-top:10px">${p.phone ? `<button type="button" class="btn wa" data-act="wa-player" data-id="${p.id}">${icon('chat', 18)}WhatsApp</button>` : ''}<button type="button" class="btn danger" data-act="delete-player" data-id="${p.id}">Remove from squad</button></div>` : ''}
  </form>`;
}
// The jerseys this player has been given, and (where jerseys are lent) whether each came back.
function jerseyBlock(p) {
  const loans = arr(p.jerseys), lend = !!data.team.jerseyLoan, season = id => (M.findSeason(data, id) || {}).name || 'an earlier season';
  const active = M.activeSeason(data), corrected = active && p.number && M.correctedJersey(p, active.id, p.number);
  const reissue = corrected ? `<button type="button" class="btn sm" data-act="jersey-issue" data-player="${esc(p.id)}">Issue jersey #${esc(p.number)} again</button><small>Previous issue was removed as a mistake; only this action will issue it again.</small>` : '';
  if (!loans.length) return `<div class="jersey-block"><p class="hint" style="margin:-4px 0 14px">${corrected ? 'This issue was corrected and will not reappear on save.' : p.number ? 'Save to record their jersey as given out.' : 'Give them a number and their jersey is recorded as given out.'}</p>${reissue}</div>`;
  return `<div class="field-l jersey-block"><span>Jerseys</span><div class="list jersey-list">${loans.slice().reverse().map(j => `<div class="row">
      <span class="jersey">${esc(j.number || '?')}</span><span class="grow"><span class="name" style="display:block">${j.back ? `Returned ${esc(fmtDay(j.back))}` : lend ? 'With the player' : 'Given out'}</span>
      <span class="tagline">${esc(season(j.seasonId))} · ${j.out ? `out ${esc(fmtDay(j.out))}` : 'date out not recorded'}</span></span>
      ${lend && !j.back ? `<button type="button" class="btn sm" data-act="jersey-back" data-player="${esc(p.id)}" data-id="${esc(j.id)}">Returned</button>` : ''}
      ${j.back ? `<button type="button" class="btn sm" data-act="jersey-undo" data-player="${esc(p.id)}" data-id="${esc(j.id)}">Undo</button>` : ''}
      <button type="button" class="icon-btn" data-act="jersey-del" data-player="${esc(p.id)}" data-id="${esc(j.id)}" aria-label="Remove the jersey ${esc(j.number)} record">${icon('close', 18)}</button></div>`).join('')}</div>
    ${reissue}<small>${lend ? 'Jerseys are lent: mark each one when it comes back. ' : ''}Remove a record only if it was a mistake.</small></div>`;
}
// Jerseys for the season on screen: who has one and, where they're lent, who's handed theirs back.
function jerseyReportHtml() {
  if (!V.viewSeason) return '';
  const r = M.jerseyReport(data, V.viewSeason.id), inventory = M.jerseyInventory(data), lend = !!data.team.jerseyLoan;
  if (!r.rows.length && !inventory.rows.length) return '';
  const status = x => x.status === 'out' ? (lend ? `<span class="pill neutral">With player</span>` : `<span class="pill ok">Given out</span>`) : x.status === 'returned' ? '<span class="pill ok">Returned</span>' : '<span class="pill neutral">No issue this season</span>';
  const seasonTable = r.rows.length ? `<div class="table-wrap"><table class="rtable"><thead><tr><th scope="col">Player</th><th scope="col">Jersey</th><th scope="col">Status</th>${lend ? '<th scope="col"><span class="sr-only">Actions</span></th>' : ''}</tr></thead><tbody>
    ${r.rows.map(x => { const j = x.open[0] || x.season[x.season.length - 1];
      return `<tr><th scope="row">${esc(x.name)}${x.inSquad ? '' : '<small class="muted" style="display:block">Left this squad</small>'}</th><td>${esc(x.open.map(o => '#' + o.number).join(', ') || (j ? '#' + j.number : x.number ? '#' + x.number : '–'))}${j && j.out && x.status === 'out' ? `<small class="muted" style="display:block">since ${esc(fmtDM(j.out))}</small>` : ''}</td><td>${status(x)}</td>
      ${lend ? `<td>${x.open.map(o => `<button class="btn sm" data-act="jersey-back" data-player="${esc(x.id)}" data-id="${esc(o.id)}" aria-label="${esc(x.name)} returned jersey ${esc(o.number)}">Returned</button>`).join(' ')}${x.open.length && (data.players.find(p => p.id === x.id) || {}).phone ? ` <button class="btn sm" data-act="jersey-remind" data-player="${esc(x.id)}" data-season="${esc(V.viewSeason.id)}" aria-label="Remind ${esc(x.name)} to return their jersey">${icon('chat', 16)}</button>` : ''}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>` : '<p class="muted small">No jersey issues recorded for this season.</p>';
  const outstanding = inventory.rows.map(x => `<div class="row"><span class="grow"><span class="name">${esc(x.name)}${x.inSquad ? '' : ' · Former squad member'}</span><span class="sub" style="display:block">${esc(x.open.map(o => '#' + o.number + ' (' + ((M.findSeason(data, o.seasonId) || {}).name || 'earlier season') + ')').join(', '))}</span></span>${lend && (data.players.find(p => p.id === x.id) || {}).phone ? `<button class="btn sm" data-act="jersey-remind" data-player="${esc(x.id)}">Remind</button>` : ''}</div>`).join('');
  return `<section class="sec"><div class="sec-h"><h2>Jerseys · ${esc(V.viewSeason.name)}</h2>${lend && r.out ? `<button class="btn sm" data-act="jersey-share">${icon('copy', 18)}Copy list</button>` : ''}</div>
    <p class="small" style="margin-bottom:8px">${lend ? `<b>${r.out}</b> still out · <b>${r.returned}</b> returned` : `<b>${r.out}</b> given out`} · ${r.none} without an issue this season${r.gone ? ` · ${r.gone} former squad member${r.gone === 1 ? '' : 's'} still holding a jersey issued in this season` : ''}.</p>
    ${seasonTable}
    <p class="hint">This season only: return status belongs to the season in which the jersey was issued.</p>
    <details class="more"><summary>Currently outstanding across all seasons (${inventory.outstanding} jersey${inventory.outstanding === 1 ? '' : 's'}${inventory.formerPlayers ? `, ${inventory.formerPlayers} former player${inventory.formerPlayers === 1 ? '' : 's'}` : ''})</summary>
      <div class="list">${outstanding || '<p class="muted small">All issued jerseys have been returned.</p>'}</div>
    </details>
    <p class="hint">${lend ? 'Returns may be marked on a player card or against a season issue.' : 'Turn on lent jerseys in Settings › Team to track returns.'}</p></section>`;
}
function bulkForm() {
  return `<form data-form="bulk">
    <p class="muted small" style="margin-bottom:10px">One player per line. Add F or M for gender, and a mobile number or jersey number if you have them, in any order, separated by commas.</p>
    <textarea name="lines" rows="10" placeholder="Mia Tuala, F, 0412 345 678&#10;Josh Halloran, M, 7&#10;Ava Kelleher, F"></textarea>
    <button class="btn primary block" type="submit" style="margin-top:12px">Add players</button>
  </form>`;
}

/* ---------- Training ---------- */
/* ----- RSVPs: what players said they'd do, kept apart from the roll call ----- */
const RSVP_SHORT = { yes: 'Yes', maybe: 'Unsure', no: 'No' };
const rsvpTarget = (kind, id) => kind === 'match' ? matchById(id) : sessionById(id);
const asking = rec => Object.keys(obj(rec && rec.rsvp)).length > 0;
function rsvpPills(rec) {
  const c = M.rsvpCounts(rec, V.players);
  return `<span class="pill ok">${c.yes} attending</span>${c.maybe ? ` <span class="pill neutral">${c.maybe} unsure</span>` : ''}${c.no ? ` <span class="pill bad">${c.no} not attending</span>` : ''} <span class="pill neutral">${c.none} no reply</span>`;
}
function rsvpBody(kind, id) {
  const rec = rsvpTarget(kind, id); if (!rec) return '';
  const players = data.players.slice().sort((a, b) => (a.status === 'available' ? 0 : 1) - (b.status === 'available' ? 0 : 1) || a.name.localeCompare(b.name));
  return `<p class="muted small" style="margin-bottom:8px">${esc(fmtLong(rec.date))}${rec.start ? ', ' + esc(fmtTime(rec.start)) : ''}. What each player said they’d do${kind === 'session' ? '. The roll call records who actually came' : ''}.</p>
    <div class="roll-sum" id="rsvp-sum">${rsvpPills(rec)}</div>
    ${players.length ? `<div class="list">${players.map(p => { const v = M.rsvpOf(rec, p.id); return `<div class="roll-row" data-row="${p.id}">
      <span class="grow"><span class="name" style="display:block">${esc(p.name)} ${gBadge(p)}</span>${p.status !== 'available' ? `<span class="pill ${p.status}">${STATUS[p.status]}</span>` : ''}</span>
      <span class="roll-btns" role="group" aria-label="${esc(p.name)}’s reply">${['yes', 'maybe', 'no'].map(k => `<button class="rb r-${k}" data-act="rsvp" data-k="${kind}" data-id="${rec.id}" data-pid="${p.id}" data-v="${k}" aria-pressed="${v === k}">${RSVP_SHORT[k]}</button>`).join('')}</span>
    </div>`; }).join('')}</div>` : '<p class="muted">Add players in Squad first.</p>'}
    <div class="btn-row" style="margin-top:14px"><button class="btn wa" data-act="rsvp-ask" data-k="${kind}" data-id="${rec.id}">${icon('chat', 18)}Ask for replies</button><button class="btn primary" data-act="close-sheet">Done</button></div>
    <p class="hint">Tap a reply again to clear it. Players reply on WhatsApp and you record it here; nothing changes until you do.</p>`;
}
// Players: a reply goes to the team contact on WhatsApp. It changes nothing in the app.
function replyBtns(kind, rec) {
  if (isCoach() || rec.date < todayISO() || (kind === 'session' && rec.cancelled) || (kind === 'match' && rec.status !== 'scheduled')) return '';
  const c = V.team.tasksContact || {};
  return `<span class="reply-btns" role="group" aria-label="Reply about ${kind === 'match' ? 'this match' : 'this session'}"><span class="small muted">Tell ${esc(c.name ? String(c.name).trim().split(/\s+/)[0] : 'the coach')}:</span>
    <button class="btn sm" data-act="reply" data-k="${kind}" data-id="${rec.id}" data-v="yes">Coming</button><button class="btn sm" data-act="reply" data-k="${kind}" data-id="${rec.id}" data-v="maybe">Not sure</button><button class="btn sm" data-act="reply" data-k="${kind}" data-id="${rec.id}" data-v="no">Can’t</button></span>`;
}
function replyText(kind, rec, v) {
  const c = V.team.tasksContact || {}, hi = c.name ? `Hi ${String(c.name).trim().split(/\s+/)[0]}, ` : 'Hi, ';
  const what = kind === 'match' ? `the match against ${rec.opponent || 'TBC'} on ${fmtDay(rec.date)}${rec.start ? ` (${fmtTime(rec.start)})` : ''}` : `training on ${fmtDay(rec.date)}${rec.start ? ` (${fmtTime(rec.start)})` : ''}`;
  return hi + (v === 'yes' ? `I’m coming to ${what}.` : v === 'no' ? `I can’t make ${what}. ` : `I’m not sure yet about ${what}. `);
}

/* ----- Upcoming: training, matches and tasks together ----- */
function viewAgenda() {
  const items = M.agenda(V, todayISO(), 42), coach = isCoach();
  const days = [];
  items.forEach(it => { const d = days[days.length - 1]; if (d && d.date === it.date) d.items.push(it); else days.push({ date: it.date, items: [it] }); });
  const notices = V.notices.slice(0, 2);
  return `${notices.length ? `<section class="sec"><div class="sec-h"><h2>Latest notices</h2></div><div class="list">${notices.map(n => `<div class="notice"><span class="sub">${esc(fmtStamp(n.at))}</span><p>${esc(n.text)}</p></div>`).join('')}</div></section>` : ''}
    <div class="sec-h"><h2>Next six weeks</h2>${coach ? `<button class="btn sm" data-act="avail-ask">${icon('chat', 18)}Availability check</button>` : ''}</div>
    ${days.length ? days.map(d => `<section class="ag-day" aria-label="${esc(fmtLong(d.date))}"><h3 class="ag-date">${d.date === todayISO() ? 'Today · ' : ''}${esc(fmtLong(d.date))}</h3>
      <div class="list">${d.items.map(agendaItem).join('')}</div></section>`).join('')
      : `<div class="empty"><p>${coach ? 'Nothing in the next six weeks. Add training, a match or a task.' : 'Nothing scheduled in the next six weeks.'}</p></div>`}
    <p class="hint">${coach ? 'Players see this list too, without RSVPs or who is on each task.' : 'Training, matches and jobs that need a hand. Tap a reply to message the coach; it counts once they record it.'}</p>`;
}
function agendaItem(it) {
  const coach = isCoach(), x = it.x;
  if (it.kind === 'session') {
    const info = `<span class="ag-kind k-train">Training</span><span class="t">${esc(fmtRange(x))}</span>${x.cancelled ? ' <span class="pill bad">Cancelled</span>' : ''}
      <span class="sub" style="display:block">${esc(x.venue || V.team.trainingVenue || 'Venue TBC')}${x.focus ? ` · ${esc(x.focus)}` : ''}</span>
      ${coach && !x.cancelled && asking(x) ? `<span class="ag-meta">${rsvpPills(x)}</span>` : ''}`;
    return coach ? `<div class="ag-item"><button class="row-main ag-main" data-act="edit-session" data-id="${x.id}"><span class="grow">${info}</span></button>${x.cancelled ? '' : `<button class="icon-btn" data-act="rsvp-open" data-k="session" data-id="${x.id}" aria-label="Availability for training on ${esc(fmtDay(x.date))}">${icon('rsvp', 22)}</button>`}</div>`
      : `<div class="ag-item"><div class="ag-main"><span class="grow">${info}</span>${replyBtns('session', x)}</div></div>`;
  }
  if (it.kind === 'match') {
    const where = [x.venue, x.field ? `Field ${x.field}` : ''].filter(Boolean).join(' · ');
    const info = `<span class="ag-kind k-match">Match</span><span class="t">vs ${esc(x.opponent || 'TBC')}</span>${x.start ? ` <span class="sub">${esc(fmtTime(x.start))}</span>` : ''}${x.status !== 'scheduled' ? ` <span class="pill ${x.status === 'cancelled' ? 'bad' : 'neutral'}">${esc(M.MATCH_STATUS[x.status])}</span>` : ''}
      ${where ? `<span class="sub" style="display:block">${esc(where)}</span>` : ''}
      ${coach && x.status === 'scheduled' ? `<span class="ag-meta">${rsvpPills(x)}</span>` : ''}`;
    return coach ? `<div class="ag-item"><button class="row-main ag-main" data-act="match-open" data-id="${x.id}"><span class="grow">${info}</span></button></div>`
      : `<div class="ag-item"><div class="ag-main"><span class="grow">${info}</span>${replyBtns('match', x)}</div></div>`;
  }
  const lift = x.kind === 'lift';
  const info = `<span class="ag-kind k-task">${lift ? 'Lifts' : 'Help needed'}</span><span class="t">${esc(x.title)}</span>${x.cancelled ? ' <span class="pill bad">Cancelled</span>' : ''}
    ${taskWhen(x) ? `<span class="sub" style="display:block">${esc(taskWhen(x))}</span>` : ''}${lift ? liftHtml(x) : spotsHtml(x)}`;
  if (coach) return `<div class="ag-item"><button class="row-main ag-main" data-act="task-open" data-id="${x.id}"><span class="grow">${info}</span></button></div>`;
  return `<div class="ag-item"><div class="ag-main"><span class="grow">${info}</span>${taskShort(x) ? `<button class="btn wa sm" data-act="task-help" data-id="${x.id}">${icon('chat', 18)}${lift ? 'I can drive' : 'I can help'}</button>` : ''}</div></div>`;
}
function sessionRow(s) {
  const isPast = s.date < todayISO(), taken = rollTaken(s);
  const info = `<span class="t" style="display:block">${esc(fmtRange(s))}</span>
      <span class="sub" style="display:block">${esc(s.venue || V.team.trainingVenue || 'Venue TBC')}</span>
      ${s.focus ? `<span class="focus" style="display:block">${esc(s.focus)}</span>` : ''}
      ${s.notes && !isCoach() ? `<span class="sub" style="display:block">${esc(s.notes)}</span>` : ''}`;
  if (!isCoach()) return `<div class="sess ${s.cancelled ? 'cancelled' : ''} ${s.date === todayISO() ? 'today' : ''}">${calBlock(s.date)}
    <div class="sess-main">${info}${s.cancelled ? '<span style="display:block;margin-top:4px"><span class="pill bad">Cancelled</span></span>' : ''}${replyBtns('session', s)}</div></div>`;
  const vals = Object.values(s.attendance || {});
  const attended = vals.filter(v => v === 'present' || v === 'late').length, apol = vals.filter(v => v === 'apology').length;
  return `<div class="sess ${s.cancelled ? 'cancelled' : ''} ${s.date === todayISO() ? 'today' : ''}">
    ${calBlock(s.date)}
    <button class="sess-main" data-act="edit-session" data-id="${s.id}">${info}
      <span style="display:block;margin-top:4px">${s.cancelled ? '<span class="pill bad">Cancelled</span>' : taken ? `<span class="pill ok">${attended} attended</span>${apol ? ` <span class="pill neutral">${apol} apolog${apol === 1 ? 'y' : 'ies'}</span>` : ''}` : isPast ? '<span class="pill neutral">No roll taken</span>' : ''}</span>
      ${!s.cancelled && !isPast && asking(s) ? `<span class="ag-meta">${rsvpPills(s)}</span>` : ''}
    </button>
    ${s.cancelled ? '' : `<div class="acts">
      ${!isPast ? `<button class="btn wa sm" data-act="remind" data-id="${s.id}" aria-label="Send reminder for ${esc(fmtDay(s.date))}">${icon('chat', 18)}</button>
      <button class="btn sm" data-act="rsvp-open" data-k="session" data-id="${s.id}" aria-label="Availability for ${esc(fmtDay(s.date))}">${icon('rsvp', 18)}</button>` : ''}
      <button class="btn sm" data-act="roll" data-id="${s.id}" aria-label="Roll call for ${esc(fmtDay(s.date))}">${icon('clip', 18)}</button>
    </div>`}
  </div>`;
}
function viewSchedule() {
  const up = upcomingSessions(), past = pastSessions();
  let h = `<div class="sec-h"><h2>Upcoming</h2>${isCoach() ? `<button class="btn primary sm" data-act="add-session">${icon('plus', 18)}Add training</button>` : ''}</div>`;
  h += up.length ? `<div class="list grid sess-grid">${up.map(sessionRow).join('')}</div>`
    : `<div class="empty"><p>${isCoach() ? 'Nothing scheduled. Add a session — you can repeat it weekly right up to the tournament.' : 'No training scheduled yet.'}</p></div>`;
  if (past.length) {
    h += `<button class="toggle-past" data-act="toggle-past">${state.showPast ? 'Hide' : 'Show'} past sessions (${past.length})</button>`;
    if (state.showPast) h += `<div class="list grid sess-grid">${past.map(sessionRow).join('')}</div>`;
  }
  return h;
}
function sessionForm(s) {
  const isNew = !s, T = data.team;
  s = s || { date: todayISO(), start: T.trainingStart, end: T.trainingEnd, venue: T.trainingVenue, focus: '', notes: '' };
  const until = T.eventStart ? toISODate(new Date(parseDate(T.eventStart).getTime() - 2 * 86400000)) : '';
  return `<form data-form="session">
    <input type="hidden" name="id" value="${esc(s.id || '')}">
    <label class="field-l"><span>Date</span><input type="date" name="date" required value="${esc(s.date)}"></label>
    <div class="two">
      <label class="field-l"><span>Start</span><input type="time" name="start" value="${esc(s.start)}"></label>
      <label class="field-l"><span>Finish</span><input type="time" name="end" value="${esc(s.end)}"></label>
    </div>
    <label class="field-l"><span>Venue</span><input type="text" name="venue" value="${esc(s.venue)}" placeholder="e.g. Ground name, field 3"></label>
    <label class="field-l"><span>Focus</span><input type="text" name="focus" list="focus-ideas" value="${esc(s.focus)}" placeholder="What's this session for?"></label>
    <datalist id="focus-ideas">${FOCUS_IDEAS.map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <label class="field-l"><span>Notes for players</span><input type="text" name="notes" value="${esc(s.notes)}" placeholder="Bring water, boots, both shirts…"></label>
    ${isNew ? `<label class="check"><input type="checkbox" name="repeat" data-change="repeat"> Repeat weekly</label>
      <label class="field-l repeat-until" hidden><span>Repeat until</span><input type="date" name="until" value="${esc(until)}"><small>Creates one session per week up to this date.</small></label>` : ''}
    <button class="btn primary block" type="submit">${isNew ? 'Add training' : 'Save changes'}</button>
    ${!isNew ? `<div class="btn-row" style="margin-top:10px">
      <button type="button" class="btn" data-act="cancel-session" data-id="${s.id}">${s.cancelled ? 'Reinstate session' : 'Mark cancelled'}</button>
      <button type="button" class="btn danger" data-act="delete-session" data-id="${s.id}">Delete</button></div>` : ''}
  </form>`;
}
function rollBody(sid) {
  const s = sessionById(sid); if (!s) return '';
  const players = data.players.slice().sort((a, b) => (a.status === 'available' ? 0 : 1) - (b.status === 'available' ? 0 : 1) || a.name.localeCompare(b.name));
  return `<p class="muted small" style="margin-bottom:8px">${esc(fmtLong(s.date))}, ${esc(fmtRange(s))}</p>
    <div class="roll-sum" id="roll-sum">${rollSummary(s)}</div>
    <div class="btn-row" style="margin-bottom:10px"><button class="btn sm" data-act="mark-all" data-sid="${s.id}">${icon('check', 18)}Everyone unmarked is here</button></div>
    <div class="list">${players.map(p => `<div class="roll-row" data-row="${p.id}" data-state="${s.attendance[p.id] || ''}">
      <span class="grow"><span class="name" style="display:block">${esc(p.name)} ${gBadge(p)}</span>${p.status !== 'available' ? `<span class="pill ${p.status}">${STATUS[p.status]}</span>` : ''}${M.rsvpOf(s, p.id) ? `<span class="tagline said">Said: ${esc(M.RSVP[M.rsvpOf(s, p.id)].toLowerCase())}</span>` : ''}</span>
      <span class="roll-btns">${Object.entries(ROLL).map(([k, l]) => `<button class="rb b-${k}" data-act="mark" data-sid="${s.id}" data-pid="${p.id}" data-s="${k}" aria-label="${esc(p.name)}: ${k}">${l}</button>`).join('')}</span>
    </div>`).join('')}</div>
    <button class="btn primary block" style="margin-top:14px" data-act="roll-done" data-sid="${s.id}">Done</button>
    <p class="hint">Anyone left unmarked is recorded as absent when you tap Done. “Said” is their RSVP; the roll call is kept separately. Attendance is only visible to coaches.</p>`;
}
function rollSummary(s) {
  const v = Object.values(s.attendance);
  const c = k => v.filter(x => x === k).length;
  const unmarked = data.players.length - data.players.filter(p => s.attendance[p.id]).length;
  return `<span class="pill ok">${c('present') + c('late')} here</span>${c('late') ? `<span class="pill neutral">${c('late')} late</span>` : ''}<span class="pill neutral">${c('apology')} apologies</span><span class="pill bad">${c('absent')} absent</span>${unmarked ? `<span class="pill neutral">${unmarked} unmarked</span>` : ''}`;
}
function viewAttendance() {
  const rs = rollSessions();
  if (!rs.length) return `<div class="empty"><h3>No roll calls yet</h3><p>Open a training session and tap the clipboard to mark who's there.</p><button class="btn" data-act="train-view" data-v="schedule">Go to schedule</button></div>`;
  const rows = V.players.map(p => ({ p, st: playerStats(p.id) }))
    .sort((a, b) => (b.st.pct ?? -1) - (a.st.pct ?? -1) || a.p.name.localeCompare(b.p.name));
  const withData = rows.filter(r => r.st.total);
  const avg = withData.length ? Math.round(withData.reduce((t, r) => t + r.st.pct, 0) / withData.length) : 0;
  const last = rs.slice(-10);
  return `<div class="stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:18px">
      <div class="stat"><b>${rs.length}</b><span>Roll calls taken</span></div>
      <div class="stat"><b>${avg}%</b><span>Average attendance</span></div></div>
    <div class="sec-h"><h2>By player</h2></div>
    <div class="list">${rows.map(({ p, st }) => `<div class="bar-row">
      <span class="bar-name"><span class="name">${esc(p.name)}</span>${gBadge(p)}</span>
      <span class="bar" role="img" aria-label="${st.pct ?? 0}%"><i class="${st.pct === null ? '' : st.pct >= 75 ? '' : st.pct >= 50 ? 'mid' : 'low'}" style="width:${st.pct || 0}%"></i></span>
      <span class="small" style="min-width:64px;text-align:right">${st.total ? `<b>${st.att}/${st.total}</b>${st.apol ? ` <span class="muted">(${st.apol}A)</span>` : ''}` : '<span class="muted">–</span>'}</span>
    </div>`).join('')}</div>
    <p class="hint">Late counts as attended. (A) = apologies sent. Only coaches can see attendance.</p>
    <div class="sec-h" style="margin-top:22px"><h2>Last ${last.length} sessions</h2></div>
    <div class="heat"><table><thead><tr><th class="pn"></th>${last.map(s => `<th scope="col">${fmtShort(s.date)}</th>`).join('')}</tr></thead><tbody>
    ${sortedPlayers().map(p => `<tr><th class="pn" scope="row">${esc(shortName(p))}</th>${last.map(s => { const v = s.attendance[p.id] || ''; return `<td class="${v}" title="${esc(p.name)}, ${fmtDay(s.date)}: ${v || 'not recorded'}">${v === 'late' ? 'L' : v === 'apology' ? 'A' : ''}</td>`; }).join('')}</tr>`).join('')}
    </tbody></table>
    <div class="legend"><span><i style="background:var(--ok)"></i>Here</span><span><i style="background:var(--gold)"></i>Late</span><span><i style="background:#AEBACB"></i>Apology</span><span><i style="background:#F2B8C0"></i>Absent</span></div></div>`;
}

/* ---------- Field / lineup ---------- */
function viewField() {
  const lu = curLineup(); state.lineupId = lu.id;
  const onField = lu.slots.map(s => playerById(s.playerId)).filter(Boolean);
  const males = onField.filter(p => p.gender === 'M').length, females = onField.filter(p => p.gender === 'F').length;
  const max = M.maxMalesOf(V.team, curClub());
  const bench = sortedPlayers().filter(p => !onField.includes(p));
  const coach = isCoach(), sys = curSystem(), ownSpots = sys && sys.pos;
  return `<div class="cols lineup-cols"><div class="lineup-ctrl">
    <div class="lineup-bar">
      <select aria-label="Choose lineup" data-change="lineup">${(() => { const opt = l => `<option value="${l.id}" ${l.id === lu.id ? 'selected' : ''}>${esc(l.name)}</option>`, ml = V.lineups.filter(matchOfLineup), saved = V.lineups.filter(l => !matchOfLineup(l));
        return ml.length ? `<optgroup label="Saved lineups">${saved.map(opt).join('')}</optgroup><optgroup label="Match lineups">${ml.map(opt).join('')}</optgroup>` : saved.map(opt).join(''); })()}</select>
      ${coach ? `<button class="btn sm" data-act="lineup-menu" aria-label="Lineup options">${icon('dots', 20)}</button>` : ''}
    </div>
    ${coach ? `<div class="seg" role="group" aria-label="Field mode">
      <button data-act="move-mode" data-on="0" aria-pressed="${!state.moveMode}">Pick players</button>
      <button data-act="move-mode" data-on="1" aria-pressed="${state.moveMode}">Move positions</button>
    </div>` : ''}
    <div class="chips layer-chips" role="group" aria-label="Show on the field">
      <button class="chip" data-act="layer" data-k="zones" aria-pressed="${!!state.layers.zones}">Zones</button>
      <button class="chip" data-act="layer" data-k="channels" aria-pressed="${!!state.layers.channels}">Channels</button>
    </div>
    <div class="sys-chips" role="group" aria-label="Game systems">
      ${SYSTEMS.map(x => `<button class="chip sys-chip g-${x.group.toLowerCase()}" data-act="system" data-id="${x.id}" aria-pressed="${state.system === x.id}">${esc(x.name)}</button>`).join('')}
    </div>
    </div><div class="col lineup-pitch">
    <div class="field-wrap">${fieldSVG(lu, coach)}</div>
    </div><div class="col lineup-side">
    ${matchBanner(lu)}
    ${sys ? systemCard(sys, lu) : `<p class="hint sys-hint">Tap a system to see where everyone stands and what to do at that stage of the game.</p>`}
    ${coach ? `<div class="ratio">
      ${isMixed(V.team) ? `<span class="pill ${males > max ? 'bad' : 'ok'}">${males} of ${max} males max</span>
      <span class="pill neutral">${females} female</span>` : ''}
      <span class="pill ${onField.length === 8 ? 'ok' : 'neutral'}">${onField.length}/8 on field</span>
    </div>
    ${isMixed(V.team) && males > max ? `<p class="note" style="background:var(--bad-soft);margin-top:8px">Too many males on field for mixed. Swap ${males - max} out for a female player.</p>` : ''}
    <p class="hint" style="text-align:center">${ownSpots === 'none' ? 'Players are hidden for this one. Tap it again to see your lineup.'
      : state.moveMode ? (ownSpots ? `Drag the circles to change where they stand in ${esc(sys.name)}. Their lines move with them.` : 'Drag the circles to set your shape.')
      : 'Tap a position to put a player there.'}</p>
    <div class="field-tools">
      ${ownSpots ? '' : `<button class="btn sm" data-act="shape" data-shape="attack">Attack shape</button>
      <button class="btn sm" data-act="shape" data-shape="defence">Defence line</button>`}
      <button class="btn wa sm" data-act="lineup-share">${icon('chat', 18)}Send lineup</button>
    </div>` : ''}
    <section class="sec" style="margin-top:22px"><div class="sec-h"><h2>Interchange (${bench.length})</h2></div>
      ${bench.length ? `<div class="bench">${bench.map(p => `<span class="chip ${isOut(p) ? 'out' : ''}">${gBadge(p)}${esc(shortName(p))}${statusPill(p)}</span>`).join('')}</div>` : `<p class="muted small">${V.players.length ? 'Everyone is on the field.' : coach ? 'Add players in Squad first.' : 'No lineup yet.'}</p>`}
    </section>
    </div></div>`;
}
// A match lineup says which match, and (for the coach) whether it's ready to send.
function matchBanner(lu) {
  const m = matchOfLineup(lu); if (!m) return '';
  const chk = isCoach() ? M.lineupCheck(V, lu, m) : null;
  return `<div class="match-banner"><b>Match lineup: vs ${esc(m.opponent || 'TBC')}</b>, ${esc(fmtDay(m.date))}${m.start ? ` ${esc(fmtTime(m.start))}` : ''}
    ${chk ? (chk.ready ? '<span class="pill ok">Ready</span>' : `<ul class="diff-list issues">${chk.issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`) + (chk.checks.length ? `<p class="small muted">To check: ${esc(chk.checks.join('; '))}</p>` : '') + `<button class="link-btn inline" data-act="match-open" data-id="${m.id}">Match details</button>` : ''}</div>`;
}
function fieldSVG(lu, interactive) {
  let s = `<svg id="field" class="field ${state.moveMode && interactive ? 'moving' : ''} ${interactive ? 'interactive' : ''}${state.system ? ' has-sys' : ''}" viewBox="-3 -1 56 82" role="group" aria-label="Field positions for ${esc(lu.name)}">`;
  s += `<rect x="0" y="0" width="50" height="80" fill="var(--turf)"/>`;
  for (let y = 5, i = 0; y < 75; y += 5, i++) if (i % 2) s += `<rect x="0" y="${y}" width="50" height="5" fill="var(--turf-2)"/>`;
  s += `<rect x="0" y="0" width="50" height="5" fill="var(--turf-3)"/><rect x="0" y="75" width="50" height="5" fill="var(--turf-3)"/>`;
  const F = fieldDims(V.team.field), L = state.layers, sys = curSystem();
  const at = id => { const sl = lu.slots.find(x => x.id === id); return sl ? sysSpot(sys, sl) : null; };
  if (L.channels) s += channelsSVG(F);
  if (L.zones) s += zonesSVG(F);
  if (sys) s += sysUnder(sys, F);
  s += `<rect class="mark" x="0" y="0" width="50" height="80"/>`;
  s += `<line class="mark" x1="0" x2="50" y1="5" y2="5"/><line class="mark" x1="0" x2="50" y1="75" y2="75"/><line class="mark" x1="0" x2="50" y1="40" y2="40"/>`;
  s += `<line class="mark dash" x1="0" x2="50" y1="30" y2="30"/><line class="mark dash" x1="0" x2="50" y1="50" y2="50"/>`;
  s += `<text class="fl" x="25" y="3.1">${sys && sys.defence ? 'They attack this way ↓' : 'Attacking this way ↑'}</text><text class="fl" x="25" y="78.1">Our try line</text>`;
  if (sys) s += sysOver(sys, F, at, slotLabels(lu));
  for (const sl of lu.slots) {
    if (sys && sys.pos === 'none') break;
    const p = playerById(sl.playerId), [x, y] = sysSpot(sys, sl);
    const g = p ? (p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : 'U') : '';
    s += `<g class="slot ${p ? g.toLowerCase() : 'empty'}" data-slot="${sl.id}" transform="translate(${x} ${y})" ${interactive ? 'tabindex="0" role="button"' : ''} aria-label="${esc(sl.name)}: ${p ? esc(p.name) : 'empty'}">
      <circle class="hit" r="4"/><circle class="disc" r="${sys ? 2.3 : 2.7}"/>
      <text class="lbl" dy="0.72">${esc(sys || !p ? sl.label : p.number || initials(p))}</text>`;
    if (p) {
      const b = sys ? 1.8 : 2.1;
      s += `<circle class="gb ${g}" cx="${b}" cy="${-b}" r="${sys ? 0.85 : 1}"/><text class="gl" x="${b}" y="${-b}" dy="0.46">${g === 'U' ? '?' : g}</text>`;
      s += `${sys ? '' : `<text class="pos" y="-3.7">${esc(sl.label)}</text>`}<text class="nm" y="${sys ? 4.3 : 4.9}">${esc(shortName(p))}</text>`;
    }
    s += `</g>`;
  }
  return s + '</svg>';
}
// Channels run try line to try line (y 5 to 75).
function channelsSVG(F) {
  const b = F.bounds, kinds = ['touch', 'out', 'red', 'out', 'touch'], names = ['Touch', 'Outside', 'Red', 'Outside', 'Touch'];
  let s = '<g class="channels" aria-hidden="true">';
  kinds.forEach((k, i) => { s += `<rect class="ch-${k}" x="${b[i]}" y="5" width="${b[i + 1] - b[i]}" height="70"/>`; });
  [1, 2, 3, 4].forEach(i => { s += `<line class="ch-line${i === 2 || i === 3 ? ' red' : ''}" x1="${b[i]}" x2="${b[i]}" y1="5" y2="75"/>`; });
  names.forEach((n, i) => { s += `<text class="chl" x="${(b[i] + b[i + 1]) / 2}" y="7.3">${n}</text>`; });
  return s + '</g>';
}
// Zones: our red zone (danger zone) from our try line; good ball from halfway to their zone line.
function zonesSVG(F) {
  const z = F.zone, theirs = 5 + z, ours = 75 - z;
  let s = '<g class="zones" aria-hidden="true">';
  s += `<rect class="zone good" x="0" y="${theirs}" width="50" height="${40 - theirs}"/>`;
  s += `<rect class="zone red" x="0" y="${ours}" width="50" height="${75 - ours}"/>`;
  s += `<line class="zone-line" x1="0" x2="50" y1="${theirs}" y2="${theirs}"/><line class="zone-line" x1="0" x2="50" y1="${ours}" y2="${ours}"/>`;
  s += `<text class="zl" x="25" y="${theirs + 3}">Good ball: halfway to their ${z} m</text>`;
  s += `<text class="zl" x="25" y="${75 - 1.6}">Red zone: our ${z} m, danger</text>`;
  s += `<text class="zm" x="49.4" y="${theirs - 0.7}">${z} m</text><text class="zm" x="49.4" y="${ours - 0.7}">${z} m</text>`;
  return s + '</g>';
}
// The attack works one side, then the other, compressing the defence each way.
function zigzagSVG(F) {
  const lx = F.touch + F.outside / 2, rx = 50 - lx;
  const pts = [[25, 70], [lx, 62], [rx, 52], [lx, 42], [rx, 32], [lx, 22], [25, 11]];
  return `<g class="zigzag" aria-hidden="true"><defs><marker id="zz-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker></defs>
    <polyline class="zz" points="${pts.map(p => p.join(',')).join(' ')}" marker-mid="url(#zz-arrow)" marker-end="url(#zz-arrow)"/></g>`;
}

/* ----- Game systems ----- */
// How we line up and what we do at each stage of the game, taken from the playbook. A system puts the
// eight positions where they stand in that situation (the saved lineup is untouched), draws the runs,
// passes and kicks, and lists the key points and each position's job beside the field.
// Positions are metres on the field: their try line y 5, halfway y 40, ours y 75.
// Marks: band (shades a zone), line (a target line across the field), ball, opp (their players),
// tag (a numbered ruck), text, zigzag, and lines (run, pass, kick, roll). A line can be tied to a player:
// `who` with points relative to them (or `d` for a straight line), and `to` ends it at another player,
// so when the coach moves a player their lines move too. {z} in the words is the zone depth (Settings).
// flip: the system also has a mirror image (the ruck on the other side), shown with a button.
const JOB_GROUPS = ['Middles', 'Rovers', 'Links', 'Wings'];
const SYSTEMS = [
  { id: 'exit', group: 'Attack', name: 'Exit set', title: 'Exit set: out of our red zone', flip: true,
    rules: ['oztag.set', 'oztag.kick.allowed', 'oztag.kick.height', 'oztag.kick.touch'],
    when: 'We have the ball inside our {z}. Get out safely, then kick long on tag 5 or 6.',
    pos: { RM: [25, 64], LM: [19.2, 67.2], RR: [31.6, 68.8], LR: [13.6, 70.6], LL: [6.2, 72.8], LW: [3, 64.4], RL: [38.8, 72.4], RW: [47, 64.4] },
    marks: [
      { t: 'band', zone: 'ours' }, { t: 'line', zone: 'ours', text: 'Out by tag 3', a: 'e' },
      { t: 'chain', pts: [[25, 64], [29.2, 57], [26, 51.4], [24.2, 46.2], [25, 41.4]] },
      { t: 'tag', at: [29.2, 57], n: 2 }, { t: 'tag', at: [26, 51.4], n: 3 }, { t: 'tag', at: [24.2, 46.2], n: 4 }, { t: 'tag', at: [25, 41.4], n: 5, hot: true },
      { t: 'pass', who: 'LM', to: 'RR' },
      { t: 'run', who: 'RR', d: [-2.4, -11.8], key: true },
      { t: 'run', who: 'LR', d: [2.6, -9.4] },
      { t: 'kick', pts: [[25, 41.4], [15.6, 22.8]] }, { t: 'roll', pts: [[15.6, 22.8], [12.8, 15]] },
      { t: 'text', at: [2.2, 33.2], text: 'Tag 5 or 6:\nlong, low exit kick', a: 's' }
    ],
    points: [
      'Play the ball fast every time. A slow one lets them reset.',
      'Tags 1–3: Middles and Rovers carry hard and straight, one short pass off the ruck at most. No wide or looping passes near our line.',
      'Protect both tags: no spins into defenders, and two hands on the ball.',
      'Aim to be out of our red zone by tag 3.',
      'Tag 5: exit kick if we’ve made under 20 m this set. Tag 6: exit kick, always, unless we’re clear.',
      'Kick long and low so it bounces and rolls. Out on the full gives them the ball where we kicked it.',
      'A kick is legal on any tag, with both tags on. Kick early only if their back field is empty: otherwise keep the ball until tag 5 or 6.'
    ],
    jobs: {
      Middles: 'Hard, straight carries on tags 1–3, then a fast play-the-ball. Nearest Middle plays dummy half.',
      Rovers: 'First receiver: carry straight or give one short pass. Our kicker on tag 5 or 6.',
      Links: 'Hold your width so their line stays spread. Chase the kick as a line.',
      Wings: 'Stay wide. Chase the kick: onside behind the kicker, then up together.'
    } },
  { id: 'good', group: 'Attack', name: 'Good ball', title: 'Attack in good ball', flip: true,
    rules: ['oztag.set', 'oztag.dummyhalf', 'oztag.kick.allowed'],
    when: 'Between halfway and their {z}. Tags 1–4 build the pressure; tags 5–6 cash it in.',
    pos: { RM: [26.2, 33], LM: [20.4, 36.4], LR: [14.2, 40.4], LL: [8, 45.6], LW: [2.8, 53.2], RR: [32.4, 39.4], RL: [39, 45], RW: [47, 51.8] },
    plays: ['quickie-out', 'quickie-in', 'ninja', 'out-the-back', 'hands-inside', 'hands-outside'],
    marks: [
      { t: 'band', zone: 'good' },
      { t: 'run', who: 'RM', d: [0, -9.4] }, { t: 'run', who: 'LM', d: [1.4, -12] },
      { t: 'text', at: [23.6, 18.8], text: 'Tags 1–2:\nMiddles' },
      { t: 'run', who: 'RR', pts: [[0, 0], [2.6, -7], [6.2, -14.4]], curve: true, key: true },
      { t: 'run', who: 'LR', pts: [[0, 0], [-2.2, -7], [-5, -13.6]], curve: true, opt: true },
      { t: 'text', at: [31.2, 19.6], text: 'Tags 3–4: a Rover\npicks the side', a: 's' },
      { t: 'pass', who: 'RL', to: 'RW' },
      { t: 'run', who: 'RW', d: [0.2, -20], key: true },
      { t: 'text', at: [45.2, 36.4], text: 'Tags 5–6:\nfinish on\nthe edge', a: 'e' }
    ],
    points: [
      'Tags 1–2: Middles run hard at the gaps beside the marker. Play the ball fast.',
      'Tags 3–4: a Rover takes the ball and attacks one side. Rovers count defenders each side and call it; go to the short side if they’re thin.',
      'Fix a defender before every pass, and attack the inside shoulder.',
      'Hold width and depth: Wings on the touch line until the ball comes; receivers start deep and run onto it.',
      'Decoys must look like they’ll get the ball, every time.',
      'Tags 5–6: run the play. Kick on 5 only if their back field is empty; on 6, a long, low kick into space or to bounce into touch near their {z}.',
      'A kick is legal on any tag. If their Wings come up flat early in the set, a grubber in behind is on.'
    ],
    jobs: {
      Middles: 'Hard, straight runs at the gaps beside the marker on tags 1–3. Nearest plays dummy half; after playing the ball, loop around as the extra runner.',
      Rovers: 'First receivers and playmakers. Count defenders, call the side, and kick when it’s on.',
      Links: 'Fix their Link, then pass to the Wing. Cut back against a sliding line; decoy so the ball can go out the back.',
      Wings: 'Finish at full pace near the touch line. Stay wide, call the numbers, chase every kick.'
    } },
  { id: 'zigzag', group: 'Attack', name: 'Zig-zag', title: 'Zig-zag: one side, then the other',
    when: 'Any time we have the ball: work one side, then switch to the other.',
    pos: null, plays: ['hands-inside', 'hands-outside'],
    marks: [{ t: 'zigzag' }],
    points: [
      'Work the ball into one side for a play or two, to pull their defence across.',
      'Then go to the other side, where they’re now short of numbers.',
      'Rovers count defenders each side of the ruck every play and call it.',
      'Every change of direction makes their line shuffle across, and the gap opens on the far side.',
      'Links and Wings on the far side stay wide and ready: that’s where the space will be.'
    ],
    jobs: null },
  { id: 'strike', group: 'Attack', name: 'Their red zone', title: 'Attack their red zone', flip: true,
    rules: ['oztag.kick.overline', 'oztag.mixed.try', 'oztag.scoring'],
    when: 'Inside their {z}. Build on tags 1–4; score on 5 or 6.',
    pos: { RM: [25.6, 17.4], LM: [20, 20.8], RR: [31.6, 23], RL: [37.8, 19.4], RW: [47.6, 22.6], LR: [13.8, 24], LL: [8, 29.4], LW: [2.6, 23.4] },
    plays: ['out-the-back', 'wrap-block', 'back-inside-block'],
    marks: [
      { t: 'band', zone: 'theirs' },
      { t: 'pass', who: 'LM', to: 'RR' },
      { t: 'run', who: 'RR', d: [0.2, -7.6] },
      { t: 'run', who: 'RL', d: [-1.6, -8] },
      { t: 'run', who: 'LM', pts: [[0, 0], [2.6, 5.4], [8.6, 9.2], [15.6, 9.2], [20.4, 6.4], [22.6, 0.2], [23.4, -10.4]], curve: true, key: true },
      { t: 'run', who: 'RW', d: [0.2, -12.8] },
      { t: 'kick', who: 'RR', pts: [[0.2, -6], [-3, -20.4]] },
      { t: 'text', at: [27.4, 9.6], text: 'Shut down? Grubber\nfor the chasers', a: 'e' },
      { t: 'text', at: [32, 34.2], text: 'Out the back:\ndummy half loops' }
    ],
    points: [
      'Tags 1–4: keep building. Hard Middles, fast play-the-ball, count the numbers.',
      'Tag 5: our strike play, or the early grubber while their sweeper is still in the line.',
      'Tag 6: the best play for the spot. Shut down? A grubber in behind for our chasers to ground: a try.',
      'If the grubber goes dead untouched, it’s their tap 10 m out. If one of them touches it first and it goes dead, it’s their drop-out: our ball back.',
      'Finish in a female player’s hands where we can, with the males as decoys: a female try is worth 2 points, a male try 1.',
      'Score standing up when you can. Diving to score is allowed, but never over or under a defender.',
      'Once they cover our female finishers, the same play works with the ball staying in a decoy’s hands.'
    ],
    jobs: {
      Middles: 'Fast play-the-ball. The dummy half loops around for Out the back.',
      Rovers: 'Run at their Rover’s inside shoulder to hold them, then pass behind the decoy, or grubber.',
      Links: 'A short decoy line at the gap. Make it look real.',
      Wings: 'Stay wide until the ball comes and finish in the corner. Chase every grubber.'
    } },
  { id: 'kick', group: 'Kick', name: 'When to kick', title: 'When to kick',
    rules: ['oztag.kick.allowed', 'oztag.kick.height', 'oztag.kick.tags', 'oztag.kick.chase', 'oztag.kick.regather', 'oztag.kick.overline', 'oztag.kick.5010', 'oztag.kick.touch'],
    when: 'A kick is legal on any tag, but we usually keep it for tag 5 or 6. Where we are on the field decides which one.',
    pos: 'none',
    table: [
      ['Their red zone', 'Grubber behind a flat or rushing line', 'Run the play; grubber for the chasers if it’s shut down'],
      ['Midfield', 'Only if their back field is empty', 'Long, low kick into space, or to bounce into touch near their {z}'],
      ['Our half', 'Exit kick if we’ve made under 20 m this set', 'Exit kick, always, unless we’re clear. A 50/10 if their Wings are up']
    ],
    marks: [
      { t: 'band', zone: 'theirs' }, { t: 'band', zone: 'good', soft: true }, { t: 'band', zone: 'half' },
      { t: 'text', at: [2, 10.2], text: 'THEIR RED ZONE', a: 's', cls: 'h' },
      { t: 'text', at: [2, 12.8], text: 'Tag 5: grubber behind a flat line\nTag 6: play, or a grubber', a: 's' },
      { t: 'kick', pts: [[44.6, 23], [43.4, 2.6]] },
      { t: 'text', at: [42.2, 10.2], text: 'Ground it: try.\nDead, untouched:\ntheir tap 10 m out', a: 'e' },
      { t: 'text', at: [2, 24.4], text: 'MIDFIELD', a: 's', cls: 'h' },
      { t: 'text', at: [2, 27], text: 'Tag 5: only if their back field is empty\nTag 6: long and low, to space or touch', a: 's' },
      { t: 'kick', pts: [[33, 38], [44.4, 30.4]] }, { t: 'roll', pts: [[44.4, 30.4], [50.6, 27]] },
      { t: 'text', at: [2, 44.4], text: 'OUR HALF', a: 's', cls: 'h' },
      { t: 'text', at: [2, 47], text: 'Tag 5: exit kick if we’ve made under 20 m\nTag 6: exit kick, always, unless we’re clear', a: 's' },
      { t: 'kick', pts: [[38, 68], [41.6, 49.6]] }, { t: 'roll', pts: [[41.6, 49.6], [42.6, 42.4]] },
      { t: 'text', at: [25, 71.6], text: 'Tags 1–4: legal, but only if their back field is empty' }
    ],
    points: [
      'Kicking is legal on any tag, but only with both tags on. The dummy half and a penalty tap can kick with one tag or none, with one step.',
      'Low only: no higher than the referee’s shoulder off the boot. No drop kicks. Grubbers and long, low kicks.',
      'Over their try line: ground it for a try. Dead and untouched: their tap 10 m out, centre field. Touched by them first: their drop-out, our ball back.',
      'Bounce it into touch: their ball 10 m in from where it went out. Out on the full: their ball where we kicked it.',
      '50/10: kicked from our half, it bounces in and goes out within 10 m of their try line: our tap 10 m in and 10 m out.',
      'Chase as a line, starting behind the kicker: anyone in front is offside until they’ve gone 10 m or the kicker passes them. No diving on the ball. A regather is a zero tag, and the kicker can’t kick it again.',
      'Don’t kick with a clear overlap, or into their best runner’s hands. A kick with no chase is a turnover.'
    ],
    jobs: {
      Rovers: 'Our main kickers. Look for the space behind their line on tag 5.',
      Wings: 'Chase every kick, close to the touch line.'
    } },
  { id: 'up', group: 'Defence', name: 'Defence up', title: 'Defence: Up (early in their set)', defence: true,
    rules: ['oztag.defence.distance', 'oztag.defence.moves', 'oztag.marker', 'oztag.kick.allowed'],
    when: 'Early in their set: we rush up together. They can kick on any tag, so the Wings stay a step deep.',
    pos: { LM: [22, 26], LW: [3.2, 32.6], LL: [9.4, 31], LR: [15.6, 32.4], RM: [28.4, 31], RR: [34.6, 32.4], RL: [40.8, 31], RW: [47, 32.6] },
    marks: [
      { t: 'opp', pts: [[20.4, 18.8], [14.8, 16.2], [29, 16.2], [8.6, 13.6], [35.4, 13.6], [3, 11.2], [41.8, 11.2], [47, 9]] },
      { t: 'ball', at: [22, 22] },
      ...['LL', 'LR', 'RM', 'RR', 'RL'].map(who => ({ t: 'run', who, d: [0, -6.4] })),
      { t: 'run', who: 'LW', d: [0.6, -6] }, { t: 'run', who: 'RW', d: [-0.6, -6] },
      { t: 'text', at: [25, 43.4], text: '“Up!” Together, on the dummy half’s touch' }
    ],
    points: [
      'Count the tags out loud. Everyone repeats it.',
      '“Up!”: the whole line goes forward together on the dummy half’s touch. No one shoots out alone.',
      'Stay square, feet set before the carrier arrives. Inside shoulder first: never beaten on the inside.',
      'Marker: square, 1 m in front of the play-the-ball. Never chase the ball.',
      'Match their numbers: count attackers each side and push or pull a defender across before the ball is played.',
      'Tag with intent: on the hip they’re running toward. Hold it up, drop it at the mark, get back 7 m.',
      'A kick can come on any tag: Wings turn early when the kicker shapes, and the far Wing covers in behind.'
    ],
    jobs: {
      Middles: 'Nearest Middle is the marker: square, 1 m in front, a mini line with the other Middle. Never beaten inside.',
      Rovers: 'Lead the line speed. The open-side Rover calls “Up” and counts the numbers.',
      Links: 'Square, inside shoulder first. Track your runner; don’t bite on decoys.',
      Wings: 'In the line, a step deep for the kick in behind. Call the edge numbers. Come up and in only on a call.'
    } },
  { id: 'slide', group: 'Defence', name: 'Defence slide', title: 'Defence: Slide (tags 5–6)', defence: true, flip: true,
    rules: ['oztag.defence.moves', 'oztag.marker', 'oztag.kick.overline'],
    when: 'Tags 5–6, and anywhere inside our {z}: the kick and the wide shift are the biggest threats.',
    pos: { LM: [17, 26], LW: [3.4, 32.6], LL: [10, 31], RM: [23.4, 31], RR: [29.6, 32.4], RL: [35.8, 31], RW: [43.2, 33.6], LR: [25.4, 46] },
    marks: [
      { t: 'opp', pts: [[15.4, 18.8], [9.4, 16.2], [3.4, 13.8], [23.4, 16.2], [30, 14.4], [36.6, 13.2], [43.2, 12.2], [48, 11.4]] },
      { t: 'ball', at: [17, 22] },
      ...['RM', 'RR', 'RL'].map(who => ({ t: 'run', who, d: [5.4, -3.4] })),
      { t: 'run', who: 'LR', pts: [[-9.8, -14.4], [0, 0]] },
      { t: 'text', at: [28.6, 46.6], text: 'Sweeper, 10–15 m back', a: 's' },
      { t: 'text', at: [7, 39.6], text: 'Short side holds' },
      { t: 'text', at: [38.2, 42.6], text: 'Open side slides' }
    ],
    points: [
      '“Sweep!” on tag 4, so we’re set for tag 5.',
      'The short-side Rover drops 10–15 m back as the sweeper and calls from behind.',
      'The open side slides toward the ball, staying on the inside of the carrier. The touch line is our 9th defender.',
      'Marker: same job. The second Middle covers the dummy half’s run.',
      'Wings a step deeper on tag 5; turn early for grubbers. Inside our 10 m, come up and in to shut the last pass.',
      'Grubber into our in-goal: pick it up clean, or let it go dead untouched for our tap 10 m out. Touch it and let it go dead and it’s our drop-out: their ball back. No diving on it.'
    ],
    jobs: {
      Middles: 'Same marker job. The second Middle covers the dummy half’s run.',
      Rovers: 'Short-side Rover drops 10–15 m back as the sweeper. Open-side Rover slides with the ball.',
      Links: 'Slide with the pass, staying on the inside of the ball carrier.',
      Wings: 'A step deeper on tag 5; turn early for grubbers. Inside our 10 m, come up and in.'
    } }
];
const systemBase = id => SYSTEMS.find(s => s.id === id) || null;
// The system on show is remembered on this device. (Zig-zag used to be a field layer.)
{
  const was = store.get('tm-field-system'), zz = state.layers.zigzag;
  delete state.layers.zigzag;
  state.system = systemBase(was) ? was : was === null && zz ? 'zigzag' : null;
}
// The words with the zone depth filled in, and the lineup's own position labels if it renamed any.
function sysWords(text, F, labels) {
  const t = String(text ?? '').replace(/\{z\}/g, `${F.zone} m`);
  return labels ? replaceWords(t, labels) : t;
}
// A system as shown: the coach's changes (positions, words) over the playbook version, mirrored if asked.
function systemView(id, flip) {
  const base = systemBase(id); if (!base) return null;
  const o = (V.systems || {})[id] || {};
  const pos = base.pos && typeof base.pos === 'object' ? { ...base.pos, ...(o.pos || {}) } : base.pos;
  const jobs = base.jobs || o.jobs ? { ...(base.jobs || {}), ...(o.jobs || {}) } : null;
  const sys = { ...base, pos, jobs, when: o.when ?? base.when, points: o.points ?? base.points, flipped: false,
    edited: !!(o.pos && Object.keys(o.pos).length) || o.when != null || !!o.points || !!o.jobs };
  return flip && base.flip ? flipSystem(sys) : sys;
}
function flipSystem(sys) {
  const fx = p => [round1(50 - p[0]), p[1]], rx = p => [-p[0], p[1]];
  const txt = t => mirrorText(t, OZTAG_PAIRS), anchor = a => ({ s: 'e', e: 's' }[a] || a);
  const pos = sys.pos && typeof sys.pos === 'object' ? Object.fromEntries(Object.entries(sys.pos).map(([k, p]) => [swapSlot(k), fx(p)])) : sys.pos;
  const marks = sys.marks.map(m => {
    const out = { ...m };
    if (m.who) out.who = swapSlot(m.who);
    if (m.to) out.to = swapSlot(m.to);
    if (m.d) out.d = rx(m.d);
    if (m.pts) out.pts = m.pts.map(m.who ? rx : fx);
    if (m.at) out.at = fx(m.at);
    if (m.text) out.text = txt(m.text);
    if (m.a) out.a = anchor(m.a);
    return out;
  });
  const jobs = sys.jobs ? Object.fromEntries(Object.entries(sys.jobs).map(([k, v]) => [k, txt(v)])) : null;
  return { ...sys, pos, marks, jobs, when: txt(sys.when), points: sys.points.map(txt), title: sys.title, flipped: true };
}
// Where each position stands while a system is shown (null: the lineup's own spots; 'none': hidden).
const sysSpot = (sys, sl) => sys && sys.pos && typeof sys.pos === 'object' && sys.pos[sl.id] ? sys.pos[sl.id] : [sl.x, sl.y];
const curSystem = () => state.system ? systemView(state.system, state.sysFlip) : null;
// A line's points on the field.
function sysLine(m, at) {
  const o = m.who ? at(m.who) : null;
  let pts = m.d ? [[0, 0], m.d] : m.pts ? m.pts : [[0, 0]];
  if (o) pts = pts.map(p => [o[0] + p[0], o[1] + p[1]]);
  if (m.to && at(m.to)) pts = [...pts, at(m.to)];
  return pts.length > 1 ? pts : null;
}
// Pull the ends of a line off the circles it starts or finishes at.
function sysTrim(pts, spots) {
  const out = pts.map(p => p.slice());
  const pull = (i, j, gap) => {
    const hit = spots.find(s => Math.hypot(s.p[0] - out[i][0], s.p[1] - out[i][1]) < 0.7); if (!hit) return;
    const dx = out[j][0] - out[i][0], dy = out[j][1] - out[i][1], len = Math.hypot(dx, dy);
    const g = gap(hit); if (len > g + 1) out[i] = [out[i][0] + dx / len * g, out[i][1] + dy / len * g];
  };
  pull(0, 1, h => h.r + 0.4); pull(out.length - 1, out.length - 2, h => h.r + 0.9);
  return out;
}
const f1 = n => +n.toFixed(2);
function sysText(x, y, text, a, cls) {
  const lines = String(text).split('\n');
  return `<text class="sy-t${a === 's' || a === 'e' ? ' a' + a : ''}${cls ? ' ' + cls : ''}" x="${f1(x)}" y="${f1(y)}">${lines.map((l, i) => `<tspan x="${f1(x)}" ${i ? 'dy="1.9"' : ''}>${esc(l)}</tspan>`).join('')}</text>`;
}
// The shading, under the field markings.
function sysUnder(sys, F) {
  const z = F.zone, ys = { ours: [75 - z, 75], theirs: [5, 5 + z], good: [5 + z, 40], half: [40, 75] };
  return sys.marks.filter(m => m.t === 'band').map(m => { const [a, b] = ys[m.zone]; return `<rect class="sy-band ${m.zone}${m.soft ? ' soft' : ''}" x="0" y="${a}" width="50" height="${b - a}"/>`; }).join('');
}
// The lines, rucks and words, over the field markings and under the players.
function sysOver(sys, F, at, labels) {
  const spots = [];
  if (sys.pos !== 'none') SLOT_IDS.forEach(id => { const p = at(id); if (p) spots.push({ p, r: 2.75 }); });
  sys.marks.forEach(m => { if (m.t === 'tag') spots.push({ p: m.at, r: 1.25 }); });
  const words = t => sysWords(t, F, labels);
  let s = `<g class="sys" aria-hidden="true"><defs>${[['w', 'run'], ['k', 'key'], ['g', 'kick']].map(([k, c]) => `<marker id="sy-${k}" viewBox="0 0 10 10" refX="8.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="${k === 'k' ? 2.2 : 1.9}" markerHeight="${k === 'k' ? 2.2 : 1.9}" orient="auto"><path class="sy-ah ${c}" d="M0 0L10 5L0 10z"/></marker>`).join('')}</defs>`;
  for (const m of sys.marks) {
    if (m.t === 'line') { const y = m.zone === 'ours' ? 75 - F.zone : m.zone === 'theirs' ? 5 + F.zone : m.y; s += `<line class="sy-line" x1="0" x2="50" y1="${y}" y2="${y}"/>`; if (m.text) s += sysText(m.a === 'e' ? 49.2 : m.a === 's' ? 0.8 : 25, y - 0.8, words(m.text), m.a, 'tl'); }
    else if (m.t === 'zigzag') s += zigzagSVG(F);
    else if (m.t === 'chain') s += `<polyline class="sy-chain" points="${m.pts.map(p => p.join(',')).join(' ')}"/>`;
    else if (m.t === 'opp') s += m.pts.map(p => `<circle class="sy-opp" cx="${p[0]}" cy="${p[1]}" r="1.55"/>`).join('');
  }
  for (const m of sys.marks) {
    if (!['run', 'pass', 'kick', 'roll'].includes(m.t)) continue;
    const raw = sysLine(m, at); if (!raw) continue;
    const pts = sysTrim(raw, spots), head = m.t === 'roll' ? '' : m.t === 'kick' ? 'g' : m.key ? 'k' : 'w';
    s += `<path class="sy-mv ${m.t}${m.key ? ' key' : ''}${m.opt ? ' opt' : ''}" d="${pathD(pts, m.curve)}"${head ? ` marker-end="url(#sy-${head})"` : ''}/>`;
  }
  for (const m of sys.marks) {
    if (m.t === 'tag') s += `<g class="sy-tag${m.hot ? ' hot' : ''}" transform="translate(${m.at[0]} ${m.at[1]})"><circle r="1.25"/><text dy="0.52">${m.n}</text></g>`;
    else if (m.t === 'ball') s += `<g class="sy-ball" transform="translate(${m.at[0]} ${m.at[1]}) rotate(-30)"><ellipse rx="1.05" ry="0.68"/><path d="M-0.5 0H0.5"/></g>`;
    else if (m.t === 'text') s += sysText(m.at[0], m.at[1], words(m.text), m.a, m.cls);
  }
  return s + '</g>';
}
// The lineup's own position labels, where it renamed any (LW -> W1), so the words match the field.
const slotLabels = lu => { const m = {}; lu.slots.forEach(s => { if (s.label && s.label !== s.id) m[s.id] = s.label; }); return Object.keys(m).length ? m : null; };
// The two ways round of a system that has a mirror image, and which one the playbook draws.
const sysSides = sys => sys.defence ? { names: ['Ruck left', 'Ruck right'], base: 0 } : { names: ['Attacking left', 'Attacking right'], base: 1 };
function sysLegend(sys) {
  const kinds = new Set(sys.marks.map(m => m.t)), key = sys.marks.some(m => m.key);
  const sw = (cls, head = true) => `<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><rect width="34" height="14" rx="3" fill="#2F7D4E"/><line class="lg ${cls}" x1="4" y1="7" x2="${head ? 25 : 30}" y2="7"/>${head ? `<path class="lg-h ${cls}" d="M24 3L31 7L24 11z"/>` : ''}</svg>`;
  const items = [
    kinds.has('run') && `<span>${sw('run')}Run</span>`,
    key && `<span>${sw('key')}Key move</span>`,
    kinds.has('pass') && `<span>${sw('pass')}Pass</span>`,
    kinds.has('kick') && `<span>${sw('kick')}Kick</span>`,
    kinds.has('roll') && `<span>${sw('roll', false)}Bounce and roll</span>`,
    kinds.has('tag') && `<span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="#fff" stroke="#16201B" stroke-width="1"/><text x="7" y="10" text-anchor="middle" font-size="8.5" font-weight="700" fill="#16201B">2</text></svg>Ruck, by tag</span>`,
    kinds.has('opp') && `<span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="#E6ECE8" stroke="#C4513F" stroke-width="1.4"/></svg>Their players</span>`
  ].filter(Boolean);
  return items.length ? `<div class="legend sys-legend">${items.join('')}</div>` : '';
}
function systemCard(sys, lu) {
  const F = fieldDims(V.team.field), labels = slotLabels(lu), w = t => sysWords(t, F, labels), coach = isCoach();
  const plays = (sys.plays || []).map(playById).filter(Boolean), jobs = sys.jobs ? JOB_GROUPS.filter(g => sys.jobs[g]) : [];
  const sides = sys.flip ? sysSides(sys) : null, cur = sides ? (state.sysFlip ? 1 - sides.base : sides.base) : 0;
  return `<section class="sys-card g-${sys.group.toLowerCase()}">
    <div class="sys-head"><h3>${esc(sys.title)}</h3><span class="pill neutral">${esc(sys.group)}</span></div>
    <p class="sys-when">${esc(w(sys.when))}</p>
    ${sides ? `<div class="seg sys-side" role="group" aria-label="Which way round">${sides.names.map((n, i) => `<button data-act="sys-side" data-flip="${i === sides.base ? 0 : 1}" aria-pressed="${i === cur}">${n}</button>`).join('')}</div>` : ''}
    ${sysLegend(sys)}
    ${sys.table ? `<table class="sys-table"><thead><tr><th scope="col">Where we are</th><th scope="col">Tag 5</th><th scope="col">Tag 6</th></tr></thead><tbody>
      ${sys.table.map(r => `<tr><th scope="row">${esc(w(r[0]))}</th><td>${esc(w(r[1]))}</td><td>${esc(w(r[2]))}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="sys-cols"><div>
    <h4 class="sys-h">Key points</h4>
    <ul class="sys-points">${sys.points.map(p => `<li>${esc(w(p))}</li>`).join('')}</ul>
    </div>${jobs.length || plays.length ? `<div>
    ${jobs.length ? `<h4 class="sys-h">Jobs</h4><dl class="sys-jobs">${jobs.map(g => `<div><dt>${g}</dt><dd>${esc(w(sys.jobs[g]))}</dd></div>`).join('')}</dl>` : ''}
    ${plays.length ? `<h4 class="sys-h">Plays for this</h4><div class="sys-plays">${plays.map(p => `<button class="chip" data-act="sys-play" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    </div>` : ''}</div>
    ${coach ? `<div class="btn-row sys-tools"><button class="btn sm" data-act="sys-edit" data-id="${sys.id}">Edit words</button><button class="btn wa sm" data-act="sys-share">${icon('chat', 18)}Send</button></div>
      ${sys.edited ? `<p class="hint">You’ve changed this from the playbook. <button class="link-btn inline" data-act="sys-reset" data-id="${sys.id}">Put it back</button></p>` : ''}
      ${libBar('systems', sys.id, (V.systems || {})[sys.id])}` : ''}
  </section>`;
}
function openSystemEditor(id) {
  const sys = systemView(id, false), F = fieldDims(data.team.field), w = t => sysWords(t, F);
  if (!sys) return;
  openSheet(`Edit “${sys.name}”`, `<form class="sys-form" data-form="system"><input type="hidden" name="id" value="${esc(id)}">
    <label class="field-l"><span>When</span><textarea name="when" rows="2">${esc(w(sys.when))}</textarea></label>
    <label class="field-l"><span>Key points</span><textarea name="points" rows="9">${esc(sys.points.map(w).join('\n'))}</textarea><small>One point per line.</small></label>
    ${JOB_GROUPS.map(g => `<label class="field-l"><span>Job: ${g}</span><textarea name="job-${g}" rows="2">${esc(w((sys.jobs || {})[g] || ''))}</textarea></label>`).join('')}
    <p class="hint" style="margin-bottom:12px">To change where players stand, close this, choose Move positions and drag the circles while the system is showing.</p>
    <button class="btn primary block" type="submit">Save</button></form>`);
}
function saveSystemWords(id, f) {
  const base = systemBase(id); if (!base) return;
  const F = fieldDims(data.team.field), w = t => sysWords(t, F);
  const o = { ...(data.systems[id] || {}) };
  const when = f.when.trim(), points = f.points.split('\n').map(l => l.trim()).filter(Boolean);
  if (when === w(base.when)) delete o.when; else o.when = when;
  if (points.join('\n') === base.points.map(w).join('\n')) delete o.points; else o.points = points;
  const jobs = {};
  JOB_GROUPS.forEach(g => { const v = (f.jobs[g] || '').trim(); if (v !== w((base.jobs || {})[g] || '')) jobs[g] = v; });
  if (Object.keys(jobs).length) o.jobs = jobs; else delete o.jobs;
  M.libMarkEdited(o);
  if (Object.keys(o).length) data.systems[id] = o; else delete data.systems[id];
}
// Where a player stands in the system on show: the coach's own spot, kept the playbook way round.
function moveSystemSpot(slotId, x, y) {
  const base = systemBase(state.system); if (!base) return;
  const flip = state.sysFlip && base.flip, id = flip ? swapSlot(slotId) : slotId;
  const o = data.systems[base.id] || (data.systems[base.id] = {});
  o.pos = { ...(o.pos || {}), [id]: [round1(flip ? 50 - x : x), round1(y)] };
  M.libMarkEdited(o);
}
function systemShareText(sys, lu) {
  const F = fieldDims(V.team.field), w = t => sysWords(t, F, slotLabels(lu));
  const sides = sys.flip ? sysSides(sys) : null, side = sides ? ` (${sides.names[state.sysFlip ? 1 - sides.base : sides.base].toLowerCase()})` : '';
  const table = sys.table ? `\n\n${sys.table.map(r => `*${w(r[0])}*: tag 5, ${w(r[1]).replace(/^./, c => c.toLowerCase())}; tag 6, ${w(r[2]).replace(/^./, c => c.toLowerCase())}.`).join('\n')}` : '';
  const jobs = sys.jobs ? JOB_GROUPS.filter(g => sys.jobs[g]).map(g => `${g}: ${w(sys.jobs[g])}`) : [];
  return `🏉 *${sys.title}*${side}\n${w(sys.when)}${table}\n\n${sys.points.map(p => `• ${w(p)}`).join('\n')}${jobs.length ? `\n\n*Jobs*\n${jobs.join('\n')}` : ''}\n\nSee where you stand: Lineup page in the team app.`;
}
function bindField() {
  const svg = $('#field'); if (!svg || !isCoach() || readOnlyView()) return;
  let drag = null;
  const toSvg = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  // While a system with its own spots is showing, moving a player changes that system, not the lineup.
  const sysOwn = () => { const sys = curSystem(); return sys && sys.pos && typeof sys.pos === 'object'; };
  const place = (id, x, y) => {
    if (sysOwn()) { moveSystemSpot(id, x, y); save(); render(); return; }
    const sl = curLineup().slots.find(s => s.id === id); sl.x = x; sl.y = y; save();
  };
  svg.addEventListener('pointerdown', e => {
    if (!state.moveMode) return;
    const g = e.target.closest('[data-slot]'); if (!g) return;
    e.preventDefault(); drag = { g, id: g.dataset.slot };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = toSvg(e);
    drag.x = clamp(p.x, 1.5, 48.5); drag.y = clamp(p.y, 1.5, 78.5);
    drag.g.setAttribute('transform', `translate(${drag.x.toFixed(1)} ${drag.y.toFixed(1)})`);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.x != null) place(d.id, +d.x.toFixed(1), +d.y.toFixed(1));
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => { if (state.moveMode) return; const g = e.target.closest('[data-slot]'); if (g) openAssign(g.dataset.slot); });
  svg.addEventListener('keydown', e => {
    const g = e.target.closest('[data-slot]'); if (!g) return;
    if (!state.moveMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openAssign(g.dataset.slot); return; }
    if (state.moveMode && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const id = g.dataset.slot, sl = curLineup().slots.find(s => s.id === id), d = e.shiftKey ? 5 : 1;
      let [x, y] = sysSpot(curSystem(), sl);
      if (e.key === 'ArrowUp') y = clamp(y - d, 1.5, 78.5);
      if (e.key === 'ArrowDown') y = clamp(y + d, 1.5, 78.5);
      if (e.key === 'ArrowLeft') x = clamp(x - d, 1.5, 48.5);
      if (e.key === 'ArrowRight') x = clamp(x + d, 1.5, 48.5);
      g.setAttribute('transform', `translate(${x} ${y})`);
      place(id, round1(x), round1(y));
      if (sysOwn()) { const back = $(`#field [data-slot="${id}"]`); if (back) back.focus(); }
    }
  });
}
function openAssign(slotId) {
  const lu = curLineup(), sl = lu.slots.find(s => s.id === slotId); if (!sl) return;
  const where = {}; lu.slots.forEach(s => { if (s.playerId) where[s.playerId] = s; });
  const mt = matchOfLineup(lu), said = p => mt ? M.rsvpOf(mt, p.id) : '';
  const rank = p => (p.status === 'available' ? 0 : 10) + (said(p) === 'no' ? 8 : said(p) === 'maybe' ? 3 : mt && !said(p) ? 2 : 0) + (p.positions.includes(sl.group) ? 0 : 1) + (where[p.id] ? 2 : 0);
  const players = data.players.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const cur = playerById(sl.playerId);
  openSheet(`${sl.name} (${sl.label})`, `${cur ? `<button class="btn block" style="margin-bottom:12px" data-act="assign" data-slot="${sl.id}" data-pid="">Leave ${esc(sl.label)} empty</button>` : ''}
    ${players.length ? `<div class="list">${players.map(p => {
      const match = p.positions.includes(sl.group);
      const avail = said(p) === 'no' ? 'Said they can’t play · ' : said(p) === 'maybe' ? 'Unsure · ' : mt && !said(p) ? 'No reply · ' : '';
      const note = avail + (p.id === sl.playerId ? 'In this position now' : where[p.id] ? `Playing ${where[p.id].label}, will swap` : match ? `Plays ${sl.group.toLowerCase()}` : (p.positions.join(', ') || ''));
      return `<button class="pick ${match ? 'match' : ''}" data-act="assign" data-slot="${sl.id}" data-pid="${p.id}">
        ${jersey(p)}<span class="grow"><span class="name" style="display:block">${esc(p.name)} ${gBadge(p)}</span><span class="tagline">${esc(note)}</span></span>
        ${p.status !== 'available' ? `<span class="pill ${p.status}">${STATUS[p.status]}</span>` : ''}
      </button>`;
    }).join('')}</div>` : `<p class="muted">Add players in Squad first.</p>`}
    <details style="margin-top:18px"><summary class="small" style="cursor:pointer;font-weight:600">Rename this position</summary>
      <form data-form="slot" style="margin-top:10px"><input type="hidden" name="slot" value="${sl.id}">
        <div class="two"><label class="field-l"><span>Short label</span><input type="text" name="label" maxlength="3" value="${esc(sl.label)}"></label>
        <label class="field-l"><span>Full name</span><input type="text" name="name" value="${esc(sl.name)}"></label></div>
        <button class="btn block" type="submit">Save name</button></form></details>`);
}
function lineupMenu() {
  const lu = curLineup();
  openSheet('Lineup options', `<div class="list">
    <button class="pick" data-act="lineup-new">${icon('plus')}<span class="grow">New lineup</span></button>
    <button class="pick" data-act="lineup-dup">${icon('copy')}<span class="grow">Duplicate “${esc(lu.name)}”</span></button>
    <button class="pick" data-act="lineup-rename"><span style="width:20px"></span><span class="grow">Rename</span></button>
    <button class="pick" data-act="lineup-clear"><span style="width:20px"></span><span class="grow">Clear all players from field</span></button>
    ${data.lineups.length > 1 ? `<button class="pick" data-act="lineup-del" style="color:var(--bad)"><span style="width:20px"></span><span class="grow">Delete this lineup</span></button>` : ''}
  </div><p class="hint">Players can see every lineup here. Keep a few, e.g. starting 8, a defence-first 8 and your finals 8.</p>`);
}
function lineupText(lu) {
  const lines = lu.slots.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(s => { const p = playerById(s.playerId); return `${s.label} – ${p ? p.name : '(empty)'}`; });
  const onIds = lu.slots.map(s => s.playerId).filter(Boolean);
  const bench = sortedPlayers().filter(p => !onIds.includes(p.id) && p.status === 'available').map(p => p.name);
  return `📋 *${lu.name}* — ${data.team.name}\n\n${lines.join('\n')}${bench.length ? `\n\n🔁 Interchange: ${bench.join(', ')}` : ''}`;
}

/* ---------- Plays ---------- */
// Plays are stored attacking right (side: 'right') and mirrored for the left: x becomes 50 - x,
// position codes swap sides (RR <-> LR) and so do the words left/right in the text.
// Positions are metres on the 50 x 80 field: their try line at y = 5, ours at y = 75.
// Optional extras: headline (one line on what the play achieves), notes beside players
// ({ RM: { text, side } }, plus 'marker' and 'line' for the defence labels), free labels
// ([{ at, text, side, dot }]) and view (the part of the field to show).
const PLAY_CATS = ['Ruck', 'Edge', 'Hands', 'Kick', 'Other'];
const MOVE_KINDS = { run: 'Run', pass: 'Pass', kick: 'Kick', dummy: 'Dummy pass', shift: 'Defender move' };
const STARTER_IDS = ['quickie-out', 'quickie-in', 'ninja', 'out-the-back', 'hands-inside', 'hands-outside', 'wrap-block', 'back-inside-block'];
// Each starter play carries its own rev, bumped when its drawing changes (see upgradePlays).
// STARTER_SET is bumped when starters are added or retired: set 4 retired Switch and Finisher
// and added the two Hands plays; set 5 added Wrap Block; set 6 added Back Inside Block.
const STARTER_SET = 6;
const RETIRED_STARTERS = ['switch', 'finisher'];
const STARTER_SINCE = { 'hands-inside': 4, 'hands-outside': 4, 'wrap-block': 5, 'back-inside-block': 6 };
const swapSlot = id => /^[LR][WLRM]$/.test(id) ? (id[0] === 'L' ? 'R' : 'L') + id[1] : id;
const flipSide = s => String(s || '').replace(/[lr]/g, c => c === 'l' ? 'r' : 'l');
// The attacking-left version of some words: player codes swap sides (LR <-> RR, or whatever pairs the
// play's player list has) and so do the words left and right.
const escRe = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function mirrorText(text, pairs) {
  const P = pairs || OZTAG_PAIRS, keys = Object.keys(P);
  let out = String(text || '');
  if (keys.length) out = out.replace(new RegExp(`\\b(${keys.sort((a, b) => b.length - a.length).map(escRe).join('|')})\\b`, 'g'), m => P[m]);
  return out.replace(/\b(left|right|Left|Right)\b/g, w => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' }[w]));
}
// Replace whole words in one pass, so a word that is replaced is not replaced again.
function replaceWords(text, map) {
  const keys = Object.keys(map).filter(k => k && map[k] !== k); if (!keys.length) return String(text ?? '');
  return String(text ?? '').replace(new RegExp(`(?<![\\w])(${keys.sort((a, b) => b.length - a.length).map(escRe).join('|')})(?![\\w])`, 'g'), m => map[m]);
}

/* ----- Player lists ----- */
// The labels on the players come from a list: Oztag's eight positions, rugby league's thirteen, or one
// the coach makes. A play keeps its drawing (the eight spots, LW to RW inside) and says which list it
// uses and which label each spot shows. Labels pair up for the attacking-left version by their names
// (Left wing <-> Right wing) or by an L/R at the start of the code. In the play's words, number labels
// are written as names ("Hooker passes to Halfback") so numbers in the text are never mistaken for players.
const SLOT_IDS = SLOT_DEFS.map(s => s.id);
const BUILTIN_SETS = [
  { id: 'oztag', name: 'Oztag', builtin: true, labels: SLOT_DEFS.map(s => ({ code: s.id, name: s.name })) },
  { id: 'league', name: 'Rugby league', builtin: true,
    labels: [['1', 'Fullback'], ['2', 'Right wing'], ['3', 'Right centre'], ['4', 'Left centre'], ['5', 'Left wing'], ['6', 'Five-eighth'], ['7', 'Halfback'],
      ['8', 'Left prop'], ['9', 'Hooker'], ['10', 'Right prop'], ['11', 'Left second row'], ['12', 'Right second row'], ['13', 'Lock']].map(([code, name]) => ({ code, name })),
    slots: { LW: '5', LL: '4', LR: '6', LM: '9', RM: '13', RR: '7', RL: '3', RW: '2' } }
];
const allSets = () => [...BUILTIN_SETS, ...arr((V || data || {}).playerSets)];
const getSet = id => allSets().find(x => x.id === (id || 'oztag')) || BUILTIN_SETS[0];
const isNumberCode = c => /^\d+$/.test(String(c));
function setPairs(set) {
  if (set._pairs) return set._pairs;
  const by = {}, pairs = {};
  set.labels.forEach(l => { by[l.name.toLowerCase()] = l.code; });
  const codes = new Set(set.labels.map(l => l.code));
  set.labels.forEach(l => {
    const other = by[mirrorText(l.name, {}).toLowerCase()];
    if (other && other !== l.code) pairs[l.code] = other;
    else if (/^[LR]/.test(l.code)) { const c = (l.code[0] === 'L' ? 'R' : 'L') + l.code.slice(1); if (codes.has(c)) pairs[l.code] = c; }
  });
  Object.defineProperty(set, '_pairs', { value: pairs, enumerable: false });
  return pairs;
}
const OZTAG_PAIRS = Object.fromEntries(SLOT_IDS.map(id => [id, swapSlot(id)]));
const labelName = (set, code) => (set.labels.find(l => l.code === code) || {}).name || '';
const wordFor = (set, code) => isNumberCode(code) ? labelName(set, code) || code : code;   // how a label is written in the words
const defaultWho = set => set.slots ? { ...set.slots } : Object.fromEntries(SLOT_IDS.map((id, i) => [id, set.id === 'oztag' ? id : (set.labels[i] || {}).code || '']));
const whoOf = (play, slot) => { const w = play.who || {}; return w[slot] !== undefined ? w[slot] : defaultWho(getSet(play.set))[slot]; };
// Pairs for mirroring the words of a play: its list's codes that are written as codes (not as names).
const textPairs = play => { const p = setPairs(getSet(play.set)); return Object.fromEntries(Object.entries(p).filter(([c]) => !isNumberCode(c))); };
const round1 = n => Math.round(n * 10) / 10;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const LINE_XS = [3.6, 10.7, 17.9, 25, 32.1, 39.3, 46.4];
const defaultDefence = (ry, xs = LINE_XS) => ({ marker: [25, ry - 3], line: xs.map(x => [x, ry - 7]) });
const formation = ry => ({
  RM: [25, ry], LM: [24.6, ry + 3.6],
  LR: [18.4, ry + 5], LL: [12.4, ry + 8], LW: [3.2, ry + 10.5],
  RR: [31.6, ry + 5], RL: [37.6, ry + 8], RW: [46.8, ry + 10.5]
});

function starterPlays() {
  const base = (id, rev, name, category, when, headline, steps, extra) => ({
    id, name, category, when, headline, steps, side: 'right', builtin: true, rev,
    players: formation(46), defence: defaultDefence(46), moves: [], focus: [], tags: {}, notes: {}, labels: [], ...extra
  });
  // Ruck plays: zoom in on the ruck. RM leaves the ruck straight away, so it is drawn dashed there.
  const ruck = { ghost: ['RM'], view: { x0: 8, x1: 42, y0: 36, y1: 55.5 } };
  const lm = [24.6, 49.6], catchAt = [28.6, 48.2];
  const bounce = { t: 'run', pts: [[25, 46], catchAt] };
  const ruckNotes = { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'b' } };
  const rmCatches = { at: catchAt, text: 'RM catches', side: 'r', dot: true };
  // Hands: the ball goes through the hands from the dummy half to RW. Each receiver runs at the
  // inside shoulder (towards the ball) or the outside shoulder (away from it) of the defender in front.
  const hands = runs => {
    const at = ([[x0, y0], [x1, y1]], y) => [+(x0 + (x1 - x0) * (y0 - y) / (y0 - y1)).toFixed(2), y];
    return [
      { t: 'pass', pts: [lm, at(runs[0], 50.2)] },
      { t: 'run', key: true, pts: runs[0] },
      { t: 'pass', pts: [at(runs[0], 46), at(runs[1], 48)] },
      { t: 'run', key: true, pts: runs[1] },
      { t: 'pass', pts: [at(runs[1], 44.6), at(runs[2], 47.5)] },
      { t: 'run', key: true, pts: runs[2] }
    ];
  };
  const handsPlay = runs => ({ focus: ['RR', 'RL', 'RW'], view: { x0: 14, x1: 50, y0: 36, y1: 58 },
    players: { ...formation(46), RR: runs[0][0], RL: runs[1][0], RW: runs[2][0] },
    notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'b' } }, moves: hands(runs) });
  return [
    base('quickie-out', 3, 'Quickie Out', 'Ruck', 'Tags 1–3, when their marker or the first defender beside the ruck is slow off the line.',
      'LM steps out left to draw in the marker and their A defender, then passes back to RM, who runs into the space.',
      'RM is tagged, plays the ball fast and bounces out to the right.\nLM, at dummy half, picks up and steps out to the left, drawing in the marker and their left A defender.\nLM passes back to RM.\nRM runs into the space the marker has left, between the marker and the next defender on the right.',
      { ...ruck, focus: ['LM', 'RM'], labels: [rmCatches],
        notes: { LM: { text: 'Dummy half', side: 'b' }, marker: { text: 'Marker', side: 'a' }, d2: { text: 'A defender', side: 'bl' } },
        moves: [
          bounce,
          { t: 'run', key: true, pts: [lm, [22, 46.4]] },
          { t: 'shift', pts: [[25, 43], [23.4, 44.2]] },
          { t: 'shift', pts: [[17.9, 39], [19.9, 41.8]] },
          { t: 'pass', key: true, pts: [[22.4, 47.2], catchAt] },
          { t: 'run', key: true, pts: [catchAt, [28.9, 37.6]] }
        ] }),
    base('quickie-in', 3, 'Quickie In', 'Ruck', 'After a Quickie Out has worked, when the defence starts sliding with RM.',
      'RM bounces out the same way as the Quickie Out, then cuts back inside, behind the marker.',
      'RM plays the ball and bounces out to the right, as in the Quickie Out.\nLM, at dummy half, passes back to RM.\nRM cuts back inside, behind the marker, into the gap on the other side.',
      { ...ruck, focus: ['RM'], notes: { ...ruckNotes, marker: { text: 'Marker', side: 'r' } }, labels: [rmCatches],
        moves: [bounce, { t: 'pass', key: true, pts: [lm, catchAt] },
          { t: 'run', key: true, curve: true, pts: [catchAt, [27.4, 45.6], [25.2, 44.5], [22.6, 42.4], [21.6, 37.6]] }] }),
    // A decoy (dummy) run goes slightly forward at an angle, never back towards our own try line.
    base('ninja', 4, 'Ninja', 'Ruck', 'Only after the Quickies have worked and the marker is chasing RM.',
      'RM’s decoy run drags the marker away, so LM shows the pass and runs through the hole it leaves.',
      'RM plays the ball and runs a decoy line out to the right, slightly forward at an angle.\nLM, at dummy half, shows the pass to RM but keeps the ball.\nThe marker chases RM, and LM steps through the hole it leaves.',
      { ...ruck, focus: ['LM'],
        notes: { LM: { text: 'Dummy half', side: 'b' }, marker: { text: 'Marker', side: 'ar' } },
        labels: [{ at: [28, 44.6], text: 'RM decoy', side: 'r' }],
        moves: [
          { t: 'run', pts: [[25, 46], [31.6, 41.8]] },
          { t: 'dummy', pts: [lm, [27.4, 49.2]] },
          { t: 'shift', pts: [[25, 43], [27.4, 43.3]] },
          { t: 'run', key: true, curve: true, pts: [lm, [23.5, 46.2], [23.5, 43], [23, 37.6]] }
        ] }),
    // Out the back: the dummy half passes, then loops around the back to take the ball again.
    base('out-the-back', 5, 'Out the back', 'Edge', 'Tags 3–5, attacking the wider side of the ruck.',
      'RL’s decoy holds their line, and LM loops around from dummy half to hit the gap.',
      'RM plays the ball.\nLM, at dummy half, passes to RR, then loops around behind RR and RL.\nRR runs at the inside shoulder of their Rover to hold them.\nRL runs a short decoy line at the gap.\nRR passes behind RL to LM, who hits the gap with RW outside.',
      { focus: ['LM'], view: { x0: 14, x1: 50, y0: 37, y1: 57.5 },
        players: { RM: [25, 46], LM: [23.6, 49.6], RR: [31.6, 50.9], RL: [36.4, 47.2], RW: [48.1, 55.6], LR: [17.6, 52.8], LL: [11.6, 54], LW: [4, 55.3] },
        notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half,\nthen loops', side: 'l' }, RL: { text: 'Decoy', side: 'ar' }, RW: { text: 'Stays wide', side: 'l' } },
        labels: [{ at: [40.6, 51.8], text: 'LM catches', side: 'br', dot: true }],
        moves: [
          { t: 'pass', pts: [[23.6, 49.6], [31.6, 50.9]] },
          { t: 'run', pts: [[31.6, 50.9], [31.5, 40.6]] },
          { t: 'run', pts: [[36.4, 47.2], [35, 40.6]] },
          { t: 'run', key: true, curve: true, pts: [[23.6, 49.6], [26.6, 53.4], [31.8, 55.4], [36.8, 55.2], [40.6, 51.8]] },
          { t: 'pass', key: true, pts: [[31.5, 46.4], [40.6, 51.8]] },
          { t: 'run', key: true, pts: [[40.6, 51.8], [43, 40.4]] },
          { t: 'run', pts: [[48.1, 55.6], [48.3, 42.6]] }
        ] }),
    base('hands-inside', 4, 'Hands – inside shoulder', 'Hands', 'To hold their defenders where they are, so the space stays out wide.',
      'Through the hands: each receiver runs at the inside shoulder of the defender in front, towards the ball.',
      'RM plays the ball; LM, at dummy half, passes right to RR.\nRR runs at the inside shoulder of the defender in front (towards the ball), holds them, and passes to RL.\nRL does the same and passes to RW.\nRW runs at the inside shoulder of the last defender.',
      handsPlay([[[33.4, 51], [31, 39.4]], [[40.2, 54], [38.2, 39.4]], [[47.6, 56.5], [45.3, 39.4]]])),
    base('hands-outside', 4, 'Hands – outside shoulder', 'Hands', 'When their defenders are coming in hard, or we have the numbers out wide.',
      'Through the hands: each receiver runs at the outside shoulder of the defender in front, away from the ball.',
      'RM plays the ball; LM, at dummy half, passes right to RR.\nRR runs at the outside shoulder of the defender in front (away from the ball) and passes to RL.\nRL does the same and passes to RW.\nRW takes the outside shoulder of the last defender and goes around them.',
      handsPlay([[[30.2, 51], [33.2, 39.4]], [[36.6, 54], [40.4, 39.4]], [[44.6, 56.5], [47.5, 39.4]]])),
    // Wrap Block, from the coach's drawing: RR passes to RL (W2.1) and wraps around the back, behind
    // RW's block line, to take RL's pass (W2.2). Option: RL passes to RW on the inside line instead.
    base('wrap-block', 6, 'Wrap Block', 'Edge', 'When their edge defenders are holding their spots: the inside lines hold them while RR wraps around.',
      'RR passes and wraps around the back, behind RW’s block line, to take RL’s pass and finish outside.',
      'LM, at dummy half, passes to RR.\nRR runs forward, passes to RL (W2.1), then wraps around behind RL.\nRL runs an inside line, and RW runs a block line in towards the ball, to hold their defenders.\nRR wraps behind RW’s block line, takes RL’s pass (W2.2) and finishes outside the last defender.\nOption: if their defence drifts out to cover the wrap, RL passes to RW on the inside line instead.',
      { focus: ['RR'], view: { x0: 11, x1: 48, y0: 36, y1: 54 },
        players: { RM: [22, 46], LM: [21.6, 49.6], LR: [14.8, 51.6], LL: [8.4, 54], LW: [2.6, 56.5], RR: [28.4, 50.4], RL: [34.8, 50.4], RW: [41.2, 50.4] },
        defence: { marker: [22, 43], line: [3, 9.4, 15.8, 22.2, 28.6, 35, 41.4].map(x => [x, 39]) },
        notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'l' }, RR: { text: 'Passes, then wraps', side: 'b' }, RW: { text: 'Block', side: 'r' } },
        labels: [{ at: [31.6, 45.7], text: 'W2.1', side: 'a' }, { at: [36.5, 43], text: 'W2.2', side: 'b' }, { at: [31.8, 40.9], text: 'Option', side: 'l' }],
        moves: [
          { t: 'pass', pts: [[21.6, 49.6], [28.4, 50.4]] },
          { t: 'run', pts: [[34.8, 50.4], [31.2, 38]] },
          { t: 'run', pts: [[41.2, 50.4], [36.8, 38]] },
          { t: 'run', key: true, curve: true, pts: [[28.4, 50.4], [29.6, 45.7], [32.2, 47.1], [35.1, 47.6], [37.9, 46.8], [39.6, 45.3], [41.6, 41.3], [43.4, 37.6]] },
          { t: 'pass', pts: [[29.6, 45.7], [33.5, 45.8]] },
          { t: 'pass', key: true, pts: [[32.5, 42.4], [40.5, 43.5]] },
          { t: 'pass', opt: true, pts: [[32, 40.8], [37.9, 41.1]] }
        ] }),
    // Back Inside Block, from the coach's drawing: two sweepers (LR inside, LL outside) come across
    // from deep while RR and RL run block lines in. RR, with the ball, passes out to the outside
    // sweeper (1.2), who passes back inside to the inside sweeper (1.3).
    base('back-inside-block', 6, 'Back Inside Block', 'Edge', 'When their defenders push up and slide out: the block lines hold them, and the ball comes back inside.',
      'RR takes the ball on a block line and passes out to the outside sweeper, who gives it back inside to the inside sweeper.',
      'RM plays the ball; LM, at dummy half, passes to RR (1.1).\nLR and LL sweep across from deep behind the ruck: LR on the inside, LL on the outside.\nRR runs a block line in towards the ball and passes out to LL, the outside sweeper (1.2).\nRL runs a second block line in, across the sweepers, to hold their defenders.\nLL passes back inside to LR (1.3), who goes through the gap.',
      { focus: ['LR'], view: { x0: 14, x1: 50, y0: 36, y1: 58 },
        players: { RM: [25, 46], LM: [24.6, 49.6], LR: [28.2, 52.6], LL: [29.6, 56], LW: [3.2, 56.5], RR: [31.6, 51], RL: [40.2, 51.6], RW: [47.2, 56] },
        notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'l' }, LR: { text: 'Inside sweeper', side: 'l' }, LL: { text: 'Outside sweeper', side: 'l' },
          RR: { text: 'Block', side: 'ar' }, RL: { text: 'Block', side: 'bl' } },
        labels: [{ at: [28, 49.8], text: '1.1', side: 'a' }, { at: [33.2, 44.8], text: '1.2', side: 'a' }, { at: [39.75, 42.4], text: '1.3 inside', side: 'a' }],
        moves: [
          { t: 'pass', pts: [[24.6, 49.6], [31.5, 50]] },
          { t: 'run', pts: [[31.6, 51], [29.8, 39.4]] },
          { t: 'run', pts: [[40.2, 51.6], [33.6, 39.4]] },
          { t: 'run', curve: true, pts: [[29.6, 56], [34.4, 56.8], [39.2, 55.4], [42, 52.4], [42.8, 48], [42.6, 43.4], [42, 38.6]] },
          { t: 'run', key: true, curve: true, pts: [[28.2, 52.6], [31.4, 53.6], [34, 52], [35.6, 48.8], [36.6, 45.2], [37.2, 41.8], [37.6, 38.6]] },
          { t: 'pass', pts: [[30.6, 44.6], [42.7, 46]] },
          { t: 'pass', key: true, pts: [[42.5, 42.2], [37, 42.6]] }
        ] })
  ];
}
// Keeps a team's plays in step with the starter plays:
// - a starter whose drawing has changed is swapped for the new one. If the coach had edited it,
//   their version is kept beside the new one as "(your version)", so nothing is lost;
// - starters added since the team last saw the set are added, and retired ones are removed
//   (or kept as the coach's own play if they had edited it).
// The players' copy only follows the coach's: it takes new drawings but never adds, removes or copies.
function upgradePlays(d, coach = true) {
  const starters = starterPlays(), fresh = Object.fromEntries(starters.map(p => [p.id, p]));
  const seen = d.playsRev || Math.max(1, ...arr(d.plays).map(p => p && p.builtin ? (p.rev || 1) : 1));
  const own = p => { const { edited, rev, ...rest } = p; return { ...rest, builtin: false }; };
  let plays = arr(d.plays).flatMap(p => {
    if (!p || !p.builtin) return [p];
    if (coach && seen < STARTER_SET && RETIRED_STARTERS.includes(p.id)) return p.edited ? [own(p)] : [];
    const f = fresh[p.id];
    if (!f || (p.rev || 1) >= f.rev) return [p];
    if (!p.edited) return [f];
    return coach ? [f, { ...own(p), id: uid(), name: `${p.name} (your version)` }] : [p];
  });
  if (coach && seen < STARTER_SET) {
    starters.filter(f => (STARTER_SINCE[f.id] || 1) > seen && !plays.some(p => p.id === f.id)).forEach(f => {
      const order = id => STARTER_IDS.indexOf(id);
      let i = -1; plays.forEach((p, j) => { if (order(p.id) >= 0 && order(p.id) < order(f.id)) i = j; });
      while (plays[i + 1] && order(plays[i + 1].id) < 0 && / \(your version\)$/.test(plays[i + 1].name || '')) i++;
      plays.splice(i + 1, 0, f);
    });
  }
  d.plays = plays;
  if (coach) d.playsRev = STARTER_SET;
  return d;
}

// Phases: phase 1 is the play itself; each later phase (the next ruck) lives in play.phases with its
// own players, defence, lines, words, picture and title.
const phaseCount = play => 1 + arr(play.phases).length;
function phaseView(play, i) {
  const ph = i ? arr(play.phases)[i - 1] : null; if (!ph) return play;
  return { ...play, players: ph.players || {}, defence: ph.defence || defaultDefence(46), moves: ph.moves || [], notes: ph.notes || {}, labels: ph.labels || [],
    view: ph.view, focus: ph.focus || [], ghost: ph.ghost || [], tags: ph.tags || {}, title: ph.title || '' };
}
const phaseTitle = (play, i, side) => { const t = phaseView(play, i).title || ''; return side !== (play.side || 'right') ? mirrorText(t, textPairs(play)) : t; };
// The usual shape around a ruck anywhere on the field, squeezed in near a touch line.
function formationAt(rx, ry) {
  const L = clamp((rx - 2.5) / 3, 2.4, 8), R = clamp((47.5 - rx) / 3, 2.4, 8);
  const P = (x, y) => [round1(clamp(x, 1.5, 48.5)), round1(clamp(y, 1, 79))];
  return { RM: P(rx, ry), LM: P(rx - 0.4, ry + 3.6), LR: P(rx - L, ry + 5), LL: P(rx - 2 * L, ry + 8), LW: P(rx - 3 * L, ry + 10.5),
    RR: P(rx + R, ry + 5), RL: P(rx + 2 * R, ry + 8), RW: P(rx + 3 * R, ry + 10.5) };
}
// Their marker and line 7 m back from a ruck (never behind their own try line), spread across the field.
function defenceAt(rx, ry) {
  const ly = round1(Math.max(5.5, ry - 7)), xs = [];
  for (let k = -8; k <= 8; k++) { const x = rx + k * 6.6; if (x >= 1.8 && x <= 48.2) xs.push(x); }
  xs.sort((a, b) => Math.abs(a - rx) - Math.abs(b - rx));
  return { marker: [round1(rx), round1(Math.max(ly + 1.5, ry - 3))], line: xs.slice(0, 7).sort((a, b) => a - b).map(x => [round1(x), ly]) };
}

function playGeom(play, side) {
  const flip = side !== (play.side || 'right');
  const P = pt => flip ? [+(50 - pt[0]).toFixed(2), pt[1]] : pt;
  const pairs = textPairs(play), set = getSet(play.set), opp = setPairs(set);
  const id = s => flip ? swapSlot(s) : s, txt = t => flip ? mirrorText(t, pairs) : String(t ?? ''), sd = s => flip ? flipSide(s) : (s || '');
  const codes = {}; Object.keys(play.players || {}).forEach(k => { const c = whoOf(play, k); codes[id(k)] = flip ? (opp[c] || c) : c; });
  const players = {}; Object.entries(play.players || {}).forEach(([k, pt]) => { players[id(k)] = P(pt); });
  const tags = {}; Object.entries(play.tags || {}).forEach(([k, v]) => { tags[id(k)] = v; });
  const notes = {}; Object.entries(play.notes || {}).forEach(([k, n]) => { if (n && n.text != null) notes[id(k)] = { text: txt(n.text), side: sd(n.side) }; });
  const labels = (play.labels || []).filter(l => l && l.at && l.text).map(l => ({ ...l, at: P(l.at), text: txt(l.text), side: sd(l.side || 'r') }));
  const focus = (play.focus || []).map(id), ghost = (play.ghost || []).map(id);
  const v = play.view, view = v ? (flip ? { ...v, x0: 50 - v.x1, x1: 50 - v.x0 } : v) : null;
  const d = play.defence || defaultDefence(46);
  return { flip, players, codes, set, tags, notes, labels, focus, ghost, view, headline: txt(play.headline),
    marker: d.marker ? P(d.marker) : null, line: (d.line || []).map(P), moves: (play.moves || []).map(m => ({ ...m, pts: m.pts.map(P) })) };
}
function pathD(pts, curve) {
  const f = p => `${+p[0].toFixed(1)} ${+p[1].toFixed(1)}`;
  if (!curve || pts.length < 3) return 'M' + pts.map(f).join('L');
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d;
}

// Drawing sizes are in screen units, so circles and words stay the same size however far the
// picture is zoomed in. 380 units wide is roughly one unit per pixel on a phone.
const PW = 380, PPAD = 14, PR = 12, DR = 9, DOT = 4.5;
// A play without a chosen picture shows the whole width, as deep as everything on it.
function autoFrame(g) {
  const ys = [...Object.values(g.players), ...g.moves.flatMap(m => m.pts), ...g.line, ...(g.marker ? [g.marker] : []), ...g.labels.map(l => l.at)].map(p => p[1]);
  if (!ys.length) return { x0: 0, x1: 50, y0: 30, y1: 60 };
  return { x0: 0, x1: 50, y0: Math.max(0, Math.floor(Math.min(...ys) - 2.5)), y1: Math.min(80, Math.ceil(Math.max(...ys) + 2.5)) };
}
function playFrame(g, opts) {
  const v = { ...(opts.viewport || (opts.full ? { x0: 0, x1: 50, y0: 0, y1: 80 } : g.view || autoFrame(g))) };
  const k = (PW - 2 * PPAD) / (v.x1 - v.x0);
  const top = v.y0 > 5 && !opts.thumb ? 24 : PPAD;   // room for "Their try line is this way" when it is off the picture
  const H = Math.round(top + (v.y1 - v.y0) * k + PPAD);
  const X = x => +(PPAD + (x - v.x0) * k).toFixed(1), Y = y => +(top + (y - v.y0) * k).toFixed(1);
  const shows = ([x, y]) => X(x) >= 0 && X(x) <= PW && Y(y) >= 0 && Y(y) <= H;
  return { ...v, k, top, H, X, Y, shows };
}
// Words beside a point: side is l, r, a (above), b (below), or a corner such as bl / br.
function svgWords(cx, cy, r, side, text, cls) {
  const lines = String(text).split('\n').filter(l => l.trim()), lh = 13.5, n = lines.length;
  if (!n) return '';
  const h = /l/.test(side) ? 'l' : /r/.test(side) ? 'r' : '', v = /a/.test(side) ? 'a' : /b/.test(side) ? 'b' : /c/.test(side) ? 'c' : '';
  let x = cx, y, anchor = 'middle';
  if (!v) { x = h === 'l' ? cx - r - 6 : cx + r + 6; anchor = h === 'l' ? 'end' : 'start'; y = cy + 4 - (n - 1) * lh / 2; }
  else {
    y = v === 'a' ? cy - r - 6 - (n - 1) * lh : v === 'b' ? cy + r + 13 : cy + 4 - (n - 1) * lh / 2;
    if (h) { x = h === 'l' ? cx - 4 : cx + 4; anchor = h === 'l' ? 'end' : 'start'; }
  }
  return `<text class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${lines.map((l, i) => `<tspan x="${x.toFixed(1)}" ${i ? `dy="${lh}"` : ''}>${esc(l)}</tspan>`).join('')}</text>`;
}
// Start a line at the edge of the player it leaves from, and stop it at the edge of whoever it reaches.
function trimLine(pts, blockers) {
  const out = pts.map(p => p.slice()); if (out.length < 2) return out;
  const near = (p, end) => blockers.find(b => (!end || !b.def) && Math.hypot(b.x - p[0], b.y - p[1]) < b.r + 5);
  const move = (i, j, gap) => {
    const b = near(out[i], i > 0); if (!b) return;
    const dx = out[j][0] - b.x, dy = out[j][1] - b.y, len = Math.hypot(dx, dy);
    if (len > b.r + gap + 4) out[i] = [b.x + dx / len * (b.r + gap), b.y + dy / len * (b.r + gap)];
  };
  move(0, 1, 2); move(out.length - 1, out.length - 2, 3);
  return out;
}
let svgSeq = 0;
function playSVG(play, side, opts = {}) {
  const g = playGeom(play, side), fr = playFrame(g, opts), { X, Y, k, H } = fr, id = `p${++svgSeq}`;
  const thumb = !!opts.thumb, words = !thumb, F = fieldDims(V.team.field);
  const pr = thumb ? 15 : PR, dr = thumb ? 11 : DR, dot = thumb ? 7 : DOT;
  const XY = p => [X(p[0]), Y(p[1])];
  // field: the tint runs to the picture's edge wherever the field carries on past it
  const L = fr.x0 <= 0 ? X(0) : 0, R = fr.x1 >= 50 ? X(50) : PW, T = fr.y0 <= 0 ? Y(0) : 0, B = fr.y1 >= 80 ? Y(80) : H;
  let s = `<svg ${opts.svgId ? `id="${opts.svgId}"` : ''} class="pf${thumb ? ' thumb' : ''}${opts.editor ? ' editor' : ''}" viewBox="0 0 ${PW} ${H}" data-x0="${fr.x0}" data-y0="${fr.y0}" data-k="${k}" data-top="${fr.top}" role="img" aria-label="${esc(play.name || 'Play')}, attacking ${side}">`;
  const aw = thumb ? 22 : 8, ak = thumb ? 24 : 10;
  s += `<defs><marker id="${id}-g" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${aw}" markerHeight="${aw}" orient="auto"><path d="M0 0L10 5L0 10z" class="ah"/></marker><marker id="${id}-b" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${ak}" markerHeight="${ak}" orient="auto"><path d="M0 0L10 5L0 10z" class="ah key"/></marker><marker id="${id}-r" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="${aw}" markerHeight="${aw}" orient="auto"><path d="M0 0L10 5L0 10z" class="ah shift"/></marker></defs>`;
  s += `<rect class="pf-turf" x="${L}" y="${T}" width="${R - L}" height="${B - T}"/>`;
  [[0, 5], [75, 80]].forEach(([a, b]) => { const ya = Math.max(T, Y(a)), yb = Math.min(B, Y(b)); if (yb > ya) s += `<rect class="pf-ingoal" x="${L}" y="${ya}" width="${R - L}" height="${yb - ya}"/>`; });
  const yT = Math.max(T, Y(5)), yB = Math.min(B, Y(75));
  const hline = (y, cls) => { const py = Y(y); if (py > T && py < B) s += `<line class="${cls}" x1="${L}" x2="${R}" y1="${py}" y2="${py}"/>`; };
  F.bounds.slice(1, 5).forEach(bx => { const px = X(bx); if (px > 0 && px < PW && yB > yT) s += `<line class="pf-chan" x1="${px}" x2="${px}" y1="${yT}" y2="${yB}"/>`; });
  hline(5 + F.zone, 'pf-zone'); hline(75 - F.zone, 'pf-zone');
  hline(5, 'pf-line'); hline(75, 'pf-line');
  [0, 50].forEach(x => { const px = X(x); if (px >= 0 && px <= PW) s += `<line class="pf-line" x1="${px}" x2="${px}" y1="${T}" y2="${B}"/>`; });
  if (T > 0 && Y(0) > 0) s += `<line class="pf-line" x1="${L}" x2="${R}" y1="${T}" y2="${T}"/>`;
  if (B < H) s += `<line class="pf-line" x1="${L}" x2="${R}" y1="${B}" y2="${B}"/>`;
  // the field's own labels go on the side away from the play: the left when attacking right
  const away = side === 'left' ? `x="${Math.min(R, PW) - 6}" text-anchor="end"` : `x="${Math.max(L, 0) + 6}"`;
  if (words) {
    if (fr.y0 > 5) s += `<text class="pf-q" ${side === 'left' ? `x="${Math.max(L, 0) + 6}"` : `x="${Math.min(R, PW) - 6}" text-anchor="end"`} y="16">Their try line is this way ↑</text>`;
    else s += `<text class="pf-q" ${away} y="${Y(5) - 6}">Their try line</text>`;
    if (fr.y1 >= 75) s += `<text class="pf-q" ${away} y="${Y(75) + 15}">Our try line</text>`;
    const mid = (Math.max(T, fr.top) + Math.min(B, H - PPAD)) / 2;
    if (!opts.editor && X(50) <= PW - 2) s += `<text class="pf-q" transform="translate(${X(50) - 5} ${mid.toFixed(1)}) rotate(-90)" text-anchor="middle">Touch line</text>`;
    if (!opts.editor && X(0) >= 2) s += `<text class="pf-q" transform="translate(${X(0) + 5} ${mid.toFixed(1)}) rotate(90)" text-anchor="middle">Touch line</text>`;
  }
  // defence
  const defs = g.line.map((p, i) => ({ p, i })).filter(d => opts.editor || fr.shows(d.p));
  defs.forEach(({ p, i }) => { s += `<g class="dfg" data-df="${i}" transform="translate(${X(p[0])} ${Y(p[1])})"><circle class="df" r="${dr}"/></g>`; });
  if (g.marker) s += `<g class="dfg" data-mk="1" transform="translate(${X(g.marker[0])} ${Y(g.marker[1])})"><circle class="df mk" r="${dr}"/></g>`;
  if (words && defs.length) {
    const text = g.notes.line ? g.notes.line.text : 'Their line, 7 m back';
    const ly = Math.min(...defs.map(d => Y(d.p[1]))) - dr - 9;
    if (text) s += `<text class="pf-note" ${away} y="${ly.toFixed(1)}">${esc(text)}</text>`;
  }
  if (words && g.marker) {
    const n = g.notes.marker || { text: 'Marker', side: 'l' };
    if (n.text) s += svgWords(X(g.marker[0]), Y(g.marker[1]), dr, n.side || 'l', n.text, 'pf-note');
  }
  // who is in the play: anyone with a line, a note, a tag or a highlight
  const starts = g.moves.map(m => m.pts[0]);
  const busy = pid => g.focus.includes(pid) || g.notes[pid] || g.tags[pid] || starts.some(q => Math.hypot(q[0] - g.players[pid][0], q[1] - g.players[pid][1]) < 1);
  const shown = Object.entries(g.players).filter(([, p]) => opts.editor || fr.shows(p));
  const dots = g.labels.filter(l => l.dot);
  const blockers = [
    ...shown.map(([, p]) => ({ x: X(p[0]), y: Y(p[1]), r: pr })),
    ...g.line.map(p => ({ x: X(p[0]), y: Y(p[1]), r: dr, def: true })), ...(g.marker ? [{ x: X(g.marker[0]), y: Y(g.marker[1]), r: dr, def: true }] : []),
    ...dots.map(l => ({ x: X(l.at[0]), y: Y(l.at[1]), r: dot }))
  ];
  const player = ([pid, p]) => {
    const tag = g.tags[pid], cls = ['pl', g.focus.includes(pid) && 'focus', g.ghost.includes(pid) && 'ghost', !opts.editor && !busy(pid) && 'idle'].filter(Boolean).join(' ');
    const code = g.codes[pid] ?? pid;
    return `<g class="plg" data-pl="${pid}" data-code="${esc(code)}" data-x="${p[0]}" data-y="${p[1]}" transform="translate(${X(p[0])} ${Y(p[1])})"><circle class="${cls}" r="${pr}"/>${words ? `<text class="plt" y="4">${esc(code)}</text>` : ''}${tag ? `<circle class="tg" cx="${pr * .78}" cy="${-pr * .78}" r="${thumb ? 7 : 6.5}"/>${words ? `<text class="tgt" x="${pr * .78}" y="${-pr * .78 + 3.2}">${esc(tag)}</text>` : ''}` : ''}</g>`;
  };
  shown.filter(([pid]) => g.ghost.includes(pid)).forEach(e => { s += player(e); });
  g.moves.forEach((m, i) => {
    const pts = trimLine(m.pts.map(XY), blockers);
    const head = m.t === 'shift' ? 'r' : m.key ? 'b' : 'g';
    const d = pathD(pts, m.curve);
    s += `<path class="mv ${m.t}${m.key && m.t !== 'shift' ? ' key' : ''}${m.opt ? ' opt' : ''}" d="${d}"${m.t === 'dummy' ? '' : ` marker-end="url(#${id}-${head})"`}${opts.editor ? ` data-mv="${i}"` : ''}/>`;
    if (opts.editor) s += `<path class="mv-hit" d="${d}" data-mv="${i}"/>`;
  });
  if (opts.drawing && opts.drawing.pts.length) {
    s += `<path class="mv draft" d="${pathD(opts.drawing.pts.map(XY), opts.drawing.curve)}"/>`;
    opts.drawing.pts.forEach(p => { s += `<circle class="draft-pt" cx="${X(p[0])}" cy="${Y(p[1])}" r="4"/>`; });
  }
  dots.forEach(l => { s += `<circle class="dot" cx="${X(l.at[0])}" cy="${Y(l.at[1])}" r="${dot}"/>`; });
  shown.filter(([pid]) => !g.ghost.includes(pid)).forEach(e => { s += player(e); });
  if (words) {
    shown.forEach(([pid, p]) => { const n = g.notes[pid]; if (n && n.text) s += svgWords(X(p[0]), Y(p[1]), pr, n.side || 'r', n.text, 'pf-note'); });
    defs.forEach(({ p, i }) => { const n = g.notes['d' + i]; if (n && n.text) s += svgWords(X(p[0]), Y(p[1]), dr, n.side || 'r', n.text, 'pf-note'); });
    g.labels.forEach((l, i) => { s += svgWords(X(l.at[0]), Y(l.at[1]), l.dot ? dot : 0, l.side || 'r', l.text, (l.dot ? 'pf-lbl' : 'pf-note') + (opts.editor ? '" data-lb="' + i : '')); });
  }
  if (opts.editor) g.labels.forEach((l, i) => { s += `<circle class="ped-lbh" data-lb="${i}" cx="${X(l.at[0])}" cy="${Y(l.at[1])}" r="11"/>`; });
  if (opts.overlay) s += opts.overlay(fr);
  if (opts.anim) s += `<g class="ball" transform="translate(-40 -40)"><ellipse rx="6.5" ry="4.6" transform="rotate(-35)"/><path d="M-3.2 -1.6L3.2 1.6" transform="rotate(-35)"/></g>`;
  return s + '</svg>';
}
function playLegend(play, side) {
  const g = playGeom(play, side), kinds = new Set(g.moves.map(m => m.t));
  const grey = '#8F9A93', blue = '#2F6FD6';
  const sw = (dash, colour, arrow = true, w = 1.6) => `<svg width="30" height="10" viewBox="0 0 30 10" aria-hidden="true"><line x1="1" y1="5" x2="${arrow ? 22 : 29}" y2="5" stroke="${colour}" stroke-width="${w}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>${arrow ? `<path d="M21 1.5L28.5 5L21 8.5z" fill="${colour}"/>` : ''}</svg>`;
  return `<div class="legend play-legend">
    ${kinds.has('run') ? `<span>${sw('', grey)}Run</span>` : ''}
    ${kinds.has('pass') ? `<span>${sw('5 4', grey)}Pass</span>` : ''}
    ${kinds.has('kick') ? `<span>${sw('1 4.5', grey)}Kick</span>` : ''}
    ${kinds.has('dummy') ? `<span>${sw('3 3', grey, false)}Dummy pass</span>` : ''}
    ${g.moves.some(m => m.opt) ? `<span style="opacity:.6">${sw('5 4', grey)}Option</span>` : ''}
    ${g.moves.some(m => m.key && m.t !== 'shift') ? `<span>${sw('', blue, true, 2.4)}The key moves</span>` : ''}
    ${kinds.has('shift') ? `<span>${sw('', '#C4513F')}Defender moves</span>` : ''}
    <span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="${grey}" stroke-width="1.3"/></svg>Defender</span>
  </div>`;
}
const playById = id => V.plays.find(p => p.id === id);
const playSteps = (play, side) => {
  const text = side !== (play.side || 'right') ? mirrorText(play.steps, textPairs(play)) : play.steps;
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
};
const playWhen = (play, side) => side !== (play.side || 'right') ? mirrorText(play.when, textPairs(play)) : (play.when || '');
const playHeadline = (play, side) => side !== (play.side || 'right') ? mirrorText(play.headline, textPairs(play)) : (play.headline || '');

function viewPlays() {
  const coach = isCoach();
  if (state.playId && playById(state.playId)) return viewPlay(playById(state.playId));
  state.playId = null;
  const missing = STARTER_IDS.filter(id => !V.plays.some(p => p.id === id)).length;
  return `<div class="sec-h"><h2>Plays</h2>${coach ? `<button class="btn primary sm" data-act="play-new">${icon('plus', 18)}New play</button>` : ''}</div>
    <p class="hint" style="margin:-4px 0 12px">Every play works both ways. Open one and switch between attacking left and right.${coach ? ` <button class="link-btn inline" data-act="psets">Player lists</button>` : ''}</p>
    ${V.plays.length ? `<div class="list grid plays-grid">${V.plays.map(p => `<button class="play-row" data-act="play-open" data-id="${esc(p.id)}">
      <span class="play-thumb">${playSVG(p, state.playSide, { thumb: true })}</span>
      <span class="grow"><span class="name" style="display:block">${esc(p.name)}${coach && p.lib ? ' <span class="pill neutral">Library</span>' : ''}</span><span class="sub play-when">${p.set && p.set !== 'oztag' ? `${esc(getSet(p.set).name)} · ` : ''}${phaseCount(p) > 1 ? `${phaseCount(p)} phases · ` : ''}${esc(playHeadline(p, state.playSide) || playWhen(p, state.playSide))}</span></span>
      <span class="pill neutral">${esc(p.category || 'Other')}</span>
    </button>`).join('')}</div>` : `<div class="empty"><p>${coach ? 'No plays yet. Add one, or restore the starter plays.' : 'No plays yet.'}</p></div>`}
    ${coach && missing ? `<button class="link-btn" data-act="plays-restore">Restore the ${missing} missing starter play${missing === 1 ? '' : 's'}</button>` : ''}`;
}
function viewPlay(p) {
  const side = state.playSide, coach = isCoach(), steps = playSteps(p, side), when = playWhen(p, side);
  state.playPhase = clamp(state.playPhase || 0, 0, phaseCount(p) - 1);
  return `<button class="toggle-past" data-act="play-back">← All plays</button>
    <div class="sec-h"><h2>${esc(p.name)}</h2><span class="pills">${p.set && p.set !== 'oztag' ? `<span class="pill neutral">${esc(getSet(p.set).name)}</span>` : ''}<span class="pill neutral">${esc(p.category || 'Other')}</span></span></div>
    <div class="seg" role="group" aria-label="Direction">
      <button data-act="play-side" data-side="left" aria-pressed="${side === 'left'}">Attacking left</button>
      <button data-act="play-side" data-side="right" aria-pressed="${side === 'right'}">Attacking right</button>
    </div>
    <div class="cols play-cols"><div class="col">
    <figure class="play-card" id="play-fig">${playFigure(p, side, state.playPhase)}</figure>
    </div><div class="col">
    ${when ? `<section class="sec play-when-sec"><h3 class="play-h">When to use it</h3><p>${esc(when)}</p></section>` : ''}
    ${steps.length ? `<section class="sec"><h3 class="play-h">Steps</h3><ol class="steps">${steps.map(l => `<li>${esc(l)}</li>`).join('')}</ol></section>` : ''}
    ${libBar('plays', p.id, p)}
    ${coach ? `<div class="btn-row"><button class="btn" data-act="play-edit" data-id="${esc(p.id)}">Edit</button><button class="btn" data-act="play-dup" data-id="${esc(p.id)}">${icon('copy', 18)}Duplicate</button><button class="btn wa" data-act="play-share" data-id="${esc(p.id)}">${icon('chat', 18)}Send</button></div>
      <button class="btn danger block" style="margin-top:10px" data-act="play-del" data-id="${esc(p.id)}">Delete this play</button>` : ''}
    </div></div>`;
}
function playFigure(p, side, i) {
  const view = phaseView(p, i), n = phaseCount(p), head = playHeadline(p, side), title = phaseTitle(p, i, side);
  return `${head ? `<figcaption class="play-headline">${esc(head)}</figcaption>` : ''}
    ${n > 1 ? `<div class="seg phase-bar" role="group" aria-label="Phase">${Array.from({ length: n }, (_, j) => `<button data-act="play-phase" data-i="${j}" aria-pressed="${j === i}">Phase ${j + 1}</button>`).join('')}</div>` : ''}
    ${title ? `<p class="phase-title">${esc(title)}</p>` : ''}
    ${playSVG(view, side, { anim: true })}
    ${playLegend(view, side)}
    ${castKey(view, side)}
    <div class="anim-bar">
      <button type="button" class="btn sm primary" data-act="anim-play">${anim.playing ? 'Pause' : anim.done ? 'Play again' : 'Play'}</button>
      <button type="button" class="btn sm${anim.slow ? ' on' : ''}" data-act="anim-slow" aria-pressed="${!!anim.slow}">Slow</button>
      ${n > 1 ? `<span class="muted small">Phase ${i + 1} of ${n}</span>` : ''}
    </div>`;
}

// What the labels mean, when they aren't Oztag's: "7 Halfback · 9 Hooker ..."
function castKey(play, side) {
  const g = playGeom(play, side); if (g.set.id === 'oztag') return '';
  const fr = playFrame(g, {}), shown = Object.entries(g.players).filter(([, q]) => fr.shows(q)).map(([id]) => g.codes[id]);
  const codes = [...new Set(shown.filter(Boolean))].sort((a, b) => (parseFloat(a) || 99) - (parseFloat(b) || 99) || String(a).localeCompare(b));
  return `<p class="cast-key">${codes.map(c => `<span><b>${esc(c)}</b> ${esc(labelName(g.set, c))}</span>`).join('')}</p>`;
}

/* ----- Player lists (coach) ----- */
function openPlayerLists() {
  const used = id => data.plays.filter(p => (p.set || 'oztag') === id).length;
  openSheet('Player lists', `<p class="hint" style="margin:-4px 0 12px">A play shows its players with labels from one of these lists. To use a list, duplicate or edit a play and pick it under Player labels: the drawing stays the same and only the labels and words change.</p>
    <div class="list">${allSets().map(x => `<div class="row" style="padding:10px 8px 10px 14px">
      <span class="grow"><span class="name" style="display:block">${esc(x.name)}</span><span class="sub">${x.labels.length} players · ${x.labels.map(l => esc(l.code)).join(' ')}${used(x.id) ? ` · used by ${used(x.id)} play${used(x.id) === 1 ? '' : 's'}` : ''}</span></span>
      ${x.builtin ? `<button class="btn sm" data-act="pset-copy" data-id="${esc(x.id)}">Copy</button>` : `<button class="btn sm" data-act="pset-edit" data-id="${esc(x.id)}">Edit</button>`}
    </div>${x.builtin ? '' : `<div class="pset-lib">${libBar('playerSets', x.id, x)}</div>`}`).join('')}</div>
    <button class="btn primary block" style="margin-top:14px" data-act="pset-new">New list</button>
    <p class="hint" style="margin-top:12px">League tag, for example, is played with up to 11 a side from 13 years up.</p>`, 'psets');
}
function openPlayerListForm(x) {
  const lines = x ? x.labels.map(l => `${l.code} ${l.name}`).join('\n') : '';
  openSheet(x && x.id ? `Edit ${x.name}` : 'New player list', `<form data-form="pset" autocomplete="off">
    <input type="hidden" name="id" value="${esc(x && x.id || '')}">
    <label class="field-l"><span>Name</span><input type="text" name="name" required value="${esc(x ? x.name : '')}" placeholder="e.g. League tag"></label>
    <label class="field-l"><span>Players, one per line: the label, then the name</span><textarea name="labels" rows="12" placeholder="1 Fullback&#10;2 Right wing&#10;3 Right centre&#10;4 Left centre&#10;5 Left wing&#10;6 Five-eighth&#10;7 Halfback">${esc(lines)}</textarea>
      <small>Labels show inside the players' circles, so keep them to 3 or 4 characters. Players pair up for the attacking-left version when their names say Left and Right (Left wing and Right wing), or when the label starts with L or R (LC and RC). The first eight go on the eight spots of a play when you switch it to this list; change any of them in the editor.</small></label>
    <button class="btn primary block" type="submit">Save list</button>
    ${x && x.id ? `<button type="button" class="btn danger block" style="margin-top:10px" data-act="pset-del" data-id="${esc(x.id)}">Delete this list</button>` : ''}
  </form>`, 'pset');
}

/* ----- Animation ----- */
// A phase plays out like this: each player runs along their lines (a run belongs to the player it
// starts on; a run that starts where another ends carries on from it), and the ball goes through the
// passes in the order they were drawn. A pass leaves when the passer reaches it and lands as the
// receiver gets there, so players hurry or wait a little to stay in time. Players who never touch
// the ball (decoys, block lines) run while the ball is being moved. Option passes are left out.
const RUN_SPEED = 5, BALL_SPEED = 14;   // metres a second, as shown
const anim = { raf: 0, playing: false, done: false, slow: false, plan: null, t: 0, last: 0, hold: 0 };
const pathLen = pts => pts.slice(1).reduce((s, q, i) => s + dist(pts[i], q), 0);
function pointAt(pts, a) {
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (a <= d) { const f = d ? Math.max(0, a) / d : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; }
    a -= d;
  }
  return pts[pts.length - 1].slice();
}
// How far along a path the nearest point to p is, and how far p is from it.
function arcOf(pts, p) {
  let best = { a: 0, d: dist(pts[0], p) }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i], L = dist(A, B), dx = B[0] - A[0], dy = B[1] - A[1];
    const f = L ? clamp(((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / (L * L), 0, 1) : 0, d = dist([A[0] + dx * f, A[1] + dy * f], p);
    if (d < best.d) best = { a: acc + L * f, d };
    acc += L;
  }
  return best;
}
// The points along a drawn line, following the curve when it is curved.
function linePoints(m) {
  const P = m.pts; if (!m.curve || P.length < 3) return P.map(q => q.slice());
  const out = [P[0].slice()];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    for (let k = 1; k <= 8; k++) {
      const t = k / 8, u = 1 - t, b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      out.push([0, 1].map(j => b[0] * p1[j] + b[1] * c1[j] + b[2] * c2[j] + b[3] * p2[j]));
    }
  }
  return out;
}
function planPhase(g) {
  const runs = g.moves.filter(m => m.t === 'run').map(m => ({ pts: linePoints(m), used: false }));
  const paths = {};
  Object.entries(g.players).forEach(([id, p]) => {
    let pts = [p.slice()], end = p;
    for (let n = 0; n < 6; n++) {
      const next = runs.find(r => !r.used && dist(r.pts[0], end) < 1); if (!next) break;
      next.used = true; pts = pts.concat(next.pts.slice(1)); end = next.pts[next.pts.length - 1];
    }
    paths[id] = { pts, len: pathLen(pts), keys: [] };
  });
  const ids = Object.keys(paths);
  const nearest = (p, lim, not, prefer) => {
    let best = null;
    ids.filter(id => id !== not).forEach(id => { const r = arcOf(paths[id].pts, p); if (r.d <= lim && (!best || r.d < best.d)) best = { id, ...r }; });
    if (prefer && prefer !== not) { const r = arcOf(paths[prefer].pts, p); if (r.d <= lim + 1) return { id: prefer, ...r }; }
    return best;
  };
  const last = id => paths[id].keys[paths[id].keys.length - 1];
  const natural = (id, a) => { const k = last(id) || [0, 0.3]; return k[1] + Math.max(0, a - k[0]) / RUN_SPEED; };
  const passes = [];
  let carrier = null, free = 0.3;
  g.moves.filter(m => (m.t === 'pass' || m.t === 'kick') && !m.opt).forEach(m => {
    const S = m.pts[0], E = m.pts[m.pts.length - 1];
    const from = nearest(S, 1.6, null, carrier); if (!from) return;
    const to = nearest(E, 2.4, from.id); if (!to) return;
    const aS = Math.max(from.a, last(from.id) ? last(from.id)[0] : 0), aE = Math.max(to.a, last(to.id) ? last(to.id)[0] : 0);
    const flight = dist(S, E) / (m.t === 'kick' ? 10 : BALL_SPEED);
    const t0 = Math.max(natural(from.id, aS), natural(to.id, aE) - flight, free, last(from.id) ? last(from.id)[1] : 0);
    const t1 = Math.max(t0 + flight, last(to.id) ? last(to.id)[1] : 0);
    paths[from.id].keys.push([aS, t0]); paths[to.id].keys.push([aE, t1]);
    passes.push({ from: from.id, to: to.id, S, E, t0, t1, kick: m.t === 'kick' });
    carrier = to.id; free = t1 + 0.15;
  });
  if (!passes.length) {   // no passes: the ball stays with whoever shows a dummy pass, or the key player
    const dm = g.moves.find(m => m.t === 'dummy'), from = dm && nearest(dm.pts[0], 1.6);
    carrier = from ? from.id : (g.focus.find(id => paths[id]) || null);
  }
  const tA = passes.length ? passes[0].t0 : 0.3, tB = passes.length ? passes[passes.length - 1].t1 : 0.3;
  ids.forEach(id => {
    const P = paths[id]; if (P.len < 0.3) { P.keys = [[0, 0]]; return; }
    if (!P.keys.length) { P.keys = [[0, tA], [P.len, tA + Math.max(P.len / RUN_SPEED, tB - tA)]]; return; }
    P.keys.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < P.keys.length; i++) P.keys[i][1] = Math.max(P.keys[i][1], P.keys[i - 1][1]);
    const k0 = P.keys[0]; if (k0[0] > 0.01) P.keys.unshift([0, Math.max(0.3, k0[1] - k0[0] / RUN_SPEED)]);
    const kN = P.keys[P.keys.length - 1]; if (kN[0] < P.len - 0.01) P.keys.push([P.len, kN[1] + (P.len - kN[0]) / RUN_SPEED]);
  });
  const shifts = g.moves.filter(m => m.t === 'shift').map(m => {
    const pts = linePoints(m), at = pts[0];
    const who = g.marker && dist(g.marker, at) < 1 ? 'mk' : g.line.findIndex(q => dist(q, at) < 1);
    return { who, pts, len: pathLen(pts), t0: tA, t1: tA + Math.max(0.9, (tB - tA) * 0.8) };
  }).filter(s => s.who !== -1);
  const T = Math.max(0.6, ...ids.map(id => paths[id].keys[paths[id].keys.length - 1][1]), ...passes.map(p => p.t1), ...shifts.map(s => s.t1)) + 0.4;
  return { paths, passes, shifts, T, first: passes.length ? passes[0].from : carrier, carrier };
}
const arcAt = (keys, t) => {
  if (t <= keys[0][1]) return keys[0][0];
  for (let i = 1; i < keys.length; i++) { const [a0, t0] = keys[i - 1], [a1, t1] = keys[i]; if (t <= t1) return t1 > t0 ? a0 + (a1 - a0) * (t - t0) / (t1 - t0) : a1; }
  return keys[keys.length - 1][0];
};
function animFrame(svg, plan, t) {
  const d = svg.dataset, k = +d.k, X = x => (PPAD + (x - +d.x0) * k).toFixed(1), Y = y => (+d.top + (y - +d.y0) * k).toFixed(1);
  const at = {};
  Object.entries(plan.paths).forEach(([id, P]) => {
    const q = at[id] = pointAt(P.pts, arcAt(P.keys, t)), el = svg.querySelector(`[data-pl="${id}"]`);
    if (el) el.setAttribute('transform', `translate(${X(q[0])} ${Y(q[1])})`);
  });
  plan.shifts.forEach(s => {
    const el = svg.querySelector(s.who === 'mk' ? '[data-mk]' : `[data-df="${s.who}"]`); if (!el) return;
    const q = pointAt(s.pts, s.len * clamp((t - s.t0) / (s.t1 - s.t0), 0, 1));
    el.setAttribute('transform', `translate(${X(q[0])} ${Y(q[1])})`);
  });
  const ball = svg.querySelector('.ball'); if (!ball) return;
  const fly = plan.passes.find(p => t >= p.t0 && t < p.t1);
  let b = null;
  if (fly) { const f = (t - fly.t0) / (fly.t1 - fly.t0); b = [fly.S[0] + (fly.E[0] - fly.S[0]) * f, fly.S[1] + (fly.E[1] - fly.S[1]) * f]; }
  else {
    const done = plan.passes.filter(p => p.t1 <= t), who = done.length ? done[done.length - 1].to : plan.first;
    if (who && at[who]) b = [at[who][0], at[who][1]];
  }
  if (!b) { ball.setAttribute('transform', 'translate(-40 -40)'); return; }
  const off = fly ? 0 : 9;   // carried in the right hand
  ball.setAttribute('transform', `translate(${(+X(b[0]) + off).toFixed(1)} ${(+Y(b[1]) - off).toFixed(1)})`);
}
function animStop(keepDone) {
  if (anim.raf) cancelAnimationFrame(anim.raf);
  anim.raf = 0; anim.playing = false; if (!keepDone) anim.done = false;
  const svg = $('#play-fig svg'); if (svg) svg.classList.remove('animating');
}
function animButtons() {
  const b = $('[data-act="anim-play"]'); if (b) b.textContent = anim.playing ? 'Pause' : anim.done ? 'Play again' : 'Play';
}
function animShowPhase(p, i) {
  state.playPhase = i;
  const fig = $('#play-fig'); if (!fig) return null;
  fig.innerHTML = playFigure(p, state.playSide, i);
  const svg = fig.querySelector('svg');
  anim.plan = planPhase(playGeom(phaseView(p, i), state.playSide)); anim.t = 0;
  return svg;
}
function animStart() {
  const p = playById(state.playId); if (!p) return;
  if (anim.playing) { animStop(); animButtons(); return; }                // pause
  if (anim.done || !anim.plan || anim.planFor !== `${p.id}/${state.playSide}/${state.playPhase}`) {
    animShowPhase(p, anim.done && state.playPhase === phaseCount(p) - 1 ? 0 : state.playPhase);
    anim.planFor = `${p.id}/${state.playSide}/${state.playPhase}`;
  }
  anim.done = false; anim.playing = true; anim.last = performance.now(); anim.hold = 0;
  const svg0 = $('#play-fig svg'); if (svg0) svg0.classList.add('animating');
  animButtons();
  const tick = now => {
    const svg = $('#play-fig svg'); if (!svg || !anim.playing) return;
    const dt = Math.min(0.05, (now - anim.last) / 1000) * (anim.slow ? 0.45 : 1); anim.last = now;
    if (anim.hold > 0) {   // a short pause at the end of a phase before the next ruck
      anim.hold -= dt;
      if (anim.hold <= 0) {
        const next = animShowPhase(p, state.playPhase + 1);
        anim.planFor = `${p.id}/${state.playSide}/${state.playPhase}`;
        if (next) { next.classList.add('animating'); animButtons(); }
      }
    } else {
      anim.t = Math.min(anim.plan.T, anim.t + dt);
      animFrame(svg, anim.plan, anim.t);
      if (anim.t >= anim.plan.T) {
        if (state.playPhase < phaseCount(p) - 1) anim.hold = 0.9;
        else { anim.playing = false; anim.done = true; anim.raf = 0; animButtons(); return; }
      }
    }
    anim.raf = requestAnimationFrame(tick);
  };
  anim.raf = requestAnimationFrame(tick);
}

/* ----- Play editor (coach) ----- */
// The editor draws the play attacking right; the app makes the left version.
//   Select    tap a line, player, defender or label to change it, or drag it to move it. A chosen
//             line shows handles on its start, bends and end: drag them, or drag a small + to add a bend.
//   Run, Pass, Dummy, Kick, Defender   drag from where the line starts to where it ends.
//   Label     tap the field to put words there, or a player or defender to put words beside them.
//   Picture   drag the frame's edges to set how wide and deep the picture is.
const PED_TOOLS = [['select', 'Select'], ['run', 'Run'], ['pass', 'Pass'], ['dummy', 'Dummy'], ['kick', 'Kick'], ['shift', 'Defender'], ['label', 'Label'], ['frame', 'Picture']];
const PED_NAMES = Object.fromEntries(PED_TOOLS);
const PED_DRAW = ['run', 'pass', 'dummy', 'kick', 'shift'];
const PED_SIDES = [['l', 'Left'], ['r', 'Right'], ['a', 'Above'], ['b', 'Below'], ['al', 'Above left'], ['ar', 'Above right'], ['bl', 'Below left'], ['br', 'Below right']];

function blankPlay() {
  return { id: uid(), name: '', category: 'Other', when: '', headline: '', steps: '', side: 'right', builtin: false,
    players: formation(46), defence: defaultDefence(46), moves: [], focus: [], tags: {}, ghost: [], notes: {}, labels: [] };
}
function openPlayEditor(play) {
  const draft = JSON.parse(JSON.stringify(play || blankPlay()));
  if (draft.side && draft.side !== 'right') {   // edit everything in the attacking-right orientation
    const tp = textPairs(draft), op = setPairs(getSet(draft.set));
    const right = view => { const g = playGeom(view, 'right'); return { players: g.players, tags: g.tags, focus: g.focus, ghost: g.ghost, notes: g.notes, labels: g.labels, view: g.view || undefined, moves: g.moves, defence: { marker: g.marker, line: g.line }, title: mirrorText(view.title, tp) }; };
    const phases = arr(draft.phases).map((ph, i) => right(phaseView(draft, i + 1)));
    const who = draft.who ? Object.fromEntries(Object.entries(draft.who).map(([k, c]) => [swapSlot(k), op[c] || c])) : undefined;
    Object.assign(draft, right(draft), { side: 'right', phases, who, steps: mirrorText(draft.steps, tp), when: mirrorText(draft.when, tp), headline: mirrorText(draft.headline, tp) });
  }
  const tidy = ph => {
    ph.defence = ph.defence || defaultDefence(46); ph.defence.line = ph.defence.line || [];
    ['moves', 'focus', 'ghost', 'labels'].forEach(k => { ph[k] = ph[k] || []; });
    ph.notes = ph.notes || {}; ph.tags = ph.tags || {}; ph.players = ph.players || formation(46);
  };
  tidy(draft); draft.phases = arr(draft.phases); draft.phases.forEach(tidy);
  state.ped = { draft, phase: 0, tool: 'select', key: false, curve: false, sel: null, selH: null, whole: false, undo: [], dirty: false, tab: 'diagram' };
  openSheet(play ? `Edit ${play.name}` : 'New play', `<form data-form="play" autocomplete="off" class="ped">
    <div class="two">
      <label class="field-l"><span>Name</span><input type="text" name="name" value="${esc(draft.name)}" placeholder="e.g. Blind-side wrap"></label>
      <label class="field-l"><span>Type</span><select name="category">${[...PLAY_CATS, ...(PLAY_CATS.includes(draft.category) ? [] : [draft.category])].map(c => `<option ${c === draft.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    </div>
    <div class="seg" role="group" aria-label="What to edit">
      <button type="button" data-act="ped-tab" data-tab="diagram" aria-pressed="true">Diagram</button>
      <button type="button" data-act="ped-tab" data-tab="words" aria-pressed="false">Words</button>
    </div>
    <div id="ped-words" hidden>
      <label class="field-l"><span>Headline</span><input type="text" name="headline" value="${esc(draft.headline)}" placeholder="What the play does, in one line"></label>
      <label class="field-l"><span>When to use it</span><input type="text" name="when" value="${esc(draft.when)}" placeholder="e.g. Tag 5 inside their 14 m"></label>
      <label class="field-l"><span>Steps, one per line</span><textarea name="steps" rows="6" placeholder="Use LW, LL, LR, LM, RM, RR, RL, RW so the left version swaps them automatically.">${esc(draft.steps)}</textarea></label>
      ${playRulesField(draft)}
    </div>
    <div id="ped-diagram" class="ped-diagram">
      <div class="ped-phases" id="ped-phases"></div>
      <div class="ped-meta">
      <label class="field-l ped-list"><span>Player labels</span><select data-change="ped-list">${allSets().map(x => `<option value="${esc(x.id)}" ${x.id === getSet(draft.set).id ? 'selected' : ''}>${esc(x.name)} (${x.labels.length})</option>`).join('')}</select></label>
      <label class="field-l ped-ptitle"><span id="ped-ptitle-l">Phase 1</span><input type="text" id="ped-ptitle" data-input="ped-ptitle" value="${esc(draft.title || '')}" placeholder="What happens in this phase, e.g. Tag 2: hands right"></label>
      </div>
      <div class="seg ped-tools" id="ped-tools" role="group" aria-label="Tool"></div>
      <div class="ped-main">
        <div class="play-card ped-card"><div id="ped-field"></div></div>
        <div class="ped-under"><button type="button" class="btn sm" data-act="ped-undo">Undo</button><button type="button" class="btn sm" data-act="ped-whole">Show the whole field</button></div>
      </div>
      <div id="ped-panel" class="ped-panel"></div>
    </div>
    <div class="ped-save"><button class="btn primary block" type="submit">Save play</button></div>
  </form>`, 'play-editor');
  const panel = $('#sheet .panel'); if (panel) panel.classList.add('wide');
  bindPlayEditor(); refreshPlayEditor();
}

// The phase being edited (phase 1 is the play itself), and how it looks with the rest of the play.
const pedCur = E => E.phase ? E.draft.phases[E.phase - 1] : E.draft;
const pedView = E => phaseView(E.draft, E.phase);
// The picture frame: the phase's chosen view, or the automatic one.
const pedFrame = E => pedCur(E).view || autoFrame(playGeom(pedView(E), 'right'));
// The editor shows the frame with a margin around it, or the whole field. It holds still while dragging.
function pedViewport(E) {
  if (E.lockView) return E.lockView;
  if (E.whole || E.placing) return { x0: 0, x1: 50, y0: 0, y1: 80 };
  const f = pedFrame(E), m = 4;
  return { x0: Math.max(0, f.x0 - m), x1: Math.min(50, f.x1 + m), y0: Math.max(0, f.y0 - m), y1: Math.min(80, f.y1 + m) };
}
function frameFit(f, edge) {
  const v = { ...f }, MW = 10, MD = 8;
  if (edge === 'x0') v.x0 = clamp(v.x0, 0, v.x1 - MW);
  if (edge === 'x1') v.x1 = clamp(v.x1, v.x0 + MW, 50);
  if (edge === 'y0') v.y0 = clamp(v.y0, 0, v.y1 - MD);
  if (edge === 'y1') v.y1 = clamp(v.y1, v.y0 + MD, 80);
  return { x0: round1(v.x0), x1: round1(v.x1), y0: round1(v.y0), y1: round1(v.y1) };
}
function frameMove(f, dx, dy) {
  const w = f.x1 - f.x0, h = f.y1 - f.y0, x0 = clamp(f.x0 + dx, 0, 50 - w), y0 = clamp(f.y0 + dy, 0, 80 - h);
  return { x0: round1(x0), x1: round1(x0 + w), y0: round1(y0), y1: round1(y0 + h) };
}
// Fit the picture to the lines, labels and the players in the play, with their defensive line.
function fitView(play) {
  const g = playGeom(play, 'right'), starts = g.moves.map(m => m.pts[0]);
  const busy = Object.entries(g.players).filter(([id, p]) => g.focus.includes(id) || (g.notes[id] && g.notes[id].text) || starts.some(q => dist(q, p) < 1)).map(([, p]) => p);
  const pts = [...g.moves.flatMap(m => m.pts), ...g.labels.map(l => l.at), ...busy];
  if (!pts.length) return autoFrame(g);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let x0 = Math.min(...xs) - 3, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 2.5, y1 = Math.max(...ys) + 2.5;
  const near = g.line.filter(p => p[0] >= x0 && p[0] <= x1).map(p => p[1]);
  if (near.length) y0 = Math.min(y0, Math.min(...near) - 2.5);
  if (x1 - x0 < 16) { const c = (x0 + x1) / 2; x0 = c - 8; x1 = c + 8; }
  if (x0 < 0) { x1 -= x0; x0 = 0; } if (x1 > 50) { x0 -= x1 - 50; x1 = 50; }
  return { x0: round1(Math.max(0, x0)), x1: round1(x1), y0: round1(Math.max(0, y0)), y1: round1(Math.min(80, y1)) };
}

// Each undo step keeps the drawing as it was. A step that also changed the words on the Words tab
// (a player's label, or the player list) keeps those words too.
const PED_WORDS = ['headline', 'when', 'steps'];
const pedWords = () => Object.fromEntries(PED_WORDS.map(k => { const f = $(`#sheet [name=${k}]`); return [k, f ? f.value : '']; }));
function pedSnap(words = null) {
  const E = state.ped; if (!E) return;
  E.undo.push({ draft: JSON.stringify(E.draft), words }); if (E.undo.length > 60) E.undo.shift();
  E.dirty = true;
}
// Rename players in every word of the play: the phases' notes, labels and titles, and the Words tab.
function pedRenameWords(map) {
  const E = state.ped;
  [E.draft, ...E.draft.phases].forEach(ph => {
    Object.values(ph.notes || {}).forEach(n => { if (n && n.text) n.text = replaceWords(n.text, map); });
    (ph.labels || []).forEach(l => { l.text = replaceWords(l.text, map); });
    if (ph.title) ph.title = replaceWords(ph.title, map);
  });
  PED_WORDS.forEach(k => { const f = $(`#sheet [name=${k}]`); if (f) f.value = replaceWords(f.value, map); });
  pedSyncTitle();
}
// A spot shows a different label from the play's list. If another spot had it, they swap labels.
// Only the labels change: every spot keeps its lines, words and highlight.
function pedSetWho(slot, code) {
  const E = state.ped, d = E.draft, set = getSet(d.set), cur = whoOf(d, slot); if (cur === code) return;
  const other = SLOT_IDS.find(s => s !== slot && whoOf(d, s) === code);
  pedSnap(pedWords());
  d.who = { ...Object.fromEntries(SLOT_IDS.map(s => [s, whoOf(d, s)])), [slot]: code, ...(other ? { [other]: cur } : {}) };
  pedRenameWords({ [wordFor(set, cur)]: wordFor(set, code), ...(other ? { [wordFor(set, code)]: wordFor(set, cur) } : {}) });
}
// Use another player list: every spot takes that list's label for it, and the words follow.
function pedSetList(id) {
  const E = state.ped, d = E.draft, from = getSet(d.set), to = getSet(id); if (from.id === to.id) return;
  const who = defaultWho(to), map = {};
  SLOT_IDS.forEach(s => { const a = wordFor(from, whoOf(d, s)), b = wordFor(to, who[s]); if (a && b) map[a] = b; });
  pedSnap(pedWords());
  d.set = to.id; d.who = who;
  pedRenameWords(map);
}
function pedSelect(sel) { const E = state.ped; E.sel = sel; E.selH = null; E.textSnap = false; }
function pedNearest(E, p, kind, r) {
  const d = pedCur(E);
  const list = kind === 'defence' ? [...(d.defence.marker ? [d.defence.marker] : []), ...d.defence.line] : Object.values(d.players);
  const best = list.map(q => ({ q, d: dist(q, p) })).sort((a, b) => a.d - b.d)[0];
  return best && best.d <= r ? best.q.slice() : null;
}
const pedNoteKey = sel => sel.k === 'pl' ? sel.id : sel.k === 'mk' ? 'marker' : 'd' + sel.i;

function pedOverlay(E, fr) {
  const { X, Y, H } = fr, d = pedCur(E), f = pedFrame(E);
  if (E.placing) return '';
  const fx0 = X(f.x0), fx1 = X(f.x1), fy0 = Y(f.y0), fy1 = Y(f.y1);
  let s = `<path class="ped-dim" fill-rule="evenodd" d="M0 0H${PW}V${H}H0Z M${fx0} ${fy0}V${fy1}H${fx1}V${fy0}Z"/>`;
  s += `<rect class="ped-frame${d.view ? '' : ' auto'}" x="${fx0}" y="${fy0}" width="${(fx1 - fx0).toFixed(1)}" height="${(fy1 - fy0).toFixed(1)}"/>`;
  if (E.tool === 'frame') {
    s += `<rect class="ped-fbody" data-fb="1" x="${fx0}" y="${fy0}" width="${(fx1 - fx0).toFixed(1)}" height="${(fy1 - fy0).toFixed(1)}"/>`;
    const bar = (e, x, y, w, h) => `<rect class="ped-edge ${e[0]}" data-fe="${e}" x="${(x - w / 2).toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w}" height="${h}" rx="5"/>`;
    const cx = (fx0 + fx1) / 2, cy = (fy0 + fy1) / 2;
    s += bar('y0', cx, fy0, 48, 14) + bar('y1', cx, fy1, 48, 14) + bar('x0', fx0, cy, 14, 48) + bar('x1', fx1, cy, 14, 48);
  }
  const sel = E.sel;
  if (sel && sel.k === 'mv' && d.moves[sel.i]) {
    const m = d.moves[sel.i], pts = m.pts.map(p => [X(p[0]), Y(p[1])]);
    s += `<path class="ped-glow" d="${pathD(pts, m.curve)}"/>`;
    pts.slice(1).forEach((q, j) => { const a = pts[j]; s += `<g class="ped-add" data-hadd="${j}" transform="translate(${((a[0] + q[0]) / 2).toFixed(1)} ${((a[1] + q[1]) / 2).toFixed(1)})"><circle r="8"/><path d="M-4 0H4M0 -4V4"/></g>`; });
    pts.forEach((q, j) => { s += `<circle class="ped-h${j === 0 ? ' start' : ''}${E.selH === j ? ' on' : ''}" data-h="${j}" cx="${q[0]}" cy="${q[1]}" r="8"/>`; });
  }
  const ring = (p, r) => `<circle class="ped-ring" cx="${X(p[0])}" cy="${Y(p[1])}" r="${r}"/>`;
  if (sel && sel.k === 'pl' && d.players[sel.id]) s += ring(d.players[sel.id], PR + 5);
  if (sel && sel.k === 'df' && d.defence.line[sel.i]) s += ring(d.defence.line[sel.i], DR + 5);
  if (sel && sel.k === 'mk' && d.defence.marker) s += ring(d.defence.marker, DR + 5);
  if (sel && sel.k === 'lb' && d.labels[sel.i]) s += ring(d.labels[sel.i].at, 11);
  if (E.drawing) {
    const pts = E.drawing.pts.map(p => [X(p[0]), Y(p[1])]);
    s += `<path class="mv draft" d="${pathD(pts)}"/>` + pts.map(q => `<circle class="draft-pt" cx="${q[0]}" cy="${q[1]}" r="4"/>`).join('');
  }
  return s;
}
function pedPanel(E) {
  const d = pedCur(E), sel = E.sel;
  if (E.placing) return `<div class="ped-h3">Add phase ${phaseCount(E.draft) + 1}</div><p class="hint" style="margin:0 0 10px">Tap the field where the next ruck is. The team lines up around it, with their defence 7 m back.</p><button type="button" class="btn sm" data-act="ped-phase-cancel">Cancel</button>`;
  const btn = (act, label, on, extra = '') => `<button type="button" class="btn sm${on ? ' on' : ''}" data-act="${act}" aria-pressed="${!!on}" ${extra}>${label}</button>`;
  const del = (label) => `<button type="button" class="btn sm danger" data-act="ped-del">${label}</button>`;
  const sides = side => `<label class="field-l"><span>Where the words go</span><select data-change="ped-side">${PED_SIDES.map(([v, l]) => `<option value="${v}" ${v === side ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  if (sel && sel.k === 'mv' && d.moves[sel.i]) {
    const m = d.moves[sel.i], bend = E.selH > 0 && E.selH < m.pts.length - 1;
    return `<div class="ped-h3">${MOVE_KINDS[m.t] || m.t}${m.key ? ', a key move' : ''}</div>
      <div class="seg ped-types" role="group" aria-label="Line type">${PED_DRAW.map(t => `<button type="button" data-act="ped-mv-type" data-t="${t}" aria-pressed="${m.t === t}">${PED_NAMES[t]}</button>`).join('')}</div>
      <div class="btn-row">${m.t !== 'shift' ? btn('ped-mv', 'Key move (blue)', m.key, 'data-f="key"') : ''}${btn('ped-mv', 'Curved', m.curve, 'data-f="curve"')}${m.t === 'pass' || m.t === 'kick' ? btn('ped-mv', 'Option', m.opt, 'data-f="opt"') : ''}${bend ? btn('ped-mv', 'Remove this bend', false, 'data-f="unbend"') : ''}${del('Delete line')}</div>
      <p class="hint">Drag the round handles to move the start, the end or a bend. Drag a small + to add a bend. Drag the line itself to move all of it.${m.t === 'pass' || m.t === 'kick' ? ' An Option pass is drawn lighter and left out when the play is animated.' : ''}</p>`;
  }
  if (sel && ['pl', 'df', 'mk'].includes(sel.k)) {
    const key = pedNoteKey(sel), n = d.notes[key];
    const text = n ? n.text : sel.k === 'mk' ? 'Marker' : '';
    const set = getSet(E.draft.set), code = sel.k === 'pl' ? whoOf(E.draft, sel.id) : '';
    const who = sel.k === 'pl' ? (code ? `${code}${labelName(set, code) && labelName(set, code) !== code ? ` · ${labelName(set, code)}` : ''}` : 'No label') : sel.k === 'mk' ? 'The marker' : 'Defender';
    let s = `<div class="ped-h3">${esc(who)}</div>`;
    if (sel.k === 'pl') {
      s += `<div class="ped-sub">Who plays here <span class="muted">(${esc(set.name)})</span></div>
        <div class="seg ped-codes" role="group" aria-label="Who plays here">${set.labels.map(l => `<button type="button" data-act="ped-who" data-code="${esc(l.code)}" aria-pressed="${l.code === code}" title="${esc(l.name)}">${esc(l.code)}</button>`).join('')}</div>
        <p class="hint" style="margin:-4px 0 12px">Tap another label to put that player here (if someone else had it, they swap). The lines and words stay on this spot, and the play's words change to match.</p>`;
      s += `<div class="btn-row" style="margin-bottom:10px">${btn('ped-pl', 'Highlight', d.focus.includes(sel.id), 'data-f="focus"')}${btn('ped-pl', 'Female (F)', d.tags[sel.id] === 'F', 'data-f="tag"')}${btn('ped-pl', 'Dashed: leaves this spot', d.ghost.includes(sel.id), 'data-f="ghost"')}</div>`;
    }
    s += `<label class="field-l"><span>Words beside ${sel.k === 'pl' ? esc(code || 'them') : 'them'}</span><textarea id="ped-text" data-input="ped-text" rows="2" placeholder="${sel.k === 'pl' ? 'e.g. Dummy half' : 'e.g. A defender'}">${esc(text)}</textarea></label>`;
    s += sides((n && n.side) || (sel.k === 'mk' ? 'l' : 'r'));
    if (sel.k !== 'pl') s += `<label class="field-l"><span>Words above their line</span><input type="text" data-input="ped-line" value="${esc(d.notes.line ? d.notes.line.text : 'Their line, 7 m back')}"></label>`;
    return s + `<p class="hint">Drag ${sel.k === 'pl' ? 'the player to move them; lines that start or end on them move too' : 'them to move them'}.</p>`;
  }
  if (sel && sel.k === 'lb' && d.labels[sel.i]) {
    const l = d.labels[sel.i];
    return `<div class="ped-h3">Label</div>
      <label class="field-l"><span>Words</span><textarea id="ped-text" data-input="ped-text" rows="2">${esc(l.text)}</textarea></label>
      ${sides(l.side || 'r')}
      <div class="btn-row">${btn('ped-lb-dot', 'Blue dot on the spot', l.dot)}${del('Delete label')}</div>
      <p class="hint">Drag the label's spot to move it.</p>`;
  }
  if (E.tool === 'frame') {
    const f = pedFrame(E);
    return `<div class="ped-h3">Picture: ${round1(f.x1 - f.x0)} m wide, ${round1(f.y1 - f.y0)} m deep${d.view ? '' : ' (automatic)'}</div>
      <div class="btn-row">${btn('ped-frame', 'Fit to the phase', false, 'data-f="fit"')}${btn('ped-frame', 'Whole width', false, 'data-f="width"')}${btn('ped-frame', 'Whole field', false, 'data-f="field"')}${d.view ? btn('ped-frame', 'Automatic', false, 'data-f="auto"') : ''}</div>
      <p class="hint">Drag the blue handles to set how wide and deep the picture is, or drag inside the frame to move it. Anything outside the frame is left out of the picture.</p>`;
  }
  if (PED_DRAW.includes(E.tool)) {
    return `<div class="ped-h3">Draw ${E.tool === 'shift' ? 'defender moves' : MOVE_KINDS[E.tool].toLowerCase() + ' lines'}</div>
      <div class="btn-row">${E.tool !== 'shift' ? btn('ped-opt', 'Key move (blue)', E.key, 'data-f="key"') : ''}${btn('ped-opt', 'Curved', E.curve, 'data-f="curve"')}</div>
      <p class="hint">${E.tool === 'shift' ? 'Drag from a defender to where they move.' : E.tool === 'pass' || E.tool === 'dummy' ? 'Drag from the passer (or a point on their run) to the receiver.' : 'Drag from a player to where the line ends.'} Tap a line to change it.</p>`;
  }
  if (E.tool === 'label') return `<p class="hint">Tap the field to add words there, or tap a player or defender to put words beside them.</p>`;
  return `<p class="hint">Tap a line, player, defender or label to change it, or drag it to move it. Pick Run, Pass, Dummy, Kick or Defender to draw a new line, and Picture to set how much of the field shows.</p>`;
}
function refreshPedField() {
  const E = state.ped, box = $('#ped-field'); if (!E || !box) return;
  box.innerHTML = playSVG(pedView(E), 'right', { editor: true, svgId: 'ped-svg', viewport: pedViewport(E), overlay: fr => pedOverlay(E, fr) });
}
function refreshPlayEditor() {
  const E = state.ped; if (!E || !$('#ped-field')) return;
  const n = phaseCount(E.draft);
  $('#ped-phases').innerHTML = `<div class="seg phase-bar" role="group" aria-label="Phase">${Array.from({ length: n }, (_, j) => `<button type="button" data-act="ped-phase" data-i="${j}" aria-pressed="${j === E.phase && !E.placing}">Phase ${j + 1}</button>`).join('')}<button type="button" data-act="ped-phase-add" aria-pressed="${!!E.placing}">+ Phase</button></div>
    ${E.phase ? `<button type="button" class="link-btn ped-phase-del" data-act="ped-phase-del">Delete phase ${E.phase + 1}</button>` : ''}`;
  $('#ped-ptitle-l').textContent = n > 1 ? `Phase ${E.phase + 1}` : 'Phase 1 (add more phases for the next rucks)';
  $('#ped-tools').innerHTML = PED_TOOLS.map(([k, l]) => `<button type="button" data-act="ped-tool" data-t="${k}" aria-pressed="${E.tool === k}">${l}</button>`).join('');
  refreshPedField();
  $('#ped-panel').innerHTML = pedPanel(E);
  const u = $('[data-act="ped-undo"]'); if (u) u.disabled = !E.undo.length;
  const w = $('[data-act="ped-whole"]'); if (w) w.textContent = E.whole ? 'Zoom to the picture' : 'Show the whole field';
  if (E.focusText) { E.focusText = false; const t = $('#ped-text'); if (t) { t.focus(); t.select(); } }
}
function pedSyncTitle() {
  const E = state.ped, t = $('#ped-ptitle'); if (E && t) t.value = pedCur(E).title || '';
}
function pedSetPhase(i) {
  const E = state.ped; E.phase = clamp(i, 0, E.draft.phases.length); E.placing = false; pedSelect(null); E.drawing = null;
  pedSyncTitle(); refreshPlayEditor();
}
// A new phase: the team lines up around the next ruck, with their defence 7 m back.
function pedAddPhase(at) {
  const E = state.ped, rx = round1(clamp(at[0], 3, 47)), ry = round1(clamp(at[1], 12, 76));
  pedSnap();
  E.draft.phases.push({ title: '', players: formationAt(rx, ry), defence: defenceAt(rx, ry), moves: [], focus: [], ghost: [], tags: {}, labels: [],
    notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'l' } } });
  E.whole = E.wasWhole || false;
  pedSetPhase(E.draft.phases.length);
  const t = $('#ped-ptitle'); if (t) t.focus();
}
function pedUndo() {
  const E = state.ped; if (!E || !E.undo.length) return;
  const step = E.undo.pop();
  E.draft = JSON.parse(step.draft); E.selH = null; E.drawing = null; E.textSnap = false;
  E.phase = Math.min(E.phase, E.draft.phases.length); pedSyncTitle();
  if (step.words) PED_WORDS.forEach(k => { const f = $(`#sheet [name=${k}]`); if (f) f.value = step.words[k]; });
  const d = pedCur(E), s = E.sel;   // keep the selection if it is still there
  if (s && !((s.k === 'mv' && d.moves[s.i]) || (s.k === 'lb' && d.labels[s.i]) || (s.k === 'pl' && d.players[s.id]) || (s.k === 'df' && d.defence.line[s.i]) || (s.k === 'mk' && d.defence.marker))) E.sel = null;
  refreshPlayEditor();
}
function pedDelete() {
  const E = state.ped; if (!E || !E.sel) return false;
  const d = pedCur(E), sel = E.sel;
  if (sel.k === 'mv' && d.moves[sel.i]) { pedSnap(); d.moves.splice(sel.i, 1); }
  else if (sel.k === 'lb' && d.labels[sel.i]) { pedSnap(); d.labels.splice(sel.i, 1); }
  else return false;
  pedSelect(null); refreshPlayEditor(); return true;
}
// What a tap landed on.
function pedPick(t) {
  const hit = q => t && t.closest && t.closest(q);
  const h = hit('[data-pl]'); if (h) return { k: 'pl', id: h.dataset.pl };
  if (hit('[data-mk]')) return { k: 'mk' };
  const df = hit('[data-df]'); if (df) return { k: 'df', i: +df.dataset.df };
  const lb = hit('[data-lb]'); if (lb) return { k: 'lb', i: +lb.dataset.lb };
  const mv = hit('[data-mv]'); if (mv) return { k: 'mv', i: +mv.dataset.mv };
  return null;
}
function bindPlayEditor() {
  const box = $('#ped-field'); if (!box) return;
  let drag = null, raf = 0;
  const svgEl = () => box.querySelector('svg');
  const toMetres = e => {
    const s = svgEl(), p = s.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(s.getScreenCTM().inverse()), d = s.dataset;
    return [clamp(round1(+d.x0 + (q.x - PPAD) / +d.k), 0, 50), clamp(round1(+d.y0 + (q.y - +d.top) / +d.k), 0, 80)];
  };
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; refreshPedField(); }); };
  // points of lines that start or end on a spot, so they follow the player or defender there
  const anchored = (d, spot) => d.moves.flatMap((m, i) => m.pts.map((q, j) => (j === 0 || j === m.pts.length - 1) && dist(q, spot) < 0.4 ? [i, j] : null).filter(Boolean));
  box.addEventListener('pointerdown', e => {
    const E = state.ped, s = svgEl(); if (!E || !s || (e.button && e.button > 0)) return;
    const p = toMetres(e), t = e.target, d = pedCur(E), hit = q => t.closest && t.closest(q);
    if (E.placing) { pedAddPhase(p); e.preventDefault(); return; }
    E.lockView = pedViewport(E);
    drag = { p0: p, moved: false, tap: t };
    const h = hit('[data-h]'), add = hit('[data-hadd]'), fe = hit('[data-fe]'), fb = hit('[data-fb]');
    if (E.sel && E.sel.k === 'mv' && d.moves[E.sel.i] && (h || add)) {
      if (add) { pedSnap(); const j = +add.dataset.hadd + 1; d.moves[E.sel.i].pts.splice(j, 0, p); E.selH = j; Object.assign(drag, { kind: 'handle', j, moved: true }); }
      else { E.selH = +h.dataset.h; Object.assign(drag, { kind: 'handle', j: E.selH }); }
      refreshPlayEditor();
    } else if (E.tool === 'frame' && (fe || fb)) {
      Object.assign(drag, { kind: fe ? 'edge' : 'frame', edge: fe && fe.dataset.fe, f0: { ...pedFrame(E) } });
    } else if (PED_DRAW.includes(E.tool)) {
      drag.kind = 'draw';
      drag.start = pedNearest(E, p, E.tool === 'shift' ? 'defence' : 'players', 2) || p;
    } else if (E.tool === 'label') {
      drag.kind = 'label';
    } else {
      const sel = pedPick(t); pedSelect(sel);
      if (sel && sel.k === 'pl') Object.assign(drag, { kind: 'pl', orig: d.players[sel.id].slice(), links: anchored(d, d.players[sel.id]) });
      else if (sel && sel.k === 'df') Object.assign(drag, { kind: 'df', orig: d.defence.line[sel.i].slice(), links: anchored(d, d.defence.line[sel.i]) });
      else if (sel && sel.k === 'mk') Object.assign(drag, { kind: 'mk', orig: d.defence.marker.slice(), links: anchored(d, d.defence.marker) });
      else if (sel && sel.k === 'lb') Object.assign(drag, { kind: 'lb', orig: d.labels[sel.i].at.slice() });
      else if (sel && sel.k === 'mv') Object.assign(drag, { kind: 'mv', orig: d.moves[sel.i].pts.map(q => q.slice()) });
      else drag.kind = 'none';
      refreshPlayEditor();
    }
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
    e.preventDefault();
  });
  box.addEventListener('pointermove', e => {
    const E = state.ped; if (!drag || !E) return;
    const p = toMetres(e), d = pedCur(E);
    if (!drag.moved) {
      if (dist(p, drag.p0) < 0.6) return;
      drag.moved = true;
      if (!['draw', 'label', 'none'].includes(drag.kind)) pedSnap();
    }
    const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
    const shift = q => [clamp(round1(q[0] + dx), 0, 50), clamp(round1(q[1] + dy), 0, 80)];
    const follow = to => (drag.links || []).forEach(([i, j]) => { if (d.moves[i]) d.moves[i].pts[j] = to.slice(); });
    switch (drag.kind) {
      case 'handle': d.moves[E.sel.i].pts[drag.j] = p; break;
      case 'draw': E.drawing = { pts: [drag.start, p] }; break;
      case 'edge': d.view = frameFit({ ...drag.f0, [drag.edge]: drag.edge[0] === 'x' ? p[0] : p[1] }, drag.edge); break;
      case 'frame': d.view = frameMove(drag.f0, dx, dy); break;
      case 'pl': d.players[E.sel.id] = shift(drag.orig); follow(d.players[E.sel.id]); break;
      case 'df': d.defence.line[E.sel.i] = shift(drag.orig); follow(d.defence.line[E.sel.i]); break;
      case 'mk': d.defence.marker = shift(drag.orig); follow(d.defence.marker); break;
      case 'lb': d.labels[E.sel.i].at = shift(drag.orig); break;
      case 'mv': d.moves[E.sel.i].pts = drag.orig.map(shift); break;
      default: return;
    }
    later();
  });
  const end = e => {
    const E = state.ped, k = drag; drag = null;
    try { box.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    if (!E || !k) return;
    const d = pedCur(E);
    if (k.kind === 'draw') {
      const line = E.drawing; E.drawing = null;
      if (k.moved && line && dist(line.pts[0], line.pts[1]) >= 1) {
        pedSnap();
        let to = line.pts[1];
        if (E.tool === 'pass' || E.tool === 'dummy') to = pedNearest(E, to, 'players', 1.8) || to;
        d.moves.push({ t: E.tool, pts: [line.pts[0], to], ...(E.key && E.tool !== 'shift' ? { key: true } : {}), ...(E.curve ? { curve: true } : {}) });
        pedSelect({ k: 'mv', i: d.moves.length - 1 });
      } else pedSelect(pedPick(k.tap));   // a tap picks what it landed on
    } else if (k.kind === 'label' && !k.moved) {
      const sel = pedPick(k.tap);
      if (sel && sel.k !== 'mv') pedSelect(sel);
      else { pedSnap(); d.labels.push({ at: k.p0, text: 'Label', side: k.p0[0] > 38 ? 'l' : 'r' }); pedSelect({ k: 'lb', i: d.labels.length - 1 }); }
      E.focusText = true;
    } else if (k.kind === 'handle' && k.moved && E.sel && d.moves[E.sel.i]) {
      const m = d.moves[E.sel.i], last = m.pts.length - 1;
      if (k.j === 0 || k.j === last) { const near = pedNearest(E, m.pts[k.j], m.t === 'shift' && k.j === 0 ? 'defence' : 'players', 1.5); if (near) m.pts[k.j] = near; }
    }
    E.lockView = null;
    refreshPlayEditor();
  };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
}
function playShareText(p, side) {
  const steps = playSteps(p, side), when = playWhen(p, side), head = playHeadline(p, side), n = phaseCount(p);
  const phases = n > 1 ? `\n\n${Array.from({ length: n }, (_, i) => `Phase ${i + 1}${phaseTitle(p, i, side) ? `: ${phaseTitle(p, i, side)}` : ''}`).join('\n')}` : '';
  return `🏉 *${p.name}* (attacking ${side})${head ? `\n${head}` : ''}${when ? `\n\n_When:_ ${when}` : ''}${phases}\n\n${steps.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
}

/* ---------- Tasks ---------- */
// Volunteer jobs (the BBQ, the gear bag, lifts) given to players and to helpers: family, friends and
// people from the community who aren't on the squad. Everyone sees every task and whether each spot
// is taken, open or done; only the coach sees who is on it, so the players' copy carries no names
// (see teamView in vault.js). Each person on a task is asked, yes, can't (no) or done, and someone
// who can't frees their spot. A lift task has drivers, each offering seats, and riders put in a car.
// A person is 'p:<player id>' or 'h:<helper id>'.
const TASK_KINDS = { bbq: 'BBQ and food', gear: 'Gear', lift: 'Lifts', firstaid: 'First aid', kit: 'Uniforms', setup: 'Set up and pack up', other: 'Other' };
const TASK_STATUS = M.TASK_STATES;   // Invited, Accepted, Declined, Done
const TASK_IDEAS = ['Run the BBQ', 'Bring the gear bag', 'Bring the first aid kit', 'Bring ice and water', 'Wash the playing tops', 'Set up the field', 'Pack up', 'Take photos', 'Lifts'];
const CHECKLISTS = {
  gameday: { name: 'Game day', items: [['Run the BBQ', 'bbq', 3], ['Bring the gear bag', 'gear', 1], ['Bring the first aid kit', 'firstaid', 1], ['Bring ice and water', 'bbq', 1], ['Wash the playing tops', 'kit', 1], ['Lifts', 'lift', 0]] },
  trip: { name: 'Tournament trip', items: [['Lifts to the tournament', 'lift', 0], ['Book the accommodation', 'other', 1], ['Team dinner', 'bbq', 2], ['Bring the gear bag', 'gear', 1], ['Bring the first aid kit', 'firstaid', 1], ['Wash the playing tops each night', 'kit', 2]] }
};
const taskById = id => arr(V.tasks).find(t => t.id === id);
const byWhen = (a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')) || String(a.title).localeCompare(String(b.title));
const helperById = id => arr(V.helpers).find(h => h.id === id);
function personOf(who) {
  const [k, id] = String(who || '').split(':');
  const x = k === 'p' ? playerById(id) : k === 'h' ? helperById(id) : null;
  return x ? { who, helper: k === 'h', name: x.name || '?', phone: x.phone || '', x } : null;
}
const sortedHelpers = () => arr(V.helpers).slice().sort((a, b) => a.name.localeCompare(b.name));
const everyone = () => [...sortedPlayers().map(p => 'p:' + p.id), ...sortedHelpers().map(h => 'h:' + h.id)];
const whoName = who => { const p = personOf(who); return p ? p.name : 'Someone removed'; };
const whoShort = who => { const p = personOf(who); return p ? shortName(p) : 'Removed'; };
// A helper's tie to the squad, for the coach: "Mia's mum", or the player they're linked to.
const helperTie = h => h.relation || (h.playerId && playerById(h.playerId) ? `${firstName(playerById(h.playerId))}’s family` : '');

// How a task stands (see coverage and liftPlan in model.js). Only accepted and done replies fill a
// spot; an invitation nobody has answered is counted apart. On a lift, seats only count once the
// driver has accepted. The players' copy has the same numbers without the names.
const liftOf = t => M.liftPlan(t);
const covOf = t => M.coverage(t);
const taskSpots = t => M.spotsOf(covOf(t));
// Still to find: spots with nobody confirmed or invited for them (a lift: riders without a confirmed seat).
const taskOpen = t => !t.cancelled && (t.kind === 'lift' ? M.liftShort(liftOf(t)) : covOf(t).toFind > 0);
// Not covered yet: fewer confirmed than needed. Players can offer to help until it is.
const taskShort = t => !t.cancelled && (t.kind === 'lift' ? M.liftShort(liftOf(t)) : covOf(t).short > 0);
const taskAsked = t => !t.cancelled && arr(t.people).some(p => p.status === 'asked');
const taskDone = t => t.kind === 'lift' ? (() => { const L = liftOf(t); return L.cars.length > 0 && L.cars.every(c => c.done) && !L.waiting && !L.tentative; })() : covOf(t).complete;
const taskWhen = t => [t.start ? fmtTime(t.start) + (t.end ? '–' + fmtTime(t.end) : '') : '', t.place].filter(Boolean).join(' · ');
// How much each person has helped: done, accepted and invited for what's coming up, declined.
const taskLoad = () => M.volunteerLoad(V, todayISO());
const loadOf = M.loadOf;
const loadBusy = L => L.done + L.accepted + L.invited;
const loadText = L => [L.done ? `helped ${L.done}×` : 'not helped yet', L.accepted ? `${L.accepted} accepted` : '', L.invited ? `${L.invited} invited` : ''].filter(Boolean).join(' · ');

function viewTaskList() {
  const coach = isCoach(), today = todayISO();
  const all = arr(V.tasks).slice().sort(byWhen);
  const up = all.filter(t => t.date >= today), past = all.filter(t => t.date < today).reverse();
  const sets = { up, need: up.filter(taskOpen), waiting: up.filter(taskAsked), done: up.filter(t => !t.cancelled && !taskShort(t)), past };
  if (!coach && state.taskFilter === 'waiting') state.taskFilter = 'up';
  const f = sets[state.taskFilter] ? state.taskFilter : 'up', list = sets[f];
  const chip = (k, l) => `<button class="chip" data-act="task-filter" data-f="${k}" aria-pressed="${f === k}">${l} (${sets[k].length})</button>`;
  const contact = V.team.tasksContact || {};
  return `<div class="sec-h"><h2>Tasks</h2>${coach ? `<div class="btn-row"><button class="btn sm" data-act="task-checklist">Checklist</button><button class="btn primary sm" data-act="task-new">${icon('plus', 18)}New task</button></div>` : ''}</div>
    ${taskDashboard(up)}
    <div class="chips">${chip('up', 'Upcoming')}${chip('need', 'Still to find')}${coach ? chip('waiting', 'Awaiting replies') : ''}${chip('done', 'Covered')}${chip('past', 'Past')}</div>
    ${list.length ? `<div class="list grid sess-grid task-grid">${list.map(taskRow).join('')}</div>`
      : `<div class="empty"><p>${f === 'need' ? 'Every upcoming task has people confirmed or invited.' : f === 'waiting' ? 'No invitations are waiting on a reply.' : f === 'done' ? 'No upcoming task is fully covered yet.' : f === 'past' ? 'No past tasks.'
        : coach ? 'No tasks yet. Add one, or start from a game-day checklist.' : 'No jobs need a hand right now.'}</p>
        ${coach && f === 'up' ? `<div class="btn-row" style="justify-content:center"><button class="btn primary" style="flex:0" data-act="task-new">${icon('plus')}New task</button><button class="btn" style="flex:0" data-act="task-checklist">Checklist</button></div>` : ''}</div>`}
    ${coach ? `<div class="btn-row" style="margin-top:14px"><button class="btn wa" data-act="task-ask">${icon('chat', 18)}Ask the team for help</button></div>
      <p class="hint">Players and helpers see every task and whether each spot is confirmed, invited or open, but not who is on it. ${contact.phone ? `When they tap “I can help” it messages ${esc(contact.name || 'you')}.` : 'Add a team contact in Settings so “I can help” goes straight to you.'}</p>`
      : `<p class="hint">Tap “I can help” to tell ${esc(contact.name || 'the team manager')} you can take a spot.</p>`}`;
}
// A summary over the upcoming tasks: confirmed cover against what's needed, invitations waiting on a
// reply, spots nobody has been asked for yet, and riders without a confirmed seat.
function taskDashboard(up) {
  const live = up.filter(t => !t.cancelled), jobs = live.filter(t => t.kind !== 'lift'), lifts = live.filter(t => t.kind === 'lift');
  if (!live.length) return '';
  const sum = k => jobs.reduce((n, t) => n + covOf(t)[k], 0), L = lifts.map(liftOf);
  const waiting = L.reduce((n, x) => n + x.waiting, 0), tentative = L.reduce((n, x) => n + x.tentative, 0);
  return `<div class="stats task-stats" role="group" aria-label="Upcoming tasks">
    <div class="stat"><b>${sum('confirmed')}<small>/${sum('need')}</small></b><span>Spots confirmed</span></div>
    <div class="stat"><b>${sum('invited')}</b><span>Invited, no reply</span></div>
    <div class="stat"><b class="${sum('toFind') ? 'open-t' : ''}">${sum('toFind')}</b><span>Still to find</span></div>
    <div class="stat"><b class="${waiting ? 'open-t' : ''}">${lifts.length ? waiting : '–'}</b><span>${lifts.length ? `Need a seat${tentative ? ` (+${tentative} tentative)` : ''}` : 'No lifts'}</span></div>
  </div>`;
}
function spotsHtml(t) {
  const c = covOf(t), spots = M.spotsOf(c);
  const label = t.cancelled ? 'Cancelled' : c.complete ? 'Done' : `${c.confirmed} of ${c.need} confirmed${c.invited ? ` · ${c.invited} awaiting reply` : ''}${c.toFind ? ` · <b class="open-t">${c.toFind} open</b>` : ''}`;
  const aria = `${c.confirmed} of ${c.need} spots confirmed${c.done ? `, ${c.done} done` : ''}${c.invited ? `, ${c.invited} invited and awaiting a reply` : ''}${c.toFind ? `, ${c.toFind} open` : ''}`;
  return `<span class="spot-line"><span class="spots" role="img" aria-label="${aria}">${spots.map(s => `<i class="spot ${s}"></i>`).join('')}</span><span class="small">${label}</span></span>`;
}
function liftHtml(t) {
  const L = liftOf(t), conf = L.cars.filter(c => c.confirmed).length, asked = L.cars.length - conf;
  const cars = !L.cars.length ? '<b class="open-t">Drivers needed</b>' : `${conf} confirmed car${conf === 1 ? '' : 's'}, ${L.confirmedSeats} seat${L.confirmedSeats === 1 ? '' : 's'}${asked ? ` · ${asked} driver${asked === 1 ? '' : 's'} invited` : ''}`;
  return `<span class="spot-line"><span class="small">${t.cancelled ? 'Cancelled · ' : ''}${cars} · ${L.riders} need${L.riders === 1 ? 's' : ''} a lift${L.waiting ? ` · <b class="open-t">${L.waiting} without a seat</b>` : ''}${L.tentative ? ` · ${L.tentative} waiting on a driver’s reply` : ''}${L.over ? ` · <b class="open-t">${L.over} over capacity</b>` : ''}</span></span>`;
}
function taskNames(t) {
  const ppl = arr(t.people).filter(p => p.role !== 'rider');
  if (!ppl.length) return '';
  return `<span class="who">${ppl.map(p => `<span class="wn s-${p.status}">${esc(whoShort(p.who))}${p.role === 'driver' ? ` (${Number(p.seats) || 0})` : ''}<em>${TASK_STATUS[p.status] || ''}</em></span>`).join('')}</span>`;
}
function taskRow(t) {
  const coach = isCoach(), lift = t.kind === 'lift', when = taskWhen(t);
  const info = `<span class="task-top"><span class="t">${esc(t.title)}</span><span class="pill kind k-${esc(t.kind)}">${esc(TASK_KINDS[t.kind] || 'Other')}</span>${t.cancelled ? '<span class="pill bad">Cancelled</span>' : ''}</span>
    ${when ? `<span class="sub" style="display:block">${esc(when)}</span>` : ''}
    ${lift ? liftHtml(t) : spotsHtml(t)}
    ${coach ? taskNames(t) : t.notes ? `<span class="sub task-notes" style="display:block">${esc(t.notes)}</span>` : ''}`;
  if (coach) return `<div class="sess task ${t.cancelled ? 'cancelled' : ''}">${calBlock(t.date)}<button class="sess-main" data-act="task-open" data-id="${t.id}">${info}</button></div>`;
  const canHelp = taskShort(t) && t.date >= todayISO();
  return `<div class="sess task ${t.cancelled ? 'cancelled' : ''}">${calBlock(t.date)}<div class="sess-main">${info}
    ${canHelp ? `<button class="btn wa sm task-help" data-act="task-help" data-id="${t.id}">${icon('chat', 18)}${lift ? 'I can drive' : 'I can help'}</button>` : ''}</div></div>`;
}
// The Home card: the next jobs that still need people.
function homeTasks() {
  const soon = toISODate(new Date(Date.now() + 28 * 86400000)), today = todayISO();
  const up = arr(V.tasks).filter(t => t.date >= today);
  const need = up.filter(t => t.date <= soon && taskShort(t)).sort(byWhen);
  const waiting = isCoach() ? up.filter(taskAsked).length : 0;
  if (!need.length && !waiting) return '';
  return `<section class="sec"><div class="sec-h"><h2>Help needed</h2><button class="btn sm" data-act="tab" data-tab="tasks">All tasks</button></div>
    ${need.length ? `<div class="list">${need.slice(0, 3).map(taskRow).join('')}</div>` : ''}
    ${need.length > 3 ? `<p class="hint">And ${need.length - 3} more in the next four weeks.</p>` : ''}
    ${waiting ? `<p class="hint"><button class="link-btn inline" data-act="task-waiting">${waiting} task${waiting === 1 ? ' has' : 's have'} invitations awaiting a reply</button></p>` : ''}
  </section>`;
}

// Someone leaves the squad or the helpers list: take them off every task (and out of anyone's car).
function forgetPerson(who) {
  data.tasks.forEach(t => {
    t.people = arr(t.people).filter(p => p.who !== who);
    t.people.forEach(p => { if (p.car === who) p.car = ''; });
  });
}
const taskPerson = (t, who) => arr(t && t.people).find(p => p.who === who);

/* The task sheet (coach): details, the people on it and their replies, or the cars on a lift */
function openTask(id) { const t = taskById(id); if (!t) return; state.taskPick = null; openSheet(t.title, taskBody(t), 'task:' + t.id); }
function refreshTask(id) {
  render();
  const t = taskById(id), body = $('#sheet .panel-body');
  if (!t || !body || state.sheet !== 'task:' + id) return;
  const top = body.scrollTop; body.innerHTML = taskBody(t); body.scrollTop = top;
  const h = $('#sheet .panel-head h2'); if (h) h.textContent = t.title;
}
function taskBody(t) {
  const lift = t.kind === 'lift', sess = t.sessionId ? sessionById(t.sessionId) : null, match = t.matchId ? matchById(t.matchId) : null;
  return `<p class="task-when"><b>${esc(fmtLong(t.date))}</b>${taskWhen(t) ? `<br>${esc(taskWhen(t))}` : ''}${sess ? `<br><span class="muted small">Linked to training${sess.cancelled ? ' (cancelled)' : ''}: it moves if the session moves</span>` : ''}${match ? `<br><span class="muted small">Linked to the match against ${esc(match.opponent || 'TBC')}</span>` : ''}</p>
    <p><span class="pill kind k-${esc(t.kind)}">${esc(TASK_KINDS[t.kind] || 'Other')}</span>${t.cancelled ? ' <span class="pill bad">Cancelled</span>' : ''}</p>
    ${t.notes ? `<p class="task-notes-full">${esc(t.notes)}</p>` : ''}
    ${lift ? liftEditor(t) : peopleEditor(t)}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" data-act="task-edit" data-id="${t.id}">Edit</button>
      <button class="btn" data-act="task-dup" data-id="${t.id}">${icon('copy', 18)}Duplicate</button>
      ${taskShort(t) ? `<button class="btn wa" data-act="task-share" data-id="${t.id}">${icon('chat', 18)}Ask for help</button>` : ''}
    </div>
    <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="task-cancel" data-id="${t.id}">${t.cancelled ? 'Reinstate task' : 'Mark cancelled'}</button><button class="btn danger" data-act="task-del" data-id="${t.id}">Delete</button></div>
    <p class="hint">Only coaches see names. Players and helpers see each spot as confirmed, invited (awaiting a reply), open or done. Only accepted and done count as confirmed.</p>`;
}
const stBtns = (t, p) => `<div class="seg mini tp-st" role="group" aria-label="${esc(whoName(p.who))}'s reply">${Object.entries(TASK_STATUS).map(([k, l]) => `<button data-act="tp-status" data-id="${t.id}" data-who="${esc(p.who)}" data-s="${k}" aria-pressed="${p.status === k}">${l}</button>`).join('')}</div>`;
const waBtn = (t, who, label) => personOf(who) && personOf(who).phone ? `<button class="icon-btn wa-i" data-act="tp-wa" data-id="${t.id}" data-who="${esc(who)}" aria-label="WhatsApp ${esc(label || whoName(who))}">${icon('chat', 20)}</button>` : '';
const rmBtn = (t, who) => `<button class="icon-btn" data-act="tp-remove" data-id="${t.id}" data-who="${esc(who)}" aria-label="Take ${esc(whoName(who))} off this task">${icon('close', 18)}</button>`;
function personLine(who, t) {
  const p = personOf(who), m = t ? M.lastMessage(data.messages, `task:${t.id}:${who}`) : null;
  const msg = m ? `<span class="tagline msg-${M.msgStatus(m)}">${M.msgStatus(m) === 'sent' ? `Message sent ${esc(fmtStamp(m.sentAt || m.at))}` : `Message opened ${esc(fmtStamp(m.at))}, not confirmed sent`}</span>` : '';
  return `<span class="grow"><span class="name" style="display:block">${esc(p ? p.name : 'Someone removed')}</span>${p && p.helper ? `<span class="tagline">Helper${helperTie(p.x) ? ` · ${esc(helperTie(p.x))}` : ''}</span>` : ''}${msg}</span>`;
}
function peopleEditor(t) {
  const ppl = arr(t.people);
  return `<h3 class="form-sec">People ${spotsHtml(t)}</h3>
    ${ppl.length ? `<div class="list tp-list">${ppl.map(p => `<div class="tp-row s-${p.status}"><div class="tp-head">${personLine(p.who, t)}${waBtn(t, p.who)}${rmBtn(t, p.who)}</div>${stBtns(t, p)}</div>`).join('')}</div>`
      : `<p class="muted small">Nobody on this yet.</p>`}
    ${pickerHtml(t, 'people', 'Add people')}`;
}
function liftEditor(t) {
  const L = liftOf(t), drivers = arr(t.people).filter(p => p.role === 'driver'), riders = arr(t.people).filter(p => p.role !== 'driver');
  const carName = who => `${firstName({ name: whoName(who) })}’s car`;
  const live = L.cars;
  return `<h3 class="form-sec">Drivers <span class="small muted">${L.confirmedSeats} confirmed seat${L.confirmedSeats === 1 ? '' : 's'}${L.possibleSeats > L.confirmedSeats ? `, ${L.possibleSeats - L.confirmedSeats} more if invited drivers accept` : ''}</span></h3>
    ${drivers.length ? `<div class="list tp-list">${drivers.map(d => {
      const car = live.find(c => c.who === d.who), n = car ? car.taken : 0, seats = Number(d.seats) || 0;
      return `<div class="tp-row s-${d.status}"><div class="tp-head">${personLine(d.who, t)}${waBtn(t, d.who)}${rmBtn(t, d.who)}</div>
        <div class="tp-seats"><span class="small">Seats</span><button class="btn sm" data-act="tp-seats" data-id="${t.id}" data-who="${esc(d.who)}" data-d="-1" aria-label="One seat fewer in ${esc(carName(d.who))}">−</button><b aria-live="polite">${seats}</b><button class="btn sm" data-act="tp-seats" data-id="${t.id}" data-who="${esc(d.who)}" data-d="1" aria-label="One seat more in ${esc(carName(d.who))}">+</button>
          <span class="small ${n > seats ? 'open-t' : 'muted'}">${d.status === 'no' ? 'Can’t drive' : `${n} in the car${n > seats ? `, ${n - seats} over capacity` : n === seats && seats ? ', full' : ''}${d.status === 'asked' ? ' (not confirmed)' : ''}`}</span></div>
        ${stBtns(t, d)}</div>`;
    }).join('')}</div>` : `<p class="muted small">No drivers yet.</p>`}
    ${pickerHtml(t, 'driver', 'Add a driver')}
    <h3 class="form-sec">Need a lift <span class="small muted">${L.riders}${L.waiting ? `, <b class="open-t">${L.waiting} without a seat</b>` : ''}${L.tentative ? `, ${L.tentative} in a car whose driver hasn’t replied` : ''}</span></h3>
    ${riders.length ? `<div class="list tp-list">${riders.map(r => `<div class="tp-row"><div class="tp-head">${personLine(r.who, t)}${waBtn(t, r.who)}${rmBtn(t, r.who)}</div>
      <label class="tp-car"><span class="small">Car</span><select data-change="tp-car" data-id="${t.id}" data-who="${esc(r.who)}" aria-label="Car for ${esc(whoName(r.who))}"><option value="">No seat yet</option>
        ${live.map(c => { const full = c.free <= 0 && r.car !== c.who; return `<option value="${esc(c.who)}" ${r.car === c.who ? 'selected' : ''} ${full ? 'disabled' : ''}>${esc(carName(c.who))} (${full ? 'full' : `${c.free} free`}${c.confirmed ? '' : ', driver not confirmed'})</option>`; }).join('')}</select></label></div>`).join('')}</div>` : `<p class="muted small">Nobody on the list yet.</p>`}
    ${L.waiting && L.cars.some(c => c.confirmed && c.free > 0) ? `<button class="btn block" style="margin-top:8px" data-act="lift-fill" data-id="${t.id}">Fill the free seats in confirmed cars</button>` : ''}
    ${L.over ? `<p class="note" style="background:var(--bad-soft);margin-top:8px">${L.over} ${L.over === 1 ? 'person is' : 'people are'} over a car’s seats. Add seats, move them or find another driver.</p>` : ''}
    ${pickerHtml(t, 'rider', 'Add people who need a lift')}
    <p class="hint">Full cars can’t be picked. Seats only count once a driver accepts.</p>`;
}
// Who can be added, the least busy first so the load is shared around.
function pickerHtml(t, mode, label) {
  if (state.taskPick !== mode) return `<button class="btn block" style="margin-top:8px" data-act="tp-pick" data-id="${t.id}" data-m="${mode}">${icon('plus', 18)}${label}</button>`;
  const on = new Set(arr(t.people).map(p => p.who)), load = taskLoad();
  const cands = everyone().filter(w => !on.has(w));
  if (mode !== 'rider') cands.sort((a, b) => loadBusy(loadOf(load, a)) - loadBusy(loadOf(load, b)));
  return `<div class="tp-pick"><div class="sec-h" style="margin:12px 0 6px"><h3 class="form-sec" style="margin:0">${label}</h3><button class="btn sm" data-act="tp-pick" data-id="${t.id}" data-m="">Done</button></div>
    ${cands.length ? `<div class="list">${cands.map(w => { const p = personOf(w), L = loadOf(load, w);
      return `<button class="pick" data-act="tp-add" data-id="${t.id}" data-who="${esc(w)}" data-m="${mode}">${icon('plus', 18)}<span class="grow"><span class="name" style="display:block">${esc(p.name)}${p.helper ? ' <span class="pill neutral">Helper</span>' : ''}</span>${mode === 'rider' ? '' : `<span class="tagline">${esc(loadText(L))}</span>`}</span></button>`; }).join('')}</div>`
      : `<p class="muted small">Everyone is on it already. Add helpers in the Helpers tab.</p>`}
    ${mode === 'people' ? '<p class="hint">They’re added as Invited. Tap their reply when you hear back: only Accepted and Done fill a spot.</p>' : mode === 'driver' ? '<p class="hint">Drivers start with 4 seats. Change it once you know.</p>' : ''}</div>`;
}

/* New and edited tasks */
function taskForm(t, opts = {}) {
  const isNew = !t || !t.id, d = t || { title: '', kind: 'other', date: todayISO(), start: '', end: '', place: '', notes: '', need: 1 };
  const sessions = upcomingSessions().filter(s => !s.cancelled);
  const until = V.team.eventStart || '';
  return `<form class="task-form" data-form="task">
    <input type="hidden" name="id" value="${esc(isNew ? '' : d.id)}">
    <label class="field-l"><span>What needs doing</span><input type="text" name="title" required list="task-ideas" value="${esc(d.title)}" placeholder="e.g. Run the BBQ"></label>
    <datalist id="task-ideas">${TASK_IDEAS.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
    <div class="two">
      <label class="field-l"><span>Type</span><select name="kind" data-change="task-kind">${Object.entries(TASK_KINDS).map(([k, l]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field-l need-f" ${d.kind === 'lift' ? 'hidden' : ''}><span>People needed</span><input type="number" name="need" min="1" max="30" value="${esc(d.kind === 'lift' ? 1 : d.need || 1)}"></label>
    </div>
    ${(() => { const ms = arr(V.matches).filter(m => m.status === 'scheduled' && m.date >= todayISO()).sort(byWhen); return ms.length || d.matchId ? `<label class="field-l"><span>For a match</span><select name="matchId" data-change="task-session"><option value="">No</option>
      ${ms.map(m => `<option value="${m.id}" data-date="${m.date}" data-start="${esc(m.start || '')}" data-end="" data-place="${esc(matchWhere(m))}" ${d.matchId === m.id ? 'selected' : ''}>vs ${esc(m.opponent || 'TBC')}, ${esc(fmtDay(m.date))}</option>`).join('')}</select><small>A task for a match moves with it if the match moves.</small></label>` : ''; })()}
    ${sessions.length ? `<label class="field-l"><span>At a training session</span><select name="sessionId" data-change="task-session"><option value="">No, another day</option>
      ${sessions.map(s => `<option value="${s.id}" data-date="${s.date}" data-start="${esc(s.start || '')}" data-end="${esc(s.end || '')}" data-place="${esc(s.venue || V.team.trainingVenue || '')}" ${d.sessionId === s.id ? 'selected' : ''}>${esc(fmtDay(s.date))}, ${esc(fmtRange(s))}</option>`).join('')}</select></label>` : ''}
    <label class="field-l"><span>Date</span><input type="date" name="date" required value="${esc(d.date)}"></label>
    <div class="two">
      <label class="field-l"><span>From</span><input type="time" name="start" value="${esc(d.start || '')}"></label>
      <label class="field-l"><span>To</span><input type="time" name="end" value="${esc(d.end || '')}"></label>
    </div>
    <label class="field-l"><span>Where</span><input type="text" name="place" value="${esc(d.place || '')}" placeholder="e.g. Clubhouse BBQ, field 2"></label>
    <label class="field-l"><span>Instructions</span><textarea name="notes" rows="3" placeholder="What to bring, who to see, where to park">${esc(d.notes || '')}</textarea><small>Everyone in the team can see these.</small></label>
    ${isNew && !opts.copy ? `<label class="check"><input type="checkbox" name="rotate" data-change="task-rotate"> Take turns at every training</label>
      <div class="rotate-box" hidden>
        <label class="field-l"><span>Until</span><input type="date" name="until" value="${esc(until)}"><small>One task per training session from the date above, each given to the next person in turn.</small></label>
        <div class="field-l"><span>Who takes turns</span><div class="rot-people">${everyone().map(w => `<label class="check rot-p"><input type="checkbox" name="rot" value="${esc(w)}"> ${esc(whoName(w))}${w[0] === 'h' ? ' <span class="pill neutral">Helper</span>' : ''}</label>`).join('')}</div></div>
      </div>` : ''}
    <button class="btn primary block" type="submit">${isNew ? 'Add task' : 'Save changes'}</button>
  </form>`;
}
function saveTask(f) {
  const id = f.id, kind = TASK_KINDS[f.kind] ? f.kind : 'other';
  const fields = { title: f.title || 'Task', kind, date: f.date || todayISO(), start: f.start, end: f.end, place: f.place, notes: f.notes, need: kind === 'lift' ? 0 : clamp(Number(f.need) || 1, 1, 30), sessionId: f.sessionId || '', matchId: f.matchId || '' };
  if (id) { const t = data.tasks.find(x => x.id === id); if (!t) return null; Object.assign(t, fields); return [t]; }
  if (f.rotate) {
    const who = f.rot; if (!who.length) { toast('Pick who takes turns'); return null; }
    const ss = data.sessions.filter(s => !s.cancelled && s.date >= fields.date && (!f.until || s.date <= f.until)).sort(bySession);
    if (!ss.length) { toast('No training sessions in those dates'); return null; }
    const series = uid();
    const made = ss.map((s, i) => ({ id: uid(), ...fields, date: s.date, start: s.start || fields.start, end: s.end || fields.end, place: s.venue || data.team.trainingVenue || fields.place, sessionId: s.id, need: 1, series,
      people: [{ who: who[i % who.length], status: 'asked' }] }));
    data.tasks.push(...made);
    return made;
  }
  const t = { id: uid(), ...fields, people: [] };
  data.tasks.push(t);
  return [t];
}
function checklistBody() {
  const dates = [...new Set(data.tasks.map(t => t.date))].sort().reverse();
  return `<form data-form="task-checklist">
    <p class="muted small" style="margin-bottom:10px">Adds a set of tasks for one day, with nobody on them yet.</p>
    <div class="field-l"><span>Checklist</span><div class="opts">${Object.entries(CHECKLISTS).map(([k, c], i) => `<label class="opt"><input type="radio" name="list" value="${k}" ${i ? '' : 'checked'}><span>${esc(c.name)}</span></label>`).join('')}</div>
      <small>${Object.values(CHECKLISTS).map(c => `${esc(c.name)}: ${c.items.map(x => esc(x[0].toLowerCase())).join(', ')}.`).join('<br>')}</small></div>
    <label class="field-l"><span>Date</span><input type="date" name="date" required value="${esc(V.team.eventStart && V.team.eventStart > todayISO() ? V.team.eventStart : todayISO())}"></label>
    <label class="field-l"><span>Where</span><input type="text" name="place" value="${esc(V.team.venue || '')}"></label>
    <button class="btn primary block" type="submit">Add these tasks</button>
  </form>
  ${dates.length ? `<h3 class="form-sec">Or copy another day’s tasks</h3>
  <form data-form="task-copyday">
    <div class="two">
      <label class="field-l"><span>From</span><select name="from">${dates.map(d => `<option value="${d}">${esc(fmtDay(d))} (${data.tasks.filter(t => t.date === d).length})</option>`).join('')}</select></label>
      <label class="field-l"><span>To</span><input type="date" name="to" required></label>
    </div>
    <button class="btn block" type="submit">Copy the tasks</button>
    <p class="hint">Copies what, when and where, without the people.</p>
  </form>` : ''}`;
}

/* Helpers: family, friends and people from the community who aren't on the squad */
function viewHelpers() {
  const H = sortedHelpers(), load = taskLoad();
  return `<div class="sec-h"><h2>Helpers</h2><button class="btn primary sm" data-act="helper-new">${icon('plus', 18)}Add</button></div>
    ${H.length ? `<div class="list grid">${H.map(h => `<div class="row">
      <button class="row-main" data-act="helper-edit" data-id="${h.id}"><span class="grow"><span class="name" style="display:block">${esc(h.name)}</span>
        <span class="sub" style="display:block">${esc([helperTie(h), loadText(loadOf(load, 'h:' + h.id))].filter(Boolean).join(' · '))}</span></span></button>
      ${h.phone ? `<button class="icon-btn" style="color:var(--wa)" data-act="wa-helper" data-id="${h.id}" aria-label="WhatsApp ${esc(h.name)}">${icon('chat', 22)}</button>` : '<span style="width:44px"></span>'}
    </div>`).join('')}</div>` : `<div class="empty"><p>Family, friends and anyone from the community who pitches in. Add them here to give them tasks.</p><button class="btn primary" data-act="helper-new">${icon('plus')}Add a helper</button></div>`}
    <p class="hint">Only coaches can see helpers and their numbers.</p>`;
}
function helperForm(h) {
  const isNew = !h; h = h || { name: '', phone: '', relation: '', playerId: '', notes: '' };
  return `<form data-form="helper" autocomplete="off">
    <input type="hidden" name="id" value="${esc(h.id || '')}">
    <label class="field-l"><span>Name</span><input type="text" name="name" required value="${esc(h.name)}" autocapitalize="words"></label>
    <label class="field-l"><span>Mobile</span><input type="tel" name="phone" placeholder="04xx xxx xxx" value="${esc(h.phone)}"><small>Coach only. For asking them on WhatsApp.</small></label>
    <div class="two">
      <label class="field-l"><span>Who they are</span><input type="text" name="relation" value="${esc(h.relation)}" placeholder="e.g. Mia’s mum"></label>
      <label class="field-l"><span>Linked player</span><select name="playerId"><option value="">None</option>${sortedPlayers().map(p => `<option value="${p.id}" ${h.playerId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    </div>
    <label class="field-l"><span>Notes</span><input type="text" name="notes" value="${esc(h.notes)}" placeholder="e.g. has a ute, first aid trained"></label>
    <button class="btn primary block" type="submit">${isNew ? 'Add helper' : 'Save changes'}</button>
    ${isNew ? '' : `<button type="button" class="btn danger block" style="margin-top:10px" data-act="helper-del" data-id="${h.id}">Remove helper</button>`}
  </form>`;
}
// Everyone's helping, most first, so the load can be shared around.
function viewHelped() {
  const load = taskLoad();
  const rows = everyone().map(w => ({ w, L: loadOf(load, w) })).sort((a, b) => b.L.done - a.L.done || loadBusy(b.L) - loadBusy(a.L) || whoName(a.w).localeCompare(whoName(b.w)));
  if (!rows.length) return `<p class="muted">Add players or helpers first.</p>`;
  const none = rows.filter(r => !loadBusy(r.L)), unmarked = rows.reduce((n, r) => n + r.L.unmarked, 0);
  const n = v => v ? v : '<span class="muted">0</span>';
  return `<div class="sec-h"><h2>Who’s helped</h2></div>
    <div class="list helped" role="table" aria-label="Volunteering by person"><div class="helped-row helped-h" role="row"><span role="columnheader">Name</span><span role="columnheader">Done</span><span role="columnheader">Accepted</span><span role="columnheader">Invited</span><span role="columnheader">Declined</span></div>
    ${rows.map(({ w, L }) => `<div class="helped-row" role="row"><span class="hn" role="cell"><span class="name" style="display:block">${esc(whoName(w))}</span>${w[0] === 'h' ? '<span class="tagline">Helper</span>' : ''}</span><b role="cell">${n(L.done)}</b><span role="cell">${n(L.accepted)}</span><span role="cell">${n(L.invited)}</span><span role="cell">${n(L.declined)}</span></div>`).join('')}</div>
    <p class="hint">Done counts tasks marked done. Accepted and Invited are for tasks still to come.${unmarked ? ` ${unmarked} past spot${unmarked === 1 ? ' was' : 's were'} accepted but never marked done, so ${unmarked === 1 ? 'it isn’t' : 'they aren’t'} counted.` : ''}</p>
    ${none.length ? `<p class="hint">${none.length} ${none.length === 1 ? 'person hasn’t' : 'people haven’t'} helped or been asked yet. When you add people to a task, they’re listed least busy first.</p>` : ''}`;
}

/* WhatsApp words for tasks */
function taskLine(t) { return `*${t.title}*, ${fmtLong(t.date)}${t.start ? `, ${fmtTime(t.start)}${t.end ? '–' + fmtTime(t.end) : ''}` : ''}${t.place ? `, ${t.place}` : ''}`; }
function taskPersonText(t, who) {
  const p = personOf(who), first = p ? firstName(p) : '', me = arr(t.people).find(x => x.who === who) || {};
  const notes = t.notes ? `\n📝 ${t.notes}` : '';
  if (t.kind === 'lift') {
    const L = liftOf(t);
    if (me.role === 'driver') {
      const car = L.cars.find(c => c.who === who), names = car ? car.riders.map(whoName) : [];
      const inCar = names.length ? `\n🚗 In your car: ${names.join(', ')}` : '';
      if (me.status === 'asked') return `Hi ${first}, could you drive for ${taskLine(t)}?${inCar}${notes}\n\nPlease reply *YES* (and how many spare seats) or *NO*.`;
      if (me.status === 'no') return `Hi ${first}, no worries about driving for ${t.title}. Thanks for letting me know.`;
      if (me.status === 'done') return `Thanks ${first} for driving for ${t.title}! 🙌`;
      return `Hi ${first}, thanks for driving for ${taskLine(t)}.${inCar}${notes}`;
    }
    const driver = me.car ? whoName(me.car) : '';
    return `Hi ${first}, your lift for ${taskLine(t)}: ${driver ? `you’re in ${driver}’s car.` : 'we’re still finding you a seat.'}${notes}`;
  }
  if (me.status === 'done') return `Thanks ${first} for helping with ${t.title} on ${fmtDay(t.date)}! 🙌`;
  if (me.status === 'no') return `Hi ${first}, no worries about ${t.title}. Thanks for letting me know.`;
  if (me.status === 'yes') return `Hi ${first}, a reminder you’re on ${taskLine(t)}.${notes}\n\nThanks for helping! 🙌`;
  return `Hi ${first}, could you help with ${taskLine(t)}?${notes}\n\nPlease reply *YES* or *NO*. Thanks!`;
}
function taskAskText(t) {
  const L = t.kind === 'lift' ? liftOf(t) : null, open = L ? 0 : covOf(t).short;
  return `🙋 *Can anyone help?*\n${taskLine(t)}${t.notes ? `\n📝 ${t.notes}` : ''}\n${L ? `🚗 ${L.waiting ? `${L.waiting} still need${L.waiting === 1 ? 's' : ''} a seat. ` : ''}We need drivers.` : `${open} more ${open === 1 ? 'person' : 'people'} needed.`}\n\nReply *YES* here if you can, or tap “I can help” in the team app (Team › Tasks).`;
}
function helpNeededText() {
  const soon = toISODate(new Date(Date.now() + 28 * 86400000)), today = todayISO();
  const need = data.tasks.filter(t => t.date >= today && t.date <= soon && taskShort(t)).sort(byWhen);
  if (!need.length) return `🙋 *Help needed — ${data.team.name}*\n\nNothing at the moment. Thanks everyone! 🙌`;
  return `🙋 *Help needed — ${data.team.name}*\n\n${need.map(t => {
    const L = t.kind === 'lift' ? liftOf(t) : null, open = L ? 0 : covOf(t).short;
    return `• ${fmtDay(t.date)}${t.start ? ` ${fmtTime(t.start)}` : ''}: ${t.title}${L ? ` (drivers needed${L.waiting ? `, ${L.waiting} without a seat` : ''})` : ` (${open} more needed)`}`;
  }).join('\n')}\n\nReply here, or tap “I can help” in the team app (Team › Tasks). Thanks! 🙌`;
}

/* ---------- Reports (coach) ---------- */
// Every figure is worked out from what was recorded (see model.js). Where nothing was recorded the
// report says "not recorded" rather than showing 0, and says which records were left out and why.
const NR = '<span class="nr" title="Not recorded">not recorded</span>';
function reportRange() {
  const T = data.team, today = todayISO();
  if (state.reportRange === 'event' && T.eventStart) return { from: T.eventStart, to: T.eventEnd || T.eventStart, label: T.event || 'Tournament' };
  if (state.reportRange === 'recent') return { from: M.addDays(today, -56), to: today, label: 'Last 8 weeks' };
  return { from: '', to: '', label: V.viewSeason ? `Whole season (${V.viewSeason.name})` : 'Whole season' };
}
function inRangeTeam(r) {
  const ok = x => (!r.from || x.date >= r.from) && (!r.to || x.date <= r.to);
  return { ...V, sessions: V.sessions.filter(ok), matches: arr(V.matches).filter(ok), tasks: V.tasks.filter(ok) };
}
function trendChart(trend) {
  const squad = Math.max(1, V.players.length), last = trend.slice(-16), n = last.length;
  const W = 340, H = 150, top = 20, base = 112, gap = 6, bw = Math.min(26, (W - 20 - gap * (n - 1)) / n), x0 = (W - (n * bw + (n - 1) * gap)) / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Training attendance, last ${n} sessions: ${last.map(x => `${fmtShort(x.date)} ${x.status === 'recorded' ? x.attended : x.status === 'cancelled' ? 'cancelled' : 'not recorded'}`).join(', ')}">`;
  s += `<line x1="8" x2="${W - 8}" y1="${base}" y2="${base}" stroke="#DCE1D9"/><line x1="8" x2="${W - 8}" y1="${top}" y2="${top}" stroke="#DCE1D9" stroke-dasharray="3 3"/><text x="${W - 8}" y="${top - 6}" text-anchor="end" font-size="10" fill="#5B6861" font-family="Barlow, sans-serif">Squad (${squad})</text>`;
  last.forEach((x, i) => {
    const cx = x0 + i * (bw + gap);
    if (x.status === 'recorded') {
      const h = (base - top) * Math.min(1, x.attended / squad);
      s += `<rect x="${cx}" y="${base - h}" width="${bw}" height="${h}" rx="3" fill="#123D2B"/><text x="${cx + bw / 2}" y="${base - h - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#16201B" font-family="Barlow Condensed, sans-serif">${x.attended}</text>`;
    } else s += `<rect x="${cx}" y="${base - 22}" width="${bw}" height="22" rx="3" fill="none" stroke="#AEB8B0" stroke-dasharray="3 2"/><text x="${cx + bw / 2}" y="${base - 7}" text-anchor="middle" font-size="10" fill="#5B6861" font-family="Barlow, sans-serif">${x.status === 'cancelled' ? '✕' : '?'}</text>`;
    s += `<text x="${cx + bw / 2}" y="${base + 14}" text-anchor="middle" font-size="9.5" fill="#5B6861" font-family="Barlow, sans-serif">${fmtShort(x.date)}</text>`;
  });
  return s + `</svg><p class="legend" style="justify-content:center"><span><i style="background:#123D2B"></i>Attended (incl. late)</span><span>? Roll call not taken</span><span>✕ Cancelled</span></p>`;
}
function viewReports() {
  if (!isCoach()) return '';
  const r = reportRange(), T = inRangeTeam(r), today = todayISO();
  const sum = M.summary(V, r.from, r.to, today), trend = M.attendanceTrend(T.sessions, today);
  const pva = M.plannedVsActual(T.sessions, today), part = M.participation(T, today), pos = M.positionUsage(T, today);
  const load = M.volunteerLoad(T, today), out = M.outstanding(V, today), rec = sum.matches;
  const ranges = [['season', 'Whole season'], ...(data.team.eventStart ? [['event', data.team.event || 'Tournament']] : []), ['recent', 'Last 8 weeks']];
  const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : NR;
  const outItems = [
    ...out.rsvp.map(x => { const ev = x.kind === 'match' ? matchById(x.id) : sessionById(x.id); return `<li><button class="link-btn inline" data-act="rsvp-open" data-k="${x.kind}" data-id="${x.id}">${x.missing} availability repl${x.missing === 1 ? 'y' : 'ies'} missing</button> for ${esc(x.kind === 'match' ? `vs ${ev.opponent || 'TBC'}` : 'training')}, ${esc(fmtDay(x.date))}</li>`; }),
    ...out.noLineup.map(id => { const m = matchById(id); return `<li><button class="link-btn inline" data-act="match-open" data-id="${id}">No lineup</button> for vs ${esc(m.opponent || 'TBC')}, ${esc(fmtDay(m.date))}</li>`; }),
    ...out.noResult.map(id => { const m = matchById(id); return `<li><button class="link-btn inline" data-act="match-open" data-id="${id}">No result entered</button> for vs ${esc(m.opponent || 'TBC')}, ${esc(fmtDay(m.date))}</li>`; }),
    ...out.toFind.map(x => { const t = taskById(x.id); return `<li><button class="link-btn inline" data-act="task-open" data-id="${x.id}">${x.n} still to find</button> for ${esc(t.title)}, ${esc(fmtDay(t.date))}</li>`; }),
    ...out.awaiting.map(x => { const t = taskById(x.id); return `<li><button class="link-btn inline" data-act="task-open" data-id="${x.id}">${x.n} invitation${x.n === 1 ? '' : 's'} awaiting a reply</button> for ${esc(t.title)}, ${esc(fmtDay(t.date))}</li>`; }),
    ...out.riders.map(x => { const t = taskById(x.id); return `<li><button class="link-btn inline" data-act="task-open" data-id="${x.id}">${x.waiting ? `${x.waiting} without a seat` : ''}${x.waiting && x.tentative ? ', ' : ''}${x.tentative ? `${x.tentative} waiting on a driver` : ''}</button> for ${esc(t.title)}</li>`; }),
    ...(out.unconfirmed ? [`<li><button class="link-btn inline" data-act="tab" data-tab="messages">${out.unconfirmed} WhatsApp message${out.unconfirmed === 1 ? '' : 's'}</button> opened but not confirmed as sent</li>`] : [])
  ];
  const helpers = Object.entries(load).filter(([w]) => personOf(w)).sort((a, b) => b[1].done - a[1].done || loadBusy(b[1]) - loadBusy(a[1]));
  const notHelped = everyone().filter(w => !loadBusy(loadOf(load, w))).length;
  const posRows = Object.entries(pos.use).sort((a, b) => SLOT_IDS.indexOf(a[0]) - SLOT_IDS.indexOf(b[0]));
  return `<div class="sec-h"><h2>Reports</h2><button class="btn sm" data-act="report-share">${icon('copy', 18)}Copy summary</button></div>
    <div class="chips" role="group" aria-label="Period">${ranges.map(([k, l]) => `<button class="chip" data-act="report-range" data-v="${k}" aria-pressed="${(state.reportRange || 'season') === k}">${esc(l)}</button>`).join('')}</div>
    <p class="hint" style="margin:-4px 0 14px">${esc(r.label)}${r.from ? `: ${esc(fmtDay(r.from))} to ${esc(fmtDay(r.to))}` : ''}. Worked out from what was recorded. “Not recorded” means there’s nothing to go on, which isn’t the same as zero.</p>
    <div class="cols"><div class="col">
    <section class="sec"><div class="sec-h"><h2>At a glance</h2></div>
      <div class="stats report-stats">
        <div class="stat"><b>${sum.sessions.held}</b><span>Sessions held${sum.sessions.cancelled ? `, ${sum.sessions.cancelled} cancelled` : ''}</span></div>
        <div class="stat"><b>${sum.sessions.avgPct === null ? '–' : sum.sessions.avgPct + '%'}</b><span>${sum.sessions.avgPct === null ? 'Attendance not recorded' : `Average attendance (${sum.sessions.recorded} roll call${sum.sessions.recorded === 1 ? '' : 's'})`}</span></div>
        <div class="stat"><b>${rec.withResult ? `${rec.won}–${rec.drawn}–${rec.lost}` : '–'}</b><span>${rec.withResult ? 'Won–drawn–lost' : 'No results entered'}</span></div>
        <div class="stat"><b>${sum.volunteers.spotsNeeded ? `${sum.volunteers.spotsDone}/${sum.volunteers.spotsNeeded}` : '–'}</b><span>${sum.volunteers.spotsNeeded ? `Task spots done, by ${sum.volunteers.people} ${sum.volunteers.people === 1 ? 'person' : 'people'}` : 'No tasks'}</span></div>
      </div>
      ${sum.sessions.missing ? `<p class="hint">${sum.sessions.missing} past session${sum.sessions.missing === 1 ? ' has' : 's have'} no roll call, so ${sum.sessions.missing === 1 ? 'it’s' : 'they’re'} left out of the average.</p>` : ''}
      ${rec.awaiting ? `<p class="hint">${rec.awaiting} match${rec.awaiting === 1 ? '' : 'es'} without a result entered ${rec.awaiting === 1 ? 'isn’t' : 'aren’t'} counted.</p>` : ''}
      ${rec.scoredGames ? `<p class="hint">Tries: ${rec.scored} for, ${rec.conceded} against (${rec.diff >= 0 ? '+' : ''}${rec.diff}) over ${rec.scoredGames} match${rec.scoredGames === 1 ? '' : 'es'} with a score${rec.forfeits ? `; ${rec.forfeits} forfeit${rec.forfeits === 1 ? '' : 's'} not included` : ''}.</p>` : ''}
    </section>
    <section class="sec"><div class="sec-h"><h2>Training turnout</h2></div>
      ${trend.length ? `<div class="chart">${trendChart(trend)}</div>` : '<p class="muted small">No past sessions in this period.</p>'}</section>
    <section class="sec"><div class="sec-h"><h2>Said they’d come, and did</h2></div>
      ${pva.used ? `<table class="rtable"><thead><tr><th scope="col">They said</th><th scope="col">Came</th><th scope="col">Didn’t</th><th scope="col">Came %</th></tr></thead><tbody>
        ${[['yes', 'Attending'], ['maybe', 'Unsure'], ['no', 'Not attending'], ['none', 'No reply']].map(([k, l]) => { const x = pva.rows[k]; return `<tr><th scope="row">${l}</th><td>${x.came}</td><td>${x.missed}</td><td>${pct(x.came, x.came + x.missed)}</td></tr>`; }).join('')}</tbody></table>
        <p class="hint">From ${pva.used} session${pva.used === 1 ? '' : 's'} with both RSVPs and a roll call.${pva.noRoll ? ` ${pva.noRoll} with RSVPs but no roll call left out.` : ''}${pva.noRsvp ? ` ${pva.noRsvp} with a roll call but no RSVPs left out.` : ''}${pva.cancelled ? ` ${pva.cancelled} cancelled left out.` : ''}</p>`
        : `<p class="muted small">Not recorded: no session in this period has both RSVPs and a roll call yet.</p>`}
    </section>
    <section class="sec"><div class="sec-h"><h2>Loose ends</h2></div>
      ${outItems.length ? `<ul class="todo">${outItems.join('')}</ul>` : '<p class="muted small">Nothing outstanding in the next four weeks.</p>'}</section>
    </div><div class="col">
    <section class="sec"><div class="sec-h"><h2>Players</h2></div>
      ${part.length ? `<div class="rtable-wrap"><table class="rtable players"><thead><tr><th scope="col">Player</th><th scope="col">Training</th><th scope="col">RSVPs</th><th scope="col">Matches</th></tr></thead><tbody>
        ${part.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => `<tr><th scope="row">${esc(x.name)}</th>
          <td>${x.training.recorded ? `${x.training.attended}/${x.training.recorded} <small class="muted">${x.training.pct}%</small>` : NR}</td>
          <td>${x.rsvp.asked ? `${x.rsvp.yes} yes${x.rsvp.no ? `, ${x.rsvp.no} no` : ''}${x.rsvp.maybe ? `, ${x.rsvp.maybe} unsure` : ''}${x.rsvp.none ? ` <small class="muted">(${x.rsvp.none} no reply)</small>` : ''}` : NR}</td>
          <td>${x.matches.withLineup ? `${x.matches.named}/${x.matches.withLineup}` : NR}</td></tr>`).join('')}</tbody></table></div>
        <p class="hint">Training: sessions attended (late counts) out of roll calls they were marked on. RSVPs: only sessions where you recorded any. Matches: named in the match lineup, out of past matches with a lineup.</p>` : '<p class="muted small">No players yet.</p>'}
    </section>
    <section class="sec"><div class="sec-h"><h2>Positions in match lineups</h2></div>
      ${pos.matches ? `<table class="rtable"><thead><tr><th scope="col">Position</th><th scope="col">Filled</th><th scope="col">Most often</th></tr></thead><tbody>
        ${posRows.map(([id, u]) => { const top = Object.entries(u.players).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([pid, n]) => `${esc(shortName(playerById(pid) || { name: 'Removed player' }))} (${n})`).join(', '); return `<tr><th scope="row">${esc(u.label)}</th><td>${u.filled}/${pos.matches}</td><td>${top || NR}</td></tr>`; }).join('')}</tbody></table>
        <p class="hint">From ${pos.matches} past match${pos.matches === 1 ? '' : 'es'} with a lineup.</p>` : '<p class="muted small">Not recorded: no past match in this period has a lineup.</p>'}
    </section>
    <section class="sec"><div class="sec-h"><h2>Volunteering</h2><button class="btn sm" data-act="tab" data-tab="tasks">Tasks</button></div>
      ${helpers.length ? `<table class="rtable"><thead><tr><th scope="col">Person</th><th scope="col">Done</th><th scope="col">Coming up</th><th scope="col">Declined</th></tr></thead><tbody>
        ${helpers.slice(0, 12).map(([w, L]) => `<tr><th scope="row">${esc(whoName(w))}</th><td>${L.done}</td><td>${L.accepted + L.invited}${L.invited ? ` <small class="muted">(${L.invited} invited)</small>` : ''}</td><td>${L.declined}</td></tr>`).join('')}</tbody></table>
        <p class="hint">${helpers.length > 12 ? `Top 12 of ${helpers.length}. ` : ''}${notHelped} ${notHelped === 1 ? 'person hasn’t' : 'people haven’t'} helped or been asked. Accepted spots on past tasks that were never marked done aren’t counted as done.</p>` : '<p class="muted small">Not recorded: nobody has been put on a task in this period.</p>'}
    </section>
    ${jerseyReportHtml()}
    ${compResults()}
    ${seasonCompare()}
    </div></div>`;
}
// Our results in each competition this season (no tables: only our own results are recorded).
function compResults() {
  if (!V.viewSeason) return '';
  const list = M.teamEntries(ws, data.id, V.viewSeason.id);
  if (!list.length) return '';
  const today = todayISO(), loose = V.matches.filter(m => !m.entryId && !m.friendly).length, friendly = V.matches.filter(m => m.friendly);
  return `<section class="sec"><div class="sec-h"><h2>Competitions</h2><button class="btn sm" data-act="tab" data-tab="comps">Competitions</button></div>
    <div class="table-wrap"><table class="rtable"><thead><tr><th scope="col">Competition</th><th scope="col">Fixtures</th><th scope="col">Results</th><th scope="col">For–against</th></tr></thead><tbody>
    ${list.map(({ comp, entry }) => { const ms = V.matches.filter(m => m.entryId === entry.id), r = M.teamRecord(ms, today);
      return `<tr><th scope="row">${esc(comp.name)}${entry.division ? `<small class="muted" style="display:block">${esc(entry.division)}</small>` : ''}</th><td>${ms.length}</td><td>${r.withResult ? `W${r.won} D${r.drawn} L${r.lost}` : NR}</td><td>${r.scoredGames ? `${r.scored}–${r.conceded}` : NR}</td></tr>`; }).join('')}
    ${friendly.length ? `<tr><th scope="row">Friendlies</th><td>${friendly.length}</td><td>${(r => r.withResult ? `W${r.won} D${r.drawn} L${r.lost}` : NR)(M.teamRecord(friendly, today))}</td><td></td></tr>` : ''}</tbody></table></div>
    <p class="hint">${esc(V.viewSeason.name)}, whole season, from our own entered results. No ladder is worked out: other teams’ results aren’t recorded.${loose ? ` ${loose} match${loose === 1 ? ' isn’t' : 'es aren’t'} linked to a competition.` : ''}</p></section>`;
}
// Every season of the team side by side, each from what was recorded in it.
function seasonCompare() {
  const st = M.seasonStats(data, todayISO()).filter(x => x.status !== 'archived');
  if (st.length < 2) return '';
  const cur = V.viewSeason && V.viewSeason.id;
  return `<section class="sec"><div class="sec-h"><h2>Seasons compared</h2><button class="btn sm" data-act="season-open">Seasons</button></div>
    <div class="table-wrap"><table class="rtable"><thead><tr><th scope="col">Season</th><th scope="col">Squad</th><th scope="col">Training</th><th scope="col">Turnout</th><th scope="col">Results</th><th scope="col">Volunteer spots</th></tr></thead><tbody>
    ${st.map(x => `<tr${x.id === cur ? ' class="on"' : ''}><th scope="row">${esc(x.name)}<small class="muted" style="display:block">${esc(M.SEASON_STATUS[x.status])}</small></th><td>${x.squad}</td><td>${x.sessions.held}</td><td>${x.sessions.avgPct === null ? NR : `${x.sessions.avgPct}%`}</td>
      <td>${x.matches.withResult ? `W${x.matches.won} D${x.matches.drawn} L${x.matches.lost}` : NR}</td><td>${x.volunteers.spotsNeeded ? `${x.volunteers.spotsDone} of ${x.volunteers.spotsNeeded}` : NR}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint">Each season’s own roll calls, results and tasks, whole season. Turnout is the average share of that season’s squad at training.</p></section>`;
}
function reportText() {
  const r = reportRange(), today = todayISO(), s = M.summary(V, r.from, r.to, today), rec = s.matches;
  return `📊 *${data.team.name} — ${r.label}*\nTraining: ${s.sessions.held} sessions held${s.sessions.cancelled ? `, ${s.sessions.cancelled} cancelled` : ''}. ${s.sessions.avgPct === null ? 'Attendance not recorded.' : `Average attendance ${s.sessions.avgPct}% over ${s.sessions.recorded} roll calls.`}\nMatches: ${rec.withResult ? `won ${rec.won}, drew ${rec.drawn}, lost ${rec.lost}` : 'no results entered'}${rec.awaiting ? ` (${rec.awaiting} without a result)` : ''}.\nVolunteers: ${s.volunteers.spotsNeeded ? `${s.volunteers.spotsDone} of ${s.volunteers.spotsNeeded} task spots done by ${s.volunteers.people} people.` : 'no tasks.'}`;
}

/* ---------- Matches and the tournament ---------- */
// Matches: opponent, when, where (venue and field), round, status and result, plus each player's
// availability (an RSVP, kept apart from training) and a match lineup. Players see everything but
// the availability, the coach's notes and the result notes.
const OUTCOME = { win: 'Won', loss: 'Lost', draw: 'Drew' };
const sortedMatches = () => arr(V.matches).slice().sort(byWhen);
const matchLineup = m => m && m.lineupId ? V.lineups.find(l => l.id === m.lineupId) : null;
const matchOfLineup = lu => lu && arr(V.matches).find(m => m.lineupId === lu.id);
const matchWhere = m => [m.venue, m.field ? `Field ${m.field}` : ''].filter(Boolean).join(' · ');
function resultText(m) {
  const o = M.matchOutcome(m); if (!o) return '';
  if (m.status === 'forfeit') return `${OUTCOME[o]} on forfeit`;
  return `${OUTCOME[o]} ${m.result.us}–${m.result.them}`;
}
function matchPills(m) {
  const coach = isCoach(), o = M.matchOutcome(m), today = todayISO();
  const out = [];
  if (o) out.push(`<span class="pill ${o === 'win' ? 'ok' : o === 'loss' ? 'bad' : 'neutral'}">${esc(resultText(m))}</span>`);
  else if (m.status !== 'scheduled') out.push(`<span class="pill ${m.status === 'cancelled' ? 'bad' : 'neutral'}">${esc(M.MATCH_STATUS[m.status])}${m.status === 'played' ? ', result not entered' : ''}</span>`);
  else if (m.date < today) out.push(coach ? '<span class="pill neutral">Result not entered</span>' : '');
  if (coach && m.status === 'scheduled' && m.date >= today) {
    const c = M.rsvpCounts(m, V.players), lu = matchLineup(m), chk = lu ? M.lineupCheck(V, lu, m) : null;
    out.push(`<span class="pill ${c.none ? 'neutral' : 'ok'}">${c.yes} available${c.none ? `, ${c.none} no reply` : ''}</span>`);
    out.push(lu ? `<span class="pill ${chk.ready ? 'ok' : 'bad'}">${chk.ready ? 'Lineup ready' : `Lineup: ${chk.issues.length} to fix`}</span>` : '<span class="pill neutral">No lineup yet</span>');
  }
  return out.filter(Boolean).join(' ');
}
function matchRow(m) {
  const info = `<span class="t" style="display:block">vs ${esc(m.opponent || 'TBC')}${m.start ? ` <span class="muted">· ${esc(fmtTime(m.start))}</span>` : ''}</span>
    <span class="sub" style="display:block">${esc([matchWhere(m), m.round].filter(Boolean).join(' · ') || 'Venue TBC')}</span>
    ${matchCompLabel(m) ? `<span class="comp-tag">${esc(matchCompLabel(m))}</span>` : ''}
    ${m.notes && !isCoach() ? `<span class="sub" style="display:block;white-space:normal">${esc(m.notes)}</span>` : ''}
    <span class="ag-meta">${matchPills(m)}</span>`;
  const cls = `sess match ${m.status === 'cancelled' || m.status === 'postponed' ? 'cancelled' : ''} ${m.date === todayISO() ? 'today' : ''}`;
  if (isCoach()) return `<div class="${cls}">${calBlock(m.date)}<button class="sess-main" data-act="match-open" data-id="${m.id}">${info}</button></div>`;
  return `<div class="${cls}">${calBlock(m.date)}<div class="sess-main">${info}${replyBtns('match', m)}</div></div>`;
}
function viewMatches() {
  const coach = isCoach(), today = todayISO(), all = sortedMatches();
  const days = M.tournamentDays(V), inT = new Set(days.flatMap(d => d.matches.map(m => m.id)));
  const up = all.filter(m => m.date >= today && !inT.has(m.id)), past = all.filter(m => m.date < today && !inT.has(m.id)).reverse();
  const rec = M.teamRecord(all, today);
  const head = `<div class="sec-h"><h2>Matches</h2>${coach ? `<div class="btn-row"><button class="btn sm" data-act="match-day-new">Tournament day</button><button class="btn primary sm" data-act="match-new">${icon('plus', 18)}Add match</button></div>` : ''}</div>`;
  const record = rec.withResult || rec.awaiting ? `<div class="stats record" role="group" aria-label="Results so far">
      <div class="stat"><b>${rec.won}</b><span>Won</span></div><div class="stat"><b>${rec.drawn}</b><span>Drawn</span></div><div class="stat"><b>${rec.lost}</b><span>Lost</span></div>
      <div class="stat"><b>${rec.scoredGames ? `${rec.scored}–${rec.conceded}` : '–'}</b><span>Tries for–against</span></div></div>
      ${rec.awaiting && coach ? `<p class="hint">${rec.awaiting} match${rec.awaiting === 1 ? ' has' : 'es have'} no result entered yet, so ${rec.awaiting === 1 ? 'it isn’t' : 'they aren’t'} counted.</p>` : ''}` : '';
  if (!all.length) return head + `<div class="empty"><p>${coach ? 'No matches yet. Add trial games and the tournament draw here: opponent, time, venue and field.' : 'No matches yet.'}</p>${coach ? `<div class="btn-row" style="justify-content:center"><button class="btn primary" style="flex:0" data-act="match-new">${icon('plus')}Add match</button><button class="btn" style="flex:0" data-act="match-day-new">Tournament day</button></div>` : ''}</div>`;
  const comps = !coach ? arr(V.competitions).filter(c => c.entryStatus !== 'withdrawn') : [];
  return head + record
    + (comps.length ? `<p class="hint" style="margin:-4px 0 14px">Playing in ${comps.map(c => `<b>${esc(c.name)}</b>${c.division ? ` (${esc(c.division)})` : ''}${c.start ? `, ${esc(compDates(c))}` : ''}`).join('; ')}.</p>` : '')
    + (days.length ? `<section class="sec"><div class="sec-h"><h2>${esc(V.team.event || 'Tournament')}</h2>${coach ? `<button class="btn wa sm" data-act="t-share">${icon('chat', 18)}Send draw</button>` : ''}</div>
        ${days.map(d => `<h3 class="ag-date">${esc(fmtLong(d.date))}${coach ? ` <button class="link-btn inline" data-act="day-share" data-date="${d.date}">Send this day</button>` : ''}</h3><div class="list grid sess-grid">${d.matches.map(matchRow).join('')}</div>`).join('')}</section>` : '')
    + `<section class="sec"><div class="sec-h"><h2>${days.length ? 'Other matches' : 'Coming up'}</h2></div>${up.length ? `<div class="list grid sess-grid">${up.map(matchRow).join('')}</div>` : '<p class="muted small">Nothing else coming up.</p>'}</section>`
    + (past.length ? `<section class="sec"><div class="sec-h"><h2>Played</h2>${coach ? `<button class="btn sm" data-act="results-share">${icon('chat', 18)}Send results</button>` : ''}</div><div class="list grid sess-grid">${past.map(matchRow).join('')}</div></section>` : '');
}
function matchForm(m) {
  const isNew = !m || !m.id, T = data.team;
  m = m || { date: T.eventStart && T.eventStart >= todayISO() ? T.eventStart : todayISO(), start: '', opponent: '', venue: T.venue || '', field: '', round: '', notes: '', coachNotes: '', status: 'scheduled' };
  return `<form data-form="match" autocomplete="off">
    <input type="hidden" name="id" value="${esc(isNew ? '' : m.id)}">
    <label class="field-l"><span>Opponent</span><input type="text" name="opponent" value="${esc(m.opponent)}" placeholder="e.g. Coffs Coast Mixed 20s"><small>Leave blank if the draw isn’t out yet.</small></label>
    <div class="two">
      <label class="field-l"><span>Date</span><input type="date" name="date" required value="${esc(m.date)}"></label>
      <label class="field-l"><span>Start</span><input type="time" name="start" value="${esc(m.start || '')}"></label>
    </div>
    <div class="two">
      <label class="field-l"><span>Venue</span><input type="text" name="venue" value="${esc(m.venue || '')}"></label>
      <label class="field-l"><span>Field</span><input type="text" name="field" value="${esc(m.field || '')}" placeholder="e.g. 3"></label>
    </div>
    <div class="two">
      <label class="field-l"><span>Round</span><input type="text" name="round" value="${esc(m.round || '')}" placeholder="e.g. Pool A, round 2"></label>
      ${isNew ? '' : `<label class="field-l"><span>Status</span><select name="status">${Object.entries(M.MATCH_STATUS).map(([k, l]) => `<option value="${k}" ${m.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
    </div>
    ${entrySelect(m)}
    <label class="check"><input type="checkbox" name="tournament" ${m.tournament || (T.eventStart && m.date >= T.eventStart && m.date <= (T.eventEnd || T.eventStart)) ? 'checked' : ''}><span>Show in the ${esc(T.event || 'tournament')} draw</span></label>
    <label class="field-l"><span>Notes for players</span><input type="text" name="notes" value="${esc(m.notes || '')}" placeholder="e.g. Meet 45 minutes early, white tops"></label>
    <label class="field-l"><span>Coach notes</span><input type="text" name="coachNotes" value="${esc(m.coachNotes || '')}" placeholder="Only coaches see these"></label>
    <button class="btn primary block" type="submit">${isNew ? 'Add match' : 'Save changes'}</button>
  </form>`;
}
function matchDayForm() {
  const T = data.team;
  return `<form data-form="match-day" autocomplete="off">
    <p class="muted small" style="margin-bottom:10px">Add a day’s draw in one go: one match per line with the time, opponent, field and round, separated by commas.</p>
    <div class="two">
      <label class="field-l"><span>Date</span><input type="date" name="date" required value="${esc(T.eventStart && T.eventStart >= todayISO() ? T.eventStart : todayISO())}"></label>
      <label class="field-l"><span>Venue</span><input type="text" name="venue" value="${esc(T.venue || '')}"></label>
    </div>
    <label class="field-l"><span>Matches</span><textarea name="lines" rows="6" placeholder="9:00, Coffs Coast, 3, Pool A R1&#10;12:30, Sydney Sharks, 5, Pool A R2&#10;15:40, Hills Hornets, 2, Pool A R3"></textarea></label>
    ${entrySelect(null)}
    <label class="check"><input type="checkbox" name="tournament" checked><span>Show in the ${esc(T.event || 'tournament')} draw</span></label>
    <button class="btn primary block" type="submit">Add these matches</button>
  </form>`;
}
// Read "9:00, Coffs Coast, 3, Pool A R1" (or "9am", "12.30pm"). Anything that isn't a time is the opponent,
// then the field, then the round.
function parseMatchLine(line) {
  const parts = line.split(/[,\t;]+/).map(x => x.trim()).filter(Boolean);
  const m = { start: '', opponent: '', field: '', round: '' };
  const time = x => { const r = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i.exec(x); if (!r) return ''; let h = +r[1]; const mi = r[2] || '00'; if (r[3]) { if (/pm/i.test(r[3]) && h < 12) h += 12; if (/am/i.test(r[3]) && h === 12) h = 0; } return h < 24 && +mi < 60 ? `${pad(h)}:${mi}` : ''; };
  const rest = [];
  parts.forEach(x => { if (!m.start && time(x)) m.start = time(x); else rest.push(x); });
  [m.opponent = '', m.field = '', ...m.roundParts] = rest;
  m.field = String(m.field || '').replace(/^field\s*/i, '');
  m.round = (m.roundParts || []).join(', '); delete m.roundParts;
  return m;
}
function matchBody(m) {
  const lu = matchLineup(m), chk = lu ? M.lineupCheck(V, lu, m) : null, c = M.rsvpCounts(m, V.players);
  const tasks = M.linkedTasks(data, 'match', m.id), live = m.status === 'scheduled';
  const r = m.result || {};
  return `<p class="task-when"><b>${esc(fmtLong(m.date))}${m.start ? `, ${esc(fmtTime(m.start))}` : ''}</b>${matchWhere(m) ? `<br>${esc(matchWhere(m))}` : ''}${m.round ? `<br>${esc(m.round)}` : ''}</p>
    <p>${matchPills(m)}</p>
    ${m.notes ? `<p class="task-notes-full">${esc(m.notes)}</p>` : ''}${m.coachNotes ? `<p class="task-notes-full coach-only"><span class="tagline">Coach notes</span><br>${esc(m.coachNotes)}</p>` : ''}
    <h3 class="form-sec">Availability</h3>
    <div class="roll-sum">${rsvpPills(m)}</div>
    <div class="btn-row"><button class="btn" data-act="rsvp-open" data-k="match" data-id="${m.id}">${icon('rsvp', 18)}Record replies</button><button class="btn wa" data-act="rsvp-ask" data-k="match" data-id="${m.id}">${icon('chat', 18)}Ask for replies</button></div>
    ${c.none && live ? `<p class="hint">${c.none} player${c.none === 1 ? ' hasn’t' : 's haven’t'} replied.</p>` : ''}
    <h3 class="form-sec">Lineup</h3>
    ${lu ? `<p><b>${esc(lu.name)}</b></p>
      ${chk.issues.length ? `<ul class="diff-list issues">${chk.issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="small" style="color:var(--ok);font-weight:600">Ready: eight on, mixed rule met, nobody unavailable.</p>'}
      ${chk.checks.length ? `<p class="hint">To check: ${esc(chk.checks.join('; '))}.</p>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn" data-act="match-lineup-open" data-id="${m.id}">Open in Lineup</button><button class="btn" data-act="match-lineup-unlink" data-id="${m.id}">Use a different lineup</button></div>`
      : `<form data-form="match-lineup" class="inline-form"><input type="hidden" name="id" value="${m.id}">
        <label class="field-l"><span>Start from</span><select name="from">${V.lineups.filter(l => !matchOfLineup(l)).map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}<option value="">An empty lineup</option></select><small>Makes a copy for this match with the same shape and players, so your saved lineup stays as it is.</small></label>
        <button class="btn primary block" type="submit">Make the match lineup</button></form>`}
    <h3 class="form-sec">Result</h3>
    <form data-form="match-result" autocomplete="off"><input type="hidden" name="id" value="${m.id}">
      <div class="seg" role="radiogroup" aria-label="How it finished">${[['played', 'Played'], ['forfeit', 'Forfeit'], ['scheduled', 'Not played yet']].map(([k, l]) => `<label class="seg-opt"><input type="radio" name="status" value="${k}" ${(m.status === k || (k === 'scheduled' && !['played', 'forfeit'].includes(m.status))) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <div class="two"><label class="field-l"><span>Our tries</span><input type="number" name="us" min="0" max="99" inputmode="numeric" value="${esc(r.us ?? '')}"></label>
      <label class="field-l"><span>Their tries</span><input type="number" name="them" min="0" max="99" inputmode="numeric" value="${esc(r.them ?? '')}"></label></div>
      <label class="field-l"><span>If a forfeit, who forfeited?</span><select name="forfeit"><option value="">–</option><option value="them" ${r.forfeit === 'them' ? 'selected' : ''}>They did (we win)</option><option value="us" ${r.forfeit === 'us' ? 'selected' : ''}>We did</option></select></label>
      <label class="field-l"><span>Match notes</span><input type="text" name="rnotes" value="${esc(r.notes || '')}" placeholder="Coach only: what worked, injuries"></label>
      <button class="btn primary block" type="submit">Save result</button>
    </form>
    ${tasks.length ? `<h3 class="form-sec">Tasks for this match</h3><div class="list">${tasks.map(t => `<button class="pick" data-act="task-open" data-id="${t.id}"><span class="grow"><span class="name" style="display:block">${esc(t.title)}</span>${t.kind === 'lift' ? liftHtml(t) : spotsHtml(t)}</span></button>`).join('')}</div>` : ''}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" data-act="match-edit" data-id="${m.id}">Edit details</button>
      <button class="btn" data-act="match-task" data-id="${m.id}">${icon('plus', 18)}Task</button>
      <button class="btn wa" data-act="match-share" data-id="${m.id}">${icon('chat', 18)}Send</button>
    </div>
    <button class="btn danger block" style="margin-top:10px" data-act="match-del" data-id="${m.id}">Delete this match</button>`;
}
function openMatch(id) { const m = matchById(id); if (m) openSheet(`vs ${m.opponent || 'TBC'}`, matchBody(m), 'match:' + id); }
function refreshMatch(id) {
  render();
  const m = matchById(id), body = $('#sheet .panel-body');
  if (!m || !body || state.sheet !== 'match:' + id) return;
  const top = body.scrollTop; body.innerHTML = matchBody(m); body.scrollTop = top;
}
// The match day on Home: the next day with a match in the coming week, and what's still to sort.
/* WhatsApp words for matches */
function matchLines(m) {
  const lu = matchLineup(m);
  if (!lu) return '';
  const lines = lu.slots.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(s => { const p = playerById(s.playerId); return `${s.label} – ${p ? p.name : '(TBC)'}`; });
  const on = lu.slots.map(s => s.playerId).filter(Boolean);
  const bench = sortedPlayers().filter(p => !on.includes(p.id) && p.status === 'available' && M.rsvpOf(m, p.id) !== 'no').map(p => p.name);
  return `\n\n*Team*\n${lines.join('\n')}${bench.length ? `\n🔁 Interchange: ${bench.join(', ')}` : ''}`;
}
function matchText(m) {
  return `🏉 *${data.team.name} vs ${m.opponent || 'TBC'}*\n📅 ${fmtLong(m.date)}${m.start ? `, ${fmtTime(m.start)}` : ''}\n📍 ${matchWhere(m) || 'Venue TBC'}${m.round ? `\n🏆 ${m.round}` : ''}${m.notes ? `\n📝 ${m.notes}` : ''}${matchLines(m)}\n\nReply *YES*, *NO* or *MAYBE* if you haven’t yet.`;
}
function dayText(date) {
  const ms = sortedMatches().filter(m => m.date === date && m.status !== 'cancelled');
  const tasks = arr(V.tasks).filter(t => t.date === date && !t.cancelled);
  return `🏉 *Match day — ${fmtLong(date)}*\n${data.team.name}\n\n${ms.map(m => `• ${m.start ? fmtTime(m.start) : 'Time TBC'} vs ${m.opponent || 'TBC'}${m.field ? `, field ${m.field}` : ''}${m.round ? ` (${m.round})` : ''}`).join('\n')}${ms[0] && ms[0].venue ? `\n📍 ${ms[0].venue}` : ''}${ms.some(m => m.notes) ? `\n📝 ${[...new Set(ms.map(m => m.notes).filter(Boolean))].join(' ')}` : ''}${tasks.length ? `\n\n*Jobs*\n${tasks.map(t => `• ${t.title}${t.start ? ` ${fmtTime(t.start)}` : ''}`).join('\n')}` : ''}\n\nGood luck! 💪`;
}
function drawText() {
  const days = M.tournamentDays(data);
  return `🏆 *${data.team.event || 'Tournament'} draw — ${data.team.name}*\n${days.map(d => `\n*${fmtLong(d.date)}*\n${d.matches.map(m => `• ${m.start ? fmtTime(m.start) : 'TBC'} vs ${m.opponent || 'TBC'}${m.field ? `, field ${m.field}` : ''}${m.status !== 'scheduled' ? ` (${resultText(m) || M.MATCH_STATUS[m.status].toLowerCase()})` : ''}`).join('\n')}`).join('\n')}${data.team.venue ? `\n\n📍 ${data.team.venue}` : ''}`;
}
function resultsText() {
  const ms = sortedMatches().filter(m => M.matchOutcome(m)), rec = M.teamRecord(V.matches, todayISO());
  if (!ms.length) return `🏉 *Results — ${data.team.name}*\n\nNo results entered yet.`;
  return `🏉 *Results — ${data.team.name}*\n\n${ms.map(m => `• ${fmtDay(m.date)} vs ${m.opponent || 'TBC'}: ${resultText(m)}`).join('\n')}\n\nWon ${rec.won}, drew ${rec.drawn}, lost ${rec.lost}.`;
}

/* ---------- Tasks linked to a session or a match ---------- */
// When a session or match with tasks moves, is cancelled or is deleted, the coach chooses what
// happens to the tasks. Nothing changes until they choose; closing the sheet leaves everything as it was.
const eventOf = (kind, id) => (kind === 'session' ? data.sessions : data.matches).find(x => x.id === id);
const eventName = (kind, ev) => kind === 'session' ? `training on ${fmtLong(ev.date)}` : `the match against ${ev.opponent || 'TBC'} on ${fmtLong(ev.date)}`;
const LINK_OPTS = {
  edit: [['move', 'Move them with it', 'Same new day, and the new times and place where they had the old ones.'], ['detach', 'Leave them where they are', 'They stay on the old day and are no longer linked.']],
  cancel: [['keep', 'Keep the tasks on', 'They stay linked and still need people.'], ['cancel', 'Cancel them too', 'They come back if you reinstate it. Everyone stays on them.'], ['remove', 'Delete them', 'Can’t be undone.']],
  delete: [['detach', 'Keep the tasks', 'They stay on their day, no longer linked.'], ['remove', 'Delete them too', 'Can’t be undone.']]
};
function askLinked(p) {
  const ev = eventOf(p.kind, p.id); if (!ev) return;
  const tasks = M.linkedTasks(data, p.kind, p.id);
  const verb = { edit: 'You’ve changed', cancel: 'You’re cancelling', delete: 'You’re deleting' }[p.op];
  state.pending = p;
  openSheet('Linked tasks', `<p style="margin-bottom:10px">${verb} ${esc(eventName(p.kind, ev))}. ${tasks.length === 1 ? 'This task is' : `These ${tasks.length} tasks are`} linked to it:</p>
    <ul class="diff-list">${tasks.map(t => `<li>${esc(t.title)} <span class="muted">(${esc(fmtDay(t.date))}${t.start ? ' ' + esc(fmtTime(t.start)) : ''}${t.cancelled ? ', cancelled' : ''})</span></li>`).join('')}</ul>
    <h3 class="form-sec">What should happen to ${tasks.length === 1 ? 'it' : 'them'}?</h3>
    <div class="list">${LINK_OPTS[p.op].map(([c, l, d]) => `<button class="pick" data-act="link-choice" data-c="${c}"><span class="grow"><span class="name" style="display:block">${l}</span><span class="tagline">${d}</span></span></button>`).join('')}</div>
    <button class="btn block" style="margin-top:12px" data-act="close-sheet">Don’t change anything</button>`, 'linked');
}
function applyLinkChoice(c) {
  const p = state.pending; state.pending = null;
  const ev = p && eventOf(p.kind, p.id); if (!ev) { closeSheet(); return; }
  const s = n => `${n} task${n === 1 ? '' : 's'}`;
  let msg = 'Saved';
  if (p.op === 'edit') {
    Object.assign(ev, p.fields);
    msg = c === 'move' ? `Saved. ${s(M.followEvent(data, p.kind, p.id, p.before, p.after))} moved with it` : `Saved. ${s(M.detachTasks(data, p.kind, p.id))} left on the old day, unlinked`;
  }
  if (p.op === 'cancel') {
    if (p.kind === 'session') ev.cancelled = true; else Object.assign(ev, p.fields || {}, { status: p.status || 'cancelled' });
    msg = c === 'cancel' ? `Cancelled, with ${s(M.cancelTasks(data, p.kind, p.id))}` : c === 'remove' ? `Cancelled, and ${s(M.removeTasks(data, p.kind, p.id))} deleted` : 'Cancelled. The tasks are still on';
  }
  if (p.op === 'delete') {
    const n = c === 'remove' ? M.removeTasks(data, p.kind, p.id) : M.detachTasks(data, p.kind, p.id);
    if (p.kind === 'session') data.sessions = data.sessions.filter(x => x.id !== p.id); else data.matches = data.matches.filter(x => x.id !== p.id);
    msg = c === 'remove' ? `Deleted, with ${s(n)}` : `Deleted. ${s(n)} kept, unlinked`;
  }
  save(); closeSheet(); render(); toast(msg);
  if (p.op === 'cancel' && p.kind === 'session') offerCancelMessage(ev);
}
function offerCancelMessage(s) {
  if (s.date < todayISO() || !confirm('Session marked cancelled. Write a message to let the team know?')) return;
  state.tab = 'messages'; state.msgTpl = 'cancelled'; state.msgSession = s.id; state.msgDraft = buildTemplate('cancelled'); history.replaceState(null, '', '#messages'); render();
}

/* ---------- Messages (coach) ---------- */
const TEMPLATES = { reminder: 'Training reminder', availability: 'Availability check', match: 'Next match', results: 'Results', cancelled: 'Training cancelled', lineup: 'Lineup', help: 'Help needed', countdown: 'Countdown', invite: 'App invite', blank: 'Blank' };
function buildTemplate(t) {
  const T = data.team, s = sessionById(state.msgSession) || nextSession();
  if (t === 'reminder') {
    if (!s) return `🏉 *Training — ${T.name}*\n\n(Add a training session first and it will fill in here.)`;
    return `🏉 *Training — ${T.name}*\n📅 ${fmtLong(s.date)}\n⏰ ${fmtRange(s)}\n📍 ${s.venue || T.trainingVenue || 'TBC'}${s.focus ? `\n🎯 Focus: ${s.focus}` : ''}${s.notes ? `\n📝 ${s.notes}` : ''}\n\nReply 👍 if you're coming, or let me know if you can't make it.`;
  }
  if (t === 'cancelled') return s ? `⚠️ *Training cancelled*\nTraining on ${fmtLong(s.date)} (${fmtRange(s)}) is off.\n\nReason: \n\nSee you at the next one.` : `⚠️ *Training cancelled*\n\n`;
  if (t === 'lineup') return lineupText(curLineup());
  if (t === 'help') return helpNeededText();
  if (t === 'availability') return availabilityText(state.msgEvent);
  if (t === 'match') { const m = sortedMatches().find(x => x.date >= todayISO() && x.status === 'scheduled'); return m ? matchText(m) : `🏉 *Next match — ${T.name}*\n\n(Add a match and it will fill in here.)`; }
  if (t === 'results') return resultsText();
  if (t === 'countdown') { const cd = countdown(); const d = cd && cd.state === 'before' ? cd.days : 0; return `⏳ *${d} days* until ${T.event} in Coffs Harbour (${fmtEventDates()}).\n\nEvery session counts from here. Let's keep turning up. 💪`; }
  if (t === 'invite') return `👋 Here's the ${T.name} team app: training times, lineups and notices.\n\n${inviteLink()}\n\nOpen it on your phone, then use "Add to Home Screen". Please keep this link within the team.`;
  return '';
}
// Ask for replies about one session or match, or everything in the next two weeks.
function availabilityText(ev) {
  const T = data.team, today = todayISO(), until = M.addDays(today, 14), c = T.tasksContact || {};
  const one = ev && rsvpTarget(ev.kind, ev.id);
  const list = one ? [{ kind: ev.kind, x: one }] : M.agenda(data, today, 14).filter(it => !it.cancelled && it.kind !== 'task' && it.date <= until && (it.kind === 'session' || it.x.status === 'scheduled'));
  if (!list.length) return `📋 *Availability — ${T.name}*\n\n(Nothing in the next two weeks. Add training or a match and it will fill in here.)`;
  const line = it => `• ${fmtDay(it.x.date)}${it.x.start ? ` ${fmtTime(it.x.start)}` : ''}: ${it.kind === 'match' ? `match vs ${it.x.opponent || 'TBC'}` : 'training'}`;
  return `📋 *Availability — ${T.name}*\nPlease reply *YES*, *NO* or *MAYBE* for:\n${list.map(line).join('\n')}\n\nReply here${c.name ? ` or message ${c.name}` : ''}, or use the buttons in the team app (Schedule). Thanks!`;
}
function viewMessages() {
  if (state.msgDraft === null) state.msgDraft = buildTemplate(state.msgTpl);
  const needsSession = state.msgTpl === 'reminder' || state.msgTpl === 'cancelled';
  if (state.msgTpl !== 'availability') state.msgEvent = null;
  const sessions = upcomingSessions().filter(s => !s.cancelled || state.msgTpl === 'cancelled');
  if (needsSession && !state.msgSession && sessions[0]) state.msgSession = sessions[0].id;
  const canPost = state.msgTpl !== 'invite';
  return `<div class="cols"><div class="col"><section class="sec"><div class="sec-h"><h2>New message</h2></div>
    <div class="chips">${Object.entries(TEMPLATES).filter(([k]) => !(S.trial && k === 'invite')).map(([k, l]) => `<button class="chip" data-act="tpl" data-t="${k}" aria-pressed="${state.msgTpl === k}">${l}</button>`).join('')}</div>
    ${needsSession && sessions.length ? `<label class="field-l"><span>Session</span><select data-change="msg-session">${sessions.map(s => `<option value="${s.id}" ${s.id === state.msgSession ? 'selected' : ''}>${esc(fmtDay(s.date))}, ${esc(fmtRange(s))}</option>`).join('')}</select></label>` : ''}
    <textarea id="msg" data-input="msg" aria-label="Message">${esc(state.msgDraft)}</textarea>
    ${canPost ? `<label class="check" style="margin-top:10px"><input type="checkbox" data-change="post-notice" ${state.postNotice ? 'checked' : ''}> Also post it on the app's noticeboard</label>` : '<p class="hint">The invite link opens the app without typing the team password. Only send it to the team group.</p>'}
    <div class="btn-row" style="margin-top:10px">
      <button class="btn wa" data-act="wa-send">${icon('chat', 18)}Open in WhatsApp</button>
      ${navigator.share ? `<button class="btn" data-act="share-send">${icon('share', 18)}Share</button>` : ''}
      <button class="btn" data-act="copy-msg">${icon('copy', 18)}Copy</button>
    </div>
    <p class="hint">WhatsApp opens with the message ready. Choose your team group, check it and send, then tell the app it went. *Stars* make text bold in WhatsApp.</p>
  </section></div><div class="col">
  <section class="sec"><div class="sec-h"><h2>Noticeboard</h2><button class="btn sm" data-act="add-notice">${icon('plus', 18)}Post</button></div>
    ${V.notices.length ? `<div class="list">${V.notices.map(n => `<div class="notice"><span class="sub">${esc(fmtStamp(n.at))}</span><p>${esc(n.text)}</p>
      <button class="btn sm danger" data-act="del-notice" data-id="${n.id}">Take down</button></div>`).join('')}</div>` : `<p class="muted small">Players see notices on their home screen.</p>`}
  </section>
  <section class="sec"><div class="sec-h"><h2>Message log</h2></div>
    ${V.messages.length ? `<div class="list">${V.messages.slice(0, 30).map(m => { const sent = M.msgStatus(m) === 'sent'; return `<div class="msg-item">
      <span class="sub">${esc(fmtStamp(m.at))}${m.to ? ` — to ${esc(m.to)}` : ''} <span class="pill ${sent ? 'ok' : 'neutral'}">${sent ? `Sent${m.sentAt ? ' ' + esc(fmtStamp(m.sentAt)) : ''}` : 'Opened, not confirmed sent'}</span></span>
      <p class="preview">${esc(m.text)}</p>
      <div class="btn-row" style="justify-content:flex-start"><button class="btn sm" style="flex:0" data-act="msg-mark" data-id="${m.id}">${sent ? 'Mark not sent' : 'Mark as sent'}</button><button class="btn sm" style="flex:0" data-act="reuse" data-id="${m.id}">Use again</button><button class="btn sm danger" style="flex:0" data-act="del-msg" data-id="${m.id}" aria-label="Remove this log entry">Remove</button></div>
    </div>`; }).join('')}</div>` : `<p class="muted small">Messages you open in WhatsApp from here are logged. Mark each one as sent once it’s gone; the app can’t see inside WhatsApp. Only coaches see this list.</p>`}
  </section></div></div>`;
}
// Every WhatsApp message is logged as prepared when WhatsApp opens. WhatsApp doesn't tell the app
// whether it was sent, so it only counts as sent once the coach says so.
function logMessage(text, to, ref = '') {
  const m = M.logEntry(text, to, ref);
  data.messages.unshift(m);
  data.messages = data.messages.slice(0, 100);
  save();
  return m;
}
function sendWa(text, { to = 'WhatsApp', phone = '', ref = '' } = {}) {
  const m = logMessage(text, to, ref);
  openWhatsApp(text, phone);
  state.askSent = m.id;
  if (document.visibilityState === 'visible') setTimeout(() => { if (state.askSent === m.id) renderAsk(); }, 1200);
  return m;
}
// The "did it go?" question, shown when the coach comes back from WhatsApp.
function renderAsk() {
  const el = $('#ask'); if (!el) return;
  const m = state.askSent && data && arr(data.messages).find(x => x.id === state.askSent);
  if (!m || !isCoach()) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = `<div class="ask-text"><b>Did you send it?</b><span class="small">WhatsApp doesn’t tell the app. Until you say, it’s logged as opened, not sent${m.to && m.to !== 'WhatsApp' ? ` (to ${esc(m.to)})` : ''}.</span></div>
    <div class="ask-btns"><button class="btn sm primary" data-act="msg-sent" data-id="${m.id}">Yes, sent</button><button class="btn sm" data-act="msg-not-sent" data-id="${m.id}">Not sent</button></div>`;
}
function postNotice(text) {
  data.notices.unshift({ id: uid(), at: new Date().toISOString(), text });
  data.notices = data.notices.slice(0, 50);
}
function openTemplate(t) {
  state.tab = 'messages'; state.msgTpl = t; state.msgDraft = buildTemplate(t);
  history.replaceState(null, '', '#messages'); closeSheet(); render(); window.scrollTo(0, 0);
}
function openWhatsApp(text, phone) {
  const a = document.createElement('a');
  a.href = (phone ? `https://wa.me/${waNumber(phone)}` : 'https://wa.me/') + '?text=' + encodeURIComponent(text);
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Teams ---------- */
// The coach can run several teams. Each has its own squad, schedule, matches, tasks, lineups, plays,
// messages and players' password; switching only changes which one is on screen. Archiving takes a
// team's players' file off the site (its data stays in the coach's copy) until it's restored.
const multiTeam = () => S.role === 'coach' && M.activeTeams(ws).length > 1;
function viewTeams() {
  if (!isCoach()) return '';
  const all = M.teamsOf(ws), activeN = all.filter(t => !t.archived).length;
  const row = t => `<div class="row team-row ${t === data ? 'current' : ''}">
      <span class="grow"><span class="name" style="display:block">${esc(M.teamName(t))}${t === data ? ' <span class="pill ok">On screen</span>' : ''}${t.archived ? ' <span class="pill neutral">Archived</span>' : ''}</span>
      <span class="sub" style="display:block">${esc([t.team.division, M.TEAM_CATEGORIES[t.team.category], (M.activeSeason(t) || {}).name || 'No active season', `${M.activeLens(t).players.length} players`].filter(Boolean).join(' · '))}</span></span>
      <button class="btn sm" data-act="season-open" data-team="${t.id}" aria-label="Seasons of ${esc(M.teamName(t))}">Seasons</button>
      ${t.archived ? `<button class="btn sm" data-act="team-restore" data-id="${t.id}">Restore</button>` : t === data ? '' : `<button class="btn sm" data-act="team-pick" data-id="${t.id}">Switch</button>`}
      ${t.archived ? '' : `<button class="btn sm" data-act="team-archive" data-id="${t.id}" ${activeN < 2 ? 'disabled title="At least one team stays active"' : ''}>Archive</button>`}
    </div>`;
  const sortT = ts => ts.slice().sort((a, b) => (a.archived - b.archived) || M.teamName(a).localeCompare(M.teamName(b)));
  const clubs = arr(ws.clubs).slice().sort((a, b) => a.name.localeCompare(b.name));
  const loose = sortT(all.filter(t => !M.clubOf(ws, t)));
  return `<div class="sec-h"><h2>Clubs and teams</h2><div class="btn-row"><button class="btn sm" data-act="club-new">${icon('plus', 18)}New club</button><button class="btn primary sm" data-act="team-new">${icon('plus', 18)}New team</button></div></div>
    ${clubs.map(c => { const ts = sortT(M.clubTeams(ws, c.id)); return `<section class="sec club-group">
      <div class="club-head">${crest(clubBadge(c))}<span class="grow"><span class="name" style="display:block">${esc(c.name)}</span><span class="sub">${esc([c.sport, c.governingBody, `${ts.length} team${ts.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '))}</span></span>
        <button class="btn sm" data-act="club-open" data-id="${esc(c.id)}">Club details</button></div>
      ${ts.length ? `<div class="list">${ts.map(row).join('')}</div>` : '<p class="muted small">No teams in this club yet.</p>'}
    </section>`; }).join('')}
    ${loose.length ? `<section class="sec club-group"><div class="club-head"><span class="grow"><span class="name" style="display:block">Not in a club</span><span class="sub">Choose a club in Settings › Team details</span></span></div><div class="list">${loose.map(row).join('')}</div></section>` : ''}
    <p class="hint">A club keeps what its teams share: contacts, home ground, links and officials. Each team has its own division, staff, players’ file and team password, so players only ever see their own team (and their club’s public details). Archiving takes a team’s file off the site until you restore it.</p>`;
}
// Links from what the coach typed: web addresses, email and phone.
const webLink = (u, label) => { if (!u) return ''; const href = /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^\/+/, '')}`; return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label || u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</a>`; };
const mailLink = e => e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : '';
const telLink = ph => ph ? `<a href="tel:${esc(String(ph).replace(/[^\d+]/g, ''))}">${esc(ph)}</a>` : '';
function viewClub() {
  const coach = isCoach();
  const c = coach && state.clubId ? arr(ws.clubs).find(x => x.id === state.clubId) || curClub() : curClub();
  if (!c) return `<div class="sec-h"><h2>Club</h2></div><div class="empty"><p>${coach ? `${esc(V.team.name)} isn’t in a club yet. Pick its club in Settings › Team details, or create one.` : 'Your coach hasn’t added the club’s details yet.'}</p>
    ${coach ? `<div class="btn-row" style="justify-content:center"><button class="btn primary" style="flex:0" data-act="club-new">${icon('plus')}New club</button><button class="btn" style="flex:0" data-act="settings">Team details</button></div>` : ''}</div>`;
  const line = (label, val) => val ? `<div><dt>${label}</dt><dd>${val}</dd></div>` : '';
  const teams = coach ? M.clubTeams(ws, c.id) : [];
  const staff = coach ? arr(data.team.staff) : arr(V.staff);
  return `${coach ? '<button class="link-btn" data-act="tab" data-tab="teams" style="padding-top:0">‹ Clubs and teams</button>' : ''}<div class="sec-h"><h2 class="club-title">${crest(clubBadge(c), true)}<span>${esc(c.name)}</span></h2>${coach ? `<button class="btn sm" data-act="club-edit" data-id="${esc(c.id)}">Edit club</button>` : ''}</div>
    <p class="muted" style="margin:-4px 0 14px">${esc([c.sport, c.governingBody && `under ${c.governingBody}`, c.founded && `since ${c.founded}`].filter(Boolean).join(' · '))}</p>
    <div class="cols"><div class="col">
    <section class="sec"><div class="sec-h"><h2>Contact</h2></div><dl class="club-dl">
      ${line('Website', webLink(c.website))}${line('Email', mailLink(c.email))}${line('Phone', telLink(c.phone))}${line('Post', esc(c.postal))}
      ${line('Facebook', webLink(c.facebook, 'Facebook'))}${line('Instagram', webLink(c.instagram, 'Instagram'))}
    </dl></section>
    <section class="sec"><div class="sec-h"><h2>Playing</h2></div><dl class="club-dl">
      ${line('Home ground', esc([c.homeGround, c.homeAddress].filter(Boolean).join(', ')))}${line('Nights', esc(c.nights))}${line('Colours', esc(c.colours))}${line('Juniors', esc(c.juniorBrand))}
      ${line('Registration', webLink(c.registration, 'Register'))}${line('Code of conduct', webLink(c.conduct, 'Read it'))}
    </dl>${!c.homeGround && !c.nights && coach ? '<p class="hint">Add the home ground and the nights played so players have them.</p>' : ''}</section>
    </div><div class="col">
    ${staff.length || coach ? `<section class="sec"><div class="sec-h"><h2>${esc(V.team.name)} staff</h2>${coach ? '<button class="btn sm" data-act="settings">Edit</button>' : ''}</div>
      ${staff.length ? `<div class="list">${staff.map(x => `<div class="row"><span class="grow"><span class="name" style="display:block">${esc(x.name)}</span><span class="sub">${esc(x.role)}</span></span>${coach && x.phone ? `<a class="icon-btn" style="color:var(--wa)" href="https://wa.me/${esc(waNumber(x.phone))}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(x.name)}">${icon('chat', 22)}</a>` : ''}</div>`).join('')}</div>` : '<p class="muted small">No staff listed yet. Add the coach, team manager and trainer in Settings › Team details.</p>'}</section>` : ''}
    ${coach ? `<section class="sec"><div class="sec-h"><h2>Club officials</h2></div>
      ${c.officials.length ? `<div class="list">${c.officials.map(o => `<div class="row"><span class="grow"><span class="name" style="display:block">${esc(o.name)}</span><span class="sub">${esc([o.role, o.phone, o.email].filter(Boolean).join(' · '))}</span></span></div>`).join('')}</div>` : '<p class="muted small">None added yet: president, secretary, registrar, representative coordinator, member protection officer.</p>'}
      <p class="hint">Officials are only shown to coaches.</p></section>
    <section class="sec"><div class="sec-h"><h2>Teams</h2></div><div class="list">${teams.map(t => `<div class="row"><span class="grow"><span class="name" style="display:block">${esc(M.teamName(t))}</span><span class="sub">${esc([t.team.division, t.team.season].filter(Boolean).join(' · '))}</span></span></div>`).join('') || '<p class="muted small" style="padding:10px 14px">None yet.</p>'}</div></section>
    ${c.notes ? `<p class="hint">${esc(c.notes)}</p>` : ''}` : ''}
    </div></div>`;
}
const CLUB_SPORTS = M.SPORTS;
function clubForm(c) {
  const isNew = !c; c = M.normClub(c || { name: '' });
  const f = (name, label, ph = '', type = 'text') => `<label class="field-l"><span>${label}</span><input type="${type}" name="${name}" value="${esc(c[name])}" placeholder="${esc(ph)}"></label>`;
  const rows = [...c.officials, { role: 'President', name: '', phone: '', email: '' }, { role: 'Secretary', name: '', phone: '', email: '' }];
  return `<form data-form="club" autocomplete="off"><input type="hidden" name="id" value="${isNew ? '' : esc(c.id)}">
    <div class="two">${f('name', 'Club name', 'e.g. St George Oztag')}${f('shortName', 'Short name', 'e.g. St George')}</div>
    <div class="field-l logo-field"><span id="club-logo-l">Logo</span>
      <div class="logo-row"><span class="logo-prev">${crest(clubBadge(c), true)}</span>
        <label class="btn sm file-btn"><input type="file" accept="image/*" data-change="club-logo" aria-labelledby="club-logo-l">Choose image</label>
        <button type="button" class="btn sm" data-act="club-logo-clear" ${c.logo ? '' : 'hidden'}>Remove logo</button></div>
      <input type="hidden" name="logo" value="${esc(c.logo)}">
      <small>A square image works best. It’s shrunk to a small badge and kept with the club; its teams’ players see it too. Without one, the badge shows the club’s initials.</small></div>
    <div class="two"><label class="field-l"><span>Sport</span><select name="sport">${[...new Set([...CLUB_SPORTS, c.sport])].map(x => `<option ${x === c.sport ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>${f('governingBody', 'Governing body', 'e.g. Australian Oztag')}</div>
    <div class="two">${f('founded', 'Founded', 'e.g. 1992')}${f('juniorBrand', 'Junior program', 'e.g. DragonTag')}</div>
    <h3 class="form-sec">Contact</h3>
    <div class="two">${f('email', 'Email', '', 'email')}${f('phone', 'Phone', '', 'tel')}</div>
    ${f('website', 'Website', 'https://')}${f('postal', 'Postal address')}
    <div class="two">${f('facebook', 'Facebook page', 'https://www.facebook.com/…')}${f('instagram', 'Instagram', 'https://www.instagram.com/…')}</div>
    <h3 class="form-sec">Playing</h3>
    <div class="two">${f('homeGround', 'Home ground', 'e.g. ground name, fields 1–4')}${f('homeAddress', 'Address')}</div>
    <div class="two">${f('nights', 'Nights played', 'e.g. Tue mixed, Wed men’s')}${f('colours', 'Colours', 'e.g. red and white')}</div>
    <div class="two">${f('registration', 'Registration link', 'https://')}${f('conduct', 'Code of conduct link', 'https://')}</div>
    <h3 class="form-sec">Officials <span class="small muted">coaches only</span></h3>
    ${rows.map((o, i) => `<fieldset class="person-row"><legend class="sr-only">Official ${i + 1}</legend>
      <div class="two"><label class="field-l"><span>Role</span><select name="o-role">${M.CLUB_ROLES.map(r => `<option ${r === o.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label><label class="field-l"><span>Name</span><input type="text" name="o-name" value="${esc(o.name)}"></label></div>
      <div class="two"><label class="field-l"><span>Mobile</span><input type="tel" name="o-phone" value="${esc(o.phone)}"></label><label class="field-l"><span>Email</span><input type="email" name="o-email" value="${esc(o.email)}"></label></div></fieldset>`).join('')}
    <p class="hint" style="margin:-4px 0 12px">Leave a name blank to leave that row out. Save and reopen to add more.</p>
    <label class="field-l"><span>Notes</span><textarea name="notes" rows="3">${esc(c.notes)}</textarea><small>Coaches only.</small></label>
    <button class="btn primary block" type="submit">${isNew ? 'Create club' : 'Save club'}</button>
    ${isNew ? '' : `<button type="button" class="btn danger block" style="margin-top:10px" data-act="club-del" data-id="${esc(c.id)}">Delete club</button>`}
    <p class="hint">Players see the club’s name, contacts, ground, nights, colours and links. Officials and notes stay with coaches.</p>
  </form>`;
}
// The team's details: its club, division, category, season and staff (part of Settings).
function teamDetailsFields(T) {
  const staff = [...arr(T.staff), { role: 'Head coach', name: '', phone: '', email: '' }];
  return `<h3 class="form-sec">Team details</h3>
    <div class="two"><label class="field-l"><span>Club</span><select name="clubId"><option value="">Not in a club</option>${arr(ws.clubs).map(c => `<option value="${esc(c.id)}" ${T.clubId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><small><button type="button" class="link-btn inline" data-act="club-new">New club</button></small></label>
      <label class="field-l"><span>Division</span><input type="text" name="division" value="${esc(T.division)}" placeholder="e.g. Mixed 20s"></label></div>
    <div class="two"><label class="field-l"><span>Category</span><select name="category">${Object.entries(M.TEAM_CATEGORIES).map(([k, l]) => `<option value="${k}" ${T.category === k ? 'selected' : ''}>${l}</option>`).join('')}</select><small>Mixed turns on the males-on-field check.</small></label>
      <label class="field-l"><span>Age group</span><input type="text" name="ageGroup" value="${esc(T.ageGroup)}" placeholder="e.g. 20 and over, Under 16"></label></div>
    <label class="field-l"><span>Sport</span>${sportSelect('teamSport', T.sport || '', `Club’s sport (${(M.clubOf(ws, data) || {}).sport || 'Oztag'})`)}<small>Sets the positions players can pick and the official rules. Most teams play their club’s sport.</small></label>
    ${ruleSetField(T)}
    <div class="two"><div class="field-l"><span>Season</span><p class="field-static">${esc((M.activeSeason(data) || {}).name || 'No active season')} <button type="button" class="link-btn inline" data-act="season-open">Seasons</button></p></div>
      <label class="field-l"><span>Team colours</span><input type="text" name="colours" value="${esc(T.colours)}" placeholder="Blank: the club’s"></label></div>
    <h3 class="form-sec">Team staff</h3>
    ${staff.map((x, i) => `<fieldset class="person-row"><legend class="sr-only">Staff member ${i + 1}</legend>
      <div class="two"><label class="field-l"><span>Role</span><select name="st-role">${M.TEAM_ROLES.map(r => `<option ${r === x.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label><label class="field-l"><span>Name</span><input type="text" name="st-name" value="${esc(x.name)}"></label></div>
      <div class="two"><label class="field-l"><span>Mobile</span><input type="tel" name="st-phone" value="${esc(x.phone)}"></label><label class="field-l"><span>Email</span><input type="email" name="st-email" value="${esc(x.email)}"></label></div></fieldset>`).join('')}
    <p class="hint" style="margin:-4px 0 14px">Players see staff names and roles; mobiles and emails stay with coaches. Leave a name blank to leave a row out.</p>`;
}
const peopleRows = (f, p) => f.getAll(p + '-name').map((name, i) => ({ role: String(f.getAll(p + '-role')[i] || 'Other'), name: String(name).trim(), phone: String(f.getAll(p + '-phone')[i] || '').trim(), email: String(f.getAll(p + '-email')[i] || '').trim() })).filter(x => x.name);
function teamForm() {
  const T = data.team;
  return `<form data-form="team-new" autocomplete="off">
    <label class="field-l"><span>Team name</span><input type="text" name="name" required placeholder="e.g. DragonTag Under 16s"></label>
    <div class="two"><label class="field-l"><span>Club</span><select name="clubId"><option value="">Not in a club</option>${arr(ws.clubs).map(c => `<option value="${esc(c.id)}" ${(state.newTeamClub || T.clubId) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field-l"><span>Division</span><input type="text" name="division" placeholder="e.g. Women's Open"></label></div>
    <div class="two"><label class="field-l"><span>Category</span><select name="category">${Object.entries(M.TEAM_CATEGORIES).map(([k, l]) => `<option value="${k}" ${k === (T.category || 'mixed') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field-l"><span>First season</span><input type="text" name="season" value="${esc(String(new Date().getFullYear()))}" placeholder="e.g. Winter 2027"></label></div>
    <label class="field-l"><span>Sport</span>${sportSelect('teamSport', '', 'The club’s sport')}</label>
    <label class="field-l"><span>Tournament or season</span><input type="text" name="event" value="${esc(T.event)}"></label>
    <div class="two">
      <label class="field-l"><span>Starts</span><input type="date" name="eventStart" value="${esc(T.eventStart)}"></label>
      <label class="field-l"><span>Ends</span><input type="date" name="eventEnd" value="${esc(T.eventEnd)}"></label>
    </div>
    <label class="check"><input type="checkbox" name="copySettings" checked><span>Copy ${esc(T.name)}’s training times, venue, field, rule set and by-laws</span></label>
    ${M.libItems(ws, 'plays').length || Object.keys(ws.library.systems).length ? `<label class="check"><input type="checkbox" name="withLibrary" checked><span>Add everything in the library</span></label>` : ''}
    ${S.trial ? '' : `<h3 class="form-sec">Team password</h3>
      <p class="muted small" style="margin-bottom:10px">For this team’s players only, different from every other password. Leave it blank and one is made for you; you can see it in Settings.</p>
      <div class="two"><label class="field-l"><span>Team password</span><input type="password" name="p1" minlength="8" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="p2" autocomplete="new-password"></label></div>`}
    <button class="btn primary block" type="submit">Create team</button>
    <p class="hint">The new team starts with the starter plays, one empty lineup and no players.</p>
  </form>`;
}
// Is this team password safe to use: long enough, not another team's, not the coach's?
async function teamPassProblem(p1, p2, team) {
  if (p1.length < 8) return 'The team password needs at least 8 characters.';
  if (p1 !== p2) return "The two team passwords don't match.";
  if (M.teamsOf(ws).some(t => t !== team && t.teamPass && t.teamPass === p1)) return 'Another team already uses that password. Each team needs its own.';
  if (S.coachLock) { const c = await makeLock(p1, S.coachLock.salt, S.coachLock.iterations); if (await exportKey(c.key) === await exportKey(S.coachLock.key)) return 'Use a different password from the coach one.'; }
  return '';
}
function switchTeam(id) {
  const t = M.findTeam(ws, id); if (!t) return;
  pickTeam(id);
  state.correcting = null;
  const pref = homePref();   // Home showing one team follows the switch
  if (pref && pref.kind === 'team') store.set('tm-home-scope', JSON.stringify({ kind: 'team', id: data.id }));
  Object.assign(state, { lineupId: null, playId: null, msgDraft: null, msgSession: null, msgEvent: null, system: state.system, preview: false });
  closeSheet(); render(); window.scrollTo(0, 0);
  toast(`Now showing ${M.teamName(t)}`);
}
function teamSwitcher() {
  openSheet('Switch team', `<div class="list">${M.activeTeams(ws).map(t => `<button class="pick" data-act="team-pick" data-id="${t.id}" ${t === data ? 'aria-current="true"' : ''}><span class="grow"><span class="name" style="display:block">${esc(M.teamName(t))}</span><span class="tagline">${esc([t.team.event, `${arr(t.players).length} players`].filter(Boolean).join(' · '))}</span></span>${t === data ? icon('check') : ''}</button>`).join('')}</div>
    <button class="btn block" style="margin-top:12px" data-act="teams">Manage teams</button>`, 'switch');
}

/* ---------- Competitions ---------- */
// A competition (a league, a tournament, a championship) is kept once and entered by a team for one of
// its seasons. Matches belong to an entry, or are friendlies, or aren't linked to anything yet. No
// tables or standings are worked out: only this app's own teams' results are recorded.
// A sport picked from the list (a name typed before the list existed is kept as an option).
const sportSelect = (name, cur, blank = '') => `<select name="${name}">${blank ? `<option value="">${esc(blank)}</option>` : ''}${[...new Set([...M.SPORTS, ...(cur ? [cur] : [])])].map(x => `<option value="${esc(x)}" ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
// The competition a match is in, for showing beside it ('' when none).
function matchCompLabel(m) {
  if (S.role === 'coach' && !state.preview) {
    const k = M.matchKind(ws, m);
    return k.comp ? `${k.comp.name}${k.entry.division ? ` (${k.entry.division})` : ''}` : k.kind === 'friendly' ? 'Friendly' : '';
  }
  const c = arr(V.competitions).find(x => x.entryId && x.entryId === m.entryId);
  return c ? `${c.name}${c.division ? ` (${c.division})` : ''}` : m.friendly ? 'Friendly' : '';
}
// The competitions this team's season is entered in, to pick for a match.
function entrySelect(m) {
  const sid = editingSeasonId() || (V.viewSeason || {}).id || (M.activeSeason(data) || {}).id;
  const list = M.teamEntries(ws, data.id, sid).filter(({ entry }) => entry.status === 'entered' || (m && m.entryId === entry.id));
  const cur = m ? (m.entryId || (m.friendly ? 'friendly' : '')) : (list.length === 1 ? list[0].entry.id : '');
  return `<label class="field-l"><span>Competition</span><select name="entry">
    <option value="">Not in a competition</option><option value="friendly" ${cur === 'friendly' ? 'selected' : ''}>Friendly or trial</option>
    ${list.map(({ comp, entry }) => `<option value="${esc(entry.id)}" ${cur === entry.id ? 'selected' : ''}>${esc(comp.name)}${entry.division ? ` · ${esc(entry.division)}` : ''}${entry.status === 'withdrawn' ? ' (withdrawn)' : ''}</option>`).join('')}</select>
    <small>${list.length ? 'Fixtures belong to the competition entry for this season.' : 'Not entered in any competition this season. Enter one in More › Competitions.'}</small></label>`;
}
function setEntry(m, v) {
  if (v === 'friendly') { M.linkMatch(ws, data, m, ''); m.friendly = true; return; }
  delete m.friendly;
  const err = M.linkMatch(ws, data, m, v || '');
  if (err) toast('That competition entry is for another season, so the match wasn’t linked');
}
const compDates = c => c.start ? `${fmtDay(c.start)}${c.end && c.end !== c.start ? ` – ${fmtDay(c.end)}` : ''}` : 'Dates not set';
const compPill = c => `<span class="pill ${c.status === 'active' ? 'ok' : 'neutral'}">${M.COMP_STATUS[c.status]}</span>`;
const entryName = e => { const t = M.findTeam(ws, e.teamId), s = t && M.findSeason(t, e.seasonId); return `${t ? M.teamName(t) : 'Team'}${s ? ` · ${s.name}` : ''}${t && t.archived ? ' (archived team)' : ''}`; };
function viewComps() {
  if (!isCoach()) return '';
  const c = M.findComp(ws, state.compId);
  if (c) return compDetail(c);
  const all = M.compsOf(ws), live = all.filter(x => x.status !== 'archived'), gone = all.filter(x => x.status === 'archived');
  const card = x => `<button class="pick" data-act="comp-open" data-id="${esc(x.id)}"><span class="grow"><span class="name" style="display:block">${esc(x.name)} ${compPill(x)}</span>
    <span class="tagline">${esc([M.COMP_FORMATS[x.format], compDates(x), `${x.entries.filter(e => e.status === 'entered').length} entr${x.entries.filter(e => e.status === 'entered').length === 1 ? 'y' : 'ies'}`].join(' · '))}</span></span><span aria-hidden="true" class="chev">›</span></button>`;
  return `<div class="sec-h"><h2>Competitions</h2><button class="btn primary sm" data-act="comp-new">${icon('plus', 18)}New</button></div>
    <p class="muted small" style="margin-bottom:12px">Leagues, tournaments and carnivals, each kept once. Enter a team’s season in one, then link its fixtures.</p>
    ${live.length ? `<div class="list">${live.map(card).join('')}</div>` : '<div class="empty"><p>No competitions yet.</p></div>'}
    ${gone.length ? `<details class="more" style="margin-top:16px"><summary>Archived (${gone.length})</summary><div class="list">${gone.map(card).join('')}</div></details>` : ''}`;
}
function compDetail(c) {
  const today = todayISO(), ms = M.compMatches(ws, c.id), up = ms.filter(x => x.match.date >= today && x.match.status === 'scheduled'), done = ms.filter(x => M.matchOutcome(x.match)).reverse();
  const row = x => `<button class="pick" data-act="home-go" data-team="${esc(x.team.id)}" data-go="match-open" data-id="${esc(x.match.id)}"><span class="grow"><span class="name" style="display:block">vs ${esc(x.match.opponent || 'TBC')}${x.match.status !== 'scheduled' ? ` <span class="pill ${x.match.status === 'cancelled' ? 'bad' : 'neutral'}">${esc(M.MATCH_STATUS[x.match.status])}</span>` : ''}${M.matchOutcome(x.match) ? ` <span class="pill ${M.matchOutcome(x.match) === 'win' ? 'ok' : 'neutral'}">${esc(resultText(x.match))}</span>` : ''}</span>
    <span class="tagline">${esc([M.teamName(x.team), fmtDay(x.match.date), x.match.start && fmtTime(x.match.start), x.match.round, x.match.field && `Field ${x.match.field}`].filter(Boolean).join(' · '))}</span></span><span aria-hidden="true" class="chev">›</span></button>`;
  const entryRow = e => { const own = ms.filter(x => x.entry.id === e.id), rec = M.teamRecord(own.map(x => x.match), today), loose = M.unlinkedInDates(ws, c.id, e.teamId).filter(m => !e.seasonId || m.seasonId === e.seasonId);
    return `<div class="season-row"><div class="grow"><span class="name" style="display:block">${esc(entryName(e))} ${e.status === 'withdrawn' ? '<span class="pill neutral">Withdrawn</span>' : ''}</span>
      <span class="sub" style="display:block;white-space:normal">${esc([e.division && `Division ${e.division}`, e.pool && `Pool ${e.pool}`, `${own.length} fixture${own.length === 1 ? '' : 's'}`, rec.withResult ? `W${rec.won} D${rec.drawn} L${rec.lost}` : ''].filter(Boolean).join(' · '))}</span>
      ${loose.length ? `<span class="tl-issue">${loose.length} match${loose.length === 1 ? '' : 'es'} in these dates not linked: <button class="link-btn inline" data-act="comp-link" data-id="${esc(c.id)}" data-entry="${esc(e.id)}">Review</button></span>` : ''}</div>
      <div class="btn-row"><button class="btn sm" data-act="comp-entry-edit" data-id="${esc(c.id)}" data-entry="${esc(e.id)}">Edit</button>${e.status === 'entered' ? `<button class="btn sm" data-act="comp-withdraw" data-id="${esc(c.id)}" data-entry="${esc(e.id)}">Withdraw</button>` : `<button class="btn sm" data-act="comp-reenter" data-id="${esc(c.id)}" data-entry="${esc(e.id)}">Enter again</button>`}${own.length ? '' : `<button class="btn sm" data-act="comp-entry-del" data-id="${esc(c.id)}" data-entry="${esc(e.id)}">Remove</button>`}</div></div>`; };
  const moves = { planned: [['active', 'Start'], ['archived', 'Archive']], active: [['completed', 'Complete']], completed: [['active', 'Reopen'], ['archived', 'Archive']], archived: [['completed', 'Restore']] }[c.status] || [];
  return `<button class="link-btn" data-act="comp-back" style="padding-top:0">‹ Competitions</button>
    <div class="sec-h"><h2>${esc(c.name)}</h2><button class="btn sm" data-act="comp-edit" data-id="${esc(c.id)}">Edit</button></div>
    <p class="muted" style="margin:-4px 0 12px">${compPill(c)} ${esc([M.COMP_FORMATS[c.format], c.edition, compDates(c), c.venue, c.organiser && `Run by ${c.organiser}`].filter(Boolean).join(' · '))}</p>
    ${c.description ? `<p style="margin-bottom:12px">${esc(c.description)}</p>` : ''}
    <div class="btn-row" style="margin-bottom:16px">${moves.map(([to, l]) => `<button class="btn sm" data-act="comp-move" data-id="${esc(c.id)}" data-to="${to}">${l}</button>`).join('')}</div>
    ${c.status === 'active' ? `<p class="hint" role="status" style="margin-bottom:12px">Active competitions appear on Home only for teams entered in them for their active season. ${c.entries.some(e => e.status === 'entered' && M.activeTeams(ws).some(t => t.id === e.teamId && (M.activeSeason(t) || {}).id === e.seasonId)) ? 'At least one active-season team is entered.' : 'No active-season team is entered yet. Use Enter a team below to show this competition on Home.'}</p>` : ''}
    <div class="cols"><div class="col">
    <section class="sec"><div class="sec-h"><h2>Teams entered</h2><button class="btn sm" data-act="comp-entry-new" data-id="${esc(c.id)}">${icon('plus', 18)}Enter a team</button></div>
      ${c.entries.length ? `<div class="list">${c.entries.map(entryRow).join('')}</div>` : '<p class="muted small">No teams entered yet.</p>'}</section>
    <section class="sec"><div class="sec-h"><h2>Rules</h2></div>
      <p class="small">${c.rules && M.ruleSet(c.rules) ? `Played to ${esc(M.ruleSet(c.rules).sportName)}, ${esc(M.ruleSet(c.rules).name)} rules.` : 'Each team’s own rule set.'}</p>
      ${c.bylaws.length ? `<ul class="rule-list bylaws">${c.bylaws.map(b => `<li><p>${esc(b.text)}</p></li>`).join('')}</ul><p class="hint">Competition by-laws: they add to or change the official rules for every team in it. A team’s own by-laws are on its Rules page.</p>` : '<p class="muted small">No competition by-laws recorded.</p>'}</section>
    </div><div class="col">
    <section class="sec"><div class="sec-h"><h2>Coming up</h2></div>${up.length ? `<div class="list">${up.slice(0, 10).map(row).join('')}</div>` : '<p class="muted small">No fixtures coming up.</p>'}</section>
    <section class="sec"><div class="sec-h"><h2>Results</h2></div>${done.length ? `<div class="list">${done.slice(0, 12).map(row).join('')}</div>` : '<p class="muted small">No results entered yet.</p>'}
      <p class="hint">Only our teams’ results are recorded here, so there’s no ladder or table.</p></section>
    </div></div>`;
}
function compForm(c, forEntry = null) {
  const isNew = !c;
  c = c || { name: '', sport: (M.clubOf(ws, data) || {}).sport || 'Oztag', format: 'league', edition: String(new Date().getFullYear()), start: '', end: '', organiser: '', venue: '', status: 'planned', description: '', rules: '', bylaws: [] };
  const sets = M.ruleSetList();
  state.compFor = forEntry;
  openSheet(isNew ? 'New competition' : `Edit ${c.name}`, `<form data-form="comp" autocomplete="off" novalidate><input type="hidden" name="id" value="${esc(isNew ? '' : c.id)}">
    <label class="field-l"><span>Name</span><input type="text" name="name" value="${esc(c.name)}" placeholder="e.g. Winter League 2027"></label>
    <div class="two"><label class="field-l"><span>Format</span><select name="format">${Object.entries(M.COMP_FORMATS).map(([k, l]) => `<option value="${k}" ${c.format === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field-l"><span>Sport</span>${sportSelect('sport', c.sport)}</label></div>
    <div class="two"><label class="field-l"><span>Year or edition</span><input type="text" name="edition" value="${esc(c.edition)}"></label>
      <label class="field-l"><span>Status</span><select name="status">${Object.entries(M.COMP_STATUS).map(([k, l]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="two"><label class="field-l"><span>Starts</span><input type="date" name="start" value="${esc(c.start)}"></label><label class="field-l"><span>Ends</span><input type="date" name="end" value="${esc(c.end)}"></label></div>
    <div class="two"><label class="field-l"><span>Run by</span><input type="text" name="organiser" value="${esc(c.organiser)}" placeholder="e.g. NSW Oztag"></label><label class="field-l"><span>Venue</span><input type="text" name="venue" value="${esc(c.venue)}"></label></div>
    <label class="field-l"><span>Rules</span><select name="rules"><option value="">Each team’s own rule set</option>${sets.map(x => `<option value="${esc(x.id)}" ${c.rules === x.id ? 'selected' : ''}>${esc(x.sportName)}, ${esc(x.name)}</option>`).join('')}</select></label>
    <label class="field-l"><span>Competition by-laws, one per line</span><textarea name="bylaws" rows="3" placeholder="e.g. Games are 2 × 15 minutes">${esc(c.bylaws.map(b => b.text).join('\n'))}</textarea></label>
    <label class="field-l"><span>Notes</span><input type="text" name="description" value="${esc(c.description)}"></label>
    ${forEntry ? `<p class="hint" style="margin:-4px 0 12px">${esc(entryName({ teamId: forEntry.team, seasonId: forEntry.season }))} will be entered in it.</p>` : ''}
    <button class="btn primary block" type="submit">${isNew ? 'Create competition' : 'Save'}</button></form>`, 'comp');
}
function entryForm(c, e, preset = null) {
  const opts = M.activeTeams(ws).flatMap(t => M.seasonsOf(t).filter(s => s.status !== 'archived').map(s => ({ v: `${t.id}|${s.id}`, l: `${M.teamName(t)} · ${s.name}${s.status === 'active' ? '' : ` (${M.SEASON_STATUS[s.status].toLowerCase()})`}` })));
  const cur = e ? `${e.teamId}|${e.seasonId}` : preset ? `${preset.team}|${preset.season}` : `${data.id}|${(M.activeSeason(data) || {}).id}`;
  openSheet(e ? 'Edit entry' : `Enter a team in ${c.name}`, `<form data-form="comp-entry" autocomplete="off" novalidate><input type="hidden" name="comp" value="${esc(c.id)}"><input type="hidden" name="entry" value="${esc(e ? e.id : '')}">
    ${e ? `<p style="margin-bottom:12px"><b>${esc(entryName(e))}</b></p>` : `<label class="field-l"><span>Team and season</span><select name="ts">${opts.map(o => `<option value="${esc(o.v)}" ${o.v === cur ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`}
    <div class="two"><label class="field-l"><span>Division or grade</span><input type="text" name="division" value="${esc(e ? e.division : '')}" placeholder="e.g. Women’s Open"></label>
      <label class="field-l"><span>Pool</span><input type="text" name="pool" value="${esc(e ? e.pool : '')}" placeholder="e.g. A"></label></div>
    <p class="hint" style="margin:-4px 0 12px">A team can enter more than one division; the same division only once.</p>
    <button class="btn primary block" type="submit">${e ? 'Save' : 'Enter team'}</button></form>`, 'comp-entry');
}
// Link a team's matches in the competition's dates, chosen one by one (never done on its own).
function compLinkSheet(c, e) {
  const t = M.findTeam(ws, e.teamId), loose = M.unlinkedInDates(ws, c.id, e.teamId).filter(m => !e.seasonId || m.seasonId === e.seasonId);
  openSheet(`Link matches to ${c.name}`, `<form data-form="comp-link" novalidate><input type="hidden" name="comp" value="${esc(c.id)}"><input type="hidden" name="entry" value="${esc(e.id)}">
    <p class="muted small" style="margin-bottom:10px">${esc(M.teamName(t))}’s matches in ${esc(compDates(c))} that aren’t in a competition. Tick the ones that belong to ${esc(c.name)}.</p>
    ${loose.map(m => `<label class="check"><input type="checkbox" name="m" value="${esc(m.id)}"><span>vs ${esc(m.opponent || 'TBC')} · ${esc(fmtDay(m.date))}${m.start ? `, ${esc(fmtTime(m.start))}` : ''}${m.round ? ` · ${esc(m.round)}` : ''}</span></label>`).join('')}
    <button class="btn primary block" type="submit">Link the ticked matches</button></form>`, 'comp-link');
}
function seasonComps(s) {
  const list = M.teamEntries(ws, data.id, s.id);
  return `<span class="sub" style="display:block;white-space:normal">Competitions: ${list.length ? list.map(({ comp, entry }) => `<button class="link-btn inline" data-act="comp-open" data-id="${esc(comp.id)}">${esc(comp.name)}${entry.division ? ` (${esc(entry.division)})` : ''}</button>${entry.status === 'withdrawn' ? ' (withdrawn)' : ''}`).join(', ') : 'none'}
    ${s.status !== 'archived' ? ` · <button class="link-btn inline" data-act="comp-enter" data-season="${esc(s.id)}">Enter one</button>` : ''}</span>`;
}
function compEnterSheet(sid) {
  const s = M.findSeason(data, sid), have = new Set(M.teamEntries(ws, data.id, sid).map(x => x.comp.id));
  const list = M.compsOf(ws).filter(c => c.status !== 'archived' && c.status !== 'completed');
  openSheet(`Enter ${data.team.name}, ${s ? s.name : ''}`, `<p class="muted small" style="margin-bottom:10px">Pick a competition that’s already here, or create a new one.</p>
    ${list.length ? `<div class="list">${list.map(c => `<button class="pick" data-act="comp-entry-new" data-id="${esc(c.id)}" data-team="${esc(data.id)}" data-season="${esc(sid)}"><span class="grow"><span class="name" style="display:block">${esc(c.name)}${have.has(c.id) ? ' <span class="pill ok">Entered</span>' : ''}</span><span class="tagline">${esc([M.COMP_FORMATS[c.format], compDates(c)].join(' · '))}</span></span></button>`).join('')}</div>` : '<p class="muted small">No competitions yet.</p>'}
    <button class="btn primary block" style="margin-top:12px" data-act="comp-new" data-team="${esc(data.id)}" data-season="${esc(sid)}">${icon('plus')}New competition</button>`, 'comp-enter');
}

// A club logo from the phone: any image, shrunk to fit 160 px and kept as a small WebP (or PNG, or
// JPEG if it's still too big) with the club.
const readLogo = file => readImage(file, 160, M.LOGO_MAX, M.validLogo);
// Preserve existing photos up to PHOTO_MAX, but aim for much smaller new avatars so
// multi-team encrypted drafts (including their base snapshots) fit mobile storage.
const readPhoto = file => readImage(file, 180, M.PHOTO_MAX, M.validPhoto, 12000);
function readImage(file, px, max, valid, target = max) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Pick an image file')); return; }
    if (file.size > 15e6) { reject(new Error('That image is too big. Try one under 15 MB.')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const W0 = img.naturalWidth || px, H0 = img.naturalHeight || px, k = Math.min(1, px / Math.max(W0, H0));
      const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(W0 * k)); cv.height = Math.max(1, Math.round(H0 * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      let out = '';
      try {
        out = cv.toDataURL('image/webp', 0.85);
        if (!/^data:image\/(webp|png)/.test(out)) out = cv.toDataURL('image/png');
        if (out.length > max) out = cv.toDataURL('image/jpeg', 0.8);
      } catch (e) { reject(new Error('That image can’t be used. Try a PNG or JPEG.')); return; }
      if (out.length > target) {
        for (const quality of [0.7, 0.5, 0.35]) {
          const smaller = cv.toDataURL('image/webp', quality);
          if (valid(smaller) && smaller.length <= target) { out = smaller; break; }
          const jpeg = cv.toDataURL('image/jpeg', quality);
          if (valid(jpeg) && jpeg.length <= target) { out = jpeg; break; }
        }
      }
      if (!valid(out) || out.length > target) { reject(new Error('That image cannot fit the phone storage target. Try a simpler or smaller PNG/JPEG.')); return; }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image can’t be read. Try a PNG or JPEG.')); };
    img.src = url;
  });
}

// After a jersey change: refresh the player sheet if it's open, otherwise the page.
function afterJersey(p, msg) {
  render();
  const blk = $('#sheet form[data-form=player] .jersey-block');
  if (blk) blk.outerHTML = jerseyBlock(p);   // keeps anything typed in the form
  toast(msg);
}

/* ---------- Seasons ---------- */
// A team plays season after season. The active season is the one being run; past seasons are kept as
// they were and opened read-only (with a deliberate "make a correction" step), and the next season is
// set up by picking who carries over. Nothing from one season's schedule is copied into the next.
const SAFE_ACTS = new Set(('tab nav close-sheet settings layout layout-width lock-mode refresh sign-out squad-filter train-view report-range toggle-past attendance '
  + 'lineup-menu layer system sys-side sys-play task-view task-filter task-waiting play-open play-phase anim-play anim-slow play-back play-side plays-view psets '
  + 'preview-on preview-off teams team-switch team-pick home-scope home-days home-more home-go updates rules-open rules-seen review-system review-play club-open '
  + 'export export-legacy export-pre export-pre-seasons match-open edit-session task-open roll rsvp-open').split(' '));
const pastMsg = () => V && V.viewSeason ? `${V.viewSeason.name} is read-only. Go back to the current season, or make a correction.` : 'Start a season first: Seasons, from the season under the team name.';
function blockedInPast(act) {
  if (!V || S.role !== 'coach' || state.preview || /^(season|comp|club)-/.test(act) || SAFE_ACTS.has(act)) return false;
  if (correcting()) {
    if (!['add-player', 'bulk-add', 'edit-player', 'delete-player', 'sample'].includes(act)) return false;
    toast(`Change the ${V.viewSeason.name} squad in Seasons.`); return true;
  }
  if (!V.readOnly) return false;
  toast(pastMsg()); return true;
}
function seasonBanner() {
  if (S.role !== 'coach' || state.preview || !M.seasonsOf(data).length) return '';
  const s = V.viewSeason, act = M.activeSeason(data);
  if (!s) return `<div class="season-banner" role="status"><span>No season is active, so there’s nothing to run. Start or plan one.</span><button class="btn sm" data-act="season-open">Seasons</button></div>`;
  if (!V.readOnly) return '';
  if (correcting()) return `<div class="season-banner fix" role="status"><span><b>Correcting ${esc(s.name)}.</b> What you change here is saved to that season.</span><button class="btn sm" data-act="season-fix-done">Done</button></div>`;
  return `<div class="season-banner" role="status"><span><b>${esc(s.name)}</b> · ${M.SEASON_STATUS[s.status]}. Looking back, so nothing can be changed.</span>
    <span class="btn-row">${act ? `<button class="btn sm primary" data-act="season-view" data-id="${esc(act.id)}">Back to ${esc(act.name)}</button>` : ''}${s.status === 'completed' ? '<button class="btn sm" data-act="season-fix">Make a correction</button>' : ''}</span></div>`;
}
const seasonDates = s => s.start ? `${fmtDay(s.start)}${s.end ? ` – ${fmtDay(s.end)}` : ''}` : 'Dates not set';
const seasonPill = s => `<span class="pill ${s.status === 'active' ? 'ok' : s.status === 'planned' ? 'neutral' : 'neutral'}">${M.SEASON_STATUS[s.status]}</span>`;
function seasonPicker() {
  const list = M.seasonsOf(data).filter(s => s.status !== 'archived').slice().reverse(), cur = V.viewSeason;
  openSheet('Season', `<div class="list">${list.map(s => `<button class="pick" data-act="season-view" data-id="${esc(s.id)}" ${cur && cur.id === s.id ? 'aria-current="true"' : ''}>
      <span class="grow"><span class="name" style="display:block">${esc(s.name)} ${seasonPill(s)}</span><span class="tagline">${esc(seasonDates(s))} · ${s.squad.length} players</span></span>${cur && cur.id === s.id ? icon('check') : ''}</button>`).join('')}</div>
    <p class="hint">A past season opens read-only. Home and the players’ page always show the active season.</p>
    <button class="btn block" style="margin-top:12px" data-act="season-open">Manage seasons</button>`, 'season-pick');
}
function seasonsSheet() {
  const all = M.seasonsOf(data).slice().reverse(), act = M.activeSeason(data);
  const counts = s => { const L = M.seasonLens(data, s.id); return `${L.players.length} players · ${L.sessions.length} training · ${L.matches.length} matches`; };
  const moves = s => (M.SEASON_MOVES[s.status] || []).map(to => {
    const label = to === 'active' ? (s.status === 'completed' ? 'Reopen' : act ? `Start (completes ${act.name})` : 'Start') : to === 'completed' ? (s.status === 'archived' ? 'Restore' : 'Complete') : 'Archive';
    return `<button class="btn sm" data-act="season-move" data-id="${esc(s.id)}" data-to="${to}">${esc(label)}</button>`;
  }).join('');
  openSheet(`Seasons: ${data.team.name}`, `<p class="muted small" style="margin-bottom:12px">Each season keeps its own squad, numbers, training and roll calls, matches and results, tasks and messages. The team, its plays and its saved lineups carry on from season to season.</p>
    <div class="btn-row" style="margin-bottom:14px"><button class="btn primary" data-act="season-next">${icon('plus')}Create next season</button><button class="btn" data-act="season-new">Plan a season</button></div>
    <div class="list">${all.map(s => `<div class="season-row ${s.status}"><div class="grow"><span class="name" style="display:block">${esc(s.name)} ${seasonPill(s)}</span>
      <span class="sub" style="display:block;white-space:normal">${esc(seasonDates(s))} · ${esc(counts(s))}</span>${seasonComps(s)}</div>
      <div class="btn-row"><button class="btn sm" data-act="season-view" data-id="${esc(s.id)}">${s.status === 'active' ? 'Open' : 'Look back'}</button><button class="btn sm" data-act="season-squad" data-id="${esc(s.id)}">Squad</button><button class="btn sm" data-act="season-edit" data-id="${esc(s.id)}">Edit</button>${moves(s)}</div></div>`).join('')}</div>
    <p class="hint">Only one season can be active. Completing a season keeps it as it was; you can still correct it later, deliberately.</p>`, 'seasons');
}
function seasonForm(s) {
  const T = data.team, isNew = !s;
  s = s || { name: '', label: '', year: String(new Date().getFullYear()), start: '', end: '' };
  openSheet(isNew ? 'Plan a season' : `Edit ${s.name}`, `<form data-form="season" autocomplete="off" novalidate><input type="hidden" name="id" value="${esc(isNew ? '' : s.id)}">
    <label class="field-l"><span>Season name</span><input type="text" name="name" value="${esc(s.name)}" placeholder="e.g. Winter 2027"></label>
    <div class="two"><label class="field-l"><span>Type</span><input type="text" name="label" list="season-labels" value="${esc(s.label)}" placeholder="e.g. Winter"></label>
      <label class="field-l"><span>Year</span><input type="text" name="year" inputmode="numeric" value="${esc(s.year)}"></label></div>
    <datalist id="season-labels">${['Winter', 'Summer', 'Autumn', 'Spring', 'Season'].map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="two"><label class="field-l"><span>Starts</span><input type="date" name="start" value="${esc(s.start)}"></label><label class="field-l"><span>Ends</span><input type="date" name="end" value="${esc(s.end)}"></label></div>
    ${isNew ? `<p class="hint" style="margin:-4px 0 14px">A planned season starts with no squad. To carry players over from ${esc((M.activeSeason(data) || {}).name || 'this season')}, use Create next season instead.</p>` : ''}
    <button class="btn primary block" type="submit">${isNew ? 'Plan season' : 'Save'}</button></form>`, 'season');
}
const parseNewPlayers = text => String(text || '').split(/\n+/).map(l => l.trim()).filter(Boolean).map(line => {
  const parts = line.split(/[,\t;]+/).map(x => x.trim()).filter(Boolean), p = { name: parts[0] || '', gender: '', number: '' };
  parts.slice(1).forEach(x => { const low = x.toLowerCase(); if (['f', 'female', 'w', 'woman', 'girl'].includes(low)) p.gender = 'F'; else if (['m', 'male', 'man', 'boy'].includes(low)) p.gender = 'M'; else if (/^\d{1,3}$/.test(x)) p.number = x; });
  return p;
}).filter(p => p.name);
function rolloverForm(d) {
  const cur = M.activeSeason(data), L = M.activeLens(data), T = data.team;
  const nextYear = cur && /^\d{4}$/.test(cur.year) ? String(+cur.year + 1) : String(new Date().getFullYear() + 1);
  const named = cur && M.nextSeasonName(cur.name) !== cur.name ? M.nextSeasonName(cur.name) : `${cur && cur.label ? cur.label + ' ' : ''}${nextYear}`;
  d = d || { name: named, label: cur ? cur.label : '', year: nextYear,
    start: '', end: '', activate: false, carry: [], newText: '', staff: arr(T.staff).map((_, i) => i), keepDefaults: true };
  const carried = new Map(d.carry.map(c => [c.playerId, c]));
  const players = L.players.slice().sort((a, b) => a.name.localeCompare(b.name));
  openSheet('Create next season', `<form data-form="season-next" autocomplete="off" novalidate>
    <h3 class="form-sec">1. The season</h3>
    <label class="field-l"><span>Season name</span><input type="text" name="name" value="${esc(d.name)}"></label>
    <div class="two"><label class="field-l"><span>Type</span><input type="text" name="label" list="season-labels2" value="${esc(d.label)}" placeholder="e.g. Winter"></label><label class="field-l"><span>Year</span><input type="text" name="year" inputmode="numeric" value="${esc(d.year)}"></label></div>
    <datalist id="season-labels2">${['Winter', 'Summer', 'Autumn', 'Spring', 'Season'].map(x => `<option value="${x}">`).join('')}</datalist>
    <div class="two"><label class="field-l"><span>Starts</span><input type="date" name="start" value="${esc(d.start)}"></label><label class="field-l"><span>Ends</span><input type="date" name="end" value="${esc(d.end)}"></label></div>
    <fieldset class="radio-set"><legend>When</legend>
      <label class="check"><input type="radio" name="when" value="plan" ${d.activate ? '' : 'checked'}><span>Plan it: ${esc(cur ? cur.name : 'this season')} carries on for now</span></label>
      <label class="check"><input type="radio" name="when" value="now" ${d.activate ? 'checked' : ''}><span>Start it now${cur ? ` and complete ${esc(cur.name)}` : ''}</span></label></fieldset>
    <h3 class="form-sec">2. Who carries over</h3>
    <p class="muted small" style="margin-bottom:8px">Tick the players coming back. Anyone you leave unticked stays in ${esc(cur ? cur.name : 'this season')}’s history. Availability starts fresh.</p>
    ${players.length ? `<button type="button" class="btn sm" data-act="season-carry-all" style="margin-bottom:8px">Tick everyone</button>
    <div class="carry-list">${players.map(p => { const c = carried.get(p.id); return `<div class="carry-row">
      <label class="check"><input type="checkbox" name="carry" value="${esc(p.id)}" ${c ? 'checked' : ''}><span>${esc(p.name)}${p.status !== 'available' ? ` <span class="pill ${p.status}">${esc(STATUS[p.status] || p.status)} now: check</span>` : ''}</span></label>
      <div class="two"><label class="field-l"><span>Number</span><input type="text" name="num-${esc(p.id)}" inputmode="numeric" value="${esc(c ? c.number : p.number || '')}"></label>
      <label class="field-l"><span>Positions</span><input type="text" name="pos-${esc(p.id)}" value="${esc((c ? c.positions : arr(p.positions)).join(', '))}"></label></div></div>`; }).join('')}</div>` : '<p class="muted small">No players in this season.</p>'}
    <label class="field-l"><span>New players, one per line</span><textarea name="newPlayers" rows="3" placeholder="Name, F or M, number">${esc(d.newText)}</textarea><small>People already in the team’s history: tick them above instead, so their record carries on.</small></label>
    <h3 class="form-sec">3. Staff and training</h3>
    ${arr(T.staff).length ? arr(T.staff).map((r, i) => `<label class="check"><input type="checkbox" name="staff" value="${i}" ${d.staff.includes(i) ? 'checked' : ''}><span>${esc(r.role)}: ${esc(r.name)}</span></label>`).join('') : '<p class="muted small">No staff recorded for this season.</p>'}
    <label class="check"><input type="checkbox" name="keepDefaults" ${d.keepDefaults ? 'checked' : ''}><span>Keep the training venue and times${T.trainingVenue || T.trainingStart ? ` (${esc([T.trainingVenue, T.trainingStart && fmtTime(T.trainingStart)].filter(Boolean).join(', '))})` : ''}</span></label>
    <p class="hint">Plays, game systems, saved lineups and by-laws belong to the team and carry on. Training, matches, results, RSVPs, tasks, lifts and messages stay with ${esc(cur ? cur.name : 'this season')}.</p>
    <button class="btn primary block" type="submit">Review</button></form>`, 'season-next');
}
function rolloverReview() {
  const d = state.rollover, cur = M.activeSeason(data), L = M.activeLens(data), T = data.team;
  const byId = new Map(L.players.map(p => [p.id, p])), carry = d.carry.map(c => ({ ...c, p: byId.get(c.playerId) })).filter(c => c.p);
  const left = L.players.filter(p => !d.carry.some(c => c.playerId === p.id)), fresh = parseNewPlayers(d.newText), staff = d.staff.map(i => arr(T.staff)[i]).filter(Boolean);
  const li = xs => xs.length ? `<ul class="plain">${xs.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted small">None.</p>';
  openSheet('Check before creating', `<div class="review">
    <p><b>${esc(d.name)}</b>${d.start ? ` · ${esc(seasonDates(d))}` : ''}. ${d.activate ? `Starts now; ${esc(cur ? cur.name : '')} is marked completed.` : 'Planned: it starts when you start it.'}</p>
    <h3 class="form-sec">Carrying over (${carry.length})</h3>${li(carry.map(c => `${esc(c.p.name)}${c.number ? ` · #${esc(c.number)}` : ''}${c.positions.length ? ` · ${esc(c.positions.join(', '))}` : ''}`))}
    <h3 class="form-sec">New (${fresh.length})</h3>${li(fresh.map(p => `${esc(p.name)}${p.gender ? ` · ${p.gender}` : ''}${p.number ? ` · #${esc(p.number)}` : ''}`))}
    <h3 class="form-sec">Staying in ${esc(cur ? cur.name : 'this season')} (${left.length})</h3>${li(left.map(p => esc(p.name)))}
    <h3 class="form-sec">Staff and training</h3>${li([...staff.map(r => `${esc(r.role)}: ${esc(r.name)}`), d.keepDefaults ? 'Training venue and times kept' : 'Training venue and times start blank'])}
    <p class="hint">Not copied: training, roll calls, matches, results, RSVPs, tasks, lifts and messages.</p>
    <div class="btn-row"><button class="btn" data-act="season-next-back">Back</button><button class="btn primary" data-act="season-next-go">Create ${esc(d.name)}</button></div></div>`, 'season-review');
}
function seasonSquadForm(s) {
  const live = s.status === 'active', members = new Map(s.squad.map(m => [m.playerId, m]));
  const inSquad = M.seasonLens(data, s.id).players.slice().sort((a, b) => a.name.localeCompare(b.name)), ids = new Set(inSquad.map(p => p.id));
  const others = data.players.filter(p => !ids.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  openSheet(`${s.name} squad`, `<form data-form="season-squad" autocomplete="off" novalidate><input type="hidden" name="id" value="${esc(s.id)}">
    <p class="muted small" style="margin-bottom:10px">${live ? 'This is the active season: numbers and positions here are the players’ current ones.' : `Numbers, positions and registration as they ${s.status === 'planned' ? 'will be' : 'were'} in ${esc(s.name)}. Changing them doesn’t touch any other season.`}</p>
    ${inSquad.length ? inSquad.map(p => { const m = members.get(p.id) || { number: p.number || '', positions: arr(p.positions), reg: '' }, only = M.memberSeasons(data, p.id).filter(x => x.id !== s.id).length === 0;
      return `<fieldset class="person-row"><legend>${esc(p.name)}</legend>
      <div class="two"><label class="field-l"><span>Number</span><input type="text" name="num-${esc(p.id)}" inputmode="numeric" value="${esc(live ? p.number || '' : m.number)}"></label>
      <label class="field-l"><span>Positions</span><input type="text" name="pos-${esc(p.id)}" value="${esc((live ? arr(p.positions) : m.positions).join(', '))}"></label></div>
      <div class="two"><label class="field-l"><span>Registration</span><select name="reg-${esc(p.id)}">${Object.entries(M.REG_STATUS).map(([k, l]) => `<option value="${k}" ${m.reg === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="remove" value="${esc(p.id)}"><span>Take out of this squad${only ? ' (only in this season, so removed from the team)' : ''}</span></label></div></fieldset>`; }).join('') : '<p class="muted small">Nobody in this squad yet.</p>'}
    ${others.length ? `<h3 class="form-sec">Add from the team’s players</h3>${others.map(p => `<label class="check"><input type="checkbox" name="add" value="${esc(p.id)}"><span>${esc(p.name)}</span></label>`).join('')}` : ''}
    <button class="btn primary block" type="submit">Save squad</button></form>`, 'season-squad');
}

/* ---------- The library ---------- */
// Plays, game systems and player lists kept once for every team (see model.js). A team uses a linked
// copy; changing the copy marks it as the team's own version, and saving to the library updates
// every team still using the library version. Library files can be exported to another coach.
const LIB_STATUS = { current: 'Up to date', behind: 'Newer library version', edited: 'Changed in this team', 'edited-behind': 'Changed in this team; newer library version', gone: 'No longer in the library' };
const sysName = id => (systemBase(id) || {}).name || id;
function libUseLine(kind, li) {
  const use = M.libUsage(ws, kind, li.id);
  return use.length ? `Used by ${use.map(u => `${esc(M.teamName(u.team))}${u.status !== 'current' ? ` (${esc(LIB_STATUS[u.status].toLowerCase())})` : ''}`).join(', ')}` : 'Not used by any team yet';
}
function libRow(kind, li) {
  const name = kind === 'systems' ? sysName(li.id) : li.name || '?';
  const mine = kind === 'systems' ? (data.systems[li.id] && data.systems[li.id].lib ? data.systems[li.id] : null) : arr(data[kind]).find(x => x.lib && x.lib.id === li.id);
  const st = mine ? M.libStatus(ws, kind, mine) : null;
  const act = !mine ? `<button class="btn sm primary" data-act="lib-add" data-k="${kind}" data-id="${esc(li.id)}">Add to this team</button>`
    : st === 'current' ? `<span class="pill ok">In this team</span>`
    : `<button class="btn sm" data-act="lib-take" data-k="${kind}" data-id="${esc(kind === 'systems' ? li.id : mine.id)}">Use library version</button>`;
  return `<div class="row lib-row"><span class="grow"><span class="name" style="display:block">${esc(name)} <span class="muted small">v${li.rev || 1}</span></span>
      <span class="sub lib-use">${libUseLine(kind, li)}</span></span>${act}
      <button class="icon-btn" data-act="lib-remove" data-k="${kind}" data-id="${esc(li.id)}" aria-label="Take ${esc(name)} out of the library">${icon('close', 18)}</button></div>`;
}
function viewLibrary() {
  if (!isCoach()) return '';
  const sec = (kind, title, empty) => { const items = M.libItems(ws, kind); return `<h3 class="form-sec">${title} (${items.length})</h3>${items.length ? `<div class="list">${items.map(li => libRow(kind, li)).join('')}</div>` : `<p class="muted small">${empty}</p>`}`; };
  return `<div class="sec-h"><h2>Library</h2></div><p class="hint" style="margin:-4px 0 6px">Shared by all your teams. Save a play, a game system or a player list to the library from where you edit it, then add it to any team. Teams that haven’t changed their copy get each new library version; a team that has keeps its own.</p>
    ${sec('plays', 'Plays', 'No plays yet. Open a play and choose Save to library.')}
    ${sec('systems', 'Game systems', 'None yet. Show a game system on the Lineup page and choose Save to library.')}
    ${sec('playerSets', 'Player lists', 'None yet. Open Plays › Player lists and save a list to the library.')}
    <div class="btn-row" style="margin-top:16px"><button class="btn" data-act="lib-export">Export the library</button><button class="btn" data-act="lib-import">Import a library</button></div>
    <p class="hint">A library file holds plays, systems and labels only: no players, phone numbers or results. Use it to share with another coach.</p>`;
}
// The library line on a play, game system or player list the coach is looking at.
function libBar(kind, id, x) {
  if (!isCoach()) return '';
  const st = x && x.lib ? M.libStatus(ws, kind, x) : null;
  if (!st) return `<p class="lib-bar"><button class="link-btn inline" data-act="lib-save" data-k="${kind}" data-id="${esc(id)}">Save to library</button> <span class="muted">so your other teams can use it</span></p>`;
  const li = M.libGet(ws, kind, x.lib.id);
  return `<p class="lib-bar"><span class="pill ${st === 'current' ? 'ok' : 'neutral'}">Library${li ? ` v${li.rev || 1}` : ''}: ${esc(LIB_STATUS[st])}</span>
    ${st.startsWith('edited') ? `<button class="link-btn inline" data-act="lib-save" data-k="${kind}" data-id="${esc(id)}">Save changes to the library</button>` : ''}
    ${st === 'behind' || st === 'edited-behind' ? `<button class="link-btn inline" data-act="lib-take" data-k="${kind}" data-id="${esc(id)}">Use library version</button>` : ''}
    ${st !== 'current' ? `<button class="link-btn inline" data-act="lib-unlink" data-k="${kind}" data-id="${esc(id)}">Keep as this team’s own</button>` : ''}</p>`;
}
function libSaveReport(r) {
  const names = ids => ids.map(id => M.teamName(M.findTeam(ws, id))).join(', ');
  return `Saved to the library (v${r.rev})${r.updated.length ? `. Updated in ${names(r.updated)}` : ''}${r.kept.length ? `. Kept as changed in ${names(r.kept)}` : ''}`;
}

/* ---------- Backups and importing ---------- */
function importBody(raw) {
  // A whole copy: several teams, or (since seasons) any copy with its clubs and competitions.
  const many = Number(raw.schema) >= 3 && Array.isArray(raw.teams) && raw.teams.length > 0;
  const isWs = many || (Number(raw.schema) >= 4 && Array.isArray(raw.teams));
  const teams = isWs ? [raw, ...raw.teams] : [raw];
  const sum = t => `${esc((t.team && t.team.name) || 'Team')}: ${arr(t.players).length} players, ${arr(t.sessions).length} sessions, ${arr(t.matches).length} matches`;
  return `<p style="margin-bottom:10px">This backup has ${teams.length === 1 ? 'one team' : `${teams.length} teams`}:</p>
    <ul class="diff-list">${teams.map(t => `<li>${sum(t)}</li>`).join('')}</ul>
    <div class="list" style="margin-top:12px">
      ${isWs ? `<button class="pick" data-act="import-do" data-m="all"><span class="grow"><span class="name" style="display:block">Replace everything with it</span><span class="tagline">Every team, its seasons, the clubs, competitions and library on this phone are replaced.</span></span></button>` : ''}
      ${many ? '' : `<button class="pick" data-act="import-do" data-m="team"><span class="grow"><span class="name" style="display:block">Replace ${esc(data.team.name)} with it</span><span class="tagline">${S.trial ? '' : 'Its team password stays the same, so invite links keep working.'}</span></span></button>
      <button class="pick" data-act="import-do" data-m="add"><span class="grow"><span class="name" style="display:block">Add it as a new team</span><span class="tagline">Your teams stay as they are.</span></span></button>`}
    </div>
    <p class="hint">Not sure? Export a backup of what’s here first.</p>`;
}
function doImport(mode) {
  const raw = state.importing && state.importing.raw; if (!raw) return;
  const keepPass = t => ({ teamPass: t.teamPass, teamSalt: t.teamSalt });
  if (mode === 'all') {
    const old = Object.fromEntries(M.teamsOf(ws).map(t => [t.id, keepPass(t)]));
    ws = normalizeWs(raw);
    if (!S.trial) M.teamsOf(ws).forEach(t => { if (old[t.id] && old[t.id].teamPass) Object.assign(t, old[t.id]); else if (!t.teamPass) t.teamPass = newTeamPass(); });
    pickTeam();
  } else {
    const t = normalize(M.stripWs(raw));
    if (mode === 'team') {
      const keep = { id: data.id, archived: data.archived, ...keepPass(data) };
      Object.keys(data).filter(k => !['schema', 'teams', 'library'].includes(k)).forEach(k => delete data[k]);
      Object.assign(data, t, keep);
      M.ensureSeasons(data);   // an older backup gets its first season
    } else {
      t.id = M.uid(); t.archived = false;
      if (S.trial) { t.teamPass = ''; t.teamSalt = ''; }
      else if (!t.teamPass || M.teamsOf(ws).some(x => x.teamPass === t.teamPass)) { t.teamPass = newTeamPass(); t.teamSalt = ''; }
      M.addTeam(ws, t); pickTeam(t.id);
    }
    M.repairTeam(data);
  }
  state.importing = null; state.lineupId = null; state.msgDraft = null; state.playId = null;
  save(); closeSheet(); render(); toast(mode === 'add' ? `Added ${data.team.name}` : 'Backup imported');
}
async function download(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
const fileSlug = t => String(t.team.name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
function backupSection() {
  const pre = readJson(KEYS.backup), preS = readJson(KEYS.seasonsBackup);
  return `<h3 class="form-sec">Backup</h3>
  <p class="muted small" style="margin-bottom:10px">${S.trial ? 'Test-mode backups aren’t encrypted, so keep the file private. It includes any phone numbers you’ve entered.' : 'Backups are encrypted and open with the coach password.'} A backup holds every team and the library.</p>
  <div class="btn-row"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>
  <details class="more"><summary>Going back to the previous version of the app</summary>
    <p class="muted small" style="margin-bottom:10px">The previous version only knew one team. It still opens the first team (${esc(M.teamName(ws))}) as it is. To take another team back to it, export that team on its own.</p>
    <p class="muted small" style="margin-bottom:10px">Seasons and competitions came later. An earlier version still opens this copy, but shows every season’s training, matches and tasks together and ignores seasons and competitions; nothing is lost, and this version sorts it out again when it next opens the copy.</p>
    <div class="btn-row"><button class="btn" data-act="export-legacy">Export ${esc(data.team.name)} on its own</button>${pre ? `<button class="btn" data-act="export-pre">Copy from before the upgrade (${esc(fmtStamp(pre.at))})</button>` : ''}${preS ? `<button class="btn" data-act="export-pre-seasons">Copy from before seasons (${esc(fmtStamp(preS.at))})</button>` : ''}</div>
  </details>`;
}

/* ---------- More ---------- */
// "2 clubs · 1 active team (1 archived)": every club, the team's own included, lives under Clubs and teams.
function clubsTeamsLine() {
  const n = arr(ws.clubs).length, a = M.activeTeams(ws).length, x = M.teamsOf(ws).length - a;
  return `${n} club${n === 1 ? '' : 's'} · ${a} active team${a === 1 ? '' : 's'}${x ? ` (${x} archived)` : ''}. Club details, officials and team staff`;
}
function viewMore() {
  const coach = isCoach();
  const item = (act, attrs, title, sub, ic) => `<button class="pick more-item" data-act="${act}" ${attrs}><span class="more-ic">${icon(ic, 22)}</span><span class="grow"><span class="name" style="display:block">${title}</span><span class="tagline">${sub}</span></span></button>`;
  return `<div class="sec-h"><h2>More</h2></div><div class="list">
    ${coach ? item('tab', 'data-tab="messages"', 'Messages and noticeboard', 'WhatsApp messages, the message log and notices', 'chat') : item('tab', 'data-tab="notices"', 'Notices', 'Everything the coach has posted', 'clip')}
    ${coach ? item('tab', 'data-tab="reports"', 'Reports', 'Attendance, results, volunteering and loose ends', 'chart') : ''}
    ${coach ? '' : item('tab', 'data-tab="club"', curClub() ? esc(curClub().name) : 'Club', 'Club contacts, ground and links', 'team')}
    ${coach ? item('tab', 'data-tab="comps"', 'Competitions', (n => `${n} competition${n === 1 ? '' : 's'}: entries, fixtures and results`)(M.compsOf(ws).filter(c => c.status !== 'archived').length), 'chart') : ''}
    ${coach ? item('tab', 'data-tab="teams"', 'Clubs and teams', esc(clubsTeamsLine()), 'team') : ''}
    ${item('settings', '', 'Settings', coach ? 'Team, field, team contact, publishing, backups, screen layout' : 'Screen layout, updates, sign out', 'cog')}
  </div>
  ${coach ? '' : `<p class="hint">${S.fromCache ? 'No connection: you’re seeing the copy saved on this phone. ' : ''}The coach keeps everything up to date. Use Settings › Check for updates to get the latest.</p>`}`;
}
function viewNotices() {
  return `<div class="sec-h"><h2>Notices</h2>${isCoach() ? `<button class="btn sm" data-act="tab" data-tab="messages">Manage</button>` : ''}</div>
    ${V.notices.length ? `<div class="list">${V.notices.map(n => `<div class="notice"><span class="sub">${esc(fmtStamp(n.at))}</span><p>${esc(n.text)}</p></div>`).join('')}</div>` : '<div class="empty"><p>No notices yet.</p></div>'}`;
}

/* ---------- Rules ---------- */
// The official rule set the team plays to (the owner's, from rules.js), with the coach's own by-laws
// on top. Updates to the official rules come with the app; the coach reviews what they affect.
const RULE_VALUES = [['players', 'On the field'], ['minPlayers', 'Fewest to start'], ['maxMales', 'Most males on field'], ['interchange', 'Interchange'], ['set', 'Set'],
  ['passes', 'Passes before the carrier may run'], ['defence', 'Defence back'], ['defenceMoves', 'Defence can move'], ['markers', 'Markers'], ['kicking', 'Kicking'],
  ['tryPoints', 'Try'], ['field', 'Field'], ['game', 'Game'], ['sinBin', 'Sin bin']];
function ruleValue(k, v, rs) {
  if (k === 'set') return `${v} ${rs.values.setWord || 'tackles'}`;
  if (k === 'defence' && typeof v === 'number') return `${v} m`;
  if (k === 'tryPoints' && typeof v === 'number') return `${v} point${v === 1 ? '' : 's'}`;
  return String(v);
}
// Which rules each starter play relies on (a coach can change this in the play's Words tab).
const PLAY_RULES = {
  'quickie-out': ['oztag.ptb', 'oztag.dummyhalf', 'oztag.defence.moves'], 'quickie-in': ['oztag.ptb', 'oztag.dummyhalf', 'oztag.defence.moves'],
  'ninja': ['oztag.ptb', 'oztag.dummyhalf', 'oztag.marker'], 'out-the-back': ['oztag.dummyhalf', 'oztag.contact'],
  'hands-inside': ['oztag.contact'], 'hands-outside': ['oztag.contact'], 'wrap-block': ['oztag.contact'], 'back-inside-block': ['oztag.contact']
};
const playRules = p => arr(p.rules).length ? p.rules : PLAY_RULES[p.id] || [];
const curRules = () => M.teamRules(V.team, curClub());
const rulesSeenKey = () => `tm-rules-seen:${S.teamFile || 'team'}`;
// Rule updates not looked at yet: by the coach for this team (kept with the team), by a player on this phone.
function rulesUnseen() {
  const rs = V && curRules(); if (!rs) return [];
  return M.rulesNew({ rulesSeen: isCoach() ? V.team.rulesSeen : Number(store.get(rulesSeenKey()) || 0) }, rs.sport);
}
const updatesList = () => [...rulesUnseen().map(c => ({ kind: 'pack', c })), ...(isCoach() ? M.sourceAlerts(S.watch).map(a => ({ kind: 'source', a })) : [])];
function renderBell() {
  const b = $('#bell-btn'); if (!b) return;
  const n = updatesList().length;
  b.hidden = false; b.classList.toggle('has', n > 0);
  b.querySelector('.badge').textContent = n ? String(n) : '';
  b.setAttribute('aria-label', n ? `Updates: ${n} new` : 'Updates');
}
// The Rules watch results, published with the site (coach only, once per visit).
function loadWatch() {
  if (S.role !== 'coach' || S.watch !== undefined) return;
  S.watch = null;
  fetchSite('rules-watch.json').then(w => {
    if (!w || w.format !== 'rules-watch') return;
    S.watch = w; renderBell(); if (state.tab === 'rules' && !state.sheet) render();
  }).catch(() => { /* offline: try again next visit */ });
}
function viewRules() {
  const rs = curRules(), coach = isCoach(), T = V.team;
  if (!rs) return '<div class="empty"><p>No rule set chosen for this team.</p></div>';
  const bylaws = arr(T.bylaws), replaced = new Map(bylaws.filter(b => b.replaces).map(b => [b.replaces, b]));
  const unseen = rulesUnseen(), fresh = new Set(unseen.flatMap(c => arr(c.rules)));
  const mm = M.maxMalesOf(T, curClub()), values = { ...rs.values };
  if (values.maxMales != null) values.maxMales = mm;
  const ruleOf = id => rs.rules.find(r => r.id === id);
  const topics = [...new Set(rs.rules.map(r => r.topic))];
  return `<div class="sec-h"><h2>Rules</h2>${coach ? '<button class="btn sm" data-act="settings">Change rule set</button>' : ''}</div>
    <div class="card rules-head"><span class="sub">${esc(rs.sportName)}</span><h3>${esc(rs.name)}</h3>
      ${rs.source ? `<p class="muted small">From the <a href="${esc(rs.source.url)}" target="_blank" rel="noopener">${esc(rs.source.title)}</a> (${esc(rs.source.edition)}). Each rule shows its number in the rule book.</p>` : ''}
      ${rs.note ? `<p class="note">${esc(rs.note)}</p>` : ''}</div>
    ${unseen.length ? `<div class="note rules-new" role="status"><b>Rules updated ${esc(fmtDay(unseen[0].date))}.</b> ${esc(unseen[0].notice || unseen[0].summary)}
      <div class="btn-row">${coach ? '<button class="btn sm primary" data-act="rules-review">Review what it affects</button>' : '<button class="btn sm" data-act="rules-seen">Got it</button>'}</div></div>` : ''}
    <section class="sec"><div class="sec-h"><h2>At a glance</h2></div>
      <dl class="rule-values">${RULE_VALUES.filter(([k]) => values[k] != null && values[k] !== '').map(([k, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(ruleValue(k, values[k], rs))}${k === 'maxMales' && mm !== Number(rs.values.maxMales) ? ' <span class="pill neutral">our by-law</span>' : ''}</dd></div>`).join('')}</dl></section>
    ${bylaws.length || coach ? `<section class="sec"><div class="sec-h"><h2>Our by-laws</h2>${coach ? `<button class="btn sm" data-act="bylaw-add">${icon('plus', 18)}Add</button>` : ''}</div>
      ${bylaws.length ? `<ul class="rule-list bylaws">${bylaws.map(b => { const r = b.replaces && ruleOf(b.replaces); return `<li><p>${esc(b.text)}</p><span class="ref">${esc(b.topic)}${r ? ` · in place of ${esc(r.ref)}` : ''}</span>${coach ? `<button class="btn sm" data-act="bylaw-edit" data-id="${esc(b.id)}" aria-label="Edit by-law: ${esc(b.text.slice(0, 40))}">Edit</button>` : ''}</li>`; }).join('')}</ul>`
        : '<p class="muted small">Add your competition’s own rules: game length, kicking limits, points. They’re yours: rule updates never change them.</p>'}</section>` : ''}
    ${compBylaws()}
    ${topics.map(tp => `<section class="sec"><div class="sec-h"><h2>${esc(tp)}</h2></div><ul class="rule-list">${rs.rules.filter(r => r.topic === tp).map(r => { const b = replaced.get(r.id);
      return `<li class="${b ? 'replaced' : ''}"><p>${esc(r.text)}</p><span class="ref">Rule ${esc(r.ref)}</span>${fresh.has(r.id) ? ' <span class="pill ok">Updated</span>' : ''}${b ? ' <span class="pill neutral">Our by-law applies instead</span>' : ''}</li>`; }).join('')}</ul></section>`).join('')}
    ${coach ? rulesWatchPanel() : ''}
    <p class="hint">Rule set version ${M.RULES.pack}, ${esc(fmtLong(M.RULES.updated))}. The app’s owner keeps the official rules up to date; check anything that matters on the day with your competition.</p>`;
}
// By-laws of the competitions this season is entered in: they sit between the official rules and the
// team's own variations.
function compBylaws() {
  const list = S.role === 'coach' && !state.preview
    ? (V.viewSeason ? M.teamEntries(ws, data.id, V.viewSeason.id).filter(x => x.entry.status === 'entered').map(({ comp, entry }) => ({ name: comp.name, division: entry.division, id: comp.id, bylaws: comp.bylaws })) : [])
    : arr(V.competitions).filter(c => c.entryStatus !== 'withdrawn').map(c => ({ name: c.name, division: c.division, bylaws: arr(c.bylaws) }));
  const withRules = list.filter(c => c.bylaws.length);
  if (!withRules.length) return '';
  return `<section class="sec"><div class="sec-h"><h2>Competition by-laws</h2></div>
    ${withRules.map(c => `<h3 class="ag-date">${esc(c.name)}${c.division ? ` · ${esc(c.division)}` : ''}${c.id && isCoach() ? ` <button class="link-btn inline" data-act="comp-open" data-id="${esc(c.id)}">Edit</button>` : ''}</h3>
      <ul class="rule-list bylaws">${c.bylaws.map(b => `<li><p>${esc(b.text)}</p></li>`).join('')}</ul>`).join('')}
    <p class="hint">These apply to every team in the competition. Our own by-laws come on top.</p></section>`;
}
function rulesWatchPanel() {
  const w = S.watch, alerts = M.sourceAlerts(w), failed = w ? Object.entries(w.sources || {}).filter(([, x]) => x.error).map(([k]) => (M.RULES.sources[k] || {}).title || k) : [];
  return `<section class="sec"><div class="sec-h"><h2>Rule book watch</h2></div>
    <p class="muted small">${w ? `The rule books were last checked ${esc(fmtStamp(w.checkedAt))}.${alerts.length ? '' : ' No changes since the rules were checked against them.'}` : 'Once a week the app checks the official rule books for a new version. No results yet.'}</p>
    ${alerts.map(a => `<p class="note">The ${esc(a.title)} changed (found ${esc(fmtDay(a.changedAt.slice(0, 10)))}). The owner is checking it; any rule change comes here as an update once approved.</p>`).join('')}
    ${failed.length ? `<p class="muted small">Couldn’t check: ${esc(failed.join(', '))}.</p>` : ''}
    ${ghReady() && !S.trial ? '<button class="btn sm" data-act="rules-check">Check the rule books now</button>' : ''}</section>`;
}
function ruleSetField(T) {
  const club = M.clubOf(ws, data), auto = M.ruleSet(M.defaultRuleSet(T, club)), sets = M.ruleSetList();
  const groups = [...new Set(sets.map(x => x.sportName))];
  return `<label class="field-l"><span>Rule set</span><select name="rules"><option value="">Automatic: ${esc(auto.sportName)}, ${esc(auto.name)}</option>
    ${groups.map(g => `<optgroup label="${esc(g)}">${sets.filter(x => x.sportName === g).map(x => `<option value="${esc(x.id)}" ${T.rules === x.id ? 'selected' : ''}>${esc(g)}, ${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select>
    <small>The official rules this team plays to. Automatic follows the club’s sport and the category. Add your competition’s by-laws in Tactics › Rules.</small></label>`;
}
function playRulesField(draft) {
  const rs = M.teamRules(data.team, M.clubOf(ws, data)); if (!rs) return '';
  const on = new Set(playRules(draft)), topics = [...new Set(rs.rules.map(r => r.topic))];
  return `<details class="rule-pick"><summary>Rules this play relies on (${on.size})</summary><p class="hint">When one of these rules changes, you’ll be asked to check this play.</p>
    ${topics.map(t => `<fieldset><legend>${esc(t)}</legend>${rs.rules.filter(r => r.topic === t).map(r => `<label class="check"><input type="checkbox" name="rules" value="${esc(r.id)}" ${on.has(r.id) ? 'checked' : ''}><span>${esc(r.text.length > 90 ? r.text.slice(0, 88) + '…' : r.text)} <span class="ref">${esc(r.ref)}</span></span></label>`).join('')}</fieldset>`).join('')}</details>`;
}
function openUpdates() {
  const items = updatesList(), coach = isCoach();
  openSheet('Updates', items.length ? `<div class="list">${items.map(it => it.kind === 'pack'
    ? `<div class="notice"><span class="sub">Rules updated · ${esc(fmtDay(it.c.date))}</span><p>${esc(coach ? it.c.summary : it.c.notice || it.c.summary)}</p>
        <div class="btn-row"><button class="btn sm primary" data-act="${coach ? 'rules-review' : 'rules-open'}">${coach ? 'Review what it affects' : 'See the rules'}</button></div></div>`
    : `<div class="notice"><span class="sub">Rule book changed · ${esc(fmtDay(it.a.changedAt.slice(0, 10)))}</span><p>The ${esc(it.a.title)} has changed since the rules were last checked against it. The app’s owner is checking it; any rule change comes here once approved.</p>
        <div class="btn-row"><button class="btn sm" data-act="tab" data-tab="rules">Rules</button></div></div>`).join('')}</div>`
    : '<div class="empty"><p>You’re up to date. Rule updates and rule book changes show here.</p></div>', 'updates');
}
// Everything a rule update might affect: the game systems and the team's plays.
const ruleItems = () => [...SYSTEMS.map(x => ({ kind: 'system', id: x.id, name: x.name, rules: x.rules || [] })),
  ...data.plays.map(p => ({ kind: 'play', id: p.id, name: p.name, rules: playRules(p) }))];
function openRulesReview() {
  const rs = curRules(), changes = rulesUnseen();
  if (!rs || !changes.length) { closeSheet(); toast('No rule updates to review'); return; }
  const rv = M.ruleReview(changes, ruleItems(), data.team.bylaws), ruleOf = id => rs.rules.find(r => r.id === id);
  const changed = rv.ids.map(ruleOf).filter(Boolean), many = rv.bylaws.length > 1;
  openSheet('Rule update', `<form data-form="rules-review" novalidate>
    ${changes.map(c => `<div class="notice"><span class="sub">Rule set version ${c.pack} · ${esc(fmtDay(c.date))}</span><p>${esc(c.summary)}</p></div>`).join('')}
    <h3 class="form-sec">Rules that changed</h3>
    ${changed.length ? `<ul class="rule-list">${changed.map(r => `<li><p>${esc(r.text)}</p><span class="ref">Rule ${esc(r.ref)}</span></li>`).join('')}</ul>` : '<p class="muted small">None in this team’s rule set.</p>'}
    <h3 class="form-sec">Check these</h3>
    ${rv.items.length ? `<div class="list">${rv.items.map(it => `<div class="row"><div class="row-main"><span class="grow"><span class="name" style="display:block">${esc(it.name)}</span><span class="sub" style="display:block;white-space:normal">${it.kind === 'system' ? 'Game system' : 'Play'} · relies on rule ${it.hit.map(id => esc((ruleOf(id) || {}).ref || id)).join(', ')}</span></span></div>
      <button type="button" class="btn sm" data-act="review-${it.kind}" data-id="${esc(it.id)}" aria-label="Open ${esc(it.name)}">Open</button></div>`).join('')}</div>`
      : '<p class="muted small">None of your plays or game systems rely on these rules.</p>'}
    ${rv.bylaws.length ? `<p class="note">Your by-law${many ? 's' : ''} ${rv.bylaws.map(b => `“${esc(b.text)}”`).join(', ')} replace${many ? '' : 's'} a rule that changed. Check ${many ? 'they still apply' : 'it still applies'}.</p>` : ''}
    <label class="check"><input type="checkbox" name="notice" checked><span>Post a notice to players</span></label>
    <label class="field-l"><span>Notice</span><textarea name="noticeText" rows="3">${esc(`Rules update: ${changes[0].notice || changes[0].summary} See Tactics › Rules.`)}</textarea></label>
    <div class="btn-row"><button class="btn primary" type="submit">Mark as reviewed</button></div></form>`, 'rules-review');
}
function bylawForm(b) {
  const rs = curRules(); if (!rs) return;
  const topics = [...new Set([...rs.rules.map(r => r.topic), 'Other'])];
  openSheet(b ? 'Edit by-law' : 'New by-law', `<form data-form="bylaw" autocomplete="off" novalidate><input type="hidden" name="id" value="${esc(b ? b.id : '')}">
    <p class="muted small" style="margin-bottom:12px">A rule from your competition that adds to or replaces the official ${esc(rs.sportName)} rules. Players see it on the Rules page.</p>
    <label class="field-l"><span>Topic</span><select name="topic">${topics.map(t => `<option ${(b ? b.topic : 'Other') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="field-l"><span>The by-law</span><textarea name="text" rows="3" placeholder="e.g. Games are 2 × 15 minutes with a 2-minute break.">${esc(b ? b.text : '')}</textarea></label>
    <label class="field-l"><span>Replaces an official rule</span><select name="replaces"><option value="">No, it adds to them</option>${rs.rules.map(r => `<option value="${esc(r.id)}" ${b && b.replaces === r.id ? 'selected' : ''}>${esc(r.ref)}: ${esc(r.text.length > 70 ? r.text.slice(0, 68) + '…' : r.text)}</option>`).join('')}</select>
      <small>If that rule changes in an update, you’ll be asked to check this by-law.</small></label>
    <div class="btn-row">${b ? `<button type="button" class="btn" data-act="bylaw-del" data-id="${esc(b.id)}">Remove</button>` : ''}<button class="btn primary" type="submit">Save</button></div></form>`, 'bylaw');
}

/* ---------- Settings ---------- */
// Screen layout, kept on this device: Auto (wide on a computer or tablet), Phone, or Wide; and on a
// wide screen, a comfortable width or the full width of the window.
const layoutPref = () => ['auto', 'phone', 'wide'].includes(store.get('tm-layout')) ? store.get('tm-layout') : 'auto';
const widthPref = () => store.get('tm-width') === 'full' ? 'full' : 'comfy';
function applyLayout() {
  const pref = layoutPref(), wide = pref === 'wide' || (pref === 'auto' && window.innerWidth >= 1000);
  document.body.classList.toggle('wide', wide);
  document.body.classList.toggle('full', wide && widthPref() === 'full');
  const top = $('.top'); if (top) document.body.style.setProperty('--top-h', `${top.offsetHeight}px`);
}
function layoutSettings() {
  const pref = layoutPref(), w = widthPref();
  return `<h3 class="form-sec" style="margin-top:0">Screen layout</h3>
    <div class="seg" role="group" aria-label="Screen layout">${[['auto', 'Auto'], ['phone', 'Phone'], ['wide', 'Wide']].map(([v, l]) => `<button type="button" data-act="layout" data-v="${v}" aria-pressed="${pref === v}">${l}</button>`).join('')}</div>
    <div class="seg" role="group" aria-label="Width on a wide screen">${[['comfy', 'Comfortable width'], ['full', 'Full width']].map(([v, l]) => `<button type="button" data-act="layout-width" data-v="${v}" aria-pressed="${w === v}">${l}</button>`).join('')}</div>
    <p class="hint" style="margin:-4px 0 18px">Wide puts the sections down the side and uses the extra space on a computer: two columns, bigger diagrams and a bigger play editor. Auto uses it on any screen wider than a tablet. Saved on this device only.</p>`;
}
function settingsBody() {
  if (S.role === 'player') {
    return layoutSettings() + `<p class="muted" style="margin-bottom:14px">You're signed in as a player. Your coach updates everything here; pull fresh changes any time.</p>
      <div class="btn-row"><button class="btn dark" data-act="refresh">Check for updates</button></div>
      <h3 class="form-sec">This phone</h3>
      <button class="btn danger block" data-act="sign-out">Sign out</button>`;
  }
  const T = data.team;
  return layoutSettings() + `<h3 class="form-sec">Teams</h3>
    <p class="muted small" style="margin-bottom:10px">${multiTeam() ? `These settings are for ${esc(T.name)}. ` : ''}You can run more than one team, each with its own squad and players’ password.</p>
    <button class="btn block" data-act="teams">Manage teams</button>
    <form data-form="settings">
    <h3 class="form-sec">Team and tournament</h3>
    <label class="field-l"><span>Team name</span><input type="text" name="name" value="${esc(T.name)}"></label>
    ${teamDetailsFields(T)}
    <h3 class="form-sec">Tournament</h3>
    <label class="field-l"><span>Tournament</span><input type="text" name="event" value="${esc(T.event)}"></label>
    <div class="two">
      <label class="field-l"><span>Starts</span><input type="date" name="eventStart" value="${esc(T.eventStart)}"></label>
      <label class="field-l"><span>Ends</span><input type="date" name="eventEnd" value="${esc(T.eventEnd)}"></label>
    </div>
    <p class="note">The 2027 dates are a placeholder. Check them against the official draw and update them here.</p>
    <label class="field-l"><span>Tournament venue</span><input type="text" name="venue" value="${esc(T.venue)}"></label>
    <label class="field-l"><span>Max males on field</span><input type="number" name="maxMales" min="0" max="8" value="${esc(T.maxMales)}" placeholder="${M.maxMalesOf({ ...T, maxMales: '' }, M.clubOf(ws, data))}"><small>Leave blank to follow the rule set (${M.maxMalesOf({ ...T, maxMales: '' }, M.clubOf(ws, data))}). Change it only for a competition by-law.</small></label>
    <h3 class="form-sec">Team contact</h3>
    <p class="muted small" style="margin-bottom:10px">Who players and helpers reply to. “I can help” and replies about training and matches open WhatsApp with a message to this person. Everyone in the team can see this name and number.</p>
    <div class="two">
      <label class="field-l"><span>Name</span><input type="text" name="tasksName" value="${esc(T.tasksContact.name)}" placeholder="e.g. Sarah (team manager)"></label>
      <label class="field-l"><span>Mobile</span><input type="tel" name="tasksPhone" value="${esc(T.tasksContact.phone)}" placeholder="04xx xxx xxx"></label>
    </div>
    <h3 class="form-sec">Training defaults</h3>
    <label class="field-l"><span>Usual venue</span><input type="text" name="trainingVenue" value="${esc(T.trainingVenue)}"></label>
    <div class="two">
      <label class="field-l"><span>Usual start</span><input type="time" name="trainingStart" value="${esc(T.trainingStart)}"></label>
      <label class="field-l"><span>Usual finish</span><input type="time" name="trainingEnd" value="${esc(T.trainingEnd)}"></label>
    </div>
    <h3 class="form-sec">Field zones and channels</h3>
    <label class="field-l"><span>Zone depth from each try line (m)</span><input type="number" name="fieldZone" min="5" max="30" step="1" value="${esc(T.field.zone)}"><small>Sets the red zone (our end) and where good ball ends (their end). League uses 20 m on a 100 m field; 14 m is the same share of a 70 m Oztag field.</small></label>
    <div class="two">
      <label class="field-l"><span>Touch channels (m)</span><input type="number" name="fieldTouch" min="2" max="10" step="0.5" value="${esc(T.field.touch)}"></label>
      <label class="field-l"><span>Red middle channel (m)</span><input type="number" name="fieldMiddle" min="4" max="20" step="0.5" value="${esc(T.field.middle)}"></label>
    </div>
    <p class="hint" style="margin-top:-6px;margin-bottom:14px">The two outside channels share the rest of the 50 m width: ${esc(fieldDims(T.field).outside)} m each now.</p>
    <label class="field-l"><span>Positions</span><input type="text" name="positions" value="${esc(M.positionsFor(T, M.clubOf(ws, data)).join(', '))}"><small>What players can pick as preferred positions, separated by commas. ${esc(M.teamSport(T, M.clubOf(ws, data)))}’s are: ${esc((M.SPORT_POSITIONS[M.teamSport(T, M.clubOf(ws, data))] || []).join(', ') || 'none set')}. <button type="button" class="link-btn inline" data-act="positions-default">Use these</button></small></label>
    <label class="check"><input type="checkbox" name="jerseyLoan" ${T.jerseyLoan ? 'checked' : ''}><span>Jerseys are lent to players and must be handed back</span></label>
    <button class="btn primary block" type="submit">Save settings</button>
  </form>
  ${S.trial ? trialSettings() : liveSettings()}`;
}
function trialSettings() {
  return `<h3 class="form-sec">Going live</h3>
  <p class="muted small" style="margin-bottom:10px">You're in test mode: everything is saved on this phone only and nobody else can see it. When you're ready to share the app with players, go live. You'll choose a coach password and a team password, and connect GitHub so the app can publish.</p>
  <button class="btn primary block" data-act="go-live">Go live</button>
  <button class="btn block" data-act="preview-on" style="margin-top:10px">${icon('eye', 18)}See what players will see</button>

  ${backupSection()}

  <h3 class="form-sec">This phone</h3>
  <button class="btn danger block" data-act="start-over">Clear team data…</button>
  <p class="hint">Choose what to clear: the squad, training, matches, tasks, helpers, lineups, notices or the message log. Team settings and plays stay.</p>`;
}
function liveSettings() {
  return `<h3 class="form-sec">Players' access${multiTeam() ? `: ${esc(data.team.name)}` : ''}</h3>
  <p class="muted small" style="margin-bottom:10px">Players open the app with the team password or the invite link.${multiTeam() ? ' Each team has its own.' : ''} They see names, numbers, positions, the schedule, lineups and notices. Phone numbers, injuries, notes and attendance stay coach only.</p>
  <div class="btn-row"><button class="btn wa" data-act="invite">${icon('chat', 18)}Send invite link</button><button class="btn" data-act="copy-invite">${icon('copy', 18)}Copy link</button></div>
  <div class="secret"><span class="small muted">Team password</span> <code id="team-pass" data-shown="0">••••••••</code> <button class="link-btn inline" data-act="show-pass">Show</button></div>
  <button class="btn" data-act="preview-on" style="margin-top:4px">${icon('eye', 18)}See what players see</button>
  <details class="more"><summary>Change the team password</summary>
    <p class="muted small">Do this if the link or password has spread beyond the team. Everyone will need the new one; send a fresh invite link after it publishes.</p>
    <form data-form="team-pass" autocomplete="off">
      <label class="field-l"><span>New team password</span><input type="password" name="p1" required minlength="8" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="p2" required autocomplete="new-password"></label>
      <button class="btn block" type="submit">Change team password</button>
    </form></details>
  <details class="more"><summary>Change the coach password</summary>
    <form data-form="coach-pass" autocomplete="off">
      <label class="field-l"><span>Current coach password</span><input type="password" name="old" required autocomplete="current-password"></label>
      <label class="field-l"><span>New coach password</span><input type="password" name="p1" required minlength="10" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="p2" required autocomplete="new-password"></label>
      <button class="btn block" type="submit">Change coach password</button>
    </form></details>

  <h3 class="form-sec">Publishing</h3>
  ${githubSection()}

  ${backupSection()}

  <h3 class="form-sec">This phone</h3>
  <div class="btn-row"><button class="btn" data-act="sign-out">Sign out</button></div>
  <button class="btn danger block" style="margin-top:10px" data-act="start-over">Clear team data…</button>
  <p class="hint">Choose what to clear: the squad, training, matches, tasks, helpers, lineups, notices or the message log. Team settings, plays and passwords stay.</p>`;
}
function githubSection() {
  return `<p class="muted small" style="margin-bottom:10px">Changes are encrypted on this phone, saved to the repository's <code>data</code> branch and published to the site.</p>
  <form data-form="github" autocomplete="off">
    <div class="two">
      <label class="field-l"><span>GitHub username</span><input type="text" name="owner" value="${esc(gh.owner || '')}" autocapitalize="off" spellcheck="false"></label>
      <label class="field-l"><span>Repository</span><input type="text" name="repo" value="${esc(gh.repo || '')}" autocapitalize="off" spellcheck="false"></label>
    </div>
    <label class="field-l"><span>Access token</span><input type="password" name="token" value="${esc(gh.token || '')}" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"><small>A fine-grained token for this repository with Contents and Actions set to Read and write. It stays on this phone.</small></label>
    <label class="check"><input type="checkbox" name="autoPublish" ${gh.autoPublish ? 'checked' : ''}> Publish automatically after changes</label>
    <button class="btn block" type="submit">Save GitHub details</button>
  </form>
  <div class="btn-row" style="margin-top:10px"><button class="btn dark" data-act="publish">Publish now</button><button class="btn" data-act="load-latest">Load latest</button></div>`;
}
function resetBody() {
  const c = k => arr(data[k]).length;
  const counts = { squad: c('players'), training: c('sessions'), matches: c('matches'), tasks: c('tasks'), helpers: c('helpers'), lineups: c('lineups'), notices: c('notices'), messages: c('messages') };
  return `<form data-form="reset">
    <p class="muted small" style="margin-bottom:12px">Choose what to clear from ${esc(data.team.name)}. Team settings, plays, game systems, player lists and passwords are always kept. Export a backup first if you might want any of it back.</p>
    <div class="seg" role="group" aria-label="Quick picks"><button type="button" data-act="reset-preset" data-p="season" aria-pressed="false">New season</button><button type="button" data-act="reset-preset" data-p="all" aria-pressed="false">Everything</button><button type="button" data-act="reset-preset" data-p="none" aria-pressed="false">Nothing</button></div>
    <fieldset class="plain"><legend class="sr-only">What to clear</legend>
    ${Object.entries(M.RESET_PARTS).map(([k, l]) => `<label class="check"><input type="checkbox" name="part" value="${k}"><span>${esc(l)} <span class="muted small">(${counts[k]})</span></span></label>`).join('')}</fieldset>
    <p class="hint" style="margin-bottom:12px">Anything linked to what you clear is tidied up too: people come off tasks, tasks are unlinked from deleted sessions and matches, and lineups lose removed players. “New season” keeps the squad, helpers and lineups.</p>
    <button class="btn danger block" type="submit">Clear the ticked items</button>
  </form>`;
}
function passwordProblem(c1, c2, t1, t2) {
  return c1.length < 10 ? 'The coach password needs at least 10 characters.'
    : c1 !== c2 ? "The two coach passwords don't match."
    : t1.length < 8 ? 'The team password needs at least 8 characters.'
    : t1 !== t2 ? "The two team passwords don't match."
    : c1 === t1 ? 'Use a different password for the team than for the coach.' : '';
}
function openGoLive() {
  openSheet('Go live', `<p class="muted" style="margin-bottom:14px">Your squad, sessions and lineups come with you. Choose two passwords. Everything is encrypted with them before it goes online, so they can't be recovered — keep both in your phone's password manager.</p>
    <form data-form="go-live" autocomplete="off">
      <h3 class="form-sec">Coach password</h3>
      <p class="muted small" style="margin-bottom:10px">For you (and any assistant coach). Unlocks everything, including phone numbers and attendance. At least 10 characters; three or four random words works well.</p>
      <label class="field-l"><span>Coach password</span><input type="password" name="coach" required minlength="10" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="coach2" required autocomplete="new-password"></label>
      <h3 class="form-sec">Team password</h3>
      <p class="muted small" style="margin-bottom:10px">Shared with ${M.teamsOf(ws).length > 1 ? `${esc(M.teamName(ws))}’s` : ''} players. Shows the schedule, squad names, lineups and notices only. At least 8 characters.${M.teamsOf(ws).length > 1 ? ' Your other teams each get their own password, made for you; see it in Settings with that team on screen.' : ''}</p>
      <label class="field-l"><span>Team password</span><input type="password" name="team" required minlength="8" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="team2" required autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" name="remember" checked> Keep me signed in on this phone</label>
      <p class="note" id="go-live-msg" hidden></p>
      <button class="btn primary block" type="submit">Set passwords and continue</button>
    </form>`, 'go-live');
}
function openGithubSheet() { openSheet('Connect GitHub', githubSection() + `<p class="hint">The README in the repository walks through creating the token.</p>`, 'github'); }
// Publishing found the online copy had moved on. Fetch it, compare it record by record with this
// phone's copy (and the copy both started from, when this phone has it), and let the coach combine
// them or keep one whole. Nothing is published until they choose.
const conflictWhole = () => `<div class="list">
      <button class="pick" data-act="load-latest"><span class="grow"><span class="name" style="display:block">Use the other device’s version</span><span class="tagline">Replaces this phone’s unpublished changes.</span></span></button>
      <button class="pick" data-act="force-publish"><span class="grow"><span class="name" style="display:block">Publish this phone’s version</span><span class="tagline">Replaces the changes made on the other device.</span></span></button>
    </div>`;
async function openConflictSheet() {
  openSheet('Changed on another device', `<p class="muted" role="status">Fetching the online copy to compare…</p>`, 'conflict');
  let why = '';
  state.conflict = null;
  try {
    const g = ghClient(), head = await g.head(), file = head ? await g.readJson('coach.enc.json', head) : null;
    if (!file) throw fail('NONE', 'there is nothing online yet');
    const remote = normalizeWs((await openFile(file, S.coachLock, 'coach')).value);
    state.conflict = { head, remote, result: M.merge3(S.base, ws, remote) };
  } catch (e) {
    why = e.code === 'WRONG' ? 'The online copy was saved with a different coach password, so it can’t be compared here. Sign in again with the new password to see it.' : `Couldn’t fetch the online copy to compare (${e.message || 'no connection'}).`;
  }
  const body = state.sheet === 'conflict' && $('#sheet .panel-body'); if (!body) return;
  const intro = `<p style="margin-bottom:12px">${esc(S.pubMsg || 'The team was changed from another device since this phone last loaded it.')}</p>`;
  if (!state.conflict) { body.innerHTML = `${intro}<p class="note">${esc(why)}</p><h3 class="form-sec">Choose which version to keep</h3>${conflictWhole()}`; return; }
  const r = state.conflict.result, C = r.changes;
  const list = items => items.length ? `<ul class="diff-list">${items.slice(0, 30).map(c => `<li>${esc(c.label)}${c.gone ? ' <span class="muted">(deleted)</span>' : c.added ? ' <span class="muted">(new)</span>' : ''}</li>`).join('')}${items.length > 30 ? `<li class="muted">and ${items.length - 30} more</li>` : ''}</ul>` : '<p class="muted small">Nothing.</p>';
  const pick = (c, i) => `<fieldset class="diff-pick"><legend>${esc(c.label)}</legend>
      <label class="check"><input type="radio" name="k${i}" value="local" checked><span>This phone’s version${c.localGone ? ' (deleted here)' : ''}</span></label>
      <label class="check"><input type="radio" name="k${i}" value="remote"><span>The other device’s version${c.remoteGone ? ' (deleted there)' : ''}</span></label></fieldset>`;
  body.innerHTML = `${intro}
    <p class="muted small" style="margin-bottom:6px">${r.threeWay ? 'What changed on each side since this phone last loaded or published:' : 'This phone doesn’t have the copy both started from, so every difference is listed for you to choose.'}</p>
    ${r.threeWay ? `<h3 class="form-sec">Changed on this phone only (${C.local.length})</h3>${list(C.local)}<h3 class="form-sec">Changed on the other device only (${C.remote.length})</h3>${list(C.remote)}` : ''}
    <form data-form="merge">
      <h3 class="form-sec">${r.threeWay ? 'Changed on both' : 'Different'} (${C.both.length})</h3>
      ${C.both.length ? C.both.map(pick).join('') : '<p class="muted small">Nothing changed on both, so the two can be combined as they are.</p>'}
      <button class="btn primary block" type="submit" style="margin-top:10px">Combine and publish</button>
      <p class="hint">Takes the changes from both sides${C.both.length ? ', using your choice where both changed the same thing' : ''}.</p>
    </form>
    <h3 class="form-sec">Or keep one version whole</h3>${conflictWhole()}`;
}

/* ---------- sheet + toast ---------- */
let lastFocus = null;
// Sheets are modal: the page behind is inert (not reachable by keyboard or screen reader), Tab stays
// inside, Escape closes, and the focus goes back where it was.
const BEHIND = ['.top', '#view', '#tabs'];
function openSheet(title, body, key = null) {
  if ($('#sheet').hidden) lastFocus = document.activeElement;
  const sh = $('#sheet');
  sh.innerHTML = `<div class="backdrop" data-act="close-sheet"></div>
    <div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="panel-head"><h2 id="sheet-title">${esc(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Close">${icon('close', 22)}</button></div>
      <div class="panel-body">${body}</div></div>`;
  sh.hidden = false; document.body.classList.add('locked'); state.sheet = key;
  BEHIND.forEach(q => { const el = $(q); if (el) el.inert = true; });
  setTimeout(() => { const b = sh.querySelector('.panel-head .icon-btn'); if (b) b.focus(); }, 30);
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || $('#sheet').hidden) return;
  const f = [...$('#sheet .panel').querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
function requestCloseSheet() {
  if (state.sheet === 'play-editor' && state.ped && state.ped.dirty && !confirm('Close without saving the changes to this play?')) return;
  closeSheet();
}
function closeSheet() {
  const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('locked'); state.sheet = null;
  BEHIND.forEach(q => { const el = $(q); if (el) el.inert = false; });
  if (lastFocus && document.contains(lastFocus)) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}
let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3400); }
async function copyText(text, done = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch (e) { prompt('Copy this:', text); }
}

/* ---------- sample data ---------- */
function loadSample() {
  const people = [
    ['Mia Tuala', 'F', '4', ['Middle', 'Rover']], ['Jade Nguyen', 'F', '7', ['Rover']], ['Chloe Ritchie', 'F', '2', ['Wing']], ['Ava Kelleher', 'F', '11', ['Link']],
    ['Leilani Faleolo', 'F', '9', ['Middle']], ['Grace O’Brien', 'F', '14', ['Wing', 'Link']], ['Sienna Park', 'F', '3', ['Link']], ['Tayla Morgan', 'F', '16', ['Wing']],
    ['Josh Halloran', 'M', '1', ['Middle']], ['Liam Tupou', 'M', '5', ['Middle', 'Link']], ['Kai Brennan', 'M', '8', ['Rover', 'Link']], ['Noah Fitzgerald', 'M', '6', ['Wing']],
    ['Ethan Moana', 'M', '10', ['Middle']], ['Isaac Delaney', 'M', '12', ['Link']], ['Jayden Sio', 'M', '13', ['Wing', 'Link']], ['Tom Whitfield', 'M', '15', ['Rover', 'Middle']]
  ];
  data.players = people.map(([name, gender, number, positions]) => ({ id: uid(), name, gender, number, phone: '', positions, status: 'available', notes: '' }));
  data.players[11].status = 'injured';
  const focus = ['Defence line speed', 'Attack shape', 'Ball skills', 'Fitness', 'Set plays', 'Kick chase', 'Match simulation', 'Tagging technique', 'Attack shape', 'Defence line speed'];
  const t = new Date(), d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  while (d.getDay() !== 2) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - 28);
  data.sessions = [];
  for (let i = 0; i < 10; i++) {
    const iso = toISODate(d);
    const s = { id: uid(), date: iso, start: '18:00', end: '19:30', venue: 'Home ground, field 2', focus: focus[i], notes: '', cancelled: false, attendance: {} };
    if (iso < todayISO()) data.players.forEach((p, j) => { const r = (j * 7 + i * 13 + 3) % 10; s.attendance[p.id] = p.status === 'injured' ? 'apology' : r < 7 ? 'present' : r < 8 ? 'late' : r < 9 ? 'apology' : 'absent'; });
    data.sessions.push(s); d.setDate(d.getDate() + 7);
  }
  const byName = n => data.players.find(p => p.name.startsWith(n)).id;
  // RSVPs for the next session: most have replied, a few haven't.
  const nextS = data.sessions.find(s => s.date >= todayISO());
  if (nextS) data.players.forEach((p, j) => { const v = p.status === 'injured' ? 'no' : ['yes', 'yes', 'yes', 'maybe', 'yes', '', 'yes', 'no', 'yes', ''][j % 10]; if (v) M.setRsvp(nextS, p.id, v); });
  const pick = { LW: 'Chloe', LL: 'Ava', LR: 'Jade', LM: 'Mia', RM: 'Josh', RR: 'Kai', RL: 'Isaac', RW: 'Jayden' };
  data.lineups[0].slots.forEach(s => { s.playerId = byName(pick[s.id]); });
  if (!data.team.trainingVenue) data.team.trainingVenue = 'Home ground, field 2';
  // Helpers and volunteer tasks: the gear bag taking turns at training, a BBQ, and lifts to a trial game.
  const H = (name, relation, player) => ({ id: uid(), name, phone: '', relation, playerId: player ? byName(player) : '', notes: '' });
  data.helpers = [H('Rachel Tuala', 'Mia’s mum', 'Mia'), H('Dave Nguyen', 'Jade’s dad', 'Jade'), H('Sue Kelleher', 'Ava’s mum', 'Ava'), H('Pete Morgan', 'Tayla’s dad', 'Tayla'), H('Lou Brennan', 'Club volunteer', '')];
  const hp = n => 'h:' + data.helpers.find(h => h.name.startsWith(n)).id, pp = n => 'p:' + byName(n);
  const sat = k => { const x = new Date(t.getFullYear(), t.getMonth(), t.getDate()); while (x.getDay() !== 6) x.setDate(x.getDate() + 1); x.setDate(x.getDate() + 7 * k); return toISODate(x); };
  const turns = [pp('Mia'), pp('Kai'), pp('Jade'), pp('Josh')], series = uid(), today = todayISO();
  const T = (title, kind, date, extra) => ({ id: uid(), title, kind, date, start: '', end: '', place: '', notes: '', need: 1, sessionId: '', people: [], ...extra });
  let nextUp = 0;
  data.tasks = data.sessions.map((s, i) => T('Bring the gear bag', 'gear', s.date, { start: s.start, end: s.end, place: s.venue, sessionId: s.id, series,
    notes: 'Balls, cones, tags and bibs. The bag lives in the clubhouse.',
    people: [{ who: turns[i % 4], status: s.date < today ? 'done' : nextUp++ === 0 ? 'yes' : 'asked' }] }));
  data.tasks.push(
    T('Set up the field', 'setup', toISODate(new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 1) % 7 || 7))), { start: '07:30', place: 'Home ground', need: 2, people: [{ who: hp('Rachel'), status: 'done' }, { who: pp('Mia'), status: 'done' }] }),
    T('Run the BBQ', 'bbq', sat(1), { start: '08:00', end: '12:00', place: 'Clubhouse BBQ', need: 3, notes: 'Fundraiser for the Coffs trip. Sausages and bread are in the club fridge.', people: [{ who: hp('Rachel'), status: 'yes' }, { who: hp('Dave'), status: 'asked' }, { who: hp('Lou'), status: 'no' }] }),
    T('Lifts to the trial game', 'lift', sat(2), { start: '07:00', place: 'Meet at the clubhouse car park', need: 0, notes: 'Leaving at 7am sharp.', people: [
      { who: hp('Pete'), role: 'driver', seats: 4, status: 'yes' }, { who: hp('Sue'), role: 'driver', seats: 3, status: 'asked' },
      { who: pp('Liam'), role: 'rider', status: 'yes', car: hp('Pete') }, { who: pp('Ethan'), role: 'rider', status: 'yes', car: hp('Pete') },
      { who: pp('Isaac'), role: 'rider', status: 'yes', car: hp('Sue') }, { who: pp('Tom'), role: 'rider', status: 'yes', car: '' }, { who: pp('Grace'), role: 'rider', status: 'yes', car: '' }] }),
    T('Bring the first aid kit', 'firstaid', sat(2), { start: '08:00', place: 'Trial game', people: [{ who: hp('Sue'), status: 'yes' }] }),
    T('Wash the playing tops', 'kit', sat(2), { place: 'Take them home after the game', notes: 'Cold wash, hang to dry. Back by Tuesday training.' })
  );
  // Matches: a trial game played (with a result and its lineup), one coming up, and the pool games.
  const trialLu = { ...clone(data.lineups[0]), id: uid(), name: 'vs Northern Beaches (trial)' };
  data.lineups.push(trialLu);
  const past = sat(-1), Mt = (opponent, date, start, extra) => ({ id: uid(), date, start, opponent, venue: 'Home ground', field: '', round: '', notes: '', coachNotes: '', status: 'scheduled', rsvp: {}, result: {}, lineupId: '', ...extra });
  const ev = data.team.eventStart || sat(20), ev2 = M.addDays(ev, 1);
  data.matches = [
    Mt('Northern Beaches', past, '09:00', { status: 'played', result: { us: 6, them: 4, notes: 'Defence line held well. Kick chase too slow.' }, lineupId: trialLu.id, round: 'Trial game' }),
    Mt('Hills Hornets', sat(0), '09:30', { venue: 'Hills Sports Park', field: '4', round: 'Trial game', notes: 'Meet 45 minutes before. White tops.', rsvp: Object.fromEntries(data.players.slice(0, 11).map((pl, j) => [pl.id, { v: j === 3 ? 'no' : j === 7 ? 'maybe' : 'yes', via: 'coach' }])) }),
    Mt('Coffs Coast', ev, '09:00', { venue: data.team.venue, field: '3', round: 'Pool A, round 1', tournament: true }),
    Mt('Sydney Sharks', ev, '12:40', { venue: data.team.venue, field: '5', round: 'Pool A, round 2', tournament: true }),
    Mt('Central Coast Waves', ev2, '10:20', { venue: data.team.venue, field: '2', round: 'Pool A, round 3', tournament: true })
  ];
  const liftTask = data.tasks.find(x => x.kind === 'lift');
  if (liftTask) { liftTask.title = 'Lifts to the Hills game'; liftTask.date = sat(0); liftTask.matchId = data.matches[1].id; }
  data.tasks.filter(x => x.kind === 'firstaid').forEach(x => { x.date = sat(0); x.matchId = data.matches[1].id; x.place = 'Hills Sports Park'; });
  // The tournament's matches go in its competition entry for this season.
  const cup = M.findComp(ws, data.team.eventCompId), sid = (M.activeSeason(data) || {}).id, en = cup && cup.entries.find(e => e.teamId === data.id && e.seasonId === sid);
  if (en) data.matches.filter(m => m.tournament).forEach(m => { m.seasonId = sid; M.linkMatch(ws, data, m, en.id); });
  save(); state.msgDraft = null; render(); toast('Sample squad loaded');
}

/* =========================================================
   EVENTS
   ========================================================= */
const coachOnly = fn => (...a) => { if (isCoach()) return fn(...a); };
const actions = {
  'tab': el => { if (el.dataset.tab === 'club') state.clubId = null; goTo(el.dataset.tab); },
  'nav': el => { const g = NAV.find(x => x.id === el.dataset.g); if (!g) return; const last = state.lastView[g.id]; goTo(last && viewsOf(g).some(v => v[0] === last) && navOf(state.tab) !== g ? last : viewsOf(g)[0][0]); },
  'close-sheet': () => requestCloseSheet(),
  'settings': () => openSheet('Settings', settingsBody(), 'settings'),
  'layout': el => { store.set('tm-layout', el.dataset.v); applyLayout(); document.querySelectorAll('[data-act="layout"]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  'layout-width': el => { store.set('tm-width', el.dataset.v); applyLayout(); document.querySelectorAll('[data-act="layout-width"]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  'lock-mode': el => { state.lockMode = el.dataset.mode; state.lockMsg = ''; renderLock(); },
  'refresh': async () => {
    try { await openPlayer(S.teamLock, false, S.teamFile); closeSheet(); render(); toast(S.fromCache ? 'No connection. Showing the copy saved on this phone.' : 'Up to date'); }
    catch (e) { if (e.code === 'WRONG') { toast('The team password has changed. Ask your coach for the new one.'); setTimeout(signOutNow, 1800); } else toast(e.message || "Couldn't check for updates"); }
  },
  'sign-out': () => {
    if (S.role === 'coach' && S.dirty && !confirm("Some changes haven't been published yet. They stay saved (encrypted) on this phone. Sign out anyway?")) return;
    signOutNow();
  },

  'sample': coachOnly(() => loadSample()),
  'add-player': coachOnly(() => openSheet('Add player', playerForm(null), 'player')),
  'bulk-add': coachOnly(() => openSheet('Paste a list', bulkForm())),
  'edit-player': coachOnly(el => { const p = playerById(el.dataset.id); if (p) openSheet(p.name, playerForm(p), 'player'); }),
  'delete-player': coachOnly(el => {
    const p = playerById(el.dataset.id), s = V.viewSeason; if (!p) return;
    const earlier = s && M.memberSeasons(data, p.id).some(x => x.id !== s.id);
    if (!confirm(earlier ? `Take ${p.name} out of the ${s.name} squad? They stay in the seasons they played.` : `Remove ${p.name} from the squad?`)) return;
    if (earlier) {
      // Only this season: its lineups and tasks; earlier seasons keep their record of them.
      M.removeMember(data, s.id, p.id);
      data.lineups.filter(l => !l.seasonId || l.seasonId === s.id).forEach(l => l.slots.forEach(x => { if (x.playerId === p.id) x.playerId = null; }));
      data.tasks.filter(t => t.seasonId === s.id).forEach(t => { t.people = arr(t.people).filter(x => x.who !== 'p:' + p.id); });
      save(); closeSheet(); render(); toast(`${p.name} taken out of ${s.name}`); return;
    }
    if (s) M.removeMember(data, s.id, p.id);
    data.players = data.players.filter(x => x.id !== p.id);
    data.lineups.forEach(l => l.slots.forEach(s => { if (s.playerId === p.id) s.playerId = null; }));
    forgetPerson('p:' + p.id);
    data.helpers.forEach(h => { if (h.playerId === p.id) h.playerId = ''; });
    save(); closeSheet(); render(); toast(`${p.name} removed`);
  }),
  'squad-filter': el => { state.squadFilter = el.dataset.f; render(); },
  'wa-player': coachOnly(el => { const p = playerById(el.dataset.id); if (!p || !p.phone) return; sendWa(`Hi ${firstName(p)}, `, { to: p.name, phone: p.phone, ref: 'player:' + p.id }); }),

  'train-view': el => goTo({ agenda: 'agenda', schedule: 'training', matches: 'matches', attendance: 'attendance' }[el.dataset.v] || 'agenda', false),
  'report-range': coachOnly(el => { state.reportRange = el.dataset.v; render(); }),
  'report-share': coachOnly(() => copyText(reportText(), 'Summary copied')),
  'match-new': coachOnly(() => openSheet('Add match', matchForm(null), 'match-new')),
  'match-day-new': coachOnly(() => openSheet('Tournament day', matchDayForm(), 'match-day')),
  'match-open': coachOnly(el => openMatch(el.dataset.id)),
  'match-edit': coachOnly(el => { const m = matchById(el.dataset.id); if (m) openSheet('Edit match', matchForm(m), 'match-edit'); }),
  'match-del': coachOnly(el => {
    const m = matchById(el.dataset.id); if (!m) return;
    if (M.linkedTasks(data, 'match', m.id).length) { askLinked({ kind: 'match', id: m.id, op: 'delete' }); return; }
    if (!confirm(`Delete the match against ${m.opponent || 'TBC'} on ${fmtLong(m.date)}?${M.matchOutcome(m) ? ' Its result goes too.' : ''}`)) return;
    data.matches = data.matches.filter(x => x.id !== m.id); save(); closeSheet(); render(); toast('Match deleted');
  }),
  'match-task': coachOnly(el => { const m = matchById(el.dataset.id); if (!m) return; openSheet('New task', taskForm({ title: '', kind: 'other', date: m.date, start: '', end: '', place: matchWhere(m), notes: '', need: 1, matchId: m.id }, { copy: true })); }),
  'match-share': coachOnly(el => { const m = matchById(el.dataset.id); if (m) sendWa(matchText(m), { ref: 'match:' + m.id }); }),
  'day-share': coachOnly(el => sendWa(dayText(el.dataset.date), { ref: 'day:' + el.dataset.date })),
  't-share': coachOnly(() => sendWa(drawText(), { ref: 'draw' })),
  'results-share': coachOnly(() => sendWa(resultsText(), { ref: 'results' })),
  'match-lineup-open': coachOnly(el => { const m = matchById(el.dataset.id), lu = matchLineup(m); if (!lu) return; state.lineupId = lu.id; state.tab = 'field'; state.system = null; history.replaceState(null, '', '#field'); closeSheet(); render(); window.scrollTo(0, 0); }),
  'match-lineup-unlink': coachOnly(el => {
    const m = matchById(el.dataset.id), lu = matchLineup(m); if (!m || !lu) return;
    const del = confirm(`Delete “${lu.name}” as well? Cancel keeps it as a saved lineup.`);
    m.lineupId = ''; if (del && data.lineups.length > 1) data.lineups = data.lineups.filter(l => l.id !== lu.id);
    save(); refreshMatch(m.id);
  }),
  'rsvp-open': coachOnly(el => { const rec = rsvpTarget(el.dataset.k, el.dataset.id); if (!rec) return; if (!V.players.length) { toast('Add players to your squad first'); return; } openSheet('Availability', rsvpBody(el.dataset.k, rec.id), 'rsvp'); }),
  'rsvp': coachOnly(el => {
    const rec = rsvpTarget(el.dataset.k, el.dataset.id); if (!rec) return;
    const v = M.rsvpOf(rec, el.dataset.pid) === el.dataset.v ? '' : el.dataset.v;
    M.setRsvp(rec, el.dataset.pid, v); save();
    const row = el.closest('.roll-row'); if (row) row.querySelectorAll('[data-act="rsvp"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    const sum = $('#rsvp-sum'); if (sum) sum.innerHTML = rsvpPills(rec);
  }),
  'rsvp-ask': coachOnly(el => { closeSheet(); state.msgEvent = { kind: el.dataset.k, id: el.dataset.id }; state.msgRef = `rsvp:${el.dataset.k}:${el.dataset.id}`; openTemplate('availability'); }),
  'avail-ask': coachOnly(() => { state.msgEvent = null; state.msgRef = 'rsvp:all'; openTemplate('availability'); }),
  'reply': el => {
    const rec = rsvpTarget(el.dataset.k, el.dataset.id); if (!rec) return;
    const c = V.team.tasksContact || {};
    openWhatsApp(replyText(el.dataset.k, rec, el.dataset.v), c.phone || '');
    toast('WhatsApp is open with your reply. Send it there; the coach records it.');
  },
  'attendance': coachOnly(() => goTo('attendance')),
  'toggle-past': () => { state.showPast = !state.showPast; render(); },
  'add-session': coachOnly(() => openSheet('Add training', sessionForm(null))),
  'edit-session': coachOnly(el => { const s = sessionById(el.dataset.id); if (s) openSheet(fmtLong(s.date), sessionForm(s)); }),
  'delete-session': coachOnly(el => {
    const s = sessionById(el.dataset.id); if (!s) return;
    if (M.linkedTasks(data, 'session', s.id).length) { askLinked({ kind: 'session', id: s.id, op: 'delete' }); return; }
    if (!confirm(`Delete training on ${fmtLong(s.date)}${rollTaken(s) ? ' and its roll call' : ''}?`)) return;
    data.sessions = data.sessions.filter(x => x.id !== s.id); save(); closeSheet(); render(); toast('Session deleted');
  }),
  'cancel-session': coachOnly(el => {
    const s = sessionById(el.dataset.id); if (!s) return;
    if (!s.cancelled && M.linkedTasks(data, 'session', s.id).some(t => !t.cancelled)) { askLinked({ kind: 'session', id: s.id, op: 'cancel' }); return; }
    s.cancelled = !s.cancelled;
    const back = s.cancelled ? 0 : M.reinstateTasks(data, 'session', s.id);
    save(); closeSheet(); render();
    if (back) toast(`Session back on, and ${back} task${back === 1 ? '' : 's'} cancelled with it`);
    if (s.cancelled) offerCancelMessage(s);
  }),
  'link-choice': coachOnly(el => applyLinkChoice(el.dataset.c)),
  'remind': coachOnly(el => { state.tab = 'messages'; state.msgTpl = 'reminder'; state.msgSession = el.dataset.id; state.msgDraft = buildTemplate('reminder'); history.replaceState(null, '', '#messages'); render(); window.scrollTo(0, 0); }),
  'roll': coachOnly(el => { const s = sessionById(el.dataset.id); if (!s) return; if (!V.players.length) { toast('Add players to your squad first'); return; } openSheet('Roll call', rollBody(s.id), 'roll'); }),
  'mark': coachOnly(el => {
    const s = sessionById(el.dataset.sid); if (!s) return;
    const pid = el.dataset.pid, v = el.dataset.s;
    if (s.attendance[pid] === v) delete s.attendance[pid]; else s.attendance[pid] = v;
    save();
    const row = document.querySelector(`[data-row="${pid}"]`); if (row) row.dataset.state = s.attendance[pid] || '';
    const sum = $('#roll-sum'); if (sum) sum.innerHTML = rollSummary(s);
  }),
  'mark-all': coachOnly(el => {
    const s = sessionById(el.dataset.sid); if (!s) return;
    V.players.forEach(p => { if (!s.attendance[p.id] && p.status === 'available') s.attendance[p.id] = 'present'; });
    save(); $('#sheet .panel-body').innerHTML = rollBody(s.id);
  }),
  'roll-done': coachOnly(el => {
    const s = sessionById(el.dataset.sid); if (!s) return;
    V.players.forEach(p => { if (!s.attendance[p.id]) s.attendance[p.id] = 'absent'; });
    save(); closeSheet(); render(); toast('Roll call saved');
  }),

  'lineup-menu': coachOnly(() => lineupMenu()),
  'layer': el => { const k = el.dataset.k; state.layers[k] = !state.layers[k]; store.set('tm-field-layers', JSON.stringify(state.layers)); render(); },
  'system': el => {
    const id = el.dataset.id; state.system = state.system === id ? null : id; state.sysFlip = false;
    store.set('tm-field-system', state.system || ''); render();
  },
  'sys-side': el => { state.sysFlip = el.dataset.flip === '1'; render(); },
  'sys-play': el => { state.tab = 'plays'; state.playId = el.dataset.id; state.playPhase = 0; history.replaceState(null, '', '#plays'); render(); window.scrollTo(0, 0); },
  'sys-edit': coachOnly(el => openSystemEditor(el.dataset.id)),
  'sys-reset': coachOnly(el => {
    const b = systemBase(el.dataset.id); if (!b) return;
    if (!confirm(`Put “${b.name}” back to the playbook version? Your changes to its words and positions will go.`)) return;
    delete data.systems[b.id]; save(); render(); toast('Back to the playbook version');
  }),
  'task-view': el => goTo({ tasks: 'tasks', helpers: 'helpers', people: 'tally' }[el.dataset.v] || 'tasks', false),
  'task-filter': el => { state.taskFilter = el.dataset.f; render(); },
  'task-waiting': () => { state.taskFilter = 'waiting'; goTo('tasks'); },
  'task-new': coachOnly(() => openSheet('New task', taskForm(null))),
  'task-checklist': coachOnly(() => openSheet('Add a checklist', checklistBody())),
  'task-open': coachOnly(el => openTask(el.dataset.id)),
  'task-edit': coachOnly(el => { const t = taskById(el.dataset.id); if (t) openSheet('Edit task', taskForm(t)); }),
  'task-dup': coachOnly(el => { const t = taskById(el.dataset.id); if (!t) return; const { id, people, series, ...rest } = t; openSheet('Copy of task', taskForm(rest, { copy: true })); }),
  'task-del': coachOnly(el => {
    const t = taskById(el.dataset.id); if (!t) return;
    const later = t.series ? data.tasks.filter(x => x.series === t.series && x.id !== t.id && x.date >= t.date) : [];
    if (!confirm(`Delete “${t.title}” on ${fmtDay(t.date)}?`)) return;
    const also = later.length && confirm(`It's part of a rotation. Also delete the ${later.length} later one${later.length === 1 ? '' : 's'}?`);
    const gone = new Set([t.id, ...(also ? later.map(x => x.id) : [])]);
    data.tasks = data.tasks.filter(x => !gone.has(x.id));
    save(); closeSheet(); render(); toast(gone.size > 1 ? `${gone.size} tasks deleted` : 'Task deleted');
  }),
  'task-share': coachOnly(el => { const t = taskById(el.dataset.id); if (!t) return; sendWa(taskAskText(t), { ref: 'task:' + t.id }); }),
  'task-ask': coachOnly(() => { state.tab = 'messages'; state.msgTpl = 'help'; state.msgDraft = buildTemplate('help'); history.replaceState(null, '', '#messages'); render(); window.scrollTo(0, 0); }),
  'task-help': el => {
    const t = taskById(el.dataset.id); if (!t) return;
    const c = V.team.tasksContact || {}, hi = c.name ? `Hi ${String(c.name).trim().split(/\s+/)[0]}, ` : 'Hi, ';
    openWhatsApp(`${hi}I can ${t.kind === 'lift' ? 'drive for' : 'help with'} ${t.title} on ${fmtDay(t.date)}${t.start ? ` at ${fmtTime(t.start)}` : ''}. `, c.phone || '');
  },
  'tp-pick': coachOnly(el => { state.taskPick = el.dataset.m || null; refreshTask(el.dataset.id); }),
  'tp-add': coachOnly(el => {
    const t = data.tasks.find(x => x.id === el.dataset.id), who = el.dataset.who, m = el.dataset.m; if (!t || taskPerson(t, who)) return;
    t.people.push(m === 'driver' ? { who, role: 'driver', seats: 4, status: 'asked' } : m === 'rider' ? { who, role: 'rider', status: 'yes', car: '' } : { who, status: 'asked' });
    save(); refreshTask(t.id);
  }),
  'tp-status': coachOnly(el => { const t = data.tasks.find(x => x.id === el.dataset.id); if (!t || !M.setReply(t, el.dataset.who, el.dataset.s)) return; save(); refreshTask(t.id); }),
  'tp-remove': coachOnly(el => {
    const t = data.tasks.find(x => x.id === el.dataset.id); if (!t) return;
    t.people = t.people.filter(p => p.who !== el.dataset.who);
    t.people.forEach(p => { if (p.car === el.dataset.who) p.car = ''; });
    save(); refreshTask(t.id);
  }),
  'tp-seats': coachOnly(el => {
    const t = data.tasks.find(x => x.id === el.dataset.id), p = taskPerson(t, el.dataset.who); if (!p) return;
    const seats = clamp((Number(p.seats) || 0) + Number(el.dataset.d), 0, 12), inCar = t.people.filter(r => r.car === p.who).length;
    if (seats < inCar && !confirm(`${inCar} ${inCar === 1 ? 'person is' : 'people are'} in this car. Cut it to ${seats} seat${seats === 1 ? '' : 's'} anyway? The car will show as over capacity until someone moves.`)) return;
    p.seats = seats; save(); refreshTask(t.id);
  }),
  'tp-wa': coachOnly(el => { const t = taskById(el.dataset.id), per = personOf(el.dataset.who); if (!t || !per || !per.phone) return; sendWa(taskPersonText(t, el.dataset.who), { to: per.name, phone: per.phone, ref: `task:${t.id}:${el.dataset.who}` }); refreshTask(t.id); }),
  'lift-fill': coachOnly(el => {
    const t = data.tasks.find(x => x.id === el.dataset.id); if (!t) return;
    const moved = M.fillSeats(t);
    save(); refreshTask(t.id); toast(moved ? `${moved} ${moved === 1 ? 'person' : 'people'} given a seat` : 'No free seats in confirmed cars');
  }),
  'task-cancel': coachOnly(el => {
    const t = data.tasks.find(x => x.id === el.dataset.id); if (!t) return;
    if (!t.cancelled && !confirm(`Mark “${t.title}” on ${fmtDay(t.date)} as cancelled? Everyone stays on it in case it’s back on.`)) return;
    t.cancelled = !t.cancelled; delete t.cancelledWith; save(); refreshTask(t.id); toast(t.cancelled ? 'Task cancelled' : 'Task back on');
  }),
  'helper-new': coachOnly(() => openSheet('Add helper', helperForm(null))),
  'helper-edit': coachOnly(el => { const h = data.helpers.find(x => x.id === el.dataset.id); if (h) openSheet(h.name, helperForm(h)); }),
  'helper-del': coachOnly(el => {
    const h = data.helpers.find(x => x.id === el.dataset.id); if (!h || !confirm(`Remove ${h.name}? They'll come off any tasks too.`)) return;
    data.helpers = data.helpers.filter(x => x.id !== h.id); forgetPerson('h:' + h.id);
    save(); closeSheet(); render(); toast(`${h.name} removed`);
  }),
  'wa-helper': coachOnly(el => { const h = data.helpers.find(x => x.id === el.dataset.id); if (!h || !h.phone) return; sendWa(`Hi ${firstName(h)}, `, { to: h.name, phone: h.phone, ref: 'helper:' + h.id }); }),
  'sys-share': coachOnly(() => { const sys = curSystem(); if (!sys) return; sendWa(systemShareText(sys, curLineup()), { ref: 'system:' + sys.id }); }),
  'play-open': el => { state.playId = el.dataset.id; state.playPhase = 0; render(); window.scrollTo(0, 0); },
  'play-phase': el => { const p = playById(state.playId); if (!p) return; animStop(); animShowPhase(p, Number(el.dataset.i)); anim.planFor = null; },
  'anim-play': () => animStart(),
  'anim-slow': el => { anim.slow = !anim.slow; el.classList.toggle('on', anim.slow); el.setAttribute('aria-pressed', String(anim.slow)); },
  'play-back': () => { state.playId = null; render(); window.scrollTo(0, 0); },
  'play-side': el => { state.playSide = el.dataset.side; render(); },
  'play-new': coachOnly(() => openPlayEditor(null)),
  'play-edit': coachOnly(el => { const p = playById(el.dataset.id); if (p) openPlayEditor(p); }),
  'play-dup': coachOnly(el => {
    const p = playById(el.dataset.id); if (!p) return;
    const copy = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: `${p.name} (copy)`, builtin: false }; delete copy.lib;
    data.plays.splice(data.plays.indexOf(p) + 1, 0, copy); state.playId = copy.id; save(); render(); toast('Play duplicated');
  }),
  'play-del': coachOnly(el => {
    const p = playById(el.dataset.id); if (!p || !confirm(`Delete “${p.name}”?${p.builtin ? ' You can restore the starter plays later.' : ''}`)) return;
    data.plays = data.plays.filter(x => x.id !== p.id); state.playId = null; save(); render(); toast('Play deleted');
  }),
  'play-share': coachOnly(el => { const p = playById(el.dataset.id); if (!p) return; sendWa(playShareText(p, state.playSide), { ref: 'play:' + p.id }); }),
  'psets': coachOnly(() => openPlayerLists()),
  'pset-new': coachOnly(() => openPlayerListForm(null)),
  'pset-edit': coachOnly(el => openPlayerListForm(data.playerSets.find(x => x.id === el.dataset.id))),
  'pset-copy': coachOnly(el => { const x = getSet(el.dataset.id); openPlayerListForm({ name: `${x.name} (my version)`, labels: x.labels }); }),
  'pset-del': coachOnly(el => {
    const id = el.dataset.id, n = data.plays.filter(p => p.set === id).length;
    if (n) { toast(`${n} play${n === 1 ? ' uses' : 's use'} this list. Switch ${n === 1 ? 'it' : 'them'} to another list first.`); return; }
    if (!confirm('Delete this player list?')) return;
    data.playerSets = data.playerSets.filter(x => x.id !== id); save(); openPlayerLists(); toast('List deleted');
  }),
  'plays-restore': coachOnly(() => {
    const starters = starterPlays(), have = new Set(data.plays.map(p => p.id));
    const add = starters.filter(p => !have.has(p.id));
    data.plays = [...starters.filter(p => add.includes(p)), ...data.plays].sort((a, b) => (STARTER_IDS.indexOf(a.id) + 1 || 99) - (STARTER_IDS.indexOf(b.id) + 1 || 99));
    save(); render(); toast(`${add.length} starter play${add.length === 1 ? '' : 's'} restored`);
  }),
  'ped-tool': coachOnly(el => { const E = state.ped; E.tool = el.dataset.t; E.drawing = null; if (E.tool !== 'select') pedSelect(null); refreshPlayEditor(); }),
  'ped-tab': coachOnly(el => {
    const E = state.ped; E.tab = el.dataset.tab;
    $('#ped-words').hidden = E.tab !== 'words'; $('#ped-diagram').hidden = E.tab !== 'diagram';
    document.querySelectorAll('[data-act="ped-tab"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === E.tab)));
  }),
  'ped-undo': coachOnly(() => pedUndo()),
  'ped-phase': coachOnly(el => pedSetPhase(Number(el.dataset.i))),
  'ped-phase-add': coachOnly(() => { const E = state.ped; if (E.placing) return; E.wasWhole = E.whole; E.placing = true; pedSelect(null); refreshPlayEditor(); }),
  'ped-phase-cancel': coachOnly(() => { const E = state.ped; E.placing = false; E.whole = E.wasWhole || false; refreshPlayEditor(); }),
  'ped-phase-del': coachOnly(() => {
    const E = state.ped; if (!E.phase || !confirm(`Delete phase ${E.phase + 1}?`)) return;
    pedSnap(); E.draft.phases.splice(E.phase - 1, 1); pedSetPhase(E.phase - 1);
  }),
  'ped-whole': coachOnly(() => { state.ped.whole = !state.ped.whole; refreshPlayEditor(); }),
  'ped-del': coachOnly(() => pedDelete()),
  'ped-opt': coachOnly(el => { const E = state.ped; E[el.dataset.f] = !E[el.dataset.f]; refreshPlayEditor(); }),
  'ped-mv-type': coachOnly(el => {
    const E = state.ped, m = E.sel && pedCur(E).moves[E.sel.i]; if (!m) return;
    pedSnap(); m.t = el.dataset.t; if (m.t === 'shift') delete m.key; refreshPlayEditor();
  }),
  'ped-mv': coachOnly(el => {
    const E = state.ped, m = E.sel && pedCur(E).moves[E.sel.i], f = el.dataset.f; if (!m) return;
    pedSnap();
    if (f === 'unbend') { m.pts.splice(E.selH, 1); E.selH = null; }
    else { if (m[f]) delete m[f]; else m[f] = true; E[f] = !!m[f]; }
    refreshPlayEditor();
  }),
  'ped-pl': coachOnly(el => {
    const E = state.ped, d = pedCur(E), id = E.sel && E.sel.id, f = el.dataset.f; if (!id) return;
    pedSnap();
    if (f === 'tag') { if (d.tags[id] === 'F') delete d.tags[id]; else d.tags[id] = 'F'; }
    else { const set = new Set(d[f]); set.has(id) ? set.delete(id) : set.add(id); d[f] = [...set]; }
    refreshPlayEditor();
  }),
  'ped-who': coachOnly(el => {
    const E = state.ped, slot = E.sel && E.sel.k === 'pl' && E.sel.id; if (!slot) return;
    const before = whoOf(E.draft, slot); pedSetWho(slot, el.dataset.code); refreshPlayEditor();
    if (before !== el.dataset.code) toast(`${el.dataset.code} plays here now`);
  }),
  'ped-lb-dot': coachOnly(() => {
    const E = state.ped, l = E.sel && pedCur(E).labels[E.sel.i]; if (!l) return;
    pedSnap(); if (l.dot) delete l.dot; else l.dot = true; refreshPlayEditor();
  }),
  'ped-frame': coachOnly(el => {
    const E = state.ped, d = pedCur(E), f = el.dataset.f; pedSnap();
    if (f === 'fit') d.view = fitView(pedView(E));
    if (f === 'width') d.view = { ...pedFrame(E), x0: 0, x1: 50 };
    if (f === 'field') d.view = { x0: 0, x1: 50, y0: 0, y1: 80 };
    if (f === 'auto') delete d.view;
    refreshPlayEditor();
  }),
  'move-mode': coachOnly(el => { state.moveMode = el.dataset.on === '1'; render(); }),
  'shape': coachOnly(el => { const sh = SHAPES[el.dataset.shape]; curLineup().slots.forEach(s => { if (sh[s.id]) { s.x = sh[s.id][0]; s.y = sh[s.id][1]; } }); save(); render(); }),
  'assign': coachOnly(el => {
    const lu = curLineup(), sl = lu.slots.find(s => s.id === el.dataset.slot), pid = el.dataset.pid || null;
    if (pid) { const other = lu.slots.find(s => s.playerId === pid && s.id !== sl.id); if (other) other.playerId = sl.playerId; }
    sl.playerId = pid; save(); closeSheet(); render();
    const max = M.maxMalesOf(data.team, M.clubOf(ws, data)), males = lu.slots.filter(s => (playerById(s.playerId) || {}).gender === 'M').length;
    if (isMixed(data.team) && males > max) toast(`Heads up: ${males} males on field (max ${max})`);
  }),
  'lineup-new': coachOnly(() => { const name = prompt('Name for the new lineup', `Lineup ${data.lineups.length + 1}`); if (!name) return; const l = makeLineup(name.trim()); data.lineups.push(l); state.lineupId = l.id; save(); closeSheet(); render(); }),
  'lineup-dup': coachOnly(() => { const lu = curLineup(); const l = JSON.parse(JSON.stringify(lu)); l.id = uid(); l.name = lu.name + ' (copy)'; data.lineups.push(l); state.lineupId = l.id; save(); closeSheet(); render(); }),
  'lineup-rename': coachOnly(() => { const lu = curLineup(); const name = prompt('Rename lineup', lu.name); if (!name) return; lu.name = name.trim(); save(); closeSheet(); render(); }),
  'lineup-clear': coachOnly(() => { if (!confirm('Take everyone off the field in this lineup?')) return; curLineup().slots.forEach(s => { s.playerId = null; }); save(); closeSheet(); render(); }),
  'lineup-del': coachOnly(() => { const lu = curLineup(); if (!confirm(`Delete “${lu.name}”?`)) return; data.lineups = data.lineups.filter(l => l.id !== lu.id); state.lineupId = data.lineups[0].id; save(); closeSheet(); render(); }),
  'lineup-share': coachOnly(() => { state.tab = 'messages'; state.msgTpl = 'lineup'; state.msgDraft = buildTemplate('lineup'); history.replaceState(null, '', '#messages'); render(); window.scrollTo(0, 0); }),

  'tpl': coachOnly(el => { state.msgTpl = el.dataset.t; state.msgRef = ''; if (el.dataset.t === 'availability') state.msgEvent = null; state.msgDraft = buildTemplate(state.msgTpl); render(); }),
  'wa-send': coachOnly(() => {
    const t = state.msgDraft.trim(); if (!t) { toast('Write a message first'); return; }
    if (state.postNotice && state.msgTpl !== 'invite') postNotice(t);
    sendWa(t, { ref: state.msgRef || '' }); render();
  }),
  'share-send': coachOnly(async () => {
    const t = state.msgDraft.trim(); if (!t) { toast('Write a message first'); return; }
    try {
      await navigator.share({ text: t });
      if (state.postNotice && state.msgTpl !== 'invite') postNotice(t);
      const m = logMessage(t, 'Shared', state.msgRef || ''); state.askSent = m.id; render(); renderAsk();
    } catch (e) { /* cancelled */ }
  }),
  'msg-sent': coachOnly(el => { const m = data.messages.find(x => x.id === el.dataset.id); M.markSent(m, true); state.askSent = null; save(); renderAsk(); if (state.tab === 'messages' || state.sheet && state.sheet.startsWith('task:')) render(); toast('Logged as sent'); }),
  'msg-not-sent': coachOnly(() => { state.askSent = null; renderAsk(); toast('Logged as not sent. Mark it sent later from the message log.'); }),
  'msg-mark': coachOnly(el => { const m = data.messages.find(x => x.id === el.dataset.id); if (!m) return; M.markSent(m, M.msgStatus(m) !== 'sent'); save(); render(); }),
  'copy-msg': coachOnly(() => { if (state.msgDraft.trim()) copyText(state.msgDraft); }),
  'reuse': coachOnly(el => { const m = data.messages.find(x => x.id === el.dataset.id); if (!m) return; state.msgTpl = 'blank'; state.msgDraft = m.text; render(); window.scrollTo(0, 0); }),
  'del-msg': coachOnly(el => { data.messages = data.messages.filter(x => x.id !== el.dataset.id); save(); render(); toast('Log entry removed'); }),
  'add-notice': coachOnly(() => openSheet('Post a notice', `<form data-form="notice"><textarea name="text" rows="5" required placeholder="e.g. Uniform fitting this Saturday 10am at the clubhouse."></textarea><button class="btn primary block" style="margin-top:12px" type="submit">Post to noticeboard</button><p class="hint">Players see it on their home screen once it publishes.</p></form>`)),
  'del-notice': coachOnly(el => { data.notices = data.notices.filter(n => n.id !== el.dataset.id); save(); render(); toast('Notice taken down'); }),

  'invite': coachOnly(() => { closeSheet(); state.tab = 'messages'; state.msgTpl = 'invite'; state.msgDraft = buildTemplate('invite'); history.replaceState(null, '', '#messages'); render(); window.scrollTo(0, 0); }),
  'copy-invite': coachOnly(() => copyText(inviteLink(), 'Invite link copied')),
  'show-pass': coachOnly(el => { const c = $('#team-pass'); const shown = c.dataset.shown === '1'; c.textContent = shown ? '••••••••' : data.teamPass; c.dataset.shown = shown ? '0' : '1'; el.textContent = shown ? 'Show' : 'Hide'; }),
  'preview-on': coachOnly(() => { state.preview = true; state.moveMode = false; closeSheet(); render(); window.scrollTo(0, 0); }),
  'preview-off': () => { state.preview = false; render(); },

  'go-live': coachOnly(() => openGoLive()),
  'github': () => S.trial ? openGoLive() : openGithubSheet(),
  'publish': () => publish(false),
  'force-publish': () => { closeSheet(); publish(false, true); },
  'conflict': () => openConflictSheet(),
  'load-latest': () => {
    if (S.dirty && !confirm("This replaces the unpublished changes on this phone with the latest published version. Continue?")) return;
    loadLatest();
  },
  'export': coachOnly(async () => {
    download(S.trial ? ws : await seal(ws, S.coachLock, 'coach'), `team-backup-${todayISO()}.json`);
    toast(S.trial ? 'Backup exported (not encrypted in test mode)' : 'Encrypted backup exported');
  }),
  'export-legacy': coachOnly(async () => {
    const t = M.legacyTeam(ws, data.id);
    download(S.trial ? t : await seal(t, S.coachLock, 'coach'), `${fileSlug(data)}-single-team-${todayISO()}.json`);
    toast(`${data.team.name} exported on its own`);
  }),
  'export-pre': coachOnly(() => {
    const pre = readJson(KEYS.backup); if (!pre) return;
    download(pre.file || pre.data, `team-before-upgrade-${pre.at.slice(0, 10)}.json`);
    toast('Copy from before the upgrade downloaded');
  }),
  'export-pre-seasons': coachOnly(() => {
    const pre = readJson(KEYS.seasonsBackup); if (!pre) return;
    download(pre.file || pre.data, `team-before-seasons-${pre.at.slice(0, 10)}.json`);
    toast('Copy from before seasons downloaded');
  }),
  'import-do': coachOnly(el => doImport(el.dataset.m)),
  'teams': coachOnly(() => goTo('teams')),
  'team-switch': coachOnly(() => teamSwitcher()),
  'team-pick': coachOnly(el => switchTeam(el.dataset.id)),
  'season-pick': coachOnly(() => seasonPicker()),
  'comp-open': coachOnly(el => { state.compId = el.dataset.id; closeSheet(); state.tab = 'comps'; history.replaceState(null, '', '#comps'); render(); window.scrollTo(0, 0); }),
  'comp-back': () => { state.compId = null; render(); window.scrollTo(0, 0); },
  'comp-new': coachOnly(el => compForm(null, el.dataset.team ? { team: el.dataset.team, season: el.dataset.season } : null)),
  'comp-edit': coachOnly(el => { const c = M.findComp(ws, el.dataset.id); if (c) compForm(c); }),
  'comp-move': coachOnly(el => {
    const c = M.findComp(ws, el.dataset.id); if (!c) return;
    if (el.dataset.to === 'archived' && !confirm(`Archive ${c.name}? Its entries, fixtures and results are kept, and it can be restored.`)) return;
    c.status = el.dataset.to; save(); render(); toast(`${c.name}: ${M.COMP_STATUS[c.status].toLowerCase()}`);
  }),
  'comp-enter': coachOnly(el => compEnterSheet(el.dataset.season)),
  'comp-entry-new': coachOnly(el => { const c = M.findComp(ws, el.dataset.id); if (c) entryForm(c, null, el.dataset.team ? { team: el.dataset.team, season: el.dataset.season } : null); }),
  'comp-entry-edit': coachOnly(el => { const c = M.findComp(ws, el.dataset.id), e = c && c.entries.find(x => x.id === el.dataset.entry); if (e) entryForm(c, e); }),
  'comp-withdraw': coachOnly(el => {
    const c = M.findComp(ws, el.dataset.id), e = c && c.entries.find(x => x.id === el.dataset.entry); if (!e) return;
    if (!confirm(`Withdraw ${entryName(e)} from ${c.name}? Its fixtures and results are kept.`)) return;
    M.withdrawEntry(ws, c.id, e.id); save(); render(); toast('Withdrawn');
  }),
  'comp-reenter': coachOnly(el => { const c = M.findComp(ws, el.dataset.id), e = c && c.entries.find(x => x.id === el.dataset.entry); if (!e) return; e.status = 'entered'; save(); render(); toast('Entered again'); }),
  'comp-entry-del': coachOnly(el => {
    const c = M.findComp(ws, el.dataset.id); if (!c) return;
    if (!confirm('Remove this entry? It has no fixtures.')) return;
    const err = M.removeEntry(ws, c.id, el.dataset.entry);
    if (err) { toast('It has fixtures now, so withdraw it instead'); return; }
    save(); render(); toast('Entry removed');
  }),
  'comp-link': coachOnly(el => { const c = M.findComp(ws, el.dataset.id), e = c && c.entries.find(x => x.id === el.dataset.entry); if (e) compLinkSheet(c, e); }),
  'season-view': coachOnly(el => {
    const s = M.findSeason(data, el.dataset.id); if (!s) return;
    if (s.status === 'active') delete state.viewSeason[data.id]; else state.viewSeason[data.id] = s.id;
    state.correcting = null; closeSheet(); render(); window.scrollTo(0, 0);
    toast(s.status === 'active' ? `Back to ${s.name}` : `Looking back at ${s.name}`);
  }),
  'season-open': coachOnly(el => { if (el.dataset.team && el.dataset.team !== data.id) switchTeam(el.dataset.team); seasonsSheet(); }),
  'season-new': coachOnly(() => seasonForm(null)),
  'season-edit': coachOnly(el => { const s = M.findSeason(data, el.dataset.id); if (s) seasonForm(s); }),
  'season-squad': coachOnly(el => { const s = M.findSeason(data, el.dataset.id); if (s) seasonSquadForm(s); }),
  'season-move': coachOnly(el => {
    const s = M.findSeason(data, el.dataset.id), to = el.dataset.to; if (!s) return;
    const a = M.activeSeason(data);
    if (to === 'completed' && s.status === 'active' && !confirm(`Complete ${s.name}? It's kept as it was and opens read-only. Nothing is deleted.`)) return;
    if (to === 'archived' && !confirm(`Archive ${s.name}? It's hidden from the season list but kept, and can be restored.`)) return;
    let err = M.seasonMove(data, s.id, to);
    if (err === 'other-active') {
      if (!confirm(`Complete ${a.name} and start ${s.name}?`)) return;
      M.seasonMove(data, a.id, 'completed'); err = M.seasonMove(data, s.id, 'active');
    }
    if (err) { toast('That season can’t move there'); return; }
    if (to === 'active') { delete state.viewSeason[data.id]; state.correcting = null; }
    save(); render(); seasonsSheet();
    toast(to === 'active' ? `${s.name} is the active season` : to === 'completed' ? `${s.name} completed` : to === 'archived' ? `${s.name} archived` : 'Saved');
  }),
  'season-next': coachOnly(() => rolloverForm(state.rollover)),
  'season-next-back': coachOnly(() => rolloverForm(state.rollover)),
  'season-carry-all': coachOnly(() => { document.querySelectorAll('#sheet input[name=carry]').forEach(i => { i.checked = true; }); }),
  'season-next-go': coachOnly(() => {
    const d = state.rollover; if (!d) return;
    const before = M.activeLens(data).players.length, staff = d.staff.map(i => arr(data.team.staff)[i]).filter(Boolean);
    const r = M.rollover(data, { ...d, staff, newPlayers: parseNewPlayers(d.newText) });
    const left = before - d.carry.length;
    state.rollover = null; delete state.viewSeason[data.id]; state.correcting = null;
    save(); render();
    openSheet(`${r.season.name} created`, `<p>${r.season.status === 'active' ? `${esc(r.season.name)} is now the active season.` : `${esc(r.season.name)} is planned. Start it from Seasons when it begins.`} ${d.carry.length} player${d.carry.length === 1 ? '' : 's'} carried over${r.added.length ? `, ${r.added.length} new` : ''}.</p>
      ${left > 0 ? `<p class="note" style="margin-top:12px">${left} player${left === 1 ? '' : 's'} didn’t carry over. Anyone with the players’ password or invite link can still open the team page. If you’d like to change it, do it in Settings, then send the new invite link to the squad. Nothing changes unless you do.</p>` : ''}
      <div class="btn-row" style="margin-top:14px"><button class="btn" data-act="settings">Settings</button><button class="btn primary" data-act="season-open">Seasons</button></div>`, 'season-done');
  }),
  'season-fix': coachOnly(() => {
    const s = V.viewSeason; if (!s || s.status !== 'completed') return;
    if (!confirm(`Correct ${s.name}? Changes are saved to that season's records, not the current season.`)) return;
    state.correcting = { team: data.id, season: s.id }; render(); toast(`Correcting ${s.name}`);
  }),
  'season-fix-done': coachOnly(() => { state.correcting = null; render(); toast('Corrections saved'); }),
  'home-scope': coachOnly(el => {
    const kind = el.dataset.kind, id = el.dataset.id || '';
    store.set('tm-home-scope', JSON.stringify({ kind, id })); state.homeAllUp = false;
    if (kind === 'team' && id !== data.id) switchTeam(id);   // picking a team is choosing to work on it
    else render();
  }),
  'home-days': el => { store.set('tm-home-days', el.dataset.v); render(); },
  'home-more': () => { state.homeAllUp = !state.homeAllUp; render(); },
  // Open a record from Home: switch to the team it belongs to first, then use the usual action.
  'home-go': coachOnly(el => {
    const d = el.dataset;
    if (d.team && d.team !== data.id) {
      if (!M.findTeam(ws, d.team) || M.findTeam(ws, d.team).archived) { toast('That team is no longer active'); render(); return; }
      switchTeam(d.team);
    }
    if (state.viewSeason[data.id] || state.correcting) { delete state.viewSeason[data.id]; state.correcting = null; render(); }   // Home is about the active season
    if (d.go === 'tab') { goTo(d.tab); return; }
    const fn = actions[d.go]; if (fn) fn({ dataset: { id: d.id || '', k: d.k || '', tab: d.tab || '', date: d.date || '' } });
  }),
  'team-new': coachOnly(() => openSheet('New team', teamForm(), 'team-new')),
  'club-new': coachOnly(() => { state.clubFor = state.sheet === 'settings' ? data.id : null; openSheet('New club', clubForm(null), 'club'); }),
  'club-edit': coachOnly(el => { const c = arr(ws.clubs).find(x => x.id === el.dataset.id); if (c) openSheet(`Edit ${c.name}`, clubForm(c), 'club'); }),
  'club-open': coachOnly(el => { state.clubId = el.dataset.id; goTo('club'); }),
  'updates': () => openUpdates(),
  'rules-review': coachOnly(() => openRulesReview()),
  'rules-open': () => { store.set(rulesSeenKey(), String(M.RULES.pack)); goTo('rules'); },
  'rules-seen': () => { store.set(rulesSeenKey(), String(M.RULES.pack)); render(); },
  'review-system': el => { state.system = el.dataset.id; state.sysFlip = false; store.set('tm-field-system', state.system); goTo('field'); },
  'review-play': el => { closeSheet(); state.tab = 'plays'; state.playId = el.dataset.id; state.playPhase = 0; history.replaceState(null, '', '#plays'); render(); window.scrollTo(0, 0); },
  'bylaw-add': coachOnly(() => bylawForm(null)),
  'bylaw-edit': coachOnly(el => bylawForm(arr(data.team.bylaws).find(b => b.id === el.dataset.id) || null)),
  'bylaw-del': coachOnly(el => {
    if (!confirm('Remove this by-law?')) return;
    data.team.bylaws = arr(data.team.bylaws).filter(b => b.id !== el.dataset.id); save(); closeSheet(); render(); toast('By-law removed');
  }),
  'rules-check': coachOnly(async el => {
    if (!ghReady() || S.trial) { toast('Connect GitHub in Settings first'); return; }
    el.disabled = true;
    try {
      await new GitHub({ ...gh, workflow: 'rules-watch.yml' }).startPublish(gh.defaultBranch || 'main');
      toast('Checking the rule books. The result shows here in about 5 minutes.');
    } catch (e) {
      toast(e.status === 403 || e.status === 404 ? 'Your GitHub token can’t start the Rules watch. Run it from the repository’s Actions tab, or give the token Actions: Read and write.' : (e.message || 'Couldn’t start the check'));
    } finally { el.disabled = false; }
  }),
  'player-photo-clear': coachOnly(el => {
    const form = el.closest('form'); if (!form) return;
    form.querySelector('[name=photo]').value = '';
    form.querySelector('.photo-prev').innerHTML = `<span class="pphoto big none" aria-hidden="true">${esc(initials({ name: (form.querySelector('[name=name]') || {}).value || '' }) || '?')}</span>`;
    el.hidden = true;
  }),
  'jersey-back': coachOnly(el => { const p = data.players.find(x => x.id === el.dataset.player); if (!p || !M.returnJersey(p, el.dataset.id, todayISO())) return; save(); afterJersey(p, `${p.name}’s jersey returned`); }),
  'jersey-undo': coachOnly(el => { const p = data.players.find(x => x.id === el.dataset.player); if (!p || !M.undoReturn(p, el.dataset.id)) return; save(); afterJersey(p, 'Marked as still out'); }),
  'jersey-del': coachOnly(el => {
    const p = data.players.find(x => x.id === el.dataset.player); if (!p) return;
    if (!confirm('Remove this jersey issue as a recording mistake? It will not be reissued automatically.')) return;
    if (!M.removeLoan(p, el.dataset.id)) return;
    save(); afterJersey(p, 'Erroneous issue removed; automatic reissue suppressed');
  }),
  'jersey-issue': coachOnly(el => {
    const p = data.players.find(x => x.id === el.dataset.player), active = M.activeSeason(data);
    if (!p || !active || !M.issueJersey(p, p.number, active.id, todayISO())) return;
    save(); afterJersey(p, 'Jersey explicitly issued again');
  }),
  'jersey-remind': coachOnly(el => {
    const p = data.players.find(x => x.id === el.dataset.player); if (!p || !p.phone) return;
    const nums = M.openLoans(p).filter(j => !el.dataset.season || j.seasonId === el.dataset.season).map(j => '#' + j.number).join(', ');
    if (!nums) return;
    sendWa(`Hi ${firstName(p)}, a reminder from ${data.team.name}: please hand back your jersey (${nums}) at training or to the team manager. Thanks!`, { to: p.name, phone: p.phone, ref: 'jersey:' + p.id });
  }),
  'jersey-share': coachOnly(() => {
    const r = M.jerseyReport(data, V.viewSeason.id), out = r.rows.filter(x => x.status === 'out');
    copyText(`👕 *Jerseys still out — ${data.team.name}*\n${out.map(x => `• ${x.name}: ${x.open.map(o => '#' + o.number).join(', ')}`).join('\n')}`);
  }),
  'positions-default': coachOnly(el => {
    const form = el.closest('form'), inp = form && form.querySelector('[name=positions]'); if (!inp) return;
    const sel = form.querySelector('[name=teamSport]'), sp = (sel && sel.value) || M.teamSport({}, M.clubOf(ws, data));
    inp.value = (M.SPORT_POSITIONS[sp] || []).join(', ');
  }),
  'club-logo-clear': coachOnly(el => {
    const form = el.closest('form'); if (!form) return;
    form.querySelector('[name=logo]').value = '';
    const v = n => (form.querySelector(`[name=${n}]`) || {}).value || '';
    form.querySelector('.logo-prev').innerHTML = crest({ id: v('id') || 'new', name: v('name'), short: v('shortName'), colours: v('colours') }, true);
    el.hidden = true;
  }),
  'club-del': coachOnly(el => {
    const c = arr(ws.clubs).find(x => x.id === el.dataset.id); if (!c) return;
    const n = M.clubTeams(ws, c.id).length;
    if (!confirm(`Delete ${c.name}?${n ? ` Its ${n} team${n === 1 ? '' : 's'} stay, just not in a club.` : ''}`)) return;
    M.removeClub(ws, c.id); state.clubId = null; save(); closeSheet(); render(); toast('Club deleted');
  }),
  'team-archive': coachOnly(el => {
    const t = M.findTeam(ws, el.dataset.id); if (!t) return;
    if (!confirm(`Archive ${M.teamName(t)}? ${S.trial ? 'It’s hidden from the team list' : 'Its players can’t open it once this publishes'} until you restore it. Nothing is deleted.`)) return;
    if (!M.setArchived(ws, t.id, true)) { toast('At least one team has to stay active'); return; }
    if (t === data) pickTeam();
    save(); render(); toast(`${M.teamName(t)} archived`);
  }),
  'team-restore': coachOnly(el => {
    const t = M.findTeam(ws, el.dataset.id); if (!t) return;
    M.setArchived(ws, t.id, false);
    if (!S.trial && !t.teamPass) t.teamPass = newTeamPass();
    save(); render(); toast(`${M.teamName(t)} restored${S.trial ? '' : '. Its players can open it again once this publishes'}`);
  }),
  'lib-save': coachOnly(el => {
    const kind = el.dataset.k, id = el.dataset.id;
    const play = kind === 'plays' ? arr(data.plays).find(p => p.id === id) : null;
    const set = play && play.set && !BUILTIN_SETS.some(b => b.id === play.set) ? arr(data.playerSets).find(x => x.id === play.set) : null;
    const r = M.libSave(ws, data, kind, id, { setDef: set ? { name: set.name, labels: set.labels, slots: set.slots } : null });
    if (!r) return;
    save(); render(); if (state.sheet === 'psets') openPlayerLists(); toast(libSaveReport(r));
  }),
  'lib-add': coachOnly(el => {
    const kind = el.dataset.k, x = M.libAdd(ws, data, kind, el.dataset.id); if (!x) return;
    save(); render(); toast(kind === 'plays' ? `${x.name} added to ${data.team.name}` : `Added to ${data.team.name}`);
  }),
  'lib-take': coachOnly(el => {
    if (!confirm('Use the library version? This team’s own changes to it will go.')) return;
    if (!M.libUpdate(ws, data, el.dataset.k, el.dataset.id)) return;
    save(); render(); if (state.sheet === 'psets') openPlayerLists(); toast('Now using the library version');
  }),
  'lib-unlink': coachOnly(el => { if (!M.libUnlink(data, el.dataset.k, el.dataset.id)) return; save(); render(); if (state.sheet === 'psets') openPlayerLists(); toast('Kept as this team’s own'); }),
  'lib-remove': coachOnly(el => {
    const kind = el.dataset.k, li = M.libGet(ws, kind, el.dataset.id); if (!li) return;
    if (!confirm(`Take ${kind === 'systems' ? sysName(li.id) : li.name} out of the library? Teams keep their copies as their own.`)) return;
    M.libRemove(ws, kind, li.id); save(); render(); toast('Taken out of the library');
  }),
  'lib-export': coachOnly(() => { download(M.libExport(ws), `team-library-${todayISO()}.json`); toast('Library exported'); }),
  'lib-import': coachOnly(() => { state.importKind = 'library'; $('#import-file').click(); }),
  'plays-view': coachOnly(el => goTo(el.dataset.v === 'library' ? 'library' : 'plays', false)),
  'import': coachOnly(() => { state.importKind = 'backup'; $('#import-file').click(); }),
  'start-over': coachOnly(() => openSheet('Clear team data', resetBody(), 'reset')),
  'reset-preset': coachOnly(el => {
    const pick = { season: ['training', 'matches', 'tasks', 'notices', 'messages'], all: Object.keys(M.RESET_PARTS), none: [] }[el.dataset.p] || [];
    document.querySelectorAll('#sheet input[name=part]').forEach(i => { i.checked = pick.includes(i.value); });
  })
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = actions[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  if (blockedInPast(el.dataset.act)) return;
  fn(el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#sheet').hidden) { requestCloseSheet(); return; }
  if (state.sheet !== 'play-editor' || !state.ped || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && pedDelete()) e.preventDefault();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); pedUndo(); }
});
document.addEventListener('input', e => {
  const k = e.target.dataset.input; if (!k) return;
  if (k === 'squad-search') { state.squadSearch = e.target.value; const l = $('#squad-list'); if (l) l.innerHTML = squadList(); }
  if (k === 'msg') state.msgDraft = e.target.value;
  if (k === 'ped-ptitle' && state.ped) { pedCur(state.ped).title = e.target.value; state.ped.dirty = true; }
  if ((k === 'ped-text' || k === 'ped-line') && state.ped && state.ped.sel) {
    const E = state.ped, d = pedCur(E);
    if (!E.textSnap) { pedSnap(); E.textSnap = true; }
    if (k === 'ped-line') d.notes.line = { text: e.target.value };
    else if (E.sel.k === 'lb' && d.labels[E.sel.i]) d.labels[E.sel.i].text = e.target.value;
    else { const key = pedNoteKey(E.sel); d.notes[key] = { ...(d.notes[key] || { side: E.sel.k === 'mk' ? 'l' : 'r' }), text: e.target.value }; }
    refreshPedField();
  }
});
document.addEventListener('change', e => {
  const k = e.target.dataset.change; if (!k) return;
  if (k === 'lineup') { state.lineupId = e.target.value; render(); }
  if (k === 'player-photo') {
    const inp = e.target, form = inp.closest('form');
    readPhoto(inp.files && inp.files[0]).then(d => {
      form.querySelector('[name=photo]').value = d;
      form.querySelector('.photo-prev').innerHTML = `<span class="pphoto big"><img src="${d}" alt=""></span>`;
      form.querySelector('[data-act=player-photo-clear]').hidden = false;
    }).catch(err => toast(err.message)).finally(() => { inp.value = ''; });
  }
  if (k === 'club-logo') {
    const inp = e.target, form = inp.closest('form');
    readLogo(inp.files && inp.files[0]).then(d => {
      form.querySelector('[name=logo]').value = d;
      form.querySelector('.logo-prev').innerHTML = crest({ id: 'logo', logo: d }, true);
      form.querySelector('[data-act=club-logo-clear]').hidden = false;
    }).catch(err => toast(err.message)).finally(() => { inp.value = ''; });
  }
  if (k === 'msg-session') { state.msgSession = e.target.value; state.msgDraft = buildTemplate(state.msgTpl); render(); }
  if (k === 'post-notice') state.postNotice = e.target.checked;
  if (k === 'ped-list' && state.ped) { pedSetList(e.target.value); refreshPlayEditor(); toast(`Showing ${getSet(e.target.value).name} labels`); }
  if (k === 'ped-side' && state.ped && state.ped.sel) {
    const E = state.ped, d = pedCur(E); pedSnap();
    if (E.sel.k === 'lb' && d.labels[E.sel.i]) d.labels[E.sel.i].side = e.target.value;
    else { const key = pedNoteKey(E.sel); d.notes[key] = { text: E.sel.k === 'mk' ? 'Marker' : '', ...(d.notes[key] || {}), side: e.target.value }; }
    refreshPedField();
  }
  if (k === 'repeat') { const u = e.target.closest('form').querySelector('.repeat-until'); if (u) u.hidden = !e.target.checked; }
  if (k === 'task-rotate') { const b = e.target.closest('form').querySelector('.rotate-box'); if (b) b.hidden = !e.target.checked; }
  if (k === 'task-kind') { const n = e.target.closest('form').querySelector('.need-f'); if (n) n.hidden = e.target.value === 'lift'; }
  if (k === 'task-session') {
    const o = e.target.selectedOptions[0], form = e.target.closest('form');
    if (o && o.value) ['date', 'start', 'end', 'place'].forEach(f => { const inp = form.querySelector(`[name="${f}"]`); if (inp) inp.value = o.dataset[f] || ''; });
  }
  if (k === 'tp-car' && isCoach()) {
    const t = data.tasks.find(x => x.id === e.target.dataset.id), p = taskPerson(t, e.target.dataset.who), to = e.target.value;
    if (!p) return;
    if (to && !M.canSeat(t, to, p.who) && !confirm(`That car is full. Put ${whoName(p.who)} in anyway? It will show as over capacity.`)) { e.target.value = p.car || ''; return; }
    p.car = to; save(); refreshTask(t.id);
  }
  if (k === 'import-file') {
    const file = e.target.files && e.target.files[0]; if (!file || !isCoach()) return;
    const r = new FileReader();
    r.onload = async () => {
      e.target.value = '';
      let parsed; try { parsed = JSON.parse(r.result); } catch (err) { toast("That file isn't a team backup"); return; }
      if (state.importKind === 'library') {
        const n = M.libImport(ws, parsed);
        if (!n) { toast("That file isn't a library file"); return; }
        save(); render(); toast(`Library: ${n.added} added, ${n.updated} updated${n.same ? `, ${n.same} already here` : ''}`);
        return;
      }
      let raw = parsed;
      if (isSealed(parsed)) {
        if (S.trial) { toast('That backup is encrypted. Go live first, then import it.'); return; }
        try { raw = (await openFile(parsed, S.coachLock, 'coach')).value; }
        catch (err) {
          const pw = prompt('This backup was made with a different coach password. Enter that password:');
          if (!pw) return;
          try { raw = (await openFile(parsed, pw, 'coach')).value; } catch (err2) { toast('Wrong password for that backup'); return; }
        }
      }
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.players)) { toast("That file isn't a team backup"); return; }
      state.importing = { raw };
      openSheet('Import backup', importBody(raw), 'import');
    };
    r.readAsText(file);
  }
});
document.addEventListener('submit', async e => {
  const form = e.target, kind = form.dataset.form; if (!kind) return;
  e.preventDefault();
  if (readOnlyView() && !/^(season|comp|club|settings)/.test(kind)) { toast(pastMsg()); return; }
  const f = new FormData(form);
  const str = k => String(f.get(k) ?? '').trim();
  const raw = k => String(f.get(k) ?? '');

  if (kind === 'unlock') {
    const role = form.dataset.role, pw = raw('password');
    state.remember = !!f.get('remember');
    if (!pw) return;
    state.busy = true; state.lockMsg = ''; renderLock();
    try {
      if (role === 'coach') await openCoach(pw, state.remember); else await openPlayer(pw, state.remember);
      state.busy = false; render();
    } catch (err) {
      state.busy = false;
      state.lockMsg = err.code === 'WRONG' ? "That password didn't work. Check it and try again."
        : err.code === 'NO_TEAM' ? "The team hasn't been published yet." : (err.message || 'Something went wrong.');
      renderLock();
      const inp = $('#view input[name=password]'); if (inp) inp.focus();
    }
    return;
  }
  if (kind === 'setup') {
    const name = str('name'), c1 = raw('coach'), c2 = raw('coach2'), t1 = raw('team'), t2 = raw('team2');
    const problem = passwordProblem(c1, c2, t1, t2);
    if (problem) { state.lockMsg = problem; renderLock(); return; }
    state.busy = true; state.lockMsg = ''; renderLock();
    ws = normalizeWs(defaultData()); pickTeam();
    data.team.name = name || data.team.name;
    data.teamPass = t1; data.teamSalt = toB64(newSalt());
    S.coachLock = await makeLock(c1);
    S.role = 'coach'; S.baseSha = null; S.remoteStamp = null;
    if (f.get('remember')) await rememberAuth('coach', S.coachLock);
    state.busy = false;
    save(); render();
    if (!ghReady()) openGithubSheet();
    toast('Team created');
    return;
  }
  if (kind === 'go-live' && S.trial) {
    const c1 = raw('coach'), c2 = raw('coach2'), t1 = raw('team'), t2 = raw('team2');
    const problem = passwordProblem(c1, c2, t1, t2), msg = $('#go-live-msg');
    if (problem) { msg.textContent = problem; msg.hidden = false; return; }
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Encrypting…';
    ws.teamPass = t1; ws.teamSalt = toB64(newSalt());
    // Other teams get their own password; the coach sees each in Settings once that team is on screen.
    const others = M.teamsOf(ws).filter(t => t !== ws);
    others.forEach(t => { t.teamPass = newTeamPass(); t.teamSalt = toB64(newSalt()); });
    if (others.some(t => t.teamPass === c1)) others.forEach(t => { t.teamPass = newTeamPass(); });
    S.coachLock = await makeLock(c1);
    S.trial = false; S.baseSha = null; S.remoteStamp = null;
    if (f.get('remember')) await rememberAuth('coach', S.coachLock);
    save();                       // stores the encrypted copy on this phone
    await draftChain;
    store.del(KEYS.trial);        // and removes the unencrypted test copy
    closeSheet(); render();
    if (ghReady()) publish(false); else openGithubSheet();
    toast('Passwords set');
    return;
  }
  if (!isCoach()) return;

  if (kind === 'task') {
    const made = saveTask({ id: str('id'), title: str('title'), kind: str('kind'), need: str('need'), sessionId: str('sessionId'), matchId: str('matchId'), date: str('date'), start: str('start'), end: str('end'),
      place: str('place'), notes: str('notes'), rotate: !!f.get('rotate'), until: str('until'), rot: f.getAll('rot').map(String) });
    if (!made) return;
    save();
    if (made.length > 1) { closeSheet(); render(); toast(`${made.length} tasks added, one for each training`); }
    else { render(); openTask(made[0].id); if (!str('id')) toast('Task added. Now add the people.'); }
    return;
  }
  if (kind === 'task-checklist') {
    const c = CHECKLISTS[str('list')] || CHECKLISTS.gameday, date = str('date') || todayISO(), place = str('place');
    c.items.forEach(([title, k, need]) => data.tasks.push({ id: uid(), title, kind: k, date, start: '', end: '', place, notes: '', need: k === 'lift' ? 0 : need, sessionId: '', people: [] }));
    state.tab = 'tasks'; state.taskFilter = 'up';
    save(); closeSheet(); render(); toast(`${c.items.length} tasks added for ${fmtDay(date)}`);
    return;
  }
  if (kind === 'task-copyday') {
    const from = str('from'), to = str('to'); if (!to) return;
    const src = data.tasks.filter(t => t.date === from);
    src.forEach(t => { const { id, people, series, sessionId, ...rest } = t; data.tasks.push({ ...rest, id: uid(), date: to, sessionId: '', people: [] }); });
    save(); closeSheet(); render(); toast(`${src.length} task${src.length === 1 ? '' : 's'} copied to ${fmtDay(to)}`);
    return;
  }
  if (kind === 'match') {
    const id = str('id'), date = str('date'); if (!date) { fieldError(form, 'date', 'Pick a date'); return; }
    const fields = { date, start: str('start'), opponent: str('opponent'), venue: str('venue'), field: str('field'), round: str('round'), notes: str('notes'), coachNotes: str('coachNotes') };
    if (f.get('tournament')) fields.tournament = true;
    if (!id) {
      const m = { id: uid(), ...fields, status: 'scheduled', rsvp: {}, result: {}, lineupId: '', seasonId: editingSeasonId() || (M.activeSeason(data) || {}).id || '' };
      setEntry(m, str('entry'));
      data.matches.push(m); save(); closeSheet(); render(); openMatch(m.id); toast('Match added');
      return;
    }
    const m = matchById(id); if (!m) return;
    setEntry(m, str('entry'));
    const status = M.MATCH_STATUS[str('status')] ? str('status') : m.status;
    const before = { date: m.date, start: m.start, end: '', place: matchWhere(m) }, after = { date, start: fields.start, end: '', place: matchWhere(fields) };
    const linked = M.linkedTasks(data, 'match', id), off = s => s === 'cancelled' || s === 'postponed';
    if (!('tournament' in fields)) delete m.tournament;
    if (off(status) && !off(m.status) && linked.some(t => !t.cancelled)) { askLinked({ kind: 'match', id, op: 'cancel', status, fields }); return; }
    if (linked.length && M.whenChanged(before, after)) { askLinked({ kind: 'match', id, op: 'edit', fields: { ...fields, status }, before, after }); return; }
    const back = off(m.status) && !off(status) ? M.reinstateTasks(data, 'match', id) : 0;
    Object.assign(m, fields, { status }); save(); closeSheet(); render(); openMatch(id);
    toast(back ? `Saved, and ${back} task${back === 1 ? '' : 's'} back on` : 'Saved');
    return;
  }
  if (kind === 'match-day') {
    const date = str('date'); if (!date) { fieldError(form, 'date', 'Pick a date'); return; }
    const lines = str('lines').split(/\n+/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) { fieldError(form, 'lines', 'Add at least one match, one per line'); return; }
    const made = lines.map(l => ({ id: uid(), date, venue: str('venue'), ...parseMatchLine(l), status: 'scheduled', rsvp: {}, result: {}, lineupId: '', notes: '', coachNotes: '', seasonId: editingSeasonId() || (M.activeSeason(data) || {}).id || '', ...(f.get('tournament') ? { tournament: true } : {}) }));
    made.forEach(m => setEntry(m, str('entry')));
    data.matches.push(...made); state.tab = 'matches'; history.replaceState(null, '', '#matches'); save(); closeSheet(); render();
    toast(`${made.length} match${made.length === 1 ? '' : 'es'} added for ${fmtDay(date)}`);
    return;
  }
  if (kind === 'match-lineup') {
    const m = matchById(str('id')); if (!m) return;
    const from = data.lineups.find(l => l.id === str('from'));
    const lu = from ? { ...clone(from), id: uid() } : makeLineup('');
    lu.name = `vs ${m.opponent || 'TBC'} (${fmtShort(m.date)})`;
    data.lineups.push(lu); m.lineupId = lu.id; state.lineupId = lu.id;
    save(); refreshMatch(m.id); toast('Match lineup made. Open it in Lineup to pick the eight.');
    return;
  }
  if (kind === 'match-result') {
    const m = matchById(str('id')); if (!m) return;
    const status = str('status') || 'scheduled', us = str('us'), them = str('them'), forfeit = str('forfeit');
    if (status === 'played' && (us === '' || them === '')) { fieldError(form, us === '' ? 'us' : 'them', 'Enter both scores, or choose Not played yet'); return; }
    if (status === 'forfeit' && !forfeit) { fieldError(form, 'forfeit', 'Say who forfeited'); return; }
    m.status = status;
    m.result = status === 'played' ? { us: Number(us), them: Number(them), notes: str('rnotes') } : status === 'forfeit' ? { forfeit, notes: str('rnotes') } : { notes: str('rnotes') };
    save(); refreshMatch(m.id); toast(M.matchOutcome(m) ? `Saved: ${resultText(m)}` : 'Saved');
    return;
  }
  if (kind === 'club') {
    const name = str('name'); if (!name) { fieldError(form, 'name', 'Give the club a name'); return; }
    const id = str('id'), old = id && arr(ws.clubs).find(c => c.id === id);
    const fields = Object.fromEntries(M.CLUB_PUBLIC.filter(k => k !== 'id').map(k => [k, str(k)]));
    const club = M.normClub({ ...(old || {}), ...fields, name, officials: peopleRows(f, 'o'), notes: str('notes') });
    if (old) Object.assign(old, club);
    else {
      ws.clubs = arr(ws.clubs); ws.clubs.push(club);
      const t = state.clubFor && M.findTeam(ws, state.clubFor); if (t && !t.team.clubId) t.team.clubId = club.id;
    }
    state.clubFor = null; state.clubId = club.id;
    save(); closeSheet(); if (state.tab !== 'teams') state.tab = 'club'; render(); toast(old ? 'Club saved' : `${club.name} created`);
    return;
  }
  if (kind === 'team-new') {
    const name = str('name'); if (!name) { fieldError(form, 'name', 'Give the team a name'); return; }
    let pass = '';
    if (!S.trial) {
      pass = raw('p1');
      if (pass || raw('p2')) { const problem = await teamPassProblem(pass, raw('p2'), null); if (problem) { fieldError(form, 'p1', problem); return; } }
      else pass = newTeamPass();
    }
    const t = normalize({ ...defaultData(), id: M.uid() });
    t.team.name = name; t.team.event = str('event'); t.team.eventStart = str('eventStart'); t.team.eventEnd = str('eventEnd');
    t.team.season = str('season') || String(new Date().getFullYear());   // names the team's first season
    t.team.sport = M.SPORTS.includes(str('teamSport')) ? str('teamSport') : '';
    t.team.clubId = str('clubId'); t.team.division = str('division'); t.team.category = M.TEAM_CATEGORIES[str('category')] ? str('category') : 'mixed';
    if (f.get('copySettings')) ['venue', 'trainingVenue', 'trainingStart', 'trainingEnd', 'maxMales', 'positions', 'field', 'tasksContact', 'rules', 'bylaws'].forEach(k => { t.team[k] = clone(data.team[k]); });
    t.team.rulesSeen = M.RULES.pack;
    { const sp = M.teamSport(t.team, M.clubOf(ws, t)), from = M.teamSport(data.team, M.clubOf(ws, data));
      if (f.get('copySettings') && data.team.positionsCustom === true) {
        t.team.positions = arr(data.team.positions).slice(); t.team.positionsCustom = true;
      } else {
        t.team.positions = (M.SPORT_POSITIONS[sp] || []).slice(); t.team.positionsCustom = false;
      }
    }
    t.teamPass = pass; t.teamSalt = '';
    M.addTeam(ws, t);
    if (f.get('withLibrary')) ['plays', 'systems', 'playerSets'].forEach(k => M.libItems(ws, k).forEach(li => M.libAdd(ws, t, k, li.id)));
    pickTeam(t.id); Object.assign(state, { lineupId: null, playId: null, msgDraft: null, tab: 'home', newTeamClub: null });
    history.replaceState(null, '', '#home');
    save(); closeSheet(); render(); toast(`${name} created and on screen`);
    return;
  }
  if (kind === 'merge') {
    const cf = state.conflict; if (!cf) return;
    const choices = {}; cf.result.changes.both.forEach((c, i) => { if (f.get('k' + i) === 'remote') choices[c.key] = 'remote'; });
    ws = normalizeWs(M.resolve(cf.result, choices)); pickTeam(data && data.id);
    S.baseSha = cf.head; S.base = cf.remote; S.remoteStamp = cf.remote.updatedAt; S.pub = 'idle'; state.conflict = null;
    state.lineupId = null; state.msgDraft = null;
    closeSheet(); save(); render(); publish(false);
    toast('Combined. Publishing…');
    return;
  }
  if (kind === 'reset') {
    const parts = f.getAll('part').map(String);
    if (!parts.length) { toast('Tick what to clear first'); return; }
    const names = parts.map(k => M.RESET_PARTS[k].split(',')[0].split(' (')[0].toLowerCase());
    if (!confirm(`Clear ${names.join('; ')}? This can’t be undone${S.trial ? '' : ', and players will see it once it publishes'}.`)) return;
    const n = M.resetTeam(data, parts, () => [makeLineup('Starting 8')]);
    state.lineupId = null; state.msgDraft = null; state.playId = null;
    save(); closeSheet(); render();
    toast(`Cleared: ${Object.entries(n).map(([k, v]) => `${v} ${k === 'squad' ? 'players' : k === 'training' ? 'sessions' : k}`).join(', ')}`);
    return;
  }
  if (kind === 'helper') {
    const id = str('id'); if (!str('name')) { fieldError(form, 'name', 'Add a name'); return; }
    const h = id ? data.helpers.find(x => x.id === id) : { id: uid() }; if (!h) return;
    Object.assign(h, { name: str('name'), phone: str('phone'), relation: str('relation'), playerId: str('playerId'), notes: str('notes') });
    if (!id) data.helpers.push(h);
    save(); closeSheet(); render(); toast(id ? 'Saved' : `${h.name} added`);
    return;
  }
  if (kind === 'system') {
    saveSystemWords(str('id'), { when: raw('when'), points: raw('points'), jobs: Object.fromEntries(JOB_GROUPS.map(g => [g, raw('job-' + g)])) });
    save(); closeSheet(); render(); toast('Saved');
    return;
  }
  if (kind === 'player') {
    const id = str('id'); const p = id ? playerById(id) : { id: uid() };
    if (!str('name')) { fieldError(form, 'name', 'Add a name'); return; }
    Object.assign(p, { name: str('name'), gender: str('gender'), number: str('number'), phone: str('phone'), positions: f.getAll('positions'), status: str('status') || 'available', notes: str('notes') });
    if (M.validPhoto(str('photo'))) p.photo = str('photo'); else delete p.photo;
    if (!id) data.players.push(p);
    save(); render();
    if (!id && e.submitter && e.submitter.value === 'another') { openSheet('Add player', playerForm(null), 'player'); toast(`${p.name} added`); setTimeout(() => { const n = $('#sheet input[name=name]'); if (n) n.focus(); }, 60); }
    else { closeSheet(); toast(id ? 'Saved' : `${p.name} added`); }
  }
  if (kind === 'bulk') {
    let added = 0;
    str('lines').split(/\n+/).map(l => l.trim()).filter(Boolean).forEach(line => {
      const parts = line.split(/[,\t;]+/).map(x => x.trim()).filter(Boolean);
      const p = { id: uid(), name: '', gender: '', number: '', phone: '', positions: [], status: 'available', notes: '' };
      parts.forEach((x, i) => {
        const low = x.toLowerCase(), digits = x.replace(/[^\d]/g, '');
        if (i === 0) { p.name = x; return; }
        if (['f', 'female', 'w', 'woman', 'girl'].includes(low)) p.gender = 'F';
        else if (['m', 'male', 'man', 'boy'].includes(low)) p.gender = 'M';
        else if (digits.length >= 8 && /^[+\d\s()-]+$/.test(x)) p.phone = x;
        else if (/^\d{1,3}$/.test(x)) p.number = x;
        else p.notes = p.notes ? p.notes + ', ' + x : x;
      });
      if (p.name) { data.players.push(p); added++; }
    });
    if (!added) { toast('No names found'); return; }
    save(); closeSheet(); render();
    const noG = V.players.filter(p => !p.gender).length;
    toast(`${added} player${added === 1 ? '' : 's'} added${noG ? `, ${noG} still need a gender` : ''}`);
  }
  if (kind === 'session') {
    const id = str('id'), date = str('date'); if (!date) { fieldError(form, 'date', 'Pick a date'); return; }
    const fields = { start: str('start'), end: str('end'), venue: str('venue'), focus: str('focus'), notes: str('notes') };
    if (fields.start && fields.end && fields.end <= fields.start) { fieldError(form, 'end', 'The finish needs to be after the start'); return; }
    if (id) {
      const s = sessionById(id); if (!s) return;
      const place = x => x.venue || data.team.trainingVenue || '';
      const before = { date: s.date, start: s.start, end: s.end, place: place(s) }, after = { date, start: fields.start, end: fields.end, place: place(fields) };
      if (M.linkedTasks(data, 'session', id).length && M.whenChanged(before, after)) { askLinked({ kind: 'session', id, op: 'edit', fields: { date, ...fields }, before, after }); return; }
      Object.assign(s, { date, ...fields }); save(); closeSheet(); render(); toast('Saved'); return;
    }
    const dates = [date];
    if (f.get('repeat') && str('until')) {
      const d = parseDate(date), until = str('until');
      for (let i = 0; i < 60; i++) { d.setDate(d.getDate() + 7); const iso = toISODate(d); if (iso > until) break; dates.push(iso); }
    }
    dates.forEach(dt => data.sessions.push({ id: uid(), date: dt, ...fields, cancelled: false, attendance: {} }));
    save(); closeSheet(); render(); toast(dates.length > 1 ? `${dates.length} sessions added` : 'Training added');
  }
  if (kind === 'comp') {
    if (!str('name')) { fieldError(form, 'name', 'Give the competition a name'); return; }
    if (str('start') && str('end') && str('end') < str('start')) { fieldError(form, 'end', 'The end is before the start'); return; }
    let c = M.findComp(ws, str('id')), isNew = !c;
    const fields = { name: str('name'), format: str('format'), sport: str('sport'), edition: str('edition'), status: str('status'), start: str('start'), end: str('end'), organiser: str('organiser'), venue: str('venue'),
      description: str('description'), rules: M.ruleSet(str('rules')) ? str('rules') : '' };
    const lines = raw('bylaws').split(/\n+/).map(x => x.trim()).filter(Boolean);
    if (isNew) { c = M.normComp({ ...fields, id: uid(), entries: [], bylaws: lines.map((text, i) => ({ id: `b${i + 1}`, text })) }); ws.competitions = M.compsOf(ws); ws.competitions.push(c); }
    else {
      const old = new Map(c.bylaws.map(b => [b.text, b]));
      Object.assign(c, M.normComp({ ...c, ...fields, bylaws: lines.map((text, i) => old.get(text) || { id: `b${Date.now().toString(36)}${i}`, text }) }));
    }
    const fe = state.compFor; state.compFor = null;
    if (isNew && fe) M.addEntry(ws, c.id, fe.team, fe.season, {});
    state.compId = c.id; state.tab = 'comps'; history.replaceState(null, '', '#comps');
    save(); closeSheet(); render(); toast(isNew ? `${c.name} created${fe ? ' and entered' : ''}` : 'Saved');
    return;
  }
  if (kind === 'comp-entry') {
    const c = M.findComp(ws, str('comp')); if (!c) return;
    const e = c.entries.find(x => x.id === str('entry'));
    if (e) {
      const clash = c.entries.find(x => x !== e && x.teamId === e.teamId && x.seasonId === e.seasonId && x.division.trim().toLowerCase() === str('division').toLowerCase());
      if (clash) { fieldError(form, 'division', 'That team and season is already entered in this division'); return; }
      e.division = str('division'); e.pool = str('pool');
    } else {
      const [teamId, seasonId] = str('ts').split('|');
      const r = M.addEntry(ws, c.id, teamId, seasonId, { division: str('division'), pool: str('pool') });
      if (r.error === 'duplicate') { fieldError(form, 'division', 'That team and season is already entered in this division'); return; }
      if (r.error) { toast('Pick a team and season'); return; }
    }
    state.compId = c.id; state.tab = 'comps'; history.replaceState(null, '', '#comps');
    save(); closeSheet(); render(); toast(e ? 'Entry saved' : 'Team entered');
    return;
  }
  if (kind === 'comp-link') {
    const c = M.findComp(ws, str('comp')), f2 = c && M.findEntry(ws, str('entry')); if (!f2) return;
    const t = M.findTeam(ws, f2.entry.teamId); let n = 0;
    f.getAll('m').forEach(id => { const m = arr(t.matches).find(x => x.id === id); if (m && !M.linkMatch(ws, t, m, f2.entry.id)) n++; });
    save(); closeSheet(); render(); toast(`${n} match${n === 1 ? '' : 'es'} linked to ${c.name}`);
    return;
  }
  if (kind === 'season') {
    if (!str('name')) { fieldError(form, 'name', 'Give the season a name'); return; }
    if (str('start') && str('end') && str('end') < str('start')) { fieldError(form, 'end', 'The end is before the start'); return; }
    const fields = { name: str('name'), label: str('label'), year: str('year'), start: str('start'), end: str('end') };
    const s = M.findSeason(data, str('id'));
    if (s) { Object.assign(s, fields); if (s.status === 'active') data.team.season = s.name; }
    else data.seasons.push(M.normSeason({ ...fields, id: uid(), status: 'planned', createdAt: todayISO() }));
    save(); render(); seasonsSheet(); toast(s ? 'Season saved' : `${fields.name} planned`);
    return;
  }
  if (kind === 'season-next') {
    if (!str('name')) { fieldError(form, 'name', 'Give the season a name'); return; }
    if (str('start') && str('end') && str('end') < str('start')) { fieldError(form, 'end', 'The end is before the start'); return; }
    const pos = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
    state.rollover = { name: str('name'), label: str('label'), year: str('year'), start: str('start'), end: str('end'), activate: str('when') === 'now',
      carry: f.getAll('carry').map(id => ({ playerId: String(id), number: str('num-' + id), positions: pos(f.get('pos-' + id)) })),
      newText: raw('newPlayers'), staff: f.getAll('staff').map(Number), keepDefaults: !!f.get('keepDefaults') };
    rolloverReview();
    return;
  }
  if (kind === 'season-squad') {
    const s = M.findSeason(data, str('id')); if (!s) return;
    const live = s.status === 'active', pos = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
    const removing = new Set(f.getAll('remove').map(String));
    M.seasonLens(data, s.id).players.forEach(lp => {
      const p = data.players.find(x => x.id === lp.id); if (!p || removing.has(p.id)) return;
      const number = str('num-' + p.id), positions = pos(f.get('pos-' + p.id)), reg = M.REG_STATUS[str('reg-' + p.id)] !== undefined ? str('reg-' + p.id) : '';
      let m = s.squad.find(x => x.playerId === p.id);
      if (live) Object.assign(p, { number, positions });
      if (!m && (reg || !live)) { m = { playerId: p.id, number, positions, status: p.status || 'available', reg: '' }; s.squad.push(m); }
      if (m) { if (!live) Object.assign(m, { number, positions }); m.reg = reg; }
    });
    let gone = 0;
    removing.forEach(pid => { if (M.removeMember(data, s.id, pid) === 'player') gone++; });
    f.getAll('add').forEach(pid => { const p = data.players.find(x => x.id === pid); if (p && !M.inSeason(data, s.id, pid)) s.squad.push({ playerId: p.id, number: String(p.number || ''), positions: arr(p.positions).slice(), status: 'available', reg: '' }); });
    save(); render(); seasonsSheet(); toast(`Squad saved${gone ? `; ${gone} removed from the team` : ''}`);
    return;
  }
  if (kind === 'rules-review') {
    data.team.rulesSeen = M.RULES.pack;
    const post = !!f.get('notice') && !!str('noticeText');
    if (post) postNotice(str('noticeText'));
    save(); closeSheet(); render(); toast(post ? 'Reviewed, and the notice is posted' : 'Marked as reviewed');
    return;
  }
  if (kind === 'bylaw') {
    if (!str('text')) { fieldError(form, 'text', 'Write the by-law first.'); return; }
    const T = data.team, id = str('id'), b = M.normBylaw({ id: id || uid(), topic: str('topic'), text: str('text'), replaces: str('replaces') });
    T.bylaws = arr(T.bylaws); const i = T.bylaws.findIndex(x => x.id === id);
    if (i >= 0) T.bylaws[i] = b; else T.bylaws.push(b);
    save(); closeSheet(); render(); toast('By-law saved');
    return;
  }
  if (kind === 'settings') {
    const T = data.team, before = clone(T), oldClub = M.clubOf(ws, data);
    T.name = str('name') || T.name; T.event = str('event'); T.eventStart = str('eventStart'); T.eventEnd = str('eventEnd');
    T.venue = str('venue');
    const ec = M.findComp(ws, T.eventCompId);   // the tournament is a competition: keep them the same
    if (ec) Object.assign(ec, { name: T.event || ec.name, start: T.eventStart, end: T.eventEnd, venue: T.venue });
    T.maxMales = str('maxMales') === '' ? '' : clamp(Math.round(Number(str('maxMales'))) || 0, 0, 8);
    T.rules = M.ruleSet(str('rules')) ? str('rules') : '';
    T.clubId = arr(ws.clubs).some(c => c.id === str('clubId')) ? str('clubId') : '';
    T.division = str('division'); T.category = M.TEAM_CATEGORIES[str('category')] ? str('category') : 'mixed';
    T.ageGroup = str('ageGroup'); T.colours = str('colours');
    T.staff = peopleRows(f, 'st');
    T.tasksContact = { name: str('tasksName'), phone: str('tasksPhone') };
    T.trainingVenue = str('trainingVenue'); T.trainingStart = str('trainingStart'); T.trainingEnd = str('trainingEnd');
    const sp = str('teamSport');
    T.sport = M.SPORTS.includes(sp) || sp === before.sport ? sp : '';
    const entered = str('positions').split(',').map(x => x.trim()).filter(Boolean);
    const resolved = M.changedSportPositions(before, oldClub, T, M.clubOf(ws, data), entered);
    T.positions = resolved.positions; T.positionsCustom = resolved.positionsCustom;
    T.jerseyLoan = !!f.get('jerseyLoan');
    const zone = Number(str('fieldZone')), touch = Number(str('fieldTouch')), middle = Number(str('fieldMiddle'));
    const fits = zone >= 5 && zone <= 30 && touch >= 2 && middle >= 4 && (50 - middle - 2 * touch) / 2 >= 3;
    if (fits) T.field = { zone, touch, middle };
    save(); render();
    toast(fits ? 'Settings saved' : "Saved, except the field sizes: they don't fit a 50 m wide field.");
  }
  if (kind === 'github') {
    const changed = gh.owner !== str('owner') || gh.repo !== str('repo');
    Object.assign(gh, { owner: str('owner'), repo: str('repo'), token: str('token'), autoPublish: !!f.get('autoPublish') });
    if (changed) { S.baseSha = null; delete gh.defaultBranch; }
    saveGh(); renderStatus();
    if (state.sheet === 'github') closeSheet();
    toast('GitHub details saved');
    if (ghReady() && S.dirty) publish(false);
  }
  if (kind === 'team-pass') {
    const p1 = raw('p1'), p2 = raw('p2');
    const problem = await teamPassProblem(p1, p2, data); if (problem) { fieldError(form, 'p1', problem); return; }
    data.teamPass = p1; data.teamSalt = toB64(newSalt()); delete S.teamLocks[data.id];
    save(); closeSheet(); render();
    toast('Team password changed. Send players the new invite link once it publishes.');
  }
  if (kind === 'coach-pass') {
    const old = raw('old'), p1 = raw('p1'), p2 = raw('p2');
    const check = await makeLock(old, S.coachLock.salt, S.coachLock.iterations);
    if (await exportKey(check.key) !== await exportKey(S.coachLock.key)) { toast("The current password isn't right"); return; }
    if (p1.length < 10) { toast('At least 10 characters'); return; }
    if (p1 !== p2) { toast("The passwords don't match"); return; }
    if (M.teamsOf(ws).some(t => t.teamPass === p1)) { toast('Use a different password from the team ones'); return; }
    S.coachLock = await makeLock(p1);
    if (readJson(KEYS.auth)) await rememberAuth('coach', S.coachLock);
    save(); closeSheet();
    toast('Coach password changed. Other coach devices will need the new one.');
  }
  if (kind === 'slot') {
    const sl = curLineup().slots.find(s => s.id === str('slot')); if (!sl) return;
    sl.label = (str('label') || sl.label).toUpperCase(); sl.name = str('name') || sl.name;
    save(); closeSheet(); render(); toast('Position renamed');
  }
  if (kind === 'play') {
    const E = state.ped; if (!E) return;
    if (!str('name')) { toast('Give the play a name'); const n = form.querySelector('[name=name]'); if (n) n.focus(); return; }
    Object.assign(E.draft, { name: str('name'), category: str('category') || 'Other', headline: str('headline'), when: str('when'), steps: String(f.get('steps') || '').trim() });
    if (form.querySelector('[name=rules]')) E.draft.rules = f.getAll('rules').map(String);
    if (E.draft.builtin) E.draft.edited = true;   // keep the coach's version when the starter drawings are updated
    M.libMarkEdited(E.draft);                      // and when the library version is updated
    const i = data.plays.findIndex(p => p.id === E.draft.id);
    if (i >= 0) data.plays[i] = E.draft; else data.plays.push(E.draft);
    state.playId = E.draft.id; state.ped = null;
    save(); closeSheet(); render(); toast('Play saved');
    return;
  }
  if (kind === 'pset') {
    const labels = [], seen = new Set();
    for (const line of String(f.get('labels') || '').split('\n').map(l => l.trim()).filter(Boolean)) {
      const m = line.match(/^(\S+)\s*(.*)$/), code = m[1].slice(0, 4), name = (m[2] || '').trim() || code;
      if (seen.has(code)) { toast(`${code} is in the list twice`); return; }
      seen.add(code); labels.push({ code, name });
    }
    if (!str('name') || !labels.length) { toast('Give the list a name and at least one player'); return; }
    const id = str('id'), old = data.playerSets.find(x => x.id === id);
    if (old) { Object.assign(old, { name: str('name'), labels }); M.libMarkEdited(old); } else data.playerSets.push({ id: uid(), name: str('name'), labels });
    save(); openPlayerLists(); toast('List saved');
    return;
  }
  if (kind === 'notice') {
    const text = str('text'); if (!text) return;
    postNotice(text); save(); closeSheet(); render(); toast('Posted');
  }
});
window.addEventListener('hashchange', () => {
  const t = location.hash.slice(1);
  if (S.role && t && t !== state.tab && VIEW_IDS.includes(t)) { state.tab = t; render(); }
});
window.addEventListener('pagehide', () => { if (S.role === 'coach') persistDraft(); });

/* ---------- updates ---------- */
// GitHub Pages lets browsers keep files for a while. When a newer release is out, reload into it
// (with a fresh address so no cached page is used), but never while a form is open.
const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || '';
let updating = false;
async function checkForUpdate() {
  if (!APP_VERSION || updating || state.busy || !$('#sheet').hidden) return;
  let m;
  try { const r = await fetch(`data/manifest.json?t=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) return; m = await r.json(); } catch (e) { return; }
  if (!m.version || m.version === APP_VERSION) return;
  try { if (sessionStorage.getItem('tm-reloaded-for') === m.version) return; sessionStorage.setItem('tm-reloaded-for', m.version); } catch (e) { /* storage blocked: still reload once */ }
  updating = true;
  if (S.role === 'coach') { persistDraft(); await draftChain; }
  location.replace(`${location.pathname}?v=${m.version}${location.hash}`);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkForUpdate(); if (state.askSent) renderAsk(); } });
setInterval(checkForUpdate, 10 * 60 * 1000);

/* =========================================================
   BOOT
   ========================================================= */
// #join=<team password> for the first team, #join=<team password>.<team id> for the others.
function readJoinLink() {
  const m = /^#join=([A-Za-z0-9_-]+)(?:\.([a-z0-9]{3,32}))?/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search + '#home');
  try { return { pass: fromB64Url(m[1]), file: m[2] ? `team-${m[2]}.enc.json` : 'team.enc.json' }; } catch (e) { return null; }
}

async function boot() {
  const join = readJoinLink();
  const hashTab = location.hash.slice(1);
  if (VIEW_IDS.includes(hashTab)) state.tab = hashTab;
  const auth = readJson(KEYS.auth);
  if (auth && auth.key) {
    try {
      const lock = await lockFromAuth(auth);
      if (auth.role === 'coach') await openCoach(lock, false); else await openPlayer(lock, false, auth.file);
      return render();
    } catch (e) {
      if (e.code === 'WRONG') { store.del(KEYS.auth); state.lockMsg = auth.role === 'coach' ? 'The coach password was changed. Sign in with the new one.' : 'The team password has changed. Ask your coach for the new one.'; }
      else if (e.code !== 'NO_TEAM') state.lockMsg = e.message || 'Something went wrong loading the team.';
      state.lockMode = auth.role === 'coach' ? 'coach' : 'player';
    }
  }
  if (join && !S.role) {
    try { await openPlayer(join.pass, true, join.file); state.tab = 'home'; return render(); }
    catch (e) { state.lockMsg = e.code === 'WRONG' ? "That invite link doesn't work any more. Ask your coach for a new one." : (e.message || ''); }
  }
  // Live once the coach's file is published (the first team's file can be offline if it's archived).
  let published = true;
  try { const files = await siteFiles(); published = files ? files.includes('coach.enc.json') : !!(await fetchSite('team.enc.json')); } catch (e) { published = true; }
  if (!published && !readDraft() && !auth) return startTrial();
  state.noTeam = !published;
  if (state.noTeam && readDraft()) state.lockMode = 'coach';
  renderLock();
}

// Nothing published yet: open straight into the coach view with no passwords.
function startTrial() {
  const raw = readJson(KEYS.trial);
  loadWs(raw, null).then(() => {
    if (raw && raw.schema !== M.SCHEMA) store.set(KEYS.trial, JSON.stringify(ws));   // keep the upgraded copy
    S.role = 'coach'; S.trial = true; S.coachLock = null;
    render();
  });
}

// Exposed for automated tests only.
window.__team = { get ws() { return ws; }, get data() { return data; }, get teamData() { return teamData; }, S, state, anim, M, planPhase: (p, i, side) => planPhase(playGeom(phaseView(p, i), side || 'right')) };

applyLayout();
window.addEventListener('resize', () => applyLayout());
if (window.ResizeObserver) new ResizeObserver(() => applyLayout()).observe($('.top'));
boot().finally(() => checkForUpdate());
