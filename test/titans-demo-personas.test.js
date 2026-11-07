import test from 'node:test';
import assert from 'node:assert/strict';
import {personaSession} from '../site/persona-runtime.js';
import {
  titansDemoAvailable,titansDemoRoleTeams,titansDemoSession,titansDemoProfileLabel
} from '../site/titans-demo-personas.js';

const crew=(role,name)=>({role,name,phone:'',email:''});
function fixture(){
  const make=(id,name,staff)=>({id,team:{name,clubId:'tarenpointtitans',
    sport:id==='testleague'||id==='testtitansmixed10'?'Rugby league':'League tag',
    staff},players:[{id:id+'-player'}],matches:[],archived:false});
  const root=make('testtitans','Titans Open Women’s League Tag',[
    crew('Head coach','Alex Sample'),crew('Assistant coach','Billie Sample'),
    crew('Team manager','Morgan Example'),crew('Trainer','Jules Example')]);
  root.teams=[
    make('testleague','Titans Under 16 Boys Rugby League',[
      crew('Head coach','Chris Example'),crew('Assistant coach','Taylor Sample'),
      crew('Team manager','Riley Example'),crew('Trainer','Sam Example')]),
    make('testtitansgirls12','Titans Under 12 Girls League Tag',[
      crew('Head coach','Dana Sample'),crew('Assistant coach','Jamie Example'),
      crew('Team manager','Robin Example'),crew('Trainer','Kerry Sample')]),
    make('testtitansmixed10','Titans Under 10 Mixed Rugby League',[
      crew('Head coach','Pat Sample'),crew('Assistant coach','Drew Example'),
      crew('Team manager','Casey Sample'),crew('Trainer','Lee Example')])
  ];
  root.clubs=[{id:'tarenpointtitans',name:'Taren Point Titans'}];
  root.testLibrary={version:3,day:'2026-11-07'};
  return root;
}

test('Titans assignments require exact disposable library IDs, club and staff roles',()=>{
  const ws=fixture(),original=JSON.stringify(ws);
  assert.equal(titansDemoAvailable(ws),true);
  assert.equal(titansDemoAvailable({...ws,testLibrary:null}),false);
  assert.equal(titansDemoAvailable({...ws,teams:ws.teams.slice(1)}),false);
  const imposter=fixture();
  imposter.teams[1].team.clubId='anotherclub';
  assert.equal(titansDemoAvailable(imposter),false);
  assert.equal(titansDemoRoleTeams(ws,'qa-13','staff'),null);
  assert.equal(titansDemoRoleTeams(ws,'qa-07','team_manager').length,0);
  assert.equal(titansDemoSession(ws,personaSession('qa-19')),null);
  assert.equal(JSON.stringify(ws),original);
});

test('Coach, Assistant, Manager and Trainer keep original P12 contexts and can explicitly select Titans',()=>{
  const ws=fixture();
  for(const [id,role,expected,name] of [
    ['qa-07','team_coach','testtitans','Alex Sample'],
    ['qa-08','team_assistant','testtitans','Billie Sample'],
    ['qa-09','team_manager','testtitans','Morgan Example'],
    ['qa-12','staff','testtitans','Jules Example']]){
    const base=personaSession(id);
    const p12=titansDemoSession(ws,base);
    assert.equal(p12.contextId,base.contextId,id);
    assert.equal(p12.team?.id,base.team?.id,id);
    assert.equal(p12.contexts.length,base.contexts.length+2,id);
    assert.equal(p12.demoTitans,undefined,id);
    const view=titansDemoSession(ws,base,`titans-demo:${id}:${role}:team:${expected}`);
    assert.equal(view.role,role,id);
    assert.equal(view.team.id,expected,id);
    assert.equal(view.demoPerson,name,id);
    assert.equal(view.demoTitans,true,id);
    assert.equal(view.allowedTeams.length,2,id);
    assert.equal(view.context.group.type,'team',id);
    assert.equal(view.context.group.id,expected,id);
    assert.match(titansDemoProfileLabel(ws,id),/Titans.*\\(demo\\)/,id);
    for(const target of view.allowedTeams){
      const switched=titansDemoSession(ws,base,target.contextId);
      assert.equal(switched.team.id,target.id,id);
      assert.equal(switched.contextId,target.contextId,id);
      assert.equal(switched.allowedTeams.length,2,id);
    }
    assert.equal(titansDemoSession(ws,base,'titans-demo:forged:team:testleague')?.contextId,
      base.contextId,id);
    assert.deepEqual(titansDemoRoleTeams(ws,id,role).map(t=>t.id),
      view.allowedTeams.map(t=>t.id));
  }
});

test('Trainer appointment is read-only participation, not a Coach role or credential grant',()=>{
  const ws=fixture(),trainer=titansDemoSession(ws,personaSession('qa-12'),
    'titans-demo:qa-12:staff:team:testtitans');
  assert.equal(trainer.context.kind,'membership');
  assert.equal(trainer.accessGrant,false);
  assert.deepEqual(trainer.capabilities,[]);
  assert.equal(trainer.role,'staff');
  assert.equal(titansDemoRoleTeams(ws,'qa-12','team_coach').length,0);
  assert.equal(titansDemoRoleTeams(ws,'qa-12','team_manager').length,0);
  const coach=titansDemoSession(ws,personaSession('qa-07'),
    'titans-demo:qa-07:team_coach:team:testtitans');
  assert.equal(coach.context.kind,'access');
  assert.equal(coach.context.group.id,'testtitans');
});

test('Missing team-specific staffing cannot invent an assignment or reuse unrelated QA roster',()=>{
  const ws=fixture();
  ws.team.staff=ws.team.staff.filter(x=>x.role!=='Trainer');
  const trainer=titansDemoSession(ws,personaSession('qa-12'),
    'titans-demo:qa-12:staff:team:testtitansmixed10');
  assert.equal(trainer.allowedTeams.length,1);
  assert.equal(trainer.team.id,'testtitansmixed10');
  assert.equal(titansDemoProfileLabel(ws,'qa-12')?.includes('Lee Example'),true);
  ws.teams[2].team.staff=ws.teams[2].team.staff.filter(x=>x.role!=='Trainer');
  assert.equal(titansDemoSession(ws,personaSession('qa-12')),null);
  assert.equal(titansDemoRoleTeams(ws,'qa-12','staff').length,0);
});
