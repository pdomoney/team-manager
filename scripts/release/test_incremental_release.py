import copy, json, tempfile, unittest
from unittest.mock import patch
from pathlib import Path
from incremental_release import (BASE, BASE_CONTROL, BASE_MANIFEST, BASE_PLAN, BASE_EXCEPTION,
 DATA, OLD_VERSION, OLD_DEPLOYMENT, MIGRATIONS, ORIGIN, Stop, sha, exact_plan,
 validate_previous_summary, anonymous_result, check_browser_record, browser_probe,
 RECOVERY_ID, RECOVERY_APPLICATION, RECOVERY_CANDIDATE, RECOVERY_TREE, RECOVERY_PATHS,
 RECOVERY_CANDIDATE_RUN, RECOVERY_PR_RUN, RECOVERY_MAIN_RUN, main_ref, check_recovery_source, verify_candidate_evidence)

class IncrementalReleaseTest(unittest.TestCase):
 def plan(self):
  return {'release_kind':'PR297_INCREMENTAL','base':BASE,'base_control':BASE_CONTROL,'data_branch_sha':DATA,
   'source':'1'*40,'previous_worker':{'version_id':OLD_VERSION,'deployment_id':OLD_DEPLOYMENT},
   'prior_manifest_sha256':BASE_MANIFEST,'prior_plan_sha256':BASE_PLAN,
   'ci':{'source':'1'*40,'status':'PASS','node':True,'postgres':True,'chromium':True,'webkit':True,'run_id':123,'event':'push_main'},
   'migrations':[{'file':'supabase/migrations/'+MIGRATIONS[0],'sha256':'2'*64}],
   'candidate_helper':{'source':'3'*40,'tree':'4'*40,'summary_sha256':'5'*64,'plan_sha256':'6'*64}}
 def test_exact_forward_plan(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'plan.json';p=self.plan()
   def put():path.write_text(json.dumps(p));return sha(path)
   self.assertEqual(exact_plan(path,put()),p)
   for key,value in [('base',BASE_CONTROL),('prior_plan_sha256','0'*64),('release_exception',{}),('previous_worker',{}),('migrations',[]),('candidate_helper',{})]:
    p=self.plan();p[key]=value
    with self.subTest(key=key),self.assertRaises(Stop):exact_plan(path,put())
   p=self.plan();p['ci']['webkit']=False
   with self.assertRaises(Stop):exact_plan(path,put())
   p=self.plan();p['ci']['event']='push_candidate'
   self.assertEqual(exact_plan(path,put(),True),p)
   with self.assertRaises(Stop):exact_plan(path,put())
 def test_prior_installed_checkpoint(self):
  j={'source':BASE,'plan_sha256':BASE_PLAN,'R4':'VERIFIED','R5':'INSTALLED','errors':[],
   'candidate_manifest_sha256':BASE_MANIFEST,'candidate_file_count':172,'encrypted_assets_verified':8,
   'new_worker':{'version_id':OLD_VERSION,'deployment_id':OLD_DEPLOYMENT,'required_secret_present':True,'prior_version_available':True},
   'verification':{'passed':166,'total':166,'holds':[]},
   'release_exception':{'id':'TM-EX-001','historical_provenance':'UNRESOLVED','evidence_sha256':BASE_EXCEPTION}}
  validate_previous_summary(j)
  j['R4']='COMMITTED'
  with self.assertRaises(Stop):validate_previous_summary(j)
 def test_anonymous_classification(self):
  good={'ok':False,'code':'unauthenticated','canProceed':False}
  self.assertTrue(anonymous_result(401,'application/json; charset=utf-8',good)['expectedDenial'])
  self.assertFalse(anonymous_result(403,'application/json',good)['browser_fallback_eligible'])
  self.assertTrue(anonymous_result(403,'text/html',None)['browser_fallback_eligible'])
  self.assertFalse(anonymous_result(200,'application/json',good)['expectedDenial'])
 def test_browser_record_scope(self):
  report={'new_worker':{'version_id':'installed'},'candidate_manifest_sha256':'a'*64,'browser_nonce':'b'*32,
   'verification':{'passed':10,'total':10,'holds':[],'anonymousAuth':{'browser_fallback_eligible':True}}}
  record={'origin':ORIGIN,'version_id':'installed','manifest_sha256':'a'*64,'nonce':'b'*32,'http_status':401,
   'content_type':'application/json','ok':False,'code':'unauthenticated','canProceed':False,'ray_id':'0123456789abcdef-SYD'}
  check_browser_record(report,record)
  self.assertIn('credentials:',browser_probe(report))
  for key,value in [('version_id','other'),('nonce','wrong'),('http_status',403),('canProceed',True)]:
   with self.subTest(key=key),self.assertRaises(Stop):check_browser_record(report,dict(record,**{key:value}))
  report['verification']['holds']=[{'path':'/cloud-team.html'}]
  with self.assertRaises(Stop):check_browser_record(report,record)

 def recovery_plan(self):
  p=self.plan()
  def ci(source,event,run):
   return {'source':source,'event':event,'run_id':run,'status':'PASS','node':True,'postgres':True,'chromium':True,'webkit':True}
  p['source']=RECOVERY_APPLICATION;p['ci']=ci(RECOVERY_APPLICATION,'push_main',RECOVERY_MAIN_RUN)
  p['recovery']={'id':RECOVERY_ID,'candidate':RECOVERY_CANDIDATE,'tree':RECOVERY_TREE,
   'candidate_ci':ci(RECOVERY_CANDIDATE,'push_candidate',RECOVERY_CANDIDATE_RUN),
   'pr_ci':ci(RECOVERY_CANDIDATE,'pull_request',RECOVERY_PR_RUN),
   'control_source':'7'*40,'control_ci':ci('7'*40,'push_main',456)}
  p['candidate_helper'].update(source=RECOVERY_APPLICATION,tree=RECOVERY_TREE)
  return p
 def test_recovery_exact_plans_and_negative_controls(self):
  with tempfile.TemporaryDirectory() as t:
   f=Path(t)/'plan.json';p=self.recovery_plan()
   def validate(v,candidate=True):
    f.write_text(json.dumps(v));return exact_plan(f,sha(f),candidate)
   self.assertEqual(validate(p),p)
   self.assertEqual(validate(p,False),p)
   self.assertEqual(main_ref(p,True),'7'*40)
   self.assertEqual(main_ref(self.plan(),True),BASE_CONTROL)
   for path,value in [
    (('source',),'9'*40),(('recovery','tree'),'0'*40),(('recovery','candidate'),'0'*40),
    (('recovery','id'),'another'),(('recovery','candidate_ci','run_id'),1),
    (('recovery','pr_ci','webkit'),False),(('ci','run_id'),1),
    (('recovery','control_source'),RECOVERY_APPLICATION),(('recovery','control_ci','source'),'8'*40),
    (('recovery','control_ci','status'),'FAIL'),(('release_exception',),{})]:
    v=copy.deepcopy(p);target=v
    for key in path[:-1]:target=target[key]
    target[path[-1]]=value
    with self.subTest(path=path),self.assertRaises(Stop):validate(v)
   v=copy.deepcopy(p);del v['recovery']
   with self.assertRaises(Stop):validate(v)
 def test_recovery_git_scope(self):
  p=self.recovery_plan();control=p['recovery']['control_source']
  answers={
   ('rev-parse',RECOVERY_CANDIDATE+'^{tree}'):RECOVERY_TREE,
   ('rev-parse',RECOVERY_APPLICATION+'^{tree}'):RECOVERY_TREE,
   ('rev-parse',RECOVERY_APPLICATION+'^1'):BASE_CONTROL,
   ('rev-parse',RECOVERY_APPLICATION+'^2'):RECOVERY_CANDIDATE,
   ('merge-base',RECOVERY_APPLICATION,control):RECOVERY_APPLICATION,
   ('rev-parse',control+'^1'):RECOVERY_APPLICATION,
   ('diff','--name-only','--no-renames',RECOVERY_APPLICATION,control):'\n'.join(sorted(RECOVERY_PATHS)),
   ('diff','--name-only',RECOVERY_CANDIDATE,RECOVERY_APPLICATION):''}
  class Git:
   def git(self,work,*args):return answers[args]
  check_recovery_source(Git(),None,p)
  for key,value in [(('rev-parse',RECOVERY_APPLICATION+'^{tree}'),'wrong'),
    (('rev-parse',RECOVERY_APPLICATION+'^2'),'wrong'),
    (('rev-parse',control+'^1'),'wrong'),
    (('diff','--name-only','--no-renames',RECOVERY_APPLICATION,control),'site/cloud-team.js'),
    (('diff','--name-only',RECOVERY_CANDIDATE,RECOVERY_APPLICATION),'site/cloud-team.js')]:
   with self.subTest(key=key),patch.dict(answers,{key:value}),self.assertRaises(Stop):check_recovery_source(Git(),None,p)
 def test_recovery_evidence_binding(self):
  p=self.recovery_plan()
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);folder=root/'qualification';folder.mkdir();f=folder/'release-summary.json'
   h=p['candidate_helper']
   j={'source':h['source'],'source_tree':h['tree'],'plan_sha256':h['plan_sha256'],'candidate_only':True,
    'status':'CANDIDATE_HELPERS_QUALIFIED_NO_PROVIDER_ACCESS','errors':[],'R4':'NOT_ATTEMPTED','R5':'NOT_ATTEMPTED',
    'checks':dict.fromkeys(('tools','source','build_and_transport','synthetic_reference'),'PASS'),'recovery':p['recovery']}
   def write(v):
    f.write_text(json.dumps(v));h['summary_sha256']=sha(f)
   write(j)
   with patch('incremental_release.candidate_check') as check:
    verify_candidate_evidence(root,folder,p);check.assert_called_once()
    for key,value in [('recovery',None),('source',RECOVERY_CANDIDATE),('R4','VERIFIED'),('source_tree','wrong')]:
     write(dict(j,**{key:value}))
     with self.subTest(key=key),self.assertRaises(Stop):verify_candidate_evidence(root,folder,p)

if __name__=='__main__':unittest.main()
