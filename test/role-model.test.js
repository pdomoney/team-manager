import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCESS_ROLES, APPOINTMENT_KINDS, SENSITIVE_CLASSES,
  proposeAccessGrant, prepareInvitationDraft,
  simulateGrantDecision, validateRoleSeparation
} from '../site/role-model.js';

// Every scenario below is fictional and is deliberately NOT a backend access
// control test. All assertions are for proposed role-model behaviour only.
const clubA = { type: 'club', id: 'club-a' };
const clubB = { type: 'club', id: 'club-b' };
const teamA = { type: 'team', id: 'club-a-u16' };
const teamB = { type: 'team', id: 'club-b-oztag' };
const league = { type: 'association', id: 'synthetic-league' };
const active = (accountId, role, scope, overrides={}) => ({
  accountId, role, scope, status: 'active', approvedBy: 'fictional-approver',
  ...overrides
});
const decide = (accountId,capability,resourceScope,grants,opts={}) =>
  simulateGrantDecision({accountId,capability,resourceScope,grants,...opts});

test('P02: explicit role proposals remain inactive and do not authenticate people',()=>{
 const x=proposeAccessGrant({accountId:'a-coach',role:'team_coach',scope:teamA,proposedBy:'a-admin'});
 assert.equal(x.status,'proposed');
 assert.equal(x.approvedBy,null);
 assert.equal(decide('a-coach','team:manage',teamA,[x]).allowed,false);
 assert.equal(x.accountId,'a-coach');
 assert.equal(Object.values(ACCESS_ROLES).every(r=>r.scope&&Array.isArray(r.capabilities)),true);
});

test('P02: invalid access role, scope or proposer cannot create a proposed grant',()=>{
 assert.ok(proposeAccessGrant({accountId:'a',role:'club_admin',scope:teamA,proposedBy:'b'}).error);
 assert.ok(proposeAccessGrant({accountId:'a',role:'unrecognised',scope:clubA,proposedBy:'b'}).error);
 assert.ok(proposeAccessGrant({accountId:'',role:'club_admin',scope:clubA,proposedBy:'b'}).error);
 assert.ok(proposeAccessGrant({accountId:'a',role:'club_admin',scope:clubA,proposedBy:''}).error);
});

test('P02: same synthetic account can hold separate team roles across two clubs',()=>{
 const grants=[active('coach-1','team_coach',teamA),active('coach-1','team_manager',teamB)];
 assert.equal(decide('coach-1','tactics:manage',teamA,grants).allowed,true);
 assert.equal(decide('coach-1','schedule:manage',teamB,grants).allowed,true);
 assert.equal(decide('coach-1','tactics:manage',teamB,grants).allowed,false);
 assert.equal(decide('coach-1','club:manage',clubA,grants).allowed,false);
 assert.equal(decide('coach-1','club:manage',clubB,grants).allowed,false);
 assert.equal(decide('other','team:manage',teamA,grants).allowed,false);
});

test('P02: league licence/administrator grant never automatically authorises club records',()=>{
 const grants=[active('league-admin','association_admin',league)];
 assert.equal(decide('league-admin','association:manage',league,grants).allowed,true);
 assert.equal(decide('league-admin','compliance:summary',league,grants).allowed,true);
 assert.equal(decide('league-admin','club:manage',clubA,grants).allowed,false);
 assert.equal(decide('league-admin','roster:manage',teamA,grants).allowed,false);
 assert.equal(decide('league-admin','club:manage',clubB,grants).allowed,false);
});

test('P02: club admin access is confined to the exact nominated club, without inferred team rights',()=>{
 const grants=[active('club-admin','club_admin',clubA)];
 assert.equal(decide('club-admin','club:manage',clubA,grants).allowed,true);
 assert.equal(decide('club-admin','club:manage',clubB,grants).allowed,false);
 assert.equal(decide('club-admin','team:manage',teamA,grants).allowed,false);
});

test('P02: revoked, expired, pending, wrong identity and malformed grants deny the simulation',()=>{
 const base=active('coach-1','team_coach',teamA);
 for(const invalid of [
   {...base,status:'revoked'}, {...base,status:'proposed'},
   {...base,approvedBy:null}, {...base,accountId:'someone-else'},
   {...base,expiresAt:'2026-10-20T23:59:59Z'},
   {...base,validFrom:'2026-11-01T00:00:00Z'},
   {...base,expiresAt:'bad-date'},
   {...base,role:'invalid'}, {...base,scope:clubA}
 ]) assert.equal(decide('coach-1','team:manage',teamA,[invalid]).allowed,false);
 const valid={...base,validFrom:'2026-10-20T00:00:00Z',expiresAt:'2026-11-01T00:00:00Z'};
 assert.equal(decide('coach-1','team:manage',teamA,[valid]).allowed,true);
 assert.equal(decide('coach-1','team:manage',teamA,[valid],{at:valid.expiresAt}).allowed,false,
   'an expiry moment is exclusive');
});

test('P02: sensitive fields always require a future backend even where generic role matches',()=>{
 const grants=[active('club-admin','club_admin',clubA)];
 for(const resourceClass of SENSITIVE_CLASSES){
   const x=decide('club-admin','club:manage',clubA,grants,{resourceClass});
   assert.equal(x.allowed,false,resourceClass);
   assert.equal(x.reason,'protected-record-requires-backend');
 }
});

test('P02: helper, guardian and trainer appointments are not access permissions',()=>{
 for(const role of APPOINTMENT_KINDS) {
   const d=validateRoleSeparation({appointment:role,grantRole:'team_coach'});
   assert.equal(d.appointmentRecognised,true);
   assert.equal(d.appointmentGrantsAccess,false);
   assert.equal(d.qualificationGrantsAccess,false);
 }
 assert.equal(decide('trainer-1','club:manage',clubA,[]).allowed,false);
 assert.equal(decide('guardian-1','roster:manage',teamA,[]).allowed,false);
 assert.equal(validateRoleSeparation({appointment:'unknown',grantRole:'fake'}).accessRoleRecognised,false);
});

test('P02: invitation preparation is non-sending and does not create an account or permission',()=>{
 const invitation=prepareInvitationDraft({destination:' COACH@EXAMPLE.INVALID ',
   role:'team_manager',scope:teamB,invitedBy:'club-admin'});
 assert.equal(invitation.recipient,'coach@example.invalid');
 assert.equal(invitation.status,'draft');
 assert.equal(invitation.sent,false);
 assert.equal(invitation.accepted,false);
 assert.equal(invitation.accountId,null);
 assert.equal(invitation.token,null);
 assert.equal(invitation.roleGrant,null);
 assert.equal(decide('coach@example.invalid','schedule:manage',teamB,[invitation]).allowed,false);
 assert.ok(prepareInvitationDraft({destination:'invalid',role:'team_manager',scope:teamB,invitedBy:'admin'}).error);
 assert.ok(prepareInvitationDraft({destination:'test@example.invalid',role:'club_admin',scope:teamB,invitedBy:'admin'}).error);
});

test('P02: identical names, different appointments and roles do not imply same identity',()=>{
 const clubGrants=[active('person-1','club_support',clubA),active('person-2','club_admin',clubB)];
 assert.equal(decide('person-1','club:view',clubA,clubGrants).allowed,true);
 assert.equal(decide('person-2','club:manage',clubB,clubGrants).allowed,true);
 assert.equal(decide('person-1','club:manage',clubB,clubGrants).allowed,false);
 assert.equal(decide('person-2','club:view',clubA,clubGrants).allowed,false);
});

test('P02: invalid dates, missing contexts and client-selected role names cannot authorise',()=>{
 const grants=[active('coach-1','team_coach',teamA)];
 assert.equal(simulateGrantDecision({accountId:'coach-1',capability:'team:manage',
   grants,resourceScope:teamA,at:'2026-99-88T00:00:00Z'}).allowed,false);
 assert.equal(simulateGrantDecision({accountId:'coach-1',capability:'team:manage',
   grants,resourceScope:{type:'all',id:'any'}}).allowed,false);
 assert.equal(simulateGrantDecision({accountId:'coach-1',capability:'team:manage',
   grants,resourceScope:undefined}).allowed,false);
 assert.equal(decide('coach-1','club:manage',clubB,grants,{requestedRole:'club_admin'}).allowed,false);
});

test('P02: simulator has no side effects on synthetic grants or request',()=>{
 const grants=[active('coach-1','team_coach',teamA)];
 const initial=structuredClone(grants);
 const request={accountId:'coach-1',capability:'team:view',resourceScope:teamA,grants};
 const x=simulateGrantDecision(request);
 assert.deepEqual(x,{allowed:true,reason:'synthetic-grant-matches'});
 assert.deepEqual(grants,initial);
});
