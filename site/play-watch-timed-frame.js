// E5.4d.2a: opt-in Watch timing adapter. Legacy Watch remains authoritative
// until the renderer is separately qualified. No clocks, DOM or saved-play writes.
import { planPlayEventFrame } from './play-event-frame-plan.js';

export function inspectWatchTimedFrame(play, elapsedMs, options = {}) {
  const frame = planPlayEventFrame(play, elapsedMs, options);
  if (frame.status !== 'ready') return Object.freeze({
    mode: 'legacy', reason: frame.reason ?? 'authored-timeline-unavailable',
    renderTimedField: false
  });
  return Object.freeze({
    mode: 'authored-preview', atMs: frame.atMs, durationMs: frame.durationMs,
    done: frame.done, ball: frame.ball, motion: frame.motion,
    actors: frame.actors, renderTimedField: false
  });
}
