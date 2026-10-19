// Accreditation badges for match-day volunteers: one badge for the Working With Children Check and
// one for each match-day role a person holds in a sport, each showing whether it's current, expiring
// soon, expired or not yet checked. They summarise what the coach has recorded; they don't verify
// anything with a governing body.
import { CREW_ROLES, normCrewPerson, crewRolesForSport, crewRoleNeedsAccreditation, crewAccreditationExpiry } from './match-crew.js';

export const SOON_DAYS = 60;
export const BADGE_STATUS = {
  current: 'Current', role: 'Role held', expiring: 'Expires soon', expired: 'Expired', unverified: 'Not checked'
};
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : '';
const statusOf = (expiry, today, soon) => !expiry ? 'unverified' : expiry < today ? 'expired' : expiry <= soon ? 'expiring' : 'current';

// The badges for one person in one sport, Working With Children Check first, then each role held.
// A role that needs no accreditation (team manager, say) shows as held; one that does is judged by
// its recorded expiry against `today` (ISO date).
export function crewBadges(person, sport, today, { soonDays = SOON_DAYS } = {}) {
  const p = normCrewPerson(person), soon = addDays(today, soonDays);
  const wwcc = p.wwccStatus === 'checked' ? statusOf(p.wwccExpiry, today, soon) : 'unverified';
  const out = [{ key: 'wwcc', label: 'Working With Children Check', expiry: p.wwccStatus === 'checked' ? p.wwccExpiry : '', status: wwcc }];
  crewRolesForSport(p, sport).forEach(role => {
    const needs = crewRoleNeedsAccreditation(role, sport), expiry = needs ? crewAccreditationExpiry(p, sport, role) || '' : '';
    out.push({ key: role, label: CREW_ROLES[role], expiry, status: needs ? statusOf(expiry, today, soon) : 'role' });
  });
  return out.map(b => ({ ...b, text: badgeText(b) }));
}
// Words for a badge, for screen readers, tooltips and lists.
export function badgeText(b) {
  const d = fmtDate(b.expiry);
  if (b.status === 'role') return `${b.label}: role held`;
  if (b.status === 'unverified') return `${b.label}: ${b.key === 'wwcc' ? 'not checked by the club' : 'expiry not recorded'}`;
  if (b.status === 'expired') return `${b.label}: expired ${d}`;
  if (b.status === 'expiring') return `${b.label}: expires soon, ${d}`;
  return `${b.label}: current until ${d}`;
}
// A one-line count: "3 current · 1 expires soon · 1 expired".
export function badgeSummary(badges) {
  const n = k => badges.filter(b => (k === 'current' ? ['current', 'role'].includes(b.status) : b.status === k)).length;
  return [['current', 'current'], ['expiring', 'expire soon'], ['expired', 'expired'], ['unverified', 'not checked']]
    .map(([k, w]) => [n(k), w]).filter(([c]) => c).map(([c, w]) => `${c} ${c === 1 && w === 'expire soon' ? 'expires soon' : w}`).join(' · ');
}
// The badges a person holds in every sport they have roles in (or the given sport for older records).
export function crewBadgesBySport(person, today, fallbackSport) {
  const p = normCrewPerson(person), sports = Object.keys(p.rolesBySport).length ? Object.keys(p.rolesBySport) : (p.roles.length && fallbackSport ? [fallbackSport] : []);
  return sports.map(sport => ({ sport, badges: crewBadges(p, sport, today) }));
}

/* ----- The badges themselves: a coloured disc with a glyph, and a corner mark for the status ----- */
// Shirt colours follow the rugby league convention the shirt roles are named after.
const GLYPH = {
  whistle: '<path d="M3 9h11a5 5 0 1 1-4.8 6.4L8 12.5H3z"/><circle cx="14" cy="14" r="1.4"/><path d="M14 9V6.5"/>',
  clipboard: '<rect x="5.5" y="4.5" width="13" height="16" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/>',
  shirt: '<path d="M8.6 3.5 4 6.2 2.6 10.6l3 1.3L7 10.4v10.1h10V10.4l1.4 1.5 3-1.3L20 6.2l-4.6-2.7c-.6 1.5-1.9 2.4-3.4 2.4s-2.8-.9-3.4-2.4z"/>',
  cross: '<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z"/>',
  lanyard: '<path d="M8 3l4 7 4-7"/><rect x="6.5" y="10" width="11" height="11" rx="2"/><path d="M10 15.5h4"/>',
  flag: '<path d="M6 21V3.5"/><path d="M6 4h11.5l-2.8 4.2 2.8 4.3H6"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6z"/>',
};
export const BADGE_LOOK = {
  wwcc: { glyph: 'shield', bg: '#33415C', fg: '#FFFFFF' },
  coach: { glyph: 'whistle', bg: '#1B2A4A', fg: '#FFFFFF' },
  assistant: { glyph: 'whistle', bg: '#5A6B7D', fg: '#FFFFFF' },
  manager: { glyph: 'clipboard', bg: '#0F6E76', fg: '#FFFFFF' },
  yellow: { glyph: 'shirt', bg: '#F2C200', fg: '#16201B' },
  green: { glyph: 'shirt', bg: '#2E8B4E', fg: '#FFFFFF' },
  blue: { glyph: 'shirt', bg: '#2F7FD0', fg: '#FFFFFF' },
  orange: { glyph: 'shirt', bg: '#D9600F', fg: '#FFFFFF' },
  firstAid: { glyph: 'cross', bg: '#FFFFFF', fg: '#23804A', ring: '#23804A', fill: true },
  matchDelegate: { glyph: 'lanyard', bg: '#6B4423', fg: '#FFFFFF' },
  groundMarshal: { glyph: 'flag', bg: '#3D5A80', fg: '#FFFFFF' },
};
const MARK = {
  expiring: '<circle cx="26" cy="6" r="5.6" fill="#B26A00" stroke="#fff" stroke-width="1.4"/><path d="M26 3.4V6l1.8 1.2" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
  expired: '<circle cx="26" cy="6" r="5.6" fill="#C0283A" stroke="#fff" stroke-width="1.4"/><path d="M26 3.2v3.4" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="26" cy="8.9" r=".95" fill="#fff"/>',
  unverified: '<circle cx="26" cy="6" r="5.6" fill="#6B756F" stroke="#fff" stroke-width="1.4"/><path d="M24.3 4.6a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.5-.7 1v.3" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="26" cy="9.3" r=".8" fill="#fff"/>',
};
// The badge as an SVG string (decorative: the caller gives it a text label). Expired and unchecked
// badges are greyed out; the corner mark says which, so colour is never the only cue.
export function badgeSvg(key, status, size = 28) {
  const L = BADGE_LOOK[key] || BADGE_LOOK.coach, faded = status === 'expired' || status === 'unverified';
  // Faded badges keep a ring in the role's colour, so you can still tell which shirt or role it is.
  const bg = faded ? '#FFFFFF' : L.bg, fg = faded ? '#7D8781' : L.fg, ring = L.ring || L.bg;
  const glyph = (key === 'wwcc' && !faded ? GLYPH.shield + '<path d="M9 12.2l2.2 2.2 4.3-4.4"/>' : GLYPH[L.glyph]);
  const paint = L.fill && !faded ? `fill="${fg}" stroke="none"` : `fill="none" stroke="${fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg class="cbadge-svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="16" cy="16" r="14.4" fill="${bg}" stroke="${ring}" stroke-width="${faded ? 2.2 : 1.6}"${status === 'unverified' ? ' stroke-dasharray="3.2 2.4"' : ''}/>
    <g transform="translate(6.4 6.4) scale(.8)" ${paint}>${glyph}</g>${MARK[status] || ''}</svg>`;
}
