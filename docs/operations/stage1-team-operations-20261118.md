# Stage 1A–1D: consolidated first-team operations (18 November 2026)

**SOURCE CANDIDATE ONLY. NOT DEPLOYED, NOT A TEAM-MEMBER RELEASE.**
Stage 1 is a stacked review against the still-open RC1 identity PR #265. The original Team Manager Home/Schedule/Team/Tactics/More, E5 play data/editor/animation and GitHub Pages encrypted demo remain unchanged. There are no new images or brand assets. Nothing is connected to live private records. The production release ledger, L0–L6, privacy and P13 gates remain HOLD. The existing first-team 24-hour recovery tolerance is not altered or qualified by this change.

## One fictional team end-to-end

1. Sign in as an existing invited fictional account through the separately reviewed RC1 page. The Supabase user endpoint cryptographically validates the bearer token; `tm_my_team_context` enumerates only approved, exact-team roles. Neither this result nor a browser role selector is itself authorisation.
2. Open the **isolated** `cloud-operations.html` preview and select one verified role/team. Every operation is independently authorised against current private role grants through a Worker API and a single private PostgreSQL RPC. There is no direct browser access to `tm_private`.
3. Coach or Manager creates/edits/cancels **training**, not official fixtures. Coach or Manager nominates a person to a pending team participation without proving club registration/eligibility. Assistant Coach can edit training but cannot manage roster or publish lineups.
4. A player sees their team's schedule and submits only their own RSVP; a separately approved Manager assigns a verified volunteer to a team session, and that volunteer sees and responds to **their own** duty.
5. Refresh from another fictional signed-in client to confirm persisted updates. A stale edit, conflicting mutation ID, foreign team, revoked grant, forged field, unverified player/volunteer or unauthorised role must be rejected. One-transaction mutation, version check, replay receipt and append-only successful-write audit must commit or roll back together.

## Source and runtime boundaries

- `supabase/migrations/20261118030000_stage1_team_operations.sql`: depends in order on the existing *foundation* `20261118010000` and RC1 *team-context* `20261118020000`. Adds only scoped training labels, participation versions, mutation result receipts and `tm_stage1_operation`. New routine/private tables keep forced RLS with no browser grants; the new RPC is service-role-only. Postgres privileged-owner / service-role bypasses RLS and **must never be exposed** in a browser or repo secret.
- `worker/stage1-api.js`: isolated Cloudflare Worker route `POST /api/stage1/v1/operation`. Expected restricted bindings: `SUPABASE_URL` (project HTTPS origin), `SUPABASE_PUBLISHABLE_KEY` (public), and `SUPABASE_SERVICE_ROLE_KEY` (private Worker secret). No service key is checked into Git, inserted into static assets, used in a URL or returned in responses. It verifies the presented token via Supabase `/auth/v1/user` on every request, rejects unrecognised input, then invokes the private RPC. **The Worker is source-only; it is deliberately NOT configured in the current production `wrangler.jsonc` or Cloudflare deploy command.**
- `site/cloud-operations.{html,css,js}`: branded, responsive **standalone** page; it is not linked into the existing demo navigation. The page's API currently fails closed until a separately qualified, owner-approved Worker route and database apply exists. Token stays in sessionStorage from RC1. Client-side form/role conditions are helpful UX only, not security controls.
- The original `src/first-team-server-boundary.js`, legacy encrypted publishing, release evidence ledgers, E5 play revision model, GitHub Pages and existing Wrangler configuration are not replaced. The new source does **not yet implement live play editing/publishing**, which remains a separate required first-team journey and release blocker.
- No real sign-up, guardian verification, health/WWCC data, medical/safeguarding information, children’s live records, real volunteers, or real team API use is authorised.

## Source-only qualification

- `npm test`: original Node regression suite plus `test/stage1-api.test.js` for verified identity, exact scope, bounded request/response, digest, invalid/revoked/malformed service paths, privilege/key absence and demo-build preservation.
- `python3 test/browser/run_all.py --skip-unit --out qualification.json`: Chromium synthetic login and the new four-role `test/browser/cloud_operations.py` journey at 390px and 1280px, as well as the existing team, tactics and role regressions.
- Existing targeted WebKit E5 path and touch tests unchanged.
- New CI job `stage1-postgres`: PostgreSQL 16 **fresh ephemeral service**, uses `supabase/tests/stage1_bootstrap_disposable.sql` with fictional `auth` role stubs, then all three versioned migrations, two earlier SQL ACL tests and `supabase/tests/stage1_persistent_journey.sql`. The end-to-end script rolls back all invented rows and injects an audit failure to prove rollback. This is a **Supabase-compatible PostgreSQL model**, not an execution against Supabase Auth/RLS in a live project.

Check the exact final PR-head SHA and all CI statuses before review. Do not claim real server/provider security, installed schema, Safari/VoiceOver, two-device physical acceptance, backup/restore or P13's independent security matrix from green source/synthetic CI.

## Owner release gate remains unchanged

Before any real installation: resolve PR #265 and Stage 1 ownership/target, inspect the approved backend/region/provider/privacy controls, confirm migrations have not already been applied, rehearse all migrations and ACL/positive/negative tests in a separately approved disposable Supabase-compatible environment, verify backup/restore and ability to back out, complete explicit individual onboarding and D21/minor safeguards, qualify P13B/C and independent iPhone/macOS Safari and two-device journeys, then seek explicit owner cutover approval. **Do not deploy the Worker, apply the SQL, add live users, or import live data merely because this PR merges.**

Source CI is necessary but not production acceptance; any failing or missing check remains visible. This PR is intended to be left **OPEN / DRAFT / UNMERGED** for review.
