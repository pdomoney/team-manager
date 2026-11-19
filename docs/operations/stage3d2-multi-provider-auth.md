# Stage 3D.2 | Google, Apple and existing-account email access

**Source-only implementation for the first real team:** St George Oztag / Mixed 20.
**Proposed base:** main `349c2da47704283bf569fbfbdb195a7ac30a67c3` after PR272.
**Status:** no live OAuth clients, Supabase providers, SMTP, policy documents,
personal data or real Auth users installed or approved by this source PR.

## Customer journey

1. An invited user arrives at the existing Team Access page and chooses
   **Continue with Google**, **Continue with Apple**, an **email one-time code**
   or existing **email/password**. No open/public registration action appears.
2. Google and Apple browser sign-in use single-use SHA-256 PKCE. The verifier
   remains in session-only storage and is consumed on the same origin/device;
   the callback removes `code` and any error query before doing network I/O.
   Missing, wrong-origin, expired or replayed flows fail closed. A valid login
   still grants **zero team access** without the original independent database
   account/person/team-role approval.
3. Email code requests send `create_user:false` to GoTrue; the approved
   provider must render the **`{{ .Token }}`** email template. On verification,
   the resulting account is checked with `/auth/v1/user`, and the code and
   email are not persisted in browser session storage.
4. An authorised signed-in user may deliberately select **Link Google** or
   **Link Apple** from their Account screen. This requires enabled Supabase
   manual identity linking and a *currently verified session*. The PKCE
   callback verifies the Account UUID remains unchanged. Linking never
   creates a Person, approves an invitation or merges existing team records
   based on email similarity. Supabase's provider-managed automatic linking
   on verified email must be separately reviewed and negative-tested.
5. On sign-in, the app uses the existing private, server-reviewed grant
   discovery. The initial person may explicitly choose separate Platform Owner
   or St George Oztag / Mixed 20 Coach contexts; these permissions never
   accumulate. Users without approved accounts remain unable to open team data.
6. Existing independently approved team invitations, minimal profile edits,
   password invitation/recovery and full Stage 3B management functions remain
   unchanged. The original encrypted demo stays isolated.

## Required real provider configuration for Stage 3D.3

- Explicit supplier, privacy, controller and under-18 review, no unsupported
  self-registration, and approved invitation email process. **No provider
  configuration is performed by this PR.**
- New **approved** isolated Supabase project and first-team Cloudflare origin,
  not the historical public identity preview. Review allowed origins and
  Supabase callback paths, exact `/cloud-access.html` redirect allowlist,
  HTTPS, anti-phishing provider consent screens and Apple Developer web
  service ID/rotation procedure. Google client IDs/secrets and Apple keys
  belong only in approved provider secret storage, never repo/site/logs/chat.
- Enable Google OAuth and Apple OAuth, verify their browser redirect handoff
  and manual account-linking beta option on the chosen provider version.
  `https://accounts.google.com` and `https://appleid.apple.com` are the
  expected outbound provider URLs for a link response; unexpected destinations
  are rejected. Check the actual provider on installed host.
- Configure an authorised SMTP sender, OTP template containing `{{ .Token }}`,
  code expiry/rate limits, anti-enumeration responses, recovery templates,
  user notices and delivery confirmation. No end-user password or OTP is logged.
- Test account bridging with confirmed verified identities. Do not use email
  matching to infer a Person or copy historical club rosters. Apple private
  relay addresses need explicit account-link review.
- Preserve the existing exact-Team role authorization and deny all requests
  for unapproved users regardless of a valid Google/Apple account.

## Policy acknowledgement and production release

The owner requires versioned privacy/terms acknowledgement. **The actual terms
and privacy text, field-level and junior/guardian approvals are NOT accepted**;
the public register records 18 owner decisions pending review and 11 proposed
field categories pending authorisation. This source PR does **not** fabricate
policy text, obtain legal consent, or enable processing junior records. The
mandatory, server-enforced policy version and accepted-acknowledgement gate is
part of the reviewed provider/data activation work in **3D.3**, after a real
approved policy is supplied. A bare checkbox is not release evidence.

Before production: Stage 3D.3 real isolated installation and provider account
activation, then 3D.4 real management journeys, 3D.5 L0–L5 qualification,
3D.6 L6 owner release and monitoring. Preserve management-first scope; Stage 4
E5 plays/tactics remains deferred. All seven L0–L6 release gates HOLD.

## Review and test

- Node tests: `npm test`, including `test/stage3d2-auth.test.js`, positive
  and negative PKCE/OTP/provider-linking/unauthorised grant cases.
- Existing synthetic Chromium/WebKit suites on the exact candidate source;
  no physical Safari, Google/Apple provider or email delivery acceptance is
  claimed by synthetic tests.
- No new package, privileged browser key, credential, automatic signup UI,
  E5 data migration, new team role or production service is introduced.

Sources for provider contract review:
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://supabase.com/docs/guides/auth/auth-email-passwordless
