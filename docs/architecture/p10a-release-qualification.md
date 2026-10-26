# P10A — Release qualification baseline and evidence gates

**Status:** P10 release qualification *planning / first draft PR*. Not a stable release. No production storage migration or account change.

**Repository:** `pdomoney/team-manager`  
**Frozen input baseline:** [P09D PR #89 merged main](https://github.com/pdomoney/team-manager/pull/89), commit `b76e5a47d8114b7284ed12be73ca44a07a336b17` (25 October 2026, Sydney). All scoped P00–P09 implementation milestones owner-accepted and closed. No assumption of physical Safari qualification.

## 1. What P10 qualifies

The **existing GitHub Pages and encrypted coach-workspace app** (local encrypted draft, coach/team passwords, GitHub data-branch publishing and backup/recovery). P10 must qualify accepted local people, guardians, club/team/season participation, jersey issue/return, sport-specific positions, photo crop, match staff, volunteer compliance, multi-club schedule, fixture revisions, rules/tactics and play libraries, demo role previews and restrictions.

This is **not** real association-, club- or guardian-level authenticated multi-tenant security. No Supabase migration, production identity, billing, invitation delivery, real official fixture-feed claims or arbitrary header persona switching occurs in P10. Future implementation remains deferred to [backend/security #55](https://github.com/pdomoney/team-manager/issues/55) and [persona switcher #62](https://github.com/pdomoney/team-manager/issues/62).

## 2. Verified incoming automated evidence

| Boundary | Verification |
| --- | --- |
| Final P09D exact head `a068ff1fecf50ff6f1f3e3e31d40664ac7b75c14` | [Tests #40129563812](https://github.com/pdomoney/team-manager/actions/runs/40129563812): 421/421 Node, 1,268/1,268 Chromium in 39/39 suites, full capacity 30/30 included |
| Final P09D merged `main` | [Tests #40138493809](https://github.com/pdomoney/team-manager/actions/runs/40138493809): 421/421 Node, 1,237/1,237 Chromium in 38/38 suites. Push excludes the expensive capacity suite by design |
| GitHub publishing workflow | [Publish #40138493813](https://github.com/pdomoney/team-manager/actions/runs/40138493813): success |
| P06 | Head PR76 335 Node, 1,103 Chromium; main Tests #39886253158 / Publish #39886253178 PASS |
| P07 | Head PR82 381 Node, 1,139 Chromium; [main Tests #40031698797](https://github.com/pdomoney/team-manager/actions/runs/40031698797) and [Publish #40031698815](https://github.com/pdomoney/team-manager/actions/runs/40031698815) PASS |
| P08 | Head PR85 402 Node, 1,189 Chromium; [main Tests #40053604628](https://github.com/pdomoney/team-manager/actions/runs/40053604628) and [Publish #40053604590](https://github.com/pdomoney/team-manager/actions/runs/40053604590) PASS |

Do not substitute these automated results for physical iPhone/macOS Safari acceptance or live GitHub production publishing/restore.

## 3. P06–P09 manual Safari verification carry-forward (release blocker)

The product owner instructed **“Accept all”** on 25 October 2026, authorising phase-level implementation acceptance and administrative closure. Source issue comments retain explicit acceptance. **No physical Safari test execution was reported.** The 100% phase indicators represent completed **owner-approved phase milestones with a documented validation exception**; they do not mean all device cases passed.

**P10 release blocker:** On a fictional test workspace, execute and record all relevant cases from [shared closure worksheet](p06-p09-closure-worksheet.md):

| Original phase | Required physical-device journey set | Separate issue |
| --- | --- | --- |
| P06 | V1–V8: staff, WWCC/manual verification warnings, sport-specific trainers, lifecycle, conflict and privacy | [#48](https://github.com/pdomoney/team-manager/issues/48) |
| P07 | S1–S10: cross-team calendars, venue/time conflicts, revisions, linked duties, player privacy, offline/two-device conflicts | [#49](https://github.com/pdomoney/team-manager/issues/49) |
| P08 | S1–S10: Oztag/Touch/League/League Tag contexts, unsupported rule packs, play-library provenance, historical content and backup | [#50](https://github.com/pdomoney/team-manager/issues/50) |
| P09 | R1–R8: players/helpers/staff forms, crop/positions/jersey history, club branding, organisational design-only concepts, coach/player boundaries | [#51](https://github.com/pdomoney/team-manager/issues/51) |

For every test, record **device model, actual iOS/macOS version, Safari version, test date/time, fictional workspace ID/checksum, expected result, observed result, PASS/FAIL and defect reference**. No real family/private staff medical or credential data in test evidence.

If any case is skipped, record a **case-specific explicit risk/waiver decision** with owner and reason in P10 #52. Do not silently waive the entire matrix. Critical safeguarding/privacy, encrypted data loss, published data leakage or cross-club access defects block release regardless of preference.

## 4. Other P10 acceptance streams

| Stream | Mandatory checks and evidence |
| --- | --- |
| Regression and provenance | Fresh full Node/Chromium at the final exact PR head; retained browser artifacts; GitHub Pages and data-branch workflow; exact main post-merge tests and Publish IDs |
| Storage and recovery | Fictional full encrypted export/backup; fresh restore; repeat restore; failed/incorrect password behavior; malformed/partial data handling; no data corruption |
| Historical identity | Stable person/team/club IDs; historic seasons, match results, volunteers, jerseys issued/returned, archived teams and play-library revision/source metadata across repeated upgrades |
| Multi-device concurrency | Two distinct test-browser/device edits from stale baselines; explicit review/conflict decisions; prevent silent overwrite; no false claims about instant shared sync |
| Privacy, security and permission | Coach-only operations inaccessible in player preview; no private medical, contact, safeguarding, accreditation or credential contents in shared or public projections; preview concepts never become permissions |
| Usability and accessibility | Real iPhone Safari and macOS Safari, mobile widths and keyboard/VoiceOver focus/read order; status warnings and recovery |
| Performance and scale | Capacity, photo handling, several teams/clubs/seasons, large coach workspace and no regression relative to accepted baseline |
| Migration readiness | Reversible field/identity map, risk register, tenant ownership choices, post-P10 backend design gaps, backup/rollback concept; **no actual production import or backend provision** |
| Release and operational handoff | Version proposal; changelog, upgrade/rollback and user operating guide; owner acceptance of final exact commit; tag **only after** gates pass |

## 5. Bounded P10 delivery plan

Each item is a **separate owner-reviewed PR** based on merged `main` with exact-head Node/Chromium qualification; previous acceptance is not a blanket merge approval.

- **P10A**: Freeze baseline, source-controlled evidence inventory, carry-forward register and accurate progress-bar wording for P06–P09 exceptions. No application runtime change.
- **P10B**: Automated encrypted data recovery/repeated upgrade/history/permission and concurrency release tests, test-only synthetic data. Any failure gets a narrowly scoped corrective.
- **P10C**: Read-only migration-readiness manifest, operational documentation, privacy/security gap review and release candidate packaging without backend migration.
- **P10D**: Final release-candidate qualification, browser/device owner worksheet completion, rollback/release decision; no tag before formal release acceptance.

Progress has a fixed denominator: **four PR milestones + physical Safari/representative journeys + formal P10 owner release acceptance + P10 issue closure**. A draft PR does not count until it merges.

## 6. Acceptance and rollback

Acceptance of P10 requires completed test evidence, no outstanding material defects, owner acceptance and final merged main Tests/Publish. The **earlier owner acceptance of P06–P09 does not substitute for P10 release approval**.

P10A itself is documentation and progress-logic only. To revert, restore `docs/architecture/p10a-release-qualification.md`, issue-progress implementation/test and config from PR89 merge `b76e5a47`; no database, encryption, person, season, sport or authorisation change required.
