// D3D offline source observation handoff; accepts only optional exact public ID.
import {readFileSync} from 'node:fs';
import {CLUB_REFERENCE_RECORDS} from '../site/club-directory-data.js';
import {auditDirectorySourceObservations} from '../site/club-directory-source-observations.js';
const args=process.argv.slice(2);
const usage='Usage: node scripts/audit-directory-source-observations.mjs [--id exact_public_directory_id] [--json]';
let id='',json=false,malformed=false;
for(let i=0;i<args.length;i++){
  if(args[i]==='--id' && !id && i+1<args.length)id=args[++i];
  else if(args[i]==='--json'&&!json)json=true;
  else malformed=true;
}
if(malformed||id.startsWith('--')){
  console.error(usage);process.exitCode=2;
}else{
  try{
    const ledger=JSON.parse(readFileSync(new URL('../config/directory-source-observations.json',import.meta.url),'utf8'));
    const out=auditDirectorySourceObservations(CLUB_REFERENCE_RECORDS,ledger,{directoryId:id});
    if(json)process.stdout.write(JSON.stringify(out,null,2)+'\n');
    else{
      console.log('D3D - Public source name observations (NOT registration verification)');
      for(const x of out.items){
        console.log(x.directoryId+' | '+x.candidateName+' | '+x.observedName);
        console.log('Source: '+x.officialSourceUrl);
        console.log('REVIEW: '+x.nameAssessment+'; terms/rights and identity unresolved.');
      }
      console.log('STOP: '+out.status+'. No catalogue, data or role changes.');
    }
  }catch{
    console.error('Invalid exact public ID, source observation ledger or identity scope. Nothing changed.');
    process.exitCode=2;
  }
}
