// Run a deterministic audit of only source hosts already embedded in the public site.
// No network calls or source-file modifications; publication permission is never inferred.
import { readFileSync } from 'node:fs';
import { CLUB_REFERENCE_RECORDS } from '../site/club-directory-data.js';
import { auditSourceRights } from '../site/club-directory-source-rights.js';

if(process.argv.length>3 || (process.argv.length===3 && process.argv[2]!=='--json')){
  console.error('Usage: node scripts/audit-source-rights.mjs [--json]');
  process.exitCode=2;
}else{
  const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
  const result=auditSourceRights(CLUB_REFERENCE_RECORDS,ledger);
  if(process.argv[2]==='--json')process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else{
    console.log('Source-rights and freshness inventory — PUBLIC research candidates only');
    console.log('Records: '+result.totalPublicResearchRecords+'; source hosts: '+result.sourceHostCount);
    console.log('Record count with no documented complete rights clearance: '+result.unresolvedRecordCount);
    console.log('Hosts needing review: '+result.unresolvedHostCount);
    console.log('Compound sourceURL fields: '+result.compoundSourceFields+'; stale review dates: '+result.staleReviewCount);
    for(const p of result.sourceHosts)console.log(p.hostname+' | '+p.records+' | '+p.priority+' | '+p.rights);
    console.log('RELEASE GATE: '+result.releaseStatus);
    console.log('No files, club records, account permissions or upstream websites were read or changed.');
  }
  if(result.invalidSourceUrls || result.futureReviewCount || result.warnings.some(w=>w.code==='invalid_or_duplicate_rights_host'))
    process.exitCode=1;
}
