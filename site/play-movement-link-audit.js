// Play Engine 2.0 E4.4: an observation-only consistency view of existing
// version-1 tactical movement links. It does NOT create a scene graph,
// reorder events, infer possession, infer a catch, change sport format,
// or persist guessed legacy links. Actors are diagram slots, not people.
import { diagramActors } from './play-actor-links.js';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const coordinate = p => Array.isArray(p) && p.length === 2 &&
  p.every(Number.isFinite) && p[0] >= 0 && p[0] <= 50 && p[1] >= 0 && p[1] <= 80;
const positionMatches = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.000001;
const movementId = id => typeof id === 'string' && /^m-[a-z0-9-]{3,64}$/.test(id);
const freeze = Object.freeze;
const frozenList = list => freeze(list.map(item => freeze(item)));

export function inspectPlayMovementLinks(phase) {
  if (!object(phase)) return freeze({
    status: 'invalid', actors: freeze([]), movements: freeze([]),
    sharedActorPaths: freeze([]), issues: frozenList([{ code: 'invalid-phase', moveIndex: -1 }]),
    legacyMovements: 0, timingVerified: false, possessionVerified: false
  });

  const actors = diagramActors(phase).filter(a => coordinate(a.position))
    .map(a => freeze({ key: a.key, position: freeze(a.position.slice()) }));
  const actorMap = new Map(actors.map(a => [a.key, a.position]));
  const source = Array.isArray(phase.moves) ? phase.moves : [];
  const issues = [], movements = [], moveIds = new Set();
  let legacyMovements = 0;

  source.forEach((move, moveIndex) => {
    if (!object(move)) {
      issues.push({ code: 'invalid-movement', moveIndex });
      return;
    }
    // Legacy shape does not prove authorship of an edge, even if its endpoint
    // is right on top of a tactical actor. Never silently migrate it.
    if (move.linkVersion === undefined) {
      legacyMovements += 1;
      return;
    }
    const codes = [];
    if (move.linkVersion !== 1) codes.push('unsupported-link-version');
    if (!movementId(move.moveId)) codes.push('invalid-movement-id');
    else if (moveIds.has(move.moveId)) codes.push('duplicate-movement-id');
    else moveIds.add(move.moveId);
    if (!Array.isArray(move.pts) || move.pts.length < 2 ||
        !move.pts.every(coordinate)) codes.push('invalid-movement-geometry');

    const links = move.actorLinks;
    if (!object(links)) codes.push('invalid-actor-links');
    else {
      for (const [endpoint, actorKey] of Object.entries(links)) {
        if (!['start', 'end'].includes(endpoint)) {
          codes.push('unsupported-link-endpoint');
          continue;
        }
        if (typeof actorKey !== 'string' || !actorMap.has(actorKey)) {
          codes.push('missing-tactical-actor');
          continue;
        }
        const where = endpoint === 'start' ? move.pts?.[0] : move.pts?.at(-1);
        if (!coordinate(where) || !positionMatches(where, actorMap.get(actorKey)))
          codes.push('stale-actor-endpoint');
        if (endpoint === 'start' && move.t === 'shift' && actorKey.startsWith('player:'))
          codes.push('defence-movement-needs-defender');
        if ((move.t === 'pass' || move.t === 'run' || endpoint === 'end') &&
            (move.t !== 'shift') && !actorKey.startsWith('player:'))
          codes.push('attacking-movement-needs-player');
        if (move.t === 'shift' && endpoint === 'end')
          codes.push('defence-end-is-field-point');
      }
    }

    // An explicit pass lacking a valid passer or receiver is intentionally
    // incomplete. A deliberate freehand run end is allowed (field coordinate).
    if (move.t === 'pass' && object(links)) {
      if (typeof links.start !== 'string' || !links.start.startsWith('player:'))
        codes.push('pass-passer-unlinked');
      if (typeof links.end !== 'string' || !links.end.startsWith('player:'))
        codes.push('pass-receiver-unlinked');
    }
    if (!codes.length) {
      movements.push({
        moveId: move.moveId, moveIndex, kind: String(move.t || ''),
        startActor: links.start || null, endActor: links.end || null
      });
    } else {
      for (const code of new Set(codes)) issues.push({ code, moveIndex });
    }
  });

  // Co-located actor links are useful for authoring diagnostics, but do not
  // establish temporal order, possession, or that the ball was caught.
  const passes = movements.filter(m => m.kind === 'pass' && m.endActor);
  const runs = movements.filter(m => m.kind === 'run' && m.startActor);
  const sharedActorPaths = passes.flatMap(p => runs.filter(r => r.startActor === p.endActor)
    .map(r => ({
      actorKey: p.endActor, passMoveId: p.moveId, runMoveId: r.moveId,
      temporalOrderingVerified: false
    })));
  const status = issues.length ? 'invalid'
    : legacyMovements || source.length === 0 || !movements.length ? 'partial'
      : 'consistent-links-only';
  return freeze({
    status,
    actors: frozenList(actors), movements: frozenList(movements),
    sharedActorPaths: frozenList(sharedActorPaths),
    issues: frozenList(issues), legacyMovements,
    timingVerified: false, possessionVerified: false
  });
}
