// E5.4d.1: deterministic, side-effect-free event playback frame planner.
// No clock, DOM, persistence, or automatic rendering is owned by this module.
import { inspectPlayEventSeek } from './play-event-readonly-seek.js';

const frozen = value => Object.freeze(value);
export function planPlayEventFrame(play, elapsedMs, options = {}) {
  const speed = options.speed ?? 1;
  const startMs = options.startMs ?? 0;
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 ||
      !Number.isSafeInteger(startMs) || startMs < 0 ||
      !Number.isFinite(speed) || speed <= 0 || speed > 4) {
    return frozen({ status: 'blocked', reason: 'invalid-playback-input', playbackEnabled: false });
  }
  const initial = inspectPlayEventSeek(play, 0);
  if (initial.status !== 'ready') return frozen({
    status: 'unavailable', reason: initial.reason ?? 'invalid-authored-events',
    playbackEnabled: false
  });
  const time = Math.min(initial.durationMs, startMs + Math.floor(elapsedMs * speed));
  if (!Number.isSafeInteger(time)) return frozen({
    status: 'blocked', reason: 'playback-time-overflow', playbackEnabled: false
  });
  const time = Math.min(initial.durationMs, projectedTime);
  const snapshot = inspectPlayEventSeek(play, time);
  if (snapshot.status !== 'ready') return frozen({
    status: 'blocked', reason: 'invalid-authored-events', playbackEnabled: false
  });
  return frozen({
    status: 'ready', atMs: time, durationMs: initial.durationMs,
    done: time >= initial.durationMs, ball: snapshot.ball,
    motion: snapshot.motion, actors: snapshot.actors,
    // A frame plan is not a field-animation or release qualification.
    playbackEnabled: false
  });
}
