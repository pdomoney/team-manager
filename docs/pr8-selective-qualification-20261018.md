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

## Verified automated test evidence — candidate (not merged)

- **Tested source commit:** `8b7b00d20537e8219f1421fd5bca8dceea856d47`.
- **Actions run:** [39108441274](https://github.com/pdomoney/team-manager/actions/runs/39108441274).
- **Unit tests:** 103 passed, 0 failed, 0 skipped.
- **Chromium browser qualification:** 521/521 checks in 14/14 suites; no failing suite.
- **Adapted photo-capacity suite:** 30/30 checks, including synthetic photo upload, simulated encrypted publication, another-device reload, encrypted backup/restore, storage-full warnings, recovery and export.
- **Machine-readable evidence:** [Actions artifact 12129660937](https://github.com/pdomoney/team-manager/actions/runs/39108441274/artifacts/12129660937), with `qualification.json`.
- **CI environment quota:** approximately 5,242,859 localStorage characters (Chromium runner; not guaranteed elsewhere).

| Players / photos | Workspace JSON chars | Encrypted coach file chars | LocalStorage chars | CI quota used | Second-device / reload / publish |
| --- | ---: | ---: | ---: | ---: | --- |
| 30 | 325,326 | 434,087 | 508,585 | 9.7% | Pass |
| 60 | 589,196 | 785,915 | 1,219,625 | 23.3% | Pass |
| 100 | 941,398 | 1,255,515 | 2,041,772 | 38.9% | Pass |

Source synthetic JPEGs ranged from 538,602 to 541,141 bytes, and after browser processing averaged about 8,541 **encoded characters** per new avatar. The 100-photo encrypted backup contained 1,255,515 characters. Photos did **not** appear in published team-player copies. After deliberate quota exhaustion, the last successful draft remained intact, the UI said the latest change was **not saved locally**, the **Export backup** action worked, and saving recovered once space was freed.

**Important:** The reported head is the tested source commit. A later *documentation-only* commit will naturally trigger new pull-request checks; verify the latest PR head passes before merging. The recorded run remains valid evidence for the exact code tested.

**Capacity projection only (not a verified real-device limit):** Under that Chromium runner quota, retaining both encrypted draft and conflict base is estimated to fit approximately 219 photos at the measured average size, but only **23 photos** at the legacy 80,000-character photo maximum. The estimates are not guarantees: browsers and iOS devices have different quotas.

**Not tested:** real iOS/macOS Safari, actual physical-device camera/photos, real token-authenticated GitHub publishing, third-party WhatsApp delivery, and actual iPhone storage capacity. Those remain manual acceptance gates.

### Known limitations

- Synthetic generated photos cannot represent every device camera format or Safari's actual storage quota; the measurements are Chromium-specific.
- Chromium cannot prove iOS Safari file selection.
- Local quota can vary across browsers, devices and private browsing.
- A user deliberately storing identical text to an old built-in positions catalogue will be recognised as inheriting that default; customised and reordered lists remain preserved.
- Separate devices editing the **same** player's jersey history can still require manual record-level conflict resolution. The accepted data model intentionally does not auto-merge conflicting changes to the same player.
