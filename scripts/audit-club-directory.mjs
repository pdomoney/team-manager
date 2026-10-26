// Safe offline QA of the public, already-shipped research-only directory.
// Does not fetch external sites, process private team workspaces, or write any files.
import { CLUB_REFERENCE_RECORDS } from '../site/club-directory-data.js';
import { auditClubDirectory } from '../site/club-directory-audit.js';
const args=process.argv.slice(2);
if(args.length>1 || (args.length===1 && args[0]!=='--json')){
  console.error('Usage: node scripts/audit-club-directory.mjs [--json]');
  process.exitCode=2;
}else{
  const result=auditClubDirectory(CLUB_REFERENCE_RECORDS);
  if(args.includes('--json')) process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else {
    console.log('Existing public research candidate directory — offline inventory');
    console.log('Records: '+result.recordCount);
    console.log('By sport: '+JSON.stringify(result.bySport));
    console.log('By state: '+JSON.stringify(result.byState));
    console.log('Unverified candidate status: '+JSON.stringify(result.byStatus));
    console.log('Technical consistency: '+result.technicalInventory);
    console.log('Without documented source rights approval: '+result.rights.recordCountWithoutExplicitApprovedEvidence);
    console.log('Publication/registration verification: '+result.releaseGate);
    console.log('No coach data, source archive, or live website was accessed or changed.');
  }
  if(result.technicalInventory!=='PASS') process.exitCode=1;
}
