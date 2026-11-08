# Option B | Play viewing and editing workspace programme

**Decision:** Owner selected Option B on 8 November 2026. A dedicated play-viewing and play-authoring experience is the target. Option C is recorded separately in [the future roadmap](../ROADMAP.md), not authorised for immediate development.

**Source baseline:** Team Manager `main` `9f325d246832021a3793f5ad708440bec564571a` (PR #175 merged). Walking Comet framework `main` `c6adabc42d903d4eba63410abfff510e68048cb5`. Current product is the GitHub Pages, multi-club/team/season app, not a generic canvas editor. E3 formation profiles are not approved match-ready profiles. Related programme: [Issue #166](https://github.com/pdomoney/team-manager/issues/166).

## Owner journey and fixed constraints

Coach: select current club/team and active role → Tactics → Plays → find Step Out or a coach-authored play → view the diagram and learn/watch instructions → edit it in a usable dedicated workspace → save and reopen → player/other permitted role sees the correct read-only experience. Retain club/team filters, player/coach permissions and the no-password development preview. Do not union role rights or reveal otherwise hidden records.

**Preserve:** existing starter IDs `quickie-in`/`quickie-out` (display names Step In/Step Out), saved geometry and legacy plays, versioned actor links, mirrored orientations, phases, teaching steps, animation control, library provenance, sport-concept disclaimers, encrypted workspace and local working team. A tactical actor is not a registered player. Source CI is not deployed runtime or Safari acceptance.

## Phased implementation (each stage separate, reviewable PR)

| Stage | Scope and positive acceptance | Negative / preservation check | Approval gate |
| --- | --- | --- | --- |
| B0: baseline and UX reference | Record current and owner-supplied 100%/zoom-out screens; run representative plays in Cards/List and coach edit | Old data intact, 390/853/1280 widths; permissions unchanged | Source + synthetic journeys; owner visual baseline |
| **B1: compact library** | Delivered in merged PR #176: compact Cards mode with much smaller diagram preview, readable title/brief, category and sport context; List remains available | IDs, playback, filtering, selected role/team and data unchanged; no horizontal overflow | Chromium layout checks and Safari owner review |
| B2: diagram-first viewing | On play detail, diagram is primary and text appears in a compact adjacent area on desktop; mobile uses diagram-first stack; learn/watch remain available | Both attack directions, notes, study cues and seek/animation remain functional, no data rewrite | Owner acceptance of actual desktop and mobile view |
| B3: dedicated editor workspace | Replace only the general-purpose **play editing modal** with a dedicated full-area coach page/surface: large adjustable canvas, properties drawer, persistent save/cancel/unsaved warning; maintain existing tools initially | Player read-only, role/group restrictions, no unintended navigation/login, existing draft and save pathways | Owner accepts actual pointer/keyboard Safari edit |
| B4: authoring usability | Fit play/field, zoom/pan with retained position, precise select/drag handles, explicit endpoint snap mode with visible feedback and keyboard/numeric position aids | No actor/path stealing, no unwanted snap, no viewport jump, robust undo/reload | Real Step In/Step Out and synthetic custom play edit tests |
| B5: qualification and release | Legacy and new versioned play roundtrip, viewport/zoom accessibility, mirrored view/animation, no-regression role/team checks | No migration or play loss; no claim of match-ready formations | PR CI **and** installed Pages/Safari owner acceptance |

**Design principles:** avoid relying on browser zoom; reuse the established dark board and Team Manager controls; prevent editorial text overwhelming tactical illustrations; preserve readable instructions and avoid moving them below impossible-to-find content; support both Cards and List; keep mobile paths practical. Incremental work can be rolled back stage by stage. A stage passing synthetic CI is not permission to skip the owner's visual approval.

**Current implementation boundary:** B1 is CSS-first and changes the **Cards library layout only**, not the SVG geometry, role logic, editor interaction, stored play or viewing components. B2/B3 are deliberately *not implemented by B1*. Draft acceptance criteria and design work can advance without merging future stages.

## Programme status

- B0: source and supplied screenshots reviewed; physical Safari baseline test remains pending.
- B1: PR #176 merged to `main` at `2284ff339ba26803e2466b5fc2aa05d84d3c5945`; source delivered, actual Safari owner acceptance not inferred.
- B2: draft PR #177 implements diagram-first viewer and compact supporting information rail, including header preservation across phases. CI and owner visual acceptance pending.
- B3–B5: planned, not implemented or accepted.
- E5 animation, E6 defence logic and optional Option C tactical studio: deferred until an actually usable B2/B3 experience is owner-accepted.
