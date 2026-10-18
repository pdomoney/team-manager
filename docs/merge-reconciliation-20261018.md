# Merge reconciliation and qualification — 18 October 2026

## Authoritative repository status

- Repository: `pdomoney/team-manager`
- Previously accepted baseline: `f1822a84224195a485fc275c21b617ebc28a1fc8` (Players and Sports).
- **PR #9 merged** to `main` in merge commit `1f9f7e7b1b835c4c43ccd9db425eb7016d82b2fb`.
- **PR #8 open, not merged and GitHub reports merge conflicts**. Its head is `019d54314d65d30f0f8bbd63cb171e4dbaf37353` and it was developed in parallel against the pre-PR9 baseline.
- **PR #10 is the replacement reconciliation/stabilisation candidate**, branched from `1f9f7e7` as `reconcile/pr8-on-merged-corrective-20261018`. It is a draft, must remain unmerged pending acceptance.
- The branch HEAD may advance; verify commit and status from GitHub Actions before claiming final qualification.

## Why PR #8 cannot safely be merged wholesale

Both PR #8 and merged PR #9 edit:
- `.github/workflows/test.yml`
- `site/app.js`
- `site/model.js`
- `test/browser/players.py`
- `test/players.test.js`

These are **semantic conflicts**, not only overlapping text.

| Design concern | Merged PR #9 | Alternative PR #8 | Merge decision |
| --- | --- | --- | --- |
| Incorrect jersey issue correction | `player.jerseyCorrections` suppression keys | Preserved `jerseys[].void` entries | Keep PR9 representation; do not introduce two parallel deletion mechanisms without a dedicated migration. |
| Jersey manual reissue | `issueJersey` clears matching correction, then issues a record | Manual jersey issue flag, intentionally permitting replacements | Reconcile desired semantics through explicit tests, not by overwriting one set of methods. |
| Season and inventory reporting | `jerseyReport` + `jerseyInventory` | `seasonJerseys` + different `jerseyInventory` shape | Must choose one interface; copying PR8's UI without its model will break Reports. |
| Sport customisation | `positionsFor`, `changedSportPositions`, `positionsCustom`, `syncSportPositions` | `positionsFor`, `setTeamPositions`, `applyPositions`, `syncPositions` | Keep one model and add missing tests through it. |
| Browser qualification | Chromium 13-suite PR checks with no artifact | 14-suite runner, JSON evidence artifact and fuller capacity test | May selectively port independent tests/reporting after confirming compatibility. |

PR #8 includes additional, potentially valuable standalone files `test/browser/capacity.py`, `test/browser/run_all.py`, `test/jerseys.test.js`, and `test/positions.test.js`, plus a `package.json` script. These are **not yet accepted against merged PR9's APIs**. Do not assume all PR8 test code can run unchanged.

## Separate regression found on main

The post-PR9 `main` Tests workflow [run 39106093892](https://github.com/pdomoney/team-manager/actions/runs/39106093892) had green unit tests but failed two Chromium `live_publishing.py` assertions:
- `shows the other device’s change`
- `both changes kept`

PR #8's own earlier [workflow run 39102376606](https://github.com/pdomoney/team-manager/actions/runs/39102376606) also had **111/111 unit tests passing but 604/606 browser checks**, failing the same live-publishing suite. Consequently, merging PR8 would not prove that regression fixed.

### Likely root cause and fix in PR #10

The browser workflow can request a second manual Publish while the first publish is still in flight. The existing code set `S.again = true` but finished by calling `schedulePublish()`, which does nothing with `gh.autoPublish === false`. Changes made during the first publication could therefore remain unpublished despite the second manual request.

PR #10 changes the `finally` handling: after an earlier publish completes successfully, a queued request with dirty changes triggers `publish(false)` even with automatic publishing disabled. Conflicts/errors are not blindly republished. The existing multi-device browser suite remains a release gate.

This is a focused publishing concurrency fix, **not** a force-push or a rebase of PR #8.

## Validation and acceptance

1. Run `npm test` on the exact PR10 head.
2. Run all existing Chromium browser suites, particularly `live_publishing.py` and `players.py`, on the same head.
3. Verify the GitHub Actions results linked to PR10, not green results from earlier commits.
4. Test real iOS Safari / macOS Safari forms, photo selection, browser quota and backup/restore manually; Playwright Chromium is not Safari.
5. Confirm encrypted player projections contain no coach-only photos, contact details, jersey histories, or corrections.
6. Review PR8-specific capacity tests and evidence-reporting tools only after stabilisation; port them on top of current main APIs as a separate additive change.
7. **Do not merge PR8 and PR10 together**. After PR10 acceptance/merge, decide whether PR8 should be closed as superseded. Do not force-update its head unless explicitly approved.
8. Do not publish or deploy additional code before explicit owner acceptance.

## Next-action guidance for another LLM development chat

- **Avoid creating a third parallel corrective implementation.**
- Inspect `main` and PR10 head first.
- Work only from current `main` or explicitly from the accepted replacement branch.
- Leave PR8 untouched unless asked to close it or to port specifically identified nonconflicting features.
- Preserve both historic branches until the release review is accepted.
- Record pass/fail/not-run separately for unit, browser, real-device, GitHub production publishing and storage capacity.
