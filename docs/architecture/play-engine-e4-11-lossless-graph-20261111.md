# Play Engine E4.11 | Lossless, read-only graph compatibility projection

Source base: `main` cb39debba449eb977b0fc14ed469edcd9bc3d84d. Framework reference `cf557fb14a90e0f15a6de37d6a5ea002eff04ca3`. Programme: https://github.com/pdomoney/team-manager/issues/166.

## Contract
`inspectPlayGraphCompatibility(playObjectOrExactJsonText)` returns an immutable in-memory projection. The original play remains authoritative, and no write/save/migration is performed. `projectionVersion:1` is a read-only view format, **not** an upgrade to workspace schema 4 or an E5 possession graph.

* Valid explicitly linked `linkVersion:1` moves expose phase-local source/target tactical slots as `known-local-slot`; their deliberately unattached endpoints remain `free-field-point` with the original coordinates.
* Historical movements with no link version remain `legacy-geometry`, `unresolved-legacy`, and carry exact JSON values including unknown attributes. Coordinates or matching names are never used to infer authorship.
* Invalid V1 and unknown future link versions are `unresolved` and include stable audit issue codes; no supported graph edge is invented.
* The projection contains a deep-frozen raw movement snapshot per phase. `sourceJson` preserves the *exact text and UTF-8 bytes* if the caller supplies a source JSON string (including whitespace and escapes). For an in-memory JSON object `sourceJson` is an equivalent JSON serialisation; original file formatting cannot be recovered without the input text. Non-JSON values fail closed rather than losing information.
* Cross-phase actor identity, event sequence, timing and possession remain unverified. No UI component consumes this projection yet.

## Safety and qualification
Existing Oztag Step Out/Step In, legacy `moves[].pts`, eight-slot saved plays, revisions, encrypted workspace, coach/player permissions and Home team selection stay unchanged. No backend, schema edit, sport-specific profile or automatic defender decisions. Validate with exact-head Node, established Chromium and Linux WebKit PR CI, then owner review. Do not confuse branch CI with publication or physical Safari. PR remains unmerged until accepted.
