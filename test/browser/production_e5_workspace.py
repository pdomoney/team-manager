# Build the exact connected production asset pipeline with synthetic data.
# Reproduce Cloudflare default HTML canonicalisation locally, without provider
# calls, deployment, a real account or any production data.
import functools
import http.server
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile
import threading
from urllib.parse import urlsplit, urlunsplit
from playwright.sync_api import sync_playwright, expect
from harness import REPO, Check

checks=Check()
engine=os.getenv('PRODUCTION_E5_BROWSER_ENGINE','chromium')
with tempfile.TemporaryDirectory(prefix='tm-e5-production-') as tmp:
    root=Path(tmp)
    js="""
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from './src/build.js';
import {buildExistingWorkerCandidate} from './scripts/stage3d3-existing-worker-build.mjs';
const tmp=process.argv[1],sha=execFileSync('git',['-c','safe.directory='+process.cwd(),'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const data=path.join(tmp,'data'),legacy=path.join(tmp,'legacy'),output=path.join(tmp,'connected');
fs.mkdirSync(data);
fs.writeFileSync(path.join(data,'team.enc.json'),JSON.stringify({format:'team-manager',version:1,role:'team',kdf:'PBKDF2-SHA256',salt:Buffer.alloc(16,1).toString('base64'),iv:Buffer.alloc(12,2).toString('base64'),data:Buffer.alloc(32,3).toString('base64')}));
build({dataDir:data,outDir:legacy,siteDir:'site',watchDir:path.join(tmp,'empty-watch'),version:sha.slice(0,7)});
buildExistingWorkerCandidate({root:process.cwd(),legacyDir:legacy,output,env:{
 STAGE3D3_SOURCE_SHA:sha,STAGE3D3_SUPABASE_URL:'https://uyjxvaobshaahzipzzds.supabase.co',
 STAGE3D3_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_syntheticKeyNotASecret123456',
 STAGE3D3_ORIGIN:'https://team-manager.paul-domoney.workers.dev',
 STAGE3D3_SCOPE:'individually-authorised-adults-only',STAGE3D3_PROVIDER_METHODS:'off',STAGE4_TACTICS_MODE:'enabled'}});
"""
    subprocess.run(['node','--input-type=module','-e',js,str(root)],cwd=REPO,check=True)
    assert 'CLOUD_STAGE4_TACTICS_ENABLED=true' in (root/'connected/cloud-public-config.js').read_text()
    class Canonical(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):
            u=urlsplit(self.path)
            if u.path=='/__e5-test':
                html=b'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/cloud-team.css"><main id="host"></main>'
                self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(html);return
            if u.path=='/cloud-e5-workspace.html':
                self.send_response(307);self.send_header('Location',urlunsplit(('', '', '/cloud-e5-workspace',u.query,'')));self.end_headers();return
            if u.path=='/cloud-e5-workspace':
                self.path=urlunsplit(('', '', '/cloud-e5-workspace.html',u.query,''))
            return super().do_GET()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Canonical,directory=str(root/'connected')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin='http://127.0.0.1:'+str(server.server_port)
    try:
        with sync_playwright() as p:
            browser=getattr(p,engine).launch()
            context=browser.new_context(viewport={'width':1280,'height':850})
            context.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin+'/') else r.abort())
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            console_errors=[]
            page.on('console',lambda msg:console_errors.append(msg.text) if msg.type=='error' else None)
            try:
                page.goto(origin+'/cloud-e5-workspace.html')
                page.get_by_text('Open this workspace from your signed-in team Tactics page.').wait_for()
                checks.ok(page.url.endswith('/cloud-e5-workspace'),'Canonical standalone route does not boot legacy authentication')
                page.goto(origin+'/__e5-test')
                page.evaluate("""async()=>{const {mountConnectedE5}=await import('/cloud-e5-host.js');
                  const {starterPlays}=await import('/play-starters.js');
                  window.qa={saved:null,closed:0,starter:{...starterPlays()[0],sport:'Oztag',set:'oztag'}};
                  window.qa.open=(mode,play)=>{window.qa.host=mountConnectedE5(document.querySelector('#host'),{mode,play,sport:'Oztag',teamLabel:'Synthetic team',
                    scope:{current:()=>true},onSave:async play=>{window.qa.saved=play;return {stillCurrent:true};},
                    onError:()=> 'Save failed',onClose:()=>{window.qa.closed++;window.qa.host.destroy();}});};
                  window.qa.open('edit',null);}""")
                frame=page.frame_locator('iframe[title="Play Editor"]')
                frame.get_by_role('button',name='Advanced diagram').wait_for(timeout=15000)
                checks.ok(frame.locator('#ped-field svg.editor').count()==1,'New play uses original diagram on canonical production package route')
                frame.locator('[name=name]').fill('Synthetic new play')
                frame.get_by_role('button',name='Save play',exact=True).click()
                page.locator('dialog.cloud-e5-dialog').wait_for(state='detached')
                checks.ok(page.evaluate("()=>qa.saved?.name")== 'Synthetic new play','New play passes the real native save gate')
                page.evaluate("()=>qa.open('edit',qa.starter)")
                frame=page.frame_locator('iframe[title="Play Editor"]')
                frame.get_by_role('button',name='Advanced diagram').wait_for()
                checks.ok(frame.locator('#ped-field svg.editor').count()==1,'Existing starter opens in original editor')
                page.keyboard.press('Escape')
                page.locator('dialog.cloud-e5-dialog').wait_for(state='detached')
                page.evaluate("()=>qa.open('view',qa.starter)")
                frame=page.frame_locator('iframe[title="Watch and Learn"]')
                frame.get_by_role('button',name='Watch animation',exact=True).wait_for(timeout=15000)
                checks.ok(frame.locator('svg.pf.study').count()==1,'Native Learn renders the original teaching diagram')
                checks.ok(frame.get_by_role('button',name='Edit',exact=True).count()==0 and
                          frame.get_by_role('button',name='Save play',exact=True).count()==0,
                          'Read-only viewer has no authoring actions')
                frame.get_by_role('button',name='Watch animation',exact=True).click()
                frame.get_by_role('button',name='Attacking left',exact=True).click()
                expect(frame.locator('#play-fig svg.pf')).to_have_attribute('aria-label',re.compile(r'attacking left$'))
                frame.get_by_role('button',name='Play',exact=True).click()
                expect(frame.locator('#anim-pct')).to_have_text(re.compile(r'^(?:[1-9][0-9]?|100)%$'),timeout=10000)
                checks.ok(True,'Native Watch animates the original play and advances its timeline')
                frame.get_by_role('button',name='Learn step by step',exact=True).click()
                expect(frame.locator('svg.pf.study')).to_be_visible()
                checks.ok(True,'Watch returns to the original Learn mode')
                frame.get_by_role('button',name='All plays',exact=False).click()
                page.locator('dialog.cloud-e5-dialog').wait_for(state='detached')
                checks.ok(page.evaluate("()=>document.body.style.overflow")== '', 'Normal close restores parent scrolling')
                # An iframe which cannot load its module must never lock the coach
                # out of the management shell.
                context.route('**/app.js*',lambda route:route.abort())
                page.evaluate("()=>qa.open('edit',null)")
                page.get_by_text('The play workspace could not start.',exact=False).wait_for(timeout=20000)
                page.get_by_role('button',name='Back to plays',exact=True).click()
                page.locator('dialog.cloud-e5-dialog').wait_for(state='detached')
                checks.ok(page.evaluate("()=>document.body.style.overflow")== '', 'Failed startup allows return without refresh')
                checks.ok(not errors,'No uncaught page errors in native journeys')
            except Exception:
                print('Synthetic workspace failure: completed checks',checks.n, 'failures',len(checks.fails),flush=True)
                for child in page.frames:
                    try:print('Synthetic frame:',child.url,child.locator('body').inner_text(timeout=1000)[:1500],flush=True)
                    except Exception:pass
                print('Page errors:',errors,'Console errors:',console_errors[-10:],flush=True)
                raise
            browser.close()
    finally:
        server.shutdown()
if not checks.done():
    raise SystemExit('Production E5 package routing failed')
