import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStage3D5,isStage3D5Read,COMMUNICATION_ACTIONS} from '../src/stage3d5-management-contract.js';
const id='message-'+'a'.repeat(32),nid='notice-'+'b'.repeat(32);
const req=(action,input={},role='team_coach')=>validateStage3D5({teamId:'team-a',role,action,input});
test('communications actions preserve exact-team staff boundary',()=>{
 for(const action of COMMUNICATION_ACTIONS){
  const x=action.endsWith('archived')?{}:action.startsWith('messages.')?{entries:[{id,expectedVersion:0}]}:
   action==='notice.remove'?{entries:[{id:nid,expectedVersion:0}]}:{noticeId:nid,expectedVersion:0,title:'New title',body:'Correct information',audience:'all'};
  assert(req(action,x),action);assert(req(action,x,'team_manager'),action);
  for(const role of ['team_player','team_volunteer','team_assistant','platform_owner','club_admin'])assert.equal(req(action,x,role),null);
 }
});
test('archive and remove batches are bounded and reject duplicate or forged records',()=>{
 const good={id,expectedVersion:1};
 for(const entries of [[],[good,good],[{...good,teamId:'other'}],[{id,expectedVersion:-1}],[{id:nid,expectedVersion:1}],Array(21).fill(good)])
  assert.equal(req('messages.remove',{entries}),null);
 assert.equal(req('messages.remove',{entries:[good],isAdmin:true}),null);
 assert(req('messages.remove',{entries:[good]}));
});
test('notice correction rejects incomplete placeholders, wrong IDs and control characters',()=>{
 const good={noticeId:nid,expectedVersion:1,title:'Notice',body:'Training starts at 6',audience:'players'};
 assert(req('notice.correct',good));assert(req('notice.edit',good));
 for(const change of [{body:'[Enter details before sending]'},{body:'A\nB'},{title:''},{noticeId:id},{audience:'public'},{expectedVersion:1.5}])
  assert.equal(req('notice.correct',{...good,...change}),null);
});
test('archived lists are read-only and cannot request deleted records',()=>{
 for(const action of ['messages.archived','notice.archived']){assert(isStage3D5Read(action));assert.equal(req(action,{includeRemoved:true}),null);}
 assert(!isStage3D5Read('messages.remove'));
});
