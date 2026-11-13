// E5.4d.2c: validated read-only projection from authored actors to field slots.
// Does not animate inferred trajectories or change the legacy Watch renderer.
import { bindWatchTimedActors } from './play-watch-actor-binding.js';

const blocked = reason => Object.freeze({ mode: 'legacy', reason, renderTimedField: false });
export function projectWatchField(play, phaseIndex, atMs, fieldPlayers, options = {}) {
  const frame = bindWatchTimedActors(play, phaseIndex, atMs);
  if (frame.mode !== 'authored-bound') return blocked(frame.reason ?? 'unavailable');
  if (!fieldPlayers || typeof fieldPlayers !== 'object' || Array.isArray(fieldPlayers)) return blocked('invalid-field');
  const positions = [];
  for (const actor of frame.bindings) {
    if (!Object.hasOwn(fieldPlayers, actor.slotKey)) return blocked('missing-field-slot');
    const pt = fieldPlayers[actor.slotKey];
    if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(n => Number.isFinite(n) && n >= 0 && n <= 80))
      return blocked('invalid-field-point');
    positions.push(Object.freeze({ ...actor, point: Object.freeze([...pt]) }));
  }
  const holders = positions.filter(a => a.possession);
  if (holders.length > 1) return blocked('ambiguous-possession');
  return Object.freeze({
    mode: 'field-preview', atMs: frame.atMs, durationMs: frame.durationMs,
    done: frame.done, ball: frame.ball,
    positions: Object.freeze(positions),
    possessionPoint: holders.length === 1 ? holders[0].point : null,
    renderTimedField: false
  });
}
