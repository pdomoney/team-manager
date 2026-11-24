// Exact-team read projection into the ORIGINAL model.js data shape.
//
// This is intentionally not a fake full "workspace": the connected Supabase
// server is authoritative for identities, grants, registrations and mutations.
// The projection carries only fields individually returned by exact-team reads.
// Never merge two teams by name, infer a verified person link from a label, or
// manufacture official competition/fixture status.
import * as M from './model.js';
const ID=/^[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const list=x=>Array.isArray(x)?x:[];
const plain=x=>typeof x==='string'?x:'';
const day=x=>typeof x==='string'?x.slice(0,10):'';
function scopedRows(rows,teamId,label){
 if(!Array.isArray(rows)||rows.length>5000)throw new TypeError('invalid-'+label);
 for(const item of rows)
   if(!obj(item)||(item.teamId!==undefined&&item.teamId!==teamId))
     throw new TypeError('cross-team-or-invalid-'+label);
 return rows;
}
export function projectCloudTeamToOriginalModel({
 context,members=[],jerseys=[],competitions=[],sessions=[]
}={}){
 const teamId=context?.teamId,season=plain(context?.season);
 if(!ID.test(teamId||'')||!/^20\d{2}$/.test(season)||!context?.club)
   throw new TypeError('invalid-team-context');
 members=scopedRows(members,teamId,'members');
 jerseys=scopedRows(jerseys,teamId,'jerseys');
 competitions=scopedRows(competitions,teamId,'competitions');
 sessions=scopedRows(sessions,teamId,'sessions');
 const playerById=new Map();
 for(const m of members){
  if(!ID.test(m.personId||'')||playerById.has(m.personId))
    throw new TypeError('ambiguous-person');
  // A verified display name is a display string, not authentication evidence.
  // Do not expose private profile metadata or infer a cross-team identity.
  playerById.set(m.personId,{id:m.personId,
   name:plain(m.name).slice(0,120),status:m.status==='active'?'available':'inactive',
   number:'',positions:[],jerseys:[],jerseyCorrections:[]});
 }
 const seenIssues=new Set(),omitted=[];
 for(const issue of jerseys){
  if(!ID.test(issue.personId||'')||typeof issue.issueId!=='string'||
    !/^\d{1,3}$/.test(plain(issue.jerseyNo))||seenIssues.has(issue.issueId))
    throw new TypeError('ambiguous-jersey-issue');
  seenIssues.add(issue.issueId);
  const p=playerById.get(issue.personId);
  if(!p){omitted.push({kind:'unlinked-jersey',issueId:issue.issueId});continue;}
  const issueSeason=plain(issue.season);
  p.jerseys.push({id:issue.issueId,number:issue.jerseyNo,
   seasonId:issueSeason,out:day(issue.issuedAt),back:day(issue.returnedAt)});
  if(!issue.returnedAt&&issueSeason===season)p.number=issue.jerseyNo;
 }
 const players=[...playerById.values()];
 const active=players.filter(p=>p.status==='available');
 const seasonRecord={id:season,name:season,year:season,status:'active',
  squad:active.map(p=>({playerId:p.id,number:p.number,positions:[],status:'available'})),
  staff:[],defaults:{},createdAt:''};
 const result={
  id:teamId,team:{name:plain(context.teamName)||plain(context.club),
    season,clubId:teamId,jerseyLoan:false},
  seasons:[seasonRecord],players,
  sessions:sessions.map(s=>{
    if(!ID.test(s.sessionId||'')||typeof s.startsAt!=='string'||
      !Number.isFinite(new Date(s.startsAt).getTime()))throw new TypeError('invalid-session');
    const start=new Date(s.startsAt);
    const isoDate=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',
      year:'numeric',month:'2-digit',day:'2-digit'}).format(start)
      .split('/').reverse().join('-');
    return {id:s.sessionId,date:isoDate,kind:s.kind,seasonId:season,
      cancelled:s.status==='cancelled',venue:plain(s.locationLabel),
      // No assumed RSVP, attendance, time zone or participant record.
      rsvps:[],roll:[]};
  }),
  matches:[],tasks:[],messages:[],notices:[],lineups:[]
 };
 const sourceComps=competitions.map(c=>{
  if(typeof c.competitionId!=='string'||!c.name||!c.format)
    throw new TypeError('invalid-competition');
  return M.normComp({
   id:c.competitionId,name:plain(c.name),sport:plain(context.sport),
   format:c.format==='friendly-series'?'other':c.format,
   edition:plain(c.season)||season,start:plain(c.beginsOn),
   end:plain(c.endsOn),venue:plain(c.venue),organiser:plain(c.organiser),
   status:c.status==='completed'?'completed':'planned',bylaws:[],
   // Planning a tournament is NOT the same as entering it.
   entries:c.status==='planned'?[]:[{id:'team-entry:'+c.competitionId,
     teamId,seasonId:season,division:plain(c.division),pool:'',
     status:c.status==='withdrawn'?'withdrawn':'entered'}]
  });
 });
 const workspace={...result,clubs:[],competitions:sourceComps,teams:[],
   library:{plays:[],systems:{},playerSets:[]}};
 return Object.freeze({team:Object.freeze(result),workspace:Object.freeze(workspace),
  complete:omitted.length===0,omissions:Object.freeze(omitted)});
}
export function originalJerseyReportFromCloud(input){
 const {team,complete,omissions}=projectCloudTeamToOriginalModel(input);
 const active=new Set(input.members.filter(p=>p.status==='active').map(p=>p.personId));
 const calculated=M.jerseyReport(team,input.context.season);
 // Original model treats an unseasoned person as active by default. Unlike
 // the encrypted workspace, Supabase supplies an EXPLICIT participation state.
 const rows=calculated.rows.map(p=>({...p,inSquad:active.has(p.id)}));
 return {...calculated,rows,gone:rows.filter(p=>!p.inSquad&&p.status==='out').length,
   complete,omissions};
}
export function originalJerseyInventoryFromCloud(input){
 const {team,complete,omissions}=projectCloudTeamToOriginalModel(input);
 const active=new Set(input.members.filter(p=>p.status==='active').map(p=>p.personId));
 const calculated=M.jerseyInventory(team);
 const rows=calculated.rows.map(p=>({...p,inSquad:active.has(p.id)}));
 return {...calculated,rows,formerPlayers:rows.filter(p=>!p.inSquad).length,
   complete,omissions};
}
export function originalTeamCompetitionsFromCloud(input){
 const {team,workspace}=projectCloudTeamToOriginalModel(input);
 return M.compsForPlayers(workspace,team);
}

/**
 * View team-recorded matches from the same exact-team schedule already used
 * by Players and Coaches. These records are never promoted to the official
 * competition draw and are not automatically linked by a similar name/date.
 */
export function teamRecordedMatchesFromSchedule({context,sessions}={}){
 const teamId=context?.teamId;
 if(!ID.test(teamId||''))throw new TypeError('invalid-team-context');
 const rows=scopedRows(sessions,teamId,'sessions');
 return Object.freeze(rows.filter(s=>s?.kind==='match'&&
   ID.test(s.sessionId||'')&&
   typeof s.startsAt==='string'&&Number.isFinite(new Date(s.startsAt).getTime()))
   .map(s=>Object.freeze({
     sessionId:s.sessionId,
     title:plain(s.title).trim()||'Team match',
     startsAt:s.startsAt,
     status:plain(s.status)||'unknown',
     locationLabel:plain(s.locationLabel),
     // Event-origin is authoritative, not the absence of a provider ID.
     source:['team-friendly','team-activity'].includes(s.managementOrigin)?'team-recorded':'unverified',
     competitionId:null,official:false
   })).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt)||a.sessionId.localeCompare(b.sessionId)));
}

/** Join only exact-team member display names to the authoritative register.
 * Never drop unnamed register rows or infer identity from matching names.
 */
export function namedTrainingRegister({context,rows,members}={}){
 const teamId=context?.teamId;
 if(!ID.test(teamId||''))throw new TypeError('invalid-team-context');
 const records=scopedRows(rows,teamId,'register'), people=scopedRows(members,teamId,'members');
 const byId=new Map(), seen=new Set();
 for(const p of people){
  if(!ID.test(p.personId||''))throw new TypeError('invalid-person');
  const name=plain(p.name).trim();
  if(byId.has(p.personId))byId.set(p.personId,'');
  else byId.set(p.personId,p.status==='active'?name:'');
 }
 let unnamed=0;
 const named=records.map(p=>{
  if(!ID.test(p.personId||'')||seen.has(p.personId))throw new TypeError('ambiguous-register');
  seen.add(p.personId);
  const name=byId.get(p.personId)||'';
  if(!name)unnamed++;
  return {...p,displayName:name||'Player reference '+p.personId};
 });
 return {rows:named,eligible:records.length,shown:named.length,unnamed};
}
