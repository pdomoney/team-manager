# L1 synthetic player-facing E5 timed-play projection

**Source-only compatibility change; not cloud account security or a production release.**

## Verified starting behaviour

At Team Manager `main` `dd81361b64bf43cf240504a307580976cce50ddd`, `site/play-event-persistence.js` stores a coach's opt-in E5 `eventTimeline` inside a play, while `site/vault.js:teamView` publishes the play diagram, phases and study cues without including that timeline. The current encrypted team file therefore cannot reproduce the coach's exact saved event timing. The existing player projection is still protected by a **shared team password**, not individual identity or server-based player access.

## Scope in this PR

- `site/play-event-persistence.js:publishedPlayEventTimeline` reads only a *valid*, diagram-compatible E5 version-1 event timeline and extracts the declared play-local actor mappings and event IDs, explicit milliseconds, sequence and movement/receiver links.
- `site/vault.js:teamView` includes that restricted `eventTimeline` in the **existing player-facing encrypted team copy**. Other projection fields and the Coach source are unchanged. No schema bump or rewriting of saved coach plays.
- Extra/private event or actor fields are stripped, not forwarded. Invalid, stale or unsupported timelines are omitted from the player projection while preserving the current legacy diagram; their original coach records are never edited.
- Negative tests ensure unknown event/actor metadata, Coach drafts, personal/contact/medical fields, stale source-slot mappings, unsupported versions and incompatible event transitions never widen the player copy.
- Positive tests cover lossless transfer of *declared* E5 event timing into an encrypted team file and roundtrip, legacy play parity, unchanged phases/diagram/study and no coach-source mutation.

## Preserve existing UX and security boundary

This does not add personal logins, per-play draft/publish controls, team/club revocation or server-side RLS. **Today the existing Coach Publish action shares the team's currently saved plays with everyone who has that team's password**; it cannot separate a coach's individually unpublished tactical drafts. The requested future live-user workflow must introduce explicit published-play revisions with server-enforced exact-team read/write permissions under [#252](https://github.com/pdomoney/team-manager/issues/252) and [#55](https://github.com/pdomoney/team-manager/issues/55). Do not use this fix to announce real Player or Volunteer accounts.

All play editor/animation controls, E5 timing source, Phase/Undo/Redo, sport compatibility, navigation, coach password model, volunteer tasks, historic encrypted data and GitHub deployment configuration remain unchanged. Never publish actual juniors' or health information for tests.

## Qualification

- [ ] Exact PR-head Node tests, Chromium and WebKit PASS
- [ ] Owner confirms synthetic Coach play timings and Player Watch/Learn on an actual iPhone Safari, **without real people**
- [ ] Owner reviews that the additional E5 timeline is intended to be shared to a team when using the existing global Publish workflow
- [ ] Owner merges; then verify exact-main Tests and Pages separately

**Go-live gates:** still **L0–L6 0/7** and **Player/Volunteer/Plays 0/8** until real backend, permissions and physical device evidence exist. This is an improvement to the legacy delivery projection, not a qualification of those gates.
