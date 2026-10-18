# Release qualification: the unit tests, then every browser suite one after another (they share one
# build folder, so never in parallel), with the results written against the commit they ran on.
#   python3 test/browser/run_all.py [--out results.json]
# Exits non-zero if anything failed. Needs Node, Python 3 with Playwright, and Chromium.
# Safari and real phones aren't covered here; they're checked by hand (see the release notes).
import os, sys, json, re, time, subprocess, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SKIP = {'harness.py', 'ghmock.py', 'run_all.py'}
SUITES = sorted(f for f in os.listdir(HERE) if f.endswith('.py') and f not in SKIP)
WORK = os.path.join(__import__('tempfile').gettempdir(), 'team-manager-browser')

def git(*a):
    try: return subprocess.run(['git', *a], cwd=REPO, capture_output=True, text=True).stdout.strip()
    except OSError: return ''

def chromium_version():
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            b = p.chromium.launch(); v = b.version; b.close(); return v
    except Exception as e: return f'unavailable: {e}'

# In a pull request CI checks out a merge of the branch into main; HEAD_SHA names the branch's own commit.
res = {'commit': git('rev-parse', 'HEAD'), 'headCommit': os.environ.get('HEAD_SHA') or git('rev-parse', 'HEAD'), 'branch': os.environ.get('HEAD_REF') or git('rev-parse', '--abbrev-ref', 'HEAD'),
       'uncommittedChanges': bool(git('status', '--porcelain', '--untracked-files=no')),
       'started': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
       'browser': 'Chromium ' + chromium_version(), 'notCovered': ['Safari (macOS)', 'Safari (iOS)', 'real phones'],
       'unit': {}, 'browserSuites': []}
out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(WORK, f"qualification-{res['headCommit'][:7]}.json")
cap = os.path.join(WORK, 'capacity-results.json')
if os.path.exists(cap): os.remove(cap)   # only this run's measurements
t0 = time.time()
u = subprocess.run(['node', '--test', *sorted(os.path.join('test', f) for f in os.listdir(os.path.join(REPO, 'test')) if f.endswith('.test.js'))],
                   cwd=REPO, capture_output=True, text=True)
num = lambda k: int((re.search(rf'^# {k} (\d+)', u.stdout, re.M) or [0, 0])[1])
res['unit'] = {'tests': num('tests'), 'pass': num('pass'), 'fail': num('fail'), 'ok': u.returncode == 0, 'seconds': round(time.time() - t0, 1)}
print(f"unit: {res['unit']['pass']}/{res['unit']['tests']} passed", flush=True)
for s in SUITES:
    t = time.time()
    r = subprocess.run([sys.executable, '-u', os.path.join(HERE, s)], cwd=REPO, capture_output=True, text=True, timeout=1800)
    m = re.findall(r'^(\d+)/(\d+) checks passed(.*)$', r.stdout, re.M)
    passed, total, extra = (int(m[-1][0]), int(m[-1][1]), m[-1][2].strip(', ')) if m else (0, 0, 'no summary (crashed)')
    fails = [l.strip()[5:] for l in r.stdout.splitlines() if l.startswith('  FAIL')]
    row = {'suite': s[:-3], 'passed': passed, 'checks': total, 'ok': r.returncode == 0 and m != [] and passed == total,
           'pageErrors': extra, 'failures': fails, 'seconds': round(time.time() - t, 1)}
    if not row['ok']: row['tail'] = (r.stdout + r.stderr)[-2000:]
    res['browserSuites'].append(row)
    print(f"{s[:-3]}: {passed}/{total}{' ' + extra if extra else ''}{'' if row['ok'] else '  FAILED'} ({row['seconds']}s)", flush=True)
B = res['browserSuites']
res['browserTotals'] = {'suites': len(B), 'suitesPassed': sum(r['ok'] for r in B), 'checks': sum(r['checks'] for r in B), 'checksPassed': sum(r['passed'] for r in B)}
res['ok'] = res['unit']['ok'] and all(r['ok'] for r in B)
res['seconds'] = round(time.time() - t0, 1)
if os.path.exists(cap): res['capacity'] = json.load(open(cap))
json.dump(res, open(out, 'w'), indent=1)
T = res['browserTotals']
print(f"\n{'PASS' if res['ok'] else 'FAIL'} at {res['headCommit'][:7]}{' (with uncommitted changes)' if res['uncommittedChanges'] else ''}: "
      f"unit {res['unit']['pass']}/{res['unit']['tests']}, browser {T['checksPassed']}/{T['checks']} checks in {T['suitesPassed']}/{T['suites']} suites. "
      f"Safari and real phones not covered. Results: {os.path.abspath(out)}")
sys.exit(0 if res['ok'] else 1)
