# P09C — safe local organisation layout concepts with real coach navigation.
# Synthetic test library only: no authenticated account, tenancy or role switching.
import sys
from harness import *
from playwright.sync_api import sync_playwright

build()
srv,url=serve()
c,errs=Check(),[]
act="([a,ds]) => {const b=document.createElement('button');b.dataset.act=a;Object.assign(b.dataset,ds||{});document.body.appendChild(b);b.click();b.remove();}"
with sync_playwright() as p:
    browser=p.chromium.launch()
    for width in (390,1280):
        ctx,pg,_=page(browser,url+'#home',width=width,height=860,errors=errs)
        pg.wait_for_selector('#view [data-act=test-library]')
        pg.click('#view [data-act=test-library]')
        pg.wait_for_function("window.__team.ws.testLibrary?.version===3")
        details=pg.evaluate("""() => {
          const W=window.__team.ws,M=window.__team.M,D=window.__team.data;
          const other=M.activeTeams(W).find(t=>t.id!==D.id && M.clubOf(W,t));
          W.clubs[0].email='P09C_PRIVATE_CLUB_EMAIL';
          D.players[0].notes='P09C_PRIVATE_PLAYER_NOTES';
          return {current:D.id,other:other.id,clubId:M.clubOf(W,other)?.id||''};
        }""")
        pg.goto(url+'#teams')
        pg.wait_for_selector('#view [data-act=org-preview-open]')
        c.ok(pg.locator('#view [data-act=org-preview-open]').count()==1,
             f'{width}: only coach team management advertises organisation concepts')
        pg.click('#view [data-act=org-preview-open]')
        c.ok(pg.locator('#sheet .org-preview-layout[data-mode=association]').count()==1
             and pg.locator('#sheet .org-preview-modes [aria-pressed=true]').count()==1,
             f'{width}: defaults to one clearly selected association layout concept')
        text=pg.inner_text('#sheet')
        c.ok('DESIGN PREVIEW ONLY' in text and 'not a signed-in role' in text
             and 'No association relationship or access is verified' in text,
             f'{width}: false security and association affiliation claims are explicitly rejected')
        c.ok('P09C_PRIVATE_CLUB_EMAIL' not in text and 'P09C_PRIVATE_PLAYER_NOTES' not in text
             and pg.evaluate("window.__team.state.preview===false"),
             f'{width}: organisational preview excludes sensitive fields and does not change access role')
        pg.click('#sheet [data-act=org-preview-mode][data-mode=club]')
        c.ok(pg.locator('#sheet .org-preview-layout[data-mode=club]').count()==1
             and pg.locator('#sheet .org-preview-clubs [data-act=org-preview-club]').count()>0,
             f'{width}: club-admin concept offers explicit local club filter')
        pg.click(f'#sheet [data-act=org-preview-club][data-id="{details["clubId"]}"]')
        c.ok(pg.locator(f'#sheet [data-act=org-preview-club][data-id="{details["clubId"]}"][aria-pressed=true]').count()==1
             and pg.locator('#sheet .org-preview-team-row').count()>=1,
             f'{width}: local club selection scopes concept to its own teams')
        pg.click('#sheet [data-act=org-preview-mode][data-mode=coach]')
        c.ok(pg.locator('#sheet .org-preview-layout[data-mode=coach]').count()==1
             and 'not individual manager membership' in pg.inner_text('#sheet'),
             f'{width}: manager layout does not grant memberships')
        # A preview's Open team must navigate only the already unlocked coach
        # workspace, applying its ordinary sport and branding in Home.
        pg.click(f'#sheet [data-act=org-preview-team][data-id="{details["other"]}"]')
        c.ok(pg.evaluate('window.__team.data.id')==details['other']
             and pg.locator('#sheet:visible').count()==0
             and pg.locator('#view .focus').count()==1,
             f'{width}: open team switches the real coach context and Home without role escalation')
        pg.goto(url+'#teams')
        pg.wait_for_selector('#view [data-act=org-preview-open]')
        pg.click('#view [data-act=org-preview-open]')
        pg.click('#sheet [data-act=org-preview-mode][data-mode=individual]')
        c.ok(pg.locator('#sheet .org-preview-layout[data-mode=individual]').count()==1
             and pg.locator('#sheet .org-preview-team-row').count()==1
             and pg.locator(f'#sheet .org-preview-team-row [data-act=org-preview-team][data-id="{details["other"]}"]').count()==1
             and pg.locator('#sheet [data-act=org-preview-player]').count()==1,
             f'{width}: individual concept follows active team and links to restricted player preview')
        pg.click('#sheet [data-act=org-preview-player]')
        c.ok(pg.evaluate('window.__team.state.preview===true')
             and pg.locator('#view [data-act=org-preview-open]').count()==0
             and 'You are seeing what players see.' in pg.inner_text('#status'),
             f'{width}: actual individual preview reuses existing player privacy gate')
        # A participant-view runtime must reject the coach-only modal even if
        # an action is dispatched without a visible button.
        pg.evaluate(act,['org-preview-open',{}])
        c.ok(pg.locator('#sheet:visible').count()==0,
             f'{width}: participant view cannot trigger coach organisation layouts')
        pg.locator('#status [data-act=preview-off]').click()
        c.ok(pg.evaluate('window.__team.state.preview===false'),
             f'{width}: leaving player view restores coach without persisted persona')
        pg.goto(url+'#teams')
        pg.wait_for_selector('#view [data-act=org-preview-open]')
        pg.click('#view [data-act=org-preview-open]')
        c.ok(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
             f'{width}: organisation sketch fits viewport without horizontal scroll')
        pg.locator('#sheet [data-act=close-sheet]').last.click()
        c.ok(pg.evaluate('window.__team.state.orgPreview!==null'),
             f'{width}: only ephemeral UI view state retained on this page')
        ctx.close()
    ok=c.done(errs)
    browser.close()
srv.shutdown()
sys.exit(0 if ok else 1)
