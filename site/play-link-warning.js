// E4.5: concise coach-only wording for verified broken V1 actor links.
// Consumes the read-only E4.4 inspector. Old unversioned geometry is not
// silently validated, promoted to linked movement or called an error.
import { inspectPlayMovementLinks } from './play-movement-link-audit.js';

const MESSAGES = Object.freeze({
  'invalid-movement': 'The movement is not a valid drawing object.',
  'unsupported-link-version': 'This movement uses an unsupported connection version.',
  'invalid-movement-id': 'This movement is missing a valid connection ID.',
  'duplicate-movement-id': 'Two movements share the same connection ID.',
  'invalid-movement-geometry': 'The movement has invalid drawing coordinates.',
  'invalid-actor-links': 'The movement has invalid connection details.',
  'unsupported-link-endpoint': 'This movement has an unsupported connection point.',
  'missing-tactical-actor': 'A connected diagram player or defender no longer exists.',
  'stale-actor-endpoint': 'A movement endpoint no longer meets its connected diagram actor.',
  'defence-movement-needs-defender': 'A defender movement is incorrectly attached to an attacking player.',
  'attacking-movement-needs-player': 'An attacking movement is attached to a defender.',
  'defence-end-is-field-point': 'The end of a defender shift must be a field point.',
  'pass-passer-unlinked': 'The pass has no explicitly connected passer.',
  'pass-receiver-unlinked': 'The pass has no explicitly connected receiver.',
  'invalid-phase': 'This diagram phase cannot be inspected.'
});

export function coachPlayConnectionNotice(phase) {
  const report = inspectPlayMovementLinks(phase);
  if (!report.issues.length) return Object.freeze({
    visible: false, text: '', affectedMovements: 0, firstMoveIndex: null
  });
  const indices = [...new Set(report.issues.map(i => i.moveIndex))];
  const first = report.issues[0];
  const firstMoveIndex = first.moveIndex >= 0 ? first.moveIndex : null;
  const label = firstMoveIndex === null ? 'Diagram' : `Movement ${firstMoveIndex + 1}`;
  const count = indices.length;
  const prefix = count > 1 ? `${count} diagram movements need a connection review. ` : '';
  const detail = MESSAGES[first.code] || 'A movement connection needs review.';
  return Object.freeze({
    visible: true,
    text: `${prefix}${label}: ${detail} Check the affected movement in Advanced diagram. No drawing is changed automatically.`,
    affectedMovements: count, firstMoveIndex
  });
}
