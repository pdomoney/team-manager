# P11F — Collect organiser answers as a draft-only evidence packet

Issue: https://github.com/pdomoney/team-manager/issues/31
Base: owner-merged PR112 at `3ab6a81dc4b90b7e7a72b5989bd87c912844a8d8`.

## Background

PR108–112 established sport-safe Match Day boundaries, a source-backed **non-persistent** scoring demonstration, fixture integrity checks and a coach-initiated rules confirmation request. This PR adds **structured human response capture** so the next milestone can be reviewed against actual organiser documents. It does not validate the document's accuracy or confer approval.

## Operator experience

1. In **Match details**, open **Sport and competition rules · Review required**.
2. Choose **Record organiser response (draft)**.
3. Record a source URL, rule edition, effective date, scoring events, field/bench/substitutions, game periods, local by-laws and organiser decision reference.
4. Choose **Copy unverified evidence draft**. Partial entries are permitted, but missing fields are visibly identified in the copied draft. Invalid/unsafe URLs and invalid calendar dates block copying. The owner must verify original documents out-of-band.
5. Copy the draft to an authorised PR or research workflow for review. Nothing is automatically sent, stored, published, approved or applied to scoring.

Only exact sport/competition/season/age/category and reference data from the current match are included. **Player names, player contact information, credentials, coach/medical notes and internal IDs are not included**. User-authored evidence text is quoted and clearly tagged **unverified** rather than trusted instructions.

If the selected team, scope, season or competition changes between opening the form and copying, the copy is blocked; the user must reopen the form. Closing the sheet discards its draft. That is an intentional non-persistence guarantee; a future versioned evidence store would need a separate approved design.

## Safety and acceptance

- No score saves, role grants, server writes, GitHub repository edits, rule approvals or storage schema migrations.
- All non-Oztag sport scoring controls remain blocked. The existing Oztag workflow remains unchanged.
- Node tests cover partial drafts, unsafe URLs, impossible dates, adversarial text, no leakage or state mutation.
- Browser at 390px/820px/1280px exercises coach-initiated copy, input validation, privacy, stale-scope refusal and no horizontal overflow.
- Require exact-head full Node and Chromium CI, user approval before merge, post-merge Tests/Publish and real Safari follow-up.

M2 remains OPEN until authoritative exact competition rules and owner-approved decisions exist; no percentage increase is claimed.

