import test from 'node:test';
import assert from 'node:assert/strict';
import { teamRef, teamSeasonRef, playerParticipationRef, teamAppointmentRef, domainReferenceIssues } from '../site/p05-domain.js';

const fixture = () => ({
  id:'team1',team:{name:'Tags',sport:'Oztag',clubId:'club1'},
  players:[{id:'p1',personId:'shared-1',number:'7',positions:['Link'],status:'available',jerseys:[{number:'7'}]}],
  seasons:[{id:'s26',status:'completed',squad:[{playerId:'p1',number:'7',positions:['Link'],status:'available'}],staff:[{id:'staff1',role:'Coach'}]}],
  clubs:[{id:'club1',name:'Example Club',sport:'Oztag'}],
  teams:[{id:'team2',team:{name:'League Tags',sport:'League tag',clubId:'club1'},
    players:[{id:'p2',personId:'shared-1',number:'11',positions:['Fullback'],status:'available',jerseys:[]}],
    seasons:[{id:'s26',status:'completed',squad:[{playerId:'p2',number:'11',positions:['Fullback'],status:'available'}],staff:[]}]}]
});
test('team and season composite references preserve root and sport overrides',()=>{
 const w=fixture(),before=JSON.stringify(w);
 assert.equal(teamRef(w,'team1').legacyRoot,true);
 assert.equal(teamRef(w,'team2').sport,'League tag');
 assert.notEqual(teamSeasonRef(w,'team1','s26').key,teamSeasonRef(w,'team2','s26').key);
 assert.equal(teamSeasonRef(w,'team2','missing'),null);
 assert.equal(JSON.stringify(w),before);
});
test('one identity has independent multi-sport season participation and numbers',()=>{
 const w=fixture(),a=playerParticipationRef(w,'team1','s26','p1'),b=playerParticipationRef(w,'team2','s26','p2');
 assert.equal(a.personId,b.personId);
 assert.notEqual(a.key,b.key);
 assert.deepEqual(a.positions,['Link']);
 assert.deepEqual(b.positions,['Fullback']);
 assert.equal(a.number,'7');assert.equal(b.number,'11');
 assert.equal(a.historical,true);
 assert.equal(playerParticipationRef(w,'team2','s26','p1'),null);
 assert.throws(()=>a.positions.push('Wing'),TypeError);
});
test('staff reference is scoped to a season and stable staff source id',()=>{
 const w=fixture();
 assert.equal(teamAppointmentRef(w,'team1','s26','staff1','Coach').staffId,'staff1');
 assert.equal(teamAppointmentRef(w,'team2','s26','staff1','Coach'),null);
 assert.equal(teamAppointmentRef(w,'team1','s26','staff1','Manager'),null);
});
test('missing and duplicate IDs and dangling squad records are diagnosed without modifying data',()=>{
 const w=fixture(),before=JSON.stringify(w);
 assert.deepEqual(domainReferenceIssues(w),[]);
 w.teams[0].id='team1';
 assert.ok(domainReferenceIssues(w).includes('duplicate-team-id'));
 w.teams[0].id='team2';
 w.teams[0].seasons[0].squad.push({playerId:'absent'});
 assert.ok(domainReferenceIssues(w).includes('dangling-squad-player:team2:s26'));
 assert.equal(teamRef(w,'team2').sport,'League tag');
});
test('only reference fields escape, never private person or guardian review ledgers',()=>{
 const w=fixture();w.peopleReviews=[{secret:'private'}];w.guardianReviews=[{secret:'private'}];
 const serialized=JSON.stringify([teamRef(w,'team1'),teamSeasonRef(w,'team1','s26'),playerParticipationRef(w,'team1','s26','p1')]);
 assert.ok(!serialized.includes('private'));
});
