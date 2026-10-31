# P12 sample data expansion — 18 fictional teams and acting-duty testing

Tracking: [P12 #124](https://github.com/pdomoney/team-manager/issues/124), accepted P12E [PR128](https://github.com/pdomoney/team-manager/pull/128). Started from merged `main` `2e169876d1931a4fa7e3a66f1c286832e7008745`.

## Why
The existing QA data had 3 clubs but only 4 detailed teams (3-players-per-team test stubs). Role context switching needed meaningful differences in club size, sport, age bracket, squad, staff/volunteer tasks and temporary fixture roles.

## Synthetic fixture coverage

| Fictional club | Sport | Teams | Sample players | Staff | Match-day helpers |
| --- | --- | ---: | ---: | ---: | ---: |
| Example Comets | Oztag | 6 | 90 | 19 | 27 |
| Example Stars | Touch | 6 | 96 | 20 | 28 |
| Example Rangers | Rugby League | 6 | 122 | 23 | 36 |
| **Total** | | **18** | **308** | **62** | **91** |

These are **representative test numbers only**, not an NRL, NSWRL, Oztag or Touch squad-size or minimum-staffing policy. They are not validated against age/sex/competition/season rules. They must not be used for actual match readiness.

Every team has: stable ID, club, association via club, sport, category, age group, fictional 2026 season, fixture ID, jersey-labelled players with sample positional preferences and RSVP; named fictional staff with Head Coach, Assistant Coach, Team Manager (plus Support in some teams); volunteers reflecting the sport (LeagueSafe/blue/orange trainer and ground marshal for Rugby League, field marshal/score table/first-aid/equipment support for Oztag and Touch). Staff and volunteers have **unverified** registration and accreditation. Shared fictional person IDs appear on more than one club team's support roster to exercise many-to-many memberships without accidentally merging role assignments.

Sample team names:
- Comets: Mixed, U14, U10, U12, U16, Women
- Stars: Women, U10, U12, U14 Girls, U16 Boys, Mixed Open
- Rangers: U16, U8, U10, U12, U14, Open Women

## Role-changing acceptance

- The P11 read-only organisation and club preview now uses the same 18-team source as P12, instead of maintaining four drifting team definitions.
- The P12 context preview shows a six-team club portfolio when acting as one nominated Club Admin, 12 team summaries for the Harbour Association and one team for a team-scoped coach/manager. Portfolio visibility is **fictional directory information**, not an inherited editing permission.
- QA-07 Head Coach has a second explicitly assigned Rangers team; QA-09 Manager has a second Comets team; QA-18 gains a Rangers U12 Coach and Comets U16 Manager assignment, in addition to previous club admin, Stars Manager, Rangers U16 Coach, association viewer, Comets support and memberships.
- Selecting a team-scoped role opens its specific full disposable test roster. The sample includes player statuses/preferences and individual fictional staff/volunteer descriptions. The simulated role holder can perform only actions the active role grants; switching identities/roles discards earlier sandbox edits.
- A fictional Team Manager may request an acting Trainer or Acting Coach fixture duty for a staff member. A sport-specific sample volunteer can also be proposed. The request records their previous role, exact fixture, original person ID, reason where applicable, and **unverified** accreditation, registration and staffing coverage; no permanent access/appointment is changed, and no scoring or publication is permitted.
- The final P12F policy engine still needs **approved source-aware checks** against the precise sport, grade, season, competition and on-field staffing overlaps before any claim of match readiness. Simulated role proposals in this PR are neither approved qualifications nor valid match assignments.

## Scope exclusions
- No accounts, passwords, parent identities, dates of birth, medical/WWCC evidence, private player records, real clubs, scraped images, registrations, notification, persistence or production role grant.
- No change to encrypted team data, storage schema, GitHub Pages build configuration or the existing real workspace.
- Production identity and server-side authorisation remain gated by [#55](https://github.com/pdomoney/team-manager/issues/55).

## Release verification
- [ ] Node unit suite, 18-team counts and role/relationship negative checks.
- [ ] Full 390px/820px/1280px Chromium suites including legacy P11 and P12, and capacity.
- [ ] Physical Safari/VoiceOver checked separately by owner.
- [ ] Owner reviews, merges, then exact-main Tests and Publish independently confirmed.

Before merge, test QA-04 Rangers Club Admin, QA-05 Comets vs Rangers club switch, QA-18 Rangers Coach vs Stars and Comets Manager, sample staff role-change proposal, QA-14 player-only no access.
