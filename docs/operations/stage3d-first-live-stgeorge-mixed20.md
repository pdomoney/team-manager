# Stage 3D | First real team: St George Oztag / Mixed 20

**Development target approved 19 November 2026. Source-only candidate; NOT INSTALLED, NOT RELEASE QUALIFIED.** Current verified source baseline before this work: PR271 merged `main` `2c3bec979db8abeb17e7ac78c138ed995f580666`. This note does not authorise Supabase/Cloudflare provisioning, live migration, any real account or participant-data processing.

## Intended first-team experience

- **Club:** St George Oztag
- **Team:** Mixed 20 (exact owner-provided name; do not infer age, division, minor status, association registration or a competition feed).
- **Sport:** Oztag; competition/fixture authority remains independent.
- **Season:** **To be verified by owner/operator at installation**, not guessed from the current date.
- **Initial user:** one person will use **two distinct contexts**: Platform Owner and separately approved exact-team Coach. These are grants to the same individual Supabase Auth account, **not a merged permission set**. The Coach account requires independent identity verification and a different approver. Neither a GitHub repository owner nor platform role automatically gains coach/team data access.
- **Other users:** separately invited real Manager, Player and Volunteer only after approved user scope, identity and onboarding; none is created by bootstrap. No names, personal details or real player rosters are checked in or copied from the demo.

## What this increment changes

1. Public demonstration no longer presents legacy **Go live** activation or shared-password conversion on a hosted origin. Existing encrypted workspaces and local regression/recovery code are retained. Previously published encrypted users/data are **not migrated or deleted**.
2. Signed-in cloud pages show **St George Oztag / Mixed 20** only when the *server* returns a matching authenticated `team_id` **and** `club_ref`. This is display metadata, not a grant or a live provider connection.
3. `supabase/stage3d/bootstrap_first_live_team.sql` is an explicit one-time, fail-closed, operator-executed SQL activation for a **fresh approved database**, with two different confirmed adult auth identities, independent reviewer attestation, separate platform and Coach grants, one exact team, no participant records, and an explicitly verified season. Do not run against existing staging data, the previous demo data branch, or any production database without approval.
4. Disposable PostgreSQL tests demonstrate two separately approved grants to one account, an independent reviewer with no implicit team/platform grants, and rejection of self-approved grants. Synthetic fixtures are not evidence that any live person is verified.

## Prior authorisation required before running the SQL or creating accounts

Explicit platform-owner/operator approval must identify **all** of:

- Actual chosen Supabase project, Australian region, plan and charges; actual Cloudflare account, deployment origin and installer identity; controller, purpose, privacy notice/terms, retention, age/guardian/WWCC and permitted data fields.
- Independent reviewer identity and their authority. The reviewer must be a **different verified person** from the first Coach/Platform Owner. Do not treat the platform owner's own request as independent approval.
- Email provider, redirects, recovery, no public self-registration, secrets storage and authorisation boundary.
- Frozen source/build SHA, exact migration versions, empty target/project verification and schema compatibility; source-to-runtime proof, backup and rollback rehearsal; 24-hour RPO capability established by real off-site restore tests, not assumed from an approved tolerance.
- Season for the actual Mixed 20 team, and confirmation this exact club/team has authority to participate in the trial. No membership, historical season or roster should be inferred or imported.

**If any is unknown: HOLD the real provider/database operation only.** Continue reviewing the safely developed source and fictional CI. No real user emails, IDs, tokens, details or evidence belong in Git, CI, or a public chat.

## Once separately authorised: execution contract

1. Read the current accepted source and installed host evidence, reconcile release branch and exact source/build SHA, and inspect backups/schema before any migration.
2. Ensure all versioned **Stage 1, Stage 2, Stage 3A and Stage 3B** migrations are applied in their documented order to the **empty approved first-team instance**. Stage 3C fictional reviewer seed script must **not** run in this database.
3. Provision/confirm two distinct adult identities through the approved private provider process: the initial Coach (also intended Platform Owner) and the *independent* approver. Email confirmation is necessary, not independent identity assurance.
4. With a private, approved SQL administrator and protected external attestation, supply `coach_uuid`, `reviewer_uuid`, `season_ref`, `approval_ref` and `activation_authorised=approved-first-live-team-activation` to `psql -X -v ON_ERROR_STOP=1 -f supabase/stage3d/bootstrap_first_live_team.sql`. Use a private session, not a shared shell transcript or public CI. Do not run this command based solely on this document.
4A. **Independent initial Manager, not automatic:** a single Coach cannot approve their own Team invitations. After a *separate* owner decision naming a verified first Manager, run `supabase/stage3d/bootstrap_first_manager.sql` with private `coach_uuid`, `manager_uuid`, `approval_ref` and `manager_authorised=approved-first-manager-activation`. This script requires the original Coach's active exact-team grant; it grants only Manager access to the newly approved account, reviewed by the Coach. It does **not** assume that the independent first-Coach reviewer is also the Manager. The reviewer may be selected as Manager only after their separate explicit approval. Without that decision the initial Coach can sign in, but two-person invitation approval remains blocked.

5. Verify the approved account has **Platform Owner** and **Coach · St George Oztag · Mixed 20** as separate selectable contexts; opening Owner shows no private team data until Coach is explicitly selected. A reviewer has no unexpected team context. Verify direct API team denial and revoked access, not just the UI picker.
6. Complete the actual Manager/Player/Volunteer invitation, account activation, profile, attendance/availability/duty/report, second-device, email recovery, error and 59-case security journeys. Record restricted evidence against the exact deployed SHA.
7. Independently qualify restore, privacy/minors, physical iPhone/macOS Safari, accessibility, recovery and L0–L6. Only then seek explicit owner production acceptance.

## Scope boundaries

This remains a management-first rollout. **Stage 4** Tactics/Play Editor is deferred; keep accepted E5 authored data intact. Do not import sample Engadine/Dragons teams, research directory entries, official fixtures or the old encrypted GitHub workspace into real St George Oztag data.

Production status: **HOLD** until L0–L6 and the applicable eight management journeys are independently verified. A successful source PR, a green GitHub Pages build or a real team's name in code does not mean that the team is installed or onboarded.
