// Encryption for the team data files.
//
// Everything on GitHub Pages (and in a public repo) can be read by anyone, so the squad data is
// encrypted in the coach's browser before it is published. There are two files, one per role:
//
//   team.enc.json   what players see (names, numbers, positions, schedule, lineups, notices),
//                   locked with the team password
//   coach.enc.json  everything, including phone numbers, injuries, notes and attendance,
//                   locked with the coach password
//
// AES-256-GCM, with the key derived from the password by PBKDF2-SHA256. The role name is bound
// into each file as additional authenticated data, so one file can't be passed off as the other.
// Works in browsers and in Node 20+ (both provide globalThis.crypto.subtle).

import { normStyle } from './team-style.js';

export const ITERATIONS = 600000;
export const FORMAT = 'team-manager';

const te = new TextEncoder();
const td = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const bin = atob(String(str).replace(/\s/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// URL-safe base64 of a text string, for invite links.
export const toB64Url = text => toB64(te.encode(text)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = s => td.decode(fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)));

export const newSalt = () => globalThis.crypto.getRandomValues(new Uint8Array(16));

const wrong = () => Object.assign(new Error('Wrong password'), { code: 'WRONG' });

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await subtle().importKey('raw', te.encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportKey(key) {
  return toB64(new Uint8Array(await subtle().exportKey('raw', key)));
}
export function importKey(b64) {
  return subtle().importKey('raw', fromB64(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// A "lock" is { key, salt: Uint8Array, iterations }.
export async function makeLock(password, salt = newSalt(), iterations = ITERATIONS) {
  return { key: await deriveKey(password, salt, iterations), salt, iterations };
}

export async function seal(value, lock, role) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: te.encode(`${FORMAT}/${role}`) },
    lock.key, te.encode(JSON.stringify(value)));
  return {
    format: FORMAT, version: 1, role,
    kdf: { name: 'PBKDF2-SHA256', iterations: lock.iterations },
    salt: toB64(lock.salt), iv: toB64(iv), data: toB64(new Uint8Array(ct))
  };
}

export function isSealed(file) {
  return !!file && file.format === FORMAT && typeof file.data === 'string' && typeof file.iv === 'string' && typeof file.salt === 'string';
}

export async function unseal(file, key) {
  if (!isSealed(file)) throw Object.assign(new Error('Not a team data file'), { code: 'FORMAT' });
  let pt;
  try {
    pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromB64(file.iv), additionalData: te.encode(`${FORMAT}/${file.role}`) },
      key, fromB64(file.data));
  } catch (e) { throw wrong(); }
  return JSON.parse(td.decode(pt));
}

// Open a file with a password (derives the key) or with a lock remembered from earlier.
export async function openFile(file, cred, role) {
  if (!isSealed(file)) throw Object.assign(new Error('Not a team data file'), { code: 'FORMAT' });
  if (role && file.role !== role) throw wrong();
  if (typeof cred === 'string') {
    const lock = await makeLock(cred, fromB64(file.salt), file.kdf?.iterations || ITERATIONS);
    return { value: await unseal(file, lock.key), lock };
  }
  if (toB64(cred.salt) !== file.salt) throw wrong();
  return { value: await unseal(file, cred.key), lock: cred };
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] !== undefined).map(k => [k, o[k]]));

// A task as players see it: what, when and where, and how each spot stands (done, confirmed, or
// invited and awaiting a reply), with no names. A lift only says how many cars and seats are
// confirmed and how many riders have a seat, are waiting on a driver's reply, or have none.
function taskForTeam(t) {
  const base = pick(t, ['id', 'title', 'kind', 'date', 'start', 'end', 'place', 'sessionId', 'matchId', 'notes', 'need', 'cancelled']);
  const people = (Array.isArray(t.people) ? t.people : []).filter(p => p && typeof p === 'object');
  if (t.kind === 'lift') {
    const ok = d => d.status === 'yes' || d.status === 'done';
    const drivers = people.filter(p => p.role === 'driver' && p.status !== 'no'), riders = people.filter(p => p.role !== 'driver' && p.status !== 'no');
    const cars = drivers.map(dr => ({ seats: Number(dr.seats) || 0, taken: riders.filter(r => r.car === dr.who).length, done: dr.status === 'done', confirmed: ok(dr) }));
    const seated = riders.filter(r => drivers.some(dr => dr.who === r.car && ok(dr))).length;
    const tentative = riders.filter(r => drivers.some(dr => dr.who === r.car && !ok(dr))).length;
    return { ...base, lift: { cars, riders: riders.length, waiting: riders.length - seated - tentative, tentative } };
  }
  return { ...base, spots: people.filter(p => p.role !== 'rider' && p.status !== 'no').map(p => p.status === 'done' ? 'done' : p.status === 'yes' ? 'confirmed' : 'invited') };
}

// The club's details players may see (the coach's copy also has its officials and notes).
const CLUB_PUBLIC = ['id', 'name', 'shortName', 'sport', 'governingBody', 'founded', 'website', 'email', 'phone', 'postal', 'facebook', 'instagram', 'colours', 'homeGround', 'homeAddress', 'nights', 'registration', 'conduct', 'juniorBrand', 'logo'];

// The players' copy. Anything not listed here stays in the coach's file only. `club` is the team's
// club, if it has one.
// `d` is the team as of its active season (model.js activeLens), so past seasons' squads, matches and
// notices never reach the players' file; `comps` is what the players see of its competitions.
export function teamView(d, club = null, comps = []) {
  const season = d.viewSeason && typeof d.viewSeason === 'object' ? pick(d.viewSeason, ['id', 'name', 'start', 'end', 'status']) : null;
  return {
    season,
    competitions: (comps || []).filter(c => c && typeof c === 'object').map(c => ({ ...pick(c, ['id', 'name', 'sport', 'format', 'edition', 'start', 'end', 'organiser', 'venue', 'status', 'description', 'entryId', 'division', 'pool', 'entryStatus']),
      bylaws: (c.bylaws || []).map(b => pick(b, ['topic', 'text'])) })),
    // The team's sport and colour style too, so players see their own sport icon and team colours.
    team: pick(d.team, ['name', 'event', 'eventStart', 'eventEnd', 'venue', 'trainingVenue', 'maxMales', 'positions', 'field', 'tasksContact', 'clubId', 'division', 'category', 'ageGroup', 'season', 'colours', 'rules', 'bylaws', 'sport', 'style']),
    // Club branding is public metadata. Validate the optional style separately
    // from the string-only club fields, without exposing officials or notes.
    club: club && typeof club === 'object'
      ? { ...pick(club, CLUB_PUBLIC), ...(normStyle(club.style) ? {style:normStyle(club.style)} : {}) }
      : null,
    // Team staff: who they are; their phone numbers and email addresses stay with the coach.
    staff: ((d.team && d.team.staff) || []).filter(x => x && x.name).map(x => pick(x, ['role', 'name'])),
    players: (d.players || []).map(p => pick(p, ['id', 'name', 'gender', 'number', 'positions'])),
    sessions: (d.sessions || []).map(s => pick(s, ['id', 'date', 'start', 'end', 'venue', 'focus', 'notes', 'cancelled'])),
    lineups: (d.lineups || []).map(l => ({
      id: l.id, name: l.name,
      slots: (l.slots || []).map(s => pick(s, ['id', 'label', 'name', 'group', 'x', 'y', 'playerId']))
    })),
    notices: (d.notices || []).slice(0, 30).map(n => pick(n, ['id', 'at', 'text'])),
    plays: (d.plays || []).map(p => pick(p, ['id', 'name', 'sport', 'category', 'headline', 'when', 'steps', 'side', 'builtin', 'rev', 'edited', 'players', 'defence', 'moves', 'focus', 'ghost', 'view', 'tags', 'notes', 'labels', 'title', 'phases', 'set', 'who', 'study', 'rules'])),
    playerSets: (d.playerSets || []).map(x => pick(x, ['id', 'name', 'labels', 'slots'])),
    // Volunteer tasks without names: each spot is only taken or done (open spots are left to the app),
    // and a lift only says how many cars, seats and riders. Helpers never leave the coach's file.
    tasks: (d.tasks || []).filter(t => t && typeof t === 'object').map(taskForTeam),
    // Matches: when, where, who against, the status and the score. Availability, the coach's notes
    // and the result notes stay in the coach's file.
    matches: (d.matches || []).filter(m => m && typeof m === 'object').map(m => ({
      ...pick(m, ['id', 'date', 'start', 'opponent', 'venue', 'field', 'round', 'tournament', 'status', 'notes', 'lineupId', 'entryId', 'friendly']),
      result: pick(m.result || {}, ['us', 'them', 'forfeit'])
    })),
    // The coach's changes to the game systems on the Lineup page (where players stand, the words).
    systems: Object.fromEntries(Object.entries(d.systems || {}).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => [k, pick(v, ['pos', 'when', 'points', 'jobs'])])),
    updatedAt: d.updatedAt || null
  };
}
