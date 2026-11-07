# Team-selected Home scope narrows Match staff while club/all scopes retain
# directory administration. Attendance history is reached through More → Reports.
# Synthetic library only, 390px mobile and 1280px desktop; not physical Safari.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errors=Check(),[]

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.locator('#view [data-act=test-library]').click()
        pg.wait_for_function('window.__team.ws?.testLibrary?.version >= 3')
        pg.goto(url+'#crew')
        pg.wait_for_selector('#view .crew-readiness-summary')
        c.ok(pg.locator('#view .crew-readiness-summary[data-scope=club]').count()==1
             and pg.locator('#view .crew-directory-picker').count()==1
             and pg.locator('#view .crew-workspace-overview').count()==1,
             f'[{width}] existing all-club Home scope retains club staffing administration')

        # Explicitly choose Titans then a single team in the native Home selector.
        pg.goto(url+'#home')
        pg.locator('#view .scope-club[data-id=tarenpointtitans]').click()
        pg.locator('#view .scope-team[data-id=testtitans]').click()
        c.ok(pg.evaluate("window.__team.data.id")=='testtitans'
             and pg.evaluate("JSON.parse(localStorage.getItem('tm-home-scope')).kind")=='team',
             f'[{width}] Home persists an explicit selected Titans team')
        pg.goto(url+'#crew')
        pg.wait_for_selector('#view .crew-readiness-summary')
        counts=pg.evaluate("""() => {
          const t=window.__team.data;
          return t.matches.filter(m=>m.id && m.status!=='cancelled').length;
        }""")
        summary=pg.locator('#view .crew-readiness-summary').inner_text()
        rows=pg.locator('#view .crew-directory-results').inner_text()
        c.ok(pg.locator('#view .crew-readiness-summary[data-scope=team]').count()==1
             and f'{counts} fixtures' in summary
             and 'Fixture readiness · Team' in pg.locator('#view .crew-readiness-summary h3').inner_text()
             and pg.locator('#view .crew-workspace-overview').count()==0,
             f'[{width}] readiness counts only the selected team, not other Titans fixtures')
        c.ok('Alex Sample' in rows and 'Morgan Example' in rows
             and 'Chris Example' not in rows and 'Ben Okafor' not in rows
             and pg.locator('#view .crew-appointment-panel').count()==0
             and pg.locator('#view .crew-directory-picker').count()==0,
             f'[{width}] selected team volunteers exclude other team and club-only staff')
        c.ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
             f'[{width}] team staff layout fits mobile and desktop')

        pg.goto(url+'#home')
        pg.locator('#view .scope-team[data-id=testleague]').click()
        pg.goto(url+'#crew')
        rows=pg.locator('#view .crew-directory-results').inner_text()
        c.ok('Chris Example' in rows and 'Riley Example' in rows
             and 'Alex Sample' not in rows and 'Morgan Example' not in rows,
             f'[{width}] changing Home team also changes match staff people')
        pg.goto(url+'#home')
        pg.locator('#view .scope-club[data-id=tarenpointtitans]').click()
        pg.goto(url+'#crew')
        c.ok(pg.locator('#view .crew-readiness-summary[data-scope=club]').count()==1
             and pg.locator('#view .crew-directory-picker').count()==1
             and pg.locator('#view .crew-appointment-panel').count()==1
             and 'Ben Okafor' in pg.locator('#view .crew-directory-results').inner_text(),
             f'[{width}] selecting Home club restores the full club directory and appointments')

        # Attendance report moved from Schedule, without removing roll-call entry.
        pg.goto(url+'#home')
        pg.locator('#view .scope-club[data-kind=all]').click()
        pg.locator('#view .scope-team[data-id=team1]').click()
        pg.goto(url+'#training')
        c.ok(pg.locator('#view .subnav [data-tab=attendance]').count()==0
             and pg.locator('#view [data-act=roll]').count()>0,
             f'[{width}] Schedule no longer has an Attendance tab but retains roll-call controls')
        pg.goto(url+'#reports')
        pg.wait_for_selector('#view [data-tab=attendance]')
        pg.locator('#view [data-tab=attendance]').click()
        c.ok(pg.locator('#view h2',has_text='Player attendance').count()>0
             and pg.locator('#view .bar-row').count()>0
             and 'Roll calls taken' in pg.locator('#view').inner_text()
             and pg.evaluate("location.hash")=='#attendance',
             f'[{width}] Reports opens full player attendance history on same selected team')
        pg.locator('#view [data-tab=reports]').click()
        c.ok(pg.evaluate("location.hash")=='#reports'
             and pg.locator('#view [data-tab=attendance]').count()==1,
             f'[{width}] attendance returns to existing Reports page')
        pg.goto(url+'#attendance')
        c.ok(pg.locator('#view h2',has_text='Player attendance').count()>0
             and pg.locator('#view .subnav [data-tab=attendance]').count()==0,
             f'[{width}] saved attendance deep link remains valid without a Schedule tab')
        ctx.close()
    ok=c.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
