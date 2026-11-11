// E4.12: safe phase-local editing of existing V1 tactical movement links.
// No saved-play migration, cross-phase identity, time, or possession inference.
import {
  actorAtEndpoint, diagramActors, assignRunOrigin, freeRunOrigin,
  assignRunEndpoint, freeRunEndpoint, assignDefenderOrigin, freeDefenderOrigin,
  assignPassPasser, assignPassReceiver
} from './play-actor-links.js';

const validPoint = p => Array.isArray(p) && p.length === 2 &&
  p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 50 && p[1] >= 0 && p[1] <= 80;
const validLinks = links => links !== null && typeof links === 'object' &&
  !Array.isArray(links) && Object.keys(links).every(k => k === 'start' || k === 'end') &&
  Object.values(links).every(v => typeof v === 'string');

export function connectedPathEndpoint(phase, moveIndex, pointIndex) {
  if (!Number.isInteger(moveIndex) || moveIndex < 0 || !Number.isInteger(pointIndex)) return null;
  const move = phase?.moves?.[moveIndex];
  if (!move || move.linkVersion !== 1 || !['run', 'pass', 'shift'].includes(move.t) ||
      !validLinks(move.actorLinks) || !Array.isArray(move.pts) || move.pts.length < 2 ||
      !move.pts.every(validPoint)) return null;
  const last = move.pts.length - 1;
  if (pointIndex !== 0 && pointIndex !== last) return null;
  const endpoint = pointIndex === 0 ? 'start' : 'end';
  if (move.t === 'shift' && endpoint === 'end') return null;
  if (move.t === 'shift' && Object.hasOwn(move.actorLinks, 'end')) return null;
  const isDefence = move.t === 'shift';
  const type = isDefence ? 'defence' : 'player';
  const actorKey = move.actorLinks[endpoint] || null;
  const actors = diagramActors(phase).filter(a => validPoint(a.position) &&
    (isDefence ? !a.key.startsWith('player:') : a.key.startsWith('player:')) &&
    actorAtEndpoint(phase, a.position, type) === a.key);
  const options = actors.map(a => ({
    key: a.key,
    name: a.key === 'marker' ? 'Marker'
      : a.key.startsWith('defender:') ? 'Defender ' + (Number(a.key.slice(9)) + 1)
        : a.key.slice(7),
    // E4.8 intentionally disallows a zero-length run where end meets origin.
    disabled: move.t === 'run' && endpoint === 'end' &&
      Math.hypot(a.position[0] - move.pts[0][0], a.position[1] - move.pts[0][1]) < 1
  }));
  const attached = actorKey && actors.find(a => a.key === actorKey);
  const synced = attached && move.pts[pointIndex].every((n, i) =>
    Math.abs(n - attached.position[i]) < 0.000001);
  return Object.freeze({
    endpoint, actorKey,
    status: !actorKey ? (move.t === 'pass' ? 'unresolved-pass' : 'free-field')
      : !attached ? 'unresolved-link' : synced ? 'linked' : 'needs-repair',
    canFree: move.t !== 'pass' && !!actorKey &&
      (isDefence ? actorKey === 'marker' || /^defender:(0|[1-9]\d*)$/.test(actorKey)
        : actorKey.startsWith('player:')),
    choices: Object.freeze(options.map(Object.freeze))
  });
}

export function changeConnectedPathEndpoint(phase, moveIndex, pointIndex, chosenKey) {
  const control = connectedPathEndpoint(phase, moveIndex, pointIndex);
  if (!control || typeof chosenKey !== 'string') return false;
  if (chosenKey) {
    const option = control.choices.find(x => x.key === chosenKey && !x.disabled);
    if (!option || (control.actorKey === chosenKey && control.status === 'linked')) return false;
  } else if (!control.canFree) return false;
  const move = phase.moves[moveIndex], prior = JSON.stringify(move);
  let ok = false;
  if (move.t === 'run') {
    ok = control.endpoint === 'start'
      ? (chosenKey ? assignRunOrigin(phase, moveIndex, chosenKey.slice(7))
        : freeRunOrigin(phase, moveIndex))
      : (chosenKey ? assignRunEndpoint(phase, moveIndex, chosenKey.slice(7))
        : freeRunEndpoint(phase, moveIndex));
  } else if (move.t === 'shift') {
    ok = chosenKey ? assignDefenderOrigin(phase, moveIndex, chosenKey)
      : freeDefenderOrigin(phase, moveIndex);
  } else if (move.t === 'pass' && chosenKey) {
    ok = control.endpoint === 'start'
      ? assignPassPasser(phase, moveIndex, chosenKey.slice(7))
      : assignPassReceiver(phase, moveIndex, chosenKey.slice(7));
  }
  return ok && JSON.stringify(move) !== prior;
}

// Used before pedSnap: rejected requests never create phantom undo/dirty state.
export function previewConnectedPathChange(phase, moveIndex, pointIndex, chosenKey) {
  try {
    const clone = JSON.parse(JSON.stringify(phase));
    return changeConnectedPathEndpoint(clone, moveIndex, pointIndex, chosenKey);
  } catch {
    return false;
  }
}
