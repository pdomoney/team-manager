# Coach-only cross-code translation and typography, mobile and desktop.
# All data synthetic and contained in browser test mode.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in (390,1280):
        ctx, pg, _ = page(browser, url + '#home', width=width, height=860, errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url + '#plays')
        checks.ok(pg.locator('[data-act="psets"]').count() == 0,
                  f'[{width}] no unrelated role-label management on Plays listing')
        pg.locator('.play-row[data-id="quickie-out"]').click()
        baseline=pg.evaluate("""() => {
          const x=window.__team.data.plays.find(p=>p.id==='quickie-out');
          return JSON.stringify({moves:x.moves,players:x.players,defence:x.defence,steps:x.steps});
        }""")
        pg.locator('[data-act=play-transfer]').click()
        checks.ok(pg.locator('#sheet [name=source]').input_value() == 'Oztag',
                  f'[{width}] legacy source sport is explicit, changeable Oztag default')
        pg.locator('#sheet [name=target]').select_option('Touch football')
        pg.locator('#sheet form[data-form=transfer-choose] button[type=submit]').click()
        checks.ok('Passing sequence' in pg.locator('#sheet').inner_text()
                  and 'Running and support lines' in pg.locator('#sheet').inner_text(),
                  f'[{width}] actual movement mechanics from source play are identified')
        checks.ok('six-a-side' in pg.locator('#sheet').inner_text()
                  and 'not automatically' in pg.locator('#sheet').inner_text().lower(),
                  f'[{width}] touch formation and rules differences made explicit')
        pg.locator('#sheet [name=notes]').fill('Retain draw and pass; rehearse touch rollball timing.')
        pg.locator('#sheet form[data-form=transfer-notes] button[type=submit]').click()
        saved = pg.evaluate("""() => {
          const x=window.__team.data.plays.find(p=>p.id==='quickie-out');
          return {notes:x.transferNotes, shape:JSON.stringify({moves:x.moves,players:x.players,defence:x.defence,steps:x.steps})};
        }""")
        checks.ok(saved['notes'].get('Oztag → Touch football','').startswith('Retain draw and pass'),
                  f'[{width}] reviewed adaptation note persists against this sport pairing')
        checks.ok(saved['shape']==baseline,
                  f'[{width}] source drawing, movements and coaching steps unchanged by adaptation')
        pg.locator('#sheet [data-act=transfer-change]').click()
        checks.ok(pg.locator('#sheet [name=target]').input_value()=='Touch football',
                  f'[{width}] edit flow keeps previous source and target selections')
        pg.locator('#sheet [name=target]').select_option('Rugby union')
        pg.locator('#sheet form[data-form=transfer-choose] button[type=submit]').click()
        checks.ok('breakdown' in pg.locator('#sheet').inner_text().lower(),
                  f'[{width}] rugby union is a different breakdown rather than a league restart')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        pg.locator('[data-act=play-edit]').click()
        pg.locator('#sheet [data-act=ped-tab][data-tab=diagram]').click()
        checks.ok(pg.locator('.ped-list').is_visible()
                  and 'role labels' in pg.locator('.ped-list').inner_text().lower(),
                  f'[{width}] optional diagram role labels live in advanced editor')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        pg.evaluate("""() => {window.__team.state.playMode='learn';}""")
        pg.evaluate("([a, ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}", ['preview-on', {}])
        checks.ok(pg.locator('[data-act=play-transfer]').count()==0 and
                  'Retain draw and pass; rehearse touch' not in pg.inner_text('#view'),
                  f'[{width}] private coach notes and adaptation actions omitted from player view')
        style=pg.evaluate("""() => {
          const title=document.querySelector('#view .sec-h h2');
          const css=getComputedStyle(title);
          return { weight:css.fontWeight, family:css.fontFamily, scroll:document.documentElement.scrollWidth, width:innerWidth };
        }""")
        checks.ok(style['weight']=='600' and 'Barlow' in style['family'],
                  f'[{width}] reduced heading weight and non-condensed display font')
        checks.ok(style['scroll']<=style['width'],
                  f'[{width}] adapted play remains within viewport')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
