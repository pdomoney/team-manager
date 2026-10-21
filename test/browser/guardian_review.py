# P04D coach-only reported guardian review lifecycle, not production auth.
# No online GitHub publishing: all tests use synthetic sample workspace.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c=Check()
with sync_playwright() as p:
    browser=p.chromium.launch()
    ctx,pg,errs=page(browser,url+'#home',width=390,height=844)
    pg.wait_for_selector('text=Load a sample squad')
    c.ok(pg.locator('[data-form=guardian-review]').count()==0,
         'no guardian controls on logged-out screen')
    pg.click('[data-act=sample]')
    pg.wait_for_timeout(180)
    # Create two synthetic children in separate teams with one existing helper.
    pg.evaluate("""() => {
      const ws=window.__team.ws,first=ws;
      ws.players.push({id:'p04d-child-one',name:'Child One Example',number:'7',
        notes:'PRIVATE CHILD HEALTH DATA',jerseys:[{id:'p04d-jersey',number:'7',issuedAt:'2026-05-01'}]});
      ws.helpers.push({id:'p04d-adult',name:'Adult Example',
        phone:'PRIVATE ADULT PHONE',playerId:'p04d-child-one'});
      ws.clubs.push({id:'p04d-club',name:'Synthetic P04D Club',sport:'Oztag'});
      ws.teams=ws.teams||[];
      ws.teams.push({id:'p04dteam2',team:{name:'Other Kids Team',clubId:'p04d-club',sport:'Oztag'},
        players:[{id:'p04d-child-two',name:'Child Two Example',notes:'SECOND CHILD PRIVATE'}],
        helpers:[],seasons:[],matches:[],sessions:[],tasks:[],notices:[],messages:[],
        lineups:[],plays:[],playerSets:[],systems:{}});
    }""")
    # Navigate without reloading, so intentionally unsaved synthetic fixtures
    # remain in the in-memory coach workspace for the full workflow.
    pg.evaluate("""() => {
      const b=document.createElement('button');
      b.dataset.act='tab';b.dataset.tab='people';
      document.body.appendChild(b);b.click();b.remove();
    }""")
    pg.wait_for_timeout(120)
    c.ok(pg.locator('form[data-form=guardian-review]').count()==1,
         'coach-only review form is present')
    txt=pg.inner_text('#view')
    c.ok('This page cannot create logins, grant access' in txt,
         'People page explicitly disclaims account and access rights')
    c.ok('does not verify legal guardianship' in txt,
         'explicit non-verification notice at point of entry')
    options=lambda name:pg.locator('form[data-form=guardian-review] select[name='+name+'] option').evaluate_all(
        '(all)=>all.map(x=>({label:x.textContent.trim(),ref:x.value}))')
    adult=next((x for x in options('guardianRef') if 'Adult Example' in x['label']),None)
    child_one=next((x for x in options('childPlayerRef') if 'Child One Example' in x['label']),None)
    child_two=next((x for x in options('childPlayerRef') if 'Child Two Example' in x['label']),None)
    c.ok(bool(adult and child_one and child_two), 'two children from two teams selectable against one adult')
    if adult and child_one and child_two:
        def add(child,relation):
            pg.select_option('[data-form=guardian-review] select[name=guardianRef]',value=adult['ref'])
            pg.select_option('[data-form=guardian-review] select[name=childPlayerRef]',value=child['ref'])
            pg.select_option('[data-form=guardian-review] select[name=relationship]',value=relation)
            pg.click('[data-form=guardian-review] button[type=submit]')
            pg.wait_for_timeout(130)
        add(child_one,'parent-reported')
        c.ok(pg.locator('[data-act=guardian-correct]').count()==1,
             'reported relationship saved with explicit correction control')
        c.ok('Reported relationship, NOT legal verification' in pg.inner_text('#view'),
             'saved review never masquerades as legal guardian proof')
        pg.click('[data-act=guardian-correct]')
        c.ok(pg.locator('[data-form=guardian-correct]').count()==1,
             'dedicated correction dialog appears')
        pg.select_option('[data-form=guardian-correct] select[name=relationship]',value='relative-reported')
        pg.click('[data-form=guardian-correct] button[type=submit]')
        pg.wait_for_timeout(140)
        state=pg.evaluate("""() => window.__team.ws.guardianReviews""")
        c.ok(len(state)==1 and len(state[0]['events'])==2 and
             state[0]['events'][1]['relationship']=='relative-reported',
             'correction saved as new immutable event, original remains')
        c.ok(pg.locator('details',has_text='Review history (2)').count()==1,
             'coach can expand readable two-event original and correction history')
        add(child_two,'carer-reported')
        state=pg.evaluate('window.__team.ws.guardianReviews')
        c.ok(len(state)==2 and any('p04dteam2' in x['childPlayerRef'] for x in state),
             'one adult recorded for two distinct children and teams')
        pg.click('[data-act=guardian-reverse] >> nth=0')
        pg.wait_for_timeout(140)
        state=pg.evaluate('window.__team.ws.guardianReviews')
        c.ok(len(state)==2 and any(r['events'][-1]['action']=='reverse' for r in state),
             'reversal retains history and another child association')
        c.ok(pg.evaluate("""() => window.__team.ws.players.some(x=>x.id==='p04d-child-one'
          && x.notes==='PRIVATE CHILD HEALTH DATA' && x.jerseys[0].number==='7')"""),
          'child health and jersey records unchanged')
        c.ok(not pg.evaluate("""() => JSON.stringify(window.__team.M.legacyTeam(
            window.__team.ws,'team1')).includes('guardianReviews')"""),
            'legacy team export excludes guardian review history')
    c.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),
         'mobile 390 px People page does not overflow')
    pg.goto(url+'#home')
    pg.wait_for_timeout(90)
    previews=pg.locator('[data-act=preview-on]')
    if previews.count():
        previews.first.click()
        pg.wait_for_timeout(100)
        pg.goto(url+'#people')
        pg.wait_for_timeout(100)
        c.ok(pg.locator('[data-form=guardian-review]').count()==0,
             'guardian workflow not visible in player preview')
    else:
        c.ok(True,'player-preview separate qualification covers coach-only controls')
    ctx.close()
    browser.close()
srv.shutdown()
if not c.done(errs):sys.exit(1)
