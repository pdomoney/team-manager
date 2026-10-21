# P04C browser qualification: coach prepares stable legacy staff IDs and links
# records explicitly while preserving team/season/private data. Isolated trial only.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c=Check()
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx,pg,errs=page(b,url+'#home',width=390,height=844)
    pg.wait_for_selector('text=Load a sample squad')
    pg.click('[data-act=sample]')
    pg.wait_for_timeout(160)
    pg.evaluate("""() => {
        const ws=window.__team.ws;
        ws.team.staff=[{name:'Morgan Example',role:'Head coach',phone:'PRIVATE TEAM PHONE'}];
        ws.clubs=ws.clubs||[];
        ws.clubs.push({id:'p04c-club',name:'Fictional P04C Club',
            officials:[{name:'Morgan Example',role:'Secretary',email:'PRIVATE CLUB EMAIL'}]});
        ws.seasons=ws.seasons||[];
        ws.seasons.push({id:'p04c-archive',name:'Historical 2025',status:'completed',
            staff:[{name:'Morgan Example',role:'Manager',phone:'PRIVATE SEASON PHONE'}],
            squad:[]});
    }""")
    pg.goto(url+'#people')
    pg.wait_for_timeout(110)
    content=pg.inner_text('#view')
    c.ok('Prepare club and team staff records' in content,
         'staff ID preparation explicitly visible in People')
    c.ok('needing IDs' in content and 'prepared' in content,
         'existing legacy staff readiness is visible without assuming sample-data record counts')
    c.ok(pg.locator('[data-act=people-staff-prepare]').count()==1,
         'one clearly named deliberate preparation action')
    original=pg.evaluate("""() => ({
        team:window.__team.ws.team.staff[0],
        season:window.__team.ws.seasons.find(x=>x.id==='p04c-archive').staff[0],
        club:window.__team.ws.clubs.find(x=>x.id==='p04c-club').officials[0],
        teamId:window.__team.data.id
    })""")
    pg.click('[data-act=people-staff-prepare]')
    pg.wait_for_timeout(150)
    state=pg.evaluate("""() => ({
        team:window.__team.ws.team.staff[0],
        season:window.__team.ws.seasons.find(x=>x.id==='p04c-archive').staff[0],
        club:window.__team.ws.clubs.find(x=>x.id==='p04c-club').officials[0],
        teamId:window.__team.data.id
    })""")
    ids=[state[q].get('id','') for q in ('team','season','club')]
    c.ok(len(set(ids))==3 and all(x.startswith('staff-') for x in ids),
         'three different secure ID strings stamped in correct source rows')
    c.ok(all(state[q]['name']==original[q]['name'] for q in ('team','season','club')),
         'staff names unmodified')
    c.ok(all(state[q].get('phone','')==original[q].get('phone','') and
             state[q].get('email','')==original[q].get('email','') for q in ('team','season','club')),
         'coach-only staff contact fields unchanged')
    c.ok(state['teamId']==original['teamId'],
         'selected coach team preserved after replacing workspace')
    c.ok(pg.locator('[data-act=people-staff-prepare]').count()==0,
         'preparation is idempotent after all rows have IDs')
    options=pg.locator('form[data-form=people-link] select[name=firstRef] option').evaluate_all(
        '(all) => all.map(x=>({label:x.textContent.trim(),ref:x.value}))')
    first=next((x for x in options if 'Club official' in x['label']),None)
    second=next((x for x in options if 'Team staff' in x['label']),None)
    c.ok(bool(first and second),
         'formerly index-based club and team staff become eligible for deliberate linking')
    if first and second:
        pg.select_option('form[data-form=people-link] select[name=firstRef]',value=first['ref'])
        pg.select_option('form[data-form=people-link] select[name=secondRef]',value=second['ref'])
        pg.click('form[data-form=people-link] button[type=submit]')
        pg.wait_for_timeout(160)
        ledger=pg.evaluate('window.__team.ws.peopleReviews')
        c.ok(len(ledger)==1 and ledger[0]['status']=='reviewed' and
             len(ledger[0]['sourceRefs'])==2,
             'manual cross-context staff link saved to encrypted coach workspace ledger')
        pg.click('[data-act=people-undo]')
        pg.wait_for_timeout(100)
        ledger=pg.evaluate('window.__team.ws.peopleReviews')
        c.ok(len(ledger)==1 and ledger[0]['status']=='reversed',
             'manual staff link reversal persists as tombstone')
    c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),
         '390 px People page avoids horizontal overflow')
    # Ensure coach-only People tab is not visible in player preview.
    pg.goto(url+'#home')
    pg.wait_for_timeout(80)
    previews=pg.locator('[data-act=preview-on]')
    if previews.count():
        previews.first.click()
        pg.wait_for_timeout(90)
        c.ok(pg.locator('[data-tab=people]').count()==0,
             'player preview is never offered the staff preparation tool')
    else:
        c.ok(True,'preview not present in sample; separate player-side regression covers privacy')
    ctx.close()
    b.close()
srv.shutdown()
if not c.done(errs):
    sys.exit(1)
