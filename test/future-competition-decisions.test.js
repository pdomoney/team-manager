import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewFixtureOperation,reviewResultOperation} from '../site/future-competition-decisions.js';

const at='2026-11-03T10:00:00Z';
const official={id:'f1',kind:'official',teamId:'Rangers-U16',competitionId:'NSW-Cup'};
const friendly={id:'f2',kind:'friendly',teamId:'Rangers-U16'};
const auth=(actorId,action='fixture:manage')=>({
 status:'active',actorId,competitionId:'NSW-Cup',action,approvedBy:'competition-office',
 evidenceRef:'comp-approval-01',expiresAt:'2026-12-01T00:00:00Z'
});
const req=(operation,fixture=official,delegation)=>({
 actorId:'manager-1',role:'team_manager',actorTeamId:'Rangers-U16',
 fixture,operation,delegation,at
});

test('D06: Manager may propose official fixture move but cannot commit without authority',()=>{
 assert.equal(reviewFixtureOperation(req('propose')).allowed,true);
 assert.equal(reviewFixtureOperation(req('reschedule')).allowed,false);
 const granted=reviewFixtureOperation(req('reschedule',official,auth('manager-1')));
 assert.equal(granted.allowed,true);
 assert.equal(granted.official,true);
 assert.equal(reviewFixtureOperation(req('reschedule',official,
   {...auth('manager-1'),competitionId:'Other-league'})).allowed,false);
 assert.equal(reviewFixtureOperation(req('reschedule',official,
   {...auth('manager-1'),expiresAt:'2026-10-01T00:00:00Z'})).allowed,false);
});
test('D06: higher role title is not sufficient to edit an official draw',()=>{
 const p={...req('publish'),actorId:'club-admin-1',role:'club_admin'};
 assert.equal(reviewFixtureOperation(p).allowed,false);
 assert.equal(reviewFixtureOperation({...p,delegation:auth('club-admin-1')}).allowed,true);
 assert.equal(reviewFixtureOperation({...p,delegation:{...auth('club-admin-1'),status:'proposed'}}).allowed,false);
});
test('D07: friendly changes are allowed for assigned team, not another team',()=>{
 assert.equal(reviewFixtureOperation(req('create',friendly)).allowed,true);
 assert.equal(reviewFixtureOperation(req('cancel',friendly)).allowed,true);
 assert.equal(reviewFixtureOperation({...req('reschedule',friendly),actorTeamId:'Comets-U12'}).allowed,false);
 assert.equal(reviewFixtureOperation({...req('reschedule',friendly),role:'player'}).allowed,false);
 assert.equal(reviewFixtureOperation(req('publish',friendly)).allowed,false);
});
const appointment={status:'approved',actorId:'volunteer-1',fixtureId:'f1',
 duty:'scorekeeper',approvedBy:'team-manager',expiresAt:'2026-12-01T00:00:00Z'};
test('D08: appointed scorekeeper or Team Manager may record provisional only',()=>{
 let r=reviewResultOperation({actorId:'volunteer-1',role:'helper',fixtureId:'f1',
   operation:'record-provisional',appointment,at});
 assert.equal(r.allowed,true);
 assert.equal(r.official,false);
 r=reviewResultOperation({actorId:'manager-1',role:'team_manager',fixtureId:'f1',
   operation:'record-provisional',appointment:{...appointment,actorId:'manager-1',duty:'team_manager'},at});
 assert.equal(r.allowed,true);
 assert.equal(r.official,false);
 for(const bad of [
   {...appointment,status:'proposed'},
   {...appointment,fixtureId:'another-fixture'},
   {...appointment,expiresAt:'2026-11-01T00:00:00Z'}
 ])assert.equal(reviewResultOperation({actorId:'volunteer-1',role:'helper',
   fixtureId:'f1',operation:'record-provisional',appointment:bad,at}).allowed,false);
});
test('D08: final official result requires independent confirmation + delegated publication',()=>{
 const base={actorId:'competition-1',role:'competition_manager',
   fixtureId:'f1',competitionId:'NSW-Cup',operation:'publish',at};
 assert.equal(reviewResultOperation(base).allowed,false);
 assert.equal(reviewResultOperation({...base,confirmation:{
   fixtureId:'f1',officialId:'competition-1',status:'verified',evidenceRef:'signed-score',
     auditId:'confirmation-1'},
   delegation:auth('competition-1','result:publish')}).allowed,false);
 assert.equal(reviewResultOperation({...base,confirmation:{
   fixtureId:'f1',officialId:'referee-1',status:'proposed',evidenceRef:'signed-score',
     auditId:'confirmation-1'},
   delegation:auth('competition-1','result:publish')}).allowed,false);
 assert.equal(reviewResultOperation({...base,confirmation:{
   fixtureId:'f1',officialId:'referee-1',status:'verified',evidenceRef:'signed-score',
     auditId:'confirmation-1'},
   delegation:auth('competition-1','result:publish')}).allowed,true);
 assert.equal(reviewResultOperation({...base,confirmation:{
   fixtureId:'f1',officialId:'referee-1',status:'verified',evidenceRef:'signed-score',
     auditId:'confirmation-1'},
   delegation:auth('manager-1','result:publish')}).allowed,false);
 assert.equal(reviewResultOperation({actorId:'referee-1',fixtureId:'f1',operation:'confirm',
   appointment:{...appointment,actorId:'referee-1',duty:'match_official'},at}).allowed,true);
});
