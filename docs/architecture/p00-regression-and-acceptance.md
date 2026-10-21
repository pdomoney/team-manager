# P00 — Regression crosswalk, synthetic scenarios and acceptance handoff

**State:** Test design and historical CI evidence only. **No new live-system testing or schema migration performed.** Source pinned to 1c5a69bd4660941b0a656a612f41022ba5ec37a3. Parent: [P00 Issue #42](https://github.com/pdomoney/team-manager/issues/42).

## 1. CI baseline recorded, with exact limitations

| Gate | Evidence | Outcome and limitation |
| --- | --- | --- |
| Node test model, validation, privacy, migrations and publishing | [main Tests Actions run 39519227151](https://github.com/pdomoney/team-manager/actions/runs/39519227151) | **193/193 pass** at pinned SHA |
| Chromium regression using synthetic GitHub / synthetic sample data | Same [run](https://github.com/pdomoney/team-manager/actions/runs/39519227151) | **1001/1001 assertions**, **28/28 suites** at pinned SHA |
| Publishing workflow (code baseline only) | [main Publish run 39519227207](https://github.com/pdomoney/team-manager/actions/runs/39519227207) | Workflow success, not direct evidence of working user credentials or correct production data |
| 30/60/100 synthetic player-photo capacity | [test/browser/capacity.py](../../test/browser/capacity.py), [test/browser/run_all.py](../../test/browser/run_all.py) | **Not included** in this main-push browser run; Pull Request browser job includes it |
| iPhone/macOS Safari, real role permissions, real official feeds, data recovery across physical devices | None verified in this P00 inventory | **Not tested**: must not claim qualification |
| Per-record server-side multitenant authorisation | No backend exists in current app | **Not implemented**: design and tests required P02 |

GitHub Actions test.yml uses 22 for Node and Python 3.13 for Playwright 1.55.0; test.yml triggers on PRs and on source/test changes to main, but skips photo-capacity on main pushes. Documentation-only PRs still trigger the pull-request test workflow. The browser runner emits qualification.json and saves it as an artifact (14-day retention). Longer-term archival needs an agreed retention or release-record strategy; no such control was changed by P00.

## 2. Regression suite crosswalk (currently implemented)

| Protected behaviour | Existing tests |
| --- | --- |
| Model, workspace migration, teams, persistent IDs, three-way merge | test/model.test.js, test/browser/m0_stability.py, test/browser/m3_teams_library.py |
| Club creation, branded identity, directory research matching and inherited styles | test/club-branding.test.js, test/club-directory.test.js, test/browser/clubs.py, test/browser/club_branding.py, test/browser/club_directory.py |
| Team sport overrides, fresh team setup, cross-team references | test/team-identity.test.js, test/team-sport-default.test.js, test/team-setup.test.js, test/browser/team_identity.py, test/browser/team_sport_override.py, test/browser/fresh_team_setup.py |
| Player privacy, kit loans, mixed sports, season history and roster participation | test/players.test.js, test/cross-team-players.test.js, test/seasons.test.js, test/browser/players.py, test/browser/cross_team_players.py, test/browser/seasons.py |
| Match staff, per-sport roles, accreditation, badge checks, match requirements | test/match-crew.test.js, test/crew-badges.test.js, test/crew-context-profile.test.js, test/volunteer-intake.test.js, test/browser/match_crew.py |
| Scheduling, matches, competition entries and status changes | test/browser/competitions.py, test/browser/m4_matches.py, test/browser/m2_participation.py, test/browser/m5_reports.py |
| Rules, tactics teaching, cross-sport adaptation and library content | test/rules.test.js, test/play-study.test.js, test/play-teaching.test.js, test/play-transfer.test.js, test/browser/rules.py, test/browser/play_learning.py, test/browser/coach_teaching.py, test/browser/play_transfer.py |
| Home context, team lists, mobile layout and club UI styles | test/home.test.js, test/browser/home.py, test/browser/header_context.py, test/browser/view_modes.py, test/browser/style_review.py, test/browser/club_ux_crop.py |
| Encrypted player projection, token retention, publishing mocks and capacity | test/vault.test.js, test/github-settings.test.js, test/build.test.js, test/browser/live_publishing.py, test/browser/capacity.py |
| Deterministic synthetic test library | test/test-library.test.js, test/browser/test_library.py |

This is a **test-to-feature index**, not a claim that any test exercises association, club admin or guardian account permissions. Those are future P02–P04 tests.

## 3. Proposed representative synthetic acceptance journeys

These are **specifications for future test additions**, not passing tests today. All identities, children, clubs and credentials used must be fictional.

| Scenario | Setup | Expected future outcome | First phase that should implement it |
| --- | --- | --- | --- |
| S01: association licence | Synthetic league owns three clubs, each with separate club admin | League manages approved affiliation and aggregate permitted information, no private child/medical leakage | P02/P03 |
| S02: club licence | Synthetic Rugby League club operates Rugby League and League Tag junior/senior teams | Club admin manages its teams but cannot see another club's private records | P02/P03/P05 |
| S03: independent coach | One coach operates two own teams in different sports/clubs | Same login, correctly scoped team data, personal play library; no club admin unless granted | P02/P03/P08 |
| S04: cross-club appointments | Person coaches in club A and manages team in club B | Each club's grants are independent and reversible; no cross-club lateral browse | P02/P03/P04 |
| S05: multi-role person | One person is club secretary, helper, accredited trainer and guardian | One person identity, four independently scoped relationships; eligibility does not grant admin access | P04/P06 |
| S06: junior guardian | Guardian of two under-18 players in different club contexts | Can see and update only authorised children and permitted records, no accidental access to other minors | P02/P04 |
| S07: player transfer without losing history | Player moves from junior League Tag to Oztag with independent team record | Retain prior season, lineup, position and jersey loan events; explicit approved link only | P04/P05 |
| S08: match staffing compliance | Junior Rugby League match needs trainer categories, Oztag match uses its own roles | Current sport/age/season policy, independent accreditation and distinct qualified attendees | P06 |
| S09: shared tournament | Two clubs enter same competition; organiser revises fixture | Authoritative fixture revision linked to individual team participation; local results/history intact | P07 |
| S10: sport tactic sharing | Coach copies a personal play into a club library, changes club copy | Permission-aware versioning; original personal and historic taught variants preserved | P08 |
| S11: denied access | Revoked user guesses team ID, changes URL/API request, exports report | Backend denies records even when client UI is modified; action audited | P02/P10 |
| S12: legacy import and rollback | Encrypted schema-4 synthetic historical dataset + duplicate person-name traps | ID-stable repeatable import, no silent person merges, comparison report, verified rollback | P01/P10 |
| S13: device recovery | Coach uses browser offline, merges edits, restores encrypted backup | Nothing lost or leaked; conflicts explicit, real Safari assessed | P10 |
| S14: directory link | Club manually created and plausible directory research candidate | User confirms, only blank safe details added; no logo, style or role overwrite | Currently PR #40; retain in P03 |

## 4. Required negative and historical-data assertions

- No access through role label changes in DOM, client-side filters, guessed record URLs or stale user sessions.
- No access to an unrelated club or league's member profiles, health/injury, guardian or contact details.
- No inferred Person equality by shared name/email/phone, and no two distinct persons merged without an explicit consented decision.
- No auto-upgrade of a club research entry to a governing-body-verified organisation.
- No cross-team jersey issue/return, preferred position, lineup or attendance overwrites.
- No conversion of coach/staff accreditation into live match role attendance or team administration rights.
- No automatic import of official fixtures from an untrusted third-party listing.
- No loss of historic season status, team/competition entry link, volunteer assignment or messages.
- No unauthorised release of coach-only/child-specific records through player projections, backup exports or cross-role downloads.
- No early removal of legacy encrypted persistence until restoring from a known-good old export has been demonstrated.

## 5. P00 review checklist

- [x] Captured exact current main SHA and source inventory.
- [x] Recorded historic baseline test evidence and correct exclusions.
- [x] Produced feature-retention matrix, static form identifier inventory, overlapping field map and migration risk register.
- [x] Assigned major overlaps/gaps to specific roadmap phases.
- [x] Defined future synthetic scenarios for the four product licensing cases plus minors and compliance.
- [ ] Documentation-only draft PR CI is green at the **final PR head**.
- [ ] Product owner has reviewed preservation decisions, entity boundaries and specific high-risk duplicates.
- [ ] Product owner has explicitly accepted P00 and linked sign-off in GitHub.
- [ ] P00 PR merged into main and post-merge validation is recorded.
- [ ] Master tracker #41 marks P00 completed only after all mandated gates.

**P00 gate:** inventory approval **does not approve** P01 schema implementation, new backend, access controls, account creation, real-data migration or commercial licence change. P01 starts with explicit design review.
