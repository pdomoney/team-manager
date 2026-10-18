# New Team creation — fresh by default and explicit setup reuse

**Status:** Development candidate, not merged or deployed.
**Base:** Accepted `main` commit `55bcb007325f8fa4c9576889d0c4b8468be51064` (PR #14 merged).
**Branch:** `fix/new-team-fresh-setup-explicit-template-20261019`.

## Why

The old *New team* form displayed "Copy DragonTag Mixed 20s's training times, venue, field, rule set and by-laws" even when a coach was creating a team for a different club. Worse, that copy checkbox and the shared library import were checked by default, while `defaultData()` contained a legacy State Cup venue/training-time seed. Coaches shouldn't be nudged to import an unrelated team's training, rules or contacts when starting a new side.

## Intended UX

- **New team:** New blank team. Coach chooses club, category, sport, season, optional competition and dates. No existing team's setup source, no shared-library import option and no previous team's club/competition/venue/training schedule carried in automatically.
- **Use existing setup:** A distinct opt-in button in **More → Clubs and teams**. Only after the coach selects that action does the UI list the active source teams already in their encrypted coach workspace. The coach selects **one named source team**.
- **Setup reuse:** A named, checked copy option appears only in that explicit template path. Reuse is restricted to the **same club and effective sport**. If either differs, creation is blocked until the coach unticks the option and creates a fresh setup. Allowed: training venue/time, venue, field setup, explicit rule selection/team by-laws and custom team-position list if applicable. Excluded even here: source players, squad membership, staff, private team-contact number, team passwords, matches/RSVPs, sessions, season history, jersey issues/returns, and competition name/dates.
- **Shared tactics library:** never added by default. In the template path only, a separate unchecked checkbox explicitly adds library items. Normal New Team cannot import them accidentally.
- **Built-in starter tactics:** App-provided starter plays/layout may still be included, independent of any existing team; not a copy from another coach or club.
- **Existing teams:** no modifications to existing records, team IDs, sports, positions, jersey history or encryption.

## Access-control caveat

This is a **coach-workspace** application, not yet an app with individual coach accounts, club-level ownership permissions or verified coach-to-coach isolation. Teams accessible to the same coach workspace are visible to its editor. Hiding implicit copying is an important UX/data-integrity improvement, **not a substitute for access control**. Separate coaches who require data isolation must not share the coach workspace. Future per-coach sharing requires a separate role/permissions design.

## Automated regression plan

- Playwright `test/browser/fresh_team_setup.py`: sample old Oztag settings with private data; create Rugby League U16 boys under Taren Point Titans; assert **no template or library checkbox**, neutral club/competition/dates, distinct jersey/history and blank venue/training/staff/contact/by-laws. Then use **Use existing setup** on an explicit same-club Rugby League team, confirm only safe fields copied, verify rejecting copy across clubs, ensure source stays untouched and normal **New team** remains fresh afterwards; check mobile and desktop width.
- Run all existing `npm test` unit tests and entire Playwright suite including cross-team linked player/jersey, sport selection, live mock publishing and 30/60/100-photo capacity.
- Preserve the existing rule: club default sport is inherited, explicit Team sport override takes precedence; no involuntary migration of historical player positions.

**Manual acceptance:** New Team and Use existing setup flow on iOS/macOS Safari; verify field defaults visually; actual encryption/publishing and per-device storage are not qualified by Chromium simulation.

**No merge or deployment without explicit approval.** Keep source/history branches intact. Update exact-head pass/fail and GitHub Actions URLs only when observed.
