# P13 candidate production identity and role data contract

**DESIGN CONTRACT ONLY**. Not SQL, migrations, code, authorisation, privacy or legal acceptance. Accompanies [ADR-P13-001](production-identity-architecture-proposal-20261101.md). No new backend account or real user creation is authorised.

Based on [P12](p12-scoped-role-groups.md) accepted synthetic exact-scope group/role concepts and the existing `site/model.js`, `site/organisation-model.js`, `site/people-ledger.js`, `site/p12-role-groups.js`.

## Core invariants

- **One individual Account per verified user** in the proposed first release. A Person is a sporting/administrative identity and may exist without an Account. Guardian acts through **own** Account and verified guardian relationship, never by sharing a junior's password.
- A Person can be a Coach for Rangers U16, Manager for Comets Mixed, Player for Stars, and fixture Trainer simultaneously. This is a normal relation model, not a hard-coded QA-18 special case.
- A Group has exact `group_type` and `group_id`; `association`, `club`, `team`, and `fixture` are independently authorised. A group-affiliation relationship is not a grant.
- A RoleGrant affects **only** its exact target group and capability set. Affiliation and membership do not give content rights. Delegated grant-management checks are separate from reading private records.
- Individual Account to Person, Person to Group, Guardian to Child, Sport Registration to Person, Fixture Duty to Person are **separate**, independently verified relationships.
- A club must not discover another club's member records based solely on matching name, phone, email or public competition listing.
- Operational data is owned by an identified controller/club/association and purpose, including private attendance, contact and injury data. Public directories cannot query sensitive identities.

## Logical records

| Entity | Important attributes and relationships | Security ownership / approval |
| --- | --- | --- |
| Account | Internal ID; IdP subject; verified sign-in and recovery state, created/disabled timestamps | Auth service owns verified identity. PII separate from roles. |
| Person | Opaque ID; lawful minimal sporting profile; classification adult/minor/unknown; lifecycle | Club/organisation-specific visibility. No global browsing. |
| AccountPersonLink | Account ID, Person ID, verification evidence reference, status, reviewed by, dates | Requires verified linking and revocation; duplicate candidates need human review. |
| Organisation | Organisation ID, kind (association/club), published directory ID if verified, status | Public listing not an authorisation grant. |
| Group | Immutable scope ID, type (association/club/team/fixture), owner/controller, status | Exact scope reference; tenant field validated server-side. |
| GroupRelation | Group A to Group B with relation type, dates, provenance | Never implies any privileges. |
| Membership | Person ID, exact Group ID, member type, sport, competition/season as applicable, status | Verifiable participating organisation; not an app permission. |
| AccessRoleDefinition | Role ID, scope types, named capabilities, policy version | Versioned code-controlled list, not editable privilege text from client. |
| RoleGrant | Account ID, role ID, exact Group ID, proposed/approved/revoked state, dates, policy version, approver | Server checks grant issuer and approver, no self-approval; grant-scoped lifecycle. |
| SportingAppointment | Person ID, team/fixture, sport, sporting role, effective dates, previous duty | Purpose-limited, not a digital privilege or accreditation proof. |
| RegistrationEvidence | Person ID, sport, governing authority, source/reference, verification status + expiry | Prefer evidence reference/minimal result; not public or self-declared as verified. |
| GuardianRelationship | Adult Person ID, child Person ID, evidence/consent, scope, authority flags, expiry | Identity and safeguarding review; independent of club admin. |
| Invite | Target scope/role, opaque random one-time token hash, inviter, expiry, consumed/revoked | Server-only token verification, rate limits; do not store raw invitation secrets. |
| Approval | Request ID, kind, reviewer account, decision, scope, provenance, time | Server independently checks reviewer authority and state transition. |
| AuditEvent | Actor account, optional person, exact scope, action, before/after IDs, decision, correlation ID/time | Append-only restricted access; no sensitive data payload in log. |
| PrivateRecord | Owner/controller group, Person subject, classification, purpose, field-level access rules | Least privilege, consent when needed, no cross-club exports by default. |
| PublicDirectoryRecord | Current publicly permitted club information, provenance, reuse/expiry review | Never linked to sensitive membership records by default. |

**Do not automatically merge duplicate Person records.** Same name, phone, club or jersey number is insufficient. Club transfer creates a reviewed affiliation change rather than sharing unrelated records.

## Example role capabilities and boundaries

| Target | Context | Allowed only with independently approved grant or relationship | Must deny |
| --- | --- | --- | --- |
| Platform owner | Explicit platform-admin session | Controlled group onboarding and delegated role administration | Unlogged blanket access to medical/safeguarding records |
| Association admin | Exact association | Approved association-admin functions and specific delegated grants | Automatically editing all clubs/teams or reading children's health records |
| Club admin | Exact club | Club administration and authorised team-role proposals for owned teams | Unrelated club records, implicit Team Coach/Manager rights, self-approval |
| Team Coach | Exact team | Team-specific roster and coaching workflows, purpose-limited member details | Other teams/clubs, unrestricted guardian/health data, arbitrary exports |
| Team Manager | Exact team | Team-specific schedules, RSVP and fixture staff proposals with verification | Unrelated team edits, permanent Coach grant through acting duty |
| Player | Own verified Person + explicit participation | Own RSVP and permitted team content | Other players' contacts/medical/attendance; unverified claims |
| Guardian | Own adult account and reviewed child link | Narrow child RSVP/contact permissions approved for specific purpose | Impersonating child, all club child data, assumed link from family name |
| Helper / Trainer | Exact duty and permitted self/task scope | Own task and fixture appointment status | Club admin, unapproved coach rights, sensitive roster without grant |
| Fixture acting Coach | Exact fixture, verified policy and eligibility | Proposed or approved fixture-specific acting assignment when separately authorised | Permanent Team Coach grant, dual-counted required safety position |

Actual access to injuries/medical and safeguarding requires a **different explicit, purpose-bound policy** even for a Coach or Club Admin. In P12's pure simulator, protected classes are deliberately denied.

## Generic server decision algorithm (illustrative, not a deployable policy)

```text
authenticate(request) => verified Account or deny
determine(request.target) => canonical Group + controller/tenant or deny
resolve(Account -> Person) => verified active link or deny, when person context needed
check Account status, session freshness, step-up for sensitive action
check specific resource purpose, private classification and ownership
check exact RoleGrant(account, target Group, required Role + Capability)
  AND active dates, approval chain, non-self-approval and revocation
OR check a narrowly allowed verified relationship (guardian/self) for that specific action
if delegated grant administration:
  check reviewer eligibility explicitly for target Group/Role,
  never treat affiliation hierarchy as generic record-read inheritance
if sensitive data:
  additionally check explicit need-to-know, safeguarding and lawful purpose
record audit; return least-privilege projection
deny all unspecified actions/resources; reject permission decisions from browser state
```

Authenticated authorization must execute again for every server operation, including bulk export, search/autocomplete, signed media access, offline replay, team/season moves and direct record-ID requests. A user's own Person record may contain records from several clubs; resolving identity does **not** pool those clubs' data.

## Required policy-negatives before any production rollout

| Scenario | Expected backend outcome |
| --- | --- |
| Admin of Club A requests Club B team roster / member search | Deny, including by direct ID and export |
| Association Admin claims every affiliated club | Deny unless independently approved exact club/team function |
| Coach in Team A requests Team B private contact, injury or attendance | Deny |
| Player/Helper/Trainer attempts same-club roster edit | Deny absent separate exact role grant |
| Guardian claims child by surname, phone or invite URL alone | Deny until verified relationship |
| Minor or guardian record is returned in club public directory/search | Deny, redact |
| Candidate approves own pending Club Admin or Coach grant | Deny and audit |
| Revoked/expired grant attempts API call with previously valid session | Deny on next policy evaluation; session cache must not restore access |
| Same Person has 3 distinct club assignments | Only respective authorisations, no union by directory |
| Fixture Trainer acts Coach without separate required safety person (where confirmed NSWRL policy applies) | Block fixture appointment / review; no permanent role grant |
| Claimed registration/accreditation from self-edited profile | Treat unverified |
| Session token replay, expired invite, removed guardian relationship | Deny and record security event |
| Unscoped query, unknown policy version or missing tenant | Deny |
| Attempts reading or updating cross-tenant media via object key / signed URL | Deny |
| Unauthenticated requests to sensitive API and anonymous listings | Deny |
| Browser-modified QA profile or role dropdown grants privileged API action | Deny (QA code carries no authority) |
| Offline pending operation replayed after grant revocation | Deny and safely reconcile |
| Direct access to saved historical GitHub data version | Treat separately as irreversible pre-existing encrypted blob; apply planned cutover and key-risk process |

## Migration requirements

**Current source is encrypted and controlled by the existing user; historical data and keys must not be silently transformed.**

Before any real-data staging:
1. Produce a deterministic read-only inventory of current model records and their scopes, duplicate Person candidates, team/season IDs, private/public fields, source versions and permissions.
2. Get written owner approval for destination provider and controller, data residency/retention, people/guardian verification, backup and key migration process. Do not place decrypted examples in GitHub issues, PR comments, logs, tests or ChatGPT.
3. Retain versioned encrypted original backups and a verified restore path, protected separately from the public site and developer assets. Decide GitHub history exposure handling explicitly.
4. Rehearse using **invented data only**; prove stable ID preservation, referential links, privacy boundaries, consistent counts and opt-in merges.
5. Choose a bounded cutover: explicit write freeze, dry-run results, reconciliation, trusted rollback, owners and recovery targets. Avoid incoherent dual-write across shared-password and new-account stores.
6. After approval and successful migration, switch to server-owned private data APIs and remove the need for browser-held GitHub publishing credentials for private records. Keep public club catalogue and static frontend separate.
7. Do not ship until server-side cross-club API negative tests, privacy review, physical Safari acceptance, monitoring and restoration testing have been completed.

## Open questions

1. Is one platform operator expected to administer unrelated clubs, or should each club independently control records with opt-in federation by association?
2. Which private fields can Coaches access, compared with Managers, approved Trainers, guardians and players? Specifically injury/medical and contact data.
3. Are minor Player accounts ever permitted, and at what age/verification level? What is the Guardian approval and dispute process?
4. Who is the legal controller of club/team data, and how are transfers, departure, archives and deletion handled across organisations?
5. Which identity provider, region, recovery model, email delivery and retention/restore targets are required?
6. Should platform support have zero standing access to private information, using tightly audited emergency access instead? (Recommended: yes.)
7. How will governing-body staff accreditation and validity be **verified** without treating public directories, user entry or fake role assignments as proof?
