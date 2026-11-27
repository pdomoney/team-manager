import test from 'node:test';
import assert from 'node:assert/strict';
import {starterPlays,formation,defaultDefence} from '../site/play-starters.js';
import {validConnectedE5Play} from '../site/cloud-e5-payload.js';
test('all eight original starter definitions are compatible and independent',()=>{
 const first=starterPlays(),second=starterPlays();
 assert.deepEqual(first.map(p=>p.id),['quickie-out','quickie-in','ninja','out-the-back','hands-inside','hands-outside','wrap-block','back-inside-block']);
 assert.deepEqual(first.map(p=>p.rev),[3,3,4,5,4,4,6,6]);
 assert.deepEqual(first,second);
 for(const p of first){assert(validConnectedE5Play({...p,sport:'Oztag',set:'oztag'}),p.name);assert(p.moves.length>0);}
 first[0].moves[0].pts[0][0]=0;
 assert.notDeepEqual(first,second);
 assert.deepEqual(formation(46).RM,[25,46]);
 assert.deepEqual(defaultDefence(46).marker,[25,43]);
});
