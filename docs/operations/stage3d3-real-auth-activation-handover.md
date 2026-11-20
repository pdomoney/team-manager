# Stage 3D.3 Activation | Exact operator handover for the first live team

**20 November 2026. Source-only, not an installation or real user acceptance.**
Intended club: **St George Oztag**. Team: **Mixed 20** (`stgeorge-mixed20`).
This supplements [the approved architecture and registration decision](stage3d3-provider-registration-approval.md)
and [first-team installation sequence](stage3d3-connected-first-team-activation.md).
It does not repeat or replace their owner-approved role/privacy decisions.

## Preflight 01 | Qualify the source, baseline and runtime

- Record the exact final **merged** PR276 `main` commit, accepted release tag if applicable, the full migration order, checks, source/build SHA and an independent reviewer. Source-only CI is not installation evidence.
- Identify the **actual existing** Supabase project(s), project region, billing plan, pause/availability behaviour and project administrator before creating another. The first-team target must not be the historical demo/Stage 3C fictional project. Owner design preference is **Sydney `ap-southeast-2` and initially Free**; neither account ownership, spend nor specific service availability has been independently verified.
- Identify the distinct Cloudflare Worker and bound first-team origin. The existing GitHub Pages `team-manager` build and saved encrypted demo must not be replaced. The dedicated target is `team-manager-stgeorge-stage3d3` from `wrangler.stage3d3.jsonc`.
- Verify a separately approved first-team **season**, Australian controller/processor and retention, independent reviewer, first Manager and approved minimal adult-account purpose. Do not infer age from `Mixed 20`.
- Verify the exact **database schema/installer boundary**, compatible pre-migration backup, tested restore and operator authority. If a schema is already installed, compare every recorded migration and checksum; do not blindly rerun an initial bootstrap or reset the DB.
- Keep L0–L6 HOLD until actual installed evidence exists. The accepted **24-hour recovery point** needs real encrypted off-site backup/restore verification, not a keepalive or a source test.

## Preflight 02 | Provider configuration, not code changes

**Never paste OAuth credentials, signed-in JWTs, member emails, SMTP secrets or logs containing personal data into GitHub or this chat.**

| Service | What the authorised operator verifies | Expected public callback / destination |
| --- | --- | --- |
| Supabase Auth | Approved project, custom site URL, no public self-registration, exact redirect allowlist, current rate limits and account recovery rules | **App return:** `https://<first-team-host>/cloud-access.html` |
| Google | OAuth client registered for the approved project, controlled consent screen, correct app/domain ownership and callback | **Provider return to Supabase:** `https://<project-ref>.supabase.co/auth/v1/callback` |
| Apple | Apple Developer team, Service ID and domain association, return URL, private-email relay handling, client-secret expiration/rotation owner | **Provider return to Supabase:** `https://<project-ref>.supabase.co/auth/v1/callback` |
| Email | Selected verified external SMTP sender, delivered invitation, recovery and email OTP template containing `{{ .Token }}`, expiry and throttling | Invited existing accounts only; OTP `create_user:false` |
| Identity linking | Enable only if identity linking of a previously approved account is separately reviewed; test linking to the *same account UUID*, Apple relay and rejection of a different UUID | No automatic Person or team-role assignment |

Current primary documentation:
[Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[Apple OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls),
[identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
These pages are references for configuration; **an actual provider/browser exchange has not been verified** in source CI.

## Preflight 03 | Approved legal document integrity and data minimisation

An operator must obtain the **actual independently reviewed** terms and privacy
documents. Neither source nor this guide supplies legal terms. In a private
workspace, compare the SHA-256 of the *exact published file bytes* with the
approved recorded hash. Recheck the downloadable URL after publication,
record exact version/hash, hosting origin and reviewer evidence and ensure old
versions cannot be silently overwritten. Do not trust a version label alone.
Do not put any policy in `active` status until this is completed.

The existing register has **18 answered/pending independent reviews** and
**11 player fields unapproved for production collection**. Under-18 player,
guardian, emergency contact and health data stay blocked. The database
migration is intentionally empty: it does not seed a policy, user, adult
attestation or acceptance receipt.

## Preflight 04 | Exact database and Worker sequence, with controlled rollback

1. Verify the actual, approved, **empty** first-team project, frozen source,
   compatible baseline, migration ledger and independently backed-up state.
2. Apply the prior reviewed Stage 1/2/3A/3B migrations in the exact documented
   order in **a disposable rehearsal first**; the Stage 3C fictional reviewer
   bootstrap must not be applied to the real team.
3. Follow approved versioned migrations
   `20261120010000_stage3d3_registration_policy.sql` and then
   **`20261120020000_stage3d3_direct_rpc_registration_gate.sql`**.
   Never run the new migration against a live project without a separately
   authorised installer, backup, schema/hash preflight and rollback plan.
4. Verify private policy/version/independent-adult-review records only after
   individual approval. The first real Coach/Platform Owner receives separate,
   independently approved grants through the pre-existing
   `supabase/stage3d/bootstrap_first_live_team.sql`. The first Manager is
   a distinct, separately authorised activation through
   `bootstrap_first_manager.sql`.
5. Store the appropriate Worker **Supabase project URL and publishable key**
   in its controlled environment configuration, and the
   **`SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) only in
   protected Worker secrets**. Never embed privileged keys in the built browser
   assets or GitHub repository. Check the actual `worker/supabase-admin-key.js`
   configuration boundary.
6. Build using the reviewed source SHA, approved origin/project and chosen
   season from `scripts/stage3d3-build.mjs`; leave provider controls
   `off` until real Google/Apple/SMTP tests and approval pass. The build output
   is `dist-stage3d3`, and the Worker deploy target is
   `wrangler.stage3d3.jsonc`; the source does **not** deploy itself.
7. Deploy only under separately named installer approval, then independently
   verify the **installed SHA**, Worker `management-only` restriction,
   `STAGE3D3_REGISTRATION_MODE=required`, no demo-data/tactics routes,
   confirmed provider origin and actual backup/restore health.
8. Activate provider controls only on the approved first-team origin, with
   the approved adult operator and exact provider settings. Use an operator
   rollback route if any preflight or negative check fails.

## Acceptance 05 | Real adult login before any players

For a verified adult Coach/Platform Owner and a separately authorised Manager:

1. Sign in with Google, Apple or invited email account on the actual deployed
   origin; verify redirects and code/OTP exchange, no duplicate account/Person
   from provider switching or Apple private relay.
2. Before adult review/current terms acceptance, verify that direct Supabase
   RPC calls to `tm_my_team_context`, `tm_my_operator_context`,
   `tm_my_profile`, and `tm_save_my_profile` all fail or return no private
   data, **even when bypassing the Worker**. Confirm Worker management APIs
   also deny the request.
3. After independent adult verification and approved current policy
   acknowledgement, verify that the account can see ONLY its independently
   approved Platform Owner and Mixed 20 Coach contexts, not a union of
   privileges; Coach/Manager performs one authorised data write/read.
4. Rotate the active policy version or revoke adult review and repeat the
   negative tests. Correctly block both Worker and direct RPC immediately.
5. Verify invite, expired invite, account recovery, sign-out, second device,
   revoked/foreign-team denial and no unauthorised person/participant records.
   Record exact installed SHA, provider setup reference, results and reviewer.
6. No participant data or under-18 onboarding until separate field/safeguarding
   approval, plus L0–L6 live qualification.

**Exit:** adult provider sign-in and exact-team scopes are proven on the
authorised installed service. Stage 3D.4 can then qualify the eight real
team-management journeys. Source CI success alone never satisfies this exit.
