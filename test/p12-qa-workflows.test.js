import test from 'node:test';
import assert from 'node:assert/strict';
import {p12QaView} from '../site/p12-qa-profiles.js';
import {makeP12WorkflowSandbox,applyP12WorkflowAction,inspectP12Workflow} from '../site/p12-qa-workflows.js';

const view=(person,role,group)=> {
  const v=p12QaView(person);
  const context=v?.contexts.find(c=>c.role===role&&c.group.id===group&&c.kind==='access');
  return context?p12QaView(person,context.id):null;
};
const rangersCoach=()=>view('qa-18','team_coach','qa-rangers-16');
const starsManager=()=>view('qa-18','team_manager','qa-stars-women');
const apply=(v,s,req)=>applyP12WorkflowAction(v,s,req);

test('P12D: only a fictional team access grant opens a new disposable sandbox',()=>{
  for(const id of ['qa-01','qa-02','qa-04','qa-10','qa-12','qa-14','qa-16','qa-19','qa-20']){
    assert.equal(makeP12WorkflowSandbox(p12QaView(id)),null,id);
  }
  const v=rangersCoach(),s=makeP12WorkflowSandbox(v);
  assert.equal(s.mode,'DISPOSABLE_SYNTHETIC_WORKFLOW');
  assert.equal(s.teamId,'qa-rangers-16');
  assert.equal(s.sport,'Rugby league');
  assert.equal(s.players.length,3);
  assert.equal(s.volunteers.length,2);
  assert.equal(s.published,false);
  assert.equal(s.containsRealPeople,false);
  assert.equal(s.rulesApproved,false);
  assert.equal(s.staffingVerified,false);
});

test('P12D: coach changes fictional roster without changing source template or input state',()=>{
  const v=rangersCoach(),s=makeP12WorkflowSandbox(v);
  const before=structuredClone(s);
  const changed=apply(v,s,{kind:'toggle-roster',playerId:s.players[2].id});
  assert.equal(changed.players[2].selected,true);
  assert.equal(inspectP12Workflow(v,changed).selectedCount,3);
  assert.deepEqual(s,before,'original remains unchanged');
  assert.equal(makeP12WorkflowSandbox(v).players[2].selected,false,'fresh state on reset');
  assert.equal(changed.log.length,1);
});

test('P12D: manager records scoped RSVP with deliberate explicit selection',()=>{
  const v=starsManager(),s=makeP12WorkflowSandbox(v);
  const changed=apply(v,s,{kind:'set-rsvp',playerId:s.players[0].id,status:'yes'});
  assert.equal(changed.players[0].rsvp,'yes');
  assert.equal(changed.players[1].rsvp,'pending');
  assert.equal(inspectP12Workflow(v,changed).canRsvp,true);
  assert.equal(inspectP12Workflow(v,changed).canPropose,true);
  assert.equal(changed.log[0].includes('Coach-recorded fictional RSVP'),true);
});

test('P12D: match staffing creates unverified fixture proposals without clearance or new access',()=>{
  const v=starsManager(),s=makeP12WorkflowSandbox(v);
  const next=apply(v,s,{kind:'propose-duty',volunteerId:s.volunteers[0].id,duty:'trainer'});
  assert.equal(next.proposedDuties.length,1);
  assert.deepEqual(next.proposedDuties[0],{
    volunteerId:s.volunteers[0].id,duty:'trainer',fixtureId:s.fixtureId,
    status:'proposed',qualification:'unverified',registration:'unverified',
    coverage:'not-verified',grantsAccess:false
  });
  assert.equal(next.staffingVerified,false);
  assert.equal(inspectP12Workflow(v,next).canScore,false);
  assert.equal(apply(v,next,{kind:'propose-duty',volunteerId:s.volunteers[0].id,duty:'trainer'}).error,
    'Duplicate fixture duty proposal');
});

test('P12D: a coach cannot silently assume match-staff management rights',()=>{
  const v=rangersCoach(),s=makeP12WorkflowSandbox(v);
  assert.equal(inspectP12Workflow(v,s).canPropose,false);
  const attempt=apply(v,s,{kind:'propose-duty',volunteerId:s.volunteers[0].id,duty:'acting_coach'});
  assert.equal(attempt.error,'Role lacks this synthetic action');
  assert.deepEqual(s.proposedDuties,[]);
});

test('P12D: changing selected role or team rejects stale existing sandbox',()=>{
  const coach=rangersCoach(),manager=starsManager(),old=makeP12WorkflowSandbox(coach);
  assert.equal(inspectP12Workflow(manager,old),null);
  assert.equal(apply(manager,old,{kind:'set-rsvp',playerId:old.players[0].id,status:'yes'}).error,
    'Synthetic workflow context does not match');
  const fresh=makeP12WorkflowSandbox(manager);
  assert.equal(fresh.teamId,'qa-stars-women');
  assert.equal(fresh.log.length,0);
});

test('P12D: impossible player, volunteer, status or duty never mutates sandbox',()=>{
  const v=starsManager(),s=makeP12WorkflowSandbox(v);
  for(const bad of [
    {kind:'toggle-roster',playerId:'qa-rangers-16-player-1'},
    {kind:'set-rsvp',playerId:'qa-rangers-16-player-1',status:'yes'},
    {kind:'set-rsvp',playerId:s.players[0].id,status:'attending'},
    {kind:'propose-duty',volunteerId:'wrong-team',duty:'trainer'},
    {kind:'propose-duty',volunteerId:s.volunteers[0].id,duty:'confirmed'},
    {kind:'publish'}, {kind:'score:record'}, {kind:'approve'},
    {kind:'toggle-roster',playerId:'__proto__'}
  ])assert.ok(apply(v,s,bad).error,JSON.stringify(bad));
  assert.equal(s.log.length,0);
});

test('P12D: none of the twenty synthetic profiles inherit team action from club or participation membership',()=>{
  for(const profileId of Array.from({length:20},(_,i)=>'qa-'+String(i+1).padStart(2,'0'))){
    const v=p12QaView(profileId);
    for(const context of v.contexts){
      const selected=p12QaView(profileId,context.id);
      const s=makeP12WorkflowSandbox(selected);
      if(context.kind!=='access'||context.group.type!=='team')assert.equal(s,null,profileId+' '+context.id);
    }
  }
});

test('P12D: denied sensitive, invented, or externally forged contexts do not produce a sandbox',()=>{
  assert.equal(makeP12WorkflowSandbox(null),null);
  const v=rangersCoach(),s=makeP12WorkflowSandbox(v);
  const clone=structuredClone(v);
  clone.mode='REAL_AUTHORIZATION';
  assert.equal(makeP12WorkflowSandbox(clone),null);
  const fake=structuredClone(v);
  fake.selected={...fake.selected,group:{type:'team',id:'private-real-team'}};
  assert.equal(makeP12WorkflowSandbox(fake),null);
  const corrupted=structuredClone(s);corrupted.published=true;
  assert.ok(apply(v,corrupted,{kind:'toggle-roster',playerId:s.players[0].id}).error);
  assert.equal(inspectP12Workflow(v,s).officialRuleApproval,false);
  assert.equal(inspectP12Workflow(v,s).realWorkspaceAffected,false);
});

test('P12D: 100 independent reset/replay cycles remain deterministic and do not accumulate events',()=>{
  const v=starsManager();
  for(let i=0;i<100;i++){
    const initial=makeP12WorkflowSandbox(v);
    const changed=apply(v,initial,{kind:'set-rsvp',playerId:initial.players[0].id,status:i%2?'no':'yes'});
    assert.equal(changed.log.length,1);
    assert.equal(makeP12WorkflowSandbox(v).log.length,0);
    assert.equal(changed.fixtureId,initial.fixtureId);
  }
});
