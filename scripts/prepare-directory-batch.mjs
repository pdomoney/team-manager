// Offline stdout-only D3E review handoff; never touches managed-club or data branches.
import {readFileSync} from 'node:fs';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {prepareDirectoryBatchReview} from '../site/club-directory-batch-review.js';
const args=process.argv.slice(2);
const usage='Usage: node scripts/prepare-directory-batch.mjs --ids id1,id2[,id3...] [--json]';
let ids=null,json=false,invalid=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--ids'&&ids===null&&i+1<args.length)ids=args[++i];
  else if(args[i]==='--json'&&!json)json=true;
  else invalid=true;
}
if(invalid||!ids||ids.startsWith('--')){
  console.error(usage);process.exitCode=2;
}else{
  try{
    const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
    const report=prepareDirectoryBatchReview(CLUB_REFERENCE_RECORDS,ledger,{ids:ids.split(',')});
    if(json)process.stdout.write(JSON.stringify(report,null,2)+'\n');
    else{
      console.log('D3E OFFLINE BATCH — ALL ENTRIES UNVERIFIED; NO DATA OR RIGHTS CHANGED');
      console.log(report.requested+' exact public research candidates');
      for(const g of report.groups)console.log(g.label+': '+g.recordIds.join(', '));
      console.log('Use --json for human review templates and individually blocked evidence packets.');
      console.log('STOP: no automatic identity, reuse rights, logo permissions or production updates.');
    }
  }catch{
    console.error('Invalid, duplicate, ambiguous or unreviewable batch IDs or ledger.');
    process.exitCode=2;
  }
}
