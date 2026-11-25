import json, tempfile, unittest
from unittest.mock import patch
import consolidated_release as cr
from pathlib import Path
from consolidated_release import (BASE,DATA,OLD_VERSION,OLD_DEPLOYMENT,MIGRATIONS,
 Stop,sha,exact_plan,strip_wrapper,old_row_expression,candidate_check,expected_assets)
class CutoverTest(unittest.TestCase):
 def test_wrappers(self):
  self.assertEqual(strip_wrapper('-- reviewed\nbegin;\nselect 1;\ncommit;\n'),'-- reviewed\nselect 1;\n')
  for sql in ['select 1;','begin;\nrollback;\ncommit;','begin;\n\\i unsafe.sql\ncommit;','begin;\ncommit;\nselect 1;']:
   with self.subTest(sql=sql),self.assertRaises(Stop):strip_wrapper(sql)
 def test_old_fingerprint(self):
  expr='SELECT md5(to_jsonb(t)::text),md5(to_jsonb(t)::text) FROM "tm_private"."team_message_log" t UNION ALL SELECT md5(to_jsonb(t)::text),md5(to_jsonb(t)::text) FROM "tm_private"."team_notices" t UNION ALL SELECT md5(to_jsonb(t)::text) FROM "auth"."users" t'
  v=old_row_expression(expr)
  self.assertEqual(v.count("-'history_state'"),2);self.assertEqual(v.count("-'removed_at'"),2)
  self.assertIn('SELECT md5(to_jsonb(t)::text) FROM "auth"."users" t',v)
  with self.assertRaises(Stop):old_row_expression('SELECT 1')
 def test_pinned_plan(self):
  source='1'*40
  plan={'base':BASE,'data_branch_sha':DATA,'source':source,'ci':{'source':source,'status':'PASS','node':True,'postgres':True,'chromium':True,'webkit':True},'previous_worker':{'version_id':OLD_VERSION,'deployment_id':OLD_DEPLOYMENT},'migrations':[{'file':'supabase/migrations/'+n,'sha256':'a'*64} for n in MIGRATIONS]}
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'plan.json';p.write_text(json.dumps(plan));self.assertEqual(exact_plan(p,sha(p)),plan)
   with self.assertRaises(Stop):exact_plan(p,'0'*64)
   plan['ci']['webkit']=False;p.write_text(json.dumps(plan))
   with self.assertRaises(Stop):exact_plan(p,sha(p))
 def test_candidate_exact_and_extra_file(self):
  with tempfile.TemporaryDirectory() as t:
   out=Path(t);(out/'source/dist-stage3d3-existing').mkdir(parents=True);(out/'worker-dry-run').mkdir()
   names=['source/wrangler.stage3d4-existing.jsonc','source/dist-stage3d3-existing/cloud-team.html','worker-dry-run/index.js']
   rows=[]
   for name in names:
    p=out/name;p.write_text(name);rows.append({'path':name,'bytes':p.stat().st_size,'sha256':sha(p)})
   manifest=out/'candidate-hashes.json';manifest.write_text(json.dumps(rows));report={'candidate_manifest_sha256':sha(manifest),'candidate_file_count':len(rows)}
   self.assertEqual(candidate_check(out,report),rows)
   (out/'worker-dry-run/extra.js').touch()
   with self.assertRaises(Stop):candidate_check(out,report)
 def test_asset_inventory_from_candidate_not_source(self):
  rows=[{'path':'source/dist-stage3d3-existing/cloud-team.html','sha256':'a'*64},{'path':'source/dist-stage3d3-existing/data/team.enc.json','sha256':'b'*64},{'path':'source/dist-stage3d3-existing/.assetsignore','sha256':'c'*64},{'path':'worker-dry-run/index.js','sha256':'d'*64}]
  self.assertEqual(expected_assets(rows),{'/cloud-team.html':'a'*64,'/data/team.enc.json':'b'*64})
class ReleaseExceptionTest(unittest.TestCase):
 def plan(self):
  return {'source':cr.EXCEPTION_SOURCE,'release_control_source':'2'*40,'release_control_ci':{'source':'2'*40,'status':'PASS','node':True,'postgres':True,'chromium':True,'webkit':True},'script_provenance':{'status':'OWNER_ACCEPTED_UNRESOLVED','exception_id':cr.EXCEPTION_ID,'owner_decision':'ACCEPT_RESIDUAL_RISK','approval_date':'2026-11-26','evidence_ref':'TM-EX-001','evidence_sha256':'a'*64}}
 def test_authority(self):
  p=self.plan();cr.check_exception_plan(p)
  self.assertEqual(cr.installation_authority(p),'INSTALL PR295 TM-EX-001')
  self.assertEqual(cr.main_ref(p),'2'*40)
  normal={'source':'3'*40,'script_provenance':{'status':'CONFIRMED','evidence_ref':'reviewed'}}
  cr.check_exception_plan(normal);self.assertEqual(cr.installation_authority(normal),'INSTALL PR295')
  with self.assertRaises(Stop):cr.installation_authority({'source':cr.EXCEPTION_SOURCE,'script_provenance':{'status':'UNRESOLVED'}})
 def test_wrong_scope_and_ci(self):
  for key,value in [('source','3'*40),('release_control_source',cr.EXCEPTION_SOURCE),('release_control_ci',{})]:
   p=self.plan();p[key]=value
   with self.subTest(key=key),self.assertRaises(Stop):cr.check_exception_plan(p)
  for key,value in [('exception_id','TM-EX-002'),('owner_decision','PENDING'),('approval_date','2026-11-27'),('evidence_sha256','bad'),('evidence_ref','unreviewed')]:
   p=self.plan();p['script_provenance'][key]=value
   with self.subTest(key=key),self.assertRaises(Stop):cr.installation_authority(p)
  p=self.plan();p['release_control_ci']['webkit']=False
  with self.assertRaises(Stop):cr.check_exception_plan(p)
  p=self.plan();p['script_provenance']['status']='CONFIRMED'
  with self.assertRaises(Stop):cr.check_exception_plan(p)
 def test_local_evidence(self):
  p=self.plan()
  with tempfile.TemporaryDirectory() as t:
   path=Path(t)/'evidence.json'
   record={'exception_id':cr.EXCEPTION_ID,'application_source':cr.EXCEPTION_SOURCE,'approval_date':'2026-11-26','owner_decision':'ACCEPT_RESIDUAL_RISK','historical_provenance':'UNRESOLVED','provider_cache_status':'hit','provider_security_action':'unknown','current_html_sha256':cr.EXCEPTION_HTML}
   path.write_text(json.dumps(record));p['script_provenance']['evidence_sha256']=sha(path)
   cr.check_exception_evidence(p,path)
   with self.assertRaises(Stop):cr.check_exception_evidence(p,None)
   record['historical_provenance']='CONFIRMED';path.write_text(json.dumps(record))
   with self.assertRaises(Stop):cr.check_exception_evidence(p,path)
   p['script_provenance']['evidence_sha256']=sha(path)
   with self.assertRaises(Stop):cr.check_exception_evidence(p,path)
 def test_current_integrity_not_waived(self):
  with tempfile.TemporaryDirectory() as t:
   out=Path(t)
   for status in ('PASS','HOLD'):
    with patch.object(cr,'verify_all',return_value={'status':status}) as verify:
     if status=='PASS':cr.exception_html(out,'preflight')
     else:
      with self.assertRaises(Stop):cr.exception_html(out,'preflight')
     verify.assert_called_once_with(cr.ORIGIN,{'/cloud-team.html':cr.EXCEPTION_HTML})
     self.assertEqual(json.loads((out/'exception-html-preflight.json').read_text())['status'],status)
 def test_control_source_exact_scope_and_bytes(self):
  p=self.plan()
  class Git:
   changed=cr.CONTROL_PATHS
   ancestor=cr.EXCEPTION_SOURCE
   blob='a'*40
   def git(self,work,*args):
    if args[0]=='merge-base':return self.ancestor
    if args[0]=='diff':return '\n'.join(sorted(self.changed))
    if args[0]=='hash-object':return self.blob
    if args[0]=='rev-parse':return 'a'*40
    raise AssertionError(args)
  q=Git();cr.check_control_source(q,Path('.'),p)
  q.changed=cr.CONTROL_PATHS|{'site/cloud-team.js'}
  with self.assertRaises(Stop):cr.check_control_source(q,Path('.'),p)
  q.changed=cr.CONTROL_PATHS;q.ancestor='3'*40
  with self.assertRaises(Stop):cr.check_control_source(q,Path('.'),p)
  q.ancestor=cr.EXCEPTION_SOURCE;q.blob='b'*40
  with self.assertRaises(Stop):cr.check_control_source(q,Path('.'),p)
if __name__=='__main__':unittest.main()
