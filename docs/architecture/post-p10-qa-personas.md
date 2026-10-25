# Post-P10 #62A — Synthetic QA persona header switcher

**Stage:** first owner-reviewed prototype, **not** real identity/tenant authorisation. This QA-only feature is visible only when the existing coach session has **test mode** (`S.trial`) and the built-in deterministic **fictional test library** (`ws.testLibrary.version >= 3`). It does not run on a live encrypted coach session, player login or in a test workspace before the synthetic library is loaded. The QA state is ephemeral; never written to local draft, encrypted backup, URL, GitHub `data` branch or a token.

## Behaviour

1. Open a disposable test-mode Team Manager session, load **a fresh test library**.
2. The header now includes **TEST** and a compact, accessible dropdown: `Coach workspace`, `Owner`, `Association Admin`, `Club Admin`, `Manager / Coach`.
3. Selecting a persona replaces the ordinary workspace screen with a clearly labelled **TEST PERSONA · SIMULATED VIEW**. It uses **hardcoded fictional** associations/clubs/teams and short read-only workflow-area lists, rather than reading anything from the underlying coach workspace.
4. The contextual organisation/club/team select shows only synthetic scopes appropriate to the chosen persona (and rejects forged/unknown scope IDs). Association Admin scopes to one association, Club Admin to one club, Manager/Coach to one team, Owner has one synthetic platform context. This is **illustrative UI scoping**, not policy enforcement.
5. No real role grants, login, member lookup, records, editing, publishing, passwords, contacts, safeguarding/WWCC data or guardian accounts are included or exposed. The ordinary app navigation/settings are hidden in QA, unrelated application actions are ignored, and the QA page contains no forms that mutate data.
6. Select `Coach workspace` or use `Exit QA` to return to the existing session without losing the selected ordinary app tab or changing its workspace.
7. On a live coach session, player session, or if the synthetic test library is absent, the selector disappears. A refresh resets persona state instead of saving a pretend role.

## Limits and sequencing

This is **Stage A only**, intended to validate the header UX, scope selection, guard conditions and browser fit. It is **not** implementation of association-wide authenticated screens, working admin forms, impersonation, multi-tenant security, or genuine role-based access; these must wait for post-P10 backend/security [#55](https://github.com/pdomoney/team-manager/issues/55) and separate owner approval. Follow-on Stage B may add more representative isolated workflow walkthroughs **without** permitting actual data edits or merging records across clubs.

## Validation / acceptance

- `npm test` validates four roles, correct scoped synthetic projections, rejected invalid IDs, detached outputs and no credential/person fields.
- `npm run test:browser` adds `qa_persona.py`, checking initial disabled state, exact header options, 390px and 1280px layouts, restricted local scope, simulation notice, no forged coach actions, immutable underlying workspace, exit to actual session and no selector on live role.
- Must pass exact PR head full Node/Chromium with capacity, then owner review/merge and post-merge main checks/Publish.
- Actual iPhone/macOS Safari and VoiceOver remain a separate manual qualification; do not claim passing physical devices from Chromium tests.
- Rollback is surgical: revert this PR's new QA module, test files, header element, CSS and guarded app code; no data migrations or new account state.
