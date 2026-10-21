# P04C — Opt-in durable staff IDs and reviewed identity references

**Phase:** P04 [#46](https://github.com/pdomoney/team-manager/issues/46).  
**Parent baseline:** merged P04B [PR #60](https://github.com/pdomoney/team-manager/pull/60) at `553289b77b161d3bec1f7515f42583443ec0eda1`.  
**Status:** separate candidate PR; not yet accepted. Does NOT complete P04.

## Why this PR is necessary

Existing club officials, team staff and historical season staff were represented by their **position in an array**. If a coach reordered or removed a row, the position could begin referring to another human. P04A/P04B deliberately excluded these snapshots from durable review linking.

This PR introduces a controlled, explicit **Prepare staff records** action in the coach-only **More → People** page. It generates a unique cryptographically random ID for each legacy club official, team staff and season-staff row that does not yet have one. IDs remain **source-record IDs**, not canonical Person IDs or authentication identities.

## Behaviour

- Readiness counters show prepared/missing staff IDs. A coach receives a confirmation explaining that each row receives its own identifier, and can export an encrypted coach backup before preparing.
- The pure `prepareStaffSourceIds` operation creates a new workspace copy and stamps missing rows only. It detects missing/duplicate team/club/season keys, duplicate or malformed staff IDs and random-ID collisions; on failure it does **not** save partial changes.
- The app reselects the previous team after replacing the workspace, then uses its existing `save()` path: encrypted local draft and existing encrypted GitHub `data` branch publishing.
- Existing staff IDs are idempotently preserved; club edit and team settings forms carry hidden `o-id` / `st-id` fields so an ordinary subsequent edit does not accidentally erase prepared IDs. `normClub` / `normSeason` also preserve IDs across migration, refresh and backup restore.
- The P04 person source index now uses canonical `staff-<UUID>` IDs rather than numeric positions where those IDs exist. P04A ledger validation and live-workspace recheck support these **exact** staff references, even after rows reorder. Unprepared numeric-index staff references remain **read-only** and cannot be saved as reviewed links.
- The normal P04B People review form can now propose an explicit review between prepared club/team/season staff and another eligible person record. It retains separate legacy appointments, roles, phones, emails, qualifications, jerseys, attendance and season histories. It does **not** automatically join equal names or create permissions.
- All user-visible people history stays coach-only. Player `teamView` still publishes only staff name/role, not stable IDs or contact information.

## Security, consent and historical safety

The current GitHub Pages/shared-coach-password deployment does not have independent member authentication. `reviewedBy: Shared coach workspace` is an audit label, not a verified reviewer identity. All decisions and minted IDs are **within one already-authorised coach workspace** only.

A recorded person review is a local assertion, not verified legal identity. A helper linked to a junior player is still an **unverified guardian candidate**; this PR grants no guardian self-service, permission or child record access. Full guardian relationship workflow and related safeguarding review remain separate P04 follow-up work. Real verified guardian accounts and cross-tenant RBAC are explicitly post-P10 #55.

### Multi-device consideration

Both phones must sync the accepted encrypted workspace before preparing staff IDs. If two independently assign IDs to the same unprepared legacy row, these are conflicting new source identifiers and **must be manually reconciled through the existing encrypted workspace conflict workflow** before confirming person links. Never silently reconcile independently minted IDs by matching names. Importantly, the earliest/stable source ID should remain authoritative after human resolution.

### Rollback

Export an encrypted coach backup **before** preparing. The operation is additive, adds ID fields only to existing staff records and never migrates or deletes sporting or private fields. Restoring the pre-preparation encrypted backup returns the previous staff rows but loses the new reviewable IDs and any subsequent local review references. Restoration should therefore be intentional with a record of newer changes; do not overwrite a teammate's edited online workspace.

An older application may not preserve new staff IDs through `normSeason`, `normClub` or edit forms, so keep the accepted current version and encrypted backup if rolling back. This PR does not change file paths, crypto or publishing provider.

## Qualification

- [ ] Exact-head Node regression PASS, including pure opt-in mutation, repeat, invalid/duplicate IDs, stale/remapped rows, staff review/reversal, explicit collision rejection, legacy jersey/squad/attendance and privacy isolation.
- [ ] Exact-head browser test and capacity suites PASS; a new dedicated People staff-preparation browser exercise is required before acceptance.
- [ ] macOS/iPhone Safari manual preparation and review demo complete.
- [ ] Owner explicitly accepts the correct PR SHA; owner merges, then main Tests and Publish green.
- [ ] P04 #46 remains open for explicit guardian relationship management, historic privacy and final P04 acceptance. P05 starts only after that.

**No Supabase/backend migration before P10.**
