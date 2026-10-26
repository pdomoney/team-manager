// Post-P10 #62 Stage B: fixed, read-only QA walkthroughs for fictional roles/scopes.
// No access tokens, real workspace, people, guardians, contacts, or persistence.
import { qaPreview } from './p11-qa-personas.js';
const FIXTURES=Object.freeze({
  owner:Object.freeze([
    ['platform','Review platform structure','Walk through the fictional association catalogue.',
      ['Review the selected simulated platform.','Inspect the example associations, then their clubs.','Confirm the overview makes no claim of production access.']],
    ['licensing','Compare licence concepts','Review hypothetical licence allocation without issuing licences.',
      ['Confirm two example associations appear in the preview.','Review which clubs and teams sit under each association.','Record a design question; no licence is created or billed.']],
    ['audit','Check role boundaries','Identify where authenticated permission checks would eventually belong.',
      ['Start from the simulated Owner view.','Check that child, volunteer and private person data are absent.','Confirm real access enforcement remains deferred to issue #55.']]
  ]),
  association:Object.freeze([
    ['affiliates','Review affiliated clubs','Inspect the clubs belonging to one fictional association.',
      ['Choose the example association using the context selector.','Review only its affiliated example clubs.','Check the visible teams are children of these clubs.']],
    ['seasons','Plan association season','Review a sample cross-club season navigation concept.',
      ['Identify all teams in the currently selected example association.','Discuss a common season/competition flow across these teams.','Leave the real fixture schedule and data unchanged.']],
    ['reporting','Preview organisation report','Review which teams would contribute to an association summary.',
      ['Confirm the example association scope.','Inspect the synthetic club and team names shown here.','Confirm individual child, contact and staff records remain hidden.']]
  ]),
  club:Object.freeze([
    ['team-admin','Review team administration','Inspect the teams within one example club.',
      ['Choose the example club using the context selector.','Check only its example teams appear in this panel.','Review a future club-level team administration flow without editing records.']],
    ['volunteers','Plan match-day staffing','Consider synthetic staffing workflow concepts for the selected club.',
      ['Check the example club scope before reviewing staff workflows.','Discuss which team-specific positions the sport would require.','No accreditation, eligibility or WWCC clearance is granted.']],
    ['branding','Review club branding','Plan the shared club colours and crest workflow.',
      ['Check the example club is selected.','Review which example teams would inherit club branding.','No logo or palette is saved to actual records.']]
  ]),
  coach:Object.freeze([
    ['squad','Review team squad','Inspect a single synthetic team for the coach context.',
      ['Choose a single fictional team.','Confirm only that team appears in this walkthrough.','Plan player/position/jersey tasks without viewing people records.']],
    ['matchday','Plan match day','Walk through a team-scoped, fictional match-day workflow.',
      ['Confirm the selected synthetic team and sport.','Review the expected lineup, staffing and attendance steps.','No actual match, trainer appointment or player record is changed.']],
    ['training','Plan training','Outline a fictional team calendar and attendance workflow.',
      ['Confirm the example team and sport.','Review a training-session and notification sequence.','No actual session, contact or outbound message is created.']]
  ])
});
const options=p=>p.role==='owner'?p.associations:p.role==='association'?p.clubs:p.teams;
export function qaJourneys(role,scope) {
  const p=qaPreview(role,scope),defs=FIXTURES[role];if(!p||!defs)return [];
  return defs.map(([id,title,description,steps])=>({
    id,role:p.role,scope:p.scope,scopeLabel:p.scopeLabel,title,description,
    visibleEntities:options(p).map(v=>({id:v.id,name:v.name})),
    steps:[...steps],
    mode:'SYNTHETIC_READ_ONLY_NO_PERMISSIONS'
  }));
}
export function qaJourney(role,scope,id) {
  return qaJourneys(role,scope).find(j=>j.id===id)||null;
}
