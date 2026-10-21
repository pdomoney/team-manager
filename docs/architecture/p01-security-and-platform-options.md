# P01 — Security, data governance and backend decision record (proposal)

**Status:** Architecture option analysis for [Issue #43](https://github.com/pdomoney/team-manager/issues/43). Not a vendor purchase, authentication deployment, legal/privacy certification or pricing quote. **No production service connected.**

> **Owner sequencing requirement:** Finish the existing-app improvement and acceptance programme through **at least P10 before considering backend migration**. No Supabase provisioning, contracts, individual login deployment, server permission enforcement or production data migration is required or authorised by PR #54 or by P01–P10. All backend-specific implementation and tests are deferred to [post-P10 Issue #55](https://github.com/pdomoney/team-manager/issues/55) and will require separate approval. This deferral is **not** a waiver of production privacy, identity or tenancy controls.

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
| **A. Continue GitHub Pages + encrypted data branch only** | Cheapest transition, offline-friendly, accepted rollback, simple static site | Shared coach password/whole-workspace access, no secure row-level organisation grants, conflict burden, unsuitable for independent club privacy | **Required runtime throughout P01–P10; not production multi-tenant auth** |
| **B. GitHub Pages frontend + Supabase managed Postgres/Auth/Storage** | Familiar static frontend; managed relational integrity, Auth, Postgres Row-Level Security, storage and migration tooling; matches earlier design direction | RLS is powerful but must be independently tested; hosted plan usage, egress, auth email, storage, regional options, backup/point-in-time restore, provider outages and subscriptions must be assessed | **Preferred design candidate, not approved** |
| **C. Static frontend + custom API + managed Postgres/identity provider** | Full control over authorisation and data boundary, flexible hosting/region choices | Higher development and operations burden for identity, service API, monitoring, backups, migration, incident response and upgrades | Alternative if provider limits/security or commercial needs require custom policies |
| **D. Enterprise identity/managed backend bundle** | May support federated organisation sign-in and contractual controls | Higher recurring/licensing complexity, potentially unnecessary at initial club scale; governance/workload remains | Revisit after product and club uptake |

Do not quote current plan limits or prices from old documentation. Before selecting B or C, produce a **current-date provider cost/region matrix** for a realistic: solo coach (2 clubs), 1 club (20 teams), 1 league (30 clubs), and multi-league deployment. Include users, peak concurrent users, records/media, photo storage, backups, bandwidth, transaction volume, email invitations, audit retention, development/staging environments, monitoring and recovery objectives.

### Preferred conditional approach

Choose **B only if** it supports acceptable Australian data hosting, audited RLS, reliable automated backups and restoration, clear pricing for large association rollouts, practical role management and appropriate contractual/privacy terms. Otherwise evaluate C. Keep GitHub Pages for frontend only if it can provide secure API-origin deployment, CSP and versioned assets. No secrets/service role keys may be bundled into static client code. Subscription permissions cannot rely on client UI toggles.

## 2A. Verified supplier facts and indicative entry costs (checked 21 October 2026)

This is an **official supplier-information snapshot**, not negotiated pricing, a complete TCO, or confirmation of contractual Australian-only processing:

- **Region:** Supabase lists the specific **Oceania (Sydney), `ap-southeast-2`** project region. A broad 'APAC' grouping may place data in Singapore, so choose the **specific Sydney region** if Australian primary data location is required. Selection of a primary region alone is not a guarantee that *all* backup, authentication, email, logging, CDN or support processing remains in Australia. Source: https://supabase.com/docs/guides/platform/regions.
- **Starter Pro price:** supplier lists **from USD $25/month** for Pro including one project and monthly compute credits, with quotas and overages. This is an indicative **platform starting price, not a price per club licence**. Costs can increase with compute, storage, egress, active users, extra projects and service add-ons. Source: https://supabase.com/pricing.
- **Paid-backup terms:** supplier lists daily backups **7 days on Pro** and **14 days on Team**. Additional point-in-time recovery is separately charged, shown at approximately **USD $100/month for seven-day PITR** at the time of checking. These controls require documented recovery tests. Sources: https://supabase.com/docs/guides/platform/backups and https://supabase.com/pricing.
- **Security caveat:** Supabase recommends RLS on every table in exposed schemas, removal of unnecessary `anon`/`authenticated` grants and special care with views which can bypass RLS unless explicitly secured. A `service_role` bypasses RLS and must remain server-side. Source: https://supabase.com/docs/guides/database/postgres/row-level-security.
- **Changing region:** the vendor describes creating a new project and migrating data to change a region; it is not simply a live setting toggle. Source: https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z.

### Cost model to approve before implementation

Use a **single carefully partitioned multi-tenant project** as the initial *cost-model candidate*, not one paid Supabase project per club by default. Dedicated project-per-organisation may offer stronger physical isolation but changes per-project cost, operations, migrations and backups; evaluate as a separate priced option.

| Product shape | Required estimate inputs (do not substitute fake numbers) | To be verified |
| --- | --- | --- |
| Individual coach | 1–5 teams, people, photos, content library, MAU, local/remote access | Compute/base plan, storage, traffic, recovery |
| Club | Number of teams, players, volunteers, guardians, invitations, media and peak concurrent usage | Row policy performance, cost per active user and data volume |
| Association | Clubs × teams × members, fixture results, staff compliance evidence, association dashboards | Aggregate-query scale, operational support, backup/recovery |
| Multiple associations | Concurrent league tenants, administrator activity, tenant count, audit retention, recovery windows | Cost/load isolation, database scale, storage and egress |

Pricing is in **USD** unless supplier explicitly says otherwise. Allow for AUD FX, GST/taxes, support, security monitoring, email/notification delivery, domain, backup export, CI/staging and commercial support. **No purchase or vendor architecture is approved by this snapshot.**

## 3. Privacy by design

- Assign explicit **sensitivity categories**: directory/public, club-operational, private contact, junior-sensitive, injury/medical-related, safeguarding, accreditation, account/security, commercial/billing.
- Separate person identity and tenant-scoped confidential fields. An associated club must only receive permitted data; no global search or unauthorised linking.
- Link guardian to child only after documented verification, consent/authority and review; guardian may participate as helper, but this does not expand their access.
- Document collection purpose, lawful basis, field owner, retention, consent changes, account termination, contact updates and reassignment when a person moves clubs.
- Source evidence for qualifications can record independent-verification flag, verified_by, verified_on, provider, season and expiry but must not claim a governing-body API result where none exists.
- Keep audited opt-in visibility for injured/availability statuses. Never allow club-wide analytics to expose small-cell child/medical information by default.
- Data exports and backups are permissions-controlled and encrypted; no public URLs for private photos/documents.

## 4. Permission test plan

Run tests against **real backend policy** during **post-P10 Issue #55**, not during P02–P10. Before then, run only in-memory/fixture modelling and existing encrypted-projection privacy tests, clearly labelled as simulation:

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

**Proposed:** canonical multi-tenant relationship model, future verified Account→Person claim with scoped PersonContext, dedicated club data spaces, separate association entitlement and delegation. **Retain current GitHub Pages and encrypted workspace through P10.** Supabase remains an optional, unselected post-P10 candidate, not provider lock-in. 

**Pending for current programme:** privacy-preserving identity model, association aggregate defaults, identity-linking behaviour, entitlement representation and safe local-workspace compatibility. **Explicitly deferred:** provider/hosting selection, production login, live tenancy, backend cost commitment and staged production cutover, under post-P10 #55. Acceptance of P01 authorises only existing-app-safe P02 work, not Supabase or production cross-club use.
