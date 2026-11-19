import test from 'node:test';
import assert from 'node:assert/strict';
import {FIRST_LIVE_TEAM,teamDisplayName,teamContextLabel}
  from '../site/first-live-team.js';
import {legacyTrialPublishingAllowed}
  from '../site/legacy-trial-publishing.js';
import {readFileSync} from 'node:fs';

test('first live club/team label is exact, not synthetic or inferred age',()=>{
  assert.equal(FIRST_LIVE_TEAM.club,'St George Oztag');
  assert.equal(FIRST_LIVE_TEAM.name,'Mixed 20');
  assert.equal(FIRST_LIVE_TEAM.teamId,'stgeorge-mixed20');
  assert.equal(FIRST_LIVE_TEAM.sport,'oztag');
  assert(!('age' in FIRST_LIVE_TEAM));
  assert.equal(teamDisplayName({teamId:FIRST_LIVE_TEAM.teamId,
    club:FIRST_LIVE_TEAM.club}),'Mixed 20');
  assert.equal(teamContextLabel({teamId:FIRST_LIVE_TEAM.teamId,
    club:FIRST_LIVE_TEAM.club}),'St George Oztag · Mixed 20');
});
test('a foreign club or unknown scope never inherits the first-team label',()=>{
  assert.equal(teamDisplayName({teamId:FIRST_LIVE_TEAM.teamId,
    club:'Another Club'}),FIRST_LIVE_TEAM.teamId);
  assert.equal(teamDisplayName({teamId:'other-team',club:'St George Oztag'}),
    'other-team');
  assert.equal(teamDisplayName({teamId:'',club:'St George Oztag'}),'');
  assert.equal(teamContextLabel({teamId:'',club:''}),'');
});
test('hosted demo cannot expose historic Go live while local compatibility remains',()=>{
  for(const host of ['pdomoney.github.io','example.com','team.example.au',''])
    assert.equal(legacyTrialPublishingAllowed(host),false);
  for(const host of ['localhost','127.0.0.1'])
    assert.equal(legacyTrialPublishingAllowed(host),true);
  const app=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
  assert.match(app,/LEGACY_TRIAL_PUBLISH_ALLOWED/);
  assert.match(app,/!LEGACY_TRIAL_PUBLISH_ALLOWED/);
  assert.match(app,/legacyTrialPublishingAllowed\(location\.hostname\)/);
  assert.match(app,/if\(DEV_SANDBOX\|\|!LEGACY_TRIAL_PUBLISH_ALLOWED\)/);
  // Preserve old encrypted workspace restore and regression paths for local QA.
  assert.match(app,/function openGoLive\(/);
  assert.match(app,/isSealed\(/);
});
