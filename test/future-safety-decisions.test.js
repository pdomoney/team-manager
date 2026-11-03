import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEmergencyContact,reviewCrossSportSafetyAlert}
 from '../site/future-safety-decisions.js';

const at='2026-11-03T10:00:00Z';
const contact=()=>({
 actorRole:'team_manager',actorGroup:{type:'team',id:'Rangers-U16'},
 subjectTeamId:'Rangers-U16',subjectClubId:'Rangers',
 assignment:{status:'approved',role:'team_manager',
   group:{type:'team',id:'Rangers-U16'},approvedBy:'club-admin',
   expiresAt:'2026-12-01T00:00:00Z',childSafetyScreening:'current'},
 consent:{status:'active',subjectTeamId:'Rangers-U16',emergencyContact:true,
   expiresAt:'2026-12-01T00:00:00Z'},
 purpose:'active-emergency',subjectUnder18:true,at
});
test('D01: only assigned club/team staff get minimum next-of-kin projection',()=>{
 const request=contact(),source=structuredClone(request);
 const result=reviewEmergencyContact(request);
 assert.equal(result.allowed,true);
 assert.deepEqual(result.fields,['name','emergencyPhone']);
 assert.deepEqual(request,source);
 for(const bad of [
   {actorRole:'personal_owner'},
   {actorRole:'club_support'},
   {purpose:'marketing'},
   {actorGroup:{type:'team',id:'Other-U16'}},
   {consent:{...request.consent,emergencyContact:false}},
   {consent:{...request.consent,expiresAt:'2026-11-01T00:00:00Z'}},
   {assignment:{...request.assignment,status:'proposed'}},
   {assignment:{...request.assignment,childSafetyScreening:'missing'}},
   {assignment:{...request.assignment,expiresAt:'2026-10-01T00:00:00Z'}}
 ])assert.equal(reviewEmergencyContact({...request,...bad}).allowed,false);
});
const share=()=>({
 subjectPersonId:'child-1',recipientRole:'team_manager',
 recipientGroup:{type:'team',id:'Rugby-Union-U16'},
 recipientAssignment:{status:'approved',role:'team_manager',
   group:{type:'team',id:'Rugby-Union-U16'},
   approvedBy:'club-admin',childSafetyScreening:'current',
   expiresAt:'2026-12-01T00:00:00Z'},
 verifiedPersonLink:{status:'verified',personId:'child-1'},
 consent:{status:'active',personId:'child-1',purpose:'cross-sport-safety-alert',
   recipients:[{type:'team',id:'Rugby-Union-U16'}],
   expiresAt:'2026-12-01T00:00:00Z',recordedBy:'guardian-1',
   evidenceRef:'consent-record-01'},
 guardianLink:{status:'verified',childPersonId:'child-1',guardianPersonId:'guardian-1'},
 subjectUnder18:true,purpose:'participant-safety',at
});
test('D10: verified guardian consent permits actionable cross-sport alert only',()=>{
 const request=share(),source=structuredClone(request);
 const decision=reviewCrossSportSafetyAlert(request);
 assert.equal(decision.allowed,true);
 assert.equal(decision.kind,'cross-sport-actionable-safety-alert');
 assert.ok(decision.fields.includes('restriction'));
 assert.ok(decision.fields.includes('seriousInjuryCategory'));
 assert.equal(decision.fields.includes('clinicalNotes'),false);
 assert.equal(decision.fields.includes('medicalFile'),false);
 assert.deepEqual(request,source);
});
test('D09/D10: no cross-club sharing without exact recipient + verified person and guardian',()=>{
 const request=share();
 for(const bad of [
   {recipientGroup:{type:'team',id:'Other-Team'}},
   {recipientAssignment:{...request.recipientAssignment,status:'revoked'}},
   {recipientAssignment:{...request.recipientAssignment,childSafetyScreening:'expired'}},
   {recipientRole:'player'},
   {verifiedPersonLink:{status:'proposed',personId:'child-1'}},
   {consent:{...request.consent,recipients:[{type:'club',id:'Different-Club'}]}},
   {consent:{...request.consent,expiresAt:'2026-11-01T00:00:00Z'}},
   {guardianLink:{...request.guardianLink,status:'reported'}},
   {guardianLink:{...request.guardianLink,guardianPersonId:'unrelated'}},
   {purpose:'research'}
 ]){
   const result=reviewCrossSportSafetyAlert({...request,...bad});
   assert.equal(result.allowed,false,JSON.stringify(bad));
 }
});
test('D10: adult may explicitly consent to a recipient without guardian relationship',()=>{
 const request=share();
 const r=reviewCrossSportSafetyAlert({...request,subjectUnder18:false,guardianLink:null,
   consent:{...request.consent,recordedBy:'child-1'}});
 assert.equal(r.allowed,true);
});
