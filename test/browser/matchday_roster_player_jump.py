# P11I: exact-ID RSVP review, duplicate display names, and no silent writes.
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
    pair=pg.evaluate("""(id)=>{
      const d=window.__team.data,m=d.matches.find(x=>x.id===id),a=d.players[0],b=d.players[1];
      d.team.sport='Netball';
      a.name='Same Display Name';b.name='Same Display Name';a.number='7';b.number='7';
      for(const q of d.players)q.status='available';
      m.rsvp={};m.arrived={[a.id]:true,[b.id]:true};
      return [a.id,b.id];
    }""",mid)
    before=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet .match-roster-readiness summary')
    pg.click('#sheet .match-roster-readiness summary')
    warnings=pg.locator('#sheet .roster-record-review')
    checks.ok(warnings.count()==1 and
      'Check conflicting replies and arrivals (2)' in warnings.inner_text(),
      f'[{width}] two distinct players retained despite identical names and jersey numbers')
    buttons=warnings.locator('[data-act=roster-player-rsvp]')
    checks.ok(buttons.count()==2 and
      set(buttons.evaluate_all('(els)=>els.map(e=>e.dataset.pid)'))==set(pair),
      f'[{width}] exact stable player IDs on two review actions')
    checks.ok(pg.locator('#sheet form[data-form=match-result]').count()==0 and
      pg.evaluate('JSON.stringify(window.__team.ws)')==before,
      f'[{width}] non-Oztag score controls blocked, no roster mutation')
    pg.click('#sheet .roster-record-review [data-act=roster-player-rsvp][data-pid="'+pair[1]+'"]')
    pg.wait_for_selector('#sheet .roll-row.roster-review-target')
    pg.wait_for_function("""pid=>document.activeElement?.dataset?.row===pid""",pair[1])
    selected=pg.locator('#sheet .roll-row.roster-review-target')
    checks.ok(selected.get_attribute('data-row')==pair[1] and
      selected.get_attribute('role')=='group' and
      'Same Display Name' in selected.get_attribute('aria-label'),
      f'[{width}] existing RSVP sheet focuses only selected duplicate-name player')
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==before,
      f'[{width}] reviewing a row does not edit any RSVP automatically')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    # A stale warning cannot open a player that no longer has a conflict.
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.click('#sheet .match-roster-readiness summary')
    pg.evaluate("(id,pid)=>{const m=window.__team.data.matches.find(x=>x.id===id);delete m.arrived[pid]}",mid,pair[0])
    after=pg.evaluate('JSON.stringify(window.__team.ws)')
    pg.click('#sheet .roster-record-review [data-act=roster-player-rsvp][data-pid="'+pair[0]+'"]')
    checks.ok(pg.locator('#sheet .match-roster-readiness').count()==1 and
      pg.locator('#sheet .roll-row').count()==0 and
      pg.evaluate('JSON.stringify(window.__team.ws)')==after,
      f'[{width}] stale per-player warning fails closed without edits')
    checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
      f'[{width}] no horizontal overflow')
    ctx.close()
  ok=checks.done(errors)
  browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
