// P12C: deterministic fictional people with independently scoped group roles.
// This module contains no real people, workspace access, storage, credentials or network.
// A test context is a preview label, NOT an authenticated identity or permission grant.
import {P12_ACCESS_ROLES,evaluateP12Access,listP12TestContexts} from './p12-role-groups.js';
import {P12_SAMPLE_GROUP_NAMES} from './p12-qa-club-teams.js';

const scope=(type,id)=>({type,id});
const grant=(role,type,id,status='active')=>({role,group:scope(type,id),status});
const membership=(type,groupType,id)=>({type,group:scope(groupType,id)});
const duty=(role,id)=>({role,fixtureId:id});
const assoc='qa-east',west='qa-west';
const comets='qa-comets',stars='qa-stars',rangers='qa-rangers';
const mixed='qa-comets-mixed',junior='qa-comets-juniors';
const women='qa-stars-women',rangers16='qa-rangers-16';
const fixture='qa-fixture-001';
const C=({id,label,grants=[],memberships=[],duties=[],note=''})=>
  Object.freeze({id,label,grants,memberships,duties,note});
const G=(role,type,id,status)=>grant(role,type,id,status);
const M=(type,groupType,id)=>membership(type,groupType,id);
const D=(role,id=fixture)=>duty(role,id);
export const P12_QA_PROFILES=Object.freeze([
  C({id:'qa-01',label:'Platform Owner',grants:[G('personal_owner','personal','qa-platform')]}),
  C({id:'qa-02',label:'Association Administrator',grants:[G('association_admin','association',assoc)]}),
  C({id:'qa-03',label:'Association Viewer',grants:[G('association_viewer','association',west)]}),
  C({id:'qa-04',label:'Club Administrator',grants:[G('club_admin','club',rangers)]}),
  C({id:'qa-05',label:'Large Club Administrator',grants:[G('club_admin','club',rangers),G('club_admin','club',comets)]}),
  C({id:'qa-06',label:'Club Support Officer',grants:[G('club_support','club',stars)]}),
  C({id:'qa-07',label:'Head Coach',grants:[G('team_coach','team',rangers16),G('team_coach','team','qa-rangers-u14')],duties:[D('head_coach')]}),
  C({id:'qa-08',label:'Assistant Coach',grants:[G('team_assistant','team',rangers16),G('team_assistant','team',junior)],duties:[D('assistant_coach')]}),
  C({id:'qa-09',label:'Team Manager',grants:[G('team_manager','team',mixed),G('team_manager','team','qa-comets-u12')],duties:[D('team_manager')]}),
  C({id:'qa-10',label:'Match Scorekeeper',grants:[G('fixture_scorekeeper','fixture',fixture)],duties:[D('scorekeeper')]}),
  C({id:'qa-11',label:'LeagueSafe Volunteer',memberships:[M('staff','club',rangers)],duties:[D('league_safe')],note:'Role eligibility needs competition-specific verification.'}),
  C({id:'qa-12',label:'Dual-qualified Trainer / Acting Coach',memberships:[M('staff','club',rangers)],duties:[D('trainer'),D('acting_coach')],note:'Both fixture duties are proposals only. Incompatible simultaneous duties must not be double-counted.'}),
  C({id:'qa-13',label:'Match-day Delegate',memberships:[M('staff','club',rangers)],duties:[D('match_delegate')]}),
  C({id:'qa-14',label:'Senior Multi-sport Player',memberships:[M('player','team',mixed),M('player','team',women)]}),
  C({id:'qa-15',label:'Junior Player',memberships:[M('player','team',junior)],note:'No personal, guardian or health information is included.'}),
  C({id:'qa-16',label:'Guardian with Two Children',memberships:[M('guardian','club',comets),M('guardian','club',stars)],note:'Two fictional guardian relationships; relationship alone grants no record access.'}),
  C({id:'qa-17',label:'General Volunteer',memberships:[M('helper','club',comets)],duties:[D('helper')]}),
  C({id:'qa-18',label:'Multi-role / Multi-club User',grants:[
    G('association_viewer','association',west),G('club_admin','club',rangers),
    G('team_coach','team',rangers16),G('team_coach','team','qa-rangers-u12'),G('team_manager','team',women),G('team_manager','team','qa-comets-u16'),
    G('club_support','club',comets)
  ],memberships:[M('player','team',mixed),M('helper','club',comets)],
  duties:[D('trainer'),D('acting_coach')],
  note:'One person, distinct roles and sporting appointments. A trainer does not become a coach merely by selecting a context.'}),
  C({id:'qa-19',label:'Revoked Coach',grants:[G('team_coach','team',rangers16,'revoked')],note:'An expired or revoked role must not allow team editing.'}),
  C({id:'qa-20',label:'Pending Invitation',grants:[G('team_manager','team',mixed,'proposed')],note:'Pending invitations never create app access.'})
]);
export const P12_QA_GROUP_NAMES=Object.freeze({
  ...P12_SAMPLE_GROUP_NAMES,
  'qa-platform':'Synthetic platform',
  [assoc]:'Sample Harbour Sporting Association',
  [west]:'Sample Valley Sporting Association',
  [fixture]:'Example Fixture 001'
});
const labelScope=g=>P12_QA_GROUP_NAMES[g.id]||'Unknown fictional group';
const contextId=(kind,role,group)=>kind+':'+role+':'+group.type+':'+group.id;
const clean=s=>typeof s==='string'?s:'';

// Only fictional active role grants appear as allowed *simulation* contexts.
// Inactive grants and participation/appointments are presented but have no capabilities.
export function p12QaView(id,contextIdToSelect='') {
  const profile=P12_QA_PROFILES.find(x=>x.id===id);
  if(!profile)return null;
  const accountId='fictional-account-'+id,personId='fictional-person-'+id;
  const grants=profile.grants.map(g=>({...g,accountId,personId,approvedBy:g.status==='proposed'?null:'fictional-reviewer'}));
  const active=listP12TestContexts({accountId,personId,grants});
  const contexts=[
    ...active.map(x=>({
      id:contextId('grant',x.role,x.group),kind:'access',role:x.role,
      label:x.role.replaceAll('_',' '),group:x.group,groupLabel:labelScope(x.group),
      status:'active',capabilities:P12_ACCESS_ROLES[x.role].capabilities.filter(cap=>
        evaluateP12Access({accountId,capability:cap,resourceScope:x.group,grants}).allowed)
    })),
    ...grants.filter(g=>g.status!=='active').map(g=>({
      id:contextId('inactive',g.role,g.group),kind:'inactive',role:g.role,
      label:g.role.replaceAll('_',' '),group:g.group,groupLabel:labelScope(g.group),
      status:g.status,capabilities:[]
    })),
    ...profile.memberships.map(m=>({
      id:contextId('membership',m.type,m.group),kind:'membership',role:m.type,
      label:m.type,group:m.group,groupLabel:labelScope(m.group),
      status:'participation only',capabilities:[]
    })),
    ...profile.duties.map(d=>({
      id:'duty:'+d.role+':'+d.fixtureId,kind:'appointment',role:d.role,
      label:d.role.replaceAll('_',' '),group:scope('fixture',d.fixtureId),
      groupLabel:labelScope(scope('fixture',d.fixtureId)),status:'unverified proposal',capabilities:[]
    }))
  ];
  const selected=contexts.find(c=>c.id===contextIdToSelect)||contexts[0]||null;
  // The object never contains real contact or player records.
  return {
    mode:'SYNTHETIC_ONLY_NO_AUTHORIZATION',
    profileId:profile.id,profileLabel:profile.label,personId,
    contexts,selected,grantCount:active.length,
    relationshipCount:profile.memberships.length,appointmentCount:profile.duties.length,
    note:profile.note,containsRealPeople:false,
    accessIsSimulated:true,mayGrantAccess:false,canPublish:false,saved:false
  };
}
