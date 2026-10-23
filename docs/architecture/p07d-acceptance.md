# P07D — Schedule negative-case qualification and manual Safari acceptance

**Status:** implementation and automated qualification candidate. **Manual Safari evidence not yet supplied; product-owner acceptance not yet given.**

This gate closes the P07 design/implementation series for the **existing GitHub Pages and encrypted coach workspace only**. It does not make shared local fixtures official, introduce external feeds, grant cross-club permission, enable independent guardian/club accounts, or migrate to Supabase.

## What changes in P07D

- Calendar filter validation fails closed when a non-empty date, club, team, or sport filter is malformed, or a requested date range is reversed. Unspecified / empty filters still mean all local clubs or an unbounded local date selection. A malformed filter never means "show everything."
- The nine synthetic Node regression scenarios in `test/p07d-negative-cases.test.js` verify two clubs in one competition, intentionally shared match IDs, overlapping local records, cross-team competition-entry abuse, calendar privacy, archived records, historic friendly games, and additive fixture revisions.
- The two-viewport Chromium check in `test/browser/p07d_schedule.py` tests coach-only local calendar visibility, explicit club selection and no team or coach-note disclosure in player preview. It uses in-memory fictional records.
- No new schema, login, external backend, official source claim, automatic conflict resolution, auto-notifications, destructive task deletion or cross-club fixture sync.
- Existing P07A–P07C, storage encryption, conflict resolution, backup, publishing and other phase regressions remain required.

Two events that happen to have the same clock time **are not automatically a verified scheduling conflict**. Their records remain separate. An organiser or coach must resolve a real venue, people or match clash after checking authoritative details. Similarly, fixtures for two clubs in the same local tournament remain **two locally managed entries**, not an independently authorised shared association event.

## Exact-head automated acceptance record

Fill from GitHub Actions on the final P07D PR head, not from old branch results:

| Gate | Evidence |
| --- | --- |
| PR and exact head SHA | Pending |
| Node `npm test` count and pass/fail | Pending |
| Chromium count, suites and retained artifact | Pending |
| Privacy, invalid filters and historic fixture preservation | Pending |
| Merge commit and post-merge main Tests / Publish | Pending |

No test failure may be reclassified as a pass just to finish P07. Tests must not write a real `data` branch or publish real names.

## Manual Safari and role-journey acceptance worksheet

**Preparation:** Use a fresh fictional test library or a separate local test-mode device, never a live club record. On iPhone Safari and macOS Safari, record the device/OS/browser version and the fixture/test-data checksum. The tester must mark each row Pass or Fail, attach a screenshot or short observation, and record any issue.

| ID | Safari test | Expected result | Actual / evidence |
| --- | --- | --- | --- |
| S1 | Open Schedule > Upcoming as coach, inspect six-week cross-team calendar in narrow portrait viewport | Local-only provenance warning; no horizontal overflow; team, date, sport and club context legible | Not run |
| S2 | Select each of two fictional clubs, then All clubs | Only selected club's entries shown; All clubs restores both; no cross-team misassociation | Not run |
| S3 | Seed same-day/time matches and a training/duty overlap across two clubs | Separate records remain visible; app does not claim organiser-verified fixture or auto-resolve conflict | Not run |
| S4 | Edit a fixture date/time and cancel at the first review screen | Date/time, result, task, match ID and revision history unchanged | Not run |
| S5 | Confirm fixture movement, then cancel at linked-duty choice | No fixture or linked-duty change saved, including after returning to the page | Not run |
| S6 | Confirm fixture movement; choose move or detach duties | Single new coach-only amendment; correct duty handling, old results, RSVP, lineup and crew preserved | Not run |
| S7 | Cancel then restore a completed fixture with existing result | No silent result removal; separate revisions, appropriate linked-duty treatment | Not run |
| S8 | Open player preview / team-password view | No cross-club coach calendar, private reasons, staff accreditation, RSVP, phone, guardian or medical details | Not run |
| S9 | Reopen app in offline/test mode and use backup/export/import on fictional records | Revision history and IDs retained; no claim that offline local edits are already published | Not run |
| S10 | On two test-only browsers/devices, edit same fixture from different starting states | Existing conflict/review UI requires an explicit choice; no silent overwrite, loss of history or external sync claim | Not run |

Record **S1–S10** evidence and failures in P07 issue #49 before final sign-off. Any failed safeguarding, data-loss, ambiguous authority or stale-confirmation case blocks acceptance.

## Final phase acceptance boundaries

- P07D can merge when exact-head Node and browser suites pass and the owner approves this PR. **P07 itself must stay open** until Safari/manual journeys, historical-data compatibility, post-merge tests and owner acceptance are explicitly recorded.
- The broader P06 staffing/volunteer manual acceptance remains a separate gate, not silently accepted through P07.
- Post-P10 issue #55 still owns real multi-tenant security; post-P10 issue #62 still owns the header persona switcher.

## Rollback

Revert P07D to the PR81 merge baseline `20f71e204d6d328f1ff9a552a4c65ed551549fe5`. No data migration or schema rollback is required. Reversion restores earlier permissive invalid-filter behaviour, so avoid reverting only the tests while leaving the code behavior undocumented.
