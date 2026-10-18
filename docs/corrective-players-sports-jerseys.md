# Players, Sports & Jerseys — Accepted Corrective History / Multi-LLM Handoff

**Final status (18 October 2026):** PR #9 and its publishing follow-up PR #10 are **merged**. PR #11 selectively brought forward compatible additional qualification and storage-recovery work. PR #8 is **closed without merging**. The authoritative, automated-test-passing development baseline is [`main` at `960212fdb3c6`](https://github.com/pdomoney/team-manager/commit/960212fdb3c6bfcf73bbb3c2160aa21ac2ea07e6). See [completed merge reconciliation](merge-reconciliation-20261018.md) and [current release record](release-record.md). The detailed development notes below preserve historical context; they are not outstanding merge instructions.
**Repository:** `pdomoney/team-manager`
**Baseline main:** `f1822a84224195a485fc275c21b617ebc28a1fc8` (PR #7, Players and Sports)
**Development branch:** `corrective/players-jerseys-sports-20261018`
**Historical branch:** The listed corrective branch is a reference to the original PR9 development work, not the authoritative live baseline. Always verify latest `main` before new changes.
**Scope:** Additive corrective work only; no auth, server, schema replacement, or full UI redesign.

## Problem statement

Review of PR #7 confirmed that forms, sport lists, photographs, return-tracking and active-competition Home cards were implemented, but found these outstanding issues:

1. `save()` called `syncJerseys()` after deleting an issue, recreating the very jersey issue that the coach deliberately corrected.
2. `jerseyReport(t, seasonId)` used outstanding issues from **any** season to determine a selected season's historical status.
3. `positionsFor()` preferred stale Oztag defaults, even on rugby league/netball teams. The Settings save handler changed `clubId` before recording the old effective sport.
4. Photo sizes multiplied inside encrypted coach copies, local drafts, and their conflict-resolution base snapshots; storage capacity was not qualified.
5. Safari form/photo operation and real-device storage had not been verified; browser suites existed but CI only ran `npm test`.
6. Active competitions needed an explicit explanation that Home only displays competitions containing an entered team in its **active** season.

## Corrective implementation

### Model: `site/model.js`

- `correctedJersey(p, seasonId, number)` recognises durable, season-and-number-specific `player.jerseyCorrections` tombstones.
- `removeLoan(p, id)` removes an incorrect issue and records that correction. `syncJerseys()` respects it through subsequent saves, migration, reload and device synchronisation. `issueJersey(p, number, seasonId, today)` permits a deliberate subsequent reissue.
- Existing valid issues, returns and issue dates are retained. Previously stored players gain an empty `jerseyCorrections` list during normalisation.
- `jerseyReport(t, sid)` now reports issues **originating in the selected season**. `jerseyInventory(t)` independently reports everything outstanding today and identifies former squad members.
- `positionsFor()` recognises sport-default lists inherited from other sports. `positionsCustom` makes explicit overrides stable; recognised legacy defaults migrate deterministically, ambiguous custom lists are preserved.
- `changedSportPositions(oldTeam, oldClub, newTeam, newClub, entered)` resolves the previous effective sport **before mutations**, and preserves deliberate position customisations.
- `syncSportPositions(ws)` is called from `save()` so editing a club's sport refreshes inheriting teams' stored default positions **before the public team copy is encrypted/published**, without touching custom position lists.

### Interface: `site/app.js`

- The player card supports correcting an erroneous issue and choosing **Issue jersey again** rather than silently reviving it on save.
- Reports identify the season being reviewed, list that season's issues and returns, and separately expose **Currently outstanding across all seasons**.
- Reminders from historical rows reference only the selected season's outstanding issues; current inventory reminders encompass all currently outstanding issues.
- Team creation and Settings select the correct effective sport and its position defaults, including inherited club sport and custom settings. **Copied settings only retain a custom position list when the new team's sport matches the source team's sport**; a new team in a different sport uses that sport's standard positions.
- Active competition detail explicitly explains eligibility for the Home competition card and directs the coach to **Enter a team**.
- New photo uploads target 180 px / 12 KB where feasible, with several compression attempts. Existing photos within the original 80 KB maximum are still valid and visible. Storage-write failures surface warnings; backups remain the recovery control.
- Existing HTML structure and 46 px form control consistency remain; non-interactive status toasts no longer intercept taps on underlying form controls (`pointer-events: none`); no wholesale rewrite.

### Regression qualification

- `test/players.test.js`: durable jersey corrections, explicit reissue, cross-season status and inventory, sport defaults/migration **including the published projection after club-only changes**, private photo projection, synthetic datasets of 30/60/100 players.
- `test/browser/players.py`: new-player rugby league positions, real Settings club-switch to netball, mistaken jersey issue correction through UI and repeated save, existing photo, Home and width checks.
- `.github/workflows/test.yml`: unit test job retained; **Chromium Playwright suite job** added on PR to run all existing browser regression suites with simulated GitHub and stubbed WhatsApp.
- Browser CI is not a real GitHub publishing or actual WhatsApp integration test.

## Important security and compatibility boundaries

- Player photos and jersey issue history are private to the encrypted coach workspace; `site/vault.js` still constructs the player projection by allowlist. Do not add `photo`, `jerseys` or `jerseyCorrections` to the public projection.
- Do not reset player IDs, seasonal squad memberships, historical matches, team passwords, GitHub publishing or existing backups.
- Corrections are stored on a player's record and take part in existing record-level conflict resolution. If two devices edit the same player concurrently, the existing whole-player conflict resolution still applies.
- Historic entries continue to use their season of issue, even if returned in a later year.
- Jersey `number` is still an assignment field, not a full stock/serial-number inventory system.
- A previous issue deliberately deleted is **not** reissued automatically in that season. An explicit new issue is required.
- These changes do not add sport-specific tactics field diagrams beyond current support.

## Historical CI evidence and final acceptance

- [PR #9](https://github.com/pdomoney/team-manager/pull/9) merged the initial corrective work. An earlier candidate at `d27bb67f72d3a563d6e19293b078482d2138e864` passed **97 unit tests and 490 browser checks**; those counts are historical, not the latest merged-baseline counts.
- [PR #10](https://github.com/pdomoney/team-manager/pull/10) resolved the subsequently discovered queued manual-publish regression. [PR #11](https://github.com/pdomoney/team-manager/pull/11) added compatible photo capacity/regression qualification and storage recovery; [PR #8](https://github.com/pdomoney/team-manager/pull/8) was closed without merging.
- The actual merged `main` commit `960212fdb3c6` passed **103/103 unit** and **491/491 standard Chromium checks** in [run 39112283528](https://github.com/pdomoney/team-manager/actions/runs/39112283528). [Pages publishing](https://github.com/pdomoney/team-manager/actions/runs/39112283502) succeeded in **test mode**.
- The fuller **30/60/100-photo** synthetic qualification passed **30/30 checks** as part of [PR #11's 521/521 browser run](https://github.com/pdomoney/team-manager/actions/runs/39108841423). The main push intentionally skips this slower capacity suite; see [qualification details](pr8-selective-qualification-20261018.md).

## Outstanding qualification / limitations

- For subsequent changes, qualify against the **new exact commit**, not historical PR9/PR11 candidate results. The merged baseline is documented above.
- Safari on iOS/macOS, real-photo uploads, real device quota, production GitHub API/publishing, and real WhatsApp remain **manual acceptance** unless independently run and evidenced.
- The synthetic 30/60/100-photo tests validate serialized data/projection and target size, not real iOS Safari quota. Do not claim actual storage capacity is guaranteed on all phones.
- Existing 80 KB photos are not retroactively recompressed. Teams with many legacy large photos may still exceed storage; export a backup and reduce photos if warned.
- Recognising a known sport-default position list as inherited is a deterministic migration heuristic. Where a coach intentionally entered exactly another sport's standard list, review the result.
- Never silently backfill missing historic issue dates or fabricate issue/return activity.

## Acceptance checklist for another development chat

1. Check current `main` HEAD; `f1822a8` was a historical pre-correction baseline, not the current source.
2. Review `syncJerseys` + correction-tombstone semantics, especially save/delete/reissue and cross-device conflicts.
3. Confirm season report vs current inventory counts for old, new and returned jerseys.
4. Confirm new Rugby League, League tag, Netball and Oztag player forms use correct positions from team OR club sport, with custom overrides preserved.
5. Confirm club reassignment and copied team settings do not resurrect Oztag defaults.
6. Check multi-photo storage, backup/restore, empty full-storage warnings, and coach-only projection.
7. Verify active Home competition guidance and existing Home prioritisation unchanged.
8. Check Chromium CI tests, then physically inspect iPhone Safari and Mac Safari.
9. For any new candidate, document exact pass/fail/not-run status and source SHA. Obtain explicit approval before any new merge or deployment.

## Recovery

The historical starting commit `f1822a84224195a485fc275c21b617ebc28a1fc8` remains available in Git history; PRs #9, #10 and #11 are now merged into `main` at `960212fdb3c6`. No destructive data migration, bulk deletion or production data mutation is authorised by this record. For recovery, use verified encrypted backups and a specifically approved rollback procedure.
