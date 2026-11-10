# E4.6: coach can repair a missing explicit passer without editing legacy
# drawing coordinates or creating any timed possession state.
# Synthetic Chromium 390/1280; physical Safari remains a separate owner gate.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=865,errors=errors)
        pg.get_by_text('Load a sample squad').click()
        pg.goto(url+'#plays')
        pg.locator('.play-row[data-id=quickie-out]').click()
        baseline=pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")
        checks.ok(pg.locator('[data-act=ped-passer]').count()==0,
                  f'[{width}] passer controls not visible in standard Learn/Watch')
        pg.locator('[data-act=play-edit]').click()
        pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft;
          const keys=Object.keys(d.players);
          const start='LM', receiver='RM';
          const alternate=keys.find(k => k!==start && k!==receiver &&
            d.players.every === undefined &&
            !keys.some(j => j!==k &&
              Math.hypot(d.players[k][0]-d.players[j][0],
                d.players[k][1]-d.players[j][1])<0.4));
          if(!d.players[start]||!d.players[receiver]||!alternate)
            throw Error('Missing distinct synthetic tactical actors');
          d.moves.push({moveId:'m-e46-browser',linkVersion:1,t:'pass',
            pts:[[d.players[start][0]+2,d.players[start][1]+2],[...d.players[receiver]]],
            actorLinks:{end:'player:'+receiver}});
          E.sel={k:'mv',i:d.moves.length-1};
          E.inspectorOpen=true;
          window.__e46={start,receiver,alternate};
        }""")
        # Trigger existing editor refresh; no new UI endpoint or private test hook.
        pg.locator('[data-act=ped-snap]').click()
        warning=pg.locator('#ped-link-warning')
        selector=pg.locator('#ped-properties [data-act=ped-passer]')
        checks.ok(warning.is_visible() and
                  'no explicitly connected passer' in warning.inner_text() and
                  selector.count()>2,
                  f'[{width}] selected explicit pass offers visible Pass from repair')
        checks.ok(pg.locator('#ped-properties [role=group][aria-label="Choose pass origin"]').count()==1 and
                  pg.locator('#ped-properties [role=group][aria-label="Choose pass receiver"]').count()==1,
                  f'[{width}] sender and receiver buttons have distinct accessible labels')
        pg.locator('#ped-properties [data-act=ped-passer][data-player=LM]').click()
        first=pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft,m=d.moves.at(-1);
          return { start:m.actorLinks.start,end:m.actorLinks.end,
            p0:[...m.pts[0]],p1:[...m.pts.at(-1)],expected:[...d.players.LM],
            receiver:[...d.players.RM] };
        }""")
        checks.ok(first['start']=='player:LM' and first['end']=='player:RM' and
                  first['p0']==first['expected'] and
                  first['p1']==first['receiver'] and not warning.is_visible(),
                  f'[{width}] picking LM fixes only the pass start and warning')
        checks.ok(pg.locator('#ped-properties [data-act=ped-passer][data-player=LM]').get_attribute('aria-pressed')=='true',
                  f'[{width}] selected passer is clearly displayed')
        alternate=pg.evaluate('window.__e46.alternate')
        pg.locator(f'#ped-properties [data-act=ped-passer][data-player="{alternate}"]').click()
        revised=pg.evaluate("""() => {
          const E=window.__team.state.ped,d=E.draft,m=d.moves.at(-1),a=window.__e46.alternate;
          return {start:m.actorLinks.start,end:m.actorLinks.end,
            p0:[...m.pts[0]],expected:[...d.players[a]],
            p1:[...m.pts.at(-1)],receiver:[...d.players.RM]};
        }""")
        checks.ok(revised['start']=='player:'+alternate and revised['p0']==revised['expected'] and
                  revised['end']=='player:RM' and revised['p1']==revised['receiver'],
                  f'[{width}] choosing a different passer preserves receiver coordinates')
        pg.locator('[data-act=ped-undo]').click()
        restored=pg.evaluate("""() => {
          const d=window.__team.state.ped.draft,m=d.moves.at(-1);
          return [m.actorLinks.start,m.pts[0][0],m.pts[0][1]];
        }""")
        checks.ok(restored==['player:LM',*first['expected']],
                  f'[{width}] Undo restores the exact previous actor link and start position')
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] unsaved passer selection never mutates team, plays or library')
        # Discard synthetic draft, then verify player preview has no coach actions.
        pg.evaluate('window.confirm=() => true')
        pg.locator('#sheet .ped-save [data-act=ped-cancel]').click()
        checks.ok(pg.evaluate("""() => JSON.stringify({
          plays:window.__team.data.plays,
          library:window.__team.ws.library,
          teams:window.__team.M.teamsOf(window.__team.ws).map(t=>t.id)
        })""")==baseline,
                  f'[{width}] Cancel preserves original Step Out and workspace')
        pg.evaluate("""() => {
          const b=document.createElement('button');b.dataset.act='preview-on';
          document.body.appendChild(b);b.click();b.remove();
        }""")
        pg.locator('[data-act=play-back]').click()
        pg.locator('.play-row[data-id=quickie-out]').click()
        checks.ok(pg.locator('[data-act=ped-passer], [data-act=play-edit]').count()==0,
                  f'[{width}] player viewer never exposes Pass from authoring')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),
                  f'[{width}] added pass property controls do not cause page overflow')
        ctx.close()
    passed=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if passed else 1)
