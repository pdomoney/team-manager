# Stage 3D.3 | Activate EXISTING Team Manager Supabase + Cloudflare resources

**Owner direction: 20 November 2026.** Use the existing resources already created for
this product. Do **not** create another Supabase project, Cloudflare Worker or
demo environment. This supersedes the separate-project/separate-Worker target
assumptions in the earlier Stage 3D.3 handover only. All approved identity,
privacy, role separation, encrypted-data and release gates remain in force.

## 00 | Targets and preservation rules

| Component | Approved intended target | Current state |
| --- | --- | --- |
| Supabase | `Team Manager`, `uyjxvaobshaahzipzzds`, Sydney, Free | Existing project; user read-only inspection found 0 `public` tables, 0 `tm_private` tables and 0 matching functions. Auth users/migration history still UNKNOWN |
| Cloudflare | Existing Worker `team-manager` at `https://team-manager.paul-domoney.workers.dev` | Existing historical deployment; no reported runtime variables/secrets; installation of connected app not proven |
| Connected app | `/cloud-access.html`, `/cloud-team.html`, `/cloud-registration.html` on SAME Worker | Build candidate only, not installed |
| Historical app | Existing `/`, `index.html`, encrypted `data/`, Tactics and play editor | Must remain accessible and byte-identical |

The accepted source after PR276 is `e6fc772153d1b22121fb51152b23fb88a23e0347`.
When a new PR merges, re-read `main` and freeze that **new** SHA; never
reuse the old source hash to install a newer build.

The approved target *does not* mean approval to move confidential data,
turn on authentication, write SQL, set secrets or deploy automatically.

## 01 | Read-only preflight (safe to perform now)

1. GitHub: verify merged exact SHA, source build and required Tests/Publish
   workflows; keep current accepted Worker version/Cloudflare rollback available.
2. Cloudflare: inspect existing `team-manager` Worker name, live version,
   deployed asset configuration, runtime bindings, routes, attached domains
   and automatic Git build/deploy setting. Confirm whether a new Git push would
   redeploy it. Record what currently serves `/`, `index.html` and
   `data/manifest.json` without opening personal records.
3. Supabase: confirm existing `Team Manager` project reference, Free plan and
   Sydney region. Inspect only schema inventory, `auth.users` **count**
   (not account rows), and migration-history metadata to distinguish empty
   application schema from a genuinely unused identity service.
4. Review which encrypted data files the current Worker and GitHub Pages
   actually serve; identify the authoritative encrypted `data` branch and
   verified backup artifact. An empty source-built `dist/data` is **not**
   sufficient proof that the current deployment has no user data.
5. Confirm target season, approved adult-account scope, legal terms/privacy
   immutable hashes, independent reviewer, first Coach and Manager, SMTP and
   backup/restore ownership. Until verified, keep all 7 release gates on HOLD.

If existing installed Worker assets or encryption snapshots cannot be
reconciled, **STOP before deployment**, even if the new source tests pass.

## 02 | Source packaging (no deployment)

The existing Stage 3C builder intentionally continues rejecting the historical
project. The Stage 3D.3 builder now accepts that **owner-approved reuse** without
weakening Stage 3C's staging boundary.

Use `scripts/stage3d3-existing-worker-build.mjs` to combine:
- An **exact-source, already built** legacy `dist/` containing
  `index.html`, `app.js`, and `data/manifest.json` from the verified data
  branch, plus any existing encrypted data.
- The connected first-team Stage 3D.3 cloud assets and approved public key.

The builder refuses wrong project/hostname, stale SHA, missing encrypted
data, missing legacy assets, output collisions or changed non-cloud source
assets. It creates `dist-stage3d3-existing/` and labels its manifest
`NOT_INSTALLED_NOT_ACCEPTED`. It never deploys or writes Supabase records.

The existing `wrangler.jsonc` and GitHub Pages publisher remain unchanged.
A **separate, opt-in deployment descriptor** targeting the SAME existing Worker
is `wrangler.stage3d3-existing.jsonc`:
- Worker name `team-manager` (no new Worker)
- `STAGE3D3_REGISTRATION_MODE=required`
- no `STAGE3C_MODE=management-only`, because that would disable the legacy
  root, encrypted data, and Stage 4 tactics currently used by the demo
- `STAGE3D3_EXISTING_SHARED_WORKER_MODE=preserve-legacy-pages` closes the
  Stage 2 server play API in the first-team trial (HTTP 404), while
  preserving the existing static Tactics/play UI and encrypted demo data
- Worker entry is the existing reviewed `worker/index.js`, with API
  registration checks and the same-origin browser assets

## 03 | Pre-install gates (explicit further approval required)

1. Freeze merged source SHA, confirm Cloudflare deployment integration does
   not auto-replace the live Worker during build configuration changes.
2. Snapshot/backup existing Worker version, routes and assets and prove
   a rollback to its previously qualified version. Validate encrypted data
   completeness by manifest/name/checksum, not by assuming empty.
3. On Supabase, rehearse the ordered **versioned** database migrations with
   a disposable equivalent. The `supabase/tests/stage1_bootstrap_disposable.sql`
   file is for disposable PostgreSQL CI ONLY: **never run it in Supabase**.
4. Confirm target database already contains any migration history or Auth
   accounts (even though Team Manager application tables were reported absent).
   Do not reset, truncate or overwrite pre-existing users or schemas.
5. Apply the reviewed first-team private foundation and subsequent migrations
   including `20261120010000_stage3d3_registration_policy.sql` then
   `20261120020000_stage3d3_direct_rpc_registration_gate.sql` **only
   after separately accepted installation preflight and recovery evidence**.
6. Configure the existing Worker with its Supabase URL and publishable key.
   Keep `SUPABASE_SECRET_KEY` / legacy service-role key solely in protected
   Worker secret storage. Confirm no secrets appear in public assets.
7. Perform the combined exact-source build with provider controls OFF.
   Deploy **only under the authorised installation decision** using
   `wrangler.stage3d3-existing.jsonc`. Check the installed Worker version,
   root/plays/data preservation, connected page, denied APIs, and rollback.
8. Configure the existing Supabase Auth providers (Google, Apple, external
   SMTP) with exact existing Worker origin/redirects, after independently
   reviewed legal policies and adult account eligibility. Never self-register
   unknown users or auto-grant team access.
9. Complete separately reviewed Coach/Platform Owner and Manager bootstrap
   and account profiles (using existing `cloud-team.html` and
   `tm_my_profile`/`tm_save_my_profile`). No under-18 records until
   their approval.
10. Test real sign-in, registered-policy acknowledgement, profile save/reload,
    provider linking, recovery, wrong-team denial, revocation, two devices and
    preservation of existing `index.html`, Tactics, encrypted files.
    Independently record installed SHA and owner acceptance.

**Stop/rollback:** if a deployed asset differs unexpectedly, source or Worker
version cannot be established, personal data is exposed, a protected call
succeeds unauthorised, or the backup cannot be restored, stop traffic to the
new connected flows and roll back the Worker using its previously qualified
version. Do not blindly restore or delete existing Supabase state.

**Handoff:** Once connected adult authentication and profile read/write are
verified on these existing resources, proceed to Stage 3D.4's eight management
journeys. Stage 4 Tactics development remains deferred.
