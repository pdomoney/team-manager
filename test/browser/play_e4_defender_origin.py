# E4.9: repair the start of an explicitly linked defender/marker movement.
# Synthetic Chromium phone/desktop; physical Safari/touch acceptance is separate.
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
        before=pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")
        checks.ok(pg.locator('[data-act=ped-defender-origin], [data-act=ped-defender-free-start]').count()==0,
                  f'[{width}] no defender authoring actions on standard Watch/Learn')
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          d.defence.line=[[12,20],[28,20]];
          d.defence.marker=[18,24];
          d.moves.push({t:'shift',pts:[[12,20],[13,22]]});
          E.sel={k:'mv',i:d.moves.length-1};
          E.inspectorOpen=true;
        }""")
        pg.locator('[data-act=ped-snap]').click()
        checks.ok(pg.locator('#ped-properties [data-act=ped-defender-origin], #ped-properties [data-act=ped-defender-free-start]').count()==0,
                  f'[{width}] old unversioned defence line has no new metadata controls')
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          d.moves.push({moveId:'m-e49-browser',linkVersion:1,t:'shift',
            pts:[[14,21],[15,23],[16,27]],actorLinks:{}});
          E.sel={k:'mv',i:d.moves.length-1};
        }""")
        pg.locator('[data-act=ped-snap]').click()
        group=pg.locator('#ped-properties [role=group][aria-label="Choose defender run origin"]')
        options=pg.locator('#ped-properties [data-act=ped-defender-origin]')
        free=pg.locator('#ped-properties [data-act=ped-defender-free-start]')
        checks.ok(group.count()==1 and options.count()==3 and free.count()==1 and free.is_disabled(),
                  f'[{width}] one named group offers two defenders plus marker; detach disabled initially')
        checks.ok('Defender run from' in pg.locator('#ped-properties').inner_text() and
                  'does not choose a defensive response' in pg.locator('#ped-properties').inner_text(),
                  f'[{width}] description distinguishes authored line from defensive decision')
        pg.locator('#ped-properties [data-act=ped-defender-origin][data-actor="defender:0"]').click()
        attached=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft,m=d.moves.at(-1);
          return {actor:m.actorLinks.start,pts:m.pts.map(p=>[...p]),
            defender:[...d.defence.line[0]]};
        }""")
        checks.ok(attached['actor']=='defender:0' and
                  attached['pts']==[attached['defender'],[15,23],[16,27]] and
                  free.is_enabled(),
                  f'[{width}] explicit defender selection repairs only shift start; keeps bend/end')
        checks.ok(pg.locator('#ped-properties [data-act=ped-defender-origin][data-actor="defender:0"]').get_attribute('aria-pressed')=='true',
                  f'[{width}] selected defender is communicated accessibly')
        pg.locator('#ped-properties [data-act=ped-defender-origin][data-actor=marker]').click()
        marker=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft,m=d.moves.at(-1);
          return {actor:m.actorLinks.start,pts:m.pts.map(p=>[...p]),
            marker:[...d.defence.marker]};
        }""")
        checks.ok(marker['actor']=='marker' and
                  marker['pts']==[marker['marker'],[15,23],[16,27]],
                  f'[{width}] marker selection reanchors only start, without a timed defensive response')
        pg.locator('#ped-properties [data-act=ped-defender-free-start]').click()
        released=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {linked:Object.hasOwn(m.actorLinks,'start'),
            pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(not released['linked'] and released['pts']==marker['pts'] and free.is_disabled(),
                  f'[{width}] deliberate free start unlinks actor without moving field position')
        undo=pg.locator('[data-act=ped-undo]')
        undo.scroll_into_view_if_needed()
        reachable=pg.evaluate("""() => {
          const b=document.querySelector('[data-act="ped-undo"]'),r=b.getBoundingClientRect();
          return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-act="ped-undo"]')===b;
        }""")
        checks.ok(reachable, f'[{width}] Undo remains tappable above any precision palette')
        undo.click()
        undone=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {actor:m.actorLinks.start,pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(undone['actor']=='marker' and undone['pts']==marker['pts'],
                  f'[{width}] Undo restores marker relationship and coordinates')
        undo.click()
        previous=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {actor:m.actorLinks.start,pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(previous['actor']=='defender:0' and previous['pts']==attached['pts'],
                  f'[{width}] second Undo restores prior defender relationship and bend/end')
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==before,
                  f'[{width}] unsaved defender edits never touch saved plays, library or teams')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==before,
                  f'[{width}] Cancel preserves original Oztag Step Out and workspace')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=ped-defender-origin], [data-act=ped-defender-free-start], [data-act=play-edit]').count()==0,
                  f'[{width}] player preview stays read-only and cannot select defenders')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),
                  f'[{width}] mobile defender controls do not cause page overflow')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
