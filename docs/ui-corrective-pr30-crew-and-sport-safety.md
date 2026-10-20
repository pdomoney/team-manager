# Controlled UX corrective: PR26–PR29 audit follow-up

## Baseline and persistence guardrails
Built from main commit 1f0acbcacd2feb37c8d2c9d83370f1b4e7ce67a5, following PR29's multi-club synthetic test library. No schema migration, re-keying, clearing, reseeding, or publishing of user or test records is part of this PR. Keep browser-encrypted coach storage, optional encrypted GitHub publication, the two-device comparison/merge, and manual backup workflows unchanged. Browser tests use isolated synthetic workspaces.

## Scope
- **Volunteer entry (Issue #24):** one selectable card, not nested pills; white helper text when selected against the palette's dark colour; compact padding and keyboard focus.
- **Custom palette accessibility:** recheck text contrast of dark-card fallback buttons, not only button-to-header separation. Maintain 17 palettes and semantic colours.
- **Badges:** expiring accreditation badge marker uses the current warning orange, without changing qualification or eligibility semantics.
- **Match staff page (#crew):** clear selected-team context; section shortcuts; club volunteer directory first, staffing requirements distinctly team-scoped below it; simpler WWCC summary badge rows. Full sport role and status badges remain available through the profile and assignment workflow.
- **Volunteer roles:** allow zero current roles for one sport with confirmation and warning for future match assignments. Preserve historic qualifications and other sport roles. No registration source is invented.
- **Advanced Match Day:** existing eight-player field and increment-by-one Try buttons are Oztag-specific. Hide the advanced Match Day CTA for other sports and route attempts to standard match details. This is a safety limit, not full multisport scoring support.
- Accepted design deviations from the previous audit are not broadly redesigned.

## Acceptance and continuity
- Unit and browser regression tests at the exact branch SHA, including match staff tests at 390px/1280px.
- Existing Oztag Match Day scoring, arrivals and bench unaffected; other sports cannot accidentally use Oztag-specific controls.
- Match staff club/team selection, volunteers, registration and qualification data unchanged by UI layout.
- No changes to GitHub publish, live website, seed test library, vault, player projection, repository data structures or storage.
- Real iPhone and macOS Safari checks remain owner acceptance tasks.
- Follow-up: competition-aware, sport-specific positions and scoring for Match Day rather than guessed support.

**Never merge or publish automatically. Owner review and explicit approval required.**
