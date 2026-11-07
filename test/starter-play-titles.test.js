import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalStarterPlayName,STARTER_PLAY_TITLES} from '../site/starter-play-titles.js';

const before=(id,name,edited=false)=>({
  id,name,builtin:true,rev:3,edited,
  when:'After a Quickie Out has worked',headline:'Quickie Out draws the defence',
  steps:'RM plays the ball, as in the Quickie Out.',
  moves:[{t:'run',pts:[[22,45],[24,42]]}],
  study:[{title:'Coach-owned teaching cue',text:'Do not rewrite my work'}]
});

test('Step In and Step Out retain legacy starter IDs and play geometry',()=>{
  assert.equal(STARTER_PLAY_TITLES['quickie-in'].current,'Step In');
  assert.equal(STARTER_PLAY_TITLES['quickie-out'].current,'Step Out');
  for(const [id,old,newName] of [
    ['quickie-in','Quickie In','Step In'],
    ['quickie-out','Quickie Out','Step Out']
  ]){
    const saved=before(id,old),baseline=JSON.stringify(saved);
    const updated=canonicalStarterPlayName(saved);
    assert.equal(updated.id,id);
    assert.equal(updated.name,newName);
    assert.deepEqual(updated.moves,saved.moves);
    assert.deepEqual(updated.study,saved.study);
    assert.equal(updated.rev,3);
    assert.equal(JSON.stringify(saved),baseline,'never mutate the source in place');
    assert.deepEqual(canonicalStarterPlayName(updated),updated,'idempotent on repeated load');
  }
});
test('only unchanged legacy Step In words point at the new Step Out name',()=>{
  const orig=before('quickie-in','Quickie In');
  const result=canonicalStarterPlayName(orig);
  assert.equal(result.when,'After a Step Out has worked');
  assert.equal(result.headline,'Step Out draws the defence');
  assert.equal(result.steps,'RM plays the ball, as in the Step Out.');
  const edited=before('quickie-in','Quickie In',true);
  assert.equal(canonicalStarterPlayName(edited).name,'Step In');
  assert.equal(canonicalStarterPlayName(edited).steps,edited.steps,
    'do not overwrite coach-authored wording');
});
test('custom title, copied library and unrelated starter remain untouched',()=>{
  const entries=[
    {...before('quickie-out','Quickie Out'),builtin:false},
    before('quickie-out','My quickie variation',true),
    before('ninja','Ninja'),
    before('other-id','Quickie Out')
  ];
  entries.forEach(item=>assert.equal(canonicalStarterPlayName(item),item));
  assert.equal(canonicalStarterPlayName(null),null);
});
