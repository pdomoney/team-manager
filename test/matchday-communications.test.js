import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publishedMatchRecordText} from '../site/shared-team-messages.js';
const fixture={teamName:'Example Team',match:{title:'Example match'},record:{teamRecorded:true,state:'published',homeScore:5,awayScore:3,startingIds:['p1'],players:[{personId:'p1',displayName:'Example Player'}]}};
test('lineup and results templates require published state and real record values',()=>{
 assert.match(publishedMatchRecordText({...fixture,kind:'result'}),/5 – 3/);
 assert.match(publishedMatchRecordText({...fixture,kind:'lineup'}),/Example Player/);
 assert.equal(publishedMatchRecordText({...fixture,kind:'result',record:{...fixture.record,state:'approved'}}),'');
 assert.equal(publishedMatchRecordText({...fixture,kind:'lineup',record:{...fixture.record,state:'draft'}}),'');
 assert.equal(publishedMatchRecordText({...fixture,kind:'lineup',record:{...fixture.record,players:[]}}),'');
});
