// L0-L6: source-only release qualification. This never provisions a backend,
// authenticates a user, imports records or certifies external evidence as genuine.
// The operator must independently verify all referenced evidence.
export const FIRST_TEAM_GATES=Object.freeze([
  'L0_OWNER_AND_DATA_POLICY',
  'L1_ISOLATED_SERVER_AND_IDENTITY',
  'L2_EXACT_TEAM_WORKFLOW',
  'L3_REAL_SERVER_SECURITY',
  'L4_BACKUP_ROLLBACK_AND_STAGING',
  'L5_PHYSICAL_SAFARI_AND_RECOVERY',
  'L6_OWNER_LIVE_RELEASE_ACCEPTANCE'
]);
export const FIRST_TEAM_JOURNEYS=Object.freeze([
  'COACH_MANAGER_EXACT_TEAM',
  'PLAYER_OWN_AVAILABILITY',
  'INDIVIDUAL_INVITE_ACTIVATION',
  'VOLUNTEER_OWN_DUTIES',
  'VOLUNTEER_OWN_RESPONSE',
  'PROFILE_PERSON_LINK_APPROVAL',
  'ROLE_GRANT_AND_RECOVERY',
  'REVOKED_FOREIGN_TEAM_DENIAL'
]);
const SHA=/^[0-9a-f]{40}$/;
const REF=/^(?:docs\/[a-zA-Z0-9._/-]+\.md|evidence-ref:[a-zA-Z0-9._/-]+|https:\/\/github\.com\/pdomoney\/team-manager\/(?:actions\/runs\/\d+|issues\/\d+|pull\/\d+|commit\/[0-9a-f]{40}))$/;
const validRef=x=>typeof x==='string'&&x.length<=240&&REF.test(x);
const validSha=x=>typeof x==='string'&&SHA.test(x);
const filled=x=>typeof x==='string'&&x.trim().length>=2&&x.length<=120;
const date=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&
  !Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const labels=Object.freeze({
  L0_OWNER_AND_DATA_POLICY:'Owner/provider, billing, data-controller and privacy decisions',
  L1_ISOLATED_SERVER_AND_IDENTITY:'Isolated real server and individually verified identities',
  L2_EXACT_TEAM_WORKFLOW:'Exact-team Coach/Manager workflow through trusted server',
  L3_REAL_SERVER_SECURITY:'Actual server 59-case security run plus historical risk review',
  L4_BACKUP_ROLLBACK_AND_STAGING:'Real backup/restore, rollback and staging verification',
  L5_PHYSICAL_SAFARI_AND_RECOVERY:'Real iPhone/macOS Safari, two-device and accessible recovery',
  L6_OWNER_LIVE_RELEASE_ACCEPTANCE:'Owner-controlled live cutover and installed verification'
});
export const FIRST_TEAM_LABELS=labels;
const journeyLabels=Object.freeze({
  COACH_MANAGER_EXACT_TEAM:'Coach/Manager exact-team roster, training and fixture workflow',
  PLAYER_OWN_AVAILABILITY:'Player or approved guardian own-team RSVP only',
  INDIVIDUAL_INVITE_ACTIVATION:'Individual invitation, verified-email activation and credential recovery',
  VOLUNTEER_OWN_DUTIES:'Assigned volunteer/fixture duty only; no inferred digital role',
  VOLUNTEER_OWN_RESPONSE:'Assigned volunteer task response, not another person or team',
  PROFILE_PERSON_LINK_APPROVAL:'Person profile linked through independent review, never self-approved',
  ROLE_GRANT_AND_RECOVERY:'Exact-team digital grant approved, recovered and revoked safely',
  REVOKED_FOREIGN_TEAM_DENIAL:'Foreign/revoked/stale-offline/direct URL and protected data deny'
});
export const FIRST_TEAM_JOURNEY_LABELS=journeyLabels;


export function evaluateFirstTeamCloudRelease(e){
  const blockers=[],gates=e?.gates||{},owner=e?.ownerDecision||{},candidate=e?.candidate||{};
  let completed=0;
  if(e?.schemaVersion!==1||e?.kind!=='first-team-cloud-live-release')
    blockers.push('Invalid first-team cloud release evidence format');
  if(!e||typeof e!=='object'||Array.isArray(e)) blockers.push('Missing release evidence');
  for(const id of Object.keys(gates))
    if(!FIRST_TEAM_GATES.includes(id)) blockers.push('Unknown release gate '+id);
  const sha=candidate.sourceSha;
  if(!validSha(sha)) blockers.push('No immutable candidate source commit recorded');
  if(candidate.runtime!=='individually-authenticated-server')
    blockers.push('GitHub Pages/static/shared-password runtime is not production identity');
  if(!validSha(candidate.installedSha)||candidate.installedSha!==sha)
    blockers.push('Installed cloud runtime does not match qualified source SHA');
  if(owner.status!=='approved') blockers.push('Owner has not explicitly approved the live release scope');
  for(const field of ['provider','plan','region','controller'])
    if(!filled(owner[field])) blockers.push('Owner decision missing '+field);
  if(owner.launchMode!=='team-management-private')
    blockers.push('First-team management release must include Coach/Manager, Player, Volunteer and account onboarding journeys');
  if(!['adult','includes-minors'].includes(owner.firstTeamAgeGroup))
    blockers.push('First-team player age group and guardian rules undecided');
  if(owner.firstTeamAgeGroup==='includes-minors'&&
    (owner.minorDataPolicy!=='specifically-approved'||!validRef(owner.guardianAccessEvidenceRef)))
    blockers.push('Minor participation requires separate verified guardian/privacy policy and evidence');
  if(owner.dataScope!=='approved-limited-real')
    blockers.push('Synthetic-only or unapproved private/player data cannot be called a live-team release');
  if(!['excluded','specifically-approved'].includes(owner.minorDataPolicy))
    blockers.push('No explicit minor-data inclusion/exclusion decision');
  for(const field of ['ownerApprovalRef','providerCostRef','retentionDeletionRef','privacyNoticeRef','minorDataDecisionRef'])
    if(!validRef(owner[field])) blockers.push('Owner decision missing safe evidence reference '+field);
  const security=e?.serverSecurity||{};
  if(security.environment!=='real-isolated-server'||security.automatedCasesPassed!==59||
    security.automatedCasesFailed!==0||security.manualHistoricalRiskAccepted!==true||
    security.independentlyReviewed!==true||!validRef(security.reportRef)||
    !validRef(security.independentReviewRef)||security.sourceSha!==sha)
    blockers.push('P13B/C actual server test evidence and independent ID-060 risk review missing');
  const devices=e?.deviceEvidence||{};
  for(const name of ['iphoneSafari','macosSafari','voiceOver','twoDeviceRecovery'])
    if(!validRef(devices[name])) blockers.push('No independent physical-device evidence for '+name);
  const journeys=e?.launchJourneys||{};
  for(const id of Object.keys(journeys))
    if(!FIRST_TEAM_JOURNEYS.includes(id))blockers.push('Unknown first-team journey '+id);
  let journeysCompleted=0;
  for(const id of FIRST_TEAM_JOURNEYS){
    const proof=journeys[id]||{};
    if(proof.status==='passed'&&validSha(sha)&&proof.testedSha===sha&&
      date(proof.observedOn)&&validRef(proof.evidenceRef)){
      journeysCompleted++;
    }else blockers.push(id+': '+journeyLabels[id]+' not independently verified');
  }
  for(const id of FIRST_TEAM_GATES){
    const record=gates[id]||{};
    if(record.status==='passed'&&validSha(sha)&&record.testedSha===sha&&
      date(record.observedOn)&&validRef(record.evidenceRef)){
      completed++;
    }else blockers.push(id+': '+labels[id]+' not verified against exact source SHA');
  }
  if(completed>0&&gates[FIRST_TEAM_GATES[0]]?.status!=='passed')
    blockers.push('L0 must be approved before downstream gates can qualify');
  if(completed>0&&FIRST_TEAM_GATES.some((id,i)=>i>0&&gates[id]?.status==='passed'&&
      gates[FIRST_TEAM_GATES[i-1]]?.status!=='passed'))
    blockers.push('Release gates cannot be completed out of order');
  return {
    ready:blockers.length===0&&completed===FIRST_TEAM_GATES.length,
    completed,total:FIRST_TEAM_GATES.length,remaining:FIRST_TEAM_GATES.length-completed,
    journeysCompleted,journeysTotal:FIRST_TEAM_JOURNEYS.length,
    blockers,sourceSha:validSha(sha)?sha:null,
    runtime:candidate.runtime||'static-pages-only'
  };
}
