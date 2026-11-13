import { inspectWatchTimedFrame } from './play-watch-timed-frame.js';

// Pure clock transition: the DOM, requestAnimationFrame and legacy Watch remain separate.
export function advanceWatchTiming(play, atMs, deltaMs, speed = 1) {
  if (!Number.isSafeInteger(atMs) || atMs < 0 ||
      !Number.isSafeInteger(deltaMs) || deltaMs < 0 ||
      !Number.isFinite(speed) || speed <= 0 || speed > 4) {
    return Object.freeze({ mode: 'legacy', reason: 'invalid-clock-input' });
  }
  const frame = inspectWatchTimedFrame(play, deltaMs, { startMs: atMs, speed });
  if (frame.mode !== 'authored-preview') return frame;
  return Object.freeze({ ...frame, playing: !frame.done });
}
