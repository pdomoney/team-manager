// E5.2: opt-in, pure timeline evaluation. This module never reads or writes
// saved plays, infers a catch, or treats a diagram slot as a registered person.
// The caller must explicitly author the actor mapping, time and event sequence.
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const frozen = x => {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.values(x).forEach(frozen);
    Object.freeze(x);
  }
  return x;
};
const validId = x => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(x);
const issue = (code, eventId = null) => ({ code, eventId });
const kinds = new Set(['possession-set', 'pass-release', 'catch', 'catch-failed',
  'run-start', 'run-end', 'wait-start', 'wait-end']);
const fail = (issues, atMs) => frozen({
  status: 'blocked', atMs, issues, ball: { state: 'unknown' }, motion: {},
  timingVerified: false, possessionVerified: false, timedPlaybackAllowed: false
});

// Returns an immutable snapshot at atMs. All event timestamps and tie-break
// sequence numbers are explicitly authored; array order has no authority.
export function evaluatePlayEventTimeline(timeline, atMs) {
  if (!Number.isSafeInteger(atMs) || atMs < 0) return fail([issue('invalid-seek-time')], atMs);
  if (!isObject(timeline) || timeline.version !== 1 ||
      !Array.isArray(timeline.actors) || !Array.isArray(timeline.events)) {
    return fail([issue('unsupported-or-invalid-timeline')], atMs);
  }
  const errors = [], actors = new Map(), mappings = new Set();
  for (const actor of timeline.actors) {
    if (!isObject(actor) || !validId(actor.actorId) ||
        !['attacker', 'defender'].includes(actor.type) ||
        !Array.isArray(actor.phases) || !actor.phases.length) {
      errors.push(issue('invalid-actor')); continue;
    }
    if (actors.has(actor.actorId)) errors.push(issue('duplicate-actor-id'));
    actors.set(actor.actorId, actor);
    const local = new Set();
    for (const p of actor.phases) {
      if (!isObject(p) || !Number.isSafeInteger(p.phaseIndex) || p.phaseIndex < 0 ||
          !validId(p.slotKey)) { errors.push(issue('invalid-phase-mapping')); continue; }
      const key = p.phaseIndex + ':' + p.slotKey;
      if (local.has(p.phaseIndex)) errors.push(issue('duplicate-actor-phase'));
      local.add(p.phaseIndex);
      if (mappings.has(key)) errors.push(issue('ambiguous-phase-mapping'));
      mappings.add(key);
    }
    // Cross-phase continuity must be explicit: listing the mapping is the
    // coach's assertion, never a match inferred from repeated slot labels.
  }
  const ids = new Set(), times = new Set();
  for (const e of timeline.events) {
    if (!isObject(e) || !validId(e.eventId) ||
        !Number.isSafeInteger(e.atMs) || e.atMs < 0 ||
        !Number.isSafeInteger(e.sequence) || e.sequence < 0 ||
        !kinds.has(e.kind)) { errors.push(issue('invalid-event', e?.eventId)); continue; }
    if (ids.has(e.eventId)) errors.push(issue('duplicate-event-id', e.eventId));
    ids.add(e.eventId);
    const timeKey = e.atMs + ':' + e.sequence;
    if (times.has(timeKey)) errors.push(issue('duplicate-event-order', e.eventId));
    times.add(timeKey);
    if (!validId(e.actorId) || !actors.has(e.actorId))
      errors.push(issue('unknown-event-actor', e.eventId));
    else if (e.kind !== 'catch-failed' && e.kind !== 'pass-release' &&
        e.kind !== 'catch' && e.kind !== 'possession-set' &&
        !actors.has(e.actorId)) errors.push(issue('unknown-motion-actor', e.eventId));
    if (['possession-set', 'pass-release', 'catch'].includes(e.kind) &&
        actors.get(e.actorId)?.type !== 'attacker')
      errors.push(issue('ball-event-needs-attacker', e.eventId));
    if (e.kind === 'pass-release' &&
        (!validId(e.movementId) || !validId(e.receiverId) ||
         actors.get(e.receiverId)?.type !== 'attacker' || e.receiverId === e.actorId))
      errors.push(issue('invalid-pass-reference', e.eventId));
    if (e.kind === 'catch-failed' && !validId(e.movementId))
      errors.push(issue('invalid-failed-catch-reference', e.eventId));
  }
  if (errors.length) return fail(errors, atMs);
  const ordered = [...timeline.events].sort((a, b) =>
    a.atMs - b.atMs || a.sequence - b.sequence);
  let ball = { state: 'unknown' };
  const motion = {};
  for (const e of ordered) {
    const actor = e.actorId;
    let code = null;
    switch (e.kind) {
      case 'possession-set':
        if (!['unknown', 'loose'].includes(ball.state)) code = 'possession-already-held';
        else ball = { state: 'held', actorId: actor };
        break;
      case 'pass-release':
        if (ball.state !== 'held' || ball.actorId !== actor) code = 'release-without-possession';
        else ball = { state: 'in-flight', movementId: e.movementId,
          fromActorId: actor, receiverId: e.receiverId };
        break;
      case 'catch':
        if (ball.state !== 'in-flight') code = 'catch-without-flight';
        else if (ball.receiverId !== actor || ball.movementId !== e.movementId)
          code = 'catch-mismatched-pass';
        else ball = { state: 'held', actorId: actor };
        break;
      case 'catch-failed':
        if (ball.state !== 'in-flight' || ball.movementId !== e.movementId)
          code = 'failure-without-matching-flight';
        else ball = { state: 'loose' };
        break;
      case 'run-start':
      case 'wait-start':
        if (motion[actor]) code = 'overlapping-actor-motion';
        else motion[actor] = e.kind === 'run-start' ? 'running' : 'waiting';
        break;
      case 'run-end':
      case 'wait-end':
        if (motion[actor] !== (e.kind === 'run-end' ? 'running' : 'waiting'))
          code = 'motion-end-without-start';
        else delete motion[actor];
        break;
    }
    // Validate the entire authored script, including events after the seek,
    // to avoid silently accepting a broken future transition.
    if (code) return fail([issue(code, e.eventId)], atMs);
  }
  ball = { state: 'unknown' };
  const atMotion = {};
  for (const e of ordered) {
    if (e.atMs > atMs) break;
    switch (e.kind) {
      case 'possession-set': ball = { state: 'held', actorId: e.actorId }; break;
      case 'pass-release': ball = { state: 'in-flight', movementId: e.movementId,
        fromActorId: e.actorId, receiverId: e.receiverId }; break;
      case 'catch': ball = { state: 'held', actorId: e.actorId }; break;
      case 'catch-failed': ball = { state: 'loose' }; break;
      case 'run-start': atMotion[e.actorId] = 'running'; break;
      case 'wait-start': atMotion[e.actorId] = 'waiting'; break;
      case 'run-end':
      case 'wait-end': delete atMotion[e.actorId]; break;
    }
  }
  return frozen({ status: 'evaluated', atMs, issues: [], ball, motion: atMotion,
    timingVerified: true, possessionVerified: ball.state !== 'unknown',
    // No production playback or editor approval is implied by pure evaluation.
    timedPlaybackAllowed: false });
}
