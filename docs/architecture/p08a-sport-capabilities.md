# P08A — Current-platform sport capabilities and safe rules presentation

**Baseline:** PR82 merge `161a265ebe9973bb73e141bab87518c34b2e8c35`. P08 phase issue [#50](https://github.com/pdomoney/team-manager/issues/50).

## Purpose

Give each team an explicit, **read-only** description of sport capabilities already present in Team Manager. This prevents an unsupported sport from silently inheriting Oztag rules, an eight-player tactical field, rugby-league-only staffing badges, or a different sport's sourced rules. It does **not** add new official rule content or certify a sport's requirements.

### The contract

`sportCapabilities(team, club, rules)` derives capabilities from the actual team override/club default:

| Domain | P08A source of truth | Safety boundary |
| --- | --- | --- |
| Sport / positions | Existing `model.js` sport list and `positionsFor` | Custom lists preserved. Position labels do not verify eligibility, role count or a complete team formation |
| Source-backed rule packs | Existing `rules.js` plus `ruleSetId` | Oztag, Rugby league, League tag only. A manually selected pack for another sport is an explicit mismatch, **not** a verified rulebook for the active sport |
| Rule source/grade | Existing approved versioned `RULES` pack | Publishing a pack does not mean a club's by-laws, draw, competition rules or recent amendments were independently verified |
| Tactical diagrams | Existing Oztag field editor | Only Oztag has its complete native eight-slot tactic renderer; other sports retain a concept-only eight-slot teaching canvas |
| Match staff role template | `match-crew.js` sport-specific templates | Potential roles, NOT an approved match-minimum policy or proof of accreditation |
| Transfer concepts | `play-transfer.js` supports five codes | Coach-review concept guide, never a converted or match-ready diagram |
| Local library and tenancy | Existing encrypted coach workspace | Metadata/copying only, not authenticated association/club library access |

The contract deliberately omits players, health, contacts, accreditation identifiers and match history. Returned metadata and inventories are frozen to guard against accidental mutation.

## Application behaviour

The Rules screen distinguishes:

1. **Supported same-sport rule pack:** normal prior behaviour and source references.
2. **Unsupported sport:** clear no-built-in-pack advisory; no phantom Oztag rule list; coach offered review of sport/settings.
3. **Explicit cross-sport pack:** a prominent warning identifies the mismatched sport and hides the other sport's scoring, restarts and gameplay values until the coach reviews the selection. No silent alteration of selected rules, existing team settings or prior by-laws.

Other tactics, plays, lineups, match-day staff, encrypted exports and publishes are unchanged in P08A.

## Regression and acceptance

- Node `test/p08a-sport-capabilities.test.js`: every known sport, rule-pack/age selection, unbacked sports, mismatch, default inheritance, customised positions, immutable/personal-data-free projection.
- Browser `test/browser/p08a_rules.py`: Oztag baseline, Touch no-pack and explicit mismatch, matching Rugby League, mobile and desktop presentation.
- Existing Node/Chromium, data export, library/version history and publishing tests must remain green.
- Exact-head PR CI and artifact, owner acceptance, then post-merge main CI are mandatory. Physical Safari/manual testing and **P08 final phase acceptance** remain separate.
- The P06 and P07 phase acceptance issues remain open. No claim of Safari/device qualification from synthetic Chromium.

## Planned P08 sequence

- **P08A (this PR):** capability contract, coverage/advisories, negative cases, no schema migration.
- **P08B (future):** explicit local library ownership/copy/version and reviewed sport attribution, preserving existing team-specific plays.
- **P08C (future):** sport-aware tactic/teaching presentation and rule/scoring compatibility qualification; do not substitute Oztag formations for unvalidated codes.
- Then final manual Safari/owner and post-merge acceptance gates. Every PR is independently reviewable.

## Rollback

Revert the P08A PR to PR82 merge `161a265ebe9973bb73e141bab87518c34b2e8c35`. No data migration, new storage keys, server services, encryption changes, deleted content or rule-pack modifications. Reverting only presentation removes the warning about cross-sport selections, so keep the compatibility documentation alongside any rollback decision.
