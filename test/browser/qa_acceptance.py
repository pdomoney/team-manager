# #62 Stage C: read-only synthetic acceptance workbench at phone/tablet/desktop widths.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve()
c=Check();errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,820,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]');pg.wait_for_timeout(200)
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        for role,scope in [('owner','qa-platform'),('association','qa-west'),
                           ('club','qa-comets'),('coach','qa-stars-women')]:
            pg.select_option('#qa-persona-select',role)
            pg.wait_for_selector('#view .qa-preview')
            pg.select_option('#view select[data-change=qa-scope]',scope)
            board=pg.locator('#view .qa-acceptance')
            c.ok(board.count()==1,f'[{width}] {role} acceptance panel rendered')
            pg.locator('#view .qa-acceptance summary').click()
            c.ok(pg.locator('#view .qa-acceptance li').count()==7,
                 f'[{width}] {role} seven deterministic checks')
            c.ok('real safari' in board.inner_text().lower() and
                 'no actual test result' in board.inner_text().lower(),
                 f'[{width}] {role} actual Safari gate disclosed')
            c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
                 f'[{width}] {role} acceptance review has no writes')
            c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
                 f'[{width}] {role} mobile/tablet layout fits')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] leaving QA retains original workspace')
        ctx.close()
    ok=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
