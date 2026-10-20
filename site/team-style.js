// Team colour styles: the colours a team's app wears (header, main cards, buttons and highlights),
// for the coach and for its players. Palettes are colour pairings common in Australian and New
// Zealand sport, named by colour only: no club names, logos or official branding.
//
// Only the team's own colours change. Colours that carry meaning never do: green / orange / red for
// OK / check / problem, gold and blue for the F / M badges, the tag red for critical items and the
// grass greens on the field diagrams.
//
// A team's choice is stored as team.style = { palette: '<id>' } or { custom: { dark, action, accent } }.
// The club can provide the shared default; a team.style override takes precedence.
// No style is the classic look. Every resolved style is checked for contrast; custom colours are
// adjusted until they pass, never stored as unreadable.

export const TEAM_STYLES = [
  { id: 'pitch', name: 'Pitch Green', dark: '#123D2B', action: '#1F7A4D', accent: '#FFD24D', swatch: ['#123D2B', '#FFD24D'] },
  { id: 'redwhite', name: 'Red & White', dark: '#7D0F1D', action: '#C8102E', accent: '#FFFFFF', swatch: ['#C8102E', '#FFFFFF'] },
  { id: 'maroon', name: 'Maroon & Gold', dark: '#4E0B27', action: '#7A1438', accent: '#F2B705', swatch: ['#6D1236', '#F2B705'] },
  { id: 'skynavy', name: 'Sky Blue & Navy', dark: '#0B2545', action: '#1C6FB5', accent: '#8DC8F0', swatch: ['#6CACE4', '#0B2545'] },
  { id: 'blackwhite', name: 'Black & White', dark: '#111111', action: '#2A2A2A', accent: '#FFFFFF', swatch: ['#111111', '#FFFFFF'] },
  { id: 'greengold', name: 'Green & Gold', dark: '#00573F', action: '#00843D', accent: '#FFCD00', swatch: ['#00843D', '#FFCD00'] },
  { id: 'purple', name: 'Purple & Gold', dark: '#2E0F4F', action: '#5B2A86', accent: '#F5B800', swatch: ['#5B2A86', '#F5B800'] },
  { id: 'bluegold', name: 'Royal Blue & Gold', dark: '#002B5C', action: '#0050A0', accent: '#FFC72C', swatch: ['#0050A0', '#FFC72C'] },
  { id: 'redblack', name: 'Red & Black', dark: '#151515', action: '#C8102E', accent: '#FF5A6A', swatch: ['#C8102E', '#151515'] },
  { id: 'navyred', name: 'Navy & Red', dark: '#0C1E3E', action: '#C8102E', accent: '#FF7A85', swatch: ['#0C1E3E', '#C8102E'] },
  { id: 'lime', name: 'Lime & Navy', dark: '#0E2240', action: '#8CC63F', accent: '#B4E33D', swatch: ['#8CC63F', '#0E2240'] },
  { id: 'teal', name: 'Teal & Black', dark: '#0F1E24', action: '#00818A', accent: '#3CC8C8', swatch: ['#00818A', '#0F1E24'] },
  { id: 'orange', name: 'Orange & Charcoal', dark: '#262626', action: '#C2410C', accent: '#FF8A3D', swatch: ['#F26B21', '#262626'] },
  { id: 'claret', name: 'Claret & Sky', dark: '#4A0D2B', action: '#7A1E48', accent: '#7CC4F0', swatch: ['#7A1E48', '#7CC4F0'] },
  { id: 'brown', name: 'Brown & Gold', dark: '#3D2314', action: '#6B4423', accent: '#F2B705', swatch: ['#4D2C17', '#F2B705'] },
  { id: 'ocean', name: 'Ocean & Silver', dark: '#0A2342', action: '#1B6CA8', accent: '#C9D3DC', swatch: ['#1B6CA8', '#C9D3DC'] },
  { id: 'blackgold', name: 'Black & Gold', dark: '#141414', action: '#2B2B2B', accent: '#FDB913', swatch: ['#141414', '#FDB913'] },
  // Generic options, not claims about a specific club's current branding.
  { id: 'bluewhite', name: 'Royal Blue & White', dark: '#102D60', action: '#1F52A3', accent: '#FFFFFF', swatch: ['#1F52A3', '#FFFFFF'] },
  { id: 'greenwhite', name: 'Green & White', dark: '#143F2F', action: '#19764B', accent: '#FFFFFF', swatch: ['#19764B', '#FFFFFF'] },
  { id: 'navywhite', name: 'Navy & White', dark: '#111F3C', action: '#234C82', accent: '#FFFFFF', swatch: ['#111F3C', '#FFFFFF'] },
  { id: 'redgold', name: 'Red & Gold', dark: '#641620', action: '#BB2435', accent: '#FFCC46', swatch: ['#BB2435', '#FFCC46'] },
  { id: 'purplewhite', name: 'Purple & White', dark: '#321B54', action: '#694299', accent: '#FFFFFF', swatch: ['#694299', '#FFFFFF'] },
  { id: 'redbluewhite', name: 'Red, Blue & White', dark: '#0B2C50', action: '#B32239', accent: '#FFFFFF', swatch: ['#B32239', '#1C63A1'] },
  { id: 'royalskyred', name: 'Royal Blue, Sky & Red', dark: '#0D3061', action: '#176BA4', accent: '#FFBFC3', swatch: ['#2375B7', '#E44550'] },
];
// The classic look (no style chosen), for the chooser's first swatch.
export const CLASSIC = { name: 'Classic', dark: '#123D2B', action: '#1D6B45', accent: '#FFD24D', swatch: ['#123D2B', '#FFD24D'] };
export const styleById = id => TEAM_STYLES.find(s => s.id === id) || null;

const HEX = /^#[0-9a-f]{6}$/i;
const WHITE = '#FFFFFF', INK = '#16201B', CHALK = '#F4F5EF';
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const luminance = hex => {
  const [r, g, b] = channels(hex).map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Mix a colour towards black (k < 1) or towards white (mixWhite).
const darken = (hex, k) => toHex(channels(hex).map(v => v * k));
const mixWhite = (hex, t) => toHex(channels(hex).map(v => v + (255 - v) * t));
const until = (hex, ok, step) => { let c = hex; for (let i = 0; i < 40 && !ok(c); i++) c = step(c); return c; };

// What's stored: a known palette, or three valid custom colours. Anything else is no style.
export function normStyle(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  if (typeof v.palette === 'string' && styleById(v.palette)) return { palette: v.palette };
  const c = v.custom;
  if (c && typeof c === 'object' && ['dark', 'action', 'accent'].every(k => HEX.test(String(c[k] || ''))))
    return { custom: { dark: c.dark.toUpperCase(), action: c.action.toUpperCase(), accent: c.accent.toUpperCase() } };
  return null;
}

// A club supplies a shared look to all its teams. Existing explicit team styles
// remain authoritative until the club administrator elects to reset them.
export const effectiveStyle = (team, club) => normStyle(team?.style) || normStyle(club?.style);

 // Everything the page needs, with each rule checked:
//  - white text on the header and dark cards: at least 7:1 (a lot of small text sits there)
//  - text on main buttons: at least 4.5:1 (white or dark ink, whichever passes)
//  - a button's edge against the page, and the selected-tab bar against white: at least 3:1
//  - buttons on dark cards stand out from the card by at least 3:1 (the highlight colour if not)
//  - the highlight on the header: at least 3:1
// Returns null for the classic look. `adjusted` lists the custom colours that had to change.
export function resolveStyle(v) {
  const s = normStyle(v); if (!s) return null;
  const base = s.palette ? styleById(s.palette) : { id: 'custom', name: 'Custom', ...s.custom };
  const adjusted = [];
  const dark = until(base.dark, c => contrast(c, WHITE) >= 7, c => darken(c, 0.9));
  if (dark !== base.dark) adjusted.push('dark');
  let action = base.action;
  if (contrast(action, WHITE) < 4.5 && contrast(action, INK) < 4.5) { action = until(action, c => contrast(c, WHITE) >= 4.5, c => darken(c, 0.92)); adjusted.push('action'); }
  const actionInk = contrast(action, WHITE) >= 4.5 ? WHITE : INK;
  const accent = until(base.accent, c => contrast(c, dark) >= 3, c => mixWhite(c, 0.15));
  if (accent !== base.accent) adjusted.push('accent');
  const actionEdge = until(action, c => contrast(c, CHALK) >= 3, c => darken(c, 0.88));
  // An accent can separate from the dark header at 3:1 but still be unreadable
  // with either text colour. Resolve the final on-card button independently.
  let onDark = contrast(action, dark) >= 3 ? action : accent;
  if (Math.max(contrast(onDark, WHITE), contrast(onDark, INK)) < 4.5) {
    onDark = until(onDark, c => contrast(c, INK) >= 4.5 && contrast(c, dark) >= 3, c => mixWhite(c, 0.15));
    if (!adjusted.includes('onDark')) adjusted.push('onDark');
  }
  const onDarkInk = contrast(onDark, WHITE) >= 4.5 ? WHITE : INK;
  return {
    id: base.id, name: base.name, dark, dark2: darken(dark, 0.75), dark3: mixWhite(dark, 0.12), action, actionInk,
    actionHover: darken(action, 0.88), actionEdge, accent, onDark, onDarkInk,
    indicator: contrast(action, WHITE) >= 3 ? action : dark, adjusted
  };
}
// The CSS custom properties for a resolved style (the stylesheet's defaults are the classic look).
export const styleVars = r => r ? {
  '--pitch': r.dark, '--pitch-2': r.dark2, '--pitch-3': r.dark3, '--team-action': r.action, '--team-action-ink': r.actionInk,
  '--team-action-hover': r.actionHover, '--team-action-edge': r.actionEdge, '--team-accent': r.accent,
  '--team-on-dark': r.onDark, '--team-on-dark-ink': r.onDarkInk, '--team-indicator': r.indicator
} : {};
export const STYLE_VARS = Object.keys(styleVars(resolveStyle({ palette: 'pitch' })));

// A palette to suggest from colours written as words (a club's "Red and white", say). '' if none fits.
const MATCH = [
  [['maroon'], 'maroon'], [['claret'], 'claret'], [['burgundy'], 'claret'], [['lime'], 'lime'], [['teal'], 'teal'], [['aqua'], 'teal'],
  [['purple'], 'purple'], [['orange'], 'orange'], [['brown'], 'brown'], [['silver'], 'ocean'],
  [['sky'], 'skynavy'], [['light', 'blue'], 'skynavy'],
  [['royal', 'sky', 'red'], 'royalskyred'], [['blue', 'sky', 'red'], 'royalskyred'],
  [['red', 'blue', 'white'], 'redbluewhite'], [['red', 'gold'], 'redgold'], [['purple', 'white'], 'purplewhite'],
  [['green', 'white'], 'greenwhite'], [['navy', 'white'], 'navywhite'], [['blue', 'white'], 'bluewhite'],
  [['red', 'black'], 'redblack'], [['navy', 'red'], 'navyred'], [['blue', 'red'], 'navyred'], [['red', 'white'], 'redwhite'],
  [['black', 'white'], 'blackwhite'], [['black', 'gold'], 'blackgold'], [['black', 'yellow'], 'blackgold'],
  [['green', 'gold'], 'greengold'], [['green', 'yellow'], 'greengold'], [['blue', 'gold'], 'bluegold'], [['blue', 'yellow'], 'bluegold'],
  [['navy'], 'skynavy'], [['red'], 'redwhite'], [['green'], 'pitch'], [['blue'], 'bluegold'], [['black'], 'blackwhite']
];
export function suggestStyle(words) {
  const w = new Set(String(words || '').toLowerCase().match(/[a-z]+/g) || []);
  const hit = MATCH.find(([need]) => need.every(x => w.has(x)));
  return hit ? hit[1] : '';
}
