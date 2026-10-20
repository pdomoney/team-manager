// Team colour styles and sport icons: every palette stays readable, stored styles are checked, and
// players get their team's sport and colours.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../site/model.js';
import { teamView } from '../site/vault.js';
import { TEAM_STYLES, CLASSIC, styleById, normStyle, resolveStyle, styleVars, STYLE_VARS, suggestStyle, contrast } from '../site/team-style.js';
import { SPORT_ICONS, sportIcon, sportMaskUrl } from '../site/sport-icons.js';

const WHITE = '#FFFFFF', CHALK = '#F4F5EF';
test('there are more than a dozen palettes, each with a name and swatch, and no club names', () => {
  assert.ok(TEAM_STYLES.length >= 13);
  assert.equal(new Set(TEAM_STYLES.map(s => s.id)).size, TEAM_STYLES.length);
  TEAM_STYLES.forEach(s => { assert.match(s.name, /^[A-Z][a-z]+( (Blue|Green))?( & [A-Z][a-z]+( [A-Z][a-z]+)?)?$/, s.name); assert.equal(s.swatch.length, 2); });
  assert.ok(CLASSIC.swatch);
});

test('every palette passes the readability rules', () => {
  for (const s of TEAM_STYLES) {
    const r = resolveStyle({ palette: s.id });
    assert.deepEqual(r.adjusted, [], `${s.id} needs no adjusting`);
    assert.ok(contrast(r.dark, WHITE) >= 7, `${s.id}: white on the header`);
    assert.ok(contrast(r.action, r.actionInk) >= 4.5, `${s.id}: button text`);
    assert.ok(contrast(r.actionEdge, CHALK) >= 3, `${s.id}: button edge on the page`);
    assert.ok(contrast(r.onDark, r.dark) >= 3, `${s.id}: a button on a dark card stands out`);
    assert.ok(contrast(r.onDark, r.onDarkInk) >= 4.5, `${s.id}: text on that button`);
    assert.ok(contrast(r.accent, r.dark) >= 3, `${s.id}: highlight on the header`);
    assert.ok(contrast(r.indicator, WHITE) >= 3, `${s.id}: selected-tab bar`);
  }
});

test('custom colours are adjusted until they pass, and say what changed', () => {
  const r = resolveStyle({ custom: { dark: '#88CCFF', action: '#FFEE00', accent: '#223344' } });
  assert.deepEqual(r.adjusted.sort(), ['accent', 'dark']);
  assert.ok(contrast(r.dark, WHITE) >= 7 && contrast(r.accent, r.dark) >= 3);
  assert.equal(r.actionInk, '#16201B', 'a pale button gets dark text');
  const mid = resolveStyle({ custom: { dark: '#123456', action: '#808080', accent: '#FFFFFF' } });
  assert.ok(contrast(mid.action, mid.actionInk) >= 4.5, 'a mid-grey button is darkened until a text colour passes');
  // The fallback button on a dark card must have readable text too,
  // even for a custom accent between the light/dark text thresholds.
  for (const accent of ['#888888','#777777','#989898','#AAAAAA']) {
    const custom = resolveStyle({ custom: { dark:'#0B2545', action:'#111111', accent } });
    assert.ok(contrast(custom.onDark, custom.onDarkInk) >= 4.5, accent + ' on-card text');
    assert.ok(contrast(custom.onDark, custom.dark) >= 3, accent + ' separated from header');
  }
  const ok = resolveStyle({ custom: { dark: '#0B2545', action: '#1C6FB5', accent: '#8DC8F0' } });
  assert.deepEqual(ok.adjusted, []);
});

test('stored styles: a known palette or three valid colours; anything else is the classic look', () => {
  assert.deepEqual(normStyle({ palette: 'maroon' }), { palette: 'maroon' });
  assert.deepEqual(normStyle({ custom: { dark: '#0b2545', action: '#1C6FB5', accent: '#8dc8f0' } }), { custom: { dark: '#0B2545', action: '#1C6FB5', accent: '#8DC8F0' } });
  for (const bad of [null, 'maroon', [], { palette: 'nope' }, { custom: { dark: 'red', action: '#000000', accent: '#FFFFFF' } }, { custom: { dark: '#000000' } }, { palette: '<script>' }])
    assert.equal(normStyle(bad), null, JSON.stringify(bad));
  assert.equal(resolveStyle(null), null);
  assert.deepEqual(styleVars(null), {});
  assert.deepEqual(Object.keys(styleVars(resolveStyle({ palette: 'lime' }))).sort(), [...STYLE_VARS].sort());
  assert.ok(STYLE_VARS.every(k => k.startsWith('--')));
});

test('a club’s colour words suggest the closest palette', () => {
  const cases = { 'Red and white': 'redwhite', 'Maroon & gold': 'maroon', 'Sky blue and navy': 'skynavy', 'Black and white': 'blackwhite', 'Green and gold': 'greengold',
    'Purple, gold': 'purple', 'Royal blue and gold': 'bluegold', 'Red and black': 'redblack', 'Navy and red': 'navyred', 'Lime green, navy': 'lime', 'Teal': 'teal',
    'Orange and black': 'orange', 'Claret and blue': 'claret', 'Brown and gold': 'brown', 'Black and gold': 'blackgold', 'Silver': 'ocean', '': '', 'Pink': '' };
  for (const [w, id] of Object.entries(cases)) assert.equal(suggestStyle(w), id, w);
  Object.values(cases).filter(Boolean).forEach(id => assert.ok(styleById(id), id));
});

test('upgrading keeps a valid style, drops a broken one, and changes nothing the second time', () => {
  const ws = M.migrateWorkspace({ schema: 4, id: 'team1', team: { name: 'A', style: { palette: 'maroon' } }, players: [], library: {},
    teams: [{ id: 'team2', team: { name: 'B', style: { palette: 'gone' } }, players: [] }, { id: 'team3', team: { name: 'C', style: { custom: { dark: '#0b2545', action: '#1c6fb5', accent: '#8dc8f0' } } }, players: [] }] });
  assert.deepEqual(ws.team.style, { palette: 'maroon' });
  assert.ok(!('style' in M.findTeam(ws, 'team2').team), 'an unknown palette is dropped');
  assert.equal(M.findTeam(ws, 'team3').team.style.custom.dark, '#0B2545');
  assert.equal(M.stable(M.migrateWorkspace(JSON.parse(JSON.stringify(ws)))), M.stable(ws));
  const plain = M.migrateWorkspace({ schema: 4, id: 'team1', team: { name: 'A' }, players: [], library: {}, teams: [] });
  assert.ok(!('style' in plain.team), 'no style is added to a team that had none');
});

test('players get the team’s sport and colours, nothing else new', () => {
  const ws = M.migrateWorkspace({ schema: 4, id: 'team1', team: { name: 'A', sport: 'Netball', style: { palette: 'purple' } }, players: [], library: {}, teams: [] });
  const v = teamView(M.activeLens(ws), null);
  assert.equal(v.team.sport, 'Netball');
  assert.deepEqual(v.team.style, { palette: 'purple' });
});

test('every sport has its own icon, made only of simple shapes', () => {
  M.SPORTS.forEach(s => assert.ok(SPORT_ICONS[s], s));
  assert.equal(new Set(Object.values(SPORT_ICONS)).size, Object.keys(SPORT_ICONS).length, 'no two sports share an icon');
  for (const [s, body] of Object.entries(SPORT_ICONS)) {
    const tags = [...body.matchAll(/<([a-z]+)/g)].map(m => m[1]);
    assert.ok(tags.length && tags.every(t => ['path', 'ellipse', 'circle', 'rect'].includes(t)), `${s}: ${tags}`);
    assert.ok(!/on[a-z]+=|href|script/i.test(body), s);
  }
  assert.match(sportIcon('AFL', 15), /^<svg class="sport-ic" width="15" height="15"[^>]*aria-hidden="true"/);
  assert.equal(sportIcon('Quidditch'), sportIcon('Other'), 'an unknown sport gets the whistle');
  M.SPORTS.forEach(s => { const u = sportMaskUrl(s); assert.ok(u.startsWith('url("data:image/svg+xml,') && !u.slice(5, -2).includes('"') && !u.includes("'"), s); });
});
