#!/usr/bin/env python3
"""One local entrypoint for forward qualification and separately approved installation.
Run from an exact reviewed controller checkout; never check out or alter the user's worktree.
"""
import argparse, datetime as dt, os, subprocess, sys, tempfile
from pathlib import Path
from consolidated_release import Stop,require,sha,save,load
from forward_release_plan import ROOT,safe_private,build_candidate_plan,build_merged_plan,validate_plan_structure

def run_controller(args,mode,plan,extra=()):
    argv=[sys.executable,'-B',str(Path(__file__).with_name('forward_release.py')),
      '--mode',mode,'--repo',str(args.repo),'--downloads',str(args.downloads),'--pg-bin',str(args.pg_bin),
      '--plan',str(plan),'--plan-sha256',sha(plan),*extra]
    return subprocess.run(argv,check=False).returncode
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('mode',choices=['qualify','preflight','install','verify'])
    ap.add_argument('--repo',type=Path,default=Path.home()/'src/team-manager')
    ap.add_argument('--downloads',type=Path,default=Path.home()/'Downloads')
    ap.add_argument('--pg-bin',type=Path,default=Path('/opt/homebrew/opt/postgresql@17/bin'))
    ap.add_argument('--spec',default='config/releases/pr300.json');ap.add_argument('--branch')
    ap.add_argument('--previous-dir',type=Path);ap.add_argument('--previous-plan',type=Path)
    ap.add_argument('--control-contract');ap.add_argument('--handoff',type=Path)
    ap.add_argument('--verify-installed',type=Path);ap.add_argument('--browser-evidence',type=Path)
    args=ap.parse_args();os.umask(0o077)
    if args.mode=='qualify':
        require(args.branch and args.previous_dir and args.previous_plan and not args.handoff,'Qualification inputs missing')
        p=build_candidate_plan(args.repo,args.spec,args.branch,args.previous_dir,args.previous_plan,args.control_contract)
        validate_plan_structure(p)
        hand=Path(tempfile.mkdtemp(prefix=p['spec']['releaseId']+'-qualification-',dir=ROOT))
        plan=hand/'qualification-plan.json';save(plan,p)
        print('Qualification handoff:',hand,flush=True)
        rc=run_controller(args,'qualify',plan)
        if rc:return rc
        # Resolve exactly one successful checkpoint for this unique plan.
        matches=[]
        for f in ROOT.glob(p['spec']['releaseId']+'-release-*/release-summary.json'):
            j=load(f)
            if j.get('plan_sha256')==sha(plan) and j.get('status')=='CANDIDATE_HELPERS_QUALIFIED_NO_PROVIDER_ACCESS':matches.append(f.parent)
        require(len(matches)==1,'Unique successful qualification evidence not found')
        save(hand/'qualification-evidence.json',{'plan_sha256':sha(plan),'directory':str(matches[0])})
        print('QUALIFICATION_HANDOFF_READY_NO_PROVIDER_ACCESS:',hand,flush=True);return 0
    require(args.handoff is not None,'Successful qualification handoff required')
    hand=safe_private(args.handoff)
    plan=hand/'qualification-plan.json';e=load(hand/'qualification-evidence.json')
    require(sha(plan)==e['plan_sha256'],'Qualification handoff changed')
    merged=hand/'merged-plan.json'
    if not merged.exists():
        require(args.mode!='verify','Installed verification requires original merged plan')
        p=build_merged_plan(args.repo,plan,e['plan_sha256'],Path(e['directory']))
        validate_plan_structure(p);save(merged,p)
        save(hand/'merged-plan-digest.json',{'sha256':sha(merged)})
    require(sha(merged)==load(hand/'merged-plan-digest.json')['sha256'],'Merged plan changed')
    extra=[]
    if args.mode=='verify':
        require(args.verify_installed is not None,'Installed evidence directory required')
        extra=['--verify-installed',str(args.verify_installed)]
        if args.browser_evidence:extra+=['--browser-evidence',str(args.browser_evidence)]
    else:require(not args.verify_installed and not args.browser_evidence,'Verification inputs require verify mode')
    return run_controller(args,args.mode,merged,extra)
if __name__=='__main__':
    try:raise SystemExit(main())
    except (Stop,OSError,ValueError,KeyError,subprocess.SubprocessError) as e:
        print('HOLD:',str(e) if isinstance(e,Stop) else type(e).__name__);raise SystemExit(1)
