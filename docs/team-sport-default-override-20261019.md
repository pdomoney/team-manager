# Team sport overrides club default — corrective release

**Status:** New draft candidate; do not merge or deploy without approval.
**Source:** Merged `main` at `8972566dc4311da212babd7cf66fb95660ee9a7f`, after PR #13.

## Intent

A club may include teams playing different sports. The club's Sport field is now labelled **Default sport for teams**. Team creation and Team Settings have a clearly labelled **Team sport**, with the choice **Use club default**. The form displays the effective sport and the new-player position choices immediately when a coach changes the selected club or team sport.

**Precedence:** explicitly selected team sport > club default sport > Oztag fallback for unassigned/legacy data.

Examples: Taren Point Titans Rugby League club with League Tag and Netball teams; St George Oztag club with an independent Touch Football team. New players see the *team's* sport-specific position choices. Changing the club default affects only inheriting teams, never explicit overrides.

## Scope and preservation

- **UI-only behaviour change** to Player form explanation, club/team form labels and live sport/position previews. The model already supported the correct precedence, so no schema/migration changes.
- For teams inheriting sport defaults, an unedited default positions text box is kept in sync while selecting club/team sport on Settings. When a coach types custom positions, the list is *not* replaced automatically.
- The **Use these** button now resolves the club selected *in the form* rather than the previously saved club.
- No changes to `personId` cross-team linking, season squad history, explicit custom positions, jersey issue/return/correction, encryption, public player projections, or independent team passwords.
- No automatic reclassification of historical player positions; each team and season retains saved preferences.

## Verification

- `npm test` including new `test/team-sport-default.test.js` for mixed-sport clubs, override precedence, inherited defaults, historic position and jersey preservation, round-trip idempotence.
- `test/browser/team_sport_override.py` for Rugby League/League Tag and Oztag/Touch, creation/settings live previews, untouched custom position text and 390px/1280px layouts.
- Existing full browser regression, synthetic GitHub publishing and photo capacity suites remain required.

**Manual acceptance:** inspect team creation, Team Settings and a new Player for each mixed-sport club scenario. Verify real Safari behaviour and saved data in an approved non-production workspace. Do not treat Chromium simulator coverage as authenticated live publishing proof.

**Release handoff:** record the exact commit and results only after GitHub Actions qualifies the final PR head.
