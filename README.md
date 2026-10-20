# Team Manager

A phone-first coach and player app for multiple clubs, teams, seasons and competitions. Originally developed for Oztag, it now supports configurable sports and sport-specific player positions, with the existing field tactics editor primarily designed for Oztag. Manage squads, training, RSVPs, roll calls, matches, lineups, volunteer tasks, transport, reports, notices and WhatsApp communications across teams.

The app has five sections: **Home** (the command centre below), **Schedule** (upcoming, training, matches, attendance), **Team** (squad, tasks, helpers, tally), **Tactics** (lineup, plays, the shared library) and **More** (messages, reports, teams, notices, settings).

**Home** is the coach's command centre across every club and team:
- **Clubs and teams**: a compact row of club badges and team chips, with a dot on a team that needs attention. Show every club, one club or one team; the choice is kept on this device. Picking a team also makes it the team you're editing. With one team there's nothing to pick.
- **Spotlight**: the single most urgent thing, from recorded dates and times only.
  - Critical: a match within 24 hours without a ready lineup or enough players confirmed, or riders without a seat or volunteer spots not confirmed within 24 hours.
  - Imminent: training within 24 hours, a match or the tournament within 72 hours.
  - Upcoming: anything within 7 days, rule updates, results and messages to confirm.
  - An event without a start time counts by calendar day and shows "time TBC".
- **Coming up**: training, matches, tasks and the tournament for the next 7, 14 or 30 days in one list. A task tied to a session or match shows under it; cancelled and postponed events are listed apart.
- **Outstanding actions**: the loose ends across the teams shown, most urgent first, without repeating the spotlight.
- **At a glance** (one team): availability, next training and match, training turnout, results and the tournament countdown.
Anything on Home that belongs to another team switches to that team before opening it. Players' Home shows only their team: what's next, the next two weeks, notices, help needed and rule updates.

**Site:** https://pdomoney.github.io/team-manager/

## Two roles

| | Coach | Players |
| --- | --- | --- |
| Signs in with | the coach password | the team password, or an invite link |
| Countdown, schedule, notices | ✓ | ✓ |
| Squad names, numbers, positions | ✓ edit | ✓ view |
| Lineups on the field | ✓ edit | ✓ view |
| Game systems on the Lineup page (exit set, good ball, zig-zag, their red zone, when to kick, defence up and slide) | ✓ edit | ✓ view |
| Plays | ✓ edit | ✓ view |
| Volunteer tasks (BBQ, gear, lifts) and helpers | ✓ edit, with names | ✓ view, without names: each spot confirmed, invited or open |
| Matches, the tournament draw, scores, match lineups | ✓ edit | ✓ view |
| RSVPs for training and match availability | ✓ records replies | reply by WhatsApp (“Coming”, “Not sure”, “Can’t”); the coach records it |
| Phone numbers, injuries, notes, coach's match notes | ✓ | – |
| Roll call, attendance and reports | ✓ | – |
| WhatsApp messages, publishing, settings, teams, the library | ✓ | – |

There are no individual logins: a shared coach password and one team password per team. Players can't change anything in the app; their replies go to the team contact on WhatsApp and the coach records them. Opening WhatsApp only prepares a message; the app counts it as sent once the coach says it went.

The coach can use **Settings → See what players see** to check the player view. Before going live there are no passwords at all; see [Test mode](#test-mode).

## How it works

It runs entirely on GitHub, the same way as [nsw-rail-disruptions](https://github.com/pdomoney/nsw-rail-disruptions). There is no server or database.

1. **Edit.** The coach makes changes in the app. They are saved straight away on the coach's phone, encrypted.
2. **Encrypt.** When publishing, the app encrypts the files in the coach's browser:
   - one players' copy per team, locked with that team's password: `team.enc.json` for the first team, `team-<team id>.enc.json` for each other team;
   - `coach.enc.json`, everything for every team, locked with the coach password.
3. **Store.** The app commits the files in one go to the `data` branch of this repository using the coach's GitHub token. An archived team's players' file is removed.
4. **Publish.** The app then starts the **Publish** workflow (`.github/workflows/publish.yml`), which runs `src/build.js` to copy the app in `site/` and the encrypted files into `dist/`, and deploys it to GitHub Pages. Players see changes about a minute later.

Players' phones download their team's file from the site and decrypt it with their team password. Each team's password only opens that team's file, and the coach's file never reaches a player's phone in readable form.

### What the encryption does and doesn't protect

GitHub Pages sites and public repositories can be read by anyone, so a login screen on its own would protect nothing. Instead the data is encrypted before it leaves the coach's phone (AES-256-GCM, with keys derived from the passwords by PBKDF2-SHA256 at 600,000 iterations; see `site/vault.js`). Anyone can download the files, but without a password they are unreadable.

- **The protection is only as strong as the passwords.** Use three or four random words for each. The coach password needs at least 10 characters, each team password at least 8, and they must all differ. A team made without a password gets a random one, shown in Settings when that team is on screen.
- **The invite link contains the team password.** Only send it to the team group. If it spreads, change the team password (**Settings → Players' access**); every player then needs the new link.
- **Old versions stay in the repository's history.** After a password change, someone who had the old password can still decrypt older versions of the files, as they were at that time. Treat a password change as stopping future access, not as erasing what was shared.
- **Passwords can't be recovered.** Keep both in a password manager. "Keep me signed in" stores a key on that phone, so only use it on your own phone.
- **The GitHub token is a sensitive publishing credential.** In the architecture-stabilisation candidate it is kept for the browser tab session by default, with longer storage only after explicit opt-in on a trusted personal device. Previously stored tokens are migrated out of durable browser storage when the updated app loads. It is never written to team data files or exports. Session-only storage still cannot protect a token from malicious scripts running on the site.
- `src/build.js` refuses to publish a data file that isn't encrypted, so a mistake can't put plain text on the site.

## Test mode

Until you go live, the site opens straight into the full coach app with no passwords. Everything you enter is kept in that phone's browser only: nothing is sent to GitHub and nothing is published, so players' details never leave the phone. A yellow bar at the top says you're in test mode.

Use it to try the app with your real squad or the sample squad (**Load a sample squad** on the home screen). **Settings → See what players will see** previews the player view.

When you're ready, tap **Go live**. Your test data comes with you; the unencrypted test copy is deleted from the phone once the encrypted one is saved.

## Setting it up

1. In this repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Run the **Publish** workflow once from the **Actions** tab (or push to `main`). The site appears at the address above, in test mode.
3. Try it out in test mode for as long as you like.
4. To go live, create a token for the app: GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - **Expiration:** a date after the tournament, such as 30 April 2027.
   - **Repository access:** *Only select repositories* → `team-manager`.
   - **Repository permissions:** **Contents** → *Read and write*, and **Actions** → *Read and write*.
5. In the app, tap **Go live** and choose the coach and team passwords.
6. When asked, enter your GitHub username, `team-manager` and the token. The app publishes straight away, and from then on the site asks visitors for a password.
7. **Settings → Send invite link** shares the app with the team's WhatsApp group.

On another device (a laptop, or an assistant coach's phone), open the site, tap **I'm the coach** and sign in with the coach password. To publish from that device too, add the token under **Settings → Publishing**. If two devices change things between publishes, the app shows what changed on each side, combines them, and asks which version to keep only where both changed the same record.

### Clubs and teams

**More → Clubs and teams** (or the team name in the header) creates clubs and teams, and switches, archives and restores teams.

**New team** always starts as a fresh team. It doesn't copy the currently selected team's club, competitions/dates, training venue/times, rules, by-laws, coach contacts, staff, players, jersey history, passwords or shared library items. Choose the club and team sport explicitly; the club sport is only a default. Built-in starter tactics are supplied by the app and are not another team's material.

To deliberately reuse an existing setup **in the same coach workspace**, choose **Use existing setup**, then select the specific source team. In the architecture-stabilisation candidate, the same club and effective sport restriction is also enforced for optional library-only imports, even if copying settings is unticked. Reuse is allowed only within the same club and effective sport; it copies training time, venue, field/rules/by-laws and optional team position customisation. It never copies players, staff, private contacts, passwords, fixtures, season results or jersey history. Shared tactics-library items are a separate unchecked opt-in. A different club/sport requires a fresh setup.

**Access boundary:** the current application has one encrypted coach workspace, not separate individual coach accounts/permissions within one club. The source chooser lists teams already in that workspace; it cannot by itself enforce "my team versus another coach's team" ownership. Do not share a coach workspace with people who must not access each other's team settings or player records.
- Every club, the team's own included, is listed and opened here (players get their own club under More).
- A club can have a **logo**: choose an image in the club form and it's shrunk to a small badge, kept with the club (encrypted like everything else) and shown on Home, the club pages and the players' view. Without one, the badge shows the club's initials.
- A **club** holds what its teams share: contacts, website and social pages, home ground, nights played, colours, registration and code-of-conduct links, and its officials (coaches only).
- Each team names its club and has its own division, category (mixed turns on the males-on-field check), age group, season and staff (players see staff names and roles, not their numbers).
- St George Oztag is set up with DragonTag Mixed 20s in it.
- **More → Club** shows the club to players and coaches. Each team has its own squad, schedule, matches, tasks, lineups, plays and messages, and its own players' password and invite link. The **library** (Tactics → Library) shares plays, game systems and player lists between teams: a team uses a linked copy, which follows new library versions until the team changes it.

### Club-first match-day volunteers (PR23 candidate)

From **Team → Match staff → Add volunteer**, start with the club rather than a team. There are three options:

- **Existing volunteer:** reuse an existing person in this encrypted coach workspace, explicitly linking them to the selected club and optionally a team. No global account lookup or automatic identity matching.
- **Email invitation:** prepare an email in your mail app for manual review and sending. This does **not** create a Team Manager account, provide a sign-up link, record delivery or enrol anyone.
- **Add manually:** record a name and optional email under a club. Team assignment can wait. After choosing a team, review sport-specific roles, registration, safeguarding and accreditation. Nothing is marked cleared by intake.

A volunteer can be associated with multiple clubs in the same workspace without duplicating their ID. The club directory and current team's match staffing checks are separate. A club association **never** establishes match-day eligibility. The current app has no individual user accounts or tenant-specific access control; real self-enrolment and inter-club registration need a future authenticated backend.

### Players, sports and jerseys

> **Current merged development baseline — 19 October 2026:** `main` at [`6d62e83d2a1d`](https://github.com/pdomoney/team-manager/commit/6d62e83d2a1d67db2698c7aa1da4cb9ca5a8fd38), following merged [PR #13](https://github.com/pdomoney/team-manager/pull/13) (explicit cross-team player linking), [PR #14](https://github.com/pdomoney/team-manager/pull/14) (team sport override) and [PR #15](https://github.com/pdomoney/team-manager/pull/15) (fresh-team isolation). [PR #8](https://github.com/pdomoney/team-manager/pull/8) was **closed without merging** as superseded. At the exact current `main` commit, [unit and Chromium checks passed](https://github.com/pdomoney/team-manager/actions/runs/39178700541): **113/113 unit tests and 559/559 browser checks** across 16 suites; [GitHub Pages deployed](https://github.com/pdomoney/team-manager/actions/runs/39178700562) in **test mode without a `data` branch**. The full synthetic photo-capacity suite was passed separately on [PR #15's final head](https://github.com/pdomoney/team-manager/actions/runs/39178073122): 589/589 browser checks, 17/17 suites, including 30/30 capacity checks. Real iOS/macOS Safari, physical-device storage, and authenticated production-data publishing remain **unverified**. An architecture stabilisation PR is under review and is not yet part of this merged baseline.

- **Club default vs team sport**: the club chooses a **Default sport for teams** (for example Rugby league), while **each individual team** may select a different **Team sport** in the new-team form or Settings. An explicit team choice always overrides the club default; selecting **Use club default** keeps inheritance. For example, a Rugby League club may have a Rugby League team, a League Tag team and a Netball team; an Oztag club can have a Touch Football team. The form previews the **effective sport and new-player preferred positions before saving**. The app knows Oztag, touch, league tag, rugby league and union, sevens, tag rugby, AFL, netball, football, basketball, hockey and cricket; official rule packs exist for Oztag, rugby league and league tag only.
- **Photos**: add a photo in the player form to put names to faces. Photos stay in the encrypted coach copy and never reach players. New uploads target a compact 180 px, 12 KB avatar; previously stored photos up to the old 80 KB limit remain readable. Phone storage is finite: keep encrypted backups and heed storage warnings.
- **Jerseys**: assigning a number normally records that jersey as given out. Lent jerseys can be marked **Returned** or **Undo**. An issue removed **as a recording mistake** is deliberately suppressed across saves; to issue that same number again, choose **Issue jersey again** on the player. **Reports › Jerseys** distinguishes issues/returns in the selected season from currently outstanding jerseys across all seasons (including former players).
- **Positions**: New Player offers the **selected team's sport** positions, not an unconditional club list. Settings previews the list immediately when club or team sport changes; it updates inherited defaults while preserving a genuinely custom or manually typed list. Previously saved player preferences and jersey issue/return history are not rewritten by changing a sport. The coach may reset positions from the team's current sport using **Use these** in Settings › Team.
- **Same player on multiple teams:** From **Team → Squad**, use **From another team** to explicitly link a player from another active team. The coach can also open an existing Player card and choose **Add to a team**. Linking never matches people by name, never merges two teams' player IDs, and never copies the source jersey number, preferred positions, match availability, injuries, notes or jersey return history. The destination team gets its own editable record and season membership, while the private coach workspace retains a stable shared-person reference. If the player was already entered on the destination team, select their **existing record** in the From another team form to keep its history and avoid duplicates. Player-facing team files do not disclose the shared-person reference or another team's records. Editing contact information on one team does not silently change another team's record. **Release status:** merged into `main` in [PR #13](https://github.com/pdomoney/team-manager/pull/13); live device acceptance remains outstanding.
- **Competition day**: when a competition is active **and an active-season team is entered**, Home shows its progress (day or week), results, today's matches, the next match and the last result. Enter the team first if an active competition does not appear on Home.

### Seasons

A team carries on from season to season (Winter 2026, Winter 2027…) without being made again. The season shows under the team name; tap it to look back at a past season or open **Seasons** (also in Clubs and teams and Settings).
- Each season has its own squad (with that season's numbers, positions, availability and registration), staff, training and roll calls, matches and results, tasks and lifts, messages and notices. People are kept once: a player who comes back is the same record.
- **Create next season**: pick who carries over (nobody is carried until ticked) and their new numbers, add new players, keep staff and training defaults if you want, then check a summary before creating. Nothing from the old schedule is copied. When the squad changes, you're reminded you can change the players' password; nothing changes unless you do.
- Statuses: planned, active (one at a time), completed, archived. A past season opens read-only; **Make a correction** saves deliberate changes into it, and its squad is edited in Seasons.
- Home, the players' page and alerts use the active season. Reports compare seasons.
- Upgrading: an existing team gets a first season holding everything it has (named from its season setting, or the years its records span). The copy from before is kept and can be downloaded in Settings › Backup.

### Competitions

**More › Competitions** keeps each league, tournament or carnival once. A team takes part through an **entry** for one of its seasons (with a division or pool), so a competition can have several teams and a season several competitions.
- A match can belong to an entry (shown beside it), be a friendly, or not be linked yet. Matches in a competition's dates are offered for linking, never linked on their own.
- The competition page lists entries, fixtures and our results. No ladder is worked out, because other teams' results aren't recorded.
- Competition by-laws sit between the official rule set and the team's own by-laws on the Rules page.
- Withdrawing keeps fixtures and results; completing or archiving a competition keeps its results; an archived team's entry stays.
- Upgrading: a team's tournament (its event and dates) becomes a competition entered by its season, with only the matches already marked as tournament matches linked.

### Rules

**Tactics → Rules** shows the official rules the team plays to, for coaches and players: the numbers at a glance (players, tags, defence distance, kicking, scoring) and every rule with its number in the rule book.
- **Rule sets** come from `site/rules.js`: Oztag (Australian Oztag rule book: mixed, men's, women's, juniors), rugby league (6–12 junior laws, 13–14, open men and women) and league tag (6–7 to 15 and over). Each sport has base rules; a grade lists only what differs. A team follows its club's sport and category automatically, or picks a rule set in Settings.
- **By-laws** are the coach's own: their competition's rules, added on the Rules page, optionally in place of an official rule. Updates never change them. A team's own number for most males on field counts as a by-law (leave it blank to follow the rule set).
- **Updates**: only the app's owner changes the official rules, through a pull request: raise `pack`, add a `changes` entry naming the rule ids, and set each source's `checked` date. When the release goes live, the bell in the header and Home's Outstanding actions show the update; **Review** lists the game systems and plays that rely on a changed rule (a play's rules are set in its Words tab) and any by-law that replaces one, and can post a notice to players.
- **Rule book watch**: the `Rules watch` workflow fingerprints each rule book once a week (or from **Check the rule books now** on the Rules page) and keeps the results on the `rules-watch` branch. A change opens an issue for the owner and shows on the Rules page and the bell. A monthly scheduled check also looks for new editions and drafts any update as a pull request for the owner to approve.

### Backups and going back

**Settings → Backup** exports every team and the library (encrypted once live). Importing a backup can replace everything, replace the team on screen, or add a new team. The data format before multiple teams kept one team at the top level; it still does, so the previous version of the app opens the first team unchanged. **Going back to the previous version** in Settings exports any team on its own in the old format, and downloads the copy saved just before the upgrade.

## Data files (`data` branch)

| Path | What it holds |
| --- | --- |
| `team.enc.json`, `team-<id>.enc.json` | A team's players' copy, encrypted with that team's password, for its active season only: the season's name and dates, the competitions it's in (public details and by-laws, not other teams' entries), team and tournament details, the club's public details, staff names, squad names, gender, numbers and preferred positions, training sessions, matches with scores, lineups, notices, plays, the coach's changes to the game systems, and the volunteer tasks without anyone's name (just whether each spot is confirmed, invited or open). |
| `coach.enc.json` | Everything for every team and every season, encrypted with the coach password: the above plus past seasons, every competition and its entries, phone numbers, availability and injuries, player notes, roll calls, RSVPs and match availability, coach's notes, the message log, helpers and who is on each task, the library, and the team passwords (so the coach can re-encrypt the players' copies and make invite links). |

The `rules-watch` branch holds `rules-watch.json`: the Rules watch's fingerprints of the public rule books (no team data). The site publishes it as `data/rules-watch.json` only if it's in exactly the expected shape.

Each file is JSON with the fields `format`, `version`, `role`, `kdf`, `salt`, `iv` and `data` (the encrypted content, base64).

### Architecture stabilisation under review

The candidate [architecture stabilisation handoff](docs/architecture-stabilisation-20261019.md) describes session-only publishing tokens by default, explicitly authorised long-term retention, a shared-library reuse guard and isolated validation modules. These changes are **not yet merged or production accepted**. The app remains a shared coach workspace without separate accounts or coach-to-coach isolation.

## Testing with the test library

On an empty Home (or **Settings › Test data**), **load the test library**: made-up data that comes out the same on every device. It has five made-up teams in four real clubs (St George Oztag, Penrith Oztag, Taren Point Titans and Engadine Dragons, with only the public details from their websites), training, tasks and lifts, the State Cup draw, a gala day today with five games (so Match Day always has one coming up), six match-day volunteers with current, expiring, expired and unchecked accreditations, and staffing requirements with one shortfall. No real people: the players and volunteers are made up, and their phone numbers are from the range set aside for fiction.

**Settings › Test data** shows a six-character **data check**: two devices showing the same code hold the same data.

- **Same starting point on several devices:** load the test library on each, on the same day (its dates follow the day it's loaded).
- **Changes shared between devices:** load it on one device and go live. Sign in on the others with the coach password; changes made on any of them publish to the rest. Nothing reaches players until you send an invite link. Before inviting players, clear it (Settings › Backup › Clear team data) and add the real squad.
- Once live, the test library can only replace a copy that is already the test library, or has no players, and it keeps the passwords.

## Working on it locally

Requires Node.js 20 or later. There are no npm dependencies.

```sh
npm test                          # unit tests (encryption, players' copy, build, the data rules in site/model.js)
npm run build && npm run serve    # build into ./dist and serve on http://localhost:8080
```

To build with real data, check out the data branch first: `git worktree add data data`.

Browser checks (Python with Playwright and Chromium) run at phone and desktop sizes, with **simulated GitHub** and stubbed WhatsApp. Merged PR #11 added a 30/60/100-photo synthetic capacity suite (including quota exhaustion, encrypted backup/restore and simulated publishing), a structured JSON report and CI artifacts. **Safari/iOS, actual phone storage and production publishing remain manual acceptance checks.**

```bash
npm test                    # Unit regression suite
npm run test:browser        # Full unit + Chromium and capacity qualification
npm run test:browser:smoke  # Unit + standard Chromium suites; omit slow capacity
```

On pull requests, GitHub Actions runs unit tests separately and browser qualification sequentially with a JSON evidence artifact (14-day retention). On ordinary `main` pushes the slower capacity suite is intentionally omitted, so a green main-branch run does not indicate that the capacity suite ran on that commit. The runner is `test/browser/run_all.py` and uses synthetic images only.

## Licence

MIT.
