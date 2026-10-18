# Seasons: upgrading a copy from before seasons, a team with Winter 2026 and Winter 2027, carrying
# players over, looking back read-only, correcting a past season, the players' view, Home, backups.
import sys, json; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
# A test-mode copy from before seasons (schema 3), with a played match and training.
OLD = { 'schema': 3, 'id': 'team1', 'team': { 'name': 'Taren Point Titans Women', 'category': 'women', 'event': 'Winter League', 'eventStart': '2026-04-11', 'eventEnd': '2026-08-29', 'trainingStart': '18:00', 'trainingVenue': 'Gwawley Park' },
  'players': [{ 'id': 'p1', 'name': 'Amy Ace', 'gender': 'F', 'number': '4', 'positions': ['Middle'], 'status': 'available' }, { 'id': 'p2', 'name': 'Bea Back', 'gender': 'F', 'number': '9', 'positions': ['Wing'], 'status': 'injured' },
    { 'id': 'p3', 'name': 'Cat Leaving', 'gender': 'F', 'number': '12', 'positions': ['Link'], 'status': 'available', 'phone': '0400 123 456' }],
  'sessions': [{ 'id': 's1', 'date': '2026-05-05', 'start': '18:00', 'attendance': { 'p1': 'present', 'p2': 'present', 'p3': 'late' }, 'rsvp': {} }],
  'matches': [{ 'id': 'm1', 'date': '2026-05-10', 'start': '10:00', 'opponent': 'Como Crocs', 'status': 'played', 'result': { 'us': 5, 'them': 2 }, 'rsvp': {}, 'tournament': True, 'lineupId': '' }],
  'lineups': [], 'tasks': [], 'helpers': [], 'notices': [{ 'id': 'n1', 'at': '2026-05-01T00:00:00.000Z', 'text': 'Season launch BBQ' }], 'messages': [], 'plays': [], 'playerSets': [], 'systems': {}, 'teams': [], 'library': {}, 'clubs': [] }
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=390, height=844)
    W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.state; return {js}; }})()')
    # a fresh test-mode start: one season made quietly, Home works without setting anything up
    pg.wait_for_selector('text=Load a sample squad')
    c.ok(W('D.seasons.length') == 1 and W('D.seasons[0].status') == 'active' and pg.locator('#sheet:not([hidden])').count() == 0, 'single team: a season is there without any setup')
    # upgrade the old copy
    pg.evaluate(f"localStorage.setItem('tm-test-data', {json.dumps(json.dumps(OLD))})"); pg.reload(); pg.wait_for_function('window.__team && window.__team.ws')
    pg.wait_for_timeout(300)
    c.ok(W('W.schema') == 4 and W('D.id') == 'team1' and W('D.seasons.map(s => s.name).join()') == '2026', 'old copy upgraded: same team, first season named from its records')
    c.ok(W('!!localStorage.getItem("tm-before-seasons")'), 'a copy from before seasons is kept')
    pg.evaluate(act, ['season-open', {}]); pg.wait_for_selector('#sheet [data-act=season-edit]')
    pg.click('#sheet [data-act=season-edit]'); pg.fill('#sheet input[name=name]', 'Winter 2026'); pg.fill('#sheet input[name=label]', 'Winter')
    pg.click('#sheet form[data-form=season] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok('Winter 2026' in pg.inner_text('#team-title'), 'the season shows under the team name')
    # create next season: carry Amy and Bea (Bea with a new number), add Dee, start it now
    pg.click('#sheet [data-act=season-next]'); pg.wait_for_selector('#sheet form[data-form=season-next]')
    c.ok(pg.input_value('#sheet input[name=name]') == 'Winter 2027', 'next season’s name suggested')
    c.ok(pg.locator('#sheet input[name=carry]:checked').count() == 0, 'nobody is carried over until picked')
    pg.check('#sheet input[name=carry][value=p1]'); pg.check('#sheet input[name=carry][value=p2]'); pg.fill('#sheet input[name="num-p2"]', '19')
    pg.fill('#sheet textarea[name=newPlayers]', 'Dee New, F, 21')
    pg.check('#sheet input[name=when][value=now]')
    pg.click('#sheet form[data-form=season-next] button[type=submit]'); pg.wait_for_selector('#sheet [data-act=season-next-go]')
    rv = pg.inner_text('#sheet')
    c.ok('Carrying over (2)' in rv and 'New (1)' in rv and 'Cat Leaving' in rv and 'Not copied' in rv, 'a summary to check before creating')
    pw = W('D.teamPass')
    pg.click('#sheet [data-act=season-next-go]'); pg.wait_for_timeout(250)
    c.ok('password' in pg.inner_text('#sheet'), 'the squad changed: offered to review the players’ password (nothing changed)')
    c.ok(W('D.teamPass') == pw, 'password untouched')
    pg.keyboard.press('Escape')
    c.ok(W("D.seasons.map(s => s.name + ':' + s.status).join()") == 'Winter 2026:completed,Winter 2027:active' and W('D.id') == 'team1', 'two seasons, one team, one active')
    c.ok(W("D.players.filter(p => p.name === 'Amy Ace').length") == 1, 'a carried player is the same record, not a copy')
    pg.goto(url + '#squad'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#view')
    c.ok('Amy Ace' in txt and 'Dee New' in txt and 'Cat Leaving' not in txt, 'this season’s squad: carried and new players only')
    c.ok(W("M.seasonLens(D, D.seasons[1].id).players.find(p => p.id === 'p2').status") == 'available', 'last season’s injury isn’t carried as current')
    pg.goto(url + '#training'); pg.wait_for_timeout(150)
    c.ok('No training' in pg.inner_text('#view') or pg.locator('.sess').count() == 0, 'no training copied into the new season')
    pg.goto(url + '#matches'); pg.wait_for_timeout(150)
    c.ok('Como Crocs' not in pg.inner_text('#view'), 'no matches or results copied')
    pg.goto(url + '#home'); pg.wait_for_timeout(150)
    c.ok('Season launch BBQ' not in pg.inner_text('#view'), 'Home and notices are this season’s')
    # look back at Winter 2026: read-only, its squad and results as they were
    pg.click('[data-act=season-pick]'); pg.wait_for_selector('#sheet [data-act=season-view]')
    pg.click('#sheet [data-act=season-view]:has-text("Winter 2026")'); pg.wait_for_timeout(200)
    pg.goto(url + '#squad'); pg.wait_for_timeout(150)
    txt = pg.inner_text('#view')
    c.ok('Cat Leaving' in txt and 'Dee New' not in txt and 'looking back' in pg.inner_text('#team-title'), 'looking back: Winter 2026’s squad, with the player who left')
    c.ok(W("M.seasonLens(D, D.seasons[0].id).players.find(p => p.id === 'p2').number") == '9', 'Winter 2026 keeps Bea’s number 9')
    pg.goto(url + '#matches'); pg.wait_for_timeout(150)
    c.ok('Como Crocs' in pg.inner_text('#view') and 'Won' in pg.inner_text('#view'), 'Winter 2026’s result is still there')
    n = W('D.matches.length')
    pg.click('[data-act=match-new]'); pg.wait_for_timeout(150)
    c.ok(W('D.matches.length') == n and pg.locator('#sheet:not([hidden])').count() == 0 and 'read-only' in pg.inner_text('#toast'), 'nothing can be added while looking back')
    # a deliberate correction to Winter 2026
    pg.click('[data-act=season-fix]'); pg.wait_for_timeout(150)
    c.ok('Correcting Winter 2026' in pg.inner_text('#view'), 'correcting is clearly shown')
    pg.click('[data-act=match-new]'); pg.wait_for_selector('#sheet form[data-form=match]')
    pg.fill('#sheet input[name=opponent]', 'Gymea Gorillas'); pg.fill('#sheet input[name=date]', '2026-06-14')
    pg.click('#sheet form[data-form=match] button[type=submit]'); pg.wait_for_timeout(200); pg.keyboard.press('Escape')
    c.ok(W("D.matches.find(m => m.opponent === 'Gymea Gorillas').seasonId") == W('D.seasons[0].id'), 'a missed match added to Winter 2026, not this season')
    pg.click('[data-act=season-fix-done]'); pg.wait_for_timeout(100)
    # a past season's squad numbers are edited in Seasons, without touching this season
    pg.evaluate(act, ['season-open', {}]); pg.wait_for_selector('#sheet [data-act=season-squad]')
    pg.locator('#sheet [data-act=season-squad]').nth(1).click(); pg.wait_for_selector('#sheet form[data-form=season-squad]')
    pg.fill('#sheet input[name="num-p1"]', '44'); pg.click('#sheet form[data-form=season-squad] button[type=submit]'); pg.wait_for_timeout(150)
    c.ok(W("D.seasons[0].squad.find(m => m.playerId === 'p1').number") == '44' and W("D.players.find(p => p.id === 'p1').number") == '4', 'Winter 2026 number corrected; the current number unchanged')
    pg.keyboard.press('Escape')
    pg.click('[data-act=season-pick]'); pg.wait_for_selector('#sheet [data-act=season-view]')
    pg.click('#sheet [data-act=season-view]:has-text("Winter 2027")'); pg.wait_for_timeout(200)
    c.ok('looking back' not in pg.inner_text('#team-title'), 'back to the active season')
    # the players' view: this season only
    pg.evaluate(act, ['preview-on', {}]); pg.goto(url + '#squad'); pg.wait_for_timeout(200)
    txt = pg.inner_text('#view')
    c.ok('Amy Ace' in txt and 'Cat Leaving' not in txt, 'players see this season’s squad, not who left')
    pg.goto(url + '#matches'); pg.wait_for_timeout(150)
    c.ok('Como Crocs' not in pg.inner_text('#view'), 'players don’t see last season’s matches')
    c.ok('0400 123 456' not in txt, 'no departed player’s phone in the players’ view')
    pg.evaluate(act, ['preview-off', {}]); pg.wait_for_timeout(100)
    # Reports: seasons side by side
    pg.goto(url + '#reports'); pg.wait_for_timeout(200)
    c.ok('Seasons compared' in pg.inner_text('#view') and 'Winter 2026' in pg.inner_text('#view'), 'reports compare the seasons')
    # backup and restore keep both seasons
    with pg.expect_download() as dl: pg.evaluate(act, ['export', {}])
    path = dl.value.path(); bk = json.load(open(path))
    c.ok(len(bk.get('seasons', [])) == 2 and bk.get('schema') == 4, 'the backup has both seasons')
    with pg.expect_download() as dl2: pg.evaluate(act, ['export-pre-seasons', {}])
    pre = json.load(open(dl2.value.path()))
    c.ok(pre.get('schema') == 3 and 'seasons' not in pre, 'the copy from before seasons downloads as it was')
    pg.evaluate(act, ['start-over', {}]); pg.click('#sheet [data-p=all]'); pg.click('#sheet button[type=submit]'); pg.wait_for_timeout(200)
    pg.evaluate("() => { window.__team.state.importKind = 'backup'; }")
    pg.set_input_files('#import-file', path); pg.wait_for_selector('#sheet [data-act=import-do]')
    pg.click('#sheet [data-act=import-do][data-m=all]'); pg.wait_for_timeout(300)
    c.ok(W("D.seasons.map(s => s.name + ':' + s.status).join()") == 'Winter 2026:completed,Winter 2027:active' and W("D.players.length") == 4, 'restoring the backup brings back both seasons and every player')
    # layout
    for w in (390, 1280):
        pg.set_viewport_size({'width': w, 'height': 900}); pg.goto(url + '#squad'); pg.wait_for_timeout(150)
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'[{w}] no sideways scroll')
    pg.evaluate(act, ['season-open', {}]); pg.wait_for_timeout(150)
    pg.screenshot(path=shot('seasons-sheet.png'))
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
