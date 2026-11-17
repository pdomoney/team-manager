# Privacy onboarding and safeguarding source contract (initial design)

**Status: SOURCE-ONLY DESIGN, not authorised for production or connected to the app.** Based on Team Manager `main` `b514f4cf7b68b7ee0cebf3ba711397246bdfa2b3`, after [merged PR #260](https://github.com/pdomoney/team-manager/pull/260). This module is not imported into `site/` and has no identity provider, account store, database, service keys, real contact data, Working With Children Check (WWCC) lookup, session or production authority. It never persists data or grants access.

## What this PR adds

`src/privacy-onboarding-preview.js` exposes four provider-neutral *synthetic previews*:

| Proposed workflow | Design-only success | Fail-closed counterexample |
| --- | --- | --- |
| Registration privacy acceptance | Versioned terms + privacy acknowledgment required; separate optional default-OFF marketing; unverified guardian contact candidate for a minor | Declined/absent terms, invalid notice version, marketing choice bundled or junior marketing opt-in, raw contact fields passed directly |
| Guardian activation review | A request involving an unactivated guardian candidate and a matching appointed human team Manager can be queued for independent policy review | Wrong team, manager self-verification, missing relationship evidence or automatic invite |
| Volunteer WWCC review | A junior-facing volunteer's *metadata* may be prepared for a future independent safeguarding review | Raw WWCC number, expired check, missing evidence or a Club Admin posing as an approved verifier; no clearance is ever conferred |
| Membership retirement | Membership becomes inactive; after 12 months it becomes **eligible for archive review**, without automatic record deletion | Active member, invalid dates, premature review or attempted automatic deletion |

Every return value includes `productionProcessingAuthorised:false`, `dataWritten:false`, `accessGranted:false` and `accountActivated:false`, even when `designReviewable:true`. A positive preview is **not** legal consent, identity authentication, verified guardian status, a valid WWCC credential, archived record mutation or a production grant. The future server must independently obtain real identity and age evidence, enforce exact organisation/team scopes, supply a trusted clock, persist versioned acknowledgment and audit evidence with required authorisations, and validate applicable law.

**No consumer integration in this PR.** It is intentionally impossible to enable the new workflows by changing a flag in the public site. No provider or database is selected. This is a testable specification for a later approved implementation, not a substitute for it.

## Preserved owner decisions and known limitations

- TM-PR-005: minor's **own login**, unactivated guardian contact candidate and *optional activated guardian account*, not automatic guardian login.
- TM-PR-006: the **appointed human team Manager** is the proposed guardian-verification actor, not a platform operator. Identity proof and conflicts still require independent approval.
- TM-PR-009/017: mandatory terms/privacy acknowledgment, distinct optional marketing, no bundled consent; child/guardian authority and applicability remain open.
- TM-PR-017 (supplemental): WWCC number entry for junior-facing volunteers, **not** automatic clearance. State/territory requirements, exemptions and verification authority still undecided.
- TM-PR-013: **inactive for 12 months, then archive**; no automatic record deletion, and no blanket permission to retain sensitive fields forever.
- TM-PR-018: only the platform operator makes final go-live approval after all independent evidence. Team/Club Admins provide operational attestations.

The older [first-team cloud release guidance](../operations/first-team-cloud-release.md) is corrected to distinguish *mandatory verified guardian/privacy evidence* from *optional activated guardian-account linkage*, without changing the actual L0–L6 evaluator or its guardian evidence-ref requirement.

The next source-only stage is [private-data access review](private-access-policy-contract.md), which models exact-team/club scopes, minimum field classes, association disclosure denials and archived member rights without real personal data or access.

## Next approval boundary

This PR does **not** authorise a production onboarding UI, browser identity provider, real junior registrations, private volunteer credentials, a guardian verification invitation, public contact information, a database or an installed release. [#55](https://github.com/pdomoney/team-manager/issues/55) and [#252](https://github.com/pdomoney/team-manager/issues/252) remain HOLD. All seven cloud gates and eight live journeys retain their pending values.

Tests use metadata-only synthetic values and cover positive/negative states, protection against extra/raw personal fields, independent guardian reviewer scope, WWCC validity separation and archive timing. The design contract must be reviewed before connecting to any personal-data service; a provider-neutral preview is not a substitute for real server-side enforcement.
