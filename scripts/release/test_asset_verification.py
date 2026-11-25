import unittest
from asset_verification import Reply, digest, classify, verify_all, browser_code
O='https://example.test'
HTML=b'<!doctype html><html><head><script src="app.js"></script></head><body>OK</body></html>\n'
OPAQUE=b'<script src="/'+b'a'*150+b'"></script>'

def reply(path,body=HTML,status=200,headers=None):return Reply(status,O+path,headers or {'content-type':'text/html','cf-ray':'fixture-ray'},body)

class Tests(unittest.TestCase):
 def test_exact(self):self.assertEqual(classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html'))['outcome'],'PASS')
 def test_canonical(self):
  out=classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html',status=308,headers={'location':'/team'}) if u.endswith('.html') else reply('/team'))
  self.assertEqual((out['outcome'],out['redirected']),('PASS',True))
 def test_external_redirect(self):
  calls=[]
  def fetch(u):calls.append(u);return reply('/team.html',status=302,headers={'location':'https://other.test/team'})
  self.assertEqual(classify(O,'/team.html',digest(HTML),fetch)['reason'],'UNAPPROVED_REDIRECT');self.assertEqual(len(calls),1)
 def test_other_same_origin_redirect(self):self.assertEqual(classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html',status=302,headers={'location':'/login'}))['reason'],'UNAPPROVED_REDIRECT')
 def test_js_redirect(self):self.assertEqual(classify(O,'/app.js',digest(b'a'),lambda u:reply('/app.js',status=301,headers={'location':'/app'}))['reason'],'UNAPPROVED_REDIRECT')
 def test_injected_script_holds(self):
  res=classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html',HTML.replace(b'<head>',b'<head>'+OPAQUE)))
  self.assertEqual(res['reason'],'ORIGINAL_BYTES_RECOVERED_SCRIPT_PROVENANCE_HOLD');self.assertEqual(res['outcome'],'HOLD');self.assertEqual(res['stripped_sha256'],digest(HTML))
 def test_script_and_mutation_hold(self):self.assertEqual(classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html',HTML.replace(b'<head>',b'<head>'+OPAQUE).replace(b'OK',b'BAD')))['reason'],'BYTE_MISMATCH')
 def test_two_scripts_hold(self):self.assertEqual(classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html',HTML.replace(b'<head>',b'<head>'+OPAQUE+OPAQUE)))['reason'],'BYTE_MISMATCH')
 def test_403(self):self.assertEqual(classify(O,'/team.html',digest(HTML),lambda u:reply('/team.html',status=403))['reason'],'EDGE_OR_TRANSPORT_DENIAL')
 def test_all_failures_reported(self):
  def fetch(u):
   if u.endswith('a.js'):raise TimeoutError()
   if u.endswith('b.js'):return reply('/b.js',b'b',403)
   return reply('/c.js',b'c')
  result=verify_all(O,{'/a.js':digest(b'a'),'/b.js':digest(b'b'),'/c.js':digest(b'c')},fetch)
  self.assertEqual((result['status'],result['passed'],result['total']),('HOLD',1,3));self.assertEqual([x['reason'] for x in result['assets']],['TRANSPORT_OR_RESPONSE_ERROR','EDGE_OR_TRANSPORT_DENIAL','EXACT_BYTES'])
 def test_inventory_invalid_before_requests(self):
  with self.assertRaises(ValueError):verify_all(O,{'/a.js':digest(b'a'),'//other.test':digest(b'b')},lambda u:self.fail('must not fetch'))
 def test_transport_redirect_not_accepted(self):self.assertEqual(classify(O,'/team.html',digest(HTML),lambda u:reply('/elsewhere'))['reason'],'UNEXPECTED_TRANSPORT_URL')
 def test_browser_code(self):
  s=browser_code(O,{'/team.html':digest(HTML)});self.assertIn('redirect:\'error\'',s);self.assertIn('SCRIPT_PROVENANCE_HOLD',s);self.assertIn('anonymousAuth',s);self.assertNotIn('eval(',s)
if __name__=='__main__':unittest.main()
