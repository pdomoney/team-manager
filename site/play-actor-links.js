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
