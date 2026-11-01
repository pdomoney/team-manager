# ADR-P13-001 — Production identity, scoped permissions and secure data architecture

**Status: PROPOSED FOR OWNER REVIEW, NOT AUTHORISED FOR IMPLEMENTATION**

Prepared: 1 November 2026. Based on exact accepted `main` `98f66f140adfc6cd815583e9f16d841b5af8f3ee` (PR130 merged; post-merge Tests/Publish PASS).

Related decisions: [#55 backend/security approval gate](https://github.com/pdomoney/team-manager/issues/55), [#35 scoped club and volunteer access](https://github.com/pdomoney/team-manager/issues/35), [#124 completed synthetic P12](https://github.com/pdomoney/team-manager/issues/124), [#131 physical Safari/VoiceOver follow-up](https://github.com/pdomoney/team-manager/issues/131).

For the 1 November 2026 provider comparison, current published cost and region sources, explicit decision register, and full-risk checks, see the [P13A backend provider security scorecard](p13a-backend-provider-security-scorecard-20261101.md). **This scorecard is evaluation material only, not provider selection or purchasing authority.**

## Decision requested

Choose **one architecture and provider** for implementing **real**, individually authenticated, server-enforced, organisation-scoped identities and private sporting data, in a later separately authorised implementation programme. This ADR is a product/security design proposal, **not approval to purchase a service, provision infrastructure, deploy authentication, send invitations, or migrate data**.

**Working recommendation, subject to approval:** retain GitHub Pages as a static UI deployment; put individual identity, private records, scoping, invitations, approvals and audit in a separately hosted service with authoritative server-side enforcement. **Supabase/PostgreSQL in a specific Australian region is the first candidate to evaluate, not an approved or required backend.** Firestore/Firebase and a hosted PostgreSQL + custom auth/API should be assessed against the same criteria, including operating cost.

### Important precedence over older documents

`docs/roles-and-login.md` dated 15 October 2026 described Supabase and WhatsApp invitation links as an early plan. **Issue #55, created 21 October 2026, explicitly deferred backend selection and migration**. P12 subsequently approved **synthetic** roles only. Therefore neither the historic document nor the P12 simulator is authority to start a Supabase project or migrate a squad. The decisions in this ADR remain **open**.

## Current verified system and limitations

- UI is a static GitHub Pages app (`site/app.js`, `src/build.js`), with local encrypted workspace and GitHub-based publication.
- `site/vault.js` creates two AES-256-GCM/PBKDF2-SHA256 encrypted public-delivery projections: a private Coach file and team/player file(s) under shared passwords. Protected plaintext is not intended to appear in the public build. Encrypted historical blobs remain obtainable from GitHub history, even after password change.
- `site/github.js` commits encrypted artifacts to the data branch using a browser-side GitHub publishing token. These credentials are **not** individual user sessions or production tenant authorization.
- The current shared coach/team password and single-browser user mode do not establish individually attributable approvals or revocations.
- `site/p12-role-groups.js`, `site/p12-qa-profiles.js`, `site/p12-qa-governance.js`, `site/p12-fixture-role-review.js` are clearly labelled fictional/synthetic and must **never** become client-side production permission gates.
- The P12 QA sample is three **fictional** clubs and 18 fictional teams; earlier test-library data includes *public real club names* and fictional people. They are not production tenant registrations or proof of club ownership.
- No real login, server-side tenant enforcement, API authorization, guardian verified links, or authoritative sporting accreditation service has been approved.

## Target trust boundary

```text
                   STATIC PUBLIC DELIVERY
          GitHub Pages (HTML, JS, icons, public catalogue)
                            |
                  Sign-in (chosen provider)
                            |
                     verified session
                            v
             IDENTITY + AUTHZ ENFORCEMENT BOUNDARY
        API/DB policy verifies actor + exact resource + action
              /                     |                \
     membership/role grants   purpose-bound data   append-only audit
              \                     |                /
                    private datastore
          backups, retention, monitoring, recovery
```

**Deny by default.** The backend, not a web dropdown or a JWT role string supplied by a caller, determines the active account, approved person link, tenant, exact scoped role, expiry, relationship and purpose before SELECT/INSERT/UPDATE/DELETE, exports, documents, file downloads or invitations. Publicly accessible UI must not contain service/secret keys, master encryption keys, GitHub personal tokens or database passwords. Client-readable/publishable keys are **not** authorisation grants. Administrative bypass credentials stay server-only.

### Proposed core domain records

See the companion [data-contract proposal](production-role-data-contract-20261101.md).

- **Account**: verified authentication principal with independent account ID, authentication status and recovery lifecycle. Not the same thing as a Player or staff Person record.
- **Person**: sporting identity, including minors without an Account; one person may have multiple group relationships. No automatic global discovery of the Person record across clubs.
- **AccountPersonLink**: identity-verified link between a signed-in Account and its own Person; duplicate-link review, consent, provenance and unlink/revoke.
- **Organisation / Group**: sports association, club, team and fixture as separately identified scoped resources; season/competition qualifying context and explicit relationship edges. Association affiliation and club/team hierarchy are metadata, **not implicit authorisation**.
- **Membership / Registration**: person belongs to a club/team/sport/season as participant, staff, helper or guardian. Registration, accreditation and duty are not a permission grant.
- **Scoped Role Assignment**: exact Account, role and group scope; proposed/approved/active/suspended/revoked/expired; required approver, reason, validity interval, creator and tamper-evident audit reference. An Account can have different roles in 2+ unrelated clubs.
- **Sporting Appointment**: actual coach, manager, trainer, match volunteer, official or player role, independent of app access. Fixture replacement is time-bounded, with previous duty and coverage checks. P12F checks are review aids, not certified eligibility.
- **Guardian Relationship**: independent relationship between adult Person and minor Person, with required verification, authority limitations, effective dates, review/withdrawal and privacy preferences. It never creates all-record access merely by using a surname or contact number.
- **Private information classes**: contact, availability, attendance, injuries/medical, safeguarding and eligibility evidence segmented by need-to-know; collecting a WWCC identifier or image is not a default requirement.

### Scope and authorisation rules

1. Assign roles **to exact scopes** only; no implicit association→club, club→team, registered player→private roster or guardian→all-child-access inference.
2. Delegated administration is a **separate capability** from content access. A club admin may approve an explicit Team Coach grant for a team owned by that club only if the server policy allows; that *approval authority* does not itself grant visibility of all children's medical/contact records.
3. A Coach may operate within explicitly assigned teams; a Manager in their own; a Player/Helper sees their own permitted data and tasks. Cross-club affiliation adds another scope, not cross-club access.
4. Shared global club directory contains only independently approved *public* information, not users' private club membership lists.
5. All API writes, background processes, exports, signed file URLs and searches must enforce the same server policy. Filtered UI lists are for usability only.
6. Elevated platform owner operations require strong authentication, explicit privilege activation, audit, small operator list and break-glass procedure; platform ownership is not routine, unlimited medical or safeguarding access.
7. Revoke or expire grants server-side, reject cached/offline mutations once revoked, and prevent session refresh from restoring expired rights. Account recovery does **not** recreate permission assignments.
8. Fixture Acting Coach/Trainer appointments never create permanent team/admin grants. Verify governing rule profile, official registration and qualification independently before any actual eligibility decision.

## Proposed account, invitation and identity flow

1. Club's verified authorised administrator proposes membership/role for an existing or new Person **in an exact club/team**; the candidate is not exposed to a global search.
2. Server stores a pending, **single-use, short-lived** invite with purpose, target scope, inviting actor, expiry, resend/revocation state and rate limits. **Never embed team master passwords, API tokens or durable credentials in WhatsApp links**.
3. Invite is delivered using an approved transactional/email provider; WhatsApp may be used as a user-operated delivery channel for a benign link, but link possession alone never proves a sensitive club/admin/guardian entitlement.
4. Candidate proves control of their own Account with approved authentication (passkey or reliable email flow as options). Admin/guardian roles require stronger re-authentication and out-of-band verification where appropriate.
5. Candidate accepts the specific role and organisation; the server verifies invite validity, independent admin approval, person linking, guardian authority where relevant and anti-self-approval rules before activating the grant.
6. Role switching in UI shows **only** active server-authorised exact group/role contexts. Switching does not create rights; personal account stays signed in.
7. Lost device, password change, admin removal, transfer and expiry revoke/rotate sessions and capabilities as designed. Audit records all sensitive actions, including failed privilege escalation, without logging contact/medical content.
8. Minor Players need not have independent logins; a verified guardian may make a narrowly permitted RSVP on their behalf without impersonating the child. Direct junior accounts, if introduced, require a separate safeguarding/age/consent decision.

## Australian privacy, minors and sensitive data

Use data minimisation and purpose separation from the outset. Assess actual applicability of the Privacy Act and APPs, contractual association/club obligations, children's requirements, and any state sporting safeguarding rules with legal/privacy review. In particular evaluate APP 3/5/6 (collection, notice, use), APP 8 (overseas disclosures), APP 11 (security), APP 12/13 (access/correction) and the treatment of medical records as sensitive information where relevant.

A Sydney **primary database region is not proof that auth, support, logs, transactional email, backups, analytics and third-party processors stay in Australia**. Record all subprocessor locations, transfer and deletion terms; decide whether Australian primary storage or stricter all-data residency is a hard requirement. Require explicit retention and lawful deletion policies, incident response, subject access, breach notification assessment, access audit and recovery testing.

Useful primary references:
- OAIC APP guidance (updated 13 May 2026): <https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines>
- OAIC APP 8 cross-border: <https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information>

## Provider options, **not yet chosen**

| Candidate | Fit and benefits | Outstanding review |
| --- | --- | --- |
| **A. Supabase Auth + PostgreSQL/RLS** | Relational model fits exact groups, grants, relationships and transactional audit. Published specific Oceania/Sydney `ap-southeast-2` project region. Retains GitHub Pages frontend. | Cost, usage tiers, Auth/OTP and email deliverability, backup/PITR and restore, RLS performance/recursion, access policy security review, support/log/storage geography, vendor exit plan |
| **B. Firebase Auth + Cloud Firestore rules** | Mature managed auth and mobile/web integrations; Firestore lists Sydney `australia-southeast1` and Melbourne `australia-southeast2` regions. Retains GitHub Pages frontend. | Highly relational club/team/person grants require denormalisation or server code; security-rules query constraints and least privilege, audit and transactional operations, cost/backup, subprocessor location |
| **C. Hosted Australian PostgreSQL + owned API/Auth** | Maximum control over custom authorisation and contract, independent web frontend; opportunity to keep a single source of policy decisions and relational model. | Greater cost/security/ops, patching, authentication recovery, monitoring, backups/restore, incident response, rate limits, service-level ownership |
| **D. Continue local encrypted storage without backend** | Lowest immediate cost and no new hosted identity service. | **Does not meet** individually authenticated cross-club server-enforced access or revocable private-data permission requirements. Not suitable for production multi-tenant rollout. |

Provider sources checked 1 November 2026:
- Supabase specific regions <https://supabase.com/docs/guides/platform/regions>
- Supabase RLS and elevated key warning <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase API key distinctions <https://supabase.com/docs/guides/getting-started/api-keys>
- Firebase Firestore locations <https://firebase.google.com/docs/firestore/locations>

**Provisional ordering for evaluation: A, C, B**, because Team Manager has many-to-many relationships and exact scoped grants, **not because any provider has been approved**. Financial quotes, free-plan behaviour, paid add-ons and Australian subprocessor contracts must be checked at actual procurement.

## Recommended delivery programme, only after explicit architecture approval

| Gate | Proposal | Required acceptance |
| --- | --- | --- |
| **P13A** | Security decisions: provider, hosting jurisdiction, privacy classification, roles and access owner, risk budget, operating costs and disaster recovery target | Written owner decision. No infrastructure until this gate. |
| **P13B** | Isolated synthetic server-side security spike with sample clubs and no real data | Deny-by-default endpoint and DB tests (no club/tenant leakage, self-approval, direct URL, export, revoked grants, foreign scopes); no production keys |
| **P13C** | Account lifecycle and person linking, invites, verified guardian relationships and admin approvals | Abuse/expiry/replay tests, separate approvers, recovery, audit, device security and email provider approval |
| **P13D** | Purpose-specific private data APIs and fine-grained roles; UI server-context switching, with testing profiles excluded from production build | Cross-account/club/child/guardian negative API tests, no client-side authority bypass, usability and physical Safari |
| **P13E** | Controlled, reversible migration from encrypted GitHub data into new private store | Inventory, clean mapping, non-production rehearsal, backups, reconciliation, rollback/cutover, no dual source of truth |
| **P13F** | Production readiness, restore drills, monitoring, audit/incident and external security assessment | Explicit release decision after security, privacy, cost and multi-device checks |

## Decision points requiring explicit product-owner approval

- **D1** Provider and service model (Supabase, Firebase, hosted API or another supported option), paid tier/cost ceiling and lifecycle owner.
- **D2** Australian residency requirement for primary data **and** auth/backup/logs/support/processors; privacy risk acceptance.
- **D3** Account authentication type, invitation delivery, strong admin recovery/MFA and minor/guardian model.
- **D4** Tenant hierarchy and actual club/association administrator delegated approval rules, including access to juniors, medical and emergency contacts.
- **D5** Legacy encrypted-data migration, retention of historical GitHub blobs, recovery requirements and termination of shared passwords. Public GitHub history cannot simply be made private by changing the new app.
- **D6** Monitoring/incident response, tamper-resistant audit, outsourced support and pen-testing/release criteria.

**Until approved:** preserve the current working GitHub Pages build and encryption; no sign-ups, hosted database, secrets, auth redirects, migration, real person invitations, WhatsApp token invitations, prod policy gates or production-mode profile changes in this PR. Completing/merging this ADR records a review document **only**; it does not itself authorise P13B–F.
