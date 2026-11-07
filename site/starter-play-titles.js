// Renamed Oztag starters retain the IDs, paths and custom user content.
// Only built-in records with their exact old default titles are renamed;
// independently copied/edited library entries are never rewritten.
export const STARTER_PLAY_TITLES = Object.freeze({
  'quickie-in':Object.freeze({previous:'Quickie In',current:'Step In'}),
  'quickie-out':Object.freeze({previous:'Quickie Out',current:'Step Out'})
});
export function canonicalStarterPlayName(play){
  if(!play || play.builtin!==true)return play;
  const entry=STARTER_PLAY_TITLES[play.id];
  if(!entry || play.name!==entry.previous)return play;
  return {...play,name:entry.current};
}
