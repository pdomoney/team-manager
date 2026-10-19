// Sport icons: one per sport the app supports, drawn for this app in its own line style (24 px grid,
// 2 px rounded strokes, no fill). Each is generic equipment, not a league's or club's mark. They mark
// a team's sport quietly: beside the season in the header, as a badge on the club crest, on team
// chips and as a faint mark on Home's main card.
export const SPORT_ICONS = {
  // Shorts with a tag on each hip: the kit that makes Oztag Oztag
  'Oztag': '<path d="M7 4h10l1.2 12.5h-4.4L12 10.5l-1.8 6H5.8z"/><path d="M7 7h10"/><path d="M4.8 8.5 3.6 19.5l1.5-.8"/><path d="M19.2 8.5l1.2 11-1.5-.8"/>',
  // An open hand: the touch
  'Touch football': '<path d="M8.5 12.5V5.8a1.6 1.6 0 0 1 3.2 0v5.2"/><path d="M11.7 10.5V4.6a1.6 1.6 0 0 1 3.2 0v6.4"/><path d="M14.9 10.8V6.6a1.6 1.6 0 0 1 3.2 0v7.4a6.5 6.5 0 0 1-6.5 6.5h-.9a6 6 0 0 1-4.6-2.2L3.6 14a1.7 1.7 0 0 1 2.6-2.2l2.3 2.6"/>',
  // A league ball with a tag hanging from it
  'League tag': '<ellipse cx="10" cy="10" rx="7.2" ry="4.4" transform="rotate(-45 10 10)"/><path d="M7.4 12.6l5.2-5.2"/><path d="M15 15.2 17.6 21l1-1.6 1.9.6-2.6-5.8"/>',
  // A rugby ball: seam and stitches
  'Rugby league': '<ellipse cx="12" cy="12" rx="9.4" ry="5.6" transform="rotate(-45 12 12)"/><path d="M8.6 15.4l6.8-6.8"/><path d="M10.2 11.8l2 2"/><path d="M11.8 10.2l2 2"/>',
  // H-posts with the ball sailing through
  'Rugby union': '<path d="M6.5 3v18"/><path d="M17.5 3v18"/><path d="M6.5 14h11"/><ellipse cx="12" cy="8" rx="3.2" ry="1.9" transform="rotate(-35 12 8)"/>',
  // A ball and a seven
  'Rugby sevens': '<ellipse cx="8.5" cy="14.5" rx="6" ry="3.7" transform="rotate(-45 8.5 14.5)"/><path d="M6.4 16.6l4.2-4.2"/><path d="M13.5 4h7l-4.5 11"/>',
  // A ball and a belt with its tag
  'Tag rugby': '<ellipse cx="9.5" cy="9.5" rx="6.6" ry="4" transform="rotate(-45 9.5 9.5)"/><path d="M7.2 11.8l4.6-4.6"/><path d="M14 15h7"/><path d="M15.5 15v6l1.2-1 1.2 1v-6"/>',
  // Four goal posts, the inner two taller, and the ball between them
  'AFL': '<path d="M9 3v18"/><path d="M15 3v18"/><path d="M4 10v11"/><path d="M20 10v11"/><ellipse cx="12" cy="9" rx="1.6" ry="2.6" transform="rotate(25 12 9)"/>',
  // A ring and net on a post, no backboard
  'Netball': '<path d="M19.5 21V4.5"/><path d="M19.5 6.5h-2.5"/><ellipse cx="11" cy="6.5" rx="6" ry="1.8"/><path d="M5.6 7.3 7.6 14h6.8l2-6.7"/><path d="M8.6 8.3l1.4 5.7"/><path d="M13.4 8.3 12 14"/>',
  // A football: a centre panel and its seams
  'Football (soccer)': '<circle cx="12" cy="12" r="9"/><path d="M12 8.2l3.6 2.6-1.4 4.2H9.8l-1.4-4.2z"/><path d="M12 8.2V3"/><path d="M15.6 10.8l4.8-1.6"/><path d="M14.2 15l3 4.1"/><path d="M9.8 15l-3 4.1"/><path d="M8.4 10.8 3.6 9.2"/>',
  // A basketball's lines
  'Basketball': '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M3 12h18"/><path d="M5.8 5.5c2.9 3.3 2.9 9.7 0 13"/><path d="M18.2 5.5c-2.9 3.3-2.9 9.7 0 13"/>',
  // A hockey stick and ball
  'Hockey': '<path d="M15.5 3 9.4 17.2a2.6 2.6 0 0 1-4.6.5"/><path d="M4.8 17.7 3.9 16"/><circle cx="17.5" cy="18" r="2.4"/>',
  // A cricket bat and ball
  'Cricket': '<path d="M14.2 7.2l2.6 2.6-10 10a1.84 1.84 0 0 1-2.6-2.6z"/><path d="M15.5 8.5 20 4"/><path d="M18.8 2.8l2.4 2.4"/><circle cx="7" cy="6.5" r="2.4"/>',
  // A whistle, for any other sport
  'Other': '<path d="M3 9h11a5 5 0 1 1-4.8 6.4L8 12.5H3z"/><circle cx="14" cy="14" r="1.4"/><path d="M14 9V6.5"/>',
};
export const sportIconBody = sport => SPORT_ICONS[sport] || SPORT_ICONS.Other;
// Inline SVG for a sport, decorative (the sport's name is always shown or read out elsewhere).
export const sportIcon = (sport, size = 24, cls = 'sport-ic') => `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${sportIconBody(sport)}</svg>`;
// The same icon as a CSS url(), for a mask (it takes the element's colour).
export const sportMaskUrl = sport => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${sportIconBody(sport)}</svg>`).replace(/'/g, '%27')}")`;
