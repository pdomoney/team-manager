// P12F: source-linked, fail-closed FIXTIONAL fixture staffing impact review.
// No real person identity, qualification proof, role approval or match-start
// clearance. This cannot be used as production authorisation or an eligibility
// certificate. The precise NRL On-Field Policy age-grade minimum is NOT modeled.
import {sampleTeam,makeP12SampleRoster} from './p12-qa-club-teams.js';

export const P12_STAFFING_POLICY=Object.freeze({
  id:'nswrl-community-2026',
  sport:'Rugby league',
  authority:'NSWRL',
  publication:'2026 Community Rugby League Policies & Procedures Manual',
  section:'4.8, page 103',
  sourceUrl:'https://www.nswrl.com.au/contentassets/1d571d35b4264f349c39683f186aeb4d/2026-pp-manual-v1',
  coachAndRequiredSafetyDifferentPeople:true,
  coachAccreditationRequired:true,
  onFieldSafetyPersonnelRequired:true,
  u16PlusRegisteredAccreditedTrainerAtVenue:true,
  externalPolicyNeeded:'NRL On-Field Policy section 1.2',
  approvedLocalCompetitionPolicy:false,
  authorisesMatchStart:false
});
const isStr=x=>typeof x==='string'&&x.trim().length>0;
const arr=x=>Array.isArray(x)?x:[];
const copy=x=>JSON.parse(JSON.stringify(x));
const MAX_DUTY_DURATION=24*60*60*1000;
const parseInstant=s=>{
  if(!isStr(s)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(s))return null;
  const ms=Date.parse(s);
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==s.slice(0,19))return null;
  return ms;
};
const timeBounds=s=>{
  const begin=parseInstant(s?.fixtureStart),finish=parseInstant(s?.fixtureEnd);
  if(begin===null||finish===null||begin>=finish||finish-begin>MAX_DUTY_DURATION)return null;
  return {begin,finish};
};
const unique=(x)=>[...new Set(x)];
const memberFor=(r,id)=>[...r.staff,...r.volunteers].find(p=>p.personId===id)||null;
const isSafetyTitle=x=>/Sports trainer \((?:blue|orange)\)/i.test(x?.role||'');
// This is a *sample nomination*, not an accreditation or rules-minimum calculation.
export function makeP12FixtureStaffingScenario(teamId){
  const team=sampleTeam(teamId),roster=makeP12SampleRoster(teamId);
  if(!team||!roster)return null;
  const coach=roster.staff.find(s=>s.role==='Head Coach');
  const safety=roster.volunteers.find(s=>/Sports trainer \(orange\)/i.test(s.role))||
    roster.volunteers.find(s=>/Sports trainer \(blue\)/i.test(s.role));
  return {
    mode:'DISPOSABLE_FIXTURE_STAFFING_REVIEW',
    teamId,clubId:roster.clubId,fixtureId:roster.fixtureId,
    sport:roster.sport,ageGroup:roster.ageGroup,
    season:roster.season,
    // Stable completely fictional date. Never infer a real competition fixture.
    fixtureStart:'2026-11-07T00:00:00Z',
    fixtureEnd:'2026-11-07T03:00:00Z',
    policyId:roster.sport==='Rugby league'?P12_STAFFING_POLICY.id:'unverified',
    participants:[...roster.staff,...roster.volunteers].map(p=>({
      personId:p.personId,id:p.id,name:p.name,role:p.role,
      registration:'unverified',accreditation:'unverified',
      qualificationEvidence:'none',safeguardingEvidence:'none',
      grantsAccess:false
    })),
    baselineCoachId:coach?.personId||null,
    baselineSafetyId:safety?.personId||null,
    // A club's listed volunteers are not automatically counted as qualified
    // required safety personnel. A reviewer may nominate a distinct replacement
    // for the one fictional safety appointment used in this example.
    baselineSafetyNominationIsUnverified:true,
    audit:[],published:false,committed:false,
    containsRealPeople:false,actualComplianceVerified:false
  };
}
const shapeOK=s=>{
  const meta=sampleTeam(s?.teamId),template=makeP12SampleRoster(s?.teamId),time=timeBounds(s);
  if(!meta||!template||!time||s?.mode!=='DISPOSABLE_FIXTURE_STAFFING_REVIEW'||
    s.clubId!==template.clubId||s.fixtureId!==template.fixtureId||
    s.sport!==meta.sport||s.ageGroup!==meta.ageGroup||s.containsRealPeople!==false||
    s.published!==false||s.committed!==false||s.actualComplianceVerified!==false||
    !Array.isArray(s.participants)||!Array.isArray(s.audit))return false;
  const ids=new Set([...template.staff,...template.volunteers].map(p=>p.personId));
  if(s.participants.length!==template.staff.length+template.volunteers.length||
    s.participants.some(p=>!ids.has(p.personId)))return false;
  return true;
};
const invalid=reason=>({
  status:'blocked',blockers:[reason],verificationRequired:[],
  warnings:[],automaticApproval:false,canStartMatch:false,
  canPublish:false,actualStaffingChanged:false,expired:false
});
// Inputs are proposed-only fictional duties, NEVER authoritative accreditations.
// A real fixture would additionally need confirmed registered staff, sufficient
// age-grade safety coverage from NRL On-Field Policy, local competition approval,
// safeguarding and verifiable authenticated decision makers.
export function assessP12FixtureActingDuty(s,{
  candidatePersonId,duty,replacesPersonId='',replacementSafetyPersonId='',
  headCoachUnavailable=false,at='2026-11-07T01:00:00Z'
}={}){
  if(!shapeOK(s))return invalid('invalid-or-foreign-scenario');
  const bounds=timeBounds(s),now=parseInstant(at);
  if(now===null)return invalid('invalid-review-time');
  if(now>=bounds.finish)return {...invalid('fixture-ended'),status:'expired',expired:true};
  if(now<bounds.begin)return invalid('fixture-not-started');
  if(!['acting_coach','trainer'].includes(duty)||!isStr(candidatePersonId))
    return invalid('invalid-duty-or-person');
  const candidate=memberFor(s,candidatePersonId);
  if(!candidate)return invalid('candidate-not-on-this-team');
  if(replacesPersonId && !memberFor(s,replacesPersonId))return invalid('replacement-reference-not-on-this-team');
  if(replacementSafetyPersonId && !memberFor(s,replacementSafetyPersonId))
    return invalid('safety-replacement-not-on-this-team');

  const blockers=[],warnings=[],verificationRequired=[];
  const specific=s.policyId===P12_STAFFING_POLICY.id &&
    s.sport===P12_STAFFING_POLICY.sport && s.season==='Example 2026 season';
  if(!specific)blockers.push('competition-policy-not-reviewed');
  if(s.sport==='Rugby league'&&!specific)blockers.push('incorrect-rugby-league-policy');
  if(s.sport!=='Rugby league'&&s.policyId===P12_STAFFING_POLICY.id)
    blockers.push('rugby-league-policy-not-transferable');

  const coach=s.baselineCoachId,safety=s.baselineSafetyId;
  if(specific){
    if(!coach||!safety)blockers.push('required-coach-or-safety-not-nominated');
    if(duty==='acting_coach'){
      if(!headCoachUnavailable)blockers.push('head-coach-absence-not-confirmed');
      if(replacesPersonId!==coach)blockers.push('acting-coach-must-identify-replaced-coach');
      if(candidatePersonId===coach)blockers.push('acting-coach-cannot-replace-themself');
      if(candidatePersonId===safety){
        if(!replacementSafetyPersonId)blockers.push('required-safety-position-left-vacant');
        if(replacementSafetyPersonId===candidatePersonId)
          blockers.push('coach-and-required-safety-must-be-distinct');
        if(replacementSafetyPersonId===coach&&headCoachUnavailable)
          blockers.push('unavailable-coach-cannot-cover-safety');
        if(replacementSafetyPersonId &&
           !isSafetyTitle(memberFor(s,replacementSafetyPersonId)))
          blockers.push('safety-replacement-qualification-not-established');
      }else if(replacementSafetyPersonId&&replacementSafetyPersonId===candidatePersonId){
        blockers.push('coach-and-required-safety-must-be-distinct');
      }
    }else if(duty==='trainer'){
      if(candidatePersonId===coach && !headCoachUnavailable)
        blockers.push('head-coach-cannot-also-be-required-onfield-safety');
      if(replacesPersonId && replacesPersonId!==safety)
        warnings.push('verify-which-safety-duty-is-being-replaced');
      if(candidatePersonId===safety)
        warnings.push('already-nominated-as-safety-person');
    }
  }
  verificationRequired.push('independent-registration-check');
  verificationRequired.push('age-appropriate-coaching-or-trainer-accreditation');
  verificationRequired.push('person-availability-and-current-role-confirmation');
  verificationRequired.push('authorised-club-and-ground-manager-confirmation');
  verificationRequired.push('NRL-on-field-policy-section-1.2-age-grade-coverage');
  verificationRequired.push('local-competition-variations-and-safeguarding');
  if(s.sport!=='Rugby league')
    verificationRequired.push('applicable-sport-specific-policy-not-reviewed');
  if(candidate.role==='Team Manager')
    warnings.push('team-manager-original-duty-coverage-to-confirm');
  if(candidate.personId===safety&&duty==='acting_coach')
    warnings.push('trainer-original-duty-must-be-replaced');
  if(specific && /^U(1[6-9]|[2-9]\d)$/.test(s.ageGroup))
    warnings.push('NSWRL-u16-plus-registered-accredited-trainer-at-venue-required');
  const filtered=unique(blockers),status=filtered.length?'blocked':'review-required';
  return {
    status,blockers:filtered,verificationRequired:unique(verificationRequired),
    warnings:unique(warnings),
    ruleProfile:specific?P12_STAFFING_POLICY.id:'unverified',
    ruleSection:specific?P12_STAFFING_POLICY.section:null,
    fixtureId:s.fixtureId,teamId:s.teamId,
    candidatePersonId,duty,replacesPersonId,replacementSafetyPersonId,
    expiresAt:s.fixtureEnd,expired:false,
    // No API integration or official evidence has been consulted.
    automaticApproval:false,canStartMatch:false,canPublish:false,
    actualStaffingChanged:false,
    registrationVerified:false,accreditationVerified:false,
    competitionEligibilityVerified:false
  };
}
export function proposeP12FixtureReview(s,proposal,reviewer){
  if(!shapeOK(s)||!isStr(reviewer)||reviewer.startsWith('real-'))
    return {error:'Invalid fictional reviewer or scenario'};
  const review=assessP12FixtureActingDuty(s,proposal);
  if(review.status==='expired'||review.blockers.includes('invalid-duty-or-person')||
     review.blockers.includes('candidate-not-on-this-team')||
     review.blockers.includes('invalid-review-time')||
     review.blockers.includes('replacement-reference-not-on-this-team')||
     review.blockers.includes('safety-replacement-not-on-this-team'))
    return {error:'Malformed or ended fixture proposal'};
  return {...copy(s),audit:[...copy(s.audit),{
    event:'fictional-staffing-impact-reviewed',reviewer,
    fixtureId:s.fixtureId,personId:review.candidatePersonId,
    duty:review.duty,reviewStatus:review.status,
    blockerCount:review.blockers.length,
    expiresAt:review.expiresAt,
    actualApproval:false,actualRoleChange:false
  }]};
}
