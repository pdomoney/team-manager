# Native Schedule must survive role changes. Legacy separate fixture editor is not the application.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve();c=Check();errors=[]
act="([name,values])=>{let b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok('Example Opposition' in pg.locator('#view').inner_text() and
             pg.locator('#view .persona-fixture-editor').count()==0,
             f'[{width}] Manager sees original Matches page not synthetic replacement')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.locator('#view select[data-change=native-persona-team]').select_option('qa-rangers-16')
        match=pg.evaluate("window.__team.data.matches[0].id")
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok(pg.evaluate('window.__team.data.id')=='qarangers16' and
             'Example Opposition' in pg.locator('#view').inner_text(),
             f'[{width}] Manager uses original fixtures for assigned Rangers team')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.evaluate('window.__team.data.id')=='qarangers16' and
             pg.evaluate('window.__team.data.matches[0].id')==match,
             f'[{width}] Coach sees same underlying team fixture record')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok('Example Opposition' in pg.locator('#view').inner_text(),
             f'[{width}] Coach uses original Matches UI')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok(pg.evaluate('window.__team.data.id')=='qacometsmixed' and
             pg.locator('#view .persona-fixture-editor').count()==0,
             f'[{width}] Player sees normal team fixture view without Manager edit')
        c.ok(not pg.evaluate("document.body.classList.contains('persona-mode')"),
             f'[{width}] role switching never changes app shell')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
