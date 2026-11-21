# Stage 3D.4 | Initial Platform Owner and first-team administration

**SOURCE CANDIDATE ONLY, 21 November 2026. NOT INSTALLED, NOT OWNER ACCEPTED.**

Target: the existing pdomoney/team-manager repository, existing Cloudflare
Worker team-manager at https://team-manager.paul-domoney.workers.dev,
and existing Supabase project uyjxvaobshaahzipzzds. Do not create another
Worker, project, email account or fictitious approver.

## Approved initial journey

1. Keep one verified Gmail sign-in and two independently scoped roles
   (Platform Owner and first-team Coach) for the same Supabase Auth UUID.
2. A one-time owner-authorised, explicitly attested bootstrap runs under a
   protected Supabase SQL administration session after host preflight and
   separate installation authorisation. It is recorded as OWNER-AUTHORISED,
   not falsely represented as approval by a second person.
3. A privileged SQL singleton creates only the initial active Account and
   Platform Owner grant. No browser or Worker endpoint can invoke it, and
   a second account cannot repeat the bootstrap.
4. A newly authorised owner sees the restricted setup link in the existing
   Team Access page even before an active approved policy exists. The Owner
   can establish only the first team's non-personal identity and activate
   one exact-team initial Coach grant with distinct bootstrap provenance.
5. The Owner and Coach roles remain separate. Normal team/profile reads
   continue requiring the current reviewed adult policy and acceptance.
   Merely signing in, creating a team or receiving a Coach grant never
   bypasses the direct Supabase registration gate.
6. After actual adult terms and privacy documents are approved and
   acknowledged, the Owner may approve invitations for the one team.
   A verified invited adult must still be independently reviewed by
   the administrator, accept the current policy, claim the invitation
   and receive a separate exact-team role activation. Revocation must work.
7. Coaches and Managers may propose, but Stage 3D.4 administrator mode
   routes approvals and activations through the Owner interface, rather
   than requiring a second Coach to approve every invitation.
8. For this first-team milestone, the initial authorised administrator
   is the Platform Owner. Future delegated Club and Association Admin
   permissions require their own approved context and are not fabricated.

**Preserve:** legacy Home/Team/Tactics/play editor, all eight encrypted
files, no automatic public signup, no grandfathered blanket team access,
no junior or guardian provisioning, no inferred sporting registration,
separate current policy acknowledgement, ordinary no-self-approval and
role-scoped revocation.

## Source changes

- Additive versioned migration:
  supabase/migrations/20261121010000_stage3d4_founder_admin.sql.
  It creates no real account, policy or team automatically.
- Restricted SQL Editor handoff:
  supabase/stage3d4/bootstrap_first_owner_SQL_EDITOR.sql.
  Never run automatically, in CI, as a browser or via service-role key.
- Verified Worker route: POST /api/stage3d4/v1/owner.
  Enabled only when STAGE3D4_OWNER_ADMIN_MODE=enabled on the existing
  Worker with Stage 3D.3 policy protections still active.
- First-party owner UI:
  site/cloud-owner.html, site/cloud-owner.js, site/cloud-owner.css,
  included only in the connected first-team candidate.
- Opt-in existing Worker configuration:
  wrangler.stage3d4-existing.jsonc. This is not a deployment authority.
- Synthetic Node tests and disposable PostgreSQL approval/revocation tests.

## Base, release boundary and required preflight

GitHub development base: main b342f9ac589897f1dae696fd81a1bf6cbb0c0c4b
(merged PR #279). Owner-observed Stage 3D.3 active Worker candidate was
f624e9fb-808e-4d79-918e-93b43ce48661 from that same source. Those
historical results MUST be rechecked before a new installation; do not infer
installed status from source CI. Existing release L0-L6 is HOLD.

Before any live change: verify current production schema and ten previously
applied migrations, current identity and grants, selected team/season, exact
Git/Worker source, encrypted file hashes, current Worker version, automatic
Cloudflare builds, app bindings and approved release target. Reconcile
privacy/controller and planned adult processing scope. Establish an actual
database backup and isolated restore, qualify the inactive Worker upload,
exact package hash and rollback. If any protected baseline, existing-data
or installation preflight fails, HOLD the live operation. Do not repin,
invent evidence, use the old Stage 3D.3 installer against a changed source,
or reset the database.

## Required future installation sequence (NOT executed by this PR)

1. Review the complete Stage 3D.4 PR and its exact passing test head.
2. Revalidate current Supabase, Cloudflare and GitHub control from private
   operator sessions. Authorise the specific migration, owner UUID,
   owner-held evidence reference, Worker package and rollback.
3. Apply only the new versioned migration after a compatible schema/
   backup check. Never rerun the earlier ten migrations or fixture seeds.
4. Run the separately reviewed one-time SQL Editor bootstrap with
   privately entered owner UUID, evidence reference and confirmation.
   Verify exactly one active founder; do not expose the filled script.
5. Build from the reviewed head, preserving the eight ciphertext files.
   Verify new connected pages, no privileged key in the public bundle,
   exact SHA/manifest/inventory and unchanged old application.
6. Qualify and explicitly approve upload/activation using the new opt-in
   existing Worker configuration. Restore the prior Worker if the
   source-bound smoke/host checks fail.
7. Sign in with the existing Gmail account. Configure St George Oztag /
   Mixed 20 only with an owner-verified season. Activate the founder
   Coach grant, confirm two separate roles after policy acceptance,
   and check Team data remains restricted until consent.
8. Apply only actual reviewed policy versions and adult approval evidence;
   confirm one administrator approved adult invitation, email delivery,
   human review, policy acknowledgement, claim, activation, expiry and
   revocation. Test incorrect-team and direct-RPC denial.
9. Independently verify macOS/iPhone Safari, recovery, backup/restore,
   accessibility and two-device use. Installed is not Owner Accepted.

Apple, Google and Email are approved login methods. Email is already
observed working for the initial Gmail login; Apple/Google need separate
provider credential and account-linking qualification. Phone is deferred.
All real youth/safeguarding workflows remain blocked pending approval.

## Test surfaces

- Node: input validation, missing/forged bearer, no owner grant,
  disabled Worker mode, invitation approval before email delivery,
  secret redaction, unchanged demo routing and exact asset inclusion.
- Disposable PostgreSQL: no automatic bootstrap, restricted Owner
  setup, founder-only first Coach, replay protection, distinct roles,
  consent gate, adult invite/review/claim/activate, cross-role isolation,
  revocation and auditing.
- Browser: existing Stage 3D.3 Chromium/WebKit policy regression, plus
  the new Owner page for actual macOS/iPhone owner acceptance.
- Real provider, database and host evidence remain PENDING until tested.

This first-owner bootstrap is a **specific operator-authorised exception**,
not general self-approval for platform, club, team, player or guardian roles.
