// E5.3.3: explicit coach-authored diagram-slot identity mappings.
// This module does not infer identity from labels or persist to saved plays.
import { evaluatePlayEventTimeline } from './play-event-timeline.js';

const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const id = value => typeof value === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(value);
const result = (history, issues = []) => freeze({
  status: issues.length ? 'blocked' : 'ready', issues, history
});

// The coach explicitly identifies a play-local actor and a slot in a phase.
// An actor may have one slot per phase; a slot cannot belong to two actors.
export function mapTimelineActor(history, action) {
  if (!history?.present || !Array.isArray(history.past) ||
      !Array.isArray(history.future) ||
      evaluatePlayEventTimeline(history.present, 0).status !== 'evaluated')
    return result(history, [{ code: 'invalid-draft-history' }]);
  if (!action || !['assign', 'unassign'].includes(action.type) ||
      !id(action.actorId) || !Number.isSafeInteger(action.phaseIndex) ||
      action.phaseIndex < 0 || !id(action.slotKey))
    return result(history, [{ code: 'invalid-actor-mapping-edit' }]);
  const next = clone(history.present);
  let actor = next.actors.find(a => a.actorId === action.actorId);
  if (action.type === 'assign') {
    if (!['attacker', 'defender'].includes(action.actorType))
      return result(history, [{ code: 'invalid-actor-type' }]);
    if (actor && actor.type !== action.actorType)
      return result(history, [{ code: 'actor-type-conflict' }]);
    if (next.actors.some(a => a.actorId !== action.actorId &&
        a.phases.some(p => p.phaseIndex === action.phaseIndex &&
          p.slotKey === action.slotKey)))
      return result(history, [{ code: 'ambiguous-phase-mapping' }]);
    if (!actor) {
      actor = { actorId: action.actorId, type: action.actorType, phases: [] };
      next.actors.push(actor);
    }
    actor.phases = actor.phases.filter(p => p.phaseIndex !== action.phaseIndex);
    actor.phases.push({ phaseIndex: action.phaseIndex, slotKey: action.slotKey });
  } else {
    if (!actor || !actor.phases.some(p => p.phaseIndex === action.phaseIndex &&
        p.slotKey === action.slotKey))
      return result(history, [{ code: 'mapping-not-found' }]);
    actor.phases = actor.phases.filter(p => !(p.phaseIndex === action.phaseIndex &&
      p.slotKey === action.slotKey));
    if (!actor.phases.length) next.actors = next.actors.filter(a => a !== actor);
  }
  const checked = evaluatePlayEventTimeline(next, 0);
  if (checked.status !== 'evaluated') return result(history, checked.issues);
  const updated = freeze({
    past: [...history.past, history.present],
    present: next,
    future: [],
    canUndo: true,
    canRedo: false
  });
  return result(updated);
}
