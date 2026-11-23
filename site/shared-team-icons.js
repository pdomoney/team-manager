// Original Team Manager icon artwork, shared unchanged by both experiences.
export const TEAM_ICONS=Object.freeze({
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M20.5 11.5a8 8 0 0 1-11.6 7.2L3.5 20l1.4-4.8a8 8 0 1 1 15.6-3.7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 13v6.5h14V13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cog: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.5c2.5.1 4.2 1.8 5 5"/>',
  rsvp: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .5 4.1 1.3"/><path d="M15 17.5l2 2 4.5-4.5"/>',
  layers: '<path d="M12 3.5 2.5 8.5 12 13.5l9.5-5z"/><path d="M2.5 12.5l9.5 5 9.5-5"/><path d="M2.5 16.5l9.5 5 9.5-5"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  edit: '<path d="M4 20h4L19.3 8.7a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  field: '<rect x="4.5" y="3" width="15" height="18" rx="1.5"/><path d="M4.5 12h15"/><circle cx="12" cy="12" r="2.5"/>',
  back: '<path d="M15 6l-6 6 6 6"/>'
});
export function teamIconSvg(name,size=22){
 if(!Object.prototype.hasOwnProperty.call(TEAM_ICONS,name))throw new TypeError('unknown-icon');
 if(!Number.isInteger(size)||size<12||size>40)throw new TypeError('invalid-size');
 return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+TEAM_ICONS[name]+'</svg>';
}
