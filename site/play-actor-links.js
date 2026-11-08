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
    if (move?.linkVersion === 1) {
      if (!move.actorLinks || typeof move.actorLinks !== 'object') return [];
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
