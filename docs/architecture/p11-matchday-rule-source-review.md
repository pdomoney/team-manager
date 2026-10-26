# P11B — Competition-format rule-source transparency for Match details

Issue: https://github.com/pdomoney/team-manager/issues/31. Depends on [merged PR108](https://github.com/pdomoney/team-manager/pull/108), head of `main` `49cd3987696e935d5b7115025388dee4e2b6c97e`.

## Source research, 26 October 2026

The NRL's [official Junior League Laws (6–12) page](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/) explicitly directs teams to **their local league** for the actual format for U9–U12 while some regions transition to the Player Development Framework. The NRL support centre's [laws/policies guidance](https://support.playrugbyleague.com/support/solutions/articles/51000424806-laws-of-the-game-codes-policies) likewise notes differences by state/local body. The repo already contains dated reference packs (`site/rules.js`) for Oztag, Rugby league 6–12/13+ and League tag. A pack listed in the app is **not** conclusive proof of the competition format or entitlement to deploy controls.

This PR deliberately **does not invent numeric scoring values or make source licensing claims**. It uses only already-bundled public reference URLs; no scraping, PDF replication or external images.

## Implemented

- `site/match-format-source-review.js`: fail-closed, immutable read-only review of team sport, explicit/inherited rule pack, source edition/check date, competition, season, age group and category. A cross-sport rulebook is detected; unknown/synthetic rule sources never allow scoring.
- Each Match details sheet now includes a collapsed **“Sport and competition rules · Review required”** disclosure showing those details and the safe URL for an existing bundled official rulebook. It never silently treats a rulebook as organiser sign-off.
- A missing rules reference, wrong sport pack, or missing scope remains visible as a review gap. The linked competition and match's own season are used; the *current* active season is not substituted for a historical match.
- Result, lineup, score and team workspace code paths are unchanged from PR108. Existing Oztag controls continue; other sports still require rules verification before sport-specific controls are enabled.
- Node tests cover exact-source, mismatch, absent-source and missing-context fail-closed cases. Browser tests cover 390px portrait, 820px and 1280px with Oztag, Rugby league U8 and Netball, including no match-data mutation.

## Review and future approval required

A reviewer must select the authoritative competition, current season and grade/category, check the organiser's competition-specific by-laws and source edition, document a rule approval/withdrawal lifecycle, and obtain owner sign-off before any future scorer, lineup, bench, substitution or match period feature is enabled. This **does not complete milestone M2**; it exposes missing evidence to the coach and maintains explicit gaps. Human review and real iPhone Safari testing remain outstanding.

Rollback affects this one read-only disclosure and helper module; it never alters stored match data or GitHub encrypted team copies.