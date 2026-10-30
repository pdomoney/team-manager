import test from 'node:test';
import assert from 'node:assert/strict';
import {
  P12_ACCESS_ROLES,P12_SCOPE_TYPES,P12_MEMBERSHIP_TYPES,P12_APPOINTMENT_DUTIES,
  P12_PROTECTED_CLASSES,prepareP12Membership,prepareP12RoleGrant,
  prepareP12FixtureDuty,evaluateP12Access,listP12TestContexts
} from '../site/p12-role-groups.js';

const association={type:'association',id:'association-east'};
const clubA={type:'club',id:'club-a'};
const clubB={type:'club',id:'club-b'};
const teamA={type:'team',id:'team-a-u16'};
const teamB={type:'team',id:'team-b-open'};
const fixtureA={type:'fixture',id:'match-a'};
const fixtureB={type:'fixture',id:'match-b'};
const grant=(role,group,extra={})=>({
  personId:'person-alex',accountId:'account-alex',role,group,
  status:'active',approvedBy:'synthetic-admin',...extra
});
const request=(capability,scope,grants,extra={})=>evaluateP12Access({
  accountId:'account-alex',capability,resourceScope:scope,grants,...extra
});

test('P12A: group types, permissions, and sporting duties are separate concepts',()=>{
  assert.deepEqual(P12_SCOPE_TYPES,['personal','association','club','team','fixture']);
  assert.ok(P12_MEMBERSHIP_TYPES.includes('player'));
  assert.ok(P12_MEMBERSHIP_TYPES.includes('helper'));
  assert.ok(P12_APPOINTMENT_DUTIES.includes('acting_coach'));
  assert.ok(P12_APPOINTMENT_DUTIES.includes('trainer'));
  assert.equal(Object.hasOwn(P12_ACCESS_ROLES,'trainer'),false);
  assert.equal(Object.hasOwn(P12_ACCESS_ROLES,'player'),false);
  assert.equal(P12_ACCESS_ROLES.team_coach.scope,'team');
  assert.equal(P12_ACCESS_ROLES.club_admin.scope,'club');
});

test('P12A: membership proposal neither logs in nor grants permission',()=>{
  const member=prepareP12Membership({personId:'person-alex',group:clubB,type:'player',proposedBy:'club-officer'});
  assert.deepEqual(member.group,clubB);
  assert.equal(member.status,'proposed');
  assert.equal(member.approvedBy,null);
  assert.equal(member.grantsAccess,false);
  assert.equal(request('club:manage',clubB,[member]).allowed,false);
  assert.ok(prepareP12Membership({personId:'x',group:{type:'player',id:'p'},proposedBy:'admin'}).error);
  assert.ok(prepareP12Membership({personId:'x',group:clubA,type:'admin',proposedBy:'admin'}).error);
  assert.ok(prepareP12Membership({personId:'x',group:clubA,type:'player'}).error);
});

test('P12A: each role grant proposal is scoped and pending human approval',()=>{
  const x=prepareP12RoleGrant({
    personId:'person-alex',accountId:'account-alex',role:'team_coach',
    group:teamA,proposedBy:'club-admin'
  });
  assert.equal(x.status,'proposed');
  assert.equal(x.approvedBy,null);
  assert.equal(request('team:manage',teamA,[x]).allowed,false);
  assert.ok(prepareP12RoleGrant({personId:'p',accountId:'a',role:'club_admin',group:teamA,proposedBy:'x'}).error);
  assert.ok(prepareP12RoleGrant({personId:'p',accountId:'a',role:'trainer',group:fixtureA,proposedBy:'x'}).error);
  assert.ok(prepareP12RoleGrant({personId:'p',accountId:'a',role:'team_coach',group:teamA}).error);
});

test('P12B: QA-18 holds separate team roles at two clubs without special logic',()=>{
  const grants=[grant('team_coach',teamA),grant('team_manager',teamB),grant('club_support',clubB)];
  assert.equal(request('tactics:manage',teamA,grants).allowed,true);
  assert.equal(request('schedule:manage',teamB,grants).allowed,true);
  assert.equal(request('tactics:manage',teamB,grants).allowed,false);
  assert.equal(request('club:view',clubB,grants).allowed,true);
  assert.equal(request('club:manage',clubB,grants).allowed,false);
  assert.equal(request('roster:manage',teamA,grants,{accountId:'other-account'}).allowed,false);
});

test('P12B: no implicit association to club or club to team inheritance',()=>{
  const grants=[grant('association_admin',association),grant('club_admin',clubA)];
  assert.equal(request('association:manage',association,grants).allowed,true);
  assert.equal(request('club:manage',clubA,grants).allowed,true);
  assert.equal(request('club:manage',clubB,grants).allowed,false);
  assert.equal(request('team:manage',teamA,grants).allowed,false);
  assert.equal(request('roster:manage',teamA,grants).allowed,false);
});

test('P12B: temporary fixture scoring grant never expands into another match',()=>{
  const grants=[grant('fixture_scorekeeper',fixtureA)];
  assert.equal(request('score:record',fixtureA,grants).allowed,true);
  assert.equal(request('score:record',fixtureB,grants).allowed,false);
  assert.equal(request('team:manage',teamA,grants).allowed,false);
});

test('P12B: expired, revoked, future, malformed and wrong-person grants deny',()=>{
  const base=grant('team_coach',teamA);
  for (const bad of [
    {...base,status:'proposed'}, {...base,status:'revoked'},
    {...base,approvedBy:null},{...base,accountId:'another'},
    {...base,expiresAt:'2026-10-20T12:00:00Z'},
    {...base,validFrom:'2026-11-02T00:00:00Z'},
    {...base,expiresAt:'2026-02-30T12:00:00Z'},
    {...base,role:'fake'},{...base,group:clubA},
    {...base,group:{type:'team',id:''}}
  ]) assert.equal(request('team:manage',teamA,[bad]).allowed,false);
  const expires={...base,validFrom:'2026-10-01T00:00:00Z',expiresAt:'2026-11-01T00:00:00Z'};
  assert.equal(request('team:manage',teamA,[expires],{at:'2026-10-31T23:59:59Z'}).allowed,true);
  assert.equal(request('team:manage',teamA,[expires],{at:expires.expiresAt}).allowed,false);
  assert.equal(request('team:manage',teamA,[expires],{at:'2026-13-01T00:00:00Z'}).allowed,false);
});

test('P12B: non-ordinary sensitive classes are unavailable without production backend',()=>{
  const grants=[grant('club_admin',clubA),grant('personal_owner',{type:'personal',id:'account-alex'})];
  for (const resourceClass of P12_PROTECTED_CLASSES) {
    const outcome=request('club:manage',clubA,grants,{resourceClass});
    assert.equal(outcome.allowed,false,resourceClass);
    assert.equal(outcome.reason,'protected-record-requires-backend');
  }
  assert.equal(request('personal:manage',{type:'personal',id:'account-alex'},grants).allowed,true);
});

test('P12A: acting coach and trainer are fixture appointments, not role grants',()=>{
  const replacement=prepareP12FixtureDuty({
    personId:'person-alex',fixtureId:'match-a',duty:'acting_coach',
    proposedBy:'club-admin',replacesPersonId:'head-coach'
  });
  assert.equal(replacement.status,'proposed');
  assert.equal(replacement.registration,'unverified');
  assert.equal(replacement.accreditation,'unverified');
  assert.equal(replacement.endsWithFixture,true);
  assert.equal(replacement.coverageConfirmed,false);
  assert.equal(replacement.grantsAccess,false);
  assert.equal(request('team:manage',teamA,[replacement]).allowed,false);
  assert.ok(prepareP12FixtureDuty({
    personId:'same',fixtureId:'match-a',duty:'acting_coach',
    proposedBy:'admin',replacesPersonId:'same'
  }).error);
});

test('P12A: a team manager can be proposed as fixture trainer without promotion',()=>{
  const grants=[grant('team_manager',teamB)];
  const appointment=prepareP12FixtureDuty({
    personId:'person-alex',fixtureId:'match-b',duty:'trainer',proposedBy:'club-admin'
  });
  assert.equal(appointment.duty,'trainer');
  assert.equal(appointment.status,'proposed');
  assert.equal(request('match-staff:manage',teamB,grants).allowed,true);
  assert.equal(request('fixture:view',fixtureB,[...grants,appointment]).allowed,false);
  assert.equal(request('team:manage',teamB,[...grants,appointment]).allowed,false);
});

test('P12B: profile contexts expose exact active group/role pairs only',()=>{
  const grants=[
    grant('team_manager',teamB),grant('club_support',clubB),
    grant('team_coach',teamA),grant('fixture_scorekeeper',fixtureA,
      {expiresAt:'2026-10-01T00:00:00Z'}),
    grant('club_admin',clubA,{personId:'another-person'}),
    grant('club_admin',clubB,{status:'proposed'})
  ];
  const contexts=listP12TestContexts({
    personId:'person-alex',accountId:'account-alex',grants
  });
  assert.deepEqual(contexts,[
    {role:'club_support',group:clubB},
    {role:'team_coach',group:teamA},
    {role:'team_manager',group:teamB}
  ]);
  assert.deepEqual(listP12TestContexts({personId:'other',accountId:'account-alex',grants}),[]);
});

test('P12A/B: simulated evaluation does not mutate membership, grants or inputs',()=>{
  const grants=[grant('team_coach',teamA)];
  const snapshot=structuredClone(grants);
  assert.deepEqual(request('team:view',teamA,grants),
    {allowed:true,reason:'synthetic-exact-scope-grant'});
  assert.deepEqual(grants,snapshot);
});
