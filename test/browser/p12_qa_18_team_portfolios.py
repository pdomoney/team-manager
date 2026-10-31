# P12 expanded 18-team QA coverage, context isolation and temporary-role proposals.
# Fictional trial-only test; not actual sports eligibility or production security.
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

        pg.select_option('#qa-persona-select','p12:qa-04')
        pg.wait_for_selector('#view .qa-p12-club-teams')
        club=pg.locator('#view .qa-p12-club-teams')
        c.ok(club.locator('[data-qa-team-summary]').count()==6,
             f'[{width}] Rangers club admin sees six synthetic teams')
        c.ok(all(v.startswith('qa-rangers-') for v in
                 club.locator('[data-qa-team-summary]').evaluate_all('(xs)=>xs.map(x=>x.dataset.qaTeamSummary)')),
             f'[{width}] Rangers context does not expose other club team summaries')
        c.ok(pg.locator('#view .qa-p12-workflow').count()==0,
             f'[{width}] club admin does not inherit edit access to each team')
        club.locator('[data-qa-team-summary="qa-rangers-16"] summary').click()
        c.ok('22 players · 4 staff · 6 volunteers' in club.inner_text() and
             'LeagueSafe (yellow)' in club.inner_text(),
             f'[{width}] Rugby league team sample contains age/sport appropriate roles')
        c.ok('registration unverified' in club.inner_text().lower() and
             'not approved playing numbers' in club.inner_text().lower(),
             f'[{width}] staffing and squad counts do not claim official eligibility')

        pg.select_option('#qa-persona-select','p12:qa-05')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:club_admin:club:qa-comets')
        comets=pg.locator('#view .qa-p12-club-teams')
        c.ok(comets.locator('[data-qa-team-summary]').count()==6,
             f'[{width}] Comets club admin sees its six teams')
        c.ok(comets.locator('[data-qa-team-summary="qa-rangers-16"]').count()==0,
             f'[{width}] Comets context loses Rangers visibility')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:club_admin:club:qa-rangers')
        c.ok(pg.locator('#view [data-qa-team-summary="qa-rangers-16"]').count()==1,
             f'[{width}] explicitly switching club restores Rangers six-team portfolio')

        pg.select_option('#qa-persona-select','p12:qa-18')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_coach:team:qa-rangers-u12')
        board=pg.locator('#view .qa-p12-workflow')
        c.ok(board.get_attribute('data-qa-workflow')=='qa-rangers-u12' and
             board.locator('[data-kind=toggle-roster]').count()==20,
             f'[{width}] QA18 U12 coach sees twenty-player Rangers squad')
        c.ok(pg.locator('#view .qa-p12-club-teams [data-qa-team-summary]').count()==1,
             f'[{width}] team Coach sees own team, not all Rangers teams')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_manager:team:qa-stars-women')
        board=pg.locator('#view .qa-p12-workflow')
        c.ok(board.get_attribute('data-qa-workflow')=='qa-stars-women' and
             board.locator('[data-kind=propose-role-change]').count()==6,
             f'[{width}] team manager can request fixture role change for fictional staff')
        board.locator('[data-kind=propose-role-change][data-staff="qa-stars-women-staff-3"][data-duty=trainer]').click()
        c.ok('Unverified duty proposals: 1' in board.inner_text() and
             'Team Manager' in board.inner_text(),
             f'[{width}] Manager to Trainer is proposed but not automatically assigned')
        c.ok('registration unverified' in board.inner_text().lower() and
             'no official rules approval' in board.inner_text().lower(),
             f'[{width}] Trainer proposal cannot claim registration or staffing clearance')
        pg.locator('#view select[data-change=p12-context]').select_option('grant:team_manager:team:qa-comets-u16')
        board=pg.locator('#view .qa-p12-workflow')
        c.ok(board.get_attribute('data-qa-workflow')=='qa-comets-u16' and
             board.locator('[data-kind=propose-duty]').count()==10,
             f'[{width}] switching clubs loads Comets U16 five-volunteer team only')
        c.ok('Unverified duty proposals: 0' in board.inner_text(),
             f'[{width}] role/group change discards previous match proposal')

        pg.select_option('#qa-persona-select','p12:qa-01')
        c.ok(pg.locator('#view [data-qa-team-summary]').count()==18,
             f'[{width}] fictional owner preview lists eighteen demo teams only')
        c.ok(pg.locator('#view .qa-p12-workflow').count()==0,
             f'[{width}] owner overview does not imply team edit authority')
        pg.select_option('#qa-persona-select','p12:qa-14')
        c.ok(pg.locator('#view [data-qa-team-summary]').count()==0,
             f'[{width}] player-only relationships do not reveal team staff overview')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] all expanded sample contexts leave real workspace unchanged')
        c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
             f'[{width}] responsive club/team fixtures fit viewport')
        pg.click('#view [data-act=qa-exit]')
        c.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==original,
             f'[{width}] exiting QA retains original workspace')
        ctx.close()
    ok=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
