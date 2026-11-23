import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeamNavigation,roleForAction,visibleSections,reviewerContext,
  clubsForNavigation,hasTeamRole} from '../site/cloud-team-contexts.js';
const g=(teamId,role,club='St George Oztag',season='2027')=>({
  teamId,role,club,sport:'oztag',season
});
test('founder account starts with independent Platform and St George Coach team',()=>{
  const contexts=buildTeamNavigation([g('stgeorge-mixed20','team_coach')],true);
  assert.deepEqual(contexts.map(c=>c.key),['platform','team:stgeorge-mixed20']);
  assert.deepEqual(visibleSections(contexts[0]),['home','team','more']);
  assert.deepEqual(visibleSections(contexts[1]),['home','schedule','team','more']);
  assert.equal(roleForAction(contexts[0],'roster.read'),null,
    'owner authority must never become a team roster grant');
  assert.equal(roleForAction(contexts[1],'roster.read'),'team_coach');
});
test('one person with Coach in team A, Manager in B, Volunteer in C changes access by team chip',()=>{
  const items=buildTeamNavigation([
    g('team-a','team_coach','Comets'),
    g('team-b','team_manager','Comets'),
    g('team-c','team_volunteer','Rangers')
  ]);
  assert.deepEqual(clubsForNavigation(items),['Comets','Rangers']);
  assert.equal(roleForAction(items[0],'roster.read'),'team_coach');
  assert.equal(roleForAction(items[0],'duty.reply'),null);
  assert.equal(roleForAction(items[1],'roster.read'),'team_manager');
  assert.equal(roleForAction(items[1],'availability.transcribe'),'team_manager');
  assert.equal(roleForAction(items[1],'duty.reply'),null);
  assert.equal(roleForAction(items[2],'duty.reply'),'team_volunteer');
  assert.equal(roleForAction(items[2],'roster.read'),null);
  assert.deepEqual(visibleSections(items[2]),['home','team','more']);
});
test('same-team multi-grants show combined features but choose ONE verified grant per request',()=>{
  const [t]=buildTeamNavigation([
    g('team-a','team_volunteer'),g('team-a','team_coach'),
    g('team-a','team_manager'),g('team-a','team_player'),
    g('team-a','team_coach')
  ]);
  assert.deepEqual(t.roles,['team_coach','team_manager','team_player','team_volunteer']);
  assert.equal(roleForAction(t,'roster.edit'),'team_coach');
  assert.equal(roleForAction(t,'availability.transcribe'),'team_manager');
  assert.equal(roleForAction(t,'availability.reply'),'team_player');
  assert.equal(roleForAction(t,'duty.reply'),'team_volunteer');
  assert.equal(roleForAction(t,'play.publish'),'team_coach');
  assert.equal(roleForAction(t,'not-a-permitted-operation'),null);
  assert.equal(reviewerContext(t).role,'team_coach');
  assert.equal(hasTeamRole(t,'team_volunteer'),true);
});
test('different teams and clubs never pool roles or infer permissions',()=>{
  const [a,b]=buildTeamNavigation([
    g('team-a','team_coach','St George Oztag'),
    g('team-b','team_volunteer','Penrith')],true).slice(1);
  assert.equal(roleForAction(a,'duty.reply'),null);
  assert.equal(roleForAction(b,'roster.edit'),null);
  assert.equal(reviewerContext(b),null);
  assert.equal(roleForAction({kind:'platform',roles:['team_coach']},'roster.read'),null);
});
test('conflicting server identities, forged roles and excessive grants fail closed',()=>{
  assert.throws(()=>buildTeamNavigation([g('team-a','platform_owner')]),/invalid-grant/);
  assert.throws(()=>buildTeamNavigation([
    g('team-a','team_manager','Comets'),
    g('team-a','team_manager','Rangers')]),/conflicting-team-identity/);
  assert.throws(()=>buildTeamNavigation(Array(51).fill(g('team-a','team_coach'))),
    /invalid-grants/);
  assert.throws(()=>buildTeamNavigation([{teamId:'team-a',role:'team_coach'}]),
    /invalid-grant/);
});
test('plays and tactics remain deferred for the connected management-first release',()=>{
  const [team]=buildTeamNavigation([g('team-a','team_coach')]);
  assert(!visibleSections(team,{playsDeferred:true}).includes('tactics'));
  assert(visibleSections(team,{playsDeferred:false}).includes('tactics'),
    'older synthetic stage2 play checks remain supported');
});
test('volunteer plus Manager grants on same team expose manager schedule and volunteer duty',()=>{
  const [team]=buildTeamNavigation([
    g('team-a','team_volunteer'),g('team-a','team_manager')]);
  assert.deepEqual(visibleSections(team),['home','schedule','team','more']);
  assert.equal(roleForAction(team,'schedule.read'),'team_manager');
  assert.equal(roleForAction(team,'duty.read'),'team_volunteer');
  assert.equal(roleForAction(team,'duty.assign'),'team_manager');
});
