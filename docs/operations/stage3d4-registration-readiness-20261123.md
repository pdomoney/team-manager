# Stage 3D.4 | First-team role and registration readiness

**Status: source development proposal. No live policy publication, database operation or release approval.**

## Current accepted journey and immutable facts

- The initial Platform Owner account was bootstrapped and verified; the 2027 St George Oztag `stgeorge-mixed20` first team was created; the same account's **exact-team Coach** grant was recorded under the initial-founder exception. Both grants are distinct.
- The installed Worker was updated after merged PR #281 to fix outgoing Cloudflare Auth subrequests. Actual owner setup/Coach buttons were owner-observed successful.
- The normal workspace currently hides the recorded roles when the **active registration policy has not been acknowledged**. Existing `tm_private.stage3d3_registration_ready()`, `public.tm_my_team_context()`, and Worker Stage 3D.3 gate correctly deny team records until the policy is active and individually acknowledged. Do not bypass those checks.
- No separately approved active terms/privacy documents or completed member invitation acceptance has been observed. This is NOT a failed Coach assignment.

## Source-only correction in this consolidated PR

1. Use the existing, trusted, read-only `POST /api/stage3d4/v1/owner` status to display initial Owner/Coach *recorded but restricted* even before the policy is active. It grants **no working context** and returns no roster/person data.
2. Replace misleading `No active access` claims for the founder with `Team access awaiting registration` and a direct registration/Owner navigation path; preserve no-role, expired-session and unauthorised denials.
3. Fix Owner card's registration-link overlap with distinct flow layout and a minimum 44px target. Replace the stuck `Verifying your access…` message with a meaningful confirmed state.
4. Explain `policy-unavailable` specifically on registration instead of implying that the Owner needs an invitation; retain unchecked terms/privacy and marketing toggles.
5. Preserve the existing demo, eight encrypted files, E5 play work, source packaging, existing Worker and application roles. No migration, new endpoint or provider settings change.

## Policy and role activation: independent decisions, not development defaults

1. Agree actual legal operator/controller, applicable terms, privacy notice, collection purposes, field inventory, retention, incident reporting and safeguarding boundary. Review `config/privacy-decision-register.json`; all 18 responses remain pending review. The draft Terms and Privacy Notice under `docs/privacy/DRAFT_*` are **NOT** approved legal documents and MUST NOT become registration endpoints directly.
2. Appoint and verify an **independent adult reviewer** and retain real authorisation evidence. The existing `registration_policy_versions.reviewed_by` is a foreign key to an existing application Account. With only the original founder account, an independent second reviewer is **not yet in the application account register**. The exact onboarding/reviewer establishment procedure must be separately approved; do not fabricate a reviewer, reuse the founder UUID as independent approval, or bypass the existing one-account bootstrap boundary. This is an explicit prerequisite to an independently approved active policy.
3. Obtain proper review and approve final document bytes, separately version both documents, publish to trusted **immutable version-specific HTTPS URLs**, calculate their real SHA-256, record reviewer UUID, date, approval evidence and the applicable policy ID. Do not use drafts, generic `example.test` sites, fake hashes or a generic landing-page URL.
4. After independent authority and the separate live-change preflight, use the existing `tm_private.registration_policy_versions` schema to insert ONE real reviewed active policy. The schema permits only one active row, with `reviewed_by`, `approved_at` and `approval_ref` required. **This PR neither creates nor activates that row.** Review exact live state before any eventual write.
5. In the existing Team Manager registration UI, the Owner must read and acknowledge BOTH current documents. Marketing remains OFF unless explicitly opted into. Then the application may expose the already-recorded Platform Owner and Team Coach **as two separately selectable contexts**. Test read-only entry, wrong-role denial, revocation and no unauthorised roster access. No new Coach grant or generic `user` role is required.
6. Introduce an approved independently verified adult Team Manager/invite journey separately. An activated team Coach role alone does not satisfy legal authorisation, suitability, payment or sporting eligibility. Juniors, guardians, emergency contacts and private fields remain blocked until relevant decisions/release gates pass.

## Qualification / owner acceptance

- Source Node tests: successful pending Owner status, denied/forged/wrong-team status, policy-not-ready message, structural layout regression.
- Browser Chromium/WebKit: anonymous vs founder, 390px/desktop layout, large text, policy missing vs acknowledged, two distinct selectable roles only after acceptance.
- Recheck prior Worker static/anonymous smoke and eight encrypted demo files when packaging next exact-source deployment. The installed PR #281 Worker is an accepted baseline, not evidence of this change being installed.
- Manual macOS/iPhone Safari, actual legal review, real policy acknowledgement, platform/coach context switch and member trials remain **PENDING**. This PR must remain OPEN until reviewed, then needs separate installation authority and acceptance.
