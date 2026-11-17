#!/usr/bin/env node
// Source-only metadata inspection. Never accept private files as CLI input.
import {readFileSync} from 'node:fs';
import {evaluatePrivacyL0Evidence} from '../src/privacy-l0-evidence.js';
const args=process.argv.slice(2);
if(args.length>1||!['','--assert-source-blocked'].includes(args[0]||'')){
  console.error('Use no arguments or --assert-source-blocked. Do not provide participant data.');
  process.exitCode=2;
}else{
  try{
    const paths=[
      '../config/privacy-decision-register.json',
      '../config/privacy-player-field-inventory.json',
      '../config/privacy-launch-readiness-plan.json',
      '../config/first-team-cloud-release-evidence.json'
    ];
    const records=paths.map(path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8')));
    const outcome=evaluatePrivacyL0Evidence(...records);
    process.stdout.write(JSON.stringify(outcome,null,2)+'\n');
    if(args[0]==='--assert-source-blocked'){
      // PASS means source is still NOT cleared for real personal data.
      if(!outcome.structurallySound||
         outcome.ownerResponsesRecorded!==18||
         outcome.independentlyReviewedDecisions!==0||
         outcome.independentlyApprovedFields!==0||
         outcome.releaseGatesPassed!==0||
         outcome.liveJourneysPassed!==0||
         outcome.independentlyReviewedL0Candidate!==false||
         outcome.separateLiveReleaseReady!==false||
         outcome.productionReleaseAuthorised!==false)process.exitCode=1;
    }else process.exitCode=1;
  }catch{
    console.error('Source privacy metadata is missing or malformed; do not use private participant records.');
    process.exitCode=2;
  }
}
