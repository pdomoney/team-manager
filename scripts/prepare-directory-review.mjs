// D3C local reviewer handoff. No network, arbitrary file paths or write operations.
import {readFileSync} from 'node:fs';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {prepareDirectoryReviewPacket} from '../site/club-directory-review-packet.js';

const args=process.argv.slice(2);
const usage='Usage: node scripts/prepare-directory-review.mjs --id <exact-public-directory-id> [--json]';
let id=null,json=false,invalid=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--id'&&id===null&&i+1<args.length)id=args[++i];
  else if(args[i]==='--json'&&!json)json=true;
  else invalid=true;
}
if(invalid||!id||id.startsWith('--')){
  console.error(usage);
  process.exitCode=2;
}else{
  try{
    const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-rights.json',import.meta.url),'utf8'));
    const packet=prepareDirectoryReviewPacket(CLUB_REFERENCE_RECORDS,ledger,{directoryId:id});
    if(json)process.stdout.write(JSON.stringify(packet,null,2)+'\n');
    else{
      const r=packet.candidate;
      console.log('D3C - UNVERIFIED RESEARCH CANDIDATE; no source rights granted');
      console.log([r.directoryId,r.name,r.sport,r.state,r.sourceHost,r.reviewPriority].join(' | '));
      for(const gate of packet.reviewGates)console.log('[ ] '+gate.code+': '+gate.instruction);
      console.log('Use --json for an intentionally blocked, blank D3A evidence template.');
      console.log('STOP: no registration, licence, publication or role approval recorded.');
    }
  }catch{
    console.error('Invalid, ambiguous or unreviewable directory ID or source ledger.');
    process.exitCode=2;
  }
}