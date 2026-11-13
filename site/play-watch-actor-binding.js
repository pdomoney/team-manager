// E5.4d.2c: explicit actor-to-field binding for timed Watch frames.
// Never infer identity from names, numbers or matching labels.
import { advanceWatchTiming } from './play-watch-timing-clock.js';

const freeze = value => Object.freeze(value);
export function bindWatchTimedActors(play, phaseIndex, atMs, deltaMs = 0, speed = 1) {
  const frame = advanceWatchTiming(play, atMs, deltaMs, speed);
  if (frame.mode !== 'authored-preview') return freeze({
    mode: 'legacy', reason: frame.reason ?? 'invalid-timeline', renderTimedField: false
  });
  if (!Number.isSafeInteger(phaseIndex) || phaseIndex < 0) return freeze({
    mode: 'legacy', reason: 'invalid-phase', renderTimedField: false
  });
  const slots = new Set();
  const bindings = [];
  for (const actor of frame.actors) {
    const matches = actor.phases.filter(p => p.phaseIndex === phaseIndex);
    if (matches.length !== 1 || !matches[0].slotKey || slots.has(matches[0].slotKey)) {
      return freeze({ mode: 'legacy', reason: 'ambiguous-actor-binding', renderTimedField: false });
    }
    const slotKey = matches[0].slotKey;
    slots.add(slotKey);
    bindings.push(freeze({
      actorId: actor.actorId, slotKey, type: actor.type,
      motion: frame.motion[actor.actorId] ?? 'stationary',
      possession: frame.ball.state === 'held' && frame.ball.actorId === actor.actorId
    }));
  }
  return freeze({
    mode: 'authored-bound', atMs: frame.atMs, durationMs: frame.durationMs,
    done: frame.done, ball: frame.ball,
    bindings: freeze(bindings), renderTimedField: false
  });
}
