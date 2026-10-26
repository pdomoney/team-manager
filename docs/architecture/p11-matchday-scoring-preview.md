# P11C — Source-gated scoring breakdown preview (not a match result)

Project: [Issue #31](https://github.com/pdomoney/team-manager/issues/31). Base: owner-merged [PR109](https://github.com/pdomoney/team-manager/pull/109) at `857b0a56e72459d05f3df5a768951d257eeb2f1d`.

## Verified external references and scope (26 October 2026)

The NRL [official junior community laws](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/) expressly require checking U9–12 competition formats with the local league; [support guidance](https://support.playrugbyleague.com/support/solutions/articles/51000424806-laws-of-the-game-codes-policies) says some rules differ between states and associations. Accordingly, **all junior scoring previews are disabled**.

The app already bundles these two historical official references, separately dated and subject to local competition variations:

- **International Rugby league** (selected explicit `league/men` or `league/women` only), [2023 International Laws](https://www.playrugbyleague.com/media/14513/nrl-international-rules-book-2023_web-version-1.pdf), Section 6: try 4, conversion 2, penalty goal 2, field goal 1, 2-point field goal outside 40 m. Each event is its own counter; unlike the old Oztag +1 try counter, total points can never be represented as an undifferentiated number of tries.
- **League tag ages 15+** (selected explicit `league-tag/15` only), [2018 League Tag Laws](https://www.playrugbyleague.com/media/16327/league-tag-laws-of-the-game-2018-1.pdf), Section 5: try 4, conversion 2, penalty goal 2 and drop goal 1, no borrowed Rugby league two-point field goal.
- These are **reference point values**, not definitive authorisation for any named 2026 competition, age, gender/category or season. The source editions are not the same as an independently approved competition policy. No source copying or publication is introduced.

## Implementation

- A pure calculator `site/source-score-preview.js` uses **only explicit, matching rule-pack selections**, the exact recognised sport, and the bundled host/edition URL. It never infers a default from a club, generic sport or new coach account.
- For the two restricted supported adult grade combinations, Match details provides a collapsed **Score breakdown preview · Not saved**. Enter event counts for *Us* and *Them*, then calculate a points **preview**. Separate events cannot silently carry scores into any match field.
- Every click validates that this is still the same open match and selected source policy. Counts must be whole numbers 0–99, so negative/decimal/exponential/pasted invalid values fail closed. On closing/reopening, preview values reset.
- There is no submit/save action, no result mutation, no score state machine transition, no event history, no player statistics, no model change and no shared workspace persistence.
- Existing Oztag match editor and all its tests are unaffected. Unsupported codes, all 6–12 junior Rugby league, all junior League tag, and unverified sports remain unable to use the simulator or any non-Oztag score editor.

## Deferred work

- **Milestone M2:** Independently review exact competition by-laws, effective dates, source editions, age/category, rights and owner approval. The old bundled 2023/2018 sources do not prove 2026 applicability.
- **Milestone M3:** Only after M2, create versioned point-event ledger and deterministic result migration/rollback, controlled score submission and validation. The simulator is not a shortcut around those requirements.
- **Milestone M4:** Distinct sport, age and gender/category-specific on-field lineups, bench, interchange and match periods with documented sources.
- **Milestone M5:** Chromium and real iPhone Safari acceptance, historical record tests and release.

Node tests cover point maths, source gating, event isolation, malformed counts, immutability. Playwright tests at 390px and 1280px cover user interactions, data non-mutation, reset and unsupported sports. No competition is automatically certified.

