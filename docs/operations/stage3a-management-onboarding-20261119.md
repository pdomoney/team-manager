# Stage 3A source candidate: individual account and team onboarding

**Source-only development. No real accounts, Supabase migrations, email or live
Cloudflare Worker installation is authorised by the PR.** This extends the
original Team Manager five-section experience; Tactics and the accepted E5
editor are deferred to Stage 4 and remain untouched.

## Real adult user journey (after separately approved staging)

1. Approved administrator independently provisions the initial active
   Coach/Manager reviewer identities and their exact-team grants through
   a separately authorised bootstrap. Do not self-assign an Owner/Coach role.
2. A Coach or Manager chooses the explicit team context, opens **Team →
   Team account invitations**, and proposes a specific adult test email/role.
   This is not registration, eligibility or access.
3. A **different** Coach/Manager with a separately approved active grant for
   the same team approves the proposal. The trusted Worker sends the
   Supabase Auth invitation only after this approval. For existing users,
   the invitation remains approved and is claimable after sign-in. Delivery
   status is recorded without exposing provider secrets.
4. The recipient follows a provider-generated invitation/recovery link to
   **cloud-access.html**, which removes tokens from the URL immediately.
   They set a password, sign in, open **My team invitations** and claim
   their exact invitation. This creates a private Account, a new opaque
   Person record only if no existing pending/verified link exists, a
   **pending** AccountPersonLink and a **proposed** role grant. No access yet.
5. A second authorised reviewer checks person identity through the approved
   human procedure before **Verify person and activate access**. For a
   Player, activation also records **team placement**, not club/financial
   registration or official competition eligibility. Duplicate Person
   candidates may not be merged based on email/name.
6. The recipient refreshes their approved role contexts. Only their exact
   team/role is shown. Reviewers can revoke this independently. Existing
   Stage 1/2 RPCs re-check grants on each request.
7. Each adult can edit only their own minimal display name. Password
   recovery is fulfilled by GoTrue. The UI never collects health, guardian,
   address, DOB or sports accreditation evidence under this code.

## Source/runtime boundary

- GitHub Pages hosts static assets but does not execute `/api/stage1`,
  `/api/stage2` or `/api/stage3`. The reviewable Worker is configured
  to serve the same-origin API and assets only after installation authority.
  Opening the static Pages UI does **not** prove the API is available.
- Worker environment bindings: `SUPABASE_URL` (approved project),
  `SUPABASE_PUBLISHABLE_KEY` (public), secret
  `SUPABASE_SERVICE_ROLE_KEY` (Worker only), and
  `ONBOARDING_REDIRECT_URL` (fixed HTTPS URL ending in
  `/cloud-access.html`, provider allowlisted). Do not commit credentials.
- Apply existing versioned migrations **in order**, with the new
  `20261119040000_stage3a_onboarding.sql` after Stage 3A minimal profile.
  Production migration requires schema/backup/rollback preflight and
  separately approved provider/location/privacy. Disposable CI uses
  fictional `auth.users`, never the linked service.
- Supabase Auth email templates, domain/redirect allowlists, admin invite
  rate limits, password recovery, incident and retention settings must be
  independently configured and tested before real emails are issued.
  An invitation marked **failed** is not a successful email delivery.
- Pending/expired invites, disabled accounts, self-approval, foreign-team
  review, unverified email, duplicate grants, revocation and stale sessions
  fail closed. Human confirmation is evidence to obtain, not a verified
  sporting identity inferred by software.

## Acceptance and remaining gates

Run `npm test`, the disposable PostgreSQL migration/transaction tests,
Chromium and WebKit multi-account journeys on the exact PR source SHA.
These prove source behaviour with invented users only. Stage 3C must then
verify actual provider email and recovery, independently seeded reviewer
accounts, multi-device access, real backup/restore, security/retention,
privacy/terms and physical Safari with owner acceptance.

Use the management-only `first-team-cloud-release.md` evaluator. L0–L6
remain HOLD until independently verified; Stage 4 plays are excluded
from the initial management release, not deleted from the product.
