import test from 'node:test';
import assert from 'node:assert/strict';
import {
  P12_SAMPLE_CLUBS,P12_SAMPLE_TEAMS,P12_TEAM_TO_CLUB,
  sampleClub,sampleTeam,sampleTeamsForClub,makeP12SampleRoster,p12SampleTeamSummary
} from '../site/p12-qa-club-teams.js';
import {p12QaView} from '../site/p12-qa-profiles.js';
import {makeP12WorkflowSandbox,applyP12WorkflowAction,inspectP12Workflow} from '../site/p12-qa-workflows.js';

const active=(id,role,groupId)=>{
  const all=p12QaView(id);
  const c=all.contexts.find(x=>x.kind==='access'&&x.role===role&&x.group.id===groupId);
  return c?p12QaView(id,c.id):null;
};

test('P12 sample: exactly three fictional clubs with six teams each',()=>{
  assert.equal(P12_SAMPLE_CLUBS.length,3);
  assert.equal(P12_SAMPLE_TEAMS.length,18);
  assert.equal(new Set(P12_SAMPLE_TEAMS.map(t=>t.id)).size,18);
  for(const c of P12_SAMPLE_CLUBS){
    const six=sampleTeamsForClub(c.id);
    assert.equal(six.length,6,c.name);
    assert.ok(six.every(t=>t.clubId===c.id&&t.sport===c.sport&&t.synthetic));
    assert.equal(sampleClub(c.id),c);
  }
  assert.equal(sampleTeam('__proto__'),null);
  assert.equal(makeP12SampleRoster('some-real-team'),null);
});

test('P12 sample: deterministic player, staff and volunteer numbers, no actual private data',()=>{
  const totals={players:0,staff:0,volunteers:0},ids=new Set();
  for(const t of P12_SAMPLE_TEAMS){
    const x=makeP12SampleRoster(t.id);
    assert.equal(x.players.length,t.playerCount);
    assert.equal(x.staff.length,t.staffCount);
    assert.equal(x.volunteers.length,t.volunteerCount);
    assert.equal(x.clubId,P12_TEAM_TO_CLUB[t.id]);
    assert.equal(x.sport,t.sport);
    assert.ok(x.players.length>=12&&x.players.length<=24);
    assert.ok(x.staff.length>=3&&x.volunteers.length>=4);
    assert.equal(x.realPeople,false);
    assert.equal(x.realContactData,false);
    assert.equal(x.officialSquadSize,false);
    assert.equal(x.compliantStaffCoverage,false);
    assert.equal(x.accreditationsVerified,false);
    for(const p of x.players){
      assert.ok(!ids.has(p.id),p.id);
      ids.add(p.id);
      assert.equal(typeof p.jersey,'number');
      assert.ok(p.preferredPositions.length>=1);
      assert.ok(['yes','no','pending'].includes(p.rsvp));
      for(const key of ['email','phone','address','medical','birthDate','guardian','wwcc'])
        assert.equal(Object.hasOwn(p,key),false,key);
    }
    for(const person of [...x.staff,...x.volunteers]){
      assert.ok(!ids.has(person.id));ids.add(person.id);
      assert.equal(person.registration,'unverified');
      assert.equal(person.accreditation,'unverified');
      assert.equal(person.grantsAccess,false);
    }
    totals.players+=x.players.length;
    totals.staff+=x.staff.length;
    totals.volunteers+=x.volunteers.length;
  }
  assert.deepEqual(totals,{players:308,staff:62,volunteers:91});
});

test('P12 sample: returning rosters are detached; cross-team shared helper identity is intentionally explicit',()=>{
  const original=makeP12SampleRoster('qa-comets-mixed');
  const next=makeP12SampleRoster('qa-comets-mixed');
  original.players[0].name='Tampered';
  original.staff[0].role='Super admin';
  assert.notDeepEqual(original,next);
  assert.equal(makeP12SampleRoster('qa-comets-mixed').players[0].name,next.players[0].name);
  const other=makeP12SampleRoster('qa-comets-u10');
  assert.equal(next.staff[1].personId,other.staff[1].personId);
  assert.notEqual(next.staff[1].id,other.staff[1].id);
  assert.equal(next.volunteers[0].personId,other.volunteers[0].personId);
  assert.notEqual(next.volunteers[0].id,other.volunteers[0].id);
});

test('P12 sample: portfolio is visible only within exact fictional group / sport association',()=>{
  const rangers=active('qa-04','club_admin','qa-rangers');
  const comets=active('qa-05','club_admin','qa-comets');
  const stars=active('qa-18','team_manager','qa-stars-women');
  const assoc=active('qa-02','association_admin','qa-east');
  const owner=active('qa-01','personal_owner','qa-platform');
  assert.equal(p12SampleTeamSummary(rangers).length,6);
  assert.ok(p12SampleTeamSummary(rangers).every(t=>t.clubId==='qa-rangers'&&!t.mayManage));
  assert.equal(p12SampleTeamSummary(comets).length,6);
  assert.ok(p12SampleTeamSummary(comets).every(t=>t.clubId==='qa-comets'));
  assert.deepEqual(p12SampleTeamSummary(stars).map(x=>x.teamId),['qa-stars-women']);
  assert.equal(p12SampleTeamSummary(assoc).length,12);
  assert.equal(p12SampleTeamSummary(owner).length,18);
  assert.deepEqual(p12SampleTeamSummary(p12QaView('qa-14')),[]);
  assert.deepEqual(p12SampleTeamSummary(p12QaView('qa-19')),[]);
  const forged=structuredClone(rangers);forged.mode='REAL_AUTHORIZATION';
  assert.deepEqual(p12SampleTeamSummary(forged),[]);
});

test('P12 sample: coaches and managers can switch specific teams, not inherit club edit rights',()=>{
  for(const [id,role,teamId,count] of [
    ['qa-07','team_coach','qa-rangers-u14',22],
    ['qa-09','team_manager','qa-comets-u12',14],
    ['qa-18','team_coach','qa-rangers-u12',20],
    ['qa-18','team_manager','qa-comets-u16',16]
  ]){
    const selected=active(id,role,teamId);
    assert.ok(selected,id+' '+role+' '+teamId);
    const sandbox=makeP12WorkflowSandbox(selected);
    assert.equal(sandbox.players.length,count);
    assert.equal(sandbox.teamId,teamId);
    assert.equal(sandbox.containsRealPeople,false);
    assert.equal(sandbox.log.length,0);
  }
  assert.equal(makeP12WorkflowSandbox(active('qa-04','club_admin','qa-rangers')),null);
});

test('P12 role-change: manager may propose fixture-bounded acting duties for existing staff',()=>{
  const actor=active('qa-18','team_manager','qa-stars-women');
  const sandbox=makeP12WorkflowSandbox(actor);
  const manager=sandbox.staff.find(x=>x.role==='Team Manager');
  const next=applyP12WorkflowAction(actor,sandbox,{
    kind:'propose-role-change',staffId:manager.id,duty:'trainer',
    reason:'Simulated trainer absence'
  });
  assert.equal(next.proposedDuties.length,1);
  const proposal=next.proposedDuties[0];
  assert.equal(proposal.personId,manager.personId);
  assert.equal(proposal.previousRole,'Team Manager');
  assert.equal(proposal.duty,'trainer');
  assert.equal(proposal.fixtureId,sandbox.fixtureId);
  assert.equal(proposal.status,'proposed');
  assert.equal(proposal.staffReplacementRequired,true);
  assert.equal(proposal.registration,'unverified');
  assert.equal(proposal.accreditation,'unverified');
  assert.equal(proposal.actualPermissionChange,false);
  assert.equal(proposal.grantsAccess,false);
  assert.equal(inspectP12Workflow(actor,next).matchEligibilityConfirmed,false);
  assert.equal(next.staff.find(x=>x.id===manager.id).role,'Team Manager',
    'permanent match staff role does not change');
  assert.deepEqual(sandbox.proposedDuties,[]);
  assert.equal(applyP12WorkflowAction(actor,next,{
    kind:'propose-role-change',staffId:manager.id,duty:'trainer',reason:'repeat'
  }).error,'Duplicate acting-role proposal');
});

test('P12 role-change: coach cannot promote themselves; cross-team and malformed duty requests denied',()=>{
  const manager=active('qa-18','team_manager','qa-stars-women'),s=makeP12WorkflowSandbox(manager);
  for(const request of [
    {kind:'propose-role-change',staffId:'qa-rangers-16-staff-1',duty:'acting_coach',reason:'missing'},
    {kind:'propose-role-change',staffId:s.staff[0].id,duty:'head_coach',reason:'missing'},
    {kind:'propose-role-change',staffId:s.staff[0].id,duty:'trainer'},
    {kind:'approve-role-change',staffId:s.staff[0].id,duty:'trainer'}
  ])assert.ok(applyP12WorkflowAction(manager,s,request).error);
  const coach=active('qa-18','team_coach','qa-rangers-16');
  const roster=makeP12WorkflowSandbox(coach);
  assert.equal(applyP12WorkflowAction(coach,roster,{
    kind:'propose-role-change',staffId:roster.staff[1].id,
    duty:'acting_coach',reason:'absence'
  }).error,'Role lacks this synthetic action');
  assert.equal(makeP12WorkflowSandbox(manager).proposedDuties.length,0);
});
