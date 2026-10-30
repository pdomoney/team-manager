# P12D: disposable fictional squad/RSVP/staff operations on 390/820/1280 Chromium.
# Does NOT establish real permission enforcement, actual registrations or Safari.
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
        pg.click('#view [data-act=test-library]')
        pg.wait_for_selector('#qa-persona-select')
        prior=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.select_option('#qa-persona-select','p12:qa-18')
        pg.wait_for_selector('#view .p12-qa-preview[data-qa-profile="qa-18"]')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_coach:team:qa-rangers-16')
        board=pg.locator('#view .qa-p12-workflow')
        c.ok(board.count()==1 and board.get_attribute('data-qa-workflow')=='qa-rangers-16',
             f'[{width}] QA18 coach creates exact Rangers team sandbox')
        c.ok('Rangers Demo Player A' in board.inner_text() and 'Stars Demo Player A' not in board.inner_text(),
             f'[{width}] Rangers sandbox has only Rangers fictional squad')
        c.ok(board.locator('[data-kind=toggle-roster]').count()==3,
             f'[{width}] coach may select fictional match squad')
        c.ok(board.locator('[data-kind=set-rsvp]').count()==6,
             f'[{width}] coach may record fictional attendance')
        c.ok(board.locator('[data-kind=propose-duty]').count()==0,
             f'[{width}] coach has no implicit staff-management capability')
        board.locator('[data-kind=toggle-roster][data-player="qa-rangers-16-player-3"]').click()
        c.ok('Selected fictional squad: 3' in board.inner_text(),
             f'[{width}] deliberate roster edit modifies disposable sandbox')
        board.locator('[data-kind=set-rsvp][data-player="qa-rangers-16-player-1"][data-status=yes]').click()
        c.ok('RSVP: yes' in board.inner_text(),
             f'[{width}] fictional RSVP update appears')
        c.ok('Local actions this session: 2' in board.inner_text(),
             f'[{width}] scenario audit counter records two changes')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] QA coach changes do not mutate encrypted workspace object')

        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_manager:team:qa-stars-women')
        board=pg.locator('#view .qa-p12-workflow')
        c.ok(board.get_attribute('data-qa-workflow')=='qa-stars-women' and 'Rangers Demo Player A' not in board.inner_text(),
             f'[{width}] changing role/group clears old team data and starts Stars sandbox')
        c.ok('Local actions this session: 0' in board.inner_text(),
             f'[{width}] switching context resets disposable action history')
        c.ok(board.locator('[data-kind=propose-duty][data-duty=trainer]').count()==2,
             f'[{width}] team manager may propose fictional trainer duties')
        board.locator('[data-kind=propose-duty][data-duty=trainer]').first.click()
        c.ok('Unverified duty proposals: 1' in board.inner_text() and 'unverified' in board.inner_text(),
             f'[{width}] trainer appointment remains unverified proposal')
        c.ok('no official rules approval' in board.inner_text().lower(),
             f'[{width}] no sport-specific eligibility approval claimed')
        board.locator('[data-act=qa-p12-workflow-reset]').click()
        c.ok('Unverified duty proposals: 0' in board.inner_text() and
             'Local actions this session: 0' in board.inner_text(),
             f'[{width}] reset discards synthetic proposals and history')

        pg.locator('#view select[data-change=p12-context]').select_option('membership:player:team:qa-comets-mixed')
        c.ok(pg.locator('#view .qa-p12-workflow').count()==0 and
             'No editable fictional team workflow' in pg.locator('#view').inner_text(),
             f'[{width}] participation membership confers no team workflow')
        pg.select_option('#qa-persona-select','p12:qa-12')
        c.ok(pg.locator('#view .qa-p12-workflow').count()==0,
             f'[{width}] dual-qualified trainee/acting coach proposal grants no operational editor')
        pg.select_option('#qa-persona-select','p12:qa-19')
        c.ok(pg.locator('#view .qa-p12-workflow').count()==0,
             f'[{width}] revoked coach has no workflow access')
        pg.evaluate(act,['task-new',{}])
        c.ok(pg.locator('#sheet').is_hidden(),
             f'[{width}] forged standard coach editor still blocked')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] no real workspace mutation after all workflow actions')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
             f'[{width}] sandbox layout fits viewport')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.input_value('#qa-persona-select')=='' and
             pg.evaluate('JSON.stringify(window.__team.ws)')==prior,
             f'[{width}] exiting leaves workspace intact')
        ctx.close()
    passed=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if passed else 1)
