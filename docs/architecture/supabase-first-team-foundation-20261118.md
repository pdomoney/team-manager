# Supabase first-team private schema foundation (review candidate)

**Status: SOURCE-ONLY DRAFT; not migrated, installed, connected, or approved for personal data.**

**Starting code:** Team Manager main commit 009d9db950f17ac4c520ef0cd01f5311b1f2678c (PR #258 merged). The owner confirmed Supabase GitHub Integration **Deploy to production OFF** and **Automatic branching OFF** on 18 November 2026. These settings are owner-reported, not independently inspected through a Supabase admin connection. Do not enable automated schema deployment as part of reviewing or merging this PR.

## What this delivers

- supabase/config.toml: a local project label. GitHub working directory stays "." because supabase/ is at the repository root.
- A single plain SQL migration that creates the **tm_private** schema and 13 related first-team backend tables: accounts, opaque Persons, independently verified Account→Person links, teams, verified player participations, exact-team role grants, sessions, plays and lossless E5 JSON revisions, own availability, assigned duties, account/team mutation receipts, and append-only audit records.
- All 13 tables explicitly ENABLE and FORCE row-level security. There are **no RLS policies and no API grants for anon or authenticated**, and the private schema is not part of Supabase's usual public Data API exposure. This deliberately prevents direct browser access rather than pretending an incomplete policy can protect children or private contacts.
- CHECK/foreign-key/uniqueness constraints make self-approval, invalid states, cross-team session references and duplicate mutation IDs harder to store.
- Source-only Node tests and a PostgreSQL catalog assertion SQL file intended for **later execution on an isolated disposable Supabase-compatible database**. Node tests are structural guardrails, **not SQL parsing, migration execution, live policy testing or the 59-case P13 server test plan**.

## Scope and deliberate limits

This migration stores opaque identifiers, organisational context and routine operational records, not participant names, DOB, phone numbers, addresses, photos, guardian/WWCC evidence or medical data. **The schema is not a legal/privacy authorisation:** no production records or accounts may be added until applicable L0 and field-by-field reviews are independently accepted.

This source has no Supabase JWT verifier, backend adapter, API endpoint, live RLS grants, SMTP settings, browser client, storage bucket, Cloudflare deployment, or migration of old encrypted files. The existing Home/Schedule/Team/Tactics/More, team selection, E5 editor, publishes, backups and GitHub Pages continue as-is.

An edge/backend adapter will later have to:
1. Verify individual Supabase Auth tokens cryptographically and recheck account status.
2. Run exact-team and active selected-role checks, including independently approved person/participation/duty links, for **every** action. A role selector or a JWT claim is not a grant.
3. Independently check all action payload and play revision schemas against actual E5 content, enforce expected version atomically and reserve idempotency keys in the same database transaction as authorised writes.
4. Write ALLOW intent and committed DENY/ERROR decisions safely, redact outputs and protect raw provider logs.
5. Perform the real server negative tests and independent backup/restore plus physical Safari acceptance before enabling real accounts.

**Warning:** Supabase's service_role BYPASSES RLS. The explicit grant to service_role here is for a *future trusted server-only integration*, not for the website. Never embed the service-role/secret key in Cloudflare Pages frontend, GitHub source, the PWA or any browser. Keep this schema outside the exposed Data API configuration and do not grant arbitrary authenticated access to it.

## Before any database application

1. Independently confirm the **target project ID, selected Sydney region, Free plan, actual linked migration history and existing database schema** in a read-only preflight. A Supabase project created in the dashboard is not verified installation evidence.
2. Confirm the destination is an **isolated disposable development database with synthetic-only data**. Never run this migration against a real-person database without approved L0/privacy/restore/migration authority.
3. Check the exact candidate source SHA and SQL digest, run local PostgreSQL syntax/migration checks and supabase/tests/first_team_private_foundation.sql, then conduct real role-ACL and negative-policy tests. The current ChatGPT environment has no PostgreSQL server or connected Supabase credentials; these checks are PENDING.
4. Only after that rehearsal and separate owner approval, define a controlled apply/rollback/backup plan. No CI workflow in this PR deploys schema or alters the existing Supabase GitHub integration.

Do not use "supabase db reset --remote", blind "db push", SQL Editor execution or Supabase automatic production deployment to qualify this PR. This does not modify the protected first-team release ledger (L0–L6 0/7, eight live journeys 0/8) or the historical P10D release evidence.

## Representative first-team journey to qualify after provider integration

An individually invited Coach of Team A creates/edits a reviewed E5 play and publishes one revision. An individually invited Player of Team A sees only that published revision, uses the existing Watch/Learn animation, and replies to their own session availability. A verified Volunteer sees and replies only to an assigned Team A duty. A different team's member, a revoked account, a browser-switched role and stale/replayed mutations are denied by the **actual** backend. Guardian access remains separate pending verified relationship/privacy evidence.

## Owner action

Review the draft PR as source preparation only. Do **not** merge it as approval to apply migrations to Supabase or to register any real participant. The next practical development slice is the real service adapter and an isolated, synthetic-only end-to-end rehearsal once the provider and environment are independently verified.
