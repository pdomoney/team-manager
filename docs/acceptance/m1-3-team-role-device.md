# M1.3 | Team context, role and device acceptance

Status: **source qualification candidate, not owner/device acceptance**. Base `main` at `e11e33bced2d83f4828df3a5529717eedfbf43c1` (merged PR #247). Source tests run on fictional local data only. M1.2 exact-main post-merge Chromium completion is a prerequisite for M1.3 release qualification.

## Product journeys to preserve

1. **Owner:** Home's existing club/team tiles select the working team. The header reflects, but never independently selects, it. Squad/Matches keep the exact team. All-club Home does not imply a club-wide management edit scope.
2. **Coach:** only explicitly assigned clubs/teams; team and role group remain stable through Training, header and width changes. Tactics remains where already permitted.
3. **Manager:** assigned Matches and Match staff remain available; the role does not inherit Coach's Plays or another club's team.
4. **Player:** existing Home/team membership selector and published Player view work without private management controls or a coach workspace. Coach Training is unavailable.
5. **Guardian:** existing linked-child club/team membership scope, not a youth roster directory; no coach Squad or Tactics.
6. **Multi-role:** change active role/group explicitly. Coach and Manager privileges must never be combined silently.

No changes to five-section shell, stored team/season, encrypted backups, match official authority, Oztag plays or deferred production identity are authorised by this milestone.

## Automated acceptance matrix (fictional, source-bound)

| Persona | Positive path | Negative or boundary path |
| --- | --- | --- |
| QA-01 Owner | Team1 to another club, Squad to Matches | Header stays informational; workspace not mutated |
| QA-07 Coach | Rangers grant to Stars grant, Training and resize | No unassigned Comets clubs |
| QA-09 Manager | Assigned Matches and team context | Forged out-of-scope team and Plays navigation denied |
| QA-14 Player | Comets to Stars membership, Matches | No private management context or Coach Training |
| QA-16 Guardian | Comets child to Stars child | Unrelated team and private Squad rejected |
| QA-18 Multi-role | Rangers Coach to Comets Manager | Coach Tactics removed when Manager active |

Representative viewports: **390 px** phone, **820 px** tablet and **1280 px** desktop. Resize within an active Coach journey and confirm exact team, tab and working-context continuity. Browser suite: `test/browser/m1_3_role_team_device.py`, run by the established `test/browser/run_all.py`. Verify normal unit, all Chromium and WebKit CI; an existing WebKit play test is not evidence that this new management suite ran on WebKit.

## Manual device and accessibility gate (not covered by CI)

Record device, OS/Safari version, date, exact published source SHA and PASS/FAIL for each result.

- Real **iPhone Safari**: repeat Owner, Coach, Manager, Player and Guardian Home selection; inspect banner/team consistency, mobile selector snap, scrolling, 44px accessible targets and absence of horizontal overflow.
- **macOS Safari**: repeat Coach and Manager routes, with both mouse and keyboard; check tab focus order, changing group, and returning to Home.
- **VoiceOver**: verify the Home team/group selector announces its selected state, the active role is apparent, and blocked actions are not presented as permissions.
- **Privacy/recovery**: Player and Guardian never see management or unassigned team records; published player offline refresh continues to show the encrypted saved copy. Test backup/recovery separately using disposable data.
- **Owner review**: approve representative journeys and visual density after actual device testing. Record failed paths and open a focused corrective PR rather than marking a check passed without observation.

## Non-goals and future gates

No real-account authentication, cross-club/tenant security, guardian verification, new server, score rule or medical record exposure. Production identity and server-side enforcement remain deferred under [#55](https://github.com/pdomoney/team-manager/issues/55); the role-policy batches in [#154](https://github.com/pdomoney/team-manager/issues/154) and physical Safari issue [#131](https://github.com/pdomoney/team-manager/issues/131) remain separately open. Plays E6–E8 stay deferred.
