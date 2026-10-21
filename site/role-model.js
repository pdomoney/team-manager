// P02: future individual-role model, NOT production authorisation.
//
// This module is intentionally not imported by the current app. It provides
// deterministic, side-effect-free definitions and a policy design simulator for
// synthetic tests and architecture review. A caller can forge arguments; its
// decisions MUST NOT be used to protect real user, team, child, health or club data.
//
// The current application still uses shared coach/team passwords and one
// encrypted coach workspace. Actual authenticated and server-enforced permissions
// belong to the separately approved post-P10 project, GitHub issue #55.

const freeze = (x) => Object.freeze(x);
export const SCOPES = freeze(['personal', 'association', 'club', 'team']);
export const SENSITIVE_CLASSES = freeze([
  'personal-contact', 'minor-private', 'medical', 'safeguarding',
  'accreditation-evidence', 'credential', 'billing-private'
]);

// These roles describe possible future ACCESS grants. They are deliberately
// distinct from appointments (coach, first-aider, secretary, BBQ helper, etc.)
// and distinct from whether a person's sporting qualifications are current.
// Rights granted at one scope NEVER propagate to another scope implicitly.
const define = (label, scope, capabilities) =>
  freeze({ label, scope, capabilities: freeze([...capabilities]) });
export const ACCESS_ROLES = freeze({
  personal_owner: define('Personal workspace owner', 'personal',
    ['personal:view', 'personal:edit', 'library:view', 'library:manage']),
  association_admin: define('Association administrator', 'association',
    ['association:view', 'association:manage', 'affiliation:manage',
      'competition:view', 'competition:manage', 'compliance:summary']),
  association_viewer: define('Association viewer', 'association',
    ['association:view', 'competition:view', 'compliance:summary']),
  club_admin: define('Club administrator', 'club',
    ['club:view', 'club:manage', 'club-staff:manage', 'compliance:summary']),
  club_support: define('Club support', 'club', ['club:view']),
  team_coach: define('Team coach', 'team',
    ['team:view', 'team:manage', 'roster:manage', 'schedule:manage',
      'tactics:manage', 'match-staff:manage']),
  team_manager: define('Team manager', 'team',
    ['team:view', 'roster:manage', 'schedule:manage', 'match-staff:manage']),
  team_viewer: define('Team viewer', 'team', ['team:view'])
});

// An Appointment is a fact that someone performs a job, not an access grant.
// The same Person can hold several roles in different clubs or sports.
export const APPOINTMENT_KINDS = freeze([
  'club_executive', 'club_support', 'head_coach', 'assistant_coach',
  'team_manager', 'match_trainer', 'first_aider', 'scorekeeper',
  'general_helper', 'player', 'guardian'
]);

const clean = (v) => typeof v === 'string' ? v.trim() : '';
const scopeOf = (scope) => {
  if (!scope || !SCOPES.includes(scope.type) || !clean(scope.id)) return null;
  return { type: scope.type, id: clean(scope.id) };
};
const iso = v => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export function proposeAccessGrant({ accountId, role, scope, proposedBy, purpose = '' } = {}) {
  const who = clean(accountId), by = clean(proposedBy), s = scopeOf(scope);
  if (!who || !by) return { error: 'Account and proposing actor are required' };
  if (!ACCESS_ROLES[role]) return { error: 'Unrecognised access role' };
  if (!s || s.type !== ACCESS_ROLES[role].scope) return { error: 'Invalid role/scope combination' };
  return {
    accountId: who, role, scope: s, proposedBy: by,
    purpose: clean(purpose).slice(0, 200),
    status: 'proposed', approvedBy: null, expiresAt: null
  };
}

// Creates ONLY a non-sending draft; in particular it does not set accountId,
// membership, approval, or invite acceptance. It can be tested without email.
export function prepareInvitationDraft({ destination, role, scope, invitedBy } = {}) {
  const target = clean(destination).toLowerCase(), sponsor = clean(invitedBy), s = scopeOf(scope);
  if (!target || !sponsor || !ACCESS_ROLES[role] || s?.type !== ACCESS_ROLES[role].scope)
    return { error: 'Recipient, sponsor, valid role and matching scope are required' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target))
    return { error: 'Invalid invitation email' };
  return {
    recipient: target, role, scope: s, invitedBy: sponsor,
    status: 'draft', sent: false, accepted: false,
    accountId: null, token: null, roleGrant: null
  };
}

// Pure design simulator, not a check against a verified identity or a database.
// Never call this function from current application screens or data endpoints.
// 'approvedBy' and other fields are synthetic in this module.
export function simulateGrantDecision({
  accountId, capability, resourceScope, resourceClass = 'ordinary',
  grants = [], at = '2026-10-21T00:00:00Z'
} = {}) {
  const subject = clean(accountId), cap = clean(capability), scope = scopeOf(resourceScope);
  const now = iso(at);
  if (!subject || !cap || !scope || now === null)
    return { allowed: false, reason: 'invalid-request' };
  if (SENSITIVE_CLASSES.includes(resourceClass))
    return { allowed: false, reason: 'protected-record-requires-backend' };
  for (const g of Array.isArray(grants) ? grants : []) {
    if (!g || g.status !== 'active' || !clean(g.approvedBy) || g.accountId !== subject)
      continue;
    const role = ACCESS_ROLES[g.role];
    if (!role || !role.capabilities.includes(cap)) continue;
    const gs = scopeOf(g.scope);
    if (!gs || gs.type !== role.scope || gs.type !== scope.type || gs.id !== scope.id)
      continue;
    const start = g.validFrom == null ? null : iso(g.validFrom);
    const stop = g.expiresAt == null ? null : iso(g.expiresAt);
    if ((g.validFrom != null && start === null) || (g.expiresAt != null && stop === null))
      continue;
    if ((start !== null && now < start) || (stop !== null && now >= stop))
      continue;
    return { allowed: true, reason: 'synthetic-grant-matches' };
  }
  return { allowed: false, reason: 'no-matching-active-grant' };
}

export function validateRoleSeparation({ appointment, grantRole } = {}) {
  return {
    appointmentRecognised: APPOINTMENT_KINDS.includes(appointment),
    accessRoleRecognised: Object.hasOwn(ACCESS_ROLES, grantRole),
    appointmentGrantsAccess: false,
    qualificationGrantsAccess: false
  };
}
