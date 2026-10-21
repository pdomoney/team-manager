# P01 — Schema-4 coexistence, migration mapping and synthetic dry-run contract

**Status:** Design-only; nothing here migrates an actual user, publishes records or alters runtime schema.  
**Source:** accepted P00/P01 base main commit `1f9f9301a4ed2c6945d59dea5d3e4ca6316cc641`. **Target:** proposed canonical model in [p01-canonical-domain.md](p01-canonical-domain.md).  
**Demonstrator:** [test/p01-architecture.test.js](../../test/p01-architecture.test.js), [test/support/p01-projector.js](../../test/support/p01-projector.js). Its data and mappings are synthetic, non-production, in-memory and do **not** persist to a backend.

## 1. Migration phases

1. **Discovery / inventory:** read encrypted schema-4 backup only in an explicitly authorised local context; calculate record counts, stable references, field classifications and discrepancies. Avoid names/phones/DOB in logs. No reads from production were performed in P01.
2. **Preflight:** prove valid original encryption, deterministic source manifest and a restorable encrypted backup; validate existing IDs and link references; detect duplicates, orphaned team/season/competition references and conflicting explicit personId.
3. **Dry-run projection:** create *provisional* People for each source person record; only exact explicit player personId within the **same** legacy workspace is eligible for one provisional group. Reuse owner-scoped legacy keys for repeated imports. Name/email/phone similarity is **not evidence** for linking.
4. **Review queue:** show possible duplicate humans, club ownership, match-staff-to-team role associations, guardianship, registration eligibility and venue/fixture conflicts as unresolved **manual review required**; assign no permissions or identity claims.
5. **Controlled import (future, not P01):** after P02 backend denies unauthorised access, write staged canonical records in a transaction, preserve old IDs in LegacyReference and emit a complete reconciliation manifest; require owner confirmation for disputed person/club/guardian links and club data-space moves.
6. **Shadow read / compare:** verify application views, historical seasons, kits, matches, tasks, lineups, competition links, library revisions and private-to-player projections against original; no changes to old encrypted files yet.
7. **Opt-in cutover:** owner-approved per tenant; freeze/flush concurrent edits, back up, switch appropriately scoped users to new storage behind feature flag, verify access-denied and ability to revert.
8. **Rollback:** restore old encrypted backup and original accepted frontend for users not migrated, or reversible shadow adapter and backend snapshot for committed tenants; never rely solely on changing a client flag when canonical writes changed.

## 2. Detailed legacy mapping

| Legacy source path | Target entity | Identity / relationship rule | Preserve / review |
| --- | --- | --- | --- |
| Workspace (root team, schema 4) | DataSpace owned by provisional individual | Stable owner-scoped workspace key | Never claim organisation ownership automatically |
| `ws.clubs[]` | Organisation(type=club) **candidate** | LegacyReference workspace + club.id | Public research `directoryMatch` only provenance, no affiliation grant |
| `ws.team` at root + `ws.teams[]` | Team | Scope to source workspace and legacy team.id; team.clubId resolved only if exact local club exists | Keep root-first-team compatibility and archives |
| `team.seasons[]` | TeamSeason | Stable team.id + season.id | Preserve old year, status, dates, staff snapshots, defaults |
| `team.players[]` | Person provisional + team PlayerRecord snapshot | Unique composite legacy team.id + player.id; **explicit** `personId` shared within source workspace may link provisional Person | No automatic cross-club verification; preserve contacts/photos privately |
| `season.squad[]` | Participation | Composite team.id/season.id/playerId | Keep local number, positions, status, registration; never globalise |
| `player.jerseys[]`, `jerseyCorrections[]` | JerseyLoan and CorrectionLedger | Composite team/player/loan.id or correction key | Keep out/back, old number, corrections, even for departed players |
| `team.helpers[]` | Provisional Person + HelperAppointment | Unique team/helper.id | relation + playerId generates only *potential guardian relationship* in review queue, no permission |
| `ws.matchOfficials[]` | Provisional Person + SportQualification/Registration evidence candidates + appointments | Unique workspace/official.id, clubIds/teamIds retained as raw facts | Qualification/WWCC statuses remain coach-asserted; **not independently verified** |
| `club.officials[]` | Historical/active OrganisationAppointment candidate | Composite club ID and row index when no source person ID | Never join to other Person by contact similarity; snapshot exact text |
| `team.team.staff[]` | TeamAppointment candidate | Composite team ID and row index | Never grant admin automatically |
| `season.staff[]` | Staff snapshot/appointment candidate | Composite team, season and row index | Historic snapshots remain accurate |
| `ws.competitions[]` | Competition | Scope original comp.id and source workspace | Currently coach-managed; organiser/authority unverified |
| `comp.entries[]` | CompetitionEntry | Exact comp/entry id, teamId, seasonId | Preserve division/pool and withdrawn state |
| `team.matches[]` | MatchRecord / proposed Fixture link | Exact team/match ID + optional entryId | Preserve friendly, result, lineup, match crew, coach notes private |
| `team.sessions[], tasks[], notices[], messages[]` | ScheduledActivity/Communication/Task | Keep linked sessionId, matchId, seasonId and task assignee tokens | Preserve cancellation, attendance, replies and original actor attribution |
| `team.plays[], systems, lineups, playerSets` | Content/Revision/Team assignment | Preserve ID, lib link/revision/edited state | Do not copy personal/club content without explicit rights |
| `ws.library` | Personal workspace content library | Read-only under provisional owner until consented grant | Do not automatically publish to clubs |
| `club.logo/style/colours` and `team.style` | Organisation branding / Team override | Exact validated values and independent override | No reconstruction of third-party logos |

### Not every old record becomes a global Person

The projector produces one provisional person per known explicit player personId group, and per unlinked player/helper/match official source row. Embedded club/team/season staff rows yield *appointment candidate snapshots* **without** a Person association. A canonical verified global Person and Account are created only via a later controlled identity-confirmation workflow. All source records remain visible in a provenance manifest.

## 3. Legacy keys and import state

Migration key convention **for planning only**:

```
sourceKey = JSON.stringify([sourceWorkspaceId, sourceRecordKind, ...sourcePathIds])
```

Examples:
- `["oldws-1","team","team1"]` for root team.
- `["oldws-1","player","team1","p001"]` for a player record.
- `["oldws-1","player-person-explicit","person:team1:p001"]` for an explicit old personId group.
- `["oldws-1","club-official","club-a",0]` for a legacy named staff row.

The actual target IDs will use generated UUIDs recorded in LegacyReference, with unique `(import_batch/source_workspace, kind, source_path)` or equivalent. On retries the same key maps to the same target ID; no duplicated participation or chargeable seats. Context-qualified keys prevent different coach workspaces' identical old IDs from colliding. The demonstrator keeps keys as deterministic strings, without pretending to exercise a real database transaction.

**Side-effect rule:** projection must not mutate the source workspace, create accounts/role grants/guardian privileges, contact anyone, generate real credentials, query public identity services or write source files.

## 4. Validation before any future release

- Every original club/team/player/season/comp/entry/fixture/crew/jersey record counts to exactly one preservation manifest reference (or independently documented review reason).
- All legacy foreign keys verified; orphan or ambiguous references must block automatic linking, not silently turn into a new role.
- Import twice: identical deterministic output, **no** additional people, approvals or subscriptions.
- Distinct people with the same name remain separate; explicit linked personId joins only within the authorised original workspace.
- Synthetic guardian field in a Helper record yields a **review candidate**, never approved guardian access.
- Existing club directoryMatch references remain research provenance, not affiliation or official registration approval.
- Official match staffing readiness remains derived from current, approved age/competition/sport policy and manual verification, not migrated as an unqualified live fact.
- Staff appointments, historic season values, kits, results and edited coach plays retain exact source facts and privacy labels.
- Coach-only fields stay absent in player projections; all cross-organisation access enforced by backend before cutover.
- Backups: round-trip restore into historical app proven on synthetic and authorised future tenant backup before cutover.
- Performance, storage size, concurrency/merge conflict and Australian data residency evaluated before real accounts.

## 5. Rollback and migration ledger shape (planned)

Required audit states: `inventory`, `preflight_ok`, `projected`, `needs_review`, `approved`, `staged`, `validated`, `cutover`, `rolled_back`. Record exact old backup hash and encrypted storage location, approved owner, tool/version hash, source manifest counts, target row counts, original→new keys, unresolved review queue, independent verify report and rollback evidence. Logs redact personal contents. Partial batches stop rather than publish.

The implementation must be staged through P02–P10. **P01 does not contain a data migration script for live data**; it produces an in-memory synthetic verification artifact for evaluating the design.
