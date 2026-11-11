# E4.12.3: actual editor pointer events at Fit and manual zoom.
# Synthetic Chromium touch, pen and mouse; not a physical Safari/stylus claim.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=850,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        stored=pg.evaluate("""() => JSON.stringify(window.__team.data.plays.find(x=>x.id==='quickie-out'))""")
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          d.moves.push({t:'run',moveId:'m-e4123-gesture',linkVersion:1,
            actorLinks:{start:'player:LM',end:'player:RM'},
            pts:[[...d.players.LM],[...d.players.RM]]});
          const other=JSON.parse(JSON.stringify(d));
          delete other.phases;
          d.phases=[{...other,moves:[{t:'run',pts:[[19,48],[22,44]],curve:true}]}];
          E.sel={k:'mv',i:d.moves.length-1};
          E.selH=null;E.initialDraft=JSON.stringify(d);E.dirty=false;
          window.__e4123Original=JSON.stringify(d);
          window.__e4123Linked=JSON.stringify(d.moves.at(-1));
          window.__e4123Other=JSON.stringify(d.phases[0]);
          window.__e4123Pointer=(selector,type,offset,id) => {
            const el=document.querySelector(selector),box=document.querySelector('#ped-field');
            if(!el||!box)throw Error('No pointer target '+selector);
            const rect=el.getBoundingClientRect(),
              x=rect.left+rect.width/2,y=rect.top+rect.height/2;
            const send=(node,name,dx=0) => node.dispatchEvent(new PointerEvent(name,{
              bubbles:true,pointerId:id,pointerType:type,isPrimary:true,button:0,
              buttons:name==='pointerup'?0:1,clientX:x+dx,clientY:y
            }));
            send(el,'pointerdown');
            send(box,'pointermove',offset);
            send(box,'pointerup',offset);
          };
        }""")
        moveSelector='#ped-field svg .mv-hit[data-mv]'
        for mode in ('fit','manual'):
            if mode=='fit':
                pg.locator('[data-act=ped-fit]').click()
            else:
                pg.evaluate("""() => { const e=window.__team.state.ped;
                  e.zoomMode='manual'; e.zoom=1.78; }""")
                pg.locator('[data-act=ped-zoom-in]').click()
            zoom=pg.evaluate('window.__team.state.ped.zoom')
            checks.ok(pg.evaluate('window.__team.state.ped.snapEnabled') is True,
                      f'[{width}/{mode}] existing Snap-On default remains in effect')
            initial=pg.evaluate('window.__e4123Original')
            for kind, small, large in (('touch',6,20),('pen',4,14),('mouse',2,12)):
                selector=moveSelector+'[data-mv="'+str(pg.evaluate(
                    'window.__team.state.ped.draft.moves.length-1'))+'"]'
                pg.evaluate("""([sel,typ,delta,id]) =>
                  window.__e4123Pointer(sel,typ,delta,id)""",
                  [selector,kind,small,90])
                unchanged=pg.evaluate("""() => {
                  const E=window.__team.state.ped;
                  return {raw:JSON.stringify(E.draft),
                    selected:E.sel?.k==='mv',undo:E.undo.length,
                    dirty:E.dirty,link:JSON.stringify(E.draft.moves.at(-1))};
                }""")
                checks.ok(unchanged['raw']==initial and unchanged['selected'] and
                          unchanged['undo']==0 and unchanged['dirty'] is False and
                          unchanged['link']==pg.evaluate('window.__e4123Linked'),
                          f'[{width}/{mode}/{kind}] small pointer wobble selects V1 line, does not detach')
                pg.evaluate("""([sel,typ,delta,id]) =>
                  window.__e4123Pointer(sel,typ,delta,id)""",
                  [selector,kind,large,91])
                edited=pg.evaluate("""() => {
                  const E=window.__team.state.ped,m=E.draft.moves.at(-1);
                  return {raw:JSON.stringify(E.draft),undo:E.undo.length,
                    actorLinks:JSON.stringify(m.actorLinks),first:JSON.stringify(m.pts[0]),
                    other:JSON.stringify(E.draft.phases[0]),zoom:E.zoom};
                }""")
                checks.ok(edited['raw']!=initial and edited['undo']==1 and
                          edited['actorLinks']=='{}' and
                          edited['other']==pg.evaluate('window.__e4123Other') and
                          abs(edited['zoom']-zoom)<.01,
                          f'[{width}/{mode}/{kind}] deliberate body drag moves V1, detaches links only in phase')
                pg.locator('[data-act=ped-undo]').click()
                checks.ok(pg.evaluate('JSON.stringify(window.__team.state.ped.draft)')==initial and
                          pg.evaluate('window.__team.state.ped.undo.length')==0,
                          f'[{width}/{mode}/{kind}] Undo restores both explicit links and bend geometry')
            # Handle taps should choose the endpoint without moving it or
            # changing its explicit versioned relationship.
            pg.evaluate("""() => {
              const E=window.__team.state.ped;
              E.sel={k:'mv',i:E.draft.moves.length-1};E.selH=null;
            }""")
            pg.locator('[data-act=ped-fit]' if mode=='fit' else '[data-act=ped-zoom-in]').click()
            h='#ped-field svg .ped-handle-hit[data-h="0"]'
            pg.evaluate("""([sel,typ,delta,id]) =>
              window.__e4123Pointer(sel,typ,delta,id)""",[h,'touch',6,92])
            checks.ok(pg.evaluate("""() => {
              const E=window.__team.state.ped;
              return E.sel?.k==='mv' && E.selH===0 &&
                E.undo.length===0 &&
                JSON.stringify(E.draft)===window.__e4123Original;
            }"""),f'[{width}/{mode}] touch selects connected Start handle without unlinking')
            pg.evaluate("""([sel,typ,delta,id]) =>
              window.__e4123Pointer(sel,typ,delta,id)""",[h,'touch',24,93])
            handle=pg.evaluate("""() => {
              const E=window.__team.state.ped,m=E.draft.moves.at(-1);
              return {changed:JSON.stringify(E.draft)!==window.__e4123Original,
                undo:E.undo.length,other:JSON.stringify(E.draft.phases[0]),
                end:m.actorLinks.end};
            }""")
            checks.ok(handle['changed'] and handle['undo']==1 and
                      handle['other']==pg.evaluate('window.__e4123Other') and
                      handle['end']=='player:RM',
                      f'[{width}/{mode}] deliberate Start-handle drag retains opposite actor and phase')
            pg.locator('[data-act=ped-undo]').click()
            checks.ok(pg.evaluate('JSON.stringify(window.__team.state.ped.draft)')==initial,
                      f'[{width}/{mode}] Undo restores handle movement and attached origin')
        checks.ok(pg.evaluate("""() => JSON.stringify(
          window.__team.data.plays.find(x=>x.id==='quickie-out')
        )""")==stored,f'[{width}] changing draft never touches stored Step Out')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify(
          window.__team.data.plays.find(x=>x.id==='quickie-out')
        )""")==stored,f'[{width}] Cancel preserves existing saved play')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=play-edit],#ped-field').count()==0,
                  f'[{width}] player preview remains read-only and has no drawing stage')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
