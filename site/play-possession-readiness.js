// E5.0: read-only readiness for a possible coach-authored event timeline.
// A shared tactical slot is NOT a person, possession transfer, catch or time.
// There is deliberately no event player, schema write or inferred ordering.
import { inspectPlayGraphCompatibility } from './play-graph-compatibility.js';
import { inspectPlayPhaseContinuity } from './play-movement-link-audit.js';

const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const linked = (m, end) => m?.[end]?.status === 'known-local-slot' &&
  m[end].actorKey.startsWith('player:');
const isMove = (m, kind) => m.representation === 'linked-v1' && m.raw?.t === kind;

// The input may be a play object or exact saved JSON text. All analysis works
// against the existing E4.11 lossless inspection, never on the owner's record.
export function inspectPlayPossessionPrerequisites(input, declarations = []) {
  const graph = inspectPlayGraphCompatibility(input);
  const empty = (code, extra = []) => freeze({
    inspectionVersion: 1, status: 'blocked', issues: [{ code }, ...extra],
    passHandoffs: [], legacyMovements: 0,
    timingVerified: false, possessionVerified: false,
    actorIdentityVerified: false, timedPlaybackAllowed: false,
    events: []
  });
  if (graph.status === 'invalid') return empty('invalid-play-graph',
    graph.issues.map(x => ({ code: x.code, phaseIndex: x.phaseIndex ?? null })));
  if (!Array.isArray(declarations)) return empty('invalid-continuity-input');
  const play = JSON.parse(graph.sourceJson);
  const continuity = inspectPlayPhaseContinuity(play, declarations);
  if (continuity.status === 'invalid') return empty('invalid-phase-continuity',
    continuity.issues.map(x => ({ code: x.code, fromPhase: x.fromPhase ?? null })));

  const phases = graph.phases;
  const movements = phases.flatMap(ph => ph.movements);
  // E4 only guarantees unique movement IDs within a phase. An E5 event ref
  // must be unambiguous across the WHOLE play, so refuse duplicates.
  const seen = new Set(), duplicateIds = new Set();
  for (const move of movements.filter(x => x.representation === 'linked-v1')) {
    if (seen.has(move.moveId)) duplicateIds.add(move.moveId);
    seen.add(move.moveId);
  }
  if (duplicateIds.size) return empty('duplicate-cross-phase-movement-id',
    [...duplicateIds].sort().map(id => ({ code: 'duplicate-move-id', moveId: id })));

  const handoffs = [];
  for (const phase of phases) {
    for (const pass of phase.movements.filter(x => isMove(x, 'pass'))) {
      if (!linked(pass, 'start') || !linked(pass, 'end')) {
        return empty('invalid-explicit-pass');
      }
      const receiverSlot = pass.end.actorKey, candidates = [];
      for (const run of phase.movements.filter(x => isMove(x, 'run') &&
        linked(x, 'start') && x.start.actorKey === receiverSlot)) {
        candidates.push({
          phaseIndex: phase.phaseIndex, moveId: run.moveId,
          startSlot: receiverSlot, basis: 'same-phase-explicit-link'
        });
      }
      // An adjacent phase is never the same actor just because it reuses RM.
      // Only an unambiguous, caller-supplied reviewer declaration can make a
      // *candidate* across that boundary, still without verifying identity.
      const next = phases[phase.phaseIndex + 1];
      const boundary = continuity.boundaries[phase.phaseIndex];
      if (next && boundary && boundary.status !== 'invalid' &&
          boundary.status !== 'ambiguous') {
        const declared = boundary.observations.find(x =>
          x.fromActor === receiverSlot && x.status.startsWith('declared-'));
        if (declared?.toActor?.startsWith('player:')) {
          for (const run of next.movements.filter(x => isMove(x, 'run') &&
            linked(x, 'start') && x.start.actorKey === declared.toActor)) {
            candidates.push({
              phaseIndex: next.phaseIndex, moveId: run.moveId,
              startSlot: declared.toActor, basis: 'declared-adjacent-phase-slot'
            });
          }
        }
      }
      handoffs.push({
        phaseIndex: phase.phaseIndex, passMoveId: pass.moveId,
        passerSlot: pass.start.actorKey, receiverSlot,
        status: candidates.length > 1 ? 'ambiguous-follow-on'
          : candidates.length === 1 ? 'candidate-unsequenced' : 'no-explicit-follow-on',
        candidates
      });
    }
  }
  const legacyMovements = phases.reduce((n, ph) => n + ph.legacyMovements, 0);
  const unresolved = phases.reduce((n, ph) => n +
    ph.movements.filter(m => m.representation !== 'linked-v1').length, 0);
  const issues = [];
  if (!handoffs.length) issues.push({ code: 'no-explicit-passes' });
  if (legacyMovements) issues.push({ code: 'legacy-geometry-unresolved', count: legacyMovements });
  if (unresolved > legacyMovements)
    issues.push({ code: 'unresolved-graph-movements', count: unresolved - legacyMovements });
  for (const h of handoffs) if (h.status !== 'candidate-unsequenced') {
    issues.push({ code: h.status, phaseIndex: h.phaseIndex, moveId: h.passMoveId });
  }
  return freeze({
    inspectionVersion: 1,
    status: issues.length ? 'blocked' : 'structural-candidates-only',
    issues, passHandoffs: handoffs, legacyMovements,
    // Even a structural candidate cannot prove catch, sequence, possession
    // or identity. E5 timed state remains behind the separate approval gate.
    timingVerified: false, possessionVerified: false,
    actorIdentityVerified: false, timedPlaybackAllowed: false,
    events: []
  });
}
