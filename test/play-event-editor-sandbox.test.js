import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachCoachTimelineSandbox } from '../site/play-event-editor-sandbox.js';

function fakeElement() {
  const events = {};
  return {
    hidden: false, className: '', textContent: '', innerHTML: '',
    children: [], attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    append(...children) { this.children.push(...children); },
    addEventListener(k, fn) { events[k] = fn; },
    remove() { this.removed = true; },
    events
  };
}
test('E5.3.2b denies mounting timing workspace without coach authorisation', () => {
  const form = { querySelector: () => fakeElement(), after: () => { throw Error('mounted'); } };
  assert.equal(attachCoachTimelineSandbox(form, { canCoachEdit: () => false }), null);
  assert.equal(attachCoachTimelineSandbox(null, { canCoachEdit: () => true }), null);
});
test('E5.3.2b timing sandbox is a sibling of the existing save form', () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => fakeElement() };
  try {
    let panel;
    const top = fakeElement();
    const details = fakeElement();
    details.prepend = (...children) => { details.children.unshift(...children); };
    const form = {
      querySelector: selector => selector === '.ped-topline' ? top : selector === '#ped-words' ? details : null,
      after: value => { panel = value; }
    };
    const controller = attachCoachTimelineSandbox(form, { canCoachEdit: () => true });
    assert.ok(controller);
    assert.equal(panel.hidden, true);
    assert.equal(top.children.length, 0);
    assert.equal(details.children.length, 1);
    assert.equal(details.children[0].textContent, 'Event timing (draft)');
    assert.match(panel.children[1].textContent, /saved with the play/);
    assert.equal(panel.children[5].tagName, undefined); // fake DOM independent of browser tags
    assert.equal(controller.getHistory().present.events.length, 0);
    controller.destroy();
    assert.equal(panel.removed, true);
  } finally { globalThis.document = previous; }
});
test('E5.3.2b app integration preserves existing Save play code path', () => {
  const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
  assert.match(app, /attachCoachTimelineSandbox\(form, \{ canCoachEdit:/);
  assert.match(app, /if \(form && isCoach\(\)\)/);
  assert.match(app, /if \(i >= 0\) data\.plays\[i\] = E\.draft; else data\.plays\.push\(E\.draft\);/);
});
