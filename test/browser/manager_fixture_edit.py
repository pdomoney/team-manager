# P12 fictional Manager: edit an assigned fixture via the ORIGINAL Matches screen.
# Do not infer production authorization from these client-side preview gates.
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
        c.ok(pg.evaluate('window.__team.data.id')=='qarangers16' and
             pg.locator('#view [data-act=manager-fixture-open]').count()>=1 and
             pg.locator('#view [data-act=match-new]').is_disabled(),
             f'[{width}] Manager gets schedule-only fixture action, not Coach match creation')

        # A forged call to open an unassigned club's match must do nothing.
        pg.evaluate(act,['manager-fixture-open',{'id':'match-qa-stars-open'}])
        c.ok(pg.evaluate("document.querySelector('#sheet').hidden"),
             f'[{width}] cross-team forged Manager fixture open is blocked')
        match_id=pg.evaluate('window.__team.data.matches[0].id')
        before=pg.evaluate("""id => {
          const m=window.__team.data.matches.find(x=>x.id===id);
          return {start:m.start,venue:m.venue,status:m.status,opponent:m.opponent,
            result:JSON.stringify(m.result),rsvp:JSON.stringify(m.rsvp),
            lineupId:m.lineupId,seasonId:m.seasonId,coachNotes:m.coachNotes,
            revisions:(m.fixtureRevisions||[]).length};
        }""",match_id)
        pg.locator(f'#view [data-act=manager-fixture-open][data-id="{match_id}"]').first.click()
        c.ok(pg.locator('#sheet form[data-form=manager-fixture]').count()==1 and
             pg.locator('#sheet form[data-form=match]').count()==0 and
             pg.locator('#sheet [name=coachNotes]').count()==0 and
             pg.locator('#sheet [name=status]').count()==0,
             f'[{width}] Manager form contains scheduling only, no Coach notes or result')

        # Explicit review and cancel must not write the fixture.
        pg.locator('#sheet [name=start]').fill('11:15')
        pg.locator('#sheet [name=venue]').fill('Example Alternate Ground')
        pg.locator('#sheet [name=reason]').fill('Organiser moved the kickoff')
        pg.locator('#sheet form[data-form=manager-fixture] button[type=submit]').click()
        c.ok(pg.locator('#sheet [data-act=manager-fixture-confirm]').count()==1 and
             pg.evaluate('window.__team.data.matches[0].start')==before['start'],
             f'[{width}] Manager fixture review shows before saving and does not mutate')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        c.ok(pg.evaluate('window.__team.data.matches[0].start')==before['start'] and
             pg.evaluate('window.__team.state.managerFixturePending') is None,
             f'[{width}] cancel clears pending edit and leaves source fixture unchanged')

        # Confirm produces an auditable revision on the SAME native team fixture.
        pg.locator(f'#view [data-act=manager-fixture-open][data-id="{match_id}"]').first.click()
        pg.locator('#sheet [name=start]').fill('11:15')
        pg.locator('#sheet [name=venue]').fill('Example Alternate Ground')
        pg.locator('#sheet [name=reason]').fill('Organiser moved the kickoff')
        pg.locator('#sheet form[data-form=manager-fixture] button[type=submit]').click()
        pg.locator('#sheet [data-act=manager-fixture-confirm]').click()
        after=pg.evaluate("""id => {
          const m=window.__team.data.matches.find(x=>x.id===id);
          return {start:m.start,venue:m.venue,status:m.status,opponent:m.opponent,
            result:JSON.stringify(m.result),rsvp:JSON.stringify(m.rsvp),
            lineupId:m.lineupId,seasonId:m.seasonId,coachNotes:m.coachNotes,
            revisions:(m.fixtureRevisions||[]).length,
            reason:(m.fixtureRevisions||[]).at(-1)?.reason};
        }""",match_id)
        c.ok(after['start']=='11:15' and after['venue']=='Example Alternate Ground' and
             after['revisions']==before['revisions']+1 and
             after['reason']=='Organiser moved the kickoff',
             f'[{width}] Manager confirmation saves scheduled values and revision reason')
        c.ok(all(after[k]==before[k] for k in
                 ['status','opponent','result','rsvp','lineupId','seasonId','coachNotes']),
             f'[{width}] fixture-only edit preserves result, roster links and Coach data')

        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-07]')
        c.ok(pg.evaluate('window.__team.data.id')=='qarangers16' and
             pg.evaluate('window.__team.data.matches[0].start')=='11:15' and
             pg.locator('#view [data-act=manager-fixture-open]').count()==0,
             f'[{width}] Coach sees Manager change in shared team, not Manager-only controls')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-19]')
        c.ok(pg.locator('#view [data-act=manager-fixture-open]').count()==0 and
             pg.evaluate('window.__team.state.tab')=='home',
             f'[{width}] revoked role cannot edit fixtures')
        pg.click('#home-profile-button')
        pg.click('#home-profile-panel [data-profile=qa-14]')
        pg.evaluate(act,['tab',{'tab':'matches'}])
        c.ok(pg.locator('#view [data-act=manager-fixture-open]').count()==0 and
             pg.evaluate("document.querySelector('#sheet').hidden"),
             f'[{width}] Player cannot see Manager fixture controls')

        pg.reload();pg.wait_for_selector('#home-profile-button')
        saved=pg.evaluate("""() => window.__team.M.teamsOf(window.__team.ws)
          .find(t=>t.id==='qarangers16')?.matches[0]?.start""")
        c.ok(saved=='11:15' and
             pg.locator('#view select[data-change=native-persona-team]').count()==0,
             f'[{width}] shared revision persists across reload with original navigation')
        ctx.close()
    result=c.done(errors);browser.close()
srv.shutdown();sys.exit(0 if result else 1)
