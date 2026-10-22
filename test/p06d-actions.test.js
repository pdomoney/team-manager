import test from 'node:test';
import assert from 'node:assert/strict';
import { clubCrewActions } from '../site/p06-actions.js';

function workspace() {
 return {id:'team1',team:{name:'Oztag',sport:'Oztag',clubId:'club1'},players:[],
   matches:[{id:'m1',date:'2026-11-14',status:'scheduled',crew:[]}],
   clubs:[{id:'club1',name:'A',sport:'Oztag'},{id:'club2',name:'B',sport:'Rugby league'}],
   teams:[{id:'team2',team:{name:'League',sport:'Rugby league',clubId:'club2'},players:[],matches:[{id:'m2',date:'2026-11-14'}]}],
   matchOfficials:[{id:'v1',name:'PRIVATE PERSON',privateNotes:'PRIVATE HEALTH'}]};
}
test('P06D absent match policy produces a review action, not fictitious compliance',()=>{
 const w=workspace(),before=JSON.stringify(w),out=clubCrewActions(w,'club1');
 assert.equal(out.length,1);assert.equal(out[0].category,'policy');
 assert.equal(out[0].matchId,'m1');assert.equal(JSON.stringify(w),before);
});
test('P06D actions are scoped to a club and hide volunteer private data',()=>{
 const a=clubCrewActions(workspace(),'club1'),b=clubCrewActions(workspace(),'club2');
 assert.equal(a[0].matchId,'m1');assert.equal(b[0].matchId,'m2');
 assert.equal(JSON.stringify(a).includes('PRIVATE'),false);
 assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a[0]));
});
test('P06D no unrelated club fixtures appear',()=>{
 assert.deepEqual(clubCrewActions(workspace(),'unknown'),[]);
});
test('P06D canceled fixtures do not generate new readiness actions',()=>{
 const w=workspace();w.matches[0].status='cancelled';
 assert.equal(clubCrewActions(w,'club1').length,0);
});
