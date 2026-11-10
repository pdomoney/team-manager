# Team Manager | Play Engine 2.0 E3.4 local competition rules evidence gate

**Status:** E3.4 SOURCE CANDIDATE for owner review, not a sporting decision or a reviewed formation.  
**Initial product `main`:** `b447b0dec35757171e5e3dbccf592a3e30484a21`, merged/published E3.3 PR #201; initial source checked against GitHub.  
**Framework `main`:** `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3` (accepted guidance reused from this conversation).  
**Programme:** [Issue #166](https://github.com/pdomoney/team-manager/issues/166); the final sporting approval gate is still OPEN.

## Context and reason for the change

Existing E3.1 profile contract validates a proposed *shape*, and E3.2/E3.3 expose official rules references and copyable coach review. Neither identifies the exact local junior competition, grade, rules edition, official regional variation, nor an approved layout. The owner has instructed us to continue E3.4, but has not named an exact target grade/competition, sport reviewer, source edition or approved formation coordinates. The safe next step is a **read-only evidence intake and readiness gate**, not a manufactured 13-player or junior formation.

Official sources confirmed 10 November 2026:

- [Play Rugby League, Junior League Laws (6–12)](https://www.playrugbyleague.com/laws-of-the-game-community/junior-league-laws-6-12s/): national Player Development Framework, age-specific laws, and explicit advice to check local leagues for Under 9–12 regional format.
- [Play Rugby League, International 13+ Laws](https://www.playrugbyleague.com/laws-of-the-game-community/international-13splus-laws/): age 13+ format, not a substitute for junior modified or 13–15 Safeplay obligations.
- [Play Rugby League, Other Laws](https://www.playrugbyleague.com/laws-of-the-game-community/other-laws-of-the-game/): League Tag distinct from 9- and 11-a-side, local grade/format still needs review.
- [NSWRL Club Hub Laws of the Game](https://clubhub.nswrl.com.au/support/solutions/articles/51000452816-laws-of-the-game): category and National Safeplay context.
- [Australian Oztag Rules](https://www.oztag.com.au/resources/rules): original eight-slot canvas remains an illustrative arrangement.

These are source **entry points**, not an endorsement, a verified competition-specific amendment or accepted formation. No governing-body branding/assets included.

## This bounded source change

- `site/play-format-evidence.js` implements `assessE34RulesEvidence(review, input)` and `e34EvidenceBrief(review, assessment)`, with `E34_EVIDENCE_VERSION=1`. It compares source reference, actual working team sport, required competition/grade/season, named edition and public HTTPS local evidence URL. Supplied text is sanitized and bounded. It strips source-link query and fragment content to prevent copying token-like parameters, and refuses loopback/private/non-HTTPS/credential URLs. It never fetches arbitrary coach-provided URLs.
- `site/app.js` extends the existing **coach-only** Review sport format flow. Three temporary fields collect the proposed edition, a local league rules source and a format/field review question. The result shows six approval/readiness checks with explicit "Input supplied" versus "Not approved" labels; even six fields of user-entered claims never assert sporting acceptance. The copy button is deliberate; nothing is persisted, pushed or sent automatically.
- `test/play-format-evidence.test.js` protects positive/negative evidence shape, source mismatch, missing local scope, junior and League Tag under-specification, dangerous URLs, copied brief sanitisation and unchanged E0/schema-4 source.
- `test/browser/play_e3_format_review.py` now exercises local source input, URL query stripping, six checkpoint display, no saved-play mutation, reopening a blank review and rejection of unsafe local URL; existing coach/player journey remains.
- No new database, migration, role/permission, match lineup or registered athlete identity. Step In/Step Out IDs, original Oztag 50×80 abstract canvas, library, Coach Teach/Advanced, B6 Snap/Quick Look, player Learn/Watch remain unmodified.

## E3.4 checkpoint accounting

The explicit six checkpoints are **readiness steps, not six equivalent units of engineering or sporting effort**:

1. Official governing reference selected with exact sport: automated source classification.
2. Local competition, grade and season supplied: user-entered review scope.
3. Edition and public local source supplied: **candidate evidence**, not verified content.
4. Independent sport/competition authority verifies local rules applicability.
5. Independent sporting reviewer approves player count, physical field convention, full attacking/defensive actor roles and coordinates, marker roles and permitted/limited action descriptions for **that** format.
6. Product owner accepts the versioned teaching profile, compatibility plan and sporting evidence. Match readiness remains separately restricted by roster and match-day policy.

Items 1–3 can be demonstrated in synthetic tests; 4–6 require genuinely external review/owner decision. All stage flags 4–6 are hard-coded **false**, even for fully populated client-side payloads. `matchReady`, `canEnableProfile` and `canAssignRoster` are always false.

## Delivery stage and progress percentages (denominators explicit)

For Issue #166 track six E3 subphases, each treated as one milestone for a simple **milestone-count** estimate, not time/effort:

| Subphase | Accepted/merged | In review | Domain or UX approval outstanding |
| --- | --- | --- | --- |
| E3.1 structural profile validator | 100% |  |  |
| E3.2 governing references | 100% |  |  |
| E3.3 coach format review | 100% |  |  |
| E3.4 local rules / actual approved formation | 0% accepted until additional approval; source evidence proposed | Evidence intake + fail-closed tests in this PR | Exact local format, independent rule and formation review, owner acceptance |
| E3.5 selected real profile editor integration | 0% |  | Requires E3.4 real accepted profile |
| E3.6 compatibility + sporting/visual device acceptance | 0% |  | Requires E3.5 + owner/device acceptance |

Merged/accepted **E3: 3 of 6 milestones = 50%**. This is not a claim that half of code complexity or sporting readiness has been delivered. E3.4's evidence intake can be separately counted as **3 of 6 evidence gates supplied in a complete synthetic packet (50% prepared, 0% sporting/owner-approved)** after tests pass. Do not silently mark 4–6 completed when the user submits a URL or a name. In PR review, report accepted-main and PR-source progress separately; after merge, update the subphase tracking without reweighting history.

## Qualification and next owner action

At the exact PR head require Node `npm test`, full Chromium Playwright and Linux WebKit CI. Report real commands/run URLs, not unexecuted scripts. PR remains unmerged; GitHub Pages source deployment, physical Safari, web-visible asset parity and sporting decisions **not** proven. Owner still needs to specify **one** exact league/competition, grade, season, governing rules edition and reviewer plus the actual formations. Source-only candidate can be merged independently of the sporting gate, but E3.4 must not be marked *accepted formation*.
