# B4.12: phone Advanced Diagram artwork is lean but still touchable.
# Device-width/zoom tests run in synthetic Chromium, not physical iOS Safari.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]

def target(width):
    return 27 if width<=420 else 36 if width>=760 else 27+(width-420)*9/340

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,853,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.wait_for_selector('#ped-field svg.pf.editor')

        def measure():
            return pg.evaluate("""() => {
              const e=window.__team.state.ped, s=document.querySelector('#ped-field svg.pf.editor'),
                pl=s?.querySelector('[data-pl="LM"] .pl'),
                touch=s?.querySelector('[data-pl="LM"] .ped-actor-hit'),
                ink=s?.querySelector('path.mv:not(.mv-hit)'),
                lineHit=s?.querySelector('path.mv-hit'),
                k=s?.getBoundingClientRect().width/s.viewBox.baseVal.width,
                center=q=>{const b=q.getBoundingClientRect();return [(b.left+b.right)/2,(b.top+b.bottom)/2];},
                lm=s?.querySelector('[data-pl="LM"]'),rm=s?.querySelector('[data-pl="RM"]'),
                card=document.querySelector('#ped-field').closest('.ped-card');
              return {
                mode:e.zoomMode,zoom:e.zoom,boxWidth:document.querySelector('#ped-field').clientWidth,
                svgWidth:s?.getBoundingClientRect().width,
                diameter:pl?.getBoundingClientRect().width,
                touch:touch?.getBoundingClientRect().width,
                ink:parseFloat(getComputedStyle(ink).strokeWidth)*k,
                lineHit:parseFloat(getComputedStyle(lineHit).strokeWidth)*k,
                gap:Math.hypot(center(lm)[0]-center(rm)[0],center(lm)[1]-center(rm)[1]),
                source:e.draft.players.LM.slice(),
                art:Number(s.dataset.artScale),
                hit:Number(getComputedStyle(s).getPropertyValue('--ped-hit-scale')),
                stageWidth:card.clientWidth,
                overflow:document.documentElement.scrollWidth-innerWidth,
                fitted:s.getBoundingClientRect().width<=card.clientWidth+2 &&
                       s.getBoundingClientRect().height<=card.clientHeight+2
              };
            }""")

        fit=measure()
        checks.ok(fit['mode']=='fit' and fit['fitted'] and fit['overflow']<=2,
                  f'[{width}] Fit shows the full board without horizontal overflow: {fit!r}')
        checks.ok(fit['diameter']<=target(fit['boxWidth'])+2 and
                  fit['touch']>=40 and fit['lineHit']>=31,
                  f'[{width}] phone Fit remains lean but hit targets do not shrink: {fit!r}')

        pg.evaluate("""() => {
          const e=window.__team.state.ped; e.zoomMode='manual'; e.zoom=1.03;
        }""")
        pg.locator('[data-act=ped-zoom-in]').click()
        detailed1=measure()
        for _ in range(5):
            pg.locator('[data-act=ped-zoom-in]').click()
        detailed2=measure()
        for name,snap in [('118%',detailed1),('193%',detailed2)]:
            checks.ok(abs(snap['diameter']-target(snap['boxWidth']))<=2 and
                      42<=snap['touch']<=49 and 33<=snap['lineHit']<=39 and
                      snap['overflow']<=2,
                      f'[{width}] {name} art density and invisible hit targets: {snap!r}')
            checks.ok(snap['source']==fit['source'] and snap['stageWidth']==fit['stageWidth'],
                      f'[{width}] {name} zoom does not move stored coordinates or resize editor stage')
        checks.ok(detailed2['gap']>detailed1['gap']*1.4 and
                  abs(detailed2['diameter']-detailed1['diameter'])<=2,
                  f'[{width}] zoom adds tactical spacing, not fat icons')
        if detailed1['boxWidth']<=420:
            checks.ok(detailed1['diameter']<=30 and
                      detailed1['art']<detailed1['hit'] and
                      detailed1['ink']<=2.2,
                      f'[{width}] actual mobile editor artwork is smaller than hit geometry: {detailed1!r}')
        if detailed1['boxWidth']>=760:
            checks.ok(abs(detailed1['diameter']-36)<=2 and
                      abs(detailed1['art']-detailed1['hit'])<=.001,
                      f'[{width}] accepted desktop art remains unchanged')

        pg.locator('#ped-field svg [data-pl="LM"] .ped-actor-hit').click()
        checks.ok(pg.evaluate("window.__team.state.ped.sel?.id")=='LM' and
                  pg.locator('#ped-precision').is_visible(),
                  f'[{width}] larger invisible player hit circle remains selectable')

        # Rotation-sized resize must recalculate both density scales without
        # throwing the coach back to Fit or altering any drawn coordinates.
        pg.set_viewport_size({'width':width+160,'height':820})
        pg.wait_for_timeout(140)
        resized=measure()
        checks.ok(resized['mode']=='manual' and abs(resized['zoom']-1.93)<.01 and
                  abs(resized['diameter']-target(resized['boxWidth']))<=2 and
                  42<=resized['touch']<=49 and 33<=resized['lineHit']<=39 and
                  resized['source']==fit['source'],
                  f'[{width}] responsive manual zoom retains scale, touch target, and coordinates: {resized!r}')

        pg.locator('[data-act=ped-fit]').click()
        afterfit=measure()
        checks.ok(afterfit['mode']=='fit' and afterfit['fitted'] and
                  afterfit['diameter']<=target(afterfit['boxWidth'])+2,
                  f'[{width}] Fit still restores whole-field view after resizing')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(p=>p.id==='quickie-out'))""")==stored,
                  f'[{width}] zoom, pointer and resize never change saved Step Out on Cancel')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
