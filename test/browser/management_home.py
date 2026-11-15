# M1.1: selected-team management shortcuts preserve Home scope, existing routes and QA roles.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks = Check()
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url + '?sandbox=1#home',
                          width=width, height=844, errors=errors)
        pg.wait_for_selector('#home-profile-button')
        checks.ok(pg.locator('#view .management-home').count() == 0,
                  f'[{width}] all-club Home does not impersonate one selected team')
        pg.locator('#view .scope-team[data-id=team1]').click()
        pg.wait_for_selector('.management-home[data-management-team=team1]')
        panel = pg.locator('.management-home')
        checks.ok('Team management' in panel.inner_text()
                  and 'Team team1' not in panel.inner_text()
                  and 'players in squad' in panel.inner_text(),
                  f'[{width}] compact management workspace derives selected team and squad')
        checks.ok(panel.locator('button[data-act=tab]').count() == 4
                  and panel.locator('[data-tab=squad]').count() == 1
                  and panel.locator('[data-tab=matches]').count() == 1
                  and panel.locator('[data-tab=training]').count() == 1
                  and panel.locator('[data-tab=crew]').count() == 1,
                  f'[{width}] shortcuts reuse the four approved Team Manager pages')
        checks.ok(not pg.evaluate('document.documentElement.scrollWidth > innerWidth'),
                  f'[{width}] management strip fits the viewport')
        checks.ok(all(pg.locator('.management-home button').nth(i).evaluate(
                  '(el) => el.getBoundingClientRect().height >= 44')
                  for i in range(panel.locator('button').count())),
                  f'[{width}] management shortcuts have touch-sized targets')
        before = pg.evaluate('JSON.stringify(window.__team.ws)')
        panel.locator('[data-tab=squad]').click()
        checks.ok(pg.evaluate('window.__team.state.tab') == 'squad'
                  and pg.evaluate('window.__team.data.id') == 'team1',
                  f'[{width}] squad route keeps exact working team')
        pg.locator('#tabs [data-g=home]').click()
        checks.ok(pg.locator('.management-home[data-management-team=team1]').count() == 1
                  and pg.evaluate('JSON.stringify(window.__team.ws)') == before,
                  f'[{width}] Home route does not write squad, fixture or workspace data')
        pg.locator('#view .scope-club[data-kind=all]').click()
        checks.ok(pg.locator('.management-home').count() == 0
                  and pg.evaluate('window.__team.data.id') == 'team1',
                  f'[{width}] all-club overview hides team-only shortcuts without changing working team')

        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.wait_for_selector('#view .scope-team')
        if pg.locator('.management-home').count() == 0:
            pg.locator('#view .scope-team').first.click()
        manager = pg.locator('.management-home')
        checks.ok(manager.count() == 1
                  and manager.locator('[data-tab=training]').count() == 0
                  and manager.locator('[data-tab=agenda]').count() == 1
                  and manager.locator('[data-tab=matches]').count() == 1
                  and manager.locator('[data-tab=crew]').count() == 1,
                  f'[{width}] fictional Manager gets only its existing role-allowed routes')
        manager_team = pg.evaluate('window.__team.data.id')
        manager_before = pg.evaluate('JSON.stringify(window.__team.ws)')
        manager.locator('[data-tab=matches]').click()
        checks.ok(pg.evaluate('window.__team.state.tab') == 'matches'
                  and pg.evaluate('window.__team.data.id') == manager_team
                  and pg.evaluate('JSON.stringify(window.__team.ws)') == manager_before,
                  f'[{width}] Manager can inspect matches without new mutation rights')
        pg.locator('#tabs [data-g=home]').click()
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-15]')
        checks.ok(pg.locator('#view .management-home').count() == 0
                  and pg.locator('#view .home-act').count() == 0,
                  f'[{width}] Player has no management or private outstanding-action summary')
        checks.ok(not pg.evaluate('document.documentElement.scrollWidth > innerWidth'),
                  f'[{width}] player Home remains within viewport')
        ctx.close()
    ok = checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
