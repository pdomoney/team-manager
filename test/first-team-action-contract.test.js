import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFirstTeamActionPayload,FIRST_TEAM_READ_ACTIONS,FIRST_TEAM_WRITE_ACTIONS
} from '../src/first-team-action-contract.js';

const mutation={mutationId:'synthetic-mutation-000001',expectedVersion:0};
const reply=(action,response)=>validateFirstTeamActionPayload(action,{...mutation,response});
test('all old and Stage 3B read actions require an empty request body',()=>{
  assert.equal(FIRST_TEAM_READ_ACTIONS.length,9);
  for(const action of FIRST_TEAM_READ_ACTIONS){
    assert.deepEqual(validateFirstTeamActionPayload(action),{kind:'read',payload:{}});
    assert.equal(validateFirstTeamActionPayload(action,{personId:'other'}),null);
    assert.equal(validateFirstTeamActionPayload(action,{filter:'all'}),null);
  }
});
test('player RSVP and volunteer replies follow existing Team Manager status vocabulary',()=>{
  for(const value of ['yes','no','maybe'])
    assert.deepEqual(reply('availability.reply',value)?.payload,{...mutation,response:value});
  for(const value of ['yes','no','done'])
    assert.deepEqual(reply('duty.reply',value)?.payload,{...mutation,response:value});
  for(const value of ['done','asked','approved','injured',null,0,{}])
    assert.equal(reply('availability.reply',value),null);
  for(const value of ['maybe','asked','registration-approved','verified',null,0,{}])
    assert.equal(reply('duty.reply',value),null);
});
test('published play command carries only an existing draft-revision reference',()=>{
  assert.deepEqual(validateFirstTeamActionPayload('play.publish',{
    ...mutation,revisionId:'draft-rev1'
  })?.payload,{...mutation,revisionId:'draft-rev1'});
  for(const unsafe of [
    {...mutation,revisionId:''},
    {...mutation,revisionId:'../../../coach'},
    {...mutation,revisionId:'draft-rev1',eventTimeline:{version:1}},
    {...mutation,revisionId:'draft-rev1',personId:'spoofed'},
    {...mutation,revisionId:'draft-rev1',published:true}
  ])assert.equal(validateFirstTeamActionPayload('play.publish',unsafe),null);
});
test('the other manager/coach write actions require a bounded change request envelope',()=>{
  for(const action of ['schedule.edit','roster.edit','play.draft.edit','duty.assign']){
    const result=validateFirstTeamActionPayload(action,{...mutation,command:{change:'fictional'}});
    assert.equal(result?.kind,'write');
    assert.deepEqual(result?.payload,{...mutation,command:{change:'fictional'}});
    for(const bad of [
      {...mutation,command:{}},
      {...mutation,command:null},
      {...mutation,command:['not-an-object']},
      {...mutation,command:{change:'fictional'},accountId:'forged'},
      {...mutation,command:{change:'x'.repeat(65537)}}
    ])assert.equal(validateFirstTeamActionPayload(action,bad),null);
  }
});
test('mutation identifiers and optimistic versions must be valid, bounded and non-forgeable at root',()=>{
  assert.equal(FIRST_TEAM_WRITE_ACTIONS.length,17);
  const action='availability.reply';
  const ok={...mutation,response:'yes'};
  for(const bad of [
    {...ok,mutationId:'too-short'},
    {...ok,mutationId:'unsafe?token=abc'},
    {...ok,mutationId:'x'.repeat(81)},
    {...ok,expectedVersion:-1},
    {...ok,expectedVersion:0.25},
    {...ok,expectedVersion:'0'},
    {...ok,expectedVersion:2147483648},
    {...ok,accountId:'acct-another'},
    {...ok,teamId:'other'},
    {...ok,roleGrant:{role:'admin'}},
    {...ok,via:'parent'},
    {...ok,at:'2026-11-01T00:00:00Z'},
    {...ok,personId:'another-player'}
  ])assert.equal(validateFirstTeamActionPayload(action,bad),null,JSON.stringify(bad).slice(0,80));
});
test('malformed and unknown payloads are rejected rather than interpreted',()=>{
  for(const raw of [null,[],1,'',false])
    assert.equal(validateFirstTeamActionPayload('availability.reply',raw),null);
  assert.equal(validateFirstTeamActionPayload('unrecognized',{}),null);
  const circular={...mutation,command:{}};circular.command.loop=circular.command;
  assert.equal(validateFirstTeamActionPayload('schedule.edit',circular),null);
});
