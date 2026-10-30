# P12C — Role-based QA profile and scope switcher

Parent: [P12 #124](https://github.com/pdomoney/team-manager/issues/124). Baseline: PR125 merged main `b3e1530ce7a4a645bd591866b70774fb2300a131`. This is the **next synthetic-only milestone**, not real group access.

## What's delivered
- 20 deterministic, fictional test people (`QA-01` through `QA-20`), selectable in the existing QA-only header drop-down while the **trial/test library** is active. The original four role-preview options remain available.
- For each person, the second dropdown switches among explicitly assigned role/group scopes, memberships and proposed match-day duties. Each selected context shows its kind, group, activation status and **expected synthetic** capabilities.
- QA-18: five independently scoped app roles across two associations and three clubs/teams, plus player/helper memberships and unverified Trainer/Acting Coach match duties. No special rights or QA18-specific logic.
- QA-12: Trainer/Acting Coach duties as non-authorising proposed match assignments, not official qualification evidence.
- QA-19/20: revoked role and pending invitation that confer no simulated capabilities.
- Pure module `site/p12-qa-profiles.js` built on `listP12TestContexts` and `evaluateP12Access` from P12A/B, plus new Node and full-width Chromium regression.
- Existing role-only QA walkthroughs and acceptance checklists remain intact.

## Isolation and safety
- Header control is displayed **only** when `S.role==='coach'`, `S.trial===true`, `state.preview===false` and the synthetic test library is active at version 3+.
- Profile selection is local, ephemeral state. No persistence, remote API, authentication, participant search, new schema, staff appointment, password operation, club catalogue edit, encrypted-workspace write or publication.
- Existing click-action allowlist blocks forged coach actions while a QA profile is active. Profile selection never passes user-supplied or workspace data into the P12 simulation module.
- Membership and appointment **do not** become access grants. Sensitive person, junior, medical, guardian/WWCC and accreditation evidence remain absent.
- Profile simulator cannot enforce any real permissions on GitHub Pages. Verified user identities and server-side group/role authorisation require a separately approved production security implementation under [#55](https://github.com/pdomoney/team-manager/issues/55).

## Owner acceptance (not covered by Chromium)
1. On desktop, open the fictional test library, select QA-18 and inspect all nine assignments. Switch from club admin (Example Rangers) to team manager (Example Stars), then to Example Comets player membership. Confirm the last selection has zero app grants.
2. Select QA-12 and ensure Trainer and Acting Coach are both labelled **unverified proposals**, not approved match staffing. Select QA-19 and QA-20 to check no privileges.
3. Exit profile QA and confirm the test library workspace is unchanged.
4. Repeat on actual iPhone/macOS Safari with keyboard/VoiceOver and record version, device and results independently.

## Deferred
P12D will use disposable fictional squads, games and calendars to exercise real application workflows. P12E adds audit/approval and explicit revocation evidence. P12F checks match substitution against exact, approved competition rules, real eligibility evidence and separate-person staffing conflicts. Nothing in P12C activates these capabilities.

**Release gate:** exact PR-head Node and full Playwright Chromium/capacity PASS, owner approval and merge, exact merged-main Tests/Publish, real Safari result recorded separately.