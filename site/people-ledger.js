// P04: opt-in person link *review ledger* for the existing encrypted coach
// workspace. This is local provenance only, NOT a canonical Person table,
// identity provider, guardian authority, login or cross-tenant permission.
//
// Schema-4 compatibility: peopleReviews is optional and normalises to [].
// The caller must already be the trusted coach operating in an unlocked
// workspace. This model cannot authenticate its caller or grant access.
const word = v => typeof v === 'string' ? v.trim() : '';
const rows = v => Array.isArray(v) ? v : [];
const own = (x,k) => Object.prototype.hasOwnProperty.call(x,k);
const DURABLE_KINDS = new Set(['player','helper','match-official']);
const key = (...parts) => JSON.stringify(parts);
// Match a stable legacy record by its exact local IDs before recording the
// review. The separate advisor index must not be allowed to go stale between
// review and save (or refer to a record that another device has removed).
const currentSourcePersonKey = (ws, namespace, ref) => {
  if (!parseRef(ref,namespace) || !ws || typeof ws!=='object') return null;
  const [,kind,...parts]=JSON.parse(ref);
  if(kind==='match-official'){
    const matches=rows(ws.matchOfficials).filter(p=>p?.id===parts[0]);
    return matches.length===1 ? key(namespace,'provisional-person',kind,parts[0]) : null;
  }
  const teams=[ws,...rows(ws.teams)].filter(t=>t?.id===parts[0]);
  if(teams.length!==1) return null;
  const t=teams[0], list=rows(kind==='player'?t.players:t.helpers);
  const matches=list.filter(p=>p?.id===parts[1]);
  if(matches.length!==1) return null;
  const p=matches[0];
  return kind==='player' && word(p.personId)
    ? key(namespace,'existing-explicit-player-personId',p.personId)
    : key(namespace,'provisional-person',kind,parts[0],parts[1]);
};
const iso = v => typeof v === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) ? v : '';
const parseRef = (ref,namespace) => {
  try {
    const r=JSON.parse(ref);
    if (!Array.isArray(r) || r.length < 3 || r[0]!==namespace ||
      !DURABLE_KINDS.has(r[1]) || !r.slice(2).every(x=>word(x)))
      return false;
    if (r[1]==='match-official') return r.length===3;
    return r.length===4;
  } catch { return false; }
};
const cleanLedgerRecord = x => {
  if (!x || typeof x!=='object' || Array.isArray(x)) return null;
  const id=word(x.id),namespace=word(x.namespace),
    refs=rows(x.sourceRefs), prior=rows(x.priorPersonKeys);
  if (!id || id.length>8192 || !namespace || namespace.length>160 ||
      !['reviewed','reversed'].includes(x.status) ||
      refs.length!==2 || !refs.every(z=>typeof z==='string' && z.length<=4096 && parseRef(z,namespace)) ||
      refs[0]===refs[1] || refs[0]>refs[1] ||
      id!==key('local-person-link',namespace,...refs) ||
      prior.length!==2 || !prior.every(z=>word(z)&&typeof z==='string'&&z.length<=4096) ||
      prior[0]===prior[1] || !word(x.reviewedBy) || !iso(x.reviewedAt) ||
      (x.status==='reversed' && (!word(x.reversedBy)||!iso(x.reversedAt) ||
         Date.parse(x.reversedAt)<Date.parse(x.reviewedAt))))
    return null;
  return {
    id,namespace,sourceRefs:refs.slice(),priorPersonKeys:prior.slice(),
    reviewedBy:word(x.reviewedBy).slice(0,120), reviewedAt:x.reviewedAt,
    status:x.status,
    ...(x.status==='reversed'? {reversedBy:word(x.reversedBy).slice(0,120),
      reversedAt:x.reversedAt}:{}),
    // No guardian/official verification, contact, name, account or grant fields.
    verifiedIdentity:false, changedSourceRecords:false, accessGrants:[]
  };
};

export function normalizePersonReviews(value) {
  const out=[],seen=new Set();
  for(const raw of rows(value)) {
    const record=cleanLedgerRecord(raw);
    if(!record || seen.has(record.id)) continue; // reject malformed, duplicate, unknown status
    seen.add(record.id);
    out.push(record);
  }
  return out.sort((a,b)=>a.id.localeCompare(b.id));
}

// Accept a previously explicit, local human review from people-index.js, only
// while both source record identity keys still match its earlier capture.
// Snapshot rows with unstable array indices are intentionally rejected until
// they have dedicated persistent IDs in a follow-up PR.
export function appendReviewedPersonLink(workspace,index,reviewed,{reviewedAt}={}) {
  if (!workspace || !index || !reviewed || reviewed.status!=='locally-reviewed-link-only' ||
      reviewed.namespace!==index.namespace || !word(reviewed.reviewedBy) || !iso(reviewedAt))
    return {error:'Valid explicit local review, source index and timestamp required'};
  const refs=rows(reviewed.sourceRefs),peopleKeys=rows(reviewed.priorPersonKeys);
  if(refs.length!==2||peopleKeys.length!==2||
      refs.some(ref=>!parseRef(ref,index.namespace))) {
    return {error:'Only stable player/helper/match-official references can be saved'};
  }
  const current=refs.map(r=>rows(index.references).find(x=>x.sourceRef===r));
  if(current.some(x=>!x)||current.some((x,i)=>x.personKey!==peopleKeys[i]) ||
      refs.some((ref,i)=>currentSourcePersonKey(workspace,index.namespace,ref)!==peopleKeys[i]))
    return {error:'Workspace source records or original person IDs changed; review again'};
  if(current[0].personKey===current[1].personKey)
    return {error:'Records already share an explicit local person'};
  const record=cleanLedgerRecord({
    id:reviewed.id,namespace:index.namespace,sourceRefs:refs,
    priorPersonKeys:peopleKeys,reviewedBy:reviewed.reviewedBy,
    reviewedAt,status:'reviewed'
  });
  if(!record) return {error:'Invalid review entry'};
  const ledger=normalizePersonReviews(workspace.peopleReviews);
  if(ledger.some(x=>x.id===record.id)) return {error:'Already reviewed; do not duplicate or silently reactivate'};
  return {
    workspace:{...workspace,peopleReviews:normalizePersonReviews([...ledger,record])},
    record, changedSourceRecords:false
  };
}

// Reversal leaves a tombstone for history and three-way conflict detection.
export function reverseReviewedPersonLink(workspace,id,{reversedBy,reversedAt}={}) {
  const ledger=normalizePersonReviews(workspace?.peopleReviews),
    current=ledger.find(x=>x.id===id);
  if(!current||current.status!=='reviewed'||!word(reversedBy)||!iso(reversedAt))
    return {error:'A recorded, active review and identified reviewer/time are required'};
  const next=cleanLedgerRecord({...current,status:'reversed',reversedBy,reversedAt});
  if(!next) return {error:'Invalid reversal timestamp or record'};
  return {
    workspace:{...workspace,peopleReviews:normalizePersonReviews(
      ledger.map(x=>x.id===id?next:x))},
    record:next,changedSourceRecords:false
  };
}

// A reviewed link is *advisory*, not permission, global verification or
// automatic mutation of the existing player personId or staff references.
export function describeLocalReviews(workspace) {
  const ledger=normalizePersonReviews(workspace?.peopleReviews);
  return {reviewed:ledger.filter(x=>x.status==='reviewed').length,
    reversed:ledger.filter(x=>x.status==='reversed').length,
    hasAnyRealAccessGrant:false,hasAnyVerifiedGuardian:false,
    sourceRecordsModified:false};
}
