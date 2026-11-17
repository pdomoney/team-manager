# Privacy and first-team launch readiness, review proposal

**Status: PROPOSED, NOT APPROVED.** Source baseline: Team Manager `main` `de3b43bfcffec05e90da7e2218d71e2c139b7d76` (PR #259 merged). Policy intake is complete **18/18**; independently reviewed **0/18**; cloud gates **0/7** and live participant journeys **0/8**. No live backend, identity, player data, credential collection, migration or release is authorised. This is a source-only review plan, not an implementation or provider selection.

This follows [the completed privacy register](README.md), the [player-field inventory](../../config/privacy-player-field-inventory.json), [first-team release evaluator](../../src/first-team-cloud-release.js), [source-only trusted server boundary](../../docs/architecture/l1-first-team-server-boundary-20261116.md), and tracking [#252](https://github.com/pdomoney/team-manager/issues/252) / [#55](https://github.com/pdomoney/team-manager/issues/55).

## What the owner has already decided

The owner chose junior player accounts with recorded **unactivated guardian candidates**; the **appointed human team Manager**, not the platform operator, verifies guardian activation; no active guardian account is automatically required. Registration requires terms/privacy acknowledgment and **separate optional default-off marketing**. Proposed initial safety data is emergency contacts only, not medical records. Scoped Team Manager and Club Admin reads must be server authorised. Association disclosures are limited to competition needs. Australia is preferred for hosting, but not mandatory. The provider is **not selected**.

On departure, a member becomes **inactive**, then **archived after 12 months**, with no automatic wholesale deletion; private-field retention and lawful deletion requests remain subject to review. The **platform operator alone** controls hosted database restoration and ultimate product release. Team/Club representatives attest readiness but cannot approve a software release. **No in-app incident report form** is required in the first release, but a reporting channel and response process still are.

## Evidence matrix

[Machine-readable review plan](../../config/privacy-launch-readiness-plan.json) has **one control for each TM-PR-001–018**, with a review coordinator, required evidence, acceptance criterion, negative test, L0–L6 gate references and first-team journey references. All entries are `requires-independent-evidence`, with **null evidence refs** and **no authorisation flags**. This is intentionally separate from the user responses: a recorded preference cannot become independent privacy approval through an automated copy.

| Review bundle | TM-PR decisions | Proposed evidence needed | Owner-facing decision |
| --- | --- | --- | --- |
| Identity, junior entry and guardians | 001, 003, 005, 006, 009, 017 | Age-appropriate notice, registration proof, provider identity proof, candidate-only guardian, appointed human Manager verification, conflict/revocation audit | Approve the scoped registration and guardian journey |
| Field collection and controlled disclosure | 004, 007, 008, 012, 014 | Purpose and necessity for each field, emergency access, exact role/team/club reads, verified association export, contact self-correction and identity-protected email change | Approve per-field and per-role handling |
| Provider, legal accountability and location | 002, 010, 011 | Controller allocation, cost/security/exit comparison, actual countries, processors and applicable Australian privacy requirements | Approve supplier and lawful processing separately |
| Lifecycle, recovery and incidents | 013, 015, 016 | Inactive→archive transition, per-field retention, encrypted backups, platform-only recovery, out-of-app incident intake, evidence logging | Approve operations and recovery procedures |
| Safeguarding and release | 001, 005, 006, 017, 018 | Junior WWCC checks, role verification, child privacy applicability, operational attestations and separate operator signoff | Explicit **platform operator** go-live decision only after proof |

## Five proposed journeys, no live UX changes

**1. Account registration:** present versioned understandable terms and privacy notice. Account acceptance is required; marketing preference is distinct, **off by default**. Do not activate a junior in live data while age/guardian processing is unapproved. The proposed Apple/Google login option is not an approved provider.

**2. Guardian activation:** junior has their own login; guardian contact stays a candidate, not an active account. On request, an **appointed human team Manager** verifies relationship and records purpose, proof, conflicts and decision. No automatic invite, self-approval or cross-team authority. Actual evidence method is still to be approved.

**3. Volunteer WWCC:** a junior-facing volunteer needs a private place to enter their **Working With Children Check number**. A recorded number is *not* clearance. State/territory rules, verification authority, expiry, exemptions, and safeguarding duty decision are still open. Never expose raw numbers in public browser fixtures or GitHub.

**4. Inactive and archive:** at departure mark membership inactive and withdraw operational permissions. After 12 months, archive without automatically deleting the record. Do not assume emergency contact details or identifiable material may be kept indefinitely. Rights/backup expiry must be reconciled before live use.

**5. Platform release:** collect operational confirmation from the team's Manager and Club Admin, independently review the registered privacy decisions, verify provider, server controls and recovery, complete all seven L0–L6 gates and eight first-team user journeys, and obtain an **explicit separate platform-operator release signoff**. Neither this document nor PR merging qualifies runtime.

Each proposed journey in the JSON includes positive steps and concrete denial cases for eventual implementation tests. The proposed journeys are **not** extra launch-journey PASS results; the existing eight source-release journeys stay pending.

## Preserve Team Manager's product identity

Do not redesign Home, Schedule, Team, Tactics or More, active role/team selection, management/navigation semantics, Coach/Manager authority, club associations or the accepted E5 play rendering/editor. There is **no** change to `site/`, production role enforcement, storage schemas, the encrypted data workflow, frozen release evidence or GitHub Pages publication in this review block. The existing P12 role picker is **synthetic** and not production authentication.

## Proposed implementation sequence after owner review

1. **Registration and privacy acceptance:** confirm the exact wording, age/guardian requirements and data-minimisation choices, then implement a provider-neutral interface/state contract in a later gated PR with synthetic positive/negative tests.
2. **Guardian and volunteer safeguards:** approved human Manager verification contract, conflict/revocation checks, private WWCC field and independent state-specific verification design.
3. **Scoped personal information:** per-field roles, disclosure projections, archival permissions, self-service contact corrections and denial audits in an authenticated backend, *only after provider/security and privacy approval*.
4. **Qualification and final release:** signed policy/evidence reviews, independent server and device tests, exact-source backup/restore, L0–L6 and eight live journeys, final operator acceptance.

**Current blocking decisions:** select and approve actual legal controller and backend provider/plan, field-level child necessity, guardian proof method, WWCC validity/authorised verifier, archival sensitive data/backup retention, out-of-app incident route, and evidence reviewers. Underlying legal requirements cannot be waived by account acceptance. A future privacy/legal review may be necessary depending on actual applicability. No real participant information is to be placed in this public repository.

## Reviewer acceptance of this document-only block

Confirm every TM-PR is mapped once; the owner decisions above have not been widened; denial examples would catch accidental privileges; no person/volunteer information, secrets or approval claims were added; launch gates remain pending; and actual iPhone/UI/backend behaviour is **not tested** by source-only policy checks. Approval of this *plan* must be recorded separately from approval of live processing.
