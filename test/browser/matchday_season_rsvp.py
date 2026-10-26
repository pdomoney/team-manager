# P11J: exact fixture-season RSVP modal across non-Oztag sports; legacy Oztag untouched.
import sys
from harness import *
from playwright.sync_api import sync_playwright
build();srv,url=serve()
checks=Check();errors=[]
act="([a,ds])=>{const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove()}"
with sync_playwright() as p:
  browser=p.chromium.launch()
  for width,height in [(390,844),(820,1180),(1280,900)]:
    ctx,pg,_=page(browser,url+'#home',width=width,height=height,errors=errors)
    pg.get_by_text('Load a sample squad').click()
    mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
    context=pg.evaluate("""(id)=>{
      const d=window.__team.data,m=d.matches.find(x=>x.id===id);
      d.team.sport='Rugby league';
      const original=d.players[0],second=d.players[1],active=window.__team.M.activeSeason(d);
      d.seasons.push({id:'past-2019',name:'2019 archived',status:'archived',
        staff:[],defaults:{},squad:[{
          playerId:original.id,number:'99',positions:['Historic position'],
          status:'available',reg:'registered'
        }]});
      active.squad=active.squad.filter(x=>x.playerId!==original.id);
      m.seasonId='past-2019';m.rsvp={};m.result={us:4,them:3};
      return {past:original.id,other:second.id,active:active.id};
    }""",mid)
    before=pg.evaluate('JSON.stringify(window.__team.ws)')
    pg.evaluate(act,['rsvp-open',{'k':'match','id':mid}])
    pg.wait_for_selector('#sheet .match-season-rsvp .roll-row')
    rows=pg.locator('#sheet .match-season-rsvp .roll-row')
    checks.ok(rows.count()==1 and rows.first.get_attribute('data-row')==context['past'],
      f'[{width}] archived 2019 match shows only archived-season player')
    checks.ok('2019 archived' in pg.inner_text('#sheet') and
      'These replies do not establish playing eligibility' in pg.inner_text('#sheet'),
      f'[{width}] historic season and eligibility limitation announced')
    checks.ok('#99' not in pg.inner_text('#sheet') or
      pg.evaluate('JSON.stringify(window.__team.ws)')==before,
      f'[{width}] historic-season modal initially leaves workspace unchanged')
    pg.click('#sheet .match-season-rsvp [data-v=yes]')
    changes=pg.evaluate("""([id,pid,other])=>{
      const m=window.__team.data.matches.find(x=>x.id===id);
      return {reply:window.__team.M.rsvpOf(m,pid),
        other:window.__team.M.rsvpOf(m,other),result:m.result};
    }""",[mid,context['past'],context['other']])
    checks.ok(changes['reply']=='yes' and changes['other']=='' and
      changes['result']=={'us':4,'them':3},
      f'[{width}] explicit coach RSVP only changes intended player, not result/history')
    # A season switch while this modal remains open invalidates its old controls.
    pg.evaluate("(id,sid)=>{}",mid,context['active']) if False else None
    pg.evaluate("""([id,sid])=>{
      const m=window.__team.data.matches.find(x=>x.id===id);m.seasonId=sid;
    }""",[mid,context['active']])
    snap=pg.evaluate('JSON.stringify(window.__team.ws)')
    pg.click('#sheet .match-season-rsvp [data-v=no]')
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==snap,
      f'[{width}] stale season-bound RSVP controls cannot edit historical player')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("""id=>{
      window.__team.data.matches.find(m=>m.id===id).seasonId='missing-season';
    }""",mid)
    invalid=pg.evaluate('JSON.stringify(window.__team.ws)')
    pg.evaluate(act,['rsvp-open',{'k':'match','id':mid}])
    pg.wait_for_selector('#sheet .panel-body')
    checks.ok('no valid recorded season' in pg.inner_text('#sheet') and
      pg.locator('#sheet .roll-row').count()==0 and
      pg.locator('#sheet [data-act=rsvp-ask]').count()==0,
      f'[{width}] invalid season blocks non-Oztag reply edits and send prompt')
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==invalid,
      f'[{width}] orphan season never auto-migrates or mutates a fixture')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("() => {window.__team.data.team.sport='Oztag'}")
    pg.evaluate(act,['rsvp-open',{'k':'match','id':mid}])
    pg.wait_for_selector('#sheet .roll-row')
    checks.ok(pg.locator('#sheet .roll-row').count()==pg.evaluate('window.__team.data.players.length') and
      pg.locator('#sheet .match-season-rsvp').count()==0,
      f'[{width}] existing Oztag RSVP list is preserved despite orphan season')
    checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
      f'[{width}] no viewport overflow')
    ctx.close()
  ok=checks.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
