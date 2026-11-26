import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from consolidated_release import Stop,sha
from forward_release_plan import validate_spec,check_source_inventory,ci
from forward_release import check_additive_reference,initial_guard,exact_plan
ROOT=Path(__file__).resolve().parents[2]
SPEC=json.loads((ROOT/'config/releases/pr300.json').read_text())
class Canon:
    @staticmethod
    def canonical(x):return x
    @staticmethod
    def identity_sql():return 'true'
class ForwardReleaseTests(unittest.TestCase):
    def test_spec_negative_controls(self):
        validate_spec(SPEC)
        for key,val in [('existingSchemaChanges',['old']),('ruleActivation','ACTIVE'),('newEmptyTables',['x;drop table a']),('migrations',['../evil.sql'])]:
            p=copy.deepcopy(SPEC);p[key]=val
            with self.assertRaises(Stop):validate_spec(p)
        p=copy.deepcopy(SPEC);p['accepted']['ownerAcceptance']['passed']=0
        with self.assertRaises(Stop):validate_spec(p)
    def test_additive_reference_preserves_old_objects(self):
        base={'relation:old':{'kind':'r'}}
        target=dict(base,**{'relation:'+x:{'kind':'r'} for x in SPEC['newEmptyTables']})
        check_additive_reference(base,target,base,Canon,SPEC)
        for bad in [{**target,'relation:old':{'kind':'v'}},{**target,'relation:unexpected':{}},base]:
            with self.assertRaises(Stop):check_additive_reference(base,bad,base,Canon,SPEC)
        with self.assertRaises(Stop):check_additive_reference(base,target,{},Canon,SPEC)
        self.assertIn('matchday_rules_profiles',initial_guard(Canon,SPEC))
    def test_exact_ci_jobs_and_source(self):
        source='a'*40
        run={'head_sha':source,'event':'push','head_branch':'candidate/pr300-match-day-operations','name':'Tests','status':'completed','conclusion':'success'}
        jobs={'total_count':4,'jobs':[{'name':name,'status':'completed','conclusion':'success'} for name in ('test','browser','browser-webkit','stage1-postgres')]}
        with patch('forward_release_plan.api',side_effect=[run,jobs]):
            self.assertEqual(ci(source,'push',run['head_branch'],1)['status'],'PASS')
        jobs['jobs'][0]['conclusion']='failure'
        with patch('forward_release_plan.api',side_effect=[run,jobs]),self.assertRaises(Stop):ci(source,'push',run['head_branch'],1)
    def test_plan_mode_and_exception_hold(self):
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/'plan.json'
            p={'format':'TEAM_MANAGER_FORWARD_V1','mode':'candidate','spec':SPEC,'spec_path':'config/releases/pr300.json',
               'source':'a'*40,'source_tree':'b'*40,'main':SPEC['developmentBase'],
               'previous':{'directory':'example','plan_path':'example','summary_sha256':'c'*64,'reference_sha256':'d'*64},
               'prior_migrations':[{'file':'supabase/migrations/202610%02d000000_old.sql'%n,'sha256':'e'*64} for n in range(1,23)],
               'migrations':[{'file':'supabase/migrations/'+n,'sha256':'f'*64} for n in SPEC['migrations']],
               'ci':[{'source':'a'*40,'event':'push','branch':SPEC['candidateBranch'],'run_id':1,'status':'PASS'}]}
            path.write_text(json.dumps(p))
            self.assertEqual(exact_plan(path,sha(path),'qualify'),p)
            with self.assertRaises(Stop):exact_plan(path,sha(path),'install')
            wrong=copy.deepcopy(p);wrong['ci'][0]['source']='0'*40;path.write_text(json.dumps(wrong))
            with self.assertRaises(Stop):exact_plan(path,sha(path),'qualify')
            p['release_exception']={};path.write_text(json.dumps(p))
            with self.assertRaises(Stop):exact_plan(path,sha(path),'qualify')
if __name__=='__main__':unittest.main()
