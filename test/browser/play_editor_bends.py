# B4.3 synthetic Chromium: movement bends must be adjustable without
# expanding Properties or committing the stored Step Out play until Save.
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

        # Dispatch the actual pointer selection handlers on a real Step Out
        # SVG movement. Physical hit target/touchscreen geometry remains a Safari gate.
        pg.evaluate("""() => {
          const path=document.querySelector('#ped-field svg path.mv-hit');
          if (!path) throw new Error('Step Out movement path unavailable');
          const center=path.getPointAtLength(path.getTotalLength()/2);
          const client=new DOMPoint(center.x,center.y).matrixTransform(path.getScreenCTM());
          path.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles:true, clientX:client.x,clientY:client.y,button:0,pointerId:31
          }));
          document.querySelector('#ped-field').dispatchEvent(new PointerEvent('pointerup', {
            bubbles:true,clientX:client.x,clientY:client.y,button:0,pointerId:31
          }));
        }""")
        checks.ok(pg.evaluate("window.__team.state.ped.sel?.k")== 'mv',
                  f'[{width}] selecting Step Out movement opens precision controls')
        checks.ok(pg.locator('#ped-precision [data-act=ped-precision-handle]').count()>=2,
                  f'[{width}] start/end movement points are available')
        checks.ok(pg.locator('#ped-precision [data-act=ped-precision-add-bend]').is_disabled(),
                  f'[{width}] cannot insert an implied bend before choosing a point')

        baseline=pg.evaluate("""() => {
          const e=window.__team.state.ped;
          return JSON.stringify(e.draft.moves[e.sel.i]);
        }""")
        fitted=pg.evaluate("""() => {
          const c=document.querySelector('.ped-main .ped-card').getBoundingClientRect();
          return [c.width,c.height];
        }""")
        pg.locator('#ped-precision [data-act=ped-precision-handle][data-j="0"]').click()
        checks.ok(pg.locator('#ped-precision [data-act=ped-precision-remove-bend]').is_disabled(),
                  f'[{width}] Start is never removable as a bend')
        checks.ok(pg.locator('#ped-precision [data-act=ped-precision-add-bend]').is_enabled(),
                  f'[{width}] explicit Start enables a midpoint insert')
        pg.locator('#ped-precision [data-act=ped-precision-add-bend]').click()
        added=pg.evaluate("""() => {
          const e=window.__team.state.ped,m=e.draft.moves[e.sel.i];
          return {index:e.selH,points:m.pts.length,move:JSON.stringify(m)};
        }""")
        checks.ok(added['index']==1 and
                  pg.locator('#ped-precision [data-act=ped-precision-handle]').count()>=3,
                  f'[{width}] midpoint added and selected as Bend 1')
        checks.ok(pg.locator('#ped-precision [data-act=ped-precision-handle][data-j="1"]').inner_text().strip()=='Bend 1',
                  f'[{width}] intermediate bend is explicitly labelled and selectable')
        point_before=pg.evaluate("""() => {
          const e=window.__team.state.ped; return [...e.draft.moves[e.sel.i].pts[e.selH]];
        }""")
        pg.locator('#ped-precision [data-act=ped-precision-nudge][data-dx="1"]').click()
        point_after=pg.evaluate("""() => {
          const e=window.__team.state.ped; return [...e.draft.moves[e.sel.i].pts[e.selH]];
        }""")
        checks.ok(round(point_after[0]-point_before[0],1)==0.5 and
                  point_after[1]==point_before[1],
                  f'[{width}] selected bend nudges by half-unit without grabbing an actor')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==original,
                  f'[{width}] bend edit leaves committed play untouched')

        pg.locator('#ped-precision [data-act=ped-precision-remove-bend]').click()
        after_remove=pg.evaluate("""() => {
          const e=window.__team.state.ped; return JSON.stringify(e.draft.moves[e.sel.i]);
        }""")
        checks.ok(after_remove==baseline,
                  f'[{width}] removing newly inserted bend restores original path and links')
        # One snapshot per operation, including additive and removal steps.
        for _ in range(3):
            pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("window.__team.state.ped.dirty") is False,
                  f'[{width}] three undos clear unsaved-change state')
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft.moves[window.__team.state.ped.sel.i])""")==baseline,
                  f'[{width}] undo roundtrip preserves exact movement')
        after=pg.evaluate("""() => {
          const c=document.querySelector('.ped-main .ped-card').getBoundingClientRect();
          return [c.width,c.height];
        }""")
        checks.ok(all(abs(a-b)<=4 for a,b in zip(fitted,after)),
                  f'[{width}] precision bend operations leave fitted canvas dimensions stable')
        if width==390:
            checks.ok(pg.locator('#ped-properties').is_hidden(),
                      'phone: bend controls work while Properties is collapsed')
            pg.evaluate("""() => {
              const bar=document.querySelector('#ped-precision');
              window.__b4Height=bar.getBoundingClientRect().height;
            }""")
            checks.ok(pg.evaluate("window.__b4Height")<=195,
                      'phone: floating precision palette leaves field visible')

        pg.evaluate("""() => {
          window.__unexpectedCancelPrompt=0;
          window.confirm=() => { window.__unexpectedCancelPrompt++; return false; };
        }""")
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("window.__unexpectedCancelPrompt")==0 and
                  pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==original,
                  f'[{width}] cancel after undo never writes Step Out or asks to discard changes')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
