// E5.3.2: accessible, opt-in coach timing controls for an existing
// in-memory event draft. No play persistence or automatic actor mapping.
import { editTimelineDraft } from './play-event-draft.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const kinds = ['possession-set', 'pass-release', 'catch', 'catch-failed',
  'run-start', 'run-end', 'wait-start', 'wait-end'];
const safeId = value => /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(value);

// The caller owns the mount and the draft lifetime. In particular, a player
// view must never mount this coach-only authoring surface.
export function mountCoachTimingControls(root, initialHistory, { onChange = () => {} } = {}) {
  if (!root || typeof root.replaceChildren !== 'function' ||
      !initialHistory?.present?.actors || !Array.isArray(initialHistory.present.events))
    throw new TypeError('A valid coach draft and mount are required');
  let history = initialHistory;
  const render = (message = '') => {
    const actors = history.present.actors;
    const options = actors.map(a =>
      `<option value="${escapeHtml(a.actorId)}">${escapeHtml(a.actorId)} (${escapeHtml(a.type)})</option>`).join('');
    const rows = [...history.present.events].sort((a, b) =>
      a.atMs - b.atMs || a.sequence - b.sequence).map(e =>
      `<li><span>${escapeHtml(e.kind)} · ${e.atMs} ms · order ${e.sequence} · ${escapeHtml(e.actorId)}</span>
        <button type="button" data-remove="${escapeHtml(e.eventId)}" aria-label="Remove ${escapeHtml(e.eventId)}">Remove</button></li>`).join('');
    root.innerHTML = `<section aria-label="Coach event timing draft">
      <p>Unsaved timing draft. Events are explicit; no catches or actor identities are inferred.</p>
      <div role="status" aria-live="polite">${escapeHtml(message)}</div>
      <div><button type="button" data-action="undo" ${history.canUndo ? '' : 'disabled'}>Undo timing</button>
      <button type="button" data-action="redo" ${history.canRedo ? '' : 'disabled'}>Redo timing</button></div>
      <form data-timing-form>
        <label>Event ID <input name="eventId" required maxlength="80" pattern="[a-zA-Z0-9][a-zA-Z0-9:_-]*"></label>
        <label>Event <select name="kind">${kinds.map(k => `<option>${k}</option>`).join('')}</select></label>
        <label>Actor <select name="actorId">${options}</select></label>
        <label>Time (milliseconds) <input name="atMs" type="number" min="0" step="1" required value="0"></label>
        <label>Order at same time <input name="sequence" type="number" min="0" step="1" required value="0"></label>
        <label>Movement ID (for pass/catch) <input name="movementId" maxlength="80"></label>
        <label>Receiver (for pass) <select name="receiverId"><option value="">Choose receiver</option>${options}</select></label>
        <button type="submit">Add event to draft</button>
      </form>
      <ol aria-label="Authored events">${rows}</ol>
    </section>`;
  };
  const apply = action => {
    const result = editTimelineDraft(history, action);
    if (result.status !== 'ready') {
      render('Event not changed: ' + result.issues.map(x => x.code).join(', '));
      return;
    }
    history = result.history;
    render('Timing draft updated. Not saved to the play.');
    onChange(history);
  };
  const click = e => {
    const action = e.target.closest?.('[data-action]')?.dataset.action;
    if (action === 'undo' || action === 'redo') apply({ type: action });
    const id = e.target.closest?.('[data-remove]')?.dataset.remove;
    if (id) apply({ type: 'remove-event', eventId: id });
  };
  const submit = e => {
    if (!e.target.matches?.('[data-timing-form]')) return;
    e.preventDefault();
    const f = new FormData(e.target);
    const eventId = String(f.get('eventId') || '');
    const atMs = Number(f.get('atMs')), sequence = Number(f.get('sequence'));
    if (!safeId(eventId) || !Number.isSafeInteger(atMs) || atMs < 0 ||
        !Number.isSafeInteger(sequence) || sequence < 0) {
      render('Invalid event ID, time or order'); return;
    }
    const kind = String(f.get('kind'));
    const event = { eventId, kind, actorId: String(f.get('actorId')), atMs, sequence };
    if (['pass-release', 'catch', 'catch-failed'].includes(kind))
      event.movementId = String(f.get('movementId') || '');
    if (kind === 'pass-release') event.receiverId = String(f.get('receiverId') || '');
    apply({ type: 'add-event', event });
  };
  root.addEventListener('click', click);
  root.addEventListener('submit', submit);
  render();
  return Object.freeze({
    getHistory: () => history,
    destroy: () => {
      root.removeEventListener('click', click);
      root.removeEventListener('submit', submit);
      root.replaceChildren();
    }
  });
}
