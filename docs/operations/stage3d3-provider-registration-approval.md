# Stage 3D.3 | Approved architecture and registration controls

**20 November 2026. Owner approved Task 2 (provider architecture) and Task 3 (privacy/registration engineering) as one large source block.** This records an owner product decision, not a legal opinion or an approved installation. Base source for this branch is PR274 head `8cc6f971cdddf6d917f0920b70453a102a147e64` because GitHub still reports PR274 OPEN DRAFT and `main` at PR273's merge SHA. Do not retarget this source to `main` or merge into a live runtime until the branch mismatch is independently resolved.

## Product decisions carried forward

The **first real club/team** is **St George Oztag / Mixed 20**, with a verified season still required. The same initial human can be **Platform Owner** and **exact-team Coach**, but the roles require *two distinct approved grants* and an independent reviewer. A separately approved first Manager permits two-person invitation review.

Approved for source architecture: **Supabase PostgreSQL/Auth** with **Sydney `ap-southeast-2` preferred**, **Cloudflare Worker** for management APIs, **Google, Apple, invited email OTP/password**, and **third-party SMTP** for actual mail. The **Supabase Free tier** is the intended limited one-team trial starting point (up to 50 users), conditional on current plan limits, pause characteristics, processing locations, costs and resilience checks. The owner accepts a **24-hour recovery point objective**, NOT a 24-hour recovery time objective and NOT proof backups exist. Existing project and Worker inventory must be inspected before creating anything.

**No real service was created/connected and no provider cost or privacy contract was verified in this PR.** `config/stage3d3-provider-registration-decision.json` records explicit design approval separately from the blocked release ledger. The historic shared-password GitHub Pages demo and E5 authored plays are preserved; Stage 4 Tactics remains deferred.

## Existing owner privacy answers preserved, not silently promoted

All **18** responses in `config/privacy-decision-register.json` are `answered-pending-review`. All **11** proposed player profile categories remain unapproved for live collection. Task 3 approval authorises implementing the chosen model; it does **not** provide the missing published terms/privacy wording, appointed controller/legal identity, independent safeguarding review, guardian-consent proof, vendor contracts or field-by-field legal authority. Keep those evidence states accurate.

This implementation respects the accepted preferences:
- Actual individual accounts are invitation-led and **a provider login cannot self-grant team permissions**.
- Versioned **terms acceptance** and **privacy notice acknowledgement** are both mandatory; marketing is separate and OFF by default. Neither acknowledgement establishes legal compliance or sporting registration.
- Initial **adult-only** connected account activation requires external human verification. Under-18 players are known to be in the first team and remain BLOCKED for actual account/data activation until independently approved age-appropriate notice, guardian contact/relationship checks, safeguarding and collection fields. A guardian candidate grants no account access, and active guardian login is optional.
- Emergency contact data remains unapproved; no medical conditions/allergies/injuries or WWCC numbers are collected by this migration. A WWCC number does not establish clearance; authorised role screening and evidence are separate.
- Manager/Club Admin private access remains team/club scoped. No unrestricted association exports, default marketing, public profiles or data imports.
- Inactive membership may be reviewed for archive after 12 months without silent deletion, with category-specific retention exceptions and rights review still pending. Platform Owner retains recovery and final release authority.

## Source delivered in this consolidated block

1. `supabase/migrations/20261120010000_stage3d3_registration_policy.sql` creates three private RLS-locked tables: independently reviewed active policy versions (document versions, approved HTTPS URLs and SHA-256 fingerprints), independently reviewed **adult** account attestations without DOB, and immutable individual acceptance receipts.
2. Only the privileged trusted Worker can call `public.tm_stage3d3_registration`; it returns a policy status or records the two required acknowledgements with server-owned account identity and clock. No policy or acceptance is seeded. An expired/retired policy is no longer sufficient and requires new individual acknowledgement. Marketing cannot be enabled by replay.
3. `worker/stage3d3-registration.js` verifies the actual GoTrue user, denies unconfirmed identities, forwards only the provider-derived UUID, and rejects missing policy, adult review, terms acceptance or unapproved data. On the dedicated Worker `STAGE3D3_REGISTRATION_MODE=required` gates **every Stage 1/3B/3 management API request** before reaching its existing exact-team permission checks. Older Stage 3C synthetic staging and the demo keep their previous behaviour.
4. The original branded Team Access page displays the policy acknowledgement route only in the isolated Stage 3D.3 build. `cloud-registration.html` and `cloud-registration.js` display actual approved document links and versions received from the server, require two unchecked acknowledgements, and leave optional marketing unchecked. They never create a Person, sporting registration, team grant or policy document.
5. A distinct generated `dist-stage3d3` build includes the policy screen and public `CLOUD_STAGE3D3_POLICY_REQUIRED=true` while the normal GitHub Pages/demo and Stage 3C builds keep it false. Existing encrypted demo data, Stage 4 play assets and real-person fixtures are not imported.
6. Disposable Node/SQL tests require the missing-policy path to FAIL, reject self-reviewed adulthood, reject partial acceptance/spoofed actor data, preserve marketing OFF, require acceptance anew after a reviewed document change, and preserve exact-team API enforcement.

## Ordered next operator steps, NOT performed by a source merge

### 01. Confirm immutable source and existing provider resources

Before using cloud consoles, verify PR274 is merged to `main` and publish/test qualification is clean. Only then target this consolidated PR to that accepted baseline and review it. Inspect any pre-existing Supabase and Cloudflare resources; do not create duplicates because credentials or variables are absent. Verify Sydney region, Free plan support/limitations, user count, costs, retention, subprocessor review and data-controller/legal entity. Record the installed source SHA separately from the GitHub commit.

### 02. Independently review actual policy documents and allowed fields

The approved terms and privacy notice must exist as **real, reviewed, immutable/versioned documents** at operator-controlled HTTPS URLs with recorded SHA-256 values, reviewer identity and external evidence reference. Review the specific under-18, guardian, privacy, lawful handling, deletion/export and category scopes. Keep the 11 player fields default-denied until independently approved. A development test document at `example.test` must never be used for real registration.

### 03. Stage policy with an independent reviewer, no user data

After approved schema migration preflight, backup and external authority: create only an independently reviewed `tm_private.registration_policy_versions` record as `active`, with the exact approved URLs/versions/fingerprints and reviewed-by/approval evidence. The migration deliberately seeds no default policy. A wrong/missing/retired policy blocks all management operations. Do not fabricate or silently auto-activate an initial policy.

For *each* named adult account, an independent reviewer must separately attest that the account owner is an adult through the approved out-of-band process before inserting `tm_private.registration_adult_reviews`. Self-reviewed, unreviewed or junior accounts are denied. Never insert a date of birth to satisfy this stage. The separate exact-team role and person-link approvals still apply.

### 04. Verify environment with providers disabled

Use `scripts/stage3d3-build.mjs` from an explicitly approved exact source SHA, chosen first-team origin, **separate** Supabase project and agreed season. Leave `STAGE3D3_PROVIDER_METHODS=off` until Google/Apple/SMTP are ready. The distinct `wrangler.stage3d3.jsonc` sets `STAGE3D3_REGISTRATION_MODE=required`; the published manifest remains `NOT_PRODUCTION_AUTHORISED`. Only a separately approved operator can deploy; CI builds and source review do not perform installation.

### 05. After this PR, activate Google, Apple and email

In the next authorised phase, configure Google and Apple provider clients, precise app/provider redirects, Apple secret rotation, external SMTP, recovery delivery, provider account linking and actual adult test accounts. Never paste provider secrets, email codes, personal data or JWTs into issues or CI output.

Test the sequence: sign in → independently verified account → reviewed policy and adult decision → two explicit acknowledgements → separate Platform Owner/Coach role selection → authorised read/write. An unreviewed user or any account without current acknowledgement must get a server-side denial, including direct API calls. The first separately approved Manager is then added. No participant data until L0 child safeguards are accepted.

### 06. Finish release qualification after real connected acceptance

3D.4 qualifies the eight management journeys with actual identities; 3D.5 covers the 59-case real-server security suite, 24-hour RPO off-site backup and restore, physical iPhone/macOS Safari/VoiceOver and recovery; 3D.6 requires exact-runtime source, operational health and final Platform Owner signoff. All seven L0–L6 remain HOLD until independently evidenced.

**Important:** normal Supabase public authentication and direct Supabase RPC endpoints also require a final production boundary review. This PR gates the trusted first-team Worker management API paths and the signed-in Team Access UI, but these are not a substitute for real installed API/RLS negative tests or external privacy assessment.
