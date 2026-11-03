import test from 'node:test';
import assert from 'node:assert/strict';
import {rsvpOf,rsvpCounts,setRsvp} from '../site/model.js';
import {teamView} from '../site/vault.js';

const sample=()=>({id:'fixture-1',date:'2026-11-14',status:'scheduled',opponent:'Example Opposition',
  rsvp:{},result:{us:0,them:0},lineupId:'starting',coachNotes:'private Coach note'});

test('Manager RSVP updates shared fixture availability without changing results and Coach fields',()=>{
 const rec=sample(),other=JSON.stringify({result:rec.result,lineupId:rec.lineupId,coachNotes:rec.coachNotes});
 setRsvp(rec,'player-1','yes','2026-11-03T01:00:00.000Z','fictional-team-manager-preview','qa-09');
 assert.equal(rsvpOf(rec,'player-1'),'yes');
 assert.deepEqual(rec.rsvp['player-1'],{
   v:'yes',at:'2026-11-03T01:00:00.000Z',via:'fictional-team-manager-preview',actorProfileId:'qa-09'
 });
 assert.deepEqual(rsvpCounts(rec,[{id:'player-1'},{id:'player-2'}]),{yes:1,no:0,maybe:0,none:1});
 assert.equal(JSON.stringify({result:rec.result,lineupId:rec.lineupId,coachNotes:rec.coachNotes}),other);
});
test('Coach RSVP defaults preserve original provenance and toggling clear removes only one answer',()=>{
 const rec=sample();
 setRsvp(rec,'player-1','no','2026-11-03T01:00:00.000Z');
 setRsvp(rec,'player-2','maybe','2026-11-03T01:00:00.000Z','fictional-team-manager-preview','qa-09');
 assert.deepEqual(rec.rsvp['player-1'],{v:'no',at:'2026-11-03T01:00:00.000Z',via:'coach'});
 setRsvp(rec,'player-2','','2026-11-03T01:01:00.000Z','fictional-team-manager-preview','qa-09');
 assert.equal(rsvpOf(rec,'player-2'),'');
 assert.equal(rsvpOf(rec,'player-1'),'no');
});
test('Fictional Manager provenance must not accept a real person or unknown source',()=>{
 const rec=sample();
 assert.throws(()=>setRsvp(rec,'player-1','yes',undefined,'fictional-team-manager-preview','admin'),
   /requires a QA profile/);
 assert.throws(()=>setRsvp(rec,'player-1','yes',undefined,'untrusted-service','qa-09'),
   /Unsupported RSVP recording source/);
 assert.deepEqual(rec.rsvp,{});
});
test('Player export contains no private RSVP values, actor or Coach notes',()=>{
 const m=sample();
 setRsvp(m,'player-1','no','2026-11-03T01:00:00.000Z','fictional-team-manager-preview','qa-09');
 const team={team:{name:'Example',sport:'Oztag'},players:[{id:'player-1',name:'Sample Player'}],
   sessions:[],matches:[m],tasks:[],notices:[],lineups:[]};
 const pub=JSON.stringify(teamView(team));
 assert.equal(pub.includes('fictional-team-manager-preview'),false);
 assert.equal(pub.includes('qa-09'),false);
 assert.equal(pub.includes('rsvp'),false);
 assert.equal(pub.includes('Coach note'),false);
 assert.equal(pub.includes('player-1')&&pub.includes('Sample Player'),true);
});
