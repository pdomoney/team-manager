// E4, first bounded slice: resolve legacy diagram endpoints to a uniquely identified
// actor at selection time. This is deliberately ephemeral: legacy moves[].pts stays
// byte-for-byte compatible and no proximity guess is persisted as a relationship.
// Coordinates are teaching-canvas units, not verified sport-specific field metres.

const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// A slot ID identifies a diagram actor, NOT a registered player/person.
export function diagramActors(phase) {
  const players = Object.entries(phase?.players || {}).filter(([, p]) => point(p))
    .map(([id, position]) => ({ key: 'player:' + id, position }));
  const defence = Array.isArray(phase?.defence?.line) ? phase.defence.line : [];
  const defenders = defence.flatMap((position, i) => point(position)
    ? [{ key: 'defender:' + i, position }] : []);
  const marker = point(phase?.defence?.marker)
    ? [{ key: 'marker', position: phase.defence.marker }] : [];
  return [...players, ...defenders, ...marker];
}

// Do not silently attach a line to either actor when two overlap or are equally near.
// Only endpoints are considered, never a bend or an arbitrary point on a run.
export function actorEndpointLinks(phase, actorKey, tolerance = 0.4) {
  if (!Number.isFinite(tolerance) || tolerance <= 0) return [];
  const actors = diagramActors(phase), actor = actors.find(a => a.key === actorKey);
  if (!actor) return [];
  return (Array.isArray(phase?.moves) ? phase.moves : []).flatMap((move, moveIndex) => {
    // New movement objects carry explicit links. Do not fall back to proximity
    // for those moves, even if one endpoint is deliberately unconnected.
    if (move?.linkVersion !== undefined) {
      // Unknown future versions are not legacy geometry: fail closed.
      if (move.linkVersion !== 1 || !move.actorLinks || typeof move.actorLinks !== 'object') return [];
      const pts = move.pts;
      if (!Array.isArray(pts) || pts.length < 2) return [];
      return [0, pts.length - 1].flatMap(pointIndex => {
        const key = pointIndex === 0 ? 'start' : 'end';
        return move.actorLinks[key] === actorKey && point(pts[pointIndex])
          ? [{ moveIndex, pointIndex, actorKey }] : [];
      });
    }
    const pts = move?.pts;
    if (!Array.isArray(pts) || pts.length < 2) return [];
    const indices = [0, pts.length - 1];
    return indices.flatMap(pointIndex => {
      const at = pts[pointIndex];
      if (!point(at)) return [];
      const near = actors.filter(a => distance(a.position, at) < tolerance);
      return near.length === 1 && near[0].key === actorKey
        ? [{ moveIndex, pointIndex, actorKey }] : [];
    });
  });
}

// Apply only the previously captured, uniquely resolved links. No new metadata,
// no changes to unrelated bends or other phases, no inferred new attachments.
export function followActorEndpoints(phase, links, actorKey, position) {
  if (!point(position) || !Array.isArray(links)) return 0;
  let updated = 0;
  for (const link of links) {
    if (link.actorKey !== actorKey) continue;
    const pts = phase?.moves?.[link.moveIndex]?.pts;
    if (!Array.isArray(pts) || pts.length < 2 || ![0, pts.length - 1].includes(link.pointIndex)) continue;
    pts[link.pointIndex] = position.slice();
    updated += 1;
  }
  return updated;
}


// A link is attached only to a uniquely identified actor at the actual snapped
// endpoint. Do not guess when two actors overlap or the endpoint is freehand.
export function actorAtEndpoint(phase, position, type = 'player', tolerance = 0.4) {
  if (!point(position) || !Number.isFinite(tolerance) || tolerance <= 0) return null;
  const candidates = diagramActors(phase).filter(a =>
    (type === 'player' ? a.key.startsWith('player:') :
      type === 'defence' ? !a.key.startsWith('player:') : true) &&
    distance(a.position, position) < tolerance);
  return candidates.length === 1 ? candidates[0].key : null;
}

// E4.2 metadata applies to NEW coach-authored movements only. Historical lines
// retain the legacy geometry/semantics and are never upgraded on read or save.
export function newLinkedMovement(phase, move, moveId) {
  if (!/^m-[a-z0-9-]{3,64}$/.test(String(moveId ?? '')) ||
      phase?.moves?.some(m => m?.moveId === moveId) ||
      !Array.isArray(move?.pts) || move.pts.length < 2 ||
      !move.pts.every(point)) return null;
  const startType = move.t === 'shift' ? 'defence' : 'player';
  const start = actorAtEndpoint(phase, move.pts[0], startType);
  const end = actorAtEndpoint(phase, move.pts.at(-1), 'player');
  return {
    ...move, moveId, linkVersion: 1,
    actorLinks: { ...(start ? { start } : {}), ...(end && move.t !== 'shift' ? { end } : {}) }
  };
}

// When a coach edits an endpoint, the old relationship must not silently
// survive if they move it away from the actor. Explicit links are overwritten
// only for the touched endpoint. Historical movements remain unmodified.
export function rebindMovementEndpoint(phase, moveIndex, pointIndex) {
  const move = phase?.moves?.[moveIndex], pts = move?.pts;
  if (!move || move.linkVersion !== 1 || !Array.isArray(pts) || pts.length < 2 ||
      ![0, pts.length - 1].includes(pointIndex) || !point(pts[pointIndex])) return false;
  const isStart = pointIndex === 0, key = isStart ? 'start' : 'end';
  const actor = actorAtEndpoint(phase, pts[pointIndex],
    isStart && move.t === 'shift' ? 'defence' : 'player');
  move.actorLinks = { ...(move.actorLinks || {}) };
  if (actor && (isStart || move.t !== 'shift')) move.actorLinks[key] = actor;
  else delete move.actorLinks[key];
  return true;
}

// Whole-line translation is an explicit detachment from previously attached
// actors. The player drag flow separately moves only endpoints with valid links.
export function detachMovementActors(move) {
  if (move?.linkVersion !== 1) return false;
  move.actorLinks = {};
  return true;
}


// E4.7: a run may start at one explicitly chosen diagram actor OR at a
// deliberate free field point. Only new version-1 run movements can change.
// Actor keys are drawing slots, not registered people, and no ball event is
// inferred by reanchoring a run.
function editableRun(phase, moveIndex) {
  if (!Number.isInteger(moveIndex) || moveIndex < 0) return null;
  const move = phase?.moves?.[moveIndex];
  if (move?.linkVersion !== 1 || move.t !== 'run' ||
      !move.actorLinks || typeof move.actorLinks !== 'object' ||
      Array.isArray(move.actorLinks) || !Array.isArray(move.pts) ||
      move.pts.length < 2 || !move.pts.every(p =>
        point(p) && p[0] >= 0 && p[0] <= 50 && p[1] >= 0 && p[1] <= 80)) return null;
  return move;
}

// Select the run's start actor; preserve bends, end, end link and other moves.
// Overlapping actors fail closed instead of silently choosing a different one.
export function assignRunOrigin(phase, moveIndex, playerId) {
  const move = editableRun(phase, moveIndex);
  if (!move || typeof playerId !== 'string' || !phase?.players ||
      !Object.hasOwn(phase.players, playerId)) return false;
  const target = phase.players[playerId];
  if (!point(target) || target[0] < 0 || target[0] > 50 ||
      target[1] < 0 || target[1] > 80 ||
      actorAtEndpoint(phase, target, 'player') !== 'player:' + playerId) return false;
  move.pts[0] = target.slice();
  move.actorLinks = { ...move.actorLinks, start: 'player:' + playerId };
  return true;
}

// A deliberate field start has its OWN coordinates. Remove only the explicit
// start link; never snap/rebind it automatically on subsequent actor drags.
export function freeRunOrigin(phase, moveIndex) {
  const move = editableRun(phase, moveIndex);
  if (!move || !Object.hasOwn(move.actorLinks, 'start') ||
      typeof move.actorLinks.start !== 'string' ||
      !move.actorLinks.start.startsWith('player:')) return false;
  const links = { ...move.actorLinks };
  delete links.start;
  move.actorLinks = links;
  return true;
}

// E4.8: a version-1 teaching run can finish at another diagram actor or at
// a deliberate field point. This is geometry, NOT a collision, catch, legal
// move, match lineup or movement timing decision. Legacy runs stay unchanged.
export function assignRunEndpoint(phase, moveIndex, playerId) {
  const move = editableRun(phase, moveIndex);
  if (!move || typeof playerId !== 'string' || !phase?.players ||
      !Object.hasOwn(phase.players, playerId)) return false;
  const target = phase.players[playerId];
  if (!point(target) || target[0] < 0 || target[0] > 50 ||
      target[1] < 0 || target[1] > 80 ||
      actorAtEndpoint(phase, target, 'player') !== 'player:' + playerId ||
      Math.hypot(target[0] - move.pts[0][0], target[1] - move.pts[0][1]) < 1)
    return false;
  move.pts[move.pts.length - 1] = target.slice();
  move.actorLinks = { ...move.actorLinks, end: 'player:' + playerId };
  return true;
}

// Keep a run's end coordinates exactly where the coach placed them; detach
// only the end reference so subsequent actor drags will not move the point.
export function freeRunEndpoint(phase, moveIndex) {
  const move = editableRun(phase, moveIndex);
  if (!move || !Object.hasOwn(move.actorLinks, 'end') ||
      typeof move.actorLinks.end !== 'string' ||
      !move.actorLinks.end.startsWith('player:')) return false;
  const next = { ...move.actorLinks };
  delete next.end;
  move.actorLinks = next;
  return true;
}

// E4.6: repair the authored sender of a NEW explicit pass in the coach editor.
// The selected diagram slot (not a roster player) becomes the pass origin.
// Repositioning the start handle is deliberate and visible. It does NOT infer
// when the pass leaves a preceding run or whether the actor has possession.
// Legacy unversioned paths and unsupported future link shapes are untouched.
export function assignPassPasser(phase, moveIndex, playerId) {
  if (!Number.isInteger(moveIndex) || moveIndex < 0 ||
      typeof playerId !== 'string' ||
      !phase?.players || !Object.hasOwn(phase.players, playerId)) return false;
  const move = phase?.moves?.[moveIndex], target = phase.players[playerId];
  if (move?.linkVersion !== 1 || move.t !== 'pass' ||
      !move.actorLinks || typeof move.actorLinks !== 'object' ||
      Array.isArray(move.actorLinks) ||
      !Array.isArray(move.pts) || move.pts.length < 2 ||
      !move.pts.every(point) || !point(target) ||
      target[0] < 0 || target[0] > 50 ||
      target[1] < 0 || target[1] > 80 ||
      actorAtEndpoint(phase, target, 'player') !== 'player:' + playerId) return false;
  move.pts[0] = target.slice();
  move.actorLinks = { ...move.actorLinks, start: 'player:' + playerId };
  return true;
}

// Explicit E4.3 coach decision: a receiver is chosen by the diagram slot ID.
// Only an E4.2+ movement can be changed; historical play geometry is untouched.
export function assignPassReceiver(phase, moveIndex, playerId) {
  const move = phase?.moves?.[moveIndex], target = phase?.players?.[playerId];
  if (move?.linkVersion !== 1 || move.t !== 'pass' ||
      !Array.isArray(move.pts) || move.pts.length < 2 || !point(target) ||
      !actorAtEndpoint(phase, target, 'player') ||
      actorAtEndpoint(phase, target, 'player') !== 'player:' + playerId) return false;
  move.pts[move.pts.length - 1] = target.slice();
  move.actorLinks = { ...move.actorLinks, end: 'player:' + playerId };
  return true;
}

// Start a separate, explicitly identified teaching run from the selected
// receiver. This does NOT assert possession, catch timing, or a legal route.
export function receiverFollowOnRun(phase, passIndex, moveId, targetPosition) {
  const pass = phase?.moves?.[passIndex];
  if (pass?.linkVersion !== 1 || pass.t !== 'pass' ||
      !pass.actorLinks?.end?.startsWith('player:') || !point(targetPosition)) return null;
  const actorKey = pass.actorLinks.end, actorId = actorKey.slice(7);
  const start = phase?.players?.[actorId];
  if (!point(start) || distance(start, targetPosition) < 1 ||
      distance(start, pass.pts?.at(-1) || []) > 0.4 ||
      targetPosition[0] < 0 || targetPosition[0] > 50 ||
      targetPosition[1] < 0 || targetPosition[1] > 80) return null;
  const run = newLinkedMovement(phase, { t: 'run', pts: [start.slice(), targetPosition.slice()] }, moveId);
  return run?.actorLinks?.start === actorKey ? run : null;
}
