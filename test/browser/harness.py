# Shared helpers for the browser checks: build the site, serve it, open pages, collect errors.
# Run any of these from the repository root, e.g.  python3 test/browser/regress.py
# Needs Python 3 with Playwright and Chromium (pip install playwright && playwright install chromium).
# Nothing here goes online: GitHub is simulated (ghmock.py) and WhatsApp links are stubbed.
import os, subprocess, threading, functools, http.server, socketserver, json, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(tempfile.gettempdir(), 'team-manager-browser')
DIST = os.path.join(WORK, 'dist')
os.makedirs(WORK, exist_ok=True)
def shot(name): return os.path.join(WORK, name)

def build(data_dir=None):
    env = dict(os.environ, OUT_DIR=DIST, DATA_DIR=data_dir or os.path.join(WORK, 'nodata'))
    subprocess.run(['node', 'src/build.js'], cwd=REPO, env=env, check=True, capture_output=True)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()

def serve(port=0):
    handler = functools.partial(Quiet, directory=DIST)
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(('127.0.0.1', port), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'

def page(browser, url, width=390, height=844, errors=None, block_fonts=True):
    ctx = browser.new_context(viewport={'width': width, 'height': height})
    pg = ctx.new_page()
    errs = errors if errors is not None else []
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
    pg.on('console', lambda m: errs.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('dialog', lambda d: d.accept())
    if block_fonts:
        pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        pg.route('**/fonts.gstatic.com/**', lambda r: r.abort())
    ctx.route('https://wa.me/**', lambda r: r.fulfill(body='whatsapp'))
    ctx.route('https://api.whatsapp.com/**', lambda r: r.fulfill(body='whatsapp'))
    pg.goto(url)
    return ctx, pg, errs

class Check:
    def __init__(self): self.fails = []; self.n = 0
    def ok(self, cond, msg):
        self.n += 1
        if not cond: self.fails.append(msg); print('  FAIL', msg)
    def done(self, errs=()):
        real = [e for e in errs if 'fonts.g' not in e and 'net::ERR_FAILED' not in e and 'Failed to load resource' not in e]
        for e in real: print('  ERR', e)
        print(f'{self.n - len(self.fails)}/{self.n} checks passed' + ('' if not real else f', {len(real)} page errors'))
        return not self.fails and not real

def ensure_upcoming_sample_trial(pg):
    """Test-only: retain the sample's near-term Hills fixture if its start has passed.

    The sample's sat(0) lands on *today* when CI runs on Saturday. After 09:30
    local runner time Home correctly excludes it as past; older tests expected
    it still to be upcoming. Move only this synthetic fixture and its linked
    tasks forward one week, keeping the original team, IDs and associations.
    No production code, persisted data or Home time-filter rule is changed.
    """
    moved = pg.evaluate("""() => {
      const {data:D, M} = window.__team;
      const m = D.matches.find(x => x.opponent === 'Hills Hornets');
      if (!m) throw new Error('Missing synthetic Hills Hornets fixture');
      const dateTime = new Date(m.date + 'T' + (m.start || '00:00') + ':00');
      if (!Number.isFinite(dateTime.getTime())) throw new Error('Malformed synthetic trial time');
      if (dateTime.getTime() > Date.now()) return false;
      const next = M.addDays(m.date, 7);
      m.date = next;
      D.tasks.filter(t => t.matchId === m.id).forEach(t => { t.date = next; });
      return true;
    }""")
    if moved:
        # Re-render in the existing in-memory SPA. A page reload would discard
        # the synthetic change and incorrectly reintroduce the past fixture.
        pg.evaluate("""() => {
          const b = document.createElement('button');
          b.dataset.act = 'tab';
          b.dataset.tab = 'home';
          document.body.appendChild(b);
          b.click();
          b.remove();
        }""")
    return moved
