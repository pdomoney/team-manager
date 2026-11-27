// Original E5 formations and authored starter plays, extracted without changing their data.
const LINE_XS = [3.6, 10.7, 17.9, 25, 32.1, 39.3, 46.4];
export const defaultDefence = (ry, xs = LINE_XS) => ({ marker: [25, ry - 3], line: xs.map(x => [x, ry - 7]) });
export const formation = ry => ({
  RM: [25, ry], LM: [24.6, ry + 3.6],
  LR: [18.4, ry + 5], LL: [12.4, ry + 8], LW: [3.2, ry + 10.5],
  RR: [31.6, ry + 5], RL: [37.6, ry + 8], RW: [46.8, ry + 10.5]
});

export function starterPlays() {
  const base = (id, rev, name, category, when, headline, steps, extra) => ({
    id, name, category, when, headline, steps, side: 'right', builtin: true, rev,
    players: formation(46), defence: defaultDefence(46), moves: [], focus: [], tags: {}, notes: {}, labels: [], ...extra
  });
  // Ruck plays: zoom in on the ruck. RM leaves the ruck straight away, so it is drawn dashed there.
  const ruck = { ghost: ['RM'], view: { x0: 8, x1: 42, y0: 36, y1: 55.5 } };
  const lm = [24.6, 49.6], catchAt = [28.6, 48.2];
  const bounce = { t: 'run', pts: [[25, 46], catchAt] };
  const ruckNotes = { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'b' } };
  const rmCatches = { at: catchAt, text: 'RM catches', side: 'r', dot: true };
  // Hands: the ball goes through the hands from the dummy half to RW. Each receiver runs at the
  // inside shoulder (towards the ball) or the outside shoulder (away from it) of the defender in front.
  const hands = runs => {
    const at = ([[x0, y0], [x1, y1]], y) => [+(x0 + (x1 - x0) * (y0 - y) / (y0 - y1)).toFixed(2), y];
    return [
      { t: 'pass', pts: [lm, at(runs[0], 50.2)] },
      { t: 'run', key: true, pts: runs[0] },
      { t: 'pass', pts: [at(runs[0], 46), at(runs[1], 48)] },
      { t: 'run', key: true, pts: runs[1] },
      { t: 'pass', pts: [at(runs[1], 44.6), at(runs[2], 47.5)] },
      { t: 'run', key: true, pts: runs[2] }
    ];
  };
  const handsPlay = runs => ({ focus: ['RR', 'RL', 'RW'], view: { x0: 14, x1: 50, y0: 36, y1: 58 },
    players: { ...formation(46), RR: runs[0][0], RL: runs[1][0], RW: runs[2][0] },
    notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'b' } }, moves: hands(runs) });
  return [
    base('quickie-out', 3, 'Step Out', 'Ruck', 'Tags 1–3, when their marker or the first defender beside the ruck is slow off the line.',
      'LM steps out left to draw in the marker and their A defender, then passes back to RM, who runs into the space.',
      'RM is tagged, plays the ball fast and bounces out to the right.\nLM, at dummy half, picks up and steps out to the left, drawing in the marker and their left A defender.\nLM passes back to RM.\nRM runs into the space the marker has left, between the marker and the next defender on the right.',
      { ...ruck, focus: ['LM', 'RM'], labels: [rmCatches],
        notes: { LM: { text: 'Dummy half', side: 'b' }, marker: { text: 'Marker', side: 'a' }, d2: { text: 'A defender', side: 'bl' } },
        moves: [
          bounce,
          { t: 'run', key: true, pts: [lm, [22, 46.4]] },
          { t: 'shift', pts: [[25, 43], [23.4, 44.2]] },
          { t: 'shift', pts: [[17.9, 39], [19.9, 41.8]] },
          { t: 'pass', key: true, pts: [[22.4, 47.2], catchAt] },
          { t: 'run', key: true, pts: [catchAt, [28.9, 37.6]] }
        ] }),
    base('quickie-in', 3, 'Step In', 'Ruck', 'After a Step Out has worked, when the defence starts sliding with RM.',
      'RM bounces out the same way as the Step Out, then cuts back inside, behind the marker.',
      'RM plays the ball and bounces out to the right, as in the Step Out.\nLM, at dummy half, passes back to RM.\nRM cuts back inside, behind the marker, into the gap on the other side.',
      { ...ruck, focus: ['RM'], notes: { ...ruckNotes, marker: { text: 'Marker', side: 'r' } }, labels: [rmCatches],
        moves: [bounce, { t: 'pass', key: true, pts: [lm, catchAt] },
          { t: 'run', key: true, curve: true, pts: [catchAt, [27.4, 45.6], [25.2, 44.5], [22.6, 42.4], [21.6, 37.6]] }] }),
    // A decoy (dummy) run goes slightly forward at an angle, never back towards our own try line.
    base('ninja', 4, 'Ninja', 'Ruck', 'Only after Step In and Step Out have worked and the marker is chasing RM.',
      'RM’s decoy run drags the marker away, so LM shows the pass and runs through the hole it leaves.',
      'RM plays the ball and runs a decoy line out to the right, slightly forward at an angle.\nLM, at dummy half, shows the pass to RM but keeps the ball.\nThe marker chases RM, and LM steps through the hole it leaves.',
      { ...ruck, focus: ['LM'],
        notes: { LM: { text: 'Dummy half', side: 'b' }, marker: { text: 'Marker', side: 'ar' } },
        labels: [{ at: [28, 44.6], text: 'RM decoy', side: 'r' }],
        moves: [
          { t: 'run', pts: [[25, 46], [31.6, 41.8]] },
          { t: 'dummy', pts: [lm, [27.4, 49.2]] },
          { t: 'shift', pts: [[25, 43], [27.4, 43.3]] },
          { t: 'run', key: true, curve: true, pts: [lm, [23.5, 46.2], [23.5, 43], [23, 37.6]] }
        ] }),
    // Out the back: the dummy half passes, then loops around the back to take the ball again.
    base('out-the-back', 5, 'Out the back', 'Edge', 'Tags 3–5, attacking the wider side of the ruck.',
      'RL’s decoy holds their line, and LM loops around from dummy half to hit the gap.',
      'RM plays the ball.\nLM, at dummy half, passes to RR, then loops around behind RR and RL.\nRR runs at the inside shoulder of their Rover to hold them.\nRL runs a short decoy line at the gap.\nRR passes behind RL to LM, who hits the gap with RW outside.',
      { focus: ['LM'], view: { x0: 14, x1: 50, y0: 37, y1: 57.5 },
        players: { RM: [25, 46], LM: [23.6, 49.6], RR: [31.6, 50.9], RL: [36.4, 47.2], RW: [48.1, 55.6], LR: [17.6, 52.8], LL: [11.6, 54], LW: [4, 55.3] },
        notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half,\nthen loops', side: 'l' }, RL: { text: 'Decoy', side: 'ar' }, RW: { text: 'Stays wide', side: 'l' } },
        labels: [{ at: [40.6, 51.8], text: 'LM catches', side: 'br', dot: true }],
        moves: [
          { t: 'pass', pts: [[23.6, 49.6], [31.6, 50.9]] },
          { t: 'run', pts: [[31.6, 50.9], [31.5, 40.6]] },
          { t: 'run', pts: [[36.4, 47.2], [35, 40.6]] },
          { t: 'run', key: true, curve: true, pts: [[23.6, 49.6], [26.6, 53.4], [31.8, 55.4], [36.8, 55.2], [40.6, 51.8]] },
          { t: 'pass', key: true, pts: [[31.5, 46.4], [40.6, 51.8]] },
          { t: 'run', key: true, pts: [[40.6, 51.8], [43, 40.4]] },
          { t: 'run', pts: [[48.1, 55.6], [48.3, 42.6]] }
        ] }),
    base('hands-inside', 4, 'Hands – inside shoulder', 'Hands', 'To hold their defenders where they are, so the space stays out wide.',
      'Through the hands: each receiver runs at the inside shoulder of the defender in front, towards the ball.',
      'RM plays the ball; LM, at dummy half, passes right to RR.\nRR runs at the inside shoulder of the defender in front (towards the ball), holds them, and passes to RL.\nRL does the same and passes to RW.\nRW runs at the inside shoulder of the last defender.',
      handsPlay([[[33.4, 51], [31, 39.4]], [[40.2, 54], [38.2, 39.4]], [[47.6, 56.5], [45.3, 39.4]]])),
    base('hands-outside', 4, 'Hands – outside shoulder', 'Hands', 'When their defenders are coming in hard, or we have the numbers out wide.',
      'Through the hands: each receiver runs at the outside shoulder of the defender in front, away from the ball.',
      'RM plays the ball; LM, at dummy half, passes right to RR.\nRR runs at the outside shoulder of the defender in front (away from the ball) and passes to RL.\nRL does the same and passes to RW.\nRW takes the outside shoulder of the last defender and goes around them.',
      handsPlay([[[30.2, 51], [33.2, 39.4]], [[36.6, 54], [40.4, 39.4]], [[44.6, 56.5], [47.5, 39.4]]])),
    // Wrap Block, from the coach's drawing: RR passes to RL (W2.1) and wraps around the back, behind
    // RW's block line, to take RL's pass (W2.2). Option: RL passes to RW on the inside line instead.
    base('wrap-block', 6, 'Wrap Block', 'Edge', 'When their edge defenders are holding their spots: the inside lines hold them while RR wraps around.',
      'RR passes and wraps around the back, behind RW’s block line, to take RL’s pass and finish outside.',
      'LM, at dummy half, passes to RR.\nRR runs forward, passes to RL (W2.1), then wraps around behind RL.\nRL runs an inside line, and RW runs a block line in towards the ball, to hold their defenders.\nRR wraps behind RW’s block line, takes RL’s pass (W2.2) and finishes outside the last defender.\nOption: if their defence drifts out to cover the wrap, RL passes to RW on the inside line instead.',
      { focus: ['RR'], view: { x0: 11, x1: 48, y0: 36, y1: 54 },
        players: { RM: [22, 46], LM: [21.6, 49.6], LR: [14.8, 51.6], LL: [8.4, 54], LW: [2.6, 56.5], RR: [28.4, 50.4], RL: [34.8, 50.4], RW: [41.2, 50.4] },
        defence: { marker: [22, 43], line: [3, 9.4, 15.8, 22.2, 28.6, 35, 41.4].map(x => [x, 39]) },
        notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'l' }, RR: { text: 'Passes, then wraps', side: 'b' }, RW: { text: 'Block', side: 'r' } },
        labels: [{ at: [31.6, 45.7], text: 'W2.1', side: 'a' }, { at: [36.5, 43], text: 'W2.2', side: 'b' }, { at: [31.8, 40.9], text: 'Option', side: 'l' }],
        moves: [
          { t: 'pass', pts: [[21.6, 49.6], [28.4, 50.4]] },
          { t: 'run', pts: [[34.8, 50.4], [31.2, 38]] },
          { t: 'run', pts: [[41.2, 50.4], [36.8, 38]] },
          { t: 'run', key: true, curve: true, pts: [[28.4, 50.4], [29.6, 45.7], [32.2, 47.1], [35.1, 47.6], [37.9, 46.8], [39.6, 45.3], [41.6, 41.3], [43.4, 37.6]] },
          { t: 'pass', pts: [[29.6, 45.7], [33.5, 45.8]] },
          { t: 'pass', key: true, pts: [[32.5, 42.4], [40.5, 43.5]] },
          { t: 'pass', opt: true, pts: [[32, 40.8], [37.9, 41.1]] }
        ] }),
    // Back Inside Block, from the coach's drawing: two sweepers (LR inside, LL outside) come across
    // from deep while RR and RL run block lines in. RR, with the ball, passes out to the outside
    // sweeper (1.2), who passes back inside to the inside sweeper (1.3).
    base('back-inside-block', 6, 'Back Inside Block', 'Edge', 'When their defenders push up and slide out: the block lines hold them, and the ball comes back inside.',
      'RR takes the ball on a block line and passes out to the outside sweeper, who gives it back inside to the inside sweeper.',
      'RM plays the ball; LM, at dummy half, passes to RR (1.1).\nLR and LL sweep across from deep behind the ruck: LR on the inside, LL on the outside.\nRR runs a block line in towards the ball and passes out to LL, the outside sweeper (1.2).\nRL runs a second block line in, across the sweepers, to hold their defenders.\nLL passes back inside to LR (1.3), who goes through the gap.',
      { focus: ['LR'], view: { x0: 14, x1: 50, y0: 36, y1: 58 },
        players: { RM: [25, 46], LM: [24.6, 49.6], LR: [28.2, 52.6], LL: [29.6, 56], LW: [3.2, 56.5], RR: [31.6, 51], RL: [40.2, 51.6], RW: [47.2, 56] },
        notes: { RM: { text: 'Plays the ball', side: 'l' }, LM: { text: 'Dummy half', side: 'l' }, LR: { text: 'Inside sweeper', side: 'l' }, LL: { text: 'Outside sweeper', side: 'l' },
          RR: { text: 'Block', side: 'ar' }, RL: { text: 'Block', side: 'bl' } },
        labels: [{ at: [28, 49.8], text: '1.1', side: 'a' }, { at: [33.2, 44.8], text: '1.2', side: 'a' }, { at: [39.75, 42.4], text: '1.3 inside', side: 'a' }],
        moves: [
          { t: 'pass', pts: [[24.6, 49.6], [31.5, 50]] },
          { t: 'run', pts: [[31.6, 51], [29.8, 39.4]] },
          { t: 'run', pts: [[40.2, 51.6], [33.6, 39.4]] },
          { t: 'run', curve: true, pts: [[29.6, 56], [34.4, 56.8], [39.2, 55.4], [42, 52.4], [42.8, 48], [42.6, 43.4], [42, 38.6]] },
          { t: 'run', key: true, curve: true, pts: [[28.2, 52.6], [31.4, 53.6], [34, 52], [35.6, 48.8], [36.6, 45.2], [37.2, 41.8], [37.6, 38.6]] },
          { t: 'pass', pts: [[30.6, 44.6], [42.7, 46]] },
          { t: 'pass', key: true, pts: [[42.5, 42.2], [37, 42.6]] }
        ] })
  ];
}
