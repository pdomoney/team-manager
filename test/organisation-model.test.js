import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateGrantDecision } from '../site/role-model.js';
import {
  proposeOrganisation, proposeAffiliation, reviewAffiliationProposal,
  closeAffiliationProposal, proposeLicenceScenario, previewLicenceFeature,
  describeManagedOrganisations, previewAssociationSummary
} from '../site/organisation-model.js';

const space = 'demo-owner-a';
const assoc=()=>proposeOrganisation({id:'league-1',type:'association',name:'Fictional NSW League',workspaceId:space});
const club=(id='club-a',wid=space)=>proposeOrganisation({id,type:'club',name:'Fictional club '+id,workspaceId:wid});
const scope=(type,id)=>({type,id});
const currentWorkspace=()=>({
  schema:4,id:'team1',team:{name:'Junior league tag',clubId:'club-a',sport:'League tag'},
  players:[{id:'p1',name:'Private Child',phone:'0400 SECRET',notes:'Medical note'}],
  helpers:[{id:'h1',name:'Private Guardian',phone:'0400 OTHER'}],
  clubs:[
    {id:'club-a',name:'Example Titans',shortName:'Titans',sport:'Rugby league',
      logo:'data:image/png;base64,AAA=',colours:'Navy and gold',style:{primary:'#012345'},
      directoryMatch:{id:'research-1',classification:'user_confirmed_same_club_research_candidate'},
      notes:'PRIVATE COACH NOTES',officials:[{name:'Private secretary',phone:'HIDDEN'}]},
    {id:'club-b',name:'Example Oztag',sport:'Oztag',colours:'Red',
      directoryMatch:null,notes:'PRIVATE'}
  ],
  teams:[
    {id:'team2',team:{name:'Oztag mixed',clubId:'club-b',sport:'Oztag'},archived:false,
      players:[{id:'p2',name:'Private player'}]},
    {id:'team3',team:{name:'Unassigned squad',clubId:'missing-club',sport:'Netball'},archived:true}
  ],
  matchOfficials:[{id:'official1',name:'Sensitive referee',wwccStatus:'checked'}],
  library:{plays:[{id:'private-play',name:'Secret play'}],playerSets:[],systems:{}}
});

test('P03 organisation candidates preserve namespace without creating a tenant or verification',()=>{
 const a=club('club-a','owner-one'), b=club('club-a','owner-two');
 assert.notEqual(a.id,b.id);
 assert.equal(a.legacyId,'club-a');
 assert.equal(a.liveTenant,false);
 assert.equal(a.claimedOfficial,false);
 assert.deepEqual(a.accessGrants,[]);
 assert.ok(proposeOrganisation({id:'club',type:'unknown',name:'X',workspaceId:space}).error);
 assert.ok(proposeOrganisation({id:'',type:'club',name:'X',workspaceId:space}).error);
});

test('P03 affiliations need proposal and both fictional reviews, never organisation access',()=>{
 const p=proposeAffiliation({association:assoc(),club:club(),proposedBy:'demo-officer'});
 assert.equal(p.status,'proposed');
 assert.equal(p.verifiedOfficial,false);
 const first=reviewAffiliationProposal(p,'association',true);
 assert.equal(first.status,'proposed');
 assert.equal(first.associationReviewed,true);
 const second=reviewAffiliationProposal(first,'club',true);
 assert.equal(second.status,'reviewed');
 assert.equal(second.clubReviewed,true);
 assert.equal(second.crossTenantAccess,false);
 assert.deepEqual(second.accessGrants,[]);
 assert.equal(second.verifiedOfficial,false);
 assert.equal(simulateGrantDecision({accountId:'demo-officer',capability:'club:manage',
   resourceScope:scope('club','club-a'),grants:[]}).allowed,false);
 assert.deepEqual(p,proposeAffiliation({association:assoc(),club:club(),proposedBy:'demo-officer'}), 'proposed facts unmodified');
});

test('P03 decline/revoke is explicit and cannot be mistaken for current membership',()=>{
 const proposed=proposeAffiliation({association:assoc(),club:club(),proposedBy:'a'});
 const declined=reviewAffiliationProposal(proposed,'club',false);
 assert.equal(declined.status,'declined');
 assert.ok(reviewAffiliationProposal(declined,'association',true).error);
 const reviewed=reviewAffiliationProposal(reviewAffiliationProposal(proposed,'association',true),'club',true);
 const ended=closeAffiliationProposal(reviewed);
 assert.equal(ended.status,'ended');
 assert.equal(ended.crossTenantAccess,false);
 assert.ok(closeAffiliationProposal(ended).error);
});

test('P03 malformed or cross-workspace affiliation proposals rejected',()=>{
 assert.ok(proposeAffiliation({association:club(),club:assoc(),proposedBy:'a'}).error);
 assert.ok(proposeAffiliation({association:assoc(),club:club('club-a','another-owner'),proposedBy:'a'}).error);
 assert.ok(proposeAffiliation({association:assoc(),club:club(),proposedBy:''}).error);
 assert.ok(reviewAffiliationProposal(null,'club',true).error);
 assert.ok(reviewAffiliationProposal({status:'proposed'},'other',true).error);
});

test('P03 licence scenarios are not paid or production entitlements, independent of data rights',()=>{
 const personal=proposeLicenceScenario({category:'individual',ownerScope:scope('personal','coach-one'),
   modules:['tactics','teams','tactics'],limits:{teams:2}});
 assert.deepEqual(personal.modules,['tactics','teams']);
 assert.deepEqual(personal.limits,{teams:2});
 assert.equal(personal.status,'scenario-only');
 assert.equal(personal.billingActive,false);
 assert.equal(personal.productionEntitled,false);
 assert.equal(personal.subscriptionId,null);
 assert.deepEqual(personal.dataGrants,[]);
 assert.equal(previewLicenceFeature(personal,'teams',{teams:2}).wouldOffer,true);
 assert.equal(previewLicenceFeature(personal,'teams',{teams:3}).reason,'illustrative-capacity-exceeded');
 assert.equal(previewLicenceFeature(personal,'clubs',{teams:1}).reason,'module-not-in-scenario');
});

test('P03 individual, club and association licence types have independent purchaser scopes',()=>{
 for (const [category,type] of [['individual','personal'],['club','club'],['association','association']]){
  const x=proposeLicenceScenario({category,ownerScope:scope(type,category+'-one'),
    modules:['clubs','teams','association_summary']});
  assert.equal(x.purchaserScope.type,type);
  assert.equal(x.productionEntitled,false);
  assert.deepEqual(x.dataGrants,[]);
 }
 assert.ok(proposeLicenceScenario({category:'association',ownerScope:scope('club','wrong')}).error);
 assert.ok(proposeLicenceScenario({category:'other',ownerScope:scope('club','wrong')}).error);
});

test('P03 invalid modules, negative limits and missing capacity figures are rejected in preview',()=>{
 assert.ok(proposeLicenceScenario({category:'club',ownerScope:scope('club','a'),modules:['made-up-feature']}).error);
 assert.ok(proposeLicenceScenario({category:'club',ownerScope:scope('club','a'),limits:{clubs:-1}}).error);
 assert.ok(proposeLicenceScenario({category:'club',ownerScope:scope('club','a'),limits:{storage:100}}).error);
 assert.ok(proposeLicenceScenario({category:'club',ownerScope:scope('club','a'),limits:{teams:1.5}}).error);
 const x=proposeLicenceScenario({category:'club',ownerScope:scope('club','a'),modules:['teams'],limits:{teams:20}});
 assert.equal(previewLicenceFeature(x,'teams',{}).reason,'invalid-metric');
 assert.equal(previewLicenceFeature(x,'teams',{teams:-1}).wouldOffer,false);
 assert.equal(previewLicenceFeature(x,'bad_feature',{teams:1}).simulated,false);
});

test('P03 current workspace mapping preserves club branding and exact team links only',()=>{
 const w=currentWorkspace(),before=structuredClone(w);
 const x=describeManagedOrganisations(w,space);
 assert.deepEqual(w,before,'read-only projection');
 assert.equal(x.proposedClubs.length,2);
 assert.equal(x.proposedClubs[0].managedTeams.length,1);
 assert.equal(x.proposedClubs[0].managedTeams[0].legacyId,'team1');
 assert.equal(x.proposedClubs[1].managedTeams[0].legacyId,'team2');
 assert.equal(x.unassignedTeams[0].legacyId,'team3');
 assert.equal(x.proposedClubs[0].branding.colours,'Navy and gold');
 assert.deepEqual(x.proposedClubs[0].branding.style,{primary:'#012345'});
 assert.equal(x.proposedClubs[0].branding.hasLogo,true);
 assert.equal(x.proposedClubs[0].branding.directoryOnlyResearch,true);
 assert.equal(x.proposedClubs[0].claimedOfficial,false);
 assert.equal(x.crossTenantAccess,false);
 assert.equal(x.ownsSourceData,false,'projection does not alter current coach ownership');
 assert.deepEqual(x.independentClubAccounts,[]);
 assert.deepEqual(x.sharedPrivateData,[]);
 assert.ok(!JSON.stringify(x).includes('PRIVATE COACH NOTES'));
 assert.ok(!JSON.stringify(x).includes('Medical note'));
 assert.ok(!JSON.stringify(x).includes('0400 SECRET'));
 assert.ok(!JSON.stringify(x).includes('Private secretary'));
 assert.ok(!JSON.stringify(x).includes('Secret play'));
 assert.ok(!JSON.stringify(x).includes('Sensitive referee'));
});

test('P03 same public club ID in different trusted workspaces is never auto-linked',()=>{
 const w=currentWorkspace();
 const a=describeManagedOrganisations(w,'workspace-a'),b=describeManagedOrganisations(w,'workspace-b');
 assert.notEqual(a.proposedClubs[0].id,b.proposedClubs[0].id);
 assert.notEqual(a.workspaceKey,b.workspaceKey);
 assert.ok(describeManagedOrganisations(w,'').error);
 assert.ok(describeManagedOrganisations(null,'workspace-a').error);
});

test('P03 duplicate managed club IDs require manual correction, not silent reconciliation',()=>{
 const w=currentWorkspace();w.clubs.push({...w.clubs[0]});
 assert.ok(describeManagedOrganisations(w,space).error);
});

test('P03 association dashboard is pre-aggregated only; no person details are admitted',()=>{
 const reviewed=reviewAffiliationProposal(
   reviewAffiliationProposal(proposeAffiliation({association:assoc(),club:club(),proposedBy:'a'}),'association',true),
   'club',true);
 const x=previewAssociationSummary({affiliationRecords:[reviewed],
   aggregatedClubs:[{clubId:club().id,teamCount:12}]});
 assert.deepEqual(x,{synthetic:true,reviewedClubCount:1,teamCount:12,
   includesPersonalData:false,grantsPrivateDataAccess:false});
 assert.ok(previewAssociationSummary({affiliationRecords:[reviewed],
   aggregatedClubs:[{clubId:club().id,teamCount:12,playerNames:['Private child']}]}).error);
 assert.ok(previewAssociationSummary({affiliationRecords:[],
   aggregatedClubs:[{clubId:club().id,teamCount:12}]}).error);
 assert.ok(previewAssociationSummary({affiliationRecords:[reviewed],
   aggregatedClubs:[{clubId:club().id,teamCount:-1}]}).error);
});

test('P03 all four use cases are modelled only, not deployed or authenticated',()=>{
 const scenarios=[
   proposeLicenceScenario({category:'association',ownerScope:scope('association','league')}),
   proposeLicenceScenario({category:'club',ownerScope:scope('club','club-a')}),
   proposeLicenceScenario({category:'individual',ownerScope:scope('personal','coach')}),
   proposeLicenceScenario({category:'individual',ownerScope:scope('personal','multi-club-coach')})
 ];
 assert.equal(scenarios.length,4);
 assert.ok(scenarios.every(s=>s.status==='scenario-only' && !s.billingActive && !s.productionEntitled));
});
