// Pure helpers for the coach's optional teaching annotations.
// Actions are stored on each phase as "study", beside the original drawing.
// They never alter geometry or the old play.steps narrative.
export const teachingPhase = (play, at = 0) => at === 0 ? play : (play.phases || [])[at - 1] || null;
export const teachingSteps = (play, at = 0) => {
  const phase = teachingPhase(play, at);
  return phase && Array.isArray(phase.study) ? phase.study : [];
};

export function addTeachingStep(play, phaseIndex = 0) {
  const phase = teachingPhase(play, phaseIndex);
  if (!phase) return -1;
  phase.study = [...teachingSteps(play, phaseIndex), {
    title: `Action ${teachingSteps(play, phaseIndex).length + 1}`, text: '', moves: [], roles: []
  }];
  return phase.study.length - 1;
}

export function removeTeachingStep(play, phaseIndex, at) {
  const ph = teachingPhase(play, phaseIndex), list = teachingSteps(play, phaseIndex);
  if (!ph || !Number.isInteger(at) || at < 0 || at >= list.length) return false;
  ph.study = list.filter((_, i) => i !== at);
  return true;
}

export function moveTeachingStep(play, phaseIndex, at, delta) {
  const ph = teachingPhase(play, phaseIndex), list = teachingSteps(play, phaseIndex);
  const to = at + delta;
  if (!ph || !Number.isInteger(at) || !Number.isInteger(delta) || at < 0 || to < 0 || to >= list.length) return false;
  ph.study = list.slice();
  [ph.study[at], ph.study[to]] = [ph.study[to], ph.study[at]];
  return true;
}

export function seedTeachingFromLegacy(play, existingSteps = []) {
  const phases = [play, ...(Array.isArray(play.phases) ? play.phases : [])];
  let created = 0;
  phases.forEach((ph, i) => {
    if (Array.isArray(ph.study) && ph.study.length) return;
    const descriptions = phases.length === 1
      ? existingSteps.map(t => String(t).trim()).filter(Boolean)
      : [String(ph.title || `Phase ${i + 1}`).trim()];
    ph.study = descriptions.map((t, j) => ({
      title: `Action ${j + 1}`, text: t, moves: [], roles: []
    }));
    created += ph.study.length;
  });
  return created;
}

// Called whenever the coach removes a drawn line: mapped cue indices remain
// aligned to surviving movements, and a deleted movement is no longer referenced.
export function removeMovementLinks(phase, deletedIndex) {
  if (!phase || !Array.isArray(phase.study)) return;
  phase.study.forEach(c => {
    c.moves = (Array.isArray(c.moves) ? c.moves : [])
      .filter(x => Number.isInteger(x) && x !== deletedIndex)
      .map(x => x > deletedIndex ? x - 1 : x);
  });
}
