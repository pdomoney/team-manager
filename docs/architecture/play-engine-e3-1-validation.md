# Play Engine 2.0 | E3.1 sport-format contract validation

**Status:** E3.1 source candidate. Structural validator only; no approved Rugby League or junior formation, no renderer, no saved-play migration or production release.
**Base source:** Team Manager `main` `b970523003e492fb307454ad387ae30ee3370f3b`, merged E0 PR #193.
**Framework:** `pdomoney/walking-comet-development-framework` `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`.
**Contract design:** [E3 sport/formation checkpoint](play-engine-e3-sport-formation-contract.md), merged in PR #169, and [E0 baseline / owner decisions](play-engine-2-e0-e3-decision-checkpoint.md), merged in PR #193.

## Delivered in this bounded source change

`site/play-formation-contract.js` exports a pure, non-UI `validateFormationProfile(profile)` and `resolveFormationProfile(profile, explicitSelection)` with `contractVersion:1`. Definitions are not loaded from a new database, published to players or silently chosen from team sport. The resolver requires an exact `profileId`, canonical sport and format; for a proposed reviewed-teaching profile, it also requires an exact competition and grade match.

Validation covers:
- Explicit sport, format, contract version, immutable result and safe profile identifier
- Real field dimensions expressed in metres **or null for a concept**, independent of the legacy 50×80 teaching grid; fixed orientation
- Positive on-field participant maximum, distinct stable actor slot identifiers, named roles and bounded normalized position coordinates
- Source/provenance metadata, approved-rule-set *references* and review notes
- Optional defensive slot and marker roles, action categories explicitly described as review metadata, not rule execution
- Fail-closed unknown versions, absent profile, wrong sport/format, local competition/grade mismatch, missing provenance, incomplete slot count, invalid coordinates, duplicates, or unsupported status
- All results set `matchReady: false`. Even a structurally sound `reviewed-teaching` declaration has **not** been certified by a governing body; validation alone is not evidence that the provenance claim is true.

`test/play-formation-contract.test.js` uses **fictional** profiles. It tests valid concept and structurally valid reviewed-teaching shapes, malicious/invalid metadata, grade/competition spoofing, future versions, cross-code selection, a source-linked **reference-only** Rugby League 13s candidate with no formation slots, and preservation of the E0 old/new play golden fixture. Fake test coordinates are never asserted as lawful field formations.

**No profiles are installed in the production UI or made selectable by users.** The old Oztag Step Out / Step In illustrations and all other teams keep their existing code paths and permissions. Player cards, Learn/Watch, coach Teach/Advanced Diagram, encrypted publishing, role selection and workspace schema 4 have not changed.

## Governing references checked 10 November 2026

These are official entry points for *future review*, not accepted field profiles or player slot coordinates.

| Sport / format | Source | Verified boundary |
| --- | --- | --- |
| Oztag | [Australian Oztag rules](https://www.oztag.com.au/resources/rules) | Official rule overview identifies a maximum of eight on-field players, but does not certify Team Manager's existing eight tactical slots as a match-ready formation |
| Rugby League International 13+ | [Play Rugby League, International Laws 13+](https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/) and [IRL 2026 amendments](https://www.internationalrugbyleague.com/article/667/amendments-to-international-laws-2026) | International laws apply to age 13+ categories; rule amendments effective 1 January 2026; local competition or age rules still need review |
| Junior Rugby League 6–12 | [Play Rugby League, Junior League Laws](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/) | The governing site says U9–U12 local formats may differ and must be confirmed with the Local League; no universal junior profile enabled |
| NSW competition context | [NSWRL community competition guidance](https://www.nswrl.com.au/) | The relevant local league, grade, rule edition and competition format must be independently selected, documented and domain-reviewed before any match formation is represented |

No dimensions, role coordinates or legal game actions have been invented from these references.

## E3 next gates

1. **E3.1 PR exact-head:** Node `npm test`, established full Chromium browser suite and Linux Playwright WebKit B5 regression all PASS. Red checks HOLD the branch. PR left unmerged for review. No local execution asserted unless verified.
2. **E3.2 owner/domain approval:** identify the **specific** Rugby League grade and local competition, the authoritative applicable rule edition, and a coach/competition reviewer. Decide and source the formation slots, labels, dimensions, default shapes and any reviewed-action meanings for that **one** profile.
3. **E3.3 later bounded editor integration:** present explicit format selection only when a profile is accepted; unknown or mismatched codes stay concept-only; preserve cross-code teaching notices, old play bytes and coach/player read-only separation. Separate source CI from actual Safari and owner visual acceptance.
4. **E4–E7:** complete graph binding, timed ball owner/catch events and two authored defence branches as independently reviewed improvements; do not claim them because an E3 structural validator exists.

**E0 golden contract:** version-2 Oztag and old edited multiphase plays; schema-4 explicit linked pass and receiver run; library revision; unsupported junior concept; migration/export/reload unchanged. Any eventual persisted new format/profile schema needs explicit owner approval, a migration rehearsal and rollback. This PR changes neither source data nor runtime behaviour.
