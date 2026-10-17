# Roles, logins and volunteer tasks: the agreed plan

Agreed with the coach on 15 October 2026. Build order: the features first (volunteer tasks), then roles and logins.

## Log in approach

- **Individual logins**, replacing the shared coach and team passwords. One login per person, with a role in each team they belong to.
- **Supabase** holds the data and does the sign-in. The app itself stays on GitHub Pages.
- **Signing in:** the team manager or coach sends each person a sign-in link by WhatsApp. It works once; after that the person stays signed in on that phone. Helpers use the same kind of personal link, which shows all their tasks across teams.
- **Email sign-in later**, as a backup for a new phone. Supabase's built-in email only sends to the project's own team at 2 messages an hour, so this needs a free email-sending service connected to Supabase.
- **Keep-alive:** free Supabase projects pause after a week with no use, so a weekly GitHub Actions job keeps the project awake through the off-season.
- **Secrets** (Supabase access token, database password) live in the GitHub repo's secrets for the publish workflow, never in the app or in chat. The app only carries the project URL and the public anon key.
- Private data (phone numbers, injuries, notes, attendance, who is doing which task) is protected by the database's row-level access rules: it is never sent to a phone that isn't allowed to see it.

## Roles

A person can hold different roles in different teams (coach of one, player in another) and several roles in one team. Full Admin covers every team; the other roles only cover the teams someone has been added to. Anyone in more than one team gets a team switcher.

- **Full Admin** (product owner): everything in every team; creates, archives and deletes teams; adds and removes staff and players and changes roles; owns the shared library; product settings, backups and defaults for new teams.
- **Coach** (the football side): lineups, game systems and the team's own plays; uses library plays (switch on, or make a team copy); training focus and roll call; sees the whole squad including phone numbers (view only), availability and injuries, and can update injuries and availability; messages; invites players.
- **Team Manager** (the admin side): squad details and contact details; injuries and availability; training schedule, roll call and attendance; messages and notices; event details; invites and removes players and helpers; runs volunteer tasks. Lineups, game systems and plays are view only. When a team has no coach, or the coach is away, the admin can give the manager the coach role in that team as well.
- **Player**: schedule, notices, countdown, squad names, lineups, game systems and the plays the coach has switched on; own contact details; replies to their own tasks and RSVPs to sessions. No one else's phone number, injuries, notes or attendance.
- **Helper** (family, friends, community): their own tasks, the noticeboard and the days they're helping. Can be linked to a player (for example a parent). Can help more than one team.

| | Admin | Coach | Team manager | Player | Helper |
|---|---|---|---|---|---|
| Teams, staff and roles | ✓ | – | – | – | – |
| Play library (plays, game systems, player lists) | edit | use, copy | view | view if switched on | – |
| Team plays, lineups, game systems | edit | edit | view | view | – |
| Squad names, numbers | edit | view | edit | view | – |
| Positions | edit | edit | edit | view | – |
| Phone numbers | edit | view | edit | own only | own only |
| Injuries, availability | edit | edit | edit | own availability | – |
| Training schedule | edit | edit | edit | view, RSVP | days they help |
| Roll call, attendance | edit | edit | edit | own only | – |
| Messages, notices | send | send | send | read notices | read notices |
| Invite players | ✓ | own teams | own teams | – | – |
| Team settings (field, mixed rules) | edit | edit | view | – | – |
| Tasks: create, assign, track | all teams | view all, add | ✓ | – | – |
| Tasks: see all tasks and their status | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tasks: see who is assigned | ✓ | ✓ | ✓ | own, and others on the same task | own, and others on the same task |
| Tasks: reply to own, sign up for open spots | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add and remove helpers | ✓ | – | ✓ | – | – |

## The library

Library plays, game systems and player lists are made by the admin and show on every team's Plays and Lineup pages. A coach switches on the ones they want; that team's players then see them. In a team they're read-only; "Make a team copy" gives the coach their own version. When the admin updates a library item, every team using it gets the update; team copies stay as they are, with a note that a newer library version exists. The current starter plays and the seven game systems become the first library content, and DragonTag the first team.

## Volunteer tasks

Tasks such as running the BBQ, bringing the gear or giving lifts, assigned to players, family, friends and community helpers, and tracked.

- A task has what it is, when and where (or a training session), instructions, and how many people it needs.
- Each person on it is asked, accepted, can't, or done. Someone who can't frees their spot.
- Open spots can be signed up for by anyone in the team.
- Rotations (for example the gear bag each training), reusable checklists and copying a day's tasks to another day.
- Lifts: drivers offer seats, and riders are put in cars.
- Tracking: what's unfilled or waiting on a reply for an event, and each person's helping history so the load is shared.
- Reminders open WhatsApp with the message written (no automatic sending, which would need WhatsApp's paid business service).
- Visibility: everyone sees all tasks and whether each spot is assigned, available or done; only admin, team managers and coaches see who is assigned; people on the same task (such as a driver and their riders) see each other's names.

Until logins arrive, players can't reply for themselves: they see the tasks and spots without names and tap "I can help" to message the person running tasks, who records it.

## Still to confirm

- Coach / team manager split: proposed as above (coaches see phone numbers, managers don't edit lineups).
- Proposed defaults: game systems go in the library too; only the coach's own teams for now, no club level; helpers see the noticeboard and the days they're helping.

## Prepared for logins (October 2026 upgrade, no logins yet)

The upgrade on branch `upgrade/milestones-0-5` added what works without individual logins, and left room for them:

- Teams already have stable ids and their own data, so a person's role can later be held per team.
- RSVPs, match availability and task replies are stored with `via: 'coach'` and a time. A signed-in player's own reply would carry `via: 'self'`; nothing else needs to change.
- Players' replies today go to the team contact on WhatsApp and change nothing until the coach records them. No name, player id or link is treated as proof of who someone is.
- The library is the admin library described above, currently owned by the one coach workspace.

Still to come with logins: people replying and signing up for themselves, people on the same task seeing each other's names, and per-role views (coach, team manager, player, helper).

## Build order

1. Volunteer tasks in the current app (coach runs them, players see tasks without names).
2. Database, sign-in and invites; move DragonTag's data across; admin screen for teams and roles.
3. Team switcher and each role's view, following the table above.
4. The library.
5. Tasks per person (replies, sign-ups, same-task names) and session RSVPs.
