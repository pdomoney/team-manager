// P08B: local-only library provenance and deliberate copy-review guidance.
// Neither scope labels nor imported origin metadata grant cross-club or tenant access.
// They identify sport/context so a coach can make an informed local copy decision.
import { teamSport, clubOf } from './model.js';
const word = x => typeof x === 'string' ? x.trim() : '';
const freeze = x => Object.freeze(x);
export const LIBRARY_SCOPE = 'coach-workspace';

export function localLibraryOrigin(ws, team) {
  return freeze({
    scope: LIBRARY_SCOPE,
    teamId: word(team?.id),
    clubId: word(team?.team?.clubId),
    sport: teamSport(team?.team, clubOf(ws,team))
  });
}

// Imported or pre-P08B library files may have no provenance. Do not claim those
// are from this club, or assume all team-copy decisions are authorised.
export function libraryOrigin(item) {
  const o=item?.libraryOrigin;
  const valid=o && typeof o==='object' && !Array.isArray(o) &&
    o.scope===LIBRARY_SCOPE && word(o.sport) && word(o.clubId) && word(o.teamId);
  return valid ? freeze({scope:LIBRARY_SCOPE,sport:word(o.sport),
    clubId:word(o.clubId),teamId:word(o.teamId)}) : null;
}
export function libraryCopyReview(ws, item, team) {
  const origin=libraryOrigin(item), target=localLibraryOrigin(ws,team);
  const unknown=!origin;
  const sameSport=!unknown && origin.sport===target.sport;
  const sameClub=!unknown && origin.clubId===target.clubId;
  const result=unknown?'unknown-provenance'
    : !sameSport?'different-sport'
    : !sameClub?'different-club'
    : 'same-context';
  return freeze({
    result,sourceSport:origin?.sport||'Not recorded',
    targetSport:target.sport,
    sourceClubId:origin?.clubId||'',
    targetClubId:target.clubId,
    // Only an exact match can be copied automatically when a new team is created.
    automaticCopy:result==='same-context',
    requiresExplicitReview:result!=='same-context',
    // All copying remains within a SINGLE locally trusted encrypted workspace.
    scope:LIBRARY_SCOPE,authorisedExternalShare:false
  });
}
