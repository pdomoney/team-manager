# The test library: made-up data that comes out the same on every device. Two "devices" (separate
# browsers, a phone and a laptop) load it a moment apart and must hold identical data with the same
# data check code. Then every screen of every team opens cleanly, Match Day has a game, the staffing
# check has its shortfall, a fresh load puts edits back, and a copy with real players can't be replaced.
import sys, time, datetime, json
from harness import *
from ghmock import GitHubMock
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c, errs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
STABLE = "async () => (await import('./test-library.js')).stable(window.__team.ws)"
TABS = ['home', 'agenda', 'training', 'matches', 'attendance', 'squad', 'tasks', 'helpers', 'crew', 'field', 'plays', 'rules', 'library', 'more', 'club', 'messages', 'reports', 'teams', 'comps', 'notices', 'tally']

def load(pg):
    pg.add_style_tag(content='#toast{display:none!important}')
    pg.wait_for_selector('[data-act=test-library]')
    pg.click('#view [data-act=test-library]'); pg.wait_for_timeout(300)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx1, phone, _ = page(browser, url + '#home', width=390, height=844, errors=errs)
    load(phone)
    W = lambda js: phone.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.S; return {js}; }})()')
    c.ok(W('W.testLibrary.version') >= 3 and W('M.teamsOf(W).length') == 6 and W('W.clubs.map(c => c.id).sort()') == ['engadinedragons', 'penrithoztag', 'stgeorge', 'tarenpointtitans'] and W('W.matchOfficials.length') == 6, 'six teams in the four real clubs, and six volunteers')
    c.ok(W('D.id') == W('W.id') and W('D.players.length') == 16 and W("D.players.every(p => /^tst\\d+$/.test(p.id))"), 'opens on the Mixed 20s; ids are the numbered test ones')
    today = W("(t => t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'))(new Date())")
    c.ok(W(f"D.matches.filter(m => m.date === '{today}').length") == 5 and W(f"D.matches.filter(m => m.date === '{today}').every(m => m.entryId)"), 'a gala day today with five games, in its competition')
    c.ok('Test library' in phone.inner_text('#status'), 'the status line says it’s the test library')
    time.sleep(1.5)   # the second device loads a moment later
    ctx2, laptop, _ = page(browser, url + '#home', width=1280, height=860, errors=errs)
    load(laptop)
    same = phone.evaluate(STABLE) == laptop.evaluate(STABLE)
    c.ok(same, 'phone and laptop hold exactly the same data')
    if not same:
        a, b = phone.evaluate(STABLE), laptop.evaluate(STABLE)
        i = next(k for k in range(min(len(a), len(b))) if a[k] != b[k]); print('  differs at', a[max(0, i - 120):i + 80], '\n  vs', b[max(0, i - 120):i + 80])
    for pg in (phone, laptop): pg.evaluate(act, ['settings', {'sec': 'testlib'}]); pg.wait_for_selector('#sheet .data-check b')
    code = phone.inner_text('#sheet .data-check b')
    c.ok(len(code) == 6 and code == laptop.inner_text('#sheet .data-check b'), f'the same data check code on both ({code})')
    c.ok('Test library from' in phone.evaluate("(() => { document.querySelector('#sheet .set-back').click(); return document.querySelector('#sheet [data-sec=testlib]').innerText; })()"), 'Settings lists Test data with the code')
    phone.keyboard.press('Escape'); laptop.keyboard.press('Escape')
    ctx2.close()

    # Every screen of every team opens without errors and fits the phone.
    bad = []
    for tid in W('M.teamsOf(W).map(t => t.id)'):
        W("(window.__team.state.lastView = {}, 1)")
        phone.evaluate(f"(() => {{ const b = document.createElement('button'); b.dataset.act = 'home-go'; b.dataset.team = '{tid}'; b.dataset.go = 'tab'; b.dataset.tab = 'home'; document.body.appendChild(b); b.click(); b.remove(); }})()")
        phone.wait_for_timeout(80)
        if W('D.id') != tid: bad.append(f'switch {tid}')
        for t in TABS:
            phone.evaluate(act, ['tab', {'tab': t}]); phone.wait_for_timeout(40)
            if not phone.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'): bad.append(f'{tid}/{t} overflow')
    c.ok(not bad, f'every screen of all six teams opens and fits {bad[:5]}')
    phone.evaluate(f"(() => {{ const b = document.createElement('button'); b.dataset.act = 'home-go'; b.dataset.team = '{W('W.id')}'; b.dataset.go = 'tab'; b.dataset.tab = 'matches'; document.body.appendChild(b); b.click(); b.remove(); }})()")
    phone.wait_for_timeout(100)
    hour = datetime.datetime.now().hour
    if 6 <= hour < 22:
        c.ok(phone.locator('.m-card [data-act=matchday-open]').count() >= 1, 'a gala game is due, so Match day is ready to try')
    # Staffing: requirements set (made up), the Hills game has one person not yet cleared.
    hills = W("D.matches.find(m => m.opponent === 'Hills Hornets').id")
    phone.evaluate(act, ['match-open', {'id': hills}]); phone.wait_for_selector('#sheet .crew-match-summary')
    txt = phone.inner_text('#sheet .crew-match-summary')
    c.ok('needs attention' in txt and 'Morgan Ellis' in txt and 'WWCC' in txt, 'the Hills game shows a real staffing shortfall (WWCC not checked)')
    phone.keyboard.press('Escape')
    phone.evaluate(act, ['tab', {'tab': 'crew'}]); phone.wait_for_timeout(100)
    states = phone.evaluate("[...new Set([...document.querySelectorAll('#view .cbadge')].map(b => [...b.classList].find(k => k.startsWith('s-'))))]")
    c.ok({'s-current', 's-expiring', 's-unverified'} <= set(states), f'volunteers show current, expiring and unchecked badges {states}')
    # A fresh load puts any changes back.
    before = phone.evaluate(STABLE)
    W("(D.players[0].name = 'Changed', window.__team.ws.matchOfficials.pop(), 1)")
    phone.evaluate(act, ['test-library', {}]); phone.wait_for_timeout(300)
    c.ok(phone.evaluate(STABLE) == before, 'loading a fresh test library undoes the changes')
    # A copy with real players (not the test library) is never replaced, even when asked.
    W("(delete window.__team.ws.testLibrary, window.__team.S.trial = false, 1)")
    phone.evaluate(act, ['test-library', {}]); phone.wait_for_timeout(100)
    c.ok(W('D.players.length') == 16 and W('!W.testLibrary'), 'a live copy with real players can’t be replaced by the test library')
    W("(window.__team.S.trial = true, 1)")
    # The players' copy has none of the coach-only test data.
    view = phone.evaluate("async () => { const v = await import('./vault.js'), x = window.__team; return JSON.stringify(v.teamView(x.M.activeLens(x.data), x.M.clubOf(x.ws, x.data), [])); }")
    private = ['0491 570 006', '0491 570 157', '0491 570 158', '0491 570 159', '0491 570 110', 'example.com', 'Casey Morgan', 'Frances Lee', 'testLibrary']
    leaked = [x for x in private if x in view]
    c.ok(not leaked and '0491 570 156' in view, f'players’ copy: the team contact (public by design) but no staff or player phones, emails or volunteers {leaked}')
    phone.screenshot(path=shot('test-library.png'))
    ctx1.close()

    # Live, across devices: load it on the phone and go live; the laptop signs in and gets the same copy;
    # each adds a volunteer; after combining, both devices hold the same data again.
    gh = GitHubMock()
    GH = json.dumps({'owner': 'o', 'repo': 'r', 'token': 'tok', 'autoPublish': False})
    def device(width):
        ctx = browser.new_context(viewport={'width': width, 'height': 860})
        ctx.add_init_script(f"if (!localStorage.getItem('tm-github')) localStorage.setItem('tm-github', {json.dumps(GH)});")
        ctx.route('https://api.github.com/**', gh.handle); ctx.route('**/fonts.g*/**', lambda r: r.abort())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        return ctx, pg
    Wd = lambda pg, js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.S; return {js}; }})()')
    done = lambda pg: (pg.wait_for_function("!window.__team.S.publishing && ['ok', 'error', 'conflict'].includes(window.__team.S.pub)", timeout=40000), pg.wait_for_timeout(150))
    check = lambda pg: pg.evaluate("async () => (await import('./test-library.js')).dataCheck(window.__team.ws)")
    def add_volunteer(pg, name):
        pg.evaluate(act, ['crew-new', {}]); pg.click('#sheet form[data-form=crew-intake-start] button[type=submit]')
        pg.fill('#sheet form[data-form=crew-manual] input[name=name]', name); pg.click('#sheet form[data-form=crew-manual] button[type=submit]'); pg.wait_for_timeout(120)
    ca, a = device(390); a.goto(url + '#home'); load(a)
    a.evaluate(act, ['go-live', {}]); a.fill('#sheet input[name=coach]', 'coach password one'); a.fill('#sheet input[name=coach2]', 'coach password one')
    a.fill('#sheet input[name=team]', 'team password one'); a.fill('#sheet input[name=team2]', 'team password one'); a.click('#sheet button[type=submit]')
    a.wait_for_function('window.__team.S.trial === false', timeout=20000); done(a)
    c.ok(Wd(a, 'S.pub') == 'ok' and len(gh.files()) == 6, f'live: the test library published, one players’ file per team ({len(gh.files())} files)')
    cb, bb = device(1280); bb.goto(url + '#home'); bb.wait_for_selector("text=I'm the coach"); bb.click("text=I'm the coach")
    bb.fill('input[name=password]', 'coach password one'); bb.click('button[type=submit]'); bb.wait_for_function('window.__team.ws', timeout=30000); bb.wait_for_timeout(200)
    c.ok(check(a) == check(bb) and Wd(bb, 'W.testLibrary.version') >= 1, 'live: the laptop signs in and holds the same data (same data check)')
    add_volunteer(bb, 'Laptop Volunteer'); bb.evaluate(act, ['publish', {}]); done(bb)
    add_volunteer(a, 'Phone Volunteer'); a.evaluate(act, ['publish', {}]); done(a)
    if Wd(a, 'S.pub') == 'conflict':
        a.evaluate(act, ['conflict', {}]); a.wait_for_selector('#sheet form[data-form=merge]', timeout=20000)
        a.click('#sheet form[data-form=merge] button[type=submit]'); done(a)
    bb.evaluate(act, ['load-latest', {}]); bb.wait_for_timeout(1500)
    names = sorted(Wd(bb, 'W.matchOfficials.map(p => p.name)'))
    c.ok('Laptop Volunteer' in names and 'Phone Volunteer' in names and len(names) == 8, f'live: volunteers added on both devices are both kept {names}')
    c.ok(check(a) == check(bb), 'live: after combining, both devices hold the same data again')
    # A fresh test library while live: passwords kept, published for the other devices.
    pw = Wd(a, '[W.teamPass, M.findTeam(W, "testwomen").teamPass]')
    a.evaluate(act, ['test-library', {}]); a.wait_for_timeout(300); a.evaluate(act, ['publish', {}]); done(a)
    c.ok(Wd(a, '[W.teamPass, M.findTeam(W, "testwomen").teamPass]') == pw and Wd(a, 'W.matchOfficials.length') == 6 and Wd(a, 'S.pub') in ('ok', 'conflict'),
         'live: a fresh test library keeps the passwords and goes out to the other devices')
    ca.close(); cb.close()
    ok = c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
