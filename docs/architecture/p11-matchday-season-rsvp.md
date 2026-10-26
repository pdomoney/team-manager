# P11J — Fixture-season RSVP editor boundary (non-Oztag)

Base: PR116 merged by owner at `a62e40ed0a1f9a3aa9d2603fc6981f39ce6c6344`.
Issue: https://github.com/pdomoney/team-manager/issues/31

## Problem

PR114–116 introduced a coach-only non-Oztag **Match details → Squad readiness** review scoped to the fixture season. Its **Review recorded replies** and per-player review actions still opened the older Availability sheet, whose list was assembled from every player in the currently selected team, regardless of the fixture's historical season. Coaches could inadvertently record a reply for a player not in that match's season, and summary counts could reflect another season.

## Boundaries and implementation

- For **non-Oztag match RSVPs**, a pure `matchReplyRosterScope` derives exact fixture season membership using existing `findSeason` / `seasonLens`; it neither approves eligibility nor writes anything.
- The existing Availability sheet now lists only members of the fixture's recorded season. Reply-count pills use that same list.
- Missing/orphan season **fails closed**: there is no borrowed active roster, reply buttons or outbound Ask-for-replies prompt. The coach is directed to fix the match season in its existing details.
- Each non-Oztag reply button is bound to the selected team, match and season; clicking recomputes membership and refuses stale cross-season/foreign-player edits. Only a deliberate coach RSVP click saves the existing RSVP value; opening/reviewing the sheet remains read-only.
- The established **Oztag** RSVP list and its legacy click action, plus training-session RSVP, are intentionally unchanged.
- No new registration or player-eligibility assumptions, sport scoring, UI formations, new storage fields, notifications or automated outbound messages. Archived season data is not rewritten automatically.

## Verification

- Unit: 2019 archived vs 2026 active season; missing/orphan season; active season fallback; all supported non-Oztag sport types; legacy Oztag; unchanged data.
- Chromium: 390px, 820px and 1280px check that archived team Match Day shows only archived members; exact RSVP mutation only upon explicit click; no saved score change; stale-season fail-closed; orphan-season modal; Oztag remains intact.
- User must review the actual Safari flow before merge, then verify `main` Tests and Publish.
- **Issue #31 M2/M3/M4 remain open**: a consistent season-specific RSVP roster is not an approved competition lineup or scorekeeper.
