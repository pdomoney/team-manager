// Coach-only tactical translation guide. Preserves the source play and its geometry.
// A concept is transferable; a field diagram, role, restart or legal move is NOT
// automatically transferred across codes. No rule-compliance certification.
export const TRANSFER_SPORTS = Object.freeze([
  'Oztag', 'Touch football', 'League tag', 'Rugby league', 'Rugby union'
]);

export const SPORT_CHECKS = Object.freeze({
  'Oztag': {
    restarts: 'A tag is followed by an Oztag play-the-ball and a dummy-half; account for the marker and defenders retiring under the applicable competition rules.',
    field: 'Eight-a-side diagram roles and Oztag spacing; check the field, tag count and local competition conditions.',
    skills: 'Check legal contact, who can score, dummy-half rights and timing of the kick. Kicks are restricted after a tag.',
    role: 'Replace role titles with this team’s Oztag positions and check the width of every supporting line.'
  },
  'Touch football': {
    restarts: 'Translate play-the-ball to a rollball and an acting half; check when defenders may advance and whether the acting half may run or score.',
    field: 'Use the appropriate six-a-side touch shape and onside distances. An eight-player diagram is not a touch formation.',
    skills: 'Remove tackling, tagging and rugby-style kicks from the execution. Rehearse the touch count and legal rollball.',
    role: 'Map the distributor, middles, links and wings explicitly; eight Oztag circles do not establish a six-player touch lineup.'
  },
  'League tag': {
    restarts: 'Confirm the governing local league-tag restart, tag/marker, count and dummy-half rules: formats and age-group modifications can differ.',
    field: 'Check player number and roles for the age division; an eight-player diagram cannot represent a full league-tag team.',
    skills: 'Remove tackle/contact assumptions and verify local league-tag kicking, tagging and scoring requirements before teaching.',
    role: 'Choose a distributor and the appropriate supports for this team, rather than transferring Oztag slot names literally.'
  },
  'Rugby league': {
    restarts: 'A completed tackle leads to the league play-the-ball and a dummy-half; marker positioning and tackle-count decisions matter.',
    field: 'Build a 13-player formation, or the age-appropriate modified version, around the translated action. The eight-slot source is only a sketch.',
    skills: 'Rework contact, obstruction, kick timing, offside, tackle count and any age-specific participation rules.',
    role: 'Identify hooker/dummy-half, halves, edges and outside backs by the target team’s system, not by matching number to Oztag slot.'
  },
  'Rugby union': {
    restarts: 'A tackled player, the breakdown and the possible formation of a ruck are not a rugby league play-the-ball or touch rollball.',
    field: 'Use the appropriate 15-player, sevens or junior format with its distinct forward/back shapes; the source diagram is only a concept.',
    skills: 'Review tackle and ruck entry, contest for possession, offside, blocking/obstruction and possible set-piece implications.',
    role: 'Reassign decision-makers, first receiver and support runners to scrum-half, fly-half, forwards and backs as appropriate.'
  }
});
const ACTIONS = Object.freeze([
  { key:'run', title:'Running and support lines', detail:'Preserve the timing of a runner attacking space and the support arriving outside or inside.', evidence:['run'] },
  { key:'pass', title:'Passing sequence', detail:'Keep the draw-and-pass decision, but adapt the number of receivers and the available passing lanes.', evidence:['pass'] },
  { key:'dummy', title:'Dummy or decoy decision', detail:'Retain the defensive question created by a dummy or decoy; review obstruction and offside.', evidence:['dummy'] },
  { key:'shift', title:'Defensive movement and reads', detail:'Keep the intention to attract a defender and attack the space they leave, with code-appropriate defensive spacing.', evidence:['shift'] },
  { key:'kick', title:'Kicking option', detail:'The intention to exploit space may transfer, but the kick itself is not transferable without checking the target sport.', evidence:['kick'] }
]);
const PATTERNS = Object.freeze([
  { key:'overlap',title:'Create an overlap',rx:/\b(overlap|extra player|numbers up|outnumber)\b/i,detail:'Create a numerical advantage at the edge, then choose the free runner.' },
  { key:'wrap',title:'Wraparound / second receiver',rx:/\b(wrap|out.the.back|around the back)\b/i,detail:'A supporting runner receives behind or outside the first attacking line.' },
  { key:'switch',title:'Change of running angle',rx:/\b(switch|unders|inside line|cut back|change(?:s|d)? (?:the )?angle)\b/i,detail:'Use a change of angle to challenge the defender’s inside shoulder.' },
  { key:'half',title:'Quick restart distribution',rx:/\b(dummy half|acting half|rollball|play.the.ball|ruck)\b/i,detail:'The receiver at the restart creates tempo and a second attacking decision.' },
  { key:'decoy',title:'Decoy or shape manipulation',rx:/\b(decoy|dummy runner|block(?:ing)? line)\b/i,detail:'Use a legal decoy to influence a defender while another runner attacks the gap.' }
]);
const words = v => String(v ?? '');
const parts = play => [play, ...(Array.isArray(play?.phases) ? play.phases : [])].filter(x => x && typeof x === 'object');
const conceptText = play => parts(play).flatMap(p => [p.name,p.headline,p.when,p.steps,p.title])
  .filter(x => typeof x === 'string').join(' ').slice(0,24000);
const moves = play => parts(play).flatMap(p => Array.isArray(p.moves) ? p.moves : []).filter(x => x && typeof x === 'object');
export function playMechanics(play) {
  const kinds = new Set(moves(play).map(m => m.t));
  const observations = ACTIONS.filter(a => a.evidence.some(k => kinds.has(k))).map(a => ({
    key:a.key,title:a.title,detail:a.detail,basis:'Drawn movement'
  }));
  const text = conceptText(play);
  return observations.concat(PATTERNS.filter(p => p.rx.test(text)).map(p => ({
    key:p.key,title:p.title,detail:p.detail,basis:'Written description — coach to confirm'
  })));
}
export function transferGuide(play, sourceSport, targetSport) {
  const source = TRANSFER_SPORTS.includes(sourceSport) ? sourceSport : 'Oztag';
  const target = TRANSFER_SPORTS.includes(targetSport) ? targetSport : null;
  if (!target || target === source) return null;
  const detected = playMechanics(play);
  const guide = SPORT_CHECKS[target];
  const kicker = moves(play).some(m => m.t === 'kick');
  const warnings = [
    'This guide transfers coaching concepts only. It does not convert player positions, movement coordinates, field size, restart timing or the legal status of the play.',
    'The current play renderer uses eight Oztag-shaped diagram slots regardless of label list. Do not present it as a complete target-sport formation.',
    'Review all details against the current governing body and competition/age-group rules before coaching or sharing an adaptation.'
  ];
  if (target === 'Touch football' && kicker) warnings.push('The source contains a kick. Do not carry the kick into a standard touch football play.');
  if (target === 'Rugby union' && /\b(dummy half|rollball|play.the.ball|tag(?:ged)?|touch(?:ed)?)\b/i.test(conceptText(play)))
    warnings.push('The source uses a league/tag/touch restart. Replace this phase with a correctly coached union tackle and breakdown scenario.');
  if (source === 'Rugby union' && target !== 'Rugby union')
    warnings.push('Union breakdown and set-piece mechanics are not the same as league/tag/touch restarts.');
  return {
    source,target,detected,warningCount:warnings.length,warnings,
    adjustments: [
      {title:'Restart and possession',text:guide.restarts},
      {title:'Numbers, spacing and formation',text:guide.field},
      {title:'Legal execution',text:guide.skills},
      {title:'Positions and supporting roles',text:guide.role}
    ],
    confidence:'Coach review required'
  };
}
export function transferBrief(play, guide, coachNote = '') {
  if (!guide) return '';
  const observations = guide.detected.length
    ? guide.detected.map(x => '- ' + x.title + ': ' + x.detail + ' (' + x.basis + ')').join('\n')
    : '- No reliably identifiable mechanic in the drawing or description. Coach should describe the original intention first.';
  return [
    'PLAY ADAPTATION — CONCEPT ONLY',
    'Source play: ' + words(play?.name).slice(0,160),
    'From ' + guide.source + ' to ' + guide.target,
    '',
    'Transferable concepts',
    observations,
    '',
    'Adaptation checks',
    ...guide.adjustments.map(x => '- ' + x.title + ': ' + x.text),
    '',
    'Coach notes',
    words(coachNote).trim() || '(Not yet reviewed by coach)',
    '',
    'Not a match-ready formation or official rules assessment. Original diagram is not converted.'
  ].join('\n');
}
