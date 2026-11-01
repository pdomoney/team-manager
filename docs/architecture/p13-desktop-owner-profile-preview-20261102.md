# Desktop Owner profile preview (P13, scoped UI feature)

Tracking: [#55 Production identity gate](https://github.com/pdomoney/team-manager/issues/55) and historical [#62 role preview](https://github.com/pdomoney/team-manager/issues/62). Implemented in candidate PR after [PR135](https://github.com/pdomoney/team-manager/pull/135) merged main `3d68f453993df3a094dde4b5977ad3b62e41a5f8`.

## User experience

**Desktop width ≥900 CSS pixels:** In the existing **Coach workspace** header a small **View as profile** button appears. Click it to open an accessible selector listing **20 fictional P12 profile examples** grouped by platform/association/club/team/match-day/player/multi-role. Select one profile to open a **fictional QA preview** of its exact allowed group, sample team context, roster, volunteer roles and permitted *simulated* match-day workflow. While previewing, the button becomes **Change profile**, and an adjacent **Exit preview** button returns to the unchanged Coach workspace. The selector can be closed by **Escape**.

**Mobile/tablet width below 900:** The new desktop control is hidden. Existing Test Library functionality stays as before, including its P12 header dropdown. Reducing viewport below 900 while an Owner desktop QA preview is active exits the preview without copying synthetic values to existing data.

**Security/UX boundary:** The existing Coach password/workspace is not a verified platform Owner identity. The new button does NOT provide real Owner access, impersonation, or a production role/context switch. It is explicitly labelled **fictional simulation**. The 20 profiles are fixed local QA fixtures, not an enumeration of real club members. All previews run against the fictional P12 sample groups (three clubs, eighteen teams). No real player contact/medical data, guardian data, appointments, credentials or published team files are read or modified by these profiles.

In preview:
- Normal settings, Home navigation, direct edit/submit/publish actions and real workspace routing are disabled as in P12.
- Team-scoped Coach/Manager profiles may make **disposable sample-only** roster/RSVP and staffing proposals; changing role/group discards them.
- A Player, Guardian, Volunteer, revoked Coach or unapproved invite never gains team editing simply by selecting its fictional profile.
- A Club Admin sees the six-team sample portfolio only in its exact club scope; the association and cross-club profiles preserve existing P12 scoped tests.
- A simulated Owner profile does not expose real tenant data or carry privileged access to children/health records.

## Technical changes

- `site/desktop-profile-preview.js` contains pure breakpoint eligibility (Coach mode, not player preview, width≥900), deterministic grouping of the 20 existing P12 synthetic people, and validation/rejection of forged profile names.
- `site/index.html` adds a header button, a plain selectable popover and an Exit button with accessibility labels, `aria-expanded` and focus handling.
- `site/app.js` toggles **session-only** `desktopProfileActive` / `desktopProfileOpen` flags; it reuses existing `p12QaView` and `renderP12QaScreen` without loading any real workspace data into the simulation, and guards other action handlers.
- `site/styles.css` contains responsive, keyboard-focusable desktop-only presentation.
- `test/desktop-profile-preview.test.js` and `test/browser/desktop_profile_preview.py` check forbidden inputs, role switching, safe reset, Coach vs Player mode, 390/820/899/900/1280 viewport differences and zero workspace writes.

## Release and UAT

- [ ] PR-head Node unit and browser Chromium regression green, including mobile/tablet breakpoints.
- [ ] Owner tests **View as profile** on macOS Safari at desktop actual size and confirms the 20 profiles and context-specific behavior; manual VoiceOver/keyboard evidence belongs in [#131](https://github.com/pdomoney/team-manager/issues/131).
- [ ] Owner manually checks selecting fictional Club Admin, multi-club QA18 Coach/Manager, revoked Coach, Player and switching back to unchanged original workspace.
- [ ] Owner reviews and merges PR; verify exact `main` post-merge Tests and Publish independently.

## Explicit exclusions

No Supabase creation, hosting purchase or integration; no provider credentials or RLS/SQL. The user approved Supabase only as an **isolated synthetic-data evaluation candidate** and explicitly prohibited moving existing data. This PR contains **no account migration, export/import, automatic cloud syncing, changes to encrypted GitHub files, production identity, server-side authorization or private data transfer**. Production identity and tenancy security remain gated in [#55](https://github.com/pdomoney/team-manager/issues/55). The desktop selector is a rapid testing tool, not an authentication substitute.
