# Play Engine E4.10 | Read-only cross-phase tactical correspondence

Source base: Team Manager `main` cb39debba449eb977b0fc14ed469edcd9bc3d84d; Walking Comet framework `main` cf557fb14a90e0f15a6de37d6a5ea002eff04ca3.

## Goal
Extend `inspectPlayMovementLinks` with a new opt-in `inspectPlayPhaseContinuity(play, declarations=[])` inspection. It scans the root teaching phase and `play.phases` in order. A repeated key such as `player:LM` is reported as `same-slot-unverified`, never identified as the same physical player or tactical actor. If its coordinate changes, the report flags geometry drift without claiming movement or identity.

Ephemeral reviewer declarations `{fromPhase,toPhase,fromActor,toActor}` can record explicitly asserted correspondence at an adjacent boundary. Same key yields `declared-continued`; different key of same kind yields `declared-changed-slot`. Neither is authoritative identity or match-ready evidence. Missing, cross-type, non-adjacent and conflicting declarations fail closed; malformed V1 links block a reliable boundary conclusion. Reports include valid, phase-local V1 movement references and unsupported/legacy counts.

## Non-goals and preservation
No new persisted property or schema, no role changes, no actor inference from matching labels, coordinates or steps, no phase reordering, no automatic ball/possession/defensive decisions, no approved Rugby League or League Tag formation. Existing Oztag Step In/Step Out and all synthetic schema-4 fixture bytes remain untouched. The new export is read-only and deep-frozen; no editor wiring in this PR.

## Gates
Qualify on exact head: `npm test`, full Chromium and pinned Linux WebKit CI. Physical Safari/owner play-view acceptance and merger remain independent. This does not complete all of E4, nor waive deferred E3 sport approval. Tracking: https://github.com/pdomoney/team-manager/issues/166.
