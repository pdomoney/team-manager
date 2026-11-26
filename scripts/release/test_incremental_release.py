import json, tempfile, unittest
from pathlib import Path
from incremental_release import (BASE, BASE_CONTROL, BASE_MANIFEST, BASE_PLAN, BASE_EXCEPTION,
 DATA, OLD_VERSION, OLD_DEPLOYMENT, MIGRATIONS, ORIGIN, Stop, sha, exact_plan,
 validate_previous_summary, anonymous_result, check_browser_record, browser_probe)

class IncrementalReleaseTest(unittest.TestCase):
 def plan(self):
  return {'release_kind':'PR297_INCREMENTAL','base':BASE,'base_control':BASE_CONTROL,'data_branch_sha':DATA,
   'source':'1'*40,'previous_worker':{'version_id':OLD_VERSION,'deployment_id':OLD_DEPLOYMENT},
   'prior_manifest_sha256':BASE_MANIFEST,'prior_plan_sha256':BASE_PLAN,
   'ci':{'source':'1'*40,'status':'PASS','node':True,'postgres':True,'chromium':True,'webkit':True,'run_id':123,'event':'push_main'},
   'migrations':[{'file':'supabase/migrations/'+MIGRATIONS[0],'sha256':'2'*64}]}
 def test_exact_forward_plan(self):
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'plan.json';p=self.plan()
   def put():path.write_text(json.dumps(p));return sha(path)
   self.assertEqual(exact_plan(path,put()),p)
   for key,value in [('base',BASE_CONTROL),('prior_plan_sha256','0'*64),('release_exception',{}),('previous_worker',{}),('migrations',[])]:
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
   'content_type':'application/json','ok':False,'code':'unauthenticated','canProceed':False,'ray_id':'a6048146eb7edb4d-SYD'}
  check_browser_record(report,record)
  self.assertIn('credentials:',browser_probe(report))
  for key,value in [('version_id','other'),('nonce','wrong'),('http_status',403),('canProceed',True)]:
   with self.subTest(key=key),self.assertRaises(Stop):check_browser_record(report,dict(record,**{key:value}))
  report['verification']['holds']=[{'path':'/cloud-team.html'}]
  with self.assertRaises(Stop):check_browser_record(report,record)

if __name__=='__main__':unittest.main()
