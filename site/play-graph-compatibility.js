// E4.11 | A strictly read-only projection of the JSON play contract.
// It does NOT serialise a new play format, invent legacy actor relationships,
// change saved byte content, or author timing, possession or sport rules.
import { inspectPlayMovementLinks } from './play-movement-link-audit.js';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

// Accepted saved plays are JSON values. Reject non-JSON in-memory objects
// rather than silently dropping undefined, functions, cycles or special numbers.
function isJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && !object(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  seen.add(value);
  const ok = Array.isArray(value)
    ? Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i) &&
      isJsonValue(value[i], seen)).every(Boolean)
    : Object.entries(value).every(([_, v]) => isJsonValue(v, seen));
  seen.delete(value);
  return ok;
}

const invalid = code => deepFreeze({
  projectionVersion: 1, status: 'invalid', phases: [],
  issues: [{ code }], sourceJson: null,
  sourceWasExactText: false, timingVerified: false,
  possessionVerified: false, actorIdentityVerified: false
});
const rawCopy = value => JSON.parse(JSON.stringify(value));
const linkedEnd = (move, end, key) => typeof move.actorLinks?.[end] === 'string'
  ? { status: 'known-local-slot', actorKey: move.actorLinks[end] }
  : { status: 'free-field-point', point: rawCopy(key) };

// A string input is retained *exactly*, including its whitespace, property
// ordering, and escape sequences. For object input, sourceJson is the
// snapshot's JSON serialisation, NOT a claim to recover original file bytes.
export function inspectPlayGraphCompatibility(input) {
  let sourceJson, sourceWasExactText;
  try {
    sourceWasExactText = typeof input === 'string';
    if (sourceWasExactText) sourceJson = input;
    else if (isJsonValue(input)) sourceJson = JSON.stringify(input);
    else return invalid('non-json-play-input');
    const play = JSON.parse(sourceJson);
    if (!object(play) || (play.phases !== undefined && !Array.isArray(play.phases)))
      return invalid('invalid-play-phases');
    const phases = [play, ...(play.phases || [])], issues = [];
    const records = phases.map((phase, phaseIndex) => {
      const audit = inspectPlayMovementLinks(phase);
      const movements = (Array.isArray(phase?.moves) ? phase.moves : [])
        .map((move, moveIndex) => {
          const relevant = audit.issues.filter(x => x.moveIndex === moveIndex)
            .map(x => x.code);
          const verified = audit.movements.find(x => x.moveIndex === moveIndex);
          const base = {
            phaseIndex, moveIndex, raw: rawCopy(move),
            geometry: rawCopy(move?.pts ?? null)
          };
          if (object(move) && move.linkVersion === undefined) return {
            ...base, representation: 'legacy-geometry', resolution: 'unresolved-legacy',
            start: null, end: null, issues: []
          };
          if (object(move) && move.linkVersion === 1 && verified) return {
            ...base, representation: 'linked-v1', resolution: 'explicit-local',
            moveId: verified.moveId,
            start: linkedEnd(move, 'start', move.pts[0]),
            end: linkedEnd(move, 'end', move.pts.at(-1)),
            issues: []
          };
          return { ...base,
            representation: object(move) && move.linkVersion === 1
              ? 'invalid-v1' : 'unsupported-or-invalid',
            resolution: 'unresolved',
            start: null, end: null,
            issues: relevant.length ? relevant : ['unrecognised-movement'] };
        });
      if (audit.status === 'invalid') issues.push({
        code: 'invalid-phase-links', phaseIndex,
        issues: audit.issues.map(x => ({ ...x }))
      });
      return { phaseIndex, linkStatus: audit.status,
        legacyMovements: audit.legacyMovements, movements };
    });
    const all = records.flatMap(x => x.movements);
    return deepFreeze({
      projectionVersion: 1,
      status: issues.length ? 'invalid'
        : all.some(x => x.representation === 'legacy-geometry') ? 'mixed-or-legacy'
          : all.length ? 'v1-only' : 'empty',
      sourceJson, sourceWasExactText, phases: records, issues,
      // This projection deliberately contains no inferred cross-phase edges.
      timingVerified: false, possessionVerified: false,
      actorIdentityVerified: false
    });
  } catch {
    return invalid('unreadable-json-play');
  }
}
