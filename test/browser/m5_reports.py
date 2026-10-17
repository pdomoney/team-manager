import sys; from harness import *
from playwright.sync_api import sync_playwright
build(); srv, url = serve()
c = Check()
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, errs = page(b, url + '#home', width=1280, height=900)
    # empty team first: nothing recorded must not read as zero
    pg.wait_for_selector('text=Load a sample squad')
    pg.evaluate(act, ['tab', {'tab': 'reports'}]); pg.wait_for_timeout(150)
    txt = pg.inner_text('#view')
    c.ok('Attendance not recorded' in txt and 'No results entered' in txt, 'empty team: not recorded, not zero')
    c.ok('0%' not in txt, 'no 0% shown without data')
    pg.evaluate(act, ['tab', {'tab': 'home'}]); pg.click('text=Load a sample squad'); pg.wait_for_timeout(300)
    pg.evaluate(act, ['tab', {'tab': 'reports'}]); pg.wait_for_timeout(150)
    txt = pg.inner_text('#view')
    c.ok('Average attendance' in txt and '1–0–0' in txt, 'sample: attendance and record')
    c.ok('Said they’d come, and did' in txt, 'planned vs actual section')
    c.ok('Loose ends' in txt and ('availability repl' in txt or 'No lineup' in txt), 'outstanding items listed')
    c.ok('Positions in match lineups' in txt and 'From 1 past match' in txt, 'position usage from the played match')
    c.ok('Mia Tuala' in txt and 'Rachel Tuala' in txt, 'players and volunteers tables')
    pg.click('[data-act=report-range][data-v=event]'); pg.wait_for_timeout(100)
    txt = pg.inner_text('#view')
    c.ok('NSW State Cup' in txt and 'No results entered' in txt, 'tournament period has no results yet')
    pg.click('[data-act=report-range][data-v=recent]'); pg.wait_for_timeout(100)
    pg.screenshot(path=shot('m5.png'), full_page=True)
    ok = c.done(errs); b.close()
srv.shutdown(); sys.exit(0 if ok else 1)
