# E4.12: browser qualification of collapsed-inspector phase-local V1
# endpoint picker. Synthetic Chromium phone/desktop, not physical Safari.
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
        baseline=pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")
        checks.ok(pg.locator('[data-change=ped-connect-point]').count()==0,
                  f'[{width}] no connected-path authoring on standard Watch')
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          E.inspectorOpen=false;
          const second=JSON.parse(JSON.stringify(d));
          delete second.phases;
          second.title='Synthetic second phase';
          second.moves=[{moveId:'m-e412-next',linkVersion:1,t:'run',
            actorLinks:{start:'player:RM'},
            pts:[[...second.players.RM],[28,33],[31,38]]}];
          d.phases.push(second);
          d.moves.push({moveId:'m-e412-first',linkVersion:1,t:'run',
            actorLinks:{start:'player:RM'},
            pts:[[...d.players.RM],[28,32],[30,38]]});
          E.sel={k:'mv',i:d.moves.length-1};
          E.selH=2;
          window.__e412First=JSON.stringify(second);
        }""")
        pg.locator('[data-act=ped-fit]').click()
        control=pg.locator('#ped-precision [data-change=ped-connect-point]')
        checks.ok(control.count()==1 and control.is_visible() and
                  pg.locator('#ped-properties').is_hidden(),
                  f'[{width}] inline connection picker works with properties collapsed')
        checks.ok(control.get_attribute('aria-label')=='Phase 1 end actor connection' and
                  'Phase 1 only' in pg.locator('#ped-precision').inner_text(),
                  f'[{width}] picker states phase-local endpoint, not person identity')
        first=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft;
          return {move:JSON.stringify(d.moves.at(-1)),phase2:JSON.stringify(d.phases[0])};
        }""")
        control.select_option('player:LR')
        attached=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft,m=d.moves.at(-1);
          return {actor:m.actorLinks.end,pts:m.pts.map(x=>[...x]),
            lr:[...d.players.LR],phase2:JSON.stringify(d.phases[0])};
        }""")
        checks.ok(attached['actor']=='player:LR' and
                  attached['pts']==[[25,28],[28,32],attached['lr']] and
                  attached['phase2']==first['phase2'],
                  f'[{width}] explicit run end connects within phase 1, retaining bend/phase 2')
        checks.ok('Attached' in pg.locator('#ped-precision').inner_text() and
                  pg.locator('[data-act=ped-undo]').is_enabled(),
                  f'[{width}] editor visibly confirms link and retains Undo')
        pg.locator('#ped-precision [data-change=ped-connect-point]').select_option('')
        free=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {linked:Object.hasOwn(m.actorLinks,'end'),
            pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(not free['linked'] and free['pts']==attached['pts'],
                  f'[{width}] free endpoint retains authored coordinate')
        pg.locator('[data-act=ped-undo]').click()
        restored=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return m.actorLinks.end;
        }""")
        checks.ok(restored=='player:LR',f'[{width}] Undo restores precise V1 actor link')
        pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("""() => {
          const d=window.__team.state.ped.draft;
          return JSON.stringify(d.moves.at(-1)) === window.__unused;
        }""") is False and
                  pg.evaluate("JSON.stringify(window.__team.state.ped.draft.moves.at(-1))")==first['move'],
                  f'[{width}] two Undos return exact first-phase movement bytes')

        # Reopen a second-phase edit using its own phase-local control.
        pg.locator('[data-act=ped-phase][data-i="1"]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped;
          E.sel={k:'mv',i:0}; E.selH=0; E.inspectorOpen=false;
        }""")
        pg.locator('[data-act=ped-fit]').click()
        checks.ok(control.get_attribute('aria-label')=='Phase 2 start actor connection' and
                  'Phase 2 only' in pg.locator('#ped-precision').inner_text(),
                  f'[{width}] phase 2 picker follows phase selection, not shared labels')
        firstRaw=pg.evaluate("JSON.stringify(window.__team.state.ped.draft.moves.at(-1))")
        control.select_option('player:LR')
        secondChanged=pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          return {actor:d.phases[0].moves[0].actorLinks.start,
            point:d.phases[0].moves[0].pts[0],
            lr:d.phases[0].players.LR,
            first:JSON.stringify(d.moves.at(-1))};
        }""")
        checks.ok(secondChanged['actor']=='player:LR' and
                  secondChanged['point']==secondChanged['lr'] and
                  secondChanged['first']==firstRaw,
                  f'[{width}] phase 2 reanchor cannot mutate phase 1')
        pg.locator('[data-act=ped-zoom-in]').click()
        checks.ok(control.is_visible() and
                  pg.locator('#ped-precision').is_visible(),
                  f'[{width}] zoom leaves selection and inline link action accessible')
        pg.locator('[data-act=ped-undo]').click()
        checks.ok(pg.evaluate("""() => {
          const d=window.__team.state.ped.draft;
          return d.phases[0].moves[0].actorLinks.start==='player:RM';
        }"""),f'[{width}] phase 2 Undo restores its original actor')

        # Re-select a stale link in place instead of requiring an exact touch drag.
        pg.evaluate("""() => {
          const E=window.__team.state.ped;
          E.draft.phases[0].moves[0].pts[0]=[24,30];
        }""")
        pg.locator('[data-act=ped-fit]').click()
        checks.ok(pg.locator('#ped-precision [data-act=ped-connect-repair]').count()==1 and
                  'Needs repair' in pg.locator('#ped-precision').inner_text(),
                  f'[{width}] stale connection is clearly labelled and repairable')
        pg.locator('#ped-precision [data-act=ped-connect-repair]').click()
        checks.ok(pg.evaluate("""() => {
          const ph=window.__team.state.ped.draft.phases[0],m=ph.moves[0];
          return m.actorLinks.start==='player:RM'&&
            JSON.stringify(m.pts[0])===JSON.stringify(ph.players.RM);
        }"""),f'[{width}] repair aligns only the known V1 phase-local endpoint')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] Cancel preserves saved Step Out, library and teams')
        checks.ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+2"),
                  f'[{width}] inline picker adds no page-level horizontal overflow')
        pg.evaluate("""() => {
          const b=document.createElement('button');
          b.dataset.act='preview-on';document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-change=ped-connect-point], [data-act=play-edit]').count()==0,
                  f'[{width}] player preview never receives link editor controls')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
