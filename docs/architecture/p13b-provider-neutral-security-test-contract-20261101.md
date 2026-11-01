# P13B candidate server-authorisation contract and negative-security test plan

**Status: DESIGN / TEST SPECIFICATION ONLY. Not implemented, tested against a server, authorised or deployed.**
Date: 1 November 2026. Started from merged PR133, exact `main` `b74bc33d6a7d3d413952209a1650db24539d8910`.

Linked decisions: [#55 production security gate](https://github.com/pdomoney/team-manager/issues/55), [PR132 identity architecture](production-identity-architecture-proposal-20261101.md), [PR133 provider comparison](p13a-backend-provider-security-scorecard-20261101.md), [P12 completed simulator #124](https://github.com/pdomoney/team-manager/issues/124), [#35 volunteer/club privacy](https://github.com/pdomoney/team-manager/issues/35), [#131 physical Safari testing](https://github.com/pdomoney/team-manager/issues/131).

The tests below must eventually be executed **through a trusted server/database authorization boundary**, not through the P12 client-side QA selector. They are proposed requirements for comparing Supabase/PostgreSQL RLS, Firebase/Firestore rules and an independently hosted API. None is a claim of current live enforcement.

## 1. Threat model and trust boundaries

| Asset | Relevant attacker or failure | Essential mitigation |
| --- | --- | --- |
| Private player/guardian profiles and child records | Unrelated club admin or another club's player requests ID or search | Resolve authenticated identity; exact authorized group and purpose; redact or deny on every record and projection |
| Injury, medical and safeguarding information | Even a valid Coach uses broad team role to inspect unnecessary sensitive fields | Separate purpose and clinical/safeguarding access policy, verified need-to-know, no implicit data privilege |
| Role grants, delegations, account links | User crafts approval request for self/other club or edits JWT/URL/local storage | Server-only transactional validation of reviewer, group/role, approval state and identity |
| Invites and device recovery | Leaked link, replayed email token, reassigned phone or lost device | One-time token hash, expiry, rate limit, verified account link, step-up verification and revocation |
| Fixture appointments and accreditation | Team manager appoints trainer and claims qualification | Independent governing-body evidence and approval; no conversion to permanent app rights |
| Bulk exports/search/media | Unscoped query, guessed blob object key, shared/signed URL | Exact policy on query, export, download, object access and URL expiry; auditable decisions |
| Offline/cached role access | Former Coach uses existing session or queued offline edit | Server rechecks current grant and account state; reject replay; safe device-cache invalidation strategy |
| Operator and maintenance access | Service bypass keys or shared support accounts | Server-only privileged keys, least-privilege operations, logged break-glass and separation of duties |
| Historic GitHub data | Shared key leaked or old encrypted Git blobs retained after account cutover | Historical exposure risk and retention plan; cannot promise retrospective access revocation |

**Adversarial assumption:** all browser-supplied fields, role names, selected persona, group/team IDs, invitation responses, resource IDs, request headers and stored client state can be edited by the caller. A public GitHub Pages script is not a trusted authorization component. A privileged token must not be shipped there.

## 2. Proposed provider-neutral operation contract

These names are **illustrative** resource/action contracts, NOT functioning endpoints or required database names. A later vendor-specific adapter may use SQL, RPC or a REST/GraphQL API as long as every operation has the same externally verifiable authorization outcome.

| Operation class | Example operation | Authorization requirements | Deny conditions |
| --- | --- | --- | --- |
| Read self | `person.self.read` | Authenticated Account, verified AccountPersonLink, purpose-specific field projection | Unverified link, disabled account, private data of another person |
| Update self | `person.self.update` | Verified own Person, allowed editable fields, audit | Client attempts role, accreditation, guardian proof or club ownership mutation |
| Read team | `team.roster.read` | Active **exact team** grant with `roster:read` | Mere association affiliation, club-admin role only, player membership, wrong team |
| Manage team | `team.roster.manage` | Active exact team Coach/Manager capability, record in correct team/season | Foreign team/resource, expired grant, scope of parent club alone |
| Contact data | `contact.read` | Verified purpose and explicitly permitted projection for that exact team/Person | General public directory, unrelated guardian, broader "team member" inference |
| Sensitive data | `medical.read`, `safeguarding.read` | Separate approved need-to-know policy, explicit audit and regulated purpose | Default Coach, Manager, owner or association role absent sensitive-data grant |
| Club setup | `club.settings.manage` | Active explicit club admin grant to that club | Other club; role in another club; merely linked association |
| Role review | `role.proposal.approve`, `revoke` | Trusted identity of reviewer; delegated approval policy scoped to exact target; non-self-approval; atomic transition | Candidate approving own request, forged reviewer, revoked reviewer, policy version mismatch |
| Guardian | `guardian.child.rsvp` | Verified relationship, permitted child scope and current authority | Same surname, email match, unapproved link, revoked legal authority |
| Match duty | `fixture.duty.propose` | Exact team/fixture role, server-validated fixture and staff membership | Arbitrary person/fixture IDs, implicit permanent Coach grant |
| Registration | `qualification.verify` | Trusted verifier using authorised reference and expiry | Player, helper or Coach self-reports a badge as accredited |
| Invitations | `invite.create`, `redeem` | Authorised inviter, exact scope/role, one-time challenge, verified recipient and grant flow | URL possession alone, replay, cancelled/expired token, wrong role/club |
| Documents | `file.download`, `file.upload` | Server-controlled storage path and private record/tenant policy | Guessed object name, expired signed URL, foreign club, altered metadata |
| Exports/search | `search.people`, `export.team` | Query restricted server-side to exact allowed records and fields | Any global private directory or cross-tenant result; result-count leakage |
| Administration | `support.breakglass` | Separate strong authentication, time limit, purpose, human authorisation and immutable audit | Routine unrestricted support access or silently persisted elevation |

**Rule:** A UI-visible list, successful JWT verification, public club directory entry, team membership or existing coach workspace password is *insufficient by itself* to authorise a private server operation.

### Required server policy evaluation order

1. Authenticate actual request principal and determine freshness, revocation and any step-up requirement.
2. Resolve canonical resource ID and controller/tenant using trusted database relations, never a client-supplied tenant claim.
3. Resolve verified Account↔Person mapping when necessary; prove required guardian, membership or sporting appointment status separately.
4. Retrieve active exact-scoped role grants, issuer/approver eligibility, expiration and approved policy version. Do not silently inherit along association→club→team.
5. Enforce field classification, permitted purpose and resource-specific ownership before any query, mutation, media token or export.
6. Use transactional compare-and-transition for pending→approved→active/revoked and invitation consumption.
7. Log accountable permitted and denied sensitive operations without storing private contact, medical or invitation-secret payloads.
8. Return minimum necessary response. Denied requests have no side effects, no contact details and no existence leakage from error differences.
9. Reapply authoritative checks to bulk, pagination, websocket/subscription, background job, offline replay, direct link and cache refresh.

## 3. Mandatory deterministic synthetic fixture set

Use **only invented identities** and stable UUID-like/test IDs in a disposable local or isolated non-production environment after that environment is approved. P12's fictional 18-team UI fixtures may serve as a conceptual reference, but the new tests require a real *server authorization boundary*. No live club registrations or minors' details are necessary.

- **Account A**: Owner/Platform support; no standing medical access.
- **Account B**: Club Rangers Admin; separate Team Rangers U16 Coach only when independently granted.
- **Account C**: Club Comets Admin and team Comets Mixed Manager.
- **Account D**: Coach Rangers U16, Manager Stars Women, Player Comets Mixed, plus an explicitly granted second club role. This tests independent roles within one account.
- **Account E**: Player Comets Mixed only.
- **Account F**: Verified adult guardian of fabricated junior `J1` in Rangers U12, not guardian of `J2`.
- **Account G**: Pending coach invite, never redeemed.
- **Account H**: Revoked Coach, previously granted Rangers U16.
- **Account I**: Account with expired grant and an old access token.
- **Account J**: Unaffiliated signed-in actor; permitted to see published club directory only.
- **Account K**: Club Rangers approver also nominated for an additional Coach role (self-approval must fail).

Provision separate fake public group relations: fictional Association East→Comets and Stars, Association West→Rangers. These relations **never confer private child resource access**. Include at least one fixture where a named synthetic on-field Trainer is proposed as Acting Coach and a second synthetic person is proposed as replacement, with accreditation unknown.

## 4. Negative-security acceptance scenarios

**Result classes:** `DENY` means authorization fails and no side effects; `ALLOW-LIMITED` means only exact scoped, minimally projected records/fields. `REVIEW` means a proposal, not a permission grant or verified sporting eligibility. HTTP status code or DB error representation is vendor-specific, but distinguish denial from successful empty query when assessing test evidence. Never leak forbidden record existence.

| Test ID | Attempt | Expected result |
| --- | --- | --- |
| ID-001 | Anonymous requests private team roster | DENY |
| ID-002 | Signed-in J requests Rangers roster | DENY |
| ID-003 | Rangers Admin B requests Rangers Club settings with explicit club grant | ALLOW-LIMITED |
| ID-004 | Rangers Admin B requests Comets Club settings | DENY |
| ID-005 | B uses Rangers club grant to update Rangers U16 lineup without team grant | DENY |
| ID-006 | Explicit Rangers Coach grant allows B a permitted team operation | ALLOW-LIMITED |
| ID-007 | D reads Rangers roster under Rangers team Coach scope | ALLOW-LIMITED |
| ID-008 | D reads Stars team manager records under Stars exact role | ALLOW-LIMITED |
| ID-009 | D requests unrelated Rangers U8 sensitive record without grant | DENY |
| ID-010 | D uses Comets Player membership to list Comets private staff contacts | DENY |
| ID-011 | E attempts Comets Club Admin operation | DENY |
| ID-012 | Association East admin attempts private Rangers team request | DENY |
| ID-013 | Association East admin attempts private Stars team edit based only on association affiliation | DENY |
| ID-014 | Signed-in account changes browser persona to platform owner and calls protected API | DENY |
| ID-015 | J guesses a valid Person ID belonging to B's club | DENY |
| ID-016 | B searches private members of another club by email/name/phone | DENY |
| ID-017 | Public club directory query searches user membership, junior profiles or guardian private data | DENY |
| ID-018 | B attempts bulk export containing Comets team contact data | DENY, no partial forbidden data |
| ID-019 | Partial export includes only explicitly authorised team fields | ALLOW-LIMITED |
| ID-020 | B fetches injury/safeguarding data relying only on Coach role | DENY |
| ID-021 | Platform owner A fetches child health data without separate purpose-bound access | DENY |
| ID-022 | F performs specifically granted RSVP for verified child J1 | ALLOW-LIMITED |
| ID-023 | F attempts RSVP for unrelated child J2 using same surname | DENY |
| ID-024 | F attempts any child record after guardian link revoked | DENY |
| ID-025 | F tries updating J1's registration evidence or club-granted role | DENY |
| ID-026 | G uses proposed but not active role to edit team | DENY |
| ID-027 | H replays API call after own grant revoked | DENY |
| ID-028 | I replays expired grant using old but cryptographically valid session token | DENY |
| ID-029 | K approves own pending Coach grant as Club Admin | DENY and audit |
| ID-030 | Rangers Admin approves a Coach grant targeting Comets | DENY and audit |
| ID-031 | Eligible delegated admin approves exact Rangers team role, with verified candidate | REVIEW then active only on server-controlled acceptance |
| ID-032 | Applicant edits approval state or approver ID in request body | DENY |
| ID-033 | Revoked admin attempts to revoke someone else's grant | DENY |
| ID-034 | Duplicate approval request races with revocation | One valid atomic transition, no double grant |
| ID-035 | Expired invite token is redeemed | DENY |
| ID-036 | Single-use invite is redeemed twice or from different account | First valid redemption only; subsequent DENY |
| ID-037 | Invite link targets different account/role/group than approved | DENY |
| ID-038 | New account takes over old account's role via same email after recovery | DENY unless verified server linking and policy checks |
| ID-039 | Team Manager proposes Trainer assignment and asserts qualification through client field | REVIEW, never certified eligible |
| ID-040 | Required Trainer is proposed as Acting Coach without replacement where NSWRL policy applies | DENY proposed staffing approval |
| ID-041 | Acting Coach proposal attempts to create permanent Team Coach app grant | DENY |
| ID-042 | Touch/Oztag fixture request uses Rugby League 2026 rule profile | DENY/review as unknown, no inferred compliance |
| ID-043 | Team A player image key is guessed by unaffiliated Account J | DENY |
| ID-044 | Foreign club file is downloaded with altered signed URL/group metadata | DENY |
| ID-045 | Background import / admin batch job omits tenant scope | DENY |
| ID-046 | Websocket subscription continues to emit team private updates after role revocation | DENY/detach promptly per approved revocation SLO |
| ID-047 | Offline queued roster edit replays after team role revocation | DENY, no overwrite |
| ID-048 | User attempts foreign-club access via direct URL/resource ID or manipulated API query parameter | DENY |
| ID-049 | API paginated list returns unauthorized person's count or presence | DENY/no existence leak |
| ID-050 | Disable Account B, then call cached team API from another browser | DENY |
| ID-051 | Re-login/recovery restores previously revoked role | DENY |
| ID-052 | Non-admin frontend submits privileged service role/API key value | DENY; no privileged key accepted from client |
| ID-053 | Authenticated user accesses audit logs or private exports of unrelated club | DENY |
| ID-054 | Developer mistakes production QA sample profile for a real verified Account | DENY, QA data excluded from trusted auth store |
| ID-055 | User requests own allowed personal profile fields | ALLOW-LIMITED without unrelated clubs' records |
| ID-056 | One Person exists in two clubs; one club edits its own data | ALLOW-LIMITED, no automatic cross-club mutation |
| ID-057 | Club A public directory listing used to infer private member relationships | DENY |
| ID-058 | API operation omits group, lacks policy version or uses unexpected resource type | DENY |
| ID-059 | Guardian verification pending but applicant has link URL | DENY |
| ID-060 | Access request relies on data from old publicly hosted encrypted GitHub blob | Cannot enforce retrospective revocation; separate history/key risk and migration acceptance |

## 5. Positive acceptance and quality measurements

Positive tests must prove ordinary Coach/Manager, Player, Helper, Guardian and Club Admin journeys work for their **specifically approved** group and field permissions; negative-only tests are not sufficient. At minimum:

- All twenty synthetic P12 roles/scenarios translate into named *server-enforced* roles and explicit capabilities, with unsupported overlaps denied by default.
- Verify switching among 3 clubs/18 teams without leakage or stale data. Cross-role views update only after an actual server check.
- Denied read returns no private field through response body, headers, server logs, screenshots, exports, previews or object metadata.
- Record actual 95th-percentile policy/query latency under representative synthetic load; set and approve a threshold **before** evaluation, not invent a pass target.
- For revocation, choose explicit maximum stale-access and cache invalidation times. Do not call it instantaneous unless tested.
- Restore encrypted synthetic backups and confirm exact role/guardian/audit links and data counts after recovery.
- Assess invite/link brute-force resistance, rate limits, mail deliverability and lost-device recovery; require independent test evidence.
- Confirm Australian data-processing and backup location constraints with provider documentation and contract before approving a production region.
- Verify support operator impersonation/break-glass and log access with security reviewer sign-off.
- Include physical iPhone/macOS Safari and VoiceOver for production role-switch and consent flows. Chromium CI alone is insufficient.
- Keep separate a privacy/legal acceptance, provider quote, subscription approval, implementation acceptance and final production cutover approval.

## 6. Evidence and reviewer requirements

For every test record: immutable test ID, exact source commit/policy revision, provider/project type/region, synthetic actor+target IDs, operation, expected vs actual decision, timestamp, non-sensitive request/response metadata, screenshots only if privacy-safe, automation run link, code reviewer, and fix/retest reference. Store no raw invitation tokens, passwords, child details, medical data or secret keys in logs or GitHub issues.

Record a high-level **threat-to-test mapping** and a deny/allow coverage matrix by account, role, resource, data classification and operation. Require an independent reviewer to inspect policy recursion, service-role bypass, cross-club joins, signed media and revocation/time-of-check-time-of-use defects.

## 7. Definition of ready for a *future*, separately approved provider-specific implementation

- [ ] D1–D7 decisions in PR133 evaluated and explicitly approved in #55 (provider, residency, privacy, operations, migration and account recovery).
- [ ] Production permission and sensitive-field matrix approved for Owner / Association Admin / Club Admin / Coach / Manager / Player / Helper / Trainer / Guardian.
- [ ] Person↔Account and Guardian↔Child verification policy, dispute handling and no global directory agreed.
- [ ] Transactional approval/revoke/invite contract and audit retention/actor separation agreed.
- [ ] Real API and DB/storage security tests for ID-001..ID-060 specified for chosen provider, with expected denial and field projection.
- [ ] Backups, restore, RPO/RTO, logs, monitoring, cost alerts and incident response selected.
- [ ] A local or isolated non-production synthetic server security implementation is **separately** authorised; no real records or production deployment.
- [ ] Production migration plans separately approved, after synthetic tests, rollback drill, privacy and physical Safari acceptance.

**Current programme status:** This document itself changes no application, no provider, no account or data. P13 production implementation remains **0/6 authorised**. Merging a design document does **not** grant permission to start real backend work.
