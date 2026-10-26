// D3A dry-run only: immutable public research catalogue, optional sanitised evidence via stdin.
// No network, coach workspace, raw ZIP input, GitHub publication, or file output.
import {readFileSync} from 'node:fs';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {makeClubVerificationPlan} from '../site/club-directory-verification-plan.js';
const args=process.argv.slice(2);
if(args.length>1||(args.length===1&&args[0]!=='--stdin')){
  console.error('Usage: node scripts/plan-directory-verification.mjs [--stdin] (sanitised JSON review proposals only)');
  process.exitCode=2;
}else{
  try{
    const raw=args.length===1?readFileSync(0,'utf8'):'[]';
    if(raw.length>262144)throw new Error('oversize input');
    const proposals=JSON.parse(raw);
    const result=makeClubVerificationPlan(CLUB_REFERENCE_RECORDS,proposals);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.blockedCount>0)process.exitCode=1;
  }catch{
    console.error('Invalid review proposals. Provide an array of sanitised public-club evidence only; never private records or backup files.');
    process.exitCode=2;
  }
}
