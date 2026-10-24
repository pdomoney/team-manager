# P06–P09 closure qualification and owner acceptance worksheet

**Baseline:** existing GitHub Pages app and encrypted coach workspace. The latest reviewed starting point for P09D is P09C PR #88 merge `455d77bdfea4fd5f893fae7e0defd6f933a45dbf` on 24 October 2026.

**Purpose:** complete outstanding independent manual and evidence gates without rebuilding P06, P07 or P08. Use fictional local teams and disposable encrypted test workspaces. A successful Chromium suite is not a physical iPhone/macOS Safari run. An owner-approved PR merge is not by itself phase acceptance. Do not mark any unperformed test PASS.

## Status at worksheet creation

| Phase | Implemented | Automated evidence | Open gates |
| --- | --- | --- | --- |
| [P06 #48](https://github.com/pdomoney/team-manager/issues/48) | PRs #69–#76 merged | PR76 exact head 335 Node / 1103 browser; recorded main Tests #39886253158 and Publish #39886253178 PASS | Physical Safari and real user journeys; phase-level owner acceptance; final issue close |
| [P07 #49](https://github.com/pdomoney/team-manager/issues/49) | PRs #79–#82 merged | PR82 exact head 381 Node / 1139 browser in 33 suites | Independently verify main Tests/Publish, physical Safari [S1–S10](p07d-acceptance.md), phase-level owner acceptance, close |
| [P08 #50](https://github.com/pdomoney/team-manager/issues/50) | PRs #83–#85 merged | PR85 exact head 402 Node / 1189 browser in 36 suites | Physical Safari S1–S10 in issue #50, independent main Tests/Publish proof, close; **formal owner acceptance already recorded** 24 October 2026 |
| [P09 #51](https://github.com/pdomoney/team-manager/issues/51) | PRs #86–#88 merged; P09D final qualification is separate | PR88 exact head 415 Node / 1264 Chromium in 39 suites | P09D CI and owner-reviewed merge; Safari/privacy/form journeys, main Tests/Publish, explicit phase acceptance and close |

## One manual qualification session, four independently recorded results

Record device model, OS and Safari versions, test workspace description, tested branch/commit, date/time, tester, actual outcome and screenshot/defect link in each phase issue. Reuse the *same fictional multi-club dataset* and device setup across phases, but record each phase's required outcomes separately.

### P06: volunteers and compliance (issue #48)

| ID | Test with fictional people and clubs | Expected |
| --- | --- | --- |
| V1 | League fixture and Oztag fixture | Code-specific duties; League yellow/blue/orange trainers never leak into Oztag defaults |
| V2 | Understaffed fixture with one person nominated for multiple roles | Coverage counts distinct eligible staff correctly; no silent double-count |
| V3 | Expired, unverified or revoked *manual* WWCC/accreditation | Visible review warning; app does **not** claim live registry verification |
| V4 | Same volunteer assigned to overlapping fixtures in two clubs | Conflict reviewed without automatic reassignment or exposing sensitive staff details |
| V5 | Helper also linked to two children in different teams | Stable person/history, correct child/team context and no unintended cross-club sharing |
| V6 | Club-only volunteer assigned and later deactivated | Lifecycle and audit history retained; no false active registration or eligibility |
| V7 | Coach versus restricted player preview | No private WWCC, staff contact, medical, guardian or coach-only cross-club data displayed |
| V8 | iPhone and macOS Safari volunteer intake/appointment edits | Tap targets, focus, mobile layout, save/reopen and local encrypted draft behave correctly |

### P07: competition and fixtures (issue #49)

Execute and record **all S1–S10** in [P07D Safari worksheet](p07d-acceptance.md), covering provenance, overlapping records, amendments, linked duties, historic results, privacy, offline backups and two-device conflicts. Do not infer official fixture authority from manual coach inputs.

### P08: sport rules, tactics and play libraries (issue #50)

Execute and record **all S1–S10** in issue #50, covering four sport contexts, rule-pack mismatch and unsupported codes, historic plays, copy/revision provenance, cross-club review, restricted player preview and Safari encrypted backup/import. P08 phase owner acceptance is already recorded; do **not** request duplicate acceptance if existing scope stays intact.

### P09: role-based forms and design concepts (issue #51)

| ID | Test with fictional data | Expected |
| --- | --- | --- |
| R1 | Add/edit player using mobile Safari | Native name/contact controls; photo crop, jersey issue/return, position membership, person ID and season history preserved |
| R2 | Add helper and link/unlink a player | Local relation and private phone preserved without creating a guardian account or changing child access |
| R3 | Manual volunteer intake and edit | Correct max-length/contact requirements; club-only unverified volunteer allowed; no accidental eligibility grant |
| R4 | Switch teams between two clubs, inspect home | Correct club crest, branding, sport, team and division; no inherited unrelated team settings |
| R5 | Open P09C preview and switch all four concepts | Every view explicitly labelled design-only; never claims a signed-in owner/association/club account |
| R6 | Choose another managed club; try unknown/archived IDs in synthetic tests | Correct local scope; invalid actions rejected and player/guardian/medical/staff details never rendered in preview |
| R7 | Enter restricted player preview then attempt coach-only form/organisation action | Denied; return to coach restores navigation without persistent persona |
| R8 | iPhone and macOS Safari: form keyboard/tab, modal close/focus, portrait width, reload | No clipped fields, wrong focus or lost existing records; encrypted coach workspace remains current platform |

## Qualification and issue-closure sequence

1. Collect exact-head CI and retained artifacts for P09D; check post-merge main Tests **and** Publish using actual run IDs (especially P07/P08/P09 where independent push evidence was previously unverified).
2. Record each manual outcome as PASS or FAIL with supporting device/environment details. File and fix any real regression before phase closure. Physical Safari cannot be claimed from synthetic Chromium.
3. For P06 and P07 obtain distinct explicit product-owner **phase acceptance**; for P08 reuse the recorded existing acceptance and close only remaining evidence gates; for P09 obtain owner acceptance **after** merged P09D and phase tests.
4. Close #48, #49, #50, #51 as **completed** individually only when their declared gates are met; verify master tracker #41 and issue progress bars update to 100%.
5. Start P10 #52 from accepted `main` with the current encrypted/GitHub Pages platform, keeping real multi-tenant backend #55 and persona switcher #62 deferred until after P10.

### Suggested concise issue comment after testing

```text
Closure manual evidence (date, device/OS/Safari, fictional workspace identifier):
Test IDs and actual results: ...
Defect links or evidence: ...
Main Tests run URL/result: ...
Main Publish run URL/result: ...
Phase acceptance: [P06/P07/P09 explicit owner decision; P08 already accepted 24 Oct].
No live tenant accounts, automatic external credential checks, authenticated organisation roles or backend migration claimed.
```

This worksheet is an **unperformed test plan**, not an approval, a waiver, or a record of successful Safari testing. If any case cannot be performed, record a reason and seek a separate explicit owner risk decision without fabricating a pass.
