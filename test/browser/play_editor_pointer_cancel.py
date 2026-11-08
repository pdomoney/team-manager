# B4.4 synthetic Chromium regression for interrupted mouse/touch/pen stage edits.
# Real iPhone Safari gesture and hit-target acceptance remains separate.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390, 1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()

        # Dispatch a pointer stream through the actual editor event handlers,
        # with a new target for each gesture because SVG redraws on select.
        pg.evaluate("""() => {
          window.__b4Pointer = (selector, outcome='pointercancel', dx=42, dy=12, id=51) => {
            const target=document.querySelector(selector), box=document.querySelector('#ped-field');
            if (!target || !box) throw new Error('No editor pointer target: '+selector);
            const r=target.getBoundingClientRect();
            const x=r.left+r.width/2, y=r.top+r.height/2;
            const fire=(el,type,pid,px,py) => el.dispatchEvent(new PointerEvent(type, {
              bubbles:true, pointerId:pid, pointerType:'touch', isPrimary:true,
              button:0, buttons:type==='pointerdown'||type==='pointermove'?1:0,
              clientX:px, clientY:py
            }));
            fire(target,'pointerdown',id,x,y);
            fire(box,'pointermove',id,x+dx,y+dy);
            fire(box,outcome,id,x+dx,y+dy);
          };
        }""")
        checks.ok(pg.evaluate("""() => getComputedStyle(document.querySelector('#ped-field')).touchAction""")=='none',
                  f'[{width}] editor touch gestures are owned by stage, with Pan board available')
        initial=pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")

        pg.locator('#ped-tools [data-t=pass]').click()
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg [data-pl="LM"]')""")
        canceled=pg.evaluate("""() => {
          const e=window.__team.state.ped;
          return {draft:JSON.stringify(e.draft),undo:e.undo.length,dirty:e.dirty,
            drawing:e.drawing,locked:e.lockView};
        }""")
        checks.ok(canceled['draft']==initial and canceled['undo']==0 and
                  canceled['dirty'] is False and canceled['drawing'] is None and
                  canceled['locked'] is None,
                  f'[{width}] canceled pass stroke is not authored and makes no phantom Undo')

        pg.locator('#ped-tools [data-t=select]').click()
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg [data-pl="LM"]', 'pointercancel', 42, 12, 52)""")
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")==initial and
                  pg.evaluate("window.__team.state.ped.undo.length")==0,
                  f'[{width}] canceled actor drag restores all linked geometry and clean history')

        # A true release still applies edits; a second canceled drag must not
        # discard the completed action that precedes it.
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg [data-pl="LM"]', 'pointerup', 42, 12, 53)""")
        moved=pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")
        checks.ok(moved!=initial and pg.evaluate("window.__team.state.ped.undo.length")==1,
                  f'[{width}] completed single-pointer actor move still works')
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg [data-pl="LM"]', 'pointercancel', 42, 12, 54)""")
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")==moved and
                  pg.evaluate("window.__team.state.ped.undo.length")==1,
                  f'[{width}] canceled second move retains earlier edit and Undo history')
        pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")==initial and
                  pg.evaluate("window.__team.state.ped.dirty") is False,
                  f'[{width}] Undo after a canceled gesture restores original Step Out')

        # Moving with finger 1 and adding finger 2 must discard the first edit,
        # ignoring both fingers until all touches are released.
        pg.evaluate("""() => {
          const box=document.querySelector('#ped-field');
          const at = sel => {
            const r=document.querySelector(sel).getBoundingClientRect();
            return [r.left+r.width/2,r.top+r.height/2];
          };
          const fire=(el,type,id,x,y) => el.dispatchEvent(new PointerEvent(type,{
            bubbles:true,pointerId:id,pointerType:'touch',button:0,
            clientX:x,clientY:y
          }));
          const a=at('#ped-field svg [data-pl="LM"]');
          fire(document.querySelector('#ped-field svg [data-pl="LM"]'),'pointerdown',71,...a);
          fire(box,'pointermove',71,a[0]+42,a[1]+12);
          const b=at('#ped-field svg [data-pl="RM"]');
          fire(document.querySelector('#ped-field svg [data-pl="RM"]'),'pointerdown',72,...b);
          fire(box,'pointermove',71,a[0]+70,a[1]+20);
          fire(box,'pointerup',71,a[0]+70,a[1]+20);
          fire(box,'pointerup',72,...b);
        }""")
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")==initial and
                  pg.evaluate("window.__team.state.ped.undo.length")==0,
                  f'[{width}] second finger cannot take over a touch drag')
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg [data-pl="LM"]', 'pointerup', 42, 12, 73)""")
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")!=initial,
                  f'[{width}] stage editing recovers after multi-pointer release')
        pg.locator('[data-act=ped-undo]').click()

        pg.locator('[data-act=ped-phase-add]').click()
        prior_phase=pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg', 'pointercancel', 0, 0, 81)""")
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")==prior_phase and
                  pg.evaluate("window.__team.state.ped.placing") is True,
                  f'[{width}] canceled add-phase tap does not commit a new phase')
        pg.evaluate("""() => window.__b4Pointer('#ped-field svg', 'pointerup', 0, 0, 82)""")
        checks.ok(pg.evaluate("window.__team.state.ped.draft.phases.length")==1,
                  f'[{width}] completed add-phase tap still works')
        pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.state.ped.draft)""")==initial,
                  f'[{width}] new phase remains undoable without stored-play changes')

        checks.ok(pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")==stored,
                  f'[{width}] no pointer experiment writes to saved Step Out')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
