// Renamed Oztag starters retain their stable IDs, saved geometry and author edits.
// A copied/non-builtin play or a manually renamed title is never overwritten.
export const STARTER_PLAY_TITLES = Object.freeze({
  'quickie-in':Object.freeze({previous:'Quickie In',current:'Step In'}),
  'quickie-out':Object.freeze({previous:'Quickie Out',current:'Step Out'})
});
export function canonicalStarterPlayName(play){
  if(!play || play.builtin!==true)return play;
  const entry=STARTER_PLAY_TITLES[play.id];
  if(!entry)return play;
  const rename=play.name===entry.previous;
  // Non-edited legacy Step In instructions refer to Step Out by its old name.
  // Preserve edited coach text, study cues, drawings and all other fields.
  const legacyWords=play.id==='quickie-in' && !play.edited;
  const changes={};
  if(rename)changes.name=entry.current;
  if(legacyWords){
    for(const key of ['when','headline','steps']){
      const v=play[key];
      if(typeof v==='string' && v.includes('Quickie Out'))
        changes[key]=v.replaceAll('Quickie Out','Step Out');
    }
  }
  return Object.keys(changes).length?{...play,...changes}:play;
}
