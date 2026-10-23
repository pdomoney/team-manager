import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureAuthority, fixtureAuthoritySummary } from '../site/p07-fixture-authority.js';

function workspace(){
 return {id:'t1',team:{name:'Junior team',sport:'Oztag',clubId:'club1'},
   seasons:[{id:'s1',year:'2026'}],matches:[],players:[{id:'minor1',name:'PRIVATE MINOR'}],
   clubs:[{id:'club1',name:'Club 1',sport:'Oztag'},{id:'club2',name:'Club 2',sport:'Touch football'}],
   competitions:[{id:'c1',name:'2026 Tournament',format:'roundrobin',sport:'Oztag',
     entries:[{id:'e1',teamId:'t1',seasonId:'s1',status:'entered'},
       {id:'e2',teamId:'t2',seasonId:'s2',status:'entered'}]}],
   teams:[{id:'t2',team:{name:'Other club',sport:'Touch football',clubId:'club2'},
     seasons:[{id:'s2',year:'2026'}],matches:[],players:[]}],
   matchOfficials:[{id:'volunteer1',name:'PRIVATE STAFF',wwccNumber:'PRIVATE NUMBER'}]
 };
}
function game(id='m1',extra={}){
 return {id,date:'2026-11-15',start:'09:30',status:'scheduled',
   opponent:'Private opponent',crew:[{personId:'volunteer1',role:'coach',confirmed:true}],
   ...extra};
}
test('P07A legacy friendly stays a local coach fixture without official provenance',()=>{
 const ws=workspace();ws.matches=[game('friendly',{friendly:true})];
 const before=JSON.stringify(ws),r=fixtureAuthority(ws,'t1','friendly');
 assert.equal(r.kind,'friendly');
 assert.equal(r.officialFixture,false);
 assert.equal(r.recordAuthority,'local-coach-workspace');
 assert.equal(r.sourceVerification,'not-independently-verified');
 assert.equal(r.reviewRequired,false);
 assert.equal(JSON.stringify(ws),before);
});
test('P07A valid tournament linkage is a local entry, not independent organiser confirmation',()=>{
 const ws=workspace();ws.matches=[game('m1',{entryId:'e1'})];
 const r=fixtureAuthority(ws,'t1','m1');
 assert.equal(r.kind,'tournament');
 assert.equal(r.competitionId,'c1');
 assert.equal(r.entryStatus,'entered');
 assert.equal(r.officialFixture,false);
 assert.equal(r.reviewRequired,false);
});
test('P07A another team entry cannot confer fixture authority across clubs',()=>{
 const ws=workspace();ws.matches=[game('m1',{entryId:'e2'})];
 const r=fixtureAuthority(ws,'t1','m1');
 assert.equal(r.kind,'unlinked');
 assert.equal(r.entryStatus,'wrong-team');
 assert.equal(r.competitionId,'');
 assert.ok(r.issues.some(x=>/another team/.test(x)));
});
test('P07A stale entry and withdrawn entry require review, never inferred correct',()=>{
 const ws=workspace();ws.matches=[game('m1',{entryId:'gone'})];
 let r=fixtureAuthority(ws,'t1','m1');
 assert.equal(r.entryStatus,'missing');assert.equal(r.reviewRequired,true);
 ws.matches[0].entryId='e1';
 ws.competitions[0].entries[0].status='withdrawn';
 r=fixtureAuthority(ws,'t1','m1');
 assert.equal(r.entryStatus,'withdrawn');
 assert.equal(r.reviewRequired,true);
});
test('P07A sport mismatch, stale season, friendly conflict each produce review flags',()=>{
 const ws=workspace();ws.matches=[game('m1',{entryId:'e1',friendly:true})];
 ws.competitions[0].sport='Rugby league';
 ws.competitions[0].entries[0].seasonId='missing-season';
 const r=fixtureAuthority(ws,'t1','m1');
 assert.equal(r.reviewRequired,true);
 assert.equal(r.issues.length,3);
});
test('P07A cancellation remains in historic records with explicit advisory',()=>{
 const ws=workspace();ws.matches=[game('m1',{entryId:'e1',status:'cancelled'})];
 const r=fixtureAuthority(ws,'t1','m1');
 assert.equal(r.recordedStatus,'cancelled');
 assert.ok(r.issues.some(x=>/historical/.test(x)));
 assert.equal(ws.matches.length,1);
});
test('P07A summary is scoped to clubs in the workspace without personal data',()=>{
 const ws=workspace();ws.matches=[game('one',{entryId:'e1'}),game('two',{entryId:'e2'})];
 ws.teams[0].matches=[game('other',{entryId:'e2'})];
 const out=fixtureAuthoritySummary(ws,'club1'),raw=JSON.stringify(out);
 assert.equal(out.totals.fixtures,2);
 assert.equal(out.totals.linked,1);
 assert.equal(out.totals.review,1);
 assert.equal(out.totals.notIndependentlyVerified,2);
 assert.equal(raw.includes('PRIVATE'),false);
 assert.equal(raw.includes('volunteer1'),false);
 assert.equal(fixtureAuthoritySummary(ws,'missing').totals.fixtures,0);
 assert.equal(Object.isFrozen(out.fixtures),true);
});
test('P07A unknown team and match produce no invented fixture',()=>{
 const ws=workspace();
 assert.equal(fixtureAuthority(ws,'unknown','m1'),null);
 assert.equal(fixtureAuthority(ws,'t1','m1'),null);
 assert.deepEqual(fixtureAuthoritySummary(ws).totals,{
   fixtures:0,linked:0,unlinked:0,review:0,notIndependentlyVerified:0
 });
});
