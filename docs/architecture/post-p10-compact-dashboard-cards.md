# Compact dashboard card rhythm — post-merge visual refinement

**Evidence:** owner's macOS Safari screenshots from 26 October 2026 show that optional Compact mode works, but 2+ active black Live Competition cards and tall Outstanding actions rows continue to occupy most of Home. They also show Settings → Screen layout with Compact selected and a Comfortable header toggle. The selected *All clubs* scope explains why the current team's heading can coexist with Engadine/Titans actions and competitions.

## Change

Based on verified merged [PR96](https://github.com/pdomoney/team-manager/pull/96), this corrective-style **separate PR** adjusts only wide desktop Home in **Compact** mode:
- Live Competition card: trophy/icon, headings, record tiles, margins, open-competition button and linked fixtures shortened without hiding their labels/data.
- Outstanding actions: preserve urgency, dot colours, action titles and context in a tighter row.
- Spotlight supporting copy and action gap tightened slightly.
- Comfortable mode, Settings dialog, player privacy, mobile 390px layout and unrelated app pages remain unchanged.

No new user setting, browser zoom change, JavaScript, encrypted workspace, GitHub publishing, permission or schema migration is involved. The existing Compact/Comfortable selection continues to work unchanged.

## Validation

`npm test` unchanged existing suite; `npm run test:browser` adds `desktop_density_cards.py` at 1280px and 1660px plus mobile at 390px, measuring actual live card/row sizes in both modes. The test confirms headers, result text and action link attributes are identical, active buttons remain usable, team JSON unchanged, desktop width fits and Comfortable restores original layout. Automated Chromium cannot substitute for product-owner real macOS Safari visual acceptance.

Manual owner test: at Safari Actual Size (100% zoom), with Compact selected, inspect a library containing multiple active competitions, switch between **All clubs**, a single club and a single team, confirm the action list/urgency is still legible and compare the amount of dashboard visible without scrolling. Do not assume two different datasets yield identical screenshots.

Rollback: revert CSS and its test; no data/settings migration.
