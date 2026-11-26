import test from 'node:test';
import assert from 'node:assert/strict';
import {connectedPlayLibrary,capturePlayScope} from '../site/cloud-tactics-library.js';
const record=(id,revision,category,name)=>({playId:id,revisionId:revision,version:2,play:{name,category,players:{LM:[24,46]},moves:[]}});
const first=record('play-1','rev-1','Attack','Step In');
const next=record('play-1','rev-2','Attack','Step Out');
const defence=record('play-2','rev-3','Defence','Slide');
test('library reconciles all revisions without merging draft and published identity',()=>{
  const rows=[first,next,defence,first,{playId:'invalid'}];
  const before=JSON.stringify(rows);
  const lib=connectedPlayLibrary(rows,{query:'step',filter:'Attack'});
  assert.equal(lib.eligible,5);assert.equal(lib.shown,2);
  assert.deepEqual(lib.categories,['Attack','Defence']);
  assert.deepEqual(lib.rows,[first,next]);
  assert.deepEqual(lib.reasons,{invalidRecord:1,duplicateRevision:1,filtered:1});
  assert.equal(JSON.stringify(rows),before);
});
function harness(roles){
  const context={kind:'team',teamId:'team-a',roles};
  const state={context,epoch:1,tab:'tactics'};
  const calls=[];
  let resolve;
  const scope=capturePlayScope({context,epoch:1,current:()=>state,
    operation:(...args)=>{calls.push(args);return new Promise(r=>resolve=r);},mutationId:()=> 'synthetic-mutation-0001'});
  return {context,state,scope,calls,finish:x=>resolve(x)};
}
test('assistant draft transport preserves geometry and captured team/version; late response never affects new team',async()=>{
  const h=harness(['team_assistant','team_player']);
  const play=structuredClone(first.play);
  const pending=h.scope.mutate('play.draft.edit','play-1',2,{command:{op:'save',play}});
  play.players.LM[0]=99;
  h.state.context={...h.context,teamId:'team-b'};
  h.state.epoch++;
  h.finish({resourceId:'play-1',version:3});
  const result=await pending;
  assert.equal(result.stillCurrent,false);
  assert.equal(h.calls[0][0].teamId,'team-a');
  assert.equal(h.calls[0][0].role,'team_assistant');
  assert.equal(h.calls[0][3].expectedVersion,2);
  assert.deepEqual(h.calls[0][3].command.play,first.play);
  await assert.rejects(h.scope.mutate('play.draft.edit','play-1',2,{command:{op:'save',play}}),{code:'scope-denied'});
  assert.equal(h.calls.length,1);
});
test('only Head Coach can publish; Player and Manager cannot create a draft',async()=>{
  for(const roles of [['team_assistant'],['team_player'],['team_manager']]){
    const h=harness(roles);
    await assert.rejects(h.scope.mutate('play.publish','play-1',2,{revisionId:'rev-1'}),{code:'role-denied'});
    assert.equal(h.calls.length,0);
  }
  for(const roles of [['team_player'],['team_manager']]){
    const h=harness(roles);
    await assert.rejects(h.scope.mutate('play.draft.edit','team-a',0,{command:{op:'create',play:first.play}}),{code:'role-denied'});
    assert.equal(h.calls.length,0);
  }
  const h=harness(['team_coach','team_manager']);
  const p=h.scope.mutate('play.publish','play-1',2,{revisionId:'rev-1'});
  h.finish({version:3});
  assert.equal((await p).stillCurrent,true);
  assert.equal(h.calls[0][0].role,'team_coach');
});
test('stale editor epoch and forged version/identity fields fail closed',async()=>{
  const h=harness(['team_coach']);
  await assert.rejects(h.scope.mutate('play.publish','play-1',2,{revisionId:'rev-1',expectedVersion:999}),{code:'invalid-play'});
  await assert.rejects(h.scope.mutate('play.publish','play-1',-1,{revisionId:'rev-1'}),{code:'invalid-play'});
  h.state.epoch++;
  await assert.rejects(h.scope.mutate('play.publish','play-1',2,{revisionId:'rev-1'}),{code:'scope-denied'});
  assert.equal(h.calls.length,0);
});
