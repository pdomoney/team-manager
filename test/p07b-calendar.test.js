import test from 'node:test';
import assert from 'node:assert/strict';
import { localWorkspaceCalendar } from '../site/p07-calendar.js';

function ws(){
 return {
   id:'t1',team:{name:'Oztag U12',sport:'Oztag',clubId:'c1'},
   seasons:[{id:'s1',year:'2026'}],players:[{id:'child',name:'PRIVATE CHILD'}],
   matches:[{id:'m1',date:'2026-11-01',start:'09:30',venue:'Field 3',opponent:'Jets',
      entryId:'e1',crew:[{personId:'vol1',confirmed:true}]}],
   sessions:[{id:'s1',date:'2026-11-02',start:'17:30',end:'18:30',focus:'Passing',
      notes:'PRIVATE HEALTH'}],
   tasks:[{id:'task1',date:'2026-11-02',start:'18:00',title:'BBQ duty',
      people:[{who:'h:h1',phone:'PRIVATE PHONE'}],notes:'PRIVATE ADDRESS'}],
   clubs:[{id:'c1',name:'Club 1',sport:'Oztag'},{id:'c2',name:'Club 2',sport:'Touch football'}],
   competitions:[{id:'comp',name:'Tourney',format:'roundrobin',sport:'Oztag',
      entries:[{id:'e1',teamId:'t1',seasonId:'s1',status:'entered'}]}],
   matchOfficials:[{id:'vol1',name:'PRIVATE STAFF'}],
   teams:[{id:'t2',team:{name:'Touch Mixed',sport:'Touch football',clubId:'c2'},
     sessions:[{id:'s2',date:'2026-11-03',start:'17:00'}],
     matches:[{id:'m2',date:'2026-11-04',opponent:'Rivals',status:'cancelled'}],
     tasks:[],players:[]}]
 };
}
test('P07B read-only calendar merges match, training, and volunteer duties by date/time',()=>{
 const w=ws(),before=JSON.stringify(w),out=localWorkspaceCalendar(w);
 assert.equal(out.totals.events,5);
 assert.deepEqual(out.events.map(x=>x.kind),['match','training','duty','training','match']);
 assert.equal(out.totals.matches,2);assert.equal(out.totals.duties,1);
 assert.equal(out.totals.cancelled,1);
 assert.equal(out.events[0].officialFixture,false);
 assert.equal(out.events[0].provenance,'local-coach-workspace');
 assert.equal(JSON.stringify(w),before);
});
test('P07B private people, safeguarding, notes and contact details never enter calendar',()=>{
 const out=localWorkspaceCalendar(ws()),str=JSON.stringify(out);
 for(const x of ['PRIVATE','vol1','child','personId','notes','phone','people'])
   assert.equal(str.includes(x),false,x);
 assert.equal(out.scope,'existing-encrypted-coach-workspace');
 assert.equal(out.externalVerification,false);
 assert.equal(out.timeInterpretation,'local-clock-as-recorded-no-zone-conversion');
});
test('P07B selection is restricted to clubs already in current workspace',()=>{
 const w=ws();
 assert.equal(localWorkspaceCalendar(w,{clubId:'c1'}).totals.events,3);
 assert.equal(localWorkspaceCalendar(w,{clubId:'c2'}).totals.events,2);
 assert.equal(localWorkspaceCalendar(w,{clubId:'external'}).totals.events,0);
 assert.equal(localWorkspaceCalendar(w,{clubId:'c1',teamId:'t2'}).totals.events,0);
 assert.equal(localWorkspaceCalendar(w,{sport:'Oztag'}).totals.events,3);
});
test('P07B filters inclusive date windows without timezone conversions',()=>{
 const w=ws(),result=localWorkspaceCalendar(w,{from:'2026-11-02',to:'2026-11-02'});
 assert.equal(result.totals.events,2);
 assert.ok(result.events.every(x=>x.date==='2026-11-02'));
 assert.deepEqual(result.events.map(x=>x.start),['17:30','18:00']);
});
test('P07B malformed dates/clock values are discarded without changing source',()=>{
 const w=ws();
 w.sessions.push({id:'invalid-date',date:'2026-02-31'});
 w.matches.push({id:'invalid-time',date:'2026-11-05',start:'29:83'});
 const out=localWorkspaceCalendar(w);
 assert.equal(out.totals.events,6);
 assert.equal(out.events.find(x=>x.recordId==='invalid-time').start,'');
 assert.ok(out.events.every(x=>x.recordId!=='invalid-date'));
});
test('P07B cancelled and withdrawn records are preserved as coach records, not officially verified',()=>{
 const w=ws();
 w.competitions[0].entries[0].status='withdrawn';
 w.sessions[0].cancelled=true;
 const out=localWorkspaceCalendar(w,{clubId:'c1'});
 assert.equal(out.totals.review,1);
 assert.equal(out.totals.cancelled,1);
 assert.equal(out.events[0].entryStatus,'withdrawn');
 assert.equal(out.events[0].authorityReview,true);
 assert.equal(out.events[1].cancelled,true);
});
test('P07B archived team is absent but original history untouched',()=>{
 const w=ws();
 w.teams[0].archived=true;
 const before=JSON.stringify(w.teams[0]);
 const out=localWorkspaceCalendar(w);
 assert.equal(out.totals.events,3);
 assert.equal(JSON.stringify(w.teams[0]),before); // no mutation of archived match history
 assert.equal(w.teams[0].matches.length,1);
});
test('P07B input absence and key collision across teams do not invent a joined event',()=>{
 const w=ws();w.teams[0].matches[0].id='m1';
 const out=localWorkspaceCalendar(w);
 assert.equal(new Set(out.events.map(e=>e.key)).size,out.events.length);
 assert.equal(localWorkspaceCalendar(null).totals.events,0);
 assert.equal(Object.isFrozen(out),true);
 assert.equal(Object.isFrozen(out.events[0]),true);
});
