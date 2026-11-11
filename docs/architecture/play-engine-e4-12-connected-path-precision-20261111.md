# Play Engine E4.12.1 | Connected-path editing in the precision toolbar

**Source base**: `main` `6c47d7c17b31a8ddc48fb5fa968d0dcf9cf21600`, after owner-accepted #208 (E4.10) and #209 (E4.11). Framework main verified in this chat at `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. Programme: [#166](https://github.com/pdomoney/team-manager/issues/166).

## Defect and tested journey

With a phone-sized browser and **Properties** collapsed, the existing select tool offers Start/End handles, nudge and bends, but not a way to explicitly connect or disconnect those handles. An operator must open Properties, locate the right movement-specific buttons or drag a small handle onto a diagram actor. E4.6–E4.9 already have defensive, run and pass origin/receiver authoring helpers, but they are not available on the compact toolbar. E4.10/11 only report read-only relationships; they do not edit saved plays or prove cross-phase identity.

This change adds one **Start link** or **End link** selector when a coach chooses the relevant endpoint of a **version-1 run, pass or defender shift**. It is available with Properties hidden and within the existing scale-unchanged precision bar. Options are phase-local **diagram slots**, not team player/person identities. Uniquely selectable actors are offered; overlapping targets are excluded. An end-to-start near-zero run is disabled. The selector shows **Phase N only**, plus Attached / Free / Unresolved / Needs repair, and a targeted **Repair link** control for stale-but-explicit endpoint references.

A coach may reattach a linked run's end to a different tactical actor, deliberately leave its endpoint fixed on the field, Undo twice, edit a different phase, restore a stale endpoint and Cancel without changing any saved data. Pass endpoints must identify a passer/receiver and cannot be freely unlinked by this control. Defender shift end remains free field geometry. Bend points, opposite endpoint, movement ID and existing attachments are preserved.

## Source and safety boundaries

- `site/play-connected-path-edit.js`: pure status/preview/apply adapter reusing existing approved E4.6–E4.9 helpers; preview never mutates; fail closed for legacy, unsupported versions, unknown kinds, out-of-bounds geometry, ambiguous/missing actors and invalid link shapes.
- `site/app.js`: compact phase-scoped selector and repair action integrated with **coach-only** events, existing `pedSnap`/Undo and `refreshPlayEditor`. No full-scene renderer or new persistence property.
- `site/styles.css`: constrained mobile selector dimensions; no changes to zoom, actor/line scaling, canvas coordinates or pointer movement.
- Synthetic Node checks and a real Chromium browser suite at 390px and 1280px: connect/free/repair, scope, stale and ambiguous rejection, Undo, phase switching, manual zoom, Cancel and player read-only.
- No schema 4 changes; historical `moves[].pts`, eight-slot/Step In/Step Out, identity and permission boundaries, encrypted workspaces and cross-phase unknown relationships remain untouched. E3 Rugby League/League Tag profiles, E5 possession/timing, E6 defensive decisions and E7 animation are not silently enabled.

## Acceptance & next slice

PR is review-only, **unmerged**, from exact source baseline. Qualify `npm test`, full Chromium, Linux WebKit CI, static build and physical touch/real Safari separately. Browser CI is synthetic and does not establish real mobile touch/pen or published-site acceptance. E4.12.1 makes one concrete precision workflow usable; E4.12's broader touch/pen drag fidelity, cross-phase explicit declarations and final owner device acceptance remain open. The current canvas has Undo but no independently approved Redo capability; this slice **does not add Redo** or relabel that absence.
