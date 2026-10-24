import test from 'node:test';
import assert from 'node:assert/strict';
import {nextOrgPreviewSelection,organisationPreview} from '../site/p09-org-preview.js';
import {personField,helperPlayerField} from '../site/p09-person-form.js';

const original={mode:'club',clubId:'c1',teamId:'t1'};
const clubs=[{id:'c1',name:'First'},{id:'c2',name:'Second'}];
const teams=[{id:'t1',clubId:'c1'},{id:'t2',clubId:'c2'},
  {id:'historic',clubId:'c2',archived:true}];

test('P09D controller allows only named, locally previewed layout concepts',()=>{
  for(const mode of ['association','club','coach','individual']){
    assert.equal(nextOrgPreviewSelection(original,{kind:'mode',id:mode}).mode,mode);
  }
  for(const invalid of ['owner','association-admin','<script>',null,'']){
    assert.equal(nextOrgPreviewSelection(original,{kind:'mode',id:invalid}),null);
  }
  assert.deepEqual(original,{mode:'club',clubId:'c1',teamId:'t1'});
});

test('P09D club change checks exact managed ID and does not update the original selection',()=>{
  const next=nextOrgPreviewSelection(original,{kind:'club',id:'c2'},{clubs});
  assert.deepEqual(next,{mode:'club',clubId:'c2',teamId:'t1'});
  for(const id of ['c3','',null,'c1<script>']){
    assert.equal(nextOrgPreviewSelection(original,{kind:'club',id},{clubs}),null);
  }
  assert.equal(original.clubId,'c1');
});

test('P09D team action follows only current active local teams and excludes archived IDs',()=>{
  const next=nextOrgPreviewSelection(original,{kind:'team',id:'t2'},{teams});
  assert.deepEqual(next,{mode:'club',clubId:'c2',teamId:'t2'});
  for(const id of ['unknown','historic','',null]){
    assert.equal(nextOrgPreviewSelection(original,{kind:'team',id},{teams}),null);
  }
});

test('P09D invalid or missing transition does not expand local preview scope',()=>{
  assert.equal(nextOrgPreviewSelection(original,null,{clubs,teams}),null);
  assert.equal(nextOrgPreviewSelection(original,{kind:'grant',id:'c2'},{clubs,teams}),null);
  assert.equal(nextOrgPreviewSelection(original,{kind:'club',id:'c2'}),null);
  assert.equal(nextOrgPreviewSelection(original,{kind:'team',id:'t2'}),null);
  assert.deepEqual(nextOrgPreviewSelection(null,{kind:'mode',id:'individual'}),
    {mode:'individual',clubId:'',teamId:''});
});

test('P09D projected metadata excludes private player, helper, guardian and staff data',()=>{
  const secret='PRIVATE_P09D_VALUE';
  const data=organisationPreview({
    clubs:[{...clubs[0],email:secret,WWCC:secret,guardians:[secret]}],
    teams:[{...teams[0],name:'Team',players:[{notes:secret}],helpers:[secret],
      matchOfficials:[{email:secret}],encryptionKey:secret}],
    mode:'club',clubId:'c1'
  });
  const json=JSON.stringify(data);
  assert.ok(!json.includes(secret));
  assert.deepEqual(data.teams.map(t=>t.id),['t1']);
  assert.equal(data.selectedClubId,'c1');
});

test('P09D common person field contracts retain escapes and scoped names',()=>{
  const fields=[
    personField('player','name','<script>'),
    personField('helper','relation','<private>'),
    personField('volunteer','email','safe@example.test'),
    helperPlayerField([{id:'p1',name:'<script>'}],'p1')
  ];
  assert.ok(fields.every(html=>!html.includes('<script>') && !html.includes('<private>')));
  assert.match(fields[0],/required/);
  assert.match(fields[2],/type="email"/);
  assert.match(fields[3],/value="p1" selected/);
  assert.throws(()=>personField('volunteer','notes',''),/Unsupported person form/);
});
