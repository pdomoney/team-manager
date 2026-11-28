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
class Stage4ArchivedCheckerTests(unittest.TestCase):
    def test_explicit_checker_preserves_archived_helper_and_frozen_source(self):
        import subprocess
        from types import SimpleNamespace
        from forward_release import build_stage4_candidate
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);work=root/'source';work.mkdir()
            (work/'scripts').mkdir()
            module=work/'scripts/stage3d3-existing-worker-release-check.mjs'
            module.write_text("export function verifyExistingWorkerRelease(o){"
              "if(o.configPath!==o.root+'/wrangler.stage3d4-existing.jsonc'||o.sourceSha!=='"+"a"*40+"')throw Error('wrong descriptor or source');"
              "return {stage4TacticsEnabled:true,encryptedFilesVerified:8};}")
            calls=[]
            def run(argv,**kw):
                calls.append(list(map(str,argv)))
                if argv[1]=='src/build.js':return 'original build'
                return subprocess.check_output(argv,cwd=kw['cwd'],text=True)
            def worker_candidate(w,o,r):
                q.run(['node','src/build.js'],cwd=w)
                result=json.loads(q.run(['node','scripts/stage3d3-existing-worker-release-check.mjs'],cwd=w))
                self.assertTrue(result['stage4TacticsEnabled'])
            q=SimpleNamespace(tool=lambda n:n,run=run,worker_candidate=worker_candidate)
            build_stage4_candidate(q,work,root,{},'a'*40)
            self.assertIs(q.run,run)
            self.assertEqual(calls[0],['node','src/build.js'])
            self.assertEqual(calls[1],calls[2])
            self.assertTrue((root/'stage4-descriptor-verification.json').is_file())
            q.worker_candidate=lambda *a:None
            with self.assertRaisesRegex(Stop,'not observed'):
                build_stage4_candidate(q,work,root,{},'a'*40)
            self.assertIs(q.run,run)
            def wrong_dir(w,o,r):q.run(['node','scripts/stage3d3-existing-worker-release-check.mjs'],cwd=root)
            q.worker_candidate=wrong_dir
            with self.assertRaisesRegex(Stop,'Unexpected archived checker'):
                build_stage4_candidate(q,work,root,{},'a'*40)
            self.assertIs(q.run,run)
    def test_correction_contract_binds_only_reviewed_release_paths(self):
        s=json.loads((ROOT/'config/releases/pr308.json').read_text())
        c=json.loads((ROOT/'config/releases/pr308-control.json').read_text())
        validate_control_contract(c,s)
        for change in ('identity','path'):
            p=copy.deepcopy(c)
            if change=='identity':p['controlPr']=311
            else:p['changedPaths']=sorted(p['changedPaths']+['site/app.js'])
            with self.assertRaises(Stop):validate_control_contract(p,s)
class Stage4ReferenceTests(unittest.TestCase):
    def plan(self):
        rows=[{'file':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))]
        self.assertEqual(len(rows),26)
        return {'prior_migrations':rows[:24],'migrations':rows[24:]}
    def test_sequence_and_checksums(self):
        from forward_release import stage4_sql_sequence
        p=self.plan();paths=stage4_sql_sequence(ROOT,p)
        self.assertEqual(len(paths),41)
        self.assertEqual(paths[-1],'supabase/tests/stage4_play_assignments_disposable.sql')
        p['migrations'][0]['sha256']='0'*64
        with self.assertRaisesRegex(Stop,'checksum'):stage4_sql_sequence(ROOT,p)
    def test_replay_locale_checkpoints_and_failure(self):
        from contextlib import contextmanager
        from types import SimpleNamespace
        from forward_release import stage4_reference
        p=self.plan()
        with tempfile.TemporaryDirectory() as t:
            out=Path(t);executed=[]
            def run(argv,**kw):
                env=kw['env']
                self.assertEqual((env['LC_ALL'],env['LANG'],env['LC_CTYPE'],env['TZ']),('C','C','C','UTC'))
                self.assertNotIn('UNRELATED_SETTING',env)
            @contextmanager
            def cluster(pg,d,name,psql):
                q.run(['pg_ctl','start'],env={'HOME':'/tmp','UNRELATED_SETTING':'synthetic','LC_ALL':'bad'})
                try:yield {'PGHOST':'/tmp/private-socket','PGDATABASE':'postgres'},d
                finally:q.run(['pg_ctl','stop'],env={'HOME':'/tmp'})
            def sqlfile(psql,env,path,log):
                self.assertEqual(env['PGHOST'],'/tmp/private-socket')
                q.run(['psql','-f',str(path)],env=env)
                executed.append(path.name)
            def catalogue(psql,env):return {'objects':{'checkpoint':executed[-1]}}
            q=SimpleNamespace(run=run,local_cluster=cluster,sqlfile=sqlfile,catalogue=catalogue)
            base,target=stage4_reference(q,ROOT,out,Path('/pg'),'/psql',p)
            self.assertEqual(len(executed),41)
            self.assertEqual(base['checkpoint'],Path(p['prior_migrations'][-1]['file']).name)
            self.assertEqual(target['checkpoint'],Path(p['migrations'][-1]['file']).name)
            self.assertIs(q.run,run)
            self.assertEqual(json.loads((out/'reference-replay.json').read_text())['completed'],41)
            def fail(*a):raise RuntimeError('synthetic failure')
            q.sqlfile=fail
            with self.assertRaisesRegex(Stop,'0/41 scripts completed'):stage4_reference(q,ROOT,out,Path('/pg'),'/psql',p)
            self.assertIs(q.run,run)
            @contextmanager
            def remote(*a):yield {'PGHOST':'nonlocal.example'},out
            q.local_cluster=remote
            with self.assertRaisesRegex(Stop,'socket absent'):stage4_reference(q,ROOT,out,Path('/pg'),'/psql',p)
            self.assertIs(q.run,run)
    def test_control_chain_and_ci(self):
        from forward_release_plan import control_for,control_ci_sources
        s=json.loads((ROOT/'config/releases/pr308.json').read_text())
        c=json.loads((ROOT/'config/releases/pr308-control.json').read_text())
        h=c['priorControl'];app=c['applicationSource'];candidate=c['applicationCandidate'];tree=c['applicationTree']
        historical=dict(c,controlPr=h['pr'],controlBranch=h['branch'],changedPaths=[
          'config/releases/pr308-control.json','docs/operations/pr308-checker-correction.md',
          'scripts/release/forward_release.py','scripts/release/forward_release_plan.py','scripts/release/test_forward_release.py'])
        del historical['priorControl']
        main='a'*40;head='b'*40;mt='c'*40
        def git_call(repo,*args,**kw):
            if args[0]=='show':return json.dumps(historical if args[1].startswith(h['source']+':') else c).encode()
            if args[0]=='rev-parse':return head if args[1].endswith('^2') else mt
            if args[0]=='diff':return '\n'.join(historical['changedPaths'] if args[-1]==h['source'] else c['changedPaths'])
            raise AssertionError(args)
        with patch('forward_release_plan.git',side_effect=git_call),patch('forward_release_plan.normal_merge') as merge,patch('forward_release_plan.spec_for',return_value=s):
            actual=control_for('repo',s,main,'config/releases/pr308-control.json',app,candidate,tree)
            self.assertEqual(merge.call_count,2)
            self.assertEqual(merge.call_args_list[0].args[3],app)
            self.assertEqual(merge.call_args_list[1].args[3],h['source'])
            rows=control_ci_sources(actual)
            self.assertEqual(len(rows),6)
            self.assertEqual(rows[2],(h['source'],'push','main'))
            self.assertEqual(rows[-1],(main,'push','main'))
        bad=copy.deepcopy(c);bad['priorControl']['source']='0'*40
        with self.assertRaises(Stop):validate_control_contract(bad,s)
class PR311CorrectiveReleaseTests(unittest.TestCase):
    def setUp(self):
        self.spec=json.loads((ROOT/'config/releases/pr311.json').read_text())
        self.control=json.loads((ROOT/'config/releases/pr311-control.json').read_text())
    def test_only_exact_rejected_baseline_can_be_corrected(self):
        validate_spec(self.spec)
        validate_control_contract(self.control,self.spec)
        for key,value in [('migrations',['20261129010000_unapproved.sql']),('newEmptyTables',['extra']),('releaseId','PR313')]:
            bad=copy.deepcopy(self.spec);bad[key]=value
            with self.assertRaises(Stop):validate_spec(bad)
        for key in self.spec['corrective']:
            bad=copy.deepcopy(self.spec);bad['corrective'][key]='changed'
            with self.assertRaises(Stop):validate_spec(bad)
        bad=copy.deepcopy(self.spec);bad['accepted']['ownerAcceptance']['status']='OWNER_ACCEPTED'
        with self.assertRaises(Stop):validate_spec(bad)
        bad=copy.deepcopy(self.control);bad['changedPaths']=sorted(bad['changedPaths']+['site/app.js'])
        with self.assertRaises(Stop):validate_control_contract(bad,self.spec)
    def test_application_spec_only_on_merged_control(self):
        from forward_release_plan import application_spec_for
        app=self.spec['corrective']['applicationSource'];main='c'*40
        with patch('forward_release_plan.git',return_value=''),patch('forward_release_plan.spec_for',return_value=self.spec) as read:
            self.assertEqual(application_spec_for('repo',self.spec,app,main,'config/releases/pr311.json'),self.spec)
            read.assert_called_once_with('repo',main,'config/releases/pr311.json')
            with self.assertRaises(Stop):application_spec_for('repo',self.spec,app,app,'config/releases/pr311.json')
        with patch('forward_release_plan.git',return_value='config/releases/pr311.json'),self.assertRaises(Stop):
            application_spec_for('repo',self.spec,app,main,'config/releases/pr311.json')
    def test_zero_schema_change_and_full_replay(self):
        from forward_release import stage4_sql_sequence
        old={'relation:old':{'kind':'r'}}
        check_additive_reference(old,old,old,Canon,self.spec)
        with self.assertRaises(Stop):check_additive_reference(old,dict(old,**{'function:unexpected':{}}),old,Canon,self.spec)
        rows=[{'file':str(p.relative_to(ROOT)),'sha256':sha(p)} for p in sorted((ROOT/'supabase/migrations').glob('*.sql'))]
        self.assertEqual(len(rows),26)
        self.assertEqual(len(stage4_sql_sequence(ROOT,{'prior_migrations':rows,'migrations':[]})),41)
if __name__=='__main__':unittest.main()
