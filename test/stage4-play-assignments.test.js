import test from 'node:test';
import assert from 'node:assert/strict';
import {validateStage3D5,isStage3D5Read} from '../src/stage3d5-management-contract.js';
import {createCloudManagementClient} from '../site/cloud-management.js';
const input={sessionId:'training-1',sessionVersion:2,playId:'play-1',revisionId:'rev-1',expectedVersion:0};
const command=(role,action,details=input)=>({teamId:'team-a',role,action,input:details});
test('assignments contract has exact action and role scope; no forged approval',()=>{
 assert(validateStage3D5(command('team_assistant','play.assignment.propose')));
 assert(validateStage3D5(command('team_coach','play.assignment.approve')));
 for(const role of ['team_assistant','team_manager','team_player','team_volunteer'])assert.equal(validateStage3D5(command(role,'play.assignment.approve')),null);
 assert.equal(validateStage3D5(command('team_player','play.assignment.propose')),null);
 assert.equal(validateStage3D5(command('team_coach','play.assignment.propose',{...input,approvedBy:'forged'})),null);
 assert.equal(validateStage3D5(command('team_coach','play.assignment.propose',{...input,sessionVersion:-1})),null);
 assert(isStage3D5Read('play.assignment.read'));
 assert(validateStage3D5(command('team_player','play.assignment.read',{sessionId:'training-1'})));
});
test('connected assignment requests retain current exact role and reject revoked or foreign grant',async()=>{
 const calls=[];let grants=[{teamId:'team-a',role:'team_assistant'}];
 const api=createCloudManagementClient({origin:'https://example.test',identity:{myTeamContexts:async()=>grants,verifiedBearer:async()=> 'synthetic-token'},
 fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,code:'committed',data:{version:1}})};}});
 const ctx={teamId:'team-a',roles:['team_assistant']};
 assert.deepEqual(await api.call(ctx,'play.assignment.propose',input),{version:1});
 assert.deepEqual(calls[0],command('team_assistant','play.assignment.propose'));
 await assert.rejects(api.call(ctx,'play.assignment.approve',input),{code:'scope-denied'});
 grants=[{teamId:'team-b',role:'team_assistant'}];
 await assert.rejects(api.call(ctx,'play.assignment.propose',input),{code:'access-revoked'});
 assert.equal(calls.length,1);
});
