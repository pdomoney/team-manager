# P11 Match Day — sport-safe first implementation slice

**Issue:** https://github.com/pdomoney/team-manager/issues/31

This first slice is a **guardrail**, not completed multi-sport scoring. The existing Oztag-specific eight-position lineup and +1 try controls do not have validated equivalents for every other sport. A generic sport name must not be used to guess rugby league, league tag, touch, rugby union, netball, or AFL score mechanisms, age/category limits, periods or substitutions.

## Change and user impact

- Added `site/match-day-presentation.js`, a pure immutable, read-only capability decision. The model explicitly marks all non-Oztag sport-specific scoring and lineup controls as `not-configured`; no authoritative rules are presumed.
- In the existing Match details sheet, non-Oztag teams now see accessible notices for lineup and scoring instead of an incorrect Oztag eight-slot lineup creator or a field labelled "Our tries". Legacy results (including previously recorded numeric totals), fixtures, team records, replies and notes are **preserved**.
- Hide "Open Match Day" from non-Oztag match details as that specialist screen is not supported yet. Guard the corresponding form submissions so synthetic/stale action events cannot write an Oztag score or lineup for another sport.
- Continue all currently supported Oztag controls without modifying any team data schema, calculated rule counts or pre-existing scores.
- Browser regression at 390px, 820px and 1280px for Oztag, Rugby League, League Tag, Touch, and Netball. Unit tests cover additional Rugby Union, AFL and unknown sports.

## Deliberately not done

No unverified scoring tables, point values, number of players, substitutions, match periods, competition constraints, real-time registration feeds, role grants, storage migration, public club data or staff-policy changes. Rule-sensitive formats are to be introduced only after an **owner-approved, verified competition rules matrix** with age, category, competition and season.

## Reviewer and release gates

- Node unit suite (including 4 new contract tests) and full Chromium suite, including capacity, must pass at exact head.
- The owner should verify Oztag legacy scoring unchanged and the non-Oztag notices/absence of wrong buttons on Safari at 390px and wider layouts.
- Further rules/competition-specific scoring work remains open on Issue #31; **this PR does not close it**.
- Never infer independent governing-body approval from a sport label or from test fixture data.