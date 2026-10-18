# Cross-team Player form — identity, sport positions and jersey records

**Status:** Development candidate only. No merge, deployment or production data changes.
**Starting accepted baseline:** `main` `f5daa73cbd1055f5bbc3c80881098ee71c59a058` (PR #12 merged).
**Branch:** `feature/cross-team-players-jersey-positions-20261018`.

## Problem and intended behaviour

The accepted application stores a player record under each team. Season membership preserves its own number and preferred positions, and a team's jersey history tracks issues, returns, corrections and reminders. This is valid for a single team, but there was no supported, explicit way to recognise that one person may play for more than one team (and often more than one sport).

This candidate adds **optional explicit cross-team identity linking**, without introducing a server, account system, global profile rewrite, wholesale roster migration or automatic name matching.

A person in two teams has:
- **One shared private person reference**, used for coach-side navigation/identification only.
- **One separate player record per team**, retaining local player ID, participation, season membership, statistics, contact detail snapshot, jersey allocation and returns.
- **Team-specific preferred positions**, offered from that team's effective sport or deliberate custom team positions.
- **Team-specific jersey allocation**, issued when a jersey number is assigned, with the accepted return/undo/correction controls when the destination team uses loaned jerseys.
- **No automatic changes** to existing team records, seasons, fixtures, RSVPs, match lineups, passwords or role projections.
- **No shared identity or other-team references** in the public team/player projection.

## New coach workflow

1. On **Team → Squad**, select **From another team** to choose an existing player on another active team. The link screen asks whether to create a new team-local player record or to link an existing record already on the destination team.
2. When creating a new destination record, copy the source name/gender/mobile/photo only once. Do not copy position, jersey number, loan history, injury/availability, notes, historical results or tasks. Open the destination Player form so the coach can assign that team's sport-specific positions and jersey number deliberately.
3. From an existing Player form, use **Other teams → Add to a team** to add that person elsewhere. The form requires pending local edits to be saved first, and does not silently switch the active editing team.
4. Open the linked player on either team to see coach-only other-team membership and the other team's own sport, positions and jersey number. Future edits remain team-local. If the player already exists on the destination team, switch to that team's **From another team → Existing player** workflow to preserve their record history.
5. Mark a loaned jersey returned in the actual owning team's Player card or season jersey report. Returning one team's jersey does not affect other teams' kit.

## Data and migration rules

- Only explicitly linked players gain optional `personId`; existing unlinked records are untouched.
- Generated person links use stable source-team and source-player IDs. They do not use or infer personal identity from name, phone or photographs.
- The accepted per-team player IDs and entire `jerseys`, `jerseyCorrections`, `season.squad`, session, match and lineup models are preserved.
- `M.linkPlayerTeams` validates before changing any record. When linking an **existing target record**, it only sets its `personId`; it does not overwrite the target's historical fields.
- A brand-new destination record begins without positions, a jersey allocation, loan events, attendance or registered status; it is included in the destination team's active season by the existing active-season membership mechanism.
- Archived destination teams and teams without an active season reject new membership changes.
- Separate team files still encrypt independently. The shared person link and kit history never enter player-facing files.
- **Privacy:** The coach may see and optionally copy private contact information to another team. There is no background synchronisation between those copies.

## Acceptance and regression

New deterministic unit tests: cross-team identity, target-specific sport positions, issuing and returning kit without touching source equipment, linking an existing record with historic ID/issue data, no name-based auto-merging, failure atomicity, encrypted public allowlist, rollover preservation and migration idempotency.

New Playwright browser journey: create a Netball team, add a player from another squad, verify its independent jersey and sport positions, mark a target jersey returned and verify the source team issue is unaffected; check manager reports and mobile layout. Existing complete unit and Chromium regression suites must remain green.

## Verified automated qualification — 18 October 2026

- **Implementation commit qualified:** `e6b58a31ad3b94e5b58d7045f29e49c387ac1837`.
- **Pull request:** [PR #13](https://github.com/pdomoney/team-manager/pull/13) — draft, mergeable, not merged.
- **GitHub Actions run:** [39122540536](https://github.com/pdomoney/team-manager/actions/runs/39122540536).
- **Unit tests:** **109/109 passed**, 0 failed.
- **Chromium browser qualification:** **540/540 checks in 15/15 suites passed**; includes the new `cross_team_players` suite **19/19**, existing `live_publishing` checks **31/31** and 30/60/100-photo synthetic capacity **30/30**.
- **Machine-readable artifact:** [browser qualification evidence](https://github.com/pdomoney/team-manager/actions/runs/39122540536/artifacts/12134248648) (`qualification.json`).
- **Test-only publishing fix:** `test/browser/live_publishing.py` now waits for the *initial terminal publish status* after Go Live before asserting mock GitHub files exist. Previously it could race ahead during async encryption and falsely report no files. Production publishing code was not changed.
- These are **synthetic/test-mode** results. They do **not** validate actual iPhone Safari storage limits, production GitHub credentials or real player data handling.
- **Source provenance:** These pass counts apply to the implementation commit above; a subsequent documentation-only commit must pass its own head checks before final PR acceptance.

### Manual acceptance outstanding

- Coach must visually inspect the workflow and confirm the terminology meets their use case.
- iOS/macOS Safari form and photo behaviour, realistic player photos/storage, encrypted backup/restore on an actual device, and authenticated GitHub publishing remain unverified until explicitly tested.
- The coach must deliberately link already-existing player records; similar names must never cause automatic linking.
- Cross-team contacts do **not** update automatically. This is intentional to prevent silent changes on another team.

**Do not merge, publish or deploy without explicit acceptance.**
