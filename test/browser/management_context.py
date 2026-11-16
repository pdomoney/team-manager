# M1.2: exact working context on native operational pages, not a new selector.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks = Check()
errors = []
act = "([name,values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url + '?sandbox=1#home',
                          width=width, height=844, errors=errors)
        pg.wait_for_selector('#home-profile-button')
        checks.ok(pg.locator('#view .working-context').count() == 0,
                  f'[{width}] Home owns team selection and has no duplicate context strip')
        pg.locator('#view .scope-team[data-id=team1]').click()
        pg.locator('#view .management-home [data-tab=squad]').click()
        context = pg.locator('#view .working-context[data-working-team=team1]')
        checks.ok(context.count() == 1
                  and 'Owner' in context.inner_text()
                  and 'Fictional test profile' in context.inner_text()
                  and 'Working context' in context.inner_text(),
                  f'[{width}] squad shows exact current coach team and working role')
        checks.ok(context.locator('[data-act=tab][data-tab=home]').count() == 1
                  and context.locator('.working-context-home').evaluate(
                      '(el)=>el.getBoundingClientRect().height >= 44')
                  and not pg.evaluate('document.documentElement.scrollWidth > innerWidth'),
                  f'[{width}] Home shortcut is accessible and fits viewport')
        before = pg.evaluate('JSON.stringify(window.__team.ws)')
        context.locator('[data-tab=home]').click()
        checks.ok(pg.evaluate('window.__team.state.tab') == 'home'
                  and pg.evaluate('window.__team.data.id') == 'team1'
                  and pg.locator('#view .working-context').count() == 0
                  and pg.evaluate('JSON.stringify(window.__team.ws)') == before,
                  f'[{width}] choosing teams on Home does not mutate or replace active team')
        # A different explicit team selection is reflected on every subsequent page.
        team_buttons = pg.locator('#view .scope-team')
        checks.ok(team_buttons.count() > 1,
                  f'[{width}] fictional Owner portfolio offers a second team')
        other = team_buttons.nth(1).get_attribute('data-id')
        if other == 'team1':
            other = team_buttons.nth(0).get_attribute('data-id')
        pg.locator(f'#view .scope-team[data-id="{other}"]').click()
        pg.locator('#view .management-home [data-tab=matches]').click()
        checks.ok(pg.locator(f'#view .working-context[data-working-team="{other}"]').count() == 1
                  and pg.evaluate('window.__team.data.id') == other,
                  f'[{width}] different explicitly chosen team is never shown as old team')
        pg.evaluate(act, ['tab', {'tab': 'plays'}])
        checks.ok(pg.locator('#view .working-context').count() == 0,
                  f'[{width}] play engine has no new context banner')

        pg.evaluate(act, ['tab', {'tab': 'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.wait_for_selector('#view .scope-team')
        if pg.locator('#view .management-home').count() == 0:
            pg.locator('#view .scope-team').first.click()
        pg.locator('#view .management-home [data-tab=matches]').click()
        manager = pg.locator('#view .working-context')
        manager_id = pg.evaluate('window.__team.data.id')
        checks.ok(manager.count() == 1
                  and manager.get_attribute('data-working-team') == manager_id
                  and 'Manager' in manager.inner_text()
                  and 'Fictional test profile' in manager.inner_text()
                  and 'Coach workspace' not in manager.inner_text(),
                  f'[{width}] manager sees assigned fictional role and exact team, not Owner role')
        manager_before = pg.evaluate('JSON.stringify(window.__team.ws)')
        manager.locator('[data-tab=home]').click()
        checks.ok(pg.evaluate('window.__team.state.tab') == 'home'
                  and pg.evaluate('window.__team.data.id') == manager_id
                  and pg.evaluate('JSON.stringify(window.__team.ws)') == manager_before,
                  f'[{width}] manager context link reuses Home without changing assignments')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-15]')
        pg.evaluate(act, ['tab', {'tab': 'matches'}])
        checks.ok(pg.locator('#view .working-context').count() == 0
                  and pg.evaluate('window.__team.state.preview') is True,
                  f'[{width}] participant has no coach-only working context')
        checks.ok(not pg.evaluate('document.documentElement.scrollWidth > innerWidth'),
                  f'[{width}] participant view keeps device width')
        ctx.close()
    ok = checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
