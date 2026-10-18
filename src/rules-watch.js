// Rules watch: fingerprints each official rule book listed in site/rules.js and notes when one changes.
//
//   node src/rules-watch.js <last results> <new results>
//
// Run weekly by .github/workflows/rules-watch.yml (and from the app's "Check the rule books now"). The
// results go to the rules-watch branch and are published with the site as data/rules-watch.json, so
// the app can show a rule book that changed after the rules were last checked against it. A change
// only tells the owner to look: the rule sets themselves change only through an approved pull request.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WATCH_FILE = 'rules-watch.json';
const SOURCE_KEYS = ['url', 'status', 'sha256', 'bytes', 'lastModified', 'firstSeen', 'changedAt', 'error'];
const ISO = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;

// Strict shape, so nothing else can end up on the public site under this name.
export function isWatchFile(text) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return false; }
  if (!j || j.format !== 'rules-watch' || j.version !== 1 || !ISO.test(j.checkedAt || '') || !Number.isInteger(j.pack)) return false;
  if (!Object.keys(j).every(k => ['format', 'version', 'checkedAt', 'pack', 'sources'].includes(k))) return false;
  const s = j.sources;
  if (!s || typeof s !== 'object' || Array.isArray(s) || Object.keys(s).length > 20) return false;
  return Object.entries(s).every(([k, v]) => /^[a-z0-9-]{1,32}$/.test(k) && v && typeof v === 'object'
    && Object.keys(v).every(x => SOURCE_KEYS.includes(x))
    && /^https:\/\/[^\s"<>]+$/.test(v.url || '')
    && (v.sha256 == null || /^[0-9a-f]{64}$/.test(v.sha256))
    && (v.status == null || Number.isInteger(v.status))
    && (v.bytes == null || Number.isInteger(v.bytes))
    && ['lastModified', 'error'].every(x => v[x] == null || (typeof v[x] === 'string' && v[x].length <= 200))
    && ['firstSeen', 'changedAt'].every(x => v[x] == null || ISO.test(v[x])));
}

// Fold this check's results into the last ones. A rule book counts as changed when its fingerprint
// differs from the last one seen; a failed download keeps the last fingerprint.
export function compare(prev, results, pack, now = new Date().toISOString()) {
  const last = (prev && prev.sources) || {}, sources = {}, changed = [];
  for (const [k, r] of Object.entries(results)) {
    const p = last[k] && last[k].url === r.url ? last[k] : null;
    const s = { url: r.url, status: r.status ?? null, sha256: r.sha256 || (p && p.sha256) || null, bytes: r.bytes ?? (p && p.bytes) ?? null,
      lastModified: r.lastModified || (p && p.lastModified) || null, firstSeen: (p && p.firstSeen) || (r.sha256 ? now : null), changedAt: (p && p.changedAt) || null };
    if (r.error) s.error = String(r.error).slice(0, 200);
    if (r.sha256 && p && p.sha256 && r.sha256 !== p.sha256) { s.changedAt = now; changed.push(k); }
    sources[k] = s;
  }
  return { watch: { format: 'rules-watch', version: 1, checkedAt: now, pack, sources }, changed, first: !prev || !prev.sources };
}

async function fingerprint(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'team-manager-rules-watch' } });
    if (!r.ok) return { url, status: r.status, error: `HTTP ${r.status}` };
    const buf = Buffer.from(await r.arrayBuffer());
    return { url, status: r.status, sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length, lastModified: r.headers.get('last-modified') || null };
  } catch (e) { return { url, status: null, error: e.message }; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [prevFile, outFile] = process.argv.slice(2);
  const { RULES } = await import('../site/rules.js');
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(prevFile, 'utf8')); } catch (e) { /* first run */ }
  const results = {};
  for (const [k, s] of Object.entries(RULES.sources)) results[k] = await fingerprint(s.url);
  const { watch, changed, first } = compare(prev, results, RULES.pack);
  fs.writeFileSync(outFile, JSON.stringify(watch, null, 2) + '\n');
  for (const [k, s] of Object.entries(watch.sources)) console.log(`${k}: ${s.error ? `could not check (${s.error})` : changed.includes(k) ? 'CHANGED' : 'no change'}`);
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `changed=${changed.join(' ')}\nfirst=${first}\n`);
}
