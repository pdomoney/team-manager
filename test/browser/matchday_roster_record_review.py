# P11H coach-only reply/arrival consistency review, no automatic writes.
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
    pg.evaluate("""(mid)=>{
      const d=window.__team.data,m=d.matches.find(x=>x.id===mid),ps=d.players.slice(0,4);
      d.team.sport='Rugby league';
      for(const q of ps)q.status='available';
      m.rsvp={};m.arrived={};
      m.rsvp[ps[0].id]={v:'no'};m.arrived[ps[0].id]=true;
      m.rsvp[ps[1].id]={v:'yes'};ps[1].status='injured';m.arrived[ps[1].id]=true;
      m.rsvp[ps[2].id]={v:'maybe'};m.arrived[ps[2].id]=true;
      m.arrived[ps[3].id]=true;
    }""",mid)
    snapshot=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet .match-roster-readiness summary')
    pg.click('#sheet .match-roster-readiness summary')
    panel=pg.locator('#sheet .roster-record-review')
    checks.ok(panel.count()==1 and 'Check conflicting replies and arrivals (4)' in panel.inner_text(),
      f'[{width}] four reviewable inconsistencies without eligibility inferences')
    for term in ['Marked arrived but replied No','Marked arrived but replied Unsure',
                 'Marked arrived with no reply','injured or unavailable']:
      checks.ok(term in panel.inner_text(),
        f'[{width}] explicitly names inconsistent {term}')
    checks.ok(pg.locator('#sheet form[data-form=match-lineup]').count()==0 and
      pg.locator('#sheet form[data-form=match-result]').count()==0,
      f'[{width}] inconsistent replies do not unlock a foreign-code scorer or formation')
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==snapshot,
      f'[{width}] warnings never write to coach data')
    pg.click('#sheet [data-act=rsvp-open][data-k=match]')
    pg.wait_for_selector('#sheet .roll-row')
    checks.ok('Availability' in pg.inner_text('#sheet .panel-head') and
      pg.evaluate('JSON.stringify(window.__team.ws)')==snapshot,
      f'[{width}] review button opens existing RSVP only without automatically changing it')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    pg.evaluate("""(mid)=>{
      const d=window.__team.data,m=d.matches.find(x=>x.id===mid);
      m.rsvp={};m.arrived={};d.team.sport='Netball';
      for(const q of d.players)q.status='available';
    }""",mid)
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.click('#sheet .match-roster-readiness summary')
    checks.ok('No conflicting replies or arrival records detected' in pg.inner_text('#sheet') and
      pg.locator('#sheet .roster-record-review').count()==0,
      f'[{width}] clear state remains explicit but does not assert eligibility')
    checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
      f'[{width}] no horizontal overflow')
    ctx.close()
  ok=checks.done(errors);browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
