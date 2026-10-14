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
//   GitHub Pages site, where players' phones download and decrypt the team file.

import { ITERATIONS, makeLock, newSalt, seal, openFile, teamView, toB64, fromB64, toB64Url, fromB64Url, exportKey, importKey, isSealed } from './vault.js';
import { GitHub, repoFromLocation } from './github.js';

const KEYS = { auth: 'tm-auth', draft: 'tm-coach-draft', github: 'tm-github', teamCache: 'tm-team-file', trial: 'tm-test-data' };

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
const TABS = [
  { id: 'home', label: 'Home', icon: '<path d="M3.5 11 12 4l8.5 7v9h-5.5v-6h-6v6H3.5z"/>' },
  { id: 'squad', label: 'Squad', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.5.1 4.2 1.8 5 5"/>' },
  { id: 'training', label: 'Training', icon: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
  { id: 'field', label: 'Lineup', icon: '<rect x="5" y="2.5" width="14" height="19" rx="1.5"/><path d="M5 12h14M5 5.5h14M5 18.5h14"/>' },
  { id: 'plays', label: 'Plays', icon: '<circle cx="6.5" cy="6.5" r="2.5"/><path d="M15 4.5l4 4M19 4.5l-4 4"/><path d="M7 11c0 5 4 8 10 8"/><path d="M14 16.5l3 2.5-3 2.5"/>' },
  { id: 'messages', label: 'Messages', coach: true, icon: '<path d="M20.5 11.5a8 8 0 0 1-11.6 7.2L3.5 20l1.4-4.8a8 8 0 1 1 15.6-3.7z"/>' }
];

/* ---------- storage ---------- */
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
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
      maxMales: 4, positions: ['Wing', 'Link', 'Rover', 'Middle'],
      field: { ...FIELD_DEFAULTS }
    },
    players: [], sessions: [], lineups: [makeLineup('Starting 8')], messages: [], notices: [], plays: starterPlays(),
    teamPass: '', teamSalt: '', updatedAt: null
  };
}
const arr = v => Array.isArray(v) ? v : [];
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
  ['players', 'sessions', 'lineups', 'messages', 'notices', 'plays'].forEach(k => { out[k] = arr(out[k]); });
  renameHalfToRover(out);
  toPairedLayout(out);
  if (!out.lineups.length) out.lineups = base.lineups;
  out.sessions.forEach(s => { if (!s.attendance || typeof s.attendance !== 'object') s.attendance = {}; });
  out.players.forEach(p => { p.positions = arr(p.positions); if (!p.status) p.status = 'available'; });
  return out;
}
function normalizeTeam(t) {
  const base = teamView(defaultData());
  const out = { ...base, ...(t || {}), team: { ...base.team, ...((t && t.team) || {}) } };
  out.team.field = { ...FIELD_DEFAULTS, ...((t && t.team && t.team.field) || {}) };
  ['players', 'sessions', 'lineups', 'notices', 'plays'].forEach(k => { out[k] = arr(out[k]); });
  if (!out.lineups.length) out.lineups = base.lineups;
  renameHalfToRover(out);
  toPairedLayout(out);
  out.players.forEach(p => { p.positions = arr(p.positions); });
  return out;
}

/* ---------- session ---------- */
const S = {
  role: null,            // 'coach' | 'player'
  trial: false,          // test mode: no passwords, nothing leaves this phone
  coachLock: null, teamLock: null,
  baseSha: null,         // data-branch commit this device last loaded or published
  remoteStamp: null,     // updatedAt of the copy this device started from
  dirty: false, publishing: false, again: false,
  pub: 'idle', pubMsg: '', lastPublished: null
};
let data = null;      // coach: everything
let teamData = null;  // player: the team view
let V = null;         // what the current screen shows (set in render)
let gh = { autoPublish: true, ...repoFromLocation(), ...(readJson(KEYS.github) || {}) };

const state = {
  tab: 'home', squadFilter: 'all', squadSearch: '', trainingView: 'schedule', showPast: false,
  lineupId: null, moveMode: false, msgTpl: 'reminder', msgSession: null, msgDraft: null, postNotice: true,
  layers: { zones: true, channels: true, zigzag: false, ...(readJson('tm-field-layers') || {}) },
  playId: null, playSide: 'right', ped: null,
  preview: false, lockMode: 'player', lockMsg: '', noTeam: false, remember: true, busy: false
};
const isCoach = () => S.role === 'coach' && !state.preview;
const curView = () => S.role === 'coach' ? (state.preview ? normalizeTeam(teamView(data)) : data) : teamData;

const playerById = id => V.players.find(p => p.id === id);
const sessionById = id => V.sessions.find(s => s.id === id);
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
const inviteLink = () => `${location.origin}${location.pathname}#join=${toB64Url(data.teamPass)}`;

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
async function fetchTeamFile() {
  try {
    const f = await fetchSite('team.enc.json');
    if (f) store.set(KEYS.teamCache, JSON.stringify(f));
    return f;
  } catch (e) {
    const cached = readJson(KEYS.teamCache); // keeps the app usable with no reception at the ground
    if (cached) return cached;
    throw e;
  }
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

async function rememberAuth(role, lock) {
  store.set(KEYS.auth, JSON.stringify({ role, key: await exportKey(lock.key), salt: toB64(lock.salt), iterations: lock.iterations }));
}
async function lockFromAuth(a) {
  return { key: await importKey(a.key), salt: fromB64(a.salt), iterations: a.iterations || ITERATIONS };
}

async function openPlayer(cred, remember) {
  const file = await fetchTeamFile();
  if (!file) throw fail('NO_TEAM');
  const { value, lock } = await openFile(file, cred, 'team');
  teamData = normalizeTeam(value);
  S.role = 'player'; S.teamLock = lock;
  if (remember) await rememberAuth('player', lock);
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
  data = normalize(value);
  S.role = 'coach'; S.coachLock = lock; S.dirty = chosen.dirty;
  S.baseSha = chosen.sha || null;
  S.remoteStamp = chosen.stamp !== undefined ? chosen.stamp : data.updatedAt;
  if (remember) await rememberAuth('coach', lock);
  persistDraft();
  if (S.dirty) schedulePublish();
}

let draftChain = Promise.resolve();
function persistDraft() {
  if (S.role !== 'coach' || !S.coachLock) return;
  const snapshot = JSON.parse(JSON.stringify(data));
  const meta = { baseSha: S.baseSha, remoteStamp: S.remoteStamp, dirty: S.dirty };
  draftChain = draftChain.then(async () => {
    const file = await seal(snapshot, S.coachLock, 'coach');
    store.set(KEYS.draft, JSON.stringify({ file, ...meta, at: new Date().toISOString() }));
  }).catch(() => {});
}

// Every change: keep it (encrypted) on this phone, then publish shortly after.
function save() {
  data.updatedAt = new Date().toISOString();
  if (S.trial) { store.set(KEYS.trial, JSON.stringify(data)); renderStatus(); return; }
  S.dirty = true;
  persistDraft();
  schedulePublish();
  renderStatus();
}

let publishTimer = null;
function schedulePublish() {
  clearTimeout(publishTimer);
  if (!S.trial && ghReady() && gh.autoPublish) publishTimer = setTimeout(() => publish(true), 5000);
}

async function teamLockFor(d) {
  if (!d.teamSalt) d.teamSalt = toB64(newSalt());
  const L = S.teamLock;
  if (L && L.pass === d.teamPass && toB64(L.salt) === d.teamSalt) return L;
  const lock = await makeLock(d.teamPass, fromB64(d.teamSalt));
  S.teamLock = { ...lock, pass: d.teamPass };
  return S.teamLock;
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
    const snapshot = JSON.parse(JSON.stringify(data));
    const teamLock = await teamLockFor(snapshot);
    data.teamSalt = snapshot.teamSalt;
    const [teamFile, coachFile] = await Promise.all([
      seal(teamView(snapshot), teamLock, 'team'),
      seal(snapshot, S.coachLock, 'coach')
    ]);
    const sha = await g.commitFiles({
      'team.enc.json': JSON.stringify(teamFile, null, 1),
      'coach.enc.json': JSON.stringify(coachFile, null, 1)
    }, head, `Update team data (${new Date().toISOString().slice(0, 16)}Z)`);
    S.baseSha = sha; S.remoteStamp = snapshot.updatedAt;
    if (JSON.stringify(data) === JSON.stringify(snapshot)) S.dirty = false;
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
    data = normalize(value);
    S.baseSha = remote.sha; S.remoteStamp = data.updatedAt; S.dirty = false; S.pub = 'idle';
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
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'
};
const icon = (n, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const gBadge = p => { const g = p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : 'U'; return `<span class="g ${g}" title="${g === 'F' ? 'Female' : g === 'M' ? 'Male' : 'Gender not set'}">${g === 'U' ? '?' : g}</span>`; };
const jersey = p => `<span class="jersey ${p.number ? '' : 'none'}">${esc(p.number || initials(p))}</span>`;
const isOut = p => isCoach() && p.status && p.status !== 'available';
const statusPill = p => isOut(p) ? ` <span class="pill ${p.status}">${STATUS[p.status]}</span>` : '';

function render() {
  if (!S.role) return renderLock();
  V = curView();
  if (!isCoach() && state.tab === 'messages') state.tab = 'home';
  renderNav();
  renderStatus();
  $('#team-title').textContent = V.team.name || 'Team Manager';
  document.title = V.team.name || 'Team Manager';
  $('#menu-btn').hidden = false;
  const cd = countdown(), chip = $('#days-chip');
  if (cd && cd.state === 'before') { chip.hidden = false; chip.innerHTML = `<b>${cd.days}</b> day${cd.days === 1 ? '' : 's'}`; chip.title = `Days until ${V.team.event}`; }
  else if (cd && cd.state === 'during') { chip.hidden = false; chip.innerHTML = '<b>Game day</b>'; }
  else chip.hidden = true;

  const v = $('#view');
  if (state.tab === 'home') v.innerHTML = viewHome();
  if (state.tab === 'squad') v.innerHTML = viewSquad();
  if (state.tab === 'training') v.innerHTML = viewTraining();
  if (state.tab === 'field') { v.innerHTML = viewField(); bindField(); }
  if (state.tab === 'plays') v.innerHTML = viewPlays();
  if (state.tab === 'messages') v.innerHTML = viewMessages();
}

function renderNav() {
  const nav = $('#tabs');
  const tabs = TABS.filter(t => !t.coach || isCoach());
  nav.hidden = false;
  nav.style.gridTemplateColumns = `repeat(${tabs.length},1fr)`;
  nav.innerHTML = tabs.map(t => `<button data-act="tab" data-tab="${t.id}" ${t.id === state.tab ? 'aria-current="page"' : ''}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.icon}</svg>${t.label}</button>`).join('');
}

function renderStatus() {
  const el = $('#status');
  if (S.role !== 'coach') { el.hidden = true; return; }
  el.hidden = false;
  let cls = 'ok', text = '', btn = '';
  if (state.preview) { cls = 'info'; text = 'You are seeing what players see.'; btn = `<button data-act="preview-off">Back to coach view</button>`; }
  else if (S.trial) { cls = 'warn'; text = 'Test mode. Saved on this phone only; nothing is shared.'; btn = `<button data-act="go-live">Go live</button>`; }
  else if (!ghReady()) { cls = 'warn'; text = 'Saved on this phone only.'; btn = `<button data-act="github">Connect GitHub to publish</button>`; }
  else if (S.publishing) { cls = 'busy'; text = 'Publishing…'; }
  else if (S.pub === 'conflict') { cls = 'bad'; text = 'Changed on another device.'; btn = `<button data-act="conflict">Sort it out</button>`; }
  else if (S.pub === 'error') { cls = 'bad'; text = S.pubMsg; btn = `<button data-act="publish">Try again</button>`; }
  else if (S.dirty) { cls = 'warn'; text = gh.autoPublish ? 'Publishing shortly…' : 'Changes not published yet.'; btn = `<button data-act="publish">Publish now</button>`; }
  else if (S.lastPublished && Date.now() - S.lastPublished < 180000) { text = 'Published. Players see it in about a minute.'; }
  else { text = 'All changes published.'; }
  el.className = `status ${cls}`;
  el.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="grow">${esc(text)}</span>${btn}`;
}
setInterval(() => { if (S.role === 'coach' && !S.publishing) renderStatus(); }, 30000);

/* ---------- Lock screen and setup ---------- */
function renderLock() {
  $('#tabs').hidden = true; $('#status').hidden = true; $('#days-chip').hidden = true; $('#menu-btn').hidden = true;
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
function viewHome() {
  const T = V.team, cd = countdown();
  let hero = '';
  if (cd) {
    const left = V.sessions.filter(s => !s.cancelled && s.date >= todayISO() && s.date < T.eventStart).length;
    const big = cd.state === 'before' ? `<span class="big">${cd.days}</span><span class="unit">day${cd.days === 1 ? '' : 's'} to go</span>`
      : cd.state === 'during' ? `<span class="big">Game on</span>` : `<span class="big">Done</span>`;
    hero = `<section class="hero">
      <div>${big}</div>
      <p class="ev">${esc(T.event)}, ${esc(fmtEventDates())}</p>
      <p class="meta">${esc(T.venue)}</p>
      ${cd.state === 'before' ? `<span class="tagline">${left} training session${left === 1 ? '' : 's'} before then</span>` : ''}
    </section>`;
  }
  const notices = V.notices.slice(0, isCoach() ? 3 : 10);
  const noticeHtml = notices.length ? `<section class="sec"><div class="sec-h"><h2>Notices</h2>${isCoach() ? '<button class="btn sm" data-act="tab" data-tab="messages">Manage</button>' : ''}</div>
      <div class="list">${notices.map(n => `<div class="notice"><span class="sub">${esc(fmtStamp(n.at))}</span><p>${esc(n.text)}</p></div>`).join('')}</div></section>` : '';

  if (!V.players.length) {
    if (!isCoach()) return hero + noticeHtml + `<p class="muted">The squad hasn't been announced yet.</p>`;
    return hero + `<section class="empty">
      <h3>Start with your squad</h3>
      <p>Add your players first. Roll call, lineups and messages all build on the squad list.</p>
      <div class="btn-row"><button class="btn primary" data-act="add-player">${icon('plus')}Add a player</button><button class="btn" data-act="bulk-add">Paste a list</button></div>
      <p class="hint" style="margin-top:14px">Just exploring? <button class="link-btn inline" data-act="sample">Load a sample squad</button>. Clear it in Settings before you invite players.</p>
    </section>`;
  }
  const n = nextSession();
  const nextHtml = n ? `<div class="next">
      ${calBlock(n.date)}
      <div class="grow">
        <p class="name">${n.date === todayISO() ? 'Today, ' : ''}${esc(fmtRange(n))}</p>
        <p class="sub">${esc(n.venue || T.trainingVenue || 'Venue TBC')}</p>
        ${n.focus ? `<p class="small" style="margin-top:2px">Focus: ${esc(n.focus)}</p>` : ''}
        ${n.notes ? `<p class="small muted" style="margin-top:2px">${esc(n.notes)}</p>` : ''}
        ${isCoach() ? `<div class="btn-row" style="margin-top:10px">
          <button class="btn wa sm" data-act="remind" data-id="${n.id}">${icon('chat', 18)}Send reminder</button>
          <button class="btn sm" data-act="roll" data-id="${n.id}">${icon('clip', 18)}Roll call</button>
        </div>` : ''}
      </div></div>`
    : isCoach() ? `<div class="empty"><p>No training booked yet.</p><button class="btn primary" data-act="add-session">${icon('plus')}Add training</button></div>`
      : `<p class="muted">No training scheduled yet.</p>`;

  const P = V.players;
  const f = P.filter(p => p.gender === 'F').length, m = P.filter(p => p.gender === 'M').length;
  let h = hero;
  if (!isCoach()) h += noticeHtml;
  h += `<section class="sec"><div class="sec-h"><h2>Next training</h2><button class="btn sm" data-act="tab" data-tab="training">All sessions</button></div>${nextHtml}</section>`;
  if (isCoach()) {
    const out = P.filter(p => p.status !== 'available').length;
    const rs = rollSessions().slice(-8);
    h += noticeHtml + `<section class="sec"><div class="sec-h"><h2>Squad</h2><button class="btn sm" data-act="tab" data-tab="squad">Manage</button></div>
      <div class="stats">
        <div class="stat"><b>${P.length}</b><span>Players</span></div>
        <div class="stat"><b>${f}</b><span>Female</span></div>
        <div class="stat"><b>${m}</b><span>Male</span></div>
        <div class="stat"><b style="color:${out ? 'var(--bad)' : 'inherit'}">${out}</b><span>Out</span></div>
      </div></section>
    <section class="sec"><div class="sec-h"><h2>Training turnout</h2>${rs.length ? `<button class="btn sm" data-act="attendance">Details</button>` : ''}</div>
      ${rs.length ? `<div class="chart">${turnoutChart(rs)}</div>` : `<p class="muted small">Take a roll call at training and turnout will chart here.</p>`}
    </section>`;
  }
  return h;
}
function calBlock(date) {
  const d = parseDate(date);
  return `<div class="cal" aria-hidden="true"><span class="dow">${d.toLocaleDateString('en-AU', { weekday: 'short' })}</span><span class="d">${d.getDate()}</span><span class="mo">${d.toLocaleDateString('en-AU', { month: 'short' })}</span></div>`;
}
function turnoutChart(rs) {
  const squad = Math.max(1, V.players.length);
  const W = 320, H = 130, top = 18, base = 104, n = rs.length, gap = 10;
  const bw = Math.min(30, (W - 20 - gap * (n - 1)) / n);
  const x0 = (W - (n * bw + (n - 1) * gap)) / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Players at the last ${n} sessions">`;
  s += `<line x1="8" x2="${W - 8}" y1="${base}" y2="${base}" stroke="#DCE1D9"/>`;
  s += `<line x1="8" x2="${W - 8}" y1="${top}" y2="${top}" stroke="#DCE1D9" stroke-dasharray="3 3"/><text x="${W - 8}" y="${top - 5}" text-anchor="end" font-size="10" fill="#5B6861" font-family="Barlow, sans-serif">Full squad (${squad})</text>`;
  rs.forEach((sess, i) => {
    const a = Object.values(sess.attendance).filter(v => v === 'present' || v === 'late').length;
    const h = (base - top) * Math.min(1, a / squad), x = x0 + i * (bw + gap);
    s += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="4" fill="#123D2B"/>`;
    s += `<text x="${x + bw / 2}" y="${base - h - 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#16201B" font-family="Barlow Condensed, sans-serif">${a}</text>`;
    s += `<text x="${x + bw / 2}" y="${base + 15}" text-anchor="middle" font-size="10" fill="#5B6861" font-family="Barlow, sans-serif">${fmtShort(sess.date)}</text>`;
  });
  return s + '</svg>';
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
  return `<div class="list">${list.map(p => {
    const main = `${jersey(p)}
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
    <label class="field-l"><span>Name</span><input type="text" name="name" required value="${esc(p.name)}" autocapitalize="words"></label>
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
      ${data.team.positions.map(x => `<label class="opt"><input type="checkbox" name="positions" value="${esc(x)}" ${p.positions.includes(x) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}
    </div></div>
    <label class="field-l"><span>Notes</span><input type="text" name="notes" value="${esc(p.notes)}" placeholder="Coach only, e.g. works Thursdays"></label>
    ${st && st.total ? `<p class="note" style="background:var(--ok-soft)">Training: ${st.att} of ${st.total} sessions (${st.pct}%)${st.late ? `, ${st.late} late` : ''}${st.apol ? `, ${st.apol} apolog${st.apol === 1 ? 'y' : 'ies'}` : ''}.</p>` : ''}
    <div class="btn-row">
      <button class="btn primary" type="submit" value="save">${isNew ? 'Add player' : 'Save changes'}</button>
      ${isNew ? `<button class="btn" type="submit" value="another">Add and next</button>` : ''}
    </div>
    ${!isNew ? `<div class="btn-row" style="margin-top:10px">${p.phone ? `<button type="button" class="btn wa" data-act="wa-player" data-id="${p.id}">${icon('chat', 18)}WhatsApp</button>` : ''}<button type="button" class="btn danger" data-act="delete-player" data-id="${p.id}">Remove from squad</button></div>` : ''}
  </form>`;
}
function bulkForm() {
  return `<form data-form="bulk">
    <p class="muted small" style="margin-bottom:10px">One player per line. Add F or M for gender, and a mobile number or jersey number if you have them, in any order, separated by commas.</p>
    <textarea name="lines" rows="10" placeholder="Mia Tuala, F, 0412 345 678&#10;Josh Halloran, M, 7&#10;Ava Kelleher, F"></textarea>
    <button class="btn primary block" type="submit" style="margin-top:12px">Add players</button>
  </form>`;
}

/* ---------- Training ---------- */
function viewTraining() {
  if (!isCoach()) return viewSchedule();
  const seg = `<div class="seg" role="group" aria-label="Training view">
    <button data-act="train-view" data-v="schedule" aria-pressed="${state.trainingView === 'schedule'}">Schedule</button>
    <button data-act="train-view" data-v="attendance" aria-pressed="${state.trainingView === 'attendance'}">Attendance</button></div>`;
  return seg + (state.trainingView === 'schedule' ? viewSchedule() : viewAttendance());
}
function sessionRow(s) {
  const isPast = s.date < todayISO(), taken = rollTaken(s);
  const info = `<span class="t" style="display:block">${esc(fmtRange(s))}</span>
      <span class="sub" style="display:block">${esc(s.venue || V.team.trainingVenue || 'Venue TBC')}</span>
      ${s.focus ? `<span class="focus" style="display:block">${esc(s.focus)}</span>` : ''}
      ${s.notes && !isCoach() ? `<span class="sub" style="display:block">${esc(s.notes)}</span>` : ''}`;
  if (!isCoach()) return `<div class="sess ${s.cancelled ? 'cancelled' : ''} ${s.date === todayISO() ? 'today' : ''}">${calBlock(s.date)}
    <div class="sess-main">${info}${s.cancelled ? '<span style="display:block;margin-top:4px"><span class="pill bad">Cancelled</span></span>' : ''}</div></div>`;
  const vals = Object.values(s.attendance || {});
  const attended = vals.filter(v => v === 'present' || v === 'late').length, apol = vals.filter(v => v === 'apology').length;
  return `<div class="sess ${s.cancelled ? 'cancelled' : ''} ${s.date === todayISO() ? 'today' : ''}">
    ${calBlock(s.date)}
    <button class="sess-main" data-act="edit-session" data-id="${s.id}">${info}
      <span style="display:block;margin-top:4px">${s.cancelled ? '<span class="pill bad">Cancelled</span>' : taken ? `<span class="pill ok">${attended} attended</span>${apol ? ` <span class="pill neutral">${apol} apolog${apol === 1 ? 'y' : 'ies'}</span>` : ''}` : isPast ? '<span class="pill neutral">No roll taken</span>' : ''}</span>
    </button>
    ${s.cancelled ? '' : `<div class="acts">
      ${!isPast ? `<button class="btn wa sm" data-act="remind" data-id="${s.id}" aria-label="Send reminder for ${esc(fmtDay(s.date))}">${icon('chat', 18)}</button>` : ''}
      <button class="btn sm" data-act="roll" data-id="${s.id}" aria-label="Roll call for ${esc(fmtDay(s.date))}">${icon('clip', 18)}</button>
    </div>`}
  </div>`;
}
function viewSchedule() {
  const up = upcomingSessions(), past = pastSessions();
  let h = `<div class="sec-h"><h2>Upcoming</h2>${isCoach() ? `<button class="btn primary sm" data-act="add-session">${icon('plus', 18)}Add training</button>` : ''}</div>`;
  h += up.length ? `<div class="list">${up.map(sessionRow).join('')}</div>`
    : `<div class="empty"><p>${isCoach() ? 'Nothing scheduled. Add a session — you can repeat it weekly right up to the tournament.' : 'No training scheduled yet.'}</p></div>`;
  if (past.length) {
    h += `<button class="toggle-past" data-act="toggle-past">${state.showPast ? 'Hide' : 'Show'} past sessions (${past.length})</button>`;
    if (state.showPast) h += `<div class="list">${past.map(sessionRow).join('')}</div>`;
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
      <span class="grow"><span class="name" style="display:block">${esc(p.name)} ${gBadge(p)}</span>${p.status !== 'available' ? `<span class="pill ${p.status}">${STATUS[p.status]}</span>` : ''}</span>
      <span class="roll-btns">${Object.entries(ROLL).map(([k, l]) => `<button class="rb b-${k}" data-act="mark" data-sid="${s.id}" data-pid="${p.id}" data-s="${k}" aria-label="${esc(p.name)}: ${k}">${l}</button>`).join('')}</span>
    </div>`).join('')}</div>
    <button class="btn primary block" style="margin-top:14px" data-act="roll-done" data-sid="${s.id}">Done</button>
    <p class="hint">Anyone left unmarked is recorded as absent when you tap Done. Attendance is only visible to coaches.</p>`;
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
  const max = Number(V.team.maxMales) || 4;
  const bench = sortedPlayers().filter(p => !onField.includes(p));
  const coach = isCoach();
  return `<div class="lineup-bar">
      <select aria-label="Choose lineup" data-change="lineup">${V.lineups.map(l => `<option value="${l.id}" ${l.id === lu.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
      ${coach ? `<button class="btn sm" data-act="lineup-menu" aria-label="Lineup options">${icon('dots', 20)}</button>` : ''}
    </div>
    ${coach ? `<div class="seg" role="group" aria-label="Field mode">
      <button data-act="move-mode" data-on="0" aria-pressed="${!state.moveMode}">Pick players</button>
      <button data-act="move-mode" data-on="1" aria-pressed="${state.moveMode}">Move positions</button>
    </div>` : ''}
    <div class="chips layer-chips" role="group" aria-label="Show on the field">
      <button class="chip" data-act="layer" data-k="zones" aria-pressed="${!!state.layers.zones}">Zones</button>
      <button class="chip" data-act="layer" data-k="channels" aria-pressed="${!!state.layers.channels}">Channels</button>
      <button class="chip" data-act="layer" data-k="zigzag" aria-pressed="${!!state.layers.zigzag}">Zig-zag</button>
    </div>
    <div class="field-wrap">${fieldSVG(lu, coach)}</div>
    ${state.layers.zigzag ? '<p class="hint" style="text-align:center">Zig-zag: work the ball into one side to pull their defence across, then switch to the other side.</p>' : ''}
    ${coach ? `<div class="ratio">
      <span class="pill ${males > max ? 'bad' : 'ok'}">${males} of ${max} males max</span>
      <span class="pill neutral">${females} female</span>
      <span class="pill ${onField.length === 8 ? 'ok' : 'neutral'}">${onField.length}/8 on field</span>
    </div>
    ${males > max ? `<p class="note" style="background:var(--bad-soft);margin-top:8px">Too many males on field for mixed. Swap ${males - max} out for a female player.</p>` : ''}
    <p class="hint" style="text-align:center">${state.moveMode ? 'Drag the circles to set your shape.' : 'Tap a position to put a player there.'}</p>
    <div class="field-tools">
      <button class="btn sm" data-act="shape" data-shape="attack">Attack shape</button>
      <button class="btn sm" data-act="shape" data-shape="defence">Defence line</button>
      <button class="btn wa sm" data-act="lineup-share">${icon('chat', 18)}Send lineup</button>
    </div>` : ''}
    <section class="sec" style="margin-top:22px"><div class="sec-h"><h2>Interchange (${bench.length})</h2></div>
      ${bench.length ? `<div class="bench">${bench.map(p => `<span class="chip ${isOut(p) ? 'out' : ''}">${gBadge(p)}${esc(shortName(p))}${statusPill(p)}</span>`).join('')}</div>` : `<p class="muted small">${V.players.length ? 'Everyone is on the field.' : coach ? 'Add players in Squad first.' : 'No lineup yet.'}</p>`}
    </section>`;
}
function fieldSVG(lu, interactive) {
  let s = `<svg id="field" class="field ${state.moveMode && interactive ? 'moving' : ''} ${interactive ? 'interactive' : ''}" viewBox="-3 -1 56 82" role="group" aria-label="Field positions for ${esc(lu.name)}">`;
  s += `<rect x="0" y="0" width="50" height="80" fill="var(--turf)"/>`;
  for (let y = 5, i = 0; y < 75; y += 5, i++) if (i % 2) s += `<rect x="0" y="${y}" width="50" height="5" fill="var(--turf-2)"/>`;
  s += `<rect x="0" y="0" width="50" height="5" fill="var(--turf-3)"/><rect x="0" y="75" width="50" height="5" fill="var(--turf-3)"/>`;
  const F = fieldDims(V.team.field), L = state.layers;
  if (L.channels) s += channelsSVG(F);
  if (L.zones) s += zonesSVG(F);
  s += `<rect class="mark" x="0" y="0" width="50" height="80"/>`;
  s += `<line class="mark" x1="0" x2="50" y1="5" y2="5"/><line class="mark" x1="0" x2="50" y1="75" y2="75"/><line class="mark" x1="0" x2="50" y1="40" y2="40"/>`;
  s += `<line class="mark dash" x1="0" x2="50" y1="30" y2="30"/><line class="mark dash" x1="0" x2="50" y1="50" y2="50"/>`;
  s += `<text class="fl" x="25" y="3.1">Attacking this way ↑</text><text class="fl" x="25" y="78.1">Our try line</text>`;
  if (L.zigzag) s += zigzagSVG(F);
  for (const sl of lu.slots) {
    const p = playerById(sl.playerId);
    const g = p ? (p.gender === 'F' ? 'F' : p.gender === 'M' ? 'M' : 'U') : '';
    s += `<g class="slot ${p ? g.toLowerCase() : 'empty'}" data-slot="${sl.id}" transform="translate(${sl.x} ${sl.y})" ${interactive ? 'tabindex="0" role="button"' : ''} aria-label="${esc(sl.name)}: ${p ? esc(p.name) : 'empty'}">
      <circle class="hit" r="4"/><circle class="disc" r="2.7"/>
      <text class="lbl" dy="0.72">${esc(p ? (p.number || initials(p)) : sl.label)}</text>`;
    if (p) {
      s += `<circle class="gb ${g}" cx="2.1" cy="-2.1" r="1"/><text class="gl" x="2.1" y="-2.1" dy="0.46">${g === 'U' ? '?' : g}</text>`;
      s += `<text class="pos" y="-3.7">${esc(sl.label)}</text><text class="nm" y="4.9">${esc(shortName(p))}</text>`;
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
function bindField() {
  const svg = $('#field'); if (!svg || !isCoach()) return;
  let drag = null;
  const toSvg = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
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
    if (drag.x != null) { const sl = curLineup().slots.find(s => s.id === drag.id); sl.x = +drag.x.toFixed(1); sl.y = +drag.y.toFixed(1); save(); }
    drag = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => { if (state.moveMode) return; const g = e.target.closest('[data-slot]'); if (g) openAssign(g.dataset.slot); });
  svg.addEventListener('keydown', e => {
    const g = e.target.closest('[data-slot]'); if (!g) return;
    if (!state.moveMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openAssign(g.dataset.slot); return; }
    if (state.moveMode && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const sl = curLineup().slots.find(s => s.id === g.dataset.slot), d = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowUp') sl.y = clamp(sl.y - d, 1.5, 78.5);
      if (e.key === 'ArrowDown') sl.y = clamp(sl.y + d, 1.5, 78.5);
      if (e.key === 'ArrowLeft') sl.x = clamp(sl.x - d, 1.5, 48.5);
      if (e.key === 'ArrowRight') sl.x = clamp(sl.x + d, 1.5, 48.5);
      g.setAttribute('transform', `translate(${sl.x} ${sl.y})`); save();
    }
  });
}
function openAssign(slotId) {
  const lu = curLineup(), sl = lu.slots.find(s => s.id === slotId); if (!sl) return;
  const where = {}; lu.slots.forEach(s => { if (s.playerId) where[s.playerId] = s; });
  const rank = p => (p.status === 'available' ? 0 : 10) + (p.positions.includes(sl.group) ? 0 : 1) + (where[p.id] ? 2 : 0);
  const players = data.players.slice().sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const cur = playerById(sl.playerId);
  openSheet(`${sl.name} (${sl.label})`, `${cur ? `<button class="btn block" style="margin-bottom:12px" data-act="assign" data-slot="${sl.id}" data-pid="">Leave ${esc(sl.label)} empty</button>` : ''}
    ${players.length ? `<div class="list">${players.map(p => {
      const match = p.positions.includes(sl.group);
      const note = p.id === sl.playerId ? 'In this position now' : where[p.id] ? `Playing ${where[p.id].label}, will swap` : match ? `Plays ${sl.group.toLowerCase()}` : (p.positions.join(', ') || '');
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
const PLAY_CATS = ['Ruck', 'Edge', 'Switch', 'Finisher', 'Kick', 'Other'];
const MOVE_KINDS = { run: 'Run', pass: 'Pass', kick: 'Kick', dummy: 'Dummy pass' };
const STARTER_IDS = ['quickie-out', 'quickie-in', 'ninja', 'out-the-back', 'switch', 'finisher'];
const swapSlot = id => /^[LR][WLRM]$/.test(id) ? (id[0] === 'L' ? 'R' : 'L') + id[1] : id;
function mirrorText(text) {
  return String(text || '')
    .replace(/\b([LR])([WLRM])\b/g, (m, a, b) => (a === 'L' ? 'R' : 'L') + b)
    .replace(/\b(left|right|Left|Right)\b/g, w => ({ left: 'right', right: 'left', Left: 'Right', Right: 'Left' }[w]));
}
const defaultDefence = ry => ({ marker: [25, ry - 3], line: [3.6, 10.7, 17.9, 25, 32.1, 39.3, 46.4].map(x => [x, ry - 7]) });
const formation = (ry, rx = 25) => ({
  RM: [rx, ry], LM: [rx - 0.4, ry + 2.8],
  LR: [16.5, ry + 5], LL: [10, ry + 8], LW: [3.5, ry + 11],
  RR: [33, ry + 5], RL: [40, ry + 8], RW: [46.5, ry + 11]
});
const shiftY = (pts, dy) => pts.map(([x, y]) => [x, +(y + dy).toFixed(1)]);

function starterPlays() {
  const base = (id, name, category, when, steps, extra) => ({
    id, name, category, when, steps, side: 'right', builtin: true,
    players: formation(46), defence: defaultDefence(46), moves: [], focus: [], tags: {}, ...extra
  });
  const bounce = [{ t: 'run', pts: [[25, 46], [29, 50.4]] }, { t: 'pass', key: true, pts: [[24.6, 48.8], [28.4, 50.6]] }];
  const ruckView = { x0: 11, x1: 39, y0: 34, y1: 56 };   // zoom in on the ruck for the ruck plays
  const otb = [
    { t: 'pass', pts: [[24.6, 48.8], [32.2, 50.6]] },
    { t: 'run', pts: [[33, 51], [31.6, 41.6]] },
    { t: 'run', pts: [[40, 54], [36.4, 42.4]] },
    { t: 'run', key: true, curve: true, pts: [[25, 46], [27.6, 52.5], [33.5, 55.5], [38, 53]] },
    { t: 'pass', key: true, pts: [[31.9, 44.5], [37.7, 52.5]] }
  ];
  return [
    base('quickie-out', 'Quickie Out', 'Ruck', 'Tags 1–3, when their marker or the first defender beside the ruck is slow off the line.',
      'RM is tagged, plays the ball fast and bounces out to the right.\nLM, at dummy half, steps forward and gives a short pass back to RM.\nRM hits the gap between the marker and the next defender on the right.',
      { focus: ['RM'], ghost: ['RM'], view: ruckView, moves: [...bounce, { t: 'run', key: true, pts: [[29, 50.4], [29, 38.6]] }] }),
    base('quickie-in', 'Quickie In', 'Ruck', 'After a Quickie Out has worked, when the defence starts sliding with RM.',
      'RM plays the ball and bounces out to the right, as in the Quickie Out.\nLM steps forward and passes back to RM.\nRM cuts back inside, behind the marker, into the gap on the other side.',
      { focus: ['RM'], ghost: ['RM'], view: ruckView, moves: [...bounce, { t: 'run', key: true, curve: true, pts: [[29, 50.4], [27.8, 47.6], [23, 44.6], [21, 38.6]] }] }),
    base('ninja', 'Ninja', 'Ruck', 'Only after the Quickies have worked and the marker is chasing RM.',
      'RM plays the ball and runs the Quickie Out line as a decoy.\nLM, at dummy half, shows the pass to RM but keeps the ball.\nLM steps through the hole the marker leaves when it chases RM.',
      { focus: ['LM'], ghost: ['RM'], view: ruckView, defence: { ...defaultDefence(46), marker: [28.6, 43.4] },
        moves: [{ t: 'run', pts: [[25, 46], [29, 50.4], [30.4, 41.2]] }, { t: 'dummy', pts: [[24.6, 48.8], [27.8, 49.9]] }, { t: 'run', key: true, pts: [[24.6, 48.8], [23.8, 38.6]] }] }),
    base('out-the-back', 'Out the back', 'Edge', 'Tags 3–5, attacking the wider side of the ruck.',
      'RM plays the ball, then loops around behind RR and RL.\nLM, at dummy half, passes to RR.\nRR runs at the inside shoulder of their Rover to hold them.\nRL runs a short decoy line at the gap.\nRR passes behind RL to RM, who hits the gap with RW outside.',
      { focus: ['RM'], moves: [...otb, { t: 'run', key: true, pts: [[38, 53], [42.8, 38.6]] }, { t: 'run', pts: [[46.5, 57], [47, 43]] }] }),
    base('switch', 'Switch', 'Switch', 'When their defence has crowded one side and the other side is short of defenders. Called by the Rover.',
      'Our last plays went left, so their defence has crowded that side.\nRM plays the ball; LM, at dummy half, passes right to RR.\nRR draws the first defender and passes to RL.\nRL draws the last defender and passes to RW, who runs through.',
      { focus: ['RW'],
        players: { RM: [32, 46], LM: [31.4, 48.8], RR: [37, 51], RL: [42.2, 54], RW: [47.4, 57], LR: [24, 51], LL: [16, 54], LW: [7, 57] },
        defence: { marker: [32, 43], line: [[6, 39], [12, 39], [18, 39], [24, 39], [30.5, 39], [38.6, 39], [45.6, 39]] },
        moves: [
          { t: 'pass', pts: [[31.4, 48.8], [36.6, 50.6]] }, { t: 'run', pts: [[37, 51], [37.8, 44.5]] },
          { t: 'pass', key: true, pts: [[37.6, 46], [41.8, 50.6]] }, { t: 'run', pts: [[42.2, 54], [42.6, 46.2]] },
          { t: 'pass', key: true, pts: [[42.5, 48], [46.9, 52.2]] }, { t: 'run', key: true, pts: [[47.4, 57], [47.6, 38.4]] }
        ] }),
    base('finisher', 'Finisher', 'Finisher', 'Tag 5 or 6 inside their 14 m. RW must be a female player, for a 2-point try.',
      'RM plays the ball and loops; LM, at dummy half, passes to RR.\nRR runs at the inside shoulder; RL runs the short decoy line.\nRR passes behind RL to RM.\nRM draws the last defender and passes to RW, who scores in the corner.',
      { focus: ['RW'], tags: { RW: 'F' }, players: formation(24), defence: defaultDefence(24),
        moves: [
          ...otb.map(m => ({ ...m, pts: shiftY(m.pts, -22) })),
          { t: 'run', key: true, pts: [[38, 31], [42.4, 21]] },
          { t: 'pass', key: true, pts: [[42.4, 21.6], [46.6, 23.4]] },
          { t: 'run', key: true, pts: [[46.5, 35], [46.7, 23.4], [46.2, 4]] }
        ] })
  ];
}

function playGeom(play, side) {
  const flip = side !== (play.side || 'right');
  const P = pt => flip ? [+(50 - pt[0]).toFixed(2), pt[1]] : pt;
  const players = {}; Object.entries(play.players || {}).forEach(([id, pt]) => { players[flip ? swapSlot(id) : id] = P(pt); });
  const tags = {}; Object.entries(play.tags || {}).forEach(([id, v]) => { tags[flip ? swapSlot(id) : id] = v; });
  const focus = (play.focus || []).map(id => flip ? swapSlot(id) : id), ghost = (play.ghost || []).map(id => flip ? swapSlot(id) : id);
  const v = play.view, view = v ? (flip ? { ...v, x0: 50 - v.x1, x1: 50 - v.x0 } : v) : null;
  const d = play.defence || defaultDefence(46);
  return { flip, players, tags, focus, ghost, view, marker: d.marker ? P(d.marker) : null, line: (d.line || []).map(P), moves: (play.moves || []).map(m => ({ ...m, pts: m.pts.map(P) })) };
}
function pathD(pts, curve) {
  if (!curve || pts.length < 3) return 'M' + pts.map(p => p.join(' ')).join('L');
  let d = `M${pts[0].join(' ')}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1.map(n => n.toFixed(2)).join(' ')} ${c2.map(n => n.toFixed(2)).join(' ')} ${p2.join(' ')}`;
  }
  return d;
}
let svgSeq = 0;
function playSVG(play, side, opts = {}) {
  const g = playGeom(play, side), k = `p${++svgSeq}`;
  const pts = [...Object.values(g.players), ...g.moves.flatMap(m => m.pts), ...g.line, ...(g.marker ? [g.marker] : []), ...((opts.drawing && opts.drawing.pts) || [])];
  let y0 = Math.floor(Math.min(...pts.map(p => p[1])) - 4), y1 = Math.ceil(Math.max(...pts.map(p => p[1])) + 4);
  let x0 = -1, x1 = 51;
  if (g.view && !opts.full) ({ x0, x1, y0, y1 } = g.view);
  if (opts.full) { y0 = -1; y1 = 81; }
  y0 = Math.max(-1, y0); y1 = Math.min(81, y1);
  const F = fieldDims(V.team.field);
  let s = `<svg ${opts.svgId ? `id="${opts.svgId}"` : ''} class="field play ${opts.thumb ? 'thumb' : ''} ${opts.editor ? 'editor' : ''}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="img" aria-label="${esc(play.name || 'Play')}, attacking ${side}">`;
  s += `<defs><marker id="${k}-w" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#fff"/></marker><marker id="${k}-g" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#FFD24D"/></marker></defs>`;
  s += `<rect x="0" y="0" width="50" height="80" fill="var(--turf)"/>`;
  for (let y = 5, i = 0; y < 75; y += 5, i++) if (i % 2) s += `<rect x="0" y="${y}" width="50" height="5" fill="var(--turf-2)"/>`;
  s += `<rect x="0" y="0" width="50" height="5" fill="var(--turf-3)"/><rect x="0" y="75" width="50" height="5" fill="var(--turf-3)"/>`;
  [1, 2, 3, 4].forEach(i => { s += `<line class="ch-line${i === 2 || i === 3 ? ' red' : ''} faint" x1="${F.bounds[i]}" x2="${F.bounds[i]}" y1="5" y2="75"/>`; });
  s += `<rect class="mark" x="0" y="0" width="50" height="80"/><line class="mark" x1="0" x2="50" y1="5" y2="5"/><line class="mark" x1="0" x2="50" y1="75" y2="75"/><line class="mark" x1="0" x2="50" y1="40" y2="40"/>`;
  if (!opts.thumb && y0 < 4) s += `<text class="fl" x="25" y="3.1">Their try line ↑</text>`;
  g.line.forEach((p, i) => { s += `<g class="dfg" data-df="${i}" transform="translate(${p[0]} ${p[1]})"><circle class="df" r="1.4"/></g>`; });
  if (g.marker) s += `<g class="dfg" data-mk="1" transform="translate(${g.marker[0]} ${g.marker[1]})"><circle class="df mk" r="1.4"/></g>`;
  g.moves.forEach((m, i) => {
    s += `<path class="mv ${m.t} ${m.key ? 'key' : ''}" d="${pathD(m.pts, m.curve)}" ${m.t === 'dummy' ? '' : `marker-end="url(#${k}-${m.key ? 'g' : 'w'})"`}${opts.editor ? ` data-mv="${i}"` : ''}/>`;
  });
  if (opts.drawing && opts.drawing.pts.length) {
    s += `<path class="mv draft" d="${pathD(opts.drawing.pts, opts.drawing.curve)}"/>`;
    opts.drawing.pts.forEach(p => { s += `<circle class="draft-pt" cx="${p[0]}" cy="${p[1]}" r=".7"/>`; });
  }
  Object.entries(g.players).forEach(([id, p]) => {
    const tag = g.tags[id];
    s += `<g class="plg" data-pl="${id}" transform="translate(${p[0]} ${p[1]})"><circle class="pl ${g.focus.includes(id) ? 'focus' : ''} ${g.ghost.includes(id) ? 'ghost' : ''}" r="1.8"/>${opts.thumb ? '' : `<text class="plt" dy=".45">${id}</text>`}${tag ? `<circle class="tg" cx="1.5" cy="-1.5" r=".8"/><text class="tgt" x="1.5" y="-1.5" dy=".35">${esc(tag)}</text>` : ''}</g>`;
  });
  return s + '</svg>';
}
const playById = id => V.plays.find(p => p.id === id);
const playSteps = (play, side) => {
  const text = side !== (play.side || 'right') ? mirrorText(play.steps) : play.steps;
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
};
const playWhen = (play, side) => side !== (play.side || 'right') ? mirrorText(play.when) : (play.when || '');

function viewPlays() {
  const coach = isCoach();
  if (state.playId && playById(state.playId)) return viewPlay(playById(state.playId));
  state.playId = null;
  const missing = STARTER_IDS.filter(id => !V.plays.some(p => p.id === id)).length;
  return `<div class="sec-h"><h2>Plays</h2>${coach ? `<button class="btn primary sm" data-act="play-new">${icon('plus', 18)}New play</button>` : ''}</div>
    <p class="hint" style="margin:-4px 0 12px">Every play works both ways. Open one and switch between attacking left and right.</p>
    ${V.plays.length ? `<div class="list">${V.plays.map(p => `<button class="play-row" data-act="play-open" data-id="${esc(p.id)}">
      <span class="play-thumb">${playSVG(p, state.playSide, { thumb: true })}</span>
      <span class="grow"><span class="name" style="display:block">${esc(p.name)}</span><span class="sub play-when">${esc(playWhen(p, state.playSide))}</span></span>
      <span class="pill neutral">${esc(p.category || 'Other')}</span>
    </button>`).join('')}</div>` : `<div class="empty"><p>${coach ? 'No plays yet. Add one, or restore the starter plays.' : 'No plays yet.'}</p></div>`}
    ${coach && missing ? `<button class="link-btn" data-act="plays-restore">Restore the ${missing} missing starter play${missing === 1 ? '' : 's'}</button>` : ''}`;
}
function viewPlay(p) {
  const side = state.playSide, coach = isCoach(), steps = playSteps(p, side), when = playWhen(p, side);
  const kinds = new Set(p.moves.map(m => m.t));
  const sw = (cls, dash, colour) => `<svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${colour}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>${cls === 'dummy' ? '' : `<path d="M20 1L25 5L20 9z" fill="${colour}"/>`}</svg>`;
  return `<button class="toggle-past" data-act="play-back">← All plays</button>
    <div class="sec-h"><h2>${esc(p.name)}</h2><span class="pill neutral">${esc(p.category || 'Other')}</span></div>
    <div class="seg" role="group" aria-label="Direction">
      <button data-act="play-side" data-side="left" aria-pressed="${side === 'left'}">Attacking left</button>
      <button data-act="play-side" data-side="right" aria-pressed="${side === 'right'}">Attacking right</button>
    </div>
    <div class="field-wrap">${playSVG(p, side)}</div>
    <div class="legend play-legend">
      ${kinds.has('run') ? `<span>${sw('run', '', '#5B6861')}Run</span>` : ''}
      ${kinds.has('pass') ? `<span>${sw('pass', '4 3', '#5B6861')}Pass</span>` : ''}
      ${kinds.has('kick') ? `<span>${sw('kick', '1 3', '#5B6861')}Kick</span>` : ''}
      ${kinds.has('dummy') ? `<span>${sw('dummy', '3 3', '#5B6861')}Dummy pass</span>` : ''}
      <span>${sw('key', '', '#E3A400')}The key move</span>
      <span><i style="background:#fff;border:1.5px solid #5B6861;border-radius:50%"></i>Defender</span>
    </div>
    ${when ? `<section class="sec" style="margin-top:16px"><h3 class="play-h">When to use it</h3><p>${esc(when)}</p></section>` : ''}
    ${steps.length ? `<section class="sec"><h3 class="play-h">Steps</h3><ol class="steps">${steps.map(l => `<li>${esc(l)}</li>`).join('')}</ol></section>` : ''}
    ${coach ? `<div class="btn-row"><button class="btn" data-act="play-edit" data-id="${esc(p.id)}">Edit</button><button class="btn" data-act="play-dup" data-id="${esc(p.id)}">${icon('copy', 18)}Duplicate</button><button class="btn wa" data-act="play-share" data-id="${esc(p.id)}">${icon('chat', 18)}Send</button></div>
      <button class="btn danger block" style="margin-top:10px" data-act="play-del" data-id="${esc(p.id)}">Delete this play</button>` : ''}`;
}

/* ----- Play editor (coach) ----- */
function blankPlay() {
  return { id: uid(), name: '', category: 'Other', when: '', steps: '', side: 'right', builtin: false,
    players: formation(46), defence: defaultDefence(46), moves: [], focus: [], tags: {} };
}
function openPlayEditor(play) {
  const draft = JSON.parse(JSON.stringify(play || blankPlay()));
  if (draft.side && draft.side !== 'right') {   // edit everything in the attacking-right orientation
    const g = playGeom(draft, 'right');
    Object.assign(draft, { side: 'right', players: g.players, tags: g.tags, focus: g.focus, moves: g.moves, defence: { marker: g.marker, line: g.line }, steps: mirrorText(draft.steps), when: mirrorText(draft.when) });
  }
  if (!draft.defence) draft.defence = defaultDefence(46);
  state.ped = { draft, tool: 'run', key: false, curve: false, drawing: null, isNew: !play };
  const slots = SLOT_DEFS.map(s => s.id);
  openSheet(play ? `Edit ${play.name}` : 'New play', `<form data-form="play" autocomplete="off">
    <label class="field-l"><span>Name</span><input type="text" name="name" required value="${esc(draft.name)}" placeholder="e.g. Blind-side wrap"></label>
    <label class="field-l"><span>Type</span><select name="category">${PLAY_CATS.map(c => `<option ${c === draft.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field-l"><span>When to use it</span><input type="text" name="when" value="${esc(draft.when)}" placeholder="e.g. Tag 5 inside their 14 m"></label>
    <label class="field-l"><span>Steps, one per line</span><textarea name="steps" rows="5" placeholder="Use LW, LL, LR, LM, RM, RR, RL, RW so the left version swaps them automatically.">${esc(draft.steps)}</textarea></label>
    <h3 class="form-sec">Diagram</h3>
    <p class="hint" style="margin:-4px 0 10px">Draw it attacking right; the app makes the left version. Pick a line type, tap where it starts (on a player to start from them), tap each point it passes, then tap Finish line.</p>
    <div class="seg ped-tools" id="ped-tools">${pedToolButtons()}</div>
    <div class="opts" style="margin-bottom:10px">
      <label class="opt"><input type="checkbox" data-change="ped-key"><span>Key move (gold)</span></label>
      <label class="opt"><input type="checkbox" data-change="ped-curve"><span>Curved</span></label>
    </div>
    <div class="field-wrap" id="ped-field"></div>
    <div class="btn-row" style="margin-top:10px"><button type="button" class="btn" data-act="ped-finish">Finish line</button><button type="button" class="btn" data-act="ped-undo">Undo</button></div>
    <div id="ped-moves" style="margin-top:10px"></div>
    <details class="more"><summary>Highlight players</summary>
      <p class="muted small" style="margin-bottom:8px">Gold players are the ones to watch. F marks a female finisher.</p>
      <div class="opts" style="margin-bottom:8px">${slots.map(id => `<label class="opt"><input type="checkbox" data-change="ped-focus" value="${id}" ${draft.focus.includes(id) ? 'checked' : ''}><span>${id}</span></label>`).join('')}</div>
      <div class="opts">${slots.map(id => `<label class="opt"><input type="checkbox" data-change="ped-tag" value="${id}" ${draft.tags[id] === 'F' ? 'checked' : ''}><span>${id} F</span></label>`).join('')}</div>
    </details>
    <button class="btn primary block" type="submit" style="margin-top:16px">Save play</button>
  </form>`, 'play-editor');
  refreshPlayEditor();
}
function pedToolButtons() {
  const t = state.ped.tool;
  return [['move', 'Move'], ['run', 'Run'], ['pass', 'Pass'], ['kick', 'Kick'], ['dummy', 'Dummy']].map(([k, l]) => `<button type="button" data-act="ped-tool" data-t="${k}" aria-pressed="${t === k}">${l}</button>`).join('');
}
function refreshPlayEditor() {
  const E = state.ped; if (!E) return;
  const f = $('#ped-field'); if (!f) return;
  f.innerHTML = playSVG(E.draft, 'right', { full: true, editor: true, svgId: 'ped-svg', drawing: E.drawing ? { ...E.drawing, curve: E.curve } : null });
  $('#ped-tools').innerHTML = pedToolButtons();
  $('#ped-moves').innerHTML = E.draft.moves.length ? `<div class="list">${E.draft.moves.map((m, i) => `<div class="row" style="padding:6px 6px 6px 12px"><span class="grow small">${i + 1}. ${MOVE_KINDS[m.t] || m.t}${m.key ? ', key' : ''}${m.curve ? ', curved' : ''}</span><button type="button" class="btn sm danger" data-act="ped-del-move" data-i="${i}">Remove</button></div>`).join('')}</div>`
    : `<p class="muted small">No lines yet.</p>`;
  bindPlayEditor();
}
function bindPlayEditor() {
  const svg = $('#ped-svg'); if (!svg) return;
  const E = state.ped; let drag = null;
  const at = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [clamp(+q.x.toFixed(1), 0, 50), clamp(+q.y.toFixed(1), 0, 80)]; };
  svg.addEventListener('pointerdown', e => {
    if (E.tool !== 'move') return;
    const t = e.target.closest('[data-pl],[data-df],[data-mk]'); if (!t) return;
    e.preventDefault(); drag = { el: t, ds: { ...t.dataset } };
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });
  svg.addEventListener('pointermove', e => { if (!drag) return; drag.p = at(e); drag.el.setAttribute('transform', `translate(${drag.p[0]} ${drag.p[1]})`); });
  const end = () => {
    if (!drag) return;
    const { ds, p } = drag; drag = null; if (!p) return;
    if (ds.pl) E.draft.players[ds.pl] = p;
    else if (ds.df !== undefined) E.draft.defence.line[Number(ds.df)] = p;
    else if (ds.mk) E.draft.defence.marker = p;
    refreshPlayEditor();
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('click', e => {
    if (E.tool === 'move') return;
    let p = at(e);
    if (!E.drawing) {
      const near = Object.values(E.draft.players).map(q => ({ q, d: Math.hypot(q[0] - p[0], q[1] - p[1]) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 3) p = near.q.slice();
      E.drawing = { pts: [] };
    }
    E.drawing.pts.push(p); refreshPlayEditor();
  });
}
function finishPlayLine() {
  const E = state.ped; if (!E || !E.drawing) return false;
  if (E.drawing.pts.length >= 2) E.draft.moves.push({ t: E.tool, pts: E.drawing.pts, ...(E.key ? { key: true } : {}), ...(E.curve ? { curve: true } : {}) });
  E.drawing = null; return true;
}
function playShareText(p, side) {
  const steps = playSteps(p, side), when = playWhen(p, side);
  return `🏉 *${p.name}* (attacking ${side})${when ? `\n${when}` : ''}\n\n${steps.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
}

/* ---------- Messages (coach) ---------- */
const TEMPLATES = { reminder: 'Training reminder', cancelled: 'Training cancelled', lineup: 'Lineup', countdown: 'Countdown', invite: 'App invite', blank: 'Blank' };
function buildTemplate(t) {
  const T = data.team, s = sessionById(state.msgSession) || nextSession();
  if (t === 'reminder') {
    if (!s) return `🏉 *Training — ${T.name}*\n\n(Add a training session first and it will fill in here.)`;
    return `🏉 *Training — ${T.name}*\n📅 ${fmtLong(s.date)}\n⏰ ${fmtRange(s)}\n📍 ${s.venue || T.trainingVenue || 'TBC'}${s.focus ? `\n🎯 Focus: ${s.focus}` : ''}${s.notes ? `\n📝 ${s.notes}` : ''}\n\nReply 👍 if you're coming, or let me know if you can't make it.`;
  }
  if (t === 'cancelled') return s ? `⚠️ *Training cancelled*\nTraining on ${fmtLong(s.date)} (${fmtRange(s)}) is off.\n\nReason: \n\nSee you at the next one.` : `⚠️ *Training cancelled*\n\n`;
  if (t === 'lineup') return lineupText(curLineup());
  if (t === 'countdown') { const cd = countdown(); const d = cd && cd.state === 'before' ? cd.days : 0; return `⏳ *${d} days* until ${T.event} in Coffs Harbour (${fmtEventDates()}).\n\nEvery session counts from here. Let's keep turning up. 💪`; }
  if (t === 'invite') return `👋 Here's the ${T.name} team app: training times, lineups and notices.\n\n${inviteLink()}\n\nOpen it on your phone, then use "Add to Home Screen". Please keep this link within the team.`;
  return '';
}
function viewMessages() {
  if (state.msgDraft === null) state.msgDraft = buildTemplate(state.msgTpl);
  const needsSession = state.msgTpl === 'reminder' || state.msgTpl === 'cancelled';
  const sessions = upcomingSessions().filter(s => !s.cancelled || state.msgTpl === 'cancelled');
  if (needsSession && !state.msgSession && sessions[0]) state.msgSession = sessions[0].id;
  const canPost = state.msgTpl !== 'invite';
  return `<section class="sec"><div class="sec-h"><h2>New message</h2></div>
    <div class="chips">${Object.entries(TEMPLATES).filter(([k]) => !(S.trial && k === 'invite')).map(([k, l]) => `<button class="chip" data-act="tpl" data-t="${k}" aria-pressed="${state.msgTpl === k}">${l}</button>`).join('')}</div>
    ${needsSession && sessions.length ? `<label class="field-l"><span>Session</span><select data-change="msg-session">${sessions.map(s => `<option value="${s.id}" ${s.id === state.msgSession ? 'selected' : ''}>${esc(fmtDay(s.date))}, ${esc(fmtRange(s))}</option>`).join('')}</select></label>` : ''}
    <textarea id="msg" data-input="msg" aria-label="Message">${esc(state.msgDraft)}</textarea>
    ${canPost ? `<label class="check" style="margin-top:10px"><input type="checkbox" data-change="post-notice" ${state.postNotice ? 'checked' : ''}> Also post it on the app's noticeboard</label>` : '<p class="hint">The invite link opens the app without typing the team password. Only send it to the team group.</p>'}
    <div class="btn-row" style="margin-top:10px">
      <button class="btn wa" data-act="wa-send">${icon('chat', 18)}Open in WhatsApp</button>
      ${navigator.share ? `<button class="btn" data-act="share-send">${icon('share', 18)}Share</button>` : ''}
      <button class="btn" data-act="copy-msg">${icon('copy', 18)}Copy</button>
    </div>
    <p class="hint">WhatsApp opens with the message ready. Choose your team group, check it and send. *Stars* make text bold in WhatsApp.</p>
  </section>
  <section class="sec"><div class="sec-h"><h2>Noticeboard</h2><button class="btn sm" data-act="add-notice">${icon('plus', 18)}Post</button></div>
    ${data.notices.length ? `<div class="list">${data.notices.map(n => `<div class="notice"><span class="sub">${esc(fmtStamp(n.at))}</span><p>${esc(n.text)}</p>
      <button class="btn sm danger" data-act="del-notice" data-id="${n.id}">Take down</button></div>`).join('')}</div>` : `<p class="muted small">Players see notices on their home screen.</p>`}
  </section>
  <section class="sec"><div class="sec-h"><h2>Sent from here</h2></div>
    ${data.messages.length ? `<div class="list">${data.messages.slice(0, 30).map(m => `<div class="msg-item">
      <span class="sub">${esc(fmtStamp(m.at))}${m.to ? ` — to ${esc(m.to)}` : ''}</span>
      <p class="preview">${esc(m.text)}</p>
      <div class="btn-row" style="justify-content:flex-start"><button class="btn sm" style="flex:0" data-act="reuse" data-id="${m.id}">Use again</button><button class="btn sm danger" style="flex:0" data-act="del-msg" data-id="${m.id}">Remove</button></div>
    </div>`).join('')}</div>` : `<p class="muted small">Messages you send from here are kept for reference. Only coaches see this list.</p>`}
  </section>`;
}
function logMessage(text, to) {
  data.messages.unshift({ id: uid(), at: new Date().toISOString(), text, to });
  data.messages = data.messages.slice(0, 100);
  save();
}
function postNotice(text) {
  data.notices.unshift({ id: uid(), at: new Date().toISOString(), text });
  data.notices = data.notices.slice(0, 50);
}
function openWhatsApp(text, phone) {
  const a = document.createElement('a');
  a.href = (phone ? `https://wa.me/${waNumber(phone)}` : 'https://wa.me/') + '?text=' + encodeURIComponent(text);
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Settings ---------- */
function settingsBody() {
  if (S.role === 'player') {
    return `<p class="muted" style="margin-bottom:14px">You're signed in as a player. Your coach updates everything here; pull fresh changes any time.</p>
      <div class="btn-row"><button class="btn dark" data-act="refresh">Check for updates</button></div>
      <h3 class="form-sec">This phone</h3>
      <button class="btn danger block" data-act="sign-out">Sign out</button>`;
  }
  const T = data.team;
  return `<form data-form="settings">
    <h3 class="form-sec">Team and tournament</h3>
    <label class="field-l"><span>Team name</span><input type="text" name="name" value="${esc(T.name)}"></label>
    <label class="field-l"><span>Tournament</span><input type="text" name="event" value="${esc(T.event)}"></label>
    <div class="two">
      <label class="field-l"><span>Starts</span><input type="date" name="eventStart" value="${esc(T.eventStart)}"></label>
      <label class="field-l"><span>Ends</span><input type="date" name="eventEnd" value="${esc(T.eventEnd)}"></label>
    </div>
    <p class="note">The 2027 dates are a placeholder. Check them against the official draw and update them here.</p>
    <label class="field-l"><span>Tournament venue</span><input type="text" name="venue" value="${esc(T.venue)}"></label>
    <label class="field-l"><span>Max males on field</span><input type="number" name="maxMales" min="0" max="8" value="${esc(T.maxMales)}"><small>Mixed Oztag allows up to 4 of the 8 on field.</small></label>
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
    <label class="field-l"><span>Position groups</span><input type="text" name="positions" value="${esc(T.positions.join(', '))}"><small>Preferred-position options for players. Separate with commas.</small></label>
    <button class="btn primary block" type="submit">Save settings</button>
  </form>
  ${S.trial ? trialSettings() : liveSettings()}`;
}
function trialSettings() {
  return `<h3 class="form-sec">Going live</h3>
  <p class="muted small" style="margin-bottom:10px">You're in test mode: everything is saved on this phone only and nobody else can see it. When you're ready to share the app with players, go live. You'll choose a coach password and a team password, and connect GitHub so the app can publish.</p>
  <button class="btn primary block" data-act="go-live">Go live</button>
  <button class="btn block" data-act="preview-on" style="margin-top:10px">${icon('eye', 18)}See what players will see</button>

  <h3 class="form-sec">Backup</h3>
  <p class="muted small" style="margin-bottom:10px">Test-mode backups aren't encrypted, so keep the file private. It includes any phone numbers you've entered.</p>
  <div class="btn-row"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>

  <h3 class="form-sec">This phone</h3>
  <button class="btn danger block" data-act="start-over">Start the squad over</button>
  <p class="hint">Clears players, sessions, lineups, notices and messages. Team settings stay.</p>`;
}
function liveSettings() {
  return `<h3 class="form-sec">Players' access</h3>
  <p class="muted small" style="margin-bottom:10px">Players open the app with the team password or the invite link. They see names, numbers, positions, the schedule, lineups and notices. Phone numbers, injuries, notes and attendance stay coach only.</p>
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

  <h3 class="form-sec">Backup</h3>
  <p class="muted small" style="margin-bottom:10px">Exports an encrypted copy that opens with the coach password.</p>
  <div class="btn-row"><button class="btn" data-act="export">Export backup</button><button class="btn" data-act="import">Import backup</button></div>

  <h3 class="form-sec">This phone</h3>
  <div class="btn-row"><button class="btn" data-act="sign-out">Sign out</button></div>
  <button class="btn danger block" style="margin-top:10px" data-act="start-over">Start the squad over</button>
  <p class="hint">Clears players, sessions, lineups, notices and messages. Team settings and passwords stay.</p>`;
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
      <p class="muted small" style="margin-bottom:10px">Shared with players. Shows the schedule, squad names, lineups and notices only. At least 8 characters.</p>
      <label class="field-l"><span>Team password</span><input type="password" name="team" required minlength="8" autocomplete="new-password"></label>
      <label class="field-l"><span>Type it again</span><input type="password" name="team2" required autocomplete="new-password"></label>
      <label class="check"><input type="checkbox" name="remember" checked> Keep me signed in on this phone</label>
      <p class="note" id="go-live-msg" hidden></p>
      <button class="btn primary block" type="submit">Set passwords and continue</button>
    </form>`, 'go-live');
}
function openGithubSheet() { openSheet('Connect GitHub', githubSection() + `<p class="hint">The README in the repository walks through creating the token.</p>`, 'github'); }
function openConflictSheet() {
  openSheet('Changed on another device', `<p style="margin-bottom:14px">${esc(S.pubMsg || 'The team was changed from another device.')} Choose which version to keep.</p>
    <div class="list">
      <button class="pick" data-act="load-latest"><span class="grow"><span class="name" style="display:block">Use the latest published version</span><span class="tagline">Replaces this phone's unpublished changes.</span></span></button>
      <button class="pick" data-act="force-publish"><span class="grow"><span class="name" style="display:block">Publish this phone's version</span><span class="tagline">Replaces the changes made on the other device.</span></span></button>
    </div>`, 'conflict');
}

/* ---------- sheet + toast ---------- */
let lastFocus = null;
function openSheet(title, body, key = null) {
  lastFocus = document.activeElement;
  const sh = $('#sheet');
  sh.innerHTML = `<div class="backdrop" data-act="close-sheet"></div>
    <div class="panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="panel-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Close">${icon('close', 22)}</button></div>
      <div class="panel-body">${body}</div></div>`;
  sh.hidden = false; document.body.classList.add('locked'); state.sheet = key;
  setTimeout(() => { const b = sh.querySelector('.panel-head .icon-btn'); if (b) b.focus(); }, 30);
}
function closeSheet() {
  const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; document.body.classList.remove('locked'); state.sheet = null;
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
  const pick = { LW: 'Chloe', LL: 'Ava', LR: 'Jade', LM: 'Mia', RM: 'Josh', RR: 'Kai', RL: 'Isaac', RW: 'Jayden' };
  data.lineups[0].slots.forEach(s => { s.playerId = byName(pick[s.id]); });
  if (!data.team.trainingVenue) data.team.trainingVenue = 'Home ground, field 2';
  save(); state.msgDraft = null; render(); toast('Sample squad loaded');
}

/* =========================================================
   EVENTS
   ========================================================= */
const coachOnly = fn => (...a) => { if (isCoach()) return fn(...a); };
const actions = {
  'tab': el => { if (el.dataset.tab === 'plays') state.playId = null; state.tab = el.dataset.tab; history.replaceState(null, '', '#' + state.tab); closeSheet(); render(); window.scrollTo(0, 0); },
  'close-sheet': () => closeSheet(),
  'settings': () => openSheet('Settings', settingsBody(), 'settings'),
  'lock-mode': el => { state.lockMode = el.dataset.mode; state.lockMsg = ''; renderLock(); },
  'refresh': async () => {
    try { await openPlayer(S.teamLock, false); closeSheet(); render(); toast('Up to date'); }
    catch (e) { if (e.code === 'WRONG') { toast('The team password has changed. Ask your coach for the new one.'); setTimeout(signOutNow, 1800); } else toast(e.message || "Couldn't check for updates"); }
  },
  'sign-out': () => {
    if (S.role === 'coach' && S.dirty && !confirm("Some changes haven't been published yet. They stay saved (encrypted) on this phone. Sign out anyway?")) return;
    signOutNow();
  },

  'sample': coachOnly(() => loadSample()),
  'add-player': coachOnly(() => openSheet('Add player', playerForm(null))),
  'bulk-add': coachOnly(() => openSheet('Paste a list', bulkForm())),
  'edit-player': coachOnly(el => { const p = playerById(el.dataset.id); if (p) openSheet(p.name, playerForm(p)); }),
  'delete-player': coachOnly(el => {
    const p = playerById(el.dataset.id); if (!p || !confirm(`Remove ${p.name} from the squad?`)) return;
    data.players = data.players.filter(x => x.id !== p.id);
    data.lineups.forEach(l => l.slots.forEach(s => { if (s.playerId === p.id) s.playerId = null; }));
    save(); closeSheet(); render(); toast(`${p.name} removed`);
  }),
  'squad-filter': el => { state.squadFilter = el.dataset.f; render(); },
  'wa-player': coachOnly(el => { const p = playerById(el.dataset.id); if (!p || !p.phone) return; const text = `Hi ${firstName(p)}, `; logMessage(text, p.name); openWhatsApp(text, p.phone); }),

  'train-view': el => { state.tab = 'training'; state.trainingView = el.dataset.v; render(); },
  'attendance': coachOnly(() => { state.tab = 'training'; state.trainingView = 'attendance'; history.replaceState(null, '', '#training'); render(); window.scrollTo(0, 0); }),
  'toggle-past': () => { state.showPast = !state.showPast; render(); },
  'add-session': coachOnly(() => openSheet('Add training', sessionForm(null))),
  'edit-session': coachOnly(el => { const s = sessionById(el.dataset.id); if (s) openSheet(fmtLong(s.date), sessionForm(s)); }),
  'delete-session': coachOnly(el => {
    const s = sessionById(el.dataset.id); if (!s || !confirm(`Delete training on ${fmtLong(s.date)}${rollTaken(s) ? ' and its roll call' : ''}?`)) return;
    data.sessions = data.sessions.filter(x => x.id !== s.id); save(); closeSheet(); render(); toast('Session deleted');
  }),
  'cancel-session': coachOnly(el => {
    const s = sessionById(el.dataset.id); if (!s) return;
    s.cancelled = !s.cancelled; save(); closeSheet(); render();
    if (s.cancelled && s.date >= todayISO() && confirm('Session marked cancelled. Write a message to let the team know?')) {
      state.tab = 'messages'; state.msgTpl = 'cancelled'; state.msgSession = s.id; state.msgDraft = buildTemplate('cancelled'); history.replaceState(null, '', '#messages'); render();
    }
  }),
  'remind': coachOnly(el => { state.tab = 'messages'; state.msgTpl = 'reminder'; state.msgSession = el.dataset.id; state.msgDraft = buildTemplate('reminder'); history.replaceState(null, '', '#messages'); render(); window.scrollTo(0, 0); }),
  'roll': coachOnly(el => { const s = sessionById(el.dataset.id); if (!s) return; if (!data.players.length) { toast('Add players to your squad first'); return; } openSheet('Roll call', rollBody(s.id), 'roll'); }),
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
    data.players.forEach(p => { if (!s.attendance[p.id] && p.status === 'available') s.attendance[p.id] = 'present'; });
    save(); $('#sheet .panel-body').innerHTML = rollBody(s.id);
  }),
  'roll-done': coachOnly(el => {
    const s = sessionById(el.dataset.sid); if (!s) return;
    data.players.forEach(p => { if (!s.attendance[p.id]) s.attendance[p.id] = 'absent'; });
    save(); closeSheet(); render(); toast('Roll call saved');
  }),

  'lineup-menu': coachOnly(() => lineupMenu()),
  'layer': el => { const k = el.dataset.k; state.layers[k] = !state.layers[k]; store.set('tm-field-layers', JSON.stringify(state.layers)); render(); },
  'play-open': el => { state.playId = el.dataset.id; render(); window.scrollTo(0, 0); },
  'play-back': () => { state.playId = null; render(); window.scrollTo(0, 0); },
  'play-side': el => { state.playSide = el.dataset.side; render(); },
  'play-new': coachOnly(() => openPlayEditor(null)),
  'play-edit': coachOnly(el => { const p = playById(el.dataset.id); if (p) openPlayEditor(p); }),
  'play-dup': coachOnly(el => {
    const p = playById(el.dataset.id); if (!p) return;
    const copy = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: `${p.name} (copy)`, builtin: false };
    data.plays.splice(data.plays.indexOf(p) + 1, 0, copy); state.playId = copy.id; save(); render(); toast('Play duplicated');
  }),
  'play-del': coachOnly(el => {
    const p = playById(el.dataset.id); if (!p || !confirm(`Delete “${p.name}”?${p.builtin ? ' You can restore the starter plays later.' : ''}`)) return;
    data.plays = data.plays.filter(x => x.id !== p.id); state.playId = null; save(); render(); toast('Play deleted');
  }),
  'play-share': coachOnly(el => { const p = playById(el.dataset.id); if (!p) return; const t = playShareText(p, state.playSide); logMessage(t, 'WhatsApp'); openWhatsApp(t); }),
  'plays-restore': coachOnly(() => {
    const starters = starterPlays(), have = new Set(data.plays.map(p => p.id));
    const add = starters.filter(p => !have.has(p.id));
    data.plays = [...starters.filter(p => add.includes(p)), ...data.plays].sort((a, b) => (STARTER_IDS.indexOf(a.id) + 1 || 99) - (STARTER_IDS.indexOf(b.id) + 1 || 99));
    save(); render(); toast(`${add.length} starter play${add.length === 1 ? '' : 's'} restored`);
  }),
  'ped-tool': coachOnly(el => { state.ped.tool = el.dataset.t; state.ped.drawing = null; refreshPlayEditor(); }),
  'ped-finish': coachOnly(() => { if (!finishPlayLine()) toast('Tap on the field to start a line'); refreshPlayEditor(); }),
  'ped-undo': coachOnly(() => {
    const E = state.ped;
    if (E.drawing && E.drawing.pts.length) { E.drawing.pts.pop(); if (!E.drawing.pts.length) E.drawing = null; }
    else E.draft.moves.pop();
    refreshPlayEditor();
  }),
  'ped-del-move': coachOnly(el => { state.ped.draft.moves.splice(Number(el.dataset.i), 1); refreshPlayEditor(); }),
  'move-mode': coachOnly(el => { state.moveMode = el.dataset.on === '1'; render(); }),
  'shape': coachOnly(el => { const sh = SHAPES[el.dataset.shape]; curLineup().slots.forEach(s => { if (sh[s.id]) { s.x = sh[s.id][0]; s.y = sh[s.id][1]; } }); save(); render(); }),
  'assign': coachOnly(el => {
    const lu = curLineup(), sl = lu.slots.find(s => s.id === el.dataset.slot), pid = el.dataset.pid || null;
    if (pid) { const other = lu.slots.find(s => s.playerId === pid && s.id !== sl.id); if (other) other.playerId = sl.playerId; }
    sl.playerId = pid; save(); closeSheet(); render();
    const max = Number(data.team.maxMales) || 4, males = lu.slots.filter(s => (playerById(s.playerId) || {}).gender === 'M').length;
    if (males > max) toast(`Heads up: ${males} males on field (max ${max})`);
  }),
  'lineup-new': coachOnly(() => { const name = prompt('Name for the new lineup', `Lineup ${data.lineups.length + 1}`); if (!name) return; const l = makeLineup(name.trim()); data.lineups.push(l); state.lineupId = l.id; save(); closeSheet(); render(); }),
  'lineup-dup': coachOnly(() => { const lu = curLineup(); const l = JSON.parse(JSON.stringify(lu)); l.id = uid(); l.name = lu.name + ' (copy)'; data.lineups.push(l); state.lineupId = l.id; save(); closeSheet(); render(); }),
  'lineup-rename': coachOnly(() => { const lu = curLineup(); const name = prompt('Rename lineup', lu.name); if (!name) return; lu.name = name.trim(); save(); closeSheet(); render(); }),
  'lineup-clear': coachOnly(() => { if (!confirm('Take everyone off the field in this lineup?')) return; curLineup().slots.forEach(s => { s.playerId = null; }); save(); closeSheet(); render(); }),
  'lineup-del': coachOnly(() => { const lu = curLineup(); if (!confirm(`Delete “${lu.name}”?`)) return; data.lineups = data.lineups.filter(l => l.id !== lu.id); state.lineupId = data.lineups[0].id; save(); closeSheet(); render(); }),
  'lineup-share': coachOnly(() => { state.tab = 'messages'; state.msgTpl = 'lineup'; state.msgDraft = buildTemplate('lineup'); history.replaceState(null, '', '#messages'); render(); window.scrollTo(0, 0); }),

  'tpl': coachOnly(el => { state.msgTpl = el.dataset.t; state.msgDraft = buildTemplate(state.msgTpl); render(); }),
  'wa-send': coachOnly(() => {
    const t = state.msgDraft.trim(); if (!t) { toast('Write a message first'); return; }
    if (state.postNotice && state.msgTpl !== 'invite') postNotice(t);
    logMessage(t, 'WhatsApp'); openWhatsApp(t); render();
  }),
  'share-send': coachOnly(async () => {
    const t = state.msgDraft.trim(); if (!t) { toast('Write a message first'); return; }
    try { await navigator.share({ text: t }); if (state.postNotice && state.msgTpl !== 'invite') postNotice(t); logMessage(t, 'Shared'); render(); } catch (e) { /* cancelled */ }
  }),
  'copy-msg': coachOnly(() => { if (state.msgDraft.trim()) copyText(state.msgDraft); }),
  'reuse': coachOnly(el => { const m = data.messages.find(x => x.id === el.dataset.id); if (!m) return; state.msgTpl = 'blank'; state.msgDraft = m.text; render(); window.scrollTo(0, 0); }),
  'del-msg': coachOnly(el => { data.messages = data.messages.filter(x => x.id !== el.dataset.id); save(); render(); }),
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
    const file = S.trial ? data : await seal(data, S.coachLock, 'coach');
    const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `team-backup-${todayISO()}.json`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Encrypted backup exported');
  }),
  'import': coachOnly(() => $('#import-file').click()),
  'start-over': coachOnly(() => {
    if (!confirm('Clear the squad, sessions, lineups, notices and messages? Players will see an empty team once this publishes.')) return;
    const fresh = defaultData();
    Object.assign(data, { players: [], sessions: [], lineups: fresh.lineups, notices: [], messages: [] });
    state.lineupId = null; state.msgDraft = null; save(); closeSheet(); render(); toast('Squad cleared');
  })
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = actions[el.dataset.act]; if (!fn) return;
  e.preventDefault(); fn(el, e);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
document.addEventListener('input', e => {
  const k = e.target.dataset.input; if (!k) return;
  if (k === 'squad-search') { state.squadSearch = e.target.value; const l = $('#squad-list'); if (l) l.innerHTML = squadList(); }
  if (k === 'msg') state.msgDraft = e.target.value;
});
document.addEventListener('change', e => {
  const k = e.target.dataset.change; if (!k) return;
  if (k === 'lineup') { state.lineupId = e.target.value; render(); }
  if (k === 'msg-session') { state.msgSession = e.target.value; state.msgDraft = buildTemplate(state.msgTpl); render(); }
  if (k === 'post-notice') state.postNotice = e.target.checked;
  if (k === 'ped-key' && state.ped) state.ped.key = e.target.checked;
  if (k === 'ped-curve' && state.ped) { state.ped.curve = e.target.checked; refreshPlayEditor(); }
  if (k === 'ped-focus' && state.ped) { const f = new Set(state.ped.draft.focus); e.target.checked ? f.add(e.target.value) : f.delete(e.target.value); state.ped.draft.focus = [...f]; refreshPlayEditor(); }
  if (k === 'ped-tag' && state.ped) { const t = state.ped.draft.tags; if (e.target.checked) t[e.target.value] = 'F'; else delete t[e.target.value]; refreshPlayEditor(); }
  if (k === 'repeat') { const u = e.target.closest('form').querySelector('.repeat-until'); if (u) u.hidden = !e.target.checked; }
  if (k === 'import-file') {
    const file = e.target.files && e.target.files[0]; if (!file || !isCoach()) return;
    const r = new FileReader();
    r.onload = async () => {
      e.target.value = '';
      let parsed; try { parsed = JSON.parse(r.result); } catch (err) { toast("That file isn't a team backup"); return; }
      if (S.trial) {
        if (isSealed(parsed)) { toast('That backup is encrypted. Go live first, then import it.'); return; }
        if (!parsed || !Array.isArray(parsed.players)) { toast("That file isn't a team backup"); return; }
        const incoming = normalize(parsed);
        if (!confirm(`Replace the team with this backup? It has ${incoming.players.length} players and ${incoming.sessions.length} sessions.`)) return;
        data = incoming; state.lineupId = null; state.msgDraft = null; save(); closeSheet(); render(); toast('Backup imported');
        return;
      }
      if (!isSealed(parsed)) { toast("That file isn't a team backup"); return; }
      let result;
      try { result = await openFile(parsed, S.coachLock, 'coach'); }
      catch (err) {
        const pw = prompt('This backup was made with a different coach password. Enter that password:');
        if (!pw) return;
        try { result = await openFile(parsed, pw, 'coach'); } catch (err2) { toast('Wrong password for that backup'); return; }
      }
      const incoming = normalize(result.value);
      if (!confirm(`Replace the team with this backup? It has ${incoming.players.length} players and ${incoming.sessions.length} sessions.`)) return;
      const keepPass = { teamPass: data.teamPass, teamSalt: data.teamSalt };
      data = { ...incoming, ...keepPass }; state.lineupId = null; state.msgDraft = null; save(); closeSheet(); render(); toast('Backup imported');
    };
    r.readAsText(file);
  }
});
document.addEventListener('submit', async e => {
  const form = e.target, kind = form.dataset.form; if (!kind) return;
  e.preventDefault();
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
    data = defaultData();
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
    data.teamPass = t1; data.teamSalt = toB64(newSalt());
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

  if (kind === 'player') {
    const id = str('id'); const p = id ? playerById(id) : { id: uid() };
    if (!str('name')) { toast('Add a name'); return; }
    Object.assign(p, { name: str('name'), gender: str('gender'), number: str('number'), phone: str('phone'), positions: f.getAll('positions'), status: str('status') || 'available', notes: str('notes') });
    if (!id) data.players.push(p);
    save(); render();
    if (!id && e.submitter && e.submitter.value === 'another') { openSheet('Add player', playerForm(null)); toast(`${p.name} added`); setTimeout(() => { const n = $('#sheet input[name=name]'); if (n) n.focus(); }, 60); }
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
    const noG = data.players.filter(p => !p.gender).length;
    toast(`${added} player${added === 1 ? '' : 's'} added${noG ? `, ${noG} still need a gender` : ''}`);
  }
  if (kind === 'session') {
    const id = str('id'), date = str('date'); if (!date) { toast('Pick a date'); return; }
    const fields = { start: str('start'), end: str('end'), venue: str('venue'), focus: str('focus'), notes: str('notes') };
    if (id) { Object.assign(sessionById(id), { date, ...fields }); save(); closeSheet(); render(); toast('Saved'); return; }
    const dates = [date];
    if (f.get('repeat') && str('until')) {
      const d = parseDate(date), until = str('until');
      for (let i = 0; i < 60; i++) { d.setDate(d.getDate() + 7); const iso = toISODate(d); if (iso > until) break; dates.push(iso); }
    }
    dates.forEach(dt => data.sessions.push({ id: uid(), date: dt, ...fields, cancelled: false, attendance: {} }));
    save(); closeSheet(); render(); toast(dates.length > 1 ? `${dates.length} sessions added` : 'Training added');
  }
  if (kind === 'settings') {
    const T = data.team;
    T.name = str('name') || T.name; T.event = str('event'); T.eventStart = str('eventStart'); T.eventEnd = str('eventEnd');
    T.venue = str('venue'); T.maxMales = Number(str('maxMales')) || 4;
    T.trainingVenue = str('trainingVenue'); T.trainingStart = str('trainingStart'); T.trainingEnd = str('trainingEnd');
    const pos = str('positions').split(',').map(x => x.trim()).filter(Boolean); if (pos.length) T.positions = pos;
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
    if (p1.length < 8) { toast('At least 8 characters'); return; }
    if (p1 !== p2) { toast("The passwords don't match"); return; }
    data.teamPass = p1; data.teamSalt = toB64(newSalt()); S.teamLock = null;
    save(); closeSheet(); render();
    toast('Team password changed. Send players the new invite link once it publishes.');
  }
  if (kind === 'coach-pass') {
    const old = raw('old'), p1 = raw('p1'), p2 = raw('p2');
    const check = await makeLock(old, S.coachLock.salt, S.coachLock.iterations);
    if (await exportKey(check.key) !== await exportKey(S.coachLock.key)) { toast("The current password isn't right"); return; }
    if (p1.length < 10) { toast('At least 10 characters'); return; }
    if (p1 !== p2) { toast("The passwords don't match"); return; }
    if (p1 === data.teamPass) { toast('Use a different password from the team one'); return; }
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
    if (!str('name')) { toast('Give the play a name'); return; }
    finishPlayLine();
    Object.assign(E.draft, { name: str('name'), category: str('category') || 'Other', when: str('when'), steps: String(f.get('steps') || '').trim() });
    const i = data.plays.findIndex(p => p.id === E.draft.id);
    if (i >= 0) data.plays[i] = E.draft; else data.plays.push(E.draft);
    state.playId = E.draft.id; state.ped = null;
    save(); closeSheet(); render(); toast('Play saved');
    return;
  }
  if (kind === 'notice') {
    const text = str('text'); if (!text) return;
    postNotice(text); save(); closeSheet(); render(); toast('Posted');
  }
});
window.addEventListener('hashchange', () => {
  const t = location.hash.slice(1);
  if (S.role && t && t !== state.tab && TABS.some(x => x.id === t)) { state.tab = t; render(); }
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
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
setInterval(checkForUpdate, 10 * 60 * 1000);

/* =========================================================
   BOOT
   ========================================================= */
function readJoinLink() {
  const m = /^#join=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', location.pathname + location.search + '#home');
  try { return fromB64Url(m[1]); } catch (e) { return null; }
}

async function boot() {
  const join = readJoinLink();
  const hashTab = location.hash.slice(1);
  if (TABS.some(t => t.id === hashTab)) state.tab = hashTab;
  const auth = readJson(KEYS.auth);
  if (auth && auth.key) {
    try {
      const lock = await lockFromAuth(auth);
      if (auth.role === 'coach') await openCoach(lock, false); else await openPlayer(lock, false);
      return render();
    } catch (e) {
      if (e.code === 'WRONG') { store.del(KEYS.auth); state.lockMsg = auth.role === 'coach' ? 'The coach password was changed. Sign in with the new one.' : 'The team password has changed. Ask your coach for the new one.'; }
      else if (e.code !== 'NO_TEAM') state.lockMsg = e.message || 'Something went wrong loading the team.';
      state.lockMode = auth.role === 'coach' ? 'coach' : 'player';
    }
  }
  if (join && !S.role) {
    try { await openPlayer(join, true); state.tab = 'home'; return render(); }
    catch (e) { state.lockMsg = e.code === 'WRONG' ? "That invite link doesn't work any more. Ask your coach for a new one." : (e.message || ''); }
  }
  let published = true;
  try { published = !!(await fetchSite('team.enc.json')); } catch (e) { published = true; }
  if (!published && !readDraft() && !auth) return startTrial();
  state.noTeam = !published;
  if (state.noTeam && readDraft()) state.lockMode = 'coach';
  renderLock();
}

// Nothing published yet: open straight into the coach view with no passwords.
function startTrial() {
  data = normalize(readJson(KEYS.trial));
  S.role = 'coach'; S.trial = true; S.coachLock = null;
  render();
}

// Exposed for automated tests only.
window.__team = { get data() { return data; }, get teamData() { return teamData; }, S, state };

boot().finally(() => checkForUpdate());
