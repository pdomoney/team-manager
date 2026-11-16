# M1.3: native Home team choice and role-bound navigation across device widths.
# Synthetic P12 people only. Not a test of real login or server-side grants.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
act = "([name, values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"

def choose_profile(pg, ident):
    if pg.evaluate("window.__team.state.tab") != 'home':
        pg.locator('#tabs [data-g=home]').click()
    pg.click('#home-profile-button')
    pg.click(f'#home-profile-panel [data-profile="{ident}"]')

def working_team(pg):
    return pg.evaluate('window.__team.data.id')

def in_width(pg):
    return not pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1')

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 820, 1280):
        ctx, pg, _ = page(browser, url + '?sandbox=1#home',
                          width=width, height=860, errors=errors)
        pg.wait_for_selector('#home-profile-button')
        original = pg.evaluate('JSON.stringify(window.__team.ws)')
        checks.ok(pg.evaluate('window.__team.state.qaProfile') == 'qa-01'
                  and pg.locator('#tabs .nav-group').count() == 5,
                  f'[{width}] fictional Owner begins in original five-section application')

        # Owner: Home selection alone controls the working team across pages.
        pg.locator('#view .scope-team[data-id=team1]').click()
        checks.ok(working_team(pg) == 'team1'
                  and pg.locator('#view .management-home[data-management-team=team1]').count() == 1,
                  f'[{width}] Owner explicitly selects a team and management Home follows')
        pg.locator('#view .management-home [data-tab=squad]').click()
        checks.ok(pg.locator('#view .working-context[data-working-team=team1]').count() == 1
                  and pg.locator('#team-title .t-name').inner_text()
                  == pg.evaluate('window.__team.data.team.name'),
                  f'[{width}] Squad and header identify selected Owner team')
        pg.locator('#tabs [data-g=home]').click()
        pg.locator('#view .scope-club[data-id=qa-stars]').click()
        owner_star = working_team(pg)
        checks.ok(owner_star != 'team1'
                  and pg.evaluate('window.__team.data.team.clubId') == 'qa-stars'
                  and pg.locator('#view .management-home').count() == 0,
                  f'[{width}] Owner club overview activates a working team without assuming team-only shortcuts')
        pg.locator(f'#view .scope-team[data-id="{owner_star}"]').click()
        checks.ok(pg.locator(f'#view .management-home[data-management-team="{owner_star}"]').count() == 1,
                  f'[{width}] explicitly choosing Stars team enables exact-team shortcuts')
        pg.locator('#view .management-home [data-tab=matches]').click()
        checks.ok(pg.locator(f'#view .working-context[data-working-team="{owner_star}"]').count() == 1
                  and in_width(pg),
                  f'[{width}] Owner new team follows through Matches without overflow')

        # Coach: scoped clubs, exact context, and a real viewport transition.
        choose_profile(pg, 'qa-07')
        checks.ok(working_team(pg) == 'qarangers16'
                  and pg.locator('#tabs [data-g=tactics]').count() == 1
                  and pg.locator('#view .scope-club[data-id=qa-comets]').count() == 0,
                  f'[{width}] Coach sees only assigned clubs and retained Tactics section')
        pg.locator('#view .scope-club[data-id=qa-stars]').click()
        checks.ok(working_team(pg) == 'qastarsopen'
                  and pg.evaluate('window.__team.state.qaContext')
                  == 'grant:team_coach:team:qa-stars-open',
                  f'[{width}] Coach club change selects exact approved team grant')
        pg.locator('#view .scope-team[data-id=qastarsopen]').click()
        pg.locator('#view .management-home [data-tab=training]').click()
        checks.ok(pg.locator('#view .working-context[data-working-team=qastarsopen]').count() == 1
                  and pg.locator('#team-title .t-name').inner_text()
                  == pg.evaluate('window.__team.data.team.name'),
                  f'[{width}] Coach Training keeps selected Stars team and header')
        opposite = 1280 if width < 900 else 390
        pg.set_viewport_size({'width': opposite, 'height': 860})
        # Wait for the actual browser resize/layout boundary, not a fixed sleep.
        # Keep team/role/page continuity and no-overflow as independent checks,
        # so any genuine responsive regression remains visible.
        pg.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        checks.ok(working_team(pg) == 'qastarsopen'
                  and pg.evaluate('window.__team.state.tab') == 'training'
                  and pg.locator('#view .working-context[data-working-team=qastarsopen]').count() == 1,
                  f'[{width}->{opposite}] resize preserves exact Coach team and working page')
        widths=pg.evaluate('({scroll:document.documentElement.scrollWidth,inner:innerWidth})')
        checks.ok(in_width(pg),
                  f'[{width}->{opposite}] responsive page does not overflow: {widths}')
        pg.set_viewport_size({'width': width, 'height': 860})

        # Manager: team permissions without Coach-only tactics or cross-club access.
        choose_profile(pg, 'qa-09')
        manager_team = working_team(pg)
        checks.ok(manager_team == 'qacometsmixed'
                  and pg.locator('#tabs [data-g=tactics]').count() == 0
                  and pg.locator('#view .scope-club[data-id=qa-stars]').count() == 0,
                  f'[{width}] Manager has assigned Comets team and no Coach tactics')
        pg.evaluate(act, ['home-scope', {'kind': 'team', 'id': 'qastarswomen'}])
        checks.ok(working_team(pg) == manager_team
                  and pg.locator('#view .scope-team[data-id=qastarswomen]').count() == 0,
                  f'[{width}] forged Manager selection cannot switch to unrelated Stars team')
        pg.evaluate(act, ['tab', {'tab': 'plays'}])
        checks.ok(pg.evaluate('window.__team.state.tab') == 'home'
                  and pg.locator('#view .working-context').count() == 0,
                  f'[{width}] forged Manager Plays navigation is refused')
        pg.locator('#view .management-home [data-tab=matches]').click()
        checks.ok(pg.locator(f'#view .working-context[data-working-team="{manager_team}"]').count() == 1,
                  f'[{width}] Manager Matches retain their assigned working team')

        # Player: same Home picker, only memberships and no coach management UI.
        choose_profile(pg, 'qa-14')
        checks.ok(working_team(pg) == 'qacometsmixed'
                  and pg.evaluate('window.__team.state.preview') is True
                  and pg.locator('#view .management-home').count() == 0
                  and pg.locator('#view .scope-club[data-id=qa-rangers]').count() == 0,
                  f'[{width}] Player only sees member clubs and no private management summary')
        pg.locator('#view .scope-club[data-id=qa-stars]').click()
        checks.ok(working_team(pg) == 'qastarswomen'
                  and pg.evaluate('window.__team.state.preview') is True,
                  f'[{width}] Player selects another explicitly held team membership')
        pg.evaluate(act, ['tab', {'tab': 'training'}])
        checks.ok(pg.evaluate('window.__team.state.tab') == 'home'
                  and pg.locator('#view .working-context').count() == 0,
                  f'[{width}] Player cannot navigate to coach Training or gain coach context')
        pg.evaluate(act, ['tab', {'tab': 'matches'}])
        checks.ok(pg.evaluate('window.__team.state.tab') == 'matches'
                  and working_team(pg) == 'qastarswomen'
                  and pg.locator('#view .working-context').count() == 0,
                  f'[{width}] Player may view their Matches without coach context')

        # Guardian: linked-child teams only, not a club-wide youth roster.
        choose_profile(pg, 'qa-16')
        checks.ok(working_team(pg) == 'qacometsjuniors'
                  and pg.evaluate('window.__team.state.preview') is True
                  and pg.locator('#view .management-home').count() == 0
                  and pg.locator('#view .scope-club[data-id=qa-rangers]').count() == 0
                  and pg.locator('#tabs [data-g=tactics]').count() == 0,
                  f'[{width}] Guardian has only linked-child clubs and no coach tools')
        pg.locator('#view .scope-club[data-id=qa-stars]').click()
        guardian_team = working_team(pg)
        checks.ok(guardian_team == 'qastarsu12'
                  and pg.evaluate('window.__team.state.qaContext')
                  == 'membership:guardian:club:qa-stars',
                  f'[{width}] Guardian picks second linked child without mixing memberships')
        pg.evaluate(act, ['home-scope', {'kind': 'team', 'id': 'qarangers16'}])
        pg.evaluate(act, ['tab', {'tab': 'squad'}])
        checks.ok(working_team(pg) == guardian_team
                  and pg.evaluate('window.__team.state.tab') == 'home'
                  and pg.locator('#view .working-context').count() == 0
                  and in_width(pg),
                  f'[{width}] Guardian cannot switch to unrelated youth team or open private Squad')

        # D02: a multi-role person cannot union Coach and Manager privileges.
        choose_profile(pg, 'qa-18')
        context = pg.locator('#view select[data-change=native-persona-context]')
        context.select_option('grant:team_coach:team:qa-rangers-u12')
        checks.ok(working_team(pg) == 'qarangersu12'
                  and pg.locator('#tabs [data-g=tactics]').count() == 1,
                  f'[{width}] multi-role person explicitly selects Coach and exact group')
        pg.locator('#view select[data-change=native-persona-context]').select_option(
            'grant:team_manager:team:qa-comets-u16')
        checks.ok(working_team(pg) == 'qacometsu16'
                  and pg.locator('#tabs [data-g=tactics]').count() == 0
                  and pg.locator('#view .scope-club[data-id=qa-rangers]').count() == 0,
                  f'[{width}] changing to Manager drops Coach navigation and old club scope')

        choose_profile(pg, 'qa-01')
        checks.ok(pg.locator('#tabs .nav-group').count() == 5
                  and pg.locator('#view .home-cols').count() == 1
                  and pg.evaluate('JSON.stringify(window.__team.ws)') == original
                  and in_width(pg),
                  f'[{width}] returning to Owner preserves workspace and native navigation')
        ctx.close()

    passed = checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
