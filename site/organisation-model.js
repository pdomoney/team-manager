// P03 EXISTING-APP DATA MODEL ONLY.
// These functions DO NOT manage real subscriptions, authenticate people, verify
// official associations, delegate permission or connect multiple data owners.
// All results are synthetic/local planning records, not access-control decisions.
//
// Production subscriptions/tenancy and any optional backend migration are
// explicitly deferred to post-P10 GitHub issue #55. Do not wire this module as
// an authorisation or billing layer in the current GitHub Pages app.
import { teamsOf } from './model.js';
import { normStyle } from './team-style.js';

const asText = v => typeof v === 'string' ? v.trim() : '';
const rows = v => Array.isArray(v) ? v : [];
const kindValid = k => k === 'association' || k === 'club';
const scopeId = (workspaceId, type, id) => JSON.stringify([workspaceId, type, id]);
const publicBrand = c => ({
  // Never infer colours, replace imagery, or download logos from reference data.
  name: asText(c.name),
  shortName: asText(c.shortName),
  sport: asText(c.sport),
  colours: asText(c.colours),
  hasLogo: typeof c.logo === 'string' && c.logo.startsWith('data:image/'),
  style: normStyle(c.style),
  directoryResearchId: asText(c.directoryMatch?.id),
  directoryOnlyResearch: !!c.directoryMatch?.id
});
export const LICENCE_CATEGORIES = Object.freeze(['individual', 'club', 'association']);
export const FEATURE_CATALOG = Object.freeze([
  'clubs', 'teams', 'seasons', 'players', 'volunteers', 'match_day',
  'competitions', 'tactics', 'rules', 'reporting', 'association_summary'
]);
export const OWNER_SCOPE_TYPES = Object.freeze({ individual: 'personal', club: 'club', association: 'association' });

export function proposeOrganisation({ id, type, name, workspaceId } = {}) {
  const key = asText(id), title = asText(name), wid = asText(workspaceId);
  if (!key || !title || !wid || !kindValid(type)) return { error: 'Valid organisation ID, type, name and workspace namespace required' };
  return {
    id: scopeId(wid, type, key), legacyId: key, workspaceId: wid,
    type, name: title, status: 'local-candidate',
    claimedOfficial: false, ownerAccountId: null, accessGrants: [],
    verifiedAffiliations: [], liveTenant: false
  };
}

// A paper relationship with status transitions for future UX planning.
// Both sides must explicitly indicate reviewed approval. A caller can forge
// these fields, therefore confirmedLocalReview is NEVER proof of affiliation.
export function proposeAffiliation({ association, club, proposedBy } = {}) {
  if (!association || !club || association.type !== 'association' || club.type !== 'club' ||
      !asText(association.id) || !asText(club.id) || !asText(proposedBy) ||
      (association.workspaceId && club.workspaceId && association.workspaceId !== club.workspaceId)) {
    return { error: 'Association, club, matching planning workspace and proposer required' };
  }
  return {
    associationId: association.id, clubId: club.id, proposedBy: asText(proposedBy),
    status: 'proposed', associationReviewed: false, clubReviewed: false,
    verifiedOfficial: false, crossTenantAccess: false, accessGrants: []
  };
}

export function reviewAffiliationProposal(proposal, side, accepted) {
  if (!proposal || !['proposed','reviewed'].includes(proposal.status) ||
      !['association','club'].includes(side) || typeof accepted !== 'boolean')
    return { error: 'Review requires a pending proposal, side and explicit response' };
  if (!accepted) return {
    ...proposal, status: 'declined', associationReviewed: side==='association' ? false : proposal.associationReviewed,
    clubReviewed: side==='club' ? false : proposal.clubReviewed,
    verifiedOfficial: false, crossTenantAccess: false, accessGrants: []
  };
  const next = {
    ...proposal, associationReviewed: side==='association' ? true : proposal.associationReviewed===true,
    clubReviewed: side==='club' ? true : proposal.clubReviewed===true,
    verifiedOfficial: false, crossTenantAccess: false, accessGrants: []
  };
  next.status = next.associationReviewed && next.clubReviewed ? 'reviewed' : 'proposed';
  return next;
}

export function closeAffiliationProposal(proposal) {
  if (!proposal || !['proposed','reviewed'].includes(proposal.status))
    return { error: 'Only a pending/reviewed proposal can be closed' };
  return {...proposal, status:'ended', verifiedOfficial:false, crossTenantAccess:false, accessGrants:[]};
}

const validLimit = n => Number.isSafeInteger(n) && n >= 0;
const planFeatures = modules => {
  if (!Array.isArray(modules) || modules.some(x => !FEATURE_CATALOG.includes(x))) return null;
  return [...new Set(modules)].sort();
};
const limitsOf = caps => {
  if (caps === null || caps === undefined) return {};
  if (!caps || typeof caps !== 'object' || Array.isArray(caps)) return null;
  const out = {};
  for (const [k,v] of Object.entries(caps)) {
    if (!['clubs','teams','people'].includes(k) || !validLimit(v)) return null;
    out[k] = v;
  }
  return out;
};

// Licence models are owner-authored test fixtures with explicitly supplied
// modules/limits. There are deliberately no invented real tiers/prices/quotas.
export function proposeLicenceScenario({ category, ownerScope, modules = [], limits = {} } = {}) {
  if (!LICENCE_CATEGORIES.includes(category)) return { error: 'Unknown prototype licence category' };
  const expected = OWNER_SCOPE_TYPES[category];
  if (!ownerScope || ownerScope.type !== expected || !asText(ownerScope.id))
    return { error: 'Licence purchaser ownership scope does not match category' };
  const m = planFeatures(modules), caps = limitsOf(limits);
  if (!m || !caps) return { error: 'Unknown module or invalid prototype limit' };
  return {
    category, purchaserScope: {type:ownerScope.type, id:asText(ownerScope.id)},
    modules:m, limits:caps, status:'scenario-only', billingActive:false,
    productionEntitled:false, dataGrants:[], subscriptionId:null
  };
}

// Demonstrates capacity/display behaviour only. This MUST NEVER prevent users
// retrieving their data or serve as production licence enforcement.
export function previewLicenceFeature(licence, feature, metrics={}) {
  if (!licence || licence.status !== 'scenario-only' ||
      !FEATURE_CATALOG.includes(feature) || !metrics || typeof metrics !== 'object' ||
      Array.isArray(metrics)) return { simulated:false, wouldOffer:false, reason:'invalid-scenario' };
  if (!licence.modules.includes(feature)) return { simulated:true, wouldOffer:false, reason:'module-not-in-scenario' };
  for (const [k,limit] of Object.entries(licence.limits)) {
    if (!validLimit(limit) || !validLimit(metrics[k])) return { simulated:true, wouldOffer:false, reason:'invalid-metric' };
    if (metrics[k] > limit) return { simulated:true, wouldOffer:false, reason:'illustrative-capacity-exceeded' };
  }
  return { simulated:true, wouldOffer:true, reason:'illustrative-feature-present' };
}

// Snapshot ONLY safe club metadata/branding and team IDs from an EXISTING
// trusted coach workspace. It never clones personal/private records or grants
// a real association/club ownership over the current encrypted workspace.
export function describeManagedOrganisations(workspace, sourceWorkspaceId) {
  const wid=asText(sourceWorkspaceId);
  if (!wid || !workspace || typeof workspace !== 'object')
    return { error:'Trusted local workspace and owner-scoped namespace required' };
  const clubs = rows(workspace.clubs), allTeams = teamsOf(workspace);
  const unique = new Set();
  const proposals = [];
  for (const c of clubs) {
    if (!c || !asText(c.id) || unique.has(c.id))
      return { error:'Missing or duplicate managed club ID; manual review required' };
    unique.add(c.id);
    const localTeams = allTeams.filter(t => t.team?.clubId === c.id);
    proposals.push({
      id:scopeId(wid,'club',c.id), legacyId:c.id,
      type:'club', workspaceId:wid, source:'trusted-coach-workspace',
      organisationStatus:'candidate', claimedOfficial:false,
      managedTeams:localTeams.map(t => ({legacyId:t.id, name:asText(t.team?.name),
        sport:asText(t.team?.sport || c.sport), archived:t.archived===true})),
      branding:publicBrand(c), accessGrants:[], independentTenant:false
    });
  }
  const unmatched=allTeams.filter(t => !asText(t.team?.clubId) || !unique.has(t.team.clubId))
    .map(t=>({legacyId:t.id, reason:'no-matching-managed-club'}));
  return {
    workspaceKey:scopeId(wid,'personal-workspace','coach'),
    sourceWorkspaceId:wid, status:'local-planning-preview', ownsSourceData:false,
    proposedClubs:proposals, unassignedTeams:unmatched,
    independentClubAccounts:[], associationClaims:[], sharedPrivateData:[],
    crossTenantAccess:false, licence: null
  };
}

// Association dashboard preview may use ONLY pre-aggregated, fictional counts;
// it accepts no rosters, email, contact, child data, club-owned files or health.
export function previewAssociationSummary({ affiliationRecords=[], aggregatedClubs=[] }={}) {
  if (!Array.isArray(affiliationRecords) || !Array.isArray(aggregatedClubs)) return { error:'Invalid synthetic summary' };
  const reviewed = new Set(affiliationRecords.filter(x=>x?.status==='reviewed')
    .map(x=>x.clubId).filter(Boolean));
  let teams=0, clubs=0;
  const counted = new Set();
  for(const c of aggregatedClubs) {
    if (!c || typeof c !== 'object' || !reviewed.has(c.clubId) ||
        !validLimit(c.teamCount) || counted.has(c.clubId) ||
        Object.keys(c).some(k=>!['clubId','teamCount'].includes(k)))
      return { error:'Only reviewed affiliations with non-sensitive, pre-aggregated counts are allowed' };
    counted.add(c.clubId);clubs++;teams+=c.teamCount;
  }
  return { synthetic:true, reviewedClubCount:clubs, teamCount:teams,
    includesPersonalData:false, grantsPrivateDataAccess:false };
}
