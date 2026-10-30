# P12D — Disposable role-scoped workflow sandbox

Tracking: [P12 #124](https://github.com/pdomoney/team-manager/issues/124). Based on the accepted and merged P12C [PR126](https://github.com/pdomoney/team-manager/pull/126), main commit `867dd9b1738cd2b3810b885f8ea6613e9bb3e475`.

## Goal

Exercise realistic *fictional* squad selection, fixture attendance and match-day staff proposal actions while switching P12 test profiles and exact group/role scopes. This is a disposable training/testing aid, **not** live sporting registrations or production authorisation.

### Behaviour
- In the existing **synthetic trial/test-library QA** selector, choose a profile that has an active **team-scoped** Coach or Manager role. Club Admin, association Admin, player-only, guardian, helper, Scorekeeper, Trainer and inactive roles do **not** automatically gain the editor.
- Four fictional teams each have three example players, two example volunteers and one example scheduled fixture. Fictional names and identifiers are hardcoded in `site/p12-qa-workflows.js`; no app/workspace/player/contact data is read.
- **Coach / Manager** may change sample fixture squad selection and record sample coach-entered RSVP according to exact synthetic role capabilities.
- **Team Manager** may propose a fixture Trainer or Acting Coach using example volunteers. Proposals remain unverified and never grant access, registration, accreditation, staff readiness or competition eligibility.
- Each action creates a fresh in-memory snapshot. Switching person or role+group, exiting QA or resetting discards the previous sandbox; no localStorage, IndexedDB, GitHub, encrypted backup or network writes.
- Mismatched team, role, profile or fixture context, unrelated player/volunteer IDs, invented actions and unsupported RSVP/duty values are rejected.
- The view explicitly states **no approved rules, staffing eligibility, scoring or publishing**. This P12D demonstration does not implement sport-dependent score validation, match score changes or compliance decisions.

### Test plan
- Node pure-module tests: test data isolation, exact-team decision, RSVP, squad selection, duty proposal, duplicates, cross-team denial, revoked groups, invalid values, 100 reset cycles and no mutation.
- Browser full suite: new `test/browser/p12_qa_workflows.py`, 390px/820px/1280px, exact-team user actions, role switching resets, no unapproved fixture permissions, forged regular coach action rejected, stored workspace unchanged.
- Retain P12C and legacy QA tests. No system authentication is exercised in these tests.

### Physical Safari owner review
1. Open trial/test library, select **QA-18**. Choose **Head Coach · Example Rangers U16**. Change the sample squad and RSVP. Confirm no club/theme/real data changes and no staff proposal buttons.
2. Switch to **Team Manager · Example Stars Women**. Confirm all Rangers data disappears; create a sample Trainer proposal and verify it remains unverified. Reset the scenario.
3. Switch to **Player · Example Comets Mixed** membership, then **QA-12** and **QA-19**. Confirm no edit workflow.
4. Exit QA and confirm the actual test-library workspace remains unchanged; separately record macOS/iPhone Safari and VoiceOver results.

## Boundaries and next stages
- P12E still owns governance, approvals, revocation and reliable regression evidence. P12F owns sport/competition/season-specific **verified** trainer-coach eligibility and simultaneous staffing constraints.
- P11 #31 owns approved competition rules. The production role/authentication and actual multi-tenant data architecture is independent #55. **The pure synthetic checks here cannot enforce security for real users**.
- No data schema changes, migration, Supabase, club directory modifications, user notifications, fixture records, match results or public registration writes.

### Review gate
- [ ] Exact PR-head Node tests pass.
- [ ] Exact PR-head full Chromium/browser/capacity pass.
- [ ] Human review and explicit owner merge; no automatic merge.
- [ ] Exact main post-merge Tests and Publish checked separately.
- [ ] Physical Safari/VoiceOver human results explicitly recorded (not inferred from Chromium).
