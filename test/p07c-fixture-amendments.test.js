import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureSnapshot,planFixtureRevision,commitFixtureRevision } from '../site/p07-fixture-amendments.js';
import { teamView } from '../site/vault.js';
const sample=()=>({id:'match1',date:'2026-11-12',start:'09:30',venue:'Field A',field:'1',
  status:'scheduled',entryId:'e1',seasonId:'s1',result:{us:3,them:2},
  rsvp:{child1:'yes'},crew:[{personId:'v1',role:'coach',confirmed:true}],lineupId:'lu1',
  opponent:'Rivals',coachNotes:'PRIVATE STAFF NOTE'});
const option={reason:'Organiser contacted coach; unverified',confirmed:true,at:'2026-10-23T08:00:00.000Z',taskDisposition:'move'};
test('P07C planning date/venue change is read-only and preserves provenance warnings',()=>{
 const match=sample(),before=JSON.stringify(match);
 const plan=planFixtureRevision(match,{date:'2026-11-13',start:'10:00',venue:'Field B'});
 assert.equal(plan.changed,true);
 assert.deepEqual(plan.fields,['date','start','venue']);
 assert.equal(plan.after.status,'scheduled');
 assert.ok(plan.warnings.some(x=>/RSVPs/.test(x)));
 assert.equal(JSON.stringify(match),before);
});
test('P07C no mutation occurs without consent and a meaningful reason',()=>{
 const m=sample(),before=JSON.stringify(m),fields={date:'2026-11-13'};
 assert.match(commitFixtureRevision(m,fields,{...option,expectedBefore:fixtureSnapshot(m),confirmed:false}).error,/confirmation/);
 assert.match(commitFixtureRevision(m,fields,{...option,expectedBefore:fixtureSnapshot(m),reason:'x'}).error,/reason/);
 assert.equal(JSON.stringify(m),before);
});
test('P07C controlled update retains result, crew, RSVP, competition and lineup IDs',()=>{
 const m=sample(),prior=JSON.stringify({result:m.result,crew:m.crew,rsvp:m.rsvp,
    entryId:m.entryId,seasonId:m.seasonId,lineupId:m.lineupId});
 const expectedBefore=fixtureSnapshot(m);
 const result=commitFixtureRevision(m,{date:'2026-11-13',start:'10:00',venue:'Field B'},
   {...option,expectedBefore});
 assert.equal(result.error,undefined);
 assert.equal(m.fixtureRevisions.length,1);
 assert.deepEqual(m.fixtureRevisions[0].before,expectedBefore);
 assert.equal(m.fixtureRevisions[0].after.date,'2026-11-13');
 assert.equal(m.fixtureRevisions[0].taskDisposition,'move');
 assert.equal(JSON.stringify({result:m.result,crew:m.crew,rsvp:m.rsvp,
    entryId:m.entryId,seasonId:m.seasonId,lineupId:m.lineupId}),prior);
});
test('P07C stale reviewed snapshot cannot overwrite newer fixture changes',()=>{
 const m=sample(),expectedBefore=fixtureSnapshot(m);
 m.venue='Updated by another action';
 const before=JSON.stringify(m);
 assert.match(commitFixtureRevision(m,{venue:'Other venue'},
   {...option,expectedBefore}).error,/changed after review/);
 assert.equal(JSON.stringify(m),before);
});
test('P07C postponement, cancellation and restoration append audit history',()=>{
 const m=sample();
 for(const [status,taskDisposition] of [['postponed','keep'],['cancelled','cancel'],['scheduled','none']]){
   const prior=fixtureSnapshot(m);
   const result=commitFixtureRevision(m,{status},{...option,expectedBefore:prior,
     taskDisposition,at:'2026-10-23T08:00:00.000Z'});
   assert.equal(result.error,undefined);
 }
 assert.equal(m.fixtureRevisions.length,3);
 assert.deepEqual(m.fixtureRevisions.map(x=>x.after.status),['postponed','cancelled','scheduled']);
 assert.equal(m.result.us,3);
});
test('P07C rejects invalid dates, start times, states and unsafe task deletion',()=>{
 const m=sample();
 for(const proposed of [{date:'2026-02-31'},{start:'29:50'},{status:'verified-official'}])
   assert.ok(planFixtureRevision(m,proposed).error);
 assert.ok(commitFixtureRevision(m,{date:'2026-11-13'},
   {...option,expectedBefore:fixtureSnapshot(m),taskDisposition:'remove'}).error);
 assert.equal(m.fixtureRevisions,undefined);
});
test('P07C no-op changes do not create fictitious audit records',()=>{
 const m=sample();
 assert.equal(planFixtureRevision(m,{date:m.date,venue:m.venue}).changed,false);
 assert.match(commitFixtureRevision(m,{date:m.date},{...option,expectedBefore:fixtureSnapshot(m)}).error,/No fixture/);
});
test('P07C coach-only reasons/history do not leak into team player export',()=>{
 const m=sample();
 commitFixtureRevision(m,{date:'2026-11-13'},{...option,expectedBefore:fixtureSnapshot(m),
   reason:'PRIVATE medical reason coach-only'});
 const team={team:{name:'U12',sport:'Oztag'},players:[],sessions:[],matches:[m],tasks:[],notices:[],lineups:[]};
 const published=JSON.stringify(teamView(team));
 assert.equal(published.includes('PRIVATE'),false);
 assert.equal(published.includes('fixtureRevisions'),false);
 assert.equal(published.includes('crew'),false);
 assert.equal(published.includes('rsvp'),false);
 assert.equal(JSON.stringify(m).includes('PRIVATE medical'),true);
});
