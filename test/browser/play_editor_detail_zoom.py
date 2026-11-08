# B4.7: editor zoom uses actual CSS canvas pixels for symbols/annotations.
# Owner showed unusable 61%-Fit art, with usable symbols only near 193%.
# Synthetic Chromium validates Fit FIRST, then 118/193 and 141/171 detail.
# Read-only Learn/Watch, saved Step Out and real Safari remain distinct gates.
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
        # Read-only viewer is not an editor, and must never inherit inverse art scale.
        viewer=pg.locator('#play-fig svg.pf:not(.editor)').first
        checks.ok(viewer.count()==1 and viewer.get_attribute('data-art-scale') is None and
                  'scale(' not in (viewer.locator('[data-pl="LM"]').first.get_attribute('transform') or ''),
                  f'[{width}] original player-facing play retains full-size artwork')
        pg.locator('[data-act=play-edit]').click()
        pg.wait_for_selector('#ped-field svg.editor')

        def measure():
            return pg.evaluate("""() => {
              const svg=document.querySelector('#ped-field svg'), e=window.__team.state.ped,
                lm=svg.querySelector('[data-pl="LM"]'),
                rm=svg.querySelector('[data-pl="RM"]'),
                body=lm.querySelector('.pl'), touch=lm.querySelector('.ped-actor-hit'),
                note=svg.querySelector('text.pf-note'), path=svg.querySelector('path.mv:not(.mv-hit)'),
                box=document.querySelector('#ped-field'), card=svg.closest('.ped-card'),
                k=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width,
                rect=x=>x.getBoundingClientRect(),
                centre=x=>{const r=rect(x);return [(r.left+r.right)/2,(r.top+r.bottom)/2]};
              return {
                zoom:e.zoom, mode:e.zoomMode, art:Number(svg.dataset.artScale),
                actor:rect(body).width, touch:rect(touch).width,
                note:parseFloat(getComputedStyle(note).fontSize)*k,
                line:parseFloat(getComputedStyle(path).strokeWidth)*k,
                gap:Math.hypot(centre(lm)[0]-centre(rm)[0],centre(lm)[1]-centre(rm)[1]),
                marker:Number(svg.querySelector('marker').getAttribute('markerWidth')),
                boxWidth:box.clientWidth, svgWidth:rect(svg).width,
                stage:[card.clientWidth,card.clientHeight],
                saved:[...e.draft.players.LM],
                scrollX:(card.scrollLeft+card.clientWidth/2)/Math.max(1,card.scrollWidth),
                scrollY:(card.scrollTop+card.clientHeight/2)/Math.max(1,card.scrollHeight),
                fitted:rect(svg).width<=card.clientWidth+2 && rect(svg).height<=card.clientHeight+2
              };
            }""")
        fit=measure()
        checks.ok(fit['mode']=='fit' and fit['fitted'],
                  f'[{width}] Fit starts by showing the editing field within the stage: {fit!r}')
        checks.ok(29<=fit['actor']<=42 and 40<=fit['touch']<=54 and 10<=fit['note']<=22,
                  f'[{width}] icons/notes are usable at Fit without first zooming to 200%: {fit!r}')

        # Normal zoom buttons still magnify field geometry and preserve centre.
        # A programmed starting value makes this deterministic across viewport sizes.
        pg.evaluate("""() => {const e=window.__team.state.ped; e.zoomMode='manual';e.zoom=1.03;}""")
        pg.locator('[data-act=ped-zoom-in]').click()
        medium=measure()
        for _ in range(5):
            pg.locator('[data-act=ped-zoom-in]').click()
        detailed=measure()
        checks.ok(abs(medium['zoom']-1.18)<.01 and abs(detailed['zoom']-1.93)<.01,
                  f'[{width}] 118% and 193% fine positioning remain available')
        checks.ok(detailed['gap']>medium['gap']*1.4 and detailed['gap']>fit['gap'],
                  f'[{width}] field geometry gains space between positions when zoomed')
        for label, snap in [('118%',medium),('193%',detailed)]:
            checks.ok(29<=snap['actor']<=42 and 40<=snap['touch']<=54 and 10<=snap['note']<=22,
                      f'[{width}] at {label}, symbols remain compact and touchable: {snap!r}')
            checks.ok(snap['saved']==fit['saved'] and snap['stage']==fit['stage'],
                      f'[{width}] {label} zoom never mutates coordinates or stage size')
        checks.ok(abs(fit['actor']-medium['actor'])<=3 and
                  abs(medium['actor']-detailed['actor'])<=3 and
                  abs(medium['line']-detailed['line'])<=1.5 and
                  abs(medium['note']-detailed['note'])<=2,
                  f'[{width}] symbols, ink and notes hold their visual size from Fit to 193%')
        checks.ok(detailed['marker']<medium['marker'],
                  f'[{width}] arrowheads compensate rather than filling the zoomed canvas')
        checks.ok(abs(detailed['scrollX']-medium['scrollX'])<=.1 and
                  abs(detailed['scrollY']-medium['scrollY'])<=.1,
                  f'[{width}] zoom preserves focal position, not a top-left jump')

        # The real transparent player hit target remains clickable at 193%.
        pg.locator('#ped-field svg [data-pl="LM"] .ped-actor-hit').click()
        checks.ok(pg.evaluate("window.__team.state.ped.sel?.id")=='LM' and
                  pg.locator('#ped-precision').is_visible(),
                  f'[{width}] small visible icon retains a usable selection target')

        # Fit remains deterministic after selecting a player.
        pg.locator('[data-act=ped-fit]').click()
        fitted=measure()
        pg.locator('[data-act=ped-fit]').click()
        fittedAgain=measure()
        checks.ok(abs(fitted['zoom']-fittedAgain['zoom'])<=.01 and
                  abs(fitted['actor']-fittedAgain['actor'])<=2 and fittedAgain['fitted'],
                  f'[{width}] repeated Fit restores compact art without a viewport jump')

        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==original,
                  f'[{width}] display changes never modify committed Step Out on Cancel')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
