// B4.1: precise selection movement in teaching-canvas units, not sport metres.
// This module deliberately knows nothing about registered players, teams or roles.
import { actorEndpointLinks, followActorEndpoints, rebindMovementEndpoint } from './play-actor-links.js';

const isPoint = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const bounded = (v, low, high) => Math.round(Math.max(low, Math.min(high, v)) * 10) / 10;

// A preview is required before an undo snapshot, so a nudge at the edge or
// a missing selection never creates a phantom undo step or changes play data.
export function previewSelectionNudge(phase, selection, handle, dx, dy) {
  if (!phase || !selection || !Number.isFinite(dx) || !Number.isFinite(dy) ||
      (dx === 0 && dy === 0) || Math.abs(dx) > 5 || Math.abs(dy) > 5) return null;
  let from, actorKey = null;
  switch (selection.k) {
    case 'pl':
      if (typeof selection.id !== 'string' || !Object.hasOwn(phase.players || {}, selection.id)) return null;
      from = phase.players[selection.id];
      actorKey = 'player:' + selection.id;
      break;
    case 'df':
      if (!Number.isInteger(selection.i) || selection.i < 0) return null;
      from = phase.defence?.line?.[selection.i];
      actorKey = 'defender:' + selection.i;
      break;
    case 'mk':
      from = phase.defence?.marker;
      actorKey = 'marker';
      break;
    case 'lb':
      if (!Number.isInteger(selection.i) || selection.i < 0) return null;
      from = phase.labels?.[selection.i]?.at;
      break;
    case 'mv': {
      if (!Number.isInteger(selection.i) || selection.i < 0 ||
          !Number.isInteger(handle) || handle < 0) return null;
      const movement = phase.moves?.[selection.i];
      if (!movement || (movement.linkVersion !== undefined && movement.linkVersion !== 1)) return null;
      from = movement.pts?.[handle];
      break;
    }
    default: return null;
  }
  if (!isPoint(from)) return null;
  const to = [bounded(from[0] + dx, 0, 50), bounded(from[1] + dy, 0, 80)];
  return to[0] === from[0] && to[1] === from[1] ? null : { to, actorKey };
}

// Applies only a selected actor, a selected movement point or a diagram label.
// No inferred relation is created. Explicitly linked endpoints follow actors;
// moving an authored endpoint away from its actor intentionally detaches it.
export function applySelectionNudge(phase, selection, handle, dx, dy) {
  const plan = previewSelectionNudge(phase, selection, handle, dx, dy);
  if (!plan) return false;
  const { to, actorKey } = plan;
  const links = actorKey ? actorEndpointLinks(phase, actorKey) : [];
  switch (selection.k) {
    case 'pl': phase.players[selection.id] = to; break;
    case 'df': phase.defence.line[selection.i] = to; break;
    case 'mk': phase.defence.marker = to; break;
    case 'lb': phase.labels[selection.i].at = to; break;
    case 'mv':
      phase.moves[selection.i].pts[handle] = to;
      if (handle === 0 || handle === phase.moves[selection.i].pts.length - 1)
        rebindMovementEndpoint(phase, selection.i, handle);
      break;
    default: return false;
  }
  if (links.length) followActorEndpoints(phase, links, actorKey, to);
  return true;
}
