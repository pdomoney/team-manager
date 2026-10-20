# PR37: independent Cards/List preferences, sport-aware tactics and multi-season review data.
# All records are synthetic and local. No production team data is read or published.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, _ = page(browser, url + '#home', width=width, height=860, errors=errs)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]')
        pg.wait_for_function('window.__team.ws.testLibrary?.version === 3')
        W = lambda js: pg.evaluate(f'(() => {{ const W = window.__team.ws, D = window.__team.data, M = window.__team.M, S = window.__team.state; return {js}; }})()')
        checks.ok(W('M.teamsOf(W).length') == 6 and W('W.competitions.length') >= 7,
                  f'[{width}] six test teams with multiple competitions')
        checks.ok(W("M.teamsOf(W).filter(t => t.seasons.length === 3).length") >= 5,
                  f'[{width}] previous, current and planned test seasons remain on their own teams')
        checks.ok(W("M.teamsOf(W).some(t=>M.teamSport(t.team,M.clubOf(W,t))==='Rugby league')") and
                  W("W.competitions.some(c=>c.format==='roundrobin' && c.sport==='League tag')"),
                  f'[{width}] Rugby league and League tag tournaments are independently represented')
        for tab, selector in [('plays', '.plays-grid'), ('helpers', '.list.grid'),
                              ('crew', '.crew-directory-list'), ('matches', '.sess-grid')]:
            pg.goto(url + '#' + tab)
            pg.wait_for_selector('#view .card-mode')
            pg.locator(f'#view [data-act=card-view][data-page={tab}][data-mode=list]').click()
            checks.ok(pg.locator(f'#view [data-act=card-view][data-page={tab}][data-mode=list][aria-pressed=true]').count() == 1 and
                      pg.locator(f'#view {selector}.view-list').count() > 0,
                      f'[{width}] {tab} offers actual list layout')
            checks.ok(W(f'S.cardViews.{tab}') == 'list',
                      f'[{width}] {tab} selection is remembered separately')
        pg.reload()
        pg.wait_for_selector('#view .card-mode')
        checks.ok(pg.locator('[data-act=card-view][data-page=matches][data-mode=list][aria-pressed=true]').count() == 1,
                  f'[{width}] match view survives reload')
        pg.locator('[data-act=card-view][data-page=matches][data-mode=cards]').click()
        pg.goto(url + '#plays')
        checks.ok(pg.locator('[data-act=card-view][data-page=plays][data-mode=list][aria-pressed=true]').count() == 1,
                  f'[{width}] changing match preference does not change Plays')
        # The League Tag team must not inherit Oztag starter plays, positions or system cards.
        pg.evaluate(act, ['home-go', {'team':'testengadine','go':'tab','tab':'field'}])
        checks.ok(W('D.id') == 'testengadine' and W("M.teamSport(D.team,M.clubOf(W,D))") == 'League tag',
                  f'[{width}] selection switches to Dragons League Tag')
        checks.ok('League tag tactics' in pg.inner_text('#view') and
                  pg.locator('#view .lineup-pitch').count() == 0 and
                  'Oztag only' in pg.inner_text('#view'),
                  f'[{width}] League Tag team does not show Oztag lineup systems')
        pg.goto(url + '#plays')
        pg.wait_for_selector('[data-act=play-new]')
        checks.ok('League tag plays' in pg.inner_text('#view') and
                  pg.locator('#view .play-row').count() == 0,
                  f'[{width}] Oztag starters excluded from League Tag playbook')
        pg.click('#view [data-act=play-new]')
        checks.ok(pg.locator('#sheet .ped [data-change=ped-list] option[value=league]:checked').count() == 1 and
                  pg.locator('#sheet [name=playSport]').input_value() == 'League tag',
                  f'[{width}] new League Tag play starts with correct sport and teaching labels')
        pg.fill('#sheet input[name=name]', 'Synthetic league tag sweep')
        pg.click('#sheet form[data-form=play] button[type=submit]')
        pg.wait_for_timeout(160)
        checks.ok(W("D.plays.some(x=>x.name==='Synthetic league tag sweep' && x.sport==='League tag')"),
                  f'[{width}] play saved against the correct team sport')
        pg.click('#view [data-act=play-back]')
        checks.ok(pg.locator('.play-row').count() == 1, f'[{width}] new sport play appears in its own list')
        pg.evaluate(act, ['home-go', {'team':W('W.id'), 'go':'tab', 'tab':'plays'}])
        checks.ok('Oztag plays' in pg.inner_text('#view') and pg.locator('.play-row').count() >= 8 and
                  'Synthetic league tag sweep' not in pg.inner_text('#view'),
                  f'[{width}] returning to Oztag restores correct starters, no cross-team play leak')
        # A Rugby league team gets its own correct context, not the League Tag or Oztag playbook.
        pg.evaluate(act, ['home-go', {'team':'testleague','go':'tab','tab':'field'}])
        checks.ok('Rugby league tactics' in pg.inner_text('#view'),
                  f'[{width}] Rugby league context is independent of League Tag')
        checks.ok(W("M.teamEntries(W,'testleague', M.activeSeason(D).id).length") >= 1 and
                  W("D.matches.filter(x=>x.entryId).length") >= 3,
                  f'[{width}] actual Rugby league fixtures link to an active season and competition')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
                  f'[{width}] responsive tactics page fits viewport')
        ctx.close()
    ok = checks.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
