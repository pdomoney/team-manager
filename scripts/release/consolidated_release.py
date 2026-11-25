#!/usr/bin/env python3
"""Consolidated PR294/295 cutover. No provider changes without a pinned release
plan, exact live baseline, fresh archive, qualified bundle and typed approval.
Reuse the verified PR292 helpers; do not repeat its restore rehearsal.
"""
import argparse, datetime as dt, hashlib, importlib, json, os, re, stat, sys, tempfile, zipfile
from pathlib import Path, PurePosixPath
from urllib.request import Request, build_opener
from urllib.error import HTTPError
from asset_verification import verify_all, browser_code, public_get, NoRedirect

BASE='5216495fd712727aadba6abc4cce6c8ba560279f'
DATA='068c27f8cf2185c1100b6acf0940b686e4295bc2'
OLD_VERSION='fadefe4b-e9b7-4a1a-b87e-75e41176bcdd'
OLD_DEPLOYMENT='72881ee8-8bb3-4266-97c2-8974be4867d2'
ORIGIN='https://team-manager.paul-domoney.workers.dev'
CONFIG='wrangler.stage3d4-existing.jsonc'
MIGRATIONS=['20261126010000_stage3d5_communications_lifecycle.sql','20261126020000_stage3d5_branding.sql']
BASE_MIGRATION='20261124060000_stage3d5_match_selection.sql'
ARCHIVES={
 'TeamManager_PR292_Production_Install.zip':'b5e89686faaad60a9c00e5a650036f657fabdbb7e6decc67d72224cb53d8f984',
 'TeamManager_PR293_Worker_Release.zip':'b9f678012a408972342cf78420ba318a807e9f36e464d259dbce348d44a90653'}
class Stop(Exception): pass
def require(ok,message):
    if not ok: raise Stop(message)
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def save(path,obj):
    tmp=path.with_suffix('.tmp')
    tmp.write_text(json.dumps(obj,indent=2,sort_keys=True)+'\n')
    tmp.chmod(0o600);tmp.replace(path)
def load(path): return json.loads(path.read_text())
def exact_plan(path,digest):
    require(re.fullmatch('[0-9a-f]{64}',digest or '') and sha(path)==digest,'Release plan checksum mismatch')
    p=load(path)
    require(p['base']==BASE and p['data_branch_sha']==DATA and re.fullmatch('[0-9a-f]{40}',p['source']) and p['source']!=BASE,'Wrong release source or baseline')
    require(p['ci']['source']==p['source'] and p['ci']['status']=='PASS' and all(p['ci'].get(k) is True for k in ('node','postgres','chromium','webkit')),'Exact merged release CI not qualified')
    require(p['previous_worker']=={'version_id':OLD_VERSION,'deployment_id':OLD_DEPLOYMENT},'Unexpected installed Worker pin')
    require([x['file'] for x in p['migrations']]==['supabase/migrations/'+n for n in MIGRATIONS] and all(re.fullmatch('[0-9a-f]{64}',x['sha256']) for x in p['migrations']),'Wrong migration set')
    return p
def extract_helpers(downloads,out):
    errors=[]
    for name,expected in ARCHIVES.items():
        try: require(sha(downloads/name)==expected,'Archive checksum mismatch: '+name)
        except (OSError,Stop): errors.append(name+' missing or checksum differs')
    require(not errors,'; '.join(errors))
    dest=out/'helpers';dest.mkdir(mode=0o700)
    for name in ARCHIVES:
        with zipfile.ZipFile(downloads/name) as z:
            for item in z.infolist():
                p=PurePosixPath(item.filename)
                require(not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(item.external_attr>>16),'Unsafe helper archive path')
            z.extractall(dest)
    sys.path.insert(0,str(dest/'TeamManager_PR292_Production_Install'))
    q=importlib.import_module('qualify');i=importlib.import_module('install');rec=importlib.import_module('recover');r=importlib.import_module('resume')
    prior=load(dest/'TeamManager_PR293_Worker_Release'/'expected.json')
    require(prior['source']==BASE and prior['data_branch_sha']==DATA and len(prior['migration_inventory'])==19 and len(prior['encrypted_assets'])==8,'Previous release evidence differs')
    return q,i,rec,r,prior
def strip_wrapper(sql):
    lines=sql.splitlines()
    controls=[(n,s.strip().lower()) for n,s in enumerate(lines) if re.fullmatch(r'\s*(?:begin|commit|rollback|start transaction)\s*;\s*',s,re.I)]
    require(len(controls)==2 and controls[0][1]=='begin;' and controls[1][1]=='commit;' and all(not x.strip() or x.lstrip().startswith('--') for x in lines[:controls[0][0]]) and not any(x.strip() for x in lines[controls[1][0]+1:]),'Unexpected migration transaction boundary')
    require(not any(x.lstrip().startswith('\\') for x in lines),'Unexpected psql command')
    return '\n'.join(x for n,x in enumerate(lines) if n not in {controls[0][0],controls[1][0]})+'\n'
def old_row_expression(expr):
    # Existing table fingerprint excludes ONLY the explicitly added columns.
    for table,cols in {'team_message_log':['history_state','history_changed_at','history_changed_by'],'team_notices':['removed_at','removed_by']}.items():
        anchor='FROM "tm_private"."'+table+'" t'
        parts=expr.split(' UNION ALL ')
        count=0
        for n,p in enumerate(parts):
            if anchor in p:
                require(p.count('to_jsonb(t)::text')==2,'Unexpected fingerprint expression')
                parts[n]=p.replace('to_jsonb(t)::text',"(to_jsonb(t)"+''.join("-'"+c+"'" for c in cols)+")::text");count+=1
        require(count==1,'Required preserved table missing: '+table)
        expr=' UNION ALL '.join(parts)
    return expr
def candidate_check(out,report):
    manifest=out/'candidate-hashes.json'
    require(sha(manifest)==report['candidate_manifest_sha256'],'Candidate manifest changed')
    rows=load(manifest);require(len(rows)==report['candidate_file_count'],'Candidate count changed')
    actual=['source/'+CONFIG]
    for root in (out/'source/dist-stage3d3-existing',out/'worker-dry-run'):
        require(root.is_dir() and not root.is_symlink(),'Candidate directory missing')
        for p in root.rglob('*'):
            require(not p.is_symlink(),'Candidate symlink')
            if p.is_file():actual.append(str(p.relative_to(out)))
    require(sorted(actual)==sorted(x['path'] for x in rows),'Candidate inventory changed')
    for x in rows:
        p=out/x['path'];require(not p.is_symlink() and p.stat().st_size==x['bytes'] and sha(p)==x['sha256'],'Candidate changed: '+x['path'])
    return rows
def check_source(q,work,p,prior):
    require(q.git(work,'rev-parse','HEAD')==p['source'] and not q.git(work,'diff','--name-only','HEAD'),'Tracked source drift')
    require(q.refs(work)=={'refs/heads/main':p['source'],'refs/heads/data':DATA},'Remote source/data drift')
    inv=[{'file':str(x.relative_to(work)),'sha256':sha(x)} for x in sorted((work/'supabase/migrations').glob('*.sql'))]
    require(inv==prior['migration_inventory']+p['migrations'],'Historical or candidate migration mismatch')
    for pattern in ('.env*','.dev.vars*'):require(not list(work.glob(pattern)),'Unexpected local environment file')
def expected_assets(rows):
    prefix='source/dist-stage3d3-existing/'
    # Published application file types. Do not infer hashes from Git.
    return {'/'+x['path'][len(prefix):]:x['sha256'] for x in rows if x['path'].startswith(prefix) and x['path']!=prefix+'index.html' and re.fullmatch(r'[a-zA-Z0-9._/-]+',x['path'][len(prefix):]) and not any(s.startswith('.') or s in ('_headers','_redirects') for s in x['path'][len(prefix):].split('/')) and Path(x['path']).suffix in ('.html','.js','.css','.json','.svg','.png','.jpg','.jpeg','.webp','.ico','.woff','.woff2')}
def anonymous():
    url=ORIGIN+'/api/stage3d5/v1/team'
    req=Request(url,data=b'{}',headers={'Content-Type':'application/json'},method='POST')
    try:
        try: res=build_opener(NoRedirect()).open(req,timeout=20)
        except HTTPError as e: res=e
        with res:
            row={'http_status':res.code,'ray_id':res.headers.get('cf-ray'),'expectedDenial':False}
            try: body=json.loads(res.read(4096))
            except (ValueError,UnicodeError): body={}
            row['expectedDenial']=res.geturl()==url and res.code==401 and isinstance(body,dict) and body.get('ok') is False and body.get('code')=='unauthenticated' and body.get('canProceed') is False
            return row
    except OSError as e:return {'expectedDenial':False,'error_type':type(e).__name__}
def write_verification(out,report,rows):
    expected=expected_assets(rows);require(expected and '/cloud-team.html' in expected and '/data/manifest.json' in expected,'Expected public assets absent')
    # Prepare browser command before making any requests, including failures.
    js=out/'browser-check.js';js.write_text(browser_code(ORIGIN,expected));js.chmod(0o600)
    checks=verify_all(ORIGIN,expected)
    checks['anonymousAuth']=anonymous()
    save(out/'asset-verification.json',checks)
    report['verification']={'passed':checks['passed'],'total':checks['total'],'anonymousAuth':checks['anonymousAuth'],'holds':[{'path':a['path'],'reason':a['reason']} for a in checks['assets'] if a['outcome']!='PASS']}
    report['status']='INSTALLED_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING' if checks['status']=='PASS' and checks['anonymousAuth']['expectedDenial'] else 'INSTALLED_VERIFICATION_HOLD_NO_REDEPLOY'
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',type=Path,default=Path.home()/'src/team-manager')
    ap.add_argument('--downloads',type=Path,default=Path.home()/'Downloads')
    ap.add_argument('--pg-bin',type=Path,required=True,help='Existing PostgreSQL 17 server bin directory')
    ap.add_argument('--plan',type=Path,required=True);ap.add_argument('--plan-sha256',required=True)
    ap.add_argument('--preflight-only',action='store_true')
    ap.add_argument('--verify-installed',type=Path,help='Read-only verification of a recorded installed version; never deploy')
    args=ap.parse_args();os.umask(0o077)
    p=exact_plan(args.plan,args.plan_sha256)
    root=Path.home()/'TeamManager-Private-Backups';root.mkdir(mode=0o700,exist_ok=True);require(not root.is_symlink(),'Private evidence root is a symlink')
    out=args.verify_installed.resolve() if args.verify_installed else root/('PR295-release-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+str(os.getpid()))
    require(out.parent==root.resolve(),'Evidence folder outside approved root')
    if not args.verify_installed:
        for prior_report in root.glob('PR295-release-*/release-summary.json'):
            old=load(prior_report)
            if old.get('source')==p['source'] and (old.get('R4')!='NOT_ATTEMPTED' or old.get('R5')!='NOT_ATTEMPTED'):
                raise Stop('Prior installation was attempted; reconcile recorded evidence, do not start again')
    if args.verify_installed:
        require(out.is_dir() and not args.verify_installed.is_symlink(),'Unsafe verification evidence directory')
        report=load(out/'release-summary.json');require(report['source']==p['source'] and report['plan_sha256']==args.plan_sha256 and report.get('R5')=='INSTALLED','No verified installed checkpoint; reconcile active version first')
    else:
        out.mkdir(mode=0o700);report={'source':p['source'],'plan_sha256':args.plan_sha256,'status':'PREFLIGHT_HOLD','checks':{},'errors':[],'R4':'NOT_ATTEMPTED','R5':'NOT_ATTEMPTED','database_restore_tested':False,'owner_acceptance':'NOT_RUN'}
    def checkpoint():save(out/'release-summary.json',report)
    checkpoint();env=None;print('Private release evidence:',out,flush=True)
    def check(name,fn):
        try:
            value=fn();report['checks'][name]='PASS';return value
        except Exception as e:
            report['checks'][name]='HOLD';report['errors'].append({'check':name,'reason':str(e) if isinstance(e,Stop) else type(e).__name__});return None
        finally:checkpoint()
    try:
        if args.verify_installed:
            # No database connection or deployment operation in this mode.
            with tempfile.TemporaryDirectory(prefix='verify-helpers-',dir=out) as tmp:
                q,i,rec,r,prior=extract_helpers(args.downloads,Path(tmp));i.OLD_VERSION=OLD_VERSION
                work=out/'source';check_source(q,work,p,prior)
                cli=[q.tool('npx'),'--yes','wrangler@4.167.0']
                require(i.cloud(cli,work)==report['new_worker'],'Active Worker differs from recorded installed checkpoint')
                rows=candidate_check(out,report);write_verification(out,report,rows)
            return 0 if not report['verification']['holds'] and report['verification']['anonymousAuth']['expectedDenial'] else 1
        q,i,rec,r,prior=extract_helpers(args.downloads,out)
        q.SOURCE=p['source'];q.BASELINE=BASE_MIGRATION;q.MIGRATIONS=MIGRATIONS;q.EXPECTED=prior
        i.OLD_VERSION=OLD_VERSION
        def tools():
            missing=[]
            for n in ('git','node','npx','psql','pg_dump','pg_restore'):
                try:q.tool(n)
                except Exception:missing.append(n)
            for n in ('initdb','pg_ctl'):
                if not (args.pg_bin/n).is_file():missing.append(n)
            require(not missing,'Missing prerequisites: '+', '.join(missing))
            require(q.run([q.tool('node'),'--version']).startswith('v22.'),'Node 22 required')
            require('17.' in q.run([args.pg_bin/'initdb','--version']),'PostgreSQL 17 reference server required')
            require(all(re.search(r'\b19\.',q.run([q.tool(n),'--version'])) for n in ('pg_dump','pg_restore')),'Use verified libpq 19 backup tools')
            return True
        if not check('tools',tools):return 1
        def source():
            repo=args.repo.expanduser().resolve()
            require(q.origin_ok(q.git(repo,'remote','get-url','origin')),'Wrong repository')
            require(q.refs(repo)=={'refs/heads/main':p['source'],'refs/heads/data':DATA},'Remote source/data mismatch')
            q.git(repo,'fetch','--no-tags','origin','main','data')
            work=out/'source';q.git(repo,'worktree','add','--detach',str(work),p['source'])
            check_source(q,work,p,prior)
            data=work/'data';data.mkdir(exist_ok=True)
            names=sorted(x for x in q.git(repo,'ls-tree','-r','--name-only',DATA).splitlines() if x.endswith('.enc.json'))
            require(names==sorted(x['file'] for x in prior['encrypted_assets']),'Protected data inventory differs')
            for item in prior['encrypted_assets']:
                f=data/item['file'];f.write_bytes(q.git(repo,'show',DATA+':'+item['file'],binary=True));require(sha(f)==item['sha256'],'Protected ciphertext differs')
            return work
        work=check('source',source)
        if work is None:return 1
        cli=[q.tool('npx'),'--yes','wrangler@4.167.0'];psql=q.tool('psql')
        def build():
            q.worker_candidate(work,out,report);entry=i.bundle_entry(out)
            dest=out/'transport-dry-run';dest.mkdir()
            q.run(cli+['deploy',str(entry),'--no-bundle','--keep-vars','--config',CONFIG,'--dry-run','--outdir',str(dest)],cwd=work,label='exact transport dry run',timeout=600,log=out/'transport-private.log')
            emitted=[x for x in dest.rglob('*') if x.is_file() and x.suffix in ('.js','.mjs')]
            require(len(emitted)==1 and sha(emitted[0])==sha(entry),'Bundle upload bytes changed');return entry
        entry=check('build_and_transport',build)
        def reference():
            base,target=q.reference(work,out,args.pg_bin,psql)
            known={k:{'definition_md5':v,'execute':{'anon':[False,False],'authenticated':[True,False],'service_role':[True,False]}} for k,v in r.FOUR.items()}
            return rec.overlay(base,known),rec.overlay(target,known)
        ref=check('synthetic_reference',reference)
        def cloud():
            old=i.cloud(cli,work);require(old['version_id']==OLD_VERSION and old['deployment_id']==OLD_DEPLOYMENT and old['prior_version_available'],'Installed Worker version drift')
            return old
        old=check('worker_baseline',cloud)
        def data_assets():
            expected={'/data/'+x['file']:x['sha256'] for x in prior['encrypted_assets']}
            result=verify_all(ORIGIN,expected);save(out/'baseline-asset-verification.json',result)
            require(result['status']=='PASS','Protected live asset verification HOLD; see baseline-asset-verification.json')
            manifest=public_get(ORIGIN+'/data/manifest.json')
            require(manifest.status==200 and json.loads(manifest.body)['version']==BASE[:7],'Installed asset version mismatch')
            return True
        check('live_ciphertext',data_assets)
        def db():
            nonlocal env
            env=i.db_env();actual=q.catalogue(psql,env);require(actual['server_version'].startswith('17.'),'Unexpected production PostgreSQL major')
            require(i.query(psql,env,i.identity_sql())=='t','Existing founder/Coach relationship absent')
            if actual['ledger_present']:
                versions=','.join(i.lit(n.split('_',1)[0]) for n in MIGRATIONS)
                require(not json.loads(i.query(psql,env,"select coalesce(json_agg(version),'[]'::json) from supabase_migrations.schema_migrations where version::text in ("+versions+')')),'Candidate migration already recorded')
            if ref:
                difference=q.diff(i.canonical(ref[0]),i.canonical(actual['objects']))
                save(out/'catalogue-differences.json',difference)
                require(q.equal(difference),'Production catalogue differs from qualified baseline')
            return actual
        actual=check('database_baseline',db)
        if report['errors'] or not ref or not entry or not actual or not old:return 1
        rows=candidate_check(out,report);check_source(q,work,p,prior)
        report['status']='PREFLIGHT_PASS_NOT_INSTALLED';checkpoint()
        if args.preflight_only:return 0
        require(p.get('script_provenance',{}).get('status')=='CONFIRMED' and p['script_provenance'].get('evidence_ref'),'Unresolved PR293 script provenance; no installation')
        require(p.get('visual_approval')=='OWNER_CONFIRMED','Candidate visual approval required')
        print('Keep users signed out; confirm automatic Cloudflare Git builds disabled and previous Worker rollback available.')
        require(input('Type INSTALL PR295 to approve this exact cutover: ').strip()=='INSTALL PR295','Installation not approved')
        base,target=actual['objects'],ref[1];expr=old_row_expression(i.data_expr(base))
        def fingerprint():return json.loads(i.query(psql,env,"SET LOCAL TIME ZONE 'UTC'; "+expr))
        before=fingerprint();report['backup']=i.fresh_backup(env,out,base);checkpoint()
        require(fingerprint()==before and q.catalogue(psql,env)==actual and i.cloud(cli,work)==old,'Drift during cutover backup')
        check_source(q,work,p,prior);candidate_check(out,report)
        tables=[('tm_private',k.split(':',1)[1]) for k,v in base.items() if k.startswith('relation:') and v['kind'] in ('r','p')]+[('auth','users'),('auth','identities')]
        locks=', '.join(q.ident(s)+'.'+q.ident(n) for s,n in sorted(tables))
        sql="SET TRANSACTION READ WRITE;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='10s';\nSET LOCAL statement_timeout='180s';\nSET LOCAL TIME ZONE 'UTC';\nLOCK TABLE "+locks+" IN SHARE ROW EXCLUSIVE MODE;\n"
        sql+=i.catalogue_check_sql(base,'PR295 pre-commit schema drift')
        guard="DO $pr295$ BEGIN IF ("+expr+") IS DISTINCT FROM "+i.js(before)+" THEN RAISE EXCEPTION 'PR295 old data changed'; END IF; END $pr295$;\n"
        sql+=guard
        for item in p['migrations']:
            path=work/item['file'];require(sha(path)==item['sha256'],'Migration changed');sql+=strip_wrapper(path.read_text())
        sql+=i.catalogue_check_sql(target,'PR295 post-migration catalogue mismatch',True)+guard
        sql+="DO $pr295$ BEGIN IF NOT ("+i.identity_sql()+") OR EXISTS(SELECT 1 FROM tm_private.club_branding) OR EXISTS(SELECT 1 FROM tm_private.team_branding) OR EXISTS(SELECT 1 FROM tm_private.club_branding_grants) OR EXISTS(SELECT 1 FROM tm_private.team_message_log WHERE history_state<>'active' OR history_changed_at IS NOT NULL OR history_changed_by IS NOT NULL) OR EXISTS(SELECT 1 FROM tm_private.team_notices WHERE removed_at IS NOT NULL OR removed_by IS NOT NULL) THEN RAISE EXCEPTION 'PR295 initial data invariant'; END IF; END $pr295$;\n"
        path=out/'migration-private.sql';path.write_text(sql);path.chmod(0o600)
        report.update(R4='ATTEMPTED_OUTCOME_UNKNOWN',status='MIGRATION_ATTEMPTED_RECONCILE_BEFORE_RETRY');checkpoint()
        q.run([psql,'-X','-w','-q','-v','ON_ERROR_STOP=1','--single-transaction','-f',path],env=dict(env,PGOPTIONS='-c default_transaction_read_only=off'),label='guarded migration',log=out/'migration-private.log',timeout=600)
        report['R4']='COMMITTED';checkpoint()
        require(i.canonical(q.catalogue(psql,env)['objects'])==i.canonical(target) and fingerprint()==before and i.query(psql,env,i.identity_sql())=='t','Committed data or schema verification HOLD')
        report['R4']='VERIFIED';checkpoint();env.pop('PGPASSWORD',None)
        require(i.cloud(cli,work)==old,'Worker changed after migration; no upload');check_source(q,work,p,prior);candidate_check(out,report)
        report.update(R5='ATTEMPTED_OUTCOME_UNKNOWN',status='DEPLOYMENT_ATTEMPTED_RECONCILE_BEFORE_RETRY');checkpoint()
        q.run(cli+['deploy',str(entry),'--no-bundle','--keep-vars','--config',CONFIG],cwd=work,label='controlled Worker cutover',log=out/'worker-deploy-private.log',timeout=900)
        new=i.cloud(cli,work);require(new['version_id']!=OLD_VERSION and new['deployment_id']!=OLD_DEPLOYMENT and new['prior_version_available'],'New Worker or rollback target not verified')
        report.update(R5='INSTALLED',status='INSTALLED_VERIFICATION_PENDING',new_worker=new);checkpoint()
        write_verification(out,report,rows);return 0 if report['status']=='INSTALLED_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING' else 1
    except Exception as e:
        report['errors'].append({'check':'controller','reason':str(e) if isinstance(e,Stop) else type(e).__name__})
        if report.get('R4')!='NOT_ATTEMPTED' or report.get('R5')!='NOT_ATTEMPTED':report['status']='RECONCILE_BEFORE_RETRY_NO_AUTOMATIC_REDEPLOY'
        return 1
    finally:
        if env:env.pop('PGPASSWORD',None)
        checkpoint();print('Share only:',out/'release-summary.json');print('Status:',report['status'])
if __name__=='__main__':raise SystemExit(main())
