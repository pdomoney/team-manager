// Read the repo's safe pending ledger, or an external sanitised JSON record from stdin.
// Avoid self-referential SHA commits: final CI/main SHAs only exist after the release code is frozen.
// Never accept backup paths, tokens, remote URLs, or publish any workspace data.
import { readFileSync } from 'node:fs';
import { evaluateP10Release } from '../src/p10d-release-gates.js';

const args=process.argv.slice(2);
if (!(args.length===0 || (args.length===1 && args[0]==='--stdin'))) {
  console.error('P10D qualification accepts no file path arguments or backup paths. Use --stdin for a sanitised evidence JSON.');
  process.exitCode=2;
} else {
  try {
    const raw=args.length===0
      ? readFileSync(new URL('../config/p10d-release-evidence.json',import.meta.url),'utf8')
      : readFileSync(0,'utf8');
    if (raw.length>262144) throw new Error('oversize evidence');
    const outcome=evaluateP10Release(JSON.parse(raw));
    process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
    if (!outcome.ready) process.exitCode=1;
  } catch {
    console.error('Invalid P10D evidence. Supply only a compact sanitised P10D JSON ledger; no archives or secrets.');
    process.exitCode=2;
  }
}
