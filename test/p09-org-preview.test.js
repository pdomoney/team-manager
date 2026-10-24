import test from 'node:test';
import assert from 'node:assert/strict';
import {organisationPreview,ORG_PREVIEW_MODES} from '../site/p09-org-preview.js';

const secret='PRIVATE_DO_NOT_RENDER';
const clubs=[
  {id:'c1',name:'<Alpha> Oztag',shortName:'Alpha',sport:'Oztag',email:secret,officials:[{phone:secret}],logo:secret},
  {id:'c2',name:'Beta League',sport:'Rugby league',notes:secret,registration:secret}
];
const teams=[
  {id:'t1',name:'Alpha Mixed',clubId:'c1',sport:'Oztag',division:'Mixed',players:[{name:secret,phone:secret,notes:secret}],teamPass:secret,jerseys:[secret]},
  {id:'t2',name:'Beta U16',clubId:'c2',sport:'Rugby league',division:'U16 Boys',matchOfficials:[{email:secret}],privateHealth:secret},
  {id:'archive',name:'Archived',clubId:'c1',sport:'Oztag',archived:true},
  {id:'t3',name:'Unattached',sport:'Touch football'}
];
test('P09C organisation concepts are fixed designs, never true identity/role grants',()=>{
  assert.deepEqual(ORG_PREVIEW_MODES.map(x=>x.id),['association','club','coach','individual']);
  assert.throws(()=>organisationPreview({mode:'owner<script>'}),/Unknown preview mode/);
  assert.throws(()=>organisationPreview({mode:'admin'}),/Unknown preview mode/);
});
test('P09C association sketch projects metadata only and skips archived teams',()=>{
  const p=organisationPreview({clubs,teams,mode:'association',teamId:'t1'});
  assert.equal(p.totalClubs,2);
  assert.equal(p.totalTeams,3);
  assert.deepEqual(p.teams.map(x=>x.id),['t1','t2','t3']);
  assert.equal(p.teams[2].clubName,'No managed club');
  const out=JSON.stringify(p);
  assert.ok(!out.includes(secret));
  for(const banned of ['players','phone','email','notes','teamPass','officials','registration','jerseys','privateHealth','logo']){
    assert.ok(!out.includes('"'+banned+'":'),banned+' must not be projected');
  }
  assert.match(p.description,/No association relationship or access is verified/);
});
test('P09C club preview chooses exact local club and cannot reach another club',()=>{
  const p=organisationPreview({clubs,teams,mode:'club',clubId:'c2'});
  assert.deepEqual(p.teams.map(x=>x.id),['t2']);
  assert.equal(p.selectedClubId,'c2');
  assert.match(p.description,/not a club administrator account/);
  const stale=organisationPreview({clubs,teams,mode:'club',clubId:'external'});
  assert.equal(stale.selectedClubId,'c1');
  assert.deepEqual(stale.teams.map(x=>x.id),['t1']);
});
test('P09C manager and individual previews do not fabricate staff identity or roster access',()=>{
  const coach=organisationPreview({clubs,teams,mode:'coach'});
  const individual=organisationPreview({clubs,teams,mode:'individual',teamId:'t2'});
  assert.equal(coach.totalTeams,3);
  assert.deepEqual(individual.teams.map(x=>x.id),['t2']);
  assert.match(individual.description,/actual restricted published team copy/);
  const absent=organisationPreview({clubs,teams,mode:'individual',teamId:'bogus'});
  assert.equal(absent.selectedTeamId,'t1');
  assert.deepEqual(absent.teams.map(x=>x.id),['t1']);
});
