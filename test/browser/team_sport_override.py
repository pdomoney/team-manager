# The club sport supplies a default; the team's explicit sport governs new-player positions.
# All activity is synthetic Chromium test mode; no real player records or GitHub account.
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
    pg.wait_for_selector('text=Load a sample squad')
    pg.click('[data-act=sample]')
    pg.wait_for_timeout(100)

    # Club sets Rugby League as the default, not a mandatory sport for all its teams.
    pg.goto(url + '#teams')
    pg.click('[data-act=club-new]')
    pg.wait_for_selector('#sheet form[data-form=club]')
    pg.fill('#sheet form[data-form=club] input[name=name]', 'Taren Point Titans')
    pg.select_option('#sheet form[data-form=club] select[name=sport]', 'Rugby league')
    c.ok('Default sport for teams' in pg.inner_text('#sheet') and 'unless their own' in pg.inner_text('#sheet'),
         'club label explains default and team override')
    pg.click('#sheet form[data-form=club] button[type=submit]')
    pg.wait_for_timeout(120)
    clubid = W("W.clubs.find(x=>x.name==='Taren Point Titans').id")
    c.ok(W("W.clubs.find(x=>x.id==='" + clubid + "').sport") == 'Rugby league', 'rugby league club sport saved')

    pg.goto(url + '#teams')
    pg.click('[data-act=team-new]')
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    pg.fill('#sheet form[data-form=team-new] input[name=name]', 'Titans Women League Tag')
    pg.select_option('#sheet form[data-form=team-new] select[name=clubId]', clubid)
    c.ok('Rugby league positions' in pg.inner_text('[data-sport-guide]') and 'Halfback' in pg.inner_text('[data-sport-guide]'),
         'new team initially inherits selected Rugby league club')
    pg.select_option('#sheet form[data-form=team-new] select[name=teamSport]', 'League tag')
    c.ok('League tag positions (team override)' in pg.inner_text('[data-sport-guide]'),
         'choosing League tag overrides club while form is open')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(130)
    c.ok(W("D.team.sport") == 'League tag', 'team override saved independently')
    c.ok(W("W.clubs.find(x=>x.id==='" + clubid + "').sport") == 'Rugby league',
         'club keeps default Rugby league sport')
    pg.goto(url + '#squad')
    pg.evaluate(act, ['add-player', {}])
    pg.wait_for_selector('#sheet form[data-form=player]')
    pos = pg.eval_on_selector_all('#sheet input[name=positions]', 'xs=>xs.map(x=>x.value)')
    c.ok('Halfback' in pos and 'Fullback' in pos and 'GS' not in pos and 'Rover' not in pos,
         'new League tag player uses team sport preferred positions')
    c.ok('team sport override' in pg.inner_text('#sheet form[data-form=player]'),
         'player form explains explicit team source')
    pg.keyboard.press('Escape')

    # A rugby league team without its own sport inherits the club sport.
    pg.goto(url + '#teams')
    pg.click('[data-act=team-new]')
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    pg.fill('#sheet input[name=name]', 'Titans Women Rugby League')
    pg.select_option('#sheet select[name=clubId]', clubid)
    c.ok('Use club default (Rugby league)' in pg.inner_text('#sheet select[name=teamSport]'),
         'club default is shown by name, not merely a blank option')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(120)
    c.ok(W("D.team.sport") == '' and W("M.teamSport(D.team,M.clubOf(W,D))") == 'Rugby league',
         'club default remains inherited instead of an unnecessary explicit override')

    # Touch team inside an Oztag club uses Touch positions, not Oztag Rover.
    pg.goto(url + '#teams')
    pg.click('[data-act=team-new]')
    pg.wait_for_selector('#sheet form[data-form=team-new]')
    pg.fill('#sheet input[name=name]', 'St George Touch')
    pg.select_option('#sheet select[name=clubId]', 'stgeorge')
    pg.select_option('#sheet select[name=teamSport]', 'Touch football')
    c.ok('Touch football positions (team override)' in pg.inner_text('[data-sport-guide]'),
         'Oztag club can choose Touch football at team level')
    pg.click('#sheet form[data-form=team-new] button[type=submit]')
    pg.wait_for_timeout(120)
    pg.evaluate(act, ['add-player', {}])
    pg.wait_for_selector('#sheet form[data-form=player]')
    pos = pg.eval_on_selector_all('#sheet input[name=positions]', 'xs=>xs.map(x=>x.value)')
    c.ok('Middle' in pos and 'Link' in pos and 'Rover' not in pos,
         'Touch team positions do not inherit the Oztag-only Rover')
    pg.keyboard.press('Escape')

    # Changing team sport on Settings previews new defaults before saving.
    pg.evaluate(act, ['settings', {'sec': 'team'}])
    pg.wait_for_selector('#sheet form[data-form=settings]')
    c.ok('Touch football positions' in pg.inner_text('[data-sport-guide]'), 'Settings reflects current team override')
    pg.select_option('#sheet form[data-form=settings] select[name=teamSport]', 'Netball')
    c.ok('Netball positions (team override)' in pg.inner_text('[data-sport-guide]'),
         'Settings previews an unsaved sport switch')
    c.ok('GS' in pg.input_value('#sheet input[name=positions]') and 'GK' in pg.input_value('#sheet input[name=positions]'),
         'inherited position text follows unsaved team sport when not customised')
    # A manual list is never silently replaced on subsequent sport changes.
    pg.fill('#sheet input[name=positions]', 'Custom left, Custom right')
    pg.select_option('#sheet select[name=teamSport]', 'Rugby league')
    c.ok(pg.input_value('#sheet input[name=positions]') == 'Custom left, Custom right',
         'manually typed custom position list is preserved')
    pg.keyboard.press('Escape')
    for width in (390, 1280):
        pg.set_viewport_size({'width': width, 'height': 900})
        pg.goto(url + '#squad')
        pg.wait_for_timeout(110)
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth'),
             f'[{width}] player screen has no sideways scrolling')
    ok = c.done(errs)
    b.close()
srv.shutdown()
sys.exit(0 if ok else 1)
