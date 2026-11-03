# PR155: D04 future-state Coach/Manager placement decisions use the native Squad.
# They do not verify registration, fees or competition eligibility.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve();c=Check();errors=[]
act="([name,values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-09]')
        pg.locator('#view .scope-club[data-id=qa-rangers]').click()
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok(pg.evaluate("window.__team.data.id")=='qarangers16' and
             pg.locator('#view [data-act=team-placement-open]').count()>=10 and
             pg.locator('#view [data-act=edit-player]').count()==0 and
             pg.locator('#view [data-act=wa-player]').count()==0 and
             pg.locator('#view [data-act=squad-add]').count()==0,
             f'[{width}] Manager uses original Squad without Coach contacts, roster edit or attendance scores')
        first=pg.locator('#view [data-act=team-placement-open]').first
        pid=first.get_attribute('data-id')
        c.ok(first.get_attribute('data-next')=='nominate',
             f'[{width}] no player is deemed team-approved by historical default data')
        # Native placement button must fit on the phone.
        b=first.bounding_box()
        c.ok(b is not None and b['x']>=0 and b['x']+b['width']<=width+2,
             f'[{width}] Squad placement action remains inside viewport')

        # Fabricated button cannot nominate a player who belongs to another team.
        pg.evaluate(act,['team-placement-open',{'id':'some-other-team-player','next':'nominate'}])
        c.ok(pg.evaluate("document.querySelector('#sheet').hidden"),
             f'[{width}] fabricated other-team player cannot start decision')
        first.click()
        c.ok(pg.locator('#sheet form[data-form=team-placement]').count()==1 and
             pg.locator('#sheet [name=phone]').count()==0 and
             pg.locator('#sheet [name=registration]').count()==0 and
             pg.locator('#sheet [name=payment]').count()==0 and
             'registration' in pg.locator('#sheet').inner_text().lower(),
             f'[{width}] placement form is narrow and does not expose protected or financial fields')
        # Cancel leaves the shared team unchanged.
        pg.locator('#sheet [data-act=close-sheet]').first.click()
        c.ok(pg.evaluate('window.__team.state.teamPlacementPending') is None and
             pg.evaluate('window.__team.data.teamPlacementEvents.length')==0,
             f'[{width}] cancel has no data effect')
        pg.locator(f'#view [data-act=team-placement-open][data-id="{pid}"]').click()
        pg.locator('#sheet [name=reason]').fill('Coaching group nominates player')
        pg.locator('#sheet form[data-form=team-placement] button[type=submit]').click()
        c.ok(pg.evaluate("""pid=>{
             const events=window.__team.data.teamPlacementEvents;
             return events.length===1&&events[0].playerId===pid&&
               events[0].state==='nominated'&&events[0].actorProfileId==='qa-09'&&
               events[0].role==='team_manager';
           }""",pid),f'[{width}] Manager nomination has exact role and player attribution')
        pg.locator(f'#view [data-act=team-placement-open][data-id="{pid}"]').click()
        c.ok(pg.locator('#sheet [name=action]').get_attribute('value')=='approve',
             f'[{width}] nominated player now requires explicit team approval')
        pg.locator('#sheet [name=reason]').fill('Manager confirms team acceptance')
        pg.locator('#sheet form[data-form=team-placement] button[type=submit]').click()
        c.ok(pg.evaluate("""pid=>{
          const a=window.__team.data.teamPlacementEvents;
          return a.length===2&&a[1].playerId===pid&&a[1].state==='team-approved'&&
            a.every(x=>x.scope==='fictional-team-preview'&&
              x.officialRegistrationVerified===false);
        }""",pid),f'[{width}] Manager self-approval audited separately from registration')

        # The Head Coach sees the exact same player/team decisions on the native screen.
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok(pg.evaluate("window.__team.data.id")=='qarangers16' and
             pg.locator(f'#view [data-act=team-placement-open][data-id="{pid}"][data-next=withdraw]').count()==1 and
             pg.locator('#view [data-act=edit-player]').count()>0,
             f'[{width}] Coach sees approved placement and retains original player editing')
        # Coaching changes to another player must not alter the approved one.
        other=pg.locator('#view [data-act=team-placement-open][data-next=nominate]').first
        other_pid=other.get_attribute('data-id')
        other.click()
        pg.locator('#sheet [name=reason]').fill('Coach nominates this player')
        pg.locator('#sheet form[data-form=team-placement] button[type=submit]').click()
        c.ok(pg.evaluate("""([first,second])=>{
          const x=window.__team.data.teamPlacementEvents;
          return x.length===3&&x[2].playerId===second&&x[2].actorProfileId==='qa-07'&&
            x.filter(e=>e.playerId===first).length===2;
        }""",[pid,other_pid]),f'[{width}] Coach nomination appends without changing another placement')

        # Club Admin can review placement status, but cannot record it or falsify fees.
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-04]')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        c.ok(pg.locator('#view .placement-preview').count()>0 and
             pg.locator('#view [data-act=team-placement-open]').count()==0 and
             pg.locator('#view [data-act=edit-player]').count()==0,
             f'[{width}] Club Admin review does not inherit team approval or Coach editing')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-19]')
        pg.evaluate(act,['team-placement-open',{'id':pid,'next':'withdraw'}])
        c.ok(pg.evaluate("document.querySelector('#sheet').hidden"),
             f'[{width}] revoked Coach cannot open or change team placement')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        c.ok(pg.locator('#view [data-act=team-placement-open]').count()==0,
             f'[{width}] Player receives no placement decision controls')
        pg.reload()
        pg.wait_for_selector('#home-profile-button')
        saved=pg.evaluate("""(pid)=>{
           const t=window.__team.M.teamsOf(window.__team.ws).find(x=>x.id==='qarangers16');
           return t?.teamPlacementEvents?.filter(x=>x.playerId===pid).map(x=>x.state);
        }""",pid)
        c.ok(saved==['nominated','team-approved'] and
             pg.locator('#view select[data-change=native-persona-team]').count()==0,
             f'[{width}] team placement history persists and original club selector is unchanged')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
