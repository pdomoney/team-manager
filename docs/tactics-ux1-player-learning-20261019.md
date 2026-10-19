# Tactics UX1: player learning viewer (development candidate)

**Based on:** merged `main` commit `98ad699752b0930f3bb18f53e255abcbec77c40d`
**Stage:** Player-first viewer. Coach editor redesign is a separate, later change.
**Safety:** No migrations; existing `plays`, `phases`, `moves`, player sets, publication, passwords and tactics library are unchanged.

## Changes

- Players open a play in **Learn step by step**, with one coaching instruction at a time, a high-contrast field, Next/Previous controls, and accessible position highlighting. Coach retains **Watch animation** as the default for backwards compatibility and can preview Learn.
- A selected role is visually highlighted, with nearby movement lines emphasised and distracting explanatory diagram labels hidden in Learn only. Coaches can still open the full original diagram in Watch.
- Existing instructions remain authoritative. Legacy prose is not automatically linked to inferred timing. Single-phase plays reveal existing instruction lines; multi-phase plays give one phase-led step unless authors explicitly add cue metadata. This avoids falsely teaching an inaccurate sequence.
- Watch keeps the existing SVG animation and phase changes; adds keyboard-operable timeline scrub and Restart. Pause and Slow retain their behaviour.
- `site/play-study.js` is a pure model supporting future optional per-phase `study` entries (`title`, `text`, explicit `moves`, `roles`), with invalid indices discarded. This release **does not author or publish such entries**. That belongs to the guided editor release.
- `playSVG` renders Learn overlays from existing geometry; saved diagrams and their library versions are never mutated by navigation, mirroring or role focus.

## Boundaries of this release

1. This is a UI and read-only viewer release, **not a new animation/physics engine**. Drawing order is not represented as chronological order.
2. Phase-by-phase timing must not be treated as precisely related to a coaching instruction until the coach assigns it in the future editor.
3. Role focus uses recorded drawing labels, not a private player identity, and does not expose contact details, attendance or notes.
4. Oztag field dimensions, starter play definitions, phase count and existing left-right text mirroring stay intact.
5. No export of animation videos, public share links, coach-side guided builder, or cross-sport pitch replacement in UX1.

## Qualification

- `npm test` (new study helper tests + current suite).
- `python3 test/browser/play_learning.py` covers both 390px and 1280px widths, modes, instruction navigation, focus, mirroring, seek, restart and read-only player preview.
- Entire existing `test/browser/run_all.py` including synthetic-photo capacity on the PR; reviewer examines exact-head Actions results and preserved evidence.
- Manual owner acceptance: iOS Safari and macOS Safari, landscape on phones, VoiceOver narration, review a single- and multi-phase tactical play with real coaches/players, publishing and encrypted player copy on a physical device.

## Coach editor redesign: subsequent PR

After accepting the player learning experience, the coach editor should produce explicit teachable action cues. Retain the existing advanced graphical editor as an option. Introduce a guided sequence builder with: template/sport/setup, player and ball placement, ordered runs/passes/defensive responses, linked cue text and responsible positions, player-view preview, and save to the existing play/library model. Make the structured `study` metadata optional and backward-compatible, include it in the allowlisted players' copy once validated, and test mirrored roles/paths, edited starter preservation, season histories and linked library updates.

**Do not merge or deploy before accepting the exact PR head and regression evidence.**
