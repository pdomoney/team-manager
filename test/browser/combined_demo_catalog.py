# One sandbox catalogue on phone and desktop: seven clubs, 26 fictional
# teams, original Oztag plays, persisted Safari-local records and role boundaries.
# Emulates the two previously separate browser-local workspaces, never live data.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errors=Check(),[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
club_ids={'qa-comets','qa-stars','qa-rangers','stgeorge','penrithoztag','engadinedragons','tarenpointtitans'}
scope="() => {const w=window.__team.ws,m=window.__team.M;return {clubs:w.clubs.map(c=>c.id),teams:m.teamsOf(w).map(t=>t.id),library:w.library.plays.map(x=>x.id),root:w.id,combined:w.testLibrary?.combinedCatalog};}"

with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'?sandbox=1#home',width=width,height=860,errors=errors)
        pg.wait_for_selector('#home-profile-button')
        fresh=pg.evaluate(scope)
        c.ok(set(fresh['clubs'])==club_ids and len(fresh['teams'])==26
             and len(set(fresh['teams']))==26 and fresh['combined']==1,
             f'[{width}] fresh sandbox has all seven clubs and 26 distinct teams')
        c.ok(pg.locator('#view .scope-club[data-id=tarenpointtitans]').count()==1
             and pg.locator('#view .scope-club[data-id=qa-comets]').count()==1
             and pg.locator('#view .scope-club[data-id=stgeorge]').count()==1,
             f'[{width}] Owner Home shows both sets of clubs in one selector')
        c.ok(pg.evaluate("""() => {
          const m=window.__team.M,w=window.__team.ws;
          return m.findTeam(w,'team1').plays.some(p=>p.id==='quickie-out') &&
            m.findTeam(w,'qacometsmixed').plays.some(p=>p.id==='quickie-in');
        }"""),f'[{width}] original built-in Oztag plays retained on both source teams')

        # Simulate an old Safari copy that knows ONLY the Comets/Rangers/Stars.
        # Saved edited plays and shared-library entries must survive the upgrade.
        pg.evaluate("""() => {
          const w=structuredClone(window.__team.ws);
          w.teams=w.teams.filter(t=>t.id.startsWith('qa'));
          w.clubs=w.clubs.filter(c=>c.id.startsWith('qa-'));
          w.competitions=[];w.matchOfficials=[];w.volunteerAppointments=[];
          w.testLibrary={version:3,day:'2026-11-07'};
          w.plays.push({id:'qa-custom-keep',name:'Saved QA tactic',
            sport:'Oztag',builtin:false,category:'Other',steps:'Custom steps'});
          w.library.plays.push({id:'private-play-keep',name:'Saved shared play',
            sport:'Oztag',category:'Other',steps:'Do not overwrite',rev:1});
          localStorage.setItem('tm-persona-sandbox-v1',JSON.stringify(w));
          localStorage.setItem('tm-persona-sandbox-team','qacometsmixed');
        }""")
        pg.reload();pg.wait_for_selector('#home-profile-button')
        legacy=pg.evaluate(scope)
        c.ok(set(legacy['clubs'])==club_ids and len(legacy['teams'])==26
             and legacy['root']=='qacometsmixed' and legacy['combined']==1
             and 'private-play-keep' in legacy['library'],
             f'[{width}] old Safari QA-only copy adds sporting clubs without replacing root or shared play')
        c.ok(pg.evaluate("""() => {
          const w=window.__team.ws;
          return w.plays.some(p=>p.id==='qa-custom-keep' && p.steps==='Custom steps') &&
            w.library.plays.some(p=>p.id==='private-play-keep' &&
              p.steps==='Do not overwrite');
        }"""),f'[{width}] older saved team play and shared library item survive')
        pg.reload();pg.wait_for_selector('#home-profile-button')
        twice=pg.evaluate(scope)
        c.ok(len(twice['teams'])==26 and len(set(twice['teams']))==26
             and len(twice['clubs'])==7 and 'private-play-keep' in twice['library'],
             f'[{width}] repeated Safari refresh is idempotent and keeps saved plays')

        # Simulate the other old browser: real-club eight-team test library,
        # including an extra custom library item.
        pg.evaluate("""() => {
          const w=structuredClone(window.__team.ws);
          const all=[w,...w.teams],root=all.find(t=>t.id==='team1');
          const only={...w,...root,id:root.id,team:root.team,
            teams:all.filter(t=>t.id!=='team1'&&!t.id.startsWith('qa')),
            clubs:w.clubs.filter(c=>!c.id.startsWith('qa-')),
            testLibrary:{version:3,day:'2026-11-07'}};
          only.library.plays.push({id:'real-custom-keep',name:'Saved St George tactic',
            sport:'Oztag',category:'Other',steps:'Preserve this play',rev:1});
          localStorage.setItem('tm-persona-sandbox-v1',JSON.stringify(only));
          localStorage.setItem('tm-persona-sandbox-team','team1');
        }""")
        pg.reload();pg.wait_for_selector('#home-profile-button')
        real=pg.evaluate(scope)
        c.ok(set(real['clubs'])==club_ids and len(real['teams'])==26
             and real['root']=='team1' and 'real-custom-keep' in real['library'],
             f'[{width}] old four-club copy also adds missing QA fixtures and retains library')

        # A separate private or unmarked workspace is not silently converted.
        pg.evaluate("""() => {
          const w=structuredClone(window.__team.ws);
          w.testLibrary=null;w.teams=[];
          w.clubs=w.clubs.filter(c=>c.id==='stgeorge');
          localStorage.setItem('tm-persona-sandbox-v1',JSON.stringify(w));
        }""")
        pg.reload();pg.wait_for_selector('#home-profile-button')
        unknown=pg.evaluate(scope)
        c.ok(len(unknown['teams'])==1 and unknown['root']=='team1'
             and unknown['clubs']==['stgeorge'] and unknown.get('combined') is None,
             f'[{width}] unmarked local workspace is never auto-seeded or overwritten')
        c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
             f'[{width}] combined catalogue does not cause page overflow')
        ctx.close()
    ok=c.done(errors)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
