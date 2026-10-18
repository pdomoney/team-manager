# Merge reconciliation — historical decisions and final status

> **Resolved 18 October 2026.** This is a historical design-decision and multi-LLM handoff record, **not** an open merge task. Use the latest `main` HEAD and the [release record](release-record.md) for current status.

## Final authoritative outcome

| Pull request | Final status | Outcome |
| --- | --- | --- |
| [#8](https://github.com/pdomoney/team-manager/pull/8) | **Closed, not merged** | Parallel, incompatible alternative superseded; no PR8 merge conflict needs resolving |
| [#9](https://github.com/pdomoney/team-manager/pull/9) | **Merged** | Jersey corrections, season-specific reports, sport-aware positions, player-photo resilience |
| [#10](https://github.com/pdomoney/team-manager/pull/10) | **Merged** | Fixed a queued manual-publish request that could be lost while publishing was in progress |
| [#11](https://github.com/pdomoney/team-manager/pull/11) | **Merged** | Selectively incorporated PR8's unique test/qualification tools, legacy-position checks and storage recovery improvements |

**Accepted merged baseline:** [`main` at `960212fdb3c6`](https://github.com/pdomoney/team-manager/commit/960212fdb3c6bfcf73bbb3c2160aa21ac2ea07e6).

**Exact merged-commit evidence:**
- [GitHub Actions Tests](https://github.com/pdomoney/team-manager/actions/runs/39112283528): **103/103 unit**, **491/491 Chromium browser checks** across 13 suites (capacity deliberately omitted on a normal `main` push).
- [GitHub Pages Publish](https://github.com/pdomoney/team-manager/actions/runs/39112283502): **success**, site still in **test mode** because no data branch was present.
- [PR #11 qualification](https://github.com/pdomoney/team-manager/actions/runs/39108841423): **521/521 Chromium checks** across 14 suites, including **30/30 synthetic photo-capacity** checks. This full-capacity result is from PR qualification, not the merged `main` push.

## Why the original PR #8 was not merged

PR8 and PR9 independently changed `site/model.js`, `site/app.js`, `test/browser/players.py`, `test/players.test.js` and `.github/workflows/test.yml`. Some differences were **semantic**, not merely text conflicts.

| Concern | Accepted implementation | Excluded PR8 alternative |
| --- | --- | --- |
| Incorrect jersey issue | `player.jerseyCorrections` with explicit `issueJersey` reissue | `jerseys[].void` history |
| Season vs current equipment tracking | `jerseyReport` + `jerseyInventory` | Differently-shaped `seasonJerseys` and `jerseyInventory` |
| Sports and position provenance | `positionsFor`, `changedSportPositions`, `positionsCustom`, `syncSportPositions` | `setTeamPositions`, `applyPositions`, `syncPositions` |
| Test qualification | Existing suites augmented with `test/browser/capacity.py`, `run_all.py`, regression tests and CI artifacts | Wholesale competing model and form changes |

The unique compatible tests and recovery affordances were adapted and included in PR11, **without** introducing the competing PR8 model. No further merge of PR8 is necessary.

## Historical publishing regression and resolution

After PR9 merged, [the `main` test run 39106093892](https://github.com/pdomoney/team-manager/actions/runs/39106093892) failed two simulated two-device publishing checks: another device's change was not reflected, and both changes were not retained. The prior PR8 candidate also failed those checks.

**Root cause addressed in PR10:** A manual Publish request received while a publish was in flight set `S.again`, but the completion handler only scheduled automatic publishing; when `gh.autoPublish === false`, the second request could be lost. PR10 explicitly triggers the queued publication after a successful prior publication, without blindly retrying conflicts or errors.

The final merged baseline's **31/31 simulated live-publishing checks passed**. This is a test-harness result, **not** evidence of live authenticated GitHub data-branch operation.

## Outstanding acceptance, not merge conflicts

- Check photo upload, dropdown/date controls, encrypted backup/restore, quota exhaustion and recovery on **real iPhone Safari and macOS Safari**.
- Test authenticated encrypted-data GitHub publishing and recovery in an authorised non-production workspace before relying on live player information.
- The synthetic 30/60/100-player photo figures apply to the CI Chromium environment, not a guaranteed browser storage limit on iOS.
- Existing legacy photos up to 80 KB may require significantly more storage than newly compressed avatars.
- Do not misrepresent GitHub Pages deployment in **test mode** as production data acceptance.

## Guidance for future development chats

Start from the **current** `main` HEAD, not the earlier PR8, PR9, PR10 or PR11 head branches. Read [README](../README.md), the [current release record](release-record.md), and the [PR11 qualification evidence](pr8-selective-qualification-20261018.md) before proposing new changes. Preserve the accepted jersey history, sport positions, encryption, team IDs and multi-season model. Use independent branches and incremental qualification; do not regenerate a corrective PR8 implementation.
