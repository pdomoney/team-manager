import test from 'node:test';
import assert from 'node:assert/strict';
import {personaSession,personaRoster,personaFixtures,personaSeasons,personaAction,personaCurrentState,upgradePersonaRecords} from '../site/persona-runtime.js';
test('club administrator is scoped to selected club and can switch team within club',()=>{
 const a=personaSession('qa-05','grant:club_admin:club:qa-comets');
 assert.equal(a.allowedTeams.length,6);
 assert.equal(a.team.clubId,'qa-comets');
 const b=personaSession('qa-05','grant:club_admin:club:qa-rangers');
 assert.equal(b.allowedTeams.length,6);
 assert.ok(b.allowedTeams.every(t=>t.clubId==='qa-rangers'));
 assert.equal(b.capabilities.length,0);
});
test('coach has own training and roster but no Manager volunteer assignment',()=>{
 const p=personaSession('qa-07','grant:team_coach:team:qa-rangers-16');
 assert.deepEqual(p.sections,['Home','Squad','Training','Matches','Plays','Seasons']);
 assert.equal(p.allowedTeams.length,1);
 let q=personaAction(p,{}, {capability:'roster',teamId:p.team.id,personId:personaRoster(p).players[0].id});
 assert.equal(q.error,undefined);
 assert.equal(personaAction(p,q.records,{capability:'staff',teamId:p.team.id,personId:'x',value:'trainer'}).error,'This role cannot perform that action');
 assert.equal(personaAction(p,q.records,{capability:'roster',teamId:'qa-stars-women',personId:personaRoster(p).players[0].id}).error,'Action is outside the selected person and team scope');
});
test('manager operates different clubs only within assigned exact context',()=>{
 const a=personaSession('qa-18','grant:team_manager:team:qa-stars-women');
 assert.equal(a.role,'team_manager');assert.equal(a.team.id,'qa-stars-women');
 const b=personaSession('qa-18','grant:team_manager:team:qa-comets-u16');
 assert.equal(b.team.id,'qa-comets-u16');
 const volunteer=personaRoster(b).volunteers[0];
 const result=personaAction(b,{}, {capability:'staff',teamId:b.team.id,personId:volunteer.id,value:'trainer'});
 assert.equal(result.state.staff[volunteer.id],'trainer');
 assert.equal(personaCurrentState(a,result.records).staff[volunteer.id],undefined);
 assert.ok(!b.sections.includes('Plays'));
});
test('player can respond for own team, never edit another team or its roster',()=>{
 const p=personaSession('qa-14','membership:player:team:qa-comets-mixed');
 assert.equal(p.memberships.length,2);assert.deepEqual(new Set(p.memberships.map(t=>t.sport)),new Set(['Oztag','Touch']));
 assert.equal(personaRoster(p).players[0].name,'Senior Multi-sport Player');
 const a=personaAction(p,{}, {capability:'own-availability',teamId:p.team.id,value:'yes'});
 assert.equal(a.state.availability,'yes');
 const other=personaSession('qa-14','membership:player:team:qa-stars-women');
 assert.equal(personaCurrentState(other,a.records).availability,'pending');
 assert.equal(personaAction(p,a.records,{capability:'roster',teamId:p.team.id,personId:personaRoster(p).players[0].id}).error,'This role cannot perform that action');
 assert.equal(personaSeasons(p).length,6);
});
test('inactive grants cannot expose teams or actions',()=>{
 for(const id of ['qa-19','qa-20']){
  const p=personaSession(id);assert.equal(p.role,'none');assert.equal(p.allowedTeams.length,0);
  assert.equal(personaFixtures(p).length,0);
  assert.match(personaAction(p,{}, {capability:'roster',teamId:'qa-rangers-16'}).error,/No assigned team/);
 }
});
test('owner sees 18 fictional teams and scoped roster data',()=>{
 const p=personaSession('qa-01');
 assert.equal(p.allowedTeams.length,18);
 assert.equal(p.clubs.length,3);
 assert.equal(personaFixtures(p).length,18);
 assert.equal(personaRoster(p).players.length,p.team.playerCount);
});

test('one Coach switches assigned teams across clubs with actions isolated per context',()=>{
 const a=personaSession('qa-07','grant:team_coach:team:qa-rangers-16');
 const b=personaSession('qa-07','grant:team_coach:team:qa-stars-open');
 assert.equal(a.team.clubId,'qa-rangers');assert.equal(b.team.clubId,'qa-stars');
 assert.equal(a.role,'team_coach');assert.equal(b.role,'team_coach');
 const change=personaAction(a,{}, {capability:'training',teamId:a.team.id,value:'Defense drill'});
 assert.equal(change.state.training.length,1);
 assert.equal(personaCurrentState(b,change.records).training.length,0);
 assert.equal(personaAction(b,change.records,{capability:'training',teamId:a.team.id,value:'Wrong club'}).error,
   'Action is outside the selected person and team scope');
});

test('guardian sees only linked fictional children teams, not every club roster',()=>{
 const comets=personaSession('qa-16','membership:guardian:club:qa-comets');
 const stars=personaSession('qa-16','membership:guardian:club:qa-stars');
 assert.deepEqual(comets.allowedTeams.map(t=>t.id),['qa-comets-juniors']);
 assert.deepEqual(stars.allowedTeams.map(t=>t.id),['qa-stars-u12']);
 assert.equal(comets.sections.includes('Squad'),false);
 assert.equal(comets.capabilities.includes('roster'),false);
 const helper=personaSession('qa-17');
 assert.deepEqual(helper.allowedTeams.map(t=>t.id),['qa-comets-mixed']);
 assert.equal(helper.capabilities.length,0);
});

test('manager and club admin see the same team roster and staffing records',()=>{
  const manager=personaSession('qa-09','grant:team_manager:team:qa-comets-mixed');
  const admin=personaSession('qa-05','grant:club_admin:club:qa-comets','qa-comets-mixed');
  const player=personaRoster(manager).players[0];
  const volunteer=personaRoster(manager).volunteers[0];
  const one=personaAction(manager,{}, {capability:'attendance',teamId:manager.team.id,
    personId:player.id,value:'yes'});
  const two=personaAction(manager,one.records,{capability:'staff',teamId:manager.team.id,
    personId:volunteer.id,value:'trainer'});
  assert.equal(personaCurrentState(admin,two.records).attendance[player.id],'yes');
  assert.equal(personaCurrentState(admin,two.records).staff[volunteer.id],'trainer');
  assert.ok(Object.hasOwn(two.records,'team:qa-comets-mixed'));
  assert.equal(personaAction(admin,two.records,{capability:'staff',teamId:admin.team.id,
    personId:volunteer.id,value:'helper'}).error,'This role cannot perform that action');
});

test('player availability is per person while team records are shared',()=>{
 const a=personaSession('qa-14','membership:player:team:qa-comets-mixed');
 const b=personaSession('qa-18','membership:player:team:qa-comets-mixed');
 const changed=personaAction(a,{}, {capability:'own-availability',teamId:a.team.id,value:'yes'});
 assert.equal(personaCurrentState(a,changed.records).availability,'yes');
 assert.equal(personaCurrentState(b,changed.records).availability,'pending');
 const changedAgain=personaAction(b,changed.records,{capability:'own-availability',teamId:b.team.id,value:'no'});
 assert.equal(personaCurrentState(a,changedAgain.records).availability,'yes');
 assert.equal(personaCurrentState(b,changedAgain.records).availability,'no');
 assert.equal(Object.keys(changedAgain.records).filter(k=>k.startsWith('team:')).length,1);
});

test('PR144 role-scoped data upgrades reversibly into shared team records',()=>{
 const oldKey='qa-09|grant:team_manager:team:qa-comets-mixed|qa-comets-mixed';
 const old={'selected':{'qa-comets-mixed-player-1':true},staff:{},attendance:{},training:[],
   availability:'pending'};
 const source={[oldKey]:old};
 const updated=upgradePersonaRecords(source);
 assert.deepEqual(updated[oldKey],old,'do not remove old raw state');
 assert.equal(updated['team:qa-comets-mixed'].selected['qa-comets-mixed-player-1'],true);
 assert.deepEqual(upgradePersonaRecords(updated),updated,'idempotent migration');
 assert.deepEqual(source,{[oldKey]:old},'migration must not mutate source');
 const malicious=upgradePersonaRecords({
  'qa-19|inactive:team_coach:team:qa-rangers-16|qa-rangers-16':old,
  'qa-09|grant:team_manager:team:qa-rangers-16|qa-stars-women':old
 });
 assert.equal(Object.keys(malicious).filter(k=>k.startsWith('team:')).length,0,
   'inactive or wrong-team contexts cannot be imported into shared records');
});

test('Coach lineup toggle uses existing fixture selection on first click',()=>{
 const coach=personaSession('qa-07','grant:team_coach:team:qa-rangers-16');
 const first=personaRoster(coach).players[0];
 assert.equal(first.selected,true);
 const a=personaAction(coach,{}, {capability:'roster',teamId:coach.team.id,personId:first.id});
 assert.equal(a.state.selected[first.id],false);
 const b=personaAction(coach,a.records,{capability:'roster',teamId:coach.team.id,personId:first.id});
 assert.equal(b.state.selected[first.id],true);
});
