// E5.3.4: optional play-local timeline, kept inside the existing encrypted
// workspace play record. No schema bump, inferred actor identity or playback.
import { createTimelineDraft } from './play-event-draft.js';
import { evaluatePlayEventTimeline } from './play-event-timeline.js';
import { diagramMappingChoices } from './play-event-diagram-choices.js';

const clone = x => JSON.parse(JSON.stringify(x));
const valid = timeline => evaluatePlayEventTimeline(timeline, 0).status === 'evaluated';
const compatible = (timeline, play) => {
  const choices = diagramMappingChoices(play);
  return timeline.actors.every(a => a.phases.every(p =>
    choices.some(c => c.phaseIndex === p.phaseIndex && c.slots.includes(p.slotKey))));
};

// Load only validated saved timelines. Never silently replace malformed
// pre-existing data with an empty draft.
export function loadPlayEventDraft(play) {
  if (!play || !Object.hasOwn(play, 'eventTimeline'))
    return { status: 'empty', history: createTimelineDraft().history };
  const timeline = play.eventTimeline;
  if (!valid(timeline) || !compatible(timeline, play))
    return { status: 'blocked', reason: 'invalid-saved-timeline', history: null };
  return { status: 'ready', history: Object.freeze({
    past: [], present: clone(timeline), future: [], canUndo: false, canRedo: false
  }) };
}

// Validate before any mutation. A fresh untouched empty draft never adds a
// timeline field to a legacy play; existing data is never removed implicitly.
export function preparePlayTimelineSave(play, history, { changed = false } = {}) {
  if (!play || typeof play !== 'object' || !history?.present ||
      !Array.isArray(history.past) || !Array.isArray(history.future))
    return { status: 'blocked', reason: 'invalid-timeline-history' };
  if (!changed) {
    if (Object.hasOwn(play, 'eventTimeline') &&
        (!valid(play.eventTimeline) || !compatible(play.eventTimeline, play)))
      return { status: 'blocked', reason: 'invalid-or-stale-timeline' };
    return { status: 'unchanged', play };
  }
  // An invalid existing timeline must never be replaced by a newly edited draft.
  // Preserve the original record for explicit recovery from a known-good copy.
  if (Object.hasOwn(play, 'eventTimeline') &&
      (!valid(play.eventTimeline) || !compatible(play.eventTimeline, play)))
    return { status: 'blocked', reason: 'invalid-or-stale-timeline' };
  if (!valid(history.present) || !compatible(history.present, play))
    return { status: 'blocked', reason: 'invalid-or-stale-timeline' };
  const next = clone(play);
  next.eventTimeline = clone(history.present);
  return { status: 'ready', play: next };
}


// A player-facing encrypted team file needs the coach's authored E5 event
// timing to reproduce Watch/Learn. This is a *data projection*, not permission
// enforcement or a decision that a play is approved for publication.
// Retain only explicitly defined play-local event fields: future/custom fields,
// person records, arbitrary coach annotations and draft history must not leak.
// Unsupported or stale timelines stay in the coach's source unchanged.
export function publishedPlayEventTimeline(play) {
  if (!play || !Object.hasOwn(play, 'eventTimeline') ||
      !valid(play.eventTimeline) || !compatible(play.eventTimeline, play)) return null;
  const timeline = play.eventTimeline;
  const actors = timeline.actors.map(a => ({
    actorId: a.actorId, type: a.type,
    phases: a.phases.map(p => ({ phaseIndex: p.phaseIndex, slotKey: p.slotKey }))
  }));
  const events = timeline.events.map(e => ({
    eventId: e.eventId, atMs: e.atMs, sequence: e.sequence,
    kind: e.kind, actorId: e.actorId,
    ...(e.movementId !== undefined ? { movementId: e.movementId } : {}),
    ...(e.receiverId !== undefined ? { receiverId: e.receiverId } : {})
  }));
  const out = { version: 1, actors, events };
  return valid(out) ? out : null;
}
