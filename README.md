# Team Manager

A phone-first app for running the DragonTag Mixed 20s Oztag team in the lead-up to the NSW State Cup in Coffs Harbour: squad, training schedule, roll call, lineups on a field diagram, a noticeboard, and messages sent through WhatsApp.

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
| Volunteer tasks (BBQ, gear, lifts) and helpers | ✓ edit, with names | ✓ view, without names |
| Phone numbers, injuries, notes | ✓ | – |
| Roll call and attendance | ✓ | – |
| WhatsApp messages, publishing, settings | ✓ | – |

The coach can use **Settings → See what players see** to check the player view. Before going live there are no passwords at all; see [Test mode](#test-mode).

## How it works

It runs entirely on GitHub, the same way as [nsw-rail-disruptions](https://github.com/pdomoney/nsw-rail-disruptions). There is no server or database.

1. **Edit.** The coach makes changes in the app. They are saved straight away on the coach's phone, encrypted.
2. **Encrypt.** When publishing, the app encrypts two files in the coach's browser:
   - `team.enc.json`, the players' copy, locked with the team password;
   - `coach.enc.json`, everything, locked with the coach password.
3. **Store.** The app commits both files to the `data` branch of this repository using the coach's GitHub token.
4. **Publish.** The app then starts the **Publish** workflow (`.github/workflows/publish.yml`), which runs `src/build.js` to copy the app in `site/` and the encrypted files into `dist/`, and deploys it to GitHub Pages. Players see changes about a minute later.

Players' phones download `team.enc.json` from the site and decrypt it with the team password. The coach's file never reaches a player's phone in readable form.

### What the encryption does and doesn't protect

GitHub Pages sites and public repositories can be read by anyone, so a login screen on its own would protect nothing. Instead the data is encrypted before it leaves the coach's phone (AES-256-GCM, with keys derived from the passwords by PBKDF2-SHA256 at 600,000 iterations; see `site/vault.js`). Anyone can download the files, but without a password they are unreadable.

- **The protection is only as strong as the passwords.** Use three or four random words for each. The coach password needs at least 10 characters, the team password at least 8, and they must differ.
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

On another device (a laptop, or an assistant coach's phone), open the site, tap **I'm the coach** and sign in with the coach password. To publish from that device too, add the token under **Settings → Publishing**. If two devices change the team between publishes, the app asks which version to keep.

## Data files (`data` branch)

| Path | What it holds |
| --- | --- |
| `team.enc.json` | The players' copy, encrypted with the team password: team and tournament details, squad names, gender, numbers and preferred positions, training sessions, lineups, notices, plays, the coach's changes to the game systems, and the volunteer tasks without anyone's name (just whether each spot is taken). |
| `coach.enc.json` | Everything, encrypted with the coach password: the above plus phone numbers, availability and injuries, player notes, roll calls, sent messages, helpers and who is on each task, and the team password (so the coach can re-encrypt the players' copy and make invite links). |

Each file is JSON with the fields `format`, `version`, `role`, `kdf`, `salt`, `iv` and `data` (the encrypted content, base64).

## Working on it locally

Requires Node.js 20 or later. There are no npm dependencies.

```sh
npm test                          # unit tests (encryption, players' copy, build)
npm run build && npm run serve    # build into ./dist and serve on http://localhost:8080
```

To build with real data, check out the data branch first: `git worktree add data data`.

## Licence

MIT.
