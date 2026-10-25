# Post-P10 #62: header persona control runs only in synthetic trial/test-library mode.
# These layouts do not authenticate users, and must not expose existing coach workspace records.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
c=Check(); errors=[]
act = "([a, ds]) => { const b=document.createElement('button'); b.dataset.act=a; Object.assign(b.dataset,ds||{}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('[data-act=test-library]')
        c.ok(pg.locator('#qa-persona-control').is_hidden(),f'[{width}] QA hidden before synthetic library load')
        pg.click('#view [data-act=test-library]'); pg.wait_for_timeout(350)
        c.ok(pg.locator('#qa-persona-select').is_visible(),f'[{width}] trial + test library shows header selector')
        opts=pg.locator('#qa-persona-select option').all_text_contents()
        c.ok(opts==['Coach workspace','Owner','Association Admin','Club Admin','Manager / Coach'],f'[{width}] four exact persona options')
        prior=pg.evaluate('JSON.stringify(window.__team.ws)')
        for role,scope in [('owner','qa-platform'),('association','qa-west'),('club','qa-comets'),('coach','qa-stars-women')]:
            pg.select_option('#qa-persona-select',role)
            pg.wait_for_selector(f'#view .qa-preview[data-qa-role="{role}"]')
            c.ok('SIMULATED VIEW' in pg.inner_text('#view') and 'No real login' in pg.inner_text('#status'),
                 f'[{width}] {role} shows simulation notice and publishing disabled')
            pg.select_option('#view select[data-change=qa-scope]',scope)
            c.ok(pg.get_attribute('#view .qa-preview','data-qa-scope')==scope,f'[{width}] {role} sets valid local scope')
            if role=='association':
                c.ok('Example Rangers Club' in pg.inner_text('#view') and 'Example Comets Club' not in pg.inner_text('#view'),
                     f'[{width}] association preview excludes other association')
            if role=='coach':
                c.ok('Example Stars Women' in pg.inner_text('#view') and 'Example Comets Mixed' not in pg.inner_text('#view'),
                     f'[{width}] coach shows only selected synthetic team')
            c.ok(pg.locator('#tabs').is_hidden() and pg.locator('#menu-btn').is_hidden(),
                 f'[{width}] {role} hides real navigation/edit menus')
        pg.evaluate(act,['task-new',{}])
        c.ok(pg.locator('#sheet').is_hidden(),f'[{width}] synthetic screen blocks forged coach action')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] switching persona and forged edit never changes real workspace')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
             f'[{width}] role preview fits viewport')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.locator('#view .qa-preview').count()==0 and pg.input_value('#qa-persona-select')=='',
             f'[{width}] exit restores actual coach view')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] exit restores unchanged workspace')
        pg.evaluate('window.__team.S.trial=false')
        pg.evaluate(act,['qa-exit',{}])
        c.ok(pg.locator('#qa-persona-control').is_hidden(),f'[{width}] live coach hides simulated switcher')
        ctx.close()
    passed=c.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
