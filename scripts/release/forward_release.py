#!/usr/bin/env python3
"""Reusable additive-schema forward release, using the qualified legacy helpers.
No writes before exact-source CI, candidate qualification, live checks and
explicit typed approval. Existing PR295/297/298 controllers remain immutable.
"""
import argparse, datetime as dt, json, os, re, tempfile
from pathlib import Path
from consolidated_release import Stop,require,sha,save,load,extract_helpers,candidate_check,strip_wrapper,expected_assets,ORIGIN,CONFIG
from incremental_release import record_helper_contract,write_verification,check_browser_record
from forward_release_plan import ROOT,HEX64,validate_plan_structure,spec_for,check_source_inventory,remote_refs,check_ci_records,accepted_evidence,safe_private,validate_candidate_summary
from asset_verification import verify_all

def exact_plan(path,digest,mode):
    require(HEX64.fullmatch(digest or '') and sha(path)==digest,'Release plan checksum mismatch')
    p=load(path);require(p.get('format')=='TEAM_MANAGER_FORWARD_V1','Wrong release plan format')
    validate_plan_structure(p)
    require(p.get('mode')==('candidate' if mode=='qualify' else 'merged'),'Wrong plan mode')
    require(not any(k in p for k in ('release_exception','script_provenance','recovery')),'Prior exception/recovery may not transfer')
    if mode!='qualify':
        c=p.get('candidate_evidence',{})
        require(HEX64.fullmatch(c.get('summary_sha256','')) and HEX64.fullmatch(c.get('plan_sha256','')),'Qualified candidate evidence missing')
        require(len(p.get('ci',[]))==3,'Candidate, PR and merged CI required')
    else:require(len(p.get('ci',[]))==1,'Exact candidate CI required')
    return p
def check_source(q,work,p,prior,mode):
    s=p['spec'];a=s['accepted'];source=p['source']
    require(q.git(work,'rev-parse','HEAD')==source and q.git(work,'rev-parse','HEAD^{tree}')==p['source_tree'] and
      not q.git(work,'diff','--name-only','HEAD'),'Tracked source or tree drift')
    require(remote_refs(work)=={'refs/heads/main':p['main'],'refs/heads/data':a['data']},'Remote main/data drift')
    if mode=='qualify':
        require(p['main']==s['developmentBase'] and q.git(work,'ls-remote','origin','refs/heads/'+s['candidateBranch'])==source+'\trefs/heads/'+s['candidateBranch'],'Candidate branch drift')
    else:
        require(p['main']==source and q.git(work,'rev-parse',source+'^1')==s['developmentBase'] and
          q.git(work,'rev-parse',source+'^2')==p['candidate_source'],'Merge parents differ')
    require(spec_for(work,source,p['spec_path'])==s,'Release specification differs')
    old,new=check_source_inventory(work,source,s)
    require(old==p['prior_migrations']==prior['migration_inventory'] and new==p['migrations'],'Migration inventory differs')
    for pattern in ('.env*','.dev.vars*'):require(not list(work.glob(pattern)),'Unexpected local environment file')
    for name in ('forward_release.py','forward_release_plan.py','incremental_release.py','consolidated_release.py','asset_verification.py'):
        path=Path(__file__).resolve().with_name(name)
        require(q.git(work,'hash-object',str(path))==q.git(work,'rev-parse',source+':scripts/release/'+name),'Running controller differs: '+name)
def previous(q,i,rec,r,prior,p,out):
    j,assets=accepted_evidence(p['spec'],p['previous']['directory'],p['previous']['plan_path'])
    require(j==p['previous'],'Accepted evidence changed since plan preparation')
    require(prior['migration_inventory']==p['prior_migrations'][:len(prior['migration_inventory'])],'Archived helper migration prefix differs')
    extended=dict(prior,source=p['spec']['accepted']['source'],migration_inventory=p['prior_migrations'])
    require(len(extended['encrypted_assets'])==p['spec']['accepted']['encryptedAssets'],'Protected archive inventory differs')
    save(out/'accepted-baseline.json',{'source':p['spec']['accepted']['source'],'control':p['spec']['accepted']['control'],
      'ownerAcceptance':p['spec']['accepted']['ownerAcceptance'],'assets':len(assets),'summary_sha256':j['summary_sha256'],
      'schema_reference_sha256':j['reference_sha256'],'historical_exception':'NOT_TRANSFERRED'})
    return extended,assets,Path(j['directory'])
def check_additive_reference(base,target,old,i,spec):
    require(isinstance(base,dict) and isinstance(target,dict) and isinstance(old,dict),'Unsupported reference catalogue')
    require(i.canonical(old)==i.canonical(base),'Synthetic baseline differs from accepted schema reference')
    require(set(base)<=set(target),'Existing catalogue objects disappeared')
    require(i.canonical(base)==i.canonical({k:target[k] for k in base}),'Existing schema objects changed; additive controller refuses')
    expected={'relation:'+x for x in spec['newEmptyTables']}
    require({k for k in set(target)-set(base) if k.startswith('relation:')}==expected,'Unexpected new relation inventory')
def check_qualification(p):
    c=p['candidate_evidence'];path=safe_private(c['directory']);file=path/'release-summary.json'
    require(sha(file)==c['summary_sha256'],'Candidate summary changed')
    j=load(file)
    require(j.get('source')==p['candidate_source'] and j.get('source_tree')==p['source_tree'] and j.get('plan_sha256')==c['plan_sha256'] and
      j.get('candidate_only') is True and j.get('R4')==j.get('R5')=='NOT_ATTEMPTED' and j.get('status')=='CANDIDATE_HELPERS_QUALIFIED_NO_PROVIDER_ACCESS' and not j.get('errors') and
      all(j.get('checks',{}).get(k)=='PASS' for k in ('tools','source','build_and_transport','synthetic_reference')),'Candidate qualification no longer valid')
    candidate_check(path,j)
def initial_guard(i,spec):
    tables=spec['newEmptyTables']
    return "DO $forward$ BEGIN IF NOT ("+i.identity_sql()+")"+''.join(' OR EXISTS(SELECT 1 FROM tm_private."'+n+'")' for n in tables)+" THEN RAISE EXCEPTION 'Forward release initial invariant failed'; END IF; END $forward$;\n"
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--mode',choices=('qualify','preflight','install','verify'),required=True)
    ap.add_argument('--repo',type=Path,default=Path.home()/'src/team-manager');ap.add_argument('--downloads',type=Path,default=Path.home()/'Downloads')
    ap.add_argument('--pg-bin',type=Path,required=True)
    ap.add_argument('--plan',type=Path,required=True);ap.add_argument('--plan-sha256',required=True)
    ap.add_argument('--verify-installed',type=Path);ap.add_argument('--browser-evidence',type=Path)
    args=ap.parse_args();os.umask(0o077);mode=args.mode
    require((mode=='verify')==bool(args.verify_installed) and (not args.browser_evidence or mode=='verify'),'Invalid verification mode')
    p=exact_plan(args.plan,args.plan_sha256,mode);s=p['spec'];a=s['accepted'];rid=s['releaseId']
    check_ci_records(p)
    if mode!='qualify':check_qualification(p)
    root=ROOT;root.mkdir(mode=0o700,exist_ok=True);require(not root.is_symlink(),'Unsafe private release root')
    out=safe_private(args.verify_installed) if mode=='verify' else root/(rid+'-release-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+str(os.getpid()))
    require(out.parent==root.resolve(),'Evidence path outside release root')
    if mode=='verify':
        report=load(out/'release-summary.json')
        require(report.get('release_id')==rid and report.get('source')==p['source'] and report.get('plan_sha256')==args.plan_sha256 and report.get('R4')=='VERIFIED' and report.get('R5')=='INSTALLED','No installed checkpoint for exact plan')
    else:
        for old in root.glob(rid+'-release-*/release-summary.json'):
            j=load(old)
            require(j.get('R4')==j.get('R5')=='NOT_ATTEMPTED','Previous cutover attempted; reconcile, do not retry')
        out.mkdir(mode=0o700)
        report={'release_id':rid,'source':p['source'],'source_tree':p['source_tree'],'plan_sha256':args.plan_sha256,
          'baseline_source':a['source'],'candidate_only':mode=='qualify','status':'PREFLIGHT_HOLD','checks':{},'errors':[],
          'R4':'NOT_ATTEMPTED','R5':'NOT_ATTEMPTED','database_restore_tested':False,'owner_acceptance':'NOT_RUN'}
    def checkpoint():save(out/'release-summary.json',report)
    checkpoint();env=None;print('Private release evidence:',out,flush=True)
    def check(name,fn):
        try:
            value=fn();report['checks'][name]='PASS';checkpoint();return value
        except Exception as e:
            report['checks'][name]='HOLD';report['errors'].append({'check':name,'reason':str(e) if isinstance(e,Stop) else type(e).__name__});checkpoint();raise
    try:
        if mode=='verify':
            with tempfile.TemporaryDirectory(prefix='verify-helpers-',dir=out) as tmp:
                q,i,rec,r,prior=extract_helpers(args.downloads,Path(tmp));prior,_,_=previous(q,i,rec,r,prior,p,Path(tmp));i.OLD_VERSION=a['worker']['version_id']
                work=out/'source';check_source(q,work,p,prior,mode)
                cli=[q.tool('npx'),'--yes','wrangler@4.167.0']
                require(i.cloud(cli,work)==report['new_worker'],'Active Worker differs from recorded checkpoint')
                rows=candidate_check(out,report)
                if args.browser_evidence:
                    require(sha(out/'asset-verification.json')==report['verification_evidence_sha256'],'Stored verification evidence changed')
                    record=load(args.browser_evidence);check_browser_record(report,record)
                    require(input('Type RECORD BROWSER '+rid+': ').strip()=='RECORD BROWSER '+rid,'Browser evidence not attested')
                    report['browser_verification']={'status':'OWNER_ATTESTED_EXPECTED_401','evidence_sha256':sha(args.browser_evidence),'ray_id':record['ray_id']}
                    report['status']='INSTALLED_BROWSER_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING';return 0
                write_verification(out,report,rows)
                return 0 if report['status']=='INSTALLED_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING' else 1
        if mode=='qualify':
            for key in ('CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_KEY','SUPABASE_ACCESS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','PGPASSWORD','PGHOST','PGUSER','PGDATABASE','PGPORT'):
                os.environ.pop(key,None)
        q,i,rec,r,prior=extract_helpers(args.downloads,out)
        record_helper_contract(q,i,rec,out)
        prior,baseline_assets,old_dir=previous(q,i,rec,r,prior,p,out)
        i.OLD_VERSION=a['worker']['version_id']
        q.SOURCE=p['source'];q.BASELINE=Path(p['prior_migrations'][-1]['file']).name
        q.MIGRATIONS=[Path(x['file']).name for x in p['migrations']];q.EXPECTED=prior
        def tools():
            for n in ('git','node','npx','psql','pg_dump','pg_restore'):q.tool(n)
            for n in ('initdb','pg_ctl'):require((args.pg_bin/n).is_file(),'Missing PostgreSQL reference tool '+n)
            require(q.run([q.tool('node'),'--version']).startswith('v22.'),'Node 22 required')
            require('17.' in q.run([args.pg_bin/'initdb','--version']),'PostgreSQL 17 reference required')
            require(all(re.search(r'\b19\.',q.run([q.tool(n),'--version'])) for n in ('pg_dump','pg_restore')),'Verified libpq 19 required')
        check('tools',tools)
        def source():
            repo=args.repo.resolve();require(remote_refs(repo)=={'refs/heads/main':p['main'],'refs/heads/data':a['data']},'Remote source/data mismatch')
            q.git(repo,'fetch','--no-tags','origin','main','data',*([s['candidateBranch']] if mode=='qualify' else []))
            work=out/'source';q.git(repo,'worktree','add','--detach',str(work),p['source'])
            check_source(q,work,p,prior,mode)
            data=work/'data';data.mkdir(exist_ok=True)
            names=sorted(x for x in q.git(repo,'ls-tree','-r','--name-only',a['data']).splitlines() if x.endswith('.enc.json'))
            require(names==sorted(x['file'] for x in prior['encrypted_assets']),'Protected inventory differs')
            for item in prior['encrypted_assets']:
                f=data/item['file'];f.write_bytes(q.git(repo,'show',a['data']+':'+item['file'],binary=True))
                require(sha(f)==item['sha256'],'Protected ciphertext changed')
            return work
        work=check('source',source);cli=[q.tool('npx'),'--yes','wrangler@4.167.0'];psql=q.tool('psql')
        def build():
            q.worker_candidate(work,out,report);entry=i.bundle_entry(out)
            dest=out/'transport-dry-run';dest.mkdir()
            q.run(cli+['deploy',str(entry),'--no-bundle','--keep-vars','--config',CONFIG,'--dry-run','--outdir',str(dest)],cwd=work,label='transport dry run',timeout=600,log=out/'transport-private.log')
            emitted=[x for x in dest.rglob('*') if x.is_file() and x.suffix in ('.js','.mjs')]
            require(len(emitted)==1 and sha(emitted[0])==sha(entry),'Transport bundle bytes differ')
            return entry
        entry=check('build_and_transport',build)
        def reference():
            base,target=q.reference(work,out,args.pg_bin,psql)
            known={k:{'definition_md5':v,'execute':{'anon':[False,False],'authenticated':[True,False],'service_role':[True,False]}} for k,v in r.FOUR.items()}
            base,target=rec.overlay(base,known),rec.overlay(target,known)
            old=load(old_dir/'reference-candidate-private.json')
            if 'objects' in old:old=old['objects']
            check_additive_reference(base,target,rec.overlay(old,known),i,s)
            return base,target
        base,target=check('synthetic_reference',reference)
        rows=candidate_check(out,report);check_source(q,work,p,prior,mode)
        if mode=='qualify':
            report['status']='CANDIDATE_HELPERS_QUALIFIED_NO_PROVIDER_ACCESS';return 0
        def cloud():
            old=i.cloud(cli,work);require(all(old.get(k)==v for k,v in a['worker'].items()) and old.get('prior_version_available') and old.get('required_secret_present'),'Installed Worker identity drift');return old
        old=check('worker_baseline',cloud)
        def live_assets(label):
            result=verify_all(ORIGIN,baseline_assets);save(out/('baseline-assets-'+label+'.json'),result)
            require(result['status']=='PASS','Existing live assets differ')
        check('live_baseline_assets',lambda:live_assets('preflight'))
        def db():
            nonlocal env
            env=i.db_env();actual=q.catalogue(psql,env);require(actual['server_version'].startswith('17.'),'Production PostgreSQL major differs')
            require(i.query(psql,env,i.identity_sql())=='t','Existing founder/Coach identity differs')
            if actual['ledger_present'] and p['migrations']:
                versions=','.join(i.lit(Path(x['file']).name.split('_',1)[0]) for x in p['migrations'])
                require(not json.loads(i.query(psql,env,"select coalesce(json_agg(version),'[]'::json) from supabase_migrations.schema_migrations where version::text in ("+versions+')')),'Candidate migration already recorded')
            diff=q.diff(i.canonical(base),i.canonical(actual['objects']));save(out/'catalogue-differences.json',diff)
            require(q.equal(diff),'Production catalogue differs from accepted reference')
            return actual
        actual=check('database_baseline',db)
        report['status']='PREFLIGHT_PASS_NOT_INSTALLED';checkpoint()
        if mode=='preflight':return 0
        require(input('Review exact candidate visual evidence; type APPROVE VISUALS: ').strip()=='APPROVE VISUALS','Visual approval absent')
        require(input('Users signed out, auto Cloudflare builds disabled, prior version available; type READY: ').strip()=='READY','Maintenance not approved')
        require(input('Type INSTALL '+rid+' to authorise exact cutover: ').strip()=='INSTALL '+rid,'Installation not approved')
        check_ci_records(p);check_source(q,work,p,prior,mode);candidate_check(out,report)
        actual_objects=actual['objects'];expr=i.data_expr(actual_objects)
        def fingerprint():return json.loads(i.query(psql,env,"SET LOCAL TIME ZONE 'UTC'; "+expr))
        before=fingerprint();report['backup']=i.fresh_backup(env,out,actual_objects);checkpoint()
        require(fingerprint()==before and q.catalogue(psql,env)==actual and i.cloud(cli,work)==old,'Drift during backup')
        check_source(q,work,p,prior,mode);candidate_check(out,report);live_assets('before-migration')
        if p['migrations']:
            tables=[('tm_private',k.split(':',1)[1]) for k,v in actual_objects.items() if k.startswith('relation:') and v['kind'] in ('r','p')]+[('auth','users'),('auth','identities')]
            locks=', '.join(q.ident(schema)+'.'+q.ident(table) for schema,table in sorted(tables))
            sql="SET TRANSACTION READ WRITE;\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='10s';\nSET LOCAL statement_timeout='180s';\nSET LOCAL TIME ZONE 'UTC';\nLOCK TABLE "+locks+" IN SHARE ROW EXCLUSIVE MODE;\n"
            sql+=i.catalogue_check_sql(actual_objects,'Forward pre-commit catalogue drift')
            guard="DO $forward$ BEGIN IF ("+expr+") IS DISTINCT FROM "+i.js(before)+" THEN RAISE EXCEPTION 'Existing data changed'; END IF; END $forward$;\n"
            sql+=guard
            for item in p['migrations']:
                path=work/item['file'];require(sha(path)==item['sha256'],'Migration checksum differs');sql+=strip_wrapper(path.read_text())
            sql+=i.catalogue_check_sql(target,'Forward post-migration catalogue mismatch',True)+guard+initial_guard(i,s)
            path=out/'migration-private.sql';path.write_text(sql);path.chmod(0o600)
            report.update(R4='ATTEMPTED_OUTCOME_UNKNOWN',status='MIGRATION_ATTEMPTED_RECONCILE_BEFORE_RETRY');checkpoint()
            q.run([psql,'-X','-w','-q','-v','ON_ERROR_STOP=1','--single-transaction','-f',path],env=dict(env,PGOPTIONS='-c default_transaction_read_only=off'),label='guarded forward migration',log=out/'migration-private.log',timeout=600)
            report['R4']='COMMITTED';checkpoint()
        require(i.canonical(q.catalogue(psql,env)['objects'])==i.canonical(target) and fingerprint()==before and i.query(psql,env,i.identity_sql())=='t','Post-migration data/schema verification HOLD')
        report['R4']='VERIFIED';checkpoint();env.pop('PGPASSWORD',None)
        require(i.cloud(cli,work)==old,'Worker changed before cutover')
        check_source(q,work,p,prior,mode);candidate_check(out,report)
        report.update(R5='ATTEMPTED_OUTCOME_UNKNOWN',status='DEPLOYMENT_ATTEMPTED_RECONCILE_BEFORE_RETRY');checkpoint()
        q.run(cli+['deploy',str(entry),'--no-bundle','--keep-vars','--config',CONFIG],cwd=work,label='controlled Worker cutover',log=out/'worker-deploy-private.log',timeout=900)
        new=i.cloud(cli,work);require(new['version_id']!=a['worker']['version_id'] and new['deployment_id']!=a['worker']['deployment_id'] and new['prior_version_available'] and new['required_secret_present'],'New Worker or rollback target not verified')
        report.update(R5='INSTALLED',status='INSTALLED_VERIFICATION_PENDING',new_worker=new);checkpoint()
        write_verification(out,report,rows);return 0 if report['status']=='INSTALLED_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING' else 1
    except Exception as e:
        report['errors'].append({'check':'controller','reason':str(e) if isinstance(e,Stop) else type(e).__name__})
        if mode=='verify':report['status']='INSTALLED_VERIFICATION_HOLD_NO_REDEPLOY'
        elif report['R4']!='NOT_ATTEMPTED' or report['R5']!='NOT_ATTEMPTED':report['status']='RECONCILE_BEFORE_RETRY_NO_AUTOMATIC_REDEPLOY'
        return 1
    finally:
        if env:env.pop('PGPASSWORD',None)
        checkpoint();print('Share only:',out/'release-summary.json');print('Status:',report['status'])
if __name__=='__main__':
    try:raise SystemExit(main())
    except Stop as e:print('HOLD:',e);raise SystemExit(1)
