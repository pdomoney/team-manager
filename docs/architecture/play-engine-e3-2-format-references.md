# Play Engine 2.0 | E3.2 source-backed format references

**Status (10 November 2026 AEDT):** Bounded proposal for review. Source-only catalogue and tests. No app-visible formation selection, no team/player records, no schema/migration, no approved sport lineup and no change to the Oztag editor.

**Baseline:** Team Manager `main` `3c3f6c6edee987206b99565b6de56e64d173b647` (merged PR #194 E3.1); framework `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. E0 golden fixture and E3.1 pure validator remain authoritative. See [Issue #166](https://github.com/pdomoney/team-manager/issues/166), [E3 design](play-engine-e3-sport-formation-contract.md), [E3.1](play-engine-e3-1-validation.md) and [E0 acceptance](play-engine-2-e0-e3-decision-checkpoint.md).

## Current evidence and constraints

Verified against official web pages on 10 November 2026; links below are reference **entry points**, not a substitute for full rule-book and local competition review:

| Candidate reference | Governing source | Safe fact represented | Deliberately not represented |
| --- | --- | --- | --- |
| `oztag-eight-reference` | [Australian Oztag official rules](https://www.oztag.com.au/resources/rules) | Oztag has a maximum of eight on-field players | A reviewed arrangement of eight attacking roles, official pitch metres, local grade and match-ready lineup |
| `rugby-league-international-13-reference` | [Play Rugby League, International Laws of the Game (13+)](https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/) | International laws are the relevant reference for 13+ age groups, with thirteen on field; Under 13–15 additionally use the National Safeplay Code | Particular Taren Point/NSWRL club affiliation, legal team shape, named slot coordinates, accepted field dimensions or local by-laws |
| `rugby-league-junior-6-12-local-review` | [Play Rugby League, Junior League Laws (6–12)](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/) | Ages 6–12 play modified laws; the official page specifically directs checking with the Local League for the formats of Under 9–12 competitions | **Any fixed junior player count**, universal junior formation, age-specific contact/tag assumptions or local grade rules |

The [NSWRL Club Hub laws index](https://clubhub.nswrl.com.au/support/solutions/articles/51000452816-laws-of-the-game) separately lists Junior League, International and other formats including League Tag and 9-/11-a-side. No League Tag/9-/11-a-side profile has been introduced by this PR.

## Implemented source contract

The new `site/play-formation-references.js` exports:

- `FORMATION_FORMAT_REFERENCES`: immutable entries recording a source link, date checked, canonical sport, format/age reference and maximum player count **only when defensible**. Every entry is `status:'reference-only'`, `formationReviewed:false`, `localFormatNeedsReview:true`.
- `formationFormatReference(referenceId)`: exact-key lookup, returns `null` for missing, mistyped, future or forged keys.
- `conceptProfileForFormatReference(referenceId)`: a read-only adapter to the E3.1 contract for Oztag-eight and International-13 references. It yields **no actor slots**, **no physical field dimensions**, no local competition/grade, no authorised rule set, no verified review or role assignment and always `status:'concept-only'` with `matchReady:false` via existing validation. For the under-specified junior 6–12 reference, it explicitly returns `{reason:'local-format-unverified',profile:null}`; it does not pick a count or form a deceptive profile.

The reference catalogue is **not connected** to the editor, sports selector, Rules screen, encrypted publishing, roster or player viewer. The existing `site/p08-sport-capabilities.js` and `site/p08-play-compatibility.js` preserve legacy concept-only behaviour for all non-Oztag drawings. Team Manager stays a phone-first team and club application, not a generic tactical editor.

## Qualification and next stage

`test/play-formation-references.test.js` checks positive frozen references and conceptual profiles, negative unknown/cross-code/future formats, absence of a universal junior count, no phantom 13-player tactical slots, and unmodified E0 schema-4/legacy/library samples. Run exact final PR-head Node, full Chromium and WebKit qualification. Do not infer physical Safari validation, authoritative competition formation approval, or real Pages source parity from CI.

**E3.3 gate:** owner identifies the exact target *competition/league + age grade + season/rules edition*, then the sporting-domain reviewer approves named role slots, field convention, attacking/defensive shape and match-safety constraints for a single narrow sport format. The first accepted candidate may then be introduced in a separate PR with an opt-in coach preview and honest concept/reviewed-teaching status; a public "match-ready" label remains separately gated on competition and roster authority. **No E3.3 profile can be manufactured just from this catalogue or from the number thirteen.**

B5 independent iPhone/iPad/macOS Safari owner acceptance remains open. E4 graph, E5 event/possession and E6 defensive branches remain distinct subsequent programmes. Do not merge, deploy, migrate or alter production data without their respective gates.
