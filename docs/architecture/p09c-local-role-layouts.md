# P09C — Trusted local organisational layout previews and coach navigation

**Phase:** [P09 #51](https://github.com/pdomoney/team-manager/issues/51) · **Parent:** [P09B PR87](https://github.com/pdomoney/team-manager/pull/87) merged baseline `18056c9d6785d2d8a1843c6cc3121f301d211ddd`.

## Purpose and explicit safety boundary

The existing encrypted coach workspace contains several clubs and teams, but it does **not** have distinct owner, association administrator, club administrator, manager, guardian or other tenant accounts. Provide **design concepts** of how those roles might eventually navigate without changing access controls now. No header persona switcher (deferred issue #62 after P10); no fake organisation membership, role grants, invitation, credential, portal or publishing.

## Scope

- Add a **Preview role layouts** button to the existing coach-only *Clubs and teams* page. It opens a short modal labelled **DESIGN PREVIEW ONLY — not a signed-in role**.
- Four purely conceptual layouts: association overview (all managed local clubs), club admin (one selected local club), manager/coach (existing local managed teams), and individual (one team identity; can open the **existing restricted player-view preview**).
- Every view disclaims authority and access. Association grouping is a **workspace view**, not evidence of registered affiliation or verified governance. All previews use only the **already-unlocked coach workspace**.
- Teams in the preview can be opened by the **existing coach team switcher**, preserving Home navigation, actual club logos/colours, team sport and context. This never grants access to anyone else.
- `site/p09-org-preview.js` allowlists `id, name, shortName, sport` from clubs and `id, name, clubId, sport, division` from active teams. Does **not** project player rosters, phone/email, WWCC, health/medical, volunteer accreditation, family/guardian relationships, team passwords, encryption keys or other sensitive records. Archived teams excluded. Output labels are escaped before rendering.
- Modal mode/club selection is ephemeral app state only. No `save()`, storage write, publication, backend request or data model/schema migration.

## Test and acceptance

1. **Node:** complete unknown mode rejection, deterministic club/team selection, archived exclusion, no sensitive fields projected, no impersonation/association claim.
2. **Chromium:** 390px/1280px synthetic 6-team local test library, modal semantics, four selected roles, single-club filter, no private marker leak, open real coach team context/Home, only one individual team, actual published player-view preview and return, no horizontal overflow. Full historical Node and browser suite remains mandatory.
3. **Manual Safari:** iPhone/macOS: reachable option buttons, 44px targets, reading order/contrast, modal focus/close, team/logo/colours and sport, wrong-club preview isolation, restricted team preview privacy, no account/permission claims.
4. **Negative cases:** no managed club; club with no active team; archived/invalid team ID; unknown concept; user with player-only access must not see or trigger preview actions.

## Existing functionality and rollback

Unchanged: encrypted storage/publishing and client locks, stored club/player/season/jersey data, identity linking, official sport rules, match-day staffing, read-only season review, coach/participant access, and GitHub Pages hosting. Revert this PR alone to accepted P09B merge `18056c9d`; no schema or security migration needed.

## Phase sequencing

- **P09C** — this reviewed/qualified standalone PR.
- **P09D** — final bounded controller/form compatibility and comprehensive privacy/accessibility regression, with physical Safari manual worksheet.
- P09's explicit product-owner phase approval, main publishing CI evidence and issue closure remain separate. Never equate a local visual simulation with protected multi-user organisational access; real backend authorisation is tracked after P10 in [#55](https://github.com/pdomoney/team-manager/issues/55).
