# P05A — Team, season and participation foundation

Parent: [P05 #47](https://github.com/pdomoney/team-manager/issues/47) | Roadmap: [#41](https://github.com/pdomoney/team-manager/issues/41)

Baseline: accepted P04D merge `6158455028277c03ffe873700d3934a49c3fe24c` (21 October 2026). Status: **scoping draft, not implementation acceptance**.

## Objective and sequencing
Establish a migration-safe canonical representation of Team, TeamSeason, PlayerParticipation and TeamAppointment while retaining schema-4 compatibility and all existing application behaviours. Deliver in separate owner-reviewed increments:
- **P05A**: inventory existing representations, specify canonical references and adapters, implement additive data-layer helpers and Node tests only after contract review. No user-facing changes.
- **P05B**: explicit multi-team/multi-sport player participation and independently managed team-local positions, jerseys and history.
- **P05C**: season rollover, staff appointment references, historical compatibility and full UI regression.

## Baseline inventory and non-negotiable invariants
- `site/model.js` already has `teamsOf`, `findTeam`, `personTeams`, `linkPlayerTeams`, `migrateWorkspace`, team-local `players`, `team.seasons`, and `seasonId` on relevant events.
- The first team currently lives at the workspace root. Preserve `team.enc.json` and `team-<id>.enc.json` compatibility; never silently move/delete root team data.
- `personId` may link explicit identity across teams, but local player IDs remain authoritative for attendance, match events, lineups, jerseys, positions, and archival records. Never merge by matching names or contact details.
- Club sport is a *default*. A team's explicit sport governs its positions, rules and participation context; cross-sport teams must not inherit the wrong position list.
- TeamSeason and PlayerParticipation references must preserve original IDs, historical snapshots, registration and season-state semantics. P04 People/guardian ledgers, their namespaces and encrypted projection exclusion are immutable compatibility inputs.

## Proposed P05A contract for review
Canonical **Team**: existing stable team ID, club reference, explicit sport/rules override, persistent presentation metadata. Avoid changing existing serialized property names until a verified adapter is in place.

Canonical **TeamSeason**: `{ teamId, seasonId }` stable compound reference. Current season and archived season are distinct; no implicit edit to completed history.

Canonical **PlayerParticipation**: `{ teamId, seasonId, playerId }` stable compound reference, optionally referring to the explicit person's `personId`. Team/season positions, number, registration, eligibility, jersey loans and returns remain local to that participation and existing records; never copy sensitive details automatically.

Canonical **TeamAppointment**: `{ teamId, seasonId, staffId, role }` association to stable P04C staff source ID, preserving historic display snapshots where required. Actual staff appointment migration is deferred to P05C.

Prefer pure read-only selectors and adapters initially, then narrowly scoped additive persistence only with tests and rollback. Do not create duplicate authoritative stores.

## Required P05A implementation and acceptance evidence
1. Contract and coverage tests for one person playing Oztag and League Tag with independent team positions, squad status, number, jersey issue/return and archival history.
2. Old schema 1/2/3/4 encrypted workspace opening and repeated `migrateWorkspace` idempotence; legacy root team retained.
3. New blank team has no imported coach, player, jersey or season records; template reuse requires deliberate selection.
4. Missing/dangling/colliding team, season, player and staff IDs rejected or reported rather than silently reassigned.
5. No cross-workspace inference, sharing or tenant security claims; no player-preview or legacy-export leak of coach-only reviews.
6. Multi-device merge conflicts, backup roundtrip, deterministic migration and downgrade/rollback behaviour documented and regression-tested.
7. Exact-head Node and Chromium GitHub Actions PASS, Safari/manual test where changes affect UI, explicit owner head acceptance, merge, and main Tests/Publish PASS.

## Scope exclusions and rollback
No frontend changes, no production identity/tenancy grants, no server migration, no Supabase requirement, no unverified official sports feed, and no post-P10 persona dropdown. Any real cross-club API access and guardian permission security remains deferred to [#55](https://github.com/pdomoney/team-manager/issues/55); persona selector remains [#62](https://github.com/pdomoney/team-manager/issues/62). Keep GitHub Pages and encrypted data branch through P10. Back up the encrypted coach workspace before migrating records. Feature data must remain backward-compatible, and rollback to accepted P04 baseline must be possible without loss of original sporting history.

**This first P05A PR is a contract/scoping checkpoint. Data-layer code and regression will follow only after the scoped contract is reviewed; no release gates are pre-approved.**
