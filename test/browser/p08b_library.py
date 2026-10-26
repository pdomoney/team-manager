# P08B: local library source / copy review (browser-only fictional data).
import sys
from harness import *
from playwright.sync_api import sync_playwright
build(); srv,url=serve(); checks=Check()
act="([a, ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    b=p.chromium.launch()
    errors=[]
    for width in (390,1280):
        ctx,pg,_=page(b,url+'#home',width=width,errors=errors)
        pg.click('text=Load a sample squad');pg.wait_for_timeout(120)
        pg.evaluate("""() => {
          const W=window.__team.ws,D=window.__team.data;
          const club=D.team.clubId || W.clubs[0]?.id || 'test-club';
          D.team.clubId=club;
          W.library.plays.push({id:'p08b-origin',name:'P08B Source Play',
            sport:'Oztag',rev:2,moves:[],
            libraryOrigin:{scope:'coach-workspace',teamId:D.id,
              clubId:club,sport:'Oztag'}});
          W.library.plays.push({id:'p08b-legacy',name:'P08B Legacy Play',rev:1,moves:[]});
        }""")
        pg.evaluate(act,['tab',{'tab':'library'}]);pg.wait_for_selector('#view .lib-row')
        view=pg.locator('#view').inner_text()
        checks.ok('P08B Source Play' in view and 'Source: Oztag' in view,
                  f'{width}: source sport is clearly shown')
        checks.ok('P08B Legacy Play' in view and 'Source sport not recorded' in view,
                  f'{width}: legacy origin flagged as unknown')
        checks.ok('not an independently authorised club or association library' in view,
                  f'{width}: local-only scope honestly described')
        # Switch fictional current team to a different code, then inspect warning.
        pg.evaluate("window.__team.data.team.sport='Touch football'")
        pg.evaluate(act,['tab',{'tab':'library'}])
        view=pg.locator('#view').inner_text()
        checks.ok('Review before copying to this team' in view,
                  f'{width}: cross-sport copy requires explicit review')
        # Confirmation is accepted by the test harness (real UI requires operator click).
        pg.evaluate(act,['lib-add',{'k':'plays','id':'p08b-origin'}]);pg.wait_for_timeout(120)
        count=pg.evaluate("""() => window.__team.data.plays.filter(
          x=>x.lib?.id==='p08b-origin').length""")
        checks.ok(count==1,f'{width}: explicit cross-sport local copy retains one linked version')
        pg.evaluate(act,['tab',{'tab':'library'}])
        checks.ok('P08B Source Play' in pg.locator('#view').inner_text(),
                  f'{width}: source library item survives copying')
        ctx.close()
    passed=checks.done(errors)
    b.close()
srv.shutdown()
sys.exit(0 if passed else 1)
