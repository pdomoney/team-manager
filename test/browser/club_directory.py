# Research catalogue, controlled adoption and managed team filtering (mobile/desktop).
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c, errors = Check(), []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url+'#home', width=width, height=860, errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]')
        pg.goto(url+'#teams')
        pg.wait_for_selector('#national-club-directory')
        W = lambda exp: pg.evaluate(f'(() => {{ const W=window.__team.ws, M=window.__team.M; return {exp}; }})()')
        before = W('W.clubs.length'); teams = W('M.teamsOf(W).length')
        c.ok(pg.locator('#national-directory-results .directory-row').count()==30, f'[{width}] capped directory results')
        pg.select_option('[data-change=directory-sport]','Rugby league')
        pg.select_option('[data-change=directory-state]','NSW')
        pg.fill('[data-input=directory-find]','Aquinas Colts')
        c.ok(pg.locator('#national-directory-results .directory-row').count()==1 and 'Rugby league' in pg.inner_text('#national-directory-results'),
             f'[{width}] can filter NSW rugby league club')
        pg.locator('#national-directory-results [data-act=directory-use]').click()
        pg.wait_for_selector('#sheet form[data-form=club]')
        c.ok(pg.locator('#sheet [name=sport]').input_value()=='Rugby league'
             and pg.locator('#sheet [name=id]').input_value()=='' and pg.locator('#sheet [name=logo]').input_value()==''
             and pg.locator('#sheet [data-act=club-del]').count()==0,
             f'[{width}] reference opens new editable rugby league club without copied logo')
        c.ok(W('W.clubs.length')==before and W('M.teamsOf(W).length')==teams,
             f'[{width}] preview grants no access and adds nothing')
        pg.locator('#sheet button[type=submit]').click()
        pg.wait_for_timeout(150)
        c.ok(W('W.clubs.length')==before+1 and W("W.clubs.some(x=>x.name==='Aquinas Colts' && x.sport==='Rugby league' && !x.logo)"),
             f'[{width}] explicit creation copies public fields only')
        pg.fill('[data-input=directory-find]','Engadine Dragons')
        pg.locator('#national-directory-results [data-act=directory-use]').click()
        pg.wait_for_selector('#sheet [data-change=directory-link-pick]')
        c.ok(pg.locator('#sheet [data-change=directory-link-pick]').input_value()=='engadinedragons'
             and 'email' in pg.inner_text('#club-link-review').lower(),
             f'[{width}] JRLFC variant proposes user-confirmed match and previews missing details')
        old_ref=W("JSON.stringify(W.clubs.find(x=>x.id==='engadinedragons'))")
        c.ok(W('W.clubs.length')==before+1 and W("!W.clubs.find(x=>x.id==='engadinedragons').email"),
             f'[{width}] preview leaves manually managed club unchanged')
        pg.locator('#sheet [data-act=directory-link-confirm]').click()
        pg.wait_for_selector('#sheet form[data-form=club]')
        c.ok(pg.locator('#sheet [name=id]').input_value()=='engadinedragons'
             and W('W.clubs.length')==before+1
             and W("W.clubs.find(x=>x.id==='engadinedragons').email==='secretary@engadinedragons.com.au'")
             and W("W.clubs.find(x=>x.id==='engadinedragons').directoryMatch.id==='rlc_309c59a2a0de9e'")
             and W("M.clubTeams(W,'engadinedragons').length")>=1,
             f'[{width}] explicit match fills missing contact but keeps managed club ID and teams')
        pg.keyboard.press('Escape')
        pg.fill('[data-input=managed-find]','DragonTag Women')
        c.ok(pg.locator('#managed-team-results .team-row').count()==1,
             f'[{width}] managed team name filter narrows list')
        pg.locator('[data-act=managed-clear]').click()
        pg.select_option('[data-change=managed-sport]','League tag')
        c.ok(pg.locator('#managed-team-results .team-row').count()>=1 and
             'Rugby league' not in pg.inner_text('#managed-team-results .team-row .sub'),
             f'[{width}] team sport filter respects team sport overrides')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
             f'[{width}] club directory and filters fit viewport')
        ctx.close()
    browser.close()
srv.shutdown()
sys.exit(0 if c.done(errors) else 1)
