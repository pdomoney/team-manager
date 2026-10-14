// Assembles the site for GitHub Pages: the app from site/ plus the encrypted team files from the
// data branch.
//
//   DATA_DIR=data OUT_DIR=dist node src/build.js
//
// Only the two known file names are published, and only if they are encrypted. A plain-text file
// on the data branch stops the build rather than ending up on the public site.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_FILES = ['team.enc.json', 'coach.enc.json'];

export function isEncryptedFile(text) {
  let j;
  try { j = JSON.parse(text); } catch (e) { return false; }
  return !!j && j.format === 'team-manager' && typeof j.data === 'string' && typeof j.iv === 'string'
    && typeof j.salt === 'string' && (j.role === 'team' || j.role === 'coach') && Object.keys(j).every(k =>
      ['format', 'version', 'role', 'kdf', 'salt', 'iv', 'data'].includes(k));
}

export function build({ dataDir = 'data', outDir = 'dist', siteDir = 'site', log = console.log } = {}) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(siteDir, outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'data'), { recursive: true });
  const published = [];
  for (const name of DATA_FILES) {
    const src = path.join(dataDir, name);
    if (!fs.existsSync(src)) continue;
    const text = fs.readFileSync(src, 'utf8');
    if (!isEncryptedFile(text)) throw new Error(`${name} on the data branch is not an encrypted team file. Refusing to publish it.`);
    fs.writeFileSync(path.join(outDir, 'data', name), text);
    published.push(name);
  }
  fs.writeFileSync(path.join(outDir, 'data', 'manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), files: published }, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  log(published.length ? `Published ${published.join(' and ')}.` : 'No team data yet. The site opens in test mode.');
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
