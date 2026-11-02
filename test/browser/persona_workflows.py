# Native Team Manager pages must remain intact when a test identity changes.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve();c=Check();errors=[]
act="([name,values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.evaluate("window.__team.data.id")=='qarangers16' and
             pg.locator('#tabs [data-g=tactics]').count()==1,
             f'[{width}] Coach uses original Team Manager assigned team')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok('Sample Player' in pg.locator('#view').inner_text() and
             pg.locator('#view .persona-list').count()==0,
             f'[{width}] native Squad screen has fictional players, not replacement page')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.locator('#view select[data-change=native-persona-team]').select_option('qa-stars-open')
        c.ok(pg.evaluate("window.__team.data.id")=='qastarsopen',
             f'[{width}] same Coach accesses assigned team at different club')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        c.ok(pg.locator('#tabs [data-g=tactics]').count()==0,
             f'[{width}] Manager has no coaching Tactics section')
        pg.evaluate(act,['add-player',{}])
        c.ok(pg.evaluate("document.querySelector('#sheet').hidden"),
             f'[{width}] Manager cannot trigger Owner/Coach player edit')
        pg.evaluate(act,['tab',{'tab':'plays'}])
        c.ok(pg.evaluate("window.__team.state.tab")!='plays',
             f'[{width}] forged navigation cannot open unavailable Tactics')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-16]')
        c.ok(pg.evaluate("window.__team.state.preview") and
             pg.locator('#tabs [data-g=tactics]').count()==0,
             f'[{width}] Guardian uses original read-only Player layout')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-19]')
        c.ok(pg.locator('#tabs .nav-group').count()==1 and
             pg.evaluate("window.__team.state.tab")=='home',
             f'[{width}] revoked Coach gets Home only')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok(pg.evaluate("window.__team.state.tab")=='home',
             f'[{width}] revoked role cannot bypass native view filter')
        c.ok(not pg.evaluate("document.body.classList.contains('persona-mode')"),
             f'[{width}] legacy persona app shell is never displayed')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
