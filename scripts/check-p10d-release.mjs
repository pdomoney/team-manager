// Read only the checked-in P10D release ledger; never accept private workspace/archive paths.
import { readFileSync } from 'node:fs';
import { evaluateP10Release } from '../src/p10d-release-gates.js';

if (process.argv.length !== 2) {
  console.error('P10D qualification accepts no arguments or backup paths.');
  process.exitCode=2;
} else {
  const evidence=JSON.parse(readFileSync(new URL('../config/p10d-release-evidence.json',import.meta.url),'utf8'));
  const outcome=evaluateP10Release(evidence);
  process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
  if (!outcome.ready) process.exitCode=1;
}
