// E5.3.3b: display choices from the actual play diagram, without guessing
// actor continuity from slot labels, player names or positions.
const validSlot = key => /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$/.test(key);
export function diagramMappingChoices(play) {
  if (!play || typeof play !== 'object') return [];
  const phases = [play, ...(Array.isArray(play.phases) ? play.phases : [])];
  return phases.map((phase, phaseIndex) => {
    const players = phase?.players && typeof phase.players === 'object' &&
      !Array.isArray(phase.players) ? phase.players : {};
    const slots = Object.keys(players).filter(validSlot).sort();
    return Object.freeze({ phaseIndex, slots: Object.freeze(slots) });
  });
}
