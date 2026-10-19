# Cross-code play mechanics and quieter typography — controlled UX candidate

## Design goal
Use one play's **tactical idea** across Oztag, touch, league tag, rugby league and (with greater review) rugby union. An eight-position Oztag drawing must **not** masquerade as a valid six-, 11-, 13- or 15-player formation, nor can any play be declared legal through text substitution.

## UX changes
- Coach opens a play and chooses **Adapt to another sport**. The original play and SVG diagram are never changed.
- The coach explicitly picks source and target codes. Legacy eight-player source defaults to Oztag but can be corrected.
- A deterministic, no-network `play-transfer.js` identifies **drawn** runs, passes, dummies, kicks and defensive shifts, separately from **possible themes inferred from coach wording** (overlaps, wrap, switch, restart, decoy).
- Four sets of target-specific checks cover possession/restart, formation, legality and player roles, with always-visible cautions and extra warnings for touch kicking and union breakdowns.
- Coach saves a short **private** note for the specific source→target pairing or copies the annotated coaching brief. No auto-generated role names, geometry, timing, legality or complete formation.
- Coach adaptation notes are deliberately absent from player encrypted copies and remain unshared until the coach manually creates and verifies a target-sport play.
- **Diagram role labels** have been removed from the public Plays index, renamed, and exposed through **Tactics → Library**. Advanced diagram includes the current labels and a safe pointer to the library. Managing labels no longer silently abandons an unsaved play edit.
- Display typography uses full-width Barlow instead of heavily condensed headings; large section titles are medium-weight, form labels and buttons are quieter. Important numbers and statuses remain distinct, and readable contrast is retained.

## Research and rules
Verified October 2026 against:
- [Official Australian Oztag rules](https://api.oztag.com.au/resources/rules/) and [2025 Oztag rulebook](https://oztag.com.au/ao/wp-content/uploads/2025/09/2025-AO-RULEBOOK-FINAL.pdf)
- [Touch Football Australia rules](https://touchfootball.com.au/about-touch-football/rules/) and [8th Edition](https://touchfootball.com.au/volunteer/8th-edition-rules/)
- [World Rugby 2026 Law 15 (Ruck)](https://passport.world.rugby/media/jxrnmptk/2026en-laws-of-the-game-compressed.pdf)

Competition rules and age-group modifications can vary. Do not hard-code generic restart timing, kick availability, safe blocking, or formations into a play translation. This stage does **not** purport to implement full league-tag-specific laws or referee interpretations.

## Required next architecture milestone
A proper sport-aware drawing model should separate (1) an abstract play concept graph (roles, movements, receiver/decoy decisions) from (2) team-code-specific role mapping, legal constraints, field dimensions, and (3) full athlete count and formation. Until implemented and qualified, cross-code comparisons remain written coaching briefs only.

## Release gates
1. `npm test`, privacy allowlist tests and all Python Chromium suites on 390px and 1280px.
2. Confirm original plays, teaching steps, SVG coordinates, player role highlights and mirror/animation remain intact.
3. Verify adaptation notes never appear in `teamView`, and no saved play geometry changes during adaptation.
4. Manual Safari/iPhone review of legibility, form clarity and typography; no live data migration and no merge without approval.

**This PR is a candidate and should not be auto-merged.**
