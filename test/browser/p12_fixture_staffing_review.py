# P12F: verified source-linked Rugby League rule, 2026 test match only.
# Synthetic test, NEVER certified participation, authoritative registration or Safari.
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
        pg.click('#view [data-act=test-library]')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        pg.select_option('#qa-persona-select','p12:qa-09')
        pg.wait_for_selector('#view .p12-qa-preview')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_manager:team:qa-rangers-16')
        board=pg.locator('#view .qa-p12-workflow')
        review=pg.locator('#view .qa-p12-staffing-review')
        c.ok(board.get_attribute('data-qa-workflow')=='qa-rangers-16',
             f'[{width}] QA09 has independent Rangers manager authority')
        c.ok('NSWRL 2026, section 4.8' in review.inner_text(),
             f'[{width}] Rugby league reference is competition-specific')
        c.ok('Propose a Trainer or Acting Coach role' in review.inner_text(),
             f'[{width}] no role change assessed before proposal')
        board.locator('[data-kind=propose-duty][data-duty=acting_coach][data-volunteer=qa-rangers-16-volunteer-4]').click()
        review=pg.locator('#view .qa-p12-staffing-review')
        c.ok('Review status: blocked' in review.inner_text(),
             f'[{width}] trainer acting as coach without safety replacement blocked')
        c.ok('required-safety-position-left-vacant' in review.inner_text(),
             f'[{width}] reports vacated required safety role')
        select=review.locator('select[data-change=p12-safety-replacement]')
        c.ok(select.count()==1 and select.locator('option').count()>=2,
             f'[{width}] reviewer can nominate a different fictional trainer')
        select.select_option('qa-rangers-16-volunteer-person-3')
        review=pg.locator('#view .qa-p12-staffing-review')
        c.ok('Review status: review-required' in review.inner_text(),
             f'[{width}] separate safety nomination removes structural dual-duty block')
        c.ok('independent-registration-check' in review.inner_text() and
             'NRL-on-field-policy-section-1.2-age-grade-coverage' in review.inner_text(),
             f'[{width}] policy still requires official accreditation and age-grade coverage verification')
        c.ok('no permission, approval or match-start clearance' in review.inner_text().lower(),
             f'[{width}] UI cannot declare a simulated staffed match eligible')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_manager:team:qa-comets-mixed')
        board=pg.locator('#view .qa-p12-workflow')
        board.locator('[data-kind=propose-duty][data-duty=trainer]').first.click()
        review=pg.locator('#view .qa-p12-staffing-review')
        c.ok('No approved sport-specific staffing profile' in review.inner_text() and
             'competition-policy-not-reviewed' in review.inner_text(),
             f'[{width}] Oztag never borrows NSWRL match staffing rule')
        pg.select_option('#qa-persona-select','p12:qa-18')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:club_admin:club:qa-rangers')
        c.ok(pg.locator('#view .qa-p12-staffing-review').count()==0,
             f'[{width}] club admin does not silently inherit team match-edit workflow')
        pg.select_option('#qa-persona-select','p12:qa-19')
        c.ok(pg.locator('#view .qa-p12-staffing-review').count()==0,
             f'[{width}] revoked test role cannot open fixture staffing assessment')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] all fixture proposal reviews leave encrypted workspace unchanged')
        c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
             f'[{width}] review panel fits device viewport')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] exit discards fictitious staffing work and preserves workspace')
        ctx.close()
    ok=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
