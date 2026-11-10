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
        const where = Array.isArray(move.pts)
          ? (endpoint === 'start' ? move.pts[0] : move.pts[move.pts.length - 1]) : null;
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


// E4.10: inspect adjacent teaching phases without converting their local
// drawing slots into a single player identity. The optional declarations are
// ephemeral reviewer assertions, not saved metadata or an automatic match.
const actorKind = key => key.startsWith('player:') ? 'player'
  : key.startsWith('defender:') ? 'defender' : key === 'marker' ? 'marker' : 'unknown';
const deepFrozen = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFrozen);
    Object.freeze(value);
  }
  return value;
};
const actorMoves = (audit, key) => audit.movements
  .filter(move => move.startActor === key || move.endActor === key)
  .map(move => ({ moveId: move.moveId,
    endpoint: move.startActor === key && move.endActor === key ? 'both'
      : move.startActor === key ? 'start' : 'end' }));

export function inspectPlayPhaseContinuity(play, declarations = []) {
  const empty = (code) => deepFrozen({
    status: 'invalid', phases: [], boundaries: [],
    issues: [{ code }], actorIdentityVerified: false,
    timingVerified: false, possessionVerified: false
  });
  if (!object(play) || (play.phases !== undefined && !Array.isArray(play.phases)) ||
      !Array.isArray(declarations)) return empty('invalid-continuity-input');
  const phases = [play, ...(play.phases || [])];
  const audits = phases.map(inspectPlayMovementLinks);
  const boundaries = [], issues = [];

  // Declarations must name the immediate boundary and the exact tactical
  // slots on both sides. Even a valid declaration proves only a *reviewer-
  // asserted tactical correspondence*, never the registered player's identity.
  const valid = [];
  for (const item of declarations) {
    if (!object(item) || !Number.isInteger(item.fromPhase) ||
        item.fromPhase < 0 || item.fromPhase >= phases.length - 1 ||
        item.toPhase !== item.fromPhase + 1 ||
        typeof item.fromActor !== 'string' || typeof item.toActor !== 'string') {
      issues.push({ code: 'invalid-continuity-declaration' });
      continue;
    }
    const left = audits[item.fromPhase], right = audits[item.toPhase];
    const a = left.actors.find(x => x.key === item.fromActor);
    const b = right.actors.find(x => x.key === item.toActor);
    if (!a || !b || actorKind(item.fromActor) !== actorKind(item.toActor)) {
      issues.push({ code: 'invalid-continuity-actors', fromPhase: item.fromPhase,
        fromActor: item.fromActor, toActor: item.toActor });
      continue;
    }
    valid.push({ fromPhase: item.fromPhase, toPhase: item.toPhase,
      fromActor: item.fromActor, toActor: item.toActor });
  }
  for (let i = 0; i < phases.length - 1; i++) {
    const left = audits[i], right = audits[i + 1];
    const assertions = valid.filter(x => x.fromPhase === i);
    const fromCounts = new Map(), toCounts = new Map();
    assertions.forEach(x => {
      fromCounts.set(x.fromActor, (fromCounts.get(x.fromActor) || 0) + 1);
      toCounts.set(x.toActor, (toCounts.get(x.toActor) || 0) + 1);
    });
    const conflict = assertions.some(x => fromCounts.get(x.fromActor) > 1 ||
      toCounts.get(x.toActor) > 1);
    const damaged = left.status === 'invalid' || right.status === 'invalid';
    if (conflict) issues.push({ code: 'ambiguous-continuity-declarations', fromPhase: i });
    if (damaged) issues.push({ code: 'invalid-phase-movement-links', fromPhase: i });
    const mapping = new Map(assertions.map(x => [x.fromActor, x.toActor]));
    const observations = left.actors.map(actor => {
      const mapped = mapping.get(actor.key);
      // A conflicting mapping has no selected destination. Do not display
      // the last declaration as if it won merely because Map overwrote it.
      const other = conflict ? null : mapped ? right.actors.find(x => x.key === mapped)
        : right.actors.find(x => x.key === actor.key);
      const status = damaged ? 'blocked-invalid-phase'
        : conflict ? 'ambiguous'
          : mapped ? mapped === actor.key ? 'declared-continued' : 'declared-changed-slot'
            : other ? 'same-slot-unverified' : 'not-mapped';
      return {
        fromActor: actor.key, toActor: other?.key || null, status,
        fromMovementRefs: actorMoves(left, actor.key),
        toMovementRefs: other ? actorMoves(right, other.key) : [],
        // Positions/slot labels are observation only, never identity evidence.
        geometryChanged: !!other && (actor.position[0] !== other.position[0] ||
          actor.position[1] !== other.position[1])
      };
    });
    const targeted = new Set(observations.map(x => x.toActor).filter(Boolean));
    for (const actor of right.actors) if (!targeted.has(actor.key)) {
      observations.push({
        fromActor: null, toActor: actor.key,
        status: damaged ? 'blocked-invalid-phase' : conflict ? 'ambiguous' : 'new-slot-unverified',
        fromMovementRefs: [], toMovementRefs: actorMoves(right, actor.key),
        geometryChanged: false
      });
    }
    boundaries.push({ fromPhase: i, toPhase: i + 1,
      status: damaged ? 'invalid' : conflict ? 'ambiguous'
        : observations.every(x => x.status.startsWith('declared-')) ? 'declared'
          : 'unresolved',
      observations });
  }
  return deepFrozen({
    status: issues.length ? 'invalid'
      : boundaries.some(x => x.status === 'unresolved') ? 'unresolved'
        : boundaries.length ? 'declared' : 'single-phase',
    phases: audits.map((audit, index) => ({
      index, linkStatus: audit.status, legacyMovements: audit.legacyMovements,
      issues: audit.issues.map(x => ({ ...x }))
    })),
    boundaries, issues, actorIdentityVerified: false,
    timingVerified: false, possessionVerified: false
  });
}
