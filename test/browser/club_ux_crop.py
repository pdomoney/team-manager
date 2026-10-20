# Club/Home context and player portrait crop. Uses isolated synthetic browser records.
import sys,base64
from harness import *
from playwright.sync_api import sync_playwright

build();srv,url=serve();c,errs=Check(),[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errs)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]');pg.wait_for_timeout(180)
        W=lambda js:pg.evaluate(f"(()=>{{const W=window.__team.ws,D=window.__team.data,M=window.__team.M;return {js};}})()")
        pg.click('.scope-club[data-id=penrithoztag]');pg.wait_for_timeout(130)
        c.ok(W("D.team.clubId")=='penrithoztag' and 'Penrith' in pg.inner_text('#team-title') and
          pg.locator('.scope-club[data-id=penrithoztag][aria-pressed=true]').count()==1,
          f'[{width}] choosing club aligns editor, header and Home filter')
        c.ok(pg.locator('.scope-team.editing').count()==1,
          f'[{width}] active editing team is distinguishable in filtered Home view')
        pg.evaluate(act,['tab',{'tab':'crew'}]);pg.wait_for_timeout(80)
        c.ok(pg.locator('#view [name=crewTeamId]').count()==1 and pg.locator('#view [data-act=crew-switch]').count()==0,
          f'[{width}] match staff uses inline team dropdown')
        pg.locator('#view [name=crewTeamId]').select_option('testwomen');pg.wait_for_timeout(110)
        c.ok(W('D.id')=='testwomen' and 'DragonTag' in pg.inner_text('#team-title') and
          W("D.team.clubId")=='stgeorge',
          f'[{width}] team dropdown switches active context and header without a popup')
        # A coach changes photo, adjusts crop, then commits through the existing player save form.
        pid=W('D.players[0].id')
        pg.evaluate(act,['edit-player',{'id':pid}])
        pg.wait_for_selector('#sheet form[data-form=player]')
        before=pg.locator('#sheet [name=photo]').input_value()
        source=pg.evaluate("""() => { const c=document.createElement('canvas');c.width=420;c.height=260;
          const g=c.getContext('2d');g.fillStyle='#d53a36';g.fillRect(0,0,210,260);
          g.fillStyle='#2244cc';g.fillRect(210,0,210,260);
          return c.toDataURL('image/png').split(',')[1]; }""")
        pg.set_input_files('#sheet [data-change=player-photo]',{'name':'portrait.png','mimeType':'image/png','buffer':base64.b64decode(source)})
        pg.wait_for_selector('#sheet .player-crop-panel:visible')
        c.ok(pg.locator('#sheet [name=photo]').input_value()==before,
          f'[{width}] original photo is unchanged until crop is accepted')
        pg.locator('#sheet [name=cropZoom]').fill('200')
        pg.locator('#sheet [name=cropX]').fill('0')
        pg.locator('#sheet [name=cropY]').fill('45')
        pg.click('#sheet [data-act=player-crop-apply]')
        cropped=pg.locator('#sheet [name=photo]').input_value()
        c.ok(cropped.startswith('data:image/') and len(cropped)<=12000 and cropped!=before,
          f'[{width}] square crop output meets existing private photo size target')
        pg.locator('#sheet form[data-form=player] button[value=save]').click();pg.wait_for_timeout(130)
        c.ok(W(f"D.players.find(p=>p.id==='{pid}').photo.startsWith('data:image/')"),
          f'[{width}] cropped photo saved on the player record')
        pg.reload();pg.wait_for_function('window.__team && window.__team.ws')
        c.ok(W(f"D.players.find(p=>p.id==='{pid}').photo.startsWith('data:image/')"),
          f'[{width}] cropped photo survives device reload')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
          f'[{width}] no horizontal overflow')
        ctx.close()
    ok=c.done(errs);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
