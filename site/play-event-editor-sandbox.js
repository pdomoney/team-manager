// E5.3.2b: opt-in, unsaved timing sandbox in the existing coach editor.
// The sandbox is a sibling of the play form, never a nested form.
import { createTimelineDraft } from './play-event-draft.js';
import { mapTimelineActor } from './play-event-actor-mapping.js';
import { mountCoachTimingControls } from './play-event-timing-controls.js';

export function attachCoachTimelineSandbox(playForm, { canCoachEdit } = {}) {
  if (!playForm || typeof canCoachEdit !== 'function' || !canCoachEdit())
    return null;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'btn sm';
  trigger.textContent = 'Event timing (draft)';
  trigger.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('section');
  panel.hidden = true;
  panel.className = 'ped-timing-sandbox';
  panel.setAttribute('aria-label', 'Unsaved event timing workspace');
  const heading = document.createElement('h3');
  heading.textContent = 'Event timing sandbox';
  const note = document.createElement('p');
  note.textContent = 'Experimental, unsaved event script. Closing the play editor discards it. Saving the play does not include these events.';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const mapping = document.createElement('form');
  mapping.innerHTML = `<label>Actor ID <input name="actorId" required maxlength="80" pattern="[a-zA-Z0-9][a-zA-Z0-9:_-]*"></label>
    <label>Actor type <select name="actorType"><option value="attacker">Attacker</option><option value="defender">Defender</option></select></label>
    <label>Phase index (0 is first) <input name="phaseIndex" type="number" min="0" step="1" value="0" required></label>
    <label>Diagram slot key <input name="slotKey" required maxlength="80" pattern="[a-zA-Z0-9][a-zA-Z0-9:_-]*"></label>
    <button type="submit">Assign actor explicitly</button>`;
  const mappingList = document.createElement('p');
  const timingRoot = document.createElement('div');
  panel.append(heading, note, status, mapping, mappingList, timingRoot);
  // The play form remains untouched; these independent forms cannot submit it.
  playForm.after(panel);
  // Keep the fixed-height diagram workspace and Fit geometry unchanged.
  // The optional sandbox is launched from Play details, not the top toolbar.
  playForm.querySelector('#ped-words')?.prepend(trigger);
  let history = createTimelineDraft().history;
  let controls = null;
  const refresh = () => {
    controls?.destroy();
    controls = mountCoachTimingControls(timingRoot, history, {
      onChange(next) { history = next; }
    });
    mappingList.textContent = history.present.actors.map(a =>
      a.actorId + ' (' + a.type + '): ' + a.phases.map(p =>
        'phase ' + p.phaseIndex + ' = ' + p.slotKey).join(', ')).join(' | ') ||
      'No actors assigned. Add an explicit mapping before authoring events.';
  };
  mapping.addEventListener('submit', event => {
    event.preventDefault();
    if (!canCoachEdit()) return;
    history = controls?.getHistory() || history;
    const values = new FormData(mapping);
    const phaseIndex = Number(values.get('phaseIndex'));
    const actorId = String(values.get('actorId') || '');
    const slotKey = String(values.get('slotKey') || '');
    if (!Number.isSafeInteger(phaseIndex) || phaseIndex < 0 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(actorId) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(slotKey)) {
      status.textContent = 'Mapping rejected: invalid actor, phase or slot'; return;
    }
    const outcome = mapTimelineActor(history, {
      type: 'assign', actorId, actorType: String(values.get('actorType')),
      phaseIndex, slotKey
    });
    if (outcome.status !== 'ready') {
      status.textContent = 'Mapping rejected: ' + outcome.issues.map(x => x.code).join(', ');
      return;
    }
    history = outcome.history;
    status.textContent = 'Mapping updated in unsaved sandbox only.';
    refresh();
  });
  trigger.addEventListener('click', () => {
    if (!canCoachEdit()) return;
    panel.hidden = !panel.hidden;
    trigger.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden && !controls) refresh();
  });
  return Object.freeze({
    getHistory: () => controls?.getHistory() || history,
    destroy: () => { controls?.destroy(); trigger.remove(); panel.remove(); }
  });
}
