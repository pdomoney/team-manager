# Post-P10 #62B — browser qualification for read-only guided synthetic QA journeys.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve()
c=Check(); errors=[]
act = "([a, ds]) => { const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]');pg.wait_for_timeout(200)
        before=pg.evaluate('JSON.stringify(window.__team.ws)')
        for role,scope in [('owner','qa-platform'),('association','qa-west'),('club','qa-comets'),('coach','qa-stars-women')]:
            pg.select_option('#qa-persona-select',role)
            pg.wait_for_selector('#view .qa-preview')
            pg.select_option('#view select[data-change=qa-scope]',scope)
            c.ok(pg.locator('#view [data-act=qa-journey]').count()==3,f'[{width}] {role} three guided journeys')
            ids=pg.locator('#view [data-act=qa-journey]').evaluate_all('(bs)=>bs.map(b=>b.dataset.id)')
            for ident in ids:
                pg.click(f'#view [data-act=qa-journey][data-id="{ident}"]')
                c.ok(pg.locator(f'#view .qa-guide[data-qa-journey="{ident}"]').count()==1,
                     f'[{width}] {role}/{ident} opens a synthetic walkthrough')
                c.ok(pg.locator('#view .qa-guide .qa-steps li').count()==3,
                     f'[{width}] {role}/{ident} has three readable steps')
                c.ok(pg.get_attribute('#view .qa-preview','data-qa-scope')==scope,
                     f'[{width}] {role}/{ident} retains scoped synthetic context')
            pg.evaluate(act,['qa-journey',{'id':'__proto__'}])
            c.ok(pg.locator(f'#view .qa-guide[data-qa-journey="{ids[-1]}"]').count()==1,
                 f'[{width}] {role} rejects forged journey and keeps safe current one')
            pg.click('#view [data-act=qa-journey-back]')
            c.ok(pg.locator('#view .qa-guide').count()==0,f'[{width}] {role} back to QA overview')
            pg.evaluate(act,['task-new',{}])
            c.ok(pg.locator('#sheet').is_hidden() and pg.evaluate('JSON.stringify(window.__team.ws)')==before,
                 f'[{width}] {role} cannot edit real workspace via forged coach action')
            c.ok(pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'),
                 f'[{width}] {role} guided journey fits viewport')
        pg.select_option('#qa-persona-select','association')
        pg.select_option('#view select[data-change=qa-scope]','qa-east')
        pg.click('#view [data-act=qa-journey][data-id="affiliates"]')
        pg.select_option('#view select[data-change=qa-scope]','qa-west')
        c.ok(pg.locator('#view .qa-guide').count()==0,
             f'[{width}] changing synthetic association clears previous walkthrough context')
        pg.click('#view [data-act=qa-journey][data-id="affiliates"]')
        names=pg.locator('#view .qa-guide .qa-identity-list li').all_text_contents()
        c.ok(names==['Example Rangers Club'],
             f'[{width}] west association walkthrough shows only scoped example club: {names}')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==before and pg.locator('#view .qa-guide').count()==0,
             f'[{width}] exit restores original coach workspace untouched')
        ctx.close()
    passed=c.done(errors);browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
