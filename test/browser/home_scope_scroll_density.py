# iPhone-width Home selectors must not visually jump back to the first chip
# after a team changes. Match staff must show useful information before
# non-essential club-wide explanation while preserving all source records.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
checks,errors=Check(),[]
act="([name,values])=>{const b=document.createElement('button');b.dataset.act=name;Object.assign(b.dataset,values||{});document.body.appendChild(b);b.click();b.remove();}"

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,512,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        pg.evaluate(act,['test-library',{}])
        pg.wait_for_function("window.__team.ws?.clubs?.some(c=>c.id==='tarenpointtitans')")
        stable="async () => (await import('./test-library.js')).stable(window.__team.ws)"
        source=pg.evaluate(stable)

        def visible_selection(kind):
            return pg.evaluate("""kind => {
              const row=document.querySelector(kind==='team'?'#view .scope-row.teams':'#view .scope-row:not(.teams)');
              const el=row?.querySelector('[aria-pressed=true]') ||
                row?.querySelector('.scope-team.editing') || row?.querySelector('.scope-club[data-open]');
              if(!row||!el)return null;
              const a=row.getBoundingClientRect(),b=el.getBoundingClientRect();
              return {visible:b.left>=a.left-2&&b.right<=a.right+2,
                left:row.scrollLeft,max:row.scrollWidth-row.clientWidth,
                name:el.dataset.id||el.dataset.kind||''};
            }""",kind)

        pg.locator('#view .scope-club[data-id=tarenpointtitans]').click()
        club=visible_selection('club')
        checks.ok(bool(club) and club['visible'] and club['name']=='tarenpointtitans',
                  f'[{width}] choosing Titans brings its club chip into view')

        # Last Titans team is to the right of the horizontally clipped chips.
        pg.locator('#view .scope-team[data-id=testtitansmixed10]').click()
        team=visible_selection('team')
        checks.ok(bool(team) and team['visible'] and team['name']=='testtitansmixed10'
                  and (width>=1000 or team['left']>1)
                  and pg.evaluate('window.__team.data.id')=='testtitansmixed10',
                  f'[{width}] selected late-row team stays visible after full Home rerender')
        checks.ok('Titans Under 10' in pg.locator('#team-title').inner_text(),
                  f'[{width}] banner follows the selected team')

        # Scrolling manually is respected when an unrelated Home filter changes.
        pg.evaluate("""() => {const row=document.querySelector('.scope-row.teams');
          row.scrollLeft=Math.max(0,row.scrollWidth-row.clientWidth-43);
        }""")
        previous=pg.evaluate("document.querySelector('.scope-row.teams').scrollLeft")
        pg.evaluate(act,['home-days',{'v':'30'}])
        latest=pg.evaluate("document.querySelector('.scope-row.teams').scrollLeft")
        checks.ok(abs(latest-previous)<3,
                  f'[{width}] Home rerender preserves manual team-row position for same selection')

        for id,name in [
          ('testtitansgirls12','Titans Under 12'),
          ('testleague','Titans Under 16'),
          ('testtitans','Titans Open Women')]:
            pg.locator(f'#view .scope-team[data-id={id}]').click()
            team=visible_selection('team')
            checks.ok(bool(team) and team['visible'] and team['name']==id
                      and pg.evaluate('window.__team.data.id')==id
                      and name in pg.locator('#team-title').inner_text(),
                      f'[{width}] team {id} remains visible and its banner follows the choice')
        pg.locator('#view .scope-club[data-id=penrithoztag]').click()
        checks.ok(visible_selection('club')['name']=='penrithoztag'
                  and visible_selection('club')['visible'],
                  f'[{width}] horizontal club selector follows Penrith without vertical scrolling')
        pg.locator('#view .scope-club[data-id=tarenpointtitans]').click()
        checks.ok(visible_selection('club')['name']=='tarenpointtitans'
                  and visible_selection('club')['visible'],
                  f'[{width}] choosing Titans again restores the visible club chip')

        # Enter a club-wide staff view. The directory should precede the
        # secondary comparison, and review lists start collapsed.
        pg.evaluate(act,['tab',{'tab':'crew'}])
        pg.wait_for_selector('#view .crew-directory-results')
        dir_panel=pg.locator('#view #crew-directory-section')
        overview=pg.locator('#view .crew-workspace-overview')
        actions=pg.locator('#view .crew-action-details')
        checks.ok(pg.locator('#view .crew-readiness-summary[data-scope=club]').count()==1
                  and 'fixtures' in pg.locator('#view .crew-readiness-figures').inner_text()
                  and 'not independently verified' in pg.locator('#view .crew-readiness-caution').inner_text(),
                  f'[{width}] compact club readiness remains visible with caution')
        checks.ok(overview.count()==1 and not overview.get_attribute('open')
                  and dir_panel.evaluate("""el => Boolean(
                    el.compareDocumentPosition(document.querySelector('.crew-workspace-overview'))
                      & Node.DOCUMENT_POSITION_FOLLOWING)"""),
                  f'[{width}] club comparison is closed and below useful volunteer records')
        checks.ok(actions.count()==1 and not actions.get_attribute('open')
                  and 'Actions to review' in actions.locator('summary').inner_text(),
                  f'[{width}] many fixture actions use an accessible collapsed disclosure')
        if width<=512:
            top=dir_panel.evaluate('el=>el.getBoundingClientRect().top')
            checks.ok(top<860,
                      f'[{width}] volunteer directory starts within the first phone screen: top {top}')
        actions.locator('summary').click()
        action_total=int(actions.locator('summary').inner_text().rsplit('(',1)[1].rstrip(')'))
        checks.ok(actions.get_attribute('open') is not None
                  and action_total>12
                  and actions.locator('li').count()==action_total,
                  f'[{width}] expanding actions reveals all {action_total} recorded items')
        overview.locator('summary').click()
        checks.ok('not an association-wide directory' in overview.inner_text()
                  and 'Taren Point Titans' in overview.inner_text(),
                  f'[{width}] club comparison and source caveat remain accessible')
        overview.locator('[name=crewOverviewSport]').select_option('Rugby league')
        checks.ok(overview.get_attribute('open') is not None
                  and actions.get_attribute('open') is not None,
                  f'[{width}] changing sport keeps open disclosures open')
        pg.evaluate(act,['tab',{'tab':'home'}])
        pg.locator('#view .scope-team[data-id=testleague]').click()
        pg.evaluate(act,['tab',{'tab':'crew'}])
        checks.ok(pg.locator('#view .crew-readiness-summary[data-scope=team]').count()==1
                  and pg.locator('#view .crew-workspace-overview').count()==0
                  and 'Riley Example' in pg.locator('#view .crew-directory-results').inner_text(),
                  f'[{width}] team-specific staffing is not replaced by club-wide comparison')
        checks.ok(pg.evaluate(stable)==source,
                  f'[{width}] all UX changes leave the test library records unchanged')
        checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
                  f'[{width}] no horizontal page overflow')
        ctx.close()
    ok=checks.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
