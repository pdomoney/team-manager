# Selective PR #8 qualification — 18 October 2026

**Status:** Draft release candidate, not merged or accepted.
**Accepted source:** `main` at `7eb1976fdd5e2c0f81b044793383c772573adf94` (PR #10 merged).
**Candidate branch:** `qualification/pr8-selective-photo-regression-20261018`.
**Source comparison:** [PR #8](https://github.com/pdomoney/team-manager/pull/8) (unmerged, incompatible alternative); PR #9/#10 are already in `main`.

## Selected content and boundaries

| From PR #8 | Decision and adaptation |
| --- | --- |
| `test/browser/capacity.py` | Adapted to current 180px/12KB avatar, warning and backup behaviour; 30/60/100 synthetic player photos; local quota, encrypted coach and player files, simulated GitHub, second-device reload, backups and exhaustion/recovery. |
| `test/browser/run_all.py` | Sequential structured JSON qualification, records checked-out and PR HEAD commits, unit/browser statuses and coverage limitations; `--skip-unit` for nonduplicated CI; `--skip-capacity` for fast main-branch regression. |
| `.github/workflows/test.yml` | Keep passing, independent existing unit job; run browser suites with full synthetic capacity on PRs, fast normal browser suites on main push; always upload qualification JSON (14-day retention). |
| `package.json` | Add `npm run test:browser` and `npm run test:browser:smoke`. |
| `test/jerseys.test.js` and `test/positions.test.js` | Port only additional historical, concurrency and legacy position scenarios into `test/regression-selective.test.js`, rewritten for accepted function names. |
| `site/app.js` | Small local-storage warning, recovery and direct **Export backup** UI improvement. No redesign or encryption changes. |
| `site/model.js` | Recognise old app-generated Oztag `Wing, Link, Middle, Half` list during migration; retain existing sport and jersey implementations. |

**Explicitly excluded:** wholesale PR8 `site/app.js`, `site/model.js`, conflicting PR8 `test/browser/players.py` and `test/players.test.js`, jersey `void` fields, `seasonJerseys`, `syncPositions`, `applyPositions` and alternative inventory semantics.

**Accepted models retained:** `jerseyCorrections`, `jerseyReport`, `jerseyInventory`, `positionsCustom`, `changedSportPositions` and `syncSportPositions`, with all prior IDs and encryption projections.

## Validation procedures

```bash
npm test
npm run test:browser:smoke
npm run test:browser
```

- The full command runs unit tests and all browser suites **including capacity**, sequentially. Chromium and Python Playwright are required.
- GitHub CI runs unit tests once in its own job. The browser job skips duplicating units, runs the capacity suite **only on pull requests**, and uploads the structured JSON results even if the test suite reports failures.
- Browser suite outputs are based on **synthetic player photos and simulated GitHub publishing**; no test connects a real account or handles real player data.
- PR qualification produces `qualification.json` and includes capacity measurements. Check the exact candidate SHA and GitHub Actions URL before treating results as acceptance evidence.
- Deliberate quota exhaustion is performed only within a disposable Playwright browser context. The app should retain its last successfully saved draft, show the failure prominently, offer **Export backup**, and clear the warning when storage becomes available.
- A direct backup export is meant as a recoverability control. Quota exhaustion should never report a local save as successful.

## Security and operational gates

1. Confirm photo and jersey metadata stay out of player-encrypted public copies.
2. Confirm coach-only content is still encrypted before publishing; GitHub test mock != production encryption/publishing acceptance.
3. Confirm independent, non-destructive historical season and roster behaviour.
4. **Manual:** real iOS Safari and macOS Safari, photo chooser, select/date controls, 30/60/100 realistic photos on target devices, quota and backup restoration.
5. **Manual:** real GitHub data-branch publishing and recovery in an explicitly authorised test workspace.
6. Confirm PR #8 remains unchanged; it must not be merged wholesale. Close it as superseded **only after explicit owner approval**.
7. **No merge, branch deletion or deployment** under this qualification task.

## Test evidence — pending

Record exact-commit outcomes (pass/fail/not executed), and link the relevant CI runs in the new draft PR. No passing claim is made in this document until the tests actually complete.

### Known limitations

- Synthetic generated photos cannot represent every device camera format or Safari's actual storage quota; the measurements are Chromium-specific.
- Chromium cannot prove iOS Safari file selection.
- Local quota can vary across browsers, devices and private browsing.
- A user deliberately storing identical text to an old built-in positions catalogue will be recognised as inheriting that default; customised and reordered lists remain preserved.
- Separate devices editing the **same** player's jersey history can still require manual record-level conflict resolution. The accepted data model intentionally does not auto-merge conflicting changes to the same player.
