# PR152: Manager records availability in the original native Matches UI, not a QA dashboard.
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
        pg.evaluate(act,['tab',{'tab':'matches'}])
        match_id=pg.evaluate("window.__team.data.matches[0].id")
        before=pg.evaluate("JSON.stringify(window.__team.data)")
        c.ok(pg.evaluate("window.__team.data.id")=='qarangers16' and
             pg.locator('#view [data-act=manager-availability-open]').count()>0,
             f'[{width}] Manager can record replies on assigned scheduled fixture')
        card=pg.locator(f'#view .m-card.has-manager-actions:has([data-act=manager-availability-open][data-id="{match_id}"])').first
        main_box=card.locator('.sess-main').bounding_box()
        action_box=card.locator('.manager-match-actions').bounding_box()
        c.ok(main_box and action_box and action_box['y']>=main_box['y']+main_box['height']-3
             and action_box['x']>=0 and action_box['x']+action_box['width']<=width+2,
             f'[{width}] Manager action buttons sit below match details without horizontal overflow')
        c.ok(pg.locator('#view [data-act=rsvp-open]').count()==0 and
             pg.locator('#view [data-act=match-new]').is_disabled(),
             f'[{width}] Manager has no normal Coach RSVP or match-creation actions')

        # Other-club match ID can never open the Manager reply sheet.
        pg.evaluate(act,['manager-availability-open',{'id':'match-qa-stars-open'}])
        c.ok(pg.evaluate("document.querySelector('#sheet').hidden"),
             f'[{width}] other-club fixture cannot be opened for replies')

        pg.locator(f'#view [data-act=manager-availability-open][data-id="{match_id}"]').first.click()
        panel=pg.locator('#sheet .manager-availability')
        c.ok(panel.count()==1 and
             pg.locator('#sheet .roll-row').count()>=10 and
             pg.locator('#sheet input[name=phone]').count()==0 and
             pg.locator('#sheet [name=coachNotes]').count()==0 and
             pg.locator('#sheet [data-act=rsvp-ask]').count()==0,
             f'[{width}] Manager sheet shows scoped player names and replies only')
        player_id=pg.locator('#sheet .roll-row').first.get_attribute('data-player-id')
        yes=pg.locator(f'#sheet .roll-row[data-player-id="{player_id}"] [data-v=yes]')
        yes.click()
        state=pg.evaluate("""([mid,pid])=>{
          const m=window.__team.data.matches.find(x=>x.id===mid);
          return {v:window.__team.M.rsvpOf(m,pid),
            entry:m.rsvp[pid],result:JSON.stringify(m.result),lineup:m.lineupId};
        }""",[match_id,player_id])
        c.ok(state['v']=='yes' and
             state['entry']['via']=='fictional-team-manager-preview' and
             state['entry']['actorProfileId']=='qa-09' and
             pg.locator(f'#sheet .roll-row[data-player-id="{player_id}"] [data-v=yes]').get_attribute('aria-pressed')=='true',
             f'[{width}] Manager writes attributed RSVP in shared native match and updates control')
        c.ok(pg.evaluate("window.__team.data.matches[0].status")=='scheduled' and
             state['result']==pg.evaluate("JSON.stringify(window.__team.data.matches[0].result)"),
             f'[{width}] Manager RSVP does not affect match result or status')

        # A fabricated button outside the pinned reply sheet cannot change a player.
        pg.evaluate(act,['manager-availability-reply',{'id':match_id,'pid':player_id,'v':'no'}])
        c.ok(pg.evaluate("(pid)=>window.__team.M.rsvpOf(window.__team.data.matches[0],pid)",player_id)=='yes',
             f'[{width}] forged RSVP button outside pinned sheet is rejected')
        # An invalid player identifier must never become an RSVP entry.
        pg.evaluate(act,['manager-availability-reply',{'id':match_id,'pid':'unassigned-outsider','v':'yes'}])
        c.ok(pg.evaluate("!Object.hasOwn(window.__team.data.matches[0].rsvp,'unassigned-outsider')"),
             f'[{width}] unassigned player cannot be recorded')

        yes=pg.locator(f'#sheet .roll-row[data-player-id="{player_id}"] [data-v=yes]')
        yes.click()
        c.ok(pg.evaluate("(pid)=>window.__team.M.rsvpOf(window.__team.data.matches[0],pid)",player_id)=='',
             f'[{width}] tapping selected answer clears exactly that reply')
        pg.locator(f'#sheet .roll-row[data-player-id="{player_id}"] [data-v=maybe]').click()
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        c.ok(pg.evaluate('window.__team.state.managerAvailability') is None and
             pg.evaluate("(pid)=>window.__team.M.rsvpOf(window.__team.data.matches[0],pid)",player_id)=='maybe',
             f'[{width}] Manager sheet closes and preserves shared RSVP')

        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.evaluate("window.__team.data.id")=='qarangers16' and
             pg.evaluate("(pid)=>window.__team.M.rsvpOf(window.__team.data.matches[0],pid)",player_id)=='maybe',
             f'[{width}] Coach sees exactly the Manager-recorded RSVP on same team')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok(pg.locator('#view [data-act=manager-availability-open]').count()==0 and
             pg.locator('#view [data-act=match-open]').count()>0,
             f'[{width}] Coach retains original match actions without Manager-specific buttons')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok(pg.locator('#view [data-act=manager-availability-open]').count()==0 and
             pg.locator('#sheet .manager-availability').count()==0,
             f'[{width}] Player cannot open Manager reply sheet')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-20]')
        c.ok(pg.locator('#view [data-act=manager-availability-open]').count()==0,
             f'[{width}] pending invitation cannot record availability')

        pg.reload()
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.wait_for_selector('#home-profile-button')
        saved=pg.evaluate("""([mid,pid])=>{
           const t=window.__team.M.teamsOf(window.__team.ws).find(x=>x.id==='qarangers16');
           const m=t?.matches.find(x=>x.id===mid);return m?.rsvp?.[pid];
        }""",[match_id,player_id])
        c.ok(saved and saved['v']=='maybe' and saved['via']=='fictional-team-manager-preview' and
             pg.locator('#view select[data-change=native-persona-team]').count()==0,
             f'[{width}] manager RSVP persists in shared fictional team without extra team dropdown')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
