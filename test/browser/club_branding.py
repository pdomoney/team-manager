# Club-wide colour and logo inheritance, including legacy overrides and public player copies.
# Isolated synthetic browser data; no real GitHub publication.
import sys, os, base64
from harness import *
from playwright.sync_api import sync_playwright

build()
srv, url = serve()
c, errs = Check(), []
act = "([a, ds]) => { const b = document.createElement('button'); b.dataset.act = a; Object.assign(b.dataset, ds || {}); document.body.appendChild(b); b.click(); b.remove(); }"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_ = page(browser,url+'#home',width=width,height=860,errors=errs)
        pg.get_by_text('Load a sample squad').click()
        pg.wait_for_timeout(150)
        pg.evaluate("""() => {
          const x=window.__team, w=x.ws, M=x.M;
          const second=M.clone(x.data); second.id='second-sg'; second.team={
            ...second.team,name:'Second St George',clubId:'stgeorge',style:{palette:'bluegold'}
          };
          second.players=[];second.matches=[];second.sessions=[];
          M.addTeam(w,second);
          w.clubs.push(M.normClub({id:'other-club',name:'Other Club',sport:'Rugby league'}));
          const other=M.clone(second);other.id='other-team';other.team={
            ...other.team,name:'Other club squad',clubId:'other-club',style:{palette:'blackwhite'}
          };
          M.addTeam(w,other);
          x.data.team.style={palette:'navyred'};
        }""")
        pg.evaluate(act,['club-edit',{'id':'stgeorge'}])
        pg.wait_for_selector('#sheet form[data-form=club]')
        c.ok(pg.locator('#sheet [name=name]').input_value()=='St George Oztag'
             and pg.locator('#sheet input[data-change=club-logo]').count()==1
             and pg.locator('#sheet [name=teamStyle]').count()>3,
             f'[{width}] colours and logo now live together in Edit club')
        c.ok(not pg.locator('#sheet [name=applyAll]').is_checked(),
             f'[{width}] replacing team overrides requires explicit opt-in')
        pg.check('#sheet [name=applyAll]')
        pg.locator('#sheet .style-sw:has(input[value=maroon])').click()
        png = os.path.join(WORK,'club-brand-logo.png')
        os.makedirs(WORK,exist_ok=True)
        open(png,'wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='))
        pg.set_input_files('#sheet input[data-change=club-logo]',png)
        pg.wait_for_function("document.querySelector('#sheet [name=logo]').value.startsWith('data:image/')")
        pg.locator('#sheet form[data-form=club] button[type=submit]').click()
        pg.wait_for_timeout(160)
        state=pg.evaluate("""() => {
          const x=window.__team, w=x.ws;
          const st=w.clubs.find(c=>c.id==='stgeorge');
          return {club:st.style,logo:st.logo,primary:x.data.team.style,
            second:w.teams.find(t=>t.id==='second-sg')?.team.style,
            other:w.teams.find(t=>t.id==='other-team')?.team.style,
            current:x.data.id};
        }""")
        c.ok(state['club']=={'palette':'maroon'} and state['primary'] is None
             and state['second'] is None and state['other']=={'palette':'blackwhite'},
             f'[{width}] club applies to both own teams but leaves unrelated club alone')
        c.ok(state['logo'].startswith('data:image/'),
             f'[{width}] a single shared logo persists on the club')
        c.ok(pg.evaluate("getComputedStyle(document.querySelector('.top')).backgroundColor") == 'rgb(78, 11, 39)'
             and pg.locator('#team-crest img').count()==1,
             f'[{width}] current team immediately inherits club colours and crest')
        pg.evaluate(act,['team-pick',{'id':'second-sg'}])
        pg.wait_for_timeout(120)
        c.ok(pg.evaluate("getComputedStyle(document.querySelector('.top')).backgroundColor")=='rgb(78, 11, 39)'
             and pg.locator('#team-crest img').count()==1,
             f'[{width}] second club team inherits identical palette and logo')
        pg.evaluate(act,['preview-on',{}]);pg.wait_for_timeout(90)
        c.ok(pg.evaluate("getComputedStyle(document.querySelector('.top')).backgroundColor")=='rgb(78, 11, 39)'
             and pg.locator('#team-crest img').count()==1,
             f'[{width}] published player-style projection inherits club palette and crest')
        pg.evaluate(act,['preview-off',{}]);pg.wait_for_timeout(80)
        # One other club can be configured independently without clearing its team's override.
        pg.evaluate(act,['club-edit',{'id':'other-club'}])
        c.ok(pg.locator('#sheet [name=name]').input_value()=='Other Club',
             f'[{width}] Edit club selects only the chosen club')
        pg.locator('#sheet .style-sw:has(input[value=redwhite])').click()
        pg.uncheck('#sheet [name=applyAll]')
        pg.locator('#sheet form[data-form=club] button[type=submit]').click()
        state2=pg.evaluate("""() => {
          const w=window.__team.ws;
          return {first:w.clubs.find(c=>c.id==='stgeorge').style,
            other:w.clubs.find(c=>c.id==='other-club').style,
            existing:w.teams.find(t=>t.id==='other-team').team.style};
        }""")
        c.ok(state2['first']=={'palette':'maroon'} and state2['other']=={'palette':'redwhite'}
             and state2['existing']=={'palette':'blackwhite'},
             f'[{width}] preserving team overrides is scoped to the chosen club')
        pg.reload();pg.wait_for_function("window.__team && window.__team.ws");pg.wait_for_timeout(150)
        c.ok(pg.evaluate("window.__team.ws.clubs.find(c=>c.id==='stgeorge').style.palette")=='maroon'
             and pg.evaluate("window.__team.ws.clubs.find(c=>c.id==='stgeorge').logo.startsWith('data:image/')"),
             f'[{width}] club colours and logo survive reload')
        c.ok(pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
             f'[{width}] branding controls do not create horizontal scroll')
        ctx.close()
    ok=c.done(errs);browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
