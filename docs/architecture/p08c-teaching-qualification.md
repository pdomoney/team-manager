# P08C — Sport-aware play teaching and compatibility qualification

**Baseline:** PR84 merge `890304949c60cedfcb63dffd2b69a4c2b03d8adc` on `main`. Delivery of the final P08 implementation milestone, separate from mandatory phase-level user acceptance.

## Purpose and existing behaviour

Team Manager already has native Oztag eight-slot teaching graphics, a coaching-only concept translation guide and configurable label lists. The graphics are **not** validated formations for Touch football, League tag, Rugby league, Rugby union, Rugby sevens, Netball or other codes. Cross-code plays must not silently be endorsed as rule-compliant or as appropriate staffing/lineup/scoring guidance.

P08A has a rule-pack source contract. P08B adds local coach-library origin/review metadata. P08C builds a **read-only** presentation/teaching qualification contract using the actual team sport and the play's declared sport.

## Additions and preservation

- `playTeachingCompatibility(play, team, club)`: deterministic metadata-only status: `sport-matched`, `unconfirmed-play-sport`, `cross-sport-review`, `unknown-team-sport`. Derives the team sport and any conflicting selected rules from P08A.
- Native Oztag built-in starter plays remain Oztag even if early records were not sport-tagged. Legacy **custom** plays without a declared sport stay visible and require coach review; do **not** infer their sport from their eight-slot drawing.
- Any non-Oztag display remains an **eight-slot concept canvas**, not a complete, approved formation. On the Plays listing and play detail screen, a short advisory distinguishes this from Oztag playback. Read-only player preview also sees the context notice.
- Before a coach manually shares a play with unknown source or rule mismatch, the app requests confirmation. Team-specific non-Oztag plays remain shareable using the existing coach workflow; the concept-only warning remains visible during review. No automatic multi-team content distribution or changes to player encryption.
- The adaptation guide refuses an unsupported or absent original sport instead of treating it as Oztag. Selection is mandatory when an older custom play has no known source; the original coaching text, diagrams, labels, authored teaching cues and private adaptation notes remain unmodified.
- No new official rulebook, new scoring algorithm, validated player eligibility, match-staff minimum, licensed club content or universal formation renderer is introduced.

## Domain and source semantics

A coach-entered `play.sport` means the play was recorded for that sport; it does **not** certify rules compliance. Explicit `originSport` remains a coach-authored adaptation hint. Even a same-sport play can require by-law review. No backend verified organisation membership, inter-club sharing or real-time match feeds are claimed on GitHub Pages.

## Test/acceptance requirements

- Node `test/p08c-play-compatibility.test.js`: all known sports, Oztag built-ins, historical custom content, cross-code and unknown-team cases, mismatched rules, person-data exclusion, deterministic no mutation, explicit valid adaptation origin.
- Chromium `test/browser/p08c_teaching.py`: mobile 390px and desktop 1280px, native starter, Touch concept, old custom untagged, player preview, adaptation selection and unsanitised-context checks. The full existing rules, tactics, library copy, version, sharing, study, gameplay and export regressions must remain green.
- Product owner must validate actual iPhone/macOS Safari coach, manager and player journeys and demonstrate no incorrect formations or laws for Oztag, Touch, League tag and Rugby league. Include diverse grades/competition overrides and historical library entries.
- Record exact-head Node, Chromium and retained artifact before merge. Confirm post-merge `main` Tests/Publish separately. **P08 phase acceptance requires explicit owner confirmation**, not just PR merge.

## Rollback

Revert the P08C PR to the PR84 main baseline `890304949c60cedfcb63dffd2b69a4c2b03d8adc`. The changes are presentation/validation only: no data migrations, no new persistent keys or destructive edits, no changes to historical plays. Rollback removes new guardrails for ambiguous cross-sport teaching so advise owners accordingly.
