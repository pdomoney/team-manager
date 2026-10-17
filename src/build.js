// Assembles the site for GitHub Pages: the app from site/ plus the encrypted team files from the
// data branch.
//
//   DATA_DIR=data OUT_DIR=dist node src/build.js
//
// Only the known file names are published (the coach's file and one players' file per team), and
// only if they are encrypted for the right role. A plain-text file on the data branch stops the
// build rather than ending up on the public site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_FILES = ['team.enc.json', 'coach.enc.json'];
// The first team's players' file is team.enc.json; each other team's is team-<team id>.enc.json.
export const TEAM_FILE = /^team(?:-[a-z0-9]{3,32})?\.enc\.json$/;
export const roleOf = name => name === 'coach.enc.json' ? 'coach' : TEAM_FILE.test(name) ? 'team' : null;

export function isEncryptedFile(text, role = null) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return false; }
  return !!j && j.format === 'team-manager' && typeof j.data === 'string' && typeof j.iv === 'string'
    && typeof j.salt === 'string' && (j.role === 'team' || j.role === 'coach') && (!role || j.role === role) && Object.keys(j).every(k =>
      ['format', 'version', 'role', 'kdf', 'salt', 'iv', 'data'].includes(k));
}

// Each release gets its own version, stamped onto the app's file names so phones never mix a cached
// old file with a new one, and written to data/manifest.json so a running app can spot a newer release.
export function stampVersion(outDir, version) {
  const edit = (file, fn) => { const p = path.join(outDir, file); if (fs.existsSync(p)) fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  edit('index.html', t => t
    .replace(/(src|href)="(app\.js|styles\.css|favicon\.svg)"/g, `$1="$2?v=${version}"`)
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="app-version" content="${version}">`));
  edit('app.js', t => t.replace(/from '\.\/(vault|github|model)\.js'/g, `from './$1.js?v=${version}'`));
}

export function build({ dataDir = 'data', outDir = 'dist', siteDir = 'site', log = console.log, version = (process.env.GITHUB_SHA || '').slice(0, 7) || Date.now().toString(36) } = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(siteDir, outDir, { recursive: true });
  stampVersion(outDir, version);
  fs.mkdirSync(path.join(outDir, 'data'), { recursive: true });
  const published = [];
  const rank = n => DATA_FILES.includes(n) ? DATA_FILES.indexOf(n) : DATA_FILES.length;
  const names = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter(roleOf).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) : [];
  for (const name of names) {
    const src = path.join(dataDir, name);
    const text = fs.readFileSync(src, 'utf8');
    if (!isEncryptedFile(text, roleOf(name))) throw new Error(`${name} on the data branch is not an encrypted ${roleOf(name) === 'coach' ? 'coach' : 'team'} file. Refusing to publish it.`);
    fs.writeFileSync(path.join(outDir, 'data', name), text);
    published.push(name);
  }
  fs.writeFileSync(path.join(outDir, 'data', 'manifest.json'), JSON.stringify({ version, builtAt: new Date().toISOString(), files: published }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  log(published.length ? `Published ${published.join(', ')}.` : 'No team data yet. The site opens in test mode.');
  return published;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    build({ dataDir: process.env.DATA_DIR || 'data', outDir: process.env.OUT_DIR || 'dist', siteDir: process.env.SITE_DIR || 'site' });
  } catch (e) {
    console.error(`::error::${e.message}`);
    process.exit(1);
  }
}
