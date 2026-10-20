// The test library: one set of made-up data that comes out the same on every device, so the app can be
// tried on a phone, a tablet and a laptop with the same teams, people and fixtures.
//
// The app builds it with its ordinary functions. While it does, ids come from a counter instead of at
// random (model.js withCountedIds), and afterwards every time stamped while building becomes a fixed
// time on the day it was built (fixStamps). Built on the same day, on any device, the library is
// identical; `dataCheck` gives a short code to compare two devices.
//
// The teams, players and volunteers are made up. The clubs are real (St George Oztag, Penrith Oztag, Taren
// Point Titans, Engadine Dragons), with only the public details from their websites; no officials' names.

export const TEST_LIBRARY_VERSION = 3;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

// A copy with every time stamped since `since` (an ISO time) set to 8:00 am on `day` (local date,
// YYYY-MM-DD). How many milliseconds building takes differs between devices, so stamps made while
// building all get the same time; anything whose order matters is given its own earlier time.
export function fixStamps(ws, since, day) {
  const [y, m, d] = day.split('-').map(Number), at = new Date(y, m - 1, d, 8, 0, 0).toISOString();
  const fix = x => Array.isArray(x) ? x.map(fix) : isObj(x) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fix(v)]))
    : typeof x === 'string' && STAMP.test(x) && x >= since ? at : x;
  return fix(ws);
}
// The same data always gives the same text: keys sorted, and the save time and passwords left out
// (passwords differ between a test copy and a live one, and saving stamps the time).
const SKIP = new Set(['updatedAt', 'teamPass', 'teamSalt']);
export function stable(x) {
  if (Array.isArray(x)) return '[' + x.map(stable).join(',') + ']';
  if (isObj(x)) return '{' + Object.keys(x).filter(k => !SKIP.has(k) && x[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
}
// A six-character code for what's in a copy. Two devices showing the same code hold the same data.
export function dataCheck(ws) {
  const s = stable(ws);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) + (h2 >>> 13); }
  return ((h1 >>> 0).toString(36).toUpperCase() + (h2 >>> 0).toString(36).toUpperCase()).replace(/[^A-Z0-9]/g, '').padStart(6, '0').slice(-6);
}
