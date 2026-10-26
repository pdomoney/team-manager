# P11F: copy-only organiser evidence worksheet, no approval or saved results.
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
    pg.wait_for_selector('#view')
    mid=pg.evaluate("window.__team.data.matches.find(m=>m.opponent==='Hills Hornets').id")
    pg.evaluate("""() => Object.defineProperty(navigator,'clipboard',{
      configurable:true,value:{writeText:async(text)=>{window.__rulesDraftCopied=text}}
    })""")
    pg.evaluate("(id)=>{window.__team.data.matches.find(m=>m.id===id).coachNotes='PRIVATE PLAYER NOTE'}",mid)
    baseline=pg.evaluate("JSON.stringify(window.__team.ws)")
    pg.evaluate(act,['match-open',{'id':mid}])
    pg.wait_for_selector('#sheet details.match-format-review')
    pg.click('#sheet details.match-format-review summary')
    pg.click('#sheet [data-act=match-rules-evidence-open]')
    pg.wait_for_selector('#sheet form[data-form=match-rules-evidence]')
    checks.ok('NOT approval' in pg.inner_text('#sheet') and
              pg.locator('#sheet form[data-form=match-rules-evidence] .field-l').count()==8,
              f'[{width}] eight field draft explicitly not rule approval')
    checks.ok(pg.locator('#sheet input[name=sourceUrl]').is_visible() and
              pg.locator('#sheet textarea[name=scoring]').is_visible(),
              f'[{width}] accessible source and rule-answer fields visible')
    # Bad official link is rejected locally without triggering data writes.
    pg.fill('#sheet input[name=sourceUrl]','http://not-https.example/rules')
    pg.click('#sheet [data-act=match-rules-evidence-copy]')
    checks.ok(pg.locator('#sheet input[name=sourceUrl][aria-invalid=true]').count()==1,
              f'[{width}] non-HTTPS rules source rejected')
    checks.ok(pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
              f'[{width}] invalid copy has no workspace writes')
    # A valid but partial evidence draft may be copied with gaps clearly marked.
    pg.fill('#sheet input[name=sourceUrl]','https://www.playrugbyleague.com/laws-of-the-game-community/')
    pg.fill('#sheet input[name=edition]','2026 local rules')
    pg.fill('#sheet input[name=effectiveDate]','2026-03-01')
    pg.fill('#sheet textarea[name=scoring]','4 points try - confirm competition requirements')
    pg.evaluate('window.__rulesDraftCopied=null')
    pg.click('#sheet [data-act=match-rules-evidence-copy]')
    pg.wait_for_function("() => !!window.__rulesDraftCopied")
    copied=pg.evaluate('window.__rulesDraftCopied')
    checks.ok('DRAFT COMPETITION RULES EVIDENCE' in copied and
              'STATE: DRAFT ONLY' in copied and '[NOT SUPPLIED]' in copied,
              f'[{width}] partial clipboard packet labelled draft and missing fields')
    checks.ok('PRIVATE PLAYER NOTE' not in copied and 'Mia Tuala' not in copied and
              'Josh Halloran' not in copied and
              pg.evaluate('JSON.stringify(window.__team.ws)')==baseline,
              f'[{width}] no player data leakage or stored match mutation')
    # Stale sport/team edits after sheet opened invalidate the draft copy action.
    pg.evaluate("() => {window.__team.data.team.sport='Rugby league';window.__team.data.team.rules='league/u8'}")
    pg.evaluate('window.__rulesDraftCopied=null')
    pg.click('#sheet [data-act=match-rules-evidence-copy]')
    checks.ok('context changed' in pg.inner_text('#sheet .match-rules-evidence-status') and
              pg.evaluate('window.__rulesDraftCopied') is None,
              f'[{width}] stale draft cannot copy with obsolete sport scope')
    pg.keyboard.press('Escape')
    pg.wait_for_selector('#sheet',state='hidden')
    checks.ok(pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),
              f'[{width}] evidence draft has no horizontal page overflow')
    ctx.close()
  ok=checks.done(errors)
  browser.close()
srv.shutdown();sys.exit(0 if ok else 1)
