# E4.7 coach-only explicit run start versus deliberate free field coordinate.
# This synthetic Chromium test is not physical Safari qualification.
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
        checks.ok(pg.locator('[data-act=ped-run-origin], [data-act=ped-run-free-start]').count()==0,
                  f'[{width}] players and standard viewers cannot access run origin authoring')
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          const idx=d.moves.findIndex(m=>m.t==='run'&&m.linkVersion===undefined);
          if(idx<0)throw Error('No unchanged legacy Oztag run to check');
          E.sel={k:'mv',i:idx};E.inspectorOpen=true;
        }""")
        pg.locator('[data-act=ped-snap]').click()
        checks.ok(pg.locator('#ped-properties [data-act=ped-run-origin]').count()==0 and
                  pg.locator('#ped-properties [data-act=ped-run-free-start]').count()==0,
                  f'[{width}] legacy run is never silently made into versioned origin controls')
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          if(!d.players.LM||!d.players.RM)throw Error('Missing fixture tactical actors');
          d.moves.push({moveId:'m-e47-browser',linkVersion:1,t:'run',
            pts:[[18,31],[20,33],[24,38]],actorLinks:{}});
          E.sel={k:'mv',i:d.moves.length-1};
        }""")
        pg.locator('[data-act=ped-snap]').click()
        selector=pg.locator('#ped-properties [data-act=ped-run-origin]')
        free=pg.locator('#ped-properties [data-act=ped-run-free-start]')
        checks.ok(selector.count()>2 and
                  pg.locator('#ped-properties [role=group][aria-label="Choose run origin"]').count()==1 and
                  free.count()==1 and free.is_disabled(),
                  f'[{width}] run has explicit origin buttons and disabled field detach when unlinked')
        checks.ok('Run from' in pg.locator('#ped-properties').inner_text() and
                  'independent field point' in pg.locator('#ped-properties').inner_text(),
                  f'[{width}] run start role and deliberate free field meaning are understandable')
        pg.locator('#ped-properties [data-act=ped-run-origin][data-player=RM]').click()
        attached=pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft,m=d.moves.at(-1);
          return {start:m.actorLinks.start,pts:m.pts.map(p=>[...p]),
            actor:[...d.players.RM],hasOtherLink:Object.hasOwn(m.actorLinks,'end')};
        }""")
        checks.ok(attached['start']=='player:RM' and attached['pts'][0]==attached['actor'] and
                  attached['pts'][1:]==[[20,33],[24,38]] and
                  not attached['hasOtherLink'] and free.is_enabled(),
                  f'[{width}] Run from RM attaches start without altering bend/end or inventing target')
        checks.ok(pg.locator('#ped-properties [data-act=ped-run-origin][data-player=RM]').get_attribute('aria-pressed')=='true',
                  f'[{width}] selected run origin has accessible pressed state')
        pg.locator('#ped-properties [data-act=ped-run-free-start]').click()
        detached=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {start:Object.hasOwn(m.actorLinks,'start'),pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(not detached['start'] and detached['pts']==attached['pts'] and free.is_disabled(),
                  f'[{width}] leave start on field removes only the relationship, never moves coordinates')
        undo=pg.locator('[data-act=ped-undo]')
        undo.scroll_into_view_if_needed()
        tapTarget=pg.evaluate("""() => {
          const b=document.querySelector('[data-act="ped-undo"]');
          const r=b.getBoundingClientRect();
          return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-act="ped-undo"]')===b;
        }""")
        checks.ok(tapTarget,
                  f'[{width}] Undo stays physically tappable above the precision palette')
        undo.click()
        restored=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {link:m.actorLinks.start,pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(restored['link']=='player:RM' and restored['pts']==attached['pts'],
                  f'[{width}] Undo restores attached origin and geometry')
        pg.locator('[data-act=ped-undo]').click()
        initial=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {linked:Object.hasOwn(m.actorLinks,'start'),pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(not initial['linked'] and initial['pts']==[[18,31],[20,33],[24,38]],
                  f'[{width}] second Undo restores the deliberate free start')
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] editing an unsaved run does not modify workspace or original Step Out')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] Cancel keeps plays, library and team selection intact')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=ped-run-origin], [data-act=ped-run-free-start], [data-act=play-edit]').count()==0,
                  f'[{width}] player preview remains read-only without origin controls')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),
                  f'[{width}] origin controls do not cause mobile overflow')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
