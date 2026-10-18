# Players and sports: even form fields, sport drop-downs, positions for the team's sport, player photos
# (coach only), jerseys given out and returned with their report, and the live competition on Home.
import sys, base64; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
PHOTO = os.path.join(WORK, 'player.png')
open(PHOTO, 'wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='))
HEIGHTS = """sel => [...document.querySelectorAll(sel)].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height))"""
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M; return {js}; }})()')
    pg.wait_for_selector('text=Load a sample squad'); pg.click('[data-act=sample]'); pg.wait_for_timeout(300)
    # competition form: one field height, sport is a drop-down
    pg.goto(url + '#comps'); pg.wait_for_timeout(100); pg.click('[data-act=comp-new]'); pg.wait_for_selector('#sheet form[data-form=comp]')
    hs = set(pg.evaluate(HEIGHTS, "#sheet form[data-form=comp] input:not([type=hidden]), #sheet form[data-form=comp] select"))
    c.ok(len(hs) == 1, f'text boxes, dates and drop-downs are all the same height {hs}')
    opts = pg.eval_on_selector_all('#sheet select[name=sport] option', 'os => os.map(o => o.value)')
    c.ok(all(x in opts for x in ['Oztag', 'Rugby league', 'League tag', 'Touch football', 'Rugby union', 'Netball']), 'sport is a drop-down of the sports')
    pg.keyboard.press('Escape')
    # the team plays rugby league: positions follow
    pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#sheet select[name=teamSport]')
    hs = set(pg.evaluate(HEIGHTS, "#sheet form[data-form=settings] input[type=text], #sheet form[data-form=settings] input[type=date], #sheet form[data-form=settings] select"))
    c.ok(len(hs) == 1, f'Settings: fields the same height {hs}')
    pg.select_option('#sheet select[name=teamSport]', 'Rugby league'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(200)
    c.ok(W('D.team.sport') == 'Rugby league' and W("D.team.positions.join()") == W("M.SPORT_POSITIONS['Rugby league'].join()"), 'changing the sport brings its positions')
    c.ok(W('M.ruleSetId(D.team, M.clubOf(W, D))').startswith('league/'), 'and its rules')
    pg.keyboard.press('Escape')
    pg.evaluate(act, ['add-player', {}]); pg.wait_for_selector('#sheet form[data-form=player]')
    new_pos = pg.eval_on_selector_all('#sheet input[name=positions]', 'xs => xs.map(x => x.value)')
    c.ok('Halfback' in new_pos and 'Fullback' in new_pos and 'Link' not in new_pos,
         'new player shows league positions, not stale Oztag defaults')
    pg.keyboard.press('Escape')
    pid = W("D.players.find(p => p.name === 'Mia Tuala').id")
    pg.evaluate(act, ['edit-player', {'id': pid}]); pg.wait_for_selector('#sheet form[data-form=player]')
    pos = pg.eval_on_selector_all('#sheet input[name=positions]', 'xs => xs.map(x => x.value)')
    c.ok('Halfback' in pos and 'Fullback' in pos and 'Rugby league positions' in pg.inner_text('#sheet'), 'the player form offers rugby league positions')
    c.ok('Middle' in pos, 'a position the player already had stays ticked-able')
    # photo
    pg.set_input_files('#sheet input[data-change=player-photo]', PHOTO); pg.wait_for_function("document.querySelector('#sheet input[name=photo]').value.startsWith('data:image/')")
    pg.click('#sheet form[data-form=player] button[type=submit]'); pg.wait_for_timeout(200)
    c.ok(W(f"D.players.find(p => p.id === '{pid}').photo").startswith('data:image/'), 'photo saved with the player')
    pg.goto(url + '#squad'); pg.wait_for_timeout(150)
    c.ok(pg.locator('.pphoto img').count() == 1, 'the squad list shows the photo')
    # jerseys: lent, returned, report
    pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#sheet input[name=jerseyLoan]')
    pg.check('#sheet input[name=jerseyLoan]'); pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(150); pg.keyboard.press('Escape')
    c.ok(W(f"M.openLoans(D.players.find(p => p.id === '{pid}')).length") == 1, 'a player with a number has their jersey')
    pg.evaluate(act, ['edit-player', {'id': pid}]); pg.wait_for_selector('#sheet .jersey-block')
    pg.fill('#sheet input[name=notes]', 'typed but not saved')
    pg.click('#sheet [data-act=jersey-back]'); pg.wait_for_timeout(150)
    c.ok(W(f"M.openLoans(D.players.find(p => p.id === '{pid}')).length") == 0 and 'Returned' in pg.inner_text('#sheet .jersey-block'), 'marked returned from the player')
    c.ok(pg.input_value('#sheet input[name=notes]') == 'typed but not saved', 'what was typed in the form is kept')
    pg.keyboard.press('Escape')
    pg.goto(url + '#reports'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#view')
    c.ok('Jerseys' in txt and '1 returned' in txt and 'still out' in txt, 'Reports: jerseys out and returned')
    other = W("D.players.find(p => p.name === 'Josh Halloran').id")
    pg.click(f'[data-act=jersey-back][data-player="{other}"]'); pg.wait_for_timeout(150)
    c.ok('2 returned' in pg.inner_text('#view'), 'returned from the report')
    # Correct a mistaken issue and save again: the jersey must not be resurrected.
    pg.evaluate(act, ['edit-player', {'id': other}]); pg.wait_for_selector('#sheet .jersey-block')
    pg.click('#sheet [data-act=jersey-del]'); pg.wait_for_timeout(180)
    c.ok(W(f"M.correctedJersey(D.players.find(p => p.id === '{other}'), M.activeSeason(D).id, D.players.find(p => p.id === '{other}').number)"), 'mistaken issue creates durable correction')
    pg.click('#sheet form[data-form=player] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok(W(f"D.players.find(p => p.id === '{other}').jerseys.length") == 0, 'saving does not recreate an issue deliberately removed')
    W("(D.players.find(p => p.name === 'Ava Kelleher').phone = '0412 345 678', 1)"); pg.goto(url + '#squad'); pg.goto(url + '#reports'); pg.wait_for_timeout(150)
    with pg.expect_popup() as pop: pg.locator('[data-act=jersey-remind]').first.click()
    c.ok('jersey' in pop.value.url.lower() or 'wa.me' in pop.value.url, 'reminder to hand a jersey back opens WhatsApp')
    pop.value.close()
    # The WhatsApp handoff explicitly asks the coach whether a message was sent.
    # A stubbed popup did not send anything; dismiss it as Not sent before
    # interacting with another form. Otherwise its fixed action panel can cover buttons.
    if pg.locator('#ask [data-act="msg-not-sent"]:visible').count():
        pg.locator('#ask [data-act="msg-not-sent"]').click()
    # live competition on Home
    W("(() => { const c = M.findComp(W, D.team.eventCompId), t = M.isoDay(new Date()); c.start = M.addDays(t, -1); c.end = M.addDays(t, 1); c.status = 'active'; const ms = D.matches.filter(m => m.entryId); ms[0].date = M.addDays(t, -1); ms[0].status = 'played'; ms[0].result = { us: 5, them: 2 }; ms[1].date = t; return 1; })()")
    pg.goto(url + '#home'); pg.wait_for_timeout(250)
    card = pg.locator('.comp-live')
    c.ok(card.count() == 1 and 'NSW State Cup' in card.inner_text() and 'DAY 2 OF 3' in card.inner_text().upper(), 'Home: the live competition, where it’s up to')
    c.ok('today' in card.inner_text().lower() and 'Won 5–2' in card.inner_text(), 'today’s matches and the last result')
    card.locator('.cl-open').click(); pg.wait_for_timeout(150)
    c.ok(W('window.__team.state.tab') == 'comps', 'opens the competition')
    # players: their own card, no photos
    pg.evaluate(act, ['preview-on', {}]); pg.goto(url + '#home'); pg.wait_for_timeout(250)
    c.ok(pg.locator('.comp-live').count() == 1, 'players see the live competition too')
    pg.goto(url + '#squad'); pg.wait_for_timeout(150)
    c.ok(pg.locator('.pphoto img, img[src^="data:image"]').count() == 0, 'players never see player photos')
    pg.evaluate(act, ['preview-off', {}]); pg.wait_for_timeout(100)
    # Switching to a different club sport must update New Player even with saved Oztag defaults.
    W("(() => { W.clubs.push(M.normClub({ id: 'netball-club', name: 'Netball club', sport: 'Netball' })); D.team.sport = ''; D.team.positions = M.SPORT_POSITIONS.Oztag.slice(); D.team.positionsCustom = false; return 1; })()")
    pg.evaluate(act, ['settings', {}]); pg.wait_for_selector('#sheet select[name=clubId]')
    pg.select_option('#sheet select[name=clubId]', 'netball-club')
    pg.click('#sheet form[data-form=settings] button[type=submit]'); pg.wait_for_timeout(200)
    c.ok(W('M.teamSport(D.team, M.clubOf(W,D))') == 'Netball', 'new club makes Netball the effective sport')
    pg.keyboard.press('Escape')
    pg.evaluate(act, ['add-player', {}]); pg.wait_for_selector('#sheet form[data-form=player]')
    net_pos = pg.eval_on_selector_all('#sheet input[name=positions]', 'xs => xs.map(x => x.value)')
    c.ok('GS' in net_pos and 'GK' in net_pos and 'Link' not in net_pos, 'Netball new-player positions follow the newly selected club')
    pg.keyboard.press('Escape')
    # Copying settings into a DIFFERENT sport must not carry an unrelated custom position list.
    W("(D.team.positions = ['Custom left', 'Custom right'], D.team.positionsCustom = true, 1)")
    pg.evaluate(act, ['team-new', {}]); pg.wait_for_selector('#sheet form[data-form=team-new]')
    pg.fill('#sheet form[data-form=team-new] input[name=name]', 'League Team Next')
    pg.select_option('#sheet form[data-form=team-new] select[name=clubId]', 'stgeorge')
    pg.select_option('#sheet form[data-form=team-new] select[name=teamSport]', 'Rugby league')
    pg.click('#sheet form[data-form=team-new] button[type=submit]'); pg.wait_for_timeout(200)
    c.ok(W("D.team.positions.join('|')") == W("M.SPORT_POSITIONS['Rugby league'].join('|')"),
         'new rugby league team does not inherit unrelated custom netball positions when copying settings')
    for w in (390, 1280):
        pg.set_viewport_size({'width': w, 'height': 900}); pg.goto(url + '#home'); pg.wait_for_timeout(200)
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'[{w}] Home with the live card: no sideways scroll')
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
