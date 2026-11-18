# RC1: Cloudflare identity and read-only first-team access candidate

**SOURCE CANDIDATE, NOT A LIVE MEMBER RELEASE.** Base Team Manager main 4f7be6498a85956c234ea30b2cf4582be1bcd42b after PR #264 merged. The owner reports Cloudflare Worker deployment successful and verified on desktop/iPhone with fictional data. Project URL and publishable key were supplied on 18 November 2026; this does not verify installation or auth provisioning.

## Deliverable

- A standalone, deliberately labelled identity preview at /cloud-access.html. Existing invited test-account login uses Supabase Auth, verifies /auth/v1/user, supports refresh and logout. No self-registration.
- A single read-only public.tm_my_team_context() RPC returning only exact approved team IDs, club, sport, season and team role. It denies anonymous execution and does not grant direct access to tm_private. It checks active account, approved non-self role grant, active team, time bounds and verified person/participation for players or volunteers.
- A fixed wrangler.jsonc for the already accepted Cloudflare Workers project, with static asset directory dist and compatibility date 2026-11-17.
- The original Home/Schedule/Team/Tactics/More synthetic demo, legacy encrypted data and E5 play engine remain unchanged. This page does not open the private team application.

## Hard release boundaries

The new SQL depends on the first Supabase schema migration, which has NOT been verified as installed. Supabase production deployment and automatic branching remain disabled. Neither migration may be applied until the operator independently preflights the target, reviews an isolated synthetic rehearsal with SQL and real ACL tests, approves backup/recovery and an explicit migration plan. No real participant records, junior accounts, private fields, service keys or passwords may be imported or added.

The publishable key and project URL are public identifiers. Tokens are stored only in sessionStorage for this isolated preview. Neither logging in nor selecting a context grants access to the old shared-password app. Production use still requires the trusted action adapter, approved onboarding/privacy/SMTP, RLS and P13 negative cases, backup restore, real Safari and owner release approval.

## Cloudflare

Keep the working build command npm run build and existing deploy command npx wrangler deploy --assets ./dist --name team-manager --compatibility-date 2026-11-17. The new file records these settings for reproducibility. Do not merge without review, because merge to main triggers a Cloudflare build.

## After code review

In the Supabase console, confirm the region/plan, disable public signups for test onboarding, and create only independently approved fictional test accounts once the SMTP/login process is ready. For email-link invitations or recovery later, configure custom SMTP plus the Cloudflare URL under Auth Site URL and redirect allowlist. Those are not prerequisites for existing-account password sign-in.

Execute both versioned migrations only on an independently approved disposable Supabase-compatible PostgreSQL database first. Run both supabase/tests SQL files and positive/negative scenarios for active/inactive accounts, foreign teams, expired grants, self-approved grants, unverified person links, participation revocation and anonymous calls. Browser unit tests do not substitute for real database tests.

Next substantial product increment: connect independently verified team and role context to working schedule/availability/volunteer duties and published E5 play workflows through the trusted action boundary, with one-transaction replay checks and auditing. The real first-team release remains HOLD at 0/7 gates, 0/8 participant journeys.
