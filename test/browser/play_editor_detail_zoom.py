# B4.6: field magnification must give the coach more positional separation,
# not larger actors, notes and arrow strokes. Synthetic Chromium at phone/desktop
# widths; physical Safari owner acceptance remains independent.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390, 853, 1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        original=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.wait_for_selector('#ped-field svg.editor')
        # Choose exact controlled manual zoom levels by applying an ordinary
        # Zoom+ action; do not depend on the phone's initial Fit percentage.
        pg.evaluate("""() => {
          window.__team.state.ped.zoomMode='manual';
          window.__team.state.ped.zoom=1.26;
        }""")
        pg.locator('[data-act=ped-zoom-in]').click()
        def measure():
            return pg.evaluate("""() => {
              const svg=document.querySelector('#ped-field svg'),
                e=window.__team.state.ped,
                pl=svg.querySelector('[data-pl="LM"]'), body=pl.querySelector('circle.pl'),
                hit=pl.querySelector('circle.ped-actor-hit'),
                note=svg.querySelector('text.pf-note'),
                path=svg.querySelector('path.mv:not(.mv-hit)'),
                card=svg.closest('.ped-card'), z=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width,
                widthOf=el=>el.getBoundingClientRect().width;
              return {
                zoom:e.zoom, art:Number(svg.dataset.artScale),
                actor:widthOf(body), touch:widthOf(hit),
                font:parseFloat(getComputedStyle(note).fontSize)*z,
                line:parseFloat(getComputedStyle(path).strokeWidth)*z,
                marker:Number(svg.querySelector('marker').getAttribute('markerWidth')),
                data:[...e.draft.players.LM],
                scrollX:(card.scrollLeft+card.clientWidth/2)/Math.max(1,card.scrollWidth),
                scrollY:(card.scrollTop+card.clientHeight/2)/Math.max(1,card.scrollHeight),
                stage:[card.clientWidth,card.clientHeight],
                viewerOnly:svg.classList.contains('editor')
              };
            }""")
        small=measure()
        pg.locator('[data-act=ped-zoom-in]').click()
        pg.locator('[data-act=ped-zoom-in]').click()
        large=measure()
        checks.ok(abs(small['zoom']-1.41)<.02 and abs(large['zoom']-1.71)<.02,
                  f'[{width}] editor zoom controls reach screenshot comparison percentages')
        checks.ok(large['art']<small['art'] and
                  abs(large['art']*large['zoom']-1)<.005,
                  f'[{width}] symbols compensate for increased stage scale: {small!r} → {large!r}')
        checks.ok(large['data']==small['data'] and large['stage']==small['stage'],
                  f'[{width}] zoom never moves player coordinates or resizes the canvas')
        checks.ok(abs(small['actor']-large['actor'])<=3.0 and
                  abs(small['font']-large['font'])<=2.0 and
                  abs(small['line']-large['line'])<=1.2,
                  f'[{width}] player diameter, text and path ink stay near-constant on screen')
        checks.ok(large['touch']>=30 and small['touch']>=30,
                  f'[{width}] actor selection retains >=30px transparent touch target')
        checks.ok(large['marker']<small['marker'],
                  f'[{width}] path arrowheads counter-scale along with lines')
        checks.ok(abs(large['scrollX']-small['scrollX'])<=.1 and
                  abs(large['scrollY']-small['scrollY'])<=.1,
                  f'[{width}] zoom maintains approximate canvas focal centre')
        # Real click on the transparent SVG actor hit target still selects the
        # right player; touch-sized points are not the same as visual diameter.
        pg.locator('#ped-field svg [data-pl="LM"] .ped-actor-hit').click()
        checks.ok(pg.evaluate("window.__team.state.ped.sel?.id")=='LM' and
                  pg.locator('#ped-precision').is_visible(),
                  f'[{width}] reduced symbol still selects LM and precision tools')
        pg.locator('[data-act=ped-fit]').click()
        fitted=measure()
        pg.locator('[data-act=ped-fit]').click()
        fitted_again=measure()
        checks.ok(abs(fitted['zoom']-fitted_again['zoom'])<=.01 and
                  abs(fitted['actor']-fitted_again['actor'])<=2,
                  f'[{width}] repeated Fit does not jump or inflate symbols')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==original,
                  f'[{width}] zoom edits remain presentation-only, Step Out survives Cancel')
        # The reader's field retains its own unscaled SVG style and geometry.
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        reader=pg.locator('svg.pf:not(.editor)').first
        checks.ok(reader.count()==1 and
                  reader.get_attribute('data-art-scale') is None and
                  'scale(' not in (reader.locator('[data-pl="LM"]').first.get_attribute('transform') or ''),
                  f'[{width}] play viewer and thumbnails keep original unscaled symbols')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
