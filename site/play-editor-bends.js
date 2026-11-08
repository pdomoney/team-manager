// B4.3: bounded, undo-friendly editing of a selected movement bend.
// Legacy pts geometry is retained and explicit actor links remain on endpoints.
// These coordinates are teaching units, not match-ready sport metres.
const validPoint = p => Array.isArray(p) && p.length === 2 &&
  p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 50 && p[1] >= 0 && p[1] <= 80;

function movement(phase, moveIndex) {
  if (!Number.isInteger(moveIndex) || moveIndex < 0) return null;
  const m = phase?.moves?.[moveIndex];
  if (!m || (m.linkVersion !== undefined && m.linkVersion !== 1) ||
      !Array.isArray(m.pts) || m.pts.length < 2 || !m.pts.every(validPoint)) return null;
  return m;
}

// A selected Start inserts before the first segment, End before the last;
// a selected bend inserts on the following segment. Never guess a target when
// no point is selected, or create coincident zero-length segments.
export function previewBendInsertion(phase, moveIndex, pointIndex) {
  const m = movement(phase, moveIndex);
  if (!m || m.pts.length >= 24 || !Number.isInteger(pointIndex) ||
      pointIndex < 0 || pointIndex >= m.pts.length) return null;
  const segment = Math.min(pointIndex, m.pts.length - 2);
  const a = m.pts[segment], b = m.pts[segment + 1];
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.25) return null;
  const at = [Math.round((a[0] + b[0]) * 5) / 10,
    Math.round((a[1] + b[1]) * 5) / 10];
  if (at.every((v, i) => v === a[i]) || at.every((v, i) => v === b[i])) return null;
  return { insertIndex: segment + 1, at };
}

export function insertMovementBend(phase, moveIndex, pointIndex) {
  const plan = previewBendInsertion(phase, moveIndex, pointIndex);
  if (!plan) return null;
  phase.moves[moveIndex].pts.splice(plan.insertIndex, 0, plan.at);
  return plan.insertIndex;
}

export function canRemoveMovementBend(phase, moveIndex, pointIndex) {
  const m = movement(phase, moveIndex);
  return !!m && Number.isInteger(pointIndex) && pointIndex > 0 &&
    pointIndex < m.pts.length - 1;
}

export function removeMovementBend(phase, moveIndex, pointIndex) {
  if (!canRemoveMovementBend(phase, moveIndex, pointIndex)) return false;
  phase.moves[moveIndex].pts.splice(pointIndex, 1);
  return true;
}
