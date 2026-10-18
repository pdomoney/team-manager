# Cross-team player acceptance — team-specific preferred positions and jerseys.
# Uses the existing coach test-mode UI; no live accounts, external GitHub or personal data.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
    pg.wait_for_selector('[data-act=sample]')
    pg.click('[data-act=sample]')
    pg.wait_for_timeout(150)
    original = W("W.players[0].id")
    original_name = W("W.players[0].name")
    original_number = W("W.players[0].number")
    c.ok(bool(original and original_name), 'sample source person present')
    # Make a distinct Netball team through existing UI.
    pg.evaluate(act, ['team-new', {}])
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    pg.fill('#sheet form[data-form=team-new] input[name=name]', 'Titans Netball')
    pg.select_option('#sheet form[data-form=team-new] select[name=teamSport]', 'Netball')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(180)
    c.ok(W("D.team.name") == 'Titans Netball', 'new team active')
    c.ok(W("M.teamSport(D.team, M.clubOf(W,D))") == 'Netball', 'effective sport Netball')
    # Use From another team in empty squad. The names can be alike but linking is explicit.
    pg.goto(url + '#squad')
    pg.wait_for_selector('[data-act=player-import]')
    pg.click('[data-act=player-import]')
    pg.wait_for_selector('#sheet form[data-form=player-link]')
    chosen = pg.locator('#sheet form[data-form=player-link] select[name=source]')
    pg.select_option('#sheet form[data-form=player-link] select[name=source]', 'team1|' + original)
    pg.click('#sheet form[data-form=player-link] button[type=submit]')
    pg.wait_for_selector('#sheet form[data-form=player]')
    c.ok(pg.input_value('#sheet input[name=name]') == original_name, 'identity copied')
    c.ok(pg.input_value('#sheet input[name=number]') == '', 'no cross-team jersey number copied')
    allowed = pg.eval_on_selector_all('#sheet input[name=positions]', 'xs => xs.map(x => x.value)')
    c.ok('GS' in allowed and 'GK' in allowed and 'Halfback' not in allowed,
         'new team uses Netball positions rather than source sport positions')
    c.ok('Other teams' in pg.inner_text('#sheet'), 'membership visible on player form')
    # Set a completely different jersey/position then save.
    pg.fill('#sheet input[name=number]', '12')
    pg.check('#sheet input[name=positions][value=GS]')
    pg.click('#sheet form[data-form=player] button[type=submit]')
    pg.wait_for_timeout(140)
    linkedid = W("D.players[0].id")
    c.ok(W("D.players[0].number") == '12' and W("D.players[0].positions.join(',')") == 'GS', 'target-specific number and position')
    c.ok(W("W.players.find(x=>x.id==='" + original + "').number") == original_number, 'source kit untouched')
    c.ok(W("M.personTeams(W,'team1','" + original + "').length") == 2, 'explicit link identifies one person on two teams')
    c.ok(W("M.openLoans(D.players[0]).length") == 1, 'new Netball jersey marked as issued')
    # The existing players.py suite separately qualifies the Settings loan toggle.
    # Enable the loan policy in synthetic data here to isolate cross-team return handling.
    W("(D.team.jerseyLoan = true, 1)")
    pg.keyboard.press('Escape')
    pg.evaluate(act, ['edit-player', {'id': linkedid}])
    pg.wait_for_selector('#sheet .jersey-block [data-act=jersey-back]')
    pg.click('#sheet [data-act=jersey-back]')
    pg.wait_for_timeout(160)
    c.ok(W("M.openLoans(D.players[0]).length") == 0, 'target jersey returned')
    c.ok(W("M.openLoans(W.players.find(x=>x.id==='" + original + "')).length") >= 1,
         'source jersey remains issued after target return')
    c.ok('Titans Netball' in pg.inner_text('#sheet') or 'Other teams' in pg.inner_text('#sheet'), 'player form stays functional')
    pg.keyboard.press('Escape')
    pg.goto(url + '#reports')
    pg.wait_for_timeout(120)
    c.ok('Jerseys' in pg.inner_text('#view') and 'returned' in pg.inner_text('#view').lower(),
         'jersey return visible to manager in reports')
    # Reopen player and verify linked team status and clean public identity projection.
    pg.goto(url + '#squad')
    pg.evaluate(act, ['edit-player', {'id': linkedid}])
    pg.wait_for_selector('#sheet form[data-form=player]')
    c.ok('Other teams' in pg.inner_text('#sheet') and original_name in pg.input_value('#sheet [name=name]'),
         'linked team visible when editing')
    public_view = pg.evaluate("""async () => {
      const { teamView } = await import('./vault.js');
      const { M, data } = window.__team;
      return JSON.stringify(teamView(M.activeLens(data)));
    }""")
    c.ok('personId' not in public_view and 'jerseys' not in public_view and '0400' not in public_view,
         'shared link and jersey history are private to the coach')
    pg.keyboard.press('Escape')
    for width in (390, 1280):
        pg.set_viewport_size({'width': width, 'height': 900})
        pg.goto(url + '#squad')
        pg.wait_for_timeout(110)
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'[{width}] linked-player squad no horizontal overflow')
    ok = c.done(errs)
    b.close()
srv.shutdown()
sys.exit(0 if ok else 1)
