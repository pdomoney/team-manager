# P11K — coach-only same-date venue presence without borrowing Oztag formations.
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
    data=pg.evaluate("""()=>{
      const d=window.__team.data,m=d.matches.find(x=>x.opponent==='Hills Hornets'),
        s=window.__team.M.activeSeason(d),now=new Date(),
        today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
          String(now.getDate()).padStart(2,'0')].join('-'),
        pid=d.players[0].id,other=d.players[1].id;
      d.team.sport='Netball';m.seasonId=s.id;m.date=today;m.status='scheduled';
      m.arrived={};m.rsvp={};return {id:m.id,pid,other,season:s.id,today};
    }""")
    mid=data['id'];pid=data['pid'];other=data['other']
    original=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet .match-roster-readiness summary')
    pg.click('#sheet .match-roster-readiness summary')
    pg.click('#sheet .match-arrival-checkin summary')
    checks.ok('Venue check-in' in pg.inner_text('#sheet .match-arrival-checkin') and
      'not medical fitness' in pg.inner_text('#sheet .match-arrival-checkin') and
      pg.locator('#sheet form[data-form=match-result]').count()==0,
      f'[{width}] non-Oztag venue check-in clearly not eligibility or scoring')
    selector='#sheet .match-arrival-checkin [data-act=roster-arrival-toggle][data-pid="'+pid+'"]'
    checks.ok(pg.locator(selector).count()==1 and
      pg.locator(selector).inner_text()=='Record arrived' and
      pg.evaluate('JSON.stringify(window.__team.ws)')==original,
      f'[{width}] check-in not written until deliberate coach click')
    pg.click(selector)
    pg.wait_for_function("""([id,pid])=>{
      const m=window.__team.data.matches.find(x=>x.id===id);
      return m.arrived?.[pid]===true
    }""",arg=[mid,pid])
    check=pg.evaluate("""([id,pid,other])=>{
      const m=window.__team.data.matches.find(x=>x.id===id);
      return {arrived:m.arrived,rs:m.rsvp,result:m.result}
    }""",[mid,pid,other])
    checks.ok(check['arrived']=={pid:True} and check['rs'] == {} and
      pg.locator('#sheet .match-arrival-checkin[open]').count()==1,
      f'[{width}] deliberate arrival writes only exact player presence and keeps disclosure open')
    checks.ok(pg.locator(selector).inner_text()=='Undo check-in' and
      '1 recorded here' in pg.locator('#sheet .match-arrival-checkin summary').inner_text(),
      f'[{width}] new check-in visible and reversible')
    # Existing controls must fail closed when a fixture's date changes.
    pg.evaluate("""([id,date])=>{
      const m=window.__team.data.matches.find(x=>x.id===id);
      m.date='2035-01-01';
    }""",[mid,data['today']])
    stale=pg.evaluate('JSON.stringify(window.__team.ws)')
    pg.click(selector)
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==stale,
      f'[{width}] stale check-in cannot update a changed fixture date')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("""([id,today])=>{
      const m=window.__team.data.matches.find(x=>x.id===id);
      m.date=today;m.status='played';
    }""",[mid,data['today']])
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.click('#sheet .match-roster-readiness summary')
    pg.click('#sheet .match-arrival-checkin summary')
    checks.ok(pg.locator('#sheet .match-arrival-checkin [data-act=roster-arrival-toggle]').count()==0 and
      'Only a scheduled fixture' in pg.inner_text('#sheet .match-arrival-checkin'),
      f'[{width}] completed match historical arrivals remain read only')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("""id=>{
      const d=window.__team.data,m=d.matches.find(x=>x.id===id);
      m.status='scheduled';d.team.sport='Oztag';
    }""",mid)
    pg.evaluate(act,['match-open',{'id':mid}])
    checks.ok(pg.locator('#sheet .match-arrival-checkin').count()==0 and
      pg.locator('#sheet form[data-form=match-result]').count()==1,
      f'[{width}] established Oztag controls unaffected')
    checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
      f'[{width}] no horizontal overflow')
    ctx.close()
  ok=checks.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
