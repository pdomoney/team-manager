// P13C: test-runner interface for FUTURE real server/database adapters.
// This module is Node-only, unused in the GitHub Pages app. It does not make
// authorization decisions and does not grant any access. An adapter must make
// real requests to a separately approved isolated server to supply evidence.
// MOCK SELF-TEST RESULTS ARE NEVER ACCEPTANCE EVIDENCE.
export const P13_DECISIONS=Object.freeze([
  'DENY','ALLOW-LIMITED','REVIEW','ATOMIC-ONE','ONE-TIME','MANUAL-RISK'
]);
const check=(valid,message,failures)=>{if(!valid)failures.push(message);};
const isStr=value=>typeof value==='string'&&value.trim().length>0;

export function validateP13Manifest(manifest){
  const errors=[];
  check(manifest?.format==='p13-security-contract-vectors','Unknown contract format',errors);
  check(manifest?.schemaVersion===1,'Unexpected contract revision',errors);
  check(manifest?.environment==='NO_BACKEND','Manifest must never claim live backend',errors);
  check(Array.isArray(manifest?.vectors)&&manifest.vectors.length===60,
    'Contract must contain exactly 60 cases',errors);
  const ids=new Set(),types=new Set(P13_DECISIONS);
  for(const [i,v] of (manifest?.vectors||[]).entries()){
    const expected='ID-'+String(i+1).padStart(3,'0');
    check(v?.id===expected,'Out-of-order/missing contract case '+expected,errors);
    check(!ids.has(v?.id),'Duplicate contract ID '+v?.id,errors);ids.add(v?.id);
    check(isStr(v?.category)&&isStr(v?.attempt)&&isStr(v?.expected),
      'Incomplete contract case '+expected,errors);
    check(types.has(v?.expectedOutcome),'Unrecognised outcome '+expected,errors);
    check(v?.state==='UNTESTED','Fixture is not evidence of tested security: '+expected,errors);
    check(v?.requiresServerEvidence===(v?.id!=='ID-060'),
      'Incorrect server evidence classification '+expected,errors);
    check(v?.requiresAudit===(v?.id==='ID-029'||v?.id==='ID-030'),
      'Incorrect mandatory audit classification '+expected,errors);
  }
  check(manifest?.vectors?.[33]?.expectedOutcome==='ATOMIC-ONE',
    'Approval race must be atomic',errors);
  check(manifest?.vectors?.[35]?.expectedOutcome==='ONE-TIME',
    'Invite replay must be single-use',errors);
  check(manifest?.vectors?.[59]?.expectedOutcome==='MANUAL-RISK',
    'Historical GitHub exposure requires explicit human decision',errors);
  return {ok:errors.length===0,errors};
}

// Evidence schema is deliberately restrictive. Absence of evidence is a
// failure, not implied DENY. "Allowed" needs a positive exact-scope claim.
// Callers must examine raw backend request logs and assertions independently.
export function validateP13Evidence(vector,evidence){
  const errors=[];
  if(!vector||!P13_DECISIONS.includes(vector.expectedOutcome))
    return {ok:false,errors:['Unknown vector']};
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))
    return {ok:false,errors:['No external test evidence provided']};
  check(evidence.decision===vector.expectedOutcome,
    'Expected '+vector.expectedOutcome+', received '+String(evidence.decision),errors);
  const zero=keys=>{for(const key of keys)
    check(evidence[key]===0, key+' must be measured zero',errors);
  };
  if(vector.expectedOutcome==='DENY'){
    zero(['privateRecordsReturned','sensitiveFieldsReturned','unapprovedMutations','grantsCreated']);
    check(evidence.existenceLeaked===false,'Forbidden record existence leaked or not measured',errors);
    if(vector.requiresAudit)
      check(evidence.denialAuditRecorded===true,'Required denial audit not verified',errors);
  }else if(vector.expectedOutcome==='ALLOW-LIMITED'){
    zero(['foreignRecordsReturned','unpermittedFieldsReturned','unauthorizedMutations']);
    check(evidence.exactScopeVerified===true,'No verified exact scoped authorization',errors);
    check(evidence.projectionVerified===true,'Allowed projection was not verified',errors);
  }else if(vector.expectedOutcome==='REVIEW'){
    zero(['grantsCreated','unapprovedMutations']);
    check(evidence.productionRoleActivated===false,'Review activated a permanent role',errors);
    check(evidence.matchEligibilityCertified===false,'Proposal certified match eligibility',errors);
    check(evidence.reviewStatus==='pending','Proposal is not a pending review',errors);
    if(vector.id==='ID-031')
      check(evidence.activationRequiresServerCommit===true,
        'Review does not prove server-controlled acceptance',errors);
  }else if(vector.expectedOutcome==='ATOMIC-ONE'){
    check(evidence.validTransitions===1,'Approval/revoke race did not produce one valid transition',errors);
    check(evidence.duplicateGrants===0,'Approval/revoke race duplicated a grant',errors);
    check(evidence.atomicityVerified===true,'Transaction atomicity was not confirmed',errors);
  }else if(vector.expectedOutcome==='ONE-TIME'){
    check(evidence.validRedemptions===1,'Valid invitation redemption count must be exactly one',errors);
    check(evidence.replayRedemptions===0,'Invitation replay succeeded or was not checked',errors);
    check(evidence.singleUseServerEnforced===true,'One-time token enforcement not confirmed',errors);
  }else if(vector.expectedOutcome==='MANUAL-RISK'){
    check(evidence.retrospectiveRevocationClaimed===false,
      'Cannot claim old GitHub ciphertext was retroactively revoked',errors);
    check(evidence.historicalRiskAcknowledged===true,
      'Historical encrypted blob risk not acknowledged',errors);
    check(isStr(evidence.migrationRiskDecisionRef),
      'Missing separately approved migration/historic-risk record',errors);
  }
  return {ok:errors.length===0,errors};
}

// This reporter cannot prove the environment itself is trusted. Independent
// review of the adapter implementation and actual DB/API logs is mandatory.
// A mock run always has serverEvidenceQualified=false.
export async function runP13Contract(adapter,manifest,{requireServer=true}={}){
  const valid=validateP13Manifest(manifest);
  if(!valid.ok)throw new Error('Invalid P13 contract: '+valid.errors.join('; '));
  if(typeof adapter?.execute!=='function'||typeof adapter?.prepare!=='function'||
    typeof adapter?.cleanup!=='function')throw new Error('No configured test adapter');
  const environment=adapter.environment;
  if(!environment||!['mock','isolated-server'].includes(environment.kind))
    throw new Error('Unknown test environment');
  if(requireServer&&environment.kind!=='isolated-server')
    throw new Error('Mock results cannot qualify real server permissions');
  if(requireServer&&(!isStr(environment.project)||!isStr(environment.commit)||
    !isStr(environment.region)||!isStr(environment.provider)))
    throw new Error('Missing isolated server provenance');
  const results=[];
  for(const vector of manifest.vectors){
    if(vector.expectedOutcome==='MANUAL-RISK'){
      results.push({id:vector.id,status:'REQUIRES-MANUAL-REVIEW',
        reason:'Historical encrypted Git blobs cannot be retroactively revoked'});
      continue;
    }
    let prepared=false;
    try{
      await adapter.prepare(vector);
      prepared=true;
      const evidence=await adapter.execute(vector);
      const validation=validateP13Evidence(vector,evidence);
      results.push({id:vector.id,status:validation.ok?'PASS':'FAIL',errors:validation.errors});
    }catch(error){
      results.push({id:vector.id,status:'FAIL',errors:[String(error?.message||error)]});
    }finally{
      if(prepared)try{
        await adapter.cleanup(vector);
      }catch(error){
        const last=results[results.length-1];
        if(last?.id===vector.id){
          last.status='FAIL';
          last.errors=[...(last.errors||[]),'Cleanup failed: '+String(error?.message||error)];
        }
      }
    }
  }
  const pass=results.filter(x=>x.status==='PASS').length;
  const fail=results.filter(x=>x.status==='FAIL').length;
  return {
    environment:environment.kind,provider:environment.provider||null,
    casesTotal:60,automatable:59,manualRiskCases:1,
    pass,fail,unrun:59-pass-fail,
    results,serverEvidenceQualified:environment.kind==='isolated-server'&&
      requireServer&&pass===59&&fail===0,
    // Independent review of adapter, logs, privacy and ID-060 is still needed.
    securityAccepted:false,productionApproval:false
  };
}
