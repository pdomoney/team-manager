// Snapping is opt-in. Report the same decision to the coach that geometry uses.
// Positions are legacy teaching-canvas units, not metres.
export function editorSnapDetails(phase, position, kind, enabled, tolerance = 0.65) {
  const free = { status: 'off', point: position, target: null };
  if (!enabled) return free;
  if (!Array.isArray(position) || position.length !== 2 ||
      !position.every(Number.isFinite) || !Number.isFinite(tolerance) || tolerance <= 0 ||
      !['player', 'defence'].includes(kind))
    return { ...free, status: 'invalid' };
  const candidates = kind === 'player'
    ? Object.entries(phase?.players || {}).map(([id, point]) => ({ id, point }))
    : [
        ...(phase?.defence?.marker ? [{ id: 'Marker', point: phase.defence.marker }] : []),
        ...(Array.isArray(phase?.defence?.line)
          ? phase.defence.line.map((point, i) => ({ id: 'Defender ' + (i + 1), point }))
          : [])
      ];
  const near = candidates.filter(({ point }) => Array.isArray(point) && point.length === 2 &&
    point.every(Number.isFinite) && Math.hypot(point[0] - position[0], point[1] - position[1]) <= tolerance);
  if (near.length > 1) return { status: 'ambiguous', point: position, target: null };
  if (near.length === 1) return { status: 'ready', point: near[0].point.slice(), target: near[0].id };
  return { status: 'none', point: position, target: null };
}

export function editorSnapPoint(phase, position, kind, enabled, tolerance = 0.65) {
  return editorSnapDetails(phase, position, kind, enabled, tolerance).point;
}
