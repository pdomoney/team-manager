// A coach explicitly enables snapping when they want it. The default is
// freehand so a short drag cannot jump to a nearby role unexpectedly.
// The canvas coordinates are the existing legacy teaching units, not metres.
export function editorSnapPoint(phase, position, kind, enabled, tolerance = 0.65) {
  if (!enabled || !Array.isArray(position) || position.length !== 2 ||
      !position.every(Number.isFinite) || !Number.isFinite(tolerance) || tolerance <= 0)
    return position;
  const players = Object.values(phase?.players || {});
  const defence = [
    ...(phase?.defence?.marker ? [phase.defence.marker] : []),
    ...(phase?.defence?.line || [])
  ];
  const positions = kind === 'defence' ? defence : players;
  const near = positions.filter(p => Array.isArray(p) && p.length === 2 &&
    p.every(Number.isFinite) && Math.hypot(p[0]-position[0],p[1]-position[1]) <= tolerance);
  return near.length === 1 ? near[0].slice() : position;
}
