import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../site/styles.css', import.meta.url), 'utf8');
const block = selector => {
  const start = css.indexOf(selector + '{');
  assert.ok(start >= 0, `Missing selector: ${selector}`);
  const end = css.indexOf('}', start);
  assert.ok(end > start, `Missing block end: ${selector}`);
  return css.slice(start, end);
};
const hex = (selector, property) => {
  const declaration = block(selector).match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*(#[0-9a-fA-F]{6})`, 'i'));
  assert.ok(declaration, `Missing ${property} for ${selector}`);
  return declaration[1];
};
const lightness = color => {
  const values = color.slice(1).match(/../g).map(part => parseInt(part, 16) / 255);
  const linear = values.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const ratio = (a, b) => {
  const values = [lightness(a), lightness(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test('inactive player codes use dark ink against pale board circles', () => {
  const circle = hex('.play-presentation .pf .pl', 'fill');
  const text = hex('.play-presentation .pf .idle + .plt', 'fill');
  assert.ok(ratio(circle, text) >= 4.5, `Inactive player label contrast ${ratio(circle, text).toFixed(2)}:1 is too low`);
});

test('ghost player codes use light ink against dark dashed board circles', () => {
  const circle = hex('.play-presentation .pf', '--pf-turf');
  const text = hex('.play-presentation .pf .ghost + .plt', 'fill');
  assert.ok(ratio(circle, text) >= 4.5, `Ghost player label contrast ${ratio(circle, text).toFixed(2)}:1 is too low`);
});

test('focused player codes remain dark on the amber coaching circle', () => {
  const circle = hex('.play-presentation .pf .pl.focus', 'fill');
  const text = hex('.play-presentation .pf .plt', 'fill');
  assert.ok(ratio(circle, text) >= 4.5, `Focused player label contrast ${ratio(circle, text).toFixed(2)}:1 is too low`);
});
