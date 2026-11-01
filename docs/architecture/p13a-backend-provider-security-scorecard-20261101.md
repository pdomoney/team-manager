# P13A — Backend, identity and Australian privacy evaluation scorecard

**Status: EVALUATION DRAFT ONLY. NO PROVIDER OR IMPLEMENTATION APPROVAL.** Prepared 1 November 2026.

Source of architecture contract: [ADR-P13-001](production-identity-architecture-proposal-20261101.md) and [candidate data/role contract](production-role-data-contract-20261101.md). Parent approval gate [#55](https://github.com/pdomoney/team-manager/issues/55). The reference P12 implementation [#124](https://github.com/pdomoney/team-manager/issues/124) is fictional and non-authorising.

## Outcome sought

Select an affordable backend and identity architecture for real Team Manager user accounts, verified Person linking, group-scoped grants, minors/guardians, fixture duties, private team records and secure authorisation while retaining the GitHub Pages static frontend.

**Not part of this review:** provisioning a vendor, purchasing a plan, importing real club/player data, sending invitations, merging synthetic profiles into production, disabling shared coach passwords, or creating live RLS/Firestore rules. The owner must issue a separate affirmative decision on each major gate.

## Confirmed public product facts, as checked 1 November 2026

| Candidate | Publicly documented facts | Material uncertainties / evaluation focus |
| --- | --- | --- |
| **A. Supabase (Postgres, Auth, RLS)** | Project can be placed in *specific* Sydney AWS `ap-southeast-2`. Free plan `US$0` (500MB database, 2 active projects, inactivity pause after ~7 days); Pro **from US$25/month**, includes one Micro project via included compute credit, daily backups with 7-day retention, and 8GB database disk. RLS supports per-operation table policies, but elevated secret/service-role credentials bypass RLS. Supabase built-in Auth SMTP is test-only (two emails/hour and authorised team addresses); production invitation/OTP email requires custom SMTP or hook. | Confirm auth/session/log/support, backups, email delivery and all subprocessor locations; exact monthly usage/compute/egress/add-ons, regional availability, backup/restore targets, compliance contract, role and RLS architecture, secret-key separation, egress on export. |
| **B. Firebase (Authentication + Firestore)** | Cloud Firestore offers **Sydney `australia-southeast1`** and **Melbourne `australia-southeast2`** regional data locations. Firebase Spark is usage-limited without cost; Blaze is pay-as-you-go. Firestore rules are **not** result filters: every allowed query must satisfy rule constraints. Server SDK accesses use IAM rather than Firestore client security rules. | Confirm Firebase Auth location and support/log locations, production auth fees and SMS/provider fees, Firestore read/write/index/storage and egress at projected load, role-centric many-to-many relational modelling, rules query complexity, migration/exit and audit. |
| **C. Australian-hosted PostgreSQL + owned API/identity** | Can potentially keep primary database under selected Australian hosting and build exact-scoped authorisation using ordinary relational transactions and an API. Retain GitHub Pages frontend. **No vendor, availability, SLA, price or Australian processing guarantee is verified yet.** | Quote at least two actual providers and cost the complete operational responsibility: IdP, secure API, patching, backups, restore, DDoS/abuse protections, logging, mail, region, incident response, support and maintenance. |
| **D. Current encrypted GitHub files only** | No new recurring backend charge; client-side encrypted data plus shared Coach/team passwords is already operational. | **Cannot satisfy production individual account/revocation or trustworthy cross-club and junior data authorisation**. Rejected as the final production multi-tenant security architecture, but remains current until an approved cutover. |

Official sources checked on 1 November 2026:
- Supabase [specific region / primary-data definition](https://supabase.com/docs/guides/platform/regions), [pricing](https://supabase.com/pricing), [compute and billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [Auth custom SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp), [production guidance](https://supabase.com/docs/guides/deployment/going-into-prod), [database RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [key classifications](https://supabase.com/docs/guides/getting-started/api-keys).
- Google [Firestore regions](https://firebase.google.com/docs/firestore/locations), [Firebase pricing](https://firebase.google.com/pricing), [Firestore usage price components](https://cloud.google.com/firestore/pricing), [query/rules security](https://firebase.google.com/docs/firestore/security/rules-query).
- OAIC [Australian Privacy Principles guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines) (chapter 3 updated 13 May 2026), [APP 8 cross-border disclosures](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-8-app-8-cross-border-disclosure-of-personal-information).

**Currency and vendor commitments:** Supabase figures above are publicly advertised **USD**, not Australian dollar quotations or total cost of ownership. Firebase paid usage varies with configuration and region. No fixed Australian-hosted PostgreSQL price has been sourced. Prices, features, limits and provider contracts must be rechecked before signing.

## Requirements: minimum pass/fail gates

| Requirement | Supabase | Firebase | Custom PostgreSQL/API |
| --- | --- | --- | --- |
| Primary private records in specific Australian region | **Documented Sydney option**; project selection needed | **Documented Sydney/Melbourne Firestore option**; other services TBD | Provider/region selection and contract TBD |
| Individual verified auth + recovery | Supported via Auth; assess strong-admin MFA, identity proof | Supported via Auth; assess options and tenant handling | Design/build/operate or separately buy IdP |
| Exact independent role grants for unrelated clubs | SQL relations + RLS candidate; requires tested policies | Data model and client/security rules design required | Custom SQL and API policies to design/test |
| Prevent one user self-approving new privileges | Write server-only approval path and atomic transitions | Write server-side approval functions and rule guards | Write server policy and transactions |
| Guardian proof & children's private records | Explicit app-level verified relationship and data separation required | Explicit app-level verified relationship and data separation required | Explicit app-level verified relationship and data separation required |
| External emails for real users | **Custom SMTP / mail hook required** | Auth/transactional provider choice and deliverability review | External provider/service and deliverability review |
| Revoke access to private exports/storage/media | RLS/storage/download/access tests required | Rules/IAM/download/access tests required | API/DB/object-store ACL tests required |
| Full Australian processing (including logs/backups/auth/support/SMTP) | **Unverified** | **Unverified** | **Unverified** until contracts + processors checked |
| RPO, RTO, recovery drill and disaster response | Backups/add-ons and tested restore needed | Backups/restore and tested restore needed | Build/contract/operate end-to-end |
| Tamper-resistant audit and operational security | Design event log and restricted access; optional external log pipeline | Cloud audit and security event design required | Custom immutable/auditable logs required |
| Total predictable monthly cost and spending cap | From published base fee; all add-ons to estimate | Metered; usage model and alerts required | Vendor quotes + engineering on-call effort required |
| Safe migration and vendor exit | Logical data export + old encrypted history handling | Data export and mapping plan | SQL export and operational transition plan |

**Any hard requirement unverified = no approval.** A specific Australian database region does **not** establish all-data Australian residency. This matters for children's records and any sensitive injury/medical data, as well as APP 8 risk assessment by the relevant entity.

## Workload tiers to cost, not financial forecasts

Model these **planning scenarios**, with real traffic measured from a consented synthetic performance run rather than assumed client data:

| Scenario | Assumed scale for modelling only | What to test |
| --- | --- | --- |
| Club pilot | 1 club, 6 teams, ~100–150 Persons, 25–50 actively signed-in Accounts | Trial registration/recovery, routine roster/RSVP, one match-day spike, backups and mail |
| Multi-club | 3 clubs, 18 teams, ~300–400 Persons and 100–200 Accounts | Cross-club identity links, independently scoped grants, guardian access, audit, concurrent fixtures |
| Association rollout | 20 clubs, 120 teams, ~2,000–3,000 Persons, 500–1,500 Accounts | Data volume, auth/login bursts, highly concurrent availability updates, search isolation, storage/egress/backup, support/incident response |

These are **hypothetical** usage bands, **not** evidence that the synthetic P12 308 players have real accounts or that production usage has been measured.

### Proposed monthly total-cost model

For each provider quote **USD and AUD separately**; include and isolate exchange-rate assumption, tax and any fixed setup fees.

```text
monthly recurring =
  hosting / database base subscription
+ compute (base credits deducted, if applicable)
+ private records / database storage and egress
+ operation-based charges (reads/writes/requests, if applicable)
+ object storage (files/photos) + antivirus/virus scanning
+ identity active users, MFA/phone SMS/passkeys (where charged)
+ transactional email delivery (OTP/invites/reset)
+ recovery (daily backup retention, PITR / restore)
+ audit and security log retention/egress
+ alerting, monitoring and incident tooling
+ environment separation (dev, test, prod) and regional backup copy
+ support/SLA and ongoing engineering/operations labour
```

*Example floor only:* a single Micro-sized Supabase Pro project advertises **from US$25/month** before additional email, usage, plan-dependent feature, logging and separate environment charges. **Not a total, not an approved budget, and not a claim that this deployment meets privacy, backup or security requirements.**

### Operational pitfalls to quantify

- Firebase client queries are denied when a potential result could violate rules; design query structure *with* the security matrix, not as a filter after fetching.
- Never put Supabase secret/service-role credentials in GitHub Pages JS, GitHub data files or browser storage; secret keys bypass RLS. A signed-in client with a publishable key still needs all schema grants/RLS correctly tested.
- Shared passwords and historical GitHub encrypted blobs cannot simply be recalled. New backend account revocation only stops **future** private API access. Document the historical file/password/key exposure and owner-approved retention treatment.
- User profile identity and club-level role grant are independent: a Club A administrator must not browse Club B players even if that Person also plays in Club B.
- The development/QA fictional accounts and 18 team rosters must not appear as production identities or be imported as real profiles.
- Third-party sports-registration systems (e.g. MySideline) and NSP/NSWRL policies must not be treated as accredited source integration until authorised and verified; P12F remains an advisory synthetic check.

## Required shortlist evidence and decision register

| Ref | Evidence / product-owner decision to supply | Status |
| --- | --- | --- |
| **D1** | Hosting and Identity/Data provider, named contract/version/region, billing owner, cost ceiling and cancellation/exit | **OPEN** |
| **D2** | Australian primary-data vs all-processing residency requirement, subprocessor list, cross-border processing, legal/privacy approval | **OPEN** |
| **D3** | Sign-in method (invite-only to start recommended), guardian/minor account policy, privileged MFA, lost-device and recovery workflow | **OPEN** |
| **D4** | Delegated role/approval policy: association, club, team, platform; sensitive health/contact permissions; owner break-glass | **OPEN** |
| **D5** | Legacy GitHub encrypted-data migration, key rotation, reversible cutover, historic Git blobs, backups and target RPO/RTO | **OPEN** |
| **D6** | Audit and monitoring requirements, external security review, acceptance targets, data retention and incident response | **OPEN** |
| **D7** | Deliverability and cost for invitation / passwordless email, trial account quantities and rollout sequence | **OPEN** |

### Proposed shortlist and evaluation conclusion

**Advance Supabase as the FIRST TECHNICAL/COMMERCIAL EVALUATION CANDIDATE, not the selected production vendor.** The relational Account→Person→Group→Grant model fits PostgreSQL naturally, primary Sydney region exists and entry published pricing is transparent. Score Firebase as the credible managed alternative; independently hosted PostgreSQL remains the controls/ownership comparison. A final choice must be driven by written quotes, data-processing terms, restoration evidence, verified API negative tests, and explicit owner sign-off.

**Next owner gate:** sign off that a **provider-neutral evaluation and a completely offline/fictional permission-test specification** may be prepared. Do not create a paid account, configure a real IdP, alter GitHub Pages production auth or migrate real club data until D1–D7 have been expressly accepted.
