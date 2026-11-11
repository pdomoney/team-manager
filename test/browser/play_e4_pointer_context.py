# E4.12.2 synthetic touch/pen pointer streams through actual editor listeners.
# A second out-of-stage phase/tool/handle selection must cancel an old drag.
# Chromium emulation at two widths is NOT physical touch / macOS or iOS Safari.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=820,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped, d=E.draft;
          const first={moveId:'m-e4122-first',linkVersion:1,t:'run',
            actorLinks:{start:'player:LM'},
            pts:[[...d.players.LM],[d.players.LM[0]+2,d.players.LM[1]-4]]};
          d.moves.push(first);
          const second=JSON.parse(JSON.stringify(d));
          delete second.phases;
          second.moves=[{moveId:'m-e4122-second',linkVersion:1,t:'run',
            actorLinks:{start:'player:LM'},
            pts:[[...second.players.LM],[second.players.LM[0]+3,second.players.LM[1]-4]]}];
          d.phases=[second];E.sel={k:'mv',i:d.moves.length-1};E.selH=0;
          window.__e4122Source=JSON.stringify(d);
          window.__e4122PhaseOne=JSON.stringify(d.moves.at(-1));
          window.__e4122PhaseTwo=JSON.stringify(d.phases[0]);
          window.__e4122Stream=(selector,type='touch',id=61) => {
            const target=document.querySelector(selector),box=document.querySelector('#ped-field');
            if(!target || !box)throw Error('Missing pointer target '+selector);
            const r=target.getBoundingClientRect();
            const x=r.left+r.width/2,y=r.top+r.height/2;
            const fire=(el,event,px,py)=>el.dispatchEvent(new PointerEvent(event,{
              bubbles:true,pointerId:id,pointerType:type,button:0,
              buttons:event==='pointerdown'||event==='pointermove'?1:0,
              isPrimary:true,clientX:px,clientY:py
            }));
            window.__e4122Gesture={id,type,x,y,fire,box};
            fire(target,'pointerdown',x,y);
          };
          window.__e4122Move=(dx=45,dy=9) => {
            const g=window.__e4122Gesture;
            g.fire(g.box,'pointermove',g.x+dx,g.y+dy);
          };
          window.__e4122End=(event='pointerup',dx=45,dy=9) => {
            const g=window.__e4122Gesture;
            g.fire(g.box,event,g.x+dx,g.y+dy);
            window.__e4122Gesture=null;
          };
        }""")
        pg.locator('[data-act=ped-fit]').click()
        initial=pg.evaluate('window.__e4122Source')

        # Finger moves a V1 start handle; a second finger taps Phase 2 on
        # the toolbar outside the stage. Old pointer is never valid there.
        pg.evaluate("""() => window.__e4122Stream('#ped-field svg [data-h="0"].ped-handle-hit','touch',61)""")
        pg.evaluate("window.__e4122Move()")
        checks.ok(pg.evaluate("""() =>
          JSON.stringify(window.__team.state.ped.draft)!==window.__e4122Source
        """),f'[{width}] touch drag temporarily moves the selected V1 handle')
        pg.locator('[data-act=ped-phase][data-i="1"]').click()
        pg.evaluate("window.__e4122Move(57,13)")
        pg.evaluate("window.__e4122End()")
        checks.ok(pg.evaluate("""() => {
          const E=window.__team.state.ped;
          return E.phase===1 && E.tool==='select' && E.sel===null &&
            E.selH===null && JSON.stringify(E.draft)===window.__e4122Source &&
            E.undo.length===0 && E.stableViewport===null;
        }"""),f'[{width}] phase switch cancels touch drag with no orphan line or Undo')
        checks.ok(pg.evaluate("""() => JSON.stringify(
          window.__team.state.ped.draft.phases[0])===window.__e4122PhaseTwo
        """),f'[{width}] phase 2 actor labels do not inherit phase 1 handle edits')

        # Pen gesture in Phase 2 still completes, and explicitly attached
        # phase-local run origin follows its own actor under manual zoom.
        pg.locator('[data-act=ped-zoom-in]').click()
        z=pg.evaluate('window.__team.state.ped.zoom')
        before=pg.evaluate("""() => {
          const ph=window.__team.state.ped.draft.phases[0];
          return {pl:[...ph.players.LM],start:[...ph.moves[0].pts[0]],
            first:JSON.stringify(window.__team.state.ped.draft.moves.at(-1))};
        }""")
        pg.evaluate("""() => window.__e4122Stream('#ped-field svg [data-pl="LM"]','pen',62)""")
        pg.evaluate("window.__e4122Move()")
        pg.evaluate("window.__e4122End()")
        after=pg.evaluate("""() => {
          const E=window.__team.state.ped,ph=E.draft.phases[0];
          return {pl:[...ph.players.LM],start:[...ph.moves[0].pts[0]],
            first:JSON.stringify(E.draft.moves.at(-1)),
            link:ph.moves[0].actorLinks.start,zoom:E.zoom,dirty:E.dirty};
        }""")
        checks.ok(after['pl']!=before['pl'] and after['start']==after['pl'] and
                  after['first']==before['first'] and after['link']=='player:LM' and
                  after['zoom']==z and after['dirty'],
                  f'[{width}] pen moves only linked Phase 2 actor/path, preserves manual zoom')
        pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(
          window.__team.state.ped.draft)===window.__e4122Source
        """),f'[{width}] Undo restores exact V1 geometry after completed pen drag')

        # A pen starts a second drag, then the operator chooses Pan board.
        # Release must never resume old Select drag or create a phantom edit.
        pg.evaluate("""() => window.__e4122Stream('#ped-field svg [data-pl="LM"]','pen',63)""")
        pg.evaluate("window.__e4122Move()")
        pg.locator('[data-act=ped-tool][data-t=pan]').click()
        pg.evaluate("window.__e4122End()")
        checks.ok(pg.evaluate("""() => {
          const E=window.__team.state.ped;
          return E.tool==='pan' && E.sel===null && E.selH===null &&
            E.undo.length===0 && JSON.stringify(E.draft)===window.__e4122Source;
        }"""),f'[{width}] tool switch cancels incomplete pen drag and retains Pan mode')

        # A selected V1 handle switched to a different handle by precision
        # controls is not permission to apply an old finger's movement to it.
        pg.locator('[data-act=ped-tool][data-t=select]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped;
          E.sel={k:'mv',i:0};E.selH=0;
        }""")
        pg.locator('[data-act=ped-fit]').click()
        pg.evaluate("""() => window.__e4122Stream('#ped-field svg [data-h="0"].ped-handle-hit','touch',64)""")
        pg.evaluate("window.__e4122Move()")
        pg.locator('#ped-precision [data-act=ped-precision-handle][data-j="1"]').click()
        pg.evaluate("window.__e4122End()")
        checks.ok(pg.evaluate("""() => {
          const E=window.__team.state.ped;
          return E.phase===1 && E.tool==='select' && E.sel===null &&
            E.selH===null && E.undo.length===0 &&
            JSON.stringify(E.draft)===window.__e4122Source;
        }"""),f'[{width}] handle switch aborts stale touch pointer, no cross-handle edit')

        # Gesture handler remains usable after cancellation, not locked out.
        pg.evaluate("""() => window.__e4122Stream('#ped-field svg [data-pl="LM"]','touch',65)""")
        pg.evaluate("window.__e4122Move()")
        pg.evaluate("window.__e4122End()")
        checks.ok(pg.evaluate("""() =>
          JSON.stringify(window.__team.state.ped.draft)!==window.__e4122Source &&
          window.__team.state.ped.undo.length===1
        """),f'[{width}] touch editing resumes after canceled phase/tool/handle gestures')
        pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("""() =>
          JSON.stringify(window.__team.state.ped.draft)===window.__e4122Source
        """),f'[{width}] Undo after recovery preserves the original synthetic graph')
        checks.ok(pg.evaluate("""() =>
          JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))
        """)==stored,f'[{width}] no unsaved pointer gesture changed the stored Oztag play')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() =>
          JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))
        """)==stored,f'[{width}] Cancel retains stored Step Out play bytes')
        pg.evaluate("""() => {
          const b=document.createElement('button');
          b.dataset.act='preview-on';document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=play-edit],#ped-precision').count()==0,
                  f'[{width}] player preview cannot invoke coach pointer editor')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
