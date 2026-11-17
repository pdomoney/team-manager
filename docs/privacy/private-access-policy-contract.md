# Private player data, team/club scope and safeguarding review contract

**Status: SOURCE-ONLY POLICY PROPOSAL.** Built from Team Manager `main` `e7fea205a6ff1a82c4bf53d721496dc256cb1f54`, with PRs #259–#261 merged. This document and `src/privacy-private-access-preview.js` model **synthetic metadata only**. No real personal information, account credentials, WWCC numbers, emergency contacts, provider services, database, app UI or production rights are involved. No imports from `site/`.

The existing [privacy decision register](README.md) and [launch evidence plan](launch-readiness.md) remain unapproved for production. The [first-team launch](../operations/first-team-cloud-release.md) remains **HOLD**, with L0–L6 **0/7** and real-team journeys **0/8**.

## Five bounded private-information review cases

| Product action | Owner decision | Source-only design match | Denials |
| --- | --- | --- | --- |
| Player corrects personal profile | TM-PR-014 | Authenticated player’s *own* contact email, mobile or residential address keys; account-email change requires separate verification | Another player, DOB, raw field values, wrong selected role, unverified identity |
| Appointed Team Manager or Club Admin views private information | TM-PR-007/008 | Only exact team or administered club; active membership; read category of player contact or emergency contact | Coach/volunteer/guardian/platform routine browse, other club/team, inactive/archived, private guardian/WWCC class |
| Sporting association sharing | TM-PR-012 | Verified association administrator and purpose limited to registration/eligibility/fixtures | Other association, marketing, bulk export, inactive/archived; **zero actual fields approved** |
| Volunteer safeguarding credential review | TM-PR-017 supplemental | Private metadata may queue for designated safeguarding verifier; WWCC remains pending independent verification | Raw WWCC number, Club Admin pretending to verify, automatic valid clearance or duty grant |
| Archived member rights request | TM-PR-013/014 | Platform operator can **route** a verified access/correction/deletion/retention review | Ordinary roster browse, unverified request, immediate archive deletion, Club Admin assuming platform rights |

## Trust boundaries

Each preview takes **only allowlisted synthetic identifiers and metadata**, never names, phone numbers, street addresses, photos, WWCC credentials, session tokens or raw verification evidence. Even a positive `designReviewable:true` result returns `accessGranted:false`, `fieldValuesReturned:false`, `disclosurePerformed:false`, `recordChanged:false`, `productionProcessingAuthorised:false`. Association disclosures always propose **zero approved fields**; TM-PR-012 recipient and field authority must undergo separate approval.

The proposed Team Manager/Club Admin field-category view is **not** server access authorisation. The existing [server boundary](../architecture/l1-first-team-server-boundary-20261116.md) still blocks private, guardian and minor records until owner-selected backend, legal/controller, guardian, field and identity approvals. Roles and grants are currently test metadata, **not** client-writable authority. A future trusted transactional server must verify account session/active selected role, independently approved grants, exact resource scope, legal purpose, field-level minimisation, audit, and returned projection. Never import these pure preview functions into the public UI as a permission enforcement mechanism.

No change is made to Team Manager's Home, Schedule, Team, Tactics, More, active team/role context or accepted E5 plays. No change is made to production schemas, frozen release evidence, data branch, passwords, providers, live deployment or operator approvals.

## Review acceptance

The associated Node tests exercise positive matches and negative paths: role confusion, foreign team/club/association, revoked access, archive/inactive restrictions, direct personal-values rejection, unapproved disclosure fields, unverified WWCC, and rights-request misrouting. A test PASS only establishes source contract consistency, not privacy/legal compliance or physical Safari acceptance.

**Next gated stage:** confirm which exact personal fields each authorised role may read; identify accountable legal entity, supplier, safeguarding verifier and data-class retention rules; then implement server-enforced field projections and end-to-end registration acceptance on an independently approved provider. Production remains **HOLD**.
