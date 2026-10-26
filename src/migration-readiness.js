// P10C design-time manifest for a FUTURE migration, never a data converter.
// No workspace file, encrypted archive, GitHub credential, browser storage or backend is read.
// Post-P10 #55 needs a separately authorised, server-enforced implementation.
import { SCHEMA } from '../site/model.js';

const row = (id, source, candidate, key, privacy, decision, preservation) =>
  ({ id, source, candidate, key, privacy, decision, preservation });

const entityMap = [
  row('workspace', 'ws', 'DataSpace candidate', 'sourceWorkspaceId', 'private', 'owner-confirmed', 'encrypted ownership boundary'),
  row('club', 'ws.clubs[]', 'Organisation candidate', 'workspaceId + club.id', 'restricted', 'club-ownership-review', 'branding, logo, affiliation provenance'),
  row('team-root', 'ws root team', 'Team', 'workspaceId + ws.id (root)', 'restricted', 'club-link-review', 'root first-team compatibility and archive state'),
  row('team-extra', 'ws.teams[]', 'Team', 'workspaceId + team.id', 'restricted', 'club-link-review', 'team identities and local defaults'),
  row('season', 'team.seasons[]', 'TeamSeason', 'workspaceId + team.id + season.id', 'restricted', 'membership-review', 'historical squad and staff snapshots'),
  row('player', 'team.players[]', 'ProvisionalPerson + PlayerRecord', 'workspaceId + team.id + player.id', 'highly-sensitive', 'verified-identity-required', 'identity, photos and private contacts'),
  row('participation', 'season.squad[]', 'Participation', 'workspaceId + team.id + season.id + playerId', 'restricted', 'player-link-review', 'season-specific positions, numbers and registration'),
  row('jersey', 'player.jerseys[]', 'JerseyLoan', 'workspaceId + team.id + player.id + loan.id', 'restricted', 'historic-ledger-review', 'issue/return and correction history'),
  row('jersey-correction', 'player.jerseyCorrections[]', 'JerseyCorrection', 'workspaceId + team.id + player.id + correction key', 'restricted', 'historic-ledger-review', 'old numbers and corrections'),
  row('helper', 'team.helpers[]', 'HelperAppointment candidate', 'workspaceId + team.id + helper.id', 'highly-sensitive', 'consent-and-guardian-review', 'assistance records without assumed custody'),
  row('club-official', 'club.officials[]', 'OrganisationAppointment candidate', 'workspaceId + club.id + source row index', 'restricted', 'identity-and-role-review', 'unaltered appointment snapshots'),
  row('team-staff', 'team.team.staff[]', 'TeamAppointment candidate', 'workspaceId + team.id + source row index', 'restricted', 'identity-and-role-review', 'coaching, management and training appointments'),
  row('match-official', 'ws.matchOfficials[]', 'SportQualification candidate', 'workspaceId + official.id', 'highly-sensitive', 'manual-credential-review', 'coach-asserted eligibility and WWCC status'),
  row('volunteer-appointment', 'ws.volunteerAppointments[]', 'Appointment candidate', 'workspaceId + appointment.id', 'highly-sensitive', 'manual-credential-review', 'audit, revocation and sport eligibility'),
  row('person-review', 'ws.peopleReviews[]', 'IdentityReviewLedger candidate', 'workspaceId + review.id', 'highly-sensitive', 'identity-claims-review', 'resolution and correction history'),
  row('guardian-review', 'ws.guardianReviews[]', 'GuardianReviewLedger candidate', 'workspaceId + review.id', 'highly-sensitive', 'safeguarding-consent-review', 'no guardian account or permission inferred'),
  row('competition', 'ws.competitions[]', 'Competition candidate', 'workspaceId + competition.id', 'restricted', 'organiser-authority-review', 'status, provenance and local entry scope'),
  row('entry', 'competition.entries[]', 'CompetitionEntry', 'workspaceId + competition.id + entry.id', 'restricted', 'team-season-link-review', 'division, pool, withdrawal and source IDs'),
  row('match', 'team.matches[]', 'MatchRecord candidate', 'workspaceId + team.id + match.id', 'restricted', 'fixture-authority-review', 'results, linked tasks and privacy-protected notes'),
  row('fixture-revision', 'match.fixtureRevisions[]', 'FixtureRevision candidate', 'workspaceId + team.id + match.id + revision ordinal', 'restricted', 'audit-and-authority-review', 'before/after chronology and actor attribution'),
  row('session', 'team.sessions[]', 'ScheduledActivity candidate', 'workspaceId + team.id + session.id', 'restricted', 'time-and-link-review', 'training, attendance and cancellations'),
  row('task', 'team.tasks[]', 'VolunteerTask candidate', 'workspaceId + team.id + task.id', 'highly-sensitive', 'assignee-privacy-review', 'match/session links and helper assignment history'),
  row('notice', 'team.notices[]', 'Notice candidate', 'workspaceId + team.id + notice.id', 'restricted', 'audience-review', 'old text and publication scope'),
  row('message', 'team.messages[]', 'Communication candidate', 'workspaceId + team.id + message.id', 'highly-sensitive', 'recipient-and-consent-review', 'outbound draft and coach-recorded response provenance'),
  row('play', 'team.plays[]', 'ContentRevision candidate', 'workspaceId + team.id + play.id', 'restricted', 'content-rights-review', 'sport, revision, source and team ownership'),
  row('library', 'ws.library', 'PersonalContentLibrary candidate', 'sourceWorkspaceId + library', 'restricted', 'consented-sharing-review', 'plays, systems, player sets and versions')
];

const blockingGates = [
  { id: 'SAFARI-REAL', status: 'unverified', owner: 'product owner', evidence: 'physical iPhone/macOS Safari P06–P09 V/S/S/R case outcomes' },
  { id: 'BACKUP-REAL', status: 'unverified', owner: 'product owner', evidence: 'actual encrypted browser export, restore, wrong password, repeat import and rollback' },
  { id: 'CONFLICT-REAL', status: 'unverified', owner: 'product owner', evidence: 'independent live test-device stale publish, review and no silent overwrite' },
  { id: 'PUBLISH-REAL', status: 'unverified', owner: 'product owner', evidence: 'authorised real data-branch publish/recovery with only fictional data' },
  { id: 'SECURITY-BOUNDARY', status: 'deferred-to-post-P10', owner: 'future backend work #55', evidence: 'server-enforced default-deny tenant authorisation and audited identity lifecycle' },
  { id: 'OWNER-RELEASE', status: 'unverified', owner: 'product owner', evidence: 'final P10 exact-commit release acceptance after all blockers disposed' }
];

const risks = [
  { id: 'R01', severity: 'high', trigger: 'shared coach password across multiple clubs', control: 'treat as one trusted workspace; server-side data-space isolation only post-P10' },
  { id: 'R02', severity: 'high', trigger: 'guardian/helper or coach appointment is confused with access permission', control: 'unverified claims stay in review queue; no automatic identity or role grant' },
  { id: 'R03', severity: 'high', trigger: 'private youth, medical, contact or volunteer records enter player/public projection', control: 'per-team allowlist projection; negative privacy and real-device regression' },
  { id: 'R04', severity: 'high', trigger: 'two devices publish from an outdated revision', control: 'review conflicts, preserve both encrypted backups, never force-overwrite without owner confirmation' },
  { id: 'R05', severity: 'high', trigger: 'lost password, invalid backup or destructive schema rollback', control: 'independent encrypted copies and physical restore validation; no guarantee of password recovery' },
  { id: 'R06', severity: 'medium', trigger: 'public GitHub history retains old encrypted team files', control: 'treat password rotation as future-access restriction, not retroactive erasure' },
  { id: 'R07', severity: 'high', trigger: 'official fixture or WWCC status mistaken for independently verified authority', control: 'preserve coach-asserted provenance and require independent source verification before production use' },
  { id: 'R08', severity: 'high', trigger: 'cross-club ID collision or merging people by matching names', control: 'namespace every legacy ID by source workspace; explicit links within workspace only; manual adjudication' }
];

export function migrationReadinessManifest() {
  // Detached JSON-compatible values: callers cannot mutate the template for subsequent uses.
  return {
    format: 'team-manager-migration-readiness',
    manifestVersion: 1,
    currentWorkspaceSchema: SCHEMA,
    status: 'DESIGN_ONLY_NOT_APPROVED_FOR_IMPORT',
    platform: 'GitHub Pages + encrypted coach workspace',
    migrationExecution: false,
    sourceDataRead: false,
    externalConnections: false,
    futureBackendIssue: 55,
    postP10PersonaIssue: 62,
    legacyKeyConvention: 'JSON.stringify([sourceWorkspaceId,sourceRecordKind,...sourcePathIds])',
    sourceIdentityPolicy: 'one trusted legacy workspace; no global lookup or name-based identity joins',
    recordMappings: entityMap.map(x=>({ ...x })),
    releaseGates: blockingGates.map(x=>({ ...x })),
    riskRegister: risks.map(x=>({ ...x }))
  };
}
