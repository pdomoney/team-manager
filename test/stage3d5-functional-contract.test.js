import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStage3D5,isStage3D5Read} from '../src/stage3d5-management-contract.js';
const req=(action,input={},teamId='stgeorge-mixed20',role='team_coach')=>({
 action,input,teamId,role
});
test('first-team management contract preserves exact team and one verified role',()=>{
 const q=validateStage3D5(req('settings.read'));
 assert.equal(q.teamId,'stgeorge-mixed20');
 assert.equal(q.role,'team_coach');
 assert.equal(isStage3D5Read('settings.read'),true);
 assert.equal(isStage3D5Read('settings.save'),false);
 for(const role of ['platform_owner','team_player','team_volunteer','team_assistant'])
   assert.equal(validateStage3D5(req('settings.read',{},'stgeorge-mixed20',role)),null);
 assert.equal(validateStage3D5(req('settings.read',{},'bad team')),null);
});
test('settings data-only contract rejects forged identities and unsupported values',()=>{
 const base={teamLabel:'Mixed 20',trainingVenue:'Community field',
   trainingStart:'18:00',trainingEnd:'19:30',contactName:'Team lead',
   contactEmail:'contact@example.test',jerseyLoan:false,expectedVersion:0};
 assert(validateStage3D5(req('settings.save',base)));
 for(const extra of [{approvedBy:'me'},{isAdmin:true},{teamId:'other-team'},
   {jerseyLoan:'true'},{expectedVersion:-1},{trainingStart:'35:88'},
   {contactEmail:'wrong'},{unknown:'test'}])
   assert.equal(validateStage3D5(req('settings.save',{...base,...extra})),null);
});
test('competition creation and local fixture do not carry official authority',()=>{
 assert(validateStage3D5(req('competitions.create',{
  name:'St George mixed tournament',format:'tournament',division:'Mixed 20',
  beginsOn:'2027-03-05',endsOn:'2027-03-07',status:'planned'
 })));
 assert.equal(validateStage3D5(req('competitions.create',{
   name:'Fictional fixture',format:'league',officialVerified:true
 })),null);
 assert(validateStage3D5(req('competitions.fixture',{
  competitionId:'competition-'+'a'.repeat(32),opponent:'Fictional Lions',
  startsAt:'2027-03-06T09:00:00+11:00'
 })));
});
test('jersey issue, return and WhatsApp manual-send receipt enforce schema',()=>{
 assert(validateStage3D5(req('jerseys.issue',{personId:'player-01',jerseyNo:'14'})));
 assert.equal(validateStage3D5(req('jerseys.issue',{personId:'player-01',jerseyNo:'1000'})),null);
 assert(validateStage3D5(req('jerseys.return',{
  issueId:'jersey-'+'a'.repeat(32),expectedVersion:0})));
 assert(validateStage3D5(req('messages.prepare',{
  audience:'players',channel:'whatsapp',body:'Next training at 6 pm'})));
 assert.equal(validateStage3D5(req('messages.prepare',{
  audience:'players',channel:'whatsapp',body:'Send',sent:true})),null);
 assert(validateStage3D5(req('messages.confirm',{
  messageId:'message-'+'a'.repeat(32),status:'sent',expectedVersion:0})));
 assert.equal(validateStage3D5(req('messages.confirm',{
  messageId:'message-'+'a'.repeat(32),status:'delivered',expectedVersion:0})),null);
});
test('team-level access may only invite Player or Volunteer, never appoint leadership',()=>{
 const good=validateStage3D5(req('invite.issue',{
   email:' Member@Example.Test ',role:'team_player'
 }));
 assert.equal(good.input.email,'member@example.test');
 for(const role of ['team_coach','team_manager','platform_owner','club_admin',
   'team_assistant']){
  assert.equal(validateStage3D5(req('invite.issue',{
   email:'member@example.test',role})),null);
 }
 assert(validateStage3D5(req('invite.review-adult',{
  invitationId:'invite-'+'a'.repeat(32),
  evidenceRef:'evidence-ref/fictional-adult-review'
 })));
 assert.equal(validateStage3D5(req('invite.review-adult',{
  invitationId:'invite-'+'a'.repeat(32),
  evidenceRef:'self-verified'
 })),null);
});
test('Coach fallback duties require exact verified person and non-accredited category',()=>{
 assert(validateStage3D5(req('admin.status')));
 assert(validateStage3D5(req('volunteers.list')));
 assert(validateStage3D5(req('duties.assign',{
  sessionId:'session-01',personId:'volunteer-01',type:'equipment'})));
 assert.equal(validateStage3D5(req('duties.assign',{
  sessionId:'session-01',personId:'volunteer-01',type:'first_aid'})),null);
 assert(validateStage3D5(req('duties.withdraw',{
  dutyId:'duty-'+'a'.repeat(32),expectedVersion:0})));
});
