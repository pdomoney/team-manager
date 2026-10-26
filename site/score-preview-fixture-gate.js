// P11D — strict fixture/competition binding for the transient source points
// preview. This is a display-only guard: it never grants scoring, writes match
// results, verifies competition rules or changes any trusted coach workspace.
const frozen=Object.freeze;
const txt=x=>typeof x==='string'?x.trim():'';
const result=(status,reason)=>frozen({
  allowed:status==='available',status,reason,
  previewOnly:true,maySaveScore:false,mayChangeWorkspace:false,
  competitionPolicyApproved:false
});
export function fixtureScorePreviewGate(policy,match,link,teamId){
  if(!policy||policy.persistable!==false||policy.changesWorkspace!==false||
     !txt(policy.sport)||!Array.isArray(policy.events))
    return result('unsupported','No supported source-only preview policy is selected.');
  if(!match||typeof match!=='object'||Array.isArray(match)||!txt(match.id)||
     !txt(teamId))return result('unavailable','No exact team and fixture were identified.');
  const entryId=txt(match.entryId);
  if(!entryId){
    return result('available','Unlinked fixture: example points only, not an approved competition format.');
  }
  if(match.friendly===true)return result('fixture-conflict','Friendly fixtures must not also be bound to a competition entry.');
  const entry=link&&typeof link==='object'?link.entry:null;
  const competition=link&&typeof link==='object'?link.comp:null;
  if(!entry||!competition||typeof entry!=='object'||typeof competition!=='object'||
     txt(entry.id)!==entryId)
    return result('missing-entry','The fixture competition link cannot be resolved. Review the fixture before using this preview.');
  if(txt(entry.teamId)!==txt(teamId))
    return result('team-mismatch','This competition entry belongs to a different team.');
  if(entry.status!=='entered')
    return result('not-entered','This team is not currently entered in the linked competition.');
  if(!txt(competition.sport))
    return result('unknown-competition-sport','The linked competition has no recorded sport. Confirm it before previewing.');
  if(txt(competition.sport)!==txt(policy.sport))
    return result('sport-mismatch','The linked competition sport differs from the team scoring reference.');
  const matchSeason=txt(match.seasonId),entrySeason=txt(entry.seasonId);
  if(!matchSeason||!entrySeason)
    return result('season-not-resolved','The match and competition entry need an explicit matching season.');
  if(matchSeason!==entrySeason)
    return result('season-mismatch','This fixture and its competition entry belong to different seasons.');
  return result('available','Linked sport, entry and season are consistent. Competition rules still require human approval.');
}
