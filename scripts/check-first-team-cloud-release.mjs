// Inspect only sanitised release evidence. This makes NO network or provider calls.
// The committed ledger must remain blocked; actual sign-off arrives via stdin.
import {readFileSync} from 'node:fs';
import {evaluateFirstTeamCloudRelease,FIRST_TEAM_GATES,FIRST_TEAM_JOURNEYS} from '../src/first-team-cloud-release.js';
const args=process.argv.slice(2);
if(args.length>1||!['','--stdin','--assert-source-blocked'].includes(args[0]||'')){
  console.error('Use no arguments, --stdin or --assert-source-blocked. File paths and private backups are rejected.');
  process.exitCode=2;
}else{
  try{
    const raw=args[0]==='--stdin'?readFileSync(0,'utf8'):
      readFileSync(new URL('../config/first-team-cloud-release-evidence.json',import.meta.url),'utf8');
    if(raw.length>65536)throw new Error('Oversized evidence');
    const parsed=JSON.parse(raw);
    const outcome=evaluateFirstTeamCloudRelease(parsed);
    process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
    if(args[0]==='--assert-source-blocked'){
      // This CI check is intentionally not a production qualification.
      // Committed evidence must never pretend deployment, approval or real server authority.
      const g=parsed.gates||{};
      const safe=parsed.schemaVersion===1&&
        parsed.kind==='first-team-cloud-live-release'&&
        outcome.ready===false&&outcome.completed===0&&
        parsed.candidate?.runtime==='static-pages-only'&&
        parsed.candidate?.sourceSha===null&&
        parsed.candidate?.installedSha===null&&
        parsed.ownerDecision?.status==='pending'&&
        parsed.ownerDecision?.dataScope==='synthetic-only'&&
        parsed.ownerDecision?.firstTeamAgeGroup==='undecided'&&
        parsed.ownerDecision?.guardianAccessEvidenceRef===null&&
        parsed.serverSecurity?.environment==='NO_BACKEND'&&
        parsed.serverSecurity?.automatedCasesPassed===0&&
        parsed.serverSecurity?.independentlyReviewed===false&&
        FIRST_TEAM_GATES.every(id=>g[id]?.status==='pending')&&
        Object.keys(g).length===FIRST_TEAM_GATES.length&&
        FIRST_TEAM_JOURNEYS.every(id=>parsed.launchJourneys?.[id]?.status==='pending')&&
        Object.keys(parsed.launchJourneys||{}).length===FIRST_TEAM_JOURNEYS.length;
      if(!safe)process.exitCode=1;
    }else if(!outcome.ready)process.exitCode=1;
  }catch{
    console.error('Invalid sanitised first-team evidence; do not supply backups, personal data or credentials.');
    process.exitCode=2;
  }
}
