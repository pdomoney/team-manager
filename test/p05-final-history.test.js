import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { seasonHistoryIndex, domainReferenceIssues, teamAppointmentRef } from '../site/p05-domain.js';

const ws = () => ({
  id:'team1',team:{name:'Tag team',sport:'Oztag',staff:[{id:'coach-1',role:'Coach',name:'A Coach'}]},
  players:[{id:'p1',name:'Player A',personId:'person-1',number:'7',positions:['Link'],status:'available',jerseys:[{number:'7'}]}],
  seasons:[{id:'s26',name:'2026',status:'active',squad:[{playerId:'p1',number:'7',positions:['Link'],status:'available',reg:''}],staff:[{id:'coach-1',role:'Coach',name:'A Coach'}]}],
  teams:[{id:'team2',team:{name:'League tag',sport:'League tag'},players:[{id:'p2',personId:'person-1',number:'9',positions:['Fullback'],status:'available',jerseys:[]}],
    seasons:[{id:'s26',name:'2026',status:'completed',squad:[{playerId:'p2',number:'9',positions:['Fullback'],status:'available'}],staff:[]}]}],
  clubs:[],competitions:[],sessions:[],matches:[],tasks:[],messages:[],notices:[],lineups:[],
  guardianReviews:[{secret:'private guardian'}],peopleReviews:[{secret:'private identity'}]
});

test('P05 historical index is read-only and records distinct sport-scoped references',()=>{
 const w=ws(), before=JSON.stringify(w);
 const a=seasonHistoryIndex(w,'team1'),b=seasonHistoryIndex(w,'team2');
 assert.equal(a.length,1);assert.equal(b.length,1);
 assert.equal(a[0].sport,'Oztag');assert.equal(b[0].sport,'League tag');
 assert.notDeepEqual(a[0].playerRefs,b[0].playerRefs);
 assert.equal(a[0].staffRefs.length,1);
 assert.equal(b[0].staffRefs.length,0);
 assert.equal(JSON.stringify(w),before);
 assert.ok(!JSON.stringify([a,b]).includes('private'));
 assert.throws(()=>a.push('bad'),TypeError);
});
test('P05 rollover freezes staff references and historic numbers without moving jerseys',()=>{
 const w=ws(), prior=JSON.stringify(w.players[0].jerseys);
 const next=M.rollover(w,{name:'2027',carry:[{playerId:'p1',number:'11',positions:['Wing']}],staff:[],newPlayers:[],activate:true},new Date('2026-10-21T00:00:00Z'));
 assert.equal(w.seasons[0].status,'completed');
 assert.equal(teamAppointmentRef(w,'team1','s26','coach-1','Coach').staffId,'coach-1');
 const refs=seasonHistoryIndex(w,'team1');
 assert.equal(refs.length,2);
 assert.equal(refs[0].historical,true);
 assert.equal(refs[1].seasonId,next.season.id);
 assert.equal(JSON.stringify(w.players[0].jerseys),prior);
 assert.equal(M.seasonLens(w,'s26').players[0].number,'7');
 assert.equal(M.seasonLens(w,next.season.id).players[0].number,'11');
});
test('P05 detects colliding season staff IDs rather than implying one appointment',()=>{
 const w=ws();w.seasons[0].staff.push({id:'coach-1',role:'Manager',name:'Another'});
 assert.ok(domainReferenceIssues(w).includes('duplicate-season-staff-id:team1:s26'));
 assert.equal(teamAppointmentRef(w,'team1','s26','coach-1','Manager')?.staffId,'coach-1');
 assert.equal(seasonHistoryIndex(w,'team1')?.[0].staffRefs.length,2);
});
test('P05 rejects ambiguous season references and never mutates records',()=>{
 const w=ws(),before=JSON.stringify(w);w.seasons.push({...w.seasons[0]});
 assert.equal(seasonHistoryIndex(w,'team1'),null);
 assert.ok(domainReferenceIssues(w).includes('duplicate-season-id:team1'));
 assert.equal(JSON.stringify(w.seasons[0]),JSON.stringify(JSON.parse(before).seasons[0]));
});
