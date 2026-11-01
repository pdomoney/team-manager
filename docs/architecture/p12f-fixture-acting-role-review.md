# P12F — Fixture-specific acting Coach / Trainer policy review

Parent: [approved P12 issue #124](https://github.com/pdomoney/team-manager/issues/124). Based on accepted and merged PR129 main `0d35159243f217ec15388c10d8af1588f0e65c9d`, exact-main Tests and Publish passed.

## Authoritative rule reference verified on 1 November 2026

**NSWRL Community Rugby League Policies & Procedures Manual, 2026, section 4.8, printed page 103:**

<https://www.nswrl.com.au/contentassets/1d571d35b4264f349c39683f186aeb4d/2026-pp-manual-v1>

The publication requires an appropriately accredited Coach before the match can start, requires the relevant NRL On-Field Policy minimum safety personnel, and **forbids a single person from being both Coach and a required on-field safety person during the same match**, even if accredited for both. It specifies a currently accredited/registered Sports Trainer at the venue for each team from U16 upward, subject to the referenced NRL On-Field Policy. The ground manager must determine and record who is present and must not permit a match without the prescribed staff.

**Crucial limitation:** NSWRL section 4.8 explicitly depends on NRL On-Field Policy section 1.2 for age-band staffing minima. We have not imported or independently approved the entire NRL On-Field Policy matrix, local competition by-laws or actual MySideline records. Therefore this phase **never certifies match eligibility or staffing compliance**. It implements a source-linked *negative rule and review prompts only*, not final approval.

NSWRL Club Hub accreditation checking information:
<https://nswrl.freshdesk.com/support/solutions/articles/51000452612-checking-accreditations>.

## New deterministic QA module

`site/p12-fixture-role-review.js`:

1. Creates a **fictional fixture review snapshot** for a specific one of the 18 existing P12 teams with stable sample player/staff/volunteer identity and an explicit fictitious 2026-11-07 start/end time. The snapshot contains no real name, contact, child, official accreditation evidence or login.
2. For Rugby League, applies only the **2026 NSWRL Community** section 4.8 rule profile, with source URL, section, and explicit unknowns. Touch, Oztag and unknown sports deliberately fail closed without an approved competition-specific policy profile.
3. A Trainer moving to **Acting Coach** must identify the absent Coach, be a different person from the required safety nominee, and explicitly nominate **another person for the vacated safety duty**. Even when those fictional structural problems are resolved, registration/accreditation, local approval, NRL on-field age-grade staffing, safeguarding and presence remain unverified.
4. A Team Manager moving to **Trainer** is a separate fixture proposal; the person's original management coverage and registration/accreditation remain for review, and they cannot count as the Head Coach and required safety person simultaneously.
5. Unrecognized/foreign team IDs, unsupported roles, same-person safety replacement, invalid calendar values, ended fixtures and incompatible policy profiles fail closed.
6. All proposed roles expire at the fixture's end. Review outcomes are `blocked`, `review-required` or `expired`, **never** `approved`, `compliant` or `eligible`. A reviewer can optionally add a fake review entry to an in-memory audit, but not authorize, publish, notify or modify actual roles.

## App/UI

Within the existing P12 synthetic trial/test library, QA-09 has a **separately assigned** Example Rangers U16 Team Manager role for testing. The fictional match workflow's "Propose Acting Coach" button can nominate the sample Orange Trainer. The P12F panel initially shows a **blocked** review due to missing on-field safety replacement. Selecting the separate fictional Blue Trainer removes the structural blocker but retains **review-required** with all independent registration, accreditation and age-grade policy evidence outstanding. Under a Comets or Stars context, the panel blocks due to an unverified Oztag/Touch policy.

Existing Club Admins, revoked profiles and player-only/guardian memberships do not gain team workflow access. The UI never shows private player or real personnel data.

## Acceptance

- [ ] Exact PR-head Node PASS, including expiry at fixture-end, dual-duty denial, separate backup, Manager-as-Trainer, no cross-sport inheritance and no production writes.
- [ ] Complete browser/Chromium suite PASS, including new `p12_fixture_staffing_review.py` at 390/820/1280 and legacy P11/P12 regression.
- [ ] Owner reviews sample U16 replacement and explains why it says `review-required`, not `ready`.
- [ ] Owner performs separate physical Safari and VoiceOver checks with device/version results. Browser Chromium is not a Safari certification.
- [ ] Owner merges only after exact PR-head tests pass. Verify exact-main Tests and Publish afterward.

### Production release remains separately gated

No real secure identity, authenticated human approval, MySideline verification, medical/safeguarding evidence, official local policy activation or authoritative roster guarantee is introduced. These still need independently approved production architecture [#55](https://github.com/pdomoney/team-manager/issues/55) and approved competition policies [#31](https://github.com/pdomoney/team-manager/issues/31).

P12F closes the **synthetic rule/role proposal design gate**, not the eventual deployment of production role-based authorization or official staffing compliance.
