#!/usr/bin/env python3
"""PR297 forward-only incremental cutover from the verified installed PR295.
The original PR295/296 controller and its historical exception stay immutable.
Candidate-only runs use a disposable reference database and Worker dry run.
No live writes without an exact merged release plan and typed owner approval.
"""
import argparse, datetime as dt, json, os, re, secrets, sys, tempfile
from pathlib import Path
from urllib.request import Request, build_opener
from urllib.error import HTTPError
from asset_verification import verify_all, browser_code, NoRedirect
from consolidated_release import (Stop, require, sha, save, load, extract_helpers,
    candidate_check, strip_wrapper, expected_assets, DATA, ORIGIN, CONFIG)

BASE='79cbf5409953c131ef3267c111cf64a687cc2539'
BASE_CONTROL='c75becb68aacecd2e9de8252c2dc9912d56caa32'
OLD_VERSION='8fcd1c41-1e9f-41e4-a10d-189ead15c093'
OLD_DEPLOYMENT='9cb39ece-6250-4ab2-a6ef-29d24ca47467'
BASE_MANIFEST='3314cdd41a02d877058a527c78bf7381fc958b3e3db0c86b487ec5d3fe9dd5df'
BASE_PLAN='ab699e7f7a1a22ebcafdc87e863847d2d08bb107416b05474ecce1eda4a04f73'
BASE_EXCEPTION='7a479b42f14f968dfd3c9e972a0660325da6655d2b97e51451198ea05db08f9e'
PREVIOUS_DIR='PR295-release-20261125T232939Z-61144'
PREVIOUS_HANDOFF='PR295-install-handoff.FXFrH7Bd'
BASE_MIGRATION='20261126020000_stage3d5_branding.sql'
MIGRATIONS=['20261126030000_stage3d5_branding_moderation.sql']
PREVIOUS_MIGRATIONS=[
 {'file':'supabase/migrations/20261126010000_stage3d5_communications_lifecycle.sql','sha256':'6f15ab7efebb8f964bacca070fc0285a31bc5cc9b26471779045d43d7d819daf'},
 {'file':'supabase/migrations/20261126020000_stage3d5_branding.sql','sha256':'2e31342764b1ebd389a99097786c50133a81e38d75cbd15e790c8c375bedaf2a'}]
CANDIDATE_BRANCH='candidate/pr297-branding-consistency'

def exact_plan(path,digest,candidate=False):
    require(re.fullmatch('[0-9a-f]{64}',digest or '') and sha(path)==digest,'Release plan checksum mismatch')
    p=load(path)
    require(p.get('release_kind')=='PR297_INCREMENTAL' and p.get('base')==BASE and p.get('base_control')==BASE_CONTROL and p.get('data_branch_sha')==DATA,'Wrong incremental baseline')
    require(re.fullmatch('[0-9a-f]{40}',p.get('source','')) and p['source'] not in (BASE,BASE_CONTROL),'Wrong new application source')
    require(p.get('previous_worker')=={'version_id':OLD_VERSION,'deployment_id':OLD_DEPLOYMENT},'Wrong installed Worker identity')
    require(p.get('prior_manifest_sha256')==BASE_MANIFEST and p.get('prior_plan_sha256')==BASE_PLAN,'Wrong prior evidence pins')
    require(not any(k in p for k in ('script_provenance','release_exception','release_control_source','release_control_ci')),'Historical release exception cannot be transferred')
    ci=p.get('ci',{})
    require(ci.get('source')==p['source'] and ci.get('status')=='PASS' and all(ci.get(k) is True for k in ('node','postgres','chromium','webkit')) and isinstance(ci.get('run_id'),int),'Exact-source CI not qualified')
    require(ci.get('event')==('push_candidate' if candidate else 'push_main'),'Wrong candidate/merged CI authority')
    require([x['file'] for x in p.get('migrations',[])]==['supabase/migrations/'+n for n in MIGRATIONS] and all(re.fullmatch('[0-9a-f]{64}',x.get('sha256','')) for x in p['migrations']),'Only the new branding migration is allowed')
    return p

def validate_previous_summary(j):
    require(j.get('source')==BASE and j.get('plan_sha256')==BASE_PLAN and j.get('R4')=='VERIFIED' and j.get('R5')=='INSTALLED' and not j.get('errors'),'Prior installation checkpoint differs')
    require(j.get('candidate_manifest_sha256')==BASE_MANIFEST and j.get('candidate_file_count')==172 and j.get('encrypted_assets_verified')==8,'Prior qualified artifact differs')
    worker=j.get('new_worker',{})
    require(worker.get('version_id')==OLD_VERSION and worker.get('deployment_id')==OLD_DEPLOYMENT and worker.get('required_secret_present') is True and worker.get('prior_version_available') is True,'Prior installed Worker checkpoint differs')
    v=j.get('verification',{})
    require(v.get('passed')==v.get('total')==166 and v.get('holds')==[],'Prior published assets not fully verified')
    e=j.get('release_exception',{})
    require(e.get('id')=='TM-EX-001' and e.get('historical_provenance')=='UNRESOLVED' and e.get('evidence_sha256')==BASE_EXCEPTION,'Prior exception record differs')

def previous_evidence(root,prior,out):
    previous=root/PREVIOUS_DIR; handoff=root/PREVIOUS_HANDOFF
    require(previous.is_dir() and not previous.is_symlink() and handoff.is_dir() and not handoff.is_symlink(),'Prior private evidence missing')
    j=load(previous/'release-summary.json');validate_previous_summary(j)
    require(sha(handoff/'install-plan.json')==BASE_PLAN and sha(handoff/'exception-evidence.json')==BASE_EXCEPTION,'Prior plan/evidence hash changed')
    rows=candidate_check(previous,j)
    expected=expected_assets(rows);require(len(expected)==166,'Prior public asset inventory differs')
    extended=dict(prior)
    extended['source']=BASE
    extended['migration_inventory']=prior['migration_inventory']+PREVIOUS_MIGRATIONS
    require(len(extended['migration_inventory'])==21,'Prior 21-migration inventory unavailable')
    save(out/'prior-installation-evidence.json',{'source':BASE,'control_source':BASE_CONTROL,'worker':j['new_worker'],'candidate_manifest_sha256':BASE_MANIFEST,'assets':len(expected),'prior_browser_denial':'OWNER_REPORTED_401_EXPECTED_JSON','prior_cli_denial':j['verification'].get('anonymousAuth'),'owner_functional_acceptance':'PARTIAL_BRANDING_DEFECT','historical_exception':'CLOSED_NOT_TRANSFERRED'})
    return extended,expected,previous

def check_source(q,work,p,prior,candidate=False):
    require(q.git(work,'rev-parse','HEAD')==p['source'] and not q.git(work,'diff','--name-only','HEAD'),'Tracked source drift')
    expected_main=BASE_CONTROL if candidate else p['source']
    require(q.refs(work)=={'refs/heads/main':expected_main,'refs/heads/data':DATA},'Remote source/data drift')
    if candidate:
        ref=q.git(work,'ls-remote','origin','refs/heads/'+CANDIDATE_BRANCH).split()
        require(ref==[p['source'],'refs/heads/'+CANDIDATE_BRANCH],'Candidate branch drift')
    require(q.git(work,'merge-base',BASE_CONTROL,p['source'])==BASE_CONTROL,'New source does not descend from installed release control')
    inv=[{'file':str(x.relative_to(work)),'sha256':sha(x)} for x in sorted((work/'supabase/migrations').glob('*.sql'))]
    require(inv==prior['migration_inventory']+p['migrations'],'Historical or candidate migration mismatch')
    for pattern in ('.env*','.dev.vars*'):require(not list(work.glob(pattern)),'Unexpected local environment file')
    for name in ('incremental_release.py','consolidated_release.py','asset_verification.py'):
        local=Path(__file__).resolve().with_name(name)
        require(q.git(work,'hash-object',str(local))==q.git(work,'rev-parse',p['source']+':scripts/release/'+name),'Running release helper differs: '+name)

def anonymous_result(status,content_type,body,ray=None,mitigation=None):
    d={'http_status':status,'content_type':content_type,'ray_id':ray,'cloudflare_mitigation':mitigation,'expectedDenial':False}
    if isinstance(body,dict):
        d.update(ok=body.get('ok') if isinstance(body.get('ok'),bool) else None,
            code=body.get('code') if body.get('code') in ('unauthenticated','origin-denied','registration-service-unavailable','scope-denied','invalid-request','service-unavailable') else None,
            canProceed=body.get('canProceed') if isinstance(body.get('canProceed'),bool) else None)
    d['expectedDenial']=status==401 and content_type.split(';')[0].strip().lower()=='application/json' and d.get('ok') is False and d.get('code')=='unauthenticated' and d.get('canProceed') is False
    d['browser_fallback_eligible']=status in (403,429,503) and not isinstance(body,dict) and (content_type.split(';')[0].strip().lower()!='application/json' or mitigation=='challenge')
    return d

def anonymous():
    url=ORIGIN+'/api/stage3d5/v1/team'
    req=Request(url,data=b'{}',headers={'Content-Type':'application/json'},method='POST')
    try:
        try: res=build_opener(NoRedirect()).open(req,timeout=20)
        except HTTPError as e: res=e
        with res:
            if res.geturl()!=url:return {'expectedDenial':False,'browser_fallback_eligible':False,'reason':'UNEXPECTED_RESPONSE_URL'}
            try: body=json.loads(res.read(4096))
            except (ValueError,UnicodeError): body=None
            return anonymous_result(res.code,res.headers.get('Content-Type',''),body,res.headers.get('cf-ray'),res.headers.get('cf-mitigated'))
    except OSError as e:return {'expectedDenial':False,'browser_fallback_eligible':False,'error_type':type(e).__name__}

def browser_probe(report):
    config=json.dumps({'origin':ORIGIN,'version_id':report['new_worker']['version_id'],'manifest_sha256':report['candidate_manifest_sha256'],'nonce':report['browser_nonce']})
    return """(async()=>{
const cfg="""+config+""";
if(location.origin!==cfg.origin)throw Error('Open the approved production origin');
const r=await fetch('/api/stage3d5/v1/team',{method:'POST',credentials:'omit',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:'{}'});
const j=await r.json().catch(()=>null);
console.log(JSON.stringify({...cfg,http_status:r.status,content_type:r.headers.get('content-type'),ray_id:r.headers.get('cf-ray'),ok:j?.ok??null,code:j?.code==='unauthenticated'?j.code:null,canProceed:j?.canProceed??null},null,2));
})();\n"""

def write_verification(out,report,rows):
    expected=expected_assets(rows);require(expected and '/cloud-team.html' in expected and '/data/manifest.json' in expected,'Expected public assets absent')
    report['browser_nonce']=secrets.token_hex(16)
    js=out/'browser-check.js';js.write_text(browser_probe(report));js.chmod(0o600)
    full=out/'browser-full-asset-check.js';full.write_text(browser_code(ORIGIN,expected));full.chmod(0o600)
    checks=verify_all(ORIGIN,expected);checks['anonymousAuth']=anonymous()
    file=out/'asset-verification.json';save(file,checks);report['verification_evidence_sha256']=sha(file)
    report['verification']={'passed':checks['passed'],'total':checks['total'],'anonymousAuth':checks['anonymousAuth'],'holds':[{'path':a['path'],'reason':a['reason']} for a in checks['assets'] if a['outcome']!='PASS']}
    report['status']='INSTALLED_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING' if checks['status']=='PASS' and checks['anonymousAuth']['expectedDenial'] else 'INSTALLED_VERIFICATION_HOLD_NO_REDEPLOY'

def check_browser_record(report,record):
    v=report['verification'];a=v['anonymousAuth']
    require(v['passed']==v['total'] and v['total']>0 and not v['holds'] and a.get('browser_fallback_eligible') is True,'Browser-only fallback not eligible; reconcile full verification')
    require(record.get('origin')==ORIGIN and record.get('version_id')==report['new_worker']['version_id'] and record.get('manifest_sha256')==report['candidate_manifest_sha256'] and record.get('nonce')==report['browser_nonce'],'Browser evidence identity mismatch')
    require(anonymous_result(record.get('http_status'),record.get('content_type') or '',record,record.get('ray_id'))['expectedDenial'],'Browser did not prove application-generated 401 denial')
    require(isinstance(record.get('ray_id'),str) and re.fullmatch('[0-9a-fA-F]{16}(?:-[A-Z]{3})?',record['ray_id']),'Missing browser Ray ID')

def verify_previous_reference(previous,base,rec,known,i):
    old=load(previous/'reference-candidate-private.json')
    if isinstance(old,dict) and 'objects' in old:old=old['objects']
    require(isinstance(old,dict) and 'relation:club_branding' in old,'Prior synthetic catalogue format not recognised')
    require(i.canonical(rec.overlay(old,known))==i.canonical(base),'Synthetic baseline differs from previously qualified PR295 catalogue')

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',type=Path,default=Path.home()/'src/team-manager')
    ap.add_argument('--downloads',type=Path,default=Path.home()/'Downloads')
    ap.add_argument('--pg-bin',type=Path,required=True,help='Existing PostgreSQL 17 server bin directory')
    ap.add_argument('--plan',type=Path,required=True);ap.add_argument('--plan-sha256',required=True)
    ap.add_argument('--preflight-only',action='store_true')
    ap.add_argument('--candidate-only',action='store_true',help='No provider access or writes; use qualified candidate branch')
    ap.add_argument('--browser-evidence',type=Path,help='Record a browser denial for an installed checkpoint; never deploy')
    ap.add_argument('--verify-installed',type=Path,help='Read-only verification of a recorded installed version; never deploy')
    args=ap.parse_args();os.umask(0o077)
    require(not (args.candidate_only and args.verify_installed) and (not args.browser_evidence or args.verify_installed),'Incompatible modes')
    p=exact_plan(args.plan,args.plan_sha256,args.candidate_only)
    root=Path.home()/'TeamManager-Private-Backups';root.mkdir(mode=0o700,exist_ok=True);require(not root.is_symlink(),'Private evidence root is a symlink')
    out=args.verify_installed.resolve() if args.verify_installed else root/('PR297-release-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+str(os.getpid()))
    require(out.parent==root.resolve(),'Evidence folder outside approved root')
    if not args.verify_installed:
        for prior_report in root.glob('PR297-release-*/release-summary.json'):
            old=load(prior_report)
            if old.get('R4')!='NOT_ATTEMPTED' or old.get('R5')!='NOT_ATTEMPTED':
                raise Stop('Prior installation was attempted; reconcile recorded evidence, do not start again')
    if args.verify_installed:
        require(out.is_dir() and not args.verify_installed.is_symlink(),'Unsafe verification evidence directory')
        report=load(out/'release-summary.json');require(report['source']==p['source'] and report['plan_sha256']==args.plan_sha256 and report.get('R5')=='INSTALLED','No verified installed checkpoint; reconcile active version first')
    else:
        out.mkdir(mode=0o700);report={'source':p['source'],'plan_sha256':args.plan_sha256,'status':'PREFLIGHT_HOLD','checks':{},'errors':[],'R4':'NOT_ATTEMPTED','R5':'NOT_ATTEMPTED','database_restore_tested':False,'owner_acceptance':'NOT_RUN'}
    report['baseline_source']=BASE;report['candidate_only']=args.candidate_only
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
                tmp=Path(tmp);q,i,rec,r,prior=extract_helpers(args.downloads,tmp);i.OLD_VERSION=OLD_VERSION
                prior,_,_=previous_evidence(root,prior,tmp)
                work=out/'source';check_source(q,work,p,prior)
                cli=[q.tool('npx'),'--yes','wrangler@4.167.0']
                require(i.cloud(cli,work)==report['new_worker'],'Active Worker differs from recorded installed checkpoint')
                rows=candidate_check(out,report)
                if args.browser_evidence:
                    require(sha(out/'asset-verification.json')==report['verification_evidence_sha256'],'Stored verification evidence changed')
                    record=load(args.browser_evidence);check_browser_record(report,record)
                    require(input('Type RECORD BROWSER PR297 to attest this browser evidence: ').strip()=='RECORD BROWSER PR297','Browser evidence not attested')
                    report['browser_verification']={'status':'OWNER_ATTESTED_EXPECTED_401','evidence_sha256':sha(args.browser_evidence),'ray_id':record['ray_id']}
                    report['status']='INSTALLED_BROWSER_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING';return 0
                write_verification(out,report,rows)
            return 0 if not report['verification']['holds'] and report['verification']['anonymousAuth']['expectedDenial'] else 1
        q,i,rec,r,prior=extract_helpers(args.downloads,out)
        prior,previous_assets,previous=previous_evidence(root,prior,out)
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
            require(q.refs(repo)=={'refs/heads/main':BASE_CONTROL if args.candidate_only else p['source'],'refs/heads/data':DATA},'Remote source/data mismatch')
            q.git(repo,'fetch','--no-tags','origin','main','data',*([CANDIDATE_BRANCH] if args.candidate_only else []))
            work=out/'source';q.git(repo,'worktree','add','--detach',str(work),p['source'])
            check_source(q,work,p,prior,args.candidate_only)
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
            base,target=rec.overlay(base,known),rec.overlay(target,known)
            verify_previous_reference(previous,base,rec,known,i)
            require('relation:club_branding_moderation' not in base and 'relation:club_branding_moderation' in target,'Moderation table transition differs')
            return base,target
        ref=check('synthetic_reference',reference)
        if args.candidate_only:
            if report['errors'] or not entry or not ref:return 1
            candidate_check(out,report);check_source(q,work,p,prior,True)
            report['status']='CANDIDATE_HELPERS_QUALIFIED_NO_PROVIDER_ACCESS';return 0
        def cloud():
            old=i.cloud(cli,work);require(old['version_id']==OLD_VERSION and old['deployment_id']==OLD_DEPLOYMENT and old['prior_version_available'],'Installed Worker version drift')
            return old
        old=check('worker_baseline',cloud)
        def baseline_assets(phase='preflight'):
            result=verify_all(ORIGIN,previous_assets);save(out/('baseline-assets-'+phase+'.json'),result)
            require(result['status']=='PASS','Prior live asset integrity HOLD; see baseline-assets-'+phase+'.json')
            return True
        check('live_baseline_assets',baseline_assets)
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
        require(p.get('visual_approval')=='OWNER_CONFIRMED' and p.get('candidate_helper_qualification')=='PASS','Candidate visual and helper qualification required')
        print('Keep users signed out; confirm automatic Cloudflare Git builds disabled and previous Worker rollback available.')
        require(input('Type INSTALL PR297 to approve this exact cutover: ').strip()=='INSTALL PR297','Installation not approved')
        base,target=actual['objects'],ref[1];expr=i.data_expr(base)
        def fingerprint():return json.loads(i.query(psql,env,"SET LOCAL TIME ZONE 'UTC'; "+expr))
        before=fingerprint();report['backup']=i.fresh_backup(env,out,base);checkpoint()
        require(fingerprint()==before and q.catalogue(psql,env)==actual and i.cloud(cli,work)==old,'Drift during cutover backup')
        check_source(q,work,p,prior);candidate_check(out,report)
        baseline_assets('before-migration')
        tables=[('tm_private',k.split(':',1)[1]) for k,v in base.items() if k.startswith('relation:') and v['kind'] in ('r','p')]+[('auth','users'),('auth','identities')]
        locks=', '.join(q.ident(s)+'.'+q.ident(n) for s,n in sorted(tables))
        sql="SET TRANSACTION READ WRITE;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='10s';\nSET LOCAL statement_timeout='180s';\nSET LOCAL TIME ZONE 'UTC';\nLOCK TABLE "+locks+" IN SHARE ROW EXCLUSIVE MODE;\n"
        sql+=i.catalogue_check_sql(base,'PR297 pre-commit schema drift')
        guard="DO $pr297$ BEGIN IF ("+expr+") IS DISTINCT FROM "+i.js(before)+" THEN RAISE EXCEPTION 'PR297 old data changed'; END IF; END $pr297$;\n"
        sql+=guard
        for item in p['migrations']:
            path=work/item['file'];require(sha(path)==item['sha256'],'Migration changed');sql+=strip_wrapper(path.read_text())
        sql+=i.catalogue_check_sql(target,'PR297 post-migration catalogue mismatch',True)+guard
        sql+="DO $pr297$ BEGIN IF NOT ("+i.identity_sql()+") OR EXISTS(SELECT 1 FROM tm_private.club_branding_moderation) THEN RAISE EXCEPTION 'PR297 initial moderation invariant'; END IF; END $pr297$;\n"
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
