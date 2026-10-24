# P09A — Shared intake controls and volunteer form consistency

**Phase:** P09 [#51](https://github.com/pdomoney/team-manager/issues/51) · **Platform:** existing GitHub Pages + encrypted local coach workspace · **Parent:** P08C PR85 merge `1ae7ab14ed742416effbf96b14ae16f537e61d8f`.

## User problem and bounded design

The owner reported confusing nested pill/card borders and low-contrast descriptions on iPhone Safari's Add volunteer flow (#24). Earlier styling addressed part of that problem, but separate ad-hoc markup for the three volunteer routes still made consistent field semantics, mobile sizes and future form consolidation fragile. This slice reuses one small side-effect-free form renderer for text/select/radio controls, while simplifying duplicate legacy styling and showing one distinct checked indicator.

### Delivered

- `site/form-controls.js`: reusable escaped native labelled input/select/radio controls; one fieldset and legend for the methods, with one explicit checked method, native inputs, optional help and deterministic options.
- `site/app.js`: share these controls among club-first chooser, manual person intake, workspace-existing volunteer linking and email-draft flow. One common contextual team selector; the same name/field keys and exact same form actions. No automatic link, role or registration inference.
- `site/styles.css`: remove competing older choice-card rules; a single compact tap target, selected helper text in white on green, visible check indicator, retained focus ring and phone spacing.
- Automated regression: unit-level HTML escaping/name/type enforcement and 390px/1280px synthetic browser checks for route semantics, keyboard focus, mobile overflow, disabled/optional fields and club-only volunteer persistence.

### Boundaries and backwards compatibility

- **No schema/data migration**, new role account, password change, tenant-facing page, person identity matching, backend, external invitation or actual email delivery. Existing `matchOfficials`/appointments, league-specific registration and WWCC rules are untouched.
- Source records live within the trusted encrypted local workspace only; UI club/team choices are *not* server-enforced permissions.
- Preserves older form names `crew-intake-start`, `crew-manual`, `crew-existing`, `crew-invite-draft` and values (`method=existing|invite|manual`, `clubId`, `teamId`, `personId`, `name`, `email`, `phone`, `joined`).
- Email invitation still opens only the owner's `mailto:` draft. No automatic invitation status.
- Existing sport-specific match readiness, transfers, Oztag-only match-day controls, photo crop, team branding and encrypted import/export untouched.
- **Explicit exclusions:** Post-P10 persona header switcher #62, authenticated association/club/guardian views #55, data-sharing escalation and unverified sport-specific scoring #31.

## Independent acceptance

1. **UI:** 390px portrait, 1280px desktop, and real iPhone/macOS Safari: club chooser, three single-outline choices, clear checked marker, legible secondary copy (WCAG AA 4.5:1), readable labels, 44px usable rows, visible keyboard/VoiceOver focus, no bottom-sheet horizontal overflow; no unsafe global CSS reset.
2. **Manual:** choose each entry route. Manual creates a club-only directory record without team/clearance; existing route keeps person ID and does not carry accreditation to a different sport/club; email route only prepares a mail draft; cancel/back is safe; names/emails from existing workspace escaped.
3. **Cross-feature:** team/club context, Rugby League vs Oztag role differences, historic records, player preview privacy, encrypted backup and publishing still pass. Test dates/identities are synthetic only.
4. **Automation:** Node + all Chromium suites pass at exact PR head, artifact retained, owner PR review then merge, post-merge `main` Tests/Publish verification, Safari evidence and separate P09 phase signoff before closing #51.

## Rollback

Revert this single PR on the current encrypted workspace without modifying data. The controls generate only HTML and CSS; no storage rewrite or migration is performed. If a form regression is reported, roll back P09A and validate the prior PR85 merge baseline. Existing records and encryption remain intact.

## P09 delivery sequence

- **P09A:** shared accessible controls / volunteer UX (#24) — this PR.
- **P09B:** consolidate common person forms with contextual, sport/role-specific sections and safe player photo-crop reuse; preserve existing IDs and legacy records.
- **P09C:** trusted owner/test-only club and association *previews*, clearly labelled as local simulations; context-aware coach multi-team navigation and inherited branding, without authenticated tenant claims.
- **P09D:** incremental form/controller cleanup and end-to-end compatibility/privacy/keyboard/mobile qualification with explicit manual worksheets.

Each is separately reviewed, CI-qualified and merged only after owner approval. P09 phase remains open until required physical Safari and formal acceptance. P06/P07/P08 unresolved evidence gates remain independent.
