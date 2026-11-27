"""Reusable, read-only release plan preparation. Historical controllers stay frozen."""
import argparse, hashlib, json, os, re, subprocess
from pathlib import Path
from urllib.request import Request, build_opener
from asset_verification import NoRedirect
from consolidated_release import Stop,require,sha,save,load,candidate_check,expected_assets

REPO='pdomoney/team-manager'
ROOT=Path.home()/'TeamManager-Private-Backups'
JOBS={'test','stage1-postgres','browser','browser-webkit'}
HEX40=re.compile(r'^[a-f0-9]{40}$')
HEX64=re.compile(r'^[a-f0-9]{64}$')
MIG=re.compile(r'^[0-9]{14}_[a-z0-9_]+\.sql$')
SAFE_TABLE=re.compile(r'^[a-z][a-z0-9_]{0,62}$')
def git(repo,*args,binary=False):
    p=subprocess.run(['git','-C',str(repo),*args],capture_output=True,check=True,timeout=180)
    return p.stdout if binary else p.stdout.decode().strip()
def digest(data):return hashlib.sha256(data).hexdigest()
def remote_refs(repo):
    require(git(repo,'remote','get-url','origin') in ('https://github.com/'+REPO,'https://github.com/'+REPO+'.git','git@github.com:'+REPO+'.git'),'Wrong repository')
    out={}
    for line in git(repo,'ls-remote','origin','refs/heads/main','refs/heads/data').splitlines():
        value,name=line.split();out[name]=value
    require(set(out)=={'refs/heads/main','refs/heads/data'},'Remote branch inventory missing')
    return out
def api(path):
    # Read-only GitHub REST; no tokens printed or persisted.
    require(path.startswith('/') and '..' not in path,'Invalid GitHub API path')
    headers={'Accept':'application/vnd.github+json','User-Agent':'TeamManager-forward-release'}
    token=os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')
    if token:headers['Authorization']='Bearer '+token
    with build_opener(NoRedirect()).open(Request('https://api.github.com/repos/'+REPO+path,headers=headers),timeout=30) as res:
        return json.load(res)
def ci(source,event,branch,run_id=None):
    if run_id is None:
        runs=api('/actions/runs?head_sha='+source+'&per_page=30')['workflow_runs']
        match=[r for r in runs if r.get('name')=='Tests' and r.get('event')==event and r.get('head_branch')==branch]
        require(bool(match),'Exact source Tests run absent')
        run_id=max(match,key=lambda r:r['id'])['id']
    require(type(run_id) is int and run_id>0,'Invalid CI run identity')
    run=api('/actions/runs/'+str(run_id))
    require(run.get('head_sha')==source and run.get('event')==event and run.get('head_branch')==branch and
      run.get('name')=='Tests' and run.get('status')=='completed' and run.get('conclusion')=='success','Exact source Tests run not successful')
    rows=api('/actions/runs/'+str(run_id)+'/jobs?per_page=100')
    require(rows.get('total_count')==4 and {j['name'] for j in rows['jobs']}==JOBS and
       all(j.get('status')=='completed' and j.get('conclusion')=='success' for j in rows['jobs']),'Required CI jobs not successful')
    return {'source':source,'event':event,'branch':branch,'run_id':run_id,'status':'PASS'}
def inventory(repo,source):
    names=git(repo,'ls-tree','-r','--name-only',source,'supabase/migrations').splitlines()
    require(all(n.startswith('supabase/migrations/') and MIG.fullmatch(Path(n).name) for n in names),'Unexpected migration filename')
    return [{'file':n,'sha256':digest(git(repo,'show',source+':'+n,binary=True))} for n in sorted(names)]
def spec_for(repo,source,path):
    require(re.fullmatch(r'config/releases/pr[0-9]+\.json',path),'Invalid release specification path')
    s=json.loads(git(repo,'show',source+':'+path,binary=True))
    validate_spec(s)
    return s
def validate_spec(s):
    keys={'releaseId','candidateBranch','developmentBase','accepted','migrations','newEmptyTables','existingSchemaChanges','ruleActivation'}
    require(isinstance(s,dict) and set(s)==(keys|{'stage4'} if s.get('releaseId')=='PR308' else keys),'Invalid release specification')
    if s.get('releaseId')=='PR308':
        x=s['stage4'];b=s['accepted'].get('browserRecovery',{})
        require(set(x)=={'applicationSource','applicationCandidate','applicationBase','applicationTree','applicationBranch','releasePaths','freeAccountCollection'} and
          x['applicationSource']==s['developmentBase'] and all(HEX40.fullmatch(x[k]) for k in ('applicationSource','applicationCandidate','applicationBase','applicationTree')) and
          x['applicationBranch']=='candidate/pr306-stage4-templates-imports' and x['freeAccountCollection']=='DISABLED','Invalid Stage 4 authority')
        require(x['releasePaths']==["config/releases/pr308.json","docs/operations/pr308-stage4-production-release.md","scripts/release/forward_release.py","scripts/release/forward_release_plan.py","scripts/release/test_forward_release.py","scripts/stage3d3-existing-worker-build.mjs","scripts/stage3d3-existing-worker-release-check.mjs","test/stage3d3-existing-worker-release-check.test.js","wrangler.stage3d4-existing.jsonc"],'Stage 4 release-only paths differ')
        require(set(b)=={'verificationSha256','recordFile'} and HEX64.fullmatch(b['verificationSha256']) and b['recordFile']=='pr308-baseline-browser.json','Invalid baseline recovery contract')
    else:require('browserRecovery' not in s['accepted'],'Historical recovery cannot transfer')
    require(re.fullmatch(r'PR[0-9]+',s['releaseId']) and s['candidateBranch'].startswith('candidate/'+s['releaseId'].lower()+'-') and
      re.fullmatch(r'candidate/[a-z0-9-]+',s['candidateBranch']),'Invalid release identity')
    a=s['accepted'];require(all(HEX40.fullmatch(a.get(k,'')) for k in ('source','control','data')) and HEX40.fullmatch(s['developmentBase']),'Invalid baseline commit')
    require(all(HEX64.fullmatch(a.get(k,'')) for k in ('manifest','plan')) and type(a.get('migrationCount')) is int and a['migrationCount']>0,'Invalid accepted evidence pins')
    require(a.get('ownerAcceptance',{}).get('status')=='OWNER_ACCEPTED' and a['ownerAcceptance'].get('passed')==a['ownerAcceptance'].get('checks') and a['ownerAcceptance'].get('checks',0)>0,'Prior owner acceptance missing')
    require(type(a.get('assets')) is int and a['assets']>0 and a.get('encryptedAssets')==8,'Unexpected baseline asset inventory')
    require(set(a.get('worker',{}))=={'version_id','deployment_id'} and all(re.fullmatch(r'[a-f0-9-]{36}',v) for v in a['worker'].values()),'Invalid Worker identity')
    require(isinstance(s['migrations'],list) and s['migrations']==sorted(set(s['migrations'])) and all(MIG.fullmatch(n) for n in s['migrations']),'Invalid migration list')
    require(isinstance(s['newEmptyTables'],list) and len(set(s['newEmptyTables']))==len(s['newEmptyTables']) and all(SAFE_TABLE.fullmatch(n) for n in s['newEmptyTables']),'Invalid new table list')
    require(s['existingSchemaChanges']==[],'This forward controller supports additive schemas only; use a reviewed compatibility path for other changes')
    require(s['ruleActivation']=='NOT_APPROVED_NO_PROFILE_SEEDED','Rule activation requires a separate reviewed release contract')
def check_source_inventory(repo,source,spec):
    a=spec['accepted']
    for parent,child in ((a['source'],a['control']),(a['control'],spec['developmentBase']),(spec['developmentBase'],source)):
        require(git(repo,'merge-base',parent,child)==parent,'Release source ancestry differs')
    if 'stage4' in spec:
        x=spec['stage4']
        normal_merge(repo,306,x['applicationBranch'],x['applicationBase'],x['applicationCandidate'],x['applicationSource'],x['applicationTree'])
        require(set(git(repo,'diff','--name-only','--no-renames',x['applicationSource'],source).splitlines())==set(x['releasePaths']),'Stage 4 release changed unexpected source paths')
    prior=inventory(repo,a['source']);current=inventory(repo,source)
    require(len(prior)==a['migrationCount'] and current[:len(prior)]==prior,'Historical migration drift')
    added=current[len(prior):]
    require([Path(x['file']).name for x in added]==spec['migrations'],'Unexpected migration set')
    return prior,added
def safe_private(path,root=ROOT,kind='dir'):
    p=Path(path).expanduser()
    require(not p.is_symlink() and (p.is_dir() if kind=='dir' else p.is_file()),'Missing or unsafe private evidence')
    require(not root.is_symlink(),'Unsafe private release root')
    resolved=p.resolve();root=root.resolve()
    require(root in resolved.parents and not any(x.is_symlink() for x in p.absolute().parents if x!=root and root in x.parents),'Private evidence outside root or symlinked')
    return resolved
def accepted_evidence(spec,previous,previous_plan):
    a=spec['accepted'];previous=safe_private(previous);previous_plan=safe_private(previous_plan,kind='file')
    require(sha(previous_plan)==a['plan'],'Accepted installation plan changed')
    file=previous/'release-summary.json';require(file.is_file() and not file.is_symlink(),'Accepted summary missing')
    j=load(file);w=j.get('new_worker',{});v=j.get('verification',{})
    require(j.get('source')==a['source'] and j.get('plan_sha256')==a['plan'] and j.get('candidate_manifest_sha256')==a['manifest'] and
      j.get('R4')=='VERIFIED' and j.get('R5')=='INSTALLED' and j.get('encrypted_assets_verified')==a['encryptedAssets'],'Accepted installation checkpoint differs')
    recovery=a.get('browserRecovery')
    recovered=j.get('status')=='INSTALLED_VERIFICATION_HOLD_NO_REDEPLOY' and spec['releaseId']=='PR308' and recovery is not None
    require(recovered or j.get('status') in ('INSTALLED_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING','INSTALLED_BROWSER_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING'),'Accepted technical verification absent')
    require(all(j.get('checks',{}).get(k)=='PASS' for k in ('tools','source','build_and_transport','synthetic_reference','database_baseline','worker_baseline','live_baseline_assets')),'Accepted preflight evidence incomplete')
    require(all(w.get(k)==value for k,value in a['worker'].items()) and w.get('required_secret_present') is True and w.get('prior_version_available') is True,'Accepted Worker checkpoint differs')
    require(v.get('passed')==v.get('total')==a['assets'] and v.get('holds')==[],'Accepted asset verification differs')
    record_digest=None
    if recovered:
        # Keep the original HOLD report unchanged. Reconcile the recorded
        # browser denial using the exact prior nonce, manifest and version.
        from incremental_release import check_browser_record
        evidence=safe_private(previous/'asset-verification.json',kind='file')
        require(sha(evidence)==j.get('verification_evidence_sha256')==recovery['verificationSha256'],'PR300 verification evidence differs')
        record=safe_private(previous/recovery['recordFile'],kind='file')
        check_browser_record(j,load(record))
        record_digest=sha(record)
    elif j['status']=='INSTALLED_BROWSER_SMOKE_PASS_OWNER_ACCEPTANCE_PENDING':
        b=j.get('browser_verification',{})
        require(b.get('status')=='OWNER_ATTESTED_EXPECTED_401' and HEX64.fullmatch(b.get('evidence_sha256','')) and
          v.get('anonymousAuth',{}).get('browser_fallback_eligible') is True,'Accepted browser evidence absent')
    else:require(v.get('anonymousAuth',{}).get('expectedDenial') is True,'Accepted API denial absent')
    # Prior failed verification attempts are retained, not reclassified as success.
    rows=candidate_check(previous,j);assets=expected_assets(rows)
    require(len(assets)==a['assets'],'Accepted asset inventory differs')
    ref=previous/'reference-candidate-private.json';require(ref.is_file() and not ref.is_symlink(),'Accepted schema reference absent')
    result={'directory':str(previous),'plan_path':str(previous_plan),'summary_sha256':sha(file),'reference_sha256':sha(ref)}
    if record_digest:result['browser_record_sha256']=record_digest
    return result,assets
def validate_candidate_summary(path,p):
    path=safe_private(path);j=load(path/'release-summary.json')
    require(j.get('status')=='CANDIDATE_HELPERS_QUALIFIED_NO_PROVIDER_ACCESS' and j.get('candidate_only') is True and
      j.get('source')==p['source'] and j.get('source_tree')==p['source_tree'] and
      j.get('R4')==j.get('R5')=='NOT_ATTEMPTED' and not j.get('errors') and
      all(j.get('checks',{}).get(k)=='PASS' for k in ('tools','source','build_and_transport','synthetic_reference')),'Candidate qualification incomplete')
    require(j.get('plan_sha256')==p['plan_sha256'],'Candidate qualification plan differs')
    candidate_check(path,j)
    return {'directory':str(path),'summary_sha256':sha(path/'release-summary.json'),'plan_sha256':p['plan_sha256']}
def normal_merge(repo,pr_number,branch,base,head,merged,tree):
    require(all(HEX40.fullmatch(v or '') for v in (base,head,merged,tree)) and len({base,head,merged})==3,'Invalid merge identities')
    pr=api('/pulls/'+str(pr_number))
    require(pr.get('number')==pr_number and pr.get('merged') is True and
      pr.get('merge_commit_sha')==merged and pr.get('head',{}).get('sha')==head and
      pr['head'].get('ref')==branch and pr['head'].get('repo',{}).get('full_name')==REPO and
      pr.get('base',{}).get('ref')=='main' and pr['base'].get('repo',{}).get('full_name')==REPO,
      'PR merge authority differs')
    require(git(repo,'rev-list','--parents','-n','1',merged).split()==[merged,base,head],'Merge parents differ')
    require(git(repo,'rev-parse',head+'^{tree}')==git(repo,'rev-parse',merged+'^{tree}')==tree,'Candidate and merged trees differ')
def validate_control_contract(c,s):
    keys={'applicationRelease','applicationSource','applicationCandidate','applicationTree','controlPr','controlBranch','changedPaths'}
    chained=s['releaseId']=='PR308' and isinstance(c,dict) and c.get('controlPr')==310
    require(isinstance(c,dict) and set(c)==(keys|{'priorControl'} if chained else keys),'Invalid control contract')
    require(c['applicationRelease']==s['releaseId'] and all(HEX40.fullmatch(c[k]) for k in ('applicationSource','applicationCandidate','applicationTree')),'Control application pins differ')
    if s['releaseId']=='PR308':
        require((c['controlPr'],c['controlBranch']) in ((309,'candidate/pr309-pr308-checker-correction'),(310,'candidate/pr310-pr308-reference-qualification')),'Unexpected Stage 4 corrective control identity')
        if chained:
            require(c['priorControl']=={"source":"985cafdebc6252dd907ee867bd23f856474a14ee","head":"d8c90ddaea6d93840a326ec99d9dc0026473e7a1","tree":"dab39e55bc43d3e8062b37866749b520cf9ea3e0","pr":309,"branch":"candidate/pr309-pr308-checker-correction"},'PR309 historical control identity differs')
            require(c['changedPaths']==["config/releases/pr308-control.json","docs/operations/pr308-reference-qualification.md","scripts/release/forward_release.py","scripts/release/forward_release_plan.py","scripts/release/test_forward_release.py"],'PR310 corrective scope differs')
    require(type(c['controlPr']) is int and c['controlPr']>int(s['releaseId'][2:]) and re.fullmatch(r'candidate/pr'+str(c['controlPr'])+r'-[a-z0-9-]+',c['controlBranch']),'Invalid control PR identity')
    paths=c['changedPaths']
    require(isinstance(paths,list) and paths==sorted(set(paths)) and bool(paths),'Invalid control path list')
    allowed={'scripts/release/forward_release_plan.py','scripts/release/forward_release.py','scripts/release/test_forward_release.py',
      'scripts/release/forward_release_run.py','config/releases/'+s['releaseId'].lower()+'-control.json'}
    require(all(x in allowed or re.fullmatch(r'docs/operations/pr'+s['releaseId'][2:]+r'-[a-z0-9-]+\.md',x) for x in paths),'Control contract allows non-release changes')
    require({'scripts/release/forward_release_plan.py','scripts/release/forward_release.py','scripts/release/test_forward_release.py',
      'config/releases/'+s['releaseId'].lower()+'-control.json'}<=set(paths),'Required control files absent')
def control_for(repo,s,main,path,app,candidate,tree):
    require(path=='config/releases/'+s['releaseId'].lower()+'-control.json','Wrong control contract path')
    c=json.loads(git(repo,'show',main+':'+path,binary=True));validate_control_contract(c,s)
    require((c['applicationSource'],c['applicationCandidate'],c['applicationTree'])==(app,candidate,tree),'Control contract does not bind this application')
    control_head=git(repo,'rev-parse',main+'^2');control_tree=git(repo,'rev-parse',main+'^{tree}')
    base=app
    if 'priorControl' in c:
        prior=c['priorControl'];base=prior['source']
        historical=json.loads(git(repo,'show',base+':'+path,binary=True))
        validate_control_contract(historical,s)
        require(historical['controlPr']==prior['pr'] and historical['controlBranch']==prior['branch'] and
          (historical['applicationSource'],historical['applicationCandidate'],historical['applicationTree'])==(app,candidate,tree),'Historical control authority differs')
        normal_merge(repo,prior['pr'],prior['branch'],app,prior['head'],base,prior['tree'])
        require(set(git(repo,'diff','--name-only','--no-renames',app,base).splitlines())==set(historical['changedPaths']),'Historical control changed unexpected paths')
        require(spec_for(repo,base,'config/releases/'+s['releaseId'].lower()+'.json')==s,'Historical control changed release specification')
    normal_merge(repo,c['controlPr'],c['controlBranch'],base,control_head,main,control_tree)
    require(set(git(repo,'diff','--name-only','--no-renames',base,main).splitlines())==set(c['changedPaths']),'Control PR changed unexpected files')
    require(spec_for(repo,main,'config/releases/'+s['releaseId'].lower()+'.json')==s,'Control changed release specification')
    return {'path':path,'contract':c,'head':control_head,'source':main,'tree':control_tree}
def check_release_authority(repo,p):
    s=p['spec'];require(remote_refs(repo)=={'refs/heads/main':p['main'],'refs/heads/data':s['accepted']['data']},'Remote main/data drift')
    if p['mode']=='candidate':
        require(git(repo,'ls-remote','origin','refs/heads/'+s['candidateBranch'])==p['source']+'\trefs/heads/'+s['candidateBranch'],'Candidate branch drift')
        return
    normal_merge(repo,int(s['releaseId'][2:]),s['candidateBranch'],s['developmentBase'],p['candidate_source'],p['source'],p['source_tree'])
    if 'control' in p:
        require(control_for(repo,s,p['main'],p['control']['path'],p['source'],p['candidate_source'],p['source_tree'])==p['control'],'Control authority changed')
    else:require(p['main']==p['source'],'Main differs without authorised control PR')
def control_ci_sources(c):
    contract=c['contract'];rows=[]
    if 'priorControl' in contract:
        h=contract['priorControl'];rows.extend([(h['head'],'push',h['branch']),(h['head'],'pull_request',h['branch']),(h['source'],'push','main')])
    b=contract['controlBranch']
    return rows+[(c['head'],'push',b),(c['head'],'pull_request',b),(c['source'],'push','main')]

def validate_plan_structure(p):
    require(isinstance(p,dict) and p.get('format')=='TEAM_MANAGER_FORWARD_V1' and p.get('mode') in ('candidate','postmerge','merged'),'Invalid plan format/mode')
    s=p['spec'];validate_spec(s);a=s['accepted']
    require(all(HEX40.fullmatch(p.get(k,'')) for k in ('source','source_tree','main')),'Invalid plan source')
    require(re.fullmatch(r'config/releases/pr[0-9]+\.json',p.get('spec_path','')),'Invalid spec path')
    post=p['mode']=='postmerge' or p.get('qualification_phase')=='postmerge'
    require(p.get('qualification_phase') in (None,'postmerge') and (p['mode']!='candidate' or not post),'Invalid qualification phase')
    require(p['mode']!='postmerge' or p.get('qualification_phase')=='postmerge','Missing post-merge qualification phase')
    if 'control' in p:
        require(post and p['mode']!='candidate','Control PR only permitted for post-merge qualification')
        c=p['control'];require(set(c)=={'path','contract','head','source','tree'},'Invalid control evidence')
        validate_control_contract(c['contract'],s)
        require(c['path']=='config/releases/'+s['releaseId'].lower()+'-control.json' and all(HEX40.fullmatch(c[k]) for k in ('head','source','tree')) and
          c['source']==p['main'] and c['source']!=p['source'] and
          (c['contract']['applicationSource'],c['contract']['applicationCandidate'],c['contract']['applicationTree'])==(p['source'],p.get('candidate_source'),p['source_tree']),'Control evidence differs')
    else:require(p['main']==(s['developmentBase'] if p['mode']=='candidate' else p['source']),'Wrong main authority')
    prior=p.get('prior_migrations',[]);added=p.get('migrations',[])
    require(isinstance(prior,list) and len(prior)==a['migrationCount'] and isinstance(added,list),'Invalid prior migration inventory')
    all_rows=prior+added
    require(all(isinstance(x,dict) and set(x)=={'file','sha256'} and re.fullmatch(r'supabase/migrations/[0-9]{14}_[a-z0-9_]+\.sql',x['file']) and HEX64.fullmatch(x['sha256']) for x in all_rows),'Invalid migration pin')
    require([x['file'] for x in all_rows]==sorted(set(x['file'] for x in all_rows)) and [Path(x['file']).name for x in added]==s['migrations'],'Migration list not exact')
    prev=p.get('previous',{})
    prev_keys={'directory','plan_path','summary_sha256','reference_sha256'}
    if s['releaseId']=='PR308' and 'browser_record_sha256' in prev:
        prev_keys.add('browser_record_sha256')
    require(set(prev)==prev_keys and all(HEX64.fullmatch(prev[k]) for k in prev_keys if k.endswith('sha256')),'Prior evidence not pinned')
    if p['mode']=='candidate':
        expected=[(p['source'],'push',s['candidateBranch'])]
    else:
        require(HEX40.fullmatch(p.get('candidate_source','')) and p['candidate_source']!=p['source'],'Missing qualified candidate source')
        expected=[(p['candidate_source'],'push',s['candidateBranch']),(p['candidate_source'],'pull_request',s['candidateBranch']),(p['source'],'push','main')]
    if 'control' in p:
        expected.extend(control_ci_sources(p['control']))
    rows=p.get('ci',[])
    require(len(rows)==len(expected) and all(set(row)=={'source','event','branch','run_id','status'} and
      (row['source'],row['event'],row['branch'])==item and type(row['run_id']) is int and row['run_id']>0 and row['status']=='PASS'
      for row,item in zip(rows,expected)),'CI not bound to exact release sources')
def check_ci_records(p):
    validate_plan_structure(p)
    for row in p['ci']:
        require(ci(row['source'],row['event'],row['branch'],row['run_id'])==row,'CI record changed')
def build_candidate_plan(repo,spec_path,branch,previous,previous_plan,control_path=None):
    refs=remote_refs(repo);main=refs['refs/heads/main']
    git(repo,'fetch','--no-tags','origin','main','data')
    require(git(repo,'rev-parse','origin/main')==main,'Main changed during fetch')
    # Read the existing specification on the current main when available; before
    # the first merge it may exist only on the candidate branch.
    if git(repo,'ls-tree','--name-only',main,spec_path):
        spec=spec_for(repo,main,spec_path)
    else:
        require(re.fullmatch(r'candidate/pr[0-9]+-[a-z0-9-]+',branch),'Invalid candidate branch')
        git(repo,'fetch','--no-tags','origin',branch)
        spec=spec_for(repo,git(repo,'rev-parse','origin/'+branch),spec_path)
    require(branch==spec['candidateBranch'] and refs['refs/heads/data']==spec['accepted']['data'],'Candidate/data authority differs')
    if main!=spec['developmentBase']:
        pr=api('/pulls/'+spec['releaseId'][2:])
        app=pr.get('merge_commit_sha','');candidate=pr.get('head',{}).get('sha','')
        require(pr.get('merged') is True and HEX40.fullmatch(app or '') and HEX40.fullmatch(candidate or ''),'Main differs and application PR is not merged')
        tree=git(repo,'rev-parse',app+'^{tree}')
        normal_merge(repo,int(spec['releaseId'][2:]),branch,spec['developmentBase'],candidate,app,tree)
        require(spec_for(repo,app,spec_path)==spec,'Application specification differs')
        control=None
        if main!=app:
            require(control_path is not None,'Main advanced beyond application: reviewed control contract required')
            control=control_for(repo,spec,main,control_path,app,candidate,tree)
        else:require(control_path is None,'Unexpected separate control contract')
        previous_record,_=accepted_evidence(spec,previous,previous_plan)
        prior,added=check_source_inventory(repo,app,spec)
        runs=[ci(candidate,'push',branch),ci(candidate,'pull_request',branch),ci(app,'push','main')]
        p={'format':'TEAM_MANAGER_FORWARD_V1','mode':'postmerge','qualification_phase':'postmerge','spec_path':spec_path,'spec':spec,
          'source':app,'candidate_source':candidate,'source_tree':tree,'main':main,'previous':previous_record,'prior_migrations':prior,'migrations':added,'ci':runs}
        if control:
            runs.extend(ci(source,event,branch) for source,event,branch in control_ci_sources(control));p['control']=control
        validate_plan_structure(p);check_release_authority(repo,p)
        return p
    require(control_path is None,'Separate control not permitted before application merge')
    git(repo,'fetch','--no-tags','origin',branch)
    source=git(repo,'rev-parse','origin/'+branch);require(spec_for(repo,source,spec_path)==spec,'Candidate specification differs')
    require(git(repo,'ls-remote','origin','refs/heads/'+branch)==source+'\trefs/heads/'+branch,'Candidate branch changed')
    previous_record,_=accepted_evidence(spec,previous,previous_plan)
    prior,added=check_source_inventory(repo,source,spec)
    return {'format':'TEAM_MANAGER_FORWARD_V1','mode':'candidate','spec_path':spec_path,'spec':spec,'source':source,
      'source_tree':git(repo,'rev-parse',source+'^{tree}'),'main':refs['refs/heads/main'],'previous':previous_record,
      'prior_migrations':prior,'migrations':added,'ci':[ci(source,'push',branch)]}
def build_merged_plan(repo,candidate_plan,candidate_digest,evidence):
    require(HEX64.fullmatch(candidate_digest or '') and sha(candidate_plan)==candidate_digest,'Candidate plan checksum differs')
    p=load(candidate_plan);validate_plan_structure(p)
    require(p['mode'] in ('candidate','postmerge'),'Not a qualification plan')
    spec=p['spec']
    c=dict(p,plan_sha256=candidate_digest);q=validate_candidate_summary(evidence,c)
    if p['mode']=='postmerge':
        git(repo,'fetch','--no-tags','origin','main','data')
        check_release_authority(repo,p);check_ci_records(p)
        require(spec_for(repo,p['source'],p['spec_path'])==spec,'Application specification changed')
        prior,added=check_source_inventory(repo,p['source'],spec)
        require(prior==p['prior_migrations'] and added==p['migrations'],'Merged migration inventory differs')
        prev,_=accepted_evidence(spec,p['previous']['directory'],p['previous']['plan_path'])
        require(prev==p['previous'],'Accepted baseline evidence changed')
        return dict(p,mode='merged',candidate_evidence=q)
    pr=api('/pulls/'+spec['releaseId'][2:])
    require(pr.get('merged') is True and pr.get('head',{}).get('sha')==p['source'] and pr.get('base',{}).get('ref')=='main','PR not merged from qualified candidate')
    source=pr.get('merge_commit_sha','');require(HEX40.fullmatch(source),'Invalid merge commit')
    refs=remote_refs(repo);require(refs=={'refs/heads/main':source,'refs/heads/data':spec['accepted']['data']},'Merged main/data differs')
    git(repo,'fetch','--no-tags','origin','main','data')
    normal_merge(repo,int(spec['releaseId'][2:]),spec['candidateBranch'],spec['developmentBase'],p['source'],source,p['source_tree'])
    require(spec_for(repo,source,p['spec_path'])==spec,'Merged specification differs')
    prior,added=check_source_inventory(repo,source,spec)
    require(prior==p['prior_migrations'] and added==p['migrations'],'Merged migration inventory differs')
    prev,_=accepted_evidence(spec,p['previous']['directory'],p['previous']['plan_path'])
    require(prev==p['previous'],'Accepted baseline evidence changed')
    check_ci_records(p)
    return dict(p,mode='merged',source=source,main=source,candidate_source=p['source'],candidate_evidence=q,
      ci=p['ci']+[ci(p['source'],'pull_request',spec['candidateBranch']),ci(source,'push','main')])
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',type=Path,default=Path.home()/'src/team-manager')
    ap.add_argument('--output',type=Path,required=True)
    ap.add_argument('--spec',default='config/releases/pr300.json');ap.add_argument('--branch');ap.add_argument('--control-contract')
    ap.add_argument('--previous-dir',type=Path);ap.add_argument('--previous-plan',type=Path)
    ap.add_argument('--candidate-plan',type=Path);ap.add_argument('--candidate-plan-sha256');ap.add_argument('--candidate-evidence',type=Path)
    args=ap.parse_args();os.umask(0o077)
    require(not args.output.exists() and not args.output.is_symlink(),'Do not overwrite a release plan')
    safe_private(args.output.parent)
    if args.candidate_plan:
        require(args.candidate_evidence is not None,'Candidate evidence required')
        p=build_merged_plan(args.repo,args.candidate_plan,args.candidate_plan_sha256,args.candidate_evidence)
    else:
        require(args.branch and args.previous_dir and args.previous_plan,'Candidate branch and accepted evidence required')
        p=build_candidate_plan(args.repo,args.spec,args.branch,args.previous_dir,args.previous_plan,args.control_contract)
    validate_plan_structure(p)
    save(args.output,p);print('Release plan:',args.output);print('Plan SHA-256:',sha(args.output));print('PLAN_READY_NO_PROVIDER_ACCESS')
if __name__=='__main__':
    try:main()
    except (Stop,OSError,ValueError,KeyError,subprocess.SubprocessError) as e:
        print('HOLD:',str(e) if isinstance(e,Stop) else type(e).__name__);raise SystemExit(1)
