// E5.4a: deterministic read-only seek adapter for a future Watch/Learn UI.
// This does not animate, infer positions, or enable timed playback.
import { loadPlayEventDraft } from './play-event-persistence.js';
import { evaluatePlayEventTimeline } from './play-event-timeline.js';

export function inspectPlayEventSeek(play, atMs) {
  const loaded = loadPlayEventDraft(play);
  if (loaded.status !== 'ready') return Object.freeze({
    status: 'unavailable', reason: loaded.status === 'empty' ? 'no-authored-timeline' : loaded.reason,
    timedPlaybackAllowed: false
  });
  const snapshot = evaluatePlayEventTimeline(loaded.history.present, atMs);
  if (snapshot.status !== 'evaluated') return Object.freeze({
    status: 'blocked', issues: snapshot.issues, timedPlaybackAllowed: false
  });
  const events = loaded.history.present.events;
  const durationMs = events.reduce((max, event) => Math.max(max, event.atMs), 0);
  const actors = loaded.history.present.actors.map(a => Object.freeze({
    actorId: a.actorId, type: a.type,
    phases: Object.freeze(a.phases.map(p => Object.freeze({ phaseIndex: p.phaseIndex, slotKey: p.slotKey })))
  }));
  return Object.freeze({
    status: 'ready', atMs, durationMs, ball: snapshot.ball, motion: snapshot.motion,
    actors: Object.freeze(actors), timedPlaybackAllowed: false
  });
}
