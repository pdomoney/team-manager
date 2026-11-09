# Play Engine 2.0 | E3.3 coach sport-format review (source-safe continuation)

**Date:** 10 November 2026 AEDT  
**Owner direction:** Continue toward completion of E3, preserving Play Engine 2.0 programme #166.  
**Initial product `main`:** `7ccb0967d7e6b4c9c66a4a0e8052833401554816` (merged #200, main Tests and Publish successful).  
**Framework `main`:** `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`.  
**Approval boundary:** The owner approved the E0 exemplar/direction and merger of E3.1/E3.2, but has **not** supplied an approved competition, grade, rules edition, sporting reviewer or full formation positions for the target Titans junior example. Do not infer acceptance from this source PR.

## Coach journey implemented

On an existing authorised coach's **Tactics → Plays → Play detail**, **Review sport format** opens a read-only, source-backed review sheet for the **current working team's sport**, with the original play sport shown separately. It does not alter the current play editor, diagrams or teammate identities.

1. Coach chooses one applicable governing *reference*, not an arbitrary other sport's profile. Oztag eight-on-field and Rugby League International 13+ are rules references only, not complete attacking shapes; junior 6–12 and League Tag deliberately have no universal player count or proposed coordinates.
2. Coach may enter the local competition/league, grade and season/rules edition **for this review only**. The UI never stores, publishes or synchronises those fields.
3. The result always says **concept only**, provides the official reference hyperlink, shows review omissions and creates a copyable brief for owner/domain approval. Even a complete local scope cannot produce `matchReady:true`.
4. Back to the play retains existing Watch/Learn and coach Edit actions. Players cannot access the review or its owner-only brief.

The logic is in `site/play-format-review.js`, consuming accepted E3.1/E3.2 contracts. It cannot create or reassign registered players, turn an old eight-slot canvas into a 13-slot layout, manufacture field dimensions, establish permitted play actions or mark a formation reviewed. A new source-only League Tag laws reference in `site/play-formation-references.js` has `maxOnField:null`; it does not guess the local format.

## Governing entry points checked for source metadata

- [Australian Oztag official rules](https://www.oztag.com.au/resources/rules): maximum eight on field is a source fact, not a certification of existing position slots.
- [Play Rugby League International Laws 13+](https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/): international age 13+ reference; U13–U15 also subject to National Safeplay Code.
- [Junior League Laws 6–12](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/): modified and requires local-league confirmation for U9–12; no single junior player-count assumption.
- [Play Rugby League Other Laws](https://www.playrugbyleague.com/laws-of-the-game-community/other-laws-of-the-game/): distinct League Tag, 9-/11-a-side and Masters formats, not an implicit League Tag formation.
- [NSWRL Club Hub laws index](https://clubhub.nswrl.com.au/support/solutions/articles/51000452816-laws-of-the-game): additional local format context.

These are **source entry points**, not accepted local competition/by-law/coach approval. Do not copy governing branding or assume an official partner relationship.

## Preserved behaviours and negative scope

- Existing `quickie-in` and `quickie-out` IDs (Step In/Step Out display names), legacy and V1 movement endpoints, 50×80 teaching geometry, original Oztag editor/Watch/Quick Look, mirroring, phases, library ownership and encrypted schema-4 workspace stay unchanged.
- Team scope derives from Home's working team; player view remains read-only. Cross-sport and unknown historical source fail closed. No role/permission changes, new login, database, network API, secrets, real roster, migration, deploy or Code Option C studio.
- `site/p08-play-compatibility.js` and `site/p08-sport-capabilities.js` retain their existing non-Oztag eight-slot **concept-only** warning; source reference counts do not override it.
- The copied brief contains only user-entered local format scope, source URL, play title, and missing review steps. It is not an encrypted backup or a publish trigger.

## Tests and acceptance

Exact-head `npm test` covers positive/negative reference selection, cross-code rejection, untagged legacy plays, League Tag and junior no-count behaviour, immutability, empty/future IDs, no source mutation, and copied brief sanitation. `test/browser/play_e3_format_review.py` exercises coach review, source link, no local persistence, return to viewer, player access denial and unchanged workspace at 390px and 1280px. Full Chromium and Linux WebKit regression must pass before merge. Source/browser CI is **not** a physical iPhone/iPad/macOS Safari or official sporting review.

## E3 completion HOLD (not a failure of the safe source change)

E3's original #166 checklist remains open until **one exact formation** is authorised: name the specific competition/local league, age/grade, season and governing rules edition; have the owner/nominated coach/competition authority approve field convention, player count, all *real* named tactical slots, attack/defence positions and marker/permitted actions. Then add that **versioned reviewed-teaching** profile in an independent PR with exact selection in coach editor, browser/mobile tests, compatibility/rollback and explicit owner visual/sporting acceptance. Only after these gates can E3 be called complete; match-ready still requires separate match/roster authority. Avoid blocking general E4 link improvements or E5 analysis on an invented junior profile.
