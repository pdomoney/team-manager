# Stage 3D.5 corrective functional completion | Source and operator acceptance

**Status: PR #285 DRAFT. NOT MERGED, NOT DB MIGRATED, NOT WORKER INSTALLED, NOT OWNER ACCEPTED.**

Product acceptance remains OPEN after merged PR #284 `fa71cd30830f789a0e3c625bf040e262190ffccc`. The owner has verified one-login / Platform and Coach chips in the live St George Oztag team, but rejected management feature regression against the established development application.

## Differentiating product identity, not a replacement dashboard

- Preserve the accepted native app vocabulary, button labels, team chips, home/desktop sidebar, mobile navigation, rich More menu, E5 encrypted play/tactics demo, existing seven-club fictional fixture library and all eight protected ciphertext files. Demo is never imported into Supabase.
- In the **real** first-team app, authorised Owner goes to Platform, then selecting sole St George team opens Mixed 20 2027 directly. Existing synthetic Stage 2/3C apps retain their original acceptance paths.
- Coach/Manager access is exact-team. A Head Coach performs ordinary Team Manager duties when no active verified Manager is appointed; not a fabricated Manager grant. When a Manager becomes active, the Team Manager duties transfer, and a revoked/expired Manager returns fallback. Other teams' roles do not combine.
- Coach or Manager can invite verified **adult** Players and Volunteers for their own team, with real identity and policy checks and audit. Elevating another Coach, Team Manager, Club Admin or Platform Owner remains a separate approved administrative responsibility. A Trainer is a sport-specific appointment, not a synonym for Team Manager or an automatic first-aid qualification.

## Actual connected functionality

| Existing management feature | New connected implementation | Important boundary |
| --- | --- | --- |
| More menu | Familiar Messages, Noticeboard, Volunteer tally, Reports, Competitions, Clubs/Teams, People, Jerseys, Settings | Real authorisation controls the content |
| Team settings | Team label, training defaults, contact and jersey-loan preference | No legacy GitHub publishing credentials/settings brought into live UI |
| Jerseys | Assign to active participant in selected team/season; outstanding, return and history | Cannot silently mark sporting registration or medical clearance |
| Competition management | Team-created local league/tournament/carnival, entry status, dates/grade and team-recorded fixture | Cannot mutate or certify official competition draws |
| Messaging | Composed templates, WhatsApp open, native Share/Copy, manual prepared/sent/not sent log | WhatsApp send is manual, no API/automatic delivery claim |
| People | Real selected-team participations and names only where account-person profile verified | No raw child/emergency/health data or fictional Comets players |
| Volunteer duty | Non-accredited task categories; verified volunteer link required | Not a Trainer/Match Official appointment |
| Adult Player/Volunteer onboarding | Approve and issue team invitation, record individual adult evidence, activate exact role, cancel/revoke | No direct role grant from an email alone |
| Coach/Manager | One active team grant per operation, trusted Worker and service-only private SQL | No crossover to Platform Owner/private other-team records |

## Code location and release sequence

- Private schema, staff/Manager fallback helpers: `supabase/migrations/20261123010000_stage3d5_functional_completion.sql`
- Private service-only exact-team RPC: `supabase/migrations/20261123010100_stage3d5_team_rpc.sql`
- Strict role/action validation: `src/stage3d5-management-contract.js`
- Trusted GoTrue + policy checked API and email result handling: `worker/stage3d5-management-api.js` and `worker/index.js`
- Existing-brand connected management UI: `site/cloud-team.js`, `site/cloud-management.js`, `site/cloud-management-experience.js`, `site/cloud-team.css`
- Positive and negative tests: `test/stage3d5-functional-contract.test.js`, `test/stage3d5-worker-api.test.js`, `supabase/tests/stage3d5_functional_completion_disposable.sql`, extended `test/browser/stage3d5_team_chips.py`.
- CI: Node, disposable PostgreSQL migration and rollback transaction, Chromium, WebKit. Linux WebKit is not a physical iPhone Safari qualification.
- Before deploying to existing Supabase project `uyjxvaobshaahzipzzds`: ensure PR MERGED, exact green source, backup taken and recoverability verified, no frozen-hash conflict or incompatible live schema. Apply SQL in **exact order** once. Owner personally verifies read-only `to_regprocedure('public.tm_stage3d5_team(uuid,text,text,text,jsonb)')` and tables in existing project; stop on SQL error.
- Before deploying to existing Cloudflare Worker `team-manager`: verify current active Worker identity/version, same account, bindings by name only, preserve eight ciphertext bytes and previous Worker version, cloud build drift, then exact merged source build+dry-run. Install Worker **after** SQL, never before. Roll back Worker on app failure; database rollback requires its separate verified backup and approval.
- After install: use existing Owner login, St George Coach, create local tournament, settings persistence, jersey issue with disposable adult Player, manual WhatsApp prepared log, adult invitation/claim/activation/revocation, Manager takeover/revocation, no cross-team access, iPhone Safari and old encrypted demo. Owner acceptance is independent of successful install.

No password, person profile, service key, private adult verification evidence or sensitive production record is committed.
