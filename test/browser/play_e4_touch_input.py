# E4.12.4: browser-generated touch taps on actual SVG endpoint hit areas,
# plus a keyboard fallback, in Chromium and Linux WebKit.
# This DOES NOT simulate a physical finger/stylus, iOS Safari or VoiceOver.
import os
import sys
from harness import *
from playwright.sync_api import sync_playwright

engine = os.environ.get('E412_GESTURE_ENGINE', 'chromium').lower()
if engine not in ('chromium', 'webkit'):
    raise SystemExit('Unsupported E412_GESTURE_ENGINE: ' + engine)

build()
srv, url = serve()
checks, errors = Check(), []

def touchscreen_tap(pg, locator):
    locator.scroll_into_view_if_needed()
    bounds = locator.bounding_box()
    if bounds is None:
        raise RuntimeError('Touch endpoint has no visible bounds')
    pg.touchscreen.tap(bounds['x'] + bounds['width'] / 2,
                       bounds['y'] + bounds['height'] / 2)

with sync_playwright() as p:
    browser = getattr(p, engine).launch()
    for width in (390, 1280):
        ctx = browser.new_context(
            viewport={'width': width, 'height': 844},
            has_touch=True, is_mobile=(width == 390))
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        pg.on('console', lambda m: errors.append('console.error: ' + m.text)
              if m.type == 'error' else None)
        pg.on('dialog', lambda d: d.accept())
        pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        pg.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        ctx.route('https://wa.me/**', lambda r: r.fulfill(body='whatsapp'))
        ctx.route('https://api.whatsapp.com/**', lambda r: r.fulfill(body='whatsapp'))
        pg.goto(url + '#home')
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url + '#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored = pg.evaluate("""() => JSON.stringify(
            window.__team.data.plays.find(x => x.id === 'quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          const lm=d.players.LM,rm=d.players.RM;
          d.moves.push({t:'run',linkVersion:1,moveId:'m-e4124-touch',
            actorLinks:{start:'player:LM',end:'player:RM'},
            pts:[[...lm],[(lm[0]+rm[0])/2,lm[1]-3],[...rm]]});
          E.sel={k:'mv',i:d.moves.length-1}; E.selH=null;
          E.initialDraft=JSON.stringify(d);E.dirty=false;
          window.__e4124Initial=JSON.stringify(d);
        }""")

        checks.ok(pg.evaluate("""() =>
            getComputedStyle(document.querySelector('#ped-field')).touchAction === 'none'
          """), f'[{engine}/{width}] stage owns touch without page-scrolling')

        for mode in ('fit','manual'):
            if mode == 'fit':
                pg.locator('[data-act=ped-fit]').click()
            else:
                pg.evaluate("""() => {
                  const E=window.__team.state.ped;
                  E.zoomMode='manual';E.zoom=1.78;
                }""")
                pg.locator('[data-act=ped-zoom-in]').click()
            snapshot = pg.evaluate("""() => ({
              phase:window.__team.state.ped.phase,
              draft:JSON.stringify(window.__team.state.ped.draft),
              zoom:window.__team.state.ped.zoom
            })""")
            checks.ok(snapshot['draft'] == pg.evaluate('window.__e4124Initial') and
                      pg.evaluate('window.__team.state.ped.undo.length') == 0,
                      f'[{engine}/{width}/{mode}] starting point is an unchanged tactical draft')
            start = pg.locator('#ped-field svg circle.ped-handle-hit[data-h="0"]')
            touchscreen_tap(pg, start)
            tapped = pg.evaluate("""() => {
              const E=window.__team.state.ped,m=E.draft.moves.at(-1);
              return {selection:E.sel?.k,handle:E.selH,
                draft:JSON.stringify(E.draft),undo:E.undo.length,dirty:E.dirty,
                links:JSON.stringify(m.actorLinks),
                phase:E.phase};
            }""")
            checks.ok(tapped['selection'] == 'mv' and tapped['handle'] == 0 and
                      tapped['draft'] == snapshot['draft'] and tapped['undo'] == 0 and
                      tapped['dirty'] is False and tapped['phase'] == snapshot['phase'] and
                      tapped['links'] == '{"start":"player:LM","end":"player:RM"}',
                      f'[{engine}/{width}/{mode}] browser-generated touch selects Start without moving or unlinking: {tapped!r}')

            end = pg.locator('#ped-field svg circle.ped-handle-hit[data-h="2"]')
            touchscreen_tap(pg, end)
            checks.ok(pg.evaluate("""() => {
              const E=window.__team.state.ped;
              return E.sel?.k==='mv' && E.selH===2 &&
                E.undo.length===0 && !E.dirty &&
                JSON.stringify(E.draft)===window.__e4124Initial;
            }"""), f'[{engine}/{width}/{mode}] touch switches to End without phantom edit')

            # Keyboard nudge remains an accessible fallback when a precise
            # finger move is difficult; Undo must restore the actual V1 links.
            pg.locator('#ped-field').focus()
            pg.keyboard.press('ArrowRight')
            changed = pg.evaluate("""() => {
              const E=window.__team.state.ped,m=E.draft.moves.at(-1);
              return {draft:JSON.stringify(E.draft),undo:E.undo.length,
                start:m.actorLinks.start,phase:E.phase,zoom:E.zoom};
            }""")
            checks.ok(changed['draft'] != snapshot['draft'] and changed['undo'] == 1 and
                      changed['start'] == 'player:LM' and
                      changed['phase'] == snapshot['phase'] and
                      abs(changed['zoom'] - snapshot['zoom']) < 0.01,
                      f'[{engine}/{width}/{mode}] arrow key edits only selected endpoint without losing Start')
            pg.locator('[data-act=ped-undo]').click()
            checks.ok(pg.evaluate("""() => {
              const E=window.__team.state.ped;
              return E.undo.length===0 && !E.dirty &&
                JSON.stringify(E.draft)===window.__e4124Initial;
            }"""), f'[{engine}/{width}/{mode}] Undo restores unchanged V1 links, geometry and dirty state')

        checks.ok(pg.evaluate("""() => JSON.stringify(
            window.__team.data.plays.find(x=>x.id==='quickie-out'))""") == stored,
            f'[{engine}/{width}] touch tests do not save the real Step Out play')
        checks.ok(pg.evaluate(
            'document.documentElement.scrollWidth - innerWidth') <= 2,
            f'[{engine}/{width}] touch-enabled editor does not overflow the viewport')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(
            window.__team.data.plays.find(x=>x.id==='quickie-out'))""") == stored,
            f'[{engine}/{width}] Cancel leaves original Step Out unchanged')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=play-edit], #ped-field').count() == 0,
                  f'[{engine}/{width}] player preview remains read-only')
        ctx.close()
    result = checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if result else 1)
