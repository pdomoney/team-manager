# Stage 3D.4B | One login, separate Owner/Coach contexts, adult invitations

**Status:** unmerged source development on a dependency branch. NOT INSTALLED, not policy-qualified, not permission to invite live users yet.

## Source and release authority

- Accepted deployed Worker reported by owner: `08d1fe89-96c7-4800-baad-eda5e2cdb672` at merged PR #281 SHA `a68ab2c8bb3d346291e45bcddfe703874bef284a`. Live version must be rechecked before any deployment.
- Dependent 3D.4A readiness source: PR #282 head `24db0f42583b63130226c692f039cc2691b46c62`, at time of development GitHub API showed **OPEN/DRAFT**, not merged. Source work here is based on that exact head. **Do not open a PR targeting main, rebase blindly or deploy this branch until PR #282 merge and accepted release base agree.**
- Existing protected resources: Supabase `uyjxvaobshaahzipzzds`, Worker `team-manager`, eight encrypted legacy/demo files, Stage 4 deferred plays. No new Supabase project, Worker, credentials, unapproved role, migration, backup or restore included.

## Accepted outcome and role boundaries

1. Existing verified email account signs in. The singleton founder already has a **Platform Owner** grant, the verified `stgeorge-mixed20` **2027 Coach** grant, and an existing team. Never create these again.
2. After independent registration-policy review, a single current Terms/Privacy acknowledgement opens **two distinct explicit role contexts**. Owner administers exact-team adult invitations, reviews and revokes; Coach manages team operations under the Coach role. Never merge role powers or expose roster under the Owner context.
3. Before registration acceptance, display the two **recorded but restricted** grants; do not infer an active working role. The legacy Git encrypted demo remains unaffected.
4. Invitation offer: Platform Owner may issue for **Team Manager**, **Assistant Coach**, **adult Player** and **Volunteer** (and Coach if needed) only for the existing team. The private SQL still verifies exact team, email, expiry, reviewer provenance, accepted policy and role.
5. **Invitation deadlock corrected:** a verified new recipient may `list.mine` and `claim` an exact email-bound, unexpired approved invitation *before* their application Account and policy acknowledgement exist. This does not activate their role, provide team data, allow self-approval or excuse adult review. Every other `/api/stage3/`, `/api/stage1/`, `/api/stage3b/` action remains policy-gated. The direct Supabase RPC still performs its existing exact-email/account checks.
6. The founder Coach UI routes approval/activation to their **separately selected Platform Owner authority**, since the one-time founder Coach grant is not a generic independently approved second Coach.
7. Invitation return URL targets only `https://team-manager.paul-domoney.workers.dev/cloud-access.html` (same existing Worker). Whether Supabase Auth SMTP/provider can deliver and its actual sender identity, rates and reputation remain **UNKNOWN**. UI must distinguish `sent`, `existing-account` and `failed` and must never claim delivery if the provider failed.

## Controlled real activation gates (NOT satisfied by source changes)

1. **PR #282 source/merge gate:** verify GitHub main contains merged PR #282 and rerun tests on the new exact source; this branch is dependent source only until that gate passes.
2. **Privacy/controller gate:** complete owner/legal review of the current draft adult Terms and Privacy Notice, including the proposed prospective Free Account play-template licence, field categories, retention, processors and data subject rights. The policy docs are drafts, not authorisation to harvest or disclose private plays. Any child-related accounts, linked guardian data, emergency/medical details and under-18 invitations remain outside this adult-only release.
3. **Independent policy-review gate:** a distinct, real, independently verified reviewer must have an actual application Account, so `tm_private.registration_policy_versions.reviewed_by` has a valid foreign key. Existing installation has only one verified founder account. Establish the second review-only account via an independently authorised, least-privilege onboarding/bootstrap process; **do not fabricate a reviewer, grant this reviewer a team role, spoof evidence, or self-review**. This step has no approved live execution path yet.
4. **Actual documents:** publish immutable reviewed HTTPS terms/privacy versions with real SHA-256s, actual reviewer and legal approvals, and one accepted active policy. Do not create placeholder policy rows or auto-acknowledge terms. Owner must explicitly acknowledge current versions; default marketing false.
5. **Controlled existing-Worker installation:** verify current Worker version, main source/tag alignment, last rollback version, eight ciphertext hashes, no automatic Builds overwrite, correct `SUPABASE_SECRET_KEY` *binding name* and configured `ONBOARDING_REDIRECT_URL`, and existing emergency rollback. Any actual deployment needs fresh explicit release approval; no browser or production changes occur in this branch.
6. **Live acceptance:** owner sign-in, two selectable Owner/Coach contexts, wrong-role denial, no Owner roster access, invitation issue through Owner to real independently approved adult Manager, verified email claim before policy, independent adult review, explicit terms/privacy, exact-team activation, Manager sign-in, role-scoped read/write, same procedure for adult Volunteer and adult Player, delivery failure/retry, expiry, wrong-email claim, foreign-team denial, revocation and two-device macOS/iPhone Safari checks. Do not onboard a child as a workaround.

## Current source tests

- Node `test/stage3d4b-prepolicy-claim.test.js`: accepted list/claim, denied forged action or extra fields, unverified or wrong-origin caller, denied all team operations before policy, unchanged old modes.
- Browser `test/browser/stage3d4b_invitation_claim.py`: synthetic new adult with no registered App Account, email-bound invite claim, no usable role before approval, 390px and 1280px layouts. Wired into Chromium and WebKit CI.
- Reuse PR #282 separate Owner/Coach role, policy acknowledgement and responsive UI tests.
- **CI remains pending** while dependent PR #282 is reported open/draft; no claim of passing this branch or any live participant invitation.

## Owner-visible readiness

- Prior verified: founder account, 2027 team and Coach grant recorded, with no active policy.
- This branch implements the pre-policy invite claim and UX improvements, but **does not activate access or send live invitations**.
- Next operator action: reconcile/merge PR #282; finish reviewed policy and reviewer authority; then qualify this source as one new PR and perform an separately authorised existing-Worker release.
