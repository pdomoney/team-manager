import json, tempfile, unittest
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
if __name__=='__main__':unittest.main()
