# Stage 1A–1D: persistent team operations (18 November 2026)

**DRAFT SOURCE CANDIDATE, NOT INSTALLED AND NOT A LIVE TEAM RELEASE.**
This PR is stacked on open draft RC1 identity PR #265. The first-stage deliverable is **server-side persistence and API/domain contracts with synthetic end-to-end testing, not a new member-facing UI**. Existing Home/Schedule/Team/Tactics/More, team selector, existing club/squad management, green brand, GitHub Pages demo, RC1 sign-in preview, encryption, and all E5 play experiences stay unchanged. No images, logos, marketing assets or new dashboard are included. All L0–L6 first-team release gates remain HOLD.

## Approved Stage 1A–1D functions

- **1A, private persistence:** the existing 13-table `tm_private` foundation gains training title/location, versioned participation and committed mutation receipts. Player availability, sessions, volunteer duties and approved exact-team grants remain independently represented. No contact/health/guardian/WWCC fields are introduced.
- **1B, trusted API and transaction boundary:** `worker/stage1-api.js` is a proposed Cloudflare Worker handler for `POST /api/stage1/v1/operation` accepting a bearer, selected active team, role, action, resource ID and validated payload. The Worker verifies the bearer through Supabase Auth's user endpoint and passes only the independently verified account ID to `public.tm_stage1_operation`. The RPC requires `service_role`, checks active team/role and verified Person+participation/duty for players/volunteers, and performs optimistic mutations, replay receipts and success audits together in one database transaction.
- **1C, bounded operations:** Coach/Manager training create/update/cancel; Coach/Manager *pending* team nomination/withdrawal (not confirmed registration/eligibility); Player own schedule and RSVP; Manager independently verified volunteer duty assignment; assigned Volunteer own duty read/accept/decline/done. Assistant Coach may edit training only; a competition-authorised official remains authoritative over fixtures. Do not enable other roles/actions, private exports or play publishing.
- **1D, reproducible proof:** synthetic Node API contract checks, preserved browser regression suite, and a fresh isolated PostgreSQL 16 CI service using a disposable `auth.users` stub. Apply the three versioned migrations in order, run the two existing ACL checks, then `supabase/tests/stage1_persistent_journey.sql`: fictional Coach creates training, independent Manager reads/edits it, Player submits own RSVP, Manager assigns and Volunteer responds, while foreign-team, revoked, stale, replay and unauthorised actions fail. Inject an audit failure and demonstrate the session/receipt roll back. Test script ends with `ROLLBACK`.

## Explicit boundaries

The source is **not wired into the existing UI or active production `wrangler.jsonc`** and is not automatically deployed. The proposed Worker secret `SUPABASE_SERVICE_ROLE_KEY` must be stored only in a separately qualified private Worker binding, never committed, logged or browser-exposed. Public Supabase URL and publishable key are not administrator credentials. The existing schema must remain forced-RLS and deny direct `anon`/`authenticated` table access. Do not call service-role RPC directly from a browser.

Database tests use invented IDs in an **ephemeral PostgreSQL-compatible environment**, not Supabase's live Auth/RLS service. This proves neither a production Supabase installation nor all P13B/C security cases. Existing E5 play read/write/source compatibility is intentionally unchanged. The 24-hour recovery tolerance does not become an actual verified restore result through passing CI.

Before applying any migration or activating the Worker, independently verify the exact intended project/region/source, owner-approved privacy and security decisions, local SQL compatibility, migration preflight and backup/restore/rollback, service-role isolation and all mandatory real backend, physical Safari, two-device, minors/guardian and owner-release gates. **No live user signup, real participant import, automatic Supabase production branching or cloud cutover is approved.**

## Commands and evidence

- `npm test` runs original Node tests plus `test/stage1-api.test.js`.
- `python3 test/browser/run_all.py --skip-unit --out qualification.json` is the unchanged Chrome regression suite for accepted UI and E5.
- CI job `browser-webkit` retains E5/touch tests.
- CI job `stage1-postgres` runs migrations + schema denial tests + two-client persisted-domain journey and fault rollback on disposable PostgreSQL.

Report actual command totals on the **final PR HEAD SHA** and any skipped/pending host checks. Do not infer deployment, real iPhone Safari or production release from source CI. Keep Stage 1 PR DRAFT and UNMERGED until the RC1 dependency and owner review are accepted.
