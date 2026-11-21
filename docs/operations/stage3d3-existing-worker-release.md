# Stage 3D.3 | Existing Cloudflare Worker release handoff

**Existing target only:** `team-manager` at `https://team-manager.paul-domoney.workers.dev`, using Supabase project `uyjxvaobshaahzipzzds`. Do not create a second project, Worker, or database. Preserve the legacy root, Tactics/play editor and all eight encrypted assets while adding `/cloud-access.html`, `/cloud-team.html` and `/cloud-registration.html`.

## Verified foundation (21 November 2026)

- PR #278 was merged at source `a2d31ff41e5bf92d4f28d53f54009876333f434c`. The PR tests passed. The first post-merge WebKit run had a ResizeObserver page error after 74 functional checks passed; one bounded rerun of the same merged source subsequently passed all four jobs. This is not physical Safari acceptance.
- The owner verified ten matching production Supabase migrations and both profile RPCs. Do not reapply or reset the database.
- Eight encrypted files were preserved in the earlier locally built candidate. That candidate was built from the pre-merge PR head `00a06e1`; it is **not** qualified for deployment as merged `main`.
- The opt-in `wrangler.stage3d3-existing.jsonc` supplies the public Supabase URL and publishable key to the Worker. `SUPABASE_SECRET_KEY` is **not** in source control. The Worker requires it in protected Cloudflare secret storage for trusted APIs. Public keys do not grant any permission.

## A. Read-only Cloudflare preflight (no version or secret changes)

1. Inspect **Cloudflare → Workers & Pages → team-manager → Settings → Builds**. Record whether a Git integration is enabled, its production branch, exact **Build command** and **Deploy command**. Do not assume GitHub Pages Publish deploys Cloudflare. Automatic Cloudflare Builds can deploy on a push to its production branch.
2. Record the live Worker's current version/deployment ID, routes, domains, existing variable and secret **names only**, and a confirmed rollback path. Never disclose secret values.
3. Retrieve `/data/manifest.json` from the **existing** Worker and compare its file list with the authoritative `data` branch. Compare the SHA-256 values of the encrypted file bytes on the Worker with local approved encrypted files. Do not decrypt or copy personal records.
4. Check legacy `/`, `/index.html` and Tactics/play editor. Any mismatch, missing backup/version or unknown Git deploy behaviour is **HOLD** before traffic changes.

Read-only CLI commands (authenticate to the correct existing Cloudflare account first):

```sh
npx --yes wrangler@4 deployments list --name team-manager --json
npx --yes wrangler@4 versions list --name team-manager --json
npx --yes wrangler@4 secret list --name team-manager --format pretty
```

**Do not use** `wrangler secret put` during preflight: Cloudflare documents that it creates **and deploys** a version immediately. `wrangler versions secret put` creates an unpromoted version, but even that is a privileged version mutation requiring owner installation approval. See [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/) and [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).

## B. Source-bound candidate assembly (no deployment)

After merging the activation configuration PR, use its **actual merged main SHA**, not the SHA in this historical note:

1. Fetch and fast-forward `main`. Check no tracked edits, and retain the eight ignored `data/*.enc.json` source files. Check their names and manifest against the existing Worker first. Do not delete them.
2. Inspect the previous `dist-stage3d3-existing/` output. Archive the old **disposable** candidate safely into the already ignored `.stage3c-private/` location, preserving files and without clobbering any earlier archive.
3. Assemble a fresh exact-source legacy `dist/` using `GITHUB_SHA="$SHA" DATA_DIR=data WATCH_DIR=rules-watch OUT_DIR=dist node src/build.js`.
4. Set the exact public values `STAGE3D3_SOURCE_SHA="$SHA"`, `STAGE3D3_SUPABASE_URL=https://uyjxvaobshaahzipzzds.supabase.co`, `STAGE3D3_ORIGIN=https://team-manager.paul-domoney.workers.dev`, `STAGE3D3_SCOPE=individually-authorised-adults-only`, `STAGE3D3_PROVIDER_METHODS=off` and `STAGE3D3_SUPABASE_PUBLISHABLE_KEY` from `site/cloud-public-config.js`. Unset `STAGE3D3_SEASON_REF`. Use `node scripts/stage3d3-existing-worker-build.mjs`.
5. Run `node scripts/stage3d3-existing-worker-release-check.mjs`. It must print `LOCAL_CANDIDATE_QUALIFIED_NOT_DEPLOYED` and eight encrypted files verified; public bindings match, no team or season is seeded and optional provider controls stay disabled. This check makes **no network calls or changes**.
6. Run `npx --yes wrangler@4 deploy --config wrangler.stage3d3-existing.jsonc --dry-run`. A successful dry run still is **not** a deployment, recovery check or authority to onboard users.

## C. Owner-held activation and acceptance

**HOLD** live deployment until the existing Worker version and Git deploy settings, live encrypted asset comparison, tested recovery path, exact-source candidate, current production schema, approved adult privacy/terms documents and reviewer, intended Auth setup and protected Cloudflare secret are verified. The current candidate's `releaseStatus` remains `NOT_INSTALLED_NOT_ACCEPTED`.

After a separate explicit installation decision, configure the server-only `SUPABASE_SECRET_KEY` using protected Cloudflare secrets and the approved version path. Deploy only the qualified existing Worker package using `wrangler.stage3d3-existing.jsonc`. Verify actual active version, root/editor and eight legacy assets, three connected pages, denied unauthenticated APIs and rollback. No Supabase resets or new migrations.

Then configure approved adult sign-in/recovery, independently approve the first Platform Owner/Coach and Manager grants, verify `tm_my_profile` and `tm_save_my_profile` through the installed application, and test wrong-team denial, role revocation, session expiry and real Safari. No automatic signup, fictional-team bootstrap, minors or guardian data until their separate approval. Stage 4 Tactics remains deferred.
