# P11D — Exact-fixture guard for source-only Match Day scoring preview

**Baseline:** owner-approved, merged [PR110](https://github.com/pdomoney/team-manager/pull/110) at `be8546228a892f3f3bed8692d38a96cad1954f00`.

The P11C adult Rugby league / League tag event calculator is a transient teaching preview, *not* a competition scorekeeper. P11D adds a fixture-scoped validation layer, preserving all current protections.

## What changes

- An **unlinked fixture** can still display the source calculation example when the team's explicit adult sport/grade/category matches the source pack. It remains an unapproved reference.
- A **competition-linked fixture** must refer to a resolvable entry actually belonging to the selected team, with `entered` status, an explicitly matching competition sport, and matching **fixture/entry season IDs**. An orphan entry, a withdrawn/other-team entry, an absent/mismatched sport, an absent/different season, or contradictory Friendly status disables the preview.
- A specific human-readable reason appears in Match details. No record is modified.
- The **Calculate preview** handler independently rechecks the exact match and competition binding before doing arithmetic, preventing an already-open panel from computing under a changed or stale entry.
- The app continues to reject youth/mismatched grade/category source packs and **never** enables non-Oztag result saving.

## Human verification remains mandatory

`source-score-preview.js` reflects point values from existing historical official law references, **not current 2026 competition by-laws**. Sport + team + season consistency is a technical integrity test; it is **not** verification of the competition format. Actual league approval, an exact official policy/version, age/gender/category verification, and owner acceptance are still required before a future persistent score ledger can be built.

No encrypted coach data, historical results, competition metadata, permissions, Supabase, directory records or match status changes. Test all Node and full Chromium including capacity at the PR head; require owner review before merge and verify `main` Tests/Publish afterwards. Issue #31 remains open.

## Test matrix

Unit tests cover matching fixture, standalone fixture, orphan and withdrawn entries, other team, wrong sport, missing/wrong season, source-policy absence, immutability. Playwright tests on 390px and 1280px verify stale-panel invalidation, explicit user-facing warning and zero data writes.

