import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLocalPeopleIndex, proposeLocalPersonLink,
  reviewLocalPersonLink, undoLocalPersonLink, proposeGuardianReview
} from '../site/people-index.js';
import {teamView} from '../site/vault.js';
import * as M from '../site/model.js';

const sample=()=>({
  schema:4,id:'team1',team:{name:'Example League Tag U16',clubId:'club-a',sport:'League tag',
    staff:[{role:'Head coach',name:'Alex Example',phone:'0400 SECRET'}]},
  players:[
    {id:'p1',personId:'person:team1:p1',name:'Alex Example',phone:'PRIVATE NUMBER',photo:'data:image/png;base64,QUJD',
      number:'7',positions:['Wing'],jerseys:[{id:'loan1',number:'7',out:'2026-05-01',back:''}]},
    {id:'p3',name:'Alex Example',number:'12',positions:['Middle']}
  ],
  helpers:[{id:'h1',name:'Parent Example',phone:'HELPER PRIVATE',playerId:'p1',relation:'mum'},
    {id:'h2',name:'Alex Example',relation:'Volunteer'}],
  seasons:[{id:'s1',name:'2026',status:'active',squad:[{playerId:'p1',number:'7',positions:['Wing']}],
    staff:[{name:'Prior Example',phone:'OLD PRIVATE',role:'Coach'}]}],
  clubs:[{id:'club-a',name:'Example League Club',officials:[{name:'Alex Example',email:'secret@example.invalid',role:'Secretary'}]},
    {id:'club-b',name:'Example Oztag',officials:[{name:'Other Example',role:'President'}]}],
  teams:[{id:'team2',team:{name:'Oztag Mixed',clubId:'club-b',sport:'Oztag',
    staff:[{name:'Another Example',role:'Manager'}]},
    players:[{id:'p2',personId:'person:team1:p1',name:'Alex Example',number:'13',positions:['Link'],jerseys:[]},
      {id:'p4',name:'Alex Example',positions:['Rover'],status:'injured',notes:'SECRET MEDICAL'}],
    seasons:[{id:'s2',name:'2026',status:'active',staff:[],squad:[{playerId:'p2',number:'13'}]}],
    helpers:[],matches:[],sessions:[],tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{}}],
  matchOfficials:[{id:'crew1',name:'Alex Example',email:'PRIVATE MAIL',
    wwccStatus:'checked',clubId:'club-a',rolesBySport:{'Rugby league':['trainer']}},
    {id:'crew2',name:'Other Example',clubIds:['club-a','club-b']}],
  tasks:[{id:'t1',people:[{who:'h:h1',status:'yes'}]}],
  sessions:[{id:'s1',attendance:{p1:'present'}}],
  matches:[],lineups:[],plays:[],notices:[],messages:[],playerSets:[],systems:{},
  library:{plays:[{id:'private',name:'Private coach tactic'}],playerSets:[],systems:{}}
});
const idx=(w=sample(),ns='owner-demo')=>buildLocalPeopleIndex(w,ns);
const ref=(index,kind,name)=>index.references.find(r=>r.kind===kind&&r.displayName===name);

test('P04 index reads all six legacy person forms without modifying existing workspace',()=>{
 const w=sample(),original=structuredClone(w),index=idx(w);
 assert.deepEqual(w,original);
 const kinds=new Set(index.references.map(x=>x.kind));
 for(const expected of ['player','helper','team-staff','club-official','season-staff','match-official'])
   assert.ok(kinds.has(expected),expected);
 assert.equal(index.references.length,13);
 assert.equal(index.people.length,12,'only explicitly linked players share person');
 assert.equal(index.accountIds.length,0);
 assert.deepEqual(index.roleGrants,[]);
 assert.equal(index.contactsExposed,false);
 assert.equal(index.qualificationsExposed,false);
 assert.equal(index.photoDataExposed,false);
});
test('P04 one explicit linked player remains one person without merging name-matches',()=>{
 const index=idx();
 const players=index.references.filter(x=>x.kind==='player');
 assert.equal(players.length,4);
 const first=players.find(x=>x.sourceRef.includes('"p1"'));
 const linked=players.find(x=>x.sourceRef.includes('"p2"'));
 assert.equal(first.personKey,linked.personKey);
 assert.notEqual(first.personKey,players.find(x=>x.sourceRef.includes('"p3"')).personKey);
 assert.notEqual(first.personKey,players.find(x=>x.sourceRef.includes('"p4"')).personKey);
 assert.notEqual(first.personKey,ref(index,'match-official','Alex Example').personKey);
 assert.notEqual(first.personKey,ref(index,'club-official','Alex Example').personKey);
 assert.equal(index.people.filter(x=>x.sourceRefs.length===2).length,1);
});
test('P04 same IDs across different coach workspaces never imply cross-owner identity',()=>{
 const a=idx(sample(),'private-coach-a'),b=idx(sample(),'private-coach-b');
 assert.notEqual(a.people[0].personKey,b.people[0].personKey);
 assert.notEqual(a.references[0].sourceRef,b.references[0].sourceRef);
 assert.deepEqual(a,idx(sample(),'private-coach-a'));
});
test('P04 index and proposed links exclude all private contacts, photos, health and qualifications',()=>{
 const index=idx();
 const serialized=JSON.stringify(index);
 for(const secret of ['PRIVATE NUMBER','HELPER PRIVATE','OLD PRIVATE','SECRET MEDICAL',
   'PRIVATE MAIL','secret@example.invalid','Private coach tactic','QUJD','0400 SECRET'])
    assert.ok(!serialized.includes(secret),secret);
 assert.ok(!serialized.includes('wwccStatus'));
 assert.ok(!serialized.includes('rolesBySport'));
});
test('P04 same-name coach, match official, club secretary need separately reviewed link',()=>{
 const index=idx(), coach=ref(index,'team-staff','Alex Example'),
   official=ref(index,'club-official','Alex Example');
 const proposal=proposeLocalPersonLink(index,{firstRef:coach.sourceRef,secondRef:official.sourceRef,
   proposedBy:'trusted-owner',reason:'Records intentionally linked'});
 assert.equal(proposal.status,'proposed');
 assert.equal(proposal.humanReviewed,false);
 assert.equal(proposal.changedLegacyRecords,false);
 assert.deepEqual(proposal.accessGrants,[]);
 const reviewed=reviewLocalPersonLink(index,proposal,{reviewedBy:'trusted-owner',confirmed:true});
 assert.equal(reviewed.status,'locally-reviewed-link-only');
 assert.equal(reviewed.authorityVerified,false);
 assert.deepEqual(reviewed.accessGrants,[]);
 assert.deepEqual(index.people,idx().people,'review plans do not persist or alter person groups');
 const reverted=undoLocalPersonLink(reviewed,{undoneBy:'trusted-owner'});
 assert.equal(reverted.status,'reversed');
 assert.equal(reverted.changedLegacyRecords,false);
});
test('P04 link review rejects invalid references, duplicate, missing decision and stale group',()=>{
 const index=idx(),a=ref(index,'helper','Parent Example'),b=ref(index,'match-official','Alex Example');
 assert.ok(proposeLocalPersonLink(index,{firstRef:a.sourceRef,secondRef:'missing',proposedBy:'a'}).error);
 assert.ok(proposeLocalPersonLink(index,{firstRef:a.sourceRef,secondRef:a.sourceRef,proposedBy:'a'}).error);
 const candidate=proposeLocalPersonLink(index,{firstRef:a.sourceRef,secondRef:b.sourceRef,proposedBy:'a'});
 assert.ok(reviewLocalPersonLink(index,candidate,{reviewedBy:'x'}).error);
 assert.equal(reviewLocalPersonLink(index,candidate,{reviewedBy:'x',confirmed:false}).status,'rejected');
 assert.ok(undoLocalPersonLink(candidate,{undoneBy:'x'}).error);
 assert.ok(reviewLocalPersonLink({...index,namespace:'another'},candidate,{reviewedBy:'x',confirmed:true}).error);
});
test('P04 helper player links generate review queue only, never verified guardian rights',()=>{
 const index=idx(), candidate=index.guardianReviewQueue.find(x=>x.type==='possible-guardian');
 assert.ok(candidate);
 assert.equal(candidate.verifiedAuthority,false);
 assert.equal(candidate.accessGranted,false);
 const guardian=proposeGuardianReview(index,{
   guardianRef:candidate.helperRef,childPlayerRef:candidate.playerRef,reviewedBy:'local-coach',
   purpose:'Discuss legal guardian status'});
 assert.equal(guardian.status,'local-review-required');
 assert.equal(guardian.guardianAuthorityVerified,false);
 assert.equal(guardian.childRecordAccess,false);
 assert.equal(guardian.guardianshipGranted,false);
 assert.deepEqual(guardian.accessGrants,[]);
 assert.ok(proposeGuardianReview(index,{guardianRef:candidate.helperRef,childPlayerRef:'missing',reviewedBy:'coach'}).error);
});
test('P04 missing helper-linked player yields review warning, never invents person access',()=>{
 const w=sample();w.helpers[0].playerId='missing';
 const index=idx(w);
 assert.ok(index.guardianReviewQueue.some(q=>q.type==='missing-helper-player'));
 assert.equal(index.guardianReviewQueue.find(q=>q.type==='possible-guardian').playerRef,null);
 assert.deepEqual(index.roleGrants,[]);
});
test('P04 duplicate legacy IDs and invalid workspace are not silently reconciled',()=>{
 assert.ok(idx(sample(),'').error);
 const w=sample();w.players.push({...w.players[0]});
 assert.ok(idx(w).error);
 const teams=sample();teams.teams[0].id='team1';
 assert.ok(idx(teams).error);
 const staff=sample();staff.matchOfficials.push({...staff.matchOfficials[0]});
 assert.ok(idx(staff).error);
});
test('P04 original team jersey/season/attendance and public player projection unchanged',()=>{
 const w=sample(),before=JSON.stringify(w),privacy=teamView(w,w.clubs[0],[]);
 const index=idx(w);
 assert.ok(index.people.length);
 assert.equal(JSON.stringify(w),before);
 assert.deepEqual(teamView(w,w.clubs[0],[]),privacy);
 assert.equal(w.players[0].jerseys[0].number,'7');
 assert.equal(w.teams[0].players[0].number,'13');
 assert.equal(w.seasons[0].squad[0].playerId,'p1');
 assert.equal(w.sessions[0].attendance.p1,'present');
 assert.ok(!JSON.stringify(privacy).includes('PRIVATE NUMBER'));
});
