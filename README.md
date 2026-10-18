# Team Manager

A phone-first app for running Oztag teams, built for the DragonTag Mixed 20s in the lead-up to the NSW State Cup in Coffs Harbour: squad, training and RSVPs, roll call, matches and the tournament draw, lineups and game systems on a field diagram, plays, volunteer tasks and lifts, reports, a noticeboard, and messages sent through WhatsApp. One coach can run several teams.

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
- **The GitHub token stays on the coach's phone.** It is never written to the data files or exports.
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
- Every club, the team's own included, is listed and opened here (players get their own club under More).
- A club can have a **logo**: choose an image in the club form and it's shrunk to a small badge, kept with the club (encrypted like everything else) and shown on Home, the club pages and the players' view. Without one, the badge shows the club's initials.
- A **club** holds what its teams share: contacts, website and social pages, home ground, nights played, colours, registration and code-of-conduct links, and its officials (coaches only).
- Each team names its club and has its own division, category (mixed turns on the males-on-field check), age group, season and staff (players see staff names and roles, not their numbers).
- St George Oztag is set up with DragonTag Mixed 20s in it.
- **More → Club** shows the club to players and coaches. Each team has its own squad, schedule, matches, tasks, lineups, plays and messages, and its own players' password and invite link. The **library** (Tactics → Library) shares plays, game systems and player lists between teams: a team uses a linked copy, which follows new library versions until the team changes it.

### Players, sports and jerseys

> **Corrective candidate (not merged):** The `corrective/players-jerseys-sports-20261018` branch addresses inherited sport defaults, mistaken jersey issues, cross-season jersey reports, storage warnings and Home competition activation guidance. **Full developer handoff and acceptance checklist:** [docs/corrective-players-sports-jerseys.md](docs/corrective-players-sports-jerseys.md). Changes on this branch are not live until explicitly reviewed and merged.


- **Sport**: a team plays its club's sport unless it's set in Settings › Team (Oztag, touch, league tag, rugby league and union, sevens, tag rugby, AFL, netball, football, basketball, hockey, cricket). The sport sets the positions players can pick (the team can keep its own list) and the automatic rule set; the app has official rules for Oztag, rugby league and league tag only.
- **Photos**: add a photo in the player form to put names to faces. Photos stay in the encrypted coach copy and never reach players. New uploads target a compact 180 px, 12 KB avatar; previously stored photos up to the old 80 KB limit remain readable. Phone storage is finite: keep encrypted backups and heed storage warnings.
- **Jerseys**: assigning a number normally records that jersey as given out. Lent jerseys can be marked **Returned** or **Undo**. An issue removed **as a recording mistake** is deliberately suppressed across saves; to issue that same number again, choose **Issue jersey again** on the player. **Reports › Jerseys** distinguishes issues/returns in the selected season from currently outstanding jerseys across all seasons (including former players).
- **Positions**: new-player options follow the effective sport (team sport, otherwise club sport). Recognised legacy default lists follow the selected sport; genuinely custom lists are preserved. The coach may reset the list in Settings › Team.
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

## Working on it locally

Requires Node.js 20 or later. There are no npm dependencies.

```sh
npm test                          # unit tests (encryption, players' copy, build, the data rules in site/model.js)
npm run build && npm run serve    # build into ./dist and serve on http://localhost:8080
```

To build with real data, check out the data branch first: `git worktree add data data`.

Browser checks (Python with Playwright and Chromium) walk through the app at phone and desktop sizes, with GitHub simulated and WhatsApp stubbed, so nothing goes online. **The corrective branch additionally requires these Chromium suites in pull-request CI** (Safari/iOS and production publishing remain manual acceptance checks):

```sh
for t in test/browser/{m0_stability,m2_participation,m3_teams_library,m4_matches,m5_reports,regress,live_publishing,clubs,rules,home,seasons,competitions,players}.py; do python3 "$t"; done
```

## Licence

MIT.
