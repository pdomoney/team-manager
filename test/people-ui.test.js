import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView } from '../site/vault.js';
import {
  localPeopleNamespace, localPeopleReviewView,
  acceptLocalPeopleLink, undoLocalPeopleLink
} from '../site/people-ui.js';
const ns=localPeopleNamespace({owner:'ExampleCoach',repo:'sports-team-app'});
const clone=v=>JSON.parse(JSON.stringify(v));
const ws=()=>M.migrateWorkspace({
  id:'team1',schema:4, team:{name:'League Tag Under 16s',clubId:'league',sport:'League tag',
    staff:[{name:'Casey Example',role:'Coach',phone:'PRIVATE COACH'}]},
  players:[{id:'p1',name:'Avery Example',personId:'same-player',number:'7',
    phone:'PRIVATE CHILD',notes:'PRIVATE MEDICAL',positions:['Wing'],
    jerseys:[{id:'j1',number:'7',out:'2026-05-01',back:''}]}],
  helpers:[{id:'h1',name:'Casey Example',playerId:'p1',relation:'mum',
    phone:'PRIVATE HELPER'}, {id:'h2',name:'Avery Example',relation:'coach assistant'}],
  matchOfficials:[{id:'crew1',name:'Casey Example',clubId:'league',email:'PRIVATE EMAIL',
    wwccStatus:'yes'}],
  clubs:[{id:'league',name:'Fictional League Club',officials:[{name:'Casey Example',role:'Secretary',phone:'PRIVATE OFFICE'}]},
    {id:'tag',name:'Fictional Tag Club'}],
  teams:[{id:'team2',team:{name:'Tag Mixed',clubId:'tag',sport:'Oztag'},
    players:[{id:'p2',personId:'same-player',name:'Avery Example',number:'10',positions:['Link']}],
    helpers:[],seasons:[],matches:[],sessions:[],lineups:[],tasks:[],notices:[],messages:[],plays:[],playerSets:[],systems:{}}],
  seasons:[{id:'s26',name:'2026',status:'active',staff:[{name:'Past Coach',role:'Manager'}],
    squad:[{playerId:'p1',number:'7',positions:['Wing']}]}],
  sessions:[{id:'train1',date:'2026-10-20',attendance:{p1:'present'}}],
  matches:[],tasks:[],notices:[],messages:[],lineups:[],plays:[],playerSets:[],systems:{},competitions:[]
});
const refs=(page,a,b)=>{
  const one=page.sources.find(x=>x.kind===a);
  const two=page.sources.find(x=>x.kind===b);
  assert.ok(one&&two);
  return {firstRef:one.sourceRef,secondRef:two.sourceRef};
};
const accept=(work,namespace=ns)=>{
 const page=localPeopleReviewView(work,namespace);
 return acceptLocalPeopleLink(work,namespace,{...refs(page,'helper','match-official'),
   reviewedBy:'shared coach workspace', reviewedAt:'2026-10-21T06:20:00.000Z'});
};
test('P04B stable source namespace is case-insensitive and distinct across repositories and trials',()=>{
 assert.equal(localPeopleNamespace({owner:'EXAMPLECOACH',repo:'SPORTS-TEAM-APP'}),ns);
 assert.notEqual(localPeopleNamespace({owner:'OtherCoach',repo:'sports-team-app'}),ns);
 assert.notEqual(localPeopleNamespace({owner:'ExampleCoach',repo:'sports-team-app',trial:true}),ns);
 assert.equal(localPeopleNamespace({owner:'',repo:'x'}),'');
 assert.equal(localPeopleNamespace({owner:'<script>',repo:'x'}),'');
});
test('P04B renders a private advisory model without joining equal names or protected fields',()=>{
 const work=ws(),before=clone(work),page=localPeopleReviewView(work,ns);
 assert.equal(page.error,undefined);
 assert.deepEqual(work,before);
 assert.equal(page.safety.coachOnly,true);
 assert.equal(page.safety.hasLegalGuardianVerification,false);
 assert.equal(page.safety.grantsPermissions,false);
 assert.equal(page.safety.joinsNamesAutomatically,false);
 assert.equal(page.guardianCandidates.length,1);
 assert.equal(page.guardianCandidates[0].verified,false);
 assert.equal(page.guardianCandidates[0].grantsAccess,false);
 const people=page.sources.filter(x=>x.displayName==='Casey Example');
 assert.equal(people.length,4,'same name across helper, official, team staff and match staff not merged');
 assert.ok(people.some(x=>x.kind==='team-staff'&&!x.durable));
 assert.ok(people.some(x=>x.kind==='club-official'&&!x.durable));
 assert.ok(people.some(x=>x.kind==='match-official'&&x.durable));
 const twoPlayers=page.sources.filter(x=>x.kind==='player');
 assert.equal(twoPlayers.length,2);
 assert.equal(twoPlayers[0].personKey,twoPlayers[1].personKey,'preexisting explicit linked player ID respected');
 const text=JSON.stringify(page);
 for(const secret of ['PRIVATE CHILD','PRIVATE MEDICAL','PRIVATE HELPER',
   'PRIVATE COACH','PRIVATE OFFICE','PRIVATE EMAIL','wwccStatus','"jerseys"','"attendance"'])
   assert.ok(!text.includes(secret),secret);
});
test('P04B coach review saves only encrypted-workspace ledger, not legacy sporting records',()=>{
 const work=ws(),before=clone(work),added=accept(work);
 assert.equal(added.error,undefined);
 assert.equal(added.workspace.peopleReviews.length,1);
 assert.equal(added.workspace.peopleReviews[0].status,'reviewed');
 assert.equal(added.advisoryOnly,true);
 assert.deepEqual(work,before);
 assert.deepEqual(added.workspace.players,before.players);
 assert.deepEqual(added.workspace.teams,before.teams);
 assert.deepEqual(added.workspace.helpers,before.helpers);
 assert.deepEqual(added.workspace.clubs,before.clubs);
 assert.equal(added.workspace.players[0].jerseys[0].number,'7');
 assert.equal(added.workspace.sessions[0].attendance.p1,'present');
 const migrated=M.migrateWorkspace(clone(added.workspace));
 assert.equal(migrated.peopleReviews.length,1);
 assert.deepEqual(teamView(added.workspace).players,teamView(work).players);
 assert.ok(!JSON.stringify(teamView(added.workspace)).includes('peopleReviews'));
});
test('P04B a reviewed link can be reversed without deleting history or account grants',()=>{
 const work=accept(ws()).workspace;
 const page=localPeopleReviewView(work,ns);
 assert.equal(page.reviewedCount,1);
 assert.equal(page.reviews[0].canReverse,true);
 const result=undoLocalPeopleLink(work,ns,{recordId:page.reviews[0].id,
   reversedBy:'shared coach workspace',reversedAt:'2026-10-21T06:25:00.000Z'});
 assert.equal(result.error,undefined);
 assert.equal(result.record.status,'reversed');
 assert.equal(result.advisoryOnly,true);
 assert.equal(localPeopleReviewView(result.workspace,ns).reviewedCount,0);
 assert.equal(localPeopleReviewView(result.workspace,ns).reviews[0].canReverse,false);
 assert.equal(result.workspace.peopleReviews.length,1);
 assert.ok(undoLocalPeopleLink(result.workspace,ns,{recordId:page.reviews[0].id,
   reversedBy:'x',reversedAt:'2026-10-21T06:30:00.000Z'}).error);
});
test('P04B invalid links, unstable staff references, unknown workspace are denied',()=>{
 const work=ws(),page=localPeopleReviewView(work,ns);
 const stable=page.sources.find(x=>x.kind==='player');
 const staff=page.sources.find(x=>x.kind==='season-staff');
 assert.ok(acceptLocalPeopleLink(work,ns,{firstRef:stable.sourceRef,secondRef:staff.sourceRef,
   reviewedBy:'coach',reviewedAt:'2026-10-21T06:20:00.000Z'}).error);
 assert.ok(acceptLocalPeopleLink(work,ns,{firstRef:stable.sourceRef,secondRef:stable.sourceRef,
   reviewedBy:'coach',reviewedAt:'2026-10-21T06:20:00.000Z'}).error);
 assert.ok(acceptLocalPeopleLink(work,ns,{firstRef:'bogus',secondRef:stable.sourceRef,
   reviewedBy:'coach',reviewedAt:'2026-10-21T06:20:00.000Z'}).error);
 assert.ok(acceptLocalPeopleLink(work,ns,{firstRef:stable.sourceRef,secondRef:'none',
   reviewedBy:'',reviewedAt:'2026-10-21T06:20:00.000Z'}).error);
 assert.ok(localPeopleReviewView(work,'').error);
});
test('P04B one workspace cannot reverse review belonging to another namespace',()=>{
 const w=accept(ws()).workspace;
 const id=w.peopleReviews[0].id;
 const foreign=localPeopleNamespace({owner:'another-owner',repo:'other-team-app'});
 assert.ok(undoLocalPeopleLink(w,foreign,{recordId:id,reversedBy:'coach',
   reversedAt:'2026-10-21T06:25:00.000Z'}).error);
 assert.equal(localPeopleReviewView(w,foreign).reviews.length,0);
});
test('P04B warns about stale source records rather than silently linking old IDs',()=>{
 const w=accept(ws()).workspace,missing=clone(w);
 missing.matchOfficials=[];
 const check=localPeopleReviewView(missing,ns);
 assert.equal(check.reviews[0].status,'stale-record');
 assert.equal(check.reviews[0].sources.some(x=>x.kind==='missing'),true);
 assert.equal(check.reviews[0].canReverse,true,'reversal of stale historical review remains available');
 const changes=clone(w);changes.matchOfficials[0].id='crew-new';
 assert.equal(localPeopleReviewView(changes,ns).reviews[0].status,'stale-record');
});
