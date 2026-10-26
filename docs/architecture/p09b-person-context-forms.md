# P09B — Shared person fields with role-contextual composition

**Phase:** P09 [#51](https://github.com/pdomoney/team-manager/issues/51) · **Parent baseline:** [P09A PR86](https://github.com/pdomoney/team-manager/pull/86) merge `4fc84a5a86ba639e4f8f7b6bcda3bdb375ab8df9`.

## Design and scope

P09A established native escaped HTML form primitives. P09B composes them for common **person name, contact and notes fields**, without conflating role-specific information:
- **Player:** name, coach-only mobile and notes; native sport positions, photo crop, jersey issue/return and cross-team identity references remain in the existing player editor.
- **Helper:** name, private mobile, relationship, notes, and an explicit **workspace-local linked-player chooser**. No inferred guardian relationship, access or invitation. Links only by existing player ID.
- **Volunteer:** name (120 characters), optional email (254) and phone (40) across manual intake and profile edit; person photo, club/team assignment and sport/season-dependent accreditation remain in their original flows.

`site/p09-person-form.js` offers a frozen role/field map, allow-listed combinations and safe HTML generated through `form-controls.js`. Unexpected role-field combinations throw, so a helper cannot accidentally receive a volunteer email/registration field or a player-specific note section. All rendered values/labels/options are escaped.

## Key invariants

- Preserve `data-form` names and existing `name` fields so save/cancel/back and validation handlers are unchanged.
- **No schema migration** or changes to IDs, `personId`, roster history, jersey numbers/loans, positions, photo data, guardian relationships, WWCC, accreditation, encrypted vault, publication, site manifest or authentication.
- Historical player names remain local to their team; helper/player linking stays explicit. A club-based volunteer does not acquire a real account or registration by saving their profile.
- Ordinary forms must remain usable at 390px and 1280px with private fields only in the coach workspace. The post-P10 persona tester #62 and genuine multi-tenant identity #55 remain outside scope.
- Do not infer official match roles or registration from a person contact field; derived sport and season rules remain authoritative where configured.

## Regression and acceptance

- Unit tests: required vs optional fields, exact labels/field keys, HTML escaping, invalid role-field combinations and safe local linked-player options.
- Browser synthetic 390px/1280px: player private contact edits preserve ID, jerseys, season and positions; image crop control exists; helper identity and linked-player record persist; volunteer local-only, WWCC unverified and profile fields survive.
- Full Node + Chromium including prior P09A volunteer intake, P08 rule/teaching tests, cross-team linked-player tests, encrypted backup, player-published privacy, accessibility and site publishing checks.
- Separate owner real iPhone/macOS Safari verification: text inputs, keyboard, voiceover, photo crop/scrolling, sensitive coach-only fields, consent. Record results in issue #51.
- Exact-head CI PASS with artifact retention and owner's explicit review/merge are required; issue #51 must not be closed on this PR.

## Rollback

Revert only P09B to PR86's accepted baseline. It changes markup composition in the existing coach UI, not any data representation. No database or encryption rollback is needed.

## Next scoped milestones

P09C will implement **labelled local test-only organisational previews** and contextual multi-team navigation without implying real organisation account permissions. P09D will qualify controlled form/controller cleanup and full privacy/mobile regression. P09 phase signoff is independent of merging these PRs.
