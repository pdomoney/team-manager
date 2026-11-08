# Option B B1: compact play catalogue without losing working team, navigation or saved play content.
# Chromium synthetic qualification only. Actual Safari/product-owner layout approval remains separate.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,853,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        original=pg.evaluate("""() => ({
          plays:JSON.stringify(window.__team.data.plays),
          team:window.__team.data.id,
          ids:window.__team.data.plays.map(p=>p.id)
        })""")
        pg.locator('.card-mode button').filter(has_text='Cards').click()
        row=pg.locator('.play-row[data-id=quickie-out]')
        checks.ok(row.count()==1 and 'Step Out' in row.inner_text(),
                  f'[{width}] Step Out keeps original identity and title in Cards mode')
        metrics=row.evaluate("""el=>{
          const thumb=el.querySelector('.play-thumb'),svg=thumb.querySelector('svg'),
                t=thumb.getBoundingClientRect(),r=el.getBoundingClientRect(),
                card=getComputedStyle(el),
                board=getComputedStyle(svg.querySelector('.pf-turf')).fill;
          return {previewW:t.width,previewH:t.height,cardW:r.width,cardH:r.height,
                  display:card.display,board,svgW:svg.getBoundingClientRect().width};
        }""")
        checks.ok(metrics['previewW']<=116 and metrics['previewH']<=112,
                  f'[{width}] tactical previews stay compact: {metrics!r}')
        checks.ok(metrics['cardH']<=195 and metrics['svgW']<=metrics['previewW']+1,
                  f'[{width}] card is readable but not a full-sized diagram: {metrics!r}')
        checks.ok(metrics['board']=='rgb(40, 50, 59)',
                  f'[{width}] dark playbook visual preserved')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),
                  f'[{width}] cards cause no horizontal viewport overflow')

        pg.locator('.card-mode button').filter(has_text='List').click()
        checks.ok(pg.locator('.plays-grid.view-list .play-row[data-id=quickie-out]').count()==1,
                  f'[{width}] existing List view still works')
        pg.locator('.card-mode button').filter(has_text='Cards').click()
        row.click()
        checks.ok(pg.locator('#play-fig .play-board-title').inner_text().find('Step Out')>=0,
                  f'[{width}] compact tile still opens full play viewer')
        pg.locator('[data-act=play-back]').click()
        after=pg.evaluate("""() => ({
          plays:JSON.stringify(window.__team.data.plays),
          team:window.__team.data.id,
          ids:window.__team.data.plays.map(p=>p.id)
        })""")
        checks.ok(original==after,
                  f'[{width}] catalogue controls and play viewer do not modify records or active team')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
