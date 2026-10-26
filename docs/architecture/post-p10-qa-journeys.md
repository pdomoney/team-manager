# Post-P10 #62B — Guided synthetic QA walkthroughs

This independently scoped Stage B builds on merged [Stage A PR94](https://github.com/pdomoney/team-manager/pull/94), main `a6429b904f0fcb1437aec1694f52a444f5d51da5`. All development remains on **GitHub Pages and its existing single encrypted coach workspace**.

## Purpose

The user can switch between the four *simulated*, fictional role views without repeatedly rebuilding accounts or teams. In Stage B the **Guided QA journeys** tile contains three role-specific, read-only walkthroughs per persona (12 total):

| Persona | Walkthroughs |
| --- | --- |
| Owner | Platform structure, licence concepts, role-boundary review |
| Association Admin | Affiliated clubs, association season concept, organisation report |
| Club Admin | Team administration, match-day staffing concept, club branding |
| Manager / Coach | Team squad, match day, training |

Every journey shows the selected fictional scope, 3 concise steps, and only the example entities belonging to that scope. Other synthetic scope choices may appear in the **selector** to permit navigation, but do not appear in the **active walkthrough** without explicitly changing scope.

## Security and privacy constraints

- Uses `site/p11-qa-personas.js` and `site/p11-qa-journeys.js` only; neither accepts any live team/people workspace input. No contact details, guardian records, medical data, accreditation history or passwords can be included in the walkthrough model.
- The existing Stage A gate still applies: visible only for a **coach in trial mode with the built-in fictional library**, and never in player preview or a live encrypted workspace.
- State is ephemeral, has no bookmark/token/role URL and no storage write. Persona or scope changes **clear the previous journey**.
- Read-only synthetic "journey" and "back" actions are the only new permitted actions in QA. Forged regular coach actions remain blocked. No changes to actual authenticated role grants, publication, billing, Supabase or other backend.
- These are **workflow walkthroughs and user-interface concepts**, not working administrative forms, real access controls, completed safeguarding/accreditation or verified privacy enforcement.
- Actual independently authenticated organisation/club accounts still require separately authorised [post-P10 backend/security #55](https://github.com/pdomoney/team-manager/issues/55).

## Qualification and rollback

- `npm test`: additional Node scenarios for 12 journeys, deterministic role context, invalid IDs, cross-association/team isolation, detached output and forbidden sensitive fields.
- `npm run test:browser`: new `qa_persona_journeys.py` runs phone width 390 and desktop width 1280, exercises all journeys, rejects forged actions, changes association scopes, verifies rendered records and confirms exit restores the unchanged existing coach workspace.
- Do not merge until exact-head full Node/Chromium **including capacity** passes and owner reviews the change; rerun main Tests/Publish after merge. Actual iPhone/macOS Safari/VoiceOver checks remain separate and not automatically marked PASS.
- Revert Stage B-added module, CSS/QA view wiring and tests to return exactly to the Stage A static picker. No user-data migration or credentials are involved.
