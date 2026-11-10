# E4.8: coach-only run end at selected tactical actor or free field point.
# Synthetic Chromium on phone/desktop; not a claim of physical Safari signoff.
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
        checks.ok(pg.locator('[data-act=ped-run-end], [data-act=ped-run-free-end]').count()==0,
                  f'[{width}] no coach-only run target buttons in Watch')
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          const legacy=d.moves.findIndex(m=>m.t==='run' && m.linkVersion===undefined);
          if(legacy<0)throw Error('Original Oztag run missing');
          E.sel={k:'mv',i:legacy}; E.inspectorOpen=true;
        }""")
        pg.locator('[data-act=ped-snap]').click()
        checks.ok(pg.locator('#ped-properties [data-act=ped-run-end]').count()==0 and
                  pg.locator('#ped-properties [data-act=ped-run-free-end]').count()==0,
                  f'[{width}] old geometry never grows versioned run-end controls')
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          if(!d.players.LM||!d.players.RM)throw Error('Missing synthetic actors');
          d.moves.push({moveId:'m-e48-browser',linkVersion:1,t:'run',
            pts:[[...d.players.LM],[20,33],[35,38]],
            actorLinks:{start:'player:LM'}});
          E.sel={k:'mv',i:d.moves.length-1};
        }""")
        pg.locator('[data-act=ped-snap]').click()
        target=pg.locator('#ped-properties [data-act=ped-run-end]')
        free=pg.locator('#ped-properties [data-act=ped-run-free-end]')
        checks.ok(target.count()>2 and free.count()==1 and free.is_disabled() and
                  pg.locator('#ped-properties [role=group][aria-label="Choose run endpoint"]').count()==1,
                  f'[{width}] run end actor choices and disabled free-end action')
        checks.ok('Run ends at' in pg.locator('#ped-properties').inner_text() and
                  'Run from' in pg.locator('#ped-properties').inner_text() and
                  'not a catch' in pg.locator('#ped-properties').inner_text(),
                  f'[{width}] run start and end meanings are distinct, without catch inference')
        pg.locator('#ped-properties [data-act=ped-run-end][data-player=RM]').click()
        attached=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft,m=d.moves.at(-1);
          return {start:m.actorLinks.start,end:m.actorLinks.end,
            pts:m.pts.map(p=>[...p]),lm:[...d.players.LM],rm:[...d.players.RM]};
        }""")
        checks.ok(attached['start']=='player:LM' and attached['end']=='player:RM' and
                  attached['pts']==[attached['lm'],[20,33],attached['rm']] and
                  free.is_enabled(),
                  f'[{width}] explicit run end anchors RM and preserves LM and bend')
        checks.ok(pg.locator('#ped-properties [data-act=ped-run-end][data-player=RM]').get_attribute('aria-pressed')=='true',
                  f'[{width}] run-end button reflects selected actor')
        pg.locator('#ped-properties [data-act=ped-run-free-end]').click()
        detached=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {linked:Object.hasOwn(m.actorLinks,'end'),start:m.actorLinks.start,
            pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(not detached['linked'] and detached['start']=='player:LM' and
                  detached['pts']==attached['pts'] and free.is_disabled(),
                  f'[{width}] free run endpoint stays fixed without erasing origin or geometry')
        undo=pg.locator('[data-act=ped-undo]')
        undo.scroll_into_view_if_needed()
        tappable=pg.evaluate("""() => {
          const b=document.querySelector('[data-act="ped-undo"]'),r=b.getBoundingClientRect();
          return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('[data-act="ped-undo"]')===b;
        }""")
        checks.ok(tappable,
                  f'[{width}] Undo remains tappable with both run link controls shown')
        undo.click()
        restored=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {end:m.actorLinks.end,pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(restored['end']=='player:RM' and restored['pts']==attached['pts'],
                  f'[{width}] Undo restores run end relationship and coordinates')
        undo.click()
        initial=pg.evaluate("""() => {
          const m=window.__team.state.ped.draft.moves.at(-1);
          return {links:{...m.actorLinks},pts:m.pts.map(p=>[...p])};
        }""")
        checks.ok(initial['links']=={'start':'player:LM'} and
                  initial['pts']==[attached['lm'],[20,33],[35,38]],
                  f'[{width}] second Undo restores original run-end field coordinate')
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] run edit leaves saved play, shared library and team context intact')
        pg.evaluate('window.confirm=()=>true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] Cancel leaves original Oztag Step Out saved')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=ped-run-end], [data-act=ped-run-free-end], [data-act=play-edit]').count()==0,
                  f'[{width}] player preview cannot access editor/run endpoints')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),
                  f'[{width}] new run endpoint properties do not cause page-level overflow')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
