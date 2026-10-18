# Home command centre: one team and several clubs, scope, priority spotlight, coming up, outstanding
# actions, team summary, opening another team's record, archived teams, the players' Home, layout.
import sys, json; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
A11Y = """() => {
  const vis = el => el.offsetParent !== null || el.getClientRects().length;
  const name = el => (el.getAttribute('aria-label') || el.textContent || el.title || '').trim();
  const btn = [...document.querySelectorAll('#view button')].filter(vis).filter(b => !name(b)).map(b => b.outerHTML.slice(0, 80));
  const small = [...document.querySelectorAll('#view button')].filter(vis).filter(b => !b.matches('.link-btn.inline')).filter(b => { const r = b.getBoundingClientRect(); return r.height && r.height < 24; }).map(b => b.outerHTML.slice(0, 60));
  return { btn, small, wide: document.documentElement.scrollWidth > innerWidth };
}"""
def a11y(pg, where):
    r = pg.evaluate(A11Y)
    c.ok(not r['btn'] and not r['small'], f'{where}: every button named and big enough {r["btn"][:2]} {r["small"][:2]}')
    c.ok(not r['wide'], f'{where}: no sideways scroll')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
    pg.wait_for_selector('text=Load a sample squad')
    c.ok(pg.locator('.scope.single').count() == 1 and pg.locator('[data-act=home-scope]').count() == 0, 'one team: the team shown, no choosing')
    pg.click('[data-act=sample]'); pg.wait_for_timeout(300)
    txt = pg.inner_text('#view')
    c.ok(pg.locator('.focus h2').count() == 1 and 'Coming up' in txt and 'Outstanding actions' in txt and 'at a glance' in txt, 'one team: spotlight, coming up, actions and the team summary')
    c.ok(pg.locator('.hero').count() == 0, 'the big countdown is gone from Home')
    rows = pg.locator('.tl .tl-row').all_inner_texts()
    c.ok(not any('Lifts to the Hills game' in r for r in rows) and pg.locator('.tl-sub', has_text='Lifts to the Hills game').count() == 1, 'a task tied to a match shows once, under it')
    a11y(pg, '[390] one team')
    # a second club and team, with a match in a few hours and no lineup
    pg.goto(url + '#teams'); pg.wait_for_timeout(100)
    pg.click('[data-act=club-new]'); pg.fill('#sheet input[name=name]', 'Hills Oztag'); pg.click('#sheet form[data-form=club] button[type=submit]'); pg.wait_for_timeout(150)
    hills = W("W.clubs.find(c => c.name === 'Hills Oztag').id")
    pg.goto(url + '#teams'); pg.wait_for_timeout(100)
    pg.click('[data-act=team-new]'); pg.fill('#sheet input[name=name]', 'Hills Hornets Under 16 Girls Development'); pg.select_option('#sheet select[name=clubId]', hills)
    pg.click('#sheet form[data-form=team-new] button[type=submit]'); pg.wait_for_timeout(200)
    u16 = W('D.id')
    # same record id as DragonTag's Hills Hornets match, to prove the right team's record opens
    same = W("W.matches.find(m => m.opponent === 'Hills Hornets').id")
    W(f"""(() => {{ const d = new Date(Date.now() + 4 * 3600000); D.matches.push({{ id: '{same}', date: M.isoDay(d), start: String(d.getHours()).padStart(2, '0') + ':00', opponent: 'Wolves', status: 'scheduled', rsvp: {{}}, result: {{}} }}); return 1; }})()""")
    pg.evaluate(act, ['team-pick', {'id': 'team1'}]); pg.wait_for_timeout(150)
    pg.goto(url + '#home'); pg.wait_for_timeout(200)
    c.ok(W('D.id') == 'team1', 'DragonTag is the team being edited')
    c.ok(pg.locator('.scope [data-kind=all][aria-pressed=true]').count() == 1, 'several teams: Home starts on every club')
    c.ok(pg.locator('.scope-club').count() == 3 and pg.locator('.scope-team').count() == 2, 'All clubs, two clubs, two teams')
    spot = pg.inner_text('.focus')
    c.ok('Lineup incomplete' in spot and 'Hills Hornets Under 16' in spot and 'critical' in spot.lower(), 'the other team’s critical match leads')
    c.ok(W('D.id') == 'team1', 'ranking another team first doesn’t switch the team being edited')
    c.ok(pg.locator(f'.scope-team[data-id="{u16}"] .u-dot.critical').count() == 1, 'the urgent team is marked in the selector')
    a11y(pg, '[390] all clubs')
    pg.screenshot(path=shot('home-all-390.png'))
    # scope: one club, then one team
    pg.click('.scope-club[data-id=stgeorge]'); pg.wait_for_timeout(150)
    c.ok('Hills Hornets Under 16' not in pg.inner_text('#view') and 'Wolves' not in pg.inner_text('#view'), 'club scope: only that club’s teams')
    c.ok(W('JSON.parse(localStorage.getItem("tm-home-scope")).id') == 'stgeorge', 'the scope is remembered on this device')
    pg.goto(url + '#squad'); pg.wait_for_timeout(100); pg.goto(url + '#home'); pg.wait_for_timeout(200)
    c.ok(pg.locator('.scope-club[data-id=stgeorge][aria-pressed=true]').count() == 1, 'and still shown when coming back to Home')
    pg.evaluate('localStorage.setItem("tm-home-scope", "{\\"kind\\":\\"team\\",\\"id\\":\\"nope\\"}")'); pg.goto(url + '#squad'); pg.wait_for_timeout(100); pg.goto(url + '#home'); pg.wait_for_timeout(200)
    c.ok(pg.locator('.scope [data-kind=all][aria-pressed=true]').count() == 1, 'a scope that no longer exists falls back to every club')
    pg.click(f'.scope-team[data-id="{u16}"]'); pg.wait_for_timeout(200)
    c.ok(W('D.id') == u16 and 'No squad yet' in pg.inner_text('.home-ins'), 'picking a team works on it; a team with no players still shows')
    pg.click('.scope-club[data-kind=all]'); pg.wait_for_timeout(150)
    pg.evaluate(act, ['team-pick', {'id': 'team1'}]); pg.goto(url + '#home'); pg.wait_for_timeout(200)
    # open the other team's match from the spotlight
    pg.click('.focus [data-go=match-open]'); pg.wait_for_selector('#sheet form[data-form=match-lineup]')
    c.ok(W('D.id') == u16 and 'Wolves' in pg.inner_text('#sheet') and 'Hills Hornets' not in pg.inner_text('#sheet h2, #sheet .sheet-title, #sheet header'), 'Open match switches to that team and opens its match, not the one with the same id')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    pg.evaluate(act, ['team-pick', {'id': 'team1'}]); pg.goto(url + '#home'); pg.wait_for_timeout(200)
    # an action row for DragonTag opens its record
    first = pg.locator('.home-act .act-row').first
    tid = first.get_attribute('data-team'); first.click(); pg.wait_for_timeout(200)
    c.ok(W('D.id') == tid and pg.is_visible('#sheet'), 'an outstanding action opens its record in its team')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    # how far ahead, show all, cancelled training
    pg.goto(url + '#home'); pg.wait_for_timeout(150)
    n14 = pg.locator('.tl > li').count()
    pg.click('[data-act=home-days][data-v="30"]'); pg.wait_for_timeout(150)
    more = pg.locator('[data-act=home-more]')
    if more.count(): more.click(); pg.wait_for_timeout(150)
    c.ok(pg.locator('.tl > li').count() > n14, '30 days shows more than 14')
    pg.click('[data-act=home-days][data-v="14"]'); pg.wait_for_timeout(100)
    sid = W("W.sessions.filter(s => s.date >= M.isoDay(new Date())).sort((a, b) => a.date.localeCompare(b.date))[0].id")
    W(f"(W.sessions.find(s => s.id === '{sid}').cancelled = true, 1)")
    pg.evaluate(act, ['home-days', {'v': '14'}]); pg.wait_for_timeout(150)
    c.ok(pg.locator(f'.tl-row[data-id="{sid}"]').count() == 0 and 'cancelled' in pg.inner_text('.tl-changed'), 'cancelled training leaves the list and shows as changed')
    # archive the Hills team: gone from Home
    pg.goto(url + '#teams'); pg.wait_for_timeout(100); pg.click(f'[data-act=team-archive][data-id="{u16}"]'); pg.wait_for_timeout(150)
    pg.goto(url + '#home'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#view')
    c.ok('Hills Hornets Under 16' not in txt and 'Wolves' not in txt and pg.locator('.scope.single').count() == 1, 'an archived team is left out (one active team again)')
    pg.goto(url + '#teams'); pg.wait_for_timeout(100); pg.click(f'[data-act=team-restore][data-id="{u16}"]'); pg.wait_for_timeout(150)
    # the players' Home
    pg.evaluate(act, ['team-pick', {'id': 'team1'}]); pg.evaluate(act, ['preview-on', {}]); pg.goto(url + '#home'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#view')
    c.ok(pg.locator('nav.scope').count() == 0 and 'Hills Hornets Under 16' not in txt and 'Outstanding actions' not in txt and 'Wolves' not in txt, 'players see only their team')
    c.ok('availability repl' not in txt and 'No lineup' not in txt and 'next up' in txt.lower(), 'players see what’s next, nothing private')
    a11y(pg, '[390] player home')
    pg.evaluate(act, ['preview-off', {}]); pg.wait_for_timeout(100)
    # wide and narrow screens
    for w in (1280, 360):
        pg.set_viewport_size({'width': w, 'height': 900}); pg.goto(url + '#home'); pg.wait_for_timeout(250)
        a11y(pg, f'[{w}] all clubs')
        top = pg.evaluate("document.querySelector('.home-up').getBoundingClientRect().top")
        c.ok(top < 900, f'[{w}] selector, spotlight and the start of Coming up fit the first screen ({int(top)}px)')
    pg.screenshot(path=shot('home-360.png'))
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
