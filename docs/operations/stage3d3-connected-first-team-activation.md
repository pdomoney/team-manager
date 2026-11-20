# Stage 3D.3 | Connect first-team authentication and staging service

**Status: SOURCE READY FOR REVIEW, REAL INSTALLATION HOLD.** This instruction
does not approve cloud provisioning, vendor spending, real accounts, personal
records, participant invitations or production use. Use the source PR head SHA
and independent installation evidence, never an old hash copied from this note.

## Target and non-goals

- **First real club/team:** St George Oztag / Mixed 20 (`stgeorge-mixed20`), sport Oztag; season must be explicitly confirmed.
- **First authenticated actor:** one Coach account can separately hold Platform Owner and exact-team Coach grants, each independently approved.
- **Independent approver:** another adult, independently verified and authorised for the bootstrap. Later first Manager is a **separate** explicit approval, not automatically the reviewer.
- **Stage 3D.3 runtime:** an isolated first-team **adult-only staging Worker** and **distinct approved Supabase project**, not the prior public GitHub Pages demonstration or Stage 3C fictional project.
- **No under-18 / guardian / emergency-contact or real roster records** until L0 privacy, safeguards and fields are independently approved. The owner's privacy register already states Mixed 20 will include under-18 players; the team name itself establishes nothing about ages.
- Stage 4 Tactics/Play Editor, official fixtures, league registration and migrations of encrypted demonstration workspaces remain out of this first management release.

## 01 | Confirm environment and authorities before installation

Operator records evidence privately, without credentials in GitHub, Actions
outputs, this chat or exported artifacts:

1. **Existing-resource check:** list existing Supabase projects and Cloudflare Workers; inspect their names, regions, hostnames, billing ownership and access before considering a new service. A missing config variable does not prove a project is absent. Do not reuse the historical `uyjxvaobshaahzipzzds` Supabase preview or the existing `team-manager` Worker.
2. Explicit provider/plan/region/cost authority, Australian data-control/processor review, lawful purpose and retention, under-18 safeguarding (including optional guardian login vs verified contact), approved first-team season, accepted one-team scope (maximum 50 proposed users), and reviewed first-team privacy/terms **version and document hash**. All are currently UNVERIFIED for live processing.
3. Owner names an authorised independent first-Coach reviewer and confirms reviewer identity verification method. Their identity cannot be inferred from the platform-owner role. The first Manager additionally needs individual approval.
4. Off-site backup/encrypted restore ownership, 24-hour *recovery point* objective with **actual restore evidence**, recovery responsibility/rollback, operator access, DNS/domain control and release health evidence. A 24-hour RPO is not a 24-hour recovery time.
5. Approved external installation process and frozen source SHA; verify current `main`, accepted tag, migration order/schema compatibility, destination project and available rollback. Production L0–L6 remain HOLD until separately evidenced.

**HOLD** real project changes if any mandatory approval is missing. Safe source tests do not require it.

## 02 | Verify isolated provider settings (operator in private admin consoles)

**Supabase Auth:** identify the **approved new project** and check region/plan.
Confirm site URL and allowlisted redirect are the **exact** new HTTPS first-team
origin ending in `/cloud-access.html`; no open redirect patterns, no GitHub Pages
demo URL. Inspect (do not automatically enable) email/password, invited-user
one-time email code with `create_user:false`, Google OAuth, Apple OAuth and
manual identity linking. Confirm provider callback goes to the project's own
`/auth/v1/callback`, app return goes to the first-team login. Check the Google
and Apple apps already registered before creating credentials; Apple Service ID,
private relay handling and client-secret rotation need an authorised owner.

**Email delivery:** use the approved SMTP account/provider, sender identity,
invitation/recovery templates, Supabase `{{ .Token }}` email OTP rendering,
rate limiting, expiry and anti-enumeration. Verify separately using allowed
adult test accounts. Never paste an OTP, provider secret or real email recipient
in a public log.

**Cloudflare Worker:** verify the distinct `team-manager-stgeorge-stage3d3`
target and its actual origin, binding, secret names and access permissions.
Ensure `run_worker_first:true` and `STAGE3C_MODE=management-only` so
`/index.html`, `/data/*` and `/api/stage2/*` remain inaccessible. A green
Cloudflare build of the *older* `team-manager` Worker does not install this service.
Review allowed origins/CORS for the exact approved Supabase and Worker pair.

## 03 | Build exact-source, no-credentials first-team assets

These are **build instructions only**, NOT a deployment approval. Run from a
fresh authorised clone at the accepted source commit. Keep this configuration
in a private operator session, never commit it:

```bash
git rev-parse HEAD # compare with separately approved frozen SHA
export STAGE3D3_SOURCE_SHA="$(git rev-parse HEAD)"
# Set these in your PRIVATE operator session to the approved values:
# STAGE3D3_SUPABASE_URL=https://<approved-distinct-project>.supabase.co
# STAGE3D3_SUPABASE_PUBLISHABLE_KEY=<approved-public-publishable-key>
# STAGE3D3_ORIGIN=https://<approved-dedicated-first-team-origin>
# STAGE3D3_SEASON_REF=<verified-four-digit-team-season>
export STAGE3D3_SCOPE=individually-authorised-adults-only
export STAGE3D3_PROVIDER_METHODS=off
node scripts/stage3d3-build.mjs
```

The builder rejects stale SHA, wrong origin, the original preview Supabase,
unsafe public keys, absent season, wrong scope, output collision, missing
Stage 3C module closure and legacy files. It outputs **`dist-stage3d3/`**,
not `dist/` or `dist-stage3c/`. It always marks the public manifest
`NOT_PRODUCTION_AUTHORISED`.

Only after privately inspecting Google, Apple, email, approved exact redirect
and adult scope, a separate controlled candidate build may use:

```bash
export STAGE3D3_PROVIDER_METHODS=on
export STAGE3D3_PROVIDER_SETUP_REVIEWED=yes
node scripts/stage3d3-build.mjs
```

Those flags are **not** signatures or legal approval, and do not deploy or
create user accounts. Do not use them to bypass required provider checks.

## 04 | Controlled service installation (REQUIRES separate explicit authority)

After preflights, backup/frozen-source/host review and named installer approval,
the candidate command would be:

```bash
npx wrangler deploy --config wrangler.stage3d3.jsonc
```

Do not run this from CI or the historical static Pages publisher. Verify the
actual deployed URL, source SHA in `stage3d3-manifest.json`, management-only
root redirect, blocked demo data/play endpoints, Worker service credentials
managed in secret storage and an unauthenticated 401 against protected APIs.
A public build manifest and accessible login do **not** constitute a release.

## 05 | Independently approved accounts and exact team, NO auto-creation

After reviewed provider, privacy, data-controller and role decisions:
- Confirm two distinct verified adult Auth accounts privately; the bootstrap
  Coach/Platform Owner and an independent approver. **No anonymous signup**
  yields team access. A signed-in Google/Apple identity is not itself an
  approved sporting Person.
- Privately apply the ordered existing versioned migrations, not a fictional
  Stage 3C seed. Only on an empty independently approved database, use
  `supabase/stage3d/bootstrap_first_live_team.sql` with the five required
  private `psql -v` arguments, a verified season and external attestation.
- Select and approve an actual first Manager separately. Then run
  `supabase/stage3d/bootstrap_first_manager.sql`, never auto-promote the
  first-Coach reviewer.
- Require the **approved** versioned terms/privacy acknowledgement with
  server-enforced acceptance before any protected real team operation.
  There is **no accepted privacy notice document/version/hash or server
  acknowledgement implementation qualified for live use yet**: this is a
  genuine **HOLD** for real activation, not an invitation to use a placeholder.
  Do not fake a checkbox or assume a login alone proves consent.
- Complete approved adult staging invitations, separately reviewed Person
  links, revocation, Google/Apple private relay/linking and two-device
  sign-in tests. Real junior profiles stay blocked until independent safeguarding and field approvals.

## 06 | Acceptance and release progression

- **3D.3 adult connected staging:** real provider email/Google/Apple, trusted
  Worker origin, approved adult Coach + independent Manager, both distinct
  Platform Owner/Coach contexts, no implicit permissions, connected write/read
  on authorised approved trial data, cross-team and unauthenticated denial.
- **3D.4:** eight required management/account journeys for real first team,
  independently evidenced with the user-scoped roles.
- **3D.5:** 59-case real server security suite, privacy/safeguarding/WWCC
  assessment where applicable, off-site backup restore and rollback, physical
  iPhone/macOS Safari and accessibility/recovery.
- **3D.6:** L6 exact-source/runtime review, operational readiness, final
  owner go-live acceptance and monitoring.

**Present:** Source-only 3D.3 isolated build and tests.
**Not present:** provider-console access/approval, actual runtime, real users,
accepted policy, independently verified restored backup or production go-live.
The release evidence ledger stays deliberately BLOCKED.
