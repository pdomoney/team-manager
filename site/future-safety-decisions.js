// Fictional safety/contact policy candidates for D01/D09/D10/D11/D14.
// No actual health or child records, disclosure, identity linkage or API access.
// Health and safeguarding data must NOT be stored in GitHub Pages/browser QA.
// Production needs verified identities, privacy review and server enforcement.
const word=x=>typeof x==='string'?x.trim():'';
const valid=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,19)===x.slice(0,19);
const deny=reason=>Object.freeze({allowed:false,reason,fields:Object.freeze([]),
 productionAuthorised:false});
const allow=(kind,fields)=>Object.freeze({allowed:true,kind,fields:Object.freeze([...fields]),
 productionAuthorised:false});
const contactRoles=['club_admin','team_manager','team_coach','trainer'];
const safetyRoles=['association_admin','club_admin','team_manager','team_coach','trainer'];

// Contact channel preferences are not a right to disclose next-of-kin
// information. A recorded emergency purpose and verified club/team assignment
// are required before even a minimal contact projection is considered.
export function reviewEmergencyContact({
 actorRole,actorGroup,subjectTeamId,subjectClubId,assignment,
 consent,purpose,at='2026-11-03T00:00:00Z'
}={}){
 if(!valid(at)||!word(subjectTeamId)||!word(subjectClubId))return deny('invalid-request');
 if(!contactRoles.includes(actorRole))return deny('not-an-emergency-contact-role');
 if(purpose!=='active-emergency')return deny('emergency-purpose-required');
 if(assignment?.status!=='approved'||!word(assignment.approvedBy)||
    assignment.role!==actorRole||assignment.group?.id!==actorGroup?.id||
    assignment.group?.type!==actorGroup?.type)return deny('approved-assignment-required');
 const groupOK=actorGroup?.type==='team'&&actorGroup.id===subjectTeamId||
   actorGroup?.type==='club'&&actorGroup.id===subjectClubId;
 if(!groupOK)return deny('subject-outside-assigned-scope');
 if(consent?.status!=='active'||consent.subjectTeamId!==subjectTeamId||
    !consent.emergencyContact||!valid(consent.expiresAt)||at>=consent.expiresAt)
   return deny('specific-contact-permission-required');
 return allow('minimum-emergency-next-of-kin',['name','emergencyPhone']);
}

// A player's serious injury should be visible across their sports only when
// the SAME Person identity is independently verified and consent explicitly
// names the receiving scope. Do not disclose full clinical notes to coaches,
// club/association administrators or Managers. A conditional actionable alert
// never becomes medical clearance, and no automatic cross-club browsing occurs.
export function reviewCrossSportSafetyAlert({
 subjectPersonId,recipientRole,recipientGroup,verifiedPersonLink,
 consent,guardianLink,subjectUnder18=false,
 purpose,at='2026-11-03T00:00:00Z'
}={}){
 if(!valid(at)||!word(subjectPersonId)||!recipientGroup?.id||!recipientGroup?.type)
   return deny('invalid-request');
 if(!safetyRoles.includes(recipientRole))return deny('not-an-authorised-safety-role');
 if(purpose!=='participant-safety')return deny('safety-purpose-required');
 if(verifiedPersonLink?.status!=='verified'||
    verifiedPersonLink.personId!==subjectPersonId)
   return deny('person-link-not-verified');
 if(consent?.status!=='active'||consent.personId!==subjectPersonId||
    consent.purpose!=='cross-sport-safety-alert'||!Array.isArray(consent.recipients)||
    !consent.recipients.some(g=>g?.type===recipientGroup.type&&g.id===recipientGroup.id)||
    !valid(consent.expiresAt)||at>=consent.expiresAt||
    !word(consent.recordedBy)||!word(consent.evidenceRef))
   return deny('specific-cross-sport-consent-required');
 if(subjectUnder18&&(guardianLink?.status!=='verified'||
    guardianLink.childPersonId!==subjectPersonId||
    guardianLink.guardianPersonId!==consent.recordedBy))
   return deny('verified-guardian-consent-required');
 // The restricted safety summary is deliberately not the original health file.
 // Clinical detail requires a distinct verified healthcare appointment and
 // dedicated storage/access model; it is not enabled here.
 return allow('cross-sport-actionable-safety-alert',
    ['restriction','seriousInjuryCategory','lastReviewedAt','reviewRequired']);
}
