# Play Engine 2.0 | E0 baseline and E3 format decision checkpoint

**Status:** Candidate for owner review, not an adopted sport/format contract, schema approval or release decision.
**Source:** Team Manager `main` at `2b707dff48aafaa51d9ecaf1d2c24759e47085c6` (merged #192).
**Framework:** Walking Comet `main` `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3` (merged #42).
**Programme:** [Issue #166](https://github.com/pdomoney/team-manager/issues/166). Option B B1–B4.12 source implemented; B5 exact-head and post-merge synthetic CI PASS; complete physical Safari qualification remains separate.

## E0: What exists, what must survive

Team Manager is a phone-first multi-club/team app with Home as the working-team selector, five original navigation sections and explicit active role/group. Coach-authored play concepts are read-only for players; the public password-free development preview is **not** production identity or permissions. Existing persisted coach data uses **workspace schema 4**; old single-team copies with `version: 2` can be read and exported through `migrateWorkspace` / `legacyTeam` in `site/model.js`.

**Play representation actually supported at the baseline:**
- An Oztag-origin eight-slot teaching drawing using **50×80 abstract teaching coordinates**, not certified field metres. Historical starter IDs `quickie-in` / `quickie-out` display as Step In / Step Out.
- Position slots and defender/marker drawing objects. Diagram actor keys such as `player:LM` refer to **tactical symbols**, never registered children or player identities.
- Legacy `moves[].pts` and authored phases/labels/steps; an unlinked legacy movement does **not** prove who passed to whom or possession timing. Rendering/animation can approximate order but must not be promoted to an official sequence.
- **Partial E4 groundwork already exists:** `site/play-actor-links.js` supports explicit movement `linkVersion: 1`, `moveId` and `actorLinks` on new moves, and helpers to assign an explicit receiver or create a linked follow-on run. This is **not** yet a complete validated actor graph, ball-state timeline or defensive decision model.
- `site/play-study.js` distinguishes authored movement-linked study actions from unlinked legacy prose. `site/p08-play-compatibility.js` and `site/p08-sport-capabilities.js` expressly keep Rugby League and other non-Oztag drawings at **concept-only** coverage.
- The shared library and team-local play revisions, role isolation, encrypted coach/team copy boundaries, mirroring, Watch/Learn/Teach, zoom and saved phases must remain.

**New synthetic source baseline:** `test/fixtures/play-engine-e0-golden.json` contains version-2 Oztag starter and edited multiphase custom play, a schema-4 workspace with explicit V1 pass→receiver→follow-on run and shared-library revision, plus a clearly unsupported fictional Titans junior Rugby League *concept*. `test/play-engine-e0-golden.test.js` protects migration/export/reload without rewriting legacy bytes, stable linked endpoints after JSON roundtrip, read-only teaching semantics, unknown future link versions failing closed and non-Oztag formation caveats. No real player/member/contact details and no new schema.

## E0: Two candidate acceptance exemplars

| Exemplar | Coach purpose | What exists today | What still requires approval |
| --- | --- | --- | --- |
| **Oztag Step Out** | LM draws the marker; pass explicitly from LM to RM; RM catches and follows with a support run; compare a defender holding versus sliding | Legacy Step Out drawing; separate explicit-linked movement helpers; Coach Teach preview; Watch approximate animation | Definition of ball ownership/release/catch, authored event timing, and two distinct defender branches. Existing drawn path proximity is **not** reliable proof of an authored pass or decision |
| **Fictional Taren Point Titans junior Rugby League concept** | Explain a support line in age-appropriate rugby teaching language | Combined club/team demo catalogue and **illustrative eight-slot canvas only** | Exact competition/age format and governing, dated rule source; approved player count/roles/pitch, modified junior rules and sample formation, plus coach review. Do **not** present eight or thirteen arbitrary symbols as a verified match-ready formation |

These are proposed *acceptance narratives*, not evidence of on-field legality or permission to build a new League profile.

## E3: Proposed separation of concepts (not implemented)

| Concept | Candidate responsibility | Must not imply |
| --- | --- | --- |
| **Sport format / competition profile** | Explicit version, sport, format/age/competition identity, field dimension/orientation source, required role slots, defender/marker meaning, rule provenance and review status | A single "Rugby League" string licenses one universal 13-player/junior formation |
| **Tactical play** | Coach-authored abstract pitch coordinates, independent stable tactical actor IDs, phases, lines, authored instructions and optional versioned links | The tactical actor is a registered person |
| **Team lineup / registration** | Real team/season/squad and competition-appropriate lineup with existing role/registration boundaries | Changing a play moves a person on the roster or bypasses approval |
| **Animation sequence (later E5)** | Separately authored event ordering, ball owner and release/catch/failure, timing, concurrent player moves, seek/replay state | Legacy path order or free-text steps are factual timing |
| **Defence variant (later E6)** | Coach-authored hold/slide/press/recover branch with stable defender identity and explicit trigger | Conditional AI exists or one scripted illustration predicts a real defence |
| **Sport/rule guidance** | Dated governing sources with local competition overrides, allowed actions and review status | A rule summary alone establishes an approved full formation |

**Recommended nonbreaking compatibility approach:** treat existing saved play records as authoritative v1/legacy geometry and continue displaying them without migration. Introduce any *new* structured sport format or event model only as an **opt-in, versioned companion** after a reviewed contract, compatibility plan, synthetic forward/rollback checks and owner sign-off. Unsupported/mismatched sport views remain **concept only** and cannot silently turn into match-ready formations. Unknown future link versions fail closed.

## Owner architecture checkpoint (decisions not yet supplied)

Before starting E3 implementation, the owner should decide:

1. **Sport rollout:** retain Oztag eight-slot drawing; qualify a source-backed **Rugby League 13** profile and distinct **junior competition-specific modified** profile(s); then League Tag. Is this order acceptable? The junior competition/age and approved rule authority must be specified **before** its profile is coded.
2. **Tactic types:** distinguish **static illustration** (geometry only), **coach-authored sequence** (explicit timing and possession), and **defender branch** (two independently scripted choices). Do not auto-convert legacy prose or closest-path order into a timed play.
3. **Data boundary:** preserve v1/legacy byte shape and schema 4; gate any new versioned graph/profile persistence, coach copy/player projection, export and rollback on independent review. Do not add production logins, new hosting or automatic account/role grants as a side effect.

**Recommendation:** approve these concepts and the representative Oztag example first, then prepare a *separate* read-only sport-format contract validation with cited governing rules for the exact selected junior format. E4 full graph, E5 possession, E6 scripted defence and E7 upgraded player animation are later bounded PRs, not part of E0.

## Evidence and release boundary

- Tests at the PR's **final head SHA**: `npm test`, full existing synthetic Chromium browser CI including the B5 end-to-end coach→player journey, and the established B5 Linux WebKit job. A candidate test file existing is not proof that CI passed.
- Negative requirements: legacy authored play unchanged; unsupported code remains concept-only; unknown linkVersion not silently coerced; library and other team records intact; no real member data.
- B5 physical iPhone, iPad and macOS Safari, live Pages served asset/version and owner acceptance are **still outstanding as separately tracked gates**. This design fixture cannot close them.
- No changes to production data, encrypted publishing, code renderer, authoring UI or live rules in this E0 PR.

**What unlocks E3:** owner accepts the *format identity and rules-source approach* above, naming the Rugby League junior competition/age variant. Only then author a scoped E3 profile proposal and regression contracts. Keep this candidate PR unmerged until Node, Chromium and WebKit CI pass and the owner reviews the acceptance narratives.
