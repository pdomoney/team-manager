import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from consolidated_release import Stop,sha
from forward_release_plan import validate_spec,check_source_inventory,ci,validate_plan_structure,validate_control_contract,normal_merge,check_release_authority,build_candidate_plan,build_merged_plan
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
class PostMergeTests(unittest.TestCase):
    def setUp(self):
        self.app='a'*40;self.head='b'*40;self.tree='c'*40
        self.spec=copy.deepcopy(SPEC)
        self.plan={'format':'TEAM_MANAGER_FORWARD_V1','mode':'postmerge','qualification_phase':'postmerge',
          'spec_path':'config/releases/pr300.json','spec':self.spec,'source':self.app,'source_tree':self.tree,
          'candidate_source':self.head,'main':self.app,
          'previous':{'directory':'example','plan_path':'example','summary_sha256':'d'*64,'reference_sha256':'e'*64},
          'prior_migrations':[{'file':'supabase/migrations/202610%02d000000_old.sql'%n,'sha256':'e'*64} for n in range(1,23)],
          'migrations':[{'file':'supabase/migrations/'+n,'sha256':'f'*64} for n in SPEC['migrations']],
          'ci':[self.ci(self.head,'push',SPEC['candidateBranch'],1),self.ci(self.head,'pull_request',SPEC['candidateBranch'],2),self.ci(self.app,'push','main',3)]}
    @staticmethod
    def ci(source,event,branch,run):
        return {'source':source,'event':event,'branch':branch,'run_id':run,'status':'PASS'}
    def test_postmerge_qualification_only_and_final_plan(self):
        validate_plan_structure(self.plan)
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/'plan.json';path.write_text(json.dumps(self.plan))
            self.assertEqual(exact_plan(path,sha(path),'qualify'),self.plan)
            with self.assertRaises(Stop):exact_plan(path,sha(path),'install')
            p=dict(self.plan,mode='merged',candidate_evidence={'summary_sha256':'a'*64,'plan_sha256':'b'*64})
            path.write_text(json.dumps(p));self.assertEqual(exact_plan(path,sha(path),'install'),p)
            with self.assertRaises(Stop):exact_plan(path,sha(path),'qualify')
    def test_normal_merge_requires_exact_parents_tree_and_pr(self):
        repo='test'
        pr={'number':300,'merged':True,'merge_commit_sha':self.app,'head':{'sha':self.head,'ref':SPEC['candidateBranch'],'repo':{'full_name':'pdomoney/team-manager'}},'base':{'ref':'main','repo':{'full_name':'pdomoney/team-manager'}}}
        parents=' '.join([self.app,SPEC['developmentBase'],self.head])
        with patch('forward_release_plan.api',return_value=pr),patch('forward_release_plan.git',side_effect=[parents,self.tree,self.tree]):
            normal_merge(repo,300,SPEC['candidateBranch'],SPEC['developmentBase'],self.head,self.app,self.tree)
        for rows in [[parents+' '+'9'*40],[parents,self.tree,'9'*40],[' '.join([self.app,self.head,SPEC['developmentBase']])]]:
            with patch('forward_release_plan.api',return_value=pr),patch('forward_release_plan.git',side_effect=rows),self.assertRaises(Stop):
                normal_merge(repo,300,SPEC['candidateBranch'],SPEC['developmentBase'],self.head,self.app,self.tree)
        with patch('forward_release_plan.api',return_value=dict(pr,merged=False)),self.assertRaises(Stop):
            normal_merge(repo,300,SPEC['candidateBranch'],SPEC['developmentBase'],self.head,self.app,self.tree)
    def test_control_plan_cannot_expand_scope_or_skip_ci(self):
        c=json.loads((ROOT/'config/releases/pr300-control.json').read_text())
        c.update(applicationSource=self.app,applicationCandidate=self.head,applicationTree=self.tree)
        validate_control_contract(c,self.spec)
        p=copy.deepcopy(self.plan);p['main']='8'*40;p['control']={'path':'config/releases/pr300-control.json','contract':c,'head':'7'*40,'source':'8'*40,'tree':'9'*40}
        p['ci']+= [self.ci('7'*40,'push',c['controlBranch'],4),self.ci('7'*40,'pull_request',c['controlBranch'],5),self.ci('8'*40,'push','main',6)]
        validate_plan_structure(p)
        for bad in [dict(p,ci=p['ci'][:3]),dict(p,main='6'*40),dict(p,qualification_phase=None)]:
            with self.assertRaises(Stop):validate_plan_structure(bad)
        wrong=copy.deepcopy(p);wrong['control']['contract']['changedPaths']=sorted(c['changedPaths']+['site/cloud-team.js'])
        with self.assertRaises(Stop):validate_plan_structure(wrong)
        wrong=copy.deepcopy(p);wrong['control']['contract']['applicationSource']='6'*40
        with self.assertRaises(Stop):validate_plan_structure(wrong)
    def test_postmerge_finalization_uses_merged_source_evidence(self):
        p=self.plan
        with tempfile.TemporaryDirectory() as t:
            path=Path(t)/'plan.json';path.write_text(json.dumps(p))
            evidence={'directory':'example','summary_sha256':'a'*64,'plan_sha256':sha(path)}
            with patch('forward_release_plan.git'),patch('forward_release_plan.check_release_authority'),patch('forward_release_plan.check_ci_records'),patch('forward_release_plan.spec_for',return_value=self.spec),patch('forward_release_plan.check_source_inventory',return_value=(p['prior_migrations'],p['migrations'])),patch('forward_release_plan.accepted_evidence',return_value=(p['previous'],{})),patch('forward_release_plan.validate_candidate_summary',return_value=evidence) as check:
                merged=build_merged_plan('repo',path,sha(path),'example')
                self.assertEqual(check.call_args.args[1]['source'],self.app)
                self.assertEqual(merged['candidate_source'],self.head)
                self.assertEqual(merged['source'],self.app)
                self.assertEqual(merged['mode'],'merged')
                self.assertEqual(merged['candidate_evidence'],evidence)
                validate_plan_structure(merged)
class Stage4ReleaseTests(unittest.TestCase):
    def test_reviewed_release_contract(self):
        s=json.loads((ROOT/'config/releases/pr308.json').read_text())
        validate_spec(s)
        for change in ('path','collection','recovery'):
            p=copy.deepcopy(s)
            if change=='path':p['stage4']['releasePaths'].append('site/app.js')
            if change=='collection':p['stage4']['freeAccountCollection']='ENABLED'
            if change=='recovery':p['accepted']['browserRecovery']['recordFile']='../outside.json'
            with self.assertRaises(Stop):validate_spec(p)
    def test_hold_reconciliation_requires_exact_browser_evidence(self):
        from forward_release_plan import accepted_evidence
        s=json.loads((ROOT/'config/releases/pr308.json').read_text())
        a=s['accepted']
        with tempfile.TemporaryDirectory() as t:
            p=Path(t);plan=p/'plan.json';plan.write_text('{}');a['plan']=sha(plan)
            v=p/'asset-verification.json';v.write_text('{}');a['browserRecovery']['verificationSha256']=sha(v)
            summary={'source':a['source'],'plan_sha256':a['plan'],'candidate_manifest_sha256':a['manifest'],'R4':'VERIFIED','R5':'INSTALLED','encrypted_assets_verified':8,
              'status':'INSTALLED_VERIFICATION_HOLD_NO_REDEPLOY','checks':{k:'PASS' for k in ('tools','source','build_and_transport','synthetic_reference','database_baseline','worker_baseline','live_baseline_assets')},
              'new_worker':dict(a['worker'],required_secret_present=True,prior_version_available=True),'verification':{'passed':168,'total':168,'holds':[],'anonymousAuth':{'browser_fallback_eligible':True}},
              'verification_evidence_sha256':sha(v),'browser_nonce':'synthetic-nonce'}
            (p/'release-summary.json').write_text(json.dumps(summary));(p/'reference-candidate-private.json').write_text('{}')
            record={'origin':'https://team-manager.paul-domoney.workers.dev','version_id':a['worker']['version_id'],'manifest_sha256':a['manifest'],'nonce':summary['browser_nonce'],'http_status':401,'content_type':'application/json','ray_id':'0123456789abcdef-SYD','ok':False,'code':'unauthenticated','canProceed':False}
            f=p/'pr308-baseline-browser.json';f.write_text(json.dumps(record))
            with patch('forward_release_plan.safe_private',side_effect=lambda p,**kw:Path(p)),patch('forward_release_plan.candidate_check',return_value=[]),patch('forward_release_plan.expected_assets',return_value={str(n):'x' for n in range(168)}):
                before=sha(p/'release-summary.json')
                result,_=accepted_evidence(s,p,plan)
                self.assertEqual(result['browser_record_sha256'],sha(f))
                self.assertEqual(before,sha(p/'release-summary.json'))
                for key,val in [('http_status',403),('nonce','different'),('version_id','wrong')]:
                    f.write_text(json.dumps(dict(record,**{key:val})))
                    with self.assertRaises(Stop):accepted_evidence(s,p,plan)
if __name__=='__main__':unittest.main()
