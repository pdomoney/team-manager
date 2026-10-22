import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureReadinessIndex } from '../site/p06-readiness.js';

const fixture = () => ({
  id:'team1',team:{name:'Club One Oztag',sport:'Oztag',clubId:'club1'},
  matches:[{id:'m1',date:'2026-11-14',status:'scheduled',opponent:'Test team',crew:[]}],
  players:[],seasons:[],matchOfficials:[{id:'volunteer1',name:'PRIVATE NAME',privateNotes:'PRIVATE MEDICAL INFORMATION'}],
  clubs:[{id:'club1',name:'Club One',sport:'Oztag'},{id:'club2',name:'Club Two',sport:'Rugby league'}],
  teams:[{id:'team2',team:{name:'Club Two',sport:'Rugby league',clubId:'club2'},matches:[{id:'m2',date:'2026-11-14',status:'scheduled'}],players:[],seasons:[]}]
});

test('P06C club readiness includes only fixtures in selected club',()=>{
 const w=fixture(),before=JSON.stringify(w);
 const r=fixtureReadinessIndex(w,'club1');
 assert.equal(r.totals.fixtures,1);
 assert.equal(r.totals.unverified,1);
 assert.equal(r.fixtures[0].matchId,'m1');
 assert.equal(r.fixtures[0].state,'unverified');
 assert.equal(JSON.stringify(w),before);
});
test('P06C no personal volunteer or accreditation evidence in aggregate',()=>{
 const r=fixtureReadinessIndex(fixture(),'club1'), serialized=JSON.stringify(r);
 assert.equal(serialized.includes('PRIVATE'),false);
 assert.equal(serialized.includes('volunteer1'),false);
 assert.equal(Object.isFrozen(r.fixtures),true);
});
test('P06C unknown club discloses no fixtures',()=>{
 const r=fixtureReadinessIndex(fixture(),'other-club');
 assert.deepEqual(r.totals,{fixtures:0,covered:0,attention:0,unverified:0});
});
test('P06C no official policy is never labelled match-ready',()=>{
 const w=fixture();
 w.matches[0].crew=[{personId:'volunteer1',role:'coach',confirmed:true}];
 const r=fixtureReadinessIndex(w,'club1');
 assert.equal(r.fixtures[0].state,'unverified');
 assert.equal(r.fixtures[0].confirmed,null);
});
