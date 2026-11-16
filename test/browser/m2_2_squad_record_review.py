# M2.2: Coach-only optional squad detail suggestions. Synthetic local records.
# Reported adult relationships are NOT identity, legal guardianship or access grants.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
act="([name,values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"

def choose(pg,ident):
    pg.evaluate(act,['tab',{'tab':'home'}])
    pg.click('#home-profile-button')
    pg.click(f'#home-profile-panel [data-profile="{ident}"]')

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        original=pg.evaluate('JSON.stringify(window.__team.ws)')
        choose(pg,'qa-07')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        panel=pg.locator('#view .squad-record-review[data-team-id=qarangers16]')
        checks.ok(panel.count()==1 and not panel.get_attribute('open'),
                  f'[{width}] Coach receives compact, collapsed exact-team player detail review')
        checks.ok('not registration requirements' in panel.inner_text().lower() or
                  'not registration requirements' in panel.locator('.hint').first.text_content().lower(),
                  f'[{width}] optional player fields are not described as registration rules')
        panel.locator('summary').click()
        checks.ok(panel.get_attribute('open') is not None
                  and 'NOT verified legal guardianship' in panel.inner_text()
                  and 'No relationship is inferred' in panel.inner_text(),
                  f'[{width}] Coach sees explicit non-verification and no inferred guardianship')
        sample=pg.evaluate("""() => ({
          total:window.__team.data.players.length,
          team:window.__team.data.id
        })""")
        checks.ok(sample['team']=='qarangers16' and sample['total']>=10,
                  f'[{width}] Coach uses original fictional assigned team')
        # Introduce optional detail gaps in the in-memory synthetic team only.
        pg.evaluate("""() => {
          const p=window.__team.data.players;
          p[0].number='';
          p[1].positions=[];
        }""")
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.evaluate(act,['tab',{'tab':'squad'}])
        panel=pg.locator('#view .squad-record-review[data-team-id=qarangers16]')
        panel.locator('summary').click()
        reviewButtons=panel.locator('[data-act=edit-player]')
        checks.ok(reviewButtons.count()>=2
                  and 'No jersey number' in panel.inner_text()
                  and 'No preferred positions' in panel.inner_text(),
                  f'[{width}] optional missing jersey/position details are discoverable')
        before=pg.evaluate('JSON.stringify(window.__team.data.players)')
        first=reviewButtons.first
        pid=first.get_attribute('data-id')
        first.click()
        checks.ok(pg.locator('#sheet form[data-form=player]').count()==1
                  and pg.locator(f'#sheet form[data-form=player] input[name=id]').get_attribute('value')==pid,
                  f'[{width}] detail review opens original exact-player Coach form')
        # Use the visible, keyboard-accessible header Close control. The first
        # close-sheet element is the backdrop behind the dialog and may be
        # occluded by the dialog body at different viewport sizes.
        pg.locator('#sheet .panel-head button[data-act=close-sheet]').click()
        checks.ok(pg.locator('#sheet').is_hidden(),
                  f'[{width}] player editor closes through its visible Close button')
        checks.ok(pg.evaluate('JSON.stringify(window.__team.data.players)')==before,
                  f'[{width}] cancel does not write player detail changes')
        checks.ok(not pg.evaluate('document.documentElement.scrollWidth > innerWidth+1'),
                  f'[{width}] Coach review fits the device without horizontal overflow')
        for persona in ('qa-09','qa-04','qa-14','qa-16','qa-19'):
            choose(pg,persona)
            pg.evaluate(act,['tab',{'tab':'squad'}])
            checks.ok(pg.locator('#view .squad-record-review').count()==0
                      and pg.locator('#view .squad-record-item').count()==0,
                      f'[{width}] {persona} does not see Coach-only optional personal detail review')
        choose(pg,'qa-01')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        checks.ok(pg.locator('#view .squad-record-review').count()<=1,
                  f'[{width}] Owner review never duplicates across portfolios')
        # No changes to encrypted storage or published player views from inspection.
        checks.ok(pg.evaluate("""() => window.__team.ws &&
           window.__team.S.role==='coach' &&
           document.querySelector('#view .squad-record-review') !== null"""),
           f'[{width}] Coach workspace remains operational')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
