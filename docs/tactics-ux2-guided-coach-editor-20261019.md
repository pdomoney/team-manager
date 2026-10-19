# Tactics UX2: guided coach teaching editor (dependent development candidate)

**Dependency:** [UX1 player learning PR #17](https://github.com/pdomoney/team-manager/pull/17).
**Branch:** `feat/ux2-guided-coach-play-editor-20261019` (draft; stacked against the UX1 branch, **not** current main).
**Data policy:** Additive, optional `study` array per play/phase; all existing diagram geometry, passes, timings, phase titles, original `steps`, linked libraries and starter-play IDs remain unchanged.

## What changes for coaches

The Edit/New Play sheet now opens in **Teach the play**, with:
- phase selection and an ordered list of teaching actions (instruction title, cue text);
- optional **Highlight position** role choice and **Linked diagram movement** for precise SVG correspondence;
- Create, remove and reorder actions; preview each action on the actual field drawing;
- an explicit **Use existing instructions** conversion, which never silently overwrites authored cues;
- empty-instruction validation before saving, preservation of source drawings and undo snapshots.

**Advanced diagram** remains the previous pointer-driven full editor. **Play details** retains the title, category, written headline, when-to-use, steps and rule associations. Existing advanced drawing controls, data shape and animation engine are not replaced.

`site/play-teaching.js` holds pure non-destructive operations. When a movement is deleted, surviving teaching links are adjusted so an index never silently attaches to a different movement.

The encrypted players' copy allowlists the optional `study` field, and phase data carries its own `study` entries. Old plays without study data still work exactly as before. In the player viewer, only coach-authored links are treated as exact; legacy text remains explicitly unsynchronised.

## Known limitations and subsequent opportunities

- This is a first guided **teaching** builder layered over the existing advanced positional drawing tools, not a full drag-free play creator. Exact movement drawing still uses Advanced diagram.
- One position and one movement may be selected per coaching action in this release; the read model supports richer arrays for later additions.
- The coach preview renders the right-attacking authored source. The main play screen retains live left/right mirroring for acceptance.
- A linked movement does not change play physics or animation timing. Future work may offer explicit play-event sequencing, synchronized scrubbing and templates for other sport geometries.
- Real player information is not required to qualify. No live GitHub data, changes to the encryption format, login architecture or schema migration are included.

## Regression requirements

- `npm test` with dedicated `test/play-teaching.test.js`, player-copy allowlist qualification and the full historic suite.
- `test/browser/coach_teaching.py` in Chromium at 390px and 1280px, including authoring, action preview, incomplete-data rejection, save, mirrored viewing and read-only player projection.
- Existing `test/browser/regress.py` explicitly selects Advanced diagram to preserve the historic editor workflow.
- Full structured browser qualification including synthetic-photo capacity on exact PR head, with evidence retained in GitHub Actions.

**Acceptance:** Review UX1 independently first. Merge UX2 only after UX1 is accepted and merged, update base to `main`, repeat checks, then manually review Safari/touch input and real players' teaching comprehension.
