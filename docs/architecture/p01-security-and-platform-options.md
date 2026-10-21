# P01 — Security, data governance and backend decision record (proposal)

**Status:** Architecture option analysis for [Issue #43](https://github.com/pdomoney/team-manager/issues/43). Not a vendor purchase, authentication deployment, legal/privacy certification or pricing quote. **No production service connected.**

## 1. Threat model and trusted boundaries

| Threat / unsafe default | Assets at risk | Required mitigation and future proof |
| --- | --- | --- |
| Shared coach password / broad coach workspace used as club-admin permission | Club and youth personal records across sports/clubs | Individual authentication, data-space tenant boundary, server-enforced default-deny policy; P02 |
| Licence purchased by league mistaken for unlimited private club access | Guardian details, contacts, health data, staff history | Separate SubscriptionEntitlement, organisation affiliation and role grant; association aggregate by default; P02/P03 |
| Volunteer/manually entered records misidentified across clubs | Identity, qualifications, account impersonation, unintended disclosure | No global user lookup, verified claims, scoped IDs and explicit authorised confirmation; P02/P04 |
| Guardian-helper confusion | Minors' confidential data and changes on their behalf | Child-specific verified GuardianRelation, explicit authority/actions, expiration/revocation and safeguarding workflow; P04 |
| Coach also a volunteer or official | Role escalation to club admin or false first-response eligibility | Sporting Appointment, professional Qualification and RoleGrant are unrelated types; sport/season checks; P02/P06 |
| Invalid/stale association affiliation | Former officials accessing a club after revocation | Mutual approval, active date checks, short-lived sessions, server-side revocation and audit; P03 |
| User guesses cross-club team/player IDs, changes URL or bypasses UI | All tenant records | Server-side RLS/API filtering and negative tests, no unauthorised export/search; P02/P10 |
| Unsafe sharing of plays, lineup and teaching materials | Private coaching IP and nonpublic tactics | Explicit owner data space, ShareGrant, revocable distribution or copied revision, permission checks; P08 |
| Research directory data treated as verified club/registration rights | False official association or brand authority | Source URL/review date, unverified status, manual link confirmation, no automatic official/ownership grant; P03 |
| Contact/medical/certification data leaks into player projection | Child/staff privacy | Field-level resource classification, minimum necessary access, reviewed export allowlists and tests; P02/P04/P10 |
| Migration crashes after partial write or reruns | Duplicate people/teams, broken jersey/season history, lost data | Transaction boundaries, stable LegacyReference unique keys, checkpoint/retry, dry run, encrypted backup and rollback verification; P01/P10 |
| Insufficient audit transparency | Grant disputes, guardian consent or cross-club transfers | Append-only secure audit with actor, scope, purpose, decision and redaction; P02/P10 |

Australian operating context requires a dedicated assessment of the Privacy Act/APP applicability, child safeguarding, record retention, breach procedures, contracts and international transfer/data residency before production. Do not assert compliance merely because hosting is located in Australia. Do not store WWCC card numbers, identity scans or medical records by default; status/expiry checks may also be sensitive and must be access controlled.

## 2. Backend and persistence evaluation

| Option | Benefits | Limitations and costs to validate | Fit |
| --- | --- | --- | --- |
| **A. Continue GitHub Pages + encrypted data branch only** | Cheapest transition, offline-friendly, accepted rollback, simple static site | Shared coach password/whole-workspace access, no secure row-level organisation grants, conflict burden, unsuitable for independent club privacy | **Retain as legacy during transition, not target multi-tenant backend** |
| **B. GitHub Pages frontend + Supabase managed Postgres/Auth/Storage** | Familiar static frontend; managed relational integrity, Auth, Postgres Row-Level Security, storage and migration tooling; matches earlier design direction | RLS is powerful but must be independently tested; hosted plan usage, egress, auth email, storage, regional options, backup/point-in-time restore, provider outages and subscriptions must be assessed | **Preferred design candidate, not approved** |
| **C. Static frontend + custom API + managed Postgres/identity provider** | Full control over authorisation and data boundary, flexible hosting/region choices | Higher development and operations burden for identity, service API, monitoring, backups, migration, incident response and upgrades | Alternative if provider limits/security or commercial needs require custom policies |
| **D. Enterprise identity/managed backend bundle** | May support federated organisation sign-in and contractual controls | Higher recurring/licensing complexity, potentially unnecessary at initial club scale; governance/workload remains | Revisit after product and club uptake |

Do not quote current plan limits or prices from old documentation. Before selecting B or C, produce a **current-date provider cost/region matrix** for a realistic: solo coach (2 clubs), 1 club (20 teams), 1 league (30 clubs), and multi-league deployment. Include users, peak concurrent users, records/media, photo storage, backups, bandwidth, transaction volume, email invitations, audit retention, development/staging environments, monitoring and recovery objectives.

### Preferred conditional approach

Choose **B only if** it supports acceptable Australian data hosting, audited RLS, reliable automated backups and restoration, clear pricing for large association rollouts, practical role management and appropriate contractual/privacy terms. Otherwise evaluate C. Keep GitHub Pages for frontend only if it can provide secure API-origin deployment, CSP and versioned assets. No secrets/service role keys may be bundled into static client code. Subscription permissions cannot rely on client UI toggles.

## 3. Privacy by design

- Assign explicit **sensitivity categories**: directory/public, club-operational, private contact, junior-sensitive, injury/medical-related, safeguarding, accreditation, account/security, commercial/billing.
- Separate person identity and tenant-scoped confidential fields. An associated club must only receive permitted data; no global search or unauthorised linking.
- Link guardian to child only after documented verification, consent/authority and review; guardian may participate as helper, but this does not expand their access.
- Document collection purpose, lawful basis, field owner, retention, consent changes, account termination, contact updates and reassignment when a person moves clubs.
- Source evidence for qualifications can record independent-verification flag, verified_by, verified_on, provider, season and expiry but must not claim a governing-body API result where none exists.
- Keep audited opt-in visibility for injured/availability statuses. Never allow club-wide analytics to expose small-cell child/medical information by default.
- Data exports and backups are permissions-controlled and encrypted; no public URLs for private photos/documents.

## 4. Permission test plan

Run tests against **real backend policy** during P02, not mocks alone:

1. Association licence holder reads approved club directory, but cannot read club B's private junior contacts.
2. Club A admin can manage club A teams and memberships, but direct API calls to club B are denied even with valid identifiers.
3. Coach C has two team grants in two clubs; both are accessible, but club-admin capabilities are denied.
4. Revocation of club A grant ends access to A without changing club B or personal play library.
5. Club B match trainer with valid accreditation cannot update club B finances, roles or other children's profiles.
6. Parent of junior player X can act only on X under confirmed guardian permission; no access to unrelated junior Y.
7. Helper with a linked player/child name but no verified guardian relation cannot act for the minor.
8. Anonymous/public projection exposes club directory and deliberately published team data only; protected member contact and accreditation excluded.
9. Subscription expiry blocks entitled features appropriately, but does not delete records or revoke otherwise lawful data-export rights without approved offboarding policy.
10. Invite not accepted, expired, revoked and forged role assignment paths are denied and audited.
11. Direct export/search, GraphQL/REST bulk filters and guessed IDs enforce the same rules as individual reads.
12. Tenant-aware resource creation, update and deletion check both target and source ownership; no cross-tenant ID association.

## 5. Recovery and service-level design questions

Propose RPO/RTO **only after** owner review. Validate encrypted snapshots, PITR support if applicable, full-file and per-tenant restore, retention, key rotation, concurrent updates and schema rollback, and independent recovery exercises. No production release before these gates. The accepted GitHub backup and test-mode fixture route remains a fallback throughout transition, never silently overwritten by new backend writes.

## 6. Explicit architecture decision to request

**Proposed:** canonical multi-tenant relationship model, single verified Account→Person claim with scoped PersonContext, dedicated club data spaces, separate association entitlement and delegation, Supabase-based proof-of-concept candidate only, not provider lock-in. 

**Pending acceptance:** data ownership model, association aggregate defaults, identity-linking method, hosting/provider, acceptable privacy/retention criteria, entitlement model and staged cutover. Approval of this document authorises subsequent **P02 design/implementation only when P01 gates close**, not production data movement.
