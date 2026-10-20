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

import { managedClubCandidates, clubLinkPreview, applyClubDirectoryMatch, clubNameKey, linkedDirectoryRecord } from '../site/club-link.js';

test('same-sport name variants suggest a link but never create or change a managed record', () => {
  const candidate = directoryRecords().find(x => x.name === 'Engadine Dragons' && x.sport === 'Rugby league');
  const managed = { id: 'test-engadine', name: 'Engadine Dragons JRLFC', shortName: 'Engadine', sport: 'Rugby league', email: '', website: 'https://local.example',
    phone: '0412 000 000', notes: 'Private working notes', logo: 'existing badge', style: { palette: 'redwhite' },
    officials: [{ role: 'President', name: 'Saved person' }] };
  assert.equal(clubNameKey(managed.name),clubNameKey(candidate.name));
  const matches = managedClubCandidates(candidate,[managed,{ id: 'other', name: 'Engadine Dragons', sport: 'Oztag' }]);
  assert.equal(matches.length,1);
  assert.equal(matches[0].club,managed);
  assert.equal(matches[0].score,100);
  assert.equal(managed.email,'');
  const before = structuredClone(managed);
  const preview = clubLinkPreview(managed,candidate);
  assert.ok(preview.additions.some(x => x.key === 'email'));
  assert.ok(preview.additions.some(x => x.key === 'founded'));
  assert.ok(preview.kept.some(x => x.key === 'phone'));
  assert.ok(!preview.additions.some(x => x.key === 'colours'));
  assert.deepEqual(managed,before,'preview must not alter the source object');
  const linked = applyClubDirectoryMatch(managed,candidate,{linkedAt:'2026-10-21T00:00:00.000Z'});
  assert.equal(linked.id,managed.id);
  assert.equal(linked.name,managed.name);
  assert.equal(linked.email,candidate.email);
  assert.equal(linked.founded,candidate.founded);
  assert.equal(linked.website,managed.website);
  assert.equal(linked.phone,managed.phone);
  assert.equal(linked.logo,managed.logo);
  assert.deepEqual(linked.style,managed.style);
  assert.deepEqual(linked.officials,managed.officials);
  assert.equal(linked.notes,managed.notes);
  assert.equal(linked.directoryMatch.id,candidate.id);
  assert.equal(linked.directoryMatch.classification,'user_confirmed_same_club_research_candidate');
  assert.equal(linkedDirectoryRecord(linked)?.id,candidate.id);
  assert.deepEqual(managed,before,'commit helper must return a new record');
  assert.equal(clubLinkPreview(linked,candidate).additions.length,0,'repeating cannot replace populated fields');
});
test('different sports, other research IDs and already linked clubs are protected', () => {
  const a=directoryRecords().find(x => x.name==='Engadine Dragons' && x.sport==='Rugby league');
  const b=directoryRecords().find(x=>x.sport==='Rugby league' && x.id!==a.id);
  const manual={id:'manual',name:a.name,sport:'Oztag',website:''};
  assert.equal(clubLinkPreview(manual,a),null);
  assert.equal(applyClubDirectoryMatch(manual,a),null);
  assert.equal(applyClubDirectoryMatch({...manual,sport:'Rugby league'}, {id:'not-the-catalogue'}),null);
  const linked={...manual,sport:'Rugby league',directoryMatch:{id:b.id}};
  assert.equal(clubLinkPreview(linked,a).blocked,true);
  assert.equal(applyClubDirectoryMatch(linked,a),null);
});
test('unverified colours require opt-in and multi-venue Oztag grounds are never assumed', () => {
  const league=directoryRecords().find(x=>x.name==='Engadine Dragons'&&x.sport==='Rugby league');
  const manual={id:'dragons',sport:'Rugby league',name:'Engadine',colours:'',style:{palette:'green'},logo:'manual'};
  assert.ok(!clubLinkPreview(manual,league).additions.some(x=>x.key==='colours'));
  assert.equal(applyClubDirectoryMatch(manual,league).colours,'');
  const linked=applyClubDirectoryMatch(manual,league,{includeColours:true});
  assert.equal(linked.colours,league.colours);
  assert.deepEqual(linked.style,manual.style);
  assert.equal(linked.logo,manual.logo);
  const wa=directoryRecords().find(x=>x.venues?.length>1 && x.sport==='Oztag');
  assert.ok(wa);
  assert.ok(!clubLinkPreview({id:'wa',name:wa.name,sport:'Oztag',homeGround:''},wa).additions.some(x=>x.key==='homeGround'));
});
