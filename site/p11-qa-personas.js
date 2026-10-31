import {P12_SAMPLE_CLUBS,P12_SAMPLE_TEAMS} from './p12-qa-club-teams.js';
// Post-P10 #62: read-only, synthetic UI layout previews, never real role grants.
// IMPORTANT: do not pass a coach workspace, credentials, players or contacts to this module.
export const QA_ROLES=Object.freeze([
  Object.freeze({id:'owner',label:'Owner'}),
  Object.freeze({id:'association',label:'Association Admin'}),
  Object.freeze({id:'club',label:'Club Admin'}),
  Object.freeze({id:'coach',label:'Manager / Coach'})
]);
const ASSOCIATIONS=Object.freeze([
  Object.freeze({id:'qa-east',name:'Sample Harbour Sporting Association'}),
  Object.freeze({id:'qa-west',name:'Sample Valley Sporting Association'})
]);
// The P11 and P12 previews share one non-production club/team catalogue.
const CLUBS=P12_SAMPLE_CLUBS;
const TEAMS=P12_SAMPLE_TEAMS;
const WORKFLOWS=Object.freeze({
  owner:Object.freeze(['Platform configuration concept','Association catalogue concept','Licence review concept']),
  association:Object.freeze(['Affiliated clubs concept','Association seasons concept','Organisation report concept']),
  club:Object.freeze(['Teams and seasons concept','Volunteer register concept','Club branding concept']),
  coach:Object.freeze(['Team squad concept','Match day concept','Training calendar concept'])
});
const noPrivate=x=>({id:x.id,name:x.name,...(x.sport?{sport:x.sport}:{})});
export function qaPreview(role,scope) {
  if (!QA_ROLES.some(r=>r.id===role)) return null;
  const scopes=role==='owner'?[{id:'qa-platform',name:'Synthetic platform'}]
    :role==='association'?ASSOCIATIONS.map(noPrivate)
    :role==='club'?CLUBS.map(noPrivate)
    :TEAMS.map(noPrivate);
  const chosen=scopes.find(s=>s.id===scope)||scopes[0];
  const selectedAssociation=role==='association'?chosen.id:null;
  const selectedClub=role==='club'?chosen.id:role==='coach'?TEAMS.find(t=>t.id===chosen.id)?.clubId:null;
  const assocIds=selectedAssociation?[selectedAssociation]:role==='club'||role==='coach'
    ?[CLUBS.find(c=>c.id===selectedClub)?.associationId].filter(Boolean):ASSOCIATIONS.map(x=>x.id);
  const clubs=CLUBS.filter(c=>assocIds.includes(c.associationId)&&(!selectedClub||c.id===selectedClub));
  const clubIds=new Set(clubs.map(c=>c.id));
  const teams=TEAMS.filter(t=>clubIds.has(t.clubId)&&(role!=='coach'||t.id===chosen.id));
  return {
    mode:'SYNTHETIC_LAYOUT_ONLY_NO_AUTHENTICATION',
    role,roleLabel:QA_ROLES.find(r=>r.id===role).label,
    scope:chosen.id,scopeLabel:chosen.name,scopes,
    associations:ASSOCIATIONS.filter(a=>assocIds.includes(a.id)).map(noPrivate),
    clubs:clubs.map(noPrivate),teams:teams.map(noPrivate),
    workflows:[...WORKFLOWS[role]]
  };
}
