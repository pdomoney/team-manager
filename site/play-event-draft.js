// E5.3.1: in-memory coach draft editing, deliberately NOT persistence or UI.
// Every edit validates the entire explicit event script; rejected edits are
// atomic and never change the current draft or its Undo/Redo history.
import { evaluatePlayEventTimeline } from './play-event-timeline.js';

const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const valid = draft => evaluatePlayEventTimeline(draft, 0);
const blocked = (history, code) => freeze({
  status: 'blocked', issues: [{ code }], history
});
const snapshot = (past, present, future) => freeze({
  past, present, future, canUndo: past.length > 0, canRedo: future.length > 0
});

// A fresh opt-in draft is not attached to a play and cannot alter legacy data.
export function createTimelineDraft(actors = []) {
  const draft = { version: 1, actors: clone(actors), events: [] };
  const result = valid(draft);
  if (result.status !== 'evaluated') return freeze({
    status: 'blocked', issues: result.issues, history: null
  });
  return freeze({ status: 'ready', issues: [], history: snapshot([], draft, []) });
}

export function editTimelineDraft(history, action) {
  if (!history || !Array.isArray(history.past) || !Array.isArray(history.future) ||
      !history.present || valid(history.present).status !== 'evaluated') {
    return blocked(null, 'invalid-draft-history');
  }
  if (!action || typeof action !== 'object') return blocked(history, 'invalid-edit');
  if (action.type === 'undo') {
    if (!history.past.length) return blocked(history, 'nothing-to-undo');
    return freeze({ status: 'ready', issues: [], history: snapshot(
      history.past.slice(0, -1), history.past[history.past.length - 1],
      [history.present, ...history.future]
    ) });
  }
  if (action.type === 'redo') {
    if (!history.future.length) return blocked(history, 'nothing-to-redo');
    return freeze({ status: 'ready', issues: [], history: snapshot(
      [...history.past, history.present], history.future[0],
      history.future.slice(1)
    ) });
  }
  const next = clone(history.present);
  if (action.type === 'add-event') {
    if (!action.event || typeof action.event !== 'object' || Array.isArray(action.event))
      return blocked(history, 'invalid-edit');
    next.events.push(clone(action.event));
  } else if (action.type === 'update-event') {
    const index = next.events.findIndex(e => e.eventId === action.eventId);
    if (index < 0 || !action.changes || typeof action.changes !== 'object' ||
        Array.isArray(action.changes) || 'eventId' in action.changes)
      return blocked(history, 'invalid-edit');
    next.events[index] = { ...next.events[index], ...clone(action.changes) };
  } else if (action.type === 'remove-event') {
    const index = next.events.findIndex(e => e.eventId === action.eventId);
    if (index < 0) return blocked(history, 'event-not-found');
    next.events.splice(index, 1);
  } else return blocked(history, 'unsupported-edit');
  const checked = valid(next);
  if (checked.status !== 'evaluated') return freeze({
    status: 'blocked', issues: checked.issues, history
  });
  return freeze({ status: 'ready', issues: [], history: snapshot(
    [...history.past, history.present], next, []
  ) });
}
