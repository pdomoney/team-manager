# P12E: fictional scoped governance, approvals/revocation, cross-club and self-approval.
# This is a simulated trial-only test; not a production identity / permission test.
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
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.select_option('#qa-persona-select','p12:qa-04')
        pg.wait_for_selector('#view .qa-p12-governance')
        scope=pg.locator('#view .qa-p12-governance')
        c.ok(scope.locator('[data-qa-governance-row]').count()==9,
             f'[{width}] nine fictional governance requests exist')
        c.ok('Pending: 7' in scope.inner_text() and 'Expired: 1' in scope.inner_text(),
             f'[{width}] pending and expired states display correctly')
        c.ok(scope.locator('[data-qa-governance-row="gov-01"] [data-decision=approve]').count()==1,
             f'[{width}] Rangers admin can review Rangers assistant coach')
        c.ok(scope.locator('[data-qa-governance-row="gov-03"] [data-decision=approve]').count()==0,
             f'[{width}] Rangers admin cannot approve Comets grants')
        scope.locator('[data-qa-governance-row="gov-01"] [data-decision=approve]').click()
        c.ok('Audit events: 1' in scope.inner_text() and
             'active' in scope.locator('[data-qa-governance-row="gov-01"]').inner_text(),
             f'[{width}] approved grant generates fictional audit record')
        c.ok(scope.locator('[data-qa-governance-row="gov-01"] [data-decision=revoke]').count()==1,
             f'[{width}] active grant can be revoked by eligible administrator')
        scope.locator('[data-qa-governance-row="gov-01"] [data-decision=revoke]').click()
        c.ok('Audit events: 2' in scope.inner_text() and
             'revoked' in scope.locator('[data-qa-governance-row="gov-01"]').inner_text(),
             f'[{width}] revoked grant removed from active state')
        pg.select_option('#qa-persona-select','p12:qa-18')
        pg.wait_for_selector('#view .qa-p12-governance')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:club_admin:club:qa-rangers')
        scope=pg.locator('#view .qa-p12-governance')
        c.ok(scope.locator('[data-qa-governance-row="gov-02"] [data-decision=approve]').count()==0,
             f'[{width}] QA18 cannot approve own new Coach grant')
        c.ok('Audit events: 2' in scope.inner_text(),
             f'[{width}] fictional audit survives profile swap within trial')
        pg.evaluate(act,['qa-p12-governance',{'id':'gov-02','decision':'approve'}])
        c.ok('proposed' in scope.locator('[data-qa-governance-row="gov-02"]').inner_text(),
             f'[{width}] forged self-approval action denied')
        pg.select_option('#qa-persona-select','p12:qa-05')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:club_admin:club:qa-comets')
        scope=pg.locator('#view .qa-p12-governance')
        c.ok(scope.locator('[data-qa-governance-row="gov-03"] [data-decision=approve]').count()==1,
             f'[{width}] multi-club QA05 can approve Comets volunteer support')
        scope.locator('[data-qa-governance-row="gov-03"] [data-decision=approve]').click()
        c.ok('Audit events: 3' in scope.inner_text(),
             f'[{width}] additional club approval appends audit record')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:club_admin:club:qa-rangers')
        scope=pg.locator('#view .qa-p12-governance')
        c.ok(scope.locator('[data-qa-governance-row="gov-04"] [data-decision=approve]').count()==0,
             f'[{width}] switching to Rangers eliminates Comets approval authority')
        c.ok('expired-or-invalid' in scope.locator('[data-qa-governance-row="gov-07"]').inner_text(),
             f'[{width}] expired Coach role never shown as active')
        c.ok('revoked' in scope.locator('[data-qa-governance-row="gov-08"]').inner_text(),
             f'[{width}] revoked Association viewer role remains revoked')
        scope.locator('[data-act=qa-p12-governance-reset]').click()
        c.ok('Audit events: 0' in scope.inner_text() and
             'Pending: 7' in scope.inner_text(),
             f'[{width}] reset discards all fictional decisions')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] trial encrypted-workspace object unchanged')
        pg.evaluate(act,['task-new',{}])
        c.ok(pg.locator('#sheet').is_hidden(),
             f'[{width}] forged ordinary coach action blocked during governance QA')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
             f'[{width}] phone/tablet/desktop governance view fits')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.input_value('#qa-persona-select')=='' and
             pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] exit restores trial workspace')
        ctx.close()
    ok=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
