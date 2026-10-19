# Release record — current status and historical milestones

## Current merged baseline — 19 October 2026

- **Authoritative `main`:** [`6d62e83d2a1d`](https://github.com/pdomoney/team-manager/commit/6d62e83d2a1d67db2698c7aa1da4cb9ca5a8fd38). PRs #1–#7 and #9–#15 are merged; PR #8 was closed without merging and selectively superseded by accepted changes.
- **Features included:** multi-club Home; seasons and competitions; player photos and jerseys; explicit cross-team player links; sport inheritance and override; fresh New Team with deliberate setup reuse.
- **Exactly merged `main` GitHub Actions:** [Tests 39178700541](https://github.com/pdomoney/team-manager/actions/runs/39178700541) passed **113/113 unit tests** and **559/559 Chromium browser checks across 16 suites**. [Publish 39178700562](https://github.com/pdomoney/team-manager/actions/runs/39178700562) succeeded and confirmed **no `data` branch** existed at publication.
- **PR #15 full capacity qualification:** [39178073122](https://github.com/pdomoney/team-manager/actions/runs/39178073122) passed **589/589 browser checks across 17 suites**, including **30/30 synthetic-photo capacity checks** (PR head `751e5be20327`). Normal main-branch checks omit the slow capacity suite.
- **Separate workflow issue:** scheduled Rules watch [39172394540](https://github.com/pdomoney/team-manager/actions/runs/39172394540) failed when committing from a newly initialised temporary repository with no Git author identity. This is not a failed Pages deployment.
- **Manual operational acceptance outstanding:** real Safari on iOS/macOS, realistic device storage limits and encrypted backup restore, actual authenticated GitHub `data` branch publication with approved data and coach review of visual workflows.
- **Active code candidate, not accepted:** [architecture stabilisation handoff](architecture-stabilisation-20261019.md) covers GitHub token retention, team/library reuse boundaries and incremental extraction. Do not treat branch changes as part of the merged baseline until approved.

## Historical milestone record (not current release status)

The material below documents the earlier milestone upgrades and their historical results. Those historical commit/test counts must not be used in place of the current release evidence above.


## Status

| Milestone | Status | Commit |
| --- | --- | --- |
| M0 Stability: clearing data, session ↔ task links, reply states, WhatsApp sent vs opened, clash details | Done | `16e40f7` |
| M2 Participation: RSVPs, player replies via WhatsApp, volunteer dashboard, lifts capacity, upcoming view | Done | `f073177` |
| M3 Teams and library: several teams, per-team players' files and passwords, library with versions, schema 3 with rollback | Done | `f61ac67` |
| M4 Matches and tournament: draw, availability, match lineups, results, match day, WhatsApp summaries | Done | `2f714b8` |
| M5 Reports: attendance, RSVP vs roll call, participation, positions, results, volunteering, loose ends | Done | `946aea1` |
| Navigation and usability: five sections, Home action list, modal dialogs, offline status, targets, validation | Done | `cb6d26a` |

## Data and migration

- The coach's copy is now schema 3: the first team stays at the top level exactly as before, other teams sit in `teams`, the library in `library`. The previous app version still opens the first team, and keeps the extra keys if it saves.
- Upgrading is deterministic (the first team's id is always `team1`) and running it again changes nothing. Links to deleted records are tidied on load.
- The copy from just before the upgrade is kept on the device (encrypted when live) and can be downloaded from Settings › Backup › Going back to the previous version, along with any single team in the old format.
- Players' files: `team.enc.json` (first team, so existing invite links work) and `team-<id>.enc.json`. `build.js` only publishes those names and checks each file's role.

**Rollback:** revert `main` to `6415a60` (or don't merge). The live site is in test mode today (no `data` branch), so the only upgraded data would be on the coach's own phone; to take a second team back, export it on its own first and import it into the old version.

## Checks run on the candidate

- Unit tests (`npm test`): 41 of 41 passing, covering encryption, the players' copies (no names, RSVPs, coach notes or other teams), the build and the data rules: migration, repair, reset, linked tasks, reply states, lifts, RSVPs, results, lineup checks, every report's missing-against-zero cases, the library and the three-way merge.
- Browser suites (`test/browser/`): 317 of 317 checks across phone and desktop widths. They cover each milestone, a regression of the existing features (squad, training and roll call, lineups and game systems, plays, the editor and animation, tasks, messages, settings, the players' view) and accessibility checks (names, labels, target sizes, modal focus, inert background). The live publishing suite runs against a simulated GitHub: going live, per-team files with no plain text, players opening only their own team, a clash between two devices combined record by record, a failed publish then retry, offline coach and player, archive and restore, and an encrypted backup restored.
- Build: a clean build stamps `vault`, `github` and `model` imports. Scanning the branch found no tokens, keys, passwords or data files.

**Not run here:** the real GitHub API and Pages deploy (simulated), the WhatsApp app (links stubbed), iOS Safari and other real phones, a screen reader, and password-finding speed on a slow phone with several teams.

## Known limitations (no individual logins)

- Players and helpers can't record their own RSVPs, task replies or sign-ups; they reply on WhatsApp and the coach records it.
- People on the same task can't see each other's names; there are no coach, team manager, player or helper roles. Everyone with the coach password can do everything.
- One team's players all share one password and invite link. If it spreads, change that team's password.
- The library belongs to the one coach workspace. Sharing it with another coach means exporting and importing a file; nothing syncs between coaches.

## Risks to watch

- Old cached copies of the app on another coach device reload into the new version on their next update check. If one publishes first, it keeps the new data but doesn't refresh the other teams' players' files until the new version publishes.
- The coach's draft now also keeps the copy it started from. If the phone's storage for the app fills, that copy is dropped first and the status bar asks for a backup.
- A clash is resolved per record, so if both devices changed the same session (say, a roll call on each), one version of that session is chosen whole.
- A typed team password is tried against each team's file in turn, which takes about half a second per team on a phone.
