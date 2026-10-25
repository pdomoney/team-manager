// P10D release disposition. Static evidence-only evaluation: no credentials, network, data imports or publishing.
export const SAFARI_GROUPS = Object.freeze({
  P06: Object.freeze(Array.from({length:8},(_,i)=>'V'+(i+1))),
  P07: Object.freeze(Array.from({length:10},(_,i)=>'S'+(i+1))),
  P08: Object.freeze(Array.from({length:10},(_,i)=>'S'+(i+1))),
  P09: Object.freeze(Array.from({length:8},(_,i)=>'R'+(i+1)))
});
export const SAFARI_IDS = Object.freeze(Object.entries(SAFARI_GROUPS).flatMap(([phase,cases])=>cases.map(c=>phase+'-'+c)));
export const UNWAIVABLE_CASES = Object.freeze([
  'P06-V3', // false clearance/accreditation eligibility
  'P06-V5', // cross-family scope/privacy
  'P06-V7', // child/staff/medical privacy
  'P07-S8', // preserve review for conflicts (cross-check worksheet before claiming pass)
  'P09-R6', // invalid organisation scopes and privacy
  'P09-R7'  // player bypass of coach-only actions
]);
export const HARD_GATES = Object.freeze([
  'PR_HEAD_NODE', 'PR_HEAD_BROWSER', 'MAIN_NODE_BROWSER', 'MAIN_PUBLISH',
  'DEVICE_ENCRYPTED_RESTORE', 'DEVICE_STALE_CONFLICT',
  'PRIVACY_BOUNDARY', 'FICTIONAL_LIVE_PUBLISH', 'FINAL_RELEASE_APPROVAL'
]);
const SHA = /^[0-9a-f]{40}$/;
const filled = x=>typeof x==='string' && x.trim().length>4;
const hasSha = x=>typeof x==='string' && SHA.test(x);
const isDate = x=>typeof x==='string' && /^20\\d\\d-\\d\\d-\\d\\d/.test(x);
const isUrlOrDoc = x=>filled(x) && (x.startsWith('https://github.com/pdomoney/team-manager/') ||
  x.startsWith('docs/') || x.startsWith('evidence-ref:'));
export function evaluateP10Release(e) {
  const blockers=[];
  if (!e || e.schemaVersion!==1) return {ready:false,blockers:['Invalid P10D evidence schema'],completed:0,total:SAFARI_IDS.length+HARD_GATES.length};
  if (e.ownerUserAcceptance?.status!=='accepted' || e.ownerUserAcceptance?.baselineSha!=='3a46fcffad7805afa1e0b4c209ab17dbb03b029d')
    blockers.push('Owner functional UAT baseline acceptance not documented');
  const candidate=e.candidate||{}, head=candidate.headSha, merged=candidate.mergeSha;
  if (!hasSha(head)) blockers.push('Final P10D PR exact head SHA not recorded');
  if (!hasSha(merged)) blockers.push('Merged P10D main commit SHA not recorded');
  if (!Number.isInteger(candidate.prNumber)||candidate.prNumber<1) blockers.push('Final candidate PR number missing');
  let completed=0;
  const entries=e.safariCases||{};
  const expected=new Set(SAFARI_IDS);
  for (const id of Object.keys(entries)) if (!expected.has(id)) blockers.push('Unexpected Safari case: '+id);
  for (const id of SAFARI_IDS) {
    const c=entries[id]||{};
    if (c.status==='passed') {
      if (hasSha(merged) && c.testedCommit===merged && filled(c.deviceModel) &&
          filled(c.osVersion) && filled(c.safariVersion) && isDate(c.observedAt) && isUrlOrDoc(c.evidenceRef)) completed++;
      else blockers.push(id+': device/version/date/evidence or exact merged SHA missing');
    } else if (c.status==='waived') {
      if (UNWAIVABLE_CASES.includes(id)) blockers.push(id+': privacy or safeguarding case cannot be waived');
      else if (filled(c.owner) && filled(c.reason) && filled(c.riskDecision) && isDate(c.decidedAt)) completed++;
      else blockers.push(id+': case-specific owner/rationale/risk/date waiver missing');
    } else blockers.push(id+': not physically verified or individually waived');
  }
  const g=e.releaseGates||{};
  const known=new Set(HARD_GATES);
  for (const id of Object.keys(g)) if (!known.has(id)) blockers.push('Unexpected release gate: '+id);
  for (const id of HARD_GATES) {
    const d=g[id]||{};
    const expectedSha=id.startsWith('PR_HEAD_')?head:merged;
    if (d.status==='passed' && hasSha(expectedSha) && d.testedCommit===expectedSha &&
        isDate(d.observedAt) && isUrlOrDoc(d.evidenceRef)) completed++;
    else blockers.push(id+': mandatory verified evidence against correct commit not recorded');
  }
  return {ready:blockers.length===0,blockers,completed,total:SAFARI_IDS.length+HARD_GATES.length,
    ownerUserAcceptance:e.ownerUserAcceptance?.status||'pending',candidatePr:candidate.prNumber||null};
}
