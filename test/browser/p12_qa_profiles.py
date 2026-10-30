# P12C: synthetic group-role profile swapping at mobile, tablet and desktop.
# All checks are against the fictional trial library; none prove real authorisation.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build();srv,url=serve()
c=Check();errors=[]
act = "([a, ds]) => { const b=document.createElement('button'); b.dataset.act=a; Object.assign(b.dataset,ds||{}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,820,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        c.ok(pg.locator('#qa-persona-control').is_hidden(),f'[{width}] profiles hidden before trial setup')
        pg.click('#view [data-act=test-library]')
        pg.wait_for_selector('#qa-persona-select')
        prior=pg.evaluate('JSON.stringify(window.__team.ws)')
        options=pg.locator('#qa-persona-select option').count()
        c.ok(options==25,f'[{width}] existing four role previews plus twenty profiles')
        for profile in ('qa-05','qa-12','qa-14','qa-16','qa-18','qa-19','qa-20'):
            pg.select_option('#qa-persona-select','p12:'+profile)
            pg.wait_for_selector('#view .p12-qa-preview[data-qa-profile="'+profile+'"]')
            panel=pg.locator('#view .p12-qa-preview')
            c.ok('FICTIONAL READ-ONLY VIEW' in panel.inner_text(),
                 f'[{width}] {profile} explicitly non-authorising preview')
            c.ok(pg.locator('#tabs').is_hidden() and pg.locator('#menu-btn').is_hidden(),
                 f'[{width}] {profile} hides real navigation and edit menus')
            if profile=='qa-05':
                c.ok(pg.locator('#view select[data-change=p12-context] option').count()==2,
                     f'[{width}] large club admin has two explicit club assignments')
            if profile=='qa-12':
                c.ok(pg.locator('#view .qa-tiles section').nth(1).inner_text().count('No app capabilities')==1,
                     f'[{width}] trainer and acting coach appointments are not app grants')
            if profile=='qa-18':
                select=pg.locator('#view select[data-change=p12-context]')
                c.ok(select.locator('option').count()==9,
                     f'[{width}] QA18 has five grants, two memberships and two proposed duties')
                select.select_option('grant:team_manager:team:qa-stars-women')
                c.ok(pg.get_attribute('#view .p12-qa-preview','data-qa-context')==
                     'grant:team_manager:team:qa-stars-women',
                     f'[{width}] selects an exact cross-club team manager role')
                c.ok('match-staff:manage' in pg.locator('#view .qa-tiles section').nth(1).inner_text(),
                     f'[{width}] active team manager capability shown')
                select=pg.locator('#view select[data-change=p12-context]')
                select.select_option('membership:player:team:qa-comets-mixed')
                c.ok('No app capabilities' in pg.locator('#view .qa-tiles section').nth(1).inner_text(),
                     f'[{width}] playing another club does not confer roster rights')
                pg.locator('#view [data-act=qa-p12-reset]').click()
                c.ok(pg.get_attribute('#view .p12-qa-preview','data-qa-context')!=
                     'membership:player:team:qa-comets-mixed',
                     f'[{width}] context reset returns to first assignment')
            if profile in ('qa-19','qa-20'):
                c.ok('No app capabilities' in pg.locator('#view .qa-tiles section').nth(1).inner_text(),
                     f'[{width}] inactive grant has no capabilities')
            c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
                 f'[{width}] {profile} does not mutate test workspace')
            c.ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
                 f'[{width}] {profile} fits viewport')
        pg.evaluate(act,['task-new',{}])
        c.ok(pg.locator('#sheet').is_hidden(),f'[{width}] forged edit rejected in P12 QA')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] forged edit cannot write workspace')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.input_value('#qa-persona-select')=='',f'[{width}] exits profile preview')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] exiting profile preserves workspace')
        pg.evaluate(act,['preview-on',{}])
        c.ok(pg.locator('#qa-persona-control').is_hidden(),
             f'[{width}] player preview cannot access synthetic role swap')
        pg.evaluate(act,['preview-off',{}])
        pg.evaluate('window.__team.S.trial=false')
        pg.evaluate(act,['qa-exit',{}])
        c.ok(pg.locator('#qa-persona-control').is_hidden(),
             f'[{width}] actual coach mode never exposes synthetic profile controls')
        ctx.close()
    ok=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
