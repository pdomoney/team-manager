# M2.1: team-only, fictional Squad intake review at phone and desktop sizes.
# Placement is not external registration, fee clearance or match eligibility.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
checks, errors = Check(), []
act = "([name,values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove()}"

def choose(pg,profile):
    pg.evaluate(act,['tab',{'tab':'home'}])
    pg.click('#home-profile-button')
    pg.click(f'#home-profile-panel [data-profile="{profile}"]')

def stage(pg,ident):
    return pg.locator(f'#view .roster-intake [data-filter="{ident}"]')

def count(pg,ident):
    return int(stage(pg,ident).inner_text().rsplit('(',1)[-1].rstrip(')'))

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=844,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        baseline=pg.evaluate('JSON.stringify(window.__team.ws)')
        choose(pg,'qa-09')
        pg.locator('#view .scope-club[data-id=qa-rangers]').click()
        pg.evaluate(act,['tab',{'tab':'squad'}])
        panel=pg.locator('#view .roster-intake[data-team-id=qarangers16]')
        total=pg.evaluate('window.__team.data.players.length')
        checks.ok(panel.count()==1 and count(pg,'all')==total
                  and count(pg,'not-nominated')==total
                  and count(pg,'nominated')==0
                  and stage(pg,'all').get_attribute('aria-pressed')=='true',
                  f'[{width}] Manager sees exact-team initial intake counts, no inferred approvals')
        checks.ok('registration' in panel.inner_text().lower()
                  and 'eligibility' in panel.inner_text().lower()
                  and pg.locator('#view .roster-intake [data-act=roster-intake-filter]').count()==5,
                  f'[{width}] intake does not imply external verification or extra stages')
        button=stage(pg,'nominated')
        checks.ok(button.is_enabled() and button.bounding_box()['height']>=44,
                  f'[{width}] fictional Manager has touch-sized review filters')
        button.click()
        checks.ok(stage(pg,'nominated').get_attribute('aria-pressed')=='true'
                  and pg.locator('#squad-list .placement-row').count()==0
                  and pg.evaluate("""() => document.activeElement?.dataset.filter==='nominated'"""),
                  f'[{width}] empty nominated filter preserves keyboard focus and status')
        stage(pg,'not-nominated').click()
        checks.ok(pg.locator('#squad-list .placement-row').count()==total
                  and stage(pg,'not-nominated').get_attribute('aria-pressed')=='true',
                  f'[{width}] needs-nomination filter shows current team only')
        first=pg.locator('#squad-list [data-act=team-placement-open]').first
        pid=first.get_attribute('data-id')
        first.click()
        pg.locator('#sheet [name=reason]').fill('Manager nominates fictional player')
        pg.locator('#sheet form[data-form=team-placement] button[type=submit]').click()
        checks.ok(count(pg,'not-nominated')==total-1
                  and count(pg,'nominated')==1
                  and pg.locator('#squad-list .placement-row').count()==total-1,
                  f'[{width}] nomination updates filters from existing audited event')
        stage(pg,'nominated').click()
        checks.ok(pg.locator('#squad-list .placement-row').count()==1
                  and pg.locator(f'#squad-list [data-act=team-placement-open][data-id="{pid}"][data-next=approve]').count()==1,
                  f'[{width}] nominated queue identifies exact player for team-only approval')
        pg.locator(f'#squad-list [data-act=team-placement-open][data-id="{pid}"]').click()
        pg.locator('#sheet [name=reason]').fill('Manager approves team placement')
        pg.locator('#sheet form[data-form=team-placement] button[type=submit]').click()
        checks.ok(count(pg,'nominated')==0 and count(pg,'team-approved')==1
                  and pg.locator('#squad-list .placement-row').count()==0
                  and pg.evaluate("""pid=>{
                    const events=window.__team.data.teamPlacementEvents.filter(e=>e.playerId===pid);
                    return events.length===2 && events.every(e=>e.officialRegistrationVerified===false)
                      && events.at(-1).state==='team-approved'
                      && events.at(-1).role==='team_manager';
                  }""",pid),
                  f'[{width}] team approval is audited but not registration or eligibility')

        # A different team must not inherit this team's intake filter or events.
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.locator('#view .scope-club[data-id=qa-comets]').click()
        pg.evaluate(act,['tab',{'tab':'squad'}])
        checks.ok(pg.evaluate('window.__team.data.id')=='qacometsmixed'
                  and pg.locator('#view .roster-intake[data-team-id=qacometsmixed]').count()==1
                  and stage(pg,'all').get_attribute('aria-pressed')=='true'
                  and count(pg,'team-approved')==0,
                  f'[{width}] changing teams resets stage filter and never leaks approvals')
        # Synthetic out-of-scope and detached controls are refused.
        before_filter=pg.evaluate('JSON.stringify(window.__team.state.squadIntakeFilter)')
        pg.evaluate(act,['roster-intake-filter',{'filter':'team-approved'}])
        checks.ok(pg.evaluate('JSON.stringify(window.__team.state.squadIntakeFilter)')==before_filter,
                  f'[{width}] fabricated detached intake action cannot set filter')

        # Coach sees the same recorded decision for exact team; no re-entry.
        choose(pg,'qa-07')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        checks.ok(pg.evaluate('window.__team.data.id')=='qarangers16'
                  and count(pg,'team-approved')==1
                  and pg.locator('#view [data-act=edit-player]').count()>0,
                  f'[{width}] Coach reviews existing Manager approval and retains player editing')

        # Club Admin can view team placement but cannot nominate/approve it.
        choose(pg,'qa-04')
        pg.evaluate(act,['tab',{'tab':'squad'}])
        checks.ok(panel.count()==1
                  and count(pg,'team-approved')==1
                  and pg.locator('#view [data-act=team-placement-open]').count()==0
                  and stage(pg,'team-approved').is_enabled(),
                  f'[{width}] Club Admin can inspect, not alter team approval')
        stage(pg,'team-approved').click()
        checks.ok(pg.locator('#squad-list .placement-row').count()==1,
                  f'[{width}] Club Admin scoped team-approved filter works read-only')

        for ident in ('qa-14','qa-16','qa-19'):
            choose(pg,ident)
            pg.evaluate(act,['tab',{'tab':'squad'}])
            checks.ok(pg.locator('#view .roster-intake').count()==0
                      and pg.locator('#view [data-act=roster-intake-filter]').count()==0
                      and pg.locator('#view [data-act=team-placement-open]').count()==0,
                      f'[{width}] {ident} Player Guardian or revoked Coach sees no intake controls')
        # QA decisions were the only roster mutation, not player records.
        saved=pg.evaluate("""() => {
          const t=window.__team.M.teamsOf(window.__team.ws).find(x=>x.id==='qarangers16');
          return {events:t.teamPlacementEvents,players:t.players};
        }""")
        checks.ok(len(saved['events'])==2
                  and all(row['officialRegistrationVerified'] is False for row in saved['events'])
                  and all(p['id']!=pid or p['name'] for p in saved['players'])
                  and pg.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),
                  f'[{width}] only fictional team events persist and page fits viewport')
        ctx.close()
    result=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if result else 1)
