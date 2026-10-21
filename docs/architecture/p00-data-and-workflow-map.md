# P00 — Forms, data ownership, workflow overlap and risk register

**Status:** Candidate findings, no source changes or migration. **Baseline SHA:** 1c5a69bd4660941b0a656a612f41022ba5ec37a3. Companion: [preservation register](p00-baseline-and-preservation.md). This document is the working answer to **what is duplicated**, **what remains distinct**, and **which next phase owns the repair**.

## 1. Exhaustive static form-ID inventory (48 distinct IDs)

Extracted from literal data-form attributes in **site/app.js**. The same form identifier can occur in multiple branches. These are **form identifiers**, not a complete list of every dynamically constructed form control or navigation route.

| Group | Form IDs (exact source IDs) | Count | Ownership proposal |
| --- | --- | ---: | --- |
| Access, persistence and configuration | unlock, setup, github, team-pass, coach-pass, go-live, merge, reset, settings | 9 | Authentication/permission and persistence services (P02/P10); common settings UI (P09) |
| People, player participation and staff | player, player-link, bulk, crew-directory, crew-intake-start, crew-manual, crew-existing, crew-invite-draft, crew-basic, crew-person, crew-policy, crew-match, helper | 13 | Person and participation services (P04/P05); compliance (P06); shared intake (P09) |
| Club, team and season | club, club-branding, team-new, season, season-next, season-squad | 6 | Organisations (P03), teams/seasons (P05), shared forms (P09) |
| Scheduling and communications | session, task, task-checklist, task-copyday, match, match-day, match-lineup, match-result, comp, comp-entry, comp-link, notice | 12 | Events/competitions (P07), task policy (P06), interface (P09) |
| Coaching, rules and tactics | system, slot, transfer-choose, transfer-notes, pset, play, rules-review, bylaw | 8 | Sport content, rule sources and tactics editor (P08) |
| **Total** | **48 distinct form IDs** | **48** | **Do not delete old forms until replacement equivalence is tested** |

The declared controller also includes roughly **279 string-keyed action handlers** plus dynamic button/data actions and **336 named functions**. These counts are not proof of duplicated business behaviour. The actionable duplication is documented below.

## 2. Form/field overlap map

| Duplicate field or state | Currently editable / stored in | Authoritative target | Retain as contextual snapshot? | Decision / phase |
| --- | --- | --- | --- | --- |
| Person name and contact | Player, Helper, crew-manual, crew-basic, crew-person, team.staff, club.officials, season.staff | Person with controlled contact channels | Yes, audited historical staff/season display where warranted | P04 |
| Photo | Player photo/crop, crew volunteer portrait; helpers have no equivalent | Private Person photo with consent and context-specific visibility | Historic player image only if necessary and authorised | P04/P09 |
| Guardian connection | Helper playerId and relation text | Explicit GuardianRelationship linked to specific minor and authorised action | Keep previous helper task history | P04 |
| Organisational affiliation | crew clubId/clubIds, team.clubId, club-directory directoryMatch | Organisation memberships and sport/team appointments; research link separately | Keep research provenance, old memberships | P03/P04 |
| Staff role label | Club officials, team staff, season staff, match volunteers | Appointment or assignment with scope, dates and permission independent of job | Yes, past season/match attribution | P04/P06 |
| Trainer registration / accreditation | Crew legacy registration/accreditation, registrationBySport, accreditationBySport and team squadYears | Per-sport, per-season eligibility evidence referencing Person | Retain immutable review evidence and expiry history | P06 |
| Sport designation | Club default, team override, competition sport, rules/play sport | Sport taxonomy + explicit team/competition context | Yes, historic season context | P05/P08 |
| Position and jersey | Player defaults, season squad number/positions, team kit loans | TeamSeason participation + jersey loan ledger | Yes, history is vital | P05 |
| Team and fixture event name/date/venue | team.event/eventStart/eventEnd/venue; competition fields; match records | Organiser-controlled event with explicit local overrides | Preserve original fixture/result snapshots | P07 |
| Rules | Global sourced rules pack, team.rules, team bylaws, competition bylaws, match crew policy | Source rule version + context-specific authorised deviations | Preserve accepted match/season policy evaluation | P06/P08 |
| Library contents | Workspace systems/plays/playerSets and team copies | Shared content with owner, revision and explicit copy/link | Yes, team edits and taught version history | P08 |
| Generic staffing/tasks | Helper task first-aid kit and accredited match first responder | Separate general task versus regulated match assignment | Preserve task responses and role assignments | P06 |
| Branding | club.logo/style/colours and team.style/colours | Club defaults with deliberate team override | Yes, historical profile when applicable | P03/P09 |
| Team selection context | Home tile, team picker, match staff selector, settings, tactics preview | One explicit active context with server-authorised scope | UI preference is local, NOT an access grant | P02/P09 |

A canonical Person record is **not** permission to mix private data across clubs. Matching remains user-approved and must require a lawful/consented basis. Medical/injury details, junior guardian relationships, accreditation and any contact data should have separate access controls.

## 3. Current lifecycle and ID references

| Record | Important lifecycle / reference | Never do silently |
| --- | --- | --- |
| Team | Stable ID; archived versus active; first team remains workspace root in schema 4 | Renumber teams, assign a new owner or move between clubs |
| Club | Stable club ID; team.clubId foreign-key-like reference; directoryMatch candidate ID optional | Infer ownership or official verification from directory names |
| Player | Team-local ID, optional linked personId, season.squad.playerId and lineup slots playerId | Auto-identify players by name, overwrite positions, jerseys or phone across teams |
| Helper | Team-local helper ID, optional linked playerId; task assignee uses h:<ID> | Assume helper is an authorised guardian or match-qualified trainer |
| Match staff | workspace.matchOfficials person ID, clubIds/teamIds, role/qualification collections | Auto-allocate across clubs, auto-confirm sport registration, use a match assignment twice |
| Season | Season ID, squad player refs; planned/active/completed/archived transitions | Delete completed history, automatically roll over staff or players |
| Competition | ID, team/season entries IDs, match entryId/compId references | Fabricate official fixtures or change linked match history without approval |
| Match | Team-local match ID, crew personId refs, lineup ID, entry link, result | Conflate a friendly with an official fixture |
| Tasks | Team-local task ID, people assignee IDs and response states, sessionId/matchId | Lose assignee response history or break event attachment |
| Tactics | Team play IDs, lib copy IDs/revisions, lineups/player sets | Replace edited team plays with global library changes |
| Encryption and roles | coach.enc.json versus team.enc.json and team-<ID>.enc.json | Publish private contact, guardian, injury, coach notes or accreditation in a player file |

**Conflict and schema consequences:** the current merger keys records by team and collection with explicit local/remote conflicts (model.js records/merge3/resolve). A future Person table cannot simply replace nested records without a stable mapping and policy for concurrent edits.

## 4. Contextual workflow map

1. **Association user (not implemented securely):** association logs in → sees affiliated clubs and aggregate summaries → delegates club admin → views competition records. Existing coach multi-club listing is **not** a substitute.
2. **Club administrator (not implemented securely):** club logs in → appoints staff → approves teams → manages associated people and compliance → checks fixtures. Current prototype uses one broad coach mode.
3. **Independent coach/manager (partially supported):** unlocks own workspace → selects own team/club → edits squad/schedule/tactics → publishes player view. Distinct coach-v-manager permissions do not yet exist.
4. **One user across multiple clubs (partially supported):** coach can switch club teams in one local workspace; a match volunteer can be linked to different local clubs. Future secure multi-tenant join, explicit grants, account acceptance and revoke must be new backend behaviour.
5. **Player (currently limited):** receives the per-team shared password/view; sees team player projection, lineups/schedule/plays. No secure personal login or self-service account changes.
6. **Minor and guardian (not implemented as independent permissions):** helper linked to a team player may assist tasks, but this is **not** an authorisation for access to the child's records.
7. **Match volunteer (recording/planning only):** club-first entry or existing entry or email draft → team/sport qualification and season registration recorded manually → match role assigned and readiness checked. No governing-body registration API or official certification.
8. **Organiser and competition:** coach creates competition/tournament record → team enters season → fixtures linked manually → team manages result and match staff. No external feed should become authoritative by inference.
9. **Coach content owner:** creates or edits play/system → saves to local/shared workspace library or copies into team → team-specific version remains; public library scope does not yet exist.

## 5. Risk and dependency register

| ID | Severity | Risk | Evidence in source | Protective rule / next gate |
| --- | --- | --- | --- | --- |
| R01 | Critical | Single coach password authorises entire workspace, not per club | app.js S.role/isCoach; roles-and-login.md | P02 server-side grants and denial tests |
| R02 | Critical | Multi-club affiliation does not imply verified access and may expose unrelated data within coach copy | model.js workspace club references; volunteer-intake.js | P02/P03 tenant boundaries |
| R03 | Critical | One person fragmented across six types of record | player/helper/club/team/season/crew models | P04 explicit identity matching with rollback |
| R04 | Critical | Guardian/helper link does not establish legal guardian permission or junior privacy safeguards | helper.playerId, relation | P04 consent and guardian tests |
| R05 | High | Embedded historic staff fields conflict with canonical identity | normSeason.staff, team.staff, club.officials | P04/P05/P06 migration with snapshots |
| R06 | High | Sport qualification is not a club role or match attendance confirmation | match-crew.js and volunteer-intake.js | P06 eligibility vs appointment tests |
| R07 | High | Multi-sport default positions/rules differ at club, team, competition and event levels | model.js, rules.js | P05/P08 explicit source and override order |
| R08 | High | Competition fixture names/dates and legacy team event fields can drift | model.js syncEvents, linkMatch | P07 event authority and reconciliation |
| R09 | High | Replacing root-first-team structure could break legacy IDs, encryption, app load and merging | model.js migrateWorkspace/teamsOf/merge3 | P01 migration design, P10 verified migration |
| R10 | High | Password-protected coach files are not a secure shared multi-tenant backend | vault.js, github.js | P02/P10 auth/persistence architecture |
| R11 | High | Sensitive exports / player projections must not include volunteer/health data | vault.js teamView allowlists | P02/P04/P10 privacy regression |
| R12 | Medium | Repeated form code causes inconsistent validation and mobile UX | 48 form IDs in app.js; Issue #24 | P09 shared UI components |
| R13 | Medium | Library ownership/permissions currently tied to coach workspace | model.js normLibrary/lib* | P08 explicit personal/club/association content scope |
| R14 | Medium | Directory candidate research can be mistaken for official registration/brand right | club-directory.js/club-link.js | P03 retain source and manual confirmation |
| R15 | Commercial | Public MIT source and hosted subscription rights need separate policy | LICENSE and repo | P03 commercial/legal review |
| R16 | Qualification | Main push browser skips synthetic capacity; physical Safari is untested | test.yml; browser run_all.py | PR full suite + owner device acceptance |

## 6. Recommended retirement approach (none approved yet)

1. Mark redundant intake **entry points** for deprecation only after the new Person flow can create every previous variant and link all existing records.
2. Do not remove helper/person/crew, team.staff, season.staff, or club.officials collections during P00. In P01 define an **adapter** preserving historic readers and referential integrity.
3. Do not remove team-event fields until a P07 competition authority reconciler handles old unlinked fixtures.
4. Do not replace shared coach/team passwords and GitHub encrypted publishing until secure backend, migration, backup, recovery and cutover are tested.
5. Keep specialist sport-match and play-editor controls separate from universal form primitives.

## 7. Repository reference

- [app.js](../../site/app.js) owns most UI/form entry points, event dispatch and state.
- [model.js](../../site/model.js) owns workspace/competition/team/season, jerseys, reports, library and merges.
- [match-crew.js](../../site/match-crew.js), [volunteer-intake.js](../../site/volunteer-intake.js) implement match role and intake constraints.
- [vault.js](../../site/vault.js) defines player-copy projection, [github.js](../../site/github.js) and [src/build.js](../../src/build.js) handle encrypted publishing boundary.
- [test/](../../test/) is the regression safety net; do not replace it wholesale.

**Next:** Review proposed authority for Person and Organisation in P01. This P00 inventory does not authorise merging people, changing access controls or changing any production data.
