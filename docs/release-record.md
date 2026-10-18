# Release record: upgrade to milestones 0, 2, 3, 4, 5 and usability

> **Qualification programme (unmerged):** `qualification/pr8-selective-photo-regression-20261018` is a selective follow-on to accepted `main` `7eb1976fdd5e`. It ports PR8's browser capacity test, structured JSON runner, retained CI artifacts, adapted regression cases and a direct encrypted-backup action for full storage. No alternate jersey `void` record model or replacement of accepted app/model architecture is included. See [release qualification details](pr8-selective-qualification-20261018.md). **The candidate is not an accepted release** until its exact-commit checks and manual acceptance gates are reviewed. The code at `8b7b00d20537` passed **103/103 unit tests, 521/521 browser checks across 14 suites**, including 30/30 photo-capacity checks, in [GitHub Actions run 39108441274](https://github.com/pdomoney/team-manager/actions/runs/39108441274). Synthetic CI photo storage was 9.7% / 23.3% / 38.9% of the Chromium quota at 30 / 60 / 100 players. Real Safari, device quota and production publishing remain untested. Later documentation-only commits require fresh head checks.


> **Historical record — not current release status.** This section documents the original M0/M2–M5 milestone upgrade, now merged. Subsequent clubs, rules, Home, seasons, competitions, and Players/Sports PRs have also been merged into `main` at baseline `f1822a8`. The ongoing **unmerged corrective candidate** for jerseys, sport positions, storage, form validation and competition activation is documented in [corrective-players-sports-jerseys.md](corrective-players-sports-jerseys.md). Refer to that document and the latest branch commit/CI checks for acceptance; do not treat the historical pass counts or "not deployed" text below as current.


| | |
| --- | --- |
| Baseline | `main` at `6415a60` (Volunteer tasks, helpers, and the plan for roles and logins) |
| Branch | `upgrade/milestones-0-5` (not merged, not deployed) |
| Out of scope | Milestone 1 (individual logins, Supabase, accounts). The shared coach and team passwords, GitHub publishing and WhatsApp hand-off are unchanged in kind. |

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
