// P12A/B: pure synthetic scope and group-role model. NOT production authorisation.
// Never use this module to gate encrypted coach workspace, personal, medical or child data.
// Shared passwords on GitHub Pages are not individual identities; server enforcement is #55.

const frozenList = values => Object.freeze([...values]);
export const P12_SCOPE_TYPES = frozenList(['personal', 'association', 'club', 'team', 'fixture']);
export const P12_MEMBERSHIP_TYPES = frozenList(['member', 'player', 'helper', 'staff', 'guardian']);
export const P12_APPOINTMENT_DUTIES = frozenList([
  'head_coach', 'acting_coach', 'assistant_coach', 'team_manager',
  'trainer', 'first_aider', 'league_safe', 'scorekeeper', 'match_delegate', 'helper'
]);

// Role = access capability; sporting appointment, membership and accreditation are separate.
// No parent/child privilege inheritance. Even an association administrator is NOT a club admin.
const define = (scope, capabilities) =>
  Object.freeze({ scope, capabilities: frozenList(capabilities) });
export const P12_ACCESS_ROLES = Object.freeze({
  personal_owner: define('personal', ['personal:view', 'personal:manage']),
  association_admin: define('association', ['association:view', 'association:manage', 'competition:manage']),
  association_viewer: define('association', ['association:view', 'competition:view']),
  club_admin: define('club', ['club:view', 'club:manage', 'club-staff:manage']),
  club_support: define('club', ['club:view']),
  team_coach: define('team', ['team:view', 'team:manage', 'roster:manage', 'schedule:manage', 'tactics:manage']),
  team_assistant: define('team', ['team:view', 'schedule:view', 'tactics:view']),
  team_manager: define('team', ['team:view', 'roster:manage', 'schedule:manage', 'match-staff:manage']),
  team_viewer: define('team', ['team:view']),
  fixture_scorekeeper: define('fixture', ['fixture:view', 'score:record']),
  fixture_staff_viewer: define('fixture', ['fixture:view'])
});
export const P12_PROTECTED_CLASSES = frozenList([
  'minor-private', 'personal-contact', 'medical', 'safeguarding',
  'accreditation-evidence', 'credential', 'billing-private'
]);

const clean = x => typeof x === 'string' ? x.trim() : '';
const validScope = x => x && typeof x === 'object' && !Array.isArray(x) &&
  P12_SCOPE_TYPES.includes(x.type) && clean(x.id) !== '';
const copyScope = x => ({ type: x.type, id: clean(x.id) });
const roleOf = name => Object.hasOwn(P12_ACCESS_ROLES, name) ? P12_ACCESS_ROLES[name] : null;
const validInstant = x => {
  if (typeof x !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(x)) return null;
  const t = Date.parse(x);
  if (!Number.isFinite(t)) return null;
  const canonical = new Date(t).toISOString();
  if (canonical.slice(0, 19) !== x.slice(0, 19)) return null;
  return t;
};
const activeAt = (item, now) => {
  if (!item || item.status !== 'active' || !clean(item.approvedBy)) return false;
  const start = item.validFrom == null ? null : validInstant(item.validFrom);
  const stop = item.expiresAt == null ? null : validInstant(item.expiresAt);
  if ((item.validFrom != null && start === null) ||
      (item.expiresAt != null && stop === null)) return false;
  return (start === null || now >= start) && (stop === null || now < stop);
};
const sameScope = (a,b) =>
  validScope(a) && validScope(b) && a.type === b.type && a.id === b.id;

// A membership represents participation, not a permission assignment.
export function prepareP12Membership({personId, group, type='member', proposedBy}={}) {
  if (!clean(personId) || !clean(proposedBy) || !validScope(group) ||
      group.type === 'personal' || !P12_MEMBERSHIP_TYPES.includes(type)) {
    return {error:'Person, valid group, membership type and proposer are required'};
  }
  return {
    personId:clean(personId),group:copyScope(group),type,
    proposedBy:clean(proposedBy),status:'proposed',approvedBy:null,
    validFrom:null,expiresAt:null,grantsAccess:false
  };
}

// A grant must be independently approved before it can be active.
// Never infer grants from membership, sporting duty or qualification.
export function prepareP12RoleGrant({personId,accountId,role,group,proposedBy}={}) {
  const def=roleOf(role);
  if (!clean(personId) || !clean(accountId) || !clean(proposedBy) ||
      !def || !validScope(group) || group.type !== def.scope) {
    return {error:'Person, account, known role, exact role scope and proposer are required'};
  }
  return {
    personId:clean(personId),accountId:clean(accountId),role,group:copyScope(group),
    proposedBy:clean(proposedBy),status:'proposed',approvedBy:null,
    validFrom:null,expiresAt:null
  };
}

// This records a candidate duty ONLY, not registration, qualification or authority.
// A trainer can be proposed as acting coach for one match without changing their
// team/club role grants. P12F checks approved competition policies and duty conflicts.
export function prepareP12FixtureDuty({personId,fixtureId,duty,proposedBy,replacesPersonId=''}={}) {
  if (!clean(personId) || !clean(fixtureId) || !clean(proposedBy) ||
      !P12_APPOINTMENT_DUTIES.includes(duty) ||
      (replacesPersonId && !clean(replacesPersonId)) ||
      (clean(replacesPersonId) && clean(replacesPersonId) === clean(personId))) {
    return {error:'A different, valid person/fixture/duty and proposer are required'};
  }
  return {
    personId:clean(personId),fixtureId:clean(fixtureId),duty,
    replacesPersonId:clean(replacesPersonId),
    proposedBy:clean(proposedBy),status:'proposed',approvedBy:null,
    registration:'unverified',accreditation:'unverified',
    endsWithFixture:true,grantsAccess:false,coverageConfirmed:false
  };
}

// Synthetic decision ONLY. The actor's requested/current UI role is deliberately
// ignored. This exact-scope algorithm MUST NOT secure production resources.
export function evaluateP12Access({
  accountId,capability,resourceScope,resourceClass='ordinary',grants=[],at='2026-10-30T00:00:00Z'
}={}) {
  const now=validInstant(at);
  if (!clean(accountId) || !clean(capability) || !validScope(resourceScope) || now === null) {
    return {allowed:false,reason:'invalid-request'};
  }
  if (P12_PROTECTED_CLASSES.includes(resourceClass)) {
    return {allowed:false,reason:'protected-record-requires-backend'};
  }
  for (const grant of Array.isArray(grants) ? grants : []) {
    const role=roleOf(grant?.role);
    if (grant?.accountId !== accountId || !role ||
        !role.capabilities.includes(capability) || !sameScope(grant.group,resourceScope) ||
        grant.group.type !== role.scope || !activeAt(grant,now)) continue;
    return {allowed:true,reason:'synthetic-exact-scope-grant'};
  }
  return {allowed:false,reason:'no-applicable-active-grant'};
}

// Context list for later QA profile selection, not a source of authorisation.
export function listP12TestContexts({personId,accountId,grants=[],at='2026-10-30T00:00:00Z'}={}) {
  const now=validInstant(at);
  if (!clean(personId) || !clean(accountId) || now === null || !Array.isArray(grants)) return [];
  return grants.filter(g => g?.personId === personId && g.accountId === accountId &&
    validScope(g.group) && roleOf(g.role)?.scope === g.group.type && activeAt(g,now))
    .map(g => ({role:g.role,group:copyScope(g.group)}))
    .sort((a,b)=>(a.group.type+':'+a.group.id+':'+a.role)
      .localeCompare(b.group.type+':'+b.group.id+':'+b.role));
}
