// D3B operator triage for already-public research candidates. No files/URLs as inputs.
import {readFileSync} from 'node:fs';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {buildClubReviewQueue} from '../site/club-directory-review-queue.js';
const args=process.argv.slice(2),params={};
const allowed=new Set(['--state','--sport','--limit','--json']);
let malformed=false;
for(let i=0;i<args.length;i++){
  const a=args[i];
  if(!allowed.has(a)||Object.hasOwn(params,a)){malformed=true;break;}
  if(a==='--json'){params[a]=true;continue;}
  if(i+1>=args.length||args[i+1].startsWith('--')){malformed=true;break;}
  params[a]=args[++i];
}
if(malformed) {
  console.error('Usage: node scripts/review-club-candidates.mjs [--state NSW] [--sport "Rugby league"] [--limit 20] [--json]');
  process.exitCode=2;
} else {
  try{
    const n=params['--limit']===undefined?20:Number(params['--limit']);
    if(params['--limit']!==undefined&&!/^[0-9]+$/.test(params['--limit']))throw Error('invalid limit');
    const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
    const result=buildClubReviewQueue(CLUB_REFERENCE_RECORDS,ledger,{
      state:params['--state']||'',sport:params['--sport']||'',limit:n
    });
    if(params['--json'])process.stdout.write(JSON.stringify(result,null,2)+'\n');
    else{
      console.log('D3B — Public research candidate verification queue (NEVER verified registrations)');
      console.log('Matching '+result.matchingCandidates+' of '+result.publishedCandidateCount+', showing '+result.displayedCandidates);
      console.log('Priority count (scoped): '+JSON.stringify(result.priorityCounts));
      console.log('Unresolved source hosts: '+result.unresolvedSourceHosts+'/'+result.sourceHostCount);
      for(const row of result.items)
        console.log([row.directoryId,row.name,row.sport,row.state,row.sourceHost,row.tier].join(' | '));
      console.log('STOP: '+result.status+'. No source rights, club registration or permissions approved.');
    }
    if(result.items.some(x=>x.tier==='integrity_review'))process.exitCode=1;
  }catch{
    console.error('Invalid public directory query or source ledger. No private files or network sources can be supplied.');
    process.exitCode=2;
  }
}
