# P00 — Accepted baseline and feature preservation inventory

**Status:** Draft for owner review, not accepted or merged. Documentation only.  
**Parent:** [Roadmap #41](https://github.com/pdomoney/team-manager/issues/41), [P00 #42](https://github.com/pdomoney/team-manager/issues/42).  
**Source pinned to main:** [1c5a69bd4660941b0a656a612f41022ba5ec37a3](https://github.com/pdomoney/team-manager/commit/1c5a69bd4660941b0a656a612f41022ba5ec37a3) (PR #40 merge, 21 October 2026).  
**Scope:** static repository and prior CI evidence review; no new application changes, actual customer records, login testing, physical-device testing or acceptance claims.

## 1. Baseline and objective

The product is currently a GitHub Pages static application with a shared coach-workspace password and per-team player passwords. Full coach data is stored locally as an encrypted draft and published as encrypted coach/team role-specific files on the repository data branch. The coach workspace is not a platform-level tenant, and managed club associations are not secure organisation permissions.

- Workspace schema **4**; model in [site/model.js](../../site/model.js), first team at the top level of workspace and additional teams under teams[] for historical backwards compatibility.
- Main UI/controller [site/app.js](../../site/app.js) is approximately 7,986 lines, containing **336 declared named functions** and **48 distinct static form IDs** in source. These are source-structure figures, not count of visible screens or duplicate functionality.
- Reference directory includes research candidates for Rugby League and Oztag. References are **not authoritative current registration**. User-confirmed matching from PR #40 stores research provenance without creating club permissions.
- The latest baseline [Tests workflow](https://github.com/pdomoney/team-manager/actions/runs/39519227151) passed **193/193 Node tests**, **1001/1001 Chromium browser assertions** across **28/28 browser suites**. This was a **main push** run, so synthetic 100-photo capacity is **not included** in the browser job. The full capacity suite is required on P00's PR qualification, and is not implied by these counts.
- Baseline [Publish workflow](https://github.com/pdomoney/team-manager/actions/runs/39519227207) passed for the pinned source. Publication success confirms workflow completion, **not** that a genuine user's encrypted data, new accounts or organisation permissions were verified.

## 2. Functional retention register

**Policy: retain every accepted capability unless the owner separately authorises retirement after a proven replacement.** A future schema is not an instruction to delete old fields or existing source modules.

| ID | Capability in current main | Principal source | Disposition | P-phase |
| --- | --- | --- | --- | --- |
| F01 | Coach trial, shared-password coach unlock, team-only player access and role-limited published view | app.js, vault.js | Retain while secure individual auth is developed; then controlled migration | P02/P10 |
| F02 | Multi-team coach workspace, Home contextual urgency and team/club navigation | app.js, model.js | Retain, scope by future role grants | P03/P09 |
| F03 | Managed clubs: identity, contacts, colours, logo, style inheritance and sport defaults | model.js, team-style.js, app.js | Retain, attach organisation/ownership model | P03/P05 |
| F04 | Public club research filtering and manually confirmed blank-only detail reconciliation | club-directory.js, club-link.js | Retain; research does not grant membership or verification | P03 |
| F05 | Team creation, club membership, sport override, explicit safe setup reuse | model.js, team-setup.js, app.js | Retain; eliminate repeated team setting fields | P05/P09 |
| F06 | Player records, photo crop, positions, availability and team-specific sport context | app.js, model.js | Retain; introduce a person identity and separate participation | P04/P05 |
| F07 | Explicit cross-team player linkage, no name inference, isolated team jersey/position history | model.js, app.js | Retain IDs and link semantics | P04/P05 |
| F08 | Jersey issue, return, undo/correction, inventory and reports | model.js, app.js | Retain event/history and team scope | P05 |
| F09 | Planned/active/completed/archived team seasons, rollover, historical corrections and registered status | model.js, app.js | Retain immutable historical meaning and season-specific membership | P05 |
| F10 | Club/coach-person match staff records, sport-role registration/qualification, WWCC check and badges | match-crew.js, crew-badges.js, app.js | Retain; consolidate human identity, not sport eligibility | P04/P06 |
| F11 | Match-day staffing minima, role constraints, distinct-person requirements, manual accreditation evidence, clashes | match-crew.js, app.js | Retain; centralise policy context and auditing | P06 |
| F12 | Helpers, tasks, BBQ/gear/lifts, sign-up states, transport seats and volunteer load | app.js, model.js | Retain; unify people while keeping task-specific status | P04/P06 |
| F13 | Fixtures, training, attendance, RSVP, match result, match-day views, cancellation and linked tasks | app.js, model.js | Retain; share scheduling primitives | P07 |
| F14 | Competition formats (league, knockout, round robin, championship, carnival), team/season entries and fixture linking | model.js, app.js | Retain; define authoritative event owner | P07 |
| F15 | Sport-aware rules, rule-book source links, updates, approved rule packs, team/competition by-laws | rules.js, model.js, rules-watch | Retain, versioned per sport/season context | P08 |
| F16 | Coach tactics, field diagrams, lineups, play editing, animation, learning, cross-sport adaptation | app.js, play-study.js, play-teaching.js, play-transfer.js | Retain; isolate specialist editor after policy layers | P08 |
| F17 | Shared coach-workspace plays/systems/player-set library, explicit copy and revision behaviour | model.js, app.js | Retain; add explicit personal/club/association ownership | P08 |
| F18 | Messaging drafts/WhatsApp, notices, tasks, participation reports and seasonal summaries | app.js, model.js | Retain; integrate scoped access | P06/P07/P09 |
| F19 | Offline/trial local storage, encrypted drafts, backup/restore, conflict resolution and publishing | app.js, github.js, github-settings.js, vault.js, src/build.js | Retain and verify until P10 replacement and rollback accepted | P02/P10 |
| F20 | Synthetic test library, model/Node tests, Chromium journeys, encrypted publishing mocks, Rules watch | test/, site/test-library.js, .github/workflows/ | Preserve as qualification minimum; extend negative-access coverage | All |

## 3. Existing people and record boundaries

Current sources have **different person representations**; there is no single authenticated real-person directory.

| Representation | Current storage / identity | Owns distinct contextual data | Risk of duplicate people |
| --- | --- | --- | --- |
| Player | team.players[], stable team-local player ID; optional linked personId | team-specific number, positions, availability, photo, jerseys, season squad, attendance | Also coach, volunteer, helper, or player at another club |
| Helper / informal guardian | team.helpers[]; task links use h: + helper ID | task/contact and optional linked playerId, relation | One parent may be helper in multiple teams; not a formal guardian grant |
| Match-day personnel | workspace.matchOfficials[], person ID, clubId/clubIds, teamIds | accreditation/registrations by sport, shirt roles, verified status, clubSince, WWCC status | Also team.staff, season.staff, club.officials, helper |
| Club executive / support | club.officials[] embedded role/name/contact | office appointment under one club | No identity/account link to match staff |
| Team staff | team.staff[] embedded role/name/contact | team coaching/admin contact | Can duplicate club/crew directory person |
| Historic season staff | season.staff[] embedded role/name/contact | past season staff snapshot | May differ intentionally from current appointment |

**Preserve:** domain-specific player and staff history. **Consolidate later:** core person identity and contact ownership via explicit links with proof, consent and organisation permission. **Do not auto-merge:** similar names, phones, emails, portraits or matching club association. Do not turn a staff qualification into an administrator permission.

## 4. Organisation and event relationships

Current model relationships:

- Workspace root contains the first team, additional teams[], clubs[], matchOfficials[], competitions[] and library; team.team.clubId references a managed club.
- A managed club may have a user-confirmed directoryMatch for public *research* provenance; public directory entries themselves do not grant identity, affiliation or permissions.
- Team-season squad memberships reference team-local player IDs, not a global person identity.
- Competition entries reference team ID plus season ID and division/pool. Matches link to entries (entryId, compId); historical standalone matches are allowed.
- Team and competition event date/name/venue fields may be synchronised, so duplicated event values need an authoritative future owner and migration conflict policy.
- Individual club record is within the *coach* copy; associations have no distinct ownership/account boundary.
- Current library is workspace-owned (plays, systems, playerSets), not personal-vs-club-vs-association authored content.

Do not infer external fixture feeds or official accreditation confirmation where none exists.

## 5. Licensing use-case coverage

| Scenario | What is currently demonstrable | Not implemented in this baseline |
| --- | --- | --- |
| Association owns licence | Coach can locally manage several club references and teams | Association account, affiliated club admins, enforcement, delegated visibility, billed entitlements |
| Club owns licence | A coach can manage several teams attached to the same club | Club-owned tenant, independent managers, per-club rights, audit and compliance across all club teams |
| Individual coach/manager licence | Multi-club, multi-team, multi-sport coach workspace and personal tactics library | Individual auth, secure separated roles, personal ownership independent of clubs, manager-specific login |
| One person appointed across licensed clubs | Manually related volunteer/player records inside **one** coach workspace | Identity linking across real organisation tenants, independently approved role grants, revocation and consent |

A club association, a subscription purchaser and an authorisation grant must be separate records. Coach-mode role flags and UI filters must not be mistaken for tenant security.

## 6. Sources and outstanding decisions

Core: [app.js](../../site/app.js), [model.js](../../site/model.js), [vault.js](../../site/vault.js), [match-crew.js](../../site/match-crew.js), [volunteer-intake.js](../../site/volunteer-intake.js), [club-directory.js](../../site/club-directory.js), [club-link.js](../../site/club-link.js), [rules.js](../../site/rules.js), [src/build.js](../../src/build.js).

Recorded product proposals and limitations: [roles/login](../roles-and-login.md), [club-first volunteers](../club-first-volunteer-intake-pr23.md), [match-day staff](../match-day-staff-20261019.md), [cross-team players](../cross-team-player-release-20261018.md). Relevant open issues: [#35](https://github.com/pdomoney/team-manager/issues/35) secure individual roles, [#34](https://github.com/pdomoney/team-manager/issues/34) club-admin navigation, [#24](https://github.com/pdomoney/team-manager/issues/24) form consistency, [#31](https://github.com/pdomoney/team-manager/issues/31) sport-aware Match Day.

**P00 decision needed before P01:** agree that an individual Person is separate from their login Account, team-season PlayerParticipation, organisational Appointment, match-day Assignment and verified sport Eligibility; and agree that an association cannot automatically view all private club/member data. Formal architecture decisions belong to P01.

This inventory is a **baseline proposal**, not a migration approval, security certification, Safari validation or product-owner acceptance.
