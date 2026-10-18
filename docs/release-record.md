# Release record — current status and historical milestones

## Current merged baseline — 18 October 2026

- **Authoritative `main`:** [`960212fdb3c6`](https://github.com/pdomoney/team-manager/commit/960212fdb3c6bfcf73bbb3c2160aa21ac2ea07e6). [PR #9](https://github.com/pdomoney/team-manager/pull/9), [PR #10](https://github.com/pdomoney/team-manager/pull/10) and [PR #11](https://github.com/pdomoney/team-manager/pull/11) are **merged**.
- **Superseded alternative:** [PR #8](https://github.com/pdomoney/team-manager/pull/8) is **closed without merging**. The accepted jersey history and sport-position models were retained; additional compatible PR8 test and resilience improvements were selectively integrated via PR #11.
- **On merged `main`:** [Tests run 39112283528](https://github.com/pdomoney/team-manager/actions/runs/39112283528) passed **103 unit tests and 491 Chromium checks across 13 browser suites**; [Publish run 39112283502](https://github.com/pdomoney/team-manager/actions/runs/39112283502) succeeded.
- **Full capacity qualification:** [PR #11 run 39108841423](https://github.com/pdomoney/team-manager/actions/runs/39108841423) passed **521/521 browser checks across 14 suites**, including **30/30 synthetic-photo capacity checks**. Main-branch pushes omit the slower capacity suite by design. The [capacity and evidence record](pr8-selective-qualification-20261018.md) retains test measurements and limitations.
- **Outstanding manual acceptance:** Real iOS/macOS Safari photo/forms, physical-device quota and backup recovery, and authenticated GitHub data-branch publishing. The successful Pages deploy was in **test mode**, with no data branch yet.
- **Repository release status:** Automated development baseline accepted; operational/live-team acceptance **not** established.

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
