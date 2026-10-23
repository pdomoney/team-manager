# P08A: Rules presentation must not silently use another sport's rule pack.
# Synthetic browser-local coach data; Chromium qualification, NOT Safari acceptance.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c = Check()
act = "([a, ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390, 1280):
        ctx, pg, errs = page(browser, url + '#home', width=width)
        pg.click('text=Load a sample squad')
        pg.wait_for_timeout(180)
        # Original Oztag rules remain available.
        pg.evaluate(act, ['tab', {'tab':'rules'}])
        pg.wait_for_selector('#view .rules-head')
        txt = pg.locator('#view').inner_text()
        c.ok('Oztag' in txt and 'No built-in rule pack' not in txt,
             f'{width}: Oztag source rules remain intact')
        # No rule pack exists in this release for Touch. Never substitute Oztag by default.
        pg.evaluate("""() => {
          const team=window.__team.data.team;
          team.sport='Touch football'; team.rules='';
        }""")
        pg.evaluate(act, ['tab', {'tab':'rules'}])
        pg.wait_for_selector('#view .sport-rules-coverage')
        txt = pg.locator('#view').inner_text()
        c.ok('Touch football rules' in txt and 'No built-in rule pack is available' in txt,
             f'{width}: unsupported Touch rules are explicit')
        c.ok('Review team sport and rules' in txt,
             f'{width}: coach can review sport without unrelated choices')
        c.ok(pg.locator('#view .rules-head').count()==0,
             f'{width}: no Oztag or League rules masquerade as Touch')
        # Explicitly forcing another code's rule pack is flagged rather than certified.
        pg.evaluate("window.__team.data.team.rules='league/men'")
        pg.evaluate(act, ['tab', {'tab':'rules'}])
        pg.wait_for_selector('#view .sport-rules-mismatch')
        txt = pg.locator('#view .sport-rules-mismatch').inner_text()
        c.ok('Touch football' in txt and 'Rugby league' in txt and 'not verified' in txt,
             f'{width}: mismatch explains selected sport and rule source')
        c.ok(pg.locator('#view .rules-head').count()==0 and
             'At a glance' not in pg.locator('#view').inner_text(),
             f'{width}: mismatched gameplay and scoring values are not displayed')
        # Restore matching League context, ensure the warning is removed.
        pg.evaluate("""() => {
          const team=window.__team.data.team;
          team.sport='Rugby league'; team.rules='league/men';
        }""")
        pg.evaluate(act, ['tab', {'tab':'rules'}])
        pg.wait_for_selector('#view .rules-head')
        c.ok(pg.locator('#view .sport-rules-mismatch').count()==0,
             f'{width}: matching League pack does not warn')
        c.ok(pg.locator('#view .rules-head').inner_text().find('Rugby league')!=-1,
             f'{width}: matching League source remains visible')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
             f'{width}: rules display has no horizontal overflow')
        ctx.close()
    ok = c.done()
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
