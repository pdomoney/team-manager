# Stage 3C | Connected first-team management staging

**Programme approved 19 November 2026. Current state: staging source
development, not an installed or accepted environment.**
This is a functional staging handover, not a general-purpose infrastructure
programme. Preserve the existing encrypted demo and accepted E5 plays.
**Tactics is deferred to Stage 4**, after management rollout.

## Goal, scope, and authority

One separately provisioned, non-production Supabase project plus one distinct
`team-manager-stage3c` Cloudflare Worker. Four real **adult** test accounts
(Coach, Manager, Player, Volunteer), a fictional Oztag team and an inert foreign
team for negative permissions. The site publishes **no** encrypted demo data,
real squad roster, junior/guardian records, contacts, accreditation, injuries
or medical information. First-team production remains 0/7 live release gates.

**Development approval is not supplier selection, live installation,
real-email outreach or personal-data processing approval.** Before executing
the staged install below, record explicit owner approval for the selected
Supabase project/region/plan, Cloudflare account/domain, customer controller
and test-user notice, the four permitted emails, incident/retention policy,
mail delivery provider, source SHA, migrations, encrypted pre-install
snapshot and recovery process. **HOLD** if any protected baseline,
existing-data schema or installer boundary cannot be verified. Do not create
users or connect an existing personal-data project as a shortcut.

## What is built in the Stage 3C source increment

- `scripts/stage3c-build.mjs`: creates an isolated site from an exact Git
  commit and an explicit alternate Supabase public project URL. It copies
  only the signed-in cloud pages and static module dependencies. It excludes
  the legacy `index.html`, encrypted data, Test Library and unpublished
  product demo, and marks the build source in `stage3c-manifest.json`.
- `wrangler.stage3c.jsonc`: separate Worker name and directory,
  management-only mode and Worker-first routing. No credentials in Git.
  Stage 2 E5 Play API is denied in this staging Worker; the accepted E5 source
  and public demo are not removed.
- `worker/supabase-admin-key.js`: supports current `sb_secret_...`
  with an `apikey` header only. Legacy service-role JWT is still accepted
  for existing isolated tests but **must not be supplied alongside** a new
  key in a live installation. Only the Worker holds elevated credentials.
  Supabase Auth still validates each user's JWT; exact team roles are
  enforced by the database on each operation.
- `supabase/stage3c/bootstrap_reviewers.sql`: optional, separately
  authorised **one-time** bootstrap of two independently reviewed adults.
  It fails for duplicate accounts or existing grants. A fictional team and
  separate denial team are created only after verified email and external
  human-review attestation. Player/Volunteer are subsequently invited
  through the normal team workflow.
- `scripts/stage3c-live-verify.mjs`: read-only verification of four real
  existing identities, exact team grants, actual Worker/Supabase reads,
  foreign-team denial and no unauthenticated role elevation. It outputs
  result codes, not identities, tokens, email addresses or private records.

## 3C.1 | Mandatory operator preflight

Record in protected operator evidence: source SHA, provider account/project ID
and Sydney/selected region, pricing and expected usage, auth/email configuration,
DNS origin, access administrators, allowed data classification, verified
adult status and any actual source/runtime hash/installer/schema conflicts.
Confirm the project is **not** the source's historical
`uyjxvaobshaahzipzzds.supabase.co` public identity preview. Confirm
Cloudflare Worker domain is distinct from the main Pages site. Review
Supabase service key privileges, rate limits, email templates, allowlisted
redirect ending in `/cloud-access.html`, testing notice and SMTP provider.
A failed mail attempt is not a delivered invitation.

**STOP** if owner approvals, backup, rollback or a genuinely isolated
new project cannot be verified. No scripts here create a Supabase project
or deploy anything automatically.

## 3C.2 | Isolated setup, once installation is separately authorised

1. On the **exact reviewed source SHA**, use a distinct staging Supabase
   project, a staging Cloudflare account/Worker and four adult test identities.
   Do not reuse the published Pages site as an authenticated backend.
2. Capture a pre-change snapshot or confirm the isolated project is empty.
   Review the schema differences and apply the versioned migrations in order:
   `20261118010000_first_team_private_foundation.sql`,
   `20261118020000_first_team_my_context.sql`,
   `20261118030000_stage1_team_operations.sql`,
   `20261119010000_stage2_operator_context.sql`,
   `20261119020000_stage2_play_revisions.sql`,
   `20261119030000_stage3a_minimal_account_profiles.sql`,
   `20261119040000_stage3a_onboarding.sql`,
   `20261119050000_stage3b_management.sql`.
   These migrations are **not** applied by running `npm test` on a linked
   environment; the CI PostgreSQL is disposable. Never run
   `supabase/tests/stage1_bootstrap_disposable.sql` on Supabase.
3. Establish Coach and Manager real, confirmed adult Auth accounts using
   the approved email process. Independently verify each adult and
   record a protected attestation. With explicit installer authorisation,
   execute `supabase/stage3c/bootstrap_reviewers.sql` **once** under the
   approved SQL administrator with `psql -X -v ON_ERROR_STOP=1` and the
   private `coach_uuid`, `manager_uuid`, `approval_ref` arguments.
   The reviewer accounts and signed-in grant scopes must be distinct.
   The script does not infer eligibility, sports registration or identity
   merely from confirmed email. It fails on repeat or existing accounts.
4. Determine the dedicated staging Worker hostname and set these
   **public build inputs in the operator's local shell**, not in Git:
   `STAGE3C_SOURCE_SHA` (exact checked-out SHA),
   `STAGE3C_SUPABASE_URL` (new `https://*.supabase.co` URL),
   `STAGE3C_SUPABASE_PUBLISHABLE_KEY` and
   `STAGE3C_ORIGIN` (Worker HTTPS origin). Run:
   `node scripts/stage3c-build.mjs`. Check the resulting
   `dist-stage3c/stage3c-manifest.json` and that no old app or
   encrypted `data/` exists. Build refuses mismatched source SHA or
   the historical preview project.
5. Set Worker secrets **privately**, via the approved Cloudflare account:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SECRET_KEY` (preferred current secret, **never in client
   assets**), and `ONBOARDING_REDIRECT_URL` set to the approved
   staging `/cloud-access.html`. `STAGE3C_MODE` comes from the separate
   Wrangler configuration. Do **not** set a legacy service JWT if using
   `SUPABASE_SECRET_KEY`. Confirm the browser build and Worker project
   references match before deployment.
6. Only with separate host/install authority, deploy the exact build through
   `wrangler deploy --config wrangler.stage3c.jsonc`. Confirm the
   Worker serves `cloud-access.html`, both signed-in pages and same-origin
   `/api/stage1/`, `/api/stage3b/`, `/api/stage3/`. Verify
   `/index.html` and `/api/stage2/v1/play` return 404 in management mode.
   Confirm immutable SHA and approved staging hostname. **Do not alter**
   `wrangler.jsonc` (existing product) or GitHub Pages deployment.
   Real outage/rollback uses the captured prior state and provider controls,
   not a blind `git pull`.

## 3C.3–3C.6 | Four-adult connected acceptance

After the two reviewers are authenticated, use the built-in **Team account
invitations** UI for a Player and Volunteer. Coach proposes, different
Manager approves, recipient activates and claims, independent person review
activates exact-team access. Never have a recipient approve their own grant.

Use `scripts/stage3c-live-verify.mjs` from a private operator shell.
Set `STAGE3C_ALLOW_CONNECTED_READ=yes`, the four distinct **ephemeral**
`STAGE3C_COACH_TOKEN`, `STAGE3C_MANAGER_TOKEN`,
`STAGE3C_PLAYER_TOKEN`, `STAGE3C_VOLUNTEER_TOKEN`, plus the
public build inputs above, `STAGE3C_TEAM_ID=stage3c-comets` and
`STAGE3C_FOREIGN_TEAM_ID=stage3c-denial`. Do not use persistent plaintext
token files or print tokens into CI or chat. Run
`node scripts/stage3c-live-verify.mjs` only against the approved staging
origin. The command makes **read-only requests**; its structured checks
must all pass against the **real** service. A passed mocked unit/browser
test is not a substitute.

Then complete the **real shared write journey**, recording PASS/FAIL with
the exact staging source SHA and platform/browser:

1. **3C.3 account flow:** Coach and Manager independently approve an
   adult Player and Volunteer. Verify actual invitation delivery,
   redirect, password setup, user profile, team/role grant and recovery.
   Verify expired/reused invitations fail, self-approval fails, no
   duplicate Person is inferred solely from email.
2. **3C.4 shared management:** Coach schedules a fictional training event.
   Player signs in separately and records RSVP; Coach and Manager see it
   refresh. Coach records attendance; Manager assigns a benign equipment
   duty; Volunteer responds. Coach publishes a players-only notice; Player
   sees it, Volunteer does **not**; Manager checks Attendance under Reports.
   Use a second device for one write/read. Never create official fixtures.
3. **3C.5 negative cases:** the same four sessions cannot access the
   denial team, a revoked user's previously open tab is denied on the
   next server request, and unauthorised users cannot approve their
   own role, change official fixtures, see another notice audience or
   override stale versions. Use the existing real 59-case server security
   contract as an *independent* gate later in 3D, not as a claimed CI result.
4. **3C.6 recovery:** sign out/in, recover a password, disconnect and
   reconnect two devices, then restore **only a disposable staging backup**
   under the platform operator's controlled restore procedure. Confirm
   sessions, attendance, notices and duties are preserved and grant
   revocation survives restoration. Capture backup age, encryption,
   restore duration and usable recovery point. Do not restore into the
   live team or claim a 24-hour RPO without evidence.

### Acceptance evidence (protected, no personal data in this repository)

For each step record source SHA, installed Worker source/build SHA, date,
approved operator, test-device details, action, expected result, observed
result, PASS/FAIL and restricted evidence reference. Never commit
identities, emails, passwords, session JWTs, actual invitation URLs,
personal-data exports, database backups or raw security findings.

A complete 3C requires **all six workstreams to pass against the real
connected staging environment**, not a merged PR. Stage 3D remains
independent: privacy/legal/minors/guardian safeguards, real restore and
24-hour RPO, physical iPhone/macOS Safari with accessibility, owner
acceptance, and all L0–L6 go-live gates. Stage 4 Tactics starts only after
the management product is installed and stabilised.
