// #62 Stage C: fictional, read-only QA acceptance workbench, not actual role security.
// No access to workspace, person records, browser storage, tokens or network.
import {qaPreview} from './p11-qa-personas.js';
import {qaJourneys} from './p11-qa-journeys.js';
const freeze=Object.freeze;
const shared=freeze([
  freeze({id:'scope',title:'Confirm simulated scope',expected:'Only fictional entities inside the selected scope are visible.'}),
  freeze({id:'switch',title:'Switch persona and context',expected:'The view resets to the new fictional scope without real data or permissions.'}),
  freeze({id:'forged',title:'Reject unsafe actions',expected:'Forged coach actions, cross-scope IDs and unsupported roles cannot modify the real workspace.'}),
  freeze({id:'device',title:'Real Safari, VoiceOver and touch review',expected:'Owner records actual device, Safari version and result separately; Chromium is not physical Safari evidence.'})
]);
export function qaAcceptanceBoard(role,scope){
  const preview=qaPreview(role,scope);
  if(!preview||(scope&&preview.scope!==scope))return null;
  const journeys=qaJourneys(preview.role,preview.scope);
  return freeze({
    schemaVersion:1,role:preview.role,roleLabel:preview.roleLabel,
    scope:preview.scope,scopeLabel:preview.scopeLabel,
    mode:'SYNTHETIC_ONLY_NO_AUTHORIZATION',
    cases:freeze([
      ...journeys.map(j=>freeze({
        id:'journey-'+j.id,title:j.title,
        expected:'The '+j.scopeLabel+' fictional walkthrough shows only the selected scope; no workspace changes.'
      })),
      ...shared
    ]),
    requiresRealSafari:true,actualDeviceResults:freeze([]),completed:0,
    sourceData:'fixed fictional preview definitions',
    mayGrantAccess:false,canPublish:false,saved:false,containsRealPeople:false
  });
}
export function qaAcceptanceText(board){
  if(!board||board.mode!=='SYNTHETIC_ONLY_NO_AUTHORIZATION'||
      !Array.isArray(board.cases)||!board.cases.length)return '';
  return [
    'TEAM MANAGER — SYNTHETIC QA ACCEPTANCE CHECKLIST',
    'Not a credential, authenticated role grant, release approval or Safari test result.',
    'Persona: '+board.roleLabel,'Fictional context: '+board.scopeLabel,
    'All checks: NOT RUN ON PHYSICAL DEVICE',
    ...board.cases.flatMap((c,i)=>[
      (i+1)+'. [ ] '+c.title,
      '   Expected: '+c.expected,
      '   Actual device/version, result and evidence: [HUMAN TO RECORD]'
    ]),
    'Owner acceptance: PENDING. No account, real workspace or publication changes.'
  ].join('\n');
}
