# P07A — Fixture source and authority contract

P07 begins from PR77 accepted `main`, operating exclusively within the existing GitHub Pages application and encrypted coach workspace. It does **not** connect a live governing-body feed, assign legal/administrative authority to a coach's own record, or share personal data between independently owned clubs.

## Source-of-truth distinctions

- **Local coach match**: the fixture date, opponent, venue, result and crew assignment remain owned by that team's local workspace record. This is the only source the current application can substantiate.
- **Competition or tournament entry**: an explicit existing `entryId` connects a match to an entry. It provides *context*, not independent proof that the organiser issued or updated the fixture.
- **Unlinked or friendly**: a local game without a valid entry stays local. No automatic relinking based on event date, name, competition, season or another team's match.
- **External organiser authority**: no independent credential/fixture verification is available now. The application must not display a coach-entered fixture as **official**, **verified**, **synchronised** or guaranteed up to date.

The P07A `fixtureAuthority` model reports a fixed `recordAuthority: local-coach-workspace`, `sourceVerification: not-independently-verified`, `officialFixture: false`. This is intentionally non-overridable at present.

## Validation and retained historical semantics

1. A competition entry belongs to a specific team, not merely to an event. A match attached to another team's entry is flagged; the association's club/team boundary is not inferred from calendar proximity.
2. An unknown entry ID, withdrawn entry, conflicting sport, missing season or inconsistent friendly label is flagged for coach review, without changing or deleting any records.
3. Cancelled matches remain recorded as historic entries.
4. The source projection is immutable/read-only, omits player, guardian, volunteer and credential details, and can be aggregated only over the clubs already in the encrypted workspace.
5. Existing matches, `entryId`, results, season/competition metadata, tasks, RSVP links and event dates are not changed by this PR. No schema migration or rollback is needed beyond reverting this added pure module.

## Scope and follow-on PRs

- **P07A** (this PR): fixture authority/provenance contract and synthetic negative-case tests.
- **P07B**: read-only calendar projection for matches, training, local club events, duties with timezone context and privacy-safe scope.
- **P07C**: explicit recorded changes (postponement/cancellation/date/venue), preserving historical links and user confirmation.
- **P07D**: complex competition/club/multi-team scheduling negative cases, Safari/mobile and owner final acceptance.

These are planned *delivery checkpoints*, not actual official fixture feeds. A future authenticated organiser service would require post-P10 backend authorisation and independent owner approval. This PR does not complete P07 by itself.
