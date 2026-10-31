# P12E — Synthetic Role Governance, Review, Revocation and Audit

Tracking: [P12 #124](https://github.com/pdomoney/team-manager/issues/124). Built from PR127 merged main `7e9bd33c475f0125dc3a3e29fb5c7ff7c8968dd3` with exact-main Tests/Publish PASS.

## Purpose

Add a **fictional, in-memory** governance simulator to the P12 synthetic profile experience. Demonstrate how a team/club/association administrator may review and revoke **proposed test role grants**, and how the app is expected to deny cross-club, self-approval, expired and revoked grants. This does not authorise or authenticate any real user.

## Behaviours

- Nine bounded synthetic requests for Team Assistant, Team Coach, Club Support, Team Manager, Club Administrator, Fixture Staff Viewer and Association Viewer; includes one expired and one already revoked request.
- A reviewer must have an active matching scoped role. For **team** and **fixture** review, an explicitly hardcoded *fictional approval mapping* connects them to the responsible club. It does **not** imply inheritance of team/fixture record access.
- Platform Owner may review association administrator/viewer and club-administrator roles as configured in this **test policy**; association administrators may review their own association-viewer requests; club admins may review club-support within their own club and explicitly related team/fixture role proposals.
- Self-approval is denied, even when the proposer is also a club administrator elsewhere. Different clubs never confer administrative approval to each other.
- Approve, reject, revoke and reset are **only in-memory** snapshot transitions. Invalid requests, duplicate decisions, revoked grants and forged actions reject without modification.
- Audit entries record the fictional request, reviewer, exact active context, previous/next status and a **fixed simulation date**. They are illustrative, not a trustworthy event log.
- Expired roles remain ineffective; revocation remains visible; no dangerous 'restore' operation is silently inferred.
- Review workbench stays visible only under trial/test-library P12 persona QA, alongside the existing disposable roster/RSVP workflow. The selected acting-as role changes which buttons are offered. Review state survives fictional persona changes within the same QA session, but resets on QA exit or explicit reset.

## Security boundaries

- **Absolutely no real login, grants, database, encrypted data, API calls, permissions, passwords, private contacts, child records, emails or notifications.** The selected QA persona is user-controlled browser simulation, not a verified reviewer identity.
- No real appointment, accreditation, WWCC, fixture duty, match scoring, sport rule approval or official registration is created.
- All sample approval hierarchy and association/club/team/fixture mappings are fictional and will need a separately approved production policy and verified backend enforcement under [#55](https://github.com/pdomoney/team-manager/issues/55).
- P12F is still required for **fixture staffing and dual-role eligibility** against approved competition-specific rules under [#31](https://github.com/pdomoney/team-manager/issues/31).
- This component is not evidence of secure multi-tenant separation or real access control and must not be enabled in the real signed-in coach workspace.

## Acceptance checklist

- [ ] Exact PR-head Node tests PASS, including immutable state, self-approval, role expiry, wrong-club, revoked and protected-data boundaries.
- [ ] Full Chromium/Playwright (including capacity) PASS, with new P12E suite at 390/820/1280 and retained P12C/D regression.
- [ ] Owner checks fictional QA-04 Rangers club-admin approve/revoke, QA-18 self-approval denial, QA-05 two club contexts and audit/reset.
- [ ] Actual Safari/VoiceOver checks reported with real device/version and results; Chromium is not real Safari.
- [ ] Owner alone approves and merges; exact main Tests and Publish verified after merge.

## Known limitations
The governance module accepts a *client-supplied* fictional view by design. Its checks are valuable for deterministic UI and policy design tests but **do not stop a real attacker** and cannot protect any production user. Real server-side approval authority, membership checks, consent, tenant isolation and tamper-resistant audit are deferred.
