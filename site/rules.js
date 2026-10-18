// Rule sets: the official rules for each sport and grade, published by the app's owner.
//
// Each sport has base rules and its grades only list what differs (a rule with the same id replaces
// the base one). `values` are the numbers the app uses or shows at a glance; `rules` are the words,
// with the rule-book reference. A team chooses a rule set ('oztag/mixed') in Settings and can add its
// competition's by-laws on top; those are the team's own and updates never touch them.
//
// Updating: `pack` goes up by one with every approved update, and `changes` says what changed and
// which rule ids, so the app can tell coaches what to look at. `sources` lists each rule book and the
// date the rules here were last checked against it. The weekly Rules watch workflow fingerprints each
// rule book and tells the owner when one changes; the app shows a source that changed after its
// checked date. Updates are drafted as a pull request and only go live once the owner approves and
// merges it.

export const RULES = {
  pack: 1,
  updated: '2026-10-18',
  changes: [
    { pack: 1, date: '2026-10-18', sports: ['oztag', 'league', 'league-tag'],
      notice: 'The official rules are now in the app, under Tactics › Rules. In Oztag, kicking is legal on any tag, and a kick that goes dead over the try line untouched is a tap 10 m out, not a drop-out.',
      summary: 'First rule sets: Oztag (Australian Oztag rule book), rugby league 6–12 and 13+, and league tag. Kicking in Oztag is legal on any tag, and an untouched kick over the try line is the defence’s tap 10 m out, so the kicking and defence game systems were reworded.',
      rules: ['oztag.kick.allowed', 'oztag.kick.overline', 'oztag.mixed.try'] }
  ],
  sources: {
    oztag: { title: 'Australian Oztag / ITF Official Rulebook', edition: 'Updated 2022 (2025 page footers)', url: 'https://api.oztag.com.au/wp-content/uploads/2026/09/AO-RULEBOOK-2022.pdf', checked: '2026-10-18' },
    'league-juniors': { title: 'National Junior League Laws, 6–12 years', edition: 'Official 2026', url: 'https://www.playrugbyleague.com/media/18199/2026-national-6-12-junior-league-laws.pdf', checked: '2026-10-18' },
    'league-intl': { title: 'Rugby League Laws of the Game, International Level', edition: '2023', url: 'https://www.playrugbyleague.com/media/14513/nrl-international-rules-book-2023_web-version-1.pdf', checked: '2026-10-18' },
    'league-tag': { title: 'League Tag Laws of the Game', edition: '2018 (November 2017)', url: 'https://www.playrugbyleague.com/media/16327/league-tag-laws-of-the-game-2018-1.pdf', checked: '2026-10-18' }
  },
  sports: {
    oztag: {
      name: 'Oztag', source: 'oztag',
      values: { players: 8, minPlayers: 5, interchange: 'Unlimited', set: 6, setWord: 'tags', defence: 7, defenceMoves: 'When the dummy half touches the ball', markers: 1,
        kicking: 'Any tag; no higher than the referee’s shoulder; no drop kicks', tryPoints: 1, field: '70 × 50 m (check)', game: 'Set by the competition', sinBin: '5 min, not replaced' },
      rules: [
        { id: 'oztag.players', topic: 'Players', text: 'Up to 8 on the field, at least 5 to start. Unlimited interchange.', ref: '3.1–3.2' },
        { id: 'oztag.set', topic: 'Tags', text: 'Six tags, then a changeover.', ref: '2.2, 5.8' },
        { id: 'oztag.tags', topic: 'Tags', text: 'Everyone wears two tags. The ball carrier can only go on with both tags on (unless pre- or late-tagged); a defender can play with one or none.', ref: '3.6, 6.1, 5.9' },
        { id: 'oztag.ptb', topic: 'Play the ball', text: 'Play the ball at the tag point, heeled back no more than 2 m. A three-second count for any delay.', ref: '6.3, 6.5, 6.25' },
        { id: 'oztag.marker', topic: 'Play the ball', text: 'One marker, about 1 m in front of the play the ball.', ref: '5.5–5.6' },
        { id: 'oztag.dummyhalf', topic: 'Play the ball', text: 'The dummy half may run, pass or kick. With one tag or none, only one step before passing or kicking.', ref: '6.4, 6.6' },
        { id: 'oztag.defence.distance', topic: 'Defence', text: 'The defensive line is at least 7 m back from the play the ball.', ref: '5.4' },
        { id: 'oztag.defence.moves', topic: 'Defence', text: 'The marker and the line can only move once the dummy half touches the ball.', ref: '5.6' },
        { id: 'oztag.contact', topic: 'Contact', text: 'Non-contact. No bumping, no stepping into a defender’s path, no fending or protecting tags, no jumping or dipping to avoid a tag. Spinning is allowed without contact. Defenders can’t step into the carrier’s path or dive on a loose ball.', ref: '5.10, 5.21, 6.27–6.29' },
        { id: 'oztag.kick.allowed', topic: 'Kicking', text: 'Kicking is allowed in general play, on any tag.', ref: '7.1' },
        { id: 'oztag.kick.height', topic: 'Kicking', text: 'Off the boot, no higher than the referee’s shoulder (it may bounce higher). No drop kicks. Too high is a changeover where it was kicked.', ref: '7.1, 7.31' },
        { id: 'oztag.kick.tags', topic: 'Kicking', text: 'A player with one tag or none can’t kick, unless pre- or late-tagged. The dummy half or a penalty tap can, with one step.', ref: '7.30' },
        { id: 'oztag.kick.chase', topic: 'Kicking', text: 'The kicking team can’t dive on a kick or impede defenders going for it. Teammates in front of the kicker are offside until they’ve gone 10 m or the kicker passes them.', ref: '7.19–7.20, 7.25–7.26' },
        { id: 'oztag.kick.regather', topic: 'Kicking', text: 'If the kicking team regathers, play on with a zero tag. The kicker can’t kick it a second time.', ref: '5.22, 5.24' },
        { id: 'oztag.kick.overline', topic: 'Kicking', text: 'A kick over their try line that nobody touches: their tap 10 m out, centre field. Touched by a defender and over: their drop-out from the centre of the try line (our ball). Grounded by the kicking team: a try.', ref: '7.22–7.24, 7.28' },
        { id: 'oztag.kick.5010', topic: 'Kicking', text: '50/10: kicked from our own half, bounces in, then out within 10 m of their try line: our tap 10 m in from touch and 10 m out.', ref: '7.29' },
        { id: 'oztag.kick.touch', topic: 'Kicking', text: 'Out on the full: changeover where it was kicked. Bounces in and out: changeover 10 m in from touch.', ref: '7.8, 7.32' },
        { id: 'oztag.kickoff', topic: 'Restarts', text: 'Kick-off: a place kick from halfway, receivers 10 m back; it must travel 10 m and bounce in the field before going out. Drop-outs are from the centre of the try line.', ref: '2.4, 7.2–7.7, 7.11' },
        { id: 'oztag.scoring', topic: 'Scoring', text: 'A try is grounding the ball on or over the try line. Diving to score is allowed, but not over or under a player.', ref: '4.2, 4.10' },
        { id: 'oztag.changeover', topic: 'Changeovers', text: 'A knock-on or forward pass within 10 m of their try line: changeover 10 m out.', ref: '6.17' },
        { id: 'oztag.penalty', topic: 'Penalties', text: 'A penalty is a tap kick on the mark; the other team retires 10 m or to its try line.', ref: '9.1–9.5' },
        { id: 'oztag.sinbin', topic: 'Penalties', text: 'Sin bin: 5 minutes, not replaced.', ref: '10.4' },
        { id: 'oztag.field', topic: 'Field', text: 'About 70 × 50 m (the rule book’s field labels are unclear). Dead-ball line at least 6 m behind the try line. Game length is set by the competition.', ref: 'Glossary, 13' }
      ],
      grades: [
        { id: 'mixed', name: 'Mixed', categories: ['mixed'], values: { maxMales: 4, tryPoints: 'Female 2, male 1' },
          rules: [
            { id: 'oztag.mixed.males', topic: 'Players', text: 'At most 4 males on the field; any number of females from 1 to 8.', ref: '3.3' },
            { id: 'oztag.mixed.try', topic: 'Scoring', text: 'A female try is worth 2 points, a male try 1.', ref: '4.3' }
          ] },
        { id: 'men', name: 'Men’s', categories: ['men'] },
        { id: 'women', name: 'Women’s', categories: ['women'] },
        { id: 'juniors', name: 'Juniors', categories: ['boys', 'girls'], note: 'The rule book has no junior changes: add your competition’s junior by-laws.' }
      ]
    },
    league: {
      name: 'Rugby league', source: 'league-intl',
      values: { players: 13, minPlayers: 9, interchange: 'Set by the competition', set: 6, setWord: 'tackles', defence: 10, defenceMoves: 'When the ball clears the ruck', markers: 1,
        kicking: 'Allowed; 40/20, 20 m restart, drop-outs', tryPoints: 4, field: '100 × 68 m', game: '80 min (competitions set shorter)', sinBin: '10 min' },
      rules: [
        { id: 'league.players', topic: 'Players', text: 'Up to 13 on the field, at least 9. Interchange is set by the competition.', ref: 'S4' },
        { id: 'league.set', topic: 'Tackles', text: 'Five play-the-balls, then a handover at the sixth tackle.', ref: 'S11, S13' },
        { id: 'league.ptb', topic: 'Play the ball', text: 'The tackled player gets up, lifts the ball clear and heels it back. One opponent may mark; the dummy half stands directly behind.', ref: 'S13' },
        { id: 'league.defence', topic: 'Defence', text: 'Defenders retire 10 m and can’t advance until the ball clears the ruck.', ref: 'S13' },
        { id: 'league.kick', topic: 'Kicking', text: 'Kicking is allowed. 40/20: from inside our 40 m to bounce into touch inside their 20 m gives our tap 20 m in. 20 m restart is optional from the centre of the 20 m line. Drop-outs from the goal line or 20 m line must travel 10 m.', ref: 'S2, S8, S9' },
        { id: 'league.scoring', topic: 'Scoring', text: 'Try 4, conversion and penalty goal 2, field goal 1 (2 from outside 40 m).', ref: 'S6' },
        { id: 'league.scrum', topic: 'Scrums', text: 'Scrums form at right angles to touch, 3-2-1 with six forwards; the non-offending team gets the loose head and feed.', ref: 'S12' },
        { id: 'league.sinbin', topic: 'Penalties', text: 'Sin bin 10 minutes. Shoulder charges and contact with the head or neck are misconduct.', ref: 'S15–S16' },
        { id: 'league.game', topic: 'Field', text: 'Standard game 80 minutes with a 5-minute break; competitions may shorten it. Field 100 × 68 m.', ref: 'S1, S7' }
      ],
      grades: [
        { id: 'u6', name: 'Under 6', source: 'league-juniors', values: { players: 6, minPlayers: 4, field: '40 × 20 m', game: '4 × 8 min', set: 6, setWord: 'tags', markers: 0, defence: 5, kicking: 'No (kick-off and penalty restarts only)', tryPoints: '4, no conversions', passes: 1, interchange: 'Each plays 2 unbroken quarters' },
          rules: [{ id: 'league.junior.format', topic: 'Format', text: 'League tag format with the Chance Rule; 1 pass before the carrier may run; no scrums (play-the-ball 5 m in from touch and goal line).', ref: 'Game model' }] },
        { id: 'u7', name: 'Under 7', source: 'league-juniors', values: { players: 6, minPlayers: 4, field: '40 × 20 m', game: '4 × 8 min', markers: 0, defence: 5, kicking: 'No (kick-off and penalty restarts only)', tryPoints: '4, no conversions', passes: 1, interchange: 'Each plays 2 unbroken quarters' },
          rules: [{ id: 'league.junior.format', topic: 'Format', text: 'Tag until the TackleReady program is done (at least 10 weeks), then tackle. 1 pass before the carrier may run; no scrums.', ref: 'Game model' }] },
        { id: 'u8', name: 'Under 8', source: 'league-juniors', values: { players: 8, minPlayers: 6, field: '68 × 30 m', game: '4 × 8 min', markers: 0, defence: 5, kicking: 'No general-play kicking (the laws also say yes: check)', tryPoints: '4; conversions in turn', passes: 2, interchange: 'Each plays 2 unbroken quarters' },
          rules: [{ id: 'league.junior.format', topic: 'Format', text: 'Tackle. 2 passes before the carrier may run (first receiver vest); no scrums (play-the-ball 10 m in); no tackles above the armpits; no stripping.', ref: 'Game model, Cl. 13' }] },
        { id: 'u9', name: 'Under 9', source: 'league-juniors', values: { players: 8, minPlayers: 6, field: '68 × 30 m', game: '4 × 8 min', markers: 1, defence: 5, kicking: 'Yes, no bombs; no penalty goals', tryPoints: '4; conversions in turn', passes: 2, interchange: 'Each plays 2 unbroken quarters' },
          rules: [{ id: 'league.junior.format', topic: 'Format', text: 'Tackle. 2 passes before the carrier may run (first receiver and dummy half vests); no scrums.', ref: 'Game model' }] },
        { id: 'u10', name: 'Under 10–11', source: 'league-juniors', values: { players: 11, minPlayers: 8, field: '80 × 48 m', game: '2 × 20 min', markers: 1, defence: 5, kicking: 'Yes, no bombs; no penalty goals', tryPoints: '4; conversions in turn', passes: 2, interchange: 'Each plays 1 unbroken half' },
          rules: [{ id: 'league.junior.format', topic: 'Format', text: 'Tackle. 2 passes before the carrier may run (vests); no scrums.', ref: 'Game model' }] },
        { id: 'u12', name: 'Under 12', source: 'league-juniors', values: { players: 13, minPlayers: 11, field: '100 × 68 m', game: '2 × 20 min', markers: 1, defence: 5, kicking: 'Yes, no bombs; 40/20 applies', tryPoints: '4; place-kick conversions in turn', passes: 2, interchange: 'Each plays 1 unbroken half' },
          rules: [{ id: 'league.junior.format', topic: 'Format', text: 'Tackle. 2 passes before the carrier may run (vests); no scrums.', ref: 'Game model' }] },
        { id: 'u13-14', name: '13–14', values: { defence: 5 }, rules: [{ id: 'league.defence', topic: 'Defence', text: 'Defenders retire 5 m (14 and under) and can’t advance until the ball clears the ruck.', ref: 'S13' }] },
        { id: 'men', name: 'Open men', categories: ['men'] },
        { id: 'women', name: 'Open women', categories: ['women'], note: 'The international laws have no separate women’s rules; game length and other differences are competition rules.' }
      ]
    },
    'league-tag': {
      name: 'League tag', source: 'league-tag',
      values: { players: 11, minPlayers: 8, interchange: 'Set by the competition', set: 6, setWord: 'tags', defence: 10, defenceMoves: 'When the ball clears the ruck', markers: '0–2',
        kicking: 'Allowed', tryPoints: 4, field: '100 × 68 m', game: '2 × 25 min', sinBin: '10 min' },
      rules: [
        { id: 'ltag.set', topic: 'Tags', text: 'Six tags: five play-the-balls, then a handover at the sixth tag. Defenders can only tag with both their own tags on.', ref: 'S7' },
        { id: 'ltag.contact', topic: 'Contact', text: 'No fending or protecting tags. Dive only through a gap, never at a player. No running into or jumping through the line, and no 360° turns through it. No stripping.', ref: 'S5, S7' },
        { id: 'ltag.ptb', topic: 'Play the ball', text: 'At the point of the tag, facing their goal line. Up to 2 optional markers.', ref: 'S8' },
        { id: 'ltag.defence', topic: 'Defence', text: 'Defenders retire 10 m (5 m for 13–14) and can move when the ball clears the ruck.', ref: 'S8' },
        { id: 'ltag.scoring', topic: 'Scoring', text: 'Try 4 (both tags on), conversion and penalty goal 2, drop goal 1.', ref: 'S5' },
        { id: 'ltag.sinbin', topic: 'Penalties', text: 'Sin bin 10 minutes.', ref: 'S10' }
      ],
      grades: [
        { id: '6-7', name: '6–7 years', values: { players: 6, minPlayers: 4, field: '40 × 20 m', game: '4 × 8 min', markers: 0, defence: '5 m (check)', kicking: 'No (starts and penalties only)', passes: 1, sinBin: 'None' } },
        { id: '8-9', name: '8–9 years', values: { players: 8, minPlayers: 6, field: '68 × 30 m', game: '4 × 8 min', markers: '0 (8s), 1 (9s)', defence: '5 m (check)', kicking: 'No for 8s; 9s yes, no bombs', passes: 2, sinBin: 'None' } },
        { id: '10-12', name: '10–12 years', values: { players: 8, minPlayers: 6, field: '80 × 48 m', game: '2 × 20 min', markers: 1, defence: 5, kicking: 'Yes, no bombs', passes: 2, interchange: 'Unlimited', sinBin: 'None (replaced)' } },
        { id: '13-14', name: '13–14 years', values: { defence: 5 } },
        { id: '15', name: '15 and over' }
      ]
    }
  }
};
