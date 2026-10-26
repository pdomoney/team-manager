// P11E: read-only, coach-initiated rules confirmation checklist for one fixture.
// Does not change rule approvals, saved match results, accreditation, roles,
// competition data or encrypted workspace. No personal or team contact fields.
const clean=x=>typeof x==='string'?x.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,150):'';
const text=x=>clean(x)||'Not specified';
const issue=(id,label)=>Object.freeze({id,label});
const items=Object.freeze([
  issue('rule-edition','Obtain the organiser-approved current rulebook edition, effective date and local by-laws.'),
  issue('score-events','Confirm scoring events and point values, including junior and mixed-category variations.'),
  issue('team-roles','Confirm on-field player counts, positions, bench, substitution and interchange limits.'),
  issue('periods','Confirm playing periods, clock, forfeit rules and any competition exceptions.'),
  issue('authorisation','Record the organiser contact/decision and owner approval before enabling match scoring.')
]);
export function matchRulesConfirmationChecklist(review,match=null,link=null,teamId=''){
  if(!review||typeof review!=='object'||Array.isArray(review)||
     typeof review.sport!=='string'||!clean(review.sport))
    throw new TypeError('A resolved sport and its current source review are required');
  const fixture=match&&typeof match==='object'&&!Array.isArray(match)?match:{};
  const linked=!!clean(fixture.entryId),comp=link?.comp,entry=link?.entry;
  const blockers=[];
  if(review.crossSportRulePack)blockers.push('The selected rulebook belongs to a different sport.');
  for(const field of ['competition','season','ageGroup','category']){
    if(!clean(review[field]))blockers.push('Confirm '+({competition:'competition name',season:'match season',ageGroup:'age group',category:'category'}[field])+'.');
  }
  if(!review.source)blockers.push('Identify the applicable official rulebook.');
  if(linked){
    if(!comp||!entry||clean(entry.id)!==clean(fixture.entryId))
      blockers.push('Resolve the fixture competition entry.');
    else{
      if(clean(entry.teamId)!==clean(teamId)||!clean(teamId))
        blockers.push('The competition entry must belong to the selected team.');
      if(entry.status!=='entered')blockers.push('The team is not entered in this competition.');
      if(!clean(comp.sport)||clean(comp.sport)!==clean(review.sport))
        blockers.push('The competition sport is missing or differs from the team.');
      if(!clean(fixture.seasonId)||!clean(entry.seasonId)||
         clean(fixture.seasonId)!==clean(entry.seasonId))
        blockers.push('The fixture and competition entry must have matching recorded seasons.');
    }
  }
  const scope=Object.freeze({
    sport:text(review.sport),competition:text(review.competition),
    season:text(review.season),ageGroup:text(review.ageGroup),
    category:text(review.category),ruleSet:text(review.configuredRulePack),
    reference:review.source
      ?text(review.source.title)+' · '+text(review.source.edition)
      :'No applicable source selected',
    // Source URL is already host-checked by matchFormatSourceReview; no raw URL
    // from a match, coach-entered field, or caller-supplied link is copied.
    sourceUrl:review.source ? clean(review.source.url) : '',
    fixtureAssociation:linked?'Linked competition entry':'No competition entry linked'
  });
  const warnings=Object.freeze([...new Set(blockers)]);
  const requestLines=[
    'TEAM MANAGER — Competition Match Day rules confirmation request',
    '',
    'Sport: '+scope.sport,
    'Competition: '+scope.competition,
    'Season: '+scope.season,
    'Age group: '+scope.ageGroup,
    'Category: '+scope.category,
    'App reference pack: '+scope.ruleSet,
    'Existing reference: '+scope.reference,
    'Reference URL: '+(scope.sourceUrl||'Not available'),
    'Fixture association: '+scope.fixtureAssociation,
    '',
    'PRELIMINARY CHECKS (not an approval):',
    ...(warnings.length?warnings.map((x,i)=>(i+1)+'. '+x):['No missing scope flags; all rule approvals remain outstanding.']),
    '',
    'PLEASE CONFIRM WITH THE ORGANISER:',
    ...items.map((x,i)=>(i+1)+'. '+x.label),
    '',
    'Evidence to record: applicable competition/grade, official source, edition/effective date,',
    'local by-laws, reviewer and decision date, approval scope and withdrawal conditions.',
    'STATUS: Not independently verified. Nothing approved, saved or sent by Team Manager.'
  ];
  return Object.freeze({
    scope,blockers:warnings,questions:items,
    state:warnings.length?'scope_review_required':'rules_confirmation_required',
    readyForScorekeeping:false,localOrganiserApproved:false,
    ownerApproved:false,mutatedWorkspace:false,
    copyText:requestLines.join('\n')
  });
}
