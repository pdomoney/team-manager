import test from 'node:test';
import assert from 'node:assert/strict';
import { directoryRecords, filterClubDirectory, directoryClubDraft, possibleClubPalette } from '../site/club-directory.js';
import { SPORT_ICONS } from '../site/sport-icons.js';
import { TEAM_STYLES } from '../site/team-style.js';

test('reference catalogue contains reviewed research candidates only; never changes stored clubs', () => {
  const all = directoryRecords();
  assert.equal(all.length, 275);
  assert.equal(all.filter(x => x.sport === 'Rugby league').length, 143);
  assert.equal(all.filter(x => x.sport === 'Oztag').length, 132);
  assert.ok(all.every(x => x.status === 'research_candidate' && x.id && x.name && x.sourceUrl));
  assert.ok(all.every(x => !x.logo && !x.logo_image_url && !x.style && !x.officials && !x.team));
  assert.equal(new Set(all.map(x => x.id)).size, all.length);
  assert.ok(SPORT_ICONS['Rugby league'] && SPORT_ICONS.Oztag);
});
test('directory filters are case insensitive and preserve state/sport boundaries', () => {
  const nsw = filterClubDirectory({sport:'Rugby league', state:'NSW'});
  assert.ok(nsw.length > 20 && nsw.every(x => x.sport === 'Rugby league' && x.state === 'NSW'));
  assert.deepEqual(filterClubDirectory({query:'gibberish-not-a-team'}), []);
  const wa = filterClubDirectory({sport:'Oztag',state:'WA',query:'Central Perth Districts'});
  assert.equal(wa.length, 1, 'shared WA venues must not become multiple independent clubs');
  assert.ok(wa[0].variants.length >= 2);
  assert.equal(wa[0].venues.length,2);
  assert.equal(directoryClubDraft(wa[0]).homeGround,'','multi-venue association requires choosing a ground');
});
test('adopting a directory entry requires an explicit editable draft; branding cannot be assumed', () => {
  const league = directoryRecords().find(x => x.sport === 'Rugby league');
  const draft = directoryClubDraft(league);
  assert.equal(draft.sport,'Rugby league');
  assert.notEqual(draft.id,league.id);
  assert.ok(!draft.logo && !draft.style && !draft.officials);
  assert.ok(draft.notes.includes('unverified'));
  assert.equal(directoryClubDraft({id:'foreign'}),null);
  assert.equal(possibleClubPalette({colours:''}), '');
  assert.ok(TEAM_STYLES.some(s => s.id === 'bluewhite'));
});
