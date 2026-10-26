# P11E — Coach-generated competition rule confirmation checklist

Issue: https://github.com/pdomoney/team-manager/issues/31
Base: owner-merged [PR111](https://github.com/pdomoney/team-manager/pull/111), `c4a4db56cd677775c10eedffb43020a214a77589`.

## Purpose

Move Match Day from a general "review required" banner to an **actionable, bounded request for current competition rules**. The previous PRs implement source-reference display and a non-persistent scoring calculator; they intentionally do not authorise a competition's scoring, field positions, interchange limits or match periods.

Current bundled reference editions in `site/rules.js` are background only. A locally nominated 2026 competition can specify variations by league/association, grade, age group, category or season. The coach or organiser still needs an exact official policy, its effective dates, by-laws and a traceable human decision, followed by product-owner approval before Team Manager implements or enables any permanent match scoring.

## Implemented

- `site/match-rules-confirmation.js`: immutable review of a specific Match details context using the existing `matchFormatSourceReview`, linked competition/entry/team/season metadata and **5 required rule-confirmation questions**.
- The coach expands **Sport and competition rules · Review required** and sees either specific missing/mismatched fields or a statement that the recorded fixture details appear consistent **but approval remains outstanding**.
- A clearly labelled **Copy rules confirmation checklist** button makes a coach-initiated clipboard copy. It includes current sport, competition, season, age group, category, selected rule pack, bundled reference/URL where applicable and a request for authoritative scoring, lineup/bench/interchange, periods and organiser sign-off. It never auto-sends email or WhatsApp.
- Clicking recomputes review data from the **currently selected team and fixture**. A stale open panel cannot silently copy outdated sport details.
- **Privacy:** player names, medical/coaching notes, emails, phones, team credentials, private roles, raw IDs and date-of-birth data are not put into the clipboard request. Coach-entered public competition labels are included, and copying is a user-initiated interaction.
- Does **not** change persisted workspace data, score records, fixtures, match status, role permissions, sport policy approval or publish files. A copy is not a compliance certification.

## Tests and acceptance

- Node: bounded string normalisation, exact entry/team/season check, reference absence, cross-sport mismatch, no-copy of private notes and immutability.
- Chromium at 390px, 820px and 1280px: expanding the review, copying a bounded text request, no private player data, no data mutation, recomputing on team changes and orphaned competition warnings.
- Qualify exact-head Node + full Chromium including capacity; then owner review, merge and post-merge main Tests/Publish. Physical iPhone Safari must be owner-reviewed separately.
- Leave Issue #31 milestone M2 open: real organiser evidence and owner-approved, versioned competition rules have **not** yet been supplied. Do not enable multi-sport result saves based on this request alone.

